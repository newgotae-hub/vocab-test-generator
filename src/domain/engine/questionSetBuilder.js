import { normalizeText } from '/src/domain/data/vocabRepository.js';
import { buildChoices } from '/src/domain/engine/distractorBuilder.js';

const MAX_QUESTION_COUNT = 200;

const shuffle = (items) => {
    const list = [...items];
    for (let i = list.length - 1; i > 0; i -= 1) {
        const j = Math.floor(Math.random() * (i + 1));
        [list[i], list[j]] = [list[j], list[i]];
    }
    return list;
};

const canBuildDirection = (entry, direction) => {
    if (direction === 'K2E') {
        return Boolean(normalizeText(entry?.meaning) && normalizeText(entry?.word));
    }
    return Boolean(normalizeText(entry?.word) && normalizeText(entry?.meaning));
};

const resolveDirection = (entry, examType) => {
    if (examType === 'K2E') {
        return canBuildDirection(entry, 'K2E') ? 'K2E' : '';
    }

    if (examType === 'E2K') {
        return canBuildDirection(entry, 'E2K') ? 'E2K' : '';
    }

    const available = ['E2K', 'K2E'].filter((direction) => canBuildDirection(entry, direction));
    if (available.length === 0) return '';
    if (available.length === 1) return available[0];
    return Math.random() < 0.5 ? 'E2K' : 'K2E';
};

const buildPrompt = (entry, direction) => {
    return direction === 'K2E' ? normalizeText(entry?.meaning) : normalizeText(entry?.word);
};

const buildCorrectAnswer = (entry, direction) => {
    return direction === 'K2E' ? normalizeText(entry?.word) : normalizeText(entry?.meaning);
};

export const buildQuestionSet = ({
    scopePool,
    bookPool,
    examType,
    questionCount,
    shuffleQuestions,
}) => {
    const normalizedExamType = ['E2K', 'K2E', 'MIXED'].includes(examType) ? examType : 'E2K';

    const deduped = [];
    const seenCardIds = new Set();
    (scopePool || []).forEach((entry) => {
        if (!entry?.cardId || seenCardIds.has(entry.cardId)) return;
        seenCardIds.add(entry.cardId);
        deduped.push(entry);
    });

    const targetCount = Math.min(
        MAX_QUESTION_COUNT,
        Math.max(1, Number.parseInt(questionCount, 10) || deduped.length),
    );
    const shouldRandomSample = targetCount < deduped.length;
    const orderedCandidates = (shuffleQuestions || shouldRandomSample) ? shuffle(deduped) : [...deduped];

    const questions = [];

    for (const entry of orderedCandidates) {
        if (questions.length >= targetCount) break;

        const direction = resolveDirection(entry, normalizedExamType);
        if (!direction) continue;

        const prompt = buildPrompt(entry, direction);
        const correctAnswer = buildCorrectAnswer(entry, direction);
        if (!prompt || !correctAnswer) continue;

        const choices = buildChoices({
            questionEntry: entry,
            direction,
            scopePool: scopePool || [],
            bookPool: bookPool || [],
            choiceCount: 10,
        }).filter((choice) => normalizeText(choice.text));

        if (choices.length === 0) continue;

        questions.push({
            questionId: `q-${questions.length + 1}-${entry.cardId}`,
            cardId: entry.cardId,
            bookKey: entry.bookKey,
            chapter: entry.chapter,
            toc: entry.toc,
            word: normalizeText(entry.word),
            meaning: normalizeText(entry.meaning),
            direction,
            prompt,
            correctAnswer,
            choices,
        });
    }

    return questions;
};
