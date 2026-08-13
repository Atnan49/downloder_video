import express from 'express';
import cors from 'cors';
import { exec } from 'child_process';
import { promisify } from 'util';
import path from 'path';
import { fileURLToPath } from 'url';
import axios from 'axios';

const execPromise = promisify(exec);
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

// Serve static frontend files
const distPath = path.join(__dirname, '../dist');
app.use(express.static(distPath));

const USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36';

// Health Check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', engine: 'yt-dlp + ffmpeg hybrid', time: new Date().toISOString() });
});

// Extract Video Info Endpoint
app.post('/api/info', async (req, res) => {
  const { url } = req.body;
  if (!url || typeof url !== 'string') {
    return res.status(400).json({ success: false, error: 'URL tidak valid atau kosong' });
  }

  const cleanUrl = url.trim();

  // Detect Platform
  let platform = 'video';
  if (cleanUrl.includes('tiktok.com')) platform = 'tiktok';
  else if (cleanUrl.includes('youtube.com') || cleanUrl.includes('youtu.be')) platform = 'youtube';
  else if (cleanUrl.includes('instagram.com')) platform = 'instagram';

  // Strategy 1: Fast yt-dlp with iOS/Web player_client Bypasser
  try {
    const cmd = `yt-dlp --dump-json --no-warnings --extractor-args "youtube:player_client=ios,web" --geo-bypass --no-check-certificates "${cleanUrl}"`;
    const { stdout } = await execPromise(cmd, { maxBuffer: 1024 * 1024 * 15, timeout: 12000 });
    
    if (stdout && stdout.trim().startsWith('{')) {
      const info = JSON.parse(stdout);

      const formats = [
        {
          id: 'f_1080',
          quality: '1080p Full HD Video (H.264 MP4)',
          format: 'MP4',
          type: 'video',
          size: '1080p Full HD',
          url: `/api/download?url=${encodeURIComponent(cleanUrl)}&format=mp4&quality=1080`
        },
        {
          id: 'f_720',
          quality: '720p HD Video (H.264 MP4)',
          format: 'MP4',
          type: 'video',
          size: '720p HD',
          url: `/api/download?url=${encodeURIComponent(cleanUrl)}&format=mp4&quality=720`
        },
        {
          id: 'f_mp3',
          quality: 'Audio Only (MP3 320kbps)',
          format: 'MP3',
          type: 'audio',
          size: '320kbps Audio',
          url: `/api/download?url=${encodeURIComponent(cleanUrl)}&format=mp3`
        },
        {
          id: 'f_flac',
          quality: 'Audio Only (FLAC Lossless)',
          format: 'FLAC',
          type: 'audio',
          size: 'Lossless Audio',
          url: `/api/download?url=${encodeURIComponent(cleanUrl)}&format=flac`
        }
      ];

      return res.json({
        success: true,
        platform,
        data: {
          title: info.title || info.fulltitle || 'Media Video',
          author: info.uploader || info.creator || info.channel || 'Kreator Media',
          authorAvatar: info.uploader_avatar || '',
          thumbnail: info.thumbnail || (info.thumbnails && info.thumbnails[0]?.url) || '',
          duration: info.duration ? `${Math.floor(info.duration / 60)}m ${info.duration % 60}s` : 'N/A',
          previewUrl: info.url || '',
          formats
        }
      });
    }
  } catch (error) {
    console.warn('yt-dlp extraction warning, attempting Cobalt fallback:', error.message);
  }

  // Strategy 2: Cobalt High-Speed API Fallback Engine
  try {
    const cobaltRes = await axios.post('https://co.wuk.sh/api/json', {
      url: cleanUrl,
      videoQuality: '1080',
      youtubeVideoCodec: 'h264',
      filenamePattern: 'nerd'
    }, {
      headers: { 'Accept': 'application/json', 'Content-Type': 'application/json', 'User-Agent': USER_AGENT },
      timeout: 6000
    });

    const data = cobaltRes.data;
    if (data && (data.url || data.picker)) {
      const mediaUrl = data.url || (data.picker && data.picker[0]?.url);

      // Fetch metadata via OEmbed if YouTube
      let title = `${platform.toUpperCase()} Video`;
      let author = `${platform.toUpperCase()} Creator`;
      let thumbnail = 'https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?auto=format&fit=crop&w=600&q=80';

      const videoIdMatch = cleanUrl.match(/(?:youtu\.be\/|watch\?v=)([^#\&\?]*)/);
      if (videoIdMatch && videoIdMatch[1]) {
        const vid = videoIdMatch[1];
        thumbnail = `https://i.ytimg.com/vi/${vid}/hqdefault.jpg`;
        try {
          const oe = await axios.get(`https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v=${vid}&format=json`, { timeout: 3000 });
          if (oe.data) {
            title = oe.data.title || title;
            author = oe.data.author_name || author;
          }
        } catch (e) {}
      }

      return res.json({
        success: true,
        platform,
        data: {
          title,
          author,
          authorAvatar: '',
          thumbnail,
          duration: 'N/A',
          previewUrl: mediaUrl,
          formats: [
            {
              id: 'cobalt_1080',
              quality: '1080p Full HD Video (H.264 MP4)',
              format: 'MP4',
              type: 'video',
              size: '1080p Full HD',
              url: mediaUrl
            },
            {
              id: 'cobalt_720',
              quality: '720p HD Video (H.264 MP4)',
              format: 'MP4',
              type: 'video',
              size: '720p HD',
              url: mediaUrl
            },
            {
              id: 'cobalt_mp3',
              quality: 'Audio Only (MP3 320kbps)',
              format: 'MP3',
              type: 'audio',
              size: '320kbps Audio',
              url: mediaUrl
            }
          ]
        }
      });
    }
  } catch (err) {
    console.warn('Cobalt fallback warning:', err.message);
  }

  // Strategy 3: TikWM / YouTube OEmbed Emergency Fallback
  const videoIdMatch = cleanUrl.match(/(?:youtu\.be\/|watch\?v=)([^#\&\?]*)/);
  if (videoIdMatch && videoIdMatch[1]) {
    const vid = videoIdMatch[1];
    return res.json({
      success: true,
      platform: 'youtube',
      data: {
        title: 'YouTube Video',
        author: 'YouTube Creator',
        authorAvatar: '',
        thumbnail: `https://i.ytimg.com/vi/${vid}/hqdefault.jpg`,
        duration: 'N/A',
        previewUrl: `https://yewtu.be/latest_version?id=${vid}&itag=22`,
        formats: [
          {
            id: 'yt_emergency_1080',
            quality: '1080p Full HD Video (H.264 MP4)',
            format: 'MP4',
            type: 'video',
            size: '1080p Full HD',
            url: `https://yewtu.be/latest_version?id=${vid}&itag=22`
          },
          {
            id: 'yt_emergency_mp3',
            quality: 'Audio Only (MP3 320kbps)',
            format: 'MP3',
            type: 'audio',
            size: '320kbps Audio',
            url: `https://yewtu.be/latest_version?id=${vid}&itag=140`
          }
        ]
      }
    });
  }

  return res.status(400).json({
    success: false,
    error: 'Gagal mengekstrak metadata dari video. Silakan periksa URL kembali.'
  });
});

// Stream Download Endpoint using yt-dlp & ffmpeg
app.get('/api/download', (req, res) => {
  const { url, format = 'mp4', quality = '1080' } = req.query;

  if (!url) {
    return res.status(400).send('URL missing');
  }

  const cleanUrl = decodeURIComponent(url);

  // If already a direct HTTP media URL (e.g. Cobalt / TikWM / Invidious stream)
  if (cleanUrl.startsWith('http') && !cleanUrl.includes('youtube.com') && !cleanUrl.includes('youtu.be') && !cleanUrl.includes('tiktok.com/@')) {
    return res.redirect(cleanUrl);
  }

  const ext = format.toLowerCase();
  const filename = `video_download_${Date.now()}.${ext}`;

  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  
  if (ext === 'mp3') {
    res.setHeader('Content-Type', 'audio/mpeg');
    const cmd = `yt-dlp -x --audio-format mp3 --audio-quality 0 --extractor-args "youtube:player_client=ios,web" --geo-bypass --no-check-certificates -o - "${cleanUrl}"`;
    const child = exec(cmd);
    child.stdout.pipe(res);
  } else if (ext === 'flac') {
    res.setHeader('Content-Type', 'audio/flac');
    const cmd = `yt-dlp -x --audio-format flac --extractor-args "youtube:player_client=ios,web" --geo-bypass --no-check-certificates -o - "${cleanUrl}"`;
    const child = exec(cmd);
    child.stdout.pipe(res);
  } else {
    res.setHeader('Content-Type', 'video/mp4');
    const cmd = `yt-dlp -f "bestvideo[height<=${quality}][ext=mp4]+bestaudio[ext=m4a]/best[ext=mp4]/best" --recode-video mp4 --extractor-args "youtube:player_client=ios,web" --geo-bypass --no-check-certificates -o - "${cleanUrl}"`;
    const child = exec(cmd);
    child.stdout.pipe(res);
  }
});

// SPA Fallback Route
app.get('*', (req, res) => {
  res.sendFile(path.join(distPath, 'index.html'));
});

app.listen(PORT, () => {
  console.log(`Server yt-dlp + Express running on port ${PORT}`);
});
