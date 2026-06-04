import { completeAuthFromUrl } from '/src/lib/authCallback.js';
import { initAuthNavLinks } from '/src/lib/authNav.js';

export const initLandingPage = async () => {
    const clearCallbackPending = () => {
        document.documentElement.classList.remove('auth-callback-pending');
    };
    const purchaseButton = document.getElementById('landing-purchase-button');

    const callbackResult = await completeAuthFromUrl();
    if (callbackResult.status === 'success') {
        window.location.replace('/mypage/');
        return;
    }

    clearCallbackPending();
    if (callbackResult.status === 'error' && callbackResult.message) {
        window.alert(callbackResult.message);
    }

    await initAuthNavLinks({
        loggedInLabel: '마이페이지',
        loggedInPath: '/mypage/',
        loggedInAction: 'mypage',
    });

    if (purchaseButton instanceof HTMLButtonElement) {
        purchaseButton.addEventListener('click', () => {
            window.alert('곧 출시됩니다!');
        });
    }
};
