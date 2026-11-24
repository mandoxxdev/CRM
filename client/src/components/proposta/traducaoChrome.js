/**
 * Tradução automática da proposta bilíngue pelo tradutor do PRÓPRIO Chrome (Translator API, no PC do vendedor — grátis, sem chave,
 * sem servidor). Spec: specs/proposta-bilingue/README.md, RN-BI.05/07.
 *
 * - Glossário (RN-BI.07): termos de contrato que o tradutor erra saem sempre com a tradução fixa. No spike de 24/11/2026 o tradutor
 *   automático trocou CONTRATANTE por "CONTRACTOR" — que é a CONTRATADA: inverteria as partes do contrato.
 * - Marcadores {{…}} (Fase 2, I5): a chave da memória é o texto COM o marcador; o tradutor não pode mexer nele.
 * - Os dois são trocados por fichas (⟦0⟧, ⟦1⟧…) antes de traduzir e devolvidos depois. Se o tradutor perder uma ficha, a tradução é
 *   RECUSADA (o texto continua pendente) — melhor pendente que um contrato com o termo errado.
 * - Texto todo em maiúsculas (título, nome do produto — o servidor grava em maiúsculas) é traduzido em minúsculas e volta em
 *   maiúsculas: o tradutor erra mais com CAIXA ALTA (Fase 2, I18).
 */

// Fronteira de palavra com letras acentuadas: SUBCONTRATADA não casa CONTRATADA.
const LETRA = 'A-Za-zÀ-ÖØ-öø-ÿ';
// O termo vai num grupo: sem ele, com alternativas ("nota fiscal|notas fiscais") a fronteira grudava numa só e "nota fiscalizada"
// virava "invoiceizada" (Fase 5, 8).
const termo = (t) => new RegExp(`(?<![${LETRA}])(?:${t})(?![${LETRA}])`, 'gi');

export const GLOSSARIO = [
  { re: termo('ESCOPO DE FORNECIMENTO'), en: 'SCOPE OF SUPPLY', es: 'ALCANCE DEL SUMINISTRO' },
  { re: termo('CONTRATANTE'), en: 'CONTRACTING PARTY', es: 'CONTRATANTE' },
  { re: termo('CONTRATADA'), en: 'CONTRACTOR', es: 'CONTRATISTA' },
  { re: termo('notas? fiscal|notas fiscais'), en: 'invoice', es: 'factura' },
  { re: termo('MOINHO YPIRANGA'), en: 'MOINHO YPIRANGA', es: 'MOINHO YPIRANGA' },
  { re: termo('GMP INDUSTRIAIS'), en: 'GMP INDUSTRIAIS', es: 'GMP INDUSTRIAIS' },
];

const ehTudoMaiusculo = (s) => /[A-Za-zÀ-ÿ]/.test(s) && s === s.toLocaleUpperCase('pt-BR') && s.replace(/[^A-Za-zÀ-ÿ]/g, '').length > 3;

/** Troca marcadores e termos do glossário por fichas. Devolve { texto, fichas: [valor já na língua de destino] }. */
export function protegerTexto(texto, idioma) {
  const fichas = [];
  const ficha = (valor) => { fichas.push(valor); return `⟦${fichas.length - 1}⟧`; };
  let t = String(texto).replace(/\{\{[\s\S]*?\}\}/g, (m) => ficha(m));
  GLOSSARIO.forEach((g) => {
    t = t.replace(g.re, (m) => {
      const alvo = g[idioma] || m;
      // mantém a caixa do original: CONTRATANTE -> CONTRACTING PARTY; contratante -> contracting party
      return ficha(m === m.toLocaleUpperCase('pt-BR') ? alvo.toUpperCase() : alvo.toLowerCase());
    });
  });
  return { texto: t, fichas };
}

/** Devolve as fichas. null se o tradutor perdeu alguma (a tradução é recusada). */
export function restaurarTexto(traduzido, fichas) {
  let t = String(traduzido);
  for (let i = 0; i < fichas.length; i++) {
    const re = new RegExp(`⟦\\s*${i}\\s*⟧`, 'g');
    if (!re.test(t)) return null;
    t = t.replace(new RegExp(`⟦\\s*${i}\\s*⟧`, 'g'), () => fichas[i]);
  }
  return t.replace(/⟦\s*\d+\s*⟧/g, '').replace(/\s+/g, ' ').trim();
}

