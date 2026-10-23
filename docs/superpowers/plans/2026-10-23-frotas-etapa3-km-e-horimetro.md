# Frota — Etapa 3: km e horímetro confiáveis no portal (A8 + A10, e o E5)

> **Status:** **etapa fechada em 2026-10-23** — T1..T4 feitas, Fase 5 corrigida (`c89397fa`, `a7427207`). Próxima: **Etapa 4 — relatórios
> fechados** ("Próxima tarefa detalhada", no fim).
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
| Plano + Fase 2 | feito | 64d85bf2 |
| E5 | feito — `getPerfilFromUser` ignora a caixa do `role`; `frotasPerfis` usuário 11 vira forçado | b88778b5 |
| T1 | feito — esquema, `MAX` atômico, `portalService` (RN-F3.01..09), rotas do gestor com horímetro (RN-F3.15), alerta da máquina (RN-F3.14); `frotasKmHorimetro` 25/25 no commit; testes antigos ajustados (retroativo confirma; `inicio` aditivo) | fc1328e0 |
| T2 | feito — planilha (colunas no fim), listas e formulários do gestor; `FrotasHorimetroGestor` 5/5 | c0af44e8 |
| T3 | feito (subagente) — tela do motorista; `FrotasPortalKmHorimetro` 21/21 no commit | fdfebf96 |
| T4 | feito — integração pela rota e pelo serviço, colunas lidas pelo nome | 5f7cfa3d |

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

## Fase 5 — revisão adversarial (dois revisores frescos em paralelo; achados só reproduzidos)

Revisor 1 — regras, por sonda executada: sonda aleatória do km/L (RN-F1.11) com **4 sementes** (20261023, 1, 777, 424242), ~1.800
operações cada (portal com e sem confirmar, gestor POST/PUT/DELETE com e sem km, com horímetro, trocando de veículo; 3 carros e 1
máquina), conferindo do zero depois de cada operação km/L, `km_desde_anterior`, km e horímetro do veículo (iguais ao maior, nunca
descem), máquina sem km vindo do portal e 409 sem gravar nada: **0 divergências reais** (as marcadas eram da própria sonda: km negativo,
que leva o 400 certo). Mais sondas dirigidas e 22 sabotagens carregadas em memória contra os `frotas*`. Revisor 2 — front × back:
leitura dos dois lados, servidor real com pasta vazia e jest no scratchpad (sondas apagadas no fim).

| Achado | O que era | Correção | Estado | Commit |
|---|---|---|---|---|
| Fase5-F1 (real, revisor 2) | O gestor troca o veículo para horímetro com o formulário aberto: a tela segue pedindo KM, o servidor responde *"Informe o horímetro atual"* e o **Voltar** não recarregava — o erro se repetia até o F5 | qualquer recusa ao salvar relê só o `/portal/inicio`, sem tirar o formulário (rede falhando não derruba o digitado); **Voltar** recarrega | corrigido | c89397fa |
| Fase5-F2 (real, revisor 2) | Outro motorista lança 2.000 depois de a tela abrir com 1.800: o 409 diz 2.000 e o "Último registrado" seguia em 1.800 | a mesma releitura | corrigido | c89397fa |
| Fase5-F3 (teste fraco, revisor 2) | Três sabotagens da tela passavam: trocar o veículo no registro não desarmava; a Saída da máquina sem teste; o pós-confirmar sem checar a volta ao painel. E o teste do gestor só lia a configuração | 3 cenários + `FrotasHorimetroGestorTela` (renderiza a página e lê o PUT) | corrigido | c89397fa |
| Fase5-R1/R2 (real, revisor 1) | Gestor: horímetro `"130,5"`/`"abc"` virava `NaN` → NULL; no PUT da viagem **apagava** o retorno gravado (e a conferência retorno × saída deixava de proteger); negativo gravava e saía na planilha | 400 `Horímetro inválido`, antes de gravar | corrigido | a7427207 |
| Fase5-R3 (real, revisor 1) | Portal: `" "` → 0 (numa máquina nova, gravava 0 sem passar pelo 409), `"0x10"` → 16, `"1e3"` → 1000 | texto só com dígitos e ponto (B15) | corrigido | a7427207 |
| Fase5-R4 (real, revisor 1) | Mensagem arredondava o atual em 2 casas: km 1.800,004 aparecia como `1.800` recusando 1800 | até 6 casas (B43) | corrigido | a7427207 |
| Fase5-R5 (testes fracos, revisor 1) | 6 sabotagens verdes: S4 (retorno em horas com o veículo trocado para km), S6 (próxima revisão da máquina na aba Cadastro), S7 (cartão de manutenção vencida), S9 (POST de viagem subindo o horímetro), S20 (gravidade/`km_restante` do alerta), S22 (PUT corrigindo `horimetro_saida`); e o 409 de horímetro no abastecimento sem contar linhas | um cenário por sabotagem; cada uma conferida derrubando a asserção certa | corrigido | a7427207 |
| Ruído / declarado | km do gestor aceita texto torto desde a Etapa 1 (medido: `"130,5"` → 201 com km nulo) — **E11**, não mexido; apagar o horímetro da viagem no PUT mantém e o do abastecimento apaga (o mesmo do km); mudar data/observação depois do 409 e confirmar grava o novo (a RN só desarma número e veículo); rótulos do gestor com "(máquina)"; tela formata com até 3 casas e o servidor com até 6 | declarado | — | — |

