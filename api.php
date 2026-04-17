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
    // Environment awareness: Use internal proxy on server, public API on localhost
    $host = $_SERVER['HTTP_HOST'] ?? '';
    $isLocal = (strpos($host, 'localhost') !== false || strpos($host, '127.0.0.1') !== false || strpos($host, '192.168') !== false);
    
    // Internal path (Apache Proxy) is usually safer than raw port inside container
    $cobaltUrl = $isLocal ? 'https://tarifter.com/cobalt-api/' : 'http://localhost/cobalt-api/';

    $payload = [
        'url' => $url,
        'videoQuality' => '1080',
        'filenameStyle' => 'pretty',
        'alwaysProxy' => true
    ];

    $thumbnail = "";
    $picker = null;

    $ch = curl_init($cobaltUrl);
    curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
    curl_setopt($ch, CURLOPT_HTTPHEADER, [
        'Accept: application/json',
        'Content-Type: application/json',
        'User-Agent: TarifterBot/1.0 (https://tarifter.com)'
    ]);
    curl_setopt($ch, CURLOPT_POST, true);
    curl_setopt($ch, CURLOPT_POSTFIELDS, json_encode($payload));
    curl_setopt($ch, CURLOPT_TIMEOUT, 30);

    $cobaltResponse = curl_exec($ch);
    $httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
    $curlError = curl_error($ch);

    if ($cobaltResponse === false) {
        // Fallback or detailed error
        $cobaltData = ['status' => 'error', 'message' => 'Cobalt API connection failure: ' . $curlError];
    } else {
        $cobaltData = json_decode($cobaltResponse, true);
    }

    if ($cobaltResponse && $httpCode === 200) {
        if (isset($cobaltData['status'])) {
            if ($cobaltData['status'] === 'picker') {
                $picker = $cobaltData['picker'];
                $title = "Multi-media Content Found";
            } else if (isset($cobaltData['filename'])) {
                $title = $cobaltData['filename'];
            }
        }
    }

    // Fallback/Supplement with oEmbed if Cobalt didn't give a good title/thumb
    if ($title === "Video Media" || empty($thumbnail)) {
        if (strpos($url, 'youtube.com') !== false || strpos($url, 'youtu.be') !== false) {
            $oembed = @json_decode(@file_get_contents("https://www.youtube.com/oembed?url=" . urlencode($url) . "&format=json"), true);
            if ($oembed) {
                if ($title === "Video Media") $title = $oembed['title'] ?? $title;
                $thumbnail = $oembed['thumbnail_url'] ?? $thumbnail;
                $thumbnail = str_replace('hqdefault', 'maxresdefault', $thumbnail);
            }
        } else if (strpos($url, 'tiktok.com') !== false) {
            $oembed = @json_decode(@file_get_contents("https://www.tiktok.com/oembed?url=" . urlencode($url)), true);
            if ($oembed) {
                if ($title === "Video Media") $title = $oembed['title'] ?? $title;
                if (empty($thumbnail)) $thumbnail = $oembed['thumbnail_url'] ?? $thumbnail;
            }
        } else if (strpos($url, 'instagram.com') !== false) {
             // Instagram oEmbed is often restricted, but we can try basic scraping or just rely on Cobalt
        }
    }

    $response = [
        'success' => true,
        'title' => $title,
        'thumbnail' => $thumbnail,
        'duration_string' => '-',
        'extractor' => 'cobalt',
        'picker' => $picker,
        'formats' => []
    ];

    $formats = [];
    
    // Quality options for Cobalt
    $qualities = [
        ['id' => 'uhq', 'label' => 'uhq', 'note' => 'Ultra Quality (4K)', 'height' => '2160'],
        ['id' => 'hq', 'label' => 'hq', 'note' => 'High Quality (1080p)', 'height' => '1080'],
        ['id' => 'normal', 'label' => 'normal', 'note' => 'Standard (720p)', 'height' => '720'],
        ['id' => 'audio', 'label' => 'audio', 'note' => 'Audio (MP3)', 'height' => 'Audio'],
    ];

    foreach ($qualities as $q) {
        $formats[] = [
            'format_id' => $q['id'],
            'ext' => ($q['id'] === 'audio') ? 'mp3' : 'mp4',
            'height' => $q['height'],
            'url' => 'download.php?action=cobalt&quality=' . $q['id'] . '&url=' . urlencode($url),
            'quality_label' => $q['label'],
            'format_note' => $q['note']
        ];
    }

    $response['formats'] = $formats;

    echo json_encode($response);

} catch (Exception $e) {
    respondWithError('Server PHP Error: ' . $e->getMessage());
}
?>
