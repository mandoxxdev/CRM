/**
 * Etapa 213 (RN-213.04) — o código que o fornecedor escolhido usa para cada material, na tela da cotação e do pedido.
 *
 * Lê o catálogo do fornecedor (`GET /compras/fornecedores/:id/itens`, porta do módulo Compras — o comprador comum alcança), em
 * que a linha vinculada a um material da GMP traz `material_id` (Etapa 212). Devolve `{ [material_id]: codigo }`, ou `null`
 * enquanto não leu (sem fornecedor, carregando ou falhou): aí a tela mostra o código gravado na linha, se houver.
 * Quem grava o código no salvar é o servidor; isto é só a exibição antes de salvar e ao trocar o fornecedor.
 */
import React, { useEffect, useState } from 'react';
import api from '../../services/api';

export function useCodigosDoFornecedor(fornecedorId) {
  const [codigos, setCodigos] = useState(null);
  useEffect(() => {
    setCodigos(null);
    if (!fornecedorId) return undefined;
    let vivo = true;
    Promise.resolve()
      .then(() => api.get(`/compras/fornecedores/${fornecedorId}/itens`))
      .then((r) => {
        if (!vivo) return;
        const linhas = r && Array.isArray(r.data) ? r.data : null;
        if (!linhas) return;
        const mapa = {};
        for (const l of linhas) {
          const codigo = l && l.codigo != null ? String(l.codigo).trim() : '';
          if (l && l.material_id != null && codigo) mapa[l.material_id] = codigo;
        }
        setCodigos(mapa);
      })
      .catch(() => {});
    return () => { vivo = false; };
  }, [fornecedorId]);
  return codigos;
}

/** O código do fornecedor da linha: o do catálogo lido; sem leitura, o gravado na linha. */
export function codigoDoFornecedor(codigos, item) {
  if (codigos) return codigos[item.material_id] || '';
  return item.codigo_fornecedor ? String(item.codigo_fornecedor) : '';
}

/** A célula "Código": o código GMP (o principal) e, abaixo, o do fornecedor quando há. */
export function CelulaCodigo({ item, codigos }) {
  const doFornecedor = codigoDoFornecedor(codigos, item);
  return (
    <td>
      {item.codigo || '-'}
      {doFornecedor && (
        <div className="codigo-do-fornecedor" data-testid={`codigo-fornecedor-${item.material_id}`}
          style={{ fontSize: '0.8em', color: '#666', whiteSpace: 'nowrap' }}>
          Forn.: {doFornecedor}
        </div>
      )}
    </td>
  );
}
