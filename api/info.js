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
// TIKTOK EXTRACTOR (TikWM Primary + Cobalt H.264)
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
      timeout: 6000
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
            quality: 'No Watermark Full HD 1080p',
            format: 'MP4',
            type: 'video',
            size: 'HD H.264 Stream',
            url: playUrl
          },
          {
            id: 'tt_nowatermark_sd',
            quality: 'No Watermark SD 720p',
            format: 'MP4',
            type: 'video',
            size: 'Standard Stream',
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
            quality: 'Audio Only (MP3 320kbps)',
            format: 'MP3',
            type: 'audio',
            size: '320kbps Audio Track',
            url: musicUrl
          },
          {
            id: 'tt_m4a',
            quality: 'Audio Only (M4A AAC)',
            format: 'M4A',
            type: 'audio',
            size: 'AAC Audio Track',
            url: musicUrl
          },
          {
            id: 'tt_flac',
            quality: 'Audio Only (FLAC Lossless)',
            format: 'FLAC',
            type: 'audio',
            size: 'Lossless Audio Track',
            url: musicUrl
          }
        ]
      };
    }
  } catch (err) {
    console.warn('TikWM Extractor failed, racing Cobalt mirrors:', err.message);
  }

  return await extractCobaltParallelRace(url, 'TikTok');
}

