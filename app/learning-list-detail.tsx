"use client";

import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { ArrowLeft, ChevronRight, FileText } from "lucide-react";
import { Button } from "@/components/ui/button";
import { getLanguage, t } from "@/lib/i18n";
import { canNavigateBack, usePageHistoryState } from "@/lib/page-history";
import type { Homework, Submission } from "./learning-portal";
import "./learning-list-detail.css";

export const learningLabel = (zh: string, en: string) => getLanguage() === "en" ? en : zh;

export function latestSubmissions(submissions: Submission[]) {
  return [...submissions].sort((a, b) => (b.attempt || 0) - (a.attempt || 0) || b.submittedAt.localeCompare(a.submittedAt) || b.id.localeCompare(a.id));
}

export function homeworkSummary(item: Homework, submissions: Submission[]) {
  const recipients = item.recipients || [];
  const latest = recipients.map(student => latestSubmissions(submissions.filter(row => row.homeworkId === item.id && row.studentName === student))[0]);
  const submitted = latest.filter(Boolean).length;
  const late = latest.filter(row => row?.late).length;
  return `${t("已提交")} ${submitted}/${recipients.length}${late ? ` · ${t("迟交")} ${late}` : ""}`;
}

type RecordItem = { id: string; title: string };
type RowSummary = { context?: string; meta?: string; status?: string };

/** Selection is independent of filters; returning to the list retains its controls and scroll. */
export function LearningListDetail<T extends RecordItem>({ items, summary, renderDetail, empty, historyKey }: {
  items: T[];
  historyKey: string;
  summary: (item: T) => RowSummary;
  renderDetail: (item: T) => ReactNode;
  empty?: ReactNode;
}) {
  const [selectedId, setSelectedId, replaceSelectedId] = usePageHistoryState(`learning.detail:${historyKey}`, "");
  const [visitedIds, setVisitedIds] = useState<string[]>([]);
  const selected = items.find(item => item.id === selectedId);
  const listRef = useRef<HTMLDivElement>(null);
  const detailRef = useRef<HTMLElement>(null);
  const returnScroll = useRef(0);
  const previousSelected = useRef("");
  const detailId = useId();
  useEffect(() => {
    const previous = previousSelected.current;
    previousSelected.current = selectedId;
    if (selectedId === previous) return;
    if (selectedId) {
      setVisitedIds(ids => ids.includes(selectedId) ? ids : [...ids, selectedId]);
      const entry = window.history.state?.timelyoLearningDetail;
      if (entry?.key === historyKey) returnScroll.current = entry.scrollY;
    }
    const frame = requestAnimationFrame(() => {
      if (selectedId) {
        const pane = detailRef.current;
        if (!pane?.getClientRects().length) return;
        pane.focus({ preventScroll: true });
        const bounds = pane.getBoundingClientRect();
        if (window.matchMedia("(max-width: 760px)").matches || bounds.top < 144 || bounds.top > window.innerHeight - 320) pane.scrollIntoView({ block: "start" });
      } else if (previous) {
        const row = listRef.current?.querySelector<HTMLButtonElement>(`button[data-record-id="${CSS.escape(previous)}"]`);
        if (!row?.getClientRects().length) return;
        window.scrollTo({ top: returnScroll.current });
        row.focus({ preventScroll: true });
        const bounds = row.getBoundingClientRect();
        if (bounds.top < 144 || bounds.bottom > window.innerHeight - 12) row.scrollIntoView({ block: "nearest" });
      }
    });
    return () => cancelAnimationFrame(frame);
  }, [selectedId, historyKey]);
  function select(id: string) {
    if (!selectedId) returnScroll.current = window.scrollY;
    setVisitedIds(ids => ids.includes(id) ? ids : [...ids, id]);
    if (selectedId) replaceSelectedId(id); else setSelectedId(id);
    window.history.replaceState({ ...window.history.state, timelyoLearningDetail: { key: historyKey, scrollY: returnScroll.current } }, "");
  }
  function back() {
    if (window.history.state?.timelyoLearningDetail?.key === historyKey && canNavigateBack()) window.history.back();
    else replaceSelectedId("");
  }
  if (!items.length) return <>{empty}</>;
  return <div className={`learning-browser${selected ? " has-selection" : ""}`}>
    <div className="learning-browser-list" ref={listRef} aria-label={learningLabel("内容列表", "Content list")}>
      {items.map(item => {
        const row = summary(item);
        return <button type="button" className="learning-browser-row" key={item.id} data-record-id={item.id} aria-pressed={selected?.id === item.id} aria-controls={detailId} onClick={() => select(item.id)}>
          <FileText size={18} aria-hidden="true"/>
          <span className="learning-browser-row-copy"><strong>{item.title}</strong>{row.context && <small>{row.context}</small>}{row.meta && <small>{row.meta}</small>}{row.status && <span className="learning-browser-status">{row.status}</span>}</span>
          <ChevronRight size={16} aria-hidden="true"/>
        </button>;
      })}
    </div>
    <section id={detailId} ref={detailRef} tabIndex={-1} className={`learning-browser-detail${selected ? "" : " is-empty"}`} aria-label={selected?.title || learningLabel("内容详情", "Content details")}>
      {selected ? <div className="learning-browser-detail-nav"><Button type="button" size="sm" variant="ghost" onClick={back}><ArrowLeft size={16}/>{learningLabel("返回列表", "Back to list")}</Button></div> : <p className="muted">{learningLabel("选择一项查看详情", "Select an item to view details")}</p>}
      {items.filter(item => visitedIds.includes(item.id) || item.id === selectedId).map(item => <div key={item.id} hidden={item.id !== selected?.id}>{renderDetail(item)}</div>)}
    </section>
  </div>;
}
