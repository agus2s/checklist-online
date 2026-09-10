import type { ItemState, SlotValue } from "./types";

export type Block =
  | { type: "section"; text: string }
  | { type: "divider" }
  | { type: "space" }
  | { type: "paragraph"; text: string }
  | { type: "note"; text: string }
  | { type: "item"; id: string; text: string; defaultSlots: SlotValue[] }
  | { type: "table"; headers: string[]; rows: TableRow[] };

export interface TableRow {
  id: string;
  num: string;
  text: string;
  defaultSlots: SlotValue[];
}

export type ItemBlock = Extract<Block, { type: "item" }>;
export type SlotUnit = ItemBlock | TableRow;

export interface ParsedDoc {
  title: string;
  blocks: Block[];
}

export const DEFAULT_MARKDOWN = `# Checklist Persiapan Acara

Isi bersama-sama. Centang kalau sudah beres, tulis nama biar yang lain tahu siapa yang mengerjakan.

## Sebelum acara
- [ ] Booking tempat
- [ ] Kirim undangan
- [ ] Siapkan konsumsi
- Catatan bebas ditulis di sini juga, tanpa checkbox

## Hari H
- [ ] Cek sound system
- [ ] Absensi tamu
- [ ] Dokumentasi`;

function hashText(s: string): string {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return (h >>> 0).toString(36);
}

const TASK_RUN_RE = /^([-*]\s+)((?:\[[ xXvV\-]\]\s*)+)(.*)$/;
const TASK_RUN_LINE_RE = /^(\s*[-*]\s+)((?:\[[ xXvV\-]\]\s*)+)(.*)$/;
const BULLET_LINE_RE = /^[-*]\s+(.*)$/;
const BOX_TOKEN_RE = /\[[ xXvV\-]\]/g;
const BOX_TOKEN_TEST = /\[[ xXvV\-]\]/;

function toSlotValue(tok: string): SlotValue {
  if (tok === "[-]") return 2;
  const c = tok[1]?.toLowerCase();
  if (c === "x" || c === "v") return 1;
  return 0;
}

function nextBoxToken(tok: string): string {
  if (tok === "[-]") return "[-]";
  if (tok[1]?.toLowerCase() === "x") return "[ ]";
  return "[x]";
}

type TableLineInfo =
  | { kind: "header"; cells: string[] }
  | { kind: "delimiter" }
  | { kind: "row"; cells: string[] };

function isTableDelimiter(line: string): boolean {
  const t = line.trim();
  if (!t.includes("|")) return false;
  const cells = t
    .split("|")
    .map((c) => c.trim())
    .filter((c) => c !== "");
  return (
    cells.length > 0 && cells.every((c) => /^:?-+:?$/.test(c))
  );
}

function splitTableRow(line: string): string[] {
  let t = line.trim();
  if (t.startsWith("|")) t = t.slice(1);
  if (t.endsWith("|")) t = t.slice(0, -1);
  return t.split("|").map((c) => c.trim());
}

function scanTableLines(lines: string[]): Map<number, TableLineInfo> {
  const map = new Map<number, TableLineInfo>();
  for (let i = 0; i + 1 < lines.length; i++) {
    if (lines[i].includes("|") && isTableDelimiter(lines[i + 1])) {
      map.set(i, { kind: "header", cells: splitTableRow(lines[i]) });
      map.set(i + 1, { kind: "delimiter" });
      let j = i + 2;
      while (j < lines.length && lines[j].includes("|")) {
        map.set(j, { kind: "row", cells: splitTableRow(lines[j]) });
        j++;
      }
      i = j - 1;
    }
  }
  return map;
}

function cellToSlot(cell: string): SlotValue | null {
  if (/\[ *- *\]/.test(cell) || /❌/.test(cell)) return 2;
  if (/\[ *[xXvV✓✅] *\]/.test(cell) || /[✓✅]/.test(cell)) return 1;
  if (/\[ *\]/.test(cell)) return 0;
  return null;
}

function cellSlots(cell: string): SlotValue[] {
  const found = cell.match(BOX_TOKEN_RE) ?? [];
  if (found.length > 0) return found.map(toSlotValue);
  return [cellToSlot(cell) ?? 0];
}

export function extractTitle(md: string): string {
  for (const line of (md || "").split("\n")) {
    const t = line.trim();
    if (t.startsWith("# ")) return t.slice(2).trim() || "Checklist";
  }
  return "Checklist";
}

