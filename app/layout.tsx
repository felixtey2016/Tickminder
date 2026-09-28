import type { Metadata } from "next";
import { BRAND_NAME } from "@/lib/brand";
import "./globals.css";
import { ActionToastHost } from "@/components/action-toast";

export const metadata: Metadata = {
  title: `${BRAND_NAME} · 排课与打卡`,
  description: `${BRAND_NAME} lesson scheduling, attendance, and monthly teaching hours.`,
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
