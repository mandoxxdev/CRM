import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import api from '../services/api';
import { toast } from 'react-toastify';
import { FiPlus, FiSearch, FiEdit, FiTrash2, FiEye, FiDownload } from 'react-icons/fi';
import { exportToExcel } from '../utils/exportExcel';
import { SkeletonTable } from './SkeletonLoader';
import './Clientes.css';
import './Loading.css';

const Clientes = () => {
  const [clientes, setClientes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filterSegmento, setFilterSegmento] = useState('');

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
    // Debounce para evitar muitas requisições
    const timeoutId = setTimeout(() => {
      loadClientes();
    }, 300);

    return () => clearTimeout(timeoutId);
  }, [search, filterSegmento]);

  const loadClientes = async () => {
    setLoading(true);
    try {
      const params = {};
      if (search) params.search = search;
      if (filterSegmento) params.segmento = filterSegmento;
      
      const response = await api.get('/clientes', { params });
      setClientes(response.data);
    } catch (error) {
      console.error('Erro ao carregar clientes:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (id) => {
    if (window.confirm('Tem certeza que deseja desativar este cliente?')) {
      try {
        await api.delete(`/clientes/${id}`);
        loadClientes();
      } catch (error) {
        toast.error('Erro ao desativar cliente');
      }
    }
  };

  const handleExportExcel = () => {
    try {
      const dadosExport = clientes.map(cliente => ({
        'Razão Social': cliente.razao_social,
        'Nome Fantasia': cliente.nome_fantasia || '',
        'CNPJ': cliente.cnpj || '',
        'Segmento': cliente.segmento || '',
        'Contato Principal': cliente.contato_principal || '',
        'Email': cliente.email || '',
        'Telefone': cliente.telefone || '',
        'Status': cliente.status === 'ativo' ? 'Ativo' : 'Inativo',
        'Cadastrado em': cliente.created_at ? new Date(cliente.created_at).toLocaleDateString('pt-BR') : ''
      }));
      
      exportToExcel(dadosExport, 'clientes', 'Clientes');
      toast.success('Exportação realizada com sucesso!');
    } catch (error) {
      toast.error('Erro ao exportar dados');
      console.error('Erro ao exportar:', error);
    }
  };

  return (
    <div className="clientes">
      <div className="page-header">
        <div>
          <h1>Clientes</h1>
          <p>Gestão de clientes da GMP INDUSTRIAIS</p>
        </div>
        <div className="header-actions">
          <button onClick={handleExportExcel} className="btn-secondary" title="Exportar para Excel (Ctrl+E)">
            <FiDownload /> Exportar Excel
          </button>
          <Link to="/comercial/clientes/novo" className="btn-premium">
            <div className="btn-premium-icon">
              <FiPlus size={20} />
            </div>
            <span className="btn-premium-text">Novo Cliente</span>
            <div className="btn-premium-shine"></div>
          </Link>
        </div>
      </div>

      <div className="filters">
        <div className="search-box">
          <FiSearch />
          <input
            type="text"
            placeholder="Buscar por nome, fantasia ou CNPJ..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <select
          value={filterSegmento}
          onChange={(e) => setFilterSegmento(e.target.value)}
          className="filter-select"
        >
          <option value="">Todos os segmentos</option>
          {segmentos.map(seg => (
            <option key={seg} value={seg}>{seg}</option>
          ))}
        </select>
      </div>

      {loading ? (
        <SkeletonTable rows={8} columns={7} />
      ) : (
        <div className="table-container">
          <table className="data-table">
            <thead>
              <tr>
                <th>Razão Social</th>
                <th>Nome Fantasia</th>
                <th>CNPJ</th>
                <th>Segmento</th>
                <th>Contato</th>
                <th>Status</th>
                <th>Ações</th>
              </tr>
            </thead>
            <tbody>
              {clientes.length === 0 ? (
                <tr>
                  <td colSpan="7" className="no-data">
                    Nenhum cliente encontrado
                  </td>
                </tr>
              ) : (
                clientes.map(cliente => (
                  <tr key={cliente.id}>
                    <td>{cliente.razao_social}</td>
                    <td>{cliente.nome_fantasia || '-'}</td>
                    <td>{cliente.cnpj || '-'}</td>
                    <td>
                      <span className="badge">{cliente.segmento || '-'}</span>
                    </td>
                    <td>
                      <div>{cliente.contato_principal || '-'}</div>
                      <div className="text-muted">{cliente.email || '-'}</div>
                    </td>
                    <td>
                      <span className={`status-badge ${cliente.status}`}>
                        {cliente.status === 'ativo' ? 'Ativo' : 'Inativo'}
                      </span>
                    </td>
                    <td>
                      <div className="action-buttons">
                        <Link to={`/comercial/clientes/editar/${cliente.id}`} className="btn-icon" title="Editar">
                          <FiEdit />
                        </Link>
                        <button
                          onClick={() => handleDelete(cliente.id)}
                          className="btn-icon btn-danger"
                          title="Desativar"
                        >
                          <FiTrash2 />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};

export default Clientes;

