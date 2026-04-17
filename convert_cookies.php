<?php
$lines = file('cookies.txt', FILE_IGNORE_NEW_LINES | FILE_SKIP_EMPTY_LINES);
$youtube_kv = [];

foreach ($lines as $line) {
    if (strpos($line, '#') === 0) continue;
    
    $parts = explode("\t", $line);
    if (count($parts) < 7) continue;
    
    $domain = $parts[0];
    $name = trim($parts[5]);
    $value = trim($parts[6]);
    
    // Only extract cookies for youtube/google
    if (strpos($domain, 'youtube.com') !== false || strpos($domain, 'google.com') !== false) {
        // Cobalt's fromString splits by '; ' and then '='
        // We only want the core name=value pairs
        if ($name !== '' && $value !== '') {
            $youtube_kv[] = "$name=$value";
        }
    }
}

// Eliminate duplicate cookies (sometimes Netscape has both secure/non-secure)
$youtube_kv = array_unique($youtube_kv);

// Join all pairs into ONE long string separated by "; "
$cookieString = implode("; ", $youtube_kv);

$output = [
    'youtube' => [
        $cookieString
    ]
];

file_put_contents('cookies.json', json_encode($output, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES));
echo "Successfully merged " . count($youtube_kv) . " unique cookies into cookies.json\n";
?>
