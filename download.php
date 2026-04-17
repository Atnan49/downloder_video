<?php
set_time_limit(0);
ini_set('display_errors', 0);
error_reporting(0);

$action = isset($_GET['action']) ? trim($_GET['action']) : 'prepare';

// --- COBALT API PROXY BLOCK ---
if ($action === 'cobalt') {
    $url = isset($_GET['url']) ? trim($_GET['url']) : '';
    $quality = isset($_GET['quality']) ? trim($_GET['quality']) : '1080';

    if (empty($url)) {
        die("URL is empty.");
    }

    $isAudio = (strpos($quality, 'audio') !== false);

    // Quality mapping for Cobalt
    $vQuality = '1080';
    if ($quality === 'uhq') $vQuality = '2160';
    elseif ($quality === 'hq') $vQuality = '1080';
    elseif ($quality === 'normal') $vQuality = '720';
    elseif (is_numeric($quality)) $vQuality = $quality;

    $payload = [
        'url' => $url,
        'videoQuality' => $vQuality,
        'downloadMode' => $isAudio ? 'audio' : 'video',
        'filenameStyle' => 'pretty',
        'isAudioOnly' => $isAudio
    ];

    $ch = curl_init('http://127.0.0.1:9001/');
    curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
    curl_setopt($ch, CURLOPT_POST, true);
    curl_setopt($ch, CURLOPT_POSTFIELDS, json_encode($payload));
    curl_setopt($ch, CURLOPT_HTTPHEADER, [
        'Accept: application/json',
        'Content-Type: application/json'
    ]);
    curl_setopt($ch, CURLOPT_TIMEOUT, 30);

    $httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);

    $json = json_decode($response, true);

    if ($json && isset($json['status']) && in_array($json['status'], ['tunnel', 'redirect', 'picker']) && isset($json['url'])) {
        header('Location: ' . $json['url']);
        exit;
    } elseif ($json && isset($json['error'])) {
        die("Cobalt Error: " . ($json['error']['code'] ?? 'Unknown error'));
    } elseif ($json && isset($json['url'])) {
        header('Location: ' . $json['url']);
        exit;
    } else {
        header('HTTP/1.1 500 Internal Server Error');
        die("Unexpected response from Cobalt: " . htmlspecialchars($response));
    }
}

// --- SERVE ACTION ---
if ($action === 'serve') {
    $fileId = isset($_GET['fileId']) ? trim($_GET['fileId']) : '';

    if (empty($fileId) || !preg_match('/^vid_[a-f0-9]+$/', $fileId)) {
        die("Invalid file ID");
    }

    $tempDir = __DIR__ . DIRECTORY_SEPARATOR . 'temp_videos';
    $files = glob($tempDir . DIRECTORY_SEPARATOR . $fileId . '.*');

    if (!empty($files) && filesize($files[0]) > 0) {
        $tempFile = $files[0];
        $ext = pathinfo($tempFile, PATHINFO_EXTENSION);
        $quality = isset($_GET['quality']) ? trim($_GET['quality']) : 'hq';
        $title = isset($_GET['title']) ? trim($_GET['title']) : 'Video';

        $safeTitle = preg_replace('/[^a-zA-Z0-9_\-\s]/', '', $title);
        $safeTitle = trim(substr($safeTitle, 0, 40));
        $safeTitle = preg_replace('/\s+/', '_', $safeTitle);

        $mime = ($ext === 'mp4') ? 'video/mp4' : 'audio/' . $ext;
        header('Content-Type: ' . $mime);
        header('Content-Disposition: attachment; filename="Tarifter.com_' . $safeTitle . '_' . $quality . '.' . $ext . '"');
        header('Content-Length: ' . filesize($tempFile));
        header('Cache-Control: no-cache, no-store, must-revalidate');

        while (ob_get_level() > 0) {
            ob_end_clean();
        }

        $chunkSize = 8 * 1024 * 1024;
        $handle = fopen($tempFile, 'rb');
        if ($handle === false) {
            die("Error opening file");
        }
        while (!feof($handle)) {
            echo fread($handle, $chunkSize);
            flush();
        }
        fclose($handle);

        @unlink($tempFile);
        exit;
    } else {
        die("File not found or expired.");
    }
}

