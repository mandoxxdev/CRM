/**
 * Etapa 69, T7 (integracao, cruza o tronco T1-T3) — sucatear o material REPROVADO na inspecao, ponta a
 * ponta, TUDO PELAS ROTAS.
 *
 * Plano: docs/superpowers/plans/2026-10-01-almoxarifado-etapa69-sucatear-reprovado.md (T7 e a secao
 * "Fase 2 — revisao do plano", que PREVALECE: as literais do /executar de SUCATEAR, a do lote fora de
 * ATIVO, e a origem pela area de sucata considerando o LOTE).
 *
 * T1 (motor doBloqueado), T2 (lado da NC) e T3 (rota nova + segunda assinatura) foram testados cada um
 * no seu galho. Aqui se prova que conversam numa operacao real, com cinco pessoas distintas:
 * ALMOX1 recebe e solicita, a QUALIDADE inspeciona/decide/libera o lote, COMPRAS tenta executar,
 * GESTOR assina a gestao, ALMOX2 assina o almoxarifado; ADMIN2 (superadmin) prova a barreira da
 * mesma pessoa nas duas pernas.
 *
 *  (1) material critico com controle_certificado e LOTE criado pela rota; POST /recebimentos ->
 *      iniciar_conferencia -> finalizar_conferencia -> /aprovar (entrada no endereco E). O lote nasce
 *      BLOQUEADO (sem certificado). A QUALIDADE reprova 3 de 10 -> a NC nasce sozinha -> decide
 *      SUCATEAR: nada move, NC PENDENTE e na fila, inspecao no cartao MATERIAL_REPROVADO.
 *  (2) /executar (COMPRAS) -> 409 literal do lote fora de ATIVO; NC continua PENDENTE.
 *  (3) a QUALIDADE muda o lote para ATIVO; /executar -> 409 literal "pede sucateamento"; continua.
 *  (4) ALMOX1 solicita -> 201 derivado, nada move, a fila de sucateamentos traz o NC-...; o /executar
 *      agora recusa com o SUC-id aberto.
 *  (5) pernas: GESTOR na gestao (nada move; a inspecao ainda no cartao); ALMOX2 fecha a do almoxarifado
 *      -> bloqueado 0, fisico 7, disponivel 7, linha do LOTE -3, livro SUCATA (motivo, NC, SUC-id,
 *      lote, origem E), NC EXECUTADA com a movimentacao, fora da fila, fora do cartao, relatorio
 *      sucata-financeiro contando a linha.
 *  (6) estorno pela rota do livro -> 400 literal; nada muda (nem `cancelado`).
 *  (7) segunda NC (DEVOLVER) da MESMA inspecao, executada -> SEM_SALDO "ja havia sido sucateado";
 *      o bloqueio de OUTRA origem fica intacto.
 *  (8) a mesma pessoa nas duas pernas (ADMIN2) -> 403 literal (barreira 3), nada move; outra fecha.
 *  (9) sonda B da Fase 2: lote + reprovado transferido (pela rota) para a AREA DE SUCATA -> a baixa
 *      sai da area (origem S), E fica com o aprovado.
 * (10) a Surpresa 1 FIXADA como comportamento declarado (D12/B307): o sucateamento COMUM de 3 com
 *      reprovacao parcial e ACEITO e baixa do DISPONIVEL — o reprovado continua bloqueado. Este teste
 *      existe para ninguem "consertar" o comum sem ler a decisao; se a decisao mudar, mude-o junto.
 *
 * Datas: nada aqui depende de "hoje" (o relatorio vai sem de/ate; o cartao usa janela de 7 dias do
 * proprio SQLite) — sem fragilidade perto da meia-noite UTC.
 *
 * Executar: cd server && node tests/api/sucateamentoReprovadoIntegracao.api.test.js
 */
const assert = require('assert');
const request = require('supertest');
const { createTestApp } = require('../helpers/testApp');
const { dbRun, dbGet } = require('../../services/almoxarifado/db');

let passed = 0; let failed = 0;
function test(name, fn) {
  return fn().then(() => { passed++; console.log(`  ✓ ${name}`); })
    .catch((e) => { failed++; console.error(`  ✗ ${name}: ${e.message}`); });
}

