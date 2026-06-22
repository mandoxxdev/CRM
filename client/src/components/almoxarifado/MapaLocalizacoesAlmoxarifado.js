import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { Link } from 'react-router-dom';
import api from '../../services/api';
import { toast } from 'react-toastify';
import { useAuth } from '../../context/AuthContext';
import {
  FiMap, FiRefreshCw, FiFilter, FiMove, FiSave, FiX,
  FiPackage, FiAlertTriangle, FiSettings, FiInfo
} from 'react-icons/fi';
import './Almoxarifado.css';

const MAP_W = 1100;
const MAP_H = 720;
const PAD = 28;

const TIPO_ICONES = {
  Almoxarifado: '🏢',
  Rua: '🛤️',
  Prateleira: '📚',
  Gaveta: '🗄️',
  Box: '📦',
  'Área externa': '☀️',
  'Área de corte': '✂️',
  'Área de montagem': '🔧',
  'Área de elétrica': '⚡',
  'Área de pintura': '🎨',
  'Área de expedição': '🚚',
  'Área de materiais do cliente': '👤',
  'Área de quarentena/inspeção': '🔍',
};

const TIPO_CORES = {
  Almoxarifado: '#4facfe',
  Rua: '#78909c',
  Prateleira: '#43e97b',
  Gaveta: '#ab47bc',
  Box: '#f9a825',
  'Área externa': '#26c6da',
  'Área de corte': '#ef5350',
  'Área de montagem': '#5c6bc0',
  'Área de elétrica': '#ffa726',
  'Área de pintura': '#ec407a',
  'Área de expedição': '#66bb6a',
  'Área de materiais do cliente': '#8d6e63',
  'Área de quarentena/inspeção': '#ff7043',
};

const TIPO_TAMANHOS = {
  Almoxarifado: { w: 200, h: 140 },
  Rua: { w: 200, h: 48 },
  Prateleira: { w: 120, h: 72 },
  Gaveta: { w: 88, h: 56 },
  Box: { w: 96, h: 64 },
  'Área externa': { w: 180, h: 130 },
  default: { w: 120, h: 80 },
};

function tamanhoTipo(tipo) {
  return TIPO_TAMANHOS[tipo] || TIPO_TAMANHOS.default;
}

function statusLocalizacao(loc) {
  if (loc.itens_criticos > 0) return 'critico';
  if (loc.itens_baixo_minimo > 0) return 'baixo';
  if (loc.qtd_itens > 0) return 'ok';
  return 'vazio';
}

function corStatus(status) {
  if (status === 'critico') return '#ef5350';
  if (status === 'baixo') return '#f9a825';
  if (status === 'ok') return '#43e97b';
  return '#94a3b8';
}

function computeLayout(locations) {
  const comCoords = locations.filter(l => l.pos_x != null && l.pos_y != null);
  if (comCoords.length === locations.length && locations.length > 0) {
    return locations.map(loc => ({
      ...loc,
      layoutX: loc.pos_x,
      layoutY: loc.pos_y,
      layoutW: loc.largura || tamanhoTipo(loc.tipo).w,
      layoutH: loc.altura || tamanhoTipo(loc.tipo).h,
      autoLayout: false,
    }));
  }

  const sectors = {};
  locations.forEach(loc => {
    const s = loc.setor || 'Geral';
    if (!sectors[s]) sectors[s] = [];
    sectors[s].push(loc);
  });

  const sectorNames = Object.keys(sectors).sort();
  const cols = Math.max(1, Math.ceil(Math.sqrt(sectorNames.length)));
  const rows = Math.ceil(sectorNames.length / cols);
  const sectorW = (MAP_W - PAD * 2) / cols;
  const sectorH = (MAP_H - PAD * 2 - 20) / rows;
  const result = [];

  sectorNames.forEach((name, si) => {
    const col = si % cols;
    const row = Math.floor(si / cols);
    const sx = PAD + col * sectorW;
    const sy = PAD + row * sectorH;
    const locs = sectors[name];
    const locCols = Math.max(1, Math.ceil(Math.sqrt(locs.length)));
    const locRows = Math.ceil(locs.length / locCols);
    const innerW = sectorW - 20;
    const innerH = sectorH - 44;
    const cellW = innerW / locCols;
    const cellH = innerH / locRows;

    locs.forEach((loc, li) => {
      const lc = li % locCols;
      const lr = Math.floor(li / locCols);
      const size = tamanhoTipo(loc.tipo);
      const w = Math.min(size.w, cellW - 10);
      const h = Math.min(size.h, cellH - 10);
      const hasPos = loc.pos_x != null && loc.pos_y != null;
      result.push({
        ...loc,
        sectorName: name,
        sectorX: sx,
        sectorY: sy,
        sectorW,
        sectorH,
        layoutX: hasPos ? loc.pos_x : sx + 12 + lc * cellW + (cellW - w) / 2,
        layoutY: hasPos ? loc.pos_y : sy + 36 + lr * cellH + (cellH - h) / 2,
        layoutW: loc.largura || w,
        layoutH: loc.altura || h,
        autoLayout: !hasPos,
      });
    });
  });

  return result;
}

