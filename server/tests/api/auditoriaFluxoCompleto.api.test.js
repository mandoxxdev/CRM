/**
 * Etapa 22, Task 4 — INTEGRACAO: a trilha de auditoria fecha ponta a ponta.
 *
 * As Tasks 1 e 2 sao verdes por UNIDADE (`auditLabels.api.test.js`, `auditoriaFiltros.api.test.js`)
 * e isso nao prova que as partes compoem. Este arquivo nao monta arranjo com `INSERT` na tabela de
 * auditoria: ele ESCREVE por rotas REAIS de producao — a foto do material (Etapa 20), o PUT de
 * alertas de estoque (Etapa 19) e a movimentacao v2 — e depois LE pela C1, exatamente como a tela
 * da Task 3 vai ler. O que ele guarda:
 *
 * ── Step 1 — a trilha fecha ponta a ponta ────────────────────────────────────────────────────
 * Trocar a foto e ler de volta filtrando por `usuario_id` + `data_inicio`/`data_fim` do dia.
 * A ASSERCAO DE PESO E O CONJUNTO INTEIRO DE `alteracoes`, nao so o campo `foto`: a rota grava
 * `dados_novos: { foto, codigo, nome }` contra `dados_anteriores: { foto }`, entao `codigo` e
 * `nome` — que NAO mudaram — saem como `null -> valor`. Conferir so o `foto` deixaria passar os
 * outros dois renderizados como alteracao que nao houve. A Task 1 decidiu que campo de CONTEXTO
 * APARECE com `de: null` (C3, detalhe 2) porque e o mesmo "sem filtro de igualdade" que mantem a
 * troca de senha visivel; este teste CONGELA essa consequencia no contrato em vez de deixa-la
 * virar surpresa da Task 3.
 *
 * O DIA do filtro sai do `created_at` DA PROPRIA LINHA, convertido para America/Sao_Paulo, nunca
 * do relogio de parede do processo. Dois motivos: (a) `created_at` e UTC (`CURRENT_TIMESTAMP`) e
 * o dia UTC de um ato das 21:30 e o dia SEGUINTE — usar o dia UTC deixaria o cenario verde de
 * manha e vermelho entre 21h e meia-noite, que e o achado A4 da revisao; (b) derivar do relogio
 * abriria uma corrida de meia-noite entre a escrita e a leitura. Nao e tautologico: se a rota
 * NAO convertesse a janela para UTC, um ato gravado as 00:30 UTC (21:30 SP do dia anterior) nao
 * seria encontrado pelo filtro do dia SP — que e exatamente a RN-04.
 *
 * ── Step 2 — RN-08, o segredo nao desmascara ─────────────────────────────────────────────────
 * O segredo entra por PUT real e o teste exige `'(alterado)'` DENTRO de `alteracoes`, nao so no
 * JSON cru da coluna. Este ponto e o coracao do achado A1: a versao anterior do plano usava
 * `configDiff.calcularDiff` como LEITOR, e ele APAGA a mudanca do segredo — os dois lados valem
 * `'(alterado)'` e o `if (String(bruto) === String(novo)) continue` derruba a chave. Ha um
 * cenario-TESTEMUNHA que roda `calcularDiff` sobre a mesma linha e prova que a chave sumiria:
 * sem ele, um futuro "vamos unificar as duas reguas" reabriria o buraco com todos os testes
 * verdes. Mais a assercao NEGATIVA sobre o corpo INTEIRO serializado da resposta.
 *
 * ── Step 3 — o vocabulario REAL ──────────────────────────────────────────────────────────────
 * `SELECT DISTINCT acao` DEPOIS dos atos escritos aqui, exigindo rotulo para todo verbo gravado.
 * E a terceira perna da cobertura da Task 1 (Step 2) e a unica que ve os verbos DINAMICOS em uso
 * real: `stockService.js:1366` audita `acao: tipo`, e nenhuma varredura de fonte enxerga isso.
 * Por isso este arquivo escreve movimentacoes de verdade. E por isso o cenario COMECA exigindo
 * `> 1` verbo distinto: com zero ou um, ele nao estaria provando nada — o modo de falha classico
 * desta base (teste vazio que passa de primeira).
 *
 * ── Divergencia declarada do plano ───────────────────────────────────────────────────────────
 * A Global Constraint 4 ("vermelho por assercao, stub permissivo primeiro") nao se aplica aqui:
 * a Task 4 nao cria codigo de producao nenhum, so testa o que as Tasks 1 e 2 ja entregaram. O
 * papel dela e cumprido pelo CONTROLE POSITIVO com alvo (Step 4 do plano), registrado no commit.
 */
