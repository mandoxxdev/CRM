/**
 * Termo de responsabilidade no emprestimo de ferramenta (Etapa 180, RN-D do design de 16/09).
 *
 * Plano: docs/superpowers/plans/2026-10-22-almoxarifado-etapa180-termo-de-responsabilidade-de-ferramenta.md — as regras
 * RN-180.02..06 e as emendas da Revisao da Fase 2 (C1, C2, C3, I1..I4, menores), que PREVALECEM sobre a tabela de regras.
 *
 * O emprestimo deixa de ser "nome digitado": o colaborador e do CADASTRO (ativo, com matricula), le o texto VIGENTE do termo,
 * digita a propria matricula e assina na tela. A gravacao e UMA transacao (C2) dentro da fila da cadeia de evidencias (C3):
 *   1. claim da ferramenta (`UPDATE … WHERE status = 'DISPONIVEL' AND ativo = 1 AND <versao vigente = a que a tela mostrou>`);
 *   2. o emprestimo (`INSERT … SELECT … WHERE changes() = 1`);
 *   3. a FOTOGRAFIA do termo (`termos_emprestimo_ferramenta`, C1) com `last_insert_rowid()` do emprestimo, tambem `WHERE changes() = 1`;
 *   4. a evidencia (`contexto = 'TERMO_FERRAMENTA'`, `contexto_id = emprestimo.id`) por `SELECT … FROM termos… WHERE numero = …`.
 * Sem linha (o claim perdeu, ou a versao mudou), nada entra; depois do COMMIT, a releitura pelo `numero` decide 201 ou 409.
 * O HMAC (segredo fora do banco) cobre so a fotografia + a evidencia (vinculo pelo `numero`, molde `camposDoRegistro` do EPI).
 */
const path = require('path');
const { dbGet, dbAll, dbRun } = require('./db');
const evidencia = require('./evidenciaAssinaturaService');
const { colaboradorAtivo, conferirMatricula, conferirPng, chaveIdempotencia } = require('./identificacaoColaborador');
const { gerarNumeroDocumento } = require('./numeroDoc');
const { materialPhotoUrl } = require('./materialPhoto');
const { registrarAuditoriaDoAto } = require('./audit');
const { calibracaoVigente } = require('./toolService');
const { STATUS } = require('./toolStateMachine');

const CONTEXTO = 'TERMO_FERRAMENTA';
const TIPO_FERRAMENTA = 'FERRAMENTA';
const TIPOS = [TIPO_FERRAMENTA];
const MARCA_PROVISORIO = 'TEXTO PROVISÓRIO';

// Ganchos de teste (pelo OBJETO do modulo): `antesDaGravacao` roda depois de todas as validacoes e antes da fila da cadeia — o
// teste de corrida o usa para segurar as duas tentativas ate as duas terem passado das conferencias.
const ganchos = { antesDaGravacao: null };

const erro = (msg, status = 400) => Object.assign(new Error(msg), { status });

/** `db.execEmTransacao` (sqliteConcurrency, producao). O harness sem wrap usa a conexao crua: mesma semantica, num `exec` so. */
function execEmTransacao(db, corpo) {
  if (typeof db.execEmTransacao === 'function') return db.execEmTransacao(corpo);
  return new Promise((resolve, reject) => {
    db.exec(`BEGIN IMMEDIATE;\n${corpo}\nCOMMIT;`, (err) => {
      if (!err) return resolve();
      db.exec('ROLLBACK;', () => reject(err));
    });
  });
}

function tipoValido(tipo) {
  const t = String(tipo == null ? '' : tipo).trim().toUpperCase();
  if (!TIPOS.includes(t)) throw erro(`Tipo de termo desconhecido: ${tipo}`, 404);
  return t;
}

const ehProvisorio = (texto) => String(texto || '').startsWith(MARCA_PROVISORIO);

async function versaoVigente(db, tipo) {
  return dbGet(db, `SELECT versao, texto, texto_sha256, criado_em, criado_por_nome FROM termos_responsabilidade_versao
    WHERE tipo = ? ORDER BY versao DESC LIMIT 1`, [tipo]);
}

