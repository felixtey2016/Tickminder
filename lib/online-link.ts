export function normalizeOnlineLink(value: unknown): string | null {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value !== "string") throw new Error("请输入有效的网课链接");
  const link = value.trim();
  if (!link) return null;
  if (link.length > 2048) throw new Error("网课链接不能超过 2048 个字符");
  let url: URL;
  try { url = new URL(link); }
  catch { throw new Error("网课链接必须是完整的 https:// 网址"); }
  if (url.protocol !== "https:" || !url.hostname || url.username || url.password)
    throw new Error("网课链接必须是完整的 https:// 网址，且不能包含账号密码");
  return url.toString();
}
