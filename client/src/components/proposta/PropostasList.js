import React, { useState, useEffect, useCallback } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import api from '../../services/api';
import { useAuth } from '../../context/AuthContext';
import { getEffectiveUser } from '../../services/permissionsCache';
import { canAccessAdministrativoConfig } from '../../utils/systemPermissions';
import { useComercialResponsaveis } from '../../hooks/useComercialResponsaveis';
import { toast } from 'react-toastify';
import { FiPlus, FiSearch, FiSettings, FiEye, FiDownload, FiEdit, FiTrash2, FiSend, FiCheck, FiX, FiCopy, FiRotateCcw, FiFileText, FiMoreHorizontal } from 'react-icons/fi';
import { formatDateBR, formatDateTimeBR, normalizePropostasResponse, isPropostaInativa } from '../../utils/formatDate';
import './PropostasList.css';

const STATUS = {
  rascunho: 'Rascunho',
  desconto_aprovado: 'Desconto aprovado',
  em_revisao: 'Em revisão',
  aprovada_internamente: 'Aprovada internamente',
  enviada: 'Enviada',
  visualizada: 'Visualizada',
  aceita: 'Aceita',
  aprovada: 'Aprovada',
  rejeitada: 'Rejeitada',
  cancelada: 'Cancelada',
  expirada: 'Expirada'
};
const TIPOS = { comercial: 'Comercial', tecnica: 'Técnica', orcamento: 'Orçamento', aditivo: 'Aditivo' };

