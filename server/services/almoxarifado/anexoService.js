/**
 * Anexos de documento do almoxarifado — Etapa 32.
 *
 * A tabela `anexos_documento_almoxarifado` existia desde a Etapa 0 e era ORFA TOTAL: a varredura
 * do repositorio inteiro achava UMA ocorrencia do nome em `server/` — o proprio CREATE TABLE — e
 * mais dez em documentacao. Seis specs (01, 04, 08, 09, 12, 14) a esperavam, e cada uma assumia
 * que outra a pagaria; e por isso o item nunca andou em 31 etapas.
 *
 * Este servico NAO toca em disco. Quem grava o arquivo e o multer da rota; quem apaga o orfao de
 * uma saida != 201 e o `limparUploadOrfaoEm`. Aqui so entra o que o multer JA gravou, e sai a
 * linha do banco — a separacao existe para que a regra (entidade valida, pai existente, soft
 * delete) seja testavel sem I/O.
 */
const { dbRun, dbGet, dbAll } = require('./db');
const audit = require('./audit');

// Mapa FECHADO. Nao e string livre de proposito: `entidade` alimenta a listagem, e uma string
// livre deixaria o anexo pendurado num nome que nenhuma tela consulta — invisivel, e ninguem
// descobre. Os nomes de tabela foram LIDOS do CREATE TABLE de schema.js, nao imaginados:
// `recebimento` e `recebimentos_material_almoxarifado` e `inspecao` e
// `inspecoes_recebimento_almoxarifado` — os dois que a intuicao erraria.
//
// SEIS entidades, uma por pendencia REALMENTE medida nas specs. Nao ha `lote` nem
// `remessa_terceiro`, e a ausencia e deliberada, nao esquecimento: nenhuma spec os pede, e o
// certificado de lote JA TEM dono desde a Etapa 6 (coluna propria + `uploadCertificado`,
// routes/almoxarifado.js:209, item [x] em 10-lotes-series-etiquetas/README.md:398) — uma entidade
// `lote` aqui criaria um SEGUNDO lugar para o mesmo documento, e a tela teria de explicar qual dos
// dois ela le. A feature 14 pede o anexo no ITEM da remessa (14-materiais-terceiros/README.md:114),
// nao na remessa. Acrescentar qualquer uma delas depois e UMA LINHA.
const ENTIDADES_ANEXO = {
  material: 'materiais_almoxarifado',
  requisicao: 'requisicoes_almoxarifado',
  recebimento: 'recebimentos_material_almoxarifado',
  inspecao: 'inspecoes_recebimento_almoxarifado',
  devolucao: 'devolucoes_material_almoxarifado',
  item_remessa: 'itens_remessa_terceiro_almoxarifado',
};

// `arquivo_path` NAO entra: o nome do arquivo no disco nao sai para o client, que so precisa do
// `id` para baixar pela rota autenticada. Expor o nome nao daria acesso (o diretorio nao e
// servido estaticamente), mas convida a montar URL na mao, que e o habito que esta etapa desfaz.
const CAMPOS_PUBLICOS = `id, entidade, entidade_id, tipo, descricao, nome_original,
  tamanho_bytes, mime_type, uploaded_by, uploaded_by_nome, created_at`;

function erro(status, mensagem) {
  const e = new Error(mensagem);
  e.status = status;
  return e;
}

function tabelaDe(entidade) {
  // `hasOwnProperty` e nao `ENTIDADES_ANEXO[entidade]` — achado BLOQUEANTE da revisao adversarial,
  // reproduzido pela rota. O mapa e objeto literal, entao herda de Object.prototype:
  // ENTIDADES_ANEXO['constructor'] devolve a FUNCAO Object (truthy), a guarda nao lancava, e o
  // valor caia na interpolacao do `SELECT id FROM ${tabela}` — saindo
  // `SELECT id FROM function Object() { [native code] }` e um 500 com a mensagem crua do SQLite
  // no corpo da resposta, onde o contrato promete 400. O mesmo valia para `__proto__`,
  // `toString`, `valueOf`, `hasOwnProperty` e `isPrototypeOf`. O teste que devia pegar usava
  // `'qualquer_coisa'`, que nao e chave de prototipo — a RN-02 estava marcada como provada sem
  // estar.
  const tabela = Object.prototype.hasOwnProperty.call(ENTIDADES_ANEXO, entidade)
    ? ENTIDADES_ANEXO[entidade]
    : null;
  if (!tabela) throw erro(400, 'Entidade inválida para anexo');
  return tabela;
}

