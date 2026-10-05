-- Cleanup of state left by previous runs of verify_admin.sh.
-- Scoped to the qa.* test fixtures only; no seed/demo data is touched.
DELETE FROM users        WHERE email LIKE 'qa.%@levoy.co';
DELETE FROM invitations  WHERE email LIKE 'qa.%@levoy.co';
DELETE FROM user_capacity WHERE user_id NOT IN (SELECT id FROM users);
DELETE FROM audit_log    WHERE created_at < NOW();
