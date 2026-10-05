-- Customers share one database (each in its own schema), and a NOTIFY channel is database-wide. The message now
-- says which customer's schema it came from, so the push listener can look the recipient up in the right place.
CREATE OR REPLACE FUNCTION notify_new_notification() RETURNS trigger AS $$
BEGIN
  IF NEW.user_id IS NOT NULL THEN
    PERFORM pg_notify('levoy_notification', json_build_object(
      'schema', TG_TABLE_SCHEMA,
      'id', NEW.id, 'user_id', NEW.user_id, 'type', NEW.type, 'title', left(NEW.title, 200), 'message', left(COALESCE(NEW.message, ''), 500),
      'data', CASE WHEN length(COALESCE(NEW.data::text, '')) < 1500 THEN NEW.data ELSE NULL END)::text);
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
