/**
 * Etapa 40, Task 5 — criacao e edicao de COTACAO (`/compras/cotacoes/nova`, `/compras/cotacoes/editar/:id`).
 * Cabecalho so (nao ha itens de cotacao no sistema — D1/D8): numero DIGITADO (e o numero do
 * documento do fornecedor), fornecedor, datas, valor total, status e observacoes.
 * Molde: `PedidoCompraForm.js` — `Number()` antes do POST (o Zod do servidor nao coage), `hojeISO`
 * LOCAL (RN-D03 da Etapa 39), erro em `role="alert"`, toast so no sucesso.
 */
import React, { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { FiArrowLeft, FiSave } from 'react-icons/fi';
import api from '../../services/api';
import { toast } from 'react-toastify';
import { formatarErroPermissao } from '../../utils/permissaoErro';
import '../Compras.css';

// O vocabulario de `STATUS_COTACAO` do servidor, na mesma ordem; rotulos iguais aos do filtro da aba.
export const STATUS_COTACAO = [
  { valor: 'em_analise', label: 'Em Análise' },
  { valor: 'aprovado', label: 'Aprovado' },
  { valor: 'rejeitado', label: 'Rejeitado' },
  { valor: 'cancelado', label: 'Cancelado' },
];

// Data LOCAL, nunca `toISOString()` (UTC): das 21h a meia-noite no fuso do Brasil a cotacao
// nasceria com a data de AMANHA. Copia de `PedidoCompraForm.js` (RN-D03 da Etapa 39).
const hojeISO = () => {
  const agora = new Date();
  return [agora.getFullYear(), String(agora.getMonth() + 1).padStart(2, '0'), String(agora.getDate()).padStart(2, '0')].join('-');
};
function mensagemDeErro(erro, fallback) {
  const data = erro?.response?.data;
  return formatarErroPermissao(data) || data?.error || fallback;
}

const CotacaoForm = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const edicao = Boolean(id);
  const [fornecedores, setFornecedores] = useState([]);
  const [numero, setNumero] = useState('');
  const [fornecedorId, setFornecedorId] = useState('');
  const [dataCotacao, setDataCotacao] = useState(hojeISO());
  const [validade, setValidade] = useState('');
  const [valorTotal, setValorTotal] = useState('');
  const [status, setStatus] = useState('em_analise');
  const [observacoes, setObservacoes] = useState('');
  const [erro, setErro] = useState('');
  const [carregando, setCarregando] = useState(edicao);
  const [salvando, setSalvando] = useState(false);

  useEffect(() => {
    let vivo = true;
    api.get('/compras/fornecedores')
      .then((res) => { if (vivo) setFornecedores(res.data || []); })
      .catch(() => { if (vivo) setErro('Não foi possível carregar os fornecedores.'); });
    return () => { vivo = false; };
  }, []);

  useEffect(() => {
    if (!edicao) return undefined;
    let vivo = true;
    api.get(`/compras/cotacoes/${id}`)
      .then((res) => {
        if (!vivo) return;
        const c = res.data || {};
        setNumero(c.numero || '');
        setFornecedorId(c.fornecedor_id == null ? '' : String(c.fornecedor_id));
        setDataCotacao((c.data_cotacao || '').slice(0, 10));
        setValidade((c.validade || '').slice(0, 10));
        setValorTotal(c.valor_total == null ? '' : String(c.valor_total));
        setStatus(c.status || 'em_analise');
        setObservacoes(c.observacoes || '');
      })
      .catch((e) => { if (vivo) setErro(mensagemDeErro(e, 'Não foi possível carregar a cotação.')); })
      .finally(() => { if (vivo) setCarregando(false); });
    return () => { vivo = false; };
  }, [id, edicao]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setErro('');
    if (!numero.trim()) { setErro('Número da cotação é obrigatório'); return; }
    if (!fornecedorId) { setErro('Fornecedor da cotação é obrigatório'); return; }
    const payload = {
      numero: numero.trim(),
      fornecedor_id: Number(fornecedorId),
      valor_total: Number(valorTotal) || 0,
      data_cotacao: dataCotacao,
      validade,
      status,
      observacoes,
    };
    setSalvando(true);
    try {
      if (edicao) await api.put(`/compras/cotacoes/${id}`, payload);
      else await api.post('/compras/cotacoes', payload);
      toast.success('Cotação salva');
      navigate('/compras/cotacoes');
    } catch (err) {
      setErro(mensagemDeErro(err, 'Não foi possível salvar a cotação.'));
    } finally {
      setSalvando(false);
    }
  };

  const coluna = { display: 'flex', flexDirection: 'column', gap: 4 };
  return (
    <div className="compras">
      <div className="page-header">
        <div>
          <Link to="/compras/cotacoes" className="btn-secondary" style={{ marginBottom: 8, display: 'inline-flex' }}>
            <FiArrowLeft /> Voltar para cotações
          </Link>
          <h1>{edicao ? 'Editar cotação' : 'Nova cotação'}</h1>
          <p>O número é o do documento do fornecedor e tem de ser único.</p>
        </div>
      </div>
      {erro && (
        <div role="alert" style={{ background: 'rgba(231, 76, 60, 0.12)', color: '#c0392b', border: '1px solid #e74c3c', borderRadius: 8, padding: '10px 14px', marginBottom: 16 }}>
          {erro}
        </div>
      )}
      {carregando ? <div className="loading">Carregando...</div> : (
        <form data-testid="cotacao-form" onSubmit={handleSubmit}>
          <div className="filters" style={{ flexWrap: 'wrap', gap: 12 }}>
            <label style={coluna}>Número *<input data-testid="cotacao-numero" type="text" value={numero} onChange={(ev) => setNumero(ev.target.value)} /></label>
            <label style={coluna}>Fornecedor *
              <select data-testid="cotacao-fornecedor" value={fornecedorId} onChange={(ev) => setFornecedorId(ev.target.value)} className="filter-select">
                <option value="">Selecione o fornecedor</option>
                {fornecedores.map((f) => <option key={f.id} value={f.id}>{f.razao_social}</option>)}
              </select>
            </label>
            <label style={coluna}>Data<input data-testid="cotacao-data" type="date" value={dataCotacao} onChange={(ev) => setDataCotacao(ev.target.value)} /></label>
            <label style={coluna}>Validade<input data-testid="cotacao-validade" type="date" value={validade} onChange={(ev) => setValidade(ev.target.value)} /></label>
            <label style={coluna}>Valor total<input data-testid="cotacao-valor" type="number" step="0.01" min="0" value={valorTotal} onChange={(ev) => setValorTotal(ev.target.value)} /></label>
            <label style={coluna}>Status
              <select data-testid="cotacao-status" value={status} onChange={(ev) => setStatus(ev.target.value)} className="filter-select">
                {STATUS_COTACAO.map((s) => <option key={s.valor} value={s.valor}>{s.label}</option>)}
              </select>
            </label>
          </div>
          <label style={{ display: 'block', margin: '12px 0' }}>Observações
            <textarea data-testid="cotacao-observacoes" value={observacoes} onChange={(ev) => setObservacoes(ev.target.value)} rows={2} style={{ width: '100%' }} />
          </label>
          <div className="header-actions">
            <button type="submit" className="btn-premium" disabled={salvando}><FiSave /> {salvando ? 'Salvando...' : 'Salvar cotação'}</button>
          </div>
        </form>
      )}
    </div>
  );
};

export default CotacaoForm;
