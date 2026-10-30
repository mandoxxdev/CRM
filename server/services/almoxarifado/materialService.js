/**
 * Cadastro de material — a criacao, fora do handler HTTP.
 *
 * Ate a Etapa 8c o unico INSERT INTO materiais_almoxarifado de producao morava INLINE no handler
 * (routes/almoxarifado.js:454), junto com quatro efeitos que ninguem que so olha o INSERT enxerga:
 * a movimentacao de saldo inicial, a sincronizacao da linha de saldo por localizacao, a auditoria
 * e a releitura enriquecida com a familia. Qualquer outro caminho que precisasse criar material
 * teria de fazer uma requisicao HTTP para o proprio servidor, ou reimplementar os cinco passos —
 * e a Etapa 8c precisa exatamente disso (a tela cria o material-peca resultante da transformacao).
 *
 * O QUE ESTE SERVICO NAO FAZ: nao checa permissao. O gate e da ROTA
 * (requirePermission('criar_material')), como em todo o modulo — os caminhos internos que chamam
 * este servico ja passaram pelo gate DELES, e duplicar a checagem aqui recusaria chamadas
 * legitimas de servico para servico. Ver o mesmo desenho em thirdPartyService (o gate proprio
 * `remessar_terceiro` esta no servico porque ele NAO tem chamador interno; aqui tem).
 *
 * Os quatro helpers no topo eram closures do modulo de rota (capturavam `db`). Aqui recebem `db`
 * por parametro e a rota mantem wrappers de uma linha, para os outros usos dela nao mudarem —
 * refactor sem mudanca de comportamento e testado como tal
 * (tests/api/materialServiceCriacao.api.test.js compara a linha da rota com a do servico coluna
 * a coluna, em vez de uma lista de campos escolhida a dedo).
 */
const { dbRun, dbGet } = require('./db');
const { registrarAuditoriaDoAto } = require('./audit');
const stockService = require('./stockService');
const Q = require('./quantidade');
const { CAMPOS_LIDOS } = require('./camposLidos');

const erro = (msg, status = 400) => Object.assign(new Error(msg), { status });

/**
 * Etapa 178 (RN-178.01, I4): o CA do EPI. `ca_numero` aparado, vazio -> null. `ca_validade` AAAA-MM-DD (uma data que existe) ou
 * vazio -> null; o resto -> 400 'Validade do CA inválida'. `undefined` passa como undefined (o PUT preserva o gravado).
 */
function normalizarCaNumero(v) {
  if (v === undefined) return undefined;
  const s = v === null ? '' : String(v).trim();
  return s === '' ? null : s;
}
function normalizarCaValidade(v) {
  if (v === undefined) return undefined;
  const s = v === null ? '' : String(v).trim();
  if (s === '') return null;
  const ok = /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(`${s}T00:00:00Z`))
    && new Date(`${s}T00:00:00Z`).toISOString().slice(0, 10) === s;
  if (!ok) throw erro('Validade do CA inválida', 400);
  return s;
}

function bool01(v) { return v ? 1 : 0; }

/**
 * Etapa 100 (G10, RN-100.05) — a literal da recusa de SUBFAMILIA no lugar da familia. O material
 * grava `familia_id` = raiz e `subfamilia_id` = filha (Etapa 37); com a sub no `familia_id` a sub
 * conta e lista, a raiz nao, e o filtro de Materiais nao acha o item. Nenhuma tela manda isso — a
 * porta e a API (e os atalhos de Sobras/Remessas, que copiam a familia de um material de origem
 * LEGADO gravado assim).
 */
const FAMILIA_E_SUBFAMILIA = 'A família escolhida é uma subfamília — escolha a família principal e use a subfamília no campo Subfamília';

/**
 * So e chamada com valor NOVO de `familia_id`: no `createMaterial` e no `PUT` quando a familia MUDA
 * (`routes/almoxarifado.js`). Material LEGADO ja gravado com `familia_id = <sub>` continua editavel
 * enquanto o PUT omite ou repete o valor (B47) — a recusa nao alcanca o que ja esta no banco.
 * Ordem: nao existe -> subfamilia -> inativa.
 */
async function validateFamiliaAtiva(db, familiaId) {
  if (!familiaId) return null;
  const row = await dbGet(db, 'SELECT id, ativo, parent_id FROM familias_material_almoxarifado WHERE id = ?', [familiaId]);
  if (!row) throw new Error('Família não encontrada');
  if (row.parent_id !== null && row.parent_id !== undefined) throw new Error(FAMILIA_E_SUBFAMILIA);
  if (row.ativo !== 1) throw new Error('Família inativa — não é possível vincular novos itens');
  return row;
}

/**
 * Subfamilias (Etapa 2, Task 3): quando informada, a subfamilia do material precisa ser filha
 * (parent_id = familiaId) e ativa. familiaId pode ser null (familia omitida no PUT full-replace) —
 * nesse caso nenhuma subfamilia bate no WHERE e a validacao falha, que e o comportamento correto.
 */
async function validateSubfamilia(db, subfamiliaId, familiaId) {
  if (!subfamiliaId) return null;
  const row = await dbGet(db,
    'SELECT id FROM familias_material_almoxarifado WHERE id = ? AND parent_id = ? AND ativo = 1',
    [subfamiliaId, familiaId]);
  if (!row) throw new Error('Subfamília inválida para a família selecionada');
  return row;
}

/**
 * COPIA LITERAL das closures homonimas de routes/almoxarifado.js (:98-112). O plano da 8c trazia
 * uma versao REESCRITA destas duas funcoes (montava o caminho como
 * `parent.codigo + parent.descricao` e depois o primeiro nao-vazio de descricao/subgrupo/setor);
 * isso teria mudado o rotulo gravado na coluna `localizacao` de todo material criado pelo servico,
 * calado — e o guarda de refactor nao pegaria, porque o corpo de teste nao manda
 * `localizacao_padrao_id`. Refactor sem mudanca de comportamento significa a MESMA conta.
 */
function buildLocalizacaoPath(loc, parent) {
  if (!loc) return '';
  const parts = [];
  if (loc.setor) parts.push(loc.setor);
  if (parent) parts.push(parent.subgrupo || parent.descricao || parent.codigo);
  if (loc.subgrupo) parts.push(loc.subgrupo);
  else if (loc.descricao && !parent) parts.push(loc.descricao);
  return parts.join(' / ');
}

function formatLocalizacaoLabel(loc, parent) {
  if (!loc) return null;
  const path = buildLocalizacaoPath(loc, parent);
  return path ? `${loc.codigo} — ${path}` : loc.codigo;
}

