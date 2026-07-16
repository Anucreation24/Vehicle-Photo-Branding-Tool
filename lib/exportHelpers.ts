import { Canvas, StaticCanvas, FabricImage, Group } from 'fabric';
import { ExportPreset, ExportFormat, ExportQuality, FitMethod, WatermarkOptions, ImageMetadata, Point } from '../types';
import { createNamePlate, getWatermarkCoords } from './canvasHelpers';

interface ExportOptions {
  preset: ExportPreset;
  format: ExportFormat;
  quality: ExportQuality;
  fitMethod: FitMethod;
  backgroundColor: string;
  watermarkOptions: WatermarkOptions;
  isWatermarkManual: boolean;
  imageMetadata: ImageMetadata;
}

/**
 * Generates flat plate canvas for perspective warping.
 */
export function renderFlatPlateCanvas(
  plateOptions: any,
  originalWidth: number,
  originalHeight: number
): HTMLCanvasElement {
  const plateGroup = createNamePlate(
    plateOptions,
    originalWidth,
    originalHeight
  );

  const flatWidth = Math.max(
    1,
    Math.ceil(plateGroup.getScaledWidth())
  );

  const flatHeight = Math.max(
    1,
    Math.ceil(plateGroup.getScaledHeight())
  );

  const workingElement = document.createElement('canvas');

  const tempCanvas = new StaticCanvas(workingElement, {
    width: flatWidth,
    height: flatHeight,
    enableRetinaScaling: false,
    renderOnAddRemove: false,
  });

  plateGroup.set({
    left: flatWidth / 2,
    top: flatHeight / 2,
    originX: 'center',
    originY: 'center',
    angle: 0,
    scaleX: 1,
    scaleY: 1,
    shadow: null,
    visible: true,
    opacity: 1,
  });

  plateGroup.setCoords();
  tempCanvas.add(plateGroup);
  tempCanvas.renderAll();

  // IMPORTANT:
  // Make a separate stable bitmap copy before disposing Fabric.
  const snapshot = document.createElement('canvas');
  snapshot.width = flatWidth;
  snapshot.height = flatHeight;

  const snapshotContext = snapshot.getContext('2d');

  if (!snapshotContext) {
    tempCanvas.dispose();
    throw new Error(
      'Unable to create the flat plate snapshot context.'
    );
  }

  snapshotContext.clearRect(0, 0, flatWidth, flatHeight);
  snapshotContext.drawImage(
    tempCanvas.getElement(),
    0,
    0,
    flatWidth,
    flatHeight
  );

  tempCanvas.dispose();

  // Return the independent snapshot, not the disposed Fabric element.
  return snapshot;
}

/**
 * Creates an offscreen Fabric.js canvas, replicates the layout at the target export size,
 * and returns the exported data URL.
 */
export async function generateExportDataUrl(
  displayCanvas: Canvas,
  bgImgElement: HTMLImageElement,
  options: ExportOptions
): Promise<string> {
  const {
    preset,
    format,
    quality,
    fitMethod,
    backgroundColor,
    watermarkOptions,
    isWatermarkManual,
    imageMetadata,
  } = options;

  const originalWidth = imageMetadata.width;
  const originalHeight = imageMetadata.height;

  // 1. Determine target dimensions
  let targetWidth = originalWidth;
  let targetHeight = originalHeight;

  if (preset === 'facebook_square') {
    targetWidth = 1080;
    targetHeight = 1080;
  } else if (preset === 'instagram_portrait') {
    targetWidth = 1080;
    targetHeight = 1350;
  } else if (preset === 'landscape') {
    targetWidth = 1920;
    targetHeight = 1080;
  }

  // 2. Create offscreen canvas element and Fabric Canvas
  const tempCanvasElement = document.createElement('canvas');
  tempCanvasElement.width = targetWidth;
  tempCanvasElement.height = targetHeight;

  // Opacity check for background
  const tempCanvas = new StaticCanvas(tempCanvasElement, {
    width: targetWidth,
    height: targetHeight,
    backgroundColor: preset === 'original' ? undefined : backgroundColor,
  });

  // 3. Position and scale the background photo on the export canvas
  let scale = 1.0;
  let leftOffset = 0;
  let topOffset = 0;

  if (preset !== 'original') {
    const scaleFit = Math.min(targetWidth / originalWidth, targetHeight / originalHeight);
    const scaleFill = Math.max(targetWidth / originalWidth, targetHeight / originalHeight);

    if (fitMethod === 'fit') {
      scale = scaleFit;
      const imgWidth = originalWidth * scaleFit;
      const imgHeight = originalHeight * scaleFit;
      leftOffset = (targetWidth - imgWidth) / 2;
      topOffset = (targetHeight - imgHeight) / 2;
    } else {
      // fill
      scale = scaleFill;
      const imgWidth = originalWidth * scaleFill;
      const imgHeight = originalHeight * scaleFill;
      leftOffset = (targetWidth - imgWidth) / 2;
      topOffset = (targetHeight - imgHeight) / 2;
    }
  }

  const tempBgImg = new FabricImage(bgImgElement, {
    left: leftOffset,
    top: topOffset,
    scaleX: scale,
    scaleY: scale,
    selectable: false,
    evented: false,
  });

  tempCanvas.add(tempBgImg);

  // 4. Replicate and scale branding overlays
  const canvasObjects = displayCanvas.getObjects();

  for (const obj of canvasObjects) {
    const customObj = obj as any;

    if (customObj.isNamePlate) {
      const plateOptions = customObj.plateOptions;
      const newPlate = createNamePlate(plateOptions, originalWidth, originalHeight);
      
      newPlate.set({
        left: obj.left * scale + leftOffset,
        top: obj.top * scale + topOffset,
        scaleX: obj.scaleX * scale,
        scaleY: obj.scaleY * scale,
        angle: obj.angle,
        opacity: obj.opacity,
        selectable: false,
      });

      tempCanvas.add(newPlate);
    } else if (customObj.isWatermark && watermarkOptions.visible) {
      // Replicate Watermark
      const logoImgElement = (obj as FabricImage).getElement() as HTMLImageElement;
      
      const newWatermark = new FabricImage(logoImgElement, {
        opacity: watermarkOptions.opacity,
        selectable: false,
        evented: false,
      });

      if (isWatermarkManual) {
        // Translate manual watermark drag coords
        newWatermark.set({
          left: obj.left * scale + leftOffset,
          top: obj.top * scale + topOffset,
          scaleX: obj.scaleX * scale,
          scaleY: obj.scaleY * scale,
          angle: obj.angle,
        });
      } else {
        // Watermark Snapped Preset Positioning
        const { left, top, scale: wmScale } = getWatermarkCoords(
          logoImgElement.naturalWidth || logoImgElement.width,
          logoImgElement.naturalHeight || logoImgElement.height,
          originalWidth,
          originalHeight,
          watermarkOptions
        );
        newWatermark.set({
          left: left * scale + leftOffset,
          top: top * scale + topOffset,
          scaleX: wmScale * scale,
          scaleY: wmScale * scale,
        });
      }

      tempCanvas.add(newWatermark);
    }
  }

  // 5. Render offscreen
  tempCanvas.renderAll();

  // 6. Export to Data URL
  // If JPG, ensure opaque background by filling canvas background with white if transparent
  const mimeType = format === 'jpeg' ? 'jpeg' : 'png';
  const dataUrl = tempCanvas.toDataURL({
    format: mimeType,
    quality: format === 'jpeg' ? quality : undefined,
    multiplier: 1,
  });

  // 7. Clean up offscreen canvas
  tempCanvas.dispose();

  return dataUrl;
}
