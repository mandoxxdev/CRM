const { dbRun } = require('./db');

async function registrarAuditoria(db, {
  entidade, entidade_id, acao, usuario_id, usuario_nome, dados_anteriores, dados_novos, justificativa,
}) {
  await dbRun(db, `INSERT INTO auditoria_log_almoxarifado
    (entidade, entidade_id, acao, usuario_id, usuario_nome, dados_anteriores, dados_novos, justificativa)
    VALUES (?,?,?,?,?,?,?,?)`, [
    entidade,
    entidade_id || null,
    acao,
    usuario_id || null,
    usuario_nome || null,
    dados_anteriores ? JSON.stringify(dados_anteriores) : null,
    dados_novos ? JSON.stringify(dados_novos) : null,
    justificativa || null,
  ]);
}

/**
 * Etapa 121 (C252, B784) — a Auditoria de um ato JA gravado. Grava como `registrarAuditoria`; se o banco falhar, registra no
 * log do servidor e segue (resolve `false`). Medido nas 110 chamadas: em 49 portas a Auditoria roda depois de o ato estar
 * gravado e a falha dela derrubava a resposta — e a tela lia "nada aconteceu": repetir duplicava (copia de requisicao, regra,
 * recebimento, retalho, devolucao avulsa, sucateamento, calibracao, material com codigo automatico), recusava ("ja processada")
 * ou perdia o que vinha depois (a nota processada sem a reserva de quem esperava; o comprovante e a assinatura apagados do disco
 * pelo catch da rota). Molde: a Auditoria do lancamento do motor (Etapa 120, B778) e a do cancelamento (Etapa 119, B775).
 *
 * NAO use onde a falha precisa abortar: dentro do motor ANTES do livro (series, lote, material de cliente — o catch amplo do
 * motor compensa e repetir funciona), ou antes do proprio ato (o excedente na conferencia). O ato continua com quem e quando
 * na propria tabela; some so da tela de Auditoria.
 */
async function registrarAuditoriaDoAto(db, payload) {
  try {
    await registrarAuditoria(db, payload);
    return true;
  } catch (e) {
    console.warn(`[almoxarifado] auditoria do ato falhou (${payload && payload.entidade} ${payload && payload.entidade_id != null
      ? payload.entidade_id : '-'}, ${payload && payload.acao}): ${e.message}`);
    return false;
  }
}

module.exports = { registrarAuditoria, registrarAuditoriaDoAto };
