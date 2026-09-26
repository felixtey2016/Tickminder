"use client";
import { getLanguage, t } from "@/lib/i18n";
type Change = {
    id: string;
    lessonId: string;
    lessonName: string;
    actorName: string;
    action: string;
    before: string | null;
    after: string | null;
    at: string;
};
const actionLabel: Record<string, string> = { create: "新增课程", attendance: "打卡／更正", review: "核对课时", reschedule: "改期", cancel: "取消课程", saveTeacher: "更新老师", saveStudent: "新增学生", setStudentActive: "更新学生", savePlan: "更新学生科目", bind: "绑定账号", createLocalAccount: "创建账号", deleteAccount: "删除账号", resetLocalPassword: "重置密码", proposeReschedule: "申请改期", acceptReschedule: "同意改期", rejectReschedule: "拒绝改期", reassignTeacher: "更换老师" };
function describe(json: string | null, action: string) {
    if (!json)
        return t("\u65E0");
    try {
        const value = JSON.parse(json);
        const status: Record<string, string> = { scheduled: "已安排", completed: "已上课", student_absent: "学生缺席", teacher_absent: "老师缺席", cancelled: "已取消" };
        const personLabel = action === "saveTeacher" ? t("老师") : action === "saveStudent" ? t("学生") : t("姓名");
        const parts = [value.name && `${personLabel} ${value.name}`, value.key && `${t("科目")} ${value.key}`, value.teacherName && `${t("负责")} ${value.teacherName}`, typeof value.active === "boolean" && `${t("启用")} ${value.active ? t("\u662F") : t("\u5426")}`, value.plannedStart && `${t("排课")} ${value.plannedStart}`, value.plannedEnd && `${t("结束")} ${value.plannedEnd}`, value.status && `${t("状态")} ${t(status[value.status] || value.status)}`, value.actualStart && `${t("实际")} ${value.actualStart}`, value.actualEnd && `${t("至")} ${value.actualEnd}`, typeof value.chargeable === "boolean" && `${t("收费")} ${value.chargeable ? t("\u662F") : t("\u5426")}`].filter(Boolean);
        return parts.join(getLanguage() === "zh" ? "；" : "; ") || json;
    }
    catch {
        return json;
    }
}
export function ActivityLog({ items }: {
    items: Change[];
}) {
    return <section className="panel"><div className="section-head"><h2>{t("\u4FEE\u6539\u8BB0\u5F55")}</h2><span>{t("\u6700\u8FD1 30 \u6761")}</span></div>{items.length ? items.map(c => <details className="activity-item" key={c.id}><summary><strong>{c.lessonName} · {t(actionLabel[c.action] || c.action)}</strong><span>{c.actorName} · {new Date(c.at).toLocaleString(getLanguage() === "zh" ? "zh-CN" : "en-GB", { timeZone: "Asia/Kuala_Lumpur" })}</span></summary><small>{t("\u8BFE\u7A0B ID\uFF1A")}{c.lessonId}</small><p>{t("\u4E4B\u524D\uFF1A")}{describe(c.before, c.action)}</p><p>{t("\u4E4B\u540E\uFF1A")}{describe(c.after, c.action)}</p></details>) : <div className="empty">{t("\u6682\u65E0\u4FEE\u6539\u8BB0\u5F55\u3002")}</div>}</section>;
}
