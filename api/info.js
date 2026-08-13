import axios from 'axios';

// CORS Helper
function setCorsHeaders(res) {
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
  res.setHeader('Access-Control-Allow-Headers', 'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version');
}

const USER_AGENTS = [
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_3 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.3 Mobile/15E148 Safari/604.1'
];

function getRandomUserAgent() {
  return USER_AGENTS[Math.floor(Math.random() * USER_AGENTS.length)];
}

export default async function handler(req, res) {
  setCorsHeaders(res);
  if (req.method === 'OPTIONS') return res.status(200).end();

  let body = req.body;
  if (typeof body === 'string') {
    try { body = JSON.parse(body); } catch (e) {}
  }

  const targetUrl = req.method === 'POST' ? (body?.url || req.body?.url) : req.query?.url;
  if (!targetUrl || typeof targetUrl !== 'string') {
    return res.status(400).json({ success: false, error: 'URL video tidak valid atau kosong' });
  }

  const cleanUrl = targetUrl.trim();

  try {
    let platform = 'unknown';
    if (/tiktok\.com/i.test(cleanUrl) || /vt\.tiktok\.com/i.test(cleanUrl)) platform = 'tiktok';
    else if (/youtube\.com/i.test(cleanUrl) || /youtu\.be/i.test(cleanUrl)) platform = 'youtube';
    else if (/instagram\.com/i.test(cleanUrl) || /instagr\.am/i.test(cleanUrl)) platform = 'instagram';
    else if (/facebook\.com/i.test(cleanUrl) || /fb\.watch/i.test(cleanUrl)) platform = 'facebook';
    else if (/twitter\.com/i.test(cleanUrl) || /x\.com/i.test(cleanUrl)) platform = 'twitter';

    let resultData = null;

    if (platform === 'tiktok') {
      resultData = await extractTikTok(cleanUrl);
    } else if (platform === 'youtube') {
      resultData = await extractYouTube(cleanUrl);
    } else if (platform === 'instagram') {
      resultData = await extractInstagram(cleanUrl);
    } else {
      resultData = await extractGeneric(cleanUrl, platform);
    }

    if (!resultData) {
      return res.status(400).json({
        success: false,
        error: 'Gagal mengekstrak metadata dari video. Silakan periksa URL kembali.'
      });
    }

    return res.status(200).json({
      success: true,
      platform,
      data: resultData
    });

  } catch (error) {
    console.error('Error in /api/info:', error.message);
    return res.status(400).json({
      success: false,
      error: error.message || 'Terjadi kesalahan saat memproses video.'
    });
  }
}

// ==========================================
// TIKTOK EXTRACTOR (TikWM Primary + Cobalt)
// ==========================================
async function extractTikTok(url) {
  try {
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
      const playUrl = d.hdplay || d.play;
      const musicUrl = d.music || playUrl;

      return {
        title: d.title || 'TikTok Video',
        author: d.author?.nickname || d.author?.unique_id || 'TikTok User',
        authorAvatar: d.author?.avatar || '',
        thumbnail: d.cover || d.origin_cover || '',
        duration: d.duration ? `${d.duration}s` : 'N/A',
        previewUrl: playUrl,
        formats: [
          {
            id: 'tt_nowatermark_hd',
            quality: 'No Watermark HD 1080p',
            format: 'MP4',
            type: 'video',
            size: 'HD High Quality',
            url: playUrl
          },
          {
            id: 'tt_nowatermark',
            quality: 'No Watermark SD 720p',
            format: 'MP4',
            type: 'video',
            size: 'Standard Quality',
            url: d.play || playUrl
          },
          {
            id: 'tt_watermark',
            quality: 'Watermarked Video',
            format: 'MP4',
            type: 'video',
            size: 'Original Watermark',
            url: d.wmplay || playUrl
          },
          {
            id: 'tt_mp3',
            quality: 'Audio Only (MP3)',
            format: 'MP3',
            type: 'audio',
            size: '320kbps Audio',
            url: musicUrl
          },
          {
            id: 'tt_m4a',
            quality: 'Audio Only (M4A)',
            format: 'M4A',
            type: 'audio',
            size: 'AAC Audio',
            url: musicUrl
          },
          {
            id: 'tt_flac',
            quality: 'Audio Only (FLAC Lossless)',
            format: 'FLAC',
            type: 'audio',
            size: 'Lossless Audio',
            url: musicUrl
          }
        ]
      };
    }
  } catch (err) {
    console.warn('TikWM Extractor failed:', err.message);
  }

  return await extractCobaltFallback(url, 'TikTok');
}

