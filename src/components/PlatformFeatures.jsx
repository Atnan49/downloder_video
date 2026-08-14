import React from 'react';
import { Music, Play, Camera, Headphones, ShieldCheck, Zap } from 'lucide-react';

export default function PlatformFeatures() {
  const features = [
    {
      title: 'TikTok No Watermark',
      desc: 'Unduh video TikTok kualitas HD tanpa watermark gratis & cepat.',
      icon: Music,
      badge: 'HD No-WM'
    },
    {
      title: 'YouTube 4K & MP3',
      desc: 'Dukungan unduh video 4K/1080p, Shorts, dan konversi ke MP3/FLAC.',
      icon: Play,
      badge: '4K & Shorts'
    },
    {
      title: 'Instagram Reels & Post',
      desc: 'Simpan Reels, IGTV, dan foto postingan Instagram dalam kualitas asli.',
      icon: Camera,
      badge: 'Reels / Post'
    },
    {
      title: 'Audio Lossless (FLAC & M4A)',
      desc: 'Ekstraksi lagu dan efek suara ke format audio high-definition FLAC & M4A.',
      icon: Headphones,
      badge: 'Lossless'
    },
    {
      title: 'Tanpa Registrasi & Iklan',
      desc: 'Gunakan langsung tanpa daftar akun, 100% aman dan menjaga privasi.',
      icon: ShieldCheck,
      badge: 'Private'
    },
    {
      title: 'High-Speed CDN Engine',
      desc: 'Kecepatan pengunduhan maksimum langsung dari server CDN resmi.',
      icon: Zap,
      badge: 'Ultra Fast'
    }
  ];

  return (
    <div className="w-full max-w-5xl mx-auto my-12 px-4">
      
      {/* Title */}
      <div className="text-center space-y-2 mb-8">
        <h3 className="text-xl sm:text-2xl font-extrabold text-black tracking-tight">
          Layanan & Fitur Unggulan
        </h3>
        <p className="text-sm text-zinc-700 max-w-xl mx-auto">
          Nikmati kemudahan mengunduh video dan audio favorit dari berbagai platform populer dengan kualitas terbaik.
        </p>
      </div>

      {/* Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {features.map((item, idx) => {
          const IconComp = item.icon;
          return (
            <div
              key={idx}
              className="p-5 rounded-none border-2 border-black bg-black/[0.02] hover:bg-black/[0.05] hover:border-black transition duration-300 space-y-3 group"
            >
              <div className="flex items-center justify-between">
                <span className="w-10 h-10 rounded-none border-2 border-black bg-black/10 border border-black flex items-center justify-center text-black group-hover:scale-110 transition duration-300">
                  <IconComp className="w-4 h-4 stroke-[2]" />
                </span>
                <span className="px-2 py-0.5 rounded text-[10px] font-mono border border-black bg-black/5 text-zinc-800">
                  {item.badge}
                </span>
              </div>

              <div>
                <h4 className="font-bold text-black text-base group-hover:text-black transition">{item.title}</h4>
                <p className="text-xs text-zinc-700 mt-1 leading-relaxed">{item.desc}</p>
              </div>
            </div>
          );
        })}
      </div>

    </div>
  );
}
