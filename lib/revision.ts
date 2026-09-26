import { sql } from "drizzle-orm";
import { getDb } from "@/db";
import { audit } from "@/db/schema";

export async function readRevision() {
  const row = await getDb().select({ value: sql<number>`coalesce(max(rowid), 0)` }).from(audit).get();
  return Number(row?.value || 0);
}
