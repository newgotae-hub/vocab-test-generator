import { supabase } from '/src/lib/supabaseClient.js';

const PROTECTED_PAGES = new Set([
    'dashboard',
    'generator',
    'test',
    'cards',
    'ranked',
    'stats',
    'game',
]);

const redirectToAuth = () => {
    const redirectPath = `${window.location.pathname}${window.location.search}${window.location.hash}`;
    const params = new URLSearchParams();
    params.set('redirect', redirectPath);
    window.location.href = `/auth/?${params.toString()}`;
};

export const enforceAuthOrRedirect = async (pageName) => {
    if (!PROTECTED_PAGES.has(pageName)) {
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
