<?php
set_time_limit(0);
ini_set('display_errors', 0);
error_reporting(0);

$action = isset($_GET['action']) ? trim($_GET['action']) : 'prepare';

function isWindowsOs() {
    return strtoupper(substr(PHP_OS, 0, 3)) === 'WIN';
}

function getYtDlpPath() {
    if (isWindowsOs()) {
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

function getFfmpegFlag() {
    if (!isWindowsOs()) {
        return '';
    }

    $ffmpegDir = __DIR__ . DIRECTORY_SEPARATOR . 'ffmpeg-master-latest-win64-gpl-shared' . DIRECTORY_SEPARATOR . 'ffmpeg-master-latest-win64-gpl-shared' . DIRECTORY_SEPARATOR . 'bin';
    if (is_dir($ffmpegDir)) {
        return '--ffmpeg-location ' . escapeshellarg($ffmpegDir);
    }

    return '';
}

function getFfprobePath() {
    if (isWindowsOs()) {
        $ffprobePath = __DIR__ . DIRECTORY_SEPARATOR . 'ffmpeg-master-latest-win64-gpl-shared' . DIRECTORY_SEPARATOR . 'ffmpeg-master-latest-win64-gpl-shared' . DIRECTORY_SEPARATOR . 'bin' . DIRECTORY_SEPARATOR . 'ffprobe.exe';
        if (file_exists($ffprobePath)) {
            return $ffprobePath;
        }
        return 'ffprobe.exe';
    }

    if (file_exists('/usr/bin/ffprobe')) {
        return '/usr/bin/ffprobe';
    }
    if (file_exists('/usr/local/bin/ffprobe')) {
        return '/usr/local/bin/ffprobe';
    }

    return 'ffprobe';
}

function videoHasAudioStream($filePath) {
    $ffprobe = getFfprobePath();
    $stderrRedirect = isWindowsOs() ? '2>NUL' : '2>/dev/null';
    $cmd = escapeshellarg($ffprobe) . ' -v error -select_streams a:0 -show_entries stream=index -of csv=p=0 ' . escapeshellarg($filePath) . ' ' . $stderrRedirect;
    $out = trim((string) shell_exec($cmd));
    return $out !== '';
}

function normalizeQuality($quality) {
    $allowed = ['uhq', 'hq', 'normal', 'audio-m4a', 'audio-flac'];
    if (!in_array($quality, $allowed, true)) {
        return 'hq';
    }
    return $quality;
}

function getTempDir() {
    $tempDir = __DIR__ . DIRECTORY_SEPARATOR . 'temp_videos';
    if (!file_exists($tempDir)) {
        mkdir($tempDir, 0777, true);
    }
    return $tempDir;
}

function cleanupOldTempFiles($tempDir) {
    if (rand(1, 3) !== 1) {
        return;
    }

    foreach (glob($tempDir . DIRECTORY_SEPARATOR . 'vid_*.*') as $file) {
        if (file_exists($file) && filemtime($file) < time() - 3600) {
            @unlink($file);
        }
    }
}

function getExtFromQuality($quality) {
    if ($quality === 'audio-flac') {
        return 'flac';
    }
    if ($quality === 'audio-m4a') {
        return 'm4a';
    }
    return 'mp4';
}

function getFormatSelector($quality) {
    if ($quality === 'uhq') {
        return 'bestvideo[height<=2160][vcodec!=none]+bestaudio[acodec!=none]/best[height<=2160][vcodec!=none][acodec!=none]';
    }
    if ($quality === 'normal') {
        return 'bestvideo[height<=720][vcodec!=none]+bestaudio[acodec!=none]/best[height<=720][vcodec!=none][acodec!=none]';
    }
    if ($quality === 'audio-m4a' || $quality === 'audio-flac') {
        return 'bestaudio[acodec!=none]/best[acodec!=none]';
    }

    return 'bestvideo[height<=1080][vcodec!=none]+bestaudio[acodec!=none]/best[height<=1080][vcodec!=none][acodec!=none]';
}

if ($action === 'cobalt') {
    header('Content-Type: application/json');
    http_response_code(410);
    echo json_encode([
        'success' => false,
        'error' => 'Cobalt mode has been disabled. Please use yt-dlp prepare mode.'
    ]);
    exit;
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

        if ($ext === 'mp4') {
            $mime = 'video/mp4';
        } elseif ($ext === 'm4a') {
            $mime = 'audio/mp4';
        } elseif ($ext === 'flac') {
            $mime = 'audio/flac';
        } else {
            $mime = 'application/octet-stream';
        }
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

// --- PREPARE ACTION (yt-dlp only) ---
if ($action === 'prepare') {
    $url = isset($_GET['url']) ? trim($_GET['url']) : '';
    $quality = normalizeQuality(isset($_GET['quality']) ? trim($_GET['quality']) : 'hq');

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

    $tempDir = getTempDir();
    cleanupOldTempFiles($tempDir);
    $ytDlpPath = getYtDlpPath();

    $fileId = uniqid('vid_');
    $ext = getExtFromQuality($quality);

    $tempFile = $tempDir . DIRECTORY_SEPARATOR . $fileId . '.' . $ext;

    $formatStr = getFormatSelector($quality);
    $ffmpegFlag = getFfmpegFlag();

    if ($quality === 'audio-m4a') {
        $extraFlags = '--extract-audio --audio-format m4a --audio-quality 0';
    } elseif ($quality === 'audio-flac') {
        $extraFlags = '--extract-audio --audio-format flac --audio-quality 0';
    } else {
        // Video branch always merges with best available audio track.
        $extraFlags = '--merge-output-format mp4';
    }

    $clientBypass = '--extractor-args "youtube:player_client=ios,android,web" --no-warnings --no-playlist';
    $cookiesFile = __DIR__ . DIRECTORY_SEPARATOR . 'cookies.txt';

    if (file_exists($cookiesFile)) {
        $clientBypass .= ' --cookies ' . escapeshellarg($cookiesFile);
    }

    // Prepend FFmpeg bin directory to PATH so shared DLLs can be found
    $ffmpegBinDir = __DIR__ . DIRECTORY_SEPARATOR . 'ffmpeg-master-latest-win64-gpl-shared' . DIRECTORY_SEPARATOR . 'ffmpeg-master-latest-win64-gpl-shared' . DIRECTORY_SEPARATOR . 'bin';
    if (isWindowsOs() && is_dir($ffmpegBinDir)) {
        putenv('PATH=' . $ffmpegBinDir . ';' . getenv('PATH'));
    }

    $cmdParts = [
        escapeshellarg($ytDlpPath),
        $clientBypass,
        '-f ' . escapeshellarg($formatStr),
        $ffmpegFlag,
        $extraFlags,
        '-o ' . escapeshellarg($tempFile),
        escapeshellarg($url),
        '2>&1'
    ];

    $cmd = implode(' ', array_filter($cmdParts, function($part) {
        return $part !== '';
    }));

    $output = shell_exec($cmd);

    header('Content-Type: application/json');

    if (file_exists($tempFile) && filesize($tempFile) > 0) {
        if ($ext === 'mp4' && !videoHasAudioStream($tempFile)) {
            @unlink($tempFile);
            echo json_encode([
                'success' => false,
                'error' => 'Video has no audio stream. Please try a different quality or try again.',
                'logs' => $output
            ]);
            exit;
        }

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
            'error' => 'Failed to download and process video. Please ensure FFmpeg is installed on the server.',
            'logs' => $output
        ]);
    }
    exit;
}

header('Content-Type: application/json');
http_response_code(400);
echo json_encode([
    'success' => false,
    'error' => 'Invalid action.'
]);
