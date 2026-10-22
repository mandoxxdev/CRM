/**
 * Evidencia de assinatura na tela — GENERICA (Etapa 178, RN-178.07/RN-178.08; C1 da Fase 2).
 *
 * Plano: docs/superpowers/plans/2026-10-22-almoxarifado-etapa178-entrega-de-epi-com-assinatura.md
 *
 * A usuaria de Compras pediu que a assinatura feita no tablet "ofereca evidencias confiaveis do recebimento", com
 * "integridade dos registros e possibilidade de recuperacao". Este modulo e o que torna isso verificavel:
 *   - `arquivo_sha256`: o SHA-256 do PNG gravado — trocar 1 byte da imagem muda o hash;
 *   - `registro_sha256`: desde a Fase 5 (revisao adversarial, critico 1) o HMAC-SHA256 — com um segredo FORA do banco
 *     (`runtimeSecrets.resolveEvidenciaAssinaturaSecret`) — do JSON CANONICO (chaves ordenadas, valores normalizados) dos
 *     campos do registro + o `arquivo_sha256` + o `criado_em` + o elo da cadeia. Mudar qualquer campo gravado muda o HMAC, e
 *     quem tem so o banco e o disco nao recalcula (com o SHA-256 publico da T1, a sonda do revisor trocava o PNG e os dois
 *     hashes e `/verificar` dizia "integro"). O nome da coluna ficou (contrato congelado da T2); o valor e o HMAC em hex;
 *   - a CADEIA: `sequencia` (UNIQUE, crescente, global da tabela — todos os contextos) e `hash_anterior` (o registro da
 *     evidencia anterior), os dois dentro do HMAC. Apagar uma evidencia deixa lacuna; reescrever uma (mesmo com o segredo)
 *     quebra o elo da seguinte. Quem tem o banco, o disco E o segredo ainda forja reescrevendo dali ate a cabeca (letra D:
 *     ancora externa da cabeca fica para depois);
 *   - as tabelas sao append-only no banco (triggers, schema.js `ensureEntregaEpi`).
 *
 * Nao sabe nada de EPI: desde a Etapa 180 cada contexto (EPI, termo de ferramenta) se registra com `registrarContexto` e reusa `registroHmac`, `verificar`,
 * `naFilaDaCadeia`/`cabecaDaCadeia`, `verificarCadeia` e `literalSql` com o contexto dele. Quem chama decide QUAIS campos entram — e tem de normaliza-los da MESMA forma na gravacao
 * e na verificacao (a ida e volta pelo SQLite nao pode mudar o hash: `Number(...)`, texto ou null).
 */
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { dbGet, dbAll } = require('./db');

function sha256(conteudo) {
  return crypto.createHash('sha256').update(conteudo).digest('hex');
}

/** O SHA-256 do arquivo inteiro, ou `null` se ele nao existe (ou nao e arquivo). */
function sha256Arquivo(caminho) {
  try {
    return sha256(fs.readFileSync(caminho));
  } catch (e) {
    if (e && (e.code === 'ENOENT' || e.code === 'EISDIR' || e.code === 'ENOTDIR')) return null;
    throw e;
  }
}

/** Ordena as chaves recursivamente; `undefined` vira `null` (o JSON nao pode depender de "a chave veio ou nao"). */
function ordenar(valor) {
  if (valor === undefined) return null;
  if (valor === null || typeof valor !== 'object') return valor;
  if (Array.isArray(valor)) return valor.map(ordenar);
  const out = {};
  for (const k of Object.keys(valor).sort()) out[k] = ordenar(valor[k]);
  return out;
}

function jsonCanonico(valor) {
  return JSON.stringify(ordenar(valor));
}

/** O HMAC-SHA256 (hex) do JSON canonico. Sem segredo, recusa: um registro "assinado" com segredo vazio seria forjavel. */
function registroHmac(campos, segredo) {
  if (!segredo) throw Object.assign(new Error('Segredo da evidência de assinatura não configurado'), { status: 500 });
  return crypto.createHmac('sha256', String(segredo)).update(jsonCanonico(campos)).digest('hex');
}

const TABELA = 'evidencias_assinatura_almoxarifado';

/**
 * A fila da cadeia: ler a cabeca, calcular o HMAC com o elo e gravar tem de ser uma secao so — duas gravacoes que lessem a mesma
 * cabeca disputariam a mesma `sequencia` (o UNIQUE recusaria a segunda, e ela cairia na compensacao). Em memoria, premissa de UM
 * processo (a mesma das travas do almoxarifado, C132); o UNIQUE e a rede se a premissa quebrar. Nao reentrante; nao pega nenhuma
 * outra trava por dentro.
 */
let filaDaCadeia = Promise.resolve();
function naFilaDaCadeia(fn) {
  const vez = filaDaCadeia.then(() => fn());
  filaDaCadeia = vez.then(() => undefined, () => undefined);
  return vez;
}

