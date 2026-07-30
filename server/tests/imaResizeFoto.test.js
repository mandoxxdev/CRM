/**
 * Ima de REDIMENSIONAMENTO das fotos da proposta.
 *
 * Pedido (30/07/2026): "tem uma funcao no word que quando vc vai redimensionando, da mesma
 * forma que ele trava no meio para alinhar, teria que ao chegar no mesmo alinhamento da
 * foto do lado dar uma travada".
 *
 * Ja existia ima de CENTRALIZACAO no arrasto. Este e o do resize, e alinha com as fotos
 * VIZINHAS da mesma pagina (bordas e mesmo tamanho).
 *
 * A sutileza que exige teste: so a LARGURA e livre (a altura decorre da proporcao da
 * imagem, com height:auto), e a borda que se move depende da alca arrastada. Todo encaixe
 * e portanto convertido para uma largura-alvo, e o sinal dessa conta inverte conforme a
 * ancora. Um sinal trocado nao quebra nada visivelmente — a foto so "trava" no lugar
 * errado, o tipo de bug que passa batido numa conferida rapida.
 *
 * O teste afirma o que importa: DEPOIS do encaixe, a borda que se movia esta exatamente
 * sobre a borda da vizinha.
 *
 * Executar: node tests/imaResizeFoto.test.js
 */
const assert = require('assert');

const SNAP_TOLERANCIA_MM = 2.5;

let ok = 0, total = 0;
const t = (nome, fn) => {
  total++;
  try { fn(); ok++; console.log('  OK   ' + nome); }
  catch (e) { console.error('  FALHA ' + nome + ': ' + e.message); }
};

// Copia fiel do calculo em PropostaPreviewEditavel.iniciarResize -> aoMover.
function encaixar({ dir, left0, top0, w0, h0, proporcao, vizinhas, larguraCrua }) {
  const ancoraDireita = dir.includes('w');
  const ancoraInferior = dir.includes('n');
  let novaLargura = Math.max(10, larguraCrua);
  const direitaFixa = left0 + w0;
  const baseFixa = top0 + h0;
  const candidatos = [];
  vizinhas.forEach((v) => {
    [v.esquerda, v.direita].forEach((x) => {
      const alvo = ancoraDireita ? (direitaFixa - x) : (x - left0);
      if (alvo > 10) candidatos.push({ largura: alvo, tipo: 'v', mm: x });
    });
    [v.topo, v.base].forEach((y) => {
      const alturaAlvo = ancoraInferior ? (baseFixa - y) : (y - top0);
      const alvo = alturaAlvo / proporcao;
      if (alvo > 10) candidatos.push({ largura: alvo, tipo: 'h', mm: y });
    });
    if (v.largura > 10) candidatos.push({ largura: v.largura, tipo: 'igual' });
    const porAltura = v.altura / proporcao;
    if (porAltura > 10) candidatos.push({ largura: porAltura, tipo: 'igual' });
  });
  let melhor = null;
  candidatos.forEach((c) => {
    const dist = Math.abs(c.largura - novaLargura);
    if (dist <= SNAP_TOLERANCIA_MM && (!melhor || dist < melhor.dist)) melhor = { ...c, dist };
  });
  if (melhor) novaLargura = melhor.largura;
  const novaAltura = novaLargura * proporcao;
  return {
    largura: novaLargura,
    altura: novaAltura,
    encaixou: !!melhor,
    tipo: melhor ? melhor.tipo : null,
    // Bordas resultantes, ja considerando qual lado ficou parado.
    esquerda: ancoraDireita ? direitaFixa - novaLargura : left0,
    direita: ancoraDireita ? direitaFixa : left0 + novaLargura,
    topo: ancoraInferior ? baseFixa - novaAltura : top0,
    base: ancoraInferior ? baseFixa : top0 + novaAltura,
  };
}

const quase = (a, b, msg) => assert(Math.abs(a - b) < 0.001, `${msg} (${a} != ${b})`);

// Cenario do print: duas fotos lado a lado. A vizinha (esquerda) ocupa 20..90 mm na
// horizontal e 25..85 na vertical. A que se redimensiona comeca em x=100.
const VIZINHA = { esquerda: 20, direita: 90, topo: 25, base: 85, largura: 70, altura: 60 };
const BASE = { left0: 100, top0: 25, w0: 60, h0: 45, proporcao: 45 / 60, vizinhas: [VIZINHA] };

