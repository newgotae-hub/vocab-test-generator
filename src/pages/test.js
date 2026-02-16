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

const HISTORY_KEY = 'voca_plus_test_history_v1';
const HISTORY_LIMIT = 10;

const state = {
    bookKey: 'etymology',
    chapterId: '',
    selectedTocs: new Set(),
    includeDerivatives: false,
    examType: 'E2K',
    questionCount: 0,
    timeLimitMinutes: 20,
    shuffleQuestions: true,

    scopePool: [],
    bookPool: [],

    session: null,
    result: null,
    history: [],

    isUpdatingScope: false,
};

const ui = {
    setupView: document.getElementById('test-setup-view'),
    setupHistoryView: document.getElementById('test-history-setup'),
    runView: document.getElementById('test-run-view'),
    confirmView: document.getElementById('test-confirm-view'),
    resultView: document.getElementById('test-result-view'),
    resultHistoryView: document.getElementById('test-history-result'),

    bookOptions: document.getElementById('book-options'),
    chapterGroup: document.getElementById('chapter-group'),
    chapterOptions: document.getElementById('chapter-options'),
    tocChecklist: document.getElementById('test-toc-checklist'),
    tocSelectAllBtn: document.getElementById('toc-select-all'),
    tocClearAllBtn: document.getElementById('toc-clear-all'),
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
    directionLabel: document.getElementById('test-direction-label'),
    questionPrompt: document.getElementById('test-question-prompt'),
    choiceList: document.getElementById('test-choice-list'),
    nextBtn: document.getElementById('test-next-btn'),

    confirmUnansweredText: document.getElementById('confirm-unanswered-text'),
    confirmJumpBtn: document.getElementById('confirm-jump-btn'),
    confirmSubmitBtn: document.getElementById('confirm-submit-btn'),
    confirmCancelBtn: document.getElementById('confirm-cancel-btn'),

    resultHeadline: document.getElementById('result-headline'),
    resultMetrics: document.getElementById('result-metrics'),
    verificationCode: document.getElementById('verification-code'),
    copyCodeBtn: document.getElementById('copy-code-btn'),
    copySummaryBtn: document.getElementById('copy-summary-btn'),
    resultSummaryText: document.getElementById('result-summary-text'),
    reviewFilterInputs: document.querySelectorAll('input[name="review-filter"]'),
    reviewList: document.getElementById('result-review-list'),

    retryWrongBtn: document.getElementById('retry-wrong-btn'),
    retryScopeBtn: document.getElementById('retry-scope-btn'),
};

const normalizeSpacingText = (value) => normalizeText(value);

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

const setVisibleSection = (view) => {
    const viewMap = {
        setup: [ui.setupView, ui.setupHistoryView],
        run: [ui.runView],
        confirm: [ui.confirmView],
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
                    <span>인증코드: ${escapeHtml(item?.verificationCode || '-')}</span>
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
        return `<div class="sub-chapter-item ${isSelected ? 'selected-item' : ''}" data-chapter="${escapeHtml(chapterId)}">${escapeHtml(chapterId)}</div>`;
    }).join('');
};

const renderTocChecklist = (tocs) => {
    if (!ui.tocChecklist) return;

    const sortedTocs = sortTocs(tocs || []);
    ui.tocChecklist.innerHTML = sortedTocs.map((toc) => {
        const isChecked = state.selectedTocs.has(toc);
        return `
            <label class="toc-checklist-item">
                <input type="checkbox" data-toc="${escapeHtml(toc)}" ${isChecked ? 'checked' : ''}>
                <span class="label">${escapeHtml(toc)}</span>
            </label>
        `;
    }).join('');
};

const toCanonicalObject = (value) => {
    if (Array.isArray(value)) return value.map(toCanonicalObject);
    if (!value || typeof value !== 'object') return value;

    const sortedKeys = Object.keys(value).sort((a, b) => a.localeCompare(b));
    const output = {};
    sortedKeys.forEach((key) => {
        output[key] = toCanonicalObject(value[key]);
    });
    return output;
};

const canonicalStringify = (value) => JSON.stringify(toCanonicalObject(value));

const fallbackHashHex = (text) => {
    let hashA = 2166136261 >>> 0;
    let hashB = 2246822519 >>> 0;

    for (let i = 0; i < text.length; i += 1) {
        const code = text.charCodeAt(i);
        hashA ^= code;
        hashA = Math.imul(hashA, 16777619) >>> 0;
        hashB ^= code;
        hashB = Math.imul(hashB, 1597334677) >>> 0;
    }

    const merged = `${hashA.toString(16).padStart(8, '0')}${hashB.toString(16).padStart(8, '0')}${(text.length >>> 0).toString(16).padStart(8, '0')}`;
    return merged;
};

