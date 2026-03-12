import React, { useState, useEffect } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import api from '../../services/api';
import { toast } from 'react-toastify';
import './CPQ.css';

export default function CPQProjectDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [project, setProject] = useState(null);
  const [groups, setGroups] = useState([]);
  const [produtos, setProdutos] = useState([]);
  const [priceResult, setPriceResult] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      api.get(`/cpq/projects/${id}`),
      api.get('/cpq/composition-groups'),
      api.get('/produtos', { params: { ativo: 'true' } }).catch(() => ({ data: [] }))
    ]).then(([proj, grp, prod]) => {
      setProject(proj.data);
      setGroups(grp.data || []);
      setProdutos(Array.isArray(prod.data) ? prod.data : (prod.data?.lista || []));
      setLoading(false);
    }).catch(() => {
      setLoading(false);
      toast.error('Erro ao carregar projeto');
    });
  }, [id]);

  const refreshProject = () => {
    api.get(`/cpq/projects/${id}`).then(r => setProject(r.data)).catch(() => {});
  };

  const addItem = (group) => {
    const codigo = window.prompt('Código do produto (ou deixe vazio para item manual)');
    const prod = produtos.find(p => (p.codigo || '').toLowerCase() === (codigo || '').toLowerCase());
    const payload = {
      composition_group_id: group.id,
      produto_id: prod ? prod.id : null,
      codigo_produto: codigo || null,
      quantidade: 1,
      valor_unitario: prod ? (prod.preco_base || 0) : 0,
      valor_total: prod ? (prod.preco_base || 0) : 0
    };
    api.post(`/cpq/projects/${id}/items`, payload).then(() => {
      refreshProject();
      toast.success('Item adicionado');
    }).catch(() => toast.error('Erro ao adicionar item'));
  };

  const updateItem = (itemId, field, value) => {
    const item = project.items.find(i => i.id === itemId);
    if (!item) return;
    const upd = { ...item, [field]: value };
    if (field === 'quantidade' || field === 'valor_unitario') {
      upd.valor_total = (upd.quantidade || 1) * (upd.valor_unitario || 0);
    }
    api.put(`/cpq/projects/${id}/items/${itemId}`, upd).then(() => refreshProject()).catch(() => toast.error('Erro ao atualizar'));
  };

  const removeItem = (itemId) => {
    if (!window.confirm('Remover este item?')) return;
    api.delete(`/cpq/projects/${id}/items/${itemId}`).then(() => { refreshProject(); toast.success('Item removido'); }).catch(() => toast.error('Erro'));
  };

  const calculatePrice = () => {
    const items = (project?.items || []).map(i => ({ ...i, group_name: i.group_name }));
    api.post('/cpq/price/calculate', { items, options: { margem: 15, desconto: 0 } }).then(r => setPriceResult(r.data)).catch(() => toast.error('Erro ao calcular'));
  };

  const generateProposal = () => {
    api.post(`/cpq/projects/${id}/generate-proposal`, { cliente_id: project.cliente_id, titulo: project.titulo }).then(({ data }) => {
      toast.success('Proposta criada: ' + data.numero_proposta);
      navigate(`/comercial/propostas/detalhe/${data.proposta_id}`);
    }).catch(err => toast.error(err.response?.data?.error || 'Erro ao gerar proposta'));
  };

  if (loading || !project) return <div className="cpq-page"><p>Carregando...</p></div>;

  const byGroup = {};
  (project.items || []).forEach(i => {
    const g = i.group_name || 'Outros';
    if (!byGroup[g]) byGroup[g] = [];
    byGroup[g].push(i);
  });
  const defaultGroupNames = ['Equipamentos principais', 'Tubulação', 'Válvulas', 'Instrumentação', 'Automação', 'Painéis elétricos', 'Serviços', 'Montagem', 'Comissionamento'];
  const groupOrder = groups.length ? groups : defaultGroupNames.map(n => ({ id: n, nome: n, ordem: 0 }));

  return (
    <div className="cpq-page">
      <header className="cpq-header">
        <Link to="/comercial/cpq/projetos" className="cpq-back">← Projetos</Link>
        <h1>{project.titulo}</h1>
        <p>Cliente: {project.cliente_nome || '—'} | Status: {project.status}</p>
      </header>

      <div className="cpq-composition">
        {groupOrder.map(g => (
          <section key={g.id || g.nome} className="cpq-card cpq-group">
            <h2>{g.nome || g.name}</h2>
            <button type="button" className="cpq-btn small" onClick={() => addItem(g)}>+ Item</button>
            <table className="cpq-table">
              <thead><tr><th>Produto</th><th>Qtd</th><th>Unit.</th><th>Total</th><th></th></tr></thead>
              <tbody>
                {(byGroup[g.nome || g.name] || []).map(i => (
                  <tr key={i.id}>
                    <td>{i.produto_nome || i.codigo_produto || 'Item'}</td>
                    <td><input type="number" min="0.01" step="0.01" value={i.quantidade} onChange={e => updateItem(i.id, 'quantidade', parseFloat(e.target.value) || 0)} /></td>
                    <td><input type="number" min="0" step="0.01" value={i.valor_unitario} onChange={e => updateItem(i.id, 'valor_unitario', parseFloat(e.target.value) || 0)} /></td>
                    <td>{Number(i.valor_total || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</td>
                    <td><button type="button" className="cpq-link danger" onClick={() => removeItem(i.id)}>Remover</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        ))}
      </div>

      <div className="cpq-actions">
        <button type="button" className="cpq-btn cpq-btn-sec" onClick={calculatePrice}>Calcular preço</button>
        {priceResult && <div className="cpq-price-result">Total: R$ {priceResult.total != null ? Number(priceResult.total).toLocaleString('pt-BR', { minimumFractionDigits: 2 }) : '—'}</div>}
        <button type="button" className="cpq-btn cpq-btn-primary" onClick={generateProposal} disabled={!project.cliente_id}>
          Gerar proposta técnica comercial
        </button>
      </div>
    </div>
  );
}
