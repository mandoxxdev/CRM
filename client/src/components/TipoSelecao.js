import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { toast } from 'react-toastify';
import { useModulosTipoConfig } from '../hooks/useModulosTipoConfig';
import {
  FiBriefcase, FiShoppingCart, FiDollarSign,
  FiSettings, FiPackage, FiTarget,
  FiLock, FiShield, FiTool, FiSliders, FiArchive,
  FiSearch, FiPlay, FiX
} from 'react-icons/fi';
import { prefetchModule, prefetchModuleByRoute } from '../routes/lazyModules';
import {
  fetchUserPermissions,
  getCachedUserPermissions,
} from '../services/permissionsCache';
import './TipoSelecao.css';
import FloatingBallsBackground from './FloatingBallsBackground';
import { resetModuleSplashSession } from './ProtectedModuleRoute';
import { bypassModuleRestrictions } from '../utils/systemPermissions';
import { nivelAcessoUsuario } from '../constants/modulosMeta';

const RECENT_MODULES_KEY = 'gmp_modulos_recentes';

const OrionConstellation = () => (
  <svg
    className="tipo-selecao__constellation"
    viewBox="0 0 28 28"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
    aria-hidden="true"
  >
    <circle cx="4" cy="20" r="1.5" fill="#5eb8ff" opacity="0.9" />
    <circle cx="10" cy="14" r="1.5" fill="#ffffff" opacity="0.85" />
    <circle cx="16" cy="10" r="2" fill="#d4a853" />
    <circle cx="22" cy="6" r="1.5" fill="#5eb8ff" opacity="0.8" />
    <circle cx="20" cy="16" r="1.2" fill="#ffffff" opacity="0.6" />
    <circle cx="8" cy="8" r="1" fill="#ffffff" opacity="0.5" />
    <line x1="4" y1="20" x2="10" y2="14" stroke="#5eb8ff" strokeWidth="0.6" opacity="0.4" />
    <line x1="10" y1="14" x2="16" y2="10" stroke="#ffffff" strokeWidth="0.6" opacity="0.35" />
    <line x1="16" y1="10" x2="22" y2="6" stroke="#d4a853" strokeWidth="0.6" opacity="0.4" />
    <line x1="16" y1="10" x2="20" y2="16" stroke="#ffffff" strokeWidth="0.5" opacity="0.25" />
  </svg>
);

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
  const [busca, setBusca] = useState('');
  const [recentesIds, setRecentesIds] = useState([]);
  const [tipoModalModulo, setTipoModalModulo] = useState(null);
  const [tipoModalValor, setTipoModalValor] = useState('administrativo');
  const [salvandoTipo, setSalvandoTipo] = useState(false);
  const navigate = useNavigate();
  const { user } = useAuth();
  const { tipoOverrides, updateModuloTipo } = useModulosTipoConfig();

  const todosModulos = [
    {
      id: 'comercial',
      nome: 'Comercial',
      descricao: 'Vendas, propostas e oportunidades',
      icon: FiTarget,
      modulo: 'comercial',
      rota: '/comercial',
      gradient: 'linear-gradient(135deg, #6d28d9 0%, #be185d 100%)'
    },
    {
      id: 'frota',
      nome: 'Frota',
      descricao: 'Gestão completa de veículos, manutenções e custos',
      icon: FiTool,
      modulo: 'frota',
      rota: '/frota',
      gradient: 'linear-gradient(135deg, #ea580c 0%, #b91c1c 100%)'
    },
    {
      id: 'compras',
      nome: 'Compras',
      descricao: 'Fornecedores, pedidos e cotações',
      icon: FiShoppingCart,
      modulo: 'compras',
      rota: '/compras',
      gradient: 'linear-gradient(135deg, #0f766e 0%, #0891b2 100%)'
    },
    {
      id: 'financeiro',
      nome: 'Financeiro',
      descricao: 'Contas, fluxo de caixa e bancos',
      icon: FiDollarSign,
      modulo: 'financeiro',
      rota: '/financeiro',
      gradient: 'linear-gradient(135deg, #047857 0%, #10b981 100%)'
    },
    {
      id: 'operacional',
      nome: 'Operacional',
      descricao: 'Fábrica, OS e produção',
      icon: FiPackage,
      modulo: 'operacional',
      rota: '/fabrica',
      gradient: 'linear-gradient(135deg, #1e40af 0%, #4338ca 100%)'
    },
    {
      id: 'administrativo',
      nome: 'Administrativo',
      descricao: 'Configurações do sistema',
      icon: FiSettings,
      modulo: 'administrativo',
      rota: '/configuracoes',
      gradient: 'linear-gradient(135deg, #334155 0%, #6d28d9 100%)'
    },
    {
      id: 'engenharia',
      nome: 'Cálculos de Engenharia',
      descricao: 'Tampo, pressão e dimensionamento',
      icon: FiSliders,
      modulo: 'engenharia',
      rota: '/engenharia',
      gradient: 'linear-gradient(135deg, #b45309 0%, #ea580c 100%)'
    },
    {
      id: 'engenharia_projetos',
      nome: 'Engenharia / Projetos',
      descricao: 'Solicitações e cadastros',
      icon: FiBriefcase,
      modulo: 'engenharia_projetos',
      rota: '/engenharia-projetos',
      gradient: 'linear-gradient(135deg, #3730a3 0%, #6366f1 100%)'
    },
    {
      id: 'almoxarifado',
      nome: 'Almoxarifado',
      descricao: 'Materiais, estoque, requisições e conferências',
      icon: FiArchive,
      modulo: 'almoxarifado',
      rota: '/almoxarifado',
      gradient: 'linear-gradient(135deg, #78350f 0%, #a16207 100%)'
    },
    {
      id: 'admin',
      nome: 'Admin',
      descricao: 'Usuários e permissões',
      icon: FiShield,
      modulo: 'admin',
      rota: '/admin',
      gradient: 'linear-gradient(135deg, #450a0a 0%, #991b1b 100%)'
    }
  ];

  useEffect(() => {
    resetModuleSplashSession();
    try {
      sessionStorage.removeItem('orion_skip_module_splash');
    } catch {
      /* ignore */
    }
  }, []);

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
    if (user?.id) {
      fetchUserPermissions(user.id).catch(() => {});
    }
  }, [user?.id]);

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
      if (rotaPendente) {
        sessionStorage.removeItem('rotaDestinoModulo');
        sessionStorage.removeItem('moduloDestino');
        navigate(rotaPendente, { replace: true });
      }
    };
    verificarRotaPendente();
  }, [forceShow, navigate]);

  useEffect(() => {
    const carregarModulosPermitidos = async () => {
      if (!user?.id) {
        setLoading(false);
        const modulosComStatus = todosModulos.map(mod => ({
          ...mod,
          disponivel: mod.sempreDisponivel || mod.modulo === 'comercial'
        }));
        setModulosDisponiveis(modulosComStatus);
        return;
      }

      const hasFullAccess = bypassModuleRestrictions(user);

      try {
        setLoading(true);

        if (hasFullAccess) {
          const modulosComStatus = todosModulos.map(mod => ({
            ...mod,
            disponivel: true
          }));
          setModulosDisponiveis(modulosComStatus);
          setLoading(false);
          return;
        }

        const cached = getCachedUserPermissions(user.id);
        const permissoes = cached
          ? cached.permissoes
          : (await fetchUserPermissions(user.id)).permissoes;

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
          disponivel: mod.sempreDisponivel || modulosPermitidos.has(mod.modulo)
        }));

        setModulosDisponiveis(modulosComStatus);
      } catch (error) {
        console.error('Erro ao carregar módulos:', error);
        const hasFullAccessError = bypassModuleRestrictions(user);
        if (hasFullAccessError) {
          const modulosComStatus = todosModulos.map(mod => ({
            ...mod,
            disponivel: true
          }));
          setModulosDisponiveis(modulosComStatus);
        } else {
          const modulosComStatus = todosModulos.map(mod => ({
            ...mod,
            disponivel: mod.sempreDisponivel || mod.modulo === 'comercial'
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

  const handleModuloHover = (modulo) => {
    if (!modulo?.disponivel) return;
    prefetchModule(modulo.modulo);
    prefetchModuleByRoute(modulo.rota);
  };

  const handleModuloClick = (modulo) => {
    if (modulo.disponivel && modulo.rota) {
      if (!forceShow) {
        sessionStorage.setItem('modulosVisualizados', 'true');
      }

      salvarModuloRecente(modulo.id);
      prefetchModule(modulo.modulo);
      prefetchModuleByRoute(modulo.rota);

      if (onClose) {
        onClose();
      }

      navigate(modulo.rota, { replace: true });
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

  const isAdmin = String(user?.role || '').toLowerCase() === 'admin';

  const handleGearClick = (e, modulo) => {
    e.stopPropagation();
    e.preventDefault();
    const current = tipoOverrides[modulo.id] || 'administrativo';
    setTipoModalValor(current);
    setTipoModalModulo(modulo);
  };

  const handleSalvarTipoModulo = async () => {
    if (!tipoModalModulo) return;
    setSalvandoTipo(true);
    try {
      await updateModuloTipo(tipoModalModulo.id, tipoModalValor);
      toast.success(`Tipo do módulo "${tipoModalModulo.nome}" atualizado`);
      setTipoModalModulo(null);
    } catch (err) {
      toast.error(err.response?.data?.error || 'Erro ao salvar tipo do módulo');
    } finally {
      setSalvandoTipo(false);
    }
  };

  const getTipoBadge = (moduloId) => {
    const tipo = tipoOverrides[moduloId];
    if (!tipo) return null;
    return tipo === 'industrial' ? 'FAB' : 'ADM';
  };

  const renderModuloCard = (modulo, compact = false) => {
    const Icon = modulo.icon;
    const isDisponivel = modulo.disponivel;
    const badge = getTipoBadge(modulo.id);

    return (
      <button
        key={modulo.id}
        type="button"
        className={`orion-tile ${isDisponivel ? 'orion-tile--ativo' : 'orion-tile--bloqueado'} ${compact ? 'orion-tile--compact' : ''}`}
        style={{ '--tile-gradient': modulo.gradient }}
        onClick={() => handleModuloClick(modulo)}
        onMouseEnter={() => handleModuloHover(modulo)}
        onFocus={() => handleModuloHover(modulo)}
        disabled={!isDisponivel}
        aria-label={`${modulo.nome}${isDisponivel ? '' : ' — sem acesso'}`}
      >
        <div className="orion-tile__shade" aria-hidden="true" />
        {isAdmin && (
          <span
            role="button"
            tabIndex={0}
            className="orion-tile__gear"
            onClick={(e) => handleGearClick(e, modulo)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                handleGearClick(e, modulo);
              }
            }}
            aria-label={`Configurar tipo do módulo ${modulo.nome}`}
            title="Tipo do módulo"
          >
            <FiSettings />
          </span>
        )}
        <div className="orion-tile__icon-wrap" aria-hidden="true">
          <Icon className="orion-tile__icon" />
        </div>
        {!isDisponivel && (
          <span className="orion-tile__lock" aria-hidden="true">
            <FiLock />
          </span>
        )}
        {isDisponivel && (
          <span className="orion-tile__play" aria-hidden="true">
            <FiPlay />
          </span>
        )}
        <div className="orion-tile__info">
          <h3 className="orion-tile__title orion-tile__nome">
            {modulo.nome}
            {badge && (
              <span className={`orion-tile__tipo-pill orion-tile__tipo-pill--${badge.toLowerCase()}`}>
                {badge}
              </span>
            )}
          </h3>
        </div>
      </button>
    );
  };

  if (!user) {
    return (
      <div className="tipo-selecao">
        <FloatingBallsBackground />
        <div className="tipo-selecao-loading">
          <div className="tipo-selecao-spinner" />
          <p>Carregando...</p>
        </div>
      </div>
    );
  }

  const primeiroNome = getPrimeiroNome(user.nome);

  return (
    <div className="tipo-selecao">
      <FloatingBallsBackground />
      <div className="tipo-selecao__inner">
        <header className="tipo-selecao__header">
          <div className="tipo-selecao__header-top">
            <div className="tipo-selecao__brand">
              <img
                src="/logo.png"
                alt="GMP INDUSTRIAIS"
                className="tipo-selecao__gmp-logo"
              />
              <span className="tipo-selecao__brand-divider" aria-hidden="true" />
              <div className="tipo-selecao__orion-mark">
                <OrionConstellation />
                <span className="tipo-selecao__wordmark">ORION</span>
              </div>
              {isAdmin && (
                <span className="tipo-selecao__admin-badge">Administrador</span>
              )}
            </div>
            <img
              src="/orion-bird-logo.png"
              alt=""
              className="tipo-selecao__bird-logo"
              aria-hidden="true"
            />
          </div>

          <div className="tipo-selecao__greeting">
            <h1>
              {getSaudacao()}
              {primeiroNome ? `, ${primeiroNome}` : ''}
            </h1>
            <p>O que vamos fazer hoje?</p>
            {(() => {
              const nivel = nivelAcessoUsuario(user);
              return (
                <span className={`tipo-selecao__access-tier tier-${nivel.tier}`}>
                  {nivel.label}
                </span>
              );
            })()}
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
                <div className="orion-scroll">
                  {modulosRecentes.map(mod => renderModuloCard(mod, true))}
                </div>
              </section>
            )}

            <section className="tipo-selecao__section">
              <h2 className="tipo-selecao__section-title">
                {busca.trim() ? 'Resultados' : 'Seus módulos'}
              </h2>
              {modulosAcessiveis.length > 0 ? (
                <div className="orion-grid">
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
                <div className="orion-grid">
                  {modulosBloqueados.map(mod => renderModuloCard(mod))}
                </div>
              </section>
            )}
          </div>
        )}
      </div>

      {tipoModalModulo && (
        <div
          className="tipo-modulo-modal-overlay"
          onClick={() => !salvandoTipo && setTipoModalModulo(null)}
          role="presentation"
        >
          <div
            className="tipo-modulo-modal"
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-labelledby="tipo-modulo-modal-title"
          >
            <div className="tipo-modulo-modal__header">
              <h2 id="tipo-modulo-modal-title">Tipo do módulo</h2>
              <button
                type="button"
                className="tipo-modulo-modal__close"
                onClick={() => setTipoModalModulo(null)}
                aria-label="Fechar"
                disabled={salvandoTipo}
              >
                <FiX />
              </button>
            </div>
            <p className="tipo-modulo-modal__modulo">{tipoModalModulo.nome}</p>
            <fieldset className="tipo-modulo-modal__options">
              <legend className="sr-only">Selecione o tipo</legend>
              <label className="tipo-modulo-modal__option">
                <input
                  type="radio"
                  name="tipo_setor"
                  value="administrativo"
                  checked={tipoModalValor === 'administrativo'}
                  onChange={() => setTipoModalValor('administrativo')}
                  disabled={salvandoTipo}
                />
                <span>Administrativo</span>
              </label>
              <label className="tipo-modulo-modal__option">
                <input
                  type="radio"
                  name="tipo_setor"
                  value="industrial"
                  checked={tipoModalValor === 'industrial'}
                  onChange={() => setTipoModalValor('industrial')}
                  disabled={salvandoTipo}
                />
                <span>Fábrica (Produção)</span>
              </label>
            </fieldset>
            <div className="tipo-modulo-modal__actions">
              <button
                type="button"
                className="tipo-modulo-modal__btn tipo-modulo-modal__btn--cancel"
                onClick={() => setTipoModalModulo(null)}
                disabled={salvandoTipo}
              >
                Cancelar
              </button>
              <button
                type="button"
                className="tipo-modulo-modal__btn tipo-modulo-modal__btn--save"
                onClick={handleSalvarTipoModulo}
                disabled={salvandoTipo}
              >
                {salvandoTipo ? 'Salvando...' : 'Salvar'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default TipoSelecao;
