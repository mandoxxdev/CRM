import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { toast } from 'react-toastify';
import {
  FiAlertTriangle, FiChevronDown, FiChevronRight, FiEdit2, FiEye, FiLayers, FiPlus, FiRefreshCw, FiRotateCcw, FiSave, FiTrash2,
} from 'react-icons/fi';
import api from '../../services/api';
import { prefixarAlmoxarifado } from '../../utils/localizacaoLabel';
import AvisoSomenteLeitura from './AvisoSomenteLeitura';
import './Almoxarifado.css';

/* ===================== TAB FAMÍLIAS DE MATERIAL ===================== */
/**
 * Etapa 37 (RN-37.01 a 37.04, 37.08): a aba desenha a árvore de DOIS níveis que o servidor já
 * conhecia desde a Etapa 2 (`parent_id`, `validateParentFamilia`). Até aqui a lista era plana —
 * subfamília aparecia como cartão irmão da raiz, sem indicação, e criar uma "só via API".
 *
 *  - Só RAÍZES viram cartões; as subfamílias ficam numa sub-lista DENTRO do cartão da raiz,
 *    irmã do cabeçalho clicável (e não dentro dele): o cabeçalho inteiro expande/colapsa a raiz
 *    e as ações da sub não podem disparar isso.
 *  - "Nova subfamília" no cartão da raiz reutiliza o MESMO formulário com o pai TRAVADO
 *    (`parentForm`). O POST leva `parent_id`; o PUT NÃO leva (o servidor preserva o pai quando a
 *    chave é omitida). Descartado: um <select> de pai no formulário — deixaria promover/rebaixar
 *    ou mover entre raízes por engano; o servidor cobre esses casos e a UI não precisa expô-los
 *    nesta etapa (reversível).
 *  - A contagem (`qtd_itens`) e os itens da sub vêm do servidor (T1): aqui só se exibe.
 *  - "Adicionar item" da sub leva `familia_id=<raiz>&subfamilia_id=<sub>` — o form de material
 *    grava `familia_id` = raiz e `subfamilia_id` = filha, e o código vem do prefixo da raiz.
 */
const FORM_FAMILIA_VAZIO = { nome: '', descricao: '', codigo: '', tipo_uso: 'ambos' };
const ehRaiz = (f) => f.parent_id === null || f.parent_id === undefined;
const porNome = (a, b) => String(a.nome || '').localeCompare(String(b.nome || ''), 'pt-BR');
// Etapa 124 (RN-16..RN-19, B802): a aba lista também as INATIVAS (`?ativo=all`) — era a única tela que podia reativar uma
// família e não mostrava nenhuma: a recusa da requisição de material inativo manda reativar a família aqui. NULL é inativa
// (a leitura do servidor: `ativo !== 1`). As inativas vão depois das ativas.
const ehInativa = (f) => Number(f.ativo) !== 1;
const ativasPrimeiro = (a, b) => (ehInativa(a) - ehInativa(b)) || porNome(a, b);
const SELO_INATIVA_STYLE = { fontSize: '0.7rem', background: 'rgba(120,144,156,0.15)', color: 'var(--gmp-text-light)', padding: '2px 10px', borderRadius: 20, fontWeight: 600 };

// Etapa 125 (C259, RN-16; B808): a frase da aba para quem o servidor nao deixa gravar familia.
// Etapa 126 (B812): sai de `fraseSomenteLeitura`, com a MESMA literal da 125.
// Etapa 211 (RN-211.03): o aviso do Almoxarifado — a aba so consulta; a MESMA literal do 403 do servidor (MSG_FAMILIAS_NO_COMPRAS).
export const AVISO_FAMILIAS_NO_COMPRAS = 'O cadastro de famílias é feito em Compras → Famílias.';

