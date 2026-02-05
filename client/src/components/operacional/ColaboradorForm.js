import React, { useState, useEffect } from 'react';
import api from '../../services/api';
import { toast } from 'react-toastify';
import { FiX, FiSave } from 'react-icons/fi';
import './Operacional.css';

const ColaboradorForm = ({ colaborador, onClose }) => {
  const [formData, setFormData] = useState({
    nome: '',
    cpf: '',
    matricula: '',
    cargo: '',
    setor: '',
    telefone: '',
    email: '',
    data_admissao: '',
    salario_base: '',
    tipo_contrato: 'clt',
    status: 'ativo',
    disponivel: 1,
    observacoes: ''
  });
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (colaborador) {
      setFormData({
        nome: colaborador.nome || '',
        cpf: colaborador.cpf || '',
        matricula: colaborador.matricula || '',
        cargo: colaborador.cargo || '',
        setor: colaborador.setor || '',
        telefone: colaborador.telefone || '',
        email: colaborador.email || '',
        data_admissao: colaborador.data_admissao ? colaborador.data_admissao.split('T')[0] : '',
        salario_base: colaborador.salario_base || '',
        tipo_contrato: colaborador.tipo_contrato || 'clt',
        status: colaborador.status || 'ativo',
        disponivel: colaborador.disponivel !== undefined ? colaborador.disponivel : 1,
        observacoes: colaborador.observacoes || ''
      });
    }
  }, [colaborador]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);

    try {
      if (colaborador) {
        await api.put(`/operacional/colaboradores/${colaborador.id}`, formData);
        toast.success('Colaborador atualizado com sucesso');
      } else {
        await api.post('/operacional/colaboradores', formData);
        toast.success('Colaborador criado com sucesso');
      }
      onClose();
    } catch (error) {
      toast.error(error.response?.data?.error || 'Erro ao salvar colaborador');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="operacional-form">
      <div className="form-header">
        <h2>{colaborador ? 'Editar Colaborador' : 'Novo Colaborador'}</h2>
        <button className="btn-icon" onClick={onClose}><FiX /></button>
      </div>

      <form onSubmit={handleSubmit}>
        <div className="form-grid">
          <div className="form-group">
            <label>Nome *</label>
            <input type="text" value={formData.nome} onChange={(e) => setFormData({ ...formData, nome: e.target.value })} required />
          </div>
          <div className="form-group">
            <label>CPF</label>
            <input type="text" value={formData.cpf} onChange={(e) => setFormData({ ...formData, cpf: e.target.value })} />
          </div>
          <div className="form-group">
            <label>Matrícula</label>
            <input type="text" value={formData.matricula} onChange={(e) => setFormData({ ...formData, matricula: e.target.value })} />
          </div>
          <div className="form-group">
            <label>Cargo</label>
            <input type="text" value={formData.cargo} onChange={(e) => setFormData({ ...formData, cargo: e.target.value })} />
          </div>
          <div className="form-group">
            <label>Setor</label>
            <input type="text" value={formData.setor} onChange={(e) => setFormData({ ...formData, setor: e.target.value })} />
          </div>
          <div className="form-group">
            <label>Telefone</label>
            <input type="text" value={formData.telefone} onChange={(e) => setFormData({ ...formData, telefone: e.target.value })} />
          </div>
          <div className="form-group">
            <label>Email</label>
            <input type="email" value={formData.email} onChange={(e) => setFormData({ ...formData, email: e.target.value })} />
          </div>
          <div className="form-group">
            <label>Data de Admissão</label>
            <input type="date" value={formData.data_admissao} onChange={(e) => setFormData({ ...formData, data_admissao: e.target.value })} />
          </div>
          <div className="form-group">
            <label>Salário Base</label>
            <input type="number" step="0.01" value={formData.salario_base} onChange={(e) => setFormData({ ...formData, salario_base: e.target.value })} />
          </div>
          <div className="form-group">
            <label>Tipo de Contrato</label>
            <select value={formData.tipo_contrato} onChange={(e) => setFormData({ ...formData, tipo_contrato: e.target.value })}>
              <option value="clt">CLT</option>
              <option value="pj">PJ</option>
              <option value="estagiario">Estagiário</option>
              <option value="terceirizado">Terceirizado</option>
            </select>
          </div>
          <div className="form-group">
            <label>Status</label>
            <select value={formData.status} onChange={(e) => setFormData({ ...formData, status: e.target.value })}>
              <option value="ativo">Ativo</option>
              <option value="inativo">Inativo</option>
            </select>
          </div>
          <div className="form-group">
            <label>Disponível</label>
            <select value={formData.disponivel} onChange={(e) => setFormData({ ...formData, disponivel: parseInt(e.target.value) })}>
              <option value={1}>Sim</option>
              <option value={0}>Não</option>
            </select>
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

export default ColaboradorForm;
