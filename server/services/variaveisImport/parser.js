/**
 * Leitura da planilha de variáveis técnicas.
 *
 * Formato esperado (as três abas são procuradas por nome, sem exigir acento nem caixa):
 *
 *   Variaveis : nome* | chave | tipo | categoria | prefixo | sufixo | ordem | familias
 *   Opcoes    : variavel* | valor* | ordem | familias
 *   Familias  : codigo | nome | grupo | modelo      (legenda opcional, expande "F01")
 *
 * Se a planilha tiver uma aba só, cada linha é lida como par variável+valor —
 * é o formato que sai de um "salvar como" de tabela simples e evita obrigar o
 * usuário a montar o arquivo de três abas só para carregar meia dúzia de itens.
 *
 * O parser não toca no banco: devolve dados normalizados e a lista de erros por
 * linha. Quem decide o que gravar é a rota de importação.
 */

const { normalizar } = require('./similaridade');

const TIPOS_VALIDOS = ['texto', 'numero', 'lista', 'lista_condicional', 'soma', 'manual_proposta'];

// Um cabeçalho pode vir escrito de várias formas; aqui ficam os apelidos aceitos.
const ALIAS_VARIAVEIS = {
  nome: ['nome', 'variavel', 'variavel consolidada', 'nome da variavel', 'descricao'],
  chave: ['chave', 'key', 'identificador', 'slug'],
  tipo: ['tipo', 'tipo de campo'],
  categoria: ['categoria', 'grupo da variavel', 'grupo de variavel'],
  prefixo: ['prefixo'],
  sufixo: ['sufixo', 'unidade', 'unidade de medida'],
  ordem: ['ordem', 'n', 'no', 'numero', 'seq', 'sequencia'],
  familias: ['familias', 'familia', 'aplica a', 'aplica_a', 'cobertura', 'aplicavel a']
};

const ALIAS_OPCOES = {
  variavel: ['variavel', 'variavel consolidada', 'nome da variavel', 'chave', 'variavel chave'],
  valor: ['valor', 'item', 'opcao', 'item valor', 'itens valores', 'conteudo'],
  ordem: ['ordem', 'n', 'no', 'numero', 'seq'],
  familias: ['familias', 'familia', 'aplica a', 'aplica_a', 'cobertura']
};

const ALIAS_FAMILIAS = {
  codigo: ['codigo', 'cod', 'sigla'],
  nome: ['nome', 'familia', 'nome da familia'],
  grupo: ['grupo'],
  modelo: ['modelo', 'modelo identificacao', 'identificacao']
};