console.log('\n[bordas] a borda que se move para SOBRE a borda da vizinha');

// Alca leste: esquerda parada, direita se move. Para esse encaixe fazer sentido a vizinha
// tem de estar a DIREITA — com ela a esquerda, alinhar a borda direita exigiria largura
// negativa, e o filtro (alvo > 10) descarta o candidato. E o comportamento certo: a
// primeira versao deste teste usava a vizinha da esquerda e falhou por isso, nao por bug.
const VIZ_DIREITA = { esquerda: 100, direita: 170, topo: 25, base: 85, largura: 70, altura: 60 };
const ESQ = { left0: 20, top0: 25, w0: 60, h0: 45, proporcao: 45 / 60, vizinhas: [VIZ_DIREITA] };
const leste = encaixar({ ...ESQ, dir: 'e', larguraCrua: (VIZ_DIREITA.esquerda - 20) - 1 });
t('alça leste encaixa a borda DIREITA na esquerda da vizinha', () => {
  assert(leste.encaixou, 'nao encaixou');
  quase(leste.direita, VIZ_DIREITA.esquerda, 'borda direita');
});
t('e a borda esquerda (âncora) nao se move', () => quase(leste.esquerda, 20, 'esquerda'));

// Encaixe geometricamente impossivel: vizinha a ESQUERDA, arrastando a alca leste.
// Nenhuma das bordas dela pode receber a borda direita desta foto.
const impossivel = encaixar({ ...BASE, dir: 'e', larguraCrua: 51 });
t('vizinha à esquerda nao gera encaixe para a alça leste (largura seria negativa)',
  () => assert(!impossivel.encaixou, 'encaixou num alvo impossivel'));

// Alca oeste: direita parada, esquerda se move. O sinal da conta inverte aqui — e o caso
// em que um sinal trocado passaria batido.
const oesteBase = { ...BASE, left0: 100, w0: 60 }; // direita fixa = 160
const oeste = encaixar({ ...oesteBase, dir: 'w', larguraCrua: 160 - 90 - 1 });
t('alça oeste encaixa a borda ESQUERDA na direita da vizinha', () => {
  assert(oeste.encaixou, 'nao encaixou');
  quase(oeste.esquerda, VIZINHA.direita, 'borda esquerda');
});
t('e a borda direita (âncora) nao se move', () => quase(oeste.direita, 160, 'direita'));

// Alca sul: topo parado, base se move — encaixe vertical convertido pela proporcao.
const sul = encaixar({ ...BASE, dir: 's', larguraCrua: ((VIZINHA.base - 25) / (45 / 60)) - 1 });
t('alça sul encaixa a BASE na base da vizinha', () => {
  assert(sul.encaixou, 'nao encaixou');
  quase(sul.base, VIZINHA.base, 'base');
});
t('e o topo (âncora) nao se move', () => quase(sul.topo, 25, 'topo'));

// Alca norte: base parada, topo se move.
const norteBase = { ...BASE, top0: 40, h0: 45, left0: 100, w0: 60 }; // base fixa = 85
const norte = encaixar({ ...norteBase, dir: 'n', larguraCrua: ((85 - VIZINHA.topo) / (45 / 60)) - 1 });
t('alça norte encaixa o TOPO no topo da vizinha', () => {
  assert(norte.encaixou, 'nao encaixou');
  quase(norte.topo, VIZINHA.topo, 'topo');
});
t('e a base (âncora) nao se move', () => quase(norte.base, 85, 'base'));

console.log('\n[mesmo tamanho] o caso das duas fotos lado a lado');
const igual = encaixar({ ...BASE, dir: 'e', larguraCrua: VIZINHA.largura - 1 });
t('largura perto da vizinha trava na largura IGUAL',
  () => quase(igual.largura, VIZINHA.largura, 'largura'));

console.log('\n[tolerancia] o ima nao pode roubar o controle');
const longe = encaixar({ ...BASE, dir: 'e', larguraCrua: 40 });
t('fora da tolerância (2,5mm) nao encaixa nada', () => {
  assert(!longe.encaixou, 'encaixou onde nao devia');
  quase(longe.largura, 40, 'largura livre');
});
const naBorda = encaixar({ ...BASE, dir: 'e', larguraCrua: VIZINHA.largura - SNAP_TOLERANCIA_MM - 0.01 });
t('logo depois do limite da tolerância continua livre', () => assert(!naBorda.encaixou));

