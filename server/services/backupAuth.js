/**
 * Gate do `GET /api/backup` (server/index.js).
 *
 * Antes desta etapa a comparacao era `provided !== token`: comparacao de string com saida
 * antecipada, vulneravel a medicao de tempo. Aqui vira `crypto.timingSafeEqual`.
 *
 * O que NAO muda de proposito, e por que:
 *   - a QUERY STRING continua aceita. O comentario da propria rota (index.js:3468) documenta
 *     `?token=` como O uso, e pode existir cron externo na VPS que nao enxergamos daqui;
 *     remover o caminho quebraria o backup de producao para fechar um risco menor. Fica o
 *     aviso de depreciacao no log.
 *   - token esperado CURTO avisa, nao recusa. Nao ha `.env` no repositorio, entao o
 *     comprimento do token real e desconhecido daqui; exigir 32+ caracteres recusaria um
 *     token curto porem CORRETO — de novo, quebrar backup de producao.
 * O que se mantem: fail-closed quando a env nao existe (comportamento de hoje, correto).
 */
const crypto = require('crypto');

const TAMANHO_MINIMO_RECOMENDADO = 32;

/**
 * @param {{ authorization?: string, queryToken?: string }} entrada
 * @param {string|undefined} tokenEsperado normalmente `process.env.BACKUP_TOKEN`
 * @returns {{ ok: boolean, motivo: string|null, avisos: string[], aviso: string|null }}
 *   motivo: 'SEM_TOKEN_CONFIGURADO' | 'AUSENTE' | 'INVALIDO' | null
 *   avisos: 'CURTO' e/ou 'QUERY_DEPRECIADA' — vao para o LOG, nunca para a resposta HTTP
 *   (dizer ao cliente que o token do servidor e curto seria entregar dica de graca).
 */
function validarTokenBackup(entrada, tokenEsperado) {
  const { authorization, queryToken } = entrada || {};
  const avisos = [];
  const resultado = (ok, motivo) => ({ ok, motivo: motivo || null, avisos, aviso: avisos[0] || null });

  if (!tokenEsperado) return resultado(false, 'SEM_TOKEN_CONFIGURADO');
  if (String(tokenEsperado).length < TAMANHO_MINIMO_RECOMENDADO) avisos.push('CURTO');

  const doHeader = String(authorization || '').replace(/^Bearer\s+/i, '').trim();
  let fornecido = doHeader;
  if (!fornecido && queryToken) {
    fornecido = String(queryToken).trim();
    if (fornecido) avisos.push('QUERY_DEPRECIADA');
  }
  if (!fornecido) return resultado(false, 'AUSENTE');

  const a = Buffer.from(fornecido, 'utf8');
  const b = Buffer.from(String(tokenEsperado), 'utf8');
  // timingSafeEqual LANCA com buffers de tamanhos diferentes — comparar tamanho antes. O
  // tamanho vazar por essa comparacao e aceitavel: o que interessa proteger e o conteudo.
  if (a.length !== b.length) return resultado(false, 'INVALIDO');
  if (!crypto.timingSafeEqual(a, b)) return resultado(false, 'INVALIDO');

  return resultado(true, null);
}

module.exports = { validarTokenBackup, TAMANHO_MINIMO_RECOMENDADO };
