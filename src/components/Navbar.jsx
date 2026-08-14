import React from 'react';
import { History } from 'lucide-react';

export default function Navbar({ onOpenHistory, historyCount = 0 }) {
  return (
    <header className="solid-nav border-b-2 border-black sticky top-0 z-40 w-full">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between">
        
        {/* Elegant Minimalist Logo Brand */}
        <div className="flex items-center gap-3 cursor-pointer group">
          {/* Custom Geometric Logo Icon */}
          <div className="w-9 h-9 rounded-none border-2 border-black bg-black text-white flex items-center justify-center shadow-none border-2 border-black group-hover:scale-105 transition duration-300">
            <svg 
              className="w-5 h-5" 
              viewBox="0 0 24 24" 
              fill="none" 
              stroke="currentColor" 
              strokeWidth="2.5" 
              strokeLinecap="round" 
              strokeLinejoin="round"
            >
              <path d="M12 3v13" />
              <path d="m7 11 5 5 5-5" />
              <path d="M5 21h14" />
            </svg>
          </div>

          {/* Typography Monogram */}
          <div className="flex flex-col">
            <span className="font-extrabold text-base sm:text-lg tracking-[0.18em] text-black uppercase leading-none">
              DOWNLOADER
            </span>
            <span className="text-[9px] tracking-[0.25em] text-zinc-700 uppercase mt-0.5 font-medium">
              ULTRA HD STREAM
            </span>
          </div>
        </div>

        {/* Status & History Action */}
        <div className="flex items-center gap-3 sm:gap-4">
          
          {/* Server Status Indicator */}
          <div className="hidden sm:flex items-center gap-2 px-3 py-1 rounded-none border border-black bg-black/[0.03] text-xs text-zinc-700">
            <span className="w-1.5 h-1.5 rounded-none bg-black text-white animate-pulse"></span>
            <span className="font-mono text-[11px]">API ONLINE</span>
          </div>

          {/* History Button */}
          <button
            onClick={onOpenHistory}
            className="btn-secondary text-xs sm:text-sm py-2 px-3 sm:px-4 relative flex items-center gap-2"
            title="Riwayat Unduhan"
          >
            <History className="w-4 h-4 text-zinc-800" />
            <span className="hidden sm:inline font-medium">Riwayat</span>
            {historyCount > 0 && (
              <span className="ml-1 bg-black text-white font-bold text-[10px] px-1.5 py-0.2 rounded-none">
                {historyCount}
              </span>
            )}
          </button>

        </div>

      </div>
    </header>
  );
}
