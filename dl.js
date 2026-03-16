const https = require('https');
const fs = require('fs');

const file = fs.createWriteStream("yt-dlp.exe");
const url = "https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp.exe";

console.log("Starting download...");
https.get(url, { headers: { 'User-Agent': 'Mozilla/5.0' } }, (response) => {
    if (response.statusCode === 302 || response.statusCode === 301) {
        console.log("Following redirect to: " + response.headers.location);
        https.get(response.headers.location, { headers: { 'User-Agent': 'Mozilla/5.0' } }, (res) => {
            res.pipe(file);
            file.on('finish', () => {
                file.close();
                console.log("Download complete.");
            });
        }).on('error', (err) => {
            console.error("Error during redirect download: ", err.message);
        });
    } else {
        response.pipe(file);
        file.on('finish', () => {
            file.close();
            console.log("Download complete.");
        });
    }
}).on('error', (err) => {
    console.error("Error connecting: ", err.message);
});
