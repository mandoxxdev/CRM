# Almoxarifado — Etapa 120: o lançamento que já valeu e a série que já voltou (design)

> Origem: "Próxima tarefa detalhada — Etapa 120" do plano da 119 (**C250** e **C234**). Worktree `CRM-wt-e120`, branch
> `etapa-e120` (a partir da main `68557ed4`). Numeração conferida com `grep -oE` em `docs/almoxarifado-novidades-por-etapa.md`
> (2026-10-16): última B **B777**, último C **C250**, última A **A67** → esta etapa **B778+**, **C251+**, **A68+**.

## Fase 0 — o que foi medido (sonda `server/tests/sonda/e120fase0.js`, não versionada)

Gancho: o `INSERT INTO auditoria_log_almoxarifado` com `entidade = 'movimentacao'` e a ação do tipo lançado forçado a falhar
uma vez (a auditoria que o motor grava depois do livro, `stockService.registrarMovimentacaoSemTrava`).

| # | Porta | Hoje (medido) | O que o chamador fez com a exceção |
|---|---|---|---|
| 1 | `POST /movimentacoes/v2` Entrada 5 | **500**, a linha no livro, físico 5; repetida → 201, **físico 10**, duas Entradas | nada — devolve o erro |
| 2 | `PUT /requisicoes/:id/entregar` (4 de 10) | **500** *"⟨material⟩: aud forcada"*, a Saída no livro, físico 6, `quantidade_entregue` **0**, requisição *Em separação*; repetida → 200 *Entregue*, **físico 2**, **duas Saídas de 4** | aborta antes de gravar o entregue — a segunda entrega baixa de novo |
| 3 | `POST /devolucoes` ESTOQUE (2) | **500**, a entrada no livro, físico 4, a devolução **mantida** e marcada **`ESTADO_PARCIAL`** | trata como perna gravada no meio de uma falha — mas a devolução estava completa |
| 4 | `POST /devolucoes` QUARENTENA, auditoria do BLOQUEIO | **500**, as duas pernas no livro, físico 4, bloqueado 2 | idem (`ESTADO_PARCIAL`) |
| 5 | `POST /sobras/gerar-retalho`, auditoria da ENTRADA_RETALHO | **500**; o chamador **estornou a baixa** do original (100 de novo) e a **entrada do retalho ficou** no livro (retalho físico 1) **sem a sobra** cadastrada | compensa o que acha que fez — e deixa órfão o que o motor gravou |
| 6 | C234: Entrada 2 (V1, V2) → Saída 2 → Entrada avulsa V1, V2 → desliga a série → estorno da saída | **200**, **físico 4** (eram 2 peças), V1 e V2 *Em estoque* | — |

**Leitura dos 30 chamadores** (`grep -rn "registrarMovimentacao\w*(" server/services server/routes` → 30 chamadas fora do motor,
não 25 como a 119 contou — a 119 contou só `server/services`): **nenhum** usa a exceção para desfazer algo que o motor gravou —
nem poderia, porque com a exceção ele não recebe o `id` do lançamento. Todos usam a exceção para concluir "o motor não fez nada"
e então: (a) desfazem o próprio passo anterior — o retalho estorna a baixa (`scrapService`); a remessa a terceiro desmarca o
`enviado_em`/retorno do item (`thirdPartyService` 268, 481); a transformação no terceiro compensa o consumo (947/970); a NC
desfaz a liberação/devolução ao fornecedor (`nonConformityService` 1052, 1647); a inspeção devolve o claim do item
(`inspectionService` 312); o recebimento zera `entrada_estoque_em` (`receiptService` 1548 — a nota processaria de novo); a
reserva manual devolve o `quantidade_reservada` (`stockService` 3620); o inventário reabre a conferência (`routes/almoxarifado.js`
1876); o sucateamento compensa a assinatura (`scrapDisposalService` 476, 671); o Saldo Inicial do cadastro **apaga o material e
as linhas de saldo** (`materialService` 389 — o livro ficaria com uma Entrada de material inexistente); (b) param antes de gravar o
próprio estado (a entrega de requisição, 1648 e 1892); ou (c) registram estado parcial (a devolução, `returnService`). As rotas
v2, transferência, devolução ao cliente e a v1 (1243) só devolvem o erro. Com o lançamento **gravado**, as três reações deixam o banco inconsistente — os casos 2, 3
e 5 acima são a prova executada. **Conclusão: a C250 deve mudar** — a exceção depois do livro não protege nenhum chamador e
prejudica todos os medidos.

