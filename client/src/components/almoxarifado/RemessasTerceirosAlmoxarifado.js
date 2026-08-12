import React, { useState, useEffect, useCallback, useMemo } from 'react';
import api from '../../services/api';
import { toast } from 'react-toastify';
import { FiRefreshCw, FiSend, FiCornerDownLeft, FiCheckSquare, FiXCircle, FiFileText, FiEye, FiPlus, FiTrash2 } from 'react-icons/fi';
import { SkeletonTable } from '../SkeletonLoader';
import { useAlmoxPermissoes } from '../../hooks/useAlmoxPermissoes';
import { gerarRemessaPDF } from '../../utils/remessaPdf';
import SeloProprietario, { nomeDoDono, DONO_SEM_NOME } from './SeloProprietario';
import './Almoxarifado.css';

/**
 * Remessas a Terceiros (Etapa 8b).
 *
 * Ate esta etapa, quando uma chapa ia para o galvanizador ela sumia do controle: ou alguem dava
 * baixa (e o material desaparecia do patrimonio, embora continuasse sendo da empresa), ou nao dava
 * baixa nenhuma (e o sistema afirmava que a chapa estava na prateleira, com ela a 40 km).
 *
 * As ACOES seguem o STATUS, e nao a vontade da tela: quem decide e o backend (a maquina de estados
 * em thirdPartyStateMachine.js). Aqui os botoes so escondem o que o servidor recusaria — oferecer
 * "Enviar" numa remessa ja enviada so produziria um 400 que o operador nao entenderia.
 *
 * "Vencida" e alerta que SE SOMA ao status (badge separado, ao lado), e vem calculado do servidor
 * (`vencida` na listagem). Recalcular aqui criaria uma segunda conta que discordaria do filtro.
 *
 * NAO confundir com /almoxarifado/devolucoes (Etapa 7, o material VOLTA para o estoque) nem com
 * Materiais de Clientes (Etapa 8, o material e de outro dono). Aqui o material e NOSSO (ou de um
 * cliente, e o documento diz de quem) e esta FORA DO PREDIO, temporariamente.
 */
const STATUS_COM_ENVIO = ['ABERTA'];
const STATUS_COM_RETORNO = ['ENVIADA', 'RETORNO_PARCIAL'];
const STATUS_COM_ENCERRAR = ['ENVIADA', 'RETORNO_PARCIAL'];
const STATUS_COM_CANCELAR = ['ABERTA', 'ENVIADA', 'RETORNO_PARCIAL'];

/**
 * Destinos do encerramento (thirdPartyService.DESTINOS_ENCERRAMENTO) em linguagem de tela.
 * Ficam AQUI, e nao importados de utils/remessaPdf: o documento fala com o terceiro, a tela fala
 * com o almoxarife, e as duas frases nao precisam ser a mesma.
 */
const ROTULO_DESTINO = {
  PERDA_NO_TERCEIRO: 'perda no terceiro',
  CONSUMIDO_NO_PROCESSO: 'consumido no processo',
};

/**
 * O que a coluna "baixado" significa, lido do CABECALHO da remessa.
 *
 * Sem isto a tela mentiria: ao encerrar com destino (e ao cancelar), o servico grava
 * `quantidade_retornada = quantidade` nos itens pendentes so para zerar a pendencia — ali o numero
 * quer dizer LIQUIDADO, nao "voltou". Um item perdido no galvanizador fica com pendente zero SEM
 * ter retornado nada. A verdade do que voltou esta em `retornos` (retornos_remessa_item_almoxarifado).
 */
function rotuloDaBaixa(remessa) {
  if (!remessa) return null;
  if (remessa.status === 'CANCELADA') return 'estornado no cancelamento (voltou ao disponivel sem sair da remessa)';
  const destino = remessa.encerramento_destino;
  if (!destino) return null;
  return `baixa definitiva no encerramento — ${ROTULO_DESTINO[destino] || String(destino).toLowerCase().replace(/_/g, ' ')}`;
}

