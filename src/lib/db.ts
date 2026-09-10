import { DatabaseSync } from "node:sqlite";
import { existsSync, mkdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { Pool } from "pg";
import type { DocMeta, ItemState, StoreData, TemplateData } from "./types";
import { extractTitle } from "./markdown";

const LEGACY_KEY = "store";
const INDEX_KEY = "docs:index";

const DATA_DIR = path.join(process.cwd(), "data");
const DB_FILE = path.join(DATA_DIR, "checklist.db");
const LEGACY_FILE = path.join(DATA_DIR, "checklist.json");

/* ---------- Supabase (Postgres) ---------- */

const DATABASE_URL = getEnv("SUPABASE_DATABASE_URL", "DATABASE_URL");

function supabaseEnabled(): boolean {
  return Boolean(DATABASE_URL);
}

let pool: Pool | null = null;
let poolReady: Promise<void> | null = null;

function maybeDecode(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

function connectParamsFromUrl(url: string): {
  user: string;
  password: string;
  host: string;
  port: number;
  database: string;
} {
  let rest = url.replace(/^postgres(?:ql)?:\/\//i, "");
  let database = "postgres";
  const slash = rest.lastIndexOf("/");
  if (slash >= 0) {
    database = rest.slice(slash + 1) || "postgres";
    rest = rest.slice(0, slash);
  }
  let user = "postgres";
  let password = "";
  const at = rest.lastIndexOf("@");
  if (at >= 0) {
    const auth = rest.slice(0, at);
    rest = rest.slice(at + 1);
    const colon = auth.indexOf(":");
    if (colon >= 0) {
      user = auth.slice(0, colon);
      password = auth.slice(colon + 1);
    } else {
      user = auth;
    }
  }
  let host = rest;
  let port = 5432;
  const lastColon = rest.lastIndexOf(":");
  if (lastColon >= 0 && /^\d+$/.test(rest.slice(lastColon + 1))) {
    port = Number(rest.slice(lastColon + 1));
    host = rest.slice(0, lastColon);
  }
  return { user: maybeDecode(user), password: maybeDecode(password), host, port, database };
}

function getPool(): Pool {
  if (!pool) {
    pool = new Pool({
      ...connectParamsFromUrl(DATABASE_URL!),
      max: 5,
      ssl: { rejectUnauthorized: false },
    });
  }
  return pool;
}

async function ensureTable(): Promise<void> {
  if (poolReady) return poolReady;
  poolReady = getPool()
    .query(
      `CREATE TABLE IF NOT EXISTS docs (
         slug TEXT PRIMARY KEY,
         title TEXT NOT NULL,
         template JSONB,
         state JSONB NOT NULL DEFAULT '{}'::jsonb,
         updated_at BIGINT NOT NULL
       )`
    )
    .then(() => undefined);
  await poolReady;
}

async function supabaseListDocs(): Promise<DocMeta[]> {
  await ensureTable();
  const { rows } = await getPool().query<{
    slug: string;
    title: string;
    updated_at: string | number;
  }>("SELECT slug, title, updated_at FROM docs ORDER BY updated_at DESC");
  return rows.map((r) => ({
    slug: r.slug,
    title: r.title,
    updatedAt: Number(r.updated_at),
  }));
}

async function supabaseReadDoc(slug: string): Promise<StoreData | null> {
  await ensureTable();
  const { rows } = await getPool().query<{
    template: unknown;
    state: unknown;
  }>("SELECT template, state FROM docs WHERE slug = $1", [slug]);
  const row = rows[0];
  if (!row) return null;
  return {
    template: (row.template as TemplateData | null) ?? null,
    state: (row.state as Record<string, ItemState>) ?? {},
  };
}

async function supabaseWriteDoc(slug: string, data: StoreData): Promise<void> {
  await ensureTable();
  let title = data.template
    ? extractTitle(data.template.markdown)
    : "Checklist";
  if (!title || !data.template) {
    const { rows } = await getPool().query<{ title: string }>(
      "SELECT title FROM docs WHERE slug = $1",
      [slug]
    );
    title = rows[0]?.title ?? title;
  }
  const updatedAt = data.template?.updatedAt ?? Date.now();
  await getPool().query(
    `INSERT INTO docs (slug, title, template, state, updated_at)
     VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT (slug) DO UPDATE SET
       title = EXCLUDED.title,
       template = EXCLUDED.template,
       state = EXCLUDED.state,
       updated_at = EXCLUDED.updated_at`,
    [
      slug,
      title,
      data.template ? JSON.stringify(data.template) : null,
      JSON.stringify(data.state),
      updatedAt,
    ]
  );
}

async function supabaseDeleteDoc(slug: string): Promise<void> {
  await ensureTable();
  await getPool().query("DELETE FROM docs WHERE slug = $1", [slug]);
}

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
  if (supabaseEnabled()) return supabaseListDocs();
  await migrateLegacyDoc();
  const list = await readIndex();
  return [...list].sort((a, b) => b.updatedAt - a.updatedAt);
}

export async function readDoc(slug: string): Promise<StoreData | null> {
  if (supabaseEnabled()) return supabaseReadDoc(slug);
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
  if (supabaseEnabled()) return supabaseWriteDoc(slug, data);
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
  if (supabaseEnabled()) return supabaseDeleteDoc(slug);
  await kvDel(docKey(slug));
  const list = await readIndex();
  await writeIndex(list.filter((d) => d.slug !== slug));
}