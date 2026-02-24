import React, { useState, useMemo, useRef } from 'react';
import { Link } from 'react-router-dom';
import { FiArrowLeft, FiCheck } from 'react-icons/fi';
import './SelecaoAgitadores.css';

const OBJETIVOS = {
  A: { id: 'A', label: 'Só misturar / homogenizar (líquidos de viscosidade baixa ou média)' },
  B: { id: 'B', label: 'Manter sólidos em suspensão / evitar que assentem no fundo' },
  C: { id: 'C', label: 'Dispersar pigmentos / quebrar grumos (produto mais fino, tipo tinta)' },
  D: { id: 'D', label: 'Produto bem grosso ou pastoso (ex.: massa, creme)' },
  E: { id: 'E', label: 'Combo: dispersar + raspar parede e trocar calor (dois agitadores)' },
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
      tipos.push({ id: 'cowles', nome: 'Disco dispersor (Cowles)', justificativa: 'Indicado para dispersar e deixar o produto mais fino; viscosidade está adequada para esse tipo de agitador.' });
    }
    if (objetivo === 'D' || mu > 5000) {
      if (mu > 10000) {
        tipos.push({ id: 'helical', nome: 'Helicoidal (fita em espiral)', justificativa: 'Produto muito grosso; o helicoidal mistura melhor pastas e massas.' });
      }
      tipos.push({ id: 'ancora', nome: 'Âncora', justificativa: 'Produto grosso ou pastoso; a âncora raspa a parede do tanque e ajuda na mistura.' });
    }
    if (objetivo === 'A' && mu < 5000 && !tipos.length) {
      tipos.push({ id: 'helice', nome: 'Hélice (tipo ventilador)', justificativa: 'Mistura simples; ideal para líquidos mais fluidos.' });
    }
    if (objetivo === 'B' && mu < 5000 && !tipos.length) {
      tipos.push({ id: 'turbina', nome: 'Turbina de pás inclinadas', justificativa: 'Mantém os sólidos em suspensão e movimenta bem o líquido.' });
    }
    if (objetivo === 'E') {
      isHibrido = true;
      tipos.length = 0;
      tipos.push(
        { id: 'cowles', nome: 'Disco dispersor (Cowles)', justificativa: 'Faz a dispersão (deixar o produto fino).' },
        { id: 'ancora', nome: 'Âncora', justificativa: 'Raspa a parede e ajuda na troca de calor no combo.' }
      );
    }
    if (!tipos.length) {
      tipos.push({ id: 'cowles', nome: 'Disco dispersor (Cowles)', justificativa: 'Opção padrão para dispersão.' });
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
        posicao: t.id === 'ancora' || t.id === 'helical' ? 'Perto do fundo do tanque, com pequena folga (5 a 25 mm)' : 'Altura sugerida: entre 30% e 50% da altura do líquido, medindo do fundo',
      });
    }

    const alertas = [];
    if (recomendarBaffles) alertas.push('O tanque não tem chicanas. Com esse tipo de agitador é recomendado usar 4 chicanas (chapas verticais na parede que evitam redemoinho) ou instalar o agitador deslocado do centro.');
    if (mu > 10000 && objetivo !== 'D' && objetivo !== 'E') alertas.push('Produto muito grosso (acima de 10000 cP). O ideal é usar âncora ou helicoidal como agitador principal.');
    if (viscosidadeVaria) alertas.push('A viscosidade muda durante o processo. Vale considerar inversor de frequência (para variar a rotação) ou duas etapas de agitação.');
    impulsores.forEach(imp => {
      if (imp.vForaFaixa && comVFD === 'nao') alertas.push(`${imp.nome}: a velocidade na ponta do disco (${imp.v_calc} m/s) está fora do ideal (${imp.vMin} a ${imp.vMax} m/s). Recomenda-se usar inversor de frequência ou trocar o número de polos do motor.`);
      if (imp.foraFaixa) alertas.push(`${imp.nome}: o diâmetro do disco está fora da faixa recomendada em relação ao diâmetro do tanque. Verifique a proporção.`);
    });
    if (isHibrido) {
      alertas.push('Sistema com dois agitadores: pode usar dois motores (um para âncora em baixa rotação e outro para o disco em alta) ou um redutor + outro motor. Operar em etapas: dispersão com o disco, depois homogeneizar com a âncora.');
    }

    const configMecanica = mu > 5000
      ? 'Para produto grosso: eixo mais resistente; vedação adequada ao produto; mancais que aguentem o torque; redutor para âncora/helicoidal.'
      : 'Para produto fluido: eixo padrão; vedação conforme o produto; conferir se o eixo não flexiona demais.';

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
        <h1>Seleção de agitadores</h1>
        <p>Para tanque cilíndrico em pé — mistura, dispersão ou produto grosso</p>
      </div>

      <div className="selecao-agitadores-layout">
        <section className="selecao-agitadores-section entradas">
          <h2>Informe os dados</h2>
          <div className="selecao-agitadores-grid">
            <div className="campo">
              <label>Diâmetro do tanque (por dentro), em mm</label>
              <input type="number" value={T} onChange={e => setT(Number(e.target.value) || 0)} min={1} />
            </div>
            <div className="campo">
              <label>Altura do líquido no tanque, em mm</label>
              <input type="number" value={H} onChange={e => setH(Number(e.target.value) || 0)} min={1} />
            </div>
            <div className="campo">
              <label>Volume desejado em litros (opcional)</label>
              <input type="number" value={volumeDesejadoL} onChange={e => setVolumeDesejadoL(e.target.value)} placeholder="Deixe em branco para calcular pelo diâmetro e altura" min={0} />
            </div>
            <div className="campo">
              <label>Viscosidade do produto, em cP (quanto maior, mais grosso)</label>
              <input type="number" value={viscosidade} onChange={e => setViscosidade(e.target.value)} min={0} />
            </div>
            <div className="campo campo-check">
              <label>
                <input type="checkbox" checked={viscosidadeVaria} onChange={e => setViscosidadeVaria(e.target.checked)} />
                A viscosidade muda durante o processo (ex.: começa fina e termina grossa)
              </label>
            </div>
            <div className="campo">
              <label>Densidade do produto, em kg/m³</label>
              <input type="number" value={densidade} onChange={e => setDensidade(e.target.value)} min={1} />
            </div>
            <div className="campo campo-full">
              <label>O que você precisa fazer no tanque?</label>
              <select value={objetivo} onChange={e => setObjetivo(e.target.value)}>
                {Object.values(OBJETIVOS).map(o => (
                  <option key={o.id} value={o.id}>({o.id}) {o.label}</option>
                ))}
              </select>
            </div>
            <div className="campo">
              <label>Porcentagem de sólidos, se tiver (opcional)</label>
              <input type="number" value={pctSolidos} onChange={e => setPctSolidos(e.target.value)} placeholder="—" min={0} max={100} />
            </div>
            <div className="campo">
              <label>O tanque tem chicanas? (chapas na parede que evitam redemoinho)</label>
              <select value={baffles} onChange={e => setBaffles(e.target.value)}>
                <option value="sim">Sim</option>
                <option value="nao">Não</option>
              </select>
            </div>
            {baffles === 'sim' && (
              <div className="campo">
                <label>Quantas chicanas?</label>
                <input type="number" value={qtdBaffles} onChange={e => setQtdBaffles(Number(e.target.value) || 4)} min={2} max={8} />
              </div>
            )}
            <div className="campo">
              <label>Polos do motor (2, 4, 6 ou 8 — define a rotação)</label>
              <select value={polos} onChange={e => setPolos(Number(e.target.value))}>
                {POLOS_OPCOES.map(p => <option key={p} value={p}>{p} polos</option>)}
              </select>
            </div>
            <div className="campo">
              <label>Frequência da rede elétrica, em Hz (Brasil: 60)</label>
              <input type="number" value={frequencia} onChange={e => setFrequencia(e.target.value)} min={50} max={60} />
            </div>
            <div className="campo">
              <label>Escorregamento do motor, em % (geralmente 3)</label>
              <input type="number" value={slip} onChange={e => setSlip(e.target.value)} min={0} max={10} step={0.5} />
            </div>
            <div className="campo campo-full">
              <label>Vai usar inversor de frequência? (permite variar a rotação)</label>
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
          <h2>Relatório</h2>

          <div className="bloco">
            <h3>1. Qual agitador usar</h3>
            {report.tipos.map(t => (
              <div key={t.id} className="impulsor-resumo">
                <strong>{t.nome}</strong>
                <p>{t.justificativa}</p>
              </div>
            ))}
          </div>

          <div className="bloco">
            <h3>2. Rotação do motor</h3>
            <p>Rotação teórica (síncrona): <strong>{report.n_s} rpm</strong></p>
            <p>Rotação real (com escorregamento): <strong>{report.n} rpm</strong></p>
          </div>

          <div className="bloco">
            <h3>3. Volume do tanque</h3>
            <p>Volume útil: <strong>{report.V_m3.toFixed(4)} m³</strong> ({report.V_L.toFixed(1)} litros)</p>
            <p>Diâmetro do tanque: {report.T} mm — Altura do líquido: {report.H} mm</p>
          </div>

          <div className="bloco">
            <h3>4. Tamanho e potência de cada agitador</h3>
            {report.impulsores.map((imp, idx) => (
              <div key={idx} className="impulsor-detalhe">
                <h4>{imp.nome}</h4>
                <ul>
                  <li>Diâmetro do disco/impulsor: <strong>{imp.Di} mm</strong></li>
                  <li>Proporção disco ÷ tanque: <strong>{imp.relacaoDiT}</strong></li>
                  <li>Onde instalar: {imp.posicao}</li>
                  <li>Velocidade na ponta do disco: <strong>{imp.v_calc} m/s</strong> (faixa ideal: {imp.vMin} a {imp.vMax} m/s)</li>
                  <li>Potência estimada: <strong>{imp.P_kW} kW</strong> ({imp.CV} CV)</li>
                  <li>Torque no eixo (força de giro): <strong>{imp.torque} Nm</strong></li>
                </ul>
                {(imp.foraFaixa || imp.vForaFaixa) && (
                  <p className="aviso-imp">Atenção: o diâmetro ou a velocidade estão fora do ideal. Considere usar inversor de frequência ou trocar o motor (número de polos).</p>
                )}
              </div>
            ))}
          </div>

          {report.recomendarBaffles && (
            <div className="bloco">
              <h3>5. Chicanas</h3>
              <p className="aviso">{report.alertas.find(a => a.includes('chicanas'))}</p>
            </div>
          )}

          <div className="bloco">
            <h3>{report.recomendarBaffles ? '6' : '5'}. Avisos e recomendações</h3>
            {report.alertas.length ? (
              <ul className="lista-alertas">
                {report.alertas.map((a, i) => <li key={i}>{a}</li>)}
              </ul>
            ) : (
              <p>Nada crítico. A configuração está dentro do recomendado.</p>
            )}
          </div>

          <div className="bloco">
            <h3>{report.recomendarBaffles ? '7' : '6'}. Sugestão de parte mecânica</h3>
            <p>{report.configMecanica}</p>
          </div>

          {report.isHibrido && (
            <div className="bloco">
              <h3>Combo de dois agitadores — como operar</h3>
              <p><strong>Início:</strong> ligar a âncora em rotação baixa e subir a rotação do disco aos poucos.</p>
              <p><strong>Dispersão:</strong> disco na velocidade ideal; âncora girando para manter o produto em movimento.</p>
              <p><strong>Final:</strong> reduzir o disco e manter a âncora para homogenizar e trocar calor na parede.</p>
              <p>Formas de acionar: (1) Dois motores separados; (2) Um motor com redutor para a âncora e outro para o disco; (3) Dois inversores de frequência, um para cada.</p>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}

export default SelecaoAgitadores;
