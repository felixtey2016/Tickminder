"use client";
import { createContext, useContext, type ReactNode } from "react";
import { canAdminAction, type AdminPermissionAccount } from "@/lib/admin-permission-client";
import type { AdminGrantKey } from "@/lib/admin-permissions";

export const AdminPermissionContext = createContext<AdminPermissionAccount | null>(null);
export function useAdminPermissionAccount() { return useContext(AdminPermissionContext); }
export function useAdminAction() {
  const account = useAdminPermissionAccount();
  return (key: AdminGrantKey) => canAdminAction(account, key);
}
export function AdminPermissionGate({ grant, children }: { grant: AdminGrantKey; children: ReactNode }) {
  const can = useAdminAction();
  return can(grant) ? children : null;
}
