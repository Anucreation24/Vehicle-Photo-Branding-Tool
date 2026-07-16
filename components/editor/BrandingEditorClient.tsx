'use client';

import React, { useEffect, useRef, useState } from 'react';
import { Rect, FabricText, FabricImage, Canvas } from 'fabric';
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
import { loadOpenCV } from '../../lib/opencvLoader';
import { renderFlatPlateCanvas } from '../../lib/exportHelpers';
import {
  checkModelExists,
  getDetectorSession,
  detectLicensePlates,
  DetectionResult,
  estimateRotationOpenCV,
} from '../../lib/plateDetector';
import ImageUploader from '../ImageUploader';
import EditorToolbar from '../EditorToolbar';
import PlateSettings from '../PlateSettings';
import WatermarkSettings from '../WatermarkSettings';
import ExportPanel from '../ExportPanel';
import BeforeAfterToggle from '../BeforeAfterToggle';
import ConfirmDialog from '../ConfirmDialog';
import { Palette, Image as ImageIcon, Download, ShieldCheck, RefreshCw } from 'lucide-react';

import { useImageUpload } from './hooks/useImageUpload';
import { useFabricCanvas } from './hooks/useFabricCanvas';
import { useEditorHistory } from './hooks/useEditorHistory';
import { useWatermark } from './hooks/useWatermark';
import { usePlateObjects } from './hooks/usePlateObjects';
import { useManualPlateSelection } from './hooks/useManualPlateSelection';
import { useImageExport } from './hooks/useImageExport';
import DetectionPanel from './DetectionPanel';
import EditorCanvas from './EditorCanvas';

interface SavedPlateState {
  id: string;
  plateOptions: PlateOptions;
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
  const canvasElRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // 1. Core Upload Logic Hook
  const { imageUrl, imageMetadata, handleImageLoaded, clearImage } = useImageUpload();

  // Async Initialization and strict mode tracking (Items 7, 9, 10)
  const [isInitializingImage, setIsInitializingImage] = useState<boolean>(false);
  const [initializationError, setInitializationError] = useState<string | null>(null);
  const initGenerationRef = useRef<number>(0);
  const currentUrlRef = useRef<string | null>(null);

  const handleImageLoadedWrapped = (url: string, metadata: ImageMetadata) => {
    setIsInitializingImage(true);
    setInitializationError(null);
    handleImageLoaded(url, metadata);
  };

  // 2. Fabric Canvas Lifecycle Hook
  const {
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
  } = useFabricCanvas({ canvasElRef });

  // 3. Undo/Redo Editor History Hook
  const {
    undoStack,
    setUndoStack,
    redoStack,
    setRedoStack,
    isSyncingRef,
    pushToHistory: pushToHistoryStack,
    clearHistory,
  } = useEditorHistory();

  // 4. Viewport Tabs & Reset states
  const [isPreviewActive, setIsPreviewActive] = useState<boolean>(false);
  const [activeTab, setActiveTab] = useState<'plates' | 'watermark' | 'export'>('plates');
  const [isConfirmResetOpen, setIsConfirmResetOpen] = useState<boolean>(false);