const sha256Hex = async (text) => {
    const encoder = new TextEncoder();
    const bytes = encoder.encode(text);
    const digest = await globalThis.crypto.subtle.digest('SHA-256', bytes);
    return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
};

const getVerificationCode = async (payload) => {
    const canonical = canonicalStringify(payload);

    try {
        if (globalThis.crypto?.subtle && typeof TextEncoder !== 'undefined') {
            const hex = await sha256Hex(canonical);
            return hex.slice(0, 12).toUpperCase();
        }
    } catch (_) {
        // Fallback below.
    }

    return fallbackHashHex(canonical).slice(0, 12).toUpperCase();
};

const buildSummaryText = ({ result, config }) => {
    const finishedAtLocal = formatLocalDatetime(result.finishedAt);
    const lines = [
        `finishedAt: ${finishedAtLocal}`,
        `bookKey: ${config.bookKey}`,
        `chapterId: ${config.chapterId || '-'}`,
        `selectedTocs: ${config.selectedTocs.length}`,
        `includeDerivatives: ${config.includeDerivatives ? 'on' : 'off'}`,
        `examType: ${config.examType}`,
        `questionCount: ${result.total}`,
        `timeLimitMinutes: ${config.timeLimitMinutes}`,
        `score: ${result.correct}/${result.total} (${result.accuracy.toFixed(1)}%)`,
        `timeSpent: ${formatDuration(result.timeSpentMs)}`,
        `autoSubmitted: ${result.autoSubmitted ? 'yes' : 'no'}`,
        `verificationCode: ${result.verificationCode}`,
    ];

    return lines.join('\n');
};

const getSelectedReviewFilter = () => {
    const checked = [...ui.reviewFilterInputs].find((input) => input.checked);
    return checked?.value === 'all' ? 'all' : 'wrong';
};

const renderReviewList = () => {
    if (!ui.reviewList || !state.result) return;

    const filter = getSelectedReviewFilter();
    const items = filter === 'all'
        ? state.result.reviewItems
        : state.result.reviewItems.filter((item) => !item.isCorrect);

    if (items.length === 0) {
        ui.reviewList.innerHTML = '<p class="subtitle">표시할 항목이 없습니다.</p>';
        return;
    }

    ui.reviewList.innerHTML = items.map((item, index) => {
        return `
            <div class="test-review-item">
                <p><strong>${index + 1}. ${escapeHtml(item.prompt)}</strong></p>
                <p>정답: ${escapeHtml(item.correctAnswer || '-')}</p>
                <p>선택: ${escapeHtml(item.chosenAnswer || '미응답')}</p>
            </div>
        `;
    }).join('');
};

const clampQuestionCount = () => {
    const poolSize = state.scopePool.length;
    const currentValue = Number.parseInt(ui.questionCountInput?.value || '0', 10) || 0;

    ui.questionCountInput.max = String(poolSize);

    if (poolSize <= 0) {
        ui.questionCountInput.value = '0';
        state.questionCount = 0;
        return;
    }

    const nextValue = currentValue > 0
        ? Math.min(poolSize, Math.max(1, currentValue))
        : poolSize;

    ui.questionCountInput.value = String(nextValue);
    state.questionCount = nextValue;
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

        clampQuestionCount();
        updateScopeSummary();
    } catch (error) {
        console.error(error);
        showToast('데이터를 불러오지 못했습니다.', 'error');
        state.scopePool = [];
        state.bookPool = [];
        clampQuestionCount();
        updateScopeSummary();
    } finally {
        state.isUpdatingScope = false;
        updateStartButtonState();
    }
};

const selectAllCurrentTocs = () => {
    ui.tocChecklist.querySelectorAll('input[type="checkbox"]').forEach((checkbox) => {
        checkbox.checked = true;
        const toc = normalizeSpacingText(checkbox.dataset.toc);
        if (toc) state.selectedTocs.add(toc);
    });
};

const clearAllCurrentTocs = () => {
    ui.tocChecklist.querySelectorAll('input[type="checkbox"]').forEach((checkbox) => {
        checkbox.checked = false;
    });
    state.selectedTocs.clear();
};

const loadScopeControls = async ({ resetSelection = false } = {}) => {
    await loadBookDataset(state.bookKey);

    const isEtymology = state.bookKey === 'etymology';
    ui.chapterGroup.classList.toggle('hidden', !isEtymology);
    ui.includeDerivativesGroup.classList.toggle('hidden', isEtymology);

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
    ui.directionLabel.textContent = question.direction === 'K2E' ? '한국어 → 영어' : '영어 → 한국어';
    ui.questionPrompt.textContent = question.prompt;

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

    ui.nextBtn.textContent = index === questions.length - 1 ? '제출' : '다음';
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
    const requestedCount = Math.max(1, Number.parseInt(questionLimit, 10) || 1);

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
    setVisibleSection('run');
    renderCurrentQuestion();
    startTimer();
};