/** Gera a chave no mesmo formato que o resto do sistema (index.js e seed). */
function gerarChave(nome) {
  return String(nome || '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '_')
    .replace(/[^a-z0-9_]/g, '');
}

/** Aceita "Variáveis", "VARIAVEIS", "variaveis " como a mesma aba. */
function acharAba(workbook, candidatos) {
  const nomes = workbook.SheetNames || [];
  for (let i = 0; i < nomes.length; i++) {
    const norm = normalizar(nomes[i]);
    if (candidatos.indexOf(norm) !== -1) return nomes[i];
  }
  return null;
}

/** Mapeia { campo: índice da coluna } a partir da linha de cabeçalho. */
function mapearColunas(cabecalho, alias) {
  const mapa = {};
  (cabecalho || []).forEach((celula, idx) => {
    const norm = normalizar(celula);
    if (!norm) return;
    Object.keys(alias).forEach((campo) => {
      if (mapa[campo] != null) return;
      if (alias[campo].indexOf(norm) !== -1) mapa[campo] = idx;
    });
  });
  return mapa;
}

function valorCelula(linha, idx) {
  if (idx == null || !linha) return '';
  const v = linha[idx];
  if (v == null) return '';
  return String(v).trim();
}

/**
 * Expande a notação de faixa do catálogo: "F01–F05" vira F01..F05.
 * Aceita hífen, en dash e em dash, além de listas separadas por ; ou vírgula.
 */
function expandirFamilias(texto) {
  const bruto = String(texto == null ? '' : texto).trim();
  if (!bruto) return [];

  const partes = bruto.split(/[;,]/).map((p) => p.trim()).filter(Boolean);
  const saida = [];

  partes.forEach((parte) => {
    const faixa = parte.match(/^([A-Za-z]*)(\d+)\s*[-–—]\s*([A-Za-z]*)(\d+)$/);
    if (faixa) {
      const prefixo = faixa[1] || faixa[3] || '';
      const ini = parseInt(faixa[2], 10);
      const fim = parseInt(faixa[4], 10);
      const largura = faixa[2].length;
      if (!isNaN(ini) && !isNaN(fim) && fim >= ini && fim - ini <= 500) {
        for (let n = ini; n <= fim; n++) {
          saida.push(prefixo + String(n).padStart(largura, '0'));
        }
        return;
      }
    }
    saida.push(parte);
  });

  // Remove repetição preservando a ordem em que apareceram.
  const vistos = new Set();
  return saida.filter((f) => {
    const k = normalizar(f);
    if (!k || vistos.has(k)) return false;
    vistos.add(k);
    return true;
  });
}

/** Converte a aba em matriz de linhas, já sem as linhas totalmente vazias. */
function lerMatriz(XLSX, workbook, nomeAba) {
  const sheet = workbook.Sheets[nomeAba];
  if (!sheet) return [];
  const linhas = XLSX.utils.sheet_to_json(sheet, { header: 1, blankrows: false, defval: '' });
  return linhas.filter((l) => Array.isArray(l) && l.some((c) => String(c == null ? '' : c).trim() !== ''));
}

/**
 * Localiza a linha de cabeçalho: a primeira que casa com pelo menos um alias
 * obrigatório. Tolera planilha com título/mesclagem nas primeiras linhas.
 */
function acharCabecalho(matriz, alias, camposObrigatorios) {
  const limite = Math.min(matriz.length, 15);
  for (let i = 0; i < limite; i++) {
    const mapa = mapearColunas(matriz[i], alias);
    const temTodos = camposObrigatorios.every((c) => mapa[c] != null);
    if (temTodos) return { indice: i, mapa };
  }
  return { indice: -1, mapa: {} };
}

function parseFamilias(XLSX, workbook) {
  const aba = acharAba(workbook, ['familias', 'legenda', 'legenda das familias', 'legenda familias']);
  if (!aba) return [];
  const matriz = lerMatriz(XLSX, workbook, aba);
  const { indice, mapa } = acharCabecalho(matriz, ALIAS_FAMILIAS, ['nome']);
  if (indice === -1) return [];

  const saida = [];
  for (let i = indice + 1; i < matriz.length; i++) {
    const nome = valorCelula(matriz[i], mapa.nome);
    if (!nome) continue;
    saida.push({
      codigo: valorCelula(matriz[i], mapa.codigo) || null,
      nome,
      grupo: valorCelula(matriz[i], mapa.grupo) || null,
      modelo: valorCelula(matriz[i], mapa.modelo) || null,
      linha: i + 1
    });
  }
  return saida;
}

// Numa coluna de família da matriz, qualquer coisa escrita marca — menos as
// formas explícitas de negação. Evita perder marcação de quem escreveu "sim".
const NAO_MARCADO = ['0', 'n', 'nao', 'no', '-', 'x0', 'false'];

function marcado(valor) {
  const v = normalizar(valor);
  if (!v) return false;
  return NAO_MARCADO.indexOf(v) === -1;
}

/**
 * Formato simples: uma linha por opção, repetindo o nome da variável.
 * É como a maioria das pessoas preenche planilha, e é o formato do modelo.
 *
 *   Variável   | Opção    | Famílias
 *   Acabamento | Escovado | Disco Dispersor
 *   Acabamento | Usinado  | Eixo de Laboratório
 *
 * `colunasFamilia` cobre o formato matriz, onde cada família é uma coluna e a
 * pessoa só marca X — assim ninguém precisa digitar nome de família.
 *
 *   Variável   | Opção    | Disco Dispersor | Eixo de Laboratório
 *   Acabamento | Escovado | X               |
 */
function linhasCombinadas(matriz, mapa, indiceCabecalho, colunasFamilia) {
  const colunas = colunasFamilia || [];
  const variaveis = [];
  const opcoes = [];
  const porChave = new Map();

  for (let i = indiceCabecalho + 1; i < matriz.length; i++) {
    const linhaNum = i + 1;
    const nome = valorCelula(matriz[i], mapa.nome);
    if (!nome) continue;

    const chave = gerarChave(valorCelula(matriz[i], mapa.chave)) || gerarChave(nome);
    if (!chave) continue;

    // Famílias vêm da coluna de texto e/ou das colunas marcadas com X.
    const familias = expandirFamilias(valorCelula(matriz[i], mapa.familias));
    colunas.forEach((col) => {
      if (marcado(valorCelula(matriz[i], col.idx)) && familias.indexOf(col.nome) === -1) {
        familias.push(col.nome);
      }
    });

    let variavel = porChave.get(chave);
    if (!variavel) {
      let tipo = normalizar(valorCelula(matriz[i], mapa.tipo)).replace(/\s+/g, '_');
      if (TIPOS_VALIDOS.indexOf(tipo) === -1) tipo = '';
      const ordemBruta = parseInt(valorCelula(matriz[i], mapa.ordem), 10);
      variavel = {
        linha: linhaNum,
        nome: nome.toLocaleUpperCase('pt-BR'),
        chave,
        chaveInformada: false,
        tipo,
        categoria: valorCelula(matriz[i], mapa.categoria) || null,
        prefixo: valorCelula(matriz[i], mapa.prefixo) || null,
        sufixo: valorCelula(matriz[i], mapa.sufixo) || null,
        ordem: isNaN(ordemBruta) ? null : ordemBruta,
        familias: [],
        opcoes: []
      };
      variaveis.push(variavel);
      porChave.set(chave, variavel);
    }
    familias.forEach((f) => { if (variavel.familias.indexOf(f) === -1) variavel.familias.push(f); });

    // Uma célula pode trazer vários valores separados por ; — acontece quando o
    // usuário consolida a lista inteira numa linha só.
    const valorBruto = valorCelula(matriz[i], mapa.valor);
    if (valorBruto) {
      valorBruto.split(';').map((v) => v.trim()).filter(Boolean).forEach((valor) => {
        opcoes.push({ linha: linhaNum, variavel: nome, valor, ordem: null, familias });
      });
    }
  }
  return { variaveis, opcoes };
}

function parseVariaveis(XLSX, workbook, erros) {
  const aba = acharAba(workbook, ['variaveis', 'variaveis tecnicas', 'variavel', 'cadastro']);
  if (!aba) return { encontrouAba: false, itens: [], opcoesEmbutidas: [] };

  const matriz = lerMatriz(XLSX, workbook, aba);
  // Procura o cabeçalho já contando com uma possível coluna de valor/opção:
  // é o que permite a planilha simples de uma aba só.
  const aliasComValor = Object.assign({}, ALIAS_VARIAVEIS, { valor: ALIAS_OPCOES.valor });
  const { indice, mapa } = acharCabecalho(matriz, aliasComValor, ['nome']);
  if (indice === -1) {
    erros.push({ aba, linha: null, erro: 'Não foi encontrada a coluna "Variável" na primeira aba.' });
    return { encontrouAba: true, itens: [], opcoesEmbutidas: [] };
  }

  // Tem coluna de opção na mesma aba? Então é o formato simples/matriz.
  if (mapa.valor != null) {
    // Toda coluna do cabeçalho que não foi reconhecida como campo conhecido é
    // tratada como nome de família (formato matriz). Se não bater com nenhuma
    // família cadastrada, a análise reporta — não inventa vínculo.
    const usadas = new Set(Object.keys(mapa).map((k) => mapa[k]));
    const colunasFamilia = [];
    (matriz[indice] || []).forEach((celula, idx) => {
      const titulo = String(celula == null ? '' : celula).trim();
      if (titulo && !usadas.has(idx)) colunasFamilia.push({ idx, nome: titulo });
    });

    const r = linhasCombinadas(matriz, mapa, indice, colunasFamilia);
    return { encontrouAba: true, itens: r.variaveis, opcoesEmbutidas: r.opcoes };
  }

  const itens = [];
  for (let i = indice + 1; i < matriz.length; i++) {
    const linhaNum = i + 1;
    const nome = valorCelula(matriz[i], mapa.nome);
    if (!nome) continue;

    let tipo = normalizar(valorCelula(matriz[i], mapa.tipo)).replace(/\s+/g, '_');
    if (TIPOS_VALIDOS.indexOf(tipo) === -1) tipo = '';

    const chaveInformada = gerarChave(valorCelula(matriz[i], mapa.chave));
    const ordemBruta = parseInt(valorCelula(matriz[i], mapa.ordem), 10);

    itens.push({
      linha: linhaNum,
      // O sistema grava nome de variável sempre em caixa alta (ver POST
      // /api/variaveis-tecnicas); normalizamos aqui para o preview já mostrar
      // exatamente o que vai ser gravado.
      nome: nome.toLocaleUpperCase('pt-BR'),
      chave: chaveInformada || gerarChave(nome),
      chaveInformada: !!chaveInformada,
      tipo,
      categoria: valorCelula(matriz[i], mapa.categoria) || null,
      prefixo: valorCelula(matriz[i], mapa.prefixo) || null,
      sufixo: valorCelula(matriz[i], mapa.sufixo) || null,
      ordem: isNaN(ordemBruta) ? null : ordemBruta,
      familias: expandirFamilias(valorCelula(matriz[i], mapa.familias)),
      opcoes: []
    });
  }
  return { encontrouAba: true, itens, opcoesEmbutidas: [] };
}

function parseOpcoes(XLSX, workbook, erros) {
  const aba = acharAba(workbook, ['opcoes', 'itens', 'valores', 'itens valores', 'opcoes das variaveis']);
  if (!aba) return { encontrouAba: false, itens: [] };

  const matriz = lerMatriz(XLSX, workbook, aba);
  const { indice, mapa } = acharCabecalho(matriz, ALIAS_OPCOES, ['variavel', 'valor']);
  if (indice === -1) {
    erros.push({ aba, linha: null, erro: 'A aba de opções precisa das colunas "variavel" e "valor".' });
    return { encontrouAba: true, itens: [] };
  }

  const itens = [];
  for (let i = indice + 1; i < matriz.length; i++) {
    const linhaNum = i + 1;
    const variavel = valorCelula(matriz[i], mapa.variavel);
    const valor = valorCelula(matriz[i], mapa.valor);
    if (!variavel && !valor) continue;
    if (!variavel) {
      erros.push({ aba, linha: linhaNum, erro: 'Opção sem variável de destino — linha ignorada.' });
      continue;
    }
    if (!valor) {
      erros.push({ aba, linha: linhaNum, erro: `Opção vazia para "${variavel}" — linha ignorada.` });
      continue;
    }
    const ordemBruta = parseInt(valorCelula(matriz[i], mapa.ordem), 10);
    itens.push({
      linha: linhaNum,
      variavel,
      valor,
      ordem: isNaN(ordemBruta) ? null : ordemBruta,
      familias: expandirFamilias(valorCelula(matriz[i], mapa.familias))
    });
  }
  return { encontrouAba: true, itens };
}

/**
 * Fallback de aba única: cada linha vira variável + (opcionalmente) um valor.
 * Usado quando não existem as abas nomeadas.
 */
function parseAbaUnica(XLSX, workbook, erros) {
  const nomeAba = (workbook.SheetNames || [])[0];
  if (!nomeAba) return { variaveis: [], opcoes: [] };

  const matriz = lerMatriz(XLSX, workbook, nomeAba);
  const aliasMisto = Object.assign({}, ALIAS_VARIAVEIS, { valor: ALIAS_OPCOES.valor });
  const { indice, mapa } = acharCabecalho(matriz, aliasMisto, ['nome']);
  if (indice === -1) {
    erros.push({
      aba: nomeAba,
      linha: null,
      erro: 'Não foi possível identificar o cabeçalho. Baixe o modelo e preencha as colunas Variável / Opção / Famílias.'
    });
    return { variaveis: [], opcoes: [] };
  }
  return linhasCombinadas(matriz, mapa, indice);
}

/**
 * Lê o arquivo e devolve a estrutura consolidada.
 *
 * @param {Buffer} buffer conteúdo do .xlsx/.xls/.csv
 * @returns {{variaveis:Array, familias:Array, erros:Array, avisos:Array}}
 */
function parsePlanilha(buffer) {
  const XLSX = require('xlsx');
  const erros = [];
  const avisos = [];

  let workbook;
  try {
    workbook = XLSX.read(buffer, { type: 'buffer', cellDates: false });
  } catch (e) {
    return { variaveis: [], familias: [], erros: [{ aba: null, linha: null, erro: 'Arquivo ilegível: ' + e.message }], avisos: [] };
  }

  const familias = parseFamilias(XLSX, workbook);
  let resVar = parseVariaveis(XLSX, workbook, erros);
  let resOpc = parseOpcoes(XLSX, workbook, erros);

  let listaVariaveis = resVar.itens;
  // Formato simples: as opções vêm na mesma aba das variáveis. Formato avançado:
  // vêm da aba Opcoes. Os dois podem coexistir na mesma planilha.
  let listaOpcoes = (resVar.opcoesEmbutidas || []).concat(resOpc.itens);

  if (!resVar.encontrouAba && !resOpc.encontrouAba) {
    const unica = parseAbaUnica(XLSX, workbook, erros);
    listaVariaveis = unica.variaveis;
    listaOpcoes = unica.opcoes;
  }

  // Índice por chave e por nome normalizado, para casar as opções com a variável
  // mesmo quando a aba Opcoes referencia pelo nome em vez da chave.
  const porChave = new Map();
  const porNome = new Map();
  listaVariaveis.forEach((v) => {
    porChave.set(v.chave, v);
    porNome.set(normalizar(v.nome), v);
  });

  listaOpcoes.forEach((op) => {
    const alvo = porChave.get(gerarChave(op.variavel)) || porNome.get(normalizar(op.variavel));
    if (!alvo) {
      // Opção citando variável que não está na aba Variaveis: cria a variável
      // implicitamente, senão o usuário perderia o valor sem entender por quê.
      const nomeUpper = String(op.variavel).toLocaleUpperCase('pt-BR');
      const chave = gerarChave(op.variavel);
      if (!chave) return;
      const nova = {
        linha: op.linha,
        nome: nomeUpper,
        chave,
        chaveInformada: false,
        tipo: '',
        categoria: null,
        prefixo: null,
        sufixo: null,
        ordem: null,
        familias: [],
        opcoes: [],
        implicita: true
      };
      listaVariaveis.push(nova);
      porChave.set(chave, nova);
      porNome.set(normalizar(nomeUpper), nova);
      nova.opcoes.push({ valor: op.valor, ordem: op.ordem, familias: op.familias, linha: op.linha });
      avisos.push(`Variável "${nomeUpper}" (linha ${op.linha} da aba de opções) não estava na aba Variaveis e será criada.`);
      return;
    }
    // Não duplica o mesmo valor na mesma variável.
    const jaTem = alvo.opcoes.some((o) => normalizar(o.valor) === normalizar(op.valor));
    if (jaTem) {
      const idx = alvo.opcoes.findIndex((o) => normalizar(o.valor) === normalizar(op.valor));
      op.familias.forEach((f) => {
        if (alvo.opcoes[idx].familias.indexOf(f) === -1) alvo.opcoes[idx].familias.push(f);
      });
      return;
    }
    alvo.opcoes.push({ valor: op.valor, ordem: op.ordem, familias: op.familias, linha: op.linha });
  });

  // Tipo não informado + tem opções = lista. É a inferência que evita o usuário
  // ter que preencher a coluna tipo em 130 linhas.
  listaVariaveis.forEach((v) => {
    if (!v.tipo) v.tipo = v.opcoes.length > 0 ? 'lista' : 'texto';
    // Famílias da variável = as dela + todas as citadas nas suas opções.
    v.opcoes.forEach((o) => {
      o.familias.forEach((f) => {
        if (v.familias.indexOf(f) === -1) v.familias.push(f);
      });
    });
  });

  return { variaveis: listaVariaveis, familias, erros, avisos };
}

module.exports = {
  parsePlanilha,
  expandirFamilias,
  gerarChave,
  mapearColunas,
  acharCabecalho,
  TIPOS_VALIDOS,
  ALIAS_VARIAVEIS,
  ALIAS_OPCOES
};