const formaDaVersao = (v) => (v ? {
  versao: Number(v.versao), texto: v.texto, criado_em: v.criado_em, criado_por_nome: v.criado_por_nome ?? null,
  provisorio: ehProvisorio(v.texto),
} : null);

/** RN-180.02 — `GET /termos/:tipo`: a vigente e o historico (mais recente primeiro). */
async function obterTermo(db, tipo) {
  const t = tipoValido(tipo);
  const linhas = await dbAll(db, `SELECT versao, texto, criado_em, criado_por_nome FROM termos_responsabilidade_versao
    WHERE tipo = ? ORDER BY versao DESC`, [t]);
  return { vigente: formaDaVersao(linhas[0]), historico: linhas.map(formaDaVersao) };
}

/**
 * RN-180.02 — `POST /termos/:tipo` (so `editar_termos`): a proxima versao. `versao_base` (opcional) e a versao que a tela do
 * administrador mostrou; sem ela, a vigente lida agora. A gravacao so entra se a vigente AINDA e a base (no proprio INSERT) — dois
 * administradores salvando juntos: o segundo recebe 409, nunca 500 nem uma versao que ele nao viu (menores da revisao).
 */
async function criarVersao(db, user, tipo, dados = {}) {
  const t = tipoValido(tipo);
  const texto = evidencia.textoLimpo(dados.texto);
  if (!texto) throw erro('O texto do termo é obrigatório');
  if (texto.length > 20000) throw erro('O texto do termo deve ter no máximo 20000 caracteres');
  const vigente = await versaoVigente(db, t);
  const atual = vigente ? Number(vigente.versao) : 0;
  let base = atual;
  if (dados.versao_base !== undefined && dados.versao_base !== null && String(dados.versao_base).trim() !== '') {
    base = Number(dados.versao_base);
    if (!Number.isInteger(base) || base < 0) throw erro('Versão base inválida');
  }
  const conflito = () => erro('Outra versão do termo acabou de ser salva — recarregue', 409);
  if (base !== atual) throw conflito();
  if (vigente && vigente.texto === texto) throw erro('O texto é igual ao da versão vigente');
  const autorNome = evidencia.textoLimpo(user && (user.nome || user.email));
  const criadoEm = new Date().toISOString();
  let r;
  try {
    r = await dbRun(db, `INSERT INTO termos_responsabilidade_versao (tipo, versao, texto, texto_sha256, criado_por, criado_por_nome, criado_em)
      SELECT ?, ?, ?, ?, ?, ?, ?
      WHERE COALESCE((SELECT MAX(versao) FROM termos_responsabilidade_versao WHERE tipo = ?), 0) = ?`,
    [t, base + 1, texto, evidencia.sha256(texto), user && user.id != null ? Number(user.id) : null, autorNome, criadoEm, t, base]);
  } catch (e) {
    if (/UNIQUE constraint/i.test(e.message)) throw conflito();
    throw e;
  }
  if (!r || r.changes !== 1) throw conflito();
  await registrarAuditoriaDoAto(db, {
    entidade: 'termo_responsabilidade', entidade_id: r.lastID, acao: 'NOVA_VERSAO_TERMO',
    usuario_id: user && user.id, usuario_nome: autorNome, dados_novos: { tipo: t, versao: base + 1 },
  });
  return { versao: base + 1, texto, criado_em: criadoEm, criado_por_nome: autorNome, provisorio: ehProvisorio(texto) };
}

/**
 * Os campos do registro que entram no HMAC — o MESMO montador na gravacao e na verificacao. `termo` e a fotografia (C1), `ev` a
 * evidencia. O `id` das duas, o `emprestimo_id` e o `contexto_id` ficam FORA (nao existem antes do INSERT); o `numero` (UNIQUE)
 * amarra a evidencia ao termo. Nada do emprestimo vivo nem da ferramenta viva entra.
 */
