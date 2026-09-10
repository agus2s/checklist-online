"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import Sheet from "../components/Sheet";
import ChecklistEditor from "../components/ChecklistEditor";
import {
  DEFAULT_MARKDOWN,
  extractTitle,
  setMarkdownTitle,
} from "../lib/markdown";
import {
  deleteDoc,
  fetchDoc,
  fetchDocs,
  saveDoc,
} from "../lib/doc-client";
import type { DocMeta } from "../lib/types";

const SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

function randomSlug(length = 6): string {
  const chars = "abcdefghijklmnopqrstuvwxyz0123456789";
  let out = "";
  for (let i = 0; i < length; i++) {
    out += chars[Math.floor(Math.random() * chars.length)];
  }
  return out;
}

export default function EditorHome() {
  const [docs, setDocs] = useState<DocMeta[]>([]);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState<"docs" | "edit">("docs");
  const [draft, setDraft] = useState(DEFAULT_MARKDOWN);
  const [docTitle, setDocTitle] = useState(extractTitle(DEFAULT_MARKDOWN));
  const [slug, setSlug] = useState("");
  const [originalSlug, setOriginalSlug] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState("");
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const showToast = useCallback((msg: string) => {
    setToast(msg);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(""), 2200);
  }, []);

  const loadDocs = useCallback(async () => {
    const list = await fetchDocs();
    setDocs(list);
    setLoading(false);
  }, []);

  useEffect(() => {
    let active = true;
    (async () => {
      const list = await fetchDocs();
      if (active) {
        setDocs(list);
        setLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, []);

  const newDoc = useCallback(() => {
    setDraft(DEFAULT_MARKDOWN);
    setDocTitle(extractTitle(DEFAULT_MARKDOWN));
    setSlug(randomSlug());
    setOriginalSlug(null);
    setView("edit");
  }, []);

  const editDoc = useCallback(
    async (meta: DocMeta) => {
      const data = await fetchDoc(meta.slug);
      if (!data || !data.template) {
        showToast("Dokumen tidak ditemukan");
        loadDocs();
        return;
      }
      setDraft(data.template.markdown);
      setDocTitle(extractTitle(data.template.markdown));
      setSlug(meta.slug);
      setOriginalSlug(meta.slug);
      setView("edit");
    },
    [loadDocs, showToast]
  );

  const cancelEdit = useCallback(() => {
    setView("docs");
    loadDocs();
  }, [loadDocs]);

  const publish = async () => {
    const finalDraft = setMarkdownTitle(draft, docTitle);
    let target = slug.trim().toLowerCase();
    if (!target) target = randomSlug();
    if (!SLUG_RE.test(target)) {
      showToast("Slug hanya huruf/angka kecil dan tanda hubung.");
      return;
    }
    if (target !== originalSlug && docs.some((d) => d.slug === target)) {
      showToast("Slug sudah dipakai dokumen lain. Ganti yang baru.");
      return;
    }
    setBusy(true);
    try {
      await saveDoc(target, { template: { markdown: finalDraft } });
      setOriginalSlug(target);
      showToast("Checklist diterbitkan");
      setView("docs");
      await loadDocs();
    } catch {
      showToast("Gagal menyimpan. Coba lagi.");
    } finally {
      setBusy(false);
    }
  };

  const removeDoc = async (meta: DocMeta) => {
    if (!window.confirm(`Hapus "${meta.title}" beserta semua centangnya?`))
      return;
    try {
      await deleteDoc(meta.slug);
      showToast("Dokumen dihapus");
      await loadDocs();
    } catch {
      showToast("Gagal menghapus.");
    }
  };

  return (
    <div className="page-outer">
      <div className="page-inner">
        {loading ? (
          <div className="loading-box">Memuat…</div>
        ) : view === "docs" ? (
          <div className="view-narrow">
            <Sheet>
              <div className="editor-head">
                <h1 className="editor-title">Kelola checklist</h1>
                <button className="sheet-btn primary" onClick={newDoc}>
                  Buat baru
                </button>
              </div>

              {docs.length === 0 ? (
                <div className="docs-empty">
                  Belum ada checklist. Buat yang pertama lewat tombol di
                  atas — setiap checklist punya tautan uniknya sendiri.
                </div>
              ) : (
                <div className="docs-list">
                  {docs.map((d) => (
                    <div key={d.slug} className="doc-card">
                      <div className="doc-info">
                        <div className="doc-title-row">
                          <Link
                            className="doc-title"
                            href={`/d/${d.slug}`}
                          >
                            {d.title}
                          </Link>
                          <span className="doc-slug">/d/{d.slug}</span>
                        </div>
                        <div className="doc-meta">
                          Diperbarui{" "}
                          {new Date(d.updatedAt).toLocaleString("id-ID")}
                        </div>
                      </div>
                      <div className="doc-actions">
                        <Link className="sheet-btn" href={`/d/${d.slug}`}>
                          Buka
                        </Link>
                        <button
                          className="sheet-btn"
                          onClick={() => editDoc(d)}
                        >
                          Edit
                        </button>
                        <button
                          className="sheet-btn"
                          onClick={() => removeDoc(d)}
                        >
                          Hapus
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              <p className="page-footnote">
                Setiap checklist punya tautan sendiri (contoh:{" "}
                <code>/d/nama-tautan</code>). Bagikan tautan itu — siapa pun
                yang membukanya bisa mencentang isinya. Menyusun dan mengubah
                isi hanya dilakukan dari halaman ini.
              </p>
            </Sheet>
          </div>
        ) : (
          <div className="view-narrow">
            <Sheet>
              <button className="sheet-btn back-link" onClick={cancelEdit}>
                ← Daftar
              </button>
              <ChecklistEditor
                title={originalSlug ? "Edit checklist" : "Checklist baru"}
                draft={draft}
                onDraftChange={setDraft}
                canCancel
                slug={slug}
                onSlugChange={setSlug}
                docTitle={docTitle}
                onDocTitleChange={setDocTitle}
                onPublish={publish}
                onCancel={cancelEdit}
              />
              {busy && <div className="busy-note">Menyimpan…</div>}
            </Sheet>
          </div>
        )}

        {toast && <div className="toast">{toast}</div>}
      </div>
    </div>
  );
}