import React from 'react';
import { History, X, Trash2, ExternalLink, Download, Clock } from 'lucide-react';

export default function DownloadHistory({ isOpen, onClose, history, onClearHistory, onReDownload }) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/80 backdrop-blur-sm animate-fade-in">
      
      <div className="w-full max-w-md bg-zinc-950 border-l border-white/20 h-full flex flex-col justify-between shadow-2xl p-5 sm:p-6 overflow-y-auto">
        
        {/* Header */}
        <div className="flex items-center justify-between pb-4 border-b border-white/10">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-white/10 border border-white/20 flex items-center justify-center text-white">
              <History className="w-4 h-4" />
            </div>
            <div>
              <h3 className="font-bold text-white text-base">Riwayat Unduhan</h3>
              <p className="text-xs text-zinc-400">Daftar media yang pernah Anda unduh</p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-zinc-400 hover:text-white hover:bg-white/10 transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* History List */}
        <div className="flex-1 my-4 space-y-3 overflow-y-auto pr-1">
          {history.length === 0 ? (
            <div className="h-64 flex flex-col items-center justify-center text-center text-zinc-500 space-y-2">
              <History className="w-10 h-10 stroke-1 text-zinc-600" />
              <p className="text-sm font-medium">Belum ada riwayat unduhan.</p>
              <p className="text-xs text-zinc-600">Tautan video yang Anda unduh akan muncul di sini.</p>
            </div>
          ) : (
            history.map((item, idx) => (
              <div
                key={item.id || idx}
                className="p-3 rounded-xl border border-white/10 bg-white/[0.02] hover:bg-white/[0.05] transition flex items-center justify-between gap-3"
              >
                <img
                  src={item.thumbnail || 'https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?auto=format&fit=crop&w=600&q=80'}
                  alt={item.title}
                  className="w-12 h-12 rounded-lg object-cover border border-white/10 flex-shrink-0"
                />

                <div className="min-w-0 flex-1">
                  <h4 className="text-xs font-semibold text-white truncate">{item.title}</h4>
                  <div className="flex items-center gap-2 text-[11px] text-zinc-400 mt-0.5">
                    <span className="px-1.5 py-0.2 rounded bg-white/10 text-white font-mono uppercase text-[10px]">
                      {item.format || 'MP4'}
                    </span>
                    <span className="truncate">{item.quality || 'HD'}</span>
                  </div>
                  <span className="text-[10px] text-zinc-500 block mt-0.5">
                    {new Date(item.timestamp).toLocaleDateString('id-ID', { hour: '2-digit', minute: '2-digit' })}
                  </span>
                </div>

                <button
                  onClick={() => onReDownload(item)}
                  className="btn-icon w-8 h-8 rounded-lg flex-shrink-0"
                  title="Unduh Ulang"
                >
                  <Download className="w-3.5 h-3.5" />
                </button>
              </div>
            ))
          )}
        </div>

        {/* Footer Actions */}
        {history.length > 0 && (
          <div className="pt-4 border-t border-white/10 flex items-center justify-between">
            <span className="text-xs text-zinc-400">{history.length} item tersimpan</span>
            <button
              onClick={onClearHistory}
              className="text-xs text-zinc-400 hover:text-white flex items-center gap-1.5 transition py-1 px-2 rounded hover:bg-white/10"
            >
              <Trash2 className="w-3.5 h-3.5" />
              <span>Hapus Semua</span>
            </button>
          </div>
        )}

      </div>

    </div>
  );
}
