# Almoxarifado — Etapa 31: os quatro geradores de número colidem (design)

Data: 2026-08-31 · Branch: `desenvolvimento-almoxarifado`
Origem: a "próxima tarefa detalhada" do plano da Etapa 30 apontava **um** gerador — o da remessa a
terceiros, que aparece como flake de `remessaTerceiroCiclo` desde a Etapa 29. A Fase 0 mandava
procurar irmãos antes de consertar um só. **Há quatro**, e o pior não é o que estava na mira.

## Fase 0 — medido em 2026-08-31

Varredura por `Date.now().toString().slice`, cruzada com as colunas `numero TEXT UNIQUE NOT NULL`
de `schema.js`. **Quatro geradores, quatro tabelas com `UNIQUE`, nenhum deles compartilhado:**

| # | Onde | Formato | Tabela (`numero` é `UNIQUE`) |
|---|---|---|---|
| 1 | `routes/almoxarifado.js:1108` | `INV-` + 8 dígitos de ms, **sem aleatório nenhum** | `conferencias_almoxarifado` |
| 2 | `requisitionCreateService.js:19` | `REQ-` + **6** dígitos de ms + 2 aleatórios | `requisicoes_almoxarifado` |
| 3 | `receiptService.js:75` | `<prefixo>-` + 8 dígitos de ms + aleatório 0–99 | `recebimentos_material_almoxarifado` (`REC`) |
| 4 | `thirdPartyService.js:34` | `REM-` + 8 dígitos de ms + aleatório 0–99 | `remessas_terceiro_almoxarifado` |

### O defeito não é "mesmo milissegundo" — o carimbo de tempo DÁ A VOLTA

Foi isto que a medição mudou. `Date.now().toString().slice(-8)` são os **últimos 8 dígitos** do
milissegundo, então o prefixo **repete a cada 10⁸ ms = 27,78 horas**. Com `slice(-6)`, repete a
cada **16,7 minutos**. Medido:

```
slice(-6) repete a cada 16.7 minutos
slice(-8) repete a cada 27.78 horas
REQ- agora  : REQ-54846842
REQ- +16.7m : REQ-54846842   <- mesmo numero possivel
REM- agora  : REM-885484687
REM- +27.8h : REM-885484687  <- mesmo numero possivel
```

Ou seja: duas requisições criadas com **16,7 minutos** de diferença, no mesmo offset de
milissegundo, disputam **100** sufixos. Não é preciso simultaneidade nenhuma.

### Quantificado, e sem exagero

Sendo honesto sobre a ordem de grandeza, porque isto decide a prioridade:

- **Criação genuinamente simultânea** (dois usuários no mesmo milissegundo, ou um laço):
  **1 em 100** para REQ/REC/REM, e **certa** para `INV-`, que não tem aleatório. É o caso real e o
  que mais dói.
- **Criações em momentos quaisquer:** a colisão exige o mesmo ms módulo 10⁶ (ou 10⁸) **e** o mesmo
  sorteio — ~1 em 10⁸ por par. Num acervo de 10.000 requisições dá cerca de **meia colisão
  esperada**: raro, mas cresce com o **quadrado** do volume e não some sozinho.
- **Em teste**, onde registros nascem em laço no mesmo milissegundo, o caso 1 domina — e é por isso
  que `remessaTerceiroCiclo` falha de vez em quando desde a Etapa 29 (*"UNIQUE constraint failed:
  remessas_terceiro_almoxarifado.numero"*), passando 53/53 isolado.

**O que o usuário vê quando acontece:** erro de banco cru, sem tradução, num fluxo que ele não tem
como repetir com sucesso garantido.

## Decisões

**D1 — Um gerador só, num módulo próprio, usado pelos quatro.** `services/almoxarifado/numeroDoc.js`
com `gerarNumeroDocumento(prefixo)`. Hoje há quatro cópias divergentes de uma mesma ideia, e a
Etapa 29 já pagou o preço de duas cópias da fórmula da faixa divergindo. **Descartado** consertar só
o da remessa: os outros três têm o mesmo defeito, e o `INV-` é o pior.

**D2 — Alargar a entropia; retry só como cinto de segurança.** O formato passa a ser
`<PREFIXO>-<ms em base36><6 aleatórios em base36>`. Base36 porque encurta o carimbo sem perder
dígitos — o milissegundo inteiro cabe em 8 caracteres e **não dá a volta** (dura até o ano 5138),
e os 6 aleatórios dão ~2,2 bilhões de sufixos por milissegundo. **Descartado retry sorteando de
novo sobre o espaço estreito de hoje:** com 99 dos 100 sufixos ocupados, o retry acha o livre com
8% de chance em 8 tentativas — é exatamente onde nasceria um flake novo, trocando um defeito por
outro mais difícil de ver.

**D3 — O retry existe, é curto, e é do banco.** A escrita tenta até 5 vezes ao tomar
`UNIQUE constraint`, gerando número novo a cada vez. Com a entropia da D2 ele nunca deve disparar —
e é justamente por isso que precisa de **teste próprio**, senão vira código que ninguém sabe se
funciona.

**D4 — Números já gravados NÃO são migrados.** O formato antigo continua válido e legível; os dois
convivem. **Descartado** renumerar: o número aparece em impresso, e-mail e conversa de galpão, e
renumerar quebraria o rastro de tudo que já saiu. Registrar na letra **C**: a partir do deploy, os
números novos ficam **mais curtos e com letras**.

**D5 — `INV-` ganha aleatório junto, e é o primeiro a ser corrigido.** É o único sem nenhum, e a
colisão dele em criação simultânea é **certa**, não probabilística.

## Regras de negócio

- **RN-01** `gerarNumeroDocumento(prefixo)` devolve `<PREFIXO>-<8 chars de tempo><6 aleatórios>`,
  sempre maiúsculo, sem caractere ambíguo de separador.
- **RN-02** O carimbo de tempo **não dá a volta** dentro da vida útil do sistema — dois instantes
  distintos nunca produzem o mesmo prefixo de tempo.
- **RN-03** Mil chamadas no **mesmo milissegundo** produzem mil números **distintos** (prova
  determinística, com o relógio fixado — não por acaso).
- **RN-04** A criação dos quatro documentos retenta ao tomar `UNIQUE constraint` no `numero`, até
  5 vezes, com número novo a cada tentativa; esgotadas, o erro sobe **traduzido**, não como erro
  de SQLite cru.
- **RN-05** Documento gravado com o formato antigo continua sendo lido, listado, filtrado e
  impresso normalmente — nenhuma tela valida o formato.

## Fica FORA, declarado

- **Numeração sequencial por ano** (`REQ-2026-0001`), que é o que uma ERP madura faz — exige tabela
  de contador e uma decisão de negócio sobre reinício anual. É etapa própria, e a **letra B** vai
  perguntar se ele quer.
- **Migrar os números existentes** (D4).
- **Geradores fora do módulo almoxarifado** — a varredura foi do módulo; outros módulos ficam para
  quem os tocar.
