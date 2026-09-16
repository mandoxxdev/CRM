const fs = require('fs');
const path = require('path');

// Molde medido: `client/src/utils/permissaoErro.test.js:45-46` importa o modulo do SERVIDOR para
// que a lista deixe de ser escrita a mao. Aqui vale o mesmo: se o mapa mudar, este teste cai.
// eslint-disable-next-line global-require, import/no-unresolved
const { ENTIDADES_ANEXO } = require('../../../../server/services/almoxarifado/anexoService');

const TELAS = {
  'MateriaisAlmoxarifado.js': 'material',
  'RequisicoesList.js': 'requisicao',
  'RecebimentosAlmoxarifado.js': 'recebimento',
  'DevolucoesAlmoxarifado.js': 'devolucao',
  'RemessasTerceirosAlmoxarifado.js': 'item_remessa',
  'HistoricoInspecoes.js': 'inspecao',      // a consumidora da Etapa 32, para fechar as SEIS
};

test('guarda da guarda: o mapa do servidor foi mesmo importado', () => {
  // Sem isto, um import quebrado devolveria `undefined` e todo o resto passaria provando nada —
  // e essa e a forma exata de teste vazio que esta base ja pagou quatro vezes.
  expect(Object.keys(ENTIDADES_ANEXO || {}).length).toBe(6);
});

test('as seis telas usam chaves que o servidor aceita, e cobrem o mapa inteiro', () => {
  const dir = __dirname;
  const usadas = new Set();
  for (const [arquivo, esperada] of Object.entries(TELAS)) {
    const src = fs.readFileSync(path.join(dir, arquivo), 'utf8');
    const achadas = [...src.matchAll(/entidade=["']([a-z_]+)["']/g)].map((m) => m[1]);
    expect(achadas.length).toBeGreaterThan(0);          // metade positiva: o plug existe
    for (const chave of achadas) {
      expect(Object.keys(ENTIDADES_ANEXO)).toContain(chave);   // e valida no servidor
      usadas.add(chave);
    }
    expect(achadas).toContain(esperada);                // e e a chave DAQUELA tela
  }
  // Nenhuma entidade do mapa ficou sem tela — e a Etapa 34 existe justamente para isso.
  expect([...usadas].sort()).toEqual(Object.keys(ENTIDADES_ANEXO).sort());
});
