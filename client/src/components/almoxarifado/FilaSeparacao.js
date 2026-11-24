import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { FiRefreshCw, FiAlertTriangle, FiInbox, FiExternalLink, FiPrinter } from 'react-icons/fi';
import api from '../../services/api';
import AlmoxPageHeader from './AlmoxPageHeader';
import { formatarErroPermissao } from '../../utils/permissaoErro';
import {
  fmtQtd, fmtData, textoPegarEm, textoAvisoPegarEm, textoAlertaPegarEm,
} from '../../utils/coletaTexto';
// Etapa 189 (T3): a lista de coleta impressa, gerada no navegador com o JSON da fila já carregado (RN-189.13, B1267).
import {
  gerarListaColetaPDF, podeImprimirListaColeta, requisicoesParaImprimir, nomeArquivoListaColeta, nomeArquivoListaColetaFila,
} from '../../utils/listaColetaPdf';
// Etapa 255 (RN-255.03..09): os filtros por setor, projeto e localização — só escondem, na ordem do servidor.
import {
  TODOS, FILTROS_VAZIOS, passaNosFiltros, filtroAtivo, opcoesDosFiltros, lerFiltrosGuardados, guardarFiltros, rotuloProjeto,
  // Etapa 260 (RN-260.07..09): agrupar por setor ou por projeto
  AGRUPAR_NADA, AGRUPAR_SETOR, AGRUPAR_PROJETO, agruparFila, rotulosDosProjetos, lerAgruparGuardado, guardarAgrupar,
} from '../../utils/filtrosFilaSeparacao';
import './Almoxarifado.css';

/**
 * Etapa 64 (RN-04): a fila de separação do almoxarife — só leitura.
 *
 * Consome `GET /almoxarifado/fila-separacao` (gate `separar_emitir`, contrato congelado no plano
 * da etapa). Pontos que a tela NÃO pode errar:
 *
 * - A ORDEM é do servidor (acionável primeiro; urgência; data de necessidade; FIFO). A tela não
 *   reordena — só separa visualmente as não acionáveis num grupo "Aguardando", preservando a
 *   ordem relativa de cada grupo.
 * - Uma requisição pode ter várias etapas ao mesmo tempo (`etapas: []`): um chip por etapa.
 * - Quem separou não confere (`posso_conferir === false`): o chip "Conferir" diz isso, senão o
 *   almoxarife clica e toma 403 na conferência.
 * - 403 vira painel de permissão, nunca "fila vazia" — fila vazia é afirmação de que não há
 *   trabalho, e a resposta errada mais enganosa aqui.
 * - "Abrir" leva à tela de requisições de sempre (`?id=`), que abre o detalhe — a fila não tem
 *   regra nova de separar/entregar.
 */

const ETAPA_INFO = {
  SEPARAR: { label: 'Separar', cls: 'aberto' },
  APROVACAO_VALOR: { label: 'Aguardando aprovação de valor', cls: 'baixo' },
  AGUARDANDO_SALDO: { label: 'Aguardando saldo', cls: 'zerado' },
  CONFERIR: { label: 'Conferir', cls: 'devolucao' },
  REABRIR_SEPARACAO: { label: 'Separar de novo para conferir', cls: 'estorno' },
  // Etapa 94 (B460): legado com tudo separado num status pré-separação — "Iniciar Separação" sem quantidade.
  RETOMAR_SEPARACAO: { label: 'Reabrir separação', cls: 'estorno' },
  ENTREGAR: { label: 'Entregar', cls: 'ok' },
  // Fase 5: conferência pendente numa requisição já PRONTA_PARA_RETIRADA, que não pode voltar
  // à separação — não acionável, só o administrador resolve.
  CONFERENCIA_SEM_SAIDA: { label: 'Conferência pendente — peça ao administrador', cls: 'zerado' },
};

const URGENCIA_INFO = {
  CRITICO: { label: 'Crítico', cls: 'critico' },
  URGENTE: { label: 'Urgente', cls: 'baixo' },
  NORMAL: { label: 'Normal', cls: 'zerado' },
};

