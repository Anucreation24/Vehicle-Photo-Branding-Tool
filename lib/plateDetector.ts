import * as ort from 'onnxruntime-web';
import { Point } from '../types';

export interface DetectionResult {
  id: string;
  x: number; // original image coordinates
  y: number;
  width: number;
  height: number;
  confidence: number;
  className: string;
}

// Cache the ONNX inference session
let sessionCache: ort.InferenceSession | null = null;

/**
 * Validates whether the ONNX model file exists on the server.
 */
export async function checkModelExists(): Promise<boolean> {
  try {
    const response = await fetch('/models/license-plate-detector.onnx', { method: 'HEAD' });
    return response.ok;
  } catch (e) {
    console.warn('Failed to verify model existence:', e);
    return false;
  }
}

/**
 * Initializes and loads the ONNX runtime session for the plate detector.
 */
export async function getDetectorSession(
  onProgress: (status: string) => void
): Promise<ort.InferenceSession> {
  if (sessionCache) return sessionCache;

  onProgress('Loading detector...');

  // Configure WASM paths to use fast jsdelivr CDN
  ort.env.wasm.wasmPaths = 'https://cdn.jsdelivr.net/npm/onnxruntime-web@1.20.1/dist/';
  ort.env.wasm.numThreads = 1; // Thread safety for older mobile browsers

  try {
    const session = await ort.InferenceSession.create('/models/license-plate-detector.onnx', {
      executionProviders: ['wasm'], // Default browser execution provider
    });
    sessionCache = session;
    return session;
  } catch (err) {
    console.error('Failed to load ONNX session:', err);
    throw new Error('License plate detector model could not be initialized.');
  }
}

/**
 * Calculates the Intersection over Union (IoU) of two bounding boxes.
 */
function calculateIoU(box1: any, box2: any): number {
  const x1 = Math.max(box1.x1, box2.x1);
  const y1 = Math.max(box1.y1, box2.y1);
  const x2 = Math.min(box1.x2, box2.x2);
  const y2 = Math.min(box1.y2, box2.y2);

  const intersection = Math.max(0, x2 - x1) * Math.max(0, y2 - y1);
  const box1Area = (box1.x2 - box1.x1) * (box1.y2 - box1.y1);
  const box2Area = (box2.x2 - box2.x1) * (box2.y2 - box2.y1);

  if (box1Area + box2Area - intersection === 0) return 0;
  return intersection / (box1Area + box2Area - intersection);
}

/**
 * Runs Non-Maximum Suppression (NMS) on bounding boxes.
 */
function runNMS(boxes: any[], iouThreshold = 0.45): any[] {
  const sorted = [...boxes].sort((a, b) => b.confidence - a.confidence);
  const kept: any[] = [];

  while (sorted.length > 0) {
    const current = sorted.shift()!;
    kept.push(current);

    for (let i = sorted.length - 1; i >= 0; i--) {
      if (calculateIoU(current, sorted[i]) > iouThreshold) {
        sorted.splice(i, 1);
      }
    }
  }

  return kept;
}

/**
 * Preprocesses the image, resizing/letterboxing it to YOLOv8 input size of 640x640.
 */
function preprocessImage(
  imgElement: HTMLImageElement,
  targetWidth = 640,
  targetHeight = 640
): {
  tensor: ort.Tensor;
  scale: number;
  padX: number;
  padY: number;
} {
  const canvas = document.createElement('canvas');
  canvas.width = targetWidth;
  canvas.height = targetHeight;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Could not get canvas context');

  const srcW = imgElement.naturalWidth;
  const srcH = imgElement.naturalHeight;

  // Scale preserving aspect ratio (letterboxing)
  const scale = Math.min(targetWidth / srcW, targetHeight / srcH);
  const newW = srcW * scale;
  const newH = srcH * scale;

  const padX = (targetWidth - newW) / 2;
  const padY = (targetHeight - newH) / 2;

  ctx.fillStyle = '#000000';
  ctx.fillRect(0, 0, targetWidth, targetHeight);
  ctx.drawImage(imgElement, 0, 0, srcW, srcH, padX, padY, newW, newH);

  const imgData = ctx.getImageData(0, 0, targetWidth, targetHeight);
  const pixels = imgData.data;

  // CHW format tensor construction (Float32) normalized by 255.0
  const tensorData = new Float32Array(targetWidth * targetHeight * 3);
  const area = targetWidth * targetHeight;

  for (let i = 0; i < area; i++) {
    tensorData[i] = pixels[i * 4] / 255.0;            // R channel
    tensorData[area + i] = pixels[i * 4 + 1] / 255.0; // G channel
    tensorData[2 * area + i] = pixels[i * 4 + 2] / 255.0; // B channel
  }

  const tensor = new ort.Tensor('float32', tensorData, [1, 3, targetWidth, targetHeight]);
  return { tensor, scale, padX, padY };
}

/**
 * Runs YOLO object detection on the vehicle image.
 */
