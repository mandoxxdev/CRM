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

async function listarEmprestimosVencidos(db) {
  return dbAll(db, `SELECT e.*, f.nome as ferramenta_nome, f.codigo_patrimonio,
      CAST(julianday(date('now')) - julianday(date(e.data_prevista_devolucao)) AS INTEGER) AS dias_vencido
    FROM emprestimos_ferramenta_almoxarifado e
    JOIN ferramentas_almoxarifado f ON e.ferramenta_id = f.id
    WHERE e.status = 'EMPRESTADA'
      AND e.data_prevista_devolucao IS NOT NULL
      AND date(e.data_prevista_devolucao) < date('now')
    ORDER BY e.data_prevista_devolucao ASC`);
}

module.exports = { listarEmprestimosVencidos };
