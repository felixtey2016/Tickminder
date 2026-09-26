CREATE TABLE `students_next` (
	`name` text PRIMARY KEY NOT NULL,
	`name_key` text NOT NULL,
	`active` integer NOT NULL DEFAULT 1,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `students_next_name_key_unique` ON `students_next` (`name_key`);
--> statement-breakpoint
INSERT OR IGNORE INTO `students_next` (`name`, `name_key`, `active`, `created_at`)
SELECT `name`, lower(replace(replace(trim(`name`), ' ', ''), char(9), '')), 1, `created_at`
FROM `students`
ORDER BY CASE WHEN `name` LIKE '% %' THEN 0 ELSE 1 END, `name`;
--> statement-breakpoint
UPDATE `plans`
SET `student` = (SELECT `name` FROM `students_next` WHERE `name_key` = lower(replace(replace(trim(`plans`.`student`), ' ', ''), char(9), ''))),
    `key` = (SELECT `name` FROM `students_next` WHERE `name_key` = lower(replace(replace(trim(`plans`.`student`), ' ', ''), char(9), ''))) || '|' || `subject`
WHERE EXISTS (SELECT 1 FROM `students_next` WHERE `name_key` = lower(replace(replace(trim(`plans`.`student`), ' ', ''), char(9), '')) AND `name` <> `plans`.`student`);
--> statement-breakpoint
UPDATE `lessons`
SET `student` = (SELECT `name` FROM `students_next` WHERE `name_key` = lower(replace(replace(trim(`lessons`.`student`), ' ', ''), char(9), '')))
WHERE EXISTS (SELECT 1 FROM `students_next` WHERE `name_key` = lower(replace(replace(trim(`lessons`.`student`), ' ', ''), char(9), '')) AND `name` <> `lessons`.`student`);
--> statement-breakpoint
UPDATE `accounts`
SET `student_name` = (SELECT `name` FROM `students_next` WHERE `name_key` = lower(replace(replace(trim(`accounts`.`student_name`), ' ', ''), char(9), '')))
WHERE EXISTS (SELECT 1 FROM `students_next` WHERE `name_key` = lower(replace(replace(trim(`accounts`.`student_name`), ' ', ''), char(9), '')) AND `name` <> `accounts`.`student_name`);
--> statement-breakpoint
UPDATE `assignments`
SET `plan_key` = (SELECT `name` FROM `students_next` WHERE `name_key` = lower(replace(replace(trim(substr(`assignments`.`plan_key`, 1, instr(`assignments`.`plan_key`, '|') - 1)), ' ', ''), char(9), ''))) || substr(`plan_key`, instr(`plan_key`, '|'))
WHERE instr(`plan_key`, '|') > 0 AND EXISTS (
  SELECT 1 FROM `students_next`
  WHERE `name_key` = lower(replace(replace(trim(substr(`assignments`.`plan_key`, 1, instr(`assignments`.`plan_key`, '|') - 1)), ' ', ''), char(9), ''))
    AND `name` <> substr(`assignments`.`plan_key`, 1, instr(`assignments`.`plan_key`, '|') - 1)
);
--> statement-breakpoint
DROP TABLE `students`;
--> statement-breakpoint
ALTER TABLE `students_next` RENAME TO `students`;
--> statement-breakpoint
DROP INDEX `students_next_name_key_unique`;
--> statement-breakpoint
CREATE UNIQUE INDEX `students_name_key_unique` ON `students` (`name_key`);
