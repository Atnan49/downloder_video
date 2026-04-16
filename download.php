<?php
set_time_limit(0);
ini_set('display_errors', 0);
error_reporting(0);

$action = isset($_GET['action']) ? trim($_GET['action']) : 'prepare';

// Kirim file yang udah siap ke user
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
        
        $mime = ($ext === 'mp4') ? 'video/mp4' : 'audio/' . $ext;
        header('Content-Type: ' . $mime);
        header('Content-Disposition: attachment; filename="t_downloader_' . $quality . '.' . $ext . '"');
        header('Content-Length: ' . filesize($tempFile));
        header('Cache-Control: no-cache, no-store, must-revalidate');
        
        while (ob_get_level() > 0) {
            ob_end_clean();
        }
        
        // Chunked file output untuk menghemat RAM (Memory) saat melayani file besar (misal 1GB)
        $chunkSize = 8 * 1024 * 1024; // 8 MB per chunk
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

// Proses video dan return file ID
$url = isset($_GET['url']) ? trim($_GET['url']) : '';
$quality = isset($_GET['quality']) ? trim($_GET['quality']) : 'hq';

if (empty($url)) {
    header('Content-Type: application/json');
    echo json_encode(['success' => false, 'error' => 'URL is missing']);
    exit;
}

// Validasi URL Strict (Hanya izinkan HTTP dan HTTPS) untuk mencegah shell/command injection
$urlIsHttp = preg_match('#^https?://#i', $url);
if (!$urlIsHttp && strpos($url, 'ytsearch') !== 0) {
    header('Content-Type: application/json');
    echo json_encode(['success' => false, 'error' => 'Invalid URL protocol. Only HTTP and HTTPS are allowed.']);
    exit;
}

if (!filter_var($url, FILTER_VALIDATE_URL) && strpos($url, 'ytsearch') !== 0) {
    header('Content-Type: application/json');
    echo json_encode(['success' => false, 'error' => 'Invalid URL format']);
    exit;
}

$tempDir = __DIR__ . DIRECTORY_SEPARATOR . 'temp_videos';
if (!file_exists($tempDir)) {
    mkdir($tempDir, 0777, true);
}

// Jalankan proses bersih-bersih secara acak (probabilitas 10%)
// Biar disk dan CPU server gak ngos-ngosan saat trafik tinggi
if (rand(1, 10) === 1) {
    // HANYA hapus file yang berawalan "vid_" (Sangat Aman)
    foreach (glob($tempDir . DIRECTORY_SEPARATOR . "vid_*.*") as $file) {
        if (file_exists($file) && filemtime($file) < time() - 3600) {
            @unlink($file);
        }
    }
}

// Path yt-dlp sesuai OS
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

// Pilih format terbaik sesuai kualitas
if ($quality === 'uhq') {
    $formatStr = 'bestvideo[height<=2160][ext=mp4]+bestaudio[ext=m4a]/bestvideo[height<=2160]+bestaudio/best';
} elseif (strpos($quality, 'audio') === 0) {
    $formatStr = 'bestaudio/best';
} elseif ($quality === 'normal') {
    $formatStr = 'bestvideo[height<=720][ext=mp4]+bestaudio[ext=m4a]/bestvideo[height<=720]+bestaudio/best';
} else {
    $formatStr = 'bestvideo[height<=1080][ext=mp4]+bestaudio[ext=m4a]/bestvideo[height<=1080]+bestaudio/best';
}

// Path FFmpeg sesuai OS
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

$clientBypass = '--extractor-args "youtube:player_client=web,default" --no-warnings';
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
?>