export function setMarkdownTitle(md: string, rawTitle: string): string {
  const title = rawTitle.trim();
  if (!title) return md;
  const lines = (md || "").split("\n");
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].startsWith("# ")) {
      lines[i] = `# ${title}`;
      return lines.join("\n");
    }
  }
  return `# ${title}\n\n${md || ""}`;
}

export function parseMarkdown(md: string): ParsedDoc {
  const lines = (md || "").split("\n");
  const tableLines = scanTableLines(lines);
  const blocks: Block[] = [];
  let title = "Checklist";
  const seen: Record<string, number> = {};
  const pushItem = (text: string, defaultSlots: SlotValue[]) => {
    const base = hashText(text.toLowerCase());
    seen[base] = (seen[base] || 0) + 1;
    blocks.push({
      type: "item",
      id: `${base}-${seen[base]}`,
      text,
      defaultSlots,
    });
  };
  for (let idx = 0; idx < lines.length; idx++) {
    const raw = lines[idx];
    const line = raw.trim();
    const tinfo = tableLines.get(idx);
    if (tinfo?.kind === "header") {
      const headers = tinfo.cells;
      const rows: TableRow[] = [];
      let j = idx + 2;
      while (j < lines.length) {
        const rowInfo = tableLines.get(j);
        if (!rowInfo || rowInfo.kind !== "row") break;
        const cells = rowInfo.cells;
        const text = cells[1] ?? "";
        const slots = cells
          .slice(2)
          .map((c) => cellSlots(c))
          .flat();
        if (text || slots.length > 0) {
          const base = hashText(text.toLowerCase());
          seen[base] = (seen[base] || 0) + 1;
          rows.push({
            id: `${base}-${seen[base]}`,
            num: cells[0] ?? "",
            text,
            defaultSlots: slots,
          });
        }
        j++;
      }
      if (rows.length > 0) blocks.push({ type: "table", headers, rows });
      idx = j - 1;
      continue;
    }
    if (tinfo) continue;
    if (!line) {
      blocks.push({ type: "space" });
      continue;
    }
    if (line.startsWith("# ")) {
      title = line.slice(2).trim();
      continue;
    }
    if (line.startsWith("## ")) {
      blocks.push({ type: "section", text: line.slice(3).trim() });
      continue;
    }
    if (line === "---") {
      blocks.push({ type: "divider" });
      continue;
    }
    const runMatch = line.match(TASK_RUN_RE);
    if (runMatch) {
      const tokens = runMatch[2].match(BOX_TOKEN_RE) ?? [];
      pushItem(
        runMatch[3].trim(),
        tokens.map(toSlotValue)
      );
      continue;
    }
    const bulletMatch = line.match(BULLET_LINE_RE);
    if (bulletMatch) {
      blocks.push({ type: "note", text: bulletMatch[1].trim() });
      continue;
    }
    blocks.push({ type: "paragraph", text: line });
  }
  return { title, blocks };
}

interface LegacyEntry {
  slots?: unknown;
  checked?: unknown;
}

export function resolveSlots(
  item: Pick<SlotUnit, "defaultSlots">,
  entry?: ItemState | LegacyEntry | null
): SlotValue[] {
  const defaults = item.defaultSlots;
  const legacy = entry as LegacyEntry | undefined;
  const raw = legacy?.slots;
  if (Array.isArray(raw)) {
    return defaults.map((d, i) => {
      const v = raw[i];
      return v === 0 || v === 1 || v === 2 ? v : d;
    });
  }
  if (legacy?.checked === true) return defaults.map(() => 1);
  return [...defaults];
}

export function isItemDone(
  unit: SlotUnit,
  fillState: Record<string, ItemState>
): boolean {
  const enabled = resolveSlots(unit, fillState[unit.id]).filter(
    (s) => s !== 2
  );
  return enabled.every((s) => s === 1);
}

export function slotUnits(blocks: Block[]): SlotUnit[] {
  const out: SlotUnit[] = [];
  for (const b of blocks) {
    if (b.type === "item") out.push(b);
    else if (b.type === "table") for (const r of b.rows) out.push(r);
  }
  return out;
}

export function findSlotUnit(
  blocks: Block[],
  id: string
): SlotUnit | undefined {
  for (const b of blocks) {
    if (b.type === "item" && b.id === id) return b;
    if (b.type === "table") {
      const r = b.rows.find((row) => row.id === id);
      if (r) return r;
    }
  }
  return undefined;
}

