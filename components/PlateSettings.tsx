import React from 'react';
import { PlateOptions, PLATE_PRESETS, PlatePreset, PlateGeometry } from '../types';
import {
  Type,
  RefreshCw,
  Palette,
  ArrowUp,
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  Maximize2,
  Minimize2,
  RotateCcw,
  RotateCw,
  Compass,
} from 'lucide-react';

interface PlateSettingsProps {
  options: PlateOptions;
  geometry: PlateGeometry | null;
  onNudge: (action: string) => void;
  onUpdateGeometry: (geom: Partial<PlateGeometry>) => void;
  onChange: (options: Partial<PlateOptions>) => void;
  onApplyPreset: (preset: PlatePreset) => void;
}

export default function PlateSettings({
  options,
  geometry,
  onNudge,
  onUpdateGeometry,
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
      <div className="flex items-center gap-2 border-b border-neutral-850 pb-3">
        <Palette className="w-4 h-4 text-red-500" />
        <h3 className="text-sm font-bold text-white uppercase tracking-wider">
          Plate Designer
        </h3>
      </div>

      {/* 10. Precise Correction Controls & Nudges */}
      {geometry ? (
        <div className="space-y-3 bg-neutral-950 p-3.5 rounded-xl border border-neutral-850">
          <div className="flex items-center justify-between text-xs font-bold text-neutral-300 border-b border-neutral-850 pb-2">
            <span>POSITION & SIZE</span>
          </div>

          {/* Numeric Fields / Sliders */}
          <div className="grid grid-cols-2 gap-2 text-xs">
            <div>
              <label className="text-neutral-500 block mb-1">Position X</label>
              <input
                type="number"
                value={geometry.left}
                onChange={(e) => onUpdateGeometry({ left: parseInt(e.target.value) || 0 })}
                className="w-full bg-neutral-900 border border-neutral-800 rounded px-2 py-1 text-white font-mono"
              />
            </div>
            <div>
              <label className="text-neutral-500 block mb-1">Position Y</label>
              <input
                type="number"
                value={geometry.top}
                onChange={(e) => onUpdateGeometry({ top: parseInt(e.target.value) || 0 })}
                className="w-full bg-neutral-900 border border-neutral-800 rounded px-2 py-1 text-white font-mono"
              />
            </div>
            <div>
              <label className="text-neutral-500 block mb-1">Width</label>
              <input
                type="number"
                value={geometry.width}
                min={20}
                onChange={(e) => onUpdateGeometry({ width: parseInt(e.target.value) || 20 })}
                className="w-full bg-neutral-900 border border-neutral-800 rounded px-2 py-1 text-white font-mono"
              />
            </div>
            <div>
              <label className="text-neutral-500 block mb-1">Height</label>
              <input
                type="number"
                value={geometry.height}
                min={10}
                onChange={(e) => onUpdateGeometry({ height: parseInt(e.target.value) || 10 })}
                className="w-full bg-neutral-900 border border-neutral-800 rounded px-2 py-1 text-white font-mono"
              />
            </div>
          </div>

          {/* Rotation Slider */}
          <div className="space-y-1 pt-1">
            <div className="flex justify-between text-[11px] text-neutral-400">
              <span>Rotation</span>
              <span>{geometry.rotation}°</span>
            </div>
            <input
              type="range"
              min={-180}
              max={180}
              step={1}
              value={geometry.rotation}
              onChange={(e) => onUpdateGeometry({ rotation: parseInt(e.target.value) })}
              className="w-full h-1 bg-neutral-900 rounded-lg appearance-none cursor-pointer accent-red-650"
            />
          </div>

          {/* Nudge Buttons Grid */}
          <div className="space-y-1.5 pt-2 border-t border-neutral-850">
            <label className="text-[10px] font-bold text-neutral-500 uppercase block tracking-wider">
              Quick Nudges
            </label>
            <div className="grid grid-cols-5 gap-1.5">
              {/* Position Nudges */}
              <button
                type="button"
                onClick={() => onNudge('left')}
                className="p-1.5 bg-neutral-900 hover:bg-neutral-800 text-neutral-300 rounded border border-neutral-800 cursor-pointer flex items-center justify-center"
                title="Move Left"
              >
                <ArrowLeft className="w-3.5 h-3.5" />
              </button>
              <button
                type="button"
                onClick={() => onNudge('right')}
                className="p-1.5 bg-neutral-900 hover:bg-neutral-800 text-neutral-300 rounded border border-neutral-800 cursor-pointer flex items-center justify-center"
                title="Move Right"
              >
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
              <button
                type="button"
                onClick={() => onNudge('up')}
                className="p-1.5 bg-neutral-900 hover:bg-neutral-800 text-neutral-300 rounded border border-neutral-800 cursor-pointer flex items-center justify-center"
                title="Move Up"
              >
                <ArrowUp className="w-3.5 h-3.5" />
              </button>
              <button
                type="button"
                onClick={() => onNudge('down')}
                className="p-1.5 bg-neutral-900 hover:bg-neutral-800 text-neutral-300 rounded border border-neutral-800 cursor-pointer flex items-center justify-center"
                title="Move Down"
              >
                <ArrowDown className="w-3.5 h-3.5" />
              </button>

              {/* Rotation Nudges */}
              <button
                type="button"
                onClick={() => onNudge('rotate-left')}
                className="p-1.5 bg-neutral-900 hover:bg-neutral-800 text-neutral-300 rounded border border-neutral-800 cursor-pointer flex items-center justify-center"
                title="Rotate CCW"
              >
                <RotateCcw className="w-3.5 h-3.5" />
              </button>

              {/* Dimension Nudges */}
              <button
                type="button"
                onClick={() => onNudge('wider')}
                className="p-1.5 bg-neutral-900 hover:bg-neutral-800 text-neutral-300 rounded border border-neutral-800 cursor-pointer flex items-center justify-center"
                title="Make Wider"
              >
                <span className="text-[10px] font-bold">W+</span>
              </button>
              <button
                type="button"
                onClick={() => onNudge('narrower')}
                className="p-1.5 bg-neutral-900 hover:bg-neutral-800 text-neutral-300 rounded border border-neutral-800 cursor-pointer flex items-center justify-center"
                title="Make Narrower"
              >
                <span className="text-[10px] font-bold">W-</span>
              </button>
              <button
                type="button"
                onClick={() => onNudge('taller')}
                className="p-1.5 bg-neutral-900 hover:bg-neutral-800 text-neutral-300 rounded border border-neutral-800 cursor-pointer flex items-center justify-center"
                title="Make Taller"
              >
                <span className="text-[10px] font-bold">H+</span>
              </button>
              <button
                type="button"
                onClick={() => onNudge('shorter')}
                className="p-1.5 bg-neutral-900 hover:bg-neutral-800 text-neutral-300 rounded border border-neutral-800 cursor-pointer flex items-center justify-center"
                title="Make Shorter"
              >
                <span className="text-[10px] font-bold">H-</span>
              </button>

              <button
                type="button"
                onClick={() => onNudge('rotate-right')}
                className="p-1.5 bg-neutral-900 hover:bg-neutral-800 text-neutral-300 rounded border border-neutral-800 cursor-pointer flex items-center justify-center"
                title="Rotate CW"
              >
                <RotateCw className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>


        </div>
      ) : null}

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
