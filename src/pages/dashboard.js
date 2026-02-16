export const initDashboardPage = () => {
    const links = document.querySelectorAll('.dashboard-link');
    links.forEach((link) => {
        link.setAttribute('aria-label', `${link.textContent.trim()} 페이지로 이동`);
    });
};
