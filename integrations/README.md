# Google Sheet 课时导入设置

管理员页面的「课时导入」从网站数据库统计 `Lesson Records!B2` 所选月份的实际打卡课时。它只按**学生姓名＋科目名称完全一致**的唯一表格行更新 `H` 列（`Total Hours`）。未匹配及重复的行不变。再次导入覆盖同一行，不累加。写入后，脚本更新该月份在 `System_Data_Storage` 的 `Lesson Records` 快照，切月再切回来才会保留课时。

## 一次性配置

1. 在这份 Google Sheet 中打开「扩展程序 → Apps Script」。先复制一份现有脚本作备份。不要删除原有 `saveMonthData`、`loadMonthData`、`getManualInputs` 等函数。
2. 新建脚本文件 `GoogleSheetLessonSync.gs`，粘贴同目录文件的全部内容。
3. 把原有 `onEdit(e)` 函数整体替换为：

   ```javascript
   function onEdit(e) { sheetSyncSafeOnEdit(e); }
   ```

   月份切换与网站导入必须共用同一脚本锁，避免并发覆盖。
4. Apps Script「项目设置 → 脚本属性」添加 `SHEET_SYNC_SECRET`，值为与网站运行环境相同的随机密钥（至少 32 个字符）。只填写到脚本属性和网站服务端环境变量，不放在代码、网页或聊天中。
5. 保存脚本，部署「新部署 → 网络应用」。选择「以我的身份执行」，访问权限选择「所有人」。复制以 `/exec` 结尾的 Web App URL。网站服务端会签署每次请求；没有密钥的访问只能收到错误。
6. 给网站运行环境设置 `SHEET_SYNC_URL`（上一步的 URL）及相同的 `SHEET_SYNC_SECRET`，重新发布网站。部署新脚本版本后，如 URL 变化，也需更新网站环境变量。
7. 在 `Lesson Records!B2` 选择月份，并确认原有脚本的「初始化系统」已运行。首次执行 Web App 需要表格所有者完成 Google 授权。

## 验收

在管理员页面点「课时导入 → 读取表格并预览」，核对 B2 月份及每行 `原值 → 新值`，再点「确认导入课时」。重复预览和导入应保持相同小时数。选择另一月份再切回来，检查 H 列是否仍为导入结果。可用 `Sample Student` 与 `SampleStudent` 之类虚构名字核对：二者不得自动匹配。正式首次导入前，建议对表格做一份备份。

老师和学生账号不会获得整份表格访问权限；只有网站管理员可以调用导入 API。
