import {
    loadBookDataset,
    getAvailableChaptersForEtymology,
    getTocsForChapter,
    getDayTocs,
    getScopePool,
    getAllBookPool,
    normalizeText,
} from '/src/domain/data/vocabRepository.js';
import { buildQuestionSet } from '/src/domain/engine/questionSetBuilder.js';
import { supabase } from '/src/lib/supabaseClient.js';

const HISTORY_KEY = 'voca_plus_test_history_v1';
const TEST_RESULT_RESTORE_KEY = 'voca_plus_test_result_restore_v1';
const HISTORY_LIMIT = 10;
const MAX_QUESTION_COUNT = 200;
const UNVERIFIED_MAX_QUESTION_COUNT = 50;
const ENTITLEMENT_API_PATH = '/api/account/entitlement';
const PURCHASE_VERIFIED_KEYS = [
    'book_purchase_verified',
    'bookPurchaseVerified',
    'purchase_verified',
    'purchaseVerified',
    'is_book_purchase_verified',
    'isBookPurchaseVerified',
];

const state = {
    bookKey: 'basic',
    chapterId: '',
    selectedTocs: new Set(),
    includeDerivatives: false,
    examType: 'E2K',
    questionCount: 0,
    timeLimitMinutes: 0,
    shuffleQuestions: true,

    scopePool: [],
    bookPool: [],

    session: null,
    result: null,
    history: [],
    allowUnsafeExit: false,

    isUpdatingScope: false,
    isBookPurchaseVerified: false,
    purchasePolicyNoticeShown: false,
};

const ui = {
    setupView: document.getElementById('test-setup-view'),
    setupHistoryView: document.getElementById('test-history-setup'),
    runView: document.getElementById('test-run-view'),
    resultView: document.getElementById('test-result-view'),
    resultHistoryView: document.getElementById('test-history-result'),

    bookOptions: document.getElementById('book-options'),
    chapterGroup: document.getElementById('chapter-group'),
    chapterOptions: document.getElementById('chapter-options'),
    tocChecklist: document.getElementById('test-toc-checklist'),
    scopeSummary: document.getElementById('test-scope-summary'),

    includeDerivativesGroup: document.getElementById('include-derivatives-group'),
    includeDerivativesToggle: document.getElementById('include-derivatives-toggle'),

    examTypeOptions: document.getElementById('exam-type-options'),
    questionCountInput: document.getElementById('test-question-count'),
    timeLimitInput: document.getElementById('test-time-limit'),
    shuffleToggle: document.getElementById('test-shuffle-toggle'),
    startBtn: document.getElementById('test-start-btn'),

    recentSetup: document.getElementById('recent-tests-setup'),
    recentResult: document.getElementById('recent-tests-result'),

    progressText: document.getElementById('test-progress'),
    remainingTimeText: document.getElementById('test-remaining-time'),
    pronounceBtn: document.getElementById('test-pronounce-btn'),
    questionPrompt: document.getElementById('test-question-prompt'),
    choiceList: document.getElementById('test-choice-list'),
    submitBtn: document.getElementById('test-submit-btn'),

    resultHeadline: document.getElementById('result-headline'),
    resultMetrics: document.getElementById('result-metrics'),
    reviewListCorrect: document.getElementById('result-review-list-correct'),
    reviewListWrong: document.getElementById('result-review-list-wrong'),

    retryWrongBtn: document.getElementById('retry-wrong-btn'),
    retryScopeBtn: document.getElementById('retry-scope-btn'),
};

const normalizeSpacingText = (value) => normalizeText(value);
const EXIT_CONFIRM_MESSAGE = '시험이 아직 제출되지 않았습니다.\n저장되지 않을 수 있습니다. 정말 나가시겠습니까?';

const CHAPTER_LABELS = {
    CH1: '접두사',
    CH2: '접미사',
    CH3: '어근',
};

const dayLabelToNumber = (label) => {
    const match = normalizeSpacingText(label).match(/^DAY\s*0?(\d{1,2})$/i);
    return match ? Number.parseInt(match[1], 10) : Number.POSITIVE_INFINITY;
};

const sortTocs = (tocs) => {
    return [...(tocs || [])].sort((a, b) => {
        const aDay = dayLabelToNumber(a);
        const bDay = dayLabelToNumber(b);
        if (Number.isFinite(aDay) || Number.isFinite(bDay)) {
            if (aDay !== bDay) return aDay - bDay;
        }
        return normalizeSpacingText(a).localeCompare(normalizeSpacingText(b), 'ko', { numeric: true });
    });
};

