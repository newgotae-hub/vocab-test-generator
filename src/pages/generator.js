export const initGeneratorPage = () => {
    const app = document.getElementById('app');
    if (app) {
        app.setAttribute('data-generator-page', 'true');
    }
};
