import express from 'express';
import cors from 'cors';
import { execFile } from 'child_process';
import { promisify } from 'util';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';
import os from 'os';

const execFilePromise = promisify(execFile);
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

const distPath = path.join(__dirname, '../dist');
app.use(express.static(distPath));

const YTDLP_BIN = process.platform === 'win32' ? 'yt-dlp' : 'yt-dlp';

// ============================================================
// CONFIGURATION & ENVS
// ============================================================
const PROXY_URL = process.env.PROXY_URL || '';
const PROXY_LIST = process.env.PROXY_LIST ? process.env.PROXY_LIST.split(',').map(s => s.trim()).filter(Boolean) : [];
const COOKIE_PATH_ENV = process.env.COOKIE_PATH || '';
const YT_PO_TOKEN = process.env.YT_PO_TOKEN || '';
const YT_VISITOR_DATA = process.env.YT_VISITOR_DATA || '';
const MAX_CONCURRENT = parseInt(process.env.MAX_CONCURRENT_DOWNLOADS || '4', 10);
const RATE_LIMIT_WINDOW_MS = 60 * 1000; // 1 minute
const RATE_LIMIT_MAX = parseInt(process.env.RATE_LIMIT_PER_MIN || '30', 10);

// ============================================================
// SOLUSI 6: USER-AGENTS SPOOFING
// ============================================================
const USER_AGENTS = [
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/127.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:128.0) Gecko/20100101 Firefox/128.0',
  'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36'
];

function getRandomUserAgent() {
  return USER_AGENTS[Math.floor(Math.random() * USER_AGENTS.length)];
}

// ============================================================
// SOLUSI 1: PROXY ROTATION MANAGER
// ============================================================
let proxyIndex = 0;
function getNextProxy() {
  if (PROXY_LIST.length > 0) {
    const p = PROXY_LIST[proxyIndex % PROXY_LIST.length];
    proxyIndex++;
    return p;
  }
  return PROXY_URL || null;
}

// ============================================================
// SOLUSI 2: COOKIES AUTO-DETECTION & ENV SUPPORT
// ============================================================
function getCookieFile() {
  const tmpEnvCookie = path.join(os.tmpdir(), 'yt_env_cookies.txt');
  
  if (process.env.YT_COOKIES_TEXT) {
    try {
      fs.writeFileSync(tmpEnvCookie, process.env.YT_COOKIES_TEXT.trim());
      return tmpEnvCookie;
    } catch (e) {}
  }
  if (process.env.YT_COOKIES_BASE64) {
    try {
      const decoded = Buffer.from(process.env.YT_COOKIES_BASE64.trim(), 'base64').toString('utf-8');
      fs.writeFileSync(tmpEnvCookie, decoded);
      return tmpEnvCookie;
    } catch (e) {}
  }
  if (fs.existsSync(tmpEnvCookie)) return tmpEnvCookie;

  if (COOKIE_PATH_ENV && fs.existsSync(COOKIE_PATH_ENV)) {
    return COOKIE_PATH_ENV;
  }
  const rootCookie = path.join(__dirname, '../cookies.txt');
  if (fs.existsSync(rootCookie)) return rootCookie;

  const serverCookie = path.join(__dirname, 'cookies.txt');
  if (fs.existsSync(serverCookie)) return serverCookie;

  return null;
}

// ============================================================
// SOLUSI 3: METADATA IN-MEMORY CACHE (1 Hour TTL)
// ============================================================
const metadataCache = new Map();
const CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour

function getCachedMetadata(url) {
  const cached = metadataCache.get(url);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL_MS) {
    return cached.data;
  }
  if (cached) metadataCache.delete(url);
  return null;
}

function setCachedMetadata(url, data) {
  if (metadataCache.size > 500) {
    const oldestKey = metadataCache.keys().next().value;
    metadataCache.delete(oldestKey);
  }
  metadataCache.set(url, { timestamp: Date.now(), data });
}

// ============================================================
// SOLUSI 5: RATE LIMITER & CONCURRENCY QUEUE
// ============================================================
const ipRequestCounts = new Map();

function rateLimiter(req, res, next) {
  const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress || 'unknown';
  const now = Date.now();
  const clientData = ipRequestCounts.get(ip) || { count: 0, resetTime: now + RATE_LIMIT_WINDOW_MS };

  if (now > clientData.resetTime) {
    clientData.count = 1;
    clientData.resetTime = now + RATE_LIMIT_WINDOW_MS;
  } else {
    clientData.count += 1;
  }

  ipRequestCounts.set(ip, clientData);

  if (clientData.count > RATE_LIMIT_MAX) {
    return res.status(429).json({ success: false, error: 'Terlalu banyak permintaan. Silakan tunggu beberapa saat.' });
  }
  next();
}