const buildVerificationPayload = (result, sessionConfig, reviewItems, answers) => {
    return {
        finishedAt: result.finishedAt,
        config: {
            ...sessionConfig,
            selectedTocs: sortTocs([...(sessionConfig.selectedTocs || [])]),
        },
        questions: reviewItems.map((item) => ({
            cardId: item.cardId,
            direction: item.direction,
            prompt: item.prompt,
        })),
        answers: answers.map((value) => normalizeSpacingText(value || '')),
        score: {
            correct: result.correct,
            total: result.total,
            accuracy: result.accuracy,
            timeSpentMs: result.timeSpentMs,
        },
    };
};

const renderResult = () => {
    if (!state.result) return;

    const result = state.result;
    ui.resultHeadline.textContent = `${result.correct}/${result.total} 정답 (${result.accuracy.toFixed(1)}%)`;

    ui.resultMetrics.innerHTML = `
        <div class="test-metric-item"><strong>정답</strong><span>${result.correct} / ${result.total}</span></div>
        <div class="test-metric-item"><strong>정확도</strong><span>${result.accuracy.toFixed(1)}%</span></div>
        <div class="test-metric-item"><strong>소요 시간</strong><span>${formatDuration(result.timeSpentMs)}</span></div>
        <div class="test-metric-item"><strong>자동 제출</strong><span>${result.autoSubmitted ? '예' : '아니오'}</span></div>
    `;

    ui.verificationCode.textContent = result.verificationCode;
    ui.resultSummaryText.value = result.summaryText;

    const wrongCount = result.reviewItems.filter((item) => !item.isCorrect).length;
    ui.retryWrongBtn.disabled = wrongCount === 0;

    renderReviewList();
    renderRecentTests();
};

const submitCurrentTest = async ({ autoSubmitted = false } = {}) => {
    if (!state.session || state.session.isSubmitting) return;

    state.session.isSubmitting = true;
    state.session.autoSubmitted = autoSubmitted;
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
    };

    const verificationPayload = buildVerificationPayload(result, sessionConfig, reviewItems, state.session.answers);
    const verificationCode = await getVerificationCode(verificationPayload);

    result.verificationCode = verificationCode;
    result.reviewItems = reviewItems;
    result.summaryText = buildSummaryText({ result, config: sessionConfig });

    state.result = result;

    pushHistoryEntry({
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
        verificationCode: result.verificationCode,
    });

    renderResult();
    setVisibleSection('result');
};

const openConfirmView = () => {
    if (!state.session) return;

    const unansweredCount = state.session.answers.filter((answer) => !normalizeSpacingText(answer)).length;
    ui.confirmUnansweredText.textContent = `미응답 ${unansweredCount}개`;
    ui.confirmJumpBtn.disabled = unansweredCount === 0;

    setVisibleSection('confirm');
};

const jumpToFirstUnanswered = () => {
    if (!state.session) return;
    const firstIndex = state.session.answers.findIndex((answer) => !normalizeSpacingText(answer));
    state.session.index = firstIndex >= 0 ? firstIndex : 0;
    setVisibleSection('run');
    renderCurrentQuestion();
};

const startTestFromSetup = () => {
    if (state.scopePool.length === 0) {
        showToast('선택된 범위에 출제 가능한 단어가 없습니다.', 'error');
        return;
    }

    state.questionCount = Math.min(
        state.scopePool.length,
        Math.max(1, Number.parseInt(ui.questionCountInput.value, 10) || state.scopePool.length),
    );

    state.timeLimitMinutes = Math.max(1, Number.parseInt(ui.timeLimitInput.value, 10) || 20);
    state.shuffleQuestions = Boolean(ui.shuffleToggle.checked);

    beginTestWithPool(state.scopePool, state.questionCount);
};

const retryWrongOnly = () => {
    if (!state.result) return;
    const wrongSet = new Set(state.result.wrongCardIds || []);
    const wrongPool = state.scopePool.filter((entry) => wrongSet.has(entry.cardId));

    if (wrongPool.length === 0) {
        showToast('재응시할 오답 문항이 없습니다.', 'info');
        return;
    }

    beginTestWithPool(wrongPool, Math.min(state.questionCount, wrongPool.length));
};

const retrySameScope = () => {
    if (state.scopePool.length === 0) {
        showToast('현재 범위 데이터가 없습니다.', 'error');
        return;
    }

    beginTestWithPool(state.scopePool, state.questionCount);
};

