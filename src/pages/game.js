import {
    getAllBookPool,
    getPlayScopes,
    getScopePool,
    normalizeText,
} from '/src/domain/data/vocabRepository.js';
import { buildQuestionSet } from '/src/domain/engine/questionSetBuilder.js';
import {
    LEADERBOARD_MODE,
    getBookLabel,
    getLeaderboardSourceDescription,
    getLeaderboardSourceLabel,
    listRankedRuns,
    saveRankedRun,
} from '/src/lib/leaderboard.js';
import { supabase } from '/src/lib/supabaseClient.js';

const MODE_QUERY_KEY = 'mode';
const DEFAULT_MODE = LEADERBOARD_MODE;
const QUESTION_BATCH_SIZE = 180;
const CHOICE_COUNT = 4;
const BOARD_PREVIEW_LIMIT = 5;
const ANSWER_DELAY_MS = 480;
const TIMER_INTERVAL_MS = 100;
const INFINITE_MISTAKES = Number.POSITIVE_INFINITY;

const BOOK_OPTIONS = [
    { key: 'basic', label: 'Basic', supportsDerivatives: true, scopeLabel: 'DAY 선택' },
    { key: 'advanced', label: 'Advanced', supportsDerivatives: true, scopeLabel: 'DAY 선택' },
    { key: 'etymology', label: 'Etymology', supportsDerivatives: false, scopeLabel: '범위 선택' },
];

const ALL_SCOPE_VALUE = '__all__';

const MODE_CONFIG = {
    ranked_sprint: {
        key: 'ranked_sprint',
        label: '랭킹 스프린트',
        heroTitle: '짧고 빠르게 점수를 쌓는 모드입니다.',
        readyCopy: '시작 전에 교재와 범위를 먼저 고른 뒤 플레이를 시작하세요.',
        runningCopy: '빠른 판단과 정확한 연속 정답이 점수를 결정합니다.',
        finishedCopy: '플레이가 끝났습니다. 기록을 저장하고 랭킹을 새로 불러옵니다.',
        startLabel: '랭킹 스프린트 시작',
        durationMs: 60_000,
        maxMistakes: INFINITE_MISTAKES,
        timeBonusDivisor: 1500,
        comboBonusStep: 18,
        boardPrefix: '오늘',
        saveStatusLabel: '랭킹 보드',
        outLabel: '푼 문제',
    },
    survival_ladder: {
        key: 'survival_ladder',
        label: '생존 모드',
        heroTitle: '실수를 버티며 끝까지 올라가는 모드입니다.',
        readyCopy: '시작 전에 교재와 범위를 먼저 고른 뒤 플레이를 시작하세요.',
        runningCopy: '한 번의 실수도 중요합니다. 정확도를 유지하며 오래 살아남아 보세요.',
        finishedCopy: '플레이가 끝났습니다. 기록을 저장하고 랭킹을 새로 불러옵니다.',
        startLabel: '생존 모드 시작',
        durationMs: 90_000,
        maxMistakes: 3,
        timeBonusDivisor: 1800,
        comboBonusStep: 22,
        boardPrefix: '생존',
        saveStatusLabel: '생존 랭킹',
        outLabel: '푼 문제',
    },
};

const DIRECTION_LABELS = {
    E2K: '영어 -> 뜻',
    K2E: '뜻 -> 영어',
};

const state = {
    phase: 'loading',
    selectedMode: DEFAULT_MODE,
    modeLockedFromEntry: false,
    selectedBookKey: 'basic',
    includeDerivatives: false,
    selectedScopeValue: ALL_SCOPE_VALUE,
    currentQuestion: null,
    questionQueue: [],
    activeScopePool: [],
    activeScopeLabel: '',
    questionsServed: 0,
    answeredCount: 0,
    correctCount: 0,
    score: 0,
    combo: 0,
    bestStreak: 0,
    mistakes: 0,
    remainingLives: INFINITE_MISTAKES,
    finishReason: '',
    remainingMs: MODE_CONFIG[DEFAULT_MODE].durationMs,
    timerId: 0,
    answerDelayId: 0,
    lastTickAt: 0,
    lastAnswer: null,
    saveState: { status: 'idle', message: '' },
    boardState: { loading: false, source: '', runs: [], error: null },
    user: { id: '', displayName: 'Player' },
    books: {
        basic: { ready: false, scopes: [], baseCount: 0, derivativeCount: 0 },
        advanced: { ready: false, scopes: [], baseCount: 0, derivativeCount: 0 },
        etymology: { ready: false, scopes: [], baseCount: 0, derivativeCount: 0 },
    },
};

