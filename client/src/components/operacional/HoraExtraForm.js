import React, { useState, useEffect } from 'react';
import api from '../../services/api';
import { toast } from 'react-toastify';
import { FiX, FiSave } from 'react-icons/fi';
import './Operacional.css';

const HoraExtraForm = ({ horaExtra, onClose }) => {
  const [formData, setFormData] = useState({
    colaborador_id: '',
    data: new Date().toISOString().split('T')[0],
    horas_extras: '',
    tipo_hora_extra: 'normal',
    motivo: '',
    valor_hora_extra: '',
    observacoes: ''
  });
  const [loading, setLoading] = useState(false);
  const [colaboradores, setColaboradores] = useState([]);

  useEffect(() => {
    loadColaboradores();
    if (horaExtra) {
      setFormData({
        colaborador_id: horaExtra.colaborador_id || '',
        data: horaExtra.data ? horaExtra.data.split('T')[0] : new Date().toISOString().split('T')[0],
        horas_extras: horaExtra.horas_extras || '',
        tipo_hora_extra: horaExtra.tipo_hora_extra || 'normal',
        motivo: horaExtra.motivo || '',
        valor_hora_extra: horaExtra.valor_hora_extra || '',
        observacoes: horaExtra.observacoes || ''
      });
    }
  }, [horaExtra]);

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
      if (horaExtra) {
        await api.put(`/operacional/horas-extras/${horaExtra.id}`, formData);
        toast.success('Hora extra atualizada');
      } else {
        await api.post('/operacional/horas-extras', formData);
        toast.success('Hora extra registrada');
      }
      onClose();
    } catch (error) {
      toast.error(error.response?.data?.error || 'Erro ao salvar hora extra');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="operacional-form">
      <div className="form-header">
        <h2>{horaExtra ? 'Editar Hora Extra' : 'Nova Hora Extra'}</h2>
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
            <label>Horas Extras *</label>
            <input type="number" step="0.5" value={formData.horas_extras} onChange={(e) => setFormData({ ...formData, horas_extras: e.target.value })} required />
          </div>
          <div className="form-group">
            <label>Tipo</label>
            <select value={formData.tipo_hora_extra} onChange={(e) => setFormData({ ...formData, tipo_hora_extra: e.target.value })}>
              <option value="normal">Normal</option>
              <option value="noturna">Noturna</option>
              <option value="domingo">Domingo</option>
              <option value="feriado">Feriado</option>
            </select>
          </div>
          <div className="form-group">
            <label>Valor por Hora</label>
            <input type="number" step="0.01" value={formData.valor_hora_extra} onChange={(e) => setFormData({ ...formData, valor_hora_extra: e.target.value })} />
          </div>
        </div>
        <div className="form-group">
          <label>Motivo</label>
          <textarea value={formData.motivo} onChange={(e) => setFormData({ ...formData, motivo: e.target.value })} rows="3" />
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

export default HoraExtraForm;
