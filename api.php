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

    $title = "Video Media";
    $thumbnail = "";

    // Ambil metadata sederhana tanpa yt-dlp (anti-banned)
    if (strpos($url, 'youtube.com') !== false || strpos($url, 'youtu.be') !== false) {
        $oembed = @json_decode(@file_get_contents("https://www.youtube.com/oembed?url=" . urlencode($url) . "&format=json"), true);
        if ($oembed) {
            $title = $oembed['title'] ?? $title;
            // Ganti format thumbnail oembed maxresdefault jika tersedia
            $thumbnail = $oembed['thumbnail_url'] ?? $thumbnail;
            $thumbnail = str_replace('hqdefault', 'maxresdefault', $thumbnail);
        }
    } else if (strpos($url, 'tiktok.com') !== false) {
        $oembed = @json_decode(@file_get_contents("https://www.tiktok.com/oembed?url=" . urlencode($url)), true);
        if ($oembed) {
            $title = $oembed['title'] ?? $title;
            $thumbnail = $oembed['thumbnail_url'] ?? $thumbnail;
        }
    }

    $response = [
        'success' => true,
        'title' => $title,
        'thumbnail' => $thumbnail,
        'duration_string' => '-',
        'extractor' => 'cobalt',
        'formats' => []
    ];

    $formats = [];
    
    // Siapkan Opsi Download yang dialihkan melalui download.php ke API Cobalt
    $formats[] = [
        'format_id' => 'hq',
        'ext' => 'mp4',
        'height' => '1080',
        'url' => 'download.php?action=cobalt&quality=1080&url=' . urlencode($url),
        'quality_label' => 'hq',
        'format_note' => 'High Quality (1080p+)'
    ];

    $formats[] = [
        'format_id' => 'normal',
        'ext' => 'mp4',
        'height' => '720',
        'url' => 'download.php?action=cobalt&quality=720&url=' . urlencode($url),
        'quality_label' => 'normal',
        'format_note' => 'Standard (720p)'
    ];

    $formats[] = [
        'format_id' => 'audio',
        'ext' => 'mp3',
        'height' => 'Audio',
        'url' => 'download.php?action=cobalt&quality=audio&url=' . urlencode($url),
        'quality_label' => 'audio',
        'format_note' => 'Audio (MP3)'
    ];

    $response['formats'] = $formats;

    echo json_encode($response);
} catch (Exception $e) {
    respondWithError('Server PHP Error: ' . $e->getMessage());
}
?>