/** A ultima evidencia encadeada: `{ sequencia, registro_sha256 }` ou null (cadeia vazia). */
async function cabecaDaCadeia(db) {
  const c = await dbGet(db, `SELECT sequencia, registro_sha256 FROM ${TABELA} WHERE sequencia IS NOT NULL
    ORDER BY sequencia DESC LIMIT 1`);
  return c ? { sequencia: Number(c.sequencia), registro_sha256: c.registro_sha256 } : null;
}

/** O elo de UMA evidencia com a anterior e a posterior; null quando os dois batem. */
async function conferirElos(db, ev) {
  if (ev.sequencia === null || ev.sequencia === undefined) return 'fora da cadeia';
  const s = Number(ev.sequencia);
  if (s > 1) {
    const ant = await dbGet(db, `SELECT registro_sha256 FROM ${TABELA} WHERE sequencia = ?`, [s - 1]);
    if (!ant) return 'registro anterior apagado';
    if (ant.registro_sha256 !== ev.hash_anterior) return 'elo com o anterior quebrado';
  } else if (ev.hash_anterior !== null && ev.hash_anterior !== undefined) {
    return 'elo com o anterior quebrado';
  }
  const post = await dbGet(db, `SELECT hash_anterior FROM ${TABELA} WHERE sequencia = ?`, [s + 1]);
  if (post) {
    if (post.hash_anterior !== ev.registro_sha256) return 'elo com o posterior quebrado';
  } else if (await dbGet(db, `SELECT 1 AS v FROM ${TABELA} WHERE sequencia > ? LIMIT 1`, [s])) {
    return 'registro posterior apagado';
  }
  return null;
}

/** Normalizadores para os campos do registro — os mesmos na gravacao e na releitura. */
const texto = (v) => (v === undefined || v === null ? null : String(v));
const numero = (v) => (v === undefined || v === null || v === '' ? null : Number(v));

/**
 * Literal SQL para o corpo de `db.execEmTransacao` (que roda um `exec` sem parametros — C1). Texto entre aspas simples com as
 * aspas dobradas; numero so se finito; o resto vira NULL. O NUL (\0) e recusado: o `exec` do SQLite corta a string nele, e o
 * que fosse gravado nao seria o que entrou no hash. Quem chama normaliza o texto ANTES de calcular o hash.
 */
function literalSql(v) {
  if (v === undefined || v === null) return 'NULL';
  if (typeof v === 'number') {
    if (!Number.isFinite(v)) throw new Error('literalSql: numero nao finito');
    return String(v);
  }
  const s = String(v);
  if (s.includes('\u0000')) throw new Error('literalSql: texto com NUL');
  return `'${s.replace(/'/g, "''")}'`;
}

/** Tira o NUL e as pontas; vazio vira null. Aplicado aos textos ANTES do hash e do INSERT. */
function textoLimpo(v) {
  if (v === undefined || v === null) return null;
  const s = String(v).replace(/\u0000/g, '').trim();
  return s === '' ? null : s;
}

/**
 * Verifica a evidencia. `arquivo` e o nome gravado (so o basename e usado — nunca sai do diretorio), `dir` o diretorio dos
 * uploads, `arquivoSha256` e `registroSha256Gravado` o que esta na linha, `campos` o registro relido e normalizado (o mesmo
 * montador da gravacao). A ordem das recusas: o arquivo some -> 'arquivo ausente'; a imagem muda -> 'arquivo alterado'; o
 * registro (ou o hash do arquivo gravado nele) muda -> 'registro alterado'.
 */
function verificar({ dir, arquivo, arquivoSha256, campos, registroSha256Gravado, segredo }) {
  const hashAgora = arquivo ? sha256Arquivo(path.join(dir, path.basename(String(arquivo)))) : null;
  if (hashAgora === null) return { integro: false, motivo: 'arquivo ausente' };
  if (hashAgora !== arquivoSha256) return { integro: false, motivo: 'arquivo alterado' };
  if (registroHmac(campos, segredo) !== registroSha256Gravado) return { integro: false, motivo: 'registro alterado' };
  return { integro: true };
}

/**
 * Etapa 180 (RN-180.01, I2 da revisao da Fase 2): o REGISTRO DE CONTEXTOS. A cadeia e global (todos os contextos na mesma
 * `sequencia`), mas so quem gravou sabe remontar os campos do registro — ate a 180 a verificacao da cadeia so conhecia o EPI e
 * acusava "registro alterado" em qualquer evidencia de outro contexto (um termo de ferramenta gravado faria o EPI acusar). Cada
 * contexto registra, no carregamento do modulo dele:
 *   - `montador(db)`: prepara (uma vez por verificacao) e devolve `async (ev) => campos | null` — o MESMO montador da gravacao;
 *     null quando o registro do contexto sumiu;
 *   - `extras(db, problemasAteAqui)` (opcional): os controles que so o contexto ve (o registro sem evidencia, a cauda apagada da
 *     tabela dele) — devolve a lista de problemas `{ sequencia, evidencia_id, numero, motivo }` a acrescentar.
 * Uma evidencia de contexto SEM montador registrado vira `'contexto desconhecido'` (nao "registro alterado": nao e prova de
 * adulteracao, e sim de que este servidor nao sabe remontar aquele registro). Registrar de novo o mesmo contexto substitui (os
 * testes usam isso); `removerContexto` existe para os testes.
 */
