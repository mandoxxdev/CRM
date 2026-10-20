/**
 * Devolucao de ferramenta vencida (Etapa 9b, Task 6 — design D6).
 *
 * Segue o mesmo raciocinio de dominio de `requisitionReminderService.js` (leitura pura separada
 * do envio), mas D6 e explicito: o painel/alerta formal (agendamento, e-mail, log de envio) fica
 * para a feature 20 — "declarado, nao esquecido". Esta task so entrega a base que aquela feature
 * vai consumir: uma leitura PURA, sem efeito colateral, do que esta vencido agora.
 *
 * "Vencido" = emprestimo com status EMPRESTADA (ainda nao devolvido) e data_prevista_devolucao
 * no passado. Emprestimo sem data prevista (coluna nullable) NUNCA e vencido — a comparacao so
 * faz sentido quando existe uma data prometida. Emprestimo ja DEVOLVIDA nao conta, mesmo que a
 * data prevista tenha ficado no passado — o que importa e se ele ainda esta aberto hoje.
 */
const { dbAll } = require('./db');
const diaLocal = require('../diaLocal');

/**
 * Etapa 163 (RN-163.05, C406, B1041): "hoje" e o dia de Brasilia (`hojeISO`, `AAAA-MM-DD`; padrao `diaLocal.hojeLocalISO()`), nao o
 * `date('now')` do SQLite (o dia UTC: das 21h a meia-noite, o emprestimo que volta hoje ja era vencido). Quem monta a chave do lembrete
 * passa o MESMO `hojeISO` que usa na chave (Fase 2 I3) — uma leitura do relogio por varredura.
 */
async function listarEmprestimosVencidos(db, hojeISO = diaLocal.hojeLocalISO()) {
  return dbAll(db, `SELECT e.*, f.nome as ferramenta_nome, f.codigo_patrimonio,
      CAST(julianday(?) - julianday(date(e.data_prevista_devolucao)) AS INTEGER) AS dias_vencido
    FROM emprestimos_ferramenta_almoxarifado e
    JOIN ferramentas_almoxarifado f ON e.ferramenta_id = f.id
    WHERE e.status = 'EMPRESTADA'
      AND e.data_prevista_devolucao IS NOT NULL
      AND date(e.data_prevista_devolucao) < ?
    ORDER BY e.data_prevista_devolucao ASC`, [hojeISO, hojeISO]);
}

module.exports = { listarEmprestimosVencidos };