/**
 * Resolve o par (id, rotulo formatado) de uma localizacao padrao a partir do FK — usado no cadastro
 * de materiais (POST/PUT). locId e null quando o FK nao foi informado; locText e null quando a
 * localizacao nao existe mais (FK orfao).
 */
/**
 * Etapa 54 (RN-05): a padrão escolhida no cadastro tem de existir e estar ativa. A entrada sem
 * destino cai nela — e o motor não recusa a padrão (só o destino informado), porque os fluxos sem
 * campo de destino travariam. A porta é aqui: `resolveLocalizacaoFromFk` aceitava qualquer id.
 */
async function validarLocalizacaoPadrao(db, localizacaoPadraoId) {
  const id = localizacaoPadraoId ? parseInt(localizacaoPadraoId, 10) : null;
  if (!id) return;
  const row = await dbGet(db, 'SELECT codigo, ativo FROM localizacoes_almoxarifado WHERE id = ?', [id]);
  if (!row) throw erro('Localização padrão não encontrada', 400);
  if (Number(row.ativo) !== 1) throw erro(`Localização padrão ${row.codigo} está inativa`, 400);
}

async function resolveLocalizacaoFromFk(db, localizacaoPadraoId) {
  const id = localizacaoPadraoId ? parseInt(localizacaoPadraoId, 10) : null;
  if (!id) return { locId: null, locText: null };
  const row = await dbGet(db,
    `SELECT l.id, l.codigo, l.descricao, l.setor, l.subgrupo, l.parent_id,
            p.codigo as parent_codigo, p.descricao as parent_descricao, p.subgrupo as parent_subgrupo
     FROM localizacoes_almoxarifado l
     LEFT JOIN localizacoes_almoxarifado p ON l.parent_id = p.id
     WHERE l.id = ?`, [id]);
  if (!row) return { locId: id, locText: null };
  const parent = row.parent_id ? {
    codigo: row.parent_codigo, descricao: row.parent_descricao, subgrupo: row.parent_subgrupo,
  } : null;
  return { locId: id, locText: formatLocalizacaoLabel(row, parent) };
}

/**
 * Proximo codigo da familia — pelo MAIOR NUMERO, nao pelo material de maior id.
 *
 * O que havia antes (routes/almoxarifado.js:697-739) era `ORDER BY id DESC LIMIT 1` + 1. Dois
 * defeitos: (1) cadastrar CHP-010 e depois CHP-002 fazia o gerador olhar CHP-002 (id maior) e
 * propor CHP-003, que ja podia existir; (2) em lote, N chamadas concorrentes devolvem o MESMO
 * numero — e a Etapa 8c pede N codigos de uma vez (uma chapa vira N pecas).
 *
 * O (1) se resolve aqui, com MAX. O (2) NAO se resolve aqui e nem tem como: esta funcao so LE.
 * Quem resolve e createMaterial, com retry sob UNIQUE quando `codigo_auto` esta ligado — a
 * colisao e detectada onde ela de fato acontece, no INSERT.
 *
 * GLOB '[0-9]*' alem do LIKE: sem ele, um codigo manual como 'CHP-ESPECIAL' entraria no CAST e
 * viraria 0 em silencio (SQLite nao lanca em CAST invalido), e um codigo 'CHP-12A' viraria 12 —
 * numeros que competiriam com os de verdade pelo MAX.
 */
async function proximoCodigo(db, familiaId) {
  if (familiaId) {
    const fam = await dbGet(db, 'SELECT codigo FROM familias_material_almoxarifado WHERE id = ?', [familiaId]);
    if (!fam) throw erro('Família não encontrada', 404);
    const prefix = fam.codigo;
    const row = await dbGet(db, `SELECT MAX(CAST(substr(codigo, ?) AS INTEGER)) AS maxnum
      FROM materiais_almoxarifado
      WHERE familia_id = ? AND codigo LIKE ? AND codigo GLOB ?`,
      [prefix.length + 2, familiaId, `${prefix}-%`, `${prefix}-[0-9]*`]);
    const prox = Number(row?.maxnum || 0) + 1;
    return `${prefix}-${String(prox).padStart(3, '0')}`;
  }
  const row = await dbGet(db, `SELECT MAX(CAST(substr(codigo, 5) AS INTEGER)) AS maxnum
    FROM materiais_almoxarifado WHERE codigo GLOB 'ALM-[0-9]*'`);
  const prox = Number(row?.maxnum || 0) + 1;
  return `ALM-${String(prox).padStart(3, '0')}`;
}

/**
 * Etapa 110 (C215) — o Saldo Inicial do cadastro.
 *
 * Ate a 110 o saldo digitado no cadastro virava uma linha 'Saldo inicial de cadastro' gravada com INSERT direto no livro,
 * fora do motor: sem trava, sem origem, sem as recusas de lote e serie da Entrada. E a Engenharia, que tem
 * `criar_material` e nao `movimentar`, criava material com saldo. Agora (RN-01..RN-05 do plano da Etapa 110):
 *  - a rota exige `movimentar` quando ha saldo (RN-01; a permissao e da rota, como o gate do cadastro);
 *  - material com lote, serie, inspecao obrigatoria ou de cliente NAO nasce com saldo (RN-02): a Entrada manual cobra
 *    lote e serie, que o cadastro nao informa; inspecao e documento do cliente so o Recebimento cobra (a Entrada manual
 *    nao — C219), entao o saldo inicial desses quatro e recusado e o usuario lanca a entrada pelo caminho certo;
 *  - o saldo permitido e uma ENTRADA do motor sobre o material gravado com 0 (RN-03), e se o motor falhar o material
 *    recem-criado e apagado (RN-04) — senao o usuario tentaria de novo e tomaria 'Código já existe'.
 * Descartado (B721): tirar o campo do cadastro (muda a tela e tira a implantacao rapida do material simples).
 */
const SALDO_INICIAL_MOTIVO = 'Saldo inicial de cadastro';

/** A quantidade do saldo inicial, arredondada como o motor arredonda (Etapa 96). 0 quando nao ha. */
function quantidadeSaldoInicial(data) {
  const n = Number(data && data.quantidade_atual);
  return Number.isFinite(n) && n > 0 ? Q.qtd(n) : 0;
}
const temSaldoInicial = (data) => quantidadeSaldoInicial(data) > 0;

