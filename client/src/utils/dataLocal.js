/**
 * Etapa 161 (RN-161.05/06, C397) — o dia e a hora LOCAIS do navegador.
 *
 * `new Date().toISOString().slice(0, 10)` e o dia em UTC: no Brasil (UTC-3), das 21h a meia-noite ele ja e o de amanha — e era o
 * padrao do filtro da Presenca, dos Relatorios da producao e de cinco formularios da Fabrica (que o GRAVAM se a pessoa nao mexe).
 * Aqui tudo sai dos componentes locais do `Date` (getFullYear/getMonth/getDate/getHours/getMinutes).
 */
const dois = (n) => String(n).padStart(2, '0');

/** `AAAA-MM-DD` do dia local de `agora`. */
export function hojeLocalISO(agora = new Date()) {
  return `${agora.getFullYear()}-${dois(agora.getMonth() + 1)}-${dois(agora.getDate())}`;
}

/** `AAAA-MM-01` do mes local de `agora`. */
export function inicioDoMesLocalISO(agora = new Date()) {
  return `${agora.getFullYear()}-${dois(agora.getMonth() + 1)}-01`;
}

/** `AAAA-MM-DDTHH:MM` local — o valor de um `<input type="datetime-local">`. */
export function agoraLocalParaInput(agora = new Date()) {
  return `${hojeLocalISO(agora)}T${dois(agora.getHours())}:${dois(agora.getMinutes())}`;
}

/**
 * O instante que o banco guarda, como `Date`. O `CURRENT_TIMESTAMP` do SQLite grava `'AAAA-MM-DD HH:MM:SS'` em UTC e SEM fuso: o
 * `new Date()` do navegador le esse texto como hora LOCAL (3 h adiantada no Brasil). Sem `T` e sem `Z` -> lido como UTC; ISO com
 * `Z`/deslocamento -> como esta. Vazio, nao texto ou invalido -> `null`.
 */
export function lerInstanteDoBanco(valor) {
  if (valor === null || valor === undefined || valor === '') return null;
  if (valor instanceof Date) return Number.isNaN(valor.getTime()) ? null : valor;
  if (typeof valor !== 'string') return null;
  const s = valor.trim();
  const iso = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}(:\d{2}(\.\d+)?)?$/.test(s) ? `${s.replace(' ', 'T')}Z` : s;
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? null : d;
}

/**
 * Etapa 165 (RN-165.07, B1058) — a data que o banco guarda, como `Date`, para EXIBIR e ORDENAR. `new Date('AAAA-MM-DD')` e a meia-noite
 * UTC: no Brasil, 21h da VESPERA — era o que o sino, as Atividades, o calendario e os paineis do Comercial mostravam, o dia inteiro.
 *   - so data `'AAAA-MM-DD'` (o lembrete, a validade, a atividade de aprovacao) -> meia-noite LOCAL do dia gravado (data impossivel -> null);
 *   - `'AAAA-MM-DD HH:MM:SS'` do banco (UTC sem fuso) -> o instante UTC (`lerInstanteDoBanco`);
 *   - ISO com `T` (o calendario grava com `Z`) -> como esta;
 *   - vazio, nao texto, invalido -> `null`.
 * Com `soData` (coluna SO de data: o lembrete, a validade), o prefixo `AAAA-MM-DD` vale sozinho, mesmo com hora gravada pela API
 * (`'2026-11-30 01:00:00'` e o dia 30, como no servidor, que le o prefixo — Fase 5 r1 M1).
 */
export function lerDataDoBanco(valor, { soData = false } = {}) {
  if (typeof valor === 'string') {
    const m = (soData ? /^(\d{4})-(\d{2})-(\d{2})(?:[ T]|$)/ : /^(\d{4})-(\d{2})-(\d{2})$/).exec(valor.trim());
    if (m) {
      const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
      return d.getFullYear() === Number(m[1]) && d.getMonth() === Number(m[2]) - 1 && d.getDate() === Number(m[3]) ? d : null;
    }
  }
  return lerInstanteDoBanco(valor);
}

/** `DD/MM/AAAA` da data do banco no dia local (`lerDataDoBanco`); vazio ou ilegivel -> `vazio`. */
export function formatarDataDoBanco(valor, vazio = '-', opcoes = {}) {
  const d = lerDataDoBanco(valor, opcoes);
  return d ? `${dois(d.getDate())}/${dois(d.getMonth() + 1)}/${d.getFullYear()}` : vazio;
}
