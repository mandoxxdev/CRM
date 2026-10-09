const { dbRun, dbGet, dbAll } = require('./db');
const { registrarAuditoria } = require('./audit');
// Etapa 25 (C2): funcao PURA sobre `user.origem` — nao importa Express nem toca no `req`.
const { camposDeOrigem } = require('./origemRequisicao');
const { can } = require('./permissions');
const alertService = require('./alertService');
const { avaliarRegrasVinculo } = require('./movementRules');
const ownerRules = require('./ownerRules');
// Etapa 66: resolve `motivo_id` (cadastro de motivos) no topo de registrarMovimentacao.
const motivoMovimentacao = require('./motivoMovimentacao');
const { TIPOS_MOVIMENTO, TIPOS_RETENCAO, AREAS_ESPECIAIS } = require('./schema');
const { disponivelSql, COLUNAS_RETENCAO } = require('./availabilitySql');
// Etapa 96 (C176): a regra unica de quantidade — namespace de proposito (ha `const qtd` locais neste arquivo).
const Q = require('./quantidade');
// Etapa 45 (fix-round): a regua de "isto e diferenca de verdade", dona unica desde a Etapa 10b.
// Usada SO no claim de `baixandoBloqueado` (`DEVOLUCAO_FORNECEDOR` e, desde a Etapa 69, a `SUCATA`
// com `doBloqueado`), e o raio pequeno e deliberado — ver o comentario
// la. Afrouxar por epsilon TODO claim de saida e mudanca de motor, nao de etapa.
const { EPSILON_DIVERGENCIA } = require('./divergencia');
/**
 * Espelha `nonConformityService.MOTIVO_LIBERACAO` SEM importá-lo — o mesmo desenho, e pelo mesmo
 * motivo, da cópia de `STATUS_RECEBIMENTO_PROCESSADO` que mora lá: `nonConformityService` faz
 * `require('./stockService')` (preguiçoso) para chamar o motor, e um require recíproco no topo
 * daqui devolveria um objeto pela metade dependendo da ordem de carga.
 * Há cenário em `naoConformidadeLiberacao.api.test.js` comparando as duas strings — uma cópia sem
 * guarda deriva em silêncio, e a recusa de estorno viraria comparação com literal morta.
 */
const MOTIVO_LIBERACAO_NC = 'Liberação por não conformidade';
const { custoUnitarioSql, valorEstoqueSql } = require('./custoSql');
const movementTypes = require('./movementTypes');
// seriesService nao importa stockService de volta — sem ciclo.
const seriesService = require('./seriesService');
// Etapa 12, Task 2 (D8): notificationQueueService NAO importa stockService (nem no topo nem
// lazy) — sem ciclo. Ele so requer alertService de forma LAZY (dentro de enfileirarMovimentacao/
// processarFila), entao carregar este require aqui, no topo, nao fecha ciclo nenhum.
const notificationQueueService = require('./notificationQueueService');
// Etapa 91 (Fase 5, F3): a trava nao requer nada do app — sem ciclo. Pelo objeto (os testes a espiam).
const trava = require('./travaPorMaterial');

async function getConfig(db, chave) {
  const row = await dbGet(db, 'SELECT valor FROM configuracoes_almoxarifado WHERE chave = ?', [chave]);
  return row?.valor;
}

async function getMaterial(db, materialId) {
  const m = await dbGet(db, 'SELECT * FROM materiais_almoxarifado WHERE id = ?', [materialId]);
  if (!m) throw Object.assign(new Error('Material não encontrado'), { status: 404 });
  return m;
}

/**
 * Disponivel = fisico menos TODA retencao (COLUNAS_RETENCAO, availabilitySql.js). A lista das
 * colunas mora la, e nao aqui, para esta funcao e as 13 queries que fazem a mesma conta nao
 * poderem divergir — divergirem foi o que a Etapa 8b teve de consertar.
 */
async function getSaldoDisponivel(material, db = null) {
  // Etapa 96 (B485/B486): arredondado como o `disponivelSql` — a pre-checagem da saida e as mensagens de recusa
  // dizem o mesmo numero que o claim compara (0,3 - 0,1 da 0,2, nao 0.19999999999999998).
  // Etapa 96 (Fase 5, R3): e o numero vem do PROPRIO SQL do claim. Recalculado em JS (toFixed) ele discordava do ROUND
  // do SQLite nos meios exatos (I6; 76/100 000): legado 0,0010995 dava 0,001099 aqui e 0,0011 no claim — a reserva de
  // 0,0011 passava pelo SQL, a SAIDA de 0,0011 era recusada pela pre-checagem, e a reserva ficava impossivel de consumir.
  // A regra da B482 ("nunca arredondar o mesmo cru dos dois lados e comparar") vale aqui: o motor passa o `db` e a
  // conta e `disponivelSql()` sobre os valores do mesmo retrato do material. Sem `db` (so os testes antigos chamam
  // assim) fica a conta em JS de antes.
  if (db) {
    const cols = ['quantidade_atual', ...COLUNAS_RETENCAO];
    const r = await dbGet(db, `SELECT ${disponivelSql()} AS d FROM (SELECT ${cols.map((c) => `? AS ${c}`).join(', ')})`,
      cols.map((c) => (c === 'quantidade_atual' ? (material[c] ?? 0) : (material[c] ?? null))));
    return r && r.d ? r.d : 0; // ROUND(-1e-16) do SQLite e -0
  }
  return Q.qtd(COLUNAS_RETENCAO.reduce(
    (saldo, coluna) => saldo - (material[coluna] || 0),
    material.quantidade_atual,
  ));
}

/**
 * RN-06 (Etapa 10): decide, para as tres instancias registradas desde a Etapa 7
 * (docs/almoxarifado-novidades-por-etapa.md, itens B1-B3), o que o Ajuste faz quando o novo
 * total ficaria menor que alguma retencao. Escolhida a opcao (b) das tres possiveis: nunca
 * aceitar — um ajuste que deixaria o disponivel negativo e inconsistencia interna dos dados
 * (bloqueei/reservei/mandei pra terceiro mais do que digo que existe), categoria diferente de
 * "aceito vender mais do que tenho fisicamente" (permite_saldo_negativo, que NAO bypassa esta
 * guarda de proposito).
 *
 * FUNCAO PURA — sem I/O, sem throw. So se aplica ao ajuste SEM localizacao: com localizacao o
 * novo total so e conhecido depois do syncMaterialTotals somar todas as linhas — verificar a
 * retencao contra um total ainda-nao-existente fica fora do escopo desta etapa (D1/D7 do
 * design). Exportada para a rota da conferencia (Task 2) poder pre-validar VARIOS itens antes
 * de aplicar qualquer um (RN-07, tudo-ou-nada) SEM reescrever esta formula — D1 do design proibe
 * duplicar a formula, nao proibe chamar esta funcao duas vezes.
 *
 * @returns {string|null} mensagem de recusa, ou null se o ajuste pode prosseguir.
 */
function motivoRecusaAjustePorRetencao(material, novoTotal) {
  const retido = COLUNAS_RETENCAO.reduce((soma, col) => soma + (material[col] || 0), 0);
  if (Q.cabe(retido, novoTotal)) return null; // Etapa 96 (Fase 2, I1): a retencao e uma soma
  const LABELS = {
    quantidade_reservada: 'reservada', quantidade_bloqueada: 'bloqueada',
    quantidade_em_inspecao: 'em inspeção', quantidade_em_terceiros: 'em terceiros',
  };
  const partes = COLUNAS_RETENCAO
    .filter((col) => (material[col] || 0) > 0)
    .map((col) => `${LABELS[col]}: ${Q.qtd(material[col])}`);
  return `Ajuste para ${Q.qtd(novoTotal)} ${material.unidade} deixaria o disponível negativo `
    + `(${partes.join(', ')}, mínimo aceitável: ${Q.qtd(retido)} ${material.unidade}). Resolva a `
    + 'retenção antes de ajustar para menos, ou ajuste para um valor maior ou igual ao mínimo.';
}

/**
 * Recalcula o TOTAL FÍSICO do material a partir da soma das linhas de saldo por localização/lote.
 *
 * Restaurada no review round 3 desta task (removida no round 2, achando que o delta local era
 * "a raiz" do problema — tecnicamente funcionava, mas a semântica estava errada). O cliente
 * decidiu a regra de negócio: contagem por localização REDEFINE o saldo do material, não soma ao
 * que já existia sem endereço. Isso É a semântica "soma das linhas é a verdade" — quem conta uma
 * prateleira está dizendo o que existe ali, e o total do material é a soma do que existe em TODAS
 * as prateleiras/lotes conhecidos.
 *
 * ATÉ ONDE A SOMA É CONFIÁVEL — e o comentário anterior aqui MENTIA sobre isso. Ele afirmava,
 * desde o round 3, que "TODO ramo que muda quantidade_atual também mantém a linha de saldo
 * correspondente". É falso, e a spec 03 repetia a mesma frase. A verdade:
 *
 *  - Vale para os ramos DESTE MOTOR: `registrarMovimentacao` (entrada/saída criam a linha sempre,
 *    mesmo sem localização nem lote; TRANSFERENCIA e AJUSTE-com-localização escrevem a linha
 *    citada; AJUSTE-sem-localização delega a `syncSaldoLocalizacaoPadrao`) e `cancelarMovimentacao`
 *    (reversão de ENTRADA/SAIDA ajusta a linha que o movimento original escreveu — `ajustarSaldoExistente`
 *    —, e quando não acha essa linha reconcilia o residual se o material já tiver alguma linha:
 *    `reconciliarEstornoSemLinha`. Só material com ZERO linhas fica de fora, que é justamente o
 *    material legado sobre o qual esta função também não manda).
 *  - NÃO vale para um escritor conhecido FORA do motor: `PUT /api/almoxarifado/conferencias/:id/
 *    concluir` com `aplicar_ajustes` faz `UPDATE materiais_almoxarifado SET quantidade_atual = ?`
 *    direto (em `routes/almoxarifado.js`, dentro do handler dessa rota — sem número de linha de
 *    propósito: a citação anterior dizia "~linha 868", o `UPDATE` já andou duas vezes desde então,
 *    e número de linha em comentário apodrece) e nunca toca em `estoque_saldo_almoxarifado`.
 *    Consequência real: num material que JÁ tem linhas, a homologação do inventário muda o total
 *    e deixa as linhas com o valor velho; a próxima contagem por localização (ou o estorno de um
 *    AJUSTE) chama esta função e reconcilia a partir dessas linhas desatualizadas — o número
 *    homologado no inventário evapora. Pendência nomeada na spec 03 (não é regressão da Etapa 6:
 *    esse UPDATE cru é anterior a ela); rotear a rota pelo motor é task própria, com testes
 *    próprios.
 *
 * Material legado (saldo em `quantidade_atual`, zero linhas) não é atingido enquanto não tiver
 * nenhuma linha: o guard de contagem abaixo faz esta função não tocar no material. A soma só passa
 * a mandar naquele material a partir da PRIMEIRA contagem por localização — que é exatamente a
 * regra de negócio decidida pelo cliente.
 *
 * Recalcula SOMENTE `quantidade_atual` — de propósito (achado do review final da Etapa 5).
 * A retenção (`quantidade_reservada`, `quantidade_bloqueada`, `quantidade_em_inspecao`) mora
 * EXCLUSIVAMENTE em `materiais_almoxarifado` e só muda pelos ramos do motor
 * (RESERVA/LIBERACAO_RESERVA, BLOQUEIO/DESBLOQUEIO, QUARENTENA/DECISAO_INSPECAO/...).
 * `estoque_saldo_almoxarifado` NAO tem colunas de retencao — elas existiam, nunca tiveram
 * escritor, e foram removidas na Etapa 6 justamente para que ninguem volte a somar a partir
 * delas.
 */
async function syncMaterialTotals(db, materialId) {
  // Etapa 96: a soma das linhas e gravada arredondada (0,7 + 0,2 + 0,1 em tres linhas nao vira 0.9999999999999999).
  const saldos = await dbGet(db, `
    SELECT ${Q.qtdSql('COALESCE(SUM(quantidade),0)')} as total
    FROM estoque_saldo_almoxarifado WHERE material_id = ?`, [materialId]);

  // Contagem de linhas em vez de exigir total > 0: zerar todas as localizações de um material
  // (ex.: AJUSTE para 0) precisa propagar para materiais_almoxarifado.quantidade_atual mesmo
  // quando a soma dá exatamente 0 — sem isto o total ficaria "preso" no último valor positivo.
  // Sem NENHUMA linha ainda (material nunca movimentado por aqui), esta função não toca no
  // material — não há nada para sincronizar.
  const linhas = await dbGet(db, 'SELECT COUNT(*) as n FROM estoque_saldo_almoxarifado WHERE material_id = ?', [materialId]);

  if (linhas && linhas.n > 0) {
    await dbRun(db, `UPDATE materiais_almoxarifado SET
      quantidade_atual = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
      [saldos.total, materialId]);
  }
}

async function getOrCreateSaldo(db, materialId, localizacaoId, loteId = null) {
  let saldo = await dbGet(db,
    'SELECT * FROM estoque_saldo_almoxarifado WHERE material_id = ? AND localizacao_id IS ? AND lote_id IS ?',
    [materialId, localizacaoId || null, loteId || null]);
  if (!saldo) {
    try {
      const r = await dbRun(db,
        'INSERT INTO estoque_saldo_almoxarifado (material_id, localizacao_id, lote_id) VALUES (?,?,?)',
        [materialId, localizacaoId || null, loteId || null]);
      saldo = await dbGet(db, 'SELECT * FROM estoque_saldo_almoxarifado WHERE id = ?', [r.lastID]);
    } catch (e) {
      // Corrida: outra requisição concorrente criou a MESMA linha (mesmo material+localização+
      // lote) entre o SELECT acima e este INSERT — o índice único idx_saldo_almox_chave rejeita o
      // segundo INSERT (achado do review round 1 da Task 3, pego pela suíte de concorrência
      // existente). Antes desta task, esta função só era chamada quando havia localização OU lote
      // explícitos; a Task 3 passou a chamá-la SEMPRE, mesmo para material "sem localização nem
      // lote" — a partir do round 3 isso é estritamente necessário de novo: `syncMaterialTotals`
      // soma todas as linhas do material, e uma linha ausente faz a soma divergir da realidade
      // (ver docstring de `syncMaterialTotals` acima) —, expondo esta corrida pré-existente numa
      // população de materiais que os testes de concorrência batem com dezenas de requisições
      // simultâneas no MESMO material. Sem este catch, a corrida virava
      // SQLITE_CONSTRAINT não tratado e a requisição perdedora tomava 500 em vez de seguir com a
      // linha que a vencedora acabou de criar.
      saldo = await dbGet(db,
        'SELECT * FROM estoque_saldo_almoxarifado WHERE material_id = ? AND localizacao_id IS ? AND lote_id IS ?',
        [materialId, localizacaoId || null, loteId || null]);
      if (!saldo) throw e; // não era a corrida esperada (linha ainda não existe) — propaga o erro original
    }
  }
  return saldo;
}

/**
 * Aplica um delta na linha de saldo (material + localização + lote) **se ela já existir**, e não
 * faz nada quando não existe. É o oposto deliberado de `getOrCreateSaldo`, e existe por causa do
 * estorno.
 *
 * Movimentação gravada a partir da Etapa 6 SEMPRE escreve linha de saldo (ver o bloco de
 * entrada/saída em `registrarMovimentacao`). Movimentação LEGADA — todas as que já estão no banco
 * de produção — nunca escreveu. Criar a linha do zero e gravar −quantidade (o que o round 3 desta
 * task passou a fazer) inventava uma linha negativa que nunca existiu, e como `syncMaterialTotals`
 * trata a soma das linhas como verdade, a PRIMEIRA contagem de prateleira daquele material passava
 * a devolver o negativo (material com 10, estorno da entrada legada de 10, contagem "aqui tem 5"
 * ⇒ −5 em vez de 5), furando de quebra a guarda de `permite_saldo_negativo`.
 *
 * Guarda no WHERE com RETURNING, como o resto do motor — mas aqui "não casou" NÃO é erro nem é,
 * por si só, o caso legado: é só "não achei ESTA chave". **O miss não decide nada sozinho** — quem
 * decide é `reconciliarEstornoSemLinha`, que pergunta se o MATERIAL já tem alguma linha. O round 4
 * tratou o miss como no-op incondicional e isso engolia estorno legítimo (ver lá). Por isso esta
 * função devolve um resultado em vez de lançar, e por isso os dois call sites são obrigados a olhar.
 *
 * `opcoes.minimo` (review final da Etapa 6) entra no `WHERE` como piso do saldo da linha ANTES do
 * delta — é o que impede o estorno de ENTRADA com lote de negativar a linha em silêncio: era o −8
 * na direção inversa (lote A=100, entrada de 10 no B, saída de 10 do B, estorno da entrada do B ⇒
 * linha do B em **−10**, com `quantidade_atual` coerente em 90 e nada denunciando; a listagem FEFO
 * passava a mostrar `B = −10` num material que não permite saldo negativo). Com o piso, "não
 * casou" deixa de ser uma pergunta só — por isso o retorno distingue **`existe`** (a linha está
 * lá, mas não comporta a reversão ⇒ o chamador RECUSA o estorno) de **não existe** (⇒
 * `reconciliarEstornoSemLinha` decide).
 */
async function ajustarSaldoExistente(db, materialId, localizacaoId, loteId, delta, { minimo = null } = {}) {
  const chave = [materialId, localizacaoId || null, loteId || null];
  const params = [delta, ...chave];
  let sql = `UPDATE estoque_saldo_almoxarifado
    SET quantidade = ${Q.qtdSql('quantidade + ?')}, updated_at = CURRENT_TIMESTAMP
    WHERE material_id = ? AND localizacao_id IS ? AND lote_id IS ?`;
  if (minimo != null) { sql += ` AND quantidade >= ? ${Q.FOLGA_SQL}`; params.push(minimo); }
  sql += ' RETURNING id';

  const linha = await dbGet(db, sql, params);
  if (linha) return { existe: true, aplicado: true };
  // Sem piso, "não casou" só pode significar "linha inexistente" — mantém o discriminador antigo.
  if (minimo == null) return { existe: false, aplicado: false };
  const atual = await dbGet(db, `SELECT quantidade FROM estoque_saldo_almoxarifado
    WHERE material_id = ? AND localizacao_id IS ? AND lote_id IS ?`, chave);
  return { existe: !!atual, aplicado: false, quantidade: atual ? atual.quantidade : 0 };
}

/**
 * Reivindica `quantidade` do LOTE — do conjunto de linhas daquele lote, em todas as localizações —
 * e não de uma linha só.
 *
 * **Por que o conjunto e não a linha** (achado do review final da Etapa 6): a tela oferece saldo
 * AGREGADO. `lotService.listarLotesDoMaterial` calcula `saldo` como `SUM(quantidade) WHERE
 * lote_id = l.id`, somando todas as localizações; o motor reivindicava contra UMA linha, chaveada
 * por `(material, localização resolvida, lote)`. Quando a localização resolvida da saída não é
 * onde o lote está, a tela mostrava "saldo 25", o FEFO pré-selecionava aquele lote, e o motor
 * respondia "Saldo insuficiente no lote L1. Disponível: 0" — as duas pontas discordando sobre o
 * mesmo número. Alinhar pelo agregado (e não restringir a tela ao saldo da linha) é o lado que
 * concorda com a regra de negócio já escrita no guia: *uma saída consome o saldo total do
 * material, independente da área em que ele está endereçado* — almoxarifado aqui é área física
 * dentro do mesmo site, não filial.
 *
 * **Ordem de consumo:** a localização resolvida da saída primeiro (assim o caso comum — lote todo
 * numa linha só — se comporta exatamente como antes), depois as maiores. Consumir da menor
 * fragmentaria o endereçamento sem ganho.
 *
 * **Sem transação, como o resto do módulo:** cada linha é debitada por um `UPDATE` condicional
 * (`quantidade >= ?`, com `RETURNING`) e, se o total pedido não for alcançado, TODOS os débitos já
 * aplicados são devolvidos explicitamente antes de a função reportar insucesso. Nunca
 * `MAX(0, …)`: saturar em silêncio entregaria menos do que o pedido sem ninguém saber.
 *
 * **Não cria linha** — de propósito, e isso é a segunda metade do mesmo achado. `getOrCreateSaldo`
 * criava a linha ANTES do claim, então toda saída RECUSADA deixava para trás uma linha
 * `(localização, lote, 0)`. Além do lixo, essa linha alimentava o discriminador do estorno
 * (`reconciliarEstornoSemLinha` conta linhas, inclusive as zeradas), tirando do no-op um material
 * que era legado até a tentativa fracassada.
 *
 * **Só a localização DECLARADA passa pela validação de endereço — as demais linhas que este claim
 * decide drenar, não** (achado do review final da Etapa 6, parked com ruling). `validarLocalizacaoParaMovimento`
 * roda ANTES deste claim e valida só a localização resolvida da saída (`locPreferida`, o parâmetro
 * abaixo) — bloqueio, tipo permitido. Quando essa linha não fecha o total sozinha, o claim segue
 * drenando as OUTRAS linhas do lote (as maiores primeiro) sem repetir aquela validação, inclusive
 * linha em localização marcada `bloqueada = 1`: uma saída que declara origem numa localização não
 * bloqueada pode reduzir o saldo de uma localização bloqueada do mesmo lote sem passar pela guarda de
 * bloqueio. É consequência direta de alinhar pelo agregado (mesma decisão de negócio do parágrafo
 * acima: uma saída consome o saldo total do material, área física não é filial) e **não corrompe
 * saldo** — total do material e soma das linhas continuam consistentes —, mas é comportamento que
 * ninguém tinha escrito em lugar nenhum até agora. Documentado também em
 * `specs/modulo-almoxarifado/10-lotes-series-etiquetas/README.md`, seção "O saldo do lote é agregado
 * nas DUAS pontas".
 *
 * Devolve `{ ok: true }` ou `{ ok: false, disponivel }` com o saldo agregado real do lote — o
 * mesmo número que a tela mostra.
 */
const EPS = Q.QTD_FOLGA; // tolerância de ponto flutuante: quantidade é REAL no SQLite (Etapa 96: a mesma folga do helper)

/**
 * Etapa 67 (Fase 5): `quantidade_reservada` do material menos `?`, com a sobra de ponto flutuante
 * (<= EPS) virando ZERO. Dez consumos de 0,1 contra uma reserva de 1 deixavam 1,38e-16 reservado
 * no material e a reserva ATIVA com 1,1e-16 de saldo: lixo que segura disponivel e mantem uma
 * reserva zumbi. Usa TRES placeholders com o mesmo valor (a conta aparece tres vezes; eram dois ate a Etapa 96 Fase 5).
 *
 * Etapa 96 (Fase 5, R2): e o residuo de arredondamento que sobra quando a ULTIMA reserva ATIVA do material sai. Tres
 * reservas legadas de 1/3 (0.3333333333333333) contra um reservado de 1: cada liberacao subtrai o saldo arredondado
 * (0,333333) e o reservado, gravado arredondado, termina em 0,000001 sem reserva nenhuma — e a SAIDA de 1 com fisico
 * 1 era recusada ("Disponivel: 0.999999"). Antes da 96 a conta crua fechava em 5,5e-17 (<= EPS -> 0). Regra: sem
 * reserva ATIVA no material (o UPDATE da reserva vem ANTES deste), o que sobra abaixo de RESIDUO_RESERVADO e residuo
 * e vira 0. Descartados: (i) subtrair o saldo CRU da reserva — com o reservado arredondado a cada passo fecha em
 * 0,000001 do mesmo jeito (1 -> 0,666667 -> 0,333334 -> 6,7e-7 -> ROUND 0,000001); (ii) zerar sem limite quando nao
 * sobra ATIVA — o hold de `criarReserva` sobe o reservado ANTES do INSERT da reserva (sem transacao), e uma liberacao
 * concorrente zeraria esse hold inteiro; com o limite, o maximo que a corrida apaga e um hold < 0,0001; (iii)
 * recalcular o reservado pela soma das reservas a cada liberacao — a mesma corrida, com o hold inteiro.
 */
const RESIDUO_RESERVADO = 0.0001;
const RESERVADA_MENOS_SQL = Q.qtdSql(`CASE WHEN COALESCE(quantidade_reservada,0) - ? <= ${EPS} THEN 0
  WHEN COALESCE(quantidade_reservada,0) - ? < ${RESIDUO_RESERVADO} AND NOT EXISTS (SELECT 1 FROM reservas_material_almoxarifado rz
    WHERE rz.material_id = materiais_almoxarifado.id AND rz.status = 'ATIVA') THEN 0
  ELSE COALESCE(quantidade_reservada,0) - ? END`);

async function claimSaldoDoLote(db, materialId, loteId, locPreferida, quantidade) {
  const linhas = await dbAll(db, `
    SELECT id, quantidade FROM estoque_saldo_almoxarifado
    WHERE material_id = ? AND lote_id IS ? AND quantidade > 0
    ORDER BY (localizacao_id IS ?) DESC, quantidade DESC, id`,
    [materialId, loteId, locPreferida || null]);

  const aplicados = [];
  let restante = quantidade;
  for (const linha of linhas) {
    if (restante <= EPS) break;
    const take = Math.min(restante, linha.quantidade);
    const claim = await dbGet(db, `UPDATE estoque_saldo_almoxarifado
      SET quantidade = ${Q.qtdSql('quantidade - ?')}, updated_at = CURRENT_TIMESTAMP
      WHERE id = ? AND quantidade >= ? ${Q.FOLGA_SQL}
      RETURNING id`, [take, linha.id, take]);
    // Não casou = outra saída concorrente levou o saldo desta linha entre o SELECT e o UPDATE.
    // Não é erro por si: segue para a próxima linha do lote e só falha se o total não fechar.
    if (!claim) continue;
    aplicados.push({ id: linha.id, quantidade: take });
    restante = Q.qtd(restante - take);
  }

  if (restante > EPS) {
    for (const a of aplicados) {
      await dbRun(db, `UPDATE estoque_saldo_almoxarifado
        SET quantidade = ${Q.qtdSql('quantidade + ?')}, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
        [a.quantidade, a.id]);
    }
    const total = await dbGet(db, `SELECT COALESCE(SUM(quantidade),0) as total
      FROM estoque_saldo_almoxarifado WHERE material_id = ? AND lote_id IS ?`, [materialId, loteId]);
    return { ok: false, disponivel: Q.qtd(total.total) };
  }
  return { ok: true, linhas: aplicados };
}

/**
 * Etapa 51 (RN-01/02) — a saída SEM LOTE baixa os endereços que têm saldo.
 *
 * Antes, a saída sem lote debitava UMA linha — a da origem declarada, a da localização padrão ou a
 * `NULL` — sem guarda. A entrega de requisição (o fluxo principal) não manda origem: entrada de 100
 * em A e entrega de 100 deixavam **A:100 e NULL:−100** com o físico em 0. O endereço vazio aparecia
 * OCUPADO no mapa, e uma tela de "localizações vazias" o esconderia (sonda da Fase 0).
 *
 * Mesma regra que o motor já usa para lote (`claimSaldoDoLote`, "área física não é filial"): drena
 * as linhas SEM LOTE com saldo, a localização resolvida primeiro (a origem declarada ou a padrão),
 * depois as maiores. Só o que SOBRAR vai para a linha da localização resolvida (ou `NULL`), que
 * pode ficar negativa — é o "sem localização atribuída", no molde do "sem lote atribuído" das
 * Etapas 49/50. Linha de LOTE nunca é tocada aqui (B204: a entrega não escolhe lote).
 *
 * **Diferença deliberada do claim de lote — relê em vez de pular** (Fase 2 da etapa, sonda de
 * concorrência): no lote, um débito condicional que não casa vira RECUSA; aqui o resto seria
 * negativado em silêncio. Duas saídas simultâneas de 60 com A:100 davam A:40 e NULL:−60 — o
 * perdedor leu 100, falhou o débito e pulou a linha que ainda tinha 40. Agora, se o débito não
 * casar, relê a linha e tira o que houver nela.
 *
 * Devolve TODAS as linhas debitadas (inclusive a do resto), para as compensações da saída
 * (série recusada, INSERT do ledger falhando) devolverem exatamente o que foi tirado.
 */
async function claimSaldoSemLote(db, materialId, locPreferida, quantidade) {
  const linhas = await dbAll(db, `
    SELECT id FROM estoque_saldo_almoxarifado
    WHERE material_id = ? AND lote_id IS NULL AND quantidade > 0
    ORDER BY (localizacao_id IS ?) DESC, quantidade DESC, id`,
  [materialId, locPreferida || null]);

  const aplicados = [];
  let restante = quantidade;
  for (const linha of linhas) {
    if (restante <= EPS) break;
    for (let tentativa = 0; tentativa < 3; tentativa++) {
      const atual = await dbGet(db, 'SELECT quantidade FROM estoque_saldo_almoxarifado WHERE id = ?', [linha.id]);
      const disponivel = Number(atual?.quantidade) || 0;
      if (disponivel <= EPS) break;
      const take = Math.min(restante, disponivel);
      const claim = await dbGet(db, `UPDATE estoque_saldo_almoxarifado
        SET quantidade = ${Q.qtdSql('quantidade - ?')}, updated_at = CURRENT_TIMESTAMP
        WHERE id = ? AND quantidade >= ? ${Q.FOLGA_SQL}
        RETURNING id`, [take, linha.id, take]);
      if (claim) {
        aplicados.push({ id: linha.id, quantidade: take });
        restante = Q.qtd(restante - take);
        break;
      }
    }
  }

  if (restante > EPS) {
    const saldo = await getOrCreateSaldo(db, materialId, locPreferida, null);
    await dbRun(db, `UPDATE estoque_saldo_almoxarifado
      SET quantidade = ${Q.qtdSql('quantidade - ?')}, updated_at = CURRENT_TIMESTAMP WHERE id = ?`, [restante, saldo.id]);
    aplicados.push({ id: saldo.id, quantidade: restante });
  }
  return aplicados;
}

