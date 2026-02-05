import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import Usuarios from './Usuarios';
import Permissoes from './Permissoes';
import Logs from './Logs';
import { FiUsers, FiShield, FiFileText } from 'react-icons/fi';
import './Admin.css';

const Admin = () => {
  const [activeTab, setActiveTab] = useState('usuarios');
  const navigate = useNavigate();
  const { user } = useAuth();

  useEffect(() => {
    // Verificar se o usuário é admin
    if (user && user.role !== 'admin') {
      navigate('/');
    }
  }, [user, navigate]);

  const tabs = [
    { id: 'usuarios', label: 'Usuários', icon: FiUsers, component: Usuarios },
    { id: 'permissoes', label: 'Permissões', icon: FiShield, component: Permissoes },
    { id: 'logs', label: 'Logs', icon: FiFileText, component: Logs },
  ];

  const ActiveComponent = tabs.find(tab => tab.id === activeTab)?.component;

  return (
    <div className="admin-container">
      <div className="admin-header">
        <h1>Administração</h1>
        <p>Gerencie usuários e permissões do sistema</p>
      </div>

      <div className="admin-tabs">
        {tabs.map((tab) => {
          const Icon = tab.icon;
          return (
            <button
              key={tab.id}
              className={`admin-tab ${activeTab === tab.id ? 'active' : ''}`}
              onClick={() => setActiveTab(tab.id)}
            >
              <Icon />
              <span>{tab.label}</span>
            </button>
          );
        })}
      </div>

      <div className="admin-content">
        {ActiveComponent && <ActiveComponent />}
      </div>
    </div>
  );
};

export default Admin;