/** Os motivos (ordem fixa) que impedem o saldo inicial; [] quando pode (RN-02). Nao le o banco. */
function motivosSaldoInicialRecusado(data) {
  const d = data || {};
  const motivos = [];
  if (d.controle_lote) motivos.push('tem controle por lote');
  if (d.controle_serie) motivos.push('tem controle por número de série');
  if (d.requer_inspecao) motivos.push('exige inspeção');
  if (d.proprietario_cliente_id) motivos.push('é de cliente');
  return motivos;
}

function mensagemSaldoInicialRecusado(codigo, motivos) {
  return `O material ${codigo} não pode nascer com saldo inicial: ${motivos.join(', ')}. `
    + 'Cadastre com saldo 0 e lance a entrada depois — em Movimentações (Entrada, com o lote e as séries) ou pelo '
    + 'Recebimento (inspeção e material de cliente).';
}

function mensagemSaldoInicialSemPermissao(perfil) {
  return `Cadastrar material com saldo inicial exige a permissão "movimentar" (seu perfil: ${perfil}) — `
    + 'o saldo inicial é uma entrada no estoque. Cadastre com saldo 0 e peça a quem movimenta o estoque para lançar a '
    + 'Entrada em Movimentações.';
}

/**
 * Etapa 110 (C218, B61 de Compras, RN-06/RN-07) — a condicao da familia DENTRO do comando que grava o material.
 *
 * O cadastro conferia a familia (`validateFamiliaAtiva`) e gravava o material em comandos separados, e o "Inativar"
 * da familia contava os materiais ativos e gravava `ativo = 0` tambem em comandos separados: disparados juntos, os dois
 * passavam (30 de 30 na Fase 0) e ficava familia inativa com material ativo — o estado que as duas regras proibem. Uma
 * conexao SQLite executa um comando inteiro antes ou depois do outro; com a condicao no proprio INSERT/UPDATE (aqui) e a
 * condicao inversa no UPDATE da familia (rotas de familia), um dos dois sempre ve o outro.
 * As MESMAS reguas de validateFamiliaAtiva (raiz, ativo = 1) e validateSubfamilia (filha da familia, ativa).
 * `opcoes.familia` / `opcoes.sub` dizem quais das duas entram (o PUT so poe as que ele valida).
 */
function condicaoFamiliaSql(familiaId, subfamiliaId, { familia = true, sub = true } = {}) {
  const partes = []; const params = [];
  if (familia && familiaId) {
    partes.push('EXISTS (SELECT 1 FROM familias_material_almoxarifado WHERE id = ? AND ativo = 1 AND parent_id IS NULL)');
    params.push(familiaId);
  }
  if (sub && subfamiliaId) {
    partes.push('EXISTS (SELECT 1 FROM familias_material_almoxarifado WHERE id = ? AND parent_id = ? AND ativo = 1)');
    params.push(subfamiliaId, familiaId);
  }
  return { sql: partes.length > 0 ? partes.join(' AND ') : '1 = 1', params };
}

/**
 * Etapa 123 (C216, RN-10..RN-12; B794) — o dono do material tem de existir em Clientes.
 *
 * O schema so exige inteiro positivo e a tela so oferece cadastrados, mas a API e porta propria: `POST` com 99999 gravava
 * 99999 (201) e o material aparecia como "cliente #99999" — selo de cliente, guardas de material de cliente ligadas e
 * nenhum cliente para cobrar ou devolver. So a EXISTENCIA (M1: cliente com razao social vazia existe; inativo e aceito,
 * o cadastro de Clientes e quem decide se ele ainda e atendido). Sem condicao no comando que grava (D2): nenhuma porta do
 * sistema apaga cliente, entao a conferencia nao tem corrida com quem tira o cliente. Dono vazio/null/0 = nosso, sem
 * conferir. Quem chama: createMaterial (abaixo) e o PUT /materiais/:id quando o dono MUDA para um id (rota).
 */
const normalizarDonoInformado = (v) => (Number(v) > 0 ? Number(v) : null);

async function clienteDonoExiste(db, clienteId) {
  const row = await dbGet(db, 'SELECT 1 AS ok FROM clientes WHERE id = ?', [clienteId]);
  return !!row;
}

function mensagemDonoInexistente(clienteId) {
  return `O cliente dono informado (#${clienteId}) não existe em Clientes — escolha um cliente cadastrado ou deixe o `
    + 'material como estoque próprio.';
}

/** Lanca 400 com a literal quando o dono informado e um id que nao esta em Clientes; vazio/null/0 passa sem ler. */
async function assertDonoExiste(db, donoInformado) {
  const id = normalizarDonoInformado(donoInformado);
  if (id === null) return null;
  if (!(await clienteDonoExiste(db, id))) throw erro(mensagemDonoInexistente(id), 400);
  return id;
}

/** E3 (RN-06): a familia mudou de novo depois da releitura — praticamente inalcancavel, mas nunca gravar nem mentir. */
const FAMILIA_MUDOU_NO_CADASTRO = 'A família do material mudou enquanto ele era cadastrado — nada foi gravado. Tente de novo.';

/** Quantas vezes createMaterial regera o codigo quando `codigo_auto` esta ligado. */
const TENTATIVAS_CODIGO_AUTO = 5;

/**
 * Cria o material. Mesmos cinco passos do handler de onde ele saiu, na MESMA ORDEM:
 *   1. valida familia e subfamilia   2. resolve a localizacao padrao (id + rotulo)
 *   3. INSERT                         4. movimentacao de saldo inicial (so se quantidade > 0)
 *   5. sync da linha de saldo por localizacao, auditoria, e releitura enriquecida com a familia
 *
 * `data.codigo_auto` (Etapa 8c, decisao 6): quando verdadeiro, `data.codigo` e SUGESTAO. Colisao
 * UNIQUE regera pelo proximoCodigo da familia e tenta de novo, ate TENTATIVAS_CODIGO_AUTO. Sem a
 * flag, colisao continua sendo 400 'Código já existe' — identico ao de hoje, e o formulario de
 * cadastro manual nao muda: quem digitou o codigo quer saber que ele ja existe, nao ganhar outro.
 */
