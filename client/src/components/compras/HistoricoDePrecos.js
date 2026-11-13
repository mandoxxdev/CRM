/**
 * Etapa 214 (RN-214.03) — o quadro "Histórico de preços" na seção Fornecedores deste material (Compras → Materiais → editar).
 * Lê `GET /compras/materiais/cadastro/:id/historico-precos` (preço cotado e comprado por fornecedor, mais recente primeiro).
 * Só leitura; o filtro por fornecedor é local.
 */
import React, { useEffect, useMemo, useState } from 'react';
import api from '../../services/api';

export const LITERAL_SEM_HISTORICO = 'Nenhum preço cotado ou comprado para este material ainda.';
const moeda = (v) => Number(v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const dataBR = (iso) => {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(iso || ''));
  return m ? `${m[3]}/${m[2]}/${m[1]}` : '-';
};
const quantidade = (q) => Number(q || 0).toLocaleString('pt-BR', { maximumFractionDigits: 3 });

const HistoricoDePrecos = ({ materialId }) => {
  const [linhas, setLinhas] = useState(null);
  const [falhou, setFalhou] = useState(false);
  const [fornecedor, setFornecedor] = useState('');

  useEffect(() => {
    let vivo = true;
    setLinhas(null); setFalhou(false);
    api.get(`/compras/materiais/cadastro/${materialId}/historico-precos`)
      .then((r) => { if (vivo) setLinhas(Array.isArray(r.data) ? r.data : []); })
      .catch(() => { if (vivo) { setFalhou(true); setLinhas([]); } });
    return () => { vivo = false; };
  }, [materialId]);

  const opcoes = useMemo(() => {
    const vistos = new Map();
    for (const l of linhas || []) if (!vistos.has(l.fornecedor_id)) vistos.set(l.fornecedor_id, l.fornecedor_nome || '-');
    return [...vistos.entries()].sort((a, b) => String(a[1]).localeCompare(String(b[1]), 'pt-BR'));
  }, [linhas]);
  const visiveis = (linhas || []).filter((l) => !fornecedor || String(l.fornecedor_id) === fornecedor);

  return (
    <div data-testid="historico-de-precos" style={{ marginTop: 16 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 8 }}>
        <strong>Histórico de preços</strong>
        {opcoes.length > 1 && (
          <select aria-label="Filtrar por fornecedor" data-testid="historico-filtro-fornecedor" className="almox-input"
            style={{ maxWidth: 260 }} value={fornecedor} onChange={(e) => setFornecedor(e.target.value)}>
            <option value="">Todos os fornecedores</option>
            {opcoes.map(([id, nome]) => <option key={id} value={String(id)}>{nome}</option>)}
          </select>
        )}
      </div>
      {linhas === null ? (
        <div>Carregando...</div>
      ) : falhou ? (
        <div>Não foi possível carregar o histórico de preços.</div>
      ) : visiveis.length === 0 ? (
        <div data-testid="historico-vazio">{LITERAL_SEM_HISTORICO}</div>
      ) : (
        <table className="data-table">
          <thead>
            <tr><th>Data</th><th>Fornecedor</th><th>Origem</th><th>Quantidade</th><th>Preço unitário</th></tr>
          </thead>
          <tbody>
            {visiveis.map((l) => (
              <tr key={`${l.origem}-${l.documento_id}-${l.linha_id}`} data-testid={`historico-${l.origem}-${l.documento_id}`}>
                <td>{dataBR(l.data)}</td>
                <td>{l.fornecedor_nome || '-'}</td>
                <td>{l.origem === 'pedido' ? 'Pedido' : 'Cotação'} {l.numero || ''}{l.status === 'rejeitado' ? ' (rejeitada)' : ''}</td>
                <td>{quantidade(l.quantidade)} {l.unidade || ''}</td>
                <td>{moeda(l.valor_unitario)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
};

export default HistoricoDePrecos;