const ADMIN = { id: 6970, nome: 'Admin E69T7', role: 'admin', is_superadmin: 1, email: 'e69t7@test.com' };
const ADMIN2 = { id: 6971, nome: 'Admin Dois T7', role: 'admin', is_superadmin: 1, email: 'e69t7b@test.com' };
const QUALIDADE = { id: 6972, nome: 'Quel Qualidade T7', role: 'usuario', perfil_almoxarifado: 'QUALIDADE', email: 'q69t7@test.com' };
const ALMOX1 = { id: 6973, nome: 'Ana Almoxarife T7', role: 'usuario', perfil_almoxarifado: 'ALMOXARIFE', email: 'a1t7@test.com' };
const ALMOX2 = { id: 6974, nome: 'Bia Almoxarife T7', role: 'usuario', perfil_almoxarifado: 'ALMOXARIFE', email: 'a2t7@test.com' };
const GESTOR = { id: 6975, nome: 'Gil Gestor T7', role: 'usuario', perfil_almoxarifado: 'GESTOR', email: 'gt7@test.com' };
const COMPRAS = { id: 6976, nome: 'Caio Compras T7', role: 'usuario', perfil_almoxarifado: 'COMPRAS', email: 'ct7@test.com' };

const SUF = `${Date.now() % 100000}`;
let seq = 0;
const cod = (p) => `E69I-${p}-${SUF}-${++seq}`;

const MSG_PEDE_SUCATEAMENTO = 'Esta não conformidade pede sucateamento: o almoxarifado registra em "Solicitar sucateamento" (duas aprovações) — a execução fica registrada na segunda aprovação.';
const MSG_LOTE_BLOQUEADO = (l) => `O lote ${l} está bloqueado (Certificado do fornecedor nao anexado): libere o lote para sucatear o reprovado, ou registre a execução sem baixa informando o motivo.`;
const MSG_SUC_ABERTO = (id) => `Já existe o sucateamento SUC-${id} desta não conformidade aguardando aprovação no almoxarifado.`;
const MSG_ESTORNO = 'Sucateamento de material reprovado não pode ser estornado pelo livro — o material voltaria ao estoque disponível com a não conformidade dizendo que foi sucateado';
// Fase 5 (fix-round): a literal nova do lote sem saldo.
const MSG_LOTE_SEM_SALDO = (l, s, q) => `O lote ${l} tem ${s} KG em estoque, menos que o reprovado (${q}) — o reprovado já saiu do lote; registre a execução sem baixa informando o motivo`;
const MSG_JA_SUCATEADA ='O material desta inspeção já havia sido sucateado — a execução foi registrada sem mover saldo';

