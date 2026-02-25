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
        const message = normalizeSpacingText(payload?.error) || '데이터를 불러오는 데 실패했습니다.';
        throw new Error(message);
    }

    return payload;
};

export const fetchVocabRows = async (bookKey) => {
    const normalizedBookKey = normalizeBookKey(bookKey);
    if (!normalizedBookKey) {
        throw new Error(`지원되지 않는 교재입니다: ${bookKey}`);
    }

    const payload = await postJson('/api/vocab/book', { bookKey: normalizedBookKey });
    if (!Array.isArray(payload?.rows)) {
        throw new Error('데이터 형식이 올바르지 않습니다.');
    }
    return payload.rows;
};

