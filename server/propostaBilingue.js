/**
 * Proposta bilíngue (PT-BR + inglês ou espanhol) — o que o template precisa, sem DOM e sem banco.
 *
 * Spec: specs/proposta-bilingue/README.md (RN-BI.01 a RN-BI.10).
 *
 * - DICIONARIO: os textos FIXOS do documento (capa, títulos, cabeçalhos de tabela, assinatura). Ficam no código porque o PDF é
 *   gerado no servidor, sem o tradutor do Chrome, e esses textos não podem depender de alguém ter aberto o preview (RN-BI.04).
 * - O que vem de DADO (cláusulas, itens, variáveis) sai da memória de tradução (`traducoes`, chave = texto PT normalizado). Sem
 *   tradução, a metade traduzida mostra o PT marcado como pendente (`data-traduzir`) — o preview no Chrome preenche (RN-BI.05).
 * - O par PT | tradução é UM elemento (`.bi-par`) por parágrafo ou item de lista: o paginador divide entre pares, nunca dentro de
 *   um (RN-BI.03).
 */

const IDIOMAS = ['en', 'es'];
const LOCALE = { 'pt-BR': 'pt-BR', en: 'en-US', es: 'es-ES' };
const MOEDAS = ['BRL', 'USD', 'EUR'];

/** 'en' | 'es' | 'pt-BR' — qualquer outra coisa (vazio, null, 'pt', lixo) é o documento de sempre (RN-BI.01). */
function idiomaDaProposta(valor) {
  const v = String(valor || '').trim().toLowerCase();
  return IDIOMAS.includes(v) ? v : 'pt-BR';
}
const ehBilingue = (idioma) => IDIOMAS.includes(idioma);

function moedaDaProposta(valor) {
  const v = String(valor || '').trim().toUpperCase();
  return MOEDAS.includes(v) ? v : 'BRL';
}

/**
 * Validação do POST/PUT da proposta: a mensagem literal do erro, ou null. Vazio/null/ausente é aceito (= padrão). Sem isto, uma moeda
 * 'US$' gravada fazia o toLocaleString lançar RangeError e o preview/PDF daquela proposta respondia 500 (Fase 2, I6).
 */
function erroIdiomaMoeda(corpo) {
  const b = corpo || {};
  const vazio = (v) => v === undefined || v === null || v === '';
  if (!vazio(b.idioma) && !['pt-BR', ...IDIOMAS].includes(b.idioma)) return 'Idioma inválido. Use pt-BR, en ou es.';
  if (!vazio(b.moeda) && !MOEDAS.includes(b.moeda)) return 'Moeda inválida. Use BRL, USD ou EUR.';
  return null;
}

/** Valor na moeda da proposta, no formato da língua da coluna (RN-BI.08). BRL em pt-BR = exatamente o moedaBRL de antes. */
function formatarMoeda(valor, moeda, idioma) {
  return (Number(valor) || 0).toLocaleString(LOCALE[idioma] || 'pt-BR', { style: 'currency', currency: moedaDaProposta(moeda) });
}

/** A chave da memória de tradução: o texto PT sem espaço nas pontas e com espaços em sequência reduzidos a um. */
function normalizarChave(texto) {
  return String(texto == null ? '' : texto).replace(/\s+/g, ' ').trim();
}

