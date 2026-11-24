# Etapa 261 — O histórico diz de quais prateleiras a peça saiu, e o estorno do Ajuste de prateleira respeita a contagem mais recente

> Itens **4** e **5** da estimativa da semana (`docs/estimativas/2026-11/estimativa_2026-11-23_almoxarifado-semana.md`, commitada em
> `d7e6afb9` — a estimativa da semana inteira, 1h + 1h15; não refeita). A "próxima tarefa detalhada" do plano da 260.
> **Fatia visível:** o item 4 (a linha da Saída e do Ajuste no histórico de Movimentações ganha *"Saiu de: A-01 3 · B-02 3"*). O item 5 é
> motor puro (a recusa nova aparece ao clicar em **Estornar**).

## Fase 0 — medido

### Item 5 (sonda executada sobre `74dd633c`, 23/11, `scratchpad/sab-261-sonda.js`, pela rota)

| # | Cenário (padrão *A*, material sem negativo) | Hoje | Certo |
|---|---|---|---|
| 1 | *A* 5; Ajuste de *A* para 3; Ajuste do total para 7; estorno do 1º | 200, total **9**, *A* 9 | recusa (a contagem diz 7) |
| 2 | *A* 5; Ajuste de *A* para 3; Ajuste de *A* para 6; estorno do 1º | 200, total **8**, *A* 8 | recusa (a contagem de *A* diz 6) |
| 3 | *A* 5, *B* 4; Ajuste de *A* para 3; Ajuste de *B* para 2; estorno do 1º | 200, 7 (*A* 5, *B* 2) | o mesmo (outra prateleira) |
| 4 | *A* 5; Ajuste do total para 7 **antes**; Ajuste de *A* para 3; estorno | 200, 7 (*A* 7) | o mesmo (a contagem é anterior) |

- **Causa:** `stockService.cancelarMovimentacao`, ramo `AJUSTE` **com** `localizacao_destino_id` (~3809): desfaz a diferença na linha
  (*loc*, lote) e recalcula o total pela soma, sem olhar se uma contagem mais nova já disse quanto há. O ramo **sem** localização tem a guarda
  desde a 258 (RN-258.07, B1606, ~3877).
- O Ajuste com localização define **a linha** (*loc*, `lote_id`) (`registrarMovimentacao` ~2430); o `AJUSTE_INVENTARIO` é sempre do total
  (`routes/almoxarifado.js:2108`, sem localização) e não se estorna.

### Item 4 (leitura)

- `ajuste_linhas_drenadas_almoxarifado` (`schema.js:1610`, `movimentacao_id, saldo_id, quantidade`, índice por movimento) recebe: na **Saída**
  (todo `TIPOS_SAIDA`), as linhas que a baixa tirou — exatamente o que saiu (Etapa 257); no **AJUSTE sem localização**, só as **outras**
  linhas que ele drenou — a parte que saiu da linha padrão **não** está lá (Etapa 256, `drenadasDoAjuste`). Gravado depois do livro, não-fatal.
- Só o estorno (`stockService` ~3744/3936) e a exclusão (`requisitionService` ~3387) leem a tabela.
- `GET /api/almoxarifado/movimentacoes` (`routes/almoxarifado.js:1389`) devolve `m.*` + nomes; a tabela de `MovimentacoesAlmoxarifado.js`
  (~796) **não tem coluna de endereço nenhuma** — nem a origem escolhida à mão aparece.

## Decisões

- **B1614 (item 5)** — o estorno do Ajuste **de prateleira** é recusado quando, depois dele, há, vivo, do mesmo material: um `AJUSTE` **sem**
  localização (do total), um `AJUSTE_INVENTARIO`, ou um `AJUSTE` **da mesma linha** (mesma prateleira **e** mesmo lote). O de outra prateleira,
  ou de outro lote na mesma prateleira, **não** trava (ele contou só a linha dele; o cenário 3 dá o número certo). Mensagens: as literais da
  RN-258.07. **Descartado:** travar com qualquer ajuste posterior do material (barraria o cenário 3, que está certo); travar só com o do total
  (deixaria o cenário 2). **Reversível:** é a consulta.
