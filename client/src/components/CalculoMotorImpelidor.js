import React, { useState, useMemo, useRef } from 'react';
import { Link } from 'react-router-dom';
import { FiArrowLeft, FiCheck } from 'react-icons/fi';
import './CalculoMotorImpelidor.css';

const TIPOS_PROCESSO = {
  leve: { label: 'Leve', fatorDi: 0.28, velPeriferica: 18, kWporM3: 1.5 },
  padrao: { label: 'Padrão', fatorDi: 0.33, velPeriferica: 22, kWporM3: 2.5 },
  pesado: { label: 'Pesado (alto sólido)', fatorDi: 0.38, velPeriferica: 25, kWporM3: 4.0 },
};

function fatorViscosidade(muCp) {
  const mu = Number(muCp) || 0;
  if (mu <= 500) return { Fmu: 1.0, obs: null };
  if (mu <= 2000) return { Fmu: 1.2, obs: null };
  if (mu <= 10000) return { Fmu: 1.5, obs: null };
  return { Fmu: 1.5, obs: 'Viscosidade > 10000 cP: disco dispersor sozinho pode não ser adequado. Avaliar sistema com recirculação ou outro tipo de agitador.' };
}

const CalculoMotorImpelidor = () => {
  const [T, setT] = useState(1000);
  const [H, setH] = useState(1500);
  const [tipoProcesso, setTipoProcesso] = useState('padrao');
  const [densidade, setDensidade] = useState(1000);
  const [viscosidade, setViscosidade] = useState(500);
  const resultadoRef = useRef(null);

  const { resultado, detalhes } = useMemo(() => {
    const tipo = TIPOS_PROCESSO[tipoProcesso] || TIPOS_PROCESSO.padrao;
    const rho = Number(densidade) || 1000;
    const mu = Number(viscosidade) || 0;

    // PASSO 1 – Diâmetro do disco (Di)
    const Di = tipo.fatorDi * T;
    const Di_m = Di / 1000;

    // PASSO 2 – Velocidade periférica
    const v = tipo.velPeriferica;

    // PASSO 3 – Rotação (rpm)
    const n = (60 * v) / (Math.PI * Di_m);

    // PASSO 4 – Volume útil (m³)
    const T_m = T / 1000;
    const H_m = H / 1000;
    const V_m3 = Math.PI * (T_m * T_m / 4) * H_m;

    // PASSO 5 – Potência base por volume
    const P_base = tipo.kWporM3 * V_m3;

    // PASSO 6 – Correção por densidade
    const P_dens = P_base * (rho / 1000);

    // PASSO 7 – Correção por viscosidade
    const { Fmu, obs } = fatorViscosidade(mu);
    const P_final_kW = P_dens * Fmu;

    // PASSO 8 – CV
    const CV = 1.3596 * P_final_kW;

    // PASSO 9 – Torque (Nm)
    const torque = n > 0 ? (9550 * P_final_kW) / n : 0;

    return {
      resultado: {
        Di: Math.round(Di * 10) / 10,
        velPeriferica: v,
        rpm: Math.round(n),
        V_m3: V_m3.toFixed(4),
        P_kW: P_final_kW.toFixed(2),
        CV: CV.toFixed(2),
        torque: torque.toFixed(2),
        obsViscosidade: obs,
      },
      detalhes: {
        tipo: tipo.label,
        fatorDi: tipo.fatorDi,
        velPeriferica: v,
        kWporM3: tipo.kWporM3,
        rho,
        mu,
        Fmu,
        P_base: P_base.toFixed(2),
        P_dens: P_dens.toFixed(2),
        formulaDi: `Di = ${tipo.fatorDi} × T = ${tipo.fatorDi} × ${T} = ${Math.round(Di * 10) / 10} mm`,
        formulaRpm: `n = (60 × v) / (π × Di_m) = (60 × ${v}) / (π × ${Di_m.toFixed(4)}) = ${Math.round(n)} rpm`,
        formulaV: `V = π × (T_m²/4) × H_m = π × (${T_m.toFixed(3)}²/4) × ${H_m.toFixed(3)} = ${V_m3.toFixed(4)} m³`,
        formulaPbase: `P_base = ${tipo.kWporM3} kW/m³ × ${V_m3.toFixed(4)} m³ = ${P_base.toFixed(2)} kW`,
        formulaPdens: `P_dens = P_base × (ρ/1000) = ${P_base.toFixed(2)} × (${rho}/1000) = ${P_dens.toFixed(2)} kW`,
        formulaFmu: `Fμ = ${Fmu} (viscosidade ${mu} cP) → P_final = P_dens × Fμ = ${P_dens.toFixed(2)} × ${Fmu} = ${P_final_kW.toFixed(2)} kW`,
        formulaCV: `CV = 1,3596 × P_final = 1,3596 × ${P_final_kW.toFixed(2)} = ${CV.toFixed(2)} CV`,
        formulaTq: `Torque = (9550 × P_final) / n = (9550 × ${P_final_kW.toFixed(2)}) / ${Math.round(n)} = ${torque.toFixed(2)} Nm`,
      },
    };
  }, [T, H, tipoProcesso, densidade, viscosidade]);

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
              <label>Densidade do produto (ρ)</label>
              <input
                type="number"
                value={densidade}
                onChange={(ev) => setDensidade(Number(ev.target.value) || 0)}
                min={1}
                step={10}
              />
              <span className="unidade">kg/m³</span>
            </div>
            <div className="calculo-motor-impelidor-campo">
              <label>Viscosidade aproximada (μ)</label>
              <input
                type="number"
                value={viscosidade}
                onChange={(ev) => setViscosidade(Number(ev.target.value) || 0)}
                min={0}
                step={10}
              />
              <span className="unidade">cP</span>
            </div>
          </div>
          <button type="button" className="calculo-motor-impelidor-btn-calcular" onClick={scrollToResultado}>
            <FiCheck /> Calcular
          </button>
        </section>

        <section className="calculo-motor-impelidor-section regras">
          <h2>Regras de dimensionamento</h2>
          <ul>
            <li><strong>PASSO 1 – Diâmetro do disco (Di):</strong> Leve = 0,28×T; Padrão = 0,33×T; Pesado = 0,38×T</li>
            <li><strong>PASSO 2 – Velocidade periférica:</strong> Leve 18 m/s; Padrão 22 m/s; Pesado 25 m/s</li>
            <li><strong>PASSO 3 – Rotação:</strong> n = (60 × v) / (π × Di_m), Di_m = Di/1000</li>
            <li><strong>PASSO 4 – Volume útil:</strong> V = π × (T_m²/4) × H_m (T e H em m)</li>
            <li><strong>PASSO 5 – Potência base:</strong> P_base = (kW/m³) × V — Leve 1,5; Padrão 2,5; Pesado 4,0 kW/m³</li>
            <li><strong>PASSO 6 – Correção por densidade:</strong> P_dens = P_base × (ρ/1000)</li>
            <li><strong>PASSO 7 – Correção por viscosidade:</strong> μ≤500→Fμ=1,0; 500&lt;μ≤2000→1,2; 2000&lt;μ≤10000→1,5; μ&gt;10000→avaliar adequação</li>
            <li><strong>PASSO 8 – CV:</strong> CV = 1,3596 × P_final_kW</li>
            <li><strong>PASSO 9 – Torque:</strong> Torque (Nm) = (9550 × P_final_kW) / n</li>
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
              <span className="nome">Velocidade periférica</span>
              <span className="valor">{resultado.velPeriferica} m/s</span>
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
              <span className="nome">Potência final</span>
              <span className="valor">{resultado.P_kW} kW</span>
            </div>
            <div className="calculo-motor-impelidor-resultado-item">
              <span className="nome">Potência em CV</span>
              <span className="valor">{resultado.CV} CV</span>
            </div>
            <div className="calculo-motor-impelidor-resultado-item">
              <span className="nome">Torque no eixo</span>
              <span className="valor">{resultado.torque} Nm</span>
            </div>
          </div>
          {resultado.obsViscosidade && (
            <div className="calculo-motor-impelidor-obs">
              <strong>Observação:</strong> {resultado.obsViscosidade}
            </div>
          )}
          <div className="calculo-motor-impelidor-detalhes">
            <h3>Detalhamento dos cálculos</h3>
            <p><strong>PASSO 1 – Di:</strong> {detalhes.formulaDi}</p>
            <p><strong>PASSO 3 – Rotação:</strong> {detalhes.formulaRpm}</p>
            <p><strong>PASSO 4 – Volume:</strong> {detalhes.formulaV}</p>
            <p><strong>PASSO 5 – P_base:</strong> {detalhes.formulaPbase}</p>
            <p><strong>PASSO 6 – P_dens:</strong> {detalhes.formulaPdens}</p>
            <p><strong>PASSO 7 – Fμ e P_final:</strong> {detalhes.formulaFmu}</p>
            <p><strong>PASSO 8 – CV:</strong> {detalhes.formulaCV}</p>
            <p><strong>PASSO 9 – Torque:</strong> {detalhes.formulaTq}</p>
          </div>
        </section>
      </div>
    </div>
  );
};

export default CalculoMotorImpelidor;