// Etapa 211 (contrato do plano): por onde a tela fala com o servidor. O Almoxarifado le pelas rotas dele (gravar recusa, RN-211.02);
// o Compras le e grava pelas portas `/compras/materiais/...` (o prefixo `/almoxarifado` exige o modulo Almoxarifado).
export const ROTAS_FAMILIAS_ALMOXARIFADO = {
  lista: '/almoxarifado/familias',
  itens: (id) => `/almoxarifado/familias/${id}/itens`,
  criar: '/almoxarifado/familias',
  familia: (id) => `/almoxarifado/familias/${id}`,
};
export const ROTAS_FAMILIAS_COMPRAS = {
  lista: '/compras/materiais/aux/familias',
  itens: (id) => `/compras/materiais/aux/familias/${id}/itens`,
  criar: '/compras/materiais/familias',
  familia: (id) => `/compras/materiais/familias/${id}`,
};

/**
 * Etapa 211: a aba saiu de `ConfiguracoesAlmoxarifado.js` para servir as duas telas — Almoxarifado -> Configuracoes -> Familias
 * (`podeGravar` false, sempre: RN-211.03) e Compras -> Familias (`podeGravar` = admin do Compras ou do sistema: RN-211.01).
 * `aviso`: a faixa de cima (null = nenhuma). `linkDoItem`: para onde o "Ver" de cada item leva.
 */
