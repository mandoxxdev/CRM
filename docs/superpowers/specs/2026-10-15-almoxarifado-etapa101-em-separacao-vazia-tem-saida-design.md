# Etapa 101 — a *Em Separação* vazia tem saída (C195) e a requisição recusa fração de material com série (C202) — design

> Data: 2026-10-15. Plano: `docs/superpowers/plans/2026-10-15-almoxarifado-etapa101-em-separacao-vazia-tem-saida.md`.
> Origem: "Próxima tarefa detalhada — Etapa 101" no fim do plano da Etapa 99.

## O problema, em linguagem de galpão

1. **A requisição que entrou em separação e ficou sem nada na caixa não tem saída.** Quatro caminhos chegam lá — o
   almoxarife clica *Iniciar Separação* sem quantidade; separa e devolve tudo à prateleira; entrega parte e clica
   *Iniciar Separação* de novo; entrega parte, separa mais e devolve. Em todos, medido hoje (Fase 0, sonda P1–P4):
   quem pediu toma *"Requisição não encontrada ou não pode ser cancelada"* (outros módulos) ou *"Não é possível cancelar
   neste status"* (almoxarifado), o administrador também, e o encerramento toma *"Transição inválida: EM_SEPARACAO →
   ENCERRADA"*. A reserva fica **ATIVA** segurando o material. Só a exclusão administrativa tira a requisição dali.
2. **A requisição aceita 1,5 de um material controlado por série.** A separação (desde a 99) só leva inteiro: o 0,5
   nunca sai, e o caminho natural (zerar o modal e confirmar) leva ao beco do item 1. Medido: as duas rotas de criação,
   o rascunho, o envio do rascunho e a cópia aceitam 1,5 (P5: 201/201/201/200/201).

## A decisão

**Saída pela régua que já existe: o que aconteceu com o material decide o gesto.**

| Em Separação com… | Gesto | Quem | Por quê |
|---|---|---|---|
| caixa vazia e **nada entregue** | **Cancelar** | quem já cancela hoje em cada tela: quem pediu (as duas rotas) e o administrador do sistema (rota do almoxarifado) | nada saiu: é desistência, como cancelar uma *Reservada* |
| caixa vazia e **algo entregue** | **Encerrar** | quem já encerra (`aprovar_requisicao`) | parte saiu: é o fim de uma *Parcialmente Atendida* |
| material **na caixa** | nenhum dos dois — entregar ou devolver à prateleira primeiro | — | cancelar/encerrar com material separado perde a caixa sem movimento (B437, 92) |

"Caixa" é a régua única da B524: `Q.qtd(separado − entregue) > 1e-9`; "entregue" é `quantidade_entregue ??
quantidade_atendida` (`getEntregue`) acima da folga 1e-9.

**Concorrência.** A B450 (93) deixou os dois cancelamentos fora da trava por requisição porque "não existe *Em
Separação* → *Cancelado*". Essa premissa acaba aqui: uma separação que reivindica a *Em Separação* vazia e grava a caixa
entre a leitura e o UPDATE do cancelamento deixaria material numa cancelada. Os dois cancelamentos passam a correr
**dentro** da trava por requisição (a separação, a entrega, a devolução e o encerramento já estão lá), e a decisão (status
e itens) é lida dentro dela. Cancelar não distribui nem reserva — só solta reserva — então **não** pega a trava por
material (regra do CLAUDE.md).

**O dono não ganha "liberar reserva" na Em Separação.** A exceção do dono em `assertPodeLiberarReserva` é derivada de
"a máquina deixa ir a CANCELADO". Com a seta nova, o dono passaria a liberar a reserva de uma *Em Separação* — inclusive
com material na caixa, o F1 da 77. A exceção passa a usar a lista dos status que cancelam **sem condição**
(`STATUS_CANCELAVEIS_SEM_CONDICAO`, sem `EM_SEPARACAO`). Comportamento de hoje preservado.

**C202.** A criação (`createRequisicao` — o único escritor de `quantidade_solicitada`, usado pelas duas rotas de criação
e pela cópia) recusa quantidade não inteira de material com `controle_serie = 1`, rascunho inclusive (o rascunho não tem
edição de itens: gravado com fração, ficaria preso). O envio do rascunho recusa o legado com a mesma frase. A régua é a
da separação (Q3 da 99): `Q.qtd` primeiro, depois `Number.isInteger`.

## Descartados

- **Voltar a *Em Separação* vazia ao status de antes** (*Reservada*/*Aguardando*/*Parcialmente Atendida*) — já
  descartado na B504 pelo custo (quatro a seis setas novas e os recálculos de reserva, alçada e chegada sobre cada uma);
  e quem quer continuar já pode separar de novo a partir da *Em Separação*.
- **Encerrar sem nada entregue** — "Encerrada" conta como atendimento nos relatórios; uma requisição da qual nada saiu é
  desistência.
- **Dar ao almoxarife um gesto de cancelar** — a autorização do cancelamento não muda nesta etapa (quem pediu e o
  administrador do sistema; a exclusão continua com o administrador do almoxarifado). Gesto novo de perfil é decisão
  de negócio (letra B).
- **Pôr `EM_SEPARACAO` em `CANCELAVEIS_OUTROS_MODULOS`** — a lista é incondicional (tela e rota conferidas por teste);
  a *Em Separação* entra por um predicado de itens à parte, espelhado na tela.
- **C202: arredondar a fração** em vez de recusar — mudaria o pedido sem o solicitante saber; **aceitar fração no
  rascunho** — ele não tem edição de itens.
