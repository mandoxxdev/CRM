import React, { useState, Suspense } from 'react';
import { useLocation, useNavigate, Outlet } from 'react-router-dom';
import ErrorBoundary from '../ErrorBoundary';
import { RouteLoading } from '../LazyPage';
import { useAuth } from '../../context/AuthContext';
import { getEffectiveUser } from '../../services/permissionsCache';
import { canConfigureModule } from '../../utils/systemPermissions';
import {
  FiBarChart2, FiClipboard, FiUsers, FiActivity, FiClock,
  FiTrendingUp, FiTool, FiSettings, FiGrid, FiList,
  FiLayers, FiTarget, FiAlertTriangle, FiZap, FiMenu, FiX,
} from 'react-icons/fi';
import './MESLayout.css';

const MESLayout = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const { user } = useAuth();
  const canConfigureMes = canConfigureModule(getEffectiveUser(user), 'operacional');

  const menuItems = [
    { id: 'dashboard', label: 'Dashboard', icon: FiBarChart2, path: '/fabrica/dashboard' },
    { id: 'ordens-producao', label: 'Ordens de Produção', icon: FiLayers, path: '/fabrica/ordens-producao' },
    { id: 'apontamentos', label: 'Apontamentos', icon: FiActivity, path: '/fabrica/apontamentos' },
    { id: 'maquinas', label: 'Máquinas', icon: FiTool, path: '/fabrica/maquinas' },
    { id: 'paradas', label: 'Paradas / OEE', icon: FiAlertTriangle, path: '/fabrica/paradas' },
    { id: 'roteiros', label: 'Roteiros', icon: FiTarget, path: '/fabrica/roteiros' },
    { id: 'producao-kanban', label: 'Kanban OS (legado)', icon: FiClipboard, path: '/fabrica/producao-kanban' },
    { id: 'relatorios', label: 'Relatórios', icon: FiBarChart2, path: '/fabrica/relatorios' },
    { type: 'divider', id: 'div-operacional' },
    { id: 'ordens-servico', label: 'Ordens de Serviço', icon: FiClipboard, path: '/fabrica/ordens-servico' },
    { id: 'colaboradores', label: 'Colaboradores', icon: FiUsers, path: '/fabrica/colaboradores' },
    { id: 'atividades', label: 'Atividades', icon: FiActivity, path: '/fabrica/atividades' },
    { id: 'presenca', label: 'Presença', icon: FiClock, path: '/fabrica/presenca' },
    { id: 'horas-extras', label: 'Horas Extras', icon: FiTrendingUp, path: '/fabrica/horas-extras' },
    { id: 'equipamentos', label: 'Equipamentos', icon: FiTool, path: '/fabrica/equipamentos' },
    { type: 'divider', id: 'div-materiais' },
    { id: 'requisicoes-nova', label: 'Solicitar Material', icon: FiClipboard, path: '/fabrica/requisicoes-material/nova' },
    { id: 'requisicoes-lista', label: 'Minhas Requisições', icon: FiList, path: '/fabrica/requisicoes-material' },
    { id: 'configuracoes', label: 'Configurações', icon: FiSettings, path: '/fabrica/configuracoes', adminOnly: true },
  ];

  const isActive = (path) => location.pathname === path || location.pathname.startsWith(path + '/');

  return (
    <div className="mes-layout">
      <aside className={`mes-sidebar ${sidebarOpen ? 'open' : 'closed'}`}>
        <div className="mes-sidebar-header">
          <div className="mes-logo">
            <FiZap />
            <span>Produção GMP</span>
          </div>
          <button
            className="mes-sidebar-toggle"
            onClick={() => setSidebarOpen(!sidebarOpen)}
            type="button"
          >
            {sidebarOpen ? <FiX /> : <FiMenu />}
          </button>
        </div>

        <nav className="mes-nav">
          <div
            className="mes-nav-link mes-nav-module-selector"
            onClick={() => { window.location.href = '/'; }}
            role="button"
            tabIndex={0}
            onKeyDown={(e) => e.key === 'Enter' && (window.location.href = '/')}
          >
            <FiGrid />
            {sidebarOpen && <span>Selecionar Módulo</span>}
          </div>
          {menuItems.map((item) => {
            if (item.type === 'divider') {
              return sidebarOpen ? <div key={item.id} className="mes-nav-divider" /> : null;
            }
            if (item.adminOnly && !canConfigureMes) return null;
            return (
              <div key={item.id} className="mes-nav-item">
                <div
                  className={`mes-nav-link ${isActive(item.path) ? 'active' : ''}`}
                  onClick={() => navigate(item.path)}
                  role="button"
                  tabIndex={0}
                  onKeyDown={(e) => e.key === 'Enter' && navigate(item.path)}
                >
                  <item.icon />
                  {sidebarOpen && <span>{item.label}</span>}
                </div>
              </div>
            );
          })}
        </nav>
      </aside>

      <main className="mes-main">
        <ErrorBoundary>
          <Suspense fallback={<RouteLoading module="operacional" />}>
            <Outlet />
          </Suspense>
        </ErrorBoundary>
      </main>
    </div>
  );
};

export default MESLayout;
