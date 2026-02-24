import React, { useState, useMemo, useRef } from 'react';
import { Link } from 'react-router-dom';
import { FiArrowLeft, FiCheck } from 'react-icons/fi';
import './CalculoTampo.css';

const CalculoTampo = () => {
  const [D, setD] = useState(1600);
  const [e, setE] = useState(4.75);
  const [h1, setH1] = useState(20);
  const resultadoRef = useRef(null);

  const resultado = useMemo(() => {
    const volumeLts = Math.floor((0.08 * Math.pow(D, 3)) / 1_000_000);
    const Ds = Math.floor(1.08 * D + 2 * h1 + 1.54 * e);
    const H2 = Math.floor(0.169 * D);
    return { volumeLts, Ds, H2 };
  }, [D, e, h1]);

  const scrollToResultado = () => {
    resultadoRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  return (
    <div className="calculo-tampo">
      <div className="calculo-tampo-header">
        <Link to="/engenharia" className="calculo-tampo-back">
          <FiArrowLeft /> Voltar
        </Link>
        <h1>EURO-06</h1>
        <p>Cálculo de tampo (tampa abobadada) — GMP Industriais</p>
      </div>

      <div className="calculo-tampo-layout">
        {/* Referência: diagrama e parâmetros */}
        <section className="calculo-tampo-section referencia">
          <h2>Como é calculado</h2>
          <div className="calculo-tampo-ref-grid">
            <div className="calculo-tampo-diagrama-ref">
              <p className="diagrama-label">D = diâmetro do tampo · R = raio da parte esférica · r = raio da curva · H = altura total · h1 = altura da abra · h2 = altura da curva · e = espessura da chapa</p>
            </div>
            <ul className="calculo-tampo-regras">
              <li><strong>R = D</strong></li>
              <li><strong>r = 0,06 × D</strong></li>
              <li>D = até 3000 mm</li>
              <li>e = 3 a 25,4 mm (acima sob consulta)</li>
              <li>h1 = 15 a 50 mm</li>
              <li><strong>h2 = 0,169 × D</strong></li>
              <li><strong>Ds (ø Disco) = 1,08 × D + 2 × h1 + 1,54 × e</strong></li>
              <li><strong>volume = 0,08 × D³</strong> (resultado em L)</li>
            </ul>
          </div>
        </section>

        {/* Faça o cálculo dimensional */}
        <section className="calculo-tampo-section entradas">
          <h2>Informe os dados (tudo em milímetros)</h2>
          <div className="calculo-tampo-campos-simples">
            <div className="calculo-tampo-campo">
              <label>Diâmetro do tampo</label>
              <input
                type="number"
                value={D}
                onChange={(ev) => setD(Number(ev.target.value) || 0)}
                min={1}
                max={3000}
                step={1}
              />
              <span className="unidade">*Em milímetros</span>
            </div>
            <div className="calculo-tampo-campo">
              <label>Espessura da chapa</label>
              <input
                type="number"
                value={e}
                onChange={(ev) => setE(Number(ev.target.value) || 0)}
                min={3}
                step={0.01}
              />
              <span className="unidade">*Em milímetros</span>
            </div>
            <div className="calculo-tampo-campo">
              <label>Altura da abra (h1)</label>
              <input
                type="number"
                value={h1}
                onChange={(ev) => setH1(Number(ev.target.value) || 0)}
                min={15}
                max={50}
                step={1}
              />
              <span className="unidade">*Em milímetros</span>
            </div>
          </div>
          <button type="button" className="calculo-tampo-btn-calcular" onClick={scrollToResultado}>
            <FiCheck /> Calcular
          </button>
        </section>

        {/* Resultado */}
        <section ref={resultadoRef} className="calculo-tampo-section resultado-box">
          <h2>Resultado</h2>
          <div className="calculo-tampo-resultado-linhas">
            <div className="calculo-tampo-resultado-item">
              <span className="nome">Volume</span>
              <span className="valor">{resultado.volumeLts} Lts.</span>
            </div>
            <div className="calculo-tampo-resultado-item">
              <span className="nome">Diâmetro do disco (chapa antes de conformar)</span>
              <span className="valor">{resultado.Ds} mm</span>
            </div>
            <div className="calculo-tampo-resultado-item">
              <span className="nome">Altura da parte curva (h2)</span>
              <span className="valor">{resultado.H2} mm</span>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
};

export default CalculoTampo;
