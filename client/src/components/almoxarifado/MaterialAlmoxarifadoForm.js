import React, { useState, useEffect, useRef, useMemo } from 'react';
import { useNavigate, useParams, Link, useSearchParams } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { getEffectiveUser } from '../../services/permissionsCache';
import { canConfigureAlmox } from '../../utils/systemPermissions';
import api from '../../services/api';
import { resolveMaterialPhotoUrl } from '../../utils/resolveMaterialPhotoUrl';
import { toast } from 'react-toastify';
import { FiSave, FiArrowLeft, FiImage, FiRefreshCw } from 'react-icons/fi';
import './Almoxarifado.css';

const CATEGORIAS = [
  'CONSUMÍVEL', 'FERRAMENTA', 'EPI', 'ELÉTRICO', 'HIDRÁULICO',
  'MECÂNICO', 'INSUMO', 'EMBALAGEM', 'ESCRITÓRIO', 'LIMPEZA', 'OUTROS'
];

const UNIDADES = ['UN', 'KG', 'G', 'L', 'ML', 'M', 'CM', 'M²', 'M³', 'CX', 'PC', 'PAR', 'ROLO', 'BALDE', 'TAMBOR', 'SACO'];

const CLASSES_ABC = ['A', 'B', 'C'];

// Cada seção do formulário é um "cartão" com o mesmo visual (Task 6 — reorganização em seções).
const sectionCardStyle = { background: 'var(--gmp-surface)', border: '1px solid var(--gmp-border)', borderRadius: 12, padding: 24 };

// Checkboxes de controle (Etapa 2, Task 4) — a API tolera boolean ou 0/1 (FlagSchema) e o PUT
// normaliza via MATERIAL_BOOL_FIELDS; aqui guardamos boolean puro no state do form.
const CONTROLE_CHECKS = [
  { field: 'controle_lote', label: 'Controle por lote' },
  { field: 'controle_serie', label: 'Controle por número de série' },
  { field: 'controle_validade', label: 'Controle de validade' },
  { field: 'controle_corrida', label: 'Controle de corrida' },
  { field: 'controle_certificado', label: 'Requer certificado' },
  { field: 'requer_inspecao', label: 'Requer inspeção' },
  { field: 'requer_foto', label: 'Requer foto' },
];

const buildLocalizacaoPath = (loc, allLocs = []) => {
  if (!loc) return '';
  const parent = loc.parent_id ? allLocs.find(l => l.id === loc.parent_id) : null;
  const parts = [];
  if (loc.setor) parts.push(loc.setor);
  if (parent) parts.push(parent.subgrupo || parent.descricao || parent.codigo);
  if (loc.subgrupo) parts.push(loc.subgrupo);
  else if (loc.descricao && !parent) parts.push(loc.descricao);
  return parts.join(' / ');
};

const formatLocalizacaoLabel = (loc, allLocs = []) => {
  if (!loc) return '';
  const path = buildLocalizacaoPath(loc, allLocs);
  return path ? `${loc.codigo} — ${path}` : loc.codigo;
};

