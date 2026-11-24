/**
 * Edição na tela de duas colunas (24/11/2026: "eu devo poder mudar todos os textos e depois ele traduz de forma simultânea").
 */
import { ativarEdicaoBilingue, lerEdicoesBilingue, aplicarEdicoesNasClausulas } from './edicaoBilingue';

const pagina = (corpo) => {
  const doc = document.implementation.createHTMLDocument('x');
  doc.body.innerHTML = `<section class="proposal-page" data-generated="1">${corpo}</section>`;
  return doc;
};

test('[edição] só os parágrafos marcados ficam editáveis; com campo automático {{…}}, não', () => {
  const doc = pagina(`
    <div class="bi-par"><div class="bi-pt"><p data-pt-html="Prazo de 60 dias.">Prazo de 60 dias.</p></div><div class="bi-tr"><p>Plazo.</p></div></div>
    <div class="bi-par"><div class="bi-pt"><p data-pt-html="Cliente &#123;&#123;cliente.nome&#125;&#125;.">Cliente ACME.</p></div></div>
    <div class="bi-par"><div class="bi-pt"><p>Texto fixo da apresentação.</p></div></div>`);
  const mudou = jest.fn();
  expect(ativarEdicaoBilingue(doc, mudou)).toBe(1);
  const ps = doc.querySelectorAll('.bi-pt p');
  expect(ps[0].contentEditable).toBe('true');
  expect(ps[1].getAttribute('contenteditable')).toBeNull();
  expect(ps[1].title).toMatch(/campo automático/);
  expect(ps[2].getAttribute('contenteditable')).toBeNull();
  expect(doc.querySelector('.bi-tr p').getAttribute('contenteditable')).toBeNull();
  ps[0].innerHTML = 'Prazo de <strong>45</strong> dias.';
  ps[0].dispatchEvent(new Event('input'));
  expect(mudou).toHaveBeenCalled();
  expect(lerEdicoesBilingue(doc)).toEqual([{ tipo: 'p', original: 'Prazo de 60 dias.', novo: 'Prazo de <strong>45</strong> dias.' }]);
});

const clausulas = [
  { id: 7, titulo: '15. PRAZO DE ENTREGA', conteudo: '<p>O prazo é de <strong>60 (sessenta) dias úteis</strong>.</p><p>Contados do aceite.</p>' },
  { id: 9, titulo: '9. REUNIÕES', conteudo: '<p>Os documentos:</p><ul style="list-style:none;padding-left:0;"><li>✓ Excel;</li><li>✓ PDF;</li></ul>' },
];

test('[edição] troca exatamente o parágrafo e o item, na cláusula certa, mantendo o resto', () => {
  const r = aplicarEdicoesNasClausulas(clausulas, [
    { tipo: 'p', original: 'O prazo é de <strong>60 (sessenta) dias úteis</strong>.', novo: 'O prazo é de <strong>45 (quarenta e cinco) dias úteis</strong>.' },
    { tipo: 'li', original: '✓ PDF;', novo: '✓ PDF e DWG;' },
  ]);
  expect(r.naoAchadas).toEqual([]);
  expect(r.alteradas).toEqual([
    { id: 7, titulo: '15. PRAZO DE ENTREGA', conteudo: '<p>O prazo é de <strong>45 (quarenta e cinco) dias úteis</strong>.</p><p>Contados do aceite.</p>' },
    { id: 9, titulo: '9. REUNIÕES', conteudo: '<p>Os documentos:</p><ul style="list-style:none;padding-left:0;"><li>✓ Excel;</li><li>✓ PDF e DWG;</li></ul>' },
  ]);
});

test('[edição] duas edições na mesma cláusula se somam; texto apagado remove o parágrafo', () => {
  const r = aplicarEdicoesNasClausulas(clausulas, [
    { tipo: 'p', original: 'Contados do aceite.', novo: 'Contados do pedido.' },
    { tipo: 'p', original: 'O prazo é de <strong>60 (sessenta) dias úteis</strong>.', novo: ' <br>' },
  ]);
  expect(r.alteradas).toEqual([{ id: 7, titulo: '15. PRAZO DE ENTREGA', conteudo: '<p>Contados do pedido.</p>' }]);
});

test('[edição] trecho que não está em nenhuma cláusula volta como não achado (a tela avisa), nada é gravado', () => {
  const r = aplicarEdicoesNasClausulas(clausulas, [{ tipo: 'p', original: 'Texto que mudou noutra aba.', novo: 'X' }]);
  expect(r.alteradas).toEqual([]);
  expect(r.naoAchadas).toHaveLength(1);
});
