import { BOOK_CSV_TEXT } from '../../private_data/vocabCsvData.js';
import { applyBookRowFixes } from '../../../src/lib/vocabDataFixes.js';

const DEFAULT_SUPABASE_URL = 'https://ymzygbjihhttszijdkei.supabase.co';
const DEFAULT_SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_cUXkuDrgyqtyRqh1rmH1HQ_PYwi7nxX';
const DEFAULT_ALLOWED_HOSTS = [
    'voca.plus',
    'www.voca.plus',
    'localhost',
    '127.0.0.1',
    '*.pages.dev',
];

const parsedBookCache = new Map();
const tokenAuthCache = new Map();
const rateByUser = new Map();
const RATE_WINDOW_MS = 60 * 1000;
const RATE_MAX_REQUESTS_PER_WINDOW = 80;

const normalizeSpacingText = (value) => {
    if (value === null || value === undefined) return '';
    return String(value)
        .replace(/\uFEFF/g, '')
        .normalize('NFKC')
        .replace(/[\u0000-\u001F\u007F]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
};

const normalizeBookKey = (bookKey) => {
    const normalized = normalizeSpacingText(bookKey).toLowerCase();
    if (normalized === 'etymology' || normalized === 'basic' || normalized === 'advanced') {
        return normalized;
    }
    return '';
};

const json = (payload, status = 200) => {
    return new Response(JSON.stringify(payload), {
        status,
        headers: {
            'content-type': 'application/json; charset=utf-8',
            'cache-control': 'no-store',
        },
    });
};

const parseCsvRows = (csvText) => {
    const text = String(csvText || '');
    const table = [];
    let row = [];
    let field = '';
    let index = 0;
    let inQuotes = false;

    while (index < text.length) {
        const char = text[index];

        if (char === '"') {
            const nextChar = text[index + 1];
            if (inQuotes && nextChar === '"') {
                field += '"';
                index += 2;
                continue;
            }
            inQuotes = !inQuotes;
            index += 1;
            continue;
        }

        if (char === ',' && !inQuotes) {
            row.push(field);
            field = '';
            index += 1;
            continue;
        }

        if ((char === '\n' || char === '\r') && !inQuotes) {
            if (char === '\r' && text[index + 1] === '\n') {
                index += 1;
            }
            row.push(field);
            field = '';

            if (row.some((cell) => normalizeSpacingText(cell))) {
                table.push(row);
            }
            row = [];
            index += 1;
            continue;
        }

        field += char;
        index += 1;
    }

    row.push(field);
    if (row.some((cell) => normalizeSpacingText(cell))) {
        table.push(row);
    }
    if (table.length === 0) return [];

    const headers = table[0].map((value) => String(value || ''));
    return table.slice(1).map((cells) => {
        const output = {};
        headers.forEach((header, headerIndex) => {
            output[header] = cells[headerIndex] ?? '';
        });
        return output;
    });
};

const getBookRows = (bookKey) => {
    if (parsedBookCache.has(bookKey)) {
        return parsedBookCache.get(bookKey);
    }

    const csvText = BOOK_CSV_TEXT?.[bookKey];
    if (!csvText) {
        throw new Error('지원되지 않는 교재입니다.');
    }

    const rows = applyBookRowFixes(bookKey, parseCsvRows(csvText));
    parsedBookCache.set(bookKey, rows);
    return rows;
};

const getBearerToken = (request) => {
    const authHeader = request.headers.get('authorization') || '';
    const match = authHeader.match(/^Bearer\s+(.+)$/i);
    return normalizeSpacingText(match?.[1] || '');
};

const getAllowedHosts = (env) => {
    const raw = normalizeSpacingText(env?.ALLOWED_HOSTS || '');
    if (!raw) return DEFAULT_ALLOWED_HOSTS;
    return raw
        .split(',')
        .map((host) => normalizeSpacingText(host).toLowerCase())
        .filter(Boolean);
};

const isHostAllowed = (host, allowedHosts) => {
    const normalizedHost = normalizeSpacingText(host).toLowerCase();
    if (!normalizedHost) return false;

    return allowedHosts.some((pattern) => {
        if (!pattern) return false;
        if (pattern.startsWith('*.')) {
            return normalizedHost.endsWith(pattern.slice(1));
        }
        return normalizedHost === pattern;
    });
};

const fetchSupabaseUserByToken = async ({ token, env }) => {
    const supabaseUrl = normalizeSpacingText(env?.SUPABASE_URL) || DEFAULT_SUPABASE_URL;
    const publishableKey = normalizeSpacingText(env?.SUPABASE_PUBLISHABLE_KEY) || DEFAULT_SUPABASE_PUBLISHABLE_KEY;

    const response = await fetch(`${supabaseUrl}/auth/v1/user`, {
        method: 'GET',
        headers: {
            apikey: publishableKey,
            authorization: `Bearer ${token}`,
        },
    });

    if (!response.ok) return null;
    const user = await response.json().catch(() => null);
    if (!user || !user.id) return null;
    return user;
};

const getAuthenticatedUser = async ({ request, env }) => {
    const token = getBearerToken(request);
    if (!token) return null;

    const now = Date.now();
    const cached = tokenAuthCache.get(token);
    if (cached && cached.expiresAt > now) {
        return cached.user;
    }

    const user = await fetchSupabaseUserByToken({ token, env });
    if (!user) return null;

    tokenAuthCache.set(token, {
        user,
        expiresAt: now + 30 * 1000,
    });
    return user;
};

const enforceRateLimit = (userId) => {
    const now = Date.now();
    const history = rateByUser.get(userId) || [];
    const recent = history.filter((time) => now - time <= RATE_WINDOW_MS);

    if (recent.length >= RATE_MAX_REQUESTS_PER_WINDOW) {
        rateByUser.set(userId, recent);
        return false;
    }

    recent.push(now);
    rateByUser.set(userId, recent);
    return true;
};

export const onRequest = async (context) => {
    try {
        const { request, env } = context;
        if (request.method !== 'POST') {
            return json({ ok: false, error: 'Method Not Allowed' }, 405);
        }

        const host = new URL(request.url).hostname;
        const allowedHosts = getAllowedHosts(env);
        if (!isHostAllowed(host, allowedHosts)) {
            return json({ ok: false, error: '허용되지 않은 호스트입니다.' }, 403);
        }

        const user = await getAuthenticatedUser({ request, env });
        if (!user) {
            return json({ ok: false, error: '인증이 필요합니다.' }, 401);
        }

        if (!enforceRateLimit(user.id)) {
            return json({ ok: false, error: '요청이 너무 많습니다. 잠시 후 다시 시도해 주세요.' }, 429);
        }

        const body = await request.json().catch(() => ({}));
        const bookKey = normalizeBookKey(body?.bookKey);
        if (!bookKey) {
            return json({ ok: false, error: 'bookKey가 올바르지 않습니다.' }, 400);
        }

        const rows = getBookRows(bookKey);
        return json({
            ok: true,
            bookKey,
            rows,
        });
    } catch (error) {
        console.error('[api/vocab/book]', error);
        return json({ ok: false, error: '서버 오류가 발생했습니다.' }, 500);
    }
};

