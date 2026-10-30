# 23 — Endereço do destino (CEP ou à mão) e destino da lista na Viagem do gestor

> **Status:** 🟢 **entregue na Etapa 9** (2026-10-29), na `main`: `d7ba0b09` (spec e plano), `59b7e3a9` (servidor), `97a92f56` (tela),
> `c1781e4c` (integração), `70e9aa76` (Fase 5), mais o fechamento.
> **Pedido do André (29/10):** "não aparece essa lista pra mim. A origem e destino estão como campos de texto livre. A gente não
> deveria fazer um cadastro de endereço mais rigoroso com o componente de cep ou o cadastro manual do endereço se ele não souber o cep?"
> **Plano:** [`docs/superpowers/plans/2026-10-29-frotas-etapa9-endereco-do-destino.md`](../../../docs/superpowers/plans/2026-10-29-frotas-etapa9-endereco-do-destino.md)
> (RN-F9.01–24, contratos congelados, ajustes A1–A13)

## O que é

1. **Endereço de verdade no destino.** Cadastrar destino (pelo "+" do motorista, pela tela Destinos ou pela Viagem do gestor) pede
   **CEP** — que busca e preenche rua, bairro, cidade e estado — ou, para quem não sabe o CEP, os campos **à mão**: rua, número,
   complemento (opcional), bairro, cidade e estado. Rua, número, bairro, cidade e estado são obrigatórios.
2. **A Viagem do gestor também usa a lista.** Em **Frota → Viagens → Nova Viagem**, o Destino deixa de ser texto livre e vira a
   mesma lista do portal, com **+ Novo destino**.
3. **A origem mostra o endereço da GMP** (pedido do André durante a etapa), lido de **Configurações → Empresa** — o mesmo cadastro
   que o pedido de compra já usa. Não há segundo cadastro do endereço da GMP.

## Por que (a spec 22 estava incompleta para o uso real)

A spec 22 entregou a lista **só no Portal do motorista** e registrou a B79 ("Viagens do gestor: Destino continua texto"). O André
procurou a lista na tela do gestor e não achou. A B79 é desfeita aqui (B89).

## Regras de negócio — checklist

| RN | Regra | Estado | Commit |
|---|---|---|---|
| RN-F9.01 | Colunas de endereço em `frotas_destinos`; `endereco` montado pelo servidor | [x] | `59b7e3a9` |
| RN-F9.02–05 | Régua do endereço no POST (obrigatórios, CEP 8 dígitos, UF válida, tamanhos) | [x] | `59b7e3a9` |
| RN-F9.06 | Formato do `endereco` montado | [x] | `59b7e3a9` |
| RN-F9.07 | PUT: régua inteira quando o corpo traz endereço; sem, não mexe | [x] | `59b7e3a9` |
| RN-F9.08 | Busca por cidade, bairro e CEP | [x] | `59b7e3a9` |
| RN-F9.09 | `/portal/inicio.destinos` com cidade/UF | [x] | `59b7e3a9` |
| RN-F9.10–12 | Viagem do gestor com `destino_id` (e viagem antiga continua editável) | [x] | `59b7e3a9`, `c1781e4c` |
| RN-F9.13–14 | Componente de endereço com busca de CEP e preenchimento manual | [x] | `97a92f56`, `70e9aa76` |
| RN-F9.15–16 | Portal: "+ Novo destino" com endereço; opção `Nome — Cidade/UF` | [x] | `97a92f56`, `70e9aa76` |
| RN-F9.17 | Tela Destinos com o endereço estruturado | [x] | `97a92f56` |
| RN-F9.18–19 | Viagem do gestor: select + "+ Novo destino"; viagem antiga mostra o texto gravado | [x] | `97a92f56`, `70e9aa76` |
| RN-F9.20 | A origem continua gravada como `GMP` | [x] | `59b7e3a9` |
| RN-F9.21–22 | Endereço da GMP lido de Configurações → Empresa; `meta.origemEndereco` e `inicio.origem` | [x] | `59b7e3a9` |
| RN-F9.23 | Portal mostra o endereço da GMP abaixo de "Saindo de: GMP" | [x] | `97a92f56` |
| RN-F9.24 | Viagem do gestor: Origem vira linha fixa "Saindo de: GMP — endereço"; origem antiga diferente é mantida | [x] | `59b7e3a9`, `97a92f56` |

## Correções desta spec (estavam erradas no plano)

- **RN-F9.12** dizia "`destino_id` ausente → mantém `destino` e `destino_id`". **Incompleto:** pela API, sem id mas com um texto `destino`
  diferente do gravado, o servidor grava o texto e **zera** o `destino_id` (B96) — senão a viagem diria um nome apontando para outro cadastro.
- **RN-F9.24** dizia "o formulário não manda `origem`". **Estava errado:** a tela manda (GMP na nova, a gravada na editada) e o servidor
  também grava GMP quando ela falta (B99). O resultado é o descrito na regra.
- **RN-F9.10** dizia "desativado no meio → 400". **Promete mais do que entrega:** a fila serializa só as viagens; desativar o destino no
  mesmo instante pode passar (C27, sem dano).

## Decisões (letra B do documento de novidades)

B89 (desfaz a B79), B90 (endereço obrigatório), B91 (sem conferir CEP no gravar), B92 (destino antigo), B93 (CEP troca a rua; só busca
quando muda), B94 (endereço da GMP de Configurações), B95 (origem fixa só na tela), B96, B97 (renomear não renomeia a viagem), B98, B99.

## O que fica de fora

Mapa, distância, rota; endereço na planilha; origem como cadastro de endereço.

## Depois do fechamento

- **2026-10-30 (`5f967566`, B100):** Enter no **CEP** busca também na tela **Destinos** (antes só no "+ Novo destino"; ali o Enter salvava
  o destino sem rua). Esta spec e o teste `Fase5-F2 metade negativa` diziam que na tela Destinos o Enter no CEP "segue enviando o
  formulário" — **estava certo como decisão da Fase 5 e foi mudado no uso real**; o teste virou *"Destinos do gestor: Enter no CEP busca o
  endereço; Enter na rua segue enviando o formulário do destino"*.
