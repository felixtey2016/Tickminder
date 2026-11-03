# 邮箱验证码找回密码

Tickminder 的登录页和「设置 → 我的账号 → 登录与安全 → 修改密码」共用邮箱找回流程。学生在自己的 Gmail 或其他已绑定 Google 邮箱收取验证码；网站通过 Brevo 的事务邮件 API 发信。

## 账号适用范围

- 输入站内用户名，或已经绑定到站内账号的 Google 邮箱。
- 收件地址来自服务器保存的、经过 Google 验证的账号绑定。不能临时填写另一个邮箱作为收件人，也不能把旧资料中未经验证的 `accounts.email` 当作恢复凭据。
- 同一邮箱对应多个站内账号时，使用用户名确定具体账号。不要按邮箱合并账号。
- 没有绑定 Google 邮箱的旧账号仍由所属集团管理员重置密码；知道当前密码时，可先在账号设置中连接 Google 账号。
- 重置成功后需要重新登录，旧登录会话失效。一般的「修改密码」仍保留当前密码验证。

## 有效期与发送限制

验证码有效期为 10 分钟；每次请求最多验证 5 次。重新发送至少间隔 60 秒；每个输入账号、每个实际账号每小时最多 3 次请求／发送，每个 IP 每小时最多 10 次请求。公开请求额度与真实发信额度分别限制：按 UTC 日期最多接纳 2500 次请求，最多尝试发送 250 封符合账号资格及发送限制的恢复邮件。不存在或未绑定邮箱的账号不消耗真实发信额度；被 IP／输入账号额度拒绝的请求不继续消耗全站接纳额度。这些是网站自身的保护额度，不能保证 Brevo 账户内其他邮件发送不会另外消耗额度，也不能替代 Cloudflare 边缘防滥用规则。

验证码和密码不会写入日志或网址。浏览器可在当前标签页的 `sessionStorage` 短期保存加密挑战或已验证重置凭据及到期时间，以恢复刷新后的步骤；不得保存验证码或密码。重置凭据仅能用于本次恢复，不是登录会话，完成、到期或主动退出流程后清除。认证尝试计数使用现有认证表的独立命名空间，不改变数据库结构。过期恢复计数分批清理，拒绝请求或投递失败也能触发清理。邮件通过后台任务发送，接口统一响应不代表邮件已经送达。

## 界面与状态处理

两个入口共用正式站现有的 Dialog、Button、PasswordInput 和主题变量；流程是填写账号、单独验证邮箱验证码、在下一步设置新密码、显示完成提示。只有服务器确认验证码有效后才进入新密码步骤。设置入口带入本人用户名。手机与电脑沿用现有布局，支持中英、明暗主题、密码显示、键盘避让及可访问的错误／完成提示。

重置提交中阻止弹窗关闭，避免把浏览器取消当成服务器取消。请求超时或连接中断时，界面明确提示结果可能尚未确认，应先尝试用新密码登录，不自动反复提交。重置不会自动登录；成功后保留经过校验的本站 Quiz 访问目标与原 assignment 参数，经重新登录回到原作业。

普通修改密码与邮箱恢复会互相检查凭据版本、有效登录及账号状态，旧的在途改密请求不能覆盖刚完成的邮箱恢复，也不能重新签发已被恢复操作撤销的旧登录。

测试站如果仅同步界面，两个入口显式使用 `previewOnly`：全过程只在浏览器展示预览状态，不调用恢复接口，不发邮件，也不修改密码。正式站入口不启用此预览参数。

## 恢复接口与验证凭据

同源 `POST /api/password-recovery` 使用 JSON；所有响应禁止缓存，`GET` 仍只返回 `{ available }`。

| 步骤 | 请求 JSON | 成功响应 |
| --- | --- | --- |
| 申请邮件 | `{ action: "request", identifier, language }` | `{ ok: true, challenge, retryAfter: 60, expiresIn: 600 }` |
| 验证邮箱 | `{ action: "verify", challenge, code }`；`code` 是六位数字字符串 | `{ ok: true, resetToken, expiresIn }`；有效期为原申请剩余的整数秒 |
| 设置新密码 | `{ action: "reset", resetToken, newPassword }` | `{ ok: true }`，清除客户端登录 cookie，并撤销该账号全部服务器会话 |