app.use('/api/', rateLimiter);

class TaskQueue {
  constructor(concurrency) {
    this.concurrency = concurrency;
    this.running = 0;
    this.queue = [];
  }

  push(taskFn) {
    return new Promise((resolve, reject) => {
      this.queue.push({ taskFn, resolve, reject });
      this.next();
    });
  }

  next() {
    if (this.running >= this.concurrency || this.queue.length === 0) return;
    const { taskFn, resolve, reject } = this.queue.shift();
    this.running++;
    taskFn()
      .then(resolve)
      .catch(reject)
      .finally(() => {
        this.running--;
        this.next();
      });
  }
}

const downloadQueue = new TaskQueue(MAX_CONCURRENT);

// ============================================================
// SOLUSI 4: AUTO-UPDATE YT-DLP ON STARTUP & INTERVAL
// ============================================================
let ytdlpAvailable = false;
let ytdlpVersion = 'Unknown';

async function updateYtDlp() {
  try {
    const { stdout } = await execFilePromise(YTDLP_BIN, ['--version'], { timeout: 20000 });
    ytdlpVersion = stdout.trim();
    ytdlpAvailable = true;
    console.log(`yt-dlp ready: v${ytdlpVersion}`);
  } catch (e) {
    console.warn('yt-dlp default check failed, trying fallback paths...', e.message);
    try {
      const { stdout } = await execFilePromise('/usr/local/bin/yt-dlp', ['--version'], { timeout: 20000 });
      ytdlpVersion = stdout.trim();
      ytdlpAvailable = true;
      console.log(`yt-dlp ready at /usr/local/bin/yt-dlp: v${ytdlpVersion}`);
    } catch (e2) {
      console.error('yt-dlp initialization check failed:', e2.message);
    }
  }
}

updateYtDlp();
setInterval(updateYtDlp, 12 * 60 * 60 * 1000);

// ============================================================
// HELPER: BUILD YT-DLP COMMON PROTECTION ARGS
// ============================================================
function buildProtectionArgs(cleanUrl, forceClient = null, disableCookies = false) {
  const args = [
    '--geo-bypass',
    '--no-check-certificates',
    '--no-playlist',
    '--user-agent', getRandomUserAgent()
  ];

  // Solusi 1: Proxy
  const proxy = getNextProxy();
  if (proxy) {
    args.push('--proxy', proxy);
  }

  // Solusi 2: Cookies
  if (!disableCookies) {
    const cookieFile = getCookieFile();
    if (cookieFile) {
      args.push('--cookies', cookieFile);
    }
  }

  // Solusi 7: YouTube Extractor Args & PO Token
  const isYouTube = cleanUrl.includes('youtube.com') || cleanUrl.includes('youtu.be');
  if (isYouTube) {
    // ALWAYS put android & ios first for ultra-fast response (~2s)
    const client = forceClient || 'android,ios,web,mweb';
    let ytArgs = `youtube:player_client=${client}`;
    if (YT_PO_TOKEN) {
      ytArgs += `;po_token=${YT_PO_TOKEN}`;
    }
    if (YT_VISITOR_DATA) {
      ytArgs += `;visitor_data=${YT_VISITOR_DATA}`;
    }
    args.push('--extractor-args', ytArgs);
    args.push('--add-header', 'Referer:https://www.youtube.com/');
  } else if (cleanUrl.includes('tiktok.com')) {
    args.push('--add-header', 'Referer:https://www.tiktok.com/');
  } else if (cleanUrl.includes('instagram.com')) {
    args.push('--add-header', 'Referer:https://www.instagram.com/');
  }

  return args;
}

