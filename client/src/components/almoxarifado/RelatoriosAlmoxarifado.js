import React, { useState, useEffect, useCallback, useMemo } from 'react';
import api from '../../services/api';
import { toast } from 'react-toastify';
import { FiBarChart2, FiRefreshCw, FiAlertTriangle, FiDownload } from 'react-icons/fi';
import { SkeletonTable } from '../SkeletonLoader';
import './Almoxarifado.css';

/**
 * Etapa 13, Task 3 — tela `/almoxarifado/relatorios`, DIRIGIDA pelo registro do servidor
 * (server/services/almoxarifado/reportRegistry.js) através de GET /almoxarifado/relatorios.
 * Contrato: docs/superpowers/specs/2026-08-24-almoxarifado-etapa13-relatorios-design.md
 * (RN-02/RN-03/RN-05, D6).
 *
 * ── Duas decisões por contrato HTTP REAL divergir do design (medido em extended.js) ──────────
 *
 * RN-02 diz literalmente que a lista devolve `{ tipo, titulo, categoria, params }` — o handler
 * real (`app.get('/api/almoxarifado/relatorios', ...)`) confirma: SEM `exportavel`, `limite` ou
 * `colunas` (só esses 4 campos são mapeados; "a resposta nunca inclui `acao`" no design não
 * cobre os outros três, mas o código também os omite). O design/RN-05 assume que a tela lê
 * esses campos direto da lista — não dá, e a decisão foi:
 *
 *  1. Botão "Exportar XLSX": sem `exportavel` na lista, uso o payload da ÚLTIMA CONSULTA como
 *     proxy — `Array.isArray(payload) <=> exportavel:true`. Essa equivalência é GARANTIDA pelo
 *     próprio registro do servidor (Task 1: `colunas` é obrigatória quando `exportavel:true`, e
 *     o dispatcher de export devolve 400 quando o payload não é array — os dois únicos casos
 *     `exportavel:false` hoje, `materiais-cliente` e `sucata-financeiro`, devolvem objeto). O
 *     botão só aparece DEPOIS de uma consulta bem-sucedida cujo payload seja array.
 *  2. Aviso "mostrando os primeiros N": sem `limite` na lista, uso uma tabela local que
 *     ESPELHA os 3 valores hoje declarados em reportRegistry.js (historico-movimentacoes: 500,
 *     inventario-divergencias: 500, materiais-mais-consumidos: 10). Risco de desalinhamento
 *     REGISTRADO: se o registro mudar o limite de um desses três (letra B), este mapa precisa
 *     acompanhar — não há como descobrir isso pela lista sem mudar o contrato congelado, fora
 *     do escopo desta task (galho de tela, não pode tocar o backend).
 *
 * ── Download do export ──────────────────────────────────────────────────────────────────────
 * Usa o MESMO padrão já estabelecido no resto do cliente (PropostaForm.js, PropostasList.js,
 * CustosViagens.js): `api.get(..., { responseType: 'blob' })` + link temporário com
 * `URL.createObjectURL`. NÃO um `window.location.href`/anchor apontando direto pra rota: a
 * autenticação deste app é por Bearer token em header (services/api.js interceptor), que uma
 * navegação crua do browser não envia (o servidor até aceita `?token=` como fallback —
 * `authenticateToken` em server/index.js — mas isso vazaria o token na URL/histórico/logs, e
 * nenhum outro download do app faz isso). Usar a mesma instância do axios garante o header
 * certo, mantém o download testável por mock e não abre uma exceção de segurança nova.
 */

// Decisão 2 acima — ver cabeçalho do arquivo.
const LIMITE_CONHECIDO = {
  'historico-movimentacoes': 500,
  'inventario-divergencias': 500,
  'materiais-mais-consumidos': 10,
};

