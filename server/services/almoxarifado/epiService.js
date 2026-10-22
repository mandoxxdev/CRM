/**
 * Entrega de EPI ao colaborador com assinatura na tela (Etapa 178, NR-6).
 *
 * Plano: docs/superpowers/plans/2026-10-22-almoxarifado-etapa178-entrega-de-epi-com-assinatura.md — as regras RN-178.01..11
 * e as emendas da Revisao da Fase 2 (C1, C2, I1..I5, menores), que prevalecem sobre a tabela de regras.
 *
 * A ORDEM (C1) e o que garante "nenhuma saida sem evidencia e nenhuma evidencia apontando para entrega que nao existe":
 *   1. valida tudo (colaborador ativo do cadastro, material EPI com CA vigente, sem serie/lote, quantidade inteira, PNG);
 *   2. gera o numero `EPI-…` e o `criado_em` no Node (o hash precisa dos dois ANTES do INSERT, e as tabelas nao aceitam UPDATE);
 *   3. a SAIDA pelo motor (`registrarMovimentacao` ja pega a trava do material — este servico NAO se embrulha em
 *      `naTravaDoMaterial`: a trava nao e reentrante, e a compensacao roda depois de a saida voltar);
 *   4. entrega + evidencia num unico `db.execEmTransacao` (BEGIN IMMEDIATE/COMMIT, ROLLBACK na mesma vaga), com o
 *      `movimentacao_id` ja conhecido — desde a Fase 5, dentro da fila da cadeia (`naFilaDaCadeia`: cabeca -> elo -> HMAC
 *      com o segredo fora do banco -> grava);
 *   5. falhou o passo 4 -> o estorno de COMPENSACAO da saida (`compensacao: true` — o estorno pelo livro dessa saida e
 *      recusado, C2; so a compensacao passa).
 * Desvio declarado do contrato de `inserirComNumeroUnico` (C1): o numero e gerado com `gerarNumeroDocumento` antes da saida,
 * sem retry — a colisao e ~0 (2,8e12 sufixos por ms) e, se acontecer, o UNIQUE derruba a transacao e a compensacao cobre.
 */
const path = require('path');
const { dbGet, dbAll } = require('./db');
const Q = require('./quantidade');
const stockService = require('./stockService');
const { gerarNumeroDocumento } = require('./numeroDoc');
const { materialPhotoUrl } = require('./materialPhoto');
const { registrarAuditoriaDoAto } = require('./audit');
const evidencia = require('./evidenciaAssinaturaService');
const { DEVOLUCAO_VIVA_SQL } = require('./devolucaoViva');
const diaLocal = require('../diaLocal');
// Etapa 180 (T1): a identificacao do colaborador mora num modulo comum — o termo de ferramenta usa a mesma regua.
const { colaboradorAtivo, conferirMatricula, conferirPng, chaveIdempotencia } = require('./identificacaoColaborador');

const CONTEXTO = 'ENTREGA_EPI';
const MOTIVOS = ['PRIMEIRA_ENTREGA', 'TROCA', 'PERDA', 'DANO'];

// Ganchos de teste (pelo OBJETO do modulo, como os monkeypatch de reservaChegadaService): `antesDaGravacao` roda depois da
// saida e antes da transacao — o teste da compensacao o usa para fazer a transacao falhar de verdade.
// Fase 5: `depoisDaGravacao` roda depois do COMMIT (o teste do M3 a usa para provar que o PNG nao e apagado dali em diante).
const ganchos = { antesDaGravacao: null, depoisDaGravacao: null };

const erro = (msg, status = 400) => Object.assign(new Error(msg), { status });

/** RN-178.01: as tres marcas de EPI que existem hoje. `m` = alias do material, `tm` = alias do tipo (LEFT JOIN). */
function ehEpiSql(m = 'm', tm = 'tm') {
  return `(COALESCE(${tm}.is_epi, 0) = 1 OR LOWER(TRIM(COALESCE(${m}.tipo_material, ''))) = 'epi'
    OR LOWER(TRIM(COALESCE(${m}.categoria, ''))) = 'epis')`;
}

