# Almoxarifado — Etapa 116: o formulário diz o que leu, e o estorno não devolve saldo sem as séries (design)

> Origem: "Próxima tarefa detalhada — Etapa 116" do plano da 115 (**C233**, **C232**). Fora: C224, o resto da C225, C228,
> C219, C230 (dependem do P.O.).

## Fase 0 — medido no código (2026-10-15, main `d13a111c`)

**C233.**
- `PUT /api/almoxarifado/materiais/:id` (`server/routes/almoxarifado.js:632`) lê `current` no começo e põe as duas colunas
  de controle no `WHERE` com o valor de `current` (B750, `:801`). A conferência só pega a mudança que cai entre essa leitura
  e o `UPDATE` do próprio salvar.
- O formulário (`client/src/components/almoxarifado/MaterialAlmoxarifadoForm.js:362-363` carrega, `:470-495` monta o
  payload com `...form`) manda sempre `controle_lote`/`controle_serie` com o valor do state — o de quando abriu, se o usuário
  não mexeu. Não manda nada que diga o que ele leu.
- `MaterialUpdateSchema` (`schemas.js:317`) é um `z.object` — chave não declarada é **descartada em silêncio** (a armadilha
  da `reserva_id`/`lote_id`/`codigo_auto`). `controles_lidos` tem de ser declarado.
- Outro chamador do PUT no front: `MateriaisAlmoxarifado.js:142` (`{ ativo: 1 }`, o Reativar) — não manda controle; fica
  como está.

**C232.**
- `cancelarMovimentacao` (`stockService.js:2413`): a guarda das séries de Saída (`:2620`) só roda com
  `material.controle_serie` ligado; no ramo de saída (`:2880`), desde `385d938f`, `reverterSaida` roda sob a trava do material
  **só se** o controle relido ali estiver ligado — senão devolve `[]` e o estorno segue: físico de volta, séries *Entregue*.
- O ramo de saída roda **depois** do claim e do crédito; o `catch` do estorno compensa claim, físico, linha e séries (fix
  round 1 da 6b). Uma recusa lançada ali dentro é desfeita pelo `catch`.
- O teste `controleSobATravaFase5.api.test.js` `[R2-F5]` prende hoje o estorno **200** com o desligar caído no meio (o estado
  da C232 pela corrida) — muda para a recusa nova (é a prova da corrida desta etapa).
- O vínculo série → saída é só `series_almoxarifado.movimentacao_saida_id`; a reentrada pela Entrada v2 o zera. Não há
  histórico de série por movimento.

## Decisões (letra B)

- **B752 — C233:** o formulário manda `controles_lidos: { controle_lote, controle_serie }` (os valores **de quando
  carregou**). O PUT recusa **409** quando, para algum dos dois controles, o lido difere do gravado **e** o salvar gravaria
  nesse controle um valor diferente do gravado (desfaria a mudança de outra pessoa). Lido diferente mas o salvar grava o mesmo
  que está gravado (o usuário marcou igual, ou a chave veio omitida) → segue. Sem `controles_lidos` → o comportamento de hoje.
  **Descartado:** (a) pôr os lidos direto no `WHERE` (recusaria também quem marcou igual ao gravado — recusa sem dano a
  evitar); (b) `updated_at` como versão (o motor regrava `updated_at` a cada movimentação — o formulário aberto recusaria por
  qualquer Entrada); (c) reaproveitar a E4 da 110 (*"mudou enquanto era salvo"* — diz o contrário do que aconteceu: mudou
  **antes**, enquanto o formulário estava aberto).
- **B753 — onde a recusa da C233 fica na ordem:** logo depois do 404, antes da troca de dono e de todas as guardas — cada
  recusa seguinte é calculada sobre um controle que o usuário não viu (a E1 da 115 que "engana" é exatamente isto).
  **Descartado:** depois das guardas de perfil (o usuário receberia primeiro uma recusa sobre um desligar que ele não fez).
- **B754 — C232:** estornar uma Saída que baixou séries (vínculo `movimentacao_saida_id`, status *Entregue*/*Sucateada*)
  de um material com a série **desligada** → **400**, nada tocado; o caminho é religar e estornar de novo. A mesma recusa
  sob a trava, se o desligar cair entre a guarda e a reversão (o `catch` desfaz claim, físico e linha). A compensação
  interna não passa pela recusa. **Descartado:** devolver as séries mesmo desligada (recria série *Em estoque* num material
  sem controle — a C225); estornar só o físico com aviso (é o estado da C232).
- **B755 — a devolução fica como está:** a devolução de uma Saída com séries depois de desligar continua devolvendo só o
  físico (a tela não oferece as séries de material sem controle). **Declarado (D (116))**; a regra da devolução é outra porta
  (`returnService`) e pede decisão própria.

- **B756 — (Fase 2, R2) a Saída que já teve devolução não é estornável.** Medido por sonda: em qualquer material, Entrada 5 →
  Saída 2 → devolução 2 → estorno → físico **7** (o estorno credita a saída inteira de novo; a devolução já recusava a saída
  estornada, o lado inverso faltava). Com a série desligada, a E2 levava exatamente a isto (religar → estornar). Recusa (400 E3),
  com o resto a devolver quando a devolução foi parcial. **Descartado:** estornar só o não devolvido (o livro tem uma
  movimentação por saída; partir o estorno é motor novo) e descontar a devolução no crédito (o estorno deixaria de ser o
  inverso exato da saída no livro).

## Fora (declarado)

- Saída cujas séries **já reentraram** (Entrada v2 zera o vínculo) e depois o Administrador desligou a série com elas em
  estoque: a guarda nova não vê séries vinculadas e o estorno devolve o físico em dobro, sem série — o caso que a guarda de
  hoje (`:2620`) só pega com o controle ligado. Só o Administrador desliga com séries presentes (115), então exige um gesto
  dele. **C234**.
- O formulário não oferece "recarregar" — a mensagem diz para recarregar (F5 ou voltar e abrir de novo).
