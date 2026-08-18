UPDATE public.pix_pagamentos
SET pagador_nome = NULL
WHERE pagador_nome IS NOT NULL
  AND (
    pagador_nome ~* '^(.)\1{2,}$'
    OR pagador_nome ~* '(banco|s\.?\s?a\.?|ltda|institui|pagamentos?|dtvm|scd|financeira|cooperativa|bank)'
  );

UPDATE public.pix_pagamentos
SET pago_em = created_at
WHERE pago_em::time = '00:00:00';