import { supabase } from '/src/lib/supabaseClient.js';

const LOGIN_PATH = '/auth/';
const LOGIN_LABEL = '로그인';
const LOGOUT_LABEL = '로그아웃';
const PROTECTED_PAGES = new Set([
    'dashboard',
    'mypage',
    'generator',
    'test',
    'cards',
    'ranked',
    'stats',
    'game',
]);

const getAuthLinks = () => Array.from(
    document.querySelectorAll('a[data-auth-link], nav a[href="/auth/"]'),
);

const setLinkState = (link, isLoggedIn, options) => {
    if (!(link instanceof HTMLAnchorElement)) return;

    link.setAttribute('data-auth-link', '');
    link.dataset.authAction = isLoggedIn ? options.loggedInAction : 'login';
    link.textContent = isLoggedIn ? options.loggedInLabel : options.loginLabel;
    link.setAttribute('href', isLoggedIn ? options.loggedInPath : options.loginPath);
};

const bindLogoutHandler = (logoutRedirectPath) => {
    if (document.body?.dataset?.authNavBound === 'true') return;
    if (document.body) {
        document.body.dataset.authNavBound = 'true';
    }

    document.addEventListener('click', async (event) => {
        const target = event.target;
        if (!(target instanceof HTMLElement)) return;

        const logoutLink = target.closest('a[data-auth-action="logout"]');
        if (!(logoutLink instanceof HTMLAnchorElement)) return;

        event.preventDefault();

        try {
            await supabase.auth.signOut();
        } finally {
            window.location.href = logoutRedirectPath;
        }
    });
};

export const initAuthNavLinks = async (options = {}) => {
    const logoutRedirectPath = options.logoutRedirectPath || '/';
    const linkOptions = {
        loginPath: options.loginPath || LOGIN_PATH,
        loginLabel: options.loginLabel || LOGIN_LABEL,
        loggedInPath: options.loggedInPath || '#',
        loggedInLabel: options.loggedInLabel || LOGOUT_LABEL,
        loggedInAction: options.loggedInAction || 'logout',
    };
    const links = getAuthLinks();
    if (!links.length) return;

    const pageName = document.body?.dataset?.page || '';
    if (PROTECTED_PAGES.has(pageName)) {
        // Protected pages always require a session, so render as logged-in immediately
        // to prevent "로그인 -> 마이페이지" text flicker during async session fetch.
        links.forEach((link) => setLinkState(link, true, linkOptions));
    }

    bindLogoutHandler(logoutRedirectPath);

    try {
        const { data, error } = await supabase.auth.getSession();
        const isLoggedIn = !error && Boolean(data?.session);
        links.forEach((link) => setLinkState(link, isLoggedIn, linkOptions));
    } catch (_error) {
        links.forEach((link) => setLinkState(link, false, linkOptions));
    }

    supabase.auth.onAuthStateChange((_event, session) => {
        const currentLinks = getAuthLinks();
        currentLinks.forEach((link) => setLinkState(link, Boolean(session), linkOptions));
    });
};