function camposDoTermo(termo, ev) {
  const { texto, numero } = evidencia;
  return {
    contexto: texto(ev.contexto),
    numero: texto(termo.numero),
    ferramenta_id: numero(termo.ferramenta_id),
    ferramenta_codigo_patrimonio: texto(termo.ferramenta_codigo_patrimonio),
    ferramenta_numero_serie: texto(termo.ferramenta_numero_serie),
    ferramenta_nome: texto(termo.ferramenta_nome),
    colaborador_id: numero(termo.colaborador_id),
    colaborador_nome: texto(termo.colaborador_nome),
    matricula: texto(termo.matricula),
    setor: texto(termo.setor),
    termo_versao: numero(termo.termo_versao),
    texto_sha256: texto(termo.texto_sha256),
    data_prevista_devolucao: texto(termo.data_prevista_devolucao),
    criado_por: numero(termo.criado_por),
    criado_por_nome: texto(termo.criado_por_nome),
    criado_em: texto(termo.criado_em),
    chave_idempotencia: texto(termo.chave_idempotencia),
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
      sequencia: numero(ev.sequencia),
      hash_anterior: texto(ev.hash_anterior),
      confirmado_por_matricula: numero(ev.confirmado_por_matricula),
      ip: texto(ev.ip),
      user_agent: texto(ev.user_agent),
    },
  };
}

const formaDaEvidencia = (v) => ({
  id: v.evidencia_id, arquivo_url: materialPhotoUrl(v.arquivo), arquivo_sha256: v.arquivo_sha256,
  registro_sha256: v.registro_sha256, criado_em: v.ev_criado_em,
});

const SQL_TERMO_COM_EVIDENCIA = `SELECT t.*, v.id AS evidencia_id, v.arquivo, v.arquivo_sha256, v.registro_sha256,
    v.criado_em AS ev_criado_em, v.confirmado_por_matricula, v.sequencia
  FROM termos_emprestimo_ferramenta t
  JOIN evidencias_assinatura_almoxarifado v ON v.contexto = '${CONTEXTO}' AND v.contexto_id = t.emprestimo_id`;

/** I3: o emprestimo ja gravado com esta chave (200 + `reutilizada`), ou null. Outra ferramenta/colaborador com a chave -> 409. */
async function emprestimoDaChave(db, chave, { ferramentaId, colaboradorId }) {
  const t = await dbGet(db, `${SQL_TERMO_COM_EVIDENCIA} WHERE t.chave_idempotencia = ?`, [chave]);
  if (!t) return null;
  if (Number(t.ferramenta_id) !== Number(ferramentaId) || Number(t.colaborador_id) !== Number(colaboradorId)) {
    throw erro('Chave de idempotência já usada em outro empréstimo', 409);
  }
  return {
    id: t.emprestimo_id,
    termo: { numero: t.numero, versao: Number(t.termo_versao), evidencia: formaDaEvidencia(t) },
    reutilizada: true,
  };
}

function dataPrevista(v) {
  const d = evidencia.textoLimpo(v);
  if (d === null) return null;
  if (d.length > 40 || Number.isNaN(Date.parse(d))) throw erro('Data prevista de devolução inválida');
  return d;
}

function textoOpcional(v, max, rotulo) {
  const t = evidencia.textoLimpo(v);
  if (t !== null && t.length > max) throw erro(`${rotulo} deve ter no máximo ${max} caracteres`);
  return t;
}

/**
 * RN-180.03/04 — `POST /ferramentas/:id/emprestar` (multipart). `dados` (texto do multipart, coagido aqui): colaborador_id,
 * confirmacao_matricula, termo_versao, data_prevista_devolucao?, observacoes?, chave_idempotencia?. `arquivo`: o nome que o multer
 * gravou em `dir`. Lanca com `.status` e a literal; a rota limpa o upload em toda saida != 201 (menos `preservarArquivo`).
 */
