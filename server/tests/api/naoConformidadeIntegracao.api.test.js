/**
 * Etapa 43, T6 — INTEGRACAO: as cinco tasks compondo, pelas ROTAS HTTP reais.
 *
 * Plano:  docs/superpowers/plans/2026-09-28-almoxarifado-etapa43-nao-conformidade-numerada.md (T6)
 * Design: docs/superpowers/specs/2026-09-28-almoxarifado-etapa43-nao-conformidade-numerada-design.md
 *         (D4, D6, D8, D9 / RN-01..RN-11)
 *
 * ── POR QUE ESTE ARQUIVO EXISTE ──────────────────────────────────────────────────────────────
 * Verde por unidade nao prova que as partes COMPOEM. Nesta base ja houve etapa com 12 cenarios de
 * unidade verdes e a feature MORTA em producao, porque a fiacao entre as camadas estava quebrada.
 * T1 (servico), T2 (rotas), T3 (ganchos), T4 (alerta) e T5 (tela) foram medidas separadamente;
 * aqui tudo entra pela porta HTTP, na ordem em que o usuario clica, e o que se mede e o CRUZAMENTO:
 *
 *   1. (1) o modal fiscal (T3) -> o documento na listagem e no detalhe (T2)
 *   2. (2) o MESMO fato nos DOIS cartoes da central (T4) na MESMA resposta de
 *          `GET /alertas/central` — a exclusao do D6 vista PELA ROTA, que e o cruzamento T3<->T4
 *          que nenhum teste de unidade faz (o da T4 chama `montarCentral` direto, sem o gate)
 *   3. (3) decidir com perfil QUALIDADE (T2) tira a NC do cartao (T4) SEM gancho nenhum, e a
 *          trilha (T1) sai pela rota de auditoria com os rotulos da T2
 *   4. (4) UM documento passando por DOIS perfis: COMPRAS abre, COMPRAS nao decide, QUALIDADE
 *          decide — a matriz do D8 exercida pela ROTA, no mesmo papel, e nao por `can()`
 *   5. (5) a inspecao: prioridade do D9 + derivacao da RN-07 no MESMO ato, e o filtro `?origem`
 *          separando as duas origens na MESMA listagem
 *   6. (6) Etapa 42 + Etapa 43 no MESMO recebimento: o pedido fecha e a NC nasce, e a NC aberta
 *          NAO trava a entrada no estoque (item 5 de "o que esta etapa NAO faz")
 *
 * ── O QUE ESTE ARQUIVO NAO REPETE ────────────────────────────────────────────────────────────
 * `naoConformidadeGanchos` (T3) ja cobre RN-04/05/08/10/11, o gancho que explode e a flag
 * derivada; `alertaNaoConformidade` (T4) ja cobre a janela de dias, o dedupe, o corpo do e-mail e
 * o opt-in de `listarDivergenciasRecebimento`; `naoConformidadeRotas` (T2) ja cobre as literais de
 * erro e as duas matrizes inteiras. Aqui nao se mede nenhuma dessas coisas de novo: mede-se o que
 * so aparece quando elas correm JUNTAS, pela rota.
 *
 * ── GUARDA ANTI-TESTE-VAZIO (a base ja teve quatro) ──────────────────────────────────────────
 * Todo cenario que afirma AUSENCIA afirma, no mesmo cenario, o que TEM de estar la — uma central
 * vazia, um gate quebrado ou um `listar` que devolve `[]` passariam em todos os "nao aparece":
 *   - (2) o item SEM NC (o estado que o gancho nao fatal deixa quando explode) TEM de continuar
 *         no cartao da divergencia, e a central TEM de trazer 14 cartoes sem nenhum `erro`;
 *   - (2) a NC de hoje nao aparece, mas a MESMA NC envelhecida aparece na chamada seguinte;
 *   - (3) a NC decidida sai do cartao, e o item sem documento continua nele;
 *   - (4) o 403 de COMPRAS so e prova porque o 200 de QUALIDADE, no MESMO documento, esta no
 *         mesmo cenario — `can()` devolve `false` para acao que nao existe;
 *   - (5) `?origem=INSPECAO` traz a NC da inspecao E NAO traz a do recebimento, e o inverso
 *         tambem e afirmado (um filtro que sempre devolve vazio passaria em metade disso).
 * Nada aqui conta ocorrencia de string: tudo e status HTTP, campo do corpo ou linha do banco.
 *
 * ── OS DOIS CONTROLES POSITIVOS (rodados, nao prometidos) ────────────────────────────────────
 *   1. `excluirComNC: true` -> `false` em `alertRegistry.js` (a entrada DIVERGENCIA_RECEBIMENTO)
 *      -> cai (2) em "o item ... virou <NC-…> e NAO podia continuar no cartao DIVERGENCIA_RECEBIMENTO".
 *   2. prioridade do D9 invertida (`certificado_ausente` acima de `dano_fisico` em
 *      `nonConformityService.PRIORIDADE_TIPO_INSPECAO`) -> cai (5) em "a prioridade do D9 poe
 *      DANO_FISICO acima de CERTIFICADO_AUSENTE; veio CERTIFICADO_AUSENTE".
 *
 * ── ACHADO DE COMPOSICAO, MEDIDO AQUI E NAO CONSERTADO ───────────────────────────────────────
 * Quem decide a NC e QUALIDADE (D8, `decidir_nao_conformidade`), e QUALIDADE **nao tem
 * `ver_alertas`** (`permissions.js:149`) — ou seja, o unico perfil nao-admin que pode decidir e o
 * unico que NAO enxerga o cartao `NAO_CONFORMIDADE_ABERTA` que cobra a decisao. O cenario (3)
 * afirma esse 403 de proposito, para que o dia em que a central passar a filtrar por perfil este
 * arquivo fique vermelho e alguem leia AQUI por que. Consequencia ja declarada em
 * `permissions.js:92-99` para os quatro alertas de qualidade; a 14a entrada e a quinta, e e a
 * primeira cuja ACAO pertence justamente a quem nao ve o cartao.
 *
 * Executar: cd server && node tests/api/naoConformidadeIntegracao.api.test.js
 */
