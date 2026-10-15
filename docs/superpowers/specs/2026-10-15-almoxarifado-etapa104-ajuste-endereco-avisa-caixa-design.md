# Etapa 104 — o ajuste com endereço que leva a caixa passa a avisar (C186, B495) — design

> Data: 2026-10-15. Plano: `docs/superpowers/plans/2026-10-15-almoxarifado-etapa104-ajuste-endereco-avisa-caixa.md`.
> Origem: "Próxima tarefa detalhada — Etapa 104" no fim do plano da Etapa 102; C186 / B495 (Etapa 97).

## O problema, em linguagem de galpão

O almoxarife separa 4 peças para uma requisição (sem reserva: aprovada sem saldo, a entrada veio depois). As peças
saem da prateleira A e vão para a caixa da requisição — no sistema, separar não move estoque: as 4 continuam
"no A". Depois alguém conta a prateleira A, acha 0 e lança **Ajuste** com endereço A = 0. O sistema aceita, o estoque
do material vira 0 e a requisição fica presa: a entrega diz *"Máximo: 0"*. Ninguém é avisado de que a contagem bateu
numa caixa.

Desde a Etapa 97 toda porta que tira material do livre recusa levar a caixa sem reserva — menos esta (B495, C186).

## Medido (Fase 0, sonda `server/tests/sonda/e104fase0.js`, não versionada; `testApp` com `requirePermission` real)

| caso | estado | `POST /movimentacoes/v2` AJUSTE com endereço | depois |
|---|---|---|---|
| P1 | sem reserva, A:4, separa 4 | A→0: **201**, total 0, caixa 4 | entrega 4 → 400 *"…Máximo: 0 (pendente: 4, disponível: 0)"* |
| P2 | com reserva (entrada antes da aprovação), separa 4 | A→0: **201**, total 0, reservado 4, caixa sem reserva 0 | entrega 4 → 400 *"…Máximo: 0 … o disponível de ⟨código⟩ está negativo (reservado além do físico)…"* |
| P3 | sem reserva, A:4 B:2, separa 4 | B→0: 201, total 4 (cabe); A→1: 201, total 1; A→3: 201 | entrega 4 → *"Máximo: 3"* |
| P4 | ALMOXARIFE | A→2: **201** (o ajuste pela v2 só exige `movimentar`) | — |
| P5 | P1 + **estorno** do ajuste (ADMIN) | estorno 200, total volta a 4 | entrega 4 → **200**, *Entregue* |

Respostas às perguntas da próxima tarefa (plano da 102):

1. Hoje **201**, total 0, a entrega presa em "Máximo: 0" — confirmado (P1).
2. **O teste que prende a decisão da Etapa 10** é `ajusteRetencao.api.test.js` *"AJUSTE COM localizacao continua passando
   mesmo com retencao"* (reservado 8, linha → 2, tem de passar). O **porquê** que ele prende **não** é "a contagem é a
   verdade física": é o D1/D7 do design da Etapa 10 — *"o novo total ali só é conhecido depois de `syncMaterialTotals`
   somar todas as linhas… registrado como corte declarado (D7)"*, adiado para uma 10b que não o fez. A frase "verdade
   física" mora noutro lugar: no comentário do ramo do motor (round 3 da Etapa 6, **decisão do cliente**): *"contagem por
   localização REDEFINE o saldo do material — 'aqui tem 40' quer dizer que o total daquele lugar é 40"*. Ou seja: a
   semântica "a contagem redefine" é decisão do cliente; "a retenção não limita a contagem por endereço" é corte de escopo.
   **Achado:** a B495 dizia que projetar e recusar *"reabriria uma decisão da Etapa 10 com teste que a prende"* — uma
   projeção **só da caixa** não derrubaria aquele teste (ele não tem caixa). O que ela reabriria é a decisão do cliente
   (a contagem redefine), não o teste.
3. **A conferência de inventário NÃO é a mesma porta**: ela grava `AJUSTE_INVENTARIO` **sem** endereço (o total contado
   + em terceiros), já projeta a caixa (`caixaParaGuardaDoAjuste`, Etapa 97) e recusa. Fora desta etapa.
