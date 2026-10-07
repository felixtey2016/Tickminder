# Google Meet 上课记录

状态：开发分支 `feat/google-meet-detection`。以正式站 v45 / 测试站 v41 的已备份代码为基础。本次尚未发布；当前商业工作区的 Sites 连接无法访问这两个项目。Google API 配置和真实会议验收也尚未完成。

## 已实现

- 老师、学生、管理员菜单中的「Meet 上课记录」；课程卡片及日历当日面板可展开记录。
- 每位老师另行授权创建会议的 Google 账号。与网站 Google 登录分开，不要求每位学生授权读取会议。
- Google 授权码流程、PKCE、短期状态 Cookie、账号绑定、一次性状态消费；只向固定 Google 服务发送请求。
- 服务器使用 AES-GCM 保存刷新凭证，密钥由运行时秘密配置提供。客户端、普通 API、日志及审计中不返回凭证。
- 读取课程绑定的标准 `https://meet.google.com/xxx-xxxx-xxx` 链接的会议及会话记录；读取多页结果，区分失效授权、权限不足、API 未启用、限流及网络失败。
- 秒级加入／离开时间，重新加入分段，多设备重叠去重。以明确 Google 用户 ID 匹配老师、学生，不用姓名或邮箱猜测。
- 学生只能读自己的课程与自己／老师的会话；老师只能读当前绑定给自己的课程；管理员沿用现有课程权限。学生不能主动触发服务器读取 Google。
- 时长仅覆盖本堂课计划时间窗口。相邻课程的边界不重复计算；计划时间以外的延长时间仍需按原有打卡流程确认。身份未匹配显示未知，不把未知显示成缺席。
- 对会议进行中、会议结束、尚未取得记录及过期快照分别显示状态与最近检测时间。不实现自动 No-show 判定。
- 改期或修改链接生成新快照，保留此前时段的已取得证据；永久删除课程级联删除其检测记录。
- 断开连接停止新读取，清除本地授权凭证。Google 账号的第三方连接页可撤销 Google 端授权。重复账号合并后若原连接随旧账号删除，需要本人重新连接。
- 既有 Cloudflare 分钟时钟可用独立秘密调用检测接口，和上课推送并行运行。尚未启用该时钟分支，不宣称后台检测已接通。
- 中英文操作反馈、手机 44px 操作目标，以及中／英／马来文相关隐私说明。

检测只提供核查证据，不改写 `lessons.actual_start/actual_end`、出席状态、收费、核对、薪资或 Sheet 同步，不自动打卡。

## 数据及备份

增量迁移 `0016_meet_monitoring` 新增 4 张表：

| 表 | 用途 |
| --- | --- |
| meet_connections | 老师授权账号与加密刷新凭证，账号删除时级联删除 |
| meet_oauth_states | 10 分钟有效、一次性 OAuth 状态与加密 PKCE 验证值 |
| meet_observations | 课程、链接、计划时段的检测快照、同步状态与并发租约 |
| meet_runtime | 后台时钟最近调用时间 |

加密数据备份格式升级为 `timelyo-d1-v8`（32 张表），仍兼容原有 v1–v7。加密恢复测试覆盖新增记录，正式站原有备份仍可验证。

**运行时密钥和 Google OAuth 客户端秘密不放入数据备份，也不放入 Git。** 它们需要独立、安全的凭证恢复安排；若运行时解密密钥遗失，课程检测记录可恢复，但老师需要重新授权取得新的凭证。不能把数据库恢复测试说成授权凭证也已可完整解密恢复。

## 最后配置步骤

