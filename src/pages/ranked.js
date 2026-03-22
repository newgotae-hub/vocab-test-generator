import { supabase } from '/src/lib/supabaseClient.js';
import {
    LEADERBOARD_BOOK_OPTIONS,
    LEADERBOARD_MODE,
    LEADERBOARD_MODE_OPTIONS,
    LEADERBOARD_PERIOD_OPTIONS,
    getBookLabel,
    getLeaderboardSourceDescription,
    getLeaderboardSourceLabel,
    listRankedRuns,
} from '/src/lib/leaderboard.js';

const state = {
    filters: {
        mode: LEADERBOARD_MODE,
        period: 'today',
        bookKey: 'basic',
    },
    user: null,
    runs: [],
    localRuns: [],
    source: 'fallback-preview',
    error: null,
    loading: false,
    lastUpdatedAt: '',
};

const MODE_META = {
    ranked_sprint: {
        eyebrow: '랭킹 스프린트',
        heroTitle: '현재 리그 순위를 확인해 보세요.',
        heroDescription: '짧은 시간 안에 기록한 점수를 교재별, 기간별로 비교할 수 있습니다.',
        pageTitle: '랭킹 스프린트 | 평가원기출VOCA',
        primaryCtaLabel: '랭킹 스프린트 시작',
        primaryCtaHref: '/game/',
        rulesTitle: '정렬 기준',
        rules: [
            '점수가 높을수록 먼저 표시됩니다.',
            '점수가 같으면 정답률이 높은 기록이 앞섭니다.',
            '정답률도 같으면 최고 연속 정답 수를 비교합니다.',
            '마지막으로 더 짧은 시간 안에 기록한 결과가 앞섭니다.',
        ],
        sidebarTitle: '현재 집계 범위',
        sidebarDescription: 'Basic, Advanced, Etymology 교재 기준으로 랭킹 스프린트 기록을 비교합니다.',
        emptyCopy: '아직 이 조건의 랭킹 스프린트 기록이 없습니다.',
        emptyStandingCopy: '랭킹 스프린트를 플레이하면 내 순위를 확인할 수 있습니다.',
        replayLabel: '다시 플레이',
        scopePrefix: '스프린트',
        runFormatLabel: '진행 방식',
        runFormatValue: '60초 · 오답 제한 없음',
        podiumLabel: '포디움 컷',
        perfectStandingLabel: '현재 1위입니다.',
        perfectStandingHint: '지금 기록을 유지하려면 한 번 더 안정적으로 플레이해 보세요.',
        missingStandingHint: '현재 포디움 컷은 {target}입니다.',
        chaseTemplates: {
            podium: '포디움 진입까지 {gap} 더 필요합니다.',
            leader: '1위까지 {gap} 차이입니다.',
            next: '바로 앞 순위까지 {gap} 차이입니다.',
            safePodium: '현재 포디움 안에 있습니다.',
        },
    },
    survival_ladder: {
        eyebrow: '생존 모드',
        heroTitle: '생존 모드 순위를 확인해 보세요.',
        heroDescription: '90초와 3번의 실수 제한 안에서 기록한 점수를 비교합니다.',
        pageTitle: '생존 모드 | 평가원기출VOCA',
        primaryCtaLabel: '생존 모드 시작',
        primaryCtaHref: '/game/?mode=survival_ladder',
        rulesTitle: '정렬 기준',
        rules: [
            '점수가 높을수록 먼저 표시됩니다.',
            '점수가 같으면 정답률이 높은 기록이 앞섭니다.',
            '정답률도 같으면 최고 연속 정답 수를 비교합니다.',
            '생존 모드는 90초 또는 실수 3회에서 종료됩니다.',
        ],
        sidebarTitle: '현재 집계 범위',
        sidebarDescription: '같은 교재 기준 안에서 생존 모드 기록만 따로 비교합니다.',
        emptyCopy: '아직 이 조건의 생존 모드 기록이 없습니다.',
        emptyStandingCopy: '생존 모드를 플레이하면 내 순위를 확인할 수 있습니다.',
        replayLabel: '다시 플레이',
        scopePrefix: '생존',
        runFormatLabel: '진행 방식',
        runFormatValue: '90초 · 실수 3회 제한',
        podiumLabel: '포디움 컷',
        perfectStandingLabel: '현재 1위입니다.',
        perfectStandingHint: '안정적인 플레이로 선두를 유지해 보세요.',
        missingStandingHint: '현재 포디움 컷은 {target}입니다.',
        chaseTemplates: {
            podium: '포디움 진입까지 {gap} 더 필요합니다.',
            leader: '1위까지 {gap} 차이입니다.',
            next: '바로 앞 순위까지 {gap} 차이입니다.',
            safePodium: '현재 포디움 안에 있습니다.',
        },
    },
};

