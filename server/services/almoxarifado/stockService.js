const { dbRun, dbGet, dbAll } = require('./db');
const { registrarAuditoria } = require('./audit');
const { can } = require('./permissions');
const alertService = require('./alertService');
const { avaliarRegrasVinculo } = require('./movementRules');
const { TIPOS_MOVIMENTO } = require('./schema');

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
 * Recalcula o TOTAL FÍSICO do material a partir da soma das linhas de saldo por localização.
 *
 * Recalcula SOMENTE `quantidade_atual` — de propósito (achado do review final da Etapa 5).
 * A retenção (`quantidade_reservada`, `quantidade_bloqueada`, `quantidade_em_inspecao`) mora
 * EXCLUSIVAMENTE em `materiais_almoxarifado` e só muda pelos ramos do motor
 * (RESERVA/LIBERACAO_RESERVA, BLOQUEIO/DESBLOQUEIO, QUARENTENA/DECISAO_INSPECAO/...).
 * `estoque_saldo_almoxarifado` NAO tem colunas de retencao — elas existiam, nunca tiveram
 * escritor, e foram removidas na Etapa 6 justamente para que ninguem volte a somar a partir
 * delas. Recalcular retenção a partir da soma das linhas de saldo — como esta função fazia
 * antes da Etapa 5 — ZERAVA as três colunas do material a cada AJUSTE com localização (e a
 * cada estorno desse AJUSTE), que são os dois únicos chamadores. Efeitos reais:
 *   - material em quarentena virava disponível sem movimentação e sem rastro, e o item do
 *     recebimento (que mantém o próprio retido) ficava indecidível para sempre: decidirInspecao
 *     recusava com "Quantidade em inspeção insuficiente: 0";
 *   - reserva ATIVA perdia o hold no material (mesmo bug, vindo da Etapa 4), liberando para
 *     terceiros saldo que já estava prometido a uma OS.
 */
async function syncMaterialTotals(db, materialId) {
  const saldos = await dbGet(db, `
    SELECT COALESCE(SUM(quantidade),0) as total
    FROM estoque_saldo_almoxarifado WHERE material_id = ?`, [materialId]);

  // Antes: só atualizava com total > 0, então zerar todas as localizações de um material
  // (ex.: AJUSTE para 0) nunca propagava para materiais_almoxarifado.quantidade_atual — o
  // total ficava "preso" no último valor positivo. Contagem de linhas cobre o caso 0 mantendo
  // o comportamento de não tocar no material quando ele não tem NENHUMA linha de saldo ainda.
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
      // explícitos; a Task 3 passou a chamá-la SEMPRE (até para material "sem localização nem
      // lote", para `syncMaterialTotals` somar o total certo — ver comentário em
      // registrarMovimentacao), expondo esta corrida pré-existente numa população de materiais
      // que os testes de concorrência batem com dezenas de requisições simultâneas no MESMO
      // material. Sem este catch, a corrida virava SQLITE_CONSTRAINT não tratado e a requisição
      // perdedora tomava 500 em vez de seguir com a linha que a vencedora acabou de criar.
      saldo = await dbGet(db,
        'SELECT * FROM estoque_saldo_almoxarifado WHERE material_id = ? AND localizacao_id IS ? AND lote_id IS ?',
        [materialId, localizacaoId || null, loteId || null]);
      if (!saldo) throw e; // não era a corrida esperada (linha ainda não existe) — propaga o erro original
    }
  }
  return saldo;
}

