// Diff de itens de proposta para auditoria (add/edit/remove). Puro, testável.
function chaveDe(item) {
  return String(item.codigo_produto || item.descricao || item.nome || '').trim();
}
function nomeDe(item) {
  return String(item.descricao || item.nome || item.codigo_produto || 'item').trim();
}
const CAMPOS = ['quantidade', 'valor_unitario', 'valor_total', 'modelo', 'descritivo_tecnico'];

function diffItensParaLog(itensAtuais, itensNovos) {
  const antesMap = new Map((itensAtuais || []).map((i) => [chaveDe(i), i]));
  const depoisMap = new Map((itensNovos || []).map((i) => [chaveDe(i), i]));
  const adicionados = [], removidos = [], editados = [];

  for (const [k, novo] of depoisMap) {
    if (!antesMap.has(k)) { adicionados.push(novo); continue; }
    const antigo = antesMap.get(k);
    for (const campo of CAMPOS) {
      const a = antigo[campo] == null ? '' : String(antigo[campo]);
      const b = novo[campo] == null ? '' : String(novo[campo]);
      if (a !== b) editados.push({ campo, antes: antigo[campo], depois: novo[campo], nome: nomeDe(novo) });
    }
  }
  for (const [k, antigo] of antesMap) {
    if (!depoisMap.has(k)) removidos.push(antigo);
  }
  return { adicionados, removidos, editados };
}
module.exports = { diffItensParaLog, chaveDe, nomeDe };
