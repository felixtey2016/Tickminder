import { rows } from "@/lib/learning-server";

// Keep historical audit events immutable while resolving a merged identity's name.
export async function mergedAccountNames() {
  const events = await rows<{ afterJson: string | null }>("SELECT after_json AS afterJson FROM audit WHERE action = 'mergeAccount'");
  const names = new Map<string, string>();
  for (const event of events) {
    try {
      const data = JSON.parse(event.afterJson || "{}");
      if (typeof data.oldAccountId === "string" && typeof data.oldName === "string") names.set(data.oldAccountId, data.oldName);
    } catch { /* Historical malformed events do not prevent reading a lesson. */ }
  }
  return names;
}
