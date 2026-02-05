import React, { useState, useEffect } from 'react';
import api from '../../services/api';
import { toast } from 'react-toastify';
import { FiX, FiSave } from 'react-icons/fi';
import './Operacional.css';

const PresencaForm = ({ presenca, onClose }) => {
  const [formData, setFormData] = useState({
    colaborador_id: '',
    data: new Date().toISOString().split('T')[0],
    hora_entrada: '',
    hora_saida: '',
    hora_entrada_almoco: '',
    hora_saida_almoco: '',
    status: 'presente',
    motivo_ausencia: '',
    observacoes: ''
  });
  const [loading, setLoading] = useState(false);
  const [colaboradores, setColaboradores] = useState([]);

  useEffect(() => {
    loadColaboradores();
    if (presenca) {
      setFormData({
        colaborador_id: presenca.colaborador_id || '',
        data: presenca.data ? presenca.data.split('T')[0] : new Date().toISOString().split('T')[0],
        hora_entrada: presenca.hora_entrada || '',
        hora_saida: presenca.hora_saida || '',
        hora_entrada_almoco: presenca.hora_entrada_almoco || '',
        hora_saida_almoco: presenca.hora_saida_almoco || '',
        status: presenca.status || 'presente',
        motivo_ausencia: presenca.motivo_ausencia || '',
        observacoes: presenca.observacoes || ''
      });
    }
  }, [presenca]);

  const loadColaboradores = async () => {
    try {
      const response = await api.get('/operacional/colaboradores', { params: { status: 'ativo' } });
      setColaboradores(response.data || []);
    } catch (error) {
      console.error('Erro ao carregar colaboradores:', error);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      if (presenca) {
        await api.put(`/operacional/controle-presenca/${presenca.id}`, formData);
        toast.success('Presença atualizada');
      } else {
        await api.post('/operacional/controle-presenca', formData);
        toast.success('Presença registrada');
      }
      onClose();
    } catch (error) {
      toast.error(error.response?.data?.error || 'Erro ao salvar presença');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="operacional-form">
      <div className="form-header">
        <h2>{presenca ? 'Editar Presença' : 'Registrar Presença'}</h2>
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
            <label>Data *</label>
            <input type="date" value={formData.data} onChange={(e) => setFormData({ ...formData, data: e.target.value })} required />
          </div>
          <div className="form-group">
            <label>Status</label>
            <select value={formData.status} onChange={(e) => setFormData({ ...formData, status: e.target.value })}>
              <option value="presente">Presente</option>
              <option value="ausente">Ausente</option>
              <option value="atraso">Atraso</option>
              <option value="ferias">Férias</option>
              <option value="licenca">Licença</option>
            </select>
          </div>
          {formData.status === 'presente' && (
            <>
              <div className="form-group">
                <label>Hora Entrada</label>
                <input type="time" value={formData.hora_entrada} onChange={(e) => setFormData({ ...formData, hora_entrada: e.target.value })} />
              </div>
              <div className="form-group">
                <label>Hora Saída Almoço</label>
                <input type="time" value={formData.hora_saida_almoco} onChange={(e) => setFormData({ ...formData, hora_saida_almoco: e.target.value })} />
              </div>
              <div className="form-group">
                <label>Hora Retorno Almoço</label>
                <input type="time" value={formData.hora_entrada_almoco} onChange={(e) => setFormData({ ...formData, hora_entrada_almoco: e.target.value })} />
              </div>
              <div className="form-group">
                <label>Hora Saída</label>
                <input type="time" value={formData.hora_saida} onChange={(e) => setFormData({ ...formData, hora_saida: e.target.value })} />
              </div>
            </>
          )}
          {formData.status !== 'presente' && (
            <div className="form-group">
              <label>Motivo da Ausência</label>
              <input type="text" value={formData.motivo_ausencia} onChange={(e) => setFormData({ ...formData, motivo_ausencia: e.target.value })} />
            </div>
          )}
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

export default PresencaForm;
