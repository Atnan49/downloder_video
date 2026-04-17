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

    // Environment awareness: Use internal proxy on server, public API on localhost
    $host = $_SERVER['HTTP_HOST'] ?? '';
    // Detection for Railway/Production environment
    $isProduction = (strpos($host, 'tarifter.com') !== false);
    
    // Fallback chain for internal communication
    $targets = $isProduction 
        ? ['http://localhost/cobalt-api/', 'http://127.0.0.1:9001/', 'https://tarifter.com/cobalt-api/']
        : ['https://tarifter.com/cobalt-api/'];

    $vQuality = '1080';
    if ($quality === 'uhq') $vQuality = '2160';
    elseif ($quality === 'hq') $vQuality = '1080';
    elseif ($quality === 'normal') $vQuality = '720';
    elseif (is_numeric($quality)) $vQuality = $quality;

    $payload = [
        'url' => $url,
        'videoQuality' => $vQuality,
        'filenameStyle' => 'pretty',
        'alwaysProxy' => true
    ];

    if ($isAudio) {
        $payload['downloadMode'] = 'audio';
        $payload['audioFormat'] = 'mp3';
    }

    $response = false;
    $lastError = '';
    $finalUrl = '';

    foreach ($targets as $target) {
        $ch = curl_init($target);
        curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
        curl_setopt($ch, CURLOPT_POST, true);
        curl_setopt($ch, CURLOPT_POSTFIELDS, json_encode($payload));
        curl_setopt($ch, CURLOPT_HTTPHEADER, [
            'Accept: application/json',
            'Content-Type: application/json',
            'User-Agent: Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
        ]);
        curl_setopt($ch, CURLOPT_TIMEOUT, 60);
        curl_setopt($ch, CURLOPT_FOLLOWLOCATION, true);

        $response = curl_exec($ch);
        $httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
        $lastError = curl_error($ch);
        $finalUrl = $target;

        if ($response !== false && $httpCode === 200) {
            break;
        }
        curl_close($ch);
    }

    // Logging to /tmp for guaranteed Railway write access
    $logMsg = date('[Y-m-d H:i:s]') . " [Download] Tried: " . implode(', ', $targets) . " | Success Target: $finalUrl | Response: $response | Error: $lastError\n";
    @file_put_contents('/tmp/cobalt_debug.txt', $logMsg, FILE_APPEND);

    if ($response === false) {
        die("Connectivity Error: Could not reach Cobalt API after trying multiple targets. Last Error: $lastError");
    }

    $json = json_decode($response, true);

    if ($json && isset($json['url'])) {
        $downloadUrl = $json['url'];
        
        // Final sanity check: If it's a relative URL, prepend the domain
        if (strpos($downloadUrl, 'http') !== 0) {
            $downloadUrl = 'https://tarifter.com' . (strpos($downloadUrl, '/') === 0 ? '' : '/') . $downloadUrl;
        }

        // --- OPTION: Stream the file directly to avoid routing/proxy issues ---
        $fileName = 'Tarifter.com_Video.mp4';
        if (isset($json['filename'])) {
            $fileName = $json['filename'];
        }

        // Forward headers to the browser
        header('Content-Description: File Transfer');
        header('Content-Type: application/octet-stream');
        header('Content-Disposition: attachment; filename="' . $fileName . '"');
        header('Content-Transfer-Encoding: binary');
        header('Expires: 0');
        header('Cache-Control: must-revalidate');
        header('Pragma: public');

        // Use CURL again to fetch the stream to ensure internal port access works
        $sch = curl_init($downloadUrl);
        curl_setopt($sch, CURLOPT_RETURNTRANSFER, true); // Get content first to check size/errors
        curl_setopt($sch, CURLOPT_FOLLOWLOCATION, true);
        curl_setopt($sch, CURLOPT_HTTPHEADER, [
            'User-Agent: Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
        ]);
        
        $streamResponse = curl_exec($sch);
        $sInfo = curl_getinfo($sch);
        curl_close($sch);

        if ($streamResponse === false || strlen($streamResponse) < 1000) {
            header('Content-Type: text/plain');
            header('Content-Disposition: inline');
            die("Cobalt Tunnel Error: Response too small or failed. Size: " . strlen($streamResponse) . " bytes. Content: " . htmlspecialchars(substr($streamResponse, 0, 500)));
        }

        // Forward headers to the browser
        header('Content-Description: File Transfer');
        header('Content-Type: application/octet-stream');
        header('Content-Disposition: attachment; filename="' . $fileName . '"');
        header('Content-Transfer-Encoding: binary');
        header('Content-Length: ' . strlen($streamResponse));
        header('Expires: 0');
        header('Cache-Control: must-revalidate');
        header('Pragma: public');
        
        // Clean output buffers
        while (ob_get_level() > 0) ob_end_clean();
        
        echo $streamResponse;
        exit;
    } elseif ($json && isset($json['status']) && $json['status'] === 'picker') {
         // If it's a picker even in download action, redirect back to home with the URL
         header('Location: index.html?url=' . urlencode($url));
         exit;
    } elseif ($json && isset($json['error'])) {
        die("Cobalt Error: " . ($json['error']['code'] ?? 'Unknown error') . " - " . ($json['error']['context']['service'] ?? ''));
    } else {
        header('HTTP/1.1 500 Internal Server Error');
        die("Unexpected response from Cobalt (HTTP $httpCode): " . htmlspecialchars($response));
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