const ui = {
    body: document.body,
    heroTitle: document.getElementById('sprint-hero-title'),
    heroStatus: document.getElementById('sprint-hero-status'),
    heroCopy: document.getElementById('sprint-hero-copy'),
    startBtn: document.getElementById('sprint-start-btn'),
    modeSection: document.getElementById('sprint-mode-section'),
    selectedLabel: document.getElementById('sprint-selected-label'),
    selectedPool: document.getElementById('sprint-selected-pool'),
    saveMode: document.getElementById('sprint-save-mode'),
    modeOptions: [...document.querySelectorAll('#sprint-mode-options [data-mode-key]')],
    modeCards: [...document.querySelectorAll('#sprint-mode-cards [data-mode-key]')],
    bookOptions: [...document.querySelectorAll('#sprint-book-options [data-book-key]')],
    derivativeSection: document.getElementById('sprint-derivative-section'),
    derivativeToggle: document.getElementById('sprint-derivative-toggle'),
    derivativeHint: document.getElementById('sprint-derivative-hint'),
    scopeLabel: document.getElementById('sprint-scope-label'),
    scopeSelect: document.getElementById('sprint-scope-select'),
    scopeHint: document.getElementById('sprint-scope-hint'),
    setupStatus: document.getElementById('sprint-setup-status'),
    phaseLabel: document.getElementById('sprint-phase-label'),
    phaseCopy: document.getElementById('sprint-phase-copy'),
    timer: document.getElementById('sprint-timer'),
    timeFill: document.getElementById('sprint-time-fill'),
    score: document.getElementById('sprint-score'),
    combo: document.getElementById('sprint-combo'),
    accuracy: document.getElementById('sprint-accuracy'),
    streak: document.getElementById('sprint-streak'),
    questionIndex: document.getElementById('sprint-question-index'),
    questionDirection: document.getElementById('sprint-question-direction'),
    questionBook: document.getElementById('sprint-question-book'),
    questionPrompt: document.getElementById('sprint-question-prompt'),
    choiceList: document.getElementById('sprint-choice-list'),
    inlineStatus: document.getElementById('sprint-inline-status'),
    resultCard: document.getElementById('sprint-result-card'),
    resultHeadline: document.getElementById('sprint-result-headline'),
    resultCopy: document.getElementById('sprint-result-copy'),
    resultMetrics: document.getElementById('sprint-result-metrics'),
    saveStatus: document.getElementById('sprint-save-status'),
    restartBtn: document.getElementById('sprint-restart-btn'),
    boardTitle: document.getElementById('sprint-board-title'),
    boardSource: document.getElementById('sprint-board-source'),
    boardStatus: document.getElementById('sprint-board-status'),
    boardList: document.getElementById('sprint-board-list'),
    boardFilters: [...document.querySelectorAll('#sprint-board-filters [data-book-key]')],
    livesValue: null,
    livesCard: null,
};

const normalizeSpacingText = (value) => normalizeText(value);
const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
const formatNumber = (value) => new Intl.NumberFormat('ko-KR').format(Number(value || 0));
const formatTimer = (ms) => `${(Math.max(0, ms) / 1000).toFixed(1)}`;
const escapeHtml = (value) => String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

const shuffle = (items) => {
    const list = [...items];
    for (let index = list.length - 1; index > 0; index -= 1) {
        const randomIndex = Math.floor(Math.random() * (index + 1));
        [list[index], list[randomIndex]] = [list[randomIndex], list[index]];
    }
    return list;
};

const normalizeModeKey = (value) => {
    const normalized = normalizeSpacingText(value).toLowerCase();
    return MODE_CONFIG[normalized] ? normalized : DEFAULT_MODE;
};

const getModeConfig = (modeKey = state.selectedMode) => MODE_CONFIG[normalizeModeKey(modeKey)];
const getBookOption = (bookKey) => BOOK_OPTIONS.find((book) => book.key === bookKey) || BOOK_OPTIONS[0];
const getCurrentDurationMs = () => getModeConfig().durationMs;
const getCurrentMaxMistakes = () => getModeConfig().maxMistakes;
const isAllScopeSelected = () => state.selectedScopeValue === ALL_SCOPE_VALUE;

const formatAccuracy = () => {
    if (!state.answeredCount) return '0%';
    return `${((state.correctCount / state.answeredCount) * 100).toFixed(1)}%`;
};

const getAccuracyValue = () => {
    if (!state.answeredCount) return 0;
    return Number(((state.correctCount / state.answeredCount) * 100).toFixed(2));
};

const getDisplayName = (user) => {
    const metadata = user?.user_metadata || {};
    const candidates = [
        metadata.display_name,
        metadata.full_name,
        metadata.name,
        metadata.nickname,
        user?.email ? String(user.email).split('@')[0] : '',
    ];

    for (const candidate of candidates) {
        const normalized = normalizeSpacingText(candidate);
        if (normalized) return normalized;
    }

    return 'Player';
};

const getScoreGain = () => {
    const modeConfig = getModeConfig();
    const comboBonus = Math.min(320, state.combo * modeConfig.comboBonusStep);
    const timeBonus = Math.max(0, Math.round(state.remainingMs / modeConfig.timeBonusDivisor));
    return 100 + comboBonus + timeBonus;
};

const shouldIncludeDerivatives = () => {
    const book = getBookOption(state.selectedBookKey);
    return Boolean(book.supportsDerivatives && state.includeDerivatives);
};

