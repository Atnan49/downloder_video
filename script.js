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
        }

        // Re-attach event listeners to new buttons
        attachDownloadListeners();
    }


    // Handle Quality Selection
    let targetDownloadUrl = '';

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

                if (window.videoDownloadFormats && window.videoDownloadFormats.length > 0) {
                    const match = window.videoDownloadFormats.find(f => f.quality_label === quality) 
                                  || window.videoDownloadFormats.find(f => f.quality_label === 'normal') 
                                  || window.videoDownloadFormats[0];
                    urlToDownload = match.url;
                }

                if (!urlToDownload) {
                    alert('Tautan unduhan tidak tersedia untuk kualitas ini, atau video belum dianalisa.');
                    return;
                }
                
                if (quality === 'normal') {
                    targetDownloadUrl = urlToDownload;
                    startDownload(targetDownloadUrl, 'normal');
                } else {
                    targetDownloadUrl = urlToDownload;
                    showAdModal();
                }
            });
        });
    }

    // Call initially in case there are statically rendered buttons
    attachDownloadListeners();

    function startDownload(url, quality) {
        const a = document.createElement('a');
        a.href = url;
        a.setAttribute('download', 'video_' + quality + '.mp4');
        a.target = '_blank';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        
        showStatus('Proses unduhan dimulai...', '#38ef7d');
    }

    // Global Event Delegation for Modal and Buttons
    document.addEventListener('click', (e) => {
        // Handle Close Ad Modal (X button)
        if (e.target.closest('#closeAdModal')) {
            e.preventDefault();
            closeAd();
            return;
        }

        // Handle Skip Ad Button
        const skipBtnEl = e.target.closest('#skipAdBtn');
        if (skipBtnEl) {
            e.preventDefault();
            if (!skipBtnEl.disabled) {
                closeAd();
                if (targetDownloadUrl) {
                    startDownload(targetDownloadUrl, 'hq');
                }
            }
            return;
        }

        // Handle Clicking Outside Modal Content
        if (e.target.id === 'adModal') {
            closeAd();
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
            adContainer.innerHTML = '<p>Tampilan Iklan Video/Banner (300x250) di sini</p>';
            secondsLeft = 5;
        } else {
            modalTitle.textContent = 'Harap Tunggu...';
            modalDesc.textContent = 'Saat ini tidak ada iklan yang tersedia. Anda dapat melanjutkan unduhan dalam beberapa detik.';
            adContainer.innerHTML = '<p style="color: var(--secondary-color);"><i class="fa-solid fa-hourglass-half fa-spin fa-2x"></i><br><br>Menyiapkan tautan unduhan kualitas tinggi...</p>';
            secondsLeft = 3; // Timer lebih cepat jika tidak ada iklan
        }

        if (sBtn) {
            sBtn.classList.remove('ready');
            sBtn.disabled = true;
            sBtn.textContent = hasAd ? `Lewati Iklan (${secondsLeft} detik...)` : `Tunggu (${secondsLeft} detik...)`;
        }

        skipTimer = setInterval(() => {
            const currentBtn = document.getElementById('skipAdBtn');
            secondsLeft--;
            if (secondsLeft > 0) {
                if (currentBtn) currentBtn.textContent = hasAd ? `Lewati Iklan (${secondsLeft} detik...)` : `Tunggu (${secondsLeft} detik...)`;
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