/**
 * Etapa 51 (RN-04) — nenhum AJUSTE com localização deixa o físico negativo em material que não o
 * permite. O AJUSTE com localização grava o valor absoluto na linha e recalcula `quantidade_atual`
 * pela SOMA das linhas — e uma linha negativa "sem localização atribuída" (herança da saída antiga)
 * entrava nessa soma: A:0, B:20, NULL:−45 dava físico −25 num material sem negativo.
 *
 * **Absorve em vez de recusar** (Fase 2, CRITICAL): recusar travaria para sempre o material com
 * lote — entrada de 100 no lote L2 em A e entrega sem lote deixam A/L2:100 e NULL:−100, e a contagem
 * verdadeira "L2 em A = 0" seria barrada, sem outro caminho para zerar linha de lote. Então as
 * linhas SEM LOTE NEGATIVAS (a `NULL/NULL` primeiro, depois as mais negativas) sobem até o total dar
 * 0. Devolve o déficit que sobrar (> 0 = nem absorvendo tudo o total chega a 0 → o chamador recusa).
 */
async function absorverNegativosSemLote(db, materialId, { excluirId = null } = {}) {
  const tot = await dbGet(db, 'SELECT COALESCE(SUM(quantidade),0) as total FROM estoque_saldo_almoxarifado WHERE material_id = ?',
    [materialId]);
  let deficit = -(Number(tot.total) || 0);
  if (deficit <= EPS) return 0;
  const negativas = await dbAll(db, `SELECT id, quantidade FROM estoque_saldo_almoxarifado
    WHERE material_id = ? AND lote_id IS NULL AND quantidade < 0 AND id IS NOT ?
    ORDER BY (localizacao_id IS NULL) DESC, quantidade ASC, id`, [materialId, excluirId]);
  for (const n of negativas) {
    if (deficit <= EPS) break;
    const sobe = Math.min(deficit, -Number(n.quantidade));
    await dbRun(db, `UPDATE estoque_saldo_almoxarifado SET quantidade = ${Q.qtdSql('quantidade + ?')}, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
      [sobe, n.id]);
    deficit -= sobe;
  }
  return deficit > EPS ? deficit : 0;
}

/**
 * Mantém a linha de saldo "sem localização explícita" (ou a da localização padrão do material,
 * se houver) coerente com `quantidade_atual` depois de um AJUSTE sem localização — que define o
 * total do material por um valor absoluto, sem dizer onde ele está.
 *
 * Antes do review round 3 desta task, esta função era no-op quando o material não tinha
 * `localizacao_padrao_id`, e também devolvia cedo quando já existia OUTRA linha de saldo
 * positiva — em vez de reconciliar, simplesmente não fazia nada. Como `syncMaterialTotals`
 * (chamada pelo AJUSTE-com-localização e pelo estorno de qualquer AJUSTE) recalcula
 * `quantidade_atual` pela SOMA de todas as linhas do material, uma linha desatualizada aqui fazia
 * essa soma ressuscitar quantidade já removida ou evaporar quantidade real assim que um
 * AJUSTE-com-localização rodasse depois — achado do review round 3, mesma classe do −8 original.
 *
 * Agora escreve o valor RESIDUAL na linha (localização padrão, ou `null` se não houver; lote
 * indicado por `loteId`, se houver): o total absoluto do material menos a soma de TODAS as
 * outras linhas conhecidas. Isso preserva quantidade já distribuída em localizações/lotes reais,
 * em vez de sobrescrever cegamente com o total inteiro.
 */
async function syncSaldoLocalizacaoPadrao(db, materialId, loteId = null, { drenar = false } = {}) {
  const material = await getMaterial(db, materialId);
  const locKey = material.localizacao_padrao_id || null;
  const materialQty = material.quantidade_atual || 0;

  const saldo = await getOrCreateSaldo(db, materialId, locKey, loteId);
  const outras = await dbGet(db,
    'SELECT COALESCE(SUM(quantidade),0) as total FROM estoque_saldo_almoxarifado WHERE material_id = ? AND id != ?',
    [materialId, saldo.id]);
  let novaLinha = materialQty - (outras.total || 0);
  // Etapa 51 (RN-03): AJUSTE absoluto sem localização PARA BAIXO drena os endereços sem lote com
  // saldo antes de negativar a linha padrão/NULL — senão A30 e B20 ajustados para 5 davam A:30,
  // B:20, NULL:−45, e os dois endereços pareciam ocupados com o material quase zerado.
  // `drenar` só vem ligado do AJUSTE de ida: esta função também serve à reconciliação de estorno e
  // às compensações, e drenar ali mudaria caminhos que ninguém pediu (Fase 2, MINOR 5).
  if (drenar && !loteId && novaLinha < -EPS) {
    const positivas = await dbAll(db, `SELECT id, quantidade FROM estoque_saldo_almoxarifado
      WHERE material_id = ? AND lote_id IS NULL AND quantidade > 0 AND id != ?
      ORDER BY quantidade DESC, id`, [materialId, saldo.id]);
    for (const p of positivas) {
      if (novaLinha >= -EPS) break;
      const tira = Math.min(-novaLinha, Number(p.quantidade));
      await dbRun(db, `UPDATE estoque_saldo_almoxarifado SET quantidade = ${Q.qtdSql('quantidade - ?')}, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
        [tira, p.id]);
      novaLinha += tira;
    }
  }
  await dbRun(db,
    'UPDATE estoque_saldo_almoxarifado SET quantidade = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
    [Q.qtd(novaLinha), saldo.id]); // Etapa 96 (Fase 2, I4): calculada em JS, gravada absoluta
}

/**
 * Decide o que fazer quando o estorno de ENTRADA/SAIDA não achou a linha de saldo que ele queria
 * ajustar. **Este é o discriminador de verdade da reconciliação no estorno**, e o round 4 o errou:
 * ele usou "existe linha para ESTA chave?" e tratou todo miss como no-op. A pergunta certa é
 * **"o MATERIAL já tem alguma linha?"** — ou seja, ele já está sob o regime "a soma das linhas é a
 * verdade"?
 *
 *  - **Zero linhas** → material legado puro: `quantidade_atual` é a única fonte de verdade dele, e
 *    `syncMaterialTotals` nem toca em material sem linha. Não há nada para reconciliar, e criar
 *    linha aqui é exatamente o Critical que o round 4 fechou (linha negativa fantasma que inverte a
 *    primeira contagem). No-op, de propósito.
 *  - **Já tem linha** → o material está sob o regime da soma. Ignorar o estorno faria
 *    `quantidade_atual` desgarrar da soma, e a PRÓXIMA contagem por localização (que reconcilia
 *    pela soma) apagaria o estorno silenciosamente. O residual precisa aterrissar em algum lugar —
 *    e o lugar já existe: `syncSaldoLocalizacaoPadrao` grava `quantidade_atual − soma das outras
 *    linhas` na linha "sem localização explícita" (ou na da localização padrão).
 *
 * Por que o miss acontece mesmo em movimento NÃO legado (Critical do round 5): a chave do estorno
 * resolve `material.localizacao_padrao_id` **de hoje**, enquanto o forward escreveu a linha com o
 * padrão vigente **na época** do movimento. O gatilho é o próprio rollout da Etapa 6 — material sem
 * endereço recebe movimento e só depois ganha `localizacao_padrao_id` —, e também a simples troca
 * de endereço padrão. Nesse caso o `WHERE` erra uma linha que EXISTE, e o miss fica indistinguível
 * do caso legado olhando só a chave. Olhando o material, não fica: ele tem linha, então reconcilia.
 *
 * **O `COUNT(*)` conta linhas com `quantidade = 0`, e isso deixou de ser um problema no review
 * final da Etapa 6.** A objeção registrada como minor da Task 3 era concreta: `getOrCreateSaldo`
 * criava a linha ANTES do claim, então uma saída por lote RECUSADA deixava um `(loc, lote, 0)`
 * para trás e esse artefato tirava do no-op um material que era legado — a contagem seguinte
 * devolvia 130 onde a regra do cliente diz 40. A fonte foi fechada na raiz: a saída por lote
 * agora debita linhas existentes (`claimSaldoDoLote`) e não cria nenhuma. Não foi presumido —
 * `loteGuardasSaida.api.test.js` tem o caso "material legado continua no no-op do estorno depois
 * de uma saida RECUSADA", que mede o 40. A variante `AND quantidade != 0` continua **não** sendo
 * usada de propósito: ela tem o canto errado simétrico (um material contado e zerado de verdade
 * voltaria a ser tratado como legado).
 */
async function reconciliarEstornoSemLinha(db, materialId, loteId) {
  const linhas = await dbGet(db,
    'SELECT COUNT(*) as n FROM estoque_saldo_almoxarifado WHERE material_id = ?', [materialId]);
  if (!linhas || linhas.n === 0) return false;
  await syncSaldoLocalizacaoPadrao(db, materialId, loteId);
  return true;
}

function resolveLocalizacaoEntrada(material, destinoId) {
  return destinoId || material.localizacao_padrao_id || null;
}

function resolveLocalizacaoSaida(material, origemId) {
  return origemId || material.localizacao_padrao_id || null;
}

/**
 * Restrições de endereço (Etapa 2, Task 2): valida se uma localização pode participar de um
 * movimento no papel indicado ('origem'|'destino'), ANTES de qualquer efeito de saldo ser
 * aplicado (chamado pelo registrarMovimentacao antes das UPDATEs atômicas).
 * - bloqueada=1 rejeita sempre, independente do papel (não é possível nem tirar nem colocar
 *   material numa localização bloqueada).
 * - tipos_material_permitidos (JSON array de strings; NULL = sem restrição) só é avaliado no
 *   papel 'destino' — restringir por tipo faz sentido para "o que pode entrar aqui", não para
 *   "o que pode sair daqui" (uma localização pode ficar temporariamente com material fora da
 *   política vigente, ex.: política mudou depois que o material já estava lá).
 * localizacaoId ausente (null/undefined) é no-op: resolveLocalizacaoEntrada/Saida já retornam
 * null quando não há localização explícita nem localizacao_padrao_id no material.
 * NÃO é chamado por cancelarMovimentacao (estorno): reverter precisa sempre ser possível, mesmo
 * numa localização bloqueada depois do movimento original — ver comentário em cancelarMovimentacao.
 */
/**
 * Etapa 53 (RN-01) — a regra de "este endereço aceita este material neste papel", PURA e ÚNICA.
 * Devolve a mensagem de recusa (a MESMA literal que o motor sempre lançou) ou `null`. O motor
 * (`validarLocalizacaoParaMovimento`) e a sugestão de localização usam esta função, e por isso a
 * sugestão nunca propõe um endereço que o motor recusaria. Vale para os DOIS papéis: o bloqueio
 * recusa na origem também (Fase 2 da etapa — um predicado só de destino deixaria uma 2ª cópia).
 */
function motivoRecusaEndereco(loc, material, papel) {
  if (!loc) return null;
  if (loc.bloqueada) return `Localização ${loc.codigo} está bloqueada`;
  if (papel === 'destino' && loc.tipos_material_permitidos) {
    let permitidos;
    try {
      permitidos = JSON.parse(loc.tipos_material_permitidos);
    } catch (e) {
      permitidos = null; // JSON corrompido — defensivo: trata como sem restrição
    }
    // Lista vazia ([]) tem a MESMA semântica de NULL/ausente: "sem restrição" — não "nenhum tipo
    // permitido". A rota já normaliza [] para NULL na gravação, mas o helper trata o caso aqui
    // também (defesa em profundidade: dado escrito por outro caminho, ex. SQL direto/migração).
    if (Array.isArray(permitidos) && permitidos.length > 0 && !permitidos.includes(material.tipo_material)) {
      return `Localização ${loc.codigo} não aceita o tipo de material '${material.tipo_material || ''}'`;
    }
  }
  return null;
}

/**
 * Etapa 68 (D2) — a chave da area especial de um ROTULO de tipo (`AREAS_ESPECIAIS`), ou null.
 */
function areaEspecialDe(tipo) {
  const a = tipo ? AREAS_ESPECIAIS[tipo] : null;
  return a ? a.chave : null;
}

/**
 * Etapa 68 (Fase 2) — a area EFETIVA de uma localizacao: o tipo proprio se for area, senao o do
 * ancestral MAIS PROXIMO que for area (o assistente grava 'Prateleira' nas posicoes de dentro da
 * area). `porId` e um Map id -> { id, parent_id, tipo }. Guarda de ciclo: parent_id e editavel por
 * SQL e um ciclo travaria a subida. Devolve { chave, localizacao_id } (a linha que da a area) ou null.
 *
 * Fase 5: ANCESTRAL INATIVO encerra a subida — uma area desativada nao da semantica a ninguem. Antes
 * o servidor subia para o pai inativo (o filho seguia "sucata" no aviso, na sugestao e na origem do
 * sucateamento) enquanto o Mapa, que so lista ativas, parava nele. A PROPRIA localizacao vale pelo
 * tipo mesmo inativa (o aviso-area de uma inativa responde normal — Etapa 54). `ativo` ausente no
 * Map (chamador antigo) conta como ativo.
 */
function resolverAreaEfetiva(porId, localizacaoId) {
  const vistos = new Set();
  let atual = porId.get(Number(localizacaoId));
  while (atual && !vistos.has(atual.id)) {
    vistos.add(atual.id);
    const chave = areaEspecialDe(atual.tipo);
    if (chave) return { chave, localizacao_id: atual.id };
    atual = atual.parent_id ? porId.get(Number(atual.parent_id)) : null;
    if (atual && atual.ativo !== undefined && Number(atual.ativo) !== 1) return null;
  }
  return null;
}

async function carregarArvoreLocalizacoes(db) {
  const linhas = await dbAll(db, 'SELECT id, parent_id, tipo, ativo FROM localizacoes_almoxarifado');
  return new Map(linhas.map((l) => [Number(l.id), l]));
}

/** Etapa 68: a chave da area efetiva de UMA localizacao (null se nao esta em area). */
async function areaEfetivaDaLocalizacao(db, localizacaoId) {
  const r = resolverAreaEfetiva(await carregarArvoreLocalizacoes(db), localizacaoId);
  return r ? r.chave : null;
}

/**
 * Etapa 68 (RN-04, D1) — a frase de AVISO de guardar `material` em `loc`, ou null. PURA, ao lado de
 * `motivoRecusaEndereco` e no mesmo formato, mas NUNCA vira recusa (licao B217: a entrada sem destino
 * cai na padrao). Apertar depois e trocar o aviso por `throw` aqui. `loc.area_especial` (chave da
 * area EFETIVA, ja resolvida pela arvore) vale sobre o tipo da propria linha; sem ele, usa o tipo.
 * MATERIAIS_CLIENTE so avisa material PROPRIO (sem material, nao da para saber o dono → null).
 */
function avisoAreaEspecial(loc, material) {
  if (!loc) return null;
  const chave = loc.area_especial !== undefined ? loc.area_especial : areaEspecialDe(loc.tipo);
  const c = loc.codigo;
  switch (chave) {
    case 'QUARENTENA':
      return `Localização ${c} é área de quarentena/inspeção, mas guardar aqui não retém o material — ele continua disponível. Para reter, use Inspeções ou o bloqueio.`;
    case 'EXPEDICAO':
      // Fase 2: sem "não daqui" — o "Sai de" da entrega pode ser a propria area.
      return `Localização ${c} é área de expedição, mas a requisição não usa este endereço — a entrega baixa da origem separada.`;
    case 'SUCATA':
      return `Localização ${c} é área de sucata, mas guardar aqui não sucateia — o material continua no estoque disponível até o sucateamento aprovado.`;
    case 'DEVOLUCOES':
      return `Localização ${c} é área de devoluções, mas guardar aqui não muda o estado do material — ele continua disponível.`;
    case 'MATERIAIS_CLIENTE':
      if (!material || material.proprietario_cliente_id) return null;
      return `Localização ${c} é área de materiais do cliente, e ${material.codigo} é material próprio.`;
    default:
      return null;
  }
}

/**
 * Etapa 54 (RN-01/RN-02) — o endereço INFORMADO no movimento tem de existir e, como destino, estar
 * ativo. Só o id EXPLÍCITO: a entrada sem destino que cai na padrão NÃO passa por aqui (Fase 2 —
 * recusar a padrão inativa travava recebimento, exclusão de requisição e retorno de terceiros, que
 * não têm campo de destino). A padrão inativa é impedida na origem: não se desativa localização que
 * é padrão de material ativo, e o cadastro não aceita padrão inativa (RN-04/RN-05).
 * `aceitaInativa`: o AJUSTE precisa conseguir zerar um endereço desativado (RN-03, checado no ramo).
 */
async function validarEnderecoExplicito(db, localizacaoId, papel, { aceitaInativa = false } = {}) {
  // Fase 5: 0 tambem e "nao informado" — o resto do motor (e o retalho, `localizacaoId || undefined`)
  // ja tratava 0 como ausente; so aqui ele virava "nao encontrada".
  if (localizacaoId === undefined || localizacaoId === null || localizacaoId === '' || Number(localizacaoId) === 0) return null;
  const loc = await dbGet(db, 'SELECT * FROM localizacoes_almoxarifado WHERE id = ?', [localizacaoId]);
  if (!loc) throw Object.assign(new Error(`Localização de ${papel} não encontrada`), { status: 400 });
  if (papel === 'destino' && !aceitaInativa && Number(loc.ativo) !== 1) {
    throw Object.assign(new Error(`Localização ${loc.codigo} está inativa`), { status: 400 });
  }
  return loc;
}

/**
 * Etapa 54 (RN-04): materiais ATIVOS que têm esta localização como padrão. Desativar uma delas
 * armaria a armadilha: a próxima entrada sem destino (recebimento, requisição excluída) cairia num
 * endereço que o mapa não mostra.
 */
async function materiaisComPadrao(db, localizacaoId) {
  return dbAll(db, `SELECT codigo FROM materiais_almoxarifado WHERE ativo = 1 AND localizacao_padrao_id = ?
    ORDER BY codigo`, [localizacaoId]);
}

/**
 * Etapa 56 (RN-02) — confirmação do endereço por leitura da etiqueta. Opcional: ausente, nada muda.
 * O texto lido é validado AQUI (e não só no Zod) porque `/transferencias` repassa o body cru.
 */
function normalizarCodigoLido(valor) {
  if (valor === undefined || valor === null) return null;
  if (typeof valor !== 'string') throw Object.assign(new Error('Endereço lido inválido'), { status: 400 });
  const s = valor.trim();
  if (!s) return null;
  if (s.length > 100) throw Object.assign(new Error('Endereço lido inválido'), { status: 400 });
  return s;
}

/** Compara o lido com o código da localização efetiva do papel; devolve o código DA LOCALIZAÇÃO. */
async function conferirLeitura(db, lido, localizacaoId, papel) {
  const loc = localizacaoId
    ? await dbGet(db, 'SELECT codigo FROM localizacoes_almoxarifado WHERE id = ?', [localizacaoId])
    : null;
  if (!loc) {
    throw Object.assign(new Error(`Endereço lido (${lido}), mas o movimento não tem localização de ${papel}`), { status: 400 });
  }
  if (String(loc.codigo).toLowerCase() !== lido.toLowerCase()) {
    throw Object.assign(new Error(
      `Endereço lido (${lido}) não confere com a localização de ${papel} (${loc.codigo}) — se a etiqueta é antiga, reimprima`,
    ), { status: 400 });
  }
  return loc.codigo;
}

async function validarLocalizacaoParaMovimento(db, localizacaoId, material, papel) {
  if (!localizacaoId) return;
  const loc = await dbGet(db, 'SELECT * FROM localizacoes_almoxarifado WHERE id = ?', [localizacaoId]);
  if (!loc) return; // localização inexistente: não é responsabilidade deste helper (FK/lookup trata em outro lugar)
  const recusa = motivoRecusaEndereco(loc, material, papel);
  if (recusa) throw Object.assign(new Error(recusa), { status: 400 });
}

/**
 * Etapa 53 (RN-02) — sugestão de localização para uma ENTRADA. Só oferece: quem decide é o motor.
 * `padrao` diz se a localização padrão recebe o material — se não recebe, a entrada SEM destino é
 * recusada pelo motor, e a tela precisa avisar (Fase 2: a RN-04 do desenho dizia o contrário).
 * `sugestoes`, sem repetição e só endereços ATIVOS, de almoxarifado ativo, que a regra aceita:
 *   1. PADRAO — a padrão;
 *   2. JA_TEM_O_MATERIAL — onde o material já tem saldo, maiores primeiro (consolidar);
 *   3. VAZIA_COMPATIVEL — vazias pela régua da Etapa 52, SEM filho ativo (contêiner não é vaga),
 *      no máximo 5, as do almoxarifado da padrão primeiro.
 */
async function sugerirLocalizacaoEntrada(db, materialId) {
  const material = await getMaterial(db, materialId);
  if (!material) throw Object.assign(new Error('Material não encontrado'), { status: 404 });
  if (!material.ativo) throw Object.assign(new Error('Material inativo não pode ser movimentado'), { status: 400 });

  const LOC_SQL = `SELECT l.*, a.ativo as almoxarifado_ativo, a.codigo as almoxarifado_codigo, p.codigo as parent_codigo,
      COALESCE(a.codigo || ' / ', '') || COALESCE(NULLIF(l.setor, '') || ' / ', '')
        || COALESCE(p.codigo || ' / ', '') || l.codigo as endereco_completo,
      EXISTS (SELECT 1 FROM localizacoes_almoxarifado f WHERE f.parent_id = l.id AND f.ativo = 1) as tem_filho_ativo
    FROM localizacoes_almoxarifado l
    LEFT JOIN almoxarifados a ON l.almoxarifado_id = a.id
    LEFT JOIN localizacoes_almoxarifado p ON l.parent_id = p.id`;
  // Um endereço é SUGERÍVEL quando está ativo, num almoxarifado ativo, não é contêiner (pai com filho
  // ativo) e a regra do motor o aceita. Fase 5: o filtro de "pai" só valia para as vazias — um pai
  // com saldo, ou uma padrão que é pai, eram sugeridos. Agora vale para os três caminhos.
  const sugerivel = (loc) => loc && Number(loc.ativo) === 1 && loc.almoxarifado_ativo !== 0
    && !Number(loc.tem_filho_ativo) && !motivoRecusaEndereco(loc, material, 'destino');
  // Etapa 68 (D5, RN-06/RN-07): "ja tem" e "vazia" nao propoem AREA ESPECIAL (efetiva, pela arvore)
  // como vaga comum — uma compra ia para a quarentena vazia. Excecao: area de materiais do cliente
  // para material DE CLIENTE. A PADRAO nao passa por aqui (cadastro explicito, continua sugerida):
  // `sugerivel` fica separado por caminho (Fase 2). Muda o CONJUNTO, nao o formato da Etapa 53.
  const arvore = await carregarArvoreLocalizacoes(db);
  const ehDeCliente = !!material.proprietario_cliente_id;
  const areaDe = (loc) => { const a = resolverAreaEfetiva(arvore, loc.id); return a ? a.chave : null; };
  const vagaComum = (loc) => {
    const area = areaDe(loc);
    return !area || (area === 'MATERIAIS_CLIENTE' && ehDeCliente);
  };
  const sugerivelComoVaga = (loc) => sugerivel(loc) && vagaComum(loc);

  let padrao = null;
  const sugestoes = [];
  const vistos = new Set();
  const incluir = (loc, motivo, quantidade = 0) => {
    if (vistos.has(loc.id)) return;
    vistos.add(loc.id);
    sugestoes.push({
      localizacao_id: loc.id, codigo: loc.codigo, endereco_completo: loc.endereco_completo,
      motivo, quantidade_no_endereco: quantidade,
    });
  };

  if (material.localizacao_padrao_id) {
    const loc = await dbGet(db, `${LOC_SQL} WHERE l.id = ?`, [material.localizacao_padrao_id]);
    if (loc) {
      const recusa = motivoRecusaEndereco(loc, material, 'destino');
      // Fase 5 (I-2): a padrão INATIVA (ou de almoxarifado inativo) não é recusada pelo motor — a
      // entrada sem destino cai nela sem aviso (defeito do motor, letra C). A tela avisa por `inativa`.
      const inativa = Number(loc.ativo) !== 1 || loc.almoxarifado_ativo === 0;
      padrao = { localizacao_id: loc.id, codigo: loc.codigo, recusa, inativa };
      if (sugerivel(loc)) {
        const q = await dbGet(db, `SELECT COALESCE(SUM(quantidade),0) q FROM estoque_saldo_almoxarifado
          WHERE material_id = ? AND localizacao_id = ?`, [materialId, loc.id]);
        incluir(loc, 'PADRAO', Number(q.q) || 0);
      }
    }
  }

  // A quantidade vem do próprio JOIN (sem N+1), e no máximo 10 posições (Fase 5, M-4).
  const comSaldo = await dbAll(db, `${LOC_SQL.replace('FROM localizacoes_almoxarifado l', ', sd.q as q_material FROM localizacoes_almoxarifado l')}
    JOIN (SELECT localizacao_id, SUM(quantidade) q FROM estoque_saldo_almoxarifado
          WHERE material_id = ? AND localizacao_id IS NOT NULL GROUP BY localizacao_id HAVING SUM(quantidade) > 0) sd
      ON sd.localizacao_id = l.id
    ORDER BY sd.q DESC, l.id`, [materialId]);
  let jaTem = 0;
  for (const loc of comSaldo) {
    if (jaTem >= 10) break;
    if (sugerivelComoVaga(loc) && !vistos.has(loc.id)) { incluir(loc, 'JA_TEM_O_MATERIAL', Number(loc.q_material) || 0); jaTem += 1; }
  }

  const almoxPadrao = padrao
    ? (await dbGet(db, 'SELECT almoxarifado_id FROM localizacoes_almoxarifado WHERE id = ?', [padrao.localizacao_id]))?.almoxarifado_id
    : null;
  // Fase 5 (M-2): endereço com saldo NEGATIVO deste material não é "vazio" — o rótulo enganaria.
  const negativos = new Set((await dbAll(db, `SELECT localizacao_id FROM estoque_saldo_almoxarifado
    WHERE material_id = ? AND localizacao_id IS NOT NULL GROUP BY localizacao_id HAVING SUM(quantidade) < 0`,
  [materialId])).map((r) => r.localizacao_id));
  const idsVazias = (await listarLocalizacoesVazias(db)).map((l) => l.id)
    .filter((id) => !vistos.has(id) && !negativos.has(id));
  const candidatas = [];
  for (const id of idsVazias) {
    const loc = await dbGet(db, `${LOC_SQL} WHERE l.id = ?`, [id]);
    if (sugerivelComoVaga(loc)) candidatas.push(loc);
  }
  // Fase 5 (M-3): só ordena pelo almoxarifado da padrão quando HÁ padrão — sem ela, `null === null`
  // jogava para o topo as vazias sem almoxarifado.
  // Etapa 68 (RN-07): UMA ordenação por chave composta — área de cliente primeiro (só chega aqui para
  // material de cliente), depois o almoxarifado da padrão. Dois `sort` em cadeia desfariam um ao outro.
  const peso = (loc) => [
    areaDe(loc) === 'MATERIAIS_CLIENTE' ? 1 : 0,
    almoxPadrao != null && loc.almoxarifado_id === almoxPadrao ? 1 : 0,
  ];
  candidatas.sort((a, b) => {
    const pa = peso(a); const pb = peso(b);
    return (pb[0] - pa[0]) || (pb[1] - pa[1]);
  });
  for (const loc of candidatas.slice(0, 5)) incluir(loc, 'VAZIA_COMPATIVEL', 0);

  return { padrao, sugestoes };
}

// `quantidade_reservada` SAIU deste mapa no review final da Etapa 6. A Task 2 removeu a coluna de
// `estoque_saldo_almoxarifado` (nunca teve escritor) e este SQL passou a devolver `0 as reservado`
// fixo — um numero que so podia ser zero, alimentando um mostrador "Reservado" na tela do mapa
// (`MapaLocalizacoesAlmoxarifado.js`) que mentia por construcao. Retencao NAO existe por
// localizacao: mora em `materiais_almoxarifado` (por material) ou no lote inteiro (por status).
// Devolver o campo zerado era pior do que nao devolver — sugeria uma dimensao que o sistema nao
// modela. Este mapa e so por localizacao fisica.
/**
 * Etapa 52 (RN-01): a REGRA UNICA de ocupacao de localizacao - uma linha (loc_id, material_id, qty)
 * por material que ocupa um endereco: as linhas de saldo COM endereco e quantidade > 0, mais o
 * FALLBACK do legado (material ativo com padrao e fisico > 0 e nenhuma linha enderecada positiva
 * ocupa a padrao). Usada pelo mapa, pela lista de localizacoes vazias e pela guarda de apagar/
 * desativar localizacao - antes eram tres reguas, e a lista dava como vazia o que o mapa mostrava
 * com 40 (S8 da Fase 0 da Etapa 51), e o DELETE apagava localizacao ocupada so pelo legado.
 */
