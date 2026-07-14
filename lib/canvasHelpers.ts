import {
  Canvas,
  Rect,
  FabricText,
  Group,
  Shadow,
  FabricImage,
  FabricObject,
} from 'fabric';
import { PlateOptions, WatermarkOptions, WatermarkPosition } from '../types';

/**
 * Creates a grouped Fabric.js object representing the branded name plate.
 */
export function createNamePlate(
  options: PlateOptions,
  canvasWidth: number,
  canvasHeight: number
): Group {
  const {
    text,
    backgroundColor,
    textColor,
    borderColor,
    borderWidth,
    cornerRadius,
    opacity,
    rotation,
    shadow,
  } = options;

  // Default plate aspect ratio: wide number plate (e.g. 360 x 100)
  // We scale this based on canvas width, making it around 30% of canvas width by default
  const baseWidth = Math.max(200, Math.round(canvasWidth * 0.3));
  const baseHeight = Math.max(60, Math.round(baseWidth * 0.28));

  // 1. Background Rectangle
  const bgRect = new Rect({
    width: baseWidth,
    height: baseHeight,
    fill: backgroundColor,
    rx: cornerRadius,
    ry: cornerRadius,
    originX: 'center',
    originY: 'center',
  });

  // 2. Inner Border Rectangle
  const borderInset = 5 + borderWidth / 2;
  const borderRect = new Rect({
    width: baseWidth - borderInset * 2,
    height: baseHeight - borderInset * 2,
    fill: 'transparent',
    stroke: borderColor,
    strokeWidth: borderWidth,
    strokeUniform: true, // Crucial: stroke thickness doesn't stretch when scaled
    rx: Math.max(0, cornerRadius - borderInset),
    ry: Math.max(0, cornerRadius - borderInset),
    originX: 'center',
    originY: 'center',
  });

  // 3. Branded centered Text
  const textFontSize = Math.max(12, Math.round(baseHeight * 0.28));
  const textObj = new FabricText(text.toUpperCase(), {
    fill: textColor,
    fontSize: textFontSize,
    fontFamily: 'Impact, Arial Black, sans-serif',
    fontWeight: 'bold',
    textAlign: 'center',
    originX: 'center',
    originY: 'center',
    lineHeight: 1.05,
  });

  // Create Group
  const plateGroup = new Group([bgRect, borderRect, textObj], {
    left: canvasWidth / 2,
    top: canvasHeight / 2,
    originX: 'center',
    originY: 'center',
    angle: rotation,
    opacity: opacity,
    selectable: true,
    hasControls: true,
    hasBorders: true,
  });

  // Add shadow if enabled
  if (shadow) {
    plateGroup.set({
      shadow: new Shadow({
        color: 'rgba(0,0,0,0.45)',
        blur: 10,
        offsetX: 4,
        offsetY: 4,
      }),
    });
  } else {
    plateGroup.set({ shadow: null });
  }

  // Attach metadata to identify it as a plate
  (plateGroup as any).isNamePlate = true;
  // Store reference to children so we can dynamically update properties
  (plateGroup as any).bgRect = bgRect;
  (plateGroup as any).borderRect = borderRect;
  (plateGroup as any).textObj = textObj;

  return plateGroup;
}

/**
 * Updates an existing Plate group with new settings
 */
export function updatePlateProperties(plate: Group, options: PlateOptions) {
  const bgRect = (plate as any).bgRect as Rect;
  const borderRect = (plate as any).borderRect as Rect;
  const textObj = (plate as any).textObj as FabricText;

  if (!bgRect || !borderRect || !textObj) return;

  // 1. Update backgrounds and texts
  bgRect.set({
    fill: options.backgroundColor,
    rx: options.cornerRadius,
    ry: options.cornerRadius,
  });

  const borderInset = 5 + options.borderWidth / 2;
  borderRect.set({
    stroke: options.borderColor,
    strokeWidth: options.borderWidth,
    width: bgRect.width - borderInset * 2,
    height: bgRect.height - borderInset * 2,
    rx: Math.max(0, options.cornerRadius - borderInset),
    ry: Math.max(0, options.cornerRadius - borderInset),
  });

  textObj.set({
    text: options.text.toUpperCase(),
    fill: options.textColor,
  });

  // 2. Update Group level settings
  plate.set({
    opacity: options.opacity,
    angle: options.rotation,
  });

  if (options.shadow) {
    plate.set({
      shadow: new Shadow({
        color: 'rgba(0,0,0,0.45)',
        blur: 10,
        offsetX: 4,
        offsetY: 4,
      }),
    });
  } else {
    plate.set({ shadow: null });
  }

  // Update coordinate system for interactions
  plate.setCoords();
}

/**
 * Calculates scale & position coordinates for the watermark based on canvas dimensions
 */
export function getWatermarkCoords(
  logoWidth: number,
  logoHeight: number,
  canvasWidth: number,
  canvasHeight: number,
  options: WatermarkOptions
) {
  // Target width is e.g. 15% of canvas width
  const targetWidth = canvasWidth * options.scale;
  const scale = targetWidth / logoWidth;
  const targetHeight = logoHeight * scale;

  const margin = Math.min(25, canvasWidth * 0.04); // 4% margin, cap at 25px

  let left = margin;
  let top = margin;

  switch (options.position) {
    case 'top-left':
      left = margin;
      top = margin;
      break;
    case 'top-right':
      left = canvasWidth - targetWidth - margin;
      top = margin;
      break;
    case 'bottom-left':
      left = margin;
      top = canvasHeight - targetHeight - margin;
      break;
    case 'bottom-right':
      left = canvasWidth - targetWidth - margin;
      top = canvasHeight - targetHeight - margin;
      break;
  }

  return { left, top, scale };
}

/**
 * Fits a given display size inside container dimensions while preserving aspect ratio
 */
export function fitDimensions(
  srcWidth: number,
  srcHeight: number,
  maxWidth: number,
  maxHeight: number
) {
  const ratio = srcWidth / srcHeight;
  let width = maxWidth;
  let height = maxWidth / ratio;

  if (height > maxHeight) {
    height = maxHeight;
    width = maxHeight * ratio;
  }

  return { width, height };
}
