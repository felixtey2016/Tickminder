let currentGroupId: string | null = null;
export function setClientGroup(id: string | null | undefined) { currentGroupId = id || null; }
export function groupFetch(input: RequestInfo | URL, init?: RequestInit) {
  const headers = new Headers(init?.headers);
  if (currentGroupId) headers.set("x-tickminder-group",currentGroupId);
  return fetch(input,{...init,headers});
}
