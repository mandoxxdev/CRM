# 23 — Endereço do destino (CEP ou à mão) e destino da lista na Viagem do gestor

> **Status:** 🟡 **em execução na Etapa 9** (2026-10-29).
> **Pedido do André (29/10):** "não aparece essa lista pra mim. A origem e destino estão como campos de texto livre. A gente não
> deveria fazer um cadastro de endereço mais rigoroso com o componente de cep ou o cadastro manual do endereço se ele não souber o cep?"
> **Plano:** [`docs/superpowers/plans/2026-10-29-frotas-etapa9-endereco-do-destino.md`](../../../docs/superpowers/plans/2026-10-29-frotas-etapa9-endereco-do-destino.md)
> (RN-F9.01–20, contratos congelados)

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
| RN-F9.01 | Colunas de endereço em `frotas_destinos`; `endereco` montado pelo servidor | [ ] | |
| RN-F9.02–05 | Régua do endereço no POST (obrigatórios, CEP 8 dígitos, UF válida, tamanhos) | [ ] | |
| RN-F9.06 | Formato do `endereco` montado | [ ] | |
| RN-F9.07 | PUT: régua inteira quando o corpo traz endereço; sem, não mexe | [ ] | |
| RN-F9.08 | Busca por cidade, bairro e CEP | [ ] | |
| RN-F9.09 | `/portal/inicio.destinos` com cidade/UF | [ ] | |
| RN-F9.10–12 | Viagem do gestor com `destino_id` (e viagem antiga continua editável) | [ ] | |
| RN-F9.13–14 | Componente de endereço com busca de CEP e preenchimento manual | [ ] | |
| RN-F9.15–16 | Portal: "+ Novo destino" com endereço; opção `Nome — Cidade/UF` | [ ] | |
| RN-F9.17 | Tela Destinos com o endereço estruturado | [ ] | |
| RN-F9.18–19 | Viagem do gestor: select + "+ Novo destino"; viagem antiga mostra o texto gravado | [ ] | |
| RN-F9.20 | A origem continua gravada como `GMP` | [ ] | |
| RN-F9.21–22 | Endereço da GMP lido de Configurações → Empresa; `meta.origemEndereco` e `inicio.origem` | [ ] | |
| RN-F9.23 | Portal mostra o endereço da GMP abaixo de "Saindo de: GMP" | [ ] | |
| RN-F9.24 | Viagem do gestor: Origem vira linha fixa "Saindo de: GMP — endereço"; origem antiga diferente é mantida | [ ] | |

## O que fica de fora

Mapa, distância, rota; endereço na planilha; origem como cadastro de endereço.
