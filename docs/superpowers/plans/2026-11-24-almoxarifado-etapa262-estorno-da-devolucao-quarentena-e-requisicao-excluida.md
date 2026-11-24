# Etapa 262 — O estorno da entrada de uma devolução respeita a quarentena (C239) e a requisição já excluída (C552)

> Itens **6** e **7** da estimativa da semana (`docs/estimativas/2026-11/estimativa_2026-11-23_almoxarifado-semana.md`, commitada em
> `d7e6afb9` — 1h15 + 1h; não refeita: o plano não mudou o tamanho em 1 h). A "próxima tarefa detalhada" do plano da 261.
> **Fatia visível:** as duas recusas novas ao clicar em **Estornar** na entrada da devolução (Movimentações). Motor puro.

## Fase 0 — medido (sonda `scratchpad/sab-262-sonda.js`, pela rota, sobre `cc38576c`)

| # | Cenário | Hoje | Certo |
|---|---|---|---|
| Q1 | Entrada 10; Saída 2; Devolução 2 para **Quarentena** (físico 10, bloq. 2); estorno da entrada | 200, físico 8, **bloq. 2** | recusa (o bloqueio de pé) |
| Q2 | o mesmo, mas **Desbloquear** 2 antes (quarentena liberada: 10, bloq. 0); estorno do bloqueio → *"o bloqueio já foi desfeito"*; estorno da entrada | 200, 8, bloq. 0 | o mesmo (a peça foi liberada; só o físico sai) |
| Q3 | Q1, estornado o **bloqueio** antes (10, 0); estorno da entrada | 200, 8, 0 | o mesmo |
| Q4 | Q1 com lote L1 (o bloqueio leva L1) | 200, 8, **bloq. 2** | recusa |
| X1 | Entrada 5; requisição entrega 2; Devolução 2 (Estoque) citando a saída (5); **Excluir** a requisição (5 — a exclusão desconta a devolução); estorno da entrada | 200, físico **3** | recusa (5) |
| X2 | X1 com destino Quarentena; estorno do bloqueio (5, 0); estorno da entrada | 200, **3** | recusa |
| X3 | X1 com destino Sucata (3); estorno da sucata (5); estorno da entrada | 200, **3** | recusa |

- **Causa C239:** `stockService.cancelarMovimentacao` lê `devolucaoDaEntrada` (~3294) só para a Sucata (`entradaDaSucata`) e as séries; a
  perna `BLOQUEIO` com a mesma `referencia DEV-<n>` (`returnService.js` ~388) não é olhada.
- **Causa C552:** nenhuma conferência de que a requisição da saída citada (`movimentacoes_almoxarifado.requisicao_id` da saída) está excluída
  (`requisicoes_almoxarifado.ativo = 0`). A exclusão (`requisitionService.excluirSemTrava`, sob a trava por requisição e a por material dos
  itens) credita o líquido de cada saída **descontada a devolução viva** (`DEVOLUCAO_VIVA_SQL`) e grava `ativo = 0` dentro da mesma seção.
- A devolução nova citando a saída de requisição excluída já é recusada (C244, Etapa 117). O estorno da perna Sucata/Bloqueio não tem guarda
  nova (estornar a sucata depois da exclusão dá o número certo: X3 5).

## Decisões

- **B1617 (item 6, C239; revê a B761)** — a entrada da devolução para Quarentena **não** se estorna enquanto o bloqueio dela está de pé e
  ainda **cobre** a quantidade (o estorno do bloqueio passaria); a mensagem manda estornar o bloqueio antes — o mesmo padrão da Sucata
  (B760). Quarentena **já liberada** (Desbloquear; o bloqueio não cobre mais) → a entrada estorna como hoje (Q2: a peça foi liberada, só o
  físico sai). **Descartado:** (a) estornar a perna do bloqueio junto (o operador espera, mas o estorno passaria a desfazer duas
  movimentações — dois claims, duas linhas ESTORNO, o desfazer das duas; o mesmo descartado da B760); (b) recusar sempre que o bloqueio não
  foi estornado (a B761 já apontava: com a quarentena liberada o estorno do bloqueio recusa *"o bloqueio já foi desfeito"* e a entrada ficaria
  presa para sempre). **Preço declarado:** "cobre" é a régua do material (o bloqueado total, e o do lote pelo livro) — com outro bloqueio do
  mesmo material de pé, uma quarentena já liberada ainda recusa e manda estornar o bloqueio (o estorno dele tiraria o bloqueio de outro; já é
  assim no estorno do bloqueio). **Reversível:** é a guarda.
