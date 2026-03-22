const DASHBOARD_CTA_LABELS = {
    'ranked-sprint': '랭킹 스프린트로 이동',
    'survival-ladder': '생존 모드로 이동',
    rankings: '랭킹 보기로 이동',
    'game-card': '게임 학습으로 이동',
};

const getAccessibleLabel = (link) => {
    const ctaKey = link.dataset.dashboardCta || '';
    if (DASHBOARD_CTA_LABELS[ctaKey]) return DASHBOARD_CTA_LABELS[ctaKey];

    const title = (link.querySelector('h3')?.textContent || link.textContent || '').trim();
    return `${title} 페이지로 이동`;
};

export const initDashboardPage = () => {
    const links = document.querySelectorAll('.dashboard-link, [data-dashboard-cta]');

    links.forEach((link) => {
        link.setAttribute('aria-label', getAccessibleLabel(link));
    });
};
