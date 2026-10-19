/**
 * Etapa 153 (Fase 5 r3, familia 3) — o nome que o despejo das camadas da a cada handler, num modulo proprio para o controle positivo do
 * helper poder conferi-lo sem carregar o preload (que troca o `listen` do http).
 *
 *   portao:<modulos>[+configuracoes]   o portao do portaoDasPropostas (pelo `modulosDoPortao` / `caminhoDoPortao` que ele pendura)
 *   filtro:<tipo>=<modulos>,...        o filtro por tipo (`tiposDoFiltro`, Etapa 153 — o mapa inteiro, tipos em ordem alfabetica)
 *   o nome da funcao, ou <anonima>
 */
function nomeDaCamada(fn) {
  if (!fn) return '<sem handler>';
  if (fn.modulosDoPortao) return `portao:${[].concat(fn.modulosDoPortao).join('|')}${fn.caminhoDoPortao ? '+configuracoes' : ''}`;
  if (fn.tiposDoFiltro) return `filtro:${Object.keys(fn.tiposDoFiltro).sort().map((t) => `${t}=${[].concat(fn.tiposDoFiltro[t]).join('|')}`).join(',')}`;
  return fn.name || '<anonima>';
}

module.exports = { nomeDaCamada };
