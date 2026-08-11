const { dbRun, dbGet, dbAll } = require('./db');
const { registrarAuditoria } = require('./audit');
const { can } = require('./permissions');
const alertService = require('./alertService');
const { avaliarRegrasVinculo } = require('./movementRules');
const { TIPOS_MOVIMENTO } = require('./schema');
// seriesService nao importa stockService de volta — sem ciclo.
const seriesService = require('./seriesService');

async function getConfig(db, chave) {
  const row = await dbGet(db, 'SELECT valor FROM configuracoes_almoxarifado WHERE chave = ?', [chave]);
  return row?.valor;
}

async function getMaterial(db, materialId) {
  const m = await dbGet(db, 'SELECT * FROM materiais_almoxarifado WHERE id = ?', [materialId]);
  if (!m) throw Object.assign(new Error('Material não encontrado'), { status: 404 });
  return m;
}

async function getSaldoDisponivel(material) {
  const reservado = material.quantidade_reservada || 0;
  const bloqueado = material.quantidade_bloqueada || 0;
  const inspecao = material.quantidade_em_inspecao || 0;
  return material.quantidade_atual - reservado - bloqueado - inspecao;
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
  const saldos = await dbGet(db, `
    SELECT COALESCE(SUM(quantidade),0) as total
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
    SET quantidade = quantidade + ?, updated_at = CURRENT_TIMESTAMP
    WHERE material_id = ? AND localizacao_id IS ? AND lote_id IS ?`;
  if (minimo != null) { sql += ' AND quantidade >= ?'; params.push(minimo); }
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
const EPS = 1e-9; // tolerância de ponto flutuante: quantidade é REAL no SQLite

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
      SET quantidade = quantidade - ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = ? AND quantidade >= ?
      RETURNING id`, [take, linha.id, take]);
    // Não casou = outra saída concorrente levou o saldo desta linha entre o SELECT e o UPDATE.
    // Não é erro por si: segue para a próxima linha do lote e só falha se o total não fechar.
    if (!claim) continue;
    aplicados.push({ id: linha.id, quantidade: take });
    restante -= take;
  }

  if (restante > EPS) {
    for (const a of aplicados) {
      await dbRun(db, `UPDATE estoque_saldo_almoxarifado
        SET quantidade = quantidade + ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
        [a.quantidade, a.id]);
    }
    const total = await dbGet(db, `SELECT COALESCE(SUM(quantidade),0) as total
      FROM estoque_saldo_almoxarifado WHERE material_id = ? AND lote_id IS ?`, [materialId, loteId]);
    return { ok: false, disponivel: total.total };
  }
  return { ok: true, linhas: aplicados };
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
async function syncSaldoLocalizacaoPadrao(db, materialId, loteId = null) {
  const material = await getMaterial(db, materialId);
  const locKey = material.localizacao_padrao_id || null;
  const materialQty = material.quantidade_atual || 0;

  const saldo = await getOrCreateSaldo(db, materialId, locKey, loteId);
  const outras = await dbGet(db,
    'SELECT COALESCE(SUM(quantidade),0) as total FROM estoque_saldo_almoxarifado WHERE material_id = ? AND id != ?',
    [materialId, saldo.id]);
  const novaLinha = materialQty - (outras.total || 0);
  await dbRun(db,
    'UPDATE estoque_saldo_almoxarifado SET quantidade = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
    [novaLinha, saldo.id]);
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
async function validarLocalizacaoParaMovimento(db, localizacaoId, material, papel) {
  if (!localizacaoId) return;
  const loc = await dbGet(db, 'SELECT * FROM localizacoes_almoxarifado WHERE id = ?', [localizacaoId]);
  if (!loc) return; // localização inexistente: não é responsabilidade deste helper (FK/lookup trata em outro lugar)

  if (loc.bloqueada) {
    throw Object.assign(new Error(`Localização ${loc.codigo} está bloqueada`), { status: 400 });
  }

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
      throw Object.assign(new Error(
        `Localização ${loc.codigo} não aceita o tipo de material '${material.tipo_material || ''}'`), { status: 400 });
    }
  }
}

