const DEFAULT_SUPABASE_URL = 'https://ymzygbjihhttszijdkei.supabase.co';
const DEFAULT_SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_cUXkuDrgyqtyRqh1rmH1HQ_PYwi7nxX';
const DEFAULT_ALLOWED_HOSTS = [
    'voca.plus',
    'www.voca.plus',
    'localhost',
    '127.0.0.1',
    '*.pages.dev',
];
const DEFAULT_MASTER_CODE_HASH = '240be9219065a0b7102d40c8ea174f8772ddb1dd89081a8ab0fc7d6e0850ce73'; // sha256("juntaekko")

const tokenAuthCache = new Map();
const rateByUser = new Map();
const failedByUser = new Map();
const RATE_WINDOW_MS = 60 * 1000;
const RATE_MAX_REQUESTS_PER_WINDOW = 12;
const FAILED_WINDOW_MS = 10 * 60 * 1000;
const FAILED_MAX_ATTEMPTS = 5;

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

const isVerificationLocked = (userId) => {
    const now = Date.now();
    const history = failedByUser.get(userId) || [];
    const recent = history.filter((time) => now - time <= FAILED_WINDOW_MS);
    failedByUser.set(userId, recent);
    return recent.length >= FAILED_MAX_ATTEMPTS;
};

const recordVerificationFailure = (userId) => {
    const now = Date.now();
    const history = failedByUser.get(userId) || [];
    const recent = history.filter((time) => now - time <= FAILED_WINDOW_MS);
    recent.push(now);
    failedByUser.set(userId, recent);
};

const clearVerificationFailures = (userId) => {
    failedByUser.delete(userId);
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

const isUserAlreadyVerified = (user) => {
    const appMetadata = user?.app_metadata || {};
    const userMetadata = user?.user_metadata || {};
    return parseBooleanLike(appMetadata.book_purchase_verified)
        || parseBooleanLike(userMetadata.book_purchase_verified);
};

const toHex = (arrayBuffer) => {
    return [...new Uint8Array(arrayBuffer)]
        .map((byte) => byte.toString(16).padStart(2, '0'))
        .join('');
};

const sha256Hex = async (text) => {
    const data = new TextEncoder().encode(text);
    const digest = await crypto.subtle.digest('SHA-256', data);
    return toHex(digest);
};

const secureEquals = (a, b) => {
    const valueA = String(a || '');
    const valueB = String(b || '');
    if (valueA.length !== valueB.length) return false;
    let diff = 0;
    for (let i = 0; i < valueA.length; i += 1) {
        diff |= valueA.charCodeAt(i) ^ valueB.charCodeAt(i);
    }
    return diff === 0;
};

const resolveMasterCodeHash = async (env) => {
    const hashFromEnv = normalizeSpacingText(env?.BOOK_PURCHASE_MASTER_CODE_HASH).toLowerCase();
    if (/^[0-9a-f]{64}$/.test(hashFromEnv)) {
        return hashFromEnv;
    }

    const plainFromEnv = normalizeSpacingText(env?.BOOK_PURCHASE_MASTER_CODE);
    if (plainFromEnv) {
        return await sha256Hex(plainFromEnv);
    }

    return DEFAULT_MASTER_CODE_HASH;
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

    try {
        const keys = Object.keys(env || {});
        for (const key of keys) {
            if (!/(SUPABASE.*SERVICE.*ROLE|SERVICE_ROLE)/i.test(String(key))) continue;
            const normalized = normalizeSpacingText(env?.[key]);
            if (normalized) return normalized;
        }
    } catch (_) {
        // Ignore and return empty.
    }
    return '';
};

const updateSupabaseUserMetadata = async ({ userId, metadata, env }) => {
    const supabaseUrl = normalizeSpacingText(env?.SUPABASE_URL) || DEFAULT_SUPABASE_URL;
    const serviceRoleKey = getServiceRoleKey(env);
    if (!serviceRoleKey) throw new Error('SERVER_MISSING_SERVICE_ROLE_KEY');

    const response = await fetch(`${supabaseUrl}/auth/v1/admin/users/${encodeURIComponent(userId)}`, {
        method: 'PUT',
        headers: {
            'content-type': 'application/json',
            apikey: serviceRoleKey,
            authorization: `Bearer ${serviceRoleKey}`,
        },
        body: JSON.stringify({
            user_metadata: metadata || {},
        }),
    });

    if (response.ok) return;
    if (response.status === 401 || response.status === 403) {
        throw new Error('SERVER_INVALID_SERVICE_ROLE_KEY');
    }

    const payload = await response.json().catch(() => null);
    const message = normalizeSpacingText(
        payload?.msg || payload?.error_description || payload?.error || payload?.message,
    );
    throw new Error(message || '사용자 메타데이터 업데이트에 실패했습니다.');
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
        if (isVerificationLocked(user.id)) {
            return json({ ok: false, error: '인증 시도 횟수가 많아 잠시 후 다시 시도해 주세요.' }, 429);
        }

        if (isUserAlreadyVerified(user)) {
            return json({ ok: true, verified: true, alreadyVerified: true });
        }

        const body = await request.json().catch(() => ({}));
        const code = normalizeSpacingText(body?.masterCode || body?.code);
        if (!code || code.length > 120) {
            return json({ ok: false, error: '인증 코드를 확인해 주세요.' }, 400);
        }

        const submittedHash = await sha256Hex(code);
        const expectedHash = await resolveMasterCodeHash(env);

        if (!secureEquals(submittedHash, expectedHash)) {
            recordVerificationFailure(user.id);
            return json({ ok: false, error: '인증 코드가 올바르지 않습니다.' }, 403);
        }

        clearVerificationFailures(user.id);

        const nextMetadata = {
            ...(user.user_metadata || {}),
            book_purchase_verified: true,
            book_purchase_verified_at: new Date().toISOString(),
            book_purchase_verified_method: 'master_code',
        };
        await updateSupabaseUserMetadata({
            userId: user.id,
            metadata: nextMetadata,
            env,
        });

        return json({
            ok: true,
            verified: true,
            alreadyVerified: false,
            message: '책구매 인증이 완료되었습니다.',
        });
    } catch (error) {
        const message = normalizeSpacingText(error?.message);
        if (message === 'SERVER_MISSING_SERVICE_ROLE_KEY') {
            return json({
                ok: false,
                error: '인증 서버 키가 없습니다. Cloudflare Secrets에 SUPABASE_SERVICE_ROLE_KEY(또는 SUPABASE_SERVICE_ROLE)를 등록해 주세요.',
            }, 500);
        }
        if (message === 'SERVER_INVALID_SERVICE_ROLE_KEY') {
            return json({
                ok: false,
                error: '인증 서버 키가 유효하지 않습니다. Cloudflare Secrets의 SUPABASE_SERVICE_ROLE_KEY 값을 확인해 주세요.',
            }, 500);
        }
        console.error('[api/account/book-verify]', error);
        return json({ ok: false, error: message || '책구매 인증 처리 중 오류가 발생했습니다.' }, 500);
    }
};
