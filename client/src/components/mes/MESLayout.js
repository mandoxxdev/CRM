import React, { useState } from 'react';
import { useLocation, useNavigate, Outlet } from 'react-router-dom';
import { 
  FiBarChart2, FiClipboard, FiUsers, FiActivity, FiClock, 
  FiTrendingUp, FiTool, FiSettings, FiShield, FiFileText,
  FiLayers, FiTarget, FiAlertTriangle, FiDatabase, FiGrid,
  FiCheckCircle, FiPackage, FiZap, FiMonitor, FiMenu, FiX
} from 'react-icons/fi';
import './MESLayout.css';

const MESLayout = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const [sidebarOpen, setSidebarOpen] = useState(true);

  const menuItems = [
    { id: 'dashboard', label: 'Dashboard', icon: FiBarChart2, path: '/fabrica/dashboard' },
    { 
      id: 'producao', 
      label: 'Produção (MES)', 
      icon: FiLayers, 
      path: '/fabrica/producao',
      submenu: [
        { id: 'monitoramento', label: 'Monitoramento em Tempo Real', path: '/fabrica/producao/monitoramento' },
        { id: 'eventos', label: 'Eventos de Processo', path: '/fabrica/producao/eventos' },
        { id: 'status-ordens', label: 'Status das Ordens', path: '/fabrica/producao/status-ordens' },
        { id: 'parametros', label: 'Parâmetros Críticos', path: '/fabrica/producao/parametros' },
        { id: 'lotes', label: 'Gestão de Lotes', path: '/fabrica/producao/lotes' }
      ]
    },
    { 
      id: 'planejamento', 
      label: 'Planejamento (APS/MRP)', 
      icon: FiTarget, 
      path: '/fabrica/planejamento',
      submenu: [
        { id: 'programacao', label: 'Programação de Produção', path: '/fabrica/planejamento/programacao' },
        { id: 'materiais', label: 'Controle de Materiais', path: '/fabrica/planejamento/materiais' },
        { id: 'necessidades', label: 'Necessidades de Componentes', path: '/fabrica/planejamento/necessidades' }
      ]
    },
    { 
      id: 'supervisao', 
      label: 'Supervisão (SCADA/HMI)', 
      icon: FiMonitor, 
      path: '/fabrica/supervisao',
      submenu: [
        { id: 'visualizacao', label: 'Visualização de Linhas', path: '/fabrica/supervisao/visualizacao' },
        { id: 'alarmes', label: 'Alarmes e Eventos', path: '/fabrica/supervisao/alarmes' },
        { id: 'painel', label: 'Painel Gráfico', path: '/fabrica/supervisao/painel' }
      ]
    },
    { 
      id: 'qualidade', 
      label: 'Controle de Qualidade', 
      icon: FiCheckCircle, 
      path: '/fabrica/qualidade',
      submenu: [
        { id: 'padroes', label: 'Padrões e Especificações', path: '/fabrica/qualidade/padroes' },
        { id: 'inspecao', label: 'Inspeção de Materiais', path: '/fabrica/qualidade/inspecao' },
        { id: 'resultados', label: 'Resultados e Alertas', path: '/fabrica/qualidade/resultados' },
        { id: 'lims', label: 'Integração LIMS', path: '/fabrica/qualidade/lims' }
      ]
    },
    { 
      id: 'rastreabilidade', 
      label: 'Rastreabilidade', 
      icon: FiDatabase, 
      path: '/fabrica/rastreabilidade',
      submenu: [
        { id: 'lotes', label: 'Gestão de Lotes', path: '/fabrica/rastreabilidade/lotes' },
        { id: 'cadeia', label: 'Cadeia Completa', path: '/fabrica/rastreabilidade/cadeia' },
        { id: 'relatorios', label: 'Relatórios de Auditoria', path: '/fabrica/rastreabilidade/relatorios' },
        { id: 'recalls', label: 'Recalls', path: '/fabrica/rastreabilidade/recalls' }
      ]
    },
    { 
      id: 'manutencao', 
      label: 'Manutenção (CMMS)', 
      icon: FiTool, 
      path: '/fabrica/manutencao',
      submenu: [
        { id: 'preventiva', label: 'Manutenção Preventiva', path: '/fabrica/manutencao/preventiva' },
        { id: 'ordens', label: 'Ordens de Serviço', path: '/fabrica/manutencao/ordens' },
        { id: 'indicadores', label: 'Indicadores de Falhas', path: '/fabrica/manutencao/indicadores' },
        { id: 'historico', label: 'Histórico de Revisões', path: '/fabrica/manutencao/historico' }
      ]
    },
    { 
      id: 'seguranca', 
      label: 'Segurança & Conformidade', 
      icon: FiShield, 
      path: '/fabrica/seguranca',
      submenu: [
        { id: 'acessos', label: 'Controle de Acessos', path: '/fabrica/seguranca/acessos' },
        { id: 'auditoria', label: 'Registros de Auditoria', path: '/fabrica/seguranca/auditoria' },
        { id: 'conformidade', label: 'Conformidade Regulatória', path: '/fabrica/seguranca/conformidade' },
        { id: 'nao-conformidades', label: 'Não-Conformidades', path: '/fabrica/seguranca/nao-conformidades' }
      ]
    },
    { 
      id: 'formulacoes', 
      label: 'Controle de Formulações', 
      icon: FiPackage, 
      path: '/fabrica/formulacoes',
      submenu: [
        { id: 'receitas', label: 'Gestão de Receitas', path: '/fabrica/formulacoes/receitas' },
        { id: 'tolerancias', label: 'Tolerâncias e Variações', path: '/fabrica/formulacoes/tolerancias' },
        { id: 'ingredientes', label: 'Ingredientes Críticos', path: '/fabrica/formulacoes/ingredientes' },
        { id: 'versionamento', label: 'Versionamento', path: '/fabrica/formulacoes/versionamento' }
      ]
    },
    { 
      id: 'alarmistica', 
      label: 'Alarmística', 
      icon: FiAlertTriangle, 
      path: '/fabrica/alarmistica',
      submenu: [
        { id: 'limites', label: 'Limites de Operação', path: '/fabrica/alarmistica/limites' },
        { id: 'alarmes', label: 'Configuração de Alarmes', path: '/fabrica/alarmistica/alarmes' },
        { id: 'stop', label: 'Stop Automático', path: '/fabrica/alarmistica/stop' }
      ]
    },
    { 
      id: 'logs', 
      label: 'Logs e Histórico', 
      icon: FiFileText, 
      path: '/fabrica/logs',
      submenu: [
        { id: 'operacoes', label: 'Registros de Operações', path: '/fabrica/logs/operacoes' },
        { id: 'intervencoes', label: 'Intervenções Humanas', path: '/fabrica/logs/intervencoes' },
        { id: 'eventos', label: 'Eventos e Desvios', path: '/fabrica/logs/eventos' },
        { id: 'historico', label: 'Histórico Completo', path: '/fabrica/logs/historico' }
      ]
    },
    { id: 'ordens-servico', label: 'Ordens de Serviço', icon: FiClipboard, path: '/fabrica/ordens-servico' },
    { id: 'colaboradores', label: 'Colaboradores', icon: FiUsers, path: '/fabrica/colaboradores' },
    { id: 'atividades', label: 'Atividades', icon: FiActivity, path: '/fabrica/atividades' },
    { id: 'presenca', label: 'Presença', icon: FiClock, path: '/fabrica/presenca' },
    { id: 'horas-extras', label: 'Horas Extras', icon: FiTrendingUp, path: '/fabrica/horas-extras' },
    { id: 'equipamentos', label: 'Equipamentos', icon: FiTool, path: '/fabrica/equipamentos' },
    { id: 'configuracoes', label: 'Configurações', icon: FiSettings, path: '/fabrica/configuracoes' }
  ];

  const [expandedItems, setExpandedItems] = useState([]);

  const toggleSubmenu = (itemId) => {
    setExpandedItems(prev => 
      prev.includes(itemId) 
        ? prev.filter(id => id !== itemId)
        : [...prev, itemId]
    );
  };

  const isActive = (path) => {
    return location.pathname === path || location.pathname.startsWith(path + '/');
  };

  return (
    <div className="mes-layout">
      <aside className={`mes-sidebar ${sidebarOpen ? 'open' : 'closed'}`}>
        <div className="mes-sidebar-header">
          <div className="mes-logo">
            <FiZap />
            <span>MES GMP</span>
          </div>
          <button 
            className="mes-sidebar-toggle"
            onClick={() => setSidebarOpen(!sidebarOpen)}
          >
            {sidebarOpen ? <FiX /> : <FiMenu />}
          </button>
        </div>

        <nav className="mes-nav">
          <div
            className="mes-nav-link mes-nav-module-selector"
            onClick={() => {
              window.location.href = '/';
            }}
          >
            <FiGrid />
            {sidebarOpen && <span>Selecionar Módulo</span>}
          </div>
          {menuItems.map(item => (
            <div key={item.id} className="mes-nav-item">
              <div
                className={`mes-nav-link ${isActive(item.path) ? 'active' : ''}`}
                onClick={() => {
                  if (item.submenu) {
                    toggleSubmenu(item.id);
                  } else {
                    navigate(item.path);
                  }
                }}
              >
                <item.icon />
                {sidebarOpen && <span>{item.label}</span>}
                {item.submenu && sidebarOpen && (
                  <span className="mes-nav-arrow">
                    {expandedItems.includes(item.id) ? '▼' : '▶'}
                  </span>
                )}
              </div>
              {item.submenu && expandedItems.includes(item.id) && sidebarOpen && (
                <div className="mes-submenu">
                  {item.submenu.map(subItem => (
                    <div
                      key={subItem.id}
                      className={`mes-submenu-item ${isActive(subItem.path) ? 'active' : ''}`}
                      onClick={() => navigate(subItem.path)}
                    >
                      {subItem.label}
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))}
        </nav>
      </aside>

      <main className="mes-main">
        <Outlet />
      </main>
    </div>
  );
};

export default MESLayout;
