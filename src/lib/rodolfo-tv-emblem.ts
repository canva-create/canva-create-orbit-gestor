/**
 * Emblema oficial da Rodolfo TV (Águia Real Dourada e Leão Imperial)
 * Desenhado em vetor de alta precisão diretamente no Canvas 2D com degradês metálicos,
 * brilho neon e alinhamento simétrico.
 */

export type EmblemType = "eagle" | "lion";

/**
 * Desenha o emblema da Rodolfo TV no Canvas 2D.
 *
 * @param ctx Contexto 2D do Canvas
 * @param cx Coordenada X central
 * @param cy Coordenada Y central
 * @param scale Escala multiplicadora (padrão: 1)
 * @param type Tipo do emblema ('eagle' por padrão, ou 'lion')
 */
export function drawRodolfoTVEmblem(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  scale: number = 1,
  type: EmblemType = "eagle",
) {
  ctx.save();
  ctx.translate(cx, cy);
  ctx.scale(scale, scale);

  if (type === "lion") {
    drawLionEmblem(ctx);
  } else {
    drawEagleEmblem(ctx);
  }

  ctx.restore();
}

/**
 * Águia Imperial Majestosa com asas abertas, coroa dourada,
 * penas em camadas ouro/ciano e peitoral nobre.
 */
