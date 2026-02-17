import React, { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import api from '../services/api';
import './ProjetoForm.css';

const ProjetoForm = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [clientes, setClientes] = useState([]);
  const [usuarios, setUsuarios] = useState([]);
  const [formData, setFormData] = useState({
    cliente_id: '',
    nome_projeto: '',
    descricao: '',
    segmento: '',
    tipo_projeto: '',
    valor_estimado: '',
    data_inicio: '',
    data_prevista_entrega: '',
    responsavel_id: '',
    observacoes: '',
    status: 'em_andamento'
  });

  const segmentos = [
    'Tintas & Vernizes',
    'Químico',
    'Cosméticos',
    'Alimentícios',
    'Domissanitários',
    'Saneantes',
    'Outros'
  ];

  useEffect(() => {
    loadClientes();
    loadUsuarios();
    if (id) {
      loadProjeto();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  const loadClientes = async () => {
    try {
      const response = await api.get('/clientes', { params: { status: 'ativo' } });
      setClientes(response.data);
    } catch (error) {
      console.error('Erro ao carregar clientes:', error);
    }
  };

  const loadUsuarios = async () => {
    try {
      const response = await api.get('/usuarios');
      setUsuarios(Array.isArray(response.data) ? response.data.filter(u => u.ativo) : []);
    } catch (error) {
      console.error('Erro ao carregar usuários:', error);
    }
  };

  const loadProjeto = async () => {
    try {
      const response = await api.get(`/projetos/${id}`);
      const data = response.data;
      setFormData({
        ...data,
        data_inicio: data.data_inicio ? data.data_inicio.split('T')[0] : '',
        data_prevista_entrega: data.data_prevista_entrega ? data.data_prevista_entrega.split('T')[0] : ''
      });
    } catch (error) {
      console.error('Erro ao carregar projeto:', error);
      alert('Erro ao carregar projeto');
    }
  };

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);

    try {
      if (id) {
        await api.put(`/projetos/${id}`, formData);
      } else {
        await api.post('/projetos', formData);
      }
      navigate('/comercial/projetos');
    } catch (error) {
      alert(error.response?.data?.error || 'Erro ao salvar projeto');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="projeto-form">
      <div className="form-header">
        <h1>{id ? 'Editar Projeto' : 'Novo Projeto'}</h1>
        <button onClick={() => navigate('/comercial/projetos')} className="btn-secondary">
          Cancelar
        </button>
      </div>

      <form onSubmit={handleSubmit} className="form">
        <div className="form-section">
          <h2>Informações Básicas</h2>
          <div className="form-grid">
            <div className="form-group full-width">
              <label>Nome do Projeto *</label>
              <input
                type="text"
                name="nome_projeto"
                value={formData.nome_projeto}
                onChange={handleChange}
                required
              />
            </div>
            <div className="form-group">
              <label>Cliente *</label>
              <select
                name="cliente_id"
                value={formData.cliente_id}
                onChange={handleChange}
                required
              >
                <option value="">Selecione um cliente...</option>
                {clientes.map(cliente => (
                  <option key={cliente.id} value={cliente.id}>
                    {cliente.razao_social}
                  </option>
                ))}
              </select>
            </div>
            <div className="form-group">
              <label>Segmento</label>
              <select
                name="segmento"
                value={formData.segmento}
                onChange={handleChange}
              >
                <option value="">Selecione...</option>
                {segmentos.map(seg => (
                  <option key={seg} value={seg}>{seg}</option>
                ))}
              </select>
            </div>
            <div className="form-group">
              <label>Tipo de Projeto</label>
              <input
                type="text"
                name="tipo_projeto"
                value={formData.tipo_projeto}
                onChange={handleChange}
                placeholder="Ex: Turn Key Completo"
              />
            </div>
            <div className="form-group">
              <label>Status</label>
              <select
                name="status"
                value={formData.status}
                onChange={handleChange}
              >
                <option value="em_andamento">Em Andamento</option>
                <option value="concluido">Concluído</option>
                <option value="pausado">Pausado</option>
                <option value="cancelado">Cancelado</option>
              </select>
            </div>
            <div className="form-group">
              <label>Valor Estimado</label>
              <input
                type="number"
                name="valor_estimado"
                value={formData.valor_estimado}
                onChange={handleChange}
                step="0.01"
                min="0"
              />
            </div>
            <div className="form-group">
              <label>Data de Início</label>
              <input
                type="date"
                name="data_inicio"
                value={formData.data_inicio}
                onChange={handleChange}
              />
            </div>
            <div className="form-group">
              <label>Data Prevista de Entrega</label>
              <input
                type="date"
                name="data_prevista_entrega"
                value={formData.data_prevista_entrega}
                onChange={handleChange}
              />
            </div>
            <div className="form-group">
              <label>Responsável</label>
              <select
                name="responsavel_id"
                value={formData.responsavel_id}
                onChange={handleChange}
              >
                <option value="">Selecione um responsável...</option>
                {usuarios.map(usuario => (
                  <option key={usuario.id} value={usuario.id}>
                    {usuario.nome} {usuario.cargo ? `- ${usuario.cargo}` : ''}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </div>

        <div className="form-section">
          <h2>Detalhes</h2>
          <div className="form-group full-width">
            <label>Descrição</label>
            <textarea
              name="descricao"
              value={formData.descricao}
              onChange={handleChange}
              rows="4"
              placeholder="Descreva o projeto..."
            />
          </div>
          <div className="form-group full-width">
            <label>Observações</label>
            <textarea
              name="observacoes"
              value={formData.observacoes}
              onChange={handleChange}
              rows="4"
            />
          </div>
        </div>

        <div className="form-actions">
          <button type="submit" disabled={loading} className="btn-primary">
            {loading ? 'Salvando...' : 'Salvar Projeto'}
          </button>
        </div>
      </form>
    </div>
  );
};

export default ProjetoForm;

