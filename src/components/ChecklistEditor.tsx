"use client";

import { useRef, useState } from "react";
import { marked } from "marked";
import { cycleTaskSlot, expandTaskBoxesForPreview } from "../lib/markdown";

interface ChecklistEditorProps {
  draft: string;
  onDraftChange: (value: string) => void;
  canCancel: boolean;
  onPublish: () => void;
  onCancel: () => void;
}

function renderPreview(draft: string): string {
  return marked.parse(expandTaskBoxesForPreview(draft), {
    async: false,
  }) as string;
}

export default function ChecklistEditor({
  draft,
  onDraftChange,
  canCancel,
  onPublish,
  onCancel,
}: ChecklistEditorProps) {
  const previewRef = useRef<HTMLDivElement | null>(null);
  const [showHelp, setShowHelp] = useState(false);

  const cyclePreviewSlot = (e: React.MouseEvent<HTMLDivElement>) => {
    const target = e.target as HTMLElement;
    if (!(target instanceof HTMLInputElement) || target.type !== "checkbox")
      return;
    const boxes = Array.from(
      previewRef.current?.querySelectorAll<HTMLInputElement>(
        'input[type="checkbox"]'
      ) ?? []
    );
    const idx = boxes.indexOf(target);
    if (idx < 0) return;
    onDraftChange(cycleTaskSlot(draft, idx));
  };

  return (
    <>
      <div className="editor-head">
        <h1 className="editor-title">Susun checklist</h1>
        <button
          className="sheet-btn help-btn"
          onClick={() => setShowHelp(true)}
        >
          Bantuan
        </button>
      </div>
      <div className="editor-split">
        <div className="editor-panel">
          <div className="panel-label">Markdown</div>
          <textarea
            className="editor"
            value={draft}
            onChange={(e) => onDraftChange(e.target.value)}
          />
        </div>
        <div className="editor-panel">
          <div className="panel-label">Preview</div>
          <div className="editor-preview">
            {draft.trim() === "" ? (
              <div className="editor-preview-empty">
                Kosong — tulis markdown di panel kiri.
              </div>
            ) : (
              <div
                ref={previewRef}
                className="markdown-body"
                onClick={cyclePreviewSlot}
                dangerouslySetInnerHTML={{ __html: renderPreview(draft) }}
              />
            )}
          </div>
        </div>
      </div>
      <div className="action-row">
        <button className="sheet-btn primary" onClick={onPublish}>
          Terbitkan checklist
        </button>
        {canCancel && (
          <button className="sheet-btn" onClick={onCancel}>
            Batal
          </button>
        )}
      </div>

      {showHelp && (
        <div
          className="modal-backdrop"
          onClick={() => setShowHelp(false)}
        >
          <div
            className="modal"
            role="dialog"
            aria-modal="true"
            aria-label="Panduan markdown"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="modal-head">
              <div className="modal-title">Panduan markdown</div>
              <button
                className="modal-close"
                onClick={() => setShowHelp(false)}
                aria-label="Tutup"
              >
                ×
              </button>
            </div>
            <div className="modal-body">
              <p>
                Tulis pakai markdown: <code>#</code> untuk judul,{" "}
                <code>##</code> untuk bagian, <code>- [ ] Tugas</code> untuk
                satu kotak centang, atau <code>- [ ] [ ] [ ] Fikih</code>{" "}
                untuk beberapa kotak per baris. Klik kotak di preview untuk
                mencentang atau membuka centang. Awalan <code>[-]</code>{" "}
                mengunci kotak: tetap terlihat tapi tidak bisa diklik.
              </p>
              <p>
                Punya rekap berbentuk tabel? Tempel langsung markdown-nya —
                baris <code>| 3 | Fikih | [ ] | [ ] | [ ] |</code> dirender
                sebagai tabel asli, kolom pertama nomor, kedua nama, sisanya
                kotak centang.
              </p>
              <p>
                Mengubah teks item di tengah jalan bisa menggeser status
                centang item lain, jadi sebaiknya tambah item baru di akhir
                bagian.
              </p>
            </div>
            <div className="modal-foot">
              <button
                className="sheet-btn primary"
                onClick={() => setShowHelp(false)}
              >
                Mengerti
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
