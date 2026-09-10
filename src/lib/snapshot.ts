import type { Block } from "./markdown";
import { resolveSlots } from "./markdown";
import type { ItemState, SlotValue } from "./types";

export interface SnapshotInput {
  title: string;
  blocks: Block[];
  fillState: Record<string, ItemState>;
  doneSlots: number;
  totalSlots: number;
  pct: number;
}

type LaidOutBlock =
  | {
      type: "item";
      id: string;
      text: string;
      defaultSlots: SlotValue[];
      wrapped: string[];
      slotCount: number;
    }
  | { type: "section"; text: string }
  | { type: "divider" }
  | { type: "space" }
  | { type: "paragraph"; text: string; wrapped: string[] }
  | { type: "note"; text: string; wrapped: string[] };

const WIDTH = 720;
const PADDING_X = 44;
const LINE_HEIGHT = 30;

function wrapText(
  measure: (text: string) => number,
  text: string,
  maxWidth: number
): string[] {
  const words = text.split(" ");
  const out: string[] = [];
  let line = "";
  for (const w of words) {
    const test = line ? line + " " + w : w;
    if (measure(test) > maxWidth && line) {
      out.push(line);
      line = w;
    } else {
      line = test;
    }
  }
  if (line) out.push(line);
  return out;
}

