import { DatabaseSync } from "node:sqlite";
import { existsSync, mkdirSync, readFileSync } from "node:fs";
import path from "node:path";
import type { StoreData } from "./types";

const STORE_KEY = "store";

const DATA_DIR = path.join(process.cwd(), "data");
const DB_FILE = path.join(DATA_DIR, "checklist.db");
const LEGACY_FILE = path.join(DATA_DIR, "checklist.json");

/* ---------- remote (Vercel KV / Upstash Redis) ---------- */

function getEnv(...names: string[]): string | undefined {
  for (const name of names) {
    const value = process.env[name];
    if (value) return value;
  }
  return undefined;
}

function remoteUrl(): string | undefined {
  return getEnv("KV_REST_API_URL", "UPSTASH_REDIS_REST_URL");
}

function remoteEnabled(): boolean {
  return Boolean(remoteUrl());
}

let kvPromise: Promise<import("@vercel/kv").VercelKV> | null = null;

function getKv(): Promise<import("@vercel/kv").VercelKV> {
  kvPromise ??= import("@vercel/kv").then((mod) =>
    mod.createClient({
      url: remoteUrl()!,
      token:
        getEnv("KV_REST_API_TOKEN", "UPSTASH_REDIS_REST_TOKEN") ?? "",
    })
  );
  return kvPromise;
}

async function readRemote(): Promise<StoreData | null> {
  try {
    const client = await getKv();
    const raw = await client.get<Partial<StoreData>>(STORE_KEY);
    if (!raw) return null;
    return {
      template: raw.template ?? null,
      state: raw.state ?? {},
    };
  } catch (err) {
    console.error("Gagal membaca KV:", err);
    return null;
  }
}

async function writeRemote(data: StoreData): Promise<void> {
  const client = await getKv();
  await client.set(STORE_KEY, data);
}

/* ---------- local (SQLite) fallback untuk dev tanpa env ---------- */

let db: DatabaseSync | null = null;

function migrateLegacy(dbConn: DatabaseSync): void {
  const hasStore = dbConn.prepare("SELECT 1 FROM kv WHERE key = ?").get(STORE_KEY);
  if (hasStore) return;
  if (!existsSync(LEGACY_FILE)) return;
  try {
    const raw = readFileSync(LEGACY_FILE, "utf8");
    const parsed = JSON.parse(raw) as StoreData;
    dbConn
      .prepare("INSERT INTO kv (key, value) VALUES (?, ?)")
      .run(STORE_KEY, JSON.stringify(parsed));
    console.log("Migrasi data lama checklist.json -> checklist.db selesai");
  } catch (err) {
    console.error("Gagal memigrasi checklist.json:", err);
  }
}

function getDb(): DatabaseSync {
  if (db) return db;
  mkdirSync(DATA_DIR, { recursive: true });
  db = new DatabaseSync(DB_FILE);
  db.exec(
    "CREATE TABLE IF NOT EXISTS kv (key TEXT PRIMARY KEY, value TEXT NOT NULL)"
  );
  migrateLegacy(db);
  return db;
}

function readLocal(): StoreData {
  const row = getDb()
    .prepare("SELECT value FROM kv WHERE key = ?")
    .get(STORE_KEY) as { value?: string } | undefined;
  if (!row?.value) return { template: null, state: {} };
  try {
    const parsed = JSON.parse(row.value) as Partial<StoreData>;
    return {
      template: parsed.template ?? null,
      state: parsed.state ?? {},
    };
  } catch {
    return { template: null, state: {} };
  }
}

function writeLocal(data: StoreData): void {
  getDb()
    .prepare(
      "INSERT INTO kv (key, value) VALUES (?, ?) " +
        "ON CONFLICT(key) DO UPDATE SET value = excluded.value"
    )
    .run(STORE_KEY, JSON.stringify(data));
}

/* ---------- public API ---------- */

export async function readStore(): Promise<StoreData> {
  if (remoteEnabled()) {
    const remote = await readRemote();
    if (remote) return remote;
    const local = readLocal();
    if (local.template || Object.keys(local.state).length > 0) {
      try {
        await writeRemote(local);
        console.log("Migrasi data lokal -> KV selesai");
      } catch (err) {
        console.error("Gagal migrasi data lokal ke KV:", err);
      }
      return local;
    }
    return { template: null, state: {} };
  }
  return readLocal();
}

export async function writeStore(data: StoreData): Promise<void> {
  if (remoteEnabled()) {
    await writeRemote(data);
    return;
  }
  writeLocal(data);
}