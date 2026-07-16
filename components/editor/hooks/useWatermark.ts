'use client';

import { useState, useRef } from 'react';
import { FabricImage, Canvas } from 'fabric';
import { WatermarkOptions, WatermarkPosition, ImageMetadata } from '../../../types';
import { getWatermarkCoords } from '../../../lib/canvasHelpers';

interface UseWatermarkProps {
  fabricCanvasRef: React.MutableRefObject<Canvas | null>;
  imageMetadata: ImageMetadata | null;
  pushToHistory: () => void;
  isPreviewActive: boolean;
}

export function useWatermark({
  fabricCanvasRef,
  imageMetadata,
  pushToHistory,
  isPreviewActive,
}: UseWatermarkProps) {
  const [logoError, setLogoError] = useState<string | null>(null);
  const [isWatermarkManual, setIsWatermarkManual] = useState(false);
  const watermarkFabricObjectRef = useRef<FabricImage | null>(null);

  const [watermarkOptions, setWatermarkOptions] = useState<WatermarkOptions>({
    visible: true,
    opacity: 1.0,
    scale: 0.18, // 18% of original image width by default (Part 5)
    position: 'bottom-left',
    customLogoUrl: null,
  });

  const loadLogoImage = (url: string): Promise<HTMLImageElement> => {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = () => resolve(img);
      img.onerror = (e) => reject(e);
      img.src = url;
    });
  };

  const addDefaultWatermark = async (
    canvas: Canvas,
    editorWidth: number,
    editorHeight: number,
    customUrl?: string
  ) => {
    setLogoError(null);
    const logoUrl = customUrl || watermarkOptions.customLogoUrl || '/branding/thennakoon-tours-logo.png';

    try {
      const logoImg = await loadLogoImage(logoUrl);

      if (watermarkFabricObjectRef.current) {
        canvas.remove(watermarkFabricObjectRef.current);
      }

      // Sized from editorWidth (Item 5)
      const targetLogoWidth = editorWidth * watermarkOptions.scale;
      const logoScale = targetLogoWidth / logoImg.naturalWidth;

      const wm = new FabricImage(logoImg, {
        scaleX: logoScale,
        scaleY: logoScale,
        left: editorWidth * 0.03, // 3% margin
        top: editorHeight - (logoImg.naturalHeight * logoScale) - (editorWidth * 0.03),
        opacity: watermarkOptions.opacity,
        visible: watermarkOptions.visible && !isPreviewActive,
        selectable: true,
        hasControls: true,
        hasBorders: true,
        transparentCorners: false,
        cornerColor: '#8B0000',
        cornerStrokeColor: '#FFFFFF',
        borderColor: '#8B0000',
        cornerSize: 12,
        originX: 'left',
        originY: 'top',
      });

      (wm as any).isWatermark = true;
      watermarkFabricObjectRef.current = wm;
      canvas.add(wm);
      canvas.bringObjectToFront(wm);
      canvas.renderAll();
    } catch (err) {
      console.warn('Default logo asset failed to load:', err);
      setLogoError('Watermark image not found. Upload custom logo or verify assets.');
      if (watermarkFabricObjectRef.current) {
        canvas.remove(watermarkFabricObjectRef.current);
        watermarkFabricObjectRef.current = null;
      }
    }
  };

  const handleWatermarkOptionsChange = (updated: Partial<WatermarkOptions>) => {
    const canvas = fabricCanvasRef.current;
    const wm = watermarkFabricObjectRef.current;
    if (!canvas || !wm || !imageMetadata) return;

    const editorW = imageMetadata.editorWidth || imageMetadata.width;
    const editorH = imageMetadata.editorHeight || imageMetadata.height;

    setWatermarkOptions((prev) => {
      const next = { ...prev, ...updated };

      if (updated.position && updated.position !== prev.position) {
        setIsWatermarkManual(false);
        const { left, top, scale } = getWatermarkCoords(
          wm.width,
          wm.height,
          editorW,
          editorH,
          next
        );
        wm.set({ left, top, scaleX: scale, scaleY: scale });
      }

      if (updated.scale !== undefined && updated.scale !== prev.scale) {
        setIsWatermarkManual(false);
        const { left, top, scale } = getWatermarkCoords(
          wm.width,
          wm.height,
          editorW,
          editorH,
          next
        );
        wm.set({ left, top, scaleX: scale, scaleY: scale });
      }

      wm.set({
        visible: next.visible && !isPreviewActive,
        opacity: next.opacity,
      });

      wm.setCoords();
      canvas.renderAll();
      pushToHistory();

      return next;
    });
  };

  const handleUploadCustomLogo = (url: string) => {
    const canvas = fabricCanvasRef.current;
    if (!canvas || !imageMetadata) return;

    const editorW = imageMetadata.editorWidth || imageMetadata.width;
    const editorH = imageMetadata.editorHeight || imageMetadata.height;

    setWatermarkOptions((prev) => ({
      ...prev,
      customLogoUrl: url,
      visible: true,
    }));

    addDefaultWatermark(canvas, editorW, editorH, url).then(() => {
      pushToHistory();
    });
  };

  const handleClearCustomLogo = () => {
    const canvas = fabricCanvasRef.current;
    if (!canvas || !imageMetadata) return;

    const editorW = imageMetadata.editorWidth || imageMetadata.width;
    const editorH = imageMetadata.editorHeight || imageMetadata.height;

    if (watermarkOptions.customLogoUrl) {
      URL.revokeObjectURL(watermarkOptions.customLogoUrl);
    }

    setWatermarkOptions((prev) => ({
      ...prev,
      customLogoUrl: null,
    }));

    addDefaultWatermark(canvas, editorW, editorH, '/branding/thennakoon-tours-logo.png').then(() => {
      pushToHistory();
    });
  };

  return {
    watermarkOptions,
    setWatermarkOptions,
    watermarkFabricObjectRef,
    logoError,
    setLogoError,
    isWatermarkManual,
    setIsWatermarkManual,
    addDefaultWatermark,
    handleWatermarkOptionsChange,
    handleUploadCustomLogo,
    handleClearCustomLogo,
  };
}
