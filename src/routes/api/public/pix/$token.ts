import { createFileRoute } from "@tanstack/react-router";
import { bancoCurto, nomeMascarado, nomePagador, pareceInstituicao } from "@/lib/pix-format";

type Parsed = {
  transacao_id: string | null;
  end_to_end_id: string | null;
  valor: number;
  pagador_nome: string | null;
  pagador_documento: string | null;
  instituicao: string | null;
  conta_destino: string | null;
  status: string;
  descricao: string | null;
  pago_em: string;
};

function num(v: unknown): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

/**
 * Converte a data do provedor em ISO. Datas sem hora (ex.: Asaas "2026-08-02")
 * viravam meia-noite e bagunçavam a ordenação; nesse caso usamos o horário da notificação.
 */
function instantePagamento(...candidatos: unknown[]): string {
  for (const c of candidatos) {
    const raw = String(c ?? "").trim();
    if (!raw) continue;
    const temHora = /\d{1,2}:\d{2}/.test(raw);
    const d = new Date(temHora ? raw : `${raw}T00:00:00`);
    if (Number.isNaN(d.getTime())) continue;
    if (!temHora) continue; // só data: preferimos o horário real de recebimento
    return d.toISOString();
  }
  return new Date().toISOString();
}

function normalizeAccessToken(value: unknown) {
  return String(value ?? "")
    .trim()
    .replace(/^Bearer\s+/i, "")
    .replace(/^["']|["']$/g, "")
    .replace(/[\u200B-\u200D\uFEFF]/g, "")
    .trim();
}

/** Procura recursivamente a primeira chave (case-insensitive) com valor útil. */
function deepFind(obj: any, keys: string[], depth = 0): string | null {
  if (!obj || typeof obj !== "object" || depth > 6) return null;
  const wanted = keys.map((k) => k.toLowerCase());
  for (const [k, v] of Object.entries(obj)) {
    if (wanted.includes(k.toLowerCase())) {
      if (typeof v === "string" && v.trim()) return v.trim();
      if (typeof v === "number") return String(v);
    }
  }
  for (const v of Object.values(obj)) {
    if (v && typeof v === "object") {
      const found = deepFind(v, keys, depth + 1);
      if (found) return found;
    }
  }
  return null;
}

const NOME_KEYS = [
  "pagador_nome", "payer_name", "payerName", "nomePagador", "nome_pagador",
  "customerName", "customer_name", "debtor_name", "devedor_nome", "nomeDevedor",
  "senderName", "sender_name", "nome", "name", "full_name", "razaoSocial",
  "social_name", "holder_name", "titular",
];
const DOC_KEYS = [
  "pagador_documento", "cpfCnpj", "cpf_cnpj", "taxId", "tax_id", "cpf", "cnpj",
  "document", "documento", "identification_number", "nuDocumento",
];
const BANCO_KEYS = [
  "instituicao", "institution", "bank", "banco", "bankName", "nomeBanco",
  "ispb", "issuer", "payment_method_id", "origem",
];
const CONTA_KEYS = [
  "conta_destino", "receiver_account", "contaRecebedor", "account", "conta",
  "chave", "pixKey", "chavePix", "receiverKey", "destination_account",
];
const E2E_KEYS = ["endToEndId", "end_to_end_id", "e2eId", "endToEndIdentification", "txid", "txId"];

/** Busca o pagamento completo na API do Mercado Pago (o webhook envia apenas o id). */
async function fetchMercadoPago(id: string, accessToken: string): Promise<{ data: any | null; error: string | null }> {
  if (!id) return { data: null, error: "A notificação não informou o ID do pagamento." };
  if (!accessToken) return { data: null, error: "Access Token de produção não cadastrado." };
  try {
    const res = await fetch(`https://api.mercadopago.com/v1/payments/${id}`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    const payload = await res.json().catch(() => ({}));
    if (!res.ok) {
      if (res.status === 401 || res.status === 403) {
        return { data: null, error: "Access Token de produção recusado. Substitua a credencial pela chave completa da mesma aplicação configurada no webhook." };
      }
      return { data: null, error: payload?.message ?? payload?.error ?? `HTTP ${res.status}` };
    }
    return { data: payload, error: null };
  } catch (error) {
    return { data: null, error: error instanceof Error ? error.message : "Falha de conexão com o Mercado Pago." };
  }
}

function parseMercadoPago(p: any): Parsed {
  const now = new Date().toISOString();
  const payer = p?.payer ?? {};
  const bankPayer = p?.point_of_interaction?.transaction_data?.bank_info?.payer ?? {};
  const nome =
    nomePagador(
      [payer.first_name, payer.last_name].filter(Boolean).join(" ").trim(),
      bankPayer.long_name,
      p?.card?.cardholder?.name,
      payer.email,
    ) ?? null;
  const banco =
    bancoCurto(
      (pareceInstituicao(bankPayer.long_name) ? bankPayer.long_name : null) ??
        bankPayer.institution_name ??
        p?.point_of_interaction?.transaction_data?.bank_info?.origin_bank_id,
    ) ?? "Mercado Pago";
  return {
    transacao_id: p?.id != null ? String(p.id) : null,
    end_to_end_id:
      p?.point_of_interaction?.transaction_data?.e2e_id ??
      p?.point_of_interaction?.transaction_data?.transaction_id ??
      null,
    valor: num(p?.transaction_details?.total_paid_amount ?? p?.transaction_amount),
    pagador_nome: nome,
    pagador_documento: payer?.identification?.number ?? null,
    instituicao: banco,
    conta_destino:
      p?.point_of_interaction?.transaction_data?.bank_info?.collector?.account_id ??
      (p?.collector_id != null ? String(p.collector_id) : null),
    status: String(p?.status ?? "recebido"),
    descricao: p?.description ?? null,
    pago_em: p?.date_approved ? new Date(p.date_approved).toISOString() : now,
  };
}

/** Percorre payload inteiro extraindo dados quando o parser específico falha. */
function enrich(body: any, parsed: Parsed): Parsed {
  const encontrado = deepFind(body, NOME_KEYS);
  return {
    ...parsed,
    pagador_nome:
      parsed.pagador_nome ||
      (encontrado && !nomeMascarado(encontrado) && !pareceInstituicao(encontrado) ? encontrado : null),
    pagador_documento: parsed.pagador_documento || deepFind(body, DOC_KEYS),
    instituicao: parsed.instituicao || deepFind(body, BANCO_KEYS),
    conta_destino: parsed.conta_destino || deepFind(body, CONTA_KEYS),
    end_to_end_id: parsed.end_to_end_id || deepFind(body, E2E_KEYS),
  };
}

function parsePayload(provider: string, body: any): Parsed {
  if (provider === "asaas") {
    const p = body?.payment ?? {};
    return {
      transacao_id: p.id ?? body?.id ?? null,
      end_to_end_id: p.endToEndIdentifier ?? null,
      valor: num(p.value ?? p.netValue),
      pagador_nome: nomePagador(
        p.customerName,
        body?.customer?.name,
        p.payerName,
        p.pixTransaction?.payer?.name,
        p.pixQrCodeId ? null : undefined,
      ),
      pagador_documento: body?.customer?.cpfCnpj ?? p.payerCpfCnpj ?? null,
      instituicao: "Asaas",
      conta_destino: p.pixQrCodeId ?? p.pixTransaction ?? null,
      status: String(body?.event ?? p.status ?? "recebido"),
      descricao: p.description ?? null,
      pago_em: instantePagamento(p.confirmedDate, p.clientPaymentDate, p.paymentDate, p.dateCreated),
    };
  }
  if (provider === "pagbank") {
    const c = Array.isArray(body?.charges) ? body.charges[0] : body?.charge ?? {};
    return {
      transacao_id: c?.id ?? body?.id ?? null,
      end_to_end_id: c?.payment_method?.pix?.end_to_end_id ?? null,
      valor: num(c?.amount?.value ?? body?.amount?.value) / (c?.amount?.value ? 100 : 1),
      pagador_nome: nomePagador(body?.customer?.name),
      pagador_documento: body?.customer?.tax_id ?? null,
      instituicao: "PagBank",
      conta_destino: c?.payment_method?.pix?.holder?.name ?? null,
      status: String(c?.status ?? body?.status ?? "recebido"),
      descricao: body?.reference_id ?? null,
      pago_em: instantePagamento(c?.paid_at),
    };
  }
  // Mercado Pago e formato genérico
  const d = body?.data ?? body ?? {};
  return {
    transacao_id: String(d.id ?? body?.id ?? "") || null,
    end_to_end_id: d.point_of_interaction?.transaction_data?.e2e_id ?? null,
    valor: num(d.transaction_amount ?? d.valor ?? body?.valor),
    pagador_nome: nomePagador(
      d.payer?.first_name ? `${d.payer.first_name} ${d.payer.last_name ?? ""}`.trim() : null,
      d.payer?.name,
      body?.pagador_nome,
    ),
    pagador_documento: d.payer?.identification?.number ?? body?.pagador_documento ?? null,
    instituicao: provider === "mercadopago" ? "Mercado Pago" : body?.instituicao ?? provider,
    conta_destino: d.collector_id ? String(d.collector_id) : body?.conta_destino ?? null,
    status: String(d.status ?? body?.action ?? "recebido"),
    descricao: d.description ?? body?.descricao ?? null,
    pago_em: instantePagamento(d.date_approved),
  };
}

export const Route = createFileRoute("/api/public/pix/$token")({
  server: {
    handlers: {
      GET: async ({ params }) => Response.json({ ok: true, token: params.token }),
      POST: async ({ request, params }) => {
        const token = params.token;
        let body: any = {};
        try {
          body = await request.json();
        } catch {
          body = {};
        }
        const url = new URL(request.url);
        const qs = Object.fromEntries(url.searchParams.entries());
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { data: integ } = await (supabaseAdmin as any)
          .from("integracoes")
          .select("id, user_id, provider, credenciais")
          .eq("webhook_token", token)
          .maybeSingle();
        if (!integ) return new Response("Webhook não encontrado", { status: 404 });

        const agora = new Date().toISOString();
        let parsed: Parsed;

        if (integ.provider === "mercadopago") {
          const tipo = String(body?.type ?? body?.topic ?? qs['type'] ?? qs['topic'] ?? "");
          const paymentId = String(
            body?.data?.id ?? body?.resource ?? qs['data.id'] ?? qs['id'] ?? "",
          ).split("/").pop() || "";

          // Notificações que não são de pagamento (merchant_order etc.) são só confirmadas.
          if (tipo && !tipo.includes("payment")) {
            await (supabaseAdmin as any)
              .from("integracoes")
              .update({ ultima_notificacao: agora, ativo: true, status: "conectado" })
              .eq("id", integ.id);
            return Response.json({ ok: true, ignorado: tipo });
          }

          const accessToken = normalizeAccessToken(integ.credenciais?.access_token);
          const consulta = await fetchMercadoPago(paymentId, accessToken);
          const detalhe = consulta.data;

          if (!detalhe) {
            await (supabaseAdmin as any)
              .from("integracoes")
              .update({
                ultima_notificacao: agora,
                ultimo_teste_ok: false,
                status: "erro",
                ativo: false,
                ultimo_teste_msg: `Webhook recebido, mas a consulta do pagamento falhou: ${consulta.error ?? "erro desconhecido"}`,
              })
              .eq("id", integ.id);
            // 200 evita reenvio infinito do Mercado Pago.
            return Response.json({ ok: false, motivo: "sem_access_token_ou_pagamento" });
          }

          const st = String(detalhe.status ?? "");
          if (st !== "approved" && st !== "accredited") {
            await (supabaseAdmin as any)
              .from("integracoes")
              .update({ ultima_notificacao: agora, ativo: true, status: "conectado" })
              .eq("id", integ.id);
            return Response.json({ ok: true, status: st });
          }
          if (String(detalhe.payment_method_id ?? "").toLowerCase() !== "pix") {
            await (supabaseAdmin as any)
              .from("integracoes")
              .update({ ultima_notificacao: agora, ativo: true, status: "conectado" })
              .eq("id", integ.id);
            return Response.json({ ok: true, ignorado: "pagamento_nao_pix" });
          }
          parsed = parseMercadoPago(detalhe);
          body = detalhe;
        } else {
          parsed = enrich(body, parsePayload(integ.provider, body));
        }

        if (!parsed.transacao_id && !parsed.end_to_end_id) {
          return Response.json({ ok: false, motivo: "sem_identificador" });
        }

        const { error: upsertError } = await (supabaseAdmin as any).from("pix_pagamentos").upsert(
          {
            user_id: integ.user_id,
            provider: integ.provider,
            transacao_id: parsed.transacao_id ?? parsed.end_to_end_id,
            end_to_end_id: parsed.end_to_end_id,
            valor: parsed.valor,
            pagador_nome: parsed.pagador_nome,
            pagador_documento: parsed.pagador_documento,
            instituicao: parsed.instituicao,
            conta_destino: parsed.conta_destino,
            status: parsed.status,
            descricao: parsed.descricao,
            pago_em: parsed.pago_em,
            payload: body,
          },
          { onConflict: "user_id,provider,transacao_id" },
        );
        if (upsertError) {
          await (supabaseAdmin as any)
            .from("integracoes")
            .update({ ultima_notificacao: agora, ultimo_teste_ok: false, ultimo_teste_msg: `Falha ao salvar o pagamento: ${upsertError.message}` })
            .eq("id", integ.id);
          return Response.json({ ok: false, erro: upsertError.message });
        }

        await (supabaseAdmin as any)
          .from("integracoes")
          .update({
            ultima_notificacao: agora,
            ativo: true,
            status: "conectado",
            ultimo_teste_ok: true,
            ultimo_teste_msg: `Pagamento ${parsed.transacao_id ?? parsed.end_to_end_id} recebido com sucesso.`,
          })
          .eq("id", integ.id);

        return Response.json({ ok: true });
      },
    },
  },
});