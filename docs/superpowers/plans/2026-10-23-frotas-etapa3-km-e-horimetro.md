# Frota — Etapa 3: km e horímetro confiáveis no portal (A8 + A10, e o E5)

> **Status:** em execução (2026-10-23). Plano escrito; Fase 2 (revisor fresco) pendente.
> **Origem:** "Próxima tarefa detalhada" do [plano da Etapa 2](2026-10-23-frotas-etapa2-perfis-pela-tela.md) (B34).
> **Spec:** [`specs/modulo-frotas/16-km-e-horimetro/README.md`](../../../specs/modulo-frotas/16-km-e-horimetro/README.md) (criada no
> fechamento) e o mapa [`specs/modulo-frotas/README.md`](../../../specs/modulo-frotas/README.md) (A8, A10).
> **Decisões tomadas sem consulta (reversíveis):** [`docs/frotas/novidades-por-etapa.md`](../../frotas/novidades-por-etapa.md), letra B (B35+).

## Objetivo

Com o portal no ar, o motorista digita o km no celular. Hoje (A8) um km **menor** que o do carro entra calado: 900 com o carro em 1.800
é aceito, o carro fica com 1.800 e o lançamento com 900, que entra na conta do km/L pela ordem do km e distorce o consumo dele e do
vizinho. E (A10) numa máquina **por horímetro** (empilhadeira) o portal pede "KM atual" e grava as horas no **km** do veículo; o
horímetro do cadastro nunca anda. Esta etapa:

1. faz o portal **parar e perguntar** quando o número é menor que o último do veículo (o motorista confirma, ou corrige);
2. faz a máquina por horímetro ser registrada **em horas**, no horímetro, sem tocar no km nem no km/L;
3. mostra ao motorista, embaixo do campo, **o último número registrado** daquele veículo (a fatia visível);
4. de carona (E5): `role` "Admin" com maiúscula passa a ser administrador também no servidor do Frota, como já é no resto do sistema e
   na tela.

## Fase 0 — medido antes de prometer

- Portal (`services/frotas/portalService.js`): `registrar` lê `lerKm(b.km)` antes de saber o veículo (`Informe o KM atual`), grava o
  registro em `frotas_checklists.km`, abre/fecha viagem (`km_saida`/`km_retorno`/`km_rodado`) dentro de `naFilaDeViagens` e chama
  `updateKmVeiculoSeMaior` (3 lugares). `registrarAbastecimento` chama `frotasService.createAbastecimento` com `km_abastecimento`.
- `updateKmVeiculoSeMaior`/`updateHorimetroVeiculoSeMaior` (`frotasService.js:51/59`): **ler e depois gravar** (dois comandos). Dois
  lançamentos em paralelo podem gravar o menor por último. `updateHorimetroVeiculoSeMaior` **não tem chamador** (A10).
- km/L (RN-F1.11): `anteriorEmKm`/`seguinteEmKm`/`recalcularConsumoDaLinha` — linha **sem km** fica com km/L e `km_desde_anterior`
  nulos e **não serve de anterior**. Gravar a leitura de horas fora de `km_abastecimento` mantém a régua intocada.
- `frotas_veiculos.tipo_medicao` ∈ `km`|`horimetro` (`TIPOS_MEDICAO`), `horimetro_atual REAL`. A tela de Veículos do gestor já mostra
  `KM/Horímetro` pela medição.
- `GET /portal/inicio`: `veiculos[]` com `id, placa, modelo, marca, km_atual, tipo_medicao, status, em_uso` (o teste
  `frotasPortal` trava as chaves exatas); `viagem_aberta` com `id, veiculo_id, placa, km_saida, data_saida, destino`.
- Planilha da empresa (`Controle_de_Frota_GMP.xlsx`): **não tem horímetro** em nenhuma aba (medido: `sharedStrings.xml` tem "KM Atual"
  e "Placa" e zero ocorrências de "hor").
