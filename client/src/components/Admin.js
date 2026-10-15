import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { isSystemAdmin } from '../utils/systemPermissions';
import Usuarios from './Usuarios';
import Permissoes from './Permissoes';
import Logs from './Logs';
import Tabs from './ui/Tabs';
import { FiUsers, FiShield, FiFileText } from 'react-icons/fi';
import './Admin.css';

const PAINEL_ID = 'ui-tabpanel-admin';

const Admin = () => {
  const [activeTab, setActiveTab] = useState('usuarios');
  const [contentReady, setContentReady] = useState(false);
  const navigate = useNavigate();
  const { user } = useAuth();

  useEffect(() => {
    if (user && !isSystemAdmin(user)) {
      navigate('/');
    }
  }, [user, navigate]);

  useEffect(() => {
    let cancelled = false;
    const raf = requestAnimationFrame(() => {
      setTimeout(() => {
        if (!cancelled) setContentReady(true);
      }, 150);
    });
    return () => {
      cancelled = true;
      cancelAnimationFrame(raf);
    };
  }, []);

  const tabs = [
    { id: 'usuarios', label: 'Usuários', icon: FiUsers },
    { id: 'permissoes', label: 'Permissões', icon: FiShield },
    { id: 'logs', label: 'Logs', icon: FiFileText },
  ];

  const renderActiveTab = () => {
    if (!contentReady) {
      return <p className="admin-loading-hint">Preparando painel…</p>;
    }
    if (activeTab === 'usuarios') return <Usuarios />;
    if (activeTab === 'permissoes') return <Permissoes />;
    if (activeTab === 'logs') return <Logs />;
    return null;
  };

  return (
    <div className="admin-container">
      <div className="admin-header">
        <h1>Administração</h1>
        <p>Gerencie usuários e permissões do sistema</p>
      </div>

      {/* Etapa 107 (G8, RN-107.11): a barra e o `ui/Tabs` (antes `.admin-tabs` com CSS proprio). Mesmo
          array, mesmo estado local, sem URL — como antes. */}
      <Tabs
        abas={tabs}
        ativa={activeTab}
        onChange={setActiveTab}
        ariaLabel="Administração"
        painelId={PAINEL_ID}
      />

      <div className="admin-content" role="tabpanel" id={PAINEL_ID} aria-labelledby={`ui-tab-${activeTab}`}>
        {renderActiveTab()}
      </div>
    </div>
  );
};

export default Admin;
