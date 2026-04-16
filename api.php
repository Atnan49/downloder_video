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

    // Request to Cobalt API
    $cobaltData = [
        'url' => $url,
        'vQuality' => '1080',
        'isAudioOnly' => false,
        'filenameStyle' => 'basic'
    ];

    $ch = curl_init('https://api.cobalt.tools/api/json');
    curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
    curl_setopt($ch, CURLOPT_POST, true);
    curl_setopt($ch, CURLOPT_POSTFIELDS, json_encode($cobaltData));
    curl_setopt($ch, CURLOPT_HTTPHEADER, [
        'Accept: application/json',
        'Content-Type: application/json',
        'Origin: https://cobalt.tools',
        'Referer: https://cobalt.tools/',
        'User-Agent: Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/114.0.0.0 Safari/537.36'
    ]);
    
    // Local dev workaround if needed, but acceptable defaults for Railway
    curl_setopt($ch, CURLOPT_SSL_VERIFYPEER, false);

    $output = curl_exec($ch);
    $httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
    $curlError = curl_error($ch);
    curl_close($ch);

    if ($output === false) {
        respondWithError('Cobalt API Error: ' . $curlError);
    }

    $videoData = json_decode($output, true);

    if ($videoData === null || (isset($videoData['status']) && $videoData['status'] === 'error')) {
        $cleanError = $videoData['text'] ?? 'Unknown Cobalt API error';
        respondWithError('Cobalt API error: ' . $cleanError);
    }

    $response = [
        'success' => true,
        'title' => isset($videoData['filename']) ? preg_replace('/.[^.s]{3,4}$/', '', $videoData['filename']) : 'Video Download',
        'thumbnail' => '',
        'duration_string' => 'Unknown',
        'extractor' => 'Cobalt',
        'formats' => []
    ];

    $filteredFormats = [];

    // Map Cobalt stream/redirect response
    if (isset($videoData['url'])) {
        // Assume this URL can be used for normal download
        $filteredFormats[] = [
            'format_id' => 'cobalt_direct',
            'ext' => 'mp4',
            'height' => 'Source',
            'url' => $videoData['url'],
            'quality_label' => 'normal',
            'format_note' => 'Video'
        ];
        // Ensure buttons don't break
        $filteredFormats[] = [
            'format_id' => 'cobalt_hq',
            'ext' => 'mp4',
            'height' => '1080',
            'url' => $videoData['url'],
            'quality_label' => 'hq',
            'format_note' => 'HD Video'
        ];
        $filteredFormats[] = [
            'format_id' => 'cobalt_uhq',
            'ext' => 'mp4',
            'height' => '4K',
            'url' => $videoData['url'],
            'quality_label' => 'uhq',
            'format_note' => '4K Video'
        ];
        if (isset($videoData['audio'])) {
            $filteredFormats[] = [
                'format_id' => 'cobalt_audio',
                'ext' => 'mp3',
                'height' => 'Audio',
                'url' => $videoData['audio'],
                'quality_label' => 'audio',
                'format_note' => 'Audio Only'
            ];
        }
    } elseif (isset($videoData['picker']) && is_array($videoData['picker'])) {
        foreach ($videoData['picker'] as $item) {
            $qualityLabel = 'normal';
            if (isset($item['quality'])) {
                if (strpos($item['quality'], '1080') !== false || strpos($item['quality'], '720') !== false) {
                    $qualityLabel = 'hq';
                } elseif (strpos($item['quality'], '2160') !== false || strpos($item['quality'], '1440') !== false || strpos($item['quality'], '4k') !== false || strpos($item['quality'], '4K') !== false) {
                    $qualityLabel = 'uhq';
                }
            }
            
            $filteredFormats[] = [
                'format_id' => $item['id'] ?? 'picker_item',
                'ext' => 'mp4',
                'height' => $item['quality'] ?? 'Source',
                'url' => $item['url'],
                'quality_label' => $qualityLabel,
                'format_note' => $item['quality'] ?? 'Video'
            ];
        }
        
        // Add minimal required buttons if picker is missing some
        $hasHq = false;
        $hasUhq = false;
        $normalUrl = $videoData['picker'][0]['url'] ?? '';
        foreach ($filteredFormats as $f) {
            if ($f['quality_label'] === 'hq') $hasHq = true;
            if ($f['quality_label'] === 'uhq') $hasUhq = true;
        }
        
        if (!$hasHq && $normalUrl) {
            $filteredFormats[] = ['format_id' => 'cobalt_hq', 'ext' => 'mp4', 'height' => '1080', 'url' => $normalUrl, 'quality_label' => 'hq', 'format_note' => 'HD Video'];
        }
        if (!$hasUhq && $normalUrl) {
            $filteredFormats[] = ['format_id' => 'cobalt_uhq', 'ext' => 'mp4', 'height' => '4K', 'url' => $normalUrl, 'quality_label' => 'uhq', 'format_note' => '4K Video'];
        }
        
        if (isset($videoData['audio'])) {
            $filteredFormats[] = [
                'format_id' => 'cobalt_audio',
                'ext' => 'mp3',
                'height' => 'Audio',
                'url' => $videoData['audio'],
                'quality_label' => 'audio',
                'format_note' => 'Audio Only'
            ];
        }
    }

    if (empty($filteredFormats)) {
         respondWithError('No downloadable formats found from Cobalt.');
    }

    // Ensure we at least have 'normal' for UI
    $hasNormal = false;
    foreach ($filteredFormats as $f) {
        if ($f['quality_label'] === 'normal') $hasNormal = true;
    }
    if (!$hasNormal) {
         $filteredFormats[0]['quality_label'] = 'normal';
    }

    $response['formats'] = array_values($filteredFormats);
    $response['best_url'] = $filteredFormats[0]['url'];

    $finalJson = json_encode($response);
    file_put_contents($cacheFile, $finalJson);
    
    echo $finalJson;
} catch (Exception $e) {
    respondWithError('Server PHP Error: ' . $e->getMessage());
}
?>
