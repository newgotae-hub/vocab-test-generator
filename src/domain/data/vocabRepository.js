const BOOK_KEYS = ['etymology', 'basic', 'advanced'];
const CSV_PATHS = {
    etymology: '/data/root.csv',
    basic: '/data/DB-basic.csv',
    advanced: '/data/DB-advanced.csv',
};

const bookCache = new Map();

const normalizeSpacingText = (value) => String(value || '').replace(/\s+/g, ' ').trim();

const normalizeBookKey = (bookKey) => {
    const normalized = normalizeSpacingText(bookKey).toLowerCase();
    return BOOK_KEYS.includes(normalized) ? normalized : '';
};

const getCsvField = (row, key) => {
    if (!row || typeof row !== 'object') return '';
    return row[key] ?? row[`﻿${key}`] ?? '';
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

        const derivatives = [];
        for (let i = 1; i <= 6; i += 1) {
            const derivativeWord = normalizeSpacingText(getCsvField(row, `파생어${i}`));
            if (!derivativeWord) continue;
            derivatives.push({
                word: derivativeWord,
                meaning: normalizeSpacingText(getCsvField(row, `파생어${i} 뜻`)),
            });
        }

        const mapped = {
            bookKey,
            chapter: 'DAY',
            toc: buildDayLabel(index),
            word: normalizeSpacingText(getCsvField(row, '단어')),
            meaning: normalizeSpacingText(getCsvField(row, '의미')),
            derivatives,
        };

        mapped.cardId = buildCardId(mapped);
        return mapped;
    }).filter(Boolean);
};

const mapEtymologyRows = (rows) => {
    return (rows || []).map((row) => {
        const mapped = {
            bookKey: 'etymology',
            chapter: normalizeSpacingText(row.chapter),
            toc: normalizeSpacingText(row.toc),
            word: normalizeSpacingText(row.word),
            meaning: normalizeSpacingText(row.meaning),
            derivatives: [],
        };
        mapped.cardId = buildCardId(mapped);
        return mapped;
    });
};

const mapBookRows = (bookKey, parsedRows) => {
    if (bookKey === 'etymology') return mapEtymologyRows(parsedRows);
    return mapDayRowsToWords(bookKey, parsedRows);
};

const buildDataset = (bookKey, rows) => {
    const wordsByToc = buildWordsByToc(rows);
    const tocs = Object.keys(wordsByToc);

    return {
        bookKey,
        rows,
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
