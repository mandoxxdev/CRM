/**
 * Variável apagada do cadastro não pode sair na proposta.
 * Executar: node server/tests/propostaNaoImprimeVariavelApagada.test.js
 *
 * A ordem das variáveis por família (variaveis_proposta_por_familia) guarda
 * CHAVES e não é limpa quando a variável é apagada nem quando sai da família.
 * O template imprimia a chave crua no lugar do nome, na frente do cliente:
 *
 *     material_de_fabricao_do_disco: Aço Inox 304
 *     acabamento_do_disco: Escovado
 *
 * Regra agora:
 *   - meta com ativo = 0  -> variável apagada, NÃO sai
 *   - sem meta e consulta de rótulos OK -> chave órfã, NÃO sai
 *   - sem meta e consulta FALHOU -> mantém o comportamento antigo, porque perder
 *     a ficha técnica inteira por causa de um erro de banco é pior que o nome feio
 *   - meta sem o campo ativo (config antiga) -> sai normalmente
 */

const { gerarHTMLPropostaPremiumV2 } = require('../templates/propostaPremiumV2');

let falhas = 0;
const checar = (cond, msg) => { if (cond) console.log('  ✓ ' + msg); else { console.log('  ✗ ' + msg); falhas++; } };

const FAMILIA = 'DISCO DISPERSOR';

function render({ chaves, labels, specs, labelsOk, cadastroFamilia }) {
  const config = {
    variaveis_proposta_por_familia: { [FAMILIA]: chaves },
    variaveis_proposta_labels: labels
  };
  if (labelsOk !== undefined) config.variaveis_proposta_labels_ok = labelsOk;
  if (cadastroFamilia !== undefined) config.variaveis_da_familia = cadastroFamilia;

  return gerarHTMLPropostaPremiumV2(
    { numero_proposta: '01/R00', titulo: 'T', razao_social: 'X', cnpj: '1', cliente_email: 'a@b.c' },
    [{
      produto_nome: 'Disco Dispersor', descricao: 'Disco', quantidade: 1, unidade: 'UN',
      valor_unitario: 1000, valor_total: 1000,
      familia_produto: FAMILIA,
      especificacoes_tecnicas: JSON.stringify(specs)
    }],
    { total: 1000, dataEmissao: '06/08/2026' },
    config,
    null, false, true
  );
}

console.log('\n═══ Variável apagada não sai na proposta ═══\n');

/* ── o caso relatado ────────────────────────────────────────────────── */
console.log('Caso do print: duas variáveis apagadas junto com duas ativas');
{
  const html = render({
    chaves: ['furacao', 'tratamento_trmico', 'material_de_fabricao_do_disco', 'acabamento_do_disco'],
    labels: {
      furacao: { nome: 'FURAÇÃO', ativo: 1 },
      tratamento_trmico: { nome: 'TRATAMENTO TÉRMICO', ativo: 1 },
      material_de_fabricao_do_disco: { nome: 'MATERIAL DE FABRICAÇÃO', ativo: 0 },
      acabamento_do_disco: { nome: 'ACABAMENTO DO DISCO', ativo: 0 }
    },
    specs: {
      furacao: '15mm Central',
      tratamento_trmico: 'Não Aplicado',
      material_de_fabricao_do_disco: 'Aço Inox 304',
      acabamento_do_disco: 'Escovado'
    },
    labelsOk: true
  });

  checar(!html.includes('material_de_fabricao_do_disco'), 'a chave crua não aparece no documento');
  checar(!html.includes('acabamento_do_disco'), 'a segunda chave crua também não aparece');
  checar(!html.includes('Aço Inox 304'), 'o valor da variável apagada não vaza');
  checar(!html.includes('Escovado'), 'o valor da segunda apagada não vaza');
  checar(html.includes('15mm Central'), 'a variável ativa continua saindo');
  checar(html.includes('Não Aplicado'), 'a segunda ativa continua saindo');
  checar(html.includes('Furação'), 'o rótulo da ativa sai em caixa de frase, como antes');
}

/* ── chave órfã (variável não existe mais na tabela) ────────────────── */
console.log('\nChave órfã: não está no cadastro de jeito nenhum');
{
  const html = render({
    chaves: ['furacao', 'variavel_que_sumiu'],
    labels: { furacao: { nome: 'FURAÇÃO', ativo: 1 } },
    specs: { furacao: '15mm Central', variavel_que_sumiu: 'valor fantasma' },
    labelsOk: true
  });
  checar(!html.includes('variavel_que_sumiu'), 'chave órfã não é impressa');
  checar(!html.includes('valor fantasma'), 'o valor da órfã não vaza');
  checar(html.includes('15mm Central'), 'a ativa segue intacta');
}