async function emprestarComTermo(db, user, ferramentaId, dados, { arquivo, dir, segredo, ip = null, userAgent = null }) {
  if (!segredo) throw erro('Segredo da evidência de assinatura não configurado', 500);
  if (!arquivo) throw erro('A assinatura do colaborador é obrigatória');
  const caminho = path.join(dir, path.basename(String(arquivo)));
  conferirPng(caminho);

  // I3: o reenvio da mesma tentativa devolve o emprestimo gravado ANTES de qualquer conferencia (depois do primeiro envio a
  // ferramenta ja esta EMPRESTADA, e o reenvio daria "nao disponivel" em vez do emprestimo que aconteceu).
  const chave = chaveIdempotencia(dados.chave_idempotencia);
  if (chave) {
    const ja = await emprestimoDaChave(db, chave, { ferramentaId, colaboradorId: dados.colaborador_id });
    if (ja) return ja;
  }

  const fid = Number(ferramentaId);
  const ferr = Number.isInteger(fid) && fid > 0
    ? await dbGet(db, 'SELECT * FROM ferramentas_almoxarifado WHERE id = ? AND ativo = 1', [fid]) : null;
  if (!ferr) throw erro('Ferramenta não encontrada', 404);

  const colab = await colaboradorAtivo(db, dados.colaborador_id);
  conferirMatricula(colab, dados.confirmacao_matricula, { acao: 'assinar o termo' });

  if (dados.termo_versao === undefined || dados.termo_versao === null || String(dados.termo_versao).trim() === '') {
    throw erro('A versão do termo é obrigatória');
  }
  const versaoAssinada = Number(dados.termo_versao);
  if (!Number.isInteger(versaoAssinada) || versaoAssinada <= 0) throw erro('A versão do termo é obrigatória');
  const vigente = await versaoVigente(db, TIPO_FERRAMENTA);
  if (!vigente) throw erro('Nenhum texto de termo cadastrado', 500);
  const mudou = (v) => erro(`O texto do termo mudou (versão ${v}) — releia e assine de novo`, 409);
  if (Number(vigente.versao) !== versaoAssinada) throw mudou(vigente.versao);

  const prevista = dataPrevista(dados.data_prevista_devolucao);
  const observacoes = textoOpcional(dados.observacoes, 1000, 'Observações');

  // RN-03 da 9b (menores da revisao): calibracao vencida continua bloqueando, antes do claim.
  if (ferr.exige_calibracao && !(await calibracaoVigente(db, fid))) {
    throw erro('Ferramenta com calibração vencida ou sem calibração registrada');
  }
  // A literal de sempre para quem chega com a ferramenta ja fora de DISPONIVEL (a tela e os testes da 9b leem o status). Quem
  // decide e o claim dentro da transacao — perder ali e o 409 abaixo.
  if (ferr.status !== STATUS.DISPONIVEL) throw erro(`Ferramenta não está disponível (status atual: ${ferr.status})`);

  const arquivoSha256 = evidencia.sha256Arquivo(caminho);
  if (!arquivoSha256) throw erro('A assinatura do colaborador é obrigatória');

  const numeroTermo = gerarNumeroDocumento('TERMO');
  const criadoEm = new Date().toISOString();
  const nome = evidencia.textoLimpo(colab.nome) || `#${colab.id}`;
  const matricula = evidencia.textoLimpo(colab.matricula);
  const setor = evidencia.textoLimpo(colab.setor);
  const autorId = user && user.id != null ? Number(user.id) : null;
  const autorNome = evidencia.textoLimpo(user && (user.nome || user.email));

  const termo = {
    numero: numeroTermo,
    ferramenta_id: fid,
    ferramenta_codigo_patrimonio: evidencia.textoLimpo(ferr.codigo_patrimonio),
    ferramenta_numero_serie: evidencia.textoLimpo(ferr.numero_serie),
    ferramenta_nome: evidencia.textoLimpo(ferr.nome),
    colaborador_id: colab.id,
    colaborador_nome: nome,
    matricula,
    setor,
    termo_versao: versaoAssinada,
    texto_sha256: vigente.texto_sha256,
    data_prevista_devolucao: prevista,
    criado_por: autorId,
    criado_por_nome: autorNome,
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
    criado_por: autorId,
    criado_por_nome: autorNome,
    criado_em: criadoEm,
    confirmado_por_matricula: 1,
    ip: evidencia.textoLimpo(ip),
    user_agent: (() => { const u = evidencia.textoLimpo(userAgent); return u === null ? null : u.slice(0, 300); })(),
  };
  const emprestimo = {
    ferramenta_id: fid, colaborador_id: colab.id, colaborador_nome: nome, setor,
    data_prevista_devolucao: prevista, observacoes,
  };
  let registroSha = null;
  const L = evidencia.literalSql;
  const colsTermo = Object.keys(termo);
  const colsEmp = Object.keys(emprestimo);

  if (typeof ganchos.antesDaGravacao === 'function') await ganchos.antesDaGravacao({ ferramentaId: fid, numero: numeroTermo });
  try {
    // C3: na fila da cadeia — cabeca, elo, HMAC e gravacao sem outra evidencia (EPI ou termo) no meio.
    await evidencia.naFilaDaCadeia(async () => {
      const cabeca = await evidencia.cabecaDaCadeia(db);
      ev.sequencia = cabeca ? cabeca.sequencia + 1 : 1;
      ev.hash_anterior = cabeca ? cabeca.registro_sha256 : null;
      registroSha = evidencia.registroHmac(camposDoTermo(termo, ev), segredo);
      const colsEv = Object.keys(ev);
      // C2: o claim e as tres gravacoes condicionadas, numa transacao so. A versao vigente e comparada AQUI dentro (menores).
      await execEmTransacao(db, `UPDATE ferramentas_almoxarifado SET status = ${L(STATUS.EMPRESTADA)}, updated_at = CURRENT_TIMESTAMP
  WHERE id = ${L(fid)} AND status = ${L(STATUS.DISPONIVEL)} AND ativo = 1
    AND (SELECT MAX(versao) FROM termos_responsabilidade_versao WHERE tipo = ${L(TIPO_FERRAMENTA)}) = ${L(versaoAssinada)};
INSERT INTO emprestimos_ferramenta_almoxarifado (${colsEmp.join(', ')})
  SELECT ${colsEmp.map((c) => L(emprestimo[c])).join(', ')} WHERE changes() = 1;
INSERT INTO termos_emprestimo_ferramenta (emprestimo_id, ${colsTermo.join(', ')})
  SELECT last_insert_rowid(), ${colsTermo.map((c) => L(termo[c])).join(', ')} WHERE changes() = 1;
INSERT INTO evidencias_assinatura_almoxarifado (contexto_id, registro_sha256, ${colsEv.join(', ')})
  SELECT t.emprestimo_id, ${L(registroSha)}, ${colsEv.map((c) => L(ev[c])).join(', ')}
  FROM termos_emprestimo_ferramenta t WHERE t.numero = ${L(numeroTermo)};`);
    });
  } catch (e) {
    // ROLLBACK: nada foi gravado (nem o claim). O reenvio que perdeu no UNIQUE da chave devolve o do vencedor.
    if (chave) {
      const ja = await emprestimoDaChave(db, chave, { ferramentaId: fid, colaboradorId: colab.id });
      if (ja) return ja;
    }
    throw erro(`Não foi possível gravar o empréstimo — nada foi gravado. Pode tentar de novo. (${e.message})`, 500);
  }

  // Daqui em diante a transacao COMMITOU: se o termo entrou, a evidencia aponta para o PNG — nenhum erro apaga o arquivo.
  let gravado;
  try {
    gravado = await dbGet(db, `${SQL_TERMO_COM_EVIDENCIA} WHERE t.numero = ?`, [numeroTermo]);
  } catch (e) {
    throw Object.assign(erro(`O empréstimo (termo ${numeroTermo}) foi gravado, mas a resposta falhou (${e.message}) — `
      + 'confira a lista de empréstimos antes de emprestar de novo.', 500), { preservarArquivo: true });
  }
  if (!gravado) {
    const agora = await versaoVigente(db, TIPO_FERRAMENTA);
    if (agora && Number(agora.versao) !== versaoAssinada) throw mudou(agora.versao);
    throw erro('A ferramenta não está disponível', 409);
  }

  await registrarAuditoriaDoAto(db, {
    entidade: 'ferramenta', entidade_id: fid, acao: 'EMPRESTIMO',
    usuario_id: user && user.id, usuario_nome: autorNome,
    dados_novos: {
      emprestimo_id: gravado.emprestimo_id, colaborador_id: colab.id, colaborador_nome: nome,
      termo_numero: numeroTermo, termo_versao: versaoAssinada, registro_sha256: registroSha,
    },
  });

  return {
    id: gravado.emprestimo_id,
    termo: { numero: numeroTermo, versao: versaoAssinada, evidencia: formaDaEvidencia(gravado) },
  };
}

