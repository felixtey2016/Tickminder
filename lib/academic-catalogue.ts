export type CatalogueScope = "student" | "quiz";
export type CatalogueSubject = { id: string; name: string; aliases: string[]; active: boolean };
export type CatalogueSyllabus = { id: string; name: string; active: boolean; grades: string[]; subjects: CatalogueSubject[] };
export type AcademicCatalogue = { scope: CatalogueScope; revision: number; syllabuses: CatalogueSyllabus[]; canManage?: boolean };

export function catalogueKey(value: string): string {
  return value.normalize("NFKC").trim().replace(/\s+/g, " ").toLowerCase();
}
export function isCatalogueScope(value: unknown): value is CatalogueScope { return value === "student" || value === "quiz"; }
export function findCatalogueSyllabus(catalogue: AcademicCatalogue, idOrName: string) {
  const key = catalogueKey(idOrName);
  return catalogue.syllabuses.find(s => catalogueKey(s.id) === key || catalogueKey(s.name) === key);
}
export function findCatalogueSubject(syllabus: CatalogueSyllabus, idOrAlias: string) {
  const key = catalogueKey(idOrAlias);
  return syllabus.subjects.find(s => [s.id, s.name, ...s.aliases].some(value => catalogueKey(value) === key));
}
export function findCatalogueGrade(syllabus: CatalogueSyllabus, grade: string | null | undefined) {
  if (!grade?.trim()) return null;
  return syllabus.grades.find(value => catalogueKey(value) === catalogueKey(grade));
}
export function catalogueGradeValid(syllabus: CatalogueSyllabus, grade: string | null | undefined): boolean {
  return !grade?.trim() || findCatalogueGrade(syllabus, grade) !== undefined;
}
export function resolveCatalogueSelection(catalogue: AcademicCatalogue, syllabusId: string, subjectIdOrAlias: string, options: {allowInactive?: boolean} = {}) {
  const syllabus = findCatalogueSyllabus(catalogue, syllabusId);
  if (!syllabus || (!options.allowInactive && !syllabus.active)) return null;
  const subject = findCatalogueSubject(syllabus, subjectIdOrAlias);
  return subject && (options.allowInactive || subject.active) ? {syllabus, subject} : null;
}

export class CatalogueValidationError extends Error { constructor(message: string) { super(message); this.name = "CatalogueValidationError"; } }
const fail = (message: string): never => { throw new CatalogueValidationError(message); };
const text = (value: unknown, max: number) => {
  if (typeof value !== "string") return fail("请输入有效的菜单名称");
  const result = value.normalize("NFKC").trim().replace(/\s+/g, " ");
  if (!result || result.length > max || /[\p{Cc}\p{Cf}]/u.test(result) || result.includes("|")) return fail("菜单名称为空、过长或包含不支持的字符");
  return result;
};
const record = (value: unknown): Record<string, unknown> => value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : fail("菜单格式无效");
const identifier = (value: unknown): string => typeof value === "string" && /^[a-z0-9][a-z0-9-]{0,63}$/.test(value) ? value : fail("菜单编号需使用小写英文字母、数字或横线");

