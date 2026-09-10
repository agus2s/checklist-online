import type { ItemState, StoreData } from "./types";

export interface SavePartial {
  state?: Record<string, ItemState>;
  template?: { markdown: string };
}

export async function fetchStore(): Promise<StoreData> {
  try {
    const res = await fetch("/api/store", { cache: "no-store" });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return (await res.json()) as StoreData;
  } catch {
    return { template: null, state: {} };
  }
}

export async function saveStore(partial: SavePartial): Promise<StoreData> {
  const res = await fetch("/api/store", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(partial),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return (await res.json()) as StoreData;
}