`verify` 不修改密码，不撤销会话，也不接受或保存新密码。`resetToken` 有经过认证的独立用途标记，并绑定原账号、原密码版本和已验证 Google 绑定；原 `challenge` 即使已经验证，也不能直接充当 `resetToken`。服务器在现有 `login_attempts` 的挑战记录上保存 `verified` 状态，真正改密事务再次检查该状态、账号资格、Google 绑定、密码版本和原到期时刻。只有一次事务能成功，随后标记 `used`；其他请求不能覆盖新密码或撤销较新的会话。

验证码验证响应丢失时，可由用户重试原 `challenge` 与验证码，得到等价重置凭据。每次验证仍占用同一请求最多五次的额度，包括正确重试；不延长十分钟有效期。已拿到有效 `resetToken` 后，纠正新密码格式或“与当前密码相同”的错误不再消耗验证码验证次数。所有等价凭据共享一次性状态；改密、解除或更换 Google 绑定、停用或过期待分配账号都会使原凭据失效。提交改密后网络结果未知时不要自动重试，应先尝试登录确认结果。

错误响应沿用 `{ error, code, retryAfter? }`。无效、过期、已使用或资格已变的挑战／重置凭据统一为 HTTP 400 `INVALID_CODE`；新密码格式不符为 `INVALID_PASSWORD`，与当前密码相同为 `PASSWORD_UNCHANGED`。请求限流为 HTTP 429 `RATE_LIMITED`，配置或服务暂不可用为 HTTP 503。申请邮件对不存在、未绑定或无资格账号继续返回相同成功结构，不能据此判断账号是否存在。

缓存旧界面提交的 `{ action: "reset", challenge, code, newPassword }` 仍兼容，内部使用相同的验证码限额和验证凭据事务。请求只要包含 `resetToken` 字段，就严格按新接口验证该字段；无效时不会退回使用同一请求中的旧凭据。

## 1. 准备 Brevo 发件人

1. 登录 Brevo，进入 **Settings → Senders, Domains, IPs → Domains**，添加自己的发信域名，例如 `tickminder.com`。
2. 按 Brevo 提供的认证步骤操作。需要手动配置时，在 Cloudflare 的 `tickminder.com` 域名下进入 **DNS → Records**，逐条复制 Brevo 显示的记录类型、名称和内容。不同账户可能显示 Brevo code、DKIM、DMARC 等不同组合，以当前向导为准。
3. 邮件认证用的 CNAME 使用 **DNS only**；保留网站原有的 A/CNAME、MX、TXT 和已有邮件服务配置。已有 DMARC 记录时不要再添加第二条同名 DMARC，也不要直接覆盖现有策略。
4. 返回 Brevo 确认域名状态为已认证。接着进入 **Senders → Add a sender**，名称填 `Tickminder`，发件邮箱可设为 `noreply@tickminder.com`。发件地址的域名必须与已认证域名一致。如果认证的是 `mail.tickminder.com`，则使用 `noreply@mail.tickminder.com`。

这里认证的是 Tickminder 的发信域名，收件人可以是 `@gmail.com`。无需认证或购买 `gmail.com`。发件域名已认证时，Brevo 会验证该域名下的发件人；网站不需要购买 Google Workspace 才能发送这些邮件。此功能不需要专用 IP、营销活动、联系人数导入或付费邮件模板。

