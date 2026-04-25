<?php
header('Content-Type: application/json');

function respondWithError($message) {
    echo json_encode(['success' => false, 'error' => $message]);
    exit;
}

function getYtDlpPath() {
    if (strtoupper(substr(PHP_OS, 0, 3)) === 'WIN') {
        $winPath = __DIR__ . DIRECTORY_SEPARATOR . 'yt-dlp.exe';
        if (file_exists($winPath)) {
            return $winPath;
        }
        return 'yt-dlp.exe';
    }

    $linuxPath = '/usr/local/bin/yt-dlp';
    if (file_exists($linuxPath)) {
        return $linuxPath;
    }

    $localPath = __DIR__ . DIRECTORY_SEPARATOR . 'yt-dlp';
    if (file_exists($localPath)) {
        return $localPath;
    }

    return 'yt-dlp';
}

function formatDurationString($seconds) {
    if (!is_numeric($seconds) || $seconds < 0) {
        return '-';
    }

    $seconds = (int)$seconds;
    $hours = floor($seconds / 3600);
    $minutes = floor(($seconds % 3600) / 60);
    $secs = $seconds % 60;

    if ($hours > 0) {
        return sprintf('%d:%02d:%02d', $hours, $minutes, $secs);
    }

    return sprintf('%d:%02d', $minutes, $secs);
}

function extractMetadataWithYtDlp($url) {
    $ytDlpPath = getYtDlpPath();

    $baseFlags = '--no-warnings --no-playlist --skip-download --dump-single-json --extractor-args "youtube:player_client=ios,android,web"';
    $cookiesFile = __DIR__ . DIRECTORY_SEPARATOR . 'cookies.txt';
    if (file_exists($cookiesFile)) {
        $baseFlags .= ' --cookies ' . escapeshellarg($cookiesFile);
    }

    $stderrRedirect = (strtoupper(substr(PHP_OS, 0, 3)) === 'WIN') ? '2>NUL' : '2>/dev/null';
    $cmd = escapeshellarg($ytDlpPath) . ' ' . $baseFlags . ' ' . escapeshellarg($url) . ' ' . $stderrRedirect;
    $raw = shell_exec($cmd);

    if (!$raw) {
        throw new RuntimeException('Failed to read metadata from yt-dlp.');
    }

    $json = json_decode($raw, true);
    if (!is_array($json)) {
        if (preg_match('/\{[\s\S]*\}\s*$/', trim($raw), $m)) {
            $json = json_decode($m[0], true);
        }
    }

    if (!is_array($json)) {
        throw new RuntimeException('Invalid metadata payload from yt-dlp.');
    }

    $title = $json['title'] ?? ($json['fulltitle'] ?? 'Video Media');
    $thumbnail = $json['thumbnail'] ?? '';

    if (empty($thumbnail) && !empty($json['thumbnails']) && is_array($json['thumbnails'])) {
        $lastThumb = end($json['thumbnails']);
        if (is_array($lastThumb) && !empty($lastThumb['url'])) {
            $thumbnail = $lastThumb['url'];
        }
    }

    $durationString = $json['duration_string'] ?? formatDurationString($json['duration'] ?? null);

    return [
        'title' => $title,
        'thumbnail' => $thumbnail,
        'duration_string' => $durationString
    ];
}

ini_set('display_errors', 0);
error_reporting(0);

try {
    $ip = $_SERVER['REMOTE_ADDR'] ?? 'unknown';
    $tmpDir = sys_get_temp_dir();
    $rlFile = $tmpDir . DIRECTORY_SEPARATOR . 'rl_' . md5($ip) . '.json';
    if (!is_dir($tmpDir)) {
        @mkdir($tmpDir, 0777, true);
    }

    $now = time();
    $rlData = ['count' => 1, 'timestamp' => $now];

    if (file_exists($rlFile)) {
        $fh = fopen($rlFile, 'c+');
        if ($fh && flock($fh, LOCK_EX)) {
            $raw = stream_get_contents($fh);
            $saved = json_decode($raw, true);
            if ($saved && ($now - $saved['timestamp']) < 60) {
                if ($saved['count'] >= 10) {
                    flock($fh, LOCK_UN);
                    fclose($fh);
                    http_response_code(429);
                    echo json_encode(['success' => false, 'error' => 'Too many requests']);
                    exit;
                }
                $rlData['count'] = $saved['count'] + 1;
                $rlData['timestamp'] = $saved['timestamp'];
            }
            fseek($fh, 0);
            ftruncate($fh, 0);
            fwrite($fh, json_encode($rlData));
            flock($fh, LOCK_UN);
            fclose($fh);
        }
    } else {
        file_put_contents($rlFile, json_encode($rlData));
    }

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

    $meta = extractMetadataWithYtDlp($url);
    $title = $meta['title'];
    $thumbnail = $meta['thumbnail'];
    $durationString = $meta['duration_string'];

    $response = [
        'success' => true,
        'title' => $title,
        'thumbnail' => $thumbnail,
        'duration_string' => $durationString,
        'extractor' => 'yt-dlp',
        'picker' => null,
        'formats' => []
    ];

    $formats = [];

    // Fixed download options for yt-dlp flow.
    $qualities = [
        ['id' => 'uhq', 'label' => 'uhq', 'note' => 'Original Quality (max 4K, with audio)', 'height' => '2160', 'ext' => 'mp4'],
        ['id' => 'hq', 'label' => 'hq', 'note' => 'High Quality (1080p, with audio)', 'height' => '1080', 'ext' => 'mp4'],
        ['id' => 'normal', 'label' => 'normal', 'note' => 'Standard Quality (720p, with audio)', 'height' => '720', 'ext' => 'mp4'],
        ['id' => 'audio-m4a', 'label' => 'audio-m4a', 'note' => 'Audio M4A (AAC original stream)', 'height' => 'Audio', 'ext' => 'm4a'],
        ['id' => 'audio-flac', 'label' => 'audio-flac', 'note' => 'Audio FLAC (Lossless)', 'height' => 'Audio', 'ext' => 'flac'],
    ];

    foreach ($qualities as $q) {
        $formats[] = [
            'format_id' => $q['id'],
            'ext' => $q['ext'],
            'height' => $q['height'],
            'url' => 'download.php?quality=' . $q['id'] . '&url=' . urlencode($url),
            'quality_label' => $q['label'],
            'format_note' => $q['note']
        ];
    }

    $response['formats'] = $formats;

    echo json_encode($response);

} catch (Throwable $e) {
    respondWithError('Server PHP Error: ' . $e->getMessage());
}
?>