export default function PropostasList() {
  const navigate = useNavigate();
  const { user, loading: authLoading } = useAuth();
  const effectiveUser = getEffectiveUser(user);
  const canConfigTemplate = canAccessAdministrativoConfig(effectiveUser);
  const isAdmin = String(user?.role || '').toLowerCase() === 'admin';
  const { usuarios, loading: usuariosLoading, ready: usuariosReady } = useComercialResponsaveis(user, authLoading);
  const [list, setList] = useState([]);
  // Celular: qual proposta abriu o "…", e se a folha de filtros está aberta.
  const [acoesDe, setAcoesDe] = useState(null);
  const [filtrosAbertos, setFiltrosAbertos] = useState(false);
  const [oportunidades, setOportunidades] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  const [filterTipo, setFilterTipo] = useState('');
  const [filterOportunidade, setFilterOportunidade] = useState('');
  const [filterResponsavel, setFilterResponsavel] = useState('');
  const [showInativas, setShowInativas] = useState(false);
  const [rejeitarId, setRejeitarId] = useState(null);
  const [rejeitarMotivo, setRejeitarMotivo] = useState('');
  const [pdfId, setPdfId] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = {};
      if (search.trim()) params.search = search.trim();
      if (filterStatus) params.status = filterStatus;
      if (filterTipo) params.tipo_proposta = filterTipo;
      if (filterOportunidade) params.oportunidade_id = filterOportunidade;
      if (filterResponsavel) params.responsavel_id = filterResponsavel;
      if (isAdmin && showInativas) params.incluir_inativas = 'true';
      const { data } = await api.get('/propostas', { params });
      setList(normalizePropostasResponse(data));
    } catch (e) {
      toast.error('Erro ao carregar propostas.');
      setList([]);
    } finally {
      setLoading(false);
    }
  }, [search, filterStatus, filterTipo, filterOportunidade, filterResponsavel, isAdmin, showInativas]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    api.get('/oportunidades', { params: { status: 'ativa' } }).then(r => setOportunidades(Array.isArray(r.data) ? r.data : [])).catch(() => setOportunidades([]));
  }, []);

  const formatMoney = (v) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(Number(v) || 0);

  const renderValorComDesconto = (p) => {
    const bruto = Number(p.valor_total) || 0;
    const desconto = Number(p.margem_desconto) || 0;
    if (desconto <= 0) return formatMoney(bruto);
    const liquido = Math.max(0, bruto * (1 - desconto / 100));
    return (
      <div className="propostas-list-valor-desconto" title={`Desconto de ${desconto.toFixed(2)}%`}>
        <span className="propostas-list-valor-antigo">{formatMoney(bruto)}</span>
        <strong className="propostas-list-valor-novo">{formatMoney(liquido)}</strong>
      </div>
    );
  };

  const isRascunho = (s) => s === 'rascunho';
  const isDescontoAprovado = (s) => s === 'desconto_aprovado';
  const documentoBloqueado = (s) => s === 'rascunho' || s === 'desconto_aprovado';
  const podeEnviar = (s) => s === 'rascunho' || s === 'desconto_aprovado';

  const abrirPreview = (id, status) => {
    if (documentoBloqueado(status)) {
      toast.info(isDescontoAprovado(status)
        ? 'Clique em Enviar proposta para liberar o documento.'
        : 'Envie a proposta para gerar o documento automático.');
      return;
    }
    window.open(`/comercial/propostas/${id}/preview-editavel`, '_blank');
  };

  const baixarPdf = async (id, numero, status) => {
    if (documentoBloqueado(status)) {
      toast.info(isDescontoAprovado(status)
        ? 'Clique em Enviar proposta para liberar o PDF.'
        : 'Envie a proposta para gerar o PDF.');
      return;
    }
    if (pdfId) return;
    setPdfId(id);
    try {
      const { data } = await api.get(`/propostas/${id}/pdf`, { responseType: 'blob' });
      const url = URL.createObjectURL(new Blob([data], { type: 'application/pdf' }));
      const a = document.createElement('a');
      a.href = url;
      a.download = `proposta-${String(numero || id).replace(/[/\\]/g, '-')}.pdf`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success('PDF baixado.');
    } catch (e) {
      toast.error(e.response?.data?.error || 'Erro ao gerar PDF.');
    } finally {
      setPdfId(null);
    }
  };

  const acao = async (acaoNome, id, extra) => {
    try {
      if (acaoNome === 'enviar') await api.post(`/propostas/${id}/enviar`);
      else if (acaoNome === 'aceitar') await api.post(`/propostas/${id}/aceitar`, { observacao: extra?.observacao });
      else if (acaoNome === 'rejeitar') {
        await api.post(`/propostas/${id}/rejeitar`, { motivo_rejeicao: extra?.motivo, observacao: extra?.motivo });
        setRejeitarId(null);
        setRejeitarMotivo('');
      } else if (acaoNome === 'nova-revisao') await api.post(`/propostas/${id}/nova-revisao`);
      else if (acaoNome === 'clone') {
        const { data } = await api.post(`/propostas/${id}/clone`);
        toast.success('Proposta clonada.');
        navigate(`/comercial/propostas/editar/${data.id}`);
        return;
      } else if (acaoNome === 'excluir') {
        await api.delete(`/propostas/${id}`);
        toast.success('Proposta inativada.');
      }
      if (acaoNome !== 'clone') toast.success('Ação concluída.');
      load();
    } catch (e) {
      toast.error(e.response?.data?.error || 'Erro na ação.');
    }
  };

  const podeAceitarRejeitar = (s) => s === 'enviada' || s === 'visualizada';
  const podeNovaRevisao = (s) => ['enviada', 'visualizada', 'aceita', 'aprovada', 'rejeitada', 'cancelada', 'expirada'].includes(s);
  const isInativa = isPropostaInativa;
  const podeExcluir = (p) => isAdmin || isRascunho(p?.status);
  const confirmExcluir = (p) => {
    const numero = p?.numero_proposta || `#${p?.id}`;
    const st = STATUS[p?.status] || p?.status || '—';
    const inativar = !isRascunho(p?.status);
    return window.confirm(
      inativar
        ? `Inativar a proposta ${numero}?\n\nStatus atual: ${st}\n\nA proposta ficará oculta da listagem, mas os vínculos no sistema serão preservados.`
        : `Tem certeza que deseja inativar a proposta ${numero}?\n\nStatus atual: ${st}`
    );
  };

  return (
    <div className="propostas-list">
      <header className="propostas-list-header">
        <h1>Propostas</h1>
        <div className="propostas-list-actions">
          {canConfigTemplate && (
            <Link to="/configuracoes" state={{ tab: 'template-proposta' }} className="btn btn-sec">
              <FiSettings /> Config. template
            </Link>
          )}
          <Link to="/comercial/propostas/nova" className="btn btn-pri">
            <FiPlus /> Nova proposta
          </Link>
        </div>
      </header>

      <div className="propostas-list-filters">
        <div className="propostas-list-search">
          <FiSearch />
          <input type="text" placeholder="Buscar por número, título ou cliente..." value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        <select value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)}>
          <option value="">Status</option>
          {Object.entries(STATUS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
        <select value={filterTipo} onChange={(e) => setFilterTipo(e.target.value)}>
          <option value="">Tipo</option>
          {Object.entries(TIPOS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
        <select value={filterOportunidade} onChange={(e) => setFilterOportunidade(e.target.value)}>
          <option value="">Oportunidade</option>
          {oportunidades.map(o => <option key={o.id} value={o.id}>{o.titulo || `#${o.id}`}</option>)}
        </select>
        <select
          value={filterResponsavel}
          onChange={(e) => setFilterResponsavel(e.target.value)}
          disabled={!usuariosReady || usuariosLoading}
        >
          <option value="">{usuariosLoading ? 'Carregando responsáveis...' : 'Responsável'}</option>
          {usuariosReady && usuarios.map(u => <option key={u.id} value={u.id}>{u.nome}</option>)}
        </select>
        {isAdmin && (
          <label className="propostas-list-toggle-inativas">
            <input
              type="checkbox"
              checked={showInativas}
              onChange={(e) => setShowInativas(e.target.checked)}
            />
            Mostrar inativas
          </label>
        )}
      </div>

      {/* ══ CELULAR ══════════════════════════════════════════════════════════
          A tabela e a barra de filtros do desktop somem por CSS em ≤768px; isto
          entra no lugar. Os dados, as permissões e TODAS as ações vêm dos mesmos
          handlers usados pela tabela — nenhuma regra é reescrita aqui. */}
      <div className="plm">
        <div className="plm-topo">
          <span className="plm-contagem">
            {loading ? 'Carregando…'
              : `${list.length} ${list.length === 1 ? 'proposta' : 'propostas'}`}
          </span>
          <Link to="/comercial/propostas/nova" className="plm-nova">
            <FiPlus size={16} /> Nova
          </Link>
        </div>

        <div className="plm-busca">
          <FiSearch size={17} />
          <input
            type="text"
            placeholder="Buscar proposta, cliente…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          {search && (
            <button type="button" onClick={() => setSearch('')} aria-label="Limpar busca">
              <FiX size={16} />
            </button>
          )}
        </div>

        {/* O filtro mais usado vira fileira de chips; o resto fica atrás do botão.
            Era o bloco de quatro selects empilhados que comia a tela inteira. */}
        <div className="plm-chips">
          <button
            type="button"
            className={`plm-chip${filterStatus === '' ? ' is-on' : ''}`}
            onClick={() => setFilterStatus('')}
          >
            Todas
          </button>
          {['rascunho', 'enviada', 'aceita', 'rejeitada'].map((k) => (
            <button
              key={k}
              type="button"
              className={`plm-chip${filterStatus === k ? ' is-on' : ''}`}
              onClick={() => setFilterStatus(filterStatus === k ? '' : k)}
            >
              {STATUS[k]}
            </button>
          ))}
          <button
            type="button"
            className="plm-chip plm-chip-filtros"
            onClick={() => setFiltrosAbertos(true)}
          >
            <FiSettings size={14} /> Filtros
            {(() => {
              const n = [filterTipo, filterOportunidade, filterResponsavel].filter(Boolean).length
                + (showInativas ? 1 : 0);
              return n > 0 ? <span className="plm-qtd">{n}</span> : null;
            })()}
          </button>
        </div>

        <div className="plm-lista">
          {loading ? null : list.length === 0 ? (
            <div className="plm-vazio">
              <FiFileText size={28} />
              <span>Nenhuma proposta encontrada.</span>
            </div>
          ) : list.map((p, index) => {
            const bloqueado = documentoBloqueado(p.status);
            return (
              <article
                className={`plm-card${isInativa(p) ? ' is-inativa' : ''}`}
                key={p.id ?? `pm-${index}`}
              >
                {/* O cartão inteiro leva ao detalhe — na tabela só o número levava. */}
                <Link to={`/comercial/propostas/detalhe/${p.id}`} className="plm-toque">
                  <div className="plm-linha1">
                    <span className="plm-numero">{p.numero_proposta || '—'}</span>
                    <span className="plm-status" data-status={p.status}>
                      {isInativa(p) ? 'Inativa' : (STATUS[p.status] || p.status || '—')}
                    </span>
                  </div>

                  <div className="plm-titulo">{p.titulo || 'Sem título'}</div>
                  <span className="plm-cliente">
                    {p.cliente_nome || p.cliente_nome_fantasia || 'Sem cliente'}
                  </span>

                  <div className="plm-valor">{renderValorComDesconto(p)}</div>
                  <div className="plm-meta">
                    {TIPOS[p.tipo_proposta] || 'Sem tipo'}
                    {' · Validade '}{formatDateBR(p.validade) || '—'}
                    {p.enviada_em ? ` · Enviada ${formatDateTimeBR(p.enviada_em)}` : ''}
                  </div>
                </Link>

                <div className="plm-acts">
                  <button
                    type="button"
                    className="plm-act is-destaque"
                    onClick={() => abrirPreview(p.id, p.status)}
                    disabled={bloqueado}
                    title={bloqueado ? 'Disponível após enviar a proposta' : 'Ver proposta'}
                  >
                    <FiEye size={16} /> Ver
                  </button>
                  <button
                    type="button"
                    className="plm-act"
                    onClick={() => baixarPdf(p.id, p.numero_proposta, p.status)}
                    disabled={bloqueado || pdfId === p.id}
                  >
                    <FiDownload size={16} /> {pdfId === p.id ? '…' : 'PDF'}
                  </button>
                  <button
                    type="button"
                    className="plm-act plm-act-mais"
                    onClick={() => setAcoesDe(p)}
                    aria-label="Mais ações"
                  >
                    <FiMoreHorizontal size={19} />
                  </button>
                </div>
              </article>
            );
          })}
        </div>
      </div>

      {/* ── folha de ações ──────────────────────────────────────────────────
          Cada ação aparece sob a MESMA condição da tabela (podeEnviar,
          podeAceitarRejeitar, podeNovaRevisao, podeExcluir) — e agora com
          TEXTO, não sete ícones de 20px lado a lado. */}
      {acoesDe && (
        <div className="plm-fundo" onClick={() => setAcoesDe(null)}>
          <div className="plm-folha" onClick={(e) => e.stopPropagation()}>
            <div className="plm-puxador" />
            <div className="plm-folha-tit">
              {acoesDe.numero_proposta || 'Proposta'} · {acoesDe.titulo || 'Sem título'}
            </div>

            {podeEnviar(acoesDe.status) && (
              <button type="button" className="plm-op"
                onClick={() => { const x = acoesDe; setAcoesDe(null); acao('enviar', x.id); }}>
                <FiSend size={18} /> Enviar proposta
              </button>
            )}
            {podeAceitarRejeitar(acoesDe.status) && (
              <>
                <button type="button" className="plm-op"
                  onClick={() => { const x = acoesDe; setAcoesDe(null); acao('aceitar', x.id); }}>
                  <FiCheck size={18} /> Marcar como aceita
                </button>
                <button type="button" className="plm-op"
                  onClick={() => { const x = acoesDe; setAcoesDe(null); setRejeitarId(x); }}>
                  <FiX size={18} /> Marcar como rejeitada
                </button>
              </>
            )}
            {podeNovaRevisao(acoesDe.status) && (
              <button type="button" className="plm-op"
                onClick={() => { const x = acoesDe; setAcoesDe(null); acao('nova-revisao', x.id); }}>
                <FiRotateCcw size={18} /> Criar nova revisão
              </button>
            )}
            {!isInativa(acoesDe) && (
              <Link to={`/comercial/propostas/editar/${acoesDe.id}`} className="plm-op"
                onClick={() => setAcoesDe(null)}>
                <FiEdit size={18} /> Editar
              </Link>
            )}
            <button type="button" className="plm-op"
              onClick={() => { const x = acoesDe; setAcoesDe(null); acao('clone', x.id); }}>
              <FiCopy size={18} /> Duplicar
            </button>
            {podeExcluir(acoesDe) && !isInativa(acoesDe) && (
              <button type="button" className="plm-op is-danger"
                onClick={() => {
                  const x = acoesDe;
                  setAcoesDe(null);
                  if (confirmExcluir(x)) acao('excluir', x.id);
                }}>
                <FiTrash2 size={18} /> Inativar proposta
              </button>
            )}
          </div>
        </div>
      )}

      {/* ── folha de filtros ───────────────────────────────────────────────── */}
      {filtrosAbertos && (
        <div className="plm-fundo" onClick={() => setFiltrosAbertos(false)}>
          <div className="plm-folha" onClick={(e) => e.stopPropagation()}>
            <div className="plm-puxador" />
            <div className="plm-folha-tit">Filtros</div>

            <label className="plm-campo">
              <span>Tipo</span>
              <select value={filterTipo} onChange={(e) => setFilterTipo(e.target.value)}>
                <option value="">Todos os tipos</option>
                {Object.entries(TIPOS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
            </label>

            <label className="plm-campo">
              <span>Oportunidade</span>
              <select value={filterOportunidade} onChange={(e) => setFilterOportunidade(e.target.value)}>
                <option value="">Todas</option>
                {oportunidades.map((o) => (
                  <option key={o.id} value={o.id}>{o.titulo || `#${o.id}`}</option>
                ))}
              </select>
            </label>

            <label className="plm-campo">
              <span>Responsável</span>
              <select
                value={filterResponsavel}
                onChange={(e) => setFilterResponsavel(e.target.value)}
                disabled={!usuariosReady || usuariosLoading}
              >
                <option value="">{usuariosLoading ? 'Carregando…' : 'Todos'}</option>
                {usuariosReady && usuarios.map((u) => (
                  <option key={u.id} value={u.id}>{u.nome}</option>
                ))}
              </select>
            </label>

            {isAdmin && (
              <label className="plm-check">
                <input
                  type="checkbox"
                  checked={showInativas}
                  onChange={(e) => setShowInativas(e.target.checked)}
                />
                Mostrar propostas inativas
              </label>
            )}

            <div className="plm-folha-rodape">
              <button type="button" className="plm-limpar"
                onClick={() => {
                  setFilterTipo('');
                  setFilterOportunidade('');
                  setFilterResponsavel('');
                  setShowInativas(false);
                }}>
                Limpar
              </button>
              <button type="button" className="plm-aplicar" onClick={() => setFiltrosAbertos(false)}>
                Ver resultados
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="propostas-list-table-wrap">
        {loading ? (
          <p className="propostas-list-loading">Carregando...</p>
        ) : (
          <table className="propostas-list-table">
            <thead>
              <tr>
                <th>Número</th>
                <th>Título</th>
                <th>Cliente</th>
                <th>Tipo</th>
                <th>Valor</th>
                <th>Validade</th>
                <th>Status</th>
                <th>Enviada em</th>
                <th>Ações</th>
              </tr>
            </thead>
            <tbody>
              {list.length === 0 ? (
                <tr><td colSpan="9" className="propostas-list-empty">Nenhuma proposta encontrada.</td></tr>
              ) : list.map((p, index) => (
                <tr key={p.id ?? `proposta-${index}`} className={isInativa(p) ? 'propostas-list-row-inativa' : ''}>
                  <td>
                    <Link to={`/comercial/propostas/detalhe/${p.id}`} className="link-num">{p.numero_proposta || '—'}</Link>
                    {isInativa(p) && <span className="badge badge-inativa">Inativa</span>}
                  </td>
                  <td>{p.titulo || '—'}</td>
                  <td>{p.cliente_nome || p.cliente_nome_fantasia || '—'}</td>
                  <td>{TIPOS[p.tipo_proposta] || '—'}</td>
                  <td>{renderValorComDesconto(p)}</td>
                  <td>{formatDateBR(p.validade)}</td>
                  <td><span className="badge" data-status={p.status}>{STATUS[p.status] || p.status || '—'}</span></td>
                  <td>{formatDateTimeBR(p.enviada_em)}</td>
                  <td>
                    <div className="propostas-list-cell-actions">
                      <button
                        type="button"
                        title={documentoBloqueado(p.status) ? 'Disponível após enviar a proposta' : 'Ver proposta'}
                        onClick={() => abrirPreview(p.id, p.status)}
                        disabled={documentoBloqueado(p.status)}
                      >
                        <FiEye />
                      </button>
                      <button
                        type="button"
                        title={documentoBloqueado(p.status) ? 'Disponível após enviar a proposta' : 'PDF'}
                        onClick={() => baixarPdf(p.id, p.numero_proposta, p.status)}
                        disabled={documentoBloqueado(p.status) || pdfId === p.id}
                      >
                        {pdfId === p.id ? '...' : <FiDownload />}
                      </button>
                      {podeEnviar(p.status) && (
                        <button
                          type="button"
                          className={isDescontoAprovado(p.status) ? 'btn-enviar-proposta is-pulse' : undefined}
                          title="Enviar proposta"
                          onClick={() => acao('enviar', p.id)}
                        >
                          <FiSend />
                          {isDescontoAprovado(p.status) ? <span className="btn-enviar-label">Enviar proposta</span> : null}
                        </button>
                      )}
                      {podeAceitarRejeitar(p.status) && (
                        <>
                          <button type="button" title="Aceitar" onClick={() => acao('aceitar', p.id)}><FiCheck /></button>
                          <button type="button" title="Rejeitar" onClick={() => setRejeitarId(p)}><FiX /></button>
                        </>
                      )}
                      {podeNovaRevisao(p.status) && <button type="button" title="Nova revisão" onClick={() => acao('nova-revisao', p.id)}><FiRotateCcw /></button>}
                      <button type="button" title="Clonar" onClick={() => acao('clone', p.id)}><FiCopy /></button>
                      {!isInativa(p) && <Link to={`/comercial/propostas/editar/${p.id}`} title="Editar"><FiEdit /></Link>}
                      {podeExcluir(p) && !isInativa(p) && (
                        <button
                          type="button"
                          title={isRascunho(p.status) ? 'Inativar' : 'Inativar (admin)'}
                          onClick={() => confirmExcluir(p) && acao('excluir', p.id)}
                        >
                          <FiTrash2 />
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {rejeitarId && (
        <div className="propostas-list-modal-overlay" onClick={() => setRejeitarId(null)}>
          <div className="propostas-list-modal" onClick={e => e.stopPropagation()}>
            <h3>Rejeitar proposta</h3>
            <p>Motivo (opcional):</p>
            <textarea value={rejeitarMotivo} onChange={e => setRejeitarMotivo(e.target.value)} rows={3} />
            <div className="propostas-list-modal-btns">
              <button type="button" className="btn btn-sec" onClick={() => setRejeitarId(null)}>Cancelar</button>
              <button type="button" className="btn btn-pri" onClick={() => acao('rejeitar', rejeitarId.id, { motivo: rejeitarMotivo })}>Rejeitar</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
