ALTER TABLE public.pix_pagamentos
  ADD COLUMN IF NOT EXISTS conta_destino text,
  ADD COLUMN IF NOT EXISTS end_to_end_id text;

ALTER TABLE public.pix_pagamentos REPLICA IDENTITY FULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'pix_pagamentos'
  ) THEN
    EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE public.pix_pagamentos';
  END IF;
END $$;