const normalizeSpacingText = (value) => String(value ?? '')
    .replace(/\uFEFF/g, '')
    .normalize('NFKC')
    .replace(/[\u0000-\u001F\u007F]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

const escapeHtml = (value) => String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

const formatInteger = (value) => new Intl.NumberFormat('en-US').format(Number(value || 0));
const formatScore = (value) => `${formatInteger(value)}점`;
const formatAccuracy = (value) => `${Number(value || 0).toFixed(1)}%`;

const formatDuration = (durationMs) => {
    const totalSeconds = Math.max(0, Math.round(Number(durationMs || 0) / 1000));
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    return `${minutes}:${String(seconds).padStart(2, '0')}`;
};

const formatDateTime = (value) => {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return '-';
    return new Intl.DateTimeFormat('en-US', {
        month: 'short',
        day: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
    }).format(date);
};

const getCurrentUserDisplayName = (user) => {
    const metadata = user?.user_metadata || {};
    return normalizeSpacingText(
        metadata.display_name
        || metadata.full_name
        || metadata.name
        || user?.email?.split('@')[0]
        || 'You'
    );
};

const getModeMeta = (modeKey) => MODE_META[modeKey] || MODE_META.ranked_sprint;

const getScoreGap = (targetScore, currentScore) => {
    const gap = Number(targetScore || 0) - Number(currentScore || 0);
    return gap <= 0 ? 0 : gap + 1;
};

const buildStandingInsights = (standing, runs, modeMeta) => {
    const leader = runs[0] || null;
    const podium = runs[2] || null;
    const nextRival = standing ? runs.find((run) => run.rank === standing.rank - 1) || null : null;

    if (!standing) {
        return {
            title: '아직 순위가 없습니다.',
            hint: podium
                ? modeMeta.missingStandingHint.replace('{target}', formatScore(podium.score))
                : modeMeta.emptyStandingCopy,
        };
    }

    if (standing.rank === 1) {
        return {
            title: modeMeta.perfectStandingLabel,
            hint: modeMeta.perfectStandingHint,
        };
    }

    if (standing.rank <= 3) {
        return {
            title: modeMeta.chaseTemplates.safePodium,
            hint: leader
                ? modeMeta.chaseTemplates.leader.replace('{gap}', formatScore(getScoreGap(leader.score, standing.score)))
                : modeMeta.perfectStandingHint,
        };
    }

    if (podium) {
        return {
            title: modeMeta.chaseTemplates.podium.replace('{gap}', formatScore(getScoreGap(podium.score, standing.score))),
            hint: nextRival
                ? modeMeta.chaseTemplates.next.replace('{gap}', formatScore(getScoreGap(nextRival.score, standing.score)))
                : modeMeta.emptyStandingCopy,
        };
    }

    return {
        title: modeMeta.emptyStandingCopy,
        hint: nextRival
            ? modeMeta.chaseTemplates.next.replace('{gap}', formatScore(getScoreGap(nextRival.score, standing.score)))
            : modeMeta.perfectStandingHint,
    };
};

const renderCompetitiveSummary = (ui) => {
    const modeMeta = getModeMeta(state.filters.mode);
    const podiumScore = state.runs.length >= 3 ? state.runs[2].score : 0;

    if (ui.runFormatLabel) ui.runFormatLabel.textContent = modeMeta.runFormatLabel;
    if (ui.runFormat) ui.runFormat.textContent = modeMeta.runFormatValue;
    if (ui.podiumLabel) ui.podiumLabel.textContent = modeMeta.podiumLabel;
    if (ui.podiumScore) ui.podiumScore.textContent = podiumScore ? formatScore(podiumScore) : '없음';
    if (ui.scopeLabel) {
        const periodLabel = LEADERBOARD_PERIOD_OPTIONS.find((option) => option.key === state.filters.period)?.label || '오늘';
        const bookLabel = LEADERBOARD_BOOK_OPTIONS.find((option) => option.key === state.filters.bookKey)?.label || 'Basic';
        ui.scopeLabel.textContent = `${modeMeta.scopePrefix} · ${periodLabel} · ${bookLabel}`;
    }
};

const readFiltersFromUrl = () => {
    const params = new URLSearchParams(window.location.search);
    const mode = normalizeSpacingText(params.get('mode')).toLowerCase();
    const period = normalizeSpacingText(params.get('period')).toLowerCase();
    const bookKey = normalizeSpacingText(params.get('book')).toLowerCase();

    if (LEADERBOARD_MODE_OPTIONS.some((option) => option.key === mode)) {
        state.filters.mode = mode;
    }
    if (['today', 'week', 'all'].includes(period)) {
        state.filters.period = period;
    }
    if (['all', 'basic', 'advanced', 'etymology'].includes(bookKey)) {
        state.filters.bookKey = bookKey;
    }
};

const syncFiltersToUrl = () => {
    const url = new URL(window.location.href);
    url.searchParams.set('mode', state.filters.mode);
    url.searchParams.set('period', state.filters.period);
    url.searchParams.set('book', state.filters.bookKey);
    window.history.replaceState({}, '', url);
};

const getUi = () => ({
    heroEyebrow: document.getElementById('leaderboard-hero-eyebrow'),
    heroTitle: document.getElementById('leaderboard-hero-title'),
    heroDescription: document.getElementById('leaderboard-hero-description'),
    primaryCta: document.getElementById('leaderboard-primary-cta'),
    modeFilters: document.getElementById('leaderboard-mode-filters'),
    periodFilters: document.getElementById('leaderboard-period-filters'),
    bookFilters: document.getElementById('leaderboard-book-filters'),
    sourceBadge: document.getElementById('leaderboard-source-badge'),
    sourceNote: document.getElementById('leaderboard-source-note'),
    lastUpdated: document.getElementById('leaderboard-last-updated'),
    loading: document.getElementById('leaderboard-loading'),
    empty: document.getElementById('leaderboard-empty'),
    podium: document.getElementById('leaderboard-podium'),
    tableBody: document.getElementById('leaderboard-table-body'),
    playerCount: document.getElementById('leaderboard-summary-players'),
    bestScore: document.getElementById('leaderboard-summary-best'),
    averageAccuracy: document.getElementById('leaderboard-summary-accuracy'),
    runFormatLabel: document.getElementById('leaderboard-summary-format-label'),
    runFormat: document.getElementById('leaderboard-summary-format'),
    podiumLabel: document.getElementById('leaderboard-summary-podium-label'),
    podiumScore: document.getElementById('leaderboard-summary-podium'),
    scopeLabel: document.getElementById('leaderboard-scope-label'),
    myStanding: document.getElementById('leaderboard-my-standing'),
    refreshButton: document.getElementById('leaderboard-refresh'),
    rulesTitle: document.getElementById('leaderboard-rules-title'),
    rule1: document.getElementById('leaderboard-rule-1'),
    rule2: document.getElementById('leaderboard-rule-2'),
    rule3: document.getElementById('leaderboard-rule-3'),
    rule4: document.getElementById('leaderboard-rule-4'),
    sidebarTitle: document.getElementById('leaderboard-sidebar-title'),
    sidebarDescription: document.getElementById('leaderboard-sidebar-description'),
});

const renderFilterGroup = (container, items, activeKey, dataAttribute) => {
    if (!container) return;
    container.innerHTML = items.map((item) => `
        <button
            type="button"
            class="ranked-filter-chip${item.key === activeKey ? ' is-active' : ''}"
            ${dataAttribute}="${escapeHtml(item.key)}"
        >
            ${escapeHtml(item.label)}
        </button>
    `).join('');
};

const renderModeContent = (ui) => {
    const modeMeta = getModeMeta(state.filters.mode);

    document.title = modeMeta.pageTitle;
    if (ui.heroEyebrow) ui.heroEyebrow.textContent = modeMeta.eyebrow;
    if (ui.heroTitle) ui.heroTitle.textContent = modeMeta.heroTitle;
    if (ui.heroDescription) ui.heroDescription.textContent = modeMeta.heroDescription;
    if (ui.primaryCta) {
        ui.primaryCta.textContent = modeMeta.primaryCtaLabel;
        ui.primaryCta.href = modeMeta.primaryCtaHref;
    }
    if (ui.rulesTitle) ui.rulesTitle.textContent = modeMeta.rulesTitle;
    if (ui.rule1) ui.rule1.textContent = modeMeta.rules[0];
    if (ui.rule2) ui.rule2.textContent = modeMeta.rules[1];
    if (ui.rule3) ui.rule3.textContent = modeMeta.rules[2];
    if (ui.rule4) ui.rule4.textContent = modeMeta.rules[3];
    if (ui.sidebarTitle) ui.sidebarTitle.textContent = modeMeta.sidebarTitle;
    if (ui.sidebarDescription) ui.sidebarDescription.textContent = modeMeta.sidebarDescription;
};

const renderSummary = (ui) => {
    const entrants = state.runs.length;
    const modeMeta = getModeMeta(state.filters.mode);
    const bestScore = entrants > 0 ? state.runs[0].score : 0;
    const podiumScore = entrants >= 3 ? state.runs[2].score : 0;
    const averageAccuracy = entrants > 0
        ? state.runs.reduce((sum, run) => sum + Number(run.accuracy || 0), 0) / entrants
        : 0;

    if (ui.playerCount) ui.playerCount.textContent = formatInteger(entrants);
    if (ui.bestScore) ui.bestScore.textContent = formatScore(bestScore);
    if (ui.averageAccuracy) ui.averageAccuracy.textContent = formatAccuracy(averageAccuracy);
    if (ui.runFormatLabel) ui.runFormatLabel.textContent = modeMeta.runFormatLabel;
    if (ui.runFormat) ui.runFormat.textContent = modeMeta.runFormatValue;
    if (ui.podiumLabel) ui.podiumLabel.textContent = modeMeta.podiumLabel;
    if (ui.podiumScore) ui.podiumScore.textContent = podiumScore ? formatScore(podiumScore) : '없음';
    if (ui.scopeLabel) {
        const periodLabel = LEADERBOARD_PERIOD_OPTIONS.find((option) => option.key === state.filters.period)?.label || '오늘';
        const bookLabel = LEADERBOARD_BOOK_OPTIONS.find((option) => option.key === state.filters.bookKey)?.label || 'Basic';
        ui.scopeLabel.textContent = `${modeMeta.scopePrefix} · ${periodLabel} · ${bookLabel}`;
    }
};

const renderStatus = (ui) => {
    if (ui.sourceBadge) {
        ui.sourceBadge.textContent = getLeaderboardSourceLabel(state.source);
        ui.sourceBadge.dataset.source = state.source;
    }
    if (ui.sourceNote) {
        ui.sourceNote.textContent = getLeaderboardSourceDescription(state.source);
    }
    if (ui.lastUpdated) {
        ui.lastUpdated.textContent = state.lastUpdatedAt
            ? `업데이트 ${formatDateTime(state.lastUpdatedAt)}`
            : '준비 완료';
    }
    if (ui.loading) {
        ui.loading.hidden = !state.loading;
    }
};

const renderPodium = (ui) => {
    if (!ui.podium) return;
    const modeMeta = getModeMeta(state.filters.mode);
    const topRuns = state.runs.slice(0, 3);

    if (topRuns.length === 0) {
        ui.podium.innerHTML = `
            <article class="ranked-podium-card is-empty">
                <span class="ranked-podium-place">--</span>
                <strong>아직 기록이 없습니다.</strong>
                <p>${escapeHtml(modeMeta.emptyCopy)}</p>
            </article>
        `;
        return;
    }

    const order = topRuns.length === 3
        ? [1, 0, 2]
        : topRuns.map((_run, index) => index);
    ui.podium.innerHTML = order.map((runIndex) => {
        const run = topRuns[runIndex];
        return `
            <article class="ranked-podium-card ranked-podium-card--${run.rank}">
                <span class="ranked-podium-place">#${run.rank}</span>
                <div class="ranked-podium-avatar">${escapeHtml(run.displayName.slice(0, 2).toUpperCase())}</div>
                <strong>${escapeHtml(run.displayName)}</strong>
                <span class="ranked-podium-meta">${escapeHtml(getBookLabel(run.bookKey))}</span>
                <span class="ranked-podium-score">${escapeHtml(formatScore(run.score))}</span>
                <div class="ranked-podium-stats">
                    <span>${escapeHtml(formatAccuracy(run.accuracy))}</span>
                    <span>${escapeHtml(`연속 ${run.streak}`)}</span>
                    <span>${escapeHtml(formatDuration(run.durationMs))}</span>
                </div>
            </article>
        `;
    }).join('');
};

const renderTable = (ui) => {
    if (!ui.tableBody || !ui.empty) return;

    if (state.runs.length === 0) {
        ui.tableBody.innerHTML = '';
        ui.empty.hidden = false;
        ui.empty.textContent = getModeMeta(state.filters.mode).emptyCopy;
        return;
    }

    ui.empty.hidden = true;
    const currentUserId = normalizeSpacingText(state.user?.id);
    const currentUserName = getCurrentUserDisplayName(state.user);

    ui.tableBody.innerHTML = state.runs.map((run) => {
        const isMe = (
            (currentUserId && normalizeSpacingText(run.userId) === currentUserId)
            || (!currentUserId && normalizeSpacingText(run.displayName) === currentUserName)
        );
        return `
            <tr class="${isMe ? 'is-me' : ''}">
                <td class="ranked-rank-cell">#${run.rank}</td>
                <td>
                    <div class="ranked-player-cell">
                        <strong>${escapeHtml(run.displayName)}</strong>
                        <span>${escapeHtml(getBookLabel(run.bookKey))}</span>
                    </div>
                </td>
                <td>${escapeHtml(formatScore(run.score))}</td>
                <td>${escapeHtml(formatAccuracy(run.accuracy))}</td>
                <td>${escapeHtml(`${run.streak}`)}</td>
                <td>${escapeHtml(formatDuration(run.durationMs))}</td>
                <td>${escapeHtml(formatDateTime(run.createdAt))}</td>
            </tr>
        `;
    }).join('');
};

const renderMyStanding = (ui) => {
    if (!ui.myStanding) return;
    const modeMeta = getModeMeta(state.filters.mode);
    const currentUserId = normalizeSpacingText(state.user?.id);
    const currentUserName = getCurrentUserDisplayName(state.user);

    const matcher = (run) => (
        (currentUserId && normalizeSpacingText(run.userId) === currentUserId)
        || (!currentUserId && normalizeSpacingText(run.displayName) === currentUserName)
    );

    const liveStanding = state.runs.find(matcher);
    const localStanding = state.localRuns.find(matcher);
    const standing = liveStanding || localStanding;
    const tone = liveStanding ? 'live' : (localStanding ? 'local' : 'empty');
    const insight = buildStandingInsights(standing, state.runs, modeMeta);

    if (!standing) {
        ui.myStanding.innerHTML = `
            <div class="ranked-my-card ranked-my-card--empty">
                <span class="eyebrow">내 순위</span>
                <strong>${escapeHtml(currentUserName)}</strong>
                <p>${escapeHtml(insight.title)}</p>
                <p>${escapeHtml(insight.hint)}</p>
                <a class="ranked-button ranked-button--primary" href="${escapeHtml(modeMeta.primaryCtaHref)}">${escapeHtml(modeMeta.primaryCtaLabel)}</a>
            </div>
        `;
        return;
    }

    ui.myStanding.innerHTML = `
        <div class="ranked-my-card ranked-my-card--${tone}">
            <span class="eyebrow">${tone === 'live' ? '실시간 순위' : '내 기록'}</span>
            <div class="ranked-my-rank">#${standing.rank}</div>
            <strong>${escapeHtml(standing.displayName)}</strong>
            <p>${escapeHtml(getBookLabel(standing.bookKey))} · ${escapeHtml(formatScore(standing.score))}</p>
            <div class="ranked-my-stats">
                <span>${escapeHtml(formatAccuracy(standing.accuracy))}</span>
                <span>${escapeHtml(`연속 ${standing.streak}`)}</span>
                <span>${escapeHtml(formatDuration(standing.durationMs))}</span>
            </div>
            <p>${escapeHtml(insight.title)}</p>
            <p>${escapeHtml(insight.hint)}</p>
            <a class="ranked-button ranked-button--primary" href="${escapeHtml(modeMeta.primaryCtaHref)}">${escapeHtml(modeMeta.replayLabel)}</a>
        </div>
    `;
};

const render = () => {
    const ui = getUi();
    renderModeContent(ui);
    renderFilterGroup(ui.modeFilters, LEADERBOARD_MODE_OPTIONS, state.filters.mode, 'data-mode-option');
    renderFilterGroup(ui.periodFilters, LEADERBOARD_PERIOD_OPTIONS, state.filters.period, 'data-period-option');
    renderFilterGroup(ui.bookFilters, LEADERBOARD_BOOK_OPTIONS, state.filters.bookKey, 'data-book-option');
    renderStatus(ui);
    renderSummary(ui);
    renderCompetitiveSummary(ui);
    renderPodium(ui);
    renderTable(ui);
    renderMyStanding(ui);
    if (ui.refreshButton) {
        ui.refreshButton.disabled = state.loading;
    }
};

const loadLeaderboard = async () => {
    state.loading = true;
    render();

    const result = await listRankedRuns({
        mode: state.filters.mode,
        period: state.filters.period,
        bookKey: state.filters.bookKey,
    });

    state.runs = Array.isArray(result.runs) ? result.runs : [];
    state.localRuns = Array.isArray(result.localRuns) ? result.localRuns : [];
    state.source = result.source || 'fallback-preview';
    state.error = result.error || null;
    state.lastUpdatedAt = new Date().toISOString();
    state.loading = false;
    render();
};

const handleFilterClick = (event) => {
    if (!(event.target instanceof Element)) return;

    const modeTrigger = event.target.closest('[data-mode-option]');
    if (modeTrigger instanceof HTMLButtonElement) {
        const nextMode = normalizeSpacingText(modeTrigger.getAttribute('data-mode-option')).toLowerCase();
        if (nextMode && nextMode !== state.filters.mode) {
            state.filters.mode = nextMode;
            syncFiltersToUrl();
            void loadLeaderboard();
        }
        return;
    }

    const periodTrigger = event.target.closest('[data-period-option]');
    if (periodTrigger instanceof HTMLButtonElement) {
        const nextPeriod = normalizeSpacingText(periodTrigger.getAttribute('data-period-option')).toLowerCase();
        if (nextPeriod && nextPeriod !== state.filters.period) {
            state.filters.period = nextPeriod;
            syncFiltersToUrl();
            void loadLeaderboard();
        }
        return;
    }

    const bookTrigger = event.target.closest('[data-book-option]');
    if (bookTrigger instanceof HTMLButtonElement) {
        const nextBook = normalizeSpacingText(bookTrigger.getAttribute('data-book-option')).toLowerCase();
        if (nextBook && nextBook !== state.filters.bookKey) {
            state.filters.bookKey = nextBook;
            syncFiltersToUrl();
            void loadLeaderboard();
        }
    }
};

const bindEvents = () => {
    document.addEventListener('click', handleFilterClick);
    const ui = getUi();
    ui.refreshButton?.addEventListener('click', () => {
        void loadLeaderboard();
    });
};

export const initRankedPage = async () => {
    readFiltersFromUrl();
    syncFiltersToUrl();
    bindEvents();

    const [{ data: sessionData }, { data: userData }] = await Promise.all([
        supabase.auth.getSession(),
        supabase.auth.getUser(),
    ]);

    state.user = userData?.user || sessionData?.session?.user || null;
    render();
    await loadLeaderboard();
};