function dataBr(iso) {
  const [a, m, d] = String(iso).slice(0, 10).split('-');
  return `${d}/${m}/${a}`;
}

/**
 * Os campos do registro que entram no `registro_sha256` — o MESMO montador na gravacao e na verificacao (a ida e volta pelo
 * SQLite nao muda o hash: texto ou null, numero por `Number`, quantidade por `Q.qtd`). `entrega` e `ev` sao as linhas (ou o
 * que vai virar as linhas). O `id` das duas e o `contexto_id` ficam FORA (nao existem antes do INSERT); o `numero` (UNIQUE)
 * amarra a evidencia a entrega.
 */
function camposDoRegistro(entrega, ev) {
  const { texto, numero } = evidencia;
  return {
    contexto: texto(ev.contexto),
    numero: texto(entrega.numero),
    colaborador_id: numero(entrega.colaborador_id),
    colaborador_nome: texto(entrega.colaborador_nome),
    matricula: texto(entrega.matricula),
    setor: texto(entrega.setor),
    material_id: numero(entrega.material_id),
    material_codigo: texto(entrega.material_codigo),
    material_nome: texto(entrega.material_nome),
    ca_numero: texto(entrega.ca_numero),
    ca_validade: texto(entrega.ca_validade),
    quantidade: Q.qtd(Number(entrega.quantidade)),
    tamanho: texto(entrega.tamanho),
    motivo: texto(entrega.motivo),
    observacao: texto(entrega.observacao),
    movimentacao_id: numero(entrega.movimentacao_id),
    entregue_por: numero(entrega.entregue_por),
    entregue_por_nome: texto(entrega.entregue_por_nome),
    criado_em: texto(entrega.criado_em),
    chave_idempotencia: texto(entrega.chave_idempotencia), // Fase 5 (M2)
    evidencia: {
      colaborador_id: numero(ev.colaborador_id),
      colaborador_nome: texto(ev.colaborador_nome),
      matricula: texto(ev.matricula),
      cpf: texto(ev.cpf),
      arquivo: texto(ev.arquivo),
      arquivo_sha256: texto(ev.arquivo_sha256),
      criado_por: numero(ev.criado_por),
      criado_por_nome: texto(ev.criado_por_nome),
      criado_em: texto(ev.criado_em),
      // Fase 5 (critico 1): o elo da cadeia dentro do HMAC — mudar a posicao ou o elo de uma evidencia muda o registro dela.
      sequencia: numero(ev.sequencia),
      hash_anterior: texto(ev.hash_anterior),
      // Fase 5 (importante 4): a identificacao do colaborador e de onde veio a assinatura.
      confirmado_por_matricula: numero(ev.confirmado_por_matricula),
      ip: texto(ev.ip),
      user_agent: texto(ev.user_agent),
    },
  };
}

/** `db.execEmTransacao` (sqliteConcurrency, producao). O harness usa a conexao crua: mesma semantica, num `exec` so. */
function execEmTransacao(db, corpo) {
  if (typeof db.execEmTransacao === 'function') return db.execEmTransacao(corpo);
  return new Promise((resolve, reject) => {
    db.exec(`BEGIN IMMEDIATE;\n${corpo}\nCOMMIT;`, (err) => {
      if (!err) return resolve();
      db.exec('ROLLBACK;', () => reject(err));
    });
  });
}

function validarOpcionais({ tamanho, motivo, observacao }) {
  const t = evidencia.textoLimpo(tamanho);
  if (t !== null && t.length > 20) throw erro('Tamanho deve ter no máximo 20 caracteres');
  const mo = evidencia.textoLimpo(motivo);
  if (mo !== null && !MOTIVOS.includes(mo)) throw erro('Motivo inválido');
  const o = evidencia.textoLimpo(observacao);
  if (o !== null && o.length > 500) throw erro('Observação deve ter no máximo 500 caracteres');
  return { tamanho: t, motivo: mo, observacao: o };
}

