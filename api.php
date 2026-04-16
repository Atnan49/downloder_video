<?php
header('Content-Type: application/json');

function respondWithError($message) {
    echo json_encode(['success' => false, 'error' => $message]);
    exit;
}

ini_set('display_errors', 0);
error_reporting(0);

try {
    $ip = $_SERVER['REMOTE_ADDR'] ?? 'unknown';
    $rlFile = '/tmp/rl_' . md5($ip) . '.json';
    if (!is_dir('/tmp')) {
        @mkdir('/tmp', 0777, true);
    }

    $now = time();
    $rlData = ['count' => 1, 'timestamp' => $now];

    if (file_exists($rlFile)) {
        $saved = json_decode(file_get_contents($rlFile), true);
        if ($saved && ($now - $saved['timestamp']) < 60) {
            if ($saved['count'] >= 10) {
                http_response_code(429);
                echo json_encode(['success' => false, 'error' => 'Too many requests']);
                exit;
            }
            $rlData['count'] = $saved['count'] + 1;
            $rlData['timestamp'] = $saved['timestamp'];
        }
    }
    file_put_contents($rlFile, json_encode($rlData));

    if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
        respondWithError('Invalid request method');
    }

    $input = json_decode(file_get_contents('php://input'), true);
    $url = isset($input['url']) ? trim($input['url']) : '';

    if (empty($url)) {
        respondWithError('URL is required');
    }

    if (!filter_var($url, FILTER_VALIDATE_URL)) {
        respondWithError('Invalid URL format');
    }

    $cacheFile = '/tmp/' . md5($url) . '.json';
    if (!is_dir('/tmp')) {
        @mkdir('/tmp', 0777, true);
    }
    if (file_exists($cacheFile) && (time() - filemtime($cacheFile) < 1800)) {
        echo file_get_contents($cacheFile);
        exit;
    }

    // Spotify ga bisa langsung, jadi scrape judul terus cari di YouTube
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

    // Deteksi path yt-dlp sesuai OS
    if (strtoupper(substr(PHP_OS, 0, 3)) === 'WIN') {
        $ytDlpPath = __DIR__ . DIRECTORY_SEPARATOR . 'yt-dlp.exe';
    } else {
        $ytDlpPath = '/usr/local/bin/yt-dlp';
        if (!file_exists($ytDlpPath)) {
            $ytDlpPath = __DIR__ . DIRECTORY_SEPARATOR . 'yt-dlp';
        }
    }

    $cmd = escapeshellcmd($ytDlpPath) . ' -J --no-playlist --no-warnings ' . escapeshellarg($url) . ' 2>&1';

    $output = shell_exec($cmd);

    if ($output === null || trim($output) === '') {
        respondWithError('Gagal menjalankan yt-dlp. Output kosong, cek izin atau antivirus.');
    }

    $videoData = json_decode($output, true);

    if ($videoData === null) {
        $cleanError = substr($output, 0, 500);
        respondWithError('yt-dlp error: ' . $cleanError);
    }

    // Kalau dari ytsearch (fallback Spotify), ambil entry pertama
    if (isset($videoData['_type']) && $videoData['_type'] === 'playlist' && !empty($videoData['entries'])) {
        $videoData = $videoData['entries'][0];
    }

    $response = [
        'success' => true,
        'title' => $videoData['title'] ?? 'Unknown Title',
        'thumbnail' => $videoData['thumbnail'] ?? '',
        'duration_string' => isset($videoData['duration_string']) ? $videoData['duration_string'] : (isset($videoData['duration']) ? gmdate("i:s", $videoData['duration']) : 'Unknown'),
        'extractor' => $videoData['extractor'] ?? 'Unknown',
        'formats' => []
    ];

    $formats = $videoData['formats'] ?? [];
    $filteredFormats = [];

    foreach ($formats as $f) {
        if (isset($f['url']) && strpos($f['url'], 'http') === 0) {
            
            $height = isset($f['height']) ? $f['height'] : 0;
            $vcodec = $f['vcodec'] ?? 'none';
            $acodec = $f['acodec'] ?? 'none';
            
            // Audio only
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

            // Video + audio, atau video HD yang nanti di-merge
            if (($vcodec !== 'none' && $acodec !== 'none') || ($vcodec !== 'none' && $height >= 1080)) {
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
                    'url' => $f['url'],
                    'quality_label' => $qualityLabel,
                    'format_note' => $f['format_note'] ?? ($height . 'p')
                ];
            }
        }
    }

    // Fallback ke direct URL kalau ga ada format yg cocok
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

    if (isset($videoData['url'])) {
        $response['best_url'] = $videoData['url'];
    }

    $finalJson = json_encode($response);
    file_put_contents($cacheFile, $finalJson);
    
    echo $finalJson;
} catch (Exception $e) {
    respondWithError('Server PHP Error: ' . $e->getMessage());
}
?>
