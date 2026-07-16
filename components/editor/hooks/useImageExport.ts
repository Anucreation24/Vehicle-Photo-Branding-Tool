'use client';

import { useState } from 'react';
import { Canvas } from 'fabric';
import { ExportPreset, ExportFormat, ExportQuality, FitMethod, WatermarkOptions, ImageMetadata } from '../../../types';
import { generateExportDataUrl } from '../../../lib/exportHelpers';

interface UseImageExportProps {
  fabricCanvasRef: React.MutableRefObject<Canvas | null>;
  bgImageElementRef: React.MutableRefObject<HTMLImageElement | null>;
  imageMetadata: ImageMetadata | null;
  watermarkOptions: WatermarkOptions;
  isWatermarkManual: boolean;
}

export function useImageExport({
  fabricCanvasRef,
  bgImageElementRef,
  imageMetadata,
  watermarkOptions,
  isWatermarkManual,
}: UseImageExportProps) {
  const [exportPreset, setExportPreset] = useState<ExportPreset>('original');
  const [exportFormat, setExportFormat] = useState<ExportFormat>('jpeg');
  const [exportQuality, setExportQuality] = useState<ExportQuality>(0.90);
  const [exportFitMethod, setExportFitMethod] = useState<FitMethod>('fit');
  const [exportBgColor, setExportBgColor] = useState<string>('#FFFFFF');
  const [exportCount, setExportCount] = useState<number>(1);
  const [isExporting, setIsExporting] = useState<boolean>(false);

  const handleExportImage = async () => {
    const canvas = fabricCanvasRef.current;
    if (!canvas || !bgImageElementRef.current || !imageMetadata) return;

    setIsExporting(true);

    try {
      canvas.discardActiveObject();
      canvas.renderAll();

      const dataUrl = await generateExportDataUrl(canvas, bgImageElementRef.current, {
        preset: exportPreset,
        format: exportFormat,
        quality: exportQuality,
        fitMethod: exportFitMethod,
        backgroundColor: exportBgColor,
        watermarkOptions,
        isWatermarkManual,
        imageMetadata,
      });

      if (dataUrl) {
        const link = document.createElement('a');
        const ext = exportFormat === 'jpeg' ? 'jpg' : 'png';
        const paddedNum = String(exportCount).padStart(3, '0');
        
        link.download = `Thennakoon-Tours-Branded-${paddedNum}.${ext}`;
        link.href = dataUrl;
        
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);

        setExportCount((prev) => prev + 1);
      }
    } catch (err) {
      console.error('Export failed:', err);
    } finally {
      setIsExporting(false);
    }
  };

  return {
    exportPreset,
    setExportPreset,
    exportFormat,
    setExportFormat,
    exportQuality,
    setExportQuality,
    exportFitMethod,
    setExportFitMethod,
    exportBgColor,
    setExportBgColor,
    isExporting,
    setIsExporting,
    handleExportImage,
  };
}
