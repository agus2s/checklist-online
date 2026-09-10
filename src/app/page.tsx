"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import Sheet from "../components/Sheet";
import ChecklistViewer from "../components/ChecklistViewer";
import ChecklistEditor from "../components/ChecklistEditor";
import {
  DEFAULT_MARKDOWN,
  findSlotUnit,
  getProgress,
  parseMarkdown,
  resolveSlots,
  type ParsedDoc,
} from "../lib/markdown";
import { fetchStore, saveStore } from "../lib/store-client";
import { buildChecklistImage } from "../lib/snapshot";
import type { ItemState, StoreData } from "../lib/types";

type Mode = "view" | "edit";

export default function PublicChecklist() {
  const [loading, setLoading] = useState(true);
  const [template, setTemplate] = useState<ParsedDoc | null>(null);
  const [fillState, setFillState] = useState<Record<string, ItemState>>({});
  const [mode, setMode] = useState<Mode>("view");
  const [draft, setDraft] = useState(DEFAULT_MARKDOWN);
  const [toast, setToast] = useState("");
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const showToast = useCallback((msg: string) => {
    setToast(msg);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(""), 2200);
  }, []);

  const applyStore = useCallback((data: StoreData) => {
    if (data.template?.markdown) {
      setTemplate(parseMarkdown(data.template.markdown));
      setDraft(data.template.markdown);
      setMode("view");
    } else {
      setTemplate(null);
      setMode("edit");
    }
    setFillState(data.state || {});
    setLoading(false);
  }, []);

  const loadAll = useCallback(async () => {
    applyStore(await fetchStore());
  }, [applyStore]);

  useEffect(() => {
    let active = true;
    (async () => {
      const data = await fetchStore();
      if (active) applyStore(data);
    })();
    return () => {
      active = false;
    };
  }, [applyStore]);

  const publish = async () => {
    try {
      await saveStore({ template: { markdown: draft } });
      setTemplate(parseMarkdown(draft));
      setMode("view");
      showToast("Checklist diterbitkan");
    } catch {
      showToast("Gagal menyimpan. Coba lagi.");
    }
  };

  const cycleSlot = async (id: string, slotIndex: number) => {
    const item = template
      ? findSlotUnit(template.blocks, id)
      : undefined;
    if (!item) return;
    const prev = fillState;
    const slots = resolveSlots(item, prev[id]);
    if (slotIndex < 0 || slotIndex >= slots.length) return;
    const next = [...slots];
    if (next[slotIndex] === 2) return;
    next[slotIndex] = next[slotIndex] === 1 ? 0 : 1;
    const optimistic = { ...prev, [id]: { slots: next, at: 0 } };
    setFillState(optimistic);
    try {
      const data = await saveStore({ state: optimistic });
      setFillState(data.state || {});
    } catch {
      setFillState(prev);
      showToast("Gagal menyimpan centang. Coba lagi.");
    }
  };

  const resetAll = async () => {
    try {
      await saveStore({ state: {} });
      setFillState({});
      showToast("Semua centang direset");
    } catch {
      showToast("Gagal mereset.");
    }
  };

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(window.location.href);
      showToast("Tautan disalin");
    } catch {
      showToast("Tidak bisa menyalin otomatis, salin dari address bar.");
    }
  };

  const shareToWhatsApp = async () => {
    if (!template) return;
    const { doneSlots, totalSlots, pct } = getProgress(
      template.blocks,
      fillState
    );
    let link = "";
    try {
      link = window.location.href;
    } catch {
      link = "";
    }
    const captionText = `${template.title} — ${doneSlots}/${totalSlots} selesai\n${link}`;
    try {
      const blob = await buildChecklistImage({
        title: template.title,
        blocks: template.blocks,
        fillState,
        doneSlots,
        totalSlots,
        pct,
      });
      const file = new File([blob], "checklist.png", { type: "image/png" });
      if (navigator.canShare && navigator.canShare({ files: [file] })) {
        await navigator.share({
          title: template.title,
          text: captionText,
          files: [file],
        });
        return;
      }
      if (navigator.share) {
        await navigator.share({ title: template.title, text: captionText });
        return;
      }
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = "checklist.png";
      a.click();
      window.open(
        `https://wa.me/?text=${encodeURIComponent(captionText)}`,
        "_blank"
      );
      showToast("Gambar diunduh — lampirkan manual di chat WhatsApp");
    } catch {
      window.open(
        `https://wa.me/?text=${encodeURIComponent(captionText)}`,
        "_blank"
      );
      showToast("Gambar gagal dibuat, hanya tautan yang dibagikan");
    }
  };

  return (
    <div className="page-outer">
      <div className="page-inner">
        {loading ? (
          <div className="loading-box">Memuat checklist…</div>
        ) : mode === "edit" ? (
            <Sheet>
              <ChecklistEditor
                draft={draft}
                onDraftChange={setDraft}
                canCancel={template !== null}
                onPublish={publish}
                onCancel={() => setMode("view")}
              />
            </Sheet>
          ) : template ? (
            <div className="view-narrow">
              <Sheet>
                <ChecklistViewer
                  template={template}
                  fillState={fillState}
                  onCycleSlot={cycleSlot}
                  onEdit={() => setMode("edit")}
                  onShare={shareToWhatsApp}
                  onCopyLink={copyLink}
                  onRefresh={loadAll}
                  onReset={resetAll}
                />
              </Sheet>
            </div>
          ) : null}

        {toast && <div className="toast">{toast}</div>}

        <p className="page-footnote">
          Bagikan tautan ini — siapa pun yang membukanya bisa mencentang
          isinya. Tidak ada sinkronisasi otomatis, tekan &quot;Perbarui&quot;
          untuk melihat centangan terbaru dari orang lain.
        </p>
      </div>
    </div>
  );
}