- Erros: `handleError` (`routes/frotas.js`) devolve `{ error, code }` quando o erro tem `code`.
- E5: `getPerfilFromUser` (`services/frotas/permissions.js`) compara `user.role === 'admin'` (sensível à caixa). O núcleo do servidor
  (`systemPermissions.isSystemAdmin`, `bypassModuleRestrictions`) e a tela (`perfilFrota`) usam `toLowerCase()`. Quem tem `role` "Admin"
  já é administrador do sistema inteiro no núcleo — só o Frota o rebaixa a Motorista. (O almoxarifado tem a mesma comparação exata em
  `services/almoxarifado/permissions.js:278`; fica **fora** desta etapa — registrado em E.)

## Regras de negócio

| RN | Regra | Cenário |
|---|---|---|
| RN-F3.01 | Portal (saída, retorno, inspeção, abastecimento), veículo **por km**: leitura **menor** que o `km_atual` do veículo → **409** com a mensagem literal e `code: 'KM_MENOR_QUE_ATUAL'`; **nada é gravado** (nem registro, nem viagem, nem abastecimento). Igual ao atual passa | carro em 1.800, inspeção com 900 → 409; com 1.800 → 201 |
| RN-F3.02 | O mesmo corpo com `confirmar_km_menor: true` (**booleano**; `"true"`, `1` não valem) grava normalmente; o `km_atual` do veículo **não desce** | 900 + confirmar → 201, carro segue 1.800, o abastecimento entra no km/L pela ordem do km (RN-F1.11) |
| RN-F3.03 | A confirmação **não** passa por cima das recusas duras: corpo inválido (400), veículo (404), manutenção/viagem única (409), sem saída aberta (409), **retorno menor que a saída** (400, RN-F1.07), data do retorno (400). Ordem: essas primeiro, a RN-F3.01 por último | retorno 1.000 com saída 1.050 + confirmar → 400 da RN-F1.07 |
| RN-F3.04 | Veículo **por horímetro**: o portal lê a leitura do campo **`horimetro`** do corpo (o `km` é ignorado); ausente/negativa/não numérica → 400 `Informe o horímetro atual`. Grava: registro em `frotas_checklists.horimetro` (km nulo); saída em `frotas_viagens.horimetro_saida`, retorno em `horimetro_retorno` (km da viagem nulos); abastecimento em `frotas_abastecimentos.horimetro_abastecimento` (`km_abastecimento` nulo → km/L nulo e fora da régua RN-F1.11); o veículo sobe o `horimetro_atual` (maior), **o `km_atual` não muda** | empilhadeira em 120 h, inspeção `{horimetro: 125}` → registro.horimetro 125, veículo 125 h, km igual |
| RN-F3.05 | Horímetro **menor** que o `horimetro_atual` → 409 `code: 'HORIMETRO_MENOR_QUE_ATUAL'`, mesma confirmação `confirmar_km_menor: true` | 110 h com a máquina em 120 h → 409; + confirmar → 201, máquina segue 120 |
| RN-F3.06 | Retorno de máquina por horímetro com leitura **menor que a da saída** (`horimetro_saida` da viagem) → **400** (dura, como a RN-F1.07), a viagem continua aberta | saída 125, retorno 124 → 400 |
| RN-F3.07 | Para escolher a régua o servidor olha o **veículo** (`tipo_medicao`): o do corpo (saída, inspeção, abastecimento) ou o da viagem aberta (retorno). Veículo inexistente cai na régua de km (e depois no 404 de sempre) | |
| RN-F3.08 | `km_atual` e `horimetro_atual` sobem por **um comando só** (`MAX` no `UPDATE`): lançamentos simultâneos com leituras diferentes deixam o veículo com a **maior** | 8 abastecimentos em paralelo (km 2.001..2.008) → km_atual 2.008 |
| RN-F3.09 | `GET /portal/inicio`: cada veículo ganha `horimetro_atual`; `viagem_aberta` ganha `horimetro_saida` e `tipo_medicao` (mudança aditiva) | |
| RN-F3.10 | Tela do motorista: com o veículo escolhido, o campo vira **KM atual (o que está no painel)** ou **Horímetro atual (horas no painel)** e mostra embaixo *"Último registrado neste veículo: 1.800 km"* (ou *"… 120 h"*). Digitado menor → aviso *"Menor que o último registrado. Confira o painel antes de salvar."* (não bloqueia). O 409 da RN-F3.01/05 mostra a mensagem do servidor e o botão **Confirmar mesmo assim**, que reenvia com `confirmar_km_menor: true`; mudar o número ou o veículo desarma a confirmação | |
| RN-F3.11 | "Meus registros", a lista do gestor (Checklist, Abastecimentos, Viagens) e a planilha exportada mostram a leitura de horas como horas: lista com `"125 h"`; planilha com colunas novas **no fim** das abas Checklist (`Horímetro`), Abastecimentos (`Horímetro`) e Viagens e KM (`Horímetro Inicial`, `Horímetro Final`) | |
| RN-F3.12 | (E5) `getPerfilFromUser`: `role` "admin" em **qualquer caixa** é ADMIN_FROTA (a mesma régua de `isSystemAdmin` e da tela). Em Perfis de acesso, o "Admin" aparece como **forçado** (409 `PERFIL_FORCADO` ao tentar mudar) | `role:'Admin'` → `/dashboard` 200 |
| RN-F3.13 | As telas do gestor (abastecimento, manutenção, viagem, veículo) **não** ganham a régua: o gestor lança atrasado e corrige o que o motorista errou; continuam aceitando qualquer km (B36) | `POST /abastecimentos` do gestor com km 900 e carro em 1.800 → 201 |

