'use client';

import React, { useEffect, useRef, useState } from 'react';
import { Canvas, FabricImage, Group, Circle, Line, Point as FabricPoint } from 'fabric';
import {
  ImageMetadata,
  PlateOptions,
  WatermarkOptions,
  ExportPreset,
  ExportFormat,
  ExportQuality,
  FitMethod,
  PLATE_PRESETS,
  PlatePreset,
  WatermarkPosition,
  PlateMode,
  Point,
} from '../../types';
import {
  createNamePlate,
  updatePlateProperties,
  getWatermarkCoords,
  fitDimensions,
} from '../../lib/canvasHelpers';
import { generateExportDataUrl, renderFlatPlateCanvas } from '../../lib/exportHelpers';
import { warpCanvasPerspective, isConvex } from '../../lib/perspectiveWarp';
import ImageUploader from '../ImageUploader';
import EditorToolbar from '../EditorToolbar';
import PlateSettings from '../PlateSettings';
import WatermarkSettings from '../WatermarkSettings';
import ExportPanel from '../ExportPanel';
import BeforeAfterToggle from '../BeforeAfterToggle';
import ConfirmDialog from '../ConfirmDialog';
import { Eye, ShieldCheck, Palette, Image as ImageIcon, Download, RefreshCw, ZoomIn, ZoomOut } from 'lucide-react';

interface SavedPlateState {
  id: string;
  plateMode: PlateMode;
  plateOptions: PlateOptions;
  corners: Point[] | null;
  left: number;
  top: number;
  scaleX: number;
  scaleY: number;
  angle: number;
  opacity: number;
}

interface SavedCanvasState {
  plates: SavedPlateState[];
  watermark: {
    visible: boolean;
    opacity: number;
    scale: number;
    position: WatermarkPosition;
    customLogoUrl: string | null;
    left: number;
    top: number;
    scaleX: number;
    scaleY: number;
    angle: number;
  };
}

