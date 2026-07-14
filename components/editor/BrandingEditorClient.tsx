'use client';

import React, { useEffect, useRef, useState } from 'react';
import { Canvas, FabricImage, Group, Circle, Point as FabricPoint } from 'fabric';
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
import { Eye, ShieldCheck, Palette, Image as ImageIcon, Download, RefreshCw, ZoomIn } from 'lucide-react';

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

  // Perspective Handles Ref
  const handlesRef = useRef<Circle[]>([]);

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

  // Perspective State for Selected Plate
  const [selectedPlateMode, setSelectedPlateMode] = useState<PlateMode>('standard');

  // UI Tabs & Zoom states
  const [activeTab, setActiveTab] = useState<'plates' | 'watermark' | 'export'>('plates');
  const [zoomLevel, setZoomLevel] = useState<number>(1.0); // Viewport Zoom (1.0 = Fit to Screen)
  const [displayScale, setDisplayScale] = useState<number>(1.0); // displayWidth / originalWidth
  
  const [isPreviewActive, setIsPreviewActive] = useState<boolean>(false);
  const [isConfirmResetOpen, setIsConfirmResetOpen] = useState<boolean>(false);
  const [isExporting, setIsExporting] = useState<boolean>(false);
  
  // Panning State
  const [spacePressed, setSpacePressed] = useState(false);

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

  const handleUndo = () => {
    if (undoStack.length <= 1) return; // Keep at least the initial state

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
    setActiveObject(null);
    setUndoStack([]);
    setRedoStack([]);
    setZoomLevel(1.0);
    setDisplayScale(1.0);
    setIsPreviewActive(false);
    setIsWatermarkManual(false);
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
      // Prevent duplicate states in sequence
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
      // Remove any existing perspective handles
      clearPerspectiveHandles(canvas);

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

      // 2. Name Plates
      const canvasObjects = canvas.getObjects();
      const existingPlates = canvasObjects.filter((obj: any) => obj.isNamePlate);

      // Remove plates not present in snap
      for (const plate of existingPlates) {
        if (!snap.plates.some((p) => p.id === (plate as any).id)) {
          canvas.remove(plate);
        }
      }

      // Update or create plates from snap
      for (const plateState of snap.plates) {
        const existing = existingPlates.find((p) => (p as any).id === plateState.id) as any;
        
        if (existing) {
          existing.plateMode = plateState.plateMode;
          existing.plateOptions = { ...plateState.plateOptions };
          existing.corners = plateState.corners ? plateState.corners.map((p) => ({ ...p })) : null;

          if (plateState.plateMode === 'standard') {
            // Restore standard plate group
            updatePlateProperties(existing, plateState.plateOptions);
            existing.set({
              left: plateState.left,
              top: plateState.top,
              scaleX: plateState.scaleX,
              scaleY: plateState.scaleY,
              angle: plateState.angle,
              opacity: plateState.opacity,
            });
            existing.setCoords();
          } else {
            // Restore warped plate image
            const flatCanvas = renderFlatPlateCanvas(plateState.plateOptions, imageMetadata.width, imageMetadata.height);
            const warpedCanvas = warpCanvasPerspective(flatCanvas, plateState.corners!);
            existing.setElement(warpedCanvas);
            
            const minX = Math.min(...plateState.corners!.map((p) => p.x));
            const minY = Math.min(...plateState.corners!.map((p) => p.y));
            existing.set({
              left: minX,
              top: minY,
              scaleX: 1,
              scaleY: 1,
              angle: 0,
              opacity: plateState.opacity,
            });
            existing.setCoords();
          }
        } else {
          // Re-create plate
          let newPlate: any;
          if (plateState.plateMode === 'standard') {
            newPlate = createNamePlate(plateState.plateOptions, imageMetadata.width, imageMetadata.height);
            newPlate.set({
              left: plateState.left,
              top: plateState.top,
              scaleX: plateState.scaleX,
              scaleY: plateState.scaleY,
              angle: plateState.angle,
            });
          } else {
            const flatCanvas = renderFlatPlateCanvas(plateState.plateOptions, imageMetadata.width, imageMetadata.height);
            const warpedCanvas = warpCanvasPerspective(flatCanvas, plateState.corners!);
            newPlate = new FabricImage(warpedCanvas, {
              opacity: plateState.opacity,
              selectable: true,
            });
            newPlate.isNamePlate = true;
            
            const minX = Math.min(...plateState.corners!.map((p) => p.x));
            const minY = Math.min(...plateState.corners!.map((p) => p.y));
            newPlate.set({
              left: minX,
              top: minY,
            });
          }

          newPlate.id = plateState.id;
          newPlate.plateMode = plateState.plateMode;
          newPlate.plateOptions = { ...plateState.plateOptions };
          newPlate.corners = plateState.corners ? plateState.corners.map((p) => ({ ...p })) : null;
          
          canvas.add(newPlate);
        }
      }

      // If active object changed, re-sync selection state
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

  // Keyboard Spacebar Tracking for Panning
  useEffect(() => {
    const handleSpaceDown = (e: KeyboardEvent) => {
      if (e.code === 'Space') {
        const activeEl = document.activeElement;
        const isTyping =
          activeEl &&
          (activeEl.tagName === 'INPUT' ||
            activeEl.tagName === 'TEXTAREA' ||
            activeEl.getAttribute('contenteditable') === 'true');

        if (!isTyping) {
          e.preventDefault();
          setSpacePressed(true);
        }
      }
    };

    const handleSpaceUp = (e: KeyboardEvent) => {
      if (e.code === 'Space') {
        setSpacePressed(false);
      }
    };

    window.addEventListener('keydown', handleSpaceDown);
    window.addEventListener('keyup', handleSpaceUp);

    return () => {
      window.removeEventListener('keydown', handleSpaceDown);
      window.removeEventListener('keyup', handleSpaceUp);
    };
  }, []);

  // Main Canvas Setup Hook
  useEffect(() => {
    if (!imageUrl || !canvasElRef.current || !containerRef.current) return;

    let canvas: Canvas;
    const bgImage = new Image();

    bgImage.onload = async () => {
      bgImageElementRef.current = bgImage;
      const originalWidth = bgImage.naturalWidth;
      const originalHeight = bgImage.naturalHeight;

      // 1. Fit Canvas visually within container
      const containerWidth = containerRef.current?.clientWidth || 800;
      const containerHeight = Math.min(500, window.innerHeight * 0.5);

      const { width: displayWidth, height: displayHeight } = fitDimensions(
        originalWidth,
        originalHeight,
        containerWidth,
        containerHeight
      );

      const initialScale = displayWidth / originalWidth;
      setDisplayScale(initialScale);

      // 2. Initialize Fabric Canvas
      // We set the actual drawing buffer (width, height) to original dimensions!
      // And we set CSS size using options or manually to displayWidth, displayHeight.
      // This is the 1:1 logical original-image coordinates system.
      canvas = new Canvas(canvasElRef.current!, {
        width: originalWidth,
        height: originalHeight,
        selectionColor: 'rgba(128, 0, 0, 0.15)',
        selectionBorderColor: '#8B0000',
        selectionLineWidth: 1.5,
        fireRightClick: true, // For potential future panning
      });
      fabricCanvasRef.current = canvas;

      // Apply CSS visual scale to fit the container correctly
      canvas.setDimensions(
        { width: displayWidth + 'px', height: displayHeight + 'px' },
        { cssOnly: true }
      );

      // 3. Add Background Image at 1:1 scale (Original coordinate space!)
      const fabricBg = new FabricImage(bgImage, {
        left: 0,
        top: 0,
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
      });
      bgFabricObjectRef.current = fabricBg;
      canvas.add(fabricBg);
      canvas.sendObjectToBack(fabricBg);

      // 4. Load watermark logo
      await handleInitializeWatermark(canvas, originalWidth, originalHeight);

      // 5. Canvas Event Listeners
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

      // Helper to safely extract mouse or touch event coordinates
      const getEventCoords = (e: any) => {
        if (e.touches && e.touches.length > 0) {
          return { clientX: e.touches[0].clientX, clientY: e.touches[0].clientY };
        }
        if (e.changedTouches && e.changedTouches.length > 0) {
          return { clientX: e.changedTouches[0].clientX, clientY: e.changedTouches[0].clientY };
        }
        return { clientX: e.clientX || 0, clientY: e.clientY || 0 };
      };

      // Panning Listeners
      let isPanning = false;
      let lastPosX = 0;
      let lastPosY = 0;

      canvas.on('mouse:down', (opt) => {
        const evt = opt.e;
        // Pan on Spacebar down or Alt key down
        if (spacePressed || evt.altKey) {
          isPanning = true;
          canvas.selection = false;
          const coords = getEventCoords(evt);
          lastPosX = coords.clientX;
          lastPosY = coords.clientY;
          canvas.discardActiveObject();
          canvas.renderAll();
        }
      });

      canvas.on('mouse:move', (opt) => {
        if (isPanning) {
          const evt = opt.e;
          const vpt = (canvas.viewportTransform ? [...canvas.viewportTransform] : [1, 0, 0, 1, 0, 0]) as [number, number, number, number, number, number];
          
          const coords = getEventCoords(evt);
          vpt[4] += coords.clientX - lastPosX;
          vpt[5] += coords.clientY - lastPosY;
          
          canvas.viewportTransform = vpt;
          canvas.requestRenderAll();
          
          lastPosX = coords.clientX;
          lastPosY = coords.clientY;
        }
      });

      canvas.on('mouse:up', () => {
        isPanning = false;
        canvas.selection = true;
      });

      // Save initial state to history stack
      const initialSnap = captureCanvasStateSnapshot();
      if (initialSnap) {
        setUndoStack([initialSnap]);
      }

      canvas.renderAll();
    };

    bgImage.src = imageUrl;

    // 6. Setup ResizeObserver to handle container scaling automatically
    // Resolves the tiny-image display bug by recalculating dimensions as layout loads
    const observer = new ResizeObserver((entries) => {
      if (entries.length === 0 || !fabricCanvasRef.current || !bgImageElementRef.current) return;
      const fCanvas = fabricCanvasRef.current;
      const bgImg = bgImageElementRef.current;

      const containerWidth = entries[0].contentRect.width || 800;
      const containerHeight = Math.min(500, window.innerHeight * 0.5);

      const { width: newWidth, height: newHeight } = fitDimensions(
        bgImg.naturalWidth,
        bgImg.naturalHeight,
        containerWidth,
        containerHeight
      );

      const currentScale = newWidth / bgImg.naturalWidth;
      setDisplayScale(currentScale);

      // Simply update the CSS dimensions of the canvas element
      // Logical sizes and object coordinates remain completely untouched!
      fCanvas.setDimensions(
        { width: newWidth + 'px', height: newHeight + 'px' },
        { cssOnly: true }
      );
      fCanvas.renderAll();
    });

    observer.observe(containerRef.current);

    return () => {
      observer.disconnect();
      if (canvas) {
        canvas.dispose();
      }
      fabricCanvasRef.current = null;
    };
  }, [imageUrl, spacePressed]);

  // Load and position watermark in original 1:1 coordinate space
  const handleInitializeWatermark = async (
    canvas: Canvas,
    origWidth: number,
    origHeight: number,
    customUrl?: string
  ) => {
    setLogoError(null);
    const logoUrl = customUrl || watermarkOptions.customLogoUrl || '/branding/thennakoon-tours-logo.png';

    try {
      const logoImg = await loadLogoImage(logoUrl);

      // Remove existing watermark if present
      if (watermarkFabricObjectRef.current) {
        canvas.remove(watermarkFabricObjectRef.current);
      }

      // Calculate watermark coordinates directly in 1:1 original coordinate space
      const { left, top, scale } = getWatermarkCoords(
        logoImg.naturalWidth,
        logoImg.naturalHeight,
        origWidth,
        origHeight,
        { ...watermarkOptions, customLogoUrl: customUrl || watermarkOptions.customLogoUrl }
      );

      const wm = new FabricImage(logoImg, {
        left,
        top,
        scaleX: scale,
        scaleY: scale,
        opacity: watermarkOptions.opacity,
        visible: watermarkOptions.visible && !isPreviewActive,
        selectable: true,
        hasControls: true,
        hasBorders: true,
        transparentCorners: false,
        cornerColor: '#8B0000',
        cornerStrokeColor: '#FFFFFF',
        borderColor: '#8B0000',
        cornerSize: Math.max(12, Math.round(12 / displayScale)), // scale control handle for usability
      });

      (wm as any).isWatermark = true;
      watermarkFabricObjectRef.current = wm;
      canvas.add(wm);
      canvas.bringObjectToFront(wm);
      canvas.renderAll();
    } catch (err) {
      console.warn('Default company logo failed to load:', err);
      setLogoError('Logo file not found. You can upload a logo manually.');
      if (watermarkFabricObjectRef.current) {
        canvas.remove(watermarkFabricObjectRef.current);
        watermarkFabricObjectRef.current = null;
      }
    }
  };

  // Sync selection change to settings panel
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

      // Focus tab
      setActiveTab('plates');

      // Initialize perspective handles if in perspective mode
      if (target.plateMode === 'perspective') {
        renderPerspectiveHandles(fabricCanvasRef.current!, target);
      } else {
        clearPerspectiveHandles(fabricCanvasRef.current!);
      }
    } else if (target && target.isWatermark) {
      setActiveTab('watermark');
      clearPerspectiveHandles(fabricCanvasRef.current!);
    } else {
      clearPerspectiveHandles(fabricCanvasRef.current!);
    }
  };

  // Action: Add Name Plate (placed at center of original photo coordinate space)
  const handleAddPlate = () => {
    const canvas = fabricCanvasRef.current;
    if (!canvas || !imageMetadata) return;

    if (isPreviewActive) handleTogglePreview(false);

    const plate = createNamePlate(plateOptions, imageMetadata.width, imageMetadata.height);
    
    // Add custom identification tags
    const id = 'plate_' + Math.random().toString(36).substring(2, 11);
    (plate as any).id = id;
    (plate as any).plateMode = 'standard';
    (plate as any).plateOptions = { ...plateOptions };
    (plate as any).corners = null;

    canvas.add(plate);
    canvas.setActiveObject(plate);
    canvas.renderAll();

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
          // Standard Group Update
          updatePlateProperties(activeObject, next);
        } else {
          // Perspective Warp Update
          const flatCanvas = renderFlatPlateCanvas(activeObject.plateOptions, imageMetadata.width, imageMetadata.height);
          const warpedCanvas = warpCanvasPerspective(flatCanvas, activeObject.corners);
          activeObject.setElement(warpedCanvas);
          
          if (updated.opacity !== undefined) {
            activeObject.set({ opacity: updated.opacity });
          }
        }
        
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

    handleInitializeWatermark(canvas, imageMetadata.width, imageMetadata.height, url).then(() => {
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

    handleInitializeWatermark(canvas, imageMetadata.width, imageMetadata.height, '/branding/thennakoon-tours-logo.png').then(() => {
      pushToHistory();
    });
  };

  // Switch Selected Plate Mode (Standard Flat vs 4-Corner Warp)
  const handlePlateModeChange = (mode: PlateMode) => {
    const canvas = fabricCanvasRef.current;
    if (!canvas || !activeObject || !activeObject.isNamePlate || !imageMetadata) return;

    if (mode === activeObject.plateMode) return;

    isSyncingRef.current = true;

    try {
      if (mode === 'perspective') {
        // Switch to Perspective Warped Image
        // 1. Calculate base dimensions of current flat plate group
        const baseWidth = activeObject.width * activeObject.scaleX;
        const baseHeight = activeObject.height * activeObject.scaleY;
        const cx = activeObject.left;
        const cy = activeObject.top;

        // 2. Rotate corners to compute absolute 4 coordinates in original-space
        const rad = (activeObject.angle || 0) * Math.PI / 180;
        const cos = Math.cos(rad);
        const sin = Math.sin(rad);

        const getRotatedPoint = (rx: number, ry: number) => ({
          x: cx + rx * cos - ry * sin,
          y: cy + rx * sin + ry * cos,
        });

        const initialCorners: Point[] = [
          getRotatedPoint(-baseWidth / 2, -baseHeight / 2), // TL
          getRotatedPoint(baseWidth / 2, -baseHeight / 2),  // TR
          getRotatedPoint(baseWidth / 2, baseHeight / 2),   // BR
          getRotatedPoint(-baseWidth / 2, baseHeight / 2),  // BL
        ];

        // 3. Render flat plate design and warp
        const flatCanvas = renderFlatPlateCanvas(activeObject.plateOptions, imageMetadata.width, imageMetadata.height);
        const warpedCanvas = warpCanvasPerspective(flatCanvas, initialCorners);

        // 4. Create warped FabricImage
        const warpedImageObj = new FabricImage(warpedCanvas, {
          opacity: activeObject.opacity,
          selectable: true,
          hasControls: false, // drag is supported, corner resizing is done via handle handles
          hasBorders: false,
        });

        // Copy plate metadata
        const id = activeObject.id;
        const options = { ...activeObject.plateOptions };
        
        (warpedImageObj as any).id = id;
        (warpedImageObj as any).isNamePlate = true;
        (warpedImageObj as any).plateMode = 'perspective';
        (warpedImageObj as any).plateOptions = options;
        (warpedImageObj as any).corners = initialCorners;

        // Track drag delta to move all corners together
        (warpedImageObj as any).lastLeft = warpedImageObj.left;
        (warpedImageObj as any).lastTop = warpedImageObj.top;

        warpedImageObj.on('moving', () => {
          const dx = warpedImageObj.left - (warpedImageObj as any).lastLeft;
          const dy = warpedImageObj.top - (warpedImageObj as any).lastTop;
          
          (warpedImageObj as any).lastLeft = warpedImageObj.left;
          (warpedImageObj as any).lastTop = warpedImageObj.top;

          // Shift corners
          (warpedImageObj as any).corners = (warpedImageObj as any).corners.map((p: Point) => ({
            x: p.x + dx,
            y: p.y + dy,
          }));

          // Synchronize handles
          handlesRef.current.forEach((h: any) => {
            const corner = (warpedImageObj as any).corners[h.cornerIndex];
            h.set({ left: corner.x, top: corner.y });
            h.setCoords();
          });
        });

        // Remove old group, add new warped image
        canvas.remove(activeObject);
        canvas.add(warpedImageObj);
        canvas.setActiveObject(warpedImageObj);
        
        setSelectedPlateMode('perspective');
        setActiveObject(warpedImageObj);

        // Draw handles
        renderPerspectiveHandles(canvas, warpedImageObj);
      } else {
        // Switch back to Standard flat group
        clearPerspectiveHandles(canvas);

        const newPlate = createNamePlate(activeObject.plateOptions, imageMetadata.width, imageMetadata.height);
        
        // Compute center point of corners
        const corners = activeObject.corners as Point[];
        const cx = corners.reduce((sum, p) => sum + p.x, 0) / 4;
        const cy = corners.reduce((sum, p) => sum + p.y, 0) / 4;

        // Recreate flat
        const id = activeObject.id;
        const options = { ...activeObject.plateOptions };
        
        (newPlate as any).id = id;
        (newPlate as any).isNamePlate = true;
        (newPlate as any).plateMode = 'standard';
        (newPlate as any).plateOptions = options;
        (newPlate as any).corners = null;

        newPlate.set({
          left: cx,
          top: cy,
          angle: 0,
          opacity: activeObject.opacity,
        });

        canvas.remove(activeObject);
        canvas.add(newPlate);
        canvas.setActiveObject(newPlate);

        setSelectedPlateMode('standard');
        setActiveObject(newPlate);
      }

      canvas.renderAll();
      pushToHistory();
    } catch (err) {
      console.error('Error switching plate mode:', err);
    } finally {
      isSyncingRef.current = false;
    }
  };

  // Generate corner handle points for Perspective Warping
  const renderPerspectiveHandles = (canvas: Canvas, plateObj: any) => {
    clearPerspectiveHandles(canvas);

    const corners = plateObj.corners as Point[];
    if (!corners) return;

    const handles: Circle[] = [];

    corners.forEach((pt, index) => {
      // Calculate handle size scaled so it remains readable regardless of zoom
      const handleRadius = Math.max(12, Math.round(12 / (displayScale * zoomLevel)));

      const handle = new Circle({
        left: pt.x,
        top: pt.y,
        radius: handleRadius,
        fill: '#8B0000',
        stroke: '#FFFFFF',
        strokeWidth: Math.max(2, Math.round(2 / (displayScale * zoomLevel))),
        originX: 'center',
        originY: 'center',
        hasControls: false,
        hasBorders: false,
        selectable: true,
      });

      (handle as any).isPerspectiveHandle = true;
      (handle as any).cornerIndex = index;
      (handle as any).plateId = plateObj.id;

      // Draggable listener for handles
      handle.on('moving', () => {
        const nextX = handle.left;
        const nextY = handle.top;

        // Check if movement creates self-intersection (must remain convex)
        const proposedCorners = corners.map((p, idx) =>
          idx === index ? { x: nextX, y: nextY } : { ...p }
        );

        if (isConvex(proposedCorners)) {
          corners[index].x = nextX;
          corners[index].y = nextY;

          // Re-warp flat design
          const flatCanvas = renderFlatPlateCanvas(plateObj.plateOptions, bgImageElementRef.current!.naturalWidth, bgImageElementRef.current!.naturalHeight);
          const warpedCanvas = warpCanvasPerspective(flatCanvas, corners);
          plateObj.setElement(warpedCanvas);

          // Adjust relative bounding box position
          const minX = Math.min(...corners.map((p) => p.x));
          const minY = Math.min(...corners.map((p) => p.y));
          
          plateObj.set({ left: minX, top: minY });
          plateObj.setCoords();
          (plateObj as any).lastLeft = minX;
          (plateObj as any).lastTop = minY;

          canvas.renderAll();
        } else {
          // Revert coordinate if non-convex
          handle.set({ left: corners[index].x, top: corners[index].y });
          handle.setCoords();
        }
      });

      // Save state when drag finished
      handle.on('modified', () => {
        pushToHistory();
      });

      canvas.add(handle);
      canvas.bringObjectToFront(handle);
      handles.push(handle);
    });

    handlesRef.current = handles;
    canvas.renderAll();
  };

  const clearPerspectiveHandles = (canvas: Canvas) => {
    const handles = canvas.getObjects().filter((obj: any) => obj.isPerspectiveHandle);
    handles.forEach((h) => canvas.remove(h));
    handlesRef.current = [];
  };

  // Perspective Actions: Copy Previous Shape
  const handleCopyPreviousShape = () => {
    const canvas = fabricCanvasRef.current;
    if (!canvas || !activeObject || !activeObject.isNamePlate || activeObject.plateMode !== 'perspective') return;

    // Find another perspective plate
    const other = canvas.getObjects().find(
      (obj: any) => obj.isNamePlate && obj.plateMode === 'perspective' && obj.id !== activeObject.id
    ) as any;

    if (other && other.corners && other.corners.length === 4) {
      // Find delta translation to center new shape over this plate
      const otherCenter = {
        x: other.corners.reduce((s: number, p: Point) => s + p.x, 0) / 4,
        y: other.corners.reduce((s: number, p: Point) => s + p.y, 0) / 4,
      };

      const myCenter = {
        x: activeObject.corners.reduce((s: number, p: Point) => s + p.x, 0) / 4,
        y: activeObject.corners.reduce((s: number, p: Point) => s + p.y, 0) / 4,
      };

      const dx = myCenter.x - otherCenter.x;
      const dy = myCenter.y - otherCenter.y;

      // Copy corners shifted by center delta
      activeObject.corners = other.corners.map((p: Point) => ({
        x: p.x + dx,
        y: p.y + dy,
      }));

      // Render warp
      const flatCanvas = renderFlatPlateCanvas(activeObject.plateOptions, bgImageElementRef.current!.naturalWidth, bgImageElementRef.current!.naturalHeight);
      const warpedCanvas = warpCanvasPerspective(flatCanvas, activeObject.corners);
      activeObject.setElement(warpedCanvas);

      const minX = Math.min(...activeObject.corners.map((p: any) => p.x));
      const minY = Math.min(...activeObject.corners.map((p: any) => p.y));
      activeObject.set({ left: minX, top: minY });
      activeObject.setCoords();
      
      activeObject.lastLeft = minX;
      activeObject.lastTop = minY;

      // Redraw handles
      renderPerspectiveHandles(canvas, activeObject);
      pushToHistory();
    }
  };

  // Zoom / Viewport Panning Controls (Part 6)
  const handleZoom = (type: 'in' | 'out' | 'fit' | '100%') => {
    const canvas = fabricCanvasRef.current;
    if (!canvas) return;

    let newZoom = zoomLevel;
    const vpt = (canvas.viewportTransform ? [...canvas.viewportTransform] : [1, 0, 0, 1, 0, 0]) as [number, number, number, number, number, number];

    if (type === 'in') {
      newZoom = Math.min(5.0, zoomLevel * 1.25);
      const zoomFactor = displayScale * newZoom;
      vpt[0] = zoomFactor;
      vpt[3] = zoomFactor;
      // Zoom from center
      vpt[4] = (canvas.width * displayScale / 2) * (1 - newZoom);
      vpt[5] = (canvas.height * displayScale / 2) * (1 - newZoom);
    } else if (type === 'out') {
      newZoom = Math.max(0.2, zoomLevel / 1.25);
      const zoomFactor = displayScale * newZoom;
      vpt[0] = zoomFactor;
      vpt[3] = zoomFactor;
      vpt[4] = (canvas.width * displayScale / 2) * (1 - newZoom);
      vpt[5] = (canvas.height * displayScale / 2) * (1 - newZoom);
    } else if (type === '100%') {
      newZoom = 1.0 / displayScale; // renders exactly 1:1 original-to-screen pixels
      vpt[0] = 1.0;
      vpt[3] = 1.0;
      vpt[4] = (canvas.width * displayScale - canvas.width) / 2;
      vpt[5] = (canvas.height * displayScale - canvas.height) / 2;
    } else {
      // Fit to Screen
      newZoom = 1.0;
      vpt[0] = displayScale;
      vpt[3] = displayScale;
      vpt[4] = 0;
      vpt[5] = 0;
    }

    setZoomLevel(newZoom);
    canvas.viewportTransform = vpt;

    // Re-scale handle handle sizes on zoom so they remain clickable
    canvas.getObjects().forEach((obj: any) => {
      if (obj.isPerspectiveHandle) {
        const handleRadius = Math.max(12, Math.round(12 / (displayScale * newZoom)));
        obj.set({
          radius: handleRadius,
          strokeWidth: Math.max(2, Math.round(2 / (displayScale * newZoom))),
        });
        obj.setCoords();
      }
    });

    canvas.requestRenderAll();
  };

  // Before / After Preview Toggle (Part 12)
  const handleTogglePreview = (active: boolean) => {
    const canvas = fabricCanvasRef.current;
    if (!canvas) return;

    setIsPreviewActive(active);
    canvas.discardActiveObject();
    clearPerspectiveHandles(canvas);

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
        // Can't delete perspective handles
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

  // Reset Editor (Part 12)
  const handleResetEditor = () => {
    const canvas = fabricCanvasRef.current;
    if (!canvas || !imageMetadata) return;

    isSyncingRef.current = true;

    // 1. Remove all plates and handles
    clearPerspectiveHandles(canvas);
    const plates = canvas.getObjects().filter((obj: any) => obj.isNamePlate);
    plates.forEach((p) => canvas.remove(p));

    // 2. Restore Default Watermark (opacity 100%, bottom-left, preset mode)
    setWatermarkOptions({
      visible: true,
      opacity: 1.0,
      scale: 0.18,
      position: 'bottom-left',
      customLogoUrl: null,
    });
    setIsWatermarkManual(false);

    handleInitializeWatermark(canvas, imageMetadata.width, imageMetadata.height).then(() => {
      // 3. Reset Zoom to fit
      handleZoom('fit');
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

      // Delete/Backspace
      if (e.key === 'Delete' || e.key === 'Backspace') {
        e.preventDefault();
        handleDeleteSelected();
      }

      // Undo/Redo
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

      // Arrow keys nudging (Moves objects in original image pixels!)
      const activeObj = canvas.getActiveObject() as any;
      if (activeObj && !isPreviewActive) {
        const step = e.shiftKey ? 10 : 1;
        let moved = false;

        if (activeObj.isPerspectiveHandle) {
          // Move perspective corner handle
          const index = activeObj.cornerIndex;
          const plate = canvas.getObjects().find((obj: any) => obj.isNamePlate && obj.id === activeObj.plateId) as any;
          if (plate && plate.corners) {
            const nextX = activeObj.left + (e.key === 'ArrowRight' ? step : e.key === 'ArrowLeft' ? -step : 0);
            const nextY = activeObj.top + (e.key === 'ArrowDown' ? step : e.key === 'ArrowUp' ? -step : 0);

            const proposed = plate.corners.map((p: Point, idx: number) =>
              idx === index ? { x: nextX, y: nextY } : { ...p }
            );

            if (isConvex(proposed)) {
              activeObj.set({ left: nextX, top: nextY });
              plate.corners[index].x = nextX;
              plate.corners[index].y = nextY;

              const flatCanvas = renderFlatPlateCanvas(plate.plateOptions, bgImageElementRef.current!.naturalWidth, bgImageElementRef.current!.naturalHeight);
              const warpedCanvas = warpCanvasPerspective(flatCanvas, plate.corners);
              plate.setElement(warpedCanvas);

              const minX = Math.min(...plate.corners.map((p: any) => p.x));
              const minY = Math.min(...plate.corners.map((p: any) => p.y));
              plate.set({ left: minX, top: minY });
              plate.setCoords();
              plate.lastLeft = minX;
              plate.lastTop = minY;

              moved = true;
            }
          }
        } else {
          // Standard Plate / Watermark nudge (natively in 1:1 original pixels!)
          switch (e.key) {
            case 'ArrowUp':
              e.preventDefault();
              activeObj.set({ top: (activeObj.top || 0) - step });
              moved = true;
              break;
            case 'ArrowDown':
              e.preventDefault();
              activeObj.set({ top: (activeObj.top || 0) + step });
              moved = true;
              break;
            case 'ArrowLeft':
              e.preventDefault();
              activeObj.set({ left: (activeObj.left || 0) - step });
              moved = true;
              break;
            case 'ArrowRight':
              e.preventDefault();
              activeObj.set({ left: (activeObj.left || 0) + step });
              moved = true;
              break;
          }
          
          if (moved) {
            if (activeObj.isNamePlate && activeObj.plateMode === 'perspective') {
              // Shift all corners
              const dx = e.key === 'ArrowRight' ? step : e.key === 'ArrowLeft' ? -step : 0;
              const dy = e.key === 'ArrowDown' ? step : e.key === 'ArrowUp' ? -step : 0;
              activeObj.corners = activeObj.corners.map((p: Point) => ({
                x: p.x + dx,
                y: p.y + dy,
              }));
              activeObj.lastLeft = activeObj.left;
              activeObj.lastTop = activeObj.top;

              // Move handles in sync
              handlesRef.current.forEach((h: any) => {
                const pt = activeObj.corners[h.cornerIndex];
                h.set({ left: pt.x, top: pt.y });
                h.setCoords();
              });
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
  }, [undoStack, redoStack, activeObject, displayScale, zoomLevel, isPreviewActive]);

  // High-Resolution Export Execution
  const handleExportImage = async () => {
    const canvas = fabricCanvasRef.current;
    if (!canvas || !bgImageElementRef.current || !imageMetadata) return;

    setIsExporting(true);

    try {
      // Deselect and clear handles temporarily before exporting
      canvas.discardActiveObject();
      clearPerspectiveHandles(canvas);
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

      const link = document.createElement('a');
      const ext = exportFormat === 'jpeg' ? 'jpg' : 'png';
      const paddedNum = String(exportCount).padStart(3, '0');
      
      link.download = `Thennakoon-Tours-Branded-${paddedNum}.${ext}`;
      link.href = dataUrl;
      
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);

      setExportCount((prev) => prev + 1);

      // Restore handles if a perspective plate was previously active
      if (activeObject && activeObject.isNamePlate && activeObject.plateMode === 'perspective') {
        canvas.setActiveObject(activeObject);
        renderPerspectiveHandles(canvas, activeObject);
      }
    } catch (err) {
      console.error('Export failed:', err);
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <div className="flex flex-col flex-1 h-full min-h-0 bg-neutral-950 text-white overflow-hidden">
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
                      Flat & Perspective Plates
                    </h3>
                    <p className="text-xs leading-relaxed text-neutral-400">
                      Standard flat plates with rotation support, or use the <b>Perspective Mode</b> to stretch plate corners independently over angled number plates.
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
              {/* Rectified container ensures aspect-ratio fitting and no oversized black padding */}
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
                
                {/* Spacebar Pan indicator */}
                {spacePressed && (
                  <div className="absolute bottom-4 right-4 z-10 bg-neutral-900/90 border border-neutral-850 px-3 py-1.5 rounded-lg text-xs text-neutral-300 flex items-center gap-2 shadow-md">
                    <span>✋ Spacebar Hold: Drag to Pan Viewport</span>
                  </div>
                )}

                {/* Fabric Canvas wrapping element */}
                <div 
                  className="relative border border-neutral-800 rounded shadow-md overflow-hidden bg-neutral-950 max-w-full max-h-full"
                  style={{
                    cursor: spacePressed ? 'grab' : 'default',
                  }}
                >
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
                zoomLevel={zoomLevel}
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
                    onChangeMode={handlePlateModeChange}
                    onResetPerspective={() => handlePlateModeChange('standard')}
                    onCopyPreviousShape={handleCopyPreviousShape}
                    hasOtherPerspectivePlates={
                      fabricCanvasRef.current
                        ? fabricCanvasRef.current.getObjects().some(
                            (obj: any) =>
                              obj.isNamePlate && obj.plateMode === 'perspective' && obj.id !== activeObject?.id
                          )
                        : false
                    }
                    onChange={handlePlateOptionsChange}
                    onApplyPreset={handleApplyPlatePreset}
                  />
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
