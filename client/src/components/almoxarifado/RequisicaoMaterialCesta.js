import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'react-toastify';
import { FiArrowLeft, FiMinus, FiPlus, FiSave, FiShoppingCart, FiTrash2 } from 'react-icons/fi';
import api from '../../services/api';
import { resolveMaterialPhotoUrl } from '../../utils/resolveMaterialPhotoUrl';
import { useRequisicoesMaterialContext } from './RequisicoesMaterialContext';
import { DisponibilidadeBadge } from '../../utils/disponibilidadeEstoque';
import { TIPO_REQUISICAO_LABELS } from './requisicaoLabels';
import '../engenhariaProjetos/SolicitacaoMaterialEscritorioCesta.css';

function mapFotoUrl(material) {
  if (!material) return null;
  return resolveMaterialPhotoUrl(material.foto_url || material.foto);
}

export default function RequisicaoMaterialCesta() {
  const ctx = useRequisicoesMaterialContext();
  const navigate = useNavigate();
  const setor = ctx.setor || '';
  const listPath = `${ctx.basePath}/requisicoes-material`;

  const [materiais, setMateriais] = useState([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState('');
  const [cart, setCart] = useState(() => new Map());
  const [cartStatus, setCartStatus] = useState(() => new Map());
  const [observacoes, setObservacoes] = useState('');
  const [tipoRequisicao, setTipoRequisicao] = useState('CONSUMO');
  const [justificativa, setJustificativa] = useState('');
  const [sending, setSending] = useState(false);
  const [savingDraft, setSavingDraft] = useState(false);

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        setLoading(true);
        const res = await api.get('/requisicoes-material/materiais', { params: { setor } });
        if (!mounted) return;
        const rows = (res.data || []).map((m) => ({
          ...m,
          foto_url: mapFotoUrl(m),
        }));
        setMateriais(rows);
      } catch (e) {
        toast.error(e.response?.data?.error || 'Erro ao carregar materiais');
      } finally {
        if (mounted) setLoading(false);
      }
    })();
    return () => { mounted = false; };
  }, [setor]);

  const cartItems = useMemo(() => {
    const items = [];
    cart.forEach((qty, id) => {
      const m = (materiais || []).find((x) => String(x.id) === String(id));
      if (m) {
        const st = cartStatus.get(String(id));
        items.push({
          ...m,
          quantidade: qty,
          disponibilidade: st?.disponibilidade ?? m.disponibilidade,
          saldo_suficiente: st?.saldo_suficiente ?? m.saldo_suficiente,
        });
      }
    });
    items.sort((a, b) => String(a.nome).localeCompare(String(b.nome)));
    return items;
  }, [cart, materiais, cartStatus]);

  const cartKey = useMemo(
    () => cartItems.map((x) => `${x.id}:${x.quantidade}`).join('|'),
    [cartItems],
  );

  useEffect(() => {
    if (!cartItems.length) {
      setCartStatus(new Map());
      return undefined;
    }
    let cancelled = false;
    (async () => {
      try {
        const res = await api.post('/requisicoes-material/disponibilidade', {
          itens: cartItems.map((x) => ({ material_id: x.id, quantidade: x.quantidade })),
        });
        if (cancelled) return;
        const next = new Map();
        (res.data || []).forEach((row) => {
          next.set(String(row.material_id), {
            disponibilidade: row.disponibilidade,
            saldo_suficiente: row.saldo_suficiente,
          });
        });
        setCartStatus(next);
      } catch {
        /* mantém status anterior */
      }
    })();
    return () => { cancelled = true; };
  }, [cartKey]);

  const addToCart = (m, delta = 1) => {
    setCart((prev) => {
      const next = new Map(prev);
      const k = String(m.id);
      const cur = Number(next.get(k) || 0);
      const nextQty = cur + delta;
      if (nextQty <= 0) {
        next.delete(k);
      } else {
        next.set(k, nextQty);
      }
      return next;
    });
  };

  const setQty = (m, qty) => {
    setCart((prev) => {
      const next = new Map(prev);
      const k = String(m.id);
      const v = Math.max(1, Number(qty) || 1);
      next.set(k, v);
      return next;
    });
  };

  const removeFromCart = (m) => {
    setCart((prev) => {
      const next = new Map(prev);
      next.delete(String(m.id));
      return next;
    });
  };

  const clearCart = () => {
    setCart(new Map());
    setCartStatus(new Map());
  };

  const itensSemEstoque = cartItems.filter((x) => x.disponibilidade && x.disponibilidade !== 'em_estoque');

  const submit = async (salvarRascunho = false) => {
    if (cartItems.length === 0) {
      toast.error('Sua cesta está vazia');
      return;
    }
    if (tipoRequisicao === 'EMERGENCIAL' && !justificativa.trim()) {
      toast.error('Justifique a requisição emergencial');
      return;
    }
    const setSendingFlag = salvarRascunho ? setSavingDraft : setSending;
    try {
      setSendingFlag(true);
      const res = await api.post('/requisicoes-material', {
        setor,
        departamento: setor,
        modulo_origem: ctx.moduloOrigem,
        observacoes,
        tipo_requisicao: tipoRequisicao,
        justificativa,
        salvar_rascunho: salvarRascunho,
        itens: cartItems.map((x) => ({
          material_id: x.id,
          quantidade: x.quantidade,
        })),
      });
      toast.success(salvarRascunho
        ? 'Rascunho salvo'
        : `Requisição ${res.data?.numero || ''} enviada com sucesso`);
      clearCart();
      setObservacoes('');
      setJustificativa('');
      navigate(listPath);
    } catch (e) {
      toast.error(e.response?.data?.error || (salvarRascunho ? 'Erro ao salvar rascunho' : 'Erro ao enviar requisição'));
    } finally {
      setSendingFlag(false);
    }
  };

  const filtered = useMemo(() => {
    const query = q.trim().toLowerCase();
    if (!query) return materiais;
    return (materiais || []).filter((m) => {
      const nome = String(m.nome || '').toLowerCase();
      const codigo = String(m.codigo || '').toLowerCase();
      const desc = String(m.descricao || '').toLowerCase();
      return nome.includes(query) || codigo.includes(query) || desc.includes(query);
    });
  }, [materiais, q]);

  const titulo = `Solicitação de material — ${ctx.label || setor}`;
  const isAdminSetor = ctx.tipoSetor !== 'industrial';
  const emptyCatalogMsg = isAdminSetor
    ? 'Nenhum material administrativo cadastrado. Verifique família com tipo Administrativo.'
    : 'Nenhum material industrial cadastrado. Verifique família com tipo Industrial.';

  return (
    <div className="engc">
      <header className="engc-hero">
        <div>
          <button
            type="button"
            className="engc-btn engc-btn--ghost"
            style={{ marginBottom: 10 }}
            onClick={() => navigate(listPath)}
          >
            <FiArrowLeft style={{ marginRight: 6 }} />
            Minhas requisições
          </button>
          <h1>{titulo}</h1>
          <p>Selecione no catálogo e monte sua cesta. A disponibilidade é exibida por status (sem quantidade exata). Itens sem estoque acionam Compras automaticamente.</p>
        </div>
        <div className="engc-hero-badge">
          <FiShoppingCart />
          <span>{cartItems.reduce((s, x) => s + x.quantidade, 0)} itens</span>
        </div>
      </header>

      <div className="engc-shell">
        <section className="engc-panel">
          <div className="engc-panel-top">
            <div className="engc-title">Catálogo</div>
            <input
              className="engc-search"
              placeholder="Buscar material…"
              value={q}
              onChange={(e) => setQ(e.target.value)}
            />
          </div>

          {loading ? (
            <div className="engc-loading">Carregando…</div>
          ) : (
            <div className="engc-grid">
              {filtered.map((m) => {
                const inCart = cart.get(String(m.id));
                return (
                  <div key={m.id} className="engc-card">
                    <div className="engc-card-media">
                      {m.foto_url ? (
                        <img className="engc-card-img" src={m.foto_url} alt={m.nome} loading="lazy" />
                      ) : (
                        <div className="engc-card-imgPlaceholder">
                          {m.tipo_icone || 'Sem foto'}
                        </div>
                      )}
                    </div>
                    <div className="engc-card-name">{m.nome}</div>
                    <div className="engc-card-desc">{m.descricao || m.codigo || '—'}</div>
                    <div className="engc-card-meta" style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                      {m.unidade ? <span>Unidade: {m.unidade}</span> : null}
                      <DisponibilidadeBadge disponibilidade={m.disponibilidade} />
                    </div>
                    <div className="engc-card-actions">
                      <button className="engc-btn engc-btn--ghost" type="button" onClick={() => addToCart(m, 1)}>
                        {inCart ? 'Adicionar +1' : 'Adicionar'}
                      </button>
                      {inCart ? <span className="engc-chip">{inCart} na cesta</span> : <span className="engc-chip engc-chip--muted">—</span>}
                    </div>
                  </div>
                );
              })}
              {!filtered.length ? <div className="engc-empty">{emptyCatalogMsg}</div> : null}
            </div>
          )}
        </section>

        <aside className="engc-cart">
          <div className="engc-cart-head">
            <div>
              <div className="engc-title">Sua cesta</div>
              <div className="engc-subtle">{cartItems.length ? `${cartItems.length} materiais` : 'Adicione itens pelo catálogo'}</div>
            </div>
            <button className="engc-btn engc-btn--ghost" type="button" onClick={clearCart} disabled={!cartItems.length}>
              Limpar
            </button>
          </div>

          {itensSemEstoque.length > 0 && (
            <div style={{ margin: '0 0 12px', padding: '10px 12px', fontSize: '0.8rem', color: '#b45309', background: 'rgba(245,158,11,0.08)', borderRadius: 8, border: '1px solid rgba(245,158,11,0.25)' }}>
              {itensSemEstoque.length} item(ns) parcial ou sem estoque — Compras será notificado ao enviar.
            </div>
          )}

          <div className="engc-cart-list">
            {cartItems.map((m) => (
              <div key={m.id} className="engc-cart-item">
                <div className="engc-cart-main">
                  <div className="engc-cart-thumb">
                    {m.foto_url ? <img src={m.foto_url} alt={m.nome} loading="lazy" /> : <div className="engc-cart-thumbPlaceholder">—</div>}
                  </div>
                  <div className="engc-cart-text">
                    <div className="engc-cart-name">{m.nome}</div>
                    <div className="engc-cart-desc">{m.descricao || m.codigo || '—'}</div>
                    <div className="engc-subtle" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      {m.unidade || 'un'}
                      <DisponibilidadeBadge disponibilidade={m.disponibilidade} />
                    </div>
                  </div>
                </div>
                <div className="engc-qty">
                  <button type="button" className="engc-qty-btn" onClick={() => addToCart(m, -1)} aria-label="Diminuir">
                    <FiMinus />
                  </button>
                  <input
                    className="engc-qty-input"
                    type="number"
                    min="1"
                    step="1"
                    value={m.quantidade}
                    onChange={(e) => setQty(m, e.target.value)}
                  />
                  <button type="button" className="engc-qty-btn" onClick={() => addToCart(m, 1)} aria-label="Aumentar">
                    <FiPlus />
                  </button>
                </div>
                <button type="button" className="engc-trash" onClick={() => removeFromCart(m)} aria-label="Remover item">
                  <FiTrash2 />
                </button>
              </div>
            ))}
            {!cartItems.length ? <div className="engc-empty engc-empty--cart">Sua cesta está vazia.</div> : null}
          </div>

          <div className="engc-obs">
            <label>Tipo de requisição</label>
            <select value={tipoRequisicao} onChange={(e) => setTipoRequisicao(e.target.value)}>
              {Object.entries(TIPO_REQUISICAO_LABELS).map(([k, v]) => (
                <option key={k} value={k}>{v}</option>
              ))}
            </select>
          </div>

          {tipoRequisicao === 'EMERGENCIAL' && (
            <div className="engc-obs">
              <label>Justificativa (obrigatória)</label>
              <textarea value={justificativa} onChange={(e) => setJustificativa(e.target.value)} rows={3}
                placeholder="Descreva o motivo da requisição emergencial…" />
              <div className="engc-subtle">Requisições emergenciais exigem justificativa para liberação imediata.</div>
            </div>
          )}

          <div className="engc-obs">
            <label>Observações</label>
            <textarea value={observacoes} onChange={(e) => setObservacoes(e.target.value)} rows={4} placeholder="Opcional…" />
          </div>

          <button className="engc-btn engc-btn--primary" type="button" onClick={() => submit(false)} disabled={sending || savingDraft || !cartItems.length}>
            {sending ? 'Enviando…' : 'Enviar solicitação'}
          </button>
          {/* Rascunho depende das rotas /enviar e /cancelar, exclusivas do almoxarifado. */}
          {ctx.warehouseMode && (
            <button className="engc-btn engc-btn--ghost" type="button" onClick={() => submit(true)} disabled={sending || savingDraft || !cartItems.length}
              style={{ marginTop: 8, width: '100%', justifyContent: 'center', display: 'flex', alignItems: 'center', gap: 6 }}>
              <FiSave size={14} /> {savingDraft ? 'Salvando…' : 'Salvar rascunho'}
            </button>
          )}
        </aside>
      </div>
    </div>
  );
}
