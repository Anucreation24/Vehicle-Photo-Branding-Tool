import React from 'react';
import BrandingEditor from '../components/editor/BrandingEditor';
import { ShieldCheck, Compass } from 'lucide-react';

export default function Home() {
  return (
    <div className="flex flex-col min-h-screen bg-neutral-950 font-sans text-neutral-100 selection:bg-red-800 selection:text-white">
      {/* Top Premium Header */}
      <header className="shrink-0 border-b border-neutral-900 bg-black/80 backdrop-blur-md px-4 py-3 sm:px-6 relative z-10 shadow-lg">
        <div className="max-w-7xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-red-950/60 border border-red-800 flex items-center justify-center text-red-500 shadow-inner">
              <Compass className="w-5 h-5" />
            </div>
            <div className="text-center sm:text-left">
              <h1 className="text-base sm:text-lg font-black tracking-wider uppercase flex items-center justify-center sm:justify-start gap-1">
                <span className="text-white">Thennakoon</span>
                <span className="text-red-500">Tours</span>
              </h1>
              <p className="text-[10px] text-neutral-400 font-bold uppercase tracking-widest leading-none mt-0.5">
                Vehicle Photo Branding Tool
              </p>
            </div>
          </div>

          <div className="flex items-center gap-4 text-xs text-neutral-400">
            <div className="hidden md:flex items-center gap-1.5 px-3 py-1 rounded-full bg-neutral-900 border border-neutral-850">
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
              <span className="font-semibold text-neutral-300">System Ready</span>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content Area */}
      <main className="flex-1 flex flex-col min-h-0 relative">
        <BrandingEditor />
      </main>

      {/* Footer */}
      <footer className="shrink-0 border-t border-neutral-900 bg-black px-4 py-3 sm:px-6 text-center text-xs text-neutral-500">
        <div className="max-w-7xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-2.5">
          <p className="font-semibold">
            © {new Date().getFullYear()} <span className="text-neutral-400">Thennakoon Tours</span>. All rights reserved.
          </p>
          <p className="flex items-center gap-1 text-[11px] text-neutral-400 bg-neutral-950 border border-neutral-900 px-2.5 py-1 rounded-lg">
            <ShieldCheck className="w-3.5 h-3.5 text-green-600" />
            <span>100% Client-Side: Photos are never uploaded to any server.</span>
          </p>
        </div>
      </footer>
    </div>
  );
}