async function createMaterial(db, user, data) {
  const {
    codigo, nome, descricao, categoria, unidade,
    quantidade_atual, quantidade_minima, quantidade_maxima,
    custo_unitario, fornecedor_principal, codigo_fornecedor,
    ncm, especificacoes, observacoes,
    descricao_tecnica, categoria_id, subcategoria_id, localizacao_padrao_id,
    fornecedor_id, proprietario_cliente_id, tipo_material, material_critico, controle_lote,
    controle_certificado, familia_id, subfamilia_id,
    fabricante, codigo_fabricante, peso_unitario, dimensoes, material_construtivo,
    norma, marca, modelo, aplicacao, ponto_reposicao, lote_economico,
    controle_serie, controle_validade, controle_corrida, requer_inspecao, requer_foto,
    classe_abc, unidade_compra, fator_conversao_compra, unidade_consumo, fator_conversao_consumo,
    codigo_auto, ca_numero, ca_validade,
  } = data;

  // Etapa 178 (I4): a validade do CA antes de tudo (recusa = nada gravado).
  const caValidade = normalizarCaValidade(ca_validade);

  // RN-02 (Etapa 110): antes da familia e de gravar.
  const saldoInicial = quantidadeSaldoInicial(data);
  if (saldoInicial > 0) {
    const motivos = motivosSaldoInicialRecusado(data);
    if (motivos.length > 0) throw erro(mensagemSaldoInicialRecusado(codigo, motivos), 400);
  }

  // Etapa 123 (C216, RN-10, RN-10c): o dono existe em Clientes — depois da recusa do saldo inicial (a de hoje vem primeiro)
  // e antes da familia (ordem saldo inicial -> dono -> familia, Fase 2, M2). Recusa = nada gravado.
  await assertDonoExiste(db, proprietario_cliente_id);

  try {
    await validateFamiliaAtiva(db, familia_id);
    await validateSubfamilia(db, subfamilia_id || null, familia_id);
  } catch (e) {
    throw erro(e.message, 400);
  }

  await validarLocalizacaoPadrao(db, localizacao_padrao_id);

  let locId; let locText;
  try {
    ({ locId, locText } = await resolveLocalizacaoFromFk(db, localizacao_padrao_id));
  } catch (e) {
    throw erro(e.message, 500);
  }

  const insertValues = {
    codigo, nome,
    descricao: descricao || null,
    categoria: categoria || 'OUTROS',
    unidade: unidade || 'UN',
    localizacao: locText,
    // RN-03 (Etapa 110): nasce com 0; o saldo inicial entra abaixo, pelo motor.
    quantidade_atual: 0,
    quantidade_minima: quantidade_minima || 0,
    quantidade_maxima: quantidade_maxima || 0,
    custo_unitario: custo_unitario || 0,
    fornecedor_principal: fornecedor_principal || null,
    codigo_fornecedor: codigo_fornecedor || null,
    ncm: ncm || null,
    especificacoes: especificacoes || null,
    observacoes: observacoes || null,
    descricao_tecnica: descricao_tecnica || null,
    categoria_id: categoria_id ?? null,
    subcategoria_id: subcategoria_id ?? null,
    localizacao_padrao_id: locId,
    fornecedor_id: fornecedor_id ?? null,
    // Etapa 8: NULL = material nosso. O select da secao "Propriedade" manda '' quando ninguem e
    // escolhido; `|| null` normaliza para o unico valor que significa "nosso" — 0 e '' NAO
    // significam nada aqui (as leituras de estoque proprio testam IS NULL).
    proprietario_cliente_id: proprietario_cliente_id || null,
    tipo_material: tipo_material || null,
    material_critico: bool01(material_critico),
    controle_lote: bool01(controle_lote),
    controle_certificado: bool01(controle_certificado),
    familia_id,
    subfamilia_id: subfamilia_id ?? null,
    fabricante: fabricante || null,
    codigo_fabricante: codigo_fabricante || null,
    peso_unitario: peso_unitario ?? null,
    dimensoes: dimensoes || null,
    material_construtivo: material_construtivo || null,
    norma: norma || null,
    marca: marca || null,
    modelo: modelo || null,
    aplicacao: aplicacao || null,
    ponto_reposicao: ponto_reposicao ?? null,
    lote_economico: lote_economico ?? null,
    controle_serie: bool01(controle_serie),
    controle_validade: bool01(controle_validade),
    controle_corrida: bool01(controle_corrida),
    requer_inspecao: bool01(requer_inspecao),
    requer_foto: bool01(requer_foto),
    classe_abc: classe_abc || null,
    unidade_compra: unidade_compra || null,
    fator_conversao_compra: fator_conversao_compra ?? null,
    unidade_consumo: unidade_consumo || null,
    fator_conversao_consumo: fator_conversao_consumo ?? null,
    ca_numero: normalizarCaNumero(ca_numero) ?? null,
    ca_validade: caValidade ?? null,
  };
  const insertColumns = Object.keys(insertValues);

  // Etapa 110 (RN-06): a condicao da familia vai em TODAS as tentativas. Sem linha do SELECT nao ha colisao de UNIQUE —
  // "nao gravou pela familia" nunca vira "Código já existe". Nao gravou -> rele (a literal de hoje); se a releitura passar
  // (desfeito na janela), tenta UMA vez mais sem gastar tentativa de codigo; nao gravou de novo -> E3.
  const condFamilia = condicaoFamiliaSql(familia_id, subfamilia_id || null);
  let id = null;
  let releuFamilia = false;
  const tentativas = codigo_auto ? TENTATIVAS_CODIGO_AUTO : 1;
  for (let i = 0; i < tentativas && id === null; i += 1) {
    try {
      const result = await dbRun(db, `INSERT INTO materiais_almoxarifado
        (${insertColumns.join(', ')})
        SELECT ${insertColumns.map(() => '?').join(',')}
        WHERE ${condFamilia.sql}`,
        [...insertColumns.map((c) => insertValues[c]), ...condFamilia.params]);
      if (result.changes === 1) { id = result.lastID; continue; }
      try {
        await validateFamiliaAtiva(db, familia_id);
        await validateSubfamilia(db, subfamilia_id || null, familia_id);
      } catch (eFam) {
        throw erro(eFam.message, 400);
      }
      if (releuFamilia) throw erro(FAMILIA_MUDOU_NO_CADASTRO, 409);
      releuFamilia = true;
      i -= 1;
    } catch (err) {
      if (err.status) throw err;
      if (!(err.message && err.message.includes('UNIQUE'))) throw erro(err.message, 500);
      // Regera SO quando a flag esta ligada, e SO se ainda ha tentativa pela frente. Sem ela, a
      // colisao e resposta ao usuario, nao acidente a contornar.
      if (codigo_auto && i + 1 < tentativas) insertValues.codigo = await proximoCodigo(db, familia_id);
    }
  }
  if (id === null) {
    throw erro(codigo_auto
      ? `Não foi possível gerar um código livre para a família após ${TENTATIVAS_CODIGO_AUTO} tentativas`
      : 'Código já existe', 400);
  }

  // Movimentacao inicial: SO com saldo. Gravar sempre sujaria o extrato de todo material
  // cadastrado sem saldo, e o extrato e a tela onde a Etapa 1 gastou uma etapa inteira.
  // Etapa 110 (RN-03/RN-04): pelo motor — a Entrada de verdade (trava, origem, saldo por localizacao, alerta, as recusas
  // de lote e serie). Destino = a localizacao padrao, quando ha (o livro registra onde entrou). Falhou -> o
  // material que acabou de nascer e apagado (nada o referencia ainda: a auditoria CRIACAO vem depois) e o erro do motor
  // sobe com o status dele.
  if (saldoInicial > 0) {
    try {
      await stockService.registrarMovimentacao(db, user, {
        material_id: id, tipo: 'ENTRADA', quantidade: saldoInicial, motivo: SALDO_INICIAL_MOTIVO,
        // Fase 2 (achado 1): o motor grava no livro o destino INFORMADO, nao o resolvido — sem isto a linha ficava
        // sem destino com o saldo na padrao. A padrao ja foi validada acima (existe e esta ativa).
        ...(locId ? { localizacao_destino_id: locId } : {}),
      }, { exigeLote: true, exigeSerie: true });
    } catch (eEntrada) {
      await dbRun(db, 'DELETE FROM estoque_saldo_almoxarifado WHERE material_id = ?', [id]).catch(() => null);
      await dbRun(db, 'DELETE FROM materiais_almoxarifado WHERE id = ?', [id]).catch((eDel) => {
        console.error('[almoxarifado] Falha ao desfazer o material sem saldo inicial:', eDel.message);
      });
      throw eEntrada;
    }
  }

  await stockService.syncSaldoLocalizacaoPadrao(db, id).catch((e) => {
    console.warn('[almoxarifado] Falha ao sincronizar saldo por localização:', e.message);
  });

  // Etapa 121 (C252, B784): o material e o saldo inicial ja estao gravados — a falha da Auditoria nao derruba o cadastro
  // (com codigo_auto, repetir criava outro material e outra Entrada)
  await registrarAuditoriaDoAto(db, {
    entidade: 'material', entidade_id: id, acao: 'CRIACAO',
    usuario_id: user.id, usuario_nome: user.nome || user.email,
    dados_novos: { codigo: insertValues.codigo, nome, familia_id },
  });

  return dbGet(db, `SELECT m.*, f.nome as familia_nome, f.codigo as familia_codigo
    FROM materiais_almoxarifado m
    LEFT JOIN familias_material_almoxarifado f ON m.familia_id = f.id
    WHERE m.id = ?`, [id]);
}

