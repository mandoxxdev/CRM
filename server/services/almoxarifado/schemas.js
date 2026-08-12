/** Schemas Zod compartilhados do almoxarifado (padrão da fundação — ver validation.js). */
const { z } = require('zod');
const { TIPOS_REQUISICAO, TIPOS_MOVIMENTO, TIPOS_RETENCAO, TIPOS_DEDICADOS } = require('./schema');

const CentroCustoSchema = z.object({
  codigo: z.string().min(1, 'codigo é obrigatório'),
  nome: z.string().min(1, 'nome é obrigatório'),
  ativo: z.union([z.literal(0), z.literal(1)]).optional(),
});

const AlmoxarifadoSchema = z.object({
  codigo: z.string().min(1, 'codigo é obrigatório'),
  nome: z.string().min(1, 'nome é obrigatório'),
  // Fix pós-review (Critical): ConfiguracoesAlmoxarifado.js handleSalvar manda
  // `descricao: form.descricao.trim() || null` — criar/editar almoxarifado sem descrição
  // manda `null` explícito, não string vazia. Sem `.nullable()`, z.string().optional() só
  // aceita string ou "ausente" e rejeita `null` com 400 em QUALQUER submit sem descrição.
  descricao: z.string().nullable().optional(),
  ativo: z.union([z.literal(0), z.literal(1)]).optional(),
});

/**
 * Tipos que a ROTA genérica de movimentação (POST /movimentacoes/v2) aceita.
 *
 * É TIPOS_MOVIMENTO menos ESTORNO e menos TIPOS_RETENCAO. O porquê de cada exclusão:
 *  - ESTORNO: linha de estorno só nasce dentro de cancelarMovimentacao, nunca de um POST
 *    (já era recusado pelo motor; aqui a recusa passa a acontecer antes, na validação).
 *  - TIPOS_RETENCAO: cada um tem um serviço dono com o gate de permissão certo e um registro
 *    paralelo que dá lastro ao número (reserva, item de recebimento, inspeção — ver schema.js).
 *    A v2 tem gate `movimentar`, o mais amplo do módulo: aceitar retenção aqui tornava DECORATIVO
 *    o gate das rotas específicas (um ALMOXARIFE que toma 403 em POST /materiais/:id/bloquear,
 *    gate `ajustar_estoque`, conseguia o mesmo efeito mandando {tipo:'BLOQUEIO'} para a v2) e
 *    permitia soltar quarentena com {tipo:'LIBERACAO_INSPECAO'} sem permissão `inspecionar`, sem
 *    registro de inspeção e sem baixar o retido do item — que ficava indecidível para sempre.
 *  - TIPOS_DEDICADOS (Etapa 8): mesmo raciocínio dos de retenção, motivo diferente.
 *    `DEVOLUCAO_CLIENTE` exige documento de devolução e material com dono, exigências que só
 *    existem na rota dedicada (`POST /materiais-cliente/devolucoes`, `DevolucaoClienteSchema`).
 *    Aceitá-lo aqui tornaria decorativas as duas: `documento_vinculado` é opcional no
 *    `MovimentacaoSchema`, então sairia material de cliente sem documento nenhum.
 *
 * O que SOBRA é o conjunto operacional: os seis tipos do formulário (TIPOS_FORM em
 * MovimentacoesAlmoxarifado.js: ENTRADA, SAIDA, AJUSTE, DEVOLUCAO, SUCATA e PERDA — os dois
 * últimos entraram no seletor na Task 9 da Etapa 6; já eram aceitos aqui antes disso, só não
 * tinham botão na tela), as variantes prefixadas `ENTRADA_`, `SAIDA_` e `AJUSTE_` usadas por
 * outras telas e relatórios, TRANSFERENCIA (a rota /transferencias força esse tipo, mas a v2
 * também o aceita) e RETRABALHO — todos mexem no físico e o gate `movimentar` é exatamente o
 * que se espera deles.
 *
 * ATENÇÃO: esta lista é da ROTA, não do motor. Os serviços internos (returnService,
 * receiptService, requisitionService, inspectionService, criarReserva/liberarReserva) chamam
 * stockService.registrarMovimentacao DIRETO e continuam podendo criar os tipos de retenção —
 * é lá que mora o gate correto.
 */
