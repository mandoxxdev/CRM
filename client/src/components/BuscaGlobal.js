import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { FiSearch, FiX, FiUsers, FiBriefcase, FiFileText, FiCalendar, FiPackage, FiDollarSign } from 'react-icons/fi';
import api from '../services/api';
import { useAuth } from '../context/AuthContext';
import { fetchUserPermissions, getCachedUserPermissions } from '../services/permissionsCache';
import { mergeUserPermissions } from '../utils/systemPermissions';
import { podeUsarBuscaGlobal, FRASE_BUSCA_SEM_MODULO, FRASE_BUSCA_FALHOU } from '../utils/buscaGlobalAcesso';
import './BuscaGlobal.css';

const BuscaGlobal = ({ isOpen, onClose }) => {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [erro, setErro] = useState(false);
  // Etapa 155 (RN-155.02, C364, B999): 'sim' busca; 'nao' diz por que nao busca (a regua da tela nao da o Comercial, o unico modulo dos tipos
  // da busca); 'verificando' = o cache de permissoes estava frio ao abrir (ele vence em 5 min) e a leitura esta em voo — o que se digita espera.
  const [acesso, setAcesso] = useState('sim');
  // Etapa 155 (RN-155.03, C365): o numero do ultimo pedido. Cada busca, o termo curto, o fechar e o abrir o incrementam; so o pedido com o
  // numero corrente grava resultado, erro e "carregando". Antes, a resposta de um termo anterior (o 503 repetido pelo interceptor, ou so mais
  // lenta) aparecia com o termo novo no campo.
  const pedidoRef = useRef(0);
  const inputRef = useRef(null);
  const modalRef = useRef(null);
  const navigate = useNavigate();
  const { user } = useAuth();

  const descartarPedidoEmVoo = () => {
    pedidoRef.current += 1;
    setLoading(false);
  };

  useEffect(() => {
    descartarPedidoEmVoo();
    if (!isOpen) return undefined;
    inputRef.current?.focus();
    setQuery('');
    setResults([]);
    setErro(false);
    setSelectedIndex(0);
    let vivo = true;
    // o usuario efetivo (o do contexto com o que a leitura das permissoes trouxe): quem virou administrador no meio da sessao busca como o
    // servidor o deixaria (Fase 5 r2 A2)
    const cached = user?.id ? getCachedUserPermissions(user.id) : null;
    const decisao = podeUsarBuscaGlobal(user?.id ? mergeUserPermissions(user, cached?.usuario || {}) : user, cached);
    if (decisao === null) {
      setAcesso('verificando');
      fetchUserPermissions(user.id)
        .then((data) => {
          if (vivo) setAcesso(podeUsarBuscaGlobal(mergeUserPermissions(user, data?.usuario || {}), data || { permissoes: [] }) === false ? 'nao' : 'sim');
        })
        // a leitura falhou ou esgotou o tempo: falha ABERTO — o servidor filtra (a tela so evita a busca que nunca acha nada)
        .catch(() => { if (vivo) setAcesso('sim'); });
    } else {
      setAcesso(decisao ? 'sim' : 'nao');
    }
    return () => { vivo = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);

  // o foco no campo quando ele esta ligado (ao reabrir depois de uma abertura sem acesso, o focus() do abrir caia no campo ainda desligado —
  // Fase 5 r1 A4)
  useEffect(() => {
    if (isOpen && acesso !== 'nao') inputRef.current?.focus();
  }, [isOpen, acesso]);

  // o Esc fecha mesmo com o campo desligado (sem o Comercial o campo nao recebe foco, e o Esc so era ouvido nele — Fase 2 I-2). So o Esc
  // teclado DENTRO da busca, ou sem foco em lugar nenhum: o Esc de outra janela aberta por cima (a ajuda do F1) fecha so ela (Fase 5 r1 A2).
  useEffect(() => {
    if (!isOpen) return undefined;
    const aoTeclar = (e) => {
      if (e.key !== 'Escape') return;
      const alvo = e.target;
      const semFoco = !alvo || alvo === window || alvo === document || alvo === document.body || alvo === document.documentElement;
      if (semFoco || (modalRef.current && modalRef.current.contains(alvo))) onClose();
    };
    window.addEventListener('keydown', aoTeclar);
    return () => window.removeEventListener('keydown', aoTeclar);
  }, [isOpen, onClose]);

  useEffect(() => {
    // fechada, ou sem a decisao de acesso, nao pede nada (o atraso de 300 ms de um termo digitado antes de fechar nao dispara — Fase 2 I-4)
    if (!isOpen || acesso !== 'sim') return undefined;
    // o termo curto descarta o pedido em voo NA HORA (nao depois do atraso): a resposta que chegasse nos 300 ms apareceria com o "Digite
    // pelo menos 2 caracteres" (Fase 5 r1 A3); e o erro velho sai junto (r3 B8)
    if (query.trim().length < 2) {
      descartarPedidoEmVoo();
      setResults([]);
      setErro(false);
      return undefined;
    }
    const searchTimeout = setTimeout(() => {
      performSearch(query);
    }, 300);

    return () => clearTimeout(searchTimeout);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query, isOpen, acesso]);

  const performSearch = async (searchQuery) => {
    pedidoRef.current += 1;
    const pedido = pedidoRef.current;
    setLoading(true);
    try {
      // ATENCAO: o baseURL do axios ja termina em '/api' (ver services/api.js).
      // Prefixar '/api' aqui gera '/api/api/busca-global', que cai no catch-all
      // do Express e devolve 404 (a busca ficava sempre vazia).
      const response = await api.get('/busca-global', {
        params: { q: searchQuery }
      });
      if (pedido !== pedidoRef.current) return; // um pedido mais novo (ou o fechar) ja tomou o lugar deste
      const lista = Array.isArray(response.data) ? response.data : [];
      setErro(false);
      // Descarta tipos sem rota registrada no App.js: exibi-los levaria o usuario
      // para a home ao clicar, o que parece que "a busca nao funciona".
      setResults(lista.filter((item) => Boolean(getRoute(item.type))));
      setSelectedIndex(0);
    } catch (error) {
      if (pedido !== pedidoRef.current) return;
      console.error('Erro na busca:', error);
      setResults([]);
      setErro(true);
    } finally {
      if (pedido === pedidoRef.current) setLoading(false);
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
    // o Esc e ouvido no window (acima) — aqui fecharia duas vezes
    if (e.key === 'ArrowDown') {
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
      <div className="busca-global-modal" ref={modalRef} onClick={(e) => e.stopPropagation()}>
        <div className="busca-global-header">
          <div className="busca-global-input-wrapper">
            <FiSearch className="busca-global-icon" />
            <input
              ref={inputRef}
              type="text"
              className="busca-global-input"
              placeholder="Buscar clientes, projetos, propostas..."
              disabled={acesso === 'nao'}
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
          {(loading || (acesso === 'verificando' && query.trim().length >= 2)) && (
            <div className="busca-global-loading">
              <div className="loading-spinner-small"></div>
              <span>Buscando...</span>
            </div>
          )}

          {acesso === 'nao' && (
            <div className="busca-global-empty busca-global-sem-modulo">
              <FiSearch />
              <p>{FRASE_BUSCA_SEM_MODULO}</p>
            </div>
          )}

          {acesso !== 'nao' && !loading && query.trim().length < 2 && (
            <div className="busca-global-empty">
              <FiSearch />
              <p>Digite pelo menos 2 caracteres para buscar</p>
              <div className="busca-global-shortcuts">
                <kbd>Ctrl</kbd> + <kbd>K</kbd> para abrir busca
              </div>
            </div>
          )}

          {acesso === 'sim' && !loading && query.trim().length >= 2 && results.length === 0 && (
            <div className="busca-global-empty">
              <FiSearch />
              <p>{erro ? FRASE_BUSCA_FALHOU : 'Nenhum resultado encontrado'}</p>
            </div>
          )}

          {acesso === 'sim' && !loading && results.length > 0 && (
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