Controles positivos desta fase (todos com o arquivo restaurado e conferido por `md5sum`): sem a releitura (F1, F2 caem), sem o desarme
no registro, sem o `onSalvo`; trocar a chave do campo de horímetro do gestor (o PUT da tela cai); e no servidor R1, R3, R4, S4, S6, S7,
S9, S20, S22 — cada sabotagem derrubou o cenário que a nomeia.

## Estado final das tasks

| Task | Estado | Commit |
|---|---|---|
| Plano + Fase 2 | feito | 64d85bf2 |
| E5 | feito | b88778b5 |
| T1 | feito | fc1328e0 |
| T2 | feito | c0af44e8 |
| T3 | feito | fdfebf96 |
| T4 | feito | 5f7cfa3d |
| Fase5-F | feito | c89397fa |
| Fase5-R | feito | a7427207 |
| Fechamento (docs) | feito | commit "Frota etapa 3: fechamento nas specs, no plano e nos documentos do modulo" |

## Fechamento (2026-10-23)

### Divergências do plano

| Onde | O plano dizia | O que foi feito | Por quê |
|---|---|---|---|
| RN-F3.07 | a régua do retorno é a do veículo | a da **viagem** | Fase 2, T-2 |
| RN-F3.13 / proposta da Etapa 2 | "a mesma régua nas telas do gestor (aviso com confirmar)" | sem régua no gestor (B36) | o gestor lança atrasado; o PUT de linha antiga sempre perguntaria |
| Contrato | só o portal tinha horímetro | `POST/PUT /viagens` e `/abastecimentos` também (RN-F3.15), com 400 `Horímetro inválido` | Fase 2, T-1; Fase5-R1/R2 |
| Mensagem | número com até 2 casas | até 6 | Fase5-R4 |
| `lerKm` (Etapa 1) | aceitava qualquer texto que `Number()` lê | só dígitos e ponto | Fase5-R3 |
| RN-F3.08 | teste de corrida pelo HTTP | o HTTP **não** reproduz a corrida (8 em paralelo passaram antes do conserto); a prova é a chamada dupla no serviço | registrado para não confiar no teste HTTP |
| Commit T2 | cita a decisão das colunas como "B36" | a decisão é a **B41** | numeração final das letras B |

### Verificação final (medida)

`npm run test:api` **551/551 arquivos OK**; `test:almoxarifado` **44/44**; `test:validation` **4/4**; `test:safealter` **3/3**; `test:sqlite` **16/16**; tela **196 suítes, 2637/2637 testes**; `build` com `CI=true` **"Compiled successfully."**. Frota no servidor: 13 arquivos, **136 passaram, 0 falharam**; Frota na tela: 10 arquivos, **96/96**.

### Retro (4 números)

| Medida | Valor |
|---|---|
| Rodadas de correção | **1** fix-round da Fase 5 (front `c89397fa` + regras `a7427207`); nenhum teste falhou em 3 rodadas |
| Achados da revisão | Fase 2 (plano): **4 travas + 11 menores**; Fase 5 (código): **7 reais** (F1, F2, R1/R2, R3, R4 e os dois lotes de testes fracos F3 e R5) + **5 ruído/declarados** |
| Paralelismo | T3 (tela) num subagente em paralelo com T1 (servidor), contra o contrato congelado — **sem retrabalho**; T2 e T4 sequenciais depois de T1 |
| Defeito que escapou | (preencher na etapa seguinte) |

