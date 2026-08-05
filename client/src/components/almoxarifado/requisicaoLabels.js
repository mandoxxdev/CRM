// Etapa 3 (design, seção "Dados"): 14 valores fixos de tipo_requisicao — labels amigáveis
// só existem no client (server trata como enum de texto puro). Módulo compartilhado entre
// RequisicoesList.js (filtro/coluna), RequisicaoForm.js e RequisicaoMaterialCesta.js
// (campo Tipo na criação) para não duplicar o mapa em três arquivos.
export const TIPO_REQUISICAO_LABELS = {
  CONSUMO: 'Consumo',
  ORDEM_PRODUCAO: 'Ordem de Produção',
  ORDEM_SERVICO: 'Ordem de Serviço',
  PROJETO: 'Projeto',
  MONTAGEM: 'Montagem',
  INSTALACAO_EXTERNA: 'Instalação Externa',
  ASSISTENCIA_TECNICA: 'Assistência Técnica',
  MANUTENCAO: 'Manutenção',
  DESENVOLVIMENTO: 'Desenvolvimento',
  ADMINISTRATIVO: 'Administrativo',
  EMERGENCIAL: 'Emergencial',
  FERRAMENTA: 'Ferramenta',
  EPI: 'EPI',
  MATERIAL_CLIENTE: 'Material do Cliente',
};

export default TIPO_REQUISICAO_LABELS;
