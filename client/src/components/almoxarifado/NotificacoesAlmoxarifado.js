import React, { useState, useEffect, useCallback } from 'react';
import api from '../../services/api';
import { toast } from 'react-toastify';
import { FiBell, FiRefreshCw, FiAlertTriangle, FiSend } from 'react-icons/fi';
import { SkeletonTable } from '../SkeletonLoader';
import { useAlmoxPermissoes } from '../../hooks/useAlmoxPermissoes';
import './Almoxarifado.css';

/**
 * Etapa 12, Task 4 — tela `/almoxarifado/notificacoes` contra o contrato congelado do design
 * (docs/superpowers/specs/2026-08-24-almoxarifado-etapa12-notificacoes-design.md). Consome os
 * 3 endpoints do painel (RN-08) — nenhum cálculo de envio/dedupe/backoff é refeito aqui, o
 * servidor é sempre quem decide (mesma lição G6 herdada da Etapa 11 / ReposicaoAlmoxarifado.js).
 *
 * Padrão herdado do Critical da Etapa 11 (achado 1, medido pelos dois revisores): painel de
 * erro por estado com retry — um 403 de perfil NUNCA pode virar a lista vazia "nenhuma
 * notificação", porque PRODUCAO/ALMOXARIFE/COMPRAS leriam isso como fato operacional.
 */

const STATUS_OPCOES = [
  { value: '', label: 'Todos os status' },
  { value: 'PENDENTE', label: 'Pendente' },
  { value: 'ENVIADO', label: 'Enviado' },
  { value: 'FALHA', label: 'Falha' },
];

// Espelha os 8 eventos que a fila conhece (RN-01..RN-07 do design) — não é uma varredura
// dinâmica porque a fila não expõe um endpoint de "eventos distintos"; o filtro é por igualdade
// exata contra o que a rota aceita em `?evento=`.
const EVENTO_OPCOES = [
  { value: '', label: 'Todos os eventos' },
  { value: 'MOVIMENTACAO', label: 'Movimentação' },
  { value: 'FERRAMENTA_LEMBRETE', label: 'Lembrete de ferramenta' },
  { value: 'SOLICITACAO_COMPRA', label: 'Solicitação de compra' },
  { value: 'DEVOLUCAO_PARCIAL', label: 'Devolução parcial' },
  { value: 'ESTOQUE_ZERADO', label: 'Estoque zerado' },
  { value: 'LOTE_VENCENDO', label: 'Lote vencendo' },
  { value: 'REMESSA_VENCIDA', label: 'Remessa vencida' },
  { value: 'FALHA_NOTIFICACAO', label: 'Aviso de falha' },
];

const STATUS_BADGE_CLASS = { PENDENTE: 'almox-badge-baixo', ENVIADO: 'almox-badge-ok', FALHA: 'almox-badge-critico' };

// Revisao da Task 4 (M5): o design tinha um CONFLITO interno — a RN-08 (emenda medida da
// revisao da Task 1) diz que reenviar um ENVIADO "e permitido de proposito: e o unico caminho
// de reemissao de um e-mail perdido depois do aceite do SMTP", mas a secao "Front — tela"
// dizia "so em FALHA/PENDENTE". DECISAO: a RN-08 prevalece (decisao com racional escrito) — o
// botao aparece em TODAS as linhas; para ENVIADO ha um confirm de protecao contra clique
// acidental (reenviar la manda e-mail duplicado de verdade). O design foi corrigido dizendo
// que a secao do front estava errada.
const CONFIRMA_REENVIO_ENVIADO = 'Esta notificação já foi enviada. Reenviar mesmo assim envia o e-mail de novo aos mesmos destinatários.';

// Mesmo painel de erro por estado da Etapa 11 (achado 1, Critical, medido pelos dois
// revisores) — copiado de ReposicaoAlmoxarifado.js para o módulo não ganhar dois jeitos
// diferentes de dizer "os dados não carregaram".
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
// ConferenciaEstoque.js/ReposicaoAlmoxarifado.js (sem o 'Z', o V8 leria como hora local).
const formatDataHora = (d) => {
  if (!d) return '—';
  const iso = typeof d === 'string' && d.includes(' ') && !d.includes('T') ? `${d.replace(' ', 'T')}Z` : d;
  return new Date(iso).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' });
};

