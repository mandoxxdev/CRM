import React, { useState, useMemo, useRef } from 'react';
import { Link } from 'react-router-dom';
import { FiArrowLeft, FiCheck } from 'react-icons/fi';
import './CalculoMotorImpelidor.css';

const TIPOS_PROCESSO = {
  leve: { label: 'Leve', velPeriferica: 18, kWporM3: 1.5 },
  padrao: { label: 'Padrão', velPeriferica: 22, kWporM3: 2.5 },
  pesado: { label: 'Pesado (alto sólido)', velPeriferica: 25, kWporM3: 4.0 },
};

const POLOS_OPCOES = [2, 4, 6, 8];

function fatorViscosidade(muCp) {
  const mu = Number(muCp) || 0;
  if (mu <= 500) return { Fmu: 1.0, obs: null };
  if (mu <= 2000) return { Fmu: 1.2, obs: null };
  if (mu <= 10000) return { Fmu: 1.5, obs: null };
  return { Fmu: 1.5, obs: 'Produto muito grosso (acima de 10000 cP). Só o disco pode não ser suficiente; avalie usar outro tipo de agitador ou recirculação.' };
}

const CalculoMotorImpelidor = () => {
  const [T, setT] = useState(1000);
  const [H, setH] = useState(1500);
  const [tipoProcesso, setTipoProcesso] = useState('padrao');
  const [densidade, setDensidade] = useState(1000);
  const [viscosidade, setViscosidade] = useState(500);
  const [polos, setPolos] = useState(4);
  const [frequencia, setFrequencia] = useState(60);
  const resultadoRef = useRef(null);

  const { resultado, detalhes } = useMemo(() => {
    const tipo = TIPOS_PROCESSO[tipoProcesso] || TIPOS_PROCESSO.padrao;
    const rho = Number(densidade) || 1000;
    const mu = Number(viscosidade) || 0;
    const P = Number(polos) || 4;
    const f = Number(frequencia) || 60;

    // PASSO 1 – Rotação síncrona
    const n_s = (120 * f) / P;

    // PASSO 2 – Slip 3%
    const n_real = n_s * 0.97;

    // PASSO 3 – Velocidade periférica alvo
    const v_alvo = tipo.velPeriferica;

    // PASSO 4 – Diâmetro necessário do disco
    const Di_m = (60 * v_alvo) / (Math.PI * n_real);
    const Di = Di_m * 1000;

    // PASSO 5 – Verificar proporção ideal (0,28T a 0,40T)
    const Di_min = 0.28 * T;
    const Di_max = 0.4 * T;
    const foraDaFaixa = Di < Di_min || Di > Di_max;
    const obsFaixa = foraDaFaixa
      ? `O diâmetro do disco (${Math.round(Di * 10) / 10} mm) está fora do recomendado (entre ${Math.round(Di_min)} e ${Math.round(Di_max)} mm). Ajuste o disco ou use inversor de frequência para variar a rotação.`
      : null;

    // Velocidade periférica final (com Di calculado e n_real)
    const v_final = (Math.PI * Di_m * n_real) / 60;
    const relacaoDiT = T > 0 ? (Di / T) : 0;

    // PASSO 6 – Volume útil
    const T_m = T / 1000;
    const H_m = H / 1000;
    const V_m3 = Math.PI * (T_m * T_m / 4) * H_m;

    // PASSO 7 – Potência base
    const P_base = tipo.kWporM3 * V_m3;

    // PASSO 8 – Correções
    const P_dens = P_base * (rho / 1000);
    const { Fmu, obs: obsVisc } = fatorViscosidade(mu);
    const P_final_kW = P_dens * Fmu;

    // PASSO 9 – CV
    const CV = 1.3596 * P_final_kW;

    // PASSO 10 – Torque (com n_real)
    const torque = n_real > 0 ? (9550 * P_final_kW) / n_real : 0;

    return {
      resultado: {
        rpm: Math.round(n_real),
        Di: Math.round(Di * 10) / 10,
        relacaoDiT: relacaoDiT.toFixed(3),
        velPerifericaFinal: v_final.toFixed(2),
        P_kW: P_final_kW.toFixed(2),
        CV: CV.toFixed(2),
        torque: torque.toFixed(2),
        obsViscosidade: obsVisc,
        obsFaixa,
      },
      detalhes: {
        tipo: tipo.label,
        P,
        f,
        n_s: Math.round(n_s),
        n_real: Math.round(n_real),
        v_alvo: v_alvo,
        Di_m: Di_m.toFixed(4),
        Di: Math.round(Di * 10) / 10,
        Di_min: Math.round(Di_min),
        Di_max: Math.round(Di_max),
        foraDaFaixa,
        kWporM3: tipo.kWporM3,
        rho,
        mu,
        Fmu,
        P_base: P_base.toFixed(2),
        P_dens: P_dens.toFixed(2),
        P_final_kW: P_final_kW.toFixed(2),
        formulaNs: `n_s = (120 × f) / P = (120 × ${f}) / ${P} = ${Math.round(n_s)} rpm`,
        formulaNreal: `n_real = n_s × 0,97 = ${Math.round(n_s)} × 0,97 = ${Math.round(n_real)} rpm`,
        formulaDi: `Di_m = (60 × v) / (π × n_real) = (60 × ${v_alvo}) / (π × ${n_real.toFixed(2)}) = ${Di_m.toFixed(4)} m → Di = ${Math.round(Di * 10) / 10} mm`,
        formulaV: `V = π × (T_m²/4) × H_m = π × (${T_m.toFixed(3)}²/4) × ${H_m.toFixed(3)} = ${V_m3.toFixed(4)} m³`,
        formulaPbase: `P_base = ${tipo.kWporM3} kW/m³ × ${V_m3.toFixed(4)} m³ = ${P_base.toFixed(2)} kW`,
        formulaPdens: `P_dens = P_base × (ρ/1000) = ${P_base.toFixed(2)} × (${rho}/1000) = ${P_dens.toFixed(2)} kW`,
        formulaFmu: `Fμ = ${Fmu} (μ = ${mu} cP) → P_final = P_dens × Fμ = ${P_dens.toFixed(2)} × ${Fmu} = ${P_final_kW.toFixed(2)} kW`,
        formulaCV: `CV = 1,3596 × P_final = 1,3596 × ${P_final_kW.toFixed(2)} = ${CV.toFixed(2)} CV`,
        formulaTq: `Torque = (9550 × P_final) / n_real = (9550 × ${P_final_kW.toFixed(2)}) / ${Math.round(n_real)} = ${torque.toFixed(2)} Nm`,
      },
    };
  }, [T, H, tipoProcesso, densidade, viscosidade, polos, frequencia]);

  const scrollToResultado = () => {
    resultadoRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  return (
    <div className="calculo-motor-impelidor">
      <div className="calculo-motor-impelidor-header">
        <Link to="/engenharia" className="calculo-motor-impelidor-back">
          <FiArrowLeft /> Voltar
        </Link>
        <h1>Disco dispersor (Cowles) — Motor + Impelidor</h1>
        <p>Dimensionamento do disco a partir do tanque, do motor (polos) e da rede</p>
      </div>

      <div className="calculo-motor-impelidor-layout">
        <section className="calculo-motor-impelidor-section entradas">
          <h2>Dados do tanque e do processo</h2>
          <div className="calculo-motor-impelidor-campos">
            <div className="calculo-motor-impelidor-campo">
              <label>Diâmetro do tanque (por dentro), mm</label>
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
              <label>Altura do líquido no tanque, mm</label>
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
              <label>Tipo de processo (quanto mais pesado, disco maior e mais potência)</label>
              <select
                value={tipoProcesso}
                onChange={(ev) => setTipoProcesso(ev.target.value)}
              >
                <option value="leve">Leve</option>
                <option value="padrao">Padrão</option>
                <option value="pesado">Pesado (muito sólido)</option>
              </select>
            </div>
            <div className="calculo-motor-impelidor-campo">
              <label>Densidade do produto, kg/m³</label>
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
              <label>Viscosidade do produto, cP (quanto maior, mais grosso)</label>
              <input
                type="number"
                value={viscosidade}
                onChange={(ev) => setViscosidade(Number(ev.target.value) || 0)}
                min={0}
                step={10}
              />
              <span className="unidade">cP</span>
            </div>
            <div className="calculo-motor-impelidor-campo">
              <label>Número de polos do motor (define a rotação)</label>
              <select
                value={polos}
                onChange={(ev) => setPolos(Number(ev.target.value))}
              >
                {POLOS_OPCOES.map((p) => (
                  <option key={p} value={p}>{p} polos</option>
                ))}
              </select>
            </div>
            <div className="calculo-motor-impelidor-campo">
              <label>Frequência da rede</label>
              <input
                type="number"
                value={frequencia}
                onChange={(ev) => setFrequencia(Number(ev.target.value) || 50)}
                min={50}
                max={60}
                step={1}
              />
              <span className="unidade">Hz</span>
            </div>
          </div>
          <button type="button" className="calculo-motor-impelidor-btn-calcular" onClick={scrollToResultado}>
            <FiCheck /> Calcular
          </button>
        </section>

        <section className="calculo-motor-impelidor-section regras">
          <h2>Como é feito o cálculo</h2>
          <ul>
            <li>Rotação do motor a partir dos polos e da frequência da rede</li>
            <li>Diâmetro do disco para atingir a velocidade ideal na ponta (leve 18 m/s; padrão 22 m/s; pesado 25 m/s)</li>
            <li>Volume do tanque e potência por metro cúbico, corrigida pela densidade e viscosidade</li>
            <li>Potência em kW e em CV; torque no eixo em Nm</li>
          </ul>
        </section>

        <section ref={resultadoRef} className="calculo-motor-impelidor-section resultado-box">
          <h2>Resultado</h2>
          <div className="calculo-motor-impelidor-resultado-linhas">
            <div className="calculo-motor-impelidor-resultado-item">
              <span className="nome">Rotação do motor</span>
              <span className="valor">{resultado.rpm} rpm</span>
            </div>
            <div className="calculo-motor-impelidor-resultado-item">
              <span className="nome">Diâmetro do disco</span>
              <span className="valor">{resultado.Di} mm</span>
            </div>
            <div className="calculo-motor-impelidor-resultado-item">
              <span className="nome">Proporção disco ÷ tanque</span>
              <span className="valor">{resultado.relacaoDiT}</span>
            </div>
            <div className="calculo-motor-impelidor-resultado-item">
              <span className="nome">Velocidade na ponta do disco</span>
              <span className="valor">{resultado.velPerifericaFinal} m/s</span>
            </div>
            <div className="calculo-motor-impelidor-resultado-item">
              <span className="nome">Potência</span>
              <span className="valor">{resultado.P_kW} kW</span>
            </div>
            <div className="calculo-motor-impelidor-resultado-item">
              <span className="nome">Potência em cavalos</span>
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
          {resultado.obsFaixa && (
            <div className="calculo-motor-impelidor-obs calculo-motor-impelidor-obs-faixa">
              <strong>Aviso:</strong> {resultado.obsFaixa}
            </div>
          )}
          <div className="calculo-motor-impelidor-detalhes">
            <h3>Detalhes dos cálculos</h3>
            <p><strong>PASSO 1 – n_s:</strong> {detalhes.formulaNs}</p>
            <p><strong>PASSO 2 – n_real:</strong> {detalhes.formulaNreal}</p>
            <p><strong>PASSO 4 – Di:</strong> {detalhes.formulaDi}</p>
            <p><strong>PASSO 5 – Faixa:</strong> Recomendado Di entre {detalhes.Di_min} mm e {detalhes.Di_max} mm (0,28T a 0,40T). {detalhes.foraDaFaixa ? 'Fora da faixa.' : 'Dentro da faixa.'}</p>
            <p><strong>PASSO 6 – Volume:</strong> {detalhes.formulaV}</p>
            <p><strong>PASSO 7 – P_base:</strong> {detalhes.formulaPbase}</p>
            <p><strong>PASSO 8 – P_dens e Fμ:</strong> {detalhes.formulaPdens}; {detalhes.formulaFmu}</p>
            <p><strong>PASSO 9 – CV:</strong> {detalhes.formulaCV}</p>
            <p><strong>PASSO 10 – Torque:</strong> {detalhes.formulaTq}</p>
          </div>
        </section>
      </div>
    </div>
  );
};

export default CalculoMotorImpelidor;
