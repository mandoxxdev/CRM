/**
 * Etapa 70 (T1) — o aviso da nota que entrou no estoque, pelo SERVICO
 * (`receiptNotificationService.avisarEntradaConfirmada`), com a fila lida direto da tabela (nunca SMTP).
 *
 * A entrada e feita por `receiptService.darEntradaEstoque` + o status terminal escrito a mao: e o
 * estado que os ganchos da T2 encontram, sem passar por eles (o aviso aqui e chamado UMA vez pelo
 * teste — chamado pelo gancho tambem, a segunda chamada seria DUPLICADA e mascararia o cenario).
 *
 * Contrato (plano da Etapa 70, com a revisao da Fase 2): duas chaves — `notificar_recebimento_entrada`
 * (aviso da NOTA, nasce '0') e `notificar_recebimento_solicitante` (aviso a quem pediu, nasce '1');
 * lista `notificacoes_dest_recebimento` -> `notificacoes_dest_compras` -> `compras_notificar_emails`;
 * "quem esperava" por ITEM (pendente de separacao - reservado > 0, status em PODE_SEPARAR exceto
 * EM_SEPARACAO, requisicao ativa, material que entrou LIVRE nesta nota); link pelo modulo de origem.
 *
 * Executar: cd server && node tests/api/recebimentoAvisoEntrada.api.test.js
 */
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const request = require('supertest');
const { createTestApp } = require('../helpers/testApp');
const { dbRun, dbGet, dbAll } = require('../../services/almoxarifado/db');
const receiptService = require('../../services/almoxarifado/receiptService');
const aviso = require('../../services/almoxarifado/receiptNotificationService');

let passed = 0; let failed = 0;
function test(name, fn) {
  return fn().then(() => { passed++; console.log(`  ✓ ${name}`); })
    .catch((e) => { failed++; console.error(`  ✗ ${name}: ${e.message}`); });
}
const ADMIN = { id: 1, nome: 'Admin Aviso', role: 'admin', is_superadmin: 1, email: 'admin-aviso@x.com' };
const APP = 'http://crm.teste';

let seq = 0;

