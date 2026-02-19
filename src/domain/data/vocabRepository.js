const BOOK_KEYS = ['etymology', 'basic', 'advanced'];
const CSV_PATHS = {
    etymology: '/data/root.csv',
    basic: '/data/DB-basic.csv',
    advanced: '/data/DB-advanced.csv',
};

const bookCache = new Map();

const DAY_WORD_KEYS = ['단어', 'word'];
const DAY_MEANING_KEYS = ['의미', 'meaning', '뜻'];
const ETY_CHAPTER_KEYS = ['chapter', '챕터', '대분류'];
const ETY_TOC_KEYS = ['toc', '목차', '소분류'];
const ETY_WORD_KEYS = ['word', '단어'];
const ETY_MEANING_KEYS = ['meaning', '의미', '뜻'];

const getDerivativeWordKeys = (index) => [`파생어${index}`, `파생어 ${index}`, `derivative${index}`];
const getDerivativeMeaningKeys = (index) => [`파생어${index} 뜻`, `파생어 ${index} 뜻`, `derivative${index} meaning`];

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
    return BOOK_KEYS.includes(normalized) ? normalized : '';
};

const getCsvField = (row, keys) => {
    if (!row || typeof row !== 'object') return '';
    const keyList = Array.isArray(keys) ? keys : [keys];

    for (const key of keyList) {
        const direct = row[key] ?? row[`﻿${key}`];
        const normalized = normalizeSpacingText(direct);
        if (normalized) return normalized;
    }

    const normalizedKeyMap = new Map();
    Object.entries(row).forEach(([rawKey, rawValue]) => {
        const normalizedKey = normalizeSpacingText(rawKey).toLowerCase();
        if (!normalizedKeyMap.has(normalizedKey)) {
            normalizedKeyMap.set(normalizedKey, rawValue);
        }
    });

    for (const key of keyList) {
        const normalizedKey = normalizeSpacingText(key).toLowerCase();
        if (!normalizedKey) continue;
        const normalized = normalizeSpacingText(normalizedKeyMap.get(normalizedKey));
        if (normalized) return normalized;
    }

    return '';
};

const parseCsvRows = (csvText) => new Promise((resolve, reject) => {
    if (!window.Papa?.parse) {
        reject(new Error('PapaParse 라이브러리를 찾을 수 없습니다.'));
        return;
    }

    window.Papa.parse(csvText, {
        header: true,
        skipEmptyLines: true,
        complete: (results) => resolve(results.data || []),
        error: (error) => reject(error),
    });
});

const buildDayLabel = (index) => `DAY ${String(Math.floor(index / 50) + 1).padStart(2, '0')}`;

const dayLabelToNumber = (label) => {
    const match = normalizeSpacingText(label).match(/^DAY\s*0?(\d{1,2})$/i);
    return match ? Number.parseInt(match[1], 10) : Number.POSITIVE_INFINITY;
};

const sortDayLabels = (labels) => {
    return [...labels].sort((a, b) => {
        const aNum = dayLabelToNumber(a);
        const bNum = dayLabelToNumber(b);
        if (aNum !== bNum) return aNum - bNum;
        return normalizeSpacingText(a).localeCompare(normalizeSpacingText(b), 'ko', { numeric: true });
    });
};

const sortLabels = (labels) => {
    return [...labels].sort((a, b) => normalizeSpacingText(a).localeCompare(normalizeSpacingText(b), 'ko', { numeric: true }));
};

const buildCardId = ({ bookKey, chapter, toc, word, meaning }) => {
    return [bookKey, chapter, toc, word, meaning]
        .map((part) => normalizeSpacingText(part).toLowerCase())
        .join('|');
};

const buildWordsByToc = (rows) => {
    const wordsByToc = {};
    (rows || []).forEach((row) => {
        const toc = normalizeSpacingText(row?.toc);
        if (!toc) return;
        if (!wordsByToc[toc]) wordsByToc[toc] = [];
        wordsByToc[toc].push(row);
    });
    return wordsByToc;
};

