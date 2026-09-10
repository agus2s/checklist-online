import type { ReactNode } from "react";

export default function Sheet({ children }: { children: ReactNode }) {
  return (
    <div className="sheet">
      <div className="sheet-perforation" aria-hidden="true" />
      <div className="sheet-body">{children}</div>
    </div>
  );
}
