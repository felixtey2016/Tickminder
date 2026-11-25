"use client"

import * as React from "react"

// Page chrome ends at 92. Portalled modal siblings paint in DOM order;
// nested modal roots receive their own higher layer without changing focus handling.
const ModalLayerContext = React.createContext(100)

export function ModalLayer({ children }: { children: React.ReactNode }) {
  const parent = React.useContext(ModalLayerContext)
  return <ModalLayerContext.Provider value={parent + 2}>{children}</ModalLayerContext.Provider>
}

export function useModalLayer() { return React.useContext(ModalLayerContext) }
