document.addEventListener('DOMContentLoaded', () => {
    const form = document.getElementById('downloadForm');
    const urlInput = document.getElementById('videoUrl');
    const downloadBtn = document.getElementById('downloadBtn');
    const btnText = document.querySelector('.btn-text');
    const btnIcon = document.querySelector('#downloadBtn .fa-arrow-right');
    const spinner = document.getElementById('loadingSpinner');
    const statusMessage = document.getElementById('statusMessage');

    const resultSection = document.getElementById('resultSection');
    const dlOptions = document.querySelectorAll('.dl-option');
    
    const adModal = document.getElementById('adModal');
    const closeAdModal = document.getElementById('closeAdModal');
    const skipAdBtn = document.getElementById('skipAdBtn');

    let skipTimer;
    let secondsLeft = 5;

    form.addEventListener('submit', (e) => {
        e.preventDefault();
        
        const url = urlInput.value.trim();
        
        if (!url) {
            showStatus('Please enter a valid video URL!', '#ff4444');
            return;
        }

        const isValidUrl = /^(https?:\/\/)?([\w\d\-_]+\.+[A-Za-z]{2,})+\/?/.test(url);
        if (!isValidUrl) {
            showStatus('Invalid URL format. Please check your link.', '#ff4444');
            return;
        }

        setLoadingState(true);
        resultSection.classList.add('hidden');
        showStatus('Analyzing video link...', '#00f2fe');

        fetch('api.php', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ url: url })
        })
        .then(response => response.json())
        .then(data => {
            setLoadingState(false);
            if (data.success) {
                showStatus('Video found!', '#38ef7d');
                window.currentVideoOriginalUrl = url;
                displayVideoData(data);
                resultSection.classList.remove('hidden');
            } else {
                showStatus('Error: ' + (data.error || 'An unknown error occurred'), '#ff4444');
            }
        })
        .catch(error => {
            setLoadingState(false);
            showStatus('Failed to connect to server.', '#ff4444');
            console.error('Error:', error);
        });
    });

    function displayVideoData(data) {
        document.getElementById('videoTitle').textContent = data.title;
        document.getElementById('videoDuration').textContent = 'Duration: ' + (data.duration_string || 'N/A');
        
        const thumbContainer = document.querySelector('.thumbnail-placeholder');
        if (data.thumbnail) {
            thumbContainer.innerHTML = `<img src="${data.thumbnail}" alt="Thumbnail" style="width:100%; height:100%; object-fit:cover; border-radius:8px;">`;
        } else {
            thumbContainer.innerHTML = '<i class="fa-solid fa-video"></i>';
        }

        window.videoDownloadFormats = data.formats || [];
        window.videoDirectUrl = data.best_url || '';

        renderDownloadOptions(window.videoDownloadFormats, window.videoDirectUrl);
    }

    function renderDownloadOptions(formats, bestUrl) {
        const optionsContainer = document.querySelector('.download-options');
        optionsContainer.innerHTML = '';

        if (!formats || formats.length === 0) {
            if (bestUrl) {
                optionsContainer.innerHTML = `
                    <button class="dl-option normal-btn" data-quality="normal">
                        <i class="fa-solid fa-download"></i> Download Video (Default Quality)
                    </button>
                `;
            } else {
                optionsContainer.innerHTML = '<p class="text-center">No download links found.</p>';
            }
        } else {
            const hasNormal = formats.some(f => f.quality_label === 'normal');
            const hasHq = formats.some(f => f.quality_label === 'hq');
            const hasUhq = formats.some(f => f.quality_label === 'uhq');

            if (hasNormal || bestUrl) {
                optionsContainer.innerHTML += `
                    <button class="dl-option normal-btn" data-quality="normal">
                        <i class="fa-solid fa-download"></i> Standard Quality (SD)
                    </button>
                `;
            }

            if (hasHq) {
                optionsContainer.innerHTML += `
                    <button class="dl-option hq-btn" data-quality="hq">
                        <i class="fa-solid fa-crown"></i> High Quality (HD) - Watch Ad
                    </button>
                `;
            }

            if (hasUhq) {
                 optionsContainer.innerHTML += `
                    <button class="dl-option uhq-btn" data-quality="uhq">
                        <i class="fa-solid fa-gem"></i> Ultra Quality (4K) - Watch Ad
                    </button>
                `;
            }

            const hasAudio = formats.some(f => f.quality_label === 'audio');
            if (hasAudio) {
                 optionsContainer.innerHTML += `
                    <button class="dl-option audio-btn" data-quality="audio">
                        <i class="fa-solid fa-music"></i> Download MP3
                    </button>
                    <button class="dl-option audio-btn m4a-btn" data-quality="audio-m4a" style="background: linear-gradient(135deg, #FF416C, #FF4B2B); margin-top: 5px;">
                        <i class="fa-solid fa-headphones"></i> Download M4A (Original)
                    </button>
                    <button class="dl-option audio-btn flac-btn" data-quality="audio-flac" style="background: linear-gradient(135deg, #1f4037, #99f2c8); margin-top: 5px; color: #000;">
                        <i class="fa-solid fa-compact-disc"></i> Download FLAC (Lossless) - Watch Ad
                    </button>
                `;
            }
        }

        attachDownloadListeners();
    }


    let targetDownloadUrl = '';
    let targetDownloadQuality = 'hq';

    function attachDownloadListeners() {
        const dlOptions = document.querySelectorAll('.dl-option');
        dlOptions.forEach(btn => {
            const newBtn = btn.cloneNode(true);
            btn.parentNode.replaceChild(newBtn, btn);
            
            newBtn.addEventListener('click', (e) => {
                const quality = e.currentTarget.dataset.quality;

                let urlToDownload = window.videoDirectUrl;
                let downloadExt = 'mp4';

                if (window.videoDownloadFormats && window.videoDownloadFormats.length > 0) {
                    if (quality.startsWith('audio')) {
                        const audioFormats = window.videoDownloadFormats.filter(f => f.quality_label === 'audio');
                        audioFormats.sort((a, b) => (a.abr || 0) - (b.abr || 0));
                        const match = audioFormats[audioFormats.length - 1] || audioFormats[0];
                        urlToDownload = match.url;
                        downloadExt = quality.split('-')[1] || 'mp3';
                    } else {
                        const match = window.videoDownloadFormats.find(f => f.quality_label === quality) 
                                      || window.videoDownloadFormats.find(f => f.quality_label === 'normal') 
                                      || window.videoDownloadFormats[0];
                        urlToDownload = match.url;
                        downloadExt = match.ext || 'mp4';
                    }
                }

                if (!urlToDownload) {
                    alert('Download link not available for this quality, or video has not been analyzed yet.');
                    return;
                }
                
                targetDownloadUrl = `download.php?url=${encodeURIComponent(window.currentVideoOriginalUrl)}&quality=${quality}`;
                targetDownloadQuality = quality;

                if (quality === 'normal' || quality === 'audio' || quality === 'audio-m4a') {
                     startDownload(targetDownloadUrl, quality, downloadExt);
                } else {
                     showAdModal();
                }
            });
        });
    }

    attachDownloadListeners();

    function startDownload(url, quality, ext = 'mp4') {
        if (url.startsWith('download.php')) {
            showStatus('⏳ Processing and merging video on server...', '#f39c12');
            
            const pModal = document.getElementById('processingModal');
            const processingState = document.getElementById('processingState');
            const doneState = document.getElementById('doneState');
            const errorState = document.getElementById('errorState');
            const progressFill = document.getElementById('progressBarFill');
            const timerText = document.getElementById('processingTimer');

            if (processingState) processingState.classList.remove('hidden');
            if (doneState) doneState.classList.add('hidden');
            if (errorState) errorState.classList.add('hidden');
            if (progressFill) progressFill.style.width = '0%';
            if (pModal) pModal.classList.remove('hidden');

            let progress = 0;
            const progressInterval = setInterval(() => {
                if (progress < 90) {
                    progress += Math.random() * 3;
                    if (progress > 90) progress = 90;
                    if (progressFill) progressFill.style.width = progress + '%';
                }
            }, 500);

            let elapsed = 0;
            const timerInterval = setInterval(() => {
                elapsed++;
                const mins = Math.floor(elapsed / 60);
                const secs = elapsed % 60;
                if (timerText) {
                    timerText.textContent = `Processing... ${mins > 0 ? mins + 'm ' : ''}${secs}s`;
                }
            }, 1000);

            fetch(url + '&action=prepare')
                .then(response => response.json())
                .then(data => {
                    clearInterval(progressInterval);
                    clearInterval(timerInterval);

                    if (data.success) {
                        if (progressFill) progressFill.style.width = '100%';
                        
                        setTimeout(() => {
                            if (processingState) processingState.classList.add('hidden');
                            if (doneState) doneState.classList.remove('hidden');

                            const finalBtn = document.getElementById('finalDownloadBtn');
                            if (finalBtn) {
                                const serveUrl = `download.php?action=serve&fileId=${encodeURIComponent(data.fileId)}&quality=${encodeURIComponent(data.quality)}`;
                                finalBtn.href = serveUrl;
                                finalBtn.setAttribute('download', 't_downloader_' + data.quality + '.' + (data.ext || 'mp4'));
                            }

                            showStatus('✅ Video is ready to download!', '#38ef7d');
                        }, 500);
                    } else {
                        if (processingState) processingState.classList.add('hidden');
                        if (errorState) errorState.classList.remove('hidden');
                        const errMsg = document.getElementById('errorMessage');
                        if (errMsg) errMsg.textContent = data.error || 'An error occurred while processing the video.';
                        showStatus('❌ Failed to process video.', '#ff4444');
                    }
                })
                .catch(error => {
                    clearInterval(progressInterval);
                    clearInterval(timerInterval);
                    
                    if (processingState) processingState.classList.add('hidden');
                    if (errorState) errorState.classList.remove('hidden');
                    showStatus('❌ Failed to connect to server.', '#ff4444');
                    console.error('Processing error:', error);
                });

            return;
        }

        const a = document.createElement('a');
        a.href = url;
        const filename = quality === 'audio' ? 'music.mp3' : 'video_' + quality + '.' + ext;
        a.setAttribute('download', filename);
        a.target = '_blank';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        
        showStatus('Download started!', '#38ef7d');
    }

    document.addEventListener('click', (e) => {
        if (e.target.closest('#closeProcessingModal')) {
            e.preventDefault();
            const pModal = document.getElementById('processingModal');
            if (pModal) pModal.classList.add('hidden');
            return;
        }

        const skipBtnEl = e.target.closest('#skipAdBtn');
        if (skipBtnEl) {
            e.preventDefault();
            if (!skipBtnEl.disabled) {
                closeAd();
                if (targetDownloadUrl) {
                    startDownload(targetDownloadUrl, targetDownloadQuality);
                }
            }
            return;
        }

        if (e.target.id === 'processingModal') {
            document.getElementById('processingModal').classList.add('hidden');
            return;
        }
    });

    function showAdModal() {
        const modal = document.getElementById('adModal');
        if (!modal) return;
        
        modal.classList.remove('hidden');
        
        const hasAd = Math.random() > 0.3;
        
        const modalTitle = modal.querySelector('.modal-title');
        const modalDesc = modal.querySelector('.modal-desc');
        const adContainer = modal.querySelector('.ad-container');
        const sBtn = document.getElementById('skipAdBtn');

        if (hasAd) {
            modalTitle.textContent = 'Support Us';
            modalDesc.textContent = 'Watch this short ad to unlock high-quality downloads (HD/4K).';
            adContainer.innerHTML = '';
            try {
                const atScript = document.createElement('script');
                atScript.type = 'text/javascript';
                atScript.textContent = "atOptions = { 'key' : '9243233f70df21dccd099002974a2606', 'format' : 'iframe', 'height' : 250, 'width' : 300, 'params' : {} };";
                adContainer.appendChild(atScript);
                
                const invokeScript = document.createElement('script');
                invokeScript.type = 'text/javascript';
                invokeScript.src = 'https://www.highperformanceformat.com/9243233f70df21dccd099002974a2606/invoke.js';
                adContainer.appendChild(invokeScript);
            } catch (e) {
                console.warn('Ad failed to load:', e);
                adContainer.innerHTML = '<p style="color: var(--text-muted); padding: 2rem;">Loading ad...</p>';
            }
            secondsLeft = 10;
        } else {
            modalTitle.textContent = 'Please Wait...';
            modalDesc.textContent = 'No ads available right now. You can continue your download in a few seconds.';
            adContainer.innerHTML = '<p style="color: var(--secondary-color);"><i class="fa-solid fa-hourglass-half fa-spin fa-2x"></i><br><br>Preparing your high-quality download link...</p>';
            secondsLeft = 5;
        }

        if (sBtn) {
            sBtn.classList.remove('ready');
            sBtn.disabled = true;
            sBtn.textContent = '⏳ Loading ad...';
        }

        function startCountdown() {
            if (sBtn) {
                sBtn.textContent = hasAd ? `⏳ Please watch the ad (${secondsLeft}s...)` : `⏳ Wait (${secondsLeft}s...)`;
            }
            skipTimer = setInterval(() => {
                const currentBtn = document.getElementById('skipAdBtn');
                secondsLeft--;
                if (secondsLeft > 0) {
                    if (currentBtn) currentBtn.textContent = hasAd ? `⏳ Please watch the ad (${secondsLeft}s...)` : `⏳ Wait (${secondsLeft}s...)`;
                } else {
                    clearInterval(skipTimer);
                    if (currentBtn) {
                        currentBtn.classList.add('ready');
                        currentBtn.disabled = false;
                        currentBtn.innerHTML = hasAd ? 'Skip Ad & Download <i class="fa-solid fa-download"></i>' : 'Continue Download <i class="fa-solid fa-download"></i>';
                    }
                }
            }, 1000);
        }

        if (hasAd) {
            let adCheckCount = 0;
            const adChecker = setInterval(() => {
                adCheckCount++;
                const iframe = adContainer.querySelector('iframe');
                if (iframe || adCheckCount >= 10) {
                    clearInterval(adChecker);
                    startCountdown();
                }
            }, 500);
        } else {
            startCountdown();
        }
    }

    function closeAd() {
        const modal = document.getElementById('adModal');
        if (modal) {
            modal.classList.add('hidden');
        }
        if (typeof skipTimer !== 'undefined') {
            clearInterval(skipTimer);
        }
    }

    function setLoadingState(isLoading) {
        if (isLoading) {
            btnText.style.opacity = '0';
            btnIcon.style.opacity = '0';
            spinner.classList.remove('hidden');
            downloadBtn.disabled = true;
            downloadBtn.style.justifyContent = 'center';
        } else {
            btnText.style.opacity = '1';
            btnIcon.style.opacity = '1';
            spinner.classList.add('hidden');
            downloadBtn.disabled = false;
            downloadBtn.style.justifyContent = '';
        }
    }

    function showStatus(message, color) {
        statusMessage.textContent = message;
        statusMessage.style.color = color;
        
        setTimeout(() => {
            if (statusMessage.textContent === message) {
                statusMessage.textContent = '';
            }
        }, 4000);
    }
});
