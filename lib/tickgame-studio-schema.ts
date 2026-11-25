import {z} from 'zod';

export const maxGameZipBytes = 500 * 1024 * 1024;
export const maxGameTotalBytes = 700 * 1024 * 1024;
export const maxGameFileBytes = 95_000_000;
export const maxGameFiles = 1000;
export const maxCoverBytes = 5 * 1024 * 1024;

export const uploadId = z.string().regex(/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/);
export function validPackagePath(path: string) {
  return path.length > 0 && new TextEncoder().encode(path).byteLength <= 600 &&
    !/[\\:\u0000-\u001f\u007f]/.test(path) &&
    path.split('/').every(segment => segment && segment!=='.' && segment!=='..');
}
const packageFile = z.object({
  path: z.string().refine(validPackagePath),
  size: z.number().int().min(0).max(maxGameFileBytes),
  crc: z.number().int().min(0).max(0xffffffff),
});
export const gameFileList = z.array(packageFile).min(1).max(maxGameFiles).superRefine((files, ctx)=>{
  const unique=new Set(files.map(file=>file.path.toLowerCase()));
  const total=files.reduce((sum,file)=>sum+file.size,0);
  if(unique.size!==files.length || !files.some(file=>file.path==='index.html' && file.size>0) || total>maxGameTotalBytes)
    ctx.addIssue({code:'custom',message:'Invalid package paths, missing index.html or package too large'});
});
export const coverType = z.enum(['image/png','image/jpeg','image/webp']);
export const gameUploadRequest = z.object({
  game: uploadId.optional(),
  title: z.string().trim().min(1).max(100),
  subject: z.string().trim().min(1).max(55),
  description: z.string().trim().max(500),
  files: gameFileList,
  cover: z.object({size:z.number().int().positive().max(maxCoverBytes),type:coverType}).nullable(),
});
export type GameUploadRequest=z.infer<typeof gameUploadRequest>;
export type GameFile=z.infer<typeof packageFile>;
export type StudioCover={version:string; type:z.infer<typeof coverType>};
export type StudioGame={
  id:string; version:string; title:string; subject:string; description:string;
  cover:StudioCover; publishedAt:string;
};
export type StudioDraft={
  game:string; version:string; title:string; subject:string; description:string;
  previousVersion:string|null; cover:StudioCover; coverSize:number;
  files:GameFile[]; createdAt:number;
};

export function detectGameCover(bytes:Uint8Array):StudioCover['type']|null {
  if ([137,80,78,71,13,10,26,10].every((code,i)=>bytes[i]===code))return 'image/png';
  if(bytes[0]===255&&bytes[1]===216&&bytes[2]===255)return 'image/jpeg';
  if(bytes.length>=12 && String.fromCharCode(...bytes.subarray(0,4))==='RIFF' &&
    String.fromCharCode(...bytes.subarray(8,12))==='WEBP')return 'image/webp';
  return null;
}
