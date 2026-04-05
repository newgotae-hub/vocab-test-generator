import { VOCAB_PREVIEW_FIXTURES } from '/src/data/vocabPreviewFixtures.js';
import { applyBookRowFixes } from '/src/lib/vocabDataFixes.js';
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

let bundledCsvTextPromise = null;

const loadBundledCsvText = async () => {
    if (!bundledCsvTextPromise) {
        bundledCsvTextPromise = import('/src/data/vocabCsvData.js')
            .then((module) => module?.BOOK_CSV_TEXT || {})
            .catch(() => ({}));
    }

    return bundledCsvTextPromise;
};

const parseCsvRowsFallback = (csvText) => {
    const text = String(csvText || '');
    const table = [];
    let row = [];
    let field = '';
    let index = 0;
    let inQuotes = false;

    while (index < text.length) {
        const char = text[index];

        if (char === '"') {
            const nextChar = text[index + 1];
            if (inQuotes && nextChar === '"') {
                field += '"';
                index += 2;
                continue;
            }
            inQuotes = !inQuotes;
            index += 1;
            continue;
        }

        if (char === ',' && !inQuotes) {
            row.push(field);
            field = '';
            index += 1;
            continue;
        }

        if ((char === '\n' || char === '\r') && !inQuotes) {
            if (char === '\r' && text[index + 1] === '\n') {
                index += 1;
            }
            row.push(field);
            field = '';

            if (row.some((cell) => normalizeSpacingText(cell))) {
                table.push(row);
            }
            row = [];
            index += 1;
            continue;
        }

        field += char;
        index += 1;
    }

    row.push(field);
    if (row.some((cell) => normalizeSpacingText(cell))) {
        table.push(row);
    }
    if (table.length === 0) return [];

    const headers = table[0].map((value) => String(value || ''));
    return table.slice(1).map((cells) => {
        const output = {};
        headers.forEach((header, headerIndex) => {
            output[header] = cells[headerIndex] ?? '';
        });
        return output;
    });
};

const getBundledRows = async (bookKey) => {
    const bundledCsvText = await loadBundledCsvText();
    const csvText = bundledCsvText?.[bookKey];
    if (!csvText) return [];
    return applyBookRowFixes(bookKey, parseCsvRowsFallback(csvText));
};

const shouldUseBundledGameRows = () => {
    if (typeof document === 'undefined' || typeof window === 'undefined') return false;
    const pageName = normalizeSpacingText(document.body?.dataset?.page).toLowerCase();
    if (pageName === 'game') return true;
    return normalizeSpacingText(window.location.pathname).startsWith('/game/');
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
    const useBundledGameRows = shouldUseBundledGameRows();

    try {
        const payload = await postJson('/api/vocab/book', { bookKey: normalizedBookKey });
        if (!Array.isArray(payload?.rows)) {
            throw new Error('?곗씠???뺤떇???щ컮瑜댁? ?딆뒿?덈떎.');
        }
        return payload.rows;
    } catch (error) {
        const shouldUseBundledRows = useBundledGameRows || normalizeSpacingText(error?.message).toUpperCase() === 'AUTH_REQUIRED';
        if (shouldUseBundledRows) {
            const bundledRows = await getBundledRows(normalizedBookKey);
            if (bundledRows.length > 0) {
                return bundledRows;
            }
        }

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
