import { promises as fs } from "node:fs";
import path from "node:path";
import type { ItemState, SlotValue, StoreData } from "../../../lib/types";

export const dynamic = "force-dynamic";

const DATA_DIR = path.join(process.cwd(), "data");
const DATA_FILE = path.join(DATA_DIR, "checklist.json");

async function readStore(): Promise<StoreData> {
  try {
    const raw = await fs.readFile(DATA_FILE, "utf8");
    const parsed = JSON.parse(raw) as Partial<StoreData>;
    return {
      template: parsed.template ?? null,
      state: parsed.state ?? {},
    };
  } catch {
    return { template: null, state: {} };
  }
}

let writeQueue: Promise<void> = Promise.resolve();

function commit(data: StoreData): Promise<StoreData> {
  const run = writeQueue.then(async () => {
    await fs.mkdir(DATA_DIR, { recursive: true });
    await fs.writeFile(DATA_FILE, JSON.stringify(data, null, 2), "utf8");
    return data;
  });
  writeQueue = run.then(
    () => undefined,
    () => undefined
  );
  return run;
}

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
  return Response.json(await commit(next));
}
