"use client";

import { useState } from "react";
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

function isDone(slots: SlotValue[]): boolean {
  const enabled = slots.filter((s) => s !== 2);
  return enabled.length > 0 && enabled.every((s) => s === 1);
}

type FilterTab = "all" | "done" | "todo";

export default function ChecklistViewer({
  template,
  fillState,
  onCycleSlot,
  onEdit,
  onShare,
  onCopyLink,
}: ChecklistViewerProps) {
  const { blocks } = template;
  const { items, doneSlots, totalSlots, pct } = getProgress(blocks, fillState);
  const sectionStats = getSectionStats(blocks, fillState);
  const [filter, setFilter] = useState<FilterTab>("all");

  const counts = { all: 0, done: 0, todo: 0 };
  blocks.forEach((b) => {
    if (b.type === "item") {
      const slots = resolveSlots(b, fillState[b.id]);
      counts.all++;
      if (isDone(slots)) counts.done++;
      else counts.todo++;
    } else if (b.type === "table") {
      for (const row of b.rows) {
        const slots = resolveSlots(row, fillState[row.id]);
        counts.all++;
        if (isDone(slots)) counts.done++;
        else counts.todo++;
      }
    }
  });

  const visible = (slots: SlotValue[]) => {
    if (filter === "all") return true;
    return filter === "done" ? isDone(slots) : !isDone(slots);
  };

  const visibleSections = new Set<number>();
  let currentSection: number | null = null;
  blocks.forEach((b, i) => {
    if (b.type === "section") {
      currentSection = i;
    } else if (b.type === "item") {
      if (visible(resolveSlots(b, fillState[b.id])) && currentSection !== null)
        visibleSections.add(currentSection);
    } else if (b.type === "table") {
      const hasVisible = b.rows.some((row) =>
        visible(resolveSlots(row, fillState[row.id]))
      );
      if (hasVisible && currentSection !== null) visibleSections.add(currentSection);
    }
  });

  const visibleBlocksCount =
    filter === "all" ? counts.all : filter === "done" ? counts.done : counts.todo;

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
            {counts.all > 0 && (
              <div className="filter-tabs">
                {(
                  [
                    ["all", "Semua", counts.all],
                    ["done", "Sudah", counts.done],
                    ["todo", "Belum", counts.todo],
                  ] as [FilterTab, string, number][]
                ).map(([value, label, count]) => (
                  <button
                    key={value}
                    className={`filter-tab${filter === value ? " active" : ""}`}
                    onClick={() => setFilter(value)}
                  >
                    {label} <span>{count}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
      <div>
        {blocks.map((b, idx) => {
          if (b.type === "section") {
            const stats = sectionStats[idx];
            if (filter !== "all") {
              if (!visibleSections.has(idx)) return null;
            } else if (!stats || stats.total === 0) return null;
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
            const visibleRows = b.rows.filter((row) =>
              visible(resolveSlots(row, fillState[row.id]))
            );
            if (visibleRows.length === 0) return null;
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
                    {visibleRows.map((row) => {
                      const slots = resolveSlots(row, fillState[row.id]);
                      const allDone = isDone(slots);
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
            if (!visible(slots)) return null;
            const allDone = isDone(slots);
            return (
              <div
                key={b.id}
                className={`check-card${allDone ? " checked" : ""}`}
                onClick={() => onCycleSlot(b.id, 0)}
              >
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
                        onClick={(e) => { e.stopPropagation(); onCycleSlot(b.id, si); }}
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

      {counts.all > 0 && visibleBlocksCount === 0 && (
        <div className="docs-empty">
          Tidak ada item di kategori ini.
        </div>
      )}

      <div className="action-row">
        <button className="sheet-btn primary" onClick={onShare}>
          Bagikan ke WhatsApp
        </button>
        <button className="sheet-btn" onClick={onCopyLink}>
          Salin tautan
        </button>
      </div>
    </>
  );
}