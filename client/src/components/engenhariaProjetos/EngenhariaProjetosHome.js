import React from 'react';
import { useNavigate } from 'react-router-dom';
import { FiClipboard, FiPackage } from 'react-icons/fi';
import './EngenhariaProjetosHome.css';

export default function EngenhariaProjetosHome() {
  const navigate = useNavigate();

  return (
    <div className="engp">
      <header className="engp-header">
        <h1>Engenharia / Projetos</h1>
        <p>Solicitações, cadastros e rotinas do time de engenharia.</p>
      </header>

      <div className="engp-grid">
        <button type="button" className="engp-card" onClick={() => navigate('/engenharia-projetos/solicitacao-material-escritorio')}>
          <div className="engp-card-icon"><FiClipboard /></div>
          <h3>Solicitação (cesta)</h3>
          <p>Selecione itens como carrinho de compras e envie para aprovação/Compras.</p>
        </button>

        <button type="button" className="engp-card" onClick={() => navigate('/engenharia-projetos/cadastro-materiais-escritorio')}>
          <div className="engp-card-icon engp-card-icon--alt"><FiPackage /></div>
          <h3>Cadastro de materiais</h3>
          <p>Gerencie materiais de escritório (nome, unidade, ativo).</p>
        </button>
      </div>
    </div>
  );
}

