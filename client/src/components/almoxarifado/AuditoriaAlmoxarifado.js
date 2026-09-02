import React, { useState, useEffect, useCallback, useMemo } from 'react';
import api from '../../services/api';
import { toast } from 'react-toastify';
import { FiShield, FiRefreshCw, FiChevronDown, FiChevronUp, FiAlertTriangle } from 'react-icons/fi';
import { SkeletonTable } from '../SkeletonLoader';
import { useAlmoxPermissoes } from '../../hooks/useAlmoxPermissoes';
import { formatarErroPermissao } from '../../utils/permissaoErro';
import './Almoxarifado.css';

/**
 * Etapa 22, Task 3 — tela `/almoxarifado/auditoria` contra os contratos congelados C1 e C2 do
 * plano (docs/superpowers/plans/2026-08-28-almoxarifado-etapa22-tela-de-auditoria.md; design
 * docs/superpowers/specs/2026-08-28-almoxarifado-etapa22-tela-de-auditoria-design.md).
 *
 * ESTA TELA NÃO TRADUZ NADA E NÃO CALCULA DE/PARA. Cada item do C1 já vem com `acao_rotulo`,
 * `entidade_rotulo` e `alteracoes: [{ campo, de, para }]` prontos do servidor — é a correção do
 * achado A9 da revisão. Se alguém for tentado a montar aqui um mapa de verbo→rótulo ou a
 * comparar `dados_anteriores` com `dados_novos`, o lugar de mexer é
 * `server/services/almoxarifado/auditLabels.js`: a régua de leitura tem UM dono e é testável
 * sem React. Um segundo mapa aqui divergiria do primeiro na primeira etapa que criar um verbo.
 *
 * As duas armadilhas específicas desta tela, as duas medidas:
 *
 * 1. `acao` vai como STRING COM VÍRGULAS, nunca array (achado A5). `services/api.js` é um
 *    `axios.create()` SEM `paramsSerializer`, então um array vira `acao[]=A&acao[]=B`, o parser
 *    `extended` do Express entrega array em `req.query.acao` e a rota estoura 500. Um grupo de
 *    sinônimos (RN-06: `CRIACAO`+`CRIAR` = "Criação") vira `acao=CRIACAO,CRIAR`.
 *
 * 2. `created_at` do SQLite vem em UTC SEM SUFIXO (`'2026-08-29 01:30:00'`) — sem o `'Z'` o V8
 *    lê como hora local e mostra o DIA ERRADO (29/08 01:30 em vez de 28/08 22:30). Mesmo
 *    antídoto de `AlertasAlmoxarifado.js:62-77`. Numa tela cuja pergunta é "quem mexeu nisto
 *    ONTEM", errar o dia é defeito de correção, não de formatação.
 *
 * Vocabulário da tela, que também é decisão de conteúdo (é uma trilha de auditoria):
 * - lista vazia diz "nenhum registro PARA OS FILTROS APLICADOS" — "não há registros" pareceria
 *   prova de que nada aconteceu;
 * - `alteracoes: []` diz "sem detalhes registrados" (há call sites que gravam nenhum dos dois
 *   lados, `receiptService.js:236-239`) — área em branco pareceria bug da tela;
 * - `truncado: true` mostra o corte com o total (a Etapa 18 fez a rota declarar o corte
 *   justamente para isto);
 * - o que vier `'(alterado)'` é exibido assim (RN-08) — a tela não embeleza segredo, e o lugar
 *   de consertar segredo cru seria a ESCRITA, não a leitura.
 */

// Mesmo painel de erro por estado das etapas 11/16 — um 403 de perfil ou um 400 de data
// inválida NUNCA pode virar "nenhum registro": numa auditoria essa é a resposta errada mais
// perigosa, porque parece prova de que nada aconteceu.
const PainelErroCarga = ({ mensagem, onTentarNovamente }) => (
  <div
    style={{
      marginBottom: 16,
      padding: '14px 18px',
      borderRadius: 10,
      border: '1px solid rgba(239, 68, 68, 0.35)',
      background: 'rgba(239, 68, 68, 0.08)',
      color: 'var(--gmp-text)',
      display: 'flex',
      alignItems: 'flex-start',
      justifyContent: 'space-between',
      gap: 16,
      flexWrap: 'wrap',
    }}
  >
    <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
      <FiAlertTriangle size={18} style={{ color: '#ef4444', flexShrink: 0, marginTop: 2 }} />
      <div>
        <strong style={{ display: 'block', marginBottom: 4 }}>Dados indisponíveis no momento</strong>
        <span style={{ fontSize: '0.9rem', color: 'var(--gmp-text-light)' }}>{mensagem}</span>
      </div>
    </div>
    {onTentarNovamente && (
      <button type="button" className="btn-almox-secondary" onClick={onTentarNovamente}>
        <FiRefreshCw size={14} /> Tentar novamente
      </button>
    )}
  </div>
);

