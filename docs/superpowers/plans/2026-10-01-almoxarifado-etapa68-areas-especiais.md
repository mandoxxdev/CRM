# Etapa 68 — áreas especiais de localização com semântica (feature 02)

> Status: **Fases 0, 1 e 2 feitas; T1–T6 implementadas; Fase 5 (revisão adversarial + fix-round) feita (2026-10-01). Falta T7 (fechamento).**
> Feature 02, item *"Áreas especiais (quarentena, expedição, sucata, devoluções, em-terceiros) como localizações
> tipadas"* (`specs/modulo-almoxarifado/02-localizacoes-enderecamento/README.md:34`), o único item aberto da 02 que não
> é corte por decisão (`:3`). Requisito: `specs/modulo-almoxarifado/2026-08-02-requisitos-modulo-almoxarifado.md:84-108`
> (3.1, "Estrutura física sugerida"), `:706-718` (15, transferências "para quarentena / expedição / sucata / estoque de
> cliente / terceiro"), `:816-848` (19, "Transferir para área de sucata"), `:358-361` e `:499` (disponível = físico −
> bloqueado − quarentena − reservado).

**Escopo desta etapa:** o tipo de localização passa a ter um **registro de áreas especiais** com semântica, e a
semântica é de **sugestão e aviso — nenhuma recusa nova no motor** (lição B217). Concretamente: dois tipos novos
(`Área de sucata`, `Área de devoluções`); o cadastro deixa de aceitar tipo fora da lista (texto livre hoje); a sugestão
de localização da entrada deixa de propor área especial como vaga comum; a tela de Movimentações avisa quando o destino
é área especial e o que a área **não** faz; o sucateamento aprovado baixa **da área de sucata** primeiro; o Mapa e o
assistente de localização conhecem as áreas. **Em-terceiros fica fora por decisão** (sem endereço físico — medido).
Objetivo declarado: levar a 02 a 🟢 com o item marcado e os cortes escritos.

## Fase 0 — medido (2026-10-01)

### 1. A coluna `tipo` e todo leitor dela (grep pelo nome da coluna)

Régua testada contra o que existe: `grep "Área de"` casou os rótulos acentuados em `schema.js:22-24` e
`MapaLocalizacoesAlmoxarifado.js:32-38` — a busca acentuada funciona com a palavra inteira; `grep -i "expedi"` (raiz sem
acento) também casa "Expedição".

| Onde | O que faz com `tipo` |
|---|---|
| `server/services/almoxarifado/schema.js:21-25` | `TIPOS_LOCALIZACAO`, 13 rótulos. Coluna criada por `safeAlter` com `DEFAULT 'Almoxarifado'` (`:1075`) |
| `server/routes/almoxarifado/extended.js:165-166` | `GET /api/almoxarifado/meta/tipos-material` devolve a lista como `localizacoes_tipos` (só `auth`) |
| `server/routes/almoxarifado.js:1957`, `:1990-1992`, `:2010-2011` | `POST /localizacoes` grava `tipo \|\| 'Almoxarifado'` — **sem validar contra a lista** (também no ramo que reativa código de inativa, Etapa 19) |
| `server/routes/almoxarifado.js:2045`, `:2114-2115` | `PUT /localizacoes/:id` grava `tipo \|\| 'Almoxarifado'` — **sem validar, e sem `tipo` no body REESCREVE para `Almoxarifado`** |
| `server/services/almoxarifado/stockService.js:763` (`MAPA_LOCALIZACOES_SQL`, `l.*`), `:822` (`listarLocalizacoesVazias`, `l.*`), `:676` (sugestão, `l.*`) | carregam a coluna, **nenhum decide por ela** |
| `server/services/almoxarifado/stockService.js:2784` | `consultarSaldosPorLocalizacao` devolve `localizacao_tipo` — **sem consumidor** no cliente (grep `localizacao_tipo` em `client/src`: zero) |
| `stockService.js:541-559` `motivoRecusaEndereco`, `:569` `validarEnderecoExplicito`, `:620` `validarLocalizacaoParaMovimento` | **não leem `tipo`** (só `bloqueada`, `tipos_material_permitidos`, `ativo`) |
| `client/.../MapaLocalizacoesAlmoxarifado.js:26-66` | `TIPO_ICONES`, `TIPO_CORES`, `TIPO_TAMANHOS`; `:217` tamanho; `:344` **filtro por tipo já existe**; `:608` select do filtro; `:706-708`, `:798-801` cor/ícone/painel |
| `client/.../ConfiguracoesAlmoxarifado.js:87` | `TIPOS_AREA_RAIZ` = 6 tipos; o assistente (`:1730`, `:2164`) **só oferece esses 6** — as 7 "Área de …" só são alcançáveis pelo **Editar** (`:2021`, `:2299`) |
| `client/.../ConfiguracoesAlmoxarifado.js:165`, `:1690`, `:1875`, `:1905`, `:1924`, `:1988`, `:2145`, `:2417`, `:2493` | rótulo, agrupamento por tipo no setor, e repasse do `tipo` no POST/PUT (os dois PUTs da tela — Editar e Mover — **sempre mandam** `tipo`) |
| `docs/almoxarifado-manual-do-sistema.md:342` | *"O tipo é **descritivo** … **não** carrega regra de negócio"* — muda nesta etapa |

Único escritor de localização no cliente: `ConfiguracoesAlmoxarifado.js:1869` (assistente) e os dois PUTs. Nenhuma
fixture de teste grava `tipo` (`grep "INSERT INTO localizacoes_almoxarifado" server/tests` → 67 linhas, 0 com `tipo`).
Nenhum teste lê `localizacoes_tipos` além de mocks vazios no cliente.

### 2. Cada área contra os fluxos que já existem

