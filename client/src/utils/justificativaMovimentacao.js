// Etapa 66 (RN-08): o livro e o extrato mostravam só `motivo` da movimentação; bloqueio,
// inventário e estorno guardam o porquê em `justificativa`, que ficava escondida. Devolve o texto
// da justificativa quando ela existe e difere do motivo (comparação sem espaços nas pontas), ou
// null — quando é igual (o payload de texto livre da tela grava os dois iguais) não repete.
export function justificativaDiferente(mov) {
  const just = String(mov?.justificativa ?? '').trim();
  if (!just) return null;
  const motivo = String(mov?.motivo ?? '').trim();
  return just === motivo ? null : just;
}