/* ── proteção: falha na consulta de rótulos ─────────────────────────── */
console.log('\nConsulta de rótulos falhou (sem a flag): não pode emudecer a proposta');
{
  const html = render({
    chaves: ['furacao', 'tratamento_trmico'],
    labels: {},                       // nada veio do banco
    specs: { furacao: '15mm Central', tratamento_trmico: 'Não Aplicado' },
    labelsOk: undefined               // consulta não confirmou
  });
  checar(html.includes('15mm Central'), 'os valores continuam saindo em vez de sumir tudo');
  checar(html.includes('Não Aplicado'), 'o segundo valor também');
}

/* ── compatibilidade com configuração antiga ────────────────────────── */
console.log('\nConfiguração antiga: rótulos gravados sem o campo ativo');
{
  const html = render({
    chaves: ['furacao'],
    labels: { furacao: { nome: 'FURAÇÃO' } },   // sem ativo
    specs: { furacao: '15mm Central' },
    labelsOk: true
  });
  checar(html.includes('15mm Central'), 'rótulo sem o campo ativo continua saindo');
  checar(html.includes('Furação'), 'e com o nome correto, não com a chave');
}

/* ── todas apagadas ─────────────────────────────────────────────────── */
console.log('\nTodas as variáveis da família apagadas');
{
  const html = render({
    chaves: ['material_de_fabricao_do_disco', 'acabamento_do_disco'],
    labels: {
      material_de_fabricao_do_disco: { nome: 'MATERIAL', ativo: 0 },
      acabamento_do_disco: { nome: 'ACABAMENTO', ativo: 0 }
    },
    specs: { material_de_fabricao_do_disco: 'Aço Inox 304', acabamento_do_disco: 'Escovado' },
    labelsOk: true
  });
  checar(!html.includes('material_de_fabricao_do_disco'), 'nenhuma chave crua sobra');
  checar(!html.includes('Aço Inox 304'), 'nenhum valor sobra');
  checar(html.includes('Disco Dispersor'), 'o item em si continua na proposta');
}

/* ── proposta respeita o cadastro da família ─────────────────────────── */
console.log('\nA proposta segue o cadastro atual da família');
{
  // Família esvaziada: o produto diz "nenhuma variável definida", a proposta
  // tem que dizer o mesmo. Era exatamente a divergência relatada.
  const html = render({
    chaves: ['furacao', 'tratamento_trmico'],
    labels: {
      furacao: { nome: 'FURAÇÃO', ativo: 1 },
      tratamento_trmico: { nome: 'TRATAMENTO TÉRMICO', ativo: 1 }
    },
    specs: { furacao: '15mm Central', tratamento_trmico: 'Não Aplicado' },
    labelsOk: true,
    cadastroFamilia: { [FAMILIA]: [] }
  });
  checar(!html.includes('15mm Central'), 'família sem variáveis não imprime nada, mesmo com a ordem preenchida');
  checar(!html.includes('Não Aplicado'), 'nenhum valor sobra');
  checar(html.includes('Disco Dispersor'), 'o item continua na proposta');
}
{
  // Removeu só uma da família: a outra continua.
  const html = render({
    chaves: ['furacao', 'tratamento_trmico'],
    labels: {
      furacao: { nome: 'FURAÇÃO', ativo: 1 },
      tratamento_trmico: { nome: 'TRATAMENTO TÉRMICO', ativo: 1 }
    },
    specs: { furacao: '15mm Central', tratamento_trmico: 'Não Aplicado' },
    labelsOk: true,
    cadastroFamilia: { [FAMILIA]: ['furacao'] }
  });
  checar(html.includes('15mm Central'), 'a que segue na família continua saindo');
  checar(!html.includes('Não Aplicado'), 'a que saiu da família para de sair');
}
{
  // Família do item não bate com nenhuma cadastrada: não dá para filtrar.
  const html = render({
    chaves: ['furacao'],
    labels: { furacao: { nome: 'FURAÇÃO', ativo: 1 } },
    specs: { furacao: '15mm Central' },
    labelsOk: true,
    cadastroFamilia: { 'OUTRA FAMILIA QUALQUER': ['xyz'] }
  });
  checar(html.includes('15mm Central'), 'família desconhecida não é filtrada, imprime como antes');
}
{
  // Consulta do cadastro falhou: sem o mapa, comportamento antigo.
  const html = render({
    chaves: ['furacao'],
    labels: { furacao: { nome: 'FURAÇÃO', ativo: 1 } },
    specs: { furacao: '15mm Central' },
    labelsOk: true,
    cadastroFamilia: undefined
  });
  checar(html.includes('15mm Central'), 'sem o mapa de famílias a proposta não fica vazia');
}

