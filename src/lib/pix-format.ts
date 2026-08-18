/** Normalização de nomes de pagador e instituição bancária dos Pix. */

const BANCOS: Array<[RegExp, string]> = [
  [/nu\s*pagamentos|nubank|nu\s*financeira/i, "Nubank"],
  [/mercado\s*pago|mercadopago/i, "Mercado Pago"],
  [/asaas/i, "Asaas"],
  [/ita[úu]|itau\s*unibanco/i, "Itaú"],
  [/bradesco/i, "Bradesco"],
  [/santander/i, "Santander"],
  [/banco\s*inter|inter\s*s\.?a/i, "Inter"],
  [/caixa\s*econ[ôo]mica|^caixa/i, "Caixa"],
  [/banco\s*do\s*brasil|^bb\b/i, "Banco do Brasil"],
  [/picpay/i, "PicPay"],
  [/pagseguro|pagbank/i, "PagBank"],
  [/c6\s*bank|banco\s*c6/i, "C6"],
  [/sicoob/i, "Sicoob"],
  [/sicredi/i, "Sicredi"],
  [/btg\s*pactual/i, "BTG"],
  [/will\s*financeira|will\s*bank/i, "Will Bank"],
  [/neon/i, "Neon"],
  [/stone/i, "Stone"],
  [/efi|gerencianet/i, "Efí"],
  [/banrisul/i, "Banrisul"],
  [/safra/i, "Safra"],
  [/banco\s*original/i, "Original"],
  [/banco\s*pan/i, "Pan"],
  [/\bxp\b/i, "XP"],
  [/agibank/i, "Agibank"],
  [/pagar\.?me/i, "Pagar.me"],
  [/cielo/i, "Cielo"],
  [/ame\s*digital/i, "Ame"],
  [/banco\s*bmg/i, "BMG"],
  [/banco\s*votorantim|\bbv\b/i, "BV"],
  [/cora\s*sociedade|cora\s*scd/i, "Cora"],
  [/banco\s*rendimento/i, "Rendimento"],
  [/banco\s*daycoval/i, "Daycoval"],
  [/banco\s*topazio|topázio/i, "Topázio"],
];

const SUFIXOS =
  /\b(s\.?\s*a\.?|ltda\.?|me\b|eireli|instituicao|instituição|de\s+pagamento[s]?|pagamentos?|sociedade\s+de\s+credito.*|scd\b|ip\b|banco\s+m[uú]ltiplo|cr[ée]dito,?\s*financiamento.*|corretora.*|dtvm.*|conglomerado.*)\b/gi;

/** Devolve o nome curto e comercial da instituição (ex.: "Nu Pagamentos S.A." -> "Nubank"). */
export function bancoCurto(valor: unknown): string | null {
  const raw = String(valor ?? "").trim();
  if (!raw) return null;
  for (const [re, nome] of BANCOS) if (re.test(raw)) return nome;
  const limpo = raw
    .replace(SUFIXOS, " ")
    .replace(/[.,\-–—]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  const base = limpo || raw;
  const curto = base.split(" ").slice(0, 2).join(" ");
  return curto.length > 22 ? curto.slice(0, 22).trim() : curto;
}

/** Indica se o texto parece o nome de um banco/instituição e não de uma pessoa. */
export function pareceInstituicao(valor: unknown): boolean {
  const raw = String(valor ?? "").trim();
  if (!raw) return false;
  if (BANCOS.some(([re]) => re.test(raw))) return true;
  return /\b(banco|s\.?\s*a\.?|ltda|instituicao|instituição|pagamentos?|scd\b|dtvm|financeira|cooperativa|corretora|bank)\b/i.test(
    raw,
  );
}

/** Detecta valores mascarados/inúteis (ex.: "XXXXXXXX", "****", "-", "null"). */
export function nomeMascarado(valor: unknown): boolean {
  const raw = String(valor ?? "").trim();
  if (!raw) return true;
  if (/^(null|undefined|n\/?a|nao informado|não informado)$/i.test(raw)) return true;
  const semEspacos = raw.replace(/\s+/g, "");
  // Sequências de um único caractere repetido (X, *, •, ., -) ou quase tudo mascarado.
  if (/^(.)\1{2,}$/.test(semEspacos)) return true;
  const mascara = (semEspacos.match(/[x*•.\-_#]/gi) ?? []).length;
  if (semEspacos.length > 0 && mascara / semEspacos.length >= 0.6) return true;
  return false;
}

/** Escolhe o melhor nome de comprador, ignorando textos que são de instituições. */
export function nomePagador(...candidatos: unknown[]): string | null {
  for (const c of candidatos) {
    const v = String(c ?? "").trim();
    if (!v) continue;
    if (pareceInstituicao(v)) continue;
    if (nomeMascarado(v)) continue;
    return v;
  }
  return null;
}

/** Nome do comprador para exibição (ignora registros que salvaram o banco no campo). */
export function exibePagador(r: { pagador_nome?: string | null }): string | null {
  return nomePagador(r.pagador_nome);
}

/** Instituição abreviada para exibição. */
export function exibeBanco(r: {
  instituicao?: string | null;
  provider?: string | null;
  pagador_nome?: string | null;
}): string | null {
  return bancoCurto(r.instituicao) ?? bancoCurto(r.pagador_nome) ?? bancoCurto(r.provider);
}