1. 恢复当前连接对原正式／测试 Sites 项目的访问。正式项目 ID 仍以 `.openai/hosting.json` 为准，不创建替代站点，不改现有域名或部署 remote。
2. 在原 Google Cloud 项目启用 [Google Meet API](https://console.cloud.google.com/apis/library/meet.googleapis.com)。为会议检测建立独立的 Web application OAuth 客户端，保留现有登录客户端。
3. Google OAuth 的品牌资料、授权域名、隐私政策及服务条款使用实际 Tickminder 网站。添加 `openid`、`email`、`https://www.googleapis.com/auth/meetings.space.readonly` 范围。
4. 正式重定向 URI 必须准确为 `https://www.tickminder.com/api/meet/callback`。测试站使用它自己的准确 HTTPS 域名加 `/api/meet/callback`；测试和正式分别配置客户端／凭证／密钥／时钟，不能共享正式测试数据。
5. 通过平台秘密配置界面设置以下项目。**不在聊天粘贴密码、客户端秘密或令牌。**

| 配置名 | 用途 |
| --- | --- |
| MEET_OAUTH_CLIENT_ID | 会议专用 Web OAuth 客户端 ID |
| MEET_OAUTH_CLIENT_SECRET | 客户端秘密，设置为 secret |
| MEET_OAUTH_REDIRECT_URI | 本环境准确回调 URI |
| MEET_TOKEN_KEY | 随机 32 字节的 Base64 AES 密钥，设置为 secret；保留独立的安全恢复副本 |
| MEET_CRON_TOKEN | 随机至少 32 字符的后台调用秘密，本环境站点与本环境时钟分别以 secret 配置 |

6. 测试阶段在 Google OAuth 测试用户名单加入实际参测老师。敏感范围用于正式对外服务时按 Google 要求完成验证。测试状态的刷新令牌通常 7 天失效，不能拿测试授权当永久连接。
7. 在隔离站应用 0016、发布构建，老师点「连接 Google Meet」选创建课程会议的账号，检查授权成功与读取权限。再连接隔离时钟。
8. 实际老师／学生进入测试会议，至少测试离开后重进、两台设备、同链接相邻课程、课程改期、网络或权限错误。核对 Google 返回的时间与页面，确认原打卡与课时没有改变。
9. 发布前再创建并验证当前正式版备份。测试通过后按现有 Sites 流程发布原正式站，记录 Git SHA 与 Sites 版本；配置正式时钟。当前正式站没有本次代码／迁移变更。

## 有限的检测能力

- Google 返回的会议数据有延迟，页面每 30 秒只读已缓存结果。分钟时钟轮询，每轮最多同步 2 堂到期课程；排队或配额会延长更新时间。界面显示实际最近检测时间，不能据此保证所有课程即时更新。
- 后台自动覆盖接下来 30 分钟及过去 24 小时的有效课程。较早课程可由老师／管理员手动补取，超过约 29 天不再尝试；Google 会议记录在会议结束 30 天后到期。
- 重复查询用原子租约去重；失败至少间隔 30 秒再人工重试，后台错误退避 5 分钟。取消、改期、断开连接后拒绝保存旧请求结果。
- 只读取已明确匹配的老师／该课程学生的详细会话，其他／匿名参与者只影响会议最近在线人数；没有可靠身份就不能计算该学生的时长。
- 同一个会议链接被用于不同课程时，统计按各堂课程自己的时间窗口截取。会议本身仍在进行不代表该课程仍在上课。
- 只做记录读取，没有录音、录像、Meet 媒体流、自动打卡或自动缺席。

## 验证记录

- 原稳定版本的 28 表、5 份 PDF（6,812,612 bytes）完整加密备份已在本地验证可恢复。
- `tests/meet-monitoring.mjs`：OAuth 状态隔离、PKCE、凭证加密、老师／学生／管理员权限、篡改课程 ID、多页 API、匿名参与者保护、重新加入、多设备去重、相邻边界、未知身份、过期快照、失败重试、并发请求、改期历史、打卡不变、删除级联与 32 表加密恢复。
- 16 组既有回归测试及新增 Meet 测试（共 17 组）通过，TypeScript 检查及应用构建通过。新增模块 ESLint 通过。
- 隔离浏览器测试使用实际组件与模拟 API：390×844 手机视口及 1440×900 电脑视口，中英文、展开记录、更新成功／失败提示、学生隐藏同步按钮与老师授权邮箱均通过；无横向溢出或浏览器运行错误。尚未在真实 Android 设备上验证本次功能。
- 真实 Google OAuth、真实会议、隔离站和正式线上操作：**待配置和站点访问恢复后验收**。本地的模拟 Google 响应不是线上验收。

## 官方依据

- [Google Meet 授权范围](https://developers.google.com/workspace/meet/api/guides/authenticate-authorize)
- [参与者与会话、访问权限](https://developers.google.com/workspace/meet/api/guides/participants)
- [会议查询与过滤](https://developers.google.com/workspace/meet/api/reference/rest/v2/conferenceRecords/list)
- [会议记录的 30 天到期字段](https://developers.google.com/workspace/meet/api/reference/rest/v2/conferenceRecords)
- [Google OAuth 测试模式令牌期限](https://developers.google.com/identity/protocols/oauth2)
