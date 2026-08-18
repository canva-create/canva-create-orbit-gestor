export const PLATAFORMA_ATIVACAO = "Rodolfo TV";

export function fullDateTime(iso: string | Date | null | undefined) {
  if (!iso) return "-";
  const d = typeof iso === "string" ? new Date(iso) : iso;
  return d.toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "medium" });
}

export function comprovanteAtivacao(a: any) {
  const blocos: string[] = [];
  blocos.push(`✅ *Ativado por ${PLATAFORMA_ATIVACAO}*`);
  blocos.push(`👤 *Cliente:* ${a.cliente_nome || "-"}`);
  const appLinhas = [
    `📺 *Aplicativo:* ${a.aplicativo || "-"} — *ATIVADO*`,
    ...(a.mac ? [`🔗 *MAC:* ${a.mac}`] : []),
    ...(a.device ? [`📱 *Device:* ${a.device}`] : []),
  ];
  blocos.push(appLinhas.join("\n"));
  blocos.push([
    `🗓️ *Ativado em:* ${fullDateTime(a.ativado_em)}`,
    `⏳ *Vence em:* ${fullDateTime(a.expira_em)}`,
  ].join("\n"));
  if (a.observacao) blocos.push(`📝 *Obs.:* ${a.observacao}`);
  return blocos.join("\n\n");
}