const OCUPACAO_SQL = `
      SELECT localizacao_id as loc_id, material_id, quantidade as qty
      FROM estoque_saldo_almoxarifado
      WHERE localizacao_id IS NOT NULL AND quantidade > 0
      UNION ALL
      -- Fallback "material sem enderecamento": mostra o total do material na sua localizacao
      -- padrao enquanto o saldo dele nao estiver quebrado por endereco. O localizacao_id IS NOT
      -- NULL na condicao (achado do review round 4, Etapa 6 Task 3): a linha (NULL, ...) e
      -- justamente saldo SEM endereco — conta-la como "ja tem endereco" derrubava este fallback e
      -- o material sumia do mapa (nem aparece no ramo de cima, que filtra localizacao_id IS NOT
      -- NULL). O relatorio materiais-sem-endereco (routes/almoxarifado/extended.js) ja usava essa
      -- mesma qualificacao. Sem duplicar: quando ha linha COM endereco, o ramo de cima conta e
      -- este fallback nao dispara.
      -- Etapa 8, Task 1, classe C: este ramo soma OCUPACAO FISICA por localizacao e por isso
      -- NAO filtra o dono. A chapa do cliente ocupa a prateleira de verdade; esconde-la faria o
      -- mapa mentir sobre espaco livre. O segundo subselect deste mesmo SQL (contadores de
      -- baixo_minimo/critico) filtra, porque mede REPOSICAO. Os dois discordam porque medem
      -- coisas diferentes — nao "uniformizar".
      SELECT m.localizacao_padrao_id, m.id, m.quantidade_atual
      FROM materiais_almoxarifado m
      WHERE m.ativo = 1 AND m.localizacao_padrao_id IS NOT NULL AND m.quantidade_atual > 0
        AND NOT EXISTS (
          SELECT 1 FROM estoque_saldo_almoxarifado s
          WHERE s.material_id = m.id AND s.localizacao_id IS NOT NULL AND s.quantidade > 0
        )
`;

const MAPA_LOCALIZACOES_SQL = `
  SELECT l.*,
    COALESCE(s.qtd_itens, 0) as qtd_itens,
    COALESCE(s.quantidade_total, 0) as quantidade_total,
    COALESCE(m.itens_baixo_minimo, 0) as itens_baixo_minimo,
    COALESCE(m.itens_criticos, 0) as itens_criticos
  FROM localizacoes_almoxarifado l
  LEFT JOIN (
    SELECT loc_id,
      COUNT(DISTINCT material_id) as qtd_itens,
      SUM(qty) as quantidade_total
    FROM (
      ${OCUPACAO_SQL}
    ) combined
    GROUP BY loc_id
  ) s ON s.loc_id = l.id
  LEFT JOIN (
    SELECT loc_id,
      SUM(CASE WHEN qty > 0 AND qty_min > 0 AND qty <= qty_min THEN 1 ELSE 0 END) as itens_baixo_minimo,
      SUM(CASE WHEN qty <= 0 AND qty_min > 0 THEN 1 ELSE 0 END) as itens_criticos
    FROM (
      SELECT m.localizacao_padrao_id as loc_id,
        COALESCE((
          SELECT SUM(s.quantidade) FROM estoque_saldo_almoxarifado s
          WHERE s.material_id = m.id AND s.localizacao_id = m.localizacao_padrao_id AND s.quantidade > 0
        ),
        -- mesmo fallback (e mesmo localizacao_id IS NOT NULL) do bloco de cima: sem isto, um
        -- material com saldo so na linha sem endereco entrava aqui com qty = 0 e era contado como
        -- item CRITICO da sua localizacao padrao, tendo estoque.
        CASE WHEN NOT EXISTS (
          SELECT 1 FROM estoque_saldo_almoxarifado s2
          WHERE s2.material_id = m.id AND s2.localizacao_id IS NOT NULL AND s2.quantidade > 0
        ) THEN m.quantidade_atual ELSE 0 END) as qty,
        m.quantidade_minima as qty_min
      FROM materiais_almoxarifado m
      WHERE m.ativo = 1 AND m.localizacao_padrao_id IS NOT NULL
        -- Etapa 8, Task 1, classe A: este subselect conta REPOSICAO (abaixo do minimo /
        -- critico), nao ocupacao fisica. O subselect de cima (soma de quantidade por
        -- localizacao) NAO filtra o dono de proposito — ver a nota la. Nao "uniformizar".
        AND m.proprietario_cliente_id IS NULL
    ) mat_loc
    GROUP BY loc_id
  ) m ON m.loc_id = l.id
  WHERE l.ativo = 1
  ORDER BY l.setor, l.parent_id, l.subgrupo, l.codigo`;

async function consultarMapaLocalizacoes(db) {
  return dbAll(db, MAPA_LOCALIZACOES_SQL);
}

/**
 * Etapa 52 (RN-01/03): localizações ATIVAS vazias pela mesma régua do mapa (`OCUPACAO_SQL`) —
 * nenhuma localização pode estar ocupada no mapa e vazia aqui, nem o contrário.
 * O endereço é montado no SELECT (a varredura do registro de relatórios confere as colunas contra o
 * SQL real): almoxarifado / setor / pai / código, pulando as partes vazias, como a rota montava em JS.
 * `sub_ocupadas` conta os FILHOS ativos ocupados: o pai sem saldo direto aparece (o invariante com o
 * mapa exige), e a coluna diz que ele é um contêiner.
 */
async function listarLocalizacoesVazias(db) {
  return dbAll(db, `
    SELECT l.*, a.codigo as almoxarifado_codigo, p.codigo as parent_codigo,
      COALESCE(a.codigo || ' / ', '') || COALESCE(NULLIF(l.setor, '') || ' / ', '')
        || COALESCE(p.codigo || ' / ', '') || l.codigo as endereco_completo,
      (SELECT COUNT(*) FROM localizacoes_almoxarifado f
        WHERE f.parent_id = l.id AND f.ativo = 1
          AND EXISTS (SELECT 1 FROM (${OCUPACAO_SQL}) oc WHERE oc.loc_id = f.id)) as sub_ocupadas
    FROM localizacoes_almoxarifado l
    LEFT JOIN almoxarifados a ON l.almoxarifado_id = a.id
    LEFT JOIN localizacoes_almoxarifado p ON l.parent_id = p.id
    WHERE l.ativo = 1
      AND NOT EXISTS (SELECT 1 FROM (${OCUPACAO_SQL}) oc WHERE oc.loc_id = l.id)
    ORDER BY l.setor, l.parent_id, l.subgrupo, l.codigo`);
}

/**
 * Etapa 52 (RN-04): quantos materiais ocupam a localização, pela régua única. O DELETE e o PUT que
 * desativa localização usam isto — antes o DELETE olhava só `quantidade != 0` e apagava
 * localização ocupada só pelo legado (40 unidades ficavam invisíveis em todas as telas).
 */
async function contarOcupacaoLocalizacao(db, localizacaoId) {
  const r = await dbGet(db, `SELECT COUNT(DISTINCT material_id) as n FROM (${OCUPACAO_SQL}) oc WHERE oc.loc_id = ?`,
    [localizacaoId]);
  return Number(r?.n) || 0;
}

/**
 * `opcoes` é o 4º argumento de propósito, e NÃO vem do body — mesma razão documentada em
 * `criarReserva`: as rotas de movimentação repassam `req.body` inteiro como `params`
 * (`routes/almoxarifado/extended.js`, `POST /movimentacoes/v2`), então qualquer chave lida de
 * `params` é forjável pelo cliente. Uma exigência de lote que o próprio cliente pudesse desligar
 * mandando `exigeLote: false` no JSON não seria exigência nenhuma.
 *
 *  - `opcoes.exigeLote`: **este chamador está num caminho onde o operador tem como informar o
 *    lote.** Ver a nota da guarda de `controle_lote`, mais abaixo, para por que a exigência é
 *    declarada pelo chamador e não deduzida pelo motor.
 */
