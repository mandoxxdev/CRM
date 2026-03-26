import React from 'react';
import { FiTruck, FiTool, FiClipboard, FiBarChart2 } from 'react-icons/fi';

const VeiculosManutencao = () => {
  return (
    <div style={{ padding: '24px' }}>
      <h1 style={{ marginBottom: '8px' }}>Manutenção e Vistoria de Veículos</h1>
      <p style={{ color: '#6b7280', marginBottom: '20px' }}>
        Acesse aqui o módulo de frota para cadastro, vistorias, manutenção e custos.
      </p>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(230px, 1fr))', gap: '12px' }}>
        <div className="card" style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
          <FiTruck />
          <span>Cadastro de Veículos</span>
        </div>
        <div className="card" style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
          <FiClipboard />
          <span>Vistoria Antes/Depois</span>
        </div>
        <div className="card" style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
          <FiTool />
          <span>Manutenções e Itens</span>
        </div>
        <div className="card" style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
          <FiBarChart2 />
          <span>Dashboard de Custos</span>
        </div>
      </div>
    </div>
  );
};

export default VeiculosManutencao;
