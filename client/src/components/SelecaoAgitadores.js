import React, { useState, useMemo, useRef } from 'react';
import { Link } from 'react-router-dom';
import { FiArrowLeft, FiCheck } from 'react-icons/fi';
import './SelecaoAgitadores.css';

const OBJETIVOS = {
  A: { id: 'A', label: 'Homogeneização / mistura simples' },
  B: { id: 'B', label: 'Suspensão de sólidos / evitar sedimentação' },
  C: { id: 'C', label: 'Dispersão de pigmentos / quebra de aglomerados (alto cisalhamento)' },
  D: { id: 'D', label: 'Alto viscoso / pastoso (âncora/helicoidal)' },
  E: { id: 'E', label: 'Processo híbrido (dispersão + controle de parede e troca térmica)' },
};

const POLOS_OPCOES = [2, 4, 6, 8];

function fatorViscosidade(muCp) {
  const mu = Number(muCp) || 0;
  if (mu <= 500) return 1.0;
  if (mu <= 2000) return 1.2;
  if (mu <= 10000) return 1.5;
  return 2.0;
}

function SelecaoAgitadores() {
  const [T, setT] = useState(1000);
  const [H, setH] = useState(1500);
  const [volumeDesejadoL, setVolumeDesejadoL] = useState('');
  const [viscosidade, setViscosidade] = useState(500);
  const [viscosidadeVaria, setViscosidadeVaria] = useState(false);
  const [densidade, setDensidade] = useState(1000);
  const [objetivo, setObjetivo] = useState('C');
  const [pctSolidos, setPctSolidos] = useState('');
  const [baffles, setBaffles] = useState('sim');
  const [qtdBaffles, setQtdBaffles] = useState(4);
  const [polos, setPolos] = useState(4);
  const [frequencia, setFrequencia] = useState(60);
  const [slip, setSlip] = useState(3);
  const [comVFD, setComVFD] = useState('nao');
  const resultadoRef = useRef(null);

  const report = useMemo(() => {
    const T_m = T / 1000;
    const H_m = H / 1000;
    const rho = Number(densidade) || 1000;
    const mu = Number(viscosidade) || 0;
    const P = Number(polos) || 4;
    const f = Number(frequencia) || 60;
    const slipDecimal = (Number(slip) || 3) / 100;

    // PASSO 1 — Conversões
    let V_m3 = Math.PI * (T_m * T_m / 4) * H_m;
    if (volumeDesejadoL && Number(volumeDesejadoL) > 0) {
      V_m3 = Number(volumeDesejadoL) / 1000;
    }
    const V_L = V_m3 * 1000;

    // PASSO 2 — Rotação
    const n_s = (120 * f) / P;
    const n = n_s * (1 - slipDecimal);

    // PASSO 3 — Seleção do tipo
    const tipos = [];
    let isHibrido = false;
    if (objetivo === 'C' && mu <= 5000) {
      tipos.push({ id: 'cowles', nome: 'Disco dispersor (Cowles)', justificativa: 'Objetivo de dispersão com viscosidade adequada para alto cisalhamento.' });
    }
    if (objetivo === 'D' || mu > 5000) {
      if (mu > 10000) {
        tipos.push({ id: 'helical', nome: 'Helicoidal (helical ribbon)', justificativa: 'Viscosidade muito alta; helicoidal é mais eficiente para pastosos.' });
      }
      tipos.push({ id: 'ancora', nome: 'Âncora', justificativa: 'Alto viscoso/pastoso ou viscosidade elevada; varredura de parede.' });
    }
    if (objetivo === 'A' && mu < 5000 && !tipos.length) {
      tipos.push({ id: 'helice', nome: 'Hélice axial (marine/propeller)', justificativa: 'Mistura simples com viscosidade baixa/moderada.' });
    }
    if (objetivo === 'B' && mu < 5000 && !tipos.length) {
      tipos.push({ id: 'turbina', nome: 'Turbina de pás inclinadas', justificativa: 'Suspensão de sólidos com bom bombeamento axial.' });
    }
    if (objetivo === 'E') {
      isHibrido = true;
      tipos.length = 0;
      tipos.push(
        { id: 'cowles', nome: 'Disco dispersor (Cowles)', justificativa: 'Alto cisalhamento para dispersão.' },
        { id: 'ancora', nome: 'Âncora', justificativa: 'Varredura de parede e troca térmica no híbrido.' }
      );
    }
    if (!tipos.length) {
      tipos.push({ id: 'cowles', nome: 'Disco dispersor (Cowles)', justificativa: 'Configuração padrão para dispersão.' });
    }

    const Fmu = fatorViscosidade(mu);
    const recomendarBaffles = (baffles === 'nao') && tipos.some(t => ['helice', 'turbina', 'cowles'].includes(t.id));

    // Parâmetros por tipo (Di faixa, v alvo, kW/m³)
    const params = {
      cowles: { kMin: 0.28, kMax: 0.4, kPadrao: 0.33, vMin: 18, vMax: 25, vPadrao: 22, kWporM3: 2.5 },
      helice: { kMin: 0.25, kMax: 0.35, kPadrao: 0.3, vMin: 3, vMax: 7, vPadrao: 5, kWporM3: 0.4 },
      turbina: { kMin: 0.25, kMax: 0.35, kPadrao: 0.3, vMin: 3, vMax: 7, vPadrao: 5, kWporM3: 0.5 },
      ancora: { kMin: 0.9, kMax: 0.98, kPadrao: 0.95, vMin: 0.5, vMax: 2, vPadrao: 1, kWporM3: 1.5 },
      helical: { kMin: 0.9, kMax: 0.98, kPadrao: 0.95, vMin: 0.8, vMax: 2.5, vPadrao: 1.5, kWporM3: 2.5 },
    };

    const impulsores = [];
    for (const t of tipos) {
      const p = params[t.id] || params.cowles;
      let Di = p.kPadrao * T;
      let Di_m = Di / 1000;
      let v_calc = (Math.PI * Di_m * n) / 60;

      // Ajustar Di se v fora da faixa e sem VFD
      if (comVFD === 'nao') {
        if (v_calc > p.vMax) {
          Di_m = (60 * p.vPadrao) / (Math.PI * n);
          Di = Math.min(Math.max(Di_m * 1000, p.kMin * T), p.kMax * T);
          Di_m = Di / 1000;
          v_calc = (Math.PI * Di_m * n) / 60;
        } else if (v_calc < p.vMin && ['cowles', 'helice', 'turbina'].includes(t.id)) {
          Di_m = (60 * p.vPadrao) / (Math.PI * n);
          Di = Math.min(Math.max(Di_m * 1000, p.kMin * T), p.kMax * T);
          Di_m = Di / 1000;
          v_calc = (Math.PI * Di_m * n) / 60;
        }
      }

      const relacaoDiT = T > 0 ? Di / T : 0;
      const P_base = p.kWporM3 * V_m3;
      const P_dens = P_base * (rho / 1000);
      const P_final_kW = P_dens * Fmu;
      const CV = 1.3596 * P_final_kW;
      const torque = n > 0 ? (9550 * P_final_kW) / n : 0;

      const foraFaixa = Di < p.kMin * T || Di > p.kMax * T;
      const vForaFaixa = v_calc < p.vMin || v_calc > p.vMax;

      impulsores.push({
        ...t,
        Di: Math.round(Di * 10) / 10,
        Di_m,
        relacaoDiT: relacaoDiT.toFixed(3),
        v_calc: v_calc.toFixed(2),
        vMin: p.vMin,
        vMax: p.vMax,
        P_kW: P_final_kW.toFixed(2),
        CV: CV.toFixed(2),
        torque: torque.toFixed(2),
        foraFaixa,
        vForaFaixa,
        posicao: t.id === 'ancora' || t.id === 'helical' ? 'Próximo ao fundo, folga 5–25 mm' : 'Altura típica: 0,3–0,5 × H a partir do fundo',
      });
    }

    const alertas = [];
    if (recomendarBaffles) alertas.push('Sem chicanas com impulsor axial/radial: recomenda-se 4 chicanas (10–12% da largura) ou montagem off-center para reduzir vórtice.');
    if (mu > 10000 && objetivo !== 'D' && objetivo !== 'E') alertas.push('Viscosidade > 10000 cP: considerar âncora ou helicoidal como primário.');
    if (viscosidadeVaria) alertas.push('Viscosidade varia no processo: avaliar VFD ou dois estágios de agitação.');
    impulsores.forEach(imp => {
      if (imp.vForaFaixa && comVFD === 'nao') alertas.push(`${imp.nome}: velocidade periférica (${imp.v_calc} m/s) fora da faixa ideal (${imp.vMin}–${imp.vMax} m/s). Recomenda-se VFD ou mudança de polos.`);
      if (imp.foraFaixa) alertas.push(`${imp.nome}: Di fora da faixa geométrica recomendada. Verificar proporção Di/T.`);
    });
    if (isHibrido) {
      alertas.push('Sistema híbrido: considerar dois motores (âncora baixa rotação + Cowles alto giro) ou redutor + motor separado; operação em etapas (dispersão com Cowles, homogeneização com âncora).');
    }

    const configMecanica = mu > 5000
      ? 'Eixo reforçado; selagem mecânica ou gaxeta adequada a alto viscoso; mancais dimensionados ao torque; redutor para âncora/helicoidal.'
      : 'Eixo padrão; selagem conforme produto; verificar deflexão em vão livre.';

    return {
      T, H, T_m, H_m, V_m3, V_L,
      n_s: Math.round(n_s), n: Math.round(n), P, f, slip: slipDecimal,
      objetivo: OBJETIVOS[objetivo]?.label || objetivo,
      tipos,
      impulsores,
      alertas,
      configMecanica,
      recomendarBaffles,
      isHibrido,
      baffles,
      qtdBaffles,
    };
  }, [T, H, volumeDesejadoL, viscosidade, densidade, objetivo, polos, frequencia, slip, comVFD, baffles, qtdBaffles]);

  const scrollToReport = () => {
    resultadoRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  return (
    <div className="selecao-agitadores">
      <div className="selecao-agitadores-header">
        <Link to="/engenharia" className="selecao-agitadores-back">
          <FiArrowLeft /> Voltar
        </Link>
        <h1>Seleção e dimensionamento de agitadores</h1>
        <p>Tanque cilíndrico vertical — mistura, dispersão e alto viscoso</p>
      </div>

      <div className="selecao-agitadores-layout">
        <section className="selecao-agitadores-section entradas">
          <h2>Dados de entrada</h2>
          <div className="selecao-agitadores-grid">
            <div className="campo">
              <label>Diâmetro interno do tanque T (mm)</label>
              <input type="number" value={T} onChange={e => setT(Number(e.target.value) || 0)} min={1} />
            </div>
            <div className="campo">
              <label>Altura útil do líquido H (mm)</label>
              <input type="number" value={H} onChange={e => setH(Number(e.target.value) || 0)} min={1} />
            </div>
            <div className="campo">
              <label>Volume útil desejado (L) — opcional</label>
              <input type="number" value={volumeDesejadoL} onChange={e => setVolumeDesejadoL(e.target.value)} placeholder="Deixe vazio para calcular por T e H" min={0} />
            </div>
            <div className="campo">
              <label>Viscosidade μ (cP)</label>
              <input type="number" value={viscosidade} onChange={e => setViscosidade(e.target.value)} min={0} />
            </div>
            <div className="campo campo-check">
              <label>
                <input type="checkbox" checked={viscosidadeVaria} onChange={e => setViscosidadeVaria(e.target.checked)} />
                Viscosidade varia no processo (ex.: início baixo, final alto)
              </label>
            </div>
            <div className="campo">
              <label>Densidade ρ (kg/m³)</label>
              <input type="number" value={densidade} onChange={e => setDensidade(e.target.value)} min={1} />
            </div>
            <div className="campo campo-full">
              <label>Objetivo do processo</label>
              <select value={objetivo} onChange={e => setObjetivo(e.target.value)}>
                {Object.values(OBJETIVOS).map(o => (
                  <option key={o.id} value={o.id}>({o.id}) {o.label}</option>
                ))}
              </select>
            </div>
            <div className="campo">
              <label>% sólidos (se aplicável)</label>
              <input type="number" value={pctSolidos} onChange={e => setPctSolidos(e.target.value)} placeholder="—" min={0} max={100} />
            </div>
            <div className="campo">
              <label>Chicanas/baffles</label>
              <select value={baffles} onChange={e => setBaffles(e.target.value)}>
                <option value="sim">Sim</option>
                <option value="nao">Não</option>
              </select>
            </div>
            {baffles === 'sim' && (
              <div className="campo">
                <label>Quantidade de baffles</label>
                <input type="number" value={qtdBaffles} onChange={e => setQtdBaffles(Number(e.target.value) || 4)} min={2} max={8} />
              </div>
            )}
            <div className="campo">
              <label>Polos do motor</label>
              <select value={polos} onChange={e => setPolos(Number(e.target.value))}>
                {POLOS_OPCOES.map(p => <option key={p} value={p}>{p}P</option>)}
              </select>
            </div>
            <div className="campo">
              <label>Frequência f (Hz)</label>
              <input type="number" value={frequencia} onChange={e => setFrequencia(e.target.value)} min={50} max={60} />
            </div>
            <div className="campo">
              <label>Slip (%)</label>
              <input type="number" value={slip} onChange={e => setSlip(e.target.value)} min={0} max={10} step={0.5} />
            </div>
            <div className="campo campo-full">
              <label>Inversor de frequência (VFD)</label>
              <select value={comVFD} onChange={e => setComVFD(e.target.value)}>
                <option value="nao">Não</option>
                <option value="sim">Sim</option>
              </select>
            </div>
          </div>
          <button type="button" className="btn-calcular" onClick={scrollToReport}>
            <FiCheck /> Gerar relatório
          </button>
        </section>

        <section ref={resultadoRef} className="selecao-agitadores-section relatorio">
          <h2>Relatório — Seleção e dimensionamento</h2>

          <div className="bloco">
            <h3>1. Tipo(s) de impulsor recomendado(s)</h3>
            {report.tipos.map(t => (
              <div key={t.id} className="impulsor-resumo">
                <strong>{t.nome}</strong>
                <p>{t.justificativa}</p>
              </div>
            ))}
          </div>

          <div className="bloco">
            <h3>2. Rotação disponível (polos e slip)</h3>
            <p>n_s = (120 × f) / P = (120 × {report.f}) / {report.P} = <strong>{report.n_s} rpm</strong> (síncrona)</p>
            <p>n = n_s × (1 − slip) = {report.n_s} × (1 − {report.slip.toFixed(2)}) = <strong>{report.n} rpm</strong> (real)</p>
          </div>

          <div className="bloco">
            <h3>3. Volume e geometria</h3>
            <p>Volume útil: <strong>{report.V_m3.toFixed(4)} m³</strong> ({report.V_L.toFixed(1)} L)</p>
            <p>T = {report.T} mm, H = {report.H} mm</p>
          </div>

          <div className="bloco">
            <h3>4. Dimensionamento por impulsor</h3>
            {report.impulsores.map((imp, idx) => (
              <div key={idx} className="impulsor-detalhe">
                <h4>{imp.nome}</h4>
                <ul>
                  <li>Diâmetro Di: <strong>{imp.Di} mm</strong></li>
                  <li>Relação Di/T: <strong>{imp.relacaoDiT}</strong></li>
                  <li>Posição: {imp.posicao}</li>
                  <li>Velocidade periférica v: <strong>{imp.v_calc} m/s</strong> (faixa ideal: {imp.vMin}–{imp.vMax} m/s)</li>
                  <li>Potência estimada: <strong>{imp.P_kW} kW</strong> ({imp.CV} CV)</li>
                  <li>Torque estimado: <strong>{imp.torque} Nm</strong></li>
                </ul>
                {(imp.foraFaixa || imp.vForaFaixa) && (
                  <p className="aviso-imp">Atenção: verificar faixa geométrica ou velocidade; considerar VFD ou ajuste de polos.</p>
                )}
              </div>
            ))}
          </div>

          {report.recomendarBaffles && (
            <div className="bloco">
              <h3>5. Chicanas (baffles)</h3>
              <p className="aviso">{report.alertas.find(a => a.includes('chicanas'))}</p>
            </div>
          )}

          <div className="bloco">
            <h3>{report.recomendarBaffles ? '6' : '5'}. Alertas e recomendações</h3>
            {report.alertas.length ? (
              <ul className="lista-alertas">
                {report.alertas.map((a, i) => <li key={i}>{a}</li>)}
              </ul>
            ) : (
              <p>Nenhum alerta crítico. Configuração dentro das faixas recomendadas.</p>
            )}
          </div>

          <div className="bloco">
            <h3>{report.recomendarBaffles ? '7' : '6'}. Configuração mecânica sugerida</h3>
            <p>{report.configMecanica}</p>
          </div>

          {report.isHibrido && (
            <div className="bloco">
              <h3>Sistema híbrido — estratégia de operação</h3>
              <p><strong>Início:</strong> âncora em baixa rotação + Cowles em rampa.</p>
              <p><strong>Dispersão:</strong> Cowles na velocidade periférica alvo; âncora mantendo circulação.</p>
              <p><strong>Final:</strong> reduzir Cowles e manter âncora para homogeneização e troca térmica.</p>
              <p>Opções de acionamento: (1) Dois motores independentes; (2) Um motor com redutor + segundo motor alto giro; (3) Conjunto com VFDs separados.</p>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}

export default SelecaoAgitadores;
