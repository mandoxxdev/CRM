/**
 * Etapa 144 (RN-144.04/05, D (142)): o preview numa aba velha. O servidor responde `{ ok: true, ignorados: N }` nas duas rotas do preview
 * (variaveis-manuais e itens/descricoes); a tela troca o "Alterações salvas." pelo aviso e o salvar() devolve false (o Emitir revisão
 * não emite em cima do valor perdido — B940).
 *
 * Renderizar o PropostaPreviewEditavel exigiria o iframe `srcDoc` com o script do template rodando (o jsdom não executa — o mesmo
 * motivo do PropostaPreviewEditavel.fotosUrl.test.js). Por isso o desfecho (qual toast, que texto, o que devolve) é uma função pura
 * testada por valor, e a fiação do salvar() é presa pelo FONTE como um bloco contíguo e exato (Fase 5, r3: uma régua de trechos soltos
 * deixava passar um toast.success a mais, um return num ramo morto e a soma anulada), com controles que mostram que ela acusa cada um.
 */
import { avisoValoresIgnorados, somarIgnorados, desfechoDoSalvar } from './avisoValoresIgnorados';

const fs = require('fs');
const path = require('path');

const FONTE = fs.readFileSync(path.join(__dirname, 'PropostaPreviewEditavel.js'), 'utf8');

const L = 'Alguns campos dos itens não foram gravados: os itens desta proposta mudaram depois que o preview abriu (ela foi salva em outra aba ou por outra pessoa). O preview foi recarregado — confira e preencha de novo.';

test('[RN-144.05] o texto literal: nada com 0; com 1 ou mais, o mesmo texto, sem número (Fase 2 I-1)', () => {
  expect(avisoValoresIgnorados(0)).toBeNull();
  expect(avisoValoresIgnorados(undefined)).toBeNull();
  expect(avisoValoresIgnorados(-2)).toBeNull();
  expect(avisoValoresIgnorados(1)).toBe(L);
  expect(avisoValoresIgnorados(15)).toBe(L);
});

test('[RN-144.04/05] somarIgnorados: soma as respostas; sem o campo (servidor antigo), sem resposta ou lixo conta 0', () => {
  expect(somarIgnorados({ data: { ok: true, ignorados: 2 } }, { data: { ok: true, ignorados: 1 } })).toBe(3);
  expect(somarIgnorados({ data: { ok: true } }, undefined, null, { data: { ignorados: 'x' } }, { data: { ignorados: -4 } })).toBe(0);
  expect(somarIgnorados()).toBe(0);
  expect(somarIgnorados({ data: { ignorados: '2' } })).toBe(2);
});

test('[RN-144.05, B940] desfechoDoSalvar: aviso e ok false com campo ignorado em qualquer das duas; sucesso e ok true sem nenhum', () => {
  const sucesso = { tipo: 'success', mensagem: 'Alterações salvas.', ok: true };
  const aviso = { tipo: 'warning', mensagem: L, ok: false };
  expect(desfechoDoSalvar(null, null)).toEqual(sucesso);
  expect(desfechoDoSalvar({ data: { ok: true } }, { data: { ok: true } })).toEqual(sucesso);
  expect(desfechoDoSalvar({ data: { ok: true, ignorados: 0 } }, { data: { ok: true, ignorados: 0 } })).toEqual(sucesso);
  expect(desfechoDoSalvar({ data: { ok: true, ignorados: 2 } }, null)).toEqual(aviso);
  expect(desfechoDoSalvar(null, { data: { ok: true, ignorados: 1 } })).toEqual(aviso);
  expect(desfechoDoSalvar({ data: { ignorados: 1 } }, { data: { ignorados: 3 } })).toEqual(aviso);
});

