import { supabase } from '/src/lib/supabaseClient.js';

const TEST_HISTORY_KEY = 'voca_plus_test_history_v1';
const GENERATOR_HISTORY_KEY = 'voca_plus_generator_history_v1';
const TEST_HISTORY_LIMIT = 10;
const GENERATOR_HISTORY_LIMIT = 20;
const GENERATOR_ARCHIVE_DB_NAME = 'voca_plus_generator_archive_v1';
const GENERATOR_ARCHIVE_STORE_NAME = 'archives';
const GENERATOR_RESTORE_REQUEST_KEY = 'voca_plus_generator_restore_request_v1';
const SUPPORT_EMAIL = 'support@voca.plus';

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
    return {
        heroEmail: document.getElementById('mypage-hero-email'),
        generatorCount: document.getElementById('mypage-generator-count'),
        testCount: document.getElementById('mypage-test-count'),

        profileForm: document.getElementById('mypage-profile-form'),
        profileEmail: document.getElementById('mypage-email'),
        profileName: document.getElementById('mypage-display-name'),
        profileSchool: document.getElementById('mypage-school'),
        profileGrade: document.getElementById('mypage-grade'),
        profileStatus: document.getElementById('mypage-profile-status'),

        createdAt: document.getElementById('mypage-created-at'),
        lastSignin: document.getElementById('mypage-last-signin'),
        authProvider: document.getElementById('mypage-auth-provider'),
        passwordOpenBtn: document.getElementById('mypage-password-open'),
        passwordForm: document.getElementById('mypage-password-form'),
        passwordEmailInput: document.getElementById('mypage-password-email'),
        passwordInput: document.getElementById('mypage-password'),
        passwordConfirmInput: document.getElementById('mypage-password-confirm'),
        passwordCancelBtn: document.getElementById('mypage-password-cancel'),
        securityStatus: document.getElementById('mypage-security-status'),
        logoutLocalBtn: document.getElementById('mypage-logout-local'),
        logoutAllBtn: document.getElementById('mypage-logout-all'),
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
        const selectedCount = Array.isArray(config.selectedTocs) ? config.selectedTocs.length : 0;
        const examTitle = normalizeSpacingText(config.examTitle) || '어휘 시험지';
        const outputFormat = normalizeSpacingText(config.outputFormat) || '-';
        const testType = normalizeSpacingText(config.testType) || '-';
        const fileList = Array.isArray(entry?.files)
            ? entry.files.map((name) => normalizeSpacingText(name)).filter(Boolean)
            : [];
        const fileSummary = fileList.length === 0
            ? '-'
            : fileList.length === 1
                ? fileList[0]
                : `${fileList[0]} 외 ${fileList.length - 1}개`;
        const hasArchive = Boolean(normalizeSpacingText(entry?.archiveId));
        const redownloadAttr = hasArchive ? `data-redownload-index="${index}"` : '';
        const compactMeta = `생성 ${generatedAt} · 교재 ${getBookLabel(config.bookKey || config.bookName)} · ${outputFormat}/${testType} · ${questionCount}문항 · 범위 ${selectedCount}개 · 파일 ${fileSummary}`;

        return `
            <article class="test-history-item mypage-history-item" ${redownloadAttr}>
                <strong class="mypage-history-title">${index + 1}. ${escapeHtml(examTitle)}</strong>
                <span class="mypage-history-compact">${escapeHtml(compactMeta)}</span>
                <div class="mypage-action-row">
                    ${hasArchive
        ? `<button type="button" class="mypage-button mypage-btn-fit" ${redownloadAttr}>파일 다시 다운로드</button>`
        : '<button type="button" class="mypage-button mypage-button--ghost mypage-btn-fit" data-regenerate-index="' + index + '">동일 설정으로 다시 생성</button>'}
                </div>
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
        const examType = normalizeSpacingText(entry?.config?.examType) || '-';

        return `
            <article class="test-history-item mypage-history-item">
                <strong>${index + 1}. ${escapeHtml(finishedAt)}</strong>
                <span>교재: ${escapeHtml(getBookLabel(entry?.config?.bookKey))}</span>
                <span>유형: ${escapeHtml(examType)} · 점수: ${score}/${total} (${accuracy}%)</span>
                <span class="mypage-history-subtle">인증코드: ${escapeHtml(entry?.verificationCode || '-')}</span>
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

    const metadata = user.user_metadata || {};
    if (ui.heroEmail) ui.heroEmail.textContent = user.email || '-';
    if (ui.profileEmail) ui.profileEmail.value = user.email || '';
    if (ui.profileName) ui.profileName.value = normalizeSpacingText(metadata.display_name);
    if (ui.profileSchool) ui.profileSchool.value = normalizeSpacingText(metadata.school_name);
    if (ui.profileGrade) ui.profileGrade.value = normalizeSpacingText(metadata.grade);

    if (ui.createdAt) ui.createdAt.textContent = formatLocalDatetime(user.created_at);
    if (ui.lastSignin) ui.lastSignin.textContent = formatLocalDatetime(user.last_sign_in_at);
    if (ui.authProvider) {
        const provider = user?.app_metadata?.provider || state.session?.user?.app_metadata?.provider || 'email';
        ui.authProvider.textContent = getProviderLabel(provider);
    }
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

const handleProfileSave = async (event, ui) => {
    event.preventDefault();
    if (!state.user) return;

    const displayName = normalizeSpacingText(ui.profileName?.value);
    const schoolName = normalizeSpacingText(ui.profileSchool?.value);
    const grade = normalizeSpacingText(ui.profileGrade?.value);

    setStatus(ui.profileStatus, '저장 중입니다...');
    const { error } = await supabase.auth.updateUser({
        data: {
            display_name: displayName,
            school_name: schoolName,
            grade,
        },
    });

    if (error) {
        setStatus(ui.profileStatus, error.message || '내 정보 저장에 실패했습니다.', 'error');
        return;
    }

    const { data } = await supabase.auth.getUser();
    if (data?.user) {
        state.user = data.user;
        renderAccountInfo(ui);
    }
    setStatus(ui.profileStatus, '내 정보가 저장되었습니다.', 'success');
};

const handlePasswordSave = async (event, ui) => {
    event.preventDefault();
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
        : '이 기기에서 로그아웃하시겠습니까?';
    if (!window.confirm(confirmMessage)) return;

    setStatus(ui.securityStatus, '로그아웃 중입니다...');
    try {
        await supabase.auth.signOut({ scope });
    } finally {
        window.location.href = '/auth/';
    }
};

const handleDeleteAccountRequest = (ui) => {
    const typed = window.prompt('계정 탈퇴를 진행하려면 DELETE를 입력하세요.');
    if (typed === null) return;
    if (String(typed).trim() !== 'DELETE') {
        setStatus(ui.securityStatus, '탈퇴가 취소되었습니다. DELETE를 정확히 입력해 주세요.', 'error');
        return;
    }
    if (!window.confirm('정말 계정 탈퇴 요청을 진행하시겠습니까?')) return;

    const email = state.user?.email || '';
    const userId = state.user?.id || '';
    const subject = encodeURIComponent('[평가원기출VOCA] 계정 탈퇴 요청');
    const body = encodeURIComponent(
        [
            '아래 계정의 탈퇴를 요청합니다.',
            '',
            `email: ${email}`,
            `user_id: ${userId}`,
            `requested_at: ${new Date().toISOString()}`,
            '',
            '추가 요청사항:',
        ].join('\n'),
    );
    window.location.href = `mailto:${SUPPORT_EMAIL}?subject=${subject}&body=${body}`;
    setStatus(ui.securityStatus, `메일 앱이 열렸습니다. ${SUPPORT_EMAIL}로 요청을 보내 주세요.`);
};

const handleSupportSubmit = (event, ui) => {
    event.preventDefault();
    const subjectRaw = normalizeSpacingText(ui.supportSubject?.value);
    const messageRaw = String(ui.supportMessage?.value || '').trim();
    if (!subjectRaw || !messageRaw) {
        setStatus(ui.supportStatus, '문의 제목과 내용을 모두 입력해 주세요.', 'error');
        return;
    }

    const email = state.user?.email || '';
    const userId = state.user?.id || '';
    const subject = encodeURIComponent(`[평가원기출VOCA 문의] ${subjectRaw}`);
    const body = encodeURIComponent(
        [
            `email: ${email}`,
            `user_id: ${userId}`,
            `page: /mypage/`,
            `created_at: ${new Date().toISOString()}`,
            '',
            '[문의 내용]',
            messageRaw,
        ].join('\n'),
    );
    window.location.href = `mailto:${SUPPORT_EMAIL}?subject=${subject}&body=${body}`;
    setStatus(ui.supportStatus, '문의 메일 작성 창을 열었습니다.', 'success');
};

const handleGeneratorHistoryDownload = async (event, ui) => {
    const trigger = event.target?.closest?.('[data-redownload-index]');
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

    const button = trigger.tagName === 'BUTTON'
        ? trigger
        : trigger.querySelector('button[data-redownload-index]');

    if (button) button.disabled = true;
    setStatus(ui.generatorStatus, '파일을 불러오는 중입니다...');

    try {
        const archive = await getGeneratorArchive(archiveId);
        const files = Array.isArray(archive?.files) ? archive.files : [];
        if (files.length === 0) {
            setStatus(ui.generatorStatus, '저장된 파일을 찾지 못했습니다. 새로 시험지를 생성해 주세요.', 'error');
            return;
        }

        for (const file of files) {
            const fileName = normalizeSpacingText(file?.name) || '시험지';
            downloadBlob(file?.blob, fileName);
            await sleep(420);
        }
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

const bindEvents = (ui) => {
    ui.profileForm?.addEventListener('submit', (event) => {
        void handleProfileSave(event, ui);
    });

    ui.passwordOpenBtn?.addEventListener('click', () => {
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

    ui.logoutAllBtn?.addEventListener('click', () => {
        void handleLogout('global', ui);
    });

    ui.deleteAccountBtn?.addEventListener('click', () => {
        handleDeleteAccountRequest(ui);
    });

    ui.generatorHistory?.addEventListener('click', (event) => {
        const handled = handleGeneratorHistoryRegenerate(event, ui);
        if (handled) return;
        void handleGeneratorHistoryDownload(event, ui);
    });

    ui.generatorClearBtn?.addEventListener('click', () => {
        void handleClearGeneratorHistory(ui);
    });

    ui.supportForm?.addEventListener('submit', (event) => {
        handleSupportSubmit(event, ui);
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
};