const getSelectedScope = () => {
    if (isAllScopeSelected()) {
        return {
            value: ALL_SCOPE_VALUE,
            label: '전체 범위',
            chapterId: '',
            toc: '',
            type: 'all',
        };
    }
    const book = state.books[state.selectedBookKey];
    return (book?.scopes || []).find((scope) => scope.value === state.selectedScopeValue) || null;
};

const buildLimitedChoices = (choices) => {
    const correct = (choices || []).find((choice) => choice?.isCorrect);
    if (!correct) return [];
    const distractors = shuffle((choices || []).filter((choice) => !choice?.isCorrect)).slice(0, CHOICE_COUNT - 1);
    return shuffle([correct, ...distractors]);
};

const ensureBookLibrary = async (bookKey) => {
    const book = state.books[bookKey];
    if (!book) throw new Error(`지원하지 않는 교재입니다. ${bookKey}`);
    if (book.ready && book.scopes.length > 0) return book;

    const [scopes, basePool, derivativePool] = await Promise.all([
        getPlayScopes(bookKey),
        getAllBookPool({ bookKey, includeDerivatives: false }),
        getAllBookPool({ bookKey, includeDerivatives: bookKey !== 'etymology' }),
    ]);

    book.scopes = scopes;
    book.baseCount = basePool.length;
    book.derivativeCount = derivativePool.length;
    book.ready = true;
    return book;
};

const syncSelectedScope = () => {
    const book = state.books[state.selectedBookKey];
    const scopes = book?.scopes || [];
    if (state.selectedScopeValue === ALL_SCOPE_VALUE) return;
    if (!scopes.length) {
        state.selectedScopeValue = ALL_SCOPE_VALUE;
        return;
    }

    const exists = scopes.some((scope) => scope.value === state.selectedScopeValue);
    if (!exists) {
        state.selectedScopeValue = ALL_SCOPE_VALUE;
    }
};

const buildScopeRequest = () => {
    const selectedScope = getSelectedScope();
    if (!selectedScope) return null;

    if (selectedScope.type === 'all') {
        return {
            bookKey: state.selectedBookKey,
            chapterId: '',
            selectedTocs: [],
            includeDerivatives: shouldIncludeDerivatives(),
            all: true,
        };
    }

    return {
        bookKey: state.selectedBookKey,
        chapterId: selectedScope.chapterId || '',
        selectedTocs: selectedScope.toc ? [selectedScope.toc] : [],
        includeDerivatives: shouldIncludeDerivatives(),
    };
};

const buildQuestionQueue = async () => {
    const request = buildScopeRequest();
    if (!request) return [];

    const bookPool = await getAllBookPool({
        bookKey: state.selectedBookKey,
        includeDerivatives: shouldIncludeDerivatives(),
    });

    const scopePool = request.all ? [...bookPool] : await getScopePool(request);

    state.activeScopePool = scopePool;
    state.activeScopeLabel = getSelectedScope()?.label || '';

    const questions = buildQuestionSet({
        scopePool,
        bookPool,
        examType: 'MIXED',
        questionCount: QUESTION_BATCH_SIZE,
        shuffleQuestions: true,
    });

    return questions
        .map((question) => ({
            ...question,
            choices: buildLimitedChoices(question.choices),
        }))
        .filter((question) => question.choices.length >= 2);
};

const setInlineStatus = (message, tone = '') => {
    if (!ui.inlineStatus) return;
    ui.inlineStatus.textContent = message || '';
    ui.inlineStatus.classList.toggle('is-positive', tone === 'positive');
    ui.inlineStatus.classList.toggle('is-negative', tone === 'negative');
};

const ensureLivesMetric = () => {
    if (ui.livesValue || !ui.streak) return;
    const streakCard = ui.streak.parentElement?.parentElement || ui.streak.parentElement;
    const metricRow = streakCard?.parentElement;
    if (!metricRow) return;

    const livesCard = document.createElement('div');
    livesCard.className = streakCard?.className || 'game-stat';
    livesCard.dataset.dynamicLives = 'true';
    livesCard.innerHTML = '<span>남은 기회</span><strong id="sprint-lives">3</strong>';
    metricRow.appendChild(livesCard);
    ui.livesCard = livesCard;
    ui.livesValue = livesCard.querySelector('#sprint-lives');
};

const resetRunState = () => {
    clearInterval(state.timerId);
    clearTimeout(state.answerDelayId);
    state.timerId = 0;
    state.answerDelayId = 0;
    state.phase = 'ready';
    state.currentQuestion = null;
    state.questionQueue = [];
    state.activeScopePool = [];
    state.questionsServed = 0;
    state.answeredCount = 0;
    state.correctCount = 0;
    state.score = 0;
    state.combo = 0;
    state.bestStreak = 0;
    state.mistakes = 0;
    state.remainingLives = getCurrentMaxMistakes();
    state.finishReason = '';
    state.remainingMs = getCurrentDurationMs();
    state.lastTickAt = 0;
    state.lastAnswer = null;
    state.saveState = { status: 'idle', message: '' };
    setInlineStatus(getModeConfig().readyCopy);
};

