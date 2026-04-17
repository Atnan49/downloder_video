<?php
$lines = file('cookies.txt', FILE_IGNORE_NEW_LINES | FILE_SKIP_EMPTY_LINES);
$cookies_map = []; // Use a map to ensure one value per cookie name

// Essential YouTube cookies list
$essential = [
    'SID', 'HSID', 'SSID', 'APISID', 'SAPISID', 'LOGIN_INFO', 
    '__Secure-1PSID', '__Secure-3PSID', 'VISITOR_INFO1_LIVE', 
    '__Secure-1PSIDTS', '__Secure-3PSIDTS', 'YSC', 'PREF'
];

foreach ($lines as $line) {
    if (strpos($line, '#') === 0) continue;
    
    $parts = explode("\t", $line);
    if (count($parts) < 7) continue;
    
    $domain = $parts[0];
    $name = trim($parts[5]);
    $value = trim($parts[6]);
    
    // Check if it belongs to YouTube/Google
    if (strpos($domain, 'youtube.com') !== false || strpos($domain, 'google.com') !== false) {
        if (in_array($name, $essential)) {
            // Overwrite earlier entries to keep the most recent one for each name
            $cookies_map[$name] = $value; 
        }
    }
}

$youtube_kv = [];
foreach ($cookies_map as $name => $value) {
    $youtube_kv[] = "$name=$value";
}

// Join all pairs into ONE long string separated by "; "
$cookieString = implode("; ", $youtube_kv);

$output = [
    'youtube' => [
        $cookieString
    ]
];

file_put_contents('cookies.json', json_encode($output, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES));
echo "Successfully refined cookies. Total unique essential cookies: " . count($youtube_kv) . "\n";
?>
