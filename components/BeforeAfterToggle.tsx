import React from 'react';
import { Eye, EyeOff } from 'lucide-react';

interface BeforeAfterToggleProps {
  isPreviewActive: boolean;
  onToggle: (active: boolean) => void;
}

export default function BeforeAfterToggle({
  isPreviewActive,
  onToggle,
}: BeforeAfterToggleProps) {
  return (
    <div className="flex items-center bg-neutral-900 border border-neutral-800 rounded-xl p-1 shadow-inner select-none w-fit">
      <button
        type="button"
        onClick={() => onToggle(false)}
        className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg transition-all duration-200 cursor-pointer
          ${
            !isPreviewActive
              ? 'bg-neutral-800 text-white shadow-md'
              : 'text-neutral-400 hover:text-neutral-200'
          }`}
      >
        <Eye className="w-3.5 h-3.5" />
        Branded (After)
      </button>
      <button
        type="button"
        onClick={() => onToggle(true)}
        className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg transition-all duration-200 cursor-pointer
          ${
            isPreviewActive
              ? 'bg-red-950 text-red-400 border border-red-900/50 shadow-md'
              : 'text-neutral-400 hover:text-neutral-200 border border-transparent'
          }`}
      >
        <EyeOff className="w-3.5 h-3.5" />
        Original (Before)
      </button>
    </div>
  );
}
