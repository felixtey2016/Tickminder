"use client";
import { t } from "@/lib/i18n";
import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
type CalendarLesson = {
    id: string;
    student: string;
    subject: string;
    teacherName: string;
    plannedStart: string;
    status: string;
};
type View = "day" | "week" | "month";
const malaysiaDay = (iso: string) => new Intl.DateTimeFormat("sv-SE", { timeZone: "Asia/Kuala_Lumpur", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(iso));
const malaysiaTime = (iso: string) => new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Kuala_Lumpur", hour: "2-digit", minute: "2-digit", hour12: false }).format(new Date(iso));
const shift = (day: string, by: number) => new Date(Date.parse(`${day}T00:00:00Z`) + by * 86400000).toISOString().slice(0, 10);
const monday = (day: string) => shift(day, -(new Date(`${day}T00:00:00Z`).getUTCDay() + 6) % 7);
const weekday = ["周一", "周二", "周三", "周四", "周五", "周六", "周日"];
export function LessonCalendar({ lessons, teachers, onSelect }: {
    lessons: CalendarLesson[];
    teachers: string[];
    onSelect: (id: string) => void;
}) {
    const [anchor, setAnchor] = useState(() => malaysiaDay(new Date().toISOString()));
    const [view, setView] = useState<View>("month");
    const [teacher, setTeacher] = useState("");
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
    return <section className="week-calendar" aria-label={t("\u8BFE\u7A0B\u65E5\u5386")}><div className="calendar-toolbar"><div><strong>{view === "month" ? t("\u6708\u5386") : view === "week" ? t("\u5468\u5386") : t("\u65E5\u5386")}</strong><span>{view === "month" ? anchor.slice(0, 7) : days.length > 1 ? `${days[0]} ${t('至')} ${days.at(-1)}` : anchor}</span></div><div className="calendar-controls"><select aria-label={t("\u65E5\u5386\u89C6\u56FE")} value={view} onChange={e => setView(e.target.value as View)}><option value="month">{t("\u6708")}</option><option value="week">{t("\u5468")}</option><option value="day">{t("\u65E5")}</option></select><select aria-label={t("\u7B5B\u9009\u8001\u5E08")} value={teacher} onChange={e => setTeacher(e.target.value)}><option value="">{t("\u6240\u6709\u8001\u5E08")}</option>{teachers.map(t => <option key={t}>{t}</option>)}</select><Button size="sm" variant="outline" onClick={() => move(-1)}>{t("\u4E0A\u4E00")}{view === "month" ? t("\u6708") : view === "week" ? t("\u5468") : t("\u5929")}</Button><Button size="sm" variant="outline" onClick={() => setAnchor(malaysiaDay(new Date().toISOString()))}>{t("\u4ECA\u5929")}</Button><Button size="sm" variant="outline" onClick={() => move(1)}>{t("\u4E0B\u4E00")}{view === "month" ? t("\u6708") : view === "week" ? t("\u5468") : t("\u5929")}</Button></div></div><div className={`calendar-grid calendar-${view}`}>{days.map(d => <div className={`calendar-day ${view === "month" && d.slice(0, 7) !== anchor.slice(0, 7) ? "calendar-outside" : ""} ${d === malaysiaDay(new Date().toISOString()) ? "calendar-today" : ""}`} key={d}><div className="calendar-day-head"><strong>{t(weekday[(new Date(`${d}T00:00:00Z`).getUTCDay() + 6) % 7])}</strong><small>{d.slice(5)}</small></div>{lessons.filter(l => malaysiaDay(l.plannedStart) === d && (!teacher || l.teacherName === teacher) && l.status !== "cancelled").map(l => <button className="calendar-lesson" key={l.id} onClick={() => onSelect(l.id)}><strong>{malaysiaTime(l.plannedStart)}</strong><span>{l.student}</span><small>{l.subject} · {l.teacherName}</small></button>)}</div>)}</div></section>;
}
