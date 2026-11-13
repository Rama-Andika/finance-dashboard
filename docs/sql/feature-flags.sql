-- Feature flags of the Finance Dashboard (decision D69, docs/project-guide.md chapter 10.10).
-- Run by the OWNER by hand, with a database account that may write to system_main. The application only reads this row.
-- Never run by the application or by an AI assistant. Try it on a local or staging database first.

-- 1. Look at the row (nothing changes).
SELECT sysmain_id, name, valueprop, active
FROM system_main
WHERE name = 'DASHBOARD_FEATURE_FLAGS';

-- 2. Create the row, or replace its text when it exists. Turn flags on with true and off with false.
--    sysmain_id follows the ERP pattern of generateErpOid (src/server/oid.ts): (milliseconds since 1970 + 7 * 2^56) * 10 + a
--    digit; 7 is the default ERP_APP_ID_INDEX. Any unused number would also do. It is only used when the row is created.
INSERT INTO system_main (sysmain_id, name, valueprop, valtype, distype, groupprop, note, company_id, active)
VALUES (
  (CAST(ROUND(UNIX_TIMESTAMP(NOW(3)) * 1000) AS UNSIGNED) + 504403158265495552) * 10 + 5,
  'DASHBOARD_FEATURE_FLAGS',
  '{"version":1,"flags":{"example":true}}',
  'STRING',
  '',
  'Application',
  'Finance Dashboard feature flags',
  0,
  1
)
ON DUPLICATE KEY UPDATE valueprop = VALUES(valueprop);

-- 3. Change the text of an existing row (the same text format; every flag you leave out is off).
UPDATE system_main
SET valueprop = '{"version":1,"flags":{"example":false}}'
WHERE name = 'DASHBOARD_FEATURE_FLAGS';

-- 4. Turn every flag off at once.
UPDATE system_main
SET valueprop = '{"version":1,"flags":{}}'
WHERE name = 'DASHBOARD_FEATURE_FLAGS';
