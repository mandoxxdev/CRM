/**
 * Etapa 144 (RN-144.04/05, D (142)): o preview numa aba velha. O servidor responde `{ ok: true, ignorados: N }` nas duas rotas do preview
 * (variaveis-manuais e itens/descricoes); a tela troca o "Alterações salvas." pelo aviso e o salvar() devolve false (o Emitir revisão
 * não emite em cima do valor perdido — B940).
 *
 * Renderizar o PropostaPreviewEditavel exigiria o iframe `srcDoc` com o script do template rodando (o jsdom não executa — o mesmo
 * motivo do PropostaPreviewEditavel.fotosUrl.test.js); por isso a fiação do salvar() é presa pelo FONTE, com controle que mostra que
 * a régua acusa o código antigo. O texto e a soma são presos pelas funções puras.
 */
import { avisoValoresIgnorados, somarIgnorados } from './avisoValoresIgnorados';

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

/** O corpo da função salvar() do preview. */
function corpoDoSalvar(src) {
  const ini = src.indexOf('async function salvar()');
  if (ini < 0) return '';
  const fim = src.indexOf('async function emitirRevisao()', ini);
  return src.slice(ini, fim < 0 ? undefined : fim);
}
/** A régua: as duas respostas somadas, o aviso no lugar do sucesso e o retorno false quando há aviso. */
function fiacaoDoAviso(corpo) {
  const vm = /(\w+)\s*=\s*await api\.put\(`\/propostas\/\$\{id\}\/variaveis-manuais`/.exec(corpo);
  const desc = /(\w+)\s*=\s*await api\.put\(`\/propostas\/\$\{id\}\/itens\/descricoes`/.exec(corpo);
  const soma = /somarIgnorados\((\w+), (\w+)\)/.exec(corpo);
  return {
    vm: !!vm,
    desc: !!desc,
    // a soma é das DUAS respostas guardadas (não de outra coisa)
    soma: !!(soma && vm && desc && soma[1] === vm[1] && soma[2] === desc[1]),
    aviso: /const aviso = avisoValoresIgnorados\(/.test(corpo) && /if \(aviso\) toast\.warning\(aviso\);\s*else toast\.success\('Alterações salvas\.'\);/.test(corpo),
    retorno: /return !aviso;/.test(corpo),
  };
}

test('[RN-144.05] o salvar() do preview soma as duas respostas, avisa no lugar do sucesso e devolve false com aviso', () => {
  const corpo = corpoDoSalvar(FONTE);
  expect(corpo.length).toBeGreaterThan(100);
  expect(fiacaoDoAviso(corpo)).toEqual({ vm: true, desc: true, soma: true, aviso: true, retorno: true });
  expect(FONTE).toMatch(/import \{ avisoValoresIgnorados, somarIgnorados \} from '\.\/avisoValoresIgnorados';/);
  // o Emitir revisão continua parando quando o salvar() devolve false
  expect(FONTE).toMatch(/const salvou = await salvar\(\);\s*if \(!salvou\) return;/);
});

test('controle: a régua acusa o salvar() antigo (sem ler a resposta, sempre "Alterações salvas." e true)', () => {
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
  expect(fiacaoDoAviso(corpoDoSalvar(antigo))).toEqual({ vm: false, desc: false, soma: false, aviso: false, retorno: false });
});
