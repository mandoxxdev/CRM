/**
 * Etapa 192 (RN-192.10) — a PORTA DO COMPRAS para o cadastro de material (lista, incluir, editar).
 *
 * POR QUE EXISTE: o prefixo `/api/almoxarifado` inteiro passa por `checkModulePermission('almoxarifado')`
 * (`routes/almoxarifado.js`, o `app.use` do comeco), e o comprador pode nao ter esse modulo — mesma razao da busca
 * `GET /api/compras/materiais` (Etapa 38, `routes/compras.js`). As rotas do Compras ficam sob `/api/compras/materiais/...`
 * com `checkModulePermission('compras')` e chamam os MESMOS handlers das rotas do almoxarifado (registrados lado a lado em
 * `routes/almoxarifado.js` e `routes/almoxarifado/extended.js`): mesma validacao, mesmas mensagens, nenhuma segunda copia.
 *
 * Desde a Etapa 193 (RN-193.04) o Compras ganhou foto e inativar/reativar (DELETE e PUT `ativo`) pelos mesmos handlers.
 *
 * O QUE FICA DE FORA, de proposito: saldo. O saldo inicial e recusado na porta (400, Fase 5 X1 — abaixo).
 *
 * QUEM PODE (Etapa 193, RN-193.03): `pode(user, acao)` — SO o ADMINISTRADOR DO MODULO COMPRAS (`admin_modulos` com 'compras',
 * `isModuleAdmin`; o cadastro de usuario ja oferece o botao) e os administradores do sistema (superadmin, role admin —
 * `isSystemAdmin`). Ate a 192 o perfil do almoxarifado que tinha a acao (ADMINISTRADOR, ALMOXARIFE, ENGENHARIA) tambem
 * entrava; com o cadastro so no Compras ("almoxarifado so visualiza e libera"), deixou de entrar (decisao B, reversivel:
 * voltar o `can(user, acao)` em `pode`). Descartado manter o admin do MODULO almoxarifado: e quem administra o almoxarifado,
 * que agora so consulta o cadastro.
 * Descartado: PERFIS.COMPRAS em `criar_material`/`editar_material` de ACAO_PERFIS — `editar_material` tambem guarda o DELETE
 * (inativar) e a foto do almoxarifado, e todo comprador com o perfil COMPRAS passaria a excluir e trocar foto la. Descartado
 * tambem mapear o admin do Compras para um perfil em `getPerfilFromUser` (mudaria o perfil dele no modulo inteiro). As guardas de estoque
 * dentro do handler (ligar controle, trocar dono) rodam com o usuario no perfil COMPRAS (`comoCompras`, Fase 5 X1) e recusam. As leituras da tela (lista, detalhe, auxiliares) exigem `criar_material` OU
 * `editar_material` — a tela e de quem cadastra; a busca somente leitura do pedido (`GET /api/compras/materiais`, Etapa 38)
 * continua aberta a todo o Compras. Quem decide e o backend; `minhasPermissoes` existe so para a tela esconder o botao antes do formulario.
 */
const { getPerfilFromUser } = require('../almoxarifado/permissions');
const { isModuleAdmin, isSystemAdmin, parseAdminModulos } = require('../systemPermissions');
const { temSaldoInicial } = require('../almoxarifado/materialService');

const ACOES_DO_CADASTRO = ['criar_material', 'editar_material'];

function pode(user, acao) {
  // RN-193.03: so quem administra o Compras (ou o sistema). O perfil do almoxarifado nao entra mais.
  if (!ACOES_DO_CADASTRO.includes(acao)) return false;
  return isModuleAdmin(user, 'compras') || isSystemAdmin(user);
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

/** Etapa 193 (RN-193.04): ate a 192 o PUT do Compras recusava `ativo` ("Inativar ou reativar material e feito no Almoxarifado."); a
 * recusa saiu porque inativar/reativar passou a ser do Compras (as regras sao as do handler). */

/**
 * Etapa 192 Fase 5 (X1): a porta do Compras NUNCA mexe em estoque nem nos controles de estoque. A revisao achou o comprador com o
 * modulo Compras e um perfil do almoxarifado que sobrou (ALMOXARIFE, ADMINISTRADOR) — sem o modulo almoxarifado — lancando saldo
 * inicial (uma ENTRADA no estoque) e ligando lote / trocando dono com historico por aqui: as guardas do handler compartilhado
 * liam o perfil dele.
 *
 * Duas pecas, depois da porta (`exigir`, que continua lendo o usuario de verdade — quem entra nao muda):
 *  - `recusarSaldoInicial` (POST): saldo inicial -> 400 para TODOS, superadmin inclusive (o saldo e uma Entrada; e lancado no
 *    Almoxarifado, onde o movimentar dele vale).
 *  - `comoCompras` (POST e PUT): o handler roda com uma COPIA do usuario no perfil COMPRAS — sem superadmin, sem `role` admin, sem
 *    administrar o almoxarifado e sem o perfil dele —, entao as guardas de dentro (`movimentar`, `ajustar_estoque`,
 *    `ajustar_material_cliente`) recusam e a mensagem diz "seu perfil: COMPRAS". id, nome e email ficam (auditoria e trilha
 *    gravam a pessoa de verdade). O superadmin e o role admin tambem caem: o gesto de estoque deles e no Almoxarifado, que eles
 *    tem; aqui, so cadastro.
 * Descartado: o fallback PRODUCAO (a mensagem diria "seu perfil: PRODUCAO" a quem e almoxarife ou administrador — enganoso) e
 * recusar o PUT de controle/dono com 400 proprio (duplicaria as reguas de "tem saldo nao identificado"/"tem historico" que o
 * handler ja calcula; ligar lote em material SEM saldo continua sendo cadastro).
 */
const MSG_SALDO_INICIAL_NO_COMPRAS = 'Saldo inicial é lançado no Almoxarifado.';
function recusarSaldoInicial(req, res, next) {
  if (temSaldoInicial(req.body)) return res.status(400).json({ error: MSG_SALDO_INICIAL_NO_COMPRAS });
  return next();
}

function usuarioDoCompras(user) {
  if (!user) return user;
  const adminModulos = parseAdminModulos(user.admin_modulos).filter((m) => m !== 'almoxarifado');
  return {
    ...user,
    is_superadmin: 0,
    isSuperAdmin: false,
    role: String(user.role || '').toLowerCase() === 'admin' ? 'usuario' : user.role,
    admin_modulos: adminModulos,
    perfil_almoxarifado: 'COMPRAS',
  };
}
function comoCompras(req, res, next) {
  req.user = usuarioDoCompras(req.user);
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
    escrita: (acao) => [...base, exigir(acao), ...(acao === 'criar_material' ? [recusarSaldoInicial] : []), comoCompras],
    responderMinhasPermissoes: (req, res) => res.json(minhasPermissoes(req.user)),
  };
}

module.exports = {
  ACOES_DO_CADASTRO, pode, exigir, minhasPermissoes, criarPortaCompras,
  recusarSaldoInicial, MSG_SALDO_INICIAL_NO_COMPRAS, usuarioDoCompras, comoCompras,
};