const contextos = new Map();
function registrarContexto(contexto, { montador, extras = null } = {}) {
  if (!contexto || typeof montador !== 'function') throw new Error('registrarContexto: contexto e montador sao obrigatorios');
  contextos.set(String(contexto), { montador, extras: typeof extras === 'function' ? extras : null });
}
function removerContexto(contexto) { contextos.delete(String(contexto)); }
function contextosRegistrados() { return [...contextos.keys()]; }

/**
 * Percorre a cadeia inteira (todos os contextos). Sem `camposDe`, usa o registro de contextos (RN-180.01) e roda os `extras`
 * de cada contexto no fim. `camposDe(ev)` (legado, um montador so) devolve os campos do registro (o mesmo montador da gravacao)
 * ou null quando o registro do contexto sumiu. Problemas, em ordem de sequencia: 'registro apagado' (lacuna — a sequencia que
 * falta), 'elo quebrado' (o `hash_anterior` nao e o registro da anterior), 'arquivo ausente' | 'arquivo alterado' | 'registro
 * alterado' (a propria evidencia), 'fora da cadeia' (sem sequencia: so base de dev anterior a Fase 5) e 'registro apagado no
 * fim da cadeia' (o AUTOINCREMENT ja passou do maior id: a cauda sumiu — quem tambem edita a `sqlite_sequence` escapa,
 * declarado). Cada problema: `{ sequencia, evidencia_id, numero, motivo }` (`numero` = o do registro do contexto, se houver).
 */
async function verificarCadeia(db, { dir, segredo, camposDe = null }) {
  const preparados = new Map();
  if (!camposDe) {
    for (const [ctx, { montador }] of contextos) preparados.set(ctx, await montador(db));
  }
  const linhas = await dbAll(db, `SELECT * FROM ${TABELA} ORDER BY sequencia IS NULL, sequencia, id`);
  const problemas = [];
  let anterior = null;
  let esperado = 1;
  let cabeca = null;
  for (const ev of linhas) {
    const montadorDaLinha = camposDe || preparados.get(ev.contexto) || null;
    const campos = montadorDaLinha ? await montadorDaLinha(ev) : null;
    const numero = campos && campos.numero ? campos.numero : null;
    const problema = (motivo) => problemas.push({
      sequencia: ev.sequencia == null ? null : Number(ev.sequencia), evidencia_id: ev.id, numero, motivo,
    });
    if (ev.sequencia === null || ev.sequencia === undefined) { problema('fora da cadeia'); continue; }
    const s = Number(ev.sequencia);
    let lacuna = false;
    for (let falta = esperado; falta < s; falta += 1) {
      problemas.push({ sequencia: falta, evidencia_id: null, numero: null, motivo: 'registro apagado' });
      lacuna = true;
    }
    if (!lacuna && (anterior ? ev.hash_anterior !== anterior.registro_sha256 : ev.hash_anterior != null)) problema('elo quebrado');
    if (!montadorDaLinha) {
      problema('contexto desconhecido');
    } else if (!campos) {
      problema('registro alterado');
    } else {
      const r = verificar({ dir, arquivo: ev.arquivo, arquivoSha256: ev.arquivo_sha256, campos,
        registroSha256Gravado: ev.registro_sha256, segredo });
      if (!r.integro) problema(r.motivo);
    }
    anterior = ev;
    esperado = s + 1;
    cabeca = { sequencia: s, registro_sha256: ev.registro_sha256 };
  }
  const maior = await dbGet(db, `SELECT MAX(id) AS m FROM ${TABELA}`);
  const autoinc = await dbGet(db, 'SELECT seq FROM sqlite_sequence WHERE name = ?', [TABELA]);
  if (autoinc && Number(autoinc.seq) > Number((maior && maior.m) || 0)) {
    problemas.push({ sequencia: null, evidencia_id: null, numero: null, motivo: 'registro apagado no fim da cadeia' });
  }
  if (!camposDe) {
    for (const [, { extras }] of contextos) {
      if (extras) problemas.push(...((await extras(db, problemas)) || []));
    }
  }
  return { integra: problemas.length === 0, total: linhas.length, cabeca, problemas };
}

/** CPF mascarado `***.***.***-NN` com os 2 ultimos digitos; menos de 2 digitos -> null (menores da Fase 2). */
function mascararCpf(cpf) {
  const digitos = String(cpf == null ? '' : cpf).replace(/\D/g, '');
  if (digitos.length < 2) return null;
  return `***.***.***-${digitos.slice(-2)}`;
}

module.exports = {
  sha256, sha256Arquivo, jsonCanonico, registroHmac, verificar, literalSql, textoLimpo, texto, numero, mascararCpf,
  naFilaDaCadeia, cabecaDaCadeia, conferirElos, verificarCadeia,
  registrarContexto, removerContexto, contextosRegistrados,
};
