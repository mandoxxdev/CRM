import React from 'react';
import { useSearchParams } from 'react-router-dom';
import FamiliasProdutos from './FamiliasProdutos';
import Produtos from './Produtos';

/**
 * Rota /comercial/produtos:
 * - Sem ?familia= → mostra grid de famílias (FamiliasProdutos)
 * - Com ?familia=Nome → mostra lista de produtos filtrada (Produtos)
 */
const ProdutosPage = () => {
  const [searchParams] = useSearchParams();
  const familiaFromUrl = searchParams.get('familia');

  if (familiaFromUrl) {
    return <Produtos familiaFromUrl={familiaFromUrl} />;
  }
  return <FamiliasProdutos />;
};

export default ProdutosPage;
