import type {QuizQuestion} from './quiz';

export type QuizQuestionSource={questionId:string;sourceVersionId:string;sourceQuestionId:string};
export type QuizComposeSelection={quizId:string;bank:boolean;versionId:string;questionIds:string[]};
export type QuizComposeIntent={title:string;selections:QuizComposeSelection[]};
export type QuizComposeQuestions={quizId:string;versionId:string;title:string;exam:string;subject:string;questions:QuizQuestion[];total:number;hasMore:boolean};
