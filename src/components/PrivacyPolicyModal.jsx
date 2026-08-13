import React from 'react';
import { ShieldCheck, X, Lock, Eye, Server } from 'lucide-react';

export default function PrivacyPolicyModal({ isOpen, onClose }) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-fade-in">
      <div className="glass-panel w-full max-w-2xl bg-zinc-950 border border-white/20 rounded-2xl shadow-2xl p-6 sm:p-8 max-h-[85vh] flex flex-col justify-between overflow-hidden">
        
        {/* Modal Header */}
        <div className="flex items-center justify-between pb-4 border-b border-white/10 flex-shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-white text-black flex items-center justify-center font-bold">
              <ShieldCheck className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-extrabold text-white text-lg sm:text-xl">Privacy Policy</h3>
              <p className="text-xs text-zinc-400">Kebijakan Privasi & Perlindungan Data Pengguna</p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-2 rounded-xl text-zinc-400 hover:text-white hover:bg-white/10 transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Content Scrollable Area */}
        <div className="flex-1 my-4 overflow-y-auto pr-2 space-y-5 text-xs sm:text-sm text-zinc-300 leading-relaxed">
          
          <div className="space-y-2">
            <h4 className="font-bold text-white text-base flex items-center gap-2">
              <Lock className="w-4 h-4 text-white" />
              1. Komitmen Privasi
            </h4>
            <p className="text-zinc-400">
              Downloader berkomitmen tinggi untuk melindungi privasi pengguna. Layanan ini dirancang tanpa memerlukan registrasi akun, tanpa meminta email, dan tanpa mengumpulkan data pribadi sensitif.
            </p>
          </div>

          <div className="space-y-2">
            <h4 className="font-bold text-white text-base flex items-center gap-2">
              <Eye className="w-4 h-4 text-white" />
              2. Data yang Diproses & Penyimpanan Lokal
            </h4>
            <p className="text-zinc-400">
              Layanan kami hanya memproses tautan (URL) media yang Anda masukkan untuk keperluan pengunduhan. Riwayat unduhan hanya tersimpan secara lokal di browser Anda menggunakan teknologi <code className="text-white font-mono bg-white/10 px-1 py-0.5 rounded">localStorage</code> dan tidak pernah dikirim ke server pihak ketiga.
            </p>
          </div>

          <div className="space-y-2">
            <h4 className="font-bold text-white text-base flex items-center gap-2">
              <Server className="w-4 h-4 text-white" />
              3. Penggunaan Cookie & Log Server
            </h4>
            <p className="text-zinc-400">
              Kami tidak menggunakan cookie pelacak pihak ketiga atau iklan pelacak. Log server teknis hanya digunakan secara otomatis oleh penyedia infrastruktur (Vercel) untuk menjaga keamanan dan kestabilan sistem dari serangan siber.
            </p>
          </div>

          <div className="p-4 rounded-xl border border-white/10 bg-white/[0.02] text-xs text-zinc-400">
            Terakhir diperbarui: <strong className="text-white">14 Agustus 2026</strong>. Jika Anda memiliki pertanyaan seputar kebijakan privasi ini, silakan hubungi tim pengembang melalui domain resmi.
          </div>

        </div>

        {/* Modal Footer */}
        <div className="pt-4 border-t border-white/10 flex justify-end flex-shrink-0">
          <button
            onClick={onClose}
            className="btn-primary py-2 px-6 rounded-xl font-bold text-xs"
          >
            Saya Mengerti
          </button>
        </div>

      </div>
    </div>
  );
}