## Próxima tarefa detalhada — Etapa 4: relatórios fechados (A7 + a máquina no relatório)

**Por que esta (B44):** a feature 10 (Relatórios) é a única 🟡 do mapa e não precisa de infraestrutura nova. Hoje o **custo por veículo**
filtra o período em manutenção e combustível, **não em multas** (A7: `relatorioCustosPorVeiculo` soma `frotas_multas` sem `WHERE` de
data); a máquina por horímetro, desde a Etapa 3, grava abastecimento em horas **fora** do km/L e some do relatório de consumo e do alerta
de consumo baixo (D9); o custo por veículo mostra só o km (D11); a planilha não tem aba de multas (D3). Descartados para depois: foto
(anexo: guardar arquivo, tamanho, quem vê — etapa própria) e seção 3 do formulário (falta a folha inteira).

**Medido (Fase 0 adiantada):**
- `frotasService.relatorioCustosPorVeiculo(db, {data_inicio, data_fim})`: subconsultas `man` (filtro `date(data_manutencao)`), `abs`
  (`date(data_abastecimento)`), `mul` **sem filtro**; devolve `km_atual` (sem `horimetro_atual`/`tipo_medicao`). Rota
  `GET /api/frotas/relatorios/custos-por-veiculo` (`relatorios`). Tela `client/src/components/frotas/FrotasRelatorios.js` (período
  `data_inicio`/`data_fim`, chama as duas rotas).
- `frotasService.relatorioConsumo(db, {veiculo_id})`: `AVG(consumo_medio)` só de `consumo_medio IS NOT NULL` — a máquina não aparece.
- Alerta "consumo baixo" (`getAlertas`, `consumoAnomalo`): `AVG(a.consumo_medio)` dos últimos 60 dias contra `consumo_medio_esperado`.
- `frotas_multas`: `data_infracao`, `data_vencimento`, `data_pagamento`, `valor`, `status_pagamento`. Exportação: 6 abas, sem multas.
- Abastecimento da máquina: `horimetro_abastecimento` preenchido, `km_abastecimento` nulo (RN-F3.04).

**Contrato proposto (congelar na Fase 1):**
- RN-F4.01 — Custo por veículo: multas filtram pelo período por **`data_infracao`** (decidir na Fase 1 se é infração ou vencimento —
  caminho reversível + letra B). Sem período, tudo, como hoje.
- RN-F4.02 — Consumo da máquina em **litros por hora** = litros do abastecimento ÷ (horímetro dele − horímetro do abastecimento
  **anterior em horas** do mesmo veículo), pela mesma régua de ordem da RN-F1.11 (`horimetro ASC, id ASC`), com recálculo do vizinho ao
  criar/editar/excluir. Colunas novas por `safeAlter` ou cálculo na leitura — decidir na Fase 1 medindo.
- RN-F4.03 — Relatório de consumo e custo por veículo mostram a máquina em **h** e **L/h**; o alerta de consumo baixo ganha a régua da
  máquina só se houver "consumo esperado" em L/h (campo novo no veículo) — senão fica fora (letra D).
- RN-F4.04 — Aba **Multas** na planilha (Data, Veículo, Condutor, Infração, Valor, Pontos, Vencimento, Pagamento, Nº auto), filtrada
  pelo período como as outras abas.
- Fatia visível: em **Relatórios**, a coluna de multas passa a respeitar o período e a máquina aparece com "L/h".

**Pontos de atenção:**
1. **A sonda aleatória do km/L** (RN-F1.11; a da Fase 5 desta etapa, 4 sementes, 0 divergências — o script ficou no scratchpad da sessão
   e precisa ser refeito se a sessão for outra) tem de continuar verde **e** ganhar o L/h com a mesma conferência do zero.
2. **Linha com km e horímetro ao mesmo tempo** (o gestor pode preencher os dois, B39/C13): definir qual régua vale (provavelmente a da
   medição do veículo) antes de calcular.
3. **Mudança de medição do veículo** com abastecimentos dos dois tipos: o relatório agrupa por veículo; decidir se mostra os dois.
4. Harness `frotasTestApp` (`ctx.como`), `comLoginReal`; o teste de exportação lê colunas pela posição em `frotasExportacao` — a aba nova
   entra no fim da lista de abas para não mexer nas existentes.
5. Perfis: relatórios são `relatorios` (ADMIN_FROTA e CONSULTA); MOTORISTA 403 — nada muda.