async function assertPaiExiste(db, entidade, entidadeId) {
  const tabela = tabelaDe(entidade);
  const id = Number(entidadeId);
  // Number.isInteger e nao Number.isFinite: `1.5` viraria `1` no SQLite e penduraria o anexo no
  // registro errado, em silencio.
  if (!Number.isInteger(id) || id <= 0) throw erro(404, 'Registro não encontrado para anexar');
  // SEM filtro de `ativo`, de proposito (letra B): exclusao de material e SOFT DELETE
  // (routes/almoxarifado.js:667), e documento historico de material aposentado tem de continuar
  // anexavel. Alem disso `ativo` nem existe com esse sentido em requisicoes/recebimentos.
  const pai = await dbGet(db, `SELECT id FROM ${tabela} WHERE id = ?`, [id]);
  if (!pai) throw erro(404, 'Registro não encontrado para anexar');
  return id;
}

/**
 * O `filename` do multipart chega do busboy decodificado como LATIN1, e esta etapa e a primeira do
 * modulo que PERSISTE esse campo — as outras seis rotas de upload so usam `path.extname`, entao o
 * defeito nasceria aqui. Medido na revisao adversarial: "Certificado nº 123 — aço.pdf" era gravado
 * como "Certificado nÂº 123 â€” aÃ§o.pdf", e ia assim para a lista da tela, para o
 * `Content-Disposition` e para o `<a download>`. Num chao de fabrica brasileiro esse e o caso
 * comum, nao a excecao.
 *
 * A reinterpretacao so acontece quando o resultado ROUNDTRIPA — se `Buffer.from(x,'latin1')` nao
 * volta ao original, o nome ja estava em UTF-8 correto (algum cliente que encodou certo) e
 * reinterpretar o corromperia. Preferir o texto que sobrevive ao ciclo e mais seguro que assumir
 * a origem.
 */
function nomeOriginalUtf8(bruto) {
  const nome = String(bruto || '');
  if (!nome) return nome;
  try {
    const buf = Buffer.from(nome, 'latin1');
    if (buf.toString('latin1') !== nome) return nome; // nao era latin1 puro: deixa como veio
    const utf8 = buf.toString('utf8');
    // `�` = replacement char: a sequencia nao era UTF-8 valido, entao o nome ja estava certo.
    return utf8.includes('�') ? nome : utf8;
  } catch (e) {
    return nome;
  }
}

async function registrarAnexo(db, user, { entidade, entidade_id, tipo, descricao }, arquivo) {
  const paiId = await assertPaiExiste(db, entidade, entidade_id);
  if (!arquivo || !arquivo.filename) throw erro(400, 'Arquivo é obrigatório');

  const r = await dbRun(db, `INSERT INTO anexos_documento_almoxarifado
    (entidade, entidade_id, tipo, arquivo_path, nome_original, tamanho_bytes, mime_type, uploaded_by, uploaded_by_nome, descricao, ativo)
    VALUES (?,?,?,?,?,?,?,?,?,?,1)`, [
    entidade, paiId, tipo, arquivo.filename,
    nomeOriginalUtf8(arquivo.originalname) || arquivo.filename,
    arquivo.size ?? null, arquivo.mimetype || null, user?.id ?? null,
    // DENORMALIZADO de proposito: `usuarios` e tabela CORE, fora do initSchema do almoxarifado e
    // fora do harness (testApp.js stuba so `clientes` e `fornecedores`) — um LEFT JOIN faria todo
    // POST morrer com "no such table: usuarios" no teste. Precedente escrito da base:
    // requisitionCreateService.js:31. E o nome do momento do upload e o que a trilha quer.
    user?.nome || user?.email || null, descricao || null,
  ]);

  const linha = await dbGet(db,
    `SELECT ${CAMPOS_PUBLICOS} FROM anexos_documento_almoxarifado WHERE id = ?`, [r.lastID]);

  // Auditoria POS-ESCRITA e best-effort: a mesma RN-02 da Etapa 19 — derrubar a resposta por causa
  // do log desfaria nada e devolveria erro para um ato que deu certo.
  //
  // O verbo e MAIUSCULO, e isso nao e estilo: a regua de cobertura do vocabulario da trilha
  // (tests/api/auditLabels.api.test.js:60-61) varre o codigo com `acao: '\K[A-Z_]+` — SO
  // maiusculas. Verbo minusculo nao entra no `semRotulo` daquele teste, entao o teste que existe
  // exatamente para impedir verbo sem rotulo ficaria verde, e a tela de auditoria da Etapa 22
  // mostraria `anexar` cru no meio de `Criacao`/`Exclusao`. E REMOVER_ANEXO em vez de REMOVER
  // porque a trilha e lida meses depois, e verbo generico nao diz o que foi removido.
  try {
    await audit.registrarAuditoria(db, {
      entidade: 'anexo', entidade_id: r.lastID, acao: 'ANEXAR',
      usuario_id: user?.id, usuario_nome: user?.nome || user?.email,
      dados_novos: { entidade, entidade_id: paiId, tipo, nome_original: linha.nome_original },
    });
  } catch (e) { console.error('[almoxarifado] Falha ao auditar anexo:', e.message); }

  return linha;
}

