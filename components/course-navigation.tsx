"use client";

import { useEffect, useRef } from "react";
import { CalendarPlus } from "lucide-react";
import { t } from "@/lib/i18n";
import { courseSection, getCourseTabs, type NavigationRole } from "@/lib/course-navigation";

type CourseNavigationProps = {
  role: NavigationRole;
  activeView: string;
  onChoose: (view: string) => void;
  badges?: Partial<Record<string, number>>;
};

function PendingCount({ count = 0 }: { count?: number }) {
  if (count <= 0) return null;
  return <span className="course-navigation-badge" aria-label={`${count} ${t("待处理事项")}`}>{count > 99 ? "99+" : count}</span>;
}

/** Present existing course destinations without changing their history or permissions. */
export function CourseNavigation({ role, activeView, onChoose, badges = {} }: CourseNavigationProps) {
  const sections = getCourseTabs(role);
  const selected = courseSection(role, activeView);
  const row = useRef<HTMLElement>(null);
  const activeButton = useRef<HTMLButtonElement>(null);
  const canArrange = role === "admin" || role === "teacher";
  const secondary = selected === "timetable"
    ? [{ view: "students", label: "按学生" }, { view: "teachers", label: "按老师" }]
    : role === "teacher" && selected === "attendance"
      ? [{ view: "lessons", label: "课程安排" }, { view: "attendance", label: "出席记录" }]
      : [];

  useEffect(() => {
    const container = row.current;
    const current = activeButton.current;
    if (!container || !current) return;
    // Move only the bounded navigation row, never the page or its vertical position.
    const outer = container.getBoundingClientRect();
    const inner = current.getBoundingClientRect();
    if (inner.left < outer.left) container.scrollLeft += inner.left - outer.left - 6;
    else if (inner.right > outer.right) container.scrollLeft += inner.right - outer.right + 6;
  }, [role, activeView, selected]);

  if (sections.length === 0) return null;
  return <div className="course-navigation" data-testid="course-navigation">
    <div className="course-navigation-main">
      <nav className="course-navigation-row" aria-label={t("课程视图")} ref={row} data-testid="course-navigation-views">
        {sections.map(section => {
          const active = selected === section.id;
          // Alternative views show the same work; do not count it twice.
          const count = Math.max(0, ...section.views.map(view => badges[view] || 0));
          return <button type="button" key={section.id} ref={active ? activeButton : undefined}
            data-testid={`course-view-${section.id}`} data-active={active}
            aria-current={active ? "page" : undefined}
            onClick={() => onChoose(section.defaultView)}>
            <span>{t(section.label)}</span><PendingCount count={count}/>
          </button>;
        })}
      </nav>
      {canArrange && <div className="course-navigation-actions">
        <button type="button" className="course-navigation-arrange" data-testid="course-arrange"
          data-active={activeView === "schedule"} aria-current={activeView === "schedule" ? "page" : undefined}
          onClick={() => onChoose("schedule")}>
          <CalendarPlus size={18} aria-hidden="true"/><span>{t("安排课程")}</span>
        </button>
      </div>}
    </div>
    {secondary.length > 0 && <nav className="course-navigation-secondary" aria-label={selected === "timetable" ? t("时间表对象") : t("考勤视图")} data-testid="course-navigation-secondary">
      {secondary.map(item => <button type="button" key={item.view} data-testid={`course-subview-${item.view}`}
        data-active={activeView === item.view} aria-current={activeView === item.view ? "page" : undefined}
        onClick={() => onChoose(item.view)}>{t(item.label)}<PendingCount count={badges[item.view]}/></button>)}
    </nav>}
  </div>;
}