// Fast fallback executor for YouTube
async function execYtDlpWithFallback(cleanUrl, baseArgs, maxBuffer = 1024 * 1024 * 50, perAttemptTimeout = 15000) {
  const isYouTube = cleanUrl.includes('youtube.com') || cleanUrl.includes('youtu.be');

  // Attempt 1: Fast Android/iOS/Web client (takes ~2-4s)
  try {
    const protectionArgs = buildProtectionArgs(cleanUrl, 'android,ios,web');
    const args = [...baseArgs, ...protectionArgs, cleanUrl];
    return await execFilePromise(YTDLP_BIN, args, { maxBuffer, timeout: perAttemptTimeout });
  } catch (err1) {
    console.warn('yt-dlp Attempt 1 (android,ios,web) failed:', err1.message);

    if (isYouTube) {
      // Attempt 2: Try android client specifically WITHOUT cookies
      try {
        console.log('Retrying yt-dlp with YouTube android client without cookies...');
        const protectionArgs2 = buildProtectionArgs(cleanUrl, 'android', true);
        const args2 = [...baseArgs, ...protectionArgs2, cleanUrl];
        return await execFilePromise(YTDLP_BIN, args2, { maxBuffer, timeout: perAttemptTimeout });
      } catch (err2) {
        console.warn('yt-dlp Attempt 2 (android no-cookies) failed:', err2.message);
        // Attempt 3: Try tvhtml5,mweb as last resort
        console.log('Retrying yt-dlp with YouTube tvhtml5,mweb fallback...');
        const protectionArgs3 = buildProtectionArgs(cleanUrl, 'tvhtml5,mweb');
        const args3 = [...baseArgs, ...protectionArgs3, cleanUrl];
        return await execFilePromise(YTDLP_BIN, args3, { maxBuffer, timeout: perAttemptTimeout });
      }
    }
    throw err1;
  }
}

function sanitizeUrl(url) {
  if (!url || typeof url !== 'string') return null;
  const t = url.trim();
  if (!/^https?:\/\//i.test(t)) return null;
  if (/[`$;|><\\]/.test(t)) return null;
  return t;
}

// ============================================================
// HEALTH CHECK
// ============================================================
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    ytdlp: ytdlpAvailable,
    version: ytdlpVersion,
    activeDownloads: downloadQueue.running,
    queuedDownloads: downloadQueue.queue.length,
    cachedItems: metadataCache.size,
    hasCookies: Boolean(getCookieFile()),
    hasProxy: Boolean(getNextProxy()),
    time: new Date().toISOString()
  });
});

// ============================================================
// METADATA EXTRACTION (/api/info)
// ============================================================
app.post('/api/info', async (req, res) => {
  const { url } = req.body;
  const cleanUrl = sanitizeUrl(url);
  if (!cleanUrl) return res.status(400).json({ success: false, error: 'URL tidak valid.' });
  if (!ytdlpAvailable) return res.status(503).json({ success: false, error: 'yt-dlp belum siap.' });

  const cached = getCachedMetadata(cleanUrl);
  if (cached) {
    return res.json({ success: true, fromCache: true, ...cached });
  }

  let platform = 'video';
  if (cleanUrl.includes('tiktok.com')) platform = 'tiktok';
  else if (cleanUrl.includes('youtube.com') || cleanUrl.includes('youtu.be')) platform = 'youtube';
  else if (cleanUrl.includes('instagram.com')) platform = 'instagram';

  let title = 'Media Video';
  let author = 'Kreator Media';
  let thumbnail = '';
  let duration = 'N/A';

  try {
    const baseArgs = ['--dump-single-json', '--no-warnings'];
    const { stdout } = await execYtDlpWithFallback(cleanUrl, baseArgs, 1024 * 1024 * 20, 15000);
    if (stdout?.trim().startsWith('{')) {
      const info = JSON.parse(stdout);
      title = info.title || info.fulltitle || title;
      author = info.uploader || info.creator || info.channel || author;
      thumbnail = info.thumbnail || (info.thumbnails?.length ? info.thumbnails[info.thumbnails.length - 1]?.url : '') || thumbnail;
      if (info.duration) duration = `${Math.floor(info.duration / 60)}m ${info.duration % 60}s`;
    }
  } catch (err) {
    console.warn('yt-dlp metadata failed:', err.message);
    if (platform === 'youtube') {
      const m = cleanUrl.match(/(?:youtu\.be\/|watch\?v=|shorts\/)([^#&?]*)/);
      if (m?.[1]) {
        const vid = m[1];
        thumbnail = `https://i.ytimg.com/vi/${vid}/hqdefault.jpg`;
        try {
          const { default: axios } = await import('axios');
          const oe = await axios.get(`https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v=${vid}&format=json`, { timeout: 3000 });
          if (oe.data) { title = oe.data.title || title; author = oe.data.author_name || author; }
        } catch (e) {}
      }
    }
  }

  const formats = [
    { id: 'f_best', quality: 'Best Available (MP4)', format: 'MP4', type: 'video', size: 'Best Quality', url: `/api/download?url=${encodeURIComponent(cleanUrl)}&format=mp4&quality=best` },
    { id: 'f_720', quality: '720p HD (MP4)', format: 'MP4', type: 'video', size: '720p HD', url: `/api/download?url=${encodeURIComponent(cleanUrl)}&format=mp4&quality=720` },
    { id: 'f_480', quality: '480p SD (MP4)', format: 'MP4', type: 'video', size: '480p SD', url: `/api/download?url=${encodeURIComponent(cleanUrl)}&format=mp4&quality=480` },
    { id: 'f_mp3', quality: 'Audio MP3 (320kbps)', format: 'MP3', type: 'audio', size: '320kbps', url: `/api/download?url=${encodeURIComponent(cleanUrl)}&format=mp3` },
    { id: 'f_m4a', quality: 'Audio M4A (Original)', format: 'M4A', type: 'audio', size: 'AAC Audio', url: `/api/download?url=${encodeURIComponent(cleanUrl)}&format=m4a` },
  ];

  const responseData = { platform, data: { title, author, authorAvatar: '', thumbnail, duration, previewUrl: '', formats } };
  
  setCachedMetadata(cleanUrl, responseData);

  return res.json({ success: true, ...responseData });
});

