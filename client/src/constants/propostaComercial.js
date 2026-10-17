/** Opções compartilhadas — cadastro de propostas e gráficos do dashboard comercial */

export const STATUS_PROPOSTA = [
  { value: 'rascunho', label: 'Rascunho' },
  { value: 'desconto_aprovado', label: 'Desconto aprovado' },
  { value: 'enviada', label: 'Enviada' },
  { value: 'aprovada', label: 'Aprovada (ganha)' },
  { value: 'rejeitada', label: 'Perdida / Rejeitada' }
];

/**
 * Etapa 140 (RN-140.12b, C301): as opções do seletor de status do formulário. "Desconto aprovado" só é dado pela aprovação do desconto
 * (Comercial → Aprovações) — o servidor recusa entrar nele pelo salvar. Antes o seletor o oferecia sempre: numa rascunho com 10% sem
 * aprovação, escolher "Desconto aprovado", salvar e Enviar mandava a proposta. A opção fica visível e desabilitada, para quem lê o
 * status entender que ele existe; habilitada só quando a proposta GRAVADA já está nele (o formulário manda o status de novo ao salvar).
 */
export function opcoesStatusProposta(statusGravado) {
  return STATUS_PROPOSTA.map((s) => (
    s.value === 'desconto_aprovado' && statusGravado !== 'desconto_aprovado'
      ? { ...s, disabled: true, title: 'Dado pela aprovação do desconto, em Comercial → Aprovações' }
      : { ...s, disabled: false }
  ));
}

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
