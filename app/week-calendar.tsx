"use client";
import { useFilterPreference } from "@/lib/filter-preferences";
import { t } from "@/lib/i18n";
import { useMemo, useState } from "react";
import { StudentCalendar } from "./student-calendar";
import { Button } from "@/components/ui/button";
type CalendarLesson = {
    id: string;
    student: string;
    subject: string;
    teacherName: string;
    plannedStart: string;
    plannedEnd: string;
    actualStart: string | null;
    actualEnd: string | null;
    onlineLink?: string | null;
    status: string;
};
type View = "day" | "week" | "month";
const dayFormatter = new Intl.DateTimeFormat("sv-SE", { timeZone: "Asia/Kuala_Lumpur", year: "numeric", month: "2-digit", day: "2-digit" });
const timeFormatter = new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Kuala_Lumpur", hour: "2-digit", minute: "2-digit", hour12: false });
const malaysiaDay = (iso: string) => dayFormatter.format(new Date(iso));
const malaysiaTime = (iso: string) => timeFormatter.format(new Date(iso));
const shift = (day: string, by: number) => new Date(Date.parse(`${day}T00:00:00Z`) + by * 86400000).toISOString().slice(0, 10);
const monday = (day: string) => shift(day, -(new Date(`${day}T00:00:00Z`).getUTCDay() + 6) % 7);
const weekday = ["周一", "周二", "周三", "周四", "周五", "周六", "周日"];
export function LessonCalendar({ lessons, teachers, onSelect, proposals = [] }: {
    lessons: CalendarLesson[];
    teachers: string[];
    onSelect: (id: string) => void;
    proposals?: Array<{lessonId: string; status: string; proposedStart: string; proposedEnd: string; requestedRole?: string}>;
}) {
    const [anchor, setAnchor] = useState(() => malaysiaDay(new Date().toISOString()));
    const [savedView, setView] = useFilterPreference<string>("calendar-view", "month");
    const view:View = ["day","week","month"].includes(savedView) ? savedView as View : "month";
    const [teacher, setTeacher] = useFilterPreference<string>("calendar-teacher", "");
    const days = useMemo(() => {
        if (view === "day")
            return [anchor];
        if (view === "week")
            return Array.from({ length: 7 }, (_, i) => shift(monday(anchor), i));
        const first = `${anchor.slice(0, 7)}-01`;
        const start = monday(first);
        const last = new Date(Date.UTC(Number(anchor.slice(0, 4)), Number(anchor.slice(5, 7)), 0)).getUTCDate();
        const count = Math.ceil((Math.round((Date.parse(first + "T00:00:00Z") - Date.parse(start + "T00:00:00Z")) / 86400000) + last) / 7) * 7;
        return Array.from({ length: count }, (_, i) => shift(start, i));
    }, [anchor, view]);
    function move(direction: number) {
        if (view === "day")
            setAnchor(shift(anchor, direction));
        else if (view === "week")
            setAnchor(shift(anchor, direction * 7));
        else {
            const date = new Date(`${anchor.slice(0, 7)}-01T00:00:00Z`);
            date.setUTCMonth(date.getUTCMonth() + direction);
            setAnchor(date.toISOString().slice(0, 10));
        }
    }
    if (view === "month") return <StudentCalendar role="admin" lessons={lessons.filter(l => !teacher || l.teacherName === teacher)} proposals={proposals} onPending={onSelect} selectedDate={anchor} onDateChange={setAnchor}
      toolbar={<div className="calendar-role-filters"><label>{t("日历视图")}<select value={view} onChange={e => setView(e.target.value)}><option value="month">{t("月")}</option><option value="week">{t("周")}</option><option value="day">{t("日")}</option></select></label><label>{t("筛选老师")}<select value={teacher} onChange={e => setTeacher(e.target.value)}><option value="">{t("所有老师")}</option>{teachers.map(name => <option key={name}>{name}</option>)}</select></label><Button variant="outline" size="sm" onClick={() => setTeacher("")}>{t("重置筛选")}</Button></div>}
      renderActions={id => <Button size="sm" variant="outline" onClick={() => onSelect(id)}>{t("编辑课程")}</Button>}/>;
    const legacyView = view as View;
    return <section className="week-calendar" aria-label={t("\u8BFE\u7A0B\u65E5\u5386")}><div className="calendar-toolbar"><div><strong>{legacyView === "month" ? t("\u6708\u5386") : legacyView === "week" ? t("\u5468\u5386") : t("\u65E5\u5386")}</strong><span>{legacyView === "month" ? anchor.slice(0, 7) : days.length > 1 ? `${days[0]} ${t('至')} ${days.at(-1)}` : anchor}</span></div><div className="calendar-controls"><select aria-label={t("\u65E5\u5386\u89C6\u56FE")} value={view} onChange={e => setView(e.target.value as View)}><option value="month">{t("\u6708")}</option><option value="week">{t("\u5468")}</option><option value="day">{t("\u65E5")}</option></select><select aria-label={t("\u7B5B\u9009\u8001\u5E08")} value={teacher} onChange={e => setTeacher(e.target.value)}><option value="">{t("\u6240\u6709\u8001\u5E08")}</option>{teachers.map(t => <option key={t}>{t}</option>)}</select><Button size="sm" variant="outline" onClick={() => {setTeacher("");setView("month");}}>{t("重置筛选")}</Button><Button size="sm" variant="outline" onClick={() => move(-1)}>{t("\u4E0A\u4E00")}{legacyView === "month" ? t("\u6708") : legacyView === "week" ? t("\u5468") : t("\u5929")}</Button><Button size="sm" variant="outline" onClick={() => setAnchor(malaysiaDay(new Date().toISOString()))}>{t("\u4ECA\u5929")}</Button><Button size="sm" variant="outline" onClick={() => move(1)}>{t("\u4E0B\u4E00")}{legacyView === "month" ? t("\u6708") : legacyView === "week" ? t("\u5468") : t("\u5929")}</Button></div></div><div className={`calendar-grid calendar-${view}`}>{days.map(d => <div className={`calendar-day ${legacyView === "month" && d.slice(0, 7) !== anchor.slice(0, 7) ? "calendar-outside" : ""} ${d === malaysiaDay(new Date().toISOString()) ? "calendar-today" : ""}`} key={d}><div className="calendar-day-head"><strong>{t(weekday[(new Date(`${d}T00:00:00Z`).getUTCDay() + 6) % 7])}</strong><small>{d.slice(5)}</small></div>{lessons.filter(l => malaysiaDay(l.plannedStart) === d && (!teacher || l.teacherName === teacher) && l.status !== "cancelled").map(l => <button className="calendar-lesson" key={l.id} onClick={() => onSelect(l.id)}><strong>{malaysiaTime(l.plannedStart)}</strong><span>{l.student}</span><small>{l.subject} · {l.teacherName}</small></button>)}</div>)}</div></section>;
}
