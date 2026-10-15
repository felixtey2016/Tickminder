"use client";
import { useCallback, useEffect, useState } from "react";
import { groupFetch } from "@/lib/group-client";
import { isCatalogueScope, validateCatalogueSyllabuses, type AcademicCatalogue, type CatalogueScope } from "@/lib/academic-catalogue";

type Entry = {catalogue:AcademicCatalogue|null;error:string;loading:boolean;at:number;generation:number;listeners:Set<()=>void>;request?:Promise<void>;controller?:AbortController};
const entries: Record<CatalogueScope, Entry> = {
  student:{catalogue:null,error:"",loading:false,at:0,generation:0,listeners:new Set()},
  quiz:{catalogue:null,error:"",loading:false,at:0,generation:0,listeners:new Set()},
};
const refreshMs = 60_000;
const emit = (entry: Entry) => entry.listeners.forEach(listener => listener());
async function load(scope: CatalogueScope, force = false, supersede = false): Promise<void> {
  const entry = entries[scope];
  if (entry.request && !supersede) return entry.request;
  if (!force && entry.catalogue && Date.now() - entry.at < refreshMs) return;
  entry.controller?.abort();
  const controller = new AbortController(), generation = ++entry.generation;
  entry.controller = controller; entry.loading = true; entry.error = ""; emit(entry);
  const pending = (async () => {
    await Promise.resolve();
    try {
      const response = await groupFetch(`/api/academic-catalogues?scope=${scope}`, {cache:"no-store", signal:controller.signal});
      const value = await response.json() as AcademicCatalogue & {error?:string};
      if (!response.ok) throw new Error(value.error || "课程菜单加载失败，请重试");
      if (!isCatalogueScope(value.scope) || value.scope !== scope || !Number.isSafeInteger(value.revision) || value.revision < 1) throw new Error("课程菜单格式无效");
      const syllabuses = validateCatalogueSyllabuses(value.syllabuses);
      if (generation !== entry.generation) return;
      // Only public menu content is shared across role changes in this browser.
      // Management permission is checked independently by the owner UI/server.
      if (!entry.catalogue || value.revision >= entry.catalogue.revision) entry.catalogue = {scope,revision:value.revision,syllabuses};
      entry.at = Date.now();
    } catch (error) {
      if (generation === entry.generation && !controller.signal.aborted) {
        entry.error = error instanceof Error ? error.message : "课程菜单加载失败，请重试";
        if (!entry.catalogue) entry.at = 0;
      }
    } finally {
      if (generation === entry.generation) { entry.loading = false; entry.request = undefined; entry.controller = undefined; emit(entry); }
    }
  })();
  entry.request = pending;
  return pending;
}

export function useAcademicCatalogue(scope: CatalogueScope) {
  const [,render] = useState(0);
  useEffect(() => {
    const entry = entries[scope], listener = () => render(value => value + 1);
    entry.listeners.add(listener);
    void load(scope);
    const refresh = () => { if (document.visibilityState !== "hidden") void load(scope, true); };
    const changed = (event: Event) => { const target = (event as CustomEvent<{scope?:CatalogueScope}>).detail?.scope; if (!target || target === scope) void load(scope, true); };
    const timer = window.setInterval(refresh, refreshMs);
    window.addEventListener("focus", refresh);
    document.addEventListener("visibilitychange", refresh);
    window.addEventListener("tickminder:catalogue-changed", changed);
    return () => { entry.listeners.delete(listener); window.clearInterval(timer); window.removeEventListener("focus", refresh); document.removeEventListener("visibilitychange", refresh); window.removeEventListener("tickminder:catalogue-changed", changed); };
  }, [scope]);
  const reload = useCallback(() => load(scope, true, true), [scope]);
  const entry = entries[scope];
  return {catalogue:entry.catalogue,loading:entry.loading || !entry.catalogue && !entry.error,error:entry.error,reload};
}