export function buildChecklistImage(input: SnapshotInput): Promise<Blob> {
  return new Promise<Blob>((resolve, reject) => {
    try {
      const { title, blocks, fillState, doneSlots, totalSlots, pct } = input;
      const ctxMeasure = document.createElement("canvas").getContext("2d")!;
      ctxMeasure.font = "15px monospace";
      const measure = (text: string) => ctxMeasure.measureText(text).width;

      const maxTextWidth = WIDTH - PADDING_X * 2 - 34;
      const laidOut: LaidOutBlock[] = blocks.flatMap(
        (b): LaidOutBlock[] => {
        if (b.type === "item") {
          const slotCount = resolveSlots(b, fillState[b.id]).length;
          const textX = PADDING_X + slotCount * 26 + 8;
          return [
            {
              type: "item" as const,
              id: b.id,
              text: b.text,
              defaultSlots: b.defaultSlots,
              wrapped: wrapText(measure, b.text, WIDTH - textX - PADDING_X),
              slotCount,
            },
          ];
        }
        if (b.type === "table") {
          return b.rows.flatMap((row) => {
            const slotCount = resolveSlots(row, fillState[row.id]).length;
            const label = row.num ? `${row.num}. ${row.text}` : row.text;
            const textX = PADDING_X + slotCount * 26 + 8;
            return [
              {
                type: "item" as const,
                id: row.id,
                text: label,
                defaultSlots: row.defaultSlots,
                wrapped: wrapText(measure, label, WIDTH - textX - PADDING_X),
                slotCount,
              },
            ];
          });
        }
        if (b.type === "note" || b.type === "paragraph") {
          return [
            {
              ...b,
              wrapped: wrapText(measure, b.text, maxTextWidth),
            },
          ];
        }
        return [b];
      });

      let height = 150;
      laidOut.forEach((b) => {
        if (b.type === "section") height += 40;
        else if (b.type === "divider") height += 20;
        else if (b.type === "space") height += 10;
        else height += LINE_HEIGHT * Math.max(1, (b.wrapped || [""]).length);
      });
      height += 50;

      const canvas = document.createElement("canvas");
      const scale = 2;
      canvas.width = WIDTH * scale;
      canvas.height = height * scale;
      const ctx = canvas.getContext("2d")!;
      ctx.scale(scale, scale);

      ctx.fillStyle = "#33443C";
      ctx.fillRect(0, 0, WIDTH, height);
      ctx.fillStyle = "#EAE4D6";
      ctx.fillRect(0, 10, WIDTH, height - 20);

      ctx.fillStyle = "#26313A";
      ctx.font = "bold 24px monospace";
      ctx.fillText(title, PADDING_X, 56);

      ctx.font = "13px monospace";
      ctx.fillStyle = "#5B6A72";
      ctx.fillText(`${doneSlots} dari ${totalSlots} selesai (${pct}%)`, PADDING_X, 82);

      ctx.fillStyle = "#DDD5C2";
      ctx.fillRect(PADDING_X, 94, WIDTH - PADDING_X * 2, 8);
      ctx.fillStyle = "#5B7461";
      ctx.fillRect(PADDING_X, 94, ((WIDTH - PADDING_X * 2) * pct) / 100, 8);

      let y = 132;
      laidOut.forEach((b) => {
        if (b.type === "section") {
          ctx.fillStyle = "#26313A";
          ctx.font = "bold 16px monospace";
          ctx.fillText(b.text, PADDING_X, y);
          ctx.strokeStyle = "#C7BFA9";
          ctx.beginPath();
          ctx.moveTo(PADDING_X, y + 8);
          ctx.lineTo(WIDTH - PADDING_X, y + 8);
          ctx.stroke();
          y += 40;
        } else if (b.type === "divider") {
          ctx.strokeStyle = "#C7BFA9";
          ctx.beginPath();
          ctx.moveTo(PADDING_X, y);
          ctx.lineTo(WIDTH - PADDING_X, y);
          ctx.stroke();
          y += 20;
        } else if (b.type === "space") {
          y += 10;
        } else if (b.type === "paragraph") {
          const wrapped = b.wrapped ?? [""];
          ctx.fillStyle = "#26313A";
          ctx.font = "14px monospace";
          wrapped.forEach((line) => {
            ctx.fillText(line, PADDING_X, y);
            y += LINE_HEIGHT;
          });
        } else if (b.type === "note") {
          const wrapped = b.wrapped ?? [""];
          ctx.fillStyle = "#4A5760";
          ctx.font = "14px monospace";
          wrapped.forEach((line, i) => {
            ctx.fillText((i === 0 ? "· " : "  ") + line, PADDING_X, y);
            y += LINE_HEIGHT;
          });
          } else if (b.type === "item") {
            const slots = resolveSlots(b, fillState[b.id]);
            const allDone = slots.every((s) => s === 1);
            const wrapped = b.wrapped ?? [""];
            slots.forEach((s, i) => {
              const x = PADDING_X + i * 26;
              if (s === 0) {
                ctx.strokeStyle = "#26313A";
                ctx.lineWidth = 2;
                ctx.strokeRect(x, y - 15, 20, 20);
              } else if (s === 1) {
                ctx.fillStyle = "#26313A";
                ctx.fillRect(x, y - 15, 20, 20);
                ctx.strokeStyle = "#EAE4D6";
                ctx.lineWidth = 2;
                ctx.beginPath();
                ctx.moveTo(x + 4, y - 5);
                ctx.lineTo(x + 9, y);
                ctx.lineTo(x + 16, y - 12);
                ctx.stroke();
              } else {
                ctx.fillStyle = "#D9D3C1";
                ctx.fillRect(x, y - 15, 20, 20);
                ctx.strokeStyle = "#B9B2A0";
                ctx.lineWidth = 2;
                ctx.strokeRect(x, y - 15, 20, 20);
                ctx.strokeStyle = "#8A8375";
                ctx.beginPath();
                ctx.moveTo(x + 5, y - 5);
                ctx.lineTo(x + 15, y - 5);
                ctx.stroke();
              }
            });
            const textX = PADDING_X + (b.slotCount ?? slots.length) * 26 + 8;
            ctx.fillStyle = allDone ? "#8A8375" : "#26313A";
            ctx.font = "15px monospace";
            wrapped.forEach((line, i) => {
              ctx.fillText(line, textX, y + i * LINE_HEIGHT);
            });
            y += LINE_HEIGHT * wrapped.length;
          }
      });

      canvas.toBlob((blob) => {
        if (blob) resolve(blob);
        else reject(new Error("toBlob gagal"));
      }, "image/png");
    } catch (e) {
      reject(e);
    }
  });
}
