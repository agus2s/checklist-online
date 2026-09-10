import type { ItemState, SlotValue, StoreData } from "../../../../lib/types";
import { deleteDoc, readDoc, writeDoc } from "../../../../lib/db";

export const dynamic = "force-dynamic";

const SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

function cleanSlug(value: string): string | null {
  const slug = value.trim().toLowerCase();
  return SLUG_RE.test(slug) ? slug : null;
}

function sanitizeSlots(raw: unknown): SlotValue[] {
  if (!Array.isArray(raw)) return [];
  return raw.map((v) => (v === 1 ? 1 : v === 2 ? 2 : 0));
}

function sanitizeState(
  state: Record<string, unknown> | undefined
): Record<string, ItemState> {
  const clean: Record<string, ItemState> = {};
  if (!state) return clean;
  for (const [id, raw] of Object.entries(state)) {
    const e = (raw ?? {}) as {
      slots?: unknown;
      checked?: unknown;
      at?: unknown;
    };
    let slots = sanitizeSlots(e.slots);
    if (slots.length === 0 && e.checked === true) slots = [1];
    clean[id] = {
      slots,
      at: (typeof e.at === "number" && e.at) || Date.now(),
    };
  }
  return clean;
}

type SlugCtx = { params: Promise<{ slug: string }> };

export async function GET(_request: Request, ctx: SlugCtx) {
  const slug = cleanSlug((await ctx.params).slug);
  if (!slug)
    return Response.json({ error: "Slug tidak valid" }, { status: 400 });
  const data = await readDoc(slug);
  if (!data)
    return Response.json({ error: "Checklist tidak ditemukan" }, { status: 404 });
  return Response.json(data);
}

export async function POST(request: Request, ctx: SlugCtx) {
  const slug = cleanSlug((await ctx.params).slug);
  if (!slug)
    return Response.json({ error: "Slug tidak valid" }, { status: 400 });

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return Response.json({ error: "Invalid body" }, { status: 400 });
  }

  const partial = body as {
    template?: { markdown: string; updatedAt?: number } | null;
    state?: Record<string, unknown>;
  };

  const data = (await readDoc(slug)) ?? { template: null, state: {} };
  const next: StoreData = {
    template:
      "template" in partial
        ? partial.template
          ? {
              markdown: partial.template.markdown,
              updatedAt:
                typeof partial.template.updatedAt === "number"
                  ? partial.template.updatedAt
                  : Date.now(),
            }
          : null
        : data.template,
    state: "state" in partial ? sanitizeState(partial.state) : data.state,
  };
  await writeDoc(slug, next);
  return Response.json(next);
}

export async function DELETE(_request: Request, ctx: SlugCtx) {
  const slug = cleanSlug((await ctx.params).slug);
  if (!slug)
    return Response.json({ error: "Slug tidak valid" }, { status: 400 });
  await deleteDoc(slug);
  return Response.json({ ok: true });
}