/** Prepara o texto PT para o tradutor: fichas no lugar de marcadores e glossário; caixa alta vira minúscula (Fase 2, I18). */
export function prepararTexto(textoPt, idioma) {
  // Protege PRIMEIRO (marcadores e glossário saem do texto como fichas) e só então decide a caixa: o marcador {{cliente.nome}} é
  // minúsculo e fazia um título todo em maiúsculas parecer misto (achado pelo teste [I18]).
  const { texto, fichas } = protegerTexto(textoPt, idioma);
  const maiusculo = ehTudoMaiusculo(texto.replace(/⟦\d+⟧/g, ''));
  return { entrada: maiusculo ? texto.toLocaleLowerCase('pt-BR') : texto, fichas, maiusculo };
}

/** Devolve a saída do tradutor à forma final. null = não traduziu (vazio ou ficha perdida). */
export function finalizarTexto(saida, preparo, idioma) {
  if (!saida || !String(saida).trim()) return null;
  // Maiúsculas ANTES de devolver as fichas: o marcador {{…}} volta com a caixa original.
  const base = preparo.maiusculo ? String(saida).toLocaleUpperCase(idioma === 'es' ? 'es-ES' : 'en-US') : saida;
  return restaurarTexto(base, preparo.fichas);
}

/**
 * Traduz um texto PT com um tradutor que tem `translate(texto)` (o do Chrome). null = não traduziu (ficha perdida, erro, vazio).
 * Recebe o tradutor pronto para testar sem o Chrome.
 */
export async function traduzirTexto(tradutor, textoPt, idioma) {
  const preparo = prepararTexto(textoPt, idioma);
  let saida;
  try { saida = await tradutor.translate(preparo.entrada); } catch (e) { return null; }
  return finalizarTexto(saida, preparo, idioma);
}

const LOTE_SERVIDOR = 100;

/**
 * Tradutor que roda NO SERVIDOR do CRM (POST /api/traducoes/automatica) — funciona em QUALQUER navegador (pedido de 24/11/2026:
 * "deve funcionar em qualquer navegador"). Traduz em lote (`traduzirVarios`); não precisa de clique nem de download.
 * Falha do servidor = exceção (quem chama tenta o do Chrome, se houver).
 */
export function tradutorDoServidor(api, idioma) {
  return {
    async traduzirVarios(textos) {
      const saida = [];
      for (let i = 0; i < textos.length; i += LOTE_SERVIDOR) {
        // eslint-disable-next-line no-await-in-loop
        const { data } = await api.post('/traducoes/automatica', { idioma, textos: textos.slice(i, i + LOTE_SERVIDOR) });
        const lote = (data && Array.isArray(data.traducoes)) ? data.traducoes : [];
        textos.slice(i, i + LOTE_SERVIDOR).forEach((_, k) => saida.push(typeof lote[k] === 'string' ? lote[k] : null));
      }
      return saida;
    },
  };
}

/**
 * Traduz vários textos PT. Usa `traduzirVarios` (lote, o do servidor) se o tradutor tiver; senão um a um com `translate` (o do Chrome).
 * Devolve [texto traduzido | null], na mesma ordem. Erro do tradutor em lote sobe (para cair no do Chrome).
 */
export async function traduzirTextos(tradutor, textosPt, idioma, aoProgredir) {
  if (tradutor && typeof tradutor.traduzirVarios === 'function') {
    const preparos = textosPt.map((t) => prepararTexto(t, idioma));
    const saidas = await tradutor.traduzirVarios(preparos.map((p) => p.entrada));
    if (aoProgredir) aoProgredir(textosPt.length, textosPt.length);
    return preparos.map((p, i) => finalizarTexto(saidas[i], p, idioma));
  }
  const saida = [];
  for (let i = 0; i < textosPt.length; i++) {
    // eslint-disable-next-line no-await-in-loop
    saida.push(await traduzirTexto(tradutor, textosPt[i], idioma));
    if (aoProgredir) aoProgredir(i + 1, textosPt.length);
  }
  return saida;
}

/** O tradutor do Chrome está neste navegador? (só existe no Chrome 138+). */
export function temTradutorDoChrome(janela = typeof window !== 'undefined' ? window : undefined) {
  return Boolean(janela && 'Translator' in janela && janela.Translator && typeof janela.Translator.create === 'function');
}

/**
 * Cria o tradutor PT -> idioma. Precisa de um GESTO do usuário na primeira vez (o Chrome baixa o modelo da língua) — por isso é
 * chamado no clique de "Traduzir pendentes" (Fase 2, I11). `aoProgredir(0..1)` mostra o download.
 */
export async function criarTradutor(idioma, aoProgredir, janela = window) {
  const opcoes = { sourceLanguage: 'pt', targetLanguage: idioma };
  if (aoProgredir) {
    opcoes.monitor = (m) => m.addEventListener('downloadprogress', (e) => aoProgredir(e.loaded));
  }
  return janela.Translator.create(opcoes);
}

/**
 * A língua já está baixada neste Chrome? ('available' = traduz SEM clique). Com teto de tempo: no painel embutido do app o
 * availability() chegou a não responder. Qualquer falha = false (aí a tradução espera um clique).
 */
