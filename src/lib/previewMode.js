const PREVIEW_QUERY_KEY = 'preview';
const PREVIEW_STORAGE_KEY = 'voca_plus_local_preview_enabled';
const PREVIEW_ALLOWED_HOSTS = new Set(['localhost', '127.0.0.1']);
const PREVIEW_ALLOWED_PAGES = new Set(['game', 'ranked', 'mypage']);

const normalizeSpacingText = (value) => String(value ?? '')
    .replace(/\uFEFF/g, '')
    .normalize('NFKC')
    .replace(/[\u0000-\u001F\u007F]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

export const isLocalPreviewHost = (hostname = window?.location?.hostname ?? '') => (
    PREVIEW_ALLOWED_HOSTS.has(normalizeSpacingText(hostname).toLowerCase())
);

const getPreviewStorage = () => {
    if (typeof window === 'undefined') return null;
    try {
        return window.localStorage;
    } catch (_error) {
        return null;
    }
};

const readStoredPreviewFlag = () => {
    const storage = getPreviewStorage();
    if (!storage) return '';
    return normalizeSpacingText(storage.getItem(PREVIEW_STORAGE_KEY)).toLowerCase();
};

const writeStoredPreviewFlag = (enabled) => {
    const storage = getPreviewStorage();
    if (!storage) return;
    if (enabled) {
        storage.setItem(PREVIEW_STORAGE_KEY, '1');
        return;
    }
    storage.removeItem(PREVIEW_STORAGE_KEY);
};

export const syncLocalPreviewPreference = (
    search = window?.location?.search ?? '',
    hostname = window?.location?.hostname ?? '',
) => {
    if (!isLocalPreviewHost(hostname)) return false;

    const params = new URLSearchParams(search || '');
    const queryFlag = normalizeSpacingText(params.get(PREVIEW_QUERY_KEY)).toLowerCase();

    if (queryFlag === '1' || queryFlag === 'true') {
        writeStoredPreviewFlag(true);
        return true;
    }

    if (queryFlag === '0' || queryFlag === 'false' || queryFlag === 'off') {
        writeStoredPreviewFlag(false);
        return false;
    }

    return readStoredPreviewFlag() === '1';
};

export const isLocalPreviewEnabled = (
    search = window?.location?.search ?? '',
    hostname = window?.location?.hostname ?? '',
) => {
    if (!isLocalPreviewHost(hostname)) return false;
    return syncLocalPreviewPreference(search, hostname);
};

export const canUseLocalPreviewForPage = (
    pageName,
    search = window?.location?.search ?? '',
    hostname = window?.location?.hostname ?? '',
) => {
    const normalizedPageName = normalizeSpacingText(pageName).toLowerCase();
    return PREVIEW_ALLOWED_PAGES.has(normalizedPageName)
        && isLocalPreviewEnabled(search, hostname);
};
