/**
 * A lista de materiais — filtros e tabela — compartilhada por Almoxarifado → Materiais e Compras → Materiais.
 *
 * Ate 04/11/2026 o Compras tinha uma lista propria (Etapa 192, `bcbd4ed2`), escrita do zero com seis colunas (Codigo, Material,
 * Familia, Unidade, NCM, Acoes) e so busca + situacao. O pedido do Andre era MOVER a tela do Almoxarifado para o Compras, nao
 * fazer outra: "Era pra ser uma migração de tela de lugar, nao uma tela diferente". Por isso a lista mora aqui, uma copia so —
 * as duas telas mostram as mesmas colunas e os mesmos filtros, e cada uma passa os botoes dela em `renderAcoes`
 * (o Almoxarifado: extrato, requisitar, mapa, etiqueta, plano, entrada/saida rapida, anexos, Ver; o Compras: editar,
 * inativar/reativar).
 *
 * O servidor e o mesmo dos dois lados (`listarMateriais`, pelas portas `/almoxarifado/materiais` e
 * `/compras/materiais/cadastro`), com os mesmos parametros (`search`, `categoria`, `familia_id`, `subfamilia_id`, `status`).
 */
import React, { useMemo } from 'react';
import { FiSearch, FiImage, FiPackage, FiAlertTriangle } from 'react-icons/fi';
import { resolveMaterialPhotoUrl } from '../../utils/resolveMaterialPhotoUrl';
import { prefixarAlmoxarifado } from '../../utils/localizacaoLabel';
import { SkeletonTable } from '../SkeletonLoader';
import SeloProprietario from './SeloProprietario';
import './Almoxarifado.css';

// Etapa 113 (RN-08): `ativo` 0 ou NULL e inativo (a regua do servidor); ausente na linha = ativo.
export const estaInativo = (m) => m.ativo === 0 || m.ativo === null;

export const getStatus = (m) => {
  if (estaInativo(m)) return { label: 'Inativo', cls: 'zerado' };
  if (m.quantidade_atual === 0) return { label: 'Zerado', cls: 'zerado' };
  if (m.quantidade_minima > 0 && m.quantidade_atual <= m.quantidade_minima) return { label: 'Crítico', cls: 'critico' };
  if (m.quantidade_minima > 0 && m.quantidade_atual <= m.quantidade_minima * 1.5) return { label: 'Baixo', cls: 'baixo' };
  return { label: 'OK', cls: 'ok' };
};

// Etapa 223 (RN-223.08, B1482; Fase 2 I1): o numero e a regua da aprovacao, que tira o ja bloqueado no material — a dica diz isso e
// aponta o extrato (que mostra os dois cartoes). Campo ausente, nulo ou nao numerico = nada na tela.
export const DICA_LOTE_IMPEDIDO = 'Em lote bloqueado, reprovado ou vencido, fora o que já está bloqueado no material: não sai para uso '
  + 'até o lote ser liberado na tela Lotes e Séries. O extrato mostra os dois números.';
export const temLoteImpedido = (m) => m.lote_impedido != null && Number.isFinite(Number(m.lote_impedido))
  && Number(m.lote_impedido) > 0;
export const seloLoteImpedido = (m) => `${Number(m.lote_impedido)}${m.unidade ? ` ${m.unidade}` : ''} em lote impedido`;

const getPct = (m) => {
  if (!m.quantidade_maxima || m.quantidade_maxima === 0) return 50;
  return Math.min(100, (m.quantidade_atual / m.quantidade_maxima) * 100);
};

/**
 * Etapa 37 (RN-37.06): o material grava `familia_id` = raiz e `subfamilia_id` = filha, entao mandar `familia_id=<sub>` devolvia
 * zero linhas. Os parametros da busca, derivados dos filtros e da lista de familias.
 */
