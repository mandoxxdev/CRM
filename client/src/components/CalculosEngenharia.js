import React from 'react';
import { useNavigate } from 'react-router-dom';
import { FiSliders, FiCircle, FiDroplet, FiZap, FiLayers } from 'react-icons/fi';
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
        <button
          type="button"
          className="calculos-engenharia-card"
          onClick={() => navigate('/engenharia/calculo-volume')}
        >
          <div className="calculos-engenharia-card-icon calculos-engenharia-card-icon-volume">
            <FiDroplet />
          </div>
          <h3>Cálculo de Volume</h3>
          <p>Volume do tanque a partir do diâmetro e da altura</p>
        </button>
        <button
          type="button"
          className="calculos-engenharia-card"
          onClick={() => navigate('/engenharia/calculo-motor-impelidor')}
        >
          <div className="calculos-engenharia-card-icon calculos-engenharia-card-icon-motor">
            <FiZap />
          </div>
          <h3>Motor + Impelidor</h3>
          <p>Disco dispersor (Cowles): diâmetro, rotação, potência e torque</p>
        </button>
        <button
          type="button"
          className="calculos-engenharia-card"
          onClick={() => navigate('/engenharia/selecao-agitadores')}
        >
          <div className="calculos-engenharia-card-icon calculos-engenharia-card-icon-selecao">
            <FiLayers />
          </div>
          <h3>Seleção de Agitadores</h3>
          <p>Escolha e dimensione Cowles, hélice, turbina, âncora ou helicoidal conforme o processo</p>
        </button>
      </div>
    </div>
  );
};

export default CalculosEngenharia;