const copyText = async (text) => {
    const value = String(text || '');
    if (!value) return false;

    try {
        if (navigator.clipboard?.writeText) {
            await navigator.clipboard.writeText(value);
            return true;
        }
    } catch (_) {
        // fallback below
    }

    const temp = document.createElement('textarea');
    temp.value = value;
    temp.setAttribute('readonly', 'true');
    temp.style.position = 'fixed';
    temp.style.opacity = '0';
    document.body.appendChild(temp);
    temp.select();

    let copied = false;
    try {
        copied = document.execCommand('copy');
    } catch (_) {
        copied = false;
    }

    temp.remove();
    return copied;
};

const bindEvents = () => {
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
        const item = event.target.closest('.sub-chapter-item[data-chapter]');
        if (!item) return;

        const chapterId = normalizeSpacingText(item.dataset.chapter);
        if (!chapterId || chapterId === state.chapterId) return;

        state.chapterId = chapterId;
        state.selectedTocs.clear();
        await loadScopeControls({ resetSelection: true });
    });

    ui.tocChecklist?.addEventListener('change', async (event) => {
        const checkbox = event.target.closest('input[type="checkbox"][data-toc]');
        if (!checkbox) return;

        const toc = normalizeSpacingText(checkbox.dataset.toc);
        if (!toc) return;

        if (checkbox.checked) {
            state.selectedTocs.add(toc);
        } else {
            state.selectedTocs.delete(toc);
        }

        await refreshPools();
    });

    ui.tocSelectAllBtn?.addEventListener('click', async () => {
        selectAllCurrentTocs();
        await refreshPools();
    });

    ui.tocClearAllBtn?.addEventListener('click', async () => {
        clearAllCurrentTocs();
        await refreshPools();
    });

    ui.includeDerivativesToggle?.addEventListener('change', async () => {
        state.includeDerivatives = Boolean(ui.includeDerivativesToggle.checked);
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
    });

    ui.timeLimitInput?.addEventListener('change', () => {
        const next = Math.max(1, Number.parseInt(ui.timeLimitInput.value, 10) || 20);
        ui.timeLimitInput.value = String(next);
        state.timeLimitMinutes = next;
    });

    ui.startBtn?.addEventListener('click', () => {
        startTestFromSetup();
    });

    ui.choiceList?.addEventListener('click', (event) => {
        const button = event.target.closest('.test-choice-card[data-choice-index]');
        if (!button || !state.session) return;
        const choiceIndex = Number.parseInt(button.dataset.choiceIndex || '-1', 10);
        const choice = state.session.questions[state.session.index]?.choices?.[choiceIndex];
        markSessionAnswer(state.session.index, choice?.text || '');
        renderCurrentQuestion();
    });

    ui.nextBtn?.addEventListener('click', () => {
        if (!state.session) return;

        const isLast = state.session.index >= state.session.questions.length - 1;
        if (isLast) {
            openConfirmView();
            return;
        }

        state.session.index += 1;
        renderCurrentQuestion();
    });

    ui.confirmJumpBtn?.addEventListener('click', () => {
        jumpToFirstUnanswered();
    });

    ui.confirmSubmitBtn?.addEventListener('click', async () => {
        await submitCurrentTest({ autoSubmitted: false });
    });

    ui.confirmCancelBtn?.addEventListener('click', () => {
        setVisibleSection('run');
        renderCurrentQuestion();
    });

    ui.reviewFilterInputs.forEach((input) => {
        input.addEventListener('change', () => {
            renderReviewList();
        });
    });

    ui.retryWrongBtn?.addEventListener('click', () => {
        retryWrongOnly();
    });

    ui.retryScopeBtn?.addEventListener('click', () => {
        retrySameScope();
    });

    ui.copyCodeBtn?.addEventListener('click', async () => {
        if (!state.result?.verificationCode) return;
        const copied = await copyText(state.result.verificationCode);
        showToast(copied ? '인증코드를 복사했습니다.' : '복사에 실패했습니다.', copied ? 'info' : 'error');
    });

    ui.copySummaryBtn?.addEventListener('click', async () => {
        if (!state.result?.summaryText) return;
        const copied = await copyText(state.result.summaryText);
        showToast(copied ? '결과 요약을 복사했습니다.' : '복사에 실패했습니다.', copied ? 'info' : 'error');
    });
};

const initialize = async () => {
    loadHistory();
    renderRecentTests();

    setActiveOption(ui.bookOptions, '.test-type-option[data-book]', state.bookKey, 'book');
    setActiveOption(ui.examTypeOptions, '.test-type-option[data-exam-type]', state.examType, 'examType');

    bindEvents();

    await loadScopeControls({ resetSelection: true });
    setVisibleSection('setup');
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