const ENTIDADES = { '&amp;': '&', '&lt;': '<', '&gt;': '>', '&quot;': '"', '&#39;': "'", '&nbsp;': ' ' };
/** Texto puro de um trecho de HTML simples (o das cláusulas): tira as tags, desfaz as entidades básicas, normaliza. */
function textoDeHtml(html) {
  // Fim de bloco e <br> viram espaço: "<p>Primeiro.</p><p>Segundo.</p>" não pode virar a chave "Primeiro.Segundo." (Fase 5, 3).
  const semTags = String(html || '').replace(/<br\s*\/?>|<\/(p|div|li|h[1-6]|ul|ol)>/gi, ' ').replace(/<[^>]+>/g, '');
  return normalizarChave(semTags.replace(/&(amp|lt|gt|quot|#39|nbsp);/g, (m) => ENTIDADES[m] || m));
}

// Parágrafo mais longo que isto é dividido em frases, cada grupo um par. Um par é indivisível na paginação (RN-BI.03); um par maior
// que a página ficava inteiro e o overflow da página CORTAVA o texto no PDF (Fase 5, 6) — ex.: descritivo técnico sem linha em branco.
const LIMITE_PARAGRAFO = 1200;
function dividirEmFrases(texto) {
  const frases = String(texto).match(/[^.!?;]+[.!?;]+(?:\s+|$)|[^.!?;]+$/g) || [String(texto)];
  const grupos = [];
  let atual = '';
  frases.forEach((f) => {
    if (atual && (atual.length + f.length) > LIMITE_PARAGRAFO) { grupos.push(atual.trim()); atual = ''; }
    atual += f;
  });
  if (atual.trim()) grupos.push(atual.trim());
  return grupos;
}
/** Bloco de parágrafo; o de texto puro (sem tag) e longo vira vários. Vazio some (Fase 5, 2: <p><br></p> virava pendente eterno). */
function blocosDeParagrafo(html, texto) {
  if (!texto) return [];
  if (texto.length <= LIMITE_PARAGRAFO || /<[a-z]/i.test(html)) return [{ tipo: 'p', html, texto }];
  return dividirEmFrases(texto).map((g) => ({ tipo: 'p', html: escHtml(g), texto: normalizarChave(g) }));
}

/**
 * Quebra o conteúdo de uma cláusula em blocos de primeiro nível: `{ tipo: 'p', html }` ou `{ tipo: 'ul'|'ol', abre, itens: [html] }`.
 * Conteúdo sem nenhuma tag é texto gravado pelo editor (parágrafos separados por linha em branco) — mesma regra do
 * `conteudoClausulaHtml` do template. Tag de bloco desconhecida vira parágrafo com o HTML inteiro (nada se perde).
 */
function segmentarHtml(conteudo) {
  const bruto = String(conteudo || '');
  if (!/<[a-z][\s\S]*>/i.test(bruto)) {
    return bruto.split(/\n{2,}/).map((p) => p.trim()).filter(Boolean)
      .flatMap((p) => blocosDeParagrafo(escHtml(p), normalizarChave(p)));
  }
  const blocos = [];
  const re = /<(ul|ol)(\s[^>]*)?>([\s\S]*?)<\/\1>|<(p|div|h[1-6])(\s[^>]*)?>([\s\S]*?)<\/\4>/gi;
  let m; let fim = 0;
  const soltos = (trecho) => {
    blocos.push(...blocosDeParagrafo(trecho.trim(), textoDeHtml(trecho)));
  };
  while ((m = re.exec(bruto)) !== null) {
    soltos(bruto.slice(fim, m.index));
    if (m[1]) {
      const itens = [];
      const reLi = /<li(\s[^>]*)?>([\s\S]*?)<\/li>/gi;
      let li;
      while ((li = reLi.exec(m[3])) !== null) if (textoDeHtml(li[2])) itens.push(li[2]);
      if (itens.length) blocos.push({ tipo: m[1].toLowerCase(), abre: `<${m[1]}${m[2] || ''}>`, itens });
    } else if (m[4].toLowerCase() === 'div' && /<(p|div|ul|ol|h[1-6])[\s>]/i.test(m[6])) {
      // div com blocos dentro: o casamento preguiçoso engolia os parágrafos internos numa chave só (Fase 5, 3).
      blocos.push(...segmentarHtml(m[6]));
    } else {
      blocos.push(...blocosDeParagrafo(m[6], textoDeHtml(m[6])));
    }
    fim = re.lastIndex;
  }
  soltos(bruto.slice(fim));
  return blocos;
}

function escHtml(s) {
  return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

/** Tradução da memória, ou null. `traducoes` = { [texto PT normalizado]: texto traduzido }. */
function traduzido(textoPt, traducoes) {
  const chave = normalizarChave(textoPt);
  if (!chave || !traducoes) return null;
  const t = traducoes[chave];
  return (t && String(t).trim()) ? String(t) : null;
}

/**
 * Atributos do elemento traduzível (p, li, célula): sempre `data-tr-origem` (o PT — é a chave da correção manual, RN-BI.06);
 * pendente também ganha `data-traduzir` e a classe `bi-pendente`.
 */
// Atributo imune à troca de marcadores: as chaves { } vão como entidade. O template troca os {{…}} no HTML INTEIRO depois de montado;
// o navegador devolve "{{…}}" no getAttribute e a troca não enxerga a entidade.
const attrCru = (s) => escHtml(s).replace(/\{/g, '&#123;').replace(/\}/g, '&#125;');

/**
 * `tr` = a tradução da memória (string) ou nada (pendente). Sempre `data-tr-origem` (a chave: o PT COM os marcadores, Fase 2, I5);
 * traduzido também leva `data-tr-texto` — a tradução ANTES da troca dos marcadores. É dela que o painel parte para corrigir: o texto
 * visível já tem o nome do cliente no lugar do {{…}}, e corrigir a partir dele gravava "ACME SA" na memória global, que sairia na
 * proposta de outro cliente (Fase 5, crítico 1). Pendente ganha `data-traduzir` e a classe `bi-pendente`.
 */
function attrsTraducao(textoPt, tr, classeExtra = '') {
  const tem = typeof tr === 'string' ? Boolean(tr.trim()) : Boolean(tr);
  const chave = attrCru(normalizarChave(textoPt));
  const classes = [classeExtra, tem ? '' : 'bi-pendente'].filter(Boolean).join(' ');
  const cru = (tem && typeof tr === 'string') ? ` data-tr-texto="${attrCru(tr)}"` : '';
  return `${classes ? ` class="${classes}"` : ''} data-tr-origem="${chave}"${cru}${tem ? '' : ` data-traduzir="${chave}"`}`;
}

/** Um texto PT → elemento traduzido (tag dada), da memória ou pendente. */
function elementoTraduzido(tag, textoPt, traducoes, classeExtra = '') {
  const t = traduzido(textoPt, traducoes);
  return `<${tag}${attrsTraducao(textoPt, t, classeExtra)}>${escHtml(t || normalizarChave(textoPt))}</${tag}>`;
}

/** Os marcadores {{…}} de um texto, em ordem alfabética — a tradução tem de ter exatamente os mesmos que o PT. */
function marcadoresDe(texto) {
  return (String(texto || '').match(/\{\{[\s\S]*?\}\}/g) || []).map((m) => m.replace(/\s+/g, '')).sort();
}

/**
 * O conteúdo de uma cláusula (ou qualquer HTML simples) em pares PT | tradução (RN-BI.02/03).
 * A metade PT guarda o HTML original (negrito, listas); a traduzida é texto, um elemento por parágrafo/item.
 */
function paresDeConteudo(conteudo, idioma, traducoes) {
  return segmentarHtml(conteudo).map((b) => {
    if (b.tipo === 'p') {
      return `<div class="bi-par"><div class="bi-pt"><p>${b.html}</p></div><div class="bi-tr" lang="${idioma}">${elementoTraduzido('p', b.texto, traducoes)}</div></div>`;
    }
    // Lista: um par por item — um item longo nunca fica numa página e a tradução dele na outra.
    const fecha = `</${b.tipo}>`;
    return b.itens.map((li) => `<div class="bi-par bi-par-li"><div class="bi-pt">${b.abre}<li>${li}</li>${fecha}</div>`
      + `<div class="bi-tr" lang="${idioma}">${b.abre}${elementoTraduzido('li', textoDeHtml(li), traducoes)}${fecha}</div></div>`).join('');
  }).join('');
}

/** Todos os textos PT traduzíveis de um conteúdo — para o preview pedir a memória de uma vez. */
function textosDeConteudo(conteudo) {
  const out = [];
  segmentarHtml(conteudo).forEach((b) => {
    if (b.tipo === 'p') { if (b.texto) out.push(b.texto); } else b.itens.forEach((li) => { const t = textoDeHtml(li); if (t) out.push(t); });
  });
  return out;
}

// ── Textos fixos do documento ────────────────────────────────────────────────────────────────────
// A chave é o PT exatamente como o template o escreve. Termos de contrato: CONTRATANTE = "Contracting Party"/"Contratante",
// CONTRATADA = "Contractor"/"Contratista" (o tradutor automático trocava os dois — spike de 24/11/2026).
const DICIONARIO = {
  'PROPOSTA PARA FORNECIMENTO DE EQUIPAMENTOS INDUSTRIAIS': { en: 'PROPOSAL FOR THE SUPPLY OF INDUSTRIAL EQUIPMENT', es: 'PROPUESTA PARA EL SUMINISTRO DE EQUIPOS INDUSTRIALES' },
  'PROPOSTA PARA FORNECIMENTO DE PEÇAS E ACESSÓRIOS': { en: 'PROPOSAL FOR THE SUPPLY OF PARTS AND ACCESSORIES', es: 'PROPUESTA PARA EL SUMINISTRO DE PIEZAS Y ACCESORIOS' },
  'PROPOSTA PARA FORNECIMENTO DE SERVIÇOS ESPECIALIZADOS': { en: 'PROPOSAL FOR THE SUPPLY OF SPECIALIZED SERVICES', es: 'PROPUESTA PARA LA PRESTACIÓN DE SERVICIOS ESPECIALIZADOS' },
  'PROPOSTA TÉCNICA COMERCIAL': { en: 'TECHNICAL AND COMMERCIAL PROPOSAL', es: 'PROPUESTA TÉCNICA Y COMERCIAL' },
  'EMPRESA CONTRATANTE:': { en: 'CONTRACTING COMPANY:', es: 'EMPRESA CONTRATANTE:' },
  'CNPJ:': { en: 'Tax ID (CNPJ):', es: 'CNPJ:' },
  'Contato:': { en: 'Contact:', es: 'Contacto:' },
  'Email:': { en: 'Email:', es: 'Correo electrónico:' },
  'Telefone:': { en: 'Phone:', es: 'Teléfono:' },
  'Data de Emissão:': { en: 'Issue date:', es: 'Fecha de emisión:' },
  'SUMÁRIO': { en: 'TABLE OF CONTENTS', es: 'ÍNDICE' },
  'Tabela com Dados Cadastrais da CONTRATADA': { en: 'CONTRACTOR registration data', es: 'Datos de registro del CONTRATISTA' },
  'Especialista em Misturas, Moagens, Dispersões, Dosagens, Automações, Excelência Operacional, Projetos Conceituais, Projetos Executivos, Instalações e Sistemas Turn-Keys.': {
    en: 'Specialist in Mixing, Milling, Dispersion, Dosing, Automation, Operational Excellence, Conceptual Projects, Detailed Projects, Installations and Turn-Key Systems.',
    es: 'Especialista en Mezcla, Molienda, Dispersión, Dosificación, Automatización, Excelencia Operacional, Proyectos Conceptuales, Proyectos Ejecutivos, Instalaciones y Sistemas Llave en Mano.' },
  'APRESENTAÇÃO': { en: 'ABOUT US', es: 'PRESENTACIÓN' },
  'A MOINHO YPIRANGA é uma empresa especializada no desenvolvimento de projetos e instalações industriais. Somos uma das maiores empresas com foco e participação no desenvolvimento, fabricação e comercialização de equipamentos para produção de produtos químicos do MERCOSUL, destacando nossas competências no fornecimento de plantas em regime Turn-Key.': {
    en: 'MOINHO YPIRANGA is a company specialized in the development of industrial projects and installations. We are one of the largest companies in MERCOSUR focused on the development, manufacture and sale of equipment for the production of chemical products, with particular expertise in supplying turn-key plants.',
    es: 'MOINHO YPIRANGA es una empresa especializada en el desarrollo de proyectos e instalaciones industriales. Somos una de las mayores empresas del MERCOSUR enfocadas en el desarrollo, la fabricación y la comercialización de equipos para la producción de productos químicos, con especial competencia en el suministro de plantas llave en mano.' },
  'Neste regime Turn-Key, quando contratado, assumimos o gerenciamento integral de todas as etapas de implantação do empreendimento, entregando a planta totalmente construída e pronta para o funcionamento.': {
    en: 'Under a turn-key contract, we take full responsibility for managing every stage of the project implementation, delivering the plant fully built and ready to operate.',
    es: 'En la modalidad llave en mano, cuando es contratada, asumimos la gestión integral de todas las etapas de implantación del proyecto y entregamos la planta totalmente construida y lista para funcionar.' },
  'Na contratação Turn-Key, a trajetória do pedido segue:': { en: 'In a turn-key contract, the order follows these steps:', es: 'En la contratación llave en mano, el pedido sigue estas etapas:' },
  'Planejamento;': { en: 'Planning;', es: 'Planificación;' },
  'Projeto Básico, Conceitual e Executivo;': { en: 'Basic, Conceptual and Detailed Design;', es: 'Proyecto Básico, Conceptual y Ejecutivo;' },
  'Documentações do empreendimento;': { en: 'Project documentation;', es: 'Documentación del proyecto;' },
  'Cetesb, Conama, Anvisa, Bombeiro, Prefeitura, outros sob consulta;': { en: 'Environmental, health, fire department and municipal permits (Brazil), others on request;', es: 'Permisos ambientales, sanitarios, de bomberos y municipales (Brasil), otros bajo consulta;' },
  'Cronograma;': { en: 'Schedule;', es: 'Cronograma;' },
  'Gerenciamento e execução da obra;': { en: 'Construction management and execution;', es: 'Gestión y ejecución de la obra;' },
  'Instalações elétrica, hidráulicas, pneumáticas, civil, e outras;': { en: 'Electrical, hydraulic, pneumatic, civil and other installations;', es: 'Instalaciones eléctricas, hidráulicas, neumáticas, civiles y otras;' },
  'Fabricação e desenvolvimento de máquinas e equipamentos;': { en: 'Manufacture and development of machines and equipment;', es: 'Fabricación y desarrollo de máquinas y equipos;' },
  'Produção e desenvolvimento de softwares e automações;': { en: 'Software and automation development;', es: 'Desarrollo de software y automatización;' },
  'Todas as fases desse processo contam com o suporte de recursos tecnológicos adequados, com um moderno sistema de gestão de projetos, além de uma equipe técnica própria e altamente qualificada para atender às necessidades do cliente.': {
    en: "Every phase of this process is supported by appropriate technology, a modern project management system and our own highly qualified technical team to meet the client's needs.",
    es: 'Todas las fases de este proceso cuentan con recursos tecnológicos adecuados, un moderno sistema de gestión de proyectos y un equipo técnico propio y altamente calificado para atender las necesidades del cliente.' },
  '4. ESCOPO DE FORNECIMENTO': { en: '4. SCOPE OF SUPPLY', es: '4. ALCANCE DEL SUMINISTRO' },
  'Nenhum equipamento selecionado para esta proposta.': { en: 'No equipment selected for this proposal.', es: 'Ningún equipo seleccionado para esta propuesta.' },
  'Descritivo técnico:': { en: 'Technical description:', es: 'Descripción técnica:' },
  'Equipamento:': { en: 'Equipment:', es: 'Equipo:' },
  'Código:': { en: 'Code:', es: 'Código:' },
  'Modelo:': { en: 'Model:', es: 'Modelo:' },
  'Quantidade:': { en: 'Quantity:', es: 'Cantidad:' },
  'Família:': { en: 'Product family:', es: 'Familia:' },
  'Categoria:': { en: 'Category:', es: 'Categoría:' },
  'NCM:': { en: 'HS code (NCM):', es: 'NCM:' },
  'Acessórios:': { en: 'Accessories:', es: 'Accesorios:' },
  ', MODELO ': { en: ', MODEL ', es: ', MODELO ' },
  '5. CONDIÇÕES GERAIS DE FORNECIMENTO': { en: '5. GENERAL TERMS OF SUPPLY', es: '5. CONDICIONES GENERALES DE SUMINISTRO' },
  'Tabela de Preços': { en: 'Price Table', es: 'Tabla de Precios' },
  'ITEM': { en: 'ITEM', es: 'ÍTEM' },
  'DESCRIÇÃO': { en: 'DESCRIPTION', es: 'DESCRIPCIÓN' },
  'QUANT.': { en: 'QTY', es: 'CANT.' },
  'PREÇO UNITÁRIO': { en: 'UNIT PRICE', es: 'PRECIO UNITARIO' },
  'TOTAL': { en: 'TOTAL', es: 'TOTAL' },
  'Nenhum item cadastrado.': { en: 'No items.', es: 'Ningún ítem.' },
  'TOTAL DA PROPOSTA': { en: 'PROPOSAL TOTAL', es: 'TOTAL DE LA PROPUESTA' },
  'TOTAL DA PROPOSTA COM DESCONTO': { en: 'PROPOSAL TOTAL WITH DISCOUNT', es: 'TOTAL DE LA PROPUESTA CON DESCUENTO' },
  'Incoterm:': { en: 'Incoterm:', es: 'Incoterm:' },
  'IMPOSTOS E CLASSIFICAÇÕES FISCAIS': { en: 'TAXES AND TAX CLASSIFICATIONS (BRAZIL)', es: 'IMPUESTOS Y CLASIFICACIONES FISCALES (BRASIL)' },
  'Tabela de Classificação Fiscal': { en: 'Tax Classification Table', es: 'Tabla de Clasificación Fiscal' },
  'IDENTIFICAÇÃO EQUIPAMENTOS MOINHO YPIRANGA': { en: 'MOINHO YPIRANGA EQUIPMENT', es: 'IDENTIFICACIÓN DE EQUIPOS MOINHO YPIRANGA' },
  'Misturadores, masseiras, dispersores, moinhos, agitadores, hélices e impelidores': { en: 'Mixers, kneaders, dispersers, mills, agitators, propellers and impellers', es: 'Mezcladores, amasadoras, dispersores, molinos, agitadores, hélices e impulsores' },
  'Tachos, moegas, silos, tanques e demais reservatórios metálicos.': { en: 'Vessels, hoppers, silos, tanks and other metal containers.', es: 'Recipientes, tolvas, silos, tanques y demás depósitos metálicos.' },
  'Nota': { en: 'Note', es: 'Nota' },
  'Para outros produtos, a classificação fiscal deverá ser consultada caso a caso.': { en: 'For other products, the tax classification must be checked case by case.', es: 'Para otros productos, la clasificación fiscal debe consultarse caso por caso.' },
  'Tabela de Impostos e Alíquotas': { en: 'Taxes and Rates Table', es: 'Tabla de Impuestos y Alícuotas' },
  'REGIÃO 1': { en: 'REGION 1', es: 'REGIÓN 1' },
  'REGIÃO 2': { en: 'REGION 2', es: 'REGIÓN 2' },
  'REGIÃO 3': { en: 'REGION 3', es: 'REGIÓN 3' },
  'Texto complementar abaixo das tabelas:': { en: 'Notes to the tables:', es: 'Notas de las tablas:' },
  'Região 1: São Paulo (SP)': { en: 'Region 1: São Paulo (SP)', es: 'Región 1: São Paulo (SP)' },
  'Região 2: Minas Gerais (MG), Paraná (PR), Rio de Janeiro (RJ), Rio Grande do Sul (RS) e Santa Catarina (SC)': {
    en: 'Region 2: Minas Gerais (MG), Paraná (PR), Rio de Janeiro (RJ), Rio Grande do Sul (RS) and Santa Catarina (SC)',
    es: 'Región 2: Minas Gerais (MG), Paraná (PR), Rio de Janeiro (RJ), Rio Grande do Sul (RS) y Santa Catarina (SC)' },
  'Região 3: Acre (AC), Alagoas (AL), Amapá (AP), Amazonas (AM), Bahia (BA), Ceará (CE), Distrito Federal (DF), Espírito Santo (ES), Goiás (GO), Maranhã (MA), Mato Grosso (MT), Mato Grosso do Sul (MS), Pará (PA), Paraíba (PB), Pernambuco (PE), Piauí (PI), Rio Grande do Norte (RN), Rondônia (RO), Roraima (RR), Sergipe (SE) e Tocantins (TO).': {
    en: 'Region 3: all other Brazilian states and the Federal District.',
    es: 'Región 3: los demás estados de Brasil y el Distrito Federal.' },
  'Nota: Redução tributária aplicada nos produtos classificados com NCM 8474.39.00, Inciso II, Artigo 12, Anexo II do RICMS/SP.': {
    en: 'Note: tax reduction applied to products classified under NCM 8474.39.00 (São Paulo State ICMS regulation, Annex II, Article 12, item II).',
    es: 'Nota: reducción tributaria aplicada a los productos clasificados en el NCM 8474.39.00 (reglamento del ICMS del Estado de São Paulo, Anexo II, Artículo 12, inciso II).' },
  'Para outros produtos, os impostos e alíquotas deverão ser consultados caso a caso.': { en: 'For other products, taxes and rates must be checked case by case.', es: 'Para otros productos, los impuestos y alícuotas deben consultarse caso por caso.' },
  'Data da assinatura:': { en: 'Date of signature:', es: 'Fecha de firma:' },
  'Assinatura e carimbo da empresa CONTRATANTE:': { en: 'Signature and stamp of the CONTRACTING COMPANY:', es: 'Firma y sello de la empresa CONTRATANTE:' },
  'Atenciosamente,': { en: 'Sincerely,', es: 'Atentamente,' },
  'Diretor Comercial': { en: 'Sales Director', es: 'Director Comercial' },
  'Gerente Comercial': { en: 'Sales Manager', es: 'Gerente Comercial' },
  'Vendas Técnica': { en: 'Technical Sales', es: 'Ventas Técnicas' },
  'Depto. Comercial': { en: 'Sales Department', es: 'Depto. Comercial' },
  'Pág.': { en: 'Page', es: 'Pág.' },
};

/** Texto fixo na língua pedida; PT quando a língua é pt-BR ou a chave não está no dicionário. */
function t(idioma, pt) {
  const e = DICIONARIO[pt];
  return (e && e[idioma]) || pt;
}

/** "PT / tradução" para rótulo curto (cabeçalho de tabela, label da capa) — o mesmo texto quando são iguais (ex.: TOTAL). */
function rotuloDuplo(idioma, pt) {
  const tr = t(idioma, pt);
  return tr === pt ? pt : `${pt} / ${tr}`;
}

module.exports = {
  IDIOMAS, MOEDAS, DICIONARIO,
  idiomaDaProposta, ehBilingue, moedaDaProposta, formatarMoeda, erroIdiomaMoeda,
  normalizarChave, textoDeHtml, segmentarHtml, escHtml, traduzido, attrsTraducao, elementoTraduzido, marcadoresDe, LIMITE_PARAGRAFO,
  paresDeConteudo, textosDeConteudo, t, rotuloDuplo,
};
