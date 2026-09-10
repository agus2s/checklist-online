import { Pool } from "pg";
import type { DocMeta, ItemState, StoreData, TemplateData } from "./types";
import { extractTitle } from "./markdown";

/* ---------- config ---------- */

function getEnv(...names: string[]): string | undefined {
  for (const name of names) {
    const value = process.env[name];
    if (value) return value;
  }
  return undefined;
}

const DATABASE_URL = getEnv("SUPABASE_DATABASE_URL", "DATABASE_URL");

/* ---------- Supabase (Postgres) ---------- */

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
  return {
    user: maybeDecode(user),
    password: maybeDecode(password),
    host,
    port,
    database,
  };
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

/* ---------- CRUD ---------- */

async function listDocs(): Promise<DocMeta[]> {
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

async function readDoc(slug: string): Promise<StoreData | null> {
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

async function writeDoc(slug: string, data: StoreData): Promise<void> {
  await ensureTable();
  const pool = getPool();
  const { rows } = await pool.query<{
    title: string | null;
    template: unknown;
  }>("SELECT title, template FROM docs WHERE slug = $1", [slug]);
  const existing = rows[0];

  let template = data.template as TemplateData | null | undefined;
  if (!template && existing)
    template = (existing.template as TemplateData | null) ?? null;
  if (!template && !existing) return;

  let title = template ? extractTitle(template.markdown) : "Checklist";
  if (!title) title = existing?.title ?? "Checklist";

  const updatedAt = Math.max(Date.now(), data.template?.updatedAt ?? 0);
  await pool.query(
    `INSERT INTO docs (slug, title, template, state, updated_at)
     VALUES ($1, $2, $3::jsonb, $4::jsonb, $5)
     ON CONFLICT (slug) DO UPDATE SET
       title = COALESCE(EXCLUDED.title, docs.title),
       template = COALESCE(EXCLUDED.template, docs.template),
       state = EXCLUDED.state,
       updated_at = GREATEST(docs.updated_at, EXCLUDED.updated_at)`,
    [
      slug,
      title,
      template ? JSON.stringify(template) : null,
      JSON.stringify(data.state),
      updatedAt,
    ]
  );
}

async function deleteDoc(slug: string): Promise<void> {
  await ensureTable();
  await getPool().query("DELETE FROM docs WHERE slug = $1", [slug]);
}

/* ---------- API publik ---------- */

export { listDocs, readDoc, writeDoc, deleteDoc };
