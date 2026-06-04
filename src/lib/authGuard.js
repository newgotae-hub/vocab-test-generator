import { supabase } from '/src/lib/supabaseClient.js';
import { canUseLocalPreviewForPage, syncLocalPreviewPreference } from '/src/lib/previewMode.js';

const PROTECTED_PAGES = new Set([
    'mypage',
    'generator',
    'test',
    'cards',
    'stats',
]);

const redirectToAuth = () => {
    const redirectPath = `${window.location.pathname}${window.location.search}${window.location.hash}`;
    const params = new URLSearchParams();
    params.set('redirect', redirectPath);
    window.location.href = `/auth/?${params.toString()}`;
};

export const enforceAuthOrRedirect = async (pageName) => {
    syncLocalPreviewPreference();

    if (!PROTECTED_PAGES.has(pageName)) {
        return true;
    }

    if (canUseLocalPreviewForPage(pageName)) {
        return true;
    }

    try {
        const { data, error } = await supabase.auth.getSession();
        if (error || !data?.session) {
            redirectToAuth();
            return false;
        }
    } catch (_error) {
        redirectToAuth();
        return false;
    }

    return true;
};