const semTermo = () => erro('Este empréstimo não tem termo assinado (anterior à exigência)', 404);

async function emprestimoOu404(db, emprestimoId) {
  const id = Number(emprestimoId);
  const emp = Number.isInteger(id) && id > 0 ? await dbGet(db, `SELECT e.*, f.nome AS ferramenta_nome, f.codigo_patrimonio
    FROM emprestimos_ferramenta_almoxarifado e LEFT JOIN ferramentas_almoxarifado f ON f.id = e.ferramenta_id
    WHERE e.id = ?`, [id]) : null;
  if (!emp) throw erro('Empréstimo não encontrado', 404);
  return emp;
}

/** RN-180.05 — `GET /ferramentas/emprestimos/:id/termo`: o emprestimo, o texto DA VERSAO ASSINADA e a evidencia. */
async function obterTermoDoEmprestimo(db, emprestimoId) {
  const emp = await emprestimoOu404(db, emprestimoId);
  const t = await dbGet(db, 'SELECT * FROM termos_emprestimo_ferramenta WHERE emprestimo_id = ?', [emp.id]);
  if (!t) throw semTermo();
  const v = await dbGet(db, 'SELECT * FROM evidencias_assinatura_almoxarifado WHERE contexto = ? AND contexto_id = ?', [CONTEXTO, emp.id]);
  const versao = await dbGet(db, 'SELECT versao, texto, texto_sha256 FROM termos_responsabilidade_versao WHERE tipo = ? AND versao = ?',
    [TIPO_FERRAMENTA, t.termo_versao]);
  return {
    emprestimo: {
      id: emp.id, ferramenta_id: emp.ferramenta_id, ferramenta_nome: emp.ferramenta_nome ?? null,
      codigo_patrimonio: emp.codigo_patrimonio ?? null, status: emp.status, data_retirada: emp.data_retirada,
      data_prevista_devolucao: emp.data_prevista_devolucao ?? null, data_devolucao_real: emp.data_devolucao_real ?? null,
    },
    termo: {
      numero: t.numero, versao: Number(t.termo_versao), texto: versao ? versao.texto : null, texto_sha256: t.texto_sha256,
      provisorio: versao ? ehProvisorio(versao.texto) : false,
      ferramenta: { id: t.ferramenta_id, codigo_patrimonio: t.ferramenta_codigo_patrimonio, numero_serie: t.ferramenta_numero_serie,
        nome: t.ferramenta_nome },
      colaborador: { id: t.colaborador_id, nome: t.colaborador_nome, matricula: t.matricula, setor: t.setor },
      data_prevista_devolucao: t.data_prevista_devolucao, criado_por_nome: t.criado_por_nome, criado_em: t.criado_em,
    },
    evidencia: v ? {
      id: v.id, arquivo_url: materialPhotoUrl(v.arquivo), arquivo_sha256: v.arquivo_sha256, registro_sha256: v.registro_sha256,
      confirmado_por_matricula: v.confirmado_por_matricula == null ? null : Number(v.confirmado_por_matricula),
      criado_em: v.criado_em, sequencia: v.sequencia == null ? null : Number(v.sequencia),
    } : null,
  };
}