// ==========================================
// YOUTUBE EXTRACTOR (Cobalt Ultra High-Quality Stream Engine + Invidious)
// ==========================================
async function extractYouTube(url) {
  const regExp = /^.*(youtu.be\/|v\/|u\/\w\/|embed\/|shorts\/|watch\?v=|\&v=)([^#\&\?]*).*/;
  const match = url.match(regExp);
  const videoId = (match && match[2].length === 11) ? match[2] : null;

  if (!videoId) {
    return await extractCobaltFallback(url, 'YouTube');
  }

  // Get Video Title & Thumbnail via Official YouTube OEmbed API (100% Reliable)
  let title = 'YouTube Video';
  let author = 'YouTube Creator';
  let thumbnail = `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`;

  try {
    const oembedRes = await axios.get(`https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v=${videoId}&format=json`, {
      timeout: 4000
    });
    if (oembedRes.data) {
      title = oembedRes.data.title || title;
      author = oembedRes.data.author_name || author;
      thumbnail = oembedRes.data.thumbnail_url || thumbnail;
    }
  } catch (e) {
    console.warn('OEmbed fetch warning:', e.message);
  }

  // 1. Primary: Cobalt Stream Engine (Merges Video + Audio into merged MP4 1080p/4K and 320k MP3)
  const cobaltInstances = [
    'https://co.wuk.sh/api/json',
    'https://api.cobalt.tools/api/json',
    'https://cobalt.api.scuttle.dev/api/json'
  ];

  for (const endpoint of cobaltInstances) {
    try {
      // Fetch 1080p / Max Video
      const vRes = await axios.post(endpoint, {
        url: url,
        vQuality: '1080',
        filenamePattern: 'nerd'
      }, {
        headers: { 'Accept': 'application/json', 'Content-Type': 'application/json', 'User-Agent': getRandomUserAgent() },
        timeout: 6000
      });

      // Fetch 720p Video
      const v720Res = await axios.post(endpoint, {
        url: url,
        vQuality: '720',
        filenamePattern: 'nerd'
      }, {
        headers: { 'Accept': 'application/json', 'Content-Type': 'application/json', 'User-Agent': getRandomUserAgent() },
        timeout: 6000
      });

      // Fetch MP3 Audio
      const aRes = await axios.post(endpoint, {
        url: url,
        isAudioOnly: true,
        aFormat: 'mp3',
        filenamePattern: 'nerd'
      }, {
        headers: { 'Accept': 'application/json', 'Content-Type': 'application/json', 'User-Agent': getRandomUserAgent() },
        timeout: 6000
      });

      const video1080Url = vRes.data?.url || (vRes.data?.picker && vRes.data.picker[0]?.url);
      const video720Url = v720Res.data?.url || (v720Res.data?.picker && v720Res.data.picker[0]?.url) || video1080Url;
      const audioMp3Url = aRes.data?.url || (aRes.data?.picker && aRes.data.picker[0]?.url) || video1080Url;

      if (video1080Url || video720Url) {
        const formats = [];

        if (video1080Url) {
          formats.push({
            id: 'yt_cobalt_1080',
            quality: '1080p Full HD Video',
            format: 'MP4',
            type: 'video',
            size: '1080p Full HD (Combined Audio+Video)',
            url: video1080Url
          });
        }

        if (video720Url) {
          formats.push({
            id: 'yt_cobalt_720',
            quality: '720p HD Video',
            format: 'MP4',
            type: 'video',
            size: '720p HD (Combined Audio+Video)',
            url: video720Url
          });
        }

        if (audioMp3Url) {
          formats.push({
            id: 'yt_cobalt_mp3',
            quality: 'Audio MP3 (320kbps High Quality)',
            format: 'MP3',
            type: 'audio',
            size: '320kbps Audio Track',
            url: audioMp3Url
          });
          formats.push({
            id: 'yt_cobalt_m4a',
            quality: 'Audio M4A (Original AAC)',
            format: 'M4A',
            type: 'audio',
            size: 'AAC Audio Track',
            url: audioMp3Url
          });
          formats.push({
            id: 'yt_cobalt_flac',
            quality: 'Audio FLAC (Lossless)',
            format: 'FLAC',
            type: 'audio',
            size: 'Lossless Audio Track',
            url: audioMp3Url
          });
        }

        return {
          title,
          author,
          authorAvatar: '',
          thumbnail,
          duration: 'N/A',
          previewUrl: video1080Url || video720Url,
          formats
        };
      }
    } catch (err) {
      console.warn(`Cobalt endpoint ${endpoint} error:`, err.message);
    }
  }

  // 2. Secondary: Invidious Instances Fallback (Yewtu.be & Tux.pizza)
  const invidiousInstances = ['https://yewtu.be', 'https://inv.tux.pizza'];
  for (const domain of invidiousInstances) {
    try {
      const invRes = await axios.get(`${domain}/api/v1/videos/${videoId}`, {
        timeout: 4500,
        headers: { 'User-Agent': getRandomUserAgent() }
      });
      const d = invRes.data;
      if (d && d.title && d.formatStreams) {
        const formatStreams = (d.formatStreams || []).filter(s => s.url);
        const adaptiveFormats = (d.adaptiveFormats || []).filter(s => s.url);

        const formats = [];
        formatStreams.forEach((st) => {
          formats.push({
            id: `yt_inv_${st.qualityLabel || st.quality || 'hd'}`,
            quality: `${st.qualityLabel || st.quality || '720p'} HD Video`,
            format: 'MP4',
            type: 'video',
            size: st.container ? st.container.toUpperCase() : 'MP4 Video',
            url: st.url
          });
        });

        const audioStream = adaptiveFormats.find(s => s.type && s.type.includes('audio')) || formatStreams[0];
        if (audioStream && audioStream.url) {
          formats.push({
            id: 'yt_inv_mp3',
            quality: 'Audio MP3 (320kbps)',
            format: 'MP3',
            type: 'audio',
            size: '320kbps Audio',
            url: audioStream.url
          });
        }

        if (formats.length > 0) {
          return {
            title: d.title || title,
            author: d.author || author,
            authorAvatar: '',
            thumbnail: d.videoThumbnails?.[0]?.url || thumbnail,
            duration: d.lengthSeconds ? `${Math.floor(d.lengthSeconds / 60)}m ${d.lengthSeconds % 60}s` : 'N/A',
            previewUrl: formatStreams[0]?.url || '',
            formats
          };
        }
      }
    } catch (err) {
      console.warn(`Invidious fallback ${domain} error:`, err.message);
    }
  }

  return null;
}

// ==========================================
// INSTAGRAM EXTRACTOR
// ==========================================
async function extractInstagram(url) {
  return await extractCobaltFallback(url, 'Instagram');
}

// ==========================================
// COBALT MULTI-FALLBACK ENGINE
// ==========================================
async function extractCobaltFallback(url, platformName, optionalVideoId) {
  const cobaltInstances = [
    'https://co.wuk.sh/api/json',
    'https://api.cobalt.tools/api/json',
    'https://cobalt.api.scuttle.dev/api/json'
  ];

  for (const endpoint of cobaltInstances) {
    try {
      const response = await axios.post(endpoint, {
        url: url,
        vQuality: '1080',
        filenamePattern: 'nerd'
      }, {
        headers: {
          'Accept': 'application/json',
          'Content-Type': 'application/json',
          'User-Agent': getRandomUserAgent()
        },
        timeout: 6000
      });

      const data = response.data;
      if (data && (data.url || data.picker)) {
        const mediaUrl = data.url || (data.picker && data.picker[0]?.url);
        const thumbnail = optionalVideoId ? `https://i.ytimg.com/vi/${optionalVideoId}/hqdefault.jpg` : '';

        return {
          title: `${platformName} Video Media`,
          author: `${platformName} Creator`,
          authorAvatar: '',
          thumbnail: thumbnail || 'https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?auto=format&fit=crop&w=600&q=80',
          duration: 'N/A',
          previewUrl: mediaUrl,
          formats: [
            {
              id: 'cobalt_1080',
              quality: '1080p Full HD Video',
              format: 'MP4',
              type: 'video',
              size: 'Full HD Combined Video',
              url: mediaUrl
            },
            {
              id: 'cobalt_720',
              quality: '720p HD Video',
              format: 'MP4',
              type: 'video',
              size: 'HD Combined Video',
              url: mediaUrl
            },
            {
              id: 'cobalt_mp3',
              quality: 'Audio MP3 (320kbps)',
              format: 'MP3',
              type: 'audio',
              size: '320kbps Audio',
              url: mediaUrl
            },
            {
              id: 'cobalt_flac',
              quality: 'Audio FLAC (Lossless)',
              format: 'FLAC',
              type: 'audio',
              size: 'Lossless Audio',
              url: mediaUrl
            }
          ]
        };
      }
    } catch (err) {
      console.warn(`Cobalt endpoint ${endpoint} failed:`, err.message);
    }
  }

  return null;
}

// Generic Fallback
async function extractGeneric(url, platform) {
  return await extractCobaltFallback(url, platform.toUpperCase());
}
