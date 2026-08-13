import React, { useState, useEffect } from 'react';
import { Search, Clipboard, X, ArrowRight, Loader2, Music, Play, Camera, Share2, Twitter } from 'lucide-react';

export default function UrlInput({ onSubmit, isLoading, urlValue, setUrlValue }) {
  const [detectedPlatform, setDetectedPlatform] = useState(null);

  // Auto-detect platform from URL string
  useEffect(() => {
    const url = urlValue.trim().toLowerCase();
    if (url.includes('tiktok.com')) {
      setDetectedPlatform({ name: 'TikTok', icon: Music, badge: 'No-Watermark' });
    } else if (url.includes('youtube.com') || url.includes('youtu.be')) {
      setDetectedPlatform({ name: 'YouTube', icon: Play, badge: '4K / Shorts' });
    } else if (url.includes('instagram.com') || url.includes('instagr.am')) {
      setDetectedPlatform({ name: 'Instagram', icon: Camera, badge: 'Reels / Posts' });
    } else if (url.includes('facebook.com') || url.includes('fb.watch')) {
      setDetectedPlatform({ name: 'Facebook', icon: Share2, badge: 'HD Video' });
    } else if (url.includes('twitter.com') || url.includes('x.com')) {
      setDetectedPlatform({ name: 'X / Twitter', icon: Twitter, badge: 'Video' });
    } else {
      setDetectedPlatform(null);
    }
  }, [urlValue]);

  const handlePaste = async () => {
    try {
      if (navigator.clipboard && navigator.clipboard.readText) {
        const text = await navigator.clipboard.readText();
        if (text) {
          setUrlValue(text);
        }
      }
    } catch (err) {
      console.warn('Clipboard read error:', err);
    }
  };

  const handleClear = () => {
    setUrlValue('');
    setDetectedPlatform(null);
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    if (urlValue.trim() && !isLoading) {
      onSubmit(urlValue.trim());
    }
  };

  const PlatformIconComponent = detectedPlatform?.icon;

  return (
    <div className="w-full max-w-3xl mx-auto my-6 sm:my-10 px-4">
      <form onSubmit={handleSubmit} className="relative group">
        
        {/* Glowing Background Effect */}
        <div className="absolute -inset-1 rounded-2xl bg-gradient-to-r from-white/10 via-white/20 to-white/10 opacity-40 blur-md group-hover:opacity-75 transition duration-500"></div>

        <div className="relative glass-panel p-2 sm:p-2.5 flex items-center gap-2 rounded-2xl border-white/20 bg-black/90">
          
          {/* Platform Icon or Search Icon */}
          <div className="pl-3 sm:pl-4 text-zinc-400 flex items-center justify-center min-w-[28px]">
            {detectedPlatform && PlatformIconComponent ? (
              <span className="w-7 h-7 rounded-full bg-white/10 border border-white/20 flex items-center justify-center text-white">
                <PlatformIconComponent className="w-3.5 h-3.5" />
              </span>
            ) : (
              <Search className="w-5 h-5 text-zinc-400" />
            )}
          </div>

          {/* Text Input */}
          <input
            type="url"
            value={urlValue}
            onChange={(e) => setUrlValue(e.target.value)}
            placeholder="Tempel tautan video (TikTok, YouTube, Instagram, Facebook, X)..."
            className="w-full bg-transparent text-white placeholder-zinc-500 text-sm sm:text-base py-3 px-1 focus:outline-none"
            required
            disabled={isLoading}
          />

          {/* Action Buttons inside Input */}
          <div className="flex items-center gap-1.5 pr-1">
            {urlValue ? (
              <button
                type="button"
                onClick={handleClear}
                className="p-2 text-zinc-400 hover:text-white hover:bg-white/10 rounded-lg transition"
                title="Hapus"
              >
                <X className="w-4 h-4" />
              </button>
            ) : (
              <button
                type="button"
                onClick={handlePaste}
                className="hidden sm:flex items-center gap-1 px-3 py-1.5 text-xs text-zinc-400 hover:text-white border border-white/10 hover:border-white/25 rounded-lg bg-white/[0.03] transition"
                title="Tempel dari Clipboard"
              >
                <Clipboard className="w-3.5 h-3.5" />
                <span>Paste</span>
              </button>
            )}

            {/* Submit CTA Button */}
            <button
              type="submit"
              disabled={isLoading || !urlValue.trim()}
              className="btn-primary py-3 px-5 sm:px-7 rounded-xl text-sm font-bold disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap"
            >
              {isLoading ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin text-black" />
                  <span className="hidden sm:inline">Memproses...</span>
                </>
              ) : (
                <>
                  <span>Unduh</span>
                  <ArrowRight className="w-4 h-4 text-black stroke-[3]" />
                </>
              )}
            </button>
          </div>

        </div>

      </form>

      {/* Auto-detected Platform Badge */}
      {detectedPlatform && (
        <div className="mt-3 flex items-center justify-between text-xs text-zinc-400 px-2 animate-fade-in">
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-white animate-pulse"></span>
            <span>Terdeteksi: <strong className="text-white">{detectedPlatform.name}</strong></span>
          </div>
          <span className="px-2 py-0.5 rounded border border-white/20 bg-white/5 text-[11px] text-zinc-300">
            {detectedPlatform.badge}
          </span>
        </div>
      )}

      {/* Supported Platforms Quick Pills */}
      {!detectedPlatform && (
        <div className="mt-4 flex flex-wrap items-center justify-center gap-2 text-xs text-zinc-500">
          <span className="text-zinc-600">Didukung:</span>
          {['TikTok (No WM)', 'YouTube 4K & MP3', 'Instagram Reels', 'Facebook HD', 'X / Twitter'].map((item, idx) => (
            <span key={idx} className="px-2.5 py-1 rounded-full border border-white/10 bg-white/[0.02] text-zinc-400 hover:border-white/20 transition cursor-default font-medium">
              {item}
            </span>
          ))}
        </div>
      )}

    </div>
  );
}