/** O texto da versao assinada ainda e o que foi assinado (o hash da fotografia). null = bate. */
async function conferirTextoDaVersao(db, termo) {
  const versao = await dbGet(db, 'SELECT texto, texto_sha256 FROM termos_responsabilidade_versao WHERE tipo = ? AND versao = ?',
    [TIPO_FERRAMENTA, termo.termo_versao]);
  if (!versao || evidencia.sha256(versao.texto) !== termo.texto_sha256 || versao.texto_sha256 !== termo.texto_sha256) {
    return 'texto do termo alterado';
  }
  return null;
}

/** RN-180.05 — `GET …/termo/verificar`: arquivo, HMAC, elos e o texto da versao (molde `verificarEntrega` da 178). */
async function verificarTermo(db, emprestimoId, { dir, segredo }) {
  const emp = await emprestimoOu404(db, emprestimoId);
  const t = await dbGet(db, 'SELECT * FROM termos_emprestimo_ferramenta WHERE emprestimo_id = ?', [emp.id]);
  if (!t) throw semTermo();
  const ev = await dbGet(db, 'SELECT * FROM evidencias_assinatura_almoxarifado WHERE contexto = ? AND contexto_id = ?', [CONTEXTO, emp.id]);
  if (!ev) return { integro: false, motivo: 'registro alterado' };
  const r = evidencia.verificar({ dir, arquivo: ev.arquivo, arquivoSha256: ev.arquivo_sha256, campos: camposDoTermo(t, ev),
    registroSha256Gravado: ev.registro_sha256, segredo });
  if (!r.integro) return r;
  const texto = await conferirTextoDaVersao(db, t);
  if (texto) return { integro: false, motivo: texto };
  const elo = await evidencia.conferirElos(db, ev);
  return elo ? { integro: false, motivo: elo } : { integro: true };
}

