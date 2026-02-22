import React from 'https://esm.sh/react@18';
import { createRoot } from 'https://esm.sh/react-dom@18/client';
import { Auth } from 'https://esm.sh/@supabase/auth-ui-react';
import { ThemeSupa } from 'https://esm.sh/@supabase/auth-ui-shared';
import { supabase } from '/src/lib/supabaseClient.js';
import { completeAuthFromUrl } from '/src/lib/authCallback.js';

const DEFAULT_REDIRECT_PATH = '/dashboard/';
const AUTH_ALERT_COOLDOWN_MS = 4000;
const INLINE_ERROR_ID = 'auth-inline-error';
const EMAIL_SUBMIT_DEFAULT_LABEL = '이메일로 계속';
const EMAIL_SUBMIT_LOADING_LABEL = '로그인 중...';
const AUTH_UI_KO = {
    variables: {
        sign_in: {
            email_label: '이메일',
            password_label: '비밀번호',
            email_input_placeholder: 'you@example.com',
            password_input_placeholder: '비밀번호',
            button_label: EMAIL_SUBMIT_DEFAULT_LABEL,
            loading_button_label: EMAIL_SUBMIT_LOADING_LABEL,
            social_provider_text: '{{provider}}로 로그인',
            link_text: '계정이 없으신가요? 회원가입',
        },
        sign_up: {
            email_label: '이메일',
            password_label: '비밀번호',
            email_input_placeholder: 'you@example.com',
            password_input_placeholder: '비밀번호(6자 이상)',
            button_label: '회원가입',
            loading_button_label: '가입 처리 중...',
            social_provider_text: '{{provider}}로 가입',
            link_text: '이미 계정이 있으신가요? 로그인',
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

const setInlineError = (message = '') => {
    const slot = document.getElementById(INLINE_ERROR_ID);
    if (!slot) return;
    const text = String(message || '').trim();
    slot.textContent = text;
    slot.classList.toggle('is-visible', Boolean(text));
};

const markAuthInputsInvalid = (rootEl, isInvalid) => {
    if (!rootEl) return;
    const targets = rootEl.querySelectorAll('input[type="email"], input[type="password"], input[name="password"]');
    targets.forEach((inputEl) => {
        if (!(inputEl instanceof HTMLInputElement)) return;
        inputEl.setAttribute('aria-invalid', isInvalid ? 'true' : 'false');
        inputEl.setAttribute('aria-describedby', INLINE_ERROR_ID);
    });
};

const focusFirstInvalidInput = (rootEl) => {
    if (!rootEl) return;
    const firstInvalid = rootEl.querySelector('input[aria-invalid="true"]');
    if (firstInvalid instanceof HTMLInputElement) {
        firstInvalid.focus();
    }
};

const setEmailSubmitState = (rootEl, isLoading) => {
    if (!rootEl) return;
    const form = rootEl.querySelector('form');
    if (!(form instanceof HTMLFormElement)) return;
    const submitBtn = form.querySelector('button[type="submit"]');
    if (!(submitBtn instanceof HTMLButtonElement)) return;

    const defaultLabel = submitBtn.dataset.defaultLabel || EMAIL_SUBMIT_DEFAULT_LABEL;
    submitBtn.dataset.defaultLabel = defaultLabel;
    submitBtn.disabled = isLoading;
    submitBtn.textContent = isLoading ? EMAIL_SUBMIT_LOADING_LABEL : defaultLabel;
};

const clearAuthValidationState = (rootEl) => {
    markAuthInputsInvalid(rootEl, false);
    setInlineError('');
};

const enhanceAuthForm = (rootEl) => {
    if (!rootEl) return;
    const form = rootEl.querySelector('form');
    if (!(form instanceof HTMLFormElement)) return;

    const emailInput = form.querySelector('input[type="email"], input[name="email"]');
    if (emailInput instanceof HTMLInputElement) {
        emailInput.setAttribute('name', 'email');
        emailInput.setAttribute('autocomplete', 'email');
        emailInput.setAttribute('inputmode', 'email');
        emailInput.setAttribute('spellcheck', 'false');
        emailInput.setAttribute('autocapitalize', 'none');

        if (emailInput.dataset.authInputBound !== 'true') {
            emailInput.dataset.authInputBound = 'true';
            emailInput.addEventListener('input', () => {
                clearAuthValidationState(rootEl);
                setEmailSubmitState(rootEl, false);
            });
        }
    }

    const passwordInput = form.querySelector('input[name="password"], input[type="password"], input[autocomplete="current-password"]');
    if (passwordInput instanceof HTMLInputElement) {
        passwordInput.setAttribute('name', 'password');
        passwordInput.setAttribute('autocomplete', 'current-password');

        if (passwordInput.dataset.authInputBound !== 'true') {
            passwordInput.dataset.authInputBound = 'true';
            passwordInput.addEventListener('input', () => {
                clearAuthValidationState(rootEl);
                setEmailSubmitState(rootEl, false);
            });
        }

        const inputHost = passwordInput.parentElement;
        if (inputHost instanceof HTMLElement) {
            inputHost.classList.add('auth-password-host');

            if (!inputHost.querySelector('.auth-password-toggle')) {
                const toggleBtn = document.createElement('button');
                toggleBtn.type = 'button';
                toggleBtn.className = 'auth-password-toggle';
                toggleBtn.setAttribute('aria-label', '비밀번호 표시');
                toggleBtn.textContent = '표시';
                toggleBtn.addEventListener('click', () => {
                    const nextType = passwordInput.type === 'password' ? 'text' : 'password';
                    passwordInput.type = nextType;
                    const isVisible = nextType === 'text';
                    toggleBtn.setAttribute('aria-label', isVisible ? '비밀번호 숨기기' : '비밀번호 표시');
                    toggleBtn.textContent = isVisible ? '숨기기' : '표시';
                });
                inputHost.appendChild(toggleBtn);
            }

            let capsHint = inputHost.parentElement?.querySelector('.auth-caps-hint');
            if (!(capsHint instanceof HTMLElement)) {
                capsHint = document.createElement('div');
                capsHint.className = 'auth-caps-hint';
                capsHint.setAttribute('aria-live', 'polite');
                inputHost.insertAdjacentElement('afterend', capsHint);
            }

            const updateCaps = (event) => {
                if (!(capsHint instanceof HTMLElement)) return;
                const isOn = Boolean(event?.getModifierState?.('CapsLock'));
                capsHint.textContent = isOn ? 'Caps Lock이 켜져 있습니다.' : '';
                capsHint.classList.toggle('is-visible', isOn);
            };
            if (passwordInput.dataset.authCapsBound !== 'true') {
                passwordInput.dataset.authCapsBound = 'true';
                passwordInput.addEventListener('keydown', updateCaps);
                passwordInput.addEventListener('keyup', updateCaps);
                passwordInput.addEventListener('focus', updateCaps);
                passwordInput.addEventListener('blur', () => {
                    if (!(capsHint instanceof HTMLElement)) return;
                    capsHint.textContent = '';
                    capsHint.classList.remove('is-visible');
                });
            }
        }
    }

    const submitBtn = form.querySelector('button[type="submit"]');
    if (submitBtn instanceof HTMLButtonElement) {
        if (!submitBtn.dataset.defaultLabel) {
            submitBtn.dataset.defaultLabel = EMAIL_SUBMIT_DEFAULT_LABEL;
        }
        if (!submitBtn.disabled) {
            submitBtn.textContent = submitBtn.dataset.defaultLabel;
        }
    }

    if (form.dataset.authSubmitBound !== 'true') {
        form.dataset.authSubmitBound = 'true';
        form.addEventListener('submit', () => {
            setEmailSubmitState(rootEl, true);
        });
    }

    const anchors = [...form.querySelectorAll('a')];
    const forgotLink = anchors.find((anchor) => (anchor.textContent || '').includes('비밀번호'));
    if (forgotLink instanceof HTMLAnchorElement && passwordInput instanceof HTMLInputElement) {
        let linkWrap = form.querySelector('.auth-forgot-wrap');
        if (!(linkWrap instanceof HTMLElement)) {
            linkWrap = document.createElement('div');
            linkWrap.className = 'auth-forgot-wrap';
            const passwordHost = passwordInput.parentElement;
            if (passwordHost instanceof HTMLElement) {
                passwordHost.insertAdjacentElement('afterend', linkWrap);
            }
        }
        if (linkWrap instanceof HTMLElement && forgotLink.parentElement !== linkWrap) {
            linkWrap.appendChild(forgotLink);
        }
    }
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

const createAuthUiErrorNotifier = (rootEl) => {
    let lastAlertedMessage = '';
    let lastAlertedAt = 0;

    return (rawMessage) => {
        const message = translateAuthError(rawMessage);
        if (!message) return;

        setNotice(message, 'error');
        setInlineError(message);
        markAuthInputsInvalid(rootEl, true);
        setEmailSubmitState(rootEl, false);
        focusFirstInvalidInput(rootEl);

        const now = Date.now();
        if (message === lastAlertedMessage && now - lastAlertedAt < AUTH_ALERT_COOLDOWN_MS) {
            return;
        }
        lastAlertedMessage = message;
        lastAlertedAt = now;
    };
};

const watchAuthUiErrors = (rootEl) => {
    if (!rootEl) return;
    const notifyError = createAuthUiErrorNotifier(rootEl);

    const scanForErrorMessages = () => {
        enhanceAuthForm(rootEl);

        const messageNodes = rootEl.querySelectorAll('[class*="supabase-auth-ui_ui-message"]');
        let foundError = false;
        messageNodes.forEach((node) => {
            const text = (node.textContent || '').trim();
            if (!text) return;
            if (!isLikelyErrorMessage(node, text)) return;
            foundError = true;
            notifyError(text);
        });

        if (!foundError) {
            clearAuthValidationState(rootEl);
        }
    };

    scanForErrorMessages();
    const observer = new MutationObserver(scanForErrorMessages);
    observer.observe(rootEl, {
        childList: true,
        subtree: true,
        characterData: true,
    });
};

const redirectToTarget = () => {
    window.location.href = getRedirectPath();
};

const mountAuthUI = () => {
    const rootEl = document.getElementById('supabase-auth-root');
    if (!rootEl) return;

    const setSocialLoadingState = (provider = '') => {
        const buttons = rootEl.querySelectorAll('.auth-social-btn');
        buttons.forEach((button) => {
            if (!(button instanceof HTMLButtonElement)) return;
            const buttonProvider = button.dataset.provider || '';
            const labelEl = button.querySelector('.auth-social-label');
            const defaultLabel = button.dataset.defaultLabel || (labelEl?.textContent || '').trim();
            button.dataset.defaultLabel = defaultLabel;

            const isLoading = Boolean(provider) && buttonProvider === provider;
            button.disabled = Boolean(provider);
            button.classList.toggle('is-loading', isLoading);
            if (labelEl instanceof HTMLElement) {
                labelEl.textContent = isLoading ? `${defaultLabel} 이동 중...` : defaultLabel;
            }
        });
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
                    'button',
                    {
                        type: 'button',
                        className: 'auth-social-btn auth-social-btn--google',
                        'data-provider': 'google',
                        'data-default-label': 'Google로 계속',
                        onClick: () => { void signInWithProvider('google'); },
                    },
                    React.createElement('span', { className: 'auth-social-icon' }, googleIcon),
                    React.createElement('span', { className: 'auth-social-label' }, 'Google로 계속'),
                    React.createElement('span', { className: 'auth-social-spacer', 'aria-hidden': 'true' }),
                ),
                React.createElement(
                    'button',
                    {
                        type: 'button',
                        className: 'auth-social-btn auth-social-btn--kakao',
                        'data-provider': 'kakao',
                        'data-default-label': 'Kakao로 계속',
                        onClick: () => { void signInWithProvider('kakao'); },
                    },
                    React.createElement('span', { className: 'auth-social-icon' }, kakaoIcon),
                    React.createElement('span', { className: 'auth-social-label' }, 'Kakao로 계속'),
                    React.createElement('span', { className: 'auth-social-spacer', 'aria-hidden': 'true' }),
                ),
            ),
            React.createElement(
                'div',
                { className: 'auth-social-divider' },
                React.createElement('span', null, '또는 이메일로 계속'),
            ),
            React.createElement('p', { id: INLINE_ERROR_ID, className: 'auth-inline-error', 'aria-live': 'polite' }),
            React.createElement('p', { className: 'auth-trust-note' }, '로그인 정보는 암호화되어 안전하게 처리됩니다.'),
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

    enhanceAuthForm(rootEl);
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
