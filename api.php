<?php
header('Content-Type: application/json');

// Enable error reporting for debugging during development
// ini_set('display_errors', 1);
// error_reporting(E_ALL);

function respondWithError($message) {
    echo json_encode(['success' => false, 'error' => $message]);
    exit;
}

ini_set('display_errors', 0);
error_reporting(0);

try {
    if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
        respondWithError('Invalid request method');
    }

    $input = json_decode(file_get_contents('php://input'), true);
    $url = isset($input['url']) ? trim($input['url']) : '';

    if (empty($url)) {
        respondWithError('URL is required');
    }

    // Basic URL validation
    if (!filter_var($url, FILTER_VALIDATE_URL)) {
        respondWithError('Invalid URL format');
    }

    // Workaround for Spotify DRM issue: Scrape title and search on YouTube
    if (strpos($url, 'spotify.com') !== false) {
        $context = stream_context_create([
            'http' => [
                'user_agent' => 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/114.0.0.0 Safari/537.36',
                'ignore_errors' => true 
            ]
        ]);
        $html = @file_get_contents($url, false, $context);
        if ($html) {
            $searchQuery = '';
            if (preg_match('/<meta property="og:title" content="(.*?)"/i', $html, $matches)) {
                $searchQuery = html_entity_decode($matches[1], ENT_QUOTES);
                if (preg_match('/<meta property="og:description" content="(.*?)"/i', $html, $descMatches)) {
                    $searchQuery .= ' ' . html_entity_decode($descMatches[1], ENT_QUOTES);
                }
            } else if (preg_match('/<title>(.*?)<\/title>/i', $html, $matches)) {
                $searchQuery = html_entity_decode(str_replace(' | Spotify', '', $matches[1]), ENT_QUOTES);
            }

            if (!empty($searchQuery)) {
                $url = 'ytsearch1:' . $searchQuery;
            }
        }
    }

    // Path executable yt-dlp (Deteksi dinamis antara PC Windows Anda dan Server Linux Render)
    if (strtoupper(substr(PHP_OS, 0, 3)) === 'WIN') {
        $ytDlpPath = __DIR__ . DIRECTORY_SEPARATOR . 'yt-dlp.exe'; // Untuk XAMPP Lokal Windows
    } else {
        $ytDlpPath = '/usr/local/bin/yt-dlp'; // Untuk Render.com Server (Linux)
        
        // Cadangan jika diletakkan di folder yang sama di Linux
        if (!file_exists($ytDlpPath)) {
            $ytDlpPath = __DIR__ . DIRECTORY_SEPARATOR . 'yt-dlp';
        }
    }

    // Command to fetch video information in JSON format (no playlist)
    // -J = dump JSON
    // --no-warnings = suppress warnings
    $cmd = escapeshellcmd($ytDlpPath) . ' -J --no-playlist --no-warnings ' . escapeshellarg($url) . ' 2>&1';

    // Execute the command
    $output = shell_exec($cmd);

    if ($output === null || trim($output) === '') {
        respondWithError('Failed to execute yt-dlp command. Atau output kosong. Periksa izin atau anti-virus.');
    }

    $videoData = json_decode($output, true);

    if ($videoData === null) {
        $cleanError = substr($output, 0, 500); // Send the raw stdout back so we know why yt-dlp failed
        respondWithError('yt-dlp error: ' . $cleanError);
    }

    // Jika hasil dari ytsearch (Spotify fallback), yt-dlp mengembalikan tipe playlist
    if (isset($videoData['_type']) && $videoData['_type'] === 'playlist' && !empty($videoData['entries'])) {
        $videoData = $videoData['entries'][0];
    }

    // Extract essential data needed for the frontend
    $response = [
        'success' => true,
        'title' => $videoData['title'] ?? 'Unknown Title',
        'thumbnail' => $videoData['thumbnail'] ?? '',
        'duration_string' => isset($videoData['duration_string']) ? $videoData['duration_string'] : (isset($videoData['duration']) ? gmdate("i:s", $videoData['duration']) : 'Unknown'),
        'extractor' => $videoData['extractor'] ?? 'Unknown',
        'formats' => []
    ];

    // Try to find playable/downloadable formats
    $formats = $videoData['formats'] ?? [];
    $filteredFormats = [];

    foreach ($formats as $f) {
        // Basic filter: we want formats with URLs
        if (isset($f['url']) && strpos($f['url'], 'http') === 0) {
            
            $height = isset($f['height']) ? $f['height'] : 0;
            $vcodec = $f['vcodec'] ?? 'none';
            $acodec = $f['acodec'] ?? 'none';
            
            // Catch formats without video (audio only) if we want pure audio
            if ($vcodec === 'none' && $acodec !== 'none') {
                $filteredFormats[] = [
                    'format_id' => $f['format_id'] ?? '',
                    'ext' => $f['ext'] ?? 'mp3',
                    'height' => 'Audio',
                    'url' => $f['url'],
                    'quality_label' => 'audio',
                    'format_note' => $f['format_note'] ?? 'Audio Only',
                    'abr' => $f['abr'] ?? 0
                ];
                continue; 
            }

            // Catch formats WITH BOTH video AND audio, OR high-res video (yang nantinya di-merge oleh proxy)
            if (($vcodec !== 'none' && $acodec !== 'none') || ($vcodec !== 'none' && $height >= 1080)) {
                // Kategori kualitas video antara normal, hq, uhq atau audio
                $qualityLabel = 'normal';
                if ($height >= 1080) {
                    $qualityLabel = 'hq';
                }
                if ($height >= 2160) {
                    $qualityLabel = 'uhq';
                }

                $filteredFormats[] = [
                    'format_id' => $f['format_id'] ?? '',
                    'ext' => $f['ext'] ?? 'mp4',
                    'height' => $height,
                    'url' => $f['url'], // Url is still provided but we might override action in JS
                    'quality_label' => $qualityLabel,
                    'format_note' => $f['format_note'] ?? ($height . 'p')
                ];
            }
        }
    }

    // Note: many sites (like youtube) separate video and audio for high quality.
    // yt-dlp's default requested formats or combined formats are usually easier to handle.
    // If the videoData has a direct 'url' attribute on the root, it's usually the best combined format.
    if (empty($filteredFormats) && isset($videoData['url'])) {
        $filteredFormats[] = [
            'format_id' => 'direct',
            'ext' => $videoData['ext'] ?? 'mp4',
            'height' => 'Source',
            'url' => $videoData['url'],
            'quality_label' => 'normal',
            'format_note' => 'Best Quality'
        ];
    }

    $response['formats'] = array_values($filteredFormats);

    // Also include the raw best URL if available easily
    if (isset($videoData['url'])) {
        $response['best_url'] = $videoData['url'];
    }

    echo json_encode($response);
} catch (Exception $e) {
    respondWithError('Server PHP Error: ' . $e->getMessage());
}
?>