const getResultMetricsMarkup = () => {
    const metrics = [
        { label: '점수', value: formatNumber(state.score) },
        { label: '정답률', value: formatAccuracy() },
        { label: '최고 연속', value: `${state.bestStreak}` },
        { label: getModeConfig().outLabel, value: `${state.answeredCount}` },
    ];

    if (Number.isFinite(getCurrentMaxMistakes())) {
        metrics.push({ label: '실수', value: `${state.mistakes}/${getCurrentMaxMistakes()}` });
    }

    return metrics.map((metric) => `
        <div class="game-metric">
            <span>${escapeHtml(metric.label)}</span>
            <strong>${escapeHtml(metric.value)}</strong>
        </div>
    `).join('');
};

const renderScopeOptions = () => {
    if (!ui.scopeSelect) return;
    const scopes = state.books[state.selectedBookKey]?.scopes || [];
    const options = [
        { value: ALL_SCOPE_VALUE, label: '전체 범위' },
        ...scopes,
    ];
    ui.scopeSelect.innerHTML = options.map((scope) => `
        <option value="${escapeHtml(scope.value)}">${escapeHtml(scope.label)}</option>
    `).join('');
    ui.scopeSelect.value = state.selectedScopeValue;
    ui.scopeSelect.disabled = state.phase === 'running' || scopes.length === 0;
};

const renderSetup = () => {
    const bookOption = getBookOption(state.selectedBookKey);
    const bookState = state.books[state.selectedBookKey];
    const selectedScope = getSelectedScope();
    const totalCount = shouldIncludeDerivatives() ? bookState.derivativeCount : bookState.baseCount;

    if (ui.selectedLabel) {
        ui.selectedLabel.textContent = `${getModeConfig().label} · ${bookOption.label}`;
    }
    if (ui.selectedPool) {
        ui.selectedPool.textContent = bookState.ready ? `${formatNumber(totalCount)} 단어` : '불러오는 중...';
    }
    if (ui.saveMode) {
        ui.saveMode.textContent = state.user.id ? '실시간 저장 + 예비 저장' : '현재 기기 저장';
    }
    if (ui.heroTitle) {
        ui.heroTitle.textContent = getModeConfig().heroTitle;
    }
    if (ui.heroStatus) {
        const derivativeCopy = bookOption.supportsDerivatives
            ? (state.includeDerivatives ? '파생어 포함' : '표제어만')
            : '어원 범위';
        const scopeCopy = selectedScope ? `${selectedScope.label} 선택` : '범위를 선택해 주세요';
        ui.heroStatus.textContent = `${bookOption.label} · ${derivativeCopy} · ${scopeCopy}`;
    }
    if (ui.heroCopy) {
        ui.heroCopy.textContent = selectedScope
            ? `선택한 범위로 게임을 시작할 수 있습니다. 현재 랭킹은 ${bookOption.label} 교재 기준으로 집계됩니다.`
            : getModeConfig().readyCopy;
    }

    if (ui.modeSection) {
        ui.modeSection.hidden = state.modeLockedFromEntry;
    }

    ui.modeOptions.forEach((button) => {
        const isActive = button.dataset.modeKey === state.selectedMode;
        button.classList.toggle('is-active', isActive);
        button.disabled = state.phase === 'running';
    });
    ui.modeCards.forEach((button) => {
        const isActive = button.dataset.modeKey === state.selectedMode;
        button.classList.toggle('is-active', isActive);
        button.disabled = state.phase === 'running';
        button.setAttribute('aria-pressed', isActive ? 'true' : 'false');
    });

    ui.bookOptions.forEach((button) => {
        const isActive = button.dataset.bookKey === state.selectedBookKey;
        button.classList.toggle('is-active', isActive);
        button.disabled = state.phase === 'running';
    });

    if (ui.derivativeSection) {
        ui.derivativeSection.hidden = !bookOption.supportsDerivatives;
    }
    if (ui.derivativeToggle) {
        ui.derivativeToggle.checked = state.includeDerivatives;
        ui.derivativeToggle.disabled = state.phase === 'running' || !bookOption.supportsDerivatives;
    }
    if (ui.derivativeHint) {
        ui.derivativeHint.textContent = bookOption.supportsDerivatives
            ? (state.includeDerivatives
                ? '파생어를 포함한 문제로 게임을 준비합니다.'
                : '기본 표제어만 사용합니다.')
            : '어원편은 파생어 토글 없이 본문 범위만 사용합니다.';
    }
    if (ui.scopeLabel) {
        ui.scopeLabel.textContent = bookOption.scopeLabel === 'DAY 선택' ? '범위 선택' : bookOption.scopeLabel;
    }
    if (ui.scopeHint) {
        ui.scopeHint.textContent = selectedScope
            ? `${selectedScope.label} 범위로 게임을 준비합니다.`
            : '전체 범위 또는 원하는 DAY를 선택해 주세요.';
    }
    if (ui.setupStatus) {
        ui.setupStatus.textContent = bookState.ready
            ? `${bookOption.label} 교재 준비 완료`
            : `${bookOption.label} 교재를 불러오는 중입니다.`;
    }

    renderScopeOptions();
};