export async function detectLicensePlates(
  imgElement: HTMLImageElement,
  session: ort.InferenceSession,
  confThreshold = 0.40,
  iouThreshold = 0.45
): Promise<DetectionResult[]> {
  // Preprocess input image to 640x640 tensor
  const { tensor, scale, padX, padY } = preprocessImage(imgElement);

  // Run inference
  const inputs = { [session.inputNames[0]]: tensor };
  const outputs = await session.run(inputs);
  const outputName = session.outputNames[0];
  const outputTensor = outputs[outputName];

  const data = outputTensor.data as Float32Array;
  const dims = outputTensor.dims; // e.g. [1, 5, 8400] or [1, 8400, 5]

  const rawBoxes: any[] = [];

  // Parse YOLO outputs dynamically based on tensor dimensions
  if (dims[1] === 5 || dims[1] === 6) {
    // Shape: [1, Channels, Detections] - standard YOLOv8
    const numChannels = dims[1];
    const numDetections = dims[2];

    for (let i = 0; i < numDetections; i++) {
      const conf = data[4 * numDetections + i];
      if (conf >= confThreshold) {
        const cx = data[i];
        const cy = data[numDetections + i];
        const w = data[2 * numDetections + i];
        const h = data[3 * numDetections + i];

        const x1 = cx - w / 2;
        const y1 = cy - h / 2;
        const x2 = cx + w / 2;
        const y2 = cy + h / 2;

        rawBoxes.push({ x1, y1, x2, y2, confidence: conf });
      }
    }
  } else if (dims[2] === 5 || dims[2] === 6) {
    // Shape: [1, Detections, Channels] - alternative standard
    const numDetections = dims[1];
    const numChannels = dims[2];

    for (let i = 0; i < numDetections; i++) {
      const offset = i * numChannels;
      const conf = data[offset + 4];
      if (conf >= confThreshold) {
        const cx = data[offset];
        const cy = data[offset + 1];
        const w = data[offset + 2];
        const h = data[offset + 3];

        const x1 = cx - w / 2;
        const y1 = cy - h / 2;
        const x2 = cx + w / 2;
        const y2 = cy + h / 2;

        rawBoxes.push({ x1, y1, x2, y2, confidence: conf });
      }
    }
  } else {
    // Generic fallback if dimensions are flat or unexpected
    const totalFloats = data.length;
    const stride = 5;
    const numDetections = Math.floor(totalFloats / stride);

    for (let i = 0; i < numDetections; i++) {
      const offset = i * stride;
      const conf = data[offset + 4];
      if (conf >= confThreshold) {
        const cx = data[offset];
        const cy = data[offset + 1];
        const w = data[offset + 2];
        const h = data[offset + 3];

        const x1 = cx - w / 2;
        const y1 = cy - h / 2;
        const x2 = cx + w / 2;
        const y2 = cy + h / 2;

        rawBoxes.push({ x1, y1, x2, y2, confidence: conf });
      }
    }
  }

  // Filter overlapping boxes using NMS
  const keptBoxes = runNMS(rawBoxes, iouThreshold);

  // Convert coordinate space back to original-image space
  return keptBoxes.map((box, index) => {
    const origX1 = (box.x1 - padX) / scale;
    const origY1 = (box.y1 - padY) / scale;
    const origX2 = (box.x2 - padX) / scale;
    const origY2 = (box.y2 - padY) / scale;

    const origX = Math.max(0, origX1);
    const origY = Math.max(0, origY1);
    const origW = Math.max(1, origX2 - origX1);
    const origH = Math.max(1, origY2 - origY1);

    return {
      id: `detect_${index}_${Math.random().toString(36).substring(2, 6)}`,
      x: origX,
      y: origY,
      width: origW,
      height: origH,
      confidence: box.confidence,
      className: 'license-plate',
    };
  });
}

/**
 * Estimates rotation angle using OpenCV contour analysis.
 */
export function estimateRotationOpenCV(
  imgElement: HTMLImageElement,
  box: { x: number; y: number; width: number; height: number }
): number {
  const cv = (window as any).cv;
  if (!cv) return 0;

  try {
    const cropX = Math.max(0, Math.floor(box.x));
    const cropY = Math.max(0, Math.floor(box.y));
    const cropW = Math.min(imgElement.naturalWidth - cropX, Math.ceil(box.width));
    const cropH = Math.min(imgElement.naturalHeight - cropY, Math.ceil(box.height));

    if (cropW < 5 || cropH < 5) return 0;

    const canvas = document.createElement('canvas');
    canvas.width = cropW;
    canvas.height = cropH;
    const ctx = canvas.getContext('2d');
    if (!ctx) return 0;
    ctx.drawImage(imgElement, cropX, cropY, cropW, cropH, 0, 0, cropW, cropH);

    const src = cv.imread(canvas);
    const gray = new cv.Mat();
    cv.cvtColor(src, gray, cv.COLOR_RGBA2GRAY, 0);

    const blurred = new cv.Mat();
    cv.GaussianBlur(gray, blurred, new cv.Size(5, 5), 0, 0, cv.BORDER_DEFAULT);

    const edges = new cv.Mat();
    cv.Canny(blurred, edges, 50, 150, 3, false);

    const contours = new cv.MatVector();
    const hierarchy = new cv.Mat();
    cv.findContours(edges, contours, hierarchy, cv.RETR_EXTERNAL, cv.CHAIN_APPROX_SIMPLE);

    let maxArea = 0;
    let bestAngle = 0;

    for (let i = 0; i < contours.size(); ++i) {
      const cnt = contours.get(i);
      const area = cv.contourArea(cnt);
      if (area > maxArea && area > (cropW * cropH) * 0.15) {
        maxArea = area;
        const rect = cv.minAreaRect(cnt);
        let angle = rect.angle;
        
        if (rect.size.width < rect.size.height) {
          angle = angle + 90;
        }
        
        if (Math.abs(angle) < 45) {
          bestAngle = angle;
        }
      }
    }

    src.delete();
    gray.delete();
    blurred.delete();
    edges.delete();
    contours.delete();
    hierarchy.delete();

    return bestAngle;
  } catch (err) {
    console.warn('Rotation estimation failed:', err);
  }
  return 0;
}

