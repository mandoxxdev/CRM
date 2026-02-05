import React, { useState, useEffect } from 'react';
import api from '../../services/api';
import { toast } from 'react-toastify';
import { FiX, FiSave } from 'react-icons/fi';
import './Operacional.css';

const EquipamentoForm = ({ equipamento, onClose }) => {
  const [formData, setFormData] = useState({
    codigo: '',
    nome: '',
    tipo: '',
    fabricante: '',
    modelo: '',
    numero_serie: '',
    data_aquisicao: '',
    status: 'disponivel',
    capacidade: '',
    observacoes: ''
  });
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (equipamento) {
      setFormData({
        codigo: equipamento.codigo || '',
        nome: equipamento.nome || '',
        tipo: equipamento.tipo || '',
        fabricante: equipamento.fabricante || '',
        modelo: equipamento.modelo || '',
        numero_serie: equipamento.numero_serie || '',
        data_aquisicao: equipamento.data_aquisicao ? equipamento.data_aquisicao.split('T')[0] : '',
        status: equipamento.status || 'disponivel',
        capacidade: equipamento.capacidade || '',
        observacoes: equipamento.observacoes || ''
      });
    }
  }, [equipamento]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      if (equipamento) {
        await api.put(`/operacional/equipamentos/${equipamento.id}`, formData);
        toast.success('Equipamento atualizado');
      } else {
        await api.post('/operacional/equipamentos', formData);
        toast.success('Equipamento criado');
      }
      onClose();
    } catch (error) {
      toast.error(error.response?.data?.error || 'Erro ao salvar equipamento');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="operacional-form">
      <div className="form-header">
        <h2>{equipamento ? 'Editar Equipamento' : 'Novo Equipamento'}</h2>
        <button className="btn-icon" onClick={onClose}><FiX /></button>
      </div>
      <form onSubmit={handleSubmit}>
        <div className="form-grid">
          <div className="form-group">
            <label>Código</label>
            <input type="text" value={formData.codigo} onChange={(e) => setFormData({ ...formData, codigo: e.target.value })} />
          </div>
          <div className="form-group">
            <label>Nome *</label>
            <input type="text" value={formData.nome} onChange={(e) => setFormData({ ...formData, nome: e.target.value })} required />
          </div>
          <div className="form-group">
            <label>Tipo</label>
            <input type="text" value={formData.tipo} onChange={(e) => setFormData({ ...formData, tipo: e.target.value })} />
          </div>
          <div className="form-group">
            <label>Fabricante</label>
            <input type="text" value={formData.fabricante} onChange={(e) => setFormData({ ...formData, fabricante: e.target.value })} />
          </div>
          <div className="form-group">
            <label>Modelo</label>
            <input type="text" value={formData.modelo} onChange={(e) => setFormData({ ...formData, modelo: e.target.value })} />
          </div>
          <div className="form-group">
            <label>Número de Série</label>
            <input type="text" value={formData.numero_serie} onChange={(e) => setFormData({ ...formData, numero_serie: e.target.value })} />
          </div>
          <div className="form-group">
            <label>Data de Aquisição</label>
            <input type="date" value={formData.data_aquisicao} onChange={(e) => setFormData({ ...formData, data_aquisicao: e.target.value })} />
          </div>
          <div className="form-group">
            <label>Status</label>
            <select value={formData.status} onChange={(e) => setFormData({ ...formData, status: e.target.value })}>
              <option value="disponivel">Disponível</option>
              <option value="em_uso">Em Uso</option>
              <option value="manutencao">Manutenção</option>
              <option value="indisponivel">Indisponível</option>
            </select>
          </div>
          <div className="form-group">
            <label>Capacidade</label>
            <input type="text" value={formData.capacidade} onChange={(e) => setFormData({ ...formData, capacidade: e.target.value })} />
          </div>
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

export default EquipamentoForm;
