import { supabase } from '/src/lib/supabaseClient.js';

const TEST_HISTORY_KEY = 'voca_plus_test_history_v1';
const GENERATOR_HISTORY_KEY = 'voca_plus_generator_history_v1';
const TEST_HISTORY_LIMIT = 10;
const GENERATOR_HISTORY_LIMIT = 20;
const GENERATOR_ARCHIVE_DB_NAME = 'voca_plus_generator_archive_v1';
const GENERATOR_ARCHIVE_STORE_NAME = 'archives';
const GENERATOR_RESTORE_REQUEST_KEY = 'voca_plus_generator_restore_request_v1';
const ENTITLEMENT_API_PATH = '/api/account/entitlement';
const BOOK_VERIFY_API_PATH = '/api/account/book-verify';
const DOWNLOAD_LIMIT_MESSAGE = '책구매 인증 전에는 시험지 다운로드를 하루 1회만 할 수 있습니다.';
const GENERATOR_DAILY_DOWNLOAD_COUNT_KEY = 'voca_plus_generator_daily_download_count_v1';
const UNVERIFIED_DAILY_DOWNLOAD_LIMIT = 1;
const PURCHASE_VERIFIED_KEYS = [
    'book_purchase_verified',
    'bookPurchaseVerified',
    'purchase_verified',
    'purchaseVerified',
    'is_book_purchase_verified',
    'isBookPurchaseVerified',
];

const BOOK_LABELS = {
    basic: '베이직',
    advanced: '어드밴스드',
    etymology: '어원편',
};

const state = {
    user: null,
    session: null,
    generatorHistory: [],
    testHistory: [],
    isBookPurchaseVerified: false,
    dailyDownloadLimit: 1,
    dailyDownloadUsed: 0,
    canDownload: true,
};

const normalizeSpacingText = (value) => {
    if (value === null || value === undefined) return '';
    return String(value)
        .replace(/\uFEFF/g, '')
        .normalize('NFKC')
        .replace(/[\u0000-\u001F\u007F]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
};

const escapeHtml = (value) => {
    return String(value || '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
};

const formatLocalDatetime = (isoString) => {
    const date = new Date(isoString);
    if (Number.isNaN(date.getTime())) return '-';
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')} ${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
};

const safeParseHistory = (raw, limit) => {
    if (!raw) return [];
    try {
        const parsed = JSON.parse(raw);
        if (!Array.isArray(parsed)) return [];
        return parsed.filter((item) => item && typeof item === 'object').slice(0, limit);
    } catch (_) {
        return [];
    }
};

const getBookLabel = (bookKey) => {
    const normalized = normalizeSpacingText(bookKey).toLowerCase();
    return BOOK_LABELS[normalized] || normalizeSpacingText(bookKey) || '-';
};

const inferBookKey = (...values) => {
    for (const raw of values) {
        const value = normalizeSpacingText(raw).toLowerCase();
        if (!value) continue;
        if (value.includes('basic') || value.includes('베이직') || value.includes('베이식')) return 'basic';
        if (value.includes('advanced') || value.includes('어드밴스드') || value.includes('어드밴스')) return 'advanced';
        if (value.includes('etymology') || value.includes('어원')) return 'etymology';
    }
    return '';
};

const buildGeneratorRestoreRequest = (historyEntry) => {
    const config = historyEntry?.config || {};
    const fileNames = Array.isArray(historyEntry?.files) ? historyEntry.files : [];
    const inferredBookKey = inferBookKey(
        config.bookKey,
        config.bookName,
        ...fileNames,
    );
    const selectedTocs = Array.isArray(config.selectedTocs)
        ? config.selectedTocs
            .map((toc) => normalizeSpacingText(toc))
            .filter(Boolean)
        : [];
    const numQuestionsRaw = Number.parseInt(config.numQuestions, 10);
    const numQuestions = Number.isInteger(numQuestionsRaw)
        ? Math.max(1, Math.min(200, numQuestionsRaw))
        : 0;
    return {
        createdAt: new Date().toISOString(),
        config: {
            examTitle: normalizeSpacingText(config.examTitle) || '어휘 시험지',
            bookKey: inferredBookKey || normalizeSpacingText(config.bookKey || config.bookName),
            outputFormat: normalizeSpacingText(config.outputFormat).toUpperCase() || 'WORD',
            testType: normalizeSpacingText(config.testType).toUpperCase() || 'KOR',
            numQuestions,
            shouldShuffle: Boolean(config.shouldShuffle),
            selectedChapter: normalizeSpacingText(config.selectedChapter),
            selectedTocs,
            includeDerivatives: Boolean(config.includeDerivatives),
        },
    };
};

const getProviderLabel = (providerRaw) => {
    const provider = normalizeSpacingText(providerRaw).toLowerCase();
    if (!provider) return '-';
    if (provider === 'google') return 'Google';
    if (provider === 'kakao') return 'Kakao';
    if (provider === 'email') return '이메일';
    return providerRaw;
};

const getCurrentAuthProvider = () => {
    const provider = normalizeSpacingText(
        state.user?.app_metadata?.provider || state.session?.user?.app_metadata?.provider || 'email',
    ).toLowerCase();
    return provider || 'email';
};

const parseBooleanLike = (value) => {
    if (typeof value === 'boolean') return value;
    if (typeof value === 'number') return value === 1;
    const normalized = normalizeSpacingText(value).toLowerCase();
    if (!normalized) return false;
    if (['1', 'true', 'yes', 'y', 'verified', '인증', '완료'].includes(normalized)) return true;
    if (['0', 'false', 'no', 'n', 'unverified', '미인증'].includes(normalized)) return false;
    return false;
};

const getPurchaseVerifiedFromUser = (user) => {
    if (!user || typeof user !== 'object') return false;
    const appMetadata = user.app_metadata || {};
    const userMetadata = user.user_metadata || {};

    const hasVerifiedFlag = (metadata) => PURCHASE_VERIFIED_KEYS.some((key) => (
        Object.prototype.hasOwnProperty.call(metadata, key)
        && parseBooleanLike(metadata[key])
    ));

    return hasVerifiedFlag(appMetadata) || hasVerifiedFlag(userMetadata);
};

const getTodayDateKey = () => {
    const date = new Date();
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
};

const getFallbackDailyDownloadStorageKey = () => {
    const userId = normalizeSpacingText(state.user?.id) || 'anonymous';
    return `${GENERATOR_DAILY_DOWNLOAD_COUNT_KEY}:${userId}:${getTodayDateKey()}`;
};

const getFallbackDailyDownloadCount = () => {
    const raw = localStorage.getItem(getFallbackDailyDownloadStorageKey());
    const count = Number.parseInt(raw, 10);
    if (!Number.isInteger(count) || count < 0) return 0;
    return count;
};

const consumeFallbackDailyDownloadQuota = () => {
    const current = getFallbackDailyDownloadCount();
    if (current >= UNVERIFIED_DAILY_DOWNLOAD_LIMIT) return false;
    localStorage.setItem(getFallbackDailyDownloadStorageKey(), String(current + 1));
    return true;
};

const setStatus = (el, message, tone = 'info') => {
    if (!el) return;
    el.textContent = message || '';
    el.classList.remove('is-success', 'is-error');
    if (!message) return;
    if (tone === 'error') {
        el.classList.add('is-error');
        return;
    }
    if (tone === 'success') {
        el.classList.add('is-success');
    }
};

const downloadBlob = (blob, filename) => {
    if (!(blob instanceof Blob)) return;
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename || '시험지';
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
};

const sleep = (ms) => new Promise((resolve) => window.setTimeout(resolve, ms));

const requestToPromise = (request) => new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error('IndexedDB 요청에 실패했습니다.'));
});