- **B1618 (item 7, C552)** — a entrada de uma devolução que cita a saída de uma requisição **excluída** não se estorna, em qualquer destino;
  o caminho é um Ajuste. Vem **antes** da guarda da Sucata e da Quarentena (estornar a sucata/bloqueio não destravaria — mandar fazer isso
  seria mandar mexer à toa). **Descartado:** creditar de volta na requisição (não existe mais); só avisar (o físico fica a menos).
  **Reversível.**

## Regras de negócio

- **RN-262.01 (C552)** O estorno (`POST /movimentacoes/:id/cancelar`, sem `compensacao`) de uma `ENTRADA_DEVOLUCAO` que é a entrada da
  devolução (a identidade de `devolucaoViva.js`), cuja `movimentacao_saida_id` tem `requisicao_id` de uma requisição com `ativo = 0`, é
  recusado (400), antes do claim, com: *"Não é possível estornar: esta entrada é da devolução DEV-⟨n⟩, de uma entrega da requisição
  ⟨numero⟩, que foi excluída — a exclusão já devolveu ao estoque o resto da entrega contando com esta devolução, e estornar a entrada tiraria
  estas peças de novo. Se a devolução foi registrada errada, acerte o estoque com um Ajuste."* Todos os destinos. Nada muda (físico,
  `cancelado`, sem linha ESTORNO).
- **RN-262.02 (C239)** Fora da RN-262.01: o estorno da entrada de uma devolução para **Quarentena** é recusado (400) quando a perna `BLOQUEIO`
  (a **primeira** `BLOQUEIO` do material com a mesma referência e id maior que a entrada) **não** tem estorno concluído e: (i) tem um estorno
  em andamento (claim provisório `cancelado = 1` sem `movimento_estorno_id`), ou (ii) ainda cobre — `quantidade_bloqueada ≥ q` e, com lote, o
  bloqueado do lote (pelo livro) `≥ q`; sem lote, `quantidade_bloqueada − Σ bloqueado com lote ≥ q`. Mensagem: *"Não é possível estornar:
  esta entrada é da devolução DEV-⟨n⟩, que foi para a quarentena, e o bloqueio dela continua de pé — estornar só a entrada deixaria
  bloqueadas peças que não estão mais no estoque. Estorne primeiro o bloqueio desta devolução e depois esta entrada."*
- **RN-262.03** Não trava: a quarentena liberada (Q2); o bloqueio estornado (Q3); a devolução para Estoque de requisição **não** excluída; a
  devolução avulsa (sem saída); a saída avulsa (sem requisição); a compensação interna.
- **RN-262.04 (corrida)** As duas guardas rodam **de novo dentro da seção da trava do material**, antes de qualquer efeito (o claim volta
  pelo catch): a exclusão da requisição e o estorno do Desbloquear/Bloqueio pegam a mesma trava. Exclusão disparada entre a guarda de fora e
  a seção → o estorno recusa com a RN-262.01 e o físico fica o da exclusão.
- **RN-262.05 (ordem)** RN-262.01 → Sucata (E1 da 117) → RN-262.02 → as de série de sempre.