const mapDayRowsToWords = (bookKey, rows) => {
    return (rows || []).map((row, index) => {
        const dayNumber = Math.floor(index / 50) + 1;
        if (dayNumber > 30) return null;

        const baseWord = getCsvField(row, DAY_WORD_KEYS);
        if (!baseWord) return null;
        const baseWordKey = baseWord.toLowerCase();

        const derivatives = [];
        const derivativeKeys = new Set();
        for (let i = 1; i <= 6; i += 1) {
            const derivativeWord = getCsvField(row, getDerivativeWordKeys(i));
            if (!derivativeWord) continue;
            if (derivativeWord.toLowerCase() === baseWordKey) continue;

            const derivativeMeaning = getCsvField(row, getDerivativeMeaningKeys(i));
            const derivativeKey = `${derivativeWord.toLowerCase()}|${derivativeMeaning.toLowerCase()}`;
            if (derivativeKeys.has(derivativeKey)) continue;
            derivativeKeys.add(derivativeKey);

            derivatives.push({
                word: derivativeWord,
                meaning: derivativeMeaning,
            });
        }

        const mapped = {
            bookKey,
            chapter: 'DAY',
            toc: buildDayLabel(index),
            word: baseWord,
            meaning: getCsvField(row, DAY_MEANING_KEYS),
            derivatives,
        };

        mapped.cardId = buildCardId(mapped);
        return mapped;
    }).filter(Boolean);
};

const mapEtymologyRows = (rows) => {
    return (rows || []).map((row) => {
        const word = getCsvField(row, ETY_WORD_KEYS);
        if (!word) return null;

        const mapped = {
            bookKey: 'etymology',
            chapter: getCsvField(row, ETY_CHAPTER_KEYS),
            toc: getCsvField(row, ETY_TOC_KEYS),
            word,
            meaning: getCsvField(row, ETY_MEANING_KEYS),
            derivatives: [],
        };
        mapped.cardId = buildCardId(mapped);
        return mapped;
    }).filter(Boolean);
};

const mapBookRows = (bookKey, parsedRows) => {
    if (bookKey === 'etymology') return mapEtymologyRows(parsedRows);
    return mapDayRowsToWords(bookKey, parsedRows);
};

const dedupeRowsByCardId = (rows) => {
    const dedupedMap = new Map();
    (rows || []).forEach((row) => {
        if (!row?.cardId) return;
        if (!dedupedMap.has(row.cardId)) {
            dedupedMap.set(row.cardId, row);
        }
    });
    return [...dedupedMap.values()];
};

const buildDataset = (bookKey, rows) => {
    const dedupedRows = dedupeRowsByCardId(rows);
    const wordsByToc = buildWordsByToc(dedupedRows);
    const tocs = Object.keys(wordsByToc);

    return {
        bookKey,
        rows: dedupedRows,
        wordsByToc,
        tocs,
    };
};

const expandEntries = (entries, bookKey, includeDerivatives) => {
    const expanded = [];

    (entries || []).forEach((entry) => {
        const baseWord = normalizeSpacingText(entry?.word);
        const baseMeaning = normalizeSpacingText(entry?.meaning);
        if (!baseWord) return;

        const baseEntry = {
            bookKey,
            chapter: normalizeSpacingText(entry?.chapter),
            toc: normalizeSpacingText(entry?.toc),
            word: baseWord,
            meaning: baseMeaning,
            isDerivative: false,
        };
        baseEntry.cardId = buildCardId(baseEntry);
        expanded.push(baseEntry);

        if (bookKey === 'etymology' || !includeDerivatives) return;

        (entry?.derivatives || []).forEach((derivative) => {
            const derivativeWord = normalizeSpacingText(derivative?.word);
            if (!derivativeWord) return;
            const derivativeEntry = {
                bookKey,
                chapter: normalizeSpacingText(entry?.chapter),
                toc: normalizeSpacingText(entry?.toc),
                word: derivativeWord,
                meaning: normalizeSpacingText(derivative?.meaning),
                isDerivative: true,
            };
            derivativeEntry.cardId = buildCardId(derivativeEntry);
            expanded.push(derivativeEntry);
        });
    });

    const dedupedMap = new Map();
    expanded.forEach((entry) => {
        if (!dedupedMap.has(entry.cardId)) {
            dedupedMap.set(entry.cardId, entry);
        }
    });

    return [...dedupedMap.values()];
};