// ============================================================
// DOWNLOAD ENDPOINT (/api/download) WITH QUEUE
// ============================================================
app.get('/api/download', async (req, res) => {
  const { url, format = 'mp4', quality = 'best' } = req.query;
  const cleanUrl = sanitizeUrl(url ? decodeURIComponent(url) : '');
  if (!cleanUrl) return res.status(400).send('URL tidak valid');
  if (!ytdlpAvailable) return res.status(503).send('yt-dlp belum siap');

  const ext = format.toLowerCase();
  const uid = `dl_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
  const tmpDir = os.tmpdir();
  const outTemplate = path.join(tmpDir, `${uid}.%(ext)s`);

  let formatArgs = [];
  if (ext === 'mp3') {
    formatArgs = ['-x', '--audio-format', 'mp3', '--audio-quality', '0'];
  } else if (ext === 'm4a') {
    formatArgs = ['-f', 'ba[ext=m4a]/ba/bestaudio'];
  } else {
    if (quality === 'best') {
      formatArgs = ['-f', 'best[ext=mp4]/bestvideo[ext=mp4]+bestaudio[ext=m4a]/b/best', '--merge-output-format', 'mp4'];
    } else {
      formatArgs = ['-f', `best[ext=mp4][height<=${quality}]/bestvideo[height<=${quality}][ext=mp4]+bestaudio[ext=m4a]/b[height<=${quality}]/best[height<=${quality}]/best`, '--merge-output-format', 'mp4'];
    }
  }

  const baseArgs = [
    ...formatArgs,
    '-o', outTemplate
  ];

  try {
    await downloadQueue.push(() => execYtDlpWithFallback(cleanUrl, baseArgs, 1024 * 1024 * 50, 45000));

    const outputFiles = fs.readdirSync(tmpDir)
      .filter(f => f.startsWith(uid))
      .map(f => ({ name: f, full: path.join(tmpDir, f), size: fs.statSync(path.join(tmpDir, f)).size }))
      .filter(f => f.size > 0)
      .sort((a, b) => b.size - a.size);

    if (outputFiles.length === 0) {
      return res.status(500).send('Download selesai tapi file tidak ditemukan di server.');
    }

    const file = outputFiles[0];
    const actualExt = path.extname(file.name).replace('.', '') || ext;
    const safeFilename = `download_${Date.now()}.${actualExt}`;

    let contentType = 'video/mp4';
    if (actualExt === 'mp3') contentType = 'audio/mpeg';
    else if (actualExt === 'm4a') contentType = 'audio/mp4';
    else if (actualExt === 'webm') contentType = 'video/webm';

    res.setHeader('Content-Type', contentType);
    res.setHeader('Content-Length', file.size);
    res.setHeader('Content-Disposition', `attachment; filename="${safeFilename}"`);

    const stream = fs.createReadStream(file.full);
    stream.pipe(res);
    stream.on('end', () => cleanup(uid, tmpDir));
    stream.on('error', () => cleanup(uid, tmpDir));

  } catch (err) {
    console.error('Download error:', err.message);
    cleanup(uid, tmpDir);
    if (!res.headersSent) {
      res.status(500).send('Download gagal diselesaikan oleh server: ' + (err.message || 'Unknown error'));
    }
  }
});

function cleanup(uid, dir) {
  try {
    fs.readdirSync(dir).filter(f => f.startsWith(uid)).forEach(f => {
      try { fs.unlinkSync(path.join(dir, f)); } catch (e) {}
    });
  } catch (e) {}
}

// SPA Fallback
app.get('*', (req, res) => {
  res.sendFile(path.join(distPath, 'index.html'));
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT} with Solutions 1-7 anti-blocking enabled`);
});
