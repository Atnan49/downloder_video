import express from 'express';
import cors from 'cors';
import { execFile } from 'child_process';
import { promisify } from 'util';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';
import os from 'os';

// execFilePromise diganti menjadi execFileAsync manual untuk mensupport proses kill (Kasus 1)
function execFileAsync(cmd, args, options) {
  return new Promise((resolve, reject) => {
    const child = execFile(cmd, args, options, (error, stdout, stderr) => {
      if (error) {
        error.stdout = stdout;
        error.stderr = stderr;
        reject(error);
      } else {
        resolve({ stdout, stderr });
      }
    });
    if (options.onStart) options.onStart(child);
  });
}

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
app.set('trust proxy', true); // KASUS 4: Support Rate Limiter di balik Cloudflare/Nginx
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json({ limit: '5mb' }));

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

// UA TETAP khusus buat dipasangkan dengan cookies. WAJIB persis sama dengan
// browser yang dipakai buat login & export cookies.txt, biar sesi akun kelihatan
// konsisten (satu akun = satu device) di mata sistem anti-abuse Google.
// Ganti isinya kalau browser yang kamu pakai buat export cookies beda dari ini.
const FIXED_UA_FOR_COOKIES = process.env.YT_COOKIE_UA ||
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/127.0.0.0 Safari/537.36';

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
// SOLUSI 2: COOKIES VALIDATION & AUTO-DETECTION
// ============================================================
let cachedCookieFile = null;
let cookieFileChecked = false;

function getCookieFile() {
  if (cookieFileChecked) return cachedCookieFile;
  const tmpEnvCookie = path.join(os.tmpdir(), 'yt_env_cookies.txt');

  if (process.env.YT_COOKIES_TEXT) {
    try {
      let raw = process.env.YT_COOKIES_TEXT.trim();
      if (raw.includes('\\n')) raw = raw.replace(/\\n/g, '\n');
      if (raw.includes('\\t')) raw = raw.replace(/\\t/g, '\t');
      if (!raw.startsWith('# Netscape')) {
        raw = '# Netscape HTTP Cookie File\n' + raw;
      }
      fs.writeFileSync(tmpEnvCookie, raw);
    } catch (e) { }
  } else if (process.env.YT_COOKIES_BASE64) {
    try {
      const decoded = Buffer.from(process.env.YT_COOKIES_BASE64.trim(), 'base64').toString('utf-8');
      fs.writeFileSync(tmpEnvCookie, decoded);
    } catch (e) { }
  }

  const candidates = [
    tmpEnvCookie,
    COOKIE_PATH_ENV,
    path.join(__dirname, '../cookies.txt'),
    path.join(__dirname, 'cookies.txt')
  ].filter(Boolean);

  for (const file of candidates) {
    if (fs.existsSync(file)) {
      try {
        const stat = fs.statSync(file);
        if (stat.size > 20) {
          const content = fs.readFileSync(file, 'utf-8');
          if (content.includes('\t') || content.includes('Netscape')) {
            cachedCookieFile = file;
            cookieFileChecked = true;
            return cachedCookieFile;
          }
        }
      } catch (e) { }
    }
  }

  cookieFileChecked = true;
  return cachedCookieFile;
}

// ============================================================
// SOLUSI 3: METADATA IN-MEMORY CACHE & IN-FLIGHT DEDUPLICATION
// ============================================================
const metadataCache = new Map();
const inFlightRequests = new Map();
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

// Bersihkan memori rate limiter setiap 1 menit
setInterval(() => {
  const now = Date.now();
  for (const [ip, data] of ipRequestCounts.entries()) {
    if (now > data.resetTime) ipRequestCounts.delete(ip);
  }
}, 60 * 1000);

function rateLimiter(req, res, next) {
  const ip = req.ip || 'unknown'; // KASUS 4: Menggunakan req.ip yang otomatis membaca x-forwarded-for dengan aman berkat 'trust proxy'
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
    let _resolve, _reject;
    const promise = new Promise((resolve, reject) => {
      _resolve = resolve;
      _reject = reject;
    });

    const taskItem = {
      taskFn,
      resolve: _resolve,
      reject: _reject,
      abort: null
    };

    this.queue.push(taskItem);
    this.next();

    return {
      promise,
      abort: () => {
        const idx = this.queue.indexOf(taskItem);
        if (idx !== -1) {
          this.queue.splice(idx, 1);
          _reject(new Error('Aborted by user (in queue)'));
        } else if (taskItem.abort) {
          taskItem.abort();
          _reject(new Error('Aborted by user (running)'));
        }
      }
    };
  }

  next() {
    if (this.running >= this.concurrency || this.queue.length === 0) return;
    const taskItem = this.queue.shift();
    this.running++;
    
    const result = taskItem.taskFn();
    
    if (result && result.promise) {
      taskItem.abort = result.abort;
      result.promise
        .then(taskItem.resolve)
        .catch(taskItem.reject)
        .finally(() => {
          this.running--;
          this.next();
        });
    } else {
      result
        .then(taskItem.resolve)
        .catch(taskItem.reject)
        .finally(() => {
          this.running--;
          this.next();
        });
    }
  }
}

