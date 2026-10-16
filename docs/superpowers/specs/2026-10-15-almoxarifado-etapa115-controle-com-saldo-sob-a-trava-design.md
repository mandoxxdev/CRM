# Almoxarifado — Etapa 115: ligar e desligar o controle com saldo, sob a trava do material (design)

> Origem: "Próxima tarefa detalhada — Etapa 115" do plano da 114 (**C226** + **C225**, feature 01). Fora, por dependerem
> do P.O.: **C228**, **C219**, **C224**, **C230**. Worktree `CRM-wt-e115`, branch `etapa-e115`, a partir da main
> `21302298`.

## Fase 0 — medido (sonda no scratchpad, não versionada, 2026-10-15)

| Gesto | Resultado hoje |
|---|---|
| material com série, Entrada de 2 (A1, A2); `PUT /materiais/:id { controle_serie: 0 }` pelo **Almoxarife** | **200** |
| em seguida, `POST /movimentacoes/v2` SAIDA 2 sem série | **201**, físico 0 — A1 e A2 continuam **EM_ESTOQUE** |
| trava do material segura (`comLockDoMaterial` sem soltar); `PUT { controle_lote: 1 }` pelo Almoxarife | **200 em 4 ms** — o salvar não espera a trava |

**O que o código já faz (lido):**

- O motor (`registrarMovimentacao`) roda inteiro sob `naTravaDoMaterial` (Etapa 97): lê o material (`controle_lote`,
  `controle_serie`) e grava saldo/séries dentro da seção. Toda Entrada/Saída manual, recebimento e entrega passam por ele.
- O `PUT /materiais/:id` só pega a trava quando **inativa** (Etapa 113, `inativa ? trava.naTravaDoMaterial(...) : gravar()`).
- Para quem não tem `ajustar_estoque`, o `UPDATE` que liga lote/série já carrega a régua do saldo identificado
  (`condicaoSaldoIdentificadoSql`, Etapa 112, RN-06) e relê para dar a 403 da 112. A régua lê o saldo **no comando** — mas,
  fora da trava, o comando pode cair entre a leitura do material pela Entrada (controle 0) e a gravação dela: a Entrada grava
  sem lote com o controle já ligado (C226).
- A regularização de séries (`regularizarSeries`) **exige o controle ligado** e só baixa `presentes − físico`. Com o
  controle desligado não existe gesto que baixe as séries órfãs; religar é recusado ao Almoxarife pela 112 (físico ≠
  presentes) e o Administrador religa e baixa.
- A tela de Séries só mostra a divergência de material **com** `controle_serie` ligado (`LotesAlmoxarifado.js:226`): a
  série órfã de material desligado não aparece como problema em lugar nenhum.
- Nenhuma outra porta grava `controle_lote`/`controle_serie` (grep `controle_(lote|serie)\s*=` em `routes/` e `services/`:
  só o PUT). O formulário de material mostra a mensagem do servidor no toast (`MaterialAlmoxarifadoForm.js:510`) — nenhuma
  tela muda.

**A spec estava certa** nos dois C (medidos de novo acima). A B731 dizia "desligar o controle continua livre" — esta etapa
**muda** isso para a série com séries presentes (abaixo); a B731 ganha a nota.

## Decisões (letra B — caminho reversível)

**C226 — o salvar que muda o controle grava sob a trava do material.** O `UPDATE` do PUT roda em `naTravaDoMaterial`
quando liga **ou desliga** `controle_lote` ou `controle_serie` (além de quando inativa). Nenhuma mensagem nova: quem não
pode regularizar recebe a 403 da 112, agora vendo o saldo da Entrada que segurava a trava; o Administrador grava depois
dela (o saldo dela fica sem lote — o estado da C224, que ele regulariza).
*Descartado:* conferir o controle de novo no fim do motor (antes de gravar) — duplicaria a régua no motor e não fecharia o
desligar; a trava já é o lugar onde o motor lê o controle. *Descartado:* pegar a trava só quando liga — o desligar da série
(abaixo) tem a mesma janela com a Entrada que cria séries.

**C225 — desligar a série com séries presentes exige `ajustar_estoque`.** Opções medidas:
- **(a) escolhida:** quem não tem `ajustar_estoque` (Almoxarife, Engenharia) recebe 403 ao desligar `controle_serie` de
  material com ≥ 1 série *EM_ESTOQUE* ou *BLOQUEADA*; o Administrador desliga e as séries ficam como estão. É a régua da
  112 (B728) no sentido inverso; reversível — uma permissão num ponto só.
- **(b) descartada:** recusar para todos até as séries saírem. Com séries = físico > 0 não há como baixá-las sem uma
  Saída (consumo que não aconteceu) — é exatamente o que a B731 descartou.
- **(c) descartada:** desligar baixa as séries automaticamente (*BAIXADA*, com trilha). Fecha o furo também para o
  Administrador, mas muda o histórico de cada série num salvar de cadastro e perde o *BLOQUEADA* (o motivo do bloqueio).
  É a candidata se o P.O. quiser o Administrador também coberto (registrado na B).
- Material com controle ligado e **0** séries presentes (físico > 0 de legado, ou zerado): desligar é livre para quem edita
  — não há série para ficar órfã.
- O desligar do **lote** continua livre (B731: a saída volta a andar sem lote; nada fica órfão).

O Administrador que desliga com séries presentes fica com a C225 como era (declarado; o aviso a ele é a mesma pergunta da
C224 — **P.O.**).