| Área | Fluxo que a usaria | O fluxo tem endereço físico? |
|---|---|---|
| **Quarentena/inspeção** (existe) | recebimento retido: `ENTRADA_COMPRA` no destino do item/nota/padrão (`receiptService.js:1306`) e depois `QUARENTENA` **sem endereço** (`:1408-1415`), que só soma `quantidade_em_inspecao` (`stockService.js:1320-1322`, `TIPOS_RETENCAO` em `schema.js:173`, pulado no bloco físico em `stockService.js:1504`). Decisão de inspeção, bloqueio e desbloqueio: só colunas (`inspectionService.js:273-279`, `:407-421`; zero `localizacao` no arquivo). Devolução com destino `QUARENTENA`: `ENTRADA_DEVOLUCAO` na padrão + `BLOQUEIO` (`returnService.js:202-206`) | **Não**: retenção é coluna do material; o material fica no endereço onde entrou. Para pôr na área, só `TRANSFERENCIA` à mão — que **não retém nada** |
| **Expedição** (existe) | separação → `PRONTA_PARA_RETIRADA` só muda status (`routes/almoxarifado.js:3650`); a separação **não move estoque** (`requisitionService.js:708-732`, "Separacao nao move estoque"); `origem_separacao_id` é de onde o separador tirou, e a entrega sai **dali** (`requisitionService.js:1087`). Nada de romaneio/expedição no módulo (grep `romaneio\|expedi\|staging`). Spec 05 deixa aberto *"Transferir material separado para localização 'Aguardando retirada'/'Kit'"* (`05-separacao-picking/README.md:63`) | **Não** no fluxo. Transferir à mão para a área deixa a entrega baixando da origem separada |
| **Sucata** (não existe) | `SUCATA` é **saída** (`movementTypes.js:70`), emitida na aprovação do sucateamento (`scrapDisposalService.js:394-410`) **sem `localizacao_origem_id`** — baixa da padrão primeiro e depois dos endereços de maior saldo (regra da Etapa 51). `SucateamentoCreateSchema` (`schemas.js:593-607`) não tem localização. Não existe tipo que credite sucata como saldo. Devolução com destino `SUCATA` = `ENTRADA_DEVOLUCAO` + `SUCATA` no mesmo endereço (`returnService.js:216-237`) | **Sim, no meio**: a spec pede "transferir para área de sucata" antes de "registrar venda ou descarte"; hoje a transferência é aceita, mas a baixa do sucateamento **não sai de lá** — a área fica "ocupada" no Mapa depois do descarte |
| **Devoluções** (não existe) | devolução ao estoque: `localizacao_id` vira `localizacao_destino_id` (`returnService.js:55`, `:198`, `:219`); omitido → padrão; **não** herda o endereço da saída. A tela (`DevolucoesAlmoxarifado.js`) **não tem select de localização** (grep `localizac`/`endere`: zero). Excluir requisição devolve para a origem da saída ou padrão (`requisitionService.js:1222-1227`), sem campo | **Só pela API** (o campo existe, a tela não o mostra). Pela tela, só `TRANSFERENCIA` à mão |
| **Em-terceiros** (não existe) | `REMESSA_TERCEIRO`/`RETORNO_TERCEIRO` são **retenção** (`schema.js:174`; `stockService.js:1377-1385`, "o material continua sendo nosso: quantidade_atual nao muda"); zero `localiza` em `thirdPartyService.js`; retorno sem destino (`stockService.js:564`). O saldo **nunca sai** da linha de endereço original | **Não** — não há endereço físico: o material está fora da empresa e o livro o mantém no endereço de onde saiu |
| **Materiais do cliente** (existe) | entra pelo recebimento normal, destino como qualquer material (`receiptService.js:1163`, `:1202-1206`); nenhuma regra liga dono a endereço (`motivoRecusaEndereco` só olha bloqueio e `tipos_material_permitidos`); o mapa conta a ocupação **sem** filtrar dono e os contadores de mínimo **filtram** (`stockService.js:748-752`, `:801`) | **Sim** — o material de cliente tem endereço como qualquer outro; a área é onde ele deveria ficar |

### 3. Dado (cópia local do banco de produção — prévia, não substitui a A32)

`server/data/database.sqlite` (arquivo de 2026-09-03; última movimentação 2026-08-10), lido em modo somente leitura:
13 localizações — `Almoxarifado` 7 inativas, `Prateleira` 3 inativas, `Rua` 3 ativas. **Nenhuma** "Área de …";
nenhum tipo fora da lista; nenhum saldo em área; 3 materiais ativos, nenhum de cliente. Recusa nova hoje não travaria
nada **nesta cópia** — produção pode ter mudado; a consulta da letra A (A32, abaixo) mede antes do deploy.

### 4. O que a spec original pede de cada área

- 3.1 lista as áreas como **estrutura física sugerida** (quarentena, não conformes, reservados por projeto, kits,
  expedição, devoluções, sucata, retalhos, "temporariamente em terceiros") — rótulos de lugar, sem regra.
- 3.2: *"impedir que um item seja armazenado em localização incompatível **quando houver restrição cadastrada**"* — já
  pago pelo `tipos_material_permitidos` (Etapa 2). Não pede recusa por tipo de área.
- 7 e `:499`: quarentena/inspeção/não conformidade **fora do disponível** — já pago pelas **colunas de retenção**
  (contrato que não se reabre); a área física não entra na conta.
- 15: transferências "para quarentena / expedição / sucata / estoque de cliente / terceiro" — a transferência para
  endereço já existe; o que falta é ela **dizer** o que não faz.
- 19: *"Transferir para área de sucata → Registrar venda ou descarte"* — o único encadeamento em que o endereço da área
  tem de **compor** com outro fluxo (a baixa).
- 1: *"Separação dos materiais próprios, materiais de clientes e materiais enviados a terceiros"* — próprios × cliente
  é endereço; terceiros é retenção (já paga, 8b).

### Surpresas da medição

1. **O `tipo` é texto livre no servidor.** POST e PUT gravam qualquer string (`routes/almoxarifado.js:2011`, `:2115`).
   Com semântica atrelada ao rótulo, um erro de digitação pela API perderia a semântica calado.
2. **`PUT` sem `tipo` apaga o tipo** (`tipo || 'Almoxarifado'`, `:2115`) — o mesmo padrão que a Etapa 55 corrigiu para
   `ativo` (C74 (3)). Hoje inofensivo (as duas telas mandam `tipo`); com semântica, viraria perda silenciosa.
3. **O assistente de nova localização não oferece nenhuma "Área de …"** (`ConfiguracoesAlmoxarifado.js:87`, `:1730`):
   só se chega a uma área especial criando outra coisa e trocando no Editar.
4. **A sugestão da entrada (Etapa 53) proporia área especial como vaga**: `VAZIA_COMPATIVEL` e `JA_TEM_O_MATERIAL` não
   olham tipo (`stockService.js:651-654`) — uma compra seria sugerida para a área de quarentena vazia, ou para a área
   de sucata onde o material já tem saldo.
5. **Spec errada (regra 5):** `specs/modulo-almoxarifado/15-retalhos-sucatas/README.md:67-69` afirma *"Tipos de
   localização preveem área de sucata e de retalhos"* — **não preveem**: `TIPOS_LOCALIZACAO` não tem nenhuma das duas.
   Corrigir à vista no fechamento.
6. **Em-terceiros não tem endereço por construção:** a remessa é retenção e o saldo fica na linha do endereço de onde
   o material "saiu" — uma localização "em terceiros" convidaria a uma `TRANSFERENCIA` que não retém nada.
7. **`localizacao_tipo` em `consultarSaldosPorLocalizacao` não tem consumidor** — não se mexe (aditivo inofensivo).

## Decisões por área (reversíveis — letra B do documento de novidades; última usada: B283)

