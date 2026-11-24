/**
 * Etapa 260 (RN-260.03, item 2) — a lista de projetos do campo Projeto da nova requisicao.
 *
 * `projetos` e `clientes` sao tabelas core (o `index.js` cria; o harness de testes nao): conferidas por PRAGMA (regua da 255), sem
 * a tabela -> [], sem `clientes` -> sem o nome do cliente. Ativos primeiro (status vazio conta como ativo), depois por nome; no maximo
 * 500. Inativo entra: a requisicao aceita projeto inativo (B1611), como aceita OS fechada.
 *
 * `comCliente` (a aux do almoxarifado) devolve `cliente_id` e `cliente_nome`; sem ele (a aux de requisicoes-material, aberta a quem
 * so tem login — B1613) so `id, nome, status`, como a aux de OS daquela rota.
 */
const { dbAll } = require('./db');

const colunasDe = async (db, tabela) => new Set((await dbAll(db, `PRAGMA table_info(${tabela})`)).map((c) => c.name));

async function listarProjetosAux(db, { comCliente = false } = {}) {
  const cols = await colunasDe(db, 'projetos');
  if (!cols.has('id') || !cols.has('nome')) return [];
  const status = cols.has('status') ? "COALESCE(NULLIF(TRIM(p.status), ''), 'ativo')" : "'ativo'";
  const ordem = `CASE WHEN LOWER(${status}) = 'ativo' THEN 0 ELSE 1 END, p.nome COLLATE NOCASE, p.id`;
  if (!comCliente) {
    return dbAll(db, `SELECT p.id, p.nome, ${status} AS status FROM projetos p ORDER BY ${ordem} LIMIT 500`);
  }
  const temCliente = cols.has('cliente_id');
  const temClientes = temCliente && (await colunasDe(db, 'clientes')).has('razao_social');
  return dbAll(db, `SELECT p.id, p.nome, ${status} AS status, ${temCliente ? 'p.cliente_id' : 'NULL'} AS cliente_id,
      ${temClientes ? 'c.razao_social' : 'NULL'} AS cliente_nome
    FROM projetos p ${temClientes ? 'LEFT JOIN clientes c ON c.id = p.cliente_id' : ''}
    ORDER BY ${ordem} LIMIT 500`);
}

module.exports = { listarProjetosAux };
