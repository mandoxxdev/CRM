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
 */

const ADM = 'administrativo';
const IND = 'industrial';

const MODULOS_SISTEMA = [
  { chave: 'comercial', tipoPadrao: ADM, ordemTipo: 1, aceitaAdminDeModulo: true },
  { chave: 'compras', tipoPadrao: ADM, ordemTipo: 2, aceitaAdminDeModulo: true },
  { chave: 'financeiro', tipoPadrao: ADM, ordemTipo: 3, aceitaAdminDeModulo: true },
  { chave: 'operacional', tipoPadrao: IND, ordemTipo: 4, aceitaAdminDeModulo: true },
  { chave: 'engenharia', tipoPadrao: ADM, ordemTipo: 5, aceitaAdminDeModulo: true },
  { chave: 'engenharia_projetos', tipoPadrao: ADM, ordemTipo: 6, aceitaAdminDeModulo: true },
  { chave: 'almoxarifado', tipoPadrao: ADM, ordemTipo: 7, aceitaAdminDeModulo: true },
  { chave: 'frota', tipoPadrao: IND, ordemTipo: 10, aceitaAdminDeModulo: true },
  { chave: 'todolist', tipoPadrao: ADM, ordemTipo: 11, aceitaAdminDeModulo: false },
  { chave: 'relatorios', tipoPadrao: null, ordemTipo: null, aceitaAdminDeModulo: true },
  { chave: 'administrativo', tipoPadrao: ADM, ordemTipo: 8, aceitaAdminDeModulo: true },
  { chave: 'admin', tipoPadrao: ADM, ordemTipo: 9, aceitaAdminDeModulo: true },
];

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

module.exports = { MODULOS_SISTEMA, chavesComAdminDeModulo, tiposPadrao, TIPO_ADMINISTRATIVO: ADM, TIPO_INDUSTRIAL: IND };
