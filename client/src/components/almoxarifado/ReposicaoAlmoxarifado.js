import React, { useState, useEffect, useCallback, useMemo } from 'react';
import api from '../../services/api';
import { toast } from 'react-toastify';
import { FiShoppingCart, FiRefreshCw, FiAlertTriangle } from 'react-icons/fi';
import { SkeletonTable } from '../SkeletonLoader';
import { useAlmoxPermissoes } from '../../hooks/useAlmoxPermissoes';
import './Almoxarifado.css';

/**
 * Etapa 11, Task 3 — tela `/almoxarifado/reposicao` (3 abas: Sugestões de Compra, Estoque
 * Parado, Solicitações). Consome o motor de sugestão da Etapa 11 (purchaseService) pelas rotas
 * novas — nenhum cálculo de sugestão é refeito aqui (aprendizado G6 do design: o que o servidor
 * decide, o servidor manda pronto). Contrato congelado:
 * docs/superpowers/specs/2026-08-23-almoxarifado-etapa11-reposicao-compras-design.md
 *
 * Checkboxes por material começam TODOS marcados (default do design) e o POST manda SÓ os ids
 * marcados — nunca omitido: `material_ids` ausente significaria "todas as sugestões do
 * momento" no servidor, e desmarcar tudo e clicar não pode disparar o catálogo inteiro (RN-09).
 * O botão fica desabilitado sem nenhum marcado como segunda camada (defesa em profundidade),
 * além do gate `gerenciar_reposicao` via `bloquearSeNaoPode` (o servidor é sempre quem decide
 * de verdade).
 */

const ORIGEM_LABEL = { CADASTRADO: 'Cadastrado', CALCULADO: 'Calculado', MINIMO: 'Mínimo' };

const TIPOS_PARADO = [
  { value: '', label: 'Todos' },
  { value: 'EXCESSO', label: 'Excesso' },
  { value: 'SEM_CONSUMO', label: 'Sem consumo' },
  { value: 'OBSOLETO', label: 'Obsoleto' },
];

const formatMoeda = (v) => (v === null || v === undefined
  ? '—' : Number(v).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }));

const formatNum = (v) => (v == null ? '—' : Number(v).toLocaleString('pt-BR', { maximumFractionDigits: 4 }));

const MOTIVO_LABEL = { PONTO_REPOSICAO: 'Ponto de reposição', ESTOQUE_MINIMO: 'Estoque mínimo' };

// Revisao final da Etapa 11 (achado 1, medido pelos dois revisores): os tres `.catch` desta
// tela gravavam estado de painel VAZIO ("nada para comprar/parado/pendente") em cima de um 403
// — ALMOXARIFE/PRODUCAO liam isso como fato operacional, nao como "sem permissao". O painel
// abaixo troca o lugar de KPIs+tabela (nunca o `almox-empty`) e mostra a mensagem do servidor
// verbatim (o interceptor do axios ja formata o 403 de perfil — services/api.js). Mesmo
// estilo visual do `loadError` de AlmoxarifadoDashboard.js, para o modulo nao ganhar dois
// jeitos diferentes de dizer "os dados nao carregaram".
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
    <button type="button" className="btn-almox-secondary" onClick={onTentarNovamente}>
      <FiRefreshCw size={14} /> Tentar novamente
    </button>
  </div>
);

// Timestamps do SQLite vem em UTC sem sufixo ("YYYY-MM-DD HH:MM:SS") — mesmo ajuste de
// ConferenciaEstoque.js (sem o 'Z', o V8 leria como hora local).
const formatData = (d) => {
  if (!d) return '—';
  const iso = typeof d === 'string' && d.includes(' ') && !d.includes('T') ? `${d.replace(' ', 'T')}Z` : d;
  return new Date(iso).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit' });
};