const assert = require('assert');
const request = require('supertest');
const { createTestApp } = require('../helpers/testApp');
const { dbRun, dbGet, dbAll } = require('../../services/almoxarifado/db');

let passed = 0; let failed = 0;
function test(name, fn) {
  return fn().then(() => { passed++; console.log(`  ✓ ${name}`); })
    .catch((e) => { failed++; console.error(`  ✗ ${name}: ${e.message}`); });
}

// Ids altos e proprios deste arquivo (convencao de `minhasPermissoes.api.test.js`): nenhum id de
// fixture `1`, e os ids de recebimento/item/NC sao SEMPRE lidos da resposta ou do banco.
const ADMIN = { id: 430, nome: 'Admin E43 T6', role: 'admin', is_superadmin: 1, email: 'admin43t6@test.com' };
const COMPRAS = { id: 432, nome: 'Comprador E43 T6', role: 'usuario', perfil_almoxarifado: 'COMPRAS' };
const QUALIDADE = { id: 433, nome: 'Qualidade E43 T6', role: 'usuario', perfil_almoxarifado: 'QUALIDADE' };

const EVENTO_NC = 'NAO_CONFORMIDADE_ABERTA';
const EVENTO_DIV = 'DIVERGENCIA_RECEBIMENTO';

(async () => {
  console.log('\n=== Etapa 43 T6: integracao da nao conformidade, pelas rotas HTTP ===\n');
  const { app, db, setUser, close } = await createTestApp({ user: { ...ADMIN } });

  const fornecedor = (await dbRun(db, `INSERT INTO fornecedores (razao_social, cnpj, status)
    VALUES ('Acos Integra E43','43.430.430/0001-43','ativo')`)).lastID;

  let seq = 0;
  async function novoMaterial({ critico = false } = {}) {
    seq += 1;
    const codigo = `NCI-${String(seq).padStart(3, '0')}`;
    const r = await dbRun(db, `INSERT INTO materiais_almoxarifado
      (codigo, nome, unidade, quantidade_atual, ativo, material_critico)
      VALUES (?,?,'KG',0,1,?)`, [codigo, `Chapa integracao NC ${seq}`, critico ? 1 : 0]);
    return { id: r.lastID, codigo };
  }

  const setConfig = (chave, valor) => dbRun(db,
    `INSERT INTO configuracoes_almoxarifado (chave, valor) VALUES (?,?)
     ON CONFLICT(chave) DO UPDATE SET valor = excluded.valor`, [chave, valor]);

  // ── As portas HTTP, sem nenhuma chamada direta a servico ────────────────────────────────────
  const criarRecebimento = (body) => request(app).post('/api/almoxarifado/recebimentos').send(body);
  const workflow = (recId, acao) => request(app)
    .post(`/api/almoxarifado/recebimentos/${recId}/workflow`).send({ acao });
  const conferir = (recId, itens) => request(app)
    .put(`/api/almoxarifado/recebimentos/${recId}/conferir`).send({ itens });
  const aprovar = (recId) => request(app).post(`/api/almoxarifado/recebimentos/${recId}/aprovar`).send({});
  const inspecionar = (itemId, body) => request(app)
    .post(`/api/almoxarifado/recebimentos/itens/${itemId}/inspecionar`).send(body);
  const listarNc = (qs = '') => request(app).get(`/api/almoxarifado/nao-conformidades${qs}`);
  const obterNc = (id) => request(app).get(`/api/almoxarifado/nao-conformidades/${id}`);
  const abrirNc = (body) => request(app).post('/api/almoxarifado/nao-conformidades').send(body);
  const decidirNc = (id, body) => request(app)
    .post(`/api/almoxarifado/nao-conformidades/${id}/decidir`).send(body);
  const central = () => request(app).get('/api/almoxarifado/alertas/central');
  const trilhaDaNc = (id) => request(app)
    .get(`/api/almoxarifado/auditoria?entidade=nao_conformidade&entidade_id=${id}`);

  /** Um recebimento pela rota, com N itens de 10 (cada um com material proprio). */
  async function recebimentoDeDez(quantidades = [10]) {
    const materiais = [];
    for (const _ of quantidades) materiais.push(await novoMaterial());
    seq += 1;
    const res = await criarRecebimento({
      tipo_recebimento: 'NOTA_FISCAL', nota_fiscal: `NF-NCI-${seq}`,
      fornecedor_id: fornecedor, fornecedor_nome: 'Acos Integra E43',
      itens: quantidades.map((q, i) => ({ material_id: materiais[i].id, quantidade: q })),
    });
    assert.strictEqual(res.status, 201, `POST /recebimentos: ${JSON.stringify(res.body)}`);
    const itens = await dbAll(db,
      'SELECT id FROM recebimentos_material_itens_almoxarifado WHERE recebimento_id = ? ORDER BY id',
      [res.body.id]);
    return { recId: res.body.id, numero: res.body.numero, itemIds: itens.map((i) => i.id), materiais };
  }

  /** O caminho REAL da UI: o modal de NF (`PUT /fiscal`) e quem escreve a quantidade. */
  async function registrarNoFiscal(recId, itens) {
    const wf = await workflow(recId, 'iniciar_conferencia');
    assert.strictEqual(wf.status, 200, `workflow iniciar_conferencia: ${JSON.stringify(wf.body)}`);
    seq += 1;
    const res = await request(app).put(`/api/almoxarifado/recebimentos/${recId}/fiscal`)
      .send({ nota_fiscal: `NF-FISCAL-NCI-${seq}`, itens });
    assert.strictEqual(res.status, 200, `PUT /fiscal: ${JSON.stringify(res.body)}`);
    return res;
  }

  const cartaoDe = (corpo, chave) => corpo.alertas.find((a) => a.chave === chave);
  const linhaDaNc = (cartao, numero) => cartao.linhas.find((l) => l.numero === numero);
  const linhaDoItem = (cartao, itemId) => cartao.linhas.find((l) => l.item_id === itemId);
  const ncDoItem = (corpo, itemId) => corpo.itens.find(
    (n) => n.referencia_tipo === 'RECEBIMENTO_ITEM' && n.referencia_id === itemId);

  const envelhecerNc = (id, dias) => dbRun(db,
    `UPDATE nao_conformidades_almoxarifado SET created_at = datetime('now', '-' || ? || ' days')
     WHERE id = ?`, [dias, id]);

  /**
   * O item DIVERGENTE e SEM documento — o estado que o gancho NAO FATAL da T3 deixa quando
   * explode (`console.warn` e a quantidade gravada sem NC). Escrito pela COLUNA de proposito:
   * pela rota, o gancho abriria a NC e este estado seria inalcancavel. Ele e a metade POSITIVA de
   * todos os cenarios de ausencia daqui — enquanto ele aparecer no cartao, "sumiu do cartao" quer
   * dizer alguma coisa.
   */
  let SEM_NC;
  {
    const { itemIds, materiais } = await recebimentoDeDez([10]);
    await dbRun(db,
      'UPDATE recebimentos_material_itens_almoxarifado SET quantidade_recebida = 4 WHERE id = ?',
      [itemIds[0]]);
    const orfa = await dbGet(db, `SELECT id FROM nao_conformidades_almoxarifado
      WHERE referencia_tipo = 'RECEBIMENTO_ITEM' AND referencia_id = ?`, [itemIds[0]]);
    assert.ok(!orfa, 'fixture: este item tinha de ficar SEM NC (e o estado do gancho que falhou)');
    SEM_NC = { itemId: itemIds[0], mat: materiais[0] };
  }

  // Estado compartilhado do fluxo do recebimento (cenarios 1 -> 2 -> 3, na ordem).
  let RECEB;

  // ── (1) O MODAL FISCAL ABRE O DOCUMENTO, E ELE APARECE NAS DUAS ROTAS DE LEITURA ────────────
  await test('(1) /fiscal com 7 de 10 -> a NC existe na LISTAGEM e no DETALHE, com o fato congelado', async () => {
    const { recId, numero, itemIds, materiais } = await recebimentoDeDez([10]);
    await registrarNoFiscal(recId, [{ id: itemIds[0], quantidade_recebida: 7 }]);

    const lista = await listarNc();
    assert.strictEqual(lista.status, 200, JSON.stringify(lista.body));
    assert.ok(Array.isArray(lista.body.itens), `a rota embrulha em { itens }: ${JSON.stringify(lista.body)}`);
    const nc = ncDoItem(lista.body, itemIds[0]);
    assert.ok(nc, `o item ${itemIds[0]} recebeu 7 de 10 pelo modal fiscal e NENHUMA NC apareceu na `
      + `listagem HTTP: ${JSON.stringify(lista.body.itens.map((n) => n.numero))}`);

    assert.ok(/^NC-/.test(nc.numero), `o numero tem de comecar em NC-: ${nc.numero}`);
    assert.strictEqual(nc.status, 'ABERTA', JSON.stringify(nc));
    assert.strictEqual(nc.origem, 'RECEBIMENTO', JSON.stringify(nc));
    assert.strictEqual(nc.tipo, 'QUANTIDADE', JSON.stringify(nc));
    assert.strictEqual(nc.quantidade_esperada, 10, JSON.stringify(nc));
    assert.strictEqual(nc.quantidade_recebida, 7, JSON.stringify(nc));
    assert.strictEqual(nc.divergencia, -3, JSON.stringify(nc));
    assert.strictEqual(nc.aberto_automaticamente, 1, 'a NC do gancho e automatica');
    assert.strictEqual(nc.aberto_por_nome, ADMIN.nome,
      'quem salvou o modal fiscal e quem consta como autor do documento');
    // Os dois LEFT JOIN da T1 respondendo PELA ROTA: sem eles a tela da T5 mostraria uma linha
    // com numero e mais nada, e ninguem saberia de que material e de que nota se trata.
    assert.strictEqual(nc.material_codigo, materiais[0].codigo, JSON.stringify(nc));
    assert.strictEqual(nc.recebimento_numero, numero, JSON.stringify(nc));

    // O DETALHE e a LISTAGEM sao duas rotas e dois caminhos de SQL: se divergirem, a tela abre um
    // documento diferente do que a lista mostrou.
    const detalhe = await obterNc(nc.id);
    assert.strictEqual(detalhe.status, 200, JSON.stringify(detalhe.body));
    assert.strictEqual(detalhe.body.numero, nc.numero);
    assert.strictEqual(detalhe.body.divergencia, -3);
    assert.strictEqual(detalhe.body.recebimento_numero, numero);

    RECEB = { recId, numero, itemId: itemIds[0], mat: materiais[0], nc };
  });

  // ── (2) A CENTRAL, PELA ROTA: O MESMO FATO EM UM CARTAO SO ──────────────────────────────────
  //
  // Este e o cruzamento T3<->T4 que nenhum teste de unidade faz: a T4 chama `montarCentral`
  // direto, sem gate e sem HTTP. Aqui os dois cartoes sao lidos na MESMA resposta da MESMA rota,
  // que e o que o usuario ve — e o que o D6 existe para evitar e justamente o item aparecendo nos
  // dois ao mesmo tempo.
  await test('(2) GET /alertas/central: o item documentado sai da divergencia, o SEM NC fica, e a NC nova so cobra depois de envelhecer', async () => {
    const res = await central();
    assert.strictEqual(res.status, 200, JSON.stringify(res.body));
    // Metade positiva #1: a central inteira respondeu. Sem isto, tudo abaixo passaria com `[]`.
    // 14 -> 15 na Etapa 46, T3 (a entrada `NAO_CONFORMIDADE_EXECUCAO_PENDENTE`).
    assert.strictEqual(res.body.alertas.length, 15,
      `a central tinha de trazer 15 cartoes, trouxe ${res.body.alertas.length}`);
    const comErro = res.body.alertas.filter((a) => a.erro).map((a) => a.chave);
    assert.deepStrictEqual(comErro, [], `cartoes com erro na central: ${JSON.stringify(comErro)}`);

    const divergencia = cartaoDe(res.body, EVENTO_DIV);
    const naoConformidade = cartaoDe(res.body, EVENTO_NC);
    assert.ok(divergencia && naoConformidade, 'os dois cartoes tem de existir na resposta da rota');

    // Metade positiva #2: o item SEM documento continua cobrado — e a rede de seguranca do D6.
    const viva = linhaDoItem(divergencia, SEM_NC.itemId);
    assert.ok(viva, `o item ${SEM_NC.itemId} esta divergente e SEM NC (gancho falhou): a rede de `
      + 'seguranca do D6 TEM de mostra-lo no cartao da divergencia');
    assert.strictEqual(viva.divergencia, -6, JSON.stringify(viva));

    // A EXCLUSAO DO D6, vista pela rota: o mesmo fato nao pode cobrar duas vezes.
    assert.ok(!linhaDoItem(divergencia, RECEB.itemId),
      `o item ${RECEB.itemId} virou ${RECEB.nc.numero} e NAO podia continuar no cartao `
      + `${EVENTO_DIV} — dois avisos pelo mesmo fato e o que o D6 mata`);
    // E a NC de hoje ainda nao cobra nada: o cartao novo cobra DECISAO a partir de 7 dias.
    assert.ok(!linhaDaNc(naoConformidade, RECEB.nc.numero),
      `a NC ${RECEB.nc.numero} nasceu agora e nao podia aparecer na janela de 7 dias`);

    // Envelhecida, a MESMA NC aparece — e e isto que torna a ausencia acima uma medicao.
    await envelhecerNc(RECEB.nc.id, 9);
    const depois = await central();
    assert.strictEqual(depois.status, 200, JSON.stringify(depois.body));
    const cartaoNc = cartaoDe(depois.body, EVENTO_NC);
    const linha = linhaDaNc(cartaoNc, RECEB.nc.numero);
    assert.ok(linha, `parada ha 9 dias, a NC ${RECEB.nc.numero} TINHA de aparecer em ${EVENTO_NC}: `
      + JSON.stringify(cartaoNc.linhas.map((l) => l.numero)));
    assert.strictEqual(linha.dias_parada, 9, `dias_parada veio ${linha.dias_parada}`);
    assert.strictEqual(linha.material_codigo, RECEB.mat.codigo, JSON.stringify(linha));
    assert.strictEqual(linha.recebimento_numero, RECEB.numero, JSON.stringify(linha));
    // E envelhecer NAO devolve o item ao outro cartao: a exclusao e por existir documento, nao
    // por idade.
    assert.ok(!linhaDoItem(cartaoDe(depois.body, EVENTO_DIV), RECEB.itemId),
      'a NC envelhecida continua sendo documento — o item nao pode voltar a cobrar pelo outro cartao');
  });

  // ── (3) DECIDIR PELA ROTA TIRA A NC DO CARTAO, E A TRILHA CONTA QUEM FEZ ────────────────────
  await test('(3) QUALIDADE decide por HTTP -> a NC sai do cartao sem gancho nenhum, e a trilha nomeia os dois autores', async () => {
    setUser(QUALIDADE);

    // O ACHADO DE COMPOSICAO, afirmado de proposito (ver o cabecalho): quem decide nao ve o cartao
    // que cobra a decisao. `ver_alertas` nao inclui QUALIDADE.
    const semCentral = await central();
    assert.strictEqual(semCentral.status, 403,
      `QUALIDADE nao tem ver_alertas hoje; veio ${semCentral.status}: ${JSON.stringify(semCentral.body)}`);
    assert.strictEqual(semCentral.body.acao, 'ver_alertas', JSON.stringify(semCentral.body));
    assert.strictEqual(semCentral.body.perfil, 'QUALIDADE', JSON.stringify(semCentral.body));

    const dec = await decidirNc(RECEB.nc.id, {
      decisao: 'ACEITAR_SOB_DESVIO', justificativa: 'Falta de 3 kg aceita: a peca fecha com o saldo.',
    });
    assert.strictEqual(dec.status, 200, `QUALIDADE tem decidir_nao_conformidade: ${JSON.stringify(dec.body)}`);
    assert.strictEqual(dec.body.status, 'DECIDIDA', JSON.stringify(dec.body));
    assert.strictEqual(dec.body.decisao, 'ACEITAR_SOB_DESVIO', JSON.stringify(dec.body));
    assert.strictEqual(dec.body.decidido_por_nome, QUALIDADE.nome, JSON.stringify(dec.body));

    setUser({ ...ADMIN });
    const res = await central();
    assert.strictEqual(res.status, 200, JSON.stringify(res.body));
    const cartaoNc = cartaoDe(res.body, EVENTO_NC);
    assert.ok(!linhaDaNc(cartaoNc, RECEB.nc.numero),
      `a NC ${RECEB.nc.numero} foi DECIDIDA e nao podia continuar cobrando decisao — a condicao do `
      + 'alerta e o proprio status, e nenhum gancho a retira do cartao');
    // Metade positiva: o cartao continua vivo (o item sem documento segue cobrado no outro), e a
    // NC decidida tambem nao volta para o cartao da divergencia (a exclusao e `<> CANCELADA`).
    const divergencia = cartaoDe(res.body, EVENTO_DIV);
    assert.ok(linhaDoItem(divergencia, SEM_NC.itemId),
      'o item sem documento tinha de continuar no cartao da divergencia depois da decisao');
    assert.ok(!linhaDoItem(divergencia, RECEB.itemId),
      'NC DECIDIDA continua sendo documento: o item nao volta a cobrar pelo cartao antigo');

    // A trilha, pela rota de auditoria (gate `configurar` = so ADMINISTRADOR). Os rotulos vem da
    // T2 e sao TRES distintos (RN-09) — aqui se mede que o verbo gravado pelo servico e o rotulo
    // da tela nao se separaram.
    const trilha = await trilhaDaNc(RECEB.nc.id);
    assert.strictEqual(trilha.status, 200, JSON.stringify(trilha.body));
    const porAcao = new Map(trilha.body.itens.map((l) => [l.acao, l]));
    assert.deepStrictEqual([...porAcao.keys()].sort(), ['NC_ABERTA', 'NC_DECIDIDA'],
      `a trilha do documento tinha de ter abertura e decisao: ${JSON.stringify(trilha.body.itens.map((i) => i.acao))}`);
    assert.strictEqual(porAcao.get('NC_ABERTA').usuario_nome, ADMIN.nome,
      'quem abriu foi quem salvou o modal fiscal');
    assert.strictEqual(porAcao.get('NC_DECIDIDA').usuario_nome, QUALIDADE.nome,
      'quem decidiu foi a QUALIDADE, e a trilha tem de dizer o nome');
    assert.strictEqual(porAcao.get('NC_ABERTA').acao_rotulo, 'Não conformidade aberta',
      porAcao.get('NC_ABERTA').acao_rotulo);
    assert.strictEqual(porAcao.get('NC_DECIDIDA').acao_rotulo, 'Não conformidade decidida',
      porAcao.get('NC_DECIDIDA').acao_rotulo);
    assert.strictEqual(porAcao.get('NC_DECIDIDA').entidade_rotulo, 'Não conformidade',
      porAcao.get('NC_DECIDIDA').entidade_rotulo);
  });

  // ── (4) UM DOCUMENTO, DOIS PERFIS — A MATRIZ DO D8 PELA ROTA ────────────────────────────────
  //
  // A T2 ja mede as duas matrizes inteiras. O que so existe aqui e o HANDOFF: o MESMO documento
  // aberto por COMPRAS, recusado a COMPRAS na decisao e decidido por QUALIDADE, com os dois nomes
  // no mesmo corpo — a separacao de papeis do D8 em um objeto so.
  await test('(4) COMPRAS abre (201) e NAO decide (403 nomeando o perfil); QUALIDADE decide o MESMO documento (200)', async () => {
    const { itemIds } = await recebimentoDeDez([10]);

    setUser(COMPRAS);
    const aberta = await abrirNc({
      origem: 'RECEBIMENTO', referencia_tipo: 'RECEBIMENTO_ITEM', referencia_id: itemIds[0],
      tipo: 'CERTIFICADO_AUSENTE', descricao: 'Chegou sem certificado de qualidade do lote',
    });
    assert.strictEqual(aberta.status, 201,
      `COMPRAS tem registrar_nao_conformidade e tinha de abrir: ${JSON.stringify(aberta.body)}`);
    assert.ok(/^NC-/.test(aberta.body.numero), aberta.body.numero);
    assert.strictEqual(aberta.body.status, 'ABERTA');
    assert.strictEqual(aberta.body.aberto_automaticamente, 0,
      'documento aberto por uma PESSOA nao pode se declarar automatico');
    assert.strictEqual(aberta.body.aberto_por_nome, COMPRAS.nome, JSON.stringify(aberta.body));

    const negada = await decidirNc(aberta.body.id, {
      decisao: 'ACEITAR', justificativa: 'O fornecedor manda o certificado depois',
    });
    assert.strictEqual(negada.status, 403,
      `COMPRAS nao pode decidir sobre o proprio fornecedor (D8); veio ${negada.status}: `
      + JSON.stringify(negada.body));
    assert.strictEqual(negada.body.acao, 'decidir_nao_conformidade', JSON.stringify(negada.body));
    assert.strictEqual(negada.body.perfil, 'COMPRAS',
      `o vermelho tem de NOMEAR o perfil recusado: ${JSON.stringify(negada.body)}`);
    // O 403 nao pode ter decidido nada pelo caminho: o gate roda ANTES do servico.
    const intacta = await dbGet(db,
      'SELECT status, decisao, decidido_por_nome FROM nao_conformidades_almoxarifado WHERE id = ?',
      [aberta.body.id]);
    assert.strictEqual(intacta.status, 'ABERTA', JSON.stringify(intacta));
    assert.strictEqual(intacta.decisao, null, JSON.stringify(intacta));

    // A metade POSITIVA, no MESMO documento: sem ela, o 403 acima ficaria verde ate com a acao
    // escrita errado (`can()` devolve false para acao que nao conhece).
    setUser(QUALIDADE);
    const decidida = await decidirNc(aberta.body.id, {
      decisao: 'SUBSTITUICAO', justificativa: 'Sem certificado o lote nao entra: substituir.',
    });
    assert.strictEqual(decidida.status, 200, JSON.stringify(decidida.body));
    assert.strictEqual(decidida.body.status, 'DECIDIDA');
    assert.strictEqual(decidida.body.decisao, 'SUBSTITUICAO');

    // E COMPRAS, que nao pode decidir, continua podendo LER o desfecho (a leitura e so `auth`):
    // um documento, dois papeis, visivel para os dois.
    setUser(COMPRAS);
    const lido = await obterNc(aberta.body.id);
    assert.strictEqual(lido.status, 200, JSON.stringify(lido.body));
    assert.strictEqual(lido.body.aberto_por_nome, COMPRAS.nome, JSON.stringify(lido.body));
    assert.strictEqual(lido.body.decidido_por_nome, QUALIDADE.nome, JSON.stringify(lido.body));
    setUser({ ...ADMIN });
  });

  // ── (5) O CAMINHO DA INSPECAO: PRIORIDADE DO D9 + DERIVACAO DA RN-07 NO MESMO ATO ───────────
  await test('(5) reprovar com dano fisico E certificado ausente abre UMA NC DANO_FISICO, com divergencia_quantidade derivada, e o filtro ?origem separa as duas', async () => {
    await setConfig('inspecao_material_critico', '1');
    const mat = await novoMaterial({ critico: true });
    seq += 1;
    const criado = await criarRecebimento({
      tipo_recebimento: 'NOTA_FISCAL', nota_fiscal: `NF-NCI-INSP-${seq}`,
      fornecedor_id: fornecedor, itens: [{ material_id: mat.id, quantidade: 10 }],
    });
    assert.strictEqual(criado.status, 201, JSON.stringify(criado.body));
    const item = await dbGet(db,
      'SELECT id FROM recebimentos_material_itens_almoxarifado WHERE recebimento_id = ?', [criado.body.id]);

    // A entrada pela rota retem o material critico em inspecao (10 retidos).
    const ap = await aprovar(criado.body.id);
    assert.strictEqual(ap.status, 200, `POST /aprovar: ${JSON.stringify(ap.body)}`);
    const retido = await dbGet(db,
      'SELECT quantidade_em_inspecao FROM recebimentos_material_itens_almoxarifado WHERE id = ?', [item.id]);
    assert.strictEqual(retido.quantidade_em_inspecao, 10,
      `fixture: o material critico tinha de ficar retido, veio ${retido.quantidade_em_inspecao}`);

    // A divergencia de QUANTIDADE do item e fabricada pela coluna (a rota abriria a NC do
    // recebimento e o cenario passaria a medir duas coisas ao mesmo tempo). O que se mede aqui e
    // que a RN-07 DERIVA a flag no MESMO ato em que o D9 escolhe o tipo.
    await dbRun(db,
      'UPDATE recebimentos_material_itens_almoxarifado SET quantidade_recebida = 8 WHERE id = ?', [item.id]);

    const insp = await inspecionar(item.id, {
      quantidade_aprovada: 6, quantidade_reprovada: 4,
      dano_fisico: 1, certificado_ausente: 1, encaminhamento: 'DEVOLVER',
    });
    assert.strictEqual(insp.status, 201, JSON.stringify(insp.body));
    assert.strictEqual(insp.body.divergencia_quantidade, 1,
      'recebida 8 de 10: a resposta de /inspecionar tem de trazer a flag DERIVADA (RN-07), e o '
      + `toast da tela le esse nome; veio ${insp.body.divergencia_quantidade}`);

    const daInspecao = await listarNc('?origem=INSPECAO');
    assert.strictEqual(daInspecao.status, 200, JSON.stringify(daInspecao.body));
    const nc = daInspecao.body.itens.find((n) => n.referencia_id === insp.body.id
      && n.referencia_tipo === 'INSPECAO');
    assert.ok(nc, `a inspecao ${insp.body.id} reprovou 4 e a NC nao apareceu em ?origem=INSPECAO: `
      + JSON.stringify(daInspecao.body.itens.map((n) => `${n.numero}/${n.origem}`)));
    assert.strictEqual(nc.origem, 'INSPECAO', JSON.stringify(nc));
    assert.strictEqual(nc.tipo, 'DANO_FISICO',
      `a prioridade do D9 poe DANO_FISICO acima de CERTIFICADO_AUSENTE; veio ${nc.tipo}`);
    assert.ok(/certificado/i.test(nc.descricao || ''),
      `todas as flags ligadas entram na descricao (nada se perde): ${nc.descricao}`);
    assert.strictEqual(nc.material_codigo, mat.codigo, JSON.stringify(nc));
    // UMA NC por inspecao, e nao uma por flag marcada (D9).
    const daMesmaInspecao = daInspecao.body.itens.filter((n) => n.referencia_id === insp.body.id
      && n.referencia_tipo === 'INSPECAO');
    assert.strictEqual(daMesmaInspecao.length, 1,
      `duas flags marcadas tinham de dar UM documento; deram ${daMesmaInspecao.length}`);

    // O filtro separa de verdade — nos DOIS sentidos, senao um filtro sempre-vazio passaria em
    // metade das asserçoes.
    assert.ok(!daInspecao.body.itens.some((n) => n.numero === RECEB.nc.numero),
      `?origem=INSPECAO nao pode trazer ${RECEB.nc.numero}, que nasceu do recebimento`);
    const doRecebimento = await listarNc('?origem=RECEBIMENTO');
    assert.strictEqual(doRecebimento.status, 200, JSON.stringify(doRecebimento.body));
    assert.ok(doRecebimento.body.itens.some((n) => n.numero === RECEB.nc.numero),
      `?origem=RECEBIMENTO tinha de trazer ${RECEB.nc.numero}`);
    assert.ok(!doRecebimento.body.itens.some((n) => n.numero === nc.numero),
      `?origem=RECEBIMENTO nao pode trazer ${nc.numero}, que nasceu da inspecao`);
    // E sem filtro as duas convivem na MESMA listagem — o D1 (um documento, duas origens).
    const todas = await listarNc();
    const numeros = todas.body.itens.map((n) => n.numero);
    assert.ok(numeros.includes(nc.numero) && numeros.includes(RECEB.nc.numero),
      `a listagem sem filtro tinha de trazer as duas origens: ${JSON.stringify(numeros)}`);
  });

  // ── (6) ETAPA 42 + ETAPA 43 NO MESMO ATO ────────────────────────────────────────────────────
  //
  // O gancho que fecha o pedido (Etapa 42) e o gancho que abre a NC (T3) moram nos mesmos dois
  // servicos e nenhum teste os exercita juntos. O item A completa a linha do pedido; o item B, que
  // nao e do pedido, chega a menos. Os dois efeitos tem de acontecer no mesmo recebimento — e a
  // NC aberta NAO pode travar a entrada no estoque (item 5 de "o que esta etapa NAO faz").
  await test('(6) recebimento contra pedido: a linha completa FECHA o pedido e o outro item ABRE NC, no mesmo ato', async () => {
    const matPedido = await novoMaterial();
    const matAvulso = await novoMaterial();

    const pedido = await request(app).post('/api/compras/pedidos').send({
      fornecedor_id: fornecedor, status: 'aprovado',
      itens: [{ material_id: matPedido.id, quantidade: 10, valor_unitario: 5 }],
    });
    assert.strictEqual(pedido.status, 201, `POST /api/compras/pedidos: ${JSON.stringify(pedido.body)}`);
    const pedidoId = pedido.body.id;
    const linha = await dbGet(db,
      'SELECT id FROM itens_pedido_compra WHERE pedido_id = ? ORDER BY id LIMIT 1', [pedidoId]);
    assert.ok(linha, 'fixture: o pedido tinha de ter linha');

    seq += 1;
    const criado = await criarRecebimento({
      tipo_recebimento: 'PEDIDO_COMPRA', pedido_compra_id: pedidoId,
      nota_fiscal: `NF-NCI-PC-${seq}`, fornecedor_id: fornecedor,
      itens: [
        { material_id: matPedido.id, pedido_item_id: linha.id, quantidade: 10, quantidade_recebida: 10 },
        { material_id: matAvulso.id, quantidade: 10, quantidade_recebida: 10 },
      ],
    });
    assert.strictEqual(criado.status, 201, JSON.stringify(criado.body));
    const itens = await dbAll(db,
      'SELECT id, material_id FROM recebimentos_material_itens_almoxarifado WHERE recebimento_id = ? ORDER BY id',
      [criado.body.id]);
    const itemPedido = itens.find((i) => i.material_id === matPedido.id);
    const itemAvulso = itens.find((i) => i.material_id === matAvulso.id);
    assert.ok(itemPedido && itemAvulso, 'fixture: os dois itens tinham de existir');

    // A conferencia: a linha do pedido fecha certinho, o item avulso chega a menos.
    const conf = await conferir(criado.body.id, [
      { id: itemPedido.id, quantidade_recebida: 10, conferencia_quantidade: 1 },
      { id: itemAvulso.id, quantidade_recebida: 7, conferencia_quantidade: 1 },
    ]);
    assert.strictEqual(conf.status, 200, JSON.stringify(conf.body));

    // ANTES da entrada: a NC ja existe e o pedido ainda NAO fechou (o fechamento e da entrada).
    const antes = await listarNc('?status=ABERTA');
    const ncAvulso = ncDoItem(antes.body, itemAvulso.id);
    assert.ok(ncAvulso, `o item avulso chegou 7 de 10 e nenhuma NC nasceu: `
      + JSON.stringify(antes.body.itens.map((n) => `${n.numero}/${n.referencia_id}`)));
    assert.strictEqual(ncAvulso.divergencia, -3, JSON.stringify(ncAvulso));
    assert.strictEqual(ncAvulso.recebimento_numero, criado.body.numero,
      'a NC congela o recebimento em que o fato aconteceu');
    assert.ok(!ncDoItem(antes.body, itemPedido.id),
      'o item que chegou completo nao podia gerar documento nenhum');
    assert.strictEqual((await dbGet(db, 'SELECT status FROM pedidos_compra WHERE id = ?', [pedidoId])).status,
      'aprovado', 'o pedido so fecha na ENTRADA, nao na conferencia');

    // A entrada no estoque: aqui rodam os dois ganchos.
    const ap = await aprovar(criado.body.id);
    assert.strictEqual(ap.status, 200, `POST /aprovar com NC aberta: ${JSON.stringify(ap.body)}`);

    // Etapa 42: a linha somou e o pedido fechou, pela leitura de Compras (a rota, nao so a coluna).
    const doCompras = await request(app).get(`/api/compras/pedidos/${pedidoId}`);
    assert.strictEqual(doCompras.status, 200, JSON.stringify(doCompras.body));
    assert.strictEqual(doCompras.body.status, 'recebido',
      `a linha do pedido chegou completa e o status nao acompanhou: ${JSON.stringify(doCompras.body.status)}`);
    assert.strictEqual((await dbGet(db,
      'SELECT quantidade_recebida FROM itens_pedido_compra WHERE id = ?', [linha.id])).quantidade_recebida, 10,
    'o acumulador da Etapa 37 tinha de somar os 10 na linha do pedido');

    // Etapa 43: a NC do outro item continua viva e intacta depois da entrada — e o material dela
    // ENTROU no estoque assim mesmo (a NC documenta, nao bloqueia).
    const depois = await obterNc(ncAvulso.id);
    assert.strictEqual(depois.status, 200, JSON.stringify(depois.body));
    assert.strictEqual(depois.body.status, 'ABERTA',
      'a entrada no estoque nao pode encerrar o documento por conta propria');
    assert.strictEqual(depois.body.divergencia, -3, JSON.stringify(depois.body));
    const saldo = await dbGet(db,
      'SELECT quantidade_atual FROM materiais_almoxarifado WHERE id = ?', [matAvulso.id]);
    assert.strictEqual(saldo.quantidade_atual, 7,
      `a NC aberta NAO trava o processamento (item 5 do "o que a etapa nao faz"): os 7 que `
      + `chegaram tinham de entrar no estoque, entraram ${saldo.quantidade_atual}`);
  });

  await close();
  console.log(`\n${passed} passed, ${failed} failed\n`);
  process.exit(failed > 0 ? 1 : 0);
})();