Ninguém lê a auditoria de `entidade = 'movimentacao'` como regra (`grep -rn "'movimentacao'" server --include=*.js` fora de
testes: só os dois `INSERT` do motor e o da regularização) — ela é só trilha.

## Decisões

- **B778 — a auditoria do lançamento passa a não-fatal** (o log registra `[almoxarifado] auditoria do lancamento falhou
  (movimentacao ⟨id⟩): ⟨msg⟩`), como a B775 fez no estorno. **Descartados:** (a) manter fatal — medido acima: não protege
  ninguém e produz baixa em dobro na entrega; (b) desfazer o lançamento quando a auditoria falha — apagar a linha do livro e
  devolver o saldo depois de o lançamento estar valendo é pior (a trilha some junto, e o desfazer pode falhar no meio, a C246);
  (c) gravar a auditoria **antes** do livro — ela precisa do `id` do livro, e uma auditoria de um lançamento que depois falha
  seria um registro falso. **Reversível**: um `try` em volta de uma chamada.
- **B779 — a série que volta por uma Entrada guarda a saída de onde saiu** (coluna nova `saida_anterior_id` na tabela
  `series_entrada_anterior_almoxarifado` da 119, gravada na mesma linha). O estorno de uma Saída com a série desligada, que não
  acha série vinculada, olha essa coluna: se alguma série dessa saída voltou por uma Entrada, recusa com a literal de hoje
  (*"estorno de saida recusado: series desta saida ja reentraram no estoque — a devolucao ja repos o material"*). **Descartados:**
  (a) recusar o estorno de qualquer Saída sem série vinculada de material que já teve série — bloquearia a Saída legítima feita
  com a série desligada (o teste `[RN-07] serie desligada, Saida SEM serie vinculada` da 116 é exatamente esse caso); (b) não
  apagar o vínculo `movimentacao_saida_id` na reativação — o vínculo é lido como "a série está fora por esta saída" em seis
  lugares (estorno, devolução, guarda da 6b), mudar o sentido dele é um redesenho; (c) ler a trilha `REATIVACAO` da auditoria
  de série — ela não guarda a saída. **Reversível**: coluna aditiva, lida em um lugar.
- **B780 (Fase 2, Critical) — a exclusão da requisição usa a mesma coluna.** A revisão do plano achou a porta que dobra de
  verdade: excluir a requisição cuja entrega teve as séries de volta por uma Entrada creditava a quantidade sem série (físico 4
  com 2 presentes), com a série ligada (anterior à etapa — a exclusão tratava "nenhuma série vinculada" como dado legado) e
  desligada. Recusa com uma literal nova que manda **encerrar** em vez de excluir (**C251**). **Descartado:** creditar só o que
  não voltou — a regra de "o que falta devolver" da exclusão é por saída inteira desde a Etapa 58 (tudo ou nada); mudar isso é
  redesenho. **Reversível**.
- **Legado (A68):** a série que voltou antes do deploy não tem a coluna — a recusa não a vê. A **A68** lista as saídas
  candidatas (não estornadas, de material que tem série, sem série vinculada e sem a linha nova) para conferir antes de estornar.

## Fora (depende do P.O. ou de outra etapa)

B755, B761/C239, C224, o resto da C225, C228, C219, C230, o reparo da C246. As **outras** auditorias fatais depois do fato
(a do evento do retalho, a da regularização, as dos serviços — 59 chamadas sem `try`) ficam fora: a 120 só muda a do motor;
ficam declaradas como **C252** (ver o plano).