console.log('\n[disputa] entre varios encaixes possiveis, vence o mais proximo');
// A 1mm da largura igual (70) e a 6mm de qualquer borda: tem de escolher 70.
const disputa = encaixar({ ...BASE, dir: 'e', larguraCrua: 71 });
t('escolhe o candidato mais proximo do ponteiro', () => quase(disputa.largura, 70, 'largura'));

console.log('\n[limites] nada de foto degenerada');
t('nunca resulta em largura abaixo do minimo de 10mm', () => {
  [0, 1, 5, -30].forEach((cru) => {
    const r = encaixar({ ...BASE, dir: 'e', larguraCrua: cru });
    assert(r.largura >= 10, `largura ${r.largura} para entrada ${cru}`);
  });
});
t('candidato que exigiria largura <= 10mm e descartado', () => {
  // Vizinha logo a direita da ancora: a borda dela pediria largura ~2mm.
  const colada = { esquerda: 102, direita: 103, topo: 25, base: 26, largura: 1, altura: 1 };
  const r = encaixar({ ...BASE, dir: 'e', vizinhas: [colada], larguraCrua: 12 });
  assert(!r.encaixou, 'encaixou num candidato degenerado');
  quase(r.largura, 12, 'largura livre');
});

console.log('\n[sem vizinha] uma foto sozinha na pagina');
t('sem vizinhas nao ha encaixe, o resize fica livre', () => {
  const r = encaixar({ ...BASE, dir: 'e', vizinhas: [], larguraCrua: 55 });
  assert(!r.encaixou);
  quase(r.largura, 55, 'largura');
});

console.log('\n[proporcao] a imagem nao distorce');
t('altura sempre = largura x proporcao, mesmo apos encaixe', () => {
  [50, 70, 71, 89].forEach((cru) => {
    const r = encaixar({ ...BASE, dir: 'e', larguraCrua: cru });
    quase(r.altura, r.largura * BASE.proporcao, `proporcao rompida em ${cru}`);
  });
});

// ---------------------------------------------------------------------------
// Ima de ARRASTO (posicionamento)
// ---------------------------------------------------------------------------
// Diferenca essencial em relacao ao resize: aqui os eixos sao INDEPENDENTES. No resize
// largura e altura estao acopladas pela proporcao da imagem, e por isso todos os
// candidatos disputam uma unica largura-alvo; no arrasto a foto pode grudar na horizontal
// de uma vizinha e na vertical de outra ao mesmo tempo.
const A4_LARGURA_MM = 210;
const A4_ALTURA_MM = 297;

function arrastar({ leftCru, topCru, larguraMm, alturaMm, vizinhas }) {
  const candX = [{ left: A4_LARGURA_MM / 2 - larguraMm / 2, mm: A4_LARGURA_MM / 2 }];
  const candY = [{ top: A4_ALTURA_MM / 2 - alturaMm / 2, mm: A4_ALTURA_MM / 2 }];
  vizinhas.forEach((v) => {
    const cx = (v.esquerda + v.direita) / 2;
    candX.push({ left: v.esquerda, mm: v.esquerda });
    candX.push({ left: v.direita, mm: v.direita });
    candX.push({ left: v.esquerda - larguraMm, mm: v.esquerda });
    candX.push({ left: v.direita - larguraMm, mm: v.direita });
    candX.push({ left: cx - larguraMm / 2, mm: cx });
    const cy = (v.topo + v.base) / 2;
    candY.push({ top: v.topo, mm: v.topo });
    candY.push({ top: v.base, mm: v.base });
    candY.push({ top: v.topo - alturaMm, mm: v.topo });
    candY.push({ top: v.base - alturaMm, mm: v.base });
    candY.push({ top: cy - alturaMm / 2, mm: cy });
  });
  let mx = null;
  candX.forEach((c) => {
    const d = Math.abs(c.left - leftCru);
    if (d <= SNAP_TOLERANCIA_MM && (!mx || d < mx.d)) mx = { ...c, d };
  });
  let my = null;
  candY.forEach((c) => {
    const d = Math.abs(c.top - topCru);
    if (d <= SNAP_TOLERANCIA_MM && (!my || d < my.d)) my = { ...c, d };
  });
  const left = mx ? mx.left : leftCru;
  const top = my ? my.top : topCru;
  return {
    left, top, direita: left + larguraMm, base: top + alturaMm,
    encaixouX: !!mx, encaixouY: !!my,
  };
}