const openGeneratorArchiveDb = () => {
    if (!window.indexedDB) {
        return Promise.reject(new Error('IndexedDB를 사용할 수 없습니다.'));
    }
    return new Promise((resolve, reject) => {
        const request = window.indexedDB.open(GENERATOR_ARCHIVE_DB_NAME, 1);
        request.onupgradeneeded = () => {
            const db = request.result;
            if (!db.objectStoreNames.contains(GENERATOR_ARCHIVE_STORE_NAME)) {
                db.createObjectStore(GENERATOR_ARCHIVE_STORE_NAME, { keyPath: 'id' });
            }
        };
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error || new Error('IndexedDB 열기에 실패했습니다.'));
    });
};

const getGeneratorArchive = async (archiveIdRaw) => {
    const archiveId = normalizeSpacingText(archiveIdRaw);
    if (!archiveId || !window.indexedDB) return null;
    const db = await openGeneratorArchiveDb();
    try {
        const tx = db.transaction(GENERATOR_ARCHIVE_STORE_NAME, 'readonly');
        const store = tx.objectStore(GENERATOR_ARCHIVE_STORE_NAME);
        return await requestToPromise(store.get(archiveId));
    } finally {
        db.close();
    }
};

const clearGeneratorArchives = async () => {
    if (!window.indexedDB) return;
    const db = await openGeneratorArchiveDb();
    try {
        const tx = db.transaction(GENERATOR_ARCHIVE_STORE_NAME, 'readwrite');
        const store = tx.objectStore(GENERATOR_ARCHIVE_STORE_NAME);
        await requestToPromise(store.clear());
        await new Promise((resolve, reject) => {
            tx.oncomplete = () => resolve();
            tx.onerror = () => reject(tx.error || new Error('IndexedDB 트랜잭션에 실패했습니다.'));
            tx.onabort = () => reject(tx.error || new Error('IndexedDB 트랜잭션이 중단되었습니다.'));
        });
    } finally {
        db.close();
    }
};

