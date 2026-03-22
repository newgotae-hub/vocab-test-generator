import { VOCAB_PREVIEW_FIXTURES } from '/src/data/vocabPreviewFixtures.js';
import { isLocalPreviewEnabled, syncLocalPreviewPreference } from '/src/lib/previewMode.js';
import { supabase } from '/src/lib/supabaseClient.js';

const normalizeSpacingText = (value) => {
    if (value === null || value === undefined) return '';
    return String(value)
        .replace(/\uFEFF/g, '')
        .normalize('NFKC')
        .replace(/[\u0000-\u001F\u007F]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
};

const normalizeBookKey = (bookKey) => {
    const normalized = normalizeSpacingText(bookKey).toLowerCase();
    if (normalized === 'etymology' || normalized === 'basic' || normalized === 'advanced') {
        return normalized;
    }
    return '';
};

const getPreviewRows = (bookKey) => {
    const rows = VOCAB_PREVIEW_FIXTURES?.[bookKey];
    if (!Array.isArray(rows)) return [];
    return rows.map((row) => ({ ...row }));
};

const getAccessToken = async () => {
    const { data, error } = await supabase.auth.getSession();
    if (error || !data?.session?.access_token) {
        throw new Error('AUTH_REQUIRED');
    }
    return data.session.access_token;
};

const postJson = async (url, body) => {
    const token = await getAccessToken();
    const response = await fetch(url, {
        method: 'POST',
        headers: {
            'content-type': 'application/json',
            authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(body || {}),
    });

    let payload = null;
    try {
        payload = await response.json();
    } catch (_error) {
        payload = null;
    }

    if (!response.ok || !payload?.ok) {
        const message = normalizeSpacingText(payload?.error) || '?곗씠?곕? 遺덈윭?ㅻ뒗 ???ㅽ뙣?덉뒿?덈떎.';
        throw new Error(message);
    }

    return payload;
};

export const fetchVocabRows = async (bookKey) => {
    const normalizedBookKey = normalizeBookKey(bookKey);
    if (!normalizedBookKey) {
        throw new Error(`吏?먮릺吏 ?딅뒗 援먯옱?낅땲?? ${bookKey}`);
    }

    syncLocalPreviewPreference();
    const useLocalPreview = isLocalPreviewEnabled();

    try {
        const payload = await postJson('/api/vocab/book', { bookKey: normalizedBookKey });
        if (!Array.isArray(payload?.rows)) {
            throw new Error('?곗씠???뺤떇???щ컮瑜댁? ?딆뒿?덈떎.');
        }
        return payload.rows;
    } catch (error) {
        if (!useLocalPreview) {
            throw error;
        }

        const previewRows = getPreviewRows(normalizedBookKey);
        if (previewRows.length > 0) {
            return previewRows;
        }

        throw error;
    }
};
