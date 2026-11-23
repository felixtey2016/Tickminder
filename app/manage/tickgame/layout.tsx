import type {Metadata} from "next";
import {notFound} from "next/navigation";
import {cookies} from "next/headers";
import {catalogCookie,hasTickGameCatalogSession} from "@/lib/tickgame-demo";
import {currentBusinessAccount} from "@/lib/auth";
import "@/components/legal-document.css";
import "@/components/tickgame-demo.css";

export const metadata: Metadata = {title: "TickGame · Tickminder", robots: {index: false, follow: false}};

export default async function TickGameLayout({children}: {children: React.ReactNode}) {
  const session = (await cookies()).get(catalogCookie)?.value;
  if (!await hasTickGameCatalogSession(session)) {
    const account = await currentBusinessAccount();
    if (account?.role !== "admin") notFound();
  }
  return children;
}
