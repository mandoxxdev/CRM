// Etapa 227 (B1499, RN-227.05): as palavras da situacao do lote no servidor — COPIA de `client/src/utils/situacaoDoLote.js` (224, B1486;
// 226, B1496), para o relatorio *Saldo por lote* e a planilha exportada (que nao rodam o cliente). O teste
// `relatorioSaldoPorLoteSituacao.api.test.js` (RN-227.05) le o arquivo do cliente e roda as duas sobre a mesma tabela: mudar uma sem a
// outra derruba o teste. O servidor decide (a regua da aprovacao, o "hoje" de Brasilia: `lote_esta_impedido`, `lote_vencido_sem_liberacao`);
// aqui so as palavras. A data sai do texto (sem `new Date`, sem fuso). So com `=== true`.
const situacaoDoLote = (s) => {
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

module.exports = { situacaoDoLote };
