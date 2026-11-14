// Etapa 234 (D (233) 2, B1533): com o lote em branco, o servidor grava a saída no lote DAS séries marcadas (B1531) e recusa séries de lotes
// diferentes (B1532). A tela diz antes de enviar: um lote -> de qual sai; lotes diferentes (ou lote e sem lote) -> a frase de recusa, e o
// envio para nela. Todas sem lote ou nada marcado -> nada (como antes). Só para material sem controle de lote (com ele, o lote é exigido).
// Etapa 235 (B1538): extraída de MovimentacoesAlmoxarifado para a janela de devolução ao cliente (Materiais de Clientes) usar a mesma
// régua; `gesto` é a palavra do fim da frase de recusa ("faça uma saída/devolução para cada lote"). As literais da 234 não mudam.
export const fraseDoLoteDasSeries = (series, ids, gesto = 'saída') => {
  const marcadas = series.filter((s) => ids.includes(s.id));
  if (!marcadas.length) return null;
  // Fase 2 (234): a série com `lote_id` mas sem `lote_codigo` (lote apagado) é "sem lote", como no servidor (LEFT JOIN); a ordem é a do
  // `<` (a do `ORDER BY` do SQLite), não a do `localeCompare`.
  const temLote = (s) => s.lote_id != null && s.lote_codigo != null;
  const porLote = new Map();
  marcadas.filter(temLote).forEach((s) => porLote.set(Number(s.lote_id), String(s.lote_codigo)));
  const codigos = [...porLote.values()].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
  const semLote = marcadas.some((s) => !temLote(s));
  if (!codigos.length) return null;
  if (codigos.length === 1 && !semLote) return { mistura: false, texto: `As séries marcadas saem do lote ${codigos[0]}.` };
  const nomes = semLote ? [...codigos, 'sem lote'] : codigos;
  return { mistura: true, texto: `As séries marcadas são de lotes diferentes (${nomes.join(', ')}): faça uma ${gesto} para cada lote.` };
};