console.log('\n[arrasto] alinhar com a foto vizinha');
const VIZ = { esquerda: 20, direita: 90, topo: 100, base: 160, largura: 70, altura: 60 };
const MOVEL = { larguraMm: 50, alturaMm: 40, vizinhas: [VIZ] };

const topoIgual = arrastar({ ...MOVEL, leftCru: 120, topCru: VIZ.topo + 1 });
t('o TOPO gruda no topo da vizinha', () => {
  assert(topoIgual.encaixouY, 'nao encaixou na vertical');
  quase(topoIgual.top, VIZ.topo, 'topo');
});

const baseIgual = arrastar({ ...MOVEL, leftCru: 120, topCru: VIZ.base - 40 - 1 });
t('a BASE gruda na base da vizinha (fotos de alturas diferentes)',
  () => quase(baseIgual.base, VIZ.base, 'base'));

const encostando = arrastar({ ...MOVEL, leftCru: VIZ.direita + 1, topCru: 200 });
t('a borda ESQUERDA gruda na direita da vizinha (fotos encostadas)',
  () => quase(encostando.left, VIZ.direita, 'esquerda'));

const aDireita = arrastar({ ...MOVEL, leftCru: VIZ.esquerda - 50 - 1, topCru: 200 });
t('a borda DIREITA gruda na esquerda da vizinha',
  () => quase(aDireita.direita, VIZ.esquerda, 'direita'));

const centrado = arrastar({ ...MOVEL, leftCru: 55 - 25 + 1, topCru: 200 });
t('os CENTROS alinham na mesma vertical', () => {
  const centroViz = (VIZ.esquerda + VIZ.direita) / 2;
  quase(centrado.left + 50 / 2, centroViz, 'centro horizontal');
});

console.log('\n[arrasto] os dois eixos sao independentes');
const doisEixos = arrastar({ ...MOVEL, leftCru: VIZ.direita + 1, topCru: VIZ.topo - 1 });
t('gruda na horizontal E na vertical no mesmo movimento', () => {
  assert(doisEixos.encaixouX && doisEixos.encaixouY, 'faltou um dos eixos');
  quase(doisEixos.left, VIZ.direita, 'esquerda');
  quase(doisEixos.top, VIZ.topo, 'topo');
});
const soUmEixo = arrastar({ ...MOVEL, leftCru: VIZ.direita + 1, topCru: 250 });
t('um eixo pode encaixar sem o outro', () => {
  assert(soUmEixo.encaixouX, 'horizontal devia encaixar');
  assert(!soUmEixo.encaixouY, 'vertical nao devia encaixar');
  quase(soUmEixo.top, 250, 'topo livre');
});

console.log('\n[arrasto] o centro da pagina continua valendo');
const centroPag = arrastar({ ...MOVEL, leftCru: A4_LARGURA_MM / 2 - 25 + 1, topCru: 250 });
t('centro da folha segue imantando como antes',
  () => quase(centroPag.left + 25, A4_LARGURA_MM / 2, 'centro da pagina'));

console.log('\n[arrasto] o ima nao rouba o controle');
const livre = arrastar({ ...MOVEL, leftCru: 130, topCru: 250 });
t('longe de qualquer linha, a posicao e respeitada', () => {
  assert(!livre.encaixouX && !livre.encaixouY);
  quase(livre.left, 130, 'left');
  quase(livre.top, 250, 'top');
});
t('sem vizinhas, so o centro da pagina imanta', () => {
  const r = arrastar({ larguraMm: 50, alturaMm: 40, vizinhas: [], leftCru: 130, topCru: 250 });
  assert(!r.encaixouX && !r.encaixouY, 'encaixou sem candidato');
});

console.log(`\n${ok}/${total} checagens`);
console.log(ok === total ? '0 failed' : `${total - ok} failed`);
process.exit(ok === total ? 0 : 1);
