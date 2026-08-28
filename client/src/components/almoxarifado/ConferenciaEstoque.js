import React, { useState, useEffect } from 'react';
import api from '../../services/api';
import { toast } from 'react-toastify';
import { FiPlus, FiRefreshCw, FiCheckCircle, FiXCircle, FiEye, FiClipboard } from 'react-icons/fi';
import { SkeletonTable } from '../SkeletonLoader';
import { prefixarAlmoxarifado } from '../../utils/localizacaoLabel';
import { useAlmoxPermissoes } from '../../hooks/useAlmoxPermissoes';
import './Almoxarifado.css';

const CATEGORIAS = [
  '', 'CONSUMÍVEL', 'FERRAMENTA', 'EPI', 'ELÉTRICO', 'HIDRÁULICO',
  'MECÂNICO', 'INSUMO', 'EMBALAGEM', 'ESCRITÓRIO', 'LIMPEZA', 'OUTROS'
];

// Fallback final do servidor (routes/almoxarifado.js, toleranciaEfetiva) quando a config nem
// existe — usado só se a leitura de /almoxarifado/configuracoes falhar ou a chave não estiver
// setada. Achado da revisão da Task 3: o placeholder ORIGINAL usava sempre este valor fixo,
// alegando que não existia endpoint de leitura — falso, GET /almoxarifado/configuracoes já
// existe e já é consumido por ConfiguracoesAlmoxarifado.js. Corrigido para ler a config real.
const TOLERANCIA_DEFAULT_PLACEHOLDER = '2';

