import { DatabaseSync } from "node:sqlite";
import { existsSync, mkdirSync, readFileSync } from "node:fs";
import path from "node:path";
import type { DocMeta, StoreData } from "./types";
import { extractTitle } from "./markdown";

const LEGACY_KEY = "store";
const INDEX_KEY = "docs:index";

const DATA_DIR = path.join(process.cwd(), "data");
const DB_FILE = path.join(DATA_DIR, "checklist.db");
const LEGACY_FILE = path.join(DATA_DIR, "checklist.json");

/* ---------- remote (Upstash Redis) ---------- */

function getEnv(...names: string[]): string | undefined {
  for (const name of names) {
    const value = process.env[name];
    if (value) return value;
  }
  return undefined;
}

function remoteUrl(): string | undefined {
  return getEnv("UPSTASH_REDIS_REST_URL", "KV_REST_API_URL");
}

function remoteEnabled(): boolean {
  return Boolean(remoteUrl());
}

let kvPromise: Promise<import("@upstash/redis").Redis | null> | null = null;

function getKv(): Promise<import("@upstash/redis").Redis | null> {
  kvPromise ??= import("@upstash/redis")
    .then((mod) =>
      new mod.Redis({
        url: remoteUrl()!,
        token:
          getEnv("UPSTASH_REDIS_REST_TOKEN", "KV_REST_API_TOKEN") ?? "",
      })
    )
    .catch((err) => {
      console.error("Gagal inisialisasi klien Redis:", err);
      return null;
    });
  return kvPromise;
}

async function kvGetRemote(key: string): Promise<string | null> {
  try {
    const client = await getKv();
    if (!client) return null;
    const value = await client.get<unknown>(key);
    if (value === null || value === undefined) return null;
    return typeof value === "string" ? value : JSON.stringify(value);
  } catch (err) {
    console.error("Gagal membaca Redis:", err);
    return null;
  }
}

async function kvSetRemote(key: string, value: string): Promise<void> {
  const client = await getKv();
  if (!client) return;
  await client.set(key, value);
}

async function kvDelRemote(key: string): Promise<void> {
  const client = await getKv();
  if (!client) return;
  await client.del(key);
}

/* ---------- local (SQLite) fallback untuk dev tanpa env ---------- */

let db: DatabaseSync | null = null;
let localWarned = false;
const memoryStore = new Map<string, string>();

function warnLocal(fallback: string): void {
  if (!localWarned) {
    localWarned = true;
    console.warn(
      `Penyimpanan file tidak tersedia (${fallback}); memakai memori. ` +
        "Konfigurasi UPSTASH_REDIS_REST_URL untuk persistensi."
    );
  }
}

function getDb(): DatabaseSync {
  if (db) return db;
  mkdirSync(DATA_DIR, { recursive: true });
  db = new DatabaseSync(DB_FILE);
  db.exec(
    "CREATE TABLE IF NOT EXISTS kv (key TEXT PRIMARY KEY, value TEXT NOT NULL)"
  );
  if (existsSync(LEGACY_FILE)) {
    try {
      const parsed = JSON.parse(readFileSync(LEGACY_FILE, "utf8")) as StoreData;
      const hasKey = db
        .prepare("SELECT 1 FROM kv WHERE key = ?")
        .get(LEGACY_KEY) as { "1"?: number } | undefined;
      if (!hasKey) {
        db.prepare("INSERT INTO kv (key, value) VALUES (?, ?)").run(
          LEGACY_KEY,
          JSON.stringify(parsed)
        );
        console.log("Migrasi data lama checklist.json -> checklist.db selesai");
      }
    } catch (err) {
      console.error("Gagal memigrasi checklist.json:", err);
    }
  }
  return db;
}

function localGet(key: string): string | null {
  try {
    const row = getDb()
      .prepare("SELECT value FROM kv WHERE key = ?")
      .get(key) as { value?: string } | undefined;
    return row?.value ?? null;
  } catch {
    warnLocal("read-only / EROFS");
    return memoryStore.get(key) ?? null;
  }
}

