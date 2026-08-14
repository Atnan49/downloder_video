import React, { useState, useEffect } from 'react';
import axios from 'axios';
import Navbar from './components/Navbar';
import UrlInput from './components/UrlInput';
import MediaPreview from './components/MediaPreview';
import FormatSelector from './components/FormatSelector';
import DownloadHistory from './components/DownloadHistory';
import PlatformFeatures from './components/PlatformFeatures';
import HowToUseSection from './components/HowToUseSection';
import SeoFaqSection from './components/SeoFaqSection';
import EmergencyNotice from './components/EmergencyNotice';
import PrivacyPolicyModal from './components/PrivacyPolicyModal';
import TermsOfServiceModal from './components/TermsOfServiceModal';
import { Download, AlertCircle } from 'lucide-react';

export default function App() {
  const [urlValue, setUrlValue] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [mediaData, setMediaData] = useState(null);
  const [platform, setPlatform] = useState('');
  const [errorMessage, setErrorMessage] = useState('');
  const [downloadingId, setDownloadingId] = useState(null);
  
  // History & Emergency state
  const [history, setHistory] = useState([]);
  const [isHistoryOpen, setIsHistoryOpen] = useState(false);
  const [showEmergency, setShowEmergency] = useState(false);

  // Legal Modals state
  const [isPrivacyOpen, setIsPrivacyOpen] = useState(false);
  const [isTermsOpen, setIsTermsOpen] = useState(false);

  // Load history from localStorage
  useEffect(() => {
    try {
      const saved = localStorage.getItem('dl_history_v1');
      if (saved) {
        setHistory(JSON.parse(saved));
      }
    } catch (e) {
      console.warn('Failed to load history:', e);
    }
  }, []);

  // Save history to localStorage
  const saveToHistory = (newItem) => {
    try {
      const updated = [newItem, ...history.filter(h => h.id !== newItem.id)].slice(0, 30);
      setHistory(updated);
      localStorage.setItem('dl_history_v1', JSON.stringify(updated));
    } catch (e) {
      console.warn('Failed to save history:', e);
    }
  };

  const handleClearHistory = () => {
    setHistory([]);
    localStorage.removeItem('dl_history_v1');
  };

  // Main Extract Handler
  const handleExtract = async (targetUrl) => {
    setIsLoading(true);
    setErrorMessage('');
    setMediaData(null);
    setShowEmergency(false);

    try {
      const response = await axios.post('/api/info', { url: targetUrl }, {
        headers: { 'Content-Type': 'application/json' },
        timeout: 60000
      });

      if (response.data && response.data.success && response.data.data) {
        setMediaData(response.data.data);
        setPlatform(response.data.platform);
        
        // Scroll smoothly to preview section
        setTimeout(() => {
          window.scrollTo({ top: 320, behavior: 'smooth' });
        }, 100);
      } else {
        throw new Error(response.data?.error || 'Gagal mengambil metadata video.');
      }

    } catch (err) {
      console.error('Extraction error:', err);
      const msg = err.response?.data?.error || err.message || 'Terjadi kesalahan saat memproses URL.';
      setErrorMessage(msg);
      setShowEmergency(true);
    } finally {
      setIsLoading(false);
    }
  };

  // Handle Download Trigger
  const handleDownload = async (fmt) => {
    if (!fmt || !fmt.url) return;

    setDownloadingId(fmt.id);

    try {
      const downloadFilename = mediaData?.title || 'video-download';
      const fileFormat = (fmt.format || 'mp4').toLowerCase();

      // Trigger stream download via direct window open or anchor tag
      const link = document.createElement('a');
      link.href = fmt.url;
      link.download = `${downloadFilename.replace(/[^a-zA-Z0-9_-]/g, '_')}.${fileFormat}`;
      link.target = '_blank';
      link.rel = 'noopener noreferrer';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);

      // Save to download history
      saveToHistory({
        id: `${Date.now()}_${fmt.id}`,
        title: mediaData?.title || 'Media Video',
        thumbnail: mediaData?.thumbnail || '',
        platform: platform,
        quality: fmt.quality,
        format: fmt.format,
        url: fmt.url,
        timestamp: Date.now()
      });

    } catch (err) {
      console.error('Download trigger error:', err);
      window.open(fmt.url, '_blank');
    } finally {
      setTimeout(() => setDownloadingId(null), 1500);
    }
  };

  return (
    <div className="min-h-screen bg-black text-white flex flex-col justify-between selection:bg-white selection:text-black">
      
      {/* Background Glow */}
      <div className="glow-background"></div>

      {/* Navbar */}
      <Navbar
        onOpenHistory={() => setIsHistoryOpen(true)}
        historyCount={history.length}
      />

      {/* Main Container */}
      <main className="flex-1 relative z-10 max-w-6xl w-full mx-auto px-4 py-8 sm:py-14 space-y-8 sm:space-y-12">
        
        {/* Hero Section */}
        <div className="text-center space-y-4 max-w-3xl mx-auto pt-2">
          <h1 className="text-3xl sm:text-5xl md:text-6xl font-extrabold tracking-tight title-gradient leading-[1.1]">
            Unduh Video & Audio HD <br className="hidden sm:inline" />
            Tanpa Watermark & Gratis
          </h1>

          <p className="text-sm sm:text-base text-zinc-400 max-w-xl mx-auto leading-relaxed">
            Dukung pengunduhan dari <strong className="text-white">TikTok (No-WM)</strong>, <strong className="text-white">YouTube (1080p H.264 MP4)</strong>, <strong className="text-white">Instagram Reels</strong>, dan audio format <strong className="text-white">MP3, M4A, FLAC Lossless</strong>.
          </p>
        </div>

        {/* URL Input Form */}
        <UrlInput
          onSubmit={handleExtract}
          isLoading={isLoading}
          urlValue={urlValue}
          setUrlValue={setUrlValue}
        />

        {/* Error Alert Message */}
        {errorMessage && (
          <div className="w-full max-w-3xl mx-auto px-4">
            <div className="p-4 rounded-xl border border-white/20 bg-white/[0.04] text-xs sm:text-sm text-zinc-300 flex items-start gap-3">
              <AlertCircle className="w-5 h-5 text-white flex-shrink-0 mt-0.5" />
              <div className="flex-1">
                <p className="font-semibold text-white">Gagal Memproses Link</p>
                <p className="mt-0.5">{errorMessage}</p>
              </div>
            </div>
          </div>
        )}

        {/* Media Preview Card */}
        {mediaData && (
          <>
            <MediaPreview mediaData={mediaData} platform={platform} />
            <FormatSelector
              mediaData={mediaData}
              onDownload={handleDownload}
              downloadingId={downloadingId}
            />
          </>
        )}

        {/* Platform Features Matrix */}
        <PlatformFeatures />

        {/* How To Use Section (SEO Tutorial) */}
        <HowToUseSection />

        {/* FAQ Section (Google Rich Snippets) */}
        <SeoFaqSection />

      </main>

      {/* History Drawer Modal */}
      <DownloadHistory
        isOpen={isHistoryOpen}
        onClose={() => setIsHistoryOpen(false)}
        history={history}
        onClearHistory={handleClearHistory}
        onReDownload={(item) => window.open(item.url, '_blank')}
      />

      {/* Legal Modals */}
      <PrivacyPolicyModal
        isOpen={isPrivacyOpen}
        onClose={() => setIsPrivacyOpen(false)}
      />
      <TermsOfServiceModal
        isOpen={isTermsOpen}
        onClose={() => setIsTermsOpen(false)}
      />

      {/* Emergency Fallback Toast Notice */}
      <EmergencyNotice
        isVisible={showEmergency}
        onClose={() => setShowEmergency(false)}
        onRetryClientMode={() => handleExtract(urlValue)}
        targetUrl={urlValue}
      />

      {/* Minimalist Footer */}
      <footer className="border-t border-white/10 bg-black py-8 relative z-10">
        <div className="max-w-6xl mx-auto px-4 text-center sm:text-left flex flex-col sm:flex-row items-center justify-between gap-4 text-xs text-zinc-500">
          <div>
            <span className="font-bold text-white">DOWNLOADER</span> &copy; {new Date().getFullYear()} — Multi-Platform Video & Audio Downloader.
          </div>
          <div className="flex items-center gap-4 text-zinc-400">
            <button
              onClick={() => setIsPrivacyOpen(true)}
              className="hover:text-white transition cursor-pointer"
            >
              Privacy Policy
            </button>
            <span>•</span>
            <button
              onClick={() => setIsTermsOpen(true)}
              className="hover:text-white transition cursor-pointer"
            >
              Terms of Service
            </button>
          </div>
        </div>
      </footer>

    </div>
  );
}