export function paramsDaBusca({ search, categoria, familiaFilter, statusFilter }, familias) {
  const params = {};
  if (search) params.search = search;
  if (categoria) params.categoria = categoria;
  if (familiaFilter) {
    const fam = familias.find((f) => String(f.id) === String(familiaFilter));
    if (fam && fam.parent_id !== null && fam.parent_id !== undefined) {
      params.familia_id = fam.parent_id;
      params.subfamilia_id = fam.id;
    } else {
      params.familia_id = familiaFilter;
    }
  }
  if (statusFilter) params.status = statusFilter;
  return params;
}

/** Busca, categoria, familia (arvore), status e "Limpar filtros". */
export function FiltrosMateriais({
  search, onSearch, categoria, onCategoria, categorias, familiaFilter, onFamilia, familias, statusFilter, onStatus, onLimpar,
}) {
  // Etapa 37 (RN-37.06): raízes por nome, cada uma seguida das suas subfamílias (por nome).
  const arvoreFamilias = useMemo(() => {
    const porNome = (a, b) => String(a.nome || '').localeCompare(String(b.nome || ''), 'pt-BR');
    const ehRaiz = (f) => f.parent_id === null || f.parent_id === undefined;
    return familias.filter(ehRaiz).sort(porNome).flatMap((raiz) => [
      raiz,
      ...familias.filter((f) => !ehRaiz(f) && String(f.parent_id) === String(raiz.id)).sort(porNome),
    ]);
  }, [familias]);

  return (
    <div className="almox-filters">
      <div className="almox-search-wrapper">
        <FiSearch className="almox-search-icon" />
        <input
          className="almox-search-input"
          placeholder="Buscar por nome, código ou fornecedor..."
          value={search}
          onChange={(e) => onSearch(e.target.value)}
        />
      </div>
      <select className="almox-select" value={categoria} onChange={(e) => onCategoria(e.target.value)}>
        <option value="">Todas categorias</option>
        {categorias.map((c) => <option key={c} value={c}>{c}</option>)}
      </select>
      <select className="almox-select" value={familiaFilter} onChange={(e) => onFamilia(e.target.value)}>
        <option value="">Todas famílias</option>
        {/* RN-37.06: a árvore — raiz por nome, cada uma seguida das subs dela ("— ⟨código⟩ ⟨nome⟩"). */}
        {arvoreFamilias.map((f) => (
          <option key={f.id} value={f.id}>
            {f.parent_id !== null && f.parent_id !== undefined ? `— ${f.codigo} ${f.nome}` : `${f.codigo} — ${f.nome}`}
          </option>
        ))}
      </select>
      <select className="almox-select" value={statusFilter} onChange={(e) => onStatus(e.target.value)}
        data-testid="filtro-situacao" aria-label="Status">
        <option value="">Todos status</option>
        <option value="ok">OK</option>
        <option value="critico">Crítico</option>
        <option value="zerado">Zerado</option>
        <option value="inativo">Inativos</option>
      </select>
      {(search || categoria || familiaFilter || statusFilter) && (
        <button type="button" className="btn-almox-secondary" onClick={onLimpar}>
          Limpar filtros
        </button>
      )}
    </div>
  );
}

