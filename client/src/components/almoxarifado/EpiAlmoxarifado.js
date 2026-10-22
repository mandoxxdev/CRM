import React, { useState, useEffect, useMemo, useRef } from 'react';
import { toast } from 'react-toastify';
import { FiShield, FiRefreshCw, FiCheckCircle, FiAlertOctagon, FiFileText, FiSearch } from 'react-icons/fi';
import api from '../../services/api';
import { useAlmoxPermissoes } from '../../hooks/useAlmoxPermissoes';
import { SkeletonTable } from '../SkeletonLoader';
import AssinaturaCanvas from './AssinaturaCanvas';
import { formatarDataDoBanco, hojeLocalISO, lerInstanteDoBanco } from '../../utils/dataLocal';
import { resolveMaterialPhotoUrl } from '../../utils/resolveMaterialPhotoUrl';
import {
  MOTIVOS_EPI, rotuloMotivo, ehEpi, avisoDoCa, erroDaQuantidade, montarFormDataEntrega, codigoVerificacao, seloVerificacao,
  novaChaveIdempotencia, erroDaConfirmacao, mensagemErroEntrega, resumoCadeia,
} from '../../utils/epiEntrega';
import { gerarFichaEpiPdf } from '../../utils/fichaEpiPdf';
import './Almoxarifado.css';

/**
 * Etapa 178 (T2) — Entrega de EPI ao colaborador com assinatura na tela (NR-6).
 *
 * Tres abas no molde de FerramentasAlmoxarifado.js (botoes primary/secondary, sem CSS novo):
 *  - Nova entrega: colaborador DO CADASTRO (`/aux/colaboradores`, RN-178.03 — nunca texto livre), EPI (so material `is_epi`), a
 *    quantidade inteira, os opcionais deduzidos e a assinatura (`AssinaturaCanvas`) — tudo num POST multipart so (RN-178.05).
 *    O aviso de CA ausente/vencido aparece AO ESCOLHER o EPI e barra o envio, com o texto do servidor: sem isso a pessoa colhia a
 *    assinatura do colaborador para ouvir o 400 depois.
 *  - Entregas: a lista com filtros e, por linha, "Verificar integridade" (o servidor recalcula os dois hashes, RN-178.08).
 *  - Ficha: a recuperacao por colaborador (RN-178.09), com o PDF gerado no navegador (utils/fichaEpiPdf.js).
 *
 * Permissao: a acao `entregar_epi` (RN-178.02) e do servidor. Desde a Fase 5 (revisao adversarial, importante 5) as LEITURAS
 * (lista, ficha, verificar, cadeia, colaboradores) tambem exigem `entregar_epi`: sem ela a tela mostra so o aviso e nao chama
 * nada (cada chamada seria um 403).
 *
 * Fase 5 tambem: o colaborador DIGITA a propria matricula junto da assinatura (o servidor confere com o cadastro) — por isso o
 * seletor da Nova entrega mostra nome e setor, sem a matricula (letra B); cada tentativa de envio leva uma `chave_idempotencia`
 * (o reenvio depois de a rede cair nao duplica a entrega); e a aba Entregas verifica a cadeia inteira das evidencias.
 */

const FORM_VAZIO = {
  colaborador_id: '', material_id: '', quantidade: '1', tamanho: '', motivo: '', observacao: '', confirmacao_matricula: '',
};
const FILTROS_VAZIOS = { colaborador_id: '', material_id: '', de: '', ate: '' };

const rotuloColaborador = (c) => (c ? [c.nome, c.matricula].filter(Boolean).join(' — ') : '');
// Na Nova entrega o seletor NAO mostra a matricula: e ela que o colaborador digita para confirmar (Fase 5).
const rotuloColaboradorEntrega = (c) => (c ? `${c.nome}${c.setor ? ` (${c.setor})` : ''}` : '');
const rotuloMaterial = (m) => [m.codigo, m.nome].filter(Boolean).join(' — ');
// Regra da Etapa 170: o `criado_em` (instante UTC do servidor) no dia de Brasilia, nunca os 10 primeiros caracteres.
const diaDaEntrega = (v) => { const d = lerInstanteDoBanco(v); return d ? formatarDataDoBanco(hojeLocalISO(d)) : '—'; };
const validadeCa = (v) => formatarDataDoBanco(v, '—', { soData: true });