const renderRunState = () => {
    const modeConfig = getModeConfig();
    ensureLivesMetric();

    if (ui.body) {
        ui.body.dataset.gamePhase = state.phase;
        ui.body.dataset.gameMode = state.selectedMode;
    }

    if (ui.phaseLabel) {
        ui.phaseLabel.textContent = state.phase === 'running'
            ? modeConfig.label
            : state.phase === 'finished'
                ? '완료'
                : state.phase === 'loading'
                    ? '불러오는 중'
                    : '준비';
    }

    if (ui.phaseCopy) {
        ui.phaseCopy.textContent = state.phase === 'running'
            ? modeConfig.runningCopy
            : state.phase === 'finished'
                ? modeConfig.finishedCopy
                : state.phase === 'loading'
                    ? '선택한 범위로 문제를 준비하고 있습니다.'
                    : modeConfig.readyCopy;
    }

    if (ui.timer) ui.timer.textContent = formatTimer(state.remainingMs);
    if (ui.timeFill) {
        const progress = clamp(state.remainingMs / modeConfig.durationMs, 0, 1);
        ui.timeFill.style.width = `${progress * 100}%`;
    }
    if (ui.score) ui.score.textContent = formatNumber(state.score);
    if (ui.combo) ui.combo.textContent = `${state.combo}x`;
    if (ui.accuracy) ui.accuracy.textContent = formatAccuracy();
    if (ui.streak) ui.streak.textContent = `${state.bestStreak}`;
    if (ui.livesCard) ui.livesCard.hidden = !Number.isFinite(modeConfig.maxMistakes);
    if (ui.livesValue) {
        ui.livesValue.textContent = Number.isFinite(modeConfig.maxMistakes) ? `${Math.max(0, state.remainingLives)}` : '--';
    }
    if (ui.questionIndex) ui.questionIndex.textContent = `Q ${String(state.questionsServed).padStart(2, '0')}`;
    if (ui.questionDirection) ui.questionDirection.textContent = DIRECTION_LABELS[state.currentQuestion?.direction] || '영어 -> 뜻';
    if (ui.questionBook) {
        const scopeLabel = state.activeScopeLabel || (getSelectedScope()?.label || '-');
        ui.questionBook.textContent = `${getBookOption(state.selectedBookKey).label} / ${scopeLabel}`;
    }
    if (ui.questionPrompt) {
        ui.questionPrompt.textContent = state.currentQuestion ? normalizeSpacingText(state.currentQuestion.prompt) : '첫 문제를 기다리는 중입니다.';
    }

    if (ui.startBtn) {
        const canStart = state.phase !== 'loading'
            && state.phase !== 'running'
            && (isAllScopeSelected() || Boolean(getSelectedScope()))
            && Boolean(state.books[state.selectedBookKey]?.ready);
        ui.startBtn.disabled = !canStart;
        ui.startBtn.textContent = state.phase === 'running' ? '진행 중...' : state.phase === 'finished' ? '다시 시작' : modeConfig.startLabel;
    }
};

const renderChoices = () => {
    if (!ui.choiceList) return;
    if (!state.currentQuestion) {
        ui.choiceList.innerHTML = '';
        return;
    }

    ui.choiceList.innerHTML = state.currentQuestion.choices.map((choice, index) => {
        const isSelected = state.lastAnswer?.selectedChoiceId === choice.id;
        const isCorrect = state.lastAnswer?.revealed && choice.isCorrect;
        const isWrong = state.lastAnswer?.revealed && isSelected && !choice.isCorrect;
        const classNames = ['game-choice', isSelected ? 'is-selected' : '', isCorrect ? 'is-correct' : '', isWrong ? 'is-wrong' : ''].filter(Boolean).join(' ');

        return `
            <button type="button" class="${classNames}" data-choice-id="${escapeHtml(choice.id)}" ${state.phase !== 'running' || state.lastAnswer?.locked ? 'disabled' : ''}>
                <span class="game-choice-key">${index + 1}</span>
                <span class="game-choice-body">
                    <strong>${escapeHtml(choice.text)}</strong>
                    <span>${choice.isCorrect ? '정답' : '선택지'}</span>
                </span>
            </button>
        `;
    }).join('');
};

const renderResult = () => {
    if (!ui.resultCard) return;
    const isFinished = state.phase === 'finished';
    ui.resultCard.hidden = !isFinished;
    if (!isFinished) return;

    if (ui.resultHeadline) {
        let headline = '첫 기록이 저장되었습니다.';
        if (state.selectedMode === 'survival_ladder') {
            headline = state.finishReason === 'out_of_lives' ? '실수 3회로 플레이가 종료되었습니다.' : '끝까지 버티며 기록을 남겼습니다.';
        } else if (state.score >= 2400) {
            headline = '포디움권 점수입니다.';
        } else if (state.score >= 1400) {
            headline = '좋은 기록입니다. 상위권을 노려볼 수 있습니다.';
        }
        ui.resultHeadline.textContent = headline;
    }
    if (ui.resultCopy) {
        const livesCopy = state.selectedMode === 'survival_ladder' && Number.isFinite(getCurrentMaxMistakes())
            ? ` 남은 기회 ${Math.max(0, state.remainingLives)}회.`
            : '';
        const scopeLabel = state.activeScopeLabel || (getSelectedScope()?.label || '-');
        const derivativeCopy = shouldIncludeDerivatives() ? '파생어 포함' : '표제어 기준';
        ui.resultCopy.textContent = `${getBookOption(state.selectedBookKey).label} ${scopeLabel} · ${derivativeCopy} · ${state.answeredCount}문제 · 정답률 ${getAccuracyValue().toFixed(1)}%.${livesCopy}`;
    }
    if (ui.resultMetrics) ui.resultMetrics.innerHTML = getResultMetricsMarkup();
    if (ui.saveStatus) ui.saveStatus.textContent = state.saveState.message;
};