const downloadQueue = new TaskQueue(MAX_CONCURRENT);
const infoQueue = new TaskQueue(MAX_CONCURRENT * 2);

// ============================================================
// SOLUSI 4: AUTO-UPDATE YT-DLP ON STARTUP & INTERVAL
// ============================================================
let ytdlpAvailable = false;
let ytdlpVersion = 'Unknown';

async function updateYtDlp() {
  try {
    const { stdout } = await execFileAsync(YTDLP_BIN, ['--version'], { timeout: 20000 });
    ytdlpVersion = stdout.trim();
    ytdlpAvailable = true;
    console.log(`yt-dlp ready: v${ytdlpVersion}`);
  } catch (e) {
    console.warn('yt-dlp default check failed, trying fallback paths...', e.message);
    try {
      const { stdout } = await execFileAsync('/usr/local/bin/yt-dlp', ['--version'], { timeout: 20000 });
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
  const debugFlags = process.env.YTDLP_DEBUG === '1' ? ['--verbose'] : [];

  const isYouTube = cleanUrl.includes('youtube.com') || cleanUrl.includes('youtu.be');
  const isTikTok = cleanUrl.includes('tiktok.com');
  const isInstagram = cleanUrl.includes('instagram.com');

  // Tentukan DULU apakah cookies bakal dipakai di attempt ini, SEBELUM milih UA.
  // UA dan cookies harus konsisten - jangan sampai satu sesi akun (cookies) dipakai
  // bareng device yang beda-beda tiap request (random UA), karena itu pola anomali
  // klasik yang bikin akun/sesi kena flag terlepas dari IP asalnya.
  const cookieFile = (!disableCookies && (isYouTube || isInstagram)) ? getCookieFile() : null;
  const chosenUA = cookieFile ? FIXED_UA_FOR_COOKIES : getRandomUserAgent();

  const args = [
    '--geo-bypass',
    '--no-check-certificates',
    '--no-playlist',
    '--retries', '2',
    '--fragment-retries', '2',
    '--socket-timeout', '15',
    '--user-agent', chosenUA,
    ...debugFlags
  ];

  // Solusi 1: Proxy
  const proxy = getNextProxy();
  if (proxy) {
    args.push('--proxy', proxy);
  }

  // Solusi 2: Cookies ONLY for YouTube or non-TikTok URLs
  if (cookieFile) {
    args.push('--cookies', cookieFile);
  }

  // Solusi 7: Platform specific extractor args & headers
  if (isYouTube) {
    const client = forceClient || 'web,mweb';
    let ytArgs = `youtube:player_client=${client}`;
    if (YT_PO_TOKEN) {
      ytArgs += `;po_token=${YT_PO_TOKEN}`;
    }
    if (YT_VISITOR_DATA) {
      ytArgs += `;visitor_data=${YT_VISITOR_DATA}`;
    }
    args.push('--extractor-args', ytArgs);
    args.push('--add-header', 'Referer:https://www.youtube.com/');
  } else if (isTikTok) {
    args.push('--add-header', 'Referer:https://www.tiktok.com/');
  } else if (isInstagram) {
    args.push('--add-header', 'Referer:https://www.instagram.com/');
  }

  return args;
}

// Robust fallback executor for YouTube / TikTok / Instagram
function execYtDlpWithFallback(cleanUrl, baseArgs, maxBuffer = 1024 * 1024 * 50, perAttemptTimeout = 20000) {
  const isYouTube = cleanUrl.includes('youtube.com') || cleanUrl.includes('youtu.be');
  let activeChild = null;

  const promise = (async () => {
    const checkCookieError = (stderr) => {
      if (stderr && (stderr.includes('Sign in to confirm') || stderr.includes('cookie'))) {
        console.error('\x1b[31m%s\x1b[0m', '[URGENT/KASUS 5] Cookies YouTube Anda kadaluarsa atau diblokir! Segera perbarui file cookies.txt Anda!');
      }
    };

    // Attempt 1: Default execution
    try {
      const protectionArgs = buildProtectionArgs(cleanUrl, isYouTube ? 'web,mweb' : null);
      const args = [...baseArgs, ...protectionArgs, cleanUrl];
      return await execFileAsync(YTDLP_BIN, args, { maxBuffer, timeout: perAttemptTimeout, onStart: (child) => activeChild = child });
    } catch (err1) {
      console.warn('yt-dlp attempt 1 failed:');
      console.warn('  stderr:', err1.stderr || '(kosong)');
      checkCookieError(err1.stderr);

      if (isYouTube) {
        // Attempt 2: Tvhtml5 client fallback
        try {
          console.log('Retrying yt-dlp with YouTube tvhtml5 client fallback...');
          const protectionArgs2 = buildProtectionArgs(cleanUrl, 'tvhtml5');
          const args2 = [...baseArgs, ...protectionArgs2, cleanUrl];
          return await execFileAsync(YTDLP_BIN, args2, { maxBuffer, timeout: perAttemptTimeout, onStart: (child) => activeChild = child });
        } catch (err2) {
          console.warn('yt-dlp attempt 2 (tvhtml5) failed:');
          console.warn('  stderr:', err2.stderr || '(kosong)');
          checkCookieError(err2.stderr);

          // Attempt 3: Android client WITHOUT cookies
          try {
            console.log('Retrying yt-dlp with YouTube android client without cookies...');
            const protectionArgs3 = buildProtectionArgs(cleanUrl, 'android', true);
            const args3 = [...baseArgs, ...protectionArgs3, cleanUrl];
            return await execFileAsync(YTDLP_BIN, args3, { maxBuffer, timeout: perAttemptTimeout, onStart: (child) => activeChild = child });
          } catch (err3) {
            console.warn('yt-dlp attempt 3 (android) failed:');
            console.warn('  stderr:', err3.stderr || '(kosong)');
            throw err3;
          }
        }
      }
      throw err1;
    }
  })();

  return {
    promise,
    abort: () => {
      if (activeChild) {
        try { activeChild.kill('SIGKILL'); } catch (e) {}
      }
    }
  };
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
    inFlightItems: inFlightRequests.size,
    hasCookies: Boolean(getCookieFile()),
    hasProxy: Boolean(getNextProxy()),
    time: new Date().toISOString()
  });
});

