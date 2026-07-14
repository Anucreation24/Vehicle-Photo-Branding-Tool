import React from 'react';
import { AlertCircle, RotateCcw } from 'lucide-react';

interface ErrorMessageProps {
  message: string;
  onRetry?: () => void;
}

export default function ErrorMessage({ message, onRetry }: ErrorMessageProps) {
  if (!message) return null;

  return (
    <div className="w-full rounded-xl border border-red-900 bg-red-950/30 p-4 text-red-200 shadow-lg backdrop-blur-sm animate-fade-in flex items-start gap-3">
      <AlertCircle className="w-5 h-5 text-red-500 shrink-0 mt-0.5" />
      <div className="flex-1">
        <h4 className="font-semibold text-red-400 text-sm">Error</h4>
        <p className="text-sm text-red-300/95 mt-0.5">{message}</p>
        {onRetry && (
          <button
            type="button"
            onClick={onRetry}
            className="mt-3 flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg bg-red-900/50 hover:bg-red-800/60 active:bg-red-950 text-red-100 border border-red-800 transition-colors focus:outline-none focus:ring-2 focus:ring-red-500 cursor-pointer"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            Try Again
          </button>
        )}
      </div>
    </div>
  );
}
