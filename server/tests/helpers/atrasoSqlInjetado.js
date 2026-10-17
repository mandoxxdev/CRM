/**
 * Etapa 140 (controle positivo da RN-140.10) — preload do `index.js` filho (`node -r atrasoSqlInjetado.js index.js`) que ATRASA, em
 * `ATRASO_SQL_MS` milissegundos (padrão 400), a resposta (o callback — no `run`, depois de gravar) de todo `db.all`/`db.get`/`db.run` cujo SQL casa com a regex de `ATRASO_SQL_INJETADO`.
 * Serve para abrir, de forma determinística, a janela entre a leitura e a gravação de uma rota (ex.: o envio da proposta lê a margem,
 * confere a aprovação e grava): sem a guarda da gravação, a corrida que só aparece "às vezes" aparece sempre. Sem a variável, nada muda.
 */
const path = require('path');

const padrao = process.env.ATRASO_SQL_INJETADO;
if (padrao) {
  // eslint-disable-next-line global-require, import/no-dynamic-require
  const sqlite3 = require(path.join(__dirname, '..', '..', 'node_modules', 'sqlite3'));
  const re = new RegExp(padrao);
  const ms = Number(process.env.ATRASO_SQL_MS) || 400;
  for (const m of ['all', 'get', 'run']) {
    const orig = sqlite3.Database.prototype[m];
    sqlite3.Database.prototype[m] = function comAtraso(sql, ...rest) {
      if (re.test(String(sql))) {
        const i = rest.findIndex((x) => typeof x === 'function');
        if (i >= 0) {
          const cb = rest[i];
          rest[i] = function atrasado(...args) { setTimeout(() => cb.apply(this, args), ms); };
        }
      }
      return orig.call(this, sql, ...rest);
    };
  }
}
