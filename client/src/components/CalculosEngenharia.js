import React from 'react';
import { useNavigate } from 'react-router-dom';
import { FiSliders, FiCircle } from 'react-icons/fi';
import './CalculosEngenharia.css';

const CalculosEngenharia = () => {
  const navigate = useNavigate();

  return (
    <div className="calculos-engenharia">
      <header className="calculos-engenharia-header">
        <h1>Cálculos de Engenharia</h1>
        <p>Ferramentas de cálculo técnico para dimensionamento e verificação</p>
      </header>

      <div className="calculos-engenharia-grid">
        <button
          type="button"
          className="calculos-engenharia-card"
          onClick={() => navigate('/engenharia/calculo-tampo')}
        >
          <div className="calculos-engenharia-card-icon">
            <FiCircle />
          </div>
          <h3>Cálculo de Tampo</h3>
          <p>Dimensionamento de tampo (tampa/casco) conforme normas técnicas</p>
        </button>
      </div>
    </div>
  );
};

export default CalculosEngenharia;