const formatMoeda = (v) => Number(v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

const ConferenciaEstoque = () => {
  const { bloquearSeNaoPode } = useAlmoxPermissoes();
  const [conferencias, setConferencias] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [criarCategoria, setCriarCategoria] = useState('');
  const [criarObs, setCriarObs] = useState('');
  const [criarModoCego, setCriarModoCego] = useState(false);
  const [criarTolerancia, setCriarTolerancia] = useState('');
  const [creating, setCreating] = useState(false);
  const [toleranciaPlaceholder, setToleranciaPlaceholder] = useState(TOLERANCIA_DEFAULT_PLACEHOLDER);
  // Etapa 10b (Task 4): escopo combinável (RN-01/02) e dupla contagem (RN-03) na criação.
  const [criarFamilia, setCriarFamilia] = useState('');
  const [criarClasseAbc, setCriarClasseAbc] = useState('');
  const [criarCriticos, setCriarCriticos] = useState(false);
  const [criarDeClientes, setCriarDeClientes] = useState(false);
  const [criarEmTerceiros, setCriarEmTerceiros] = useState(false);
  const [criarDuplaContagem, setCriarDuplaContagem] = useState(false);
  const [familias, setFamilias] = useState([]);
  // Etapa 10b (Task 4): visão Acuracidade (RN-06), modal separado por cima da lista.
  const [mostrarAcuracidade, setMostrarAcuracidade] = useState(false);
  const [loadingAcuracidade, setLoadingAcuracidade] = useState(false);
  const [relatorioAcuracidade, setRelatorioAcuracidade] = useState(null);

  const [confAberta, setConfAberta] = useState(null);
  const [loadingConf, setLoadingConf] = useState(false);
  const [salvando, setSalvando] = useState(false);
  const [contagens, setContagens] = useState({});
  // Só campo DIGITADO nesta sessão pode disparar PUT (Critical da revisão final: com o input
  // pré-preenchido, tabular pelo grid re-salvava o valor e certificava "recontagem" sem
  // contagem nenhuma — e dava um toast de erro por linha para o primeiro contador).
  const [contagensSujas, setContagensSujas] = useState({});
  const [aplicarAjustes, setAplicarAjustes] = useState(true);
  const [showConcluirModal, setShowConcluirModal] = useState(false);
  const [justificativaAjuste, setJustificativaAjuste] = useState('');
  // Etapa 18 (RN-03): cancelar deixou de ser um window.confirm e virou modal com motivo —
  // guarda a conferência inteira (id + numero) porque o cabeçalho do modal mostra o número.
  const [confParaCancelar, setConfParaCancelar] = useState(null);
  const [motivoCancelamento, setMotivoCancelamento] = useState('');
  const [cancelando, setCancelando] = useState(false);

  useEffect(() => {
    loadConferencias();
    loadToleranciaConfigurada();
    loadFamilias();
  }, []);

  // Mesma fonte que MaterialAlmoxarifadoForm.js:153 usa para o select de família — falha
  // silenciosa de propósito: sem famílias o select de escopo fica só com "Todas", a criação
  // continua funcionando sem esse filtro.
  const loadFamilias = async () => {
    try {
      const res = await api.get('/almoxarifado/familias');
      setFamilias(res.data || []);
    } catch {
      setFamilias([]);
    }
  };

  // GET /almoxarifado/configuracoes devolve um MAPA { chave: { valor, descricao, id } } (mesmo
  // contrato que ConfiguracoesAlmoxarifado.js já consome) — a chave que importa aqui é
  // tolerancia_inventario_percentual (routes/almoxarifado.js, toleranciaEfetiva). Falha silenciosa
  // de propósito: se a leitura falhar, o placeholder cai para o fallback fixo — o valor REAL que
  // vale sempre é o que o backend calcula na criação, o placeholder é só uma dica visual.
  const loadToleranciaConfigurada = async () => {
    try {
      const res = await api.get('/almoxarifado/configuracoes');
      const info = res.data?.tolerancia_inventario_percentual;
      const valor = info && typeof info === 'object' ? info.valor : info;
      if (valor !== undefined && valor !== null && valor !== '' && Number.isFinite(parseFloat(valor))) {
        setToleranciaPlaceholder(String(parseFloat(valor)));
      }
    } catch { /* mantém o fallback TOLERANCIA_DEFAULT_PLACEHOLDER */ }
  };

  const loadConferencias = async () => {
    setLoading(true);
    try {
      const res = await api.get('/almoxarifado/conferencias');
      setConferencias(res.data);
    } catch {
      toast.error('Erro ao carregar conferências');
    } finally {
      setLoading(false);
    }
  };

  const handleCriar = async (e) => {
    e.preventDefault();
    setCreating(true);
    try {
      // RN-01: tolerancia_percentual so vai no payload quando o usuario preencheu algo — vazio
      // significa "deixa o servidor decidir o default" (config ou 2), nunca "manda 0" por engano.
      const res = await api.post('/almoxarifado/conferencias', {
        observacoes: criarObs,
        categoria: criarCategoria || undefined,
        modo_cego: criarModoCego,
        tolerancia_percentual: criarTolerancia !== '' ? parseFloat(criarTolerancia) : undefined,
        // RN-01/02/03: escopo combinável e dupla contagem — só entram no body quando
        // preenchidos (booleans true, ids não vazios); undefined some no JSON enviado.
        familia_id: criarFamilia !== '' ? parseInt(criarFamilia, 10) : undefined,
        classe_abc: criarClasseAbc || undefined,
        apenas_criticos: criarCriticos || undefined,
        apenas_de_clientes: criarDeClientes || undefined,
        apenas_em_terceiros: criarEmTerceiros || undefined,
        dupla_contagem: criarDuplaContagem || undefined
      });
      toast.success(`Conferência ${res.data.numero} criada com ${res.data.totalItens} itens`);
      setShowCreateModal(false);
      setCriarObs('');
      setCriarCategoria('');
      setCriarModoCego(false);
      setCriarTolerancia('');
      setCriarFamilia('');
      setCriarClasseAbc('');
      setCriarCriticos(false);
      setCriarDeClientes(false);
      setCriarEmTerceiros(false);
      setCriarDuplaContagem(false);
      loadConferencias();
      abrirConferencia(res.data.id);
    } catch (err) {
      toast.error(err.response?.data?.error || 'Erro ao criar conferência');
    } finally {
      setCreating(false);
    }
  };

  const abrirConferencia = async (id) => {
    setLoadingConf(true);
    try {
      const res = await api.get(`/almoxarifado/conferencias/${id}`);
      setConfAberta(res.data);
      const initContagens = {};
      res.data.itens.forEach(item => {
        // Etapa 10b (amendo Task 2): em modo_cego + dupla_contagem o servidor pode OMITIR
        // quantidade_contada (undefined, campo nem veio) para quem não é o último autor — usar
        // `!= null` (cobre null E undefined) evita a string literal "undefined" no input.
        initContagens[item.id] = item.quantidade_contada != null ? String(item.quantidade_contada) : '';
      });
      setContagens(initContagens);
      setContagensSujas({});
    } catch {
      toast.error('Erro ao abrir conferência');
    } finally {
      setLoadingConf(false);
    }
  };

  const handleSalvarContagem = async (itemId) => {
    const val = contagens[itemId];
    // Sem digitação nesta sessão, o blur não salva nada — quem quer recontar confirmando o
    // mesmo número digita o número (é a contagem dele); tabular não é contar.
    if (!contagensSujas[itemId]) return;
    if (val === '' || val === undefined) return;
    try {
      await api.put(`/almoxarifado/conferencias/${confAberta.id}/item/${itemId}`, {
        quantidade_contada: parseFloat(val)
      });
      setContagensSujas(s => ({ ...s, [itemId]: false }));
      // Achado da revisão final de branch: recontagem_necessaria é calculada no servidor
      // (RN-02/RN-05) e só chegava na tela na hora de ABRIR a conferência — quem contava um
      // item nunca via o badge atualizar na mesma sessão, e só descobria a recontagem exigida
      // no 400 da conclusão. Re-busca a conferência SEM acionar o loading de tela cheia (troca
      // só o objeto, sem `setLoadingConf`) para o badge da linha recém-contada atualizar aqui.
      const res = await api.get(`/almoxarifado/conferencias/${confAberta.id}`);
      setConfAberta(res.data);
    } catch (err) {
      // RN-03 (dupla contagem) e RN-08 (contagem inválida) chegam prontas do servidor — exibir
      // o texto literal, sem parafrasear (mesmo padrão do handleConcluir). E o valor recusado
      // não fica na tela alimentando a coluna Divergência: volta ao que está salvo.
      toast.error(err.response?.data?.error || 'Erro ao salvar contagem');
      const original = confAberta?.itens?.find(i => i.id === itemId);
      setContagens(c => ({
        ...c,
        [itemId]: original && original.quantidade_contada != null ? String(original.quantidade_contada) : '',
      }));
      setContagensSujas(s => ({ ...s, [itemId]: false }));
    }
  };

  const handleConcluir = async () => {
    setSalvando(true);
    try {
      const payload = { aplicar_ajustes: aplicarAjustes };
      // RN-06b: justificativa_ajuste so faz sentido (e so e exigida pelo servidor) quando
      // aplicar_ajustes vai true — sem ajuste, nao manda o campo.
      if (aplicarAjustes) payload.justificativa_ajuste = justificativaAjuste;
      const res = await api.put(`/almoxarifado/conferencias/${confAberta.id}/concluir`, payload);
      // D8: impactoFinanceiro e a soma dos valores ABSOLUTOS por item ajustado (nao um
      // liquido/saldo) — so mostra quando teve ajuste de verdade aplicado.
      // RN-05 (Etapa 10b): concluir SEM aplicar ajustes agora também calcula o impacto (o que
      // o inventário encontrou de divergência) — sem citar o valor aqui, o número só aparece
      // pra quem abrir a visão Acuracidade depois. Ajustes aplicados continua tendo prioridade.
      let mensagem;
      if (res.data.ajustesAplicados > 0) {
        mensagem = `Conferência concluída! Ajustes aplicados: ${res.data.ajustesAplicados} — impacto financeiro: ${formatMoeda(res.data.impactoFinanceiro)}`;
      } else if (res.data.impactoFinanceiro > 0) {
        mensagem = `Conferência concluída! ${res.data.ajustesAplicados} ajustes aplicados — divergências encontradas: ${formatMoeda(res.data.impactoFinanceiro)} (nenhum ajuste aplicado)`;
      } else {
        mensagem = `Conferência concluída! ${res.data.ajustesAplicados} ajustes aplicados.`;
      }
      toast.success(mensagem);
      setShowConcluirModal(false);
      setJustificativaAjuste('');
      setConfAberta(null);
      loadConferencias();
    } catch (err) {
      // RN-07: 403 (material de cliente sem ajustar_material_cliente) e 400 (recontagem RN-05 ou
      // retencao RN-06) sao dois motivos DISTINTOS, com mensagens e prioridade diferentes no
      // servidor — tratados aqui em ramos separados, nunca um catch generico que ignora qual foi
      // o motivo. Em ambos, a mensagem do servidor chega INTEIRA ao toast (lista completa de
      // itens, nunca so a primeira linha) — nunca reescrita nem cortada aqui.
      const status = err.response?.status;
      const mensagemServidor = err.response?.data?.error;
      if (status === 403) {
        toast.error(mensagemServidor || 'Ajuste bloqueado por permissão em material de cliente');
      } else if (status === 400) {
        toast.error(mensagemServidor || 'Erro ao concluir conferência');
      } else {
        toast.error(mensagemServidor || 'Erro ao concluir conferência');
      }
    } finally {
      setSalvando(false);
    }
  };

  // Etapa 18 (RN-03). Era `window.confirm` + PUT sem corpo: o servidor agora exige `motivo` com
  // 5+ caracteres (routes/almoxarifado.js, C2), entao o fluxo antigo virou 400 garantido — e,
  // antes disso, um inventario com centenas de contagens sumia do fluxo sem autor nem motivo no
  // log. Molde deliberado: o modal de justificativa do ajuste deste mesmo arquivo, que ja tem a
  // regua >= 5 — nao o `confirm`+`prompt` da tela de Reposicao, que so barra vazio e deixaria um
  // motivo de 3 caracteres tomar o 400 do servidor.
  const abrirModalCancelar = (conf) => {
    setConfParaCancelar(conf);
    setMotivoCancelamento('');
  };

  const handleCancelar = async () => {
    if (!confParaCancelar) return;
    setCancelando(true);
    try {
      await api.put(`/almoxarifado/conferencias/${confParaCancelar.id}/cancelar`, {
        motivo: motivoCancelamento.trim(),
      });
      toast.success('Conferência cancelada');
      setConfParaCancelar(null);
      setMotivoCancelamento('');
      loadConferencias();
    } catch (err) {
      // O modal fica ABERTO de proposito na recusa: quem tomou o 400 (status ja mudou, motivo
      // curto) continua vendo o que escreveu em vez de ter de redigitar tudo.
      toast.error(err.response?.data?.error || 'Erro ao cancelar conferência');
    } finally {
      setCancelando(false);
    }
  };

  // RN-06/RN-07: relatório derivado, só CONCLUIDO; quem decide é o requirePermission do
  // servidor — o botão pré-barra com bloquearSeNaoPode('inventario') como os irmãos do
  // arquivo (a UI barra antes do formulário, o backend continua sendo a autoridade).
  const handleAbrirAcuracidade = async () => {
    setMostrarAcuracidade(true);
    setLoadingAcuracidade(true);
    try {
      const res = await api.get('/almoxarifado/conferencias/relatorio-acuracidade');
      setRelatorioAcuracidade(res.data);
    } catch (err) {
      toast.error(err.response?.data?.error || 'Erro ao carregar relatório de acuracidade');
      setMostrarAcuracidade(false);
    } finally {
      setLoadingAcuracidade(false);
    }
  };

  const formatAcuracidade = (v) => (v !== null && v !== undefined ? `${Number(v).toFixed(2)}%` : '—');
  const formatImpacto = (v) => (v !== null && v !== undefined ? formatMoeda(v) : '—');

  const divergenciaItem = (item) => {
    if (contagens[item.id] === '' || contagens[item.id] === undefined) return null;
    // RN-02: contagem cega para quem nao tem ajustar_estoque — o GET omite quantidade_sistema.
    // Sem o dado do servidor a coluna cliente-side nao tem contra o que comparar; nao ha fórmula
    // local nenhuma que reconstrua o que o servidor decidiu esconder de propósito.
    if (item.quantidade_sistema === undefined || item.quantidade_sistema === null) return null;
    return parseFloat(contagens[item.id]) - item.quantidade_sistema;
  };

  const totalDivergencias = () => {
    if (!confAberta) return 0;
    return confAberta.itens.filter(item => {
      const d = divergenciaItem(item);
      // Espelho do EPSILON_DIVERGENCIA do servidor (divergencia.js) — cópia declarada na
      // fronteira HTTP: deriva de float não é divergência aqui também.
      return d !== null && Math.abs(d) > 1e-9;
    }).length;
  };

  const itensContados = () => {
    if (!confAberta) return 0;
    // Conta por AUTORIA, não pelo valor local: em dupla contagem o servidor esconde a
    // contagem do colega — o item está contado mesmo sem valor visível para este leitor
    // (achado da revisão final: o contador mostrava 0/3 para o recontador e REGREDIA de 3/3
    // para 2/3 para a primeira contadora conforme o trabalho avançava).
    return confAberta.itens.filter(item => item.contado_por_id != null
      || item.quantidade_contada != null
      || (contagens[item.id] !== '' && contagens[item.id] !== undefined)).length;
  };

  // Timestamps do SQLite vêm em UTC sem sufixo ("YYYY-MM-DD HH:MM:SS") — sem o ajuste, o V8
  // lê como hora local e a tela mostra 05:25 onde o correto em BRT é 02:25.
  const formatDate = (d) => {
    if (!d) return '—';
    const iso = typeof d === 'string' && d.includes(' ') && !d.includes('T') ? `${d.replace(' ', 'T')}Z` : d;
    return new Date(iso).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' });
  };

  // ── Tela de contagem aberta ──
  if (confAberta) {
    return (
      <div className="almox-page">
        <div className="almox-header">
          <div>
            <h1>Conferência {confAberta.numero}</h1>
            <p>
              {itensContados()} / {confAberta.itens.length} itens contados ·
              <span style={{ color: totalDivergencias() > 0 ? 'var(--gmp-warning)' : 'var(--gmp-success)', marginLeft: 6 }}>
                {totalDivergencias()} divergência{totalDivergencias() !== 1 ? 's' : ''}
              </span>
            </p>
          </div>
          <div className="almox-header-actions">
            <button className="btn-almox-secondary" onClick={() => setConfAberta(null)}>
              ← Voltar à lista
            </button>
            {confAberta.status === 'ABERTO' && (
              <button
                className="btn-almox-primary"
                onClick={(e) => {
                  // com ajuste a rota exige TAMBEM ajustar_estoque (o /concluir grava saldo)
                  if (!bloquearSeNaoPode('inventario', e)) return;
                  if (aplicarAjustes && !bloquearSeNaoPode('ajustar_estoque', e)) return;
                  setJustificativaAjuste('');
                  setShowConcluirModal(true);
                }}
                disabled={salvando}
                title={aplicarAjustes
                  ? 'Fecha a contagem E grava as divergências no saldo dos materiais (exige perfil que pode ajustar estoque)'
                  : 'Fecha a contagem sem alterar saldo nenhum — as divergências ficam apenas registradas'}
              >
                <FiCheckCircle size={14} /> {salvando ? 'Concluindo...' : 'Concluir Conferência'}
              </button>
            )}
          </div>
        </div>

        {confAberta.status === 'ABERTO' && (
          <div style={{ background: 'var(--gmp-surface)', border: '1px solid var(--gmp-border)', borderRadius: 12, padding: '16px 20px', marginBottom: 20, display: 'flex', alignItems: 'center', gap: 16 }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: '0.875rem', color: 'var(--gmp-text)' }}>
              <input type="checkbox" checked={aplicarAjustes} onChange={e => setAplicarAjustes(e.target.checked)} />
              Aplicar ajustes automáticos ao concluir (saldos com divergência serão corrigidos)
            </label>
          </div>
        )}

        <div className="almox-table-container">
          {loadingConf ? <SkeletonTable rows={8} columns={7} /> : (
            <table className="almox-table">
              <thead>
                <tr>
                  <th>Código</th>
                  <th>Material</th>
                  <th>Localização</th>
                  <th>Qtd. Sistema</th>
                  <th>Qtd. Contada</th>
                  <th>Divergência</th>
                  <th>Recontagem</th>
                </tr>
              </thead>
              <tbody>
                {confAberta.itens.map(item => {
                  const diverg = divergenciaItem(item);
                  // RN-02: campo omitido pelo servidor (contagem cega, ABERTO, sem ajustar_estoque).
                  const temQtdSistema = item.quantidade_sistema !== undefined && item.quantidade_sistema !== null;
                  return (
                    <tr key={item.id}>
                      <td style={{ fontFamily: 'monospace', fontSize: '0.8rem', color: 'var(--gmp-text-light)' }}>{item.material_codigo}</td>
                      <td>
                        <div style={{ fontWeight: 600 }}>{item.material_nome}</div>
                        <div style={{ fontSize: '0.75rem', color: 'var(--gmp-text-light)' }}>{item.unidade}</div>
                        {/* RN-04: autoria sempre gravada, com ou sem dupla_contagem — inclusive
                            quando o servidor omite quantidade_contada (modo_cego + dupla_contagem
                            para quem não é o último autor: autoria não é blindada, só o número).
                            Item nunca contado (par todo nulo) não ganha linha "Contado por: —"
                            à toa; item contado antes da etapa (par nulo mas já com contagem)
                            também não tem autoria pra mostrar — sem dado, sem linha. */}
                        {(item.contado_por_nome || item.recontado_por_nome) && (
                          <div style={{ fontSize: '0.72rem', color: 'var(--gmp-text-light)', marginTop: 2 }}>
                            {[item.contado_por_nome && `Contado por: ${item.contado_por_nome}`,
                              item.recontado_por_nome && `Recontado por: ${item.recontado_por_nome}`]
                              .filter(Boolean).join(' · ')}
                          </div>
                        )}
                      </td>
                      <td style={{ fontSize: '0.8rem', color: 'var(--gmp-text-light)' }}>
                        {prefixarAlmoxarifado(item.localizacao, item.almoxarifado_codigo) || '—'}
                      </td>
                      <td style={{ fontWeight: 600 }}>{temQtdSistema ? `${item.quantidade_sistema} ${item.unidade}` : '—'}</td>
                      <td>
                        {confAberta.status === 'ABERTO' ? (
                          <input
                            className="almox-count-input"
                            type="number"
                            min="0"
                            step="1"
                            value={contagens[item.id] || ''}
                            onChange={e => {
                              const valorDigitado = e.target.value;
                              setContagens(c => ({ ...c, [item.id]: valorDigitado }));
                              setContagensSujas(s => ({ ...s, [item.id]: true }));
                            }}
                            onBlur={() => handleSalvarContagem(item.id)}
                            placeholder="—"
                          />
                        ) : (
                          <span>{item.quantidade_contada != null ? `${item.quantidade_contada} ${item.unidade}` : '—'}</span>
                        )}
                      </td>
                      <td>
                        {diverg !== null ? (
                          <span className={`almox-count-divergencia ${diverg < 0 ? 'neg' : diverg > 0 ? 'pos' : 'zero'}`}>
                            {diverg > 0 ? '+' : ''}{diverg.toFixed(2)}
                          </span>
                        ) : <span style={{ color: 'var(--gmp-text-light)' }}>—</span>}
                      </td>
                      <td>
                        {/* RN-02/RN-05: recontagem_necessaria sempre vem calculado do servidor —
                            a tela so exibe, nunca reaplica a fórmula de tolerância aqui. */}
                        {item.recontagem_necessaria ? (
                          <span className="almox-badge almox-badge-baixo">Recontagem necessária</span>
                        ) : null}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>

        {/* Modal concluir */}
        {showConcluirModal && (
          <div className="almox-modal-overlay" onClick={() => setShowConcluirModal(false)}>
            <div className="almox-modal almox-modal-sm" onClick={e => e.stopPropagation()}>
              <div className="almox-modal-header">
                <h2>Concluir Conferência {confAberta.numero}</h2>
                <button className="almox-modal-close" onClick={() => setShowConcluirModal(false)}>✕</button>
              </div>
              <div className="almox-modal-body">
                <p>
                  {aplicarAjustes
                    ? 'Os saldos serão ajustados automaticamente conforme a contagem, passando pelo motor de estoque (movimentação AJUSTE_INVENTARIO).'
                    : 'A contagem será encerrada sem alterar nenhum saldo — as divergências ficam apenas registradas.'}
                </p>
                {aplicarAjustes && (
                  <div className="almox-field" style={{ marginTop: 16 }}>
                    <label className="almox-label">Justificativa do ajuste *</label>
                    <textarea
                      className="almox-textarea"
                      rows={3}
                      value={justificativaAjuste}
                      onChange={e => setJustificativaAjuste(e.target.value)}
                      placeholder="Motivo da divergência e do ajuste aplicado (mínimo 5 caracteres)"
                    />
                  </div>
                )}
              </div>
              <div className="almox-modal-footer">
                <button type="button" className="btn-almox-secondary" onClick={() => setShowConcluirModal(false)}>Cancelar</button>
                <button
                  type="button"
                  className="btn-almox-primary"
                  disabled={salvando || (aplicarAjustes && justificativaAjuste.trim().length < 5)}
                  onClick={handleConcluir}
                >
                  {salvando ? 'Concluindo...' : 'Confirmar'}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }

  // ── Lista de conferências ──
  return (
    <div className="almox-page">
      <div className="almox-header">
        <div>
          <h1>Conferências de Estoque</h1>
          <p>Inventários e contagens físicas</p>
        </div>
        <div className="almox-header-actions">
          <button className="btn-almox-secondary" onClick={loadConferencias}>
            <FiRefreshCw size={13} /> Atualizar
          </button>
          <button
            className="btn-almox-secondary"
            onClick={(e) => { if (!bloquearSeNaoPode('inventario', e)) return; handleAbrirAcuracidade(); }}
            title="Métricas de acurácia derivadas das conferências concluídas (RN-06)"
          >
            Acuracidade
          </button>
          <button
            className="btn-almox-primary"
            onClick={(e) => { if (!bloquearSeNaoPode('inventario', e)) return; setShowCreateModal(true); }}
            title="Abre uma contagem de inventário: congela o saldo atual de cada material para você conferir com o físico"
          >
            <FiPlus size={14} /> Nova Conferência
          </button>
        </div>
      </div>

      <div className="almox-table-container">
        {loading ? <SkeletonTable rows={6} columns={7} /> : conferencias.length === 0 ? (
          <div className="almox-empty">
            <FiClipboard size={48} style={{ opacity: 0.3, display: 'block', margin: '0 auto 12px' }} />
            <p>Nenhuma conferência de estoque encontrada</p>
          </div>
        ) : (
          <table className="almox-table">
            <thead>
              <tr>
                <th>Número</th>
                <th>Status</th>
                <th>Escopo</th>
                <th>Responsável</th>
                <th>Data Início</th>
                <th>Data Fim</th>
                <th>Ações</th>
              </tr>
            </thead>
            <tbody>
              {conferencias.map(c => (
                <tr key={c.id}>
                  <td style={{ fontWeight: 700, fontFamily: 'monospace' }}>{c.numero}</td>
                  <td>
                    <span className={`almox-badge almox-badge-${c.status.toLowerCase()}`}>{c.status}</span>
                  </td>
                  {/* RN-01: escopo_descricao é nulo em conferências criadas antes da etapa. */}
                  <td style={{ fontSize: '0.8rem', color: 'var(--gmp-text-light)' }}>{c.escopo_descricao || '—'}</td>
                  <td style={{ fontSize: '0.875rem' }}>{c.responsavel_nome}</td>
                  <td style={{ fontSize: '0.8rem', color: 'var(--gmp-text-light)' }}>{formatDate(c.data_inicio)}</td>
                  <td style={{ fontSize: '0.8rem', color: 'var(--gmp-text-light)' }}>{formatDate(c.data_fim)}</td>
                  <td>
                    <div className="almox-actions">
                      <button className="almox-btn-icon primary" title="Abrir" onClick={() => abrirConferencia(c.id)}>
                        <FiEye />
                      </button>
                      {c.status === 'ABERTO' && (
                        <button className="almox-btn-icon danger" title="Cancela esta contagem sem alterar saldo nenhum"
                          onClick={(e) => { if (!bloquearSeNaoPode('inventario', e)) return; abrirModalCancelar(c); }}>
                          <FiXCircle />
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Modal cancelar (Etapa 18, RN-03): mesmo molde do modal de concluir — textarea de
          motivo e botão travado até 5 caracteres, a mesma régua que o servidor aplica. */}
      {confParaCancelar && (
        <div className="almox-modal-overlay" onClick={() => setConfParaCancelar(null)}>
          <div className="almox-modal almox-modal-sm" onClick={e => e.stopPropagation()}>
            <div className="almox-modal-header">
              <h2>Cancelar Conferência {confParaCancelar.numero}</h2>
              <button className="almox-modal-close" onClick={() => setConfParaCancelar(null)}>✕</button>
            </div>
            <div className="almox-modal-body">
              <p>
                A contagem será encerrada como CANCELADO sem alterar saldo nenhum. As contagens
                já registradas são descartadas, e o motivo fica no log de auditoria com o seu nome.
              </p>
              <div className="almox-field" style={{ marginTop: 16 }}>
                <label className="almox-label">Motivo do cancelamento *</label>
                <textarea
                  className="almox-textarea"
                  rows={3}
                  value={motivoCancelamento}
                  onChange={e => setMotivoCancelamento(e.target.value)}
                  placeholder="Por que esta contagem está sendo cancelada (mínimo 5 caracteres)"
                />
              </div>
            </div>
            <div className="almox-modal-footer">
              <button type="button" className="btn-almox-secondary" onClick={() => setConfParaCancelar(null)}>Voltar</button>
              <button
                type="button"
                className="btn-almox-danger"
                disabled={cancelando || motivoCancelamento.trim().length < 5}
                onClick={handleCancelar}
              >
                {cancelando ? 'Cancelando...' : 'Confirmar cancelamento'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal criar */}
      {showCreateModal && (
        <div className="almox-modal-overlay" onClick={() => setShowCreateModal(false)}>
          <div className="almox-modal almox-modal-sm" onClick={e => e.stopPropagation()}>
            <div className="almox-modal-header">
              <h2>📋 Nova Conferência de Estoque</h2>
              <button className="almox-modal-close" onClick={() => setShowCreateModal(false)}>✕</button>
            </div>
            <form onSubmit={handleCriar}>
              <div className="almox-modal-body">
                <div className="almox-field" style={{ marginBottom: 16 }}>
                  <label className="almox-label">Filtrar por Categoria (opcional)</label>
                  <select className="almox-form-select" value={criarCategoria} onChange={e => setCriarCategoria(e.target.value)}>
                    <option value="">Todos os materiais</option>
                    {CATEGORIAS.filter(Boolean).map(c => <option key={c} value={c}>{c}</option>)}
                  </select>
                </div>
                <div className="almox-field">
                  <label className="almox-label">Observações</label>
                  <textarea className="almox-textarea" rows={3} value={criarObs}
                    onChange={e => setCriarObs(e.target.value)}
                    placeholder="Motivo, período, responsáveis..." />
                </div>
                <div className="almox-field" style={{ marginTop: 16 }}>
                  <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: '0.875rem', color: 'var(--gmp-text)' }}>
                    <input type="checkbox" checked={criarModoCego} onChange={e => setCriarModoCego(e.target.checked)} />
                    Contagem cega (esconde o saldo do sistema de quem só conta, até homologar)
                  </label>
                </div>
                <div className="almox-field" style={{ marginTop: 16 }}>
                  <label className="almox-label">Tolerância (%)</label>
                  <input
                    className="almox-input"
                    type="number"
                    min="0"
                    step="0.01"
                    value={criarTolerancia}
                    onChange={e => setCriarTolerancia(e.target.value)}
                    placeholder={`${toleranciaPlaceholder} (padrão, se deixar em branco)`}
                  />
                </div>
                {/* Etapa 10b (RN-01/02): escopo combinável por E, além da categoria acima. */}
                <div className="almox-field" style={{ marginTop: 16 }}>
                  <label className="almox-label">Família (opcional)</label>
                  <select className="almox-form-select" value={criarFamilia} onChange={e => setCriarFamilia(e.target.value)}>
                    <option value="">Todas as famílias</option>
                    {/* Só famílias RAIZ (achado da revisão final): o material guarda a raiz em
                        familia_id e a filha em subfamilia_id — oferecer subfamília aqui criava
                        conferência vazia em silêncio, com o escopo gravado mentindo. Mesmo
                        filtro do MaterialAlmoxarifadoForm. */}
                    {familias.filter(f => f.parent_id === null || f.parent_id === undefined)
                      .map(f => <option key={f.id} value={f.id}>{f.nome}</option>)}
                  </select>
                </div>
                <div className="almox-field" style={{ marginTop: 16 }}>
                  <label className="almox-label">Classe ABC (opcional)</label>
                  <select className="almox-form-select" value={criarClasseAbc} onChange={e => setCriarClasseAbc(e.target.value)}>
                    <option value="">Todas as classes</option>
                    <option value="A">Classe A</option>
                    <option value="B">Classe B</option>
                    <option value="C">Classe C</option>
                  </select>
                </div>
                <div className="almox-field" style={{ marginTop: 16 }}>
                  <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: '0.875rem', color: 'var(--gmp-text)' }}>
                    <input type="checkbox" checked={criarCriticos} onChange={e => setCriarCriticos(e.target.checked)} />
                    Somente críticos
                  </label>
                </div>
                <div className="almox-field" style={{ marginTop: 16 }}>
                  <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: '0.875rem', color: 'var(--gmp-text)' }}>
                    <input type="checkbox" checked={criarDeClientes} onChange={e => setCriarDeClientes(e.target.checked)} />
                    Materiais de clientes
                  </label>
                </div>
                <div className="almox-field" style={{ marginTop: 16 }}>
                  <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: '0.875rem', color: 'var(--gmp-text)' }}>
                    <input type="checkbox" checked={criarEmTerceiros} onChange={e => setCriarEmTerceiros(e.target.checked)} />
                    Com saldo em terceiros
                  </label>
                </div>
                {/* RN-03: dupla contagem — recontagem exigida por OUTRA pessoa; checked booleano,
                    nunca value string (string truthy ativaria o filtro no backend). */}
                <div className="almox-field" style={{ marginTop: 16 }}>
                  <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: '0.875rem', color: 'var(--gmp-text)' }}>
                    <input type="checkbox" checked={criarDuplaContagem} onChange={e => setCriarDuplaContagem(e.target.checked)} />
                    Dupla contagem (recontagem por outra pessoa)
                  </label>
                </div>
                <div style={{ background: 'rgba(79,172,254,0.06)', border: '1px solid rgba(79,172,254,0.2)', borderRadius: 8, padding: '12px 16px', marginTop: 16, fontSize: '0.8rem', color: 'var(--gmp-text-light)' }}>
                  Os materiais ativos que casarem com o escopo escolhido acima serão incluídos na conferência com seus saldos atuais. Sem nenhum filtro, entram todos.
                </div>
              </div>
              <div className="almox-modal-footer">
                <button type="button" className="btn-almox-secondary" onClick={() => setShowCreateModal(false)}>Cancelar</button>
                <button type="submit" className="btn-almox-primary" disabled={creating}>
                  {creating ? 'Criando...' : 'Criar Conferência'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Visão Acuracidade (RN-06/RN-07): relatório derivado, só CONCLUIDO, mais recente
          primeiro — quem consome é o gestor, não muda saldo nenhum. */}
      {mostrarAcuracidade && (
        <div className="almox-modal-overlay" onClick={() => setMostrarAcuracidade(false)}>
          <div className="almox-modal almox-modal-lg" onClick={e => e.stopPropagation()}>
            <div className="almox-modal-header">
              <h2>Acuracidade do Inventário</h2>
              <button className="almox-modal-close" onClick={() => setMostrarAcuracidade(false)}>✕</button>
            </div>
            <div className="almox-modal-body">
              {loadingAcuracidade ? <SkeletonTable rows={5} columns={8} /> : !relatorioAcuracidade ? null : (
                (relatorioAcuracidade.conferencias || []).length === 0 ? (
                  <div className="almox-empty">
                    <p>Nenhuma conferência concluída ainda</p>
                  </div>
                ) : (
                  <>
                    <table className="almox-table">
                      <thead>
                        <tr>
                          <th>Número</th>
                          <th>Data Fim</th>
                          <th>Escopo</th>
                          <th>Contados</th>
                          <th>Exatos</th>
                          <th>Divergentes</th>
                          <th>Recontados</th>
                          <th>Acuracidade</th>
                          <th>Impacto Financeiro</th>
                        </tr>
                      </thead>
                      <tbody>
                        {(relatorioAcuracidade.conferencias || []).map(c => (
                          <tr key={c.id}>
                            <td style={{ fontWeight: 700, fontFamily: 'monospace' }}>{c.numero}</td>
                            <td style={{ fontSize: '0.8rem', color: 'var(--gmp-text-light)' }}>{formatDate(c.data_fim)}</td>
                            <td style={{ fontSize: '0.8rem', color: 'var(--gmp-text-light)' }}>{c.escopo_descricao || '—'}</td>
                            {/* Contados / total (achado da revisão final): 100% de acuracidade
                                sobre 1 de 10 itens contados sem mostrar o 10 mentiria tanto
                                quanto o 0% que a RN-06 proíbe. Recontados sustenta o selo de
                                dupla contagem — a flag sozinha não prova recontagem. */}
                            <td>{c.contados} / {c.total_itens}</td>
                            <td>{c.exatos}</td>
                            <td>{c.divergentes}</td>
                            <td>{c.recontados}</td>
                            <td>{formatAcuracidade(c.acuracidade)}</td>
                            <td>{formatImpacto(c.impacto_financeiro)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    {relatorioAcuracidade.agregado && (
                      <div style={{ marginTop: 16, padding: '12px 16px', background: 'var(--gmp-surface)', border: '1px solid var(--gmp-border)', borderRadius: 8, fontSize: '0.875rem' }}>
                        Agregado: {relatorioAcuracidade.agregado.conferencias} conferências · {relatorioAcuracidade.agregado.total_itens} itens · {relatorioAcuracidade.agregado.contados} contados · {relatorioAcuracidade.agregado.exatos} exatos · acuracidade {formatAcuracidade(relatorioAcuracidade.agregado.acuracidade)}
                      </div>
                    )}
                  </>
                )
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ConferenciaEstoque;