/**
 * Etapa 112 (C222, RN-01..RN-07) — ligar controle por lote ou por numero de serie num material com saldo nao identificado.
 *
 * Ligar o controle com saldo que nao tem lote (sobra "sem lote atribuido", a conta da tela de Lotes) ou com fisico
 * diferente das series presentes fazia a Saida manual, a transferencia e a devolucao cobrarem lote (e a Saida e a entrega
 * cobrarem series) de um saldo que nao tem — o saldo ficava preso (medido na Fase 0). A regularizacao existe e e do
 * Administrador (`ajustar_estoque`): series pela tela de Series (so com o controle ligado) e lote por Entrada com lote +
 * Ajuste do total. Por isso ligar nesse estado exige `ajustar_estoque` (B728). Descartado: recusar para todos e mandar
 * zerar o saldo (a Saida de zerar e consumo ficticio; material de cliente so sai pela OS do dono; e a regularizacao de
 * series exige o controle ja ligado). `requer_inspecao` fica de fora: nenhum fluxo de saida le a coluna (RN-05).
 */
const EPS_CONTROLE = 1e-9;
const STATUS_SERIE_PRESENTE_SQL = "('EM_ESTOQUE','BLOQUEADA')";
const r6 = (v) => Math.round((Number(v) || 0) * 1e6) / 1e6;

/** Os controles que o PUT LIGA: 0 -> 1, o gravado tambem lido como 0/1. `merged` ja passou pelo bool01. */
function controlesLigados(gravado, merged) {
  const ligados = [];
  if (Number(merged.controle_lote) === 1 && Number(gravado.controle_lote || 0) !== 1) ligados.push('lote');
  if (Number(merged.controle_serie) === 1 && Number(gravado.controle_serie || 0) !== 1) ligados.push('serie');
  return ligados;
}

/** SQL (correlacionado com materiais_almoxarifado) da sobra sem lote — a mesma conta de lotService.resumoLotesDoMaterial. */
const SOMA_LOTES_SQL = `(SELECT COALESCE(SUM(s.quantidade), 0) FROM estoque_saldo_almoxarifado s
  JOIN lotes_almoxarifado l ON l.id = s.lote_id WHERE s.material_id = materiais_almoxarifado.id)`;
const PRESENTES_SQL = `(SELECT COUNT(*) FROM series_almoxarifado sr WHERE sr.material_id = materiais_almoxarifado.id
  AND sr.status IN ${STATUS_SERIE_PRESENTE_SQL})`;

/**
 * O que o saldo tem de nao identificado para os controles que o PUT liga: [] quando nada prende; senao as partes
 * ("há 5 sem lote atribuído", "o físico é 3 e há 0 série(s) em estoque"), na ordem lote, serie.
 */
async function saldoNaoIdentificado(db, materialId, ligados) {
  if (!ligados.length) return [];
  const row = await dbGet(db, `SELECT quantidade_atual AS fisico, ${SOMA_LOTES_SQL} AS soma_lotes, ${PRESENTES_SQL} AS presentes
    FROM materiais_almoxarifado WHERE id = ?`, [materialId]);
  if (!row) return [];
  const partes = [];
  if (ligados.includes('lote')) {
    const sobra = r6(Number(row.fisico || 0) - Number(row.soma_lotes || 0));
    if (Math.abs(sobra) > EPS_CONTROLE) partes.push(`há ${String(sobra)} sem lote atribuído`);
  }
  if (ligados.includes('serie')) {
    const fisico = r6(row.fisico);
    const presentes = Number(row.presentes || 0);
    if (Math.abs(fisico - presentes) > EPS_CONTROLE) {
      partes.push(`o físico é ${String(fisico)} e há ${presentes} série(s) em estoque`);
    }
  }
  return partes;
}

const NOMES_CONTROLE = { lote: 'por lote', serie: 'por número de série', ambos: 'por lote e por número de série' };

