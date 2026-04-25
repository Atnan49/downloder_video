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
    const skipAdBtn = document.getElementById('skipAdBtn');

    let skipTimer;
    let secondsLeft = 5;
    let activeProgressInterval = null;
    let activeTimerInterval = null;

    let isSubmitting = false;

    form.addEventListener('submit', (e) => {
        e.preventDefault();

        if (isSubmitting) return;

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

        // Open sponsor link only AFTER validation passes
        window.open('https://www.profitablecpmratenetwork.com/bq5bb4z7?key=9a37fedd4aecc873e20314b6bc945d2e', '_blank');

        isSubmitting = true;
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
            isSubmitting = false;
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
            isSubmitting = false;
            showStatus('Failed to connect to server.', '#ff4444');
            console.error('Error:', error);
        });
    });

    function displayVideoData(data) {
        window.videoTitle = data.title || 'Video';
        document.getElementById('videoTitle').textContent = data.title;
        document.getElementById('videoDuration').textContent = 'Duration: ' + (data.duration_string || 'N/A');
        
        const thumbContainer = document.querySelector('.thumbnail-placeholder');
        if (data.thumbnail && /^https?:\/\//i.test(data.thumbnail)) {
            const img = document.createElement('img');
            img.src = data.thumbnail;
            img.alt = 'Thumbnail';
            img.style.cssText = 'width:100%; height:100%; object-fit:cover; border-radius:8px;';
            thumbContainer.innerHTML = '';
            thumbContainer.appendChild(img);
        } else {
            thumbContainer.innerHTML = '<i class="fa-solid fa-video"></i>';
        }

        const pickerContainer = document.getElementById('pickerSection') || createPickerSection();
        if (data.picker && data.picker.length > 0) {
            renderPicker(data.picker, pickerContainer);
            pickerContainer.classList.remove('hidden');
        } else {
            pickerContainer.classList.add('hidden');
        }

        window.videoDownloadFormats = data.formats || [];
        window.videoDirectUrl = data.best_url || '';

        renderDownloadOptions(window.videoDownloadFormats, window.videoDirectUrl);
    }

    function createPickerSection() {
        const section = document.createElement('div');
        section.id = 'pickerSection';
        section.className = 'picker-grid hidden';
        resultSection.insertBefore(section, document.querySelector('.download-options'));
        return section;
    }

    function renderPicker(pickerItems, container) {
        container.innerHTML = '<h4 class="picker-title">Multiple items found:</h4>';
        const grid = document.createElement('div');
        grid.className = 'picker-items';
        
        pickerItems.forEach((item, index) => {
            const itemEl = document.createElement('div');
            itemEl.className = 'picker-item';
            const thumb = item.thumb || item.url;
            const typeIcon = item.type === 'photo' ? 'fa-image' : 'fa-video';
            
            itemEl.innerHTML = `
                <div class="picker-thumb">
                    <img src="${thumb}" alt="Item ${index + 1}">
                    <span class="picker-type"><i class="fa-solid ${typeIcon}"></i></span>
                </div>
                <button class="picker-dl-btn" data-url="${item.url}" data-type="${item.type}">
                    <i class="fa-solid fa-download"></i> Save ${item.type}
                </button>
            `;
            grid.appendChild(itemEl);
        });
        container.appendChild(grid);

        container.querySelectorAll('.picker-dl-btn').forEach(btn => {
            btn.onclick = (e) => {
                const itemUrl = e.currentTarget.dataset.url;
                const dlUrl = `download.php?url=${encodeURIComponent(itemUrl)}&quality=hq`;
                targetDownloadUrl = dlUrl + `&title=${encodeURIComponent(window.videoTitle || 'Video')}`;
                targetDownloadQuality = 'hq';
                startDownload(targetDownloadUrl, targetDownloadQuality);
            };
        });
    }

    function renderDownloadOptions(formats, bestUrl) {
        const optionsContainer = document.querySelector('.download-options');
        optionsContainer.innerHTML = '';

        if (!formats || formats.length === 0) {
            if (bestUrl) {
                optionsContainer.innerHTML = `
                    <button class="dl-option normal-btn" data-quality="normal" data-url="${bestUrl}">
                        <i class="fa-solid fa-download"></i> Download Video (Default Quality)
                    </button>
                `;
            } else {
                optionsContainer.innerHTML = '<p class="text-center">No download links found.</p>';
            }
        } else {
            formats.forEach(f => {
                let btnClass = 'normal-btn';
                let icon = 'fa-download';
                let adSuffix = '';

                if (f.quality_label === 'uhq') { btnClass = 'uhq-btn'; icon = 'fa-gem'; adSuffix = ' - Watch Ad'; }
                else if (f.quality_label === 'hq') { btnClass = 'hq-btn'; icon = 'fa-crown'; adSuffix = ' - Watch Ad'; }
                else if (f.quality_label.startsWith('audio')) { btnClass = 'audio-btn'; icon = 'fa-music'; }

                optionsContainer.innerHTML += `
                    <button class="dl-option ${btnClass}" data-quality="${f.quality_label}" data-url="${f.url}">
                        <i class="fa-solid ${icon}"></i> ${f.format_note}${adSuffix}
                    </button>
                `;
            });
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
                const urlToDownload = e.currentTarget.dataset.url;

                if (!urlToDownload) {
                    alert('Download link not available.');
                    return;
                }
                
                targetDownloadUrl = urlToDownload + `&title=${encodeURIComponent(window.videoTitle)}`;
                targetDownloadQuality = quality;

                // Lock high qualities behind ads
                if (quality === 'uhq' || quality === 'hq' || quality === 'audio-flac') {
                     showAdModal();
                } else {
                     startDownload(targetDownloadUrl, quality);
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
            activeProgressInterval = setInterval(() => {
                if (progress < 90) {
                    progress += Math.random() * 3;
                    if (progress > 90) progress = 90;
                    if (progressFill) progressFill.style.width = progress + '%';
                }
            }, 500);

            let elapsed = 0;
            activeTimerInterval = setInterval(() => {
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
                    clearInterval(activeProgressInterval);
                    clearInterval(activeTimerInterval);
                    activeProgressInterval = null;
                    activeTimerInterval = null;

                    if (data.success) {
                        if (progressFill) progressFill.style.width = '100%';
                        
                        setTimeout(() => {
                            if (processingState) processingState.classList.add('hidden');
                            if (doneState) doneState.classList.remove('hidden');

                            const finalBtn = document.getElementById('finalDownloadBtn');
                            if (finalBtn) {
                                const safeTitle = window.videoTitle.replace(/[^a-zA-Z0-9_\-\s]/g, '').trim().substring(0, 40).replace(/\s+/g, '_');
                                const serveUrl = `download.php?action=serve&fileId=${encodeURIComponent(data.fileId)}&quality=${encodeURIComponent(data.quality)}&title=${encodeURIComponent(window.videoTitle)}`;
                                finalBtn.href = serveUrl;
                                finalBtn.setAttribute('download', 'Tarifter.com_' + safeTitle + '_' + data.quality + '.' + (data.ext || 'mp4'));
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
                    clearInterval(activeProgressInterval);
                    clearInterval(activeTimerInterval);
                    activeProgressInterval = null;
                    activeTimerInterval = null;
                    
                    if (processingState) processingState.classList.add('hidden');
                    if (errorState) errorState.classList.remove('hidden');
                    showStatus('❌ Failed to connect to server.', '#ff4444');
                    console.error('Processing error:', error);
                });

            return;
        }

        // Direct download fallback for external links
        showStatus('Download started!', '#38ef7d');
        window.location.assign(url);
    }


    document.addEventListener('click', (e) => {
        if (e.target.closest('#closeProcessingModal')) {
            e.preventDefault();
            if (activeProgressInterval) { clearInterval(activeProgressInterval); activeProgressInterval = null; }
            if (activeTimerInterval) { clearInterval(activeTimerInterval); activeTimerInterval = null; }
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
            if (activeProgressInterval) { clearInterval(activeProgressInterval); activeProgressInterval = null; }
            if (activeTimerInterval) { clearInterval(activeTimerInterval); activeTimerInterval = null; }
            document.getElementById('processingModal').classList.add('hidden');
            return;
        }
    });

    function showAdModal() {
        const modal = document.getElementById('adModal');
        if (!modal) return;
        
        modal.classList.remove('hidden');
        
        const sBtn = document.getElementById('skipAdBtn');
        const spLink = document.getElementById('sponsorLinkBtn');

        if (sBtn) {
            sBtn.classList.remove('ready');
            sBtn.disabled = true;
            sBtn.textContent = 'Click the sponsor link above first...';
            // Reset styles in case it was opened before
            sBtn.style.background = '';
            sBtn.style.color = '';
            sBtn.style.cursor = 'not-allowed';
        }
        
        if (spLink) {
            // Reset pointer events for new modal open
            spLink.style.pointerEvents = 'auto';
            spLink.style.opacity = '1';

            // Unlock functionality when clicked
            spLink.onclick = function() {
                if (sBtn && sBtn.disabled) {
                    spLink.style.pointerEvents = 'none';
                    spLink.style.opacity = '0.7';

                    let timeLeft = 5;
                    sBtn.textContent = `Unlocking in ${timeLeft}s...`;
                    
                    const countdownTimer = setInterval(() => {
                        timeLeft--;
                        if (timeLeft > 0) {
                            sBtn.textContent = `Unlocking in ${timeLeft}s...`;
                        } else {
                            clearInterval(countdownTimer);
                            sBtn.classList.add('ready');
                            sBtn.disabled = false;
                            sBtn.textContent = 'Download Now';
                            sBtn.style.background = '#38ef7d';
                            sBtn.style.color = '#111';
                            sBtn.style.cursor = 'pointer';
                        }
                    }, 1000);
                }
            };
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

    // Cookie Consent Logic
    const cookieModal = document.getElementById('cookieConsentModal');
    const acceptCookieBtn = document.getElementById('acceptCookieBtn');

    if (cookieModal && acceptCookieBtn) {
        if (!localStorage.getItem('cookieAccepted')) {
            cookieModal.classList.remove('hidden');
        }

        acceptCookieBtn.addEventListener('click', () => {
            localStorage.setItem('cookieAccepted', 'true');
            cookieModal.style.animation = 'slideUp 0.5s ease reverse forwards';
            setTimeout(() => {
                cookieModal.classList.add('hidden');
            }, 500);
        });
    }
});
