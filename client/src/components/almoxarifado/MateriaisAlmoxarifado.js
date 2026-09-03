import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import api from '../../services/api';
import { resolveMaterialPhotoUrl } from '../../utils/resolveMaterialPhotoUrl';
import { prefixarAlmoxarifado } from '../../utils/localizacaoLabel';
import { useAlmoxPermissoes } from '../../hooks/useAlmoxPermissoes';
import { useCategoriasMaterial } from '../../hooks/useCategoriasMaterial';
import { toast } from 'react-toastify';
import { SkeletonTable } from '../SkeletonLoader';
import {
  FiPlus, FiSearch, FiEdit, FiTrash2, FiImage, FiPackage,
  FiArrowUp, FiArrowDown, FiAlertTriangle, FiRefreshCw, FiMap, FiClipboard, FiFileText, FiTag,
  FiCheckSquare
} from 'react-icons/fi';
import AlmoxPageHeader from './AlmoxPageHeader';
import ExtratoMaterialModal from './ExtratoMaterialModal';
import EtiquetasPdfModal from './EtiquetasPdfModal';
import PlanoInspecaoModal from './PlanoInspecaoModal';
import SeloProprietario from './SeloProprietario';
import { montarEtiquetaMaterial } from '../../utils/etiquetasPdf';
import './Almoxarifado.css';

// Etapa 26: a lista de categorias saiu daqui (era a TERCEIRA cópia hardcoded — a que a varredura
// do design tinha deixado de fora) e passou a vir de GET /almoxarifado/categorias. Filtrar por
// 'EPI' aqui devolvia zero linhas, porque nenhum material da GMP tem essa categoria — e zero
// linhas parece estoque vazio, não filtro inútil.

