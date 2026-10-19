/**
 * Etapa 159 (RN-159.02, C385) — a busca de texto que acha a letra acentuada em qualquer caixa.
 *
 * O cadastro grava razao social, titulo, nome do produto etc. em maiusculas pelo `toUpperCase` do JavaScript ("SÃO JOSÉ"). O `LIKE`
 * do SQLite ignora a caixa so das letras SEM acento (`'SÃO' LIKE '%são%'` = 0) e o `LOWER`/`UPPER` dele nao mudam a letra acentuada
 * (`LOWER('SÃO')` = 'sÃo'). Entao a busca procura cada coluna com o termo como veio, em maiusculas e em minusculas (pelo JavaScript):
 * acha o gravado em maiusculas e o legado em minusculas. Limite declarado (B1013): acento nao e ignorado ("sao" nao acha "SÃO") e o
 * legado misturado com duas letras acentuadas de caixas diferentes ("Ótica Paixão") so e achado pela mesma grafia.
 *
 * `%` e `_` no termo continuam curingas do LIKE (como antes).
 */

/** As formas distintas do termo aparado: [como veio, MAIUSCULAS, minusculas]. Nao texto, vazio ou so espacos -> []. */
function formasDoTermo(termo) {
  if (typeof termo !== 'string') return [];
  // Fase 5 r1 M1: o termo na forma composta (NFC), a do cadastro — o "são" colado de um PDF ou digitado no macOS vem decomposto
  // ("sa\u0303o") e nao casava com nada
  const t = termo.normalize('NFC').trim();
  if (!t) return [];
  const formas = [];
  for (const f of [t, t.toUpperCase(), t.toLowerCase()]) if (!formas.includes(f)) formas.push(f);
  return formas;
}

/**
 * A condicao SQL da busca nas colunas: `(COALESCE(c, '') LIKE ? OR ...)` com um `?` por forma e coluna, e os parametros `%forma%`.
 * Sem termo -> `{ sql: '', params: [] }` (quem chama nao acrescenta nada).
 *
 * Etapa 160 (RN-160.04): `{ escapar: true }` escapa \, % e _ em cada forma e acrescenta `ESCAPE '\'` — o termo vale como texto
 * (o filtro de usuario do historico de movimentacoes ja era assim; sem a opcao, % e _ continuam curingas, como na 159).
 */
function condicaoDeBusca(colunas, termo, { escapar = false } = {}) {
  const formas = formasDoTermo(termo);
  if (!formas.length) return { sql: '', params: [] };
  const partes = [];
  const params = [];
  const esc = escapar ? " ESCAPE '\\'" : '';
  for (const c of colunas) {
    for (const f of formas) {
      partes.push(`COALESCE(${c}, '') LIKE ?${esc}`);
      params.push(`%${escapar ? f.replace(/[\\%_]/g, (x) => `\\${x}`) : f}%`);
    }
  }
  return { sql: `(${partes.join(' OR ')})`, params };
}

module.exports = { formasDoTermo, condicaoDeBusca };
