import type { DocMeta, ItemState, StoreData } from "./types";

export interface SavePartial {
  state?: Record<string, ItemState>;
  template?: { markdown: string };
}

function docUrl(slug: string, suffix = ""): string {
  return `/api/docs/${encodeURIComponent(slug)}${suffix}`;
}

export async function fetchDocs(): Promise<DocMeta[]> {
  try {
    const res = await fetch("/api/docs", { cache: "no-store" });
    if (!res.ok) return [];
    return (await res.json()) as DocMeta[];
  } catch {
    return [];
  }
}

export async function fetchDoc(slug: string): Promise<StoreData | null> {
  try {
    const res = await fetch(docUrl(slug), { cache: "no-store" });
    if (!res.ok) return null;
    return (await res.json()) as StoreData;
  } catch {
    return null;
  }
}

export async function saveDoc(
  slug: string,
  partial: SavePartial
): Promise<StoreData> {
  const res = await fetch(docUrl(slug), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(partial),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return (await res.json()) as StoreData;
}

export async function deleteDoc(slug: string): Promise<void> {
  const res = await fetch(docUrl(slug), { method: "DELETE" });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
}