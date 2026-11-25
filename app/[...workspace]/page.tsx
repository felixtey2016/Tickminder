import { notFound } from "next/navigation";
import { SchedulerEntry } from "../scheduler-entry";
import { isWorkspacePath } from "@/lib/workspace-route";

// Explicit allow-list: arbitrary URLs must not become a second app entry.
export default async function WorkspacePage({ params }: { params: Promise<{ workspace: string[] }> }) {
  const { workspace } = await params;
  if (!isWorkspacePath("/" + workspace.join("/"))) notFound();
  return <SchedulerEntry />;
}

