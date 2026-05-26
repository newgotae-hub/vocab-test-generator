const getAccessibleLabel = (link) => {
    const title = (link.querySelector('h3')?.textContent || link.textContent || '').trim();
    return title || 'Dashboard item';
};

export const initDashboardPage = () => {
    const links = document.querySelectorAll('.dashboard-link');

    links.forEach((link) => {
        link.setAttribute('aria-label', getAccessibleLabel(link));
    });
};
