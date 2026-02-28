const DEFAULT_SUPABASE_URL = 'https://ymzygbjihhttszijdkei.supabase.co';
const DEFAULT_SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_cUXkuDrgyqtyRqh1rmH1HQ_PYwi7nxX';
const DEFAULT_ALLOWED_HOSTS = [
    'voca.plus',
    'www.voca.plus',
    'localhost',
    '127.0.0.1',
    '*.pages.dev',
];

const tokenAuthCache = new Map();
const rateByUser = new Map();
const RATE_WINDOW_MS = 60 * 1000;
const RATE_MAX_REQUESTS_PER_WINDOW = 8;

const normalizeSpacingText = (value) => {
    if (value === null || value === undefined) return '';
    return String(value)
        .replace(/\uFEFF/g, '')
        .normalize('NFKC')
        .replace(/[\u0000-\u001F\u007F]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
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

const getServiceRoleKey = (env) => {
    const candidates = [
        env?.SUPABASE_SERVICE_ROLE_KEY,
        env?.SUPABASE_SERVICE_ROLE,
        env?.SUPABASE_SERVICE_KEY,
        env?.SERVICE_ROLE_KEY,
    ];
    for (const raw of candidates) {
        const normalized = normalizeSpacingText(raw);
        if (normalized) return normalized;
    }
    return '';
};

const deleteSupabaseUser = async ({ userId, env }) => {
    const supabaseUrl = normalizeSpacingText(env?.SUPABASE_URL) || DEFAULT_SUPABASE_URL;
    const serviceRoleKey = getServiceRoleKey(env);
    if (!serviceRoleKey) {
        throw new Error('SERVER_MISSING_SERVICE_ROLE_KEY');
    }

    const response = await fetch(`${supabaseUrl}/auth/v1/admin/users/${encodeURIComponent(userId)}`, {
        method: 'DELETE',
        headers: {
            apikey: serviceRoleKey,
            authorization: `Bearer ${serviceRoleKey}`,
        },
    });

    if (response.ok || response.status === 404) return;

    if (response.status === 401 || response.status === 403) {
        throw new Error('SERVER_INVALID_SERVICE_ROLE_KEY');
    }
    if (response.status === 429) {
        throw new Error('요청이 너무 많습니다. 잠시 후 다시 시도해 주세요.');
    }

    const payload = await response.json().catch(() => null);
    const upstreamMessage = normalizeSpacingText(
        payload?.msg || payload?.error_description || payload?.error || payload?.message,
    );
    throw new Error(upstreamMessage || '회원 탈퇴 처리 중 오류가 발생했습니다.');
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

        await deleteSupabaseUser({ userId: user.id, env });
        return json({ ok: true });
    } catch (error) {
        const message = normalizeSpacingText(error?.message);
        if (message === 'SERVER_MISSING_SERVICE_ROLE_KEY') {
            return json({
                ok: false,
                error: '회원탈퇴 서버 키가 없습니다. Cloudflare Secrets에 SUPABASE_SERVICE_ROLE_KEY(또는 SUPABASE_SERVICE_ROLE)를 등록해 주세요.',
            }, 500);
        }
        if (message === 'SERVER_INVALID_SERVICE_ROLE_KEY') {
            return json({
                ok: false,
                error: '회원탈퇴 서버 키가 유효하지 않습니다. Cloudflare Secrets의 SUPABASE_SERVICE_ROLE_KEY 값을 확인해 주세요.',
            }, 500);
        }
        console.error('[api/account/delete]', error);
        return json({ ok: false, error: message || '회원 탈퇴 처리 중 오류가 발생했습니다.' }, 500);
    }
};