export const rotuloEtapa = (etapa, req) => {
  const info = ETAPA_INFO[etapa];
  const base = info ? info.label : etapa;
  if (
    etapa === 'CONFERIR'
    && req.posso_conferir === false
    && req.conferencia_pendente
    && req.status === 'EM_SEPARACAO'
  ) {
    return `${base} — você separou, peça a outra pessoa`;
  }
  return base;
};

const descricaoItem = (it) => {
  const un = it.unidade ? ` ${it.unidade}` : '';
  const partes = [];
  if (Number(it.a_separar) > 0) {
    partes.push(`a separar ${fmtQtd(it.a_separar)}${un} (separável agora ${fmtQtd(it.separavel)})`);
  }
  if (Number(it.a_entregar) > 0) {
    // `entregavel` = o separado limitado ao disponível (Fase 5): é o que sai agora.
    partes.push(`a entregar ${fmtQtd(it.a_entregar)}${un} (entregável agora ${fmtQtd(it.entregavel)})`);
  }
  partes.push(`disponível ${fmtQtd(it.disponivel)}`);
  // Etapa 227 (B1502, RN-227.10): o que está em lote bloqueado, reprovado ou vencido — um pedaço à parte, não "disponível 2 (6 …)": o
  // impedido não desconta o reservado e pode passar do disponível (C531; Fase 2 I1). Sem o campo, 0 ou negativo: o texto de antes.
  if (Number(it.lote_impedido) > 0) partes.push(`${fmtQtd(it.lote_impedido)} em lote impedido`);
  if (it.origem_separacao_codigo) {
    partes.push(`separado de ${it.origem_separacao_codigo}${it.lote_separacao_codigo ? ` — ${it.lote_separacao_codigo}` : ''}`);
  }
  return partes.join(' · ');
};

// Etapa 189 (B1268): as frases da dica moram em utils/coletaTexto.js (a lista de coleta impressa usa as mesmas); re-exportadas aqui
// com os nomes da 188.
export { textoPegarEm, textoAvisoPegarEm, textoAlertaPegarEm };

const PainelErro = ({ titulo, mensagem, onTentarNovamente, testid }) => (
  <div
    data-testid={testid}
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
        <strong style={{ display: 'block', marginBottom: 4 }}>{titulo}</strong>
        {mensagem && <span style={{ fontSize: '0.9rem', color: 'var(--gmp-text-light)' }}>{mensagem}</span>}
      </div>
    </div>
    {onTentarNovamente && (
      <button type="button" className="btn-almox-secondary" onClick={onTentarNovamente}>
        <FiRefreshCw size={13} /> Tentar novamente
      </button>
    )}
  </div>
);

