import { supabase } from '/src/lib/supabaseClient.js';
import { canUseLocalPreviewForPage } from '/src/lib/previewMode.js';

export const LEADERBOARD_MODE = 'ranked_sprint';
export const LEADERBOARD_TABLE = 'ranked_runs';
export const LEADERBOARD_LOCAL_STORAGE_KEY = 'voca_plus_ranked_runs_v1';
export const LEADERBOARD_BOOK_KEYS = ['basic', 'advanced', 'etymology'];
export const LEADERBOARD_MODE_KEYS = ['ranked_sprint', 'survival_ladder'];
export const LEADERBOARD_BOOK_OPTIONS = [
    { key: 'all', label: '전체 교재' },
    { key: 'basic', label: 'Basic' },
    { key: 'advanced', label: 'Advanced' },
    { key: 'etymology', label: 'Etymology' },
];
export const LEADERBOARD_MODE_OPTIONS = [
    { key: 'ranked_sprint', label: '랭킹 스프린트' },
    { key: 'survival_ladder', label: '생존 모드' },
];
export const LEADERBOARD_PERIOD_OPTIONS = [
    { key: 'today', label: '오늘' },
    { key: 'week', label: '이번 주' },
    { key: 'all', label: '전체' },
];

const FALLBACK_MODE_NAMES = {
    ranked_sprint: {
        basic: ['Minseo', 'Jisoo', 'Lena', 'Daniel', 'Ari', 'Noah'],
        advanced: ['Yuna', 'Harin', 'Theo', 'Jun', 'Mina', 'Evan'],
        etymology: ['RootFox', 'MorphLab', 'PrefixPilot', 'Nova', 'Orbit'],
    },
    survival_ladder: {
        basic: ['Rina', 'Seojun', 'Milo', 'Hana', 'Doyun', 'Mira'],
        advanced: ['Atlas', 'Sora', 'Nari', 'Theo', 'Eli', 'Jin'],
        etymology: ['Lexi', 'PrefixPro', 'SuffixAce', 'Orbit', 'RootWave'],
    },
};

const FALLBACK_MODE_CONFIG = {
    ranked_sprint: {
        baseScore: 1480,
        scoreStep: 74,
        bookPenalty: 38,
        accuracyBase: 98,
        accuracyStep: 2.6,
        accuracyBookPenalty: 0.8,
        accuracyFloor: 72,
        streakBase: 22,
        streakStep: 2,
        streakBookPenalty: 1,
        durationBase: 52000,
        durationStep: 1400,
        durationBookPenalty: 900,
        ageStepHours: 5,
        ageBookPenalty: 3,
    },
    survival_ladder: {
        baseScore: 2140,
        scoreStep: 96,
        bookPenalty: 54,
        accuracyBase: 99.2,
        accuracyStep: 1.7,
        accuracyBookPenalty: 0.5,
        accuracyFloor: 78,
        streakBase: 31,
        streakStep: 3,
        streakBookPenalty: 2,
        durationBase: 76000,
        durationStep: 2100,
        durationBookPenalty: 1500,
        ageStepHours: 7,
        ageBookPenalty: 4,
    },
};

const BOOK_LABELS = {
    basic: 'Basic',
    advanced: 'Advanced',
    etymology: 'Etymology',
};

const MODE_LABELS = {
    ranked_sprint: '랭킹 스프린트',
    survival_ladder: '생존 모드',
};

const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

