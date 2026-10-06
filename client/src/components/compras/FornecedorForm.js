import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { toast } from 'react-toastify';
import { FiArrowLeft, FiSave, FiSearch, FiLoader } from 'react-icons/fi';
import api from '../../services/api';
import { mascararTelefoneDigitando, mascararTelefoneCompleto } from '../../utils/telefone';
import {
  somenteDigitos, formatarCNPJ, formatarCEP, validarCNPJ, camposDaConsultaCNPJ, mesclarSoVazios,
} from '../../utils/cnpj';
import './FornecedorForm.css';

/**
 * Ficha do fornecedor (Etapa 34) — `/compras/fornecedores/novo` e `/editar/:id`.
 *
 * Até esta etapa os dois caminhos existiam como link na lista e caíam no `path="*"` da área de
 * Compras, que re-renderizava a LISTA: "Novo Fornecedor" não fazia nada, e o único cadastro
 * possível era o modal do grupo homologado (7 campos). Esta tela é o cadastro completo.
 *
 * Regras (grep RN-34 no plano docs/superpowers/plans/2026-10-06-crm-etapa34-ficha-do-fornecedor.md):
 *  - dois telefones: da EMPRESA (`telefone`) e do VENDEDOR (`telefone_vendedor`, coluna nova);
 *    "Contato" virou "Nome do vendedor" (mesma coluna `contato`);
 *  - CNPJ: sair do campo com 14 dígitos válidos consulta sozinho só no cadastro NOVO; a lupa
 *    consulta sempre. Na edição preenche SÓ os campos vazios — o que o usuário digitou fica;
 *  - CEP: sair do campo com 8 dígitos consulta a ViaCEP (proxy /api/cep) e preenche
 *    endereço/cidade/estado, só os vazios;
 *  - o corpo do POST/PUT são as 13 colunas da ficha (+ `status` na edição). O servidor trata
 *    `''` como "limpar", então mandar tudo é o certo aqui — a semântica "ausente não mexe"
 *    existe para o modal antigo, não para esta tela.
 */

const UFS = [
  'AC', 'AL', 'AP', 'AM', 'BA', 'CE', 'DF', 'ES', 'GO', 'MA', 'MT', 'MS', 'MG', 'PA', 'PB', 'PR',
  'PE', 'PI', 'RJ', 'RN', 'RS', 'RO', 'RR', 'SC', 'SP', 'SE', 'TO',
];

const FORM_VAZIO = {
  razao_social: '', nome_fantasia: '', cnpj: '', inscricao_estadual: '', contato: '', email: '',
  telefone: '', telefone_vendedor: '', endereco: '', cidade: '', estado: '', cep: '', grupo_id: '',
  status: 'ativo',
};

/** As 13 chaves do contrato (seção 4 do design), na ordem do contrato. */
const CHAVES_CONTRATO = [
  'razao_social', 'nome_fantasia', 'cnpj', 'inscricao_estadual', 'contato', 'email', 'telefone',
  'telefone_vendedor', 'endereco', 'cidade', 'estado', 'cep', 'grupo_id',
];

const texto = (v) => (v == null ? '' : String(v));

/** Linha do GET /:id → estado do formulário (máscaras aplicadas ao carregar). */
function formDoServidor(f) {
  return {
    ...FORM_VAZIO,
    razao_social: texto(f.razao_social),
    nome_fantasia: texto(f.nome_fantasia),
    cnpj: formatarCNPJ(texto(f.cnpj)),
    inscricao_estadual: texto(f.inscricao_estadual),
    contato: texto(f.contato),
    email: texto(f.email),
    telefone: mascararTelefoneCompleto(f.telefone),
    telefone_vendedor: mascararTelefoneCompleto(f.telefone_vendedor),
    endereco: texto(f.endereco),
    cidade: texto(f.cidade),
    estado: texto(f.estado).toUpperCase(),
    cep: formatarCEP(texto(f.cep)),
    grupo_id: f.grupo_id != null ? String(f.grupo_id) : '',
    status: texto(f.status) || 'ativo',
  };
}

