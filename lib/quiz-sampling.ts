import {QuizError,type QuizContent,type QuizQuestion,type QuizType} from '@/lib/quiz';

export type QuizSampling={count:number;types:QuizType[]};
const types:QuizType[]=['mcq','true_false','blank','math','written'];
export function shuffledQuizItems<T>(items:T[]):T[]{
 const out=[...items];for(let i=out.length-1;i>0;i--){const range=i+1,limit=Math.floor(0x100000000/range)*range;let n:number;do{n=crypto.getRandomValues(new Uint32Array(1))[0];}while(n>=limit);const j=n%range;[out[i],out[j]]=[out[j],out[i]];}return out;
}
export function practiceQuestions(content:QuizContent):QuizQuestion[]{
 const sampling=(content as QuizContent&{sampling?:QuizSampling}).sampling;
 if(!sampling)return content.shuffleQuestions?shuffledQuizItems(content.questions):[...content.questions];
 if(!Number.isInteger(sampling.count)||sampling.count<1||sampling.count>150||!Array.isArray(sampling.types)||!sampling.types.length||new Set(sampling.types).size!==sampling.types.length||sampling.types.some(type=>!types.includes(type)))throw new QuizError('quiz.samplingInvalid');
 const pool=content.questions.filter(question=>sampling.types.includes(question.type));
 if(pool.length<sampling.count)throw new QuizError('quiz.samplingInsufficient');
 const selected=shuffledQuizItems(pool).slice(0,sampling.count);
 return content.shuffleQuestions?selected:content.questions.filter(question=>selected.some(item=>item.id===question.id));
}