4. **Com reserva, a caixa NÃO é protegida** (P2): o ajuste com endereço não olha retenção nenhuma (D7 da Etapa 10), o
   reservado fica acima do físico e a entrega é presa — mas com a frase do disponível negativo (Etapa 98, C190), que já
   diz o que houve. Fica declarado (C209); esta etapa trata a caixa sem reserva, que é a C186.
5. **Achado (corrige o plano da 102):** a próxima tarefa dizia *"o ajuste com endereço não pega a trava por material hoje"*.
   **Estava errado** desde a Etapa 97 (B494): `registrarMovimentacao` envolve o motor inteiro em
   `trava.naTravaDoMaterial` — todo ajuste pela v2 roda sob a trava do material, e a separação e a entrega do mesmo
   material esperam (95). A leitura da caixa depois do ajuste é consistente.

## A decisão (B704)

**(b) Aceitar a contagem e avisar.** A resposta 201 ganha `aviso_caixa` (só quando há o que avisar) e a tela mostra.

| Opção | O que faz | Por que |
|---|---|---|
| **(b) — escolhida: aceita e avisa** | o ajuste grava como sempre (linha = contado, total = soma das linhas); se o total ficou abaixo da caixa sem reserva, a resposta traz a literal A1 com a requisição e os dois caminhos | **Reversível** nos dois sentidos: o contrato é aditivo (chave nova, nenhum teste existente muda) e o próprio ajuste se desfaz pelo estorno, que sobe o total e não tem guarda (P5). Não contraria a decisão do cliente (a contagem redefine) nem o teste da Etapa 10. Não esconde perda: quem contou 0 porque o material sumiu da caixa grava a perda, e a mensagem manda devolver à prateleira |
| (a) — descartada: projetar e recusar | total projetado = outras linhas + contado; abaixo da caixa sem reserva → 400 com a literal do ajuste + `sufixoCaixa` | Reabre a decisão do cliente: a pessoa contou e o sistema se recusa a gravar o que ela viu. Quando a caixa **se perdeu**, a contagem verdadeira fica impossível de lançar até alguém devolver à prateleira — e quem conta não é necessariamente quem separa. Se o P.O. preferir, é uma guarda no ramo, com a projeção que a Etapa 51 já faz (`totalProjetado`) |

**O argumento a favor da (a), registrado para o P.O.:** separar tira as peças da prateleira para a caixa, mas no
sistema elas continuam no endereço. Quem conta a prateleira sem olhar a caixa conta **menos do que existe** — então o
0 da P1 pode ser contagem errada, não perda. É por isso que a literal A1 começa pelo caso "o material está na caixa — a
contagem não o incluiu: estorne o ajuste que baixou o estoque". Se na operação real a caixa fica sempre fora da prateleira, a (a) é a
regra mais segura; a troca é uma guarda no lugar do aviso.

**Quando avisa (RN-02):** depois do ajuste com endereço, o **disponível** do material (físico − reservado − bloqueado −
em inspeção − em terceiros, o mesmo que limita a entrega) ficou **abaixo** da caixa sem reserva (`caixa > disponível +
1e-9`, a régua da B524). *(A versão revisada pela Fase 2 dizia "o total" — com bloqueado ou reserva de outra requisição
a entrega ficava presa sem aviso; corrigido.)* Em qualquer sentido: um ajuste que sobe o total mas o deixa ainda abaixo da
caixa (P3, A→3) também avisa — o aviso descreve o estado depois do ajuste, não o recusa (o princípio da Etapa 97, "o que
melhora não é recusado", vale para recusa; aqui não há recusa).

**A caixa coberta por reserva fica de fora** (C209): a entrega já diz *"o disponível está negativo (reservado além do
físico)"*; o ajuste com endereço que deixa o reservado acima do físico é o D7 da Etapa 10, inteiro, e não só caixa.

**Concorrência (RN-05):** nada de trava nova. O ajuste já roda sob a trava do material (`registrarMovimentacao`), a
separação e a entrega do mesmo material também; a caixa lida depois da escrita, dentro da trava, é a de verdade.

**O aviso nunca derruba o ajuste (RN-04):** a leitura da caixa vem depois do livro gravado, num `try/catch` — falhou,
a resposta sai sem o aviso (o mesmo princípio da notificação pós-movimentação).