| Área | Decisão | Por quê |
|---|---|---|
| Quarentena/inspeção | **sugestão + aviso** | o fluxo de retenção não tem endereço; a área é lugar físico. Recusa descartada: o item retido entra por `ENTRADA_COMPRA` no destino escolhido — recusar "entrada comum" na área travaria justamente o recebimento do retido |
| Expedição | **sugestão + aviso** (e "falta" para a semântica de fluxo) | a separação não move estoque; *staging* de separação é a lista de separação da feature 05 (`05/README.md:63`) |
| Sucata (tipo novo) | **sugestão + aviso + origem padrão do sucateamento** | único encadeamento com composição real (spec 19): o sucateamento aprovado baixa da área de sucata primeiro |
| Devoluções (tipo novo) | **sugestão + aviso**; select de endereço na tela de Devoluções = **falta** | a API aceita `localizacao_id`, a tela não mostra — campo novo em tela de outra feature |
| Materiais do cliente | **sugestão + aviso** (material próprio na área) | separação próprio × cliente (spec 1). Recusa descartada (único caso claro, mas a padrão do material pode apontar para lá e a entrada sem destino cairia na B217) |
| Em-terceiros | **FORA por decisão** — tipo não criado | sem endereço físico (remessa é retenção; medido) |

- **D1 (B284) — nenhuma recusa nova no motor**, em área nenhuma. Toda a semântica é sugestão (o que o sistema propõe) e
  aviso (o que a tela diz). Descartado: recusar material próprio em área de cliente e entrada de compra em área de
  quarentena — os dois atingem a entrada **sem destino** que cai na padrão (recebimento, exclusão de requisição,
  retorno de transformação), a lição da B217. Apertar depois é trocar o aviso por `throw` no mesmo helper.
- **D2 (B285) — o registro mora no servidor, por rótulo**: `AREAS_ESPECIAIS` em `schema.js`, chave = o rótulo exato de
  `TIPOS_LOCALIZACAO`, valor `{ chave, descricao }`; servido em `/meta/tipos-material` como `areas_especiais`. As
  frases de aviso saem de uma função pura no `stockService` (`avisoAreaEspecial`), consumida por rota — a tela não tem
  cópia das frases. Descartados: coluna nova `area_especial` na localização (segunda fonte do mesmo fato que o
  `tipo` já diz; migração); frases no cliente (duas definições).
- **D3 (B286) — tipos novos: `Área de sucata` e `Área de devoluções`**, no fim de `TIPOS_LOCALIZACAO`. Descartados:
  `Área de retalhos` (retalho é estoque aproveitável comum, endereço normal — tipo seria só rótulo; a spec 02 não o
  lista), `Área de materiais não conformes` (é a quarentena, com o bloqueio como estado), `Em terceiros` (D7).
- **D4 (B287) — o cadastro passa a recusar tipo fora da lista**: POST recusa; PUT recusa só quando o tipo **muda**
  para um valor fora da lista (o legado esquisito continua editável/movível); PUT sem `tipo` **preserva** (Surpresa 2).
  É recusa nova, mas no **cadastro** (não no motor) e só para valor que nenhuma tela produz. Descartado: deixar livre
  (erro de digitação perde a semântica calado); normalizar acento/maiúscula (inventa equivalência).
- **D5 (B288) — a sugestão da entrada não propõe área especial como vaga**: `JA_TEM_O_MATERIAL` e `VAZIA_COMPATIVEL`
  excluem localização cujo tipo está em `AREAS_ESPECIAIS`, **exceto** `Área de materiais do cliente` para material
  **de cliente** (que ali entra e vem primeiro entre as vazias). A `PADRAO` continua sugerida mesmo sendo área (é
  cadastro explícito). O **formato** da resposta da Etapa 53 não muda; muda o **conjunto** — reabertura deliberada e
  declarada do conteúdo, não do contrato. Descartado: não mexer (uma compra sugerida para a área de quarentena vazia).
- **D6 (B289) — sucateamento aprovado baixa da área de sucata primeiro**: se o sucateamento **não tem lote** e o
  material tem saldo sem lote positivo numa localização **ativa, não bloqueada**, do tipo `Área de sucata`, a `SUCATA`
  vai com `localizacao_origem_id` = a de maior saldo (empate: menor id); senão, como hoje. É **default de origem**,
  não recusa: o motor drena a origem e depois os outros endereços (Etapa 51). Descartados: exigir origem no
  sucateamento (campo novo na solicitação + recusa); drenar só a área (recusaria o descarte de material que não foi
  transferido); material com lote (a saída com lote não drena por endereço — B204/C72, fica como hoje).
- **D7 (B290) — em-terceiros fora por decisão**: o tipo não é criado. Saldo em terceiros já tem coluna, relatório e
  alerta (8b). Descartado: criar o rótulo "para o Mapa" (convidaria a `TRANSFERENCIA` que não retém).
- **D8 (B291) — o aviso é da tela de Movimentações (ENTRADA e TRANSFERENCIA, destino)**; recebimento (janela Processar
  da Etapa 57), devolução e integração **não** avisam. Descartado: aviso no recebimento (o item retido para a área de
  quarentena é o uso legítimo, e a janela é de outra feature — fica como "falta").
- **D9 (B292) — o assistente oferece as áreas especiais na raiz** (`TIPOS_AREA_RAIZ` + as chaves de
  `areas_especiais` que o servidor mandar). Descartado: oferecer os 15 tipos (as áreas de produção — corte, montagem —
  seguem pelo Editar como hoje; mudança sem pedido).

## Regras de negócio

- **RN-01 (registro)** — `GET /meta/tipos-material` devolve `localizacoes_tipos` com **15** rótulos (os 13 + `Área de
  sucata` + `Área de devoluções`) e `areas_especiais` com **5** entradas, cada `tipo` ∈ `localizacoes_tipos`.
  *Cenário:* a lista tem `Área de sucata` e `areas_especiais` mapeia `Área de sucata` → `SUCATA`; **e** (metade
  positiva) os 13 rótulos antigos continuam lá, na mesma ordem.
- **RN-02 (tipo válido no cadastro)** — POST com `tipo` fora da lista → 400; sem `tipo` → `Almoxarifado`. *Cenário:*
  `tipo: 'Area de sucata'` (sem acento) → 400 *"Tipo de localização inválido: Area de sucata"*; **e** `tipo: 'Área de
  sucata'` → 201 com o tipo gravado; **e** o ramo que reativa código de inativa (Etapa 19) recusa igual.
- **RN-03 (PUT preserva e não trava o legado)** — PUT sem `tipo` preserva o gravado; PUT com o **mesmo** tipo gravado
  é aceito mesmo fora da lista; PUT que **muda** para fora da lista → 400 (mesma literal). *Cenário:* localização com
  `tipo = 'Galpão X'` gravado por SQL → PUT de descrição mandando `tipo: 'Galpão X'` → 200; PUT sem `tipo` numa `Área de
  quarentena/inspeção` → continua `Área de quarentena/inspeção`; PUT para `'Qualquer'` → 400.
- **RN-04 (aviso por área)** — `avisoAreaEspecial(loc, material)` devolve a frase literal da área (contrato abaixo) para
  quarentena, expedição, sucata e devoluções; para `Área de materiais do cliente`, só quando o material é **próprio**
  (`proprietario_cliente_id` nulo); `null` para qualquer outro tipo. *Cenário:* para cada área, a frase; **e** o mesmo
  endereço com material de cliente na área de cliente → `null`; **e** `Prateleira` → `null`.
