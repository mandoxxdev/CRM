import {
  lerClausulasDoSource,
  sincronizarCampoParaSource,
  moverClausulaNoSource,
  removerClausulaDoSource,
  adicionarClausulaAoSource,
  atualizarKeyNoSource,
  diffClausulas,
  htmlParaTexto,
  renumerarClausulas,
  ehClausulaNovaVazia,
} from './clausulasInlineEditor';

// Fixture equivalente ao HTML gerado por clausulasSection (propostaPremiumV2.js, Task 1):
// wrapper .five-intro-group contém a "primeira" cláusula; as demais são irmãs de #proposalSource.
function montarFixture(doc, chaves) {
  const root = doc.createElement('div');
  root.id = 'proposalSource';
  const wrapper = doc.createElement('section');
  wrapper.className = 'block stack-md avoid-break five-intro-group';
  const h2 = doc.createElement('h2');
  h2.textContent = '5. CONDIÇÕES GERAIS DE FORNECIMENTO';
  wrapper.appendChild(h2);
  root.appendChild(wrapper);

  function criarSecao(key, titulo, conteudoHtml) {
    const secao = doc.createElement('section');
    secao.className = 'block stack-md allow-break';
    secao.setAttribute('data-clausula-key', key);
    const h3 = doc.createElement('h3');
    h3.setAttribute('data-clausula-campo', 'titulo');
    h3.textContent = titulo;
    const div = doc.createElement('div');
    div.className = 'stack-sm';
    div.setAttribute('data-clausula-campo', 'conteudo');
    div.innerHTML = conteudoHtml;
    secao.appendChild(h3);
    secao.appendChild(div);
    return secao;
  }

  chaves.forEach(([key, titulo, conteudo], idx) => {
    const secao = criarSecao(key, titulo, conteudo);
    if (idx === 0) wrapper.appendChild(secao);
    else root.appendChild(secao);
  });

  doc.body.appendChild(root);
  return root;
}

beforeEach(() => {
  document.body.innerHTML = '';
});

test('lerClausulasDoSource lê as clausulas na ordem do documento, incluindo a que está no wrapper', () => {
  montarFixture(document, [
    ['1', '5.1 PRAZO', '<p>Texto 1.</p>'],
    ['2', '5.2 TRANSPORTE', '<p>Texto 2.</p>'],
  ]);
  const lista = lerClausulasDoSource(document);
  expect(lista).toEqual([
    { key: '1', titulo: '5.1 PRAZO', conteudo: '<p>Texto 1.</p>' },
    { key: '2', titulo: '5.2 TRANSPORTE', conteudo: '<p>Texto 2.</p>' },
  ]);
});

test('sincronizarCampoParaSource atualiza titulo (textContent) e conteudo (innerHTML)', () => {
  montarFixture(document, [['1', '5.1 PRAZO', '<p>Texto 1.</p>']]);
  expect(sincronizarCampoParaSource(document, '1', 'titulo', '5.1 NOVO TITULO')).toBe(true);
  expect(sincronizarCampoParaSource(document, '1', 'conteudo', '<p>Texto editado.</p>')).toBe(true);
  const lista = lerClausulasDoSource(document);
  expect(lista[0].titulo).toBe('5.1 NOVO TITULO');
  expect(lista[0].conteudo).toBe('<p>Texto editado.</p>');
});

test('sincronizarCampoParaSource retorna false para key inexistente', () => {
  montarFixture(document, [['1', '5.1 PRAZO', '<p>Texto 1.</p>']]);
  expect(sincronizarCampoParaSource(document, '999', 'titulo', 'X')).toBe(false);
});

test('moverClausulaNoSource troca a ordem, inclusive quando envolve a clausula do wrapper', () => {
  montarFixture(document, [
    ['1', '5.1 PRAZO', '<p>A</p>'],
    ['2', '5.2 TRANSPORTE', '<p>B</p>'],
    ['3', '5.3 GARANTIA', '<p>C</p>'],
  ]);
  expect(moverClausulaNoSource(document, '2', -1)).toBe(true); // 2 sobe, vira primeira (entra no wrapper)
  expect(lerClausulasDoSource(document).map((c) => c.key)).toEqual(['2', '1', '3']);
  const wrapper = document.querySelector('.five-intro-group');
  expect(wrapper.querySelector('[data-clausula-key]').getAttribute('data-clausula-key')).toBe('2');
});

test('moverClausulaNoSource não faz nada além dos limites da lista', () => {
  montarFixture(document, [
    ['1', '5.1 PRAZO', '<p>A</p>'],
    ['2', '5.2 TRANSPORTE', '<p>B</p>'],
  ]);
  expect(moverClausulaNoSource(document, '1', -1)).toBe(false);
  expect(moverClausulaNoSource(document, '2', 1)).toBe(false);
  expect(lerClausulasDoSource(document).map((c) => c.key)).toEqual(['1', '2']);
});

