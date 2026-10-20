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
