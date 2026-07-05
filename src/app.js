import { initGeneratorPage } from '/src/pages/generator.js';
import { initMyPage } from '/src/pages/mypage.js';
import { enforceAuthOrRedirect } from '/src/lib/authGuard.js';
import { initAuthNavLinks } from '/src/lib/authNav.js';
import { completeAuthFromUrl } from '/src/lib/authCallback.js';

const PROTECTED_APP_PAGES = new Set(['mypage', 'generator', 'test', 'cards', 'stats']);

const normalizePath = (pathname) => {
    if (!pathname || pathname === '/index.html') return '/';
    if (pathname.endsWith('/index.html')) return `${pathname.slice(0, -'index.html'.length)}`;
    return pathname.endsWith('/') ? pathname : `${pathname}/`;
};

const ensureAppLoadingState = (pageName) => {
    if (!PROTECTED_APP_PAGES.has(pageName)) return null;

    const appEl = document.getElementById('app');
    if (!appEl) return null;

    let loadingEl = document.getElementById('app-auth-loading');
    if (loadingEl instanceof HTMLElement) return loadingEl;

    loadingEl = document.createElement('section');
    loadingEl.id = 'app-auth-loading';
    loadingEl.className = 'app-auth-loading';
    loadingEl.setAttribute('role', 'status');
    loadingEl.setAttribute('aria-live', 'polite');
    loadingEl.innerHTML = `
        <div class="app-auth-loading-card">
            <span class="auth-transition-spinner" aria-hidden="true"></span>
            <strong data-app-loading-title>로그인 정보를 확인 중입니다</strong>
            <span data-app-loading-detail>불러오는 중입니다. 잠시 기다려주세요.</span>
        </div>
    `;
    appEl.insertAdjacentElement('afterbegin', loadingEl);
    return loadingEl;
};

const setAppLoadingState = (pageName, isVisible, title = '로그인 정보를 확인 중입니다', detail = '불러오는 중입니다. 잠시 기다려주세요.') => {
    const loadingEl = ensureAppLoadingState(pageName);
    if (!loadingEl) return;

    const titleEl = loadingEl.querySelector('[data-app-loading-title]');
    const detailEl = loadingEl.querySelector('[data-app-loading-detail]');
    if (titleEl) titleEl.textContent = title;
    if (detailEl) detailEl.textContent = detail;
    loadingEl.hidden = !isVisible;
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
    generator: initGeneratorPage,
    mypage: initMyPage,
};

const bootstrap = async () => {
    const pageName = document.body?.dataset?.page || '';
    if (document.body) {
        document.body.dataset.authReady = 'false';
    }
    setAppLoadingState(pageName, true);
    const callbackResult = await completeAuthFromUrl();
    if (callbackResult.status === 'error' && callbackResult.message) {
        window.alert(callbackResult.message);
    }

    const canAccessPage = await enforceAuthOrRedirect(pageName);
    if (!canAccessPage) {
        setAppLoadingState(pageName, true, '로그인 페이지로 이동 중입니다', '인증이 필요합니다. 잠시 기다려주세요.');
        return;
    }

    if (document.body) {
        document.body.dataset.authReady = 'true';
    }
    setAppLoadingState(pageName, false);

    await initAuthNavLinks({
        loggedInLabel: '마이페이지',
        loggedInPath: '/generator/',
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
