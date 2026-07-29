/** Opções compartilhadas — cadastro de propostas e gráficos do dashboard comercial */

export const STATUS_PROPOSTA = [
  { value: 'rascunho', label: 'Rascunho' },
  { value: 'desconto_aprovado', label: 'Desconto aprovado' },
  { value: 'enviada', label: 'Enviada' },
  { value: 'aprovada', label: 'Aprovada (ganha)' },
  { value: 'rejeitada', label: 'Perdida / Rejeitada' }
];

/** Status em que o documento automático (olho/PDF) ainda não está liberado */
export const STATUS_SEM_DOCUMENTO = ['rascunho', 'desconto_aprovado'];

/** Status a partir dos quais a proposta pode ser enviada ao cliente */
export const STATUS_PODE_ENVIAR = ['rascunho', 'desconto_aprovado'];

export const ORIGENS_BUSCA = [
  'Google',
  'LinkedIn',
  'Facebook',
  'Instagram',
  'Indicação',
  'Feira/Evento',
  'Site Próprio',
  'Outros'
];

export const MOTIVOS_NAO_VENDA = [
  'Preço Alto',
  'Prazo Inadequado',
  'Não Atende Necessidade',
  'Concorrência',
  'Orçamento Cancelado',
  'Outros'
];

export const REGIOES_BUSCA = [
  'Norte',
  'Nordeste',
  'Centro-Oeste',
  'Sudeste',
  'Sul'
];

export const FAMILIAS_PRODUTO_PADRAO = [
  'Moinhos',
  'Masseiras',
  'Agitadores',
  'Dispersores',
  'Silos',
  'Tanques de armazenamento',
  'Unidade derivadora de Dosagem',
  'Estação de Aditivos',
  'Equipamentos de Envase',
  'Equipamentos á Vácuo',
  'Outros'
];

export const STATUS_EXIGE_MOTIVO = ['rejeitada'];
