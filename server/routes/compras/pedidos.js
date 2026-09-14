/**
 * Pedido de compra — Etapa 32.
 *
 * Registrador montável: existe como módulo (e não inline no index.js) para o harness de
 * testes poder montar /api/compras/pedidos. Antes desta etapa NENHUM teste alcançava as
 * rotas de compras — os testes que "usavam pedido" faziam INSERT direto no banco, então a
 * fiação das rotas nunca era exercida.
 *
 * ORDEM DE REGISTRO IMPORTA: este módulo tem de ser registrado ANTES do
 * `app.delete('/api/compras/:tipo/:id')` genérico do index.js, e `'pedidos'` foi removido
 * do mapa dela. Sem as duas coisas o DELETE daqui vira código morto — foi o que aconteceu
 * com `app.delete('/api/compras/grupos/:id')`, que hoje nunca roda.
 *
 * Regras no plano: docs/superpowers/plans/2026-09-11-compras-etapa32-pedido-de-compra.md
 */

const { dbRun, dbGet, dbAll } = require('../../services/compras/db');
const { calcularTotaisPedido } = require('../../services/compras/pedidoTotais');
const { carregarPedido: carregarPedidoDoBanco } = require('../../services/compras/pedidoLeitura');
const { carregarOpcoes } = require('../../services/compras/opcoesPedido');

// RN-07 — enum fechado. Gravação sempre minúscula; leitura tolera maiúscula porque
// outro caminho da base grava 'ABERTO' (tests/api/reposicaoJornada.api.test.js:61).
const STATUS_VALIDOS = ['pendente', 'aprovado', 'finalizado', 'cancelado'];
const STATUS_BLOQUEADOS = ['finalizado', 'cancelado'];

// Literal REUSADO de purchaseService.js:62-65 e receiptService.js:112 — um literal só para
// "pedido de compra não existe", não inventar um segundo.
const NAO_ENCONTRADO = 'Pedido de compra não encontrado';

const normalizarStatus = (s) => String(s || '').trim().toLowerCase();

/** Colunas do cabeçalho que o POST/PUT aceitam do corpo (o resto é derivado). */
const CAMPOS_CABECALHO = [
  'data_pedido', 'previsao_entrega', 'condicao_pagamento', 'frete_modalidade',
  'transportadora', 'transportadora_telefone', 'via_transporte', 'tabela_preco',
  'contato', 'observacoes', 'local_entrega', 'local_cobranca',
];

