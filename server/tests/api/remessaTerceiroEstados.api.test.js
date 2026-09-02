/**
 * Etapa 8b, Task 3 — maquina de estados da remessa, tabelas e a acao de perfil.
 *
 * Molde: requisitionStateMachine.js (objeto TRANSICOES declarativo + validarTransicao devolvendo
 * {ok, erro}) e tests/api/requisicaoEstados.api.test.js, que testa o validador DIRETO e tambem
 * pelas rotas. Aqui so o validador e a fundacao — as rotas chegam na Task 8.
 *
 * O ciclo (decisao 3 do design):
 *   ABERTA          remessa montada, itens escolhidos, NADA saiu do estoque ainda
 *   ENVIADA         o efeito de estoque acontece: em_terceiros sobe, disponivel desce
 *   RETORNO_PARCIAL parte voltou; o restante segue retido
 *   ENCERRADA       fecha (com destino obrigatorio se sobrou saldo — Task 7)
 *   CANCELADA       de ABERTA nao mexe em saldo; de ENVIADA devolve tudo ao disponivel
 *
 * Executar: cd server && node tests/api/remessaTerceiroEstados.api.test.js
 */
const assert = require('assert');
const request = require('supertest');
const { createTestApp } = require('../helpers/testApp');
const { dbRun, dbGet, dbAll } = require('../../services/almoxarifado/db');
const sm = require('../../services/almoxarifado/thirdPartyStateMachine');
const { ACAO_PERFIS, can } = require('../../services/almoxarifado/permissions');

let passed = 0; let failed = 0;
function test(name, fn) {
  return fn().then(() => { passed++; console.log(`  ✓ ${name}`); })
    .catch((e) => { failed++; console.error(`  ✗ ${name}: ${e.message}`); });
}
const ADMIN = { id: 1, nome: 'Admin Teste', role: 'admin', is_superadmin: 1, email: 'admin@test.com' };
const ALMOXARIFE = { id: 2, nome: 'Almoxarife', email: 'almox@test.com', perfil_almoxarifado: 'ALMOXARIFE' };
const PRODUCAO = { id: 3, nome: 'Chao de fabrica', email: 'prod@test.com', perfil_almoxarifado: 'PRODUCAO' };