const MateriaisAlmoxarifado = () => {
  const { bloquearSeNaoPode } = useAlmoxPermissoes();
  const { categorias } = useCategoriasMaterial();
  const [materiais, setMateriais] = useState([]);
  const [familias, setFamilias] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [categoria, setCategoria] = useState('');
  const [familiaFilter, setFamiliaFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [showMovModal, setShowMovModal] = useState(false);
  const [selectedMaterial, setSelectedMaterial] = useState(null);
  const [movTipo, setMovTipo] = useState('ENTRADA');
  const [movQtd, setMovQtd] = useState('');
  const [movMotivo, setMovMotivo] = useState('');
  const [movRef, setMovRef] = useState('');
  const [savingMov, setSavingMov] = useState(false);
  const [extratoMaterialId, setExtratoMaterialId] = useState(null);
  const [etiquetas, setEtiquetas] = useState(null);
  // Etapa 30: guarda o OBJETO do material, não o id — o cabeçalho do modal mostra código, nome e
  // unidade, e a linha da lista já tem os três (os outros modais desta tela recebem id escalar
  // porque só precisam do id).
  const [planoMaterial, setPlanoMaterial] = useState(null);
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const materialIdAplicado = useRef(false);

  useEffect(() => {
    const s = searchParams.get('status');
    const f = searchParams.get('familia_id');
    if (s) setStatusFilter(s);
    if (f) setFamiliaFilter(f);
    loadFamilias();
  }, []);

  useEffect(() => {
    if (materialIdAplicado.current) return;
    const material_id = searchParams.get('material_id');
    if (material_id && materiais.length > 0) {
      const material = materiais.find(m => m.id === parseInt(material_id));
      if (material) {
        setSearch(material.codigo);
        materialIdAplicado.current = true;
      }
    }
  }, [materiais, searchParams]);

  const loadFamilias = async () => {
    try {
      const res = await api.get('/almoxarifado/familias');
      setFamilias(res.data || []);
    } catch { /* ignore */ }
  };

  useEffect(() => {
    const t = setTimeout(loadMateriais, 300);
    return () => clearTimeout(t);
  }, [search, categoria, familiaFilter, statusFilter]);

  const loadMateriais = async () => {
    setLoading(true);
    try {
      const params = {};
      if (search) params.search = search;
      if (categoria) params.categoria = categoria;
      if (familiaFilter) params.familia_id = familiaFilter;
      if (statusFilter) params.status = statusFilter;
      const res = await api.get('/almoxarifado/materiais', { params });
      setMateriais(res.data);
    } catch {
      toast.error('Erro ao carregar materiais');
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (id, nome) => {
    if (!window.confirm(`Inativar o material "${nome}"?`)) return;
    try {
      await api.delete(`/almoxarifado/materiais/${id}`);
      toast.success('Material inativado');
      loadMateriais();
    } catch {
      toast.error('Erro ao inativar material');
    }
  };

  const openMovModal = (material, tipo) => {
    setSelectedMaterial(material);
    setMovTipo(tipo);
    setMovQtd('');
    setMovMotivo('');
    setMovRef('');
    setShowMovModal(true);
  };

  const handleMovimentar = async (e) => {
    e.preventDefault();
    if (!movQtd || parseFloat(movQtd) <= 0) {
      toast.error('Informe uma quantidade válida');
      return;
    }
    setSavingMov(true);
    try {
      await api.post('/almoxarifado/movimentacoes', {
        material_id: selectedMaterial.id,
        tipo: movTipo,
        quantidade: parseFloat(movQtd),
        motivo: movMotivo,
        referencia: movRef
      });
      toast.success(`${movTipo === 'ENTRADA' ? 'Entrada' : 'Saída'} registrada!`);
      setShowMovModal(false);
      loadMateriais();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Erro ao registrar movimentação');
    } finally {
      setSavingMov(false);
    }
  };

  const getStatus = (m) => {
    if (m.quantidade_atual === 0) return { label: 'Zerado', cls: 'zerado' };
    if (m.quantidade_minima > 0 && m.quantidade_atual <= m.quantidade_minima) return { label: 'Crítico', cls: 'critico' };
    if (m.quantidade_minima > 0 && m.quantidade_atual <= m.quantidade_minima * 1.5) return { label: 'Baixo', cls: 'baixo' };
    return { label: 'OK', cls: 'ok' };
  };

  const getPct = (m) => {
    if (!m.quantidade_maxima || m.quantidade_maxima === 0) return 50;
    return Math.min(100, (m.quantidade_atual / m.quantidade_maxima) * 100);
  };

  return (
    <div className="almox-page">
      <AlmoxPageHeader
        title="Materiais do Almoxarifado"
        subtitle={`${materiais.length} ${materiais.length === 1 ? 'material' : 'materiais'}`}
        breadcrumbs={[{ label: 'Materiais' }]}
        actions={
          <>
            <button className="btn-almox-secondary" onClick={loadMateriais}>
              <FiRefreshCw size={13} /> Atualizar
            </button>
            {/* Continua sendo um Link (o botão aparece e o hover mostra a dica), mas quem não
                pode criar material é barrado NO CLIQUE — sem isso ele só descobriria depois de
                preencher as seis seções do formulário. O 403 do backend segue valendo. */}
            <Link
              to="/almoxarifado/materiais/novo"
              className="btn-almox-primary"
              title="Cadastra um novo material no almoxarifado (código, família, dados técnicos, unidades e localização)"
              onClick={(e) => bloquearSeNaoPode('criar_material', e)}
            >
              <FiPlus size={14} /> Novo Material
            </Link>
          </>
        }
      />

      {/* Filtros */}
      <div className="almox-filters">
        <div className="almox-search-wrapper">
          <FiSearch className="almox-search-icon" />
          <input
            className="almox-search-input"
            placeholder="Buscar por nome, código ou fornecedor..."
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>
        <select className="almox-select" value={categoria} onChange={e => setCategoria(e.target.value)}>
          <option value="">Todas categorias</option>
          {categorias.map(c => <option key={c} value={c}>{c}</option>)}
        </select>
        <select className="almox-select" value={familiaFilter} onChange={e => setFamiliaFilter(e.target.value)}>
          <option value="">Todas famílias</option>
          {familias.map(f => <option key={f.id} value={f.id}>{f.codigo} — {f.nome}</option>)}
        </select>
        <select className="almox-select" value={statusFilter} onChange={e => setStatusFilter(e.target.value)}>
          <option value="">Todos status</option>
          <option value="ok">OK</option>
          <option value="critico">Crítico</option>
          <option value="zerado">Zerado</option>
        </select>
        {(search || categoria || familiaFilter || statusFilter) && (
          <button className="btn-almox-secondary" onClick={() => { setSearch(''); setCategoria(''); setFamiliaFilter(''); setStatusFilter(''); }}>
            Limpar filtros
          </button>
        )}
      </div>

      {/* Tabela */}
      <div className="almox-table-container">
        {loading ? (
          <SkeletonTable rows={8} columns={7} />
        ) : materiais.length === 0 ? (
          <div className="almox-empty">
            <FiPackage size={48} style={{ opacity: 0.3, display: 'block', margin: '0 auto 12px' }} />
            <p>Nenhum material encontrado</p>
          </div>
        ) : (
          <table className="almox-table">
            <thead>
              <tr>
                <th>Foto</th>
                <th>Código</th>
                <th>Material</th>
                <th>Família</th>
                <th>Categoria</th>
                <th>Quantidade</th>
                <th>Localização</th>
                <th>Status</th>
                <th>Ações</th>
              </tr>
            </thead>
            <tbody>
              {materiais.map(m => {
                const status = getStatus(m);
                const pct = getPct(m);
                return (
                  <tr key={m.id}>
                    <td>
                      {m.foto ? (
                        <img src={resolveMaterialPhotoUrl(m.foto)} alt={m.nome} className="almox-foto-thumb" onError={(e) => { e.currentTarget.style.display = 'none'; }} />
                      ) : (
                        <div className="almox-foto-placeholder"><FiImage /></div>
                      )}
                    </td>
                    <td>
                      <span style={{ fontFamily: 'monospace', fontSize: '0.8rem', color: 'var(--gmp-text-light)' }}>
                        {m.codigo}
                      </span>
                    </td>
                    <td>
                      <div style={{ fontWeight: 600, color: 'var(--gmp-text)' }}>
                        {m.nome}
                        {/* Etapa 8: esta lista mistura material nosso e de cliente de propósito
                            (classe C da auditoria da Task 1) — o selo é o que evita a confusão.
                            Fica ao lado do NOME, e não do código, porque é o nome que o
                            almoxarife lê ao procurar a chapa. */}
                        <SeloProprietario material={m} />
                      </div>
                      {m.fornecedor_principal && (
                        <div style={{ fontSize: '0.75rem', color: 'var(--gmp-text-light)' }}>{m.fornecedor_principal}</div>
                      )}
                    </td>
                    <td>
                      {m.familia_nome ? (
                        <span style={{ fontSize: '0.8rem', color: '#4facfe', fontWeight: 600 }}>{m.familia_nome}</span>
                      ) : (
                        <span style={{ fontSize: '0.8rem', color: 'var(--gmp-text-light)' }}>—</span>
                      )}
                    </td>
                    <td>
                      <span style={{ fontSize: '0.8rem', color: 'var(--gmp-text-light)' }}>{m.categoria}</span>
                    </td>
                    <td>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <div className="almox-stock-bar">
                          <div className={`almox-stock-fill ${status.cls}`} style={{ width: `${pct}%` }} />
                        </div>
                        <span style={{ fontWeight: 600 }}>{m.quantidade_atual}</span>
                        <span style={{ color: 'var(--gmp-text-light)', fontSize: '0.8rem' }}>{m.unidade}</span>
                      </div>
                      <div style={{ fontSize: '0.7rem', color: 'var(--gmp-text-light)' }}>
                        Mín: {m.quantidade_minima > 0 ? m.quantidade_minima : '—'} · Máx: {m.quantidade_maxima > 0 ? m.quantidade_maxima : '—'}
                      </div>
                    </td>
                    <td>
                      <span style={{ fontSize: '0.8rem', color: 'var(--gmp-text-light)' }}>
                        {prefixarAlmoxarifado(m.localizacao, m.almoxarifado_codigo) || '—'}
                      </span>
                    </td>
                    <td>
                      <span className={`almox-badge almox-badge-${status.cls}`}>
                        {status.cls === 'critico' && <FiAlertTriangle size={10} />}
                        {status.label}
                      </span>
                    </td>
                    <td>
                      <div className="almox-actions">
                        <button className="almox-btn-icon primary" title="Extrato"
                          onClick={() => setExtratoMaterialId(m.id)}>
                          <FiFileText />
                        </button>
                        <button className="almox-btn-icon primary" title="Requisitar"
                          onClick={(e) => { if (!bloquearSeNaoPode('requisitar', e)) return; navigate(`/almoxarifado/requisicoes/nova?material_id=${m.id}`); }}>
                          <FiClipboard />
                        </button>
                        {m.localizacao_padrao_id && (
                          <button className="almox-btn-icon primary" title="Ver no mapa"
                            onClick={() => navigate(`/almoxarifado/mapa?loc=${m.localizacao_padrao_id}`)}>
                            <FiMap />
                          </button>
                        )}
                        <button className="almox-btn-icon primary"
                          title={m.controle_serie === 1 || m.controle_lote === 1 ? 'Etiquetas de lote/série deste material (abre Lotes e Séries)' : 'Imprimir etiqueta do material'}
                          onClick={(e) => {
                            if (!bloquearSeNaoPode('visualizar', e)) return;
                            if (m.controle_serie === 1 || m.controle_lote === 1) {
                              navigate(`/almoxarifado/lotes?material_id=${m.id}${m.controle_serie === 1 ? '&aba=SERIES' : ''}`);
                            } else {
                              setEtiquetas([montarEtiquetaMaterial(m, window.location.origin)]);
                            }
                          }}>
                          <FiTag />
                        </button>
                        <button className="almox-btn-icon primary" title="Plano de inspeção"
                          onClick={(e) => { if (!bloquearSeNaoPode('gerenciar_plano_inspecao', e)) return; setPlanoMaterial(m); }}>
                          <FiCheckSquare />
                        </button>
                        <button className="almox-btn-icon success" title="Entrada rápida de estoque neste material"
                          onClick={(e) => { if (!bloquearSeNaoPode('movimentar', e)) return; openMovModal(m, 'ENTRADA'); }}>
                          <FiArrowUp />
                        </button>
                        <button className="almox-btn-icon danger" title="Saída rápida de estoque neste material"
                          onClick={(e) => { if (!bloquearSeNaoPode('movimentar', e)) return; openMovModal(m, 'SAIDA'); }}>
                          <FiArrowDown />
                        </button>
                        <button className="almox-btn-icon primary" title="Edita o cadastro deste material"
                          onClick={(e) => { if (!bloquearSeNaoPode('editar_material', e)) return; navigate(`/almoxarifado/materiais/editar/${m.id}`); }}>
                          <FiEdit />
                        </button>
                        <button className="almox-btn-icon danger" title="Inativa o material (não apaga o histórico)"
                          onClick={(e) => { if (!bloquearSeNaoPode('editar_material', e)) return; handleDelete(m.id, m.nome); }}>
                          <FiTrash2 />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {/* Modal movimentação rápida */}
      {showMovModal && selectedMaterial && (
        <div className="almox-modal-overlay" onClick={() => setShowMovModal(false)}>
          <div className="almox-modal almox-modal-sm" onClick={e => e.stopPropagation()}>
            <div className="almox-modal-header">
              <h2>{movTipo === 'ENTRADA' ? '📥 Entrada' : '📤 Saída'} de Material</h2>
              <button className="almox-modal-close" onClick={() => setShowMovModal(false)}>✕</button>
            </div>
            <form onSubmit={handleMovimentar}>
              <div className="almox-modal-body">
                <div style={{ background: 'var(--gmp-bg)', borderRadius: 8, padding: '12px 16px', marginBottom: 16, border: '1px solid var(--gmp-border)' }}>
                  <div style={{ fontWeight: 700, color: 'var(--gmp-text)' }}>{selectedMaterial.nome}</div>
                  <div style={{ fontSize: '0.8rem', color: 'var(--gmp-text-light)', marginTop: 4 }}>
                    Saldo atual: <strong>{selectedMaterial.quantidade_atual} {selectedMaterial.unidade}</strong>
                  </div>
                </div>

                <div className="almox-form-grid" style={{ gridTemplateColumns: '1fr 1fr' }}>
                  <div className="almox-field almox-form-full">
                    <label className="almox-label">Tipo<span className="required">*</span></label>
                    <select className="almox-form-select" value={movTipo} onChange={e => setMovTipo(e.target.value)}>
                      <option value="ENTRADA">Entrada</option>
                      <option value="SAIDA">Saída</option>
                      <option value="AJUSTE">Ajuste (define saldo)</option>
                      <option value="DEVOLUCAO">Devolução</option>
                    </select>
                  </div>
                  <div className="almox-field almox-form-full">
                    <label className="almox-label">Quantidade<span className="required">*</span></label>
                    <input className="almox-input" type="number" min="0" step="1"
                      value={movQtd} onChange={e => setMovQtd(e.target.value)} placeholder="0" required />
                  </div>
                  <div className="almox-field">
                    <label className="almox-label">
                      Motivo
                      {(movTipo === 'SAIDA' || movTipo === 'AJUSTE') && <span className="required">*</span>}
                    </label>
                    <input className="almox-input" value={movMotivo} onChange={e => setMovMotivo(e.target.value)}
                      placeholder="Ex: Compra, Uso interno..."
                      required={movTipo === 'SAIDA' || movTipo === 'AJUSTE'} />
                  </div>
                  <div className="almox-field">
                    <label className="almox-label">Referência (OS/NF)</label>
                    <input className="almox-input" value={movRef} onChange={e => setMovRef(e.target.value)} placeholder="Ex: OS-0042 / NF 1234" />
                  </div>
                </div>
              </div>
              <div className="almox-modal-footer">
                <button type="button" className="btn-almox-secondary" onClick={() => setShowMovModal(false)}>Cancelar</button>
                <button type="submit" className="btn-almox-primary" disabled={savingMov}>
                  {savingMov ? 'Salvando...' : 'Registrar'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Extrato do material */}
      {extratoMaterialId && (
        <ExtratoMaterialModal materialId={extratoMaterialId} onClose={() => setExtratoMaterialId(null)} />
      )}

      {/* Etiquetas PDF */}
      <EtiquetasPdfModal etiquetas={etiquetas} onClose={() => setEtiquetas(null)} />

      {/* Plano de inspeção do material (Etapa 30) */}
      {planoMaterial && (
        <PlanoInspecaoModal material={planoMaterial} onClose={() => setPlanoMaterial(null)} />
      )}
    </div>
  );
};

export default MateriaisAlmoxarifado;