function mensagemControleSemPermissao(codigo, ligados, partes, perfil) {
  const nomes = NOMES_CONTROLE[ligados.length > 1 ? 'ambos' : ligados[0]];
  return `Ligar o controle ${nomes} no material ${codigo} exige a permissão "ajustar_estoque" (seu perfil: ${perfil}): `
    + `${partes.join('; ')}. Depois de ligar, a saída desse saldo é recusada até ele ser regularizado, e regularizar é do `
    + 'Administrador do almoxarifado. Peça a ele para ligar o controle e regularizar o saldo.';
}

/** RN-06: a mesma regua, para o WHERE do UPDATE de quem nao pode regularizar. */
function condicaoSaldoIdentificadoSql(ligados) {
  const partes = [];
  if (ligados.includes('lote')) partes.push(`ABS(ROUND(COALESCE(quantidade_atual, 0) - ${SOMA_LOTES_SQL}, 6)) <= ${EPS_CONTROLE}`);
  if (ligados.includes('serie')) partes.push(`ABS(ROUND(COALESCE(quantidade_atual, 0), 6) - ${PRESENTES_SQL}) <= ${EPS_CONTROLE}`);
  return partes.length ? partes.join(' AND ') : '1 = 1';
}

/**
 * Etapa 115 (C226, RN-01) — o PUT muda algum controle (lote ou serie, ligando OU desligando), os dois lados lidos como
 * 0/1. O motor le os dois controles e grava o saldo/as series DENTRO da trava do material (Etapa 97); o salvar que muda
 * controle grava sob a mesma trava, senao uma Entrada que ja leu o controle velho grava depois do salvar.
 */
function mudaControle(gravado, merged) {
  const b = (v) => (Number(v) === 1 ? 1 : 0);
  return ['controle_lote', 'controle_serie'].some((c) => b(gravado[c]) !== b(merged[c]));
}

/** Etapa 115 (C225, RN-03): o PUT desliga a serie (1 -> 0, comparado com o GRAVADO). */
function desligaSerie(gravado, merged) {
  return Number(gravado.controle_serie || 0) === 1 && Number(merged.controle_serie) !== 1;
}

/** RN-03: as series presentes (EM_ESTOQUE + BLOQUEADA, a contagem da regularizacao) e o fisico, numa leitura so. */
async function seriesPresentes(db, materialId) {
  const r = await dbGet(db, `SELECT quantidade_atual AS fisico, ${PRESENTES_SQL} AS presentes
    FROM materiais_almoxarifado WHERE id = ?`, [materialId]);
  return { presentes: Number(r && r.presentes) || 0, fisico: r6(r && r.fisico) };
}

/** RN-06: a mesma regua no WHERE do UPDATE de quem nao pode regularizar (tabela sem apelido). */
const SEM_SERIE_PRESENTE_SQL = `${PRESENTES_SQL} = 0`;

/**
 * Etapa 193 Fase 5 (R1): desligar lote ou serie PELA PORTA DO COMPRAS em material que ja tem lote/serie registrado e recusado
 * (400). Com a chave `ALMOX_CADASTRO_MATERIAL` desligada (o padrao), o Compras e a unica porta do cadastro e roda no perfil
 * COMPRAS, que nunca religa um controle sobre saldo nao identificado (Etapa 112, `ajustar_estoque`). Desligar a serie de um
 * material cujas series sairam todas (0 presentes, a guarda da 115 deixa) e receber depois uma Entrada sem serie deixava o
 * estorno da saida antiga e a exclusao da requisicao pedindo "Religue o controle..." — e ninguem conseguia religar. O lote nao
 * trava estorno, mas a mesma porta nunca o religava depois de uma Entrada sem lote. Historico = qualquer linha em
 * `series_almoxarifado` / `lotes_almoxarifado` do material (essas linhas nao se apagam: so o desfazer de uma insercao que
 * falhou). Ligar continua livre sem saldo (RN-193.06). Descartado: deixar o Compras religar com saldo nao identificado (seria
 * o `ajustar_estoque` por uma porta que nao movimenta estoque) e recusar so com Entrada posterior (a Entrada vem depois do
 * desligar e ninguem a confere contra o cadastro).
 */
function controlesDesligados(gravado, merged) {
  const desligados = [];
  if (Number(gravado.controle_lote || 0) === 1 && Number(merged.controle_lote) !== 1) desligados.push('lote');
  if (Number(gravado.controle_serie || 0) === 1 && Number(merged.controle_serie) !== 1) desligados.push('serie');
  return desligados;
}
const HISTORICO_CONTROLE_SQL = {
  lote: 'EXISTS (SELECT 1 FROM lotes_almoxarifado hl WHERE hl.material_id = materiais_almoxarifado.id)',
  serie: 'EXISTS (SELECT 1 FROM series_almoxarifado hs WHERE hs.material_id = materiais_almoxarifado.id)',
};
/** RN da Fase 5 (R1): no WHERE do UPDATE — o desligar so grava se o historico ainda nao existe. */
function condicaoSemHistoricoSql(controles) {
  return controles.map((c) => `NOT ${HISTORICO_CONTROLE_SQL[c]}`).join(' AND ');
}
async function controlesComHistorico(db, materialId, controles) {
  if (controles.length === 0) return [];
  const r = await dbGet(db, `SELECT ${controles.map((c) => `${HISTORICO_CONTROLE_SQL[c]} AS ${c}`).join(', ')}
    FROM materiais_almoxarifado WHERE id = ?`, [materialId]);
  return controles.filter((c) => r && Number(r[c]) === 1);
}
function mensagemDesligarControleComHistorico(codigo, controles) {
  const partes = [];
  if (controles.includes('serie')) {
    partes.push(`Não é possível desligar o controle por número de série do material ${codigo}: ele já tem séries registradas. `
      + 'Desligado, o estorno das saídas e a exclusão das requisições que baixaram essas séries ficariam travados, e pelo '
      + 'Compras não há como religar o controle depois que o material recebe saldo sem série. O controle continua ligado.');
  }
  if (controles.includes('lote')) {
    partes.push(`Não é possível desligar o controle por lote do material ${codigo}: ele já tem lotes registrados. Desligado, `
      + 'as entradas sem lote impediriam religar o controle pelo Compras. O controle continua ligado.');
  }
  return partes.join(' ');
}

/**
 * E1 da Etapa 115 (contrato congelado no plano, com as variantes da Fase 2, R1). Desligar a serie com series presentes
 * deixa-as orfas: a saida sem serie baixa o fisico e nao baixa as series, e a regularizacao de series exige o controle
 * ligado (B745). Quando ha mais series que fisico, as que sobram ja sao orfas e o caminho e outro: o Administrador baixa
 * as ausentes na regularizacao (no maximo `floor(presentes - fisico)`, a regua de regularizarSeries).
 *   - E1a (nenhuma a baixar): pedir ao Administrador que desligue;
 *   - E1b (todas a baixar — fisico <= 0): pedir que as baixe; sem serie presente, desligar e livre (RN-05);
 *   - E1c (algumas): pedir que baixe as ausentes e desligue.
 */