const normalizeSpacingText = (value) => String(value ?? '')
    .replace(/\uFEFF/g, '')
    .normalize('NFKC')
    .replace(/[\u0000-\u001F\u007F]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

const normalizeBookKey = (value) => {
    const normalized = normalizeSpacingText(value).toLowerCase();
    if (LEADERBOARD_BOOK_KEYS.includes(normalized)) {
        return normalized;
    }
    return 'basic';
};

const normalizePeriodKey = (value) => {
    const normalized = normalizeSpacingText(value).toLowerCase();
    return ['today', 'week', 'all'].includes(normalized) ? normalized : 'today';
};

const normalizeMode = (value) => {
    const normalized = normalizeSpacingText(value).toLowerCase();
    if (LEADERBOARD_MODE_KEYS.includes(normalized)) {
        return normalized;
    }
    return LEADERBOARD_MODE;
};

const normalizeDuration = (value) => {
    const numeric = Number.parseInt(String(value ?? ''), 10);
    if (Number.isNaN(numeric)) return 0;
    return Math.max(0, numeric);
};

const normalizeStreak = (value) => {
    const numeric = Number.parseInt(String(value ?? ''), 10);
    if (Number.isNaN(numeric)) return 0;
    return Math.max(0, numeric);
};

const normalizeScore = (value) => {
    const numeric = Number.parseInt(String(value ?? ''), 10);
    if (Number.isNaN(numeric)) return 0;
    return Math.max(0, numeric);
};

const normalizeAccuracy = (value) => {
    const numeric = Number.parseFloat(String(value ?? ''));
    if (Number.isNaN(numeric)) return 0;
    return clamp(numeric, 0, 100);
};

const normalizeCreatedAt = (value) => {
    const date = new Date(value || Date.now());
    if (Number.isNaN(date.getTime())) {
        return new Date().toISOString();
    }
    return date.toISOString();
};

const normalizeDisplayName = (value, fallback = 'Player') => {
    const normalized = normalizeSpacingText(value);
    return normalized || fallback;
};

const normalizeUserId = (value, fallback = '') => {
    const normalized = normalizeSpacingText(value);
    return normalized || fallback;
};

const mapRemoteRow = (row) => ({
    id: normalizeSpacingText(row?.id),
    userId: normalizeUserId(row?.user_id),
    displayName: normalizeDisplayName(row?.display_name),
    bookKey: normalizeBookKey(row?.book_key),
    mode: normalizeMode(row?.mode),
    score: normalizeScore(row?.score),
    accuracy: normalizeAccuracy(row?.accuracy),
    streak: normalizeStreak(row?.streak),
    durationMs: normalizeDuration(row?.duration_ms),
    createdAt: normalizeCreatedAt(row?.created_at),
});

const mapLocalRow = (row) => ({
    id: normalizeSpacingText(row?.id),
    userId: normalizeUserId(row?.userId || row?.user_id, ''),
    displayName: normalizeDisplayName(row?.displayName || row?.display_name),
    bookKey: normalizeBookKey(row?.bookKey || row?.book_key),
    mode: normalizeMode(row?.mode),
    score: normalizeScore(row?.score),
    accuracy: normalizeAccuracy(row?.accuracy),
    streak: normalizeStreak(row?.streak),
    durationMs: normalizeDuration(row?.durationMs || row?.duration_ms),
    createdAt: normalizeCreatedAt(row?.createdAt || row?.created_at),
});

const toRemoteInsertPayload = (row) => ({
    user_id: normalizeUserId(row?.userId),
    display_name: normalizeDisplayName(row?.displayName),
    book_key: normalizeBookKey(row?.bookKey),
    mode: normalizeMode(row?.mode),
    score: normalizeScore(row?.score),
    accuracy: normalizeAccuracy(row?.accuracy),
    streak: normalizeStreak(row?.streak),
    duration_ms: normalizeDuration(row?.durationMs),
    created_at: normalizeCreatedAt(row?.createdAt),
});

const isMissingLeaderboardTableError = (error) => {
    const message = normalizeSpacingText(error?.message).toLowerCase();
    const details = normalizeSpacingText(error?.details).toLowerCase();
    const hint = normalizeSpacingText(error?.hint).toLowerCase();
    return error?.code === '42P01'
        || error?.code === 'PGRST205'
        || message.includes('ranked_runs')
        || message.includes('schema cache')
        || details.includes('ranked_runs')
        || hint.includes('ranked_runs')
        || error?.status === 404;
};

const isUnsupportedLeaderboardModeError = (error) => {
    const message = normalizeSpacingText(error?.message).toLowerCase();
    const details = normalizeSpacingText(error?.details).toLowerCase();
    const hint = normalizeSpacingText(error?.hint).toLowerCase();
    return error?.code === '23514'
        || message.includes('ranked_runs_mode_check')
        || details.includes('ranked_runs_mode_check')
        || hint.includes('ranked_runs_mode_check')
        || message.includes('violates check constraint')
        || details.includes('violates check constraint');
};

const shouldFallbackToLocalBoard = (error) => (
    isMissingLeaderboardTableError(error)
    || isUnsupportedLeaderboardModeError(error)
);

const getLocalStorage = () => {
    if (typeof localStorage === 'undefined') return null;
    return localStorage;
};

const readLocalRuns = () => {
    const storage = getLocalStorage();
    if (!storage) return [];

    const raw = storage.getItem(LEADERBOARD_LOCAL_STORAGE_KEY);
    if (!raw) return [];

    try {
        const parsed = JSON.parse(raw);
        if (!Array.isArray(parsed)) return [];
        return parsed.map(mapLocalRow);
    } catch (_) {
        return [];
    }
};

const writeLocalRuns = (runs) => {
    const storage = getLocalStorage();
    if (!storage) return;
    storage.setItem(LEADERBOARD_LOCAL_STORAGE_KEY, JSON.stringify(runs));
};

const upsertLocalRun = (run) => {
    const runs = readLocalRuns();
    runs.unshift({
        id: run.id,
        userId: run.userId,
        displayName: run.displayName,
        bookKey: run.bookKey,
        mode: run.mode,
        score: run.score,
        accuracy: run.accuracy,
        streak: run.streak,
        durationMs: run.durationMs,
        createdAt: run.createdAt,
    });
    writeLocalRuns(runs.slice(0, 120));
};

const getPeriodStart = (periodKey) => {
    const now = new Date();
    if (periodKey === 'all') return null;

    if (periodKey === 'today') {
        const start = new Date(now);
        start.setHours(0, 0, 0, 0);
        return start;
    }

    const start = new Date(now);
    const day = start.getDay();
    const diff = (day + 6) % 7;
    start.setDate(start.getDate() - diff);
    start.setHours(0, 0, 0, 0);
    return start;
};

const createFallbackRuns = () => {
    const now = Date.now();
    const ladders = [];

    LEADERBOARD_MODE_KEYS.forEach((modeKey) => {
        const modeConfig = FALLBACK_MODE_CONFIG[modeKey] || FALLBACK_MODE_CONFIG[LEADERBOARD_MODE];
        const fallbackNames = FALLBACK_MODE_NAMES[modeKey] || {};

        LEADERBOARD_BOOK_KEYS.forEach((bookKey, bookIndex) => {
            const names = fallbackNames[bookKey] || [];
            names.forEach((displayName, index) => {
                const ageOffsetHours = (index * modeConfig.ageStepHours) + (bookIndex * modeConfig.ageBookPenalty);
                ladders.push({
                    id: `fallback-${modeKey}-${bookKey}-${index + 1}`,
                    userId: `fallback-${modeKey}-${bookKey}-${index + 1}`,
                    displayName,
                    bookKey,
                    mode: modeKey,
                    score: modeConfig.baseScore - (index * modeConfig.scoreStep) - (bookIndex * modeConfig.bookPenalty),
                    accuracy: clamp(
                        modeConfig.accuracyBase - (index * modeConfig.accuracyStep) - (bookIndex * modeConfig.accuracyBookPenalty),
                        modeConfig.accuracyFloor,
                        99.9,
                    ),
                    streak: Math.max(8, modeConfig.streakBase - (index * modeConfig.streakStep) - (bookIndex * modeConfig.streakBookPenalty)),
                    durationMs: modeConfig.durationBase + (index * modeConfig.durationStep) + (bookIndex * modeConfig.durationBookPenalty),
                    createdAt: new Date(now - (ageOffsetHours * 60 * 60 * 1000)).toISOString(),
                });
            });
        });
    });

    return ladders;
};

const passesPeriodFilter = (run, periodKey) => {
    const periodStart = getPeriodStart(periodKey);
    if (!periodStart) return true;
    return new Date(run.createdAt).getTime() >= periodStart.getTime();
};

const rankRuns = (runs, { bookKey = 'all', mode = LEADERBOARD_MODE, period = 'today' } = {}) => {
    const normalizedBookKey = normalizeSpacingText(bookKey).toLowerCase();
    const normalizedMode = normalizeMode(mode);
    const normalizedPeriod = normalizePeriodKey(period);

    const filtered = runs.filter((run) => {
        const runBookKey = normalizeBookKey(run.bookKey);
        return normalizeMode(run.mode) === normalizedMode
            && (normalizedBookKey === 'all' || runBookKey === normalizedBookKey)
            && passesPeriodFilter(run, normalizedPeriod);
    });

    const bestByUser = new Map();
    filtered.forEach((run) => {
        const key = `${run.userId || run.displayName}::${normalizeBookKey(run.bookKey)}::${normalizeMode(run.mode)}`;
        const existing = bestByUser.get(key);
        if (!existing) {
            bestByUser.set(key, run);
            return;
        }

        const shouldReplace = run.score > existing.score
            || (run.score === existing.score && run.accuracy > existing.accuracy)
            || (run.score === existing.score && run.accuracy === existing.accuracy && run.streak > existing.streak)
            || (run.score === existing.score && run.accuracy === existing.accuracy && run.streak === existing.streak && run.durationMs < existing.durationMs)
            || (run.score === existing.score && run.accuracy === existing.accuracy && run.streak === existing.streak && run.durationMs === existing.durationMs && new Date(run.createdAt).getTime() < new Date(existing.createdAt).getTime());

        if (shouldReplace) {
            bestByUser.set(key, run);
        }
    });

    return [...bestByUser.values()]
        .sort((left, right) => (
            right.score - left.score
            || right.accuracy - left.accuracy
            || right.streak - left.streak
            || left.durationMs - right.durationMs
            || new Date(left.createdAt).getTime() - new Date(right.createdAt).getTime()
        ))
        .map((run, index) => ({
            ...run,
            rank: index + 1,
            bookLabel: BOOK_LABELS[normalizeBookKey(run.bookKey)] || BOOK_LABELS.basic,
        }));
};

export const buildRankedRunRecord = (input) => ({
    id: normalizeSpacingText(input?.id) || `local-${Date.now()}-${Math.random().toString(16).slice(2)}`,
    userId: normalizeUserId(input?.userId),
    displayName: normalizeDisplayName(input?.displayName),
    bookKey: normalizeBookKey(input?.bookKey),
    mode: normalizeMode(input?.mode),
    score: normalizeScore(input?.score),
    accuracy: normalizeAccuracy(input?.accuracy),
    streak: normalizeStreak(input?.streak),
    durationMs: normalizeDuration(input?.durationMs),
    createdAt: normalizeCreatedAt(input?.createdAt),
});

export const saveRankedRun = async (input) => {
    const record = buildRankedRunRecord(input);
    upsertLocalRun(record);

    if (!record.userId) {
        return {
            record,
            source: 'local-only',
            remoteAvailable: false,
            error: null,
        };
    }

    try {
        const { data, error } = await supabase
            .from(LEADERBOARD_TABLE)
            .insert(toRemoteInsertPayload(record))
            .select('id, user_id, display_name, book_key, mode, score, accuracy, streak, duration_ms, created_at')
            .single();

        if (error) throw error;

        return {
            record: mapRemoteRow(data),
            source: 'remote',
            remoteAvailable: true,
            error: null,
        };
    } catch (error) {
        return {
            record,
            source: shouldFallbackToLocalBoard(error) ? 'fallback-local' : 'local-only',
            remoteAvailable: false,
            error,
        };
    }
};

export const listRankedRuns = async (filters = {}) => {
    const normalizedFilters = {
        bookKey: normalizeSpacingText(filters.bookKey).toLowerCase() || 'all',
        mode: normalizeMode(filters.mode),
        period: normalizePeriodKey(filters.period),
    };

    const localRuns = readLocalRuns();

    try {
        let query = supabase
            .from(LEADERBOARD_TABLE)
            .select('id, user_id, display_name, book_key, mode, score, accuracy, streak, duration_ms, created_at')
            .eq('mode', normalizedFilters.mode)
            .order('score', { ascending: false })
            .order('accuracy', { ascending: false })
            .order('streak', { ascending: false })
            .order('duration_ms', { ascending: true })
            .limit(300);

        if (normalizedFilters.bookKey !== 'all') {
            query = query.eq('book_key', normalizedFilters.bookKey);
        }

        const periodStart = getPeriodStart(normalizedFilters.period);
        if (periodStart) {
            query = query.gte('created_at', periodStart.toISOString());
        }

        const { data, error } = await query;
        if (error) throw error;

        const remoteRows = (data || []).map(mapRemoteRow);
        const rankedRemoteRuns = rankRuns(remoteRows, normalizedFilters);
        const rankedLocalRuns = rankRuns(localRuns, normalizedFilters);

        return {
            filters: normalizedFilters,
            source: 'remote',
            remoteAvailable: true,
            runs: rankedRemoteRuns,
            localRuns: rankedLocalRuns,
            error: null,
        };
    } catch (error) {
        const seededPreviewRuns = canUseLocalPreviewForPage('ranked') ? createFallbackRuns() : [];
        const mergedFallback = [...seededPreviewRuns, ...localRuns];
        const hasSeededPreview = seededPreviewRuns.length > 0;
        const hasLocalRuns = localRuns.length > 0;

        return {
            filters: normalizedFilters,
            source: hasSeededPreview
                ? (hasLocalRuns ? 'fallback-local' : 'fallback-preview')
                : 'local-only',
            remoteAvailable: false,
            runs: rankRuns(mergedFallback, normalizedFilters),
            localRuns: rankRuns(localRuns, normalizedFilters),
            error,
        };
    }
};

export const getLeaderboardSourceLabel = (source) => {
    if (source === 'remote') return '실시간 보드';
    if (source === 'fallback-local') return '예시 보드 + 내 기록';
    if (source === 'fallback-preview') return '예시 보드';
    return '내 기록 보드';
};

export const getLeaderboardSourceDescription = (source) => {
    if (source === 'remote') return 'Supabase에 저장된 실제 기록을 불러오고 있습니다.';
    if (source === 'fallback-local') return '실시간 랭킹을 불러오지 못해 예시 보드와 내 기록을 함께 보여주고 있습니다.';
    if (source === 'fallback-preview') return '실시간 랭킹을 불러오지 못해 예시 보드를 보여주고 있습니다.';
    return '실시간 랭킹을 불러오지 못해 현재 기기 기록만 표시합니다.';
};

export const getBookLabel = (bookKey) => BOOK_LABELS[normalizeBookKey(bookKey)] || BOOK_LABELS.basic;
export const getModeLabel = (modeKey) => MODE_LABELS[normalizeMode(modeKey)] || MODE_LABELS[LEADERBOARD_MODE];
