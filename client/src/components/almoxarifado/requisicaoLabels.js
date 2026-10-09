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

// Etapa 94 (T2c, B460): o legado com material na caixa num status pré-separação — o desvio de antes da 94 +
// aprovação por valor deixava *Totalmente Reservada* com tudo separado. O servidor aceita "Iniciar Separação" sem
// quantidade, mas o modal desabilitava o botão (nada a separar). Espelho de `STATUS_PRE_SEPARACAO` e
// `separacaoAReabrir` de `server/services/almoxarifado/requisitionStateMachine.js` (a fila usa o mesmo predicado),
// conferido por teste (`RequisicoesReabrirSeparacao.test.js`, (e)). Mudou aqui, mude lá.
export const STATUS_PRE_SEPARACAO = Object.freeze([
  'APROVADO', 'AGUARDANDO_ESTOQUE', 'AGUARDANDO_COMPRA', 'PARCIALMENTE_RESERVADA', 'TOTALMENTE_RESERVADA',
]);
export const separacaoAReabrir = (status, itens) => STATUS_PRE_SEPARACAO.includes(status)
  && (itens || []).some((i) => (Number(i.quantidade_separada) || 0)
    - (Number(i.quantidade_entregue ?? i.quantidade_atendida) || 0) > 1e-9);

// Etapa 98 (T4, B502): os status em que a tela oferece **Devolver à prateleira** no item com caixa (separado −
// entregue > 0). Espelho de `STATUS_COM_CAIXA` de `server/services/almoxarifado/requisitionStateMachine.js`
// (lá derivado de PODE_SEPARAR + PODE_ENTREGAR + aprovação de valor), que a rota
// `PUT /api/almoxarifado/requisicoes/:id/devolver-separado` usa para recusar (D1). Conferido como conjunto por
// teste de API (`server/tests/api/devolverListaTelaRota.api.test.js`). Mudou lá, mude aqui.
export const STATUS_COM_CAIXA = Object.freeze([
  'APROVADO', 'AGUARDANDO_ESTOQUE', 'AGUARDANDO_COMPRA', 'PARCIALMENTE_RESERVADA', 'TOTALMENTE_RESERVADA',
  'EM_SEPARACAO', 'PARCIALMENTE_ATENDIDA', 'PRONTA_PARA_RETIRADA', 'AGUARDANDO_APROVACAO_VALOR',
]);

export default TIPO_REQUISICAO_LABELS;
