UPDATE public.pix_pagamentos
SET pagador_nome = NULL
WHERE pagador_nome IS NOT NULL
  AND length(regexp_replace(pagador_nome, '[^a-zA-Z0-9À-ÿ]', '', 'g')) > 0
  AND length(regexp_replace(pagador_nome, '[xX*•._#-]', '', 'g')) = 0;