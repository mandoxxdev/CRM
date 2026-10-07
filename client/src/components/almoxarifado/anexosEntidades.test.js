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

// Etapa 43 (T4): `nao_conformidade` entrou no mapa do SERVIDOR nesta task, e a tela que a consome
// (`NaoConformidadesAlmoxarifado.js`) e a T5, que roda EM PARALELO — o arquivo pode ainda nao
// existir quando esta suite roda. Sem esta lista, uma task de SERVIDOR deixaria a suite do CLIENT
// vermelha, que e exatamente o buraco que `permissaoErro.test.js` ja custou cinco vezes a esta
// base (a T2 desta etapa pagou a quinta).
//
// A guarda NAO afrouxou e se desarma sozinha: assim que o arquivo existir, o par passa a ser
// cobrado como os outros seis (a tela TEM de trazer a chave), e o cenario abaixo AFIRMA a ausencia
// do arquivo enquanto ele nao existir — uma entidade nao pode ficar nesta lista com a tela pronta.
const TELAS_PENDENTES = {
  'NaoConformidadesAlmoxarifado.js': 'nao_conformidade',
};

test('guarda da guarda: o mapa do servidor foi mesmo importado', () => {
  // Sem isto, um import quebrado devolveria `undefined` e todo o resto passaria provando nada —
  // e essa e a forma exata de teste vazio que esta base ja pagou quatro vezes.
  // O numero e LITERAL de proposito (e nao `TELAS.length + TELAS_PENDENTES.length`): derivado, ele
  // acompanharia o mapa do servidor e a entidade acrescentada la sem tela nenhuma passaria batido.
  expect(Object.keys(ENTIDADES_ANEXO || {}).length).toBe(7);
});

// O ALCANCE desta varredura, dito por extenso porque ela é fácil de superestimar (achado MENOR
// da revisão da branch): ela é TEXTUAL — lê o fonte e casa `entidade="..."`. Um plug
// COMENTADO, ou dentro de um ramo que nunca renderiza, continua casando. Então o que ela prova é
// só isto: as chaves escritas nas telas são chaves que o servidor aceita, e as seis do mapa estão
// cobertas. Quem prova que o bloco REALMENTE monta, no registro certo, são os testes de montagem
// por tela — os que afirmam os `params` do `GET /almoxarifado/anexos`
// (`MateriaisAlmoxarifado.test.js`, `RequisicoesList.test.js`,
// `RecebimentosAlmoxarifado.test.js`, `DevolucoesAlmoxarifado.test.js`,
// `RemessasTerceirosAlmoxarifado.test.js` e `HistoricoInspecoes.test.js` — uma por entidade do
// mapa). Esta varredura é a guarda da NOMENCLATURA; aqueles
// são a guarda do comportamento.
test('as telas usam chaves que o servidor aceita, e cobrem o mapa inteiro', () => {
  const dir = __dirname;
  const usadas = new Set();
  // A tela pendente entra na varredura NORMAL assim que existir; enquanto nao existe, a entidade
  // conta como coberta e o teste afirma a ausencia do arquivo (senao a lista viraria escape).
  const telas = { ...TELAS };
  for (const [arquivo, esperada] of Object.entries(TELAS_PENDENTES)) {
    if (fs.existsSync(path.join(dir, arquivo))) telas[arquivo] = esperada;
    else usadas.add(esperada);
  }
  for (const [arquivo, esperada] of Object.entries(telas)) {
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
