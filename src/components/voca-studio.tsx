"use client";

import { startTransition, useDeferredValue, useEffect, useState } from "react";
import dbData from "@/data/vocab-db.json";
import { getCollection, type CollectionId, type ViewMode, type VocabDatabase, type VocabRecord } from "@/lib/vocab-db";

type GroupFilter = "all" | string;

interface QuizQuestion {
  prompt: VocabRecord;
  options: VocabRecord[];
}

interface PersistedState {
  activeCollectionId: CollectionId;
  activeGroupId: GroupFilter;
  currentIndex: number;
  favorites: string[];
  mastered: string[];
  viewMode: ViewMode;
}

const STORAGE_KEY = "voca-atelier-state-v3";
const DAILY_TARGET = 24;
const database = dbData as VocabDatabase;

const copy = {
  basic: {
    badge: "Basic 3000",
    title: "기본편을 하루 100단어 템포로 재구성한 코어 트랙",
    note: "기본 교재 흐름을 유지하면서 앱답게 빠르게 회전합니다.",
  },
  advanced: {
    badge: "Advanced 1500",
    title: "고난도 단어를 짧은 세트로 반복하는 확장 트랙",
    note: "50단어 세트 기준으로 밀도 있게 복습합니다.",
  },
  etymology: {
    badge: "Etymology 1741",
    title: "어근과 챕터 흐름까지 함께 기억하는 루트 트랙",
    note: "챕터와 root cue를 함께 보며 묶음으로 암기합니다.",
  },
} satisfies Record<CollectionId, { badge: string; title: string; note: string }>;

function cn(...parts: Array<string | false | null | undefined>) {
  return parts.filter(Boolean).join(" ");
}

function toLookup(values: string[]) {
  const lookup: Record<string, true> = {};
  for (const value of values) {
    lookup[value] = true;
  }
  return lookup;
}

function loadPersistedState(): PersistedState {
  if (typeof window === "undefined") {
    return {
      activeCollectionId: "basic",
      activeGroupId: "all",
      currentIndex: 0,
      favorites: [],
      mastered: [],
      viewMode: "focus",
    };
  }

  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return {
        activeCollectionId: "basic",
        activeGroupId: "all",
        currentIndex: 0,
        favorites: [],
        mastered: [],
        viewMode: "focus",
      };
    }

    return JSON.parse(raw) as PersistedState;
  } catch {
    window.localStorage.removeItem(STORAGE_KEY);
    return {
      activeCollectionId: "basic",
      activeGroupId: "all",
      currentIndex: 0,
      favorites: [],
      mastered: [],
      viewMode: "focus",
    };
  }
}

function random(seed: number) {
  const value = Math.sin(seed) * 10000;
  return value - Math.floor(value);
}

function shuffle(records: VocabRecord[], seed = 1) {
  const copied = [...records];
  for (let index = copied.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(random(seed + index) * (index + 1));
    [copied[index], copied[swapIndex]] = [copied[swapIndex], copied[index]];
  }
  return copied;
}

function buildQuiz(pool: VocabRecord[], seed: number) {
  if (!pool.length) {
    return null;
  }

  const prompt = pool[Math.floor(random(seed + pool.length) * pool.length)];
  const options = [prompt];
  for (const candidate of shuffle(pool.filter((entry) => entry.id !== prompt.id), seed + 11)) {
    if (options.some((entry) => entry.meaning === candidate.meaning)) {
      continue;
    }
    options.push(candidate);
    if (options.length === Math.min(4, pool.length)) {
      break;
    }
  }

  return { prompt, options: shuffle(options, seed + 23) } satisfies QuizQuestion;
}

function SparkIcon() {
  return (
    <svg aria-hidden="true" className="h-4 w-4 text-accent" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.6">
      <path d="M12 2l1.8 5.2L19 9l-5.2 1.8L12 16l-1.8-5.2L5 9l5.2-1.8L12 2z" />
    </svg>
  );
}

