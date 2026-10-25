import type { Metadata } from "next";
import { BRAND_NAME } from "@/lib/brand";
import "./globals.css";
import "./ui-refresh.css";
import "./course-navigation.css";
import "./teaching-layout.css";
import "./people-settings-layout.css";
import "./billing-layout.css";
import "./invoice-layout.css";
import "./finance-workspace.css";
import "./navigation-feedback.css";
import "./whatsapp-layout.css";
import "./recordings-layout.css";
import "./round-one-layout.css";
import "./workspace-startup.css";
import "./form-action-bar.css";
import { ActionToastHost } from "@/components/action-toast";

export const metadata: Metadata = {
  title: `${BRAND_NAME} · Learning & Collaboration`,
  description: `${BRAND_NAME} brings lesson schedules, homework and teaching materials together in one workspace.`,
  manifest: "/manifest.webmanifest",
  appleWebApp: { capable: true, title: BRAND_NAME, statusBarStyle: "default" },
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
