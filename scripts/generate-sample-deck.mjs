import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";

const entryStartPattern =
  /\b\d{4}\s+[A-Za-z][A-Za-z'’.&/-]*(?:\s+[A-Za-z][A-Za-z'’.&/-]*){0,3}\s+\[[^\]]+\]/gu;
const headerPattern =
  /^(\d{4})\s+([A-Za-z][A-Za-z'’.&/-]*(?:\s+[A-Za-z][A-Za-z'’.&/-]*){0,3})\s+\[([^\]]+)\]\s+(\d+%)\s+출현확률\s+(\d+)\s+빈도수\s+(.+)$/u;
const examplePattern = /([A-Z][^가-힣]+?[.!?])/u;
const translationPattern = /^([^A-Za-z]+?[.!?])/u;

function normalizeText(text) {
  return text.replace(/\s+/g, " ").trim();
}

function extractDay(text) {
  const matched = text.match(/DAY\s+(\d{2})/iu);
  return matched ? Number(matched[1]) : null;
}

function inferDay(id, extractedDay) {
  if (extractedDay) {
    return extractedDay;
  }

  const numericId = Number(id);
  if (Number.isNaN(numericId) || numericId < 1) {
    return 1;
  }

  return Math.max(1, Math.ceil(numericId / 50));
}

function extractEntryBlocks(text) {
  const matches = [...text.matchAll(entryStartPattern)];

  if (!matches.length) {
    return [];
  }

  return matches.map((match, index) => {
    const start = match.index ?? 0;
    const end = matches[index + 1]?.index ?? text.length;
    return text.slice(start, end).trim();
  });
}

function parseEntryBlock(block, page, pageDay) {
  const headerMatch = block.match(headerPattern);

  if (!headerMatch) {
    return null;
  }

  const [, id, term, phonetic, appearanceRate, frequency, rest] = headerMatch;
  const exampleMatch = rest.match(examplePattern);
  const descriptor = exampleMatch ? rest.slice(0, exampleMatch.index).trim() : rest.trim();
  const example = exampleMatch?.[1].trim() ?? "";
  const afterExample = exampleMatch
    ? rest.slice((exampleMatch.index ?? 0) + example.length).trim()
    : "";
  const translationMatch = afterExample.match(translationPattern);
  const translation = translationMatch?.[1].trim() ?? "";
  const descriptorTokens = descriptor.split(" ").filter(Boolean);
  const partOfSpeech = descriptorTokens[0] ?? "";
  const meaning = descriptor.slice(partOfSpeech.length).trim();

  return {
    id,
    day: inferDay(id, pageDay),
    term,
    phonetic,
    appearanceRate,
    frequency: Number(frequency),
    partOfSpeech,
    meaning,
    example,
    translation,
    rawText: block,
    page,
  };
}

async function main() {
  const cwd = process.cwd();
  const pdfPath = join(cwd, "public", "source", "sample-vocab.pdf");
  const outputPath = join(cwd, "src", "data", "sample-deck.json");
  const data = new Uint8Array(readFileSync(pdfPath));
  const loadingTask = getDocument({
    data,
    disableWorker: true,
    useSystemFonts: true,
  });
  const pdf = await loadingTask.promise;
  const entries = new Map();

  for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
    const page = await pdf.getPage(pageNumber);
    const textContent = await page.getTextContent();
    const text = normalizeText(
      textContent.items.map((item) => ("str" in item ? item.str : "")).join(" "),
    );

    if (!text) {
      continue;
    }

    const pageDay = extractDay(text);
    const blocks = extractEntryBlocks(text);

    for (const block of blocks) {
      const parsed = parseEntryBlock(block, pageNumber, pageDay);
      if (!parsed || entries.has(parsed.id)) {
        continue;
      }
      entries.set(parsed.id, parsed);
    }
  }

  const sortedEntries = [...entries.values()].sort((left, right) => Number(left.id) - Number(right.id));
  const totalDays = sortedEntries.reduce((highestDay, entry) => Math.max(highestDay, entry.day), 1);
  const deck = {
    title: "평가원 VOCA BASIC",
    source: "bundled-sample",
    totalPages: pdf.numPages,
    totalDays,
    entries: sortedEntries,
  };

  mkdirSync(dirname(outputPath), { recursive: true });
  writeFileSync(outputPath, JSON.stringify(deck, null, 2));
  console.log(`generated ${sortedEntries.length} entries -> ${outputPath}`);
}

await main();
