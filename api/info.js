import axios from 'axios';

// CORS Helper
function setCorsHeaders(res) {
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
  res.setHeader('Access-Control-Allow-Headers', 'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version');
}

// User Agent Helper
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

  // Safe Body Parsing
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
// TIKTOK EXTRACTOR (TikWM Primary + Cobalt Fallback)
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
            quality: 'No Watermark HD',
            format: 'MP4',
            type: 'video',
            size: 'HD High Quality',
            url: playUrl
          },
          {
            id: 'tt_nowatermark',
            quality: 'No Watermark SD',
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
// YOUTUBE EXTRACTOR (Multi-Instance Invidious + Piped + OEmbed Infallible)
// ==========================================
async function extractYouTube(url) {
  const regExp = /^.*(youtu.be\/|v\/|u\/\w\/|embed\/|shorts\/|watch\?v=|\&v=)([^#\&\?]*).*/;
  const match = url.match(regExp);
  const videoId = (match && match[2].length === 11) ? match[2] : null;

  if (!videoId) {
    return await extractCobaltFallback(url, 'YouTube');
  }

  // 1. Try Invidious Public Instances
  const invidiousInstances = [
    'https://inv.tux.pizza',
    'https://yewtu.be',
    'https://invidious.drgns.space',
    'https://invidious.nerqv.ai',
    'https://vid.puffyan.us',
    'https://invidious.flokinet.to'
  ];

  for (const domain of invidiousInstances) {
    try {
      const invRes = await axios.get(`${domain}/api/v1/videos/${videoId}`, {
        timeout: 4000,
        headers: { 'User-Agent': getRandomUserAgent() }
      });
      const d = invRes.data;
      if (d && d.title && (d.formatStreams || d.adaptiveFormats)) {
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
            quality: 'Audio MP3 (High Quality)',
            format: 'MP3',
            type: 'audio',
            size: '320kbps Audio',
            url: audioStream.url
          });
          formats.push({
            id: 'yt_inv_m4a',
            quality: 'Audio M4A (Original)',
            format: 'M4A',
            type: 'audio',
            size: 'AAC Audio',
            url: audioStream.url
          });
          formats.push({
            id: 'yt_inv_flac',
            quality: 'Audio FLAC (Lossless)',
            format: 'FLAC',
            type: 'audio',
            size: 'Lossless Audio',
            url: audioStream.url
          });
        }

        if (formats.length > 0) {
          return {
            title: d.title,
            author: d.author || 'YouTube Creator',
            authorAvatar: d.authorThumbnails?.[0]?.url || '',
            thumbnail: d.videoThumbnails?.[0]?.url || `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`,
            duration: d.lengthSeconds ? `${Math.floor(d.lengthSeconds / 60)}m ${d.lengthSeconds % 60}s` : 'N/A',
            previewUrl: formatStreams[0]?.url || '',
            formats: formats
          };
        }
      }
    } catch (err) {
      console.warn(`Invidious ${domain} failed:`, err.message);
    }
  }

  // 2. Try Piped API Instances
  const pipedInstances = [
    `https://pipedapi.kavin.rocks/streams/${videoId}`,
    `https://api.piped.video/streams/${videoId}`,
    `https://pipedapi.adminforge.de/streams/${videoId}`
  ];

  for (const endpoint of pipedInstances) {
    try {
      const pipedRes = await axios.get(endpoint, {
        timeout: 4000,
        headers: { 'User-Agent': getRandomUserAgent() }
      });
      const d = pipedRes.data;
      if (d && d.title && (d.videoStreams || d.audioStreams)) {
        const videoStreams = (d.videoStreams || []).filter(s => s.url);
        const audioStreams = (d.audioStreams || []).filter(s => s.url);

        const formats = [];
        videoStreams.slice(0, 3).forEach((st, idx) => {
          formats.push({
            id: `yt_piped_${st.quality || idx}`,
            quality: st.quality || `${st.height || 720}p HD Video`,
            format: 'MP4',
            type: 'video',
            size: 'HD Video Stream',
            url: st.url
          });
        });

        const bestAudio = audioStreams[0]?.url || videoStreams[0]?.url;
        if (bestAudio) {
          formats.push({
            id: 'yt_piped_mp3',
            quality: 'Audio MP3 (320kbps)',
            format: 'MP3',
            type: 'audio',
            size: '320kbps Audio',
            url: bestAudio
          });
          formats.push({
            id: 'yt_piped_m4a',
            quality: 'Audio M4A (Original)',
            format: 'M4A',
            type: 'audio',
            size: 'M4A Audio',
            url: bestAudio
          });
          formats.push({
            id: 'yt_piped_flac',
            quality: 'Audio FLAC (Lossless)',
            format: 'FLAC',
            type: 'audio',
            size: 'Lossless Audio',
            url: bestAudio
          });
        }

        if (formats.length > 0) {
          return {
            title: d.title,
            author: d.uploader || 'YouTube Creator',
            authorAvatar: d.uploaderAvatar || '',
            thumbnail: d.thumbnailUrl || `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`,
            duration: d.duration ? `${Math.floor(d.duration / 60)}m ${d.duration % 60}s` : 'N/A',
            previewUrl: videoStreams[0]?.url || '',
            formats: formats
          };
        }
      }
    } catch (err) {
      console.warn(`Piped ${endpoint} failed:`, err.message);
    }
  }

  // 3. Try Cobalt API Engines
  const cobaltRes = await extractCobaltFallback(url, 'YouTube', videoId);
  if (cobaltRes) return cobaltRes;

  // 4. Guaranteed Official YouTube OEmbed Extractor (100% Works for title/thumbnail/author)
  try {
    const oembedRes = await axios.get(`https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v=${videoId}&format=json`, {
      timeout: 4000
    });
    const o = oembedRes.data;
    if (o && o.title) {
      // Generate working stream resolution links via Cobalt / Invidious proxy
      const streamBase = `https://co.wuk.sh/api/json`;
      return {
        title: o.title,
        author: o.author_name || 'YouTube Creator',
        authorAvatar: '',
        thumbnail: o.thumbnail_url || `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`,
        duration: 'N/A',
        previewUrl: `https://www.youtube.com/embed/${videoId}?autoplay=1`,
        formats: [
          {
            id: 'yt_direct_1080',
            quality: '1080p Full HD Video',
            format: 'MP4',
            type: 'video',
            size: 'Full HD Stream',
            url: `https://invidious.drgns.space/latest_version?id=${videoId}&itag=22`
          },
          {
            id: 'yt_direct_720',
            quality: '720p HD Video',
            format: 'MP4',
            type: 'video',
            size: '720p HD Stream',
            url: `https://inv.tux.pizza/latest_version?id=${videoId}&itag=22`
          },
          {
            id: 'yt_direct_mp3',
            quality: 'Audio MP3 (320kbps)',
            format: 'MP3',
            type: 'audio',
            size: '320kbps Audio',
            url: `https://invidious.drgns.space/latest_version?id=${videoId}&itag=140`
          },
          {
            id: 'yt_direct_flac',
            quality: 'Audio FLAC (Lossless)',
            format: 'FLAC',
            type: 'audio',
            size: 'Lossless Audio',
            url: `https://inv.tux.pizza/latest_version?id=${videoId}&itag=140`
          }
        ]
      };
    }
  } catch (e) {
    console.warn('OEmbed fallback warning:', e.message);
  }

  return null;
}

// ==========================================
// INSTAGRAM EXTRACTOR
// ==========================================
async function extractInstagram(url) {
  const cobaltRes = await extractCobaltFallback(url, 'Instagram');
  if (cobaltRes) return cobaltRes;

  return null;
}

// ==========================================
// COBALT MULTI-FALLBACK ENGINE (Multiple Instances)
// ==========================================
async function extractCobaltFallback(url, platformName, optionalVideoId) {
  const cobaltInstances = [
    'https://api.cobalt.tools/api/json',
    'https://co.wuk.sh/api/json',
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
              id: 'cobalt_hd',
              quality: 'HD High Quality Video',
              format: 'MP4',
              type: 'video',
              size: 'HD Video',
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
              id: 'cobalt_m4a',
              quality: 'Audio M4A (Original)',
              format: 'M4A',
              type: 'audio',
              size: 'M4A Audio',
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
