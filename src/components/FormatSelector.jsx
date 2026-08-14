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
      <div className="solid-panel p-5 sm:p-6 rounded-none border-2 border-black bg-zinc-950/90">
        
        {/* Header & Tabs */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-black">
          <div>
            <h3 className="text-base sm:text-lg font-bold text-black flex items-center gap-2">
              <Download className="w-5 h-5 text-black" />
              <span>Pilih Format & Kualitas Unduhan</span>
            </h3>
            <p className="text-xs text-zinc-700">Pilih format video atau audio lossless sesuai kebutuhan Anda.</p>
          </div>

          {/* Format Filter Tabs */}
          <div className="flex items-center gap-1 bg-black/[0.04] p-1 rounded-none border-2 border-black">
            <button
              onClick={() => setActiveTab('all')}
              className={`px-3 py-1.5 rounded-none border-2 border-black text-xs font-semibold transition ${
                activeTab === 'all' ? 'bg-black text-white shadow-sm' : 'text-zinc-700 hover:text-black'
              }`}
            >
              Semua ({formats.length})
            </button>
            <button
              onClick={() => setActiveTab('video')}
              className={`px-3 py-1.5 rounded-none border-2 border-black text-xs font-semibold transition flex items-center gap-1 ${
                activeTab === 'video' ? 'bg-black text-white shadow-sm' : 'text-zinc-700 hover:text-black'
              }`}
            >
              <Video className="w-3.5 h-3.5" />
              <span>Video ({videoFormats.length})</span>
            </button>
            <button
              onClick={() => setActiveTab('audio')}
              className={`px-3 py-1.5 rounded-none border-2 border-black text-xs font-semibold transition flex items-center gap-1 ${
                activeTab === 'audio' ? 'bg-black text-white shadow-sm' : 'text-zinc-700 hover:text-black'
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
                className="group relative p-4 rounded-none border-2 border-black bg-black/[0.02] hover:bg-black/[0.06] hover:border-black transition duration-300 flex items-center justify-between gap-3"
              >
                
                {/* Format Info */}
                <div className="flex items-center gap-3 min-w-0">
                  <div className={`w-10 h-10 rounded-none border-2 border-black flex items-center justify-center border flex-shrink-0 ${
                    isAudio 
                      ? 'bg-black/10 text-black border-black' 
                      : 'bg-black text-white border-black'
                  }`}>
                    {isAudio ? <FileAudio className="w-5 h-5" /> : <Video className="w-5 h-5" />}
                  </div>

                  <div className="min-w-0">
                    <div className="flex items-center gap-1.5">
                      <span className="font-bold text-black text-sm truncate">{fmt.quality}</span>
                      {isNoWM && (
                        <span className="px-1.5 py-0.2 text-[10px] font-bold rounded bg-black text-white uppercase">
                          No-WM
                        </span>
                      )}
                      {isLossless && (
                        <span className="px-1.5 py-0.2 text-[10px] font-bold rounded border border-black text-zinc-900">
                          Lossless
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-2 text-xs text-zinc-700 mt-0.5">
                      <span className="font-mono uppercase text-zinc-800">{fmt.format}</span>
                      <span>•</span>
                      <span>{fmt.size || 'HD Quality'}</span>
                    </div>
                  </div>
                </div>

                {/* Download Action Button */}
                <button
                  onClick={() => onDownload(fmt)}
                  disabled={isDownloading}
                  className={`btn-primary py-2 px-3.5 text-xs rounded-none border-2 border-black font-bold flex-shrink-0 ${
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
