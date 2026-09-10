import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Checklist Online",
  description: "Checklist bersama yang bisa dicentang siapa pun lewat tautan.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="id">
      <body>{children}</body>
    </html>
  );
}
