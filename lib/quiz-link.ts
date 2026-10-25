// A Quiz ID is navigation intent only. Every read and attempt still checks
// the current account, group and live sharing policy on the server.
export function validQuizLinkId(value:unknown):value is string {
 return typeof value==='string'&&/^[A-Za-z0-9_-]{16,80}$/.test(value);
}
export const isQuizLinkId=validQuizLinkId;
export function quizLinkPath(id:string):string {
 if(!validQuizLinkId(id))throw new Error('Invalid Quiz link ID');
 return '/quiz/'+id;
}
export function quizLinkIdFromPath(pathname:string):string|null {
 const matched=/^\/quiz\/([A-Za-z0-9_-]{16,80})\/?$/.exec(pathname);
 return matched?.[1]||null;
}
