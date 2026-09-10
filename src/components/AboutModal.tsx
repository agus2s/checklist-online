"use client";

import { useState } from "react";

const CREDITS: { name: string; url: string }[] = [
  { name: "Next.js", url: "https://nextjs.org" },
  { name: "React", url: "https://react.dev" },
  { name: "TypeScript", url: "https://www.typescriptlang.org" },
  { name: "Supabase", url: "https://supabase.com" },
  { name: "marked", url: "https://marked.js.org" },
  { name: "Vercel", url: "https://vercel.com" },
];

export default function AboutModal() {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        className="about-trigger"
        onClick={() => setOpen(true)}
        aria-label="Tentang"
        title="Tentang"
      >
        <svg viewBox="0 0 24 24" aria-hidden>
          <circle cx="12" cy="12" r="9" />
          <path d="M12 8h.01" />
          <path d="M12 11v5" />
        </svg>
      </button>

      {open && (
        <div className="modal-backdrop" onClick={() => setOpen(false)}>
          <div
            className="modal"
            role="dialog"
            aria-modal="true"
            aria-label="Tentang Ceklis Kita"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="modal-head">
              <div className="modal-title">Tentang</div>
              <button
                className="modal-close"
                onClick={() => setOpen(false)}
                aria-label="Tutup"
              >
                ×
              </button>
            </div>
            <div className="modal-body">
              <div className="about-brand">Ceklis Kita</div>
              <p>
                Ceklis bersama yang bisa dicentang siapa pun lewat tautan.
                Perubahan langsung terlihat oleh semua yang membuka halaman
                yang sama.
              </p>

              <p className="about-copy">© Agus Supriyadi 2026</p>

              <div className="about-sub">Kredit</div>
              <ul className="about-credits">
                {CREDITS.map((c) => (
                  <li key={c.name}>
                    <a
                      href={c.url}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      {c.name}
                    </a>
                  </li>
                ))}
              </ul>
            </div>
            <div className="modal-foot">
              <button
                className="sheet-btn primary"
                onClick={() => setOpen(false)}
              >
                Tutup
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}