const assert = require('assert');
const request = require('supertest');
const { createTestApp } = require('../helpers/testApp');
const { dbAll, dbGet, dbRun } = require('../../services/almoxarifado/db');
const auditLabels = require('../../services/almoxarifado/auditLabels');
const configDiff = require('../../services/almoxarifado/configDiff');

let passed = 0; let failed = 0;
function test(name, fn) {
  return fn().then(() => { passed++; console.log(`  ✓ ${name}`); })
    .catch((e) => { failed++; console.error(`  ✗ ${name}: ${e.message}`); });
}

// PNG 1x1 real — o `fileFilter` do `uploadAlmox` so aceita image/*.
const PNG_1x1 = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64');

// `is_superadmin` (nao so `role: 'admin'`): o PUT de alertas passa por `denyUnlessAlmoxAdmin` ->
// `canConfigureAlmox`, que NAO aceita `role: 'admin'` sozinho (systemPermissions.js:76-83). O
// mesmo usuario satisfaz `requirePermission('configurar'|'editar_material'|'movimentar')` via
// `getPerfilFromUser` -> ADMINISTRADOR.
const AUDITOR = { id: 7, nome: 'Admin Auditoria', role: 'admin', is_superadmin: 1, email: 'auditoria@test.com' };
const OUTRO = { id: 8, nome: 'Outro Almoxarife', role: 'admin', is_superadmin: 1, email: 'outro@test.com' };

const SEGREDO_SMTP = 'S3nh4-SMTP-que-NAO-pode-vazar';
const SEGREDO_WPP = 'tok3n-WhatsApp-que-NAO-pode-vazar';

// Dia CIVIL de Sao Paulo de um `created_at` UTC ('AAAA-MM-DD HH:MM:SS'). 'en-CA' e o locale que
// imprime AAAA-MM-DD, que e o formato que a C1 exige em `data_inicio`/`data_fim`.
const FMT_DIA_SP = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit',
});
const instanteDe = (createdAt) => new Date(`${String(createdAt).replace(' ', 'T')}Z`);
const diaSpDe = (createdAt) => FMT_DIA_SP.format(instanteDe(createdAt));
const diaSpAnteriorDe = (createdAt) => FMT_DIA_SP.format(new Date(instanteDe(createdAt).getTime() - 24 * 3600 * 1000));

let seq = 0;