function quantidadeInteira(q) {
  const n = typeof q === 'string' ? (q.trim() === '' ? NaN : Number(q)) : (typeof q === 'number' ? q : NaN);
  if (!Number.isFinite(n) || !Number.isInteger(n) || n <= 0) throw erro('Quantidade de EPI deve ser inteira');
  return n;
}

async function materialEpi(db, materialId) {
  if (materialId === undefined || materialId === null || String(materialId).trim() === '') {
    throw erro('O EPI é obrigatório');
  }
  const id = Number(materialId);
  const m = Number.isInteger(id) && id > 0 ? await dbGet(db, `SELECT m.id, m.codigo, m.nome, m.ca_numero, m.ca_validade,
      m.controle_serie, m.controle_lote, ${ehEpiSql()} AS is_epi
    FROM materiais_almoxarifado m LEFT JOIN tipos_material_almoxarifado tm ON tm.id = m.tipo_material_id
    WHERE m.id = ?`, [id]) : null;
  if (!m) throw erro(`Material #${materialId ?? ''} não encontrado`);
  if (!m.is_epi) throw erro(`Material ${m.codigo} não é EPI`);
  // I3 (letra B, reversivel): a assinatura de uma entrega com serie/lote teria de dizer QUAL serie/lote — fica para depois.
  if (Number(m.controle_serie) === 1 || Number(m.controle_lote) === 1) {
    throw erro(`EPI ${m.codigo} com controle de série/lote não é suportado nesta etapa`);
  }
  const ca = evidencia.textoLimpo(m.ca_numero);
  if (!ca) throw erro(`EPI ${m.codigo} sem número de CA cadastrado`);
  const validade = evidencia.textoLimpo(m.ca_validade);
  // RN-178.04: vencido = anterior ao dia de Brasilia (no proprio dia ainda vale).
  if (validade && validade.slice(0, 10) < diaLocal.hojeLocalISO()) {
    throw erro(`O CA ${ca} do EPI ${m.codigo} venceu em ${dataBr(validade)}`);
  }
  return { ...m, ca_numero: ca, ca_validade: validade };
}

/**
 * A entrega ja gravada com esta chave, no formato do 201 + `reutilizada: true`, ou null. A mesma chave com outro colaborador, EPI
 * ou quantidade -> 409 (o front gera uma chave por tentativa; outra entrega com a mesma chave e engano do cliente).
 */
async function entregaDaChave(db, chave, { colaborador_id: colaboradorId, material_id: materialId, quantidade }) {
  const e = await dbGet(db, `SELECT e.id, e.numero, e.movimentacao_id, e.colaborador_id, e.material_id, e.quantidade,
      v.id AS evidencia_id, v.arquivo, v.arquivo_sha256, v.registro_sha256, v.criado_em
    FROM entregas_epi_almoxarifado e
    JOIN evidencias_assinatura_almoxarifado v ON v.contexto = ? AND v.contexto_id = e.id
    WHERE e.chave_idempotencia = ?`, [CONTEXTO, chave]);
  if (!e) return null;
  if (Number(e.colaborador_id) !== Number(colaboradorId) || Number(e.material_id) !== Number(materialId)
    || Q.qtd(Number(e.quantidade)) !== Q.qtd(Number(quantidade))) {
    throw erro('Chave de idempotência já usada em outra entrega', 409);
  }
  return {
    id: e.id,
    numero: e.numero,
    movimentacao_id: e.movimentacao_id,
    evidencia: {
      id: e.evidencia_id,
      arquivo_url: materialPhotoUrl(e.arquivo),
      arquivo_sha256: e.arquivo_sha256,
      registro_sha256: e.registro_sha256,
      criado_em: e.criado_em,
    },
    reutilizada: true,
  };
}

/**
 * Registra a entrega. `dados`: colaborador_id, material_id, quantidade, tamanho?, motivo?, observacao?. `arquivo`: o nome que o
 * multer gravou em `dir`. Lanca com `.status` e a mensagem literal do plano; a rota limpa o upload em toda saida != 201.
 */