async function listarAnexos(db, { entidade, entidade_id }) {
  tabelaDe(entidade); // 400 para entidade fora do mapa, mesma literal do POST
  // `entidade_id` ausente ou nao numerico era `Number(x) || 0` e devolvia 200 com lista VAZIA —
  // achado da revisao adversarial. Nao vazava nada, mas tornava impossivel distinguir "nao ha
  // anexo" de "chamei errado", que e exatamente a classe de bug que o download desta etapa
  // combate. 400 com a mesma literal do Zod do POST.
  const id = Number(entidade_id);
  if (!Number.isInteger(id) || id <= 0) throw erro(400, 'Registro inválido');
  return dbAll(db, `SELECT ${CAMPOS_PUBLICOS} FROM anexos_documento_almoxarifado
    WHERE entidade = ? AND entidade_id = ? AND ativo = 1
    ORDER BY created_at DESC, id DESC`, [entidade, id]);
}

async function getAnexoParaDownload(db, id) {
  const n = Number(id);
  if (!Number.isInteger(n) || n <= 0) throw erro(404, 'Anexo não encontrado');
  const row = await dbGet(db, `SELECT id, arquivo_path, nome_original, mime_type
    FROM anexos_documento_almoxarifado WHERE id = ? AND ativo = 1`, [n]);
  if (!row) throw erro(404, 'Anexo não encontrado');
  return row;
}

async function removerAnexo(db, user, id) {
  const n = Number(id);
  if (!Number.isInteger(n) || n <= 0) throw erro(404, 'Anexo não encontrado');
  const antes = await dbGet(db,
    `SELECT ${CAMPOS_PUBLICOS} FROM anexos_documento_almoxarifado WHERE id = ? AND ativo = 1`, [n]);
  if (!antes) throw erro(404, 'Anexo não encontrado');

  // Claim por UPDATE-com-WHERE, molde do modulo: duas remocoes simultaneas, so uma tem changes=1.
  const r = await dbRun(db, `UPDATE anexos_documento_almoxarifado
    SET ativo = 0, deleted_by = ?, deleted_at = CURRENT_TIMESTAMP
    WHERE id = ? AND ativo = 1`, [user?.id ?? null, n]);
  if (!r.changes) throw erro(404, 'Anexo não encontrado');

  try {
    await audit.registrarAuditoria(db, {
      entidade: 'anexo', entidade_id: n, acao: 'REMOVER_ANEXO',
      usuario_id: user?.id, usuario_nome: user?.nome || user?.email,
      dados_anteriores: antes,
    });
  } catch (e) { console.error('[almoxarifado] Falha ao auditar remocao de anexo:', e.message); }

  // O ARQUIVO FICA NO DISCO, de proposito (D5 do design): documento de qualidade some da tela, nao
  // do sistema. Com o arquivo apagado, a linha de auditoria acima vira promessa vazia — ela diz
  // que existiu algo que ninguem pode mais ver. Alternativa descartada (apagar junto) registrada
  // na letra B do doc de novidades.
  return { ok: true };
}

module.exports = {
  ENTIDADES_ANEXO, registrarAnexo, listarAnexos, getAnexoParaDownload, removerAnexo,
};
