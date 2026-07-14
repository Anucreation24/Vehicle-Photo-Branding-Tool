import { Canvas, FabricImage, Group } from 'fabric';
import { ExportPreset, ExportFormat, ExportQuality, FitMethod, WatermarkOptions, ImageMetadata } from '../types';
import { createNamePlate, getWatermarkCoords, updatePlateProperties } from './canvasHelpers';

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

  // 1. Determine target dimensions
  let targetWidth = imageMetadata.width;
  let targetHeight = imageMetadata.height;

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

  const tempCanvas = new Canvas(tempCanvasElement, {
    width: targetWidth,
    height: targetHeight,
    backgroundColor: preset === 'original' ? undefined : backgroundColor,
  });

  // 3. Position and scale the background image on the export canvas
  let tempBgLeft = 0;
  let tempBgTop = 0;
  let tempBgScaleX = 1;
  let tempBgScaleY = 1;

  if (preset === 'original') {
    tempBgScaleX = targetWidth / bgImgElement.naturalWidth;
    tempBgScaleY = targetHeight / bgImgElement.naturalHeight;
  } else {
    const srcWidth = bgImgElement.naturalWidth;
    const srcHeight = bgImgElement.naturalHeight;
    const scaleFit = Math.min(targetWidth / srcWidth, targetHeight / srcHeight);
    const scaleFill = Math.max(targetWidth / srcWidth, targetHeight / srcHeight);

    if (fitMethod === 'fit') {
      tempBgScaleX = scaleFit;
      tempBgScaleY = scaleFit;
      const imgWidth = srcWidth * scaleFit;
      const imgHeight = srcHeight * scaleFit;
      tempBgLeft = (targetWidth - imgWidth) / 2;
      tempBgTop = (targetHeight - imgHeight) / 2;
    } else {
      // fill
      tempBgScaleX = scaleFill;
      tempBgScaleY = scaleFill;
      const imgWidth = srcWidth * scaleFill;
      const imgHeight = srcHeight * scaleFill;
      tempBgLeft = (targetWidth - imgWidth) / 2;
      tempBgTop = (targetHeight - imgHeight) / 2;
    }
  }

  const tempBgImg = new FabricImage(bgImgElement, {
    left: tempBgLeft,
    top: tempBgTop,
    scaleX: tempBgScaleX,
    scaleY: tempBgScaleY,
    selectable: false,
    evented: false,
  });

  tempCanvas.add(tempBgImg);

  // 4. Find the background image on the display canvas to translate coordinates
  const displayBgObj = displayCanvas.getObjects().find((obj) => !(obj as any).isNamePlate && !(obj as any).isWatermark);
  if (!displayBgObj) {
    throw new Error('Background image not found on display canvas');
  }

  const displayBgLeft = displayBgObj.left || 0;
  const displayBgTop = displayBgObj.top || 0;
  const displayBgScaleX = displayBgObj.scaleX || 1;
  const displayBgScaleY = displayBgObj.scaleY || 1;

  // Helper to map coordinates from display canvas to temp canvas
  const mapCoords = (dispLeft: number, dispTop: number) => {
    const xOrig = (dispLeft - displayBgLeft) / displayBgScaleX;
    const yOrig = (dispTop - displayBgTop) / displayBgScaleY;
    const xTemp = xOrig * tempBgScaleX + tempBgLeft;
    const yTemp = yOrig * tempBgScaleY + tempBgTop;
    return { left: xTemp, top: yTemp };
  };

  // Helper to map scale from display canvas to temp canvas
  const mapScale = (dispScaleX: number, dispScaleY: number) => {
    const scaleXOrig = dispScaleX / displayBgScaleX;
    const scaleYOrig = dispScaleY / displayBgScaleY;
    return {
      scaleX: scaleXOrig * tempBgScaleX,
      scaleY: scaleYOrig * tempBgScaleY,
    };
  };

  // 5. Replicate and scale Name Plates
  const displayPlates = displayCanvas.getObjects().filter((obj) => (obj as any).isNamePlate) as Group[];

  for (const plate of displayPlates) {
    // Re-create the plate using the original options
    // First, let's gather its options from custom properties
    const bgRect = (plate as any).bgRect;
    const borderRect = (plate as any).borderRect;
    const textObj = (plate as any).textObj;

    const plateOptions = {
      text: textObj.text || '',
      backgroundColor: bgRect.fill as string,
      textColor: textObj.fill as string,
      borderColor: borderRect.stroke as string,
      borderWidth: borderRect.strokeWidth || 2,
      cornerRadius: bgRect.rx || 0,
      opacity: plate.opacity || 1,
      rotation: plate.angle || 0,
      shadow: !!plate.shadow,
    };

    // We create a new plate at display scale, then apply the mapped scale and position
    const newPlate = createNamePlate(plateOptions, displayCanvas.width, displayCanvas.height);
    
    // Map position
    const { left, top } = mapCoords(plate.left, plate.top);
    // Map scale
    const { scaleX, scaleY } = mapScale(plate.scaleX, plate.scaleY);

    newPlate.set({
      left,
      top,
      scaleX,
      scaleY,
      angle: plate.angle,
      selectable: false,
    });

    tempCanvas.add(newPlate);
  }

  // 6. Replicate and scale Watermark Logo
  const displayWatermark = displayCanvas.getObjects().find((obj) => (obj as any).isWatermark);
  if (displayWatermark && watermarkOptions.visible) {
    const logoImgElement = (displayWatermark as FabricImage).getElement() as HTMLImageElement;
    
    const newWatermark = new FabricImage(logoImgElement, {
      opacity: watermarkOptions.opacity,
      selectable: false,
      evented: false,
    });

    if (isWatermarkManual) {
      // Map manual positioning
      const { left, top } = mapCoords(displayWatermark.left, displayWatermark.top);
      const { scaleX, scaleY } = mapScale(displayWatermark.scaleX, displayWatermark.scaleY);
      newWatermark.set({
        left,
        top,
        scaleX,
        scaleY,
        angle: displayWatermark.angle,
      });
    } else {
      // Map preset positioning using canvas size
      const { left, top, scale } = getWatermarkCoords(
        logoImgElement.naturalWidth || logoImgElement.width,
        logoImgElement.naturalHeight || logoImgElement.height,
        targetWidth,
        targetHeight,
        watermarkOptions
      );
      newWatermark.set({
        left,
        top,
        scaleX: scale,
        scaleY: scale,
      });
    }

    tempCanvas.add(newWatermark);
  }

  // 7. Render everything
  tempCanvas.renderAll();

  // 8. Export to Data URL
  const mimeType = format === 'jpeg' ? 'image/jpeg' : 'image/png';
  const dataUrl = tempCanvas.toDataURL({
    format: format === 'jpeg' ? 'jpeg' : 'png',
    quality: format === 'jpeg' ? quality : undefined,
    multiplier: 1,
  });

  // 9. Dispose of temporary canvas to release memory
  tempCanvas.dispose();

  return dataUrl;
}