async function registrarEntrega(db, user, dados, { arquivo, dir, segredo, ip = null, userAgent = null }) {
  // Fase 5: sem o segredo do HMAC nada sai do estoque (a recusa viria depois da saida, na compensacao).
  if (!segredo) throw erro('Segredo da evidência de assinatura não configurado', 500);
  if (!arquivo) throw erro('A assinatura do colaborador é obrigatória');
  const caminho = path.join(dir, path.basename(String(arquivo)));
  conferirPng(caminho);

  const quantidade = quantidadeInteira(dados.quantidade);
  // Fase 5 (M2): o reenvio da mesma tentativa (a resposta se perdeu no Wi-Fi) devolve a entrega ja gravada — ANTES de qualquer
  // outra conferencia (no ultimo item, o reenvio daria "saldo insuficiente" em vez da entrega que aconteceu).
  const chave = chaveIdempotencia(dados.chave_idempotencia);
  if (chave) {
    const ja = await entregaDaChave(db, chave, { colaborador_id: dados.colaborador_id, material_id: dados.material_id, quantidade });
    if (ja) return ja;
  }
  const opcionais = validarOpcionais(dados);
  const colab = await colaboradorAtivo(db, dados.colaborador_id);
  conferirMatricula(colab, dados.confirmacao_matricula);
  const material = await materialEpi(db, dados.material_id);

  const arquivoSha256 = evidencia.sha256Arquivo(caminho);
  if (!arquivoSha256) throw erro('A assinatura do colaborador é obrigatória');

  const numeroEntrega = gerarNumeroDocumento('EPI');
  const criadoEm = new Date().toISOString();
  const nome = evidencia.textoLimpo(colab.nome) || `#${colab.id}`;
  const matricula = evidencia.textoLimpo(colab.matricula);
  const autorNome = evidencia.textoLimpo(user && (user.nome || user.email));

  // 3. A saida pelo motor (ele pega a trava do material e recusa saldo insuficiente com a literal de sempre).
  const saida = await stockService.registrarMovimentacao(db, user, {
    material_id: material.id,
    tipo: 'SAIDA',
    quantidade,
    documento_vinculado: numeroEntrega,
    // Etapa 181 (Fase 5, I1): so o numero — o historico de movimentacoes e de qualquer usuario do modulo, e quem recebeu qual EPI
    // e da entrega (restrita a `entregar_epi`). Ate aqui era `Entrega de EPI a <nome> (<matricula>)`; essas linhas antigas sao
    // mascaradas na leitura (mascaraEntregaEpi.js). A justificativa nao entra no HMAC (camposDoRegistro leva o movimentacao_id).
    justificativa: `Entrega de EPI ${numeroEntrega}`,
  });
  const movimentacaoId = saida.id;

  const entrega = {
    numero: numeroEntrega,
    colaborador_id: colab.id,
    colaborador_nome: nome,
    matricula,
    setor: evidencia.textoLimpo(colab.setor),
    material_id: material.id,
    material_codigo: evidencia.textoLimpo(material.codigo),
    material_nome: evidencia.textoLimpo(material.nome),
    ca_numero: material.ca_numero,
    ca_validade: material.ca_validade,
    quantidade: Q.qtd(quantidade),
    tamanho: opcionais.tamanho,
    motivo: opcionais.motivo,
    observacao: opcionais.observacao,
    movimentacao_id: movimentacaoId,
    entregue_por: user && user.id != null ? Number(user.id) : null,
    entregue_por_nome: autorNome,
    criado_em: criadoEm,
    chave_idempotencia: chave,
  };
  const ev = {
    contexto: CONTEXTO,
    colaborador_id: colab.id,
    colaborador_nome: nome,
    matricula,
    cpf: evidencia.textoLimpo(colab.cpf),
    arquivo: path.basename(String(arquivo)),
    arquivo_sha256: arquivoSha256,
    criado_por: entrega.entregue_por,
    criado_por_nome: autorNome,
    criado_em: criadoEm,
    confirmado_por_matricula: 1,
    ip: evidencia.textoLimpo(ip),
    user_agent: (() => { const u = evidencia.textoLimpo(userAgent); return u === null ? null : u.slice(0, 300); })(),
  };
  let registroSha = null;

  /** Desfaz a saida (estorno de compensacao). Devolve null se desfez, ou o erro. `semDevolucaoViva`: com uma devolucao viva
   * citando a saida, o material ja voltou — estornar contaria em dobro, e a compensacao e recusada (Fase 5, P3). */
  const compensar = async () => {
    try {
      await stockService.cancelarMovimentacao(db, user, movimentacaoId,
        `Compensação: a entrega de EPI ${numeroEntrega} não foi gravada`, { compensacao: true, semDevolucaoViva: true });
      return null;
    } catch (eComp) {
      console.error(`[almoxarifado-epi] COMPENSACAO FALHOU: a saida ${movimentacaoId} (${numeroEntrega}) ficou sem entrega `
        + `— confira e estorne-a manualmente. Erro da compensacao: ${eComp.message}`);
      return eComp;
    }
  };
  /** O 500 de quando a saida NAO pode ser desfeita: diz que ela ficou, qual e, e preserva o PNG (a unica prova da assinatura). */
  const saidaFicou = (causa, eComp) => Object.assign(erro('Não foi possível gravar a entrega de EPI e a saída do estoque NÃO pôde '
    + `ser desfeita: a movimentação #${movimentacaoId} (${numeroEntrega}) ficou registrada sem evidência de entrega. A assinatura `
    + `foi preservada no servidor. Avise o administrador antes de entregar de novo. (${causa}; ${eComp.message})`, 500),
  { preservarArquivo: true });

  // 4. Entrega + evidencia numa transacao. A entrega so entra se a saida continua de pe (`cancelado = 0`): um estorno pelo
  // livro que ganhou a corrida antes da transacao (a recusa C2 so existe depois que a entrega existe) deixa a transacao sem
  // linha, e a evidencia so entra se a entrega entrou. Fase 5 (critico 1): na fila da cadeia — le a cabeca, poe o elo
  // (`sequencia`, `hash_anterior`) na evidencia, calcula o HMAC e grava, sem outra gravacao no meio.
  const L = evidencia.literalSql;
  const colsEntrega = Object.keys(entrega);

  try {
    if (typeof ganchos.antesDaGravacao === 'function') await ganchos.antesDaGravacao({ movimentacaoId, numero: numeroEntrega });
    await evidencia.naFilaDaCadeia(async () => {
      const cabeca = await evidencia.cabecaDaCadeia(db);
      ev.sequencia = cabeca ? cabeca.sequencia + 1 : 1;
      ev.hash_anterior = cabeca ? cabeca.registro_sha256 : null;
      registroSha = evidencia.registroHmac(camposDoRegistro(entrega, ev), segredo);
      const colsEv = Object.keys(ev);
      await execEmTransacao(db, `INSERT INTO entregas_epi_almoxarifado (${colsEntrega.join(', ')})
  SELECT ${colsEntrega.map((c) => L(entrega[c])).join(', ')}
  WHERE EXISTS (SELECT 1 FROM movimentacoes_almoxarifado WHERE id = ${L(movimentacaoId)} AND COALESCE(cancelado, 0) = 0)
    AND NOT EXISTS (SELECT 1 FROM devolucoes_material_almoxarifado d
      WHERE d.movimentacao_saida_id = ${L(movimentacaoId)} AND ${DEVOLUCAO_VIVA_SQL});
INSERT INTO evidencias_assinatura_almoxarifado (contexto_id, registro_sha256, ${colsEv.join(', ')})
  SELECT e.id, ${L(registroSha)}, ${colsEv.map((c) => L(ev[c])).join(', ')}
  FROM entregas_epi_almoxarifado e WHERE e.numero = ${L(numeroEntrega)};`);
    });
  } catch (e) {
    // 5. A compensacao: a saida volta. Fase 5 (importante 3, P4): so diz "desfeita" se desfez; senao, o 500 diz que a saida
    // FICOU, com o numero da movimentacao, e o PNG fica no disco (`preservarArquivo`).
    const eComp = await compensar();
    if (eComp) throw saidaFicou(e.message, eComp);
    // M2: o envio duplicado que perdeu a corrida no UNIQUE da chave (a saida dele ja foi desfeita) devolve a do vencedor.
    if (chave) {
      const ja = await entregaDaChave(db, chave, { colaborador_id: colab.id, material_id: material.id, quantidade });
      if (ja) return ja;
    }
    throw erro(`Não foi possível gravar a entrega de EPI — nada foi gravado: a saída do estoque foi desfeita. Pode tentar de novo. (${e.message})`, 500);
  }

  // Daqui em diante a transacao COMMITOU: se a entrega entrou, a evidencia aponta para o PNG — nenhum erro apaga o arquivo (M3).
  let gravada;
  try {
    gravada = await dbGet(db, `SELECT e.id, v.id AS evidencia_id FROM entregas_epi_almoxarifado e
      JOIN evidencias_assinatura_almoxarifado v ON v.contexto = ? AND v.contexto_id = e.id
      WHERE e.numero = ?`, [CONTEXTO, numeroEntrega]);
    if (gravada && typeof ganchos.depoisDaGravacao === 'function') {
      await ganchos.depoisDaGravacao({ movimentacaoId, numero: numeroEntrega });
    }
  } catch (e) {
    throw Object.assign(erro(`A entrega ${numeroEntrega} foi gravada, mas a resposta falhou (${e.message}) — `
      + 'confira a ficha do colaborador antes de entregar de novo.', 500), { preservarArquivo: true });
  }
  if (!gravada) {
    // A transacao nao gravou linha: a saida foi estornada (claim) ou ganhou uma devolucao viva (P3) no meio. M1: o 409 "nada
    // foi gravado" so quando o estorno CONCLUIU (`movimento_estorno_id` — o claim `cancelado = 1` e provisorio e volta a 0 se o
    // estorno falhar). Qualquer outro caso tenta a compensacao (que respeita a devolucao viva) e, nao conseguindo, diz que ficou.
    const mov = await dbGet(db, 'SELECT cancelado, movimento_estorno_id FROM movimentacoes_almoxarifado WHERE id = ?', [movimentacaoId]);
    if (mov && Number(mov.cancelado) === 1 && mov.movimento_estorno_id != null) {
      throw erro(`A saída da entrega ${numeroEntrega} foi estornada enquanto a entrega era gravada — nada foi gravado. `
        + 'Faça a entrega de novo.', 409);
    }
    const causa = 'a saída mudou enquanto a entrega era gravada (devolução ou estorno no meio)';
    const eComp = await compensar();
    if (eComp) throw saidaFicou(causa, eComp);
    throw erro(`A entrega ${numeroEntrega} não foi gravada — ${causa}; nada foi gravado: a saída do estoque foi desfeita. `
      + 'Faça a entrega de novo.', 409);
  }

  await registrarAuditoriaDoAto(db, {
    entidade: 'entrega_epi',
    entidade_id: gravada.id,
    acao: 'ENTREGA_EPI',
    usuario_id: user && user.id,
    usuario_nome: autorNome,
    dados_novos: {
      numero: numeroEntrega, colaborador_id: colab.id, material_id: material.id, quantidade, movimentacao_id: movimentacaoId,
      registro_sha256: registroSha,
    },
  });

  return {
    id: gravada.id,
    numero: numeroEntrega,
    movimentacao_id: movimentacaoId,
    evidencia: {
      id: gravada.evidencia_id,
      arquivo_url: materialPhotoUrl(ev.arquivo),
      arquivo_sha256: arquivoSha256,
      registro_sha256: registroSha,
      criado_em: criadoEm,
    },
  };
}