- **RN-262.02, revista pela Fase 2 (achados 1, 2 e 5):** o que conta é o **alcance** da perna — `min(q, régua)`, com a régua do lote pelo
  livro e, sem lote, `min(bloqueado − Σ com lote, livro sem lote)` (a reprovação da inspeção soma no bloqueado sem livro e não entra). Alcance
  `q` → a literal acima; alcance entre 0 e `q` (quarentena liberada pela metade) → *"Não é possível estornar: esta entrada é da devolução
  DEV-⟨n⟩, que foi para a quarentena, e ainda há ⟨N⟩ ⟨un⟩ dela no bloqueio — estornar só a entrada deixaria bloqueadas peças que não estão
  mais no estoque. Desbloqueie ⟨N⟩ ⟨un⟩ e depois estorne esta entrada."*; alcance 0 → passa. Estorno da perna em andamento (claim provisório)
  → *"Não é possível estornar agora: o estorno do bloqueio da devolução DEV-⟨n⟩ está em andamento — tente de novo em instantes."*
- **RN-262.05, revista (Fase 2, achado 4):** a RN-262.01 vem antes também das guardas de **série** da entrada (a leitura da devolução subiu
  para antes delas); a da Quarentena fica depois da Sucata.

## Fase 2 (revisor fresco, 24/11; sonda `scratchpad/fase2-262-b.js`, pela rota)

1. **[importante, reproduzido]** Quarentena liberada pela metade (Desbloquear 1): pela régua "cobre q" a entrada passava e ficava **1 bloqueado
   sem peça** (o estorno do bloqueio recusa depois). → **consertado**: o alcance parcial recusa e manda desbloquear o resto (cenário + S8).
2. **[importante, reproduzido com bloqueio avulso]** Sem lote, a régua do total contava o bloqueado da **reprovação** (sem livro): a mensagem
   mandaria estornar o bloqueio da devolução, que comeria o da reprovação, e a NC recusaria depois (*"O material já havia saído do bloqueio"*).
   → **consertado**: sem lote, o menor entre o total − lotes e o livro sem lote (cenários + S5/S6). O bloqueio **avulso** sem lote continua
   contando (está no livro) — preço declarado na B1617.
3. **[importante]** `bloqueioSabeOLote` [RN-217.05] estornava pela rota a entrada com o bloqueio de L1 de pé (o estado da C504). → o teste
   prova a recusa e monta o estado antigo pela compensação.
4. **[menor]** A ordem: as guardas de série rodavam antes de onde se lia a devolução. → a leitura subiu; a RN-262.01 vem antes delas.
5. **[menor]** Claim provisório do bloqueio com a mensagem "continua de pé". → literal própria ("em andamento").
6. **[ruído, conferido]** só a devolução grava BLOQUEIO com `DEV-n`; só a exclusão grava `ativo = 0`, dentro da trava do material; o caso
  (i) é necessário (a soma do lote ignora `cancelado = 1`); nenhuma compensação estorna entrada de devolução. Último gesto: depois da
  RN-262.01 resta o Ajuste (ninguém preso); depois da RN-262.02, estornar o bloqueio ou desbloquear destrava.

## Contratos

- `POST /api/almoxarifado/movimentacoes/:id/cancelar` — resposta igual; recusas novas (400) as literais acima. Nada mais muda.
- Banco: nada novo. Sem consulta de produção (letra A não se aplica). Primeiro boot: não se aplica.

## Tasks

- [ ] **T1 (tronco, motor)** `recusaDaEntradaDaDevolucao` em `stockService.js` + chamada antes do claim e no começo da seção.
  Teste `estornoEntradaDevolucaoQuarentenaExcluida.api.test.js` (RN-262.01..05) com controle positivo (sabotagem por cópia + md5).
- [ ] **T2** o `[R6/C239 declarado]` de `devolucaoViva.api.test.js` passa a provar a recusa (o comportamento declarado mudou).
- [ ] **T3 integração** — os arquivos de `tests/api` com `ENTRADA_DEVOLUCAO` e estorno, um a um.
- [ ] **T4** Fase 2 (revisor fresco, 4 perguntas) — **T5** Fase 5 (adversarial: sonda, falha forçada, corrida pelo claim provisório).
- [ ] **T6** fechamento (fechar-etapa sem 7½ e 8) + Passo 7¼.
