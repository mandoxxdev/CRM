import React, { useState, useEffect, useCallback, useMemo } from 'react';
import api from '../../services/api';
import { toast } from 'react-toastify';
import { FiRefreshCw, FiScissors, FiEdit2, FiPlus } from 'react-icons/fi';
import { SkeletonTable } from '../SkeletonLoader';
import { useAlmoxPermissoes } from '../../hooks/useAlmoxPermissoes';
import SeloProprietario, { rotuloMaterialComDono } from './SeloProprietario';
import ExtratoMaterialModal from './ExtratoMaterialModal';
import { formatLocalizacaoLabel } from '../../utils/localizacaoLabel';
import './Almoxarifado.css';

/**
 * Sobras e Retalhos (Etapa 9, Task 8).
 *
 * Ate esta etapa, retalho de corte nao tinha tela nenhuma: a rota `POST /sobras/gerar-retalho`
 * (Task 3/4) so era alcancavel por chamada direta a API. Sem consulta e sem formulario, "consultar
 * a disponibilidade de retalho antes de cortar chapa nova" (spec 15) era verdade so do servidor.
 *
 * `material_id` na sobra e a ORIGEM (o material que foi retalhado); `material_retalho_id` e o
 * material que representa o pedaco no catalogo — os dois sao IDs crus, porque `GET /sobras`
 * (scrapService.listarSobras) nao faz JOIN com materiais, so com localizacoes. A tela resolve
 * codigo/nome/dono pelo catalogo que ela mesma carrega (`materiaisPorId`), mesmo padrao de
 * `donoDaMovimentacao` em MovimentacoesAlmoxarifado.js.
 *
 * Os DOIS MODOS do design (decisao 2, GerarRetalhoSchema): `baixar_original` e OBRIGATORIO e SEM
 * DEFAULT no servidor — um default aqui escolheria sozinho um dos dois modos. A tela espelha isso
 * com um checkbox que comeca DESMARCADO (a peca cortada AGORA e o caso mais comum de quem abre
 * "Gerar retalho" olhando para a chapa na mesa) mas sempre manda o valor explicito, nunca omite.
 *
 * Sem maquina de estados por status (ao contrario de Remessas/Sucateamento): `atualizarSobra` no
 * servidor nao restringe o PUT pelo status atual — editar uma sobra CONSUMIDA/SUCATEADA para
 * corrigir um dado de cadastro e legitimo. Por isso nao ha STATUS_COM_* aqui: o botao "Editar"
 * fica disponivel em toda linha, gateado so por permissao.
 */

const STATUS_SOBRA = [
  { value: 'DISPONIVEL', label: 'Disponível', cls: 'ok' },
  { value: 'CONSUMIDA', label: 'Consumida', cls: 'zerado' },
  { value: 'SUCATEADA', label: 'Sucateada', cls: 'critico' },
];
const statusInfo = (s) => STATUS_SOBRA.find((x) => x.value === s) || { label: s || '—', cls: 'ajuste' };

const FORM_GERAR_VAZIO = {
  material_origem_id: '', material_retalho_id: '', quantidade_retalho: '',
  baixar_original: false, quantidade_baixa: '', lote_origem_id: '',
  os_id: '', projeto_id: '', centro_custo_id: '', justificativa: '',
  localizacao_id: '',
  dimensoes_originais: '', dimensoes_restantes: '', norma: '',
  espessura: '', diametro: '', largura: '', comprimento: '', peso_aproximado: '',
  material_descricao: '', observacoes: '',
  projeto_origem_id: '', os_origem_id: '',
};

const FORM_EDITAR_VAZIO = { status: 'DISPONIVEL', localizacao_id: '', observacoes: '', reutilizavel: true };