const COLUNAS_LISTA = `e.id, e.numero, e.criado_em, e.colaborador_id, e.colaborador_nome, e.matricula, e.material_id,
  e.material_codigo, e.material_nome, e.ca_numero, e.ca_validade, e.quantidade, e.tamanho, e.motivo, e.entregue_por_nome`;

/**
 * Os filtros das entregas (alias `e`): `colaborador_id`, `material_id` e `de`/`ate` em dias de Brasilia (AAAA-MM-DD; dia em
 * outro formato e ignorado). Fonte unica de `listarEntregas` e do relatorio `epi-colaborador` (Etapa 181, I1) — o relatorio e a
 * tela de EPI nao podem discordar sobre o que e "entregue em 21/10".
 */
function filtroDasEntregas(filtros = {}) {
  const where = [];
  const params = [];
  if (filtros.colaborador_id) { where.push('e.colaborador_id = ?'); params.push(Number(filtros.colaborador_id)); }
  if (filtros.material_id) { where.push('e.material_id = ?'); params.push(Number(filtros.material_id)); }
  const dia = /^\d{4}-\d{2}-\d{2}$/;
  if (filtros.de && dia.test(String(filtros.de))) {
    where.push('DATE(e.criado_em, ?) >= ?'); params.push(diaLocal.modificadorDoFuso(), String(filtros.de));
  }
  if (filtros.ate && dia.test(String(filtros.ate))) {
    where.push('DATE(e.criado_em, ?) <= ?'); params.push(diaLocal.modificadorDoFuso(), String(filtros.ate));
  }
  return { where, params };
}

