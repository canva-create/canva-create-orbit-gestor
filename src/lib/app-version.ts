export const APP_BRAND = "RODOLFO TV";
export const APP_NAME = "Orbit";
export const APP_TAGLINE = "Gestão, organização e planejamento em um único lugar.";
export const APP_SYSTEM = APP_NAME;

export function reportHeaderLines(subtitulo?: string) {
  const agora = new Date();
  const emissao = agora.toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "medium" });
  return [APP_BRAND, APP_SYSTEM, `Emitido em: ${emissao}`, ...(subtitulo ? [subtitulo] : [])];
}