const renderBoardFilters = () => {
    ui.boardFilters.forEach((button) => {
        button.classList.toggle('is-active', button.dataset.bookKey === state.selectedBookKey);
    });
};

const renderBoard = () => {
    const modeConfig = getModeConfig();
    if (ui.boardTitle) ui.boardTitle.textContent = `${modeConfig.boardPrefix} 랭킹 / ${getBookOption(state.selectedBookKey).label}`;
    if (ui.boardSource) {
        ui.boardSource.textContent = state.boardState.loading ? '랭킹 불러오는 중...' : state.boardState.source ? getLeaderboardSourceLabel(state.boardState.source) : '준비 중';
    }
    if (ui.boardStatus) {
        const selectedScope = getSelectedScope();
        const scopeLabel = selectedScope ? `${selectedScope.label} 기준으로 게임을 시작합니다.` : '먼저 교재 범위를 선택해 주세요.';
        ui.boardStatus.textContent = state.boardState.loading
            ? `${modeConfig.label} 랭킹을 새로 불러오는 중입니다.`
            : state.boardState.source
                ? `${scopeLabel} ${getLeaderboardSourceDescription(state.boardState.source)}`
                : scopeLabel;
    }
    if (!ui.boardList) return;

    if (state.boardState.loading) {
        ui.boardList.innerHTML = '<li class="game-board-row"><span class="game-board-meta">랭킹을 불러오는 중입니다.</span></li>';
        return;
    }

    if (!state.boardState.runs.length) {
        ui.boardList.innerHTML = '<li class="game-board-row"><span class="game-board-meta">아직 등록된 기록이 없습니다.</span></li>';
        return;
    }

    ui.boardList.innerHTML = state.boardState.runs.slice(0, BOARD_PREVIEW_LIMIT).map((run) => `
        <li class="game-board-row">
            <span class="game-board-rank">${run.rank}</span>
            <div>
                <div class="game-board-name">${escapeHtml(run.displayName)}</div>
                <div class="game-board-meta">정답률 ${run.accuracy.toFixed(1)}% / 연속 ${run.streak} / ${Math.round(run.durationMs / 1000)}초</div>
            </div>
            <div class="game-board-score">
                <strong>${formatNumber(run.score)}</strong>
                <span>${escapeHtml(getBookLabel(run.bookKey))}</span>
            </div>
        </li>
    `).join('');
};

const render = () => {
    renderSetup();
    renderRunState();
    renderChoices();
    renderResult();
    renderBoardFilters();
    renderBoard();
};

const refreshBoard = async () => {
    state.boardState.loading = true;
    renderBoard();
    try {
        const result = await listRankedRuns({
            bookKey: state.selectedBookKey,
            mode: state.selectedMode,
            period: 'today',
        });
        state.boardState.source = result.source;
        state.boardState.runs = result.runs || [];
        state.boardState.error = result.error || null;
    } catch (error) {
        state.boardState.source = 'local-only';
        state.boardState.runs = [];
        state.boardState.error = error;
    } finally {
        state.boardState.loading = false;
        renderBoard();
    }
};

const syncModeToUrl = () => {
    const url = new URL(window.location.href);
    url.searchParams.set(MODE_QUERY_KEY, state.selectedMode);
    window.history.replaceState({}, '', url);
};

const readModeFromUrl = () => {
    const rawMode = new URLSearchParams(window.location.search).get(MODE_QUERY_KEY);
    state.modeLockedFromEntry = Boolean(normalizeSpacingText(rawMode));
    state.selectedMode = normalizeModeKey(rawMode);
};

const nextQuestion = async () => {
    if (state.phase !== 'running') return;
    if (state.questionQueue.length === 0) {
        state.questionQueue = await buildQuestionQueue();
    }

    state.currentQuestion = state.questionQueue.shift() || null;
    state.questionsServed += 1;
    state.lastAnswer = null;
    if (!state.currentQuestion) {
        state.phase = 'ready';
        setInlineStatus('문제를 더 불러오지 못했습니다. 다른 범위나 모드로 다시 시도해 주세요.', 'negative');
    }
    render();
};