(async () => {
  const { app, db, close, setUser } = await createTestApp({ user: ADMIN });

  // ── A maquina de estados, testada direto ─────────────────────────────────────────────────────
  await test('[transicoes] o caminho feliz inteiro e permitido', async () => {
    for (const [de, para] of [
      ['ABERTA', 'ENVIADA'],
      ['ENVIADA', 'RETORNO_PARCIAL'],
      ['RETORNO_PARCIAL', 'RETORNO_PARCIAL'],
      ['RETORNO_PARCIAL', 'ENCERRADA'],
      ['ENVIADA', 'ENCERRADA'],
    ]) {
      assert.deepStrictEqual(sm.validarTransicao(de, para), { ok: true }, `${de} -> ${para} devia ser permitida`);
    }
  });

  await test('[transicoes] cancelar e permitido de ABERTA, ENVIADA e RETORNO_PARCIAL', async () => {
    for (const de of ['ABERTA', 'ENVIADA', 'RETORNO_PARCIAL']) {
      assert.deepStrictEqual(sm.validarTransicao(de, 'CANCELADA'), { ok: true }, `${de} -> CANCELADA devia ser permitida`);
    }
  });

  await test('[transicoes] estado final nao vai para lugar nenhum', async () => {
    for (const de of ['ENCERRADA', 'CANCELADA']) {
      for (const para of ['ABERTA', 'ENVIADA', 'RETORNO_PARCIAL', 'ENCERRADA', 'CANCELADA']) {
        const r = sm.validarTransicao(de, para);
        assert.strictEqual(r.ok, false, `${de} -> ${para} passou, e ${de} e estado final`);
      }
    }
  });

  await test('[transicoes] pular o envio e recusado, e a mensagem diz o atual e os permitidos', async () => {
    const r = sm.validarTransicao('ABERTA', 'ENCERRADA');
    assert.strictEqual(r.ok, false, 'encerrou uma remessa que nunca saiu do galpao');
    assert.match(r.erro, /ABERTA/, 'a mensagem nao diz o status atual');
    assert.match(r.erro, /ENVIADA/, 'a mensagem nao diz para onde da para ir');
  });

  await test('[transicoes] retornar antes de enviar e recusado', async () => {
    assert.strictEqual(sm.validarTransicao('ABERTA', 'RETORNO_PARCIAL').ok, false);
  });

  await test('[transicoes] status desconhecido nao vira coringa', async () => {
    // TRANSICOES[undefined] => undefined; sem o `|| []` de requisitionStateMachine isto seria
    // TypeError, e com um `return {ok:true}` por engano viraria porta aberta.
    assert.strictEqual(sm.validarTransicao('INVENTADO', 'ENCERRADA').ok, false);
    assert.strictEqual(sm.validarTransicao('ABERTA', 'INVENTADO').ok, false);
  });

  await test('[transicoes] toda combinacao fora de TRANSICOES e recusada — matriz completa', async () => {
    // As transicoes VALIDAS estao cobertas acima uma a uma. Esta varre o produto cartesiano dos 5
    // status e exige que o validador aceite EXATAMENTE o que TRANSICOES declara: sem isto, uma
    // seta a mais colada por engano no objeto (ex.: ENCERRADA -> ENVIADA) passaria despercebida,
    // porque nenhum teste de caminho feliz olha para o que NAO deveria existir.
    const esperadas = new Set();
    for (const de of Object.keys(sm.TRANSICOES)) {
      for (const para of sm.TRANSICOES[de]) esperadas.add(`${de}->${para}`);
    }
    for (const de of sm.STATUS_REMESSA) {
      for (const para of sm.STATUS_REMESSA) {
        const deviaPassar = esperadas.has(`${de}->${para}`);
        const r = sm.validarTransicao(de, para);
        assert.strictEqual(r.ok, deviaPassar,
          `${de} -> ${para}: validador diz ok=${r.ok}, TRANSICOES diz ${deviaPassar}`);
        if (!deviaPassar) {
          assert.ok(typeof r.erro === 'string' && r.erro.length > 0,
            `${de} -> ${para} recusou sem mensagem`);
        }
      }
    }
  });

  await test('[listas auxiliares] batem com TRANSICOES — nao ha segunda fonte de verdade', async () => {
    // Se as listas divergirem das transicoes, o servico deixa iniciar uma acao que a maquina
    // recusa depois (ou o contrario). Foi o que aconteceu com PODE_SEPARAR na Etapa 4.
    for (const s of sm.PODE_RECEBER_RETORNO) {
      assert.ok(sm.TRANSICOES[s].includes('RETORNO_PARCIAL'), `${s} recebe retorno mas nao transita para RETORNO_PARCIAL`);
    }
    for (const s of sm.PODE_ENCERRAR) {
      assert.ok(sm.TRANSICOES[s].includes('ENCERRADA'), `${s} encerra mas nao transita para ENCERRADA`);
    }
    for (const s of sm.PODE_CANCELAR) {
      assert.ok(sm.TRANSICOES[s].includes('CANCELADA'), `${s} cancela mas nao transita para CANCELADA`);
    }
  });

  await test('[listas auxiliares][CONTROLE POSITIVO] nenhuma lista esta vazia nem inclui estado final', async () => {
    // A amarracao acima passa trivialmente com listas VAZIAS (o for nao roda) — a metade que
    // sozinha aprovaria "nao pode nada". Aqui a outra metade: cada lista tem os estados que o
    // ciclo precisa, e nenhum estado final entra nelas.
    assert.deepStrictEqual(sm.PODE_RECEBER_RETORNO, ['ENVIADA', 'RETORNO_PARCIAL']);
    assert.deepStrictEqual(sm.PODE_ENCERRAR, ['ENVIADA', 'RETORNO_PARCIAL']);
    assert.deepStrictEqual(sm.PODE_CANCELAR, ['ABERTA', 'ENVIADA', 'RETORNO_PARCIAL']);
    for (const lista of [sm.PODE_RECEBER_RETORNO, sm.PODE_ENCERRAR, sm.PODE_CANCELAR]) {
      for (const final of ['ENCERRADA', 'CANCELADA']) {
        assert.ok(!lista.includes(final), `${final} e estado final e nao pode iniciar acao`);
      }
    }
    assert.deepStrictEqual(sm.STATUS_REMESSA,
      ['ABERTA', 'ENVIADA', 'RETORNO_PARCIAL', 'ENCERRADA', 'CANCELADA']);
  });

  // ── As tabelas ───────────────────────────────────────────────────────────────────────────────
  await test('[schema] as tres tabelas existem com as colunas que o ciclo usa', async () => {
    const colunasDe = async (t) => (await dbAll(db, `PRAGMA table_info(${t})`)).map((c) => c.name);

    const remessa = await colunasDe('remessas_terceiro_almoxarifado');
    for (const c of ['id', 'numero', 'fornecedor_id', 'fornecedor_nome', 'tipo_servico', 'os_id',
      'projeto_id', 'proprietario_cliente_id', 'proprietario_cliente_nome', 'prazo_previsto',
      'status', 'encerramento_destino', 'encerramento_justificativa', 'cancelamento_motivo']) {
      assert.ok(remessa.includes(c), `remessas_terceiro_almoxarifado sem a coluna ${c}`);
    }

    const itens = await colunasDe('itens_remessa_terceiro_almoxarifado');
    for (const c of ['id', 'remessa_id', 'material_id', 'quantidade', 'quantidade_retornada',
      'lote_id', 'peso', 'enviado_em']) {
      assert.ok(itens.includes(c), `itens_remessa_terceiro_almoxarifado sem a coluna ${c}`);
    }

    const retornos = await colunasDe('retornos_remessa_item_almoxarifado');
    for (const c of ['id', 'remessa_id', 'item_remessa_id', 'material_id', 'quantidade', 'lote_id',
      'nota_fiscal', 'movimentacao_id']) {
      assert.ok(retornos.includes(c), `retornos_remessa_item_almoxarifado sem a coluna ${c}`);
    }
  });

  await test('[schema] a remessa nasce ABERTA e o numero e unico', async () => {
    // O DEFAULT do status e o que faz a maquina de estados valer para linha criada por INSERT
    // parcial (o servico da Task 5 nao repete a string). E `numero UNIQUE` e o que impede duas
    // remessas com o mesmo documento fiscal — sem isso o retorno nao saberia a qual amarrar.
    const r = await dbRun(db,
      "INSERT INTO remessas_terceiro_almoxarifado (numero) VALUES ('REM-SM-DEF')");
    const row = await dbGet(db, 'SELECT * FROM remessas_terceiro_almoxarifado WHERE id = ?', [r.lastID]);
    assert.strictEqual(row.status, 'ABERTA', 'remessa nao nasce ABERTA');
    assert.strictEqual(row.quantidade_retornada, undefined);
    let erro = null;
    try {
      await dbRun(db, "INSERT INTO remessas_terceiro_almoxarifado (numero) VALUES ('REM-SM-DEF')");
    } catch (e) { erro = e; }
    assert.ok(erro && /UNIQUE/i.test(erro.message), 'numero duplicado passou');
  });

  await test('[schema] o retorno guarda material_id PROPRIO — e o que deixa a Etapa 8c possivel', async () => {
    // Decisao 7 do design: na 8b todo resultado tem o mesmo material_id do item enviado; na 8c
    // pode ter outro (chapa -> pecas). Modelar o retorno como escalar "quantidade que voltou"
    // obrigaria a 8c a reescrever a tabela. Este teste trava a forma, nao o valor.
    const mat = await dbRun(db,
      `INSERT INTO materiais_almoxarifado (codigo, nome, unidade, quantidade_atual, ativo)
       VALUES ('SM-1','Chapa','UN',10,1)`);
    const rem = await dbRun(db,
      "INSERT INTO remessas_terceiro_almoxarifado (numero, status) VALUES ('REM-SM-1','ABERTA')");
    const item = await dbRun(db,
      'INSERT INTO itens_remessa_terceiro_almoxarifado (remessa_id, material_id, quantidade) VALUES (?,?,?)',
      [rem.lastID, mat.lastID, 10]);
    await dbRun(db,
      `INSERT INTO retornos_remessa_item_almoxarifado (remessa_id, item_remessa_id, material_id, quantidade)
       VALUES (?,?,?,?)`, [rem.lastID, item.lastID, mat.lastID, 4]);
    const linha = await dbGet(db,
      'SELECT * FROM retornos_remessa_item_almoxarifado WHERE item_remessa_id = ?', [item.lastID]);
    assert.strictEqual(linha.quantidade, 4);
    assert.strictEqual(linha.material_id, mat.lastID);
    assert.strictEqual(linha.item_remessa_id, item.lastID, 'o vinculo item enviado -> resultado se perdeu');
    // O item nasce com zero retornado: o servico da Task 6 soma sobre este valor, e NULL
    // envenenaria a soma (NULL + 4 = NULL em SQL).
    const itemRow = await dbGet(db,
      'SELECT * FROM itens_remessa_terceiro_almoxarifado WHERE id = ?', [item.lastID]);
    assert.strictEqual(itemRow.quantidade_retornada, 0, 'quantidade_retornada nasce NULL e envenena a soma');
    assert.strictEqual(itemRow.enviado_em, null, 'enviado_em nasce preenchido — o claim de idempotencia do envio nao existiria');
  });

  await test('[schema] fornecedor e INTEGER solto + nome espelhado, sem FK', async () => {
    // Padrao do modulo (lotes_almoxarifado, recebimentos_material_almoxarifado): `fornecedores` e
    // criada em server/index.js, NAO pelo initSchema do almoxarifado, e pode nao existir. Uma FK
    // aqui faria o initSchema falhar em banco sem a tabela.
    const ddl = await dbGet(db,
      "SELECT sql FROM sqlite_master WHERE type='table' AND name='remessas_terceiro_almoxarifado'");
    assert.ok(!/REFERENCES\s+fornecedores/i.test(ddl.sql),
      'a tabela declara FK para fornecedores — initSchema quebra em banco sem a tabela');
    const r = await dbRun(db,
      `INSERT INTO remessas_terceiro_almoxarifado (numero, status, fornecedor_id, fornecedor_nome)
       VALUES ('REM-SM-2','ABERTA', 999999, 'Galvanizadora Inexistente')`);
    const row = await dbGet(db, 'SELECT * FROM remessas_terceiro_almoxarifado WHERE id = ?', [r.lastID]);
    assert.strictEqual(row.fornecedor_nome, 'Galvanizadora Inexistente');
  });

  await test('[harness] a tabela fornecedores existe no harness, como existe em producao', async () => {
    // Stub no harness, NUNCA fallback na query (licao da Etapa 8 com `clientes`): fallback esconde
    // em teste um erro que existiria em producao.
    const t = await dbGet(db, "SELECT name FROM sqlite_master WHERE type='table' AND name='fornecedores'");
    assert.ok(t, 'o harness nao tem fornecedores — o JOIN da listagem de remessas falharia so aqui');
    // E precisa das colunas que o modulo le (receiptService.listarFornecedoresAux): tabela vazia
    // de colunas passaria no teste de existencia e quebraria no primeiro JOIN.
    const cols = (await dbAll(db, 'PRAGMA table_info(fornecedores)')).map((c) => c.name);
    for (const c of ['id', 'razao_social', 'nome_fantasia', 'cnpj', 'status']) {
      assert.ok(cols.includes(c), `fornecedores sem a coluna ${c}`);
    }
  });

  // ── A acao de perfil ─────────────────────────────────────────────────────────────────────────
  await test('[permissao] remessar_terceiro existe e vale para ADMINISTRADOR e ALMOXARIFE', async () => {
    assert.ok(ACAO_PERFIS.remessar_terceiro, 'a acao nao foi declarada em ACAO_PERFIS');
    assert.ok(can(ADMIN, 'remessar_terceiro'));
    assert.ok(can(ALMOXARIFE, 'remessar_terceiro'));
  });

  await test('[permissao][CONTROLE POSITIVO] quem nao movimenta tambem nao remessa', async () => {
    // Perfil EXPLICITO, nunca "usuario sem perfil": getPerfilFromUser cai em PRODUCAO por padrao,
    // entao usuario sem perfil nao prova nada sobre negativa.
    assert.strictEqual(can(PRODUCAO, 'remessar_terceiro'), false);
    assert.strictEqual(can({ ...PRODUCAO, perfil_almoxarifado: 'CONSULTA' }, 'remessar_terceiro'), false);
  });

  await test('[permissao] a acao nasce com os MESMOS perfis de movimentar (decisao 6)', async () => {
    // Nao e cosmetico: o design concedeu os mesmos perfis de `movimentar` de proposito, e o ganho
    // e poder DIVERGIR depois. Se alguem mexer numa das duas listas sem decidir, este teste diz
    // qual foi — e a resposta certa pode ser atualizar o teste com a razao escrita.
    assert.deepStrictEqual([...ACAO_PERFIS.remessar_terceiro].sort(),
      [...ACAO_PERFIS.movimentar].sort());
  });

  await test('[permissao] GET /minhas-permissoes expoe a acao nova', async () => {
    setUser(ALMOXARIFE);
    const res = await request(app).get('/api/almoxarifado/minhas-permissoes');
    assert.strictEqual(res.status, 200, JSON.stringify(res.body));
    assert.strictEqual(res.body.acoes.remessar_terceiro, true);
    setUser(PRODUCAO);
    const res2 = await request(app).get('/api/almoxarifado/minhas-permissoes');
    assert.strictEqual(res2.body.acoes.remessar_terceiro, false,
      'a UI nao consegue barrar antes do formulario, e o rotulo de erro sai errado');
    setUser(ADMIN);
  });

  await close();
  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed > 0 ? 1 : 0);
})();