- **RN-05 (aviso não recusa)** — ENTRADA e TRANSFERENCIA com destino em qualquer área especial são aceitas pelo motor
  exatamente como antes (201, saldo no endereço). *Cenário:* para cada uma das 5 áreas, a `TRANSFERENCIA` de 3 entra
  e o Mapa mostra a área ocupada com 3.
- **RN-06 (sugestão sem área)** — `JA_TEM_O_MATERIAL` e `VAZIA_COMPATIVEL` não trazem localização de área especial;
  a `PADRAO` traz, mesmo sendo área. *Cenário:* com uma área de quarentena vazia e uma prateleira vazia, a sugestão da
  entrada traz a prateleira e não a área; com o material tendo saldo na área de sucata, "já tem" não traz a área;
  **e** com a padrão do material numa área de expedição, `PADRAO` continua vindo.
- **RN-07 (material de cliente)** — para material com `proprietario_cliente_id`, `VAZIA_COMPATIVEL` inclui as áreas de
  materiais do cliente, **antes** das outras vazias; `JA_TEM_O_MATERIAL` também as inclui. Para material próprio,
  nenhuma das duas as traz. *Cenário:* área de cliente vazia + prateleira vazia: material de cliente → a área primeiro;
  material próprio → só a prateleira.
- **RN-08 (sucateamento baixa da área)** — D6. *Cenário:* material sem lote, 10 na padrão P e 4 na área de sucata S;
  sucateamento de 4 aprovado → S fica com 0, P com 10, `localizacao_origem_id` do livro = S; **e** (metade positiva)
  sem área de sucata com saldo, o mesmo sucateamento baixa de P como hoje; **e** área de sucata **bloqueada** com saldo
  → ignorada, baixa de P, aprovação 200 (não trava); **e** sucateamento de 6 com S:4 → S:0 e P:8.
- **RN-09 (Mapa e assistente)** — o Mapa tem ícone e cor para os dois tipos novos e mostra, no painel da localização
  selecionada, a `descricao` da área (de `areas_especiais`); o assistente oferece as 5 áreas na raiz. *Cenário:*
  localização `Área de sucata` aparece com ícone/cor próprios e a frase; uma `Prateleira` não mostra frase.

## Contrato (congelado)

### `AREAS_ESPECIAIS` (`server/services/almoxarifado/schema.js`, exportado)

```js
const AREAS_ESPECIAIS = {
  'Área de quarentena/inspeção': { chave: 'QUARENTENA',
    descricao: 'Guardar aqui não retém o material: ele continua disponível. Quem retém é a inspeção ou o bloqueio.' },
  'Área de expedição': { chave: 'EXPEDICAO',
    descricao: 'A separação da requisição não usa este endereço: a entrega baixa da origem separada.' },
  'Área de sucata': { chave: 'SUCATA',
    descricao: 'Guardar aqui não sucateia: o material continua no estoque até o sucateamento aprovado, que baixa daqui primeiro.' },
  'Área de devoluções': { chave: 'DEVOLUCOES',
    descricao: 'Guardar aqui não muda o estado do material: ele continua disponível.' },
  'Área de materiais do cliente': { chave: 'MATERIAIS_CLIENTE',
    descricao: 'Endereço para material de cliente. Material próprio guardado aqui gera aviso.' },
};
```

`TIPOS_LOCALIZACAO` ganha, **no fim**, `'Área de sucata', 'Área de devoluções'`.

### `GET /api/almoxarifado/meta/tipos-material` — aditivo

`{ tipos, setores, localizacoes_tipos, areas_especiais: [{ tipo, chave, descricao }] }` — `areas_especiais` na ordem
em que os tipos aparecem em `localizacoes_tipos`. Só `auth`, como hoje.

### `POST /api/almoxarifado/localizacoes` e `PUT /api/almoxarifado/localizacoes/:id`

- 400 `{ error: "Tipo de localização inválido: ⟨tipo⟩" }` — POST com `tipo` presente e fora de `TIPOS_LOCALIZACAO`;
  PUT com `tipo` presente, diferente do gravado e fora da lista. Checado **antes** de qualquer escrita (inclusive antes
  do ramo de reativação do POST).
- PUT com `tipo` ausente (`undefined`) **preserva** o gravado. `null` ou `''` no PUT = `Almoxarifado` (como hoje).
- O resto do contrato das Etapas 52/54/55 não muda (ordem: `Código obrigatório` primeiro, a recusa de tipo logo depois).

### `GET /api/almoxarifado/localizacoes/:id/aviso-area?material_id=` — nova (só `auth`, como a sugestão — B216)

- 200 `{ area: 'QUARENTENA'|'EXPEDICAO'|'SUCATA'|'DEVOLUCOES'|'MATERIAIS_CLIENTE'|null, aviso: string|null }`.
- `material_id` opcional; sem ele, `MATERIAIS_CLIENTE` devolve `aviso: null` (não dá para saber o dono).
- 404 `{ error: "Localização não encontrada" }`; 404 `{ error: "Material não encontrado" }` (material_id informado e
  inexistente). Localização inativa: responde normalmente (o motor é quem recusa destino inativo — Etapa 54).
- Frases literais (`⟨c⟩` = `codigo` da localização, `⟨m⟩` = `codigo` do material):
  - QUARENTENA: *"Localização ⟨c⟩ é área de quarentena/inspeção, mas guardar aqui não retém o material — ele continua
    disponível. Para reter, use Inspeções ou o bloqueio."*
  - EXPEDICAO: *"Localização ⟨c⟩ é área de expedição, mas a requisição não usa este endereço — a entrega baixa da
    origem separada, não daqui."*
  - SUCATA: *"Localização ⟨c⟩ é área de sucata, mas guardar aqui não sucateia — o material continua no estoque
    disponível até o sucateamento aprovado."*
  - DEVOLUCOES: *"Localização ⟨c⟩ é área de devoluções, mas guardar aqui não muda o estado do material — ele continua
    disponível."*
  - MATERIAIS_CLIENTE (material próprio): *"Localização ⟨c⟩ é área de materiais do cliente, e ⟨m⟩ é material
    próprio."*

### `GET /api/almoxarifado/materiais/:id/sugestao-localizacao` — formato inalterado (Etapa 53)

Muda só o conjunto (RN-06/RN-07). Ordem das vazias: para material de cliente, áreas de cliente primeiro; depois a regra
de almoxarifado da padrão (como hoje).

### Rotas que não mudam

O motor de endereço (`motivoRecusaEndereco`, `validarEnderecoExplicito`, destino inativo recusado, padrão inativa
impedida na origem — Etapas 51–56); retenções como colunas; `POST /movimentacoes/v2`, `/transferencias`,
`/devolucoes`, `/sobras/*` — mesmo payload e mesmas recusas. `POST /sucateamentos/:id/aprovar-almoxarifado` e
`/aprovar-gestao` (`extended.js:1418`, `:1424` — a `SUCATA` sai quando a **segunda** perna fecha o claim em `APROVADO`,
`scrapDisposalService.js:390-394`) — mesmo payload e respostas; muda só a origem gravada no livro (RN-08). Os testes da
RN-08 aprovam **as duas pernas**, em ordens diferentes, com usuários distintos.