const ReposicaoAlmoxarifado = () => {
  const { bloquearSeNaoPode } = useAlmoxPermissoes();
  const [aba, setAba] = useState('SUGESTOES');

  // ── Aba Sugestões de Compra ──
  const [sugestoes, setSugestoes] = useState(null);
  const [loadingSugestoes, setLoadingSugestoes] = useState(true);
  const [erroSugestoes, setErroSugestoes] = useState(null); // { status, mensagem } — achado 1
  const [reloadSugestoes, setReloadSugestoes] = useState(0);
  const [selecionados, setSelecionados] = useState(new Set());
  const [gerando, setGerando] = useState(false);
  const [resultadoGeracao, setResultadoGeracao] = useState(null);

  // ── Aba Estoque Parado ──
  const [estoqueParado, setEstoqueParado] = useState(null);
  const [loadingParado, setLoadingParado] = useState(true);
  const [erroParado, setErroParado] = useState(null);
  const [filtroTipo, setFiltroTipo] = useState('');
  const [reloadParado, setReloadParado] = useState(0);

  // ── Aba Solicitações ──
  const [solicitacoes, setSolicitacoes] = useState(null);
  const [loadingSolic, setLoadingSolic] = useState(true);
  const [erroSolic, setErroSolic] = useState(null);
  const [reloadSolic, setReloadSolic] = useState(0);

  // resultadoGeracao pertence SO a aba Sugestoes — trocar de aba e voltar sem isto deixava o
  // painel de "N solicitacao(oes) criada(s)" da geracao anterior grudado na tela mesmo depois
  // do usuario ter ido ver Estoque Parado e voltado (achado 4, medido).
  useEffect(() => { setResultadoGeracao(null); }, [aba]);

  const fornecedores = sugestoes?.fornecedores || [];
  const todosMaterialIds = useMemo(
    () => fornecedores.flatMap((g) => g.itens.map((i) => i.material_id)),
    [fornecedores],
  );
  // Soma o valor_estimado só dos itens marcados — usado no texto do confirm() antes do POST.
  const valorSelecionado = useMemo(
    () => fornecedores.reduce((acc, g) => acc + g.itens.reduce(
      (soma, i) => (selecionados.has(i.material_id) ? soma + (Number(i.valor_estimado) || 0) : soma), 0,
    ), 0),
    [fornecedores, selecionados],
  );

  const carregarSugestoes = useCallback(() => {
    let cancelado = false;
    setLoadingSugestoes(true);
    setErroSugestoes(null);
    api.get('/almoxarifado/reposicao/sugestoes')
      .then((r) => {
        if (cancelado) return;
        const dados = r.data || { fornecedores: [], resumo: {} };
        setSugestoes(dados);
        // Todos marcados por default (design, aba Sugestões de Compra) — a lista chega
        // recalculada e a seleção anterior perde sentido (materiais podem ter sumido).
        const ids = new Set();
        (dados.fornecedores || []).forEach((g) => g.itens.forEach((i) => ids.add(i.material_id)));
        setSelecionados(ids);
      })
      .catch((err) => {
        if (cancelado) return;
        // Achado 1 (Critical, medido): NAO grava fornecedores:[] aqui — isso e o mesmo shape
        // de "nada para comprar" e a tela renderizava o `almox-empty` para um 403 de perfil.
        // `sugestoes` fica null; o JSX troca KPIs+tabela pelo painel de erro.
        setSugestoes(null);
        const mensagem = err.response?.data?.error || 'Não foi possível carregar as sugestões de compra';
        setErroSugestoes({ status: err.response?.status, mensagem });
        toast.error(mensagem);
      })
      .finally(() => { if (!cancelado) setLoadingSugestoes(false); });
    return () => { cancelado = true; };
  }, []);

  useEffect(() => carregarSugestoes(), [carregarSugestoes, reloadSugestoes]);

  useEffect(() => {
    if (aba !== 'PARADO') return undefined;
    let cancelado = false;
    setLoadingParado(true);
    setErroParado(null);
    const params = {};
    if (filtroTipo) params.tipo = filtroTipo;
    api.get('/almoxarifado/reposicao/estoque-parado', { params })
      .then((r) => { if (!cancelado) setEstoqueParado(r.data || { itens: [], resumo: {} }); })
      .catch((err) => {
        if (cancelado) return;
        setEstoqueParado(null);
        const mensagem = err.response?.data?.error || 'Não foi possível carregar o estoque parado';
        setErroParado({ status: err.response?.status, mensagem });
        toast.error(mensagem);
      })
      .finally(() => { if (!cancelado) setLoadingParado(false); });
    return () => { cancelado = true; };
  }, [aba, filtroTipo, reloadParado]);

  useEffect(() => {
    // Achado 1 (Critical, medido): a Task 3 do backend gateou este relatorio com
    // `gerenciar_reposicao` (extended.js) DEPOIS desta tela ter sido escrita — a terceira aba
    // passou a 403 para os mesmos perfis das outras duas (ALMOXARIFE/PRODUCAO), e o `.catch`
    // aqui gravava `[]`, que e exatamente o shape de "nenhuma solicitacao pendente".
    if (aba !== 'SOLICITACOES') return undefined;
    let cancelado = false;
    setLoadingSolic(true);
    setErroSolic(null);
    api.get('/almoxarifado/relatorios/solicitacoes-compra')
      .then((r) => { if (!cancelado) setSolicitacoes(Array.isArray(r.data) ? r.data : []); })
      .catch((err) => {
        if (cancelado) return;
        setSolicitacoes(null);
        const mensagem = err.response?.data?.error || 'Não foi possível carregar as solicitações';
        setErroSolic({ status: err.response?.status, mensagem });
        toast.error(mensagem);
      })
      .finally(() => { if (!cancelado) setLoadingSolic(false); });
    return () => { cancelado = true; };
  }, [aba, reloadSolic]);

  const alternarSelecao = (materialId, marcado) => {
    setSelecionados((s) => {
      const novo = new Set(s);
      if (marcado) novo.add(materialId); else novo.delete(materialId);
      return novo;
    });
  };

  const handleGerar = async (evento) => {
    if (!bloquearSeNaoPode('gerenciar_reposicao', evento)) return;
    if (selecionados.size === 0) return; // defesa em profundidade — o botão já vem desabilitado
    // Sem confirmação, o clique default gerava 1 solicitação + 1 auditoria por material
    // sugerido, sem caminho de cancelamento no sistema, e os materiais sumiam da tela por
    // 60 dias via a_caminho — window.confirm é o padrão do módulo para esse tipo de cancelo.
    // eslint-disable-next-line no-alert
    if (!window.confirm(`Gerar ${selecionados.size} solicitação(ões) de compra no valor estimado de ${formatMoeda(valorSelecionado)}?`)) return;
    setGerando(true);
    setResultadoGeracao(null);
    // Snapshot código/nome por id no momento do POST — a lista recarrega logo depois
    // (reloadSugestoes) e o material some da tela via a_caminho, então o resultado exibido
    // não pode depender de `fornecedores` já atualizado.
    const infoPorId = new Map();
    fornecedores.forEach((g) => g.itens.forEach((i) => infoPorId.set(i.material_id, `${i.codigo} — ${i.nome}`)));
    try {
      // SÓ os marcados, sempre EXPLICITO — nunca omitir material_ids (ausente = "todas as
      // sugestões do momento" no servidor, RN-09).
      const res = await api.post('/almoxarifado/reposicao/gerar-solicitacoes', {
        material_ids: [...selecionados],
      });
      const { criadas = [], puladas = [] } = res.data || {};
      setResultadoGeracao({ criadas, puladas, infoPorId });
      if (criadas.length === 0 && puladas.length === 0) {
        toast.info('Nenhuma sugestão para gerar');
      } else {
        toast.success(`${criadas.length} solicitação(ões) gerada(s)`
          + (puladas.length ? `, ${puladas.length} pulada(s)` : ''));
      }
      setReloadSugestoes((t) => t + 1);
    } catch (err) {
      toast.error(err.response?.data?.error || 'Erro ao gerar solicitações');
    } finally { setGerando(false); }
  };

  return (
    <div className="almox-page">
      <div className="almox-header">
        <div>
          <h1><FiShoppingCart size={20} /> Reposição e Compras</h1>
          <p>Sugestão de compra por fornecedor, estoque parado e acompanhamento das solicitações</p>
        </div>
        <div className="almox-header-actions">
          <button
            className="btn-almox-secondary"
            onClick={() => {
              if (aba === 'SUGESTOES') setReloadSugestoes((t) => t + 1);
              else if (aba === 'PARADO') setReloadParado((t) => t + 1);
              else setReloadSolic((t) => t + 1);
            }}
          >
            <FiRefreshCw size={13} /> Atualizar
          </button>
        </div>
      </div>

      <div style={{ display: 'flex', gap: 8, margin: '12px 0' }}>
        <button className={aba === 'SUGESTOES' ? 'btn-almox-primary' : 'btn-almox-secondary'} onClick={() => setAba('SUGESTOES')}>Sugestões de Compra</button>
        <button className={aba === 'PARADO' ? 'btn-almox-primary' : 'btn-almox-secondary'} onClick={() => setAba('PARADO')}>Estoque Parado</button>
        <button className={aba === 'SOLICITACOES' ? 'btn-almox-primary' : 'btn-almox-secondary'} onClick={() => setAba('SOLICITACOES')}>Solicitações</button>
      </div>

      {aba === 'SUGESTOES' && (
        <>
          {erroSugestoes ? (
            <PainelErroCarga mensagem={erroSugestoes.mensagem} onTentarNovamente={() => setReloadSugestoes((t) => t + 1)} />
          ) : (
            <>
              {sugestoes && (
                <>
                  {/* Achado 2 (medido): janela_dias vinha no payload e era descartado — sem
                      isto o numero de "consumo medio" das linhas nao tinha de onde veio. */}
                  <p style={{ fontSize: '0.78rem', color: 'var(--gmp-text-light)', margin: '0 0 8px' }}>
                    Consumo médio calculado sobre os últimos {sugestoes.janela_dias ?? '—'} dias
                  </p>
                  <div className="almox-kpis">
                    <div className="almox-kpi-card">
                      <div className="almox-kpi-icon primary"><FiShoppingCart /></div>
                      <div className="almox-kpi-info">
                        <div className="almox-kpi-value" data-testid="kpi-materiais-sugeridos">{sugestoes.resumo?.materiais_sugeridos ?? 0}</div>
                        <div className="almox-kpi-label">Materiais sugeridos</div>
                      </div>
                    </div>
                    <div className="almox-kpi-card">
                      <div className="almox-kpi-icon success"><FiShoppingCart /></div>
                      <div className="almox-kpi-info">
                        <div className="almox-kpi-value" data-testid="kpi-valor-total-sugerido" style={{ fontSize: '1.2rem' }}>{formatMoeda(sugestoes.resumo?.valor_total)}</div>
                        <div className="almox-kpi-label">Valor total sugerido</div>
                      </div>
                    </div>
                    <div className="almox-kpi-card">
                      <div className="almox-kpi-icon danger"><FiAlertTriangle /></div>
                      <div className="almox-kpi-info">
                        <div className="almox-kpi-value" data-testid="kpi-riscos-parada">{sugestoes.resumo?.riscos_parada ?? 0}</div>
                        <div className="almox-kpi-label">Riscos de parada</div>
                      </div>
                    </div>
                  </div>
                </>
              )}

              <div className="almox-header-actions" style={{ margin: '12px 0' }}>
                <button
                  className="btn-almox-primary"
                  disabled={gerando || selecionados.size === 0}
                  onClick={handleGerar}
                  title="Gera solicitações de compra para os materiais marcados abaixo"
                >
                  {gerando ? 'Gerando...' : 'Gerar solicitações'}
                </button>
              </div>

              {resultadoGeracao && (resultadoGeracao.criadas.length > 0 || resultadoGeracao.puladas.length > 0) && (
                <div style={{ background: 'var(--gmp-surface)', border: '1px solid var(--gmp-border)', borderRadius: 8, padding: '10px 16px', marginBottom: 12, fontSize: '0.8rem' }}>
                  {resultadoGeracao.criadas.length > 0 && (
                    <div>
                      {/* Achado 3 (medido): o servidor RECALCULA a quantidade no POST (o
                          usuario confirmou uma estimativa que pode ter mudado) — mostrar so a
                          contagem escondia o que foi de fato pedido. codigo/nome vem do
                          snapshot tirado no clique (infoPorId), quantidade vem da resposta. */}
                      {resultadoGeracao.criadas.length} solicitação(ões) criada(s):
                      <ul style={{ margin: '4px 0 0', paddingLeft: 18 }}>
                        {resultadoGeracao.criadas.map((c) => (
                          <li key={c.solicitacao_id ?? c.material_id}>
                            {resultadoGeracao.infoPorId?.get(c.material_id) || `#${c.material_id}`}: {formatNum(c.quantidade)}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                  {resultadoGeracao.puladas.length > 0 && (
                    <div style={{ marginTop: resultadoGeracao.criadas.length > 0 ? 8 : 0 }}>
                      Puladas: {resultadoGeracao.puladas.map((p) => `${resultadoGeracao.infoPorId?.get(p.material_id) || `#${p.material_id}`} (${p.motivo})`).join(', ')}
                    </div>
                  )}
                </div>
              )}

              {loadingSugestoes ? <SkeletonTable rows={6} columns={9} /> : todosMaterialIds.length === 0 ? (
                <div className="almox-empty"><p>Nenhuma sugestão para gerar</p></div>
              ) : (
                fornecedores.map((g) => {
                  const todosMarcadosNoGrupo = g.itens.every((i) => selecionados.has(i.material_id));
                  const marcarTodoGrupo = (marcado) => {
                    setSelecionados((s) => {
                      const novo = new Set(s);
                      g.itens.forEach((i) => { if (marcado) novo.add(i.material_id); else novo.delete(i.material_id); });
                      return novo;
                    });
                  };
                  return (
                    <div key={g.fornecedor_id ?? 'sem-fornecedor'} style={{ marginBottom: 20 }}>
                      <div className="almox-section-title">
                        {g.fornecedor_nome} — {g.total_itens} item(ns) — {formatMoeda(g.valor_total)}
                      </div>
                      <div className="almox-table-container">
                        <table className="almox-table">
                          <thead>
                            <tr>
                              <th>
                                {/* Achado 5: marcar/desmarcar todos os itens DESTE fornecedor —
                                    a selecao (`selecionados`) e global a tela, mas cada tabela
                                    e o "todos" visivel ali. */}
                                <input
                                  type="checkbox"
                                  aria-label="Selecionar todos"
                                  checked={todosMarcadosNoGrupo}
                                  onChange={(e) => marcarTodoGrupo(e.target.checked)}
                                />
                              </th>
                              <th>Material</th>
                              <th>Disponível</th>
                              <th>A caminho</th>
                              <th>Posição</th>
                              <th>Ponto (origem)</th>
                              <th>Sugerida</th>
                              <th>Valor</th>
                              <th>Risco</th>
                            </tr>
                          </thead>
                          <tbody>
                            {g.itens.map((item) => (
                              <tr key={item.material_id}>
                                <td>
                                  <input
                                    type="checkbox"
                                    aria-label={`Selecionar ${item.codigo}`}
                                    checked={selecionados.has(item.material_id)}
                                    onChange={(e) => alternarSelecao(item.material_id, e.target.checked)}
                                  />
                                </td>
                                <td>
                                  <div style={{ fontWeight: 600 }}>{item.codigo} — {item.nome}</div>
                                  <div style={{ fontSize: '0.75rem', color: 'var(--gmp-text-light)' }}>{item.unidade}</div>
                                </td>
                                <td>{formatNum(item.disponivel)}</td>
                                <td>
                                  {formatNum(item.a_caminho)}
                                  {item.a_caminho_vencido > 0 && (
                                    // Achado do backend recem-landado (a_caminho_vencido): ha
                                    // solicitacao aberta ha mais tempo que o horizonte
                                    // configurado — ela nao segura mais a posicao (RN-03), mas
                                    // continua aberta de verdade. Avisa ANTES do comprador
                                    // clicar Gerar e duplicar o pedido.
                                    <div style={{ marginTop: 3 }}>
                                      <span
                                        className="almox-badge almox-badge-baixo"
                                        title={`Há solicitação antiga aberta (${formatNum(item.a_caminho_vencido)}) fora do horizonte`}
                                      >
                                        Vencido
                                      </span>
                                    </div>
                                  )}
                                </td>
                                <td>{formatNum(item.posicao)}</td>
                                <td>
                                  {formatNum(item.ponto_efetivo)}
                                  {item.origem_ponto && (
                                    <div style={{ fontSize: '0.72rem', color: 'var(--gmp-text-light)' }}>
                                      {ORIGEM_LABEL[item.origem_ponto] || item.origem_ponto}
                                    </div>
                                  )}
                                  {item.origem_ponto === 'CALCULADO' && (
                                    <div style={{ fontSize: '0.72rem', color: 'var(--gmp-text-light)' }}>
                                      {formatNum(item.consumo_medio_diario)}/dia × {item.prazo_reposicao_dias}d
                                    </div>
                                  )}
                                </td>
                                <td>{formatNum(item.quantidade_sugerida)}</td>
                                <td>{formatMoeda(item.valor_estimado)}</td>
                                <td>
                                  {item.risco_parada && (
                                    <span className="almox-badge almox-badge-critico">Risco de parada</span>
                                  )}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  );
                })
              )}
            </>
          )}
        </>
      )}

      {aba === 'PARADO' && (
        <>
          {erroParado ? (
            <PainelErroCarga mensagem={erroParado.mensagem} onTentarNovamente={() => setReloadParado((t) => t + 1)} />
          ) : (
            <>
              {estoqueParado && (
                <>
                  <p style={{ fontSize: '0.78rem', color: 'var(--gmp-text-light)', margin: '0 0 8px' }}>
                    Retrato do estoque parado inteiro — o filtro abaixo não muda estes números.
                  </p>
                  {/* Achado 2 (medido): dias_sem_consumo vinha no payload e era descartado —
                      sem isto "Sem consumo"/"Obsoleto" na tabela nao diziam o corte usado. */}
                  <p style={{ fontSize: '0.78rem', color: 'var(--gmp-text-light)', margin: '0 0 12px' }}>
                    Parado = sem saída há {estoqueParado.dias_sem_consumo ?? '—'} dias ou mais
                  </p>
                  <div className="almox-kpis">
                    <div className="almox-kpi-card">
                      <div className="almox-kpi-icon warning"><FiAlertTriangle /></div>
                      <div className="almox-kpi-info">
                        <div className="almox-kpi-value" data-testid="kpi-excesso">{estoqueParado.resumo?.excesso ?? 0}</div>
                        <div className="almox-kpi-label">Excesso</div>
                      </div>
                    </div>
                    <div className="almox-kpi-card">
                      <div className="almox-kpi-icon warning"><FiAlertTriangle /></div>
                      <div className="almox-kpi-info">
                        <div className="almox-kpi-value" data-testid="kpi-sem-consumo">{estoqueParado.resumo?.sem_consumo ?? 0}</div>
                        <div className="almox-kpi-label">Sem consumo</div>
                      </div>
                    </div>
                    <div className="almox-kpi-card">
                      <div className="almox-kpi-icon danger"><FiAlertTriangle /></div>
                      <div className="almox-kpi-info">
                        <div className="almox-kpi-value" data-testid="kpi-obsoleto">{estoqueParado.resumo?.obsoleto ?? 0}</div>
                        <div className="almox-kpi-label">Obsoleto</div>
                      </div>
                    </div>
                    <div className="almox-kpi-card">
                      <div className="almox-kpi-icon primary"><FiShoppingCart /></div>
                      <div className="almox-kpi-info">
                        <div className="almox-kpi-value" data-testid="kpi-valor-parado-total" style={{ fontSize: '1.2rem' }}>{formatMoeda(estoqueParado.resumo?.valor_parado_total)}</div>
                        <div className="almox-kpi-label">Valor parado total</div>
                      </div>
                    </div>
                  </div>
                </>
              )}

              <div className="almox-filters">
                <label htmlFor="reposicao-filtro-tipo" style={{ fontSize: '0.8rem', marginRight: 6 }}>Tipo</label>
                <select id="reposicao-filtro-tipo" className="almox-select" aria-label="Tipo de estoque parado" value={filtroTipo} onChange={(e) => setFiltroTipo(e.target.value)}>
                  {TIPOS_PARADO.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
                </select>
              </div>

              {estoqueParado?.itens?.length === 500 && (
                <p style={{ fontSize: '0.78rem', color: 'var(--gmp-text-light)', margin: '8px 0' }}>
                  Mostrando os 500 itens de maior valor parado.
                </p>
              )}

              <div className="almox-table-container">
                {loadingParado ? <SkeletonTable rows={6} columns={7} />
                  : (estoqueParado?.itens || []).length === 0 ? (
                    <div className="almox-empty"><p>Nenhum material parado encontrado</p></div>
                  ) : (
                    <table className="almox-table">
                      <thead>
                        <tr>
                          <th>Material</th>
                          <th>Qtd. atual</th>
                          <th>Qtd. máxima</th>
                          <th>Valor parado</th>
                          <th>Última entrada</th>
                          <th>Última saída</th>
                          <th>Flags</th>
                        </tr>
                      </thead>
                      <tbody>
                        {estoqueParado.itens.map((item) => (
                          <tr key={item.material_id}>
                            <td>
                              <div style={{ fontWeight: 600 }}>{item.codigo} — {item.nome}</div>
                              <div style={{ fontSize: '0.75rem', color: 'var(--gmp-text-light)' }}>{item.unidade}</div>
                            </td>
                            <td>{formatNum(item.quantidade_atual)}</td>
                            <td>{formatNum(item.quantidade_maxima)}</td>
                            <td>{formatMoeda(item.valor_parado)}</td>
                            <td>{formatData(item.ultima_entrada)}</td>
                            <td>{formatData(item.ultima_saida)}</td>
                            <td>
                              <div className="almox-actions">
                                {item.excesso && <span className="almox-badge almox-badge-baixo">Excesso</span>}
                                {item.sem_consumo && <span className="almox-badge almox-badge-zerado">Sem consumo</span>}
                                {item.obsoleto && <span className="almox-badge almox-badge-critico">Obsoleto</span>}
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
              </div>
            </>
          )}
        </>
      )}

      {aba === 'SOLICITACOES' && (
        <>
          {erroSolic ? (
            <PainelErroCarga mensagem={erroSolic.mensagem} onTentarNovamente={() => setReloadSolic((t) => t + 1)} />
          ) : (
            <div className="almox-table-container">
              {loadingSolic ? <SkeletonTable rows={6} columns={5} />
                : (solicitacoes || []).length === 0 ? (
                  <div className="almox-empty"><p>Nenhuma solicitação de compra pendente</p></div>
                ) : (
                  <table className="almox-table">
                    <thead>
                      <tr>
                        <th>Material</th>
                        <th>Quantidade</th>
                        <th>Motivo</th>
                        <th>Status</th>
                        <th>Criada em</th>
                      </tr>
                    </thead>
                    <tbody>
                      {solicitacoes.map((s) => (
                        <tr key={s.id}>
                          <td>{s.material_codigo} — {s.material_nome}</td>
                          <td>{formatNum(s.quantidade)}</td>
                          <td>{s.motivo ? (MOTIVO_LABEL[s.motivo] || s.motivo) : '—'}</td>
                          <td>
                            <span className={`almox-badge almox-badge-${s.status === 'VINCULADO' ? 'ok' : 'ajuste'}`}>
                              {s.status}
                            </span>
                          </td>
                          <td>{formatData(s.created_at)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
            </div>
          )}
        </>
      )}
    </div>
  );
};

export default ReposicaoAlmoxarifado;
