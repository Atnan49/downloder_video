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
    <section className="w-full max-w-5xl mx-auto my-12 px-4 border-t border-black pt-12">
      
      {/* Title */}
      <div className="text-center space-y-2 mb-10">
        <span className="px-3 py-1 rounded-none border border-black bg-black/5 text-xs text-zinc-800 font-mono uppercase tracking-wider">
          PANDUAN PENGGUNAAN
        </span>
        <h2 className="text-2xl sm:text-3xl font-extrabold text-black tracking-tight">
          Cara Mengunduh Video & Audio dalam 3 Langkah
        </h2>
        <p className="text-sm text-zinc-700 max-w-xl mx-auto">
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
              className="relative p-6 rounded-none border-2 border-black bg-black/[0.02] hover:bg-black/[0.05] transition duration-300 space-y-4 group"
            >
              <div className="flex items-center justify-between">
                <span className="w-10 h-10 rounded-none border-2 border-black bg-black text-white font-extrabold text-sm flex items-center justify-center shadow-[0_0_15px_rgba(255,255,255,0.2)]">
                  {item.step}
                </span>
                <span className="p-2 rounded-none border-2 border-black bg-black/10 text-black">
                  <IconComponent className="w-4 h-4" />
                </span>
              </div>

              <div>
                <h3 className="font-bold text-black text-lg group-hover:text-black transition">
                  {item.title}
                </h3>
                <p className="text-xs text-zinc-700 mt-2 leading-relaxed">
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
