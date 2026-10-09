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

// Etapa 92 (B434, B440, C149): os status em que a tela de requisições mostra **Cancelar Requisição**.
// Fora do modo almoxarifado a tela chama `PUT /api/requisicoes-material/:id/cancelar`, que aceita
// exatamente estes seis — a lista do servidor é `CANCELAVEIS_OUTROS_MODULOS`
// (`server/services/almoxarifado/requisitionStateMachine.js`), conferida contra esta por teste de API
// (`server/tests/api/cancelarListaTelaRota.api.test.js`, RN-07). Mudou aqui, mude lá.
export const STATUS_CANCELAVEIS_OUTROS_MODULOS = Object.freeze([
  'PENDENTE', 'APROVADO', 'AGUARDANDO_ESTOQUE', 'AGUARDANDO_COMPRA',
  'PARCIALMENTE_RESERVADA', 'TOTALMENTE_RESERVADA',
]);

// No modo almoxarifado (`PUT /api/almoxarifado/requisicoes/:id/cancelar`) entra também o rascunho.
export const STATUS_CANCELAVEIS_ALMOXARIFADO = Object.freeze(['RASCUNHO', ...STATUS_CANCELAVEIS_OUTROS_MODULOS]);

export default TIPO_REQUISICAO_LABELS;