const persistRun = async () => {
    const modeConfig = getModeConfig();
    if (state.answeredCount <= 0) {
        state.saveState = { status: 'skipped', message: '최소 한 문제 이상 풀어야 기록이 저장됩니다.' };
        renderResult();
        return;
    }

    state.saveState = { status: 'saving', message: `${modeConfig.saveStatusLabel}에 저장하는 중입니다...` };
    renderResult();

    const saveResult = await saveRankedRun({
        userId: state.user.id,
        displayName: state.user.displayName,
        bookKey: state.selectedBookKey,
        mode: state.selectedMode,
        score: state.score,
        accuracy: getAccuracyValue(),
        streak: state.bestStreak,
        durationMs: modeConfig.durationMs - state.remainingMs,
        createdAt: new Date().toISOString(),
    });

    if (saveResult.source === 'remote') {
        state.saveState = { status: 'saved', message: `${modeConfig.saveStatusLabel}에 기록이 저장되었습니다.` };
    } else if (saveResult.source === 'fallback-local') {
        state.saveState = { status: 'saved-local', message: '실시간 저장소에 연결되지 않아 예시 보드와 현재 기기 기록에만 반영했습니다.' };
    } else {
        state.saveState = { status: 'saved-local', message: `현재 기기 ${modeConfig.saveStatusLabel}에 저장했습니다.` };
    }

    renderResult();
    await refreshBoard();
};

const finishRun = (reason = 'timer') => {
    if (state.phase !== 'running') return;
    clearInterval(state.timerId);
    clearTimeout(state.answerDelayId);
    state.timerId = 0;
    state.answerDelayId = 0;
    state.phase = 'finished';
    state.finishReason = reason;
    state.remainingMs = Math.max(0, state.remainingMs);
    setInlineStatus(reason === 'out_of_lives' ? '실수 3회로 종료되었습니다. 기록을 저장하는 중입니다.' : `${getModeConfig().label}이 끝났습니다. 기록을 저장하는 중입니다.`);
    render();
    void persistRun();
};

const applyElapsedTime = (elapsedMs) => {
    if (state.phase !== 'running') return;
    state.remainingMs = Math.max(0, state.remainingMs - elapsedMs);
    if (state.remainingMs <= 0) {
        finishRun('timer');
        return;
    }
    renderRunState();
};

const startTimer = () => {
    state.lastTickAt = window.performance.now();
    state.timerId = window.setInterval(() => {
        const now = window.performance.now();
        applyElapsedTime(now - state.lastTickAt);
        state.lastTickAt = now;
    }, TIMER_INTERVAL_MS);
};

const handleAnswer = (choiceId) => {
    if (state.phase !== 'running' || !state.currentQuestion || state.lastAnswer?.locked) return;
    const choice = state.currentQuestion.choices.find((option) => option.id === choiceId);
    if (!choice) return;

    state.answeredCount += 1;
    const isCorrect = Boolean(choice.isCorrect);
    if (isCorrect) {
        state.correctCount += 1;
        state.combo += 1;
        state.bestStreak = Math.max(state.bestStreak, state.combo);
        const scoreGain = getScoreGain();
        state.score += scoreGain;
        setInlineStatus(`정답입니다. +${formatNumber(scoreGain)}점`, 'positive');
    } else {
        state.combo = 0;
        state.mistakes += 1;
        if (Number.isFinite(getCurrentMaxMistakes())) {
            state.remainingLives = Math.max(0, getCurrentMaxMistakes() - state.mistakes);
        }
        setInlineStatus(`오답입니다. 정답: ${state.currentQuestion.correctAnswer}`, 'negative');
    }

    state.lastAnswer = { selectedChoiceId: choice.id, revealed: true, locked: true };
    render();

    if (!isCorrect && Number.isFinite(getCurrentMaxMistakes()) && state.mistakes >= getCurrentMaxMistakes()) {
        finishRun('out_of_lives');
        return;
    }

    state.answerDelayId = window.setTimeout(() => {
        state.answerDelayId = 0;
        if (state.phase === 'running') {
            void nextQuestion();
        }
    }, ANSWER_DELAY_MS);
};

const startRun = async () => {
    try {
        const selectedScope = getSelectedScope();
        if (!selectedScope) {
            throw new Error('플레이할 DAY 또는 범위를 먼저 선택해 주세요.');
        }

        state.phase = 'loading';
        state.saveState = { status: 'idle', message: '' };
        render();

        await ensureBookLibrary(state.selectedBookKey);
        state.questionQueue = await buildQuestionQueue();
        if (!state.questionQueue.length) throw new Error('선택한 범위에서 플레이 가능한 문제가 없습니다.');

        state.phase = 'running';
        state.currentQuestion = null;
        state.questionsServed = 0;
        state.answeredCount = 0;
        state.correctCount = 0;
        state.score = 0;
        state.combo = 0;
        state.bestStreak = 0;
        state.mistakes = 0;
        state.remainingLives = getCurrentMaxMistakes();
        state.finishReason = '';
        state.remainingMs = getCurrentDurationMs();
        state.lastAnswer = null;

        if (ui.resultCard) ui.resultCard.hidden = true;
        setInlineStatus(getModeConfig().runningCopy);
        await nextQuestion();
        startTimer();
        render();
    } catch (error) {
        resetRunState();
        state.phase = 'ready';
        setInlineStatus(error?.message || '게임을 시작하지 못했습니다. 다시 시도해 주세요.', 'negative');
        render();
    }
};

