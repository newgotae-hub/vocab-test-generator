import React from 'https://esm.sh/react@18';
import { createRoot } from 'https://esm.sh/react-dom@18/client';
import { supabase } from '/src/lib/supabaseClient.js';
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

const getLoginPath = () => {
    const redirectPath = getRedirectPath();
    const params = new URLSearchParams();
    if (redirectPath && redirectPath !== DEFAULT_REDIRECT_PATH) {
        params.set('redirect', redirectPath);
    }
    const query = params.toString();
    return query ? `/auth/?${query}` : '/auth/';
};

const getEmailRedirectTo = () => {
    const redirectPath = getRedirectPath();
    return new URL(redirectPath || DEFAULT_REDIRECT_PATH, window.location.origin).toString();
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

const mapAuthErrorMessage = (error) => {
    const status = Number(error?.status || 0);
    const code = String(error?.code || error?.error_code || '').toLowerCase();
    const message = String(error?.message || error?.msg || '').toLowerCase();

    if (status === 429 || code.includes('rate_limit') || message.includes('too many requests')) {
        return '요청이 많아 제한되었습니다. 잠시 후 다시 시도해 주세요.';
    }
    if (code === 'user_already_exists' || message.includes('user already registered')) {
        return '이미 가입된 이메일입니다. 로그인해 주세요.';
    }
    if (code === 'email_address_invalid' || message.includes('invalid email')) {
        return '유효한 이메일 주소를 입력해 주세요.';
    }
    if (message.includes('password') && message.includes('6')) {
        return '비밀번호는 6자 이상이어야 합니다.';
    }
    if (message.includes('failed to fetch') || message.includes('network')) {
        return '네트워크 오류가 발생했습니다. 잠시 후 다시 시도해 주세요.';
    }
    return '회원가입 처리 중 오류가 발생했습니다. 잠시 후 다시 시도해 주세요.';
};

const mountSignupUI = () => {
    const rootEl = document.getElementById('supabase-signup-root');
    if (!rootEl) return;

    const SignupApp = () => {
        const [email, setEmail] = React.useState('');
        const [password, setPassword] = React.useState('');
        const [passwordConfirm, setPasswordConfirm] = React.useState('');
        const [isBusy, setIsBusy] = React.useState(false);

        const handleSignup = async (event) => {
            event.preventDefault();
            if (!email.trim()) {
                setNotice('이메일을 입력해 주세요.', 'error');
                return;
            }
            if (!password || password.length < 6) {
                setNotice('비밀번호는 6자 이상이어야 합니다.', 'error');
                return;
            }
            if (password !== passwordConfirm) {
                setNotice('비밀번호 확인이 일치하지 않습니다.', 'error');
                return;
            }

            setIsBusy(true);
            setNotice('인증 메일을 보내고 있습니다...', 'info');
            try {
                const { data, error } = await supabase.auth.signUp({
                    email: email.trim(),
                    password,
                    options: {
                        emailRedirectTo: getEmailRedirectTo(),
                    },
                });
                if (error) throw error;

                const identities = data?.user?.identities || [];
                if (Array.isArray(identities) && identities.length === 0) {
                    setNotice('이미 가입된 이메일입니다. 로그인해 주세요.', 'error');
                    return;
                }

                setNotice('이메일에서 "인증하기"를 누르면 회원가입이 완료됩니다.', 'success');
            } catch (error) {
                setNotice(mapAuthErrorMessage(error), 'error');
            } finally {
                setIsBusy(false);
            }
        };

        return React.createElement(
            React.Fragment,
            null,
            React.createElement(
                'form',
                { className: 'signup-form', onSubmit: handleSignup },
                React.createElement('label', { className: 'signup-label', htmlFor: 'signup-email' }, '이메일'),
                React.createElement('input', {
                    id: 'signup-email',
                    className: 'signup-input',
                    type: 'email',
                    placeholder: 'you@example.com',
                    value: email,
                    onChange: (event) => setEmail(event.target.value),
                    autoComplete: 'email',
                    disabled: isBusy,
                    required: true,
                }),
                React.createElement('label', { className: 'signup-label', htmlFor: 'signup-password' }, '비밀번호'),
                React.createElement('input', {
                    id: 'signup-password',
                    className: 'signup-input',
                    type: 'password',
                    placeholder: '6자 이상',
                    value: password,
                    onChange: (event) => setPassword(event.target.value),
                    autoComplete: 'new-password',
                    disabled: isBusy,
                    minLength: 6,
                    required: true,
                }),
                React.createElement('label', { className: 'signup-label', htmlFor: 'signup-password-confirm' }, '비밀번호 확인'),
                React.createElement('input', {
                    id: 'signup-password-confirm',
                    className: 'signup-input',
                    type: 'password',
                    placeholder: '비밀번호 재입력',
                    value: passwordConfirm,
                    onChange: (event) => setPasswordConfirm(event.target.value),
                    autoComplete: 'new-password',
                    disabled: isBusy,
                    required: true,
                }),
                React.createElement(
                    'button',
                    {
                        type: 'submit',
                        className: 'signup-primary-btn',
                        disabled: isBusy,
                    },
                    isBusy ? '처리 중...' : '회원가입',
                ),
            ),
            React.createElement(
                'div',
                { className: 'auth-page-links' },
                React.createElement(
                    'a',
                    {
                        className: 'auth-page-link',
                        href: getLoginPath(),
                    },
                    '이미 계정이 있으신가요? 로그인',
                ),
            ),
        );
    };

    const root = createRoot(rootEl);
    root.render(React.createElement(SignupApp));
};

const initSignupPage = async () => {
    const callbackResult = await completeAuthFromUrl();
    if (callbackResult.status === 'success') {
        setNotice('이메일 인증이 완료되었습니다. 이동합니다...', 'success');
        window.location.href = getRedirectPath();
        return;
    }
    if (callbackResult.status === 'error' && callbackResult.message) {
        setNotice(callbackResult.message, 'error');
    }

    try {
        const { data, error } = await supabase.auth.getSession();
        if (error) {
            setNotice('세션 확인에 실패했습니다. 다시 시도해 주세요.', 'error');
        }
        if (data?.session) {
            window.location.href = getRedirectPath();
            return;
        }
    } catch (_error) {
        setNotice('인증 초기화에 실패했습니다. 잠시 후 다시 시도해 주세요.', 'error');
    }

    mountSignupUI();

    supabase.auth.onAuthStateChange((event, session) => {
        if (event === 'SIGNED_IN' && session) {
            window.location.href = getRedirectPath();
        }
    });
};

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initSignupPage);
} else {
    initSignupPage();
}