官方说明：[域名认证](https://help.brevo.com/hc/en-us/articles/12163873383186-Authenticate-your-domain-with-Brevo-Brevo-code-DKIM-DMARC)、[新版域名设置向导](https://help.brevo.com/hc/en-us/articles/35337929909778-Set-up-your-domain-in-Brevo)、[创建发件人](https://help.brevo.com/hc/en-us/articles/208836149-Create-a-new-sender-From-name-and-From-email)。

## 2. 创建 Brevo API key

进入 **Settings → SMTP & API → API Keys & MCP → Generate API key**，命名为 `Tickminder password recovery`。

如果界面提供权限选择，选择 **Restricted**，只给 **Transactional email → All**；其余资源保留 **None**。这个资源目前没有 `Read/write` 级别，`Read` 不能发信。不需要全账号的 `Full` 权限。

保存标准 API key，不要切换成 MCP key，也不要使用 SMTP key。将它直接粘贴到下一步 Cloudflare 的 Secret 中；不要写进 GitHub、前端代码、截图或聊天。

官方说明：[创建 API key](https://help.brevo.com/hc/en-us/articles/40159485019794-Create-and-manage-your-API-keys)、[API key 权限](https://help.brevo.com/hc/en-us/articles/40158277171474-About-API-key-permissions)。

## 3. 在正式 Worker 配置运行时变量

Cloudflare → **Workers & Pages → tickminder-recovery → Settings → Variables and Secrets → Add**。

| 变量名 | 类型 | 填入内容 |
| --- | --- | --- |
| `BREVO_API_KEY` | Secret | 刚生成的 Brevo 标准 API key。 |
| `PASSWORD_RECOVERY_SECRET` | Secret | 独立生成并保存的随机密钥，至少 32 个字符。使用密码管理器生成长随机值，不要复用账号密码或 Brevo API key。 |
| `BREVO_SENDER_EMAIL` | Text | Brevo 中已验证的完整发件邮箱，例如 `noreply@tickminder.com`。 |
| `BREVO_SENDER_NAME` | Text | 可选，填写 `Tickminder`；未填写时也使用此名称。 |

全部添加后点击 **Deploy** 使运行时设置生效。这些变量填写在 Worker 的 **Variables and Secrets**，不是 **Build → Build variables and secrets**；构建变量不会自动提供给运行中的网站。

网站检查运行时配置是否齐备。配置不完整时，找回界面会提示邮件服务暂不可用，仍可联系管理员重置；现有密码和 Google 登录继续工作。配置齐备不等于邮件已经实际投递成功，还必须完成下一步验收。

本功能不需要新增数据库表或执行数据库迁移。保持原有 `DB`、文件存储、正式域名和其他秘密变量。生产代码继续使用 `feat/tuition-groups` 分支及现有 `npm run deploy:recovery` 发布流程。

官方说明：[Cloudflare Worker Secrets](https://developers.cloudflare.com/workers/configuration/secrets/)、[Worker 构建与运行时变量的区别](https://developers.cloudflare.com/workers/ci-cd/builds/configuration/)。

## 4. 上线后的真实收件验收

1. 使用自己已绑定 Google 邮箱的站内账号，在登录页点击「忘记密码」，输入用户名并请求验证码。
2. 查看 Gmail 收件箱与垃圾邮件文件夹；同时可在 Brevo **Transactional → Logs** 检查投递状态。API 接受请求并不代表已送达收件箱。
3. 在网站输入邮件验证码并完成验证，再在独立的新密码步骤提交密码，确认重置成功后重新登录。
4. 确认新密码可登录、旧密码不可登录，另一台已经登录的设备在下次访问时要求重新登录。
5. 在账号设置的「修改密码」区域确认同一个找回入口也可以打开，手机与电脑显示正常。

接口对账号不存在、未绑定邮箱等情况使用统一提示，避免公开泄露账号信息。没有收到邮件时，检查用户名、既有 Google 绑定、发送间隔和 Brevo 状态；不要把验证码或新密码贴到日志、问题单或聊天中。

本地自动测试应使用模拟邮件投递及隔离数据，不应给真实学生批量发送测试邮件。

## 排障和维护

- **界面显示邮件服务暂不可用**：核对三个必需变量的名称、类型和值，并确认已点击 Deploy；`PASSWORD_RECOVERY_SECRET` 长度必须满足要求。
- **Brevo 提示事务邮件平台未启用**：在自己的 Brevo 账号内联系支持，申请启用网站密码恢复所需的事务邮件发送。新账号可能需要这一步。[官方排障说明](https://help.brevo.com/hc/en-us/articles/115000188150-Troubleshooting-Issues-with-Brevo-SMTP)
- **API key 失效或无权限**：确认使用标准 API key、Transactional email 权限允许发送，并检查到期时间。Brevo 目前会停用连续 90 天没有成功 API 调用的 key；留意账户提醒邮件。更新 Cloudflare 中的 Secret 后重新 Deploy。
- **发件人未验证或邮件被拒收**：核对发件邮箱与认证域名一致、DKIM/DMARC 状态正常，再查看 Brevo 投递日志。
- **超过邮件额度**：查看 Brevo 当前计划、当天剩余额度和队列；排队到达的验证码可能已经过期，应在额度恢复后重新申请。不要把过期验证码的有效期延长。
- **轮换恢复密钥**：更换 `PASSWORD_RECOVERY_SECRET` 会使更换前的待验证请求失效，用户需要重新申请验证码；不改变已有账号密码。

此文档记录接入与验收步骤，不代表 Brevo 已被授权、正式密钥已配置，或真实邮件已成功送达。发布记录应分别注明代码发布结果与真实发信验收结果。
