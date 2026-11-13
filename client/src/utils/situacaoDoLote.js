// Etapa 224 (C528; RN-224.08, B1486): QUAL lote esta impedido, na linha de saldo. O servidor decide (a regua da aprovacao, o "hoje" de
// Brasilia: `lote_esta_impedido`, `lote_vencido_sem_liberacao`); aqui so as palavras. A data sai do texto (sem `new Date`, sem fuso); a
// validade fora de AAAA-MM-DD (lixo antigo que a regua da por vencida, Fase 2 M2) diz "Validade a corrigir". So com `=== true`.
// Etapa 226 (B1496): extraida do ExtratoMaterialModal para o "Sai de" da separacao e da entrega usar as mesmas palavras.
export const DICA_LOTE_IMPEDIDO = 'Este lote não sai para uso até ser liberado na tela Lotes e Séries.';
export const situacaoDoLote = (s) => {
  if (!s || s.lote_esta_impedido !== true) return null;
  const partes = [];
  if (s.lote_status === 'BLOQUEADO') partes.push('Bloqueado');
  if (s.lote_status === 'REPROVADO') partes.push('Reprovado');
  if (s.lote_vencido_sem_liberacao === true) {
    const d = String(s.lote_validade || '').slice(0, 10);
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(d);
    partes.push(m ? `Vencido em ${m[3]}/${m[2]}/${m[1]}` : `Validade a corrigir: ${String(s.lote_validade || '').trim() || '—'}`);
  }
  return partes.length ? partes.join(' · ') : 'Impedido';
};
