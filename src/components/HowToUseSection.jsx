import React from 'react';
import { Copy, Sparkles, Download, CheckCircle2 } from 'lucide-react';

export default function HowToUseSection() {
  const steps = [
    {
      step: '01',
      title: 'Salin Tautan Video',
      desc: 'Buka TikTok, YouTube, atau Instagram, lalu salin tautan (URL) video atau audio yang ingin diunduh.',
      icon: Copy
    },
    {
      step: '02',
      title: 'Tempel & Proses',
      desc: 'Tempelkan tautan pada kolom pencarian di atas. Sistem kami secara otomatis mendeteksi platform media.',
      icon: Sparkles
    },
    {
      step: '03',
      title: 'Pilih Format & Unduh',
      desc: 'Pilih format MP4 (4K/1080p), MP3, atau FLAC Lossless, lalu klik tombol Unduh untuk menyimpan file.',
      icon: Download
    }
  ];

  return (
    <section className="w-full max-w-5xl mx-auto my-12 px-4 border-t border-white/10 pt-12">
      
      {/* Title */}
      <div className="text-center space-y-2 mb-10">
        <span className="px-3 py-1 rounded-full border border-white/20 bg-white/5 text-xs text-zinc-300 font-mono uppercase tracking-wider">
          PANDUAN PENGGUNAAN
        </span>
        <h2 className="text-2xl sm:text-3xl font-extrabold text-white tracking-tight">
          Cara Mengunduh Video & Audio dalam 3 Langkah
        </h2>
        <p className="text-sm text-zinc-400 max-w-xl mx-auto">
          Proses serba cepat tanpa perlu instalasi aplikasi tambahan atau pendaftaran akun.
        </p>
      </div>

      {/* Steps Grid */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {steps.map((item, idx) => {
          const IconComponent = item.icon;
          return (
            <div
              key={idx}
              className="relative p-6 rounded-2xl border border-white/10 bg-white/[0.02] hover:bg-white/[0.05] transition duration-300 space-y-4 group"
            >
              <div className="flex items-center justify-between">
                <span className="w-10 h-10 rounded-xl bg-white text-black font-extrabold text-sm flex items-center justify-center shadow-[0_0_15px_rgba(255,255,255,0.2)]">
                  {item.step}
                </span>
                <span className="p-2 rounded-lg bg-white/10 text-white">
                  <IconComponent className="w-4 h-4" />
                </span>
              </div>

              <div>
                <h3 className="font-bold text-white text-lg group-hover:text-white transition">
                  {item.title}
                </h3>
                <p className="text-xs text-zinc-400 mt-2 leading-relaxed">
                  {item.desc}
                </p>
              </div>
            </div>
          );
        })}
      </div>

    </section>
  );
}
