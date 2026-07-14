import React, { useRef, ChangeEvent } from 'react';
import { WatermarkOptions, WatermarkPosition } from '../types';
import { Image, Eye, EyeOff, LayoutGrid, Upload, Trash2 } from 'lucide-react';

interface WatermarkSettingsProps {
  options: WatermarkOptions;
  onChange: (options: Partial<WatermarkOptions>) => void;
  onUploadCustomLogo: (url: string) => void;
  onClearCustomLogo: () => void;
}

export default function WatermarkSettings({
  options,
  onChange,
  onUploadCustomLogo,
  onClearCustomLogo,
}: WatermarkSettingsProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleCheckboxChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    onChange({ visible: e.target.checked });
  };

  const handleSliderChange = (name: keyof WatermarkOptions, val: number) => {
    onChange({ [name]: val });
  };

  const handlePositionPreset = (position: WatermarkPosition) => {
    onChange({ position });
  };

  const handleLogoUpload = (e: ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      const file = e.target.files[0];
      if (file.type.startsWith('image/')) {
        const objectUrl = URL.createObjectURL(file);
        onUploadCustomLogo(objectUrl);
      }
    }
  };

  const triggerUpload = () => {
    fileInputRef.current?.click();
  };

  const positions: { value: WatermarkPosition; label: string }[] = [
    { value: 'top-left', label: 'Top Left' },
    { value: 'top-right', label: 'Top Right' },
    { value: 'bottom-left', label: 'Bottom Left' },
    { value: 'bottom-right', label: 'Bottom Right' },
  ];

  return (
    <div className="w-full bg-neutral-900 border border-neutral-800 rounded-xl p-4 shadow-lg space-y-5">
      <div className="flex items-center justify-between border-b border-neutral-800 pb-3">
        <div className="flex items-center gap-2">
          <Image className="w-4 h-4 text-red-500" />
          <h3 className="text-sm font-bold text-white uppercase tracking-wider">
            Watermark Settings
          </h3>
        </div>
        <div className="flex items-center gap-1.5 bg-neutral-950 border border-neutral-850 px-2.5 py-1 rounded-lg">
          <input
            id="watermark-visible"
            type="checkbox"
            checked={options.visible}
            onChange={handleCheckboxChange}
            className="w-3.5 h-3.5 rounded text-red-650 bg-neutral-950 border-neutral-800 focus:ring-red-500 cursor-pointer"
          />
          <label htmlFor="watermark-visible" className="text-[10px] font-bold text-neutral-300 cursor-pointer select-none">
            {options.visible ? 'VISIBLE' : 'HIDDEN'}
          </label>
        </div>
      </div>

      {options.visible && (
        <div className="space-y-4 animate-fade-in">
          {/* Logo Source Management */}
          <div className="space-y-2">
            <label className="text-xs font-semibold text-neutral-400">Logo Source</label>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={triggerUpload}
                className="flex-1 flex items-center justify-center gap-2 px-3 py-2 text-xs font-semibold rounded-lg bg-neutral-950 hover:bg-neutral-850 text-white border border-neutral-800 hover:border-neutral-700 transition-all cursor-pointer"
              >
                <Upload className="w-3.5 h-3.5 text-neutral-400" />
                {options.customLogoUrl ? 'Replace Custom Logo' : 'Upload Custom Logo'}
              </button>
              {options.customLogoUrl && (
                <button
                  type="button"
                  onClick={onClearCustomLogo}
                  className="p-2 rounded-lg bg-neutral-950 hover:bg-red-950/20 hover:text-red-400 border border-neutral-800 hover:border-red-900/30 text-neutral-400 transition-all cursor-pointer"
                  title="Restore default logo"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={handleLogoUpload}
            />
            <p className="text-[10px] text-neutral-500 italic">
              * The app automatically attempts to load the company logo watermark. You can manually override it above.
            </p>
          </div>

          {/* Opacity */}
          <div className="space-y-1">
            <div className="flex justify-between text-xs">
              <span className="text-neutral-400">Opacity</span>
              <span className="font-semibold text-neutral-300">{Math.round(options.opacity * 100)}%</span>
            </div>
            <input
              type="range"
              min={0.05}
              max={1.0}
              step={0.05}
              value={options.opacity}
              onChange={(e) => handleSliderChange('opacity', parseFloat(e.target.value))}
              className="w-full h-1.5 bg-neutral-950 rounded-lg appearance-none cursor-pointer accent-red-650"
            />
          </div>

          {/* Scale */}
          <div className="space-y-1">
            <div className="flex justify-between text-xs">
              <span className="text-neutral-400">Watermark Size</span>
              <span className="font-semibold text-neutral-300">{Math.round(options.scale * 100)}% of width</span>
            </div>
            <input
              type="range"
              min={0.05}
              max={0.4}
              step={0.01}
              value={options.scale}
              onChange={(e) => handleSliderChange('scale', parseFloat(e.target.value))}
              className="w-full h-1.5 bg-neutral-950 rounded-lg appearance-none cursor-pointer accent-red-650"
            />
          </div>

          {/* Position Presets */}
          <div className="space-y-2">
            <label className="text-xs font-semibold text-neutral-400 flex items-center gap-1">
              <LayoutGrid className="w-3.5 h-3.5 text-neutral-500" />
              Position Preset
            </label>
            <div className="grid grid-cols-2 gap-2">
              {positions.map((pos) => {
                const isActive = options.position === pos.value;
                return (
                  <button
                    key={pos.value}
                    type="button"
                    onClick={() => handlePositionPreset(pos.value)}
                    className={`py-1.5 px-3 text-[11px] font-semibold rounded-lg border text-center transition-all cursor-pointer
                      ${
                        isActive
                          ? 'border-red-500 bg-red-950/20 text-white font-bold'
                          : 'border-neutral-800 bg-neutral-950 text-neutral-400 hover:border-neutral-700 hover:text-neutral-200'
                      }`}
                  >
                    {pos.label}
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {!options.visible && (
        <div className="text-xs text-neutral-500 italic p-3 text-center border border-dashed border-neutral-800 rounded-lg bg-neutral-950/50">
          Enable the watermark to adjust position, size, and opacity settings.
        </div>
      )}
    </div>
  );
}
