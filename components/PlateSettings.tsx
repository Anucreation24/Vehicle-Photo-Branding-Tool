import React from 'react';
import { PlateOptions, PLATE_PRESETS, PlatePreset, PlateMode } from '../types';
import { Type, RefreshCw, Palette, Maximize, Move, HelpCircle, Copy, RotateCcw } from 'lucide-react';

interface PlateSettingsProps {
  options: PlateOptions;
  plateMode: PlateMode;
  isAdjustingPerspective: boolean;
  onChangeMode: (mode: PlateMode) => void;
  onToggleAdjustPerspective: () => void;
  onApplyAdjust: () => void;
  onCancelAdjust: () => void;
  onResetToRectangle: () => void;
  onCopyPreviousShape: () => void;
  hasSavedShape: boolean;
  onChange: (options: Partial<PlateOptions>) => void;
  onApplyPreset: (preset: PlatePreset) => void;
}

export default function PlateSettings({
  options,
  plateMode,
  isAdjustingPerspective,
  onChangeMode,
  onToggleAdjustPerspective,
  onApplyAdjust,
  onCancelAdjust,
  onResetToRectangle,
  onCopyPreviousShape,
  hasSavedShape,
  onChange,
  onApplyPreset,
}: PlateSettingsProps) {
  const handleTextChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    onChange({ text: e.target.value });
  };

  const handleCheckboxChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    onChange({ shadow: e.target.checked });
  };

  const handleSliderChange = (name: keyof PlateOptions, val: number) => {
    onChange({ [name]: val });
  };

  const handleColorChange = (name: keyof PlateOptions, val: string) => {
    onChange({ [name]: val });
  };

  return (
    <div className="w-full bg-neutral-900 border border-neutral-800 rounded-xl p-4 shadow-lg space-y-4">
      {/* Header */}
      <div className="flex items-center gap-2 border-b border-neutral-800 pb-3">
        <Palette className="w-4 h-4 text-red-500" />
        <h3 className="text-sm font-bold text-white uppercase tracking-wider">
          Name Plate Settings
        </h3>
      </div>

      {/* Editing Mode Selection */}
      <div className="space-y-1.5">
        <label className="text-xs font-semibold text-neutral-400">Editing Mode</label>
        <div className="grid grid-cols-2 gap-2 bg-neutral-950 p-1 rounded-lg border border-neutral-850">
          <button
            type="button"
            onClick={() => onChangeMode('standard')}
            className={`py-1.5 px-3 text-xs font-semibold rounded-md transition-all cursor-pointer flex items-center justify-center gap-1.5
              ${
                plateMode === 'standard'
                  ? 'bg-neutral-800 text-white shadow-sm'
                  : 'text-neutral-500 hover:text-neutral-300'
              }`}
          >
            <Move className="w-3.5 h-3.5" />
            Standard
          </button>
          <button
            type="button"
            onClick={() => onChangeMode('perspective')}
            className={`py-1.5 px-3 text-xs font-semibold rounded-md transition-all cursor-pointer flex items-center justify-center gap-1.5
              ${
                plateMode === 'perspective'
                  ? 'bg-red-950 text-red-400 border border-red-900/40 shadow-sm'
                  : 'text-neutral-500 hover:text-neutral-300'
              }`}
          >
            <Maximize className="w-3.5 h-3.5" />
            Perspective
          </button>
        </div>
      </div>

      {/* Mode Specific Controls */}
      {plateMode === 'perspective' && (
        <div className="space-y-3 bg-neutral-950/40 border border-neutral-850/60 p-3.5 rounded-xl animate-fade-in">
          <div className="flex items-center gap-2 text-red-400">
            <Maximize className="w-4 h-4 shrink-0" />
            <h4 className="text-xs font-bold uppercase tracking-wider">Perspective Adjustment</h4>
          </div>
          
          <p className="text-[11px] text-neutral-400 leading-relaxed">
            Warp this name plate over angled number plates. Corner handles can be adjusted in **Adjust Mode**.
          </p>

          <div className="space-y-2 pt-1">
            {!isAdjustingPerspective ? (
              <button
                type="button"
                onClick={onToggleAdjustPerspective}
                className="w-full py-2 px-3 text-xs font-bold rounded-lg bg-red-700 hover:bg-red-650 text-white transition-all cursor-pointer shadow-md flex items-center justify-center gap-1.5"
              >
                <Maximize className="w-3.5 h-3.5" />
                Adjust Corners
              </button>
            ) : (
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={onApplyAdjust}
                  className="py-2 px-3 text-xs font-bold rounded-lg bg-green-700 hover:bg-green-650 text-white transition-all cursor-pointer shadow-md"
                >
                  Apply
                </button>
                <button
                  type="button"
                  onClick={onCancelAdjust}
                  className="py-2 px-3 text-xs font-bold rounded-lg bg-neutral-800 hover:bg-neutral-700 text-neutral-300 border border-neutral-700 transition-all cursor-pointer"
                >
                  Cancel
                </button>
              </div>
            )}

            <button
              type="button"
              onClick={onResetToRectangle}
              className="w-full py-1.5 px-3 text-xs font-semibold rounded-lg bg-neutral-900 hover:bg-neutral-850 text-white border border-neutral-800 transition-all cursor-pointer flex items-center justify-center gap-1.5"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              Reset to Rectangle
            </button>
            
            <button
              type="button"
              onClick={onCopyPreviousShape}
              disabled={!hasSavedShape}
              className="w-full py-1.5 px-3 text-xs font-semibold rounded-lg bg-neutral-900 hover:bg-neutral-850 text-white border border-neutral-800 disabled:opacity-30 disabled:hover:bg-neutral-900 disabled:hover:text-neutral-500 transition-all cursor-pointer flex items-center justify-center gap-1.5"
              title="Copy quadrilateral shape from another perspective plate"
            >
              <Copy className="w-3.5 h-3.5" />
              Copy Previous Shape
            </button>
          </div>

          <div className="border-t border-neutral-850 pt-2.5 space-y-1.5 text-[10px] text-neutral-500 leading-relaxed">
            <span className="font-bold text-neutral-400 block uppercase tracking-widest flex items-center gap-1">
              <HelpCircle className="w-3 h-3 text-red-500" /> Shortcuts & Instructions
            </span>
            <p>• Click **Adjust Corners** to edit individual points.</p>
            <p>• Drag handles or use **Arrow Keys** (Shift for 10px) to nudge points.</p>
            <p>• Drag inside the plate to move it as a single unit.</p>
          </div>
        </div>
      )}

      {/* Style Presets */}
      <div className="space-y-2 border-t border-neutral-800 pt-3">
        <label className="text-xs font-semibold text-neutral-400">Quick Style Presets</label>
        <div className="grid grid-cols-3 gap-2">
          {PLATE_PRESETS.map((preset, index) => {
            const isActive =
              options.backgroundColor.toLowerCase() === preset.backgroundColor.toLowerCase() &&
              options.textColor.toLowerCase() === preset.textColor.toLowerCase() &&
              options.borderColor.toLowerCase() === preset.borderColor.toLowerCase();

            return (
              <button
                key={preset.name}
                type="button"
                onClick={() => onApplyPreset(preset)}
                className={`p-2 rounded-lg border text-left flex flex-col items-center justify-center gap-1 cursor-pointer transition-all duration-200
                  ${
                    isActive
                      ? 'border-red-500 bg-red-950/20 ring-1 ring-red-500'
                      : 'border-neutral-800 bg-neutral-950 hover:border-neutral-700'
                  }`}
              >
                <div
                  className="w-full h-4 rounded border border-neutral-700 flex items-center justify-center overflow-hidden"
                  style={{ backgroundColor: preset.backgroundColor }}
                >
                  <div
                    className="w-[80%] h-[1px]"
                    style={{ backgroundColor: preset.borderColor }}
                  />
                </div>
                <span className="text-[10px] text-neutral-400 font-medium truncate max-w-full text-center">
                  Preset {index + 1}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Plate Text */}
      <div className="space-y-1.5">
        <label className="text-xs font-semibold text-neutral-400 flex items-center gap-1">
          <Type className="w-3.5 h-3.5 text-neutral-500" />
          Plate Text (use Enter for newlines)
        </label>
        <textarea
          rows={2}
          value={options.text}
          onChange={handleTextChange}
          className="w-full px-3 py-2 text-sm bg-neutral-950 border border-neutral-800 rounded-lg text-white placeholder-neutral-600 focus:outline-none focus:border-red-500 focus:ring-1 focus:ring-red-500 transition-all font-mono uppercase resize-none"
          placeholder="ENTER TEXT"
        />
      </div>

      {/* Colors */}
      <div className="grid grid-cols-3 gap-3">
        <div className="space-y-1">
          <label className="text-[10px] font-semibold text-neutral-400 block truncate">
            Background
          </label>
          <div className="flex items-center gap-1">
            <input
              type="color"
              value={options.backgroundColor}
              onChange={(e) => handleColorChange('backgroundColor', e.target.value)}
              className="w-7 h-7 rounded border border-neutral-800 bg-transparent cursor-pointer overflow-hidden p-0"
            />
          </div>
        </div>

        <div className="space-y-1">
          <label className="text-[10px] font-semibold text-neutral-400 block truncate">
            Text Color
          </label>
          <div className="flex items-center gap-1">
            <input
              type="color"
              value={options.textColor}
              onChange={(e) => handleColorChange('textColor', e.target.value)}
              className="w-7 h-7 rounded border border-neutral-800 bg-transparent cursor-pointer overflow-hidden p-0"
            />
          </div>
        </div>

        <div className="space-y-1">
          <label className="text-[10px] font-semibold text-neutral-400 block truncate">
            Border Color
          </label>
          <div className="flex items-center gap-1">
            <input
              type="color"
              value={options.borderColor}
              onChange={(e) => handleColorChange('borderColor', e.target.value)}
              className="w-7 h-7 rounded border border-neutral-800 bg-transparent cursor-pointer overflow-hidden p-0"
            />
          </div>
        </div>
      </div>

      {/* Sliders */}
      <div className="space-y-3.5 border-t border-neutral-800 pt-3">
        {/* Border Thickness */}
        <div className="space-y-1">
          <div className="flex justify-between text-xs">
            <span className="text-neutral-400">Border Thickness</span>
            <span className="font-semibold text-neutral-300">{options.borderWidth}px</span>
          </div>
          <input
            type="range"
            min={0}
            max={8}
            step={0.5}
            value={options.borderWidth}
            onChange={(e) => handleSliderChange('borderWidth', parseFloat(e.target.value))}
            className="w-full h-1.5 bg-neutral-950 rounded-lg appearance-none cursor-pointer accent-red-650"
          />
        </div>

        {/* Corner Radius */}
        <div className="space-y-1">
          <div className="flex justify-between text-xs">
            <span className="text-neutral-400">Corner Radius</span>
            <span className="font-semibold text-neutral-300">{options.cornerRadius}px</span>
          </div>
          <input
            type="range"
            min={0}
            max={30}
            step={1}
            value={options.cornerRadius}
            onChange={(e) => handleSliderChange('cornerRadius', parseInt(e.target.value))}
            className="w-full h-1.5 bg-neutral-950 rounded-lg appearance-none cursor-pointer accent-red-650"
          />
        </div>

        {/* Opacity */}
        <div className="space-y-1">
          <div className="flex justify-between text-xs">
            <span className="text-neutral-400">Opacity</span>
            <span className="font-semibold text-neutral-300">{Math.round(options.opacity * 100)}%</span>
          </div>
          <input
            type="range"
            min={0.1}
            max={1.0}
            step={0.05}
            value={options.opacity}
            onChange={(e) => handleSliderChange('opacity', parseFloat(e.target.value))}
            className="w-full h-1.5 bg-neutral-950 rounded-lg appearance-none cursor-pointer accent-red-650"
          />
        </div>

        {/* Rotation - Hidden in perspective mode as it makes no sense */}
        {plateMode === 'standard' && (
          <div className="space-y-1 animate-fade-in">
            <div className="flex justify-between text-xs">
              <span className="text-neutral-400 flex items-center gap-1">
                <RefreshCw className="w-3 h-3 text-neutral-500" />
                Rotation
              </span>
              <span className="font-semibold text-neutral-300">{options.rotation}°</span>
            </div>
            <input
              type="range"
              min={-180}
              max={180}
              step={1}
              value={options.rotation}
              onChange={(e) => handleSliderChange('rotation', parseInt(e.target.value))}
              className="w-full h-1.5 bg-neutral-950 rounded-lg appearance-none cursor-pointer accent-red-650"
            />
          </div>
        )}
      </div>

      {/* Shadow Option */}
      <div className="flex items-center gap-2 border-t border-neutral-800 pt-3">
        <input
          id="plate-shadow"
          type="checkbox"
          checked={options.shadow}
          onChange={handleCheckboxChange}
          className="w-4 h-4 rounded text-red-600 bg-neutral-950 border-neutral-800 focus:ring-red-500 focus:ring-offset-neutral-900 cursor-pointer focus:ring-2"
        />
        <label htmlFor="plate-shadow" className="text-xs font-semibold text-neutral-300 cursor-pointer select-none">
          Enable Plate Shadow
        </label>
      </div>
    </div>
  );
}
