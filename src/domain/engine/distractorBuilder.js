import { normalizeText } from '/src/domain/data/vocabRepository.js';

const shuffle = (items) => {
    const list = [...items];
    for (let i = list.length - 1; i > 0; i -= 1) {
        const j = Math.floor(Math.random() * (i + 1));
        [list[i], list[j]] = [list[j], list[i]];
    }
    return list;
};

const getDisplayedText = (entry, direction) => {
    if (direction === 'K2E') return normalizeText(entry?.word);
    return normalizeText(entry?.meaning);
};

export const buildChoices = ({
    questionEntry,
    direction,
    scopePool,
    bookPool,
    choiceCount = 10,
}) => {
    const safeChoiceCount = Math.max(1, Number.parseInt(choiceCount, 10) || 10);
    const correctText = getDisplayedText(questionEntry, direction);
    const correctNorm = normalizeText(correctText);

    const seen = new Set();
    const distractorTexts = [];

    const collectFromPool = (pool) => {
        const candidates = shuffle(pool || []);
        for (const candidate of candidates) {
            if (distractorTexts.length >= safeChoiceCount - 1) break;
            if (!candidate || candidate.cardId === questionEntry.cardId) continue;

            const text = getDisplayedText(candidate, direction);
            const normalized = normalizeText(text);
            if (!normalized || normalized === correctNorm || seen.has(normalized)) continue;

            seen.add(normalized);
            distractorTexts.push(text);
        }
    };

    collectFromPool(scopePool);
    if (distractorTexts.length < safeChoiceCount - 1) {
        collectFromPool(bookPool);
    }

    const options = [
        {
            id: `opt-${questionEntry.cardId}-correct`,
            text: correctText,
            isCorrect: true,
        },
        ...distractorTexts.map((text, index) => ({
            id: `opt-${questionEntry.cardId}-d-${index}`,
            text,
            isCorrect: false,
        })),
    ];

    return shuffle(options).map((option, index) => ({
        ...option,
        index,
    }));
};
