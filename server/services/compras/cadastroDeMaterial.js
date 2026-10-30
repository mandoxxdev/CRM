/**
 * Etapa 192 (RN-192.10) — a PORTA DO COMPRAS para o cadastro de material (lista, incluir, editar).
 *
 * POR QUE EXISTE: o prefixo `/api/almoxarifado` inteiro passa por `checkModulePermission('almoxarifado')`
 * (`routes/almoxarifado.js`, o `app.use` do comeco), e o comprador pode nao ter esse modulo — mesma razao da busca
 * `GET /api/compras/materiais` (Etapa 38, `routes/compras.js`). As rotas do Compras ficam sob `/api/compras/materiais/...`
 * com `checkModulePermission('compras')` e chamam os MESMOS handlers das rotas do almoxarifado (registrados lado a lado em
 * `routes/almoxarifado.js` e `routes/almoxarifado/extended.js`): mesma validacao, mesmas mensagens, nenhuma segunda copia.
 *
 * O QUE FICA DE FORA, de proposito: excluir (inativar), foto e saldo. Excluir e foto nao tem porta aqui; o saldo inicial
 * continua exigindo `movimentar` dentro do proprio handler do POST, e o PUT do Compras recusa a chave `ativo` (inativar e
 * reativar sao no Almoxarifado).
 *
 * QUEM PODE: `pode(user, acao)` — o perfil do almoxarifado que tem a acao (ADMINISTRADOR, ALMOXARIFE, ENGENHARIA) OU, desde a
 * RN-192.11, o ADMINISTRADOR DO MODULO COMPRAS (`admin_modulos` com 'compras', `isModuleAdmin`; o cadastro de usuario ja
 * oferece o botao). So nestas portas: as rotas do almoxarifado continuam lendo so o perfil (`requirePermission`).
 * Descartado: PERFIS.COMPRAS em `criar_material`/`editar_material` de ACAO_PERFIS — `editar_material` tambem guarda o DELETE
 * (inativar) e a foto do almoxarifado, e todo comprador com o perfil COMPRAS passaria a excluir e trocar foto la. Descartado
 * tambem mapear o admin do Compras para um perfil em `getPerfilFromUser` (mudaria o perfil dele no modulo inteiro). Como o
 * perfil dele nao muda, as guardas de estoque dentro do handler (saldo inicial, ligar controle, trocar dono) seguem recusando. As leituras da tela (lista, detalhe, auxiliares) exigem `criar_material` OU
 * `editar_material` — a tela e de quem cadastra; a busca somente leitura do pedido (`GET /api/compras/materiais`, Etapa 38)
 * continua aberta a todo o Compras. Quem decide e o backend; `minhasPermissoes` existe so para a tela esconder o botao antes do formulario.
 */
const { can, getPerfilFromUser } = require('../almoxarifado/permissions');
const { isModuleAdmin } = require('../systemPermissions');

const ACOES_DO_CADASTRO = ['criar_material', 'editar_material'];

function pode(user, acao) {
  // RN-192.11: "quem administra o Compras" cria e edita, nao so o almoxarife.
  if (ACOES_DO_CADASTRO.includes(acao) && isModuleAdmin(user, 'compras')) return true;
  return can(user, acao);
}

/** O mesmo corpo do 403 de `requirePermission` (o client o transforma em texto com `formatarErroPermissao`). */
function exigir(acoes) {
  const lista = Array.isArray(acoes) ? acoes : [acoes];
  return (req, res, next) => {
    if (lista.some((a) => pode(req.user, a))) return next();
    const corpo = { error: 'Sem permissão para esta operação', acao: lista[0], perfil: getPerfilFromUser(req.user) };
    if (lista.length > 1) corpo.acoes = lista;
    return res.status(403).json(corpo);
  };
}

function minhasPermissoes(user) {
  const acoes = {};
  for (const acao of ACOES_DO_CADASTRO) acoes[acao] = pode(user, acao);
  return { perfil: getPerfilFromUser(user), acoes };
}

/** O PUT do Compras nao inativa nem reativa: isso e "excluir", que fica no Almoxarifado. */
const MSG_ATIVO_NO_COMPRAS = 'Inativar ou reativar material é feito no Almoxarifado.';
function recusarAtivo(req, res, next) {
  if (req.body && req.body.ativo !== undefined) return res.status(400).json({ error: MSG_ATIVO_NO_COMPRAS });
  return next();
}

/**
 * Os middlewares das portas do Compras. As rotas sao registradas com o caminho LITERAL em `routes/almoxarifado.js` e
 * `routes/almoxarifado/extended.js` (as reguas de fonte das Etapas 148-154 leem os registros de rota e exigem caminho que e
 * texto literal), cada uma logo depois da rota do almoxarifado cujo handler reaproveita:
 *   leitura: `...porta.leitura, listarMateriais`; escrita: `...porta.escrita('criar_material'), validate(...), criarMaterial`.
 */
function criarPortaCompras({ authenticateToken, checkModulePermission }) {
  // Sem `checkModulePermission` (o mesmo caso do `almoxMiddleware`), so a autenticacao — o perfil continua decidindo.
  const base = checkModulePermission ? [authenticateToken, checkModulePermission('compras')] : [authenticateToken];
  return {
    base,
    leitura: [...base, exigir(ACOES_DO_CADASTRO)],
    escrita: (acao) => [...base, exigir(acao)],
    responderMinhasPermissoes: (req, res) => res.json(minhasPermissoes(req.user)),
  };
}

module.exports = { ACOES_DO_CADASTRO, pode, exigir, minhasPermissoes, recusarAtivo, MSG_ATIVO_NO_COMPRAS, criarPortaCompras };
