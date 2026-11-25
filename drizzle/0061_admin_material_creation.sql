-- Grant administrator publishing explicitly while retaining uploader ownership.
-- No table, column or historical business row changes. Session guards remain in application SQL.
DROP TRIGGER IF EXISTS material_active_class_insert;
CREATE TRIGGER material_active_class_insert BEFORE INSERT ON teaching_materials
WHEN NEW.classroom_id IS NOT NULL BEGIN
 SELECT RAISE(ABORT,'invalid content classroom') WHERE NOT EXISTS(
  SELECT 1 FROM classrooms c
  JOIN tuition_groups g ON g.id=c.group_id AND g.active=1
  JOIN teachers t ON t.group_id=c.group_id AND t.name=c.teacher_name AND t.active=1
  JOIN accounts a ON a.id=NEW.owner_id AND a.disabled_at IS NULL
  WHERE c.id=NEW.classroom_id AND c.group_id=NEW.group_id AND c.archived=0
   AND NOT EXISTS(SELECT 1 FROM local_credentials credential WHERE credential.account_id=a.id AND credential.must_change_password=1)
   AND ((a.group_id=c.group_id AND a.role='teacher' AND a.teacher_name=c.teacher_name)
     OR (a.role='admin' AND (
       (lower(trim(a.email))='felixtey2016@gmail.com' AND substr(a.id,1,6)<>'local:')
       OR (a.group_id=c.group_id AND (g.chief_admin_id=a.id OR EXISTS(
        SELECT 1 FROM admin_permission_profiles p WHERE p.group_id=c.group_id AND p.account_id=a.id
         AND NOT EXISTS(
          SELECT 1 FROM json_each('["materials.create","materials.view","classrooms.view"]') required
          WHERE NOT EXISTS(SELECT 1 FROM json_each(CASE WHEN json_valid(p.grants_json) AND json_type(p.grants_json)='array' THEN p.grants_json ELSE '[]' END) granted WHERE granted.type='text' AND granted.value=required.value)
         )
         AND (NEW.folder_id IS NULL OR NOT EXISTS(
          SELECT 1 FROM json_each('["folders.placeContent","folders.view"]') required
          WHERE NOT EXISTS(SELECT 1 FROM json_each(CASE WHEN json_valid(p.grants_json) AND json_type(p.grants_json)='array' THEN p.grants_json ELSE '[]' END) granted WHERE granted.type='text' AND granted.value=required.value)
         ))
       )))
     )))
 );
END;
