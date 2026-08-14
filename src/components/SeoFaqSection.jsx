import React, { useState } from 'react';
import { ChevronDown, HelpCircle } from 'lucide-react';

export default function SeoFaqSection() {
  const [openIdx, setOpenIdx] = useState(0);

  const faqs = [
    {
      q: 'Bagaimana cara mengunduh video TikTok tanpa watermark?',
      a: 'Salin tautan video TikTok dari aplikasi atau browser, tempelkan pada kolom pencarian di atas, lalu pilih format "No Watermark HD". Sistem kami akan mengekstrak file MP4 asli tanpa logo watermark TikTok secara gratis.'
    },
    {
      q: 'Apakah pengunduhan di Downloader gratis dan tanpa batas?',
      a: 'Ya, 100% gratis! Anda dapat mengunduh video dan audio sepuasnya tanpa perlu mendaftar akun, tanpa berlangganan, dan tanpa iklan yang mengganggu.'
    },
    {
      q: 'Apakah saya bisa mengunduh audio lagu MP3 dan FLAC Lossless dari YouTube?',
      a: 'Tentu saja! Kami mendukung konversi langsung dari video YouTube dan Shorts ke format audio high-definition MP3 (320kbps), M4A, dan FLAC Lossless Audio.'
    },
    {
      q: 'Apakah aman digunakan di HP Android, iPhone, dan Laptop/PC?',
      a: 'Sangat aman. Web ini berjalan berbasis browser (Cloud Web App) sehingga kompatibel di seluruh perangkat HP (Android/iOS) dan Komputer/Laptop (Windows/Mac/Linux) tanpa instalasi aplikasi tambahan.'
    },
    {
      q: 'Di mana file video hasil unduhan akan tersimpan?',
      a: 'File yang diunduh otomatis tersimpan di folder "Downloads" utama pada HP atau komputer Anda, serta tercatat di panel Riwayat Unduhan lokal browser Anda.'
    }
  ];

  const toggleFaq = (idx) => {
    setOpenIdx(openIdx === idx ? null : idx);
  };

  return (
    <section className="w-full max-w-4xl mx-auto my-12 px-4 border-t border-black pt-12">
      
      {/* Header */}
      <div className="text-center space-y-2 mb-10">
        <span className="px-3 py-1 rounded-none border border-black bg-black/5 text-xs text-zinc-800 font-mono uppercase tracking-wider">
          PERTANYAAN UMUM
        </span>
        <h2 className="text-2xl sm:text-3xl font-extrabold text-black tracking-tight">
          Pertanyaan yang Sering Diajukan (FAQ)
        </h2>
        <p className="text-sm text-zinc-700 max-w-xl mx-auto">
          Temukan jawaban atas pertanyaan paling umum seputar layanan pengunduh video & audio.
        </p>
      </div>

      {/* Accordion List */}
      <div className="space-y-3">
        {faqs.map((faq, idx) => {
          const isOpen = openIdx === idx;
          return (
            <div
              key={idx}
              className="rounded-none border-2 border-black bg-black/[0.02] overflow-hidden transition duration-300"
            >
              <button
                onClick={() => toggleFaq(idx)}
                className="w-full p-5 text-left flex items-center justify-between gap-4 font-bold text-black text-sm sm:text-base hover:bg-black/[0.04] transition"
              >
                <div className="flex items-center gap-3">
                  <HelpCircle className="w-4 h-4 text-zinc-700 flex-shrink-0" />
                  <span>{faq.q}</span>
                </div>
                <ChevronDown className={`w-4 h-4 text-zinc-700 transition-transform duration-300 flex-shrink-0 ${
                  isOpen ? 'rotate-180 text-black' : ''
                }`} />
              </button>

              {isOpen && (
                <div className="px-5 pb-5 pt-1 text-xs sm:text-sm text-zinc-700 leading-relaxed border-t border-black bg-black/40 animate-fade-in">
                  {faq.a}
                </div>
              )}
            </div>
          );
        })}
      </div>

    </section>
  );
}