// RN-180.01 / I2: o contexto do termo na cadeia — o montador (pela fotografia, por emprestimo_id = contexto_id) e os extras que so
// ele ve: o termo sem evidencia, o texto da versao alterado e o termo apagado no fim da tabela.
evidencia.registrarContexto(CONTEXTO, {
  montador: async (db) => {
    const porEmprestimo = new Map((await dbAll(db, 'SELECT * FROM termos_emprestimo_ferramenta')).map((t) => [Number(t.emprestimo_id), t]));
    return async (ev) => {
      const t = porEmprestimo.get(Number(ev.contexto_id));
      return t ? camposDoTermo(t, ev) : null;
    };
  },
  extras: async (db) => {
    const out = [];
    const semEvidencia = await dbAll(db, `SELECT t.numero FROM termos_emprestimo_ferramenta t
      WHERE NOT EXISTS (SELECT 1 FROM evidencias_assinatura_almoxarifado v WHERE v.contexto = ? AND v.contexto_id = t.emprestimo_id)
      ORDER BY t.id`, [CONTEXTO]);
    for (const { numero } of semEvidencia) out.push({ sequencia: null, evidencia_id: null, numero, motivo: 'termo sem evidência' });
    for (const t of await dbAll(db, 'SELECT numero, termo_versao, texto_sha256 FROM termos_emprestimo_ferramenta ORDER BY id')) {
      const motivo = await conferirTextoDaVersao(db, t);
      if (motivo) out.push({ sequencia: null, evidencia_id: null, numero: t.numero, motivo });
    }
    const maior = await dbGet(db, 'SELECT MAX(id) AS m FROM termos_emprestimo_ferramenta');
    const autoinc = await dbGet(db, "SELECT seq FROM sqlite_sequence WHERE name = 'termos_emprestimo_ferramenta'");
    if (autoinc && Number(autoinc.seq) > Number((maior && maior.m) || 0)) {
      out.push({ sequencia: null, evidencia_id: null, numero: null, motivo: 'termo apagado no fim da tabela' });
    }
    return out;
  },
});

module.exports = {
  CONTEXTO, TIPO_FERRAMENTA, MARCA_PROVISORIO, ganchos, camposDoTermo,
  obterTermo, criarVersao, emprestarComTermo, obterTermoDoEmprestimo, verificarTermo,
};