export function cycleTaskSlot(draft: string, flatIndex: number): string {
  const lines = draft.split("\n");
  const tableLines = scanTableLines(lines);
  const counter = { n: -1 };
  return lines
    .map((line, idx) => {
      const tinfo = tableLines.get(idx);
      if (tinfo?.kind === "row") {
        const cells = tinfo.cells;
        const slotCells = cells.slice(2);
        if (cells.length < 2 || slotCells.length === 0) return line;
        if (!cells[1] && !slotCells.some((c) => BOX_TOKEN_TEST.test(c)))
          return line;
        return cycleRowCells(line, counter, flatIndex);
      }
      const m = line.match(TASK_RUN_LINE_RE);
      if (!m) return line;
      const [, prefix, run, rest] = m;
      const newRun = run.replace(BOX_TOKEN_RE, (tok) => {
        counter.n += 1;
        return counter.n === flatIndex ? nextBoxToken(tok) : tok;
      });
      return `${prefix}${newRun}${rest}`;
    })
    .join("\n");
}

function cycleRowCells(
  line: string,
  counter: { n: number },
  flatIndex: number
): string {
  const t = line.trim();
  const lead = t.startsWith("|") ? 1 : 0;
  const trail = t.endsWith("|") ? 1 : 0;
  const parts = line.split("|");
  const cellCount = parts.length - lead - trail;
  if (cellCount < 2) return line;
  for (let p = lead + 2; p < parts.length - trail; p++) {
    const cell = parts[p];
    const found = cell.match(BOX_TOKEN_RE) ?? [];
    if (found.length > 0) {
      parts[p] = cell.replace(BOX_TOKEN_RE, (tok) => {
        counter.n += 1;
        return counter.n === flatIndex ? nextBoxToken(tok) : tok;
      });
    } else {
      counter.n += 1;
      if (counter.n === flatIndex) {
        const v = cellToSlot(cell) ?? 0;
        parts[p] = v === 2 ? cell : v === 1 ? " [ ] " : " [x] ";
      }
    }
  }
  return parts.join("|");
}

function previewInputFor(tok: string): string {
  if (tok === "[-]") return '<input type="checkbox" disabled>';
  if (tok[1]?.toLowerCase() === "x")
    return '<input type="checkbox" checked>';
  return '<input type="checkbox">';
}

function expandTableCell(cell: string): string {
  const found = cell.match(BOX_TOKEN_RE) ?? [];
  if (found.length === 0) return '<input type="checkbox" disabled>';
  return cell.replace(BOX_TOKEN_RE, previewInputFor);
}

export function expandTaskBoxesForPreview(draft: string): string {
  const lines = (draft || "").split("\n");
  const tableLines = scanTableLines(lines);
  return lines
    .map((line, idx) => {
      const tinfo = tableLines.get(idx);
      if (tinfo?.kind === "row") {
        const parts = line.split("|");
        const lead = parts[0].trim() === "" ? 1 : 0;
        const trail =
          parts[parts.length - 1].trim() === "" ? 1 : 0;
        for (let p = lead + 2; p < parts.length - trail; p++) {
          parts[p] = expandTableCell(parts[p]);
        }
        return parts.join("|");
      }
      const m = line.match(TASK_RUN_LINE_RE);
      if (!m) return line;
      const [, prefix, run, rest] = m;
      const inputs = (run.match(BOX_TOKEN_RE) ?? []).map(previewInputFor);
      return `${prefix}${inputs.join(" ")} ${rest}`;
    })
    .join("\n");
}

export interface SlotProgress {
  items: SlotUnit[];
  doneSlots: number;
  totalSlots: number;
  pct: number;
}

export function getProgress(
  blocks: Block[],
  fillState: Record<string, ItemState>
): SlotProgress {
  const items = slotUnits(blocks);
  let doneSlots = 0;
  let totalSlots = 0;
  for (const item of items) {
    const enabled = resolveSlots(item, fillState[item.id]).filter(
      (s) => s !== 2
    );
    totalSlots += enabled.length;
    doneSlots += enabled.filter((s) => s === 1).length;
  }
  const pct = totalSlots ? Math.round((doneSlots / totalSlots) * 100) : 0;
  return { items, doneSlots, totalSlots, pct };
}
