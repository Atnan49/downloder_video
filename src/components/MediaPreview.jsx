import React, { useState } from 'react';
import { Play, Pause, Film, User, Clock, ExternalLink } from 'lucide-react';

export default function MediaPreview({ mediaData, platform }) {
  const [isPlaying, setIsPlaying] = useState(false);

  if (!mediaData) return null;

  const { title, author, authorAvatar, thumbnail, duration, previewUrl } = mediaData;

  return (
    <div className="w-full max-w-3xl mx-auto my-6 px-4 animate-fade-in">
      <div className="glass-panel p-5 sm:p-6 rounded-2xl border-white/20 relative overflow-hidden bg-zinc-950/80">
        
        <div className="flex flex-col md:flex-row gap-6 items-start">
          
          {/* Media Thumbnail or Video Player Container */}
          <div className="w-full md:w-64 aspect-video md:aspect-[4/3] rounded-xl overflow-hidden bg-black border border-white/10 relative flex-shrink-0 group">
            
            {isPlaying && previewUrl ? (
              <video
                src={previewUrl}
                controls
                autoPlay
                className="w-full h-full object-contain"
                onEnded={() => setIsPlaying(false)}
              />
            ) : (
              <>
                <img
                  src={thumbnail || 'https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?auto=format&fit=crop&w=600&q=80'}
                  alt={title}
                  className="w-full h-full object-cover group-hover:scale-105 transition duration-500"
                  onError={(e) => {
                    e.target.src = 'https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?auto=format&fit=crop&w=600&q=80';
                  }}
                />

                {/* Duration Badge Overlay */}
                {duration && duration !== 'N/A' && (
                  <span className="absolute bottom-2 right-2 px-2 py-0.5 rounded bg-black/80 text-[11px] font-mono text-zinc-300 border border-white/10">
                    {duration}
                  </span>
                )}

                {/* Play Preview Overlay Button */}
                {previewUrl && (
                  <button
                    onClick={() => setIsPlaying(true)}
                    className="absolute inset-0 bg-black/40 group-hover:bg-black/20 flex items-center justify-center transition"
                    title="Putar Pratinjau Video"
                  >
                    <div className="w-12 h-12 rounded-full bg-white text-black flex items-center justify-center shadow-[0_0_20px_rgba(255,255,255,0.4)] group-hover:scale-110 transition duration-300">
                      <Play className="w-5 h-5 fill-black ml-0.5" />
                    </div>
                  </button>
                )}
              </>
            )}

          </div>

          {/* Media Info & Metadata */}
          <div className="flex-1 w-full space-y-3">
            
            {/* Platform & Badge Header */}
            <div className="flex items-center gap-2">
              <span className="px-2.5 py-0.5 rounded-full border border-white/20 bg-white/10 text-xs font-semibold text-white uppercase tracking-wider">
                {platform || 'Media'}
              </span>
              <span className="text-xs text-zinc-400 flex items-center gap-1">
                <Film className="w-3.5 h-3.5" /> Ready for Download
              </span>
            </div>

            {/* Media Title */}
            <h2 className="text-lg sm:text-xl font-bold text-white leading-snug line-clamp-2">
              {title || 'Media Video'}
            </h2>

            {/* Author / Creator Info */}
            <div className="flex items-center gap-2.5 pt-1 text-sm text-zinc-300">
              {authorAvatar ? (
                <img src={authorAvatar} alt={author} className="w-6 h-6 rounded-full border border-white/20 object-cover" />
              ) : (
                <div className="w-6 h-6 rounded-full bg-white/10 flex items-center justify-center border border-white/20">
                  <User className="w-3.5 h-3.5 text-zinc-300" />
                </div>
              )}
              <span className="font-medium text-zinc-200">{author || 'Kreator Media'}</span>
            </div>

            {/* Additional Stats */}
            <div className="pt-2 flex items-center gap-4 text-xs text-zinc-400 border-t border-white/10">
              <div className="flex items-center gap-1.5">
                <Clock className="w-3.5 h-3.5 text-zinc-400" />
                <span>Durasi: {duration || 'N/A'}</span>
              </div>
              {previewUrl && (
                <button
                  onClick={() => setIsPlaying(!isPlaying)}
                  className="text-white hover:underline flex items-center gap-1 font-medium ml-auto"
                >
                  {isPlaying ? 'Tutup Preview' : 'Putar Player Preview'}
                </button>
              )}
            </div>

          </div>

        </div>

      </div>
    </div>
  );
}
