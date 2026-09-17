/**
 * Rotas do modulo CORE Compras — extraidas de `server/index.js:19974-20471` na Etapa 38.
 *
 * POR QUE ESTE ARQUIVO EXISTE. As 23 rotas abaixo viviam soltas no meio de `server/index.js`, um
 * arquivo de mais de 20 mil linhas que nenhum teste carrega (require-lo sobe o servidor inteiro).
 * Consequencia medida na Fase 0 da Etapa 38: **ZERO** testes batiam em `/api/compras/*`, e o
 * harness (`tests/helpers/testApp.js`) montava dois registradores — almoxarifado e requisicoes de
 * material — nenhum deles Compras. O modulo nao tinha ONDE ser exercido. A extracao e o
 * pre-requisito escondido da etapa: sem ela, nenhuma regra nova do pedido de compra tem regua.
 *
 * O QUE ESTE ARQUIVO **NAO** FAZ, e isso e contrato:
 *
 * 1. **Nao muda comportamento.** O bloco foi movido VERBATIM — mesmos handlers, mesmas literais,
 *    mesmos status. Ate a indentacao original foi preservada (o corpo nao foi re-indentado para
 *    dentro da funcao): reindentar 498 linhas tornaria o diff da movimentacao impossivel de
 *    auditar linha a linha, que e a unica prova de que nada mudou no caminho.
 *
 * 2. **Nao reordena as rotas.** A ORDEM DE REGISTRO E COMPORTAMENTO NO EXPRESS, e aqui ela esconde
 *    um defeito conhecido: `app.delete("/api/compras/:tipo/:id")` esta registrado ANTES de
 *    `app.delete("/api/compras/grupos/:id")` e o sombreia — `tables['grupos']` nao existe no mapa
 *    do generico, entao apagar um grupo responde **400 `'Tipo inválido'`** e o grupo continua
 *    ativo. Nao e o comportamento desejado; e o que existe. Consertar muda o comportamento de
 *    outra aba e e etapa propria. `tests/api/comprasPedidosRotas.api.test.js`, cenario (4),
 *    CONGELA esse 400 como caracterizacao — ele existe para acusar quem "organizar as rotas por
 *    recurso" numa task que promete nao mudar nada.
 *
 * 3. **Nao troca a validacao na mao por Zod** e nao mexe nos `if (!campo) return 400`. Zod entra
 *    na Task 2, e so no pedido de compra.
 *
 * O QUE FICOU PARA TRAS, DE PROPOSITO:
 *
 * - As **3** rotas `/api/compras/solicitacoes-compra` (`index.js:18465`, `:18500`, `:18525`)
 *   continuam em `index.js`: vivem 1.500 linhas acima, cercadas de rotas de outros modulos, e
 *   operam a tabela core `solicitacoes_compra` — que **nao e** a `solicitacoes_compra_almoxarifado`
 *   da reposicao. Duas tabelas homonimas, dois modulos.
 * - As **instancias de multer** (`index.js:807` e `:826`) continuam la e entram por **injecao de
 *   dependencia**: elas fecham sobre `uploadsGruposComprasDir`/`uploadsFornecedoresDir`, variaveis
 *   de modulo do `index.js`, e mover as instancias mudaria ONDE O ARQUIVO E GRAVADO. Passa-las por
 *   DI nao muda nada — os dois diretorios vao no mesmo objeto `uploads`, pelo mesmo motivo (os
 *   handlers de foto e foto-base64 os usam direto, para apagar a foto antiga e para escrever o
 *   base64). As duas rotas de foto NAO tem teste, e isso esta declarado.
 *
 * Gate de todas as rotas daqui: `authenticateToken` + `checkModulePermission('compras')`. Este
 * modulo core tem **UMA** camada de autorizacao, nao duas: nenhum `requirePermission`, nenhum
 * `ACAO_PERFIS` (medido nas 26 rotas). Nao invente perfil de Compras sem etapa propria.
 *
 * @param {object} app      express()
 * @param {object} db       sqlite3.Database
 * @param {Function} authenticateToken       middleware de auth (DI: o harness injeta um stub)
 * @param {Function} checkModulePermission   fabrica de middleware de permissao de modulo
 * @param {object} uploads  { uploadGrupoCompras, uploadFornecedor,
 *                            uploadsGruposComprasDir, uploadsFornecedoresDir }
 */
const path = require('path');
const fs = require('fs');
// Etapa 38: os primeiros Zod do modulo core Compras. `validate` vem do almoxarifado por `require`,
// NAO por copia (decisao 7 do design) — duplicar o formatador daria dois "Dados invalidos" que
// divergiriam na primeira edicao.
const { validate } = require('../services/almoxarifado/validation');
const { PedidoCompraCreateSchema } = require('../services/compras/schemas');
const pedidoCompraService = require('../services/compras/pedidoCompraService');
// Etapa 38, Task 4: os 5 leitores de planilha sairam do escopo deste registrador para
// `services/compras/planilhaCompras.js` (movidos VERBATIM, md5 conferido) porque a importacao de
// PEDIDOS tambem os usa e aqui dentro eles eram inalcancaveis por `require`. A rota de itens do
// fornecedor la embaixo continua chamando os MESMOS quatro nomes — o cenario (5) de
// `comprasPedidosRotas.api.test.js` e a regua de que a movimentacao nao mudou nada.
// Sao requeridos os TRES que este arquivo chama: `normalizarCampo` (codigo morto desde antes da
// extracao) e `parsePrecoBackend` (chamado so de dentro dos outros dois) ficam no modulo novo.
const {
  extrairDoRow,
  extrairPrecoDoRow,
  extrairDescricaoDoRow,
} = require('../services/compras/planilhaCompras');