const getUi = () => {
    const securityStatusEl = document.getElementById('mypage-security-status');
    return {
        heroEmail: document.getElementById('mypage-hero-email'),
        purchaseBadge: document.getElementById('mypage-purchase-badge'),
        generatorCount: document.getElementById('mypage-generator-count'),
        testCount: document.getElementById('mypage-test-count'),

        purchaseForm: document.getElementById('mypage-purchase-form'),
        purchaseCodeInput: document.getElementById('mypage-purchase-code'),
        purchaseVerifyBtn: document.getElementById('mypage-purchase-verify'),
        purchaseSummary: document.getElementById('mypage-purchase-summary'),
        purchaseStatus: document.getElementById('mypage-purchase-status') || securityStatusEl,

        createdAt: document.getElementById('mypage-created-at'),
        lastSignin: document.getElementById('mypage-last-signin'),
        authProvider: document.getElementById('mypage-auth-provider'),
        passwordOpenBtn: document.getElementById('mypage-password-open'),
        passwordForm: document.getElementById('mypage-password-form'),
        passwordEmailInput: document.getElementById('mypage-password-email'),
        passwordInput: document.getElementById('mypage-password'),
        passwordConfirmInput: document.getElementById('mypage-password-confirm'),
        passwordCancelBtn: document.getElementById('mypage-password-cancel'),
        securityStatus: securityStatusEl,
        logoutLocalBtn: document.getElementById('mypage-logout-local'),
        testClearBtn: document.getElementById('mypage-test-clear'),
        deleteAccountBtn: document.getElementById('mypage-delete-account'),

        generatorSummary: document.getElementById('mypage-generator-summary'),
        generatorClearBtn: document.getElementById('mypage-generator-clear'),
        generatorStatus: document.getElementById('mypage-generator-status'),
        generatorHistory: document.getElementById('mypage-generator-history'),
        testSummary: document.getElementById('mypage-test-summary'),
        testHistory: document.getElementById('mypage-test-history'),

        supportForm: document.getElementById('mypage-support-form'),
        supportSubject: document.getElementById('mypage-support-subject'),
        supportMessage: document.getElementById('mypage-support-message'),
        supportStatus: document.getElementById('mypage-support-status'),
    };
};

const renderGeneratorHistory = (container, summaryEl, history) => {
    if (!container || !summaryEl) return;
    if (history.length === 0) {
        summaryEl.textContent = '기록 0건';
        container.innerHTML = '<p class="subtitle">생성된 시험지 기록이 없습니다.</p>';
        return;
    }

    const latest = formatLocalDatetime(history[0]?.generatedAt);
    summaryEl.textContent = `총 ${history.length}건 · 최근 생성 ${latest}`;

    container.innerHTML = history.map((entry, index) => {
        const config = entry?.config || {};
        const generatedAt = formatLocalDatetime(entry?.generatedAt);
        const questionCount = Number.isInteger(config.numQuestions) ? config.numQuestions : 0;
        const examTitle = normalizeSpacingText(config.examTitle) || '어휘 시험지';
        const outputFormat = normalizeSpacingText(config.outputFormat) || '-';
        const testType = normalizeSpacingText(config.testType) || '-';
        const hasArchive = Boolean(normalizeSpacingText(entry?.archiveId));
        const redownloadAttr = hasArchive ? `data-redownload-index="${index}"` : '';
        const compactMeta = `${generatedAt} · ${getBookLabel(config.bookKey || config.bookName)} · ${outputFormat}/${testType} · ${questionCount}개`;

        return `
            <article class="test-history-item mypage-history-item">
                <div class="mypage-history-head">
                    <strong class="mypage-history-title">${index + 1}. ${escapeHtml(examTitle)}</strong>
                    ${hasArchive
        ? `<button type="button" class="mypage-button mypage-btn-fit mypage-history-btn" ${redownloadAttr}>다운로드</button>`
        : '<button type="button" class="mypage-button mypage-button--ghost mypage-btn-fit mypage-history-btn" data-regenerate-index="' + index + '">동일 설정으로 다시 생성</button>'}
                </div>
                <span class="mypage-history-compact">${escapeHtml(compactMeta)}</span>
            </article>
        `;
    }).join('');
};

