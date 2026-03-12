import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../../services/api';
import { toast } from 'react-toastify';
import './CPQ.css';

const PARAM_FIELDS = [
  { key: 'produto', label: 'Produto / tipo', type: 'text', placeholder: 'ex: tinta base solvente' },
  { key: 'segmento', label: 'Segmento', type: 'text', placeholder: 'tintas, resinas, massas...' },
  { key: 'viscosity_cps', label: 'Viscosidade (cPs)', type: 'number', placeholder: 'ex: 1500' },
  { key: 'densidade', label: 'Densidade (g/cm³)', type: 'number', placeholder: 'ex: 1,2' },
  { key: 'volume_util', label: 'Volume útil (L)', type: 'number', placeholder: 'ex: 2000' },
  { key: 'volume_total', label: 'Volume total (L)', type: 'number', placeholder: 'opcional' },
  { key: 'temperatura', label: 'Temperatura processo (°C)', type: 'number', placeholder: 'ex: 25' },
  { key: 'vazao', label: 'Vazão / produtividade', type: 'number', placeholder: 'opcional' },
  { key: 'base_quimica', label: 'Base química', type: 'text', placeholder: 'água, solvente...' },
  { key: 'area_classificada', label: 'Área classificada', type: 'checkbox' },
  { key: 'produto_corrosivo', label: 'Produto corrosivo', type: 'checkbox' },
  { key: 'produto_abrasivo', label: 'Produto abrasivo', type: 'checkbox' },
  { key: 'necessidade_dispersao', label: 'Necessidade dispersão', type: 'checkbox', default: true },
  { key: 'necessidade_moagem', label: 'Necessidade moagem', type: 'checkbox' },
  { key: 'necessidade_agitacao', label: 'Necessidade agitação', type: 'checkbox' },
  { key: 'presenca_solidos', label: 'Presença de sólidos', type: 'checkbox' }
];

const SOLUTION_TYPES = [
  { codigo: 'dispersor', nome: 'Dispersor' },
  { codigo: 'moinho', nome: 'Moinho' },
  { codigo: 'agitador', nome: 'Agitador' },
  { codigo: 'tanque', nome: 'Tanque' },
  { codigo: 'reator', nome: 'Reator' },
  { codigo: 'tubulacao', nome: 'Tubulação' },
  { codigo: 'dosagem', nome: 'Sistema de dosagem' },
  { codigo: 'agua_gelada', nome: 'Sistema água gelada' },
  { codigo: 'linha_processo', nome: 'Linha de processo' },
  { codigo: 'turn_key', nome: 'Planta turn-key' }
];

