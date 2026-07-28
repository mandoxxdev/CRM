import { mascararTelefoneDigitando } from './telefone';

/**
 * Máscara de telefone para um nó contentEditable (o campo da CAPA da proposta, dentro do
 * iframe do preview). Um `<input>` mascarado é trivial — basta reescrever `value`; num nó
 * editável reescrever o texto TIRA O CURSOR do lugar, e o usuário fica digitando de trás
 * para frente. Por isso a posição é recalculada, e não simplesmente restaurada.
 *
 * O usuário relatou: "apago o campo todo, começo a escrever de novo, preencho um telefone e
 * mesmo assim não insere a máscara; só insere se eu salvar". Era isso: o `oninput` da capa
 * apenas registrava o texto digitado, e a máscara que aparecia depois vinha do SERVIDOR ao
 * regerar o HTML.
 */

/**
 * Índice, dentro de `texto`, logo depois do n-ésimo DÍGITO.
 * O cursor é ancorado em quantidade de dígitos, não em quantidade de caracteres: a máscara
 * insere e remove "(", ")", espaço e hífen a cada tecla, então contar caracteres faria o
 * cursor escorregar. Dígitos são estáveis — é o que o usuário realmente digitou.
 */
export function indiceAposNDigitos(texto, n) {
  if (n <= 0) return 0;
  let vistos = 0;
  for (let i = 0; i < texto.length; i++) {
    if (/\d/.test(texto[i])) {
      vistos += 1;
      if (vistos === n) return i + 1;
    }
  }
  return texto.length;
}

/** Quantos dígitos existem em `texto` antes da posição `pos`. */
export function digitosAntesDe(texto, pos) {
  return (texto.slice(0, pos).match(/\d/g) || []).length;
}

/**
 * Aplica a máscara no nó editável preservando o cursor.
 * Recebe as funções de cursor por parâmetro para poder ser testada sem o componente e para
 * reusar as que o arquivo do preview já tem (elas lidam com o iframe).
 * Retorna o texto final — mascarado ou o original, se nada mudou.
 */
export function aplicarMascaraNoNoEditavel(el, lerCursor, escreverCursor) {
  const original = el.textContent || '';
  const mascarado = mascararTelefoneDigitando(original);
  // Sem mudança: não mexe no DOM. Reescrever à toa destruiria a seleção do usuário e
  // dispararia mutação desnecessária no observer que reaplica a edição inline.
  if (mascarado === original) return original;

  const cursor = lerCursor(el);
  const digitos = digitosAntesDe(original, cursor);
  el.textContent = mascarado;
  escreverCursor(el, indiceAposNDigitos(mascarado, digitos));
  return mascarado;
}