export async function linguaJaBaixada(idioma, janela = typeof window !== 'undefined' ? window : undefined, tetoMs = 3000) {
  if (!temTradutorDoChrome(janela) || typeof janela.Translator.availability !== 'function') return false;
  try {
    const r = await Promise.race([
      janela.Translator.availability({ sourceLanguage: 'pt', targetLanguage: idioma }),
      new Promise((res) => setTimeout(() => res('timeout'), tetoMs)),
    ]);
    return r === 'available';
  } catch (e) {
    return false;
  }
}

const MAX_CARACTERES = 5000; // limite de cada texto no POST /api/traducoes
const LOTE = 200;

/**
 * Traduz `textos` pelo SERVIDOR do CRM (qualquer navegador); se ele falhar e houver tradutor do Chrome (`tradutorPromessa`, criado
 * no clique), tenta por ele. Sem nenhum dos dois, a exceção sobe. Devolve [texto | null] na mesma ordem.
 */
export async function traduzirComReserva({ api, idioma, tradutorPromessa, textos, aoProgredir }) {
  try {
    return await traduzirTextos(tradutorDoServidor(api, idioma), textos, idioma, aoProgredir);
  } catch (e) {
    if (!tradutorPromessa) throw e;
    return traduzirTextos(await tradutorPromessa, textos, idioma, aoProgredir);
  }
}

/**
 * Tradução AUTOMÁTICA dos pendentes de uma proposta (o pedido: "ao vendedor digitar em PT já suba em ESP ou ING" — e, em
 * 24/11/2026, "a tradução não está automática!!!!!" e "deve funcionar em qualquer navegador"). Lê o documento bilíngue do servidor,
 * traduz o que está pendente — pelo SERVIDOR do CRM; se ele falhar, pelo tradutor do Chrome (`tradutorPromessa`, opcional, criado no
 * clique) — e grava como 'auto'. Devolve { traduzidos, falhas, pendentes }.
 */
export async function traduzirPendentesDaProposta({ api, propostaId, idioma, tradutorPromessa, aoProgredir }) {
  const res = await api.get(`/propostas/${propostaId}/premium?embed=1&bilingue=1`, { responseType: 'text' });
  const pendentes = textosDoDocumento(res.data).filter((t) => t.pendente);
  if (pendentes.length === 0) return { traduzidos: 0, falhas: 0, pendentes: 0 };
  const traducoes = await traduzirComReserva({ api, idioma, tradutorPromessa, textos: pendentes.map((p) => p.chave), aoProgredir });
  const prontos = [];
  let falhas = 0;
  pendentes.forEach((p, i) => {
    const tr = traducoes[i];
    if (tr && tr.length <= MAX_CARACTERES) prontos.push({ texto_origem: p.chave, texto_traduzido: tr }); else falhas++;
  });
  for (let i = 0; i < prontos.length; i += LOTE) {
    // eslint-disable-next-line no-await-in-loop
    await api.post('/traducoes', { idioma, origem: 'auto', itens: prontos.slice(i, i + LOTE) });
  }
  return { traduzidos: prontos.length, falhas, pendentes: pendentes.length };
}

/**
 * Os textos traduzíveis do documento bilíngue (o HTML do /premium?bilingue=1), sem repetir: a chave vem do atributo
 * `data-tr-origem` que o SERVIDOR escreveu — a mesma que ele procura na memória (Fase 2, I5).
 * [{ chave, traducao (o que o documento mostra hoje na coluna traduzida, '' se pendente), pendente }]
 */
export function textosDoDocumento(html, ParserCls = typeof DOMParser !== 'undefined' ? DOMParser : null) {
  if (!ParserCls) return [];
  const doc = new ParserCls().parseFromString(String(html || ''), 'text/html');
  const porChave = new Map();
  // Só a FONTE (#proposalSource): as páginas são cópias montadas pelo script e não existem neste HTML ainda.
  doc.querySelectorAll('[data-tr-origem]').forEach((el) => {
    const chave = el.getAttribute('data-tr-origem');
    if (!chave || porChave.has(chave)) return;
    const pendente = el.hasAttribute('data-traduzir');
    // A tradução vem do atributo `data-tr-texto` (a de ANTES da troca dos marcadores), nunca do texto visível: nele o {{cliente.nome}}
    // já virou o nome deste cliente, e corrigir a partir dele gravava esse nome na memória global (Fase 5, crítico 1).
    const cru = el.getAttribute('data-tr-texto');
    porChave.set(chave, { chave, traducao: pendente ? '' : (cru != null ? cru : (el.textContent || '').trim()), pendente });
  });
  return [...porChave.values()];
}
