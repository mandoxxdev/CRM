/**
 * Etapa 113 (C217, C227, C220) — a situacao do material (ativo/inativo) nao prende saldo nem deixa familia inativa com
 * material ativo.
 *
 * Ate a 113 o "Inativar" (`DELETE /materiais/:id`, e o `PUT { ativo: 0 }`) nao conferia nada: o Almoxarife, a Engenharia e
 * o Administrador inativavam material com saldo 5 (medido na Fase 0) e a Saida passava a recusar ("Material inativo nao pode
 * ser movimentado") com o saldo la — sem tela para reativar. E o `PUT { ativo: 1 }` reativava material dentro de familia
 * inativa. RN-01..RN-06 do plano da Etapa 113.
 *
 * Perfis EXPLICITOS em toda negativa: usuario sem perfil cai em PRODUCAO, nao em "sem acesso".
 *
 * Executar: cd server && node tests/api/situacaoMaterial.api.test.js
 */
const assert = require('assert');
const request = require('supertest');
const { createTestApp } = require('../helpers/testApp');
const { dbRun, dbGet } = require('../../services/almoxarifado/db');
const trava = require('../../services/almoxarifado/travaPorMaterial');

let passed = 0; let failed = 0;
function test(name, fn) {
  return fn().then(() => { passed++; console.log(`  ✓ ${name}`); })
    .catch((e) => { failed++; console.error(`  ✗ ${name}: ${String(e.message).replace(/\s*\n\s*/g, ' ')}`); });
}
const SUPER = { id: 1, nome: 'Super Teste', role: 'admin', is_superadmin: 1, email: 'super@test.com' };
const ADM_PERFIL = { id: 4, nome: 'Adm Perfil', role: 'user', email: 'adm@test.com', perfil_almoxarifado: 'ADMINISTRADOR' };
const ALMOXARIFE = { id: 3, nome: 'Almox Teste', role: 'user', email: 'almox@test.com', perfil_almoxarifado: 'ALMOXARIFE' };
const ENGENHARIA = { id: 6, nome: 'Eng Teste', role: 'user', email: 'eng@test.com', perfil_almoxarifado: 'ENGENHARIA' };

const CAMINHO_NOSSO = 'zere o saldo com uma Saída ou um Ajuste.';
const CAMINHO_CLIENTE = 'devolva o saldo ao cliente ("Devolver ao cliente", em Materiais de Clientes).';
const CAMINHO_NEGATIVO = 'zere o saldo com uma Entrada ou um Ajuste.';
const SEM_MOVIMENTAR = (perfil) => ` Seu perfil (${perfil}) não movimenta estoque: peça isso ao almoxarifado.`;
// E1 do contrato: `perfil` so para quem NAO movimenta (a Engenharia).
const e1 = (codigo, fisico, retidos = '', cliente = false, perfil = null) => {
  let zerar = CAMINHO_NOSSO;
  if (fisico < 0) zerar = CAMINHO_NEGATIVO; else if (cliente) zerar = CAMINHO_CLIENTE;
  let caminho = `Antes de inativar, ${zerar}`;
  if (retidos && fisico !== 0) caminho = `Libere primeiro o que está retido e, depois, ${zerar}`;
  else if (retidos) caminho = 'Libere o que está retido antes de inativar.';
  return `Não é possível inativar o material ${codigo}: o saldo físico é ${fisico}${retidos ? ` (${retidos})` : ''}. Material `
    + `inativo não pode ser movimentado, então esse saldo ficaria preso. ${caminho}${perfil ? SEM_MOVIMENTAR(perfil) : ''}`;
};
const E2 = (codigo) => `O material ${codigo} mudou enquanto era inativado — nada foi gravado. Recarregue a lista e tente de novo.`;
const FAM_INATIVA = 'Família inativa — não é possível vincular novos itens';
const SUB_INVALIDA = 'Subfamília inválida para a família selecionada';
const FAM_E_SUB = 'A família escolhida é uma subfamília — escolha a família principal e use a subfamília no campo Subfamília';