## Tasks

Ordem topológica: T1 → T2 → T3 (tronco, sequenciais); T4 e T5 (galhos de cliente, paralelos entre si, depois de T1/T2);
T6 (integração) depois de tudo; T7 fechamento.

- [x] **T1 (tronco) — registro e cadastro.** *Feita (2026-10-01; hash no commit "Etapa 68 T1"): 12 cenários
  em `localizacaoAreasEspeciais.api.test.js`, vermelhos antes da implementação (7 de 12). Controle positivo, cada um
  vermelho no cenário nomeado: POST sem validação → "sem acento" e "reativação" (2); validação só no POST → "PUT que
  MUDA" e "ordem" (2); legado recusado igual → "legado … MESMO tipo" (1); PUT `tipo || 'Almoxarifado'` de volta →
  "PUT sem tipo preserva" (1). Divergência do texto: `descricao` da SUCATA na revisão da Fase 2 ("baixa daqui quando o
  saldo aqui cobre o sucateamento inteiro"); a de EXPEDICAO ficou a do contrato (já não diz "não daqui").*
  Texto original: `schema.js`: `TIPOS_LOCALIZACAO` + 2, `AREAS_ESPECIAIS` exportado;
  `/meta/tipos-material` com `areas_especiais`; POST/PUT de localização com RN-02/RN-03 (validação antes de qualquer
  escrita, incluindo o ramo de reativação em `routes/almoxarifado.js:1990`; PUT sem `tipo` preserva — trocar o
  `tipo || 'Almoxarifado'` do `:2115` por "ausente → `current.tipo`"). Teste novo
  `server/tests/api/localizacaoAreasEspeciais.api.test.js` (RN-01..RN-03, entrando **pela rota**). Controle positivo:
  tirar a validação do POST; validar só o POST (o PUT para fora passa); recusar o legado igual (o PUT do mesmo tipo
  esquisito tem de cair); voltar o `|| 'Almoxarifado'` no PUT — cada uma vermelha num cenário nomeado.
- [x] **T2 (tronco) — aviso e sugestão.** *Feita (2026-10-01; T1 = `14cc17a`; hash da T2 no commit "Etapa 68 T2").
  `stockService`: `areaEspecialDe(tipo)`, `resolverAreaEfetiva(porId, id)` (subida pelo `parent_id` com guarda de
  ciclo), `carregarArvoreLocalizacoes(db)`, `areaEfetivaDaLocalizacao(db, id)` e `avisoAreaEspecial(loc, material)`
  (pura; `loc.area_especial`, quando presente, vale sobre o `tipo` da linha). Rota `GET /localizacoes/:id/aviso-area`
  em `extended.js` (só `auth`). Sugestão: `sugerivelComoVaga` nos caminhos "já tem" e "vazia" (a `PADRAO` continua
  com o `sugerivel` de antes) e UMA ordenação por chave composta. Testes: +6 no bloco T2 de
  `localizacaoAreasEspeciais.api.test.js` (18 no arquivo) e +6 em `sugestaoLocalizacao.api.test.js` ((16)–(21); os 15
  da Etapa 53 verdes, inclusive a invariante). RN-05 passou de primeira (é regressão: nada muda no motor) — controle
  positivo dela abaixo. Sabotagens, cada uma vermelha no cenário nomeado: sem exceção do cliente → (19)(20); filtro
  aplicado na PADRAO → (18); aviso de cliente também para material de cliente → RN-04 serviço e rota-cliente; frase
  trocada → RN-04 serviço e rota; subida pela árvore desligada → "área EFETIVA" (aviso) e (16)(17) (sugestão); guarda
  de ciclo tirada → o arquivo TRAVA (timeout 120 s, rc 124 — o ciclo é o que a guarda impede); chaves da ordenação
  invertidas → (19); aviso virando recusa no `motivoRecusaEndereco` → RN-05. Divergência: a frase EXPEDICAO é a revista
  na Fase 2 (sem "não daqui"); `material_id` não numérico → 404 "Material não encontrado" (decisão reversível, letra B:
  tratado como inexistente, não como 400 de formato).*
  Texto original: `stockService.avisoAreaEspecial(loc, material)` (pura, ao lado de
  `motivoRecusaEndereco`, exportada) + `areaEspecialDe(tipo)`; rota `GET /localizacoes/:id/aviso-area` (em
  `extended.js`, perto da sugestão); `sugerirLocalizacaoEntrada` com RN-06/RN-07 (no `sugerivel` dos dois caminhos
  "já tem" e "vazia"; **não** na `PADRAO`). Testes no mesmo arquivo da T1 (bloco "aviso") e **estender**
  `sugestaoLocalizacao.api.test.js` com os cenários de área — inclusive a invariante da 53 ("toda sugestão é aceita
  numa ENTRADA real") continuando verde. RN-05 pela rota (`/movimentacoes/v2` ENTRADA e `/transferencias`) com o Mapa
  conferido. Controle positivo: tirar a exceção do cliente (RN-07 cai), aplicar o filtro também na PADRAO (RN-06
  metade positiva cai), devolver o aviso de cliente para material de cliente, trocar uma frase.
- [x] **T3 (tronco) — sucateamento baixa da área de sucata** *Feita (2026-10-01; T2 = `d94dc24`; hash da T3 no commit
  "Etapa 68 T3"), pelo D6 REVISTO: `origemAreaDeSucata(db, material, qtd)` em `scrapDisposalService.js` (localização
  ativa, não bloqueada, área EFETIVA = SUCATA, saldo sem lote que cobre a quantidade INTEIRA; maior saldo, empate menor
  id), resolvida dentro do `try` da segunda perna e mandada com `origemEstrita: true`; senão nada muda. Teste
  `sucateamentoAreaSucata.api.test.js` — 10 cenários (9 pela rota, pernas em ordens diferentes e 3 usuários
  distintos; 1 pelo serviço), 4 vermelhos antes da implementação; os 6 que passaram de primeira são as metades "como
  hoje" (sem área, bloqueada, parcial + estorno, P bloqueada + parcial, inativa, com lote) e cada um tem sabotagem
  abaixo. Sabotagens: sem filtro de bloqueada → "BLOQUEADA" toma o 400 do motor (a aprovação travaria); sem
  `ativo = 1` → "INATIVA"; `ORDER BY q ASC` e desempate por maior id → "duas áreas"; sem a checagem "cobre" → "NÃO
  cobre" toma o 400 do `origemEstrita` + "P bloqueada" + "espalhado em duas"; sem "cobre" E sem `origemEstrita` → o
  defeito da sonda68-d6 volta (livro com origem S, estorno joga em S; P bloqueada drenada por S); área efetiva
  desligada → "posição Box". **Divergência:** a sabotagem "aplicar também com lote" só no chamador fica VERDE — a
  consulta já filtra `lote_id IS NULL`, as duas camadas são redundantes; tirando as duas, "COM lote" fica vermelho.
  `origemEstrita` sozinho (com "cobre" intacto) não é distinguível sem corrida — é a defesa contra o saldo de S mudar
  entre a consulta e o claim.* Texto original: (`scrapDisposalService.js:394-410`): resolve a origem
  pela D6 antes do `registrarMovimentacao` (só sem `lote_id`). Teste `server/tests/api/sucateamentoAreaSucata.api.test.js`
  (RN-08, quatro cenários, **pela rota** de solicitar/aprovar, e um **pelo serviço**). Controle positivo: sem o filtro
  de bloqueada (a aprovação toma 400 do motor — prova que o filtro é o que impede o travamento); sem `ativo = 1`;
  `ORDER BY` invertido com duas áreas; aplicar também com lote.
- [x] **T4 (galho, cliente) — aviso em Movimentações** *Feita (2026-10-01): `0d44607`. Bloco "Etapa 68" de
  `MovimentacoesAlmoxarifado.test.js`, 7 cenários (5 vermelhos antes); 8 sabotagens vermelhas no cenário nomeado (ver o
  corpo do commit). Decidido: sem material não busca.* Texto original (`MovimentacoesAlmoxarifado.js:996-1040`): quando
  `TIPOS_COM_DESTINO` e há destino escolhido, chama `/localizacoes/:id/aviso-area?material_id=` e mostra
  `data-testid="aviso-area-especial"` com o `aviso` literal do servidor; guarda `cancelado` contra resposta atrasada
  (padrão da Etapa 53); trocar destino ou material refaz; falha da rota = sem aviso (falha aberta, como
  `minhas-permissoes`). Não bloqueia o envio. Testes no bloco "Etapa 68" de `MovimentacoesAlmoxarifado.test.js` (mock
  só na fronteira HTTP, com as frases do contrato).
- [x] **T5 (galho, cliente) — Mapa e assistente.** *Feita (2026-10-01): `fe4e24f`. `MapaAreasEspeciais.test.js` (7) e
  bloco "Etapa 68" em `LocalizacaoProximoCodigo.test.js` (5); sabotagens no corpo do commit (subida pela árvore,
  guarda de ciclo, ausência de `areas_especiais` tolerada, raiz sem as áreas, filho herdando o rótulo).* Texto
  original: `MapaLocalizacoesAlmoxarifado.js`: ícone/cor para `Área de sucata`
  e `Área de devoluções`; no painel da selecionada, a `descricao` de `areas_especiais` (`data-testid="descricao-area"`).
  `ConfiguracoesAlmoxarifado.js`: o select de raiz do assistente oferece também os `tipo` de `areas_especiais`. Testes:
  `MapaAreasEspeciais.test.js` (novo) e um cenário no teste do assistente (`LocalizacaoProximoCodigo.test.js` já monta
  a tela).
- [x] **T6 (integração, cruza T1–T3) — `server/tests/api/areasEspeciaisIntegracao.api.test.js`.** *Feita
  (2026-10-01; hash no commit "Etapa 68 T6"). 8 cenários, TUDO pela rota (o banco não é tocado): (1) `POST
  /localizacoes` cria S (`Área de sucata`, raiz), F (`Prateleira` com `parent_id` = S) e P; o meta traz
  `areas_especiais` com o tipo de S; (2) material pela rota com padrão P — a sugestão não traz S nem F (as duas
  estavam em `/localizacoes/vazias`, conferido) e traz P; (3) ENTRADA 10 em P; `aviso-area` de F = frase literal de
  SUCATA com o código de F (área EFETIVA), de P = nulls; (4) `/transferencias` 4 P→S → 201, Mapa e
  `/estoque/:id/saldos` com S:4/P:6; (5) sucateamento de 4, pernas gestão → almoxarifado → `GET /movimentacoes` com
  a SUCATA de origem S, S com 0 no Mapa e de volta em `/vazias`, P com 6; (6) o mesmo pela posição F, pernas
  almoxarifado → gestão com outros dois usuários → origem F (e a sugestão, com saldo em F, não traz F no "já tem");
  (7) parcial: S:2 não cobre 4 → origem nula, S:2, P:4 (como hoje); (8) PUT de S sem `tipo` mantém a área (aviso
  continua SUCATA, sugestão continua sem S/F); PUT `'Area de sucata'` → 400 literal, nada gravado. Passou de primeira
  (é integração de peças já testadas) — controle positivo, 6 sabotagens (perl, âncora contada == 1, backup
  `$TMP/e68t6-*`, restauro por cópia com md5 conferido), cada uma vermelha no cenário nomeado: T3 desligada (origem
  sempre nula) → (5)(6); subida pela árvore desligada → (2)(3)(6); filtro de área da sugestão tirado → (2)(6);
  PUT voltando a `tipo || 'Almoxarifado'` → (8); checagem "cobre" tirada → (7) (a 2ª perna toma o 400 do
  `origemEstrita`); validação de tipo do PUT tirada → (8). **Divergências do texto:** (a) o "já tem" de S no (4)
  não prova o filtro de área — S tem filho ativo e o filtro de contêiner (Etapa 53) já a tira; por isso o "já tem"
  da área é provado pela posição F no (6) (a primeira rodada da sabotagem do filtro mostrou isso); (b) o "(7) pelo
  serviço" não foi repetido aqui — o pedido da T6 foi tudo pela rota, e o caminho do serviço já está em
  `sucateamentoAreaSucata.api.test.js` (cenário "SERVICO"); (c) a cadeia quarentena → inspeção → sucata **não** é
  testada nem prometida (quebrada pelo bloqueio, Fase 2). Nenhum defeito de produção revelado.* Texto original: Um fluxo pela
  rota: (1) `POST /localizacoes` cria `Área de sucata` S e `Prateleira` P vazias; (2) a sugestão de entrada do material
  traz P e não S; (3) ENTRADA de 10 em P; (4) `aviso-area` de S devolve a frase de sucata; (5) `/transferencias` de 4
  P→S é aceita (201); (6) Mapa: S com 4; (7) solicitar + aprovar as duas pernas do sucateamento de 4 → livro com
origem S; (8) Mapa: S
  vazia (sai das ocupadas, entra em `/localizacoes/vazias`), P com 6; (9) `PUT` de S sem `tipo` → continua `Área de
  sucata` e a sugestão continua sem ela. E o mesmo (7) **pelo serviço** (`scrapDisposalService`), porque o default de
  origem depende de quem chama o motor. Controle positivo: desligar a T3 derruba (8).
- [ ] **T7 — fechamento** (skill `fechar-etapa`): spec 02 (item `[x]` com os hashes e os cortes: em-terceiros fora
  por D7, select de endereço em Devoluções e aviso no recebimento como "falta"); **corrigir à vista**
  `15-retalhos-sucatas/README.md:67-69` (Surpresa 5) e `05-separacao-picking/README.md:63` (os tipos agora existem
  para expedição; "Aguardando retirada/Kit" continua não existindo); manual `:342` (o tipo passa a ter semântica de
  aviso e sugestão — **e continua sem reter nada**); mapa de status; guia; novidades (B284–B292, A32, C se a Fase 5
  achar); retro.

## Letra A — consulta para produção (A32)

```sql
-- (a) localizações por tipo (o que já existe de área e de tipo fora da lista)
SELECT COALESCE(tipo, '(vazio)') AS tipo, ativo, COUNT(*) AS n
  FROM localizacoes_almoxarifado GROUP BY 1, 2 ORDER BY 1, 2;

-- (b) tipos fora da lista nova (continuam editáveis; só não ganham semântica)
SELECT id, codigo, tipo, ativo FROM localizacoes_almoxarifado
 WHERE COALESCE(tipo, '') NOT IN ('Almoxarifado','Rua','Prateleira','Gaveta','Box','Área externa','Área de corte',
   'Área de montagem','Área de elétrica','Área de pintura','Área de expedição','Área de materiais do cliente',
   'Área de quarentena/inspeção','Área de sucata','Área de devoluções');

-- (c) saldo em área especial hoje, separando material próprio de material de cliente
SELECT l.tipo, l.codigo AS endereco, m.codigo AS material,
       CASE WHEN m.proprietario_cliente_id IS NULL THEN 'próprio' ELSE 'cliente' END AS dono,
       SUM(s.quantidade) AS saldo
  FROM estoque_saldo_almoxarifado s
  JOIN localizacoes_almoxarifado l ON l.id = s.localizacao_id
  JOIN materiais_almoxarifado m ON m.id = s.material_id
 WHERE l.tipo IN ('Área de expedição','Área de materiais do cliente','Área de quarentena/inspeção')
 GROUP BY l.id, m.id HAVING SUM(s.quantidade) <> 0 ORDER BY l.tipo, l.codigo;

-- (d) materiais ativos cuja localização padrão é área especial (a sugestão continua propondo a padrão)
SELECT m.codigo, l.codigo AS padrao, l.tipo
  FROM materiais_almoxarifado m JOIN localizacoes_almoxarifado l ON l.id = m.localizacao_padrao_id
 WHERE m.ativo = 1 AND l.tipo IN ('Área de expedição','Área de materiais do cliente','Área de quarentena/inspeção');
```

**Como ler:** (a)/(b)/(c)/(d) vazias ou sem área — nada a fazer. (b) com linhas — esses endereços continuam
funcionando e editáveis (RN-03); para ganharem semântica, troque o tipo no Editar. (c) com material **próprio** em
área de cliente, ou qualquer material em área de quarentena/expedição — o sistema passa a **avisar** quando entrar mais
e deixa de sugerir a área; nada é recusado nem movido. (d) com linhas — a entrada sem destino continua indo para lá
(D1/D5); troque a padrão no cadastro se não é o lugar de guarda. Prévia na cópia local (2026-09-03): (a) só
`Almoxarifado`/`Prateleira` inativas e `Rua` ativas; (b), (c), (d) vazias.

## O que fica de fora (vira "falta" ou "fora por decisão" na spec 02, com o motivo)

- **Em-terceiros como localização** — fora por decisão (D7): não há endereço físico; a remessa é retenção.
- **Recusa por área no motor** — fora por decisão (D1, B217). Reversível: o helper do aviso vira `throw`.
- **Select de endereço na tela de Devoluções** (com a área de devoluções/quarentena como sugestão) — falta: a API já
  aceita `localizacao_id`; é tela da feature de devoluções.
- **Aviso no processamento do recebimento** (janela da Etapa 57) — falta (D8).
- **Staging de expedição** (transferir o separado para "Aguardando retirada"/kit e a entrega baixar de lá) — falta da
  feature 05 (`05/README.md:63`), que depende da lista de separação como entidade.
- **Área física retendo saldo** (o material na área de quarentena fora do disponível) — fora: contradiz "retenções
  como colunas do material" (contrato que não se reabre); a retenção é a inspeção/bloqueio.
- **Origem da área de sucata para material com lote** — como hoje (B204/C72).
- **Áreas de retalhos, não conformes, reservados por projeto, kits** (spec 3.1) — não estão no item da 02 (D3).

## Pontos de atenção para a Fase 2 (revisor: siga cada RN até o último gesto)

- **RN-03 × Mover e Editar da tela**: os dois PUTs mandam o `tipo` atual — confirmar que uma localização legada com
  tipo esquisito continua movível (o Mover manda `moverLoc.tipo || 'Almoxarifado'`, `ConfiguracoesAlmoxarifado.js:1988`:
  com tipo legado preenchido manda o mesmo; com `NULL` manda `Almoxarifado`, que está na lista).
- **RN-08 × aprovação**: a origem resolvida tem de ser uma que o motor **aceita** como origem (não bloqueada; inativa
  é aceita pela Etapa 54, mas a D6 filtra `ativo = 1`). Seguir: solicitar → (área bloqueada entre solicitar e aprovar)
  → aprovar não pode tomar 400. E a confirmação por leitura (Etapa 56) não entra no sucateamento.
- **RN-06 × Etapa 53**: a invariante "toda sugestão é aceita numa ENTRADA real" e os 15 cenários da 53 continuam
  verdes; o limite de 10 do "já tem" passa a contar só as não-área.
- **RN-04 × tela**: o aviso só aparece com destino escolhido; a entrada **sem** destino que cai numa padrão-área não
  avisa (o aviso da padrão é o da Etapa 53) — declarar se a Fase 2 achar que deveria.
- `extended.js:851` (`/transferencias`) passa o body cru ao motor — nada muda, mas a RN-05 entra por ali também.

## Próxima tarefa detalhada

Fase 2 desta etapa: feita (secao abaixo). T1-T6 feitas (`14cc17a`, `d94dc24`, `e79d8b5`, `0d44607`, `fe4e24f`, T6). Fase 5 (revisao adversarial + fix-round): feita (secao abaixo; `588f62b`, `dfc99eb`). **Proxima: T7 — fechamento** pela skill `fechar-etapa`, com a lista do item T7 acima **mais a letra B da Fase 5** (ancestral inativo encerra a subida da area efetiva no servidor, alinhado ao Mapa; descartado: o Mapa subir pelo inativo); o teste de integracao da T6 e a prova citavel no guia (roteiro: criar area de sucata + posicao, transferir, sucatear, ver a area vazia no Mapa). Pontos de atencao: o guia **nao** promete quarentena -> inspecao -> sucata (letra D) e declara que outras saidas (PERDA, "Sai de") ainda drenam a area de sucata (letra C da Fase 2).

## Fase 5 — revisão adversarial do código: 0 críticos, 2 importantes (teste), 1 menor (corrigido) — fix-round feito

Sondas da revisão no scratchpad da sessão (`sonda68r-outraarea.js`, `sonda68r-corrida.js`,
`sonda68r-corrida-estorno.js`, `sonda68r-paiinativo.js`, preload `sonda68r-sabota.js`).

- [x] **IMPORTANTE (teste) — a suíte não sabia distinguir sucata de outra área** (`588f62b`). Trocar
  `if (area && area.chave === 'SUCATA')` por `if (area)` em `origemAreaDeSucata` passava as 10 da
  `sucateamentoAreaSucata`. Novo negativo: expedição cobre (EXP:8, P:3, sucata de 3) → origem nula, EXP=8, P=0.
  Controle positivo: a sabotagem derruba **só** esse teste (11/12, "a expedicao virou origem da sucata").
- [x] **IMPORTANTE (teste) — `origemEstrita` sem teste** (`588f62b`). A corrida é injetada trocando
  `stock.carregarArvoreLocalizacoes` (único ponto entre a consulta de saldos e o motor) por uma que transfere S→X
  antes de devolver: a 2ª perna toma o 400 literal ("O saldo em <S> (0) não cobre a quantidade (4) — a saída
  tiraria de outros endereços"), a assinatura é compensada (SOLICITADO, `aprovador_almox_id` nulo, nenhuma SUCATA no
  livro), a retentativa baixa de P sem origem e o estorno devolve para P. Controle positivo: `origemEstrita: false`
  derruba só esse teste (11/12, "a baixa passou com a origem vazia" — o livro gravaria origem S com material de P).
- [x] **MENOR (corrigido) — servidor e Mapa divergiam com área-pai INATIVA** (`dfc99eb`). O servidor subia para o pai
  desativado (o filho seguia "sucata" no aviso, fora da sugestão e virava origem do sucateamento); o Mapa, que só lista
  ativas, parava. **Decisão (reversível, letra B na T7): ancestral INATIVO encerra a subida no servidor** — uma área
  desativada não dá semântica a ninguém; a PRÓPRIA localização vale pelo tipo mesmo inativa (o `aviso-area` de uma
  inativa continua respondendo a área — Etapa 54). Descartado: o cliente passar a subir pelo pai inativo (o Mapa
  teria de receber as inativas só para isso, e a área desativada continuaria pesando em sugestão e sucata).
  `carregarArvoreLocalizacoes` passa a ler `ativo`; `resolverAreaEfetiva` para quando o próximo ancestral tem
  `ativo` ≠ 1 (`ativo` ausente no Map conta como ativo). O comentário do Mapa ("mesma regra do servidor") volta a ser
  verdade e diz desde quando. Teste `(9)` da `areasEspeciaisIntegracao`, pela rota: com o pai ativo o filho é sucata
  (controle), `DELETE` da área → aviso `{ area: null, aviso: null }`, sugestão propõe o filho como `JA_TEM_O_MATERIAL`,
  sucateamento de 5 sai sem origem (P 10→5, filho intacto com 5). Controles positivos: tirar a parada (S3) e tirar
  `ativo` da carga da árvore (S4) derrubam o (9); parar também na própria inativa (S5) derruba "inativos respondem
  normal" da `localizacaoAreasEspeciais`.
- Verificacao do fix-round: `test:api` 253/253 arquivos OK; `test:almoxarifado` 42/0; `test:validation` 4/0; `test:safealter` 3/0;
  `test:sqlite` OK; cliente 74 suites / 1105 testes; build `CI=true` OK.

## Fase 2 — revisão do plano: 0 críticos, 5 importantes, 9 menores → plano revisto (vale sobre o texto acima)

- **IMPORTANTE (D6, sonda `sonda68-d6.js`) — dreno parcial grava origem errada e o estorno joga material bom na
  sucata.** `SUCATA` com origem S passa pelo `claimSaldoSemLote(S)`, que drena S e depois as outras linhas (não é
  `origemEstrita`): S:4 + P:10, sucata de 6 → livro diz "origem S" com 2 vindos de P; o estorno devolve 6 para S.
  → **D6 revisto: a área de sucata (efetiva — ver abaixo) só vira origem quando o saldo NELA cobre a quantidade
  inteira, e então com `origemEstrita`**; senão, o comportamento de hoje (sem origem → padrão). Sem dreno parcial, sem
  divisão em dois movimentos (descartado: mais regra no motor por um caso raro).
- **IMPORTANTE (D6, sonda `sonda68-bloq.js`) — D6 desligava a checagem de bloqueio da padrão** (validava S no lugar de
  P). Com o D6 revisto (S só quando cobre tudo, estrita), a padrão bloqueada continua recusando como hoje quando a
  sucata vem dela. Teste: "P bloqueada + S parcial → 400 de hoje".
- **IMPORTANTE — posições dentro da área não eram a área** (o assistente grava `tipo` 'Prateleira' nos filhos). →
  **área efetiva = o tipo da própria localização se for área, senão o do ancestral mais próximo que for área**
  (subida pelo `parent_id`, com guarda de ciclo). Vale para o aviso, a sugestão (D5) e o D6 (o saldo "na área" de
  sucata soma a área e as posições abaixo? → NÃO: o D6 usa só UMA localização-origem; com saldo em mais de uma
  posição da área, nenhuma cobre sozinha → comportamento de hoje. Declarado). Voltar da raiz ao filho no assistente
  não carrega o tipo de área para o filho (o filho herda pela árvore, não pelo rótulo).
- **IMPORTANTE (declarado, letra C/D) — as outras saídas drenam a área de sucata**: PERDA/entrega sem origem e o "Sai
  de" (alimentado por `/estoque/:id/saldos`) oferecem/drenam S. Tirar as áreas dos drenos automáticos mexe no motor
  inteiro — **fora**, declarado como furo de operação (C) e como "falta" da 02/15.
- **IMPORTANTE (declarado) — quarentena → inspeção → sucata quebra no bloqueio de coluna**: material reprovado fica
  BLOQUEADO e o `solicitar` do sucateamento recusa "Saldo disponivel insuficiente para sucatear … disponivel 0". É
  anterior à etapa; a T6 e o guia **não prometem** essa cadeia. Letra D + falta da 19.
- Menores: recusa de tipo no PUT logo **depois do 404 e antes da guarda de desativação**; POST com `tipo` `''`/`null` =
  'Almoxarifado' (como hoje), só tipo PRESENTE e fora da lista recusa; `aviso-area`: 404 da localização primeiro, depois
  404 do material, material inativo responde normal; frase da EXPEDICAO sem "não daqui" (o "Sai de" pode ser a área) —
  T1 reescreve; `descricao` da SUCATA sem "baixa daqui primeiro" (diz "quando o saldo aqui cobre o sucateamento
  inteiro"); D6 resolvido **dentro do `try`** do `scrapDisposalService` (erro de banco ainda compensa a assinatura);
  material que permite negativo: sem mudança (o D6 não usa área quando não cobre); D5 com UMA ordenação por chave
  composta (dois `sort` em cadeia desfazem um ao outro); `sugerivel` separado por caminho (a padrão não é filtrada);
  Mapa/Configurações toleram `areas_especiais` ausente (mocks antigos). T3 depende só da T1.
