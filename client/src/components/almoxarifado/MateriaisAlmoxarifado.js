import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import api from '../../services/api';
import { useAlmoxPermissoes } from '../../hooks/useAlmoxPermissoes';
import { useCategoriasMaterial } from '../../hooks/useCategoriasMaterial';
import { toast } from 'react-toastify';
import {
  FiEye,
  FiArrowUp, FiArrowDown, FiRefreshCw, FiMap, FiClipboard, FiFileText, FiTag,
  FiCheckSquare, FiPaperclip, FiInfo
} from 'react-icons/fi';
import AlmoxPageHeader from './AlmoxPageHeader';
import AnexosModal from './AnexosModal';
import ExtratoMaterialModal from './ExtratoMaterialModal';
import EtiquetasPdfModal from './EtiquetasPdfModal';
import PlanoInspecaoModal from './PlanoInspecaoModal';
import { FiltrosMateriais, TabelaMateriais, estaInativo } from './TabelaMateriais';
import { AVISO_CADASTRO_NO_COMPRAS, ROTAS_ALMOXARIFADO_CONSULTA } from './rotasCadastroMaterial';
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
  // Etapa 34: como o `planoMaterial`, guarda o OBJETO — o subtítulo do modal mostra código e nome,
  // e a linha da lista já tem os dois.
  const [anexosMaterial, setAnexosMaterial] = useState(null);
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const materialIdAplicado = useRef(false);
  // Etapa 161 (RN-161.11, C400): o QR (`?material_id=`) mostra SO aquele material. Antes punha so o codigo na busca — que e parcial:
  // `MAT-001` listava tambem `MAT-0010`. O codigo continua na busca (estreita o pedido ao servidor); o filtro por id corta o resto e
  // soma com os outros filtros. Mexer na busca (ou Limpar filtros) solta.
  const [qrMaterialId, setQrMaterialId] = useState(null);

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
        setQrMaterialId(material.id);
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

  // Etapa 38 (RN-38.05, G11 da 37): a chegada de `familias` reagenda a busca, porque
  // `loadMateriais` deriva `subfamilia_id` dela — com `?familia_id=<sub>` na URL antes da lista
  // chegar, o closure agendado tinha `familias = []` e mandava só `familia_id=<sub>` (zero
  // linhas). Revisão da 38: só importa quando há filtro de família — sem filtro, a chave fica
  // constante e a lista chegando depois dos 300 ms NÃO dispara um segundo GET.
  const familiasKey = familiaFilter ? familias.length : 0;
  useEffect(() => {
    const t = setTimeout(loadMateriais, 300);
    return () => clearTimeout(t);
  }, [search, categoria, familiaFilter, statusFilter, familiasKey]);

  // Etapa 160 (RN-160.06, C395): a pausa de 300 ms nao impede dois pedidos em voo — so a resposta do ultimo mexe na lista (o
  // contador fica aqui dentro: o inativar tambem chama; Fase 2 M7)
  const pedidoMateriaisRef = useRef(0);
  const loadMateriais = async () => {
    const meu = ++pedidoMateriaisRef.current;
    setLoading(true);
    try {
      const params = {};
      if (search) params.search = search;
      if (categoria) params.categoria = categoria;
      // Etapa 37 (RN-37.06): o material grava `familia_id` = raiz e `subfamilia_id` = filha, então
      // mandar `familia_id=<sub>` devolvia zero linhas (parecia estoque vazio). Derivado de
      // `familias` na hora da busca, sem state novo — o reset de "Limpar filtros" continua valendo.
      if (familiaFilter) {
        const fam = familias.find(f => String(f.id) === String(familiaFilter));
        if (fam && fam.parent_id !== null && fam.parent_id !== undefined) {
          params.familia_id = fam.parent_id;
          params.subfamilia_id = fam.id;
        } else {
          params.familia_id = familiaFilter;
        }
      }
      if (statusFilter) params.status = statusFilter;
      // Etapa 223 (RN-223.08, B1481): o numero em lote impedido de cada linha vem so com este pedido (opt-in do servidor). Aqui, e nao
      // no `paramsDaBusca` compartilhado: a lista do Compras nao pede (RN-223.09).
      params.com_lote_impedido = 1;
      const res = await api.get('/almoxarifado/materiais', { params });
      if (meu !== pedidoMateriaisRef.current) return;
      setMateriais(res.data);
    } catch {
      if (meu !== pedidoMateriaisRef.current) return;
      toast.error('Erro ao carregar materiais');
    } finally {
      if (meu === pedidoMateriaisRef.current) setLoading(false);
    }
  };

  // Etapa 193 (RN-193.01): Inativar e Reativar sairam daqui (o cadastro e so do Compras, que inativa e reativa com as mesmas
  // regras — Etapa 113). O filtro "Inativos" continua: o almoxarifado consulta o que foi inativado.

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

  const materiaisVisiveis = qrMaterialId === null ? materiais : materiais.filter((m) => m.id === qrMaterialId);

  return (
    <div className="almox-page">
      <AlmoxPageHeader
        title="Materiais do Almoxarifado"
        subtitle={`${materiaisVisiveis.length} ${materiaisVisiveis.length === 1 ? 'material' : 'materiais'}`}
        breadcrumbs={[{ label: 'Materiais' }]}
        actions={
          <>
            <button className="btn-almox-secondary" onClick={loadMateriais}>
              <FiRefreshCw size={13} /> Atualizar
            </button>
          </>
        }
      />

      {/* Etapa 193 (RN-193.01): a lista e so consulta — quem cadastra, edita, inativa ou troca a foto e o Compras. */}
      <div className="almox-empty" data-testid="aviso-cadastro-no-compras" role="note"
        style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 14px', marginBottom: 12, textAlign: 'left' }}>
        <FiInfo size={16} /> {AVISO_CADASTRO_NO_COMPRAS}
      </div>

      {/* 04/11/2026: filtros e tabela moram em `TabelaMateriais` — a mesma lista do Compras → Materiais (era para ser a mesma tela,
          mudada de lugar, e não outra). Os botões desta tela vão em `renderAcoes`. */}
      <FiltrosMateriais
        search={search} onSearch={(v) => { setSearch(v); setQrMaterialId(null); }}
        categoria={categoria} onCategoria={setCategoria} categorias={categorias}
        familiaFilter={familiaFilter} onFamilia={setFamiliaFilter} familias={familias}
        statusFilter={statusFilter} onStatus={setStatusFilter}
        onLimpar={() => { setSearch(''); setQrMaterialId(null); setCategoria(''); setFamiliaFilter(''); setStatusFilter(''); }}
      />

      <TabelaMateriais
        materiais={materiaisVisiveis}
        loading={loading}
        renderAcoes={(m) => (
          <>
            <button className="almox-btn-icon primary" title="Extrato"
              onClick={() => setExtratoMaterialId(m.id)}>
              <FiFileText />
            </button>
            {!estaInativo(m) && (
            <button className="almox-btn-icon primary" title="Requisitar"
              onClick={(e) => { if (!bloquearSeNaoPode('requisitar', e)) return; navigate(`/almoxarifado/requisicoes/nova?material_id=${m.id}`); }}>
              <FiClipboard />
            </button>
            )}
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
            {!estaInativo(m) && (<>
            <button className="almox-btn-icon success" title="Entrada rápida de estoque neste material"
              onClick={(e) => { if (!bloquearSeNaoPode('movimentar', e)) return; openMovModal(m, 'ENTRADA'); }}>
              <FiArrowUp />
            </button>
            <button className="almox-btn-icon danger" title="Saída rápida de estoque neste material"
              onClick={(e) => { if (!bloquearSeNaoPode('movimentar', e)) return; openMovModal(m, 'SAIDA'); }}>
              <FiArrowDown />
            </button>
            </>)}
            {/* Etapa 34 — anexos do material (ficha técnica, certificado, desenho).
                SEM `bloquearSeNaoPode`, de propósito e ao contrário de todos os
                vizinhos: `anexar_documento` é de sete perfis e `editar_material` de
                três, e quem só tem `visualizar` precisa poder BAIXAR (decisão B68 da
                Etapa 32). Gatear aqui daria a COMPRAS, PRODUÇÃO, GESTOR e QUALIDADE a
                permissão sem nenhuma superfície para exercê-la — que é exatamente o
                defeito que a Fase 0 desta etapa mediu. Quem esconde enviar e remover é
                o próprio bloco. NÃO "corrija" isto acrescentando o gate. */}
            <button className="almox-btn-icon" title="Anexos e documentos deste material"
              data-testid={`anexos-material-${m.id}`}
              onClick={() => setAnexosMaterial(m)}>
              <FiPaperclip />
            </button>
            {/* Etapa 193 (RN-193.01): Ver no lugar de Editar/Inativar/Reativar — a ficha so para leitura, para todo perfil
                que abre esta tela (o cadastro em si e do Compras). */}
            <button className="almox-btn-icon primary" title="Ver o cadastro deste material (somente consulta)"
              data-testid={`ver-material-${m.id}`}
              onClick={() => navigate(ROTAS_ALMOXARIFADO_CONSULTA.tela.ver(m.id))}>
              <FiEye />
            </button>
          </>
        )}
      />

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

      {/* Anexos do material (Etapa 34) — a spec 01 pedia "ficha técnica e documentos anexos na
          tela do material". Modal, e não bloco na página de edição, porque aquela página exige
          `editar_material` e deixaria quatro dos sete perfis com a permissão e sem superfície. */}
      {anexosMaterial && (
        <AnexosModal
          titulo="Anexos do material"
          subtitulo={`${anexosMaterial.codigo} — ${anexosMaterial.nome}`}
          entidade="material"
          entidadeId={anexosMaterial.id}
          onClose={() => setAnexosMaterial(null)}
        />
      )}
    </div>
  );
};

export default MateriaisAlmoxarifado;
