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
  const pendingRef = useRef<Record<string, ItemState>>({});
  const loadBusyRef = useRef(false);

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
      const pending = pendingRef.current;
      const server = data.state || {};
      const next: Record<string, ItemState> = { ...server };
      for (const [id, p] of Object.entries(pending)) {
        const s = server[id];
        if (!s || (p.at ?? 0) >= (s.at ?? 0)) next[id] = p;
        else delete pending[id];
      }
      setFillState(next);
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
    if (loadBusyRef.current) return;
    loadBusyRef.current = true;
    try {
      const data = await fetchDoc(slug);
      if (data) applyDoc(data);
      else {
        setTemplate(null);
        setLoaded(true);
      }
    } finally {
      loadBusyRef.current = false;
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
    const poll = () => load();
    let timer: ReturnType<typeof setInterval> | null = null;
    const start = () => {
      if (!timer) timer = setInterval(poll, 1500);
    };
    const stop = () => {
      if (timer) {
        clearInterval(timer);
        timer = null;
      }
    };
    const onVis = () => (document.hidden ? stop() : start());
    document.addEventListener("visibilitychange", onVis);
    start();
    return () => {
      stop();
      document.removeEventListener("visibilitychange", onVis);
    };
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
    const optimistic = { ...prev, [id]: { slots: next, at: Date.now() } };
    pendingRef.current[id] = optimistic[id];
    setFillState(optimistic);
    try {
      const data = await saveDoc(slug, { state: optimistic });
      delete pendingRef.current[id];
      const server = data.state || {};
      const merged = { ...server };
      for (const [pid, p] of Object.entries(pendingRef.current)) {
        const s = server[pid];
        if (!s || (p.at ?? 0) >= (s.at ?? 0)) merged[pid] = p;
        else delete pendingRef.current[pid];
      }
      setFillState(merged);
    } catch {
      delete pendingRef.current[id];
      setFillState(prev);
      showToast("Gagal menyimpan centang. Coba lagi.");
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
          isinya. Perubahan dari semua pengguna muncul hampir seketika
          (memuat ulang otomatis setiap 1,5 detik saat tab terbuka).
        </p>
      </div>
    </div>
  );
}