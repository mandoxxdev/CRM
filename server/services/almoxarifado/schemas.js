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

module.exports = { CentroCustoSchema, AlmoxarifadoSchema, MovimentacaoSchema, RegularizacaoSchema, CancelamentoSchema };
