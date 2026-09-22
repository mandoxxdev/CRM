/**
 * Etapa 40, Task 4 — criacao e edicao de FORNECEDOR (`/compras/fornecedores/novo`,
 * `/compras/fornecedores/editar/:id`). Ate esta etapa os dois caminhos caiam no `path="*"` e
 * voltavam para a lista (Fase 0 cliente §2.2).
 *
 * Molde: `PedidoCompraForm.js` — erro do servidor em `role="alert"`, toast so no sucesso, CSS de
 * `../Compras.css`. Regras que esta tela conhece do servidor (RN-E02/E03/E04):
 *   - o `PUT` e SUBSTITUICAO TOTAL dos sete textos: o payload manda TODOS, sempre;
 *   - `grupo_id` viaja como STRING do `<select>` (`''` = "Sem grupo", e o servidor LIMPA);
 *   - `status` so existe na edicao (o servidor grava 'ativo' na criacao e ignora a chave).
 * Sem foto (fica no modal de Fornecedores homologados) e sem cidade/estado/cep (colunas sem
 * consumidor) — declarado no design (D12, secao 8).
 */
import React, { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { FiArrowLeft, FiSave } from 'react-icons/fi';
import api from '../../services/api';
import { toast } from 'react-toastify';
import { formatarErroPermissao } from '../../utils/permissaoErro';
import { mascararTelefoneDigitando } from '../../utils/telefone';
import '../Compras.css';

const LITERAL_RAZAO = 'Razão social é obrigatória';
const CAMPOS = ['razao_social', 'nome_fantasia', 'cnpj', 'contato', 'email', 'telefone', 'endereco'];

function mensagemDeErro(erro, fallback) {
  const data = erro?.response?.data;
  return formatarErroPermissao(data) || data?.error || fallback;
}

const FornecedorForm = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const edicao = Boolean(id);
  const [form, setForm] = useState({ razao_social: '', nome_fantasia: '', cnpj: '', contato: '', email: '', telefone: '', endereco: '' });
  const [grupoId, setGrupoId] = useState('');
  const [status, setStatus] = useState('ativo');
  const [grupos, setGrupos] = useState([]);
  const [erro, setErro] = useState('');
  const [carregando, setCarregando] = useState(edicao);
  const [salvando, setSalvando] = useState(false);

  useEffect(() => {
    let vivo = true;
    api.get('/compras/grupos')
      .then((res) => { if (vivo) setGrupos(res.data || []); })
      .catch(() => { if (vivo) setGrupos([]); }); // grupo e opcional: sem lista, o select fica so com "Sem grupo"
    return () => { vivo = false; };
  }, []);

  useEffect(() => {
    if (!edicao) return undefined;
    let vivo = true;
    api.get(`/compras/fornecedores/${id}`)
      .then((res) => {
        if (!vivo) return;
        const f = res.data || {};
        setForm(Object.fromEntries(CAMPOS.map((c) => [c, f[c] == null ? '' : String(f[c])])));
        setGrupoId(f.grupo_id == null ? '' : String(f.grupo_id));
        setStatus(f.status || 'ativo');
      })
      .catch((e) => { if (vivo) setErro(mensagemDeErro(e, 'Não foi possível carregar o fornecedor.')); })
      .finally(() => { if (vivo) setCarregando(false); });
    return () => { vivo = false; };
  }, [id, edicao]);

  const campo = (nome) => (ev) => {
    const valor = nome === 'telefone' ? mascararTelefoneDigitando(ev.target.value) : ev.target.value;
    setForm((f) => ({ ...f, [nome]: valor }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setErro('');
    if (!form.razao_social.trim()) { setErro(LITERAL_RAZAO); return; }
    const payload = { ...form, grupo_id: grupoId };
    if (edicao) payload.status = status;
    setSalvando(true);
    try {
      if (edicao) await api.put(`/compras/fornecedores/${id}`, payload);
      else await api.post('/compras/fornecedores', payload);
      toast.success('Fornecedor salvo');
      navigate('/compras/fornecedores');
    } catch (err) {
      setErro(mensagemDeErro(err, 'Não foi possível salvar o fornecedor.'));
    } finally {
      setSalvando(false);
    }
  };

  const rotulo = { razao_social: 'Razão social', nome_fantasia: 'Nome fantasia', cnpj: 'CNPJ', contato: 'Contato', email: 'E-mail', telefone: 'Telefone', endereco: 'Endereço' };
  const testId = { razao_social: 'fornecedor-razao', nome_fantasia: 'fornecedor-fantasia', cnpj: 'fornecedor-cnpj', contato: 'fornecedor-contato', email: 'fornecedor-email', telefone: 'fornecedor-telefone', endereco: 'fornecedor-endereco' };

  return (
    <div className="compras">
      <div className="page-header">
        <div>
          <Link to="/compras/fornecedores" className="btn-secondary" style={{ marginBottom: 8, display: 'inline-flex' }}>
            <FiArrowLeft /> Voltar para fornecedores
          </Link>
          <h1>{edicao ? 'Editar fornecedor' : 'Novo fornecedor'}</h1>
        </div>
      </div>

      {erro && (
        <div role="alert" style={{ background: 'rgba(231, 76, 60, 0.12)', color: '#c0392b', border: '1px solid #e74c3c', borderRadius: 8, padding: '10px 14px', marginBottom: 16 }}>
          {erro}
        </div>
      )}

      {carregando ? <div className="loading">Carregando...</div> : (
        <form data-testid="fornecedor-form" onSubmit={handleSubmit}>
          <div className="filters" style={{ flexWrap: 'wrap', gap: 12 }}>
            {CAMPOS.map((nome) => (
              <label key={nome} style={{ display: 'flex', flexDirection: 'column', gap: 4, minWidth: nome === 'endereco' ? '100%' : 220 }}>
                {rotulo[nome]}{nome === 'razao_social' ? ' *' : ''}
                {/* `type="text"` TAMBEM no e-mail (Fase 2, M9): `type="email"` faria o navegador
                    bloquear o submit com tooltip nativa, e o servidor NAO valida formato (D3) —
                    o modal de FornecedoresDoGrupo, na mesma porta, aceita qualquer texto. */}
                <input data-testid={testId[nome]} type="text" value={form[nome]} onChange={campo(nome)} />
              </label>
            ))}
            <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              Grupo
              <select data-testid="fornecedor-grupo" value={grupoId} onChange={(ev) => setGrupoId(ev.target.value)} className="filter-select">
                <option value="">Sem grupo</option>
                {grupos.map((g) => <option key={g.id} value={g.id}>{g.nome}</option>)}
              </select>
            </label>
            {edicao && (
              <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                Status
                <select data-testid="fornecedor-status" value={status} onChange={(ev) => setStatus(ev.target.value)} className="filter-select">
                  <option value="ativo">Ativo</option>
                  <option value="inativo">Inativo</option>
                </select>
              </label>
            )}
          </div>
          <div className="header-actions">
            <button type="submit" className="btn-premium" disabled={salvando}>
              <FiSave /> {salvando ? 'Salvando...' : 'Salvar fornecedor'}
            </button>
          </div>
        </form>
      )}
    </div>
  );
};

export default FornecedorForm;
