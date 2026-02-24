import React, { useState, useMemo, useRef } from 'react';
import { Link } from 'react-router-dom';
import { FiArrowLeft, FiCheck } from 'react-icons/fi';
import './CalculoMotorImpelidor.css';

const TIPOS_PROCESSO = {
  leve: { label: 'Leve', fatorDi: 0.28, velPeriferica: 18, kWporM3: 1.5 },
  padrao: { label: 'Padrão', fatorDi: 0.33, velPeriferica: 22, kWporM3: 2.5 },
  pesado: { label: 'Pesado (alto sólido)', fatorDi: 0.38, velPeriferica: 25, kWporM3: 4.0 },
};

const CalculoMotorImpelidor = () => {
  const [T, setT] = useState(1000);
  const [H, setH] = useState(1500);
  const [tipoProcesso, setTipoProcesso] = useState('padrao');
  const [viscosidade, setViscosidade] = useState('');
  const [densidade, setDensidade] = useState(1000);
  const resultadoRef = useRef(null);

  const { resultado, detalhes } = useMemo(() => {
    const tipo = TIPOS_PROCESSO[tipoProcesso] || TIPOS_PROCESSO.padrao;
    const Di = tipo.fatorDi * T;
    const Di_m = Di / 1000;
    const v = tipo.velPeriferica;
    const n = (60 * v) / (Math.PI * Di_m);
    const V_m3 = (Math.PI * (T / 1000) ** 2 / 4) * (H / 1000);
    const P_kW = tipo.kWporM3 * V_m3;
    const torque = n > 0 ? (9550 * P_kW) / n : 0;

    return {
      resultado: {
        Di: Math.round(Di * 10) / 10,
        rpm: Math.round(n),
        V_m3: V_m3.toFixed(4),
        P_kW: P_kW.toFixed(2),
        torque: torque.toFixed(2),
      },
      detalhes: {
        tipo: tipo.label,
        fatorDi: tipo.fatorDi,
        velPeriferica: v,
        kWporM3: tipo.kWporM3,
        formulaDi: `Di = ${tipo.fatorDi} × T = ${tipo.fatorDi} × ${T} = ${Math.round(Di * 10) / 10} mm`,
        formulaRpm: `n = (60 × v) / (π × Di) = (60 × ${v}) / (π × ${Di_m.toFixed(4)}) = ${Math.round(n)} rpm`,
        formulaV: `V = π × (T²/4) × H = π × (${(T / 1000).toFixed(3)}²/4) × ${(H / 1000).toFixed(3)} = ${V_m3.toFixed(4)} m³`,
        formulaP: `P = ${tipo.kWporM3} kW/m³ × ${V_m3.toFixed(4)} m³ = ${P_kW.toFixed(2)} kW`,
        formulaTq: `T = (9550 × P) / n = (9550 × ${P_kW.toFixed(2)}) / ${Math.round(n)} = ${torque.toFixed(2)} Nm`,
      },
    };
  }, [T, H, tipoProcesso]);

  const scrollToResultado = () => {
    resultadoRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  return (
    <div className="calculo-motor-impelidor">
      <div className="calculo-motor-impelidor-header">
        <Link to="/engenharia" className="calculo-motor-impelidor-back">
          <FiArrowLeft /> Voltar
        </Link>
        <h1>Motor + Impelidor — Disco dispersor (Cowles)</h1>
        <p>Dimensionamento de disco dispersor para tanque cilíndrico vertical</p>
      </div>

      <div className="calculo-motor-impelidor-layout">
        <section className="calculo-motor-impelidor-section entradas">
          <h2>Dados de entrada</h2>
          <div className="calculo-motor-impelidor-campos">
            <div className="calculo-motor-impelidor-campo">
              <label>Diâmetro interno do tanque (T)</label>
              <input
                type="number"
                value={T}
                onChange={(ev) => setT(Number(ev.target.value) || 0)}
                min={1}
                step={1}
              />
              <span className="unidade">mm</span>
            </div>
            <div className="calculo-motor-impelidor-campo">
              <label>Altura útil do líquido (H)</label>
              <input
                type="number"
                value={H}
                onChange={(ev) => setH(Number(ev.target.value) || 0)}
                min={1}
                step={1}
              />
              <span className="unidade">mm</span>
            </div>
            <div className="calculo-motor-impelidor-campo campo-full">
              <label>Tipo de processo</label>
              <select
                value={tipoProcesso}
                onChange={(ev) => setTipoProcesso(ev.target.value)}
              >
                <option value="leve">Leve</option>
                <option value="padrao">Padrão</option>
                <option value="pesado">Pesado (alto sólido)</option>
              </select>
            </div>
            <div className="calculo-motor-impelidor-campo">
              <label>Viscosidade aproximada</label>
              <input
                type="text"
                value={viscosidade}
                onChange={(ev) => setViscosidade(ev.target.value)}
                placeholder="ex.: 500 cP ou baixa"
              />
              <span className="unidade">cP ou descrição</span>
            </div>
            <div className="calculo-motor-impelidor-campo">
              <label>Densidade do produto</label>
              <input
                type="number"
                value={densidade}
                onChange={(ev) => setDensidade(Number(ev.target.value) || 0)}
                min={1}
                step={10}
              />
              <span className="unidade">kg/m³</span>
            </div>
          </div>
          <button type="button" className="calculo-motor-impelidor-btn-calcular" onClick={scrollToResultado}>
            <FiCheck /> Calcular
          </button>
        </section>

        <section className="calculo-motor-impelidor-section regras">
          <h2>Regras de dimensionamento</h2>
          <ul>
            <li><strong>Diâmetro do disco (Di):</strong> Leve = 0,28×T; Padrão = 0,33×T; Pesado = 0,38×T</li>
            <li><strong>Velocidade periférica:</strong> Leve 18 m/s; Padrão 22 m/s; Pesado 25 m/s</li>
            <li><strong>Rotação:</strong> n = (60 × v) / (π × Di), com Di em metros</li>
            <li><strong>Volume útil:</strong> V = π × (T²/4) × H (mm → m)</li>
            <li><strong>Potência específica:</strong> Leve 1,5 kW/m³; Padrão 2,5 kW/m³; Pesado 4,0 kW/m³</li>
            <li><strong>Potência:</strong> P = kW/m³ × V</li>
            <li><strong>Torque:</strong> T = (9550 × P) / n (Nm)</li>
          </ul>
        </section>

        <section ref={resultadoRef} className="calculo-motor-impelidor-section resultado-box">
          <h2>Resultados</h2>
          <div className="calculo-motor-impelidor-resultado-linhas">
            <div className="calculo-motor-impelidor-resultado-item">
              <span className="nome">Diâmetro do disco (Di)</span>
              <span className="valor">{resultado.Di} mm</span>
            </div>
            <div className="calculo-motor-impelidor-resultado-item">
              <span className="nome">Rotação</span>
              <span className="valor">{resultado.rpm} rpm</span>
            </div>
            <div className="calculo-motor-impelidor-resultado-item">
              <span className="nome">Volume útil</span>
              <span className="valor">{resultado.V_m3} m³</span>
            </div>
            <div className="calculo-motor-impelidor-resultado-item">
              <span className="nome">Potência estimada</span>
              <span className="valor">{resultado.P_kW} kW</span>
            </div>
            <div className="calculo-motor-impelidor-resultado-item">
              <span className="nome">Torque no eixo</span>
              <span className="valor">{resultado.torque} Nm</span>
            </div>
          </div>
          <div className="calculo-motor-impelidor-detalhes">
            <h3>Detalhamento dos cálculos</h3>
            <p><strong>Diâmetro do disco:</strong> {detalhes.formulaDi}</p>
            <p><strong>Rotação:</strong> {detalhes.formulaRpm}</p>
            <p><strong>Volume útil:</strong> {detalhes.formulaV}</p>
            <p><strong>Potência:</strong> {detalhes.formulaP}</p>
            <p><strong>Torque:</strong> {detalhes.formulaTq}</p>
          </div>
        </section>
      </div>
    </div>
  );
};

export default CalculoMotorImpelidor;