const LinhaFila = ({ req, onAbrir, onImprimir }) => {
  const urg = URGENCIA_INFO[String(req.urgencia || '').toUpperCase()] || URGENCIA_INFO.NORMAL;
  const data = fmtData(req.data_necessidade);
  const separadores = (req.separadores || []).map((s) => s.nome).filter(Boolean);
  const solicitante = [req.solicitante_nome, req.setor].filter(Boolean).join(' · ');
  return (
    <li
      className="almox-card"
      data-testid={`fila-req-${req.id}`}
      style={{
        listStyle: 'none',
        padding: '12px 16px',
        marginBottom: 10,
        borderRadius: 10,
        border: '1px solid var(--gmp-border, rgba(0,0,0,0.1))',
        background: 'var(--gmp-surface, transparent)',
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', alignItems: 'flex-start' }}>
        <div style={{ minWidth: 0 }}>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            <strong data-testid="fila-numero">{req.numero || `#${req.id}`}</strong>
            <span className={`almox-badge almox-badge-${urg.cls}`} data-testid="fila-urgencia">{urg.label}</span>
            <span style={{ fontSize: '0.85rem', color: 'var(--gmp-text-light)' }}>
              {data ? `Necessário em ${data}` : 'Sem data de necessidade'}
            </span>
          </div>
          {solicitante && (
            <div style={{ fontSize: '0.85rem', color: 'var(--gmp-text-light)', marginTop: 4 }}>{solicitante}</div>
          )}
          {req.projeto_id != null && (
            <div style={{ fontSize: '0.85rem', color: 'var(--gmp-text-light)', marginTop: 2 }} data-testid={`fila-projeto-${req.id}`}>
              {req.projeto_nome ? `Projeto: ${req.projeto_nome}` : rotuloProjeto(req.projeto_id, null)}
            </div>
          )}
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 8 }}>
            {(req.etapas || []).map((etapa) => (
              <span
                key={etapa}
                className={`almox-badge almox-badge-${(ETAPA_INFO[etapa] || {}).cls || 'ajuste'}`}
                data-testid={`fila-etapa-${etapa}`}
              >
                {rotuloEtapa(etapa, req)}
              </span>
            ))}
          </div>
          {separadores.length > 0 && (
            <div style={{ fontSize: '0.85rem', marginTop: 6 }} data-testid="fila-separadores">
              Separado por: {separadores.join(', ')}
            </div>
          )}
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {podeImprimirListaColeta(req) && (
            <button type="button" className="btn-almox-secondary" onClick={() => onImprimir(req)} data-testid={`fila-imprimir-${req.id}`}>
              <FiPrinter size={13} /> Imprimir lista de coleta
            </button>
          )}
          <button type="button" className="btn-almox-primary" onClick={() => onAbrir(req.id)} data-testid={`fila-abrir-${req.id}`}>
            <FiExternalLink size={13} /> Abrir
          </button>
        </div>
      </div>
      {(req.itens || []).length > 0 && (
        <ul style={{ margin: '10px 0 0', paddingLeft: 18, fontSize: '0.88rem' }}>
          {req.itens.map((it) => {
            const pegarEm = textoPegarEm(it);
            const aviso = textoAvisoPegarEm(it);
            const alerta = textoAlertaPegarEm(it);
            return (
              <li key={it.item_id} data-testid={`fila-item-${it.item_id}`}>
                <strong>{it.material_codigo}</strong> — {it.material_nome}: {descricaoItem(it)}
                {pegarEm && (
                  <div data-testid={`fila-pegar-em-${it.item_id}`} style={{ marginTop: 2 }}>{pegarEm}</div>
                )}
                {alerta && (
                  <div
                    data-testid={`fila-pegar-em-alerta-${it.item_id}`}
                    style={{ marginTop: 2, color: 'var(--gmp-warning, #b45309)' }}
                  >
                    {alerta}
                  </div>
                )}
                {aviso && (
                  <div
                    data-testid={`fila-pegar-em-aviso-${it.item_id}`}
                    style={{ marginTop: 2, color: 'var(--gmp-text-light)' }}
                  >
                    {aviso}
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
      {Array.isArray(req.ordem_coleta) && req.ordem_coleta.length >= 2 && (
        <div data-testid={`fila-ordem-coleta-${req.id}`} style={{ marginTop: 10, fontSize: '0.88rem' }}>
          <strong>Ordem de coleta</strong>
          <ol style={{ margin: '4px 0 0', paddingLeft: 22 }}>
            {req.ordem_coleta.map((p) => (
              <li key={p.item_id}>
                {`${p.caminho} — ${p.material_codigo} · ${fmtQtd(p.quantidade_sugerida)}${p.lote_codigo ? ` — lote ${p.lote_codigo}` : ''}`}
              </li>
            ))}
          </ol>
        </div>
      )}
    </li>
  );
};

// Etapa 255 (RN-255.03): a barra dos filtros — um <select> por filtro, opções da fila carregada.
const SeletorFiltro = ({ rotulo, valor, opcoes, onChange, testid }) => (
  <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: '0.85rem', minWidth: 180, flex: '1 1 180px' }}>
    {rotulo}
    <select value={valor} onChange={(e) => onChange(e.target.value)} data-testid={testid} className="almox-form-select">
      <option value={TODOS}>Todos</option>
      {opcoes.map((o) => <option key={o.valor} value={o.valor}>{o.rotulo}</option>)}
    </select>
  </label>
);

// Etapa 260 (RN-260.08): os blocos de um grupo — sem agrupar, um bloco só, sem título (a tela de antes).
const Blocos = ({ blocos, grupo, onAbrir, onImprimir }) => blocos.map((b, i) => (
  <div key={b.chave || 'todos'} data-testid={b.titulo ? `fila-bloco-${grupo}-${i}` : undefined} style={b.titulo ? { marginTop: i ? 14 : 0 } : undefined}>
    {b.titulo && (
      <h3 data-testid={`fila-bloco-titulo-${grupo}-${i}`} style={{ fontSize: '0.95rem', margin: '0 0 8px', color: 'var(--gmp-text)' }}>{b.titulo}</h3>
    )}
    <ul style={{ padding: 0, margin: 0 }}>
      {b.requisicoes.map((r) => <LinhaFila key={r.id} req={r} onAbrir={onAbrir} onImprimir={onImprimir} />)}
    </ul>
  </div>
));

const FilaSeparacao = () => {
  const navigate = useNavigate();
  const [fila, setFila] = useState([]);
  // Etapa 255 (RN-255.09): as escolhas sobrevivem ao Atualizar (estado) e ao Abrir e voltar (navegador, em try/catch).
  const [filtros, setFiltros] = useState(lerFiltrosGuardados);
  useEffect(() => { guardarFiltros(filtros); }, [filtros]);
  const mudarFiltro = (campo) => (valor) => setFiltros((f) => ({ ...f, [campo]: valor }));
  const limparFiltros = () => setFiltros({ ...FILTROS_VAZIOS });
  // Etapa 260 (RN-260.07): Agrupar não é filtro — guardado à parte, e Limpar filtros não mexe nele.
  const [agrupar, setAgrupar] = useState(lerAgruparGuardado);
  useEffect(() => { guardarAgrupar(agrupar); }, [agrupar]);
  const [loading, setLoading] = useState(true);
  const [semPermissao, setSemPermissao] = useState(null); // null | { detalhe }
  const [erro, setErro] = useState(null);
  // Etapa 189 (RN-189.13, B1267): o momento da última carga com sucesso — o papel diz "Fila carregada em …".
  const [carregadaEm, setCarregadaEm] = useState(null);

  const carregar = useCallback(async () => {
    setLoading(true);
    setErro(null);
    setSemPermissao(null);
    try {
      const res = await api.get('/almoxarifado/fila-separacao');
      setFila(Array.isArray(res.data) ? res.data : []);
      setCarregadaEm(new Date());
    } catch (err) {
      setFila([]);
      const status = err.response?.status;
      if (status === 403) {
        setSemPermissao({ detalhe: formatarErroPermissao(err.response?.data) });
      } else if (!err.response) {
        setErro('Não foi possível conectar ao servidor.');
      } else {
        setErro(err.response?.data?.error || 'Não foi possível carregar a fila de separação.');
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    carregar();
  }, [carregar]);

  const abrir = (id) => navigate(`/almoxarifado/requisicoes?id=${id}`);
  // Etapa 189 (RN-189.10/11): o papel sai do JSON já na tela — nenhuma chamada ao servidor.
  const imprimir = (req) => gerarListaColetaPDF({
    requisicoes: [req], carregadaEm, nomeArquivo: nomeArquivoListaColeta(req.numero || req.id),
  });
  // Etapa 255 (RN-255.05/07): o que passa nos filtros, na ordem do servidor; a lista de coleta de todas imprime só o visível.
  const visiveis = fila.filter((r) => passaNosFiltros(r, filtros));
  const opcoes = opcoesDosFiltros(fila, filtros);
  const comFiltro = filtroAtivo(filtros);
  // Filtra preservando a ordem do servidor dentro de cada grupo; com Agrupar, cada grupo vira blocos (RN-260.08).
  const rotulos = rotulosDosProjetos(fila);
  const blocosAcionaveis = agruparFila(visiveis.filter((r) => r.acionavel !== false), agrupar, rotulos);
  const blocosAguardando = agruparFila(visiveis.filter((r) => r.acionavel === false), agrupar, rotulos);
  // RN-260.09: a lista de coleta de todas na ordem da tela — os blocos dos acionáveis, depois os do Aguardando.
  const naOrdemDaTela = [...blocosAcionaveis, ...blocosAguardando].flatMap((b) => b.requisicoes);
  const imprimiveis = requisicoesParaImprimir(naOrdemDaTela);
  const imprimirTodas = () => {
    if (!imprimiveis.length) return;
    gerarListaColetaPDF({ requisicoes: imprimiveis, carregadaEm, nomeArquivo: nomeArquivoListaColetaFila(carregadaEm) });
  };


  return (
    <div className="almox-page">
      <AlmoxPageHeader
        title="Fila de separação"
        subtitle="O que separar, conferir e entregar agora — na ordem de urgência, necessidade e chegada."
        breadcrumbs={[{ label: 'Fila de separação' }]}
        actions={(
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <button
              type="button"
              className="btn-almox-secondary"
              onClick={imprimirTodas}
              disabled={loading || imprimiveis.length === 0}
              data-testid="fila-imprimir-todas"
            >
              <FiPrinter size={13} /> Imprimir lista de coleta (todas)
            </button>
            <button type="button" className="btn-almox-secondary" onClick={carregar} disabled={loading} data-testid="fila-atualizar">
              <FiRefreshCw size={13} /> Atualizar
            </button>
          </div>
        )}
      />

      {semPermissao ? (
        <PainelErro
          testid="fila-sem-permissao"
          titulo="Você não tem permissão para a fila de separação."
          mensagem={semPermissao.detalhe}
        />
      ) : erro ? (
        <PainelErro testid="fila-erro" titulo="Não foi possível carregar a fila" mensagem={erro} onTentarNovamente={carregar} />
      ) : loading && fila.length === 0 ? (
        <p data-testid="fila-carregando">Carregando…</p>
      ) : fila.length === 0 ? (
        <div className="almox-empty" data-testid="fila-vazia">
          <FiInbox size={28} />
          <p>Nada para separar ou entregar agora.</p>
        </div>
      ) : (
        <>
          <div
            data-testid="fila-filtros"
            style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'flex-end', marginBottom: 12 }}
          >
            <SeletorFiltro rotulo="Setor" valor={filtros.setor} opcoes={opcoes.setor} onChange={mudarFiltro('setor')} testid="fila-filtro-setor" />
            <SeletorFiltro
              rotulo="Projeto" valor={filtros.projeto} opcoes={opcoes.projeto} onChange={mudarFiltro('projeto')} testid="fila-filtro-projeto"
            />
            <SeletorFiltro
              rotulo="Localização" valor={filtros.local} opcoes={opcoes.local} onChange={mudarFiltro('local')} testid="fila-filtro-local"
            />
            <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: '0.85rem', minWidth: 160, flex: '0 1 180px' }}>
              Agrupar
              <select value={agrupar} onChange={(e) => setAgrupar(e.target.value)} data-testid="fila-agrupar" className="almox-form-select">
                <option value={AGRUPAR_NADA}>Sem agrupar</option>
                <option value={AGRUPAR_SETOR}>Por setor</option>
                <option value={AGRUPAR_PROJETO}>Por projeto</option>
              </select>
            </label>
            {comFiltro && (
              <button type="button" className="btn-almox-secondary" onClick={limparFiltros} data-testid="fila-limpar-filtros">
                Limpar filtros
              </button>
            )}
          </div>
          {comFiltro && visiveis.length > 0 && (
            <p data-testid="fila-contagem" style={{ fontSize: '0.85rem', color: 'var(--gmp-text-light)', margin: '0 0 10px' }}>
              {`Mostrando ${visiveis.length} de ${fila.length} requisições.`}
            </p>
          )}
          {visiveis.length === 0 && (
            <div className="almox-empty" data-testid="fila-filtro-vazio">
              <FiInbox size={28} />
              <p>Nenhuma requisição da fila com estes filtros.</p>
            </div>
          )}
          {blocosAcionaveis.length > 0 && (
            <div data-testid="fila-acionaveis">
              <Blocos blocos={blocosAcionaveis} grupo="acionaveis" onAbrir={abrir} onImprimir={imprimir} />
            </div>
          )}
          {blocosAguardando.length > 0 && (
            <section style={{ marginTop: 20 }} data-testid="fila-aguardando">
              <h2 style={{ fontSize: '1rem', marginBottom: 8 }}>Aguardando</h2>
              <Blocos blocos={blocosAguardando} grupo="aguardando" onAbrir={abrir} onImprimir={imprimir} />
            </section>
          )}
        </>
      )}
    </div>
  );
};

export default FilaSeparacao;