function drawEagleEmblem(ctx: CanvasRenderingContext2D) {
  // 1. Halo com brilho radial azul ciano e ouro
  const halo = ctx.createRadialGradient(0, -6, 4, 0, -6, 56);
  halo.addColorStop(0, "rgba(56, 189, 248, 0.42)");
  halo.addColorStop(0.35, "rgba(245, 158, 11, 0.22)");
  halo.addColorStop(1, "rgba(8, 14, 26, 0)");
  ctx.fillStyle = halo;
  ctx.beginPath();
  ctx.arc(0, -6, 56, 0, Math.PI * 2);
  ctx.fill();

  // 2. Brasão / Escudo Heráldico de fundo (Vidro Dark com borda ouro/ciano)
  const shieldGrad = ctx.createLinearGradient(-35, -40, 35, 40);
  shieldGrad.addColorStop(0, "#fde047");
  shieldGrad.addColorStop(0.4, "#38bdf8");
  shieldGrad.addColorStop(1, "#ca8a04");

  ctx.fillStyle = "#0c162d";
  ctx.strokeStyle = shieldGrad;
  ctx.lineWidth = 1.6;
  ctx.beginPath();
  ctx.moveTo(0, -44);
  ctx.lineTo(38, -22);
  ctx.lineTo(38, 14);
  ctx.lineTo(0, 42);
  ctx.lineTo(-38, 14);
  ctx.lineTo(-38, -22);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();

  // Contorno interno sutil em ciano
  ctx.strokeStyle = "rgba(56, 189, 248, 0.5)";
  ctx.lineWidth = 0.8;
  ctx.beginPath();
  ctx.moveTo(0, -40);
  ctx.lineTo(34, -20);
  ctx.lineTo(34, 12);
  ctx.lineTo(0, 38);
  ctx.lineTo(-34, 12);
  ctx.lineTo(-34, -20);
  ctx.closePath();
  ctx.stroke();

  // 3. Cauda em leque (Ouro e Ciano)
  const goldTail = ctx.createLinearGradient(0, 16, 0, 38);
  goldTail.addColorStop(0, "#fde047");
  goldTail.addColorStop(1, "#a16207");
  ctx.fillStyle = goldTail;
  ctx.beginPath();
  ctx.moveTo(0, 16);
  ctx.lineTo(10, 36);
  ctx.lineTo(0, 32);
  ctx.lineTo(-10, 36);
  ctx.closePath();
  ctx.fill();

  const cyanTail = ctx.createLinearGradient(0, 18, 0, 34);
  cyanTail.addColorStop(0, "#38bdf8");
  cyanTail.addColorStop(1, "#0284c7");
  ctx.fillStyle = cyanTail;
  ctx.beginPath();
  ctx.moveTo(0, 18);
  ctx.lineTo(5, 33);
  ctx.lineTo(0, 30);
  ctx.lineTo(-5, 33);
  ctx.closePath();
  ctx.fill();

  // 4. Asas Simétricas com Penas em Camadas (Desenhamos a metade direita e espelhamos para a esquerda)
  const goldFeatherGrad = ctx.createLinearGradient(0, -25, 60, -10);
  goldFeatherGrad.addColorStop(0, "#fffbeb");
  goldFeatherGrad.addColorStop(0.3, "#fde047");
  goldFeatherGrad.addColorStop(0.7, "#d97706");
  goldFeatherGrad.addColorStop(1, "#854d0e");

  const cyanFeatherGrad = ctx.createLinearGradient(5, -10, 55, 5);
  cyanFeatherGrad.addColorStop(0, "#e0f2fe");
  cyanFeatherGrad.addColorStop(0.4, "#38bdf8");
  cyanFeatherGrad.addColorStop(0.8, "#0284c7");
  cyanFeatherGrad.addColorStop(1, "#0369a1");

  const drawHalfWing = (c: CanvasRenderingContext2D) => {
    // Pena 1 - Superior / Mais longa (Envergadura majestosa)
    c.fillStyle = goldFeatherGrad;
    c.beginPath();
    c.moveTo(5, -9);
    c.bezierCurveTo(16, -22, 38, -38, 66, -30);
    c.bezierCurveTo(50, -20, 40, -12, 33, -3);
    c.bezierCurveTo(23, -3, 13, -7, 5, -9);
    c.closePath();
    c.fill();

    // Pena 2 - Média-alta (Azul ciano vibrante)
    c.fillStyle = cyanFeatherGrad;
    c.beginPath();
    c.moveTo(7, -3);
    c.bezierCurveTo(22, -10, 46, -18, 62, -10);
    c.bezierCurveTo(48, -4, 38, 4, 29, 9);
    c.bezierCurveTo(19, 5, 13, 0, 7, -3);
    c.closePath();
    c.fill();

    // Pena 3 - Média-baixa (Ouro metálico)
    c.fillStyle = goldFeatherGrad;
    c.beginPath();
    c.moveTo(7, 4);
    c.bezierCurveTo(20, 0, 42, -2, 54, 7);
    c.bezierCurveTo(42, 13, 32, 18, 23, 20);
    c.bezierCurveTo(16, 15, 11, 8, 7, 4);
    c.closePath();
    c.fill();

    // Pena 4 - Inferior (Ciano neon)
    c.fillStyle = cyanFeatherGrad;
    c.beginPath();
    c.moveTo(6, 10);
    c.bezierCurveTo(16, 10, 34, 12, 44, 21);
    c.bezierCurveTo(32, 24, 24, 25, 15, 23);
    c.bezierCurveTo(10, 19, 8, 14, 6, 10);
    c.closePath();
    c.fill();

    // Ombro / Base da asa
    c.fillStyle = goldFeatherGrad;
    c.beginPath();
    c.moveTo(4, -11);
    c.bezierCurveTo(12, -13, 25, -7, 28, 0);
    c.bezierCurveTo(22, 4, 11, 5, 4, 2);
    c.closePath();
    c.fill();
  };

  // Asa direita
  ctx.save();
  drawHalfWing(ctx);
  ctx.restore();

  // Asa esquerda (espelhamento perfeito)
  ctx.save();
  ctx.scale(-1, 1);
  drawHalfWing(ctx);
  ctx.restore();

  // 5. Tronco & Peito da Águia
  const torsoGrad = ctx.createLinearGradient(0, -6, 0, 28);
  torsoGrad.addColorStop(0, "#fde047");
  torsoGrad.addColorStop(0.5, "#d97706");
  torsoGrad.addColorStop(1, "#854d0e");
  ctx.fillStyle = torsoGrad;
  ctx.beginPath();
  ctx.moveTo(0, -5);
  ctx.lineTo(10, 7);
  ctx.lineTo(7, 23);
  ctx.lineTo(0, 28);
  ctx.lineTo(-7, 23);
  ctx.lineTo(-10, 7);
  ctx.closePath();
  ctx.fill();

  // Núcleo Diamante Neon no Peito
  const heartGrad = ctx.createLinearGradient(0, 0, 0, 20);
  heartGrad.addColorStop(0, "#e0f2fe");
  heartGrad.addColorStop(0.5, "#38bdf8");
  heartGrad.addColorStop(1, "#0284c7");
  ctx.fillStyle = heartGrad;
  ctx.strokeStyle = "#ffffff";
  ctx.lineWidth = 0.8;
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.lineTo(6, 10);
  ctx.lineTo(0, 20);
  ctx.lineTo(-6, 10);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();

  // 6. Coroa Imperial no Topo
  const crownGrad = ctx.createLinearGradient(0, -35, 0, -22);
  crownGrad.addColorStop(0, "#fffbeb");
  crownGrad.addColorStop(0.4, "#fde047");
  crownGrad.addColorStop(1, "#ca8a04");
  ctx.fillStyle = crownGrad;
  ctx.strokeStyle = "#ffffff";
  ctx.lineWidth = 0.6;
  ctx.beginPath();
  ctx.moveTo(-8, -26);
  ctx.lineTo(-5, -33);
  ctx.lineTo(-2, -28);
  ctx.lineTo(0, -35);
  ctx.lineTo(2, -28);
  ctx.lineTo(5, -33);
  ctx.lineTo(8, -26);
  ctx.lineTo(0, -23);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();

  // Pedras preciosas na coroa
  ctx.fillStyle = "#38bdf8";
  ctx.beginPath();
  ctx.arc(0, -35, 1.2, 0, Math.PI * 2);
  ctx.arc(-5, -33, 0.9, 0, Math.PI * 2);
  ctx.arc(5, -33, 0.9, 0, Math.PI * 2);
  ctx.fill();

  // 7. Cabeça da Águia
  ctx.fillStyle = torsoGrad;
  ctx.beginPath();
  ctx.moveTo(-6, -24);
  ctx.bezierCurveTo(-6, -28, 6, -28, 6, -24);
  ctx.bezierCurveTo(6, -19, 8, -15, 8, -12);
  ctx.lineTo(-8, -12);
  ctx.bezierCurveTo(-8, -15, -6, -19, -6, -24);
  ctx.closePath();
  ctx.fill();

  // Bico Afiado (Ouro claro com friso escuro)
  ctx.fillStyle = "#fef08a";
  ctx.strokeStyle = "#ca8a04";
  ctx.lineWidth = 0.8;
  ctx.beginPath();
  ctx.moveTo(-4, -14);
  ctx.lineTo(0, -5);
  ctx.lineTo(4, -14);
  ctx.bezierCurveTo(2, -17, -2, -17, -4, -14);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();

  ctx.strokeStyle = "#854d0e";
  ctx.lineWidth = 0.7;
  ctx.beginPath();
  ctx.moveTo(0, -15);
  ctx.lineTo(0, -5);
  ctx.stroke();

  // Olhos penetrantes em azul ciano
  ctx.fillStyle = "#38bdf8";
  ctx.beginPath();
  ctx.moveTo(-2.5, -17);
  ctx.lineTo(-5, -18);
  ctx.lineTo(-2, -19);
  ctx.closePath();
  ctx.fill();

  ctx.beginPath();
  ctx.moveTo(2.5, -17);
  ctx.lineTo(5, -18);
  ctx.lineTo(2, -19);
  ctx.closePath();
  ctx.fill();

  // Ponto de luz nos olhos
  ctx.fillStyle = "#ffffff";
  ctx.beginPath();
  ctx.arc(-3.2, -18, 0.5, 0, Math.PI * 2);
  ctx.arc(3.2, -18, 0.5, 0, Math.PI * 2);
  ctx.fill();
}

