"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import Sheet from "@/components/Sheet";
import ChecklistViewer from "@/components/ChecklistViewer";
import {
  findSlotUnit,
  getProgress,
  parseMarkdown,
  resolveSlots,
  type ParsedDoc,
} from "@/lib/markdown";
import { fetchDoc, saveDoc } from "@/lib/doc-client";
import { buildChecklistImage } from "@/lib/snapshot";
import type { ItemState } from "@/lib/types";

export default function VisitChecklist() {
  const params = useParams<{ slug: string }>();
  const slug = (params?.slug ?? "").toLowerCase();

  const [loaded, setLoaded] = useState(false);
  const [template, setTemplate] = useState<ParsedDoc | null>(null);
  const [fillState, setFillState] = useState<Record<string, ItemState>>({});
  const [toast, setToast] = useState("");
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const showToast = useCallback((msg: string) => {
    setToast(msg);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(""), 2200);
  }, []);

  const applyDoc = useCallback(
    (data: { template: { markdown: string } | null; state?: Record<string, ItemState> }) => {
      if (data.template?.markdown) {
        setTemplate(parseMarkdown(data.template.markdown));
      } else {
        setTemplate(null);
      }
      setFillState(data.state || {});
      setLoaded(true);
    },
    []
  );

  const load = useCallback(async () => {
    if (!slug) {
      setTemplate(null);
      setLoaded(true);
      return;
    }
    const data = await fetchDoc(slug);
    if (data) applyDoc(data);
    else {
      setTemplate(null);
      setLoaded(true);
    }
  }, [slug, applyDoc]);

  useEffect(() => {
    let active = true;
    (async () => {
      if (!slug) {
        setTemplate(null);
        setLoaded(true);
        return;
      }
      const data = await fetchDoc(slug);
      if (!active) return;
      if (data) applyDoc(data);
      else {
        setTemplate(null);
        setLoaded(true);
      }
    })();
    return () => {
      active = false;
    };
  }, [slug, applyDoc]);

  useEffect(() => {
    const timer = setInterval(() => {
      load();
    }, 10000);
    return () => clearInterval(timer);
  }, [load]);

  const cycleSlot = async (id: string, slotIndex: number) => {
    if (!template) return;
    const item = findSlotUnit(template.blocks, id);
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
      const data = await saveDoc(slug, { state: optimistic });
      setFillState(data.state || {});
    } catch {
      setFillState(prev);
      showToast("Gagal menyimpan centang. Coba lagi.");
    }
  };

  const resetAll = async () => {
    try {
      const data = await saveDoc(slug, { state: {} });
      setFillState(data.state || {});
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
        {!loaded ? (
          <div className="loading-box">Memuat checklist…</div>
        ) : template ? (
          <div className="view-narrow">
            <Sheet>
              <ChecklistViewer
                template={template}
                fillState={fillState}
                onCycleSlot={cycleSlot}
                onShare={shareToWhatsApp}
                onCopyLink={copyLink}
                onRefresh={load}
                onReset={resetAll}
              />
            </Sheet>
          </div>
        ) : (
          <div className="view-narrow">
            <Sheet>
              <div className="docs-empty">
                Checklist <code>/d/{slug}</code> tidak ditemukan atau belum
                diterbitkan.
              </div>
              <div className="action-row">
                <Link className="sheet-btn" href="/">
                  Kembali ke halaman utama
                </Link>
              </div>
            </Sheet>
          </div>
        )}

        {toast && <div className="toast">{toast}</div>}

        <p className="page-footnote">
          Bagikan tautan ini — siapa pun yang membukanya bisa mencentang
          isinya. Halaman memuat data terbaru otomatis setiap 10 detik;
          klik &quot;Perbarui&quot; untuk langsung merefresh sekarang.
        </p>
      </div>
    </div>
  );
}