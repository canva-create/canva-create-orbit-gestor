DO $$
DECLARE u RECORD;
BEGIN
  FOR u IN SELECT id FROM auth.users LOOP
    PERFORM auth.uid();
    DELETE FROM auth.users WHERE id = u.id;
  END LOOP;
END $$;