/** GET /epi/entregas — filtros opcionais (`filtroDasEntregas`). Mais recentes primeiro. */
async function listarEntregas(db, filtros = {}) {
  const { where, params } = filtroDasEntregas(filtros);
  return dbAll(db, `SELECT ${COLUNAS_LISTA} FROM entregas_epi_almoxarifado e
    ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
    ORDER BY e.criado_em DESC, e.id DESC`, params);
}

/**
 * RN-178.09 — a ficha de EPI do colaborador. O cadastro manda; excluido o colaborador (I2, sem FK), o snapshot da entrega mais
 * recente (nome, matricula, setor) e o CPF da evidencia. CPF so mascarado. Sem cadastro e sem entrega -> 404.
 */
async function fichaDoColaborador(db, colaboradorId) {
  const id = Number(colaboradorId);
  const naoEncontrado = () => erro(`Colaborador #${colaboradorId} não encontrado`, 404);
  if (!Number.isInteger(id) || id <= 0) throw naoEncontrado();
  const entregas = await dbAll(db, `SELECT ${COLUNAS_LISTA}, v.arquivo, v.registro_sha256, v.cpf AS cpf_snapshot, e.setor AS setor_snapshot
    FROM entregas_epi_almoxarifado e
    LEFT JOIN evidencias_assinatura_almoxarifado v ON v.contexto = ? AND v.contexto_id = e.id
    WHERE e.colaborador_id = ? ORDER BY e.criado_em DESC, e.id DESC`, [CONTEXTO, id]);
  const cadastro = await dbGet(db, 'SELECT id, nome, matricula, setor, cpf FROM colaboradores WHERE id = ?', [id]);
  if (!cadastro && entregas.length === 0) throw naoEncontrado();
  const snap = entregas[0];
  const colaborador = cadastro
    ? { id, nome: cadastro.nome, matricula: cadastro.matricula ?? null, setor: cadastro.setor ?? null,
      cpf_mascarado: evidencia.mascararCpf(cadastro.cpf), excluido: false }
    : { id, nome: snap.colaborador_nome, matricula: snap.matricula ?? null, setor: snap.setor_snapshot ?? null,
      cpf_mascarado: evidencia.mascararCpf(snap.cpf_snapshot), excluido: true };
  return {
    colaborador,
    entregas: entregas.map(({ arquivo, cpf_snapshot: _c, setor_snapshot: _s, ...linha }) => ({
      ...linha,
      arquivo_url: arquivo ? materialPhotoUrl(arquivo) : null,
    })),
  };
}

