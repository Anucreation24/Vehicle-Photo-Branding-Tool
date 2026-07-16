'use client';

import React from 'react';
import { Eye, ShieldCheck, RefreshCw } from 'lucide-react';
import { DetectionResult } from '../../lib/plateDetector';

interface DetectionPanelProps {
  isDetecting: boolean;
  detectionStatus: string;
  isManualSelecting: boolean;
  detectedPlates: DetectionResult[];
  isModelMissing: boolean;
  onDetect: () => void;
  onToggleManualSelection: () => void;
  onBrandAll: () => void;
  onClearBoxes: () => void;
}

export default function DetectionPanel({
  isDetecting,
  detectionStatus,
  isManualSelecting,
  detectedPlates,
  isModelMissing,
  onDetect,
  onToggleManualSelection,
  onBrandAll,
  onClearBoxes,
}: DetectionPanelProps) {
  return (
    <div className="bg-neutral-900 border border-neutral-850 p-4 rounded-xl flex flex-wrap items-center justify-between gap-3 w-full shadow-lg">
      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={onDetect}
          disabled={isDetecting || isModelMissing}
          className={`px-4 py-2 text-xs font-bold rounded-lg cursor-pointer transition-all flex items-center gap-1.5 shadow-sm border
            ${
              isDetecting || isModelMissing
                ? 'bg-neutral-800 text-neutral-500 border-neutral-750 cursor-not-allowed font-medium'
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
          onClick={onToggleManualSelection}
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
              onClick={onBrandAll}
              className="px-3 py-1.5 text-[11px] font-bold bg-neutral-800 hover:bg-neutral-750 text-white rounded-lg border border-neutral-700 cursor-pointer transition-all"
            >
              Brand All
            </button>
            <button
              type="button"
              onClick={onClearBoxes}
              className="px-3 py-1.5 text-[11px] font-bold bg-neutral-800 hover:bg-neutral-750 text-white rounded-lg border border-neutral-700 cursor-pointer transition-all"
            >
              Clear Boxes
            </button>
          </>
        )}
        {isModelMissing && (
          <span className="text-xs text-yellow-500 font-medium bg-yellow-950/20 border border-yellow-900/40 px-3 py-1.5 rounded-lg">
            ⚠️ Automatic detection is not installed yet. Select the number plate area manually.
          </span>
        )}
        {detectionStatus && !isDetecting && detectedPlates.length === 0 && !isModelMissing && (
          <span className="text-xs text-neutral-500 italic">
            Status: {detectionStatus}
          </span>
        )}
      </div>
    </div>
  );
}