// `quantidade_reservada` SAIU deste mapa no review final da Etapa 6. A Task 2 removeu a coluna de
// `estoque_saldo_almoxarifado` (nunca teve escritor) e este SQL passou a devolver `0 as reservado`
// fixo — um numero que so podia ser zero, alimentando um mostrador "Reservado" na tela do mapa
// (`MapaLocalizacoesAlmoxarifado.js`) que mentia por construcao. Retencao NAO existe por
// localizacao: mora em `materiais_almoxarifado` (por material) ou no lote inteiro (por status).
// Devolver o campo zerado era pior do que nao devolver — sugeria uma dimensao que o sistema nao
// modela. Este mapa e so por localizacao fisica.
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
      SELECT m.localizacao_padrao_id, m.id, m.quantidade_atual
      FROM materiais_almoxarifado m
      WHERE m.ativo = 1 AND m.localizacao_padrao_id IS NOT NULL AND m.quantidade_atual > 0
        AND NOT EXISTS (
          SELECT 1 FROM estoque_saldo_almoxarifado s
          WHERE s.material_id = m.id AND s.localizacao_id IS NOT NULL AND s.quantidade > 0
        )
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
    ) mat_loc
    GROUP BY loc_id
  ) m ON m.loc_id = l.id
  WHERE l.ativo = 1
  ORDER BY l.setor, l.parent_id, l.subgrupo, l.codigo`;

async function consultarMapaLocalizacoes(db) {
  return dbAll(db, MAPA_LOCALIZACOES_SQL);
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
  const {
    material_id, tipo, quantidade, motivo, referencia, observacoes,
    localizacao_origem_id, localizacao_destino_id, lote, lote_id, projeto_id, os_id, cliente_id,
    documento_vinculado, justificativa, reserva_id, recebimento_id, requisicao_id, centro_custo_id,
    emergencial, custo_unitario: custoInformado, quantidade_reprovada,
  } = params;

  if (!user?.id) throw Object.assign(new Error('Usuário responsável obrigatório'), { status: 400 });
  // quantidade 0 só é aceita para AJUSTE com localização (zera aquela localização e recalcula
  // o total do material — espelha o superRefine de MovimentacaoSchema). Fora desse caso,
  // 0 e negativos continuam rejeitados; a checagem não pode usar `!quantidade` porque isso
  // também rejeitaria o 0 legítimo.
  const ajusteZeraLocalizacao = tipo === 'AJUSTE' && !!localizacao_destino_id;
  const quantidadeInvalida = quantidade === undefined || quantidade === null || Number.isNaN(quantidade)
    || quantidade < 0 || (quantidade === 0 && !ajusteZeraLocalizacao);
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

  const tiposEntrada = ['ENTRADA', 'ENTRADA_COMPRA', 'ENTRADA_MANUAL', 'ENTRADA_DEVOLUCAO', 'DEVOLUCAO', 'AJUSTE_POSITIVO'];
  const tiposSaida = ['SAIDA', 'SAIDA_PRODUCAO', 'SAIDA_MONTAGEM', 'SAIDA_ASSISTENCIA', 'AJUSTE_NEGATIVO', 'SUCATA', 'PERDA'];
  const tiposAjuste = ['AJUSTE'];
  // Consumo de reserva: só quando a saída cita `reserva_id`. RESERVA/LIBERACAO_RESERVA também
  // carregam reserva_id, mas não consomem nada — são o lançamento da própria reserva.
  const consumindoReserva = !!reserva_id && tiposSaida.includes(tipo);

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
  if (opcoes.exigeLote && material.controle_lote && !loteIdFinal
      && (tiposEntrada.includes(tipo) || tiposSaida.includes(tipo))) {
    throw Object.assign(
      new Error(`O material ${material.codigo} exige lote nesta movimentacao (controle por lote ligado)`),
      { status: 400 });
  }

  // ── Serie (Etapa 6b) ─────────────────────────────────────────────────────────
  // Mesmo alcance e mesma decisao de desenho do exigeLote acima: exigeSerie so e
  // declarado pelo CHAMADOR, nunca deduzido pelo motor. A movimentacao manual (v1/v2) e o
  // recebimento (Task 6) declaram — os dois caminhos onde o operador tem como informar
  // series na tela; entrega/exclusao de requisicao e devolucao/sucata de devolucao continuam
  // isentas ate as telas deles terem campo de serie (pendencia declarada nas specs 04/12).
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

  const regras = avaliarRegrasVinculo(tipo, { os_id, projeto_id, centro_custo_id, justificativa, referencia, emergencial });
  if (!regras.ok) throw Object.assign(new Error(regras.erro), { status: 400 });
  const regularizacaoPendente = regras.pendente ? 1 : 0;

  // Restrições de endereço (Etapa 2, Task 2): validadas ANTES de qualquer efeito de saldo —
  // inclusive antes das UPDATEs da própria TRANSFERENCIA logo abaixo, que grava direto em
  // estoque_saldo_almoxarifado. Usa a MESMA resolução de localização (fallback para
  // localizacao_padrao_id) que será usada mais adiante para aplicar o efeito de saldo.
  if (tiposEntrada.includes(tipo)) {
    await validarLocalizacaoParaMovimento(db, resolveLocalizacaoEntrada(material, localizacao_destino_id), material, 'destino');
  } else if (tiposSaida.includes(tipo)) {
    await validarLocalizacaoParaMovimento(db, resolveLocalizacaoSaida(material, localizacao_origem_id), material, 'origem');
  } else if (tipo === 'TRANSFERENCIA') {
    await validarLocalizacaoParaMovimento(db, localizacao_origem_id, material, 'origem');
    await validarLocalizacaoParaMovimento(db, localizacao_destino_id, material, 'destino');
  } else if (tiposAjuste.includes(tipo) && localizacao_destino_id) {
    await validarLocalizacaoParaMovimento(db, localizacao_destino_id, material, 'destino');
  }

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
      const tiposDescarte = ['SUCATA', 'PERDA', 'AJUSTE_NEGATIVO'];
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
    if (!consumindoReserva) {
      const disponivel = await getSaldoDisponivel(material);
      if (disponivel < quantidade && !permiteNegativo) {
        throw Object.assign(new Error(`Saldo insuficiente. Disponível: ${disponivel} ${material.unidade}`), { status: 400 });
      }
    }
    if ((material.quantidade_bloqueada || 0) > 0 && tiposSaida.includes(tipo)) {
      const dispSemBloqueio = material.quantidade_atual - (material.quantidade_bloqueada || 0);
      if (quantidade > dispSemBloqueio && !permiteNegativo) {
        throw Object.assign(new Error('Material bloqueado não pode ser utilizado'), { status: 400 });
      }
    }
    saldoPosterior = saldoAnterior - parseFloat(quantidade);
  } else if (tiposAjuste.includes(tipo)) {
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
      SET quantidade = quantidade - ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = ? AND quantidade >= ?
      RETURNING id`, [quantidade, saldoOrigem.id, quantidade]);
    if (!claimOrigem) {
      throw Object.assign(new Error('Saldo insuficiente na localização de origem'), { status: 400 });
    }
    const saldoDestino = await getOrCreateSaldo(db, material_id, localizacao_destino_id, loteIdFinal);
    await dbRun(db, 'UPDATE estoque_saldo_almoxarifado SET quantidade = quantidade + ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
      [quantidade, saldoDestino.id]);
    saldoPosterior = saldoAnterior;
  } else if (tipo === 'BLOQUEIO') {
    await dbRun(db, 'UPDATE materiais_almoxarifado SET quantidade_bloqueada = COALESCE(quantidade_bloqueada,0) + ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
      [quantidade, material_id]);
    saldoPosterior = saldoAnterior;
  } else if (tipo === 'DESBLOQUEIO') {
    // Guarda no WHERE em vez de MAX(0,...): saturar em silencio devolve ao disponivel menos do
    // que o pedido sem ninguem saber, e foi exatamente o bug corrigido em liberarReserva.
    const claim = await dbGet(db, `UPDATE materiais_almoxarifado
      SET quantidade_bloqueada = COALESCE(quantidade_bloqueada,0) - ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = ? AND COALESCE(quantidade_bloqueada,0) >= ?
      RETURNING id`, [quantidade, material_id, quantidade]);
    if (!claim) {
      throw Object.assign(
        new Error(`Quantidade bloqueada insuficiente: ${material.quantidade_bloqueada || 0}`),
        { status: 400 });
    }
    saldoPosterior = saldoAnterior;
  } else if (tipo === 'QUARENTENA') {
    await dbRun(db, `UPDATE materiais_almoxarifado
      SET quantidade_em_inspecao = COALESCE(quantidade_em_inspecao,0) + ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?`, [quantidade, material_id]);
    saldoPosterior = saldoAnterior;
  } else if (tipo === 'LIBERACAO_INSPECAO' || tipo === 'REPROVACAO_INSPECAO') {
    // Guarda no proprio WHERE, como o resto do motor: liberar/reprovar mais do que esta retido
    // criaria saldo do nada (na liberacao) ou bloqueio sem lastro (na reprovacao). MAX(0,...)
    // saturaria em silencio e esconderia o erro — e o "aprovar duas vezes nao duplica" que a
    // spec 09 cobra sai justamente deste UPDATE nao casar na segunda vez.
    const bloqueiaTambem = tipo === 'REPROVACAO_INSPECAO' ? quantidade : 0;
    const claim = await dbGet(db, `UPDATE materiais_almoxarifado
      SET quantidade_em_inspecao = COALESCE(quantidade_em_inspecao,0) - ?,
          quantidade_bloqueada   = COALESCE(quantidade_bloqueada,0) + ?,
          updated_at = CURRENT_TIMESTAMP
      WHERE id = ? AND COALESCE(quantidade_em_inspecao,0) >= ?
      RETURNING id`, [quantidade, bloqueiaTambem, material_id, quantidade]);
    if (!claim) {
      throw Object.assign(
        new Error(`Quantidade em inspeção insuficiente: ${material.quantidade_em_inspecao || 0}`),
        { status: 400 });
    }
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
      SET quantidade_em_inspecao = COALESCE(quantidade_em_inspecao,0) - ?,
          quantidade_bloqueada   = COALESCE(quantidade_bloqueada,0) + ?,
          updated_at = CURRENT_TIMESTAMP
      WHERE id = ? AND COALESCE(quantidade_em_inspecao,0) >= ?
      RETURNING id`, [quantidade, reprovadaQtd, material_id, quantidade]);
    if (!claim) {
      throw Object.assign(
        new Error(`Quantidade em inspeção insuficiente: ${material.quantidade_em_inspecao || 0}`),
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
        SET quantidade_atual = quantidade_atual + ?,
            quantidade_reservada = COALESCE(quantidade_reservada,0) + ?,
            updated_at = CURRENT_TIMESTAMP
        WHERE id = ?`, [quantidade, quantidade, material_id]);
      await dbRun(db, 'UPDATE reservas_material_almoxarifado SET quantidade_utilizada = MAX(0, quantidade_utilizada - ?), updated_at = CURRENT_TIMESTAMP WHERE id = ?',
        [quantidade, reserva_id]);
      // A reserva só vira CONSUMIDA dentro desta mesma chamada, quando zera — reverter para
      // ATIVA aqui é seguro porque o claim atômico do topo já exigiu status = 'ATIVA' para a
      // execução sequer chegar até este ponto.
      await dbRun(db, "UPDATE reservas_material_almoxarifado SET status = 'ATIVA', updated_at = CURRENT_TIMESTAMP WHERE id = ? AND status = 'CONSUMIDA'", [reserva_id]);
    } else {
      await dbRun(db, `UPDATE materiais_almoxarifado
        SET quantidade_atual = quantidade_atual + ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
        [quantidade, material_id]);
    }
    saidaFisicoAplicado = false;
  };

  // Envolve aplicação física + linha de saldo + INSERT do ledger: se a série já foi criada
  // (entradaSeries rodou) e QUALQUER passo posterior falhar (custo médio, getOrCreateSaldo,
  // o próprio INSERT), a série tem de ser desfeita — senão fica uma série EM_ESTOQUE sem
  // contrapartida no físico, furando o invariante COUNT(série) == quantidade_atual.
  try {
  if (!['TRANSFERENCIA', 'BLOQUEIO', 'DESBLOQUEIO', 'RESERVA', 'LIBERACAO_RESERVA',
        'QUARENTENA', 'LIBERACAO_INSPECAO', 'REPROVACAO_INSPECAO', 'DECISAO_INSPECAO'].includes(tipo)) {
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
          SET quantidade_utilizada = quantidade_utilizada + ?, updated_at = CURRENT_TIMESTAMP
          WHERE id = ? AND material_id = ? AND status = 'ATIVA'
            AND (quantidade - COALESCE(quantidade_utilizada,0)) >= ?
          RETURNING quantidade, quantidade_utilizada`,
          [quantidade, reserva_id, material_id, quantidade]);
        if (!reserva) {
          const atual = await dbGet(db, 'SELECT quantidade, quantidade_utilizada, status FROM reservas_material_almoxarifado WHERE id = ? AND material_id = ?', [reserva_id, material_id]);
          if (!atual) throw Object.assign(new Error('Reserva não encontrada para este material'), { status: 400 });
          if (atual.status !== 'ATIVA') throw Object.assign(new Error(`Reserva ${atual.status.toLowerCase()} não pode ser consumida`), { status: 400 });
          const saldoReserva = atual.quantidade - (atual.quantidade_utilizada || 0);
          throw Object.assign(new Error(`Quantidade acima do saldo da reserva: ${saldoReserva} ${material.unidade}`), { status: 400 });
        }

        // Agora o material: baixa o físico E o reservado juntos, porque a quantidade sai do
        // estoque e deixa de estar reservada na mesma operação. A guarda exige apenas que o
        // disponível não fique negativo IGNORANDO a parte reservada que está sendo consumida —
        // por isso `+ ?` (a quantidade) no cálculo.
        const rowRes = await dbGet(db, `UPDATE materiais_almoxarifado
          SET quantidade_atual = quantidade_atual - ?,
              quantidade_reservada = MAX(0, COALESCE(quantidade_reservada,0) - ?),
              updated_at = CURRENT_TIMESTAMP
          WHERE id = ? AND (? = 1 OR (quantidade_atual - COALESCE(quantidade_reservada,0) + ? - COALESCE(quantidade_bloqueada,0) - COALESCE(quantidade_em_inspecao,0)) >= ?)
          RETURNING quantidade_atual`,
          [quantidade, quantidade, material_id, permiteNegativo ? 1 : 0, quantidade, quantidade]);
        if (!rowRes) {
          // Não há transação neste serviço (padrão do módulo: UPDATE condicional único).
          // Compensa a reivindicação acima à mão para não deixar a reserva consumida sem a
          // baixa correspondente de estoque.
          await dbRun(db, 'UPDATE reservas_material_almoxarifado SET quantidade_utilizada = MAX(0, quantidade_utilizada - ?) WHERE id = ?', [quantidade, reserva_id]);
          throw Object.assign(new Error(`Saldo físico insuficiente para consumir a reserva. Disponível: ${await getSaldoDisponivel(material)} ${material.unidade}`), { status: 400 });
        }
        saldoPosterior = rowRes.quantidade_atual;
        saidaFisicoAplicado = true;

        // Reserva zerada não deve seguir ATIVA segurando saldo (reserva zumbi).
        if (reserva.quantidade - reserva.quantidade_utilizada <= 0) {
          await dbRun(db, "UPDATE reservas_material_almoxarifado SET status = 'CONSUMIDA', updated_at = CURRENT_TIMESTAMP WHERE id = ?", [reserva_id]);
        }
      } else {
      const row = await dbGet(db, `UPDATE materiais_almoxarifado
        SET quantidade_atual = quantidade_atual - ?, updated_at = CURRENT_TIMESTAMP
        WHERE id = ? AND (? = 1 OR (quantidade_atual - COALESCE(quantidade_reservada,0) - COALESCE(quantidade_bloqueada,0) - COALESCE(quantidade_em_inspecao,0)) >= ?)
        RETURNING quantidade_atual`,
        [quantidade, material_id, permiteNegativo ? 1 : 0, quantidade]);
      if (!row) {
        throw Object.assign(new Error(`Saldo insuficiente. Disponível: ${await getSaldoDisponivel(material)} ${material.unidade}`), { status: 400 });
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
            quantidade_atual = quantidade_atual + ?,
            custo_medio = CASE WHEN quantidade_atual > 0
              THEN ROUND(((quantidade_atual * (CASE WHEN COALESCE(custo_medio,0) > 0 THEN custo_medio ELSE COALESCE(custo_unitario,0) END)) + (? * ?)) / (quantidade_atual + ?), 4)
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
          SET quantidade_atual = quantidade_atual + ?, updated_at = CURRENT_TIMESTAMP
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
      const saldo = await getOrCreateSaldo(db, material_id, localizacao_destino_id, loteIdFinal);
      await dbRun(db, 'UPDATE estoque_saldo_almoxarifado SET quantidade = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
        [parseFloat(quantidade), saldo.id]);
      await syncMaterialTotals(db, material_id);
      const atual = await dbGet(db, 'SELECT quantidade_atual FROM materiais_almoxarifado WHERE id = ?', [material_id]);
      saldoPosterior = atual.quantidade_atual;
    } else if (tiposAjuste.includes(tipo)) { // AJUSTE sem localização — define valor absoluto (last-writer-wins é aceitável para ajuste)
      await dbRun(db, 'UPDATE materiais_almoxarifado SET quantidade_atual = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
        [saldoPosterior, material_id]);
    } else {
      // Tipo neutro ao saldo (ex.: RETRABALHO) — achado do review final: este ramo antes caía
      // no "else" de AJUSTE acima e disparava um UPDATE...SET quantidade_atual = <valor lido no
      // início da função>, um last-writer-wins stale que podia sobrescrever saldo alterado por
      // outra transação concorrente. Tipos aqui não devem tocar quantidade_atual — saldoPosterior
      // permanece = saldoAnterior (setado no topo da função); o movimento ainda é registrado.
    }

    // saldo_anterior derivado do valor real pós-update (não da leitura pré-corrida):
    // entrada: anterior = posterior - qtd; saída: anterior = posterior + qtd; ajuste: mantém a leitura inicial.
    if (tiposEntrada.includes(tipo)) saldoAnteriorReal = saldoPosterior - parseFloat(quantidade);
    else if (tiposSaida.includes(tipo)) saldoAnteriorReal = saldoPosterior + parseFloat(quantidade);
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
      await dbRun(db, 'UPDATE estoque_saldo_almoxarifado SET quantidade = quantidade + ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
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
      } else {
        // Sem lote (ou material que permite saldo negativo): a linha continua sendo criada, porque
        // aqui ela PODE ficar negativa e precisa existir para `syncMaterialTotals` somar.
        const saldo = await getOrCreateSaldo(db, material_id, locSaida, loteIdFinal);
        await dbRun(db, 'UPDATE estoque_saldo_almoxarifado SET quantidade = quantidade - ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
          [quantidade, saldo.id]);
        saldoLinhasSaidaParaReverter = [{ id: saldo.id, quantidade }];
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
              SET quantidade = quantidade + ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
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
      await syncSaldoLocalizacaoPadrao(db, material_id, loteIdFinal);
    }
  }

  result = await dbRun(db, `INSERT INTO movimentacoes_almoxarifado
    (material_id, tipo, quantidade, saldo_anterior, saldo_posterior, motivo, referencia, observacoes,
     usuario_id, usuario_nome, localizacao_origem_id, localizacao_destino_id, lote, lote_id, unidade,
     projeto_id, os_id, cliente_id, documento_vinculado, justificativa, reserva_id, recebimento_id, requisicao_id,
     centro_custo_id, emergencial, regularizacao_pendente)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`, [
    material_id, tipo, quantidade, saldoAnteriorReal, saldoPosterior,
    motivo || null, referencia || null, observacoes || null,
    user.id, user.nome || user.email,
    localizacao_origem_id || null, localizacao_destino_id || null, loteCodigoFinal, loteIdFinal, material.unidade,
    projeto_id || null, os_id || null, cliente_id || null,
    documento_vinculado || null, justificativa || null,
    reserva_id || null, recebimento_id || null, requisicao_id || null,
    centro_custo_id || null, emergencial ? 1 : 0, regularizacaoPendente,
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
    if (seriesClaim.length > 0) {
      await seriesService.desfazerSaida(db, seriesClaim);
    }
    for (const l of saldoLinhasSaidaParaReverter) {
      await dbRun(db, `UPDATE estoque_saldo_almoxarifado
        SET quantidade = quantidade + ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
        [l.quantidade, l.id]);
    }
    await reverterFisicoDaSaida();

    // ENTRADA — ordem de aplicação foi (1) série criada/reativada, (2) crédito de quantidade_atual
    // [+ custo médio], (3) linha de saldo; reverte (3), (2), depois (1).
    if (entradaCreditoAplicado) {
      if (entradaCreditoAplicado.saldoLinhaId) {
        await dbRun(db, 'UPDATE estoque_saldo_almoxarifado SET quantidade = quantidade - ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
          [entradaCreditoAplicado.quantidade, entradaCreditoAplicado.saldoLinhaId]);
      }
      if (entradaCreditoAplicado.custoAplicado) {
        // Restaura os valores EXATOS de antes (não só subtrai a quantidade) — o UPDATE de crédito
        // recalculou custo_medio/custo_unitario juntos com quantidade_atual num único statement.
        await dbRun(db, `UPDATE materiais_almoxarifado
          SET quantidade_atual = quantidade_atual - ?, custo_medio = ?, custo_unitario = ?, updated_at = CURRENT_TIMESTAMP
          WHERE id = ?`,
          [entradaCreditoAplicado.quantidade, entradaCreditoAplicado.custoMedioAnterior, entradaCreditoAplicado.custoUnitarioAnterior, material_id]);
      } else {
        await dbRun(db, 'UPDATE materiais_almoxarifado SET quantidade_atual = quantidade_atual - ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
          [entradaCreditoAplicado.quantidade, material_id]);
      }
    }
    // Para todo tipo que não seja entrada com série obrigatória, seriesAfetadas é [] e este
    // bloco é um no-op.
    if (seriesAfetadas.length > 0) {
      await seriesService.desfazerEntrada(db, seriesAfetadas);
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

  await registrarAuditoria(db, {
    entidade: 'movimentacao', entidade_id: result.lastID, acao: tipo,
    usuario_id: user.id, usuario_nome: user.nome || user.email,
    dados_novos: { material_id, tipo, quantidade, saldo_posterior: saldoPosterior },
    justificativa,
  });

  try {
    await alertService.verificarAlertaPorMaterialId(db, material_id);
  } catch (alertErr) {
    console.warn('[almoxarifado-alertas] Falha ao verificar alerta pós-movimentação:', alertErr.message);
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
  if (mov.requisicao_id) {
    throw Object.assign(new Error('Movimentação vinculada a requisição — use os fluxos da requisição (exclusão/encerramento)'), { status: 400 });
  }

  const tiposEntrada = ['ENTRADA', 'ENTRADA_COMPRA', 'ENTRADA_MANUAL', 'ENTRADA_DEVOLUCAO', 'DEVOLUCAO', 'AJUSTE_POSITIVO'];
  const tiposSaida = ['SAIDA', 'SAIDA_PRODUCAO', 'SAIDA_MONTAGEM', 'SAIDA_ASSISTENCIA', 'AJUSTE_NEGATIVO', 'SUCATA', 'PERDA'];
  const material = await getMaterial(db, mov.material_id);

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

  // Claim atômico ANTES de aplicar qualquer efeito inverso (achado do review final: double-cancel
  // race). O UPDATE...WHERE cancelado = 0 é a própria seção crítica sob o lock de linha do SQLite:
  // de duas chamadas concorrentes para o mesmo movimentoId, só uma tem changes = 1 — essa é a
  // única que segue para reverter saldo; a outra falha aqui, antes de tocar em qualquer saldo.
  // Também zera regularizacao_pendente aqui (achado do review: estorno deixava a pendência viva).
  const claim = await dbRun(db, `UPDATE movimentacoes_almoxarifado
    SET cancelado = 1, cancelado_por = ?, cancelado_em = CURRENT_TIMESTAMP, cancelamento_motivo = ?, regularizacao_pendente = 0
    WHERE id = ? AND cancelado = 0`, [user.id, motivo, movimentoId]);
  if (!claim.changes) throw Object.assign(new Error('Movimentação já cancelada'), { status: 400 });

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
        SET quantidade_atual = quantidade_atual - ?, updated_at = CURRENT_TIMESTAMP
        WHERE id = ? AND (? = 1 OR (quantidade_atual - COALESCE(quantidade_reservada,0) - COALESCE(quantidade_bloqueada,0) - COALESCE(quantidade_em_inspecao,0)) >= ?)
        RETURNING quantidade_atual`,
        [mov.quantidade, mov.material_id, permiteNegativo ? 1 : 0, mov.quantidade]);
      if (!row) throw Object.assign(new Error('Não é possível estornar: saldo disponível insuficiente (material já consumido)'), { status: 400 });
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
      const pisoLinha = (mov.lote_id && !permiteNegativo) ? mov.quantidade : null;
      const r = await ajustarSaldoExistente(db, mov.material_id, loc, mov.lote_id, -mov.quantidade,
        { minimo: pisoLinha });
      if (!r.aplicado && r.existe) {
        // A linha existe e não comporta a reversão. `quantidade_atual` já foi debitado logo acima
        // e não há transação aqui — o `catch` deste método devolve o físico agora (fix round 1,
        // Task 5: `compensarQuantidadeMaterial`, setado acima, cobre exatamente este caso; a
        // compensação manual que existia aqui foi removida para não devolver em dobro).
        throw Object.assign(new Error(
          `Não é possível estornar: o lote ${mov.lote || mov.lote_id} tem ${r.quantidade} `
          + `${mov.unidade || ''} nesta localização, menos que os ${mov.quantidade} que a entrada creditou`),
          { status: 400 });
      }
      if (r.aplicado) {
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
      await dbRun(db, 'UPDATE materiais_almoxarifado SET quantidade_atual = quantidade_atual + ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
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
        const delta = mov.saldo_posterior - mov.saldo_anterior;
        const saldoLoc = await getOrCreateSaldo(db, mov.material_id, mov.localizacao_destino_id, mov.lote_id);
        if (saldoLoc.quantidade - delta < 0) {
          throw Object.assign(new Error('Não é possível estornar: a localização não comporta a reversão (saldo já consumido)'), { status: 400 });
        }
        await dbRun(db, 'UPDATE estoque_saldo_almoxarifado SET quantidade = quantidade - ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
          [delta, saldoLoc.id]);
        await syncMaterialTotals(db, mov.material_id);
        const atual = await dbGet(db, 'SELECT quantidade_atual FROM materiais_almoxarifado WHERE id = ?', [mov.material_id]);
        saldoDepois = atual.quantidade_atual;
      } else {
        // AJUSTE sem localização — comportamento original: SET absoluto do total do material.
        await dbRun(db, 'UPDATE materiais_almoxarifado SET quantidade_atual = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
          [mov.saldo_anterior, mov.material_id]);
        saldoDepois = mov.saldo_anterior;
        await syncSaldoLocalizacaoPadrao(db, mov.material_id, mov.lote_id);
      }
    } else if (mov.tipo === 'TRANSFERENCIA') {
      // mov.lote_id (Etapa 6, Task 3): estorna a MESMA linha de lote que a transferência moveu.
      const origem = await getOrCreateSaldo(db, mov.material_id, mov.localizacao_origem_id, mov.lote_id);
      const destino = await getOrCreateSaldo(db, mov.material_id, mov.localizacao_destino_id, mov.lote_id);
      if (destino.quantidade < mov.quantidade) {
        throw Object.assign(new Error('Não é possível estornar: o destino não tem mais o saldo transferido'), { status: 400 });
      }
      await dbRun(db, 'UPDATE estoque_saldo_almoxarifado SET quantidade = quantidade - ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?', [mov.quantidade, destino.id]);
      await dbRun(db, 'UPDATE estoque_saldo_almoxarifado SET quantidade = quantidade + ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?', [mov.quantidade, origem.id]);
    } else if (mov.tipo === 'BLOQUEIO') {
      // Guarda condicional em vez de MAX(0,...) — mesma correção do ramo DESBLOQUEIO de
      // registrarMovimentacao (achado do review final). Com a saturação, estornar um BLOQUEIO
      // que o DESBLOQUEIO já tinha desfeito "passava" (0 - 10 saturava em 0) e o estorno
      // seguinte do DESBLOQUEIO somava 10 de volta: quantidade_bloqueada = 10 sem NENHUM
      // bloqueio vivo por trás, a dois cliques na tela do livro. Recusando aqui, o BLOQUEIO
      // continua vivo — e o catch abaixo desfaz o claim, então ele não fica preso como cancelado.
      const claim = await dbGet(db, `UPDATE materiais_almoxarifado
        SET quantidade_bloqueada = COALESCE(quantidade_bloqueada,0) - ?, updated_at = CURRENT_TIMESTAMP
        WHERE id = ? AND COALESCE(quantidade_bloqueada,0) >= ?
        RETURNING id`, [mov.quantidade, mov.material_id, mov.quantidade]);
      if (!claim) {
        throw Object.assign(new Error(
          `Não é possível estornar: o bloqueio já foi desfeito (quantidade bloqueada: ${material.quantidade_bloqueada || 0})`),
          { status: 400 });
      }
    } else if (mov.tipo === 'DESBLOQUEIO') {
      await dbRun(db, 'UPDATE materiais_almoxarifado SET quantidade_bloqueada = COALESCE(quantidade_bloqueada,0) + ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?', [mov.quantidade, mov.material_id]);
    }

    const r = await dbRun(db, `INSERT INTO movimentacoes_almoxarifado
      (material_id, tipo, quantidade, saldo_anterior, saldo_posterior, motivo, referencia, observacoes,
       usuario_id, usuario_nome, localizacao_origem_id, localizacao_destino_id, lote, lote_id, unidade,
       projeto_id, os_id, cliente_id, documento_vinculado, justificativa, centro_custo_id)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`, [
      mov.material_id, 'ESTORNO', mov.quantidade, saldoAntes, saldoDepois,
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
        SET quantidade = quantidade + ?, updated_at = CURRENT_TIMESTAMP
        WHERE material_id = ? AND localizacao_id IS ? AND lote_id IS ?`,
        [compensarLinha.delta, mov.material_id, compensarLinha.loc || null, compensarLinha.loteId || null]);
    }
    if (compensarQuantidadeMaterial) {
      await dbRun(db, 'UPDATE materiais_almoxarifado SET quantidade_atual = quantidade_atual + ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
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
    throw err;
  }

  await registrarAuditoria(db, {
    entidade: 'movimentacao', entidade_id: movimentoId, acao: 'CANCELAMENTO',
    usuario_id: user.id, usuario_nome: user.nome || user.email, justificativa: motivo,
    dados_novos: { estorno_id: estornoId },
  });

  try {
    await alertService.verificarAlertaPorMaterialId(db, mov.material_id);
  } catch (alertErr) {
    console.warn('[almoxarifado-alertas] Falha ao verificar alerta pós-estorno:', alertErr.message);
  }

  return { success: true, estorno_id: estornoId };
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
 */
async function criarReserva(db, user, data, opcoes = {}) {
  const { material_id, quantidade, projeto_id, os_id, os_referencia, cliente_id, equipamento, submontagem, observacoes,
    data_necessidade, expira_em } = data;
  const sistema = opcoes.sistema === true;
  if (!sistema && !can(user, 'reservar')) throw Object.assign(new Error('Sem permissão para reservar'), { status: 403 });

  const material = await getMaterial(db, material_id);
  const qtd = Number(quantidade);
  if (!(qtd > 0)) throw Object.assign(new Error('Quantidade da reserva deve ser maior que zero'), { status: 400 });

  // Hold atômico: o próprio UPDATE valida o disponível sob o lock de linha do SQLite (mesmo
  // padrão do resto do motor). Uma leitura + INSERT deixaria duas reservas concorrentes
  // passarem e `quantidade_reservada` ficaria acima do físico — e reserva acima do físico é
  // reserva IMPOSSÍVEL de consumir, porque a baixa contra reserva também exige saldo físico.
  const hold = await dbGet(db, `UPDATE materiais_almoxarifado
    SET quantidade_reservada = COALESCE(quantidade_reservada,0) + ?, updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
      AND (quantidade_atual - COALESCE(quantidade_reservada,0) - COALESCE(quantidade_bloqueada,0)
           - COALESCE(quantidade_em_inspecao,0)) >= ?
    RETURNING id`, [qtd, material_id, qtd]);
  if (!hold) {
    const atual = await getMaterial(db, material_id);
    throw Object.assign(new Error(`Saldo disponível insuficiente: ${await getSaldoDisponivel(atual)}`), { status: 400 });
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
       data_necessidade, expira_em)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`, [
      material_id, qtd, projeto_id || null, os_id || null, os_referencia || null,
      cliente_id || null, equipamento || null, submontagem || null,
      user.id, user.nome || user.email, observacoes || null,
      opcoes.requisicao_id || null, opcoes.item_requisicao_id || null,
      opcoes.requisicao_id ? 'REQUISICAO' : 'MANUAL',
      data_necessidade || opcoes.data_necessidade || null, expiraEm,
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
    await dbRun(db, 'UPDATE materiais_almoxarifado SET quantidade_reservada = MAX(0, COALESCE(quantidade_reservada,0) - ?), updated_at = CURRENT_TIMESTAMP WHERE id = ?',
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

  const restante = reserva.quantidade - (reserva.quantidade_utilizada || 0);
  const qtd = quantidade == null ? restante : Number(quantidade);
  if (!(qtd > 0)) throw Object.assign(new Error('Quantidade a liberar deve ser maior que zero'), { status: 400 });
  if (qtd > restante) {
    throw Object.assign(new Error(`Quantidade acima do saldo da reserva: ${restante}`), { status: 400 });
  }
  const total = qtd >= restante;

  // Reivindica a reserva num UPDATE condicional (padrão do módulo: não há transação aqui).
  // Sem isso duas liberações concorrentes — ou duas rodadas do job de expiração — passariam
  // as duas e o quantidade_reservada do material seria descontado em dobro.
  // Liberação parcial reduz `quantidade` para o hold restante continuar coerente com o que o
  // material tem reservado; liberação total preserva a quantidade original como histórico.
  const claim = await dbGet(db, `UPDATE reservas_material_almoxarifado
    SET status = ?,
        quantidade = quantidade - ?,
        liberado_por = ?, liberado_em = CURRENT_TIMESTAMP, motivo_liberacao = ?,
        updated_at = CURRENT_TIMESTAMP
    WHERE id = ? AND status = 'ATIVA' AND (quantidade - COALESCE(quantidade_utilizada,0)) >= ?
    RETURNING id`,
    [total ? statusFinal : 'ATIVA', total ? 0 : qtd, user?.id || null, motivo, reservaId, qtd]);
  if (!claim) {
    const atual = await dbGet(db, 'SELECT status FROM reservas_material_almoxarifado WHERE id = ?', [reservaId]);
    throw Object.assign(new Error(`Reserva ${String(atual?.status || 'inexistente').toLowerCase()} não pode ser liberada`), { status: 400 });
  }

  await dbRun(db, 'UPDATE materiais_almoxarifado SET quantidade_reservada = MAX(0, COALESCE(quantidade_reservada,0) - ?), updated_at = CURRENT_TIMESTAMP WHERE id = ?',
    [qtd, reserva.material_id]);

  await registrarMovimentacao(db, user, {
    material_id: reserva.material_id, tipo: 'LIBERACAO_RESERVA', quantidade: qtd,
    reserva_id: reservaId, os_id: reserva.os_id, projeto_id: reserva.projeto_id,
    motivo: motivoMovimentacao,
  });

  return { success: true, reserva_id: Number(reservaId), quantidade_liberada: qtd, status: total ? statusFinal : 'ATIVA' };
}

async function consultarEstoque(db, filters = {}) {
  let sql = `SELECT m.*, c.nome as categoria_nome,
    (m.quantidade_atual - COALESCE(m.quantidade_reservada,0) - COALESCE(m.quantidade_bloqueada,0) - COALESCE(m.quantidade_em_inspecao,0)) as quantidade_disponivel,
    (m.quantidade_atual * COALESCE(m.custo_medio, m.custo_unitario, 0)) as valor_estoque
    FROM materiais_almoxarifado m
    LEFT JOIN categorias_material_almoxarifado c ON m.categoria_id = c.id
    WHERE m.ativo = 1`;
  const params = [];
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
  getConfig,
  getMaterial,
  getSaldoDisponivel,
  syncMaterialTotals,
  syncSaldoLocalizacaoPadrao,
  getOrCreateSaldo,
  resolveLocalizacaoEntrada,
  resolveLocalizacaoSaida,
  validarLocalizacaoParaMovimento,
  registrarMovimentacao,
  cancelarMovimentacao,
  criarReserva,
  liberarReserva,
  consultarEstoque,
  consultarSaldosPorLocalizacao,
  consultarMapaLocalizacoes,
};