const TIPOS_MOVIMENTO_ROTA = TIPOS_MOVIMENTO.filter(
  (t) => t !== 'ESTORNO' && !TIPOS_RETENCAO.includes(t) && !TIPOS_DEDICADOS.includes(t),
);

const MovimentacaoSchema = z.object({
  material_id: z.number().int().positive(),
  tipo: z.string().min(1).refine((t) => TIPOS_MOVIMENTO_ROTA.includes(t), {
    message: 'tipo de movimentação não permitido nesta rota (tipos de reserva, bloqueio e inspeção '
      + 'só podem ser criados pelas telas de Reservas e Inspeções)',
  }),
  quantidade: z.number().min(0, 'quantidade deve ser maior que zero'),
  motivo: z.string().optional(),
  referencia: z.string().optional(),
  observacoes: z.string().optional(),
  justificativa: z.string().optional(),
  lote: z.string().optional(),
  // Sem declarar aqui, o z.object descarta a chave em silencio e o motor nunca ve o lote_id
  // vindo da v2 — foi exatamente o que aconteceu com reserva_id na Etapa 4.
  lote_id: z.number().int().positive().optional(),
  localizacao_origem_id: z.number().int().optional(),
  localizacao_destino_id: z.number().int().optional(),
  projeto_id: z.number().int().optional(),
  os_id: z.number().int().optional(),
  cliente_id: z.number().int().optional(),
  centro_custo_id: z.number().int().optional(),
  // Consumo contra reserva (Etapa 4). Sem declarar aqui o Zod removia o campo em silêncio
  // (z.object descarta chaves desconhecidas), então o motor nunca via o reserva_id vindo da
  // v2 e tratava a saída como consumo do disponível geral.
  reserva_id: z.number().int().positive().optional(),
  documento_vinculado: z.string().optional(),
  custo_unitario: z.number().gt(0).optional(),
  emergencial: z.boolean().optional(),
  // Etapa 6b: chave nao declarada e descartada pelo validate() — series/serie_ids
  // precisam estar aqui para chegarem ao motor.
  series: z.array(z.string().trim().min(1)).max(1000).optional(),
  serie_ids: z.array(z.coerce.number().int().positive()).max(1000).optional(),
}).superRefine((d, ctx) => {
  // quantidade 0 só é aceita para AJUSTE com localização (zera aquela localização
  // e propaga o total do material — ver stockService.registrarMovimentacao). Para
  // qualquer outro caso quantidade continua exigindo > 0.
  const zeraLocalizacao = d.tipo === 'AJUSTE' && !!d.localizacao_destino_id;
  if (d.quantidade === 0 && !zeraLocalizacao) {
    ctx.addIssue({ code: 'custom', path: ['quantidade'], message: 'quantidade deve ser maior que zero' });
  }
});

const RegularizacaoSchema = z.object({
  os_id: z.number().int().optional(),
  projeto_id: z.number().int().optional(),
  centro_custo_id: z.number().int().optional(),
}).refine((d) => d.os_id || d.projeto_id || d.centro_custo_id, {
  message: 'Informe OS, projeto ou centro de custo para regularizar',
});

const CancelamentoSchema = z.object({
  motivo: z.string().min(1, 'motivo é obrigatório'),
});

/**
 * Devolução ao cliente (Etapa 8, Task 6, decisão 9).
 *
 * NÃO é a devolução da Etapa 7 (`POST /devolucoes`, `returnService`), onde o material **volta**
 * para o estoque. Aqui o material **sai** do prédio de volta para quem é dele — direções opostas,
 * nomes parecidos.
 *
 * `documento_devolucao` é obrigatório **aqui e só aqui**, e é a razão de esta rota existir
 * separada da v2 genérica: exigi-lo no `MovimentacaoSchema` obrigaria documento em toda
 * movimentação do módulo.
 *
 * ATENÇÃO ao mexer: `validate()` troca `req.body` pelo objeto parseado, e `z.object` descarta
 * chave não declarada **em silêncio** (já mordeu duas vezes: `reserva_id` na Etapa 4, `lote_id`
 * na Etapa 6). Todo campo que a rota lê de `req.body` precisa estar declarado abaixo — inclusive
 * `documento_devolucao`, que sem declaração sumiria e a rota recusaria toda devolução como se
 * faltasse documento.
 */
