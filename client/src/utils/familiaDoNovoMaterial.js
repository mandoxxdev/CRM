/**
 * Etapa 100 (G10, RN-100.06c) — a família do material criado pelos atalhos de Sobras (retalho) e
 * Remessas (resultado da transformação), que COPIAM a família do material de origem.
 *
 * O servidor passou a recusar subfamília no lugar da família em material novo ("A família escolhida
 * é uma subfamília…"). Material de origem LEGADO — gravado pela API, antes, com a subfamília no
 * `familia_id` — faria o atalho tomar essa recusa, num modal que nem tem campo de subfamília. Aqui o
 * par vira o do padrão: `familia_id` = a família principal, `subfamilia_id` = a sub (só se ela estiver
 * ativa — sub inativa é recusada pelo servidor; aí vai só a principal).
 *
 * Origem no padrão (família raiz): devolve `{ familia_id }` e nada muda. Lista de famílias que falhou:
 * devolve o valor da origem como está — o servidor decide, e a mensagem dele aparece no toast.
 *
 * @param {object} api       cliente HTTP (`services/api`)
 * @param {number|string} familiaId  a família copiada do material de origem
 * @returns {Promise<{familia_id: number, subfamilia_id?: number}>}
 */
export async function familiaDoNovoMaterial(api, familiaId) {
  const id = Number(familiaId);
  let lista = [];
  try {
    const res = await api.get('/almoxarifado/familias', { params: { ativo: 'all' } });
    lista = Array.isArray(res.data) ? res.data : [];
  } catch (e) {
    return { familia_id: id };
  }
  const fam = lista.find((f) => Number(f.id) === id);
  if (!fam || fam.parent_id === null || fam.parent_id === undefined) return { familia_id: id };
  const par = { familia_id: Number(fam.parent_id) };
  if (Number(fam.ativo) === 1) par.subfamilia_id = id;
  return par;
}

export default familiaDoNovoMaterial;
