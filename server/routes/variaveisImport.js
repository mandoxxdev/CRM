/**
 * Importação de variáveis técnicas por planilha.
 *
 * Três rotas, na ordem em que o usuário as usa:
 *
 *   GET  /api/variaveis-tecnicas/importacao/modelo    baixa o .xlsx modelo
 *   POST /api/variaveis-tecnicas/importacao/analisar  sobe o arquivo e vê o preview
 *   POST /api/variaveis-tecnicas/importacao/confirmar aplica as decisões
 *
 * "analisar" nunca grava. Ele estaciona o resultado em memória sob um token e
 * devolve o relatório; "confirmar" trabalha em cima desse resultado estacionado,
 * não de dados reenviados pelo cliente — assim o que foi revisado na tela é
 * exatamente o que vai para o banco.
 */

const crypto = require('crypto');
const multer = require('multer');

const { parsePlanilha } = require('../services/variaveisImport/parser');
const { analisar, planejarAplicacao, ACOES } = require('../services/variaveisImport/analise');
const { dbRun, dbGet, dbAll } = require('../services/variaveisImport/db');
const { isSystemAdmin, canAccessAdministrativoConfig } = require('../services/systemPermissions');

const LIMITE_ARQUIVO_BYTES = 5 * 1024 * 1024;
const TTL_ANALISE_MS = 30 * 60 * 1000; // meia hora entre revisar e confirmar
const MAX_ANALISES_MEMORIA = 50;

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: LIMITE_ARQUIVO_BYTES },
  fileFilter: (req, file, cb) => {
    const nome = String(file.originalname || '').toLowerCase();
    if (/\.(xlsx|xlsm|xls|csv)$/.test(nome)) return cb(null, true);
    cb(new Error('Formato não suportado. Envie .xlsx, .xls ou .csv'));
  }
});

// token -> { usuarioId, relatorio, arquivo, criadoEm }
const analisesEmMemoria = new Map();

function limparAnalisesVencidas() {
  const agora = Date.now();
  analisesEmMemoria.forEach((v, k) => {
    if (agora - v.criadoEm > TTL_ANALISE_MS) analisesEmMemoria.delete(k);
  });
  // Trava de segurança: se muitos admins importarem ao mesmo tempo, descarta as
  // análises mais antigas em vez de deixar a memória crescer sem limite.
  while (analisesEmMemoria.size > MAX_ANALISES_MEMORIA) {
    const maisVelha = analisesEmMemoria.keys().next().value;
    analisesEmMemoria.delete(maisVelha);
  }
}

