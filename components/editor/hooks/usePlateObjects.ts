'use client';

import { useState } from 'react';
import { Canvas, FabricImage } from 'fabric';
import { PlateOptions, PlateGeometry, PlatePreset, ImageMetadata } from '../../../types';
import { renderFlatPlateCanvas } from '../../../lib/exportHelpers';

interface UsePlateObjectsProps {
  fabricCanvasRef: React.MutableRefObject<Canvas | null>;
  imageMetadata: ImageMetadata | null;
  pushToHistory: () => void;
  isPreviewActive: boolean;
  handleTogglePreview: (active: boolean) => void;
}

export function usePlateObjects({
  fabricCanvasRef,
  imageMetadata,
  pushToHistory,
  isPreviewActive,
  handleTogglePreview,
}: UsePlateObjectsProps) {
  const [activeObject, setActiveObject] = useState<any | null>(null);
  const [activeGeometry, setActiveGeometry] = useState<PlateGeometry | null>(null);

  const [plateOptions, setPlateOptions] = useState<PlateOptions>({
    text: 'THENNAKOON\nTOURS',
    backgroundColor: '#8B0000', // Maroon
    textColor: '#FFFFFF',
    borderColor: '#FFFFFF',
    borderWidth: 2.5,
    cornerRadius: 6,
    opacity: 1.0,
    rotation: 0,
    shadow: true,
  });

  const assertPlateVisible = (plate: any) => {
    const canvas = fabricCanvasRef.current;
    if (!canvas || !plate) return;
    if (!plate.visible || plate.opacity <= 0 || !canvas.contains(plate)) {
      plate.set({
        visible: true,
        opacity: plate.plateOptions?.opacity ?? 1.0,
      });
      if (!canvas.contains(plate)) {
        canvas.add(plate);
      }
      canvas.requestRenderAll();
    }
  };

  const updateGeometryState = (obj?: any) => {
    const target = obj || (fabricCanvasRef.current ? fabricCanvasRef.current.getActiveObject() : null);
    if (target && target.isNamePlate) {
      setActiveGeometry({
        left: Math.round(target.left),
        top: Math.round(target.top),
        width: Math.round(target.width * target.scaleX),
        height: Math.round(target.height * target.scaleY),
        rotation: Math.round(target.angle || 0),
      });
    } else {
      setActiveGeometry(null);
    }
  };

  const createBrandedPlateAt = (
    cx: number,
    cy: number,
    w: number,
    h: number,
    angle = 0
  ) => {
    const canvas = fabricCanvasRef.current;
    if (!canvas || !imageMetadata) return;

    const id = 'plate_' + Math.random().toString(36).substring(2, 11);
    const flatCanvas = renderFlatPlateCanvas(plateOptions, imageMetadata.width, imageMetadata.height);

    const plate = new FabricImage(flatCanvas, {
      left: cx,
      top: cy,
      originX: 'center',
      originY: 'center',
      opacity: 1.0, // Phase D: opacity = 1
      angle: angle,
      selectable: true, // Phase D: selectable = true
      evented: true, // Phase D: evented = true
      transparentCorners: false,
      cornerColor: '#8B0000',
      cornerStrokeColor: '#FFFFFF',
      borderColor: '#8B0000',
      cornerSize: 12,
      visible: true, // Phase D: visible = true
    });

    const flatW = flatCanvas.width;
    const flatH = flatCanvas.height;

    // Use independent scaleX and scaleY to cover selected area completely (Phase D)
    plate.set({
      scaleX: w / flatW,
      scaleY: h / flatH,
    });

    (plate as any).id = id;
    (plate as any).isNamePlate = true;
    (plate as any).plateMode = 'standard';
    (plate as any).plateOptions = { ...plateOptions, rotation: angle, opacity: 1.0 };
    (plate as any).corners = null;

    canvas.add(plate);
    canvas.setActiveObject(plate); // Phase D: setActiveObject(plate)
    assertPlateVisible(plate);

    canvas.requestRenderAll(); // Phase D: requestRenderAll()
    updateGeometryState(plate);
    pushToHistory();
  };

  const handleAddPlate = () => {
    const canvas = fabricCanvasRef.current;
    if (!canvas || !imageMetadata) return;

    if (isPreviewActive) handleTogglePreview(false);

    // Standard default dimensions (around 30% width, scaled)
    const baseW = Math.max(200, Math.round(imageMetadata.width * 0.3));
    const baseH = Math.max(60, Math.round(baseW * 0.28));

    createBrandedPlateAt(
      imageMetadata.width / 2,
      imageMetadata.height / 2,
      baseW,
      baseH,
      plateOptions.rotation
    );
  };

  const handlePlateOptionsChange = (updated: Partial<PlateOptions>) => {
    const canvas = fabricCanvasRef.current;
    if (!canvas || !imageMetadata) return;

    setPlateOptions((prev) => {
      const next = { ...prev, ...updated };

      if (activeObject && activeObject.isNamePlate) {
        activeObject.plateOptions = { ...activeObject.plateObject?.plateOptions, ...updated };

        const flatCanvas = renderFlatPlateCanvas(activeObject.plateOptions, imageMetadata.width, imageMetadata.height);
        
        // Retain current visual scaling when updating text or colors
        const currentScaleX = activeObject.scaleX;
        const currentScaleY = activeObject.scaleY;

        activeObject.setElement(flatCanvas);
        
        activeObject.set({
          scaleX: currentScaleX,
          scaleY: currentScaleY,
        });

        if (updated.rotation !== undefined) {
          activeObject.set({ angle: updated.rotation });
        }
        if (updated.opacity !== undefined) {
          activeObject.set({ opacity: updated.opacity });
        }

        assertPlateVisible(activeObject);
        canvas.renderAll();
      }

      return next;
    });
  };

  const handleApplyPlatePreset = (preset: PlatePreset) => {
    handlePlateOptionsChange({
      backgroundColor: preset.backgroundColor,
      textColor: preset.textColor,
      borderColor: preset.borderColor,
    });
  };

  const handleDuplicatePlate = () => {
    const canvas = fabricCanvasRef.current;
    if (!canvas || !activeObject || !activeObject.isNamePlate || !imageMetadata) return;

    const id = 'plate_' + Math.random().toString(36).substring(2, 11);
    const options = { ...activeObject.plateOptions };
    const flatCanvas = renderFlatPlateCanvas(options, imageMetadata.width, imageMetadata.height);

    const clone = new FabricImage(flatCanvas, {
      left: activeObject.left + 40,
      top: activeObject.top + 40,
      opacity: activeObject.opacity,
      angle: activeObject.angle,
      scaleX: activeObject.scaleX,
      scaleY: activeObject.scaleY,
      selectable: true,
      hasControls: true,
      hasBorders: true,
      transparentCorners: false,
      cornerColor: '#8B0000',
      cornerStrokeColor: '#FFFFFF',
      borderColor: '#8B0000',
      cornerSize: 12,
    });

    (clone as any).id = id;
    (clone as any).isNamePlate = true;
    (clone as any).plateMode = 'standard';
    (clone as any).plateOptions = options;
    (clone as any).corners = null;

    canvas.add(clone);
    canvas.setActiveObject(clone);
    assertPlateVisible(clone);

    canvas.renderAll();
    pushToHistory();
  };

  const handleDeleteSelected = (onWatermarkDelete: () => void) => {
    const canvas = fabricCanvasRef.current;
    if (!canvas) return;

    const active = canvas.getActiveObject();
    if (active) {
      if ((active as any).isWatermark) {
        onWatermarkDelete();
      } else {
        canvas.remove(active);
        canvas.discardActiveObject();
        canvas.renderAll();
        pushToHistory();
      }
    }
  };

  const handleNudge = (action: string) => {
    const canvas = fabricCanvasRef.current;
    if (!canvas || !activeObject) return;

    const step = 5; // standard 5px step
    const scaleStep = 1.03; // 3% scaling step
    const rotateStep = 3; // 3 degrees rotation step

    if (action === 'left') {
      activeObject.set({ left: activeObject.left - step });
    } else if (action === 'right') {
      activeObject.set({ left: activeObject.left + step });
    } else if (action === 'up') {
      activeObject.set({ top: activeObject.top - step });
    } else if (action === 'down') {
      activeObject.set({ top: activeObject.top + step });
    } else if (action === 'wider') {
      activeObject.set({ scaleX: activeObject.scaleX * scaleStep });
    } else if (action === 'narrower') {
      activeObject.set({ scaleX: activeObject.scaleX / scaleStep });
    } else if (action === 'taller') {
      activeObject.set({ scaleY: activeObject.scaleY * scaleStep });
    } else if (action === 'shorter') {
      activeObject.set({ scaleY: activeObject.scaleY / scaleStep });
    } else if (action === 'rotate-left') {
      activeObject.set({ angle: (activeObject.angle || 0) - rotateStep });
    } else if (action === 'rotate-right') {
      activeObject.set({ angle: (activeObject.angle || 0) + rotateStep });
    }

    activeObject.setCoords();
    canvas.renderAll();
    updateGeometryState(activeObject);
    pushToHistory();
  };

  const handleUpdateGeometry = (geom: Partial<PlateGeometry>) => {
    const canvas = fabricCanvasRef.current;
    if (!canvas || !activeObject) return;

    if (geom.left !== undefined) activeObject.set({ left: geom.left });
    if (geom.top !== undefined) activeObject.set({ top: geom.top });
    if (geom.rotation !== undefined) activeObject.set({ angle: geom.rotation });

    if (geom.width !== undefined) {
      const baseW = activeObject.width || 1200;
      activeObject.set({ scaleX: geom.width / baseW });
    }
    if (geom.height !== undefined) {
      const baseH = activeObject.height || 400;
      activeObject.set({ scaleY: geom.height / baseH });
    }

    activeObject.setCoords();
    canvas.renderAll();
    updateGeometryState(activeObject);
    pushToHistory();
  };

  return {
    activeObject,
    setActiveObject,
    activeGeometry,
    setActiveGeometry,
    plateOptions,
    setPlateOptions,
    createBrandedPlateAt,
    handleAddPlate,
    handlePlateOptionsChange,
    handleApplyPlatePreset,
    handleDuplicatePlate,
    handleDeleteSelected,
    handleNudge,
    handleUpdateGeometry,
    updateGeometryState,
  };
}
