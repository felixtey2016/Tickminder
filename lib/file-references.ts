import {learningDb} from './learning-server';
export type StoredAssetKind='pdf'|'quiz_image'|'invoice_logo';
export type StoredFileReference={groupId:string;assetKind:StoredAssetKind;fileId:string;sourceKind:string;sourceId:string};

// A common, internal-only entry point for future attachments. Native historical
// relationships are read directly by the view, so no mirrored ref cache drifts.
// This grants retention only; access must always be checked by the source API.
export function retainFileReference(ref:StoredFileReference){
  // Other domains keep their current collectors. Enable their adapter only
  // together with native version refs and an R2-safe collector integration.
  if(ref.assetKind!=='pdf')throw new Error('Unsupported retention asset kind');
  if(!/^[a-z][a-z0-9_]{0,63}$/.test(ref.sourceKind)||!ref.sourceId||ref.sourceId.length>160)throw new Error('Invalid file reference');
  return learningDb().prepare(`INSERT INTO file_extra_references(group_id,asset_kind,file_id,source_kind,source_id,created_at)
    VALUES(?,?,?,?,?,?) ON CONFLICT(group_id,asset_kind,file_id,source_kind,source_id) DO NOTHING`)
    .bind(ref.groupId,ref.assetKind,ref.fileId,ref.sourceKind,ref.sourceId,new Date().toISOString());
}
export function releaseFileReference(ref:StoredFileReference){
  return learningDb().prepare('DELETE FROM file_extra_references WHERE group_id=? AND asset_kind=? AND file_id=? AND source_kind=? AND source_id=?')
    .bind(ref.groupId,ref.assetKind,ref.fileId,ref.sourceKind,ref.sourceId);
}
// Never a read authorization predicate. Historical/archived refs intentionally
// retain files until their owning module explicitly removes the relationship.
export const unreferencedPdfSql=(alias:string)=>`NOT EXISTS(SELECT 1 FROM stored_file_references retained WHERE retained.asset_kind='pdf' AND retained.file_id=${alias}.id)`;
