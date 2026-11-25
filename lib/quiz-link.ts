// A Quiz ID is navigation intent only. Every read and attempt still checks
// the current account, group and live sharing policy on the server.
export function validQuizLinkId(value:unknown):value is string {
 return typeof value==='string'&&/^[A-Za-z0-9_-]{16,80}$/.test(value);
}
export const isQuizLinkId=validQuizLinkId;
export function quizLinkPath(id:string,assignmentId?:string):string {
 if(!validQuizLinkId(id))throw new Error('Invalid Quiz link ID');
 if(assignmentId!==undefined&&!validQuizLinkId(assignmentId))throw new Error('Invalid Quiz assignment ID');
 return '/quiz/'+id+(assignmentId?'?assignment='+encodeURIComponent(assignmentId):'');
}
// Presence is checked separately so malformed assignment links never fall back
// to an unrelated self-practice session.
export function quizAssignmentFromSearch(search:string):{present:boolean;id:string|null}{
 const values=new URLSearchParams(search).getAll('assignment');
 return {present:values.length>0,id:values.length===1&&validQuizLinkId(values[0])?values[0]:null};
}
export function quizLinkIdFromPath(pathname:string):string|null {
 const matched=/^\/quiz\/([A-Za-z0-9_-]{16,80})\/?$/.exec(pathname);
 return matched?.[1]||null;
}
