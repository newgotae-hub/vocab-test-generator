export interface VocabEntry {
  id: string;
  day: number;
  term: string;
  phonetic: string;
  appearanceRate: string;
  frequency: number | null;
  partOfSpeech: string;
  meaning: string;
  example: string;
  translation: string;
  rawText: string;
  page: number;
}

export interface VocabDeck {
  title: string;
  source: string;
  totalPages: number;
  totalDays: number;
  entries: VocabEntry[];
}

const ENTRY_START_PATTERN =
  /\b\d{4}\s+[A-Za-z][A-Za-z'’.&/-]*(?:\s+[A-Za-z][A-Za-z'’.&/-]*){0,3}\s+\[[^\]]+\]/gu;

const HEADER_PATTERN =
  /^(\d{4})\s+([A-Za-z][A-Za-z'’.&/-]*(?:\s+[A-Za-z][A-Za-z'’.&/-]*){0,3})\s+\[([^\]]+)\]\s+(\d+%)\s+출현확률\s+(\d+)\s+빈도수\s+(.+)$/u;

const EXAMPLE_PATTERN = /([A-Z][^가-힣]+?[.!?])/u;
const TRANSLATION_PATTERN = /^([^A-Za-z]+?[.!?])/u;

function normalizeText(text: string) {
  return text.replace(/\s+/g, " ").trim();
}

function inferDay(id: string, extractedDay: number | null) {
  if (extractedDay) {
    return extractedDay;
  }

  const numericId = Number(id);
  if (Number.isNaN(numericId) || numericId < 1) {
    return 1;
  }

  return Math.max(1, Math.ceil(numericId / 50));
}

function extractDay(text: string) {
  const matched = text.match(/DAY\s+(\d{2})/iu);
  return matched ? Number(matched[1]) : null;
}

function extractEntryBlocks(text: string) {
  const matches = [...text.matchAll(ENTRY_START_PATTERN)];

  if (!matches.length) {
    return [];
  }

  return matches.map((match, index) => {
    const start = match.index ?? 0;
    const end = matches[index + 1]?.index ?? text.length;
    return text.slice(start, end).trim();
  });
}

function parseEntryBlock(block: string, page: number, pageDay: number | null) {
  const headerMatch = block.match(HEADER_PATTERN);

  if (!headerMatch) {
    return null;
  }

  const [, id, term, phonetic, appearance, frequency, rest] = headerMatch;
  const exampleMatch = rest.match(EXAMPLE_PATTERN);
  const descriptor = exampleMatch ? rest.slice(0, exampleMatch.index).trim() : rest.trim();
  const example = exampleMatch?.[1].trim() ?? "";
  const afterExample = exampleMatch
    ? rest.slice((exampleMatch.index ?? 0) + example.length).trim()
    : "";
  const translationMatch = afterExample.match(TRANSLATION_PATTERN);
  const translation = translationMatch?.[1].trim() ?? "";
  const descriptorTokens = descriptor.split(" ").filter(Boolean);
  const partOfSpeech = descriptorTokens[0] ?? "";
  const meaning = descriptor.slice(partOfSpeech.length).trim();

  return {
    id,
    day: inferDay(id, pageDay),
    term,
    phonetic,
    appearanceRate: appearance,
    frequency: Number(frequency),
    partOfSpeech,
    meaning,
    example,
    translation,
    rawText: block,
    page,
  } satisfies VocabEntry;
}

