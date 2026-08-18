import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { syncMercadoPagoToday } from "@/lib/pix-sync.server";

export const syncMercadoPagoTodayFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    try {
      return await syncMercadoPagoToday(context.supabase, context.userId);
    } catch (error) {
      return {
        ok: false,
        imported: 0,
        found: 0,
        message: error instanceof Error ? error.message : "Falha ao sincronizar o Mercado Pago.",
      };
    }
  });