/** Sincroniza saldo na localização padrão quando só materiais_almoxarifado tem quantidade. */
async function syncSaldoLocalizacaoPadrao(db, materialId) {
  const material = await getMaterial(db, materialId);
  if (!material.localizacao_padrao_id) return;

  const saldosPositivos = await dbAll(db,
    'SELECT COALESCE(SUM(quantidade), 0) as total FROM estoque_saldo_almoxarifado WHERE material_id = ? AND quantidade > 0',
    [materialId]);
  const totalSaldo = saldosPositivos[0]?.total || 0;
  const materialQty = material.quantidade_atual || 0;

  if (totalSaldo > 0) return;

  const saldo = await getOrCreateSaldo(db, materialId, material.localizacao_padrao_id);
  await dbRun(db,
    'UPDATE estoque_saldo_almoxarifado SET quantidade = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
    [materialQty, saldo.id]);
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

const MAPA_LOCALIZACOES_SQL = `
  SELECT l.*,
    COALESCE(s.qtd_itens, 0) as qtd_itens,
    COALESCE(s.quantidade_total, 0) as quantidade_total,
    COALESCE(s.quantidade_reservada, 0) as quantidade_reservada,
    COALESCE(m.itens_baixo_minimo, 0) as itens_baixo_minimo,
    COALESCE(m.itens_criticos, 0) as itens_criticos
  FROM localizacoes_almoxarifado l
  LEFT JOIN (
    SELECT loc_id,
      COUNT(DISTINCT material_id) as qtd_itens,
      SUM(qty) as quantidade_total,
      SUM(reservado) as quantidade_reservada
    FROM (
      -- reservado fixo em 0: estoque_saldo_almoxarifado nao tem mais quantidade_reservada
      -- (Etapa 6, Task 2 -- coluna sem escritor, a soma ja era sempre 0). A retencao mora
      -- exclusivamente em materiais_almoxarifado; este mapa e so por localizacao fisica.
      SELECT localizacao_id as loc_id, material_id, quantidade as qty, 0 as reservado
      FROM estoque_saldo_almoxarifado
      WHERE localizacao_id IS NOT NULL AND quantidade > 0
      UNION ALL
      SELECT m.localizacao_padrao_id, m.id, m.quantidade_atual, 0
      FROM materiais_almoxarifado m
      WHERE m.ativo = 1 AND m.localizacao_padrao_id IS NOT NULL AND m.quantidade_atual > 0
        AND NOT EXISTS (
          SELECT 1 FROM estoque_saldo_almoxarifado s
          WHERE s.material_id = m.id AND s.quantidade > 0
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
        CASE WHEN NOT EXISTS (
          SELECT 1 FROM estoque_saldo_almoxarifado s2 WHERE s2.material_id = m.id AND s2.quantidade > 0
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

async function registrarMovimentacao(db, user, params) {
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
      const tiposDescarte = ['SUCATA', 'PERDA', 'AJUSTE_NEGATIVO'];
      if (!tiposDescarte.includes(tipo) && lotService.isVencido(loteResolvido)) {
        throw Object.assign(
          new Error(`Lote ${loteResolvido.codigo} vencido em ${loteResolvido.data_validade} nao pode sair para consumo. `
            + 'Lote vencido so pode ser baixado por SUCATA/PERDA ou corrigido por AJUSTE, com justificativa.'),
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
      }
    } else if (tiposEntrada.includes(tipo)) {
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
      } else {
        // entrada sem custo informado: comportamento atual (só quantidade), inalterado
        const row = await dbGet(db, `UPDATE materiais_almoxarifado
          SET quantidade_atual = quantidade_atual + ?, updated_at = CURRENT_TIMESTAMP
          WHERE id = ? RETURNING quantidade_atual`, [quantidade, material_id]);
        saldoPosterior = row.quantidade_atual;
      }
    } else if (tiposAjuste.includes(tipo) && localizacao_destino_id) {
      // AJUSTE escopado a uma localização: define o saldo APENAS daquela localização
      // (não o total do material) e recalcula o total a partir da soma de todas as
      // localizações — inclui o caso de zerar (quantidade 0), daí o syncMaterialTotals
      // contar linhas em vez de exigir total > 0 (fix desta task).
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

    // A linha de saldo por localização/lote passa a ser criada SEMPRE numa entrada/saída — mesmo
    // sem localização nem lote — e não mais só quando havia uma das duas (achado do review round
    // 1 desta task). Motivo: `syncMaterialTotals` soma TODAS as linhas de estoque_saldo_almoxarifado
    // do material e só é no-op quando não há NENHUMA linha; a partir da PRIMEIRA linha (ex.: a
    // primeira entrada que citou lote) a soma passa a ser tratada como o total de verdade. Se só
    // PARTE das entradas/saídas do material criasse linha, a soma ficaria PARCIAL, e um AJUSTE
    // com localização (ou o estorno dele) sobrescreveria quantidade_atual com essa soma
    // incompleta, evaporando a parte "invisível" — ex.: entrada de 10 sem lote + 5 no lote X,
    // AJUSTE com localização somava só 5. Criar a linha sempre garante soma(linhas) ===
    // quantidade_atual em qualquer momento em que syncMaterialTotals rodar.
    if (tiposEntrada.includes(tipo)) {
      const saldo = await getOrCreateSaldo(db, material_id, locEntrada, loteIdFinal);
      await dbRun(db, 'UPDATE estoque_saldo_almoxarifado SET quantidade = quantidade + ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
        [quantidade, saldo.id]);
    }
    if (tiposSaida.includes(tipo)) {
      const saldo = await getOrCreateSaldo(db, material_id, locSaida, loteIdFinal);
      if (loteIdFinal && !permiteNegativo) {
        // Guarda no WHERE, como o resto do motor. Sem isto a subtracao abaixo negativa a linha do
        // lote em silencio: a guarda de saldo insuficiente la em cima compara com o disponivel do
        // MATERIAL, e syncMaterialTotals soma a linha negativa de volta, entao o total continua
        // coerente e nada denuncia (reproduzido em 2026-08-09: lote B com 2 aceitou saida de 10 e
        // ficou em -8).
        const claim = await dbGet(db, `UPDATE estoque_saldo_almoxarifado
          SET quantidade = quantidade - ?, updated_at = CURRENT_TIMESTAMP
          WHERE id = ? AND quantidade >= ?
          RETURNING id`, [quantidade, saldo.id, quantidade]);
        if (!claim) {
          // O físico do material já foi debitado acima (linha ~439-452/rowRes quando a saída
          // consumia reserva, ou ~460-468 no caminho simples) antes deste claim rodar — não há
          // transação neste módulo, então recusar aqui sem devolver deixaria quantidade_atual
          // debitado sem contrapartida (trocaria um bug pelo outro). Compensa antes de lançar.
          if (consumindoReserva) {
            // Achado do review round 1: compensar só quantidade_atual não bastava quando a saída
            // consumia reserva — o claim da reserva (linha ~421-426) e o débito de
            // quantidade_reservada/quantidade_atual (linha ~439-452) já tinham acontecido. Sem
            // desfazer os três, a reserva ficava "queimada" (quantidade_utilizada maior, e às
            // vezes status CONSUMIDA) sem NENHUMA saída física real ter ocorrido — reserva de
            // outra OS perdida, e o disponível do material inflado (quantidade_reservada a menos
            // do que deveria). O precedente é a própria compensação em ~446-451, que já desfaz
            // quantidade_utilizada à mão quando o claim físico falha; aqui espelhamos o mesmo
            // padrão para o físico + a reserva juntos.
            await dbRun(db, `UPDATE materiais_almoxarifado
              SET quantidade_atual = quantidade_atual + ?,
                  quantidade_reservada = COALESCE(quantidade_reservada,0) + ?,
                  updated_at = CURRENT_TIMESTAMP
              WHERE id = ?`, [quantidade, quantidade, material_id]);
            await dbRun(db, 'UPDATE reservas_material_almoxarifado SET quantidade_utilizada = MAX(0, quantidade_utilizada - ?), updated_at = CURRENT_TIMESTAMP WHERE id = ?',
              [quantidade, reserva_id]);
            // A reserva só vira CONSUMIDA DENTRO desta mesma chamada (linha ~456), quando zera —
            // reverter para ATIVA aqui é seguro porque o claim atômico do topo (linha ~421-426)
            // exigiu status = 'ATIVA' para a execução sequer chegar até aqui.
            await dbRun(db, "UPDATE reservas_material_almoxarifado SET status = 'ATIVA', updated_at = CURRENT_TIMESTAMP WHERE id = ? AND status = 'CONSUMIDA'", [reserva_id]);
          } else {
            await dbRun(db, `UPDATE materiais_almoxarifado
              SET quantidade_atual = quantidade_atual + ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
              [quantidade, material_id]);
          }
          throw Object.assign(
            new Error(`Saldo insuficiente no lote ${loteCodigoFinal}. Disponível: ${saldo.quantidade} ${material.unidade}`),
            { status: 400 });
        }
      } else {
        await dbRun(db, 'UPDATE estoque_saldo_almoxarifado SET quantidade = quantidade - ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
          [quantidade, saldo.id]);
      }
    }
    if (tiposAjuste.includes(tipo) && !localizacao_destino_id) {
      // AJUSTE sem localização não mexe em localização (não é entrada nem saída) — mas sem
      // isto o saldo por localização diverge do total do material quando só há saldo na
      // localização padrão (paridade com o antigo v1, que chamava isto incondicionalmente
      // após cada movimento). AJUSTE COM localização já escreveu na localização certa acima
      // — chamar isto aqui reescreveria a localização padrão por engano.
      await syncSaldoLocalizacaoPadrao(db, material_id);
    }
  }

  const result = await dbRun(db, `INSERT INTO movimentacoes_almoxarifado
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

  // Claim atômico ANTES de aplicar qualquer efeito inverso (achado do review final: double-cancel
  // race). O UPDATE...WHERE cancelado = 0 é a própria seção crítica sob o lock de linha do SQLite:
  // de duas chamadas concorrentes para o mesmo movimentoId, só uma tem changes = 1 — essa é a
  // única que segue para reverter saldo; a outra falha aqui, antes de tocar em qualquer saldo.
  // Também zera regularizacao_pendente aqui (achado do review: estorno deixava a pendência viva).
  const claim = await dbRun(db, `UPDATE movimentacoes_almoxarifado
    SET cancelado = 1, cancelado_por = ?, cancelado_em = CURRENT_TIMESTAMP, cancelamento_motivo = ?, regularizacao_pendente = 0
    WHERE id = ? AND cancelado = 0`, [user.id, motivo, movimentoId]);
  if (!claim.changes) throw Object.assign(new Error('Movimentação já cancelada'), { status: 400 });

  const tiposEntrada = ['ENTRADA', 'ENTRADA_COMPRA', 'ENTRADA_MANUAL', 'ENTRADA_DEVOLUCAO', 'DEVOLUCAO', 'AJUSTE_POSITIVO'];
  const tiposSaida = ['SAIDA', 'SAIDA_PRODUCAO', 'SAIDA_MONTAGEM', 'SAIDA_ASSISTENCIA', 'AJUSTE_NEGATIVO', 'SUCATA', 'PERDA'];
  let estornoId;

  try {
    const material = await getMaterial(db, mov.material_id);
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
      // reverter localização da entrada original — mov.lote_id (Etapa 6, Task 3) devolve para a
      // MESMA linha de lote que a entrada creditou, lida do próprio ledger (imutável), não
      // recalculada. Gate `loc || mov.lote_id` (achado do review round 1): o gate antigo só
      // olhava `loc`, então uma entrada sem localização mas COM lote (a mesma configuração que
      // motivou registrarMovimentacao a criar a linha por lote mesmo sem localização) tinha o
      // `if` pulado no estorno — quantidade_atual voltava, mas a linha do lote ficava "fantasma"
      // com o valor antigo, e uma saída seguinte no mesmo lote tirava de saldo que não existe
      // mais. É a mesma classe do −8 que esta task fecha, só que pela porta do estorno.
      const loc = mov.localizacao_destino_id || material.localizacao_padrao_id;
      if (loc || mov.lote_id) {
        const saldo = await getOrCreateSaldo(db, mov.material_id, loc, mov.lote_id);
        await dbRun(db, 'UPDATE estoque_saldo_almoxarifado SET quantidade = quantidade - ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?', [mov.quantidade, saldo.id]);
      }
      // Decisão (Etapa 1): estorno NÃO reverte custo_medio/custo_unitario — reversão exata é
      // mal-definida após movimentos intermediários; corrigir via nova entrada com custo. Ver
      // specs/modulo-almoxarifado/03-motor-estoque/README.md.
    } else if (tiposSaida.includes(mov.tipo)) {
      await dbRun(db, 'UPDATE materiais_almoxarifado SET quantidade_atual = quantidade_atual + ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
        [mov.quantidade, mov.material_id]);
      saldoDepois = saldoAntes + parseFloat(mov.quantidade);
      // mov.lote_id (Etapa 6, Task 3): devolve para a linha do lote que a saída original debitou.
      // Gate `loc || mov.lote_id` — mesmo achado do ramo de ENTRADA acima: sem isto, uma saída
      // sem localização mas com lote não devolvia a linha do lote no estorno.
      const loc = mov.localizacao_origem_id || material.localizacao_padrao_id;
      if (loc || mov.lote_id) {
        const saldo = await getOrCreateSaldo(db, mov.material_id, loc, mov.lote_id);
        await dbRun(db, 'UPDATE estoque_saldo_almoxarifado SET quantidade = quantidade + ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?', [mov.quantidade, saldo.id]);
      }
    } else if (mov.tipo === 'AJUSTE') {
      if (mov.localizacao_destino_id) {
        // AJUSTE escopado a uma localização (Task 6): um SET absoluto do total, como no ramo
        // global abaixo, ignoraria as OUTRAS localizações do material — a soma das linhas de
        // estoque_saldo_almoxarifado deixaria de bater com quantidade_atual (achado do review
        // pós-Task 6). O delta que o ajuste aplicou à localização é o mesmo que aplicou ao total
        // (saldo_posterior - saldo_anterior do livro, ambos totais do material), então revertemos
        // SÓ a localização por esse delta e recalculamos o total a partir da soma real.
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
        await syncSaldoLocalizacaoPadrao(db, mov.material_id);
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