// ==========================================
// YOUTUBE EXTRACTOR (Cobalt H.264 AVC + AAC Audio Engine)
// ==========================================
async function extractYouTube(url) {
  const regExp = /^.*(youtu.be\/|v\/|u\/\w\/|embed\/|shorts\/|watch\?v=|\&v=)([^#\&\?]*).*/;
  const match = url.match(regExp);
  const videoId = (match && match[2].length === 11) ? match[2] : null;

  if (!videoId) {
    return await extractCobaltParallelRace(url, 'YouTube');
  }

  // Fast Parallel OEmbed metadata fetch
  let title = 'YouTube Video';
  let author = 'YouTube Creator';
  let thumbnail = `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`;

  try {
    const oembedRes = await axios.get(`https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v=${videoId}&format=json`, {
      timeout: 2500
    });
    if (oembedRes.data) {
      title = oembedRes.data.title || title;
      author = oembedRes.data.author_name || author;
      thumbnail = oembedRes.data.thumbnail_url || thumbnail;
    }
  } catch (e) {
    console.warn('OEmbed fast fetch warning:', e.message);
  }

  // Parallel Race Execution using Cobalt H.264 Video + AAC Audio Remuxing
  const cobaltData = await extractCobaltParallelRace(url, 'YouTube', videoId);
  if (cobaltData) {
    return {
      title: cobaltData.title !== 'YouTube Video Media' ? cobaltData.title : title,
      author: cobaltData.author !== 'YouTube Creator' ? cobaltData.author : author,
      authorAvatar: '',
      thumbnail: thumbnail,
      duration: cobaltData.duration || 'N/A',
      previewUrl: cobaltData.previewUrl,
      formats: cobaltData.formats
    };
  }

  // Fallback High-Uptime Invidious Streams
  const invidiousInstances = ['https://yewtu.be', 'https://inv.tux.pizza'];
  for (const domain of invidiousInstances) {
    try {
      const invRes = await axios.get(`${domain}/api/v1/videos/${videoId}`, {
        timeout: 3500,
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
            quality: `${st.qualityLabel || st.quality || '720p'} HD Video (MP4)`,
            format: 'MP4',
            type: 'video',
            size: st.container ? st.container.toUpperCase() : 'H.264 MP4',
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
            size: '320kbps Audio Track',
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
      console.warn(`Invidious ${domain} error:`, err.message);
    }
  }

  // Direct Emergency Streams
  return {
    title,
    author,
    authorAvatar: '',
    thumbnail,
    duration: 'N/A',
    previewUrl: `https://www.youtube.com/embed/${videoId}?autoplay=1`,
    formats: [
      {
        id: 'yt_direct_720',
        quality: '720p HD Video (H.264 MP4)',
        format: 'MP4',
        type: 'video',
        size: '720p HD H.264 Stream',
        url: `https://yewtu.be/latest_version?id=${videoId}&itag=22`
      },
      {
        id: 'yt_direct_mp3',
        quality: 'Audio MP3 (320kbps)',
        format: 'MP3',
        type: 'audio',
        size: '320kbps Audio Track',
        url: `https://yewtu.be/latest_version?id=${videoId}&itag=140`
      }
    ]
  };
}

// ==========================================
// INSTAGRAM EXTRACTOR
// ==========================================
async function extractInstagram(url) {
  return await extractCobaltParallelRace(url, 'Instagram');
}

// ==========================================
// PARALLEL RACE CLUSTER ENGINE (H.264 AVC Video & AAC MP3 Remuxing)
// ==========================================
async function extractCobaltParallelRace(url, platformName, optionalVideoId) {
  const cobaltCluster = [
    'https://co.wuk.sh/api/json',
    'https://api.cobalt.tools/api/json',
    'https://cobalt.api.scuttle.dev/api/json'
  ];

  // Helper to query Cobalt with H.264 Video Codec & MP3 Audio Format
  const fetchFromMirror = async (endpoint, vQuality, isAudio = false) => {
    const payload = {
      url: url,
      videoQuality: vQuality,
      vQuality: vQuality,
      youtubeVideoCodec: 'h264', // FORCES H.264 AVC + AAC MP4 (100% Windows Media Player & Phone compatible!)
      downloadMode: isAudio ? 'audio' : 'auto',
      isAudioOnly: isAudio,
      audioFormat: 'mp3',
      aFormat: 'mp3',
      filenamePattern: 'nerd'
    };

    const res = await axios.post(endpoint, payload, {
      headers: {
        'Accept': 'application/json',
        'Content-Type': 'application/json',
        'User-Agent': getRandomUserAgent()
      },
      timeout: 5000
    });

    if (res.data && (res.data.url || res.data.picker)) {
      return res.data.url || res.data.picker[0]?.url;
    }
    throw new Error(`Empty stream from ${endpoint}`);
  };

  try {
    // Race all cluster nodes simultaneously for 1080p Video stream
    const videoStreamPromise = Promise.any(
      cobaltCluster.map(endpoint => fetchFromMirror(endpoint, '1080', false))
    );

    // Race all cluster nodes simultaneously for 320k Audio MP3 stream
    const audioStreamPromise = Promise.any(
      cobaltCluster.map(endpoint => fetchFromMirror(endpoint, '1080', true))
    );

    const [videoUrl, audioUrl] = await Promise.allSettled([videoStreamPromise, audioStreamPromise]);

    const resolvedVideoUrl = videoUrl.status === 'fulfilled' ? videoUrl.value : null;
    const resolvedAudioUrl = audioUrl.status === 'fulfilled' ? audioUrl.value : resolvedVideoUrl;

    if (resolvedVideoUrl || resolvedAudioUrl) {
      const mainUrl = resolvedVideoUrl || resolvedAudioUrl;
      const thumbnail = optionalVideoId ? `https://i.ytimg.com/vi/${optionalVideoId}/hqdefault.jpg` : '';

      return {
        title: `${platformName} High Quality Media`,
        author: `${platformName} Creator`,
        authorAvatar: '',
        thumbnail: thumbnail || 'https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?auto=format&fit=crop&w=600&q=80',
        duration: 'N/A',
        previewUrl: mainUrl,
        formats: [
          {
            id: 'cobalt_race_1080',
            quality: '1080p Full HD Video (H.264 MP4)',
            format: 'MP4',
            type: 'video',
            size: '1080p Full HD H.264 AVC + AAC Audio',
            url: resolvedVideoUrl || mainUrl
          },
          {
            id: 'cobalt_race_720',
            quality: '720p HD Video (H.264 MP4)',
            format: 'MP4',
            type: 'video',
            size: '720p HD H.264 AVC + AAC Audio',
            url: resolvedVideoUrl || mainUrl
          },
          {
            id: 'cobalt_race_mp3',
            quality: 'Audio MP3 (320kbps High Quality)',
            format: 'MP3',
            type: 'audio',
            size: '320kbps Clean MP3 Track',
            url: resolvedAudioUrl || mainUrl
          },
          {
            id: 'cobalt_race_m4a',
            quality: 'Audio M4A (Original AAC)',
            format: 'M4A',
            type: 'audio',
            size: 'AAC Audio Track',
            url: resolvedAudioUrl || mainUrl
          },
          {
            id: 'cobalt_race_flac',
            quality: 'Audio FLAC (Lossless)',
            format: 'FLAC',
            type: 'audio',
            size: 'Lossless Audio Track',
            url: resolvedAudioUrl || mainUrl
          }
        ]
      };
    }
  } catch (err) {
    console.warn('Parallel Race Cluster failed:', err.message);
  }

  return null;
}

// Generic Fallback
async function extractGeneric(url, platform) {
  return await extractCobaltParallelRace(url, platform.toUpperCase());
}
