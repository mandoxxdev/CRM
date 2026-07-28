import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { FiSearch, FiX, FiUsers, FiBriefcase, FiFileText, FiCalendar, FiPackage, FiDollarSign } from 'react-icons/fi';
import api from '../services/api';
import './BuscaGlobal.css';

const BuscaGlobal = ({ isOpen, onClose }) => {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef(null);
  const navigate = useNavigate();

  useEffect(() => {
    if (isOpen) {
      inputRef.current?.focus();
      setQuery('');
      setResults([]);
      setSelectedIndex(0);
    }
  }, [isOpen]);

  useEffect(() => {
    const searchTimeout = setTimeout(() => {
      if (query.trim().length >= 2) {
        performSearch(query);
      } else {
        setResults([]);
      }
    }, 300);

    return () => clearTimeout(searchTimeout);
  }, [query]);

  const performSearch = async (searchQuery) => {
    setLoading(true);
    try {
      // ATENCAO: o baseURL do axios ja termina em '/api' (ver services/api.js).
      // Prefixar '/api' aqui gera '/api/api/busca-global', que cai no catch-all
      // do Express e devolve 404 (a busca ficava sempre vazia).
      const response = await api.get('/busca-global', {
        params: { q: searchQuery }
      });
      const lista = Array.isArray(response.data) ? response.data : [];
      // Descarta tipos sem rota registrada no App.js: exibi-los levaria o usuario
      // para a home ao clicar, o que parece que "a busca nao funciona".
      setResults(lista.filter((item) => Boolean(getRoute(item.type))));
      setSelectedIndex(0);
    } catch (error) {
      console.error('Erro na busca:', error);
      setResults([]);
    } finally {
      setLoading(false);
    }
  };

  const getIcon = (type) => {
    const icons = {
      cliente: FiUsers,
      projeto: FiBriefcase,
      proposta: FiFileText,
      atividade: FiCalendar,
      produto: FiPackage,
      custo: FiDollarSign,
    };
    return icons[type] || FiSearch;
  };

  const getLabel = (type) => {
    const labels = {
      cliente: 'Cliente',
      projeto: 'Projeto',
      proposta: 'Proposta',
      atividade: 'Atividade',
      produto: 'Produto',
      custo: 'Custo de Viagem',
    };
    return labels[type] || type;
  };

  // Retorna null quando o tipo nao tem rota em App.js (ex.: 'oportunidade', cujo
  // modulo existe em components/ mas nao esta registrado no roteador).
  const getRoute = (type, id) => {
    const routes = {
      cliente: `/comercial/clientes/editar/${id}`,
      projeto: `/comercial/projetos/editar/${id}`,
      proposta: `/comercial/propostas/editar/${id}`,
      atividade: `/comercial/atividades`,
      produto: `/comercial/produtos/editar/${id}`,
      custo: `/comercial/custos-viagens`,
    };
    return routes[type] || null;
  };

  const handleSelect = (result) => {
    const route = getRoute(result.type, result.id);
    if (!route) return;
    navigate(route);
    onClose();
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Escape') {
      onClose();
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedIndex(prev => Math.min(prev + 1, results.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedIndex(prev => Math.max(prev - 1, 0));
    } else if (e.key === 'Enter' && results[selectedIndex]) {
      handleSelect(results[selectedIndex]);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="busca-global-overlay" onClick={onClose}>
      <div className="busca-global-modal" onClick={(e) => e.stopPropagation()}>
        <div className="busca-global-header">
          <div className="busca-global-input-wrapper">
            <FiSearch className="busca-global-icon" />
            <input
              ref={inputRef}
              type="text"
              className="busca-global-input"
              placeholder="Buscar clientes, projetos, propostas..."
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={handleKeyDown}
            />
            {query && (
              <button
                className="busca-global-clear"
                onClick={() => setQuery('')}
              >
                <FiX />
              </button>
            )}
          </div>
          <button className="busca-global-close" onClick={onClose}>
            <FiX />
          </button>
        </div>

        <div className="busca-global-results">
          {loading && (
            <div className="busca-global-loading">
              <div className="loading-spinner-small"></div>
              <span>Buscando...</span>
            </div>
          )}

          {!loading && query.trim().length < 2 && (
            <div className="busca-global-empty">
              <FiSearch />
              <p>Digite pelo menos 2 caracteres para buscar</p>
              <div className="busca-global-shortcuts">
                <kbd>Ctrl</kbd> + <kbd>K</kbd> para abrir busca
              </div>
            </div>
          )}

          {!loading && query.trim().length >= 2 && results.length === 0 && (
            <div className="busca-global-empty">
              <FiSearch />
              <p>Nenhum resultado encontrado</p>
            </div>
          )}

          {!loading && results.length > 0 && (
            <div className="busca-global-results-list">
              {results.map((result, index) => {
                const Icon = getIcon(result.type);
                return (
                  <div
                    key={`${result.type}-${result.id}`}
                    className={`busca-global-result-item ${index === selectedIndex ? 'selected' : ''}`}
                    onClick={() => handleSelect(result)}
                    onMouseEnter={() => setSelectedIndex(index)}
                  >
                    <div className="busca-global-result-icon">
                      <Icon />
                    </div>
                    <div className="busca-global-result-content">
                      <div className="busca-global-result-title">{result.title}</div>
                      <div className="busca-global-result-meta">
                        <span className="busca-global-result-type">{getLabel(result.type)}</span>
                        {result.subtitle && (
                          <span className="busca-global-result-subtitle">• {result.subtitle}</span>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default BuscaGlobal;

