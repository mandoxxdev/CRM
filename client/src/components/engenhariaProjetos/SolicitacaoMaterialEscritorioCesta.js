import React, { useEffect, useMemo, useState } from 'react';
import { toast } from 'react-toastify';
import { FiMinus, FiPlus, FiShoppingCart, FiTrash2 } from 'react-icons/fi';
import api from '../../services/api';
import './SolicitacaoMaterialEscritorioCesta.css';

export default function SolicitacaoMaterialEscritorioCesta() {
  const [materiais, setMateriais] = useState([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState('');
  const [cart, setCart] = useState(() => new Map());
  const [observacoes, setObservacoes] = useState('');
  const [sending, setSending] = useState(false);

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        setLoading(true);
        const res = await api.get('/engenharia/materiais-escritorio');
        if (!mounted) return;
        setMateriais(res.data?.materiais || []);
      } catch (e) {
        toast.error(e.response?.data?.error || 'Erro ao carregar materiais');
      } finally {
        if (mounted) setLoading(false);
      }
    })();
    return () => { mounted = false; };
  }, []);

  const filtered = useMemo(() => {
    const query = q.trim().toLowerCase();
    if (!query) return materiais;
    return (materiais || []).filter((m) => String(m.nome || '').toLowerCase().includes(query));
  }, [materiais, q]);

  const cartItems = useMemo(() => {
    const items = [];
    cart.forEach((qty, id) => {
      const m = (materiais || []).find((x) => String(x.id) === String(id));
      if (m) items.push({ ...m, quantidade: qty });
    });
    items.sort((a, b) => String(a.nome).localeCompare(String(b.nome)));
    return items;
  }, [cart, materiais]);

  const addToCart = (m, delta = 1) => {
    setCart((prev) => {
      const next = new Map(prev);
      const k = String(m.id);
      const cur = Number(next.get(k) || 0);
      next.set(k, Math.max(1, cur + delta));
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

  const clearCart = () => setCart(new Map());

  const submit = async () => {
    if (cartItems.length === 0) {
      toast.error('Sua cesta está vazia');
      return;
    }
    try {
      setSending(true);
      await api.post('/engenharia/solicitacoes-materiais-escritorio', {
        itens: cartItems.map((x) => ({ material_id: x.id, quantidade: x.quantidade })),
        observacoes,
      });
      toast.success('Solicitação enviada');
      clearCart();
      setObservacoes('');
    } catch (e) {
      toast.error(e.response?.data?.error || 'Erro ao enviar solicitação');
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="engc">
      <header className="engc-hero">
        <div>
          <h1>Solicitação de material de escritório</h1>
          <p>Selecione no catálogo e monte sua cesta. Ao enviar, o sistema notifica Compras e você.</p>
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
                    <div className="engc-card-name">{m.nome}</div>
                    <div className="engc-card-meta">{m.unidade ? `Unidade: ${m.unidade}` : ''}</div>
                    <div className="engc-card-actions">
                      <button className="engc-btn engc-btn--ghost" type="button" onClick={() => addToCart(m, 1)}>
                        {inCart ? 'Adicionar +1' : 'Adicionar'}
                      </button>
                      {inCart ? <span className="engc-chip">{inCart} na cesta</span> : <span className="engc-chip engc-chip--muted">—</span>}
                    </div>
                  </div>
                );
              })}
              {!filtered.length ? <div className="engc-empty">Nenhum material encontrado.</div> : null}
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

          <div className="engc-cart-list">
            {cartItems.map((m) => (
              <div key={m.id} className="engc-cart-item">
                <div className="engc-cart-main">
                  <div className="engc-cart-name">{m.nome}</div>
                  <div className="engc-subtle">{m.unidade || 'un'}</div>
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
            <label>Observações</label>
            <textarea value={observacoes} onChange={(e) => setObservacoes(e.target.value)} rows={4} placeholder="Opcional…" />
          </div>

          <button className="engc-btn engc-btn--primary" type="button" onClick={submit} disabled={sending || !cartItems.length}>
            {sending ? 'Enviando…' : 'Enviar solicitação'}
          </button>
        </aside>
      </div>
    </div>
  );
}

