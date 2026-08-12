import React from 'react';
import './Almoxarifado.css';

/**
 * Selo de propriedade — Etapa 8, Task 9.
 *
 * A Etapa 8 unificou material de cliente e material próprio na MESMA tabela e nas MESMAS telas.
 * Três leituras foram classificadas como "misturar é o correto" na auditoria da Task 1 (catálogo
 * de materiais, livro de movimentações, extrato do item): a chapa do cliente ocupa prateleira de
 * verdade e é movimentada de verdade, então escondê-la faria a tela mentir. A contrapartida de
 * não filtrar é dizer de quem é — sem isso a unificação cria exatamente a confusão que a spec 13
 * mandava evitar.
 *
 * Está num componente só, e não copiado nas três telas, porque o nome da classe CSS precisa de um
 * único lugar de verdade: já foi entregue nesta base um badge sem cor nenhuma porque o template
 * `almox-badge-${cls}` não achava a classe e o navegador não reclama.
 */

/** Rótulo quando o servidor manda o dono mas não o nome dele (ver `nomeDoDono`). */
export const DONO_SEM_NOME = 'Material de cliente';

/**
 * Devolve o nome a exibir, ou `null` se o material é nosso.
 *
 * `proprietario_cliente_id` é NÚMERO ou `null` — nunca booleano, nunca `0` significando "nosso"
 * (Global Constraint da etapa: só `NULL` é nosso). Por isso a checagem é explícita e não um
 * `&&` solto no JSX, que renderizaria o próprio `0` na tela.
 *
 * O fallback para `DONO_SEM_NOME` existe porque `proprietario_cliente_id` vem de `SELECT m.*` em
 * várias rotas, enquanto `proprietario_cliente_nome` depende de um `LEFT JOIN clientes` que nem
 * toda rota faz. Um selo vazio seria a mesma falha muda do badge sem cor: presente no DOM,
 * invisível para quem usa.
 */
export function nomeDoDono(material) {
  if (!material) return null;
  const id = material.proprietario_cliente_id;
  if (id === null || id === undefined || id === '') return null;
  return material.proprietario_cliente_nome || DONO_SEM_NOME;
}

/** O title carrega a CONSEQUÊNCIA, não só o nome: quem vê o selo pela primeira vez precisa saber
 *  o que ele muda na operação. */
export function tituloDoSelo(nome) {
  const dono = nome && nome !== DONO_SEM_NOME ? `do cliente ${nome}` : 'de propriedade de um cliente';
  return `Material ${dono} — não entra no estoque próprio e só sai com OS ou projeto desse cliente`;
}

/**
 * Rótulo de material para `<option>`, que não aceita markup: o dono entra no texto.
 * Usado no seletor de material do formulário de movimentações.
 */
export function rotuloMaterialComDono(material, textoBase) {
  const nome = nomeDoDono(material);
  return nome ? `${textoBase} [${nome === DONO_SEM_NOME ? nome : `cliente: ${nome}`}]` : textoBase;
}

const SeloProprietario = ({ material, style }) => {
  const nome = nomeDoDono(material);
  if (!nome) return null;
  return (
    <span
      className="almox-badge almox-badge-cliente"
      title={tituloDoSelo(nome)}
      style={{ marginLeft: 6, ...style }}
    >
      {nome}
    </span>
  );
};

export default SeloProprietario;