(async () => {
  console.log('\n=== Etapa 69 T7: sucatear o reprovado ponta a ponta (rotas) ===\n');
  const { app, db, setUser, close } = await createTestApp({ user: { ...ADMIN } });
  const API = '/api/almoxarifado';
  /** Cada chamada declara QUEM age — nenhum gesto herda o usuario do anterior. */
  const como = (u) => { setUser({ ...u }); return request(app); };
  const ok = (r, status, oque) => {
    assert.strictEqual(r.status, status, `${oque}: esperava ${status}, veio ${r.status} ${JSON.stringify(r.body)}`);
    return r.body;
  };

  // Fixtures fora do modulo: o fornecedor (tabela do core) e a chave de configuracao que liga a
  // inspecao de material critico (sem rota de escrita dedicada no harness).
  const forn = (await dbRun(db, "INSERT INTO fornecedores (razao_social, cnpj, status) VALUES ('Forn T7','69.697.690/0001-69','ativo')")).lastID;
  await dbRun(db, `INSERT INTO configuracoes_almoxarifado (chave, valor) VALUES ('inspecao_material_critico','1')
    ON CONFLICT(chave) DO UPDATE SET valor='1'`);

  const saldos = (id) => dbGet(db, `SELECT quantidade_atual, quantidade_bloqueada,
      quantidade_atual - COALESCE(quantidade_bloqueada,0) AS livre FROM materiais_almoxarifado WHERE id = ?`, [id]);
  const saldoLote = async (m, l) => Number((await dbGet(db, `SELECT COALESCE(SUM(quantidade),0) q
    FROM estoque_saldo_almoxarifado WHERE material_id = ? AND lote_id IS ?`, [m, l])).q);
  const saldoEm = async (m, loc) => Number((await dbGet(db, `SELECT COALESCE(SUM(quantidade),0) q
    FROM estoque_saldo_almoxarifado WHERE material_id = ? AND localizacao_id = ?`, [m, loc])).q);

  const novaLoc = async (tipo) => {
    const codigo = cod('L');
    const b = ok(await como(ADMIN).post(`${API}/localizacoes`).send({ codigo, tipo }), 201, `POST localizacao ${tipo}`);
    return b.id;
  };
  let familia = null;
  const novoMat = async ({ comLote, padrao }) => {
    if (!familia) familia = ok(await como(ADMIN).post(`${API}/familias`).send({ nome: `Fam T7 ${SUF}` }), 201, 'POST familia').id;
    const codigo = cod('M');
    const b = ok(await como(ALMOX1).post(`${API}/materiais`).send({
      codigo, nome: `Chapa critica ${codigo}`, unidade: 'KG', familia_id: familia, localizacao_padrao_id: padrao,
      material_critico: 1, controle_lote: comLote ? 1 : 0, controle_certificado: comLote ? 1 : 0,
    }), 201, 'POST material');
    return { id: b.id, codigo };
  };
  const ncsPendentes = async () => ok(await como(ADMIN).get(`${API}/nao-conformidades?execucao=PENDENTE&limite=500`), 200, 'fila NC').itens.map((n) => n.id);
  const cartaoReprovado = async () => {
    const c = ok(await como(ADMIN).get(`${API}/alertas/central`), 200, 'central');
    const cartao = c.alertas.find((a) => a.chave === 'MATERIAL_REPROVADO');
    assert.ok(cartao && !cartao.erro, `cartao MATERIAL_REPROVADO ausente ou com erro: ${JSON.stringify(cartao)}`);
    return cartao.linhas.map((l) => l.inspecao_id);
  };
  const executar = (ncId, body = {}) => como(COMPRAS).post(`${API}/nao-conformidades/${ncId}/executar`).send({ observacoes: 'coleta', ...body });
  const solicitar = (ncId, user = ALMOX1) => como(user).post(`${API}/nao-conformidades/${ncId}/solicitar-sucateamento`)
    .send({ justificativa: 'reprovado na inspecao, sem recuperacao', classificacao: 'aco carbono' });
  const perna = (sucId, qual, user) => como(user).post(`${API}/sucateamentos/${sucId}/aprovar-${qual}`).send({});

  /**
   * O caminho REAL do recebimento ate a NC decidida: material pela rota, recebimento, as duas
   * transicoes de conferencia (o "Finalizar Conferencia" da tela), entrada em `entradaEm`,
   * inspecao reprovando `reprovada` de 10, a NC automatica achada pela listagem e decidida.
   */
  async function ateNcDecidida({ comLote = true, reprovada = 3, entradaEm, decisao = 'SUCATEAR' }) {
    const mat = await novoMat({ comLote, padrao: entradaEm });
    const loteCod = comLote ? cod('LOTE') : undefined;
    const rec = ok(await como(ALMOX1).post(`${API}/recebimentos`).send({
      tipo_recebimento: 'NOTA_FISCAL', nota_fiscal: cod('NF'), fornecedor_id: forn, fornecedor_nome: 'Forn T7',
      itens: [{ material_id: mat.id, quantidade: 10, ...(comLote ? { lote: loteCod } : {}) }],
    }), 201, 'POST recebimento');
    ok(await como(ALMOX1).post(`${API}/recebimentos/${rec.id}/workflow`).send({ acao: 'iniciar_conferencia' }), 200, 'iniciar_conferencia');
    const fin = ok(await como(ALMOX1).post(`${API}/recebimentos/${rec.id}/workflow`).send({ acao: 'finalizar_conferencia' }), 200, 'finalizar_conferencia');
    assert.strictEqual(fin.status, 'CONFERIDO_ALMOX');
    ok(await como(ALMOX1).post(`${API}/recebimentos/${rec.id}/aprovar`).send({ localizacao_id: entradaEm }), 200, 'aprovar recebimento');
    const detalhe = ok(await como(ALMOX1).get(`${API}/recebimentos/${rec.id}`), 200, 'GET recebimento');
    const item = detalhe.itens[0];
    const insp = ok(await como(QUALIDADE).post(`${API}/recebimentos/itens/${item.id}/inspecionar`)
      .send({ quantidade_aprovada: 10 - reprovada, quantidade_reprovada: reprovada, dano_fisico: 1 }), 201, 'inspecionar');
    const lista = ok(await como(QUALIDADE).get(`${API}/nao-conformidades?origem=INSPECAO&limite=500`), 200, 'lista NC');
    const doc = lista.itens.find((n) => n.referencia_id === insp.id);
    assert.ok(doc, 'a NC automatica nao nasceu da reprovacao');
    ok(await como(QUALIDADE).post(`${API}/nao-conformidades/${doc.id}/decidir`)
      .send({ decisao, justificativa: 'trinca, sem recuperacao' }), 200, `decidir ${decisao}`);
    return {
      materialId: mat.id, materialCodigo: mat.codigo, inspecaoId: insp.id, ncId: doc.id, numero: doc.numero,
      loteId: item.lote_id || null, loteCod, recebimentoId: rec.id,
    };
  }

  const E = await novaLoc('Prateleira');
  let t; // o fio principal (1)-(7)

  await test('(1) recebe 10 do critico com lote+certificado, Finalizar Conferencia, reprova 3, NC SUCATEAR: nada move', async () => {
    t = await ateNcDecidida({ entradaEm: E });
    assert.ok(t.loteId, 'o item do recebimento nao ganhou lote');
    const lote = await dbGet(db, 'SELECT status FROM lotes_almoxarifado WHERE id = ?', [t.loteId]);
    assert.strictEqual(lote.status, 'BLOQUEADO', 'o lote do critico sem certificado nao nasceu BLOQUEADO — o cenario nao e o tipico');
    const s = await saldos(t.materialId);
    assert.deepStrictEqual([s.quantidade_atual, s.quantidade_bloqueada], [10, 3], JSON.stringify(s));
    assert.strictEqual(await saldoEm(t.materialId, E), 10, 'a entrada nao foi para o endereco E');
    const doc = ok(await como(ADMIN).get(`${API}/nao-conformidades/${t.ncId}`), 200, 'GET NC');
    assert.strictEqual(doc.status, 'DECIDIDA');
    assert.strictEqual(doc.execucao_estado, 'PENDENTE');
    assert.ok((await ncsPendentes()).includes(t.ncId), 'a NC decidida nao esta na fila de pendentes');
    assert.ok((await cartaoReprovado()).includes(t.inspecaoId), 'o cartao Material reprovado nao lista a inspecao');
  });

  await test('(2) /executar com o lote BLOQUEADO: 409 literal; a NC continua PENDENTE', async () => {
    assert.ok(t, 'depende do (1)');
    const r = await executar(t.ncId);
    assert.strictEqual(r.status, 409, JSON.stringify(r.body));
    assert.strictEqual(r.body.error, MSG_LOTE_BLOQUEADO(t.loteCod));
    assert.ok((await ncsPendentes()).includes(t.ncId), 'o 409 tirou a NC da fila');
    const s = await saldos(t.materialId);
    assert.deepStrictEqual([s.quantidade_atual, s.quantidade_bloqueada], [10, 3]);
  });

  await test('(3) lote ATIVO pela QUALIDADE; /executar agora recusa porque o sucateamento e viavel (literal)', async () => {
    assert.ok(t, 'depende do (1)');
    ok(await como(QUALIDADE).put(`${API}/lotes/${t.loteId}/status`).send({ status: 'ATIVO', justificativa: 'certificado conferido' }), 200, 'lote ATIVO');
    const r = await executar(t.ncId);
    assert.strictEqual(r.status, 409, JSON.stringify(r.body));
    assert.strictEqual(r.body.error, MSG_PEDE_SUCATEAMENTO);
    const doc = ok(await como(ADMIN).get(`${API}/nao-conformidades/${t.ncId}`), 200, 'GET NC');
    assert.strictEqual(doc.execucao_estado, 'PENDENTE', 'o /executar fechou a NC calado');
  });

  await test('(4) ALMOX1 solicita: 201 derivado, nada move, fila com NC-...; /executar recusa com o SUC aberto', async () => {
    assert.ok(t, 'depende do (3)');
    const b = ok(await solicitar(t.ncId), 201, 'solicitar-sucateamento');
    assert.strictEqual(b.quantidade, 3, 'a quantidade nao e a reprovada inteira');
    assert.strictEqual(b.material_id, t.materialId);
    assert.strictEqual(b.lote_id, t.loteId);
    assert.strictEqual(b.nao_conformidade_id, t.ncId);
    assert.strictEqual(b.status, 'SOLICITADO');
    t.sucId = b.id;
    const s = await saldos(t.materialId);
    assert.deepStrictEqual([s.quantidade_atual, s.quantidade_bloqueada], [10, 3], 'a solicitacao moveu saldo');
    const fila = ok(await como(ALMOX2).get(`${API}/sucateamentos`), 200, 'GET sucateamentos');
    const linha = fila.find((x) => x.id === t.sucId);
    assert.ok(linha, 'o sucateamento nao aparece na fila');
    assert.strictEqual(linha.nao_conformidade_numero, t.numero, 'a fila nao mostra o NC-... de origem');
    const r = await executar(t.ncId);
    assert.strictEqual(r.status, 409, JSON.stringify(r.body));
    assert.strictEqual(r.body.error, MSG_SUC_ABERTO(t.sucId));
  });

  await test('(5) GESTOR assina a gestao (nada move); ALMOX2 fecha: baixa do bloqueado, lote, livro, NC, fila, cartao, relatorio', async () => {
    assert.ok(t && t.sucId, 'depende do (4)');
    const loteAntes = await saldoLote(t.materialId, t.loteId);
    const g = ok(await perna(t.sucId, 'gestao', GESTOR), 200, 'perna gestao');
    assert.strictEqual(g.baixa_emitida, false);
    const s0 = await saldos(t.materialId);
    assert.deepStrictEqual([s0.quantidade_atual, s0.quantidade_bloqueada], [10, 3], 'a primeira perna moveu');
    assert.ok((await cartaoReprovado()).includes(t.inspecaoId), 'antes da 2a perna a inspecao ja saiu do cartao');

    const a = ok(await perna(t.sucId, 'almoxarifado', ALMOX2), 200, 'perna almoxarifado');
    assert.strictEqual(a.baixa_emitida, true);
    const s = await saldos(t.materialId);
    assert.strictEqual(s.quantidade_bloqueada, 0, 'o reprovado continua bloqueado');
    assert.strictEqual(s.quantidade_atual, 7, 'fisico');
    assert.strictEqual(s.livre, 7, 'o APROVADO foi tocado');
    assert.strictEqual(await saldoLote(t.materialId, t.loteId), loteAntes - 3, 'a linha do lote nao foi debitada');
    assert.strictEqual(await saldoEm(t.materialId, E), 7, 'a baixa nao saiu do endereco de entrada');

    const movs = ok(await como(ADMIN).get(`${API}/movimentacoes?material_id=${t.materialId}&tipo=SUCATA`), 200, 'GET movimentacoes');
    assert.strictEqual(movs.length, 1, `livro: ${JSON.stringify(movs)}`);
    const m = movs[0];
    t.movId = m.id;
    assert.strictEqual(m.id, a.movimentacao_sucata_id);
    assert.strictEqual(Number(m.quantidade), 3);
    assert.strictEqual(m.motivo, 'Sucateamento de material reprovado');
    assert.strictEqual(m.documento_vinculado, t.numero);
    assert.strictEqual(m.referencia, `SUC-${t.sucId}`);
    assert.strictEqual(m.lote_id, t.loteId);
    assert.strictEqual(m.localizacao_origem_id, E);

    const doc = ok(await como(ADMIN).get(`${API}/nao-conformidades/${t.ncId}`), 200, 'GET NC');
    assert.strictEqual(doc.execucao_estado, 'EXECUTADA');
    assert.strictEqual(doc.execucao_movimentacao_id, m.id);
    assert.strictEqual(doc.execucao_por_id, ALMOX2.id, 'executado por quem fechou a segunda perna');
    assert.ok(!(await ncsPendentes()).includes(t.ncId), 'a NC continua na fila de pendentes');
    assert.ok(!(await cartaoReprovado()).includes(t.inspecaoId), 'a inspecao sucateada continua no cartao Material reprovado');

    const rel = ok(await como(ADMIN).get(`${API}/relatorios/sucata-financeiro`), 200, 'relatorio sucata-financeiro');
    const linhaRel = rel.movimentacoes.find((x) => x.id === m.id);
    assert.ok(linhaRel, 'o relatorio de sucata nao conta a baixa do reprovado');
    assert.strictEqual(Number(linhaRel.quantidade), 3);
    assert.strictEqual(linhaRel.referencia, `SUC-${t.sucId}`);
    assert.strictEqual(linhaRel.classificacao, 'aco carbono', 'o relatorio nao achou o sucateamento da linha');
  });

  await test('(6) estorno pelo livro: 400 literal, nada muda (nem cancelado)', async () => {
    assert.ok(t && t.movId, 'depende do (5)');
    const r = await como(ADMIN).post(`${API}/movimentacoes/${t.movId}/cancelar`).send({ motivo: 'engano de digitacao' });
    assert.strictEqual(r.status, 400, JSON.stringify(r.body));
    assert.strictEqual(r.body.error, MSG_ESTORNO);
    const s = await saldos(t.materialId);
    assert.deepStrictEqual([s.quantidade_atual, s.quantidade_bloqueada], [7, 0], 'o estorno mexeu no saldo');
    const mov = await dbGet(db, 'SELECT cancelado FROM movimentacoes_almoxarifado WHERE id = ?', [t.movId]);
    assert.strictEqual(Number(mov.cancelado), 0, 'a SUCATA ficou marcada cancelada');
  });

  await test('(7) segunda NC (DEVOLVER) da mesma inspecao: SEM_SALDO "ja sucateado", o bloqueio de outra origem fica', async () => {
    assert.ok(t && t.movId, 'depende do (5)');
    // Outra origem de bloqueio no mesmo material (pool agregado): a devolucao NAO pode consumi-la.
    ok(await como(ADMIN).post(`${API}/materiais/${t.materialId}/bloquear`).send({ quantidade: 5, justificativa: 'avaria no manuseio' }), 200, 'bloquear 5');
    // A segunda NC automatica da MESMA inspecao — sem rota que a crie (a automatica nasce uma por
    // reprovacao); fixture de NC automatica, como o plano manda.
    const dev = await dbRun(db, `INSERT INTO nao_conformidades_almoxarifado (numero, origem, referencia_tipo, referencia_id,
      tipo, status, material_id, recebimento_id, aberto_automaticamente, decisao, justificativa, decidido_em, execucao_estado)
      VALUES (?, 'INSPECAO', 'INSPECAO', ?, 'MATERIAL_INCORRETO', 'DECIDIDA', ?, ?, 1, 'DEVOLVER', 'x', CURRENT_TIMESTAMP, 'PENDENTE')`,
    [cod('NC-T7X'), t.inspecaoId, t.materialId, t.recebimentoId]);
    const b = ok(await executar(dev.lastID), 200, 'executar DEVOLVER');
    assert.strictEqual(b.execucao.efeito, 'SEM_SALDO', JSON.stringify(b.execucao));
    assert.strictEqual(b.execucao.mensagem, MSG_JA_SUCATEADA);
    const s = await saldos(t.materialId);
    assert.strictEqual(s.quantidade_atual, 7, 'a devolucao baixou de novo o que ja foi para a cacamba');
    assert.strictEqual(s.quantidade_bloqueada, 5, 'a devolucao consumiu o bloqueio de outra origem');
    const devs = await dbGet(db, "SELECT COUNT(*) n FROM movimentacoes_almoxarifado WHERE material_id = ? AND tipo = 'DEVOLUCAO_FORNECEDOR'", [t.materialId]);
    assert.strictEqual(devs.n, 0, 'o livro ganhou uma devolucao');
  });

  await test('(8) a mesma pessoa nas duas pernas: 403 literal da barreira 3, nada move', async () => {
    const c = await ateNcDecidida({ comLote: false, entradaEm: E });
    const sucId = ok(await solicitar(c.ncId), 201, 'solicitar').id;
    ok(await perna(sucId, 'gestao', ADMIN2), 200, 'ADMIN2 gestao');
    const dupla = await perna(sucId, 'almoxarifado', ADMIN2);
    assert.strictEqual(dupla.status, 403, JSON.stringify(dupla.body));
    assert.ok(/^Voce ja assinou a perna .* deste sucateamento e nao pode assinar tambem a perna .*mesma pessoa nas duas pernas/.test(dupla.body.error), dupla.body.error);
    const s = await saldos(c.materialId);
    assert.deepStrictEqual([s.quantidade_atual, s.quantidade_bloqueada], [10, 3], 'a dupla assinatura recusada moveu saldo');
    // E a outra pessoa fecha.
    ok(await perna(sucId, 'almoxarifado', ALMOX2), 200, 'ALMOX2 almoxarifado');
    assert.strictEqual((await saldos(c.materialId)).quantidade_bloqueada, 0);
  });

  await test('(9) sonda B: lote + reprovado transferido para a AREA DE SUCATA -> a baixa sai da area', async () => {
    const E2 = await novaLoc('Prateleira');
    const S = await novaLoc('Área de sucata');
    const c = await ateNcDecidida({ entradaEm: E2 });
    ok(await como(QUALIDADE).put(`${API}/lotes/${c.loteId}/status`).send({ status: 'ATIVO', justificativa: 'certificado conferido' }), 200, 'lote ATIVO');
    ok(await como(ALMOX1).post(`${API}/transferencias`).send({
      material_id: c.materialId, quantidade: 3, lote_id: c.loteId,
      localizacao_origem_id: E2, localizacao_destino_id: S, motivo: 'reprovado para a cacamba',
    }), 201, 'transferencia E2 -> S');
    assert.strictEqual(await saldoEm(c.materialId, S), 3);
    const sucId = ok(await solicitar(c.ncId), 201, 'solicitar').id;
    ok(await perna(sucId, 'almoxarifado', ALMOX2), 200, 'perna almoxarifado');
    const g = ok(await perna(sucId, 'gestao', GESTOR), 200, 'perna gestao');
    assert.strictEqual(g.baixa_emitida, true);
    const mov = await dbGet(db, 'SELECT localizacao_origem_id, lote_id FROM movimentacoes_almoxarifado WHERE id = ?', [g.movimentacao_sucata_id]);
    assert.strictEqual(mov.localizacao_origem_id, S, `a baixa saiu de ${mov.localizacao_origem_id}, nao da area de sucata ${S}`);
    assert.strictEqual(mov.lote_id, c.loteId);
    assert.strictEqual(await saldoEm(c.materialId, S), 0, 'o reprovado continua na area de sucata');
    assert.strictEqual(await saldoEm(c.materialId, E2), 7, 'a baixa tirou o aprovado da prateleira');
    const s = await saldos(c.materialId);
    assert.deepStrictEqual([s.quantidade_atual, s.quantidade_bloqueada], [7, 0]);
  });

  await test('(10) Surpresa 1 FIXADA (D12/B307): o sucateamento COMUM de 3 com reprovacao parcial baixa do DISPONIVEL', async () => {
    const c = await ateNcDecidida({ comLote: false, entradaEm: E });
    const comum = ok(await como(ALMOX1).post(`${API}/sucateamentos`).send({
      material_id: c.materialId, quantidade: 3, justificativa: `sucatear o reprovado da ${c.numero}`,
    }), 201, 'POST sucateamento comum');
    assert.strictEqual(comum.nao_conformidade_id, null);
    ok(await perna(comum.id, 'gestao', GESTOR), 200, 'gestao');
    ok(await perna(comum.id, 'almoxarifado', ALMOX2), 200, 'almoxarifado');
    const s = await saldos(c.materialId);
    // Comportamento DECLARADO, nao desejado: material APROVADO foi para a cacamba e o reprovado
    // continua bloqueado. O caminho certo e o "Solicitar sucateamento" da NC (provado no (5)). A
    // decisao de nao recusar o comum esta em D12 (letra B307) e a consulta A33 (b) acha os casos.
    assert.strictEqual(s.quantidade_atual, 7);
    assert.strictEqual(s.quantidade_bloqueada, 3, 'o comum passou a baixar do bloqueado — D12 mudou? atualize a decisao e este teste juntos');
    assert.strictEqual(s.livre, 4);
    const doc = ok(await como(ADMIN).get(`${API}/nao-conformidades/${c.ncId}`), 200, 'GET NC');
    assert.strictEqual(doc.execucao_estado, 'PENDENTE', 'o comum mexeu na NC');
    assert.ok((await ncsPendentes()).includes(c.ncId), 'o comum tirou a NC da fila');
  });

  // ── Fix-round da Fase 5 (achados 1 e 2 da revisao adversarial, sondas 69f) ──────────────────
  const stock = require('../../services/almoxarifado/stockService');

  await test('(11) Fase 5: o lote do reprovado ja sem saldo -> solicitar e /executar recusam ensinando; motivo_sem_baixa registra sem baixa', async () => {
    const E3 = await novaLoc('Prateleira');
    const c = await ateNcDecidida({ entradaEm: E3 });
    ok(await como(QUALIDADE).put(`${API}/lotes/${c.loteId}/status`).send({ status: 'ATIVO', justificativa: 'certificado conferido' }), 200, 'lote ATIVO');
    // Fixture (a sonda 69f-lote-beco): outro lote do mesmo material entra com 5, e uma SAIDA leva os
    // 10 do lote do reprovado. O agregado continua "viavel" (fisico 5 >= 3, bloqueado 3 >= 3), mas
    // o LOTE do reprovado esta zerado — o motor recusaria so na segunda assinatura.
    await stock.registrarMovimentacao(db, ADMIN, { material_id: c.materialId, tipo: 'ENTRADA', quantidade: 5, justificativa: 'outro lote', lote: cod('L0') });
    await stock.registrarMovimentacao(db, ADMIN, { material_id: c.materialId, tipo: 'SAIDA', quantidade: 10, justificativa: 'consumo', lote_id: c.loteId });
    assert.strictEqual(await saldoLote(c.materialId, c.loteId), 0, 'a fixture nao zerou o lote do reprovado');
    const s0 = await saldos(c.materialId);
    assert.deepStrictEqual([s0.quantidade_atual, s0.quantidade_bloqueada], [5, 3], JSON.stringify(s0));

    const r = await executar(c.ncId);
    assert.strictEqual(r.status, 409, JSON.stringify(r.body));
    assert.strictEqual(r.body.error, MSG_LOTE_SEM_SALDO(c.loteCod, 0, 3));
    const sol = await solicitar(c.ncId);
    assert.strictEqual(sol.status, 400, JSON.stringify(sol.body));
    assert.strictEqual(sol.body.error, MSG_LOTE_SEM_SALDO(c.loteCod, 0, 3));
    const nSuc = await dbGet(db, 'SELECT COUNT(*) n FROM sucateamentos_almoxarifado WHERE nao_conformidade_id = ?', [c.ncId]);
    assert.strictEqual(nSuc.n, 0, 'a solicitacao foi criada mesmo com o lote sem saldo — duas assinaturas gastas para o motor recusar');
    assert.ok((await ncsPendentes()).includes(c.ncId), 'as recusas tiraram a NC da fila');

    const ex = ok(await executar(c.ncId, { motivo_sem_baixa: 'o lote foi consumido antes do sucateamento' }), 200, '/executar com motivo_sem_baixa');
    assert.strictEqual(ex.execucao_estado, 'EXECUTADA', JSON.stringify(ex));
    assert.ok(!(await ncsPendentes()).includes(c.ncId), 'o registro sem baixa nao tirou a NC da fila');
    const s1 = await saldos(c.materialId);
    assert.deepStrictEqual([s1.quantidade_atual, s1.quantidade_bloqueada], [5, 3], 'o registro sem baixa moveu saldo');
  });

  await close();
  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed ? 1 : 0);
})();