test('removerClausulaDoSource remove, inclusive a clausula que está no wrapper (a próxima assume o lugar)', () => {
  montarFixture(document, [
    ['1', '5.1 PRAZO', '<p>A</p>'],
    ['2', '5.2 TRANSPORTE', '<p>B</p>'],
  ]);
  expect(removerClausulaDoSource(document, '1')).toBe(true);
  const lista = lerClausulasDoSource(document);
  expect(lista.map((c) => c.key)).toEqual(['2']);
  const wrapper = document.querySelector('.five-intro-group');
  expect(wrapper.querySelector('[data-clausula-key]').getAttribute('data-clausula-key')).toBe('2');
});

test('removerClausulaDoSource retorna false para key inexistente', () => {
  montarFixture(document, [['1', '5.1 PRAZO', '<p>A</p>']]);
  expect(removerClausulaDoSource(document, '999')).toBe(false);
});

test('adicionarClausulaAoSource insere depois da key indicada, com key temp-*', () => {
  montarFixture(document, [
    ['1', '5.1 PRAZO', '<p>A</p>'],
    ['2', '5.2 TRANSPORTE', '<p>B</p>'],
  ]);
  const novaKey = adicionarClausulaAoSource(document, '1');
  expect(novaKey).toMatch(/^temp-\d+$/);
  const chaves = lerClausulasDoSource(document).map((c) => c.key);
  expect(chaves).toEqual(['1', novaKey, '2']);
});

test('adicionarClausulaAoSource cria corpo vazio (sem <p></p>) para o placeholder CSS funcionar, e isso lê/converte para texto vazio', () => {
  montarFixture(document, [
    ['1', '5.1 PRAZO', '<p>A</p>'],
  ]);
  const novaKey = adicionarClausulaAoSource(document, '1');
  const nova = lerClausulasDoSource(document).find((c) => c.key === novaKey);
  expect(nova.conteudo).toBe('');
  expect(htmlParaTexto(nova.conteudo)).toBe('');
});

test('adicionarClausulaAoSource sem apósKey adiciona no fim', () => {
  montarFixture(document, [['1', '5.1 PRAZO', '<p>A</p>']]);
  const novaKey = adicionarClausulaAoSource(document, null);
  expect(lerClausulasDoSource(document).map((c) => c.key)).toEqual(['1', novaKey]);
});

test('moverClausulaNoSource retorna false sem throwing quando #proposalSource está ausente', () => {
  // Não monta fixture, deixando document.body vazio (sem #proposalSource)
  expect(moverClausulaNoSource(document, '1', -1)).toBe(false);
});

test('adicionarClausulaAoSource retorna null sem throwing quando #proposalSource está ausente', () => {
  // Não monta fixture, deixando document.body vazio (sem #proposalSource)
  expect(adicionarClausulaAoSource(document, null)).toBe(null);
});

test('htmlParaTexto converte paragrafos em texto separado por linha em branco', () => {
  expect(htmlParaTexto('<p>Primeiro.</p><p>Segundo.</p>')).toBe('Primeiro.\n\nSegundo.');
  expect(htmlParaTexto('')).toBe('');
});

test('diffClausulas identifica novas, alteradas, removidas e mudanca de ordem', () => {
  const snapshot = [
    { id: 1, titulo: '5.1 PRAZO', conteudo: 'A' },
    { id: 2, titulo: '5.2 TRANSPORTE', conteudo: 'B' },
  ];
  const listaAtual = [
    { key: '2', titulo: '5.2 TRANSPORTE', conteudo: 'B alterado' },
    { key: '1', titulo: '5.1 PRAZO', conteudo: 'A' },
    { key: 'temp-123', titulo: '5.3 NOVA', conteudo: 'C' },
  ];
  const diff = diffClausulas(snapshot, listaAtual);
  expect(diff.novas).toEqual([{ key: 'temp-123', titulo: '5.3 NOVA', conteudo: 'C' }]);
  expect(diff.alteradas).toEqual([{ key: '2', titulo: '5.2 TRANSPORTE', conteudo: 'B alterado' }]);
  expect(diff.removidas).toEqual([]);
  expect(diff.ordemMudou).toBe(true);
});

test('diffClausulas NAO marca como alterada quando o conteudo original (HTML cru) equivale ao texto atual (ja convertido)', () => {
  const snapshot = [
    { id: 1, titulo: '5.4 GARANTIA', conteudo: '<p>Texto A.</p><p>Texto B.</p>' },
  ];
  const listaAtual = [
    { key: '1', titulo: '5.4 GARANTIA', conteudo: 'Texto A.\n\nTexto B.' },
  ];
  const diff = diffClausulas(snapshot, listaAtual);
  expect(diff.alteradas).toEqual([]);
});

