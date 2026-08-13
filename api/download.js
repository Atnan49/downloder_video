import axios from 'axios';

function setCorsHeaders(res) {
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,POST');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
}

export default async function handler(req, res) {
  setCorsHeaders(res);
  if (req.method === 'OPTIONS') return res.status(200).end();

  const fileUrl = req.query?.url || req.body?.url;
  const filename = req.query?.filename || 'video-download';
  const format = (req.query?.format || 'mp4').toLowerCase();

  if (!fileUrl) {
    return res.status(400).json({ error: 'Target URL file download tidak ditemukan' });
  }

  try {
    // Sanitize filename
    const cleanFilename = filename.replace(/[^a-zA-Z0-9_-]/g, '_').substring(0, 50);
    const fullFilename = `${cleanFilename}.${format}`;

    // Set Content-Type
    let contentType = 'video/mp4';
    if (format === 'mp3') contentType = 'audio/mpeg';
    else if (format === 'm4a') contentType = 'audio/mp4';
    else if (format === 'flac') contentType = 'audio/flac';
    else if (format === 'wav') contentType = 'audio/wav';
    else if (format === 'webm') contentType = 'video/webm';

    // If direct streamable URL, redirect or stream pipe
    res.setHeader('Content-Disposition', `attachment; filename="${fullFilename}"`);
    res.setHeader('Content-Type', contentType);

    // Stream download from remote URL to client
    const response = await axios({
      method: 'GET',
      url: fileUrl,
      responseType: 'stream',
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36'
      },
      timeout: 20000
    });

    response.data.pipe(res);

  } catch (error) {
    console.error('Download proxy error:', error.message);
    // If streaming fails or payload exceeds limits, redirect directly to origin URL so user still gets the file!
    return res.redirect(302, fileUrl);
  }
}