function HeartIcon({ filled }: { filled?: boolean }) {
  return (
    <svg aria-hidden="true" className="h-4 w-4" fill={filled ? "currentColor" : "none"} viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.7">
      <path d="M12 20.5l-1.1-.9C5.3 15 2 12.1 2 8.5 2 5.6 4.3 3.5 7.2 3.5c1.6 0 3.1.7 4.1 2 1-1.3 2.5-2 4.1-2C18.7 3.5 21 5.6 21 8.5c0 3.6-3.3 6.5-8.9 11.1L12 20.5z" />
    </svg>
  );
}

export function VocaStudio() {
  const [persistedState] = useState<PersistedState>(() => loadPersistedState());
  const [activeCollectionId, setActiveCollectionId] = useState<CollectionId>(persistedState.activeCollectionId);
  const [activeGroupId, setActiveGroupId] = useState<GroupFilter>(persistedState.activeGroupId);
  const [currentIndex, setCurrentIndex] = useState(persistedState.currentIndex);
  const [showBack, setShowBack] = useState(false);
  const [viewMode, setViewMode] = useState<ViewMode>(persistedState.viewMode);
  const [search, setSearch] = useState("");
  const [favorites, setFavorites] = useState<Record<string, true>>(() => toLookup(persistedState.favorites));
  const [mastered, setMastered] = useState<Record<string, true>>(() => toLookup(persistedState.mastered));
  const [sessionSeen, setSessionSeen] = useState<Record<string, true>>({});
  const [quizRound, setQuizRound] = useState(0);
  const [quizChoice, setQuizChoice] = useState<string | null>(null);
  const query = useDeferredValue(search).trim().toLowerCase();

  const collection = getCollection(database, activeCollectionId);
  const groups = [...collection.groups].sort((left, right) => left.index - right.index);
  const resolvedGroupId =
    activeGroupId === "all" || groups.some((group) => group.id === activeGroupId) ? activeGroupId : "all";
  const filtered = collection.records.filter((record) => {
    const matchesGroup = resolvedGroupId === "all" || record.groupId === resolvedGroupId;
    return matchesGroup && (!query || record.searchText.includes(query));
  });
  const safeCurrentIndex = filtered.length ? Math.min(currentIndex, filtered.length - 1) : 0;
  const current = filtered[safeCurrentIndex] ?? null;
  const quizPool = filtered.length >= 4 ? filtered : collection.records;
  const quizQuestion = buildQuiz(quizPool, quizRound);
  const masteredCount = collection.records.filter((record) => mastered[record.id]).length;
  const favoriteCount = collection.records.filter((record) => favorites[record.id]).length;
  const seenCount = collection.records.filter((record) => sessionSeen[record.id]).length;
  const masteryRate = collection.totalRecords ? Math.round((masteredCount / collection.totalRecords) * 100) : 0;

  function remember(id: string) {
    setSessionSeen((previous) => (previous[id] ? previous : { ...previous, [id]: true }));
  }

  function selectCollection(id: CollectionId) {
    startTransition(() => {
      setActiveCollectionId(id);
      setActiveGroupId("all");
      setCurrentIndex(0);
      setShowBack(false);
      setViewMode("focus");
      setSearch("");
      setQuizChoice(null);
      setQuizRound(0);
    });
  }

  function moveCard(direction: -1 | 1) {
    if (!filtered.length) {
      return;
    }
    const focus = filtered[safeCurrentIndex] ?? filtered[0];
    remember(focus.id);
    setShowBack(false);
    setCurrentIndex(() => {
      const next = safeCurrentIndex + direction;
      if (next < 0) {
        return filtered.length - 1;
      }
      if (next >= filtered.length) {
        return 0;
      }
      return next;
    });
  }

  function toggleFavorite(id: string) {
    setFavorites((previous) => {
      if (previous[id]) {
        const next = { ...previous };
        delete next[id];
        return next;
      }
      return { ...previous, [id]: true };
    });
  }

  function markMastered(id: string) {
    remember(id);
    setMastered((previous) => ({ ...previous, [id]: true }));
  }

  function nextQuiz() {
    setQuizChoice(null);
    setQuizRound((previous) => previous + 1);
  }

  useEffect(() => {
    const snapshot: PersistedState = {
      activeCollectionId,
      activeGroupId: resolvedGroupId,
      currentIndex: safeCurrentIndex,
      favorites: Object.keys(favorites),
      mastered: Object.keys(mastered),
      viewMode,
    };
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(snapshot));
  }, [activeCollectionId, favorites, mastered, resolvedGroupId, safeCurrentIndex, viewMode]);

  return (
    <main className="relative overflow-hidden">
      <div className="mx-auto flex min-h-screen w-full max-w-7xl flex-col gap-6 px-4 py-5 sm:px-6 lg:px-8 lg:py-8">
        <section className="grid items-start gap-6 lg:grid-cols-[1.02fr_0.98fr]">
          <div className="flex flex-col gap-4">
            <div className="glass-panel rise-in rounded-[36px] p-6 sm:p-7 lg:p-8">
              <div className="flex flex-wrap items-center justify-between gap-3 text-[11px] uppercase tracking-[0.32em] text-zinc-500">
                <span className="rounded-full border border-white/70 bg-white/45 px-3 py-2">Apps in Toss Target</span>
                <span>DB Sync · Quiz · Review</span>
              </div>
              <div className="mt-6 flex items-center gap-3 text-xs uppercase tracking-[0.28em] text-zinc-500">
                <span className="rounded-full border border-white/70 bg-white/52 px-3 py-1.5 font-semibold text-zinc-700">
                  {copy[activeCollectionId].badge}
                </span>
                <span>{collection.name}</span>
              </div>
              <h1 className="font-display mt-4 max-w-3xl text-5xl leading-[0.92] text-zinc-950 sm:text-6xl lg:text-7xl">
                단어 교재를
                <br />
                앱 퀄리티로 다시.
              </h1>
              <p className="mt-5 max-w-2xl text-sm leading-7 text-zinc-600 sm:text-base">
                {copy[activeCollectionId].title} 지금은 세 개의 교재 DB를 정적 JSON으로 고정해, 실제 실행과 검증을 반복할 수 있는 학습 앱
                루프로 만들고 있습니다.
              </p>
              <div className="mt-8 grid gap-3 sm:grid-cols-3">
                {[
                  ["Total DB", `${database.totalRecords.toLocaleString()} entries bundled`],
                  ["Current Track", copy[activeCollectionId].note],
                  ["Local Progress", "즐겨찾기, 마스터 상태, 현재 위치를 브라우저에 저장합니다."],
                ].map(([title, body]) => (
                  <div key={title} className="rounded-[28px] border border-white/70 bg-white/52 p-4">
                    <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.22em] text-zinc-500">
                      <SparkIcon />
                      {title}
                    </div>
                    <p className="mt-3 text-sm leading-6 text-zinc-600">{body}</p>
                  </div>
                ))}
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-3">
              {[
                ["Loaded", `${collection.totalRecords.toLocaleString()} words`, collection.subtitle],
                ["Mastery", `${masteryRate}%`, `${masteredCount.toLocaleString()} mastered`],
                ["Today", `${seenCount}/${DAILY_TARGET}`, `${favoriteCount.toLocaleString()} saved`],
              ].map(([label, value, detail]) => (
                <div key={label} className="glass-panel rounded-[30px] p-5">
                  <p className="text-xs uppercase tracking-[0.24em] text-zinc-500">{label}</p>
                  <p className="mt-3 text-2xl font-semibold tracking-tight text-zinc-950">{value}</p>
                  <p className="mt-1 text-sm text-zinc-500">{detail}</p>
                </div>
              ))}
            </div>

            <div className="glass-panel rounded-[34px] p-5 sm:p-6">
              <p className="text-xs uppercase tracking-[0.24em] text-zinc-500">Bundled Sources</p>
              <p className="mt-2 text-lg font-semibold text-zinc-950">{database.totalRecords.toLocaleString()} entries live in app</p>
              <p className="mt-1 text-sm text-zinc-500">생성 시각 {new Date(database.generatedAt).toLocaleString("ko-KR")}</p>
              <div className="mt-5 grid gap-3 sm:grid-cols-3">
                {database.sources.map((source) => (
                  <div key={source.id} className="rounded-[28px] border border-white/75 bg-white/52 p-4">
                    <p className="text-xs uppercase tracking-[0.24em] text-zinc-500">{source.label}</p>
                    <p className="mt-3 text-xl font-semibold text-zinc-950">{source.records.toLocaleString()}</p>
                    <p className="mt-1 text-sm text-zinc-500">{source.path.split("\\").at(-1)}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className="relative">
            <div className="absolute inset-6 -z-10 rounded-[44px] bg-white/45 blur-3xl" />
            <div className="phone-shell rise-in mx-auto max-w-[430px] rounded-[42px] p-3">
              <div className="overflow-hidden rounded-[34px] border border-black/5 bg-[linear-gradient(180deg,rgba(255,255,255,0.92),rgba(240,243,247,0.72))] px-4 pb-[calc(1rem+env(safe-area-inset-bottom))] pt-[calc(1rem+env(safe-area-inset-top))]">
                <div className="flex items-center justify-between text-[11px] uppercase tracking-[0.26em] text-zinc-500">
                  <span>Voca Atelier</span>
                  <span>{resolvedGroupId === "all" ? "All Groups" : groups.find((group) => group.id === resolvedGroupId)?.label}</span>
                </div>

                <div className="soft-scrollbar mt-4 flex gap-2 overflow-x-auto pb-1">
                  {(database.collections.map((item) => item.id) as CollectionId[]).map((id) => (
                    <button
                      key={id}
                      type="button"
                      onClick={() => selectCollection(id)}
                      className={cn(
                        "shrink-0 rounded-full px-3.5 py-2 text-xs font-medium transition",
                        activeCollectionId === id ? "bg-zinc-950 text-white" : "border border-white/70 bg-white/60 text-zinc-600",
                      )}
                    >
                      {copy[id].badge}
                    </button>
                  ))}
                </div>

                <div className="mt-4 flex items-center justify-between">
                  <div>
                    <p className="text-xs uppercase tracking-[0.24em] text-zinc-500">Current Scope</p>
                    <p className="mt-1 text-xl font-semibold tracking-tight text-zinc-950">{collection.name}</p>
                  </div>
                  <div className="rounded-[24px] border border-white/75 bg-white/75 px-3 py-2 text-right">
                    <p className="text-[10px] uppercase tracking-[0.24em] text-zinc-500">Progress</p>
                    <p className="mt-1 text-sm font-semibold text-zinc-950">{filtered.length ? `${safeCurrentIndex + 1}/${filtered.length}` : "0/0"}</p>
                  </div>
                </div>

                <div className="soft-scrollbar mt-4 flex gap-2 overflow-x-auto pb-1">
                  <button
                    type="button"
                    onClick={() => {
                      setActiveGroupId("all");
                      setCurrentIndex(0);
                      setShowBack(false);
                      setQuizChoice(null);
                      setQuizRound((previous) => previous + 1);
                    }}
                    className={cn(
                      "shrink-0 rounded-full px-3.5 py-2 text-xs font-medium transition",
                      resolvedGroupId === "all" ? "bg-zinc-950 text-white" : "border border-white/70 bg-white/60 text-zinc-600",
                    )}
                  >
                    All
                  </button>
                  {groups.map((group) => (
                    <button
                      key={group.id}
                      type="button"
                      onClick={() => {
                        setActiveGroupId(group.id);
                        setCurrentIndex(0);
                        setShowBack(false);
                        setQuizChoice(null);
                        setQuizRound((previous) => previous + 1);
                      }}
                      className={cn(
                        "shrink-0 rounded-full px-3.5 py-2 text-xs font-medium transition",
                        resolvedGroupId === group.id ? "bg-zinc-950 text-white" : "border border-white/70 bg-white/60 text-zinc-600",
                      )}
                    >
                      {group.label}
                    </button>
                  ))}
                </div>

                <div className="mt-4 grid grid-cols-3 gap-2 rounded-[24px] border border-white/80 bg-white/58 p-1.5">
                  {(["focus", "quiz", "library"] as ViewMode[]).map((mode) => (
                    <button
                      key={mode}
                      type="button"
                      onClick={() => {
                        setViewMode(mode);
                        setShowBack(false);
                        if (mode === "quiz") {
                          nextQuiz();
                        }
                      }}
                      className={cn(
                        "rounded-[20px] px-3 py-2.5 text-sm font-medium transition",
                        viewMode === mode ? "bg-zinc-950 text-white" : "text-zinc-500",
                      )}
                    >
                      {mode === "focus" ? "Focus" : mode === "quiz" ? "Quiz" : "Library"}
                    </button>
                  ))}
                </div>

                {viewMode === "focus" && current ? (
                  <div className="mt-4 space-y-4">
                    <button
                      type="button"
                      onClick={() => {
                        remember(current.id);
                        setShowBack((previous) => !previous);
                      }}
                      className="w-full text-left"
                    >
                      <div className={cn("card-flip min-h-[390px]", showBack && "is-back")}>
                        <article className="card-face absolute inset-0 glass-panel rounded-[32px] p-5">
                          <div className="flex items-center justify-between">
                            <div className="rounded-full border border-accent/10 bg-accent-soft px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.24em] text-accent">
                              {current.groupLabel}
                            </div>
                            <button
                              type="button"
                              onClick={(event) => {
                                event.stopPropagation();
                                toggleFavorite(current.id);
                              }}
                              className={cn(
                                "grid h-10 w-10 place-items-center rounded-full border transition",
                                favorites[current.id] ? "border-transparent bg-zinc-950 text-white" : "border-zinc-900/10 bg-white/76 text-zinc-500",
                              )}
                            >
                              <HeartIcon filled={Boolean(favorites[current.id])} />
                            </button>
                          </div>
                          <div className="mt-10">
                            <p className="text-[11px] uppercase tracking-[0.3em] text-zinc-500">Word</p>
                            <h2 className="font-display mt-4 text-5xl leading-none tracking-tight text-zinc-950">{current.term}</h2>
                          </div>
                          <div className="mt-12 rounded-[28px] border border-white/80 bg-white/62 p-4">
                            <div className="flex items-center justify-between text-sm text-zinc-500">
                              <span>Collection</span>
                              <span className="font-semibold text-zinc-900">{collection.name}</span>
                            </div>
                            <div className="mt-3 flex items-center justify-between text-sm text-zinc-500">
                              <span>Derivatives</span>
                              <span className="font-semibold text-zinc-900">{current.derivatives.length}</span>
                            </div>
                          </div>
                        </article>

                        <article className="card-face card-face-back absolute inset-0 glass-panel rounded-[32px] p-5">
                          <p className="text-[11px] uppercase tracking-[0.3em] text-zinc-500">Meaning</p>
                          <div className="mt-6 rounded-[28px] border border-white/80 bg-white/66 p-4">
                            <p className="text-lg font-semibold leading-7 text-zinc-950">{current.meaning}</p>
                          </div>
                          <div className="mt-4 rounded-[28px] border border-white/80 bg-white/66 p-4">
                            <p className="text-xs uppercase tracking-[0.24em] text-zinc-500">Linked forms</p>
                            {current.derivatives.length ? (
                              <div className="mt-3 space-y-2.5">
                                {current.derivatives.slice(0, 4).map((item, index) => (
                                  <div key={`${current.id}-${item.term}-${index}`} className="rounded-[20px] bg-white/80 px-3 py-2.5">
                                    <p className="text-sm font-semibold text-zinc-900">{item.term || "파생어"}</p>
                                    <p className="mt-1 text-sm text-zinc-500">{item.meaning || "뜻 정보 없음"}</p>
                                  </div>
                                ))}
                              </div>
                            ) : (
                              <p className="mt-3 text-sm leading-6 text-zinc-500">파생어가 없는 카드입니다. 의미와 묶음 정보로 기억을 고정해 주세요.</p>
                            )}
                          </div>
                          {current.chapter || current.root ? (
                            <div className="mt-4 rounded-[28px] border border-white/80 bg-white/66 p-4">
                              <p className="text-xs uppercase tracking-[0.24em] text-zinc-500">Chapter Cue</p>
                              <p className="mt-3 text-sm leading-6 text-zinc-900">
                                {current.chapter ?? ""}
                                {current.chapter && current.root ? " · " : ""}
                                {current.root ?? ""}
                              </p>
                            </div>
                          ) : null}
                        </article>
                      </div>
                    </button>

                    <div className="grid grid-cols-3 gap-2">
                      <button type="button" onClick={() => moveCard(-1)} className="rounded-[24px] border border-white/75 bg-white/65 px-3 py-3 text-sm font-medium text-zinc-700">
                        이전
                      </button>
                      <button type="button" onClick={() => markMastered(current.id)} className="rounded-[24px] bg-zinc-950 px-3 py-3 text-sm font-medium text-white">
                        학습 완료
                      </button>
                      <button type="button" onClick={() => moveCard(1)} className="rounded-[24px] border border-white/75 bg-white/65 px-3 py-3 text-sm font-medium text-zinc-700">
                        다음
                      </button>
                    </div>
                  </div>
                ) : null}

                {viewMode === "quiz" && quizQuestion ? (
                  <div className="mt-4 space-y-4">
                    <div className="glass-panel rounded-[32px] p-5">
                      <div className="flex items-center justify-between">
                        <p className="text-xs uppercase tracking-[0.24em] text-zinc-500">Quick Quiz</p>
                        <button type="button" onClick={nextQuiz} className="rounded-full border border-zinc-900/10 bg-white/72 px-3 py-1.5 text-xs font-medium text-zinc-700">
                          새 문제
                        </button>
                      </div>
                      <div className="mt-8">
                        <p className="text-[11px] uppercase tracking-[0.26em] text-zinc-500">다음 단어의 뜻은?</p>
                        <h2 className="font-display mt-3 text-4xl text-zinc-950">{quizQuestion.prompt.term}</h2>
                        <p className="mt-2 text-sm text-zinc-500">
                          {quizQuestion.prompt.chapter ? `${quizQuestion.prompt.chapter} · ` : ""}
                          {quizQuestion.prompt.groupLabel}
                        </p>
                      </div>
                      <div className="mt-6 space-y-2.5">
                        {quizQuestion.options.map((option) => {
                          const isPicked = quizChoice === option.id;
                          const isAnswer = quizChoice && option.id === quizQuestion.prompt.id;
                          const isWrong = isPicked && option.id !== quizQuestion.prompt.id;
                          return (
                            <button
                              key={option.id}
                              type="button"
                              disabled={Boolean(quizChoice)}
                              onClick={() => {
                                setQuizChoice(option.id);
                                remember(quizQuestion.prompt.id);
                                if (option.id === quizQuestion.prompt.id) {
                                  markMastered(quizQuestion.prompt.id);
                                }
                              }}
                              className={cn(
                                "w-full rounded-[22px] border px-4 py-3.5 text-left text-sm leading-6 transition",
                                !quizChoice && "border-white/75 bg-white/65 text-zinc-800",
                                isAnswer && "border-transparent bg-green-50 text-success",
                                isWrong && "border-transparent bg-rose-50 text-danger",
                              )}
                            >
                              {option.meaning}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                    {quizChoice ? (
                      <div className="glass-panel rounded-[28px] p-4">
                        <p className="text-lg font-semibold text-zinc-950">
                          {quizChoice === quizQuestion.prompt.id ? "정답입니다." : "오답입니다. 카드로 다시 확인해 보세요."}
                        </p>
                        <p className="mt-3 text-sm leading-6 text-zinc-700">{quizQuestion.prompt.meaning}</p>
                        {quizQuestion.prompt.root ? <p className="mt-2 text-sm text-zinc-500">어근 힌트: {quizQuestion.prompt.root}</p> : null}
                      </div>
                    ) : null}
                  </div>
                ) : null}

                {viewMode === "library" ? (
                  <div className="mt-4 space-y-4">
                    <div className="glass-panel rounded-[28px] p-4">
                      <p className="text-xs uppercase tracking-[0.24em] text-zinc-500">Search Library</p>
                      <input
                        value={search}
                        onChange={(event) => {
                          setSearch(event.target.value);
                          setCurrentIndex(0);
                          setShowBack(false);
                          setQuizChoice(null);
                          setQuizRound((previous) => previous + 1);
                        }}
                        placeholder="단어, 뜻, 어근, 챕터 검색"
                        className="mt-3 w-full rounded-[22px] border border-white/80 bg-white/76 px-4 py-3 text-sm text-zinc-950 outline-none placeholder:text-zinc-400"
                      />
                      <div className="mt-3 flex items-center justify-between text-xs text-zinc-500">
                        <span>{filtered.length.toLocaleString()} results</span>
                        <button type="button" onClick={() => setSearch("")} className="font-medium text-zinc-700">
                          검색 초기화
                        </button>
                      </div>
                    </div>
                    <div className="soft-scrollbar max-h-[460px] space-y-2 overflow-y-auto pr-1">
                      {filtered.map((record) => (
                        <button
                          key={record.id}
                          type="button"
                          onClick={() => {
                            const nextIndex = filtered.findIndex((candidate) => candidate.id === record.id);
                            setCurrentIndex(nextIndex >= 0 ? nextIndex : 0);
                            setShowBack(false);
                            setViewMode("focus");
                          }}
                          className="glass-panel w-full rounded-[24px] p-4 text-left transition hover:bg-white/80"
                        >
                          <div className="flex items-start justify-between gap-3">
                            <div>
                              <p className="text-[11px] uppercase tracking-[0.24em] text-zinc-500">{record.groupLabel}</p>
                              <p className="mt-2 text-lg font-semibold text-zinc-950">{record.term}</p>
                              <p className="mt-1 text-sm text-zinc-500">
                                {record.chapter ? `${record.chapter}${record.root ? ` · ${record.root}` : ""}` : collection.subtitle}
                              </p>
                            </div>
                            <div className="flex gap-1.5">
                              {favorites[record.id] ? <span className="rounded-full bg-zinc-950 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-white">Saved</span> : null}
                              {mastered[record.id] ? <span className="rounded-full bg-green-50 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-success">Mastered</span> : null}
                            </div>
                          </div>
                          <p className="mt-3 text-sm leading-6 text-zinc-700">{record.meaning}</p>
                        </button>
                      ))}
                    </div>
                  </div>
                ) : null}

                <div className="mt-4 flex items-center justify-between rounded-[24px] border border-white/80 bg-white/56 px-4 py-3 text-xs text-zinc-500">
                  <span>{filtered.length.toLocaleString()} cards in scope</span>
                  <span className="text-zinc-700">Explore</span>
                </div>
              </div>
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}
