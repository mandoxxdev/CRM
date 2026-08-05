/** Schemas Zod compartilhados do almoxarifado (padrão da fundação — ver validation.js). */
const { z } = require('zod');

const CentroCustoSchema = z.object({
  codigo: z.string().min(1, 'codigo é obrigatório'),
  nome: z.string().min(1, 'nome é obrigatório'),
  ativo: z.union([z.literal(0), z.literal(1)]).optional(),
});

const AlmoxarifadoSchema = z.object({
  codigo: z.string().min(1, 'codigo é obrigatório'),
  nome: z.string().min(1, 'nome é obrigatório'),
  descricao: z.string().optional(),
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
  familia_id: z.number().int().positive(),
  subfamilia_id: z.number().int().positive().nullable().optional(),
  descricao: z.string().nullable().optional(),
  categoria: z.string().optional(),
  unidade: z.string().optional(),
  quantidade_atual: z.number().nonnegative().optional(),
  quantidade_minima: z.number().nonnegative().optional(),
  quantidade_maxima: z.number().nonnegative().optional(),
  custo_unitario: z.number().nonnegative().optional(),
  fornecedor_principal: z.string().nullable().optional(),
  codigo_fornecedor: z.string().nullable().optional(),
  ncm: z.string().nullable().optional(),
  especificacoes: z.string().nullable().optional(),
  observacoes: z.string().nullable().optional(),
  ativo: z.union([z.literal(0), z.literal(1)]).optional(),
  descricao_tecnica: z.string().nullable().optional(),
  categoria_id: z.number().int().nullable().optional(),
  subcategoria_id: z.number().int().nullable().optional(),
  localizacao_padrao_id: z.number().int().nullable().optional(),
  fornecedor_id: z.number().int().nullable().optional(),
  tipo_material: z.string().nullable().optional(),
  material_critico: FlagSchema,
  controle_lote: FlagSchema,
  controle_certificado: FlagSchema,

  // ── Cadastro completo (Etapa 2, Task 4) ──
  fabricante: z.string().nullable().optional(),
  codigo_fabricante: z.string().nullable().optional(),
  peso_unitario: z.number().nonnegative().nullable().optional(),
  dimensoes: z.string().nullable().optional(),
  material_construtivo: z.string().nullable().optional(),
  norma: z.string().nullable().optional(),
  marca: z.string().nullable().optional(),
  modelo: z.string().nullable().optional(),
  aplicacao: z.string().nullable().optional(),
  ponto_reposicao: z.number().nonnegative().nullable().optional(),
  lote_economico: z.number().nonnegative().nullable().optional(),
  controle_serie: FlagSchema,
  controle_validade: FlagSchema,
  controle_corrida: FlagSchema,
  requer_inspecao: FlagSchema,
  requer_foto: FlagSchema,
  classe_abc: z.enum(['A', 'B', 'C']).nullable().optional(),
  unidade_compra: z.string().nullable().optional(),
  fator_conversao_compra: z.number().nullable().optional(),
  unidade_consumo: z.string().nullable().optional(),
  fator_conversao_consumo: z.number().nullable().optional(),
});

// POST — shape completo (familia_id obrigatório) + invariantes de fator de conversão.
const MaterialSchema = MaterialShape.superRefine(refineUnidadesFator);

// PUT — shape parcial (preserve-when-omitted é resolvido na rota, não aqui; ver
// routes/almoxarifado.js). .partial() precisa ser aplicado ANTES do superRefine — Zod não
// permite .partial() em cima de um schema que já carrega refinamentos (ZodEffects).
const MaterialUpdateSchema = MaterialShape.partial().superRefine(refineUnidadesFator);

module.exports = {
  CentroCustoSchema, AlmoxarifadoSchema, MovimentacaoSchema, RegularizacaoSchema, CancelamentoSchema,
  MaterialSchema, MaterialUpdateSchema,
};
