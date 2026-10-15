/**
 * Etapa 109 (G7, RN-109.10) — a lista de modulos do sistema no SERVIDOR, uma fonte so.
 *
 * Ate a 108 o servidor tinha duas listas escritas a mao: `MODULE_ADMIN_KEYS` (systemPermissions.js,
 * filtra `admin_modulos` ao salvar usuario) e `DEFAULT_MODULOS_TIPO` (modulosTipoConfigService.js,
 * semeia `modulos_tipo_config`). As duas saem daqui, com os MESMOS valores e a MESMA ordem de antes
 * (`tests/api/modulosClienteServidor.api.test.js` confere contra os literais antigos).
 *
 * As diferencas entre as duas sao DE PROPOSITO e ficaram como estavam (B60 de
 * docs/compras-novidades-por-etapa.md):
 *  - `todolist` tem tipo mas NAO aceita admin de modulo (o cadastro de usuario oferece o botao e o
 *    servidor descarta calado; ligar aqui passaria a gravar uma permissao que hoje nao e gravada);
 *  - `relatorios` aceita admin de modulo mas NAO tem tipo (nao e modulo com tela; existe porque o
 *    cadastro de usuario o concede).
 *
 * A lista do cliente e `client/src/constants/modulosMeta.js`; cliente e servidor nao compartilham
 * codigo, e o teste acima le a do cliente e falha se as duas divergirem.
 *
 * Ordem: a do array e a de `MODULE_ADMIN_KEYS`; `ordemTipo` e a ordem das chaves de
 * `DEFAULT_MODULOS_TIPO` (preservada — so semeia, mas a caracterizacao a prende).
 *
 * Etapa 111 (G17, RN-111.01): `nome` e o nome do modulo no log de auditoria (`logs_auditoria.nome_modulo`)
 * e na tela de acesso negado do cliente (`NOMES_MODULO` de modulosMeta.js — o teste cruzado confere as duas).
 * Admin e "Administração" aqui, nao "Admin" (o cartao da selecao): e o nome que o log sempre gravou (B62).
 */

const ADM = 'administrativo';
const IND = 'industrial';

const MODULOS_SISTEMA = [
  { chave: 'comercial', nome: 'Comercial', tipoPadrao: ADM, ordemTipo: 1, aceitaAdminDeModulo: true },
  { chave: 'compras', nome: 'Compras', tipoPadrao: ADM, ordemTipo: 2, aceitaAdminDeModulo: true },
  { chave: 'financeiro', nome: 'Financeiro', tipoPadrao: ADM, ordemTipo: 3, aceitaAdminDeModulo: true },
  { chave: 'operacional', nome: 'Operacional', tipoPadrao: IND, ordemTipo: 4, aceitaAdminDeModulo: true },
  { chave: 'engenharia', nome: 'Cálculos de Engenharia', tipoPadrao: ADM, ordemTipo: 5, aceitaAdminDeModulo: true },
  { chave: 'engenharia_projetos', nome: 'Engenharia / Projetos', tipoPadrao: ADM, ordemTipo: 6, aceitaAdminDeModulo: true },
  { chave: 'almoxarifado', nome: 'Almoxarifado', tipoPadrao: ADM, ordemTipo: 7, aceitaAdminDeModulo: true },
  { chave: 'frota', nome: 'Frota', tipoPadrao: IND, ordemTipo: 10, aceitaAdminDeModulo: true },
  { chave: 'todolist', nome: 'TODOLIST', tipoPadrao: ADM, ordemTipo: 11, aceitaAdminDeModulo: false },
  { chave: 'relatorios', nome: 'Relatórios', tipoPadrao: null, ordemTipo: null, aceitaAdminDeModulo: true },
  { chave: 'administrativo', nome: 'Administrativo', tipoPadrao: ADM, ordemTipo: 8, aceitaAdminDeModulo: true },
  { chave: 'admin', nome: 'Administração', tipoPadrao: ADM, ordemTipo: 9, aceitaAdminDeModulo: true },
];

/**
 * Etapa 111 (G17, RN-111.08): o que `checkModulePermission`/`checkAnyModulePermission` (index.js) liberam ao
 * usuario sem permissao direta e SEM GRUPO ATIVO nenhum. Regra de antes, so nomeada. Diverge do cliente (o portao
 * de rota libera tambem frota a quem nao tem nenhuma linha; a selecao, so comercial — e "sem linha" nao e "sem
 * grupo": quem esta num grupo sem a linha nao ganha nem comercial aqui). Alinhar muda quem acessa o que — decisao
 * do P.O. (B63); o teste cruzado congela as tres.
 */
const MODULOS_LIBERADOS_SEM_GRUPO = ['comercial'];

/** As chaves em que o servidor grava "administrador do modulo" (antigo MODULE_ADMIN_KEYS). */
function chavesComAdminDeModulo() {
  return MODULOS_SISTEMA.filter((m) => m.aceitaAdminDeModulo).map((m) => m.chave);
}

/** `{ chave: tipo }` dos modulos com tipo de setor (antigo DEFAULT_MODULOS_TIPO). */
function tiposPadrao() {
  return Object.fromEntries(
    MODULOS_SISTEMA.filter((m) => m.tipoPadrao)
      .sort((a, b) => a.ordemTipo - b.ordemTipo)
      .map((m) => [m.chave, m.tipoPadrao])
  );
}

/**
 * Nome do modulo para o log (RN-111.01/02). Chave desconhecida volta crua (como o mapa antigo do
 * index.js); a combinacao do checkAnyModulePermission ('a|b') vira os nomes unidos por " ou ".
 */
function nomeDoModulo(chave) {
  if (chave == null) return chave;
  return String(chave).split('|').map((k) => {
    const m = MODULOS_SISTEMA.find((x) => x.chave === k);
    return m ? m.nome : k;
  }).join(' ou ');
}

module.exports = { MODULOS_SISTEMA, MODULOS_LIBERADOS_SEM_GRUPO, nomeDoModulo, chavesComAdminDeModulo, tiposPadrao, TIPO_ADMINISTRATIVO: ADM, TIPO_INDUSTRIAL: IND };
