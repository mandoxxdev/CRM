/**
 * Edição na tela de DUAS COLUNAS (pedido de 24/11/2026: "eu devo poder mudar todos os textos e depois ele traduz de forma
 * simultânea"). Antes, a tela de duas colunas era só leitura e editar exigia voltar ao modo português, salvar e voltar.
 *
 * O servidor marca cada parágrafo/item das cláusulas, na coluna em português, com o HTML ORIGINAL dele (`data-pt-html`). A tela liga a
 * edição nesses elementos e, ao salvar, troca exatamente aquele trecho dentro da cláusula gravada (PUT da cláusula) — depois traduz o
 * que ficou pendente e recarrega, e a coluna da direita aparece com a tradução nova.
 *
 * Fica de fora (continua editável no modo português): parágrafo com campo automático `{{…}}` — o texto visível já tem o valor deste
 * cliente e gravá-lo apagaria o marcador —, título de cláusula e textos fixos do documento (capa, apresentação, assinatura).
 */

const SELETOR = '.proposal-page[data-generated="1"] .bi-pt [data-pt-html]';

/** Liga a edição nos parágrafos das cláusulas. `aoMudar()` a cada tecla. Devolve quantos ficaram editáveis. */
export function ativarEdicaoBilingue(doc, aoMudar) {
  let n = 0;
  doc.querySelectorAll(SELETOR).forEach((el) => {
    const original = el.getAttribute('data-pt-html') || '';
    if (/\{\{[\s\S]*?\}\}/.test(original)) {
      el.title = 'Este texto tem um campo automático (ex.: nome do cliente): edite-o em "Voltar a editar".';
      return;
    }
    el.contentEditable = 'true';
    el.style.outline = '2px dashed #f59e0b';
    el.style.background = '#fffde7';
    el.style.borderRadius = '3px';
    el.style.cursor = 'text';
    el.oninput = () => { el.setAttribute('data-editado', '1'); if (aoMudar) aoMudar(); };
    n += 1;
  });
  return n;
}

/** [{ tipo: 'p'|'li', original, novo }] dos elementos editados (o HTML que o editor deixou, sem espaços nas pontas). */
export function lerEdicoesBilingue(doc) {
  return [...doc.querySelectorAll(`${SELETOR}[data-editado="1"]`)].map((el) => ({
    tipo: el.tagName.toLowerCase() === 'li' ? 'li' : 'p',
    original: el.getAttribute('data-pt-html') || '',
    novo: String(el.innerHTML || '').replace(/&nbsp;/g, ' ').replace(/<br\s*\/?>\s*$/i, '').trim(),
  })).filter((e) => e.novo !== e.original);
}

/**
 * Aplica as edições no conteúdo das cláusulas gravadas. Procura `>original</p>` (ou `</li>`) — o trecho exato que o servidor segmentou —
 * na primeira cláusula que o tiver. Devolve { alteradas: [{ id, titulo, conteudo }], naoAchadas: [edição] }.
 * Texto apagado por inteiro remove o parágrafo/item.
 */
export function aplicarEdicoesNasClausulas(clausulas, edicoes) {
  const porId = new Map();
  const naoAchadas = [];
  const conteudoDe = (c) => (porId.has(c.id) ? porId.get(c.id).conteudo : String(c.conteudo || ''));
  edicoes.forEach((ed) => {
    const fecha = `</${ed.tipo}>`;
    let feito = false;
    for (const c of clausulas || []) {
      const atual = conteudoDe(c);
      const re = new RegExp(`(<${ed.tipo}(?:\\s[^>]*)?>)${ed.original.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}${fecha}`);
      const m = re.exec(atual);
      if (!m) continue;
      const vazio = !ed.novo.replace(/<[^>]+>/g, '').trim();
      const troca = vazio ? '' : `${m[1]}${ed.novo}${fecha}`;
      porId.set(c.id, { id: c.id, titulo: c.titulo, conteudo: atual.slice(0, m.index) + troca + atual.slice(m.index + m[0].length) });
      feito = true;
      break;
    }
    if (!feito) naoAchadas.push(ed);
  });
  return { alteradas: [...porId.values()], naoAchadas };
}
