import {env} from 'cloudflare:workers';

export const tickLearnFreeUnlimited = () => env.TICKLEARN_FREE_UNLIMITED === '1';

function limit(value: string | undefined, fallback: number, maximum: number) {
  const count = Number(value);
  return value && Number.isSafeInteger(count) && count > 0 && count <= maximum ? count : fallback;
}

export const tickLearnFreeQuizLimit = () => limit(env.TICKLEARN_FREE_QUIZZES, 20, 100);
export const tickLearnFreeDailyLimit = () => limit(env.TICKLEARN_FREE_DAILY_QUIZZES, 3, 50);
export const tickLearnFreeVideoLimit = () => limit(env.TICKLEARN_FREE_VIDEOS, 12, 100);

export const tickLearnFreeDailyVideoLimit = 2;

export function malaysiaDayStart(at = Date.now()) {
  const day = 24 * 60 * 60 * 1000, malaysiaOffset = 8 * 60 * 60 * 1000;
  return new Date(Math.floor((at + malaysiaOffset) / day) * day - malaysiaOffset).toISOString();
}
