"use client";
import { createContext, useCallback, useContext, useEffect, useRef, useState, type SetStateAction } from "react";

export const FilterScope = createContext("anonymous");
// Device preferences only. Account scoping prevents shared-browser filter leakage.
export function useFilterPreference<T extends string | boolean>(key: string, initial: T, accountScope?: string) {
  const contextScope = useContext(FilterScope);
  const scope = accountScope || contextScope;
  const storageKey = `timelyo-filter:${scope}:${key}`;
  const [value, setValue] = useState(initial);
  const current = useRef(initial);
  useEffect(() => {
    let next = initial;
    try { const saved = JSON.parse(localStorage.getItem(storageKey) || "null"); if (typeof saved === typeof initial) next = saved; } catch { /* Private browsing may disable storage. */ }
    current.current = next; setValue(next);
  }, [storageKey, initial]);
  const update = useCallback((input: SetStateAction<T>) => {
    const next = typeof input === "function" ? input(current.current) : input;
    current.current = next; setValue(next);
    try { localStorage.setItem(storageKey, JSON.stringify(next)); } catch { /* Filtering still works without persistence. */ }
  }, [storageKey]);
  return [value, update] as const;
}
