import React from 'react';
import { FileText, X, AlertCircle, Scale, ShieldAlert } from 'lucide-react';

export default function TermsOfServiceModal({ isOpen, onClose }) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-fade-in">
      <div className="solid-panel w-full max-w-2xl bg-black text-white border border-black rounded-none border-2 border-black shadow-2xl p-6 sm:p-8 max-h-[85vh] flex flex-col justify-between overflow-hidden">
        
        {/* Modal Header */}
        <div className="flex items-center justify-between pb-4 border-b border-black flex-shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-none border-2 border-black bg-black text-white flex items-center justify-center font-bold">
              <FileText className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-extrabold text-black text-lg sm:text-xl">Terms of Service</h3>
              <p className="text-xs text-zinc-700">Syarat & Ketentuan Penggunaan Layanan</p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-2 rounded-none border-2 border-black text-zinc-700 hover:text-black hover:bg-black/10 transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Content Scrollable Area */}
        <div className="flex-1 my-4 overflow-y-auto pr-2 space-y-5 text-xs sm:text-sm text-zinc-800 leading-relaxed">
          
          <div className="space-y-2">
            <h4 className="font-bold text-black text-base flex items-center gap-2">
              <Scale className="w-4 h-4 text-black" />
              1. Penggunaan Pribadi & Non-Komersial
            </h4>
            <p className="text-zinc-700">
              Downloader disediakan hanya untuk penggunaan pribadi, edukasi, dan backup berkas secara sah. Anda bertanggung jawab penuh atas media yang Anda unduh dari platform pihak ketiga.
            </p>
          </div>

          <div className="space-y-2">
            <h4 className="font-bold text-black text-base flex items-center gap-2">
              <ShieldAlert className="w-4 h-4 text-black" />
              2. Hak Cipta & Disclaimer Penyelenggara
            </h4>
            <p className="text-zinc-700">
              Downloader tidak pernah menyimpan, menampung (host), atau mendistribusikan berkas media berhak cipta di server kami. Seluruh berkas media diunduh langsung dari server CDN resmi platform pemilik konten (TikTok, YouTube, Instagram).
            </p>
          </div>

          <div className="space-y-2">
            <h4 className="font-bold text-black text-base flex items-center gap-2">
              <AlertCircle className="w-4 h-4 text-black" />
              3. Batasan Tanggung Jawab
            </h4>
            <p className="text-zinc-700">
              Layanan disediakan "sebagaimana adanya" (AS IS). Pengembang tidak bertanggung jawab atas penyalahgunaan konten atau pelanggaran hak cipta yang dilakukan oleh pengguna akhir.
            </p>
          </div>

          <div className="p-4 rounded-none border-2 border-black bg-black/[0.02] text-xs text-zinc-700">
            Terakhir diperbarui: <strong className="text-black">14 Agustus 2026</strong>. Dengan menggunakan layanan ini, Anda dianggap telah membaca dan menyetujui seluruh ketentuan di atas.
          </div>

        </div>

        {/* Modal Footer */}
        <div className="pt-4 border-t border-black flex justify-end flex-shrink-0">
          <button
            onClick={onClose}
            className="btn-primary py-2 px-6 rounded-none border-2 border-black font-bold text-xs"
          >
            Saya Setuju
          </button>
        </div>

      </div>
    </div>
  );
}