const MaterialAlmoxarifadoForm = () => {
  const { user } = useAuth();
  const isAdmin = canConfigureAlmox(getEffectiveUser(user));
  const { id } = useParams();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const isEdit = !!id;
  const fileInputRef = useRef();

  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [localizacoes, setLocalizacoes] = useState([]);
  const [familias, setFamilias] = useState([]);
  const [loadingFamilias, setLoadingFamilias] = useState(true);
  const [loadingLocalizacoes, setLoadingLocalizacoes] = useState(true);
  const [localizacaoInativa, setLocalizacaoInativa] = useState(null);
  const [materialLocInfo, setMaterialLocInfo] = useState(null);
  const [fotoPreview, setFotoPreview] = useState(null);
  const [uploadingFoto, setUploadingFoto] = useState(false);
  const [savedId, setSavedId] = useState(null);

  const [form, setForm] = useState({
    codigo: '',
    nome: '',
    descricao: '',
    categoria: 'CONSUMÍVEL',
    unidade: 'UN',
    familia_id: searchParams.get('familia_id') || '',
    subfamilia_id: '',
    localizacao_padrao_id: '',
    quantidade_atual: '',
    quantidade_minima: '',
    quantidade_maxima: '',
    custo_unitario: '',
    fornecedor_principal: '',
    codigo_fornecedor: '',
    ncm: '',
    especificacoes: '',
    observacoes: '',

    // ── Classificação adicional (Etapa 2, Task 4/6) ──
    tipo_material: '',
    material_critico: false,

    // ── Dados técnicos ──
    fabricante: '',
    codigo_fabricante: '',
    peso_unitario: '',
    dimensoes: '',
    material_construtivo: '',
    norma: '',
    marca: '',
    modelo: '',
    aplicacao: '',
    descricao_tecnica: '',

    // ── Estoque e reposição ──
    ponto_reposicao: '',
    lote_economico: '',

    // ── Controles ──
    controle_lote: false,
    controle_serie: false,
    controle_validade: false,
    controle_corrida: false,
    controle_certificado: false,
    requer_inspecao: false,
    requer_foto: false,

    // ── Unidades e custos ──
    classe_abc: '',
    unidade_compra: '',
    fator_conversao_compra: '',
    unidade_consumo: '',
    fator_conversao_consumo: ''
  });

  useEffect(() => {
    loadLocalizacoes();
    loadFamilias();
    if (isEdit) {
      loadMaterial();
    } else if (searchParams.get('familia_id')) {
      loadProximoCodigo(searchParams.get('familia_id'));
    } else {
      loadProximoCodigo();
    }
  }, [id]);

  const loadFamilias = async () => {
    setLoadingFamilias(true);
    try {
      const res = await api.get('/almoxarifado/familias');
      setFamilias(res.data || []);
    } catch (err) {
      const status = err.response?.status;
      if (status === 403) {
        toast.error('Sem permissão no módulo Almoxarifado. Solicite acesso a um administrador.');
      } else {
        toast.error('Erro ao carregar famílias. Reinicie o servidor e tente novamente.');
      }
    } finally {
      setLoadingFamilias(false);
    }
  };

  const loadLocalizacoes = async () => {
    setLoadingLocalizacoes(true);
    try {
      const res = await api.get('/almoxarifado/localizacoes');
      setLocalizacoes(res.data || []);
    } catch {
      toast.error('Erro ao carregar localizações');
    } finally {
      setLoadingLocalizacoes(false);
    }
  };

  const localizacoesOptions = useMemo(() => {
    const options = [...localizacoes];
    if (localizacaoInativa && !options.some(l => l.id === localizacaoInativa.id)) {
      options.push(localizacaoInativa);
    }
    return options.sort((a, b) => {
      const setorCmp = (a.setor || '').localeCompare(b.setor || '', 'pt-BR');
      if (setorCmp !== 0) return setorCmp;
      const parentCmp = (a.parent_id || 0) - (b.parent_id || 0);
      if (parentCmp !== 0) return parentCmp;
      const subCmp = (a.subgrupo || '').localeCompare(b.subgrupo || '', 'pt-BR');
      if (subCmp !== 0) return subCmp;
      return (a.codigo || '').localeCompare(b.codigo || '', 'pt-BR');
    });
  }, [localizacoes, localizacaoInativa]);

  useEffect(() => {
    if (!materialLocInfo || loadingLocalizacoes) return;
    const found = localizacoes.some(l => l.id === materialLocInfo.id);
    if (!found) {
      setLocalizacaoInativa({
        id: materialLocInfo.id,
        codigo: materialLocInfo.label?.split(' — ')[0] || `LOC-${materialLocInfo.id}`,
        descricao: materialLocInfo.label,
        setor: null,
        ativo: 0,
      });
    } else {
      setLocalizacaoInativa(null);
    }
  }, [materialLocInfo, localizacoes, loadingLocalizacoes]);

  const loadMaterial = async () => {
    setLoading(true);
    try {
      const res = await api.get(`/almoxarifado/materiais/${id}`);
      const m = res.data;
      setForm({
        codigo: m.codigo || '',
        nome: m.nome || '',
        descricao: m.descricao || '',
        categoria: m.categoria || 'CONSUMÍVEL',
        unidade: m.unidade || 'UN',
        familia_id: m.familia_id ? String(m.familia_id) : '',
        subfamilia_id: m.subfamilia_id ? String(m.subfamilia_id) : '',
        localizacao_padrao_id: m.localizacao_padrao_id ? String(m.localizacao_padrao_id) : '',
        quantidade_atual: m.quantidade_atual ?? '',
        quantidade_minima: m.quantidade_minima ?? '',
        quantidade_maxima: m.quantidade_maxima ?? '',
        custo_unitario: m.custo_unitario ?? '',
        fornecedor_principal: m.fornecedor_principal || '',
        codigo_fornecedor: m.codigo_fornecedor || '',
        ncm: m.ncm || '',
        especificacoes: m.especificacoes || '',
        observacoes: m.observacoes || '',

        tipo_material: m.tipo_material || '',
        material_critico: !!m.material_critico,

        fabricante: m.fabricante || '',
        codigo_fabricante: m.codigo_fabricante || '',
        peso_unitario: m.peso_unitario ?? '',
        dimensoes: m.dimensoes || '',
        material_construtivo: m.material_construtivo || '',
        norma: m.norma || '',
        marca: m.marca || '',
        modelo: m.modelo || '',
        aplicacao: m.aplicacao || '',
        descricao_tecnica: m.descricao_tecnica || '',

        ponto_reposicao: m.ponto_reposicao ?? '',
        lote_economico: m.lote_economico ?? '',

        controle_lote: !!m.controle_lote,
        controle_serie: !!m.controle_serie,
        controle_validade: !!m.controle_validade,
        controle_corrida: !!m.controle_corrida,
        controle_certificado: !!m.controle_certificado,
        requer_inspecao: !!m.requer_inspecao,
        requer_foto: !!m.requer_foto,

        classe_abc: m.classe_abc || '',
        unidade_compra: m.unidade_compra || '',
        fator_conversao_compra: m.fator_conversao_compra ?? '',
        unidade_consumo: m.unidade_consumo || '',
        fator_conversao_consumo: m.fator_conversao_consumo ?? ''
      });
      if (m.localizacao_padrao_id) {
        setMaterialLocInfo({ id: m.localizacao_padrao_id, label: m.localizacao });
      } else {
        setMaterialLocInfo(null);
        setLocalizacaoInativa(null);
      }
      if (m.foto) setFotoPreview(resolveMaterialPhotoUrl(m.foto));
      setSavedId(m.id);
    } catch {
      toast.error('Erro ao carregar material');
      navigate('/almoxarifado/materiais');
    } finally {
      setLoading(false);
    }
  };

  const loadProximoCodigo = async (familiaId) => {
    try {
      const params = familiaId ? { familia_id: familiaId } : {};
      const res = await api.get('/almoxarifado/proximo-codigo', { params });
      setForm(f => ({ ...f, codigo: res.data.codigo }));
    } catch {
      /* silently fail */
    }
  };

  // Cascata família → subfamília (Etapa 2, Task 3/6): família select mostra só raízes
  // (parent_id === null); subfamília mostra as filhas (parent_id === familia_id selecionada).
  // Trocar a família invalida a subfamília escolhida anteriormente (pode não ser filha da nova).
  const familiasRaiz = useMemo(() => familias.filter(f => f.parent_id === null || f.parent_id === undefined), [familias]);
  const subfamiliasDisponiveis = useMemo(() => {
    if (!form.familia_id) return [];
    return familias.filter(f => String(f.parent_id) === String(form.familia_id));
  }, [familias, form.familia_id]);

  const handleFamiliaChange = (familiaId) => {
    setForm(f => ({ ...f, familia_id: familiaId, subfamilia_id: '' }));
    if (!isEdit && familiaId) {
      loadProximoCodigo(familiaId);
    }
  };

  const set = (field, val) => setForm(f => ({ ...f, [field]: val }));

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.codigo || !form.nome) {
      toast.error('Código e nome são obrigatórios');
      return;
    }
    if (!isEdit && !form.familia_id) {
      toast.error('Selecione a família do material');
      return;
    }
    // Fatores de conversão (Etapa 2, Task 4): espelha no cliente a invariante que o servidor
    // valida via superRefine — evita um round-trip só para descobrir que faltou o fator.
    if (form.unidade_compra && !(Number(form.fator_conversao_compra) > 0)) {
      toast.error('Informe um fator de conversão de compra maior que zero');
      return;
    }
    if (form.unidade_consumo && !(Number(form.fator_conversao_consumo) > 0)) {
      toast.error('Informe um fator de conversão de consumo maior que zero');
      return;
    }
    setSaving(true);
    try {
      const payload = {
        ...form,
        familia_id: form.familia_id ? parseInt(form.familia_id, 10) : null,
        // null explícito (nunca ''): '' cairia no ramo "ausente" da coerção do servidor e
        // preservaria a subfamília antiga no PUT em vez de limpar o vínculo.
        subfamilia_id: form.subfamilia_id ? parseInt(form.subfamilia_id, 10) : null,
        localizacao_padrao_id: form.localizacao_padrao_id
          ? parseInt(form.localizacao_padrao_id, 10)
          : null,
      };
      delete payload.localizacao;

      let res;
      if (isEdit) {
        res = await api.put(`/almoxarifado/materiais/${id}`, payload);
        toast.success('Material atualizado!');
      } else {
        res = await api.post('/almoxarifado/materiais', payload);
        toast.success('Material cadastrado!');
        setSavedId(res.data.id);
      }

      // Upload da foto pendente
      if (fileInputRef.current?.files?.[0] && (savedId || res.data?.id)) {
        await uploadFoto(savedId || res.data.id, fileInputRef.current.files[0]);
      }

      navigate('/almoxarifado/materiais');
    } catch (err) {
      toast.error(err.response?.data?.error || 'Erro ao salvar material');
    } finally {
      setSaving(false);
    }
  };

  const uploadFoto = async (materialId, file) => {
    setUploadingFoto(true);
    try {
      const fd = new FormData();
      fd.append('foto', file);
      const res = await api.post(`/almoxarifado/materiais/${materialId}/foto`, fd, {
        headers: { 'Content-Type': 'multipart/form-data' }
      });
      setFotoPreview(resolveMaterialPhotoUrl(res.data.foto_url));
    } catch {
      toast.error('Foto não pôde ser salva, mas o material foi criado');
    } finally {
      setUploadingFoto(false);
    }
  };

  const handleFotoChange = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => setFotoPreview(ev.target.result);
    reader.readAsDataURL(file);

    if (isEdit && id) {
      uploadFoto(id, file);
    }
  };

  if (loading) {
    return (
      <div className="almox-page">
        <div className="almox-loading"><FiRefreshCw style={{ animation: 'spin 1s linear infinite' }} size={20} /> Carregando...</div>
      </div>
    );
  }

  return (
    <div className="almox-page">
      <div className="almox-header">
        <div>
          <h1>{isEdit ? 'Editar Material' : 'Novo Material'}</h1>
          <p>Almoxarifado · Cadastro de Materiais</p>
        </div>
        <div className="almox-header-actions">
          <button className="btn-almox-secondary" onClick={() => navigate('/almoxarifado/materiais')}>
            <FiArrowLeft size={14} /> Voltar
          </button>
        </div>
      </div>

      <form onSubmit={handleSubmit}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 280px', gap: 24, alignItems: 'start' }}>

          {/* Coluna principal */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>

            {/* Identificação */}
            <div style={sectionCardStyle}>
              <div className="almox-section-title">Identificação</div>
              <div className="almox-form-grid">
                <div className="almox-field">
                  <label className="almox-label">Código<span className="required">*</span></label>
                  <input className="almox-input" value={form.codigo} onChange={e => set('codigo', e.target.value)}
                    placeholder="PAR-001" required style={{ fontFamily: 'monospace' }} />
                  {!isEdit && form.familia_id && (
                    <small style={{ color: 'var(--gmp-text-light)', fontSize: '0.75rem' }}>
                      Código gerado com prefixo da família
                    </small>
                  )}
                </div>
                <div className="almox-field">
                  <label className="almox-label">Nome do Material<span className="required">*</span></label>
                  <input className="almox-input" value={form.nome} onChange={e => set('nome', e.target.value)}
                    placeholder="Nome completo do material" required />
                </div>
                <div className="almox-field almox-form-full">
                  <label className="almox-label">Descrição</label>
                  <textarea className="almox-textarea" value={form.descricao} onChange={e => set('descricao', e.target.value)}
                    placeholder="Descrição detalhada do material..." rows={3} />
                </div>
                <div className="almox-field almox-form-full">
                  <label className="almox-label">Descrição Técnica</label>
                  <textarea className="almox-textarea" value={form.descricao_tecnica} onChange={e => set('descricao_tecnica', e.target.value)}
                    placeholder="Detalhamento técnico complementar..." rows={3} />
                </div>
              </div>
            </div>

            {/* Classificação */}
            <div style={sectionCardStyle}>
              <div className="almox-section-title">Classificação</div>
              <div className="almox-form-grid">
                <div className="almox-field">
                  <label className="almox-label">Família<span className="required">*</span></label>
                  {loadingFamilias ? (
                    <div style={{ fontSize: '0.8rem', color: 'var(--gmp-text-light)', padding: '10px 0' }}>Carregando famílias...</div>
                  ) : familiasRaiz.length === 0 ? (
                    <div style={{ fontSize: '0.8rem', color: 'var(--gmp-text-light)', padding: '8px 12px', background: 'var(--gmp-bg)', border: '1px solid var(--gmp-border)', borderRadius: 8 }}>
                      Nenhuma família cadastrada
                      {isAdmin ? (
                        <> — cadastre em{' '}
                          <Link to="/almoxarifado/configuracoes?tab=familias" style={{ color: '#4facfe' }}>Configurações → Famílias</Link>
                        </>
                      ) : (
                        <> — solicite a um administrador</>
                      )}
                    </div>
                  ) : (
                    <select
                      className="almox-form-select"
                      value={form.familia_id}
                      onChange={e => handleFamiliaChange(e.target.value)}
                      required={!isEdit}
                      disabled={isEdit && !!form.familia_id}
                    >
                      <option value="">Selecione a família...</option>
                      {familiasRaiz.map(fam => (
                        <option key={fam.id} value={String(fam.id)}>
                          {fam.codigo} — {fam.nome}
                        </option>
                      ))}
                    </select>
                  )}
                  {isEdit && form.familia_id && (
                    <small style={{ color: 'var(--gmp-text-light)', fontSize: '0.75rem' }}>
                      A família não pode ser alterada após o cadastro.
                    </small>
                  )}
                </div>
                <div className="almox-field">
                  <label className="almox-label">Subfamília</label>
                  <select
                    className="almox-form-select"
                    value={form.subfamilia_id}
                    onChange={e => set('subfamilia_id', e.target.value)}
                    disabled={!form.familia_id || subfamiliasDisponiveis.length === 0}
                  >
                    <option value="">— nenhuma —</option>
                    {subfamiliasDisponiveis.map(sub => (
                      <option key={sub.id} value={String(sub.id)}>
                        {sub.codigo} — {sub.nome}
                      </option>
                    ))}
                  </select>
                  {form.familia_id && subfamiliasDisponiveis.length === 0 && (
                    <small style={{ color: 'var(--gmp-text-light)', fontSize: '0.75rem' }}>
                      Esta família não tem subfamílias cadastradas.
                    </small>
                  )}
                </div>
                <div className="almox-field">
                  <label className="almox-label">Categoria</label>
                  <select className="almox-form-select" value={form.categoria} onChange={e => set('categoria', e.target.value)}>
                    {CATEGORIAS.map(c => <option key={c} value={c}>{c}</option>)}
                  </select>
                </div>
                <div className="almox-field">
                  <label className="almox-label">Tipo de Material</label>
                  <input className="almox-input" value={form.tipo_material} onChange={e => set('tipo_material', e.target.value)}
                    placeholder="Ex.: Ferramenta, Consumível..." />
                </div>
                <div className="almox-field almox-form-full">
                  <label className="almox-checkbox-field">
                    <input type="checkbox" checked={form.material_critico}
                      onChange={e => set('material_critico', e.target.checked)} />
                    Material crítico
                  </label>
                </div>
              </div>
            </div>

            {/* Dados técnicos */}
            <div style={sectionCardStyle}>
              <div className="almox-section-title">Dados Técnicos</div>
              <div className="almox-form-grid">
                <div className="almox-field">
                  <label className="almox-label">Fabricante</label>
                  <input className="almox-input" value={form.fabricante} onChange={e => set('fabricante', e.target.value)}
                    placeholder="Nome do fabricante" />
                </div>
                <div className="almox-field">
                  <label className="almox-label">Código no Fabricante</label>
                  <input className="almox-input" value={form.codigo_fabricante} onChange={e => set('codigo_fabricante', e.target.value)}
                    placeholder="Cód. do item no fabricante" />
                </div>
                <div className="almox-field">
                  <label className="almox-label">Marca</label>
                  <input className="almox-input" value={form.marca} onChange={e => set('marca', e.target.value)}
                    placeholder="Marca" />
                </div>
                <div className="almox-field">
                  <label className="almox-label">Modelo</label>
                  <input className="almox-input" value={form.modelo} onChange={e => set('modelo', e.target.value)}
                    placeholder="Modelo" />
                </div>
                <div className="almox-field">
                  <label className="almox-label">Norma Técnica</label>
                  <input className="almox-input" value={form.norma} onChange={e => set('norma', e.target.value)}
                    placeholder="Ex.: NBR 1234" />
                </div>
                <div className="almox-field">
                  <label className="almox-label">Material Construtivo</label>
                  <input className="almox-input" value={form.material_construtivo} onChange={e => set('material_construtivo', e.target.value)}
                    placeholder="Ex.: Aço inox 304" />
                </div>
                <div className="almox-field">
                  <label className="almox-label">Peso Unitário (kg)</label>
                  <input className="almox-input" type="number" min="0" step="0.001"
                    value={form.peso_unitario} onChange={e => set('peso_unitario', e.target.value)} placeholder="0,000" />
                </div>
                <div className="almox-field">
                  <label className="almox-label">Dimensões</label>
                  <input className="almox-input" value={form.dimensoes} onChange={e => set('dimensoes', e.target.value)}
                    placeholder="Ex.: 100x50x30mm" />
                </div>
                <div className="almox-field">
                  <label className="almox-label">NCM</label>
                  <input className="almox-input" value={form.ncm} onChange={e => set('ncm', e.target.value)}
                    placeholder="0000.00.00" maxLength={10} />
                </div>
                <div className="almox-field almox-form-full">
                  <label className="almox-label">Aplicação</label>
                  <textarea className="almox-textarea" value={form.aplicacao} onChange={e => set('aplicacao', e.target.value)}
                    placeholder="Onde e como o material é utilizado..." rows={2} />
                </div>
                <div className="almox-field almox-form-full">
                  <label className="almox-label">Especificações Técnicas</label>
                  <textarea className="almox-textarea" value={form.especificacoes} onChange={e => set('especificacoes', e.target.value)}
                    placeholder="Dimensões, tensão, material, normas técnicas..." rows={3} />
                </div>
                <div className="almox-field almox-form-full">
                  <label className="almox-label">Observações Gerais</label>
                  <textarea className="almox-textarea" value={form.observacoes} onChange={e => set('observacoes', e.target.value)}
                    placeholder="Instruções de armazenamento, validade, cuidados especiais..." rows={3} />
                </div>
              </div>
            </div>

            {/* Estoque e reposição */}
            <div style={sectionCardStyle}>
              <div className="almox-section-title">Estoque e Reposição</div>
              <p style={{ fontSize: '0.8rem', color: 'var(--gmp-text-light)', margin: '0 0 16px' }}>
                O estoque mínimo gera alertas no dashboard e na lista quando o saldo ficar baixo.
              </p>
              <div className="almox-form-grid almox-form-grid-3">
                <div className="almox-field">
                  <label className="almox-label">Unidade de Medida</label>
                  <select className="almox-form-select" value={form.unidade} onChange={e => set('unidade', e.target.value)}>
                    {UNIDADES.map(u => <option key={u} value={u}>{u}</option>)}
                  </select>
                </div>
                <div className="almox-field">
                  <label className="almox-label">{isEdit ? 'Quantidade Atual' : 'Saldo Inicial'}</label>
                  <input className="almox-input" type="number" min="0" step="1"
                    value={form.quantidade_atual} onChange={e => set('quantidade_atual', e.target.value)}
                    placeholder="0" disabled={isEdit} title={isEdit ? 'Use Movimentações para alterar o saldo' : ''} />
                  {isEdit && <small style={{ color: 'var(--gmp-text-light)', fontSize: '0.75rem' }}>Use "Movimentações" para ajustar</small>}
                </div>
                <div className="almox-field">
                  <label className="almox-label">Estoque Mínimo</label>
                  <input className="almox-input" type="number" min="0" step="1"
                    value={form.quantidade_minima} onChange={e => set('quantidade_minima', e.target.value)} placeholder="0" />
                </div>
                <div className="almox-field">
                  <label className="almox-label">Estoque Máximo</label>
                  <input className="almox-input" type="number" min="0" step="1"
                    value={form.quantidade_maxima} onChange={e => set('quantidade_maxima', e.target.value)} placeholder="0" />
                </div>
                <div className="almox-field">
                  <label className="almox-label">Ponto de Reposição</label>
                  <input className="almox-input" type="number" min="0" step="1"
                    value={form.ponto_reposicao} onChange={e => set('ponto_reposicao', e.target.value)} placeholder="0" />
                </div>
                <div className="almox-field">
                  <label className="almox-label">Lote Econômico</label>
                  <input className="almox-input" type="number" min="0" step="1"
                    value={form.lote_economico} onChange={e => set('lote_economico', e.target.value)} placeholder="0" />
                </div>
                <div className="almox-field almox-form-full">
                  <label className="almox-label">Localização no estoque</label>
                  {loadingLocalizacoes ? (
                    <div style={{ fontSize: '0.8rem', color: 'var(--gmp-text-light)', padding: '10px 0' }}>
                      Carregando localizações...
                    </div>
                  ) : localizacoes.length === 0 && !localizacaoInativa ? (
                    <div style={{ fontSize: '0.8rem', color: 'var(--gmp-text-light)', padding: '8px 12px', background: 'var(--gmp-bg)', border: '1px solid var(--gmp-border)', borderRadius: 8 }}>
                      Nenhuma localização cadastrada
                      {isAdmin ? (
                        <> — cadastre em{' '}
                          <Link to="/almoxarifado/configuracoes" style={{ color: '#4facfe' }}>Configurações</Link>
                        </>
                      ) : (
                        <> — solicite a um administrador</>
                      )}
                    </div>
                  ) : (
                    <>
                      <select
                        className="almox-form-select"
                        value={form.localizacao_padrao_id}
                        onChange={e => set('localizacao_padrao_id', e.target.value)}
                      >
                        <option value="">Selecione uma localização...</option>
                        {localizacoesOptions.map(loc => (
                          <option key={loc.id} value={String(loc.id)}>
                            {formatLocalizacaoLabel(loc, localizacoesOptions)}
                            {loc.ativo === 0 ? ' (inativa)' : ''}
                          </option>
                        ))}
                      </select>
                      {localizacaoInativa && localizacaoInativa.ativo === 0 && form.localizacao_padrao_id === String(localizacaoInativa.id) && (
                        <small style={{ color: 'var(--gmp-text-light)', fontSize: '0.75rem' }}>
                          Localização atual está inativa — selecione outra ou mantenha.
                        </small>
                      )}
                    </>
                  )}
                </div>
              </div>
            </div>

            {/* Controles */}
            <div style={sectionCardStyle}>
              <div className="almox-section-title">Controles</div>
              <div className="almox-form-grid almox-form-grid-3">
                {CONTROLE_CHECKS.map(({ field, label }) => (
                  <label key={field} className="almox-checkbox-field">
                    <input type="checkbox" checked={form[field]}
                      onChange={e => set(field, e.target.checked)} />
                    {label}
                  </label>
                ))}
              </div>
            </div>

            {/* Unidades e custos */}
            <div style={sectionCardStyle}>
              <div className="almox-section-title">Unidades e Custos</div>
              <div className="almox-form-grid">
                <div className="almox-field">
                  <label className="almox-label">Classe ABC</label>
                  <select className="almox-form-select" value={form.classe_abc} onChange={e => set('classe_abc', e.target.value)}>
                    <option value="">— não classificado —</option>
                    {CLASSES_ABC.map(c => <option key={c} value={c}>{c}</option>)}
                  </select>
                </div>
                <div className="almox-field">
                  <label className="almox-label">Custo Unitário (R$)</label>
                  <input className="almox-input" type="number" min="0" step="0.01"
                    value={form.custo_unitario} onChange={e => set('custo_unitario', e.target.value)} placeholder="0,00" />
                </div>
                <div className="almox-field">
                  <label className="almox-label">Unidade de Compra</label>
                  <select className="almox-form-select" value={form.unidade_compra} onChange={e => set('unidade_compra', e.target.value)}>
                    <option value="">— igual à unidade de medida —</option>
                    {UNIDADES.map(u => <option key={u} value={u}>{u}</option>)}
                  </select>
                </div>
                <div className="almox-field">
                  <label className="almox-label">
                    Fator de Conversão (Compra)
                    {form.unidade_compra && <span className="required">*</span>}
                  </label>
                  <input className="almox-input" type="number" min="0" step="0.0001"
                    value={form.fator_conversao_compra} onChange={e => set('fator_conversao_compra', e.target.value)}
                    placeholder="Ex.: 12 (1 CX = 12 UN)" />
                  {form.unidade_compra && (
                    <small style={{ color: 'var(--gmp-text-light)', fontSize: '0.75rem' }}>
                      Obrigatório e maior que zero quando a unidade de compra é informada.
                    </small>
                  )}
                </div>
                <div className="almox-field">
                  <label className="almox-label">Unidade de Consumo</label>
                  <select className="almox-form-select" value={form.unidade_consumo} onChange={e => set('unidade_consumo', e.target.value)}>
                    <option value="">— igual à unidade de medida —</option>
                    {UNIDADES.map(u => <option key={u} value={u}>{u}</option>)}
                  </select>
                </div>
                <div className="almox-field">
                  <label className="almox-label">
                    Fator de Conversão (Consumo)
                    {form.unidade_consumo && <span className="required">*</span>}
                  </label>
                  <input className="almox-input" type="number" min="0" step="0.0001"
                    value={form.fator_conversao_consumo} onChange={e => set('fator_conversao_consumo', e.target.value)}
                    placeholder="Ex.: 1" />
                  {form.unidade_consumo && (
                    <small style={{ color: 'var(--gmp-text-light)', fontSize: '0.75rem' }}>
                      Obrigatório e maior que zero quando a unidade de consumo é informada.
                    </small>
                  )}
                </div>
                <div className="almox-field">
                  <label className="almox-label">Fornecedor Principal</label>
                  <input className="almox-input" value={form.fornecedor_principal} onChange={e => set('fornecedor_principal', e.target.value)}
                    placeholder="Nome do fornecedor" />
                </div>
                <div className="almox-field">
                  <label className="almox-label">Código no Fornecedor</label>
                  <input className="almox-input" value={form.codigo_fornecedor} onChange={e => set('codigo_fornecedor', e.target.value)}
                    placeholder="Cód. do item no fornecedor" />
                </div>
              </div>
            </div>
          </div>

          {/* Coluna lateral — foto + ações */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16, position: 'sticky', top: 80 }}>

            {/* Foto */}
            <div style={{ background: 'var(--gmp-surface)', border: '1px solid var(--gmp-border)', borderRadius: 12, padding: 20 }}>
              <div className="almox-section-title" style={{ marginTop: 0 }}>Foto do Produto</div>
              <div className="almox-foto-upload-area">
                <input type="file" accept="image/*" ref={fileInputRef} onChange={handleFotoChange} />
                {fotoPreview ? (
                  <img src={fotoPreview} alt="Preview" className="almox-foto-preview" />
                ) : (
                  <div>
                    <FiImage size={32} style={{ opacity: 0.4, display: 'block', margin: '0 auto 8px' }} />
                    <div style={{ fontSize: '0.8rem', color: 'var(--gmp-text-light)' }}>
                      Clique para adicionar foto<br />JPG, PNG, WEBP · max 10MB
                    </div>
                  </div>
                )}
              </div>
              {uploadingFoto && (
                <div style={{ textAlign: 'center', fontSize: '0.8rem', color: 'var(--gmp-text-light)', marginTop: 8 }}>
                  Enviando foto...
                </div>
              )}
            </div>

            {/* Botões */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <button type="submit" className="btn-almox-primary" disabled={saving} style={{ justifyContent: 'center' }}>
                <FiSave size={14} /> {saving ? 'Salvando...' : isEdit ? 'Atualizar Material' : 'Cadastrar Material'}
              </button>
              <button type="button" className="btn-almox-secondary" style={{ justifyContent: 'center' }}
                onClick={() => navigate('/almoxarifado/materiais')}>
                <FiArrowLeft size={14} /> Cancelar
              </button>
            </div>
          </div>
        </div>
      </form>
    </div>
  );
};

export default MaterialAlmoxarifadoForm;