  const handleTogglePreview = (active: boolean) => {
    const canvas = fabricCanvasRef.current;
    if (!canvas) return;

    setIsPreviewActive(active);
    canvas.discardActiveObject();

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

  // 5. Watermark Placement Hook
  const {
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
  } = useWatermark({
    fabricCanvasRef,
    imageMetadata,
    pushToHistory: () => pushToHistory(),
    isPreviewActive,
  });

  // 6. Plate Objects Operations Hook
  const {
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
    handleDeleteSelected: handleDeleteSelectedPlate,
    handleNudge,
    handleUpdateGeometry,
    updateGeometryState,
  } = usePlateObjects({
    fabricCanvasRef,
    imageMetadata,
    pushToHistory: () => pushToHistory(),
    isPreviewActive,
    handleTogglePreview,
  });

  // 7. Manual Box Selection Hook
  const {
    isManualSelecting,
    handleStartManualSelection,
    handleCancelManualSelection,
    handleCanvasMouseDown,
    handleCanvasMouseMove,
    handleCanvasMouseUp,
  } = useManualPlateSelection({
    fabricCanvasRef,
    displayScale,
    isPreviewActive,
    createBrandedPlateAt,
    handleTogglePreview,
  });

  // 8. Image Export Controller Hook
  const {
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
    handleExportImage,
  } = useImageExport({
    fabricCanvasRef,
    bgImageElementRef,
    imageMetadata,
    watermarkOptions,
    isWatermarkManual,
  });

  // 9. ONNX auto detection states
  const [isDetecting, setIsDetecting] = useState<boolean>(false);
  const [detectionStatus, setDetectionStatus] = useState<string>('');
  const [detectedPlates, setDetectedPlates] = useState<DetectionResult[]>([]);
  const [isModelMissing, setIsModelMissing] = useState<boolean>(false);
  const [cvLoaded, setCvLoaded] = useState<boolean>(false);

  // Model & OpenCV verifications on mount
  useEffect(() => {
    if (typeof window !== 'undefined') {
      checkModelExists().then((exists) => {
        setIsModelMissing(!exists);
      });

      loadOpenCV()
        .then((cv) => {
          if (cv) {
            setCvLoaded(true);
            console.log('OpenCV.js initialized successfully.');
          } else {
            setCvLoaded(false);
            console.warn('OpenCV.js skipped or timed out.');
          }
        })
        .catch((err) => {
          console.warn('OpenCV.js load exception:', err);
        });
    }
  }, []);

  // History sync coordination helpers
  const captureCanvasStateSnapshot = (): SavedCanvasState | null => {
    const canvas = fabricCanvasRef.current;
    if (!canvas) return null;

    const plates = canvas.getObjects()
      .filter((obj: any) => obj.isNamePlate)
      .map((obj: any) => ({
        id: obj.id,
        plateOptions: { ...obj.plateOptions },
        left: obj.left,
        top: obj.top,
        scaleX: obj.scaleX,
        scaleY: obj.scaleY,
        angle: obj.angle,
        opacity: obj.opacity || 1.0,
      }));

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

  const applyCanvasState = async (snap: SavedCanvasState) => {
    const canvas = fabricCanvasRef.current;
    if (!canvas || !imageMetadata) return;

    isSyncingRef.current = true;

    try {
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
      const existingPlates = canvas.getObjects().filter((obj: any) => obj.isNamePlate);
      existingPlates.forEach((p) => canvas.remove(p));

      for (const plateState of snap.plates) {
        const flatCanvas = renderFlatPlateCanvas(plateState.plateOptions, imageMetadata.width, imageMetadata.height);
        const plateObj = new FabricImage(flatCanvas, {
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

        (plateObj as any).id = plateState.id;
        (plateObj as any).isNamePlate = true;
        (plateObj as any).plateMode = 'standard';
        (plateObj as any).plateOptions = { ...plateState.plateOptions };

        canvas.add(plateObj);
      }

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

  const pushToHistory = (stateSnapshot?: SavedCanvasState) => {
    if (isSyncingRef.current) return;
    const snap = stateSnapshot || captureCanvasStateSnapshot();
    if (snap) {
      pushToHistoryStack(snap);
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

  // Selection change synchronizer
  const handleSelectionChange = (target: any) => {
    setActiveObject(target);
    updateGeometryState(target);

    if (target && target.isNamePlate) {
      const options = target.plateOptions;
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
    } else if (target && target.isWatermark) {
      setActiveTab('watermark');
    }
  };

  // Unmount cleanup for the active Object URL (Item 9)
  useEffect(() => {
    return () => {
      if (currentUrlRef.current) {
        URL.revokeObjectURL(currentUrlRef.current);
      }
    };
  }, []);

  // Main Canvas Setup lifecycle
  useEffect(() => {
    if (!imageUrl || !canvasElRef.current || !containerRef.current) return;

    setIsInitializingImage(true);
    setInitializationError(null);

    const bgImage = new Image();
    let canvasInstance: Canvas | null = null;
    const currentGeneration = ++initGenerationRef.current;

    const timeoutId = setTimeout(() => {
      if (currentGeneration === initGenerationRef.current) {
        handleInitError(new Error('Image preparation timed out (15s). Please try another image.'));
      }
    }, 15000);

    const handleInitError = (err: Error) => {
      clearTimeout(timeoutId);
      if (currentGeneration !== initGenerationRef.current) return;

      console.error('Image initialization failed:', err);
      setInitializationError(err.message);
      setIsInitializingImage(false);

      if (canvasInstance) {
        canvasInstance.dispose();
        if (fabricCanvasRef.current === canvasInstance) {
          fabricCanvasRef.current = null;
        }
      }

      // Revoke and return to uploader
      clearImageUrl();
    };

    bgImage.src = imageUrl;

    const startDecode = async () => {
      try {
        if (typeof bgImage.decode === 'function') {
          await bgImage.decode();
        } else {
          await new Promise<void>((resolve, reject) => {
            bgImage.onload = () => resolve();
            bgImage.onerror = () => reject(new Error('Failed to load image.'));
          });
        }

        if (currentGeneration !== initGenerationRef.current) {
          clearTimeout(timeoutId);
          return;
        }

        const originalWidth = bgImage.naturalWidth;
        const originalHeight = bgImage.naturalHeight;

        if (originalWidth <= 0 || originalHeight <= 0) {
          throw new Error('Invalid image dimensions (0x0).');
        }

        // Capping dimensions (Item 1)
        const MAX_EDITOR_SIDE = 1600;
        const editorScale = Math.min(1, MAX_EDITOR_SIDE / Math.max(originalWidth, originalHeight));
        const editorWidth = Math.max(1, Math.round(originalWidth * editorScale));
        const editorHeight = Math.max(1, Math.round(originalHeight * editorScale));

        // Update metadata (Item 3)
        handleImageLoaded(imageUrl, {
          name: imageMetadata?.name || 'Uploaded Photo',
          size: imageMetadata?.size || 0,
          width: originalWidth,
          height: originalHeight,
          editorWidth,
          editorHeight,
          editorScale,
          toOriginalX: originalWidth / editorWidth,
          toOriginalY: originalHeight / editorHeight,
        });

        // Initialize Canvas
        canvasInstance = initializeImageCanvas(bgImage, editorWidth, editorHeight);

        // Fit display scaling via CSS
        const containerWidth = containerRef.current?.clientWidth || 800;
        const containerHeight = Math.min(500, window.innerHeight * 0.5);

        const fitScale = fitCanvasToEditor(
          canvasInstance,
          editorWidth,
          editorHeight,
          containerWidth,
          containerHeight,
          editorZoom
        );
        setDisplayScale(fitScale);

        // Register Event Listeners
        canvasInstance.on('selection:created', (e) => {
          const target = e.selected ? e.selected[0] : null;
          handleSelectionChange(target);
        });
        canvasInstance.on('selection:updated', (e) => {
          const target = e.selected ? e.selected[0] : null;
          handleSelectionChange(target);
        });
        canvasInstance.on('selection:cleared', () => {
          handleSelectionChange(null);
        });

        canvasInstance.on('object:moving', () => updateGeometryState(canvasInstance!.getActiveObject()));
        canvasInstance.on('object:scaling', () => updateGeometryState(canvasInstance!.getActiveObject()));
        canvasInstance.on('object:rotating', () => updateGeometryState(canvasInstance!.getActiveObject()));
        
        canvasInstance.on('object:modified', () => {
          updateGeometryState(canvasInstance!.getActiveObject());
          pushToHistory();
        });

        // Mouse events for Manual Rectangle Selection
        canvasInstance.on('mouse:down', (opt) => handleCanvasMouseDown(opt));
        canvasInstance.on('mouse:move', (opt) => handleCanvasMouseMove(opt));
        canvasInstance.on('mouse:up', () => handleCanvasMouseUp());

        // Initialize with default watermark & default state
        const initialSnap = {
          plates: [],
          watermark: {
            visible: true,
            opacity: 1.0,
            scale: 0.18,
            position: 'bottom-left' as WatermarkPosition,
            customLogoUrl: null,
            left: editorWidth * 0.03,
            top: editorHeight - (editorWidth * 0.18 * (100 / 300)) - (editorWidth * 0.03), // estimate
            scaleX: 1,
            scaleY: 1,
            angle: 0
          }
        };
        setUndoStack([initialSnap]);

        // Rendering editor is complete! End required loading state (Item 7)
        setIsInitializingImage(false);
        clearTimeout(timeoutId);

        // Load watermark separately (Item 7)
        addDefaultWatermark(canvasInstance, editorWidth, editorHeight);

        // Avoid Object-URL Races (Item 9): revoke old URL now that new editor is ready
        if (currentUrlRef.current && currentUrlRef.current !== imageUrl) {
          URL.revokeObjectURL(currentUrlRef.current);
        }
        currentUrlRef.current = imageUrl;

      } catch (err: any) {
        handleInitError(err);
      }
    };

    startDecode();

    const observer = new ResizeObserver((entries) => {
      if (entries.length === 0 || !fabricCanvasRef.current) return;
      const fCanvas = fabricCanvasRef.current;

      const containerWidth = entries[0].contentRect.width || 800;
      const containerHeight = Math.min(500, window.innerHeight * 0.5);

      const scale = fitCanvasToEditor(
        fCanvas,
        fCanvas.width,
        fCanvas.height,
        containerWidth,
        containerHeight,
        editorZoom
      );
      setDisplayScale(scale);
    });

    observer.observe(containerRef.current);

    return () => {
      observer.disconnect();
      clearTimeout(timeoutId);

      // Prevent React Strict-Mode double initialization (Item 10)
      // Only dispose the canvas created by this execution
      if (canvasInstance) {
        canvasInstance.dispose();
        if (fabricCanvasRef.current === canvasInstance) {
          fabricCanvasRef.current = null;
        }
      }
    };
  }, [imageUrl]);

  // Set watermark manually dragged flag
  useEffect(() => {
    const canvas = fabricCanvasRef.current;
    if (!canvas) return;

    const handleObjectMoving = (e: any) => {
      const obj = e.target;
      if (obj && obj.isWatermark) {
        setIsWatermarkManual(true);
      }
    };

    canvas.on('object:moving', handleObjectMoving);
    return () => {
      canvas.off('object:moving', handleObjectMoving);
    };
  }, [fabricCanvasRef.current]);

  // Keyboard Shortcuts Bindings (Arrow keys nudges standard plates)
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
        handleDeleteSelectedPlate(() => handleWatermarkOptionsChange({ visible: false }));
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
  }, [undoStack, redoStack, activeObject, isPreviewActive]);

  // Plate Detection Operations
  const handleDetectNumberPlate = async () => {
    const canvas = fabricCanvasRef.current;
    const bgImg = bgImageElementRef.current;
    if (!canvas || !bgImg) return;

    if (isPreviewActive) handleTogglePreview(false);

    setIsDetecting(true);
    setDetectedPlates([]);
    clearDetectionBoxes();

    try {
      const modelExists = await checkModelExists();
      if (!modelExists) {
        setIsModelMissing(true);
        setIsDetecting(false);
        setDetectionStatus('Model missing');
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
    if (!bgImg || !imageMetadata) return;

    let angle = 0;
    if (cvLoaded) {
      angle = estimateRotationOpenCV(bgImg, det);
    }

    const editorScale = imageMetadata.editorScale || 1.0;
    const cx = (det.x + det.width / 2) * editorScale;
    const cy = (det.y + det.height / 2) * editorScale;
    const w = det.width * 1.06 * editorScale;
    const h = det.height * 1.10 * editorScale;

    createBrandedPlateAt(cx, cy, w, h, angle);
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

  const drawDetectionBoxes = (detections: DetectionResult[]) => {
    const canvas = fabricCanvasRef.current;
    if (!canvas || !imageMetadata) return;

    clearDetectionBoxes();

    const editorScale = imageMetadata.editorScale || 1.0;

    detections.forEach((det) => {
      const isBest = det.confidence === Math.max(...detections.map((d) => d.confidence));
      
      const rect = new Rect({
        left: det.x * editorScale,
        top: det.y * editorScale,
        width: det.width * editorScale,
        height: det.height * editorScale,
        fill: 'rgba(0, 255, 0, 0.05)',
        stroke: isBest ? '#22C55E' : '#EAB308',
        strokeWidth: Math.max(3, 3 / displayScale),
        selectable: true,
        hasControls: false,
        hasBorders: false,
        excludeFromExport: true,
      });

      const textObj = new FabricText(`Plate (${Math.round(det.confidence * 100)}%)`, {
        left: det.x * editorScale,
        top: Math.max(0, det.y * editorScale - Math.max(24, 24 / displayScale)),
        fontSize: Math.max(16, 16 / displayScale),
        fill: isBest ? '#22C55E' : '#EAB308',
        fontFamily: 'sans-serif',
        fontWeight: 'bold',
        backgroundColor: 'rgba(0, 0, 0, 0.75)',
        selectable: false,
        excludeFromExport: true,
      });

      (rect as any).isDetectionBox = true;
      (rect as any).textLabel = textObj;

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

  const clearImageUrl = () => {
    clearImage();
    clearHistory();
    setDetectedPlates([]);
    clearDetectionBoxes();
    setActiveObject(null);
  };

  const handleResetEditor = () => {
    const canvas = fabricCanvasRef.current;
    if (!canvas || !imageMetadata) return;

    isSyncingRef.current = true;
    
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

  return (
    <div className="flex flex-col flex-1 h-full min-h-0 bg-neutral-950 text-white overflow-hidden relative">
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
                {initializationError && (
                  <div className="mb-4 bg-red-950/40 border border-red-900 text-red-300 px-4 py-2.5 rounded-lg text-xs leading-relaxed flex items-start gap-2">
                    <span className="font-bold text-red-500 mt-0.5">Error:</span>
                    <div className="flex-1">{initializationError}</div>
                  </div>
                )}
                {isInitializingImage ? (
                  <div className="flex flex-col items-center justify-center p-12 border-2 border-dashed border-neutral-850 rounded-xl bg-neutral-900/50">
                    <RefreshCw className="w-8 h-8 text-yellow-500 animate-spin mb-3" />
                    <p className="text-sm font-medium text-neutral-300 font-mono">Preparing editor...</p>
                  </div>
                ) : (
                  <ImageUploader
                    onImageLoaded={handleImageLoadedWrapped}
                    onImageCleared={clearImageUrl}
                  />
                )}
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
            <div className="flex-1 flex flex-col space-y-4 min-h-0 relative">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <ImageUploader
                  onImageLoaded={handleImageLoadedWrapped}
                  onImageCleared={clearImageUrl}
                  currentImageName={imageMetadata?.name}
                  currentImageMetadata={imageMetadata}
                />
                <BeforeAfterToggle
                  isPreviewActive={isPreviewActive}
                  onToggle={handleTogglePreview}
                />
              </div>

              {isInitializingImage ? (
                <div className="flex-1 flex flex-col items-center justify-center border border-neutral-900 rounded-xl bg-neutral-900/20 shadow-inner min-h-[300px]">
                  <RefreshCw className="w-8 h-8 text-yellow-500 animate-spin mb-3" />
                  <p className="text-sm font-medium text-neutral-300 font-mono">Preparing editor...</p>
                </div>
              ) : (
                <>
                  {/* Auto / Manual Detection toolbar */}
                  <DetectionPanel
                    isDetecting={isDetecting}
                    detectionStatus={detectionStatus}
                    isManualSelecting={isManualSelecting}
                    detectedPlates={detectedPlates}
                    isModelMissing={isModelMissing}
                    onDetect={handleDetectNumberPlate}
                    onToggleManualSelection={isManualSelecting ? handleCancelManualSelection : handleStartManualSelection}
                    onBrandAll={handleBrandAllDetectedPlates}
                    onClearBoxes={clearDetectionBoxes}
                  />

                  {/* Editor Workspace Canvas */}
                  <EditorCanvas
                    containerRef={containerRef}
                    canvasElRef={canvasElRef}
                    isPreviewActive={isPreviewActive}
                  />

                  {/* Editor Toolbar */}
                  <EditorToolbar
                    canUndo={undoStack.length > 1}
                    canRedo={redoStack.length > 0}
                    onUndo={handleUndo}
                    onRedo={handleRedo}
                    onZoomIn={() => handleZoom('in', containerRef.current?.clientWidth || 800, Math.min(500, window.innerHeight * 0.5))}
                    onZoomOut={() => handleZoom('out', containerRef.current?.clientWidth || 800, Math.min(500, window.innerHeight * 0.5))}
                    onZoomFit={() => handleZoom('fit', containerRef.current?.clientWidth || 800, Math.min(500, window.innerHeight * 0.5))}
                    onDeleteSelected={() => handleDeleteSelectedPlate(() => handleWatermarkOptionsChange({ visible: false }))}
                    onReset={() => setIsConfirmResetOpen(true)}
                    onAddPlate={handleAddPlate}
                    hasSelection={activeObject !== null}
                    zoomLevel={editorZoom}
                  />
                </>
              )}
            </div>
          )}
        </div>

        {/* Right Column: Settings */}
        {imageUrl && !isInitializingImage && (
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