/**
 * RN-178.08 — relê o arquivo e a linha, recalcula o hash do arquivo e o HMAC do registro; desde a Fase 5 confere tambem o elo
 * com a evidencia anterior e a posterior ('registro anterior apagado', 'elo com o anterior quebrado', 'registro posterior
 * apagado', 'elo com o posterior quebrado'; 'fora da cadeia' so em base de dev anterior a Fase 5). A cauda apagada so a
 * cadeia inteira ve (`verificarCadeia`).
 */
async function verificarEntrega(db, entregaId, { dir, segredo }) {
  const entrega = await dbGet(db, 'SELECT * FROM entregas_epi_almoxarifado WHERE id = ?', [entregaId]);
  if (!entrega) throw erro(`Entrega de EPI #${entregaId} não encontrada`, 404);
  const ev = await dbGet(db, 'SELECT * FROM evidencias_assinatura_almoxarifado WHERE contexto = ? AND contexto_id = ?',
    [CONTEXTO, entrega.id]);
  if (!ev) return { integro: false, motivo: 'registro alterado' };
  const r = evidencia.verificar({
    dir,
    arquivo: ev.arquivo,
    arquivoSha256: ev.arquivo_sha256,
    campos: camposDoRegistro(entrega, ev),
    registroSha256Gravado: ev.registro_sha256,
    segredo,
  });
  if (!r.integro) return r;
  const elo = await evidencia.conferirElos(db, ev);
  return elo ? { integro: false, motivo: elo } : { integro: true };
}