const DevolucaoClienteSchema = z.object({
  material_id: z.number().int().positive(),
  quantidade: z.number().gt(0, 'quantidade deve ser maior que zero'),
  documento_devolucao: z.string().trim().min(1, 'informe o numero do documento de devolucao'),
  lote_id: z.number().int().positive().optional(),
  serie_ids: z.array(z.coerce.number().int().positive()).max(1000).optional(),
  localizacao_origem_id: z.number().int().optional(),
  observacoes: z.string().optional(),
});

// Booleano tolerante: aceita 0/1 (como persistido no SQLite) ou true/false (como o front pode
// mandar em checkboxes). Usado nas flags de controle do material.
const FlagSchema = z.union([z.boolean(), z.literal(0), z.literal(1)]).optional();

// Coerção tolerante para campos numéricos vindos de formulário HTML (fix pós-review — Critical):
// MaterialAlmoxarifadoForm.js espalha `form` inteiro no submit; inputs de texto/número guardam
// STRING no state (`onChange={e => set('campo', e.target.value)}`), nunca number. Um campo nunca
// tocado pelo usuário chega como `''`; um campo preenchido chega como `'10'`. Sem coerção,
// `z.number()` rejeita os dois casos e QUALQUER submit do formulário real (criar ou editar
// material) quebra com 400.
//
// Regras, na ordem (a distinção entre `''` e `null` é proposital e não pode ser perdida):
//   '' ou undefined  -> undefined (chave "ausente" para efeitos de validação — no PUT isso é o
//                        que aciona o preserve-when-omitted da rota; um <select> vazio e um
//                        campo nunca editado têm que se comportar como "não mandei nada")
//   null             -> permanece null (limpa explicitamente um campo nullable — ex.:
//                        subfamilia_id: null — não pode colapsar para "ausente"/preservar)
//   string não vazia -> Number(string) (aceita '10'; 'abc' vira NaN e o z.number() a jusante
//                        rejeita normalmente — mantém o contrato de shape inválido -> 400)
//   já é number       -> passa direto
function numFromForm(schema) {
  return z.preprocess((v) => {
    if (v === '' || v === undefined) return undefined;
    if (v === null) return null;
    return typeof v === 'string' ? Number(v) : v;
  }, schema);
}

// Fatores de conversão (Etapa 2, Task 4): quando a unidade de compra/consumo é informada, o
// fator correspondente é obrigatório e deve ser > 0 — sem isso não dá para converter a
// quantidade da unidade de compra/consumo para a unidade padrão do material. Compartilhada
// entre MaterialSchema (POST, shape completo) e MaterialUpdateSchema (PUT, shape parcial) —
// olha só os campos que estão presentes no payload, nunca o valor atual em banco (o merge
// com o valor atual acontece depois, na rota — ver preserve-when-omitted no PUT).
function refineUnidadesFator(d, ctx) {
  if (d.unidade_compra) {
    if (!(typeof d.fator_conversao_compra === 'number' && d.fator_conversao_compra > 0)) {
      ctx.addIssue({
        code: 'custom',
        path: ['fator_conversao_compra'],
        message: 'fator_conversao_compra é obrigatório e deve ser maior que zero quando unidade_compra é informada',
      });
    }
  }
  if (d.unidade_consumo) {
    if (!(typeof d.fator_conversao_consumo === 'number' && d.fator_conversao_consumo > 0)) {
      ctx.addIssue({
        code: 'custom',
        path: ['fator_conversao_consumo'],
        message: 'fator_conversao_consumo é obrigatório e deve ser maior que zero quando unidade_consumo é informada',
      });
    }
  }
}