// ============================================================
// METADATA EXTRACTION (/api/info) WITH IN-FLIGHT DEDUPLICATION
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

  if (inFlightRequests.has(cleanUrl)) {
    console.log(`[DEDUPLICATE] In-flight info request detected for ${cleanUrl}, awaiting shared promise...`);
    try {
      const data = await inFlightRequests.get(cleanUrl);
      return res.json({ success: true, fromCache: true, ...data });
    } catch (e) {
      return res.status(500).json({ success: false, error: e.message || 'Ekstraksi gagal.' });
    }
  }

  let platform = 'video';
  if (cleanUrl.includes('tiktok.com')) platform = 'tiktok';
  else if (cleanUrl.includes('youtube.com') || cleanUrl.includes('youtu.be')) platform = 'youtube';
  else if (cleanUrl.includes('instagram.com')) platform = 'instagram';

  const extractionTask = infoQueue.push(async () => {
    let title = 'Media Video';
    let author = 'Kreator Media';
    let thumbnail = '';
    let duration = 'N/A';

    try {
      const baseArgs = ['--dump-single-json', '--no-warnings'];
      const { stdout } = await execYtDlpWithFallback(cleanUrl, baseArgs, 1024 * 1024 * 20, 20000).promise;
      if (stdout?.trim().startsWith('{')) {
        const info = JSON.parse(stdout);
        title = info.title || info.fulltitle || title;
        author = info.uploader || info.creator || info.channel || author;
        thumbnail = info.thumbnail || (info.thumbnails?.length ? info.thumbnails[info.thumbnails.length - 1]?.url : '') || thumbnail;
        if (info.duration) duration = `${Math.floor(info.duration / 60)}m ${info.duration % 60}s`;
      }
    } catch (err) {
      console.warn('yt-dlp metadata extraction failed, checking OEmbed fallback...', err.message);
      if (platform === 'youtube') {
        const m = cleanUrl.match(/(?:youtu\.be\/|watch\?v=|shorts\/)([^#&?]*)/);
        if (m?.[1]) {
          const vid = m[1];
          thumbnail = `https://i.ytimg.com/vi/${vid}/hqdefault.jpg`;
          try {
            const { default: axios } = await import('axios');
            const oe = await axios.get(`https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v=${encodeURIComponent(vid)}&format=json`, { timeout: 3000 });
            if (oe.data) { title = oe.data.title || title; author = oe.data.author_name || author; }
          } catch (e) { }
        }
      }
    }

    const safeTitle = encodeURIComponent(title.replace(/[^a-zA-Z0-9_\-\u00C0-\u017F ]/g, '').trim().substring(0, 50));

    const formats = [
      { id: 'f_best', quality: 'Best Available (MP4)', format: 'MP4', type: 'video', size: 'Best Quality', url: `/api/download?url=${encodeURIComponent(cleanUrl)}&format=mp4&quality=best&title=${safeTitle}` },
      { id: 'f_720', quality: '720p HD (MP4)', format: 'MP4', type: 'video', size: '720p HD', url: `/api/download?url=${encodeURIComponent(cleanUrl)}&format=mp4&quality=720&title=${safeTitle}` },
      { id: 'f_480', quality: '480p SD (MP4)', format: 'MP4', type: 'video', size: '480p SD', url: `/api/download?url=${encodeURIComponent(cleanUrl)}&format=mp4&quality=480&title=${safeTitle}` },
      { id: 'f_mp3', quality: 'Audio MP3 (320kbps)', format: 'MP3', type: 'audio', size: '320kbps', url: `/api/download?url=${encodeURIComponent(cleanUrl)}&format=mp3&title=${safeTitle}` },
      { id: 'f_m4a', quality: 'Audio M4A (Original)', format: 'M4A', type: 'audio', size: 'AAC Audio', url: `/api/download?url=${encodeURIComponent(cleanUrl)}&format=m4a&title=${safeTitle}` },
    ];

    const responseData = { platform, data: { title, author, authorAvatar: '', thumbnail, duration, previewUrl: '', formats } };
    setCachedMetadata(cleanUrl, responseData);
    return responseData;
  });

  inFlightRequests.set(cleanUrl, extractionTask);

  try {
    const data = await extractionTask;
    return res.json({ success: true, ...data });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message || 'Terjadi kesalahan ekstraksi.' });
  } finally {
    inFlightRequests.delete(cleanUrl);
  }
});

