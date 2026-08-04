/** Schemas Zod compartilhados do almoxarifado (padrão da fundação — ver validation.js). */
const { z } = require('zod');

const CentroCustoSchema = z.object({
  codigo: z.string().min(1, 'codigo é obrigatório'),
  nome: z.string().min(1, 'nome é obrigatório'),
  ativo: z.union([z.literal(0), z.literal(1)]).optional(),
});

module.exports = { CentroCustoSchema };