const renderTestHistory = (container, summaryEl, history) => {
    if (!container || !summaryEl) return;
    if (history.length === 0) {
        summaryEl.textContent = '기록 0건';
        container.innerHTML = '<p class="subtitle">온라인 테스트 기록이 없습니다.</p>';
        return;
    }

    const averageAccuracy = history.reduce((acc, entry) => acc + Number(entry?.summary?.accuracy || 0), 0) / history.length;
    summaryEl.textContent = `총 ${history.length}회 · 평균 정답률 ${averageAccuracy.toFixed(1)}%`;

    container.innerHTML = history.map((entry, index) => {
        const score = Number(entry?.summary?.correct || 0);
        const total = Number(entry?.summary?.total || 0);
        const accuracy = Number(entry?.summary?.accuracy || 0).toFixed(1);
        const finishedAt = formatLocalDatetime(entry?.finishedAt);
        const bookLabel = getBookLabel(entry?.config?.bookKey);
        const compactLine = `${index + 1}. ${finishedAt} · ${bookLabel} · 점수 ${score}/${total} (${accuracy}%)`;

        return `
            <article class="test-history-item mypage-history-item">
                <strong class="mypage-history-title">${escapeHtml(compactLine)}</strong>
            </article>
        `;
    }).join('');
};

const refreshHistoryUI = (ui) => {
    state.generatorHistory = safeParseHistory(localStorage.getItem(GENERATOR_HISTORY_KEY), GENERATOR_HISTORY_LIMIT);
    state.testHistory = safeParseHistory(localStorage.getItem(TEST_HISTORY_KEY), TEST_HISTORY_LIMIT);
    renderGeneratorHistory(ui.generatorHistory, ui.generatorSummary, state.generatorHistory);
    renderTestHistory(ui.testHistory, ui.testSummary, state.testHistory);

    if (ui.generatorCount) {
        ui.generatorCount.textContent = `${state.generatorHistory.length}건`;
    }
    if (ui.testCount) {
        ui.testCount.textContent = `${state.testHistory.length}건`;
    }
};

const renderAccountInfo = (ui) => {
    const user = state.user;
    if (!user) return;

    if (ui.heroEmail) ui.heroEmail.textContent = user.email || '-';

    if (ui.createdAt) ui.createdAt.textContent = formatLocalDatetime(user.created_at);
    if (ui.lastSignin) ui.lastSignin.textContent = formatLocalDatetime(user.last_sign_in_at);
    const provider = getCurrentAuthProvider();
    if (ui.authProvider) {
        ui.authProvider.textContent = getProviderLabel(provider);
    }
    const canChangePassword = provider === 'email';
    if (ui.passwordOpenBtn) {
        ui.passwordOpenBtn.classList.toggle('hidden', !canChangePassword);
        ui.passwordOpenBtn.disabled = !canChangePassword;
    }
    if (!canChangePassword) {
        togglePasswordForm(ui, false);
    }
};

const renderPurchaseSummary = (ui) => {
    if (!ui.purchaseSummary && !ui.purchaseBadge) return;

    if (state.isBookPurchaseVerified) {
        if (ui.purchaseSummary) {
            ui.purchaseSummary.textContent = '인증 상태: 완료 (제한 없음)';
        }
        if (ui.purchaseBadge) ui.purchaseBadge.textContent = '완료';
        if (ui.purchaseCodeInput) {
            ui.purchaseCodeInput.disabled = true;
            ui.purchaseCodeInput.placeholder = '인증 완료';
        }
        if (ui.purchaseVerifyBtn) {
            ui.purchaseVerifyBtn.disabled = true;
            ui.purchaseVerifyBtn.textContent = '인증완료';
        }
        return;
    }

    if (ui.purchaseCodeInput) {
        ui.purchaseCodeInput.disabled = false;
        ui.purchaseCodeInput.placeholder = '책 구매 인증하기';
    }
    if (ui.purchaseVerifyBtn) {
        ui.purchaseVerifyBtn.disabled = false;
        ui.purchaseVerifyBtn.textContent = '인증하기';
    }
    if (ui.purchaseBadge) ui.purchaseBadge.textContent = '미인증';
    const limit = Number.isInteger(state.dailyDownloadLimit) && state.dailyDownloadLimit > 0
        ? state.dailyDownloadLimit
        : 1;
    const used = Math.max(0, Number.parseInt(state.dailyDownloadUsed, 10) || 0);
    const remaining = Math.max(0, limit - used);
    if (ui.purchaseSummary) {
        ui.purchaseSummary.textContent = `인증 상태: 미인증 · 시험지 다운로드 잔여 ${remaining}/${limit}회`;
    }
};

const syncEntitlementState = (payload) => {
    if (!payload || typeof payload !== 'object') return;
    state.isBookPurchaseVerified = Boolean(payload.isBookPurchaseVerified);
    const limitRaw = Number.parseInt(payload.dailyDownloadLimit, 10);
    state.dailyDownloadLimit = Number.isInteger(limitRaw) && limitRaw > 0 ? limitRaw : 1;
    const usedRaw = Number.parseInt(payload.dailyDownloadUsed, 10);
    state.dailyDownloadUsed = Number.isInteger(usedRaw) && usedRaw >= 0 ? usedRaw : 0;
    state.canDownload = Boolean(payload.canDownload);
};

