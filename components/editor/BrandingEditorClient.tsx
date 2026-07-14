'use client';

import React, { useEffect, useRef, useState } from 'react';
import { Canvas, FabricImage, Group, Circle, Line, Point as FabricPoint, Rect, FabricText } from 'fabric';
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
  PlateGeometry,
} from '../../types';
import {
  createNamePlate,
  updatePlateProperties,
  getWatermarkCoords,
  fitDimensions,
} from '../../lib/canvasHelpers';
import { generateExportDataUrl, renderFlatPlateCanvas } from '../../lib/exportHelpers';
import { warpCanvasPerspective, isConvex } from '../../lib/perspectiveWarp';
import { loadOpenCV } from '../../lib/opencvLoader';
import { checkModelExists, getDetectorSession, detectLicensePlates, DetectionResult } from '../../lib/plateDetector';
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

  // License Plate Detection & Manual Selection States
  const [isManualSelecting, setIsManualSelecting] = useState<boolean>(false);
  const [isDetecting, setIsDetecting] = useState<boolean>(false);
  const [detectionStatus, setDetectionStatus] = useState<string>('');
  const [detectedPlates, setDetectedPlates] = useState<DetectionResult[]>([]);
  const [selectedDetectionId, setSelectedDetectionId] = useState<string | null>(null);
  const [isModelMissing, setIsModelMissing] = useState<boolean>(false);
  const [hideDetectionBoxes, setHideDetectionBoxes] = useState<boolean>(false);
  const [cvLoaded, setCvLoaded] = useState<boolean>(false);

  // Active object geometry tracker for sidebar sliders & inputs
  const [activeGeometry, setActiveGeometry] = useState<PlateGeometry | null>(null);

  // Manual selection dragging refs
  const startXRef = useRef<number>(0);
  const startYRef = useRef<number>(0);
  const isDraggingRef = useRef<boolean>(false);
  const tempSelectionRectRef = useRef<Rect | null>(null);
  const isManualSelectingRef = useRef<boolean>(false);

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

  // Local Session Perspective Shape Persistence & OpenCV Loading & Model Check
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('thennakoon_last_shape');
      if (saved) {
        setHasSavedShape(true);
      }

      checkModelExists().then((exists) => {
        setIsModelMissing(!exists);
      });

      loadOpenCV()
        .then(() => {
          setCvLoaded(true);
          console.log('OpenCV.js initialized successfully.');
        })
        .catch((err) => {
          console.warn('OpenCV.js could not be loaded:', err);
        });
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
          if (!hasVisiblePixels(flatCanvas)) {
            throw new Error(`Flat plate source is empty during state restoration for plate: ${plateState.id}`);
          }
          const warpedCanvas = warpCanvasPerspective(flatCanvas, plateState.corners!);
          if (warpedCanvas.width <= 1 || warpedCanvas.height <= 1 || !hasVisiblePixels(warpedCanvas)) {
            throw new Error(`Warped plate result is empty during state restoration for plate: ${plateState.id}`);
          }
          
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

      canvas.on('object:moving', () => updateGeometryState(canvas.getActiveObject()));
      canvas.on('object:scaling', () => updateGeometryState(canvas.getActiveObject()));
      canvas.on('object:rotating', () => updateGeometryState(canvas.getActiveObject()));
      canvas.on('object:modified', () => {
        updateGeometryState(canvas.getActiveObject());
        pushToHistory();
      });

      // Mouse events for Manual Rectangle Selection (Section 9)
      canvas.on('mouse:down', (opt) => handleCanvasMouseDown(opt));
      canvas.on('mouse:move', (opt) => handleCanvasMouseMove(opt));
      canvas.on('mouse:up', (opt) => handleCanvasMouseUp(opt));

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

  // Update geometry state for sidebar controls (Section 10)
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

  // Nudge standard/warped plate settings (Section 10)
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

    // If it's a warped plate, nudge all corner coordinates as well to keep them in sync
    if (activeObject.plateMode === 'perspective' && activeObject.corners) {
      const dx = activeObject.left - (activeObject.lastLeft ?? activeObject.left);
      const dy = activeObject.top - (activeObject.lastTop ?? activeObject.top);
      activeObject.corners = activeObject.corners.map((p: Point) => ({
        x: p.x + dx,
        y: p.y + dy,
      }));
      activeObject.lastLeft = activeObject.left;
      activeObject.lastTop = activeObject.top;
    }

    activeObject.setCoords();
    canvas.renderAll();
    updateGeometryState(activeObject);
    pushToHistory();
  };

  // Precise numeric fields / input changes (Section 10)
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

  // ==================================================
  // 9. MANUAL RECTANGLE SELECTION FALLBACK (Section 9)
  // ==================================================
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

  const handleCanvasMouseUp = (opt: any) => {
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

      // Minimum rectangle size check: 15x15 pixels in original coordinates (Section 9)
      if (width > 15 && height > 15) {
        const cx = left + width / 2;
        const cy = top + height / 2;

        // Apply safety expansion (+6% width, +10% height) (Section 8)
        const plateW = width * 1.06;
        const plateH = height * 1.10;

        createBrandedPlateAt(cx, cy, plateW, plateH);
      }
    }

    handleCancelManualSelection();
  };

  // Helper to add branded plate over canvas coordinates (Section 8)
  const createBrandedPlateAt = (
    cx: number,
    cy: number,
    w: number,
    h: number,
    angle = 0,
    corners: Point[] | null = null
  ) => {
    const canvas = fabricCanvasRef.current;
    if (!canvas || !imageMetadata) return;

    const id = 'plate_' + Math.random().toString(36).substring(2, 11);

    if (corners) {
      const flatCanvas = renderFlatPlateCanvas(plateOptions, imageMetadata.width, imageMetadata.height);
      const warpedCanvas = warpCanvasPerspective(flatCanvas, corners);
      
      const minX = Math.min(...corners.map(p => p.x));
      const minY = Math.min(...corners.map(p => p.y));

      const plate = new FabricImage(warpedCanvas, {
        left: minX,
        top: minY,
        opacity: plateOptions.opacity,
        selectable: true,
        evented: true,
        hasControls: true,
        hasBorders: true,
        originX: 'left',
        originY: 'top',
        transparentCorners: false,
        cornerColor: '#8B0000',
        cornerStrokeColor: '#FFFFFF',
        borderColor: '#8B0000',
        cornerSize: 12,
      });

      (plate as any).id = id;
      (plate as any).isNamePlate = true;
      (plate as any).plateMode = 'perspective';
      (plate as any).plateOptions = { ...plateOptions };
      (plate as any).corners = corners.map(p => ({ ...p }));
      (plate as any).lastLeft = minX;
      (plate as any).lastTop = minY;

      plate.on('moving', () => {
        const dx = plate.left - (plate as any).lastLeft;
        const dy = plate.top - (plate as any).lastTop;
        (plate as any).lastLeft = plate.left;
        (plate as any).lastTop = plate.top;
        (plate as any).corners = (plate as any).corners.map((p: Point) => ({
          x: p.x + dx,
          y: p.y + dy,
        }));
      });

      canvas.add(plate);
      canvas.setActiveObject(plate);
      assertPlateVisible(plate);
    } else {
      const flatCanvas = renderFlatPlateCanvas(plateOptions, imageMetadata.width, imageMetadata.height);
      const plate = new FabricImage(flatCanvas, {
        left: cx,
        top: cy,
        originX: 'center',
        originY: 'center',
        opacity: plateOptions.opacity,
        angle: angle,
        selectable: true,
        hasControls: true,
        hasBorders: true,
        transparentCorners: false,
        cornerColor: '#8B0000',
        cornerStrokeColor: '#FFFFFF',
        borderColor: '#8B0000',
        cornerSize: 12,
      });

      const flatW = flatCanvas.width;
      const flatH = flatCanvas.height;
      plate.set({
        scaleX: w / flatW,
        scaleY: h / flatH,
      });

      (plate as any).id = id;
      (plate as any).isNamePlate = true;
      (plate as any).plateMode = 'standard';
      (plate as any).plateOptions = { ...plateOptions, rotation: angle };
      (plate as any).corners = null;

      canvas.add(plate);
      canvas.setActiveObject(plate);
      assertPlateVisible(plate);
    }

    canvas.renderAll();
    updateGeometryState(canvas.getActiveObject());
    pushToHistory();
  };

  // ==================================================
  // 3 & 4. AUTOMATIC NUMBER PLATE DETECTION (Section 3 & 4)
  // ==================================================
  const drawDetectionBoxes = (detections: DetectionResult[]) => {
    const canvas = fabricCanvasRef.current;
    if (!canvas) return;

    clearDetectionBoxes();

    detections.forEach((det) => {
      const isBest = det.confidence === Math.max(...detections.map((d) => d.confidence));
      
      const rect = new Rect({
        left: det.x,
        top: det.y,
        width: det.width,
        height: det.height,
        fill: 'rgba(0, 255, 0, 0.05)',
        stroke: isBest ? '#22C55E' : '#EAB308',
        strokeWidth: Math.max(3, 3 / displayScale),
        selectable: true,
        hasControls: false,
        hasBorders: false,
        excludeFromExport: true,
      });

      const textObj = new FabricText(`Plate (${Math.round(det.confidence * 100)}%)`, {
        left: det.x,
        top: Math.max(0, det.y - Math.max(24, 24 / displayScale)),
        fontSize: Math.max(16, 16 / displayScale),
        fill: isBest ? '#22C55E' : '#EAB308',
        fontFamily: 'sans-serif',
        fontWeight: 'bold',
        backgroundColor: 'rgba(0, 0, 0, 0.75)',
        selectable: false,
        excludeFromExport: true,
      });

      (rect as any).isDetectionBox = true;
      (rect as any).detectionId = det.id;
      (rect as any).detectionData = det;
      (rect as any).textLabel = textObj;

      rect.on('mousedown', () => {
        setSelectedDetectionId(det.id);
        // Also select the plate associated with this detection if any
      });

      canvas.add(rect);
      canvas.add(textObj);
    });

    canvas.requestRenderAll();
  };

  const clearDetectionBoxes = () => {
    const canvas = fabricCanvasRef.current;
    if (!canvas) return;

    const toRemove = canvas.getObjects().filter(
      (obj: any) =>
        obj.isDetectionBox ||
        (obj instanceof FabricText && obj.excludeFromExport && obj.text && obj.text.startsWith('Plate ('))
    );
    toRemove.forEach((obj) => canvas.remove(obj));
    canvas.requestRenderAll();
  };

  const handleDetectNumberPlate = async () => {
    const canvas = fabricCanvasRef.current;
    const bgImg = bgImageElementRef.current;
    if (!canvas || !bgImg) return;

    if (isPreviewActive) handleTogglePreview(false);

    setIsDetecting(true);
    setSelectedDetectionId(null);
    setDetectedPlates([]);
    clearDetectionBoxes();

    try {
      const modelExists = await checkModelExists();
      if (!modelExists) {
        setIsModelMissing(true);
        setIsDetecting(false);
        setDetectionStatus('Model missing');
        alert('Automatic detection is unavailable because the ONNX model file is missing from /public/models/license-plate-detector.onnx. Please place the model file in the public folder, or use Manual Rectangle Selection below.');
        handleStartManualSelection();
        return;
      }

      const session = await getDetectorSession((status) => setDetectionStatus(status));

      setDetectionStatus('Analysing photo...');
      const detections = await detectLicensePlates(bgImg, session, 0.40);

      if (detections.length === 0) {
        setIsDetecting(false);
        setDetectionStatus('Detection failed');
        alert('No number plate was detected. Draw a box around the number plate manually.');
        handleStartManualSelection();
        return;
      }

      setDetectedPlates(detections);
      drawDetectionBoxes(detections);

      // Select and brand the best plate
      const bestDet = detections.reduce(
        (best, cur) => (cur.confidence > best.confidence ? cur : best),
        detections[0]
      );
      setSelectedDetectionId(bestDet.id);
      applyBrandingToDetection(bestDet);

      setIsDetecting(false);
      setDetectionStatus('Plate detected');
    } catch (err: any) {
      console.error('Detection failed:', err);
      setIsDetecting(false);
      setDetectionStatus('Detection failed');
      alert(`Automatic detection failed: ${err.message || err}. You can select the number plate manually.`);
      handleStartManualSelection();
    }
  };

  const applyBrandingToDetection = (det: DetectionResult) => {
    const bgImg = bgImageElementRef.current;
    if (!bgImg) return;

    let corners: Point[] | null = null;
    let angle = 0;

    if (cvLoaded) {
      const detectedCorners = detectPlateCornersOpenCV(bgImg, det);
      if (detectedCorners && detectedCorners.length === 4) {
        corners = expandQuadrilateral(detectedCorners, 1.06, 1.10);
      } else {
        angle = estimateRotationOpenCV(bgImg, det);
      }
    }

    const cx = det.x + det.width / 2;
    const cy = det.y + det.height / 2;
    const w = det.width * 1.06;
    const h = det.height * 1.10;

    createBrandedPlateAt(cx, cy, w, h, angle, corners);
  };

  const handleBrandAllDetectedPlates = () => {
    if (detectedPlates.length === 0) return;
    
    // Clear any existing name plates first
    const canvas = fabricCanvasRef.current;
    if (canvas) {
      const existing = canvas.getObjects().filter((obj: any) => obj.isNamePlate);
      existing.forEach(p => canvas.remove(p));
    }

    detectedPlates.forEach((det) => {
      applyBrandingToDetection(det);
    });
  };

  const sortCorners = (pts: Point[]): Point[] => {
    const sorted = [...pts].sort((a, b) => a.x - b.x);
    const left = [sorted[0], sorted[1]];
    const right = [sorted[2], sorted[3]];

    left.sort((a, b) => a.y - b.y);
    const tl = left[0];
    const bl = left[1];

    right.sort((a, b) => a.y - b.y);
    const tr = right[0];
    const br = right[1];

    return [tl, tr, br, bl];
  };

  const expandQuadrilateral = (pts: Point[], scaleW = 1.06, scaleH = 1.10): Point[] => {
    const cx = pts.reduce((sum, p) => sum + p.x, 0) / 4;
    const cy = pts.reduce((sum, p) => sum + p.y, 0) / 4;
    return pts.map(p => ({
      x: cx + (p.x - cx) * scaleW,
      y: cy + (p.y - cy) * scaleH,
    }));
  };

  const detectPlateCornersOpenCV = (
    imgElement: HTMLImageElement,
    box: { x: number; y: number; width: number; height: number }
  ): Point[] | null => {
    const cv = (window as any).cv;
    if (!cv) return null;

    try {
      const marginW = box.width * 0.1;
      const marginH = box.height * 0.1;

      const cropX = Math.max(0, Math.floor(box.x - marginW));
      const cropY = Math.max(0, Math.floor(box.y - marginH));
      const cropW = Math.min(imgElement.naturalWidth - cropX, Math.ceil(box.width + 2 * marginW));
      const cropH = Math.min(imgElement.naturalHeight - cropY, Math.ceil(box.height + 2 * marginH));

      if (cropW < 5 || cropH < 5) return null;

      const canvas = document.createElement('canvas');
      canvas.width = cropW;
      canvas.height = cropH;
      const ctx = canvas.getContext('2d');
      if (!ctx) return null;
      ctx.drawImage(imgElement, cropX, cropY, cropW, cropH, 0, 0, cropW, cropH);

      const src = cv.imread(canvas);
      const gray = new cv.Mat();
      cv.cvtColor(src, gray, cv.COLOR_RGBA2GRAY, 0);

      const blurred = new cv.Mat();
      cv.GaussianBlur(gray, blurred, new cv.Size(5, 5), 0, 0, cv.BORDER_DEFAULT);

      const thresh = new cv.Mat();
      cv.adaptiveThreshold(blurred, thresh, 255, cv.ADAPTIVE_THRESH_GAUSSIAN_C, cv.THRESH_BINARY_INV, 11, 2);

      const contours = new cv.MatVector();
      const hierarchy = new cv.Mat();
      cv.findContours(thresh, contours, hierarchy, cv.RETR_EXTERNAL, cv.CHAIN_APPROX_SIMPLE);

      let bestQuad: Point[] | null = null;
      let maxArea = 0;

      for (let i = 0; i < contours.size(); ++i) {
        const cnt = contours.get(i);
        const area = cv.contourArea(cnt);
        if (area < (cropW * cropH) * 0.15) continue;

        const approx = new cv.Mat();
        const peri = cv.arcLength(cnt, true);
        cv.approxPolyDP(cnt, approx, 0.025 * peri, true);

        if (approx.rows === 4) {
          if (cv.isContourConvex(approx)) {
            const pts: Point[] = [];
            for (let j = 0; j < 4; j++) {
              pts.push({
                x: approx.data32S[j * 2],
                y: approx.data32S[j * 2 + 1]
              });
            }

            const w1 = Math.hypot(pts[1].x - pts[0].x, pts[1].y - pts[0].y);
            const h1 = Math.hypot(pts[3].x - pts[0].x, pts[3].y - pts[0].y);
            const aspect = w1 / h1;

            if (aspect > 1.8 && aspect < 6.0) {
              if (area > maxArea) {
                maxArea = area;
                bestQuad = pts;
              }
            }
          }
        }
        approx.delete();
      }

      src.delete();
      gray.delete();
      blurred.delete();
      thresh.delete();
      contours.delete();
      hierarchy.delete();

      if (bestQuad) {
        const sortedLocal = sortCorners(bestQuad);
        return sortedLocal.map(p => ({
          x: p.x + cropX,
          y: p.y + cropY
        }));
      }
    } catch (err) {
      console.warn('OpenCV corner detection failed:', err);
    }
    return null;
  };

  const estimateRotationOpenCV = (
    imgElement: HTMLImageElement,
    box: { x: number; y: number; width: number; height: number }
  ): number => {
    const cv = (window as any).cv;
    if (!cv) return 0;

    try {
      const cropX = Math.max(0, Math.floor(box.x));
      const cropY = Math.max(0, Math.floor(box.y));
      const cropW = Math.min(imgElement.naturalWidth - cropX, Math.ceil(box.width));
      const cropH = Math.min(imgElement.naturalHeight - cropY, Math.ceil(box.height));

      if (cropW < 5 || cropH < 5) return 0;

      const canvas = document.createElement('canvas');
      canvas.width = cropW;
      canvas.height = cropH;
      const ctx = canvas.getContext('2d');
      if (!ctx) return 0;
      ctx.drawImage(imgElement, cropX, cropY, cropW, cropH, 0, 0, cropW, cropH);

      const src = cv.imread(canvas);
      const gray = new cv.Mat();
      cv.cvtColor(src, gray, cv.COLOR_RGBA2GRAY, 0);

      const blurred = new cv.Mat();
      cv.GaussianBlur(gray, blurred, new cv.Size(5, 5), 0, 0, cv.BORDER_DEFAULT);

      const edges = new cv.Mat();
      cv.Canny(blurred, edges, 50, 150, 3, false);

      const contours = new cv.MatVector();
      const hierarchy = new cv.Mat();
      cv.findContours(edges, contours, hierarchy, cv.RETR_EXTERNAL, cv.CHAIN_APPROX_SIMPLE);

      let maxArea = 0;
      let bestAngle = 0;

      for (let i = 0; i < contours.size(); ++i) {
        const cnt = contours.get(i);
        const area = cv.contourArea(cnt);
        if (area > maxArea && area > (cropW * cropH) * 0.15) {
          maxArea = area;
          const rect = cv.minAreaRect(cnt);
          let angle = rect.angle;
          
          if (rect.size.width < rect.size.height) {
            angle = angle + 90;
          }
          
          if (Math.abs(angle) < 45) {
            bestAngle = angle;
          }
        }
      }

      src.delete();
      gray.delete();
      blurred.delete();
      edges.delete();
      contours.delete();
      hierarchy.delete();

      return bestAngle;
    } catch (err) {
      console.warn('Rotation estimation failed:', err);
    }
    return 0;
  };

  const handleReDetectPlateAngle = () => {
    const bgImg = bgImageElementRef.current;
    if (!bgImg || !activeObject || !activeObject.isNamePlate || !imageMetadata) return;

    // Get current bounding box of activeObject
    const geom = {
      x: activeObject.left,
      y: activeObject.top,
      width: activeObject.width * activeObject.scaleX,
      height: activeObject.height * activeObject.scaleY,
    };

    if (cvLoaded) {
      const detectedCorners = detectPlateCornersOpenCV(bgImg, geom);
      if (detectedCorners && detectedCorners.length === 4) {
        const corners = expandQuadrilateral(detectedCorners, 1.06, 1.10);
        
        // Apply perspective warped element
        const flatCanvas = renderFlatPlateCanvas(activeObject.plateOptions, imageMetadata.width, imageMetadata.height);
        const ok = safelyApplyWarpedElement(activeObject, flatCanvas, corners);
        if (ok) {
          activeObject.corners = corners;
          activeObject.plateMode = 'perspective';
          
          const minX = Math.min(...corners.map(p => p.x));
          const minY = Math.min(...corners.map(p => p.y));
          activeObject.set({
            left: minX,
            top: minY,
            scaleX: 1.0,
            scaleY: 1.0,
            angle: 0,
            originX: 'left',
            originY: 'top',
          });
          
          // Re-bind moving listener if not bound
          if (!activeObject.hasMovingListener) {
            activeObject.lastLeft = minX;
            activeObject.lastTop = minY;
            activeObject.on('moving', () => {
              const dx = activeObject.left - activeObject.lastLeft;
              const dy = activeObject.top - activeObject.lastTop;
              activeObject.lastLeft = activeObject.left;
              activeObject.lastTop = activeObject.top;
              activeObject.corners = activeObject.corners.map((p: Point) => ({
                x: p.x + dx,
                y: p.y + dy,
              }));
            });
            activeObject.hasMovingListener = true;
          } else {
            activeObject.lastLeft = minX;
            activeObject.lastTop = minY;
          }

          activeObject.setCoords();
          fabricCanvasRef.current?.renderAll();
          updateGeometryState(activeObject);
          pushToHistory();
          alert('Angle successfully re-detected and perspective warp applied.');
        } else {
          alert('Could not re-detect corners with high confidence.');
        }
      } else {
        const angle = estimateRotationOpenCV(bgImg, geom);
        activeObject.set({ angle });
        activeObject.setCoords();
        fabricCanvasRef.current?.renderAll();
        updateGeometryState(activeObject);
        pushToHistory();
        alert(`Exact corners not found. Estimated rotation applied: ${Math.round(angle)}°`);
      }
    } else {
      alert('OpenCV.js is still loading or failed to load.');
    }
  };

  // Sync selection change to settings panel (Section 2: Selection must NOT trigger Perspective conversion!)
  const handleSelectionChange = (target: any) => {
    setActiveObject(target);
    updateGeometryState(target);

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
          safelyApplyWarpedElement(activeObject, flatCanvas, activeObject.corners);
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
  
  // Helper to verify that canvas contains non-transparent pixels (Section 2)
  const hasVisiblePixels = (canvas: HTMLCanvasElement): boolean => {
    const ctx = canvas.getContext('2d', {
      willReadFrequently: true,
    });

    if (!ctx || canvas.width < 1 || canvas.height < 1) {
      return false;
    }

    try {
      const pixels = ctx.getImageData(
        0,
        0,
        canvas.width,
        canvas.height
      ).data;

      for (let i = 3; i < pixels.length; i += 4) {
        if (pixels[i] > 0) return true;
      }
    } catch (e) {
      console.warn('hasVisiblePixels read failed:', e);
    }
    return false;
  };

  // Reusable helper to safely apply warped element after validation (Section 5)
  const safelyApplyWarpedElement = (
    plateObject: any,
    flatCanvas: HTMLCanvasElement,
    corners: Point[]
  ): boolean => {
    if (!hasVisiblePixels(flatCanvas)) {
      console.error('Flat plate source is empty.');
      return false;
    }

    try {
      const warpedCanvas = warpCanvasPerspective(
        flatCanvas,
        corners
      );

      if (
        warpedCanvas.width <= 1 ||
        warpedCanvas.height <= 1 ||
        !hasVisiblePixels(warpedCanvas)
      ) {
        console.error('Warped plate result is empty.');
        return false;
      }

      plateObject.setElement(warpedCanvas);
      plateObject.set({
        visible: true,
        opacity: plateObject.plateOptions?.opacity ?? 1.0,
      });
      plateObject.dirty = true;
      plateObject.setCoords();

      return true;
    } catch (e) {
      console.error('Perspective warp failed inside safelyApplyWarpedElement:', e);
      return false;
    }
  };

  // Helper to extract 4 transformed corner points from standard plate bounding box (Section 7)
  const getPlateCorners = (obj: any): Point[] => {
    const coords = obj.getCoords();
    if (coords && coords.length === 4) {
      const mapped = [
        { x: coords[0].x, y: coords[0].y }, // tl
        { x: coords[1].x, y: coords[1].y }, // tr
        { x: coords[2].x, y: coords[2].y }, // br
        { x: coords[3].x, y: coords[3].y }, // bl
      ];
      const isFinitePoint = (p: Point) => Number.isFinite(p.x) && Number.isFinite(p.y);
      if (mapped.every(isFinitePoint)) {
        return mapped;
      }
    }

    // Fallback manual calculation if getCoords() fails or has non-finite values
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
      getRotatedPoint(-w / 2, -h / 2), // tl
      getRotatedPoint(w / 2, -h / 2),  // tr
      getRotatedPoint(w / 2, h / 2),   // br
      getRotatedPoint(-w / 2, h / 2),  // bl
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

        // ==================================================
        // 4. PROTECT handlePlateModeChange() (Section 4)
        // ==================================================
        const flatCanvas = renderFlatPlateCanvas(activeObject.plateOptions, imageMetadata.width, imageMetadata.height);
        
        const minX = Math.min(...corners.map((p) => p.x));
        const minY = Math.min(...corners.map((p) => p.y));

        const ok = safelyApplyWarpedElement(activeObject, flatCanvas, corners);
        if (!ok) {
          alert('Perspective preview could not be created. Warp result failed validation.');
          isSyncingRef.current = false;
          return;
        }

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
          boundingBox: { minX, minY, width: (activeObject.getElement() as HTMLCanvasElement).width, height: (activeObject.getElement() as HTMLCanvasElement).height },
          previewCanvasWidth: (activeObject.getElement() as HTMLCanvasElement).width,
          previewCanvasHeight: (activeObject.getElement() as HTMLCanvasElement).height,
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
    safelyApplyWarpedElement(activeObject, flatCanvas, activeObject.corners);

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
    safelyApplyWarpedElement(activeObject, flatCanvas, resetCorners);

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
      safelyApplyWarpedElement(activeObject, flatCanvas, offsetCorners);

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
      if (!hasVisiblePixels(flatCanvas)) {
        alert('Could not duplicate plate: Flat plate source is empty.');
        return;
      }
      const warpedCanvas = warpCanvasPerspective(flatCanvas, offsetCorners);
      if (warpedCanvas.width <= 1 || warpedCanvas.height <= 1 || !hasVisiblePixels(warpedCanvas)) {
        alert('Could not duplicate plate: Warped plate result is empty.');
        return;
      }

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
          safelyApplyWarpedElement(plateObj, flatCanvas, corners);

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
            h.set({ fill: hIdx === index ? '#8B0000' : '#FFFFFF' });
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
          }
          activeObj.setCoords();
        }

        if (moved) {
          canvas.renderAll();
          updateGeometryState(activeObj);
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

              {/* 17. Detection & Selection Toolbar */}
              <div className="bg-neutral-900 border border-neutral-850 p-4 rounded-xl flex flex-wrap items-center justify-between gap-3 w-full shadow-lg">
                <div className="flex flex-wrap items-center gap-3">
                  <button
                    type="button"
                    onClick={handleDetectNumberPlate}
                    disabled={isDetecting}
                    className={`px-4 py-2 text-xs font-bold rounded-lg cursor-pointer transition-all flex items-center gap-1.5 shadow-sm border
                      ${
                        isDetecting
                          ? 'bg-neutral-800 text-neutral-500 border-neutral-750'
                          : 'bg-red-950 text-red-400 hover:bg-red-900/60 border-red-900'
                      }`}
                  >
                    {isDetecting ? (
                      <>
                        <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                        <span>{detectionStatus || 'Detecting...'}</span>
                      </>
                    ) : (
                      <>
                        <ShieldCheck className="w-3.5 h-3.5" />
                        <span>Detect Number Plate</span>
                      </>
                    )}
                  </button>

                  <button
                    type="button"
                    onClick={isManualSelecting ? handleCancelManualSelection : handleStartManualSelection}
                    className={`px-4 py-2 text-xs font-bold rounded-lg cursor-pointer transition-all flex items-center gap-1.5 shadow-sm border
                      ${
                        isManualSelecting
                          ? 'bg-yellow-950 text-yellow-400 hover:bg-yellow-900/65 border-yellow-900 animate-pulse'
                          : 'bg-neutral-800 hover:bg-neutral-750 text-neutral-300 border-neutral-750'
                      }`}
                  >
                    <Eye className="w-3.5 h-3.5" />
                    <span>{isManualSelecting ? 'Cancel Manual Selection' : 'Select Plate Area Manually'}</span>
                  </button>
                </div>

                {/* Status messages and conditional actions */}
                <div className="flex items-center gap-2">
                  {detectedPlates.length > 0 && (
                    <>
                      <span className="text-xs text-neutral-400 mr-2">
                        Detected: <span className="text-green-400 font-bold">{detectedPlates.length} plates</span>
                      </span>
                      <button
                        type="button"
                        onClick={handleBrandAllDetectedPlates}
                        className="px-3 py-1.5 text-[11px] font-bold bg-neutral-800 hover:bg-neutral-750 text-white rounded-lg border border-neutral-700 cursor-pointer transition-all"
                      >
                        Brand All
                      </button>
                      <button
                        type="button"
                        onClick={clearDetectionBoxes}
                        className="px-3 py-1.5 text-[11px] font-bold bg-neutral-800 hover:bg-neutral-750 text-white rounded-lg border border-neutral-700 cursor-pointer transition-all"
                      >
                        Clear Boxes
                      </button>
                    </>
                  )}
                  {isModelMissing && (
                    <span className="text-xs text-yellow-500 font-medium">
                      ⚠️ Automatic detection is unavailable. You can select the number plate manually.
                    </span>
                  )}
                  {detectionStatus && !isDetecting && detectedPlates.length === 0 && (
                    <span className="text-xs text-neutral-500 italic">
                      Status: {detectionStatus}
                    </span>
                  )}
                </div>
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
                    geometry={activeGeometry}
                    onNudge={handleNudge}
                    onUpdateGeometry={handleUpdateGeometry}
                    onChange={handlePlateOptionsChange}
                    onApplyPreset={handleApplyPlatePreset}
                    onReDetectAngle={handleReDetectPlateAngle}
                    isWarpedPlate={activeObject && activeObject.isNamePlate && activeObject.plateMode === 'perspective'}
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