function mensagemDesligarSerieSemPermissao(codigo, { presentes, fisico }, perfil) {
  const inicio = `Desligar o controle por número de série no material ${codigo} exige a permissão "ajustar_estoque" `
    + `(seu perfil: ${perfil}): há ${presentes} série(s) em estoque`;
  const ausentes = Math.min(presentes, Math.max(0, Math.floor(presentes - fisico + 1e-9)));
  const caminho = 'Lotes e Séries → Séries → Regularizar séries';
  if (ausentes === 0) {
    return `${inicio}. Depois de desligar, a saída não baixa essas séries, e elas continuam "Em estoque" depois que o `
      + 'material sai. Peça ao Administrador do almoxarifado para desligar o controle.';
  }
  const fis = ` e o físico é ${String(fisico === 0 ? 0 : fisico)}`;
  if (ausentes === presentes) {
    return `${inicio}${fis}. Peça ao Administrador do almoxarifado para baixá-las em ${caminho}; sem série em estoque, `
      + 'o controle pode ser desligado.';
  }
  return `${inicio}${fis}. Peça ao Administrador do almoxarifado para baixar as ${ausentes} que não estão mais no `
    + `estoque (${caminho}) e para desligar o controle.`;
}

/**
 * Etapa 116 (C233, RN-01/RN-02) — os controles que o salvar DESFARIA: lido (o que o formulario mostrava ao abrir) diferente
 * do gravado (outra pessoa mudou depois) E o salvar grava nele um valor diferente do gravado. Lido diferente mas gravando o
 * mesmo do gravado (marcou igual, ou a chave veio omitida) nao desfaz nada. Chave ausente em `lidos` nao e comparada
 * (RN-03). Devolve `['lote'|'serie']`, na ordem lote, serie.
 */
function controlesDesfeitos(lidos, gravado, merged) {
  if (!lidos || typeof lidos !== 'object') return [];
  const b = (v) => (Number(v) === 1 || v === true ? 1 : 0);
  const desfeitos = [];
  for (const [col, nome] of [['controle_lote', 'lote'], ['controle_serie', 'serie']]) {
    if (lidos[col] === undefined) continue;
    if (b(lidos[col]) !== b(gravado[col]) && b(merged[col]) !== b(gravado[col])) desfeitos.push(nome);
  }
  return desfeitos;
}

/** E1 da Etapa 116 (409, contrato congelado no plano). `gravado` diz o verbo quando e um controle so. */
function mensagemControleMudadoPorOutro(codigo, desfeitos, gravado) {
  const NOMES = { lote: 'lote', serie: 'número de série' };
  const nomes = desfeitos.map((d) => NOMES[d]).join(' e por ');
  let verbo = 'mudado';
  if (desfeitos.length === 1) {
    const col = desfeitos[0] === 'lote' ? 'controle_lote' : 'controle_serie';
    verbo = Number(gravado[col]) === 1 ? 'ligado' : 'desligado';
  }
  return `O controle por ${nomes} do material ${codigo} foi ${verbo} por outra pessoa depois que você abriu o cadastro — `
    + 'salvar desfaria essa mudança, e nada foi gravado. Recarregue o material e salve de novo.';
}

/**
 * Etapa 124 (D (123), RN-01..RN-03; B800) — o par familia/subfamilia que o salvar DESFARIA: o molde de `controlesDesfeitos`.
 * Para cada coluna presente em `lida` (o que o formulario mostrava ao abrir): lido diferente do gravado (outra pessoa mudou
 * depois) E o salvar grava nela um valor diferente do gravado. Devolve `'familia'` (a familia vence), `'subfamilia'` ou
 * `null`. Chave ausente em `lida` nao e comparada; `null` e "sem subfamilia".
 */
function familiaDesfeita(lida, gravado, merged) {
  if (!lida || typeof lida !== 'object') return null;
  const n = (v) => (v === null || v === undefined || v === '' || !Number(v) ? null : Number(v));
  for (const [col, nome] of [['familia_id', 'familia'], ['subfamilia_id', 'subfamilia']]) {
    if (lida[col] === undefined) continue;
    if (n(lida[col]) !== n(gravado[col]) && n(merged[col]) !== n(gravado[col])) return nome;
  }
  return null;
}

/** E1f/E1s da Etapa 124 (409, contrato congelado no plano). `codigo` e o gravado. */
function mensagemFamiliaMudadaPorOutro(codigo, qual) {
  return `A ${qual === 'familia' ? 'família' : 'subfamília'} do material ${codigo} foi mudada por outra pessoa depois que você `
    + 'abriu o cadastro — salvar desfaria essa mudança, e nada foi gravado. Recarregue o material e salve de novo.';
}

/**
 * Etapa 125 (D (124), RN-01..RN-05; B805, B806) — os outros campos que o salvar DESFARIA: o molde de `controlesDesfeitos` e
 * `familiaDesfeita`, coluna a coluna da lista congelada (camposLidos.js). Para cada coluna presente em `lidos`: lido diferente do
 * gravado (outra pessoa — ou o recebimento, no custo — mudou depois) E o salvar grava nela um valor diferente do gravado.
 * Comparacao NORMALIZADA dos dois lados: o lido vem cru do GET (so difere do gravado quando alguem mudou); a normalizacao protege o
 * "gravaria" (o formulario manda '' para texto vazio, numeros como texto, 'UN' para unidade vazia). Devolve os rotulos, na ordem
 * da tela, sem repetir (a unidade de compra e a quantidade por compra sao o mesmo "Como é comprado").
 */
function camposDesfeitos(lidos, gravado, merged) {
  if (!lidos || typeof lidos !== 'object') return [];
  const rotulos = [];
  for (const [col, rotulo, tipo] of CAMPOS_LIDOS) {
    if (lidos[col] === undefined) continue;
    const n = NORMALIZA_CAMPO[tipo];
    if (!Object.is(n(lidos[col]), n(gravado[col])) && !Object.is(n(merged[col]), n(gravado[col])) && !rotulos.includes(rotulo)) {
      rotulos.push(rotulo);
    }
  }
  return rotulos;
}

