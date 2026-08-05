/** Schemas Zod compartilhados do almoxarifado (padrão da fundação — ver validation.js). */
const { z } = require('zod');
const { TIPOS_REQUISICAO } = require('./schema');

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

const MovimentacaoSchema = z.object({
  material_id: z.number().int().positive(),
  tipo: z.string().min(1),
  quantidade: z.number().min(0, 'quantidade deve ser maior que zero'),
  motivo: z.string().optional(),
  referencia: z.string().optional(),
  observacoes: z.string().optional(),
  justificativa: z.string().optional(),
  lote: z.string().optional(),
  localizacao_origem_id: z.number().int().optional(),
  localizacao_destino_id: z.number().int().optional(),
  projeto_id: z.number().int().optional(),
  os_id: z.number().int().optional(),
  cliente_id: z.number().int().optional(),
  centro_custo_id: z.number().int().optional(),
  documento_vinculado: z.string().optional(),
  custo_unitario: z.number().gt(0).optional(),
  emergencial: z.boolean().optional(),
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

module.exports = {
  CentroCustoSchema, AlmoxarifadoSchema, MovimentacaoSchema, RegularizacaoSchema, CancelamentoSchema,
  MaterialSchema, MaterialUpdateSchema, RequisicaoSchema, ItemRequisicaoSchema,
};