const MaterialShape = z.object({
  codigo: z.string().min(1, 'codigo é obrigatório'),
  nome: z.string().min(1, 'nome é obrigatório'),
  familia_id: numFromForm(z.number().int().positive()),
  subfamilia_id: numFromForm(z.number().int().positive().nullable().optional()),
  descricao: z.string().nullable().optional(),
  categoria: z.string().optional(),
  unidade: z.string().optional(),
  quantidade_atual: numFromForm(z.number().nonnegative().optional()),
  quantidade_minima: numFromForm(z.number().nonnegative().optional()),
  quantidade_maxima: numFromForm(z.number().nonnegative().optional()),
  custo_unitario: numFromForm(z.number().nonnegative().optional()),
  fornecedor_principal: z.string().nullable().optional(),
  codigo_fornecedor: z.string().nullable().optional(),
  ncm: z.string().nullable().optional(),
  especificacoes: z.string().nullable().optional(),
  observacoes: z.string().nullable().optional(),
  ativo: FlagSchema,
  descricao_tecnica: z.string().nullable().optional(),
  categoria_id: numFromForm(z.number().int().nullable().optional()),
  subcategoria_id: numFromForm(z.number().int().nullable().optional()),
  localizacao_padrao_id: numFromForm(z.number().int().nullable().optional()),
  fornecedor_id: numFromForm(z.number().int().nullable().optional()),
  // Etapa 8: sem declarar aqui, o z.object descarta a chave em SILENCIO (validation.js troca
  // req.body pelo parsed) e o dono do material nunca chega a rota. Mesma familia de bug do
  // reserva_id na Etapa 4 e do lote_id na Etapa 6.
  // `null` explicito e o unico valor que significa "material nosso" e precisa ATRAVESSAR o
  // numFromForm (que preserva null e colapsa '' para undefined/ausente) — senao escolher
  // "GMP (estoque proprio)" num material que ja tinha dono preservaria o dono antigo no PUT.
  proprietario_cliente_id: numFromForm(z.number().int().positive().nullable().optional()),
  tipo_material: z.string().nullable().optional(),
  material_critico: FlagSchema,
  controle_lote: FlagSchema,
  controle_certificado: FlagSchema,

  // ── Cadastro completo (Etapa 2, Task 4) ──
  fabricante: z.string().nullable().optional(),
  codigo_fabricante: z.string().nullable().optional(),
  peso_unitario: numFromForm(z.number().nonnegative().nullable().optional()),
  dimensoes: z.string().nullable().optional(),
  material_construtivo: z.string().nullable().optional(),
  norma: z.string().nullable().optional(),
  marca: z.string().nullable().optional(),
  modelo: z.string().nullable().optional(),
  aplicacao: z.string().nullable().optional(),
  ponto_reposicao: numFromForm(z.number().nonnegative().nullable().optional()),
  lote_economico: numFromForm(z.number().nonnegative().nullable().optional()),
  controle_serie: FlagSchema,
  controle_validade: FlagSchema,
  controle_corrida: FlagSchema,
  requer_inspecao: FlagSchema,
  requer_foto: FlagSchema,
  // Fix pós-review (Critical): '' (default do <select> no form quando o material ainda não
  // tem classe) não é um valor válido do enum nem `null` — sem o preprocess, z.enum rejeita
  // '' com 400 e QUALQUER submit real do formulário (criar sem escolher classe, ou editar um
  // material existente sem classe) quebra. Mesma família de bug do numFromForm (linha ~77):
  // '' vira undefined (ausente — preserva no PUT), só null explícito limpa o campo. Defesa em
  // profundidade: o cliente já manda null explícito quando o select fica em branco, mas este
  // preprocess protege qualquer outro caller que mande ''.
  classe_abc: z.preprocess((v) => (v === '' ? undefined : v), z.enum(['A', 'B', 'C']).nullable().optional()),
  unidade_compra: z.string().nullable().optional(),
  fator_conversao_compra: numFromForm(z.number().nullable().optional()),
  unidade_consumo: z.string().nullable().optional(),
  fator_conversao_consumo: numFromForm(z.number().nullable().optional()),
});

