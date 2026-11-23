import {cookies} from "next/headers";
import {notFound,redirect} from "next/navigation";
import {currentBusinessAccount} from "@/lib/auth";
import {catalogCookie,hasTickGameCatalogSession,openTickGameCatalog} from "@/lib/tickgame-demo";

export async function requireTickGameCatalog(language: "zh"|"en") {
  const session = (await cookies()).get(catalogCookie)?.value;
  if (await hasTickGameCatalogSession(session)) return;
  if ((await currentBusinessAccount())?.role !== "admin") notFound();
  const entry = await openTickGameCatalog(language);
  if (!entry) notFound();
  redirect(entry);
}
