-- Supabase grants default Data API privileges to new public tables, including
-- Prisma's migration history. Keep this server-managed table private as well.
DO $$
DECLARE role_name TEXT;
BEGIN
  IF to_regclass('public._prisma_migrations') IS NOT NULL THEN
    ALTER TABLE public."_prisma_migrations" ENABLE ROW LEVEL SECURITY;
    REVOKE ALL ON TABLE public."_prisma_migrations" FROM PUBLIC;
    FOREACH role_name IN ARRAY ARRAY['anon', 'authenticated'] LOOP
      IF EXISTS (SELECT FROM pg_roles WHERE rolname = role_name) THEN
        EXECUTE format('REVOKE ALL ON TABLE public."_prisma_migrations" FROM %I', role_name);
      END IF;
    END LOOP;
  END IF;
END $$;
