import { completeAuthFromUrl } from '/src/lib/authCallback.js';

const DEFAULT_REDIRECT_PATH = '/dashboard/';

const sanitizeRedirectPath = (candidate) => {
    if (!candidate) return DEFAULT_REDIRECT_PATH;

    try {
        const targetUrl = new URL(candidate, window.location.origin);
        if (targetUrl.origin !== window.location.origin) {
            return DEFAULT_REDIRECT_PATH;
        }
        const safePath = `${targetUrl.pathname}${targetUrl.search}${targetUrl.hash}`;
        if (!safePath.startsWith('/') || safePath.startsWith('/auth') || safePath.startsWith('/signup')) {
            return DEFAULT_REDIRECT_PATH;
        }
        return safePath;
    } catch (_error) {
        return DEFAULT_REDIRECT_PATH;
    }
};

const getRedirectPath = () => {
    const params = new URLSearchParams(window.location.search);
    return sanitizeRedirectPath(params.get('redirect'));
};

const setNotice = (message, tone = 'info') => {
    const noticeEl = document.getElementById('auth-notice');
    if (!noticeEl) return;

    noticeEl.textContent = message || '';
    noticeEl.classList.remove('auth-notice--error', 'auth-notice--success');
    if (tone === 'error') noticeEl.classList.add('auth-notice--error');
    if (tone === 'success') noticeEl.classList.add('auth-notice--success');
};

const go = (path) => {
    window.location.replace(path);
};

const initAuthCallbackPage = async () => {
    const callbackResult = await completeAuthFromUrl();

    if (callbackResult.status === 'success') {
        setNotice('로그인 성공. 이동합니다...', 'success');
        go(getRedirectPath());
        return;
    }

    if (callbackResult.status === 'error') {
        setNotice(callbackResult.message || '로그인 처리 중 오류가 발생했습니다.', 'error');
        window.setTimeout(() => go('/auth/'), 1200);
        return;
    }

    go('/auth/');
};

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initAuthCallbackPage);
} else {
    initAuthCallbackPage();
}
