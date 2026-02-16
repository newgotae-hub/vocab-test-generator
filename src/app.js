import { initDashboardPage } from '/src/pages/dashboard.js';
import { initGeneratorPage } from '/src/pages/generator.js';

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
};

const bootstrap = () => {
    markActiveNav();

    const pageName = document.body?.dataset?.page || '';
    const initPage = pageInits[pageName];
    if (typeof initPage === 'function') {
        initPage();
    }
};

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', bootstrap);
} else {
    bootstrap();
}
