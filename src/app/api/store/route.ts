import type { ItemState, SlotValue, StoreData } from "../../../lib/types";
import { readStore, writeStore } from "../../../lib/db";

export const dynamic = "force-dynamic";

function sanitizeSlots(raw: unknown): SlotValue[] {
  if (!Array.isArray(raw)) return [];
  return raw.map((v) => (v === 1 ? 1 : v === 2 ? 2 : 0));
}

function sanitizeState(state: Record<string, unknown> | undefined): Record<string, ItemState> {
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

export async function GET() {
  return Response.json(await readStore());
}

export async function POST(request: Request) {
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

  const data = await readStore();
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
  await writeStore(next);
  return Response.json(next);
}
