<?php
set_time_limit(0); // Unlimited time
ini_set('display_errors', 0);
error_reporting(0);

$action = isset($_GET['action']) ? trim($_GET['action']) : 'prepare';

// ===== SERVE MODE: Serve a prepared file for download =====
if ($action === 'serve') {
    $fileId = isset($_GET['fileId']) ? trim($_GET['fileId']) : '';
    
    // Validate fileId to prevent path traversal
    if (empty($fileId) || !preg_match('/^vid_[a-f0-9]+$/', $fileId)) {
        die("Invalid file ID");
    }
    
    $tempDir = __DIR__ . DIRECTORY_SEPARATOR . 'temp_videos';
    $tempFile = $tempDir . DIRECTORY_SEPARATOR . $fileId . '.mp4';
    
    if (file_exists($tempFile) && filesize($tempFile) > 0) {
        $quality = isset($_GET['quality']) ? trim($_GET['quality']) : 'hq';
        
        header('Content-Type: video/mp4');
        header('Content-Disposition: attachment; filename="video_' . $quality . '_proxy.mp4"');
        header('Content-Length: ' . filesize($tempFile));
        header('Cache-Control: no-cache, no-store, must-revalidate');
        
        // Clear output buffer
        while (ob_get_level() > 0) {
            ob_end_clean();
        }
        
        readfile($tempFile);
        
        // Cleanup after download
        @unlink($tempFile);
        exit;
    } else {
        die("File not found or expired.");
    }
}

// ===== PREPARE MODE: Process video and return file ID =====
$url = isset($_GET['url']) ? trim($_GET['url']) : '';
$quality = isset($_GET['quality']) ? trim($_GET['quality']) : 'hq';

if (empty($url)) {
    header('Content-Type: application/json');
    echo json_encode(['success' => false, 'error' => 'URL is missing']);
    exit;
}

// Basic URL validation
if (!filter_var($url, FILTER_VALIDATE_URL) && strpos($url, 'ytsearch') !== 0) {
    header('Content-Type: application/json');
    echo json_encode(['success' => false, 'error' => 'Invalid URL format']);
    exit;
}

$tempDir = __DIR__ . DIRECTORY_SEPARATOR . 'temp_videos';
if (!file_exists($tempDir)) {
    mkdir($tempDir, 0777, true);
}

// Cleanup old files (> 1 hour) to ensure server disk space remains safe
foreach (glob($tempDir . DIRECTORY_SEPARATOR . "*.mp4") as $file) {
    if (filemtime($file) < time() - 3600) {
        @unlink($file);
    }
}

// OS specifics for yt-dlp path
if (strtoupper(substr(PHP_OS, 0, 3)) === 'WIN') {
    $ytDlpPath = __DIR__ . DIRECTORY_SEPARATOR . 'yt-dlp.exe'; 
} else {
    $ytDlpPath = '/usr/local/bin/yt-dlp'; 
    if (!file_exists($ytDlpPath)) {
        $ytDlpPath = __DIR__ . DIRECTORY_SEPARATOR . 'yt-dlp';
    }
}

$fileId = uniqid('vid_');
$tempFile = $tempDir . DIRECTORY_SEPARATOR . $fileId . '.mp4';

// Format selection logic
// We use + to merge best video and best audio if available
$formatStr = ($quality === 'uhq') ? 'bestvideo[ext=mp4]+bestaudio[ext=m4a]/best' : 'bestvideo[height<=1080][ext=mp4]+bestaudio[ext=m4a]/best';

// OS specifics for FFmpeg path
if (strtoupper(substr(PHP_OS, 0, 3)) === 'WIN') {
    $ffmpegDir = __DIR__ . DIRECTORY_SEPARATOR . 'ffmpeg-master-latest-win64-gpl-shared' . DIRECTORY_SEPARATOR . 'ffmpeg-master-latest-win64-gpl-shared' . DIRECTORY_SEPARATOR . 'bin';
    $ffmpegFlag = '--ffmpeg-location ' . escapeshellarg($ffmpegDir);
} else {
    // Di Linux/Railway, FFmpeg sudah diinstal secara global (/usr/bin/ffmpeg)
    $ffmpegFlag = ''; // yt-dlp otomatis akan menemukan ffmpeg global
}

$cmd = escapeshellarg($ytDlpPath) . ' -f "' . $formatStr . '" ' . $ffmpegFlag . ' --merge-output-format mp4 -o ' . escapeshellarg($tempFile) . ' ' . escapeshellarg($url) . ' 2>&1';

// Execute
$output = shell_exec($cmd);

header('Content-Type: application/json');

if (file_exists($tempFile) && filesize($tempFile) > 0) {
    echo json_encode([
        'success' => true, 
        'fileId' => $fileId,
        'quality' => $quality,
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