const EpiAlmoxarifado = () => {
  const { pode, bloquearSeNaoPode } = useAlmoxPermissoes();
  const podeEntregar = pode('entregar_epi');
  // Fase 5 (M2): a chave da tentativa de envio. Vale ate a entrega sair ou o servidor responder; se a rede cair sem resposta, o
  // proximo toque reusa a MESMA chave (o servidor devolve a entrega ja gravada). Mexer no formulario ou na assinatura troca.
  const chaveRef = useRef(null);

  const [aba, setAba] = useState('ENTREGAR');
  const [colaboradores, setColaboradores] = useState([]);
  const [materiais, setMateriais] = useState([]);

  // Nova entrega
  const [form, setForm] = useState(FORM_VAZIO);
  const [buscaEpi, setBuscaEpi] = useState('');
  const [assinatura, setAssinatura] = useState(null);
  const [canvasKey, setCanvasKey] = useState(0);
  const [salvando, setSalvando] = useState(false);
  const [ultima, setUltima] = useState(null);

  // Entregas
  const [filtros, setFiltros] = useState(FILTROS_VAZIOS);
  const [entregas, setEntregas] = useState([]);
  const [loadingEntregas, setLoadingEntregas] = useState(true);
  const [reloadEntregas, setReloadEntregas] = useState(0);
  const [selos, setSelos] = useState({});

  // Ficha
  const [fichaColaboradorId, setFichaColaboradorId] = useState('');
  const [ficha, setFicha] = useState(null);
  const [loadingFicha, setLoadingFicha] = useState(false);
  const [reloadFicha, setReloadFicha] = useState(0);
  const [gerandoPdf, setGerandoPdf] = useState(false);
  const [cadeia, setCadeia] = useState(null);
  const [verificandoCadeia, setVerificandoCadeia] = useState(false);

  useEffect(() => {
    if (!podeEntregar) return undefined;
    let cancelado = false;
    Promise.all([
      api.get('/almoxarifado/aux/colaboradores').catch(() => {
        toast.error('Não foi possível carregar os colaboradores');
        return { data: [] };
      }),
      api.get('/almoxarifado/materiais').catch(() => {
        toast.error('Não foi possível carregar os materiais');
        return { data: [] };
      }),
    ]).then(([col, mat]) => {
      if (cancelado) return;
      setColaboradores(Array.isArray(col.data) ? col.data : []);
      setMateriais(Array.isArray(mat.data) ? mat.data : []);
    });
    return () => { cancelado = true; };
  }, [podeEntregar]);

  const epis = useMemo(() => materiais.filter(ehEpi), [materiais]);
  const episFiltrados = useMemo(() => {
    const q = buscaEpi.trim().toLowerCase();
    if (!q) return epis;
    return epis.filter((m) => rotuloMaterial(m).toLowerCase().includes(q) || String(m.ca_numero || '').toLowerCase().includes(q));
  }, [epis, buscaEpi]);
  const epiEscolhido = useMemo(
    () => epis.find((m) => String(m.id) === String(form.material_id)) || null,
    [epis, form.material_id],
  );
  const avisoCa = epiEscolhido ? avisoDoCa(epiEscolhido) : null;

  useEffect(() => {
    if (aba !== 'ENTREGAS' || !podeEntregar) return undefined;
    let cancelado = false;
    setLoadingEntregas(true);
    const params = {};
    Object.entries(filtros).forEach(([k, v]) => { if (v) params[k] = v; });
    api.get('/almoxarifado/epi/entregas', { params })
      .then((r) => { if (!cancelado) setEntregas(Array.isArray(r.data) ? r.data : []); })
      .catch((err) => {
        if (cancelado) return;
        setEntregas([]);
        toast.error(err.response?.data?.error || 'Não foi possível carregar as entregas de EPI');
      })
      .finally(() => { if (!cancelado) setLoadingEntregas(false); });
    return () => { cancelado = true; };
  }, [aba, filtros, reloadEntregas, podeEntregar]);

  useEffect(() => {
    if (aba !== 'FICHA' || !fichaColaboradorId || !podeEntregar) return undefined;
    let cancelado = false;
    setLoadingFicha(true);
    setFicha(null);
    api.get(`/almoxarifado/epi/ficha/${fichaColaboradorId}`)
      .then((r) => { if (!cancelado) setFicha(r.data || null); })
      .catch((err) => {
        if (!cancelado) toast.error(err.response?.data?.error || 'Não foi possível carregar a ficha de EPI');
      })
      .finally(() => { if (!cancelado) setLoadingFicha(false); });
    return () => { cancelado = true; };
  }, [aba, fichaColaboradorId, reloadFicha, podeEntregar]);

  const set = (campo, valor) => { chaveRef.current = null; setForm((f) => ({ ...f, [campo]: valor })); };

  const limparAssinatura = () => { chaveRef.current = null; setAssinatura(null); setCanvasKey((k) => k + 1); };

  const registrar = async (evento) => {
    if (!bloquearSeNaoPode('entregar_epi', evento)) return;
    if (!form.colaborador_id) { toast.error('Selecione o colaborador'); return; }
    if (!form.material_id || !epiEscolhido) { toast.error('Selecione o EPI'); return; }
    if (avisoCa) { toast.error(avisoCa); return; }
    const erroQtd = erroDaQuantidade(form.quantidade);
    if (erroQtd) { toast.error(erroQtd); return; }
    if (!assinatura) { toast.error('A assinatura do colaborador é obrigatória'); return; }
    const erroConf = erroDaConfirmacao(form.confirmacao_matricula);
    if (erroConf) { toast.error(erroConf); return; }

    if (!chaveRef.current) chaveRef.current = novaChaveIdempotencia();
    setSalvando(true);
    try {
      const fd = montarFormDataEntrega(form, assinatura, chaveRef.current);
      const res = await api.post('/almoxarifado/epi/entregas', fd, { headers: { 'Content-Type': 'multipart/form-data' } });
      chaveRef.current = null;
      const dados = res.data || {};
      setUltima({
        numero: dados.numero,
        registro: dados.evidencia?.registro_sha256 || '',
        colaborador: rotuloColaborador(colaboradores.find((c) => String(c.id) === String(form.colaborador_id))),
      });
      if (dados.reutilizada) {
        toast.success(`Entrega ${dados.numero} já estava registrada — o envio repetido não duplicou`);
      } else {
        toast.success(dados.numero ? `Entrega ${dados.numero} registrada` : 'Entrega registrada');
      }
      setForm(FORM_VAZIO);
      setBuscaEpi('');
      limparAssinatura();
      setReloadEntregas((t) => t + 1);
    } catch (err) {
      // O servidor respondeu: nada foi gravado como entrega (a recusa, ou a saida sem evidencia que o 500 descreve) — a proxima
      // tentativa e outra. Sem resposta: a chave fica, e o proximo toque nao duplica.
      if (err && err.response) chaveRef.current = null;
      toast.error(mensagemErroEntrega(err));
    } finally {
      setSalvando(false);
    }
  };

  const verificarCadeia = async () => {
    setVerificandoCadeia(true);
    try {
      const res = await api.get('/almoxarifado/epi/cadeia/verificar');
      setCadeia(resumoCadeia(res.data));
    } catch (err) {
      setCadeia(null);
      toast.error(err.response?.data?.error || 'Não foi possível verificar a cadeia');
    } finally {
      setVerificandoCadeia(false);
    }
  };

  const verificar = async (entrega) => {
    setSelos((s) => ({ ...s, [entrega.id]: { carregando: true } }));
    try {
      const res = await api.get(`/almoxarifado/epi/entregas/${entrega.id}/verificar`);
      setSelos((s) => ({ ...s, [entrega.id]: seloVerificacao(res.data) }));
    } catch (err) {
      setSelos((s) => ({ ...s, [entrega.id]: undefined }));
      toast.error(err.response?.data?.error || 'Não foi possível verificar a integridade');
    }
  };

  const abrirFicha = (colaboradorId) => {
    setFichaColaboradorId(String(colaboradorId));
    setAba('FICHA');
  };

  const baixarPdf = async () => {
    if (!ficha) return;
    setGerandoPdf(true);
    // Etapa 178 (T3): a `arquivo_url` da assinatura e assinada por ~15 min (servidor, materialPhotoUrl). Com a ficha aberta ha mais
    // tempo, o fetch do PDF dava 404 e a ficha da NR-6 saia sem as assinaturas, sem aviso. Rele a ficha (URLs novas) antes de gerar;
    // se a releitura falhar, NAO gera com as URLs velhas.
    let atual;
    try {
      const r = await api.get(`/almoxarifado/epi/ficha/${ficha.colaborador?.id || fichaColaboradorId}`);
      atual = r.data || ficha;
      setFicha(atual);
    } catch (err) {
      toast.error(err.response?.data?.error || 'Não foi possível reler a ficha para gerar o PDF');
      setGerandoPdf(false);
      return;
    }
    try {
      const doc = await gerarFichaEpiPdf(atual);
      const faltando = doc?.assinaturasIndisponiveis || 0;
      if (faltando > 0) {
        toast.warn(faltando === 1
          ? '1 assinatura não pôde ser carregada e saiu como indisponível no PDF'
          : `${faltando} assinaturas não puderam ser carregadas e saíram como indisponíveis no PDF`);
      }
    } catch (err) {
      toast.error('Não foi possível gerar o PDF da ficha');
    } finally {
      setGerandoPdf(false);
    }
  };

  const recarregarAtual = () => {
    if (aba === 'ENTREGAS') setReloadEntregas((t) => t + 1);
    else if (aba === 'FICHA') setReloadFicha((t) => t + 1);
  };

  const setFiltro = (campo, valor) => setFiltros((f) => ({ ...f, [campo]: valor }));

  return (
    <div className="almox-page">
      <div className="almox-header">
        <div>
          <h1><FiShield size={20} /> Entrega de EPI</h1>
          <p>Entrega ao colaborador com assinatura na tela, ficha por colaborador e verificação de integridade (NR-6)</p>
        </div>
        <div className="almox-header-actions">
          <button className="btn-almox-secondary" onClick={recarregarAtual}>
            <FiRefreshCw size={13} /> Atualizar
          </button>
        </div>
      </div>

      {!podeEntregar && (
        <div className="almox-aviso-erro almox-epi-sem-perfil" style={{ marginTop: 12 }}>
          Seu perfil não acessa a entrega de EPI — só o almoxarife e o administrador do módulo registram entregas e consultam
          fichas.
        </div>
      )}

      {podeEntregar && (
      <div style={{ display: 'flex', gap: 8, margin: '12px 0', flexWrap: 'wrap' }}>
        <button className={aba === 'ENTREGAR' ? 'btn-almox-primary' : 'btn-almox-secondary'} onClick={() => setAba('ENTREGAR')}>Nova entrega</button>
        <button className={aba === 'ENTREGAS' ? 'btn-almox-primary' : 'btn-almox-secondary'} onClick={() => setAba('ENTREGAS')}>Entregas</button>
        <button className={aba === 'FICHA' ? 'btn-almox-primary' : 'btn-almox-secondary'} onClick={() => setAba('FICHA')}>Ficha por colaborador</button>
      </div>
      )}

      {podeEntregar && aba === 'ENTREGAR' && (
        <div className="almox-epi-entrega">
          {ultima && (
            <div className="almox-epi-sucesso" style={{
              marginBottom: 12, padding: '10px 14px', borderRadius: 8,
              border: '1px solid rgba(16, 185, 129, 0.35)', background: 'rgba(16, 185, 129, 0.08)',
            }}>
              <FiCheckCircle size={14} /> Entrega <strong>{ultima.numero}</strong> registrada
              {ultima.colaborador ? ` para ${ultima.colaborador}` : ''}. Código de verificação:{' '}
              <strong className="almox-epi-codigo" title={ultima.registro}>{codigoVerificacao(ultima.registro)}</strong>
            </div>
          )}
          <div className="almox-form-grid">
            <div className="almox-field">
              <label className="almox-label" htmlFor="epi-colaborador">Colaborador *</label>
              <select id="epi-colaborador" className="almox-select" value={form.colaborador_id}
                onChange={(e) => set('colaborador_id', e.target.value)}>
                <option value="">Selecione...</option>
                {colaboradores.map((c) => <option key={c.id} value={c.id}>{rotuloColaboradorEntrega(c)}</option>)}
              </select>
            </div>
            <div className="almox-field">
              <label className="almox-label" htmlFor="epi-busca">Buscar EPI</label>
              <input id="epi-busca" className="almox-input" placeholder="Código, nome ou CA" value={buscaEpi}
                onChange={(e) => setBuscaEpi(e.target.value)} />
            </div>
            <div className="almox-field almox-form-full">
              <label className="almox-label" htmlFor="epi-material">EPI *</label>
              <select id="epi-material" className="almox-select" value={form.material_id}
                onChange={(e) => set('material_id', e.target.value)}>
                <option value="">{epis.length === 0 ? 'Nenhum material marcado como EPI' : 'Selecione...'}</option>
                {episFiltrados.map((m) => (
                  <option key={m.id} value={m.id}>
                    {rotuloMaterial(m)}{m.ca_numero ? ` (CA ${m.ca_numero})` : ''}
                  </option>
                ))}
              </select>
              {epiEscolhido && (
                <div className="almox-epi-ca" style={{ fontSize: '0.8rem', marginTop: 4 }}>
                  CA: {epiEscolhido.ca_numero || '—'} · validade: {validadeCa(epiEscolhido.ca_validade)}
                </div>
              )}
              {avisoCa && (
                <div className="almox-aviso-erro almox-epi-aviso-ca" role="alert" style={{ marginTop: 6, marginBottom: 0 }}>
                  <FiAlertOctagon size={14} /> {avisoCa}
                </div>
              )}
            </div>
            <div className="almox-field">
              <label className="almox-label" htmlFor="epi-quantidade">Quantidade *</label>
              <input id="epi-quantidade" className="almox-input" type="number" min="1" step="1" value={form.quantidade}
                onChange={(e) => set('quantidade', e.target.value)} />
            </div>
            <div className="almox-field">
              <label className="almox-label" htmlFor="epi-tamanho">Tamanho</label>
              <input id="epi-tamanho" className="almox-input" maxLength={20} placeholder="Ex.: G, 42" value={form.tamanho}
                onChange={(e) => set('tamanho', e.target.value)} />
            </div>
            <div className="almox-field">
              <label className="almox-label" htmlFor="epi-motivo">Motivo</label>
              <select id="epi-motivo" className="almox-select" value={form.motivo} onChange={(e) => set('motivo', e.target.value)}>
                <option value="">—</option>
                {MOTIVOS_EPI.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}
              </select>
            </div>
            <div className="almox-field almox-form-full">
              <label className="almox-label" htmlFor="epi-observacao">Observação</label>
              <textarea id="epi-observacao" className="almox-textarea" maxLength={500} rows={2} value={form.observacao}
                onChange={(e) => set('observacao', e.target.value)} />
            </div>
            <div className="almox-field almox-form-full">
              <label className="almox-label">Assinatura do colaborador *</label>
              {assinatura ? (
                <div className="almox-epi-assinatura-ok" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <FiCheckCircle size={14} /> Assinatura confirmada
                  <button type="button" className="btn-almox-secondary" onClick={limparAssinatura}>Refazer assinatura</button>
                </div>
              ) : (
                <AssinaturaCanvas key={canvasKey} onConfirm={(blob) => { chaveRef.current = null; setAssinatura(blob); }} />
              )}
            </div>
            <div className="almox-field">
              <label className="almox-label" htmlFor="epi-confirmacao-matricula">Matrícula — digitada pelo colaborador *</label>
              <input id="epi-confirmacao-matricula" className="almox-input" autoComplete="off" maxLength={40}
                placeholder="O colaborador digita a própria matrícula" value={form.confirmacao_matricula}
                onChange={(e) => set('confirmacao_matricula', e.target.value)} />
            </div>
          </div>
          <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 12 }}>
            <button type="button" className="btn-almox-primary" onClick={registrar} disabled={salvando}>
              {salvando ? 'Registrando...' : 'Registrar entrega'}
            </button>
          </div>
        </div>
      )}

      {podeEntregar && aba === 'ENTREGAS' && (
        <>
          <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 8 }}>
            <button type="button" className="btn-almox-secondary" onClick={verificarCadeia} disabled={verificandoCadeia}>
              <FiShield size={12} /> {verificandoCadeia ? 'Verificando...' : 'Verificar cadeia'}
            </button>
          </div>
          {cadeia && (
            <div className={`almox-epi-cadeia ${cadeia.ok ? '' : 'almox-aviso-erro'}`} role="status" style={{
              marginBottom: 12, padding: '10px 14px', borderRadius: 8,
              border: cadeia.ok ? '1px solid rgba(16, 185, 129, 0.35)' : undefined,
              background: cadeia.ok ? 'rgba(16, 185, 129, 0.08)' : undefined,
            }}>
              {cadeia.ok ? <FiCheckCircle size={14} /> : <FiAlertOctagon size={14} />} {cadeia.texto}
              {cadeia.problemas.length > 0 && (
                <ul style={{ margin: '6px 0 0 18px' }}>
                  {cadeia.problemas.map((p, i) => <li key={i}>{p}</li>)}
                </ul>
              )}
            </div>
          )}
          <div className="almox-filters">
            <select className="almox-select" aria-label="Filtrar por colaborador" value={filtros.colaborador_id}
              onChange={(e) => setFiltro('colaborador_id', e.target.value)}>
              <option value="">Todos os colaboradores</option>
              {colaboradores.map((c) => <option key={c.id} value={c.id}>{rotuloColaborador(c)}</option>)}
            </select>
            <select className="almox-select" aria-label="Filtrar por EPI" value={filtros.material_id}
              onChange={(e) => setFiltro('material_id', e.target.value)}>
              <option value="">Todos os EPIs</option>
              {epis.map((m) => <option key={m.id} value={m.id}>{rotuloMaterial(m)}</option>)}
            </select>
            <input className="almox-input" type="date" aria-label="De" value={filtros.de} onChange={(e) => setFiltro('de', e.target.value)} />
            <input className="almox-input" type="date" aria-label="Até" value={filtros.ate} onChange={(e) => setFiltro('ate', e.target.value)} />
          </div>
          <div className="almox-table-container">
            {loadingEntregas ? <SkeletonTable rows={5} columns={9} />
              : entregas.length === 0 ? (
                <div className="almox-empty"><p>Nenhuma entrega de EPI encontrada</p></div>
              ) : (
                <table className="almox-table almox-epi-lista">
                  <thead>
                    <tr>
                      <th>Número</th><th>Data</th><th>Colaborador</th><th>EPI</th><th>CA</th><th>Qtd</th>
                      <th>Tamanho</th><th>Motivo</th><th>Entregue por</th><th>Integridade</th>
                    </tr>
                  </thead>
                  <tbody>
                    {entregas.map((e) => {
                      const selo = selos[e.id];
                      return (
                        <tr key={e.id}>
                          <td>{e.numero}</td>
                          <td>{diaDaEntrega(e.criado_em)}</td>
                          <td>
                            {rotuloColaborador({ nome: e.colaborador_nome, matricula: e.matricula })}
                            <div>
                              <button type="button" className="btn-almox-secondary" style={{ marginTop: 4, padding: '2px 8px', fontSize: '0.75rem' }} onClick={() => abrirFicha(e.colaborador_id)}>
                                <FiFileText size={12} /> Ficha
                              </button>
                            </div>
                          </td>
                          <td>{rotuloMaterial({ codigo: e.material_codigo, nome: e.material_nome })}</td>
                          <td>{e.ca_numero || '—'}</td>
                          <td>{Number(e.quantidade || 0)}</td>
                          <td>{e.tamanho || '—'}</td>
                          <td>{e.motivo ? rotuloMotivo(e.motivo) : '—'}</td>
                          <td>{e.entregue_por_nome || '—'}</td>
                          <td>
                            {selo && !selo.carregando ? (
                              <span className={`almox-badge almox-badge-${selo.ok ? 'ok' : 'critico'} almox-epi-selo`}>{selo.texto}</span>
                            ) : (
                              <button type="button" className="btn-almox-secondary" disabled={!!selo?.carregando} onClick={() => verificar(e)}>
                                <FiSearch size={12} /> Verificar integridade
                              </button>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}
          </div>
        </>
      )}

      {podeEntregar && aba === 'FICHA' && (
        <>
          <div className="almox-filters">
            <select className="almox-select" aria-label="Colaborador da ficha" value={fichaColaboradorId}
              onChange={(e) => setFichaColaboradorId(e.target.value)}>
              <option value="">Selecione o colaborador...</option>
              {colaboradores.map((c) => <option key={c.id} value={c.id}>{rotuloColaborador(c)}</option>)}
              {/* A ficha aberta pela lista pode ser de colaborador excluido (fora da lista de ativos) — a opcao existe para o select mostrar. */}
              {fichaColaboradorId && !colaboradores.some((c) => String(c.id) === fichaColaboradorId) && (
                <option value={fichaColaboradorId}>{ficha?.colaborador?.nome || `Colaborador #${fichaColaboradorId}`}</option>
              )}
            </select>
            <button type="button" className="btn-almox-primary" onClick={baixarPdf} disabled={!ficha || gerandoPdf}>
              <FiFileText size={13} /> {gerandoPdf ? 'Gerando...' : 'Gerar PDF'}
            </button>
          </div>
          {loadingFicha && <SkeletonTable rows={3} columns={6} />}
          {!loadingFicha && ficha && (
            <div className="almox-epi-ficha">
              <div style={{ marginBottom: 12 }}>
                <strong>{ficha.colaborador?.nome}</strong>
                {ficha.colaborador?.excluido && (
                  <span className="almox-badge almox-badge-critico almox-epi-excluido" style={{ marginLeft: 8 }}>Excluído do cadastro</span>
                )}
                <div style={{ fontSize: '0.85rem' }}>
                  Matrícula: {ficha.colaborador?.matricula || '—'} · Setor: {ficha.colaborador?.setor || '—'} · CPF: {ficha.colaborador?.cpf_mascarado || '—'}
                </div>
              </div>
              {(ficha.entregas || []).length === 0 ? (
                <div className="almox-empty"><p>Nenhuma entrega de EPI para este colaborador</p></div>
              ) : (
                <div className="almox-table-container">
                  <table className="almox-table almox-epi-ficha-lista">
                    <thead>
                      <tr>
                        <th>Data</th><th>EPI</th><th>CA</th><th>Validade CA</th><th>Qtd</th><th>Tamanho</th>
                        <th>Motivo</th><th>Entregue por</th><th>Assinatura</th><th>Hash do registro</th>
                      </tr>
                    </thead>
                    <tbody>
                      {ficha.entregas.map((e) => (
                        <tr key={e.id}>
                          <td>{diaDaEntrega(e.criado_em)}</td>
                          <td>{rotuloMaterial({ codigo: e.material_codigo, nome: e.material_nome })}</td>
                          <td>{e.ca_numero || '—'}</td>
                          <td>{validadeCa(e.ca_validade)}</td>
                          <td>{Number(e.quantidade || 0)}</td>
                          <td>{e.tamanho || '—'}</td>
                          <td>{e.motivo ? rotuloMotivo(e.motivo) : '—'}</td>
                          <td>{e.entregue_por_nome || '—'}</td>
                          <td>
                            {resolveMaterialPhotoUrl(e.arquivo_url) ? (
                              <img src={resolveMaterialPhotoUrl(e.arquivo_url)} alt="Assinatura" style={{ height: 36, background: '#fff' }} />
                            ) : '—'}
                          </td>
                          <td title={e.registro_sha256}><code>{codigoVerificacao(e.registro_sha256)}</code></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
};

export default EpiAlmoxarifado;
