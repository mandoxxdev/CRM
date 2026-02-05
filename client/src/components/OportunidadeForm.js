import React, { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import api from '../services/api';
import './OportunidadeForm.css';

const OportunidadeForm = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [clientes, setClientes] = useState([]);
  const [formData, setFormData] = useState({
    cliente_id: '',
    titulo: '',
    descricao: '',
    valor_estimado: '',
    probabilidade: 50,
    etapa: 'prospeccao',
    data_prevista_fechamento: '',
    responsavel_id: '',
    origem: '',
    observacoes: ''
  });

  const etapas = [
    { value: 'prospeccao', label: 'Prospecção' },
    { value: 'qualificacao', label: 'Qualificação' },
    { value: 'proposta', label: 'Proposta' },
    { value: 'negociacao', label: 'Negociação' },
    { value: 'fechada', label: 'Fechada' },
    { value: 'perdida', label: 'Perdida' }
  ];

  useEffect(() => {
    loadClientes();
    if (id) {
      loadOportunidade();
    }
  }, [id]);

  const loadClientes = async () => {
    try {
      const response = await api.get('/clientes', { params: { status: 'ativo' } });
      setClientes(response.data);
    } catch (error) {
      console.error('Erro ao carregar clientes:', error);
    }
  };

  const loadOportunidade = async () => {
    try {
      const response = await api.get(`/oportunidades/${id}`);
      const data = response.data;
      setFormData({
        ...data,
        data_prevista_fechamento: data.data_prevista_fechamento
          ? data.data_prevista_fechamento.split('T')[0]
          : ''
      });
    } catch (error) {
      console.error('Erro ao carregar oportunidade:', error);
      alert('Erro ao carregar oportunidade');
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
        await api.put(`/oportunidades/${id}`, formData);
      } else {
        await api.post('/oportunidades', formData);
      }
      navigate('/comercial/oportunidades');
    } catch (error) {
      alert(error.response?.data?.error || 'Erro ao salvar oportunidade');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="oportunidade-form">
      <div className="form-header">
        <h1>{id ? 'Editar Oportunidade' : 'Nova Oportunidade'}</h1>
        <button onClick={() => navigate('/comercial/oportunidades')} className="btn-secondary">
          Cancelar
        </button>
      </div>

      <form onSubmit={handleSubmit} className="form">
        <div className="form-section">
          <h2>Informações Básicas</h2>
          <div className="form-grid">
            <div className="form-group full-width">
              <label>Título *</label>
              <input
                type="text"
                name="titulo"
                value={formData.titulo}
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
              <label>Etapa</label>
              <select
                name="etapa"
                value={formData.etapa}
                onChange={handleChange}
              >
                {etapas.map(etapa => (
                  <option key={etapa.value} value={etapa.value}>
                    {etapa.label}
                  </option>
                ))}
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
              <label>Probabilidade (%)</label>
              <input
                type="number"
                name="probabilidade"
                value={formData.probabilidade}
                onChange={handleChange}
                min="0"
                max="100"
              />
            </div>
            <div className="form-group">
              <label>Data Prevista de Fechamento</label>
              <input
                type="date"
                name="data_prevista_fechamento"
                value={formData.data_prevista_fechamento}
                onChange={handleChange}
              />
            </div>
            <div className="form-group">
              <label>Origem</label>
              <input
                type="text"
                name="origem"
                value={formData.origem}
                onChange={handleChange}
                placeholder="Ex: Site, Indicação, etc."
              />
            </div>
          </div>
          <div className="form-group full-width">
            <label>Descrição</label>
            <textarea
              name="descricao"
              value={formData.descricao}
              onChange={handleChange}
              rows="4"
            />
          </div>
        </div>

        <div className="form-section">
          <h2>Informações Adicionais</h2>
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
            {loading ? 'Salvando...' : 'Salvar Oportunidade'}
          </button>
        </div>
      </form>
    </div>
  );
};

export default OportunidadeForm;