export const loadBookDataset = async (bookKey) => {
    const normalizedBookKey = normalizeBookKey(bookKey);
    if (!normalizedBookKey) throw new Error(`지원되지 않는 교재입니다: ${bookKey}`);

    if (bookCache.has(normalizedBookKey)) {
        return bookCache.get(normalizedBookKey);
    }

    const csvPath = CSV_PATHS[normalizedBookKey];
    const response = await fetch(csvPath);
    if (!response.ok) throw new Error('CSV 파일을 불러오는 데 실패했습니다.');

    const csvText = (await response.text()).replace(/^\uFEFF/, '');
    const parsedRows = await parseCsvRows(csvText);
    const mappedRows = mapBookRows(normalizedBookKey, parsedRows);
    const dataset = buildDataset(normalizedBookKey, mappedRows);
    bookCache.set(normalizedBookKey, dataset);

    return dataset;
};

export const getAvailableChaptersForEtymology = async () => {
    const dataset = await loadBookDataset('etymology');
    const chapters = dataset.rows
        .map((row) => normalizeSpacingText(row.chapter))
        .filter(Boolean);

    const uniqueChapters = [...new Set(chapters)];
    return uniqueChapters.sort((a, b) => a.localeCompare(b, 'ko', { numeric: true }));
};

export const getTocsForChapter = async (chapterId) => {
    const dataset = await loadBookDataset('etymology');
    const normalizedChapterId = normalizeSpacingText(chapterId);

    const tocs = dataset.rows
        .filter((row) => normalizeSpacingText(row.chapter) === normalizedChapterId)
        .map((row) => normalizeSpacingText(row.toc))
        .filter(Boolean);

    return sortLabels([...new Set(tocs)]);
};

export const getDayTocs = async (bookKey) => {
    const normalizedBookKey = normalizeBookKey(bookKey);
    if (!normalizedBookKey || normalizedBookKey === 'etymology') return [];

    const dataset = await loadBookDataset(normalizedBookKey);
    const tocs = dataset.tocs.filter((toc) => /^DAY\s*\d{1,2}$/i.test(normalizeSpacingText(toc)));
    return sortDayLabels([...new Set(tocs)]);
};

export const getScopePool = async ({
    bookKey,
    chapterId,
    selectedTocs,
    includeDerivatives,
}) => {
    const normalizedBookKey = normalizeBookKey(bookKey);
    if (!normalizedBookKey) return [];

    const dataset = await loadBookDataset(normalizedBookKey);
    const normalizedChapterId = normalizeSpacingText(chapterId);
    const selectedTocSet = new Set((selectedTocs || []).map((toc) => normalizeSpacingText(toc)).filter(Boolean));

    let scopedEntries = [];

    if (normalizedBookKey === 'etymology') {
        if (selectedTocSet.size === 0) return [];
        scopedEntries = dataset.rows.filter((entry) => {
            if (normalizedChapterId && normalizeSpacingText(entry.chapter) !== normalizedChapterId) return false;
            if (!selectedTocSet.has(normalizeSpacingText(entry.toc))) return false;
            return true;
        });
    } else {
        if (selectedTocSet.size === 0) return [];
        scopedEntries = dataset.rows.filter((entry) => selectedTocSet.has(normalizeSpacingText(entry.toc)));
    }

    return expandEntries(scopedEntries, normalizedBookKey, Boolean(includeDerivatives));
};

export const getAllBookPool = async ({ bookKey, includeDerivatives }) => {
    const normalizedBookKey = normalizeBookKey(bookKey);
    if (!normalizedBookKey) return [];

    const dataset = await loadBookDataset(normalizedBookKey);
    return expandEntries(dataset.rows, normalizedBookKey, Boolean(includeDerivatives));
};

export const normalizeText = normalizeSpacingText;
