import React from 'react';
import {
  Undo,
  Redo,
  ZoomIn,
  ZoomOut,
  Maximize,
  Trash2,
  RotateCcw,
  PlusSquare,
} from 'lucide-react';

interface EditorToolbarProps {
  canUndo: boolean;
  canRedo: boolean;
  onUndo: () => void;
  onRedo: () => void;
  onZoomIn: () => void;
  onZoomOut: () => void;
  onZoomFit: () => void;
  onDeleteSelected: () => void;
  onReset: () => void;
  onAddPlate: () => void;
  hasSelection: boolean;
  zoomLevel: number;
}

export default function EditorToolbar({
  canUndo,
  canRedo,
  onUndo,
  onRedo,
  onZoomIn,
  onZoomOut,
  onZoomFit,
  onDeleteSelected,
  onReset,
  onAddPlate,
  hasSelection,
  zoomLevel,
}: EditorToolbarProps) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 bg-neutral-900 border border-neutral-800 p-3 rounded-xl shadow-lg w-full">
      {/* Action Buttons: Add Plate */}
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={onAddPlate}
          className="flex items-center gap-2 px-4 py-2 text-sm font-semibold rounded-lg text-white bg-red-800 hover:bg-red-700 active:bg-red-900 transition-colors shadow-md focus:outline-none focus:ring-2 focus:ring-red-500 cursor-pointer"
        >
          <PlusSquare className="w-4 h-4" />
          Add Name Plate
        </button>
      </div>

      {/* History Controls */}
      <div className="flex items-center gap-1 border-l border-r border-neutral-800 px-3">
        <button
          type="button"
          onClick={onUndo}
          disabled={!canUndo}
          className="p-2 rounded-lg text-neutral-400 hover:text-white hover:bg-neutral-800 active:bg-neutral-700 disabled:opacity-30 disabled:hover:bg-transparent disabled:hover:text-neutral-400 transition-all cursor-pointer"
          title="Undo (Ctrl+Z)"
        >
          <Undo className="w-4 h-4" />
        </button>
        <button
          type="button"
          onClick={onRedo}
          disabled={!canRedo}
          className="p-2 rounded-lg text-neutral-400 hover:text-white hover:bg-neutral-800 active:bg-neutral-700 disabled:opacity-30 disabled:hover:bg-transparent disabled:hover:text-neutral-400 transition-all cursor-pointer"
          title="Redo (Ctrl+Shift+Z)"
        >
          <Redo className="w-4 h-4" />
        </button>
      </div>

      {/* Zoom Controls */}
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={onZoomOut}
          className="p-2 rounded-lg text-neutral-400 hover:text-white hover:bg-neutral-800 active:bg-neutral-700 transition-all cursor-pointer"
          title="Zoom Out"
        >
          <ZoomOut className="w-4 h-4" />
        </button>
        <span className="text-xs font-mono text-neutral-400 min-w-[50px] text-center">
          {Math.round(zoomLevel * 100)}%
        </span>
        <button
          type="button"
          onClick={onZoomIn}
          className="p-2 rounded-lg text-neutral-400 hover:text-white hover:bg-neutral-800 active:bg-neutral-700 transition-all cursor-pointer"
          title="Zoom In"
        >
          <ZoomIn className="w-4 h-4" />
        </button>
        <button
          type="button"
          onClick={onZoomFit}
          className="p-2 rounded-lg text-neutral-400 hover:text-white hover:bg-neutral-800 active:bg-neutral-700 transition-all cursor-pointer flex items-center gap-1 text-xs"
          title="Fit to Screen"
        >
          <Maximize className="w-4 h-4" />
          <span className="hidden sm:inline">Fit</span>
        </button>
      </div>

      {/* Object & Reset Controls */}
      <div className="flex items-center gap-1.5 border-l border-neutral-800 pl-3">
        <button
          type="button"
          onClick={onDeleteSelected}
          disabled={!hasSelection}
          className="p-2 rounded-lg text-neutral-400 hover:text-red-400 hover:bg-red-950/20 active:bg-red-950/40 border border-transparent hover:border-red-900/30 disabled:opacity-30 disabled:hover:bg-transparent disabled:hover:text-neutral-400 disabled:border-transparent transition-all cursor-pointer flex items-center gap-1 text-xs"
          title="Delete Selected Object (Delete/Backspace)"
        >
          <Trash2 className="w-4 h-4" />
          <span className="hidden sm:inline">Delete</span>
        </button>
        <button
          type="button"
          onClick={onReset}
          className="p-2 rounded-lg text-neutral-400 hover:text-white hover:bg-neutral-800 active:bg-neutral-700 transition-all cursor-pointer flex items-center gap-1 text-xs"
          title="Reset Editor"
        >
          <RotateCcw className="w-4 h-4" />
          <span>Reset</span>
        </button>
      </div>
    </div>
  );
}