const vazioLido = (v) => v === null || v === undefined || v === '';
const NORMALIZA_CAMPO = {
  texto: (v) => (vazioLido(v) ? '' : String(v)),
  // Fase 2 (M2): o lido nao numerico (NaN nunca e igual a NaN) compara como texto.
  numero: (v) => { if (vazioLido(v)) return null; const x = Number(v); return Number.isNaN(x) ? String(v) : x; },
  numero0: (v) => { if (vazioLido(v)) return 0; const x = Number(v); return Number.isNaN(x) ? String(v) : x; },
  id: (v) => (vazioLido(v) || !Number(v) ? null : Number(v)),
  caixa: (v) => (Number(v) === 1 || v === true ? 1 : 0),
};

/** E1 da Etapa 125 (409, contrato congelado no plano). Singular/plural depois de juntar os rotulos (Fase 2, M3). */
function mensagemCamposMudadosPorOutro(codigo, rotulos) {
  const q = rotulos.map((r) => `"${r}"`);
  const meio = ' por outra pessoa depois que você abriu o cadastro — salvar desfaria ';
  if (q.length === 1) {
    return `O campo ${q[0]} do material ${codigo} foi mudado${meio}essa mudança, e nada foi gravado. `
      + 'Recarregue o material e salve de novo.';
  }
  return `Os campos ${q.slice(0, -1).join(', ')} e ${q[q.length - 1]} do material ${codigo} foram mudados${meio}`
    + 'essas mudanças, e nada foi gravado. Recarregue o material e salve de novo.';
}

/**
 * Etapa 113 (C217, C227, RN-01..RN-04) — inativar material com saldo prende o saldo: o motor recusa movimentar material
 * inativo e nenhuma tela reativa. Por isso inativar exige o fisico e as quatro retencoes zerados (6 casas), para TODOS
 * (B733: o padrao "so quem regulariza" da 112 nao serve — quem regulariza tambem ficaria preso).
 */
const COLUNAS_INATIVAR = [
  ['quantidade_atual', null],
  ['quantidade_reservada', 'reservado'],
  ['quantidade_bloqueada', 'bloqueado'],
  ['quantidade_em_inspecao', 'em inspeção'],
  ['quantidade_em_terceiros', 'em terceiros'],
];
/** A coluna do material que LE as cinco, para a leitura previa e a releitura. */
const COLUNAS_INATIVAR_SQL = COLUNAS_INATIVAR.map(([c]) => c).join(', ');
/** RN-04: a mesma regua no WHERE do UPDATE que inativa. */
const SEM_SALDO_SQL = COLUNAS_INATIVAR.map(([c]) => `ROUND(COALESCE(${c}, 0), 6) = 0`).join(' AND ');

/**
 * `null` quando inativar e livre; senao `{ fisico, retidos: [[rotulo, q]], cliente }`. `row` e uma linha de
 * materiais_almoxarifado com as cinco colunas e `proprietario_cliente_id`.
 */
function saldoQuePrendeInativacao(row) {
  if (!row) return null;
  const fisico = r6(row.quantidade_atual);
  const retidos = [];
  for (const [col, rotulo] of COLUNAS_INATIVAR) {
    if (!rotulo) continue;
    const q = r6(row[col]);
    if (Math.abs(q) > EPS_CONTROLE) retidos.push([rotulo, q]);
  }
  if (Math.abs(fisico) <= EPS_CONTROLE && retidos.length === 0) return null;
  return { fisico: fisico === 0 ? 0 : fisico, retidos, cliente: Number(row.proprietario_cliente_id) > 0 };
}

/**
 * E1 da Etapa 113 (contrato congelado no plano, com as variantes da Fase 2: R3 fisico negativo, R7 so retencao, R4 perfil
 * que nao movimenta). `opcoes.podeMovimentar` / `opcoes.perfil` vem da rota (o servico nao checa permissao).
 */
function mensagemInativarComSaldo(codigo, preso, { podeMovimentar = true, perfil = '' } = {}) {
  const retidos = preso.retidos.length ? ` (${preso.retidos.map(([r, q]) => `${r} ${String(q)}`).join(', ')})` : '';
  let zerar;
  if (preso.fisico < 0) zerar = 'zere o saldo com uma Entrada ou um Ajuste.';
  else if (preso.cliente) zerar = 'devolva o saldo ao cliente ("Devolver ao cliente", em Materiais de Clientes).';
  else zerar = 'zere o saldo com uma Saída ou um Ajuste.';
  let caminho;
  if (preso.retidos.length && preso.fisico !== 0) caminho = `Libere primeiro o que está retido e, depois, ${zerar}`;
  else if (preso.retidos.length) caminho = 'Libere o que está retido antes de inativar.';
  else caminho = `Antes de inativar, ${zerar}`;
  const quem = podeMovimentar ? '' : ` Seu perfil (${perfil}) não movimenta estoque: peça isso ao almoxarifado.`;
  return `Não é possível inativar o material ${codigo}: o saldo físico é ${String(preso.fisico)}${retidos}. Material inativo `
    + `não pode ser movimentado, então esse saldo ficaria preso. ${caminho}${quem}`;
}

module.exports = {
  COLUNAS_INATIVAR_SQL, SEM_SALDO_SQL, saldoQuePrendeInativacao, mensagemInativarComSaldo,
  FAMILIA_E_SUBFAMILIA,
  normalizarCaNumero, normalizarCaValidade,
  bool01, validateFamiliaAtiva, validateSubfamilia, resolveLocalizacaoFromFk, validarLocalizacaoPadrao,
  proximoCodigo, createMaterial, TENTATIVAS_CODIGO_AUTO,
  condicaoFamiliaSql, FAMILIA_MUDOU_NO_CADASTRO,
  clienteDonoExiste, mensagemDonoInexistente, assertDonoExiste,
  SALDO_INICIAL_MOTIVO, quantidadeSaldoInicial, temSaldoInicial, motivosSaldoInicialRecusado,
  mensagemSaldoInicialRecusado, mensagemSaldoInicialSemPermissao,
  controlesLigados, saldoNaoIdentificado, mensagemControleSemPermissao, condicaoSaldoIdentificadoSql,
  mudaControle, desligaSerie, seriesPresentes, SEM_SERIE_PRESENTE_SQL, mensagemDesligarSerieSemPermissao,
  controlesDesligados, controlesComHistorico, condicaoSemHistoricoSql, mensagemDesligarControleComHistorico,
  controlesDesfeitos, mensagemControleMudadoPorOutro,
  familiaDesfeita, mensagemFamiliaMudadaPorOutro,
  camposDesfeitos, mensagemCamposMudadosPorOutro,
};
