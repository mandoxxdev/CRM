// Variáveis manuais da proposta (proposta_variaveis_manuais) × os itens — Etapa 142 (C298, C309). Puro: quem escreve no banco é o index.js.
//
// O valor aponta para proposta_itens.id, e o salvamento da proposta APAGA e REINSERE todos os itens (ids novos). Três momentos:
//   - planoReligacao: no PUT /api/propostas/:id, depois de reinserir — o atual pareado (parearItens) leva as variáveis para a linha nova
//     do seu índice; as do atual que saiu são APOSENTADAS (item_removido_em), nunca apagadas (RN-142.05/06).
//   - repararVariaveisManuais: na leitura (/premium, /pdf) — a órfã viva com item_chave volta para um item da mesma identidade que não
//     tem nenhuma variável viva, todas as de um item velho juntas (RN-142.07).
//   - planoMaterializacao: nas gravações (PUT da proposta antes de parear, PUT .../variaveis-manuais antes do upsert) — grava o que o
//     reparo mostraria, para a órfã andar com o item (e não cair no produto incluído depois); a que não cabe é aposentada (RN-142.11).
const { parearItens, identidadeDe } = require('./propostaItensDiff');

const viva = (l) => l && (l.item_removido_em == null || l.item_removido_em === '');

function planoReligacao(itensAtuais, itensCorpo, idsNovos) {
  const corpo = Array.isArray(itensCorpo) ? itensCorpo : [];
  const novos = Array.isArray(idsNovos) ? idsNovos : [];
  // Os ids novos saem na ordem do corpo (INSERT sequencial, AUTOINCREMENT). Se a contagem não bate, algum INSERT falhou e o índice não
  // diz mais quem é quem: não religa nem aposenta (o reparo e a próxima gravação tratam) — D (142).
  if (novos.length !== corpo.length) return { mover: [], aposentar: [] };
  const { pares, sairam } = parearItens(itensAtuais, corpo);
  const mover = [];
  pares.forEach((a, i) => {
    if (a && a.id != null && String(a.id) !== String(novos[i])) mover.push([a.id, novos[i]]);
  });
  return { mover, aposentar: sairam.filter((a) => a && a.id != null).map((a) => a.id) };
}

// Decide, para cada órfã viva com identidade, o item atual que a recebe. Devolve Map(linha -> itemId) e a lista de órfãs vivas.
function destinoDasOrfas(linhas, itens) {
  const lista = Array.isArray(itens) ? itens : [];
  const idsAtuais = new Set(lista.map((i) => String(i.id)));
  const comLinhaViva = new Set(linhas.filter((l) => viva(l) && idsAtuais.has(String(l.item_id))).map((l) => String(l.item_id)));
  const orfas = linhas.filter((l) => viva(l) && !idsAtuais.has(String(l.item_id)));
  const destino = new Map();
  if (orfas.length === 0) return { destino, orfas };
  // Candidatos por identidade: itens atuais sem nenhuma variável viva, na ordem do documento.
  const candidatos = new Map();
  lista.forEach((it) => {
    const k = identidadeDe(it);
    if (!k || comLinhaViva.has(String(it.id))) return;
    if (!candidatos.has(k)) candidatos.set(k, []);
    candidatos.get(k).push(it.id);
  });
  // Grupos por item velho (C309: todas as variáveis de um item vão juntas), por identidade, em ordem crescente de id velho.
  const grupos = new Map(); // identidade -> Map(idVelho -> linhas)
  orfas.forEach((l) => {
    const k = String(l.item_chave || '').trim().toUpperCase();
    if (!k) return; // sem identidade gravada: nada a fazer
    if (!grupos.has(k)) grupos.set(k, new Map());
    const g = grupos.get(k);
    const idVelho = String(l.item_id);
    if (!g.has(idVelho)) g.set(idVelho, []);
    g.get(idVelho).push(l);
  });
  grupos.forEach((g, k) => {
    const cands = (candidatos.get(k) || []).slice();
    const velhos = Array.from(g.keys()).sort((a, b) => (Number(a) - Number(b)) || a.localeCompare(b));
    velhos.forEach((idVelho) => {
      if (cands.length === 0) return;
      const alvo = cands.shift();
      g.get(idVelho).forEach((l) => destino.set(l, alvo));
    });
  });
  return { destino, orfas };
}

function repararVariaveisManuais(vmRows, itens) {
  if (!Array.isArray(vmRows) || vmRows.length === 0) return vmRows || [];
  const { destino } = destinoDasOrfas(vmRows, itens);
  if (destino.size === 0) return vmRows;
  return vmRows.map((l) => (destino.has(l) ? { ...l, item_id: destino.get(l) } : l));
}

function planoMaterializacao(linhas, itens) {
  const lista = Array.isArray(linhas) ? linhas : [];
  const { destino, orfas } = destinoDasOrfas(lista, itens);
  const mover = [];
  const aposentar = [];
  orfas.forEach((l) => {
    if (destino.has(l)) mover.push([l.id, destino.get(l)]);
    else aposentar.push(l.id);
  });
  return { mover, aposentar };
}

module.exports = { planoReligacao, repararVariaveisManuais, planoMaterializacao };
