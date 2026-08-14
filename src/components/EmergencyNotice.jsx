import React from 'react';
import { AlertCircle, ExternalLink, X, RefreshCw } from 'lucide-react';

export default function EmergencyNotice({ isVisible, onClose, onRetryClientMode, targetUrl }) {
  if (!isVisible) return null;

  return (
    <div className="fixed inset-x-4 bottom-6 z-50 max-w-xl mx-auto animate-fade-in">
      <div className="solid-panel p-4 sm:p-5 rounded-none border-2 border-black bg-zinc-950/95 shadow-2xl flex items-start gap-4">
        
        <div className="w-9 h-9 rounded-none border-2 border-black bg-black text-white flex items-center justify-center flex-shrink-0 font-bold">
          <AlertCircle className="w-5 h-5" />
        </div>

        <div className="flex-1 space-y-1.5">
          <div className="flex items-center justify-between">
            <h4 className="font-bold text-black text-sm">Mode Cadangan Aktif (Client Direct)</h4>
            <button onClick={onClose} className="text-zinc-700 hover:text-black">
              <X className="w-4 h-4" />
            </button>
          </div>
          <p className="text-xs text-zinc-800 leading-relaxed">
            Server mengalami proteksi anti-bot dari platform. Mengalihkan ke mode pengunduhan langsung via browser pengunjung.
          </p>

          <div className="pt-2 flex items-center gap-3">
            <button
              onClick={onRetryClientMode}
              className="btn-primary py-1.5 px-3 text-xs font-bold rounded-none border-2 border-black flex items-center gap-1.5"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              <span>Coba Mode Client Direct</span>
            </button>
            {targetUrl && (
              <a
                href={targetUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs text-zinc-700 hover:text-black underline flex items-center gap-1"
              >
                <span>Buka Link Asli</span>
                <ExternalLink className="w-3 h-3" />
              </a>
            )}
          </div>
        </div>

      </div>
    </div>
  );
}