const escapeHtml = (value) => {
    return String(value || '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
};

const showToast = (message, type = 'info', duration = 2200) => {
    const container = document.getElementById('toast-container');
    if (!container) return;

    const toast = document.createElement('div');
    toast.className = `toast toast--${type}`;
    toast.textContent = message;
    container.appendChild(toast);

    requestAnimationFrame(() => toast.classList.add('is-visible'));
    window.setTimeout(() => {
        toast.classList.remove('is-visible');
        window.setTimeout(() => toast.remove(), 190);
    }, Math.max(900, duration));
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

const getQuestionSelectionLimit = () => (
    state.isBookPurchaseVerified ? MAX_QUESTION_COUNT : UNVERIFIED_MAX_QUESTION_COUNT
);

const syncDerivativeAccessUi = () => {
    if (!state.isBookPurchaseVerified) {
        state.includeDerivatives = false;
        if (ui.includeDerivativesToggle) {
            ui.includeDerivativesToggle.checked = false;
        }
    }
    const isEtymology = state.bookKey === 'etymology';
    const shouldHideDerivatives = isEtymology;
    ui.includeDerivativesGroup?.classList.toggle('hidden', shouldHideDerivatives);
};

const loadPurchaseAccess = async () => {
    try {
        const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
        if (sessionError || !sessionData?.session?.access_token) {
            throw new Error('NO_SESSION');
        }

        const response = await fetch(ENTITLEMENT_API_PATH, {
            method: 'POST',
            headers: {
                'content-type': 'application/json',
                authorization: `Bearer ${sessionData.session.access_token}`,
            },
            body: JSON.stringify({ action: 'status' }),
        });
        const payload = await response.json().catch(() => null);
        if (response.ok && payload?.ok) {
            state.isBookPurchaseVerified = Boolean(payload.isBookPurchaseVerified);
            return;
        }
    } catch (_) {
        // Fallback below.
    }

    const { data, error } = await supabase.auth.getUser();
    if (error) throw error;
    const user = data?.user || null;
    state.isBookPurchaseVerified = getPurchaseVerifiedFromUser(user);
};

const showPurchasePolicyNoticeIfNeeded = () => {
    if (state.isBookPurchaseVerified || state.purchasePolicyNoticeShown) return;
    state.purchasePolicyNoticeShown = true;
    showToast('책구매 인증 전에는 온라인 학습에서 파생어 학습이 제한됩니다.', 'info', 3000);
};

const isSpeechSupported = () => {
    return Boolean(window.speechSynthesis && typeof window.SpeechSynthesisUtterance === 'function');
};

const shouldSpeakPrompt = (question) => {
    return Boolean(question?.direction === 'E2K' && normalizeSpacingText(question?.prompt));
};

const pickEnglishVoice = () => {
    if (!isSpeechSupported()) return null;
    const voices = window.speechSynthesis.getVoices?.() || [];
    return voices.find((voice) => voice.lang === 'en-US')
        || voices.find((voice) => String(voice.lang || '').toLowerCase().startsWith('en'))
        || null;
};

const stopSpeech = () => {
    if (!isSpeechSupported()) return;
    window.speechSynthesis.cancel();
};

const speakQuestionPrompt = (question) => {
    if (!isSpeechSupported()) return false;
    if (!shouldSpeakPrompt(question)) return false;

    const text = normalizeSpacingText(question?.prompt);
    if (!text) return false;

    const utterance = new window.SpeechSynthesisUtterance(text);
    utterance.lang = 'en-US';
    utterance.rate = 0.92;
    utterance.pitch = 1;
    const voice = pickEnglishVoice();
    if (voice) utterance.voice = voice;

    stopSpeech();
    window.speechSynthesis.speak(utterance);
    return true;
};

const syncPronounceButton = (question) => {
    if (!ui.pronounceBtn) return;
    const shouldShow = shouldSpeakPrompt(question);
    const supported = isSpeechSupported();
    ui.pronounceBtn.classList.toggle('hidden', !shouldShow);
    ui.pronounceBtn.disabled = !shouldShow || !supported;
};

const setActiveOption = (container, selector, value, dataKey) => {
    container?.querySelectorAll(selector).forEach((item) => {
        item.classList.toggle('active', item.dataset[dataKey] === value);
    });
};

const formatDuration = (ms) => {
    const totalSec = Math.max(0, Math.floor(ms / 1000));
    const min = Math.floor(totalSec / 60);
    const sec = totalSec % 60;
    return `${String(min).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
};

const formatLocalDatetime = (isoString) => {
    const date = new Date(isoString);
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')} ${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}:${String(date.getSeconds()).padStart(2, '0')}`;
};

const isExitGuardActive = () => {
    return Boolean(state.session && !state.result && !state.session.isSubmitting && !state.allowUnsafeExit);
};

const allowUnsafeExitTemporarily = () => {
    state.allowUnsafeExit = true;
    window.setTimeout(() => {
        state.allowUnsafeExit = false;
    }, 1200);
};

const confirmExitIfNeeded = () => {
    if (!isExitGuardActive()) return true;
    const shouldLeave = window.confirm(EXIT_CONFIRM_MESSAGE);
    if (shouldLeave) {
        allowUnsafeExitTemporarily();
    }
    return shouldLeave;
};

const setVisibleSection = (view) => {
    const viewMap = {
        setup: [ui.setupView, ui.setupHistoryView],
        run: [ui.runView],
        result: [ui.resultView, ui.resultHistoryView],
    };

    Object.values(viewMap).flat().forEach((node) => {
        if (!node) return;
        node.classList.add('hidden');
    });

    (viewMap[view] || []).forEach((node) => node?.classList.remove('hidden'));
};

const safeParseHistory = (raw) => {
    if (!raw) return [];
    try {
        const parsed = JSON.parse(raw);
        if (!Array.isArray(parsed)) return [];
        return parsed.filter((item) => item && typeof item === 'object').slice(0, HISTORY_LIMIT);
    } catch (_) {
        return [];
    }
};

const loadHistory = () => {
    state.history = safeParseHistory(localStorage.getItem(HISTORY_KEY));
};

const saveHistory = () => {
    localStorage.setItem(HISTORY_KEY, JSON.stringify(state.history.slice(0, HISTORY_LIMIT)));
};

const pushHistoryEntry = (entry) => {
    state.history = [entry, ...state.history].slice(0, HISTORY_LIMIT);
    saveHistory();
    renderRecentTests();
};

const consumeResultRestoreRequest = () => {
    const raw = localStorage.getItem(TEST_RESULT_RESTORE_KEY);
    if (!raw) return null;
    localStorage.removeItem(TEST_RESULT_RESTORE_KEY);
    try {
        const parsed = JSON.parse(raw);
        return parsed?.historyEntry && typeof parsed.historyEntry === 'object'
            ? parsed.historyEntry
            : null;
    } catch (_) {
        return null;
    }
};

const openHistoryResult = (indexRaw) => {
    const index = Number.parseInt(indexRaw, 10);
    if (!Number.isInteger(index) || index < 0 || index >= state.history.length) {
        showToast('기록을 찾을 수 없습니다.', 'error');
        return;
    }
    const entry = state.history[index];
    restoreResultFromHistoryEntry(entry);
    setVisibleSection('result');
};

const renderRecentTests = () => {
    const render = (container) => {
        if (!container) return;
        if (state.history.length === 0) {
            container.innerHTML = '<p class="subtitle">최근 시험 기록이 없습니다.</p>';
            return;
        }

        container.innerHTML = state.history.map((item, index) => {
            const accuracy = Number(item?.summary?.accuracy || 0).toFixed(1);
            return `
                <div class="test-history-item">
                    <strong>${index + 1}. ${escapeHtml(formatLocalDatetime(item.finishedAt))}</strong>
                    <span>교재: ${escapeHtml(item?.config?.bookKey || '-')}</span>
                    <span>점수: ${item?.summary?.correct || 0}/${item?.summary?.total || 0} (${accuracy}%)</span>
                    <button type="button" class="mypage-button mypage-button--ghost mypage-btn-fit" data-open-history-index="${index}">자세히 보기</button>
                </div>
            `;
        }).join('');
    };

    render(ui.recentSetup);
    render(ui.recentResult);
};

const renderChapterOptions = (chapterIds) => {
    if (!ui.chapterOptions) return;

    ui.chapterOptions.innerHTML = chapterIds.map((chapterId) => {
        const isSelected = chapterId === state.chapterId;
        const chapterLabel = CHAPTER_LABELS[chapterId] || chapterId;
        const chapterNumberMatch = normalizeSpacingText(chapterId).match(/^CH\\s*(\\d+)$/i);
        const chapterSubLabel = chapterNumberMatch ? `Chapter ${chapterNumberMatch[1]}` : chapterId;
        return `
            <div class="test-type-option ${isSelected ? 'active' : ''}" data-chapter="${escapeHtml(chapterId)}">
                <div class="label">
                    <span class="label-main">${escapeHtml(chapterLabel)}</span>
                    <span class="label-sub">${escapeHtml(chapterSubLabel)}</span>
                </div>
            </div>
        `;
    }).join('');
};

const renderTocChecklist = (tocs) => {
    if (!ui.tocChecklist) return;

    const sortedTocs = sortTocs(tocs || []);
    ui.tocChecklist.innerHTML = sortedTocs.map((toc) => {
        const isChecked = state.selectedTocs.has(toc);
        return `
            <label class="toc-checklist-item ${isChecked ? 'selected-item' : ''}">
                <input type="checkbox" data-toc="${escapeHtml(toc)}" ${isChecked ? 'checked' : ''}>
                <span class="label">${escapeHtml(toc)}</span>
            </label>
        `;
    }).join('');
};

const renderReviewList = () => {
    if (!state.result || !ui.reviewListCorrect || !ui.reviewListWrong) return;

    const renderItems = (items, emptyMessage, wrongTone = false) => {
        if (!Array.isArray(items) || items.length === 0) {
            return `<p class="subtitle">${emptyMessage}</p>`;
        }

        return items.map((item, index) => {
            const selectedAnswer = escapeHtml(item.chosenAnswer || '미응답');
            const correctAnswer = escapeHtml(item.correctAnswer || '-');
            return `
                <div class="test-review-item test-review-item--compact">
                    <p class="test-review-prompt"><strong>${index + 1}. ${escapeHtml(item.prompt)}</strong></p>
                    <p class="test-review-compare">
                        <span class="test-review-label">선택한 보기</span>
                        <span class="test-review-value ${wrongTone ? 'test-review-value--wrong' : ''}">${selectedAnswer}</span>
                        <span class="test-review-sep">/</span>
                        <span class="test-review-label">정답</span>
                        <span class="test-review-value test-review-value--correct">${correctAnswer}</span>
                    </p>
                </div>
            `;
        }).join('');
    };

    const correctItems = state.result.reviewItems.filter((item) => item.isCorrect);
    const wrongItems = state.result.reviewItems.filter((item) => !item.isCorrect);

    ui.reviewListCorrect.innerHTML = renderItems(correctItems, '정답 문항이 없습니다.');
    ui.reviewListWrong.innerHTML = renderItems(wrongItems, '오답이 없습니다.', true);
};

const clampQuestionCount = ({ forceToPool = false } = {}) => {
    const poolSize = state.scopePool.length;
    const cappedMax = Math.min(poolSize, getQuestionSelectionLimit());
    const currentValue = Number.parseInt(ui.questionCountInput?.value || '0', 10) || 0;

    ui.questionCountInput.max = String(cappedMax);

    if (poolSize <= 0) {
        ui.questionCountInput.value = '0';
        state.questionCount = 0;
        return;
    }

    const fallbackValue = state.questionCount > 0 ? state.questionCount : cappedMax;
    const inputValue = currentValue > 0 ? currentValue : fallbackValue;
    const nextValue = forceToPool
        ? cappedMax
        : Math.min(cappedMax, Math.max(1, inputValue));

    ui.questionCountInput.value = String(nextValue);
    state.questionCount = nextValue;
};

const toAutoMinutesText = (minutes) => {
    const rounded = Math.round(minutes * 10) / 10;
    return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1);
};

const syncTimeLimitFromQuestionCount = () => {
    const seconds = state.questionCount * 30;
    const minutes = seconds / 60;
    state.timeLimitMinutes = minutes;
    ui.timeLimitInput.value = toAutoMinutesText(minutes);
};

const updateScopeSummary = () => {
    const selectedCount = state.selectedTocs.size;
    const scopeSize = state.scopePool.length;
    ui.scopeSummary.textContent = `선택된 범위: ${selectedCount}개 / 출제 가능 단어: ${scopeSize}개`;
};

const updateStartButtonState = () => {
    const disabled = state.isUpdatingScope || state.scopePool.length === 0;
    ui.startBtn.disabled = disabled;
};

const refreshPools = async () => {
    state.isUpdatingScope = true;
    updateStartButtonState();

    try {
        const selectedTocs = sortTocs([...state.selectedTocs]);
        state.scopePool = await getScopePool({
            bookKey: state.bookKey,
            chapterId: state.chapterId,
            selectedTocs,
            includeDerivatives: state.includeDerivatives,
        });

        state.bookPool = await getAllBookPool({
            bookKey: state.bookKey,
            includeDerivatives: state.includeDerivatives,
        });

        clampQuestionCount({ forceToPool: true });
        syncTimeLimitFromQuestionCount();
        updateScopeSummary();
    } catch (error) {
        console.error(error);
        showToast('데이터를 불러오지 못했습니다.', 'error');
        state.scopePool = [];
        state.bookPool = [];
        clampQuestionCount({ forceToPool: true });
        syncTimeLimitFromQuestionCount();
        updateScopeSummary();
    } finally {
        state.isUpdatingScope = false;
        updateStartButtonState();
    }
};

const getScopeSizeForSelection = async ({ selectedTocs, includeDerivatives }) => {
    const nextScopePool = await getScopePool({
        bookKey: state.bookKey,
        chapterId: state.chapterId,
        selectedTocs: sortTocs([...(selectedTocs || [])]),
        includeDerivatives: Boolean(includeDerivatives),
    });
    return nextScopePool.length;
};

const loadScopeControls = async ({ resetSelection = false } = {}) => {
    await loadBookDataset(state.bookKey);

    const isEtymology = state.bookKey === 'etymology';
    ui.chapterGroup.classList.toggle('hidden', !isEtymology);
    syncDerivativeAccessUi();

    if (isEtymology) {
        const chapters = await getAvailableChaptersForEtymology();
        if (!state.chapterId || !chapters.includes(state.chapterId)) {
            state.chapterId = chapters[0] || '';
            resetSelection = true;
        }
        renderChapterOptions(chapters);

        const tocs = await getTocsForChapter(state.chapterId);
        if (resetSelection) {
            state.selectedTocs = new Set();
        } else {
            const nextSelection = new Set();
            tocs.forEach((toc) => {
                if (state.selectedTocs.has(toc)) nextSelection.add(toc);
            });
            state.selectedTocs = nextSelection;
        }

        renderTocChecklist(tocs);
    } else {
        state.chapterId = '';
        const dayTocs = await getDayTocs(state.bookKey);
        if (resetSelection) {
            state.selectedTocs = new Set();
        } else {
            const nextSelection = new Set();
            dayTocs.forEach((toc) => {
                if (state.selectedTocs.has(toc)) nextSelection.add(toc);
            });
            state.selectedTocs = nextSelection;
        }

        renderTocChecklist(dayTocs);
    }

    await refreshPools();
};

const markSessionAnswer = (questionIndex, answerText) => {
    if (!state.session) return;
    if (questionIndex < 0 || questionIndex >= state.session.answers.length) return;
    state.session.answers[questionIndex] = normalizeSpacingText(answerText);
};

const renderCurrentQuestion = () => {
    if (!state.session) return;

    const { questions, index, answers } = state.session;
    const question = questions[index];
    if (!question) return;

    ui.progressText.textContent = `${index + 1} / ${questions.length}`;
    ui.questionPrompt.textContent = question.prompt;
    syncPronounceButton(question);
    if (!speakQuestionPrompt(question)) {
        stopSpeech();
    }

    const selectedAnswer = normalizeSpacingText(answers[index]);
    ui.choiceList.classList.add('test-choice-grid');
    ui.choiceList.innerHTML = question.choices.map((choice, idx) => {
        const choiceText = normalizeSpacingText(choice.text);
        const isSelected = selectedAnswer && selectedAnswer === choiceText;
        return `
            <button
                type="button"
                class="test-choice-card ${isSelected ? 'is-selected' : ''}"
                data-choice-index="${idx}"
                aria-pressed="${isSelected ? 'true' : 'false'}"
            >
                <span class="test-choice-text">${escapeHtml(choiceText)}</span>
            </button>
        `;
    }).join('');

};

const stopTimer = () => {
    if (state.session?.timerId) {
        window.clearInterval(state.session.timerId);
        state.session.timerId = null;
    }
};

const updateRemainingTime = () => {
    if (!state.session) return;
    const remainingMs = Math.max(0, state.session.timerEndMs - Date.now());
    ui.remainingTimeText.textContent = formatDuration(remainingMs);

    if (remainingMs <= 0 && !state.session.isSubmitting) {
        submitCurrentTest({ autoSubmitted: true });
    }
};

const startTimer = () => {
    stopTimer();
    updateRemainingTime();

    state.session.timerId = window.setInterval(() => {
        updateRemainingTime();
    }, 500);
};

const createSessionConfigSnapshot = () => {
    const selectedTocs = sortTocs([...state.selectedTocs]);
    return {
        bookKey: state.bookKey,
        chapterId: state.bookKey === 'etymology' ? state.chapterId : '',
        selectedTocs,
        includeDerivatives: state.bookKey !== 'etymology' && state.includeDerivatives,
        examType: state.examType,
        questionCount: state.questionCount,
        timeLimitMinutes: state.timeLimitMinutes,
        shuffleQuestions: state.shuffleQuestions,
    };
};

const beginTestWithPool = (pool, questionLimit = state.questionCount) => {
    const maxAllowed = Math.min(pool.length, getQuestionSelectionLimit());
    const requestedCount = Math.min(
        maxAllowed,
        Math.max(1, Number.parseInt(questionLimit, 10) || maxAllowed),
    );

    const questions = buildQuestionSet({
        scopePool: pool,
        bookPool: state.bookPool,
        examType: state.examType,
        questionCount: requestedCount,
        shuffleQuestions: state.shuffleQuestions,
    });

    if (questions.length === 0) {
        showToast('출제 가능한 문항이 없습니다.', 'error');
        return;
    }

    const startedAtMs = Date.now();
    state.session = {
        questions,
        answers: new Array(questions.length).fill(''),
        index: 0,
        startedAtMs,
        timerEndMs: startedAtMs + state.timeLimitMinutes * 60 * 1000,
        timerId: null,
        isSubmitting: false,
        autoSubmitted: false,
        configSnapshot: {
            ...createSessionConfigSnapshot(),
            questionCount: questions.length,
        },
    };

    state.result = null;
    state.allowUnsafeExit = false;
    setVisibleSection('run');
    renderCurrentQuestion();
    startTimer();
};

const renderResult = () => {
    if (!state.result) return;

    const result = state.result;
    ui.resultHeadline.textContent = `${result.correct}/${result.total} 정답 (${result.accuracy.toFixed(1)}%)`;

    ui.resultMetrics.innerHTML = `
        <div class="test-metric-item"><strong>정답</strong><span>${result.correct} / ${result.total}</span></div>
        <div class="test-metric-item"><strong>정확도</strong><span>${result.accuracy.toFixed(1)}%</span></div>
        <div class="test-metric-item"><strong>소요 시간</strong><span>${formatDuration(result.timeSpentMs)}</span></div>
    `;

    const wrongCount = result.reviewItems.filter((item) => !item.isCorrect).length;
    ui.retryWrongBtn.disabled = wrongCount === 0;
    ui.retryScopeBtn.disabled = false;

    renderReviewList();
    renderRecentTests();
};

const ensureScopeForRetry = async () => {
    if (state.scopePool.length > 0 && state.bookPool.length > 0 && !state.result?.isRestored) return true;
    if (!state.result?.config) return false;

    const config = state.result.config || {};
    const bookKey = normalizeSpacingText(config.bookKey) || state.bookKey;
    const isEtymology = bookKey === 'etymology';
    const chapterId = isEtymology ? normalizeSpacingText(config.chapterId) : '';
    const selectedTocs = sortTocs([...(config.selectedTocs || [])]).filter(Boolean);
    const includeDerivatives = !isEtymology && Boolean(config.includeDerivatives) && state.isBookPurchaseVerified;

    try {
        await loadBookDataset(bookKey);
        const scopePool = await getScopePool({
            bookKey,
            chapterId,
            selectedTocs,
            includeDerivatives,
        });
        const bookPool = await getAllBookPool({
            bookKey,
            includeDerivatives,
        });

        if (!Array.isArray(scopePool) || scopePool.length === 0) {
            return false;
        }

        state.bookKey = bookKey;
        state.chapterId = chapterId;
        state.selectedTocs = new Set(selectedTocs);
        state.includeDerivatives = includeDerivatives;
        state.scopePool = scopePool;
        state.bookPool = Array.isArray(bookPool) ? bookPool : [];
        state.examType = normalizeSpacingText(config.examType) || state.examType;
        state.shuffleQuestions = Boolean(config.shuffleQuestions);

        const maxAllowed = Math.min(state.scopePool.length, getQuestionSelectionLimit());
        const configuredCount = Number.parseInt(config.questionCount, 10) || state.result.total || maxAllowed;
        state.questionCount = Math.max(1, Math.min(maxAllowed, configuredCount));
        return true;
    } catch (error) {
        console.error(error);
        return false;
    }
};

const restoreResultFromHistoryEntry = (entry) => {
    if (!entry || typeof entry !== 'object') return false;

    const summary = entry.summary || {};
    const reviewItems = Array.isArray(entry.reviewItems) ? entry.reviewItems : [];
    const wrongCardIds = Array.isArray(entry.wrongCardIds)
        ? [...new Set(entry.wrongCardIds.map((id) => normalizeSpacingText(id)).filter(Boolean))]
        : [...new Set(reviewItems.filter((item) => !item?.isCorrect).map((item) => normalizeSpacingText(item?.cardId)).filter(Boolean))];

    state.session = null;
    state.result = {
        startedAt: normalizeSpacingText(entry.startedAt) || '',
        finishedAt: normalizeSpacingText(entry.finishedAt) || new Date().toISOString(),
        correct: Number(summary.correct || 0),
        total: Number(summary.total || 0),
        accuracy: Number(summary.accuracy || 0),
        timeSpentMs: Number(summary.timeSpentMs || 0),
        autoSubmitted: Boolean(summary.autoSubmitted),
        wrongCardIds,
        reviewItems,
        config: entry.config || {},
        isRestored: true,
    };

    renderResult();
    setVisibleSection('result');
    return true;
};

const submitCurrentTest = async ({ autoSubmitted = false } = {}) => {
    if (!state.session || state.session.isSubmitting) return;

    state.session.isSubmitting = true;
    state.session.autoSubmitted = autoSubmitted;
    stopSpeech();
    stopTimer();

    const finishedAtIso = new Date().toISOString();
    const total = state.session.questions.length;

    let correct = 0;
    const reviewItems = state.session.questions.map((question, index) => {
        const chosenAnswer = normalizeSpacingText(state.session.answers[index]);
        const correctAnswer = normalizeSpacingText(question.correctAnswer);
        const isCorrect = chosenAnswer && chosenAnswer === correctAnswer;
        if (isCorrect) correct += 1;

        return {
            cardId: question.cardId,
            direction: question.direction,
            prompt: question.prompt,
            correctAnswer,
            chosenAnswer,
            isCorrect,
        };
    });

    const timeSpentMs = Math.max(0, Date.now() - state.session.startedAtMs);
    const accuracy = total > 0 ? (correct / total) * 100 : 0;
    const wrongCardIds = [...new Set(reviewItems.filter((item) => !item.isCorrect).map((item) => item.cardId))];

    const sessionConfig = {
        ...state.session.configSnapshot,
        selectedTocs: sortTocs([...(state.session.configSnapshot.selectedTocs || [])]),
    };

    const result = {
        startedAt: new Date(state.session.startedAtMs).toISOString(),
        finishedAt: finishedAtIso,
        correct,
        total,
        accuracy,
        timeSpentMs,
        autoSubmitted,
        wrongCardIds,
        isRestored: false,
    };

    result.reviewItems = reviewItems;
    result.config = sessionConfig;

    state.result = result;
    state.allowUnsafeExit = false;

    pushHistoryEntry({
        id: `${result.finishedAt}:${sessionConfig.bookKey}:${sessionConfig.examType}`,
        startedAt: result.startedAt,
        finishedAt: result.finishedAt,
        config: sessionConfig,
        summary: {
            correct: result.correct,
            total: result.total,
            accuracy: result.accuracy,
            timeSpentMs: result.timeSpentMs,
            autoSubmitted: result.autoSubmitted,
        },
        wrongCardIds: result.wrongCardIds,
        reviewItems,
    });

    renderResult();
    setVisibleSection('result');
};

const startTestFromSetup = () => {
    if (state.scopePool.length === 0) {
        showToast('선택된 범위에 출제 가능한 단어가 없습니다.', 'error');
        return;
    }

    const maxAllowed = Math.min(state.scopePool.length, getQuestionSelectionLimit());
    state.questionCount = Math.min(
        maxAllowed,
        Math.max(1, Number.parseInt(ui.questionCountInput.value, 10) || maxAllowed),
    );
    ui.questionCountInput.value = String(state.questionCount);
    syncTimeLimitFromQuestionCount();
    state.shuffleQuestions = Boolean(ui.shuffleToggle.checked);

    beginTestWithPool(state.scopePool, state.questionCount);
};

const retryWrongOnly = async () => {
    if (!state.result) return;
    const prepared = await ensureScopeForRetry();
    if (!prepared) {
        showToast('다시 풀기 범위를 불러오지 못했습니다.', 'error');
        return;
    }

    const wrongSet = new Set(state.result.wrongCardIds || []);
    const wrongPool = state.scopePool.filter((entry) => wrongSet.has(entry.cardId));

    if (wrongPool.length === 0) {
        showToast('재응시할 오답 문항이 없습니다.', 'info');
        return;
    }

    beginTestWithPool(wrongPool, Math.min(state.questionCount, wrongPool.length));
};

const retrySameScope = async () => {
    const prepared = await ensureScopeForRetry();
    if (!prepared) {
        showToast('현재 범위 데이터를 불러오지 못했습니다.', 'error');
        return;
    }

    beginTestWithPool(state.scopePool, state.questionCount);
};

const bindEvents = () => {
    window.addEventListener('beforeunload', (event) => {
        stopSpeech();
        if (!isExitGuardActive()) return;
        event.preventDefault();
        event.returnValue = '';
    });

    document.addEventListener('click', (event) => {
        const link = event.target.closest('a[href]');
        if (!link) return;
        if (link.target && link.target.toLowerCase() === '_blank') return;
        if (link.hasAttribute('download')) return;

        const href = String(link.getAttribute('href') || '').trim();
        if (!href || href.startsWith('#') || href.startsWith('javascript:') || href.startsWith('mailto:') || href.startsWith('tel:')) return;

        if (!confirmExitIfNeeded()) {
            event.preventDefault();
        }
    });

    ui.bookOptions?.addEventListener('click', async (event) => {
        const option = event.target.closest('.test-type-option[data-book]');
        if (!option) return;

        const nextBook = normalizeSpacingText(option.dataset.book).toLowerCase();
        if (!nextBook || nextBook === state.bookKey) return;

        state.bookKey = nextBook;
        state.chapterId = '';
        state.selectedTocs.clear();
        state.includeDerivatives = false;
        ui.includeDerivativesToggle.checked = false;

        setActiveOption(ui.bookOptions, '.test-type-option[data-book]', state.bookKey, 'book');
        await loadScopeControls({ resetSelection: true });
    });

    ui.chapterOptions?.addEventListener('click', async (event) => {
        const item = event.target.closest('.test-type-option[data-chapter], .sub-chapter-item[data-chapter]');
        if (!item) return;

        const chapterId = normalizeSpacingText(item.dataset.chapter);
        if (!chapterId || chapterId === state.chapterId) return;

        state.chapterId = chapterId;
        state.selectedTocs.clear();
        setActiveOption(ui.chapterOptions, '.test-type-option[data-chapter]', state.chapterId, 'chapter');
        ui.chapterOptions.querySelectorAll('.sub-chapter-item[data-chapter]').forEach((node) => {
            node.classList.toggle('selected-item', normalizeSpacingText(node.dataset.chapter) === state.chapterId);
        });
        await loadScopeControls({ resetSelection: true });
    });

    ui.tocChecklist?.addEventListener('change', async (event) => {
        const checkbox = event.target.closest('input[type="checkbox"][data-toc]');
        if (!checkbox) return;

        const toc = normalizeSpacingText(checkbox.dataset.toc);
        if (!toc) return;

        if (checkbox.checked) {
            try {
                const nextSelectedTocs = new Set(state.selectedTocs);
                nextSelectedTocs.add(toc);
                const nextScopeSize = await getScopeSizeForSelection({
                    selectedTocs: nextSelectedTocs,
                    includeDerivatives: state.includeDerivatives,
                });

                const questionLimit = getQuestionSelectionLimit();
                if (nextScopeSize > questionLimit) {
                    checkbox.checked = false;
                    checkbox.closest('.toc-checklist-item')?.classList.remove('selected-item');
                    const limitMessage = state.isBookPurchaseVerified
                        ? `한 번에 최대 ${questionLimit}개 단어까지만 선택할 수 있습니다.`
                        : '구매 인증 전에는 한 번에 최대 50개 단어까지만 선택할 수 있습니다.';
                    showToast(limitMessage, 'error');
                    return;
                }
            } catch (error) {
                console.error(error);
                checkbox.checked = false;
                checkbox.closest('.toc-checklist-item')?.classList.remove('selected-item');
                showToast('데이터를 불러오지 못했습니다.', 'error');
                return;
            }

            state.selectedTocs.add(toc);
        } else {
            state.selectedTocs.delete(toc);
        }
        checkbox.closest('.toc-checklist-item')?.classList.toggle('selected-item', checkbox.checked);

        await refreshPools();
    });

    ui.includeDerivativesToggle?.addEventListener('change', async () => {
        const nextIncludeDerivatives = Boolean(ui.includeDerivativesToggle.checked);
        if (nextIncludeDerivatives && !state.isBookPurchaseVerified) {
            ui.includeDerivativesToggle.checked = false;
            state.includeDerivatives = false;
            showToast('책구매 인증 전에는 온라인 학습에서 파생어를 추가할 수 없습니다.', 'error');
            return;
        }
        if (nextIncludeDerivatives) {
            try {
                const nextScopeSize = await getScopeSizeForSelection({
                    selectedTocs: state.selectedTocs,
                    includeDerivatives: true,
                });
                const questionLimit = getQuestionSelectionLimit();
                if (nextScopeSize > questionLimit) {
                    ui.includeDerivativesToggle.checked = false;
                    showToast(`파생어 포함 시 ${questionLimit}개를 초과하여 적용할 수 없습니다.`, 'error');
                    return;
                }
            } catch (error) {
                console.error(error);
                ui.includeDerivativesToggle.checked = state.includeDerivatives;
                showToast('데이터를 불러오지 못했습니다.', 'error');
                return;
            }
        }

        state.includeDerivatives = nextIncludeDerivatives;
        await refreshPools();
    });

    ui.examTypeOptions?.addEventListener('click', (event) => {
        const option = event.target.closest('.test-type-option[data-exam-type]');
        if (!option) return;
        state.examType = option.dataset.examType || 'E2K';
        setActiveOption(ui.examTypeOptions, '.test-type-option[data-exam-type]', state.examType, 'examType');
    });

    ui.questionCountInput?.addEventListener('change', () => {
        clampQuestionCount();
        syncTimeLimitFromQuestionCount();
    });

    ui.questionCountInput?.addEventListener('input', () => {
        clampQuestionCount();
        syncTimeLimitFromQuestionCount();
    });

    ui.timeLimitInput?.addEventListener('input', () => {
        syncTimeLimitFromQuestionCount();
    });

    ui.startBtn?.addEventListener('click', () => {
        startTestFromSetup();
    });

    ui.pronounceBtn?.addEventListener('click', () => {
        if (!state.session) return;
        const question = state.session.questions[state.session.index];
        if (!speakQuestionPrompt(question)) {
            showToast('영어 문항에서만 발음을 재생할 수 있습니다.', 'info');
        }
    });

    ui.choiceList?.addEventListener('click', (event) => {
        const button = event.target.closest('.test-choice-card[data-choice-index]');
        if (!button || !state.session) return;
        const choiceIndex = Number.parseInt(button.dataset.choiceIndex || '-1', 10);
        const choice = state.session.questions[state.session.index]?.choices?.[choiceIndex];
        markSessionAnswer(state.session.index, choice?.text || '');

        const isLast = state.session.index >= state.session.questions.length - 1;
        if (isLast) {
            submitCurrentTest({ autoSubmitted: true });
            return;
        }

        state.session.index += 1;
        renderCurrentQuestion();
    });

    ui.submitBtn?.addEventListener('click', async () => {
        await submitCurrentTest({ autoSubmitted: false });
    });

    ui.retryWrongBtn?.addEventListener('click', () => {
        void retryWrongOnly();
    });

    ui.retryScopeBtn?.addEventListener('click', () => {
        void retrySameScope();
    });

    const handleOpenHistoryClick = (event) => {
        const trigger = event.target.closest('[data-open-history-index]');
        if (!trigger) return;
        openHistoryResult(trigger.dataset.openHistoryIndex);
    };

    ui.recentSetup?.addEventListener('click', handleOpenHistoryClick);
    ui.recentResult?.addEventListener('click', handleOpenHistoryClick);
};

const tryRestoreResultFromStorage = () => {
    const historyEntry = consumeResultRestoreRequest();
    if (!historyEntry) return false;
    if (!restoreResultFromHistoryEntry(historyEntry)) {
        showToast('기록 복원에 실패했습니다.', 'error');
        return false;
    }
    showToast('선택한 기록을 불러왔습니다.', 'info');
    return true;
};

const tryRestoreResultFromQuery = () => {
    const url = new URL(window.location.href);
    const historyIndexRaw = normalizeSpacingText(url.searchParams.get('historyIndex'));
    if (!historyIndexRaw) return false;

    const index = Number.parseInt(historyIndexRaw, 10);
    if (!Number.isInteger(index) || index < 0 || index >= state.history.length) return false;
    return restoreResultFromHistoryEntry(state.history[index]);
};

const initializeResultViewIfNeeded = () => {
    if (tryRestoreResultFromStorage()) return true;
    if (tryRestoreResultFromQuery()) return true;
    return false;
};

const initialize = async () => {
    await loadPurchaseAccess();
    syncDerivativeAccessUi();
    showPurchasePolicyNoticeIfNeeded();
    loadHistory();
    renderRecentTests();

    setActiveOption(ui.bookOptions, '.test-type-option[data-book]', state.bookKey, 'book');
    setActiveOption(ui.examTypeOptions, '.test-type-option[data-exam-type]', state.examType, 'examType');

    bindEvents();

    if (initializeResultViewIfNeeded()) {
        return;
    }
    setVisibleSection('setup');
    await loadScopeControls({ resetSelection: true });
};


if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
        initialize().catch((error) => {
            console.error(error);
            showToast('시험 페이지 초기화 중 오류가 발생했습니다.', 'error');
        });
    });
} else {
    initialize().catch((error) => {
        console.error(error);
        showToast('시험 페이지 초기화 중 오류가 발생했습니다.', 'error');
    });
}