module.exports = function (app, db, authenticateToken) {
  /** Importar em massa mexe em cadastro que alimenta todas as propostas: só admin. */
  function exigirAdmin(req, res, next) {
    if (isSystemAdmin(req.user) || canAccessAdministrativoConfig(req.user)) return next();
    return res.status(403).json({ error: 'Apenas administradores podem importar variáveis' });
  }

  function registrarAuditoria(req, acao, detalhes) {
    db.run(
      `INSERT INTO logs_auditoria
       (usuario_id, usuario_nome, usuario_email, tipo, modulo, nome_modulo, acao, detalhes, ip_address, user_agent, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))`,
      [
        req.user && req.user.id ? req.user.id : null,
        (req.user && req.user.nome) || null,
        (req.user && req.user.email) || null,
        'importacao_variaveis',
        'comercial',
        'Variáveis Técnicas',
        acao,
        JSON.stringify(detalhes || {}),
        req.ip || null,
        req.get ? req.get('user-agent') : null
      ],
      (err) => { if (err) console.error('Auditoria importação variáveis:', err.message); }
    );
  }

  // ---------------------------------------------------------------- modelo
  app.get('/api/variaveis-tecnicas/importacao/modelo', authenticateToken, exigirAdmin, (req, res) => {
    let ExcelJS;
    try {
      ExcelJS = require('exceljs');
    } catch (e) {
      return res.status(500).json({ error: 'Dependência exceljs indisponível no servidor' });
    }

    Promise.all([
      dbAll(db, 'SELECT nome FROM familias_produto WHERE ativo = 1 ORDER BY ordem, nome'),
      dbAll(db, 'SELECT chave, nome, sufixo, opcoes FROM variaveis_tecnicas WHERE ativo = 1 ORDER BY ordem, nome'),
      dbAll(db, `SELECT fv.variavel_chave AS chave, f.nome AS familia
                 FROM familia_variaveis fv
                 JOIN familias_produto f ON f.id = fv.familia_id AND f.ativo = 1
                 WHERE fv.ativo = 1
                 ORDER BY f.ordem, f.nome`)
    ]).then(async ([familias, variaveis, vinculos]) => {
      // Famílias de cada variável, para a planilha sair com o vínculo atual.
      const familiasPorChave = new Map();
      vinculos.forEach((v) => {
        if (!familiasPorChave.has(v.chave)) familiasPorChave.set(v.chave, []);
        familiasPorChave.get(v.chave).push(v.familia);
      });

      // Uma linha por opção. Variável sem opção ocupa uma linha com a opção
      // vazia — assim ela também pode ser editada e não some da planilha.
      const linhas = [];
      variaveis.forEach((v) => {
        const fams = familiasPorChave.get(v.chave) || [];
        let opcoes = v.opcoes;
        if (typeof opcoes === 'string') { try { opcoes = JSON.parse(opcoes); } catch (_) { opcoes = []; } }
        if (!Array.isArray(opcoes)) opcoes = [];
        const lista = opcoes
          .map((o) => (typeof o === 'string' ? o : (o && o.valor != null ? String(o.valor) : '')))
          .filter(Boolean);

        if (lista.length === 0) linhas.push({ nome: v.nome, valor: '', unidade: v.sufixo || '', familias: fams });
        else lista.forEach((valor) => linhas.push({ nome: v.nome, valor, unidade: v.sufixo || '', familias: fams }));
      });

      // Planilha vazia ainda precisa ensinar o formato.
      if (linhas.length === 0) {
        const exFam = familias.length > 0 ? [familias[0].nome] : [];
        linhas.push({ nome: 'Acabamento', valor: 'Escovado', unidade: '', familias: exFam });
        linhas.push({ nome: 'Acabamento', valor: 'Usinado', unidade: '', familias: [] });
      }

      const wb = new ExcelJS.Workbook();
      wb.creator = 'GMP Industriais';
      wb.created = new Date();

      const ws = wb.addWorksheet('Variáveis', { views: [{ state: 'frozen', xSplit: 3, ySplit: 1 }] });

      // Colunas fixas + uma coluna por família. A pessoa marca X em vez de
      // digitar o nome — elimina erro de grafia por completo.
      ws.columns = [
        { header: 'Variável', key: 'nome', width: 40 },
        { header: 'Opção', key: 'valor', width: 38 },
        { header: 'Unidade', key: 'unidade', width: 10 }
      ].concat(familias.map((f, i) => ({ header: f.nome, key: 'f' + i, width: 5 })));

      linhas.forEach((l) => {
        const linha = { nome: l.nome, valor: l.valor, unidade: l.unidade };
        familias.forEach((f, i) => { if (l.familias.indexOf(f.nome) !== -1) linha['f' + i] = 'X'; });
        ws.addRow(linha);
      });

      // Cabeçalho: nomes de família na vertical, senão 20 colunas não cabem.
      const cab = ws.getRow(1);
      cab.height = 150;
      cab.font = { bold: true, size: 10 };
      cab.eachCell((cell, col) => {
        cell.alignment = col <= 3
          ? { vertical: 'bottom', horizontal: 'left' }
          : { textRotation: 90, vertical: 'bottom', horizontal: 'center' };
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: col <= 3 ? 'FFE8EEF7' : 'FFF3F6FA' } };
        cell.border = { bottom: { style: 'thin', color: { argb: 'FFB0BEC5' } } };
      });

      const ultimaLinha = Math.max(linhas.length + 1, 500); // espaço para novas linhas
      const letra = (n) => {
        let s = '';
        while (n > 0) { const r = (n - 1) % 26; s = String.fromCharCode(65 + r) + s; n = Math.floor((n - 1) / 26); }
        return s;
      };

      // Lista de apoio com os nomes das variáveis já cadastradas, usada como
      // origem do dropdown da coluna "Variável".
      const wsListas = wb.addWorksheet('Listas', { state: 'veryHidden' });
      wsListas.getCell('A1').value = 'Variáveis cadastradas';
      variaveis.forEach((v, i) => { wsListas.getCell('A' + (i + 2)).value = v.nome; });

      for (let r = 2; r <= ultimaLinha; r++) {
        if (variaveis.length > 0) {
          // Aviso, não bloqueio: precisa aceitar nome novo que ainda não existe.
          ws.getCell('A' + r).dataValidation = {
            type: 'list',
            allowBlank: true,
            formulae: [`=Listas!$A$2:$A$${variaveis.length + 1}`],
            showErrorMessage: false
          };
        }
        // Coluna de família: só X ou vazio, com bloqueio de verdade.
        for (let c = 4; c < 4 + familias.length; c++) {
          ws.getCell(letra(c) + r).dataValidation = {
            type: 'list',
            allowBlank: true,
            formulae: ['"X"'],
            showErrorMessage: true,
            errorStyle: 'stop',
            errorTitle: 'Marcação inválida',
            error: 'Escolha X para marcar, ou deixe a célula vazia.'
          };
        }
      }

      const wsAjuda = wb.addWorksheet('Ajuda');
      wsAjuda.columns = [{ width: 16 }, { width: 78 }];
      [
        ['COMO PREENCHER', ''],
        ['', ''],
        ['Variável', 'O nome que aparece na proposta. Ex: Acabamento'],
        ['Opção', 'Um item da lista. Ex: Escovado. Deixe vazio se for texto livre.'],
        ['Unidade', 'Opcional. Ex: kW, RPM, mm.'],
        ['Famílias', 'As colunas da direita são os equipamentos. Marque X onde a opção vale.'],
        ['', ''],
        ['Uma linha por opção.', 'Repita o nome da variável em cada linha dela.'],
        ['', ''],
        ['A planilha veio preenchida com o que está cadastrado hoje.', ''],
        ['Edite, acrescente linhas no fim e suba de volta.', ''],
        ['Nada é gravado sem você revisar e confirmar na tela.', '']
      ].forEach((l, i) => {
        const row = wsAjuda.addRow(l);
        if (i === 0) row.font = { bold: true, size: 12 };
        else row.getCell(1).font = { bold: true };
      });

      const buffer = await wb.xlsx.writeBuffer();
      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      res.setHeader('Content-Disposition', 'attachment; filename="variaveis-tecnicas.xlsx"');
      res.send(Buffer.from(buffer));
    }).catch((e) => {
      console.error('Erro ao gerar planilha de variáveis:', e);
      res.status(500).json({ error: e.message || 'Erro ao gerar a planilha' });
    });
  });

  // -------------------------------------------------------------- analisar
  app.post(
    '/api/variaveis-tecnicas/importacao/analisar',
    authenticateToken,
    exigirAdmin,
    (req, res, next) => {
      upload.single('arquivo')(req, res, (err) => {
        if (err) return res.status(400).json({ error: err.message || 'Falha no upload' });
        next();
      });
    },
    async (req, res) => {
      try {
        if (!req.file || !req.file.buffer) {
          return res.status(400).json({ error: 'Envie a planilha no campo "arquivo"' });
        }

        const limiar = req.body && req.body.limiar != null
          ? Math.max(0.5, Math.min(1, parseFloat(req.body.limiar)))
          : undefined;

        const lido = parsePlanilha(req.file.buffer);
        if (lido.variaveis.length === 0) {
          return res.status(400).json({
            error: 'Nenhuma variável encontrada na planilha.',
            erros: lido.erros,
            avisos: lido.avisos
          });
        }

        const [variaveisExistentes, familiasExistentes] = await Promise.all([
          dbAll(db, 'SELECT id, chave, nome, tipo, categoria, prefixo, sufixo, ordem, opcoes FROM variaveis_tecnicas WHERE ativo = 1'),
          dbAll(db, 'SELECT id, nome, codigo FROM familias_produto WHERE ativo = 1')
        ]);

        const relatorio = analisar(
          lido.variaveis,
          variaveisExistentes,
          familiasExistentes,
          lido.familias,
          limiar != null ? { limiar } : undefined
        );

        limparAnalisesVencidas();
        const token = crypto.randomBytes(16).toString('hex');
        analisesEmMemoria.set(token, {
          usuarioId: req.user && req.user.id,
          relatorio,
          arquivo: req.file.originalname || 'planilha.xlsx',
          criadoEm: Date.now()
        });

        res.json({
          token,
          arquivo: req.file.originalname,
          resumo: relatorio.resumo,
          limiar: relatorio.limiar,
          itens: relatorio.itens,
          familiasLegenda: lido.familias,
          erros: lido.erros,
          avisos: lido.avisos,
          expiraEm: new Date(Date.now() + TTL_ANALISE_MS).toISOString()
        });
      } catch (e) {
        console.error('Erro ao analisar planilha de variáveis:', e);
        res.status(500).json({ error: e.message || 'Erro ao analisar planilha' });
      }
    }
  );

  // ------------------------------------------------------------- confirmar
  app.post('/api/variaveis-tecnicas/importacao/confirmar', authenticateToken, exigirAdmin, async (req, res) => {
    const body = req.body || {};
    const token = body.token;
    if (!token) return res.status(400).json({ error: 'Token da análise é obrigatório' });

    limparAnalisesVencidas();
    const staged = analisesEmMemoria.get(token);
    if (!staged) {
      return res.status(410).json({ error: 'Análise expirada ou não encontrada. Envie a planilha novamente.' });
    }
    if (staged.usuarioId && req.user && staged.usuarioId !== req.user.id) {
      return res.status(403).json({ error: 'Esta análise pertence a outro usuário' });
    }

    const { operacoes, pendentes } = planejarAplicacao(
      staged.relatorio,
      body.decisoes || {},
      { aplicarFamilias: body.aplicarFamilias !== false }
    );

    const resultado = { criadas: 0, atualizadas: 0, ignoradas: 0, opcoesGravadas: 0, vinculosFamilia: 0, detalhes: [] };

    try {
      await dbRun(db, 'BEGIN IMMEDIATE');

      for (const op of operacoes) {
        if (op.tipo === 'ignorar') {
          resultado.ignoradas++;
          resultado.detalhes.push({ chave: op.chave, nome: op.nome, acao: 'mantida a atual' });
          continue;
        }

        const opcoesJson = op.opcoesFinais.length > 0 ? JSON.stringify(op.opcoesFinais) : null;
        let chaveGravada = op.chave;

        if (op.tipo === 'criar') {
          const d = op.dados;
          // A chave é única na tabela; se colidir com uma inativa, sufixa para
          // não estourar a constraint e perder a linha.
          let chave = d.chave;
          const colisao = await dbGet(db, 'SELECT id FROM variaveis_tecnicas WHERE chave = ?', [chave]);
          if (colisao) chave = chave + '_' + Date.now().toString().slice(-4);
          chaveGravada = chave;

          const r = await dbRun(
            db,
            `INSERT INTO variaveis_tecnicas
             (nome, chave, categoria, tipo, opcoes, ordem, prefixo, sufixo, fonte_opcoes, grupo_compras_id, ativo)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, 1)`,
            [
              d.nome, chave, d.categoria, d.tipo, opcoesJson,
              d.ordem != null ? d.ordem : 0, d.prefixo, d.sufixo,
              d.tipo === 'lista' ? 'manual' : null
            ]
          );
          resultado.criadas++;
          resultado.opcoesGravadas += op.opcoesFinais.length;
          resultado.detalhes.push({ chave, nome: d.nome, acao: 'criada', id: r.lastID, opcoes: op.opcoesFinais.length });
        } else {
          const d = op.dados;
          chaveGravada = op.alvoChave;

          if (op.atualizarCadastro) {
            await dbRun(
              db,
              `UPDATE variaveis_tecnicas
               SET nome = ?, categoria = ?, tipo = ?, opcoes = ?, ordem = ?, prefixo = ?, sufixo = ?,
                   fonte_opcoes = COALESCE(?, fonte_opcoes), updated_at = CURRENT_TIMESTAMP
               WHERE id = ?`,
              [
                d.nome, d.categoria, d.tipo, opcoesJson,
                d.ordem != null ? d.ordem : 0, d.prefixo, d.sufixo,
                d.tipo === 'lista' ? 'manual' : null,
                op.alvoId
              ]
            );
          } else {
            // mesclar_opcoes: mexe só na lista, preserva nome/tipo/unidade.
            await dbRun(
              db,
              'UPDATE variaveis_tecnicas SET opcoes = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
              [opcoesJson, op.alvoId]
            );
          }
          resultado.atualizadas++;
          resultado.opcoesGravadas += op.opcoesFinais.length;
          resultado.detalhes.push({
            chave: chaveGravada,
            nome: d.nome,
            acao: op.acao === ACOES.SOBRESCREVER ? 'sobrescrita' : 'opções mescladas',
            id: op.alvoId,
            opcoes: op.opcoesFinais.length
          });
        }

        // Vínculo variável <-> família (é o que faz a variável aparecer nas
        // propostas daquela família).
        for (const fam of op.familias) {
          await dbRun(
            db,
            'INSERT OR REPLACE INTO familia_variaveis (familia_id, variavel_chave, ordem, ativo) VALUES (?, ?, COALESCE((SELECT ordem FROM familia_variaveis WHERE familia_id = ? AND variavel_chave = ?), ?), 1)',
            [fam.id, chaveGravada, fam.id, chaveGravada, op.dados.ordem != null ? op.dados.ordem : 0]
          );
          resultado.vinculosFamilia++;
        }

        // Valor que só vale para certas famílias vira opção por família.
        for (const opc of op.opcoesComFamilia) {
          for (const token2 of (opc.familias || [])) {
            const fam = op.familias.find((f) => f.token === token2);
            if (!fam) continue;
            await dbRun(
              db,
              'INSERT OR IGNORE INTO familia_variavel_opcoes (familia_id, variavel_chave, valor, ordem, ativo) VALUES (?, ?, ?, 0, 1)',
              [fam.id, chaveGravada, opc.valor]
            );
          }
        }
      }

      await dbRun(db, 'COMMIT');
    } catch (e) {
      try { await dbRun(db, 'ROLLBACK'); } catch (_) {}
      console.error('Erro ao confirmar importação de variáveis:', e);
      return res.status(500).json({ error: e.message || 'Erro ao gravar importação. Nada foi alterado.' });
    }

    analisesEmMemoria.delete(token);

    registrarAuditoria(req, 'importacao_confirmada', {
      arquivo: staged.arquivo,
      criadas: resultado.criadas,
      atualizadas: resultado.atualizadas,
      ignoradas: resultado.ignoradas,
      vinculosFamilia: resultado.vinculosFamilia,
      pendentes: pendentes.length
    });

    res.json({
      message: 'Importação concluída',
      arquivo: staged.arquivo,
      ...resultado,
      pendentes
    });
  });

  // Usado pelos testes para inspecionar/limpar o estacionamento em memória.
  app._variaveisImportStaging = analisesEmMemoria;

  console.log('✅ Importação de variáveis técnicas registrada (modelo/analisar/confirmar)');
};
