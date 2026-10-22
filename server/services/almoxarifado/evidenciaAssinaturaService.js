/**
 * Evidencia de assinatura na tela — GENERICA (Etapa 178, RN-178.07/RN-178.08; C1 da Fase 2).
 *
 * Plano: docs/superpowers/plans/2026-10-22-almoxarifado-etapa178-entrega-de-epi-com-assinatura.md
 *
 * A usuaria de Compras pediu que a assinatura feita no tablet "ofereca evidencias confiaveis do recebimento", com
 * "integridade dos registros e possibilidade de recuperacao". Este modulo e o que torna isso verificavel:
 *   - `arquivo_sha256`: o SHA-256 do PNG gravado — trocar 1 byte da imagem muda o hash;
 *   - `registro_sha256`: o SHA-256 do JSON CANONICO (chaves ordenadas, valores normalizados) dos campos do registro + o
 *     `arquivo_sha256` + o `criado_em` — mudar qualquer campo gravado (quem recebeu, o que, quanto, quando) muda o hash;
 *   - as tabelas sao append-only no banco (triggers, schema.js `ensureEntregaEpi`).
 *
 * Nao sabe nada de EPI: o termo de responsabilidade de ferramenta (RN-D, letra D) vai reusar `registroSha256`, `verificar` e
 * `literalSql` com o contexto dele. Quem chama decide QUAIS campos entram — e tem de normaliza-los da MESMA forma na gravacao
 * e na verificacao (a ida e volta pelo SQLite nao pode mudar o hash: `Number(...)`, texto ou null).
 */
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

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

function registroSha256(campos) {
  return sha256(jsonCanonico(campos));
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
function verificar({ dir, arquivo, arquivoSha256, campos, registroSha256Gravado }) {
  const hashAgora = arquivo ? sha256Arquivo(path.join(dir, path.basename(String(arquivo)))) : null;
  if (hashAgora === null) return { integro: false, motivo: 'arquivo ausente' };
  if (hashAgora !== arquivoSha256) return { integro: false, motivo: 'arquivo alterado' };
  if (registroSha256(campos) !== registroSha256Gravado) return { integro: false, motivo: 'registro alterado' };
  return { integro: true };
}

/** CPF mascarado `***.***.***-NN` com os 2 ultimos digitos; menos de 2 digitos -> null (menores da Fase 2). */
function mascararCpf(cpf) {
  const digitos = String(cpf == null ? '' : cpf).replace(/\D/g, '');
  if (digitos.length < 2) return null;
  return `***.***.***-${digitos.slice(-2)}`;
}

module.exports = {
  sha256, sha256Arquivo, jsonCanonico, registroSha256, verificar, literalSql, textoLimpo, texto, numero, mascararCpf,
};
