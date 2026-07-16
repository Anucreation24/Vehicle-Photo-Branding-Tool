'use client';

import { useState, useRef } from 'react';
import { Canvas, FabricImage } from 'fabric';

interface UseFabricCanvasProps {
  canvasElRef: React.RefObject<HTMLCanvasElement | null>;
}

export function useFabricCanvas({ canvasElRef }: UseFabricCanvasProps) {
  const fabricCanvasRef = useRef<Canvas | null>(null);
  const bgImageElementRef = useRef<HTMLImageElement | null>(null);
  const bgFabricObjectRef = useRef<FabricImage | null>(null);

  const [displayScale, setDisplayScale] = useState<number>(1.0);
  const [editorZoom, setEditorZoom] = useState<number>(1.0);

  const initializeImageCanvas = (
    bgImage: HTMLImageElement,
    editorWidth: number,
    editorHeight: number
  ): Canvas => {
    if (fabricCanvasRef.current) {
      fabricCanvasRef.current.dispose();
    }

    const canvas = new Canvas(canvasElRef.current!, {
      width: editorWidth,
      height: editorHeight,
      enableRetinaScaling: false,
      selectionColor: 'rgba(128, 0, 0, 0.15)',
      selectionBorderColor: '#8B0000',
      selectionLineWidth: 1.5,
    });

    fabricCanvasRef.current = canvas;
    bgImageElementRef.current = bgImage;

    // Scale background image to exactly fill working canvas (Item 2)
    const scaleX = editorWidth / bgImage.naturalWidth;
    const scaleY = editorHeight / bgImage.naturalHeight;

    const fabricBg = new FabricImage(bgImage, {
      left: 0,
      top: 0,
      originX: 'left',
      originY: 'top',
      scaleX,
      scaleY,
      selectable: false,
      evented: false,
      lockMovementX: true,
      lockMovementY: true,
      lockScalingX: true,
      lockScalingY: true,
      lockRotation: true,
      hasControls: false,
      hasBorders: false,
      angle: 0,
    });

    bgFabricObjectRef.current = fabricBg;
    canvas.add(fabricBg);
    canvas.sendObjectToBack(fabricBg);

    return canvas;
  };

  const fitCanvasToEditor = (
    canvas: Canvas,
    originalWidth: number,
    originalHeight: number,
    containerWidth: number,
    containerHeight: number,
    zoomFactor: number = 1.0
  ): number => {
    const fitScale = Math.min(
      containerWidth / originalWidth,
      containerHeight / originalHeight,
      1
    ) * zoomFactor;

    const displayWidth = Math.round(originalWidth * fitScale);
    const displayHeight = Math.round(originalHeight * fitScale);

    if (canvas.wrapperEl) {
      canvas.wrapperEl.style.width = `${displayWidth}px`;
      canvas.wrapperEl.style.height = `${displayHeight}px`;
      canvas.wrapperEl.style.left = '0';
      canvas.wrapperEl.style.top = '0';
      canvas.wrapperEl.style.transform = 'none';
    }
    if (canvas.lowerCanvasEl) {
      canvas.lowerCanvasEl.style.width = `${displayWidth}px`;
      canvas.lowerCanvasEl.style.height = `${displayHeight}px`;
      canvas.lowerCanvasEl.style.left = '0';
      canvas.lowerCanvasEl.style.top = '0';
      canvas.lowerCanvasEl.style.transform = 'none';
    }
    if (canvas.upperCanvasEl) {
      canvas.upperCanvasEl.style.width = `${displayWidth}px`;
      canvas.upperCanvasEl.style.height = `${displayHeight}px`;
      canvas.upperCanvasEl.style.left = '0';
      canvas.upperCanvasEl.style.top = '0';
      canvas.upperCanvasEl.style.transform = 'none';
    }

    canvas.calcOffset();
    canvas.requestRenderAll();

    return fitScale;
  };

  const handleZoom = (
    type: 'in' | 'out' | 'fit',
    containerWidth: number,
    containerHeight: number
  ) => {
    const canvas = fabricCanvasRef.current;
    const bgImg = bgImageElementRef.current;
    if (!canvas || !bgImg) return;

    let nextZoom = editorZoom;
    if (type === 'in') {
      nextZoom = Math.min(3.0, editorZoom * 1.25);
    } else if (type === 'out') {
      nextZoom = Math.max(0.4, editorZoom / 1.25);
    } else {
      nextZoom = 1.0;
    }

    setEditorZoom(nextZoom);
    const scale = fitCanvasToEditor(
      canvas,
      canvas.width,
      canvas.height,
      containerWidth,
      containerHeight,
      nextZoom
    );
    setDisplayScale(scale);
  };

  return {
    fabricCanvasRef,
    bgImageElementRef,
    bgFabricObjectRef,
    displayScale,
    setDisplayScale,
    editorZoom,
    setEditorZoom,
    initializeImageCanvas,
    fitCanvasToEditor,
    handleZoom,
  };
}