test('atualizarKeyNoSource troca data-clausula-key da secao e retorna false para key inexistente', () => {
  montarFixture(document, [
    ['1', '5.1 PRAZO', '<p>A</p>'],
    ['temp-123', '5.2 NOVA', '<p>B</p>'],
  ]);
  expect(atualizarKeyNoSource(document, 'temp-123', '42')).toBe(true);
  expect(lerClausulasDoSource(document).map((c) => c.key)).toEqual(['1', '42']);
  expect(atualizarKeyNoSource(document, 'temp-999', '43')).toBe(false);
});

test('diffClausulas detecta remocao quando uma key do snapshot nao esta mais na lista atual', () => {
  const snapshot = [
    { id: 1, titulo: '5.1 PRAZO', conteudo: 'A' },
    { id: 2, titulo: '5.2 TRANSPORTE', conteudo: 'B' },
  ];
  const listaAtual = [{ key: '1', titulo: '5.1 PRAZO', conteudo: 'A' }];
  const diff = diffClausulas(snapshot, listaAtual);
  expect(diff.removidas).toEqual([{ id: 2, titulo: '5.2 TRANSPORTE', conteudo: 'B' }]);
  expect(diff.ordemMudou).toBe(false);
});

test('renumerarClausulas renumera a lista ["5.4 GARANTIA", "5.9 FORO"] para ["5.1 GARANTIA", "5.2 FORO"]', () => {
  montarFixture(document, [
    ['1', '5.4 GARANTIA', '<p>Conteúdo 1</p>'],
    ['2', '5.9 FORO', '<p>Conteúdo 2</p>'],
  ]);
  const resultado = renumerarClausulas(document);
  expect(resultado).toBe(true);
  const lista = lerClausulasDoSource(document);
  expect(lista[0].titulo).toBe('5.1 GARANTIA');
  expect(lista[1].titulo).toBe('5.2 FORO');
});

test('renumerarClausulas renumera uma cláusula sem prefixo numérico ("Nova Cláusula") na posição 2 para "5.3 Nova Cláusula"', () => {
  montarFixture(document, [
    ['1', '5.1 PRAZO', '<p>A</p>'],
    ['2', '5.2 TRANSPORTE', '<p>B</p>'],
    ['3', 'Nova Cláusula', '<p>C</p>'],
  ]);
  const resultado = renumerarClausulas(document);
  expect(resultado).toBe(true);
  const lista = lerClausulasDoSource(document);
  expect(lista[2].titulo).toBe('5.3 Nova Cláusula');
});

test('renumerarClausulas preserva o texto após o número', () => {
  montarFixture(document, [
    ['1', '5.4 GARANTIA E RESPONSABILIDADE', '<p>X</p>'],
    ['2', '5.9 FORO E JURISDIÇÃO', '<p>Y</p>'],
  ]);
  renumerarClausulas(document);
  const lista = lerClausulasDoSource(document);
  expect(lista[0].titulo).toBe('5.1 GARANTIA E RESPONSABILIDADE');
  expect(lista[1].titulo).toBe('5.2 FORO E JURISDIÇÃO');
});

test('renumerarClausulas retorna false sem throwing quando #proposalSource está ausente', () => {
  // Não monta fixture, deixando document.body vazio (sem #proposalSource)
  expect(renumerarClausulas(document)).toBe(false);
});

describe('ehClausulaNovaVazia (remoção implícita da cláusula nova vazia)', () => {
  test('descarta cláusula nova (temp-*) com título placeholder renumerado e corpo vazio', () => {
    expect(ehClausulaNovaVazia({ key: 'temp-123', titulo: '5.4 Nova Cláusula', conteudo: '' })).toBe(true);
  });

  test('descarta cláusula nova (temp-*) com placeholder sem prefixo e corpo vazio', () => {
    expect(ehClausulaNovaVazia({ key: 'temp-123', titulo: 'Nova Cláusula', conteudo: '' })).toBe(true);
  });

  test('descarta cláusula nova (temp-*) com título e corpo totalmente vazios', () => {
    expect(ehClausulaNovaVazia({ key: 'temp-123', titulo: '', conteudo: '' })).toBe(true);
  });

  test('MANTÉM cláusula nova cujo usuário só preencheu o título', () => {
    expect(ehClausulaNovaVazia({ key: 'temp-123', titulo: '5.4 MULTA POR ATRASO', conteudo: '' })).toBe(false);
  });

  test('MANTÉM cláusula nova cujo usuário só preencheu o corpo (título ainda placeholder)', () => {
    expect(ehClausulaNovaVazia({ key: 'temp-123', titulo: '5.4 Nova Cláusula', conteudo: 'algum texto' })).toBe(false);
  });

  test('NÃO descarta cláusula persistida (key numérica) mesmo com título placeholder e corpo vazio', () => {
    // Guarda contra apagar por engano uma cláusula real cujo título foi limpo.
    expect(ehClausulaNovaVazia({ key: '42', titulo: 'Nova Cláusula', conteudo: '' })).toBe(false);
    expect(ehClausulaNovaVazia({ key: 'default-5.4', titulo: '', conteudo: '' })).toBe(false);
  });
});
