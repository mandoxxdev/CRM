# 20 — Abastecimento sem o campo de foto

> **Status:** 🟢 **entregue na Etapa 8** (2026-10-28), na `main`, `a8a8d885` (esquema) a `09a4a661` (integração), mais o fechamento. Pedido do André: "No abastecimento pode retirar o campo de foto".
> **Plano:** [`docs/superpowers/plans/2026-10-28-frotas-etapa8-admin-destinos-condutor.md`](../../../docs/superpowers/plans/2026-10-28-frotas-etapa8-admin-destinos-condutor.md)
> (RN-F8.12–14) · **Design:** seção B do design da Etapa 8 · **Manual:** `docs/frotas/manual-do-sistema.md` (2.8, 2.9)

## O que é

A Etapa 5 (feature 17) pôs **Tirar foto** também no **Abastecimento** do portal ("Foto do cupom", até 3). O André pediu para tirar: o
cupom não vai pelo sistema. O formulário de Abastecimento perde o grupo de fotos e o **+ Foto** some do abastecimento em Meus
registros. Saída, Retorno e Inspeção **continuam** com foto (avaria).

## O que não muda (de propósito — B77)

- O **servidor** continua aceitando foto de abastecimento (`POST /anexos` com `entidade 'abastecimento'`) e a lista do gestor mantém a
  coluna **Fotos** em Abastecimentos: fotos antigas (não há nenhuma em produção) continuam visíveis e removíveis. Só não entra foto nova
  pelo portal. Voltar atrás é restaurar um bloco da tela.

## Regras de negócio — checklist

| RN | Regra | Estado | Commit |
|---|---|---|---|
| RN-F8.12 | Formulário Abastecimento sem `Foto do cupom`; salvar não chama `POST /anexos` | [x] | `ef71a1b6` |
| RN-F8.13 | Meus registros: abastecimento sem `+ Foto`; miniaturas antigas (se houver) e `Remover foto` ficam | [x] | `ef71a1b6` |
| RN-F8.14 | Saída/Retorno/Inspeção, servidor e coluna Fotos do gestor não mudam | [x] | `ef71a1b6` |

## Spec que muda de sentido

- Feature **17**, RN-F5.09 e RN-F5.10 falavam "no Abastecimento" — valem só para o **registro** desde esta etapa (nota lá). Os
  **cinco** cenários de `FrotasFotos.test.js` que passavam pelo abastecimento (o plano dizia "dois" — a Fase 2 contou cinco) viraram
  negativos ou só do registro; o negativo que prova a RN-F8.12 é "não há Tirar foto" (a sabotagem que devolve o campo o derruba).
