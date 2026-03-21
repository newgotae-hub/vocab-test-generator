export type CollectionId = "basic" | "advanced" | "etymology";
export type ViewMode = "focus" | "quiz" | "library";

export interface VocabDerivative {
  term: string;
  meaning: string;
}

export interface VocabRecord {
  id: string;
  collectionId: CollectionId;
  term: string;
  meaning: string;
  derivatives: VocabDerivative[];
  groupId: string;
  groupLabel: string;
  groupIndex: number;
  chapter: string | null;
  root: string | null;
  page: number | null;
  source: string;
  order: number;
  searchText: string;
}

export interface VocabGroup {
  id: string;
  label: string;
  index: number;
  count: number;
}

export interface VocabCollection {
  id: CollectionId;
  name: string;
  subtitle: string;
  description: string;
  itemLabel: string;
  totalRecords: number;
  totalGroups: number;
  groups: VocabGroup[];
  records: VocabRecord[];
}

export interface VocabSource {
  id: string;
  label: string;
  path: string;
  records: number;
}

export interface VocabDatabase {
  generatedAt: string;
  totalRecords: number;
  collections: VocabCollection[];
  sources: VocabSource[];
}

export function getCollection(database: VocabDatabase, collectionId: CollectionId) {
  return database.collections.find((collection) => collection.id === collectionId) ?? database.collections[0];
}
