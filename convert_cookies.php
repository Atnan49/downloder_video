<?php
$lines = file('cookies.txt', FILE_IGNORE_NEW_LINES | FILE_SKIP_EMPTY_LINES);
$youtube_cookies = [];

foreach ($lines as $line) {
    if (strpos($line, '#') === 0) continue;
    
    $parts = explode("\t", $line);
    if (count($parts) < 7) continue;
    
    $domain = $parts[0];
    $flag = $parts[1];
    $path = $parts[2];
    $secure = $parts[3] === 'TRUE' ? 'Secure' : '';
    $expiration = $parts[4];
    $name = $parts[5];
    $value = $parts[6];
    
    // Convert to cookie string format for Cobalt
    $cookieStr = "$name=$value; Domain=$domain; Path=$path";
    if ($expiration > 0) $cookieStr .= "; Expires=" . date('D, d M Y H:i:s T', $expiration);
    if ($secure) $cookieStr .= "; $secure";
    
    // Use for youtube if domain contains youtube or google
    if (strpos($domain, 'youtube.com') !== false || strpos($domain, 'google.com') !== false) {
        $youtube_cookies[] = $cookieStr;
    }
}

$output = [
    'youtube' => $youtube_cookies
];

file_put_contents('cookies.json', json_encode($output, JSON_PRETTY_PRINT));
echo "Converted " . count($youtube_cookies) . " cookies to cookies.json\n";
?>
