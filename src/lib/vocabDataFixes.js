const ETY_CHAPTER_KEYS = ['chapter', '\uFEFFchapter'];
const ETY_TOC_KEYS = ['toc'];
const ETY_WORD_KEYS = ['word'];
const ETY_MEANING_KEYS = ['meaning'];

const NON_TOC = 'non- (~이 아닌)';
const WARD_TOC = '-ward(s) (~쪽으로, 방향성)';

const normalizeSpacingText = (value) => {
    if (value === null || value === undefined) return '';
    return String(value)
        .replace(/\uFEFF/g, '')
        .normalize('NFKC')
        .replace(/[\u0000-\u001F\u007F]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
};

const normalizeKey = (value) => normalizeSpacingText(value).toLowerCase();

const findFieldKey = (row, aliases) => {
    if (!row || typeof row !== 'object') return '';

    const normalizedAliases = (Array.isArray(aliases) ? aliases : [aliases])
        .map((alias) => normalizeKey(alias))
        .filter(Boolean);
    if (normalizedAliases.length === 0) return '';

    for (const key of Object.keys(row)) {
        if (normalizedAliases.includes(normalizeKey(key))) {
            return key;
        }
    }

    return '';
};

const getField = (row, aliases) => {
    const fieldKey = findFieldKey(row, aliases);
    if (!fieldKey) return '';
    return normalizeSpacingText(row[fieldKey]);
};

const setField = (row, aliases, value) => {
    const aliasList = Array.isArray(aliases) ? aliases : [aliases];
    const fieldKey = findFieldKey(row, aliasList) || aliasList[0];
    row[fieldKey] = value;
};

const createLookupKey = (chapter, toc, word) => {
    return [chapter, toc, word].map((part) => normalizeKey(part)).join('|');
};

const ETYMOLOGY_NON_FIXES = new Map([
    [createLookupKey('CH1', NON_TOC, 'nonstop'), '멈추지 않는, 쉬지 않는'],
    [createLookupKey('CH1', NON_TOC, 'nonsense'), '허튼소리, 무의미한 것'],
    [createLookupKey('CH1', NON_TOC, 'nonexistent'), '존재하지 않는'],
    [createLookupKey('CH1', NON_TOC, 'nonfiction'), '허구가 아닌, 논픽션'],
    [createLookupKey('CH1', NON_TOC, 'nonprofit'), '이익을 추구하지 않는, 비영리의'],
    [createLookupKey('CH1', NON_TOC, 'nonverbal'), '비언어적인, 말이 아닌'],
    [createLookupKey('CH1', NON_TOC, 'nonhuman'), '비인간의, 인간이 아닌 것'],
    [createLookupKey('CH1', NON_TOC, 'nonessential'), '비본질적인, 불필요한'],
    [createLookupKey('CH1', NON_TOC, 'nontraditional'), '전통적이지 않은'],
]);

const ETYMOLOGY_DUPLICATE_MEANINGS = new Map([
    [createLookupKey('CH1', 'a- / an- / ab (~이 아닌, 없는)', 'abnormal'), '정상에서 벗어난, 비정상적인, 이상한'],
    [createLookupKey('CH1', 'hetero- (다른, 이질적인)', 'heterosexual'), '이성애의, 이성애자'],
    [createLookupKey('CH3', 'di- (둘)', 'diploma'), '두 번 접은 증서(공식 문서는 두 번 접었음), 졸업장'],
    [createLookupKey('CH3', 'multi- (많음, 다양한)', 'multiply'), '곱하다, 증가시키다'],
    [createLookupKey('CH3', 'labor (노동하다)', 'elaborate'), '정교한, 공들인; 정교하게 만들다; 상세히 설명하다'],
    [createLookupKey('CH3', 'liter (글자)', 'illiterate'), '문맹의, 무식한; 문맹자'],
    [createLookupKey('CH3', 'milit (군사)', 'demilitarize'), '비무장화하다'],
]);

const cloneRows = (rows) => {
    if (!Array.isArray(rows)) return [];
    return rows.map((row) => (row && typeof row === 'object' ? { ...row } : row));
};

const applyEtymologyMeaningFixes = (rows) => {
    rows.forEach((row) => {
        const lookupKey = createLookupKey(
            getField(row, ETY_CHAPTER_KEYS),
            getField(row, ETY_TOC_KEYS),
            getField(row, ETY_WORD_KEYS),
        );
        const fixedMeaning = ETYMOLOGY_NON_FIXES.get(lookupKey);
        if (fixedMeaning) {
            setField(row, ETY_MEANING_KEYS, fixedMeaning);
        }
    });
};

const applyWardBlockFixes = (rows) => {
    const wardRows = rows.filter((row) => {
        return (
            normalizeKey(getField(row, ETY_CHAPTER_KEYS)) === 'ch2' &&
            normalizeKey(getField(row, ETY_TOC_KEYS)) === normalizeKey(WARD_TOC)
        );
    });

    const replacements = [
        { word: 'forward', meaning: '앞으로' },
        { word: 'backward', meaning: '뒤로' },
        { word: 'upward', meaning: '위로' },
        { word: 'downward', meaning: '아래로' },
        { word: 'northward', meaning: '북쪽으로' },
    ];

    replacements.forEach((replacement, index) => {
        const row = wardRows[index];
        if (!row) return;
        setField(row, ETY_WORD_KEYS, replacement.word);
        setField(row, ETY_MEANING_KEYS, replacement.meaning);
    });
};

const mergeDuplicateEtymologyRows = (rows) => {
    const deduped = [];
    const seen = new Map();

    rows.forEach((row) => {
        const lookupKey = createLookupKey(
            getField(row, ETY_CHAPTER_KEYS),
            getField(row, ETY_TOC_KEYS),
            getField(row, ETY_WORD_KEYS),
        );
        if (!lookupKey) {
            deduped.push(row);
            return;
        }

        const existing = seen.get(lookupKey);
        if (!existing) {
            seen.set(lookupKey, row);
            deduped.push(row);
            return;
        }

        const resolvedMeaning = ETYMOLOGY_DUPLICATE_MEANINGS.get(lookupKey);
        if (resolvedMeaning) {
            setField(existing, ETY_MEANING_KEYS, resolvedMeaning);
            return;
        }

        const mergedMeaningParts = [
            getField(existing, ETY_MEANING_KEYS),
            getField(row, ETY_MEANING_KEYS),
        ].filter(Boolean);
        const mergedMeaning = [...new Set(mergedMeaningParts)].join('; ');
        if (mergedMeaning) {
            setField(existing, ETY_MEANING_KEYS, mergedMeaning);
        }
    });

    return deduped;
};

const applyEtymologyRowFixes = (rows) => {
    const fixedRows = cloneRows(rows);
    applyEtymologyMeaningFixes(fixedRows);
    applyWardBlockFixes(fixedRows);
    return mergeDuplicateEtymologyRows(fixedRows);
};

export const applyBookRowFixes = (bookKey, rows) => {
    if (normalizeKey(bookKey) !== 'etymology') {
        return cloneRows(rows);
    }
    return applyEtymologyRowFixes(rows);
};
