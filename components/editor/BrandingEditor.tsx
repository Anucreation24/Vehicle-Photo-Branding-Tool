'use client';

import dynamic from 'next/dynamic';
import React from 'react';

const BrandingEditorClient = dynamic(
  () => import('./BrandingEditorClient'),
  {
    ssr: false,
    loading: () => (
      <div className="flex-1 flex flex-col items-center justify-center min-h-[400px] text-neutral-400 bg-neutral-950 p-4">
        <div className="w-10 h-10 border-4 border-red-800 border-t-transparent rounded-full animate-spin mb-4" />
        <span className="text-sm font-semibold tracking-wide uppercase text-neutral-500 animate-pulse">
          Loading Canvas Engine...
        </span>
      </div>
    ),
  }
);

export default function BrandingEditor() {
  return <BrandingEditorClient />;
}