const resetPasswordForm = (ui) => {
    if (ui.passwordEmailInput) ui.passwordEmailInput.value = '';
    if (ui.passwordInput) ui.passwordInput.value = '';
    if (ui.passwordConfirmInput) ui.passwordConfirmInput.value = '';
};

const togglePasswordForm = (ui, shouldOpen) => {
    if (!ui.passwordForm) return;
    ui.passwordForm.classList.toggle('hidden', !shouldOpen);
    if (!shouldOpen) {
        resetPasswordForm(ui);
        return;
    }
    if (ui.passwordEmailInput) {
        ui.passwordEmailInput.focus();
    }
};

const handlePasswordSave = async (event, ui) => {
    event.preventDefault();
    if (getCurrentAuthProvider() !== 'email') {
        setStatus(ui.securityStatus, 'Google/Kakao 로그인 계정은 비밀번호 변경을 지원하지 않습니다.', 'error');
        togglePasswordForm(ui, false);
        return;
    }

    const typedEmail = normalizeSpacingText(ui.passwordEmailInput?.value).toLowerCase();
    const accountEmail = normalizeSpacingText(state.user?.email).toLowerCase();
    const password = String(ui.passwordInput?.value || '');
    const passwordConfirm = String(ui.passwordConfirmInput?.value || '');

    if (!typedEmail || typedEmail !== accountEmail) {
        setStatus(ui.securityStatus, '아이디(이메일)를 정확히 입력해 주세요.', 'error');
        return;
    }
    if (password.length < 8) {
        setStatus(ui.securityStatus, '비밀번호는 8자 이상으로 입력해 주세요.', 'error');
        return;
    }
    if (password !== passwordConfirm) {
        setStatus(ui.securityStatus, '비밀번호 확인 값이 일치하지 않습니다.', 'error');
        return;
    }

    setStatus(ui.securityStatus, '비밀번호를 변경하고 있습니다...');
    const { error } = await supabase.auth.updateUser({ password });
    if (error) {
        setStatus(ui.securityStatus, error.message || '비밀번호 변경에 실패했습니다.', 'error');
        return;
    }

    togglePasswordForm(ui, false);
    setStatus(ui.securityStatus, '비밀번호가 변경되었습니다.', 'success');
};

const handleLogout = async (scope, ui) => {
    const confirmMessage = scope === 'global'
        ? '모든 기기에서 로그아웃하시겠습니까?'
        : '로그아웃하시겠습니까?';
    if (!window.confirm(confirmMessage)) return;

    setStatus(ui.securityStatus, '로그아웃 중입니다...');
    try {
        await supabase.auth.signOut({ scope });
    } finally {
        window.location.href = '/auth/';
    }
};

const getAccessToken = async () => {
    const { data, error } = await supabase.auth.getSession();
    if (error || !data?.session?.access_token) {
        throw new Error('로그인 세션이 만료되었습니다. 다시 로그인 후 시도해 주세요.');
    }
    return data.session.access_token;
};

