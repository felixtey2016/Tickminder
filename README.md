# 补习班排课与老师打卡（独立版）

这个网站**不连接 Google Sheet**。老师、学生科目、排课、打卡、审核和课时统计均保存在网站数据库。Google 只用于账号登录；新账号首次登录后须由管理员核对邮箱，选择老师或管理员角色。老师角色还须绑定站内老师姓名。

## 使用流程

1. 管理员用 `ADMIN_EMAIL` 指定的 Google 账号首次登录。在“名单与权限”新增老师，再新增学生科目并指定负责老师。
2. 管理员为学生科目安排单次课、每周重复课、加课或关联原课程的补课。
3. 老师登录后处于“待绑定”。管理员核对 Google 邮箱后绑定站内老师。老师自动看到该老师负责的启用学生科目及课程，可填写上课情况、实际时间与备注。管理员也可将已验证账号设为管理员。`ADMIN_EMAIL` 指定的初始管理员账号不可通过绑定表单降权。
4. 打卡提交后立即显示在 Attendance Records，标记“待审核”。管理员在总览里先选学生、再选老师，查看该组合在所选月份的逐堂上课日期、实际时间、已打卡总小时与已审核总小时。**只有已审核、状态为已上课**的课程计入“已上课时”。已上课按打卡填写的**实际开始日期**归属月份，缺席按原定日期列出。马来西亚时区为 `Asia/Kuala_Lumpur`。
5. 未打卡、未审核、学生缺席、老师缺席和取消的课程都不计入“已上课时”。未来安排和待确认另列。日历默认月视图，可切换日、周、月。新建与改期时，同一学生或老师的重叠课程会被拒绝；重复课会逐堂检查。管理员改动或取消已审核课程后，统计会按当前审核状态重新计算；每次修改保留操作记录。

管理员总览的“课程安排查询”可按学生或老师姓名查看所选月份、或从当前时间起的所有未来课程。列表仅显示仍处于“待确认”的已排课程，使用原定日期与时间；已打卡课程可在下方上课记录查看。

管理员总览还有“异常待办”：列出已过原定结束时间却仍未打卡的课程，以及缺席后未标记收费、也没有有效补课的课程。这些提醒只供人工处理，不自动修改课程或课时。

本版本没有表格同步、学费或薪资计算。原表和原 Apps Script 不会被网站修改。原表里的旧课时也不会自动导入，若要纳入网站统计，需在网站里建立对应课程、填写实际时间并审核。

## Google 登录及首次开通

在 Google Cloud 建立 OAuth 2.0 **Web application** 客户端，设置同意画面。将正式网站来源加入 Authorized JavaScript origins；本地测试另加 `http://localhost:5173`。若应用尚处于测试状态，把管理员和老师的 Google 账号加入测试用户。网站仅需以下环境变量：

| 变量 | 用途 |
| --- | --- |
| `GOOGLE_CLIENT_ID` | OAuth Web Client ID；用于 Google Identity Services 登录。 |
| `ADMIN_EMAIL` | 初始管理员已验证的 Google 邮箱；此管理员还可授予其他账号管理员角色。 |

不要把管理员邮箱设为老师共用账号。站点的登录页需允许老师访问；课程 API 在服务端验证 Google 登录会话和管理员绑定。数据库使用 Cloudflare D1 的 `DB` binding。

## 本地运行与数据库

Node.js 22.13+，安装依赖后运行 `npm run dev`；使用 `npm run build` 构建。数据库结构见 `db/schema.ts`。已有的三份迁移须按顺序应用：`drizzle/0000_old_wildside.sql`、`drizzle/0001_luxuriant_hardball.sql`、`drizzle/0002_mysterious_amazoness.sql`。第三份建立站内老师及学生科目表，并移除不再使用的同步表。原有课程和账号数据会保留。

本地 D1 示例命令：

```powershell
node --import ./scripts/sites-env.mjs ./node_modules/wrangler/bin/wrangler.js d1 execute DB --local --config dist/server/wrangler.json --persist-to .wrangler/state --file drizzle/0002_mysterious_amazoness.sql
```

正式部署通过 Sites 的 D1 数据库迁移流程配置 `DB`，并在 Sites 运行环境设置上述两个变量。当前本机预览使用被忽略的 `.env.local` 配置登录；该文件不包含在源码 ZIP 内。Sites 项目 ID 保存在 `.openai/hosting.json`。正式域名须加入 Google OAuth 的 Authorized JavaScript origins，老师账号若受 OAuth 测试模式限制，还须加入测试用户。

## 已验证与上线前验证

已运行 TypeScript 检查、构建和课时规则测试。另用**本地模拟账号和测试数据库**调用实际 API：9 月计划、10 月实际上课的 1.5 小时进入 10 月；老师只能读取自己的课程，不能修改名单或打卡别人的课程；待绑定账号不能打卡；打卡在管理员审核前不计入小时，审核后计入；站内新增老师及学生科目成功。这些测试不代表真实 Google OAuth 已配置或验收。

本机预览已用真实管理员 Google 账号登录。线上仍需确认正式域名的 Google 登录和老师账号绑定，并在手机和电脑上检查打卡页面。独立版无需 Google Sheets API、服务账号或 Apps Script。