// POST — shape completo (familia_id obrigatório) + invariantes de fator de conversão.
const MaterialSchema = MaterialShape.superRefine(refineUnidadesFator);

// PUT — shape parcial (preserve-when-omitted é resolvido na rota, não aqui; ver
// routes/almoxarifado.js). .partial() precisa ser aplicado ANTES do superRefine — Zod não
// permite .partial() em cima de um schema que já carrega refinamentos (ZodEffects).
const MaterialUpdateSchema = MaterialShape.partial().superRefine(refineUnidadesFator);

// ── Requisições (Etapa 3, Task 1) ──────────────────────────────────────────────
// Schema único usado pelas DUAS rotas de criação (/api/almoxarifado/requisicoes e
// /api/requisicoes-material) via requisitionCreateService.createRequisicao — fecha o bug
// conhecido de quantidade <= 0 (nenhuma das duas rotas validava isso antes desta etapa).
const ItemRequisicaoSchema = z.object({
  material_id: numFromForm(z.number().int().positive('material_id é obrigatório')),
  // numFromForm — lição E2-T4: RequisicaoForm.js manda quantidade como string do form.
  quantidade: numFromForm(z.number().gt(0, 'quantidade deve ser maior que zero')),
  observacoes: z.string().nullable().optional(),
});

const RequisicaoSchema = z.object({
  departamento: z.string().nullable().optional(),
  setor: z.string().nullable().optional(),
  os_referencia: z.string().nullable().optional(),
  urgencia: z.string().nullable().optional(),
  observacoes: z.string().nullable().optional(),
  justificativa_urgencia: z.string().nullable().optional(),
  modulo_origem: z.string().nullable().optional(),
  // '' (select em branco no form) vira "ausente" -> default CONSUMO; mesma família de fix do
  // classe_abc em MaterialShape acima.
  tipo_requisicao: z.preprocess(
    (v) => (v === '' ? undefined : v),
    z.enum(TIPOS_REQUISICAO).default('CONSUMO'),
  ),
  centro_custo_id: numFromForm(z.number().int().positive().nullable().optional()),
  local_entrega: z.string().nullable().optional(),
  projeto_id: numFromForm(z.number().int().positive().nullable().optional()),
  cliente_id: numFromForm(z.number().int().positive().nullable().optional()),
  equipamento: z.string().nullable().optional(),
  prioridade: z.string().nullable().optional(),
  data_necessidade: z.string().nullable().optional(),
  justificativa: z.string().nullable().optional(),
  salvar_rascunho: FlagSchema,
  itens: z.array(ItemRequisicaoSchema).min(1, 'Inclua ao menos um item'),
}).superRefine((d, ctx) => {
  // Requisição emergencial exige justificativa na criação (design, seção "Dados") —
  // vale tanto para envio direto quanto para rascunho (o campo nasce junto com o tipo).
  if (d.tipo_requisicao === 'EMERGENCIAL' && !d.justificativa?.trim()) {
    ctx.addIssue({ code: 'custom', path: ['justificativa'], message: 'Requisição emergencial exige justificativa' });
  }
});

// ── Remessa para terceiros (Etapa 8b, Task 8) ──────────────────────────────────
/**
 * TODO campo que o serviço usa precisa estar declarado aqui: `validate()` troca `req.body` pelo
 * resultado do parse, e `z.object` DESCARTA chave não declarada EM SILÊNCIO — o serviço
 * simplesmente nunca vê o campo, sem erro nenhum, e a regra de negócio correspondente nunca
 * dispara. Já custou caro TRÊS vezes nesta base: `reserva_id` na Etapa 4, `lote_id` na Etapa 6 e
 * `justificativa`/`motivo` do cancelamento na Etapa 8. `peso` e `observacoes` do item são os
 * candidatos óbvios a serem esquecidos aqui — `remessaTerceiroRotas.api.test.js` relê cada um do
 * banco depois do POST justamente por isso.
 */