export default function BrandingEditorClient() {
  // Image Upload State
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [imageMetadata, setImageMetadata] = useState<ImageMetadata | null>(null);

  // Canvas Refs & Instances
  const canvasElRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const fabricCanvasRef = useRef<Canvas | null>(null);
  const bgImageElementRef = useRef<HTMLImageElement | null>(null);
  const bgFabricObjectRef = useRef<FabricImage | null>(null);
  const watermarkFabricObjectRef = useRef<FabricImage | null>(null);

  // Perspective Controls Refs
  const handlesRef = useRef<Circle[]>([]);
  const linesRef = useRef<Line[]>([]);
  const originalCornersRef = useRef<Point[] | null>(null);

  // Active object selection tracker
  const [activeObject, setActiveObject] = useState<any | null>(null);

  // Watermark Status
  const [logoError, setLogoError] = useState<string | null>(null);
  const [isWatermarkManual, setIsWatermarkManual] = useState(false);

  // Settings states
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

  const [watermarkOptions, setWatermarkOptions] = useState<WatermarkOptions>({
    visible: true,
    opacity: 1.0,
    scale: 0.18, // 18% of original image width by default (Part 5)
    position: 'bottom-left',
    customLogoUrl: null,
  });

  // Perspective Adjust States
  const [selectedPlateMode, setSelectedPlateMode] = useState<PlateMode>('standard');
  const [isAdjustingPerspective, setIsAdjustingPerspective] = useState<boolean>(false);
  const [activeCornerIndex, setActiveCornerIndex] = useState<number | null>(null);
  const [hasSavedShape, setHasSavedShape] = useState<boolean>(false);

  // Magnifier States (Circular zoom view for corner alignment)
  const [magnifierCoords, setMagnifierCoords] = useState<{ x: number; y: number; clientX: number; clientY: number } | null>(null);
  const magnifierCanvasRef = useRef<HTMLCanvasElement>(null);

  // UI Tabs & Zoom states
  const [activeTab, setActiveTab] = useState<'plates' | 'watermark' | 'export'>('plates');
  const [displayScale, setDisplayScale] = useState<number>(1.0); // fitScale (displayWidth / originalWidth)
  const [editorZoom, setEditorZoom] = useState<number>(1.0); // Viewport Zoom (fitted scale multiplier)
  
  const [isPreviewActive, setIsPreviewActive] = useState<boolean>(false);
  const [isConfirmResetOpen, setIsConfirmResetOpen] = useState<boolean>(false);
  const [isExporting, setIsExporting] = useState<boolean>(false);

  // Export Settings
  const [exportPreset, setExportPreset] = useState<ExportPreset>('original');
  const [exportFormat, setExportFormat] = useState<ExportFormat>('jpeg');
  const [exportQuality, setExportQuality] = useState<ExportQuality>(0.90);
  const [exportFitMethod, setExportFitMethod] = useState<FitMethod>('fit');
  const [exportBgColor, setExportBgColor] = useState<string>('#FFFFFF');
  const [exportCount, setExportCount] = useState<number>(1);

  // History Stacks
  const [undoStack, setUndoStack] = useState<SavedCanvasState[]>([]);
  const [redoStack, setRedoStack] = useState<SavedCanvasState[]>([]);
  const isSyncingRef = useRef(false);

  // ==================================================
  // 8. DEVELOPMENT SAFETY INVARIANT ASSERTION
  // ==================================================
  const assertPlateVisible = (plate: any) => {
    const canvas = fabricCanvasRef.current;
    if (!canvas || !plate) return;
    if (!plate.visible || plate.opacity <= 0 || !canvas.contains(plate)) {
      console.error('Perspective plate visibility invariant failed', {
        id: plate.id,
        visible: plate.visible,
        opacity: plate.opacity,
        inCanvas: canvas.contains(plate),
      });
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

  // Local Session Perspective Shape Persistence
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('thennakoon_last_shape');
      if (saved) {
        setHasSavedShape(true);
      }
    }
  }, []);

  // Clean up Object URL
  const clearImageUrl = () => {
    if (imageUrl) {
      URL.revokeObjectURL(imageUrl);
    }
    setImageUrl(null);
    setImageMetadata(null);
    bgImageElementRef.current = null;
    bgFabricObjectRef.current = null;
    watermarkFabricObjectRef.current = null;
    handlesRef.current = [];
    linesRef.current = [];
    originalCornersRef.current = null;
    setActiveObject(null);
    setUndoStack([]);
    setRedoStack([]);
    setDisplayScale(1.0);
    setEditorZoom(1.0);
    setIsPreviewActive(false);
    setIsWatermarkManual(false);
    setIsAdjustingPerspective(false);
    setActiveCornerIndex(null);
    setMagnifierCoords(null);
  };

  // Handle image load from uploader
  const handleImageLoaded = (url: string, metadata: ImageMetadata) => {
    clearImageUrl();
    setImageUrl(url);
    setImageMetadata(metadata);
  };

  // Fetch / Load Logo file and return HTMLImageElement
  const loadLogoImage = (url: string): Promise<HTMLImageElement> => {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = () => resolve(img);
      img.onerror = (e) => reject(e);
      img.src = url;
    });
  };

  // Create CanvasState snapshot for Undo/Redo (all coordinates strictly in 1:1 original space!)
  const captureCanvasStateSnapshot = (): SavedCanvasState | null => {
    const canvas = fabricCanvasRef.current;
    if (!canvas) return null;

    const plates = canvas.getObjects()
      .filter((obj: any) => obj.isNamePlate)
      .map((obj: any) => {
        return {
          id: obj.id,
          plateMode: obj.plateMode || 'standard',
          plateOptions: { ...obj.plateOptions },
          corners: obj.corners ? obj.corners.map((p: any) => ({ x: p.x, y: p.y })) : null,
          left: obj.left,
          top: obj.top,
          scaleX: obj.scaleX,
          scaleY: obj.scaleY,
          angle: obj.angle,
          opacity: obj.opacity || 1.0,
        };
      });

    const wm = watermarkFabricObjectRef.current;
    return {
      plates,
      watermark: {
        visible: watermarkOptions.visible,
        opacity: watermarkOptions.opacity,
        scale: watermarkOptions.scale,
        position: watermarkOptions.position,
        customLogoUrl: watermarkOptions.customLogoUrl,
        left: wm?.left || 0,
        top: wm?.top || 0,
        scaleX: wm?.scaleX || 1,
        scaleY: wm?.scaleY || 1,
        angle: wm?.angle || 0,
      },
    };
  };

  // Push to Undo history
  const pushToHistory = (stateSnapshot?: SavedCanvasState) => {
    if (isSyncingRef.current) return;
    const snap = stateSnapshot || captureCanvasStateSnapshot();
    if (!snap) return;

    setUndoStack((prev) => {
      const last = prev[prev.length - 1];
      if (last && JSON.stringify(last) === JSON.stringify(snap)) {
        return prev;
      }
      return [...prev, snap];
    });
    setRedoStack([]);
  };

  // Re-sync active canvas elements to a saved snapshot
  const applyCanvasState = async (snap: SavedCanvasState) => {
    const canvas = fabricCanvasRef.current;
    if (!canvas || !imageMetadata) return;

    isSyncingRef.current = true;

    try {
      clearPerspectiveHandles(canvas);
      setIsAdjustingPerspective(false);
      setMagnifierCoords(null);

      // 1. Watermark Settings
      setWatermarkOptions((prev) => ({
        ...prev,
        visible: snap.watermark.visible,
        opacity: snap.watermark.opacity,
        scale: snap.watermark.scale,
        position: snap.watermark.position,
        customLogoUrl: snap.watermark.customLogoUrl,
      }));

      const wm = watermarkFabricObjectRef.current;
      if (wm) {
        wm.set({
          visible: snap.watermark.visible && !isPreviewActive,
          opacity: snap.watermark.opacity,
          left: snap.watermark.left,
          top: snap.watermark.top,
          scaleX: snap.watermark.scaleX,
          scaleY: snap.watermark.scaleY,
          angle: snap.watermark.angle,
        });
        wm.setCoords();
      }

      // 2. Name Plates Restoration
      // Clean all existing name plates
      const existingPlates = canvas.getObjects().filter((obj: any) => obj.isNamePlate);
      existingPlates.forEach((p) => canvas.remove(p));

      // Recreate them from snapshot as single persistent objects
      for (const plateState of snap.plates) {
        let plateObj: FabricImage;

        if (plateState.plateMode === 'standard') {
          const flatCanvas = renderFlatPlateCanvas(plateState.plateOptions, imageMetadata.width, imageMetadata.height);
          plateObj = new FabricImage(flatCanvas, {
            left: plateState.left,
            top: plateState.top,
            scaleX: plateState.scaleX,
            scaleY: plateState.scaleY,
            angle: plateState.angle,
            opacity: plateState.opacity,
            visible: !isPreviewActive,
            selectable: !isPreviewActive,
            evented: !isPreviewActive,
            transparentCorners: false,
            cornerColor: '#8B0000',
            cornerStrokeColor: '#FFFFFF',
            borderColor: '#8B0000',
            cornerSize: 12,
          });
        } else {
          const flatCanvas = renderFlatPlateCanvas(plateState.plateOptions, imageMetadata.width, imageMetadata.height);
          const warpedCanvas = warpCanvasPerspective(flatCanvas, plateState.corners!);
          
          const minX = Math.min(...plateState.corners!.map((p) => p.x));
          const minY = Math.min(...plateState.corners!.map((p) => p.y));

          plateObj = new FabricImage(warpedCanvas, {
            left: minX,
            top: minY,
            opacity: plateState.opacity,
            selectable: !isPreviewActive,
            evented: !isPreviewActive,
            hasControls: false,
            hasBorders: true,
            originX: 'left',
            originY: 'top',
            visible: !isPreviewActive,
          });

          (plateObj as any).corners = plateState.corners!.map((p) => ({ ...p }));
          (plateObj as any).lastLeft = minX;
          (plateObj as any).lastTop = minY;

          // Re-bind moving listeners
          plateObj.on('moving', () => {
            const dx = plateObj.left - (plateObj as any).lastLeft;
            const dy = plateObj.top - (plateObj as any).lastTop;
            (plateObj as any).lastLeft = plateObj.left;
            (plateObj as any).top = plateObj.top;
            (plateObj as any).corners = (plateObj as any).corners.map((p: Point) => ({
              x: p.x + dx,
              y: p.y + dy,
            }));
          });

          plateObj.on('modified', () => {
            pushToHistory();
          });
        }

        (plateObj as any).id = plateState.id;
        (plateObj as any).isNamePlate = true;
        (plateObj as any).plateMode = plateState.plateMode;
        (plateObj as any).plateOptions = { ...plateState.plateOptions };

        canvas.add(plateObj);
        assertPlateVisible(plateObj);
      }

      // Re-trigger selection properties update
      const currentActive = canvas.getActiveObject();
      if (currentActive) {
        handleSelectionChange(currentActive);
      }

      canvas.renderAll();
    } catch (err) {
      console.error('Error applying canvas state:', err);
    } finally {
      isSyncingRef.current = false;
    }
  };

  const handleUndo = () => {
    if (undoStack.length <= 1) return;
    const current = undoStack[undoStack.length - 1];
    const prev = undoStack[undoStack.length - 2];
    setUndoStack((prevStack) => prevStack.slice(0, -1));
    setRedoStack((prevStack) => [...prevStack, current]);
    applyCanvasState(prev);
  };

  const handleRedo = () => {
    if (redoStack.length === 0) return;
    const next = redoStack[redoStack.length - 1];
    setRedoStack((prevStack) => prevStack.slice(0, -1));
    setUndoStack((prevStack) => [...prevStack, next]);
    applyCanvasState(next);
  };

  // ==================================================
  // 1. INITIALIZE CANVAS WITH ORIGINAL COORDINATES
  // ==================================================
  const initializeImageCanvas = (bgImage: HTMLImageElement): Canvas => {
    const originalWidth = bgImage.naturalWidth;
    const originalHeight = bgImage.naturalHeight;

    if (fabricCanvasRef.current) {
      fabricCanvasRef.current.dispose();
    }

    const canvas = new Canvas(canvasElRef.current!, {
      width: originalWidth,
      height: originalHeight,
      enableRetinaScaling: false,
      selectionColor: 'rgba(128, 0, 0, 0.15)',
      selectionBorderColor: '#8B0000',
      selectionLineWidth: 1.5,
    });
    
    fabricCanvasRef.current = canvas;

    // ==================================================
    // 2. LOAD BACKGROUND PHOTO AT 1:1 scale
    // ==================================================
    const fabricBg = new FabricImage(bgImage, {
      left: 0,
      top: 0,
      originX: 'left',
      originY: 'top',
      scaleX: 1,
      scaleY: 1,
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

    const imageScaleX = originalWidth / fabricBg.width;
    const imageScaleY = originalHeight / fabricBg.height;
    fabricBg.set({ scaleX: imageScaleX, scaleY: imageScaleY });

    bgFabricObjectRef.current = fabricBg;
    canvas.add(fabricBg);
    canvas.sendObjectToBack(fabricBg);

    return canvas;
  };

  // ==================================================
  // 3. DISPLAY-SCALE THE CANVAS ELEMENTS VIA CSS
  // ==================================================
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

  // ==================================================
  // 7. POSITION WATERMARK LOGO AT ORIGINAL RESOLUTION
  // ==================================================
  const addDefaultWatermark = async (
    canvas: Canvas,
    originalWidth: number,
    originalHeight: number,
    customUrl?: string
  ) => {
    setLogoError(null);
    const logoUrl = customUrl || watermarkOptions.customLogoUrl || '/branding/thennakoon-tours-logo.png';

    try {
      const logoImg = await loadLogoImage(logoUrl);

      if (watermarkFabricObjectRef.current) {
        canvas.remove(watermarkFabricObjectRef.current);
      }

      const targetLogoWidth = originalWidth * 0.18;
      const logoScale = targetLogoWidth / logoImg.naturalWidth;

      const wm = new FabricImage(logoImg, {
        scaleX: logoScale,
        scaleY: logoScale,
        left: originalWidth * 0.03,
        top: originalHeight - (logoImg.naturalHeight * logoScale) - (originalWidth * 0.03),
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

  // ==================================================
  // 9. EXPORT INDEPENDENT ORIGINAL-SIZE DATA URL
  // ==================================================
  const exportOriginalImage = (): string | null => {
    const canvas = fabricCanvasRef.current;
    if (!canvas || !imageMetadata) return null;

    const active = canvas.getActiveObject();
    const isAdjustingBefore = isAdjustingPerspective;

    if (isAdjustingBefore) {
      clearPerspectiveHandles(canvas);
    }

    canvas.discardActiveObject();
    canvas.renderAll();

    const dataUrl = canvas.toDataURL({
      format: exportFormat === 'jpeg' ? 'jpeg' : 'png',
      quality: exportFormat === 'jpeg' ? exportQuality : undefined,
      multiplier: 1.0,
    });

    if (active) {
      canvas.setActiveObject(active);
      if (isAdjustingBefore && (active as any).isNamePlate && (active as any).plateMode === 'perspective') {
        renderPerspectiveHandles(canvas, active);
      }
    }
    canvas.renderAll();

    return dataUrl;
  };

  // Main Canvas Setup Lifecycle Hook (Non-destructive: initialization runs strictly once!)
  useEffect(() => {
    if (!imageUrl || !canvasElRef.current || !containerRef.current) return;

    const bgImage = new Image();

    bgImage.onload = async () => {
      bgImageElementRef.current = bgImage;
      const originalWidth = bgImage.naturalWidth;
      const originalHeight = bgImage.naturalHeight;

      // 1. Initialize Canvas
      const canvas = initializeImageCanvas(bgImage);

      // 2. Fit display scaling via CSS
      const containerWidth = containerRef.current?.clientWidth || 800;
      const containerHeight = Math.min(500, window.innerHeight * 0.5);

      const fitScale = fitCanvasToEditor(
        canvas,
        originalWidth,
        originalHeight,
        containerWidth,
        containerHeight,
        editorZoom
      );
      setDisplayScale(fitScale);

      // Diagnostics Log
      console.log('Canvas Diagnostics:', {
        naturalImageWidth: originalWidth,
        naturalImageHeight: originalHeight,
        fabricImageWidth: bgFabricObjectRef.current?.width,
        fabricImageHeight: bgFabricObjectRef.current?.height,
        logicalCanvasWidth: canvas.width,
        logicalCanvasHeight: canvas.height,
        containerWidth,
        containerHeight,
        fitScale,
        lowerCanvasInternalWidth: canvas.lowerCanvasEl?.width,
        lowerCanvasInternalHeight: canvas.lowerCanvasEl?.height,
        lowerCanvasCssWidth: canvas.lowerCanvasEl?.style.width,
        lowerCanvasCssHeight: canvas.lowerCanvasEl?.style.height,
        upperCanvasCssWidth: canvas.upperCanvasEl?.style.width,
        upperCanvasCssHeight: canvas.upperCanvasEl?.style.height,
      });

      // 3. Load Watermark
      await addDefaultWatermark(canvas, originalWidth, originalHeight);

      // 4. Register Event Listeners
      canvas.on('selection:created', (e) => {
        const target = e.selected ? e.selected[0] : null;
        handleSelectionChange(target);
      });
      canvas.on('selection:updated', (e) => {
        const target = e.selected ? e.selected[0] : null;
        handleSelectionChange(target);
      });
      canvas.on('selection:cleared', () => {
        handleSelectionChange(null);
      });

      // Save initial state
      const initialSnap = captureCanvasStateSnapshot();
      if (initialSnap) {
        setUndoStack([initialSnap]);
      }

      canvas.renderAll();
    };

    bgImage.src = imageUrl;

    const observer = new ResizeObserver((entries) => {
      if (entries.length === 0 || !fabricCanvasRef.current || !bgImageElementRef.current) return;
      const fCanvas = fabricCanvasRef.current;
      const bgImg = bgImageElementRef.current;

      const containerWidth = entries[0].contentRect.width || 800;
      const containerHeight = Math.min(500, window.innerHeight * 0.5);

      const scale = fitCanvasToEditor(
        fCanvas,
        bgImg.naturalWidth,
        bgImg.naturalHeight,
        containerWidth,
        containerHeight,
        editorZoom
      );
      setDisplayScale(scale);
    });

    observer.observe(containerRef.current);

    return () => {
      observer.disconnect();
      if (fabricCanvasRef.current) {
        fabricCanvasRef.current.dispose();
      }
      fabricCanvasRef.current = null;
    };
  }, [imageUrl]); // Excluded editorZoom to prevent canvas disposes during zooming operations (Section 10)

  // Sync selection change to settings panel (Section 2: Selection must NOT trigger Perspective conversion!)
  const handleSelectionChange = (target: any) => {
    setActiveObject(target);

    if (target && target.isNamePlate) {
      const options = target.plateOptions;
      setSelectedPlateMode(target.plateMode || 'standard');
      
      setPlateOptions({
        text: options.text,
        backgroundColor: options.backgroundColor,
        textColor: options.textColor,
        borderColor: options.borderColor,
        borderWidth: options.borderWidth,
        cornerRadius: options.cornerRadius,
        opacity: target.opacity || 1.0,
        rotation: target.angle || 0,
        shadow: options.shadow,
      });

      setActiveTab('plates');

      // Sync and assert plate visibility remains true (Section 1 & 8)
      assertPlateVisible(target);

      // Re-draw handles only if adjusting perspective previously
      if (target.plateMode === 'perspective' && isAdjustingPerspective) {
        renderPerspectiveHandles(fabricCanvasRef.current!, target);
      } else {
        clearPerspectiveHandles(fabricCanvasRef.current!);
        setIsAdjustingPerspective(false);
      }
    } else if (target && target.isWatermark) {
      setActiveTab('watermark');
      clearPerspectiveHandles(fabricCanvasRef.current!);
      setIsAdjustingPerspective(false);
    } else {
      clearPerspectiveHandles(fabricCanvasRef.current!);
      setIsAdjustingPerspective(false);
      setActiveCornerIndex(null);
      setMagnifierCoords(null);
    }
  };

  // Action: Add Name Plate (placed at center of original photo coordinate space)
  const handleAddPlate = () => {
    const canvas = fabricCanvasRef.current;
    if (!canvas || !imageMetadata) return;

    if (isPreviewActive) handleTogglePreview(false);

    const flatCanvas = renderFlatPlateCanvas(plateOptions, imageMetadata.width, imageMetadata.height);
    const id = 'plate_' + Math.random().toString(36).substring(2, 11);

    const plate = new FabricImage(flatCanvas, {
      left: imageMetadata.width / 2,
      top: imageMetadata.height / 2,
      originX: 'center',
      originY: 'center',
      opacity: plateOptions.opacity,
      angle: plateOptions.rotation,
      selectable: true,
      hasControls: true,
      hasBorders: true,
      transparentCorners: false,
      cornerColor: '#8B0000',
      cornerStrokeColor: '#FFFFFF',
      borderColor: '#8B0000',
      cornerSize: 12,
    });

    (plate as any).id = id;
    (plate as any).isNamePlate = true;
    (plate as any).plateMode = 'standard';
    (plate as any).plateOptions = { ...plateOptions };
    (plate as any).corners = null;

    canvas.add(plate);
    canvas.setActiveObject(plate);
    canvas.renderAll();

    assertPlateVisible(plate);
    pushToHistory();
  };

  // Action: Edit plate options
  const handlePlateOptionsChange = (updated: Partial<PlateOptions>) => {
    const canvas = fabricCanvasRef.current;
    if (!canvas || !imageMetadata) return;

    setPlateOptions((prev) => {
      const next = { ...prev, ...updated };

      if (activeObject && activeObject.isNamePlate) {
        activeObject.plateOptions = { ...activeObject.plateOptions, ...updated };

        if (activeObject.plateMode === 'standard') {
          const flatCanvas = renderFlatPlateCanvas(activeObject.plateOptions, imageMetadata.width, imageMetadata.height);
          activeObject.setElement(flatCanvas);
          
          if (updated.rotation !== undefined) {
            activeObject.set({ angle: updated.rotation });
          }
          if (updated.opacity !== undefined) {
            activeObject.set({ opacity: updated.opacity });
          }
        } else {
          // Perspective Warp Update in-place on persistent object (Section 3 & 4)
          const flatCanvas = renderFlatPlateCanvas(activeObject.plateOptions, imageMetadata.width, imageMetadata.height);
          try {
            const warpedCanvas = warpCanvasPerspective(flatCanvas, activeObject.corners);
            activeObject.setElement(warpedCanvas);
          } catch (e) {
            console.error('Warp failed on option change:', e);
          }
          if (updated.opacity !== undefined) {
            activeObject.set({ opacity: updated.opacity });
          }
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

  // Change watermark settings
  const handleWatermarkOptionsChange = (updated: Partial<WatermarkOptions>) => {
    const canvas = fabricCanvasRef.current;
    const wm = watermarkFabricObjectRef.current;
    if (!canvas || !wm || !imageMetadata) return;

    setWatermarkOptions((prev) => {
      const next = { ...prev, ...updated };

      if (updated.position && updated.position !== prev.position) {
        setIsWatermarkManual(false);
        const { left, top, scale } = getWatermarkCoords(
          wm.width,
          wm.height,
          imageMetadata.width,
          imageMetadata.height,
          next
        );
        wm.set({ left, top, scaleX: scale, scaleY: scale });
      }

      if (updated.scale !== undefined && updated.scale !== prev.scale) {
        setIsWatermarkManual(false);
        const { left, top, scale } = getWatermarkCoords(
          wm.width,
          wm.height,
          imageMetadata.width,
          imageMetadata.height,
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

  // Custom watermark file uploaded
  const handleUploadCustomLogo = (url: string) => {
    const canvas = fabricCanvasRef.current;
    if (!canvas || !imageMetadata) return;

    setWatermarkOptions((prev) => ({
      ...prev,
      customLogoUrl: url,
      visible: true,
    }));

    addDefaultWatermark(canvas, imageMetadata.width, imageMetadata.height, url).then(() => {
      pushToHistory();
    });
  };

  const handleClearCustomLogo = () => {
    const canvas = fabricCanvasRef.current;
    if (!canvas || !imageMetadata) return;

    if (watermarkOptions.customLogoUrl) {
      URL.revokeObjectURL(watermarkOptions.customLogoUrl);
    }

    setWatermarkOptions((prev) => ({
      ...prev,
      customLogoUrl: null,
    }));

    addDefaultWatermark(canvas, imageMetadata.width, imageMetadata.height, '/branding/thennakoon-tours-logo.png').then(() => {
      pushToHistory();
    });
  };

  // ==================================================
  // VERSION 2 - PERSPECTIVE SHAPE CONTROLS & EVENT BINDINGS
  // ==================================================
  
  // Helper to extract 4 transformed corner points from standard plate bounding box
  const getPlateCorners = (obj: any): Point[] => {
    const cx = obj.left;
    const cy = obj.top;
    const w = obj.width * obj.scaleX;
    const h = obj.height * obj.scaleY;
    const angleRad = (obj.angle || 0) * Math.PI / 180;
    const cos = Math.cos(angleRad);
    const sin = Math.sin(angleRad);

    const getRotatedPoint = (rx: number, ry: number) => ({
      x: cx + rx * cos - ry * sin,
      y: cy + rx * sin + ry * cos,
    });

    return [
      getRotatedPoint(-w / 2, -h / 2), // TL
      getRotatedPoint(w / 2, -h / 2),  // TR
      getRotatedPoint(w / 2, h / 2),   // BR
      getRotatedPoint(-w / 2, h / 2),  // BL
    ];
  };

  // ==================================================
  // 3. PERSISTENT SINGLE VISIBLE OBJECT TRANSITION (NON-DESTRUCTIVE)
  // ==================================================
  const handlePlateModeChange = (mode: PlateMode) => {
    const canvas = fabricCanvasRef.current;
    if (!canvas || !activeObject || !activeObject.isNamePlate || !imageMetadata) return;

    if (mode === activeObject.plateMode) return;

    isSyncingRef.current = true;

    try {
      if (mode === 'perspective') {
        // Switch standard flat plate to perspective warped in-place on same object
        const corners = getPlateCorners(activeObject);

        const flatCanvas = renderFlatPlateCanvas(activeObject.plateOptions, imageMetadata.width, imageMetadata.height);
        let warpedCanvas: HTMLCanvasElement;
        try {
          warpedCanvas = warpCanvasPerspective(flatCanvas, corners);
        } catch (err) {
          console.error('Initial warp failed:', err);
          alert('Perspective preview could not be created. Please ensure the plate is flat and visible.');
          isSyncingRef.current = false;
          return;
        }

        const minX = Math.min(...corners.map((p) => p.x));
        const minY = Math.min(...corners.map((p) => p.y));

        // Update the existing activeObject in-place! No visibility changes, no deletions!
        activeObject.setElement(warpedCanvas);
        activeObject.corners = corners;
        activeObject.plateMode = 'perspective';
        
        activeObject.set({
          left: minX,
          top: minY,
          scaleX: 1.0,
          scaleY: 1.0,
          angle: 0,
          originX: 'left',
          originY: 'top',
          hasControls: false,
          hasBorders: true,
        });

        // Initialize move listener if not already bound
        if (!activeObject.hasMovingListener) {
          activeObject.lastLeft = minX;
          activeObject.lastTop = minY;
          
          activeObject.on('moving', () => {
            const dx = activeObject.left - activeObject.lastLeft;
            const dy = activeObject.top - activeObject.lastTop;
            activeObject.lastLeft = activeObject.left;
            activeObject.lastTop = activeObject.top;

            // Shift all corners by same delta (Section 9)
            activeObject.corners = activeObject.corners.map((p: Point) => ({
              x: p.x + dx,
              y: p.y + dy,
            }));

            // Sync handle locations if Adjust Mode is active
            if (isAdjustingPerspective) {
              handlesRef.current.forEach((h: any) => {
                const corner = activeObject.corners[h.cornerIndex];
                h.set({ left: corner.x, top: corner.y });
                h.setCoords();
              });
              updateGuideLines(activeObject.corners);
            }
          });

          activeObject.on('modified', () => {
            pushToHistory();
          });

          activeObject.hasMovingListener = true;
        } else {
          activeObject.lastLeft = minX;
          activeObject.lastTop = minY;
        }

        activeObject.setCoords();
        setSelectedPlateMode('perspective');

        // Diagnostics Log (Section 1)
        console.log('Perspective Adjust Transition Diagnostics:', {
          selectedPlateId: activeObject.id,
          standardPlateVisible: activeObject.visible,
          perspectiveMode: mode,
          topLeft: corners[0],
          topRight: corners[1],
          bottomRight: corners[2],
          bottomLeft: corners[3],
          boundingBox: { minX, minY, width: warpedCanvas.width, height: warpedCanvas.height },
          previewCanvasWidth: warpedCanvas.width,
          previewCanvasHeight: warpedCanvas.height,
          previewObjectLeft: activeObject.left,
          previewObjectTop: activeObject.top,
          previewObjectWidth: activeObject.width,
          previewObjectHeight: activeObject.height,
          previewObjectScaleX: activeObject.scaleX,
          previewObjectScaleY: activeObject.scaleY,
          previewObjectVisible: activeObject.visible,
          previewObjectOpacity: activeObject.opacity,
          fabricObjectCount: canvas.getObjects().length,
        });

        assertPlateVisible(activeObject);
      } else {
        // Switch back to Standard flat group in-place on same object
        clearPerspectiveHandles(canvas);
        setIsAdjustingPerspective(false);

        const corners = activeObject.corners as Point[];
        const cx = corners.reduce((sum, p) => sum + p.x, 0) / 4;
        const cy = corners.reduce((sum, p) => sum + p.y, 0) / 4;

        const flatCanvas = renderFlatPlateCanvas(activeObject.plateOptions, imageMetadata.width, imageMetadata.height);
        
        activeObject.setElement(flatCanvas);
        activeObject.plateMode = 'standard';
        activeObject.corners = null;

        activeObject.set({
          left: cx,
          top: cy,
          scaleX: 1.0,
          scaleY: 1.0,
          angle: activeObject.plateOptions.rotation || 0,
          originX: 'center',
          originY: 'center',
          hasControls: true,
          hasBorders: true,
        });

        activeObject.setCoords();
        setSelectedPlateMode('standard');

        assertPlateVisible(activeObject);
      }

      canvas.renderAll();
      pushToHistory();
    } catch (err) {
      console.error('Error switching plate mode:', err);
    } finally {
      isSyncingRef.current = false;
    }
  };

  // Toggle Adjust Corners (draws corner handles, outline guides)
  const handleToggleAdjustPerspective = () => {
    const canvas = fabricCanvasRef.current;
    if (!canvas || !activeObject || !activeObject.isNamePlate || activeObject.plateMode !== 'perspective') return;

    if (!isAdjustingPerspective) {
      // Enter Adjust Corners Mode
      originalCornersRef.current = activeObject.corners.map((p: Point) => ({ ...p }));
      setIsAdjustingPerspective(true);
      
      // Hide selection borders on plate object during corner edit
      activeObject.set({ hasControls: false, hasBorders: false });
      
      renderPerspectiveHandles(canvas, activeObject);
      assertPlateVisible(activeObject);
    } else {
      handleApplyAdjust();
    }
  };

  const handleApplyAdjust = () => {
    const canvas = fabricCanvasRef.current;
    if (!canvas || !activeObject) return;

    setIsAdjustingPerspective(false);
    clearPerspectiveHandles(canvas);
    setActiveCornerIndex(null);
    setMagnifierCoords(null);

    // Restore standard borders for active selection
    activeObject.set({
      hasControls: false,
      hasBorders: true,
    });

    if (activeObject.corners && imageMetadata) {
      const normalized = activeObject.corners.map((p: Point) => ({
        x: p.x / imageMetadata.width,
        y: p.y / imageMetadata.height,
      }));
      localStorage.setItem('thennakoon_last_shape', JSON.stringify(normalized));
      setHasSavedShape(true);
    }

    assertPlateVisible(activeObject);
    pushToHistory();
    canvas.renderAll();
  };

  const handleCancelAdjust = () => {
    const canvas = fabricCanvasRef.current;
    if (!canvas || !activeObject || !originalCornersRef.current || !imageMetadata) return;

    // Restore corner positions
    activeObject.corners = originalCornersRef.current.map((p) => ({ ...p }));
    
    // Re-warp back to backup corners
    const flatCanvas = renderFlatPlateCanvas(activeObject.plateOptions, imageMetadata.width, imageMetadata.height);
    try {
      const warpedCanvas = warpCanvasPerspective(flatCanvas, activeObject.corners);
      activeObject.setElement(warpedCanvas);
    } catch (e) {
      console.error('Cancel warp failed:', e);
    }

    const minX = Math.min(...activeObject.corners.map((p: Point) => p.x));
    const minY = Math.min(...activeObject.corners.map((p: Point) => p.y));
    activeObject.set({ left: minX, top: minY });
    activeObject.setCoords();
    activeObject.lastLeft = minX;
    activeObject.lastTop = minY;

    setIsAdjustingPerspective(false);
    clearPerspectiveHandles(canvas);
    setActiveCornerIndex(null);
    setMagnifierCoords(null);

    activeObject.set({
      hasControls: false,
      hasBorders: true,
    });

    assertPlateVisible(activeObject);
    canvas.renderAll();
  };

  const handleResetToRectangle = () => {
    const canvas = fabricCanvasRef.current;
    if (!canvas || !activeObject || !activeObject.corners || !imageMetadata) return;

    const corners = activeObject.corners as Point[];
    const cx = corners.reduce((sum, p) => sum + p.x, 0) / 4;
    const cy = corners.reduce((sum, p) => sum + p.y, 0) / 4;

    const baseWidth = imageMetadata.width * 0.3;
    const baseHeight = baseWidth * (400 / 1200);

    const resetCorners: Point[] = [
      { x: cx - baseWidth / 2, y: cy - baseHeight / 2 },
      { x: cx + baseWidth / 2, y: cy - baseHeight / 2 },
      { x: cx + baseWidth / 2, y: cy + baseHeight / 2 },
      { x: cx - baseWidth / 2, y: cy + baseHeight / 2 },
    ];

    activeObject.corners = resetCorners;

    const flatCanvas = renderFlatPlateCanvas(activeObject.plateOptions, imageMetadata.width, imageMetadata.height);
    try {
      const warpedCanvas = warpCanvasPerspective(flatCanvas, resetCorners);
      activeObject.setElement(warpedCanvas);
    } catch (e) {
      console.error('Reset warp failed:', e);
    }

    const minX = Math.min(...resetCorners.map((p) => p.x));
    const minY = Math.min(...resetCorners.map((p) => p.y));
    activeObject.set({ left: minX, top: minY });
    activeObject.setCoords();
    activeObject.lastLeft = minX;
    activeObject.lastTop = minY;

    if (isAdjustingPerspective) {
      renderPerspectiveHandles(canvas, activeObject);
    } else {
      canvas.renderAll();
    }
    
    assertPlateVisible(activeObject);
    pushToHistory();
  };

  const handleCopyPreviousShape = () => {
    const canvas = fabricCanvasRef.current;
    if (!canvas || !activeObject || !imageMetadata) return;

    const saved = localStorage.getItem('thennakoon_last_shape');
    if (!saved) return;

    try {
      const normalized = JSON.parse(saved) as Point[];
      if (normalized.length !== 4) return;

      const scaledCorners = normalized.map((p) => ({
        x: p.x * imageMetadata.width,
        y: p.y * imageMetadata.height,
      }));

      const currentCorners = activeObject.corners || [
        { x: activeObject.left, y: activeObject.top },
        { x: activeObject.left + activeObject.width, y: activeObject.top },
        { x: activeObject.left + activeObject.width, y: activeObject.top + activeObject.height },
        { x: activeObject.left, y: activeObject.top + activeObject.height },
      ];

      const curCx = currentCorners.reduce((sum: number, p: Point) => sum + p.x, 0) / 4;
      const curCy = currentCorners.reduce((sum: number, p: Point) => sum + p.y, 0) / 4;

      const targetCx = scaledCorners.reduce((sum, p) => sum + p.x, 0) / 4;
      const targetCy = scaledCorners.reduce((sum, p) => sum + p.y, 0) / 4;

      const dx = curCx - targetCx;
      const dy = curCy - targetCy;

      const offsetCorners = scaledCorners.map((p) => ({
        x: p.x + dx,
        y: p.y + dy,
      }));

      activeObject.corners = offsetCorners;

      const flatCanvas = renderFlatPlateCanvas(activeObject.plateOptions, imageMetadata.width, imageMetadata.height);
      const warpedCanvas = warpCanvasPerspective(flatCanvas, offsetCorners);
      activeObject.setElement(warpedCanvas);

      const minX = Math.min(...offsetCorners.map((p) => p.x));
      const minY = Math.min(...offsetCorners.map((p) => p.y));
      activeObject.set({ left: minX, top: minY });
      activeObject.setCoords();
      activeObject.lastLeft = minX;
      activeObject.lastTop = minY;

      if (isAdjustingPerspective) {
        renderPerspectiveHandles(canvas, activeObject);
      } else {
        canvas.renderAll();
      }
      
      assertPlateVisible(activeObject);
      pushToHistory();
    } catch (e) {
      console.error('Failed to parse saved perspective shape:', e);
    }
  };

  const handleDuplicatePlate = () => {
    const canvas = fabricCanvasRef.current;
    if (!canvas || !activeObject || !activeObject.isNamePlate || !imageMetadata) return;

    const id = 'plate_' + Math.random().toString(36).substring(2, 11);
    const options = { ...activeObject.plateOptions };
    
    if (activeObject.plateMode === 'standard') {
      const flatCanvas = renderFlatPlateCanvas(options, imageMetadata.width, imageMetadata.height);
      const clone = new FabricImage(flatCanvas, {
        left: activeObject.left + 40,
        top: activeObject.top + 40,
        opacity: activeObject.opacity,
        angle: activeObject.angle,
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
    } else {
      // Duplicate warped plate in-place (Section 3: one visible object)
      const offsetCorners = activeObject.corners.map((p: Point) => ({
        x: p.x + 40,
        y: p.y + 40,
      }));

      const flatCanvas = renderFlatPlateCanvas(options, imageMetadata.width, imageMetadata.height);
      const warpedCanvas = warpCanvasPerspective(flatCanvas, offsetCorners);

      const clone = new FabricImage(warpedCanvas, {
        opacity: activeObject.opacity,
        selectable: true,
        hasControls: false,
        hasBorders: true,
        originX: 'left',
        originY: 'top',
      });

      (clone as any).id = id;
      (clone as any).isNamePlate = true;
      (clone as any).plateMode = 'perspective';
      (clone as any).plateOptions = options;
      (clone as any).corners = offsetCorners;
      (clone as any).lastLeft = clone.left;
      (clone as any).lastTop = clone.top;

      clone.on('moving', () => {
        const dx = clone.left - (clone as any).lastLeft;
        const dy = clone.top - (clone as any).lastTop;
        (clone as any).lastLeft = clone.left;
        (clone as any).lastTop = clone.top;
        (clone as any).corners = (clone as any).corners.map((p: Point) => ({
          x: p.x + dx,
          y: p.y + dy,
        }));
      });

      clone.on('modified', () => {
        pushToHistory();
      });

      const minX = Math.min(...offsetCorners.map((p: Point) => p.x));
      const minY = Math.min(...offsetCorners.map((p: Point) => p.y));
      clone.set({ left: minX, top: minY });

      canvas.add(clone);
      canvas.setActiveObject(clone);
      assertPlateVisible(clone);
    }

    canvas.renderAll();
    pushToHistory();
  };

  // Render Corner Handles and Connecting Guide Lines
  const renderPerspectiveHandles = (canvas: Canvas, plateObj: any) => {
    clearPerspectiveHandles(canvas);

    const corners = plateObj.corners as Point[];
    if (!corners) return;

    // 1. Draw connecting guide lines
    const pStartArr = [corners[0], corners[1], corners[2], corners[3]];
    const pEndArr = [corners[1], corners[2], corners[3], corners[0]];
    const lines: Line[] = [];

    for (let i = 0; i < 4; i++) {
      const line = new Line([pStartArr[i].x, pStartArr[i].y, pEndArr[i].x, pEndArr[i].y], {
        stroke: '#8B0000',
        strokeWidth: Math.max(1.5, 1.5 / displayScale),
        selectable: false,
        evented: false,
        hasControls: false,
        hasBorders: false,
        excludeFromExport: true, // Marker to exclude from final download (Section 7)
      });
      canvas.add(line);
      lines.push(line);
    }
    linesRef.current = lines;

    // Bring guide lines above background & watermark
    lines.forEach((l) => {
      canvas.bringObjectToFront(l);
    });

    // 2. Draw handles
    const handles: Circle[] = [];

    corners.forEach((pt, index) => {
      const handleRadius = Math.max(16, 16 / displayScale); 

      const handle = new Circle({
        left: pt.x,
        top: pt.y,
        radius: handleRadius,
        fill: activeCornerIndex === index ? '#8B0000' : '#FFFFFF',
        stroke: '#8B0000',
        strokeWidth: Math.max(2.5, 2.5 / displayScale),
        originX: 'center',
        originY: 'center',
        hasControls: false,
        hasBorders: false,
        selectable: true,
        excludeFromExport: true, // Excluded from download (Section 7)
      });

      (handle as any).isPerspectiveHandle = true;
      (handle as any).cornerIndex = index;
      (handle as any).plateId = plateObj.id;

      // Handle Dragging Listener (Section 9)
      handle.on('moving', (opt) => {
        const nextX = handle.left;
        const nextY = handle.top;

        const proposed = corners.map((p, idx) =>
          idx === index ? { x: nextX, y: nextY } : { ...p }
        );

        if (isConvex(proposed)) {
          corners[index].x = nextX;
          corners[index].y = nextY;

          // Double buffer: warp preview offscreen and swap in-place
          const flatCanvas = renderFlatPlateCanvas(plateObj.plateOptions, bgImageElementRef.current!.naturalWidth, bgImageElementRef.current!.naturalHeight);
          const warpedCanvas = warpCanvasPerspective(flatCanvas, corners);
          plateObj.setElement(warpedCanvas);

          const minX = Math.min(...corners.map((p) => p.x));
          const minY = Math.min(...corners.map((p) => p.y));
          
          plateObj.set({ left: minX, top: minY });
          plateObj.setCoords();
          plateObj.lastLeft = minX;
          plateObj.lastTop = minY;

          updateGuideLines(corners);
          setActiveCornerIndex(index);

          // Render active handles on top
          handles.forEach((h, hIdx) => {
            h.set({ fill: activeCornerIndex === hIdx ? '#8B0000' : '#FFFFFF' });
            canvas.bringObjectToFront(h);
          });

          // Magnifier (Section 14)
          const pointerEvt = opt.e as any;
          let clientX = 100;
          let clientY = 100;
          if (pointerEvt) {
            if (pointerEvt.touches && pointerEvt.touches.length > 0) {
              clientX = pointerEvt.touches[0].clientX;
              clientY = pointerEvt.touches[0].clientY;
            } else if (pointerEvt.clientX !== undefined) {
              clientX = pointerEvt.clientX;
              clientY = pointerEvt.clientY;
            }
          }
          setMagnifierCoords({ x: nextX, y: nextY, clientX, clientY });

          assertPlateVisible(plateObj);
          canvas.renderAll();
        } else {
          // Revert position
          handle.set({ left: corners[index].x, top: corners[index].y });
          handle.setCoords();
        }
      });

      handle.on('mousedown', () => {
        setActiveCornerIndex(index);
        handles.forEach((h, hIdx) => {
          h.set({ fill: hIdx === index ? '#8B0000' : '#FFFFFF' });
        });
        canvas.renderAll();
      });

      handle.on('modified', () => {
        setMagnifierCoords(null);
        pushToHistory();
      });

      canvas.add(handle);
      canvas.bringObjectToFront(handle);
      handles.push(handle);
    });

    handlesRef.current = handles;
    canvas.renderAll();
  };

  const updateGuideLines = (corners: Point[]) => {
    const lines = linesRef.current;
    if (lines.length !== 4) return;
    const [p0, p1, p2, p3] = corners;
    lines[0].set({ x1: p0.x, y1: p0.y, x2: p1.x, y2: p1.y });
    lines[1].set({ x1: p1.x, y1: p1.y, x2: p2.x, y2: p2.y });
    lines[2].set({ x1: p2.x, y1: p2.y, x2: p3.x, y2: p3.y });
    lines[3].set({ x1: p3.x, y1: p3.y, x2: p0.x, y2: p0.y });
    lines.forEach((l) => {
      l.setCoords();
      fabricCanvasRef.current?.bringObjectToFront(l);
    });
  };

  const clearPerspectiveHandles = (canvas: Canvas) => {
    const handles = canvas.getObjects().filter((obj: any) => obj.isPerspectiveHandle);
    handles.forEach((h) => canvas.remove(h));
    handlesRef.current = [];

    const lines = canvas.getObjects().filter((obj: any) => obj.stroke === '#8B0000' && (obj as any).strokeWidth !== undefined && !(obj as any).isNamePlate && (obj as any).excludeFromExport);
    lines.forEach((l) => canvas.remove(l));
    linesRef.current = [];
  };

  // Magnifier Canvas zoom renderer
  useEffect(() => {
    if (!magnifierCoords || !magnifierCanvasRef.current || !bgImageElementRef.current) return;
    const canvas = magnifierCanvasRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    canvas.width = 160;
    canvas.height = 160;

    const bgImg = bgImageElementRef.current;
    const { x, y } = magnifierCoords;

    const zoom = 3.5;
    const srcSize = 160 / zoom;
    
    ctx.drawImage(
      bgImg,
      x - srcSize / 2,
      y - srcSize / 2,
      srcSize,
      srcSize,
      0,
      0,
      160,
      160
    );

    ctx.strokeStyle = '#FF0000';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(80, 0);
    ctx.lineTo(80, 160);
    ctx.moveTo(0, 80);
    ctx.lineTo(160, 80);
    ctx.stroke();

    ctx.strokeStyle = '#FFFFFF';
    ctx.lineWidth = 2.0;
    ctx.strokeRect(1, 1, 158, 158);
  }, [magnifierCoords]);

  // Zoom / Viewport Panning Controls (Non-destructive: visual adjustments via CSS styles)
  const handleZoom = (type: 'in' | 'out' | 'fit') => {
    const container = containerRef.current;
    const canvas = fabricCanvasRef.current;
    const bgImg = bgImageElementRef.current;
    if (!container || !canvas || !bgImg) return;

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
      bgImg.naturalWidth,
      bgImg.naturalHeight,
      container.clientWidth,
      Math.min(500, window.innerHeight * 0.5),
      nextZoom
    );
    setDisplayScale(scale);

    // Refresh handles to match displayScale zoom change
    if (isAdjustingPerspective && activeObject) {
      renderPerspectiveHandles(canvas, activeObject);
    }
  };

  // Before / After Preview Toggle (Hides watermark overlays, outlines, and plates)
  const handleTogglePreview = (active: boolean) => {
    const canvas = fabricCanvasRef.current;
    if (!canvas) return;

    setIsPreviewActive(active);
    canvas.discardActiveObject();
    
    if (active) {
      clearPerspectiveHandles(canvas);
    } else if (activeObject && activeObject.isNamePlate && activeObject.plateMode === 'perspective' && isAdjustingPerspective) {
      renderPerspectiveHandles(canvas, activeObject);
    }

    canvas.getObjects().forEach((obj: any) => {
      if (obj.isNamePlate) {
        obj.set({
          visible: !active,
          selectable: !active,
          evented: !active,
        });
      } else if (obj.isWatermark) {
        obj.set({
          visible: !active && watermarkOptions.visible,
          selectable: !active,
          evented: !active,
        });
      }
    });

    canvas.renderAll();
  };

  // Action: Delete selected object
  const handleDeleteSelected = () => {
    const canvas = fabricCanvasRef.current;
    if (!canvas) return;

    const active = canvas.getActiveObject();
    if (active) {
      if ((active as any).isWatermark) {
        handleWatermarkOptionsChange({ visible: false });
      } else if ((active as any).isPerspectiveHandle) {
        return;
      } else {
        clearPerspectiveHandles(canvas);
        canvas.remove(active);
        canvas.discardActiveObject();
        canvas.renderAll();
        pushToHistory();
      }
    }
  };

  // Reset Editor
  const handleResetEditor = () => {
    const canvas = fabricCanvasRef.current;
    if (!canvas || !imageMetadata) return;

    isSyncingRef.current = true;

    clearPerspectiveHandles(canvas);
    setIsAdjustingPerspective(false);
    setMagnifierCoords(null);
    
    const plates = canvas.getObjects().filter((obj: any) => obj.isNamePlate);
    plates.forEach((p) => canvas.remove(p));

    setWatermarkOptions({
      visible: true,
      opacity: 1.0,
      scale: 0.18,
      position: 'bottom-left',
      customLogoUrl: null,
    });
    setIsWatermarkManual(false);

    addDefaultWatermark(canvas, imageMetadata.width, imageMetadata.height).then(() => {
      setIsConfirmResetOpen(false);
      isSyncingRef.current = false;
      pushToHistory();
    });
  };

  // Keyboard Shortcuts Bindings (Arrow keys nudges corner handles/standard plates)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const activeEl = document.activeElement;
      const isTyping =
        activeEl &&
        (activeEl.tagName === 'INPUT' ||
          activeEl.tagName === 'TEXTAREA' ||
          activeEl.getAttribute('contenteditable') === 'true');

      if (isTyping) return;

      const canvas = fabricCanvasRef.current;
      if (!canvas) return;

      if (e.key === 'Delete' || e.key === 'Backspace') {
        e.preventDefault();
        handleDeleteSelected();
      }

      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z' && !e.shiftKey) {
        e.preventDefault();
        handleUndo();
      }
      if (
        ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z' && e.shiftKey) ||
        ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'y')
      ) {
        e.preventDefault();
        handleRedo();
      }

      const activeObj = canvas.getActiveObject() as any;
      if (activeObj && !isPreviewActive) {
        const step = e.shiftKey ? 10 : 1;
        let moved = false;

        if (activeObj.isPerspectiveHandle) {
          const idx = activeObj.cornerIndex;
          const plate = canvas.getObjects().find((obj: any) => obj.isNamePlate && obj.id === activeObj.plateId) as any;
          if (plate && plate.corners) {
            const nextX = activeObj.left + (e.key === 'ArrowRight' ? step : e.key === 'ArrowLeft' ? -step : 0);
            const nextY = activeObj.top + (e.key === 'ArrowDown' ? step : e.key === 'ArrowUp' ? -step : 0);

            const proposed = plate.corners.map((p: Point, i: number) =>
              i === idx ? { x: nextX, y: nextY } : { ...p }
            );

            if (isConvex(proposed)) {
              activeObj.set({ left: nextX, top: nextY });
              plate.corners[idx].x = nextX;
              plate.corners[idx].y = nextY;

              const flatCanvas = renderFlatPlateCanvas(plate.plateOptions, bgImageElementRef.current!.naturalWidth, bgImageElementRef.current!.naturalHeight);
              const warpedCanvas = warpCanvasPerspective(flatCanvas, plate.corners);
              plate.setElement(warpedCanvas);

              const minX = Math.min(...plate.corners.map((p: any) => p.x));
              const minY = Math.min(...plate.corners.map((p: any) => p.y));
              plate.set({ left: minX, top: minY });
              plate.setCoords();
              plate.lastLeft = minX;
              plate.lastTop = minY;

              updateGuideLines(plate.corners);
              moved = true;
            }
          }
        } else {
          const dx = e.key === 'ArrowRight' ? step : e.key === 'ArrowLeft' ? -step : 0;
          const dy = e.key === 'ArrowDown' ? step : e.key === 'ArrowUp' ? -step : 0;

          if (dx !== 0 || dy !== 0) {
            activeObj.set({
              left: (activeObj.left || 0) + dx,
              top: (activeObj.top || 0) + dy,
            });
            moved = true;

            if (activeObj.isNamePlate && activeObj.plateMode === 'perspective') {
              activeObj.corners = activeObj.corners.map((p: Point) => ({
                x: p.x + dx,
                y: p.y + dy,
              }));
              activeObj.lastLeft = activeObj.left;
              activeObj.lastTop = activeObj.top;

              if (isAdjustingPerspective) {
                handlesRef.current.forEach((h: any) => {
                  const pt = activeObj.corners[h.cornerIndex];
                  h.set({ left: pt.x, top: pt.y });
                  h.setCoords();
                });
                updateGuideLines(activeObj.corners);
              }
            }
            activeObj.setCoords();
          }
        }

        if (moved) {
          canvas.renderAll();
        }
      }
    };

    const handleKeyUp = (e: KeyboardEvent) => {
      const activeEl = document.activeElement;
      const isTyping =
        activeEl &&
        (activeEl.tagName === 'INPUT' ||
          activeEl.tagName === 'TEXTAREA' ||
          activeEl.getAttribute('contenteditable') === 'true');

      if (isTyping) return;

      if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.key)) {
        pushToHistory();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
    };
  }, [undoStack, redoStack, activeObject, isPreviewActive, isAdjustingPerspective]);

  // High-Resolution Export Execution
  const handleExportImage = async () => {
    const canvas = fabricCanvasRef.current;
    if (!canvas || !bgImageElementRef.current || !imageMetadata) return;

    setIsExporting(true);

    try {
      let dataUrl: string | null = null;

      if (exportPreset === 'original') {
        dataUrl = exportOriginalImage();
      } else {
        canvas.discardActiveObject();
        clearPerspectiveHandles(canvas);
        canvas.renderAll();

        dataUrl = await generateExportDataUrl(canvas, bgImageElementRef.current, {
          preset: exportPreset,
          format: exportFormat,
          quality: exportQuality,
          fitMethod: exportFitMethod,
          backgroundColor: exportBgColor,
          watermarkOptions,
          isWatermarkManual,
          imageMetadata,
        });

        if (activeObject && activeObject.isNamePlate && activeObject.plateMode === 'perspective' && isAdjustingPerspective) {
          renderPerspectiveHandles(canvas, activeObject);
        }
      }

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

  return (
    <div className="flex flex-col flex-1 h-full min-h-0 bg-neutral-950 text-white overflow-hidden relative">
      
      {/* Magnified Corner Preview Overlay */}
      {magnifierCoords && (
        <div 
          className="fixed w-36 h-36 rounded-full border-4 border-red-700 shadow-2xl overflow-hidden pointer-events-none z-50 bg-neutral-950 flex items-center justify-center transition-opacity duration-150 animate-fade-in"
          style={{
            left: magnifierCoords.clientX > window.innerWidth / 2 ? '40px' : 'calc(100% - 184px)',
            top: '40px',
          }}
        >
          <canvas ref={magnifierCanvasRef} className="w-full h-full rounded-full" />
        </div>
      )}

      <div className="flex-1 flex flex-col md:flex-row min-h-0 overflow-y-auto md:overflow-hidden">
        
        {/* Left Column: Editor workspace */}
        <div className="flex-1 flex flex-col p-4 md:p-6 space-y-4 min-w-0 md:h-full md:overflow-y-auto">
          
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-neutral-900/40 border border-neutral-900 rounded-xl p-4 shadow-sm">
            <div>
              <span className="text-[10px] font-bold tracking-widest text-yellow-500 uppercase">
                Workflow
              </span>
              <div className="flex items-center gap-2 mt-0.5 text-xs text-neutral-400 font-medium">
                <span className={imageUrl ? 'text-neutral-500 line-through' : 'text-white font-bold'}>1. Upload Photo</span>
                <span>→</span>
                <span className={imageUrl && !activeObject ? 'text-white font-bold' : imageUrl ? 'text-neutral-500 line-through' : ''}>2. Place Plates</span>
                <span>→</span>
                <span className={imageUrl && watermarkOptions.visible ? 'text-neutral-500 line-through' : ''}>3. Watermark</span>
                <span>→</span>
                <span>4. Download</span>
              </div>
            </div>
            <div className="flex items-center gap-2 text-neutral-500 text-xs sm:border-l sm:border-neutral-800 sm:pl-4">
              <ShieldCheck className="w-4 h-4 text-green-600 shrink-0" />
              <span>Photos are processed locally in your browser</span>
            </div>
          </div>

          {/* Info and Watermark warning */}
          {imageUrl && logoError && (
            <div className="bg-yellow-950/20 border border-yellow-900 text-yellow-300 px-4 py-2.5 rounded-lg text-xs leading-relaxed flex items-start gap-2.5">
              <span className="font-bold text-yellow-500 mt-0.5">⚠️ Info:</span>
              <div className="flex-1">{logoError}</div>
            </div>
          )}

          {!imageUrl ? (
            <div className="flex-1 flex items-center justify-center">
              <div className="w-full max-w-2xl bg-neutral-900/20 border border-neutral-900 rounded-2xl p-6 shadow-2xl">
                <h2 className="text-xl font-bold mb-4 text-center">Branding Tool Workflow</h2>
                <ImageUploader
                  onImageLoaded={handleImageLoaded}
                  onImageCleared={clearImageUrl}
                />
                <div className="mt-8 grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm text-neutral-400">
                  <div className="p-4 rounded-xl bg-neutral-900 border border-neutral-850">
                    <h3 className="font-bold text-white flex items-center gap-2 mb-1.5">
                      <span className="w-5 h-5 rounded-full bg-red-950 border border-red-900 flex items-center justify-center text-xs font-mono text-red-400">1</span>
                      Branded Name Plates
                    </h3>
                    <p className="text-xs leading-relaxed text-neutral-400">
                      Add a dark-red branded plate over original license plates. Customize text and size.
                    </p>
                  </div>
                  <div className="p-4 rounded-xl bg-neutral-900 border border-neutral-850">
                    <h3 className="font-bold text-white flex items-center gap-2 mb-1.5">
                      <span className="w-5 h-5 rounded-full bg-red-950 border border-red-900 flex items-center justify-center text-xs font-mono text-red-400">2</span>
                      Company Watermark
                    </h3>
                    <p className="text-xs leading-relaxed text-neutral-400">
                      The official transparent Thennakoon Tours logo is placed automatically at 18% width. Move or resize freely.
                    </p>
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <div className="flex-1 flex flex-col space-y-4 min-h-0">
              
              <div className="flex flex-wrap items-center justify-between gap-3">
                <ImageUploader
                  onImageLoaded={handleImageLoaded}
                  onImageCleared={clearImageUrl}
                  currentImageName={imageMetadata?.name}
                  currentImageMetadata={imageMetadata}
                />
                <BeforeAfterToggle
                  isPreviewActive={isPreviewActive}
                  onToggle={handleTogglePreview}
                />
              </div>

              {/* Editor Workspace Container */}
              <div
                ref={containerRef}
                className="flex-1 min-h-[350px] bg-neutral-900/60 border border-neutral-850 rounded-2xl flex items-center justify-center overflow-hidden p-4 relative group shadow-2xl"
              >
                {isPreviewActive && (
                  <div className="absolute top-4 left-4 z-10 bg-red-950/80 border border-red-900 px-3 py-1.5 rounded-lg text-xs font-semibold text-red-400 flex items-center gap-2 shadow-lg backdrop-blur-sm animate-pulse">
                    <Eye className="w-4 h-4" />
                    <span>Viewing Original Photo (Branding Hidden)</span>
                  </div>
                )}

                {/* Fabric Canvas wrapper */}
                <div className="relative border border-neutral-800 rounded shadow-md overflow-hidden bg-neutral-950 max-w-full max-h-full flex items-center justify-center">
                  <canvas ref={canvasElRef} />
                </div>
              </div>

              {/* Editor Toolbar */}
              <EditorToolbar
                canUndo={undoStack.length > 1}
                canRedo={redoStack.length > 0}
                onUndo={handleUndo}
                onRedo={handleRedo}
                onZoomIn={() => handleZoom('in')}
                onZoomOut={() => handleZoom('out')}
                onZoomFit={() => handleZoom('fit')}
                onDeleteSelected={handleDeleteSelected}
                onReset={() => setIsConfirmResetOpen(true)}
                onAddPlate={handleAddPlate}
                hasSelection={activeObject !== null}
                zoomLevel={editorZoom}
              />
            </div>
          )}
        </div>

        {/* Right Column: Settings */}
        {imageUrl && (
          <div className="w-full md:w-85 bg-neutral-900/60 border-t md:border-t-0 md:border-l border-neutral-850 p-4 md:p-6 overflow-y-auto shrink-0 md:h-full flex flex-col space-y-4">
            
            <div className="flex border-b border-neutral-800 pb-2">
              <button
                type="button"
                onClick={() => setActiveTab('plates')}
                className={`flex-1 pb-2 text-xs font-bold uppercase tracking-wider text-center border-b-2 transition-colors cursor-pointer
                  ${
                    activeTab === 'plates'
                      ? 'border-red-500 text-white'
                      : 'border-transparent text-neutral-500 hover:text-neutral-300'
                  }`}
              >
                <div className="flex items-center justify-center gap-1">
                  <Palette className="w-3.5 h-3.5" />
                  Plates
                </div>
              </button>
              <button
                type="button"
                onClick={() => setActiveTab('watermark')}
                className={`flex-1 pb-2 text-xs font-bold uppercase tracking-wider text-center border-b-2 transition-colors cursor-pointer
                  ${
                    activeTab === 'watermark'
                      ? 'border-red-500 text-white'
                      : 'border-transparent text-neutral-500 hover:text-neutral-300'
                  }`}
              >
                <div className="flex items-center justify-center gap-1">
                  <ImageIcon className="w-3.5 h-3.5" />
                  Watermark
                </div>
              </button>
              <button
                type="button"
                onClick={() => setActiveTab('export')}
                className={`flex-1 pb-2 text-xs font-bold uppercase tracking-wider text-center border-b-2 transition-colors cursor-pointer
                  ${
                    activeTab === 'export'
                      ? 'border-red-500 text-white'
                      : 'border-transparent text-neutral-500 hover:text-neutral-300'
                  }`}
              >
                <div className="flex items-center justify-center gap-1">
                  <Download className="w-3.5 h-3.5" />
                  Download
                </div>
              </button>
            </div>

            <div className="flex-1 min-h-0">
              {activeTab === 'plates' && (
                <div className="space-y-4">
                  <PlateSettings
                    options={plateOptions}
                    plateMode={selectedPlateMode}
                    isAdjustingPerspective={isAdjustingPerspective}
                    onChangeMode={handlePlateModeChange}
                    onToggleAdjustPerspective={handleToggleAdjustPerspective}
                    onApplyAdjust={handleApplyAdjust}
                    onCancelAdjust={handleCancelAdjust}
                    onResetToRectangle={handleResetToRectangle}
                    onCopyPreviousShape={handleCopyPreviousShape}
                    hasSavedShape={hasSavedShape}
                    onChange={handlePlateOptionsChange}
                    onApplyPreset={handleApplyPlatePreset}
                  />

                  {activeObject && activeObject.isNamePlate && (
                    <button
                      type="button"
                      onClick={handleDuplicatePlate}
                      className="w-full py-2 px-3 text-xs font-bold rounded-lg bg-neutral-800 hover:bg-neutral-750 text-white transition-all cursor-pointer border border-neutral-700 flex items-center justify-center gap-1.5 shadow-sm"
                    >
                      Duplicate Plate
                    </button>
                  )}

                  {!(activeObject && activeObject.isNamePlate) && (
                    <div className="bg-neutral-900 border border-neutral-850 p-4 rounded-xl text-xs text-neutral-400 space-y-2 leading-relaxed">
                      <p className="font-bold text-white">💡 Select a Name Plate</p>
                      <p>
                        Click on an existing name plate in the editor to modify its text, background colors, shadow, and corner rounding.
                      </p>
                      <p>
                        Use the <span className="text-red-400 font-semibold">"Add Name Plate"</span> button in the toolbar to create a new one.
                      </p>
                    </div>
                  )}
                </div>
              )}

              {activeTab === 'watermark' && (
                <WatermarkSettings
                  options={watermarkOptions}
                  onChange={handleWatermarkOptionsChange}
                  onUploadCustomLogo={handleUploadCustomLogo}
                  onClearCustomLogo={handleClearCustomLogo}
                />
              )}

              {activeTab === 'export' && (
                <ExportPanel
                  preset={exportPreset}
                  format={exportFormat}
                  quality={exportQuality}
                  fitMethod={exportFitMethod}
                  backgroundColor={exportBgColor}
                  isExporting={isExporting}
                  onChange={(settings) => {
                    if (settings.preset !== undefined) setExportPreset(settings.preset);
                    if (settings.format !== undefined) setExportFormat(settings.format);
                    if (settings.quality !== undefined) setExportQuality(settings.quality);
                    if (settings.fitMethod !== undefined) setExportFitMethod(settings.fitMethod);
                    if (settings.backgroundColor !== undefined) setExportBgColor(settings.backgroundColor);
                  }}
                  onExport={handleExportImage}
                />
              )}
            </div>
          </div>
        )}
      </div>

      <ConfirmDialog
        isOpen={isConfirmResetOpen}
        title="Reset Canvas Editor"
        message="Are you sure you want to remove all branded name plates and reset the watermark options? This action cannot be undone."
        confirmText="Reset Editor"
        cancelText="Cancel"
        onConfirm={handleResetEditor}
        onCancel={() => setIsConfirmResetOpen(false)}
      />
    </div>
  );
}