export async function parseVocabularyPdf(
  buffer: ArrayBuffer,
  onProgress?: (currentPage: number, totalPages: number) => void,
) {
  const { getDocument } = await import("pdfjs-dist/legacy/build/pdf.mjs");

  const loadingTask = getDocument({
    data: new Uint8Array(buffer),
    disableWorker: true,
    useSystemFonts: true,
  } as unknown as Parameters<typeof getDocument>[0]);

  const pdf = await loadingTask.promise;
  const entries = new Map<string, VocabEntry>();

  for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
    const page = await pdf.getPage(pageNumber);
    const textContent = await page.getTextContent();
    const text = normalizeText(
      textContent.items.map((item) => ("str" in item ? item.str : "")).join(" "),
    );

    if (!text) {
      continue;
    }

    const blocks = extractEntryBlocks(text);
    const pageDay = extractDay(text);

    for (const block of blocks) {
      const parsed = parseEntryBlock(block, pageNumber, pageDay);

      if (!parsed || entries.has(parsed.id)) {
        continue;
      }

      entries.set(parsed.id, parsed);
    }

    if (onProgress && (pageNumber === pdf.numPages || pageNumber % 8 === 0)) {
      onProgress(pageNumber, pdf.numPages);
    }
  }

  const sortedEntries = [...entries.values()].sort((left, right) => Number(left.id) - Number(right.id));
  const totalDays = sortedEntries.reduce((highestDay, entry) => Math.max(highestDay, entry.day), 1);

  return {
    title: "평가원 VOCA BASIC",
    source: "sample-vocab.pdf",
    totalPages: pdf.numPages,
    totalDays,
    entries: sortedEntries,
  } satisfies VocabDeck;
}

export function createFallbackDeck() {
  return {
    title: "평가원 VOCA BASIC",
    source: "fallback",
    totalPages: 0,
    totalDays: 1,
    entries: [
      {
        id: "0001",
        day: 1,
        term: "the",
        phonetic: "ðə",
        appearanceRate: "100%",
        frequency: 14082,
        partOfSpeech: "관",
        meaning: "그 (특정한 사람·사물 지칭)",
        example: "The book on the table is mine.",
        translation: "책상 위에 있는 책은 내 것이다.",
        rawText: "",
        page: 2,
      },
      {
        id: "0002",
        day: 1,
        term: "be",
        phonetic: "biː",
        appearanceRate: "100%",
        frequency: 9120,
        partOfSpeech: "동",
        meaning: "존재하다, 있다, ~이다",
        example: "I will be there in five minutes.",
        translation: "5분 안에 거기 있을게.",
        rawText: "",
        page: 2,
      },
      {
        id: "0003",
        day: 1,
        term: "of",
        phonetic: "ʌv",
        appearanceRate: "100%",
        frequency: 7896,
        partOfSpeech: "전",
        meaning: "~의, ~로부터",
        example: "This is a picture of my family.",
        translation: "이것은 우리 가족 사진이다.",
        rawText: "",
        page: 2,
      },
      {
        id: "0004",
        day: 1,
        term: "a",
        phonetic: "ə",
        appearanceRate: "100%",
        frequency: 7768,
        partOfSpeech: "관",
        meaning: "하나의, 어떤",
        example: "She adopted a cat from the shelter.",
        translation: "그녀는 보호소에서 고양이를 입양했다.",
        rawText: "",
        page: 2,
      },
      {
        id: "0005",
        day: 1,
        term: "to",
        phonetic: "tuː",
        appearanceRate: "100%",
        frequency: 7683,
        partOfSpeech: "전",
        meaning: "~로, ~에게",
        example: "We need to talk to the teacher.",
        translation: "우리는 선생님과 이야기할 필요가 있다.",
        rawText: "",
        page: 2,
      },
      {
        id: "0006",
        day: 1,
        term: "and",
        phonetic: "ænd",
        appearanceRate: "100%",
        frequency: 6170,
        partOfSpeech: "접",
        meaning: "그리고, 그러면",
        example: "He likes apples and bananas.",
        translation: "그는 사과와 바나나를 좋아한다.",
        rawText: "",
        page: 2,
      },
      {
        id: "0007",
        day: 1,
        term: "in",
        phonetic: "ɪn",
        appearanceRate: "100%",
        frequency: 5087,
        partOfSpeech: "전",
        meaning: "~안에, ~중에, ~뒤에",
        example: "They live in a small village.",
        translation: "그들은 작은 마을에 산다.",
        rawText: "",
        page: 2,
      },
      {
        id: "0008",
        day: 1,
        term: "that",
        phonetic: "ðæt",
        appearanceRate: "100%",
        frequency: 3297,
        partOfSpeech: "대",
        meaning: "그것, 저것",
        example: "That dress looks beautiful on you.",
        translation: "그 드레스가 네게 잘 어울린다.",
        rawText: "",
        page: 2,
      },
    ],
  } satisfies VocabDeck;
}