function localSet(key: string, value: string): void {
  try {
    getDb()
      .prepare(
        "INSERT INTO kv (key, value) VALUES (?, ?) " +
          "ON CONFLICT(key) DO UPDATE SET value = excluded.value"
      )
      .run(key, value);
  } catch {
    warnLocal("read-only / EROFS");
    memoryStore.set(key, value);
  }
}

function localDel(key: string): void {
  try {
    getDb().prepare("DELETE FROM kv WHERE key = ?").run(key);
  } catch {
    warnLocal("read-only / EROFS");
    memoryStore.delete(key);
  }
}

/* ---------- penyimpanan seragam ---------- */

async function kvGet(key: string): Promise<string | null> {
  if (remoteEnabled()) return kvGetRemote(key);
  return localGet(key);
}

async function kvSet(key: string, value: string): Promise<void> {
  if (remoteEnabled()) {
    await kvSetRemote(key, value);
    return;
  }
  localSet(key, value);
}

async function kvDel(key: string): Promise<void> {
  if (remoteEnabled()) {
    await kvDelRemote(key);
    return;
  }
  localDel(key);
}

const docKey = (slug: string) => `store:${slug}`;

async function readIndex(): Promise<DocMeta[]> {
  const raw = await kvGet(INDEX_KEY);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as DocMeta[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

async function writeIndex(list: DocMeta[]): Promise<void> {
  await kvSet(INDEX_KEY, JSON.stringify(list));
}

async function migrateLegacyDoc(): Promise<void> {
  const raw = await kvGet(LEGACY_KEY);
  if (raw === null) return;
  let info = "";
  try {
    const data = JSON.parse(raw) as StoreData;
    if (!data.template && (!data.state || Object.keys(data.state).length === 0)) {
      await kvDel(LEGACY_KEY);
      return;
    }
    if (!(await kvGet(docKey("default")))) {
      await kvSet(docKey("default"), JSON.stringify(data));
      const list = await readIndex();
      if (!list.some((d) => d.slug === "default")) {
        list.push({
          slug: "default",
          title: data.template
            ? extractTitle(data.template.markdown)
            : "Checklist",
          updatedAt: data.template?.updatedAt ?? Date.now(),
        });
        await writeIndex(list);
      }
    }
    info = " (dimigrasi ke ``default``)";
  } catch (err) {
    console.error("Gagal migrasi data lama:", err);
  }
  await kvDel(LEGACY_KEY);
  if (info) console.log(`Migrasi data lama selesai${info}`);
}

/* ---------- API publik ---------- */

export async function listDocs(): Promise<DocMeta[]> {
  await migrateLegacyDoc();
  const list = await readIndex();
  return [...list].sort((a, b) => b.updatedAt - a.updatedAt);
}

export async function readDoc(slug: string): Promise<StoreData | null> {
  await migrateLegacyDoc();
  const raw = await kvGet(docKey(slug));
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Partial<StoreData>;
    return {
      template: parsed.template ?? null,
      state: parsed.state ?? {},
    };
  } catch {
    return null;
  }
}

export async function writeDoc(slug: string, data: StoreData): Promise<void> {
  await kvSet(docKey(slug), JSON.stringify(data));
  const list = await readIndex();
  const idx = list.findIndex((d) => d.slug === slug);
  const meta: DocMeta = {
    slug,
    title: data.template
      ? extractTitle(data.template.markdown)
      : idx >= 0
        ? list[idx].title
        : "Checklist",
    updatedAt: data.template?.updatedAt ?? Date.now(),
  };
  if (idx >= 0) list[idx] = meta;
  else list.push(meta);
  await writeIndex([...list].sort((a, b) => b.updatedAt - a.updatedAt));
}

export async function deleteDoc(slug: string): Promise<void> {
  await kvDel(docKey(slug));
  const list = await readIndex();
  await writeIndex(list.filter((d) => d.slug !== slug));
}