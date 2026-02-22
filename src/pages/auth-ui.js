import React from 'https://esm.sh/react@18';
import { createRoot } from 'https://esm.sh/react-dom@18/client';
import { Auth } from 'https://esm.sh/@supabase/auth-ui-react';
import { ThemeSupa } from 'https://esm.sh/@supabase/auth-ui-shared';
import { supabase } from '/src/lib/supabaseClient.js';
import { completeAuthFromUrl } from '/src/lib/authCallback.js';

const DEFAULT_REDIRECT_PATH = '/dashboard/';
const AUTH_ALERT_COOLDOWN_MS = 4000;
const GOOGLE_GIS_CLIENT_ID = '1041300302202-ua00qcidtg5melhsqs8cl1u96gm3eqmh.apps.googleusercontent.com';
const GOOGLE_GIS_SCRIPT_ID = 'google-gsi-client';
const AUTH_UI_KO = {
    variables: {
        sign_in: {
            email_label: '이메일',
            password_label: '비밀번호',
            email_input_placeholder: 'you@example.com',
            password_input_placeholder: '비밀번호',
            button_label: '이메일로 계속',
            loading_button_label: '로그인 중...',
            social_provider_text: '{{provider}}로 로그인',
            link_text: '이미 계정이 있으신가요? 로그인',
        },
        sign_up: {
            email_label: '이메일',
            password_label: '비밀번호',
            email_input_placeholder: 'you@example.com',
            password_input_placeholder: '비밀번호(6자 이상)',
            button_label: '회원가입',
            loading_button_label: '가입 처리 중...',
            social_provider_text: '{{provider}}로 가입',
            link_text: '계정이 없으신가요? 회원가입',
            confirmation_text: '메일함에서 인증 링크를 확인해 주세요.',
        },
        forgotten_password: {
            email_label: '이메일',
            password_label: '새 비밀번호',
            email_input_placeholder: 'you@example.com',
            button_label: '재설정 메일 보내기',
            loading_button_label: '발송 중...',
            link_text: '비밀번호를 잊으셨나요?',
            confirmation_text: '비밀번호 재설정 메일을 확인해 주세요.',
        },
        update_password: {
            password_label: '새 비밀번호',
            password_input_placeholder: '새 비밀번호',
            button_label: '비밀번호 변경',
            loading_button_label: '변경 중...',
            confirmation_text: '비밀번호가 변경되었습니다.',
        },
    },
};

