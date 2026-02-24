import React, { useState, useMemo, useRef } from 'react';
import { Link } from 'react-router-dom';
import { FiArrowLeft, FiDroplet, FiCheck } from 'react-icons/fi';
import './CalculoVolume.css';

const CalculoVolume = () => {
  const [diametro, setDiametro] = useState(1000);
  const [altura, setAltura] = useState(2000);
  const resultadoRef = useRef(null);

  const resultado = useMemo(() => {
    const D = diametro;
    const h = altura;
    const volumeMm3 = (Math.PI * D * D * h) / 4;
    const volumeLts = volumeMm3 / 1_000_000;
    const volumeM3 = volumeMm3 / 1_000_000_000;
    return {
      volumeLts: volumeLts.toFixed(2),
      volumeM3: volumeM3.toFixed(4),
    };
  }, [diametro, altura]);

  const scrollToResultado = () => {
    resultadoRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  return (
    <div className="calculo-volume">
      <div className="calculo-volume-header">
        <Link to="/engenharia" className="calculo-volume-back">
          <FiArrowLeft /> Voltar
        </Link>
        <h1>Cálculo de Volume</h1>
        <p>Volume do tanque cilíndrico a partir do diâmetro e da altura</p>
      </div>

      <div className="calculo-volume-layout">
        <section className="calculo-volume-section entradas">
          <h2>Dados do tanque</h2>
          <p className="calculo-volume-desc">Fórmula: V = π × (D/2)² × h — cilindro</p>
          <div className="calculo-volume-campos">
            <div className="calculo-volume-campo">
              <label>Diâmetro (D)</label>
              <input
                type="number"
                value={diametro}
                onChange={(ev) => setDiametro(Number(ev.target.value) || 0)}
                min={1}
                step={1}
              />
              <span className="unidade">mm</span>
            </div>
            <div className="calculo-volume-campo">
              <label>Altura do tanque (h)</label>
              <input
                type="number"
                value={altura}
                onChange={(ev) => setAltura(Number(ev.target.value) || 0)}
                min={1}
                step={1}
              />
              <span className="unidade">mm</span>
            </div>
          </div>
          <button type="button" className="calculo-volume-btn-calcular" onClick={scrollToResultado}>
            <FiCheck /> Calcular
          </button>
        </section>

        <section ref={resultadoRef} className="calculo-volume-section resultado-box">
          <h2>Resultado</h2>
          <div className="calculo-volume-resultado-linhas">
            <div className="calculo-volume-resultado-item">
              <span className="nome">Volume</span>
              <span className="valor">{resultado.volumeLts} L</span>
            </div>
            <div className="calculo-volume-resultado-item">
              <span className="nome">Volume</span>
              <span className="valor">{resultado.volumeM3} m³</span>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
};

export default CalculoVolume;
