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
        
        // Basic validation
        if (!url) {
            showStatus('Harap masukkan URL video yang valid!', '#ff4444');
            return;
        }

        const isValidUrl = /^(https?:\/\/)?([\w\d\-_]+\.+[A-Za-z]{2,})+\/?/.test(url);
        if (!isValidUrl) {
            showStatus('Format URL tidak valid. Periksa kembali link kamu.', '#ff4444');
            return;
        }

        // Fetch from API
        setLoadingState(true);
        resultSection.classList.add('hidden');
        showStatus('Menganalisa tautan video...', '#00f2fe');

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
                showStatus('Video ditemukan!', '#38ef7d');
                window.currentVideoOriginalUrl = url;
                displayVideoData(data);
                resultSection.classList.remove('hidden');
            } else {
                showStatus('Gagal: ' + (data.error || 'Terjadi kesalahan tidak diketahui'), '#ff4444');
            }
        })
        .catch(error => {
            setLoadingState(false);
            showStatus('Gagal menyambung ke server.', '#ff4444');
            console.error('Error:', error);
        });
    });

    function displayVideoData(data) {
        document.getElementById('videoTitle').textContent = data.title;
        document.getElementById('videoDuration').textContent = 'Durasi: ' + (data.duration_string || 'N/A');
        
        const thumbContainer = document.querySelector('.thumbnail-placeholder');
        if (data.thumbnail) {
            thumbContainer.innerHTML = `<img src="${data.thumbnail}" alt="Thumbnail" style="width:100%; height:100%; object-fit:cover; border-radius:8px;">`;
        } else {
            thumbContainer.innerHTML = '<i class="fa-solid fa-video"></i>';
        }

        // We can store the raw formats in the window object to acccess them later
        window.videoDownloadFormats = data.formats || [];
        window.videoDirectUrl = data.best_url || '';

        renderDownloadOptions(window.videoDownloadFormats, window.videoDirectUrl);
    }

    function renderDownloadOptions(formats, bestUrl) {
        const optionsContainer = document.querySelector('.download-options');
        optionsContainer.innerHTML = ''; // Clear existing

        if (!formats || formats.length === 0) {
            if (bestUrl) {
                // Fallback direct format
                optionsContainer.innerHTML = `
                    <button class="dl-option normal-btn" data-quality="normal">
                        <i class="fa-solid fa-download"></i> Unduh Video (Kualitas Default)
                    </button>
                `;
            } else {
                optionsContainer.innerHTML = '<p class="text-center">Tidak ada tautan unduhan yang ditemukan.</p>';
            }
        } else {
            // Check availability of each tier
            const hasNormal = formats.some(f => f.quality_label === 'normal');
            const hasHq = formats.some(f => f.quality_label === 'hq');
            const hasUhq = formats.some(f => f.quality_label === 'uhq');

            if (hasNormal || bestUrl) {
                optionsContainer.innerHTML += `
                    <button class="dl-option normal-btn" data-quality="normal">
                        <i class="fa-solid fa-download"></i> Kualitas Standar (SD/Normal)
                    </button>
                `;
            }

            if (hasHq) {
                optionsContainer.innerHTML += `
                    <button class="dl-option hq-btn" data-quality="hq">
                        <i class="fa-solid fa-crown"></i> Kualitas Tinggi (HD) - Tonton Iklan
                    </button>
                `;
            }

            if (hasUhq) {
                 optionsContainer.innerHTML += `
                    <button class="dl-option uhq-btn" data-quality="uhq">
                        <i class="fa-solid fa-gem"></i> Kualitas Ultra (4K) - Tonton Iklan
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
                        <i class="fa-solid fa-compact-disc"></i> Download FLAC (Lossless)
                    </button>
                `;
            }
        }

        // Re-attach event listeners to new buttons
        attachDownloadListeners();
    }


    // Handle Quality Selection
    let targetDownloadUrl = '';
    let targetDownloadQuality = 'hq';

    function attachDownloadListeners() {
        const dlOptions = document.querySelectorAll('.dl-option');
        dlOptions.forEach(btn => {
            // Remove old listeners to avoid duplicates if called multiple times
            const newBtn = btn.cloneNode(true);
            btn.parentNode.replaceChild(newBtn, btn);
            
            newBtn.addEventListener('click', (e) => {
                const quality = e.currentTarget.dataset.quality;

                // Find best matching format
                let urlToDownload = window.videoDirectUrl; // Default to best raw url

                let downloadExt = 'mp4';

                if (window.videoDownloadFormats && window.videoDownloadFormats.length > 0) {
                    if (quality.startsWith('audio')) {
                        // Find best audio based on abr or take the last one
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
                    alert('Tautan unduhan tidak tersedia untuk kualitas ini, atau video belum dianalisa.');
                    return;
                }
                
                // Semua jenis unduhan wajib di-proxy melalui server (download.php) 
                // untuk menghindari masalah "403 Access Denied / Hotlink Protection" dari CDN TikTok.
                targetDownloadUrl = `download.php?url=${encodeURIComponent(window.currentVideoOriginalUrl)}&quality=${quality}`;
                targetDownloadQuality = quality;

                if (quality === 'normal' || quality.startsWith('audio')) {
                     // Unduh langsung dengan proxy (munculkan modal loading tanpa iklan paksaan)
                     startDownload(targetDownloadUrl, quality, downloadExt);
                } else {
                     // Kualitas HD/4K wajib nonton iklan pop-up Banner 300x250 dulu
                     showAdModal();
                }
            });
        });
    }

    // Call initially in case there are statically rendered buttons
    attachDownloadListeners();

    function startDownload(url, quality, ext = 'mp4') {
        if (url.startsWith('download.php')) {
            showStatus('⏳ Sedang memproses dan menggabung video di server...', '#f39c12');
            
            // Show the processing modal
            const pModal = document.getElementById('processingModal');
            const processingState = document.getElementById('processingState');
            const doneState = document.getElementById('doneState');
            const errorState = document.getElementById('errorState');
            const progressFill = document.getElementById('progressBarFill');
            const timerText = document.getElementById('processingTimer');

            // Reset modal states
            if (processingState) processingState.classList.remove('hidden');
            if (doneState) doneState.classList.add('hidden');
            if (errorState) errorState.classList.add('hidden');
            if (progressFill) progressFill.style.width = '0%';
            if (pModal) pModal.classList.remove('hidden');

            // Animate progress bar (fake progress for UX)
            let progress = 0;
            const progressInterval = setInterval(() => {
                if (progress < 90) {
                    progress += Math.random() * 3;
                    if (progress > 90) progress = 90;
                    if (progressFill) progressFill.style.width = progress + '%';
                }
            }, 500);

            // Timer display
            let elapsed = 0;
            const timerInterval = setInterval(() => {
                elapsed++;
                const mins = Math.floor(elapsed / 60);
                const secs = elapsed % 60;
                if (timerText) {
                    timerText.textContent = `Memproses... ${mins > 0 ? mins + 'm ' : ''}${secs}s`;
                }
            }, 1000);

            // Fetch to prepare (not auto-download)
            fetch(url + '&action=prepare')
                .then(response => response.json())
                .then(data => {
                    clearInterval(progressInterval);
                    clearInterval(timerInterval);

                    if (data.success) {
                        // Complete progress bar
                        if (progressFill) progressFill.style.width = '100%';
                        
                        // Switch to done state after a brief delay
                        setTimeout(() => {
                            if (processingState) processingState.classList.add('hidden');
                            if (doneState) doneState.classList.remove('hidden');

                            const finalBtn = document.getElementById('finalDownloadBtn');
                            if (finalBtn) {
                                const serveUrl = `download.php?action=serve&fileId=${encodeURIComponent(data.fileId)}&quality=${encodeURIComponent(data.quality)}`;
                                finalBtn.href = serveUrl;
                                finalBtn.setAttribute('download', 't_downloader_' + data.quality + '.' + (data.ext || 'mp4'));
                            }

                            showStatus('✅ Video siap diunduh!', '#38ef7d');
                        }, 500);
                    } else {
                        // Show error state
                        if (processingState) processingState.classList.add('hidden');
                        if (errorState) errorState.classList.remove('hidden');
                        const errMsg = document.getElementById('errorMessage');
                        if (errMsg) errMsg.textContent = data.error || 'Terjadi kesalahan saat memproses video.';
                        showStatus('❌ Gagal memproses video.', '#ff4444');
                    }
                })
                .catch(error => {
                    clearInterval(progressInterval);
                    clearInterval(timerInterval);
                    
                    if (processingState) processingState.classList.add('hidden');
                    if (errorState) errorState.classList.remove('hidden');
                    showStatus('❌ Gagal menyambung ke server.', '#ff4444');
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
        
        showStatus('Proses unduhan dimulai...', '#38ef7d');
    }

    // Global Event Delegation for Modal and Buttons
    document.addEventListener('click', (e) => {
        // Handle Close Ad Modal (X button) - REMOVED TO FORCE WAIT

        // Handle Close Processing Modal
        if (e.target.closest('#closeProcessingModal')) {
            e.preventDefault();
            const pModal = document.getElementById('processingModal');
            if (pModal) pModal.classList.add('hidden');
            return;
        }

        // Handle Skip Ad Button
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

        // Handle Clicking Outside Modal Content - REMOVED TO FORCE WAIT

        if (e.target.id === 'processingModal') {
            document.getElementById('processingModal').classList.add('hidden');
            return;
        }
    });

    function showAdModal() {
        const modal = document.getElementById('adModal');
        if (!modal) return;
        
        modal.classList.remove('hidden');
        
        // Simulasikan 30% kemungkinan tidak ada iklan yang tersedia
        const hasAd = Math.random() > 0.3;
        
        const modalTitle = modal.querySelector('.modal-title');
        const modalDesc = modal.querySelector('.modal-desc');
        const adContainer = modal.querySelector('.ad-container');
        const sBtn = document.getElementById('skipAdBtn');

        if (hasAd) {
            modalTitle.textContent = 'Sponsor Kami';
            modalDesc.textContent = 'Tonton iklan singkat ini untuk membuka unduhan berkualitas tinggi (HD/4K).';
            // Dynamically load Adsterra 300x250 Banner
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
                adContainer.innerHTML = '<p style="color: var(--text-muted); padding: 2rem;">Iklan sedang dimuat...</p>';
            }
            secondsLeft = 20;
        } else {
            modalTitle.textContent = 'Harap Tunggu...';
            modalDesc.textContent = 'Saat ini tidak ada iklan yang tersedia. Anda dapat melanjutkan unduhan dalam beberapa detik.';
            adContainer.innerHTML = '<p style="color: var(--secondary-color);"><i class="fa-solid fa-hourglass-half fa-spin fa-2x"></i><br><br>Menyiapkan tautan unduhan kualitas tinggi...</p>';
            secondsLeft = 10; // Timer lebih cepat jika tidak ada iklan
        }

        if (sBtn) {
            sBtn.classList.remove('ready');
            sBtn.disabled = true;
            sBtn.textContent = hasAd ? `⏳ Harap tonton iklan (${secondsLeft} detik...)` : `⏳ Tunggu (${secondsLeft} detik...)`;
        }

        skipTimer = setInterval(() => {
            const currentBtn = document.getElementById('skipAdBtn');
            secondsLeft--;
            if (secondsLeft > 0) {
                if (currentBtn) currentBtn.textContent = hasAd ? `⏳ Harap tonton iklan (${secondsLeft} detik...)` : `⏳ Tunggu (${secondsLeft} detik...)`;
            } else {
                clearInterval(skipTimer);
                if (currentBtn) {
                    currentBtn.classList.add('ready');
                    currentBtn.disabled = false;
                    currentBtn.innerHTML = hasAd ? 'Lewati Iklan <i class="fa-solid fa-forward-step"></i>' : 'Lanjutkan Unduhan <i class="fa-solid fa-download"></i>';
                }
            }
        }, 1000);
    }

    // Modal Close Mechanism
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
        
        // Fade out message after 4 seconds
        setTimeout(() => {
            if (statusMessage.textContent === message) {
                statusMessage.textContent = '';
            }
        }, 4000);
    }
});
