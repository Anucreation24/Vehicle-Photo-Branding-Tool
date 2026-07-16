'use client';

import React from 'react';
import { Eye } from 'lucide-react';

interface EditorCanvasProps {
  containerRef: React.RefObject<HTMLDivElement | null>;
  canvasElRef: React.RefObject<HTMLCanvasElement | null>;
  isPreviewActive: boolean;
}

export default function EditorCanvas({
  containerRef,
  canvasElRef,
  isPreviewActive,
}: EditorCanvasProps) {
  return (
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
  );
}
