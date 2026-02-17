import React, { useState, useEffect, useRef } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import api from '../services/api';
import { toast } from 'react-toastify';
import { FiPlus, FiFilter, FiDownload, FiEdit, FiTrash2, FiCheckCircle, FiFileText, FiX, FiEye, FiSettings, FiSearch, FiInfo } from 'react-icons/fi';
import { format } from 'date-fns';
import { exportToExcel } from '../utils/exportExcel';
import { SkeletonTable } from './SkeletonLoader';
import './Propostas.css';
import './Loading.css';

const Propostas = () => {
  const navigate = useNavigate();
  const [propostas, setPropostas] = useState([]);
  const [usuarios, setUsuarios] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filtroUsuario, setFiltroUsuario] = useState('');
  const [search, setSearch] = useState('');
  const [mostrarModalAssinatura, setMostrarModalAssinatura] = useState(false);
  const [propostaAssinatura, setPropostaAssinatura] = useState(null);
  const [assinaturas, setAssinaturas] = useState([]);
  const [carregandoAssinaturas, setCarregandoAssinaturas] = useState(false);
  const [aprovacoesMap, setAprovacoesMap] = useState({}); // Mapa de proposta_id -> temAprovacao
  const [itensPopoverId, setItensPopoverId] = useState(null);
  const [itensCache, setItensCache] = useState({});
  const [loadingItensId, setLoadingItensId] = useState(null);
  const [popoverAnchor, setPopoverAnchor] = useState(null); // { left, top } para posicionar o popover
  const loadDataRequestId = useRef(0);

  // Monta o descritivo de um item (material, espessura, etc.) a partir de especificacoes_tecnicas
  const getDescritivoItem = (item) => {
    let spec = {};
    try {
      const raw = item.especificacoes_tecnicas;
      if (raw) spec = typeof raw === 'string' ? JSON.parse(raw) : raw;
    } catch (_) {}
    const parts = [];
    if (spec.material_contato) parts.push(`Material: ${spec.material_contato}`);
    if (spec.espessura) parts.push(`Espessura: ${spec.espessura}`);
    if (spec.acabamento) parts.push(`Acabamento: ${spec.acabamento}`);
    if (spec.diametro) parts.push(`Diâmetro: ${spec.diametro}`);
    if (spec.funcao) parts.push(`Função: ${spec.funcao}`);
    if (spec.tratamento_termico) parts.push(`Trat. Térmico: ${spec.tratamento_termico}`);
    if (spec.velocidade_trabalho) parts.push(`Velocidade: ${spec.velocidade_trabalho}`);
    if (spec.ccm_incluso) parts.push(`CCM: ${spec.ccm_incluso}`);
    if (spec.ccm_tensao) parts.push(`Tensão CCM: ${spec.ccm_tensao}`);
    if (spec.celula_carga) parts.push(`Célula de Carga: ${spec.celula_carga}`);
    if (spec.plc_ihm) parts.push(`PLC/IHM: ${spec.plc_ihm}`);
    if (spec.valvula_saida_tanque) parts.push(`Válvula Saída: ${spec.valvula_saida_tanque}`);
    const totalCV = [spec.motor_central_cv, spec.motoredutor_central_cv, spec.motores_laterais_cv]
      .reduce((s, v) => s + (parseFloat(v) || 0), 0);
    if (totalCV > 0) parts.push(`Potência: ${totalCV.toFixed(1).replace('.', ',')} CV`);
    if (spec.classificacao_area) parts.push(`Class. Área: ${spec.classificacao_area}`);
    return parts.length ? parts.join(' • ') : null;
  };

  const carregarItensProposta = async (propostaId, event) => {
    const rect = event?.target?.getBoundingClientRect?.();
    if (rect) setPopoverAnchor({ left: rect.left, top: rect.bottom + 4 });
    if (itensCache[propostaId]) {
      setItensPopoverId(prev => prev === propostaId ? null : propostaId);
      return;
    }
    setLoadingItensId(propostaId);
    try {
      const res = await api.get(`/propostas/${propostaId}`);
      setItensCache(prev => ({ ...prev, [propostaId]: res.data.itens || [] }));
      setItensPopoverId(propostaId);
    } catch (e) {
      console.error('Erro ao carregar itens da proposta:', e);
      toast.error('Não foi possível carregar os itens da proposta.');
      setItensPopoverId(null);
    } finally {
      setLoadingItensId(null);
    }
  };

  const fecharPopoverItens = () => {
    setItensPopoverId(null);
    setPopoverAnchor(null);
  };

  // Função para verificar se uma proposta tem aprovação
  const verificarAprovacao = async (propostaId, margemDesconto) => {
    if (!propostaId || !margemDesconto || margemDesconto <= 5) {
      return true; // Se desconto <= 5%, não precisa de aprovação
    }

    try {
      const response = await api.get('/aprovacoes', {
        params: { proposta_id: propostaId, status: 'aprovado' }
      });
      
      const aprovacoesAprovadas = response.data || [];
      const temAprovacao = aprovacoesAprovadas.some(ap => 
        ap.proposta_id === propostaId && 
        ap.status === 'aprovado' && 
        ap.valor_desconto === margemDesconto
      );
      
      return temAprovacao;
    } catch (error) {
      console.error('Erro ao verificar aprovação:', error);
      return false; // Em caso de erro, considerar que não tem aprovação
    }
  };

  const loadData = async () => {
    const currentId = loadDataRequestId.current + 1;
    loadDataRequestId.current = currentId;
    setLoading(true);
    try {
      const params = {};
      if (filtroUsuario) params.responsavel_id = filtroUsuario;
      const searchVal = typeof search === 'string' ? search.trim() : '';
      if (searchVal) params.search = searchVal;

      const propostasRes = await api.get('/propostas', { params });
      if (loadDataRequestId.current !== currentId) return;
      let propostasData = Array.isArray(propostasRes.data) ? propostasRes.data : [];
      // Filtro local como garantia (número, título, razão social, nome fantasia)
      if (searchVal) {
        const term = searchVal.toLowerCase();
        propostasData = propostasData.filter((p) => {
          const num = (p.numero_proposta || '').toLowerCase();
          const tit = (p.titulo || '').toLowerCase();
          const cliente = (p.cliente_nome || '').toLowerCase();
          const fantasia = (p.cliente_nome_fantasia || '').toLowerCase();
          return num.includes(term) || tit.includes(term) || cliente.includes(term) || fantasia.includes(term);
        });
      }
      setPropostas(propostasData);

      // Verificar aprovações para propostas com desconto > 5%
      const aprovacoesPromises = propostasData
        .filter(p => p.margem_desconto > 5)
        .map(async (proposta) => {
          const temAprovacao = await verificarAprovacao(proposta.id, proposta.margem_desconto);
          return { propostaId: proposta.id, temAprovacao };
        });
      
      const aprovacoesResults = await Promise.all(aprovacoesPromises);
      if (loadDataRequestId.current !== currentId) return;
      const aprovacoesMapTemp = {};
      aprovacoesResults.forEach(({ propostaId, temAprovacao }) => {
        aprovacoesMapTemp[propostaId] = temAprovacao;
      });
      setAprovacoesMap(aprovacoesMapTemp);

      try {
        const usuariosRes = await api.get('/usuarios');
        if (loadDataRequestId.current !== currentId) return;
        setUsuarios((Array.isArray(usuariosRes.data) ? usuariosRes.data : []).filter(u => u.ativo !== 0 && u.ativo !== false));
      } catch (error) {
        if (loadDataRequestId.current !== currentId) return;
        console.warn('⚠️ Erro ao carregar usuários (não crítico):', error);
        setUsuarios([]);
      }
      } catch (error) {
        if (loadDataRequestId.current !== currentId) return;
        console.error('❌ Erro ao carregar dados:', error);
        console.error('❌ Detalhes do erro:', error.response?.data);
        toast.error('Erro ao carregar propostas. Verifique o console para mais detalhes.');
      } finally {
        if (loadDataRequestId.current === currentId) setLoading(false);
      }
  };

  useEffect(() => {
    const timeoutId = setTimeout(() => {
      loadData();
    }, 300);

    return () => clearTimeout(timeoutId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filtroUsuario, search]);

  const formatCurrency = (value) => {
    return new Intl.NumberFormat('pt-BR', {
      style: 'currency',
      currency: 'BRL'
    }).format(value || 0);
  };

  const getStatusColor = (status) => {
    const colors = {
      'rascunho': '#95a5a6',
      'enviada': '#3498db',
      'aprovada': '#2ecc71',
      'rejeitada': '#e74c3c',
      'cancelada': '#7f8c8d'
    };
    return colors[status] || '#95a5a6';
  };

  const handleAssinar = async (proposta) => {
    setPropostaAssinatura(proposta);
    setMostrarModalAssinatura(true);
    await carregarAssinaturas(proposta.id);
  };

  const carregarAssinaturas = async (propostaId) => {
    try {
      setCarregandoAssinaturas(true);
      const response = await api.get(`/propostas/${propostaId}/assinaturas`);
      setAssinaturas(response.data || []);
    } catch (error) {
      console.error('Erro ao carregar assinaturas:', error);
      setAssinaturas([]);
    } finally {
      setCarregandoAssinaturas(false);
    }
  };

  const confirmarAssinatura = async () => {
    if (!propostaAssinatura) return;
    
    try {
      await api.post(`/propostas/${propostaAssinatura.id}/assinar`, {
        tipo_assinatura: 'eletronica',
        dados_assinatura: {
          metodo: 'sistema',
          timestamp: new Date().toISOString(),
          usuario: JSON.parse(localStorage.getItem('user'))?.nome
        }
      });
      
      alert('Proposta assinada com sucesso!');
      setMostrarModalAssinatura(false);
      setPropostaAssinatura(null);
      // Recarregar propostas
      loadData();
    } catch (error) {
      console.error('Erro ao assinar proposta:', error);
      toast.error('Erro ao assinar proposta. Tente novamente.');
    }
  };

  const handleDelete = async (id, numeroProposta) => {
    if (window.confirm(`Tem certeza que deseja excluir a proposta ${numeroProposta}?\n\nEsta ação não pode ser desfeita.`)) {
      try {
        await api.delete(`/propostas/${id}`);
        // Recarregar a lista
        loadData();
        toast.success('Proposta excluída com sucesso!');
      } catch (error) {
        console.error('Erro ao excluir proposta:', error);
        toast.error(error.response?.data?.error || 'Erro ao excluir proposta');
      }
    }
  };

  const handleExportExcel = () => {
    try {
      const dadosExport = propostas.map(proposta => ({
        'Número': proposta.numero_proposta || '',
        'Cliente': proposta.cliente_nome || '',
        'Título': proposta.titulo || '',
        'Valor Total': proposta.valor_total ? `R$ ${parseFloat(proposta.valor_total).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}` : 'R$ 0,00',
        'Status': proposta.status || '',
        'Validade': proposta.validade ? format(new Date(proposta.validade), 'dd/MM/yyyy') : '',
        'Criado em': proposta.created_at ? format(new Date(proposta.created_at), 'dd/MM/yyyy') : '',
        'Responsável': proposta.responsavel_nome || ''
      }));
      
      exportToExcel(dadosExport, 'propostas', 'Propostas');
      toast.success('Exportação realizada com sucesso!');
    } catch (error) {
      toast.error('Erro ao exportar dados');
      console.error('Erro ao exportar:', error);
    }
  };


  return (
    <div className="propostas">
      <div className="page-header">
        <div>
          <h1>Propostas</h1>
          <p>Gestão de propostas comerciais</p>
        </div>
        <div className="header-actions">
          <button onClick={handleExportExcel} className="btn-secondary" title="Exportar para Excel (Ctrl+E)">
            <FiDownload /> Exportar Excel
          </button>
          <Link to="/comercial/propostas/editor-template" className="btn-secondary" title="Editor de Template">
            <FiSettings /> Editor de Template
          </Link>
          <Link to="/comercial/propostas/nova" className="btn-premium">
            <div className="btn-premium-icon">
              <FiPlus size={20} />
            </div>
            <span className="btn-premium-text">Nova Proposta</span>
            <div className="btn-premium-shine"></div>
          </Link>
        </div>
      </div>

      <div className="filters">
        <div className="search-box">
          <FiSearch />
          <input
            type="text"
            placeholder="Buscar por número, título, razão social ou nome fantasia..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <div className="filter-group">
          <FiFilter />
          <select
            value={filtroUsuario}
            onChange={(e) => setFiltroUsuario(e.target.value)}
            className="filter-select"
          >
            <option value="">Todos os responsáveis</option>
            {usuarios.map(usuario => (
              <option key={usuario.id} value={usuario.id}>
                {usuario.nome}
              </option>
            ))}
          </select>
        </div>
      </div>

      {loading ? (
        <SkeletonTable rows={8} columns={8} />
      ) : (
        <div className="table-container">
          <table className="data-table">
          <thead>
            <tr>
              <th>Número</th>
              <th>Título</th>
              <th>Cliente</th>
              <th>Valor Total</th>
              <th>Validade</th>
              <th>Status</th>
              <th>Criado em</th>
              <th>Ações</th>
            </tr>
          </thead>
          <tbody>
            {propostas.length === 0 ? (
              <tr>
                <td colSpan="8" className="no-data">
                  Nenhuma proposta encontrada
                </td>
              </tr>
            ) : (
              Array.isArray(propostas) ? (
                propostas.map(proposta => (
                    <tr key={proposta.id}>
                      <td><strong>{proposta.numero_proposta || 'N/A'}</strong></td>
                      <td className="proposta-titulo-cell">
                        <span className="proposta-titulo-texto">{proposta.titulo || 'Sem título'}</span>
                        <button
                          type="button"
                          className="proposta-titulo-info"
                          title="Ver descritivo dos itens orçados"
                          onClick={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            if (loadingItensId === proposta.id) return;
                            if (itensPopoverId === proposta.id) fecharPopoverItens();
                            else carregarItensProposta(proposta.id, e);
                          }}
                          disabled={!!loadingItensId && loadingItensId !== proposta.id}
                        >
                          {loadingItensId === proposta.id ? (
                            <span className="proposta-titulo-info-spinner" />
                          ) : (
                            <FiInfo size={14} />
                          )}
                        </button>
                      </td>
                      <td>
                        <span className="cliente-razao">{proposta.cliente_nome || 'Cliente não encontrado'}</span>
                        {proposta.cliente_nome_fantasia && proposta.cliente_nome_fantasia !== proposta.cliente_nome && (
                          <span className="cliente-fantasia"> ({proposta.cliente_nome_fantasia})</span>
                        )}
                      </td>
                      <td>{formatCurrency(proposta.valor_total || 0)}</td>
                      <td>
                        {proposta.validade
                          ? format(new Date(proposta.validade), 'dd/MM/yyyy')
                          : '-'}
                      </td>
                      <td>
                        <span
                          className="status-badge"
                          style={{ background: getStatusColor(proposta.status || 'rascunho') }}
                        >
                          {(proposta.status || 'rascunho').toUpperCase()}
                        </span>
                      </td>
                      <td>
                        {proposta.created_at
                          ? format(new Date(proposta.created_at), 'dd/MM/yyyy')
                          : '-'}
                      </td>
                      <td>
                        <div className="action-buttons">
                          {(() => {
                            // Verificar se pode gerar preview premium
                            const podeGerarPreview = !(proposta.margem_desconto > 5 && !aprovacoesMap[proposta.id]);
                            
                            return (
                              <>
                                <button
                                  className="btn-icon"
                                  onClick={async () => {
                                    if (!podeGerarPreview) {
                                      toast.warning('Esta proposta precisa de aprovação de desconto antes de gerar o preview premium. Solicite a aprovação na aba "Aprovações".');
                                      return;
                                    }
                                    try {
                                      const response = await api.get(`/propostas/${proposta.id}/premium`, {
                                        responseType: 'text'
                                      });
                                      const blob = new Blob([response.data], { type: 'text/html; charset=utf-8' });
                                      const url = window.URL.createObjectURL(blob);
                                      const newWindow = window.open(url, '_blank');
                                      if (!newWindow) {
                                        alert('Por favor, permita pop-ups para visualizar o preview');
                                      }
                                    } catch (error) {
                                      console.error('Erro ao carregar preview:', error);
                                      alert('Erro ao carregar preview da proposta: ' + (error.response?.data?.error || error.message));
                                    }
                                  }}
                                  title={podeGerarPreview ? "Visualizar Proposta Premium" : "Esta proposta precisa de aprovação de desconto antes de gerar o preview premium"}
                                  style={{ 
                                    background: podeGerarPreview ? '#FF6B35' : '#ccc',
                                    color: 'white',
                                    cursor: podeGerarPreview ? 'pointer' : 'not-allowed',
                                    opacity: podeGerarPreview ? 1 : 0.6
                                  }}
                                  disabled={!podeGerarPreview}
                                >
                                  <FiEye />
                                </button>
                                {(() => {
                                  // Verificar se pode assinar
                                  const podeAssinar = (proposta.status === 'enviada' || proposta.status === 'rascunho') && 
                                                      podeGerarPreview; // Só pode assinar se pode gerar preview
                                  
                                  return podeAssinar ? (
                                    <button
                                      onClick={() => handleAssinar(proposta)}
                                      className="btn-icon btn-success"
                                      title="Assinar Digitalmente"
                                    >
                                      <FiCheckCircle />
                                    </button>
                                  ) : null;
                                })()}
                              </>
                            );
                          })()}
                          <Link
                            to={`/comercial/propostas/editar/${proposta.id}`}
                            className="btn-icon"
                            title="Editar"
                          >
                            <FiEdit />
                          </Link>
                          <button
                            onClick={() => handleDelete(proposta.id, proposta.numero_proposta)}
                            className="btn-icon btn-danger"
                            title="Excluir"
                            style={{
                              display: 'inline-flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              minWidth: '32px',
                              minHeight: '32px'
                            }}
                          >
                            <FiTrash2 style={{ width: '20px', height: '20px', display: 'block', color: '#e74c3c', fill: '#e74c3c' }} />
                          </button>
                        </div>
                      </td>
                    </tr>
                ))
              ) : (
                <tr>
                  <td colSpan="8" className="no-data" style={{ color: 'red' }}>
                    Erro: dados não são um array. Tipo: {typeof propostas}
                  </td>
                </tr>
              )
            )}
          </tbody>
        </table>
      </div>
      )}

      {/* Popover descritivo dos itens orçados */}
      {itensPopoverId != null && (
        <>
          <div className="proposta-itens-popover-backdrop" onClick={fecharPopoverItens} aria-hidden="true" />
          <div
            className="proposta-itens-popover"
            role="dialog"
            aria-label="Descritivo dos itens orçados"
            style={
              popoverAnchor
                ? { left: popoverAnchor.left, top: popoverAnchor.top, position: 'fixed' }
                : undefined
            }
            onClick={(e) => e.stopPropagation()}
          >
            <div className="proposta-itens-popover-header">
              <span>Itens orçados</span>
              <button type="button" className="proposta-itens-popover-fechar" onClick={fecharPopoverItens} aria-label="Fechar">
                <FiX />
              </button>
            </div>
            <div className="proposta-itens-popover-body">
              {loadingItensId === itensPopoverId ? (
                <div className="proposta-itens-popover-loading">Carregando...</div>
              ) : Array.isArray(itensCache[itensPopoverId]) && itensCache[itensPopoverId].length === 0 ? (
                <div className="proposta-itens-popover-empty">Nenhum item nesta proposta.</div>
              ) : (
                <ul className="proposta-itens-popover-lista">
                  {(itensCache[itensPopoverId] || []).map((item, idx) => {
                    const descritivo = getDescritivoItem(item);
                    const nome = item.descricao || item.produto_nome || `Item ${idx + 1}`;
                    return (
                      <li key={item.id || idx} className="proposta-itens-popover-item">
                        <div className="proposta-itens-popover-item-nome">{nome}</div>
                        {descritivo && (
                          <div className="proposta-itens-popover-item-descritivo">{descritivo}</div>
                        )}
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          </div>
        </>
      )}

      {/* Modal de Assinatura Digital */}
      {mostrarModalAssinatura && propostaAssinatura && (
        <div className="modal-overlay" onClick={() => { setMostrarModalAssinatura(false); setPropostaAssinatura(null); }}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '600px' }}>
            <div className="modal-header">
              <h2><FiFileText /> Assinatura Digital - {propostaAssinatura.numero_proposta}</h2>
              <button className="modal-close" onClick={() => { setMostrarModalAssinatura(false); setPropostaAssinatura(null); }}>
                <FiX />
              </button>
            </div>
            <div className="modal-body">
              <div className="assinatura-info">
                <h3>Proposta: {propostaAssinatura.titulo}</h3>
                <p><strong>Cliente:</strong> {propostaAssinatura.cliente_nome}</p>
                <p><strong>Valor:</strong> {formatCurrency(propostaAssinatura.valor_total || 0)}</p>
              </div>

              {carregandoAssinaturas ? (
                <p>Carregando histórico de assinaturas...</p>
              ) : assinaturas.length > 0 ? (
                <div className="assinaturas-historico">
                  <h4>Histórico de Assinaturas:</h4>
                  {assinaturas.map((assinatura) => (
                    <div key={assinatura.id} className="assinatura-item">
                      <div>
                        <strong>{assinatura.usuario_nome || 'Usuário'}</strong>
                        <small>{new Date(assinatura.created_at).toLocaleString('pt-BR')}</small>
                      </div>
                      <span className="status-badge" style={{ background: '#10b981' }}>
                        ASSINADA
                      </span>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="assinatura-form">
                  <p>Esta proposta ainda não foi assinada digitalmente.</p>
                  <p>Deseja assinar agora?</p>
                  <button onClick={confirmarAssinatura} className="btn-primary" style={{ width: '100%', marginTop: '1rem' }}>
                    <FiCheckCircle /> Confirmar Assinatura Digital
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Propostas;

