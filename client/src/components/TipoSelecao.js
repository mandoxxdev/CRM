import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import api from '../services/api';
import {
  FiBriefcase, FiShoppingCart, FiDollarSign,
  FiSettings, FiPackage, FiTarget,
  FiLock, FiShield, FiTool, FiSliders, FiArchive,
  FiSearch, FiPlay, FiX
} from 'react-icons/fi';
import SplashScreen from './SplashScreen';
import './TipoSelecao.css';

const RECENT_MODULES_KEY = 'gmp_modulos_recentes';

const getSaudacao = () => {
  const hora = new Date().getHours();
  if (hora < 12) return 'Bom dia';
  if (hora < 18) return 'Boa tarde';
  return 'Boa noite';
};

const getPrimeiroNome = (nome) => {
  if (!nome) return '';
  return nome.trim().split(/\s+/)[0];
};

const TipoSelecao = ({ onClose, forceShow = false }) => {
  const [modulosDisponiveis, setModulosDisponiveis] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showSplash, setShowSplash] = useState(false);
  const [splashModule, setSplashModule] = useState(null);
  const [rotaDestino, setRotaDestino] = useState(null);
  const [busca, setBusca] = useState('');
  const [recentesIds, setRecentesIds] = useState([]);
  const navigate = useNavigate();
  const { user } = useAuth();

  const todosModulos = [
    {
      id: 'comercial',
      nome: 'Comercial',
      descricao: 'Vendas, propostas e oportunidades',
      icon: FiTarget,
      modulo: 'comercial',
      rota: '/comercial',
      gradient: 'linear-gradient(135deg, #1e40af 0%, #3b82f6 50%, #60a5fa 100%)'
    },
    {
      id: 'frota',
      nome: 'Frota',
      descricao: 'Manutenção e vistoria de veículos',
      icon: FiTool,
      modulo: 'comercial',
      rota: '/frota',
      gradient: 'linear-gradient(135deg, #6b21a8 0%, #9333ea 50%, #c084fc 100%)'
    },
    {
      id: 'compras',
      nome: 'Compras',
      descricao: 'Fornecedores, pedidos e cotações',
      icon: FiShoppingCart,
      modulo: 'compras',
      rota: '/compras',
      gradient: 'linear-gradient(135deg, #b45309 0%, #f59e0b 50%, #fbbf24 100%)'
    },
    {
      id: 'financeiro',
      nome: 'Financeiro',
      descricao: 'Contas, fluxo de caixa e bancos',
      icon: FiDollarSign,
      modulo: 'financeiro',
      rota: '/financeiro',
      gradient: 'linear-gradient(135deg, #15803d 0%, #22c55e 50%, #4ade80 100%)'
    },
    {
      id: 'operacional',
      nome: 'Operacional',
      descricao: 'Fábrica, OS e produção',
      icon: FiPackage,
      modulo: 'operacional',
      rota: '/fabrica',
      gradient: 'linear-gradient(135deg, #c2410c 0%, #f97316 50%, #fb923c 100%)'
    },
    {
      id: 'administrativo',
      nome: 'Administrativo',
      descricao: 'Configurações do sistema',
      icon: FiSettings,
      modulo: 'administrativo',
      rota: '/configuracoes',
      gradient: 'linear-gradient(135deg, #334155 0%, #64748b 50%, #94a3b8 100%)'
    },
    {
      id: 'engenharia',
      nome: 'Cálculos de Engenharia',
      descricao: 'Tampo, pressão e dimensionamento',
      icon: FiSliders,
      modulo: 'engenharia',
      rota: '/engenharia',
      gradient: 'linear-gradient(135deg, #0e7490 0%, #06b6d4 50%, #22d3ee 100%)'
    },
    {
      id: 'engenharia_projetos',
      nome: 'Engenharia / Projetos',
      descricao: 'Solicitações e cadastros',
      icon: FiBriefcase,
      modulo: 'engenharia_projetos',
      rota: '/engenharia-projetos',
      gradient: 'linear-gradient(135deg, #4338ca 0%, #6366f1 50%, #818cf8 100%)'
    },
    {
      id: 'almoxarifado',
      nome: 'Almoxarifado',
      descricao: 'Materiais, estoque e conferências',
      icon: FiArchive,
      modulo: 'almoxarifado',
      rota: '/almoxarifado',
      gradient: 'linear-gradient(135deg, #3f6212 0%, #65a30d 50%, #a3e635 100%)'
    },
    {
      id: 'admin',
      nome: 'Admin',
      descricao: 'Usuários e permissões',
      icon: FiShield,
      modulo: 'admin',
      rota: '/admin',
      gradient: 'linear-gradient(135deg, #991b1b 0%, #dc2626 50%, #f87171 100%)'
    }
  ];

  useEffect(() => {
    try {
      const stored = JSON.parse(localStorage.getItem(RECENT_MODULES_KEY) || '[]');
      if (Array.isArray(stored)) {
        setRecentesIds(stored);
      }
    } catch {
      setRecentesIds([]);
    }
  }, []);

  useEffect(() => {
    if (forceShow) {
      sessionStorage.removeItem('rotaDestinoModulo');
      sessionStorage.removeItem('moduloDestino');
    }
  }, [forceShow]);

  useEffect(() => {
    if (forceShow) return;
    const verificarRotaPendente = () => {
      const rotaPendente = sessionStorage.getItem('rotaDestinoModulo');
      if (rotaPendente && !showSplash) {
        sessionStorage.removeItem('rotaDestinoModulo');
        sessionStorage.removeItem('moduloDestino');
        navigate(rotaPendente, { replace: true });
      }
    };
    const timer = setTimeout(verificarRotaPendente, 1000);
    return () => clearTimeout(timer);
  }, [forceShow, showSplash, navigate]);

  useEffect(() => {
    const carregarModulosPermitidos = async () => {
      if (!user?.id) {
        setLoading(false);
        const modulosComStatus = todosModulos.map(mod => ({
          ...mod,
          disponivel: mod.modulo === 'comercial'
        }));
        setModulosDisponiveis(modulosComStatus);
        return;
      }

      const userRole = String(user.role || '').toLowerCase();
      const isAdmin = userRole === 'admin';

      try {
        setLoading(true);

        if (isAdmin) {
          const modulosComStatus = todosModulos.map(mod => ({
            ...mod,
            disponivel: true
          }));
          setModulosDisponiveis(modulosComStatus);
          setLoading(false);
          return;
        }

        const response = await api.get(`/usuarios/${user.id}/grupos`);
        const { permissoes } = response.data;

        const modulosPermitidos = new Set();

        if (permissoes && permissoes.length > 0) {
          permissoes.forEach(perm => {
            if (perm.permissao === 1) {
              modulosPermitidos.add(perm.modulo);
            }
          });
        } else {
          modulosPermitidos.add('comercial');
        }

        const modulosComStatus = todosModulos.map(mod => ({
          ...mod,
          disponivel: modulosPermitidos.has(mod.modulo)
        }));

        setModulosDisponiveis(modulosComStatus);
      } catch (error) {
        console.error('Erro ao carregar módulos:', error);
        const userRoleError = String(user.role || '').toLowerCase();
        if (userRoleError === 'admin') {
          const modulosComStatus = todosModulos.map(mod => ({
            ...mod,
            disponivel: true
          }));
          setModulosDisponiveis(modulosComStatus);
        } else {
          const modulosComStatus = todosModulos.map(mod => ({
            ...mod,
            disponivel: mod.modulo === 'comercial'
          }));
          setModulosDisponiveis(modulosComStatus);
        }
      } finally {
        setLoading(false);
      }
    };

    if (user) {
      carregarModulosPermitidos();
    } else {
      setLoading(false);
      const modulosComStatus = todosModulos.map(mod => ({
        ...mod,
        disponivel: mod.modulo === 'comercial'
      }));
      setModulosDisponiveis(modulosComStatus);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  const salvarModuloRecente = (moduleId) => {
    try {
      const updated = [moduleId, ...recentesIds.filter(id => id !== moduleId)].slice(0, 4);
      localStorage.setItem(RECENT_MODULES_KEY, JSON.stringify(updated));
      setRecentesIds(updated);
    } catch (error) {
      console.error('Erro ao salvar módulo recente:', error);
    }
  };

  const handleModuloClick = (modulo) => {
    if (modulo.disponivel && modulo.rota) {
      if (!forceShow) {
        sessionStorage.setItem('modulosVisualizados', 'true');
      }

      salvarModuloRecente(modulo.id);

      sessionStorage.setItem('rotaDestinoModulo', modulo.rota);
      sessionStorage.setItem('moduloDestino', modulo.modulo);

      setRotaDestino(modulo.rota);
      setSplashModule(modulo.modulo);
      setShowSplash(true);
    }
  };

  const handleSplashComplete = () => {
    const rota = rotaDestino || sessionStorage.getItem('rotaDestinoModulo');

    sessionStorage.removeItem('rotaDestinoModulo');
    sessionStorage.removeItem('moduloDestino');

    setShowSplash(false);
    setRotaDestino(null);
    setSplashModule(null);

    if (onClose) {
      onClose();
    }

    if (rota) {
      navigate(rota, { replace: true });
    }
  };

  const filtrarPorBusca = (lista) => {
    const termo = busca.trim().toLowerCase();
    if (!termo) return lista;
    return lista.filter(mod =>
      mod.nome.toLowerCase().includes(termo) ||
      mod.descricao.toLowerCase().includes(termo)
    );
  };

  const modulosAcessiveis = useMemo(
    () => filtrarPorBusca(modulosDisponiveis.filter(m => m.disponivel)),
    [modulosDisponiveis, busca]
  );

  const modulosBloqueados = useMemo(
    () => filtrarPorBusca(modulosDisponiveis.filter(m => !m.disponivel)),
    [modulosDisponiveis, busca]
  );

  const modulosRecentes = useMemo(() => {
    if (!busca.trim()) {
      return recentesIds
        .map(id => modulosDisponiveis.find(m => m.id === id && m.disponivel))
        .filter(Boolean);
    }
    return [];
  }, [recentesIds, modulosDisponiveis, busca]);

  const renderModuloCard = (modulo, compact = false) => {
    const Icon = modulo.icon;
    const isDisponivel = modulo.disponivel;

    return (
      <button
        key={modulo.id}
        type="button"
        className={`modulo-card ${isDisponivel ? 'modulo-card--ativo' : 'modulo-card--bloqueado'} ${compact ? 'modulo-card--compact' : ''}`}
        style={{ '--modulo-gradient': modulo.gradient }}
        onClick={() => handleModuloClick(modulo)}
        disabled={!isDisponivel}
        aria-label={`${modulo.nome}${isDisponivel ? '' : ' — sem acesso'}`}
      >
        <div className="modulo-card__bg" aria-hidden="true" />
        <div className="modulo-card__icon-wrap" aria-hidden="true">
          <Icon className="modulo-card__icon" />
        </div>
        {!isDisponivel && (
          <span className="modulo-card__lock" aria-hidden="true">
            <FiLock />
          </span>
        )}
        {isDisponivel && (
          <span className="modulo-card__play" aria-hidden="true">
            <FiPlay />
          </span>
        )}
        <div className="modulo-card__info">
          <h3 className="modulo-card__nome">{modulo.nome}</h3>
          {!compact && <p className="modulo-card__desc">{modulo.descricao}</p>}
        </div>
      </button>
    );
  };

  if (showSplash && splashModule) {
    return (
      <SplashScreen
        onComplete={handleSplashComplete}
        module={splashModule}
      />
    );
  }

  if (!user) {
    return (
      <div className="tipo-selecao">
        <div className="tipo-selecao-loading">
          <div className="tipo-selecao-spinner" />
          <p>Carregando...</p>
        </div>
      </div>
    );
  }

  const primeiroNome = getPrimeiroNome(user.nome);
  const isAdmin = String(user.role || '').toLowerCase() === 'admin';

  return (
    <div className="tipo-selecao">
      <div className="tipo-selecao__inner">
        <header className="tipo-selecao__header">
          <div className="tipo-selecao__brand">
            <span className="tipo-selecao__logo">GMP</span>
            {isAdmin && (
              <span className="tipo-selecao__admin-badge">Administrador</span>
            )}
          </div>

          <div className="tipo-selecao__greeting">
            <h1>
              {getSaudacao()}
              {primeiroNome ? `, ${primeiroNome}` : ''}
            </h1>
            <p>Escolha o módulo que deseja acessar</p>
          </div>

          <div className="tipo-selecao__search-wrap">
            <FiSearch className="tipo-selecao__search-icon" aria-hidden="true" />
            <input
              type="search"
              className="tipo-selecao__search"
              placeholder="Buscar módulos..."
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              aria-label="Buscar módulos"
            />
            {busca && (
              <button
                type="button"
                className="tipo-selecao__search-clear"
                onClick={() => setBusca('')}
                aria-label="Limpar busca"
              >
                <FiX />
              </button>
            )}
          </div>
        </header>

        {loading ? (
          <div className="tipo-selecao-loading">
            <div className="tipo-selecao-spinner" />
            <p>Carregando módulos...</p>
          </div>
        ) : (
          <div className="tipo-selecao__sections">
            {modulosRecentes.length > 0 && (
              <section className="tipo-selecao__section">
                <h2 className="tipo-selecao__section-title">Acessados recentemente</h2>
                <div className="modulo-grid modulo-grid--recent">
                  {modulosRecentes.map(mod => renderModuloCard(mod, true))}
                </div>
              </section>
            )}

            <section className="tipo-selecao__section">
              <h2 className="tipo-selecao__section-title">
                {busca.trim() ? 'Resultados' : 'Seus módulos'}
              </h2>
              {modulosAcessiveis.length > 0 ? (
                <div className="modulo-grid">
                  {modulosAcessiveis.map(mod => renderModuloCard(mod))}
                </div>
              ) : (
                <p className="tipo-selecao__empty">
                  {busca.trim()
                    ? 'Nenhum módulo encontrado para esta busca.'
                    : 'Nenhum módulo disponível para o seu perfil.'}
                </p>
              )}
            </section>

            {modulosBloqueados.length > 0 && (
              <section className="tipo-selecao__section tipo-selecao__section--bloqueados">
                <h2 className="tipo-selecao__section-title">Sem acesso</h2>
                <div className="modulo-grid">
                  {modulosBloqueados.map(mod => renderModuloCard(mod))}
                </div>
              </section>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default TipoSelecao;
