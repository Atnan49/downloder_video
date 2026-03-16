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
        // Basic filter: we want formats with URLs, ideally mp4
        if (isset($f['url']) && strpos($f['url'], 'http') === 0 && ($f['ext'] === 'mp4' || $f['vcodec'] !== 'none')) {
            
            $height = isset($f['height']) ? $f['height'] : 0;
            
            // Skip formats without video (audio only) if we want pure video
            if ($f['vcodec'] === 'none' && $f['acodec'] !== 'none') {
                continue; 
            }

            // Categorize roughly into normal, hq, uhq (this logic can be refined per platform)
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
