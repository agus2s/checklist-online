"use client";

import type { Block, ParsedDoc } from "../lib/markdown";
import { getProgress, resolveSlots } from "../lib/markdown";
import type { ItemState, SlotValue } from "../lib/types";
import ProgressRing from "./ProgressRing";
import SlotBox from "./SlotBox";

interface ChecklistViewerProps {
  template: ParsedDoc;
  fillState: Record<string, ItemState>;
  onCycleSlot: (id: string, slotIndex: number) => void;
  onEdit?: () => void;
  onShare: () => void;
  onCopyLink: () => void;
  onReset: () => void;
}

interface SectionStat {
  done: number;
  total: number;
}

function getSectionStats(
  blocks: Block[],
  fillState: Record<string, ItemState>
): Record<number, SectionStat> {
  const stats: Record<number, SectionStat> = {};
  let current: number | null = null;
  const count = (slots: SlotValue[]) => {
    const key = current ?? -1;
    if (!stats[key]) stats[key] = { done: 0, total: 0 };
    const enabled = slots.filter((s) => s !== 2);
    stats[key].total += enabled.length;
    stats[key].done += enabled.filter((s) => s === 1).length;
  };
  blocks.forEach((b, i) => {
    if (b.type === "section") {
      current = i;
    } else if (b.type === "item") {
      count(resolveSlots(b, fillState[b.id]));
    } else if (b.type === "table") {
      for (const row of b.rows) {
        count(resolveSlots(row, fillState[row.id]));
      }
    }
  });
  return stats;
}

export default function ChecklistViewer({
  template,
  fillState,
  onCycleSlot,
  onEdit,
  onShare,
  onCopyLink,
  onReset,
}: ChecklistViewerProps) {
  const { blocks } = template;
  const { items, doneSlots, totalSlots, pct } = getProgress(blocks, fillState);
  const sectionStats = getSectionStats(blocks, fillState);

  return (
    <>
      <div className="viewer-head">
        <h1 className="viewer-title">{template.title}</h1>
        {onEdit && (
          <button className="sheet-btn" onClick={onEdit}>
            Ubah
          </button>
        )}
      </div>

      {items.length > 0 && (
        <div className="summary-strip">
          <ProgressRing pct={pct} />
          <div className="summary-count-wrap">
            <div className="summary-count">
              <b>{doneSlots}</b> dari {totalSlots} kotak selesai
            </div>
          </div>
        </div>
      )}

      <div>
        {blocks.map((b, idx) => {
          if (b.type === "section") {
            const stats = sectionStats[idx];
            if (!stats || stats.total === 0) return null;
            return (
              <div key={idx} className="section-head">
                <span>{b.text}</span>
                <span className="section-pill">
                  {stats.done}/{stats.total}
                </span>
              </div>
            );
          }
          if (b.type === "divider") return <hr key={idx} className="block-divider" />;
          if (b.type === "paragraph")
            return (
              <p key={idx} className="block-paragraph">
                {b.text}
              </p>
            );
          if (b.type === "note")
            return (
              <div key={idx} className="block-note">
                · {b.text}
              </div>
            );
          if (b.type === "space") return <div key={idx} className="block-space" />;
          if (b.type === "table") {
            if (b.rows.length === 0) return null;
            return (
              <div key={idx} className="check-table-wrap">
                <table className="check-table">
                  <thead>
                    <tr>
                      {b.headers.map((h, i) => (
                        <th key={i}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {b.rows.map((row) => {
                      const slots = resolveSlots(row, fillState[row.id]);
                      const allDone = slots.length > 0 && slots.every((s) => s === 1);
                      return (
                        <tr key={row.id} className={allDone ? "checked" : undefined}>
                          <td className="table-num">{row.num}</td>
                          <td className={`table-name${allDone ? " checked" : ""}`}>
                            {row.text}
                          </td>
                          {slots.map((s, si) => (
                            <td key={si} className="table-slot">
                              {s === 2 ? (
                                <div className="slot-locked" title="Terkunci">
                                  <SlotBox value={s} />
                                </div>
                              ) : (
                                <div
                                  role="checkbox"
                                  aria-checked={s === 1}
                                  tabIndex={0}
                                  className="slot-hit"
                                  onClick={() => onCycleSlot(row.id, si)}
                                  onKeyDown={(e) => {
                                    if (e.key === "Enter" || e.key === " ") {
                                      e.preventDefault();
                                      onCycleSlot(row.id, si);
                                    }
                                  }}
                                >
                                  <SlotBox value={s} />
                                </div>
                              )}
                            </td>
                          ))}
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            );
          }
          if (b.type === "item") {
            const slots = resolveSlots(b, fillState[b.id]);
            const allDone = slots.length > 0 && slots.every((s) => s === 1);
            return (
              <div key={b.id} className={`check-card${allDone ? " checked" : ""}`}>
                <div className="slot-group">
                  {slots.map((s, si) =>
                    s === 2 ? (
                      <div key={si} className="slot-locked" title="Terkunci">
                        <SlotBox value={s} />
                      </div>
                    ) : (
                      <div
                        key={si}
                        role="checkbox"
                        aria-checked={s === 1}
                        tabIndex={0}
                        className="slot-hit"
                        onClick={() => onCycleSlot(b.id, si)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" || e.key === " ") {
                            e.preventDefault();
                            onCycleSlot(b.id, si);
                          }
                        }}
                      >
                        <SlotBox value={s} />
                      </div>
                    )
                  )}
                </div>
                <div className="check-card-main">
                  <div className={`check-card-text${allDone ? " checked" : ""}`}>{b.text}</div>
                </div>
              </div>
            );
          }
          return null;
        })}
      </div>

      <div className="action-row">
        <button className="sheet-btn primary" onClick={onShare}>
          Bagikan ke WhatsApp
        </button>
        <button className="sheet-btn" onClick={onCopyLink}>
          Salin tautan
        </button>
        <button className="sheet-btn" onClick={onReset}>
          Reset semua centang
        </button>
      </div>
    </>
  );
}