/**
 * Fase 5 da 178 — os controles que so o contexto do EPI ve, alem da cadeia: a entrega cuja evidencia sumiu ('entrega sem
 * evidência', com o numero) e a entrega apagada no fim da tabela (sqlite_sequence). Desde a Etapa 180 (RN-180.01, I2) eles e o
 * montador vivem no REGISTRO DE CONTEXTOS da evidencia — a cadeia e verificada por `evidencia.verificarCadeia` com todos os
 * contextos registrados (antes, este servico devolvia null para qualquer outro contexto, que virava "registro alterado").
 */
evidencia.registrarContexto(CONTEXTO, {
  montador: async (db) => {
    const entregaPorId = new Map((await dbAll(db, 'SELECT * FROM entregas_epi_almoxarifado')).map((e) => [e.id, e]));
    return async (ev) => {
      const entrega = entregaPorId.get(Number(ev.contexto_id));
      return entrega ? camposDoRegistro(entrega, ev) : null;
    };
  },
  extras: async (db, problemasAteAqui) => {
    const out = [];
    const semEvidencia = await dbAll(db, `SELECT e.numero FROM entregas_epi_almoxarifado e
      WHERE NOT EXISTS (SELECT 1 FROM evidencias_assinatura_almoxarifado v WHERE v.contexto = ? AND v.contexto_id = e.id)
      ORDER BY e.id`, [CONTEXTO]);
    for (const { numero } of semEvidencia) {
      out.push({ sequencia: null, evidencia_id: null, numero, motivo: 'entrega sem evidência' });
    }
    const maior = await dbGet(db, 'SELECT MAX(id) AS m FROM entregas_epi_almoxarifado');
    const autoinc = await dbGet(db, "SELECT seq FROM sqlite_sequence WHERE name = 'entregas_epi_almoxarifado'");
    if (autoinc && Number(autoinc.seq) > Number((maior && maior.m) || 0)
      && !problemasAteAqui.some((p) => p.motivo === 'registro apagado no fim da cadeia')) {
      out.push({ sequencia: null, evidencia_id: null, numero: null, motivo: 'registro apagado no fim da cadeia' });
    }
    return out;
  },
});

/** `GET /evidencias/cadeia/verificar` (e o apelido `/epi/cadeia/verificar`): a cadeia inteira, todos os contextos registrados. */
async function verificarCadeia(db, { dir, segredo }) {
  return evidencia.verificarCadeia(db, { dir, segredo });
}

/** RN-178.10 — so os ativos, sem CPF e sem salario. */
async function listarColaboradoresAtivos(db) {
  return dbAll(db, `SELECT id, nome, matricula, setor FROM colaboradores
    WHERE LOWER(TRIM(COALESCE(status, ''))) = 'ativo' ORDER BY nome COLLATE NOCASE, id`);
}

module.exports = {
  CONTEXTO, MOTIVOS, ganchos, ehEpiSql, camposDoRegistro,
  registrarEntrega, listarEntregas, filtroDasEntregas, fichaDoColaborador, verificarEntrega, verificarCadeia, listarColaboradoresAtivos,
};