// Existing identifiers and labels remain stable because older lessons and Quiz
// versions keep their original labels. An owner can add entries or disable them.
export function validateCatalogueSyllabuses(input: unknown, previous?: CatalogueSyllabus[]): CatalogueSyllabus[] {
  if (!Array.isArray(input) || input.length < 1 || input.length > 32) return fail("每套菜单需包含 1 至 32 个课程体系");
  const syllabusIds = new Set<string>(), syllabusNames = new Set<string>();
  const result = input.map(value => {
    const row = record(value), id = identifier(row.id), name = text(row.name, 100);
    if (typeof row.active !== "boolean" || syllabusIds.has(id) || syllabusNames.has(catalogueKey(name))) return fail("课程体系编号或名称重复，或启用状态无效");
    syllabusIds.add(id); syllabusNames.add(catalogueKey(name));
    if (!Array.isArray(row.grades) || row.grades.length > 32) return fail("年级列表格式无效");
    const grades = row.grades.map(value => text(value, 60)), gradeKeys = grades.map(catalogueKey);
    if (new Set(gradeKeys).size !== gradeKeys.length) return fail("同一课程体系内的年级不能重复");
    if (!Array.isArray(row.subjects) || row.subjects.length > 120) return fail("每个课程体系最多可包含 120 个科目");
    const subjectIds = new Set<string>(), keys = new Map<string, string>();
    const subjects = row.subjects.map(value => {
      const subject = record(value), subjectId = identifier(subject.id), subjectName = text(subject.name, 100);
      if (typeof subject.active !== "boolean" || subjectIds.has(subjectId)) return fail("科目编号重复或启用状态无效");
      subjectIds.add(subjectId);
      if (!Array.isArray(subject.aliases) || subject.aliases.length > 40) return fail("科目别名格式无效");
      const aliases = [...new Map(subject.aliases.map(value => { const alias = text(value, 100); return [catalogueKey(alias), alias]; })).values()];
      for (const key of [subjectId, subjectName, ...aliases].map(catalogueKey)) {
        if (keys.has(key) && keys.get(key) !== subjectId) return fail("同一课程体系内的科目名称或别名不能指向不同科目");
        keys.set(key, subjectId);
      }
      return {id: subjectId, name: subjectName, aliases, active: subject.active};
    });
    return {id, name, active: row.active, grades, subjects};
  });
  for (const old of previous || []) {
    const next = result.find(s => s.id === old.id);
    if (!next || next.name !== old.name) return fail("已有课程体系不能删除或改名，请使用停用功能");
    if (old.grades.some((grade,index) => next.grades[index] !== grade)) return fail("已有年级不能删除、改名或重新排序，可以在末尾添加新年级");
    for (const subject of old.subjects) {
      const nextSubject = next.subjects.find(s => s.id === subject.id);
      if (!nextSubject || nextSubject.name !== subject.name) return fail("已有科目不能删除或改名，请使用停用功能");
      if (subject.aliases.some(alias => !nextSubject.aliases.some(value => catalogueKey(value) === catalogueKey(alias)))) return fail("已有科目别名需保留，以便识别历史资料");
    }
  }
  return result;
}

