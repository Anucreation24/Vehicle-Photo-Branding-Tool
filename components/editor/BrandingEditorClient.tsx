'use client';

import React, { useEffect, useRef, useState } from 'react';
import { Canvas, FabricImage, Group } from 'fabric';
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
} from '../../types';
import {
  createNamePlate,
  updatePlateProperties,
  getWatermarkCoords,
  fitDimensions,
} from '../../lib/canvasHelpers';
import { generateExportDataUrl } from '../../lib/exportHelpers';
import ImageUploader from '../ImageUploader';
import EditorToolbar from '../EditorToolbar';
import PlateSettings from '../PlateSettings';
import WatermarkSettings from '../WatermarkSettings';
import ExportPanel from '../ExportPanel';
import BeforeAfterToggle from '../BeforeAfterToggle';
import ConfirmDialog from '../ConfirmDialog';
import { Eye, ShieldCheck, Palette, Image as ImageIcon, Download, RefreshCw } from 'lucide-react';

// Define the Canvas State for Undo/Redo
interface SavedPlateState {
  id: string;
  text: string;
  backgroundColor: string;
  textColor: string;
  borderColor: string;
  borderWidth: number;
  cornerRadius: number;
  opacity: number;
  rotation: number;
  shadow: boolean;
  left: number;
  top: number;
  scaleX: number;
  scaleY: number;
  angle: number;
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
    borderWidth: 2,
    cornerRadius: 6,
    opacity: 1.0,
    rotation: 0,
    shadow: true,
  });

  const [watermarkOptions, setWatermarkOptions] = useState<WatermarkOptions>({
    visible: true,
    opacity: 0.85,
    scale: 0.15, // 15% of canvas width
    position: 'bottom-left',
    customLogoUrl: null,
  });

  // UI Tabs & Zoom states
  const [activeTab, setActiveTab] = useState<'plates' | 'watermark' | 'export'>('plates');
  const [zoomLevel, setZoomLevel] = useState<number>(1.0);
  const [isPreviewActive, setIsPreviewActive] = useState<boolean>(false);
  const [isConfirmResetOpen, setIsConfirmResetOpen] = useState<boolean>(false);
  const [isExporting, setIsExporting] = useState<boolean>(false);
  
  // Export Settings
  const [exportPreset, setExportPreset] = useState<ExportPreset>('original');
  const [exportFormat, setExportFormat] = useState<ExportFormat>('jpeg');
  const [exportQuality, setExportQuality] = useState<ExportQuality>(0.90);
  const [exportFitMethod, setExportFitMethod] = useState<FitMethod>('fit');
  const [exportBgColor, setExportBgColor] = useState<string>('#000000');
  const [exportCount, setExportCount] = useState<number>(1);

  // History Stacks
  const [undoStack, setUndoStack] = useState<SavedCanvasState[]>([]);
  const [redoStack, setRedoStack] = useState<SavedCanvasState[]>([]);
  const isSyncingRef = useRef(false);

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
    setActiveObject(null);
    setUndoStack([]);
    setRedoStack([]);
    setZoomLevel(1.0);
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
      img.onload = () => resolve(img);
      img.onerror = (e) => reject(e);
      img.src = url;
    });
  };

  // Create CanvasState snapshot for Undo/Redo
  const captureCanvasStateSnapshot = (): SavedCanvasState | null => {
    const canvas = fabricCanvasRef.current;
    if (!canvas) return null;

    const plates = canvas.getObjects()
      .filter((obj: any) => obj.isNamePlate)
      .map((obj: any) => {
        const bgRect = obj.bgRect;
        const borderRect = obj.borderRect;
        const textObj = obj.textObj;
        return {
          id: obj.id,
          text: textObj.text || '',
          backgroundColor: bgRect.fill as string,
          textColor: textObj.fill as string,
          borderColor: borderRect.stroke as string,
          borderWidth: borderRect.strokeWidth || 2,
          cornerRadius: bgRect.rx || 0,
          opacity: obj.opacity || 1,
          rotation: obj.angle || 0,
          shadow: !!obj.shadow,
          left: obj.left,
          top: obj.top,
          scaleX: obj.scaleX,
          scaleY: obj.scaleY,
          angle: obj.angle,
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

  // Load a state snapshot onto the active canvas
  const applyCanvasState = async (snap: SavedCanvasState) => {
    const canvas = fabricCanvasRef.current;
    if (!canvas) return;

    isSyncingRef.current = true;

    try {
      // 1. Re-sync Watermark settings
      setWatermarkOptions((prev) => ({
        ...prev,
        visible: snap.watermark.visible,
        opacity: snap.watermark.opacity,
        scale: snap.watermark.scale,
        position: snap.watermark.position,
        customLogoUrl: snap.watermark.customLogoUrl,
      }));

      // Apply watermark visibility and coords
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

      // 2. Re-sync Plates
      const canvasObjects = canvas.getObjects();
      const existingPlates = canvasObjects.filter((obj: any) => obj.isNamePlate) as Group[];

      // Remove plates not present in snap
      for (const plate of existingPlates) {
        if (!snap.plates.some((p) => p.id === (plate as any).id)) {
          canvas.remove(plate);
        }
      }

      // Add or update plates from snap
      for (const plateState of snap.plates) {
        const existing = existingPlates.find((p) => (p as any).id === plateState.id);
        if (existing) {
          // Update properties
          updatePlateProperties(existing, {
            text: plateState.text,
            backgroundColor: plateState.backgroundColor,
            textColor: plateState.textColor,
            borderColor: plateState.borderColor,
            borderWidth: plateState.borderWidth,
            cornerRadius: plateState.cornerRadius,
            opacity: plateState.opacity,
            rotation: plateState.rotation,
            shadow: plateState.shadow,
          });
          // Update transforms
          existing.set({
            left: plateState.left,
            top: plateState.top,
            scaleX: plateState.scaleX,
            scaleY: plateState.scaleY,
            angle: plateState.angle,
          });
          existing.setCoords();
        } else {
          // Create new plate
          const newPlate = createNamePlate(
            {
              text: plateState.text,
              backgroundColor: plateState.backgroundColor,
              textColor: plateState.textColor,
              borderColor: plateState.borderColor,
              borderWidth: plateState.borderWidth,
              cornerRadius: plateState.cornerRadius,
              opacity: plateState.opacity,
              rotation: plateState.rotation,
              shadow: plateState.shadow,
            },
            canvas.width,
            canvas.height
          );
          (newPlate as any).id = plateState.id;
          newPlate.set({
            left: plateState.left,
            top: plateState.top,
            scaleX: plateState.scaleX,
            scaleY: plateState.scaleY,
            angle: plateState.angle,
          });
          canvas.add(newPlate);
        }
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
    const previous = undoStack[undoStack.length - 2];

    setUndoStack((prev) => prev.slice(0, -1));
    setRedoStack((prev) => [...prev, current]);
    applyCanvasState(previous);
  };

  const handleRedo = () => {
    if (redoStack.length === 0) return;
    const next = redoStack[redoStack.length - 1];

    setRedoStack((prev) => prev.slice(0, -1));
    setUndoStack((prev) => [...prev, next]);
    applyCanvasState(next);
  };

  // Canvas Initialization & Setup
  useEffect(() => {
    if (!imageUrl || !canvasElRef.current || !containerRef.current) return;

    let canvas: Canvas;
    const bgImage = new Image();

    bgImage.onload = async () => {
      bgImageElementRef.current = bgImage;
      const originalWidth = bgImage.naturalWidth;
      const originalHeight = bgImage.naturalHeight;

      // Fit canvas size inside container
      const containerWidth = containerRef.current?.clientWidth || 800;
      const containerHeight = Math.min(500, window.innerHeight * 0.5);

      const { width: displayWidth, height: displayHeight } = fitDimensions(
        originalWidth,
        originalHeight,
        containerWidth,
        containerHeight
      );

      // Create Fabric Canvas
      canvas = new Canvas(canvasElRef.current!, {
        width: displayWidth,
        height: displayHeight,
        selectionColor: 'rgba(128, 0, 0, 0.15)',
        selectionBorderColor: '#8B0000',
        selectionLineWidth: 1.5,
      });
      fabricCanvasRef.current = canvas;

      // Add Background Image
      const fabricBg = new FabricImage(bgImage, {
        left: 0,
        top: 0,
        scaleX: displayWidth / originalWidth,
        scaleY: displayHeight / originalHeight,
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

      // Load Watermark
      await handleInitializeWatermark(canvas, displayWidth, displayHeight);

      // Bind selection & modification events
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

      canvas.on('object:modified', () => {
        // Dragging/scaling finished, save state
        const wm = watermarkFabricObjectRef.current;
        if (canvas.getActiveObject() === wm) {
          setIsWatermarkManual(true);
        }
        pushToHistory();
      });

      // Initial history save
      const initialSnap = captureCanvasStateSnapshot();
      if (initialSnap) {
        setUndoStack([initialSnap]);
      }
      canvas.renderAll();
    };

    bgImage.src = imageUrl;

    // Window Resize Handler
    const handleResize = () => {
      if (!canvas || !containerRef.current || !bgImageElementRef.current) return;
      const cWidth = containerRef.current.clientWidth;
      const cHeight = Math.min(500, window.innerHeight * 0.5);

      const { width: newWidth, height: newHeight } = fitDimensions(
        bgImageElementRef.current.naturalWidth,
        bgImageElementRef.current.naturalHeight,
        cWidth,
        cHeight
      );

      const oldWidth = canvas.width;
      if (oldWidth === newWidth) return;

      const scaleRatio = newWidth / oldWidth;

      canvas.getObjects().forEach((obj) => {
        obj.set({
          left: (obj.left || 0) * scaleRatio,
          top: (obj.top || 0) * scaleRatio,
          scaleX: (obj.scaleX || 1) * scaleRatio,
          scaleY: (obj.scaleY || 1) * scaleRatio,
        });
        obj.setCoords();
      });

      canvas.setDimensions({ width: newWidth, height: newHeight });
      canvas.renderAll();
    };

    window.addEventListener('resize', handleResize);

    return () => {
      window.removeEventListener('resize', handleResize);
      if (canvas) {
        canvas.dispose();
      }
      fabricCanvasRef.current = null;
    };
  }, [imageUrl]);

  // Load and position Watermark logo on canvas
  const handleInitializeWatermark = async (
    canvas: Canvas,
    cWidth: number,
    cHeight: number,
    customUrl?: string
  ) => {
    setLogoError(null);
    const logoUrl = customUrl || watermarkOptions.customLogoUrl || '/branding/thennakoon-tours-logo.png';

    try {
      const logoImg = await loadLogoImage(logoUrl);

      // If watermark already exists, remove it
      if (watermarkFabricObjectRef.current) {
        canvas.remove(watermarkFabricObjectRef.current);
      }

      // Calculate initial coords
      const { left, top, scale } = getWatermarkCoords(
        logoImg.naturalWidth,
        logoImg.naturalHeight,
        cWidth,
        cHeight,
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
        cornerSize: 8,
      });

      (wm as any).isWatermark = true;
      watermarkFabricObjectRef.current = wm;
      canvas.add(wm);
      canvas.bringObjectToFront(wm);

      // Trigger re-render
      canvas.renderAll();
    } catch (err) {
      console.warn('Watermark logo failed to load:', err);
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
      const bgRect = target.bgRect;
      const borderRect = target.borderRect;
      const textObj = target.textObj;

      setPlateOptions({
        text: textObj.text || '',
        backgroundColor: bgRect.fill as string,
        textColor: textObj.fill as string,
        borderColor: borderRect.stroke as string,
        borderWidth: borderRect.strokeWidth || 2,
        cornerRadius: bgRect.rx || 0,
        opacity: target.opacity || 1.0,
        rotation: target.angle || 0,
        shadow: !!target.shadow,
      });

      // Switch to plates tab automatically for convenient editing
      setActiveTab('plates');
    } else if (target && target.isWatermark) {
      setActiveTab('watermark');
    }
  };

  // Action: Add Name Plate
  const handleAddPlate = () => {
    const canvas = fabricCanvasRef.current;
    if (!canvas) return;

    // Reset preview if active
    if (isPreviewActive) handleTogglePreview(false);

    const plate = createNamePlate(plateOptions, canvas.width, canvas.height);
    // Assign unique ID to track for Undo/Redo
    (plate as any).id = 'plate_' + Math.random().toString(36).substring(2, 11);

    canvas.add(plate);
    canvas.setActiveObject(plate);
    canvas.renderAll();

    pushToHistory();
  };

  // Action: Change selected plate properties
  const handlePlateOptionsChange = (updated: Partial<PlateOptions>) => {
    const canvas = fabricCanvasRef.current;
    if (!canvas) return;

    setPlateOptions((prev) => {
      const next = { ...prev, ...updated };

      if (activeObject && activeObject.isNamePlate) {
        updatePlateProperties(activeObject, next);
        canvas.renderAll();
      }

      return next;
    });
  };

  // Action: Modify selected plate by preset
  const handleApplyPlatePreset = (preset: PlatePreset) => {
    handlePlateOptionsChange({
      backgroundColor: preset.backgroundColor,
      textColor: preset.textColor,
      borderColor: preset.borderColor,
    });
  };

  // Action: Change watermark settings
  const handleWatermarkOptionsChange = (updated: Partial<WatermarkOptions>) => {
    const canvas = fabricCanvasRef.current;
    const wm = watermarkFabricObjectRef.current;

    setWatermarkOptions((prev) => {
      const next = { ...prev, ...updated };

      if (canvas && wm) {
        // If position preset changes, reset manual flag and reposition
        if (updated.position && updated.position !== prev.position) {
          setIsWatermarkManual(false);
          const { left, top, scale } = getWatermarkCoords(
            wm.width,
            wm.height,
            canvas.width,
            canvas.height,
            next
          );
          wm.set({ left, top, scaleX: scale, scaleY: scale });
        }

        // If scale changes, reset manual flag and scale
        if (updated.scale !== undefined && updated.scale !== prev.scale) {
          setIsWatermarkManual(false);
          const { left, top, scale } = getWatermarkCoords(
            wm.width,
            wm.height,
            canvas.width,
            canvas.height,
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
      }

      return next;
    });
  };

  // Action: Upload custom logo watermark
  const handleUploadCustomLogo = (url: string) => {
    const canvas = fabricCanvasRef.current;
    if (!canvas) return;

    setWatermarkOptions((prev) => ({
      ...prev,
      customLogoUrl: url,
      visible: true,
    }));

    handleInitializeWatermark(canvas, canvas.width, canvas.height, url).then(() => {
      pushToHistory();
    });
  };

  // Action: Clear custom logo (restore default logo)
  const handleClearCustomLogo = () => {
    const canvas = fabricCanvasRef.current;
    if (!canvas) return;

    if (watermarkOptions.customLogoUrl) {
      URL.revokeObjectURL(watermarkOptions.customLogoUrl);
    }

    setWatermarkOptions((prev) => ({
      ...prev,
      customLogoUrl: null,
    }));

    handleInitializeWatermark(canvas, canvas.width, canvas.height, '/branding/thennakoon-tours-logo.png').then(() => {
      pushToHistory();
    });
  };

  // Action: Zoom controls
  const handleZoom = (type: 'in' | 'out' | 'fit') => {
    const canvas = fabricCanvasRef.current;
    if (!canvas) return;

    let newZoom = zoomLevel;
    if (type === 'in') {
      newZoom = Math.min(5.0, zoomLevel * 1.25);
    } else if (type === 'out') {
      newZoom = Math.max(0.2, zoomLevel / 1.25);
    } else {
      newZoom = 1.0;
    }

    setZoomLevel(newZoom);
    canvas.setZoom(newZoom);

    // Viewport transforms centering
    canvas.viewportTransform[0] = newZoom;
    canvas.viewportTransform[3] = newZoom;
    canvas.viewportTransform[4] = (canvas.width / 2) * (1 - newZoom);
    canvas.viewportTransform[5] = (canvas.height / 2) * (1 - newZoom);

    canvas.requestRenderAll();
  };

  // Action: Before / After Preview
  const handleTogglePreview = (active: boolean) => {
    const canvas = fabricCanvasRef.current;
    if (!canvas) return;

    setIsPreviewActive(active);
    canvas.discardActiveObject(); // Deselect selected object

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
        // If watermark, hide it instead of deleting element
        handleWatermarkOptionsChange({ visible: false });
      } else {
        canvas.remove(active);
        canvas.discardActiveObject();
        canvas.renderAll();
        pushToHistory();
      }
    }
  };

  // Action: Reset Canvas Editor (Confirm triggered)
  const handleResetEditor = () => {
    const canvas = fabricCanvasRef.current;
    if (!canvas) return;

    isSyncingRef.current = true;

    // 1. Remove all plates
    const plates = canvas.getObjects().filter((obj: any) => obj.isNamePlate);
    plates.forEach((plate) => canvas.remove(plate));

    // 2. Reset watermark options & reload default
    setWatermarkOptions({
      visible: true,
      opacity: 0.85,
      scale: 0.15,
      position: 'bottom-left',
      customLogoUrl: null,
    });
    setIsWatermarkManual(false);

    handleInitializeWatermark(canvas, canvas.width, canvas.height, '/branding/thennakoon-tours-logo.png').then(() => {
      // 3. Reset zoom & fit viewport
      handleZoom('fit');
      setIsConfirmResetOpen(false);
      isSyncingRef.current = false;
      pushToHistory();
    });
  };

  // Keyboard accessibility shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Avoid firing shortcuts when typing in inputs/textareas
      const activeEl = document.activeElement;
      const isTyping =
        activeEl &&
        (activeEl.tagName === 'INPUT' ||
          activeEl.tagName === 'TEXTAREA' ||
          activeEl.getAttribute('contenteditable') === 'true');

      if (isTyping) return;

      const canvas = fabricCanvasRef.current;
      if (!canvas) return;

      // Delete key or Backspace
      if (e.key === 'Delete' || e.key === 'Backspace') {
        e.preventDefault();
        handleDeleteSelected();
      }

      // Undo: Ctrl+Z / Cmd+Z
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z' && !e.shiftKey) {
        e.preventDefault();
        handleUndo();
      }

      // Redo: Ctrl+Shift+Z / Cmd+Shift+Z or Ctrl+Y
      if (
        ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z' && e.shiftKey) ||
        ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'y')
      ) {
        e.preventDefault();
        handleRedo();
      }

      // Nudge Object with arrow keys
      const activeObj = canvas.getActiveObject();
      if (activeObj && !isPreviewActive) {
        const step = e.shiftKey ? 10 : 1;
        let moved = false;

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
          activeObj.setCoords();
          canvas.renderAll();
          // We trigger state save on arrow key up so we don't save continuously
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

      const canvas = fabricCanvasRef.current;
      if (!canvas) return;

      if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.key)) {
        const activeObj = canvas.getActiveObject();
        if (activeObj) {
          pushToHistory();
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
    };
  }, [undoStack, redoStack, activeObject, watermarkOptions, isPreviewActive]);

  // Action: Export & Download Image
  const handleExportImage = async () => {
    const canvas = fabricCanvasRef.current;
    if (!canvas || !bgImageElementRef.current || !imageMetadata) return;

    setIsExporting(true);

    try {
      // 1. Temporarily deselect all objects on display canvas to avoid outlines
      canvas.discardActiveObject();
      canvas.renderAll();

      // 2. Generate high-res image data URL using helper
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

      // 3. Create download link
      const link = document.createElement('a');
      const ext = exportFormat === 'jpeg' ? 'jpg' : 'png';
      const paddedNum = String(exportCount).padStart(3, '0');
      
      link.download = `Thennakoon-Tours-Branded-${paddedNum}.${ext}`;
      link.href = dataUrl;
      
      // 4. Trigger download
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);

      // Increment sessions download counter
      setExportCount((prev) => prev + 1);
    } catch (err) {
      console.error('Export failed:', err);
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <div className="flex flex-col flex-1 h-full min-h-0 bg-neutral-950 text-white overflow-hidden">
      {/* Upper workspace area */}
      <div className="flex-1 flex flex-col md:flex-row min-h-0 overflow-y-auto md:overflow-hidden">
        
        {/* Left Column: Canvas View & Toolbar */}
        <div className="flex-1 flex flex-col p-4 md:p-6 space-y-4 min-w-0 md:h-full md:overflow-y-auto">
          
          {/* Workflow Header & Privacy indicator */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-neutral-900/40 border border-neutral-900 rounded-xl p-4 shadow-sm">
            <div>
              <span className="text-[10px] font-bold tracking-widest text-yellow-500 uppercase">
                Workflow
              </span>
              <div className="flex items-center gap-2 mt-0.5 text-xs text-neutral-400 font-medium">
                <span className={imageUrl ? 'text-neutral-500 line-through' : 'text-white font-bold'}>1. Upload Photo</span>
                <span>→</span>
                <span className={imageUrl && !activeObject ? 'text-white font-bold' : imageUrl ? 'text-neutral-500 line-through' : ''}>2. Add Name Plate</span>
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

          {/* Error banner if logo missing */}
          {imageUrl && logoError && (
            <div className="bg-yellow-950/20 border border-yellow-900 text-yellow-300 px-4 py-2.5 rounded-lg text-xs leading-relaxed flex items-start gap-2.5">
              <span className="font-bold text-yellow-500 mt-0.5">⚠️ Info:</span>
              <div className="flex-1">
                {logoError}
              </div>
            </div>
          )}

          {/* Drag and Drop Zone or Canvas View Container */}
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
                      Branded Plate Covers
                    </h3>
                    <p className="text-xs leading-relaxed text-neutral-400">
                      Add a custom maroon or dark red text-box over license plates. Modify text and size freely.
                    </p>
                  </div>
                  <div className="p-4 rounded-xl bg-neutral-900 border border-neutral-850">
                    <h3 className="font-bold text-white flex items-center gap-2 mb-1.5">
                      <span className="w-5 h-5 rounded-full bg-red-950 border border-red-900 flex items-center justify-center text-xs font-mono text-red-400">2</span>
                      Watermark Stamp
                    </h3>
                    <p className="text-xs leading-relaxed text-neutral-400">
                      Logo is automatically placed. Move, resize, and configure watermark opacity before exporting.
                    </p>
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <div className="flex-1 flex flex-col space-y-4 min-h-0">
              
              {/* Top controls: Replacement / Before-After Preview */}
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
                className="flex-1 min-h-[350px] bg-neutral-900/60 border border-neutral-850 rounded-2xl flex items-center justify-center overflow-hidden p-2 relative group shadow-2xl"
              >
                {isPreviewActive && (
                  <div className="absolute top-4 left-4 z-10 bg-red-950/80 border border-red-900 px-3 py-1.5 rounded-lg text-xs font-semibold text-red-400 flex items-center gap-2 shadow-lg backdrop-blur-sm animate-pulse">
                    <Eye className="w-4 h-4" />
                    <span>Viewing Original Photo (Branding Hidden)</span>
                  </div>
                )}
                
                {/* Fabric Canvas container */}
                <div className="relative border border-neutral-800 rounded shadow-md overflow-hidden bg-neutral-950">
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

        {/* Right Column: Settings & Export Panels */}
        {imageUrl && (
          <div className="w-full md:w-85 bg-neutral-900/60 border-t md:border-t-0 md:border-l border-neutral-850 p-4 md:p-6 overflow-y-auto shrink-0 md:h-full flex flex-col space-y-4">
            
            {/* Tab selection */}
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

            {/* Sidebar content panels */}
            <div className="flex-1 min-h-0">
              {activeTab === 'plates' && (
                <div className="space-y-4">
                  <PlateSettings
                    options={plateOptions}
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

      {/* Confirmation Reset Modal */}
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
