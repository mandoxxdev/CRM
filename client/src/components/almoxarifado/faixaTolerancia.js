/**
 * Faixa de tolerância de uma característica de plano de inspeção — SÓ PARA EXIBIR.
 *
 * Este arquivo existe porque a fórmula estava DUPLICADA em duas telas (o modal de decisão em
 * `InspecoesAlmoxarifado.js` e a aba Histórico em `HistoricoInspecoes.js`), e a revisão
 * adversarial da Etapa 29 mediu as duas cópias DIVERGINDO: com `desvio_inferior: null` uma
 * mostrava `[10.000 ; 10.021]` (tratando null como 0, inventando faixa) e a outra `—`; com string
 * `'0,005'` uma dava `[NaN ; NaN]` e a outra `[10.005 ; 10.021]`. Nenhum dos dois casos é
 * alcançável hoje (as colunas do plano são `NOT NULL DEFAULT 0`), mas duas cópias de uma régua
 * acabam divergindo — que é exatamente o argumento pelo qual esta etapa se recusou a copiar a
 * régua de tolerância do servidor para o client.
 *
 * Duas regras que este módulo NÃO pode violar:
 *
 * 1. **Nenhuma comparação de tolerância aqui.** Conforme/não conforme é derivado pelo servidor,
 *    que tem o epsilon e os valores congelados no ato. Aqui só se SOMA para mostrar.
 * 2. **A soma é COM SINAL:** `inf = nominal + desvio_inferior`, `sup = nominal + desvio_superior`.
 *    Um plano unilateral de usinagem (`+0.005/+0.021` sobre 10) tem a faixa inteira ACIMA do
 *    nominal — `[10.005 ; 10.021]`. Ler o desvio inferior como "menos alguma coisa" daria
 *    `[9.995 ; 10.021]`, e o operador mediria contra uma faixa que não existe.
 *
 * A formatação usa o número de casas decimais do próprio plano (o maior entre nominal e os dois
 * desvios, lidos como foram escritos). Sem isso, `1.1 + 0.1` vira `1.2000000000000002` na tela —
 * o mesmo ponto flutuante que a Etapa 27 mediu na régua, agora na exibição.
 */

/** Casas decimais como o número FOI ESCRITO: `"10"` → 0, `"0.005"` → 3, `1.1` → 1. */
export const casasDecimais = (v) => {
  if (v === null || v === undefined) return 0;
  const s = String(v).replace(',', '.');
  const i = s.indexOf('.');
  return i < 0 ? 0 : s.length - i - 1;
};

const paraNumero = (v) => (v === null || v === undefined ? NaN : Number(String(v).replace(',', '.')));

/** `[nominal + desvio_inferior ; nominal + desvio_superior]`, ou `—` se algum número não vier. */
export const formatarFaixa = (nominal, desvioInferior, desvioSuperior) => {
  const casas = Math.max(
    casasDecimais(nominal), casasDecimais(desvioInferior), casasDecimais(desvioSuperior));
  const n = paraNumero(nominal);
  const inf = n + paraNumero(desvioInferior);
  const sup = n + paraNumero(desvioSuperior);
  if (!Number.isFinite(inf) || !Number.isFinite(sup)) return '—';
  return `[${inf.toFixed(casas)} ; ${sup.toFixed(casas)}]`;
};
