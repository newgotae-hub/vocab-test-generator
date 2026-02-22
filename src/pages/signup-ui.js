import React from 'https://esm.sh/react@18';
import { createRoot } from 'https://esm.sh/react-dom@18/client';
import { supabase } from '/src/lib/supabaseClient.js';

const DEFAULT_REDIRECT_PATH = '/dashboard/';
const OTP_VALID_SECONDS = 2 * 60;
const OTP_RESEND_COOLDOWN_SECONDS = 30;

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

const getSignupPath = () => {
    const redirectPath = getRedirectPath();
    const params = new URLSearchParams();
    if (redirectPath && redirectPath !== DEFAULT_REDIRECT_PATH) {
        params.set('redirect', redirectPath);
    }
    const query = params.toString();
    return query ? `/signup/?${query}` : '/signup/';
};

const hasSignupCallbackParams = () => {
    const params = new URLSearchParams(window.location.search);
    return params.get('type') === 'signup' || params.has('token_hash');
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
    if (message.includes('invalid') && message.includes('token')) {
        return '인증번호가 올바르지 않습니다.';
    }
    if (message.includes('token') && message.includes('expired')) {
        return '인증번호가 만료되었습니다. 재발송 후 다시 시도해 주세요.';
    }
    return '인증 처리 중 오류가 발생했습니다. 잠시 후 다시 시도해 주세요.';
};

const formatRemain = (seconds) => {
    const safe = Math.max(0, Number(seconds) || 0);
    const mm = String(Math.floor(safe / 60)).padStart(2, '0');
    const ss = String(safe % 60).padStart(2, '0');
    return `${mm}:${ss}`;
};

