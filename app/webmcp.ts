"use client";
import {groupFetch} from "@/lib/group-client";

import { useEffect, useRef } from "react";

type Lesson = { id: string; student: string; subject: string; plannedStart: string; status: string };
type Context = { registerTool: (tool: { name: string; title: string; description: string; inputSchema: object; annotations: { readOnlyHint: boolean }; execute: (input: unknown) => Promise<unknown> }, options: { signal: AbortSignal }) => Promise<void> | void };
declare global { interface Document { modelContext?: Context } }

export function useLessonWebMcp(role: string | undefined, lessons: Lesson[], reload: () => Promise<void>, getLessons?: () => Promise<Lesson[]>, identity = role || "anonymous") {
  const latest=useRef({lessons,reload,getLessons});latest.current={lessons,reload,getLessons};
  useEffect(() => {
    const context = document.modelContext;
    if (!context?.registerTool || role !== "teacher") return;
    const lifecycle = new AbortController();
    const currentLessons=async()=>{
      if(lifecycle.signal.aborted)throw new Error("Account context changed; retry from the current page");
      const source=latest.current;
      const current=source.getLessons?await source.getLessons():source.lessons;
      if(lifecycle.signal.aborted)throw new Error("Account context changed; retry from the current page");
      return current;
    };
    void Promise.resolve(context.registerTool({ name: "list_my_lessons", title: "List my lessons", description: "Read the signed-in teacher's assigned lessons.", inputSchema: { type: "object", properties: {}, additionalProperties: false }, annotations: { readOnlyHint: true }, async execute() { return (await currentLessons()).map(l => ({ id: l.id, student: l.student, subject: l.subject, plannedStart: l.plannedStart, status: l.status })); } }, { signal: lifecycle.signal })).catch(() => {});
    void Promise.resolve(context.registerTool({ name: "record_lesson_attendance", title: "Record lesson attendance", description: "Record attendance and actual Malaysia local times for one assigned lesson, then refresh the visible schedule.", inputSchema: { type: "object", properties: { id: { type: "string" }, status: { type: "string", enum: ["completed", "student_absent", "teacher_absent"] }, actualStart: { type: "string" }, actualEnd: { type: "string" }, note: { type: "string" } }, required: ["id", "status"], additionalProperties: false }, annotations: { readOnlyHint: false }, async execute(input) {
      const x = input as Record<string, unknown>;
      if (!(await currentLessons()).some(l => l.id === x.id)) throw new Error("Lesson is not in your assigned list");
      if (!["completed", "student_absent", "teacher_absent"].includes(String(x.status))) throw new Error("Invalid attendance status");
      if(lifecycle.signal.aborted)throw new Error("Account context changed; retry from the current page");
      const response = await groupFetch("/api/action", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "attendance", id: x.id, status: x.status, actualStart: x.actualStart, actualEnd: x.actualEnd, note: x.note || "" }) });
      const body = await response.json() as { error?: string };
      if (!response.ok) throw new Error(body.error || "Attendance failed");
      await latest.current.reload(); return { id: x.id, saved: true };
    } }, { signal: lifecycle.signal })).catch(() => {});
    return () => lifecycle.abort();
  }, [role,identity]);
}
