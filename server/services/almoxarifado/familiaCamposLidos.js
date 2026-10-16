/**
 * Etapa 126 (D (125), B815) — os campos que o *Editar* da aba Familias manda como LIDOS (`campos_lidos` no `PUT /familias/:id`): o
 * nome, o tipo de uso e a descricao, na ordem da tela. O molde e o do material (Etapa 125, `camposLidos.js`): o servidor recusa (409)
 * quando o lido difere do gravado E o que gravaria tambem difere do gravado — salvar desfaria a mudanca de outra pessoa.
 *
 * Normalizacao (Fase 2 da 126, I1): a MESMA funcao para o lido, o gravado e o que gravaria. O `PUT` grava o nome aparado, a descricao
 * vazia como NULL e o tipo de uso fora da lista como 'ambos' — sem normalizar os tres do mesmo jeito, o legado `'  Legado  '`/NULL salvo
 * sem mudanca por outra aba virava um falso 409 de "Nome" e "Tipo de uso".
 */
const TIPOS_USO = ['administrativo', 'industrial', 'ambos'];

const CAMPOS_LIDOS_FAMILIA = [
  ['nome', 'Nome', (v) => String(v ?? '').trim()],
  ['tipo_uso', 'Tipo de uso', (v) => (TIPOS_USO.includes(v) ? v : 'ambos')],
  ['descricao', 'Descrição', (v) => (v === null || v === undefined || v === '' ? '' : String(v))],
];

const ehObjetoSimples = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);

/** `campos_lidos` presente e mal formado (nao objeto, ou um valor objeto/array) -> true. Ausente -> false. */
function camposLidosFamiliaInvalidos(v) {
  if (v === undefined) return false;
  if (!ehObjetoSimples(v)) return true;
  return Object.values(v).some((x) => x !== null && typeof x === 'object');
}

/**
 * Os rotulos dos campos que salvar desfaria: lido presente, lido != gravado e o que gravaria != gravado. `gravaria` e o valor que o
 * `UPDATE` poria na coluna (o omitido = o gravado).
 */
function camposDesfeitosFamilia(lidos, gravado, gravaria) {
  if (!ehObjetoSimples(lidos)) return [];
  const rotulos = [];
  for (const [col, rotulo, n] of CAMPOS_LIDOS_FAMILIA) {
    if (lidos[col] === undefined) continue;
    if (n(lidos[col]) !== n(gravado[col]) && n(gravaria[col]) !== n(gravado[col])) rotulos.push(rotulo);
  }
  return rotulos;
}

/** E1 da Etapa 126 (409, contrato congelado no plano). */
function mensagemCamposFamiliaMudadosPorOutro(ehSub, codigo, rotulos) {
  const q = rotulos.map((r) => `"${r}"`);
  const tipo = ehSub ? 'subfamília' : 'família';
  const meio = ' por outra pessoa depois que você abriu a edição — salvar desfaria ';
  const fim = ', e nada foi gravado. Recarregue a lista e edite de novo.';
  if (q.length === 1) return `O campo ${q[0]} da ${tipo} ${codigo} foi mudado${meio}essa mudança${fim}`;
  return `Os campos ${q.slice(0, -1).join(', ')} e ${q[q.length - 1]} da ${tipo} ${codigo} foram mudados${meio}essas mudanças${fim}`;
}

module.exports = {
  CAMPOS_LIDOS_FAMILIA, camposLidosFamiliaInvalidos, camposDesfeitosFamilia, mensagemCamposFamiliaMudadosPorOutro,
};
