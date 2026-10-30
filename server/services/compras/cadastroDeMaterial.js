/**
 * Etapa 192 (RN-192.10) — a PORTA DO COMPRAS para o cadastro de material (lista, incluir, editar).
 *
 * POR QUE EXISTE: o prefixo `/api/almoxarifado` inteiro passa por `checkModulePermission('almoxarifado')`
 * (`routes/almoxarifado.js`, o `app.use` do comeco), e o comprador pode nao ter esse modulo — mesma razao da busca
 * `GET /api/compras/materiais` (Etapa 38, `routes/compras.js`). As rotas do Compras ficam sob `/api/compras/materiais/...`
 * com `checkModulePermission('compras')` e chamam os MESMOS handlers das rotas do almoxarifado (registrados lado a lado em
 * `routes/almoxarifado.js` e `routes/almoxarifado/extended.js`): mesma validacao, mesmas mensagens, nenhuma segunda copia.
 *
 * Desde a Etapa 193 (RN-193.01..04) o cadastro e SO do Compras: as escritas de cadastro do almoxarifado (PUT, DELETE, foto)
 * recusam com `recusarCadastroNoAlmoxarifado` (403, abaixo) e o Compras ganhou foto e inativar/reativar (DELETE e PUT `ativo`)
 * pelos mesmos handlers. O `POST /api/almoxarifado/materiais` fica: a sobra (retalho) e a remessa criam material na operacao.
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

/**
 * Etapa 193 (RN-193.02): as escritas de CADASTRO do almoxarifado (`PUT /api/almoxarifado/materiais/:id`, `DELETE` e a foto)
 * recusam para TODOS, superadmin inclusive — o cadastro e feito em Compras -> Materiais. Antes do `requirePermission` e do
 * multer (a foto recusada nao chega ao disco). Ate a 192 o PUT do Compras recusava `ativo` ("Inativar ou reativar material e
 * feito no Almoxarifado."); a recusa saiu porque inativar/reativar mudou de lado.
 * Descartado: recusar tambem o `POST /api/almoxarifado/materiais` — a sobra (retalho, `SobrasAlmoxarifado`) e a remessa para
 * terceiros criam material na operacao por ele; nao sao o "cadastro" que saiu do almoxarifado.
 *
 * CHAVE DE REVERSAO (letra B): `ALMOX_CADASTRO_MATERIAL=liberado` no ambiente devolve as tres rotas ao que eram ate a 192 (o
 * perfil do almoxarifado decide, `requirePermission('editar_material')`, que continua na corrente logo depois desta recusa) — sem
 * deploy, e o boot avisa. Mesmo molde do `PROPOSTAS_PORTAO_DE_MODULO=desligado` (Etapa 148, B946). Existe porque so a porta do
 * almoxarifado alcanca as guardas de estoque do handler para quem pode (ligar lote/serie em material com saldo nao identificado e
 * desligar a serie com series presentes exigem `ajustar_estoque`; trocar o dono de material com historico exige
 * `ajustar_material_cliente`) — pela porta do Compras o handler roda no perfil COMPRAS (B72) e sempre recusa. Com a chave
 * desligada (o padrao), esses tres gestos ficam sem porta (letra C, RN-193.06). Os testes dessas guardas ligam a chave.
 * Lida a cada pedido (o teste liga e desliga no mesmo processo).
 */
const MSG_CADASTRO_NO_COMPRAS = 'O cadastro de material é feito em Compras → Materiais.';
function cadastroNoAlmoxarifadoLiberado() {
  return String(process.env.ALMOX_CADASTRO_MATERIAL || '').trim().toLowerCase() === 'liberado';
}
function recusarCadastroNoAlmoxarifado(req, res, next) {
  if (cadastroNoAlmoxarifadoLiberado()) return next();
  return res.status(403).json({ error: MSG_CADASTRO_NO_COMPRAS });
}

/**
 * Etapa 193 Fase 5 (R3b): o `POST /api/almoxarifado/materiais` ficou porque a sobra (retalho) e a remessa criam material na
 * operacao — mas aceitava o cadastro inteiro (NCM, custo, fornecedor, controles, saldo inicial) de Almoxarife e Engenharia, por
 * fora do Compras. Agora so o formato da operacao, medido nos dois chamadores do client (SobrasAlmoxarifado
 * `cadastrarMaterialDoRetalho` e RemessasTerceirosAlmoxarifado `cadastrarMaterialResultante`): codigo, codigo_auto, nome,
 * unidade, familia_id/subfamilia_id (`familiaDoNovoMaterial`), proprietario_cliente_id (copiado da origem) e categoria (so a
 * sobra). Chave fora da lista com valor (null/'' contam como ausentes) -> 403 com a mensagem do cadastro e a lista do que veio,
 * para todos (superadmin inclusive), antes do perfil — o mesmo molde de `recusarCadastroNoAlmoxarifado`, com a mesma chave de
 * reversao. Descartado IGNORAR as chaves a mais: quem chama pela API acharia que o NCM/custo foi gravado. O dono continua aceito
 * (a sobra e a remessa o copiam da origem; o retalho de outro dono e recusado em `gerarRetalho`, `assertMesmoDonoNoRetalho`).
 */
const CAMPOS_DO_MATERIAL_DA_OPERACAO = ['codigo', 'codigo_auto', 'nome', 'unidade', 'familia_id', 'subfamilia_id',
  'proprietario_cliente_id', 'categoria'];
const mensagemCriacaoSoDaOperacao = (veio) => `${MSG_CADASTRO_NO_COMPRAS} Pelo Almoxarifado, o material novo da sobra ou da `
  + `remessa leva só código, nome, unidade, família, subfamília, categoria e proprietário (veio também: ${veio.join(', ')}).`;
function restringirCriacaoNoAlmoxarifado(req, res, next) {
  if (cadastroNoAlmoxarifadoLiberado()) return next();
  const corpo = req.body && typeof req.body === 'object' ? req.body : {};
  const veio = Object.keys(corpo).filter((k) => !CAMPOS_DO_MATERIAL_DA_OPERACAO.includes(k) && corpo[k] !== null && corpo[k] !== '');
  if (veio.length > 0) return res.status(403).json({ error: mensagemCriacaoSoDaOperacao(veio) });
  return next();
}

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
  // Etapa 193 Fase 5 (R1): o handler compartilhado sabe que veio pelo Compras (desligar lote/serie com historico -> 400).
  req.portaDoCompras = true;
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
  recusarCadastroNoAlmoxarifado, MSG_CADASTRO_NO_COMPRAS, cadastroNoAlmoxarifadoLiberado,
  restringirCriacaoNoAlmoxarifado, CAMPOS_DO_MATERIAL_DA_OPERACAO,
  recusarSaldoInicial, MSG_SALDO_INICIAL_NO_COMPRAS, usuarioDoCompras, comoCompras,
};