const requestEntitlement = async (action = 'status') => {
    const accessToken = await getAccessToken();
    const response = await fetch(ENTITLEMENT_API_PATH, {
        method: 'POST',
        headers: {
            'content-type': 'application/json',
            authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({ action }),
    });

    const payload = await response.json().catch(() => null);
    if (!response.ok || !payload?.ok) {
        const message = normalizeSpacingText(payload?.error) || '권한 정보를 불러오지 못했습니다.';
        throw new Error(message);
    }

    syncEntitlementState(payload);
    return payload;
};

const requestBookPurchaseVerify = async (masterCode) => {
    const accessToken = await getAccessToken();
    const response = await fetch(BOOK_VERIFY_API_PATH, {
        method: 'POST',
        headers: {
            'content-type': 'application/json',
            authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({
            masterCode: normalizeSpacingText(masterCode),
        }),
    });

    const payload = await response.json().catch(() => null);
    if (!response.ok || !payload?.ok) {
        const message = normalizeSpacingText(payload?.error) || '책구매 인증에 실패했습니다.';
        throw new Error(message);
    }
    return payload;
};

const requestDeleteAccount = async () => {
    const accessToken = await getAccessToken();
    const response = await fetch('/api/account/delete', {
        method: 'POST',
        headers: {
            'content-type': 'application/json',
            authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({}),
    });

    let payload = null;
    try {
        payload = await response.json();
    } catch (_) {
        payload = null;
    }

    if (!response.ok || !payload?.ok) {
        const message = normalizeSpacingText(payload?.error) || '계정 탈퇴 처리에 실패했습니다.';
        throw new Error(message);
    }
};

const requestConsult = async (payloadBody) => {
    const accessToken = await getAccessToken();
    const response = await fetch('/api/consult', {
        method: 'POST',
        headers: {
            'content-type': 'application/json',
            authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify(payloadBody || {}),
    });

    let payload = null;
    try {
        payload = await response.json();
    } catch (_) {
        payload = null;
    }

    if (!response.ok || !payload?.ok) {
        const message = normalizeSpacingText(payload?.error) || '상담 요청 전송에 실패했습니다.';
        throw new Error(message);
    }
};

const clearLocalAccountData = async () => {
    localStorage.removeItem(TEST_HISTORY_KEY);
    localStorage.removeItem(GENERATOR_HISTORY_KEY);
    localStorage.removeItem(GENERATOR_RESTORE_REQUEST_KEY);
    state.generatorHistory = [];
    state.testHistory = [];

    try {
        await clearGeneratorArchives();
    } catch (error) {
        console.warn('로컬 시험지 보관함 정리 실패:', error);
    }
};

const handleDeleteAccountRequest = async (ui) => {
    const typed = window.prompt('계정 탈퇴를 진행하려면 DELETE를 입력하세요.');
    if (typed === null) return;
    if (String(typed).trim() !== 'DELETE') {
        setStatus(ui.securityStatus, '탈퇴가 취소되었습니다. DELETE를 정확히 입력해 주세요.', 'error');
        return;
    }
    if (!window.confirm('정말 계정을 즉시 탈퇴하시겠습니까? 이 작업은 되돌릴 수 없습니다.')) return;

    const deleteButton = ui.deleteAccountBtn;
    if (deleteButton) deleteButton.disabled = true;
    setStatus(ui.securityStatus, '회원 탈퇴 처리 중입니다...');

    try {
        await requestDeleteAccount();
        await clearLocalAccountData();
        setStatus(ui.securityStatus, '회원 탈퇴가 완료되었습니다. 초기 화면으로 이동합니다.', 'success');
        try {
            await supabase.auth.signOut({ scope: 'local' });
        } catch (_) {
            // 계정이 이미 삭제된 상태에서는 signOut이 실패할 수 있습니다.
        }
        window.location.replace('/');
    } catch (error) {
        setStatus(ui.securityStatus, error?.message || '회원 탈퇴 처리에 실패했습니다. 잠시 후 다시 시도해 주세요.', 'error');
    } finally {
        if (deleteButton) deleteButton.disabled = false;
    }
};

const handleSupportSubmit = async (event, ui) => {
    event.preventDefault();
    const subjectRaw = normalizeSpacingText(ui.supportSubject?.value);
    const messageRaw = String(ui.supportMessage?.value || '').trim();
    if (!subjectRaw || !messageRaw) {
        setStatus(ui.supportStatus, '문의 제목과 내용을 모두 입력해 주세요.', 'error');
        return;
    }
    if (!state.user) {
        setStatus(ui.supportStatus, '로그인 상태를 확인할 수 없습니다. 다시 로그인해 주세요.', 'error');
        return;
    }

    const submitButton = ui.supportForm?.querySelector('button[type="submit"]');
    if (submitButton) submitButton.disabled = true;
    setStatus(ui.supportStatus, '상담 요청을 전송하고 있습니다...');

    try {
        const metadata = state.user.user_metadata || {};
        await requestConsult({
            subject: subjectRaw,
            message: messageRaw,
            page: '/mypage/',
            email: normalizeSpacingText(state.user.email),
            userId: normalizeSpacingText(state.user.id),
            displayName: normalizeSpacingText(metadata.display_name),
        });
        if (ui.supportSubject) ui.supportSubject.value = '';
        if (ui.supportMessage) ui.supportMessage.value = '';
        setStatus(ui.supportStatus, '상담 요청이 접수되었습니다. 입력하신 계정으로 회신드리겠습니다.', 'success');
    } catch (error) {
        setStatus(ui.supportStatus, error?.message || '상담 요청 전송에 실패했습니다. 잠시 후 다시 시도해 주세요.', 'error');
    } finally {
        if (submitButton) submitButton.disabled = false;
    }
};

const refreshEntitlementForUi = async (ui) => {
    try {
        await requestEntitlement('status');
    } catch (error) {
        // Fallback to user metadata-based rendering.
        state.isBookPurchaseVerified = getPurchaseVerifiedFromUser(state.user);
        const usedFallback = state.isBookPurchaseVerified ? 0 : getFallbackDailyDownloadCount();
        state.dailyDownloadLimit = UNVERIFIED_DAILY_DOWNLOAD_LIMIT;
        state.dailyDownloadUsed = usedFallback;
        state.canDownload = state.isBookPurchaseVerified || usedFallback < UNVERIFIED_DAILY_DOWNLOAD_LIMIT;
        if (ui?.purchaseStatus) {
            setStatus(ui.purchaseStatus, error?.message || '인증 상태를 확인하지 못했습니다.', 'error');
        }
    }
    renderPurchaseSummary(ui);
};

const handleBookPurchaseVerify = async (event, ui) => {
    event.preventDefault();
    const typedCode = normalizeSpacingText(ui.purchaseCodeInput?.value);
    if (!typedCode) {
        setStatus(ui.purchaseStatus, '마스터코드를 입력해 주세요.', 'error');
        return;
    }

    if (ui.purchaseVerifyBtn) ui.purchaseVerifyBtn.disabled = true;
    setStatus(ui.purchaseStatus, '책구매 인증을 확인하고 있습니다...');

    try {
        await requestBookPurchaseVerify(typedCode);
        if (ui.purchaseCodeInput) ui.purchaseCodeInput.value = '';

        const { data: userData } = await supabase.auth.getUser();
        if (userData?.user) {
            state.user = userData.user;
        }

        await refreshEntitlementForUi(ui);
        renderAccountInfo(ui);
        setStatus(ui.purchaseStatus, '책구매 인증이 완료되었습니다. 이제 제한 없이 이용할 수 있습니다.', 'success');
    } catch (error) {
        setStatus(ui.purchaseStatus, error?.message || '책구매 인증에 실패했습니다.', 'error');
    } finally {
        if (ui.purchaseVerifyBtn && !state.isBookPurchaseVerified) {
            ui.purchaseVerifyBtn.disabled = false;
        }
    }
};

const handleGeneratorHistoryDownload = async (event, ui) => {
    const trigger = event.target?.closest?.('button[data-redownload-index]');
    if (!trigger) return;
    const index = Number(trigger.dataset.redownloadIndex);
    if (!Number.isInteger(index) || index < 0) return;
    const historyEntry = state.generatorHistory[index];
    if (!historyEntry) return;

    const archiveId = normalizeSpacingText(historyEntry.archiveId);
    if (!archiveId) {
        setStatus(ui.generatorStatus, '이 기록은 재다운로드용 파일이 저장되지 않았습니다.', 'error');
        return;
    }

    const button = trigger;

    if (button) button.disabled = true;
    setStatus(ui.generatorStatus, '파일을 불러오는 중입니다...');

    try {
        const archive = await getGeneratorArchive(archiveId);
        const files = Array.isArray(archive?.files) ? archive.files : [];
        if (files.length === 0) {
            setStatus(ui.generatorStatus, '저장된 파일을 찾지 못했습니다. 새로 시험지를 생성해 주세요.', 'error');
            return;
        }

        let canDownload = false;
        try {
            const entitlement = await requestEntitlement('consume_generator_download');
            canDownload = Boolean(entitlement?.isBookPurchaseVerified) || Boolean(entitlement?.consumed);
        } catch (quotaError) {
            canDownload = state.isBookPurchaseVerified || consumeFallbackDailyDownloadQuota();
            const usedFallback = state.isBookPurchaseVerified ? 0 : getFallbackDailyDownloadCount();
            state.dailyDownloadUsed = usedFallback;
            state.canDownload = state.isBookPurchaseVerified || usedFallback < UNVERIFIED_DAILY_DOWNLOAD_LIMIT;
            if (!canDownload) {
                renderPurchaseSummary(ui);
                setStatus(ui.generatorStatus, DOWNLOAD_LIMIT_MESSAGE, 'error');
                return;
            }
        }
        if (!canDownload) {
            renderPurchaseSummary(ui);
            setStatus(ui.generatorStatus, DOWNLOAD_LIMIT_MESSAGE, 'error');
            return;
        }

        for (const file of files) {
            const fileName = normalizeSpacingText(file?.name) || '시험지';
            downloadBlob(file?.blob, fileName);
            await sleep(420);
        }
        renderPurchaseSummary(ui);
        setStatus(ui.generatorStatus, '과거 시험지 다운로드를 시작했습니다.', 'success');
    } catch (error) {
        setStatus(ui.generatorStatus, '파일 다운로드에 실패했습니다. 다시 시도해 주세요.', 'error');
        console.error(error);
    } finally {
        if (button) button.disabled = false;
    }
};

const handleGeneratorHistoryRegenerate = (event, ui) => {
    const trigger = event.target?.closest?.('[data-regenerate-index]');
    if (!trigger) return false;
    const index = Number(trigger.dataset.regenerateIndex);
    if (!Number.isInteger(index) || index < 0) return true;

    const historyEntry = state.generatorHistory[index];
    if (!historyEntry) {
        setStatus(ui.generatorStatus, '기록을 찾지 못했습니다. 새로고침 후 다시 시도해 주세요.', 'error');
        return true;
    }

    const requestPayload = buildGeneratorRestoreRequest(historyEntry);
    if (!state.isBookPurchaseVerified && requestPayload?.config) {
        requestPayload.config.includeDerivatives = false;
    }
    const bookKey = normalizeSpacingText(requestPayload?.config?.bookKey).toLowerCase();
    if (!bookKey || requestPayload.config.selectedTocs.length === 0) {
        setStatus(ui.generatorStatus, '설정 정보가 부족하여 자동 재생성이 어렵습니다. 생성 페이지에서 다시 선택해 주세요.', 'error');
        return true;
    }

    try {
        localStorage.setItem(GENERATOR_RESTORE_REQUEST_KEY, JSON.stringify(requestPayload));
        setStatus(ui.generatorStatus, '생성 페이지로 이동합니다. 동일 설정으로 파일을 다시 만듭니다.');
        window.location.href = '/generator/';
    } catch (error) {
        console.error(error);
        setStatus(ui.generatorStatus, '재생성 요청 저장에 실패했습니다. 다시 시도해 주세요.', 'error');
    }
    return true;
};

const handleClearGeneratorHistory = async (ui) => {
    if (state.generatorHistory.length === 0) {
        setStatus(ui.securityStatus, '삭제할 시험지 기록이 없습니다.');
        return;
    }
    if (!window.confirm('내 시험지 기록을 모두 삭제하시겠습니까?\n재다운로드 파일도 함께 삭제됩니다.')) return;

    if (ui.generatorClearBtn) ui.generatorClearBtn.disabled = true;
    setStatus(ui.securityStatus, '시험지 기록을 삭제하는 중입니다...');
    try {
        localStorage.removeItem(GENERATOR_HISTORY_KEY);
        await clearGeneratorArchives();
        refreshHistoryUI(ui);
        setStatus(ui.securityStatus, '내 시험지 기록을 삭제했습니다.', 'success');
    } catch (error) {
        console.error(error);
        setStatus(ui.securityStatus, '기록 삭제에 실패했습니다. 다시 시도해 주세요.', 'error');
    } finally {
        if (ui.generatorClearBtn) ui.generatorClearBtn.disabled = false;
    }
};

const handleClearTestHistory = async (ui) => {
    if (state.testHistory.length === 0) {
        setStatus(ui.securityStatus, '삭제할 온라인 테스트 기록이 없습니다.');
        return;
    }
    if (!window.confirm('온라인 테스트 기록을 모두 삭제하시겠습니까?')) return;

    if (ui.testClearBtn) ui.testClearBtn.disabled = true;
    setStatus(ui.securityStatus, '온라인 테스트 기록을 삭제하는 중입니다...');
    try {
        localStorage.removeItem(TEST_HISTORY_KEY);
        refreshHistoryUI(ui);
        setStatus(ui.securityStatus, '온라인 테스트 기록을 삭제했습니다.', 'success');
    } catch (error) {
        console.error(error);
        setStatus(ui.securityStatus, '기록 삭제에 실패했습니다. 다시 시도해 주세요.', 'error');
    } finally {
        if (ui.testClearBtn) ui.testClearBtn.disabled = false;
    }
};

const bindEvents = (ui) => {
    ui.passwordOpenBtn?.addEventListener('click', () => {
        if (getCurrentAuthProvider() !== 'email') {
            setStatus(ui.securityStatus, 'Google/Kakao 로그인 계정은 비밀번호 변경을 지원하지 않습니다.', 'error');
            togglePasswordForm(ui, false);
            return;
        }
        setStatus(ui.securityStatus, '');
        togglePasswordForm(ui, true);
    });

    ui.passwordForm?.addEventListener('submit', (event) => {
        void handlePasswordSave(event, ui);
    });

    ui.passwordCancelBtn?.addEventListener('click', () => {
        setStatus(ui.securityStatus, '');
        togglePasswordForm(ui, false);
    });

    ui.logoutLocalBtn?.addEventListener('click', () => {
        void handleLogout('local', ui);
    });

    ui.deleteAccountBtn?.addEventListener('click', () => {
        void handleDeleteAccountRequest(ui);
    });

    ui.generatorHistory?.addEventListener('click', (event) => {
        const handled = handleGeneratorHistoryRegenerate(event, ui);
        if (handled) return;
        void handleGeneratorHistoryDownload(event, ui);
    });

    ui.generatorClearBtn?.addEventListener('click', () => {
        void handleClearGeneratorHistory(ui);
    });

    ui.testClearBtn?.addEventListener('click', () => {
        void handleClearTestHistory(ui);
    });

    ui.supportForm?.addEventListener('submit', (event) => {
        void handleSupportSubmit(event, ui);
    });

    ui.purchaseForm?.addEventListener('submit', (event) => {
        void handleBookPurchaseVerify(event, ui);
    });
};

export const initMyPage = async () => {
    const ui = getUi();
    togglePasswordForm(ui, false);
    refreshHistoryUI(ui);
    bindEvents(ui);

    const [{ data: sessionData }, { data: userData }] = await Promise.all([
        supabase.auth.getSession(),
        supabase.auth.getUser(),
    ]);

    state.session = sessionData?.session || null;
    state.user = userData?.user || state.session?.user || null;
    renderAccountInfo(ui);
    renderPurchaseSummary(ui);
    await refreshEntitlementForUi(ui);
};