## Contratos de API (congelados)

Todas sob `/api/frotas`. Erros `{ error: '<literal>' }` (+ `code` quando indicado).

### `POST /portal/registros` e `POST /portal/abastecimentos` — o que muda

Corpo ganha `horimetro` (número ou texto numérico, como o `km` — B15) e `confirmar_km_menor` (booleano). Para veículo por horímetro o
`km` é ignorado; para veículo por km, o `horimetro` é ignorado.

| Caso | Código | Mensagem literal |
|---|---|---|
| veículo por horímetro sem `horimetro` válido | 400 | `Informe o horímetro atual` |
| veículo por km sem `km` válido (como antes) | 400 | `Informe o KM atual` |
| km menor que o atual, sem confirmar | 409 | `KM menor que o atual do veículo (1.800 km). Confira o hodômetro antes de salvar.` + `code: 'KM_MENOR_QUE_ATUAL'` |
| horímetro menor que o atual, sem confirmar | 409 | `Horímetro menor que o atual do veículo (120 h). Confira o painel antes de salvar.` + `code: 'HORIMETRO_MENOR_QUE_ATUAL'` |
| retorno, horímetro menor que o da saída | 400 | `Horímetro do retorno (124 h) menor que o da saída (125 h). Confira o painel.` |

O número entre parênteses sai no formato brasileiro (`Intl.NumberFormat('pt-BR', { maximumFractionDigits: 2 })`): `1.800`, `1.234,5`.
O retorno por km continua com a mensagem da RN-F1.07 (sem formatar), inalterada.

Ordem das conferências em `registrar`: tipo → leitura (pela RN-F3.07) → data → horário → combustível → itens → avarias → veículo
obrigatório → (inspeção) 404 → **RN-F3.01/05** → grava; (saída, na fila) 404 → manutenção → viagem única → **RN-F3.01/05** → grava;
(retorno, na fila) sem saída → RN-F1.07 / RN-F3.06 → data do retorno → **RN-F3.01/05** → grava. Em `registrarAbastecimento`: veículo
obrigatório → leitura → litros → valor → data → 404 → **RN-F3.01/05** → grava.

