"use client";

import { useCallback, useEffect, useRef, useState, type Dispatch, type SetStateAction } from "react";

// Payloads stay in memory, not URLs or persistent browser storage.
const payloads = new Map<string, unknown>();
export function clearDialogHistory() { payloads.clear(); }

export function useDialogState<T>(key: string, initial: T): [T, Dispatch<SetStateAction<T>>] {
  const [value, setValue] = useState(initial);
  const current = useRef(value);
  const initialRef = useRef(initial);
  useEffect(() => {
    const restore = () => {
      const entry = window.history.state?.timelyoOverlay;
      const next = entry?.key === key && payloads.has(entry.token) ? payloads.get(entry.token) as T : initialRef.current;
      current.current = next;
      setValue(next);
    };
    restore();
    window.addEventListener("popstate", restore);
    return () => window.removeEventListener("popstate", restore);
  }, [key]);
  const update = useCallback<Dispatch<SetStateAction<T>>>((input) => {
    const next = typeof input === "function" ? (input as (previous: T) => T)(current.current) : input;
    const state = window.history.state || {};
    const owned = state.timelyoOverlay?.key === key;
    if (next !== null) {
      const token = owned ? state.timelyoOverlay.token : crypto.randomUUID();
      payloads.set(token, next);
      const nextState = { ...state, timelyoOverlay: { key, token } };
      if (owned) window.history.replaceState(nextState, "");
      else window.history.pushState(nextState, "");
    } else if (owned) {
      window.history.back();
    }
    current.current = next;
    setValue(next);
  }, [key]);
  return [value, update];
}
