# Etapa 102 — encerrar com material na caixa é recusado em qualquer status (C204) — design

> Data: 2026-10-15. Plano: `docs/superpowers/plans/2026-10-15-almoxarifado-etapa102-encerrar-com-caixa-recusa.md`.
> Origem: "Próxima tarefa detalhada — Etapa 102" no fim do plano da Etapa 101; C204.

## O problema, em linguagem de galpão

O almoxarife separa 4 peças para uma requisição, entrega 1, e a requisição fica *Parcialmente Atendida* com 3 peças
**na caixa** (separadas, não entregues). Quem aprova clica **Encerrar Requisição** — e o sistema aceita: a requisição vira
*Encerrada*, a reserva é solta e as 3 peças deixam de ser caixa sem nenhum movimento (medido, sonda Q1: `PUT /encerrar`
**200**, separado 4 / entregue 1, reserva *Liberada*, `quantidade_reservada` 0). Fisicamente as peças continuam
separadas num canto; no sistema elas voltaram a ser livres. Ninguém registrou que voltaram à prateleira.

A Etapa 101 deu à *Em Separação* a recusa **E1** para o mesmo caso. A *Parcialmente Atendida* ficou de fora (declarado,
C204) — a mesma caixa, dois comportamentos conforme o status.

## Medido (Fase 0, sonda `server/tests/sonda/e102fase0.js`, não versionada)

| caso | estado | encerrar |
|---|---|---|
| Q1 | pede 4, separa 4, entrega 1 → *Parcialmente Atendida*, caixa 3, reserva ATIVA | **200**, caixa some, reserva LIBERADA |
| Q3 | separa 2, entrega 1, entrega 3 (além da caixa) | *Entregue*, separado 4 / entregue 4 — **a entrega acima da caixa sobe o separado**: *Entregue* não fica com caixa pelos gestos |
| Q4 | separa 4, entrega 4 → *Entregue* | 200 |
| Q5 | pede 4, separa 2, entrega 2 → *Parcialmente Atendida*, caixa 0 | 200 |
| Q6 | *Entregue* com separado 5 / entregue 4 (legado, por SQL) | 200 |
| Q7 | Q1 + **Devolver à prateleira** 3 → caixa 0 | devolver 200, encerrar **200**, reserva LIBERADA |
| Q2 | separar acima do pedido | 400 (a separação não cria caixa maior que o pedido) |

De onde `ENCERRADA` sai (`TRANSICOES`): *Em Separação* (condicional, 101), *Parcialmente Atendida*, *Entregue*.
Dos três, só os dois primeiros **retêm caixa** (`STATUS_COM_CAIXA`); *Entregue* não retém e **não aceita** devolver à
prateleira (a devolução exige `STATUS_COM_CAIXA`). Recusar o *Entregue* legado com separado > entregue o prenderia: não
haveria gesto que esvaziasse a caixa.

Quem depende do comportamento antigo: o manual (7.6, 10.2, 10.5 — *"ao encerrar, o que ela tinha separado e não
entregou deixa de ser caixa"*), **a recusa de saldo por caixa** (`caixaSql.sufixoCaixa`), que ensina *"entregue o que
existe e encerre a requisição"* como saída para material perdido da caixa — com a regra nova esse caminho é recusado
(entregar o que existe deixa a parte perdida na caixa → E1) —, e os testes de corrida da 93 (`parcial()` encerra com 3
na caixa).

## A decisão

**Recusar (E1), não devolver automaticamente.**

| Opção | O que faz | Por que |
|---|---|---|
| **A — escolhida: recusa E1** | *Parcialmente Atendida* com caixa → 400 E1 (a literal da 101); nada muda. A saída é a que já existe: entregar ou **Devolver à prateleira** (98) e encerrar | **Reversível**: não grava nada. Uma regra só para a caixa (os dois status que a retêm). A devolução pede **motivo** e registra quem — exatamente a informação que o encerramento automático jogaria fora |
| B — descartada: encerrar devolve a caixa | o encerramento chama a devolução (sem trava, dentro da trava por requisição) e encerra | grava trilha de devolução com motivo inventado; mascara perda (a caixa perdida "volta" à prateleira no papel sem ninguém olhar); a devolução da 98 é por item e com motivo do almoxarife, o encerramento é do aprovador — mistura dois perfis num gesto. Se o P.O. preferir, é aditivo: chamar `devolverSemTrava` no lugar da recusa |

**Entregue não recusa** (RN-02): fora de `STATUS_COM_CAIXA`, o separado a mais do *Entregue* já não é descontado como
caixa e não tem gesto de devolução. Declarado.

**A recusa de saldo por caixa deixa de ensinar o caminho recusado** (RN-06): o sufixo perde o trecho *"entregue o que
existe e encerre a requisição, "*. Ficam os dois caminhos que funcionam: devolver à prateleira e dar a baixa, ou o
administrador excluir.

**A tela** (RN-07): **Encerrar Requisição** aparece só onde a rota aceita (predicado `podeEncerrar`, espelho do
servidor, conferido por tabela); na *Parcialmente Atendida* com caixa, no lugar do botão, a tela diz por quê — a
literal E1 — para o botão não sumir sem explicação (na *Em Separação* com caixa não: é o estado normal da separação).

**Concorrência:** o encerramento já está na trava por requisição (93) com todos os escritores da caixa (separar,
entregar, devolver); os itens são lidos dentro dela, inclusive na nova tentativa do compare-and-set. Nada de trava por
material: encerrar só solta reserva (regra do CLAUDE.md).

## O que fica de fora

- Encerradas antigas com caixa (legado): a consulta A53 as lista; não há o que fazer no sistema (a caixa delas já não é
  descontada). Fisicamente, conferir se o material voltou à prateleira.
- *Entregue* legado com separado > entregue: encerra (RN-02).
- Devolução automática (opção B).