/**
 * Leão Imperial Majestoso com juba geométrica esculpida,
 * coroa e olhar nobre com degradê ouro e ciano.
 */
function drawLionEmblem(ctx: CanvasRenderingContext2D) {
  // 1. Halo suave
  const halo = ctx.createRadialGradient(0, -5, 4, 0, -5, 52);
  halo.addColorStop(0, "rgba(245, 158, 11, 0.35)");
  halo.addColorStop(0.4, "rgba(56, 189, 248, 0.2)");
  halo.addColorStop(1, "rgba(8, 14, 26, 0)");
  ctx.fillStyle = halo;
  ctx.beginPath();
  ctx.arc(0, -5, 52, 0, Math.PI * 2);
  ctx.fill();

  // 2. Brasão de fundo
  const goldGrad = ctx.createLinearGradient(-30, -35, 30, 35);
  goldGrad.addColorStop(0, "#fde047");
  goldGrad.addColorStop(0.5, "#eab308");
  goldGrad.addColorStop(1, "#ca8a04");

  ctx.fillStyle = "#0c162d";
  ctx.strokeStyle = goldGrad;
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(0, -46);
  ctx.lineTo(36, -24);
  ctx.lineTo(36, 12);
  ctx.lineTo(0, 40);
  ctx.lineTo(-36, 12);
  ctx.lineTo(-36, -24);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();

  // 3. Juba do Leão (Mechas em ouro e ciano, desenhadas na direita e espelhadas na esquerda)
  const cyanGrad = ctx.createLinearGradient(0, -20, 40, 20);
  cyanGrad.addColorStop(0, "#e0f2fe");
  cyanGrad.addColorStop(0.5, "#38bdf8");
  cyanGrad.addColorStop(1, "#0284c7");

  const drawHalfMane = (c: CanvasRenderingContext2D) => {
    // Mecha 1 (topo)
    c.fillStyle = goldGrad;
    c.beginPath();
    c.moveTo(0, -30);
    c.lineTo(18, -40);
    c.lineTo(12, -26);
    c.closePath();
    c.fill();

    // Mecha 2 (lateral alta - ciano)
    c.fillStyle = cyanGrad;
    c.beginPath();
    c.moveTo(12, -26);
    c.lineTo(32, -30);
    c.lineTo(20, -16);
    c.closePath();
    c.fill();

    // Mecha 3 (lateral média - ouro)
    c.fillStyle = goldGrad;
    c.beginPath();
    c.moveTo(20, -16);
    c.lineTo(36, -14);
    c.lineTo(22, -2);
    c.closePath();
    c.fill();

    // Mecha 4 (lateral baixa - ciano)
    c.fillStyle = cyanGrad;
    c.beginPath();
    c.moveTo(22, -2);
    c.lineTo(34, 6);
    c.lineTo(18, 12);
    c.closePath();
    c.fill();

    // Mecha 5 (queixo / base)
    c.fillStyle = goldGrad;
    c.beginPath();
    c.moveTo(18, 12);
    c.lineTo(26, 22);
    c.lineTo(10, 22);
    c.closePath();
    c.fill();

    c.beginPath();
    c.moveTo(10, 22);
    c.lineTo(12, 32);
    c.lineTo(0, 28);
    c.closePath();
    c.fill();
  };

  ctx.save();
  drawHalfMane(ctx);
  ctx.restore();

  ctx.save();
  ctx.scale(-1, 1);
  drawHalfMane(ctx);
  ctx.restore();

  // 4. Coroa do Leão
  ctx.fillStyle = goldGrad;
  ctx.strokeStyle = "#ffffff";
  ctx.lineWidth = 0.6;
  ctx.beginPath();
  ctx.moveTo(-10, -36);
  ctx.lineTo(-7, -46);
  ctx.lineTo(-3, -40);
  ctx.lineTo(0, -49);
  ctx.lineTo(3, -40);
  ctx.lineTo(7, -46);
  ctx.lineTo(10, -36);
  ctx.lineTo(0, -32);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();

  // Jóias da coroa
  ctx.fillStyle = "#38bdf8";
  ctx.beginPath();
  ctx.arc(0, -49, 1.2, 0, Math.PI * 2);
  ctx.arc(-7, -46, 0.9, 0, Math.PI * 2);
  ctx.arc(7, -46, 0.9, 0, Math.PI * 2);
  ctx.fill();

  // 5. Rosto / Focinho do Leão
  // Testa
  ctx.fillStyle = goldGrad;
  ctx.beginPath();
  ctx.moveTo(0, -30);
  ctx.lineTo(9, -22);
  ctx.lineTo(0, -12);
  ctx.lineTo(-9, -22);
  ctx.closePath();
  ctx.fill();

  // Bochechas escuras
  ctx.fillStyle = "#0c1830";
  ctx.strokeStyle = goldGrad;
  ctx.lineWidth = 0.8;
  ctx.beginPath();
  ctx.moveTo(0, -12);
  ctx.lineTo(12, -10);
  ctx.lineTo(10, 6);
  ctx.lineTo(0, 8);
  ctx.lineTo(-10, 6);
  ctx.lineTo(-12, -10);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();

  // Focinho
  ctx.fillStyle = goldGrad;
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.lineTo(5, 5);
  ctx.lineTo(3, 14);
  ctx.lineTo(0, 16);
  ctx.lineTo(-3, 14);
  ctx.lineTo(-5, 5);
  ctx.closePath();
  ctx.fill();

  // Nariz triangular
  ctx.fillStyle = "#080e1a";
  ctx.strokeStyle = "#38bdf8";
  ctx.lineWidth = 0.6;
  ctx.beginPath();
  ctx.moveTo(0, 3);
  ctx.lineTo(3.5, 0);
  ctx.lineTo(-3.5, 0);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();

  // Olhos penetrantes
  ctx.fillStyle = "#38bdf8";
  ctx.beginPath();
  ctx.moveTo(-7, -10);
  ctx.lineTo(-3.5, -8);
  ctx.lineTo(-5.5, -6.5);
  ctx.closePath();
  ctx.fill();

  ctx.beginPath();
  ctx.moveTo(7, -10);
  ctx.lineTo(3.5, -8);
  ctx.lineTo(5.5, -6.5);
  ctx.closePath();
  ctx.fill();

  ctx.fillStyle = "#ffffff";
  ctx.beginPath();
  ctx.arc(-5.2, -8.5, 0.5, 0, Math.PI * 2);
  ctx.arc(5.2, -8.5, 0.5, 0, Math.PI * 2);
  ctx.fill();
}
