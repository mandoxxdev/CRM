/**
 * Aba "Regras de Aprovação" das Configurações do Almoxarifado (Etapa 47, T6).
 *
 * Contrato: docs/superpowers/specs/2026-09-30-almoxarifado-etapa47-aprovacoes-com-regras-design.md,
 * seções 9.5 e 9.7. Quem decide é sempre o backend — as recusas chegam com a literal dele e
 * aparecem no toast como vieram; esta tela não revalida nada além do que evita um POST vazio.
 *
 * A costura com a fila (T7): DESATIVAR uma regra com pendência aberta torna essas pendências
 * OBSOLETAS (deixam de bloquear a aprovação). A tela avisa quantas antes de confirmar, e diz quantas
 * foram obsoletadas depois — é o único lugar onde esse efeito é visível no ato.
 *
 * `projeto_id` existe no contrato mas NÃO nesta tela: o formulário de requisição não grava projeto,
 * então uma regra por projeto nunca casaria com requisição criada pela tela. Fica pela API.
 */
import React, { useEffect, useState } from 'react';
import { toast } from 'react-toastify';
import { FiEdit2, FiPlus, FiRefreshCw, FiSave, FiX } from 'react-icons/fi';
import api from '../../services/api';
import { useAuth } from '../../context/AuthContext';
import { filterVisibleUsers } from '../../utils/systemPermissions';
import TIPO_REQUISICAO_LABELS from './requisicaoLabels';