const ItemRemessaTerceiroSchema = z.object({
  material_id: z.number().int().positive(),
  quantidade: z.number().gt(0, 'quantidade do item deve ser maior que zero'),
  lote_id: z.number().int().positive().optional(),
  peso: z.number().nonnegative().optional(),
  observacoes: z.string().optional(),
});

/**
 * `fornecedor_id` OU `fornecedor_nome`: o terceiro pode não estar cadastrado em Compras, e travar a
 * remessa por isso pararia o galpão. Quem valida a existência do id é `thirdPartyService`
 * (`resolverFornecedor`), que também protege a consulta com `sqlite_master` — `fornecedores` é
 * criada em `server/index.js`, não pelo `initSchema` do almoxarifado, e pode não existir.
 */
const RemessaTerceiroSchema = z.object({
  fornecedor_id: z.number().int().positive().optional(),
  fornecedor_nome: z.string().min(1).optional(),
  tipo_servico: z.string().optional(),
  os_id: z.number().int().positive().optional(),
  projeto_id: z.number().int().positive().optional(),
  pedido_compra_id: z.number().int().positive().optional(),
  prazo_previsto: z.string().optional(),
  observacoes: z.string().optional(),
  itens: z.array(ItemRemessaTerceiroSchema).min(1, 'a remessa precisa de ao menos um item'),
}).refine((d) => d.fornecedor_id || (d.fornecedor_nome && d.fornecedor_nome.trim()), {
  message: 'Informe o fornecedor (terceiro) da remessa',
});

/**
 * Retorno: LISTA DE RESULTADOS, não um escalar (decisão 7 do design). `material_id` é opcional e,
 * na 8b, só pode ser igual ao material do item enviado — o serviço recusa diferente apontando a
 * Etapa 8c. Ele está declarado aqui DE PROPÓSITO: sem a chave, o campo chegaria como `undefined`
 * ao serviço, a recusa da 8c nunca dispararia (o operador acharia que a transformação funcionou),
 * e a 8c ainda teria de mexer no schema para destravá-la.
 */
const RetornoRemessaSchema = z.object({
  nota_fiscal: z.string().optional(),
  itens: z.array(z.object({
    item_remessa_id: z.number().int().positive(),
    quantidade: z.number().gt(0, 'quantidade do retorno deve ser maior que zero'),
    material_id: z.number().int().positive().optional(),
    lote_id: z.number().int().positive().optional(),
    observacoes: z.string().optional(),
  })).min(1, 'informe ao menos um item retornado'),
});

/**
 * Encerramento. `destino` e `justificativa` são opcionais AQUI e obrigatórios NO SERVIÇO quando há
 * pendência — a exigência depende do saldo que sobrou, que o schema não tem como saber (remessa que
 * voltou inteira encerra sozinha, sem destino nenhum, e isso é correto). Deixar a regra só no
 * serviço evita duas fontes da mesma verdade.
 *
 * O `enum` do `destino` fica aqui e a lista canônica é `thirdPartyService.DESTINOS_ENCERRAMENTO`:
 * são as mesmas duas strings, e quem acrescentar um destino tem de mexer nos dois lugares — o
 * serviço recusaria o valor novo mesmo com o schema aceitando.
 */
const EncerramentoRemessaSchema = z.object({
  destino: z.enum(['PERDA_NO_TERCEIRO', 'CONSUMIDO_NO_PROCESSO']).optional(),
  justificativa: z.string().optional(),
});

const CancelamentoRemessaSchema = z.object({
  motivo: z.string().min(1, 'motivo é obrigatório'),
});

module.exports = {
  CentroCustoSchema, AlmoxarifadoSchema, MovimentacaoSchema, TIPOS_MOVIMENTO_ROTA,
  RegularizacaoSchema, CancelamentoSchema, DevolucaoClienteSchema,
  MaterialSchema, MaterialUpdateSchema, RequisicaoSchema, ItemRequisicaoSchema,
  ItemRemessaTerceiroSchema, RemessaTerceiroSchema, RetornoRemessaSchema,
  EncerramentoRemessaSchema, CancelamentoRemessaSchema,
};
