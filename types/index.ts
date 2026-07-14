export type ExportPreset = 'original' | 'facebook_square' | 'instagram_portrait' | 'landscape';

export type ExportFormat = 'jpeg' | 'png';

export type ExportQuality = 0.75 | 0.90 | 1.00;

export type FitMethod = 'fit' | 'fill';

export type WatermarkPosition = 'bottom-left' | 'bottom-right' | 'top-left' | 'top-right';

export type PlateMode = 'standard' | 'perspective';

export interface Point {
  x: number;
  y: number;
}

export interface PlateOptions {
  text: string;
  backgroundColor: string;
  textColor: string;
  borderColor: string;
  borderWidth: number;
  cornerRadius: number; // maps to rx/ry in fabric
  opacity: number;
  rotation: number;
  shadow: boolean;
}

export interface WatermarkOptions {
  visible: boolean;
  opacity: number;
  scale: number; // scale relative to canvas width, e.g. 0.15 for 15%
  position: WatermarkPosition;
  customLogoUrl: string | null; // null if using default or no logo
}

export interface ImageMetadata {
  name: string;
  width: number;
  height: number;
  size: number; // in bytes
}

export interface PlatePreset {
  name: string;
  backgroundColor: string;
  textColor: string;
  borderColor: string;
}

export const PLATE_PRESETS: PlatePreset[] = [
  {
    name: 'Preset 1 (Dark Red)',
    backgroundColor: '#8B0000', // Maroon
    textColor: '#FFFFFF',
    borderColor: '#FFFFFF',
  },
  {
    name: 'Preset 2 (Black)',
    backgroundColor: '#000000',
    textColor: '#FFFFFF',
    borderColor: '#FFFFFF',
  },
  {
    name: 'Preset 3 (White)',
    backgroundColor: '#FFFFFF',
    textColor: '#000000',
    borderColor: '#000000',
  },
];
