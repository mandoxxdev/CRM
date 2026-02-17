import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import api from '../services/api';
import { FiPlus, FiEdit, FiFilter } from 'react-icons/fi';
import { format } from 'date-fns';
import './Oportunidades.css';
import './Loading.css';

const Oportunidades = () => {
  const [oportunidades, setOportunidades] = useState([]);
  const [usuarios, setUsuarios] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filtroUsuario, setFiltroUsuario] = useState('');

  useEffect(() => {
    const loadData = async () => {
      setLoading(true);
      try {
        // Carregar em paralelo para melhor performance
        const [oportunidadesRes, usuariosRes] = await Promise.all([
          api.get('/oportunidades', { params: filtroUsuario ? { responsavel_id: filtroUsuario } : {} }),
          api.get('/usuarios')
        ]);
        setOportunidades(oportunidadesRes.data);
        setUsuarios(Array.isArray(usuariosRes.data) ? usuariosRes.data.filter(u => u.ativo) : []);
      } catch (error) {
        console.error('Erro ao carregar dados:', error);
      } finally {
        setLoading(false);
      }
    };
    loadData();
  }, [filtroUsuario]);

  const formatCurrency = (value) => {
    return new Intl.NumberFormat('pt-BR', {
      style: 'currency',
      currency: 'BRL'
    }).format(value || 0);
  };

  const getEtapaColor = (etapa) => {
    const colors = {
      'prospeccao': '#95a5a6',
      'qualificacao': '#3498db',
      'proposta': '#f39c12',
      'negociacao': '#9b59b6',
      'fechada': '#2ecc71',
      'perdida': '#e74c3c'
    };
    return colors[etapa] || '#95a5a6';
  };

  if (loading) {
    return (
      <div className="loading">
        <div className="loading-spinner"></div>
        <p>Carregando oportunidades...</p>
      </div>
    );
  }

  return (
    <div className="oportunidades">
      <div className="page-header">
        <div>
          <h1>Oportunidades</h1>
          <p>Gestão de oportunidades de negócio</p>
        </div>
        <Link to="/comercial/oportunidades/nova" className="btn-primary">
          <FiPlus /> Nova Oportunidade
        </Link>
      </div>

      <div className="filters">
        <div className="filter-group">
          <FiFilter />
          <select
            value={filtroUsuario}
            onChange={(e) => setFiltroUsuario(e.target.value)}
            className="filter-select"
          >
            <option value="">Todos os responsáveis</option>
            {usuarios.map(usuario => (
              <option key={usuario.id} value={usuario.id}>
                {usuario.nome}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="oportunidades-grid">
        {oportunidades.length === 0 ? (
          <div className="no-data">Nenhuma oportunidade encontrada</div>
        ) : (
          oportunidades.map(oportunidade => (
            <div key={oportunidade.id} className="oportunidade-card">
              <div className="oportunidade-header">
                <h3>{oportunidade.titulo}</h3>
                <span
                  className="etapa-badge"
                  style={{ background: getEtapaColor(oportunidade.etapa) }}
                >
                  {oportunidade.etapa.toUpperCase()}
                </span>
              </div>
              <div className="oportunidade-body">
                <div className="oportunidade-info">
                  <strong>Cliente:</strong> {oportunidade.cliente_nome}
                </div>
                {oportunidade.valor_estimado && (
                  <div className="oportunidade-info">
                    <strong>Valor Estimado:</strong> {formatCurrency(oportunidade.valor_estimado)}
                  </div>
                )}
                <div className="oportunidade-info">
                  <strong>Probabilidade:</strong> {oportunidade.probabilidade}%
                </div>
                {oportunidade.data_prevista_fechamento && (
                  <div className="oportunidade-info">
                    <strong>Fechamento Previsto:</strong>{' '}
                    {format(new Date(oportunidade.data_prevista_fechamento), 'dd/MM/yyyy')}
                  </div>
                )}
                {oportunidade.responsavel_nome && (
                  <div className="oportunidade-info">
                    <strong>Responsável:</strong> {oportunidade.responsavel_nome}
                  </div>
                )}
              </div>
              <div className="oportunidade-actions">
                <Link to={`/comercial/oportunidades/editar/${oportunidade.id}`} className="btn-icon">
                  <FiEdit /> Editar
                </Link>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
};

export default Oportunidades;

