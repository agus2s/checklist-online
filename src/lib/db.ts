import { DatabaseSync } from "node:sqlite";
import { existsSync, mkdirSync, readFileSync } from "node:fs";
import path from "node:path";
import type { StoreData } from "./types";

const DATA_DIR = path.join(process.cwd(), "data");
const DB_FILE = path.join(DATA_DIR, "checklist.db");
const LEGACY_FILE = path.join(DATA_DIR, "checklist.json");

let db: DatabaseSync | null = null;

function migrateLegacy(dbConn: DatabaseSync): void {
  const hasStore = dbConn.prepare("SELECT 1 FROM kv WHERE key = ?").get("store");
  if (hasStore) return;
  if (!existsSync(LEGACY_FILE)) return;
  try {
    const raw = readFileSync(LEGACY_FILE, "utf8");
    const parsed = JSON.parse(raw) as StoreData;
    dbConn
      .prepare("INSERT INTO kv (key, value) VALUES (?, ?)")
      .run("store", JSON.stringify(parsed));
    console.log("Migrasi data lama checklist.json -> checklist.db selesai");
  } catch (err) {
    console.error("Gagal memigrasi checklist.json:", err);
  }
}

export function getDb(): DatabaseSync {
  if (db) return db;
  mkdirSync(DATA_DIR, { recursive: true });
  db = new DatabaseSync(DB_FILE);
  db.exec(
    "CREATE TABLE IF NOT EXISTS kv (key TEXT PRIMARY KEY, value TEXT NOT NULL)"
  );
  migrateLegacy(db);
  return db;
}

export function readStore(): StoreData {
  const row = getDb()
    .prepare("SELECT value FROM kv WHERE key = ?")
    .get("store") as { value?: string } | undefined;
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

export function writeStore(data: StoreData): void {
  getDb()
    .prepare(
      "INSERT INTO kv (key, value) VALUES (?, ?) " +
        "ON CONFLICT(key) DO UPDATE SET value = excluded.value"
    )
    .run("store", JSON.stringify(data));
}