async function registrarMovimentacao(db, user, params, opcoes = {}) {
  // Etapa 66 (RN-05/RN-06): o motivo do CADASTRO (`motivo_id`) e resolvido AQUI, antes da
  // desestruturacao — ele reescreve `motivo` e `justificativa`, que a regra "exige justificativa",
  // o livro, a auditoria e a fila leem abaixo. Recusa (formato, "os dois", inexistente, inativo,
  // nao serve ao tipo) sai antes de tocar em estoque. Tipo invalido passa intocado e e recusado
  // logo abaixo com a mensagem de hoje. Ver services/almoxarifado/motivoMovimentacao.js.
  params = await motivoMovimentacao.resolverMotivoDoCadastro(db, params);
  const {
    material_id, tipo, quantidade: quantidadeCrua, motivo, motivo_id, referencia, observacoes,
    localizacao_origem_id, localizacao_destino_id, lote, lote_id, projeto_id, os_id, cliente_id,
    documento_vinculado, justificativa, reserva_id, recebimento_id, requisicao_id, centro_custo_id,
    emergencial, custo_unitario: custoInformado, quantidade_reprovada,
  } = params;

  // Etapa 96 (B482): a quantidade pedida e arredondada a 1e-6 AQUI, na porta — o livro e o saldo dizem o mesmo
  // numero (ENTRADA 1,0000004 grava 1, nao 1.0000004). `Q.qtd` nao inventa numero: null/''/booleano viram NaN e caem
  // na recusa de sempre logo abaixo (Fase 2, M1). O que arredonda a 0 cai na recusa de zero de cada porta.
  const quantidade = quantidadeCrua === undefined || quantidadeCrua === null ? quantidadeCrua : Q.qtd(quantidadeCrua);
  if (!user?.id) throw Object.assign(new Error('Usuário responsável obrigatório'), { status: 400 });
  // quantidade 0 só é aceita para AJUSTE com localização (zera aquela localização e recalcula
  // o total do material — espelha o superRefine de MovimentacaoSchema) OU para AJUSTE_INVENTARIO
  // (Etapa 10, achado da revisão final de branch): a conclusão da conferência manda o valor
  // ABSOLUTO contado, e "contei zero" é uma contagem física legítima — sem esta exceção, um
  // material zerado quebrava a conclusão da conferência inteira com "material_id, tipo e
  // quantidade são obrigatórios", e pior: como a pré-validação da rota (routes/almoxarifado.js)
  // não sabia disso, ela aprovava o item e só o motor recusava na hora de aplicar de verdade —
  // exatamente a janela que quebra o tudo-ou-nada de RN-07 (outros itens já aplicados ficavam
  // aplicados, o zerado nunca). Fora desses dois casos, 0 e negativos continuam rejeitados; a
  // checagem não pode usar `!quantidade` porque isso também rejeitaria o 0 legítimo.
  const zeroPermitidoParaAjuste = (tipo === 'AJUSTE' && !!localizacao_destino_id) || tipo === 'AJUSTE_INVENTARIO';
  const quantidadeInvalida = quantidade === undefined || quantidade === null || Number.isNaN(quantidade)
    || quantidade < 0 || (quantidade === 0 && !zeroPermitidoParaAjuste);
  if (!material_id || !tipo || quantidadeInvalida) {
    throw Object.assign(new Error('material_id, tipo e quantidade são obrigatórios'), { status: 400 });
  }
  // Motor não aceita tipo forjado/desconhecido (achado do review final): TIPOS_MOVIMENTO é a
  // única fonte de verdade de tipos válidos. ESTORNO é proibido aqui mesmo estando na lista —
  // linhas ESTORNO só podem nascer do INSERT direto dentro de cancelarMovimentacao.
  if (!TIPOS_MOVIMENTO.includes(tipo) || tipo === 'ESTORNO') {
    throw Object.assign(new Error('Tipo de movimento inválido'), { status: 400 });
  }

  const material = await getMaterial(db, material_id);
  if (!material.ativo) throw Object.assign(new Error('Material inativo não pode ser movimentado'), { status: 400 });

  const permiteNegativo = material.permite_saldo_negativo || (await getConfig(db, 'permite_saldo_negativo_global')) === '1';
  const saldoAnterior = material.quantidade_atual;
  let saldoPosterior = saldoAnterior;

  // Etapa 8c (tarefa extra): as duas listas vinham de literais escritos NAS DUAS declaracoes deste
  // arquivo (aqui e em cancelarMovimentacao, ~:1388) mais uma terceira em clienteEstoqueService.
  // Esquecer a segunda torna o motor assimetrico: a entrada acontece e o estorno dela nao, marcando
  // cancelado=1 com linha de ESTORNO de saldo_anterior == saldo_posterior (foi o quarto defeito que
  // so a EXECUCAO da 8b achou); esquecer a TERCEIRA mente para o cliente. Hoje vem de
  // `movementTypes`, e os comentarios de decisao de cada tipo moram la.
  const tiposEntrada = movementTypes.TIPOS_ENTRADA;
  // Etapa 8: DEVOLUCAO_CLIENTE e SAIDA (decisao 9) — o material sai do predio de volta para o dono.
  // NAO CONFUNDIR com a devolucao da Etapa 7 (ENTRADA_DEVOLUCAO, returnService), onde o material
  // VOLTA para o estoque: direcoes opostas, nomes parecidos. Estando aqui, ela debita saldo, exige
  // lote/serie e resolve endereco de origem como qualquer outra saida — que e o ponto de faze-la
  // passar pelo motor em vez de ser mais uma ilha.
  // Etapa 8b: PERDA_TERCEIRO/CONSUMO_TERCEIRO entram em tiposSaida NOS DOIS lugares deste arquivo
  // (aqui e em cancelarMovimentacao), e a decisao foi tomada olhando CADA ramo, nao por simetria.
  // Aqui: sao saida de verdade — baixam quantidade_atual, escrevem a linha de saldo por
  // localizacao e resolvem endereco de origem como qualquer outra. O que os diferencia e que a
  // quantidade que eles baixam esta RETIDA em quantidade_em_terceiros, nao disponivel — por isso a
  // flag `baixandoTerceiro` abaixo.
  const tiposSaida = movementTypes.TIPOS_SAIDA;
  // Etapa 10: AJUSTE_INVENTARIO tem semantica IDENTICA a AJUSTE (valor absoluto) — entra na MESMA
  // lista, nao numa segunda, para os dois ramos abaixo (validacao e escrita) tratarem os dois
  // tipos igual sem duplicar codigo.
  const tiposAjuste = ['AJUSTE', 'AJUSTE_INVENTARIO'];
  // Consumo de reserva: só quando a saída cita `reserva_id`. RESERVA/LIBERACAO_RESERVA também
  // carregam reserva_id, mas não consomem nada — são o lançamento da própria reserva.
  const consumindoReserva = !!reserva_id && tiposSaida.includes(tipo);
  // Etapa 91 (T4, D(77), B427): `reserva_id` so vale numa saida que consome a reserva. Ate aqui uma
  // ENTRADA/AJUSTE/DEVOLUCAO pela v2 (ou uma TRANSFERENCIA pela `/transferencias`, que repassa o body
  // cru) gravava a coluna no livro e deixava a reserva intocada — o livro dizia que o movimento "era da
  // reserva" sem nada ter acontecido com ela. Vale para QUALQUER origem de reserva (requisicao ou
  // manual). Excecao: RESERVA/LIBERACAO_RESERVA sao os lancamentos internos de `criarReserva` e
  // `liberarReserva` (a v2 nem os aceita — TIPOS_RETENCAO); o estorno nao passa por aqui e nao grava a
  // coluna (`cancelarMovimentacao`). Fica DEPOIS da validacao de tipo e de material (inexistente,
  // inativo) — precedencia preservada — e ANTES de qualquer escrita.
  if (reserva_id != null && reserva_id !== '' && !tiposSaida.includes(tipo)
      && !['RESERVA', 'LIBERACAO_RESERVA'].includes(tipo)) {
    throw Object.assign(new Error(`reserva_id só vale numa saída que consome a reserva — o tipo ${tipo} não consome reserva; tire o reserva_id do movimento`), { status: 400 });
  }
  // Etapa 77 (C136, B407/B408): a reserva de origem REQUISICAO so sai pela ENTREGA da propria
  // requisicao. Ate a 76 o claim abaixo nao olhava a origem: a `POST /movimentacoes/v2` (SAIDA,
  // PERDA, AJUSTE_NEGATIVO, SAIDA_PRODUCAO) consumia a reserva da requisicao e a requisicao seguia
  // TOTALMENTE_RESERVADA com entregue 0 — uma segunda porta de entrega sem separacao, conferencia,
  // assinatura nem retirada. A excecao e a marca `opcoes.requisicaoDaEntrega` — 4o argumento,
  // NUNCA do body/params (molde de `doBloqueado`: a `/transferencias` repassa o body cru e o
  // proximo chamador pode por qualquer coisa em `params`) — e tem de ser a requisicao DONA da
  // reserva. O unico que marca e `requisitionService.entregarRequisicao`.
  // Leitura ANTES de qualquer escrita, sem claim: `origem` e `requisicao_id` nunca mudam depois de
  // criados. `AND material_id = ?` preserva a precedencia de hoje (reserva de outro material sai
  // com "Reserva nao encontrada para este material", no claim); qualquer status (inclusive
  // LIBERADA/CONSUMIDA) recusa com M1 — a regra e "nunca por esta porta", nao "nao agora".
  if (consumindoReserva) {
    const rvReq = await dbGet(db, `SELECT rs.id, rs.origem, rs.requisicao_id, rq.numero
      FROM reservas_material_almoxarifado rs
      LEFT JOIN requisicoes_almoxarifado rq ON rq.id = rs.requisicao_id
      WHERE rs.id = ? AND rs.material_id = ?`, [reserva_id, material_id]);
    if (rvReq && rvReq.origem === 'REQUISICAO' && rvReq.requisicao_id != null
        && Number(opcoes.requisicaoDaEntrega) !== Number(rvReq.requisicao_id)) {
      const numeroReq = rvReq.numero || `#${rvReq.requisicao_id}`;
      throw Object.assign(new Error(`A reserva ${rvReq.id} é da requisição ${numeroReq} — o material reservado para ela só sai pela entrega da requisição (tela Requisições), não por movimentação avulsa`), { status: 400 });
    }
  }
  // Saida que consome o que esta RETIDO em quantidade_em_terceiros. Mesmo papel de
  // `consumindoReserva`: a quantidade nao esta no disponivel (o disponivel justamente a exclui),
  // entao a guarda do disponivel nao pode barra-la; a validacao real acontece contra a propria
  // coluna de retencao, atomicamente, no claim mais abaixo.
  const baixandoTerceiro = ['PERDA_TERCEIRO', 'CONSUMO_TERCEIRO'].includes(tipo);

  // Etapa 45 — MESMO papel de `baixandoTerceiro`, com a outra coluna de retencao. A quantidade que
  // `DEVOLUCAO_FORNECEDOR` baixa esta em `quantidade_bloqueada` (a inspecao reprovou e reteve), e
  // o disponivel a subtrai — sem esta flag, devolver material 100% bloqueado seria impossivel
  // (disponivel = 0), e a guarda explicita de material bloqueado o recusaria de qualquer forma.
  // A validacao real acontece contra a propria coluna, atomicamente, no claim mais abaixo.
  //
  // ⚠️ A flag desliga DUAS guardas, e por isso o tipo TEM de ser DEDICADO (`TIPOS_DEDICADOS`, em
  // schema.js): sem aquilo, a rota generica `/movimentacoes/v2` aceitaria o tipo e qualquer um com
  // o gate `movimentar` apagaria material bloqueado sem documento nenhum.
  //
  // Etapa 69 (D2/RN-01): a `SUCATA` do material REPROVADO tambem baixa do bloqueado — mas por OPCAO
  // do chamador (`opcoes.doBloqueado`, 4o argumento, NUNCA do body), e nao por tipo novo: um
  // `SUCATA_REPROVADO` sumiria do relatorio `sucata-financeiro` (que le `tipo = 'SUCATA'`). A
  // `SUCATA` continua em TIPOS_DEDICADOS, entao a v2 segue recusando o tipo; e o unico chamador que
  // liga a opcao e a segunda assinatura de um sucateamento LIGADO a NC de inspecao.
  // Sem a opcao, `SUCATA` e exatamente a de antes (baixa do disponivel).
  if (opcoes.doBloqueado && tipo !== 'SUCATA') {
    throw Object.assign(new Error('doBloqueado só vale para SUCATA'), { status: 400 });
  }
  const baixandoBloqueado = tipo === 'DEVOLUCAO_FORNECEDOR'
    || (tipo === 'SUCATA' && opcoes.doBloqueado === true);

  // ── Lote (Etapa 6) ──────────────────────────────────────────────────────────
  // Aceita `lote_id` (numero) ou `lote` (codigo). O ledger guarda os DOIS: `lote_id` para juntar
  // e `lote` com o codigo congelado, porque movimentacao e imutavel e precisa continuar legivel
  // se o lote for renomeado.
  const lotService = require('./lotService');
  let loteResolvido = null;
  if (lote_id) {
    loteResolvido = await lotService.getLote(db, lote_id);
    if (!loteResolvido) throw Object.assign(new Error('Lote nao encontrado'), { status: 400 });
    if (loteResolvido.material_id !== material_id) {
      throw Object.assign(new Error('O lote informado pertence a outro material'), { status: 400 });
    }
  } else if (lote && String(lote).trim()) {
    loteResolvido = await lotService.getLotePorCodigo(db, material_id, lote);
    // Entrada cria o lote que ainda nao existe; saida nao pode inventar lote.
    if (!loteResolvido) {
      if (tiposEntrada.includes(tipo)) {
        loteResolvido = await lotService.criarOuObterLote(db, user, { material_id, codigo: lote });
      } else {
        throw Object.assign(new Error(`Lote nao encontrado para este material: ${String(lote).trim()}`), { status: 400 });
      }
    }
  }
  const loteIdFinal = loteResolvido ? loteResolvido.id : null;
  const loteCodigoFinal = loteResolvido ? loteResolvido.codigo : (lote || null);

  // ── controle_lote: exigencia declarada pelo CHAMADOR, nao deduzida pelo motor ──────────────
  // Ate o review final desta etapa a guarda valia para TODO tipo de entrada/saida, viesse a
  // chamada de onde viesse. Efeito medido: ligar "Controle por lote" tornava o material
  // impossivel de entregar por requisicao e de devolver — quatro chamadores internos
  // (requisitionService entrega/estorno, returnService ENTRADA_DEVOLUCAO/SUCATA, receiptService
  // sem lote digitado) chamam o motor sem ter DE ONDE tirar um lote: nao existe campo na tela nem
  // parametro na chamada. Pior: a RESERVA da requisicao nasce normalmente (RESERVA nao e entrada
  // nem saida), entao o saldo ficava preso numa reserva que nunca podia ser consumida.
  //
  // Decisao do cliente (2026-08-10): a exigencia vale SO onde existe como informar — movimentacao
  // manual (rotas v1 e v2) e recebimento. Os quatro fluxos internos ficam ISENTOS e isso e
  // pendencia declarada na spec 10, nomeando cada um. Dar-lhes lote automaticamente (FEFO na
  // entrega, herdar da saida original na devolucao) e o conteudo natural de uma etapa seguinte.
  //
  // Por que `opcoes.exigeLote` e nao adivinhacao pelo tipo/pilha: o motor NAO tem como saber se
  // quem chamou tinha um campo de lote na tela. Deduzir por tipo de movimento seria falso (SAIDA
  // vem tanto da tela de Movimentacoes quanto da entrega de requisicao); olhar a pilha e fragil e
  // invisivel. O chamador declara o que so ele sabe. O default e "nao exige" porque, hoje, quem
  // NAO declara e exatamente o conjunto dos fluxos internos — e um chamador novo que esqueca de
  // declarar falha aberto (aceita sem lote) em vez de travar um fluxo inteiro em producao.
  //
  // AJUSTE puro continua isento por outro motivo, independente deste: e o caminho de
  // regularizacao de quem ligou a flag com estoque antigo sem lote em casa.
  // Etapa 7: `tipo === 'TRANSFERENCIA'` entrou na condicao porque TRANSFERENCIA e um ramo
  // PROPRIO deste motor — nao esta em tiposEntrada nem em tiposSaida. Sem cita-lo aqui,
  // declarar `exigeLote: true` na rota /transferencias nao tinha efeito nenhum: o material com
  // controle_lote continuava transferindo sem dizer de qual lote saiu. Medido: com a rota ja
  // declarando exigeLote e esta condicao ainda sem TRANSFERENCIA, o erro que voltava era
  // "Saldo insuficiente na localizacao de origem" (a linha lote_id NULL nao existe), um 400 que
  // enganava — parecia guarda funcionando e nao era. NAO copiar esta mudanca para o
  // `serieObrigatoria` mais abaixo: serie na transferencia esta declarada FORA de escopo
  // (decisao 9 do design da Etapa 7) justamente porque o claim de serie so existe para entrada
  // e saida, e a transferencia nao tem caminho no motor para mover o vinculo da serie.
  if (opcoes.exigeLote && material.controle_lote && !loteIdFinal
      && (tiposEntrada.includes(tipo) || tiposSaida.includes(tipo) || tipo === 'TRANSFERENCIA')) {
    throw Object.assign(
      new Error(`O material ${material.codigo} exige lote nesta movimentacao (controle por lote ligado)`),
      { status: 400 });
  }

  // ── Serie (Etapa 6b) ─────────────────────────────────────────────────────────
  // Mesmo alcance e mesma decisao de desenho do exigeLote acima: exigeSerie so e
  // declarado pelo CHAMADOR, nunca deduzido pelo motor. A movimentacao manual (v1/v2) e o
  // recebimento (Task 6) declaram — os dois caminhos onde o operador tem como informar
  // series na tela. ~~entrega/exclusao de requisicao ... continuam isentas~~ — ESTAVA ERRADO desde
  // a Etapa 61: a isencao da entrega era o defeito (o fisico baixava e a serie ficava EM_ESTOQUE).
  // A entrega e a exclusao de requisicao declaram exigeSerie desde entao (requisitionService).
  const seriesEntrada = Array.isArray(params.series)
    ? params.series.map((s) => String(s).trim()).filter(Boolean) : [];
  const serieIdsSaida = Array.isArray(params.serie_ids)
    ? params.serie_ids.map(Number).filter((n) => Number.isInteger(n) && n > 0) : [];
  const serieObrigatoria = !!(opcoes.exigeSerie && material.controle_serie
    && (tiposEntrada.includes(tipo) || tiposSaida.includes(tipo)));
  if (serieObrigatoria) {
    if (!Number.isInteger(Number(quantidade))) {
      const e = new Error('material com controle de serie exige quantidade inteira');
      e.status = 400; throw e;
    }
    const informadas = tiposEntrada.includes(tipo) ? seriesEntrada.length : serieIdsSaida.length;
    if (informadas !== Number(quantidade)) {
      const e = new Error(`material com controle de serie: informe ${quantidade} serie(s) para ${quantidade} unidade(s) — recebidas ${informadas}`);
      e.status = 400; throw e;
    }
  }

  // Etapa 62 (RN-01, fecha o C82): AJUSTE de valor absoluto de material com serie, quando o chamador
  // declara exigeSerie (v1/v2). Sonda: AJUSTE para 5 com 3 series presentes deixava fisico 5 e
  // presentes 3. As series que entram/saem sao `novo − presentes` (Fase 2: pela diferenca do fisico
  // o legado fracionario ou divergente nunca fechava). Por ENDERECO nao: a linha, a absorcao dos
  // negativos e o legado fazem o total do material mudar diferente da linha — recusado (letra B).
  const serieAjuste = !!(opcoes.exigeSerie && material.controle_serie && tiposAjuste.includes(tipo));
  let serieAjusteDelta = 0;
  if (serieAjuste) {
    if (localizacao_destino_id) {
      throw Object.assign(new Error('material com controle de serie: ajuste por endereco nao e suportado — ajuste o total do material (sem endereco)'), { status: 400 });
    }
    const novo = parseFloat(quantidade);
    // Fase 5: negativo tambem (antes respondia "informe N serie(s)" para um total -2).
    if (!Number.isInteger(novo) || novo < 0) {
      throw Object.assign(new Error('material com controle de serie exige quantidade inteira'), { status: 400 });
    }
    const presentesAjuste = await seriesService.contarPresentes(db, material_id);
    serieAjusteDelta = novo - presentesAjuste;
    // Fase 5: numero que ja esta presente e recusado AQUI, antes de qualquer efeito — senao a
    // recusa vinha do entradaSeries, depois da auditoria do ajuste de material de cliente (orfa).
    if (serieAjusteDelta > 0 && seriesEntrada.length) {
      const jaPresentes = await dbAll(db, `SELECT numero FROM series_almoxarifado WHERE material_id = ?
        AND status IN ('EM_ESTOQUE','BLOQUEADA') AND numero IN (${seriesEntrada.map(() => '?').join(',')})`,
      [material_id, ...seriesEntrada]);
      if (jaPresentes.length) {
        throw Object.assign(new Error(`serie ${jaPresentes[0].numero} ja esta em estoque`), { status: 400 });
      }
    }
    const abs = Math.abs(serieAjusteDelta);
    if (serieAjusteDelta === 0) {
      if (seriesEntrada.length || serieIdsSaida.length) {
        throw Object.assign(new Error(`material com controle de serie: o ajuste nao muda as series (presentes ${presentesAjuste}) — nao informe series`), { status: 400 });
      }
    } else {
      const certas = serieAjusteDelta > 0 ? seriesEntrada.length : serieIdsSaida.length;
      const erradas = serieAjusteDelta > 0 ? serieIdsSaida.length : seriesEntrada.length;
      if (certas !== abs || erradas) {
        throw Object.assign(new Error(
          `material com controle de serie: o ajuste ${serieAjusteDelta > 0 ? 'sobe' : 'baixa'} ${abs} serie(s) `
          + `(fisico novo ${novo}, series presentes ${presentesAjuste}) — informe ${abs} serie(s) (recebidas ${certas + erradas})`,
        ), { status: 400 });
      }
    }
  }

  const regras = avaliarRegrasVinculo(tipo, { os_id, projeto_id, centro_custo_id, justificativa, referencia, emergencial });
  if (!regras.ok) throw Object.assign(new Error(regras.erro), { status: 400 });
  const regularizacaoPendente = regras.pendente ? 1 : 0;

  // ── Guarda do dono (Etapa 8, decisoes 5, 6 e 7) ─────────────────────────────────────────────
  // Depois de avaliarRegrasVinculo de proposito: as duas regras se somam, nao se substituem — um
  // SAIDA_PRODUCAO de material de cliente precisa passar nas DUAS (ter vinculo, e o vinculo ser
  // do dono). Antes de qualquer efeito de saldo, como todas as guardas deste motor.
  // O `emergencial` vai junto porque aqui ele NAO bypassa nada, ao contrario da linha acima —
  // ver o comentario longo em ownerRules.assertSaidaPermitida antes de "uniformizar".
  await ownerRules.assertSaidaPermitida(db, material, tipo, { os_id, projeto_id, emergencial });
  // Ajuste de material de cliente exige a acao dedicada `ajustar_material_cliente` (decisao 7).
  // A checagem vive AQUI, no motor, e nao em requirePermission na rota: o AJUSTE chega por DUAS
  // rotas (POST /movimentacoes v1 e /movimentacoes/v2) e as duas tem gate `movimentar`, o mais
  // amplo — proteger so uma deixaria a outra aberta, e travar a rota inteira barraria ajuste de
  // material NOSSO, que segue sendo ajustar_estoque. A decisao e POR MATERIAL, e so o motor tem
  // o material em maos. Depende de `avaliarRegrasVinculo` ter rodado antes: e ele que ja recusa
  // AJUSTE sem justificativa, e a auditoria gravada aqui embute essa justificativa.
  await ownerRules.assertAjustePermitido(db, material, tipo, { quantidade, justificativa }, user);

  // Restrições de endereço (Etapa 2, Task 2): validadas ANTES de qualquer efeito de saldo —
  // inclusive antes das UPDATEs da própria TRANSFERENCIA logo abaixo, que grava direto em
  // estoque_saldo_almoxarifado. Usa a MESMA resolução de localização (fallback para
  // localizacao_padrao_id) que será usada mais adiante para aplicar o efeito de saldo.
  if (tiposEntrada.includes(tipo)) {
    await validarEnderecoExplicito(db, localizacao_destino_id, 'destino');
    await validarLocalizacaoParaMovimento(db, resolveLocalizacaoEntrada(material, localizacao_destino_id), material, 'destino');
  } else if (tiposSaida.includes(tipo)) {
    await validarEnderecoExplicito(db, localizacao_origem_id, 'origem');
    await validarLocalizacaoParaMovimento(db, resolveLocalizacaoSaida(material, localizacao_origem_id), material, 'origem');
  } else if (tipo === 'TRANSFERENCIA') {
    await validarEnderecoExplicito(db, localizacao_origem_id, 'origem');
    await validarEnderecoExplicito(db, localizacao_destino_id, 'destino');
    await validarLocalizacaoParaMovimento(db, localizacao_origem_id, material, 'origem');
    await validarLocalizacaoParaMovimento(db, localizacao_destino_id, material, 'destino');
  } else if (tiposAjuste.includes(tipo) && localizacao_destino_id) {
    await validarEnderecoExplicito(db, localizacao_destino_id, 'destino', { aceitaInativa: true });
    await validarLocalizacaoParaMovimento(db, localizacao_destino_id, material, 'destino');
  }

  // Etapa 56 (RN-02): confirmação por leitura, DEPOIS das checagens de endereço (a inexistente
  // mantém a própria mensagem) e antes de qualquer efeito — inclusive as UPDATEs da TRANSFERENCIA.
  const lidoOrigem = normalizarCodigoLido(params.codigo_lido_origem);
  const lidoDestino = normalizarCodigoLido(params.codigo_lido_destino);
  let confirmadoOrigem = null;
  let confirmadoDestino = null;
  if (lidoDestino) {
    // Entrada: a informada ou a padrão (tudo vai para UM endereço). Transferência e ajuste: só a
    // informada — nenhum dos dois cai na padrão.
    let locDestino = null;
    if (tiposEntrada.includes(tipo)) locDestino = resolveLocalizacaoEntrada(material, localizacao_destino_id);
    else if (tipo === 'TRANSFERENCIA' || tiposAjuste.includes(tipo)) locDestino = localizacao_destino_id || null;
    confirmadoDestino = await conferirLeitura(db, lidoDestino, locDestino, 'destino');
  }
  if (lidoOrigem) {
    if (!tiposSaida.includes(tipo) && tipo !== 'TRANSFERENCIA') await conferirLeitura(db, lidoOrigem, null, 'origem');
    // Fase 2 (CRÍTICO): a saída DRENA vários endereços (claimSaldoSemLote/claimSaldoDoLote) — sem
    // origem informada, ou sem saldo nela que cubra, "confirmar a origem" certificaria um endereço de
    // onde o material não saiu (A:10, saída de 40 "confirmada" em A tirava 30 de B).
    if (!localizacao_origem_id) {
      throw Object.assign(new Error('Para confirmar a origem pela leitura, informe a localização de origem'), { status: 400 });
    }
    confirmadoOrigem = await conferirLeitura(db, lidoOrigem, localizacao_origem_id, 'origem');
    const aqui = await dbGet(db, `SELECT COALESCE(SUM(quantidade), 0) as q FROM estoque_saldo_almoxarifado
      WHERE material_id = ? AND localizacao_id = ? AND lote_id IS ?`, [material_id, localizacao_origem_id, loteIdFinal || null]);
    const saldoAqui = Number(aqui.q) || 0;
    // A TRANSFERENCIA nao drena outros enderecos: a guarda dela ("Saldo insuficiente na localizacao
    // de origem") ja diz a coisa certa — esta mensagem ali enganaria (Fase 5).
    if (tipo !== 'TRANSFERENCIA' && saldoAqui + EPS < parseFloat(quantidade)) {
      throw Object.assign(new Error(
        `O saldo em ${confirmadoOrigem} (${Math.round(saldoAqui * 1e6) / 1e6}) não cobre a quantidade (${parseFloat(quantidade)}) — a saída tiraria de outros endereços`,
      ), { status: 400 });
    }
  }

  // Etapa 58: a entrega de requisição com origem informada é ESTRITA (opção do chamador, no 4º
  // argumento — nunca no body): sem isto a saída só PREFERE a origem e drena os outros endereços,
  // e o livro grava "saiu de A" para o que saiu de B (Fase 2, crítico 1). Mesma régua da origem
  // confirmada por leitura: saldo nela cobre a quantidade, e a conferência pós-claim abaixo.
  let codigoOrigemEstrita = null;
  if (!confirmadoOrigem && opcoes.origemEstrita && localizacao_origem_id && tiposSaida.includes(tipo)) {
    const lo = await dbGet(db, 'SELECT codigo FROM localizacoes_almoxarifado WHERE id = ?', [localizacao_origem_id]);
    codigoOrigemEstrita = lo ? lo.codigo : String(localizacao_origem_id);
    const aqui = await dbGet(db, `SELECT COALESCE(SUM(quantidade), 0) as q FROM estoque_saldo_almoxarifado
      WHERE material_id = ? AND localizacao_id = ? AND lote_id IS ?`, [material_id, localizacao_origem_id, loteIdFinal || null]);
    const saldoAqui = Number(aqui.q) || 0;
    if (saldoAqui + EPS < parseFloat(quantidade)) {
      throw Object.assign(new Error(
        `O saldo em ${codigoOrigemEstrita} (${Math.round(saldoAqui * 1e6) / 1e6}) não cobre a quantidade (${parseFloat(quantidade)}) — a saída tiraria de outros endereços`,
      ), { status: 400 });
    }
  }

  // ⚠️ O QUE ESTE MOVIMENTO APLICOU NAS COLUNAS DE RETENÇÃO, para o catch amplo poder reverter.
  //
  // Achado CRITICAL da revisão adversarial da Etapa 44, e ele é do MOTOR, não daquela etapa: os
  // seis ramos de retenção abaixo (`BLOQUEIO`, `DESBLOQUEIO`, `QUARENTENA`, `LIBERACAO_INSPECAO`,
  // `REPROVACAO_INSPECAO`, `DECISAO_INSPECAO`) escrevem em `quantidade_bloqueada` /
  // `quantidade_em_inspecao` **antes do `try`** que começa mais abaixo — então qualquer falha
  // posterior (o `INSERT` do ledger, a auditoria interna, um trigger, o disco) saía da função com
  // o pool **já alterado e sem linha nenhuma no livro**. O catch compensava série, linha de saldo,
  // crédito de entrada e físico de saída; a retenção era a única coisa aplicada aqui que ele não
  // conhecia.
  //
  // Por que isso é grave e não teórico: quem chama confia no `throw` para concluir "nada
  // aconteceu" e desfazer o próprio estado. Na Etapa 44 o efeito medido foi **liberação em
  // dobro** — a NC voltava a ABERTA, era decidida de novo, e o pool caía duas vezes para uma
  // única reprovação de 3 kg, com **uma** linha no livro.
  //
  // Guardamos o DELTA aplicado (com sinal), e não o valor anterior, porque o pool é agregado por
  // material: restaurar o valor lido no topo apagaria o que outra operação fez no intervalo.
  let retencaoAplicada = null;

  if (tiposEntrada.includes(tipo)) {
    saldoPosterior = saldoAnterior + parseFloat(quantidade);
  } else if (tiposSaida.includes(tipo)) {
    if (loteResolvido) {
      if (loteResolvido.status !== 'ATIVO') {
        throw Object.assign(
          new Error(`Lote ${loteResolvido.codigo} esta ${loteResolvido.status.toLowerCase()} e nao pode ser utilizado`),
          { status: 400 });
      }
      // Vencimento bloqueia consumo normal, mas NAO pode bloquear o proprio descarte do lote
      // vencido — SUCATA/PERDA/AJUSTE_NEGATIVO sao como o vencido SAI do sistema. Sem esta
      // isencao, um lote vencido ficava PRESO para sempre: nao pode sair como consumo (correto),
      // mas tambem nao podia ser baixado como perda nem corrigido (bug, achado do review round 1).
      // A guarda de STATUS acima continua valendo para descarte tambem, de proposito: um lote
      // BLOQUEADO/REPROVADO ainda precisa passar pelo fluxo de mudanca de status (com
      // justificativa) antes de qualquer saida, inclusive descarte.
      //
      // Task 3b (achado do review): a guarda tambem respeita lotService.vencimentoLiberado — o
      // cliente decidiu no design que vencido usa via liberacao com justificativa, reaproveitando
      // o fluxo de bloqueio/desbloqueio (lotService.liberarVencimento). A liberacao NAO desvence o
      // lote (isVencido continua true); so destrava a saida de consumo. Por isso a checagem de
      // STATUS roda ANTES desta: um lote bloqueado E vencido, mesmo com vencimento liberado,
      // precisa falhar por bloqueio (mensagem certa), nao por vencimento (mensagem que mandaria o
      // operador liberar de novo algo que ja esta liberado).
      // Etapa 8b: PERDA_TERCEIRO/CONSUMO_TERCEIRO tambem sao descarte — lote vencido perdido no
      // galvanizador tem de poder ser baixado, pelo mesmo motivo do resto da lista (senao o lote
      // fica PRESO: nao pode sair como consumo, e tambem nao pode ser encerrado).
      // Etapa 45: DEVOLUCAO_FORNECEDOR entra pelo MESMO motivo, e o caso e mais comum que os
      // outros — lote vencido e uma das razoes tipicas de devolver ao fornecedor. Sem ele o lote
      // ficaria PRESO: nao sai para consumo por estar vencido, e nao pode voltar para quem o
      // entregou. ⚠️ A guarda de STATUS do lote continua valendo (ela roda antes desta): lote
      // REPROVADO nao sai nem por aqui, e isso e deliberado — reabilitar o lote e outro gesto.
      const tiposDescarte = ['SUCATA', 'PERDA', 'AJUSTE_NEGATIVO', 'PERDA_TERCEIRO', 'CONSUMO_TERCEIRO',
        'DEVOLUCAO_FORNECEDOR'];
      if (!tiposDescarte.includes(tipo) && lotService.isVencido(loteResolvido) && !lotService.vencimentoLiberado(loteResolvido)) {
        throw Object.assign(
          new Error(`Lote ${loteResolvido.codigo} vencido em ${loteResolvido.data_validade} nao pode sair para consumo. `
            + 'Libere o vencimento do lote (PUT /api/almoxarifado/lotes/:id/liberar-vencimento) com justificativa, '
            + 'ou baixe por SUCATA/PERDA ou corrija por AJUSTE.'),
          { status: 400 });
      }
    }
    // Saída citando uma reserva consome o que JÁ estava separado para ela, então não pode ser
    // barrada pelo disponível — o disponível justamente exclui o reservado. Sem esta exceção,
    // reservar material o tornava inutilizável até para quem reservou (ver o design da Etapa 4).
    // A validação real acontece contra a própria reserva, atomicamente, mais abaixo.
    // Etapa 8b: `baixandoTerceiro` entra aqui pela MESMA razao de `consumindoReserva` — a
    // quantidade que PERDA_TERCEIRO/CONSUMO_TERCEIRO baixam esta retida em
    // quantidade_em_terceiros, que o disponivel subtrai. Sem esta excecao, encerrar uma remessa
    // que levou TODO o saldo do material seria impossivel (disponivel = 0). A validacao real
    // acontece contra a propria coluna, atomicamente, no claim mais abaixo.
    if (!consumindoReserva && !baixandoTerceiro && !baixandoBloqueado) {
      const disponivel = await getSaldoDisponivel(material, db);
      if (!Q.cabe(quantidade, disponivel) && !permiteNegativo) {
        throw Object.assign(new Error(`Saldo insuficiente. Disponível: ${disponivel} ${material.unidade}`), { status: 400 });
      }
    }
    // Etapa 45: `baixandoBloqueado` sai daqui pela razao OPOSTA a de todos os outros tipos — ele
    // existe para tirar do bloqueado, e esta guarda existe para impedir que o bloqueado seja usado.
    // Aplicada a ele, ela proibiria exatamente a operacao que ele e.
    if (!baixandoBloqueado && (material.quantidade_bloqueada || 0) > 0 && tiposSaida.includes(tipo)) {
      const dispSemBloqueio = material.quantidade_atual - (material.quantidade_bloqueada || 0);
      if (!Q.cabe(quantidade, dispSemBloqueio) && !permiteNegativo) {
        throw Object.assign(new Error('Material bloqueado não pode ser utilizado'), { status: 400 });
      }
    }
    saldoPosterior = saldoAnterior - parseFloat(quantidade);
  } else if (tiposAjuste.includes(tipo) && !localizacao_destino_id) {
    // RN-06 (Etapa 10): guarda de retencao, ANTES de qualquer efeito, como todas as guardas
    // deste motor. So se aplica ao ajuste SEM localizacao — com localizacao o novo total do
    // MATERIAL so e conhecido depois do syncMaterialTotals somar todas as linhas (ver o ramo
    // AJUSTE-com-localizacao mais abaixo); verificar a retencao contra um total ainda-nao-
    // existente fica fora do escopo desta etapa (D1/D7 do design).
    const motivoRecusa = motivoRecusaAjustePorRetencao(material, parseFloat(quantidade));
    if (motivoRecusa) throw Object.assign(new Error(motivoRecusa), { status: 400 });
    saldoPosterior = parseFloat(quantidade);
  } else if (tiposAjuste.includes(tipo)) {
    // AJUSTE/AJUSTE_INVENTARIO COM localizacao: comportamento de sempre, guarda de retencao
    // fora do escopo desta etapa (D1/D7 do design) — o branch original mudou de lugar para aqui
    // embaixo, sem nenhuma alteracao de comportamento.
    saldoPosterior = parseFloat(quantidade);
  } else if (tipo === 'TRANSFERENCIA') {
    if (!localizacao_origem_id || !localizacao_destino_id) {
      throw Object.assign(new Error('Transferência requer origem e destino'), { status: 400 });
    }
    // loteIdFinal (Etapa 6, Task 3): se a transferência citar um lote (`lote`/`lote_id`), move a
    // linha DAQUELE lote entre localizações — sem citar lote, loteIdFinal é null e o comportamento
    // é o de sempre (saldo sem lote).
    const saldoOrigem = await getOrCreateSaldo(db, material_id, localizacao_origem_id, loteIdFinal);
    // Guarda no WHERE, nunca read-then-write (achado do review round 1: este UPDATE passou a
    // governar a linha do LOTE, que a task tornou load-bearing — antes disso ler `saldoOrigem`
    // acima e só depois decrementar era inofensivo porque a linha nunca era a fonte de verdade de
    // nada). Semântica preservada: assim como antes, não olha `permiteNegativo` — TRANSFERENCIA
    // sempre exigiu saldo suficiente na origem, mesmo em material que permite saldo negativo.
    const claimOrigem = await dbGet(db, `UPDATE estoque_saldo_almoxarifado
      SET quantidade = ${Q.qtdSql('quantidade - ?')}, updated_at = CURRENT_TIMESTAMP
      WHERE id = ? AND quantidade >= ? ${Q.FOLGA_SQL}
      RETURNING id`, [quantidade, saldoOrigem.id, quantidade]);
    if (!claimOrigem) {
      throw Object.assign(new Error('Saldo insuficiente na localização de origem'), { status: 400 });
    }
    const saldoDestino = await getOrCreateSaldo(db, material_id, localizacao_destino_id, loteIdFinal);
    await dbRun(db, `UPDATE estoque_saldo_almoxarifado SET quantidade = ${Q.qtdSql('quantidade + ?')}, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
      [quantidade, saldoDestino.id]);
    saldoPosterior = saldoAnterior;
  } else if (tipo === 'BLOQUEIO') {
    await dbRun(db, `UPDATE materiais_almoxarifado SET quantidade_bloqueada = ${Q.qtdSql('COALESCE(quantidade_bloqueada,0) + ?')}, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
      [quantidade, material_id]);
    retencaoAplicada = { bloqueada: quantidade, emInspecao: 0 };
    saldoPosterior = saldoAnterior;
  } else if (tipo === 'DESBLOQUEIO') {
    // Guarda no WHERE em vez de MAX(0,...): saturar em silencio devolve ao disponivel menos do
    // que o pedido sem ninguem saber, e foi exatamente o bug corrigido em liberarReserva.
    const claim = await dbGet(db, `UPDATE materiais_almoxarifado
      SET quantidade_bloqueada = ${Q.qtdSql('COALESCE(quantidade_bloqueada,0) - ?')}, updated_at = CURRENT_TIMESTAMP
      WHERE id = ? AND COALESCE(quantidade_bloqueada,0) >= ? ${Q.FOLGA_SQL}
      RETURNING id`, [quantidade, material_id, quantidade]);
    if (!claim) {
      throw Object.assign(
        new Error(`Quantidade bloqueada insuficiente: ${Q.qtd(material.quantidade_bloqueada || 0)}`),
        { status: 400 });
    }
    retencaoAplicada = { bloqueada: -quantidade, emInspecao: 0 };
    saldoPosterior = saldoAnterior;
  } else if (tipo === 'QUARENTENA') {
    await dbRun(db, `UPDATE materiais_almoxarifado
      SET quantidade_em_inspecao = ${Q.qtdSql('COALESCE(quantidade_em_inspecao,0) + ?')}, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?`, [quantidade, material_id]);
    retencaoAplicada = { bloqueada: 0, emInspecao: quantidade };
    saldoPosterior = saldoAnterior;
  } else if (tipo === 'LIBERACAO_INSPECAO' || tipo === 'REPROVACAO_INSPECAO') {
    // Guarda no proprio WHERE, como o resto do motor: liberar/reprovar mais do que esta retido
    // criaria saldo do nada (na liberacao) ou bloqueio sem lastro (na reprovacao). MAX(0,...)
    // saturaria em silencio e esconderia o erro — e o "aprovar duas vezes nao duplica" que a
    // spec 09 cobra sai justamente deste UPDATE nao casar na segunda vez.
    const bloqueiaTambem = tipo === 'REPROVACAO_INSPECAO' ? quantidade : 0;
    const claim = await dbGet(db, `UPDATE materiais_almoxarifado
      SET quantidade_em_inspecao = ${Q.qtdSql('COALESCE(quantidade_em_inspecao,0) - ?')},
          quantidade_bloqueada   = ${Q.qtdSql('COALESCE(quantidade_bloqueada,0) + ?')},
          updated_at = CURRENT_TIMESTAMP
      WHERE id = ? AND COALESCE(quantidade_em_inspecao,0) >= ? ${Q.FOLGA_SQL}
      RETURNING id`, [quantidade, bloqueiaTambem, material_id, quantidade]);
    if (!claim) {
      throw Object.assign(
        new Error(`Quantidade em inspeção insuficiente: ${Q.qtd(material.quantidade_em_inspecao || 0)}`),
        { status: 400 });
    }
    retencaoAplicada = { bloqueada: bloqueiaTambem, emInspecao: -quantidade };
    saldoPosterior = saldoAnterior;
  } else if (tipo === 'DECISAO_INSPECAO') {
    // Correcao de review (Etapa 5): uma decisao de inspecao pode aprovar parte e reprovar parte
    // do MESMO retido (`quantidade` = total decidido, `quantidade_reprovada` = a parte dele que
    // vai para bloqueada). Fazer isso como duas chamadas independentes (LIBERACAO_INSPECAO
    // seguida de REPROVACAO_INSPECAO) abre uma janela ENTRE as duas onde uma decisao concorrente
    // pode consumir o em_inspecao pela metade — o resultado seria material reprovado liberado
    // como bom, ou saldo preso em quarentena para sempre se o segundo passo falhar. Aqui os dois
    // efeitos (baixa o retido inteiro, soma a parte reprovada em bloqueada) acontecem no MESMO
    // UPDATE condicional, atomico.
    const reprovadaQtd = Number(quantidade_reprovada || 0);
    if (reprovadaQtd < 0 || reprovadaQtd > quantidade) {
      throw Object.assign(
        new Error('quantidade_reprovada não pode ser negativa nem maior que a quantidade decidida'),
        { status: 400 });
    }
    const claim = await dbGet(db, `UPDATE materiais_almoxarifado
      SET quantidade_em_inspecao = ${Q.qtdSql('COALESCE(quantidade_em_inspecao,0) - ?')},
          quantidade_bloqueada   = ${Q.qtdSql('COALESCE(quantidade_bloqueada,0) + ?')},
          updated_at = CURRENT_TIMESTAMP
      WHERE id = ? AND COALESCE(quantidade_em_inspecao,0) >= ? ${Q.FOLGA_SQL}
      RETURNING id`, [quantidade, reprovadaQtd, material_id, quantidade]);
    if (!claim) {
      throw Object.assign(
        new Error(`Quantidade em inspeção insuficiente: ${Q.qtd(material.quantidade_em_inspecao || 0)}`),
        { status: 400 });
    }
    retencaoAplicada = { bloqueada: reprovadaQtd, emInspecao: -quantidade };
    saldoPosterior = saldoAnterior;
  } else if (tipo === 'REMESSA_TERCEIRO') {
    // Guarda no proprio WHERE, como o resto do motor: mandar para fora mais do que esta disponivel
    // criaria retencao sem lastro fisico. `disponivelSql()` (sem alias) porque o UPDATE e de tabela
    // unica — e usar o helper garante que a conta e A MESMA das outras leituras do disponivel.
    const claim = await dbGet(db, `UPDATE materiais_almoxarifado
      SET quantidade_em_terceiros = ${Q.qtdSql('COALESCE(quantidade_em_terceiros,0) + ?')}, updated_at = CURRENT_TIMESTAMP
      WHERE id = ? AND ${disponivelSql()} >= ? ${Q.FOLGA_SQL}
      RETURNING id`, [quantidade, material_id, quantidade]);
    if (!claim) {
      throw Object.assign(
        new Error(`Saldo disponível insuficiente para enviar ao terceiro: ${await getSaldoDisponivel(material, db)} ${material.unidade}`),
        { status: 400 });
    }
    saldoPosterior = saldoAnterior; // o material continua sendo nosso: quantidade_atual nao muda
  } else if (tipo === 'RETORNO_TERCEIRO') {
    // Guarda no WHERE em vez de MAX(0,...), mesma razao do DESBLOQUEIO: saturar em silencio
    // devolveria ao disponivel menos do que o pedido sem ninguem saber. E a mensagem DIZ o numero
    // — sem ele o operador tem de adivinhar quanto ainda esta no terceiro (licao da Etapa 7).
    const claim = await dbGet(db, `UPDATE materiais_almoxarifado
      SET quantidade_em_terceiros = ${Q.qtdSql('COALESCE(quantidade_em_terceiros,0) - ?')}, updated_at = CURRENT_TIMESTAMP
      WHERE id = ? AND COALESCE(quantidade_em_terceiros,0) >= ? ${Q.FOLGA_SQL}
      RETURNING id`, [quantidade, material_id, quantidade]);
    if (!claim) {
      throw Object.assign(
        new Error(`Retorno acima do que está no terceiro: ainda há ${Q.qtd(material.quantidade_em_terceiros || 0)} ${material.unidade} lá fora`),
        { status: 400 });
    }
    saldoPosterior = saldoAnterior;
  }

  let saldoAnteriorReal = saldoAnterior;
  // `seriesAfetadas` (Etapa 6b): populada só quando a entrada cria/reativa série. Escopo aberto
  // aqui (fora do try) de propósito — o catch abaixo precisa dela para compensar; para qualquer
  // tipo que não seja entrada com série ela permanece [] e a compensação vira no-op.
  let seriesAfetadas = [];
  // `seriesClaim` (Etapa 6b, Task 4): o equivalente de `seriesAfetadas` para o lado da SAÍDA —
  // populada quando a saída reivindica série(s) especificas. Mesmo escopo aberto: usada depois do
  // INSERT do ledger para vincular `movimentacao_saida_id`, no mesmo padrão de `seriesAfetadas`.
  let seriesClaim = [];
  // Etapa 62 (Fase 5): o fisico ANTERIOR de um AJUSTE com serie ja gravado — o catch amplo o restaura
  // (antes o comentario prometia a compensacao e so as series voltavam).
  let ajusteSerieFisicoAnterior = null;
  let result;

  // ── Compensação do catch AMPLO para o efeito FÍSICO (Etapa 6b, Task 4, fix round 1) ──────────
  // Achado do review: antes deste fix, o catch amplo só desfazia SÉRIE (`desfazerEntrada` na
  // entrada; nada na saída) quando o INSERT do ledger falhava DEPOIS que o crédito/débito físico
  // já tinha rodado. Na ENTRADA isso furava o próprio invariante que a etapa promete: a série
  // sumia (desfeita) e `quantidade_atual` continuava creditada — `presentes=0 != quantidade_atual
  // =N`. Na SAÍDA o mesmo buraco existe na direção oposta: sem isto, a série reivindicada e o
  // débito físico ficavam órfãos do movimento que os causou.
  //
  // - `entradaCreditoAplicado`: null até a entrada creditar `quantidade_atual`; guarda o que foi
  //   aplicado (quantidade e, se mexeu em custo médio, os valores ANTERIORES — capturados do
  //   `material` lido no topo da função, antes de qualquer efeito) para o catch reverter
  //   EXATAMENTE o que este movimento aplicou, não uma suposição.
  // - `saldoLinhasSaidaParaReverter` / `saidaFisicoAplicado`: os equivalentes para a SAÍDA.
  //   Setados pelo bloco de saída mais abaixo; ZERADOS por qualquer compensação que já rodou
  //   (local, no catch do claim de série, ou no claim de lote) — o catch amplo lê o estado destas
  //   variáveis e não repete uma compensação que já aconteceu.
  let entradaCreditoAplicado = null;
  let saldoLinhasSaidaParaReverter = [];
  let saidaFisicoAplicado = false;
  // Reverte SÓ o físico agregado (quantidade_atual [+ reserva]) desta saída — nunca a(s) linha(s)
  // de saldo por localização/lote, que cada chamador reverte à sua maneira. Hoisted para escopo de
  // função (fix round 1): tanto o catch LOCAL do claim de série quanto o catch AMPLO (INSERT do
  // ledger falhando depois de um claim já bem-sucedido) precisam poder chamá-la. Idempotente via
  // `saidaFisicoAplicado`: chamar duas vezes (uma localmente, outra no catch amplo) não desfaz o
  // físico duas vezes.
  const reverterFisicoDaSaida = async () => {
    if (!saidaFisicoAplicado) return;
    if (consumindoReserva) {
      // Achado do review round 1 (claim de lote): compensar só quantidade_atual não bastava
      // quando a saída consumia reserva — o claim da reserva e o débito de
      // quantidade_reservada/quantidade_atual já tinham acontecido. Sem desfazer os três, a
      // reserva ficava "queimada" (quantidade_utilizada maior, e às vezes status CONSUMIDA) sem
      // NENHUMA saída física real ter ocorrido — reserva de outra OS perdida, e o disponível do
      // material inflado (quantidade_reservada a menos do que deveria).
      await dbRun(db, `UPDATE materiais_almoxarifado
        SET quantidade_atual = ${Q.qtdSql('quantidade_atual + ?')},
            quantidade_reservada = ${Q.qtdSql('COALESCE(quantidade_reservada,0) + ?')},
            updated_at = CURRENT_TIMESTAMP
        WHERE id = ?`, [quantidade, quantidade, material_id]);
      await dbRun(db, `UPDATE reservas_material_almoxarifado SET quantidade_utilizada = ${Q.qtdSql('MAX(0, quantidade_utilizada - ?)')}, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
        [quantidade, reserva_id]);
      // A reserva só vira CONSUMIDA dentro desta mesma chamada, quando zera — reverter para
      // ATIVA aqui é seguro porque o claim atômico do topo já exigiu status = 'ATIVA' para a
      // execução sequer chegar até este ponto.
      await dbRun(db, "UPDATE reservas_material_almoxarifado SET status = 'ATIVA', updated_at = CURRENT_TIMESTAMP WHERE id = ? AND status = 'CONSUMIDA'", [reserva_id]);
    } else if (baixandoTerceiro) {
      // Devolve os DOIS efeitos do claim de PERDA_TERCEIRO/CONSUMO_TERCEIRO. Compensar so
      // quantidade_atual deixaria a retencao baixada sem a saida que a justificava — o oposto
      // exato do saldo orfao, e igualmente errado: o material voltaria ao disponivel como se nunca
      // tivesse ido para o terceiro.
      await dbRun(db, `UPDATE materiais_almoxarifado
        SET quantidade_atual = ${Q.qtdSql('quantidade_atual + ?')},
            quantidade_em_terceiros = ${Q.qtdSql('COALESCE(quantidade_em_terceiros,0) + ?')},
            updated_at = CURRENT_TIMESTAMP
        WHERE id = ?`, [quantidade, quantidade, material_id]);
    } else if (baixandoBloqueado) {
      // Etapa 45 — espelho do bloco acima. Devolve os DOIS efeitos do claim: compensar so o fisico
      // deixaria o material de volta no galpao e FORA do bloqueio, ou seja, disponivel para sair —
      // material reprovado virando utilizavel por causa de uma falha no ledger.
      //
      // ⚠️ E POR ISSO `retencaoAplicada` NAO E USADO NESTE TIPO, embora ele mexa em coluna de
      // retencao: aquele mecanismo serve aos ramos que aplicam a retencao FORA do `try` (BLOQUEIO,
      // QUARENTENA e os de inspecao). Aqui a retencao e baixada DENTRO do claim, junto do fisico,
      // e quem a devolve e este ramo. Usar os dois compensaria EM DOBRO — a revisao do plano da 45
      // pegou isso antes de virar codigo: `bloqueada` voltaria a 6 para uma reprovacao de 3.
      // Etapa 69: vale IGUAL para a `SUCATA` com `doBloqueado` — mesmo claim, mesma compensacao,
      // e o mesmo motivo para NAO setar `retencaoAplicada` (o cenario (7) de
      // `sucataBloqueadoMotor.api.test.js` prende a igualdade exata).
      await dbRun(db, `UPDATE materiais_almoxarifado
        SET quantidade_atual = ${Q.qtdSql('quantidade_atual + ?')},
            quantidade_bloqueada = ${Q.qtdSql('COALESCE(quantidade_bloqueada,0) + ?')},
            updated_at = CURRENT_TIMESTAMP
        WHERE id = ?`, [quantidade, quantidade, material_id]);
    } else {
      await dbRun(db, `UPDATE materiais_almoxarifado
        SET quantidade_atual = ${Q.qtdSql('quantidade_atual + ?')}, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
        [quantidade, material_id]);
    }
    saidaFisicoAplicado = false;
  };

  // Envolve aplicação física + linha de saldo + INSERT do ledger: se a série já foi criada
  // (entradaSeries rodou) e QUALQUER passo posterior falhar (custo médio, getOrCreateSaldo,
  // o próprio INSERT), a série tem de ser desfeita — senão fica uma série EM_ESTOQUE sem
  // contrapartida no físico, furando o invariante COUNT(série) == quantidade_atual.
  try {
  // A lista literal que existia aqui era, letra por letra, TIPOS_RETENCAO + TRANSFERENCIA — e
  // manter as duas em paralelo significava que todo tipo de retencao novo tinha de ser lembrado
  // em DOIS lugares, com a falha silenciosa de esquecer o segundo (o tipo cairia no bloco fisico e
  // escreveria linha de saldo para um movimento que nao mexe no fisico). Derivar mata a
  // duplicacao: REMESSA_TERCEIRO/RETORNO_TERCEIRO (Etapa 8b) entram sozinhos.
  if (!TIPOS_RETENCAO.includes(tipo) && tipo !== 'TRANSFERENCIA') {
    if (tiposSaida.includes(tipo)) {
      // Decremento atômico: o próprio UPDATE valida o disponível sob o lock de linha do
      // SQLite, fechando a janela de corrida entre a leitura acima e a escrita. RETURNING
      // captura o quantidade_atual pós-update NA MESMA instrução — uma SELECT separada
      // reabriria uma segunda janela de corrida entre o UPDATE e a leitura do saldo, que é
      // o que vai para o par saldo_anterior/saldo_posterior do livro, da auditoria e da resposta.
      if (consumindoReserva) {
        // ── Consumo contra reserva ──
        // Reivindica a reserva PRIMEIRO: é o recurso escasso específico desta saída, e o
        // UPDATE condicional impede que duas entregas concorrentes consumam o mesmo saldo
        // reservado. `saldo` da reserva = quantidade - quantidade_utilizada.
        const reserva = await dbGet(db, `UPDATE reservas_material_almoxarifado
          SET quantidade_utilizada = ${Q.qtdSql('quantidade_utilizada + ?')}, updated_at = CURRENT_TIMESTAMP
          WHERE id = ? AND material_id = ? AND status = 'ATIVA'
            AND (quantidade - COALESCE(quantidade_utilizada,0)) >= ? - ${EPS}
          RETURNING quantidade, quantidade_utilizada`,
          [quantidade, reserva_id, material_id, quantidade]);
        if (!reserva) {
          const atual = await dbGet(db, 'SELECT quantidade, quantidade_utilizada, status FROM reservas_material_almoxarifado WHERE id = ? AND material_id = ?', [reserva_id, material_id]);
          if (!atual) throw Object.assign(new Error('Reserva não encontrada para este material'), { status: 400 });
          if (atual.status !== 'ATIVA') throw Object.assign(new Error(`Reserva ${atual.status.toLowerCase()} não pode ser consumida`), { status: 400 });
          const saldoReserva = Q.qtd(atual.quantidade - (atual.quantidade_utilizada || 0));
          throw Object.assign(new Error(`Quantidade acima do saldo da reserva: ${saldoReserva} ${material.unidade}`), { status: 400 });
        }

        // Agora o material: baixa o físico E o reservado juntos, porque a quantidade sai do
        // estoque e deixa de estar reservada na mesma operação. A guarda exige apenas que o
        // disponível não fique negativo IGNORANDO a parte reservada que está sendo consumida —
        // por isso `+ ?` (a quantidade) no cálculo.
        //
        // Etapa 8b: o `+ ?` ficava DENTRO da subtração escrita à mão; agora a subtração vem de
        // `disponivelSql()` e o `+ ?` ficou FORA dos parênteses. Soma e subtração comutam, e a
        // ORDEM DOS PLACEHOLDERS no texto do statement não mudou (id, permiteNegativo, `+`, `>=`),
        // então os parâmetros abaixo continuam os mesmos — é o único claim do motor onde a conta
        // aparece somada, e trocar essa ordem faria a guarda comparar números invertidos em
        // silêncio.
        const rowRes = await dbGet(db, `UPDATE materiais_almoxarifado
          SET quantidade_atual = ${Q.qtdSql('quantidade_atual - ?')},
              quantidade_reservada = ${Q.qtdSql('MAX(0, COALESCE(quantidade_reservada,0) - ?)')},
              updated_at = CURRENT_TIMESTAMP
          WHERE id = ? AND (? = 1 OR (${disponivelSql()} + ?) >= ? ${Q.FOLGA_SQL})
          RETURNING quantidade_atual`,
          [quantidade, quantidade, material_id, permiteNegativo ? 1 : 0, quantidade, quantidade]);
        if (!rowRes) {
          // Não há transação neste serviço (padrão do módulo: UPDATE condicional único).
          // Compensa a reivindicação acima à mão para não deixar a reserva consumida sem a
          // baixa correspondente de estoque.
          await dbRun(db, `UPDATE reservas_material_almoxarifado SET quantidade_utilizada = ${Q.qtdSql('MAX(0, quantidade_utilizada - ?)')} WHERE id = ?`, [quantidade, reserva_id]);
          throw Object.assign(new Error(`Saldo físico insuficiente para consumir a reserva. Disponível: ${await getSaldoDisponivel(material, db)} ${material.unidade}`), { status: 400 });
        }
        saldoPosterior = rowRes.quantidade_atual;
        saidaFisicoAplicado = true;

        // Reserva zerada não deve seguir ATIVA segurando saldo (reserva zumbi).
        // Etapa 67 (Fase 5): com tolerancia EPS — a soma de 0,1 dez vezes da 0,9999999999999999, e
        // `<= 0` deixava a reserva ATIVA para sempre com 1,1e-16 de saldo. A sobra (>= 0) sai do
        // reservado do material junto, e o reservado que sobra <= EPS vira zero.
        // Etapa 96 (Fase 5, R1): a sobra ARREDONDADA — a reserva legada de 1/3 (0.3333333333333333) consumida pelos
        // 0,333333 que a entrega arredondada manda sobrava 3,3e-7 > EPS e ficava ATIVA para sempre (zumbi).
        const sobraReserva = reserva.quantidade - reserva.quantidade_utilizada;
        if (Q.qtd(sobraReserva) <= 0) {
          await dbRun(db, "UPDATE reservas_material_almoxarifado SET status = 'CONSUMIDA', updated_at = CURRENT_TIMESTAMP WHERE id = ?", [reserva_id]);
          const sobra = Math.max(0, sobraReserva);
          await dbRun(db, `UPDATE materiais_almoxarifado SET quantidade_reservada = ${RESERVADA_MENOS_SQL},
            updated_at = CURRENT_TIMESTAMP WHERE id = ?`, [sobra, sobra, sobra, material_id]);
        }
      } else if (baixandoTerceiro) {
        // Baixa fisico E retencao NO MESMO UPDATE — molde de DECISAO_INSPECAO, e pela mesma razao:
        // como duas chamadas independentes, uma decisao concorrente poderia consumir o em_terceiros
        // pela metade, e o resultado seria material baixado do fisico com retencao presa para
        // sempre (ou o contrario). As duas guardas no WHERE: nao baixar mais do que esta la fora, e
        // nao negativar o fisico. `permiteNegativo` NAO se aplica aqui de proposito — o que esta no
        // terceiro e uma quantidade conhecida e finita; "perdi 40 de uma remessa de 30" e erro de
        // digitacao, nao operacao com saldo negativo.
        const rowT = await dbGet(db, `UPDATE materiais_almoxarifado
          SET quantidade_atual = ${Q.qtdSql('quantidade_atual - ?')},
              quantidade_em_terceiros = ${Q.qtdSql('COALESCE(quantidade_em_terceiros,0) - ?')},
              updated_at = CURRENT_TIMESTAMP
          WHERE id = ? AND COALESCE(quantidade_em_terceiros,0) >= ? ${Q.FOLGA_SQL} AND quantidade_atual >= ? ${Q.FOLGA_SQL}
          RETURNING quantidade_atual`,
          [quantidade, quantidade, material_id, quantidade, quantidade]);
        if (!rowT) {
          throw Object.assign(
            new Error(`Baixa acima do que está no terceiro: há ${Q.qtd(material.quantidade_em_terceiros || 0)} `
              + `${material.unidade} nessa situação (físico: ${Q.qtd(material.quantidade_atual)})`),
            { status: 400 });
        }
        saldoPosterior = rowT.quantidade_atual;
        saidaFisicoAplicado = true;
      } else if (baixandoBloqueado) {
        // Etapa 45 — molde EXATO do bloco acima, com `quantidade_bloqueada` no lugar. As duas
        // guardas no proprio WHERE, e pelas mesmas duas razoes: nao devolver mais do que a
        // inspecao reteve, e nao negativar o fisico. `permiteNegativo` NAO se aplica aqui de
        // proposito — o que esta bloqueado e quantidade conhecida e finita, e "devolvi 40 de uma
        // reprovacao de 3" e erro de digitacao, nao operacao com saldo negativo.
        //
        // ⚠️ E a mensagem diz os DOIS numeros. Com so um deles, o operador nao sabe qual das duas
        // condicoes falhou — e `bloqueada > atual` e estado alcancavel neste modulo.
        // ⚠️ O claim tolera EPSILON, e a tolerancia e PAR com a da precedencia em
        // `nonConformityService.efeitoExecucaoPrevisto` — as duas tem de concordar, ou o conserto
        // do CRITICAL so muda o sintoma de lugar. Com a precedencia tolerante e o claim cru,
        // devolver 3.4 de um pool que a aritmetica deixou em 3.3999999999999995 deixaria de
        // responder "ja havia saido do bloqueio" (200 mentindo) e passaria a estourar no motor,
        // derrubando a execucao e trancando o documento em PENDENTE. Trocar um defeito silencioso
        // por um beco nao e conserto.
        //
        // O raio e SO este ramo: `baixandoBloqueado` vale para um unico tipo (e, desde a Etapa 69,
        // para a `SUCATA` cujo chamador declara `doBloqueado` no 4o argumento). Afrouxar por
        // epsilon todo claim de saida do motor e decisao de outro tamanho, e nao desta etapa.
        const rowB = await dbGet(db, `UPDATE materiais_almoxarifado
          SET quantidade_atual = ${Q.qtdSql('quantidade_atual - ?')},
              quantidade_bloqueada = ${Q.qtdSql('COALESCE(quantidade_bloqueada,0) - ?')},
              updated_at = CURRENT_TIMESTAMP
          WHERE id = ? AND COALESCE(quantidade_bloqueada,0) >= ? - ${EPSILON_DIVERGENCIA}
            AND quantidade_atual >= ? - ${EPSILON_DIVERGENCIA}
          RETURNING quantidade_atual`,
          [quantidade, quantidade, material_id, quantidade, quantidade]);
        if (!rowB) {
          // Etapa 69: a literal nomeia a OPERACAO — "Devolucao acima..." numa sucata mandaria o
          // operador procurar uma devolucao que ninguem pediu. Os dois numeros continuam.
          const oQue = tipo === 'SUCATA' ? 'Sucateamento' : 'Devolução';
          throw Object.assign(
            new Error(`${oQue} acima do que está bloqueado: há ${Q.qtd(material.quantidade_bloqueada || 0)} `
              + `${material.unidade} bloqueado(s) (físico: ${Q.qtd(material.quantidade_atual)})`),
            { status: 400 });
        }
        saldoPosterior = rowB.quantidade_atual;
        saidaFisicoAplicado = true;
      } else {
      const row = await dbGet(db, `UPDATE materiais_almoxarifado
        SET quantidade_atual = ${Q.qtdSql('quantidade_atual - ?')}, updated_at = CURRENT_TIMESTAMP
        WHERE id = ? AND (? = 1 OR ${disponivelSql()} >= ? ${Q.FOLGA_SQL})
        RETURNING quantidade_atual`,
        [quantidade, material_id, permiteNegativo ? 1 : 0, quantidade]);
      if (!row) {
        throw Object.assign(new Error(`Saldo insuficiente. Disponível: ${await getSaldoDisponivel(material, db)} ${material.unidade}`), { status: 400 });
      }
      saldoPosterior = row.quantidade_atual;
      saidaFisicoAplicado = true;
      }
    } else if (tiposEntrada.includes(tipo)) {
      // Serie (Etapa 6b): cria/reativa as N series ANTES do credito fisico — se a lista tiver
      // duplicata ou serie ja em estoque, entradaSeries falha e NADA do credito abaixo roda.
      // localizacao_id usa a MESMA resolucao que a linha de saldo vai usar mais abaixo
      // (locEntrada, calculado de novo la por ser uma funcao pura sem efeito colateral).
      if (serieObrigatoria) {
        seriesAfetadas = await seriesService.entradaSeries(db, user, {
          material_id, numeros: seriesEntrada, lote_id: loteIdFinal,
          localizacao_id: resolveLocalizacaoEntrada(material, localizacao_destino_id) || null,
          movimentacao_id: null,
        });
      }
      if (custoInformado && custoInformado > 0) {
        const row = await dbGet(db, `UPDATE materiais_almoxarifado SET
            quantidade_atual = ${Q.qtdSql('quantidade_atual + ?')},
            custo_medio = CASE WHEN quantidade_atual > 0
              THEN ROUND(((quantidade_atual * ${custoUnitarioSql()}) + (? * ?)) / (quantidade_atual + ?), 4)
              ELSE ? END,
            custo_unitario = ?,
            updated_at = CURRENT_TIMESTAMP
          WHERE id = ?
          RETURNING quantidade_atual`,
          [quantidade, quantidade, custoInformado, quantidade, custoInformado, custoInformado, material_id]);
        saldoPosterior = row.quantidade_atual;
        // `entradaCreditoAplicado` (fix round 1): guarda custo_medio/custo_unitario ANTERIORES
        // (do `material` lido no topo da função) para o catch amplo poder restaurar os valores
        // exatos, não só zerar a quantidade — este UPDATE mexeu nos três campos juntos.
        entradaCreditoAplicado = {
          quantidade: parseFloat(quantidade), custoAplicado: true,
          custoMedioAnterior: material.custo_medio, custoUnitarioAnterior: material.custo_unitario,
          saldoLinhaId: null,
        };
      } else {
        // entrada sem custo informado: comportamento atual (só quantidade), inalterado
        const row = await dbGet(db, `UPDATE materiais_almoxarifado
          SET quantidade_atual = ${Q.qtdSql('quantidade_atual + ?')}, updated_at = CURRENT_TIMESTAMP
          WHERE id = ? RETURNING quantidade_atual`, [quantidade, material_id]);
        saldoPosterior = row.quantidade_atual;
        entradaCreditoAplicado = { quantidade: parseFloat(quantidade), custoAplicado: false, saldoLinhaId: null };
      }
    } else if (tiposAjuste.includes(tipo) && localizacao_destino_id) {
      // AJUSTE escopado a uma localização: define o saldo APENAS daquela localização (não o
      // total do material) e recalcula o total a partir da soma de TODAS as localizações/lotes
      // — inclui o caso de zerar (quantidade 0), daí `syncMaterialTotals` contar linhas em vez de
      // exigir total > 0.
      //
      // Round 3 (decisão de negócio do cliente, não achado técnico): esta task chegou a trocar
      // isto por um delta local (round 2), argumentando que a soma era uma segunda fonte de
      // verdade frágil. Tecnicamente funcionava, mas a SEMÂNTICA estava errada: o cliente decidiu
      // que contagem por localização REDEFINE o saldo do material — "aqui tem 40" quer dizer que
      // o total daquele lugar é 40, e o total do material é a soma de tudo que se sabe onde está,
      // não um incremento sobre o que havia antes sem endereço. É exatamente a semântica
      // "soma das linhas é a verdade" que `syncMaterialTotals` implementa. Restaurada.
      // loteIdFinal (Etapa 6, Task 3): AJUSTE citando lote define o saldo daquela linha de lote
      // específica; sem lote, loteIdFinal é null e o comportamento é o de sempre.
      // Etapa 51 (RN-04): checa ANTES de escrever se o total projetado ficaria negativo num material
      // que não permite — e se as linhas sem lote negativas ("sem localização atribuída") cobrem a
      // diferença. Só recusa se nem absorvendo o total chega a 0; senão absorve depois do SET.
      // Etapa 54 (RN-03): numa localização INATIVA o ajuste só reduz ou zera — subir saldo nela
      // recriaria o estado "inativa e ocupada" que a Etapa 52 fechou (o mapa não mostra).
      const locAjuste = await dbGet(db, 'SELECT codigo, ativo FROM localizacoes_almoxarifado WHERE id = ?', [localizacao_destino_id]);
      if (locAjuste && Number(locAjuste.ativo) !== 1) {
        const atualAqui = await dbGet(db, `SELECT COALESCE(SUM(quantidade), 0) as q FROM estoque_saldo_almoxarifado
          WHERE material_id = ? AND localizacao_id = ? AND lote_id IS ?`, [material_id, localizacao_destino_id, loteIdFinal || null]);
        // Fase 5: o teto e max(atual, 0) — numa linha NEGATIVA (saida de origem inativa com saldo
        // negativo permitido), zerar e subir em relacao a ela, e ficaria preso para sempre.
        if (parseFloat(quantidade) > Math.max(Number(atualAqui.q) || 0, 0) + EPS) {
          throw Object.assign(new Error(
            `Localização ${locAjuste.codigo} está inativa — o ajuste só pode reduzir ou zerar o saldo dela`,
          ), { status: 400 });
        }
      }
      if (!permiteNegativo) {
        const chave = [material_id, localizacao_destino_id, loteIdFinal || null];
        const proj = await dbGet(db, `SELECT
            COALESCE(SUM(CASE WHEN localizacao_id IS ? AND lote_id IS ? THEN 0 ELSE quantidade END), 0) as outras,
            COALESCE(SUM(CASE WHEN lote_id IS NULL AND quantidade < 0 AND NOT (localizacao_id IS ? AND lote_id IS ?)
                              THEN -quantidade ELSE 0 END), 0) as absorvivel
          FROM estoque_saldo_almoxarifado WHERE material_id = ?`,
        [chave[1], chave[2], chave[1], chave[2], material_id]);
        const totalProjetado = (Number(proj.outras) || 0) + parseFloat(quantidade);
        if (totalProjetado < -EPS && totalProjetado + (Number(proj.absorvivel) || 0) < -EPS) {
          throw Object.assign(new Error(
            `Ajuste deixaria o saldo do material negativo (${Math.round(totalProjetado * 1e6) / 1e6}). O material não permite saldo negativo.`,
          ), { status: 400 });
        }
      }
      const saldo = await getOrCreateSaldo(db, material_id, localizacao_destino_id, loteIdFinal);
      await dbRun(db, 'UPDATE estoque_saldo_almoxarifado SET quantidade = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
        [parseFloat(quantidade), saldo.id]);
      if (!permiteNegativo) await absorverNegativosSemLote(db, material_id, { excluirId: saldo.id });
      await syncMaterialTotals(db, material_id);
      const atual = await dbGet(db, 'SELECT quantidade_atual FROM materiais_almoxarifado WHERE id = ?', [material_id]);
      saldoPosterior = atual.quantidade_atual;
    } else if (tiposAjuste.includes(tipo)) { // AJUSTE sem localização — define valor absoluto (last-writer-wins é aceitável para ajuste)
      // Etapa 62 (RN-01): as series ANTES do SET do fisico — uma recusa aqui nao deixa o fisico
      // mudado; e se algo falhar depois, o catch amplo desfaz as series E restaura o fisico.
      if (serieAjuste && serieAjusteDelta > 0) {
        seriesAfetadas = await seriesService.entradaSeries(db, user, {
          material_id, numeros: seriesEntrada, lote_id: loteIdFinal, localizacao_id: material.localizacao_padrao_id || null, movimentacao_id: null,
        });
      } else if (serieAjuste && serieAjusteDelta < 0) {
        seriesClaim = await seriesService.claimSaidaSeries(db, user, {
          material_id, serie_ids: serieIdsSaida, lote_id: loteIdFinal, tipo, movimentacao_id: null,
        });
      }
      if (serieAjuste) {
        // Fase 5 (corrida): o fisico e um VALOR ABSOLUTO e as series mudam pela DIFERENCA — duas abas
        // (ou um ajuste e uma entrega) lendo as mesmas presentes quebravam o invariante (fisico 4,
        // presentes 6). So grava se as presentes, JA com as series deste ajuste, batem com o novo
        // total; senao 409 e o catch amplo desfaz as series. Mesmo padrao da regularizacao.
        const r = await dbRun(db, `UPDATE materiais_almoxarifado SET quantidade_atual = ?, updated_at = CURRENT_TIMESTAMP
          WHERE id = ? AND (SELECT COUNT(*) FROM series_almoxarifado WHERE material_id = ? AND status IN ('EM_ESTOQUE','BLOQUEADA')) = ?`,
        [saldoPosterior, material_id, material_id, saldoPosterior]);
        if (!r.changes) {
          throw Object.assign(new Error('as series do material mudaram durante o ajuste — recarregue e tente de novo'), { status: 409 });
        }
        ajusteSerieFisicoAnterior = saldoAnterior;
      } else {
        await dbRun(db, 'UPDATE materiais_almoxarifado SET quantidade_atual = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
          [saldoPosterior, material_id]);
      }
    } else {
      // Tipo neutro ao saldo (ex.: RETRABALHO) — achado do review final: este ramo antes caía
      // no "else" de AJUSTE acima e disparava um UPDATE...SET quantidade_atual = <valor lido no
      // início da função>, um last-writer-wins stale que podia sobrescrever saldo alterado por
      // outra transação concorrente. Tipos aqui não devem tocar quantidade_atual — saldoPosterior
      // permanece = saldoAnterior (setado no topo da função); o movimento ainda é registrado.
    }

    // saldo_anterior derivado do valor real pós-update (não da leitura pré-corrida):
    // entrada: anterior = posterior - qtd; saída: anterior = posterior + qtd; ajuste: mantém a leitura inicial.
    if (tiposEntrada.includes(tipo)) saldoAnteriorReal = Q.qtd(saldoPosterior - parseFloat(quantidade));
    else if (tiposSaida.includes(tipo)) saldoAnteriorReal = Q.qtd(saldoPosterior + parseFloat(quantidade));
    else saldoAnteriorReal = saldoAnterior;

    const locEntrada = tiposEntrada.includes(tipo) ? resolveLocalizacaoEntrada(material, localizacao_destino_id) : null;
    const locSaida = tiposSaida.includes(tipo) ? resolveLocalizacaoSaida(material, localizacao_origem_id) : null;

    // A linha de saldo por localização/lote é criada numa entrada/saída — mesmo sem localização
    // nem lote — desde o round 1 desta task (achado do review round 1). ESTRITAMENTE
    // NECESSÁRIO de novo a partir do round 3: `syncMaterialTotals` (chamada pelo
    // AJUSTE-com-localização e pelo estorno de qualquer AJUSTE, ver mais abaixo) recalcula
    // quantidade_atual pela SOMA de TODAS as linhas do material — se só PARTE das entradas/saídas
    // criasse linha, a soma ficaria PARCIAL e um AJUSTE-com-localização (ou o estorno dele)
    // sobrescreveria quantidade_atual com essa soma incompleta, evaporando a parte "invisível".
    // (O round 2 chegou a trocar essa reconciliação por um delta local, que não dependia desta
    // linha sempre existir — mas o cliente decidiu que a soma É a semântica de negócio correta:
    // contagem por localização redefine o saldo, não soma ao que havia sem endereço. Ver o
    // comentário no ramo AJUSTE-com-localização, abaixo.)
    //
    // ÚNICA EXCEÇÃO, e ela não fura a invariante (review final da Etapa 6): a SAÍDA com lote em
    // material que não permite negativo não cria linha nenhuma — ela DEBITA linhas que já existem
    // (`claimSaldoDoLote`). O que `syncMaterialTotals` precisa é que `quantidade_atual` e a soma
    // das linhas andem juntas, e andam: o claim tira do conjunto exatamente o mesmo que foi
    // tirado do total. Criar a linha ali era o que deixava um `(loc, lote, 0)` para trás em toda
    // saída RECUSADA.
    if (tiposEntrada.includes(tipo)) {
      const saldo = await getOrCreateSaldo(db, material_id, locEntrada, loteIdFinal);
      await dbRun(db, `UPDATE estoque_saldo_almoxarifado SET quantidade = ${Q.qtdSql('quantidade + ?')}, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
        [quantidade, saldo.id]);
      // fix round 1: guarda a linha para o catch amplo poder reverter esta linha especifica se o
      // INSERT do ledger falhar depois — `entradaCreditoAplicado` so existe quando serieObrigatoria
      // ou nao, entao a guarda aqui e so defensiva (este ramo sempre roda pra ENTRADA).
      if (entradaCreditoAplicado) entradaCreditoAplicado.saldoLinhaId = saldo.id;
    }
    if (tiposSaida.includes(tipo)) {
      // `saldoLinhasSaidaParaReverter` (Etapa 6b, Task 4; hoisted no fix round 1): registra a(s)
      // linha(s) de saldo que este bloco efetivamente debitou, para a compensação do claim de
      // série logo abaixo (ou o catch amplo, se o INSERT do ledger falhar depois) poder devolver
      // exatamente o que foi tirado. Diferente da compensação do claim de LOTE (que não precisa
      // disto: `claimSaldoDoLote` já autocompensa as próprias linhas por dentro quando FALHA — ver
      // a docstring dela), aqui o débito físico já teve SUCESSO quando o claim de série roda,
      // então a reversão da(s) linha(s) é responsabilidade de quem debitou.
      if (loteIdFinal && !permiteNegativo) {
        // Guarda no WHERE, como o resto do motor. Sem isto a subtracao negativa a linha do lote em
        // silencio: a guarda de saldo insuficiente la em cima compara com o disponivel do
        // MATERIAL, e o total do material (debitado direto, sem depender desta linha) continua
        // coerente e nada denuncia (reproduzido em 2026-08-09: lote B com 2 aceitou saida de 10 e
        // ficou em -8).
        // O claim e contra o CONJUNTO de linhas do lote, nao contra uma linha so, e NAO cria linha
        // — ver a docstring de `claimSaldoDoLote` para os dois motivos (alinhar com o saldo
        // agregado que a tela mostra; e nao deixar linha zerada atras de toda saida recusada).
        const claim = await claimSaldoDoLote(db, material_id, loteIdFinal, locSaida, quantidade);
        if (!claim.ok) {
          // O físico do material já foi debitado acima (linha ~439-452/rowRes quando a saída
          // consumia reserva, ou ~460-468 no caminho simples) antes deste claim rodar — não há
          // transação neste módulo, então recusar aqui sem devolver deixaria quantidade_atual
          // debitado sem contrapartida (trocaria um bug pelo outro). Compensa antes de lançar.
          await reverterFisicoDaSaida();
          throw Object.assign(
            new Error(`Saldo insuficiente no lote ${loteCodigoFinal}. Disponível: ${claim.disponivel} ${material.unidade}`),
            { status: 400 });
        }
        saldoLinhasSaidaParaReverter = claim.linhas;
      } else if (!loteIdFinal) {
        // Etapa 51 (RN-01/02): sem lote, a saída drena os ENDEREÇOS com saldo (a origem declarada
        // ou a padrão primeiro) e só o resto vai para a linha "sem localização atribuída". A
        // condição é `!loteIdFinal`, e não o `else` inteiro: este ramo também atendia saída COM
        // lote de material que permite negativo, que segue no ramo de baixo (Fase 2, IMPORTANT 3).
        saldoLinhasSaidaParaReverter = await claimSaldoSemLote(db, material_id, locSaida, quantidade);
      } else {
        // Com lote em material que permite saldo negativo: a linha continua sendo criada, porque
        // aqui ela PODE ficar negativa e precisa existir para `syncMaterialTotals` somar.
        const saldo = await getOrCreateSaldo(db, material_id, locSaida, loteIdFinal);
        await dbRun(db, `UPDATE estoque_saldo_almoxarifado SET quantidade = ${Q.qtdSql('quantidade - ?')}, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
          [quantidade, saldo.id]);
        saldoLinhasSaidaParaReverter = [{ id: saldo.id, quantidade }];
      }
      // Etapa 56 (Fase 5, reproduzido por sonda): a checagem de saldo da origem CONFIRMADA roda antes
      // do claim, com varios await no meio — duas saidas de 10 confirmadas em A (A:10, B:50) passavam
      // as duas, e a segunda drenava B gravando codigo_lido_origem = A. Confere DEPOIS do claim que
      // tudo saiu da origem; se nao, o catch amplo abaixo compensa as linhas e o fisico.
      const origemConferida = confirmadoOrigem || codigoOrigemEstrita;
      if (origemConferida && saldoLinhasSaidaParaReverter.length) {
        const ids = saldoLinhasSaidaParaReverter.map((l) => l.id);
        const fora = await dbGet(db, `SELECT COUNT(*) as n FROM estoque_saldo_almoxarifado
          WHERE id IN (${ids.map(() => '?').join(',')}) AND (localizacao_id IS NULL OR localizacao_id <> ?)`,
        [...ids, localizacao_origem_id]);
        if (Number(fora.n) > 0) {
          throw Object.assign(new Error(
            `O saldo em ${origemConferida} mudou durante a saída e não cobre mais a quantidade — confira e tente de novo`,
          ), { status: 400 });
        }
      }

      // Serie (Etapa 6b, Task 4): reivindica as series ESPECIFICAS depois que o debito fisico ja
      // aconteceu acima (agregado + linha de saldo) — cardinalidade (N series para N unidades) ja
      // foi validada mais cedo por `serieObrigatoria`, entao aqui e so o claim linha a linha.
      // `claimSaidaSeries` JA se autocompensa por dentro (nao deixa claim parcial de series numa
      // falha no meio da lista — ver a docstring dela), mas o debito FISICO desta saida (linha(s)
      // de saldo + quantidade_atual [+ reserva]) e responsabilidade DESTE bloco reverter: nao ha
      // transacao neste modulo, e sem isto uma serie de outro material, BLOQUEADA, ou fora do
      // lote da saida deixaria quantidade_atual debitado sem contrapartida — exatamente o Critical
      // do review da Task 3 (saida aceitava serie_ids, debitava o saldo, e nunca tocava
      // series_almoxarifado; aqui e o inverso perigoso: se so o saldo fosse debitado e a serie
      // recusada, o invariante COUNT(serie)==quantidade_atual quebraria do mesmo jeito).
      if (serieObrigatoria) {
        try {
          seriesClaim = await seriesService.claimSaidaSeries(db, user, {
            material_id, serie_ids: serieIdsSaida, lote_id: loteIdFinal, tipo, movimentacao_id: null,
          });
        } catch (e) {
          // Compensação LOCAL: o claim de série falhou aqui mesmo (não é o caso do INSERT do
          // ledger falhando depois — esse é tratado pelo catch amplo, mais abaixo). Depois de
          // compensar, ZERA `saldoLinhasSaidaParaReverter` (e `reverterFisicoDaSaida` já zera
          // `saidaFisicoAplicado` sozinha) — fix round 1: sem isto, o catch amplo (que também olha
          // essas variáveis) tentaria reverter de novo o que esta compensação local já reverteu.
          for (const l of saldoLinhasSaidaParaReverter) {
            await dbRun(db, `UPDATE estoque_saldo_almoxarifado
              SET quantidade = ${Q.qtdSql('quantidade + ?')}, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
              [l.quantidade, l.id]);
          }
          saldoLinhasSaidaParaReverter = [];
          await reverterFisicoDaSaida();
          throw e;
        }
      }
    }
    if (tiposAjuste.includes(tipo) && !localizacao_destino_id) {
      // AJUSTE sem localização define quantidade_atual por um valor absoluto sem dizer onde ele
      // está — mas a linha de saldo "sem localização/lote" (ou a da localização padrão, se
      // houver) tem de acompanhar esse valor, senão a soma que `syncMaterialTotals` faz no
      // próximo AJUSTE-com-localização (ou no estorno de qualquer AJUSTE) não vê essa parte do
      // físico (achado do review round 3 — ver docstring de `syncSaldoLocalizacaoPadrao`).
      // AJUSTE COM localização já escreveu na localização certa acima — chamar isto aqui
      // reescreveria a localização padrão por engano.
      await syncSaldoLocalizacaoPadrao(db, material_id, loteIdFinal, { drenar: true });
    }
  }

  result = await dbRun(db, `INSERT INTO movimentacoes_almoxarifado
    (material_id, tipo, quantidade, saldo_anterior, saldo_posterior, motivo, referencia, observacoes,
     usuario_id, usuario_nome, localizacao_origem_id, localizacao_destino_id, lote, lote_id, unidade,
     projeto_id, os_id, cliente_id, documento_vinculado, justificativa, reserva_id, recebimento_id, requisicao_id,
     centro_custo_id, emergencial, regularizacao_pendente, codigo_lido_origem, codigo_lido_destino, motivo_id)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`, [
    material_id, tipo, quantidade, Q.qtd(saldoAnteriorReal), Q.qtd(saldoPosterior),
    motivo || null, referencia || null, observacoes || null,
    user.id, user.nome || user.email,
    localizacao_origem_id || null, localizacao_destino_id || null, loteCodigoFinal, loteIdFinal, material.unidade,
    projeto_id || null, os_id || null, cliente_id || null,
    documento_vinculado || null, justificativa || null,
    reserva_id || null, recebimento_id || null, requisicao_id || null,
    centro_custo_id || null, emergencial ? 1 : 0, regularizacaoPendente, confirmadoOrigem, confirmadoDestino,
    motivo_id || null,
  ]);
  } catch (e) {
    // Compensa ANTES de relançar — o caminho de entrada/saída com série termina aqui dentro
    // (aplicação física + linha de saldo + INSERT do ledger), então qualquer falha nesse trecho
    // (inclusive o próprio INSERT) precisa desfazer o que já rodou, senão fica série órfã do
    // físico (ou o inverso) e o invariante COUNT(série) == quantidade_atual quebra.
    //
    // Fix round 1 (achado do review da Task 4): até aqui, este catch só desfazia SÉRIE
    // (`desfazerEntrada`) e nunca o físico — se o INSERT do ledger falhasse DEPOIS que a entrada já
    // tinha creditado `quantidade_atual`, a série era desfeita e o crédito físico ficava intacto:
    // `presentes=0 != quantidade_atual=N`, o próprio invariante que a etapa promete. Do lado da
    // saída, o mesmo buraco existia ao contrário (série reivindicada e débito físico órfãos do
    // movimento). Compensa na ordem inversa de aplicação em cada lado.
    //
    // SAÍDA — ordem de aplicação foi (1) físico agregado, (2) linha de saldo, (3) claim de série;
    // reverte (3), (2), (1). Quando o claim de série FALHOU (não o INSERT), o catch LOCAL logo
    // acima já compensou e já zerou `saldoLinhasSaidaParaReverter`/`saidaFisicoAplicado` — os `if`
    // abaixo viram no-op nesse caminho, evitando compensar em dobro. `seriesClaim` só fica
    // populado quando o claim teve SUCESSO (se falhou, a atribuição nunca completou), então não há
    // ambiguidade equivalente para ele.
    // RETENÇÃO — desfaz o delta que os ramos de `BLOQUEIO`/`DESBLOQUEIO`/`QUARENTENA`/
    // `LIBERACAO_INSPECAO`/`REPROVACAO_INSPECAO`/`DECISAO_INSPECAO` aplicaram lá em cima, FORA
    // deste `try`. Ver o comentário de `retencaoAplicada` na declaração: sem isto, uma falha no
    // `INSERT` do ledger (ou em qualquer coisa entre o pool e ele) devolvia erro ao chamador com
    // o pool **já mexido e sem linha no livro** — e quem chama confia no `throw` para concluir que
    // nada aconteceu. Foi medido produzindo liberação em dobro na Etapa 44.
    //
    // Soma o INVERSO do delta em vez de restaurar o valor lido no topo: o pool é agregado por
    // material, e restaurar o valor absoluto apagaria o que outra operação tiver feito no meio.
    // Sem guarda no `WHERE` de propósito — isto é a reversão de algo que JÁ aconteceu, e uma
    // guarda que recusasse deixaria o estado pior que o inconsistente: deixaria o inconsistente
    // **e** em silêncio.
    if (retencaoAplicada) {
      await dbRun(db, `UPDATE materiais_almoxarifado
        SET quantidade_bloqueada   = ${Q.qtdSql('COALESCE(quantidade_bloqueada,0) - ?')},
            quantidade_em_inspecao = ${Q.qtdSql('COALESCE(quantidade_em_inspecao,0) - ?')},
            updated_at = CURRENT_TIMESTAMP
        WHERE id = ?`, [retencaoAplicada.bloqueada, retencaoAplicada.emInspecao, material_id]);
    }
    if (seriesClaim.length > 0) {
      await seriesService.desfazerSaida(db, seriesClaim);
    }
    for (const l of saldoLinhasSaidaParaReverter) {
      await dbRun(db, `UPDATE estoque_saldo_almoxarifado
        SET quantidade = ${Q.qtdSql('quantidade + ?')}, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
        [l.quantidade, l.id]);
    }
    await reverterFisicoDaSaida();

    // ENTRADA — ordem de aplicação foi (1) série criada/reativada, (2) crédito de quantidade_atual
    // [+ custo médio], (3) linha de saldo; reverte (3), (2), depois (1).
    if (entradaCreditoAplicado) {
      if (entradaCreditoAplicado.saldoLinhaId) {
        await dbRun(db, `UPDATE estoque_saldo_almoxarifado SET quantidade = ${Q.qtdSql('quantidade - ?')}, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
          [entradaCreditoAplicado.quantidade, entradaCreditoAplicado.saldoLinhaId]);
      }
      if (entradaCreditoAplicado.custoAplicado) {
        // Restaura os valores EXATOS de antes (não só subtrai a quantidade) — o UPDATE de crédito
        // recalculou custo_medio/custo_unitario juntos com quantidade_atual num único statement.
        await dbRun(db, `UPDATE materiais_almoxarifado
          SET quantidade_atual = ${Q.qtdSql('quantidade_atual - ?')}, custo_medio = ?, custo_unitario = ?, updated_at = CURRENT_TIMESTAMP
          WHERE id = ?`,
          [entradaCreditoAplicado.quantidade, entradaCreditoAplicado.custoMedioAnterior, entradaCreditoAplicado.custoUnitarioAnterior, material_id]);
      } else {
        await dbRun(db, `UPDATE materiais_almoxarifado SET quantidade_atual = ${Q.qtdSql('quantidade_atual - ?')}, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
          [entradaCreditoAplicado.quantidade, material_id]);
      }
    }
    // Para todo tipo que não seja entrada com série obrigatória, seriesAfetadas é [] e este
    // bloco é um no-op.
    if (seriesAfetadas.length > 0) {
      await seriesService.desfazerEntrada(db, seriesAfetadas);
    }
    if (ajusteSerieFisicoAnterior !== null) {
      await dbRun(db, 'UPDATE materiais_almoxarifado SET quantidade_atual = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
        [Q.qtd(ajusteSerieFisicoAnterior), material_id]);
    }
    throw e;
  }

  // Vínculo série → movimentação (Etapa 6b): só agora o id da movimentação existe. Feito fora do
  // try acima de propósito — se este UPDATE falhar, a movimentação e o crédito físico já estão
  // gravados; desfazer a série aqui reabriria a compensação depois do ledger já ter sido escrito
  // (o que os testes do invariante rejeitam de outra forma: o vínculo é auxiliar, não afeta saldo
  // nem o invariante COUNT(série) == quantidade_atual).
  if (seriesAfetadas.length > 0) {
    await dbRun(db, `UPDATE series_almoxarifado SET movimentacao_entrada_id = ?
      WHERE id IN (${seriesAfetadas.map(() => '?').join(',')})`,
      [result.lastID, ...seriesAfetadas.map((a) => a.linha.id)]);
  }
  // Vínculo série → movimentação de SAÍDA (Etapa 6b, Task 4): mesmo raciocínio e mesma janela que
  // a entrada acima — `claimSaidaSeries` roda com `movimentacao_id: null` porque o id do ledger
  // ainda não existia, então o vínculo é completado aqui, fora do try. É este UPDATE que fecha o
  // Critical do review da Task 3: sem ele a saída debitava o saldo e nunca tocava
  // `series_almoxarifado`.
  if (seriesClaim.length > 0) {
    await dbRun(db, `UPDATE series_almoxarifado SET movimentacao_saida_id = ?
      WHERE id IN (${seriesClaim.map(() => '?').join(',')})`,
      [result.lastID, ...seriesClaim.map((c) => c.linha.id)]);
  }

  // Etapa 25 (RN-04/RN-05): `ip` e `user_agent` de onde a movimentacao partiu. `camposDeOrigem`
  // e funcao PURA sobre `user.origem` — um objeto ja montado pelo middleware do modulo, sem
  // nenhum acesso a Express aqui dentro. E por isso que esta linha NAO ganhou `try/catch`: a
  // auditoria de movimentacao nunca teve um (59 das 60 chamadas de `registrarAuditoria` do
  // modulo estao sem `try`), criar um agora mudaria a semantica congelada — hoje, auditoria que
  // falha derruba a resposta com 500 — e esta etapa nao decidiu isso. Sem `req` (job de fundo,
  // teste com `user` literal) o retorno e `{}` e a trilha fica exatamente como era.
  await registrarAuditoria(db, {
    entidade: 'movimentacao', entidade_id: result.lastID, acao: tipo,
    usuario_id: user.id, usuario_nome: user.nome || user.email,
    dados_novos: {
      material_id, tipo, quantidade, saldo_posterior: saldoPosterior, ...camposDeOrigem(user),
    },
    justificativa,
  });

  const verificarAlerta = async () => {
    try {
      // saldo_anterior (Etapa 12, revisao final C1): e a evidencia de "transicao observada" do
      // alerta de zerado — sem ela, a primeira zeragem de material recem-conhecido pela maquina
      // era engolida como se fosse estado pre-existente.
      await alertService.verificarAlertaPorMaterialId(db, material_id, { saldo_anterior: saldoAnteriorReal });
    } catch (alertErr) {
      console.warn('[almoxarifado-alertas] Falha ao verificar alerta pós-movimentação:', alertErr.message);
    }
  };
  // Etapa 91 (Fase 5, F3): dentro de uma secao da trava por material (as seis portas da 91) o alerta —
  // e o `sendMail` dele — roda DEPOIS de a trava ser solta; um SMTP lento segurava a fila inteira do
  // material. Fora de secao, sincrono como sempre (ver `travaPorMaterial.adiarParaDepoisDaSecao`).
  if (!trava.adiarParaDepoisDaSecao(verificarAlerta)) await verificarAlerta();

  // Etapa 12 (RN-04, D8): notificacao pos-commit — todas as escritas do motor ja tiveram
  // sucesso; movimentacao que falha em qualquer guarda nunca chega aqui. O gancho mora no
  // MOTOR porque movimentacao entra por varias portas (v1, v2, rotas dedicadas, servicos).
  // Config-gated (default '0') e try/catch: aviso NUNCA derruba movimentacao.
  try {
    if (await getConfig(db, 'notificar_movimentacoes') === '1') {
      await notificationQueueService.enfileirarMovimentacao(db, {
        id: result.lastID, tipo, quantidade, saldo_anterior: saldoAnteriorReal,
        saldo_posterior: saldoPosterior, justificativa, motivo, referencia,
        // Fase 2: loteIdFinal/loteCodigoFinal, NAO o lote_id cru — ele vem null sempre que a
        // chamada usou o CODIGO do lote (inclusive quando a entrada CRIOU o lote).
        lote_id: loteIdFinal, lote_codigo: loteCodigoFinal,
        // Revisao da Task 2 (I1): RN-04 pede "lote/serie quando houver" — os numeros vem das
        // linhas que o motor REALMENTE criou/reivindicou (RETURNING *), nao do input cru.
        serie_numeros: [...seriesAfetadas, ...seriesClaim]
          .map((s) => s.linha && s.linha.numero).filter(Boolean),
        projeto_id, os_id, cliente_id, requisicao_id, documento_vinculado,
      }, material, user);
    }
  } catch (notifErr) {
    console.warn('[almoxarifado-notificacoes] Falha ao enfileirar pos-movimentacao:', notifErr.message);
  }

  return { id: result.lastID, saldo_anterior: saldoAnteriorReal, saldo_posterior: saldoPosterior };
}

// Decisão (Etapa 2, Task 2): cancelarMovimentacao NÃO chama validarLocalizacaoParaMovimento.
// Reverter um movimento precisa ser sempre possível, mesmo que a localização envolvida tenha
// sido bloqueada (ou teve seus tipos_material_permitidos alterados) DEPOIS que o movimento
// original aconteceu — senão o saldo fica preso sem forma de estornar. Restrições de endereço
// só se aplicam a movimentos NOVOS via registrarMovimentacao.
async function cancelarMovimentacao(db, user, movimentoId, motivo) {
  if (!motivo) throw Object.assign(new Error('Justificativa obrigatória para cancelamento'), { status: 400 });
  const mov = await dbGet(db, 'SELECT * FROM movimentacoes_almoxarifado WHERE id = ?', [movimentoId]);
  if (!mov) throw Object.assign(new Error('Movimentação não encontrada'), { status: 404 });
  // Etapa 96 (Fase 2, M3): o livro antigo pode guardar a quantidade torta — o estorno reverte o numero arredondado.
  mov.quantidade = Q.qtd(mov.quantidade);
  // Etapa 74 (Fase 5): a movimentacao ja cancelada e recusada AQUI, antes de qualquer efeito — ate a Fase 5 so
  // o claim (la embaixo) recusava, e o segundo POST de estorno numa ENTRADA_COMPRA ja estornada liberava ANTES
  // a reserva da chegada de quem esperava (liberarParaEstorno) e so depois respondia "ja cancelada": a
  // requisicao perdia o material para quem fosse aprovado depois (C121 de volta). Mesma literal do claim, que
  // continua sendo a guarda da corrida (duas chamadas que passam aqui juntas).
  if (Number(mov.cancelado) === 1) throw Object.assign(new Error('Movimentação já cancelada'), { status: 400 });
  if (mov.tipo === 'ESTORNO') throw Object.assign(new Error('Estorno não pode ser estornado'), { status: 400 });
  if (['RESERVA', 'LIBERACAO_RESERVA'].includes(mov.tipo)) {
    throw Object.assign(new Error('Use a liberação de reserva para desfazer reservas'), { status: 400 });
  }
  // Etapa 5 (achado do review final): os tipos da quarentena não têm ramo de reversão aqui —
  // sem esta recusa, estornar uma QUARENTENA gravava a linha ESTORNO e marcava a original
  // cancelada SEM tocar em quantidade_em_inspecao: o livro afirmava uma reversão que não
  // aconteceu. Reverter de verdade também não caberia aqui: o retido de uma decisão pertence ao
  // ITEM do recebimento (recebimentos_material_itens_almoxarifado.quantidade_em_inspecao), que
  // este serviço não conhece — devolver só o pool do material recriaria o descasamento
  // item x material que a Task 4 fechou. A porta certa é a tela de Inspeções.
  if (['QUARENTENA', 'LIBERACAO_INSPECAO', 'REPROVACAO_INSPECAO', 'DECISAO_INSPECAO'].includes(mov.tipo)) {
    throw Object.assign(
      new Error('Movimento de inspeção não pode ser estornado pelo livro — use a tela de Inspeções para rever a decisão'),
      { status: 400 });
  }
  // Etapa 44 (achado IMPORTANT da revisão adversarial): a LIBERAÇÃO por não conformidade é um
  // `DESBLOQUEIO` — tipo que **é** estornável pelo livro, e por isso escapava das duas guardas ao
  // lado. Estorná-la devolvia a quantidade a `quantidade_bloqueada` e deixava o documento
  // `DECIDIDA` dizendo "aceito" com o material preso: o furo C57 ressuscitado, e desta vez **sem
  // saída** — a NC não pode ser redecidida (409) e uma NC nova da mesma inspeção devolve
  // `JA_LIBERADA`, porque `liberacao_nc_em` continua carimbado.
  //
  // Pior: o ramo `BLOQUEIO` do estorno **não tem guarda** contra `quantidade_atual`, então
  // liberar → consumir → estornar deixa `bloqueada > atual`, ou seja, **disponível negativo** —
  // exatamente a "retenção sem lastro físico" que o desenho da etapa evitou no caminho normal e
  // que voltaria por aqui, a dois cliques na tela do livro.
  //
  // A recusa casa pelo MOTIVO, e não por `documento_vinculado LIKE 'NC-%'`: o número é dado de
  // usuário em outros tipos de movimento, e o motivo é escrito por um único ponto do código.
  // Etapa 45: a devolução ao fornecedor herda a razão da recusa acima, e a herda mais forte.
  // Estorná-la traria o material de volta ao galpão com o documento dizendo "devolvido" — e **sem
  // saída**, porque a execução não se registra duas vezes (claim em `execucao_em` e no carimbo da
  // inspeção). O material voltaria bloqueado, sem ninguém para decidir de novo o que fazer com ele.
  //
  // Casa por **tipo**, e não por motivo como a recusa acima: `DEVOLUCAO_FORNECEDOR` é DEDICADO —
  // só nasce do documento —, então o tipo já é a régua exata. A recusa da liberação teve de casar
  // por motivo justamente porque `DESBLOQUEIO` é público e nasce também do bloqueio avulso.
  if (mov.tipo === 'DEVOLUCAO_FORNECEDOR') {
    throw Object.assign(
      new Error('Devolução ao fornecedor não pode ser estornada pelo livro — o material voltaria bloqueado com o documento dizendo que foi devolvido'),
      { status: 400 });
  }
  // Etapa 69 (D3/RN-02) — a SUCATA do material reprovado herda a recusa da devolucao, e pela mesma
  // razao: o estorno comum de SUCATA devolve ao DISPONIVEL (ramo `tiposSaida`), entao estorna-la
  // liberaria material CONDENADO, com a inspecao carimbada, a NC `EXECUTADA` e o sucateamento
  // `APROVADO` — sem nenhuma porta (as tres olham o carimbo). Correcao de sucateamento indevido = AJUSTE.
  //
  // O discriminador e `referencia = 'SUC-<id>'` + `nao_conformidade_id IS NOT NULL` no sucateamento
  // (Fase 2): a `referencia` e escrita no MESMO INSERT do livro (atomica com a linha), ao contrario
  // de `movimentacao_sucata_id`, gravado depois. Nao casa por `motivo`: o `returnService` grava
  // `SUCATA` com o motivo DIGITADO pelo usuario. A SUCATA do sucateamento COMUM continua estornavel.
  if (mov.tipo === 'SUCATA' && /^SUC-\d+$/.test(String(mov.referencia || ''))) {
    const sucId = Number(String(mov.referencia).slice(4));
    const ligado = await dbGet(db, `SELECT id FROM sucateamentos_almoxarifado
      WHERE id = ? AND material_id = ? AND nao_conformidade_id IS NOT NULL`, [sucId, mov.material_id]);
    if (ligado) {
      throw Object.assign(
        new Error('Sucateamento de material reprovado não pode ser estornado pelo livro — o material voltaria ao estoque disponível com a não conformidade dizendo que foi sucateado'),
        { status: 400 });
    }
  }
  if (mov.tipo === 'DESBLOQUEIO' && mov.motivo === MOTIVO_LIBERACAO_NC) {
    throw Object.assign(
      new Error('Liberação por não conformidade não pode ser estornada pelo livro — o documento continuaria dizendo "aceito" com o material bloqueado'),
      { status: 400 });
  }
  // Etapa 8b (achado da Task 4, que o plano não previa): mesma recusa, mesmo motivo. O par de
  // RETENÇÃO da remessa não tem ramo de reversão no if-chain abaixo — sem esta guarda, estornar
  // uma REMESSA_TERCEIRO gravaria a linha de ESTORNO e marcaria a original cancelada SEM tocar em
  // quantidade_em_terceiros: o livro afirmaria uma reversão que não aconteceu e a retenção ficaria
  // presa. Reverter de verdade também não caberia aqui: o retido pertence ao ITEM da remessa
  // (itens_remessa_terceiro_almoxarifado.quantidade_retornada e o status do documento), que este
  // serviço não conhece — mexer só no pool do material recriaria o descasamento item x material.
  // A porta certa é cancelar/encerrar a própria remessa.
  // (Contraste deliberado com PERDA_TERCEIRO/CONSUMO_TERCEIRO, que SÃO estornáveis pelo livro:
  // aqueles são saída de verdade e o estorno devolve ao disponível — ver tiposSaida abaixo.)
  if (['REMESSA_TERCEIRO', 'RETORNO_TERCEIRO'].includes(mov.tipo)) {
    throw Object.assign(
      new Error('Movimento de remessa a terceiro não pode ser estornado pelo livro — use a tela de Remessas para cancelar ou encerrar a remessa'),
      { status: 400 });
  }
  if (mov.requisicao_id) {
    throw Object.assign(new Error('Movimentação vinculada a requisição — use os fluxos da requisição (exclusão/encerramento)'), { status: 400 });
  }

  // SEGUNDA declaracao de tiposSaida deste arquivo (a outra esta em registrarMovimentacao). Sao
  // duplicadas de proposito historico, e esquecer uma ao acrescentar tipo torna o motor
  // assimetrico — a saida entra pela regra nova e o estorno dela nao.
  //
  // Etapa 8: a guarda do dono (ownerRules.assertSaidaPermitida) NAO e chamada aqui, e isso e
  // decisao, nao esquecimento: o cancelamento DEVOLVE a chapa do cliente ao estoque — o oposto
  // de aplica-la no cliente errado. Espelhar a guarda aqui deixaria a saida errada sem como ser
  // desfeita, que e exatamente o contrario do que a guarda quer.
  //
  // Etapa 8, Task 6: DEVOLUCAO_CLIENTE entra em tiposSaida NOS DOIS lugares, e a decisao foi
  // tomada olhando este ramo, nao copiada do outro. Aqui nao ha "guarda a mais": o if-chain
  // abaixo nao tem `else` final, entao tipo que nao esta em tiposEntrada/tiposSaida/AJUSTE/
  // TRANSFERENCIA/BLOQUEIO/DESBLOQUEIO seria marcado `cancelado = 1` e ganharia linha de ESTORNO
  // com saldo_anterior == saldo_posterior — o livro diria que a devolucao foi desfeita e o
  // material NUNCA voltaria ao saldo. Assimetria silenciosa, do tipo que esta etapa inteira caca.
  // (Contraste deliberado com a guarda do dono acima, que fica SO em registrarMovimentacao: la o
  // motivo para nao espelhar e que o cancelamento devolve a chapa ao estoque.)
  //
  // Etapa 8b: PERDA_TERCEIRO/CONSUMO_TERCEIRO entram aqui tambem, e a decisao foi tomada olhando
  // ESTE ramo. O ramo de saida abaixo credita quantidade_atual e NAO recria
  // quantidade_em_terceiros — o que e exatamente o comportamento certo, e nao um efeito colateral
  // aceito de ma vontade: quando alguem estorna a baixa, a remessa ja esta ENCERRADA, e recriar a
  // retencao seria um hold sem remessa viva por tras — o saldo orfao que a decisao 4 do design
  // rejeita. O material volta ao DISPONIVEL, que e o unico estado que sobra fazendo sentido.
  // Deixa-los FORA seria o pior dos mundos: cairiam no if-chain sem ramo, marcados cancelado = 1
  // com linha de ESTORNO de saldo_anterior == saldo_posterior, e o material baixado nunca voltaria.
  //
  // Etapa 8c: RETORNO_TRANSFORMACAO entra aqui TAMBEM, e a decisao foi tomada olhando ESTE ramo e
  // nao copiada do outro. O ramo de entrada abaixo subtrai quantidade_atual e NAO reverte custo
  // (decisao explicita da Etapa 1, ~:1548) — comportamento aceito e testado como tal em
  // tests/api/transformacaoMotor.api.test.js. Deixa-lo FORA seria o pior dos mundos: cairia no
  // if-chain sem ramo (nao ha `else` final), marcado cancelado=1 com linha de ESTORNO de
  // saldo_anterior == saldo_posterior, e a peca creditada nunca sairia do saldo.
  const tiposEntrada = movementTypes.TIPOS_ENTRADA;
  const tiposSaida = movementTypes.TIPOS_SAIDA;
  const material = await getMaterial(db, mov.material_id);

  // Etapa 71 (Fase 2, corrige a RN-08/C108 do plano, que estavam ERRADAS): a ENTRADA_COMPRA de nota
  // cujo item ainda tem quantidade EM INSPECAO nao e estornavel. O plano dizia que o motor ja recusava
  // (falta de disponivel, "material ja consumido") — so recusava SEM outro estoque do material. Com
  // outro saldo cobrindo o disponivel (saldo global, regra do CLAUDE.md) o estorno passava, a inspecao
  // continuava com o retido e depois aprovava o que "nao entrou" (sonda 71r-b). A porta certa e a
  // inspecao: decidida ela, o estorno segue o caminho normal. Antes do claim: nada foi tocado.
  //
  // O item e o do vinculo (T1); sem vinculo (legado), os itens do par recebimento+material ainda sem
  // dono — conservador: um irmao retido do mesmo material tambem recusa.
  if (mov.tipo === 'ENTRADA_COMPRA' && mov.recebimento_id) {
    const retido = await dbGet(db, `SELECT COALESCE(SUM(COALESCE(quantidade_em_inspecao, 0)), 0) AS q
      FROM recebimentos_material_itens_almoxarifado
      WHERE recebimento_id = ? AND (movimentacao_entrada_id = ?
        OR (movimentacao_entrada_id IS NULL AND material_id = ?))`,
    [mov.recebimento_id, movimentoId, mov.material_id]);
    const emInspecao = parseFloat(retido && retido.q) || 0;
    if (emInspecao > EPSILON_DIVERGENCIA) {
      const qtdTexto = Number(emInspecao.toFixed(6));
      throw Object.assign(new Error(
        `Esta entrada tem ${qtdTexto} ${material.unidade || 'un'} em inspeção — decida a inspeção antes de estornar a entrada`),
      { status: 400 });
    }

    // Etapa 71, Fase 5 (decisao reversivel, letra B): a entrada cujo item teve QUALQUER inspecao com
    // REPROVADO tambem nao e estornavel. A reprovacao zera o em_inspecao e passa o retido para
    // `quantidade_bloqueada` com NC aberta — a guarda acima nao via, e o estorno passava: sem lote o
    // reprovado saia DUAS vezes (estorno + devolucao/sucata da NC); com lote a NC ficava presa
    // ("Saldo insuficiente no lote"). O reprovado tem caminho proprio (a NC: devolver/sucatear); o
    // estorno da entrada inteira debitaria de novo o que ja saiu ou esta bloqueado. Descartado:
    // estornar so a parte aprovada (o livro tem UMA movimentacao por item; partir o estorno e motor
    // novo) e liberar o bloqueado no estorno (apagaria a NC aberta). Inspecao so com aprovado
    // continua estornavel. Mesma resolucao de item da guarda acima (vinculo ou par legado sem dono).
    const reprovado = await dbGet(db, `SELECT COALESCE(SUM(COALESCE(i.quantidade_reprovada, 0)), 0) AS q
      FROM inspecoes_recebimento_almoxarifado i
      JOIN recebimentos_material_itens_almoxarifado ri ON ri.id = i.recebimento_item_id
      WHERE ri.recebimento_id = ? AND (ri.movimentacao_entrada_id = ?
        OR (ri.movimentacao_entrada_id IS NULL AND ri.material_id = ?))`,
    [mov.recebimento_id, movimentoId, mov.material_id]);
    const qtdReprovada = parseFloat(reprovado && reprovado.q) || 0;
    if (qtdReprovada > EPSILON_DIVERGENCIA) {
      throw Object.assign(new Error(
        `Esta entrada teve ${Number(qtdReprovada.toFixed(6))} ${material.unidade || 'un'} reprovado(s) na inspeção — `
        + 'o reprovado sai pela não conformidade; esta entrada não pode ser estornada'),
      { status: 400 });
    }
  }

  // Serie (Etapa 6b, Task 5): guarda ANTES do claim `cancelado = 1` — antes de marcar a
  // movimentação como cancelada, precisa ficar claro que a reversão é possível. Estornar uma
  // ENTRADA de material com série só é seguro se TODAS as unidades daquela entrada ainda
  // estiverem EM_ESTOQUE; se alguma já saiu (ENTREGUE/SUCATEADA), `reverterEntrada` marcaria
  // ESTORNADA só as que sobraram e o par serie<->movimentação ficaria inconsistente com o
  // saldo estornado (o invariante COUNT(serie)==quantidade_atual quebra do lado da série ficar
  // "presente" numa entrada que o livro diz ter sido desfeita). Recusar aqui, antes do claim, é
  // mais simples que reverter o claim no catch — nada foi tocado ainda.
  if (tiposEntrada.includes(mov.tipo) && material.controle_serie) {
    const presentes = await dbGet(db, `SELECT COUNT(*) AS n FROM series_almoxarifado
      WHERE movimentacao_entrada_id = ? AND status = 'EM_ESTOQUE'`, [movimentoId]);
    if (presentes.n < Math.round(mov.quantidade)) {
      throw Object.assign(new Error(
        'estorno de entrada recusado: ha series desta entrada ja movimentadas — estorne as saidas primeiro'),
        { status: 400 });
    }
  }

  // Serie (Etapa 6b, review final do branch): guarda simétrica à de cima, para o ramo de SAÍDA.
  // Sonda do review: entrada da série SN-1 -> saída (série ENTREGUE, movimentacao_saida_id=M) ->
  // reentrada manual via ENTRADA v2 (`entradaSeries` reativa e ANULA movimentacao_saida_id, ver
  // seriesService.js) -> cancelar a saída M: `reverterSaida` filtra por
  // `movimentacao_saida_id = M AND status IN ('ENTREGUE','SUCATEADA')` e não acha nada (a série
  // escapou do filtro porque a reentrada zerou o vínculo) — sem esta guarda o cancelamento seguia
  // em frente e devolvia o saldo mesmo assim: quantidade_atual contava a unidade que já estava
  // fisicamente presente de novo desde a reentrada, dobrada. Invariante COUNT(série presente) ==
  // quantidade_atual quebrado pra sempre — não há segunda chance depois: o claim abaixo já teria
  // marcado `cancelado=1`, não sobra estorno para desfazer isto.
  if (tiposSaida.includes(mov.tipo) && material.controle_serie) {
    const entregues = await dbGet(db, `SELECT COUNT(*) AS n FROM series_almoxarifado
      WHERE movimentacao_saida_id = ? AND status IN ('ENTREGUE', 'SUCATEADA')`, [movimentoId]);
    if (entregues.n < Math.round(mov.quantidade)) {
      throw Object.assign(new Error(
        'estorno de saida recusado: series desta saida ja reentraram no estoque — a devolucao ja repos o material'),
        { status: 400 });
    }
  }

  // Etapa 62 (Fase 2, critico): o estorno do AJUSTE reverte so o fisico — com series, as criadas pelo
  // ajuste ficavam presentes e as baixadas ficavam BAIXADA, e o invariante quebrava de novo. O livro
  // nao guarda com seguranca QUAIS series desfazer (uma entrada posterior reativa a BAIXADA e zera o
  // vinculo), entao: recusa, e o caminho e um NOVO ajuste (que pede as series). Letra B.
  if (mov.tipo === 'AJUSTE' && material.controle_serie) {
    throw Object.assign(new Error(
      'estorno de ajuste de material com serie recusado — faca um novo ajuste (ele pede as series)'),
      { status: 400 });
  }

  // Etapa 74 (T3, D8/B374): o estorno da ENTRADA_COMPRA desfaz, antes do claim, a reserva que a propria nota
  // criou para quem esperava (reservaChegadaService) — so o necessario, da ultima na ordem para a primeira,
  // so de quem espera sem nada separado. Sem isto a nota que atendeu alguem ficava inestornavel ("material ja
  // consumido") ate alguem liberar a mao. Se nem assim cabe, nada e tocado e a recusa abaixo e a da 71.
  // `require` lazy: reservaChegadaService requer este motor no topo. Nao-fatal: a falha cai na recusa de hoje.
  //
  // Etapa 74 (Fase 5): duas defesas para a reserva liberada nao se perder num estorno que nao acontece.
  //  (1) PRE-CHECAGEM do lote, antes de liberar: a recusa da linha do lote (ramo de ENTRADA, `minimo`) vinha
  //      DEPOIS da liberacao — a requisicao perdia a reserva e o estorno nao acontecia. Mesma condicao e mesma
  //      literal do ramo (que continua la, para a corrida). So ENTRADA_COMPRA: e o unico tipo que libera.
  //  (2) RECRIACAO geral: se o estorno falhar por QUALQUER motivo depois de liberar (claim perdido, ledger,
  //      guarda do ramo), `recriarReservasDoEstorno` recria exatamente o que foi liberado e o status e
  //      recalculado; a falha original continua sendo a resposta.
  // Descartado: mover a liberacao para DEPOIS do debito do ramo de entrada (ela existe justamente para o
  // debito caber no disponivel) e envolver tudo numa transacao (o motor nao tem transacao — Postgres depois).
  let liberadasNoEstorno = [];
  let requisicoesDoEstorno = [];
  if (mov.tipo === 'ENTRADA_COMPRA' && mov.recebimento_id) {
    const permiteNegativoPre = material.permite_saldo_negativo || (await getConfig(db, 'permite_saldo_negativo_global')) === '1';
    if (mov.lote_id && !permiteNegativoPre) {
      const linhaLote = await dbGet(db, `SELECT quantidade FROM estoque_saldo_almoxarifado
        WHERE material_id = ? AND localizacao_id IS ? AND lote_id IS ?`,
      [mov.material_id, (mov.localizacao_destino_id || material.localizacao_padrao_id) || null, mov.lote_id]);
      if (linhaLote && Number(linhaLote.quantidade) < Number(mov.quantidade)) {
        throw Object.assign(new Error(mensagemLoteNaoComportaEstorno(mov, linhaLote.quantidade)), { status: 400 });
      }
    }
    try {
      // eslint-disable-next-line global-require
      liberadasNoEstorno = await require('./reservaChegadaService').liberarParaEstorno(db, user, mov);
      requisicoesDoEstorno = [...new Set(liberadasNoEstorno.map((l) => l.requisicao_id))];
    } catch (e) {
      console.warn(`[almoxarifado] liberacao das reservas da chegada no estorno falhou (movimentacao ${movimentoId}): ${e.message}`);
    }
  }

  // Claim atômico ANTES de aplicar qualquer efeito inverso (achado do review final: double-cancel
  // race). O UPDATE...WHERE cancelado = 0 é a própria seção crítica sob o lock de linha do SQLite:
  // de duas chamadas concorrentes para o mesmo movimentoId, só uma tem changes = 1 — essa é a
  // única que segue para reverter saldo; a outra falha aqui, antes de tocar em qualquer saldo.
  // Também zera regularizacao_pendente aqui (achado do review: estorno deixava a pendência viva).
  const claim = await dbRun(db, `UPDATE movimentacoes_almoxarifado
    SET cancelado = 1, cancelado_por = ?, cancelado_em = CURRENT_TIMESTAMP, cancelamento_motivo = ?, regularizacao_pendente = 0
    WHERE id = ? AND cancelado = 0`, [user.id, motivo, movimentoId]);
  if (!claim.changes) {
    // Etapa 74 (Fase 5): outro estorno ganhou o claim — o que ESTE liberou volta para quem esperava.
    await recriarReservasDoEstorno(db, user, liberadasNoEstorno, movimentoId);
    await recalcularStatusAposEstorno(db, requisicoesDoEstorno);
    throw Object.assign(new Error('Movimentação já cancelada'), { status: 400 });
  }

  let estornoId;

  // Fix round 1 (Task 5, achado do review por sonda): rastreadores de compensação, populados
  // só pelos ramos de ENTRADA/SAIDA (os únicos que tocam série). Até este fix, o `catch` abaixo
  // só desfazia o CLAIM (`cancelado = 0`) — se o efeito inverso (saldo + série) já tinha
  // aplicado com sucesso e só o INSERT do ledger de ESTORNO falhasse depois, saldo e série
  // ficavam no estado REVERTIDO (como se o estorno tivesse acontecido) mas a movimentação
  // original voltava a `cancelado = 0`, livre para ser cancelada de novo. Sonda do review:
  // entrada de 2 séries -> saída das 2 -> cancelar a saída com o INSERT do ledger forçado a
  // falhar -> saldo volta a 2 e séries a EM_ESTOQUE (efeito aplicado), mas `cancelado` volta a
  // 0 -> um SEGUNDO `/cancelar` na mesma movimentação tem sucesso e soma o saldo de novo (2 ->
  // 4) sem tocar série (que já estava EM_ESTOQUE, fora do filtro de `reverterSaida`) ->
  // `presentes=2 != quantidade_atual=4`, invariante corrompido PERMANENTEMENTE (o segundo
  // cancelamento é bem-sucedido, não há mais claim para tentar de novo).
  let compensarQuantidadeMaterial = null; // delta a devolver em quantidade_atual, se o ledger falhar
  let compensarLinha = null; // { loc, loteId, delta } — delta a reaplicar na linha específica de saldo
  // Etapa 51 (Fase 5): o estorno de entrada sem lote pode debitar VARIAS linhas (claimSaldoSemLote) —
  // a compensacao devolve cada uma pelo id.
  let compensarLinhasClaim = null;
  let compensarSyncLocalizacaoPadrao = null; // { loteId } — reconciliarEstornoSemLinha sincronizou a linha padrão; refazer DEPOIS de restaurar quantidade_atual
  let seriesEntradaRevertidas = []; // afetadas[] de reverterEntrada, para desfazerReverterEntrada
  let seriesSaidaRevertidas = []; // afetadas[] de reverterSaida, para desfazerReverterSaida

  try {
    let saldoAntes = material.quantidade_atual;
    let saldoDepois = saldoAntes;

    if (tiposEntrada.includes(mov.tipo)) {
      // Reverter entrada = saída com guarda de disponível (a mercadoria pode já ter sido consumida).
      // Mesmo padrão atômico de registrarMovimentacao (Task 3): UPDATE...RETURNING sob o lock de
      // linha do SQLite fecha a janela de corrida entre a leitura acima e a escrita; saldoAntes é
      // derivado do valor pós-update (não da leitura pré-corrida) para manter o par saldo_anterior/
      // saldo_posterior do livro coerente mesmo sob concorrência.
      const permiteNegativo = material.permite_saldo_negativo || (await getConfig(db, 'permite_saldo_negativo_global')) === '1';
      const row = await dbGet(db, `UPDATE materiais_almoxarifado
        SET quantidade_atual = ${Q.qtdSql('quantidade_atual - ?')}, updated_at = CURRENT_TIMESTAMP
        WHERE id = ? AND (? = 1 OR ${disponivelSql()} >= ? ${Q.FOLGA_SQL})
        RETURNING quantidade_atual`,
        [mov.quantidade, mov.material_id, permiteNegativo ? 1 : 0, mov.quantidade]);
      if (!row) throw Object.assign(new Error(await mensagemEstornoSemDisponivel(db, mov)), { status: 400 });
      saldoDepois = row.quantidade_atual;
      saldoAntes = saldoDepois + parseFloat(mov.quantidade);
      // A partir daqui quantidade_atual JÁ foi debitado — se qualquer coisa adiante falhar
      // (linha não comporta, ledger do estorno), o catch precisa devolver este delta (fix round
      // 1, Task 5: antes deste fix, só a "linha não comporta" abaixo compensava isto — a
      // falha do INSERT do ledger, mais adiante, não compensava nada).
      compensarQuantidadeMaterial = mov.quantidade;
      // reverter localização da entrada original — mov.lote_id (Etapa 6, Task 3) devolve para a
      // MESMA linha de lote que a entrada creditou, lida do próprio ledger (imutável), não
      // recalculada. Sem gate por localização desde o review round 3: `syncMaterialTotals` soma
      // TODAS as linhas do material, então uma linha sem localização nem lote também precisa
      // acompanhar o estorno, senão fica "fantasma" com o valor de antes e um
      // AJUSTE-com-localização posterior ressuscita quantidade já removida.
      // Mas o estorno NUNCA cria a linha DESTA chave (review round 4): se a movimentação original é
      // legada e nunca escreveu linha, criar uma agora com −quantidade inventa uma linha negativa
      // que inverte a primeira contagem daquele material — ver `ajustarSaldoExistente`.
      // Quando a chave não casa, quem decide é `reconciliarEstornoSemLinha` (round 5): material sem
      // nenhuma linha segue no-op; material que já tem linha reconcilia o residual, senão
      // `quantidade_atual` desgarra da soma e a contagem seguinte apaga este estorno. O miss também
      // acontece sem nada de legado — a chave usa a localização padrão de HOJE, e o forward usou a
      // da época.
      //
      // O PISO da linha (review final da Etapa 6): a guarda acima protege o disponível do
      // MATERIAL, e a subtração acerta a linha do LOTE — exatamente a assimetria do −8 original,
      // só que na direção inversa. Sem `minimo`, estornar a entrada de um lote cujo saldo já saiu
      // deixava a linha daquele lote NEGATIVA em silêncio (medido: −10), com o total do material
      // coerente e a listagem FEFO passando a exibir saldo negativo num material que não permite
      // saldo negativo. Só vale quando há lote E o material não permite negativo — a mesma
      // condição do ramo forward, e a que preserva `loteGuardasSaida.api.test.js`
      // (`material que permite negativo continua podendo negativar a linha no estorno`).
      // NAO e restricoesEndereco.api.test.js:213 — aquele teste (achado do review final) e sobre
      // DELETE de localizacao com SUM(quantidade) das linhas dando zero (net-zero), sem lote nem
      // permite_saldo_negativo envolvidos.
      const loc = mov.localizacao_destino_id || material.localizacao_padrao_id;
      // Etapa 51 (Fase 5, IMPORTANT): desde que a saída sem lote drena os endereços, a linha desta
      // entrada pode já ter sido consumida por uma saída de OUTRO lugar do raciocínio — entradas de
      // 100 em A e em B, saída de 100 que drenou A, estorno da entrada de A ⇒ A:−100 e B:100 com o
      // físico em 0 (o endereço fantasma que a etapa existe para eliminar). Sem lote e sem negativo,
      // quando a linha da entrada não comporta a reversão, o estorno debita como uma SAÍDA: a linha
      // da entrada primeiro, depois as outras com saldo (`claimSaldoSemLote`).
      if (!mov.lote_id && !permiteNegativo) {
        const linhaEntrada = await dbGet(db, `SELECT quantidade FROM estoque_saldo_almoxarifado
          WHERE material_id = ? AND localizacao_id IS ? AND lote_id IS NULL`, [mov.material_id, loc || null]);
        if (linhaEntrada && Number(linhaEntrada.quantidade) < Number(mov.quantidade) - EPS) {
          compensarLinhasClaim = await claimSaldoSemLote(db, mov.material_id, loc, Number(mov.quantidade));
        }
      }
      const pisoLinha = (mov.lote_id && !permiteNegativo) ? mov.quantidade : null;
      const r = compensarLinhasClaim
        ? { aplicado: true, existe: true, viaClaim: true }
        : await ajustarSaldoExistente(db, mov.material_id, loc, mov.lote_id, -mov.quantidade, { minimo: pisoLinha });
      if (!r.aplicado && r.existe) {
        // A linha existe e não comporta a reversão. `quantidade_atual` já foi debitado logo acima
        // e não há transação aqui — o `catch` deste método devolve o físico agora (fix round 1,
        // Task 5: `compensarQuantidadeMaterial`, setado acima, cobre exatamente este caso; a
        // compensação manual que existia aqui foi removida para não devolver em dobro).
        throw Object.assign(new Error(mensagemLoteNaoComportaEstorno(mov, r.quantidade)), { status: 400 });
      }
      if (r.aplicado && r.viaClaim) {
        // a compensacao das N linhas fica em `compensarLinhasClaim`, devolvida no catch.
      } else if (r.aplicado) {
        // Fix round 1 (Task 5): se o ledger falhar depois, a compensação é o delta oposto na
        // MESMA chave (loc, lote) — espelha exatamente o que este `ajustarSaldoExistente` acabou
        // de aplicar (−mov.quantidade), sem piso (a compensação está devolvendo, não retirando).
        compensarLinha = { loc, loteId: mov.lote_id, delta: mov.quantidade };
      } else {
        const sincronizou = await reconciliarEstornoSemLinha(db, mov.material_id, mov.lote_id);
        // Fix round 1 (Task 5): reconciliarEstornoSemLinha só mexeu em algo (via
        // syncSaldoLocalizacaoPadrao) quando o material já tinha alguma linha — `sincronizou`
        // distingue isso do no-op de material legado sem linha nenhuma, que não precisa de
        // compensação. A compensação em si só pode rodar DEPOIS que quantidade_atual tiver
        // voltado ao valor original (ver ordem no catch), porque syncSaldoLocalizacaoPadrao lê
        // quantidade_atual para calcular o residual.
        if (sincronizou) compensarSyncLocalizacaoPadrao = { loteId: mov.lote_id };
      }
      // Serie (Etapa 6b, Task 5): so depois que o saldo reverteu de verdade — a guarda lá em
      // cima (antes do claim) já garantiu que todas as séries desta entrada seguem EM_ESTOQUE,
      // então aqui é só marcar ESTORNADA. Condicionado a controle_serie para não gastar o
      // SELECT + laço à toa em material sem série (reverterEntrada é no-op de qualquer forma,
      // sem linha vinculada a este movimentacao_entrada_id). Fix round 1 (Task 5): guarda o
      // retorno (afetadas[], não mais a contagem) para o catch poder compensar via
      // `desfazerReverterEntrada` se o ledger falhar depois.
      if (material.controle_serie) seriesEntradaRevertidas = await seriesService.reverterEntrada(db, user, mov.id);
      // Decisão (Etapa 1): estorno NÃO reverte custo_medio/custo_unitario — reversão exata é
      // mal-definida após movimentos intermediários; corrigir via nova entrada com custo. Ver
      // specs/modulo-almoxarifado/03-motor-estoque/README.md.
    } else if (tiposSaida.includes(mov.tipo)) {
      await dbRun(db, `UPDATE materiais_almoxarifado SET quantidade_atual = ${Q.qtdSql('quantidade_atual + ?')}, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
        [mov.quantidade, mov.material_id]);
      saldoDepois = saldoAntes + parseFloat(mov.quantidade);
      // Fix round 1 (Task 5): a partir daqui quantidade_atual JÁ foi creditado — se algo adiante
      // falhar (ledger do estorno), o catch precisa devolver este delta (subtrair de volta).
      compensarQuantidadeMaterial = -mov.quantidade;
      // mov.lote_id (Etapa 6, Task 3): devolve para a linha do lote que a saída original debitou.
      // Sem gate por localização (round 3), sem CRIAR a linha desta chave (round 4) e com
      // reconciliação do residual quando o material já tem linha (round 5) — mesmos motivos do ramo
      // de ENTRADA acima; aqui a linha inventada seria +quantidade, que soma ao próximo inventário
      // uma quantidade que nunca teve endereço.
      //
      // SEM piso aqui, e isso é decisão, não esquecimento (review final da Etapa 6): o delta é
      // POSITIVO, então nenhum valor de `quantidade` da linha pode torná-lo inválido — devolver
      // saldo não cria negativo. Um "teto" simétrico ao piso do ramo de ENTRADA precisaria de um
      // limite superior por linha, que não existe: o almoxarifado não tem capacidade máxima
      // modelada, e inventar uma aqui recusaria estornos legítimos. O que existe de assimetria
      // real é de DISTRIBUIÇÃO: quando a saída original drenou linhas de mais de uma localização
      // (`claimSaldoDoLote`), o estorno devolve tudo na linha desta chave. O total volta exato; o
      // endereçamento pode consolidar. Pendência declarada na spec 10.
      const loc = mov.localizacao_origem_id || material.localizacao_padrao_id;
      const r = await ajustarSaldoExistente(db, mov.material_id, loc, mov.lote_id, mov.quantidade);
      if (r.aplicado) {
        // Fix round 1 (Task 5): compensação é o delta oposto na mesma chave (−mov.quantidade),
        // espelhando o +mov.quantidade que este `ajustarSaldoExistente` acabou de aplicar.
        compensarLinha = { loc, loteId: mov.lote_id, delta: -mov.quantidade };
      } else {
        const sincronizou = await reconciliarEstornoSemLinha(db, mov.material_id, mov.lote_id);
        if (sincronizou) compensarSyncLocalizacaoPadrao = { loteId: mov.lote_id };
      }
      // Serie (Etapa 6b, Task 5): devolve a EM_ESTOQUE as series ENTREGUE/SUCATEADA desta saida,
      // logo apos o saldo ja ter voltado. Sem guarda de disponibilidade aqui (diferente do ramo
      // de ENTRADA acima) — devolver serie ao estoque nunca pode ficar "negativo". Fix round 1
      // (Task 5): guarda o retorno (afetadas[]) para o catch poder compensar via
      // `desfazerReverterSaida` se o ledger falhar depois.
      if (material.controle_serie) seriesSaidaRevertidas = await seriesService.reverterSaida(db, user, mov.id);
    } else if (mov.tipo === 'AJUSTE') {
      if (mov.localizacao_destino_id) {
        // AJUSTE escopado a uma localização (Task 6): um SET absoluto do total, como no ramo
        // global abaixo, ignoraria as OUTRAS localizações do material — a soma das linhas de
        // estoque_saldo_almoxarifado deixaria de bater com quantidade_atual (achado do review
        // pós-Task 6). O delta que o ajuste aplicou à localização é o mesmo que aplicou ao total
        // (saldo_posterior - saldo_anterior do livro, ambos totais do material), então revertemos
        // SÓ a localização por esse delta e recalculamos o total a partir da soma real
        // (`syncMaterialTotals` — restaurada no review round 3, decisão de negócio do cliente:
        // ver o comentário no ramo forward de registrarMovimentacao).
        // Etapa 96 (Fase 2, K1): o delta e uma DIFERENCA calculada em JS (1 - 0,7 = 0.30000000000000004) — sem arredondar
        // e sem folga, a linha 0,3 limpa recusava o estorno.
        const delta = Q.qtd(mov.saldo_posterior - mov.saldo_anterior);
        const saldoLoc = await getOrCreateSaldo(db, mov.material_id, mov.localizacao_destino_id, mov.lote_id);
        if (!Q.cabe(delta, saldoLoc.quantidade)) {
          throw Object.assign(new Error('Não é possível estornar: a localização não comporta a reversão (saldo já consumido)'), { status: 400 });
        }
        await dbRun(db, `UPDATE estoque_saldo_almoxarifado SET quantidade = ${Q.qtdSql('quantidade - ?')}, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
          [delta, saldoLoc.id]);
        // Etapa 51 (RN-04; Fase 5, MINOR): o estorno do AJUSTE com localização recalcula o total
        // pela soma. No AJUSTE de IDA a absorção das linhas sem lote negativas se justifica — é uma
        // contagem, é verdade física. No ESTORNO não há contagem: absorver faria o livro registrar
        // uma quantidade que não se moveu (estorno de 50 com 45 sumindo na absorção). Então, se o
        // total ficaria negativo num material que não permite, RECUSA e devolve a linha.
        const matEstorno = await getMaterial(db, mov.material_id);
        const permiteNegEstorno = matEstorno.permite_saldo_negativo
          || (await getConfig(db, 'permite_saldo_negativo_global')) === '1';
        if (!permiteNegEstorno) {
          const tot = await dbGet(db, 'SELECT COALESCE(SUM(quantidade),0) as t FROM estoque_saldo_almoxarifado WHERE material_id = ?',
            [mov.material_id]);
          if (Number(tot.t) < -EPS) {
            await dbRun(db, `UPDATE estoque_saldo_almoxarifado SET quantidade = ${Q.qtdSql('quantidade + ?')}, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
              [delta, saldoLoc.id]);
            throw Object.assign(new Error('Não é possível estornar: o saldo já foi consumido (o estorno deixaria o material negativo)'),
              { status: 400 });
          }
        }
        await syncMaterialTotals(db, mov.material_id);
        const atual = await dbGet(db, 'SELECT quantidade_atual FROM materiais_almoxarifado WHERE id = ?', [mov.material_id]);
        saldoDepois = atual.quantidade_atual;
      } else {
        // AJUSTE sem localização — comportamento original: SET absoluto do total do material.
        await dbRun(db, 'UPDATE materiais_almoxarifado SET quantidade_atual = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
          [Q.qtd(mov.saldo_anterior), mov.material_id]);
        saldoDepois = Q.qtd(mov.saldo_anterior);
        await syncSaldoLocalizacaoPadrao(db, mov.material_id, mov.lote_id);
      }
    } else if (mov.tipo === 'AJUSTE_INVENTARIO') {
      // RN-10/D11 (Etapa 10): AJUSTE_INVENTARIO representa uma contagem fisica HOMOLOGADA — nao
      // e um delta que faz sentido reverter para saldo_anterior (AJUSTE comum ja faz isso no ramo
      // acima; este e NOVO de proposito, nao reusa aquele ramo). Recusa explicita, mesmo
      // precedente de REMESSA_TERCEIRO (linha ~1360): o caminho de correcao e uma contagem nova.
      throw Object.assign(new Error(
        'Ajuste de inventário não pode ser estornado por aqui — o caminho de correção é uma '
        + 'nova conferência de inventário.'), { status: 400 });
    } else if (mov.tipo === 'TRANSFERENCIA') {
      // mov.lote_id (Etapa 6, Task 3): estorna a MESMA linha de lote que a transferência moveu.
      const origem = await getOrCreateSaldo(db, mov.material_id, mov.localizacao_origem_id, mov.lote_id);
      const destino = await getOrCreateSaldo(db, mov.material_id, mov.localizacao_destino_id, mov.lote_id);
      if (!Q.cabe(mov.quantidade, destino.quantidade)) {
        throw Object.assign(new Error('Não é possível estornar: o destino não tem mais o saldo transferido'), { status: 400 });
      }
      await dbRun(db, `UPDATE estoque_saldo_almoxarifado SET quantidade = ${Q.qtdSql('quantidade - ?')}, updated_at = CURRENT_TIMESTAMP WHERE id = ?`, [mov.quantidade, destino.id]);
      await dbRun(db, `UPDATE estoque_saldo_almoxarifado SET quantidade = ${Q.qtdSql('quantidade + ?')}, updated_at = CURRENT_TIMESTAMP WHERE id = ?`, [mov.quantidade, origem.id]);
    } else if (mov.tipo === 'BLOQUEIO') {
      // Guarda condicional em vez de MAX(0,...) — mesma correção do ramo DESBLOQUEIO de
      // registrarMovimentacao (achado do review final). Com a saturação, estornar um BLOQUEIO
      // que o DESBLOQUEIO já tinha desfeito "passava" (0 - 10 saturava em 0) e o estorno
      // seguinte do DESBLOQUEIO somava 10 de volta: quantidade_bloqueada = 10 sem NENHUM
      // bloqueio vivo por trás, a dois cliques na tela do livro. Recusando aqui, o BLOQUEIO
      // continua vivo — e o catch abaixo desfaz o claim, então ele não fica preso como cancelado.
      const claim = await dbGet(db, `UPDATE materiais_almoxarifado
        SET quantidade_bloqueada = ${Q.qtdSql('COALESCE(quantidade_bloqueada,0) - ?')}, updated_at = CURRENT_TIMESTAMP
        WHERE id = ? AND COALESCE(quantidade_bloqueada,0) >= ? ${Q.FOLGA_SQL}
        RETURNING id`, [mov.quantidade, mov.material_id, mov.quantidade]);
      if (!claim) {
        throw Object.assign(new Error(
          `Não é possível estornar: o bloqueio já foi desfeito (quantidade bloqueada: ${Q.qtd(material.quantidade_bloqueada || 0)})`),
          { status: 400 });
      }
    } else if (mov.tipo === 'DESBLOQUEIO') {
      await dbRun(db, `UPDATE materiais_almoxarifado SET quantidade_bloqueada = ${Q.qtdSql('COALESCE(quantidade_bloqueada,0) + ?')}, updated_at = CURRENT_TIMESTAMP WHERE id = ?`, [mov.quantidade, mov.material_id]);
    }

    const r = await dbRun(db, `INSERT INTO movimentacoes_almoxarifado
      (material_id, tipo, quantidade, saldo_anterior, saldo_posterior, motivo, referencia, observacoes,
       usuario_id, usuario_nome, localizacao_origem_id, localizacao_destino_id, lote, lote_id, unidade,
       projeto_id, os_id, cliente_id, documento_vinculado, justificativa, centro_custo_id)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`, [
      mov.material_id, 'ESTORNO', mov.quantidade, Q.qtd(saldoAntes), Q.qtd(saldoDepois),
      `Estorno mov. #${movimentoId}`, mov.referencia, null,
      user.id, user.nome || user.email,
      mov.localizacao_destino_id, mov.localizacao_origem_id, mov.lote, mov.lote_id, mov.unidade,
      mov.projeto_id, mov.os_id, mov.cliente_id, `ESTORNO-${movimentoId}`, motivo,
      mov.centro_custo_id,
    ]);
    estornoId = r.lastID;

    await dbRun(db, 'UPDATE movimentacoes_almoxarifado SET movimento_estorno_id = ? WHERE id = ?', [estornoId, movimentoId]);
  } catch (err) {
    // Fix round 1 (Task 5, achado do review por sonda): compensa os efeitos de SÉRIE e SALDO que
    // os ramos de ENTRADA/SAIDA já tinham aplicado com sucesso, na ordem inversa da aplicação,
    // ANTES de desfazer o claim — mesmo padrão do catch de `registrarMovimentacao` (Task 4). Até
    // este fix, uma falha aqui (ex.: o INSERT do ledger de ESTORNO, mais abaixo) só desfazia o
    // claim: saldo e série ficavam "revertidos" (como se o estorno tivesse valido) mas a
    // movimentação original voltava a `cancelado = 0` — um segundo `/cancelar` bem-sucedido
    // duplicava o efeito e corrompia o invariante COUNT(série)==quantidade_atual permanentemente
    // (não há mais claim para barrar essa segunda chamada, ela é legítima do ponto de vista dela).
    //
    // Ordem (inversa da aplicação: série é sempre o ÚLTIMO efeito de cada ramo — ver os dois
    // `if (material.controle_serie) ...Revertidas = await ...` acima):
    //  1. série (desfazerReverterSaida / desfazerReverterEntrada)
    //  2. linha específica de saldo (`compensarLinha`, quando `ajustarSaldoExistente` aplicou)
    //  3. `quantidade_atual` do material (`compensarQuantidadeMaterial`) — precisa vir ANTES do
    //     passo 4, porque `syncSaldoLocalizacaoPadrao` lê `quantidade_atual` para calcular o
    //     residual da linha padrão.
    //  4. linha padrão (`compensarSyncLocalizacaoPadrao`, quando `reconciliarEstornoSemLinha`
    //     tinha sincronizado)
    // Só um dos dois lados (entrada OU saída) tem estado não-vazio por chamada — a função só
    // processa um `tipo` de cada vez —, então os blocos abaixo convivem sem se atrapalhar.
    if (seriesSaidaRevertidas.length > 0) {
      await seriesService.desfazerReverterSaida(db, seriesSaidaRevertidas);
    }
    if (seriesEntradaRevertidas.length > 0) {
      await seriesService.desfazerReverterEntrada(db, seriesEntradaRevertidas);
    }
    if (compensarLinha) {
      await dbRun(db, `UPDATE estoque_saldo_almoxarifado
        SET quantidade = ${Q.qtdSql('quantidade + ?')}, updated_at = CURRENT_TIMESTAMP
        WHERE material_id = ? AND localizacao_id IS ? AND lote_id IS ?`,
        [compensarLinha.delta, mov.material_id, compensarLinha.loc || null, compensarLinha.loteId || null]);
    }
    if (compensarLinhasClaim) {
      for (const l of compensarLinhasClaim) {
        await dbRun(db, `UPDATE estoque_saldo_almoxarifado
          SET quantidade = ${Q.qtdSql('quantidade + ?')}, updated_at = CURRENT_TIMESTAMP WHERE id = ?`, [l.quantidade, l.id]);
      }
    }
    if (compensarQuantidadeMaterial) {
      await dbRun(db, `UPDATE materiais_almoxarifado SET quantidade_atual = ${Q.qtdSql('quantidade_atual + ?')}, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
        [compensarQuantidadeMaterial, mov.material_id]);
    }
    if (compensarSyncLocalizacaoPadrao) {
      await syncSaldoLocalizacaoPadrao(db, mov.material_id, compensarSyncLocalizacaoPadrao.loteId);
    }

    // Desfaz o claim: se a aplicação do efeito inverso falhar (ex.: saldo insuficiente para
    // reverter uma entrada já consumida), o movimento não pode ficar marcado como cancelado sem
    // ter revertido nada — senão fica "preso" (não pode ser estornado de novo) sem o saldo ter
    // voltado. regularizacao_pendente volta ao valor original lido antes do claim.
    await dbRun(db, `UPDATE movimentacoes_almoxarifado SET cancelado = 0, cancelado_por = NULL, cancelado_em = NULL,
      cancelamento_motivo = NULL, regularizacao_pendente = ? WHERE id = ?`, [mov.regularizacao_pendente, movimentoId]);
    // Etapa 74 (T3 + Fase 5): o estorno nao aconteceu, mas as reservas da chegada ja foram liberadas — recria
    // o que foi liberado (o fisico ja voltou acima, entao o hold cabe de novo) e o status acompanha.
    await recriarReservasDoEstorno(db, user, liberadasNoEstorno, movimentoId);
    await recalcularStatusAposEstorno(db, requisicoesDoEstorno);
    throw err;
  }

  // Etapa 25 (RN-04): o cancelamento tambem e `entidade: 'movimentacao'` e e o ato que mais se
  // quer rastrear — deixar origem so na linha de cima daria uma trilha que sabe de onde veio
  // toda movimentacao MENOS o estorno dela. O plano da Task 3 citava apenas `:1367`; incluir
  // este ponto e extensao declarada, nao esquecimento (a linha de ESTORNO em si nasce de um
  // INSERT direto aqui dentro, nao de `registrarMovimentacao`, entao ela nao seria alcancada
  // pela auditoria de cima).
  await registrarAuditoria(db, {
    entidade: 'movimentacao', entidade_id: movimentoId, acao: 'CANCELAMENTO',
    usuario_id: user.id, usuario_nome: user.nome || user.email, justificativa: motivo,
    dados_novos: { estorno_id: estornoId, ...camposDeOrigem(user) },
  });

  // Etapa 71 (D5/B333) — O PEDIDO DE COMPRA DESCONTA E REABRE. No MOTOR (e nao na rota) porque o
  // estorno entra por mais de uma porta; DEPOIS do claim e da auditoria do cancelamento, entao roda
  // uma vez so por movimentacao (o segundo estorno morre no claim, RN-05). Nao-fatal: um estorno de
  // saldo legitimo nao pode falhar porque a tabela do Compras falhou. `require` lazy porque o
  // receiptService requer este motor no topo.
  let pedidoCompra = null;
  if (mov.tipo === 'ENTRADA_COMPRA' && mov.recebimento_id) {
    try {
      // eslint-disable-next-line global-require
      pedidoCompra = await require('./receiptService').estornarEntradaNoPedido(db, user, mov);
    } catch (e) {
      console.warn(`[almoxarifado] desconto do pedido de compra no estorno falhou (movimentacao ${movimentoId}): ${e.message}`);
    }
  }

  // Etapa 74 (T3): o status das requisicoes que perderam a reserva da chegada, DEPOIS de o pedido reabrir
  // (AGUARDANDO_COMPRA conta a compra que volta a vir; antes dele seria AGUARDANDO_ESTOQUE).
  await recalcularStatusAposEstorno(db, requisicoesDoEstorno);

  try {
    await alertService.verificarAlertaPorMaterialId(db, mov.material_id);
  } catch (alertErr) {
    console.warn('[almoxarifado-alertas] Falha ao verificar alerta pós-estorno:', alertErr.message);
  }

  // Etapa 12 (revisao da Task 2, I2): a notificacao PENDENTE da movimentacao original nao pode
  // mais sair — o saldo que ela anuncia acabou de ser revertido. Vira FALHA com erro literal
  // (nunca DELETE: a fila e o historico, D4). Sem gate de config: se a linha existe, foi
  // enfileirada com a config ligada; suprimir e higiene incondicional. Try/catch pelo mesmo
  // motivo do gancho — aviso nunca derruba estorno.
  try {
    await notificationQueueService.suprimirNotificacaoMovimentacao(db, movimentoId);
  } catch (notifErr) {
    console.warn('[almoxarifado-notificacoes] Falha ao suprimir notificacao pós-estorno:', notifErr.message);
  }

  // A chave `pedido_compra` so existe quando um pedido foi tocado (aditivo — nenhuma resposta muda).
  return pedidoCompra
    ? { success: true, estorno_id: estornoId, pedido_compra: pedidoCompra }
    : { success: true, estorno_id: estornoId };
}

/**
 * Etapa 74 (T3): recalcula o status das requisicoes que perderam a reserva da chegada no estorno. Cada uma no
 * seu try — o estorno (ou a recusa dele) nunca muda por causa do rotulo. `require` lazy (ver acima).
 */
async function recriarReservasDoEstorno(db, user, liberadas, movimentoId) {
  if (!liberadas || !liberadas.length) return;
  try {
    // eslint-disable-next-line global-require
    await require('./reservaChegadaService').recriarAposEstornoRecusado(db, user, liberadas);
  } catch (e) {
    console.warn(`[almoxarifado] recriacao das reservas da chegada apos estorno recusado falhou (movimentacao ${movimentoId}): ${e.message}`);
  }
}

/** A recusa da linha do lote no estorno da entrada — uma literal, dois lugares (pre-checagem da Fase 5 e o ramo). */
function mensagemLoteNaoComportaEstorno(mov, quantidadeLinha) {
  return `Não é possível estornar: o lote ${mov.lote || mov.lote_id} tem ${Q.qtd(quantidadeLinha)} `
    + `${mov.unidade || ''} nesta localização, menos que os ${mov.quantidade} que a entrada creditou`;
}

/**
 * Etapa 74 (Fase 5): a recusa do estorno de entrada por falta de DISPONIVEL. Ate a Fase 5 era sempre "material ja
 * consumido" — mentira quando nada saiu e o que falta esta so RESERVADO (quem ja separou, reserva da aprovacao):
 * o usuario procurava uma saida que nao existe. Quando o disponivel + o reservado cobrem o estorno, a recusa diz
 * quem segura (numeros das requisicoes com reserva ATIVA do material; reserva sem requisicao = "reservas
 * manuais"). Fora disso (consumo real, bloqueio, inspecao, terceiros) fica a literal da 71.
 */
async function mensagemEstornoSemDisponivel(db, mov) {
  const RECUSA_CONSUMIDO = 'Não é possível estornar: saldo disponível insuficiente (material já consumido)';
  try {
    const m = await dbGet(db, `SELECT ${disponivelSql()} AS disponivel, COALESCE(quantidade_reservada, 0) AS reservada
      FROM materiais_almoxarifado WHERE id = ?`, [mov.material_id]);
    const disp = Number(m && m.disponivel) || 0;
    const reservada = Number(m && m.reservada) || 0;
    if (!(reservada > EPS) || disp + reservada < Number(mov.quantidade) - EPS) return RECUSA_CONSUMIDO;
    const linhas = await dbAll(db, `SELECT rs.requisicao_id, r.numero FROM reservas_material_almoxarifado rs
      LEFT JOIN requisicoes_almoxarifado r ON r.id = rs.requisicao_id
      WHERE rs.material_id = ? AND rs.status = 'ATIVA' AND rs.quantidade - COALESCE(rs.quantidade_utilizada, 0) > ${EPS}
      ORDER BY rs.id`, [mov.material_id]);
    const nomes = [];
    let manual = false;
    for (const l of linhas) {
      if (!l.requisicao_id) { manual = true; continue; }
      const n = l.numero || `#${l.requisicao_id}`;
      if (!nomes.includes(n)) nomes.push(n);
    }
    if (manual) nomes.push('reservas manuais');
    if (!nomes.length) return RECUSA_CONSUMIDO;
    return `Não é possível estornar: o material está reservado para requisições (${nomes.join(', ')}) — libere as reservas antes de estornar`;
  } catch (e) {
    return RECUSA_CONSUMIDO;
  }
}

// Etapa 76 (Fase 5): o recalculo do estorno roda SOB A TRAVA por material (`recalcularStatusSobTrava`), como o
// das portas da 76 e o da 74/75 - fora dela, uma nota do mesmo material que reserva no meio deixava a leitura
// velha ser gravada (sonda76f). Sem deadlock: o estorno nunca roda dentro de `comLockDoMaterial`.
async function recalcularStatusAposEstorno(db, requisicaoIds) {
  for (const id of requisicaoIds || []) {
    try {
      // eslint-disable-next-line global-require, no-await-in-loop
      await require('./reservaChegadaService').recalcularStatusSobTrava(db, id);
    } catch (e) {
      console.warn(`[almoxarifado] recalculo do status apos estorno falhou (requisicao ${id}): ${e.message}`);
    }
  }
}

/**
 * Cria um hold de saldo (reserva) para uma OS/projeto.
 *
 * `opcoes` NÃO vem do body — a rota POST /reservas repassa `req.body` inteiro como `data`, então
 * qualquer coisa lida de `data` é forjável pelo cliente. Por isso o vínculo com a requisição e a
 * dispensa do gate de permissão moram no 4º argumento, alcançável só por chamada interna:
 *  - `opcoes.sistema`: a reserva nasce do próprio fluxo (aprovação de requisição), não de uma
 *    ação de reservar do usuário. O gate que vale nesse caso é o da rota que disparou o fluxo
 *    (`aprovar_requisicao`) — exigir `reservar` aqui faria um GESTOR, que aprova mas não reserva,
 *    tomar 403 no meio da aprovação.
 *  - `opcoes.requisicao_id`/`item_requisicao_id`: vínculo que a entrega usa para achar e consumir
 *    a reserva daquele item (ver requisitionService.entregarRequisicao).
 *  - `opcoes.recebimento_id` (Etapa 74): a nota cuja chegada criou a reserva (reservaChegadaService) —
 *    o estorno da entrada desfaz só estas.
 */
async function criarReserva(db, user, data, opcoes = {}) {
  const { material_id, quantidade, projeto_id, os_id, os_referencia, cliente_id, equipamento, submontagem, observacoes,
    data_necessidade, expira_em } = data;
  const sistema = opcoes.sistema === true;
  if (!sistema && !can(user, 'reservar')) throw Object.assign(new Error('Sem permissão para reservar'), { status: 403 });

  const material = await getMaterial(db, material_id);
  const qtd = Q.qtd(quantidade); // Etapa 96 (B482): arredondada na porta; 0,0000004 vira 0 e cai na recusa abaixo
  if (!(qtd > 0)) throw Object.assign(new Error('Quantidade da reserva deve ser maior que zero'), { status: 400 });

  // Hold atômico: o próprio UPDATE valida o disponível sob o lock de linha do SQLite (mesmo
  // padrão do resto do motor). Uma leitura + INSERT deixaria duas reservas concorrentes
  // passarem e `quantidade_reservada` ficaria acima do físico — e reserva acima do físico é
  // reserva IMPOSSÍVEL de consumir, porque a baixa contra reserva também exige saldo físico.
  const hold = await dbGet(db, `UPDATE materiais_almoxarifado
    SET quantidade_reservada = ${Q.qtdSql('COALESCE(quantidade_reservada,0) + ?')}, updated_at = CURRENT_TIMESTAMP
    WHERE id = ? AND ${disponivelSql()} >= ? ${Q.FOLGA_SQL}
    RETURNING id`, [qtd, material_id, qtd]);
  if (!hold) {
    const atual = await getMaterial(db, material_id);
    throw Object.assign(new Error(`Saldo disponível insuficiente: ${await getSaldoDisponivel(atual, db)}`), { status: 400 });
  }

  // Vencimento da reserva. `expira_em` explícito manda; senão, é calculado a partir da config
  // `reserva_dias_validade`. Sem a config e sem valor explícito a reserva NÃO expira — o job de
  // expiração só age sobre quem tem `expira_em`. É opt-in de propósito: ligar um default aqui
  // faria as reservas manuais que já existem começarem a ser liberadas sozinhas.
  let expiraEm = expira_em || null;
  if (!expiraEm) {
    const dias = parseInt(await getConfig(db, 'reserva_dias_validade'), 10);
    if (Number.isFinite(dias) && dias > 0) {
      const d = new Date(Date.now() + dias * 24 * 60 * 60 * 1000);
      expiraEm = d.toISOString().slice(0, 10);
    }
  }

  let reservaId = null;
  try {
    const r = await dbRun(db, `INSERT INTO reservas_material_almoxarifado
      (material_id, quantidade, projeto_id, os_id, os_referencia, cliente_id, equipamento, submontagem,
       solicitante_id, solicitante_nome, observacoes, requisicao_id, item_requisicao_id, origem,
       data_necessidade, expira_em, recebimento_id)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`, [
      material_id, qtd, projeto_id || null, os_id || null, os_referencia || null,
      cliente_id || null, equipamento || null, submontagem || null,
      user.id, user.nome || user.email, observacoes || null,
      opcoes.requisicao_id || null, opcoes.item_requisicao_id || null,
      opcoes.requisicao_id ? 'REQUISICAO' : 'MANUAL',
      data_necessidade || opcoes.data_necessidade || null, expiraEm,
      // Etapa 74 (B372): a nota cuja chegada criou a reserva — só pelo 4º argumento, pelo mesmo motivo
      // de requisicao_id (a rota POST /reservas repassa o body inteiro como `data`).
      opcoes.recebimento_id || null,
    ]);
    reservaId = r.lastID;

    await registrarMovimentacao(db, user, {
      material_id, tipo: 'RESERVA', quantidade: qtd,
      motivo: opcoes.motivo || 'Reserva por OS/projeto', os_id, projeto_id, cliente_id,
      reserva_id: reservaId, referencia: os_referencia, requisicao_id: opcoes.requisicao_id,
    });
  } catch (e) {
    // Não há transação neste serviço (padrão do módulo: UPDATE condicional único), então o hold
    // acima é compensado à mão — senão o material ficaria com saldo reservado sem reserva viva.
    await dbRun(db, `UPDATE materiais_almoxarifado SET quantidade_reservada = ${Q.qtdSql('MAX(0, COALESCE(quantidade_reservada,0) - ?)')}, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
      [qtd, material_id]);
    if (reservaId) await dbRun(db, 'DELETE FROM reservas_material_almoxarifado WHERE id = ?', [reservaId]);
    throw e;
  }

  return { id: reservaId };
}

/**
 * Devolve ao disponível o que ainda está preso numa reserva ATIVA.
 *
 * `options.statusFinal` existe para a expiração: uma reserva que venceu sozinha vira EXPIRADA,
 * não LIBERADA — os dois fatos são diferentes no relatório, e é o único jeito de o job de
 * expiração reusar este caminho sem duplicar a devolução de saldo.
 *
 * `options.motivo` (+ liberado_por/liberado_em) é o rastro na PRÓPRIA reserva: antes só existia
 * a movimentação LIBERACAO_RESERVA, então olhando a reserva não se sabia quem a soltou.
 */
async function liberarReserva(db, user, reservaId, quantidade = null, options = {}) {
  const {
    statusFinal = 'LIBERADA',
    motivo = null,
    motivoMovimentacao = 'Liberação de reserva',
  } = options;

  const reserva = await dbGet(db, 'SELECT * FROM reservas_material_almoxarifado WHERE id = ?', [reservaId]);
  if (!reserva) throw Object.assign(new Error('Reserva não encontrada'), { status: 404 });
  if (reserva.status !== 'ATIVA') {
    throw Object.assign(new Error(`Reserva ${String(reserva.status).toLowerCase()} não pode ser liberada`), { status: 400 });
  }

  const restante = Q.qtd(reserva.quantidade - (reserva.quantidade_utilizada || 0));
  const qtd = quantidade == null ? restante : Q.qtd(quantidade);
  if (!(qtd > 0)) throw Object.assign(new Error('Quantidade a liberar deve ser maior que zero'), { status: 400 });
  // Etapa 67 (Fase 5): tolerancia EPS nas duas comparacoes. Reserva de 1 consumida em 0,7 tem
  // saldo 0,30000000000000004; liberar os 0,3 que a tela mostra virava liberacao PARCIAL e deixava
  // a reserva ATIVA com 4e-17 (a mesma reserva zumbi do consumo fracionado).
  if (qtd > restante + EPS) {
    throw Object.assign(new Error(`Quantidade acima do saldo da reserva: ${restante}`), { status: 400 });
  }
  const total = qtd >= restante - EPS;

  // Reivindica a reserva num UPDATE condicional (padrão do módulo: não há transação aqui).
  // Sem isso duas liberações concorrentes — ou duas rodadas do job de expiração — passariam
  // as duas e o quantidade_reservada do material seria descontado em dobro.
  // Liberação parcial reduz `quantidade` para o hold restante continuar coerente com o que o
  // material tem reservado; liberação total preserva a quantidade original como histórico.
  const claim = await dbGet(db, `UPDATE reservas_material_almoxarifado
    SET status = ?,
        quantidade = ${Q.qtdSql('quantidade - ?')},
        liberado_por = ?, liberado_em = CURRENT_TIMESTAMP, motivo_liberacao = ?,
        updated_at = CURRENT_TIMESTAMP
    WHERE id = ? AND status = 'ATIVA' AND (quantidade - COALESCE(quantidade_utilizada,0)) >= ? - ${EPS}
    RETURNING id`,
    [total ? statusFinal : 'ATIVA', total ? 0 : qtd, user?.id || null, motivo, reservaId, qtd]);
  if (!claim) {
    const atual = await dbGet(db, 'SELECT status FROM reservas_material_almoxarifado WHERE id = ?', [reservaId]);
    throw Object.assign(new Error(`Reserva ${String(atual?.status || 'inexistente').toLowerCase()} não pode ser liberada`), { status: 400 });
  }

  await dbRun(db, `UPDATE materiais_almoxarifado SET quantidade_reservada = ${RESERVADA_MENOS_SQL},
    updated_at = CURRENT_TIMESTAMP WHERE id = ?`, [qtd, qtd, qtd, reserva.material_id]);

  await registrarMovimentacao(db, user, {
    material_id: reserva.material_id, tipo: 'LIBERACAO_RESERVA', quantidade: qtd,
    reserva_id: reservaId, os_id: reserva.os_id, projeto_id: reserva.projeto_id,
    motivo: motivoMovimentacao,
  });

  return { success: true, reserva_id: Number(reservaId), quantidade_liberada: qtd, status: total ? statusFinal : 'ATIVA' };
}

async function consultarEstoque(db, filters = {}) {
  let sql = `SELECT m.*, c.nome as categoria_nome, cli.razao_social as proprietario_cliente_nome,
    ${disponivelSql('m')} as quantidade_disponivel,
    ${valorEstoqueSql('m')} as valor_estoque
    FROM materiais_almoxarifado m
    LEFT JOIN categorias_material_almoxarifado c ON m.categoria_id = c.id
    LEFT JOIN clientes cli ON m.proprietario_cliente_id = cli.id
    WHERE m.ativo = 1`;
  const params = [];
  // ── Etapa 8, Task 1 (classe A com opt-in) ────────────────────────────────────────────────
  // Default = estoque PROPRIO. Quem quiser material de cliente pede explicitamente:
  //   proprietario_cliente_id=N -> so daquele cliente (tela de Materiais de Clientes, Task 8)
  //   incluir_clientes=1        -> tudo junto (a tela que mistura mostra o selo, Task 9)
  //   material_id=N             -> leitura de UM material (classe B): nao filtra o dono, senao
  //                                consultar o extrato de material de cliente devolveria vazio.
  if (filters.proprietario_cliente_id) {
    sql += ' AND m.proprietario_cliente_id = ?';
    params.push(Number(filters.proprietario_cliente_id));
  } else if (!filters.material_id && String(filters.incluir_clientes) !== '1') {
    sql += ' AND m.proprietario_cliente_id IS NULL';
  }
  if (filters.categoria_id) { sql += ' AND m.categoria_id = ?'; params.push(filters.categoria_id); }
  if (filters.below_minimum) { sql += ' AND m.quantidade_atual <= m.quantidade_minima AND m.quantidade_minima > 0'; }
  if (filters.material_id) { sql += ' AND m.id = ?'; params.push(filters.material_id); }
  sql += ' ORDER BY m.nome';
  return dbAll(db, sql, params);
}

async function consultarSaldosPorLocalizacao(db, materialId) {
  // almoxarifado_codigo/nome vêm do almoxarifado da PRÓPRIA localização do saldo
  // (s.localizacao_id), não da localização padrão do material — cada linha de saldo
  // pode estar num almoxarifado diferente. Saldo sem localização => null nos dois.
  //
  // `lote` (achado de review, fix round 1 da Task 2): o cliente (ExtratoMaterialModal.js) lê
  // `s.lote` como texto — sobrevivência da era pré-Etapa-6, quando a coluna era TEXT. `s.*`
  // agora só traz `lote_id`, então sem este JOIN o campo simplesmente sumia da resposta (virou
  // undefined, sem erro de SQL) e a coluna "Lote" do extrato ficaria em "—" para sempre assim
  // que a Task 3 passasse a gravar o vínculo — silenciosamente morta. Devolvendo `lote` (o
  // código, via lotes_almoxarifado) ao lado de `lote_id`, o cliente volta a funcionar sozinho.
  return dbAll(db, `SELECT s.*, l.codigo as localizacao_codigo, l.descricao as localizacao_descricao, l.tipo as localizacao_tipo,
           a.codigo as almoxarifado_codigo, a.nome as almoxarifado_nome,
           lt.codigo as lote
    FROM estoque_saldo_almoxarifado s
    LEFT JOIN localizacoes_almoxarifado l ON s.localizacao_id = l.id
    LEFT JOIN almoxarifados a ON l.almoxarifado_id = a.id
    LEFT JOIN lotes_almoxarifado lt ON s.lote_id = lt.id
    WHERE s.material_id = ?`, [materialId]);
}

module.exports = {
  motivoRecusaEndereco,
  areaEspecialDe,
  avisoAreaEspecial,
  resolverAreaEfetiva,
  carregarArvoreLocalizacoes,
  areaEfetivaDaLocalizacao,
  sugerirLocalizacaoEntrada,
  listarLocalizacoesVazias,
  contarOcupacaoLocalizacao,
  getConfig,
  getMaterial,
  getSaldoDisponivel,
  motivoRecusaAjustePorRetencao,
  syncMaterialTotals,
  syncSaldoLocalizacaoPadrao,
  getOrCreateSaldo,
  resolveLocalizacaoEntrada,
  resolveLocalizacaoSaida,
  validarLocalizacaoParaMovimento,
  validarEnderecoExplicito,
  normalizarCodigoLido,
  conferirLeitura,
  materiaisComPadrao,
  registrarMovimentacao,
  cancelarMovimentacao,
  criarReserva,
  liberarReserva,
  consultarEstoque,
  consultarSaldosPorLocalizacao,
  consultarMapaLocalizacoes,
};