/* ── o editor precisa apontar a tela certa ───────────────────────────── */
console.log('\nDiagnóstico do editor aponta a causa certa');

function renderEditor(opts) {
  const config = {
    variaveis_proposta_por_familia: { [FAMILIA]: opts.chaves },
    variaveis_proposta_labels: opts.labels,
    variaveis_proposta_labels_ok: true
  };
  if (opts.cadastroFamilia !== undefined) config.variaveis_da_familia = opts.cadastroFamilia;
  // omitPrintBar = false -> preview do editor, onde a dica aparece
  return gerarHTMLPropostaPremiumV2(
    { numero_proposta: '01/R00', titulo: 'T', razao_social: 'X', cnpj: '1', cliente_email: 'a@b.c' },
    [{
      produto_nome: 'Disco', descricao: 'Disco', quantidade: 1, unidade: 'UN',
      valor_unitario: 1000, valor_total: 1000, familia_produto: FAMILIA,
      especificacoes_tecnicas: JSON.stringify(opts.specs)
    }],
    { total: 1000, dataEmissao: '06/08/2026' },
    config, null, false, false
  );
}

{
  // Família esvaziada, mas o template ainda tem variáveis escolhidas.
  const html = renderEditor({
    chaves: ['furacao'],
    labels: { furacao: { nome: 'FURAÇÃO', ativo: 1 } },
    specs: { furacao: '15mm Central' },
    cadastroFamilia: { [FAMILIA]: [] }
  });
  checar(html.includes('Variáveis desta família'), 'manda para Configurações → Famílias, que é onde está a causa');
  checar(!html.includes('Variáveis por equipamento'), 'não manda para a tela do template, que não resolveria');
}
{
  // Template sem nenhuma variável escolhida: a mensagem antiga continua certa.
  const html = renderEditor({
    chaves: [],
    labels: {},
    specs: {},
    cadastroFamilia: { [FAMILIA]: ['furacao'] }
  });
  checar(html.includes('Variáveis por equipamento'), 'aqui sim a causa é o template, e a mensagem antiga se mantém');
}
{
  // Os dois lados preenchidos, mas com chaves diferentes: a mensagem tem que
  // mostrar o que há de cada lado, senão não dá para descobrir o que corrigir.
  const html = renderEditor({
    chaves: ['acabamento_do_disco'],
    labels: {
      acabamento_do_disco: { nome: 'ACABAMENTO DO DISCO', ativo: 1 },
      acabamento: { nome: 'ACABAMENTO', ativo: 1 }
    },
    specs: { acabamento_do_disco: 'Escovado' },
    cadastroFamilia: { [FAMILIA]: ['acabamento'] }
  });
  checar(html.includes('Acabamento do disco'), 'diz qual variável está no template');
  checar(html.includes('Acabamento<') || html.includes('Acabamento)'), 'e qual está no cadastro da família');
  checar(html.includes('salvar a configuração'), 'lembra de salvar o template, causa comum do descasamento');
}

/* ── família duplicada só por caixa ──────────────────────────────────── */
console.log('\nFamília duplicada no banco (difere só na caixa)');
{
  // "DISCO DISPERSOR" e "Disco Dispersor" são cadastros distintos. Pegar só o
  // primeiro podia cair na duplicata vazia e apagar a ficha técnica inteira.
  const html = render({
    chaves: ['furacao'],
    labels: { furacao: { nome: 'FURAÇÃO', ativo: 1 } },
    specs: { furacao: '15mm Central' },
    labelsOk: true,
    cadastroFamilia: {
      'Disco Dispersor': [],                 // duplicata vazia, vem antes
      'DISCO DISPERSOR': ['furacao']         // a que realmente tem a variável
    }
  });
  checar(html.includes('15mm Central'), 'une as duplicatas em vez de parar na primeira');
}
{
  // Se TODAS as duplicatas estiverem vazias, aí sim não imprime.
  const html = render({
    chaves: ['furacao'],
    labels: { furacao: { nome: 'FURAÇÃO', ativo: 1 } },
    specs: { furacao: '15mm Central' },
    labelsOk: true,
    cadastroFamilia: { 'Disco Dispersor': [], 'DISCO DISPERSOR': [] }
  });
  checar(!html.includes('15mm Central'), 'todas vazias continua não imprimindo');
}

console.log(falhas === 0 ? '\n0 failed' : `\n${falhas} failed`);
process.exit(falhas === 0 ? 0 : 1);