// `created_at` é DATETIME do SQLite: "YYYY-MM-DD HH:MM:SS" em UTC e SEM sufixo. Sem o 'Z' o V8
// interpreta como hora local — ver o cabeçalho (armadilha 2). Data e HORA porque a pergunta da
// trilha é "quem mexeu nisto e quando", e a hora separa dois atos do mesmo dia.
const formatDataHora = (d) => {
  if (!d) return '—';
  const iso = typeof d === 'string' && d.includes(' ') && !d.includes('T') ? `${d.replace(' ', 'T')}Z` : d;
  const dt = new Date(iso);
  if (Number.isNaN(dt.getTime())) return String(d); // valor estragado aparece cru, não some
  return dt.toLocaleString('pt-BR', {
    day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit',
  });
};

// `de`/`para` chegam CRUS do servidor (decisão registrada no C3: número continua número,
// `false` continua `false`) — a coerção para texto acontece AQUI, na borda de renderização.
// `0` e `false` NÃO viram travessão: numa auditoria, "0" e "vazio" são fatos diferentes.
// Achado A7 da revisão adversarial: sem limite, a linha de `setor_permissao` — que grava o mapa
// de acesso inteiro, ~46 KB (o G8) — vira um token único sem espaços dentro de um `<td>`, e o
// `.almox-table-container` é `overflow: hidden`. O resultado não era só feio: era ilegível, com
// o começo do valor clipado junto. Truncar diz ao leitor que há mais, o que "sumir" não diz.
const LIMITE_VALOR = 300;
const valorAuditoria = (v) => {
  if (v === null || v === undefined) return '—';
  let texto;
  if (typeof v === 'object') texto = JSON.stringify(v);
  else if (typeof v === 'boolean') texto = v ? 'sim' : 'não';
  else texto = String(v);
  return texto.length > LIMITE_VALOR
    ? `${texto.slice(0, LIMITE_VALOR)}… (+${texto.length - LIMITE_VALOR} caracteres)`
    : texto;
};

const LIMITE = 200; // default do C1 (1..1000)
const FILTROS_VAZIOS = { entidade: '', usuario_id: '', acao: '', data_inicio: '', data_fim: '' };

