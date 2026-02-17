import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import api from '../services/api';
import { useAuth } from '../context/AuthContext';
import { FiPlus, FiEdit, FiFilter } from 'react-icons/fi';
import { format } from 'date-fns';
import './Projetos.css';
import './Loading.css';

const Projetos = () => {
  const [projetos, setProjetos] = useState([]);
  const [usuarios, setUsuarios] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filtroUsuario, setFiltroUsuario] = useState('');
  const { user } = useAuth();

  useEffect(() => {
    const loadData = async () => {
      setLoading(true);
      try {
        // Carregar em paralelo para melhor performance
        const [projetosRes, usuariosRes] = await Promise.all([
          api.get('/projetos', { params: filtroUsuario ? { responsavel_id: filtroUsuario } : {} }),
          api.get('/usuarios')
        ]);
        setProjetos(projetosRes.data);
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

  const getStatusColor = (status) => {
    const colors = {
      'em_andamento': '#3498db',
      'concluido': '#2ecc71',
      'pausado': '#f39c12',
      'cancelado': '#e74c3c'
    };
    return colors[status] || '#95a5a6';
  };

  if (loading) {
    return (
      <div className="loading">
        <div className="loading-spinner"></div>
        <p>Carregando projetos...</p>
      </div>
    );
  }

  return (
    <div className="projetos">
      <div className="page-header">
        <div>
          <h1>Projetos</h1>
          <p>Gestão de projetos Turn Key</p>
        </div>
        <Link to="/comercial/projetos/novo" className="btn-premium">
          <div className="btn-premium-icon">
            <FiPlus size={20} />
          </div>
          <span className="btn-premium-text">Novo Projeto</span>
          <div className="btn-premium-shine"></div>
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

      <div className="projetos-grid">
        {projetos.length === 0 ? (
          <div className="no-data">Nenhum projeto encontrado</div>
        ) : (
          projetos.map(projeto => (
            <div key={projeto.id} className="projeto-card">
              <div className="projeto-header">
                <h3>{projeto.nome_projeto}</h3>
                <span
                  className="status-badge"
                  style={{ background: getStatusColor(projeto.status) }}
                >
                  {projeto.status.replace('_', ' ').toUpperCase()}
                </span>
              </div>
              <div className="projeto-body">
                <div className="projeto-info">
                  <strong>Cliente:</strong> {projeto.cliente_nome}
                </div>
                {projeto.segmento && (
                  <div className="projeto-info">
                    <strong>Segmento:</strong> {projeto.segmento}
                  </div>
                )}
                {projeto.valor_estimado && (
                  <div className="projeto-info">
                    <strong>Valor Estimado:</strong> {formatCurrency(projeto.valor_estimado)}
                  </div>
                )}
                {projeto.data_prevista_entrega && (
                  <div className="projeto-info">
                    <strong>Entrega Prevista:</strong>{' '}
                    {format(new Date(projeto.data_prevista_entrega), 'dd/MM/yyyy')}
                  </div>
                )}
                {projeto.responsavel_nome && (
                  <div className="projeto-info">
                    <strong>Responsável:</strong> {projeto.responsavel_nome}
                  </div>
                )}
              </div>
              <div className="projeto-actions">
                <Link to={`/comercial/projetos/editar/${projeto.id}`} className="btn-icon">
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

export default Projetos;

