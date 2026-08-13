import React, { useState } from 'react';
import { Download, Video, Music, Sparkles, CheckCircle2, Loader2, FileAudio, ExternalLink } from 'lucide-react';

export default function FormatSelector({ mediaData, onDownload, downloadingId }) {
  const [activeTab, setActiveTab] = useState('all');

  if (!mediaData || !mediaData.formats) return null;

  const formats = mediaData.formats;

  // Filter formats based on tab
  const videoFormats = formats.filter(f => f.type === 'video' || f.format === 'MP4');
  const audioFormats = formats.filter(f => f.type === 'audio' || f.format === 'MP3' || f.format === 'M4A' || f.format === 'FLAC');

  const displayFormats = 
    activeTab === 'video' ? videoFormats :
    activeTab === 'audio' ? audioFormats : formats;

  return (
    <div className="w-full max-w-3xl mx-auto my-6 px-4 animate-fade-in">
      <div className="glass-panel p-5 sm:p-6 rounded-2xl border-white/20 bg-zinc-950/90">
        
        {/* Header & Tabs */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-white/10">
          <div>
            <h3 className="text-base sm:text-lg font-bold text-white flex items-center gap-2">
              <Download className="w-5 h-5 text-white" />
              <span>Pilih Format & Kualitas Unduhan</span>
            </h3>
            <p className="text-xs text-zinc-400">Pilih format video atau audio lossless sesuai kebutuhan Anda.</p>
          </div>

          {/* Format Filter Tabs */}
          <div className="flex items-center gap-1 bg-white/[0.04] p-1 rounded-xl border border-white/10">
            <button
              onClick={() => setActiveTab('all')}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition ${
                activeTab === 'all' ? 'bg-white text-black shadow-sm' : 'text-zinc-400 hover:text-white'
              }`}
            >
              Semua ({formats.length})
            </button>
            <button
              onClick={() => setActiveTab('video')}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition flex items-center gap-1 ${
                activeTab === 'video' ? 'bg-white text-black shadow-sm' : 'text-zinc-400 hover:text-white'
              }`}
            >
              <Video className="w-3.5 h-3.5" />
              <span>Video ({videoFormats.length})</span>
            </button>
            <button
              onClick={() => setActiveTab('audio')}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition flex items-center gap-1 ${
                activeTab === 'audio' ? 'bg-white text-black shadow-sm' : 'text-zinc-400 hover:text-white'
              }`}
            >
              <Music className="w-3.5 h-3.5" />
              <span>Audio ({audioFormats.length})</span>
            </button>
          </div>
        </div>

        {/* Format Cards Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-4">
          {displayFormats.map((fmt, index) => {
            const isDownloading = downloadingId === fmt.id;
            const isAudio = fmt.type === 'audio' || ['MP3', 'M4A', 'FLAC', 'WAV'].includes(fmt.format);
            const isLossless = fmt.format === 'FLAC';
            const isNoWM = fmt.quality?.toLowerCase().includes('no watermark');

            return (
              <div
                key={fmt.id || index}
                className="group relative p-4 rounded-xl border border-white/10 bg-white/[0.02] hover:bg-white/[0.06] hover:border-white/25 transition duration-300 flex items-center justify-between gap-3"
              >
                
                {/* Format Info */}
                <div className="flex items-center gap-3 min-w-0">
                  <div className={`w-10 h-10 rounded-lg flex items-center justify-center border flex-shrink-0 ${
                    isAudio 
                      ? 'bg-white/10 text-white border-white/20' 
                      : 'bg-white text-black border-white'
                  }`}>
                    {isAudio ? <FileAudio className="w-5 h-5" /> : <Video className="w-5 h-5" />}
                  </div>

                  <div className="min-w-0">
                    <div className="flex items-center gap-1.5">
                      <span className="font-bold text-white text-sm truncate">{fmt.quality}</span>
                      {isNoWM && (
                        <span className="px-1.5 py-0.2 text-[10px] font-bold rounded bg-white text-black uppercase">
                          No-WM
                        </span>
                      )}
                      {isLossless && (
                        <span className="px-1.5 py-0.2 text-[10px] font-bold rounded border border-white/40 text-zinc-200">
                          Lossless
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-2 text-xs text-zinc-400 mt-0.5">
                      <span className="font-mono uppercase text-zinc-300">{fmt.format}</span>
                      <span>•</span>
                      <span>{fmt.size || 'HD Quality'}</span>
                    </div>
                  </div>
                </div>

                {/* Download Action Button */}
                <button
                  onClick={() => onDownload(fmt)}
                  disabled={isDownloading}
                  className={`btn-primary py-2 px-3.5 text-xs rounded-lg font-bold flex-shrink-0 ${
                    isDownloading ? 'opacity-75 cursor-wait' : ''
                  }`}
                  title={`Unduh ${fmt.quality}`}
                >
                  {isDownloading ? (
                    <>
                      <Loader2 className="w-3.5 h-3.5 animate-spin text-black" />
                      <span>Unduh...</span>
                    </>
                  ) : (
                    <>
                      <Download className="w-3.5 h-3.5 stroke-[2.5]" />
                      <span>Unduh</span>
                    </>
                  )}
                </button>

              </div>
            );
          })}
        </div>

      </div>
    </div>
  );
}