// Mesmo painel de erro por estado da Etapa 11/12 (achado 1, Critical) — copiado de
// ReposicaoAlmoxarifado.js/NotificacoesAlmoxarifado.js para o módulo não ganhar um terceiro
// jeito de dizer "os dados não carregaram". Sabotagem-alvo: remover o `erro ? <Painel/> : (...)`
// faz os testes de 403/rede desta tela caírem.
const PainelErroCarga = ({ mensagem, onTentarNovamente }) => (
  <div
    style={{
      marginBottom: 16,
      padding: '14px 18px',
      borderRadius: 10,
      border: '1px solid rgba(239, 68, 68, 0.35)',
      background: 'rgba(239, 68, 68, 0.08)',
      color: 'var(--gmp-text)',
      display: 'flex',
      alignItems: 'flex-start',
      justifyContent: 'space-between',
      gap: 16,
      flexWrap: 'wrap',
    }}
  >
    <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
      <FiAlertTriangle size={18} style={{ color: '#ef4444', flexShrink: 0, marginTop: 2 }} />
      <div>
        <strong style={{ display: 'block', marginBottom: 4 }}>Dados indisponíveis no momento</strong>
        <span style={{ fontSize: '0.9rem', color: 'var(--gmp-text-light)' }}>{mensagem}</span>
      </div>
    </div>
    <button type="button" className="btn-almox-secondary" onClick={onTentarNovamente}>
      <FiRefreshCw size={14} /> Tentar novamente
    </button>
  </div>
);

// Heurística GENÉRICA (nunca por nome de coluna/tipo de relatório): valor bate um padrão de
// data/data-hora do SQLite -> formata UTC-safe (mesma lição de ReposicaoAlmoxarifado.js —
// sem o 'Z', o V8 lê como hora local). Data pura ("YYYY-MM-DD") usa timeZone:'UTC' explícito no
// Intl — sem isso, um fuso negativo (Brasil) mostraria o dia ANTERIOR ao meio-dia UTC.
const RE_DATA_HORA = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/;
const RE_DATA_SO = /^\d{4}-\d{2}-\d{2}$/;

const formatCelula = (v) => {
  if (v === null || v === undefined || v === '') return '—';
  if (typeof v === 'string' && RE_DATA_HORA.test(v)) {
    return new Date(`${v.replace(' ', 'T')}Z`).toLocaleString('pt-BR', {
      day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit',
    });
  }
  if (typeof v === 'string' && RE_DATA_SO.test(v)) {
    return new Date(`${v}T00:00:00Z`).toLocaleDateString('pt-BR', {
      day: '2-digit', month: '2-digit', year: '2-digit', timeZone: 'UTC',
    });
  }
  if (typeof v === 'number') return v.toLocaleString('pt-BR', { maximumFractionDigits: 4 });
  return String(v);
};

