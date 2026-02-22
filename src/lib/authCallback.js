import { supabase } from '/src/lib/supabaseClient.js';

const CALLBACK_CLEANUP_KEYS = [
    'token',
    'token_hash',
    'type',
    'error',
    'error_code',
    'error_description',
    'code',
];

const CALLBACK_HASH_CLEANUP_KEYS = [
    'access_token',
    'refresh_token',
    'expires_in',
    'expires_at',
    'token_type',
    'type',
];

const stripCallbackParamsFromUrl = () => {
    const url = new URL(window.location.href);
    const params = new URLSearchParams(url.search);
    let changed = false;

    CALLBACK_CLEANUP_KEYS.forEach((key) => {
        if (params.has(key)) {
            params.delete(key);
            changed = true;
        }
    });

    const currentHash = url.hash.startsWith('#') ? url.hash.slice(1) : url.hash;
    if (currentHash) {
        const hashParams = new URLSearchParams(currentHash);
        CALLBACK_HASH_CLEANUP_KEYS.forEach((key) => {
            if (hashParams.has(key)) {
                hashParams.delete(key);
                changed = true;
            }
        });
        const nextHash = hashParams.toString();
        url.hash = nextHash ? `#${nextHash}` : '';
    }

    if (!changed) return;

    const nextSearch = params.toString();
    url.search = nextSearch ? `?${nextSearch}` : '';
    window.history.replaceState({}, document.title, `${url.pathname}${url.search}${url.hash}`);
};

const mapCallbackErrorMessage = (error) => {
    const lowered = String(error?.message || '').toLowerCase();
    if (lowered.includes('expired')) return '인증 링크가 만료되었습니다. 다시 가입을 시도해 주세요.';
    if (lowered.includes('invalid')) return '인증 링크가 올바르지 않습니다.';
    return '이메일 인증 처리 중 오류가 발생했습니다. 다시 시도해 주세요.';
};

const hasAuthHashTokens = () => {
    const hash = window.location.hash || '';
    return hash.includes('access_token=') || hash.includes('refresh_token=');
};

const hasTokenHashCallback = () => {
    const params = new URLSearchParams(window.location.search);
    return params.has('token_hash') && params.has('type');
};

export const completeAuthFromUrl = async () => {
    const queryParams = new URLSearchParams(window.location.search);
    const authCode = queryParams.get('code') || '';
    if (authCode) {
        try {
            const { error } = await supabase.auth.exchangeCodeForSession(authCode);
            if (error) {
                stripCallbackParamsFromUrl();
                return {
                    status: 'error',
                    message: mapCallbackErrorMessage(error),
                };
            }

            stripCallbackParamsFromUrl();
            return { status: 'success' };
        } catch (_error) {
            stripCallbackParamsFromUrl();
            return {
                status: 'error',
                message: '이메일 인증 처리 중 오류가 발생했습니다. 다시 시도해 주세요.',
            };
        }
    }

    if (hasTokenHashCallback()) {
        const params = new URLSearchParams(window.location.search);
        const tokenHash = params.get('token_hash') || '';
        const type = params.get('type') || '';

        try {
            const { error } = await supabase.auth.verifyOtp({
                token_hash: tokenHash,
                type,
            });
            if (error) {
                stripCallbackParamsFromUrl();
                return {
                    status: 'error',
                    message: mapCallbackErrorMessage(error),
                };
            }

            stripCallbackParamsFromUrl();
            return { status: 'success' };
        } catch (_error) {
            stripCallbackParamsFromUrl();
            return {
                status: 'error',
                message: '이메일 인증 처리 중 오류가 발생했습니다. 다시 시도해 주세요.',
            };
        }
    }

    if (hasAuthHashTokens()) {
        try {
            // Let supabase-js parse URL hash and persist session first.
            await new Promise((resolve) => window.setTimeout(resolve, 0));
            const { data, error } = await supabase.auth.getSession();
            if (!error && data?.session) {
                stripCallbackParamsFromUrl();
                return { status: 'success' };
            }
        } catch (_error) {
            return {
                status: 'error',
                message: '로그인 세션 처리 중 오류가 발생했습니다. 다시 시도해 주세요.',
            };
        }
    }

    return { status: 'none' };
};