const FamiliasDeMaterial = ({ rotas, podeGravar = false, aviso = null, linkDoItem }) => {
  // Etapa 125 (C259, RN-16/RN-17; Fase 2, I1): os gestos de FAMILIA (Nova familia, Nova subfamilia, Editar, Inativar, Reativar)
  // so para quem o servidor deixa (`podeGravarConfigAlmox`); os de MATERIAL (Adicionar item, Cadastrar primeiro item, editar o
  // item) ficam — criar e editar material tem a regra propria, que o administrador do sistema passa.
  const [familias, setFamilias] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [editando, setEditando] = useState(null);
  // id da raiz-pai quando o formulário é de SUBFAMÍLIA (nova ou em edição); null = família raiz.
  const [parentForm, setParentForm] = useState(null);
  const [form, setForm] = useState(FORM_FAMILIA_VAZIO);
  // Etapa 126 (D (125), RN-29; B815): o que o Editar LEU da lista (crus: null fica null), mandado como `campos_lidos`. Nao se
  // atualiza no recarregar da lista (Fase 2, I2): salvar de novo depois de um 409 recebe o 409 de novo — atualizar desfaria a
  // mudanca do outro calado. So o proximo Editar le de novo.
  const [lidosEdicao, setLidosEdicao] = useState(null);
  const [expandidas, setExpandidas] = useState({});
  const [itensPorFamilia, setItensPorFamilia] = useState({});
  const [loadingItens, setLoadingItens] = useState({});

  useEffect(() => { loadFamilias(); }, []);

  const raizes = familias.filter(ehRaiz).sort(ativasPrimeiro);
  // F3 da revisao da Etapa 37: sub cujo pai NAO esta na lista (raiz inativada por fora, so com
  // UPDATE direto — as rotas recusam) sumiria da arvore em silencio. Aparece num bloco proprio.
  // Etapa 124 (RN-19): com as inativas na lista, a orfa e a sub sem raiz na lista OU a sub ATIVA sob raiz inativa (o estado
  // que as rotas recusam) — esta continua no bloco, e nao dentro do cartao da raiz inativa.
  const ehOrfa = (f) => {
    if (ehRaiz(f)) return false;
    const raiz = raizes.find(r => String(r.id) === String(f.parent_id));
    return !raiz || (!ehInativa(f) && ehInativa(raiz));
  };
  const subsDe = (raizId) => familias.filter(f => !ehRaiz(f) && String(f.parent_id) === String(raizId) && !ehOrfa(f))
    .sort(ativasPrimeiro);
  const orfas = familias.filter(ehOrfa).sort(porNome);
  const pai = parentForm ? familias.find(f => String(f.id) === String(parentForm)) : null;

  const loadFamilias = async () => {
    setLoading(true);
    try {
      // RN-16: `?ativo=all` — sem ele a inativa some da única tela que pode reativá-la (o molde das Categorias, `?todos=1`).
      const res = await api.get(`${rotas.lista}?ativo=all`);
      setFamilias(res.data);
    } catch { toast.error('Erro ao carregar famílias'); }
    finally { setLoading(false); }
  };

  const loadItensFamilia = async (familiaId) => {
    setLoadingItens(prev => ({ ...prev, [familiaId]: true }));
    try {
      const res = await api.get(rotas.itens(familiaId));
      setItensPorFamilia(prev => ({ ...prev, [familiaId]: res.data }));
    } catch { toast.error('Erro ao carregar itens da família'); }
    finally { setLoadingItens(prev => ({ ...prev, [familiaId]: false })); }
  };

  const toggleExpand = (familiaId) => {
    const abrir = !expandidas[familiaId];
    setExpandidas(prev => ({ ...prev, [familiaId]: abrir }));
    if (abrir && !itensPorFamilia[familiaId]) loadItensFamilia(familiaId);
  };

  const resetForm = () => {
    setForm(FORM_FAMILIA_VAZIO);
    setEditando(null);
    setLidosEdicao(null);
    setParentForm(null);
    setShowForm(false);
  };

  const handleNovaRaiz = () => {
    setForm(FORM_FAMILIA_VAZIO);
    setEditando(null);
    setParentForm(null);
    setShowForm(true);
  };

  // RN-37.02: mesmo formulário, pai travado na raiz do cartão onde o botão foi clicado.
  const handleNovaSub = (raiz) => {
    setForm(FORM_FAMILIA_VAZIO);
    setEditando(null);
    setParentForm(raiz.id);
    setShowForm(true);
  };

  const handleEditar = (fam) => {
    setForm({
      nome: fam.nome,
      descricao: fam.descricao || '',
      codigo: fam.codigo,
      tipo_uso: fam.tipo_uso || 'ambos',
    });
    setEditando(fam.id);
    setLidosEdicao({ nome: fam.nome ?? null, tipo_uso: fam.tipo_uso ?? null, descricao: fam.descricao ?? null });
    setParentForm(ehRaiz(fam) ? null : fam.parent_id);
    setShowForm(true);
  };

  const rotulo = parentForm ? 'Subfamília' : 'Família';

  const handleSalvar = async () => {
    if (!form.nome.trim()) { toast.error('Nome é obrigatório'); return; }
    setSaving(true);
    try {
      if (editando) {
        // RN-37.03: SEM `parent_id` — o servidor preserva o pai quando a chave é omitida.
        await api.put(rotas.familia(editando), {
          nome: form.nome,
          descricao: form.descricao,
          tipo_uso: form.tipo_uso,
          campos_lidos: lidosEdicao,
        });
        toast.success(`${rotulo} atualizada!`);
      } else {
        // RN-37.02: `parent_id` só quando é subfamília; raiz continua com as 4 chaves de sempre.
        await api.post(rotas.criar, parentForm ? { ...form, parent_id: parentForm } : form);
        toast.success(`${rotulo} criada!`);
      }
      resetForm();
      loadFamilias();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Erro ao salvar');
      // Etapa 126 (RN-29; B816): no 409 (outra pessoa mudou a familia) o formulario FICA com o digitado e a lista recarrega — mostra o
      // que o outro gravou; o proximo Editar le de novo.
      if (err.response?.status === 409) loadFamilias();
    } finally { setSaving(false); }
  };

  // RN-37.04: o servidor recusa sub com itens ativos e raiz com subs ativas — a literal do 400
  // vai para o toast (antes a tela já fazia isso para a raiz; agora vale para as duas).
  const handleInativar = async (fam) => {
    const tipo = ehRaiz(fam) ? 'família' : 'subfamília';
    if (!window.confirm(`Inativar a ${tipo} "${fam.nome}"? Novos itens não poderão ser cadastrados.`)) return;
    try {
      await api.delete(rotas.familia(fam.id));
      toast.success(ehRaiz(fam) ? 'Família inativada' : 'Subfamília inativada');
      loadFamilias();
    } catch (err) { toast.error(err.response?.data?.error || 'Erro ao inativar'); }
  };

  // RN-17: `ativo: 1` EXPLÍCITO — o Editar não manda `ativo` e por isso não reativa. Etapa 125 (RN-12; B807): SEM o `nome` —
  // a rota preserva o gravado quando ele é omitido; mandar o da lista desfazia o renomear de outro Administrador feito depois de a
  // lista carregar. A recusa do servidor (subfamília de raiz inativa, perfil sem acesso) vai para o toast com a literal.
  const handleReativar = async (fam) => {
    try {
      await api.put(rotas.familia(fam.id), { ativo: 1 });
      toast.success(ehRaiz(fam) ? 'Família reativada' : 'Subfamília reativada');
      loadFamilias();
    } catch (err) { toast.error(err.response?.data?.error || 'Erro ao reativar'); }
  };
  const botaoReativar = (fam, size = 12) => (
    <button type="button" className="btn-almox-secondary" title="Reativar" style={{ fontSize: '0.72rem', padding: '4px 10px' }}
      onClick={() => handleReativar(fam)}>
      <FiRotateCcw size={size} /> Reativar
    </button>
  );
  const seloInativa = (fam) => ehInativa(fam) && <span className="almox-selo-inativa" style={SELO_INATIVA_STYLE}>Inativa</span>;

  // Tabela de itens de uma família/subfamília expandida — a mesma para os dois níveis.
  // Etapa 193 (RN-193.01): o cadastro de material e so do Compras — os "Adicionar item" / "Cadastrar primeiro item" sairam
  // e o lapis de cada item virou "Ver" (a ficha so para leitura).
  const renderItens = (fam) => {
    const itens = itensPorFamilia[fam.id] || [];
    if (loadingItens[fam.id]) {
      return <div style={{ fontSize: '0.8rem', color: 'var(--gmp-text-light)' }}>Carregando itens...</div>;
    }
    if (itens.length === 0) {
      return (
        <div style={{ fontSize: '0.85rem', color: 'var(--gmp-text-light)' }}>
          Nenhum item nesta {ehRaiz(fam) ? 'família' : 'subfamília'}.
        </div>
      );
    }
    return (
      <table className="almox-table" style={{ fontSize: '0.85rem' }}>
        <thead>
          <tr>
            <th>Código</th>
            <th>Nome</th>
            <th>Saldo</th>
            <th>Localização</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {itens.map(item => (
            <tr key={item.id}>
              <td><span style={{ fontFamily: 'monospace', color: '#4facfe' }}>{item.codigo}</span></td>
              <td>{item.nome}</td>
              <td>{item.quantidade_atual} {item.unidade}</td>
              <td style={{ color: 'var(--gmp-text-light)', fontSize: '0.8rem' }}>
                {prefixarAlmoxarifado(item.localizacao, item.almoxarifado_codigo) || '—'}
              </td>
              <td>
                <Link to={linkDoItem(item.id)} className="almox-btn-icon" title="Ver"
                  data-testid={`ver-item-${item.id}`}>
                  <FiEye size={13} />
                </Link>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    );
  };

  const seloTipoUso = (fam) => fam.tipo_uso && fam.tipo_uso !== 'ambos' && (
    <span style={{
      fontSize: '0.7rem', padding: '2px 8px', borderRadius: 20, fontWeight: 600,
      background: fam.tipo_uso === 'administrativo' ? 'rgba(46,204,113,0.12)' : 'rgba(229,152,0,0.12)',
      color: fam.tipo_uso === 'administrativo' ? '#27ae60' : '#e59800',
    }}>
      {fam.tipo_uso === 'administrativo' ? 'ADM' : 'IND'}
    </span>
  );

  const seloContagem = (fam) => (
    <span style={{ fontSize: '0.75rem', background: 'rgba(79,172,254,0.1)', color: '#4facfe', padding: '2px 10px', borderRadius: 20, fontWeight: 600 }}>
      {fam.qtd_itens || 0} {fam.qtd_itens === 1 ? 'item' : 'itens'}
    </span>
  );

  return (
    <div>
      <p style={{ fontSize: '0.85rem', color: 'var(--gmp-text-light)', marginBottom: 20 }}>
        Agrupe materiais em famílias (ex.: Parafusos e Porcas) e cadastre cada SKU como item dentro da família.
        Cada item mantém sua própria localização e estoque.
      </p>

      {aviso && <AvisoSomenteLeitura frase={aviso} className="almox-familias-somente-leitura" />}

      {!showForm && podeGravar && (
        <button className="btn-almox-primary" style={{ marginBottom: 20 }} onClick={handleNovaRaiz}>
          <FiPlus size={14} /> Nova Família
        </button>
      )}

      {showForm && (
        <div style={{ background: 'var(--gmp-surface)', border: '1px solid rgba(79,172,254,0.25)', borderRadius: 12, padding: 24, marginBottom: 24 }}>
          <div style={{ fontWeight: 700, fontSize: '0.9rem', marginBottom: 18 }}>
            {editando
              ? `✏️ Editar ${rotulo}`
              : pai
                ? `➕ Nova subfamília de ${pai.codigo} — ${pai.nome}`
                : '➕ Nova Família de Material'}
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 16 }}>
            {pai && (
              <div className="almox-field" style={{ gridColumn: '1 / -1' }}>
                <label className="almox-label">Subfamília de:</label>
                {/* Pai TRAVADO (RN-37.02/03) — informação, não campo. Mover entre raízes fica fora da tela. */}
                <div style={{ fontFamily: 'monospace', fontWeight: 700, color: '#4facfe', fontSize: '0.85rem', padding: '8px 12px', background: 'var(--gmp-bg)', border: '1px solid var(--gmp-border)', borderRadius: 8 }}>
                  {pai.codigo} — {pai.nome}
                </div>
              </div>
            )}
            <div className="almox-field">
              <label className="almox-label">Nome<span className="required">*</span></label>
              <input className="almox-input" value={form.nome} onChange={e => setForm(f => ({ ...f, nome: e.target.value }))}
                placeholder="Ex: Parafusos e Porcas" />
            </div>
            {!editando && (
              <div className="almox-field">
                <label className="almox-label">Código <span style={{ fontWeight: 400, color: 'var(--gmp-text-light)' }}>(opcional — gerado automaticamente)</span></label>
                <input className="almox-input" value={form.codigo} onChange={e => setForm(f => ({ ...f, codigo: e.target.value.toUpperCase() }))}
                  placeholder="Ex: PAR" style={{ fontFamily: 'monospace' }} maxLength={10} />
              </div>
            )}
            {editando && (
              <div className="almox-field">
                <label className="almox-label">Código</label>
                <input className="almox-input" value={form.codigo} readOnly style={{ fontFamily: 'monospace', opacity: 0.7 }} />
              </div>
            )}
            <div className="almox-field">
              <label className="almox-label">Tipo de uso<span className="required">*</span></label>
              <select className="almox-form-select" value={form.tipo_uso}
                onChange={e => setForm(f => ({ ...f, tipo_uso: e.target.value }))}>
                <option value="administrativo">Administrativo (escritório, EPI, consumíveis)</option>
                <option value="industrial">Industrial (fábrica, manutenção)</option>
                <option value="ambos">Ambos</option>
              </select>
            </div>
            <div className="almox-field" style={{ gridColumn: '1 / -1' }}>
              <label className="almox-label">Descrição</label>
              <input className="almox-input" value={form.descricao} onChange={e => setForm(f => ({ ...f, descricao: e.target.value }))}
                placeholder="Descrição breve da família" />
            </div>
          </div>
          <div style={{ display: 'flex', gap: 10 }}>
            <button className="btn-almox-primary" onClick={handleSalvar} disabled={saving}>
              <FiSave size={14} /> {saving ? 'Salvando...' : `Salvar ${rotulo}`}
            </button>
            <button className="btn-almox-secondary" onClick={resetForm}>Cancelar</button>
          </div>
        </div>
      )}

      {loading ? (
        <div className="almox-loading"><FiRefreshCw size={16} style={{ animation: 'spin 1s linear infinite' }} /> Carregando...</div>
      ) : familias.length === 0 ? (
        <div className="almox-empty" style={{ padding: 40 }}>
          <FiLayers size={40} style={{ opacity: 0.3, display: 'block', margin: '0 auto 12px' }} />
          <p>Nenhuma família cadastrada</p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {orfas.length > 0 && (
            <div className="almox-familia-orfas" style={{ background: 'rgba(249,168,37,0.08)', border: '1px solid rgba(249,168,37,0.4)', borderRadius: 12, padding: '12px 16px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontWeight: 600, marginBottom: 6 }}>
                <FiAlertTriangle size={16} color="#f9a825" /> Subfamílias sem família ativa ({orfas.length})
              </div>
              <div style={{ fontSize: '0.8rem', color: 'var(--gmp-text-light)', marginBottom: 8 }}>
                {/* Etapa 211 (Fase 5): na aba que so consulta, o aviso diz ONDE se reativa (o Almoxarifado nao tem o botao). */}
                A família destas subfamílias está inativa. Reative a família ou inative a subfamília{podeGravar ? '' : ' em Compras → Famílias'}.
              </div>
              {orfas.map(sub => (
                <div key={sub.id} className="almox-subfamilia-row" style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', padding: '4px 0' }}>
                  <span style={{ fontFamily: 'monospace', fontWeight: 700, color: '#4facfe', fontSize: '0.8rem' }}>{sub.codigo}</span>
                  <span style={{ fontWeight: 500 }}>{sub.nome}</span>
                  <span style={{ fontSize: '0.75rem', color: 'var(--gmp-text-light)' }}>família: {sub.parent_nome || sub.parent_id}</span>
                  {seloInativa(sub)}
                  {podeGravar && (
                  <span style={{ marginLeft: 'auto', display: 'flex', gap: 4 }}>
                    <button type="button" className="almox-btn-icon" title="Editar" onClick={() => handleEditar(sub)}><FiEdit2 size={14} /></button>
                    {ehInativa(sub)
                      ? botaoReativar(sub)
                      : <button type="button" className="almox-btn-icon danger" title="Inativar" onClick={() => handleInativar(sub)}><FiTrash2 size={14} /></button>}
                  </span>
                  )}
                </div>
              ))}
            </div>
          )}
          {raizes.map(fam => {
            const expandida = !!expandidas[fam.id];
            const subs = subsDe(fam.id);
            const raizInativa = ehInativa(fam);
            return (
              <div key={fam.id} className={`almox-familia-card${raizInativa ? ' almox-familia-inativa' : ''}`} style={{ background: 'var(--gmp-surface)', border: '1px solid var(--gmp-border)', borderRadius: 12, overflow: 'hidden', opacity: raizInativa ? 0.85 : 1 }}>
                {/* Cabeçalho INTEIRO clicável (expande/colapsa a raiz). A sub-lista fica FORA dele,
                    como irmã dentro do cartão — senão clicar numa ação da sub expandiria a raiz. */}
                <div className="almox-familia-cabecalho" style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '14px 18px', cursor: 'pointer' }}
                  onClick={() => toggleExpand(fam.id)}>
                  <button type="button" className="almox-btn-icon" style={{ pointerEvents: 'none' }}>
                    {expandida ? <FiChevronDown size={14} /> : <FiChevronRight size={14} />}
                  </button>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                      <span style={{ fontFamily: 'monospace', fontWeight: 700, color: '#4facfe', fontSize: '0.85rem' }}>{fam.codigo}</span>
                      <span style={{ fontWeight: 700, fontSize: '0.95rem' }}>{fam.nome}</span>
                      {seloContagem(fam)}
                      {seloTipoUso(fam)}
                      {seloInativa(fam)}
                    </div>
                    {fam.descricao && <div style={{ fontSize: '0.75rem', color: 'var(--gmp-text-light)', marginTop: 4 }}>{fam.descricao}</div>}
                  </div>
                  {/* RN-18: a inativa nao oferece Adicionar item nem Inativar — oferece Editar e Reativar. */}
                  <div style={{ display: 'flex', gap: 6 }} onClick={e => e.stopPropagation()}>
                    {podeGravar && <button className="almox-btn-icon" onClick={() => handleEditar(fam)} title="Editar"><FiEdit2 size={13} /></button>}
                    {podeGravar && (raizInativa
                      ? botaoReativar(fam)
                      : <button className="almox-btn-icon danger" onClick={() => handleInativar(fam)} title="Inativar"><FiTrash2 size={13} /></button>)}
                  </div>
                </div>

                {expandida && (
                  <div style={{ borderTop: '1px solid var(--gmp-border)', padding: '12px 18px 16px 48px', background: 'var(--gmp-bg)' }}>
                    {renderItens(fam)}
                  </div>
                )}

                {/* RN-37.01: a sub-lista — indentada 24px com borda à esquerda, irmã do cabeçalho. */}
                <div className="almox-subfamilias" style={{ borderTop: '1px solid var(--gmp-border)', padding: '10px 18px 12px 24px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap', marginBottom: subs.length ? 8 : 0 }}>
                    <span style={{ fontSize: '0.72rem', fontWeight: 700, letterSpacing: '0.04em', textTransform: 'uppercase', color: 'var(--gmp-text-light)' }}>
                      Subfamílias{subs.length ? ` (${subs.length})` : ''}
                    </span>
                    {!raizInativa && podeGravar && (
                      <button type="button" className="btn-almox-secondary" style={{ fontSize: '0.75rem', padding: '4px 10px' }} onClick={() => handleNovaSub(fam)}>
                        <FiPlus size={12} /> Nova subfamília
                      </button>
                    )}
                  </div>
                  {subs.length === 0 ? (
                    <div style={{ fontSize: '0.8rem', color: 'var(--gmp-text-light)', opacity: 0.8 }}>Nenhuma subfamília</div>
                  ) : (
                    <div style={{ borderLeft: '2px solid rgba(79,172,254,0.25)', display: 'flex', flexDirection: 'column' }}>
                      {subs.map(sub => {
                        const subExpandida = !!expandidas[sub.id];
                        return (
                          <div key={sub.id} className="almox-subfamilia-row">
                            {/* `flexWrap` de propósito: no celular (328px úteis) as ações caem numa linha própria. */}
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', padding: '6px 0 6px 12px' }}>
                              <button type="button" className="almox-btn-icon" title="Itens da subfamília" onClick={() => toggleExpand(sub.id)}>
                                {subExpandida ? <FiChevronDown size={13} /> : <FiChevronRight size={13} />}
                              </button>
                              <span style={{ fontFamily: 'monospace', fontWeight: 700, color: '#4facfe', fontSize: '0.8rem' }}>{sub.codigo}</span>
                              <span style={{ fontWeight: 600, fontSize: '0.88rem' }}>{sub.nome}</span>
                              {seloContagem(sub)}
                              {seloTipoUso(sub)}
                              {seloInativa(sub)}
                              <div style={{ display: 'flex', gap: 6, marginLeft: 'auto' }}>
                                {podeGravar && <button className="almox-btn-icon" onClick={() => handleEditar(sub)} title="Editar"><FiEdit2 size={13} /></button>}
                                {podeGravar && (ehInativa(sub)
                                  ? botaoReativar(sub)
                                  : <button className="almox-btn-icon danger" onClick={() => handleInativar(sub)} title="Inativar"><FiTrash2 size={13} /></button>)}
                              </div>
                            </div>
                            {sub.descricao && <div style={{ fontSize: '0.72rem', color: 'var(--gmp-text-light)', paddingLeft: 42, marginTop: -4, marginBottom: 4 }}>{sub.descricao}</div>}
                            {subExpandida && (
                              <div style={{ background: 'var(--gmp-bg)', padding: '10px 12px 12px', paddingLeft: 24, marginBottom: 6 }}>
                                {renderItens(sub)}
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default FamiliasDeMaterial;
