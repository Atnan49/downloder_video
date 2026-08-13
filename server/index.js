import express from 'express';
import cors from 'cors';
import { execFile, spawn } from 'child_process';
import { promisify } from 'util';
import path from 'path';
import { fileURLToPath } from 'url';
import axios from 'axios';
import https from 'https';
import http from 'http';

const execFilePromise = promisify(execFile);
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

const distPath = path.join(__dirname, '../dist');
app.use(express.static(distPath));

const YTDLP_BIN = process.platform === 'win32' ? 'yt-dlp' : '/usr/local/bin/yt-dlp';
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36';

// Invidious instances (high-uptime, frequently updated)
const INVIDIOUS_INSTANCES = [
  'https://yewtu.be',
  'https://inv.tux.pizza',
  'https://invidious.privacyredirect.com',
  'https://iv.datura.network',
  'https://invidious.protokolla.fi'
];

// yt-dlp startup check
let ytdlpAvailable = false;
(async () => {
  try {
    const { stdout } = await execFilePromise(YTDLP_BIN, ['--version'], { timeout: 5000 });
    ytdlpAvailable = true;
    console.log(`yt-dlp: v${stdout.trim()}`);
  } catch (e) {
    console.warn('yt-dlp not found');
  }
})();

function sanitizeUrl(url) {
  if (!url || typeof url !== 'string') return null;
  const t = url.trim();
  if (!/^https?:\/\//i.test(t)) return null;
  if (/[`$;|><\\]/.test(t)) return null;
  return t;
}

function extractYouTubeId(url) {
  const m = url.match(/(?:youtu\.be\/|youtube\.com\/(?:watch\?v=|shorts\/|embed\/|v\/))([a-zA-Z0-9_-]{11})/);
  return m ? m[1] : null;
}

// Try Invidious API across multiple instances
async function fetchInvidiousData(videoId) {
  for (const host of INVIDIOUS_INSTANCES) {
    try {
      const res = await axios.get(`${host}/api/v1/videos/${videoId}?fields=title,author,lengthSeconds,videoThumbnails,formatStreams,adaptiveFormats`, {
        timeout: 5000,
        headers: { 'User-Agent': UA }
      });
      if (res.data && res.data.title) {
        return { host, data: res.data };
      }
    } catch (e) {
      console.warn(`Invidious ${host} failed:`, e.message);
    }
  }
  return null;
}

// Health Check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', ytdlp: ytdlpAvailable, time: new Date().toISOString() });
});

// ==========================================
// METADATA EXTRACTION
// ==========================================
app.post('/api/info', async (req, res) => {
  const { url } = req.body;
  const cleanUrl = sanitizeUrl(url);
  if (!cleanUrl) {
    return res.status(400).json({ success: false, error: 'URL tidak valid.' });
  }

  let platform = 'video';
  if (cleanUrl.includes('tiktok.com')) platform = 'tiktok';
  else if (cleanUrl.includes('youtube.com') || cleanUrl.includes('youtu.be')) platform = 'youtube';
  else if (cleanUrl.includes('instagram.com')) platform = 'instagram';

  try {
    let resultData;

    if (platform === 'youtube') {
      resultData = await extractYouTube(cleanUrl);
    } else if (platform === 'tiktok') {
      resultData = await extractTikTok(cleanUrl);
    } else {
      resultData = await extractWithYtDlp(cleanUrl, platform);
    }

    if (!resultData) {
      return res.status(400).json({ success: false, error: 'Gagal mengekstrak metadata. Periksa URL.' });
    }

    return res.json({ success: true, platform, data: resultData });
  } catch (err) {
    console.error('Info error:', err.message);
    return res.status(500).json({ success: false, error: err.message });
  }
});

// ==========================================
// YOUTUBE: Invidious API (bypasses bot check)
// ==========================================
async function extractYouTube(url) {
  const videoId = extractYouTubeId(url);
  if (!videoId) throw new Error('Video ID YouTube tidak valid.');

  // Get metadata + stream URLs from Invidious
  const inv = await fetchInvidiousData(videoId);

  if (inv) {
    const d = inv.data;
    const host = inv.host;
    const thumbnail = d.videoThumbnails?.[0]?.url || `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`;
    const duration = d.lengthSeconds ? `${Math.floor(d.lengthSeconds / 60)}m ${d.lengthSeconds % 60}s` : 'N/A';

    // Build format list using Invidious's /latest_version proxy endpoint
    // This endpoint proxies YouTube CDN through the Invidious server (no IP mismatch)
    const formats = [];

    // Video formats - use /latest_version which proxies through Invidious
    // itag 22 = 720p MP4 (pre-muxed video+audio, most reliable)
    // itag 18 = 360p MP4 (pre-muxed video+audio, always available)
    formats.push({
      id: 'yt_720p',
      quality: '720p HD Video (MP4)',
      format: 'MP4',
      type: 'video',
      size: '720p H.264 + Audio',
      url: `/api/download?source=invidious&host=${encodeURIComponent(host)}&id=${videoId}&itag=22`
    });

    formats.push({
      id: 'yt_360p',
      quality: '360p SD Video (MP4)',
      format: 'MP4',
      type: 'video',
      size: '360p H.264 + Audio',
      url: `/api/download?source=invidious&host=${encodeURIComponent(host)}&id=${videoId}&itag=18`
    });

    // Check for higher quality in formatStreams
    const formatStreams = d.formatStreams || [];
    const has1080 = formatStreams.some(s => s.qualityLabel && s.qualityLabel.includes('1080'));
    if (has1080) {
      const stream1080 = formatStreams.find(s => s.qualityLabel?.includes('1080'));
      if (stream1080?.itag) {
        formats.unshift({
          id: 'yt_1080p',
          quality: '1080p Full HD Video (MP4)',
          format: 'MP4',
          type: 'video',
          size: '1080p Full HD',
          url: `/api/download?source=invidious&host=${encodeURIComponent(host)}&id=${videoId}&itag=${stream1080.itag}`
        });
      }
    }

    // Audio formats
    // itag 140 = M4A 128kbps (always available)
    formats.push({
      id: 'yt_audio_m4a',
      quality: 'Audio M4A (128kbps)',
      format: 'M4A',
      type: 'audio',
      size: 'AAC Audio',
      url: `/api/download?source=invidious&host=${encodeURIComponent(host)}&id=${videoId}&itag=140`
    });

    // Check for higher quality audio in adaptiveFormats
    const adaptiveFormats = d.adaptiveFormats || [];
    const audioStreams = adaptiveFormats.filter(s => s.type?.startsWith('audio/'));
    const highAudio = audioStreams.find(s => s.itag === '251' || s.itag === 251); // Opus 160kbps
    if (highAudio) {
      formats.push({
        id: 'yt_audio_opus',
        quality: 'Audio Opus (160kbps High Quality)',
        format: 'WEBM',
        type: 'audio',
        size: 'Opus Audio',
        url: `/api/download?source=invidious&host=${encodeURIComponent(host)}&id=${videoId}&itag=251`
      });
    }

    return {
      title: d.title || 'YouTube Video',
      author: d.author || 'YouTube Creator',
      authorAvatar: '',
      thumbnail,
      duration,
      previewUrl: '',
      formats
    };
  }

  // Fallback: OEmbed metadata + direct Invidious download links
  let title = 'YouTube Video';
  let author = 'YouTube Creator';
  const thumbnail = `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`;

  try {
    const oe = await axios.get(`https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v=${videoId}&format=json`, { timeout: 3000 });
    if (oe.data) { title = oe.data.title || title; author = oe.data.author_name || author; }
  } catch (e) {}

  // Use first available Invidious instance for download links
  const fallbackHost = INVIDIOUS_INSTANCES[0];

  return {
    title, author, authorAvatar: '', thumbnail, duration: 'N/A', previewUrl: '',
    formats: [
      { id: 'yt_720p', quality: '720p HD Video (MP4)', format: 'MP4', type: 'video', size: '720p H.264 + Audio', url: `/api/download?source=invidious&host=${encodeURIComponent(fallbackHost)}&id=${videoId}&itag=22` },
      { id: 'yt_360p', quality: '360p SD Video (MP4)', format: 'MP4', type: 'video', size: '360p H.264 + Audio', url: `/api/download?source=invidious&host=${encodeURIComponent(fallbackHost)}&id=${videoId}&itag=18` },
      { id: 'yt_audio', quality: 'Audio M4A (128kbps)', format: 'M4A', type: 'audio', size: 'AAC Audio', url: `/api/download?source=invidious&host=${encodeURIComponent(fallbackHost)}&id=${videoId}&itag=140` }
    ]
  };
}

// ==========================================
// TIKTOK: TikWM API
// ==========================================
async function extractTikTok(url) {
  try {
    const res = await axios.post('https://www.tikwm.com/api/', new URLSearchParams({ url, hd: '1' }), {
      headers: { 'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8', 'User-Agent': UA },
      timeout: 6000
    });
    const d = res.data?.data;
    if (d) {
      const playUrl = d.hdplay || d.play;
      return {
        title: d.title || 'TikTok Video',
        author: d.author?.nickname || 'TikTok User',
        authorAvatar: d.author?.avatar || '',
        thumbnail: d.cover || d.origin_cover || '',
        duration: d.duration ? `${d.duration}s` : 'N/A',
        previewUrl: playUrl,
        formats: [
          { id: 'tt_hd', quality: 'No Watermark Full HD', format: 'MP4', type: 'video', size: 'HD Stream', url: playUrl },
          { id: 'tt_sd', quality: 'No Watermark SD', format: 'MP4', type: 'video', size: 'SD Stream', url: d.play || playUrl },
          { id: 'tt_audio', quality: 'Audio MP3', format: 'MP3', type: 'audio', size: 'Audio Track', url: d.music || playUrl }
        ]
      };
    }
  } catch (e) {
    console.warn('TikWM failed:', e.message);
  }
  return await extractWithYtDlp(url, 'TikTok');
}

// ==========================================
// GENERIC: yt-dlp (for non-YouTube platforms)
// ==========================================
async function extractWithYtDlp(url, platformName) {
  if (!ytdlpAvailable) return null;
  try {
    const args = [
      '--dump-single-json', '--no-warnings', '--no-playlist',
      '--geo-bypass', '--no-check-certificates', url
    ];
    const { stdout } = await execFilePromise(YTDLP_BIN, args, { maxBuffer: 1024 * 1024 * 20, timeout: 15000 });
    if (stdout?.trim().startsWith('{')) {
      const info = JSON.parse(stdout);
      const title = info.title || `${platformName} Video`;
      const thumbnail = info.thumbnail || '';
      const duration = info.duration ? `${Math.floor(info.duration / 60)}m ${info.duration % 60}s` : 'N/A';

      return {
        title,
        author: info.uploader || info.channel || `${platformName} Creator`,
        authorAvatar: '',
        thumbnail,
        duration,
        previewUrl: info.url || '',
        formats: [
          { id: 'gen_best', quality: 'Best Quality Video (MP4)', format: 'MP4', type: 'video', size: 'Best Available',
            url: `/api/download?source=ytdlp&url=${encodeURIComponent(url)}&format=mp4&quality=best` },
          { id: 'gen_mp3', quality: 'Audio MP3', format: 'MP3', type: 'audio', size: 'Audio Track',
            url: `/api/download?source=ytdlp&url=${encodeURIComponent(url)}&format=mp3` }
        ]
      };
    }
  } catch (e) {
    console.warn('yt-dlp extract failed:', e.message);
  }
  return null;
}

// ==========================================
// DOWNLOAD ENDPOINT (multi-source router)
// ==========================================
app.get('/api/download', async (req, res) => {
  const { source } = req.query;

  if (source === 'invidious') {
    return handleInvidiousDownload(req, res);
  } else if (source === 'ytdlp') {
    return handleYtDlpDownload(req, res);
  } else {
    // Direct URL proxy (for TikTok, etc.)
    return handleDirectProxy(req, res);
  }
});

// Invidious proxy-stream download
async function handleInvidiousDownload(req, res) {
  let { host, id, itag } = req.query;

  if (!id || !itag) {
    return res.status(400).send('Missing video ID or itag');
  }

  // Determine content type from itag
  const videoItags = ['18', '22', '37', '38', '82', '83', '84', '85'];
  const isVideo = videoItags.includes(String(itag));
  const contentType = isVideo ? 'video/mp4' : 'audio/mp4';
  const ext = isVideo ? 'mp4' : 'm4a';
  const safeFilename = `download_${id}_${itag}.${ext}`;

  // Try the specified host first, then fallback to others
  const hostsToTry = [host, ...INVIDIOUS_INSTANCES.filter(h => h !== host)].filter(Boolean);

  for (const instanceHost of hostsToTry) {
    const streamUrl = `${instanceHost}/latest_version?id=${id}&itag=${itag}`;
    console.log(`Trying Invidious stream: ${streamUrl}`);

    try {
      const proxyRes = await axios({
        method: 'GET',
        url: streamUrl,
        responseType: 'stream',
        timeout: 15000,
        maxRedirects: 5,
        headers: { 'User-Agent': UA }
      });

      // Check if we got actual content (not an error page)
      const statusCode = proxyRes.status;
      const responseContentType = proxyRes.headers['content-type'] || '';

      if (statusCode === 200 && !responseContentType.includes('text/html')) {
        res.setHeader('Content-Type', contentType);
        res.setHeader('Content-Disposition', `attachment; filename="${safeFilename}"`);
        if (proxyRes.headers['content-length']) {
          res.setHeader('Content-Length', proxyRes.headers['content-length']);
        }

        proxyRes.data.pipe(res);
        proxyRes.data.on('error', (e) => {
          console.error(`Stream error from ${instanceHost}:`, e.message);
          if (!res.headersSent) res.status(500).send('Stream interrupted');
        });
        return; // Success - exit the loop
      }
    } catch (e) {
      console.warn(`Invidious download from ${instanceHost} failed:`, e.message);
    }
  }

  // All instances failed
  res.status(502).json({ error: 'Semua server Invidious gagal. Coba lagi nanti.' });
}

// yt-dlp streaming download (for non-YouTube)
async function handleYtDlpDownload(req, res) {
  const { url: rawUrl, format = 'mp4', quality = 'best' } = req.query;
  const cleanUrl = sanitizeUrl(rawUrl ? decodeURIComponent(rawUrl) : '');

  if (!cleanUrl || !ytdlpAvailable) {
    return res.status(400).send('URL tidak valid atau yt-dlp tidak tersedia');
  }

  const ext = format.toLowerCase();

  try {
    // Get direct CDN URL using yt-dlp -g
    let formatFilter;
    if (ext === 'mp3' || ext === 'flac') formatFilter = 'ba/best';
    else if (ext === 'm4a') formatFilter = 'ba[ext=m4a]/ba';
    else formatFilter = quality === 'best' ? 'best[ext=mp4]/best' : `best[ext=mp4][height<=${quality}]/best`;

    const { stdout } = await execFilePromise(YTDLP_BIN, [
      '-g', '-f', formatFilter, '--geo-bypass', '--no-check-certificates', '--no-playlist', cleanUrl
    ], { timeout: 10000, maxBuffer: 1024 * 1024 });

    const cdnUrl = stdout.trim().split('\n')[0];
    if (!cdnUrl?.startsWith('http')) throw new Error('No CDN URL');

    // Proxy stream from CDN
    const proxyRes = await axios({
      method: 'GET', url: cdnUrl, responseType: 'stream',
      timeout: 15000, headers: { 'User-Agent': UA }
    });

    const contentType = ext === 'mp3' ? 'audio/mpeg' : (ext === 'm4a' ? 'audio/mp4' : 'video/mp4');
    res.setHeader('Content-Type', contentType);
    res.setHeader('Content-Disposition', `attachment; filename="download_${Date.now()}.${ext}"`);
    if (proxyRes.headers['content-length']) {
      res.setHeader('Content-Length', proxyRes.headers['content-length']);
    }
    proxyRes.data.pipe(res);

  } catch (err) {
    console.error('yt-dlp download error:', err.message);
    if (!res.headersSent) res.status(500).send('Download gagal. Coba lagi.');
  }
}

// Direct URL proxy download (for TikTok external URLs, etc.)
async function handleDirectProxy(req, res) {
  const directUrl = req.query.url;
  if (!directUrl) return res.status(400).send('Missing URL');

  try {
    const proxyRes = await axios({
      method: 'GET', url: directUrl, responseType: 'stream',
      timeout: 15000, headers: { 'User-Agent': UA }
    });

    res.setHeader('Content-Type', proxyRes.headers['content-type'] || 'video/mp4');
    res.setHeader('Content-Disposition', `attachment; filename="download_${Date.now()}.mp4"`);
    if (proxyRes.headers['content-length']) {
      res.setHeader('Content-Length', proxyRes.headers['content-length']);
    }
    proxyRes.data.pipe(res);
  } catch (e) {
    console.error('Direct proxy error:', e.message);
    if (!res.headersSent) res.redirect(302, directUrl);
  }
}

// SPA Fallback
app.get('*', (req, res) => {
  res.sendFile(path.join(distPath, 'index.html'));
});

app.listen(PORT, () => {
  console.log(`Render Server running on port ${PORT}`);
});
