import React, { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import api from '../services/api';
import { FiPlus, FiSearch, FiEdit, FiTrash2, FiFileText, FiArrowLeft } from 'react-icons/fi';
import ModalSelecaoTipoProduto from './ModalSelecaoTipoProduto';
import './Produtos.css';
import './Loading.css';

const Produtos = ({ familiaFromUrl }) => {
  const navigate = useNavigate();
  const [produtos, setProdutos] = useState([]);
  const [familias, setFamilias] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filterFamilia, setFilterFamilia] = useState(familiaFromUrl || '');
  const [showModalTipo, setShowModalTipo] = useState(false);

  useEffect(() => {
    if (familiaFromUrl) setFilterFamilia(familiaFromUrl);
  }, [familiaFromUrl]);

  useEffect(() => {
    api.get('/produtos/familias').then((res) => {
      const list = (res.data || []).map((f) => f.nome);
      setFamilias(list);
    }).catch(() => setFamilias([]));
  }, []);

  useEffect(() => {
    const timeoutId = setTimeout(() => {
      loadProdutos();
    }, 300);

    return () => clearTimeout(timeoutId);
  }, [search, filterFamilia]);

  const loadProdutos = async () => {
    setLoading(true);
    try {
      const params = {};
      if (search) params.search = search;
      if (filterFamilia) params.familia = filterFamilia;
      params.ativo = 'true';
      
      const response = await api.get('/produtos', { params });
      setProdutos(response.data);
    } catch (error) {
      console.error('Erro ao carregar produtos:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (id) => {
    if (window.confirm('Tem certeza que deseja desativar este produto?')) {
      try {
        await api.delete(`/produtos/${id}`);
        loadProdutos();
      } catch (error) {
        alert('Erro ao desativar produto');
      }
    }
  };

  const formatCurrency = (value) => {
    return new Intl.NumberFormat('pt-BR', {
      style: 'currency',
      currency: 'BRL'
    }).format(value || 0);
  };

  // Monta o descritivo técnico (material, espessura, etc. para discos; CCM, potência, etc. para equipamentos)
  const getDescritivoTecnico = (produto) => {
    let spec = {};
    try {
      const raw = produto.especificacoes_tecnicas;
      if (raw) spec = typeof raw === 'string' ? JSON.parse(raw) : raw;
    } catch (_) {}
    const parts = [];
    // Campos comuns / discos e acessórios
    if (spec.material_contato) parts.push(`Material: ${spec.material_contato}`);
    if (spec.espessura) parts.push(`Espessura: ${spec.espessura}`);
    if (spec.acabamento) parts.push(`Acabamento: ${spec.acabamento}`);
    if (spec.diametro) parts.push(`Diâmetro: ${spec.diametro}`);
    if (spec.funcao) parts.push(`Função: ${spec.funcao}`);
    if (spec.tratamento_termico) parts.push(`Trat. Térmico: ${spec.tratamento_termico}`);
    if (spec.velocidade_trabalho) parts.push(`Velocidade: ${spec.velocidade_trabalho}`);
    // Campos de equipamento
    if (spec.ccm_incluso) parts.push(`CCM: ${spec.ccm_incluso}`);
    if (spec.ccm_tensao) parts.push(`Tensão CCM: ${spec.ccm_tensao}`);
    if (spec.celula_carga) parts.push(`Célula de Carga: ${spec.celula_carga}`);
    if (spec.plc_ihm) parts.push(`PLC/IHM: ${spec.plc_ihm}`);
    if (spec.valvula_saida_tanque) parts.push(`Válvula Saída: ${spec.valvula_saida_tanque}`);
    const totalCV = [spec.motor_central_cv, spec.motoredutor_central_cv, spec.motores_laterais_cv]
      .reduce((s, v) => s + (parseFloat(v) || 0), 0);
    if (totalCV > 0) parts.push(`Potência: ${totalCV.toFixed(1).replace('.', ',')} CV`);
    const classArea = spec.classificacao_area || produto.classificacao_area;
    if (classArea) parts.push(`Class. Área: ${classArea}`);
    return parts.length ? parts.join(' • ') : null;
  };

  if (loading) {
    return (
      <div className="loading">
        <div className="loading-spinner"></div>
        <p>Carregando produtos...</p>
      </div>
    );
  }

  return (
    <div className="produtos">
      <div className="page-header">
        <div>
          {filterFamilia && (
            <button
              type="button"
              onClick={() => navigate('/comercial/produtos')}
              className="btn-voltar-familias"
            >
              <FiArrowLeft /> Voltar para famílias
            </button>
          )}
          <h1>Produtos{filterFamilia ? ` – ${filterFamilia}` : ''}</h1>
          <p>Gerenciamento de produtos e geração de propostas</p>
        </div>
        <div style={{ display: 'flex', gap: 'var(--spacing-md)' }}>
          <button onClick={() => setShowModalTipo(true)} className="btn-premium">
            <div className="btn-premium-icon">
              <FiPlus size={20} />
            </div>
            <span className="btn-premium-text">Novo Produto</span>
            <div className="btn-premium-shine"></div>
          </button>
        </div>
      </div>

      <ModalSelecaoTipoProduto 
        isOpen={showModalTipo} 
        onClose={() => setShowModalTipo(false)} 
      />

      <div className="filters">
        <div className="search-box">
          <FiSearch />
          <input
            type="text"
            placeholder="Buscar por código, nome, modelo ou descrição..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <select
          value={filterFamilia}
          onChange={(e) => setFilterFamilia(e.target.value)}
          className="filter-select"
        >
          <option value="">Todas as famílias</option>
          {familias.map(familia => (
            <option key={familia} value={familia}>{familia}</option>
          ))}
        </select>
      </div>

      <div className="table-container">
        <table className="data-table">
          <thead>
            <tr>
              <th>Código</th>
              <th>Nome</th>
              <th>Família</th>
              <th>Modelo</th>
              <th>Class. Área</th>
              <th>Preço Base</th>
              <th>ICMS</th>
              <th>IPI</th>
              <th>Unidade</th>
              <th>Ações</th>
            </tr>
          </thead>
          <tbody>
            {produtos.length === 0 ? (
              <tr>
                <td colSpan="10" className="no-data">
                  Nenhum produto encontrado
                </td>
              </tr>
            ) : (
              produtos.map(produto => {
                const classificacao = produto.classificacao_area || (() => {
                  try {
                    const spec = produto.especificacoes_tecnicas ? (typeof produto.especificacoes_tecnicas === 'string' ? JSON.parse(produto.especificacoes_tecnicas) : produto.especificacoes_tecnicas) : {};
                    return spec.classificacao_area || null;
                  } catch (e) { return null; }
                })();
                const descritivoTecnico = getDescritivoTecnico(produto);
                return (
                <tr key={produto.id}>
                  <td><strong>{produto.codigo}</strong></td>
                  <td className="produto-nome-cell">
                    <div className="produto-nome-texto">{produto.nome}</div>
                    {descritivoTecnico && (
                      <div className="produto-nome-descritivo" title={descritivoTecnico}>
                        {descritivoTecnico}
                      </div>
                    )}
                  </td>
                  <td>{produto.familia || '-'}</td>
                  <td>{produto.modelo || '-'}</td>
                  <td>{classificacao || '-'}</td>
                  <td>{formatCurrency(produto.preco_base)}</td>
                  <td>{produto.icms}%</td>
                  <td>{produto.ipi}%</td>
                  <td>{produto.unidade}</td>
                  <td>
                    <div className="action-buttons">
                      <Link
                        to={`/comercial/produtos/editar/${produto.id}?tipo=${produto.familia === 'Hélices e Acessórios' ? 'discos-acessorios' : 'equipamentos'}`}
                        className="btn-icon"
                        title="Editar"
                      >
                        <FiEdit />
                      </Link>
                      <button
                        onClick={() => handleDelete(produto.id)}
                        className="btn-icon btn-danger"
                        title="Desativar"
                      >
                        <FiTrash2 />
                      </button>
                      <Link
                        to={`/comercial/propostas/nova?produto=${produto.id}`}
                        className="btn-icon btn-success"
                        title="Gerar Proposta"
                      >
                        <FiFileText />
                      </Link>
                    </div>
                  </td>
                </tr>
              );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default Produtos;