/** A tabela: Foto, Código, Material, Família, Categoria, Quantidade, Localização, Status e Ações (`renderAcoes(m)`). */
export function TabelaMateriais({ materiais, loading, renderAcoes }) {
  return (
    <div className="almox-table-container">
      {loading ? (
        <SkeletonTable rows={8} columns={7} />
      ) : materiais.length === 0 ? (
        <div className="almox-empty">
          <FiPackage size={48} style={{ opacity: 0.3, display: 'block', margin: '0 auto 12px' }} />
          <p>Nenhum material encontrado</p>
        </div>
      ) : (
        <table className="almox-table">
          <thead>
            <tr>
              <th>Foto</th>
              <th>Código</th>
              <th>Material</th>
              <th>Família</th>
              <th>Categoria</th>
              <th>Quantidade</th>
              <th>Localização</th>
              <th>Status</th>
              <th>Ações</th>
            </tr>
          </thead>
          <tbody>
            {materiais.map((m) => {
              const status = getStatus(m);
              const pct = getPct(m);
              return (
                <tr key={m.id}>
                  <td>
                    {m.foto ? (
                      <img src={resolveMaterialPhotoUrl(m.foto)} alt={m.nome} className="almox-foto-thumb" onError={(e) => { e.currentTarget.style.display = 'none'; }} />
                    ) : (
                      <div className="almox-foto-placeholder"><FiImage /></div>
                    )}
                  </td>
                  <td>
                    <span style={{ fontFamily: 'monospace', fontSize: '0.8rem', color: 'var(--gmp-text-light)' }}>
                      {m.codigo}
                    </span>
                  </td>
                  <td>
                    <div style={{ fontWeight: 600, color: 'var(--gmp-text)' }}>
                      {m.nome}
                      {/* Etapa 8: esta lista mistura material nosso e de cliente de propósito
                          (classe C da auditoria da Task 1) — o selo é o que evita a confusão.
                          Fica ao lado do NOME, e não do código, porque é o nome que o
                          almoxarife lê ao procurar a chapa. */}
                      <SeloProprietario material={m} />
                    </div>
                    {m.fornecedor_principal && (
                      <div style={{ fontSize: '0.75rem', color: 'var(--gmp-text-light)' }}>{m.fornecedor_principal}</div>
                    )}
                  </td>
                  <td>
                    {m.familia_nome ? (
                      <span style={{ fontSize: '0.8rem', color: '#4facfe', fontWeight: 600 }}>{m.familia_nome}</span>
                    ) : (
                      <span style={{ fontSize: '0.8rem', color: 'var(--gmp-text-light)' }}>—</span>
                    )}
                  </td>
                  <td>
                    <span style={{ fontSize: '0.8rem', color: 'var(--gmp-text-light)' }}>{m.categoria}</span>
                  </td>
                  <td>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <div className="almox-stock-bar">
                        <div className={`almox-stock-fill ${status.cls}`} style={{ width: `${pct}%` }} />
                      </div>
                      <span style={{ fontWeight: 600 }}>{m.quantidade_atual}</span>
                      <span style={{ color: 'var(--gmp-text-light)', fontSize: '0.8rem' }}>{m.unidade}</span>
                    </div>
                    <div style={{ fontSize: '0.7rem', color: 'var(--gmp-text-light)' }}>
                      Mín: {m.quantidade_minima > 0 ? m.quantidade_minima : '—'} · Máx: {m.quantidade_maxima > 0 ? m.quantidade_maxima : '—'}
                    </div>
                    {/* Etapa 223 (RN-223.08, B1482): quanto do estoque esta em lote impedido — so com numero > 0 (o campo so vem
                        quando a tela pede: a do Compras nao pede, RN-223.09). */}
                    {temLoteImpedido(m) && (
                      <div className="almox-lista-lote-impedido" title={DICA_LOTE_IMPEDIDO}
                        style={{ fontSize: '0.7rem', color: 'var(--gmp-warning)', fontWeight: 600 }}>
                        <FiAlertTriangle size={10} /> {seloLoteImpedido(m)}
                      </div>
                    )}
                  </td>
                  <td>
                    <span style={{ fontSize: '0.8rem', color: 'var(--gmp-text-light)' }}>
                      {prefixarAlmoxarifado(m.localizacao, m.almoxarifado_codigo) || '—'}
                    </span>
                  </td>
                  <td>
                    <span className={`almox-badge almox-badge-${status.cls}`}>
                      {status.cls === 'critico' && <FiAlertTriangle size={10} />}
                      {status.label}
                    </span>
                  </td>
                  <td>
                    <div className="almox-actions">{renderAcoes(m)}</div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </div>
  );
}
