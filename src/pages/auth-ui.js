import React from 'https://esm.sh/react@18';
import { createRoot } from 'https://esm.sh/react-dom@18/client';
import { Auth } from 'https://esm.sh/@supabase/auth-ui-react';
import { ThemeSupa } from 'https://esm.sh/@supabase/auth-ui-shared';
import { supabase } from '/src/lib/supabaseClient.js';

const DEFAULT_REDIRECT_PATH = '/dashboard/';
const AUTH_UI_KO = {
    variables: {
        sign_in: {
            email_label: '이메일',
            password_label: '비밀번호',
            email_input_placeholder: 'you@example.com',
            password_input_placeholder: '비밀번호',
            button_label: '로그인',
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

const redirectToTarget = () => {
    window.location.href = getRedirectPath();
};

const mountAuthUI = () => {
    const rootEl = document.getElementById('supabase-auth-root');
    if (!rootEl) return;

    const root = createRoot(rootEl);
    root.render(
        React.createElement(Auth, {
            supabaseClient: supabase,
            appearance: { theme: ThemeSupa },
            view: 'sign_in',
            showLinks: true,
            providers: [],
            onlyThirdPartyProviders: false,
            localization: AUTH_UI_KO,
        }),
    );

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