(async () => {
  const { app, db, close } = await createTestApp({ user: ADMIN });

  const setCfg = (chave, valor) => dbRun(db, `INSERT INTO configuracoes_almoxarifado (chave, valor) VALUES (?, ?)
    ON CONFLICT(chave) DO UPDATE SET valor = excluded.valor`, [chave, valor]);
  const cfg = async (chave) => (await dbGet(db, 'SELECT valor FROM configuracoes_almoxarifado WHERE chave = ?', [chave]))?.valor;

  async function material({ critico = 0, unidade = 'UN' } = {}) {
    seq += 1;
    return (await dbRun(db, `INSERT INTO materiais_almoxarifado (codigo, nome, unidade, quantidade_atual, ativo, material_critico)
      VALUES (?,?,?,0,1,?)`, [`AV70-${seq}`, `Material aviso ${seq}`, unidade, critico])).lastID;
  }
  const codigo = async (id) => (await dbGet(db, 'SELECT codigo FROM materiais_almoxarifado WHERE id = ?', [id])).codigo;

  /** Nota com itens, ja com a entrada feita e status PROCESSADO. `entrar: false` deixa o item sem entrada. */
  async function notaQueEntrou(itens, extra = {}) {
    seq += 1;
    const r = (await dbRun(db, `INSERT INTO recebimentos_material_almoxarifado
      (numero, status, nota_fiscal, fornecedor_nome, pedido_compra_numero, data_emissao_nf, data_entrada_nf, valor_total_nota)
      VALUES (?, 'EM_ENTRADA_NF', ?, ?, ?, '2026-08-01', '2026-08-02', 100)`,
    [`REC-AV70-${seq}`, extra.nf === undefined ? `NF-AV70-${seq}` : extra.nf, 'Fornecedor Aviso', extra.pedido ?? null])).lastID;
    for (const it of itens) {
      await dbRun(db, `INSERT INTO recebimentos_material_itens_almoxarifado
        (recebimento_id, material_id, quantidade_esperada, quantidade_recebida) VALUES (?,?,?,?)`,
      [r, it.material_id, it.esperada ?? it.qtd, it.qtd]);
    }
    const rec = await dbGet(db, 'SELECT * FROM recebimentos_material_almoxarifado WHERE id = ?', [r]);
    await receiptService.darEntradaEstoque(db, ADMIN, rec, r, {});
    for (const it of itens.filter((x) => x.entrar === false)) {
      await dbRun(db, `UPDATE recebimentos_material_itens_almoxarifado SET entrada_estoque_em = NULL
        WHERE recebimento_id = ? AND material_id = ?`, [r, it.material_id]);
    }
    await dbRun(db, "UPDATE recebimentos_material_almoxarifado SET status = 'PROCESSADO' WHERE id = ?", [r]);
    return { id: r, numero: rec.numero, nf: rec.nota_fiscal };
  }

  async function requisicao({ status = 'AGUARDANDO_COMPRA', solicitante = 501, nome = 'Fulano', ativo = 1, modulo = null, itens }) {
    seq += 1;
    const numero = `REQ-AV70-${seq}`;
    const id = (await dbRun(db, `INSERT INTO requisicoes_almoxarifado
      (numero, solicitante_id, solicitante_nome, status, modulo_origem, ativo) VALUES (?,?,?,?,?,?)`,
    [numero, solicitante, nome, status, modulo, ativo])).lastID;
    const itemIds = [];
    for (const it of itens) {
      itemIds.push((await dbRun(db, `INSERT INTO itens_requisicao_almoxarifado
        (requisicao_id, material_id, quantidade_solicitada, quantidade_separada) VALUES (?,?,?,?)`,
      [id, it.material_id, it.qtd, it.separada ?? 0])).lastID);
    }
    return { id, numero, itemIds };
  }

  const fila = (recId) => dbAll(db, `SELECT * FROM fila_notificacoes_almoxarifado
    WHERE evento LIKE 'RECEBIMENTO_ENTRADA%' AND json_extract(payload, '$.recebimento_id') = ? ORDER BY id`, [recId]);
  const filaNota = async (recId) => (await fila(recId)).filter((l) => l.evento === 'RECEBIMENTO_ENTRADA');
  const filaReq = async (recId) => (await fila(recId)).filter((l) => l.evento === 'RECEBIMENTO_ENTRADA_REQUISITANTE');

  await setCfg('alertas_app_url', APP);
  // A lista do canal POR MOVIMENTACAO tem gente: o aviso da nota NUNCA pode usa-la (sabotagem a).
  await setCfg('notificacoes_dest_entradas', 'almox-movimentacao@x.com');

  // ── literais (funcoes puras) ─────────────────────────────────────────────────────────────────
  await test('montarAvisoNota: assunto e corpo literais, com NF, pedido, retido, destino e requisicoes', async () => {
    const r = aviso.montarAvisoNota({
      numero: 'REC-1', nota_fiscal: '123', fornecedor_nome: 'Acos SA', fornecedor_cnpj: '1', pedido_compra_numero: 'PC-9',
      data_hora: '01/10/2026, 10:00:00', usuario: 'Maria',
      itens: [
        { codigo: 'M1', nome: 'Chapa', quantidade: 5, unidade: 'UN', localizacao: 'A-01', retido: false },
        { codigo: 'M2', nome: 'Eletrodo', quantidade: 0.1 + 0.2, unidade: 'KG', localizacao: null, retido: true },
      ],
      requisicoes: [{ numero: 'REQ-7', solicitante_nome: 'Fulano' }, { numero: 'REQ-8', solicitante_nome: 'Ciclano' }],
      link: 'http://x/almoxarifado/recebimentos',
    });
    assert.strictEqual(r.assunto, '[Almoxarifado] Entrada confirmada — REC-1 — NF 123');
    assert.strictEqual(r.corpo_texto, [
      'A nota deu entrada no estoque.',
      'Recebimento: REC-1',
      'Nota fiscal: 123',
      'Fornecedor: Acos SA',
      'Pedido de compra: PC-9',
      'Data/hora: 01/10/2026, 10:00:00',
      'Usuário: Maria',
      'Itens que entraram:',
      '- M1 — Chapa: 5 UN em A-01 — disponível',
      '- M2 — Eletrodo: 0.3 KG — retido para inspeção',
      'Requisições que aguardavam estes materiais: REQ-7 (Fulano), REQ-8 (Ciclano)',
      'Link: http://x/almoxarifado/recebimentos',
    ].join('\n'));
    const semDados = aviso.montarAvisoNota({ numero: 'REC-2', data_hora: 'h', usuario: 'u', itens: [], requisicoes: [], link: 'l' });
    assert.strictEqual(semDados.assunto, '[Almoxarifado] Entrada confirmada — REC-2');
    assert.ok(semDados.corpo_texto.includes('Nota fiscal: não informada\nFornecedor: não informado\nData/hora: h'));
    assert.ok(!semDados.corpo_texto.includes('Pedido de compra'));
    assert.ok(!semDados.corpo_texto.includes('Requisições que aguardavam'));
  });

  await test('montarAvisoRequisitante: assunto e corpo literais (numero sem prefixo duplicado)', async () => {
    const r = aviso.montarAvisoRequisitante({
      numero_requisicao: 'REQ-20261001-0001', status: 'AGUARDANDO_COMPRA', numero_recebimento: 'REC-1',
      materiais: [{ codigo: 'M1', nome: 'Chapa', unidade: 'UN', entrou: 10, pendente: 4 }],
      link: 'http://x/fabrica/requisicoes-material',
    });
    assert.strictEqual(r.assunto, '[Almoxarifado] Chegou material da sua requisição REQ-20261001-0001');
    assert.strictEqual(r.corpo_texto, [
      'Chegou ao estoque material que a sua requisição aguardava.',
      'Requisição: REQ-20261001-0001',
      'Situação da requisição: Aguardando compra',
      'Recebimento: REC-1',
      'Materiais que chegaram:',
      '- M1 — Chapa: entrou 10 UN (pendente na requisição: 4 UN)',
      'O material ainda não está reservado para a sua requisição — a separação é feita pelo almoxarifado.',
      'Link: http://x/fabrica/requisicoes-material',
    ].join('\n'));
  });

  // Etapa 74 (T2, D7/B373): o aviso conta a reserva da chegada. Os dois testes da 70 acima e o de
  // RN-08 positiva continuam sem edicao: sao o caso L0 (nada reservado nesta nota).
  const baseReq = { numero_requisicao: 'REQ-74', status: 'TOTALMENTE_RESERVADA', numero_recebimento: 'REC-74', link: 'http://x/l' };
  await test('[Etapa 74] L1: todo material listado com reserva -> a linha cita o reservado e a frase L1', async () => {
    const r = aviso.montarAvisoRequisitante({ ...baseReq,
      materiais: [{ codigo: 'M1', nome: 'Chapa', unidade: 'PC', entrou: 4, pendente: 3, reservado: 3 }] });
    assert.deepStrictEqual(r.linhas.slice(4), [
      'Materiais que chegaram:',
      '- M1 — Chapa: entrou 4 PC (pendente na requisição: 3 PC; reservado para a sua requisição: 3 PC)',
      'O material indicado como reservado fica guardado para a sua requisição — outra requisição não pode levá-lo. A separação é feita pelo almoxarifado.',
      'Link: http://x/l',
    ]);
    assert.strictEqual(r.linhas[2], 'Situação da requisição: Totalmente reservada');
    assert.strictEqual(aviso.FRASE_TUDO_RESERVADO, r.linhas[6]);
  });

  await test('[Etapa 74] L2: um material com reserva e outro sem -> so o reservado cita a reserva, frase L2', async () => {
    const r = aviso.montarAvisoRequisitante({ ...baseReq, status: 'PARCIALMENTE_RESERVADA',
      materiais: [{ codigo: 'M1', nome: 'Chapa', unidade: 'PC', entrou: 4, pendente: 6, reservado: 1 },
        { codigo: 'M2', nome: 'Tubo', unidade: 'UN', entrou: 2, pendente: 5, reservado: 0 }] });
    assert.deepStrictEqual(r.linhas.slice(5, 8), [
      '- M1 — Chapa: entrou 4 PC (pendente na requisição: 6 PC; reservado para a sua requisição: 1 PC)',
      '- M2 — Tubo: entrou 2 UN (pendente na requisição: 5 UN)',
      'Só o material indicado como reservado fica guardado para a sua requisição; o restante ainda não está reservado — a separação é feita pelo almoxarifado.',
    ]);
    assert.strictEqual(aviso.FRASE_PARTE_RESERVADA, r.linhas[7]);
  });

  await test('[Etapa 74] L0: nenhum reservado (reservado 0 ou ausente) -> a linha e a frase da Etapa 70, sem edicao', async () => {
    const r = aviso.montarAvisoRequisitante({ ...baseReq, status: 'AGUARDANDO_ESTOQUE',
      materiais: [{ codigo: 'M1', nome: 'Chapa', unidade: 'PC', entrou: 4, pendente: 6, reservado: 0 },
        { codigo: 'M2', nome: 'Tubo', unidade: 'UN', entrou: 2, pendente: 5 }] });
    assert.deepStrictEqual(r.linhas.slice(5, 8), [
      '- M1 — Chapa: entrou 4 PC (pendente na requisição: 6 PC)',
      '- M2 — Tubo: entrou 2 UN (pendente na requisição: 5 UN)',
      'O material ainda não está reservado para a sua requisição — a separação é feita pelo almoxarifado.',
    ]);
    assert.strictEqual(aviso.FRASE_SEM_RESERVA, r.linhas[7]);
  });

  await test('o mapa de link espelha o basePath de requisicoesMaterialConfig.js (fonte unica, por teste)', async () => {
    const src = fs.readFileSync(path.join(__dirname, '../../../client/src/config/requisicoesMaterialConfig.js'), 'utf8');
    const pares = {};
    const re = /moduloOrigem:\s*'([a-z_]+)',\s*basePath:\s*'([^']+)'/g;
    let m;
    while ((m = re.exec(src))) pares[m[1]] = m[2];
    assert.ok(Object.keys(pares).length >= 10, `a regua achou ${Object.keys(pares).length} modulos — regex quebrada?`);
    assert.deepStrictEqual(aviso.BASE_PATH_POR_MODULO, pares);
    assert.strictEqual(aviso.caminhoRequisicoesDoModulo('operacional'), '/fabrica/requisicoes-material');
    assert.strictEqual(aviso.caminhoRequisicoesDoModulo(null), '/almoxarifado/requisicoes');
    assert.strictEqual(aviso.caminhoRequisicoesDoModulo('inexistente'), '/almoxarifado/requisicoes');
  });

  // ── configuracao ─────────────────────────────────────────────────────────────────────────────
  await test('chaves semeadas com os defaults da Fase 2: entrada 0, solicitante 1, lista vazia', async () => {
    assert.strictEqual(await cfg('notificar_recebimento_entrada'), '0');
    assert.strictEqual(await cfg('notificar_recebimento_solicitante'), '1');
    assert.strictEqual(await cfg('notificacoes_dest_recebimento'), '');
  });

  await test('sem a tabela usuarios (harness) o requisitante cai em SEM_DESTINATARIO sem derrubar o aviso da nota', async () => {
    const existe = await dbGet(db, "SELECT name FROM sqlite_master WHERE type='table' AND name='usuarios'");
    assert.strictEqual(existe, undefined, 'este cenario precisa rodar ANTES de criar usuarios');
    await setCfg('notificar_recebimento_entrada', '1');
    await setCfg('compras_notificar_emails', 'compras@x.com');
    const m = await material();
    const rq = await requisicao({ itens: [{ material_id: m, qtd: 2 }] });
    const n = await notaQueEntrou([{ material_id: m, qtd: 2 }]);
    const res = await aviso.avisarEntradaConfirmada(db, ADMIN, n.id);
    assert.strictEqual(res.nota.enfileirada, true);
    assert.deepStrictEqual(res.requisitantes, [{ requisicao_id: rq.id, enfileirada: false, motivo: 'SEM_DESTINATARIO' }]);
    assert.strictEqual((await filaNota(n.id)).length, 1);
    await setCfg('notificar_recebimento_entrada', '0');
    await setCfg('compras_notificar_emails', '');
  });

  await dbRun(db, 'CREATE TABLE IF NOT EXISTS usuarios (id INTEGER PRIMARY KEY, nome TEXT, email TEXT, ativo INTEGER DEFAULT 1)');
  for (const u of [[501, 'Fulano', 'fulano@x.com', 1], [502, 'Ciclano', 'ciclano@x.com', 1], [503, 'Inativo', 'inativo@x.com', 0],
    [504, 'Sem Email', '  ', 1]]) {
    await dbRun(db, 'INSERT OR REPLACE INTO usuarios (id, nome, email, ativo) VALUES (?,?,?,?)', u);
  }

  await test('defaults: o aviso da nota sai DESLIGADO e o do solicitante sai', async () => {
    await setCfg('compras_notificar_emails', 'compras@x.com');
    const m = await material();
    const rq = await requisicao({ itens: [{ material_id: m, qtd: 3 }] });
    const n = await notaQueEntrou([{ material_id: m, qtd: 3 }]);
    const res = await aviso.avisarEntradaConfirmada(db, ADMIN, n.id);
    assert.deepStrictEqual(res.nota, { enfileirada: false, motivo: 'DESLIGADO' });
    assert.strictEqual(res.requisitantes.length, 1);
    assert.strictEqual(res.requisitantes[0].requisicao_id, rq.id);
    assert.strictEqual((await filaNota(n.id)).length, 0);
    const linhas = await filaReq(n.id);
    assert.strictEqual(linhas.length, 1);
    assert.deepStrictEqual(JSON.parse(linhas[0].destinatarios), ['fulano@x.com']);
    await setCfg('compras_notificar_emails', '');
  });

  await test('RN-07: as duas chaves em 0 -> {desligado} e nada na fila; PUT recusa valor fora de 0/1 nas duas', async () => {
    await setCfg('notificar_recebimento_solicitante', '0');
    await setCfg('compras_notificar_emails', 'compras@x.com');
    const m = await material();
    await requisicao({ itens: [{ material_id: m, qtd: 1 }] });
    const n = await notaQueEntrou([{ material_id: m, qtd: 1 }]);
    assert.deepStrictEqual(await aviso.avisarEntradaConfirmada(db, ADMIN, n.id), { desligado: true });
    assert.strictEqual((await fila(n.id)).length, 0);
    await setCfg('notificar_recebimento_solicitante', '1');
    await setCfg('compras_notificar_emails', '');
    for (const chave of ['notificar_recebimento_entrada', 'notificar_recebimento_solicitante']) {
      const ruim = await request(app).put('/api/almoxarifado/configuracoes').send({ [chave]: 'talvez' });
      assert.strictEqual(ruim.status, 400, JSON.stringify(ruim.body));
      assert.strictEqual(ruim.body.error, `Configuração "${chave}" deve ser 0 ou 1`);
    }
    const bom = await request(app).put('/api/almoxarifado/configuracoes')
      .send({ notificar_recebimento_entrada: '1', notificar_recebimento_solicitante: '1', notificacoes_dest_recebimento: 'a@x.com' });
    assert.strictEqual(bom.status, 200, JSON.stringify(bom.body));
    assert.strictEqual(await cfg('notificar_recebimento_entrada'), '1');
    assert.strictEqual(await cfg('notificacoes_dest_recebimento'), 'a@x.com');
    await setCfg('notificar_recebimento_entrada', '0');
    await setCfg('notificacoes_dest_recebimento', '');
  });

  // Daqui em diante o aviso da nota esta LIGADO.
  await setCfg('notificar_recebimento_entrada', '1');

  await test('RN-06: um nivel por vez — propria -> compras -> compras_notificar_emails -> SEM_DESTINATARIO (e o requisitante sai)', async () => {
    await setCfg('alertas_estoque_notificar_email', '0'); // o toggle de alertas NAO governa este aviso
    const casos = [
      [{ notificacoes_dest_recebimento: 'rec1@x.com, rec2@x.com', notificacoes_dest_compras: 'dc@x.com', compras_notificar_emails: 'ce@x.com' }, ['rec1@x.com', 'rec2@x.com']],
      [{ notificacoes_dest_recebimento: '', notificacoes_dest_compras: '["dc@x.com"]', compras_notificar_emails: 'ce@x.com' }, ['dc@x.com']],
      [{ notificacoes_dest_recebimento: '', notificacoes_dest_compras: '', compras_notificar_emails: 'ce@x.com' }, ['ce@x.com']],
    ];
    for (const [configs, esperado] of casos) {
      for (const [k, v] of Object.entries(configs)) await setCfg(k, v);
      const m = await material();
      const n = await notaQueEntrou([{ material_id: m, qtd: 1 }]);
      const res = await aviso.avisarEntradaConfirmada(db, ADMIN, n.id);
      assert.strictEqual(res.nota.enfileirada, true, JSON.stringify(configs));
      const [linha] = await filaNota(n.id);
      assert.deepStrictEqual(JSON.parse(linha.destinatarios), esperado, JSON.stringify(configs));
    }
    for (const k of ['notificacoes_dest_recebimento', 'notificacoes_dest_compras', 'compras_notificar_emails']) await setCfg(k, '');
    const m = await material();
    await requisicao({ itens: [{ material_id: m, qtd: 1 }] });
    const n = await notaQueEntrou([{ material_id: m, qtd: 1 }]);
    const res = await aviso.avisarEntradaConfirmada(db, ADMIN, n.id);
    assert.deepStrictEqual(res.nota, { enfileirada: false, motivo: 'SEM_DESTINATARIO' });
    assert.strictEqual((await filaNota(n.id)).length, 0);
    assert.strictEqual((await filaReq(n.id)).length, 1, 'sem lista de Compras, o aviso ao requisitante continua');
    await setCfg('alertas_estoque_notificar_email', '1');
  });

  await setCfg('notificacoes_dest_recebimento', 'compras@x.com');

  await test('RN-01 conteudo: uma linha por nota, corpo/payload do contrato, crítico "retido para inspeção"', async () => {
    const comum = await material();
    const critico = await material({ critico: 1, unidade: 'KG' });
    const rq = await requisicao({ nome: 'Fulano', itens: [{ material_id: comum, qtd: 4 }] });
    const n = await notaQueEntrou([{ material_id: comum, qtd: 5 }, { material_id: critico, qtd: 3 }], { pedido: 'PC-AV70' });
    await aviso.avisarEntradaConfirmada(db, ADMIN, n.id);
    const linhas = await filaNota(n.id);
    assert.strictEqual(linhas.length, 1);
    const l = linhas[0];
    assert.strictEqual(l.assunto, `[Almoxarifado] Entrada confirmada — ${n.numero} — NF ${n.nf}`);
    const c = l.corpo_texto;
    assert.ok(c.startsWith(`A nota deu entrada no estoque.\nRecebimento: ${n.numero}\nNota fiscal: ${n.nf}\nFornecedor: Fornecedor Aviso\nPedido de compra: PC-AV70\nData/hora: `), c);
    assert.ok(c.includes('\nUsuário: Admin Aviso\nItens que entraram:\n'), c);
    assert.ok(new RegExp(`- ${await codigo(comum)} — [^\\n]*: 5 UN( em [^\\n]*)? — disponível`).test(c), c);
    assert.ok(new RegExp(`- ${await codigo(critico)} — [^\\n]*: 3 KG( em [^\\n]*)? — retido para inspeção`).test(c), c);
    assert.ok(c.includes(`Requisições que aguardavam estes materiais: ${rq.numero} (Fulano)`), c);
    assert.ok(c.endsWith(`\nLink: ${APP}/almoxarifado/recebimentos`), c);
    assert.deepStrictEqual(JSON.parse(l.payload), { recebimento_id: n.id, numero: n.numero, itens: 2, requisicoes: [rq.id] });
    assert.ok(l.corpo_html.startsWith('<div><p>A nota deu entrada no estoque.</p>'), l.corpo_html);
    assert.strictEqual(l.status, 'PENDENTE');
  });

  await test('RN-04: nada entrou -> {sem_entrada}; e (positiva) o item zerado/sem entrada fica fora da lista', async () => {
    const m = await material();
    const n = await notaQueEntrou([{ material_id: m, qtd: 0, esperada: 5 }]);
    assert.deepStrictEqual(await aviso.avisarEntradaConfirmada(db, ADMIN, n.id), { sem_entrada: true });
    assert.strictEqual((await fila(n.id)).length, 0);
    const zero = await material(); const bom = await material(); const naoEntrou = await material();
    const n2 = await notaQueEntrou([{ material_id: zero, qtd: 0, esperada: 5 }, { material_id: bom, qtd: 2 },
      { material_id: naoEntrou, qtd: 7, entrar: false }]);
    await aviso.avisarEntradaConfirmada(db, ADMIN, n2.id);
    const [l] = await filaNota(n2.id);
    assert.ok(l.corpo_texto.includes(await codigo(bom)), l.corpo_texto);
    assert.ok(!l.corpo_texto.includes(await codigo(zero)), 'o item que chegou zero nao entrou');
    assert.ok(!l.corpo_texto.includes(await codigo(naoEntrou)), 'item sem entrada_estoque_em nao entrou (D6)');
    assert.strictEqual(JSON.parse(l.payload).itens, 1);
  });

  await test('RN-08 positiva: AGUARDANDO_COMPRA, 4 pendentes, nota com 10 -> 1 linha ao solicitante, link do modulo', async () => {
    const m = await material();
    const rq = await requisicao({ nome: 'Fulano', modulo: 'operacional', itens: [{ material_id: m, qtd: 4 }] });
    const n = await notaQueEntrou([{ material_id: m, qtd: 10 }]);
    const res = await aviso.avisarEntradaConfirmada(db, ADMIN, n.id);
    assert.strictEqual(res.requisitantes.length, 1);
    assert.strictEqual(res.requisitantes[0].enfileirada, true);
    const [l] = await filaReq(n.id);
    assert.deepStrictEqual(JSON.parse(l.destinatarios), ['fulano@x.com']);
    assert.strictEqual(l.assunto, `[Almoxarifado] Chegou material da sua requisição ${rq.numero}`);
    assert.strictEqual(l.corpo_texto, [
      'Chegou ao estoque material que a sua requisição aguardava.',
      `Requisição: ${rq.numero}`,
      'Situação da requisição: Aguardando compra',
      `Recebimento: ${n.numero}`,
      'Materiais que chegaram:',
      `- ${await codigo(m)} — Material aviso ${(await codigo(m)).replace('AV70-', '')}: entrou 10 UN (pendente na requisição: 4 UN)`,
      'O material ainda não está reservado para a sua requisição — a separação é feita pelo almoxarifado.',
      `Link: ${APP}/fabrica/requisicoes-material`,
    ].join('\n'));
    assert.deepStrictEqual(JSON.parse(l.payload), { recebimento_id: n.id, requisicao_id: rq.id, numero_requisicao: rq.numero });
  });

  await test('RN-08 por item (Fase 2): PARCIALMENTE_RESERVADA com item sem reserva avisa; o item reservado nao', async () => {
    const semSaldo = await material(); const reservado = await material();
    const rq = await requisicao({ status: 'PARCIALMENTE_RESERVADA', solicitante: 502, nome: 'Ciclano',
      itens: [{ material_id: semSaldo, qtd: 6 }, { material_id: reservado, qtd: 2 }] });
    await dbRun(db, `INSERT INTO reservas_material_almoxarifado (material_id, quantidade, status, origem, item_requisicao_id)
      VALUES (?, 2, 'ATIVA', 'REQUISICAO', ?)`, [reservado, rq.itemIds[1]]);
    const n = await notaQueEntrou([{ material_id: semSaldo, qtd: 6 }, { material_id: reservado, qtd: 5 }]);
    await aviso.avisarEntradaConfirmada(db, ADMIN, n.id);
    const linhas = await filaReq(n.id);
    assert.strictEqual(linhas.length, 1);
    assert.deepStrictEqual(JSON.parse(linhas[0].destinatarios), ['ciclano@x.com']);
    assert.ok(linhas[0].corpo_texto.includes('Situação da requisição: Parcialmente reservada'));
    assert.ok(linhas[0].corpo_texto.includes(`${await codigo(semSaldo)} — `));
    assert.ok(!linhas[0].corpo_texto.includes(`${await codigo(reservado)} — `), 'o item ja reservado nao esperava nada');
  });

  await test('RN-08 negativas: EM_SEPARACAO, outro material, item ja separado, totalmente reservado, inativa -> nenhuma linha', async () => {
    const m = await material(); const outro = await material();
    await requisicao({ status: 'EM_SEPARACAO', itens: [{ material_id: m, qtd: 4 }] });
    await requisicao({ itens: [{ material_id: outro, qtd: 4 }] });
    await requisicao({ status: 'PARCIALMENTE_ATENDIDA', itens: [{ material_id: m, qtd: 4, separada: 4 }] });
    const res = await requisicao({ status: 'TOTALMENTE_RESERVADA', itens: [{ material_id: m, qtd: 3 }] });
    await dbRun(db, `INSERT INTO reservas_material_almoxarifado (material_id, quantidade, status, origem, item_requisicao_id)
      VALUES (?, 3, 'ATIVA', 'REQUISICAO', ?)`, [m, res.itemIds[0]]);
    await requisicao({ ativo: 0, itens: [{ material_id: m, qtd: 4 }] });
    const n = await notaQueEntrou([{ material_id: m, qtd: 10 }]);
    const r = await aviso.avisarEntradaConfirmada(db, ADMIN, n.id);
    assert.deepStrictEqual(r.requisitantes, []);
    assert.strictEqual((await filaReq(n.id)).length, 0);
    assert.ok(!(await filaNota(n.id))[0].corpo_texto.includes('Requisições que aguardavam'));
  });

  await test('RN-08: solicitante inativo / sem e-mail / sem cadastro -> sem linha, sem erro; o aviso da nota sai', async () => {
    const m = await material();
    const a = await requisicao({ solicitante: 503, nome: 'Inativo', itens: [{ material_id: m, qtd: 1 }] });
    const b = await requisicao({ solicitante: 504, nome: 'Sem Email', itens: [{ material_id: m, qtd: 1 }] });
    const c = await requisicao({ solicitante: 999, nome: 'Fantasma', itens: [{ material_id: m, qtd: 1 }] });
    const n = await notaQueEntrou([{ material_id: m, qtd: 3 }]);
    const r = await aviso.avisarEntradaConfirmada(db, ADMIN, n.id);
    assert.deepStrictEqual(r.requisitantes.map((x) => [x.requisicao_id, x.motivo]),
      [[a.id, 'SEM_DESTINATARIO'], [b.id, 'SEM_DESTINATARIO'], [c.id, 'SEM_DESTINATARIO']]);
    assert.strictEqual((await filaReq(n.id)).length, 0);
    assert.strictEqual(r.nota.enfileirada, true);
    assert.ok((await filaNota(n.id))[0].corpo_texto.includes(`${a.numero} (Inativo), ${b.numero} (Sem Email), ${c.numero} (Fantasma)`));
  });

  await test('RN-09: material retido nao avisa o requisitante; e (positiva) com inspecao desligada entra livre e avisa', async () => {
    const crit = await material({ critico: 1 });
    await requisicao({ itens: [{ material_id: crit, qtd: 2 }] });
    const n = await notaQueEntrou([{ material_id: crit, qtd: 2 }]);
    const r = await aviso.avisarEntradaConfirmada(db, ADMIN, n.id);
    assert.deepStrictEqual(r.requisitantes, []);
    assert.ok((await filaNota(n.id))[0].corpo_texto.includes('— retido para inspeção'));
    await setCfg('inspecao_material_critico', '0');
    const crit2 = await material({ critico: 1 });
    await requisicao({ itens: [{ material_id: crit2, qtd: 2 }] });
    const n2 = await notaQueEntrou([{ material_id: crit2, qtd: 2 }]);
    await aviso.avisarEntradaConfirmada(db, ADMIN, n2.id);
    assert.strictEqual((await filaReq(n2.id)).length, 1);
    assert.ok((await filaNota(n2.id))[0].corpo_texto.includes('— disponível'));
    await setCfg('inspecao_material_critico', '1');
  });

  await test('mesmo material em dois itens (nota e requisicao): entrou e pendente somados por material', async () => {
    const m = await material();
    await requisicao({ itens: [{ material_id: m, qtd: 3 }, { material_id: m, qtd: 2, separada: 1 }] });
    const n = await notaQueEntrou([{ material_id: m, qtd: 4 }, { material_id: m, qtd: 1.1 }]);
    await aviso.avisarEntradaConfirmada(db, ADMIN, n.id);
    const [l] = await filaReq(n.id);
    assert.ok(l.corpo_texto.includes(': entrou 5.1 UN (pendente na requisição: 4 UN)'), l.corpo_texto);
  });

  await test('dedupe: a segunda chamada e DUPLICADA nos dois avisos e a fila nao cresce', async () => {
    const m = await material();
    const rq = await requisicao({ itens: [{ material_id: m, qtd: 1 }] });
    const n = await notaQueEntrou([{ material_id: m, qtd: 1 }]);
    const r1 = await aviso.avisarEntradaConfirmada(db, ADMIN, n.id);
    assert.strictEqual(r1.nota.enfileirada, true);
    const r2 = await aviso.avisarEntradaConfirmada(db, ADMIN, n.id);
    assert.deepStrictEqual(r2.nota, { enfileirada: false, motivo: 'DUPLICADA' });
    assert.deepStrictEqual(r2.requisitantes, [{ requisicao_id: rq.id, enfileirada: false, motivo: 'DUPLICADA' }]);
    assert.strictEqual((await fila(n.id)).length, 2);
  });

  await close();
  console.log(`\n${passed} passou, ${failed} falhou`);
  process.exit(failed > 0 ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