const setSelectedBook = async (bookKey) => {
    if (!state.books[bookKey] || state.phase === 'running') return;
    state.selectedBookKey = bookKey;
    if (!getBookOption(bookKey).supportsDerivatives) {
        state.includeDerivatives = false;
    }
    await ensureBookLibrary(bookKey);
    syncSelectedScope();
    render();
    void refreshBoard();
};

const setSelectedMode = (modeKey) => {
    const nextMode = normalizeModeKey(modeKey);
    if (state.phase === 'running' || nextMode === state.selectedMode) return;
    state.selectedMode = nextMode;
    syncModeToUrl();
    resetRunState();
    render();
    void refreshBoard();
};

const handleKeyboard = (event) => {
    if (event.defaultPrevented) return;
    if ((state.phase === 'ready' || state.phase === 'finished') && event.key === 'Enter') {
        event.preventDefault();
        void startRun();
        return;
    }
    if (state.phase !== 'running' || state.lastAnswer?.locked) return;

    const number = Number.parseInt(event.key, 10);
    if (Number.isInteger(number) && number >= 1 && number <= CHOICE_COUNT) {
        const choice = state.currentQuestion?.choices?.[number - 1];
        if (!choice) return;
        event.preventDefault();
        handleAnswer(choice.id);
    }
};

const bindEvents = () => {
    ui.startBtn?.addEventListener('click', () => {
        if (state.phase !== 'running') void startRun();
    });
    ui.restartBtn?.addEventListener('click', () => {
        void startRun();
    });
    ui.modeOptions.forEach((button) => {
        button.addEventListener('click', () => {
            setSelectedMode(button.dataset.modeKey || DEFAULT_MODE);
        });
    });
    ui.modeCards.forEach((button) => {
        button.addEventListener('click', () => {
            setSelectedMode(button.dataset.modeKey || DEFAULT_MODE);
        });
    });
    ui.bookOptions.forEach((button) => {
        button.addEventListener('click', () => {
            void setSelectedBook(button.dataset.bookKey || 'basic');
        });
    });
    ui.derivativeToggle?.addEventListener('change', () => {
        if (state.phase === 'running') return;
        state.includeDerivatives = Boolean(ui.derivativeToggle?.checked);
        resetRunState();
        render();
    });
    ui.scopeSelect?.addEventListener('change', () => {
        if (state.phase === 'running') return;
        state.selectedScopeValue = normalizeSpacingText(ui.scopeSelect?.value);
        resetRunState();
        render();
    });
    ui.boardFilters.forEach((button) => {
        button.addEventListener('click', () => {
            void setSelectedBook(button.dataset.bookKey || 'basic');
        });
    });
    ui.choiceList?.addEventListener('click', (event) => {
        const button = event.target instanceof HTMLElement ? event.target.closest('[data-choice-id]') : null;
        if (button instanceof HTMLElement) handleAnswer(button.dataset.choiceId || '');
    });
    window.addEventListener('keydown', handleKeyboard);
};

const hydrateUser = async () => {
    try {
        const { data, error } = await supabase.auth.getUser();
        if (error) throw error;
        const user = data?.user || null;
        state.user.id = normalizeSpacingText(user?.id);
        state.user.displayName = getDisplayName(user);
    } catch (_) {
        state.user.id = '';
        state.user.displayName = 'Player';
    }
};

const defineDebugHooks = () => {
    window.render_game_to_text = () => JSON.stringify({
        phase: state.phase,
        mode: state.selectedMode,
        book: state.selectedBookKey,
        includeDerivatives: shouldIncludeDerivatives(),
        scope: getSelectedScope()?.label || '',
        prompt: normalizeSpacingText(state.currentQuestion?.prompt),
        remainingMs: Math.round(state.remainingMs),
        score: state.score,
        combo: state.combo,
        accuracy: getAccuracyValue(),
        streak: state.bestStreak,
        mistakes: state.mistakes,
        remainingLives: Number.isFinite(state.remainingLives) ? state.remainingLives : null,
        answeredCount: state.answeredCount,
        boardSource: state.boardState.source,
        boardTop: state.boardState.runs.slice(0, 3).map((run) => ({
            rank: run.rank,
            displayName: run.displayName,
            score: run.score,
            mode: run.mode,
        })),
    }, null, 2);

    window.advanceTime = (ms) => {
        const elapsedMs = Number(ms);
        if (Number.isFinite(elapsedMs) && elapsedMs > 0) {
            applyElapsedTime(elapsedMs);
            state.lastTickAt = window.performance.now();
        }
        return window.render_game_to_text();
    };
};

export const initGamePage = async () => {
    if (!ui.startBtn) return;

    readModeFromUrl();
    syncModeToUrl();
    bindEvents();
    defineDebugHooks();
    resetRunState();
    render();

    await hydrateUser();
    await Promise.allSettled([
        ensureBookLibrary('basic'),
        ensureBookLibrary('advanced'),
        ensureBookLibrary('etymology'),
    ]);

    syncSelectedScope();
    render();
    await refreshBoard();
};
