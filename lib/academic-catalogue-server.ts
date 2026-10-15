import { learningDb } from "@/lib/learning-server";
import { catalogueGradeValid, isCatalogueScope, resolveCatalogueSelection, validateCatalogueSyllabuses, CatalogueValidationError, type AcademicCatalogue, type CatalogueScope } from "@/lib/academic-catalogue";

export async function readAcademicCatalogue(scope: CatalogueScope): Promise<AcademicCatalogue> {
  if (!isCatalogueScope(scope)) throw new CatalogueValidationError("课程菜单类别无效");
  const row = await learningDb().prepare("SELECT revision,content_json FROM academic_catalogues WHERE scope=?")
    .bind(scope).first<{revision:number;content_json:string}>();
  if (!row || !Number.isSafeInteger(row.revision) || row.revision < 1) throw new Error("课程菜单暂时不可用");
  const content = JSON.parse(row.content_json) as {syllabuses?: unknown};
  return {scope, revision: row.revision, syllabuses: validateCatalogueSyllabuses(content.syllabuses)};
}

export function assertCatalogueSelection(catalogue: AcademicCatalogue, syllabusId: string, subjectIdOrAlias: string, grade?: string | null) {
  const selection = resolveCatalogueSelection(catalogue, syllabusId, subjectIdOrAlias);
  if (!selection) throw new CatalogueValidationError("请选择菜单中已启用的课程体系和科目");
  if (!catalogueGradeValid(selection.syllabus, grade)) throw new CatalogueValidationError("请选择该课程体系的有效年级");
  return selection;
}