const mountSignupUI = (initialState = {}) => {
    const rootEl = document.getElementById('supabase-signup-root');
    if (!rootEl) return;

    const SignupApp = () => {
        const [email, setEmail] = React.useState(initialState.email || '');
        const [password, setPassword] = React.useState('');
        const [passwordConfirm, setPasswordConfirm] = React.useState('');
        const [otpCode, setOtpCode] = React.useState('');
        const [isBusy, setIsBusy] = React.useState(false);
        const [isVerified, setIsVerified] = React.useState(Boolean(initialState.verified));
        const [otpExpiresAt, setOtpExpiresAt] = React.useState(0);
        const [resendCooldownUntil, setResendCooldownUntil] = React.useState(0);
        const [nowSec, setNowSec] = React.useState(Math.floor(Date.now() / 1000));

        const inVerifyMode = otpExpiresAt > 0 && !isVerified;
        const otpRemain = Math.max(0, otpExpiresAt - nowSec);
        const resendRemain = Math.max(0, resendCooldownUntil - nowSec);

        React.useEffect(() => {
            if (!inVerifyMode && resendRemain <= 0) return undefined;
            const timer = window.setInterval(() => {
                setNowSec(Math.floor(Date.now() / 1000));
            }, 1000);
            return () => window.clearInterval(timer);
        }, [inVerifyMode, resendRemain]);

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
                        emailRedirectTo: getSignupPath(),
                    },
                });
                if (error) throw error;

                const identities = data?.user?.identities || [];
                if (Array.isArray(identities) && identities.length === 0) {
                    setNotice('이미 가입된 이메일입니다. 로그인해 주세요.', 'error');
                    return;
                }

                const now = Math.floor(Date.now() / 1000);
                setOtpExpiresAt(now + OTP_VALID_SECONDS);
                setResendCooldownUntil(now + OTP_RESEND_COOLDOWN_SECONDS);
                setNowSec(now);
                setNotice('인증 메일을 보냈습니다. 2분 내에 인증번호를 입력해 주세요. (코드가 없으면 메일의 Confirm 링크로 인증 가능)', 'success');
            } catch (error) {
                setNotice(mapAuthErrorMessage(error), 'error');
            } finally {
                setIsBusy(false);
            }
        };

        const verifyCode = async () => {
            if (!email.trim()) {
                setNotice('이메일을 입력해 주세요.', 'error');
                return;
            }
            if (otpCode.trim().length < 6) {
                setNotice('인증번호 6자리를 입력해 주세요.', 'error');
                return;
            }
            if (otpRemain <= 0) {
                setNotice('제한시간이 만료되었습니다. 재발송 후 다시 시도해 주세요.', 'error');
                return;
            }

            setIsBusy(true);
            setNotice('인증번호 확인 중...', 'info');
            try {
                const { error } = await supabase.auth.verifyOtp({
                    email: email.trim(),
                    token: otpCode.trim(),
                    type: 'signup',
                });
                if (error) throw error;

                setIsVerified(true);
                setNotice('인증되었습니다.', 'success');
            } catch (error) {
                setNotice(mapAuthErrorMessage(error), 'error');
            } finally {
                setIsBusy(false);
            }
        };

        const resendCode = async () => {
            if (!email.trim()) {
                setNotice('이메일을 입력해 주세요.', 'error');
                return;
            }
            if (resendRemain > 0) {
                setNotice(`${resendRemain}초 후 재발송 가능합니다.`, 'error');
                return;
            }

            setIsBusy(true);
            setNotice('인증 메일을 다시 보내고 있습니다...', 'info');
            try {
                const { error } = await supabase.auth.resend({
                    type: 'signup',
                    email: email.trim(),
                    options: {
                        emailRedirectTo: getSignupPath(),
                    },
                });
                if (error) throw error;

                const now = Math.floor(Date.now() / 1000);
                setOtpExpiresAt(now + OTP_VALID_SECONDS);
                setResendCooldownUntil(now + OTP_RESEND_COOLDOWN_SECONDS);
                setNowSec(now);
                setNotice('인증 메일을 다시 보냈습니다.', 'success');
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
                inVerifyMode && React.createElement(
                    React.Fragment,
                    null,
                    React.createElement(
                        'div',
                        { className: 'signup-verify-row' },
                        React.createElement('label', { className: 'signup-label', htmlFor: 'signup-otp' }, '인증번호'),
                        React.createElement(
                            'span',
                            { className: `signup-verify-timer${otpRemain <= 0 ? ' is-expired' : ''}` },
                            formatRemain(otpRemain),
                        ),
                    ),
                    React.createElement('input', {
                        id: 'signup-otp',
                        className: 'signup-input signup-otp-input',
                        type: 'text',
                        inputMode: 'numeric',
                        pattern: '[0-9]*',
                        maxLength: 6,
                        placeholder: '6자리 인증번호',
                        value: otpCode,
                        onChange: (event) => setOtpCode(event.target.value.replace(/[^0-9]/g, '')),
                        disabled: isBusy || isVerified,
                    }),
                    React.createElement(
                        'div',
                        { className: 'signup-mini-actions' },
                        React.createElement(
                            'button',
                            {
                                type: 'button',
                                className: 'signup-mini-btn',
                                onClick: verifyCode,
                                disabled: isBusy || isVerified,
                            },
                            '인증번호 확인',
                        ),
                        React.createElement(
                            'button',
                            {
                                type: 'button',
                                className: 'signup-mini-btn signup-mini-btn-secondary',
                                onClick: resendCode,
                                disabled: isBusy || resendRemain > 0 || isVerified,
                            },
                            resendRemain > 0 ? `재발송 ${resendRemain}s` : '인증번호 재발송',
                        ),
                    ),
                ),
                React.createElement(
                    'button',
                    {
                        type: 'submit',
                        className: 'signup-primary-btn',
                        disabled: isBusy || isVerified || inVerifyMode,
                    },
                    inVerifyMode ? '인증 메일 발송 완료' : (isBusy ? '처리 중...' : '회원가입'),
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
    const isSignupCallback = hasSignupCallbackParams();

    try {
        const { data, error } = await supabase.auth.getSession();
        if (error) {
            setNotice('세션 확인에 실패했습니다. 다시 시도해 주세요.', 'error');
        }
        if (data?.session) {
            if (isSignupCallback) {
                setNotice('인증되었습니다.', 'success');
                mountSignupUI({
                    verified: true,
                    email: data.session?.user?.email || '',
                });
                return;
            }
            window.location.href = getRedirectPath();
            return;
        }
    } catch (_error) {
        setNotice('인증 초기화에 실패했습니다. 잠시 후 다시 시도해 주세요.', 'error');
    }

    mountSignupUI();
};

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initSignupPage);
} else {
    initSignupPage();
}