const formatMoeda = (v) => Number(v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

const FORM_VAZIO = {
  nome: '', tipo_requisicao: '', material_critico: false, valor_minimo: '', quantidade_minima: '',
  centro_custo_id: '', aprovadores: [], ativo: true,
};

function resumoCriterios(regra, centrosPorId) {
  const partes = [];
  if (regra.tipo_requisicao) partes.push(`Tipo: ${TIPO_REQUISICAO_LABELS[regra.tipo_requisicao] || regra.tipo_requisicao}`);
  if (regra.material_critico) partes.push('Algum item é material crítico');
  if (regra.valor_minimo != null) partes.push(`Valor ≥ ${formatMoeda(regra.valor_minimo)}`);
  if (regra.quantidade_minima != null) partes.push(`Algum item com quantidade ≥ ${regra.quantidade_minima}`);
  if (regra.centro_custo_id != null) {
    const cc = centrosPorId.get(Number(regra.centro_custo_id));
    partes.push(`Centro de custo: ${cc ? `${cc.codigo} — ${cc.nome}` : `#${regra.centro_custo_id}`}`);
  }
  if (regra.projeto_id != null) partes.push(`Projeto #${regra.projeto_id}`);
  return partes.join(' e ');
}

function paraPayload(form) {
  return {
    nome: form.nome,
    tipo_requisicao: form.tipo_requisicao || null,
    material_critico: !!form.material_critico,
    valor_minimo: form.valor_minimo === '' ? null : Number(form.valor_minimo),
    quantidade_minima: form.quantidade_minima === '' ? null : Number(form.quantidade_minima),
    centro_custo_id: form.centro_custo_id === '' ? null : Number(form.centro_custo_id),
    aprovadores: form.aprovadores,
    ativo: !!form.ativo,
  };
}

const TabRegrasAprovacao = () => {
  const { user } = useAuth();
  const [regras, setRegras] = useState([]);
  const [usuarios, setUsuarios] = useState([]);
  const [centros, setCentros] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editando, setEditando] = useState(null); // null | 'nova' | regra
  const [form, setForm] = useState(FORM_VAZIO);
  const [saving, setSaving] = useState(false);
  const [confirmarDesativar, setConfirmarDesativar] = useState(null); // regra | null
  const [busca, setBusca] = useState('');

  const carregar = async () => {
    setLoading(true);
    try {
      const [regrasRes, usrRes, ccRes] = await Promise.all([
        api.get('/almoxarifado/regras-aprovacao'),
        api.get('/usuarios').catch(() => ({ data: [] })),
        api.get('/almoxarifado/centros-custo').catch(() => ({ data: [] })),
      ]);
      setRegras(Array.isArray(regrasRes.data) ? regrasRes.data : []);
      setUsuarios(filterVisibleUsers(usrRes.data || [], user).filter((u) => u.ativo !== 0));
      setCentros(Array.isArray(ccRes.data) ? ccRes.data : []);
    } catch (err) {
      toast.error(err.response?.data?.error || 'Erro ao carregar regras de aprovação');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { carregar(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const usuariosPorId = new Map(usuarios.map((u) => [Number(u.id), u]));
  const centrosPorId = new Map(centros.map((c) => [Number(c.id), c]));

  const abrirNova = () => { setForm(FORM_VAZIO); setEditando('nova'); };
  const abrirEdicao = (regra) => {
    setForm({
      nome: regra.nome || '',
      tipo_requisicao: regra.tipo_requisicao || '',
      material_critico: !!regra.material_critico,
      valor_minimo: regra.valor_minimo ?? '',
      quantidade_minima: regra.quantidade_minima ?? '',
      centro_custo_id: regra.centro_custo_id ?? '',
      aprovadores: regra.aprovadores || [],
      ativo: !!regra.ativo,
    });
    setEditando(regra);
  };

  const toggleAprovador = (id) => setForm((f) => {
    const ids = new Set(f.aprovadores);
    if (ids.has(id)) ids.delete(id); else ids.add(id);
    return { ...f, aprovadores: [...ids] };
  });

  const salvar = async () => {
    setSaving(true);
    try {
      if (editando === 'nova') {
        await api.post('/almoxarifado/regras-aprovacao', paraPayload(form));
        toast.success('Regra criada');
      } else {
        const res = await api.put(`/almoxarifado/regras-aprovacao/${editando.id}`, paraPayload(form));
        avisarObsoletadas(res.data?.pendencias_obsoletadas);
        toast.success('Regra salva');
      }
      setEditando(null);
      await carregar();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Erro ao salvar regra');
    } finally {
      setSaving(false);
    }
  };

  const avisarObsoletadas = (n) => {
    if (n > 0) toast.info(`${n} aprovação(ões) pendente(s) desta regra deixaram de bloquear requisições`);
  };

  const alternarAtivo = async (regra) => {
    // Desativar com pendência aberta pede confirmação: o efeito atinge requisições em andamento.
    if (regra.ativo && regra.pendencias_abertas > 0 && confirmarDesativar?.id !== regra.id) {
      setConfirmarDesativar(regra);
      return;
    }
    setConfirmarDesativar(null);
    try {
      const res = await api.put(`/almoxarifado/regras-aprovacao/${regra.id}`, {
        ...paraPayload({
          nome: regra.nome,
          tipo_requisicao: regra.tipo_requisicao || '',
          material_critico: !!regra.material_critico,
          valor_minimo: regra.valor_minimo ?? '',
          quantidade_minima: regra.quantidade_minima ?? '',
          centro_custo_id: regra.centro_custo_id ?? '',
          aprovadores: regra.aprovadores || [],
          ativo: !regra.ativo,
        }),
        projeto_id: regra.projeto_id ?? null,
      });
      avisarObsoletadas(res.data?.pendencias_obsoletadas);
      toast.success(regra.ativo ? 'Regra desativada' : 'Regra ativada');
      await carregar();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Erro ao alterar a regra');
    }
  };

  if (loading) {
    return <div className="almox-loading"><FiRefreshCw size={16} style={{ animation: 'spin 1s linear infinite' }} /> Carregando...</div>;
  }

  const usuariosFiltrados = usuarios.filter((u) => {
    if (!busca.trim()) return true;
    const q = busca.toLowerCase();
    return (u.nome || '').toLowerCase().includes(q) || (u.email || '').toLowerCase().includes(q);
  });

  return (
    <div style={{ maxWidth: 900 }}>
      <p style={{ color: 'var(--gmp-text-light)', fontSize: '0.875rem', marginBottom: 16 }}>
        Uma requisição que se encaixa numa regra ativa precisa da assinatura de um dos aprovadores da regra
        antes de ser aprovada. Se ela se encaixa em várias regras, precisa de uma assinatura por regra — de
        pessoas diferentes. As regras somam à aprovação normal e à liberação por valor; não substituem.
      </p>

      {!editando && (
        <button type="button" className="btn-almox-primary" onClick={abrirNova} style={{ marginBottom: 16 }}>
          <FiPlus size={14} /> Nova regra
        </button>
      )}

      {editando && (
        <div data-testid="form-regra" style={{ background: 'var(--gmp-surface)', border: '1px solid var(--gmp-border)', borderRadius: 10, padding: 18, marginBottom: 20 }}>
          <div style={{ fontWeight: 700, marginBottom: 12 }}>{editando === 'nova' ? 'Nova regra' : `Editar regra: ${editando.nome}`}</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 12 }}>
            <div className="almox-field">
              <label className="almox-label" htmlFor="regra-nome">Nome</label>
              <input id="regra-nome" className="almox-input" value={form.nome}
                onChange={(e) => setForm((f) => ({ ...f, nome: e.target.value }))} />
            </div>
            <div className="almox-field">
              <label className="almox-label" htmlFor="regra-tipo">Tipo de requisição</label>
              <select id="regra-tipo" className="almox-form-select" value={form.tipo_requisicao}
                onChange={(e) => setForm((f) => ({ ...f, tipo_requisicao: e.target.value }))}>
                <option value="">Qualquer</option>
                {Object.entries(TIPO_REQUISICAO_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
              </select>
            </div>
            <div className="almox-field">
              <label className="almox-label" htmlFor="regra-valor">Valor total a partir de (R$)</label>
              <input id="regra-valor" className="almox-input" type="number" min="0" step="0.01" value={form.valor_minimo}
                onChange={(e) => setForm((f) => ({ ...f, valor_minimo: e.target.value }))} />
            </div>
            <div className="almox-field">
              <label className="almox-label" htmlFor="regra-qtd">Algum item com quantidade a partir de</label>
              <input id="regra-qtd" className="almox-input" type="number" min="0" step="any" value={form.quantidade_minima}
                onChange={(e) => setForm((f) => ({ ...f, quantidade_minima: e.target.value }))} />
            </div>
            <div className="almox-field">
              <label className="almox-label" htmlFor="regra-cc">Centro de custo</label>
              <select id="regra-cc" className="almox-form-select" value={form.centro_custo_id}
                onChange={(e) => setForm((f) => ({ ...f, centro_custo_id: e.target.value }))}>
                <option value="">Qualquer</option>
                {centros.map((c) => <option key={c.id} value={c.id}>{c.codigo} — {c.nome}</option>)}
              </select>
            </div>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: '0.875rem', marginTop: 22 }}>
              <input type="checkbox" checked={form.material_critico}
                onChange={(e) => setForm((f) => ({ ...f, material_critico: e.target.checked }))} />
              Algum item é material crítico
            </label>
          </div>
          <div style={{ fontSize: '0.75rem', color: 'var(--gmp-text-light)', margin: '8px 0 14px' }}>
            A regra vale quando <strong>todos</strong> os critérios preenchidos batem. Preencha pelo menos um.
          </div>

          <div style={{ fontWeight: 600, fontSize: '0.875rem', marginBottom: 6 }}>Quem pode assinar</div>
          <input className="almox-input" placeholder="Buscar usuário..." value={busca}
            onChange={(e) => setBusca(e.target.value)} style={{ marginBottom: 8, width: '100%' }} />
          <div style={{ maxHeight: 200, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 4 }}>
            {usuariosFiltrados.map((u) => (
              <label key={u.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '6px 10px', borderRadius: 6, cursor: 'pointer' }}>
                <input type="checkbox" checked={form.aprovadores.includes(Number(u.id))}
                  onChange={() => toggleAprovador(Number(u.id))} />
                <span style={{ fontSize: '0.875rem', fontWeight: 500 }}>{u.nome}</span>
                <span style={{ fontSize: '0.75rem', color: 'var(--gmp-text-light)' }}>{u.email}</span>
              </label>
            ))}
          </div>

          <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
            <button type="button" className="btn-almox-primary" onClick={salvar} disabled={saving}>
              <FiSave size={14} /> {saving ? 'Salvando...' : 'Salvar regra'}
            </button>
            <button type="button" className="btn-almox-secondary" onClick={() => setEditando(null)} disabled={saving}>
              <FiX size={14} /> Cancelar
            </button>
          </div>
        </div>
      )}

      {regras.length === 0 ? (
        <div className="almox-empty" style={{ padding: 24 }}>Nenhuma regra cadastrada — hoje só vale a aprovação normal.</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {regras.map((r) => (
            <div key={r.id} data-testid={`regra-${r.id}`} style={{ background: 'var(--gmp-surface)', border: '1px solid var(--gmp-border)', borderRadius: 10, padding: '12px 16px', opacity: r.ativo ? 1 : 0.6 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'flex-start', flexWrap: 'wrap' }}>
                <div style={{ flex: 1, minWidth: 220 }}>
                  <div style={{ fontWeight: 700 }}>{r.nome} {!r.ativo && <span className="almox-badge">Inativa</span>}</div>
                  <div style={{ fontSize: '0.8rem', color: 'var(--gmp-text-light)', marginTop: 4 }}>{resumoCriterios(r, centrosPorId)}</div>
                  <div style={{ fontSize: '0.8rem', marginTop: 4 }}>
                    Assinam: {(r.aprovadores || []).map((id) => usuariosPorId.get(Number(id))?.nome || `#${id}`).join(', ')}
                  </div>
                  {r.pendencias_abertas > 0 && (
                    <div style={{ fontSize: '0.8rem', color: 'var(--gmp-warning)', marginTop: 4 }}>
                      {r.pendencias_abertas} requisição(ões) aguardando assinatura desta regra
                    </div>
                  )}
                </div>
                <div style={{ display: 'flex', gap: 8 }}>
                  <button type="button" className="btn-almox-secondary" onClick={() => abrirEdicao(r)}>
                    <FiEdit2 size={13} /> Editar
                  </button>
                  <button type="button" className="btn-almox-secondary" onClick={() => alternarAtivo(r)}>
                    {r.ativo ? 'Desativar' : 'Ativar'}
                  </button>
                </div>
              </div>
              {confirmarDesativar?.id === r.id && (
                <div role="alert" style={{ marginTop: 10, padding: '10px 12px', borderRadius: 8, background: 'rgba(229,152,0,0.08)', border: '1px solid rgba(229,152,0,0.25)', fontSize: '0.85rem' }}>
                  Desativar esta regra libera {r.pendencias_abertas} requisição(ões) que aguardam a assinatura dela —
                  a pendência fica registrada como obsoleta e deixa de bloquear a aprovação.
                  <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                    <button type="button" className="btn-almox-danger" onClick={() => alternarAtivo(r)}>Desativar mesmo assim</button>
                    <button type="button" className="btn-almox-secondary" onClick={() => setConfirmarDesativar(null)}>Manter ativa</button>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default TabRegrasAprovacao;