module.exports = (app, db, authenticateToken, checkModulePermission, uploads) => {
const {
  uploadGrupoCompras,
  uploadFornecedor,
  uploadsGruposComprasDir,
  uploadsFornecedoresDir,
} = uploads;

// ========== ROTAS MÓDULO COMPRAS ==========
// Fornecedores
app.get('/api/compras/fornecedores', authenticateToken, checkModulePermission('compras'), (req, res) => {
  const { search, status } = req.query;
  let query = 'SELECT * FROM fornecedores WHERE 1=1';
  const params = [];

  if (search) {
    query += ' AND (razao_social LIKE ? OR nome_fantasia LIKE ? OR cnpj LIKE ?)';
    const searchTerm = `%${search}%`;
    params.push(searchTerm, searchTerm, searchTerm);
  }
  if (status) {
    query += ' AND status = ?';
    params.push(status);
  }

  query += ' ORDER BY created_at DESC';

  db.all(query, params, (err, rows) => {
    if (err) {
      return res.status(500).json({ error: err.message });
    }
    res.json(rows);
  });
});

// Pedidos de Compra
app.get('/api/compras/pedidos', authenticateToken, checkModulePermission('compras'), (req, res) => {
  const { search, status } = req.query;
  let query = `SELECT p.*, f.razao_social as fornecedor_nome 
               FROM pedidos_compra p 
               LEFT JOIN fornecedores f ON p.fornecedor_id = f.id 
               WHERE 1=1`;
  const params = [];

  if (search) {
    query += ' AND (p.numero LIKE ? OR f.razao_social LIKE ?)';
    const searchTerm = `%${search}%`;
    params.push(searchTerm, searchTerm);
  }
  if (status) {
    query += ' AND p.status = ?';
    params.push(status);
  }

  query += ' ORDER BY p.created_at DESC';

  db.all(query, params, (err, rows) => {
    if (err) {
      return res.status(500).json({ error: err.message });
    }
    // Etapa 39 (RN-D04/RN-D06): `atrasado` e `dias_atraso` são DERIVADOS na leitura, nunca
    // gravados — apagar estas quatro linhas apaga a feature inteira, sem migration nem coluna
    // órfã. `hoje` é calculado UMA vez para a resposta toda: chamar `hojeLocalISO()` por linha
    // faria duas linhas da mesma resposta caírem em dias diferentes na virada da meia-noite.
    const hoje = pedidoCompraService.hojeLocalISO();
    const comAtraso = rows.map((linha) => ({ ...linha, ...pedidoCompraService.derivarAtraso(linha, hoje) }));
    // Só a string '1' liga o filtro: `if (req.query.atrasados)` ligaria com '0' também.
    res.json(req.query.atrasados === '1' ? comAtraso.filter((l) => l.atrasado === 1) : comAtraso);
  });
});

/**
 * Etapa 38 (RN-C02 a RN-C05, RN-C13) — a porta que CRIA o pedido de compra com os itens.
 *
 * Ate esta linha existir, o modulo tinha `app.get('/api/compras/pedidos')` e mais nada: nenhum
 * `app.post`, nenhum `app.put`. `COUNT(pedidos_compra) = 0` em producao e a Etapa 37 inteira
 * (recebimento contra pedido, saldo, excedente) era inalcancavel por um clique — o roteiro de
 * teste dela comeca com "criar pedido no modulo Compras".
 *
 * ⚠️ POSICAO NO ARQUIVO E CONTRATO. Esta rota fica ACIMA de `app.delete('/api/compras/:tipo/:id')`
 * junto das outras de pedido. Para o `POST` o metodo ja difere do generico, mas as rotas de pedido
 * da Task 3 (`PUT`/`DELETE /api/compras/pedidos/:id`) **precisam** vir antes dele — registradas
 * depois, `/api/compras/pedidos/7` seria capturado pelo generico e a regua de recebimento nunca
 * seria alcancada. Manter as quatro juntas e aqui e o que impede o proximo de separa-las.
 *
 * ⚠️ VALIDACAO POR `validate()` DO ALMOXARIFADO, reusado por `require` e nao copiado (decisao 7):
 * ele responde o 400 no formato da casa e **substitui `req.body` por `parsed.data`** — e e por isso
 * que os schemas sao `z.looseObject`: com `z.object`, `itens` e `solicitacao_id` sumiriam do corpo
 * antes de chegar aqui. Estes sao os primeiros schemas Zod do modulo core Compras.
 *
 * Gate: o mesmo das outras 23 — `authenticateToken` + `checkModulePermission('compras')`. O core
 * tem UMA camada de autorizacao, nao duas (nenhum `requirePermission`): a porta de escrita nova
 * herda exatamente o gate das de leitura, e isso esta declarado no fechamento da etapa.
 */
app.post('/api/compras/pedidos', authenticateToken, checkModulePermission('compras'),
  validate(PedidoCompraCreateSchema), async (req, res) => {
    try {
      res.status(201).json(await pedidoCompraService.criarPedido(db, req.body, req.user));
    } catch (e) {
      // `e.status` vem do molde `erro()` do servico (400 nas guardas de fornecedor/material);
      // qualquer outra coisa e defeito nosso e sai 500 com a mensagem, como nas demais rotas.
      // `acao`/`perfil` so existem no 403 do gate condicional do vinculo (fix 1 da Task 2) e vao
      // junto para o corpo ficar IDENTICO ao de `requirePermission` do almoxarifado — a tela ja
      // sabe ler esses dois campos para dizer qual permissao falta.
      const corpo = { error: e.message };
      if (e.acao) { corpo.acao = e.acao; corpo.perfil = e.perfil; }
      res.status(e.status || 500).json(corpo);
    }
  });

// Pedido de compra — leitura, edicao e exclusao (Etapa 38, Task 3: RN-C06, RN-C07, RN-C08)
//
// ⚠️ ESTE BLOCO TEM DE FICAR ACIMA DE `app.delete('/api/compras/:tipo/:id')`, e a posicao e
// COMPORTAMENTO, nao organizacao: `/api/compras/pedidos/7` tem DOIS segmentos e casa o padrao
// `/:tipo/:id` do generico (medicao 2 da Fase 0 — o mesmo sombreamento que faz `DELETE
// /api/compras/grupos/:id` responder `400 'Tipo inválido'` ate hoje). Registradas DEPOIS dele, as
// rotas abaixo nunca seriam alcancadas: medido por sonda contra o codigo de hoje, o generico
// respondeu `200 'Item excluído com sucesso'` a um pedido COM material recebido, apagou a cabeca e
// deixou a linha de `itens_pedido_compra` orfa. Mover este bloco para baixo derruba os cenarios
// (5) e (7) de `comprasPedidoEditarExcluir.api.test.js`.
//
// As tres respondem pelo servico (a rota nao faz SQL) e traduzem `e.status`: 404 (nao existe), 400
// (`PUT` com recebimento), 409 (`DELETE` com recebimento).
app.get('/api/compras/pedidos/:id', authenticateToken, checkModulePermission('compras'), async (req, res) => {
  try {
    res.json(await pedidoCompraService.obterPedido(db, req.params.id));
  } catch (e) {
    res.status(e.status || 500).json({ error: e.message });
  }
});

// `PUT` validado pelo MESMO `PedidoCompraCreateSchema` do `POST` (contrato 4: "o mesmo payload,
// menos `solicitacao_id`"). Um schema proprio daria uma segunda lista de 7 status e uma segunda
// literal de quantidade para a mesma regra — e o servico ignora `solicitacao_id` de proposito.
app.put('/api/compras/pedidos/:id', authenticateToken, checkModulePermission('compras'),
  validate(PedidoCompraCreateSchema), async (req, res) => {
    try {
      res.json(await pedidoCompraService.atualizarPedido(db, req.params.id, req.body));
    } catch (e) {
      res.status(e.status || 500).json({ error: e.message });
    }
  });

app.delete('/api/compras/pedidos/:id', authenticateToken, checkModulePermission('compras'), async (req, res) => {
  try {
    res.json(await pedidoCompraService.excluirPedido(db, req.params.id));
  } catch (e) {
    res.status(e.status || 500).json({ error: e.message });
  }
});

/**
 * Etapa 38, Task 4 (RN-C10, RN-C11) — IMPORTAR PEDIDOS DE PLANILHA, um pedido por ordem.
 *
 * Fica JUNTO das outras rotas de pedido e acima do `DELETE` generico. `POST` nao sofre o
 * sombreamento de `/:tipo/:id` (metodo diferente), mas separar as rotas de pedido e exatamente o
 * que o comentario do bloco acima pede para nao fazer — quem as espalhar perde a garantia de
 * ordem que o `PUT`/`DELETE` dependem.
 *
 * ⚠️ SEM `validate()` AQUI, de proposito: o corpo e uma PLANILHA de forma desconhecida (o
 * cabecalho vem em qualquer grafia) e a guarda e a MESMA do precedente de importacao de itens do
 * fornecedor, com a MESMA literal de 400 — um schema Zod responderia `'Dados inválidos — …'` e
 * daria duas frases para o mesmo fato. A validacao por linha e o `ignorados` da resposta.
 *
 * 201 mesmo com linhas recusadas (sucesso PARCIAL): `{ pedidos: [{id, numero, itens}], itens: N,
 * ignorados: [{linha, motivo}] }`. Quem recusa a planilha inteira e so a guarda do corpo (400).
 */
app.post('/api/compras/pedidos/importar', authenticateToken, checkModulePermission('compras'), async (req, res) => {
  try {
    res.status(201).json(await pedidoCompraService.importarPedidos(db, req.body, req.user));
  } catch (e) {
    res.status(e.status || 500).json({ error: e.message });
  }
});

/**
 * Etapa 38, Task 4 (RN-C09) — a BUSCA DE MATERIAL do proprio modulo Compras, somente leitura.
 *
 * ⚠️ ESTA ROTA EXISTE PORQUE O COMPRADOR NAO ALCANCA A DO ALMOXARIFADO:
 * `app.use('/api/almoxarifado', authenticateToken, checkModulePermission('almoxarifado'))`
 * (`routes/almoxarifado.js:282-285`) barra o prefixo INTEIRO antes de qualquer handler — quem tem
 * o modulo `compras` e nao tem o `almoxarifado` toma 403 em `GET /api/almoxarifado/materiais`
 * (`:353`) sem nunca chegar na rota. Sem esta porta o formulario de pedido (Task 5) nao escolhe
 * material. Descartado: dar o modulo almoxarifado ao comprador para resolver um `<select>`.
 *
 * ⚠️ O harness de teste LIBERA a camada 2 (`fakeCheckModulePermission`), entao a suite **nao
 * prova** o 403 de producao — a prova e a leitura daquelas quatro linhas. Declarado no cabecalho de
 * `tests/api/comprasPedidoImportar.api.test.js`, cenario (5).
 */
app.get('/api/compras/materiais', authenticateToken, checkModulePermission('compras'), async (req, res) => {
  try {
    res.json(await pedidoCompraService.buscarMateriais(db, req.query.search));
  } catch (e) {
    res.status(e.status || 500).json({ error: e.message });
  }
});

// Cotações
app.get('/api/compras/cotacoes', authenticateToken, checkModulePermission('compras'), (req, res) => {
  const { search, status } = req.query;
  let query = `SELECT c.*, f.razao_social as fornecedor_nome 
               FROM cotacoes c 
               LEFT JOIN fornecedores f ON c.fornecedor_id = f.id 
               WHERE 1=1`;
  const params = [];

  if (search) {
    query += ' AND (c.numero LIKE ? OR f.razao_social LIKE ?)';
    const searchTerm = `%${search}%`;
    params.push(searchTerm, searchTerm);
  }
  if (status) {
    query += ' AND c.status = ?';
    params.push(status);
  }

  query += ' ORDER BY c.created_at DESC';

  db.all(query, params, (err, rows) => {
    if (err) {
      return res.status(500).json({ error: err.message });
    }
    res.json(rows);
  });
});

// Delete genérico
app.delete('/api/compras/:tipo/:id', authenticateToken, checkModulePermission('compras'), (req, res) => {
  const { tipo, id } = req.params;
  const tables = {
    'fornecedores': 'fornecedores',
    'pedidos': 'pedidos_compra',
    'cotacoes': 'cotacoes'
  };

  // Validação de input
  if (!tipo || !id) {
    return res.status(400).json({ error: 'Tipo e ID são obrigatórios' });
  }

  // Validar que o ID é numérico
  const idNum = parseInt(id);
  if (isNaN(idNum) || idNum <= 0) {
    return res.status(400).json({ error: 'ID inválido' });
  }

  const table = tables[tipo];
  if (!table) {
    return res.status(400).json({ error: 'Tipo inválido' });
  }

  // Usar prepared statement para prevenir SQL injection
  const apagar = () => db.run(`DELETE FROM ${table} WHERE id = ?`, [idNum], function(err) {
    if (err) {
      console.error('Erro ao deletar:', err);
      return res.status(500).json({ error: 'Erro ao excluir item' });
    }
    if (this.changes === 0) {
      return res.status(404).json({ error: 'Item não encontrado' });
    }
    res.json({ message: 'Item excluído com sucesso' });
  });

  /**
   * ⚠️ FORNECEDOR COM PEDIDO NAO E APAGAVEL, e foi ESTA ETAPA que tornou o caminho alcancavel
   * (onda de correcao, F5 — achado I2 da revisao de UX, reproduzido por sonda contra o esquema de
   * PRODUCAO com `PRAGMA foreign_keys = ON`).
   *
   * `pedidos_compra` declara `FOREIGN KEY (fornecedor_id) REFERENCES fornecedores(id)`
   * (`index.js:19241`) e producao roda com a FK LIGADA (`sqliteConcurrency.js:50`). O generico faz
   * `DELETE FROM fornecedores WHERE id = ?` sem checar referencia: com pedido vinculado a sonda
   * mediu `SQLITE_CONSTRAINT: FOREIGN KEY constraint failed`, que cai no `catch` acima e responde
   * **500 'Erro ao excluir item'**. O comprador clica na lixeira, le uma frase generica, tenta de
   * novo e NUNCA fica sabendo que existe pedido vinculado — e o conserto da Task 5
   * (`Compras.js:126`, que passou a mostrar a literal do servidor) mostra justamente essa frase.
   *
   * Por que e achado desta etapa e nao divida antiga: a Fase 0 mediu `COUNT(pedidos_compra) = 0` e
   * **zero** codigo que inserisse um pedido. Antes da Etapa 38 nenhuma linha podia referenciar
   * `fornecedores`, entao o caminho era INALCANCAVEL. Esta e a primeira etapa que cria essas
   * linhas — e a primeira em que a lixeira da aba Fornecedores pode falhar.
   *
   * 409 ANTES do `DELETE`, e nao traducao da constraint no `catch`: a mensagem passa a ser a mesma
   * no harness (`foreign_keys = 0`, onde a FK nao dispararia e o fornecedor seria apagado deixando
   * o pedido apontando para o vazio) e em producao (onde a FK dispara). Um `catch` traduzido diria
   * a frase certa so no ambiente que tem a FK, e o teste nao poderia prova-la.
   *
   * Nenhum outro ramo do generico muda: `cotacoes` tem a MESMA FK e continua com `COUNT = 0` (sem
   * porta de criacao, sem risco), e `pedidos` aqui esta sombreado pela rota propria da Task 3.
   */
  if (tipo === 'fornecedores') {
    return db.get('SELECT COUNT(*) AS n FROM pedidos_compra WHERE fornecedor_id = ?', [idNum], (err, row) => {
      if (err) {
        console.error('Erro ao checar pedidos do fornecedor:', err);
        return res.status(500).json({ error: 'Erro ao excluir item' });
      }
      if ((row && row.n) > 0) {
        return res.status(409).json({ error: 'Fornecedor possui pedidos de compra — não pode ser excluído' });
      }
      return apagar();
    });
  }

  apagar();
});

// ---------- Grupos de fornecedores homologados (Compras) ----------
app.get('/api/compras/grupos', authenticateToken, checkModulePermission('compras'), (req, res) => {
  db.all('SELECT * FROM grupos_compras WHERE ativo = 1 ORDER BY COALESCE(numero, 999) ASC, ordem ASC, nome ASC', [], (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(rows || []);
  });
});
app.get('/api/compras/grupos/:id', authenticateToken, checkModulePermission('compras'), (req, res) => {
  const id = req.params.id;
  db.get('SELECT * FROM grupos_compras WHERE id = ? AND ativo = 1', [id], (err, row) => {
    if (err) return res.status(500).json({ error: err.message });
    if (!row) return res.status(404).json({ error: 'Grupo não encontrado' });
    res.json(row);
  });
});
app.post('/api/compras/grupos', authenticateToken, checkModulePermission('compras'), (req, res) => {
  const body = req.body || {};
  const nome = (body.nome || '').trim();
  if (!nome) return res.status(400).json({ error: 'Nome do grupo é obrigatório' });
  const numero = parseInt(body.numero, 10);
  const ordem = parseInt(body.ordem, 10) || 0;
  db.run('INSERT INTO grupos_compras (nome, numero, ordem, ativo) VALUES (?, ?, ?, 1)', [nome, isNaN(numero) || numero < 10 ? 10 : numero, ordem], function(err) {
    if (err) return res.status(500).json({ error: err.message });
    res.status(201).json({ id: this.lastID, nome, numero: isNaN(numero) || numero < 10 ? 10 : numero, ordem });
  });
});
app.put('/api/compras/grupos/:id', authenticateToken, checkModulePermission('compras'), (req, res) => {
  const id = req.params.id;
  const body = req.body || {};
  const nome = (body.nome || '').trim();
  if (!nome) return res.status(400).json({ error: 'Nome do grupo é obrigatório' });
  const numero = parseInt(body.numero, 10);
  const ordem = parseInt(body.ordem, 10) || 0;
  db.run('UPDATE grupos_compras SET nome = ?, numero = ?, ordem = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?', [nome, isNaN(numero) || numero < 10 ? 10 : numero, ordem, id], function(err) {
    if (err) return res.status(500).json({ error: err.message });
    if (this.changes === 0) return res.status(404).json({ error: 'Grupo não encontrado' });
    res.json({ id, nome, numero: isNaN(numero) || numero < 10 ? 10 : numero, ordem });
  });
});
app.delete('/api/compras/grupos/:id', authenticateToken, checkModulePermission('compras'), (req, res) => {
  const id = req.params.id;
  db.run('UPDATE grupos_compras SET ativo = 0, updated_at = CURRENT_TIMESTAMP WHERE id = ?', [id], function(err) {
    if (err) return res.status(500).json({ error: err.message });
    if (this.changes === 0) return res.status(404).json({ error: 'Grupo não encontrado' });
    res.json({ message: 'Grupo desativado' });
  });
});
app.post('/api/compras/grupos/:id/foto', authenticateToken, checkModulePermission('compras'), uploadGrupoCompras.single('foto'), (req, res) => {
  const id = req.params.id;
  if (!req.file || !req.file.filename) return res.status(400).json({ error: 'Nenhuma imagem enviada' });
  const filename = req.file.filename;
  db.get('SELECT * FROM grupos_compras WHERE id = ?', [id], (err, grupo) => {
    if (err) return res.status(500).json({ error: err.message });
    if (!grupo) return res.status(404).json({ error: 'Grupo não encontrado' });
    const oldFoto = grupo.foto;
    db.run('UPDATE grupos_compras SET foto = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?', [filename, id], (updateErr) => {
      if (updateErr) return res.status(500).json({ error: updateErr.message });
      if (oldFoto) {
        const oldPath = path.join(uploadsGruposComprasDir, oldFoto);
        if (fs.existsSync(oldPath)) fs.unlinkSync(oldPath);
      }
      res.json({ foto: filename, url: '/api/uploads/grupos-compras/' + filename });
    });
  });
});
app.post('/api/compras/grupos/:id/foto-base64', authenticateToken, checkModulePermission('compras'), (req, res) => {
  try {
    const id = req.params.id;
    const b64 = req.body && req.body.foto_base64;
    if (!b64 || typeof b64 !== 'string') return res.status(400).json({ error: 'foto_base64 é obrigatório' });
    const match = b64.match(/^data:image\/(\w+);base64,(.+)$/);
    let ext = '.jpg';
    let buf = b64;
    if (match) {
      ext = match[1] === 'jpeg' ? '.jpg' : '.' + match[1];
      buf = Buffer.from(match[2], 'base64');
    } else {
      buf = Buffer.from(b64, 'base64');
    }
    if (!fs.existsSync(uploadsGruposComprasDir)) fs.mkdirSync(uploadsGruposComprasDir, { recursive: true });
    const filename = 'grupo_compras_' + id + '_' + Date.now() + ext;
    const filePath = path.join(uploadsGruposComprasDir, filename);
    fs.writeFile(filePath, buf, (err) => {
      if (err) return res.status(500).json({ error: 'Erro ao salvar arquivo: ' + err.message });
      db.get('SELECT * FROM grupos_compras WHERE id = ?', [id], (dbErr, grupo) => {
        if (dbErr) return res.status(500).json({ error: dbErr.message });
        if (!grupo) return res.status(404).json({ error: 'Grupo não encontrado' });
        const oldFoto = grupo.foto;
        db.run('UPDATE grupos_compras SET foto = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?', [filename, id], (upErr) => {
          if (upErr) return res.status(500).json({ error: upErr.message });
          if (oldFoto) {
            const oldPath = path.join(uploadsGruposComprasDir, oldFoto);
            if (fs.existsSync(oldPath)) fs.unlinkSync(oldPath);
          }
          res.json({ foto: filename, url: '/api/uploads/grupos-compras/' + filename });
        });
      });
    });
  } catch (e) {
    console.error('Erro foto-base64 grupo compras:', e);
    res.status(500).json({ error: e.message || 'Erro ao processar foto' });
  }
});

// Fornecedores de um grupo (homologados no grupo)
app.get('/api/compras/grupos/:grupoId/fornecedores', authenticateToken, checkModulePermission('compras'), (req, res) => {
  const grupoId = req.params.grupoId;
  db.all('SELECT * FROM fornecedores WHERE grupo_id = ? AND status = ? ORDER BY razao_social', [grupoId, 'ativo'], (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(rows || []);
  });
});

// Criar fornecedor (opcional: grupo_id para já homologar no grupo)
app.post('/api/compras/fornecedores', authenticateToken, checkModulePermission('compras'), (req, res) => {
  const body = req.body || {};
  const razao_social = (body.razao_social || '').trim();
  const nome_fantasia = (body.nome_fantasia || '').trim();
  const cnpj = (body.cnpj || '').trim();
  const contato = body.contato != null ? String(body.contato).trim() : null;
  const email = body.email != null ? String(body.email).trim() : null;
  const telefone = body.telefone != null ? String(body.telefone).trim() : null;
  const grupo_id = body.grupo_id != null ? (parseInt(body.grupo_id, 10) || null) : null;
  if (!razao_social) return res.status(400).json({ error: 'Razão social é obrigatória' });
  db.run('INSERT INTO fornecedores (razao_social, nome_fantasia, cnpj, contato, email, telefone, grupo_id, status) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
    [razao_social, nome_fantasia, cnpj, contato, email, telefone, grupo_id, 'ativo'], function(err) {
    if (err) return res.status(500).json({ error: err.message });
    res.status(201).json({ id: this.lastID, razao_social, nome_fantasia, grupo_id });
  });
});

// Atualizar fornecedor (ex.: grupo_id para homologar no grupo)
app.put('/api/compras/fornecedores/:id', authenticateToken, checkModulePermission('compras'), (req, res) => {
  const id = req.params.id;
  const body = req.body || {};
  const razao_social = (body.razao_social || '').trim();
  const nome_fantasia = (body.nome_fantasia || '').trim();
  const cnpj = (body.cnpj || '').trim();
  const contato = body.contato != null ? String(body.contato).trim() : null;
  const email = body.email != null ? String(body.email).trim() : null;
  const telefone = body.telefone != null ? String(body.telefone).trim() : null;
  const endereco = body.endereco != null ? String(body.endereco).trim() : null;
  const grupo_id = body.grupo_id != null ? (parseInt(body.grupo_id, 10) || null) : undefined;
  if (!razao_social) return res.status(400).json({ error: 'Razão social é obrigatória' });
  const updates = ['razao_social = ?', 'nome_fantasia = ?', 'cnpj = ?', 'contato = ?', 'email = ?', 'telefone = ?', 'endereco = ?', 'updated_at = CURRENT_TIMESTAMP'];
  const params = [razao_social, nome_fantasia, cnpj, contato, email, telefone, endereco];
  if (grupo_id !== undefined) {
    updates.push('grupo_id = ?');
    params.push(grupo_id);
  }
  params.push(id);
  db.run('UPDATE fornecedores SET ' + updates.join(', ') + ' WHERE id = ?', params, function(err) {
    if (err) return res.status(500).json({ error: err.message });
    if (this.changes === 0) return res.status(404).json({ error: 'Fornecedor não encontrado' });
    res.json({ message: 'Fornecedor atualizado' });
  });
});

app.post('/api/compras/fornecedores/:id/foto', authenticateToken, checkModulePermission('compras'), uploadFornecedor.single('foto'), (req, res) => {
  const id = req.params.id;
  if (!req.file || !req.file.filename) return res.status(400).json({ error: 'Nenhuma imagem enviada' });
  const filename = req.file.filename;
  db.get('SELECT * FROM fornecedores WHERE id = ?', [id], (err, fornecedor) => {
    if (err) return res.status(500).json({ error: err.message });
    if (!fornecedor) return res.status(404).json({ error: 'Fornecedor não encontrado' });
    const oldFoto = fornecedor.foto;
    db.run('UPDATE fornecedores SET foto = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?', [filename, id], (updateErr) => {
      if (updateErr) return res.status(500).json({ error: updateErr.message });
      if (oldFoto) {
        const oldPath = path.join(uploadsFornecedoresDir, oldFoto);
        if (fs.existsSync(oldPath)) fs.unlinkSync(oldPath);
      }
      res.json({ foto: filename, url: '/api/uploads/fornecedores/' + filename });
    });
  });
});
app.post('/api/compras/fornecedores/:id/foto-base64', authenticateToken, checkModulePermission('compras'), (req, res) => {
  try {
    const id = req.params.id;
    const b64 = req.body && req.body.foto_base64;
    if (!b64 || typeof b64 !== 'string') return res.status(400).json({ error: 'foto_base64 é obrigatório' });
    const match = b64.match(/^data:image\/(\w+);base64,(.+)$/);
    let ext = '.jpg';
    let buf = b64;
    if (match) {
      ext = match[1] === 'jpeg' ? '.jpg' : '.' + match[1];
      buf = Buffer.from(match[2], 'base64');
    } else {
      buf = Buffer.from(b64, 'base64');
    }
    if (!fs.existsSync(uploadsFornecedoresDir)) fs.mkdirSync(uploadsFornecedoresDir, { recursive: true });
    const filename = 'fornecedor_' + id + '_' + Date.now() + ext;
    const filePath = path.join(uploadsFornecedoresDir, filename);
    fs.writeFile(filePath, buf, (err) => {
      if (err) return res.status(500).json({ error: 'Erro ao salvar arquivo: ' + err.message });
      db.get('SELECT * FROM fornecedores WHERE id = ?', [id], (dbErr, fornecedor) => {
        if (dbErr) return res.status(500).json({ error: dbErr.message });
        if (!fornecedor) return res.status(404).json({ error: 'Fornecedor não encontrado' });
        const oldFoto = fornecedor.foto;
        db.run('UPDATE fornecedores SET foto = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?', [filename, id], (upErr) => {
          if (upErr) return res.status(500).json({ error: upErr.message });
          if (oldFoto) {
            const oldPath = path.join(uploadsFornecedoresDir, oldFoto);
            if (fs.existsSync(oldPath)) fs.unlinkSync(oldPath);
          }
          res.json({ foto: filename, url: '/api/uploads/fornecedores/' + filename });
        });
      });
    });
  } catch (e) {
    console.error('Erro foto-base64 fornecedor:', e);
    res.status(500).json({ error: e.message || 'Erro ao processar foto' });
  }
});

// Itens padrão / lista de preços do fornecedor
app.get('/api/compras/fornecedores/:fornecedorId/itens', authenticateToken, checkModulePermission('compras'), (req, res) => {
  const fornecedorId = req.params.fornecedorId;
  db.all('SELECT * FROM itens_fornecedor WHERE fornecedor_id = ? ORDER BY descricao', [fornecedorId], (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(rows || []);
  });
});
app.post('/api/compras/fornecedores/:fornecedorId/itens', authenticateToken, checkModulePermission('compras'), (req, res) => {
  const fornecedorId = req.params.fornecedorId;
  const body = req.body || {};
  const codigo = (body.codigo || '').trim();
  const descricao = (body.descricao || '').trim();
  const unidade = (body.unidade || 'UN').trim();
  const preco = parseFloat(body.preco);
  const observacoes = (body.observacoes || '').trim();
  if (!descricao) return res.status(400).json({ error: 'Descrição é obrigatória' });
  db.run('INSERT INTO itens_fornecedor (fornecedor_id, codigo, descricao, unidade, preco, observacoes) VALUES (?, ?, ?, ?, ?, ?)',
    [fornecedorId, codigo || null, descricao, unidade || 'UN', isNaN(preco) ? 0 : preco, observacoes || null], function(err) {
    if (err) return res.status(500).json({ error: err.message });
    res.status(201).json({ id: this.lastID, fornecedor_id: parseInt(fornecedorId, 10), codigo, descricao, unidade, preco: isNaN(preco) ? 0 : preco, observacoes: observacoes || null });
  });
});
app.put('/api/compras/fornecedores/:fornecedorId/itens/:id', authenticateToken, checkModulePermission('compras'), (req, res) => {
  const { fornecedorId, id } = req.params;
  const body = req.body || {};
  const codigo = (body.codigo || '').trim();
  const descricao = (body.descricao || '').trim();
  const unidade = (body.unidade || 'UN').trim();
  const preco = parseFloat(body.preco);
  const observacoes = (body.observacoes || '').trim();
  if (!descricao) return res.status(400).json({ error: 'Descrição é obrigatória' });
  db.run('UPDATE itens_fornecedor SET codigo = ?, descricao = ?, unidade = ?, preco = ?, observacoes = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND fornecedor_id = ?',
    [codigo || null, descricao, unidade || 'UN', isNaN(preco) ? 0 : preco, observacoes || null, id, fornecedorId], function(err) {
    if (err) return res.status(500).json({ error: err.message });
    if (this.changes === 0) return res.status(404).json({ error: 'Item não encontrado' });
    res.json({ message: 'Item atualizado' });
  });
});
app.delete('/api/compras/fornecedores/:fornecedorId/itens/:id', authenticateToken, checkModulePermission('compras'), (req, res) => {
  const { fornecedorId, id } = req.params;
  db.run('DELETE FROM itens_fornecedor WHERE id = ? AND fornecedor_id = ?', [id, fornecedorId], function(err) {
    if (err) return res.status(500).json({ error: err.message });
    if (this.changes === 0) return res.status(404).json({ error: 'Item não encontrado' });
    res.json({ message: 'Item excluído' });
  });
});

// Salvar planilha do fornecedor (para visualização no software)
app.post('/api/compras/fornecedores/:fornecedorId/planilha', authenticateToken, checkModulePermission('compras'), (req, res) => {
  const fornecedorId = req.params.fornecedorId;
  const body = req.body || {};
  const nome = (body.nome || body.nomeArquivo || '').trim() || 'planilha';
  const linhas = body.linhas || body.rows || [];
  if (!Array.isArray(linhas)) {
    return res.status(400).json({ error: 'Envie "linhas" com array de linhas (array de arrays)' });
  }
  const planilhaDados = JSON.stringify(linhas);
  db.run(
    'UPDATE fornecedores SET planilha_dados = ?, planilha_nome = ?, planilha_atualizado_em = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
    [planilhaDados, nome, fornecedorId],
    function(err) {
      if (err) return res.status(500).json({ error: err.message });
      if (this.changes === 0) return res.status(404).json({ error: 'Fornecedor não encontrado' });
      res.json({ message: 'Planilha salva', nome, linhas: linhas.length });
    }
  );
});

// Obter planilha salva do fornecedor (para visualização no software)
app.get('/api/compras/fornecedores/:fornecedorId/planilha', authenticateToken, checkModulePermission('compras'), (req, res) => {
  const fornecedorId = req.params.fornecedorId;
  db.get('SELECT planilha_dados, planilha_nome, planilha_atualizado_em FROM fornecedores WHERE id = ?', [fornecedorId], (err, row) => {
    if (err) return res.status(500).json({ error: err.message });
    if (!row) return res.status(404).json({ error: 'Fornecedor não encontrado' });
    let linhas = [];
    if (row.planilha_dados) {
      try {
        linhas = JSON.parse(row.planilha_dados);
      } catch (_) {}
    }
    res.json({ nome: row.planilha_nome || null, linhas, atualizado_em: row.planilha_atualizado_em || null });
  });
});

// Importar itens do fornecedor via planilha (JSON de linhas ou arquivo)
// Aceita qualquer formato: o backend tenta achar descrição, código, unidade e preço em várias chaves possíveis
// ⚠️ OS 5 HELPERS DE PLANILHA MORAM AGORA EM `services/compras/planilhaCompras.js` (Task 4),
// requeridos no topo deste arquivo. Foram movidos VERBATIM (md5 das 48 linhas conferido) porque
// a importacao de PEDIDOS precisa dos mesmos leitores e, presos no escopo deste registrador,
// eles eram inalcancaveis por `require` — e exportar daqui criaria ciclo com o servico.
app.post('/api/compras/fornecedores/:fornecedorId/itens/importar', authenticateToken, checkModulePermission('compras'), (req, res) => {
  const fornecedorId = req.params.fornecedorId;
  const body = req.body || {};
  const linhas = body.linhas || body.rows || [];
  if (!Array.isArray(linhas) || linhas.length === 0) {
    return res.status(400).json({ error: 'Envie "linhas" ou "rows" com array de objetos (qualquer formato de planilha)' });
  }
  let inseridos = 0;
  const next = (i) => {
    if (i >= linhas.length) return res.json({ message: 'Importação concluída', inseridos });
    const row = linhas[i];
    const descricao = extrairDescricaoDoRow(row);
    if (!descricao) return next(i + 1);
    const codigo = extrairDoRow(row, 'codigo', 'código', 'cod', 'sku', 'referencia', 'referência', 'ref') || null;
    const unidade = (extrairDoRow(row, 'unidade', 'und', 'um', 'un', 'unid') || 'UN').trim();
    const preco = extrairPrecoDoRow(row);
    db.run('INSERT INTO itens_fornecedor (fornecedor_id, codigo, descricao, unidade, preco) VALUES (?, ?, ?, ?, ?)',
      [fornecedorId, codigo, descricao, unidade || 'UN', preco], function(err) {
        if (err) return res.status(500).json({ error: err.message });
        inseridos++;
        next(i + 1);
      });
  };
  next(0);
});

};