type SubjectSeed = [string, string, ...string[]];
const subjects = (rows: SubjectSeed[]): CatalogueSubject[] => rows.map(([id, name, ...aliases]) => ({id, name, aliases, active: true}));
const spm: CatalogueSyllabus = {id:"spm",name:"SPM",active:true,grades:Array.from({length:5},(_,i)=>`Form ${i+1}`),subjects:subjects([
  ["bahasa-melayu","Bahasa Melayu","BM","Malay","马来文","马来语"],
  ["english","English","Bahasa Inggeris","BI","English Language","英文","英语"],
  ["mathematics","Mathematics","Math","Maths","Matematik","数学"],
  ["additional-mathematics","Additional Mathematics","Add Math","Add Maths","Additional Maths","Matematik Tambahan","高级数学","附加数学"],
  ["science","Science","Sains","科学"],["biology","Biology","Biologi","生物"],
  ["chemistry","Chemistry","Kimia","化学"],["physics","Physics","Fizik","物理"],
  ["history","History","Sejarah","历史"],["geography","Geography","Geografi","地理"],
  ["accounting","Accounting","Principles of Accounting","Prinsip Perakaunan","Accounts","会计"],
  ["business","Business","Business Studies","Perniagaan","商业"],["economics","Economics","Ekonomi","经济"],
  ["chinese","Chinese","Bahasa Cina","华文","中文"],["tamil","Tamil","Bahasa Tamil","淡米尔文"],
  ["moral-education","Moral Education","Pendidikan Moral","Moral","道德教育"],
  ["islamic-education","Islamic Education","Pendidikan Islam","Islam","伊斯兰教育"],
  ["computer-science","Computer Science","Sains Komputer","计算机科学"],
])};
const igcse: CatalogueSyllabus = {id:"igcse",name:"IGCSE",active:true,grades:Array.from({length:11},(_,i)=>`Year ${i+1}`),subjects:subjects([
  ["mathematics","Mathematics","Math","Maths","Matematik","数学"],
  ["additional-mathematics","Additional Mathematics","Add Math","Add Maths","Additional Maths","附加数学"],
  ["english","English","English Language","英文","英语"],
  ["english-first-language","English First Language","First Language English"],
  ["english-second-language","English as a Second Language","English Second Language","ESL"],
  ["science","Science","Sains","科学"],["combined-science","Combined Science","Combined Sciences"],
  ["coordinated-sciences","Co-ordinated Sciences","Coordinated Sciences","Coordinated Science","Co-ordinated Science"],
  ["biology","Biology","Biologi","生物"],["chemistry","Chemistry","Kimia","化学"],["physics","Physics","Fizik","物理"],
  ["accounting","Accounting","Accounts","会计"],["business-studies","Business Studies","Business","商业"],
  ["economics","Economics","Ekonomi","经济"],["computer-science","Computer Science","计算机科学"],
  ["ict","Information and Communication Technology","ICT","Information Technology"],
  ["geography","Geography","Geografi","地理"],["history","History","Sejarah","历史"],
  ["chinese-first-language","Chinese First Language","First Language Chinese","Chinese","华文","中文"],
  ["chinese-foreign-language","Chinese as a Foreign Language","Chinese Foreign Language","Mandarin Chinese"],
  ["malay-foreign-language","Malay as a Foreign Language","Malay Foreign Language","Malay","Bahasa Melayu","BM"],
  ["art-and-design","Art and Design","Art & Design","Art","美术"],
])};
const stpm: CatalogueSyllabus = {id:"stpm",name:"STPM",active:true,grades:["Semester 1","Semester 2","Semester 3"],subjects:subjects([
  ["general-studies","General Studies","Pengajian Am","PA"],
  ["bahasa-melayu","Bahasa Melayu","Malay","BM","马来文"],["chinese","Chinese","Bahasa Cina","华文","中文"],
  ["tamil","Tamil","Bahasa Tamil","淡米尔文"],["mathematics-t","Mathematics (T)","Mathematics T","Math T","数学 T"],
  ["mathematics-m","Mathematics (M)","Mathematics M","Math M","数学 M"],
  ["physics","Physics","Fizik","物理"],["chemistry","Chemistry","Kimia","化学"],["biology","Biology","Biologi","生物"],
  ["economics","Economics","Ekonomi","经济"],["business-studies","Business Studies","Pengajian Perniagaan","Business","商业"],
  ["accounting","Accounting","Perakaunan","Accounts","会计"],["history","History","Sejarah","历史"],
  ["geography","Geography","Geografi","地理"],["ict","Information and Communications Technology","ICT","Information Technology"],
  ["syariah","Syariah","Islamic Law"],
])};
const alevel: CatalogueSyllabus = {id:"a-level",name:"A-Level",active:true,grades:["AS Level","A2"],subjects:subjects([
  ["mathematics","Mathematics","Math","Maths","数学"],["further-mathematics","Further Mathematics","Further Maths","Further Math","进阶数学"],
  ["biology","Biology","生物"],["chemistry","Chemistry","化学"],["physics","Physics","物理"],
  ["computer-science","Computer Science","计算机科学"],["accounting","Accounting","Accounts","会计"],
  ["business","Business","Business Studies","商业"],["economics","Economics","经济"],
  ["psychology","Psychology","心理学"],["sociology","Sociology","社会学"],
  ["history","History","历史"],["geography","Geography","地理"],
  ["english-literature","English Literature","Literature in English","文学"],["law","Law","法律"],
  ["art-and-design","Art and Design","Art & Design","Art","美术"],
])};

// Common teaching menus, without exam codes. General Science and English are
// retained for the lower-secondary tuition classes already using those labels.
export function defaultAcademicCatalogue(scope: CatalogueScope): AcademicCatalogue {
  const syllabuses = scope === "quiz" ? [spm, igcse] : [spm, igcse, stpm, alevel];
  return {scope, revision: 1, syllabuses: structuredClone(syllabuses)};
}
