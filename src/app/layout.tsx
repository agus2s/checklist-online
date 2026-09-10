import type { Metadata } from "next";
import Link from "next/link";
import AboutModal from "../components/AboutModal";
import "./globals.css";

export const metadata: Metadata = {
  title: "Ceklis Kita",
  description: "Ceklis bersama yang bisa dicentang siapa pun lewat tautan.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="id">
      <body>
        <header className="site-header">
          <Link href="/" className="site-brand">
            <span className="brand-mark" aria-hidden>
              ✓
            </span>
            Ceklis Kita
          </Link>
          <AboutModal />
        </header>
        {children}
      </body>
    </html>
  );
}