/** O corpo da função salvar() do preview. */
function corpoDoSalvar(src) {
  const ini = src.indexOf('async function salvar()');
  if (ini < 0) return '';
  const fim = src.indexOf('async function emitirRevisao()', ini);
  return src.slice(ini, fim < 0 ? undefined : fim);
}
/** O try do salvar(): do `try {` ao `} catch`. */
function tryDoSalvar(corpo) {
  const ini = corpo.indexOf('try {');
  const fim = corpo.indexOf('} catch', ini);
  return ini < 0 || fim < 0 ? '' : corpo.slice(ini, fim);
}
const conta = (s, sub) => s.split(sub).length - 1;
/** A régua: as duas respostas guardadas uma vez cada, e o fim do try é EXATAMENTE o desfecho — um toast só, um return só. */
function fiacaoDoAviso(corpo) {
  const t = tryDoSalvar(corpo);
  return {
    vm: conta(t, 'respostaVariaveis = await api.put(`/propostas/${id}/variaveis-manuais`') === 1,
    desc: conta(t, 'respostaDescricoes = await api.put(`/propostas/${id}/itens/descricoes`') === 1,
    // nenhuma outra atribuição às duas (além do `let ... = null` do começo e da do api.put)
    soAtribuidasUmaVez: conta(t, 'respostaVariaveis =') === 2 && conta(t, 'respostaDescricoes =') === 2
      && /let respostaVariaveis = null;\s*let respostaDescricoes = null;/.test(t),
    // o fim do try, contíguo: o desfecho das duas respostas, o toast dele, o recarregar e o retorno dele
    desfecho: /setMudancasPendentes\(false\);\s*const desfecho = desfechoDoSalvar\(respostaVariaveis, respostaDescricoes\);\s*toast\[desfecho\.tipo\]\(desfecho\.mensagem\);\s*carregarPreview\(\);\s*return desfecho\.ok;\s*$/.test(t),
    umToast: (t.match(/\btoast[.[]/g) || []).length === 1,
    umReturn: (t.match(/\breturn\b/g) || []).length === 1,
  };
}
const TUDO_CERTO = { vm: true, desc: true, soAtribuidasUmaVez: true, desfecho: true, umToast: true, umReturn: true };

test('[RN-144.05] o salvar() do preview: as duas respostas, o desfecho delas no fim do try, um toast e um return só', () => {
  const corpo = corpoDoSalvar(FONTE);
  expect(corpo.length).toBeGreaterThan(100);
  expect(tryDoSalvar(corpo).length).toBeGreaterThan(100);
  expect(fiacaoDoAviso(corpo)).toEqual(TUDO_CERTO);
  expect(FONTE).toMatch(/import \{ desfechoDoSalvar \} from '\.\/avisoValoresIgnorados';/);
  // o Emitir revisão continua parando quando o salvar() devolve false
  expect(FONTE).toMatch(/const salvou = await salvar\(\);\s*if \(!salvou\) return;/);
});

describe('controles: a régua acusa cada fiação errada (o salvar() antigo e as sobreviventes do r3 da Fase 5)', () => {
  const certo = tryDoSalvar(corpoDoSalvar(FONTE));
  const salvarCom = (t) => `async function salvar() {\n    ${t}} catch (e) {}\n  }\n  async function emitirRevisao() {}`;
  const troca = (a, b) => { expect(conta(certo, a)).toBe(1); return salvarCom(certo.replace(a, () => b)); };
  test('o salvar() antigo (sem ler a resposta, sempre "Alterações salvas." e true)', () => {
    const antigo = `async function salvar() {
    try {
        if (variaveisManuais.length > 0) {
          await api.put(\`/propostas/\${id}/variaveis-manuais\`, { valores: variaveisManuais });
        }
        if (descricoes.length > 0) {
          await api.put(\`/propostas/\${id}/itens/descricoes\`, { descricoes });
        }
      setMudancasPendentes(false);
      toast.success('Alterações salvas.');
      carregarPreview();
      return true;
    } catch (e) {}
  }
  async function emitirRevisao() {}`;
    const r = fiacaoDoAviso(corpoDoSalvar(antigo));
    expect([r.vm, r.desc, r.desfecho]).toEqual([false, false, false]);
  });
  test('c1: um toast.success a mais depois do desfecho', () => {
    const r = fiacaoDoAviso(corpoDoSalvar(troca('carregarPreview();', "toast.success('Alterações salvas.');\n      carregarPreview();")));
    expect(r.umToast).toBe(false);
  });
  test('c2/c6: o return do desfecho num ramo morto, e true no lugar', () => {
    const r = fiacaoDoAviso(corpoDoSalvar(troca('return desfecho.ok;', 'if (desfecho === undefined) return desfecho.ok;\n      return true;')));
    expect([r.desfecho, r.umReturn]).toEqual([false, false]);
  });
  test('c3: o desfecho de outra coisa que não as duas respostas', () => {
    const r = fiacaoDoAviso(corpoDoSalvar(troca('desfechoDoSalvar(respostaVariaveis, respostaDescricoes)', 'desfechoDoSalvar(null, null)')));
    expect(r.desfecho).toBe(false);
  });
  test('c4/c5: uma das respostas anulada antes do desfecho', () => {
    const r = fiacaoDoAviso(corpoDoSalvar(troca('setMudancasPendentes(false);', 'respostaVariaveis = null;\n      setMudancasPendentes(false);')));
    expect(r.soAtribuidasUmaVez).toBe(false);
  });
  test('o toast fixo no lugar do desfecho', () => {
    const r = fiacaoDoAviso(corpoDoSalvar(troca('toast[desfecho.tipo](desfecho.mensagem);', "toast.success('Alterações salvas.');")));
    expect(r.desfecho).toBe(false);
  });
});