/** Sobrescreve com os valores NÃO vazios — é o preenchimento do cadastro novo. */
function sobreporNaoVazios(form, novos) {
  const r = { ...form };
  Object.keys(novos).forEach((k) => {
    if (texto(novos[k]).trim()) r[k] = novos[k];
  });
  return r;
}

const Campo = ({ id, label, children, obrigatorio, className }) => (
  <div className={`form-group${className ? ` ${className}` : ''}`}>
    <label htmlFor={id}>{label}{obrigatorio && <span className="obrigatorio"> *</span>}</label>
    {children}
  </div>
);

const FornecedorForm = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const editando = Boolean(id);

  const [form, setForm] = useState(FORM_VAZIO);
  const [grupos, setGrupos] = useState([]);
  const [carregando, setCarregando] = useState(editando);
  const [salvando, setSalvando] = useState(false);
  const [buscandoCnpj, setBuscandoCnpj] = useState(false);
  const [buscandoCep, setBuscandoCep] = useState(false);
  const [erro, setErro] = useState('');

  useEffect(() => {
    let vivo = true;
    api.get('/compras/grupos')
      .then((r) => { if (vivo) setGrupos(Array.isArray(r.data) ? r.data : []); })
      .catch(() => { if (vivo) setGrupos([]); });
    return () => { vivo = false; };
  }, []);

  useEffect(() => {
    if (!editando) return undefined;
    let vivo = true;
    setCarregando(true);
    api.get(`/compras/fornecedores/${id}`)
      .then((r) => { if (vivo) setForm(formDoServidor(r.data || {})); })
      .catch((e) => {
        if (vivo) setErro(e?.response?.data?.error || 'Não foi possível carregar o fornecedor');
      })
      .finally(() => { if (vivo) setCarregando(false); });
    return () => { vivo = false; };
  }, [editando, id]);

  const set = (campo, valor) => setForm((prev) => ({ ...prev, [campo]: valor }));

  /* ── CNPJ ─────────────────────────────────────────────────────────── */
  const buscarCNPJ = useCallback(async (cnpjMascarado) => {
    const digitos = somenteDigitos(cnpjMascarado);
    if (digitos.length !== 14 || !validarCNPJ(digitos)) {
      toast.error('CNPJ inválido. Verifique os dígitos.');
      return;
    }
    setBuscandoCnpj(true);
    try {
      const resp = await api.get(`/cnpj/${digitos}`);
      const data = resp?.data?.data;
      if (!resp?.data?.success || !data) throw new Error('sem dados');
      const novos = camposDaConsultaCNPJ(data);
      // Edição: só os vazios (RN-34.03). Novo: preenche tudo que a consulta trouxe.
      setForm((prev) => (editando ? mesclarSoVazios(prev, novos) : sobreporNaoVazios(prev, novos)));
    } catch (e) {
      toast.error('Não foi possível consultar o CNPJ');
    } finally {
      setBuscandoCnpj(false);
    }
  }, [editando]);

  const onBlurCNPJ = () => {
    const digitos = somenteDigitos(form.cnpj);
    if (!editando && digitos.length === 14 && validarCNPJ(digitos)) buscarCNPJ(form.cnpj);
  };

  /* ── CEP ──────────────────────────────────────────────────────────── */
  const buscarCEP = useCallback(async (cepMascarado) => {
    const digitos = somenteDigitos(cepMascarado);
    if (digitos.length !== 8) return;
    setBuscandoCep(true);
    try {
      const resp = await api.get(`/cep/${digitos}`);
      const d = resp?.data || {};
      const novos = {
        endereco: [d.logradouro, d.bairro].map((v) => texto(v).trim()).filter(Boolean).join(', '),
        cidade: texto(d.cidade),
        estado: texto(d.estado).toUpperCase(),
      };
      // Sempre só os vazios (RN-34.04): o CEP completa, não substitui.
      setForm((prev) => mesclarSoVazios(prev, novos));
    } catch (e) {
      if (e?.response?.status === 404) toast.error('CEP não encontrado');
      else toast.error('Não foi possível consultar o CEP');
    } finally {
      setBuscandoCep(false);
    }
  }, []);

  /* ── submit ───────────────────────────────────────────────────────── */
  const handleSubmit = async (e) => {
    e.preventDefault();
    setErro('');
    if (!form.razao_social.trim()) {
      setErro('Razão social é obrigatória');
      return;
    }
    const corpo = {};
    CHAVES_CONTRATO.forEach((k) => { corpo[k] = k === 'razao_social' ? form[k].trim() : form[k]; });
    if (editando) corpo.status = form.status;

    setSalvando(true);
    try {
      if (editando) await api.put(`/compras/fornecedores/${id}`, corpo);
      else await api.post('/compras/fornecedores', corpo);
      toast.success('Fornecedor salvo');
      navigate('/compras/fornecedores');
    } catch (err) {
      setErro(err?.response?.data?.error || err?.message || 'Erro ao salvar fornecedor');
    } finally {
      setSalvando(false);
    }
  };

  const voltar = () => navigate('/compras/fornecedores');

  return (
    <div className="fornecedor-form-page">
      <div className="fornecedor-form-topo">
        <div>
          <button type="button" className="fornecedor-form-voltar" onClick={voltar}>
            <FiArrowLeft /> Fornecedores
          </button>
          <h1>{editando ? 'Editar fornecedor' : 'Novo fornecedor'}</h1>
        </div>
      </div>

      {erro && <div role="alert" className="fornecedor-form-erro">{erro}</div>}

      {carregando ? (
        <div className="fornecedor-form-carregando">Carregando…</div>
      ) : (
        <form className="fornecedor-form" onSubmit={handleSubmit} noValidate>
          <section className="form-section">
            <h2>Identificação</h2>
            <div className="form-grid">
              <Campo id="fornecedor-razao" label="Razão social" obrigatorio className="span-2">
                <input id="fornecedor-razao" data-testid="fornecedor-razao" type="text"
                  value={form.razao_social} onChange={(e) => set('razao_social', e.target.value)}
                  autoComplete="organization" />
              </Campo>
              <Campo id="fornecedor-fantasia" label="Nome fantasia">
                <input id="fornecedor-fantasia" data-testid="fornecedor-fantasia" type="text"
                  value={form.nome_fantasia} onChange={(e) => set('nome_fantasia', e.target.value)} />
              </Campo>
              <Campo id="fornecedor-cnpj" label="CNPJ">
                <div className="input-com-botao">
                  <input id="fornecedor-cnpj" data-testid="fornecedor-cnpj" type="text" inputMode="numeric"
                    value={form.cnpj} onChange={(e) => set('cnpj', formatarCNPJ(e.target.value))}
                    onBlur={onBlurCNPJ} placeholder="00.000.000/0000-00" maxLength={18}
                    disabled={buscandoCnpj} />
                  <button type="button" className="btn-buscar-cnpj" title="Buscar dados do CNPJ"
                    aria-label="Buscar dados do CNPJ" onClick={() => buscarCNPJ(form.cnpj)}
                    disabled={buscandoCnpj}>
                    {buscandoCnpj ? <FiLoader className="girando" /> : <FiSearch />}
                  </button>
                </div>
              </Campo>
              <Campo id="fornecedor-ie" label="Inscrição estadual">
                <input id="fornecedor-ie" data-testid="fornecedor-ie" type="text"
                  value={form.inscricao_estadual} onChange={(e) => set('inscricao_estadual', e.target.value)} />
              </Campo>
              <Campo id="fornecedor-grupo" label="Grupo homologado">
                <select id="fornecedor-grupo" data-testid="fornecedor-grupo"
                  value={form.grupo_id} onChange={(e) => set('grupo_id', e.target.value)}>
                  <option value="">Sem grupo</option>
                  {grupos.map((g) => <option key={g.id} value={String(g.id)}>{g.nome}</option>)}
                </select>
              </Campo>
              {editando && (
                <Campo id="fornecedor-status" label="Status">
                  <select id="fornecedor-status" data-testid="fornecedor-status"
                    value={form.status} onChange={(e) => set('status', e.target.value)}>
                    <option value="ativo">Ativo</option>
                    <option value="inativo">Inativo</option>
                  </select>
                </Campo>
              )}
            </div>
          </section>

          <section className="form-section">
            <h2>Contato</h2>
            <div className="form-grid">
              <Campo id="fornecedor-contato" label="Nome do vendedor">
                <input id="fornecedor-contato" data-testid="fornecedor-contato" type="text"
                  value={form.contato} onChange={(e) => set('contato', e.target.value)} />
              </Campo>
              <Campo id="fornecedor-telefone" label="Telefone da empresa">
                <input id="fornecedor-telefone" data-testid="fornecedor-telefone" type="tel"
                  value={form.telefone} onChange={(e) => set('telefone', mascararTelefoneDigitando(e.target.value))}
                  placeholder="(00) 0000-0000" />
              </Campo>
              <Campo id="fornecedor-telefone-vendedor" label="Telefone do vendedor">
                <input id="fornecedor-telefone-vendedor" data-testid="fornecedor-telefone-vendedor" type="tel"
                  value={form.telefone_vendedor}
                  onChange={(e) => set('telefone_vendedor', mascararTelefoneDigitando(e.target.value))}
                  placeholder="(00) 00000-0000" />
              </Campo>
              <Campo id="fornecedor-email" label="E-mail">
                <input id="fornecedor-email" data-testid="fornecedor-email" type="email"
                  value={form.email} onChange={(e) => set('email', e.target.value)} />
              </Campo>
            </div>
          </section>

          <section className="form-section">
            <h2>Endereço</h2>
            <div className="form-grid">
              <Campo id="fornecedor-cep" label="CEP">
                <div className="input-com-botao">
                  <input id="fornecedor-cep" data-testid="fornecedor-cep" type="text" inputMode="numeric"
                    value={form.cep} onChange={(e) => set('cep', formatarCEP(e.target.value.slice(0, 9)))}
                    onBlur={() => buscarCEP(form.cep)} placeholder="00000-000" maxLength={9}
                    disabled={buscandoCep} />
                  <button type="button" className="btn-buscar-cep" title="Buscar endereço pelo CEP"
                    aria-label="Buscar endereço pelo CEP" onClick={() => buscarCEP(form.cep)}
                    disabled={buscandoCep}>
                    {buscandoCep ? <FiLoader className="girando" /> : <FiSearch />}
                  </button>
                </div>
              </Campo>
              <Campo id="fornecedor-endereco" label="Endereço" className="span-2">
                <input id="fornecedor-endereco" data-testid="fornecedor-endereco" type="text"
                  value={form.endereco} onChange={(e) => set('endereco', e.target.value)}
                  placeholder="Logradouro, número - complemento, bairro" />
              </Campo>
              <Campo id="fornecedor-cidade" label="Cidade">
                <input id="fornecedor-cidade" data-testid="fornecedor-cidade" type="text"
                  value={form.cidade} onChange={(e) => set('cidade', e.target.value)} />
              </Campo>
              <Campo id="fornecedor-estado" label="Estado">
                <select id="fornecedor-estado" data-testid="fornecedor-estado"
                  value={form.estado} onChange={(e) => set('estado', e.target.value)}>
                  <option value="">—</option>
                  {UFS.map((uf) => <option key={uf} value={uf}>{uf}</option>)}
                </select>
              </Campo>
            </div>
          </section>

          <div className="form-actions">
            <button type="button" className="btn-secondary" onClick={voltar} disabled={salvando}>
              Cancelar
            </button>
            <button type="submit" className="btn-primary" disabled={salvando}>
              <FiSave /> {salvando ? 'Salvando…' : 'Salvar'}
            </button>
          </div>
        </form>
      )}
    </div>
  );
};

export default FornecedorForm;