// `destinatarios` chega como STRING JSON do contrato congelado (a coluna é TEXT; ver RN-02 do
// design) — parseList com try/catch, nunca `.split(',')` puro (a fixture "[]" viraria o
// destinatário fantasma "[]").
const parseListaExibicao = (raw) => {
  if (!raw) return [];
  try {
    const arr = JSON.parse(raw);
    return Array.isArray(arr) ? arr : [String(arr)];
  } catch {
    return String(raw).split(',').map((s) => s.trim()).filter(Boolean);
  }
};

const NotificacoesAlmoxarifado = () => {
  const { bloquearSeNaoPode } = useAlmoxPermissoes();

  const [dados, setDados] = useState(null); // { itens, resumo }
  const [loading, setLoading] = useState(true);
  const [erro, setErro] = useState(null); // { status, mensagem } — achado 1 da Etapa 11
  const [reload, setReload] = useState(0);
  const [filtroStatus, setFiltroStatus] = useState('');
  const [filtroEvento, setFiltroEvento] = useState('');
  const [reenviando, setReenviando] = useState(null); // id em voo
  const [processando, setProcessando] = useState(false);

  const carregar = useCallback(() => {
    let cancelado = false;
    setLoading(true);
    setErro(null);
    const params = {};
    if (filtroStatus) params.status = filtroStatus;
    if (filtroEvento) params.evento = filtroEvento;
    api.get('/almoxarifado/notificacoes', { params })
      .then((r) => {
        if (cancelado) return;
        setDados(r.data || { itens: [], resumo: { pendentes: 0, enviadas: 0, falhas: 0 } });
      })
      .catch((err) => {
        if (cancelado) return;
        // Achado 1 (Critical, medido na Etapa 11): NAO grava itens:[] aqui — e o mesmo shape de
        // "nenhuma notificacao" e a tela renderizaria o almox-empty para um 403 de perfil.
        setDados(null);
        const mensagem = err.response?.data?.error || 'Não foi possível carregar as notificações';
        setErro({ status: err.response?.status, mensagem });
        toast.error(mensagem);
      })
      .finally(() => { if (!cancelado) setLoading(false); });
    return () => { cancelado = true; };
  }, [filtroStatus, filtroEvento]);

  useEffect(() => carregar(), [carregar, reload]);

  const handleReenviar = async (item, evento) => {
    if (!bloquearSeNaoPode('gerenciar_notificacoes', evento)) return;
    if (item.status === 'ENVIADO' && !window.confirm(CONFIRMA_REENVIO_ENVIADO)) return;
    setReenviando(item.id);
    try {
      await api.post(`/almoxarifado/notificacoes/${item.id}/reenviar`);
      toast.success('Notificação reenviada');
      setReload((t) => t + 1);
    } catch (err) {
      toast.error(err.response?.data?.error || 'Erro ao reenviar notificação');
    } finally { setReenviando(null); }
  };

  const handleProcessar = async (evento) => {
    if (!bloquearSeNaoPode('gerenciar_notificacoes', evento)) return;
    setProcessando(true);
    try {
      const res = await api.post('/almoxarifado/notificacoes/processar');
      const { processadas = 0, enviadas = 0, falharam = 0 } = res.data || {};
      toast.success(`${processadas} processada(s): ${enviadas} enviada(s), ${falharam} falha(s)`);
      setReload((t) => t + 1);
    } catch (err) {
      toast.error(err.response?.data?.error || 'Erro ao processar a fila');
    } finally { setProcessando(false); }
  };

  const itens = dados?.itens || [];
  const resumo = dados?.resumo || {};

  return (
    <div className="almox-page">
      <div className="almox-header">
        <div>
          <h1><FiBell size={20} /> Notificações</h1>
          <p>Fila de e-mails do almoxarifado — pendentes, enviadas e falhas, com reenvio manual</p>
        </div>
        <div className="almox-header-actions">
          <button
            className="btn-almox-primary"
            disabled={processando}
            onClick={(e) => handleProcessar(e)}
            data-action="processar-fila"
          >
            <FiSend size={13} /> {processando ? 'Processando...' : 'Processar fila agora'}
          </button>
          <button className="btn-almox-secondary" onClick={() => setReload((t) => t + 1)}>
            <FiRefreshCw size={13} /> Atualizar
          </button>
        </div>
      </div>

      {erro ? (
        <PainelErroCarga mensagem={erro.mensagem} onTentarNovamente={() => setReload((t) => t + 1)} />
      ) : (
        <>
          {dados && (
            <div className="almox-kpis">
              <div className="almox-kpi-card">
                <div className="almox-kpi-icon warning"><FiAlertTriangle /></div>
                <div className="almox-kpi-info">
                  <div className="almox-kpi-value" data-testid="kpi-pendentes">{resumo.pendentes ?? 0}</div>
                  <div className="almox-kpi-label">Pendentes</div>
                </div>
              </div>
              <div className="almox-kpi-card">
                <div className="almox-kpi-icon success"><FiSend /></div>
                <div className="almox-kpi-info">
                  <div className="almox-kpi-value" data-testid="kpi-enviadas">{resumo.enviadas ?? 0}</div>
                  <div className="almox-kpi-label">Enviadas</div>
                </div>
              </div>
              <div className="almox-kpi-card">
                <div className="almox-kpi-icon danger"><FiAlertTriangle /></div>
                <div className="almox-kpi-info">
                  <div className="almox-kpi-value" data-testid="kpi-falhas">{resumo.falhas ?? 0}</div>
                  <div className="almox-kpi-label">Falhas</div>
                </div>
              </div>
            </div>
          )}
          <p style={{ fontSize: '0.78rem', color: 'var(--gmp-text-light)', margin: '0 0 12px' }}>
            Os cards acima são o retrato da fila inteira — os filtros abaixo não mudam estes números.
          </p>

          <div className="almox-filters">
            <label htmlFor="notif-filtro-status" style={{ fontSize: '0.8rem', marginRight: 6 }}>Status</label>
            <select
              id="notif-filtro-status"
              className="almox-select"
              aria-label="Status da notificação"
              value={filtroStatus}
              onChange={(e) => setFiltroStatus(e.target.value)}
            >
              {STATUS_OPCOES.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
            </select>
            <label htmlFor="notif-filtro-evento" style={{ fontSize: '0.8rem', margin: '0 6px 0 12px' }}>Evento</label>
            <select
              id="notif-filtro-evento"
              className="almox-select"
              aria-label="Evento da notificação"
              value={filtroEvento}
              onChange={(e) => setFiltroEvento(e.target.value)}
            >
              {EVENTO_OPCOES.map((ev) => <option key={ev.value} value={ev.value}>{ev.label}</option>)}
            </select>
          </div>

          <div className="almox-table-container">
            {loading ? <SkeletonTable rows={6} columns={9} />
              : itens.length === 0 ? (
                <div className="almox-empty"><p>Nenhuma notificação encontrada</p></div>
              ) : (
                <table className="almox-table">
                  <thead>
                    <tr>
                      <th>Evento</th>
                      <th>Assunto</th>
                      <th>Destinatários</th>
                      <th>Status</th>
                      <th>Tentativas</th>
                      <th>Último erro</th>
                      <th>Criada em</th>
                      <th>Enviada em</th>
                      <th>Ações</th>
                    </tr>
                  </thead>
                  <tbody>
                    {itens.map((item) => {
                      const destinatarios = parseListaExibicao(item.destinatarios).join(', ') || '—';
                      return (
                        <tr key={item.id}>
                          <td>{item.evento}</td>
                          <td>{item.assunto}</td>
                          <td style={{ fontSize: '0.8rem' }}>{destinatarios}</td>
                          <td>
                            <span className={`almox-badge ${STATUS_BADGE_CLASS[item.status] || ''}`}>
                              {item.status}
                            </span>
                          </td>
                          <td>{item.tentativas ?? 0}</td>
                          <td style={{ maxWidth: 220, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={item.ultimo_erro || ''}>
                            {item.ultimo_erro || '—'}
                          </td>
                          <td>{formatDataHora(item.created_at)}</td>
                          <td>{formatDataHora(item.enviado_em)}</td>
                          <td>
                            {(
                              <button
                                type="button"
                                className="btn-almox-secondary"
                                style={{ fontSize: '0.75rem', padding: '4px 10px' }}
                                disabled={reenviando === item.id}
                                onClick={(e) => handleReenviar(item, e)}
                              >
                                <FiRefreshCw size={12} /> {reenviando === item.id ? 'Reenviando...' : 'Reenviar'}
                              </button>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}
          </div>
        </>
      )}
    </div>
  );
};

export default NotificacoesAlmoxarifado;
