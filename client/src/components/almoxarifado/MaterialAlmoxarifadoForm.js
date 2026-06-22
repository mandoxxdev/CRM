import React, { useState, useEffect, useRef } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import api from '../../services/api';
import { toast } from 'react-toastify';
import { FiSave, FiArrowLeft, FiImage, FiRefreshCw } from 'react-icons/fi';
import './Almoxarifado.css';

const CATEGORIAS = [
  'CONSUMÍVEL', 'FERRAMENTA', 'EPI', 'ELÉTRICO', 'HIDRÁULICO',
  'MECÂNICO', 'INSUMO', 'EMBALAGEM', 'ESCRITÓRIO', 'LIMPEZA', 'OUTROS'
];

const UNIDADES = ['UN', 'KG', 'G', 'L', 'ML', 'M', 'CM', 'M²', 'M³', 'CX', 'PC', 'PAR', 'ROLO', 'BALDE', 'TAMBOR', 'SACO'];

const MaterialAlmoxarifadoForm = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const isEdit = !!id;
  const fileInputRef = useRef();

  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [fotoPreview, setFotoPreview] = useState(null);
  const [uploadingFoto, setUploadingFoto] = useState(false);
  const [savedId, setSavedId] = useState(null);

  const [form, setForm] = useState({
    codigo: '',
    nome: '',
    descricao: '',
    categoria: 'CONSUMÍVEL',
    unidade: 'UN',
    localizacao: '',
    quantidade_atual: '',
    quantidade_minima: '',
    quantidade_maxima: '',
    custo_unitario: '',
    fornecedor_principal: '',
    codigo_fornecedor: '',
    ncm: '',
    especificacoes: '',
    observacoes: ''
  });

  useEffect(() => {
    if (isEdit) {
      loadMaterial();
    } else {
      loadProximoCodigo();
    }
  }, [id]);

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
        localizacao: m.localizacao || '',
        quantidade_atual: m.quantidade_atual ?? '',
        quantidade_minima: m.quantidade_minima ?? '',
        quantidade_maxima: m.quantidade_maxima ?? '',
        custo_unitario: m.custo_unitario ?? '',
        fornecedor_principal: m.fornecedor_principal || '',
        codigo_fornecedor: m.codigo_fornecedor || '',
        ncm: m.ncm || '',
        especificacoes: m.especificacoes || '',
        observacoes: m.observacoes || ''
      });
      if (m.foto) setFotoPreview(m.foto);
      setSavedId(m.id);
    } catch {
      toast.error('Erro ao carregar material');
      navigate('/almoxarifado/materiais');
    } finally {
      setLoading(false);
    }
  };

  const loadProximoCodigo = async () => {
    try {
      const res = await api.get('/almoxarifado/proximo-codigo');
      setForm(f => ({ ...f, codigo: res.data.codigo }));
    } catch {
      /* silently fail */
    }
  };

  const set = (field, val) => setForm(f => ({ ...f, [field]: val }));

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.codigo || !form.nome) {
      toast.error('Código e nome são obrigatórios');
      return;
    }
    setSaving(true);
    try {
      let res;
      if (isEdit) {
        res = await api.put(`/almoxarifado/materiais/${id}`, form);
        toast.success('Material atualizado!');
      } else {
        res = await api.post('/almoxarifado/materiais', form);
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
      setFotoPreview(res.data.foto_url);
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
            <div style={{ background: 'var(--gmp-surface)', border: '1px solid var(--gmp-border)', borderRadius: 12, padding: 24 }}>
              <div className="almox-section-title">Identificação</div>
              <div className="almox-form-grid">
                <div className="almox-field">
                  <label className="almox-label">Código<span className="required">*</span></label>
                  <input className="almox-input" value={form.codigo} onChange={e => set('codigo', e.target.value)}
                    placeholder="ALM-001" required style={{ fontFamily: 'monospace' }} />
                </div>
                <div className="almox-field">
                  <label className="almox-label">Localização no estoque</label>
                  <input className="almox-input" value={form.localizacao} onChange={e => set('localizacao', e.target.value)}
                    placeholder="Ex: Prateleira A1, Gaveta 3B..." />
                </div>
                <div className="almox-field almox-form-full">
                  <label className="almox-label">Nome do Material<span className="required">*</span></label>
                  <input className="almox-input" value={form.nome} onChange={e => set('nome', e.target.value)}
                    placeholder="Nome completo do material" required />
                </div>
                <div className="almox-field almox-form-full">
                  <label className="almox-label">Descrição</label>
                  <textarea className="almox-textarea" value={form.descricao} onChange={e => set('descricao', e.target.value)}
                    placeholder="Descrição detalhada do material..." rows={3} />
                </div>
              </div>
            </div>

            {/* Classificação */}
            <div style={{ background: 'var(--gmp-surface)', border: '1px solid var(--gmp-border)', borderRadius: 12, padding: 24 }}>
              <div className="almox-section-title">Classificação</div>
              <div className="almox-form-grid">
                <div className="almox-field">
                  <label className="almox-label">Categoria</label>
                  <select className="almox-form-select" value={form.categoria} onChange={e => set('categoria', e.target.value)}>
                    {CATEGORIAS.map(c => <option key={c} value={c}>{c}</option>)}
                  </select>
                </div>
                <div className="almox-field">
                  <label className="almox-label">Unidade de Medida</label>
                  <select className="almox-form-select" value={form.unidade} onChange={e => set('unidade', e.target.value)}>
                    {UNIDADES.map(u => <option key={u} value={u}>{u}</option>)}
                  </select>
                </div>
              </div>
            </div>

            {/* Estoque */}
            <div style={{ background: 'var(--gmp-surface)', border: '1px solid var(--gmp-border)', borderRadius: 12, padding: 24 }}>
              <div className="almox-section-title">Controle de Estoque</div>
              <div className="almox-form-grid almox-form-grid-3">
                <div className="almox-field">
                  <label className="almox-label">{isEdit ? 'Quantidade Atual' : 'Saldo Inicial'}</label>
                  <input className="almox-input" type="number" min="0" step="0.01"
                    value={form.quantidade_atual} onChange={e => set('quantidade_atual', e.target.value)}
                    placeholder="0" disabled={isEdit} title={isEdit ? 'Use Movimentações para alterar o saldo' : ''} />
                  {isEdit && <small style={{ color: 'var(--gmp-text-light)', fontSize: '0.75rem' }}>Use "Movimentações" para ajustar</small>}
                </div>
                <div className="almox-field">
                  <label className="almox-label">Estoque Mínimo</label>
                  <input className="almox-input" type="number" min="0" step="0.01"
                    value={form.quantidade_minima} onChange={e => set('quantidade_minima', e.target.value)} placeholder="0" />
                </div>
                <div className="almox-field">
                  <label className="almox-label">Estoque Máximo</label>
                  <input className="almox-input" type="number" min="0" step="0.01"
                    value={form.quantidade_maxima} onChange={e => set('quantidade_maxima', e.target.value)} placeholder="0" />
                </div>
              </div>
            </div>

            {/* Custo e Fornecedor */}
            <div style={{ background: 'var(--gmp-surface)', border: '1px solid var(--gmp-border)', borderRadius: 12, padding: 24 }}>
              <div className="almox-section-title">Custo e Fornecimento</div>
              <div className="almox-form-grid">
                <div className="almox-field">
                  <label className="almox-label">Custo Unitário (R$)</label>
                  <input className="almox-input" type="number" min="0" step="0.01"
                    value={form.custo_unitario} onChange={e => set('custo_unitario', e.target.value)} placeholder="0,00" />
                </div>
                <div className="almox-field">
                  <label className="almox-label">NCM</label>
                  <input className="almox-input" value={form.ncm} onChange={e => set('ncm', e.target.value)}
                    placeholder="0000.00.00" maxLength={10} />
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

            {/* Especificações */}
            <div style={{ background: 'var(--gmp-surface)', border: '1px solid var(--gmp-border)', borderRadius: 12, padding: 24 }}>
              <div className="almox-section-title">Especificações e Observações</div>
              <div className="almox-form-grid">
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