module.exports = function (app, db, authenticateToken, checkModulePermission) {
  const guard = [authenticateToken, checkModulePermission('compras')];

  /** Valida corpo de POST/PUT. Devolve `{ erro }` ou `{ itens }` já normalizados. */
  async function validarPedido(body, idAtual = null) {
    const numero = String(body.numero || '').trim();
    if (!numero) return { erro: { status: 400, msg: 'Informe o número do pedido' } };

    // RN-01 — unicidade por SELECT prévio, não por captura de UNIQUE constraint:
    // a mensagem tem de ser a literal, e o número é escolha do comprador.
    const jaExiste = await dbGet(
      db,
      idAtual
        ? 'SELECT id FROM pedidos_compra WHERE numero = ? AND id != ?'
        : 'SELECT id FROM pedidos_compra WHERE numero = ?',
      idAtual ? [numero, idAtual] : [numero]
    );
    if (jaExiste) {
      return { erro: { status: 400, msg: 'Já existe um pedido de compra com este número' } };
    }

    const fornecedorId = parseInt(body.fornecedor_id, 10);
    if (!fornecedorId) return { erro: { status: 400, msg: 'Selecione o fornecedor' } };

    const itens = Array.isArray(body.itens) ? body.itens : [];
    if (itens.length === 0) {
      return { erro: { status: 400, msg: 'Adicione ao menos um item ao pedido' } };
    }

    // RN-09 — item sem material_id é descartado por receiptService.js:85 e o recebimento
    // morre depois em "Inclua ao menos um item", longe daqui e sem explicação.
    if (itens.some((i) => !parseInt(i && i.material_id, 10))) {
      return { erro: { status: 400, msg: 'Item sem material: selecione o material do cadastro' } };
    }

    const status = normalizarStatus(body.status) || 'pendente';
    if (!STATUS_VALIDOS.includes(status)) {
      return { erro: { status: 400, msg: 'Status inválido' } };
    }

    return { numero, fornecedorId, itens, status };
  }

  /** Grava itens + totais e devolve os totais. Assume transação aberta pelo chamador. */
  async function gravarItensECalcular(pedidoId, itens, encargos) {
    const { itens: calculados, totais } = calcularTotaisPedido(itens, encargos);

    await dbRun(db, 'DELETE FROM itens_pedido_compra WHERE pedido_id = ?', [pedidoId]);

    for (let i = 0; i < calculados.length; i++) {
      const it = calculados[i];
      await dbRun(
        db,
        `INSERT INTO itens_pedido_compra
         (pedido_id, material_id, codigo, descricao, observacao, ncm, peso_unitario,
          data_entrega, quantidade, unidade, valor_unitario, ipi_percentual, item_numero)
         VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`,
        [
          pedidoId,
          parseInt(it.material_id, 10),
          it.codigo || null,
          it.descricao || null,
          it.observacao || null,
          it.ncm || null,
          Number(it.peso_unitario) || 0,
          it.data_entrega || null,
          Number(it.quantidade) || 0,
          it.unidade || 'UN',
          Number(it.valor_unitario) || 0,
          Number(it.ipi_percentual) || 0,
          it.item_numero != null ? Number(it.item_numero) : i + 1,
        ]
      );
    }

    await dbRun(
      db,
      `UPDATE pedidos_compra
       SET total_produtos = ?, total_ipi = ?, total_icms_st = ?, total_desconto = ?,
           valor_frete = ?, valor_total = ?, updated_at = CURRENT_TIMESTAMP
       WHERE id = ?`,
      [
        totais.total_produtos, totais.total_ipi, totais.total_icms_st,
        totais.total_desconto, totais.valor_frete,
        // RN-10 — valor_total é espelho legado de total_geral: três consumidores fora
        // desta etapa leem essa coluna (Compras.js:264, Compras.js:149 e
        // receiptService.listarPedidosCompraAux). Sem o espelho, todo pedido novo
        // aparece como R$ 0,00 nos três.
        totais.total_geral,
        pedidoId,
      ]
    );

    return totais;
  }

  // Leitura completa (cabeçalho + fornecedor resolvido + itens + totais) mora em
  // services/compras/pedidoLeitura.js porque tem DOIS consumidores: esta rota e a rota
  // auxiliar do almoxarifado (o almoxarife não tem o módulo `compras` e tomaria 403 aqui).
  // Duas cópias divergiriam — e a divergência apareceria como "o comprador vê um total e
  // quem recebe vê outro".
  const carregarPedido = (id) => carregarPedidoDoBanco(db, id);

  // ────────────── AUXILIARES DO FORMULÁRIO (G1) ──────────────
  //
  // Espelho exato do que a Etapa 32/G4 fez do outro lado: lá o almoxarife não tem o módulo
  // `compras` e precisava ler o pedido; aqui o comprador não tem o módulo `almoxarifado` e
  // precisa escolher o material. O prefixo `/api/almoxarifado` INTEIRO é guardado por
  // `checkModulePermission('almoxarifado')` (routes/almoxarifado.js:233-235), então um
  // `GET /api/almoxarifado/materiais` direto do formulário devolveria 403 — e a RN-09 exige
  // `material_id` em TODO item, o que tornaria impossível salvar qualquer pedido.

  // Todas as opcoes que a tela desenha como botao, numa chamada so (G1b).
  app.get('/api/compras/pedidos-aux/opcoes', ...guard, async (req, res) => {
    try {
      res.json(await carregarOpcoes(db));
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  app.get('/api/compras/pedidos-aux/materiais', ...guard, async (req, res) => {
    try {
      // Base core-only (sem o módulo almoxarifado instalado) não tem a tabela. Mesma checagem
      // de `receiptService.listarFornecedoresAux`.
      const existe = await dbGet(
        db, "SELECT name FROM sqlite_master WHERE type='table' AND name='materiais_almoxarifado'"
      );
      if (!existe) return res.json([]);

      const { search } = req.query;
      let sql = `SELECT id, codigo, nome, unidade, ncm, custo_unitario
                   FROM materiais_almoxarifado
                  WHERE ativo = 1`;
      const params = [];
      if (search) {
        sql += ' AND (codigo LIKE ? OR nome LIKE ?)';
        params.push(`%${search}%`, `%${search}%`);
      }
      sql += ' ORDER BY nome LIMIT 50';

      res.json(await dbAll(db, sql, params));
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  /**
   * Prévia dos totais, para o formulário mostrar o valor ANTES de salvar.
   *
   * Existe para que o front NÃO reimplemente a conta. `pedidoTotais` é o implementador único
   * da RN-03/04/05 e a ordem do arredondamento é normativa (cada linha arredonda antes de
   * somar); uma segunda cópia em JS do navegador divergiria em centavos do que o servidor
   * grava — o usuário veria um total na tela e outro depois de salvar.
   *
   * Não escreve nada e não valida: é calculadora.
   */
  app.post('/api/compras/pedidos/calcular', ...guard, (req, res) => {
    const body = req.body || {};
    try {
      const { totais, itens } = calcularTotaisPedido(
        Array.isArray(body.itens) ? body.itens : [],
        body
      );
      res.json({ totais, itens });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  // ───────────────────────────── LISTA ─────────────────────────────
  // Mantém TODAS as colunas de hoje (o front consome p.* e fornecedor_nome) e acrescenta
  // total_itens e total_geral. Não renomear nada aqui: Compras.js:264 e :149 leem valor_total.
  app.get('/api/compras/pedidos', ...guard, (req, res) => {
    const { search, status } = req.query;
    let query = `SELECT p.*, f.razao_social as fornecedor_nome,
                        (SELECT COUNT(*) FROM itens_pedido_compra i WHERE i.pedido_id = p.id) AS total_itens,
                        p.valor_total AS total_geral
                   FROM pedidos_compra p
                   LEFT JOIN fornecedores f ON p.fornecedor_id = f.id
                  WHERE 1=1`;
    const params = [];

    if (search) {
      query += ' AND (p.numero LIKE ? OR f.razao_social LIKE ?)';
      const termo = `%${search}%`;
      params.push(termo, termo);
    }
    if (status) {
      query += ' AND LOWER(p.status) = ?';
      params.push(normalizarStatus(status));
    }
    query += ' ORDER BY p.created_at DESC';

    db.all(query, params, (err, rows) => {
      if (err) return res.status(500).json({ error: err.message });
      res.json(rows);
    });
  });

  // ───────────────────────────── DETALHE ─────────────────────────────
  app.get('/api/compras/pedidos/:id', ...guard, async (req, res) => {
    try {
      const pedido = await carregarPedido(parseInt(req.params.id, 10));
      if (!pedido) return res.status(404).json({ error: NAO_ENCONTRADO });
      res.json(pedido);
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  // ───────────────────────────── CRIAR ─────────────────────────────
  app.post('/api/compras/pedidos', ...guard, async (req, res) => {
    const body = req.body || {};
    try {
      const v = await validarPedido(body);
      if (v.erro) return res.status(v.erro.status).json({ error: v.erro.msg });

      const fornecedor = await dbGet(db, 'SELECT * FROM fornecedores WHERE id = ?', [v.fornecedorId]);
      if (!fornecedor) return res.status(400).json({ error: 'Selecione o fornecedor' });

      await dbRun(db, 'BEGIN IMMEDIATE');
      try {
        const campos = CAMPOS_CABECALHO.map((c) => body[c] != null ? body[c] : null);
        const r = await dbRun(
          db,
          `INSERT INTO pedidos_compra
           (numero, fornecedor_id, status, ${CAMPOS_CABECALHO.join(', ')},
            total_icms_st, total_desconto, valor_frete,
            snap_fornecedor_nome, snap_fornecedor_cnpj, snap_fornecedor_ie,
            snap_fornecedor_endereco, snap_fornecedor_municipio, snap_fornecedor_uf,
            snap_fornecedor_cep, snap_fornecedor_telefone, snap_fornecedor_email)
           VALUES (?,?,?,${CAMPOS_CABECALHO.map(() => '?').join(',')},?,?,?,?,?,?,?,?,?,?,?,?)`,
          [
            v.numero, v.fornecedorId, v.status, ...campos,
            Number(body.total_icms_st) || 0,
            Number(body.total_desconto) || 0,
            Number(body.valor_frete) || 0,
            // RN-06 — congela o fiscal do fornecedor na criação: pedido é documento, e
            // mudança de cadastro em 2027 não pode reescrever o pedido de 2025.
            fornecedor.razao_social || null,
            fornecedor.cnpj || null,
            fornecedor.inscricao_estadual || null,
            fornecedor.endereco || null,
            fornecedor.cidade || null,
            fornecedor.estado || null,
            fornecedor.cep || null,
            fornecedor.telefone || null,
            fornecedor.email || null,
          ]
        );

        await gravarItensECalcular(r.lastID, v.itens, body);
        await dbRun(db, 'COMMIT');

        const criado = await carregarPedido(r.lastID);
        res.status(201).json(criado);
      } catch (e) {
        try { await dbRun(db, 'ROLLBACK'); } catch (_) { /* já desfeito */ }
        throw e;
      }
    } catch (e) {
      console.error('Erro ao criar pedido de compra:', e);
      res.status(500).json({ error: e.message });
    }
  });

  // ───────────────────────────── EDITAR ─────────────────────────────
  app.put('/api/compras/pedidos/:id', ...guard, async (req, res) => {
    const id = parseInt(req.params.id, 10);
    const body = req.body || {};
    try {
      const atual = await dbGet(db, 'SELECT id, status FROM pedidos_compra WHERE id = ?', [id]);
      if (!atual) return res.status(404).json({ error: NAO_ENCONTRADO });

      // RN-07 — documento fechado não muda. Antes da validação de corpo: o motivo da
      // recusa é o estado do pedido, não o que veio no payload.
      if (STATUS_BLOQUEADOS.includes(normalizarStatus(atual.status))) {
        return res.status(409).json({ error: 'Pedido finalizado não pode ser alterado' });
      }

      const v = await validarPedido(body, id);
      if (v.erro) return res.status(v.erro.status).json({ error: v.erro.msg });

      await dbRun(db, 'BEGIN IMMEDIATE');
      try {
        const sets = CAMPOS_CABECALHO.map((c) => `${c} = ?`).join(', ');
        await dbRun(
          db,
          `UPDATE pedidos_compra
              SET numero = ?, fornecedor_id = ?, status = ?, ${sets},
                  total_icms_st = ?, total_desconto = ?, valor_frete = ?
            WHERE id = ?`,
          [
            v.numero, v.fornecedorId, v.status,
            ...CAMPOS_CABECALHO.map((c) => (body[c] != null ? body[c] : null)),
            Number(body.total_icms_st) || 0,
            Number(body.total_desconto) || 0,
            Number(body.valor_frete) || 0,
            id,
          ]
        );

        await gravarItensECalcular(id, v.itens, body);
        await dbRun(db, 'COMMIT');

        res.json(await carregarPedido(id));
      } catch (e) {
        try { await dbRun(db, 'ROLLBACK'); } catch (_) { /* já desfeito */ }
        throw e;
      }
    } catch (e) {
      console.error('Erro ao atualizar pedido de compra:', e);
      res.status(500).json({ error: e.message });
    }
  });

  // ───────────────────────────── STATUS ─────────────────────────────
  app.put('/api/compras/pedidos/:id/status', ...guard, async (req, res) => {
    const id = parseInt(req.params.id, 10);
    const status = normalizarStatus((req.body || {}).status);
    try {
      if (!STATUS_VALIDOS.includes(status)) {
        return res.status(400).json({ error: 'Status inválido' });
      }
      const r = await dbRun(
        db,
        'UPDATE pedidos_compra SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
        [status, id]
      );
      if (r.changes === 0) return res.status(404).json({ error: NAO_ENCONTRADO });
      res.json(await carregarPedido(id));
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  // ───────────────────────────── EXCLUIR ─────────────────────────────
  app.delete('/api/compras/pedidos/:id', ...guard, async (req, res) => {
    const id = parseInt(req.params.id, 10);
    try {
      const pedido = await dbGet(db, 'SELECT id, numero FROM pedidos_compra WHERE id = ?', [id]);
      if (!pedido) return res.status(404).json({ error: NAO_ENCONTRADO });

      // RN-08 — o vínculo do recebimento mora em DUAS colunas: `pedido_compra_numero` é
      // gravado mesmo com `pedido_compra_id` nulo quando o recebimento entra por nota
      // fiscal (receiptService.js:139). Olhar só o id apagaria pedido já recebido.
      const receb = await dbGet(
        db,
        `SELECT id FROM recebimentos_material_almoxarifado
          WHERE pedido_compra_id = ? OR (pedido_compra_numero IS NOT NULL AND pedido_compra_numero = ?)
          LIMIT 1`,
        [id, pedido.numero]
      ).catch(() => null); // tabela do almoxarifado pode não existir em base core-only

      if (receb) {
        return res.status(409).json({
          error: 'Pedido já tem recebimento lançado e não pode ser excluído',
        });
      }

      // Solicitação vinculada também bloqueia: apagar o pedido deixaria a solicitação
      // VINCULADO para sempre, porque fecharSolicitacoesDoPedido nunca mais roda.
      const solic = await dbGet(
        db,
        'SELECT id FROM solicitacoes_compra_almoxarifado WHERE pedido_compra_id = ? LIMIT 1',
        [id]
      ).catch(() => null);

      if (solic) {
        return res.status(409).json({
          error: 'Pedido já tem recebimento lançado e não pode ser excluído',
        });
      }

      // Itens ANTES do cabeçalho: produção roda com PRAGMA foreign_keys = ON
      // (sqliteConcurrency.js:50) e o harness com OFF — sem isto o teste fica verde e a
      // produção devolve 500 por FK.
      await dbRun(db, 'BEGIN IMMEDIATE');
      try {
        await dbRun(db, 'DELETE FROM itens_pedido_compra WHERE pedido_id = ?', [id]);
        await dbRun(db, 'DELETE FROM pedidos_compra WHERE id = ?', [id]);
        await dbRun(db, 'COMMIT');
      } catch (e) {
        try { await dbRun(db, 'ROLLBACK'); } catch (_) { /* já desfeito */ }
        throw e;
      }

      res.json({ message: 'Pedido excluído' });
    } catch (e) {
      console.error('Erro ao excluir pedido de compra:', e);
      res.status(500).json({ error: e.message });
    }
  });

  console.log('✅ Rotas de pedido de compra registradas (Etapa 32)');
};
