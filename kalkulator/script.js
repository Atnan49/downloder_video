document.addEventListener('DOMContentLoaded', () => {
    const inputGaji = document.getElementById('gaji');
    const selectPtkp = document.getElementById('ptkp');
    const form = document.getElementById('kalkulator-form');

    const emptyState = document.getElementById('hasil-kosong');
    const resultContainer = document.getElementById('hasil-kalkulasi');
    const resPersen = document.getElementById('res-persen');
    const resPajak = document.getElementById('res-pajak');
    const resThp = document.getElementById('res-thp');

    const btnWA = document.getElementById('btn-wa');
    const btnCopy = document.getElementById('btn-copy');
    const statusMessage = document.getElementById('status-message');

    if (!inputGaji || !selectPtkp || !form || !btnWA || !btnCopy) return;

    const TER_A = [
        [5400000, 0], [5650000, 0.25], [5950000, 0.5], [6300000, 0.75],
        [6750000, 1], [7500000, 1.25], [8550000, 1.5], [9650000, 1.75],
        [10050000, 2], [10350000, 2.25], [10700000, 2.5], [11050000, 3],
        [11600000, 3.5], [12500000, 4], [13750000, 5], [15100000, 6],
        [16950000, 7], [19750000, 8], [24150000, 9], [26450000, 10],
        [28000000, 11], [30050000, 12], [35400000, 13], [39150000, 14],
        [43850000, 15], [47800000, 16], [51400000, 17], [56300000, 18],
        [62200000, 19], [68600000, 20], [77500000, 21], [89000000, 22],
        [103000000, 23], [120000000, 24], [140000000, 25], [161000000, 26],
        [189000000, 27], [227000000, 28], [281000000, 29], [361000000, 30],
        [463000000, 31], [609000000, 32], [850000000, 33], [1400000000, 34],
        [Infinity, 34]
    ];

    const TER_B = [
        [6200000, 0], [6500000, 0.25], [6850000, 0.5], [7300000, 0.75],
        [9200000, 1], [10750000, 1.5], [11250000, 2], [11600000, 2.5],
        [12600000, 3], [13600000, 4], [14950000, 5], [16400000, 6],
        [18450000, 7], [21850000, 8], [26000000, 9], [27700000, 10],
        [29350000, 11], [31450000, 12], [37100000, 13], [41100000, 14],
        [45800000, 15], [49500000, 16], [53800000, 17], [58500000, 18],
        [64000000, 19], [71000000, 20], [80000000, 21], [93000000, 22],
        [109000000, 23], [129000000, 24], [154000000, 25], [182000000, 26],
        [218000000, 27], [268000000, 28], [341000000, 29], [451000000, 30],
        [603000000, 31], [862000000, 32], [1400000000, 33], [Infinity, 34]
    ];

    const TER_C = [
        [6600000, 0], [6950000, 0.25], [7350000, 0.5], [7800000, 0.75],
        [8850000, 1], [9800000, 1.25], [10950000, 1.5], [11200000, 1.75],
        [11600000, 2], [12050000, 2.5], [13200000, 3], [14400000, 4],
        [15900000, 5], [17450000, 6], [19750000, 7], [22950000, 8],
        [26850000, 9], [28350000, 10], [30100000, 11], [32600000, 12],
        [38400000, 13], [42600000, 14], [47400000, 15], [51200000, 16],
        [55800000, 17], [60400000, 18], [66700000, 19], [74500000, 20],
        [83200000, 21], [97500000, 22], [115000000, 23], [138000000, 24],
        [167000000, 25], [199000000, 26], [244000000, 27], [305000000, 28],
        [394000000, 29], [536000000, 30], [745000000, 31], [1100000000, 32],
        [1400000000, 33], [Infinity, 34]
    ];

    let latestResultText = '';

    function updateStatusMessage(message) {
        if (!statusMessage) return;
        statusMessage.textContent = message;
    }

    function setActionButtonsState(enabled) {
        btnWA.disabled = !enabled;
        btnCopy.disabled = !enabled;
    }

    function formatRupiah(angka) {
        return angka.toString().replace(/\B(?=(\d{3})+(?!\d))/g, '.');
    }

    function unformatRupiah(str) {
        if (!str) return 0;
        return parseInt(str.replace(/\./g, ''), 10) || 0;
    }

    function getTarifTER(gajiBruto, kategoriPtkp) {
        let tabelPrioritas = [];
        if (kategoriPtkp === 'A') tabelPrioritas = TER_A;
        else if (kategoriPtkp === 'B') tabelPrioritas = TER_B;
        else if (kategoriPtkp === 'C') tabelPrioritas = TER_C;

        for (let i = 0; i < tabelPrioritas.length; i++) {
            if (gajiBruto <= tabelPrioritas[i][0]) {
                return tabelPrioritas[i][1];
            }
        }

        return 34;
    }

    function showCopySuccess() {
        const originalHTML = btnCopy.innerHTML;
        btnCopy.innerHTML = '<i class="ph ph-check font-bold"></i> Tersalin!';
        btnCopy.classList.remove('bg-slate-100', 'text-slate-700');
        btnCopy.classList.add('bg-emerald-100', 'text-emerald-700');
        updateStatusMessage('Hasil kalkulasi berhasil disalin.');

        setTimeout(() => {
            btnCopy.innerHTML = originalHTML;
            btnCopy.classList.remove('bg-emerald-100', 'text-emerald-700');
            btnCopy.classList.add('bg-slate-100', 'text-slate-700');
        }, 1500);
    }

    setActionButtonsState(false);

    inputGaji.addEventListener('input', function () {
        let value = this.value.replace(/[^,\d]/g, '').toString();
        value = value.replace(/^0+/, '');

        if (value) {
            this.value = formatRupiah(value);
            return;
        }

        this.value = '';
    });

    form.addEventListener('submit', (e) => {
        e.preventDefault();

        const brutoStr = inputGaji.value;
        const ptkpKategori = selectPtkp.value;
        const ptkpLabel = selectPtkp.options[selectPtkp.selectedIndex]?.text || ptkpKategori;

        if (!brutoStr || !ptkpKategori) return;

        const bruto = unformatRupiah(brutoStr);
        if (bruto <= 0) {
            alert('Nominal gaji harus lebih dari 0.');
            setActionButtonsState(false);
            updateStatusMessage('Nominal gaji tidak valid.');
            return;
        }

        const ratePersen = getTarifTER(bruto, ptkpKategori);
        const potonganPajak = Math.floor(bruto * (ratePersen / 100));
        const thp = bruto - potonganPajak;

        resPersen.innerText = `${ratePersen}%`;
        resPajak.innerText = `- Rp ${formatRupiah(potonganPajak)}`;
        resThp.innerText = `Rp ${formatRupiah(thp)}`;

        emptyState.classList.add('hidden');
        resultContainer.classList.remove('hidden');
        setActionButtonsState(true);

        const publicUrl = 'https://tarifter.com/kalkulator/';
        latestResultText = [
            'Simulasi PPh 21 TER 2026 - Tarifter',
            '',
            `Gaji Bruto: Rp ${formatRupiah(bruto)}`,
            `Status PTKP: ${ptkpLabel}`,
            `Kategori TER: ${ptkpKategori}`,
            `Tarif TER: ${ratePersen}%`,
            `Potongan PPh 21: Rp ${formatRupiah(potonganPajak)}`,
            `Take Home Pay: Rp ${formatRupiah(thp)}`,
            '',
            `Hitung simulasi Anda di: ${publicUrl}`
        ].join('\n');

        updateStatusMessage('Hasil kalkulasi sudah tersedia untuk dibagikan atau disalin.');
    });

    btnWA.addEventListener('click', () => {
        if (!latestResultText) {
            alert('Hitung dulu pajak Anda sebelum membagikan hasil.');
            return;
        }

        const waUrl = `https://wa.me/?text=${encodeURIComponent(latestResultText)}`;
        window.open(waUrl, '_blank', 'noopener');
        updateStatusMessage('Membuka WhatsApp untuk membagikan hasil kalkulasi.');
    });

    btnCopy.addEventListener('click', async () => {
        if (!latestResultText) {
            alert('Belum ada hasil untuk disalin. Silakan hitung dulu.');
            return;
        }

        try {
            if (navigator.clipboard && window.isSecureContext) {
                await navigator.clipboard.writeText(latestResultText);
                showCopySuccess();
                return;
            }

            const tempTextArea = document.createElement('textarea');
            tempTextArea.value = latestResultText;
            tempTextArea.style.position = 'fixed';
            tempTextArea.style.left = '-9999px';
            document.body.appendChild(tempTextArea);
            tempTextArea.focus();
            tempTextArea.select();

            const copied = document.execCommand('copy');
            document.body.removeChild(tempTextArea);

            if (!copied) {
                throw new Error('Copy command gagal.');
            }

            showCopySuccess();
        } catch (error) {
            alert('Gagal menyalin hasil. Coba lagi.');
            updateStatusMessage('Gagal menyalin hasil kalkulasi.');
        }
    });
});
