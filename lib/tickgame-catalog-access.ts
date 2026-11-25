import {cookies} from "next/headers";
import {notFound,redirect} from "next/navigation";
import {currentBusinessAccount} from "@/lib/auth";
import {catalogCookie,tickGameCatalogAccess,openTickGameCatalog} from "@/lib/tickgame-demo";

export async function requireTickGameCatalog(language: "zh"|"en", administratorsOnly=false) {
  const session = (await cookies()).get(catalogCookie)?.value;
  const access=await tickGameCatalogAccess(session);
  if (access) {
    if(administratorsOnly&&access!=='admin')notFound();
    return access;
  }
  const account = await currentBusinessAccount();
  if (account?.role !== "admin") notFound();
  const entry = await openTickGameCatalog(language,account);
  if (!entry) notFound();
  redirect(entry);
}
