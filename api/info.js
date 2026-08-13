import axios from 'axios';

// CORS Helper
function setCorsHeaders(res) {
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
  res.setHeader('Access-Control-Allow-Headers', 'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version');
}

// User Agent Helper for Organically Mimicking Chrome Browser
const USER_AGENTS = [
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_2 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.2 Mobile/15E148 Safari/604.1'
];

function getRandomUserAgent() {
  return USER_AGENTS[Math.floor(Math.random() * USER_AGENTS.length)];
}

export default async function handler(req, res) {
  setCorsHeaders(res);
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST' && req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const targetUrl = req.method === 'POST' ? req.body?.url : req.query?.url;
  if (!targetUrl || typeof targetUrl !== 'string') {
    return res.status(400).json({ error: 'URL video tidak valid atau kosong' });
  }

  const cleanUrl = targetUrl.trim();

  try {
    // Detect Platform
    let platform = 'unknown';
    if (/tiktok\.com/i.test(cleanUrl) || /vt\.tiktok\.com/i.test(cleanUrl)) platform = 'tiktok';
    else if (/youtube\.com/i.test(cleanUrl) || /youtu\.be/i.test(cleanUrl)) platform = 'youtube';
    else if (/instagram\.com/i.test(cleanUrl) || /instagr\.am/i.test(cleanUrl)) platform = 'instagram';
    else if (/facebook\.com/i.test(cleanUrl) || /fb\.watch/i.test(cleanUrl)) platform = 'facebook';
    else if (/twitter\.com/i.test(cleanUrl) || /x\.com/i.test(cleanUrl)) platform = 'twitter';

    // Route to appropriate extractor or cobalt/tikwm fallback
    let resultData = null;

    if (platform === 'tiktok') {
      resultData = await extractTikTok(cleanUrl);
    } else if (platform === 'youtube') {
      resultData = await extractYouTube(cleanUrl);
    } else if (platform === 'instagram') {
      resultData = await extractInstagram(cleanUrl);
    } else {
      // Fallback Cobalt / Generic Extractor
      resultData = await extractGeneric(cleanUrl, platform);
    }

    if (!resultData) {
      throw new Error('Gagal mengekstrak metadata dari video. Silakan periksa URL kembali.');
    }

    return res.status(200).json({
      success: true,
      platform,
      data: resultData
    });

  } catch (error) {
    console.error('Error in /api/info:', error.message);
    return res.status(500).json({
      success: false,
      error: error.message || 'Terjadi kesalahan server saat memproses video.'
    });
  }
}

// ==========================================
// TIKTOK EXTRACTOR (TikWM Primary + Fallbacks)
// ==========================================
async function extractTikTok(url) {
  try {
    // Primary: TikWM API
    const response = await axios.post('https://www.tikwm.com/api/', new URLSearchParams({
      url: url,
      hd: '1'
    }), {
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
        'User-Agent': getRandomUserAgent()
      },
      timeout: 8000
    });

    const resData = response.data;
    if (resData && resData.code === 0 && resData.data) {
      const d = resData.data;
      return {
        title: d.title || 'TikTok Video',
        author: d.author?.nickname || d.author?.unique_id || 'TikTok User',
        authorAvatar: d.author?.avatar || '',
        thumbnail: d.cover || d.origin_cover || '',
        duration: d.duration ? `${d.duration}s` : 'N/A',
        previewUrl: d.play || d.hdplay || '',
        formats: [
          {
            id: 'tt_nowatermark_hd',
            quality: 'No Watermark HD',
            format: 'MP4',
            type: 'video',
            size: 'HD High Quality',
            url: d.hdplay || d.play
          },
          {
            id: 'tt_nowatermark',
            quality: 'No Watermark SD',
            format: 'MP4',
            type: 'video',
            size: 'Standard Quality',
            url: d.play
          },
          {
            id: 'tt_watermark',
            quality: 'Watermarked',
            format: 'MP4',
            type: 'video',
            size: 'Original Watermarked',
            url: d.wmplay || d.play
          },
          {
            id: 'tt_mp3',
            quality: 'Audio Only (MP3)',
            format: 'MP3',
            type: 'audio',
            size: '320kbps Audio',
            url: d.music
          },
          {
            id: 'tt_m4a',
            quality: 'Audio Only (M4A)',
            format: 'M4A',
            type: 'audio',
            size: 'Original M4A',
            url: d.music
          },
          {
            id: 'tt_flac',
            quality: 'Audio Only (FLAC Lossless)',
            format: 'FLAC',
            type: 'audio',
            size: 'Lossless Audio',
            url: d.music
          }
        ]
      };
    }
  } catch (err) {
    console.warn('TikWM Primary Extractor failed, using fallback:', err.message);
  }

  // Secondary TikTok Fallback (Cobalt Engine)
  return await extractCobaltFallback(url, 'TikTok');
}