export default function CPQConfigurator() {
  const navigate = useNavigate();
  const [systemTypes, setSystemTypes] = useState([]);
  const [selectedType, setSelectedType] = useState('');
  const [params, setParams] = useState({ necessidade_dispersao: true });
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [clienteId, setClienteId] = useState('');
  const [clientes, setClientes] = useState([]);
  const [titulo, setTitulo] = useState('');

  useEffect(() => {
    api.get('/cpq/system-types').then(r => setSystemTypes(r.data || [])).catch(() => setSystemTypes([]));
    api.get('/clientes', { params: { status: 'ativo' } }).then(r => setClientes(r.data || [])).catch(() => setClientes([]));
  }, []);

  const handleParam = (key, value) => {
    setParams(prev => ({ ...prev, [key]: value }));
  };

  const runConfigure = () => {
    if (!selectedType) {
      toast.warning('Selecione o tipo de solução');
      return;
    }
    setLoading(true);
    const payload = {
      system_type: selectedType,
      params: {
        ...params,
        viscosidade: params.viscosity_cps ?? params.viscosidade,
        density: params.densidade,
        volume: params.volume_util ?? params.volume,
        volume_util: params.volume_util ?? params.volume
      }
    };
    api.post('/cpq/configure', payload)
      .then(({ data }) => {
        setResult(data);
        setLoading(false);
      })
      .catch(err => {
        toast.error(err.response?.data?.error || 'Erro ao configurar');
        setLoading(false);
      });
  };

  const createProject = () => {
    if (!titulo.trim()) {
      toast.error('Informe o título do projeto');
      return;
    }
    api.post('/cpq/projects', {
      sistema_tipo_codigo: selectedType,
      titulo: titulo.trim(),
      cliente_id: clienteId || null,
      params_json: { ...params, suggested: result }
    }).then(({ data }) => {
      toast.success('Projeto criado');
      navigate(`/comercial/cpq/projetos/${data.id}`);
    }).catch(err => toast.error(err.response?.data?.error || 'Erro ao criar projeto'));
  };

  const types = systemTypes.length ? systemTypes : SOLUTION_TYPES;
  const sizing = result?.sizing_result || {};
  const rulesApplied = result?.rules_applied || {};
  const compositionSuggestions = result?.composition_suggestions || [];

  return (
    <div className="cpq-page">
      <header className="cpq-header">
        <h1>Configurador técnico CPQ — Processo químico</h1>
        <p className="cpq-subtitle">Viscosidade (cPs), densidade, volume e tipo de produto → dimensionamento e proposta</p>
      </header>

      <div className="cpq-config-grid">
        <section className="cpq-card">
          <h2>1. Tipo de solução</h2>
          <div className="cpq-type-list">
            {types.map(t => (
              <button
                key={t.codigo}
                type="button"
                className={`cpq-type-btn ${selectedType === t.codigo ? 'active' : ''}`}
                onClick={() => setSelectedType(t.codigo)}
              >
                {t.nome}
              </button>
            ))}
          </div>
        </section>

        <section className="cpq-card">
          <h2>2. Dados de processo</h2>
          <div className="cpq-params cpq-params-grid">
            {PARAM_FIELDS.map(f => (
              <div key={f.key} className="cpq-param">
                <label>{f.label}</label>
                {f.type === 'checkbox' ? (
                  <input
                    type="checkbox"
                    checked={f.key === 'necessidade_dispersao' && params[f.key] === undefined ? true : !!params[f.key]}
                    onChange={e => handleParam(f.key, e.target.checked)}
                  />
                ) : (
                  <input
                    type={f.type}
                    value={params[f.key] ?? ''}
                    onChange={e => handleParam(f.key, f.type === 'number' ? (parseFloat(e.target.value) || e.target.value) : e.target.value)}
                    placeholder={f.placeholder || f.label}
                  />
                )}
              </div>
            ))}
          </div>
          <button type="button" className="cpq-btn cpq-btn-primary" onClick={runConfigure} disabled={loading}>
            {loading ? 'Aplicando regras e dimensionando...' : 'Aplicar regras e dimensionar'}
          </button>
        </section>

        {result && (
          <>
            {rulesApplied.blocked && (
              <section className="cpq-card cpq-alert">
                <h2>⚠️ Configuração bloqueada</h2>
                <p>{rulesApplied.block_reason}</p>
              </section>
            )}

            <section className="cpq-card cpq-result">
              <h2>3. Dimensionamento preliminar</h2>
              <div className="cpq-sizing">
                {sizing.valor_informado && Object.keys(sizing.valor_informado).length > 0 && (
                  <div className="cpq-sizing-block">
                    <strong>Valores informados:</strong>
                    <pre>{JSON.stringify(sizing.valor_informado, null, 2)}</pre>
                  </div>
                )}
                {(sizing.potencia_sugerida_min != null || sizing.potencia_sugerida_max != null) && (
                  <div className="cpq-sizing-block">
                    <strong>Potência sugerida:</strong> {sizing.potencia_sugerida_min}–{sizing.potencia_sugerida_max} CV
                  </div>
                )}
                {sizing.tipo_impelidor && (
                  <div className="cpq-sizing-block"><strong>Tipo impelidor:</strong> {sizing.tipo_impelidor}</div>
                )}
                {sizing.tipo_vedacao && (
                  <div className="cpq-sizing-block"><strong>Vedação:</strong> {sizing.tipo_vedacao}</div>
                )}
                {sizing.material_contato_sugerido && (
                  <div className="cpq-sizing-block"><strong>Material contato:</strong> {sizing.material_contato_sugerido}</div>
                )}
                {sizing.tipo_acionamento && (
                  <div className="cpq-sizing-block"><strong>Acionamento:</strong> {sizing.tipo_acionamento}</div>
                )}
                {sizing.origem_calculo && sizing.origem_calculo.length > 0 && (
                  <div className="cpq-sizing-block">
                    <strong>Origem do cálculo:</strong>
                    <ul>{sizing.origem_calculo.map((o, i) => <li key={i}>{o}</li>)}</ul>
                  </div>
                )}
                {sizing.alertas && sizing.alertas.length > 0 && (
                  <div className="cpq-sizing-block cpq-alertas">
                    <strong>Alertas:</strong>
                    <ul>{sizing.alertas.map((a, i) => <li key={i}>{a}</li>)}</ul>
                  </div>
                )}
              </div>
            </section>

            <section className="cpq-card cpq-result">
              <h2>4. Regras aplicadas e equipamentos sugeridos</h2>
              {rulesApplied.applied_rules && rulesApplied.applied_rules.length > 0 && (
                <div className="cpq-rules-list">
                  {rulesApplied.applied_rules.map((r, i) => (
                    <div key={i} className="cpq-rule-item">
                      <strong>{r.rule_nome}</strong>
                      {r.justificativa_tecnica && <p className="cpq-justificativa">{r.justificativa_tecnica}</p>}
                    </div>
                  ))}
                </div>
              )}
              {rulesApplied.equipment && rulesApplied.equipment.length > 0 && (
                <p><strong>Equipamentos sugeridos:</strong> {rulesApplied.equipment.join(', ')}</p>
              )}
              {rulesApplied.specifications && Object.keys(rulesApplied.specifications).length > 0 && (
                <p><strong>Especificações:</strong> {Object.keys(rulesApplied.specifications).join(', ')}</p>
              )}
            </section>

            {compositionSuggestions.length > 0 && (
              <section className="cpq-card cpq-result">
                <h2>5. Composição sugerida (por tipo de solução)</h2>
                <ul className="cpq-composition-list">
                  {compositionSuggestions.map((s, i) => (
                    <li key={i}><span className="cpq-group-badge">{s.group_codigo}</span> {s.item_sugerido}</li>
                  ))}
                </ul>
              </section>
            )}

            <section className="cpq-card cpq-create-project">
              <h2>6. Criar projeto CPQ</h2>
              <div className="cpq-create-project-fields">
                <input type="text" placeholder="Título do projeto" value={titulo} onChange={e => setTitulo(e.target.value)} />
                <select value={clienteId} onChange={e => setClienteId(e.target.value)}>
                  <option value="">Cliente (opcional)</option>
                  {clientes.map(c => <option key={c.id} value={c.id}>{c.nome_fantasia || c.razao_social}</option>)}
                </select>
                <button type="button" className="cpq-btn cpq-btn-primary" onClick={createProject}>
                  Criar projeto e compor itens
                </button>
              </div>
            </section>
          </>
        )}
      </div>
    </div>
  );
}