const AuditoriaAlmoxarifado = () => {
  const { pode, perfil, loading: permissoesCarregando } = useAlmoxPermissoes();
  // Gate VISUAL apenas — a decisão de verdade é o `requirePermission('configurar')` do servidor
  // (RN-01). O hook falha ABERTO de propósito: se a carga de permissões falhou, deixa buscar e
  // o 403 cai no painel de erro acima.
  const podeVer = pode('configurar');

  const [opcoes, setOpcoes] = useState({ entidades: [], acoes: [], usuarios: [] });
  const [filtros, setFiltros] = useState(FILTROS_VAZIOS);
  const [offset, setOffset] = useState(0);
  const [dados, setDados] = useState(null);
  const [loading, setLoading] = useState(true);
  const [erro, setErro] = useState(null);
  const [reload, setReload] = useState(0);
  const [abertos, setAbertos] = useState({}); // id -> bool

  // Os selects vêm do banco (RN-05): lista fixa envelheceria no primeiro `entidade` novo — as
  // etapas 18-20 criaram seis. Falha em silêncio de propósito: sem as opções a tela ainda lista.
  useEffect(() => {
    if (permissoesCarregando || !podeVer) return undefined;
    let cancelado = false;
    api.get('/almoxarifado/auditoria/opcoes')
      .then((r) => {
        if (cancelado) return;
        const d = r.data || {};
        setOpcoes({ entidades: d.entidades || [], acoes: d.acoes || [], usuarios: d.usuarios || [] });
      })
      .catch(() => { /* o erro que importa é o da listagem, e ele tem painel próprio */ });
    return () => { cancelado = true; };
  }, [permissoesCarregando, podeVer, reload]);

  // O select de ação guarda o RÓTULO do grupo (RN-06); a conversão para os verbos crus é aqui.
  // Memoizado por `filtros.acao` e pelas opções para que a chegada de /opcoes não redispare a
  // listagem quando nenhuma ação está filtrada (o valor continua a MESMA string vazia).
  const verbosAcao = useMemo(() => {
    if (!filtros.acao) return '';
    const grupo = (opcoes.acoes || []).find((a) => a.rotulo === filtros.acao);
    // Grupo desconhecido (opções ainda não carregaram): manda o próprio valor, nunca nada —
    // filtro que some em silêncio devolveria uma lista mais larga do que a pedida.
    return (grupo ? grupo.verbos : [filtros.acao]).join(',');
  }, [filtros.acao, opcoes.acoes]);

  const params = useMemo(() => {
    const p = { limite: LIMITE, offset };
    if (filtros.entidade) p.entidade = filtros.entidade;
    if (filtros.usuario_id) p.usuario_id = filtros.usuario_id;
    if (filtros.data_inicio) p.data_inicio = filtros.data_inicio;
    if (filtros.data_fim) p.data_fim = filtros.data_fim;
    // STRING com vírgulas — NUNCA array (achado A5, ver cabeçalho).
    if (verbosAcao) p.acao = verbosAcao;
    return p;
  }, [filtros.entidade, filtros.usuario_id, filtros.data_inicio, filtros.data_fim, verbosAcao, offset]);

  useEffect(() => {
    if (permissoesCarregando || !podeVer) { setLoading(false); return undefined; }
    let cancelado = false;
    setLoading(true);
    setErro(null);
    api.get('/almoxarifado/auditoria', { params })
      .then((r) => { if (!cancelado) setDados(r.data || null); })
      .catch((err) => {
        if (cancelado) return;
        // NÃO grava lista vazia aqui: seria o mesmo shape de "nenhum registro" e a tela
        // afirmaria, para um 403 de perfil ou um 400 de data, que nada foi registrado.
        setDados(null);
        const mensagem = err.response?.data?.error || 'Não foi possível carregar a trilha de auditoria';
        setErro({ status: err.response?.status, mensagem });
        toast.error(mensagem);
      })
      .finally(() => { if (!cancelado) setLoading(false); });
    return () => { cancelado = true; };
  }, [permissoesCarregando, podeVer, params, reload]);

  // Trocar filtro volta para a primeira página: manter o offset mostraria a página 4 de um
  // resultado novo que talvez tenha uma página só — lista vazia sem motivo aparente.
  const mudarFiltro = useCallback((campo, valor) => {
    setOffset(0);
    setAbertos({});
    setFiltros((f) => ({ ...f, [campo]: valor }));
  }, []);

  const limpar = useCallback(() => {
    setOffset(0);
    setAbertos({});
    setFiltros(FILTROS_VAZIOS);
  }, []);

  const semPermissao = !permissoesCarregando && !podeVer;
  const itens = dados?.itens || [];
  const total = dados?.total || 0;
  const limite = dados?.limite || LIMITE;
  const inicio = itens.length ? offset + 1 : 0;
  const fim = offset + itens.length;

  return (
    <div className="almox-page">
      <div className="almox-header">
        <div>
          <h1><FiShield size={20} /> Auditoria</h1>
          <p>Trilha de auditoria do almoxarifado — quem mexeu em quê, quando, e o que mudou. Somente leitura (RN-09).</p>
        </div>
        <div className="almox-header-actions">
          <button className="btn-almox-secondary" onClick={() => setReload((t) => t + 1)} disabled={semPermissao}>
            <FiRefreshCw size={13} /> Atualizar
          </button>
        </div>
      </div>

      {semPermissao ? (
        <PainelErroCarga
          mensagem={formatarErroPermissao({ acao: 'configurar', perfil })
            || 'Sem permissão para ver a trilha de auditoria. Solicite acesso a um administrador.'}
        />
      ) : (
        <>
          {/* Filtros — os valores vêm do banco (RN-05), não de lista fixa. */}
          <div className="almox-filters">
            <select
              className="almox-select"
              data-testid="filtro-entidade"
              value={filtros.entidade}
              onChange={(e) => mudarFiltro('entidade', e.target.value)}
            >
              <option value="">Todas as entidades</option>
              {opcoes.entidades.map((en) => (
                <option key={en.valor} value={en.valor}>{en.rotulo}</option>
              ))}
            </select>

            <select
              className="almox-select"
              data-testid="filtro-acao"
              value={filtros.acao}
              onChange={(e) => mudarFiltro('acao', e.target.value)}
            >
              <option value="">Todas as ações</option>
              {/* Uma opção por GRUPO (RN-06): sinônimo não divide a lista. O verbo cru continua
                  visível na linha, então a inconsistência do vocabulário não fica escondida. */}
              {opcoes.acoes.map((a) => (
                <option key={a.rotulo} value={a.rotulo}>{a.rotulo}</option>
              ))}
            </select>

            <select
              className="almox-select"
              data-testid="filtro-usuario"
              value={filtros.usuario_id}
              onChange={(e) => mudarFiltro('usuario_id', e.target.value)}
            >
              <option value="">Todos os usuários</option>
              {opcoes.usuarios.map((u) => (
                <option key={u.id} value={String(u.id)}>{u.nome}</option>
              ))}
            </select>

            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <input
                type="date" className="almox-input" style={{ width: 'auto' }}
                data-testid="filtro-data-inicio" aria-label="Data inicial"
                value={filtros.data_inicio}
                onChange={(e) => mudarFiltro('data_inicio', e.target.value)}
              />
              <span style={{ color: 'var(--gmp-text-light)', fontSize: '0.8rem' }}>até</span>
              <input
                type="date" className="almox-input" style={{ width: 'auto' }}
                data-testid="filtro-data-fim" aria-label="Data final"
                value={filtros.data_fim}
                onChange={(e) => mudarFiltro('data_fim', e.target.value)}
              />
            </div>

            <button className="btn-almox-secondary" data-testid="auditoria-limpar" onClick={limpar}>
              Limpar
            </button>
          </div>

          <p style={{ fontSize: '0.78rem', color: 'var(--gmp-text-light)', margin: '0 0 12px' }}>
            O período é inclusivo nos dois extremos, no horário de Brasília (RN-04) — o servidor
            converte para UTC antes de consultar, porque a trilha é gravada em UTC.
          </p>

          {erro ? (
            <PainelErroCarga mensagem={erro.mensagem} onTentarNovamente={() => setReload((t) => t + 1)} />
          ) : loading || dados === null ? (
            <div className="almox-table-container"><SkeletonTable rows={8} columns={5} /></div>
          ) : itens.length === 0 ? (
            <div className="almox-table-container">
              <div className="almox-empty" data-testid="auditoria-vazio">
                {/* "Não há registros" seria uma AFIRMAÇÃO sobre o mundo; o que a tela sabe é
                    apenas o que estes filtros trouxeram. A diferença importa numa auditoria. */}
                <p>Nenhum registro para os filtros aplicados</p>
              </div>
            </div>
          ) : (
            <>
              {dados.truncado && (
                <div
                  data-testid="auditoria-truncado"
                  style={{
                    display: 'flex', gap: 8, alignItems: 'flex-start', marginBottom: 12,
                    padding: '10px 14px', borderRadius: 8,
                    border: '1px solid rgba(229,152,0,0.35)', background: 'rgba(229,152,0,0.08)',
                    fontSize: '0.82rem', color: 'var(--gmp-text)',
                  }}
                >
                  <FiAlertTriangle size={15} style={{ color: 'var(--gmp-warning)', flexShrink: 0, marginTop: 1 }} />
                  <span>
                    Resultado cortado: a consulta encontrou <strong>{total}</strong> registros e
                    esta página traz no máximo <strong>{limite}</strong>. Estreite o período ou
                    use os filtros — ou avance a página — para não deixar nada de fora.
                  </span>
                </div>
              )}

              <div className="almox-table-container">
                <table className="almox-table">
                  <thead>
                    <tr>
                      <th>Quando</th>
                      <th>Quem</th>
                      <th>Ação</th>
                      <th>Entidade</th>
                      <th>Justificativa</th>
                      <th style={{ width: 120 }}></th>
                    </tr>
                  </thead>
                  <tbody>
                    {itens.map((it) => {
                      const aberto = !!abertos[it.id];
                      const alteracoes = it.alteracoes || [];
                      // Rótulo PRONTO do servidor; o verbo cru vira legenda secundária (RN-06)
                      // só quando difere — para verbo sem rótulo os dois são iguais e repetir
                      // seria ruído.
                      const mostraVerboCru = it.acao && it.acao !== it.acao_rotulo;
                      return (
                        <React.Fragment key={it.id}>
                          <tr data-testid={`auditoria-linha-${it.id}`}>
                            <td style={{ whiteSpace: 'nowrap' }}>{formatDataHora(it.created_at)}</td>
                            <td>{it.usuario_nome || (it.usuario_id ? `#${it.usuario_id}` : 'Sistema')}</td>
                            <td>
                              <span className="almox-badge almox-badge-ajuste">{it.acao_rotulo || it.acao}</span>
                              {mostraVerboCru && (
                                <div style={{ fontSize: '0.72rem', color: 'var(--gmp-text-light)', marginTop: 3 }}>
                                  {it.acao}
                                </div>
                              )}
                            </td>
                            <td>
                              {it.entidade_rotulo || it.entidade}
                              {it.entidade_id != null && (
                                <span style={{ color: 'var(--gmp-text-light)' }}> #{it.entidade_id}</span>
                              )}
                            </td>
                            <td>{it.justificativa || '—'}</td>
                            <td>
                              <button
                                type="button"
                                className="btn-almox-secondary"
                                aria-expanded={aberto}
                                onClick={() => setAbertos((s) => ({ ...s, [it.id]: !s[it.id] }))}
                              >
                                {aberto ? <FiChevronUp size={13} /> : <FiChevronDown size={13} />} Detalhes
                              </button>
                            </td>
                          </tr>
                          {aberto && (
                            <tr>
                              <td colSpan={6} style={{ background: 'var(--gmp-bg)' }}>
                                <div data-testid={`auditoria-alteracoes-${it.id}`}>
                                  {alteracoes.length === 0 ? (
                                    // Há atos que gravam nenhum dos dois lados — área em branco
                                    // pareceria bug da tela, e "nada mudou" seria mentira.
                                    <span style={{ fontSize: '0.82rem', color: 'var(--gmp-text-light)' }}>
                                      Sem detalhes registrados para este ato — a linha existe, mas
                                      não guardou o antes nem o depois.
                                    </span>
                                  ) : (
                                    <table className="almox-table" style={{ margin: 0 }}>
                                      <thead>
                                        <tr><th>Campo</th><th>De</th><th>Para</th></tr>
                                      </thead>
                                      <tbody>
                                        {alteracoes.map((a, i) => (
                                          <tr key={`${it.id}-${a.campo}-${i}`}>
                                            <td>{a.campo}</td>
                                            {/* RN-08: o que veio '(alterado)' sai '(alterado)'.
                                                A tela não embeleza segredo — e não o esconde. */}
                                            <td>{valorAuditoria(a.de)}</td>
                                            <td>{valorAuditoria(a.para)}</td>
                                          </tr>
                                        ))}
                                      </tbody>
                                    </table>
                                  )}
                                  {/* Achado A8: parte das entradas é CONTEXTO, não mudança. A
                                      troca de foto de material, por exemplo, grava
                                      `{foto, codigo, nome}` contra `{foto}`, então `codigo` e
                                      `nome` aparecem como `— → valor` e leem como "foi definido
                                      agora". Aparecem de propósito: é a mesma ausência de filtro
                                      de igualdade que mantém visível a troca de senha (as duas
                                      pontas valem '(alterado)'). Sem esta legenda, quem audita
                                      conclui que houve alteração onde não houve. */}
                                  {alteracoes.some((a) => a.de === null || a.de === undefined) && (
                                    <p style={{ fontSize: '0.75rem', color: 'var(--gmp-text-light)', margin: '8px 0 0' }}>
                                      Linhas com <strong>De</strong> vazio (—) podem ser o valor
                                      que a operação apenas registrou junto, e não um campo que
                                      mudou. O sistema guarda o que foi gravado no ato, sem
                                      descartar nada.
                                    </p>
                                  )}
                                </div>
                              </td>
                            </tr>
                          )}
                        </React.Fragment>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              <div style={{ display: 'flex', gap: 12, alignItems: 'center', justifyContent: 'flex-end', marginTop: 12 }}>
                <span style={{ fontSize: '0.78rem', color: 'var(--gmp-text-light)' }}>
                  {inicio}–{fim} de {total}
                </span>
                <button
                  className="btn-almox-secondary"
                  disabled={offset === 0}
                  onClick={() => setOffset((o) => Math.max(0, o - LIMITE))}
                >
                  Anteriores
                </button>
                <button
                  className="btn-almox-secondary"
                  disabled={fim >= total}
                  onClick={() => setOffset((o) => o + LIMITE)}
                >
                  Próximos
                </button>
              </div>
            </>
          )}
        </>
      )}
    </div>
  );
};

export default AuditoriaAlmoxarifado;
