/**
 * Etapa 134 (Fase 5 r3) — preload do `index.js` filho (`node -r falhaSqlInjetada.js index.js`) que faz FALHAR, com erro no callback,
 * todo `db.run`/`db.get` cujo SQL casa com a regex de `FALHA_SQL_INJETADA`. Serve para provar o que o boot faz quando uma consulta
 * do seed/promocao do administrador falha (a falha da regua e fechada: registra, nao promove nem cria). Sem a variavel, nao faz nada.
 *
 * Etapa 141 (Fase 5 r3): `FALHA_SQL_METODOS` (padrao "run,get") acrescenta `all` — a conferencia do desconto le as aprovacoes por
 * `db.all` — e `FALHA_SQL_MSG` troca a mensagem do erro (ex.: "SQLITE_BUSY: database is locked", para provar o 503).
 */
const path = require('path');

const padrao = process.env.FALHA_SQL_INJETADA;
if (padrao) {
  // eslint-disable-next-line global-require, import/no-dynamic-require
  const sqlite3 = require(path.join(__dirname, '..', '..', 'node_modules', 'sqlite3'));
  const re = new RegExp(padrao);
  const metodos = String(process.env.FALHA_SQL_METODOS || 'run,get').split(',').map((s) => s.trim()).filter(Boolean);
  const msg = process.env.FALHA_SQL_MSG || 'falha injetada pelo teste';
  for (const m of metodos) {
    const orig = sqlite3.Database.prototype[m];
    sqlite3.Database.prototype[m] = function comFalha(sql, ...rest) {
      if (re.test(String(sql))) {
        const cb = rest.find((x) => typeof x === 'function');
        process.stdout.write(`[falha injetada] ${String(sql).slice(0, 60).replace(/\s+/g, ' ')}\n`);
        if (cb) setImmediate(() => cb.call({}, new Error(msg)));
        return this;
      }
      return orig.call(this, sql, ...rest);
    };
  }
}