// ============================================================
// DOWNLOAD ENDPOINT (/api/download) WITH QUEUE & DEDUPLICATION
// ============================================================
const activeDownloads = new Map();

app.get('/api/download', async (req, res) => {
  const { url, format = 'mp4', quality = 'best', title = 'video' } = req.query;
  const cleanUrl = sanitizeUrl(url ? decodeURIComponent(url) : '');
  if (!cleanUrl) return res.status(400).send('URL tidak valid');
  if (!ytdlpAvailable) return res.status(503).send('yt-dlp belum siap');

  const downloadKey = `dl_${cleanUrl}_${format}_${quality}`;
  let downloadSession = activeDownloads.get(downloadKey);

  if (!downloadSession) {
    const ext = format.toLowerCase();
    const uid = `dl_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
    const tmpDir = os.tmpdir();
    const outTemplate = path.join(tmpDir, `${uid}.%(ext)s`);

    let formatArgs = [];
    if (ext === 'mp3') {
      formatArgs = ['-x', '--audio-format', 'mp3', '--audio-quality', '0'];
    } else if (ext === 'm4a') {
      formatArgs = ['-f', 'ba[ext=m4a]/ba/bestaudio/b'];
    } else {
      if (quality === 'best') {
        formatArgs = ['-f', 'best[ext=mp4]/best/bestvideo+bestaudio/b', '--merge-output-format', 'mp4'];
      } else {
        formatArgs = ['-f', `best[ext=mp4][height<=${quality}]/best[height<=${quality}]/bestvideo[height<=${quality}]+bestaudio/b`, '--merge-output-format', 'mp4'];
      }
    }

    const baseArgs = [...formatArgs, '-o', outTemplate];

    downloadSession = {
      refCount: 0,
      uid: uid,
      tmpDir: tmpDir,
      promise: null,
      abort: null,
      fileData: null
    };
    activeDownloads.set(downloadKey, downloadSession);

    const taskRequest = downloadQueue.push(() => execYtDlpWithFallback(cleanUrl, baseArgs, 1024 * 1024 * 50, 300000));
    downloadSession.abort = taskRequest.abort;

    downloadSession.promise = (async () => {
      await taskRequest.promise;

      // Filter .part dan .ytdl untuk memastikan file utuh
      const outputFiles = fs.readdirSync(tmpDir)
        .filter(f => f.startsWith(uid) && !f.endsWith('.part') && !f.endsWith('.ytdl'))
        .map(f => ({ name: f, full: path.join(tmpDir, f), size: fs.statSync(path.join(tmpDir, f)).size }))
        .filter(f => f.size > 0)
        .sort((a, b) => b.size - a.size);

      if (outputFiles.length === 0) {
        throw new Error('Download selesai tapi file utuh tidak ditemukan di server.');
      }

      const file = outputFiles[0];
      const actualExt = path.extname(file.name).replace('.', '') || ext;
      const cleanTitle = title.replace(/[^a-zA-Z0-9_\-\u00C0-\u017F ]/g, '').trim().substring(0, 50) || 'video_download';
      const safeFilename = `${cleanTitle}_${Date.now().toString().substring(8)}.${actualExt}`;

      let contentType = 'video/mp4';
      if (actualExt === 'mp3') contentType = 'audio/mpeg';
      else if (actualExt === 'm4a') contentType = 'audio/mp4';
      else if (actualExt === 'webm') contentType = 'video/webm';

      downloadSession.fileData = { full: file.full, size: file.size, safeFilename, contentType };
      return downloadSession.fileData;
    })();
  }

  // Tingkatkan ref count (Reference Counting) untuk deduplikasi yang aman
  downloadSession.refCount++;

  let hasDecremented = false;
  const release = () => {
    if (hasDecremented) return;
    hasDecremented = true;
    downloadSession.refCount--;
    // Jika tidak ada lagi user yang mendownload/menunggu file ini, hapus file & sesi
    if (downloadSession.refCount <= 0) {
      if (downloadSession.abort) {
        downloadSession.abort(); // KASUS 1: Batalkan proses yt-dlp jika masih berjalan / antre
      }
      activeDownloads.delete(downloadKey);
      cleanup(downloadSession.uid, downloadSession.tmpDir);
    }
  };

  // Bersihkan referensi jika koneksi HTTP tertutup (berhasil selesai ATAU terputus/cancel)
  res.on('close', release);

  try {
    const fileData = await downloadSession.promise;
    if (!res.headersSent) {
      // KASUS 3: Gunakan res.download untuk otomatis menangani Range Requests (Resume/Pause)
      res.download(fileData.full, fileData.safeFilename, (err) => {
        if (err && err.code !== 'ECONNABORTED' && !res.headersSent) {
          console.error('Stream error:', err.message);
        }
      });
    }
  } catch (err) {
    console.error('Download error:', err.message);
    if (!res.headersSent) {
      res.status(500).send('Download gagal diselesaikan oleh server: ' + (err.message || 'Unknown error'));
    }
    // Jika terjadi error, res.status(500) akan mengakhiri koneksi dan memicu res.on('close') => release()
  }
});

function cleanup(uid, dir) {
  try {
    fs.readdirSync(dir).filter(f => f.startsWith(uid)).forEach(f => {
      try { fs.unlinkSync(path.join(dir, f)); } catch (e) { }
    });
  } catch (e) { }
}

// ============================================================
// KASUS 2: CLEANUP RUTIN & GRACEFUL SHUTDOWN (Mencegah Disk Penuh)
// ============================================================
function cleanAllTmpFiles() {
  try {
    const dir = os.tmpdir();
    let deletedCount = 0;
    fs.readdirSync(dir).filter(f => f.startsWith('dl_')).forEach(f => {
      try { 
        fs.unlinkSync(path.join(dir, f)); 
        deletedCount++;
      } catch (e) {}
    });
    if (deletedCount > 0) {
      console.log(`[CLEANUP] Berhasil menghapus ${deletedCount} file sampah sisa download.`);
    }
  } catch (e) {
    console.error('[CLEANUP] Gagal mengakses direktori temporary:', e.message);
  }
}

// Jalankan saat server baru menyala
cleanAllTmpFiles();

// Tangkap sinyal shutdown untuk membersihkan disk sebelum mati
process.on('SIGINT', () => {
  console.log('\nMematikan server...');
  cleanAllTmpFiles();
  process.exit(0);
});
process.on('SIGTERM', () => {
  console.log('\nMematikan server...');
  cleanAllTmpFiles();
  process.exit(0);
});

// SPA Fallback
app.get('*', (req, res) => {
  res.sendFile(path.join(distPath, 'index.html'));
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT} with Solutions 1-7 anti-blocking enabled`);
});