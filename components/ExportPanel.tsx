import React from 'react';
import { ExportPreset, ExportFormat, ExportQuality, FitMethod } from '../types';
import { Download, Sliders, RefreshCw, Eye } from 'lucide-react';

interface ExportPanelProps {
  preset: ExportPreset;
  format: ExportFormat;
  quality: ExportQuality;
  fitMethod: FitMethod;
  backgroundColor: string;
  isExporting: boolean;
  onChange: (settings: {
    preset?: ExportPreset;
    format?: ExportFormat;
    quality?: ExportQuality;
    fitMethod?: FitMethod;
    backgroundColor?: string;
  }) => void;
  onExport: () => void;
}

export default function ExportPanel({
  preset,
  format,
  quality,
  fitMethod,
  backgroundColor,
  isExporting,
  onChange,
  onExport,
}: ExportPanelProps) {
  const presets: { value: ExportPreset; label: string; desc: string }[] = [
    { value: 'original', label: 'Original Size', desc: 'Preserves uploaded dimensions' },
    { value: 'facebook_square', label: 'Facebook Square', desc: '1080 × 1080 px (1:1)' },
    { value: 'instagram_portrait', label: 'Instagram Portrait', desc: '1080 × 1350 px (4:5)' },
    { value: 'landscape', label: 'Landscape HD', desc: '1920 × 1080 px (16:9)' },
  ];

  const formats: { value: ExportFormat; label: string }[] = [
    { value: 'jpeg', label: 'JPG (Compressed)' },
    { value: 'png', label: 'PNG (Lossless)' },
  ];

  const qualities: { value: ExportQuality; label: string }[] = [
    { value: 0.75, label: 'Medium (75%)' },
    { value: 0.9, label: 'High (90%)' },
    { value: 1.0, label: 'Maximum (100%)' },
  ];

  const fitMethods: { value: FitMethod; label: string; desc: string }[] = [
    { value: 'fit', label: 'Fit Image', desc: 'Show full photo with background borders' },
    { value: 'fill', label: 'Fill & Crop', desc: 'Fill entire frame and crop the center' },
  ];

  const showFitOptions = preset !== 'original';
  const showQualityOption = format === 'jpeg';

  return (
    <div className="w-full bg-neutral-900 border border-neutral-800 rounded-xl p-4 shadow-lg space-y-5">
      <div className="flex items-center gap-2 border-b border-neutral-800 pb-3">
        <Download className="w-4 h-4 text-red-500" />
        <h3 className="text-sm font-bold text-white uppercase tracking-wider">
          Download & Export
        </h3>
      </div>

      {/* Preset Selection */}
      <div className="space-y-1.5">
        <label className="text-xs font-semibold text-neutral-400">Export Dimensions</label>
        <div className="space-y-1.5">
          {presets.map((p) => {
            const isActive = preset === p.value;
            return (
              <button
                key={p.value}
                type="button"
                onClick={() => onChange({ preset: p.value })}
                className={`w-full p-2.5 rounded-lg border text-left flex justify-between items-center transition-all cursor-pointer
                  ${
                    isActive
                      ? 'border-red-500 bg-red-950/20 text-white font-semibold shadow-md'
                      : 'border-neutral-800 bg-neutral-950 text-neutral-400 hover:border-neutral-700 hover:text-neutral-200'
                  }`}
              >
                <div>
                  <div className="text-xs font-semibold">{p.label}</div>
                  <div className="text-[10px] text-neutral-500 font-normal mt-0.5">{p.desc}</div>
                </div>
                {isActive && (
                  <span className="w-2 h-2 rounded-full bg-red-500" />
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* Fit Methods for social dimensions */}
      {showFitOptions && (
        <div className="space-y-2 border-t border-neutral-800 pt-3 animate-fade-in">
          <label className="text-xs font-semibold text-neutral-400">Resize Method</label>
          <div className="grid grid-cols-2 gap-2">
            {fitMethods.map((m) => {
              const isActive = fitMethod === m.value;
              return (
                <button
                  key={m.value}
                  type="button"
                  onClick={() => onChange({ fitMethod: m.value })}
                  className={`p-2 rounded-lg border text-left transition-all cursor-pointer
                    ${
                      isActive
                        ? 'border-red-500 bg-red-950/20 text-white shadow-md'
                        : 'border-neutral-800 bg-neutral-950 text-neutral-400 hover:border-neutral-700 hover:text-neutral-200'
                    }`}
                >
                  <div className="text-xs font-semibold text-center">{m.label}</div>
                  <div className="text-[9px] text-neutral-500 text-center mt-0.5">{m.desc}</div>
                </button>
              );
            })}
          </div>

          {fitMethod === 'fit' && (
            <div className="space-y-1.5 bg-neutral-950/50 p-2.5 rounded-lg border border-neutral-850 animate-fade-in flex items-center justify-between">
              <label className="text-[11px] text-neutral-400 font-medium">Borders Color</label>
              <div className="flex items-center gap-2">
                <input
                  type="color"
                  value={backgroundColor}
                  onChange={(e) => onChange({ backgroundColor: e.target.value })}
                  className="w-7 h-7 rounded border border-neutral-800 bg-transparent cursor-pointer overflow-hidden p-0"
                />
                <span className="text-[10px] text-neutral-500 font-mono uppercase">{backgroundColor}</span>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Export Format */}
      <div className="space-y-2 border-t border-neutral-800 pt-3">
        <label className="text-xs font-semibold text-neutral-400">File Format</label>
        <div className="grid grid-cols-2 gap-2">
          {formats.map((f) => {
            const isActive = format === f.value;
            return (
              <button
                key={f.value}
                type="button"
                onClick={() => onChange({ format: f.value })}
                className={`py-2 px-3 text-xs font-semibold rounded-lg border text-center transition-all cursor-pointer
                  ${
                    isActive
                      ? 'border-red-500 bg-red-950/20 text-white shadow-md'
                      : 'border-neutral-800 bg-neutral-950 text-neutral-400 hover:border-neutral-700'
                  }`}
              >
                {f.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* JPEG Quality Selector */}
      {showQualityOption && (
        <div className="space-y-2 border-t border-neutral-800 pt-3 animate-fade-in">
          <label className="text-xs font-semibold text-neutral-400">Compression Quality</label>
          <div className="grid grid-cols-3 gap-1.5">
            {qualities.map((q) => {
              const isActive = quality === q.value;
              return (
                <button
                  key={q.value}
                  type="button"
                  onClick={() => onChange({ quality: q.value })}
                  className={`py-1.5 text-[10px] font-bold rounded-lg border text-center transition-all cursor-pointer
                    ${
                      isActive
                        ? 'border-red-500 bg-red-950/20 text-white'
                        : 'border-neutral-800 bg-neutral-950 text-neutral-400 hover:border-neutral-700'
                    }`}
                >
                  {q.label}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Download Action Button */}
      <button
        type="button"
        disabled={isExporting}
        onClick={onExport}
        className="w-full flex items-center justify-center gap-2.5 py-3 px-4 text-sm font-bold rounded-xl text-white bg-red-800 hover:bg-red-700 active:bg-red-900 border border-red-750 transition-colors shadow-lg disabled:opacity-50 disabled:bg-neutral-850 disabled:text-neutral-500 disabled:border-neutral-800 cursor-pointer focus:outline-none focus:ring-2 focus:ring-red-500"
      >
        {isExporting ? (
          <>
            <RefreshCw className="w-4 h-4 animate-spin text-neutral-400" />
            Preparing Image...
          </>
        ) : (
          <>
            <Download className="w-4.5 h-4.5" />
            Download Branded Image
          </>
        )}
      </button>
    </div>
  );
}