const MapaLocalizacoesAlmoxarifado = () => {
  const { user } = useAuth();
  const isAdmin = user?.role === 'admin';
  const svgRef = useRef(null);

  const [localizacoes, setLocalizacoes] = useState([]);
  const [tiposLoc, setTiposLoc] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filtroSetor, setFiltroSetor] = useState('');
  const [filtroTipo, setFiltroTipo] = useState('');
  const [selecionada, setSelecionada] = useState(null);
  const [hoverId, setHoverId] = useState(null);
  const [modoEdicao, setModoEdicao] = useState(false);
  const [posicoesEdit, setPosicoesEdit] = useState({});
  const [salvando, setSalvando] = useState(false);
  const [arrastando, setArrastando] = useState(null);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [mapRes, metaRes] = await Promise.all([
        api.get('/almoxarifado/mapa/localizacoes'),
        api.get('/almoxarifado/meta/tipos-material'),
      ]);
      setLocalizacoes(mapRes.data);
      setTiposLoc(metaRes.data.localizacoes_tipos || []);
    } catch {
      toast.error('Erro ao carregar mapa de localizações');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  const setores = useMemo(() => {
    const s = new Set(localizacoes.map(l => l.setor).filter(Boolean));
    return Array.from(s).sort();
  }, [localizacoes]);

  const filtradas = useMemo(() => {
    return localizacoes.filter(l => {
      if (filtroSetor && l.setor !== filtroSetor) return false;
      if (filtroTipo && (l.tipo || 'Almoxarifado') !== filtroTipo) return false;
      return true;
    });
  }, [localizacoes, filtroSetor, filtroTipo]);

  const layout = useMemo(() => computeLayout(filtradas), [filtradas]);

  const sectorsVisiveis = useMemo(() => {
    const map = {};
    layout.forEach(l => {
      if (l.sectorName && l.autoLayout) {
        if (!map[l.sectorName]) {
          map[l.sectorName] = { x: l.sectorX, y: l.sectorY, w: l.sectorW, h: l.sectorH };
        }
      }
    });
    return Object.entries(map);
  }, [layout]);

  const getPos = (loc) => {
    const edit = posicoesEdit[loc.id];
    if (edit) return edit;
    return { x: loc.layoutX, y: loc.layoutY, w: loc.layoutW, h: loc.layoutH };
  };

  const svgPoint = (clientX, clientY) => {
    const svg = svgRef.current;
    if (!svg) return { x: 0, y: 0 };
    const pt = svg.createSVGPoint();
    pt.x = clientX;
    pt.y = clientY;
    const ctm = svg.getScreenCTM();
    if (!ctm) return { x: 0, y: 0 };
    const inv = ctm.inverse();
    return pt.matrixTransform(inv);
  };

  const onDragStart = (e, loc) => {
    if (!modoEdicao) return;
    e.preventDefault();
    const pos = getPos(loc);
    const pt = svgPoint(e.clientX, e.clientY);
    setArrastando({ id: loc.id, offsetX: pt.x - pos.x, offsetY: pt.y - pos.y, w: pos.w, h: pos.h });
  };

  const onDragMove = useCallback((e) => {
    if (!arrastando) return;
    const pt = svgPoint(e.clientX, e.clientY);
    setPosicoesEdit(prev => ({
      ...prev,
      [arrastando.id]: {
        x: Math.max(0, Math.min(MAP_W - arrastando.w, pt.x - arrastando.offsetX)),
        y: Math.max(0, Math.min(MAP_H - arrastando.h, pt.y - arrastando.offsetY)),
        w: arrastando.w,
        h: arrastando.h,
      },
    }));
  }, [arrastando]);

  const onDragEnd = () => setArrastando(null);

  useEffect(() => {
    if (!arrastando) return;
    window.addEventListener('mousemove', onDragMove);
    window.addEventListener('mouseup', onDragEnd);
    return () => {
      window.removeEventListener('mousemove', onDragMove);
      window.removeEventListener('mouseup', onDragEnd);
    };
  }, [arrastando, onDragMove]);

  const salvarPosicoes = async () => {
    const entries = Object.entries(posicoesEdit);
    if (entries.length === 0) { toast.info('Nenhuma posição alterada'); return; }
    setSalvando(true);
    try {
      await api.put('/almoxarifado/mapa/localizacoes/posicoes', {
        posicoes: entries.map(([id, p]) => ({
          id: parseInt(id, 10),
          pos_x: Math.round(p.x),
          pos_y: Math.round(p.y),
          largura: Math.round(p.w),
          altura: Math.round(p.h),
        })),
      });
      toast.success('Posições salvas!');
      setPosicoesEdit({});
      setModoEdicao(false);
      loadData();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Erro ao salvar posições');
    } finally {
      setSalvando(false);
    }
  };

  const resumo = useMemo(() => {
    const total = filtradas.length;
    const comEstoque = filtradas.filter(l => l.qtd_itens > 0).length;
    const alertas = filtradas.filter(l => l.itens_baixo_minimo > 0 || l.itens_criticos > 0).length;
    return { total, comEstoque, alertas };
  }, [filtradas]);

  if (loading) {
    return (
      <div className="almox-page">
        <div className="almox-loading">
          <FiRefreshCw size={16} style={{ animation: 'spin 1s linear infinite' }} />
          Carregando mapa...
        </div>
      </div>
    );
  }

  return (
    <div className="almox-page almox-mapa-page">
      <div className="almox-header">
        <div>
          <h1 style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <FiMap size={22} style={{ color: '#4facfe' }} /> Mapa de Áreas
          </h1>
          <p>Planta visual do almoxarifado com ocupação e alertas de estoque por localização</p>
        </div>
        <div className="almox-header-actions">
          <button className="btn-almox-secondary" onClick={loadData}>
            <FiRefreshCw size={14} /> Atualizar
          </button>
          {isAdmin && (
            <>
              {modoEdicao ? (
                <>
                  <button className="btn-almox-primary" onClick={salvarPosicoes} disabled={salvando}>
                    <FiSave size={14} /> {salvando ? 'Salvando...' : 'Salvar Posições'}
                  </button>
                  <button className="btn-almox-secondary" onClick={() => { setModoEdicao(false); setPosicoesEdit({}); }}>
                    <FiX size={14} /> Cancelar
                  </button>
                </>
              ) : (
                <button className="btn-almox-secondary" onClick={() => setModoEdicao(true)}>
                  <FiMove size={14} /> Editar Posições
                </button>
              )}
            </>
          )}
          <Link to="/almoxarifado/configuracoes" className="btn-almox-secondary">
            <FiSettings size={14} /> Localizações
          </Link>
        </div>
      </div>

      <div className="almox-kpis" style={{ marginBottom: 20 }}>
        <div className="almox-kpi-card">
          <div className="almox-kpi-icon primary"><FiMap /></div>
          <div className="almox-kpi-info">
            <div className="almox-kpi-value">{resumo.total}</div>
            <div className="almox-kpi-label">Localizações</div>
          </div>
        </div>
        <div className="almox-kpi-card">
          <div className="almox-kpi-icon success"><FiPackage /></div>
          <div className="almox-kpi-info">
            <div className="almox-kpi-value">{resumo.comEstoque}</div>
            <div className="almox-kpi-label">Com itens em estoque</div>
          </div>
        </div>
        <div className="almox-kpi-card">
          <div className="almox-kpi-icon warning"><FiAlertTriangle /></div>
          <div className="almox-kpi-info">
            <div className="almox-kpi-value">{resumo.alertas}</div>
            <div className="almox-kpi-label">Com alerta de estoque</div>
          </div>
        </div>
      </div>

      <div className="almox-filters">
        <FiFilter size={14} style={{ color: 'var(--gmp-text-light)' }} />
        <select className="almox-select" value={filtroSetor} onChange={e => setFiltroSetor(e.target.value)}>
          <option value="">Todos os setores</option>
          {setores.map(s => <option key={s} value={s}>{s}</option>)}
        </select>
        <select className="almox-select" value={filtroTipo} onChange={e => setFiltroTipo(e.target.value)}>
          <option value="">Todos os tipos</option>
          {(tiposLoc.length ? tiposLoc : Object.keys(TIPO_ICONES)).map(t => (
            <option key={t} value={t}>{TIPO_ICONES[t] || '📍'} {t}</option>
          ))}
        </select>
        {(filtroSetor || filtroTipo) && (
          <button className="btn-almox-secondary" style={{ padding: '6px 12px', fontSize: '0.8rem' }}
            onClick={() => { setFiltroSetor(''); setFiltroTipo(''); }}>
            Limpar filtros
          </button>
        )}
        {modoEdicao && (
          <span style={{ fontSize: '0.8rem', color: '#4facfe', fontWeight: 600, marginLeft: 'auto' }}>
            <FiMove size={12} /> Arraste as áreas para reposicionar
          </span>
        )}
      </div>

      <div className="almox-mapa-layout">
        <div className="almox-mapa-canvas-wrap">
          {filtradas.length === 0 ? (
            <div className="almox-empty">
              <FiMap size={48} style={{ opacity: 0.25, display: 'block', margin: '0 auto 16px' }} />
              <p>Nenhuma localização cadastrada ou compatível com os filtros.</p>
              <Link to="/almoxarifado/configuracoes" className="btn-almox-primary" style={{ marginTop: 16, display: 'inline-flex' }}>
                Cadastrar localizações
              </Link>
            </div>
          ) : (
            <svg
              ref={svgRef}
              viewBox={`0 0 ${MAP_W} ${MAP_H}`}
              className="almox-mapa-svg"
              role="img"
              aria-label="Mapa de áreas do almoxarifado"
            >
              <defs>
                <pattern id="almox-grid" width="40" height="40" patternUnits="userSpaceOnUse">
                  <path d="M 40 0 L 0 0 0 40" fill="none" stroke="rgba(79,172,254,0.08)" strokeWidth="1" />
                </pattern>
                <filter id="almox-shadow" x="-10%" y="-10%" width="120%" height="120%">
                  <feDropShadow dx="0" dy="2" stdDeviation="3" floodOpacity="0.15" />
                </filter>
              </defs>

              <rect x="0" y="0" width={MAP_W} height={MAP_H} fill="var(--gmp-bg)" rx="12" />
              <rect x="8" y="8" width={MAP_W - 16} height={MAP_H - 16} fill="url(#almox-grid)" rx="10" />
              <rect x="8" y="8" width={MAP_W - 16} height={MAP_H - 16} fill="none"
                stroke="rgba(79,172,254,0.25)" strokeWidth="2" rx="10" strokeDasharray="8 4" />

              {sectorsVisiveis.map(([name, sec]) => (
                <g key={`sector-${name}`}>
                  <rect x={sec.x + 4} y={sec.y + 4} width={sec.w - 8} height={sec.h - 8}
                    fill="rgba(79,172,254,0.04)" stroke="rgba(79,172,254,0.15)" strokeWidth="1" rx="8" />
                  <text x={sec.x + 14} y={sec.y + 22} className="almox-mapa-sector-label">{name}</text>
                </g>
              ))}

              {layout.map(loc => {
                const pos = getPos(loc);
                const tipo = loc.tipo || 'Almoxarifado';
                const status = statusLocalizacao(loc);
                const corTipo = TIPO_CORES[tipo] || '#4facfe';
                const corSt = corStatus(status);
                const isHover = hoverId === loc.id;
                const isSel = selecionada?.id === loc.id;
                const icone = TIPO_ICONES[tipo] || '📍';

                return (
                  <g
                    key={loc.id}
                    transform={`translate(${pos.x}, ${pos.y})`}
                    style={{ cursor: modoEdicao ? 'grab' : 'pointer' }}
                    onMouseDown={e => onDragStart(e, loc)}
                    onMouseEnter={() => setHoverId(loc.id)}
                    onMouseLeave={() => setHoverId(null)}
                    onClick={() => !arrastando && setSelecionada(loc)}
                    filter="url(#almox-shadow)"
                  >
                    <rect
                      width={pos.w}
                      height={pos.h}
                      rx="8"
                      fill={`${corTipo}22`}
                      stroke={isSel ? '#4facfe' : isHover ? corSt : `${corTipo}88`}
                      strokeWidth={isSel ? 3 : isHover ? 2.5 : 1.5}
                    />
                    <rect x="0" y="0" width={pos.w} height="6" rx="8" fill={corSt} />
                    <text x={pos.w / 2} y={pos.h * 0.38} textAnchor="middle" className="almox-mapa-zone-icon">
                      {icone}
                    </text>
                    <text x={pos.w / 2} y={pos.h * 0.62} textAnchor="middle" className="almox-mapa-zone-code">
                      {loc.codigo}
                    </text>
                    <text x={pos.w / 2} y={pos.h * 0.82} textAnchor="middle" className="almox-mapa-zone-count">
                      {loc.qtd_itens > 0 ? `${loc.qtd_itens} item(ns)` : 'Vazio'}
                    </text>
                  </g>
                );
              })}
            </svg>
          )}
        </div>

        <aside className="almox-mapa-sidebar">
          <div className="almox-mapa-legend">
            <h3><FiInfo size={14} /> Legenda</h3>
            <div className="almox-mapa-legend-section">
              <span className="almox-mapa-legend-title">Status de estoque</span>
              {[
                { s: 'ok', label: 'Estoque normal' },
                { s: 'baixo', label: 'Abaixo do mínimo' },
                { s: 'critico', label: 'Crítico / zerado' },
                { s: 'vazio', label: 'Sem itens' },
              ].map(({ s, label }) => (
                <div key={s} className="almox-mapa-legend-item">
                  <span className="almox-mapa-legend-bar" style={{ background: corStatus(s) }} />
                  {label}
                </div>
              ))}
            </div>
            <div className="almox-mapa-legend-section">
              <span className="almox-mapa-legend-title">Tipos de área</span>
              {Object.entries(TIPO_ICONES).slice(0, 6).map(([t, ic]) => (
                <div key={t} className="almox-mapa-legend-item">
                  <span>{ic}</span> {t}
                </div>
              ))}
            </div>
          </div>

          {selecionada ? (
            <div className="almox-mapa-detail">
              <h3>{TIPO_ICONES[selecionada.tipo] || '📍'} {selecionada.codigo}</h3>
              <p className="almox-mapa-detail-desc">{selecionada.descricao || 'Sem descrição'}</p>
              <dl className="almox-mapa-detail-list">
                <dt>Tipo</dt><dd>{selecionada.tipo || 'Almoxarifado'}</dd>
                <dt>Setor</dt><dd>{selecionada.setor || '—'}</dd>
                <dt>Itens distintos</dt><dd>{selecionada.qtd_itens || 0}</dd>
                <dt>Quantidade total</dt><dd>{Number(selecionada.quantidade_total || 0).toLocaleString('pt-BR')}</dd>
                <dt>Reservado</dt><dd>{Number(selecionada.quantidade_reservada || 0).toLocaleString('pt-BR')}</dd>
                <dt>Status</dt>
                <dd>
                  <span className={`almox-badge almox-badge-${statusLocalizacao(selecionada)}`}>
                    {statusLocalizacao(selecionada) === 'critico' ? 'Crítico'
                      : statusLocalizacao(selecionada) === 'baixo' ? 'Baixo estoque'
                      : statusLocalizacao(selecionada) === 'ok' ? 'Normal' : 'Vazio'}
                  </span>
                </dd>
                {(selecionada.itens_baixo_minimo > 0 || selecionada.itens_criticos > 0) && (
                  <>
                    <dt>Alertas</dt>
                    <dd style={{ color: 'var(--gmp-warning)', fontSize: '0.8rem' }}>
                      {selecionada.itens_criticos > 0 && `${selecionada.itens_criticos} crítico(s)`}
                      {selecionada.itens_criticos > 0 && selecionada.itens_baixo_minimo > 0 && ' · '}
                      {selecionada.itens_baixo_minimo > 0 && `${selecionada.itens_baixo_minimo} abaixo do mín.`}
                    </dd>
                  </>
                )}
              </dl>
              <button className="btn-almox-secondary" style={{ width: '100%', marginTop: 12 }}
                onClick={() => setSelecionada(null)}>
                Fechar
              </button>
            </div>
          ) : (
            <div className="almox-mapa-detail almox-mapa-detail-empty">
              <FiMap size={32} style={{ opacity: 0.2, marginBottom: 12 }} />
              <p>Clique em uma área do mapa para ver detalhes de estoque e status.</p>
            </div>
          )}
        </aside>
      </div>
    </div>
  );
};

export default MapaLocalizacoesAlmoxarifado;