- **B1615 (item 4)** — *"Saiu de"* aparece sempre que a movimentação tem o registro (mesmo uma prateleira só — a tabela não mostra endereço
  nenhum hoje); no Ajuste do total, além das prateleiras drenadas, a parte que saiu da posição padrão (o que o Ajuste baixou menos o drenado)
  aparece como *"posição padrão"*, sem código (o endereço padrão da época não é gravado; o de hoje pode ser outro). **Descartado:** só com mais
  de uma prateleira (esconderia a prateleira da Saída automática, que é o caso da D (252) 1); gravar o endereço no livro (B1581: mudaria o
  estorno). **Reversível:** é a condição na tela e a soma na rota.

## Regras de negócio

- **RN-261.01** O estorno de um `AJUSTE` com localização é recusado (400), antes de qualquer efeito (o claim volta pelo catch), quando existe
  movimento **vivo** (`cancelado = 0`), do mesmo material, de **id maior**, que seja: `AJUSTE_INVENTARIO` → *"Não é possível estornar: há uma
  conferência de inventário deste material feita depois deste ajuste (movimentação #⟨id⟩) — a contagem mais recente vale. Faça um novo
  ajuste."*; ou `AJUSTE` sem localização, ou `AJUSTE` com a mesma `localizacao_destino_id` e o mesmo `lote_id` (`IS`) → *"Não é possível
  estornar: há um ajuste deste material feito depois deste (movimentação #⟨id⟩) — a contagem mais recente vale. Estorne primeiro o ajuste mais
  recente ou faça um novo ajuste."* O id citado é o **maior** que casa. Cenários 1 e 2 → recusa, nada muda; estornado o mais recente, o
  primeiro passa (cenário 1: o estorno do Ajuste do total volta para 3, e o do 1º para 5).
- **RN-261.02** Não trava: o Ajuste de outra prateleira, o de outro lote na mesma prateleira, a contagem **anterior** (cenário 4), a
  contagem já estornada, e a Saída/Entrada/Transferência depois (o estorno pela diferença continua). Compensação interna
  (`compensacao: true`) não passa pela guarda (como a RN-258.07).
- **RN-261.03** `GET /api/almoxarifado/movimentacoes` ganha, em cada movimento, `prateleiras: [{ localizacao_id, codigo, quantidade }]` —
  aditivo; `[]` quando não há registro (movimento antigo, Entrada, Transferência, Estorno…). Soma por `localizacao_id` (linhas de lotes
  diferentes na mesma prateleira somam), na ordem do registro. Linha sem endereço (ou apagada): `localizacao_id: null, codigo: null`.
- **RN-261.04** No `AJUSTE` sem localização **com** registro, entra mais uma parte `{ localizacao_id: null, codigo: null, padrao: true,
  quantidade: (saldo_anterior − saldo_posterior) − soma do registro }` quando ela é > 0 (o que saiu da linha padrão). Sem registro: `[]`.
- **RN-261.05** Tela: na coluna *Quantidade*, abaixo do número, *"Saiu de: ⟨codigo⟩ ⟨qtd⟩ · …"* (`data-testid="mov-prateleiras"`), com
  *"sem endereço"* para `codigo: null` e *"posição padrão"* para `padrao: true`. Sem `prateleiras` (ou vazio): nada (como hoje).
- **RN-261.06** Uma consulta para a página inteira (sem N+1), em blocos de até 500 ids.

## Contratos

- `POST /api/almoxarifado/movimentacoes/:id/cancelar` — resposta igual; recusas novas (400) as da RN-261.01. Ordem no ramo com localização:
  contagem mais recente → retenção (`guardaEstornoAjuste`) → linha que não comporta → negativo.
- `GET /api/almoxarifado/movimentacoes` — cada linha ganha `prateleiras` (RN-261.03/04). Nada sai do contrato.
- Banco: nada novo. Sem consulta de produção (letra A não se aplica).

## Fase 2 (revisor fresco, 24/11 — a primeira rodada foi cortada pelo limite de uso; refeita sobre o código já escrito)

Sonda `scratchpad/fase2-261-sondaR.js` (pela rota, `:memory:`). Literais e ordem das recusas conferidas; nenhum chamador interno estorna
AJUSTE com localização (só Saída/Entrada em `epiService`, `scrapService`, `thirdPartyService`); galhos independentes.

1. **[importante, anterior, reproduzido]** O Ajuste de **outra** prateleira pode reescrever a linha deste por `absorverNegativosSemLote`:
   padrão *A*, Entrada 5, Entrada 10 em *B*/L1, Ajuste de *A* para 3, Saída de 5 sem lote (*A* −2), Ajuste de *B*/L1 para 0 (total 0, *A* −2 → 0);
   estorno do Ajuste de *A* → 200, total **2** (sem ele, 0). → **declarado** (D (261) 1). A RN-261.02 dizia, sem exceção, que a outra
   prateleira "dá o número certo" — **estava incompleta**. Conserto exigiria gravar as linhas que o Ajuste com endereço **absorve** (o registro
   de hoje é de quem **baixa**); raro: material sem negativo, linha sem lote negativa e saldo em lote.
2. **[menor, reproduzido]** RN-261.04 com a padrão que **sobe** (negativa, material que permite negativo): *A* −2, *B* 5, Ajuste para 1 →
   *"Saiu de: B 4"* num total que caiu 2; Ajuste **para cima** que drenou → *"Saiu de: B 1"*. → **consertado**: quando a parte da padrão dá
   negativa, o Ajuste fica sem *"Saiu de"* (`[]`); cenário [RN-261.04, Fase 2 achado 2]; sabotagem R8.
3. **[menor]** Total que não batia com as linhas (legado): a parte "posição padrão" leva o que nunca teve endereço. → declarado (D (261) 2).
4. **[menor]** Ajuste do total que só baixou a padrão (sem drenar) não tem registro e fica sem *"Saiu de"*. → declarado (D (261) 3; guia).
5. **[ruído]** Ajuste sem localização com lote feito depois trava (certo); o id citado é o maior; `saldo_id` não se reaproveita
   (AUTOINCREMENT), linha não muda de endereço, registro que falhou → `[]` (omite, não mente).

**Achado da integração (não da revisão):** os 42 arquivos com ajuste e estorno, um a um, derrubaram o **J5 da Etapa 104** (caixa de 4 em *A*,
Ajuste de *A* para 0, Ajuste de *A* para 3, estorno do primeiro → 7). Pela RN-261.01 o estorno passa a ser recusado; o caminho é o da recusa,
um Ajuste novo de *A* contando a caixa (7, sem aviso) — **B1616**. O aviso A1 da 104 ainda manda *"estorne o ajuste que baixou o estoque"*;
com um ajuste da mesma prateleira depois, isso é recusado (**C554**). Teste atualizado em `61ead3b6`.

## Tasks

- [ ] **T1 (tronco, motor)** item 5: a guarda no ramo com localização (a mesma consulta da RN-258.07 extraída num helper, parametrizada);
  teste novo `estornoAjustePrateleiraContagem.api.test.js` (cenários 1-4, inventário, outro lote, contagem estornada, ordem inversa,
  pelo serviço). Sabotagens.
- [ ] **T2 (galho, leitura)** item 4: a rota (`prateleiras`) + `movimentacoesPrateleirasDaSaida.api.test.js` (Saída automática de duas
  prateleiras; Ajuste que drena com a parte padrão; movimento sem registro `[]`; Saída com lote em duas prateleiras soma). Sabotagens.
- [ ] **T3 (galho, tela)** `MovimentacoesPrateleirasDaSaida.test.js` (Jest): a frase, os rótulos sem endereço/padrão, nada sem registro.
- [ ] **T4 integração:** pela rota — Saída de 6 de *A* 3 + *B* 5, o histórico diz *A* 3 · *B* 3; Ajuste de *A*, Ajuste do total, o estorno
  recusado, o histórico intacto.
- [ ] **T5** Fase 2 (revisor fresco) e **T6** Fase 5 (adversarial, sondas executadas em cópia, falha forçada).
- [ ] **T7** fechamento (fechar-etapa sem 7½ e 8) + Passo 7¼.
