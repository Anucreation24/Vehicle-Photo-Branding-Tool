'use client';

import { useState, useRef } from 'react';
import { Canvas, Rect } from 'fabric';

interface UseManualPlateSelectionProps {
  fabricCanvasRef: React.MutableRefObject<Canvas | null>;
  displayScale: number;
  isPreviewActive: boolean;
  createBrandedPlateAt: (cx: number, cy: number, w: number, h: number) => void;
  handleTogglePreview: (active: boolean) => void;
}

export function useManualPlateSelection({
  fabricCanvasRef,
  displayScale,
  isPreviewActive,
  createBrandedPlateAt,
  handleTogglePreview,
}: UseManualPlateSelectionProps) {
  const [isManualSelecting, setIsManualSelecting] = useState<boolean>(false);

  // Manual selection dragging refs
  const startXRef = useRef<number>(0);
  const startYRef = useRef<number>(0);
  const isDraggingRef = useRef<boolean>(false);
  const tempSelectionRectRef = useRef<Rect | null>(null);
  const isManualSelectingRef = useRef<boolean>(false);

  const handleStartManualSelection = () => {
    const canvas = fabricCanvasRef.current;
    if (!canvas) return;

    if (isPreviewActive) handleTogglePreview(false);

    isManualSelectingRef.current = true;
    setIsManualSelecting(true);
    canvas.discardActiveObject();
    canvas.defaultCursor = 'crosshair';

    canvas.getObjects().forEach((obj) => {
      obj.selectable = false;
      obj.evented = false;
    });

    canvas.requestRenderAll();
  };

  const handleCancelManualSelection = () => {
    isManualSelectingRef.current = false;
    setIsManualSelecting(false);
    const canvas = fabricCanvasRef.current;
    if (!canvas) return;

    canvas.defaultCursor = 'default';
    canvas.getObjects().forEach((obj) => {
      if ((obj as any).isNamePlate || (obj as any).isWatermark) {
        obj.selectable = !isPreviewActive;
        obj.evented = !isPreviewActive;
      }
    });

    if (tempSelectionRectRef.current) {
      canvas.remove(tempSelectionRectRef.current);
      tempSelectionRectRef.current = null;
    }
    canvas.requestRenderAll();
  };

  const handleCanvasMouseDown = (opt: any) => {
    const canvas = fabricCanvasRef.current;
    if (!canvas || !isManualSelectingRef.current) return;

    const pointer = opt.scenePoint ?? opt.absolutePointer ?? { x: 0, y: 0 };
    startXRef.current = pointer.x;
    startYRef.current = pointer.y;
    isDraggingRef.current = true;

    // Create temporary selection rectangle
    const rect = new Rect({
      left: pointer.x,
      top: pointer.y,
      width: 0,
      height: 0,
      fill: 'rgba(255, 235, 59, 0.15)', // bright yellow transparent
      stroke: '#FFEB3B', // bright yellow outline
      strokeWidth: Math.max(1.5, 1.5 / displayScale),
      selectable: false,
      evented: false,
      excludeFromExport: true,
    });

    tempSelectionRectRef.current = rect;
    canvas.add(rect);
    canvas.requestRenderAll();
  };

  const handleCanvasMouseMove = (opt: any) => {
    const canvas = fabricCanvasRef.current;
    if (!canvas || !isManualSelectingRef.current || !isDraggingRef.current || !tempSelectionRectRef.current) return;

    const pointer = opt.scenePoint ?? opt.absolutePointer ?? { x: 0, y: 0 };
    const x = pointer.x;
    const y = pointer.y;

    const startX = startXRef.current;
    const startY = startYRef.current;

    const left = Math.min(startX, x);
    const top = Math.min(startY, y);
    const width = Math.abs(startX - x);
    const height = Math.abs(startY - y);

    tempSelectionRectRef.current.set({ left, top, width, height });
    canvas.requestRenderAll();
  };

  const handleCanvasMouseUp = () => {
    const canvas = fabricCanvasRef.current;
    if (!canvas || !isManualSelectingRef.current) return;

    isDraggingRef.current = false;
    const rect = tempSelectionRectRef.current;

    if (rect) {
      canvas.remove(rect);
      tempSelectionRectRef.current = null;

      const width = rect.width;
      const height = rect.height;
      const left = rect.left;
      const top = rect.top;

      // Minimum rectangle size check: 15x15 pixels in original coordinates (Phase C)
      if (width > 15 && height > 15) {
        const cx = left + width / 2;
        const cy = top + height / 2;

        // Apply safety expansion (+6% width, +10% height) (Phase D)
        const plateW = width * 1.06;
        const plateH = height * 1.10;

        createBrandedPlateAt(cx, cy, plateW, plateH);
      }
    }

    handleCancelManualSelection();
  };

  return {
    isManualSelecting,
    handleStartManualSelection,
    handleCancelManualSelection,
    handleCanvasMouseDown,
    handleCanvasMouseMove,
    handleCanvasMouseUp,
    isManualSelectingRef,
  };
}
