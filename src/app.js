import { initDashboardPage } from '/src/pages/dashboard.js';
import { initGeneratorPage } from '/src/pages/generator.js';
import { initGamePage } from '/src/pages/game.js';
import { initMyPage } from '/src/pages/mypage.js';
import { initRankedPage } from '/src/pages/ranked.js';
import { enforceAuthOrRedirect } from '/src/lib/authGuard.js';
import { initAuthNavLinks } from '/src/lib/authNav.js';
import { completeAuthFromUrl } from '/src/lib/authCallback.js';

const normalizePath = (pathname) => {
    if (!pathname || pathname === '/index.html') return '/';
    if (pathname.endsWith('/index.html')) return `${pathname.slice(0, -'index.html'.length)}`;
    return pathname.endsWith('/') ? pathname : `${pathname}/`;
};

const markActiveNav = () => {
    const currentPath = normalizePath(window.location.pathname);
    const navLinks = document.querySelectorAll('nav a[data-route]');

    navLinks.forEach((link) => {
        const route = normalizePath(link.getAttribute('data-route') || link.getAttribute('href') || '/');
        const isActive = currentPath === route;
        link.classList.toggle('section-link--active', isActive);
        if (isActive) {
            link.setAttribute('aria-current', 'page');
        } else {
            link.removeAttribute('aria-current');
        }
    });
};

const pageInits = {
    dashboard: initDashboardPage,
    generator: initGeneratorPage,
    game: initGamePage,
    mypage: initMyPage,
    ranked: initRankedPage,
};

const bootstrap = async () => {
    const pageName = document.body?.dataset?.page || '';
    if (document.body) {
        document.body.dataset.authReady = 'false';
    }
    const callbackResult = await completeAuthFromUrl();
    if (callbackResult.status === 'error' && callbackResult.message) {
        window.alert(callbackResult.message);
    }

    const canAccessPage = await enforceAuthOrRedirect(pageName);
    if (!canAccessPage) {
        return;
    }

    if (document.body) {
        document.body.dataset.authReady = 'true';
    }

    await initAuthNavLinks({
        loggedInLabel: '마이페이지',
        loggedInPath: '/mypage/',
        loggedInAction: 'mypage',
    });
    markActiveNav();
    const initPage = pageInits[pageName];
    if (typeof initPage === 'function') {
        await initPage();
    }
};

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', bootstrap);
} else {
    bootstrap();
}