(async () => {
  const { app, db, setUser } = await createTestApp({ user: SUPER });
  const as = async (u, fn) => { setUser(u); try { return await fn(); } finally { setUser(SUPER); } };
  let seq = 0;
  async function material(extra = {}) {
    seq += 1;
    const codigo = `E113-${seq}`;
    const id = (await dbRun(db, `INSERT INTO materiais_almoxarifado
      (codigo, nome, unidade, quantidade_atual, quantidade_minima, custo_unitario, ativo)
      VALUES (?, ?, 'PC', 0, 0, 10, 1)`, [codigo, `Peca ${seq}`])).lastID;
    for (const [k, v] of Object.entries(extra)) {
      await dbRun(db, `UPDATE materiais_almoxarifado SET ${k} = ? WHERE id = ?`, [v, id]);
    }
    return { id, codigo, nome: `Peca ${seq}` };
  }
  const lancar = async (m, body) => {
    const r = await request(app).post('/api/almoxarifado/movimentacoes/v2').send({ material_id: m.id, motivo: 'e113',
      justificativa: 'preparo e113', documento_vinculado: 'NF-113', ...body });
    assert.strictEqual(r.status, 201, `preparo ${body.tipo}: ${JSON.stringify(r.body)}`);
  };
  const comSaldo = async (q, extra = {}) => { const m = await material(extra); await lancar(m, { tipo: 'ENTRADA', quantidade: q }); return m; };
  let famSeq = 0;
  const familia = async (parentId = null) => {
    famSeq += 1;
    return (await dbRun(db, 'INSERT INTO familias_material_almoxarifado (codigo, nome, ativo, parent_id) VALUES (?, ?, 1, ?)',
      [`F113-${famSeq}`, `Familia ${famSeq}`, parentId])).lastID;
  };
  const inativarFamilia = (id) => dbRun(db, 'UPDATE familias_material_almoxarifado SET ativo = 0 WHERE id = ?', [id]);
  const cliente = async () => (await dbRun(db, "INSERT INTO clientes (razao_social) VALUES ('Cliente E113')")).lastID;

  const del = (u, id) => as(u, () => request(app).delete(`/api/almoxarifado/materiais/${id}`));
  const put = (u, id, body) => as(u, () => request(app).put(`/api/almoxarifado/materiais/${id}`).send(body));
  const linha = (id) => dbGet(db, 'SELECT nome, ativo, quantidade_atual, controle_lote, proprietario_cliente_id, updated_at FROM materiais_almoxarifado WHERE id = ?', [id]);
  const auditorias = async (id, acao) => (await dbGet(db, `SELECT COUNT(*) n FROM auditoria_log_almoxarifado
    WHERE entidade = 'material' AND entidade_id = ?${acao ? ' AND acao = ?' : ''}`, acao ? [id, acao] : [id])).n;
  const recusa = async (r, m, msg, status = 400) => {
    assert.strictEqual(r.status, status, JSON.stringify(r.body));
    assert.strictEqual(r.body.error, msg);
    const l = await linha(m.id);
    assert.strictEqual(l.ativo, 1, 'o material foi inativado');
    assert.strictEqual(l.nome, m.nome, 'o cadastro foi tocado');
    assert.strictEqual(await auditorias(m.id, 'DESATIVACAO'), 0, 'a recusa auditou');
    assert.strictEqual(await auditorias(m.id, 'ATUALIZACAO'), 0, 'a recusa auditou');
  };

  // ───────────── RN-01 ─────────────
  for (const [nomeU, u, semMov] of [['Almoxarife', ALMOXARIFE], ['Engenharia', ENGENHARIA, 'ENGENHARIA'],
    ['Administrador por perfil', ADM_PERFIL], ['superadmin', SUPER]]) {
    await test(`[RN-01] ${nomeU} inativa (DELETE) material com saldo 5: 400 E1 e nada muda`, async () => {
      const m = await comSaldo(5);
      await recusa(await del(u, m.id), m, e1(m.codigo, 5, '', false, semMov));
    });
  }

  await test('[RN-01] PUT { ativo: 0 } com saldo 5, pelo Almoxarife: 400 E1, nenhum campo gravado', async () => {
    const m = await comSaldo(5);
    await recusa(await put(ALMOXARIFE, m.id, { ativo: 0, nome: 'Nome novo' }), m, e1(m.codigo, 5));
  });

  await test('[RN-01] PUT { ativo: false } (boolean) tambem e inativar', async () => {
    const m = await comSaldo(5);
    // FlagSchema aceita boolean e bool01 o converte: `false` e a mesma porta que 0.
    await recusa(await put(ADM_PERFIL, m.id, { ativo: false }), m, e1(m.codigo, 5));
  });

  await test('[RN-01] saldo negativo (-2) tambem prende', async () => {
    const m = await material({ quantidade_atual: -2 });
    await recusa(await del(ALMOXARIFE, m.id), m, e1(m.codigo, -2));
    assert.ok(e1(m.codigo, -2).endsWith('Antes de inativar, zere o saldo com uma Entrada ou um Ajuste.'));
  });

  await test('[RN-01] material de cliente com saldo negativo: Entrada ou Ajuste (a devolucao nao zera negativo)', async () => {
    const m = await material({ quantidade_atual: -1, proprietario_cliente_id: await cliente() });
    await recusa(await del(ALMOXARIFE, m.id), m, e1(m.codigo, -1, '', true));
    assert.ok(e1(m.codigo, -1, '', true).endsWith(CAMINHO_NEGATIVO));
  });

  await test('[RN-01] ruido de ponto flutuante sai arredondado (0.1 + 0.2 -> 0.3)', async () => {
    const m = await material({ quantidade_atual: 0.1 + 0.2 });
    await recusa(await del(ENGENHARIA, m.id), m, e1(m.codigo, 0.3, '', false, 'ENGENHARIA'));
  });

  await test('[RN-01] fisico 5 com 2 reservado e 1 em terceiros: as retencoes aparecem e o caminho manda liberar', async () => {
    const m = await material({ quantidade_atual: 5, quantidade_reservada: 2, quantidade_em_terceiros: 1 });
    await recusa(await del(ALMOXARIFE, m.id), m, e1(m.codigo, 5, 'reservado 2, em terceiros 1'));
  });

  await test('[RN-01] retencao sem fisico (estado anomalo): as quatro, na ordem', async () => {
    const m = await material({ quantidade_reservada: 1, quantidade_bloqueada: 1.5, quantidade_em_inspecao: 2,
      quantidade_em_terceiros: 0.25 });
    await recusa(await del(ADM_PERFIL, m.id), m,
      e1(m.codigo, 0, 'reservado 1, bloqueado 1.5, em inspeção 2, em terceiros 0.25'));
    assert.ok(e1(m.codigo, 0, 'x').endsWith('Libere o que está retido antes de inativar.'));
  });

  await test('[RN-01] material de cliente: o caminho e devolver ao cliente', async () => {
    const m = await material({ quantidade_atual: 3, proprietario_cliente_id: await cliente() });
    await recusa(await del(ENGENHARIA, m.id), m, e1(m.codigo, 3, '', true, 'ENGENHARIA'));
  });

  await test('[RN-01] material de cliente com bloqueado: libera e devolve', async () => {
    const m = await material({ quantidade_atual: 3, quantidade_bloqueada: 3, proprietario_cliente_id: await cliente() });
    await recusa(await put(ALMOXARIFE, m.id, { ativo: 0 }), m, e1(m.codigo, 3, 'bloqueado 3', true));
  });

  await test('[RN-01] usuario sem perfil (PRODUCAO) nao chega a esta regra: 403 do editar_material', async () => {
    const m = await comSaldo(5);
    const r = await del({ id: 99, nome: 'Sem perfil', role: 'user', email: 'sp@test.com' }, m.id);
    assert.strictEqual(r.status, 403, JSON.stringify(r.body));
    assert.strictEqual(r.body.acao, 'editar_material');
    assert.strictEqual((await linha(m.id)).ativo, 1);
  });

  // ───────────── RN-02 ─────────────
  await test('[RN-02] saldo 0 com livro (entrou e saiu): inativa, audita DESATIVACAO uma vez', async () => {
    const m = await comSaldo(5);
    await lancar(m, { tipo: 'SAIDA', quantidade: 5 });
    const r = await del(ALMOXARIFE, m.id);
    assert.strictEqual(r.status, 200, JSON.stringify(r.body));
    assert.deepStrictEqual(r.body, { success: true });
    assert.strictEqual((await linha(m.id)).ativo, 0);
    assert.strictEqual(await auditorias(m.id, 'DESATIVACAO'), 1);
  });

  await test('[RN-02] residuo que arredonda a 0 (4e-7) e livre; 6e-7 vira 0.000001 e prende', async () => {
    const livre = await material({ quantidade_atual: 4e-7 });
    const r = await del(ENGENHARIA, livre.id);
    assert.strictEqual(r.status, 200, JSON.stringify(r.body));
    assert.strictEqual((await linha(livre.id)).ativo, 0);
    const preso = await material({ quantidade_reservada: 6e-7 });
    await recusa(await del(ENGENHARIA, preso.id), preso, e1(preso.codigo, 0, 'reservado 0.000001', false, 'ENGENHARIA'));
  });

  await test('[RN-02] PUT { ativo: 0 } sem saldo: 200, inativa e audita a ATUALIZACAO', async () => {
    const m = await material();
    const r = await put(ENGENHARIA, m.id, { ativo: 0 });
    assert.strictEqual(r.status, 200, JSON.stringify(r.body));
    assert.strictEqual((await linha(m.id)).ativo, 0);
    assert.strictEqual(await auditorias(m.id, 'ATUALIZACAO'), 1);
  });

  await test('[RN-02] requisicao pendente (sem reserva) nao impede inativar', async () => {
    const m = await material();
    const cr = await request(app).post('/api/almoxarifado/requisicoes')
      .send({ os_referencia: 'OS-113', itens: [{ material_id: m.id, quantidade: 1 }] });
    assert.strictEqual(cr.status, 201, JSON.stringify(cr.body));
    const r = await del(ALMOXARIFE, m.id);
    assert.strictEqual(r.status, 200, JSON.stringify(r.body));
    assert.strictEqual((await linha(m.id)).ativo, 0);
  });

  // ───────────── RN-03 ─────────────
  await test('[RN-03] DELETE de material ja inativo com saldo: 200, sem escrita e sem auditoria', async () => {
    const m = await material({ quantidade_atual: 5, ativo: 0, updated_at: '2000-01-01 00:00:00' });
    const r = await del(ALMOXARIFE, m.id);
    assert.strictEqual(r.status, 200, JSON.stringify(r.body));
    assert.deepStrictEqual(r.body, { success: true });
    const l = await linha(m.id);
    assert.strictEqual(l.ativo, 0);
    assert.strictEqual(l.updated_at, '2000-01-01 00:00:00', 'escreveu no material ja inativo');
    assert.strictEqual(await auditorias(m.id), 0);
  });

  await test('[RN-03] DELETE de id inexistente: 200 { success: true } (contrato da Etapa 19)', async () => {
    const r = await del(ALMOXARIFE, 987654);
    assert.strictEqual(r.status, 200, JSON.stringify(r.body));
    assert.deepStrictEqual(r.body, { success: true });
  });

  await test('[RN-03] PUT que edita outro campo de material inativo com saldo (ativo omitido e ativo 0): 200', async () => {
    const m = await material({ quantidade_atual: 5, ativo: 0 });
    let r = await put(ALMOXARIFE, m.id, { nome: 'Renomeado' });
    assert.strictEqual(r.status, 200, JSON.stringify(r.body));
    r = await put(ALMOXARIFE, m.id, { nome: 'Renomeado 2', ativo: 0 });
    assert.strictEqual(r.status, 200, JSON.stringify(r.body));
    const l = await linha(m.id);
    assert.strictEqual(l.nome, 'Renomeado 2');
    assert.strictEqual(l.ativo, 0);
  });

  // ───────────── RN-04 (injecao na janela) ─────────────
  let injecoes = [];
  const getOriginal = db.get.bind(db);
  db.get = function (sql, params, cb) {
    if (typeof params === 'function') { cb = params; params = []; }
    const s = String(sql).replace(/\s+/g, ' ').trim();
    const i = injecoes.findIndex((inj) => inj.sql.test(s));
    if (i >= 0) {
      const inj = injecoes[i]; injecoes.splice(i, 1);
      const ler = () => getOriginal(sql, params, (err, row) => {
        if (!inj.depois) return cb(err, row);
        inj.depois().then(() => cb(err, row), (e) => cb(e));
      });
      if (inj.antes) return inj.antes().then(ler, (e) => cb(e));
      return ler();
    }
    return getOriginal(sql, params, cb);
  };
  const SQL_DELETE_LEITURA = /^SELECT id, codigo, nome, ativo FROM materiais_almoxarifado WHERE id = \?$/;
  const SQL_PUT_LEITURA = /^SELECT \* FROM materiais_almoxarifado WHERE id = \?$/;
  const SQL_RELEITURA = /^SELECT ativo, quantidade_atual, /;

  await test('[RN-04] DELETE: Entrada de 4 cai entre a leitura e o UPDATE -> 400 E1 "4", continua ativo', async () => {
    const m = await material();
    injecoes = [{ sql: SQL_DELETE_LEITURA,
      depois: () => dbRun(db, 'UPDATE materiais_almoxarifado SET quantidade_atual = 4 WHERE id = ?', [m.id]) }];
    const r = await del(ALMOXARIFE, m.id);
    assert.strictEqual(injecoes.length, 0, 'injecao nao consumida');
    await recusa(r, m, e1(m.codigo, 4));
  });

  await test('[RN-04] PUT { ativo: 0 }: Entrada de 4 na janela -> 400 E1 "4", nenhum campo gravado', async () => {
    const m = await material();
    injecoes = [{ sql: SQL_PUT_LEITURA,
      depois: () => dbRun(db, 'UPDATE materiais_almoxarifado SET quantidade_atual = 4 WHERE id = ?', [m.id]) }];
    const r = await put(ENGENHARIA, m.id, { ativo: 0, nome: 'Nao grava' });
    assert.strictEqual(injecoes.length, 0, 'injecao nao consumida');
    await recusa(r, m, e1(m.codigo, 4, '', false, 'ENGENHARIA'));
  });

  const E4 = (codigo) => `O cadastro do material ${codigo} mudou enquanto era salvo — nada foi gravado. Recarregue o material `
    + 'e salve de novo.';
  await test('[RN-04 c] PUT { nome } lido ativo; o material e a familia sao inativados na janela -> 409 E4, continua inativo', async () => {
    const f = await familia();
    const m = await material({ familia_id: f });
    injecoes = [{ sql: SQL_PUT_LEITURA, depois: async () => {
      await dbRun(db, 'UPDATE materiais_almoxarifado SET ativo = 0 WHERE id = ?', [m.id]);
      await inativarFamilia(f);
    } }];
    const r = await put(ALMOXARIFE, m.id, { nome: 'Salvar velho' });
    assert.strictEqual(injecoes.length, 0, 'injecao nao consumida');
    assert.strictEqual(r.status, 409, JSON.stringify(r.body));
    assert.strictEqual(r.body.error, E4(m.codigo));
    const l = await linha(m.id);
    assert.strictEqual(l.ativo, 0, 'o salvar velho reativou o material');
    assert.strictEqual(l.nome, m.nome);
  });

  await test('[RN-04 c] PUT { ativo: 0 } e outra aba inativa na janela -> 409 E4, sem auditoria desta requisicao', async () => {
    const m = await material();
    injecoes = [{ sql: SQL_PUT_LEITURA,
      depois: () => dbRun(db, 'UPDATE materiais_almoxarifado SET ativo = 0 WHERE id = ?', [m.id]) }];
    const r = await put(ALMOXARIFE, m.id, { ativo: 0 });
    assert.strictEqual(injecoes.length, 0, 'injecao nao consumida');
    assert.strictEqual(r.status, 409, JSON.stringify(r.body));
    assert.strictEqual(r.body.error, E4(m.codigo));
    assert.strictEqual(await auditorias(m.id), 0);
  });

  await test('[RN-04 c controle] PUT { nome } de material inativo sem nada na janela continua 200', async () => {
    const m = await material({ ativo: 0 });
    const r = await put(ALMOXARIFE, m.id, { nome: 'Sem janela' });
    assert.strictEqual(r.status, 200, JSON.stringify(r.body));
    assert.strictEqual((await linha(m.id)).nome, 'Sem janela');
  });

  await test('[RN-04 c] ativo NULL (legado) e editavel: a condicao usa IS, nao =', async () => {
    const m = await material({ ativo: null });
    const r = await put(ALMOXARIFE, m.id, { nome: 'Legado NULL' });
    assert.strictEqual(r.status, 200, JSON.stringify(r.body));
    assert.strictEqual((await linha(m.id)).nome, 'Legado NULL');
  });

  await test('[RN-04] DELETE: outra aba inativa na janela -> 200, e esta requisicao nao audita', async () => {
    const m = await material();
    injecoes = [{ sql: SQL_DELETE_LEITURA,
      depois: () => dbRun(db, 'UPDATE materiais_almoxarifado SET ativo = 0 WHERE id = ?', [m.id]) }];
    const r = await del(ALMOXARIFE, m.id);
    assert.strictEqual(injecoes.length, 0, 'injecao nao consumida');
    assert.strictEqual(r.status, 200, JSON.stringify(r.body));
    assert.deepStrictEqual(r.body, { success: true });
    assert.strictEqual(await auditorias(m.id, 'DESATIVACAO'), 0);
  });

  await test('[RN-04] DELETE: saldo entra e sai de novo antes da releitura -> 409 E2', async () => {
    const m = await material();
    injecoes = [
      { sql: SQL_DELETE_LEITURA,
        depois: () => dbRun(db, 'UPDATE materiais_almoxarifado SET quantidade_atual = 4 WHERE id = ?', [m.id]) },
      { sql: SQL_RELEITURA,
        antes: () => dbRun(db, 'UPDATE materiais_almoxarifado SET quantidade_atual = 0 WHERE id = ?', [m.id]) },
    ];
    const r = await del(ALMOXARIFE, m.id);
    assert.strictEqual(injecoes.length, 0, 'injecao nao consumida');
    await recusa(r, m, E2(m.codigo), 409);
  });

  // RN-04 (d): o motor le `ativo` e credita sob a trava do material; o inativar grava sob a mesma trava. Segurar a trava
  // simula o motor no meio de uma Entrada: o inativar tem de ESPERAR, e ver o saldo que ela deixou.
  const esperaATrava = async (nome, disparar, msgEsperada) => {
    await test(`[RN-04 d] ${nome}: espera a trava do material e ve o saldo que a Entrada deixou`, async () => {
      const m = await material();
      let resposta = null;
      // A trava e segurada por OUTRA cadeia: disparada de dentro da secao, a requisicao herdaria o contexto dela
      // (AsyncLocalStorage) e o motor a deixaria passar — a trava nao e reentrante, por desenho.
      let soltar;
      let segurando;
      const segurou = new Promise((ok) => {
        segurando = trava.comLockDoMaterial(m.id, () => new Promise((fim) => { soltar = fim; ok(); }));
      });
      await segurou;
      const pendente = disparar(m).then((r) => { resposta = r; });
      await new Promise((ok) => setTimeout(ok, 60));
      assert.strictEqual(resposta, null, 'o inativar gravou sem esperar a trava do material');
      await dbRun(db, 'UPDATE materiais_almoxarifado SET quantidade_atual = 4 WHERE id = ?', [m.id]);
      soltar();
      await segurando;
      await pendente;
      await recusa(resposta, m, msgEsperada(m));
    });
  };
  await esperaATrava('DELETE', (m) => del(ALMOXARIFE, m.id), (m) => e1(m.codigo, 4));
  await esperaATrava('PUT { ativo: 0 }', (m) => put(ALMOXARIFE, m.id, { ativo: 0 }), (m) => e1(m.codigo, 4));

  await test('[RN-04 d] corrida real: Entrada e Inativar disparados juntos, 12 rodadas — nunca inativo com saldo', async () => {
    for (let i = 0; i < 12; i++) {
      const m = await material();
      // eslint-disable-next-line no-await-in-loop
      const [e, d] = await Promise.all([
        request(app).post('/api/almoxarifado/movimentacoes/v2').send({ material_id: m.id, tipo: 'ENTRADA', quantidade: 3,
          motivo: 'e113', justificativa: 'corrida e113', documento_vinculado: 'NF-C' }),
        del(ALMOXARIFE, m.id),
      ]);
      // eslint-disable-next-line no-await-in-loop
      const l = await linha(m.id);
      assert.ok(!(l.ativo === 0 && l.quantidade_atual !== 0), `rodada ${i}: inativo com saldo ${l.quantidade_atual} (${e.status}/${d.status})`);
      assert.ok((e.status === 201 && d.status === 400) || (e.status === 400 && d.status === 200), `rodada ${i}: ${e.status}/${d.status}`);
    }
  });

  // ───────────── RN-05 ─────────────
  await test('[RN-05] reativar com a familia inativa (familia omitida no corpo): 400 da familia, continua inativo', async () => {
    const f = await familia();
    const m = await material({ familia_id: f, ativo: 0 });
    await inativarFamilia(f);
    const r = await put(ADM_PERFIL, m.id, { ativo: 1 });
    assert.strictEqual(r.status, 400, JSON.stringify(r.body));
    assert.strictEqual(r.body.error, FAM_INATIVA);
    assert.strictEqual((await linha(m.id)).ativo, 0);
  });

  await test('[RN-05] reativar com a mesma familia inativa no corpo (como o formulario mandaria): 400', async () => {
    const f = await familia();
    const m = await material({ familia_id: f, ativo: 0 });
    await inativarFamilia(f);
    const r = await put(ALMOXARIFE, m.id, { ativo: 1, familia_id: f, subfamilia_id: null });
    assert.strictEqual(r.status, 400, JSON.stringify(r.body));
    assert.strictEqual(r.body.error, FAM_INATIVA);
    assert.strictEqual((await linha(m.id)).ativo, 0);
  });

  await test('[RN-05] reativar com a subfamilia inativa: 400 da subfamilia', async () => {
    const f = await familia();
    const s = await familia(f);
    const m = await material({ familia_id: f, subfamilia_id: s, ativo: 0 });
    await inativarFamilia(s);
    const r = await put(ENGENHARIA, m.id, { ativo: 1 });
    assert.strictEqual(r.status, 400, JSON.stringify(r.body));
    assert.strictEqual(r.body.error, SUB_INVALIDA);
    assert.strictEqual((await linha(m.id)).ativo, 0);
  });

  await test('[RN-05] reativar com familia e subfamilia ativas: 200', async () => {
    const f = await familia();
    const s = await familia(f);
    const m = await material({ familia_id: f, subfamilia_id: s, ativo: 0 });
    const r = await put(ENGENHARIA, m.id, { ativo: 1 });
    assert.strictEqual(r.status, 200, JSON.stringify(r.body));
    assert.strictEqual((await linha(m.id)).ativo, 1);
  });

  await test('[RN-05] reativar sem familia: 200', async () => {
    const m = await material({ ativo: 0 });
    const r = await put(ALMOXARIFE, m.id, { ativo: 1 });
    assert.strictEqual(r.status, 200, JSON.stringify(r.body));
    assert.strictEqual((await linha(m.id)).ativo, 1);
  });

  await test('[RN-05] a familia e inativada na janela da reativacao: 400 da familia (releitura), continua inativo', async () => {
    const f = await familia();
    const m = await material({ familia_id: f, ativo: 0 });
    injecoes = [{ sql: SQL_PUT_LEITURA, depois: () => inativarFamilia(f) }];
    const r = await put(ADM_PERFIL, m.id, { ativo: 1 });
    assert.strictEqual(injecoes.length, 0, 'injecao nao consumida');
    assert.strictEqual(r.status, 400, JSON.stringify(r.body));
    assert.strictEqual(r.body.error, FAM_INATIVA);
    assert.strictEqual((await linha(m.id)).ativo, 0);
  });

  await test('[RN-05] legado com a subfamilia no familia_id: reativar recusa pela literal da subfamilia', async () => {
    const f = await familia();
    const s = await familia(f);
    const m = await material({ familia_id: s, ativo: 0 });
    const r = await put(ADM_PERFIL, m.id, { ativo: 1 });
    assert.strictEqual(r.status, 400, JSON.stringify(r.body));
    assert.strictEqual(r.body.error, FAM_E_SUB);
    assert.strictEqual((await linha(m.id)).ativo, 0);
  });

  await test('[RN-05 controle] editar material inativo de familia inativa SEM reativar continua livre (200)', async () => {
    const f = await familia();
    const m = await material({ familia_id: f, ativo: 0 });
    await inativarFamilia(f);
    const r = await put(ALMOXARIFE, m.id, { nome: 'Edita inativo', familia_id: f });
    assert.strictEqual(r.status, 200, JSON.stringify(r.body));
    assert.strictEqual((await linha(m.id)).nome, 'Edita inativo');
  });

  // ───────────── RN-06 ─────────────
  await test('[RN-06] inativar com saldo + trocar o dono, pelo Almoxarife: a recusa e a da troca de dono (108)', async () => {
    const m = await comSaldo(5);
    const r = await put(ALMOXARIFE, m.id, { ativo: 0, proprietario_cliente_id: await cliente() });
    assert.strictEqual(r.status, 403, JSON.stringify(r.body));
    assert.ok(String(r.body.error).startsWith(`Trocar o dono do material ${m.codigo}`), r.body.error);
    assert.strictEqual((await linha(m.id)).ativo, 1);
  });

  await test('[RN-06] inativar com saldo + ligar o lote, pelo Almoxarife: a recusa e a de inativar, nao a do controle', async () => {
    const m = await comSaldo(5);
    await recusa(await put(ALMOXARIFE, m.id, { ativo: 0, controle_lote: 1 }), m, e1(m.codigo, 5));
    assert.strictEqual((await linha(m.id)).controle_lote, 0);
  });

  // ───────────── RN-09 (Fase 5) ─────────────
  // O estorno e um movimento: estornar a Saida de um material inativado devolvia o saldo a ele (medido pela revisao:
  // inativo com 5, e a Saida seguinte recusada). Recusado com a literal do motor; o livro e o saldo nao mudam.
  const INATIVO_MOV = 'Material inativo não pode ser movimentado';
  const saidaDe5 = async () => {
    const m = await comSaldo(5);
    const s5 = await request(app).post('/api/almoxarifado/movimentacoes/v2').send({ material_id: m.id, tipo: 'SAIDA',
      quantidade: 5, motivo: 'e113', justificativa: 'preparo e113' });
    assert.strictEqual(s5.status, 201, JSON.stringify(s5.body));
    return { m, saidaId: s5.body.id };
  };
  const cancelada = async (id) => Number((await dbGet(db, 'SELECT cancelado FROM movimentacoes_almoxarifado WHERE id = ?',
    [id])).cancelado);
  const estornar = (u, id) => as(u, () => request(app).post(`/api/almoxarifado/movimentacoes/${id}/cancelar`)
    .send({ motivo: 'estorno e113' }));

  await test('[RN-09] estornar a Saida de um material inativado: 400 "Material inativo...", saldo 0 e a Saida intacta', async () => {
    const { m, saidaId } = await saidaDe5();
    assert.strictEqual((await del(ALMOXARIFE, m.id)).status, 200);
    const r = await estornar(ADM_PERFIL, saidaId);
    assert.strictEqual(r.status, 400, JSON.stringify(r.body));
    assert.strictEqual(r.body.error, INATIVO_MOV);
    const l = await linha(m.id);
    assert.strictEqual(l.ativo, 0);
    assert.strictEqual(l.quantidade_atual, 0);
    assert.strictEqual(await cancelada(saidaId), 0, 'a Saida ficou marcada como cancelada');
  });

  await test('[RN-09 controle] reativado, o mesmo estorno passa (201/200) e o saldo volta', async () => {
    const { m, saidaId } = await saidaDe5();
    assert.strictEqual((await del(ALMOXARIFE, m.id)).status, 200);
    assert.strictEqual((await put(ALMOXARIFE, m.id, { ativo: 1 })).status, 200);
    const r = await estornar(ADM_PERFIL, saidaId);
    assert.strictEqual(r.status, 200, JSON.stringify(r.body));
    assert.strictEqual((await linha(m.id)).quantidade_atual, 5);
  });

  await test('[RN-09] estornar o Ajuste (5 -> 2) de um material zerado e inativado: 400, o saldo nao volta (guarda previa)', async () => {
    const m = await comSaldo(5);
    const aj = await request(app).post('/api/almoxarifado/movimentacoes/v2').send({ material_id: m.id, tipo: 'AJUSTE',
      quantidade: 2, motivo: 'e113', justificativa: 'contagem deu 2' });
    assert.strictEqual(aj.status, 201, JSON.stringify(aj.body));
    await lancar(m, { tipo: 'SAIDA', quantidade: 2 });
    assert.strictEqual((await linha(m.id)).quantidade_atual, 0);
    assert.strictEqual((await del(ALMOXARIFE, m.id)).status, 200);
    const r = await estornar(ADM_PERFIL, aj.body.id);
    assert.strictEqual(r.status, 400, JSON.stringify(r.body));
    assert.strictEqual(r.body.error, INATIVO_MOV);
    assert.strictEqual((await linha(m.id)).quantidade_atual, 0, 'o estorno do ajuste devolveu saldo a material inativo');
    assert.strictEqual(await cancelada(aj.body.id), 0);
  });

  await test('[RN-09] janela: o material e inativado entre a leitura do estorno e o credito -> 400, nada creditado', async () => {
    const { m, saidaId } = await saidaDe5();
    // a leitura do material pelo estorno e o `SELECT *` do getMaterial; inativa logo depois dela
    injecoes = [{ sql: /^SELECT \* FROM materiais_almoxarifado WHERE id = \?$/,
      depois: () => dbRun(db, 'UPDATE materiais_almoxarifado SET ativo = 0 WHERE id = ?', [m.id]) }];
    const r = await estornar(ADM_PERFIL, saidaId);
    assert.strictEqual(injecoes.length, 0, 'injecao nao consumida');
    assert.strictEqual(r.status, 400, JSON.stringify(r.body));
    assert.strictEqual(r.body.error, INATIVO_MOV);
    assert.strictEqual((await linha(m.id)).quantidade_atual, 0, 'o estorno creditou material inativo');
    assert.strictEqual(await cancelada(saidaId), 0, 'a Saida ficou marcada como cancelada');
  });

  // ───────────── Fase 5: cenarios que as sabotagens da revisao deixaram passar ─────────────
  // Fase 5, P1 (S13a/b/c): DELETE com UMA retencao so e fisico 0 (o estado anomalo da RN-01) — o DELETE nao tem guarda previa,
  // o SEM_SALDO_SQL e a unica barreira.
  for (const [col, rot, q] of [['quantidade_bloqueada', 'bloqueado', 1.5], ['quantidade_em_inspecao', 'em inspeção', 2],
    ['quantidade_em_terceiros', 'em terceiros', 0.25]]) {
    await test(`[F5 P1] DELETE com so ${rot} ${q} (fisico 0): 400 E1, continua ativo`, async () => {
      const m = await material({ [col]: q });
      await recusa(await del(ALMOXARIFE, m.id), m, e1(m.codigo, 0, `${rot} ${q}`));
    });
  }

  // Fase 5, P2 (S9): PUT { ativo: 0, controle_lote: 1 } pelo Almoxarife, saldo 0 na leitura, Entrada sem lote de 4 na janela.
  await test('[F5 P2] PUT inativa + liga lote, Entrada de 4 na janela: E1 de inativar (RN-06), nao a do controle', async () => {
    const m = await material();
    injecoes = [{ sql: SQL_PUT_LEITURA,
      depois: () => dbRun(db, 'UPDATE materiais_almoxarifado SET quantidade_atual = 4 WHERE id = ?', [m.id]) }];
    const r = await put(ALMOXARIFE, m.id, { ativo: 0, controle_lote: 1 });
    assert.strictEqual(injecoes.length, 0, 'injecao nao consumida');
    await recusa(r, m, e1(m.codigo, 4));
  });

  // Fase 5, P2b (S9): a Entrada cai DEPOIS da guarda previa do controle (antes do UPDATE): a releitura decide.
  await test("[F5 P2b] PUT inativa + liga lote, Entrada de 4 depois da guarda previa: E1 de inativar pela releitura", async () => {
    const m = await material();
    injecoes = [{ sql: /^SELECT quantidade_atual AS fisico/,
      depois: () => dbRun(db, "UPDATE materiais_almoxarifado SET quantidade_atual = 4 WHERE id = ?", [m.id]) }];
    const r = await put(ALMOXARIFE, m.id, { ativo: 0, controle_lote: 1 });
    assert.strictEqual(injecoes.length, 0, "injecao nao consumida");
    await recusa(r, m, e1(m.codigo, 4));
  });

  // Fase 5, P3 (S10): PUT { ativo: 0 } de material de cliente, Entrada de 3 na janela: o caminho relido e o do cliente.
  await test('[F5 P3] PUT inativa material de cliente, saldo 3 na janela: E1 com o caminho do cliente', async () => {
    const m = await material({ proprietario_cliente_id: await cliente() });
    injecoes = [{ sql: SQL_PUT_LEITURA,
      depois: () => dbRun(db, 'UPDATE materiais_almoxarifado SET quantidade_atual = 3 WHERE id = ?', [m.id]) }];
    const r = await put(ALMOXARIFE, m.id, { ativo: 0 });
    assert.strictEqual(injecoes.length, 0, 'injecao nao consumida');
    await recusa(r, m, e1(m.codigo, 3, '', true));
  });

  // Fase 5, P4 (S16): material legado com ativo NULL numa familia inativa: reativar recusa.
  await test('[F5 P4] reativar material ativo NULL (legado) de familia inativa: 400 da familia, continua NULL', async () => {
    const f = await familia();
    const m = await material({ familia_id: f, ativo: null });
    await inativarFamilia(f);
    const r = await put(ALMOXARIFE, m.id, { ativo: 1 });
    assert.strictEqual(r.status, 400, JSON.stringify(r.body));
    assert.strictEqual(r.body.error, FAM_INATIVA);
    assert.strictEqual((await linha(m.id)).ativo, null);
  });

  // Fase 5, P5 (S8): fisico negativo COM retencao: libera primeiro e depois Entrada/Ajuste.
  await test('[F5 P5] DELETE fisico -2 com reservado 1: "Libere primeiro ... Entrada ou um Ajuste."', async () => {
    const m = await material({ quantidade_atual: -2, quantidade_reservada: 1 });
    const r = await del(ALMOXARIFE, m.id);
    await recusa(r, m, e1(m.codigo, -2, 'reservado 1'));
    assert.ok(r.body.error.endsWith('Libere primeiro o que está retido e, depois, zere o saldo com uma Entrada ou um Ajuste.'));
  });

  // Fase 5, P6 (S12b): o residuo 4e-7 e livre tambem pelo PUT (a guarda previa JS).
  await test('[F5 P6] PUT { ativo: 0 } com residuo 4e-7: 200, inativa', async () => {
    const m = await material({ quantidade_atual: 4e-7 });
    const r = await put(ALMOXARIFE, m.id, { ativo: 0 });
    assert.strictEqual(r.status, 200, JSON.stringify(r.body));
    assert.strictEqual((await linha(m.id)).ativo, 0);
  });

  // Fase 5, P7 (S20): o PUT que inativa E liga o lote tambem espera a trava do material.
  await test('[F5 P7] PUT { ativo: 0, controle_lote: 1 } (Almoxarife) espera a trava e ve o saldo da Entrada', async () => {
    const m = await material();
    let resposta = null; let soltar; let segurando;
    const segurou = new Promise((ok) => {
      segurando = trava.comLockDoMaterial(m.id, () => new Promise((fim) => { soltar = fim; ok(); }));
    });
    await segurou;
    const pendente = put(ALMOXARIFE, m.id, { ativo: 0, controle_lote: 1 }).then((r) => { resposta = r; });
    await new Promise((ok) => setTimeout(ok, 60));
    const cedo = resposta;
    await dbRun(db, 'UPDATE materiais_almoxarifado SET quantidade_atual = 4 WHERE id = ?', [m.id]);
    soltar(); await segurando; await pendente;
    assert.strictEqual(cedo, null, `gravou sem esperar a trava: ${cedo && cedo.status}`);
    await recusa(resposta, m, e1(m.codigo, 4));
  });

  // ───────────── RN-08 ─────────────
  await test('[RN-08] GET ?status=inativo lista so os inativos (e o NULL); sem status, so os ativos', async () => {
    const at = await material();
    const in0 = await material({ ativo: 0, quantidade_atual: 7 });
    const inNull = await material({ ativo: null });
    const ids = (rows) => rows.map((x) => x.id);
    const inativos = await request(app).get('/api/almoxarifado/materiais').query({ status: 'inativo' });
    assert.strictEqual(inativos.status, 200, JSON.stringify(inativos.body));
    assert.ok(ids(inativos.body).includes(in0.id) && ids(inativos.body).includes(inNull.id), 'faltou inativo');
    assert.ok(!ids(inativos.body).includes(at.id), 'ativo na lista de inativos');
    assert.ok(inativos.body.every((x) => x.ativo !== 1));
    const todos = await request(app).get('/api/almoxarifado/materiais');
    assert.ok(ids(todos.body).includes(at.id), 'o ativo sumiu da lista padrao');
    assert.ok(!ids(todos.body).includes(in0.id) && !ids(todos.body).includes(inNull.id), 'inativo na lista padrao');
  });

  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed > 0 ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
