import {LearningEditError} from "./learning-versions";
export function operationId(value:unknown) {
  const id=typeof value==="string"?value.trim():"";
  if(!/^[a-zA-Z0-9_-]{16,80}$/.test(id))throw new LearningEditError("操作标识已失效，请重新打开窗口",409);
  return id;
}
export async function operationHash(value:unknown) {
  const hash=await crypto.subtle.digest("SHA-256",new TextEncoder().encode(JSON.stringify(value)));
  return Array.from(new Uint8Array(hash),b=>b.toString(16).padStart(2,"0")).join("");
}