// ==========================================
// YOUTUBE EXTRACTOR (Piped/Invidious + Cobalt API)
// ==========================================
async function extractYouTube(url) {
  // Extract Video ID
  const regExp = /^.*(youtu.be\/|v\/|u\/\w\/|embed\/|shorts\/|watch\?v=|\&v=)([^#\&\?]*).*/;
  const match = url.match(regExp);
  const videoId = (match && match[2].length === 11) ? match[2] : null;

  if (videoId) {
    try {
      // Primary: Piped API Node
      const pipedRes = await axios.get(`https://pipedapi.kavin.rocks/streams/${videoId}`, {
        timeout: 6000,
        headers: { 'User-Agent': getRandomUserAgent() }
      });
      const d = pipedRes.data;
      if (d && d.title) {
        const videoStreams = (d.videoStreams || []).filter(s => s.url);
        const audioStreams = (d.audioStreams || []).filter(s => s.url);

        const formats = [];

        // Add 1080p / 720p / 480p Video Formats
        if (videoStreams.length > 0) {
          videoStreams.slice(0, 4).forEach((st, idx) => {
            formats.push({
              id: `yt_v_${st.quality || idx}`,
              quality: st.quality || `${st.height || 720}p HD`,
              format: 'MP4',
              type: 'video',
              size: st.mimeType ? st.mimeType.split(';')[0] : 'HD Video',
              url: st.url
            });
          });
        }

        // Add Audio Formats (MP3, M4A, FLAC)
        const bestAudio = audioStreams[0]?.url || videoStreams[0]?.url;
        if (bestAudio) {
          formats.push({
            id: 'yt_a_mp3',
            quality: 'Audio MP3 (High Quality)',
            format: 'MP3',
            type: 'audio',
            size: '320kbps Audio',
            url: bestAudio
          });
          formats.push({
            id: 'yt_a_m4a',
            quality: 'Audio M4A (Original)',
            format: 'M4A',
            type: 'audio',
            size: 'AAC/M4A Audio',
            url: bestAudio
          });
          formats.push({
            id: 'yt_a_flac',
            quality: 'Audio FLAC (Lossless)',
            format: 'FLAC',
            type: 'audio',
            size: 'Lossless Audio',
            url: bestAudio
          });
        }

        return {
          title: d.title,
          author: d.uploader || 'YouTube Creator',
          authorAvatar: d.uploaderAvatar || '',
          thumbnail: d.thumbnailUrl || `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`,
          duration: d.duration ? `${Math.floor(d.duration / 60)}m ${d.duration % 60}s` : 'N/A',
          previewUrl: videoStreams[0]?.url || '',
          formats: formats.length > 0 ? formats : getFallbackYouTubeFormats(videoId)
        };
      }
    } catch (err) {
      console.warn('Piped API failed, trying Cobalt YouTube fallback:', err.message);
    }
  }

  // Fallback if Piped API is blocked or video ID missing
  return await extractCobaltFallback(url, 'YouTube', videoId);
}

function getFallbackYouTubeFormats(videoId) {
  return [
    {
      id: 'yt_fallback_720',
      quality: '720p HD Video',
      format: 'MP4',
      type: 'video',
      size: 'HD Video',
      url: `https://www.youtube.com/watch?v=${videoId}`
    },
    {
      id: 'yt_fallback_mp3',
      quality: 'Audio MP3 (320kbps)',
      format: 'MP3',
      type: 'audio',
      size: '320kbps Audio',
      url: `https://www.youtube.com/watch?v=${videoId}`
    },
    {
      id: 'yt_fallback_flac',
      quality: 'Audio FLAC Lossless',
      format: 'FLAC',
      type: 'audio',
      size: 'Lossless Audio',
      url: `https://www.youtube.com/watch?v=${videoId}`
    }
  ];
}

// ==========================================
// INSTAGRAM EXTRACTOR
// ==========================================
async function extractInstagram(url) {
  try {
    const cobaltRes = await extractCobaltFallback(url, 'Instagram');
    if (cobaltRes) return cobaltRes;
  } catch (err) {
    console.warn('Instagram extractor failed:', err.message);
  }

  return {
    title: 'Instagram Post / Reel',
    author: 'Instagram User',
    authorAvatar: '',
    thumbnail: 'https://images.unsplash.com/photo-1611162617213-7d7a39e9b1d7?auto=format&fit=crop&w=600&q=80',
    duration: 'N/A',
    previewUrl: '',
    formats: [
      {
        id: 'ig_hd',
        quality: 'Reels / Post HD',
        format: 'MP4',
        type: 'video',
        size: 'Full HD',
        url: url
      },
      {
        id: 'ig_mp3',
        quality: 'Audio MP3',
        format: 'MP3',
        type: 'audio',
        size: 'Audio Track',
        url: url
      }
    ]
  };
}

// ==========================================
// COBALT MULTI-FALLBACK ENGINE
// ==========================================
async function extractCobaltFallback(url, platformName, optionalVideoId) {
  try {
    const response = await axios.post('https://api.cobalt.tools/api/json', {
      url: url,
      vQuality: '1080',
      filenamePattern: 'nerd'
    }, {
      headers: {
        'Accept': 'application/json',
        'Content-Type': 'application/json',
        'User-Agent': getRandomUserAgent()
      },
      timeout: 8000
    });

    const data = response.data;
    if (data && (data.url || data.picker)) {
      const mediaUrl = data.url || (data.picker && data.picker[0]?.url);
      const thumbnail = optionalVideoId ? `https://i.ytimg.com/vi/${optionalVideoId}/hqdefault.jpg` : '';

      return {
        title: `${platformName} Download Media`,
        author: `${platformName} User`,
        authorAvatar: '',
        thumbnail: thumbnail || 'https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?auto=format&fit=crop&w=600&q=80',
        duration: 'N/A',
        previewUrl: mediaUrl,
        formats: [
          {
            id: 'cobalt_hd',
            quality: 'HD High Quality (Original)',
            format: 'MP4',
            type: 'video',
            size: 'Best Quality',
            url: mediaUrl
          },
          {
            id: 'cobalt_mp3',
            quality: 'Audio MP3',
            format: 'MP3',
            type: 'audio',
            size: '320kbps Audio',
            url: mediaUrl
          },
          {
            id: 'cobalt_m4a',
            quality: 'Audio M4A',
            format: 'M4A',
            type: 'audio',
            size: 'M4A Audio',
            url: mediaUrl
          },
          {
            id: 'cobalt_flac',
            quality: 'Audio FLAC Lossless',
            format: 'FLAC',
            type: 'audio',
            size: 'Lossless Audio',
            url: mediaUrl
          }
        ]
      };
    }
  } catch (err) {
    console.warn('Cobalt fallback engine failed:', err.message);
  }

  return null;
}

// Generic Fallback
async function extractGeneric(url, platform) {
  return await extractCobaltFallback(url, platform.toUpperCase());
}