// Tabela genérica: cabeçalhos vêm das CHAVES do primeiro item (o front não conhece `colunas` do
// registro — nem chegam na lista, ver decisão 2 do cabeçalho). Usada tanto para o payload ARRAY
// direto quanto para um array interno de um payload OBJETO (ex.: `rupturas.materiais`).
const TabelaGenerica = ({ linhas }) => {
  if (!linhas || linhas.length === 0) {
    return <div className="almox-empty"><p>Nenhum registro encontrado</p></div>;
  }
  const colunas = Object.keys(linhas[0]);
  return (
    <div className="almox-table-container">
      <table className="almox-table">
        <thead>
          <tr>{colunas.map((c) => <th key={c}>{c}</th>)}</tr>
        </thead>
        <tbody>
          {linhas.map((linha, i) => (
            // eslint-disable-next-line react/no-array-index-key
            <tr key={i}>{colunas.map((c) => <td key={c}>{formatCelula(linha[c])}</td>)}</tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};

// Renderiza um VALOR qualquer de um payload objeto (indicadores hoje; qualquer outro relatório
// que passe a devolver objeto amanhã, sem a tela precisar conhecer o tipo): array -> tabela
// (ou lista simples se for array de primitivos), objeto -> grade de cards (recursiva), escalar
// -> texto formatado.
const ValorObjeto = ({ valor }) => {
  if (Array.isArray(valor)) {
    if (valor.length > 0 && (valor[0] === null || typeof valor[0] !== 'object')) {
      return <span>{valor.map((v) => formatCelula(v)).join(', ') || '—'}</span>;
    }
    return <TabelaGenerica linhas={valor} />;
  }
  if (valor && typeof valor === 'object') {
    return (
      <div className="almox-kpis">
        {Object.entries(valor).map(([k, v]) => {
          const complexo = Array.isArray(v) || (v && typeof v === 'object');
          return (
            <div className="almox-kpi-card" key={k}>
              <div className="almox-kpi-info">
                <div className="almox-kpi-value" style={complexo ? { fontSize: '0.85rem' } : undefined}>
                  {complexo ? <ValorObjeto valor={v} /> : formatCelula(v)}
                </div>
                <div className="almox-kpi-label">{k}</div>
              </div>
            </div>
          );
        })}
      </div>
    );
  }
  return <span>{formatCelula(valor)}</span>;
};

// Payload objeto de primeiro nível (D6/RN-05): escalares viram cards numa grade única no topo;
// arrays e objetos viram seções tituladas com a chave, cada uma com seu próprio ValorObjeto.
const SecoesObjeto = ({ dados }) => {
  const entradas = Object.entries(dados);
  const escalares = entradas.filter(([, v]) => v === null || typeof v !== 'object');
  const complexas = entradas.filter(([, v]) => v !== null && typeof v === 'object');
  return (
    <>
      {escalares.length > 0 && (
        <div className="almox-kpis" style={{ marginBottom: 16 }}>
          {escalares.map(([k, v]) => (
            <div className="almox-kpi-card" key={k}>
              <div className="almox-kpi-info">
                <div className="almox-kpi-value">{formatCelula(v)}</div>
                <div className="almox-kpi-label">{k}</div>
              </div>
            </div>
          ))}
        </div>
      )}
      {complexas.map(([k, v]) => (
        <div key={k} style={{ marginBottom: 20 }}>
          <div className="almox-section-title">{k}</div>
          <ValorObjeto valor={v} />
        </div>
      ))}
    </>
  );
};

const RelatoriosAlmoxarifado = () => {
  const [listaRelatorios, setListaRelatorios] = useState(null);
  const [loadingLista, setLoadingLista] = useState(true);
  const [erroLista, setErroLista] = useState(null); // { status, mensagem }
  const [reloadLista, setReloadLista] = useState(0);

  const [tipoSelecionado, setTipoSelecionado] = useState(null);
  const [valoresParams, setValoresParams] = useState({});
  const [avisoObrigatorios, setAvisoObrigatorios] = useState(null);

  const [dadosRelatorio, setDadosRelatorio] = useState(null);
  const [loadingConsulta, setLoadingConsulta] = useState(false);
  const [erroConsulta, setErroConsulta] = useState(null);
  const [ultimaConsultaParams, setUltimaConsultaParams] = useState(null); // querystring da última consulta OK
  const [exportando, setExportando] = useState(false);

  const carregarLista = useCallback(() => {
    let cancelado = false;
    setLoadingLista(true);
    setErroLista(null);
    api.get('/almoxarifado/relatorios')
      .then((r) => { if (!cancelado) setListaRelatorios(r.data?.relatorios || []); })
      .catch((err) => {
        if (cancelado) return;
        // Mesma lição da Etapa 11 (achado 1): NAO grava []  — a tela renderizaria "nenhum
        // relatório disponível" para um 403, que aqui nem existe (a lista é fail-closed, mas o
        // ENDPOINT pode falhar por rede/sessão).
        setListaRelatorios(null);
        const mensagem = err.response?.data?.error || 'Não foi possível carregar a lista de relatórios';
        setErroLista({ status: err.response?.status, mensagem });
        toast.error(mensagem);
      })
      .finally(() => { if (!cancelado) setLoadingLista(false); });
    return () => { cancelado = true; };
  }, []);

  useEffect(() => carregarLista(), [carregarLista, reloadLista]);

  // Agrupamento por categoria — SÓ com o que a lista devolveu, nunca um catálogo fixo de tipos
  // (sabotagem-alvo: hardcodar os 17 tipos aqui ignoraria 403 de perfil ou relatório novo/
  // removido no servidor e o teste de "menu só com o listado" cai).
  const categorias = useMemo(() => {
    const mapa = new Map();
    (listaRelatorios || []).forEach((r) => {
      if (!mapa.has(r.categoria)) mapa.set(r.categoria, []);
      mapa.get(r.categoria).push(r);
    });
    return [...mapa.entries()];
  }, [listaRelatorios]);

  const entradaSelecionada = useMemo(
    () => (listaRelatorios || []).find((r) => r.tipo === tipoSelecionado) || null,
    [listaRelatorios, tipoSelecionado],
  );

  const selecionarRelatorio = (tipo) => {
    setTipoSelecionado(tipo);
    setValoresParams({});
    setAvisoObrigatorios(null);
    setDadosRelatorio(null);
    setErroConsulta(null);
    setUltimaConsultaParams(null);
  };

  const handleConsultar = async () => {
    if (loadingConsulta || !entradaSelecionada) return;
    // Obrigatório bloqueia ANTES de qualquer chamada — o único obrigatório real hoje é
    // cliente_id do materiais-cliente (RN-01), mas o formulário é genérico por declaração.
    const faltando = (entradaSelecionada.params || [])
      .filter((p) => p.obrigatorio && !String(valoresParams[p.nome] ?? '').trim())
      .map((p) => p.rotulo);
    if (faltando.length > 0) {
      setAvisoObrigatorios(faltando);
      return;
    }
    setAvisoObrigatorios(null);
    // Vazios omitidos — não manda `param=` sem valor (o servidor trataria como filtro vazio,
    // não como "sem filtro", em alguns relatórios).
    const paramsPreenchidos = {};
    (entradaSelecionada.params || []).forEach((p) => {
      const v = valoresParams[p.nome];
      if (v !== undefined && v !== null && String(v).trim() !== '') paramsPreenchidos[p.nome] = v;
    });
    setLoadingConsulta(true);
    setErroConsulta(null);
    try {
      const res = await api.get(`/almoxarifado/relatorios/${entradaSelecionada.tipo}`, { params: paramsPreenchidos });
      setDadosRelatorio(res.data);
      setUltimaConsultaParams(paramsPreenchidos);
    } catch (err) {
      // Mesma lição das outras telas: 403/rede NUNCA vira resultado vazio.
      setDadosRelatorio(null);
      setUltimaConsultaParams(null);
      const mensagem = err.response?.data?.error || 'Não foi possível consultar o relatório';
      setErroConsulta({ status: err.response?.status, mensagem });
      toast.error(mensagem);
    } finally {
      setLoadingConsulta(false);
    }
  };

  const handleExportar = async () => {
    if (exportando || !entradaSelecionada || ultimaConsultaParams === null) return;
    setExportando(true);
    try {
      // MESMA querystring da última consulta bem-sucedida — nunca os valores "ao vivo" dos
      // inputs (o usuário pode ter mudado um campo sem clicar Consultar de novo).
      const response = await api.get(`/almoxarifado/relatorios/${entradaSelecionada.tipo}/export`, {
        params: ultimaConsultaParams,
        responseType: 'blob',
      });
      const url = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement('a');
      link.href = url;
      const data = new Date().toISOString().slice(0, 10);
      link.setAttribute('download', `${entradaSelecionada.tipo}-${data}.xlsx`);
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
    } catch (err) {
      toast.error(err.response?.data?.error || 'Erro ao exportar relatório');
    } finally {
      setExportando(false);
    }
  };

  // Decisão 1 do cabeçalho: Array.isArray do payload é o proxy de `exportavel`.
  const podeExportar = Array.isArray(dadosRelatorio) && ultimaConsultaParams !== null;
  const limiteDoTipo = entradaSelecionada ? LIMITE_CONHECIDO[entradaSelecionada.tipo] : undefined;
  const atingiuLimite = Array.isArray(dadosRelatorio) && !!limiteDoTipo && dadosRelatorio.length === limiteDoTipo;

  return (
    <div className="almox-page">
      <div className="almox-header">
        <div>
          <h1><FiBarChart2 size={20} /> Relatórios</h1>
          <p>Relatórios do almoxarifado agrupados por categoria, com exportação em XLSX</p>
        </div>
        <div className="almox-header-actions">
          <button className="btn-almox-secondary" onClick={() => setReloadLista((t) => t + 1)}>
            <FiRefreshCw size={13} /> Atualizar lista
          </button>
        </div>
      </div>

      {erroLista ? (
        <PainelErroCarga mensagem={erroLista.mensagem} onTentarNovamente={() => setReloadLista((t) => t + 1)} />
      ) : loadingLista ? (
        <SkeletonTable rows={6} columns={3} />
      ) : (
        <div style={{ display: 'flex', gap: 28, alignItems: 'flex-start', flexWrap: 'wrap' }}>
          <nav aria-label="Categorias de relatórios" style={{ minWidth: 240 }}>
            {categorias.length === 0 && (
              <div className="almox-empty"><p>Nenhum relatório disponível</p></div>
            )}
            {categorias.map(([categoria, itens]) => (
              <div key={categoria} style={{ marginBottom: 18 }}>
                <div className="almox-section-title">{categoria}</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                  {itens.map((r) => (
                    <button
                      key={r.tipo}
                      type="button"
                      data-testid={`menu-relatorio-${r.tipo}`}
                      className={tipoSelecionado === r.tipo ? 'btn-almox-primary' : 'btn-almox-secondary'}
                      style={{ textAlign: 'left', justifyContent: 'flex-start' }}
                      onClick={() => selecionarRelatorio(r.tipo)}
                    >
                      {r.titulo}
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </nav>

          <div style={{ flex: 1, minWidth: 320 }}>
            {!entradaSelecionada ? (
              <div className="almox-empty"><p>Selecione um relatório à esquerda</p></div>
            ) : (
              <>
                <h2 style={{ marginTop: 0 }}>{entradaSelecionada.titulo}</h2>

                {(entradaSelecionada.params || []).length > 0 && (
                  <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', margin: '12px 0' }}>
                    {entradaSelecionada.params.map((p) => (
                      <div key={p.nome} style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                        <label htmlFor={`param-${p.nome}`} style={{ fontSize: '0.8rem' }}>
                          {p.rotulo}{p.obrigatorio ? ' *' : ''}
                        </label>
                        <input
                          id={`param-${p.nome}`}
                          type={p.tipo === 'date' ? 'date' : p.tipo === 'number' ? 'number' : 'text'}
                          className="almox-select"
                          value={valoresParams[p.nome] ?? ''}
                          onChange={(e) => setValoresParams((s) => ({ ...s, [p.nome]: e.target.value }))}
                        />
                      </div>
                    ))}
                  </div>
                )}

                {avisoObrigatorios && (
                  <div
                    data-testid="aviso-obrigatorios"
                    style={{
                      marginBottom: 12, padding: '8px 12px', borderRadius: 8,
                      border: '1px solid rgba(239, 68, 68, 0.35)', background: 'rgba(239, 68, 68, 0.08)',
                      fontSize: '0.82rem',
                    }}
                  >
                    Preencha os campos obrigatórios: {avisoObrigatorios.join(', ')}
                  </div>
                )}

                <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
                  <button className="btn-almox-primary" disabled={loadingConsulta} onClick={handleConsultar}>
                    {loadingConsulta ? 'Consultando...' : 'Consultar'}
                  </button>
                  {podeExportar && (
                    <button className="btn-almox-secondary" disabled={exportando} onClick={handleExportar}>
                      <FiDownload size={13} /> {exportando ? 'Exportando...' : 'Exportar XLSX'}
                    </button>
                  )}
                </div>

                {erroConsulta ? (
                  <PainelErroCarga mensagem={erroConsulta.mensagem} onTentarNovamente={handleConsultar} />
                ) : loadingConsulta ? (
                  <SkeletonTable rows={6} columns={5} />
                ) : dadosRelatorio !== null ? (
                  <>
                    {Array.isArray(dadosRelatorio) ? (
                      <TabelaGenerica linhas={dadosRelatorio} />
                    ) : (
                      <SecoesObjeto dados={dadosRelatorio} />
                    )}
                    {atingiuLimite && (
                      <p data-testid="aviso-limite" style={{ fontSize: '0.78rem', color: 'var(--gmp-text-light)', margin: '8px 0' }}>
                        Mostrando os primeiros {limiteDoTipo} registros.
                      </p>
                    )}
                  </>
                ) : null}
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default RelatoriosAlmoxarifado;
