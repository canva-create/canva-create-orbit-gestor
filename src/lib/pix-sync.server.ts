import { bancoCurto, nomePagador, pareceInstituicao } from "@/lib/pix-format";

type SupabaseClientLike = {
  from: (table: string) => any;
};

type MercadoPagoPayment = Record<string, any>;

type SyncResult = {
  ok: boolean;
  imported: number;
  found: number;
  message: string;
};

function normalizeAccessToken(value: unknown) {
  return String(value ?? "")
    .trim()
    .replace(/^Bearer\s+/i, "")
    .replace(/^["']|["']$/g, "")
    .replace(/[\u200B-\u200D\uFEFF]/g, "")
    .trim();
}

function validateAccessToken(accessToken: string) {
  if (!accessToken) return "Cadastre o Access Token de produção do Mercado Pago.";
  if (/^TEST-/i.test(accessToken)) return "A credencial informada é de teste. Use o Access Token de produção (APP_USR-...).";
  if (!/^APP_USR-/i.test(accessToken)) return "Access Token inválido. Copie a credencial de produção completa, iniciada por APP_USR-.";
  return null;
}

function mercadoPagoDayRange() {
  const today = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
  return {
    begin: `${today}T00:00:00.000-03:00`,
    end: `${today}T23:59:59.999-03:00`,
  };
}

function parsePayment(payment: MercadoPagoPayment) {
  const payer = payment.payer ?? {};
  const transactionData = payment.point_of_interaction?.transaction_data ?? {};
  const bankInfo = transactionData.bank_info ?? {};
  const payerName =
    nomePagador(
      [payer.first_name, payer.last_name].filter(Boolean).join(" ").trim(),
      bankInfo.payer?.long_name,
      payment.card?.cardholder?.name,
      payer.email,
    ) ?? null;
  const instituicao =
    bancoCurto(
      (pareceInstituicao(bankInfo.payer?.long_name) ? bankInfo.payer?.long_name : null) ??
        bankInfo.payer?.institution_name ??
        bankInfo.origin_bank_id,
    ) ?? "Mercado Pago";

  return {
    transacao_id: payment.id == null ? null : String(payment.id),
    end_to_end_id: transactionData.e2e_id ?? transactionData.transaction_id ?? null,
    valor: Number(payment.transaction_details?.total_paid_amount ?? payment.transaction_amount ?? 0),
    pagador_nome: payerName,
    pagador_documento: payer.identification?.number ?? null,
    instituicao,
    conta_destino: bankInfo.collector?.account_id ?? (payment.collector_id == null ? null : String(payment.collector_id)),
    status: String(payment.status ?? "approved"),
    descricao: payment.description ?? null,
    pago_em: payment.date_approved ? new Date(payment.date_approved).toISOString() : new Date().toISOString(),
    payload: payment,
  };
}

async function mercadoPagoRequest(url: URL, accessToken: string) {
  const response = await fetch(url, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const detail = payload?.message ?? payload?.error ?? `HTTP ${response.status}`;
    if (response.status === 401 || response.status === 403) {
      throw new Error("Mercado Pago recusou o Access Token. Gere/copiei novamente a credencial de produção da mesma aplicação vinculada ao webhook e clique em Testar conexão.");
    }
    throw new Error(`Mercado Pago recusou a consulta: ${detail}`);
  }
  return payload;
}

export async function syncMercadoPagoToday(
  supabase: SupabaseClientLike,
  userId: string,
): Promise<SyncResult> {
  const { data: integration, error: integrationError } = await supabase
    .from("integracoes")
    .select("id, credenciais")
    .eq("user_id", userId)
    .eq("provider", "mercadopago")
    .maybeSingle();

  if (integrationError) throw new Error(integrationError.message);
  if (!integration) return { ok: false, imported: 0, found: 0, message: "Mercado Pago ainda não foi configurado." };

  const accessToken = normalizeAccessToken(integration.credenciais?.access_token);
  const tokenError = validateAccessToken(accessToken);
  if (tokenError) return { ok: false, imported: 0, found: 0, message: tokenError };

  const { begin, end } = mercadoPagoDayRange();
  const payments: MercadoPagoPayment[] = [];
  let offset = 0;
  const limit = 100;

  try {
    // Confere a qual conta a credencial pertence (evita token de conta de teste)
    const me = await mercadoPagoRequest(new URL("https://api.mercadopago.com/users/me"), accessToken);
    const nickname = String(me?.nickname ?? "");
    if (/^TESTUSER/i.test(nickname) || me?.tags?.includes?.("test_user")) {
      const msg = `A credencial pertence a uma conta de TESTE do Mercado Pago (${nickname}). Gere o Access Token de produção da sua conta real (Suas integrações > sua aplicação > Credenciais de produção) e salve novamente.`;
      await supabase
        .from("integracoes")
        .update({ ativo: false, status: "erro", ultimo_teste_ok: false, ultimo_teste_msg: msg, ultima_sync: new Date().toISOString() })
        .eq("id", integration.id);
      return { ok: false, imported: 0, found: 0, message: msg };
    }

    // Busca por data de criação e por data de aprovação (pagamento criado ontem e aprovado hoje)
    for (const range of ["date_created", "date_approved"]) {
      offset = 0;
      while (offset < 1000) {
        const url = new URL("https://api.mercadopago.com/v1/payments/search");
        url.searchParams.set("sort", "date_created");
        url.searchParams.set("criteria", "desc");
        url.searchParams.set("range", range);
        url.searchParams.set("begin_date", begin);
        url.searchParams.set("end_date", end);
        url.searchParams.set("limit", String(limit));
        url.searchParams.set("offset", String(offset));
        const page = await mercadoPagoRequest(url, accessToken);
        const results = Array.isArray(page.results) ? page.results : [];
        payments.push(...results);
        if (results.length < limit) break;
        offset += limit;
      }
    }

    const unicos = Array.from(new Map(payments.map((p) => [String(p.id), p])).values());
    const approvedPix = unicos.filter(
      (payment) =>
        ["approved", "accredited"].includes(String(payment.status)) &&
        (payment.payment_method_id === "pix" || payment.payment_type_id === "bank_transfer"),
    );
    const rows = approvedPix.map((payment) => ({
      user_id: userId,
      provider: "mercadopago",
      ...parsePayment(payment),
    }));

    const transactionIds = rows.map((row) => row.transacao_id).filter(Boolean);
    let existingIds = new Set<string>();
    if (transactionIds.length) {
      const { data: existing, error: existingError } = await supabase
        .from("pix_pagamentos")
        .select("transacao_id")
        .eq("user_id", userId)
        .eq("provider", "mercadopago")
        .in("transacao_id", transactionIds);
      if (existingError) throw new Error(`Falha ao conferir pagamentos: ${existingError.message}`);
      existingIds = new Set((existing ?? []).map((row: { transacao_id: string | null }) => String(row.transacao_id ?? "")));
    }
    const imported = rows.filter((row) => row.transacao_id && !existingIds.has(row.transacao_id)).length;

    if (rows.length) {
      const { error } = await supabase
        .from("pix_pagamentos")
        .upsert(rows, { onConflict: "user_id,provider,transacao_id" });
      if (error) throw new Error(`Falha ao salvar pagamentos: ${error.message}`);
    }

    const now = new Date().toISOString();
    await supabase
      .from("integracoes")
      .update({
        ativo: true,
        status: "conectado",
        ultimo_teste_ok: true,
        ultimo_teste_msg: `${approvedPix.length} pagamento(s) Pix aprovado(s) encontrado(s) hoje; ${imported} novo(s) registrado(s).`,
        ultima_sync: now,
      })
      .eq("id", integration.id);

    return {
      ok: true,
      imported,
      found: approvedPix.length,
      message: `${approvedPix.length} pagamento(s) Pix sincronizado(s) hoje; ${imported} novo(s) registrado(s).`,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Falha desconhecida ao consultar o Mercado Pago.";
    await supabase
      .from("integracoes")
      .update({
        ativo: false,
        status: "erro",
        ultimo_teste_ok: false,
        ultimo_teste_msg: message,
        ultima_sync: new Date().toISOString(),
      })
      .eq("id", integration.id);
    return { ok: false, imported: 0, found: 0, message };
  }
}