/** Nome do dono para a mensagem de remessa mista — `null` e o nosso estoque, e tem nome proprio. */
const rotuloDono = (material) => nomeDoDono(material) || 'estoque proprio (material nosso)';

/** `proprietario_cliente_id` e NUMERO ou `null` — nunca booleano, e `0` nao existe como dono. */
const donoDoMaterial = (m) => {
  const id = m?.proprietario_cliente_id;
  return (id === null || id === undefined || id === '') ? null : Number(id);
};

const RemessasTerceirosAlmoxarifado = () => {
  const { bloquearSeNaoPode } = useAlmoxPermissoes();
  const [remessas, setRemessas] = useState([]);
  const [loading, setLoading] = useState(true);
  const [reloadToken, setReloadToken] = useState(0);
  const [filtroStatus, setFiltroStatus] = useState('');
  const [aberta, setAberta] = useState(null);

  const [modal, setModal] = useState(null); // { tipo: 'nova'|'retorno'|'encerrar'|'cancelar', remessa }
  const [form, setForm] = useState({});
  const [salvando, setSalvando] = useState(false);

  // Formulario de criacao
  const [materiais, setMateriais] = useState([]);
  const [fornecedores, setFornecedores] = useState([]);
  const [novoItem, setNovoItem] = useState({ material_id: '', quantidade: '', peso: '' });
  const [itensNovos, setItensNovos] = useState([]);

  useEffect(() => {
    let cancelado = false;
    setLoading(true);
    const qs = filtroStatus ? `?status=${filtroStatus}` : '';
    api.get(`/almoxarifado/remessas-terceiros${qs}`)
      .then((r) => { if (!cancelado) setRemessas(Array.isArray(r.data) ? r.data : []); })
      .catch(() => { if (!cancelado) { setRemessas([]); toast.error('Não foi possível carregar as remessas'); } })
      .finally(() => { if (!cancelado) setLoading(false); });
    return () => { cancelado = true; };
  }, [filtroStatus, reloadToken]);

  const modalTipo = modal?.tipo || null;

  // Materiais e terceiros so sao buscados quando o formulario de criacao abre: sao duas listas
  // grandes que nenhuma outra parte da tela usa. Guarda `cancelado` no molde de LotesAlmoxarifado —
  // fechar o modal antes da resposta chegar nao pode pintar estado numa tela que mudou.
  useEffect(() => {
    if (modalTipo !== 'nova') return undefined;
    let cancelado = false;
    Promise.all([
      api.get('/almoxarifado/materiais').catch(() => ({ data: [] })),
      api.get('/almoxarifado/recebimentos-aux/fornecedores').catch(() => ({ data: [] })),
    ]).then(([m, f]) => {
      if (cancelado) return;
      setMateriais(Array.isArray(m.data) ? m.data : []);
      setFornecedores(Array.isArray(f.data) ? f.data : []);
    });
    return () => { cancelado = true; };
  }, [modalTipo]);

  const recarregar = useCallback(() => setReloadToken((t) => t + 1), []);

  const abrirDetalhe = useCallback(async (remessa) => {
    try {
      const r = await api.get(`/almoxarifado/remessas-terceiros/${remessa.id}`);
      setAberta(r.data);
      return r.data;
    } catch {
      toast.error('Não foi possível carregar a remessa');
      return null;
    }
  }, []);

  const enviar = async (remessa, evento) => {
    if (!bloquearSeNaoPode('remessar_terceiro', evento)) return;
    try {
      await api.post(`/almoxarifado/remessas-terceiros/${remessa.id}/enviar`, {});
      toast.success('Remessa enviada — o saldo saiu do disponível');
      recarregar();
    } catch (err) {
      // A mensagem do backend nomeia o item que travou e quanto ha disponivel. Trocar por um texto
      // generico apagaria justamente o numero que resolve o problema.
      toast.error(err.response?.data?.error || 'Erro ao enviar a remessa');
    }
  };

  const abrirModal = (tipo, remessa, evento) => {
    if (!bloquearSeNaoPode('remessar_terceiro', evento)) return;
    setForm({});
    setModal({ tipo, remessa });
    // Retorno e encerramento decidem pelos ITENS (qual item voltou, se sobrou pendencia), entao o
    // detalhe e recarregado ao abrir: a listagem em memoria pode estar velha.
    if (tipo === 'retorno' || tipo === 'encerrar') abrirDetalhe(remessa);
  };

  const abrirNova = (evento) => {
    if (!bloquearSeNaoPode('remessar_terceiro', evento)) return;
    setForm({});
    setNovoItem({ material_id: '', quantidade: '', peso: '' });
    setItensNovos([]);
    setModal({ tipo: 'nova', remessa: null });
  };

  /**
   * Uma remessa nao junta donos diferentes — a mesma recusa que o servidor faz em
   * resolverProprietario, adiantada aqui para o operador nao montar dez itens e perder tudo no
   * Salvar. O documento de remessa nomeia UM proprietario; com dois, nao ha nome a escrever.
   */
  const adicionarItem = () => {
    const material = materiais.find((m) => String(m.id) === String(novoItem.material_id));
    if (!material) { toast.error('Selecione o material do item'); return; }
    const qtd = Number(novoItem.quantidade);
    if (!(qtd > 0)) { toast.error('Informe a quantidade do item'); return; }
    if (itensNovos.length > 0) {
      const donoAtual = donoDoMaterial(itensNovos[0]);
      const dono = donoDoMaterial(material);
      if (donoAtual !== dono) {
        toast.error(`Esta remessa já tem material de ${rotuloDono(itensNovos[0])} e ${material.codigo} `
          + `é de ${rotuloDono(material)}. O documento de remessa nomeia um proprietário — `
          + 'separe em remessas diferentes.');
        return;
      }
    }
    setItensNovos((lista) => [...lista, {
      material_id: Number(material.id),
      codigo: material.codigo,
      nome: material.nome,
      unidade: material.unidade,
      proprietario_cliente_id: material.proprietario_cliente_id ?? null,
      proprietario_cliente_nome: material.proprietario_cliente_nome ?? null,
      quantidade: qtd,
      peso: novoItem.peso === '' ? null : Number(novoItem.peso),
    }]);
    setNovoItem({ material_id: '', quantidade: '', peso: '' });
  };

  const criar = async () => {
    if (!form.fornecedor_id && !String(form.fornecedor_nome || '').trim()) {
      toast.error('Informe o terceiro que vai receber o material'); return;
    }
    if (itensNovos.length === 0) {
      toast.error('Adicione ao menos um item à remessa'); return;
    }
    const body = {
      fornecedor_nome: String(form.fornecedor_nome || '').trim() || undefined,
      tipo_servico: String(form.tipo_servico || '').trim() || undefined,
      prazo_previsto: form.prazo_previsto || undefined,
      observacoes: String(form.observacoes || '').trim() || undefined,
      itens: itensNovos.map((i) => (i.peso === null || Number.isNaN(i.peso)
        ? { material_id: i.material_id, quantidade: i.quantidade }
        : { material_id: i.material_id, quantidade: i.quantidade, peso: i.peso })),
    };
    if (form.fornecedor_id) body.fornecedor_id = Number(form.fornecedor_id);
    setSalvando(true);
    try {
      const r = await api.post('/almoxarifado/remessas-terceiros', body);
      toast.success(`Remessa ${r.data?.numero || ''} criada — ainda em ABERTA, o saldo só sai no envio`.trim());
      setModal(null);
      recarregar();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Erro ao criar a remessa');
    } finally { setSalvando(false); }
  };

  const confirmar = async () => {
    const { tipo, remessa } = modal;
    if (tipo === 'nova') return criar();
    if (tipo === 'encerrar') {
      const detalhe = aberta?.id === remessa.id ? aberta : null;
      const temPendencia = (detalhe?.itens || []).some((i) => Number(i.pendente) > 0);
      // A tela so ADIANTA a exigencia; quem decide e o servidor, que sabe o pendente real. Sem o
      // detalhe carregado ela exige o destino: cobrar a mais e recuperavel, deixar passar sem
      // destino nao — o 400 do servidor viria depois com a mesma cobranca.
      if ((temPendencia || !detalhe) && !form.destino) {
        toast.error('Informe o destino do saldo que não voltou'); return undefined;
      }
      if (form.destino && !String(form.justificativa || '').trim()) {
        toast.error('Informe a justificativa do encerramento'); return undefined;
      }
    }
    if (tipo === 'cancelar' && !String(form.motivo || '').trim()) {
      toast.error('Informe o motivo do cancelamento'); return undefined;
    }
    if (tipo === 'retorno' && !(Number(form.quantidade) > 0)) {
      toast.error('Informe a quantidade retornada'); return undefined;
    }
    if (tipo === 'retorno' && !form.item_remessa_id) {
      toast.error('Selecione o item que voltou do terceiro'); return undefined;
    }
    setSalvando(true);
    try {
      if (tipo === 'retorno') {
        await api.post(`/almoxarifado/remessas-terceiros/${remessa.id}/retornos`, {
          nota_fiscal: form.nota_fiscal || undefined,
          itens: [{ item_remessa_id: Number(form.item_remessa_id), quantidade: Number(form.quantidade) }],
        });
        toast.success('Retorno registrado');
      } else if (tipo === 'encerrar') {
        const body = form.destino
          ? { destino: form.destino, justificativa: String(form.justificativa).trim() }
          : {};
        await api.put(`/almoxarifado/remessas-terceiros/${remessa.id}/encerrar`, body);
        toast.success('Remessa encerrada');
      } else {
        await api.put(`/almoxarifado/remessas-terceiros/${remessa.id}/cancelar`,
          { motivo: String(form.motivo).trim() });
        toast.success('Remessa cancelada — o saldo pendente voltou ao disponível');
      }
      setModal(null);
      setAberta(null);
      recarregar();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Erro ao concluir a operação');
    } finally { setSalvando(false); }
    return undefined;
  };

  /** Quanto VOLTOU de verdade, por item — a soma dos retornos registrados, nunca `quantidade_retornada`. */
  const retornadoPorItem = useMemo(() => {
    const mapa = {};
    for (const r of (aberta?.retornos || [])) {
      const k = String(r.item_remessa_id);
      mapa[k] = (mapa[k] || 0) + Number(r.quantidade || 0);
    }
    return mapa;
  }, [aberta]);

  const rotuloBaixa = rotuloDaBaixa(aberta);

  return (
    <div className="almox-page">
      <div className="almox-header">
        <div>
          <h1>Remessas a Terceiros</h1>
          <p>{loading ? 'Carregando...' : `${remessas.length} remessa(s) · material que está fora do prédio para beneficiamento`}</p>
        </div>
        <div className="almox-header-actions">
          <button className="btn-almox-secondary" onClick={recarregar}>
            <FiRefreshCw size={13} /> Atualizar
          </button>
          {/* PDF gerado no NAVEGADOR (utils/remessaPdf.js) — zero mudanca de servidor. So habilita
              com uma remessa aberta, porque o documento precisa dos ITENS. */}
          <button className="btn-almox-secondary" disabled={!aberta}
            onClick={() => gerarRemessaPDF({ remessa: aberta, itens: aberta?.itens || [], geradoEm: new Date().toISOString() })}>
            <FiFileText size={13} /> PDF da remessa
          </button>
          <button className="btn-almox-primary" onClick={abrirNova}>
            <FiPlus size={13} /> Nova remessa
          </button>
        </div>
      </div>

      <div className="almox-filters">
        <select className="almox-select" value={filtroStatus} onChange={(e) => setFiltroStatus(e.target.value)}>
          <option value="">Todos os status</option>
          {['ABERTA', 'ENVIADA', 'RETORNO_PARCIAL', 'ENCERRADA', 'CANCELADA'].map((s) => (
            <option key={s} value={s}>{s.replace('_', ' ')}</option>
          ))}
        </select>
      </div>

      <div className="almox-table-container">
        {loading ? <SkeletonTable rows={6} columns={7} />
          : remessas.length === 0 ? (
            <div className="almox-empty"><p>Nenhuma remessa a terceiros</p></div>
          ) : (
            <table className="almox-table almox-remessa-lista">
              <thead>
                <tr>
                  <th>Número</th><th>Terceiro</th><th>Serviço</th><th>Prazo</th>
                  <th>Itens</th><th>Status</th><th>Ações</th>
                </tr>
              </thead>
              <tbody>
                {remessas.map((r) => (
                  <tr key={r.id}>
                    <td>{r.numero}</td>
                    <td>
                      {r.fornecedor_nome || '—'}
                      {/* Selo de propriedade: o MESMO componente da Etapa 8 (SeloProprietario), e
                          nao uma copia — o significado ("isto nao e nosso") ja tem uma cara so no
                          modulo, e o nome da classe CSS precisa de um unico lugar de verdade. */}
                      <SeloProprietario material={r} />
                    </td>
                    <td>{r.tipo_servico || '—'}</td>
                    <td>
                      {r.prazo_previsto || '—'}
                      {r.vencida ? (
                        <span className="almox-badge almox-badge-vencida" style={{ marginLeft: 6 }}
                          title="O prazo combinado com o terceiro já passou e ainda há material lá fora">Vencida</span>
                      ) : null}
                    </td>
                    <td>{r.itens_total}</td>
                    <td>
                      <span className={`almox-badge almox-badge-${String(r.status).toLowerCase()}`}>{r.status}</span>
                    </td>
                    <td>
                      <div className="almox-actions">
                        <button className="btn-almox-secondary" title="Abrir a remessa"
                          onClick={() => abrirDetalhe(r)}><FiEye size={13} /> Abrir</button>
                        {STATUS_COM_ENVIO.includes(r.status) && (
                          <button className="btn-almox-primary" title="Enviar ao terceiro (retém o saldo)"
                            onClick={(e) => enviar(r, e)}><FiSend size={13} /> Enviar</button>
                        )}
                        {STATUS_COM_RETORNO.includes(r.status) && (
                          <button className="btn-almox-secondary" title="Registrar retorno do terceiro"
                            onClick={(e) => abrirModal('retorno', r, e)}><FiCornerDownLeft size={13} /> Retorno</button>
                        )}
                        {STATUS_COM_ENCERRAR.includes(r.status) && (
                          <button className="btn-almox-secondary" title="Encerrar a remessa"
                            onClick={(e) => abrirModal('encerrar', r, e)}><FiCheckSquare size={13} /> Encerrar</button>
                        )}
                        {STATUS_COM_CANCELAR.includes(r.status) && (
                          <button className="btn-almox-secondary" title="Cancelar a remessa"
                            onClick={(e) => abrirModal('cancelar', r, e)}><FiXCircle size={13} /> Cancelar</button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
      </div>

      {aberta && (
        <div className="almox-table-container almox-remessa-detalhe" style={{ marginTop: 16 }}>
          <h2 style={{ fontSize: '1rem', margin: '8px 12px' }}>
            {aberta.numero} — itens e retornos
          </h2>
          {rotuloBaixa && (
            // A frase existe porque a coluna "Baixado" nao e "Retornado": aqui o saldo saiu do
            // patrimonio sem voltar para a prateleira, e quem le a tela precisa saber disso.
            <p style={{ margin: '0 12px 8px', fontSize: '0.8rem', color: 'var(--gmp-error)' }}>
              Esta remessa teve {rotuloBaixa}
              {aberta.encerramento_justificativa ? `: ${aberta.encerramento_justificativa}` : ''}
              {aberta.cancelamento_motivo ? `: ${aberta.cancelamento_motivo}` : ''}
            </p>
          )}
          <table className="almox-table">
            <thead>
              <tr>
                <th>Código</th><th>Material</th><th>Un.</th><th>Enviado</th>
                <th title="Soma dos retornos registrados — o que voltou de verdade para a prateleira">Retornado</th>
                <th title="Saldo que deixou de ser pendente sem voltar: baixa no encerramento ou estorno do cancelamento">Baixado (não voltou)</th>
                <th>Ainda no terceiro</th>
              </tr>
            </thead>
            <tbody>
              {(aberta.itens || []).map((i) => {
                const retornado = retornadoPorItem[String(i.id)] || 0;
                // `quantidade_retornada` e o TETO acumulado que o motor usa; a parte dele que nao
                // tem retorno registrado foi liquidada (perda/consumo/estorno), nao devolvida.
                const baixado = Math.max(0, Number(i.quantidade_retornada || 0) - retornado);
                return (
                  <tr key={i.id}>
                    <td>{i.material_codigo}</td><td>{i.material_nome}</td><td>{i.unidade}</td>
                    <td>{i.quantidade}</td>
                    <td data-col="retornado">{retornado}</td>
                    <td data-col="baixado" title={baixado > 0 ? (rotuloBaixa || 'saldo baixado sem retorno') : undefined}>
                      {baixado > 0 ? `${baixado}${rotuloBaixa ? ` (${rotuloBaixa})` : ''}` : '—'}
                    </td>
                    <td>
                      <span className={`almox-badge almox-badge-${Number(i.pendente) > 0 ? 'baixo' : 'ok'}`}>{i.pendente}</span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {(aberta.retornos || []).length > 0 && (
            <p style={{ margin: '8px 12px', fontSize: '0.85rem' }}>
              Retornos recebidos: {aberta.retornos.map((r) => `${r.material_codigo} ${r.quantidade}${r.nota_fiscal ? ` (${r.nota_fiscal})` : ''}`).join(' · ')}
            </p>
          )}
        </div>
      )}

      {modal && (
        <div className="almox-modal-overlay" onClick={() => { if (!salvando) setModal(null); }}>
          <div className={`almox-modal ${modal.tipo === 'nova' ? 'almox-modal-lg' : 'almox-modal-sm'}`}
            onClick={(e) => e.stopPropagation()}>
            <div className="almox-modal-header">
              <h2>
                {modal.tipo === 'nova' ? 'Nova remessa a terceiros'
                  : modal.tipo === 'retorno' ? 'Registrar retorno'
                    : modal.tipo === 'encerrar' ? 'Encerrar remessa' : 'Cancelar remessa'}
              </h2>
              <button className="almox-modal-close" onClick={() => setModal(null)}>✕</button>
            </div>
            <div className="almox-modal-body">
              {modal.remessa && (
                <p style={{ marginTop: 0 }}><strong>{modal.remessa.numero}</strong> — {modal.remessa.fornecedor_nome}</p>
              )}

              {modal.tipo === 'nova' && (
                <>
                  <div className="almox-field">
                    <label className="almox-label">Terceiro cadastrado (Compras)</label>
                    <select className="almox-form-select" value={form.fornecedor_id || ''}
                      onChange={(e) => {
                        const f = fornecedores.find((x) => String(x.id) === String(e.target.value));
                        setForm((prev) => ({ ...prev, fornecedor_id: e.target.value || '', fornecedor_nome: f ? f.razao_social : prev.fornecedor_nome }));
                      }}>
                      <option value="">Não cadastrado / digitar abaixo</option>
                      {fornecedores.map((f) => (
                        <option key={f.id} value={f.id}>{f.razao_social}{f.cnpj ? ` — ${f.cnpj}` : ''}</option>
                      ))}
                    </select>
                  </div>
                  <div className="almox-field">
                    <label className="almox-label">Nome do terceiro<span className="required">*</span></label>
                    <input className="almox-input" value={form.fornecedor_nome || ''}
                      onChange={(e) => setForm((f) => ({ ...f, fornecedor_nome: e.target.value }))}
                      placeholder="Galvanizadora Sul LTDA" />
                    <small style={{ color: 'var(--gmp-text-light)', fontSize: '0.75rem' }}>
                      O terceiro pode não estar cadastrado em Compras — o nome digitado basta.
                    </small>
                  </div>
                  <div className="almox-field">
                    <label className="almox-label">Tipo de serviço</label>
                    <input className="almox-input" value={form.tipo_servico || ''}
                      onChange={(e) => setForm((f) => ({ ...f, tipo_servico: e.target.value }))}
                      placeholder="Galvanização, corte, dobra, usinagem, pintura..." />
                  </div>
                  <div className="almox-field">
                    <label className="almox-label">Prazo previsto de retorno</label>
                    <input className="almox-input" type="date" value={form.prazo_previsto || ''}
                      onChange={(e) => setForm((f) => ({ ...f, prazo_previsto: e.target.value }))} />
                  </div>
                  <div className="almox-field">
                    <label className="almox-label">Observações</label>
                    <textarea className="almox-input" rows={2} value={form.observacoes || ''}
                      onChange={(e) => setForm((f) => ({ ...f, observacoes: e.target.value }))} />
                  </div>

                  <div className="almox-field">
                    <label className="almox-label">Material<span className="required">*</span></label>
                    <select className="almox-form-select" value={novoItem.material_id}
                      onChange={(e) => setNovoItem((n) => ({ ...n, material_id: e.target.value }))}>
                      <option value="">Selecionar material...</option>
                      {materiais.map((m) => (
                        <option key={m.id} value={m.id}>
                          {m.codigo} — {m.nome}{nomeDoDono(m) ? ` [${nomeDoDono(m) === DONO_SEM_NOME ? nomeDoDono(m) : `cliente: ${nomeDoDono(m)}`}]` : ''}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="almox-field">
                    <label className="almox-label">Quantidade do item<span className="required">*</span></label>
                    <input className="almox-input" type="number" min="0" value={novoItem.quantidade}
                      onChange={(e) => setNovoItem((n) => ({ ...n, quantidade: e.target.value }))} />
                  </div>
                  <div className="almox-field">
                    <label className="almox-label">Peso do item (kg)</label>
                    <input className="almox-input" type="number" min="0" value={novoItem.peso}
                      onChange={(e) => setNovoItem((n) => ({ ...n, peso: e.target.value }))} />
                  </div>
                  <button type="button" className="btn-almox-secondary" onClick={adicionarItem}>
                    <FiPlus size={13} /> Adicionar item
                  </button>

                  <div className="almox-remessa-novos-itens" style={{ marginTop: 12 }}>
                    <table className="almox-table">
                      <thead>
                        <tr><th>Código</th><th>Material</th><th>Qtde</th><th>Peso</th><th /></tr>
                      </thead>
                      <tbody>
                        {itensNovos.map((i, idx) => (
                          <tr key={`${i.material_id}-${idx}`}>
                            <td>{i.codigo}</td>
                            <td>{i.nome}<SeloProprietario material={i} /></td>
                            <td>{i.quantidade} {i.unidade}</td>
                            <td>{i.peso === null ? '—' : i.peso}</td>
                            <td>
                              <button type="button" className="btn-almox-secondary" title="Remover o item"
                                onClick={() => setItensNovos((lista) => lista.filter((_, k) => k !== idx))}>
                                <FiTrash2 size={13} />
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    {itensNovos.length === 0 && (
                      <p style={{ margin: '8px 0', fontSize: '0.8rem', color: 'var(--gmp-text-light)' }}>
                        Nenhum item na remessa ainda. O saldo só sai do disponível no envio, não aqui.
                      </p>
                    )}
                  </div>
                </>
              )}

              {modal.tipo === 'retorno' && (
                <>
                  <div className="almox-field">
                    <label className="almox-label">Item retornado<span className="required">*</span></label>
                    <select className="almox-form-select" value={form.item_remessa_id || ''}
                      onChange={(e) => setForm((f) => ({ ...f, item_remessa_id: e.target.value }))}>
                      <option value="">Selecionar item...</option>
                      {(aberta?.id === modal.remessa.id ? (aberta.itens || []) : []).map((i) => (
                        <option key={i.id} value={i.id}>{i.material_codigo} — ainda no terceiro: {i.pendente}</option>
                      ))}
                    </select>
                  </div>
                  <div className="almox-field">
                    <label className="almox-label">Quantidade<span className="required">*</span></label>
                    <input className="almox-input" type="number" min="0" value={form.quantidade || ''}
                      onChange={(e) => setForm((f) => ({ ...f, quantidade: e.target.value }))} />
                  </div>
                  <div className="almox-field">
                    <label className="almox-label">Nota fiscal do retorno</label>
                    <input className="almox-input" value={form.nota_fiscal || ''}
                      onChange={(e) => setForm((f) => ({ ...f, nota_fiscal: e.target.value }))} />
                  </div>
                </>
              )}

              {modal.tipo === 'encerrar' && (
                <>
                  <div className="almox-field">
                    <label className="almox-label">Destino do saldo que não voltou<span className="required">*</span></label>
                    <select className="almox-form-select" value={form.destino || ''}
                      onChange={(e) => setForm((f) => ({ ...f, destino: e.target.value }))}>
                      <option value="">Selecionar destino...</option>
                      <option value="PERDA_NO_TERCEIRO">Perda no terceiro (sumiu ou foi danificado lá)</option>
                      <option value="CONSUMIDO_NO_PROCESSO">Consumido no processo (virou cavaco / refugo)</option>
                    </select>
                    <small style={{ color: 'var(--gmp-text-light)', fontSize: '0.75rem' }}>
                      Obrigatório quando sobrou material no terceiro: as duas opções dão baixa
                      definitiva no estoque. Se voltou tudo, a remessa já encerrou sozinha.
                    </small>
                  </div>
                  <div className="almox-field">
                    <label className="almox-label">Justificativa<span className="required">*</span></label>
                    <textarea className="almox-input" rows={3} value={form.justificativa || ''}
                      onChange={(e) => setForm((f) => ({ ...f, justificativa: e.target.value }))} />
                  </div>
                </>
              )}

              {modal.tipo === 'cancelar' && (
                <div className="almox-field">
                  <label className="almox-label">Motivo do cancelamento<span className="required">*</span></label>
                  <textarea className="almox-input" rows={3} value={form.motivo || ''}
                    onChange={(e) => setForm((f) => ({ ...f, motivo: e.target.value }))} />
                  <small style={{ color: 'var(--gmp-text-light)', fontSize: '0.75rem' }}>
                    O material que ainda estiver no terceiro volta para o disponível.
                  </small>
                </div>
              )}
            </div>
            <div className="almox-modal-footer">
              <button className="btn-almox-secondary" onClick={() => setModal(null)} disabled={salvando}>Fechar</button>
              <button className="btn-almox-primary" onClick={confirmar} disabled={salvando}>
                {salvando ? 'Salvando...'
                  : modal.tipo === 'nova' ? 'Criar remessa'
                    : modal.tipo === 'retorno' ? 'Confirmar retorno'
                      : modal.tipo === 'encerrar' ? 'Confirmar encerramento' : 'Confirmar cancelamento'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default RemessasTerceirosAlmoxarifado;