Resposta `201` igual à de antes (o `registro` traz `horimetro`; a `viagem` traz `horimetro_saida`/`horimetro_retorno`; o abastecimento
traz `horimetro_abastecimento`).

### `GET /portal/inicio` — aditivo

`veiculos[]`: `+ horimetro_atual`. `viagem_aberta`: `+ horimetro_saida`, `+ tipo_medicao`.

### Exportação — aditivo

Colunas no fim: Checklist `Horímetro`; Abastecimentos `Horímetro`; Viagens e KM `Horímetro Inicial`, `Horímetro Final`.

### Textos de tela (literais)

- Rótulo do campo: `KM atual (o que está no painel)` / `Horímetro atual (horas no painel)` (sem veículo escolhido: o de km).
- Embaixo do campo: `Último registrado neste veículo: {n} km` / `Último registrado neste veículo: {n} h` (n em pt-BR).
- Aviso ao digitar menor: `Menor que o último registrado. Confira o painel antes de salvar.`
- Botão no 409: `Confirmar mesmo assim`.
- Cartão do retorno: `saiu com {n} km` ou `saiu com {n} h`.
- Meus registros / listas do gestor: `{n} h` para leitura de horas.

## Esquema (`services/frotas/schema.js`, `safeAlter`)

`frotas_checklists.horimetro REAL`, `frotas_abastecimentos.horimetro_abastecimento REAL`, `frotas_viagens.horimetro_saida REAL`,
`frotas_viagens.horimetro_retorno REAL`. O harness ganha as colunas de graça (usa o `initSchema`).

## Tasks (sort topológico)

| # | Task | Tipo | Depende |
|---|---|---|---|
| T1 | Esquema; `updateKm/HorimetroVeiculoSeMaior` atômicos; `portalService` (RN-F3.01..09); `inserirRegistro` grava `horimetro`; `createAbastecimento` aceita `horimetro_abastecimento`; E5 (RN-F3.12). Teste `frotasKmHorimetro.api.test.js`; ajustar os testes antigos que mandavam km menor (com o motivo) e o de chaves do `inicio` | tronco | — |
| T2 | Exportação (RN-F3.11, colunas no fim) + listas do gestor (`frotasEntityConfigs`: `h` nas colunas KM/KM rodado) | galho | T1 (colunas) |
| T3 | Tela do motorista (RN-F3.10, RN-F3.11 no "Meus registros"): `FrotasPortalMotorista.js` + `FrotasPortalKmHorimetro.test.js` (fronteira HTTP mockada pelo contrato) | galho | contrato |
| T4 | Integração `frotasKmHorimetroIntegracao.api.test.js`: (a) **pela rota** — máquina por horímetro: saída → abastecimento → retorno → planilha com as horas, veículo com horímetro e km intactos; carro por km: 409 → confirmar → km/L do abastecimento e do vizinho pela RN-F1.11; (b) **pelo serviço** — `portalService.registrar` direto com o mesmo 409; (c) corrida RN-F3.08 | integração | T1, T2 |

Cada task: TDD com controle positivo (sabotar e ver cair **a asserção certa**).

## Estado das tasks

| Task | Estado | Commit |
|---|---|---|
| Plano | escrito | — |
| T1 | pendente | — |
| T2 | pendente | — |
| T3 | pendente | — |
| T4 | pendente | — |

## Ajustes da Fase 2 (revisor fresco: 4 travas + 11 menores — **valem sobre o texto acima**)

