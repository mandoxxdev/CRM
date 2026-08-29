// Fuso fixo para TODA a suíte do cliente.
//
// Por que isto existe (achado A1 da revisão adversarial da Etapa 22, reproduzido): o teste da
// tela de auditoria fazia `process.env.TZ = 'America/Sao_Paulo'` no topo do arquivo, com o
// comentário "Node reconfigura o V8 ao setar process.env.TZ". **Isso é falso sob Jest**: quando
// o processo já tem TZ definido no ambiente, a atribuição em runtime é no-op — o V8 já resolveu
// o fuso. Medido:
//
//   sem TZ externo   -> process.env.TZ = America/Sao_Paulo, offset = 180, resolved = America/Sao_Paulo
//   com TZ=UTC       -> process.env.TZ = America/Sao_Paulo, offset = 0,   resolved = UTC
//
// Parecia funcionar só porque esta máquina já é -03. Com `TZ=UTC` — o default da maioria dos
// contêineres, e justamente o ambiente que a RN-04 desta etapa existe para tratar — a suíte do
// cliente ficava VERMELHA (1 de 15 cenários), e o placar "546/546" valia só nesta máquina.
//
// O `globalSetup` roda ANTES de o Jest forkar os workers, e cada worker herda este `process.env`
// — então aqui a atribuição vale de verdade. Fica antes de qualquer `Date` ser construído.
//
// O fuso é o do NEGÓCIO (site único, no Brasil), o mesmo `FUSO_PADRAO` que
// `server/services/almoxarifado/auditFiltros.js` usa para recortar o dia. Se um dia o cliente
// tiver operação em outro fuso, os dois mudam juntos.
module.exports = () => {
  process.env.TZ = 'America/Sao_Paulo';
};
