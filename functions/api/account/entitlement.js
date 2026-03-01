const DEFAULT_SUPABASE_URL = 'https://ymzygbjihhttszijdkei.supabase.co';
const DEFAULT_SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_cUXkuDrgyqtyRqh1rmH1HQ_PYwi7nxX';
const DEFAULT_ALLOWED_HOSTS = [
    'voca.plus',
    'www.voca.plus',
    'localhost',
    '127.0.0.1',
    '*.pages.dev',
];

const rateByUser = new Map();
const RATE_WINDOW_MS = 60 * 1000;
const RATE_MAX_REQUESTS_PER_WINDOW = 30;
const UNVERIFIED_DAILY_DOWNLOAD_LIMIT = 1;
const PURCHASE_VERIFIED_KEYS = [
    'book_purchase_verified',
    'bookPurchaseVerified',
    'purchase_verified',
    'purchaseVerified',
    'is_book_purchase_verified',
    'isBookPurchaseVerified',
];

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
    return fetchSupabaseUserByToken({ token, env });
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

    for (const key of PURCHASE_VERIFIED_KEYS) {
        if (Object.prototype.hasOwnProperty.call(appMetadata, key)) {
            return parseBooleanLike(appMetadata[key]);
        }
    }
    for (const key of PURCHASE_VERIFIED_KEYS) {
        if (Object.prototype.hasOwnProperty.call(userMetadata, key)) {
            return parseBooleanLike(userMetadata[key]);
        }
    }
    return false;
};

const getTodayDateKeyKst = () => {
    const formatter = new Intl.DateTimeFormat('en-CA', {
        timeZone: 'Asia/Seoul',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
    });
    const parts = formatter.formatToParts(new Date());
    const year = parts.find((part) => part.type === 'year')?.value || '0000';
    const month = parts.find((part) => part.type === 'month')?.value || '01';
    const day = parts.find((part) => part.type === 'day')?.value || '01';
    return `${year}-${month}-${day}`;
};

const getDailyDownloadCount = (metadata, dateKey) => {
    const savedDate = normalizeSpacingText(metadata?.generator_daily_download_date);
    if (!savedDate || savedDate !== dateKey) return 0;
    const count = Number.parseInt(metadata?.generator_daily_download_count, 10);
    if (!Number.isInteger(count) || count < 0) return 0;
    return count;
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

        const body = await request.json().catch(() => ({}));
        const action = normalizeSpacingText(body?.action || 'status').toLowerCase();

        const isBookPurchaseVerified = getPurchaseVerifiedFromUser(user);
        const userMetadata = user.user_metadata || {};
        const dateKey = getTodayDateKeyKst();
        const dailyDownloadUsed = isBookPurchaseVerified ? 0 : getDailyDownloadCount(userMetadata, dateKey);
        const canDownload = isBookPurchaseVerified || dailyDownloadUsed < UNVERIFIED_DAILY_DOWNLOAD_LIMIT;

        if (action === 'status') {
            return json({
                ok: true,
                userId: normalizeSpacingText(user.id),
                isBookPurchaseVerified,
                dailyDownloadLimit: isBookPurchaseVerified ? null : UNVERIFIED_DAILY_DOWNLOAD_LIMIT,
                dailyDownloadUsed,
                canDownload,
            });
        }

        if (action === 'consume_generator_download') {
            if (isBookPurchaseVerified) {
                return json({
                    ok: true,
                    userId: normalizeSpacingText(user.id),
                    isBookPurchaseVerified: true,
                    dailyDownloadLimit: null,
                    dailyDownloadUsed: 0,
                    canDownload: true,
                    consumed: false,
                });
            }

            if (!canDownload) {
                return json({
                    ok: true,
                    userId: normalizeSpacingText(user.id),
                    isBookPurchaseVerified: false,
                    dailyDownloadLimit: UNVERIFIED_DAILY_DOWNLOAD_LIMIT,
                    dailyDownloadUsed,
                    canDownload: false,
                    consumed: false,
                    reason: 'daily_limit_reached',
                });
            }

            const nextUsed = dailyDownloadUsed + 1;
            const nextMetadata = {
                ...userMetadata,
                generator_daily_download_date: dateKey,
                generator_daily_download_count: nextUsed,
            };
            await updateSupabaseUserMetadata({
                userId: user.id,
                metadata: nextMetadata,
                env,
            });

            return json({
                ok: true,
                userId: normalizeSpacingText(user.id),
                isBookPurchaseVerified: false,
                dailyDownloadLimit: UNVERIFIED_DAILY_DOWNLOAD_LIMIT,
                dailyDownloadUsed: nextUsed,
                canDownload: nextUsed < UNVERIFIED_DAILY_DOWNLOAD_LIMIT,
                consumed: true,
            });
        }

        return json({ ok: false, error: '지원되지 않는 action입니다.' }, 400);
    } catch (error) {
        const message = normalizeSpacingText(error?.message);
        if (message === 'SERVER_MISSING_SERVICE_ROLE_KEY') {
            return json({
                ok: false,
                error: '엔타이틀먼트 서버 키가 없습니다. Cloudflare Secrets에 SUPABASE_SERVICE_ROLE_KEY(또는 SUPABASE_SERVICE_ROLE)를 등록해 주세요.',
            }, 500);
        }
        if (message === 'SERVER_INVALID_SERVICE_ROLE_KEY') {
            return json({
                ok: false,
                error: '엔타이틀먼트 서버 키가 유효하지 않습니다. Cloudflare Secrets의 SUPABASE_SERVICE_ROLE_KEY 값을 확인해 주세요.',
            }, 500);
        }
        console.error('[api/account/entitlement]', error);
        return json({ ok: false, error: message || '권한 확인 중 오류가 발생했습니다.' }, 500);
    }
};