// --- PREPARE ACTION (Using yt-dlp fallback) ---
if ($action === 'prepare') {
    $url = isset($_GET['url']) ? trim($_GET['url']) : '';
    $quality = isset($_GET['quality']) ? trim($_GET['quality']) : 'hq';

    if (empty($url)) {
        header('Content-Type: application/json');
        echo json_encode(['success' => false, 'error' => 'URL is missing']);
        exit;
    }

    $urlIsHttp = preg_match('#^https?://#i', $url);
    if (!$urlIsHttp && strpos($url, 'ytsearch') !== 0) {
        header('Content-Type: application/json');
        echo json_encode(['success' => false, 'error' => 'Invalid URL protocol. Only HTTP and HTTPS are allowed.']);
        exit;
    }

    $tempDir = __DIR__ . DIRECTORY_SEPARATOR . 'temp_videos';
    if (!file_exists($tempDir)) {
        mkdir($tempDir, 0777, true);
    }

    if (rand(1, 10) === 1) {
        foreach (glob($tempDir . DIRECTORY_SEPARATOR . "vid_*.*") as $file) {
            if (file_exists($file) && filemtime($file) < time() - 3600) {
                @unlink($file);
            }
        }
    }

    if (strtoupper(substr(PHP_OS, 0, 3)) === 'WIN') {
        $ytDlpPath = __DIR__ . DIRECTORY_SEPARATOR . 'yt-dlp.exe';
    } else {
        $ytDlpPath = '/usr/local/bin/yt-dlp';
        if (!file_exists($ytDlpPath)) {
            $ytDlpPath = __DIR__ . DIRECTORY_SEPARATOR . 'yt-dlp';
        }
    }

    $fileId = uniqid('vid_');
    if (strpos($quality, 'audio') === 0) {
        if ($quality === 'audio-flac') $ext = 'flac';
        elseif ($quality === 'audio-m4a') $ext = 'm4a';
        else $ext = 'mp3';
    } else {
        $ext = 'mp4';
    }

    $tempFile = $tempDir . DIRECTORY_SEPARATOR . $fileId . '.' . $ext;

    if ($quality === 'uhq') {
        $formatStr = 'bestvideo[height<=2160][ext=mp4]+bestaudio[ext=m4a]/bestvideo[height<=2160]+bestaudio/best';
    } elseif (strpos($quality, 'audio') === 0) {
        $formatStr = 'bestaudio/best';
    } elseif ($quality === 'normal') {
        $formatStr = 'bestvideo[height<=720][ext=mp4]+bestaudio[ext=m4a]/bestvideo[height<=720]+bestaudio/best';
    } else {
        $formatStr = 'bestvideo[height<=1080][ext=mp4]+bestaudio[ext=m4a]/bestvideo[height<=1080]+bestaudio/best';
    }

    if (strtoupper(substr(PHP_OS, 0, 3)) === 'WIN') {
        $ffmpegDir = __DIR__ . DIRECTORY_SEPARATOR . 'ffmpeg-master-latest-win64-gpl-shared' . DIRECTORY_SEPARATOR . 'ffmpeg-master-latest-win64-gpl-shared' . DIRECTORY_SEPARATOR . 'bin';
        $ffmpegFlag = '--ffmpeg-location ' . escapeshellarg($ffmpegDir);
    } else {
        $ffmpegFlag = '';
    }

    if (strpos($quality, 'audio') === 0) {
        $extraFlags = '--extract-audio --audio-format ' . $ext;
    } else {
        $extraFlags = '--merge-output-format mp4';
    }

    $clientBypass = '--extractor-args "youtube:player_client=ios,android,web" --no-warnings';
    $cookiesFile = __DIR__ . DIRECTORY_SEPARATOR . 'cookies.txt';

    if (file_exists($cookiesFile)) {
        $clientBypass .= ' --cookies ' . escapeshellarg($cookiesFile);
    } else if (strtoupper(substr(PHP_OS, 0, 3)) === 'WIN') {
        $clientBypass .= ' --cookies-from-browser chrome';
    }

    $cmd = escapeshellarg($ytDlpPath) . ' ' . $clientBypass . ' -f "' . $formatStr . '" ' . $ffmpegFlag . ' ' . $extraFlags . ' -o ' . escapeshellarg($tempFile) . ' ' . escapeshellarg($url) . ' 2>&1';
    $output = shell_exec($cmd);

    header('Content-Type: application/json');

    if (file_exists($tempFile) && filesize($tempFile) > 0) {
        echo json_encode([
            'success' => true,
            'fileId' => $fileId,
            'quality' => $quality,
            'ext' => $ext,
            'fileSize' => filesize($tempFile)
        ]);
    } else {
        echo json_encode([
            'success' => false,
            'error' => 'Gagal mengunduh dan memproses video. Pastikan server memiliki FFmpeg terinstall.',
            'logs' => $output
        ]);
    }
    exit;
}