const SobrasAlmoxarifado = () => {
  const { bloquearSeNaoPode } = useAlmoxPermissoes();

  const [sobras, setSobras] = useState([]);
  const [loading, setLoading] = useState(true);
  const [reloadToken, setReloadToken] = useState(0);
  const [filtroStatus, setFiltroStatus] = useState('');
  const [filtroMaterialId, setFiltroMaterialId] = useState('');
  const [filtroQ, setFiltroQ] = useState('');

  const [materiais, setMateriais] = useState([]);
  const [localizacoes, setLocalizacoes] = useState([]);
  const [centrosCusto, setCentrosCusto] = useState([]);
  const [ordensServico, setOrdensServico] = useState([]);
  const [projetos, setProjetos] = useState([]);
  const [lotesOrigem, setLotesOrigem] = useState([]);

  const [modal, setModal] = useState(null); // { tipo: 'gerar'|'editar', sobra? }
  const [form, setForm] = useState(FORM_GERAR_VAZIO);
  const [formEditar, setFormEditar] = useState(FORM_EDITAR_VAZIO);
  const [novoMaterial, setNovoMaterial] = useState(null); // null fechado, {} aberto
  const [salvando, setSalvando] = useState(false);
  const [extratoMaterialId, setExtratoMaterialId] = useState(null);

  const materiaisPorId = useMemo(() => new Map((materiais || []).map((m) => [m.id, m])), [materiais]);
  const origemSelecionada = materiaisPorId.get(Number(form.material_origem_id));

  useEffect(() => {
    let cancelado = false;
    setLoading(true);
    const params = {};
    if (filtroStatus) params.status = filtroStatus;
    if (filtroMaterialId) params.material_id = filtroMaterialId;
    if (filtroQ) params.q = filtroQ;
    api.get('/almoxarifado/sobras', { params })
      .then((r) => { if (!cancelado) setSobras(Array.isArray(r.data) ? r.data : []); })
      .catch(() => { if (!cancelado) { setSobras([]); toast.error('Não foi possível carregar as sobras'); } })
      .finally(() => { if (!cancelado) setLoading(false); });
    return () => { cancelado = true; };
  }, [filtroStatus, filtroMaterialId, filtroQ, reloadToken]);

  // Catalogo e vinculos: carregados uma vez, no topo — sao usados tanto pelo filtro (material de
  // origem) quanto pelo modal de gerar retalho, mesmo padrao de ReservasAlmoxarifado.js.
  useEffect(() => {
    let cancelado = false;
    Promise.all([
      api.get('/almoxarifado/materiais').catch(() => ({ data: [] })),
      api.get('/almoxarifado/localizacoes').catch(() => ({ data: [] })),
      api.get('/almoxarifado/centros-custo').catch(() => ({ data: [] })),
      api.get('/almoxarifado/aux/ordens-servico').catch(() => ({ data: [] })),
      api.get('/projetos').catch(() => ({ data: [] })),
    ]).then(([mat, loc, cc, os, proj]) => {
      if (cancelado) return;
      setMateriais(mat.data || []);
      setLocalizacoes(loc.data || []);
      setCentrosCusto(cc.data || []);
      setOrdensServico(os.data || []);
      setProjetos(proj.data || []);
    });
    return () => { cancelado = true; };
  }, []);

  // Lotes do material de origem, so quando o modal de gerar retalho esta aberto — mesma guarda
  // `cancelado` do efeito de lote em MovimentacoesAlmoxarifado.js. So importa quando o material tem
  // controle_lote (o select so aparece nesse caso), mas buscar sempre que o material troca e mais
  // simples e nao tem custo visivel: a lista fica sem uso quando o campo nao aparece.
  useEffect(() => {
    if (modal?.tipo !== 'gerar' || !form.material_origem_id) { setLotesOrigem([]); return undefined; }
    let cancelado = false;
    api.get(`/almoxarifado/materiais/${form.material_origem_id}/lotes?com_saldo=1`)
      .then((res) => { if (!cancelado) setLotesOrigem(res.data || []); })
      .catch(() => { if (!cancelado) setLotesOrigem([]); });
    return () => { cancelado = true; };
  }, [modal?.tipo, form.material_origem_id]);

  const recarregar = useCallback(() => setReloadToken((t) => t + 1), []);

  const abrirGerar = (evento) => {
    if (!bloquearSeNaoPode('movimentar', evento)) return;
    setForm(FORM_GERAR_VAZIO);
    setNovoMaterial(null);
    setModal({ tipo: 'gerar' });
  };

  const abrirEditar = (sobra, evento) => {
    if (!bloquearSeNaoPode('movimentar', evento)) return;
    setFormEditar({
      status: sobra.status || 'DISPONIVEL',
      localizacao_id: sobra.localizacao_id ?? '',
      observacoes: sobra.observacoes ?? '',
      reutilizavel: !!sobra.reutilizavel,
    });
    setModal({ tipo: 'editar', sobra });
  };

  /**
   * Atalho de criar o material do retalho (mold: RemessasTerceirosAlmoxarifado.js:289-294,
   * `abrirCriarMaterial`). Gate PROPRIO: `criar_material`, nao `movimentar` — mesma separacao de
   * perfis daquele precedente.
   *
   * Familia, proprietario E CATEGORIA sao herdados do material de ORIGEM (nao digitados aqui, nao
   * mostrados como campo): o retalho e aquele material, so que parcial — um campo digitavel
   * divergiria do catalogo, e um retalho de material de cliente que nascesse SEM dono viraria
   * patrimonio da GMP em silencio (decisao 5 do design, a mesma que `gerarRetalho` aplica no
   * servidor via `ownerRules.assertMesmoDonoNoRetalho`).
   */
  const abrirCriarMaterialRetalho = (evento) => {
    if (!bloquearSeNaoPode('criar_material', evento)) return;
    const origem = materiaisPorId.get(Number(form.material_origem_id));
    setNovoMaterial({
      nome: '', unidade: origem?.unidade || 'UN',
      familia_id: origem?.familia_id ?? null,
      proprietario_cliente_id: origem?.proprietario_cliente_id ?? null,
      categoria: origem?.categoria ?? '',
    });
  };

  const cadastrarMaterialDoRetalho = async () => {
    if (!String(novoMaterial?.nome || '').trim()) { toast.error('Informe o nome do novo material'); return; }
    if (!novoMaterial.familia_id) {
      toast.error('O material de origem não tem família cadastrada — cadastre o material do retalho pela tela de Materiais');
      return;
    }
    setSalvando(true);
    try {
      const prox = await api.get(`/almoxarifado/proximo-codigo?familia_id=${novoMaterial.familia_id}`);
      const criado = await api.post('/almoxarifado/materiais', {
        codigo: prox.data?.codigo,
        codigo_auto: 1,
        nome: String(novoMaterial.nome).trim(),
        unidade: String(novoMaterial.unidade || 'UN').trim(),
        familia_id: Number(novoMaterial.familia_id),
        proprietario_cliente_id: novoMaterial.proprietario_cliente_id ?? null,
        categoria: novoMaterial.categoria || undefined,
      });
      setMateriais((lista) => [...lista, criado.data]);
      setForm((f) => ({ ...f, material_retalho_id: String(criado.data.id) }));
      setNovoMaterial(null);
      toast.success(`Material ${criado.data.codigo} criado — já selecionado como retalho`);
    } catch (err) {
      toast.error(err.response?.data?.error || 'Erro ao criar o material do retalho');
    } finally { setSalvando(false); }
  };

  const confirmarGerar = async () => {
    if (!form.material_origem_id) { toast.error('Selecione o material de origem'); return; }
    if (!form.material_retalho_id) { toast.error('Selecione o material do retalho'); return; }
    if (form.baixar_original && !(Number(form.quantidade_baixa) > 0)) {
      toast.error('Informe a quantidade baixada do material de origem'); return;
    }
    if (form.baixar_original && origemSelecionada?.controle_lote === 1 && !form.lote_origem_id) {
      toast.error('Este material controla lote: selecione o lote de origem'); return;
    }

    // `baixar_original` sempre EXPLICITO no payload (nunca omitido) — e o campo obrigatorio sem
    // default do GerarRetalhoSchema (decisao 2: um default aqui escolheria sozinho um dos modos).
    const payload = {
      material_origem_id: Number(form.material_origem_id),
      material_retalho_id: Number(form.material_retalho_id),
      baixar_original: !!form.baixar_original,
    };
    if (form.quantidade_retalho !== '') payload.quantidade_retalho = Number(form.quantidade_retalho);
    if (form.baixar_original) {
      payload.quantidade_baixa = Number(form.quantidade_baixa);
      if (form.lote_origem_id) payload.lote_origem_id = Number(form.lote_origem_id);
      if (form.os_id) payload.os_id = Number(form.os_id);
      if (form.projeto_id) payload.projeto_id = Number(form.projeto_id);
      if (form.centro_custo_id) payload.centro_custo_id = Number(form.centro_custo_id);
      if (form.justificativa) payload.justificativa = String(form.justificativa).trim();
    }
    if (form.localizacao_id) payload.localizacao_id = Number(form.localizacao_id);
    if (form.dimensoes_originais) payload.dimensoes_originais = form.dimensoes_originais.trim();
    if (form.dimensoes_restantes) payload.dimensoes_restantes = form.dimensoes_restantes.trim();
    if (form.norma) payload.norma = form.norma.trim();
    if (form.espessura !== '') payload.espessura = Number(form.espessura);
    if (form.diametro !== '') payload.diametro = Number(form.diametro);
    if (form.largura !== '') payload.largura = Number(form.largura);
    if (form.comprimento !== '') payload.comprimento = Number(form.comprimento);
    if (form.peso_aproximado !== '') payload.peso_aproximado = Number(form.peso_aproximado);
    if (form.material_descricao) payload.material_descricao = form.material_descricao.trim();
    if (form.observacoes) payload.observacoes = form.observacoes.trim();
    if (form.projeto_origem_id) payload.projeto_origem_id = Number(form.projeto_origem_id);
    if (form.os_origem_id) payload.os_origem_id = Number(form.os_origem_id);

    setSalvando(true);
    try {
      await api.post('/almoxarifado/sobras/gerar-retalho', payload);
      toast.success(form.baixar_original
        ? 'Retalho gerado — o material de origem foi baixado'
        : 'Retalho gerado — nada foi baixado (a peça já tinha saído do estoque)');
      setModal(null);
      recarregar();
    } catch (err) {
      // A mensagem do backend ensina o caminho certo (controle de serie, dono diferente, lote
      // faltando) — trocar por um texto generico apagaria justamente a instrucao que resolve.
      toast.error(err.response?.data?.error || 'Erro ao gerar o retalho');
    } finally { setSalvando(false); }
  };

  const confirmarEditar = async () => {
    const { sobra } = modal;
    setSalvando(true);
    try {
      const res = await api.put(`/almoxarifado/sobras/${sobra.id}`, {
        status: formEditar.status,
        localizacao_id: formEditar.localizacao_id ? Number(formEditar.localizacao_id) : null,
        observacoes: formEditar.observacoes ? String(formEditar.observacoes).trim() : null,
        reutilizavel: !!formEditar.reutilizavel,
      });
      setSobras((lista) => lista.map((s) => (s.id === sobra.id ? { ...s, ...res.data } : s)));
      toast.success('Sobra atualizada');
      setModal(null);
    } catch (err) {
      toast.error(err.response?.data?.error || 'Erro ao atualizar a sobra');
    } finally { setSalvando(false); }
  };

  const confirmar = () => (modal?.tipo === 'gerar' ? confirmarGerar() : confirmarEditar());

  const rotuloLocalizacao = (l) => `${l.endereco_completo || formatLocalizacaoLabel(l, localizacoes)}${l.descricao ? ` — ${l.descricao}` : ''}`;

  return (
    <div className="almox-page">
      <div className="almox-header">
        <div>
          <h1><FiScissors size={20} /> Sobras e Retalhos</h1>
          <p>
            {loading ? 'Carregando...'
              : `${sobras.length} sobra(s) · retalho rastreável, disponível antes de cortar chapa nova`}
          </p>
        </div>
        <div className="almox-header-actions">
          <button className="btn-almox-secondary" onClick={recarregar}>
            <FiRefreshCw size={13} /> Atualizar
          </button>
          <button className="btn-almox-primary" onClick={abrirGerar}>
            <FiScissors size={13} /> Gerar retalho
          </button>
        </div>
      </div>

      <div className="almox-filters">
        <select className="almox-select" value={filtroStatus} onChange={(e) => setFiltroStatus(e.target.value)}>
          <option value="">Todos os status</option>
          {STATUS_SOBRA.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
        </select>
        <select className="almox-select" value={filtroMaterialId} onChange={(e) => setFiltroMaterialId(e.target.value)}>
          <option value="">Todos os materiais de origem</option>
          {materiais.map((m) => <option key={m.id} value={m.id}>{m.codigo} — {m.nome}</option>)}
        </select>
        <input className="almox-input" style={{ maxWidth: 260 }} placeholder="Buscar por norma, dimensão ou descrição"
          value={filtroQ} onChange={(e) => setFiltroQ(e.target.value)} />
      </div>

      <div className="almox-table-container">
        {loading ? <SkeletonTable rows={6} columns={7} />
          : sobras.length === 0 ? (
            <div className="almox-empty"><p>Nenhuma sobra registrada</p></div>
          ) : (
            <table className="almox-table almox-sobra-lista">
              <thead>
                <tr>
                  <th>Origem → Retalho</th><th>Dimensões restantes</th><th>Peso</th>
                  <th>Localização</th><th>Status</th><th>Responsável</th><th>Ações</th>
                </tr>
              </thead>
              <tbody>
                {sobras.map((s) => {
                  const origem = materiaisPorId.get(s.material_id);
                  const retalho = materiaisPorId.get(s.material_retalho_id);
                  const info = statusInfo(s.status);
                  return (
                    <tr key={s.id}>
                      <td>
                        {origem ? `${origem.codigo} — ${origem.nome}` : `#${s.material_id}`}
                        {' → '}
                        <button type="button" className="almox-link-btn"
                          onClick={() => setExtratoMaterialId(s.material_retalho_id)}>
                          {retalho ? `${retalho.codigo} — ${retalho.nome}` : `#${s.material_retalho_id}`}
                        </button>
                        <SeloProprietario material={retalho} />
                      </td>
                      <td>{s.dimensoes_restantes || '—'}</td>
                      <td>{s.peso_aproximado !== null && s.peso_aproximado !== undefined ? `${s.peso_aproximado} kg` : '—'}</td>
                      <td>{s.localizacao_codigo || '—'}</td>
                      <td><span className={`almox-badge almox-badge-${info.cls}`}>{info.label}</span></td>
                      <td>{s.criado_por_nome || '—'}</td>
                      <td>
                        <div className="almox-actions">
                          <button className="btn-almox-secondary"
                            title="Editar status, localização ou observações da sobra"
                            onClick={(e) => abrirEditar(s, e)}>
                            <FiEdit2 size={13} /> Editar
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
      </div>

      {modal?.tipo === 'gerar' && (
        <div className="almox-modal-overlay" onClick={() => { if (!salvando) setModal(null); }}>
          <div className="almox-modal almox-modal-lg" onClick={(e) => e.stopPropagation()}>
            <div className="almox-modal-header">
              <h2>Gerar retalho</h2>
              <button className="almox-modal-close" onClick={() => setModal(null)}>✕</button>
            </div>
            <div className="almox-modal-body">
              <div className="almox-form-grid">
                <div className="almox-field">
                  <label className="almox-label">Material de origem<span className="required">*</span></label>
                  <select className="almox-form-select" value={form.material_origem_id}
                    onChange={(e) => setForm((f) => ({ ...f, material_origem_id: e.target.value, lote_origem_id: '' }))}>
                    <option value="">Selecionar material...</option>
                    {materiais.map((m) => (
                      <option key={m.id} value={m.id}>{rotuloMaterialComDono(m, `${m.codigo} — ${m.nome}`)}</option>
                    ))}
                  </select>
                </div>
                <div className="almox-field">
                  <label className="almox-label">Material do retalho<span className="required">*</span></label>
                  <select className="almox-form-select" value={form.material_retalho_id}
                    onChange={(e) => setForm((f) => ({ ...f, material_retalho_id: e.target.value }))}>
                    <option value="">Selecionar material...</option>
                    {materiais.map((m) => (
                      <option key={m.id} value={m.id}>{rotuloMaterialComDono(m, `${m.codigo} — ${m.nome}`)}</option>
                    ))}
                  </select>
                </div>
              </div>

              <button type="button" className="btn-almox-secondary" style={{ marginBottom: 8 }}
                title="Cadastrar agora o material que representa o retalho, já com família, dono e categoria da origem"
                onClick={abrirCriarMaterialRetalho}>
                <FiPlus size={13} /> Criar material do retalho
              </button>

              {novoMaterial && (
                // Sem a classe `almox-field` no CONTORNO, de proposito (mesmo motivo do mold em
                // RemessasTerceirosAlmoxarifado.js): cada rotulo deste sub-formulario precisa do
                // seu proprio `.almox-field`, senao "nome" e "unidade" caem no mesmo campo e uma
                // busca por rotulo devolve sempre o primeiro input.
                <div style={{ border: '1px solid var(--gmp-border)', padding: 8, borderRadius: 6, marginBottom: 8 }}>
                  <p style={{ marginTop: 0, fontSize: '0.8rem' }}>
                    O código é gerado pela família do material de origem, e o proprietário e a
                    categoria são herdados dele — o retalho continua sendo do mesmo dono e da mesma
                    categoria da chapa cortada.
                  </p>
                  <div className="almox-field">
                    <label className="almox-label">Nome do novo material<span className="required">*</span></label>
                    <input className="almox-input" value={novoMaterial.nome}
                      onChange={(e) => setNovoMaterial((m) => ({ ...m, nome: e.target.value }))} />
                  </div>
                  <div className="almox-field">
                    <label className="almox-label">Unidade do novo material</label>
                    <input className="almox-input" value={novoMaterial.unidade}
                      onChange={(e) => setNovoMaterial((m) => ({ ...m, unidade: e.target.value }))} />
                  </div>
                  <div className="almox-actions" style={{ marginTop: 8 }}>
                    <button type="button" className="btn-almox-primary" disabled={salvando}
                      onClick={cadastrarMaterialDoRetalho}>Cadastrar e usar</button>
                    <button type="button" className="btn-almox-secondary"
                      onClick={() => setNovoMaterial(null)}>Cancelar cadastro</button>
                  </div>
                </div>
              )}

              <div className="almox-form-grid">
                <div className="almox-field">
                  <label className="almox-label">Quantidade do retalho</label>
                  <input className="almox-input" type="number" min="0" value={form.quantidade_retalho}
                    onChange={(e) => setForm((f) => ({ ...f, quantidade_retalho: e.target.value }))} />
                  <small style={{ color: 'var(--gmp-text-light)', fontSize: '0.75rem' }}>
                    Em branco, entra 1 unidade — o corte devolve uma peça.
                  </small>
                </div>
                <div className="almox-field">
                  <label className="almox-label">Localização do retalho</label>
                  <select className="almox-form-select" value={form.localizacao_id}
                    onChange={(e) => setForm((f) => ({ ...f, localizacao_id: e.target.value }))}>
                    <option value="">—</option>
                    {localizacoes.map((l) => <option key={l.id} value={l.id}>{rotuloLocalizacao(l)}</option>)}
                  </select>
                </div>
              </div>

              <div className="almox-field almox-form-full">
                <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: '0.875rem', color: 'var(--gmp-text)' }}>
                  <input type="checkbox" checked={form.baixar_original}
                    onChange={(e) => setForm((f) => ({ ...f, baixar_original: e.target.checked }))} />
                  Baixar o material de origem agora (a peça está saindo do estoque neste momento)
                </label>
                <small style={{ color: 'var(--gmp-text-light)', fontSize: '0.75rem' }}>
                  Desmarcado: use quando a sobra já saiu antes (retorno do chão de fábrica) — nada é
                  baixado agora, só o retalho é creditado.
                </small>
              </div>

              {form.baixar_original && (
                <>
                  <div className="almox-section-title">Baixa do material de origem</div>
                  <div className="almox-form-grid">
                    <div className="almox-field">
                      <label className="almox-label">Quantidade baixada<span className="required">*</span></label>
                      <input className="almox-input" type="number" min="0" value={form.quantidade_baixa}
                        onChange={(e) => setForm((f) => ({ ...f, quantidade_baixa: e.target.value }))} />
                    </div>
                    {origemSelecionada?.controle_lote === 1 && (
                      <div className="almox-field">
                        <label className="almox-label">Lote de origem<span className="required">*</span></label>
                        <select className="almox-form-select" value={form.lote_origem_id}
                          onChange={(e) => setForm((f) => ({ ...f, lote_origem_id: e.target.value }))}>
                          <option value="">Selecionar lote...</option>
                          {lotesOrigem.map((l) => <option key={l.id} value={l.id}>{l.codigo} — saldo {l.saldo}</option>)}
                        </select>
                      </div>
                    )}
                    <div className="almox-field">
                      <label className="almox-label">OS da saída</label>
                      <select className="almox-form-select" value={form.os_id}
                        onChange={(e) => setForm((f) => ({ ...f, os_id: e.target.value }))}>
                        <option value="">—</option>
                        {ordensServico.map((os) => (
                          <option key={os.id} value={os.id}>
                            {os.numero_os}{os.cliente_nome ? ` — ${os.cliente_nome}` : ''}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div className="almox-field">
                      <label className="almox-label">Projeto da saída</label>
                      <select className="almox-form-select" value={form.projeto_id}
                        onChange={(e) => setForm((f) => ({ ...f, projeto_id: e.target.value }))}>
                        <option value="">—</option>
                        {projetos.map((p) => <option key={p.id} value={p.id}>{p.nome}</option>)}
                      </select>
                    </div>
                    <div className="almox-field">
                      <label className="almox-label">Centro de custo</label>
                      <select className="almox-form-select" value={form.centro_custo_id}
                        onChange={(e) => setForm((f) => ({ ...f, centro_custo_id: e.target.value }))}>
                        <option value="">—</option>
                        {centrosCusto.map((cc) => <option key={cc.id} value={cc.id}>{cc.codigo} — {cc.nome}</option>)}
                      </select>
                    </div>
                    <div className="almox-field almox-form-full">
                      <label className="almox-label">Justificativa da saída</label>
                      <textarea className="almox-textarea" rows={2} value={form.justificativa}
                        onChange={(e) => setForm((f) => ({ ...f, justificativa: e.target.value }))} />
                      <small style={{ color: 'var(--gmp-text-light)', fontSize: '0.75rem' }}>
                        Em branco, o sistema registra uma justificativa automática citando o corte.
                      </small>
                    </div>
                  </div>
                </>
              )}

              <div className="almox-section-title">Dimensões do retalho</div>
              <div className="almox-form-grid">
                <div className="almox-field">
                  <label className="almox-label">Dimensões originais</label>
                  <input className="almox-input" value={form.dimensoes_originais}
                    onChange={(e) => setForm((f) => ({ ...f, dimensoes_originais: e.target.value }))} placeholder="3000x1500x12,7" />
                </div>
                <div className="almox-field">
                  <label className="almox-label">Dimensões restantes</label>
                  <input className="almox-input" value={form.dimensoes_restantes}
                    onChange={(e) => setForm((f) => ({ ...f, dimensoes_restantes: e.target.value }))} placeholder="1800x1500x12,7" />
                </div>
                <div className="almox-field">
                  <label className="almox-label">Norma</label>
                  <input className="almox-input" value={form.norma}
                    onChange={(e) => setForm((f) => ({ ...f, norma: e.target.value }))} placeholder="ASTM A36" />
                </div>
                <div className="almox-field">
                  <label className="almox-label">Espessura (mm)</label>
                  <input className="almox-input" type="number" min="0" value={form.espessura}
                    onChange={(e) => setForm((f) => ({ ...f, espessura: e.target.value }))} />
                </div>
                <div className="almox-field">
                  <label className="almox-label">Diâmetro (mm)</label>
                  <input className="almox-input" type="number" min="0" value={form.diametro}
                    onChange={(e) => setForm((f) => ({ ...f, diametro: e.target.value }))} />
                </div>
                <div className="almox-field">
                  <label className="almox-label">Largura (mm)</label>
                  <input className="almox-input" type="number" min="0" value={form.largura}
                    onChange={(e) => setForm((f) => ({ ...f, largura: e.target.value }))} />
                </div>
                <div className="almox-field">
                  <label className="almox-label">Comprimento (mm)</label>
                  <input className="almox-input" type="number" min="0" value={form.comprimento}
                    onChange={(e) => setForm((f) => ({ ...f, comprimento: e.target.value }))} />
                </div>
                <div className="almox-field">
                  <label className="almox-label">Peso aproximado (kg)</label>
                  <input className="almox-input" type="number" min="0" value={form.peso_aproximado}
                    onChange={(e) => setForm((f) => ({ ...f, peso_aproximado: e.target.value }))} />
                </div>
                <div className="almox-field almox-form-full">
                  <label className="almox-label">Descrição do material</label>
                  <input className="almox-input" value={form.material_descricao}
                    onChange={(e) => setForm((f) => ({ ...f, material_descricao: e.target.value }))}
                    placeholder="Meia chapa de aço carbono" />
                </div>
              </div>

              <div className="almox-section-title">Rastreio do corte (opcional)</div>
              <div className="almox-form-grid">
                <div className="almox-field">
                  <label className="almox-label">Projeto de origem</label>
                  <select className="almox-form-select" value={form.projeto_origem_id}
                    onChange={(e) => setForm((f) => ({ ...f, projeto_origem_id: e.target.value }))}>
                    <option value="">—</option>
                    {projetos.map((p) => <option key={p.id} value={p.id}>{p.nome}</option>)}
                  </select>
                </div>
                <div className="almox-field">
                  <label className="almox-label">OS de origem</label>
                  <select className="almox-form-select" value={form.os_origem_id}
                    onChange={(e) => setForm((f) => ({ ...f, os_origem_id: e.target.value }))}>
                    <option value="">—</option>
                    {ordensServico.map((os) => (
                      <option key={os.id} value={os.id}>
                        {os.numero_os}{os.cliente_nome ? ` — ${os.cliente_nome}` : ''}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="almox-field almox-form-full">
                <label className="almox-label">Observações</label>
                <textarea className="almox-textarea" rows={2} value={form.observacoes}
                  onChange={(e) => setForm((f) => ({ ...f, observacoes: e.target.value }))} />
              </div>
            </div>
            <div className="almox-modal-footer">
              <button className="btn-almox-secondary" onClick={() => setModal(null)} disabled={salvando}>Fechar</button>
              <button className="btn-almox-primary" onClick={confirmar} disabled={salvando}>
                {salvando ? 'Gerando...' : 'Gerar retalho'}
              </button>
            </div>
          </div>
        </div>
      )}

      {modal?.tipo === 'editar' && (
        <div className="almox-modal-overlay" onClick={() => { if (!salvando) setModal(null); }}>
          <div className="almox-modal almox-modal-sm" onClick={(e) => e.stopPropagation()}>
            <div className="almox-modal-header">
              <h2>Editar sobra</h2>
              <button className="almox-modal-close" onClick={() => setModal(null)}>✕</button>
            </div>
            <div className="almox-modal-body">
              <div className="almox-field">
                <label className="almox-label">Status</label>
                <select className="almox-form-select" value={formEditar.status}
                  onChange={(e) => setFormEditar((f) => ({ ...f, status: e.target.value }))}>
                  {STATUS_SOBRA.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
                </select>
              </div>
              <div className="almox-field">
                <label className="almox-label">Localização</label>
                <select className="almox-form-select" value={formEditar.localizacao_id}
                  onChange={(e) => setFormEditar((f) => ({ ...f, localizacao_id: e.target.value }))}>
                  <option value="">—</option>
                  {localizacoes.map((l) => <option key={l.id} value={l.id}>{rotuloLocalizacao(l)}</option>)}
                </select>
              </div>
              <div className="almox-field">
                <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: '0.875rem', color: 'var(--gmp-text)' }}>
                  <input type="checkbox" checked={formEditar.reutilizavel}
                    onChange={(e) => setFormEditar((f) => ({ ...f, reutilizavel: e.target.checked }))} />
                  Reutilizável (aparece como sugestão de retalho antes de cortar material novo)
                </label>
              </div>
              <div className="almox-field">
                <label className="almox-label">Observações</label>
                <textarea className="almox-textarea" rows={2} value={formEditar.observacoes}
                  onChange={(e) => setFormEditar((f) => ({ ...f, observacoes: e.target.value }))} />
              </div>
            </div>
            <div className="almox-modal-footer">
              <button className="btn-almox-secondary" onClick={() => setModal(null)} disabled={salvando}>Fechar</button>
              <button className="btn-almox-primary" onClick={confirmar} disabled={salvando}>
                {salvando ? 'Salvando...' : 'Salvar'}
              </button>
            </div>
          </div>
        </div>
      )}

      {extratoMaterialId && (
        <ExtratoMaterialModal materialId={extratoMaterialId} onClose={() => setExtratoMaterialId(null)} />
      )}
    </div>
  );
};

export default SobrasAlmoxarifado;
