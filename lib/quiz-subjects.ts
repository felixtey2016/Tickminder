// Only explicit equivalents are merged. Mathematics is not Additional Mathematics,
// Science is not Mathematics, and unknown labels retain their full wording.
const mathNames=new Set(['math','maths','mathematics','数学','matematik']);
const whitespace=[9,10,11,12,13,160,5760,8192,8193,8194,8195,8196,8197,8198,8199,8200,8201,8202,8232,8233,8239,8287,12288,65279];
export function quizSubjectKey(value:string){
 const key=value.replace(/\s+/gu,' ').trim().replace(/[A-Z]/g,c=>c.toLowerCase());
 return mathNames.has(key)?'mathematics':key;
}
export function quizSubjectsMatch(left:string,right:string){const key=quizSubjectKey(left);return Boolean(key)&&key===quizSubjectKey(right);}
// The expression is trusted application SQL, never a request-provided fragment.
// It occurs exactly once, so passing '?' consumes one positional parameter.
// SQLite's ASCII lower() is mirrored in quizSubjectKey; non-Latin wording is
// preserved instead of guessing an equivalence or requiring an ICU extension.
export function quizSubjectSql(expression:string){
 let normal=`coalesce(${expression},'')`;for(const code of whitespace)normal=`replace(${normal},char(${code}),' ')`;
 for(let i=0;i<8;i++)normal=`replace(${normal},'  ',' ')`;
 normal=`lower(trim(${normal}))`;
 return `(SELECT CASE quiz_subject_raw WHEN 'math' THEN 'mathematics' WHEN 'maths' THEN 'mathematics' WHEN 'mathematics' THEN 'mathematics' WHEN '数学' THEN 'mathematics' WHEN 'matematik' THEN 'mathematics' ELSE quiz_subject_raw END FROM (SELECT ${normal} AS quiz_subject_raw))`;
}