(async () => {
  const { app, db, close, setUser } = await createTestApp({ user: { ...AUDITOR } });

  const criarMaterial = async () => {
    seq += 1;
    const codigo = `AUD-MAT-${seq}`;
    const nome = `Material Auditado ${seq}`;
    const r = await dbRun(db,
      `INSERT INTO materiais_almoxarifado (codigo, nome, quantidade_atual, unidade, ativo)
       VALUES (?,?,0,'UN',1)`, [codigo, nome]);
    return { id: r.lastID, codigo, nome };
  };

  const enviarFoto = (id, nomeArquivo) => request(app)
    .post(`/api/almoxarifado/materiais/${id}/foto`)
    .attach('foto', PNG_1x1, nomeArquivo);

  // A LEITURA e sempre pela rota C1 — nunca por SELECT direto na tabela. E a rota que a tela
  // consome, e sao os campos DERIVADOS dela (`alteracoes`, `acao_rotulo`) que esta task guarda.
  const lerTrilha = (query) => request(app).get('/api/almoxarifado/auditoria').query(query);

  const bodyAlertas = (over = {}) => ({
    emails: ['alertas@gmp.com'],
    whatsappNumeros: [],
    notificarEmail: true,
    notificarWhatsapp: false,
    intervaloVerificacaoHoras: 4,
    debounceSegundos: 60,
    smtpHost: 'smtp.gmp.com',
    smtpPort: 587,
    smtpUser: 'alertas@gmp.com',
    smtpFrom: 'alertas@gmp.com',
    smtpSecure: false,
    whatsappWebhookUrl: '',
    appUrl: 'https://systemgmp.online',
    requisicoesEmails: [],
    comprasEmails: [],
    requisicoesNotificarEmail: true,
    requisicoesLembreteAtivo: true,
    requisicoesLembreteIntervaloHoras: 24,
    ...over,
  });

  // ═══════════════ Step 1 — a trilha fecha ponta a ponta ═══════════════

  // Guardado num escopo de arquivo para o cenario seguinte reusar o mesmo ato sem reescrever.
  let atoFoto = null;

  await test('[Step 1] trocar a foto por rota real aparece na C1 filtrada por usuario + dia', async () => {
    const mat = await criarMaterial();

    const primeira = await enviarFoto(mat.id, 'aud-antiga.png');
    assert.strictEqual(primeira.status, 200, `1a foto: ${JSON.stringify(primeira.body)}`);
    const segunda = await enviarFoto(mat.id, 'aud-nova.png');
    assert.strictEqual(segunda.status, 200, `2a foto: ${JSON.stringify(segunda.body)}`);
    assert.notStrictEqual(segunda.body.foto, primeira.body.foto,
      'o multer reusou o nome do arquivo — o cenario da TROCA nao existiria');

    // O dia do filtro vem do `created_at` da linha, em Sao Paulo (ver o cabecalho).
    const linha = await dbGet(db,
      `SELECT created_at FROM auditoria_log_almoxarifado
        WHERE entidade = 'material' AND entidade_id = ? ORDER BY id DESC LIMIT 1`, [mat.id]);
    assert.ok(linha, 'a rota de foto nao gravou linha de auditoria — nao ha trilha para ler');
    const dia = diaSpDe(linha.created_at);

    const res = await lerTrilha({
      usuario_id: AUDITOR.id, entidade: 'material', entidade_id: mat.id,
      data_inicio: dia, data_fim: dia,
    });
    assert.strictEqual(res.status, 200, `C1 respondeu ${res.status}: ${JSON.stringify(res.body)}`);
    assert.deepStrictEqual(Object.keys(res.body).sort(),
      ['itens', 'limite', 'offset', 'total', 'truncado'],
      `a FORMA da resposta da C1 mudou: ${JSON.stringify(Object.keys(res.body))}`);
    assert.strictEqual(res.body.total, 2,
      `esperava as 2 trocas de foto do material no dia ${dia}, veio ${res.body.total}`);

    const item = res.body.itens[0]; // ORDER BY created_at DESC, id DESC -> a troca e a primeira
    atoFoto = { item, mat, dia, arquivoAntigo: primeira.body.foto, arquivoNovo: segunda.body.foto };

    assert.strictEqual(item.acao, 'ATUALIZACAO', `verbo cru errado: ${item.acao}`);
    assert.strictEqual(item.usuario_id, AUDITOR.id, 'a linha nao carrega quem fez o ato');
    assert.strictEqual(item.acao_rotulo, 'Edição', `acao_rotulo errado: ${item.acao_rotulo}`);
    assert.strictEqual(item.entidade_rotulo, 'Material', `entidade_rotulo errado: ${item.entidade_rotulo}`);
  });

  await test('[Step 1] o CONJUNTO INTEIRO de `alteracoes` — `codigo` e `nome` sao contexto, nao mudanca', async () => {
    assert.ok(atoFoto, 'o cenario anterior nao produziu o ato — este aqui nao tem o que conferir');
    const { item, mat, arquivoAntigo, arquivoNovo } = atoFoto;

    // Ordem: uniao "chaves de `anteriores` primeiro, depois as novas" (auditLabels.alteracoesDaLinha).
    // `dados_anteriores` da rota e `{ foto }`; `dados_novos` e `{ foto, codigo, nome }`.
    // Conferir SO o `foto` deixaria `codigo` e `nome` passarem como alteracao que nao houve — e
    // por isso a assercao e o array INTEIRO, com `deepStrictEqual`.
    assert.deepStrictEqual(item.alteracoes, [
      { campo: 'foto', de: arquivoAntigo, para: arquivoNovo },
      { campo: 'codigo', de: null, para: mat.codigo },
      { campo: 'nome', de: null, para: mat.nome },
    ], `conjunto de alteracoes fora do contrato: ${JSON.stringify(item.alteracoes)}`);

    // C1 (e nota 5 da Task 2): as 10 colunas saem CRUAS. `dados_*` continuam string JSON — a tela
    // NAO deve parsea-los para montar o de/para, `alteracoes` ja vem pronto.
    assert.strictEqual(typeof item.dados_novos, 'string',
      `dados_novos deixou de ser string JSON crua: ${typeof item.dados_novos}`);
    assert.strictEqual(typeof item.dados_anteriores, 'string',
      `dados_anteriores deixou de ser string JSON crua: ${typeof item.dados_anteriores}`);
  });

  await test('[Step 1] o filtro de `usuario_id` exclui o ato do OUTRO usuario (e o ato existe)', async () => {
    const mat = await criarMaterial();
    setUser({ ...OUTRO });
    let res;
    try {
      res = await enviarFoto(mat.id, 'aud-outro.png');
    } finally {
      // Sempre restaurado: vazar o usuario envenenaria em silencio todos os cenarios seguintes.
      setUser({ ...AUDITOR });
    }
    assert.strictEqual(res.status, 200, `foto do outro usuario: ${JSON.stringify(res.body)}`);

    const linha = await dbGet(db,
      `SELECT created_at, usuario_id FROM auditoria_log_almoxarifado
        WHERE entidade = 'material' AND entidade_id = ? ORDER BY id DESC LIMIT 1`, [mat.id]);
    // CONTROLE do proprio arranjo: sem isto, "o outro nao aparece" passaria porque o outro nunca
    // escreveu — o teste vazio classico desta base.
    assert.ok(linha, 'o ato do OUTRO usuario nem foi gravado — o cenario nao exercitaria o filtro');
    assert.strictEqual(linha.usuario_id, OUTRO.id, 'o ato foi gravado com o usuario errado');
    const dia = diaSpDe(linha.created_at);

    const meus = await lerTrilha({ usuario_id: AUDITOR.id, entidade_id: mat.id, entidade: 'material', data_inicio: dia, data_fim: dia });
    assert.strictEqual(meus.status, 200, JSON.stringify(meus.body));
    assert.strictEqual(meus.body.total, 0,
      `o filtro por usuario trouxe ato de outra pessoa: ${JSON.stringify(meus.body.itens.map((i) => i.usuario_id))}`);

    const dele = await lerTrilha({ usuario_id: OUTRO.id, entidade_id: mat.id, entidade: 'material', data_inicio: dia, data_fim: dia });
    assert.strictEqual(dele.body.total, 1,
      `o ato do outro usuario sumiu do proprio filtro dele: ${JSON.stringify(dele.body)}`);
  });

  await test('[Step 1/RN-04] o mesmo ato NAO cai no filtro do dia ANTERIOR', async () => {
    assert.ok(atoFoto, 'sem o ato do Step 1 este cenario nao tem alvo');
    const { mat, item } = atoFoto;
    const ontem = diaSpAnteriorDe(item.created_at);
    const res = await lerTrilha({
      usuario_id: AUDITOR.id, entidade: 'material', entidade_id: mat.id,
      data_inicio: ontem, data_fim: ontem,
    });
    assert.strictEqual(res.status, 200, JSON.stringify(res.body));
    assert.strictEqual(res.body.total, 0,
      `a janela vazou para o dia anterior (${ontem}): ${JSON.stringify(res.body.itens.map((i) => i.created_at))}`);
  });

  // ═══════════════ Step 2 — RN-08: o segredo nao desmascara ═══════════════

  let atoSegredo = null;

  await test('[Step 2/RN-08] o segredo gravado por PUT real sai como "(alterado)" DENTRO de `alteracoes`', async () => {
    const put = await request(app).put('/api/almoxarifado/configuracoes/alertas-estoque')
      .send(bodyAlertas({ smtpPass: SEGREDO_SMTP, whatsappApiKey: SEGREDO_WPP }));
    assert.strictEqual(put.status, 200, `PUT de alertas: ${JSON.stringify(put.body)}`);

    // CONTROLE do arranjo: a mascara so significa alguma coisa se a rota TIVER gravado o segredo.
    // Sem isto, a mascara estaria "protegendo" um no-op e o cenario provaria nada.
    const col = await dbGet(db, "SELECT valor FROM configuracoes_almoxarifado WHERE chave = 'alertas_smtp_pass'");
    assert.strictEqual(col.valor, SEGREDO_SMTP, 'a rota nem gravou o segredo — o cenario nao exercitou nada');

    const res = await lerTrilha({ entidade: 'configuracao', acao: 'EDICAO', limite: 1000 });
    assert.strictEqual(res.status, 200, JSON.stringify(res.body));
    assert.ok(res.body.itens.length >= 1, 'nenhuma linha de configuracao na trilha');
    const item = res.body.itens[0];
    atoSegredo = { item, corpo: res.body };

    const senha = item.alteracoes.find((a) => a.campo === 'alertas_smtp_pass');
    assert.ok(senha,
      `a troca de senha SUMIU de \`alteracoes\` — e o defeito 1 da RN-07: ${JSON.stringify(item.alteracoes.map((a) => a.campo))}`);
    // Os DOIS lados mascarados: `configDiff` mascara antes de devolver, e a regua de LEITURA nao
    // remascara nada (C3). Quem le o log sabe QUE a senha mudou e QUEM mudou, nunca o valor.
    assert.strictEqual(senha.de, '(alterado)', `lado "de" da senha: ${JSON.stringify(senha.de)}`);
    assert.strictEqual(senha.para, '(alterado)', `lado "para" da senha: ${JSON.stringify(senha.para)}`);

    const token = item.alteracoes.find((a) => a.campo === 'alertas_whatsapp_api_key');
    assert.ok(token, 'a troca do token do WhatsApp sumiu de `alteracoes`');
    assert.strictEqual(token.para, '(alterado)', `lado "para" do token: ${JSON.stringify(token.para)}`);
  });

  await test('[Step 2/A1] TESTEMUNHA: `configDiff.calcularDiff` como leitor APAGARIA a troca de senha', async () => {
    assert.ok(atoSegredo, 'sem a linha do segredo nao ha o que testemunhar');
    const { item } = atoSegredo;
    // Este cenario nao guarda producao: ele guarda a DECISAO. A versao anterior do plano usava
    // `calcularDiff` como regua de leitura; ela pula chave de valor igual, e nesta linha os dois
    // lados valem '(alterado)'. Se um dia alguem "unificar as duas reguas", o cenario acima cai —
    // e este aqui explica por que ele caiu.
    const errado = configDiff.calcularDiff(
      JSON.parse(item.dados_anteriores), JSON.parse(item.dados_novos));
    assert.ok(!Object.prototype.hasOwnProperty.call(errado.novos, 'alertas_smtp_pass'),
      'premissa do achado A1 mudou: `calcularDiff` deixou de apagar a chave — reveja a RN-07');
    assert.ok(item.alteracoes.some((a) => a.campo === 'alertas_smtp_pass'),
      'a regua de LEITURA perdeu a chave que `calcularDiff` perde — o achado A1 voltou');
  });

  await test('[Step 2/RN-08] o valor real do segredo nao aparece em NENHUM lugar do corpo da resposta', async () => {
    // Corpo INTEIRO serializado, sem filtro de entidade e com o limite no teto: a assercao
    // negativa tem de valer para o JSON que a tela recebe, nao so para o campo que o teste olhou.
    const res = await lerTrilha({ limite: 1000 });
    assert.strictEqual(res.status, 200, JSON.stringify(res.body));
    const corpo = JSON.stringify(res.body);
    assert.ok(!corpo.includes(SEGREDO_SMTP), 'a SENHA SMTP vazou no corpo da resposta da trilha');
    assert.ok(!corpo.includes(SEGREDO_WPP), 'o TOKEN do WhatsApp vazou no corpo da resposta da trilha');
    // Controle do proprio cenario: o corpo tem de conter a linha da configuracao, senao a
    // assercao negativa estaria passando sobre uma resposta vazia.
    assert.ok(corpo.includes('alertas_smtp_pass'),
      'a linha da configuracao nem esta no corpo — a assercao negativa nao provaria nada');
  });

  // ═══════════════ Step 3 — o vocabulario REAL, com os verbos DINAMICOS ═══════════════

  await test('[Step 3] movimentacao por rota real grava o verbo DINAMICO (`acao: tipo`)', async () => {
    const mat = await criarMaterial();
    const entrada = await request(app).post('/api/almoxarifado/movimentacoes/v2')
      .send({ material_id: mat.id, tipo: 'ENTRADA_MANUAL', quantidade: 10, justificativa: 'carga inicial da trilha' });
    assert.strictEqual(entrada.status, 201, `ENTRADA_MANUAL: ${JSON.stringify(entrada.body)}`);
    const saida = await request(app).post('/api/almoxarifado/movimentacoes/v2')
      .send({ material_id: mat.id, tipo: 'SAIDA', quantidade: 4, justificativa: 'consumo da trilha' });
    assert.strictEqual(saida.status, 201, `SAIDA: ${JSON.stringify(saida.body)}`);

    // Os dois verbos existem no log SO porque `stockService.js:1366` faz `acao: tipo` — nenhuma
    // varredura de literal em routes/ e services/ os enxerga. Sem esta assercao a terceira perna
    // da cobertura (o cenario seguinte) ficaria vazia sem ninguem perceber.
    const verbos = (await dbAll(db,
      `SELECT DISTINCT acao FROM auditoria_log_almoxarifado WHERE entidade = 'movimentacao'`))
      .map((r) => r.acao);
    assert.ok(verbos.includes('ENTRADA_MANUAL'), `verbo dinamico ausente do log: ${verbos.join(', ')}`);
    assert.ok(verbos.includes('SAIDA'), `verbo dinamico ausente do log: ${verbos.join(', ')}`);
  });

  await test('[Step 3] TODO verbo REALMENTE gravado por este teste tem rotulo em auditLabels', async () => {
    const verbos = (await dbAll(db,
      'SELECT DISTINCT acao FROM auditoria_log_almoxarifado ORDER BY acao')).map((r) => r.acao);

    // ANTES de afirmar qualquer coisa: com zero ou um verbo o cenario nao esta provando nada — e
    // isso e ACHADO, nao detalhe. E o modo de falha que esta base ja viu tres vezes (varredura
    // vazia passando verde).
    assert.ok(verbos.length > 1,
      `o SELECT DISTINCT devolveu ${verbos.length} verbo(s) (${verbos.join(', ')}) — o cenario nao prova nada`);

    const conhecidos = new Set();
    for (const g of auditLabels.GRUPOS_ACAO) for (const v of g.verbos) conhecidos.add(v);
    const semRotulo = verbos.filter((v) => !conhecidos.has(v));
    assert.deepStrictEqual(semRotulo, [],
      `verbo(s) gravado(s) em uso real e SEM rotulo: ${semRotulo.join(', ')}`);

    // E o rotulo tem de chegar pela ROTA, nao so pelo modulo: e `acao_rotulo` que a tela mostra.
    const res = await lerTrilha({ limite: 1000 });
    assert.strictEqual(res.status, 200, JSON.stringify(res.body));
    const semRotuloNaRota = res.body.itens
      .filter((i) => !conhecidos.has(i.acao) || !i.acao_rotulo)
      .map((i) => i.acao);
    assert.deepStrictEqual(semRotuloNaRota, [],
      `a C1 devolveu item sem rotulo de acao: ${semRotuloNaRota.join(', ')}`);
  });

  await close();
  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed ? 1 : 0);
})();
