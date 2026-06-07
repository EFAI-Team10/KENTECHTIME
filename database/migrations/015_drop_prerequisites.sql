-- 015_drop_prerequisites
-- The prerequisites table was unused: the KENTECH handbook only has ESP and IR
-- ordering requirements, and ESP is already handled by dedicated stage logic
-- (getEspNextStageCodes). The table held no data and checkPrerequisites was a
-- no-op, so both are removed. Run this on existing databases.

DROP INDEX IF EXISTS idx_prerequisites_course_id;
DROP TABLE IF EXISTS prerequisites;
