/**
 * Etapa 35 (RN-10) — as PREMISSAS da medição do clipe da coluna de ações.
 *
 * O QUE ESTE TESTE NAO PROVA, e precisa estar escrito aqui para a proxima sessao nao o tratar
 * como guarda do layout: ele NAO prova que nenhum botao e cortado. jsdom nao faz layout
 * (`offsetWidth` e sempre 0), e nao havia navegador na sessao que escreveu a Etapa 35. A prova
 * visual e o roteiro de F12 em `docs/almoxarifado-guia-etapas-e-testes.md`.
 *
 * O que ele PROVA: que os cinco numeros em que a medicao se apoiou continuam no CSS. Se alguem
 * trocar o `gap`, o tamanho do botao de icone, o `nowrap` do botao de texto ou o `overflow`, a
 * conta documentada deixa de valer — e este teste cai apontando para a medicao, em vez de a
 * documentacao envelhecer em silencio (foi o que aconteceu com tres referencias de linha que a
 * Etapa 35 teve de corrigir).
 */
const fs = require('fs');
const path = require('path');

const css = fs.readFileSync(path.join(__dirname, 'Almoxarifado.css'), 'utf8');
// (Fase 2) `^` + flag 'm': sem a ancora de inicio de linha, `.btn-almox-secondary` tambem casa
// dentro de `.almox-mapa-page .btn-almox-secondary {` (`:1486`). Hoje a regra do modulo vem antes e
// o `match` acerta por sorte; com a ancora, acerta por construcao.
const bloco = (seletor) => {
  const m = css.match(new RegExp(`^\\${seletor}\\s*\\{([^}]*)\\}`, 'm'));
  return m ? m[1] : null;
};

test('guarda da guarda: o CSS do modulo foi mesmo lido', () => {
  // Sem isto, um caminho errado devolveria string vazia e TODAS as assercoes abaixo passariam
  // provando nada — a forma de teste vazio que esta base ja pagou cinco vezes.
  expect(css.length).toBeGreaterThan(20000);
  expect(bloco('.almox-actions')).not.toBeNull();
});

test('as premissas da medicao do clipe continuam valendo', () => {
  // 1. O conserto da Etapa 35: a coluna de acoes quebra linha em vez de ser cortada.
  expect(bloco('.almox-actions')).toMatch(/flex-wrap:\s*wrap/);
  // 2. O gap que entra na conta da largura minima.
  expect(bloco('.almox-actions')).toMatch(/gap:\s*6px/);
  // 3. Os 32px do botao de icone (Materiais: 10 deles = 320px + 9 gaps).
  expect(bloco('.almox-btn-icon')).toMatch(/width:\s*32px/);
  // 4. O PISO DURO que decidiu a etapa: botao de texto nao encolhe.
  expect(bloco('.btn-almox-secondary')).toMatch(/white-space:\s*nowrap/);
  // 5. O motivo de o corte ser invisivel — e que fica, porque existe pelo `border-radius`.
  expect(bloco('.almox-table-container')).toMatch(/overflow:\s*hidden/);
  // 6. Abaixo de 768px quem salva e a propria tabela; acima dela, ninguem salvava.
  expect(css).toMatch(/@media \(max-width: 768px\)[\s\S]*?\.almox-table\s*\{[^}]*overflow-x:\s*auto/);
});
