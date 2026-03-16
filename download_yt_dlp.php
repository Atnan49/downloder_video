<?php
$url = 'https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp.exe';
$file = 'yt-dlp.exe';

if (file_put_contents($file, file_get_contents($url))) {
    echo "Downloaded successfully to $file";
} else {
    echo "Failed to download";
}
?>
