import React, { useState, useEffect } from 'react';
import api from '../../services/api';
import { toast } from 'react-toastify';
import { FiX, FiSave } from 'react-icons/fi';
import './Operacional.css';
import { agoraLocalParaInput } from '../../utils/dataLocal';

// Etapa 161 (RN-161.05, C397): `atividades_colaboradores.data_inicio` e gravado como o TEXTO do datetime-local que esta tela manda
// (`AAAA-MM-DDTHH:MM`, hora local, sem `Z` — o POST grava o valor como veio; o PUT nem o altera). O antigo
// `new Date(gravado).toISOString().slice(0, 16)` lia esse texto como hora local e o devolvia em UTC: a edicao mostrava a hora 3 h
// adiantada. O texto nessa forma (ou com espaco no lugar do `T`, com ou sem segundos) e mostrado como esta; so um gravado com fuso
// (`Z`/deslocamento) passa pelo `Date` e sai na hora local.
const paraInputLocal = (gravado) => {
  if (!gravado) return agoraLocalParaInput();
  const s = String(gravado).trim();
  if (/^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}(:\d{2}(\.\d+)?)?$/.test(s)) return s.slice(0, 16).replace(' ', 'T');
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? agoraLocalParaInput() : agoraLocalParaInput(d);
};

const AtividadeForm = ({ atividade, onClose }) => {
  const [formData, setFormData] = useState({
    colaborador_id: '',
    os_id: '',
    item_id: '',
    tipo_atividade: '',
    descricao: '',
    // Etapa 161 (RN-161.05, C397): o agora LOCAL (o toISOString punha a hora UTC no datetime-local — 3 h adiantada)
    data_inicio: agoraLocalParaInput(),
    horas_previstas: '',
    observacoes: ''
  });
  const [loading, setLoading] = useState(false);
  const [colaboradores, setColaboradores] = useState([]);
  const [ordensServico, setOrdensServico] = useState([]);

  useEffect(() => {
    loadColaboradores();
    loadOrdensServico();
    if (atividade) {
      setFormData({
        colaborador_id: atividade.colaborador_id || '',
        os_id: atividade.os_id || '',
        item_id: atividade.item_id || '',
        tipo_atividade: atividade.tipo_atividade || '',
        descricao: atividade.descricao || '',
        data_inicio: paraInputLocal(atividade.data_inicio),
        horas_previstas: atividade.horas_previstas || '',
        observacoes: atividade.observacoes || ''
      });
    }
  }, [atividade]);

  const loadColaboradores = async () => {
    try {
      const response = await api.get('/operacional/colaboradores', { params: { status: 'ativo' } });
      setColaboradores(response.data || []);
    } catch (error) {
      console.error('Erro ao carregar colaboradores:', error);
    }
  };

  const loadOrdensServico = async () => {
    try {
      const response = await api.get('/operacional/ordens-servico', { params: { status: 'em_andamento' } });
      setOrdensServico(response.data || []);
    } catch (error) {
      console.error('Erro ao carregar OS:', error);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      if (atividade) {
        await api.put(`/operacional/atividades-colaboradores/${atividade.id}`, formData);
        toast.success('Atividade atualizada');
      } else {
        await api.post('/operacional/atividades-colaboradores', formData);
        toast.success('Atividade criada');
      }
      onClose();
    } catch (error) {
      toast.error(error.response?.data?.error || 'Erro ao salvar atividade');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="operacional-form">
      <div className="form-header">
        <h2>{atividade ? 'Editar Atividade' : 'Nova Atividade'}</h2>
        <button className="btn-icon" onClick={onClose}><FiX /></button>
      </div>
      <form onSubmit={handleSubmit}>
        <div className="form-grid">
          <div className="form-group">
            <label>Colaborador *</label>
            <select value={formData.colaborador_id} onChange={(e) => setFormData({ ...formData, colaborador_id: e.target.value })} required>
              <option value="">Selecione...</option>
              {colaboradores.map(c => <option key={c.id} value={c.id}>{c.nome}</option>)}
            </select>
          </div>
          <div className="form-group">
            <label>OS</label>
            <select value={formData.os_id} onChange={(e) => setFormData({ ...formData, os_id: e.target.value })}>
              <option value="">Selecione...</option>
              {ordensServico.map(os => <option key={os.id} value={os.id}>{os.numero_os}</option>)}
            </select>
          </div>
          <div className="form-group">
            <label>Tipo de Atividade *</label>
            <select value={formData.tipo_atividade} onChange={(e) => setFormData({ ...formData, tipo_atividade: e.target.value })} required>
              <option value="">Selecione...</option>
              <option value="fabricacao">Fabricação</option>
              <option value="montagem">Montagem</option>
              <option value="solda">Solda</option>
              <option value="pintura">Pintura</option>
              <option value="acabamento">Acabamento</option>
              <option value="manutencao">Manutenção</option>
              <option value="outro">Outro</option>
            </select>
          </div>
          <div className="form-group">
            <label>Data/Hora Início *</label>
            <input type="datetime-local" value={formData.data_inicio} onChange={(e) => setFormData({ ...formData, data_inicio: e.target.value })} required />
          </div>
          <div className="form-group">
            <label>Horas Previstas</label>
            <input type="number" step="0.5" value={formData.horas_previstas} onChange={(e) => setFormData({ ...formData, horas_previstas: e.target.value })} />
          </div>
        </div>
        <div className="form-group">
          <label>Descrição</label>
          <textarea value={formData.descricao} onChange={(e) => setFormData({ ...formData, descricao: e.target.value })} rows="4" />
        </div>
        <div className="form-group">
          <label>Observações</label>
          <textarea value={formData.observacoes} onChange={(e) => setFormData({ ...formData, observacoes: e.target.value })} rows="3" />
        </div>
        <div className="form-actions">
          <button type="button" className="btn-secondary" onClick={onClose}>Cancelar</button>
          <button type="submit" className="btn-primary" disabled={loading}><FiSave /> {loading ? 'Salvando...' : 'Salvar'}</button>
        </div>
      </form>
    </div>
  );
};

export default AtividadeForm;