| Achado | Ajuste |
|---|---|
| T-1 (trava) o gestor fecha a viagem da máquina (C4) e corrige o abastecimento só com campos de **km**: as horas iam para o km da máquina (o A10 de volta pela porta do gestor) | **RN-F3.15**: `POST/PUT /viagens` aceitam `horimetro_saida`/`horimetro_retorno` (retorno menor que a saída → 400, a mensagem da RN-F3.06; o horímetro do veículo sobe pelo retorno); `POST/PUT /abastecimentos` aceitam `horimetro_abastecimento` (o horímetro do veículo sobe). Os formulários do gestor ganham **Horímetro saída**, **Horímetro retorno** e **Horímetro no abastecimento** (T2). O servidor **não** recusa km digitado em máquina (B39; declarado em C) |
| T-2 (trava) o retorno seguia a medição do veículo de **hoje** | **RN-F3.07 revisada**: o retorno segue a régua com que a **viagem abriu** — `horimetro_saida` gravado → horas; `km_saida` gravado → km; nenhum → a do veículo. `viagem_aberta.tipo_medicao` (RN-F3.09) sai da mesma régua |
| T-3 (trava) corrida pelo portal colidiria com o 409 | o teste de km vai pela rota do gestor; o de horímetro pelo portal **com** `confirmar_km_menor`; e um terceiro chama `updateKmVeiculoSeMaior` direto (duas chamadas no mesmo tique — o único jeito determinístico de ver a corrida) |
| T-4 (trava) o motorista escapa da régua pelas rotas do gestor (`POST /abastecimentos` tem só `registrar_operacoes`) | **B37**: aceito e **fixado em teste** (o motorista não tem essas telas no menu; é qualidade de dado, não segurança). Declarado em **D10** |
| 5 B8 (saída que consome a aprovada) na máquina | o `UPDATE` grava `km_saida` **e** `horimetro_saida` da leitura (o km fica nulo na máquina). Teste |
| 6 retorno sem saída aberta mandando `horimetro` levava `Informe o KM atual` | sem viagem aberta, `km` **ou** `horimetro` servem; o 409 `Você não tem saída aberta…` vem depois. Os dois vazios → `Informe o KM atual` (como antes) |
| 7 lançamento retroativo | **B35**: sempre compara com o atual do veículo; a confirmação é o remédio. Descartado: comparar pela data |
| 8 máquinas com horas gravadas no km antes desta etapa | consulta **A4** (produção) e **C14** |
| 9 alerta de revisão da máquina compara `proxima_revisao_km` com o **km** | **RN-F3.14**: para veículo por horímetro, alerta e painel comparam a "próxima revisão" com o **horímetro** atual (o campo continua sendo o mesmo). Teste |
| 10 aba Cadastro Frota e Relatórios mostram só o km | aba Cadastro Frota ganha **Horímetro Atual** no fim; Relatórios ficam (D11) |
| 11 horas rodadas | lista de Viagens: coluna KM rodado mostra `{retorno − saída} h` na viagem em horas; planilha só Inicial/Final |
| 12 edição do cadastro do veículo regrava o km/horímetro com o valor do formulário aberto | declarado em **C15** (já existia) |
| 13 teclado do horímetro | no portal, campo de horímetro com `inputMode="decimal"` e `step="any"`. Vírgula como texto (`"1234,5"`) não vale (400) — declarado (B38) |
| 14 formatador de horas em T2 e T3 | cada um tem o seu (arquivos diferentes); T2 passa a depender de T1 (serviço) |
| 15 E5 sem dois testes | + "Admin" ligado a motorista lê todas as listas e grava no portal; + linha CONSULTA antiga de um "Admin" é ignorada (forçado) |

### Contrato depois da Fase 2 (o que muda no texto acima)

- `POST /portal/registros` retorno: régua da viagem (T-2); sem viagem aberta, `km` ou `horimetro` servem.
- `POST/PUT /viagens`: `+ horimetro_saida`, `+ horimetro_retorno` (400 `Horímetro do retorno ({n} h) menor que o da saída ({n} h). Confira o painel.`).
- `POST/PUT /abastecimentos`: `+ horimetro_abastecimento`.
- Exportação: aba Cadastro Frota `+ Horímetro Atual` no fim.
- RN-F3.14: alerta de revisão e cartão "manutenções vencidas" do painel usam o horímetro na máquina.
- T2 = galho **depois** de T1 (formulários do gestor consomem o serviço novo); T3 continua galho contra o contrato.