const sanitizeRedirectPath = (candidate) => {
    if (!candidate) return DEFAULT_REDIRECT_PATH;

    try {
        const targetUrl = new URL(candidate, window.location.origin);
        if (targetUrl.origin !== window.location.origin) {
            return DEFAULT_REDIRECT_PATH;
        }
        const safePath = `${targetUrl.pathname}${targetUrl.search}${targetUrl.hash}`;
        if (!safePath.startsWith('/') || safePath.startsWith('/auth')) {
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

const getSignupPath = () => {
    const redirectPath = getRedirectPath();
    const params = new URLSearchParams();
    if (redirectPath && redirectPath !== DEFAULT_REDIRECT_PATH) {
        params.set('redirect', redirectPath);
    }
    const query = params.toString();
    return query ? `/signup/?${query}` : '/signup/';
};

const getOAuthRedirectTo = () => {
    const redirectPath = getRedirectPath();
    const params = new URLSearchParams();
    if (redirectPath && redirectPath !== DEFAULT_REDIRECT_PATH) {
        params.set('redirect', redirectPath);
    }
    const query = params.toString();
    const callbackPath = query ? `/auth/?${query}` : '/auth/';
    return new URL(callbackPath, window.location.origin).toString();
};

const setNotice = (message, tone = 'info') => {
    const noticeEl = document.getElementById('auth-notice');
    if (!noticeEl) return;

    noticeEl.textContent = message || '';
    noticeEl.classList.remove('hidden', 'auth-notice--error', 'auth-notice--success');
    if (!message) {
        noticeEl.classList.add('hidden');
        return;
    }
    if (tone === 'error') noticeEl.classList.add('auth-notice--error');
    if (tone === 'success') noticeEl.classList.add('auth-notice--success');
};

const translateAuthError = (rawMessage) => {
    const message = (rawMessage || '').trim();
    if (!message) return '';

    const lowered = message.toLowerCase();
    if (lowered.includes('invalid login credentials')) {
        return '이메일 또는 비밀번호가 올바르지 않습니다.';
    }
    if (lowered.includes('email not confirmed')) {
        return '이메일 인증 후 로그인해 주세요.';
    }
    if (lowered.includes('too many requests') || lowered.includes('over_email_send_rate_limit')) {
        return '요청이 너무 많습니다. 잠시 후 다시 시도해 주세요.';
    }
    if (lowered.includes('failed to fetch') || lowered.includes('network')) {
        return '네트워크 오류가 발생했습니다. 연결 상태를 확인해 주세요.';
    }
    return message;
};

const isLikelyErrorMessage = (node, text) => {
    const cls = typeof node?.className === 'string' ? node.className.toLowerCase() : '';
    const lowered = (text || '').toLowerCase();
    if (cls.includes('danger') || cls.includes('error')) return true;
    return (
        lowered.includes('invalid') ||
        lowered.includes('error') ||
        lowered.includes('failed') ||
        lowered.includes('not confirmed') ||
        lowered.includes('too many requests') ||
        lowered.includes('올바르지') ||
        lowered.includes('실패')
    );
};

const createAuthUiErrorNotifier = () => {
    let lastAlertedMessage = '';
    let lastAlertedAt = 0;

    return (rawMessage) => {
        const message = translateAuthError(rawMessage);
        if (!message) return;

        setNotice(message, 'error');
        const now = Date.now();
        if (message === lastAlertedMessage && now - lastAlertedAt < AUTH_ALERT_COOLDOWN_MS) {
            return;
        }
        lastAlertedMessage = message;
        lastAlertedAt = now;
    };
};

const setupPasswordCapsLockHint = (rootEl) => {
    if (!rootEl) return;
    const passwordInput = rootEl.querySelector('input[type="password"], input[name="password"]');
    if (!(passwordInput instanceof HTMLInputElement)) return;
    if (passwordInput.dataset.capsHintBound === 'true') return;

    passwordInput.dataset.capsHintBound = 'true';

    const host = passwordInput.parentElement instanceof HTMLElement ? passwordInput.parentElement : passwordInput;
    let hint = host.parentElement?.querySelector('.auth-caps-lock-hint');
    if (!(hint instanceof HTMLElement)) {
        hint = document.createElement('div');
        hint.className = 'auth-caps-lock-hint';
        hint.setAttribute('aria-live', 'polite');
        host.insertAdjacentElement('afterend', hint);
    }

    const setHintVisible = (isVisible) => {
        if (!(hint instanceof HTMLElement)) return;
        hint.textContent = isVisible ? 'Caps Lock이 켜져 있습니다.' : '';
        hint.classList.toggle('is-visible', isVisible);
    };

    const updateCapsState = (event) => {
        const isOn = Boolean(event?.getModifierState?.('CapsLock'));
        setHintVisible(isOn);
    };

    passwordInput.addEventListener('keydown', updateCapsState);
    passwordInput.addEventListener('keyup', updateCapsState);
    passwordInput.addEventListener('focus', updateCapsState);
    passwordInput.addEventListener('blur', () => {
        setHintVisible(false);
    });
};

const watchAuthUiErrors = (rootEl) => {
    if (!rootEl) return;
    const notifyError = createAuthUiErrorNotifier();

    const scanForErrorMessages = () => {
        setupPasswordCapsLockHint(rootEl);

        const messageNodes = rootEl.querySelectorAll('[class*="supabase-auth-ui_ui-message"]');
        messageNodes.forEach((node) => {
            const text = (node.textContent || '').trim();
            if (!text) return;
            if (!isLikelyErrorMessage(node, text)) return;
            notifyError(text);
        });
    };

    scanForErrorMessages();
    const observer = new MutationObserver(scanForErrorMessages);
    observer.observe(rootEl, {
        childList: true,
        subtree: true,
    });
};

const loadGoogleGisScript = async () => {
    if (window.google?.accounts?.id) return true;

    const existingScript = document.getElementById(GOOGLE_GIS_SCRIPT_ID);
    if (existingScript instanceof HTMLScriptElement) {
        await new Promise((resolve) => {
            if (window.google?.accounts?.id) {
                resolve();
                return;
            }
            existingScript.addEventListener('load', () => resolve(), { once: true });
            existingScript.addEventListener('error', () => resolve(), { once: true });
        });
        return Boolean(window.google?.accounts?.id);
    }

    const script = document.createElement('script');
    script.id = GOOGLE_GIS_SCRIPT_ID;
    script.src = 'https://accounts.google.com/gsi/client';
    script.async = true;
    script.defer = true;
    const loaded = new Promise((resolve) => {
        script.addEventListener('load', () => resolve(true), { once: true });
        script.addEventListener('error', () => resolve(false), { once: true });
    });
    document.head.appendChild(script);
    const result = await loaded;
    return Boolean(result && window.google?.accounts?.id);
};

const setupGoogleGisButton = async (rootEl, onClickGoogle) => {
    if (!rootEl) return;
    const wrap = rootEl.querySelector('.auth-google-gis-wrap');
    const slot = rootEl.querySelector('#auth-google-gis-slot');
    const overlay = rootEl.querySelector('#auth-google-gis-overlay');
    const fallback = rootEl.querySelector('#auth-google-fallback-btn');

    if (!(wrap instanceof HTMLElement) || !(slot instanceof HTMLElement)) return;
    if (!(fallback instanceof HTMLButtonElement)) return;
    if (!(overlay instanceof HTMLButtonElement)) return;

    fallback.hidden = false;
    wrap.classList.remove('is-ready');

    const hasGoogle = await loadGoogleGisScript();
    if (!hasGoogle || !GOOGLE_GIS_CLIENT_ID) return;

    try {
        const slotWidth = Math.max(220, Math.min(380, Math.floor(wrap.getBoundingClientRect().width || 360)));
        window.google.accounts.id.initialize({
            client_id: GOOGLE_GIS_CLIENT_ID,
            callback: () => {},
        });
        slot.innerHTML = '';
        window.google.accounts.id.renderButton(slot, {
            theme: 'outline',
            size: 'large',
            text: 'continue_with',
            shape: 'pill',
            logo_alignment: 'left',
            locale: 'ko',
            width: slotWidth,
        });
        wrap.classList.add('is-ready');
        fallback.hidden = true;
    } catch (_error) {
        wrap.classList.remove('is-ready');
        fallback.hidden = false;
    }

    if (overlay.dataset.bound !== 'true') {
        overlay.dataset.bound = 'true';
        overlay.addEventListener('click', () => {
            void onClickGoogle();
        });
    }
};

const redirectToTarget = () => {
    window.location.href = getRedirectPath();
};

const mountAuthUI = () => {
    const rootEl = document.getElementById('supabase-auth-root');
    if (!rootEl) return;

    const setSocialLoadingState = (provider = '') => {
        const buttons = rootEl.querySelectorAll('.auth-social-btn, .auth-google-gis-overlay');
        buttons.forEach((button) => {
            if (!(button instanceof HTMLButtonElement)) return;
            const targetProvider = button.dataset.provider || '';
            const isLoading = Boolean(provider) && targetProvider === provider;
            button.disabled = Boolean(provider);
            button.classList.toggle('is-loading', isLoading);
        });

        const googleWrap = rootEl.querySelector('.auth-google-gis-wrap');
        if (googleWrap instanceof HTMLElement) {
            const isGoogleLoading = provider === 'google';
            googleWrap.classList.toggle('is-loading', isGoogleLoading);
        }
    };

    const signInWithProvider = async (provider) => {
        setSocialLoadingState(provider);
        try {
            const { error } = await supabase.auth.signInWithOAuth({
                provider,
                options: {
                    redirectTo: getOAuthRedirectTo(),
                },
            });
            if (error) {
                setSocialLoadingState();
                setNotice(translateAuthError(error.message), 'error');
            }
        } catch (_error) {
            setSocialLoadingState();
            setNotice('소셜 로그인 중 오류가 발생했습니다. 다시 시도해 주세요.', 'error');
        }
    };

    const googleIcon = React.createElement(
        'svg',
        { width: 18, height: 18, viewBox: '0 0 24 24', 'aria-hidden': 'true' },
        React.createElement('path', { fill: '#EA4335', d: 'M12 10.2v3.9h5.5c-.2 1.3-1.5 3.9-5.5 3.9-3.3 0-6-2.7-6-6s2.7-6 6-6c1.9 0 3.2.8 3.9 1.5l2.7-2.6C16.8 3.2 14.6 2.2 12 2.2c-5.4 0-9.8 4.4-9.8 9.8s4.4 9.8 9.8 9.8c5.6 0 9.3-3.9 9.3-9.4 0-.6-.1-1.1-.2-1.6H12z' }),
        React.createElement('path', { fill: '#FBBC05', d: 'M3.3 7.5l3.2 2.3C7.3 8 9.5 6.5 12 6.5c1.9 0 3.2.8 3.9 1.5l2.7-2.6C16.8 3.2 14.6 2.2 12 2.2 8.2 2.2 4.9 4.3 3.3 7.5z' }),
        React.createElement('path', { fill: '#34A853', d: 'M12 21.8c2.6 0 4.8-.9 6.4-2.5l-3-2.4c-.8.6-1.9 1-3.4 1-2.5 0-4.7-1.7-5.4-4l-3.3 2.5c1.6 3.3 4.9 5.4 8.7 5.4z' }),
        React.createElement('path', { fill: '#4285F4', d: 'M3.3 16.4l3.3-2.5c-.2-.6-.3-1.2-.3-1.9s.1-1.3.3-1.9L3.3 7.5C2.6 8.9 2.2 10.4 2.2 12s.4 3.1 1.1 4.4z' }),
    );

    const kakaoIcon = React.createElement(
        'svg',
        { width: 18, height: 18, viewBox: '0 0 24 24', 'aria-hidden': 'true' },
        React.createElement('path', { fill: '#111827', d: 'M12 3.2c-5.2 0-9.4 3.3-9.4 7.4 0 2.7 1.8 5.1 4.5 6.4l-1.1 3.8c-.1.3.2.5.5.3l4.4-2.9c.4 0 .7.1 1.1.1 5.2 0 9.4-3.3 9.4-7.4S17.2 3.2 12 3.2z' }),
    );

    const root = createRoot(rootEl);
    root.render(
        React.createElement(
            React.Fragment,
            null,
            React.createElement(
                'div',
                { className: 'auth-social-stack' },
                React.createElement(
                    'div',
                    { className: 'auth-google-gis-wrap' },
                    React.createElement('div', { id: 'auth-google-gis-slot', className: 'auth-google-gis-slot', 'aria-hidden': 'true' }),
                    React.createElement(
                        'button',
                        {
                            id: 'auth-google-gis-overlay',
                            type: 'button',
                            className: 'auth-google-gis-overlay',
                            'data-provider': 'google',
                            'aria-label': 'Google 계정으로 계속',
                        },
                    ),
                ),
                React.createElement(
                    'button',
                    {
                        id: 'auth-google-fallback-btn',
                        type: 'button',
                        className: 'auth-social-btn auth-social-btn--google auth-social-btn--google-fallback',
                        'data-provider': 'google',
                        onClick: () => { void signInWithProvider('google'); },
                    },
                    React.createElement('span', { className: 'auth-social-icon' }, googleIcon),
                    React.createElement('span', { className: 'auth-social-label' }, 'Google 계정으로 계속'),
                ),
                React.createElement(
                    'button',
                    {
                        type: 'button',
                        className: 'auth-social-btn auth-social-btn--kakao',
                        'data-provider': 'kakao',
                        onClick: () => { void signInWithProvider('kakao'); },
                    },
                    React.createElement('span', { className: 'auth-social-icon' }, kakaoIcon),
                    React.createElement('span', { className: 'auth-social-label' }, '카카오 로그인'),
                ),
            ),
            React.createElement(
                'div',
                { className: 'auth-social-divider' },
                React.createElement('span', null, '또는 이메일로 계속'),
            ),
            React.createElement(Auth, {
                supabaseClient: supabase,
                appearance: { theme: ThemeSupa },
                view: 'sign_in',
                showLinks: true,
                providers: [],
                onlyThirdPartyProviders: false,
                redirectTo: getOAuthRedirectTo(),
                localization: AUTH_UI_KO,
            }),
        ),
    );

    void setupGoogleGisButton(rootEl, () => signInWithProvider('google'));
    watchAuthUiErrors(rootEl);

    rootEl.addEventListener('click', (event) => {
        const target = event.target;
        if (!(target instanceof HTMLElement)) return;
        const anchor = target.closest('a');
        if (!anchor) return;
        const text = (anchor.textContent || '').trim();
        if (!text.includes('회원가입')) return;

        event.preventDefault();
        window.location.href = getSignupPath();
    });
};

const initAuthPage = async () => {
    const callbackResult = await completeAuthFromUrl();
    if (callbackResult.status === 'success') {
        setNotice('이메일 인증이 완료되었습니다. 이동합니다...', 'success');
        redirectToTarget();
        return;
    }
    if (callbackResult.status === 'error' && callbackResult.message) {
        setNotice(callbackResult.message, 'error');
    }

    const hasRedirect = window.location.search.includes('redirect=');
    if (hasRedirect) {
        setNotice('보호된 페이지입니다. 먼저 로그인하세요.');
    }

    try {
        const { data, error } = await supabase.auth.getSession();
        if (error) {
            setNotice('세션 확인에 실패했습니다. 다시 시도해 주세요.', 'error');
        }
        if (data?.session) {
            redirectToTarget();
            return;
        }
    } catch (_error) {
        setNotice('인증 초기화에 실패했습니다. 잠시 후 다시 시도해 주세요.', 'error');
    }

    mountAuthUI();

    supabase.auth.onAuthStateChange((event, session) => {
        if (event === 'SIGNED_IN' && session) {
            setNotice('로그인 성공. 이동합니다...', 'success');
            redirectToTarget();
        }
    });
};

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initAuthPage);
} else {
    initAuthPage();
}
