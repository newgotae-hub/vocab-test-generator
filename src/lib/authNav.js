import { supabase } from '/src/lib/supabaseClient.js';

const LOGIN_PATH = '/auth/';
const LOGIN_LABEL = '로그인';
const LOGOUT_LABEL = '로그아웃';

const getAuthLinks = () => Array.from(
    document.querySelectorAll('a[data-auth-link], nav a[href="/auth/"]'),
);

const setLinkState = (link, isLoggedIn) => {
    if (!(link instanceof HTMLAnchorElement)) return;

    link.setAttribute('data-auth-link', '');
    link.dataset.authAction = isLoggedIn ? 'logout' : 'login';
    link.textContent = isLoggedIn ? LOGOUT_LABEL : LOGIN_LABEL;
    link.setAttribute('href', isLoggedIn ? '#' : LOGIN_PATH);
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
    const links = getAuthLinks();
    if (!links.length) return;

    bindLogoutHandler(logoutRedirectPath);

    try {
        const { data, error } = await supabase.auth.getSession();
        const isLoggedIn = !error && Boolean(data?.session);
        links.forEach((link) => setLinkState(link, isLoggedIn));
    } catch (_error) {
        links.forEach((link) => setLinkState(link, false));
    }

    supabase.auth.onAuthStateChange((_event, session) => {
        const currentLinks = getAuthLinks();
        currentLinks.forEach((link) => setLinkState(link, Boolean(session)));
    });
};
