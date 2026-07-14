import React, { useEffect, useRef } from 'react';

interface ConfirmDialogProps {
  isOpen: boolean;
  title: string;
  message: string;
  confirmText?: string;
  cancelText?: string;
  onConfirm: () => void;
  onCancel: () => void;
}

export default function ConfirmDialog({
  isOpen,
  title,
  message,
  confirmText = 'Confirm',
  cancelText = 'Cancel',
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  const overlayRef = useRef<HTMLDivElement>(null);
  const confirmButtonRef = useRef<HTMLButtonElement>(null);

  // Handle escape key to close dialog
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onCancel();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    // Focus the confirm button automatically for quick accessibility
    confirmButtonRef.current?.focus();

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen, onCancel]);

  if (!isOpen) return null;

  return (
    <div
      ref={overlayRef}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-fade-in"
      role="dialog"
      aria-modal="true"
      aria-labelledby="confirm-dialog-title"
      onClick={(e) => {
        if (e.target === overlayRef.current) onCancel();
      }}
    >
      <div className="w-full max-w-md overflow-hidden rounded-xl border border-neutral-800 bg-neutral-900 p-6 shadow-2xl transition-all">
        <h3
          id="confirm-dialog-title"
          className="text-lg font-semibold text-white mb-2"
        >
          {title}
        </h3>
        <p className="text-neutral-400 text-sm mb-6">
          {message}
        </p>
        <div className="flex justify-end gap-3">
          <button
            type="button"
            className="px-4 py-2 text-sm font-medium rounded-lg text-neutral-300 bg-neutral-800 hover:bg-neutral-700 active:bg-neutral-600 transition-colors focus:outline-none focus:ring-2 focus:ring-neutral-500 focus:ring-offset-2 focus:ring-offset-neutral-900 cursor-pointer"
            onClick={onCancel}
          >
            {cancelText}
          </button>
          <button
            ref={confirmButtonRef}
            type="button"
            className="px-4 py-2 text-sm font-medium rounded-lg text-white bg-red-800 hover:bg-red-700 active:bg-red-900 transition-colors focus:outline-none focus:ring-2 focus:ring-red-500 focus:ring-offset-2 focus:ring-offset-neutral-900 cursor-pointer"
            onClick={onConfirm}
          >
            {confirmText}
          </button>
        </div>
      </div>
    </div>
  );
}
