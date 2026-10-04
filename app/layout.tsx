import type { Metadata } from "next";
import { BRAND_NAME } from "@/lib/brand";
import "./globals.css";
import "./ui-refresh.css";
import { ActionToastHost } from "@/components/action-toast";

export const metadata: Metadata = {
  title: `${BRAND_NAME} · Learning & Collaboration`,
  description: `${BRAND_NAME} brings learning plans, assignments and shared resources together in one workspace.`,
  manifest: "/manifest.webmanifest",
  appleWebApp: { capable: true, title: BRAND_NAME, statusBarStyle: "default" },
  other: {
    "codex-preview": "development",
  },
  icons: {
    icon: "/tickminder-logo-192.png",
    shortcut: "/tickminder-logo-192.png",
    apple: "/tickminder-logo-192.png",
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
