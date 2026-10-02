import type { Metadata } from "next";
import { BRAND_NAME } from "@/lib/brand";
import "./globals.css";
import { ActionToastHost } from "@/components/action-toast";

export const metadata: Metadata = {
  title: `${BRAND_NAME} · Learning & Collaboration`,
  description: `${BRAND_NAME} brings learning plans, assignments and shared resources together in one workspace.`,
  other: {
    "codex-preview": "development",
  },
  icons: {
    icon: "/timelyo-logo.png",
    shortcut: "/timelyo-logo.png",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-CN">
      <body className="antialiased">{children}<ActionToastHost/></body>
    </html>
  );
}
