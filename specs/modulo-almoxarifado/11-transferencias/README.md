# 11 — Transferências Internas

> **Status:** 🟢 — **Etapa 7 entregue (2026-08-12, `29524fc..0722bfd`)**: a transferência tem tela
> (dentro de Movimentações), exige lote em material controlado e está declarada em `REGRAS_VINCULO`.
> O fluxo "em trânsito" foi **CORTADO por decisão do cliente** — não é pendência, ver abaixo. ·
> **Spec original:** seção 15
> **Última atualização:** 2026-08-12 — Etapa 7: `exigeLote` alcançando o ramo próprio do motor
> (`5a1e188`), `TRANSFERENCIA: { vinculo: 'nenhum' }` (`5a1e188`) e o tipo no formulário de
> Movimentações com origem, destino e seletor de lote (`f8a3e34`, badge corrigido em `d117dc2`)
> Antes: 2026-08-11 — auditoria de cauda: registrado que a TRANSFERENCIA move a linha do lote (Etapa 6) e nomeadas duas lacunas: rota sem `exigeLote` e tipo fora de `REGRAS_VINCULO`

## Objetivo

**Objetivo original da spec 15:** transferências entre almoxarifados/endereços com fluxo
solicitação → aprovação → retirada → **em trânsito** → recebimento → confirmação.

**Objetivo revisado (2026-08-12, decisão do cliente):** mover material de um endereço para outro,
imediatamente e com rastro no livro. Sem máquina de estados — ver "O trânsito foi cortado" logo
abaixo.

## O trânsito foi CORTADO por decisão do cliente (2026-08-12) — não é pendência esquecida

A spec 15 pedia a máquina de estados `SOLICITADA → APROVADA → EM_TRANSITO → RECEBIDA → CONFIRMADA /
CANCELADA`, com localização virtual onde o saldo não é disponível nem na origem nem no destino.

**Resposta do cliente: a transferência é imediata.** Os almoxarifados são áreas físicas do mesmo
site (regra já fixada no `CLAUDE.md` e na feature 02) — o cliente tem **uma filial só**. Alguém pega
a caixa e leva na hora; não existe janela de tempo em que a caixa esteja "a caminho" e precise ser
contabilizada em lugar nenhum. A transferência continua **atômica origem→destino**.

**Isto é corte deliberado, não pendência esquecida.** Se um dia o cliente passar a ter obra externa
ou um segundo prédio, o item volta com justificativa nova — e aí a máquina de estados faz sentido,
porque passa a existir de fato um material que saiu e ainda não chegou. Quem ler o checklist abaixo
não pode concluir que o trânsito ficou por descuido: ele foi perguntado, respondido e cortado.

**Não confundir com remessa a terceiros.** Material que sai para um terceiro e volta (feature 14) é
outro assunto: tem documento, prazo e propriedade diferente. Se a Etapa 8 trouxer esse ciclo, ele
**não** é o trânsito cortado aqui — não ressuscitar a máquina de estados da spec 15 por semelhança.

## O que já existe

- `POST /transferencias` (`extended.js`, permissão `movimentar`) — via `stockService`, move saldo
  entre localizações imediatamente (origem→destino atômico). **Desde a Etapa 7 declara
  `{ exigeLote: true }`** no 4º argumento (`5a1e188`).
- Movimentação com `localizacao_origem_id`/`localizacao_destino_id`, também pela rota
  `POST /movimentacoes/v2` — que é por onde a **tela** posta (`TRANSFERENCIA` já era aceita pelo
  `MovimentacaoSchema`; nenhuma mudança de schema foi necessária).
- **Desde a Etapa 6 (registrado 2026-08-11):** `TRANSFERENCIA` move a **linha do lote** entre
  localizações em `estoque_saldo_almoxarifado` (`stockService`, com claim no WHERE para
  atomicidade) — a spec descrevia só "move saldo entre localizações", sem a dimensão do lote.
- **Desde a Etapa 7:** `TRANSFERENCIA` é um tipo do formulário de **Movimentações**, mostrando
  localização de origem **e** de destino mais o seletor de lote (`f8a3e34`).

### A armadilha que a Etapa 7 desarmou (registrar, para ninguém reintroduzir)

`TRANSFERENCIA` **não está** em `tiposEntrada` nem em `tiposSaida` — é um **ramo próprio** do
`stockService`. A guarda de `exigeLote` só disparava para esses dois conjuntos, então **declarar
`exigeLote: true` na rota não bastava**: o teste continuava passando sem lote e quem lesse o
resultado concluiria errado que a guarda funcionava. Foi preciso citar `TRANSFERENCIA`
explicitamente na condição do `if` (`5a1e188`).

A mesma mudança **não** foi feita em `serieObrigatoria`, de propósito — é o que torna a decisão 9
(série fora de escopo) verdadeira sem código, e há teste que registra o fato.

## Checklist

### Backend
- [~] **CORTADO por decisão do cliente (2026-08-12)** — Entidade `transferencias_almoxarifado` com status (SOLICITADA → APROVADA → EM_TRANSITO → RECEBIDA → CONFIRMADA / CANCELADA). A transferência é imediata: site único, alguém pega a caixa e leva na hora
- [~] **CORTADO por decisão do cliente (2026-08-12)** — Localização virtual "Em trânsito": não existe janela em que o material esteja a caminho
- [~] **CORTADO por decisão do cliente (2026-08-12)** — Recebimento no destino com conferência (quantidade recebida ≠ enviada → divergência): sem trânsito não há recebimento a conferir
- [~] **CORTADO por decisão do cliente (2026-08-12)** — Aprovação de transferência (feature 06): mover material de prateleira é rotina, não decisão que precise de aprovador
- [~] **CORTADO por decisão do cliente (2026-08-12)** — E-mail nas transferências relevantes (feature 19) · alerta "transferência não recebida" (feature 20): o alerta pressupõe trânsito, que não existe
- [ ] Destinos especiais (spec 15): produção, kit de projeto, quarentena, inspeção, expedição, sucata, reservado, estoque de cliente, terceiro — validar restrições por tipo de destino. **Continua aberto**, e é conteúdo da Etapa 8 (estoque de cliente/terceiro entra como **regra de destino**, não como tipo novo de movimento)
- [ ] Transferência entre almoxarifados como conceito próprio (depende da decisão multi-almoxarifado, feature 02) — hoje a transferência é entre **localizações**, e como almoxarifado é área física do mesmo site isso já cobre a operação real
- [x] Declarar `exigeLote` na rota `POST /transferencias` — **`5a1e188`** (Etapa 7, Task 2). Material com `controle_lote` passou a ter de citar de qual lote saiu. Exigiu estender a guarda no `stockService`, porque `TRANSFERENCIA` é ramo próprio (ver acima)
- [x] Incluir `TRANSFERENCIA` em `REGRAS_VINCULO` (`movementRules`) — **`5a1e188`** (Etapa 7, Task 2), com `{ vinculo: 'nenhum' }`. **Não exige nada, mas está declarado**: a ausência deixou de ser omissão e virou decisão escrita. Descartado exigir justificativa em toda transferência (mover material de prateleira é rotina, e quem é obrigado a justificar rotina escreve "ok") e exigir só quando muda de almoxarifado (mais regra para explicar e testar do que valor entregue). A tela tem campo de motivo **opcional**, que vai para o livro

### Frontend
- [x] Tela de transferências — **`f8a3e34`** (Etapa 7, Task 6), badge corrigido em **`d117dc2`**. **Entregue como tipo do formulário de Movimentações, não como tela dedicada**, e isso é decisão de design: a transferência *é* uma movimentação origem→destino, e o formulário já tinha os dois campos de localização e o seletor de lote — 90% dela já estava construída. Tela dedicada foi descartada por duplicar seletor de material, de localização e de lote
- [~] **CORTADO junto com o trânsito** — "receber" e "acompanhar em trânsito" na tela: não há o que receber nem o que acompanhar

## Comportamentos intencionais que têm teste (não são furos)

**Transferência NÃO checa status nem vencimento do lote** (decisão 8 do design da Etapa 7). Mover um
lote **bloqueado, reprovado ou vencido** de prateleira é **legítimo e permitido** — é exatamente
assim que ele vai parar na área de bloqueados. A guarda de status continua só na **saída**, que é
onde ela protege alguma coisa. Se alguém um dia achar que isto é um furo e "consertar", o teste
`transferencia de lote bloqueado e permitida (decisao 8)` explica que não é.

Na tela, isso aparece como: no tipo Transferência **todos** os lotes ficam selecionáveis, inclusive
bloqueado e vencido (`loteDisponivelParaTipo` devolve `true` para `TRANSFERENCIA`); numa Saída os
dois continuam desabilitados.

## Fora de escopo, declarado com o motivo

- **Série na transferência (decisão 9 da Etapa 7).** As séries guardam `localizacao_id`, mas movê-lo
  exigiria um seletor de séries na transferência e um caminho novo no motor — o **claim de série só
  existe para entrada e saída**. O `localizacao_id` da série é **informativo**; o saldo real vive em
  `estoque_saldo_almoxarifado`, que a transferência move corretamente. Consequência prática: depois
  de transferir um material serializado, a aba Séries pode mostrar a localização antiga. Não há
  perda de saldo nem de rastreabilidade da peça — só o endereço da série fica desatualizado.
  Isto vale **de graça** porque `serieObrigatoria` também exige `tiposEntrada || tiposSaida`: quem
  estender o `if` do `exigeLote` **não** pode copiar a mesma mudança para o `exigeSerie`.
- **Aprovação de transferência** (feature 06) — cortada junto com o trânsito.
- **E-mail e alerta "transferência não recebida"** (features 19/20) — pressupõem trânsito.

## Regras essenciais + testes de API exigidos

As linhas de trânsito, recebimento com conferência e cancelamento antes da retirada **saíram desta
tabela**: elas testavam a máquina de estados cortada. Não foram esquecidas — deixaram de existir.

| Regra | Teste | Estado |
|-------|-------|--------|
| Material com `controle_lote` não transfere sem citar o lote | `transferencia de material com controle de lote sem lote falha` — `transferenciaRegras.api.test.js` | ✅ `5a1e188` |
| O corpo da requisição **não** desliga a exigência de lote | `o corpo nao consegue desligar a exigencia de lote na transferencia` — mesmo arquivo | ✅ `5a1e188` |
| Transferência com lote move a linha do lote entre localizações, sem mexer no total do material | `transferencia com lote move a linha do lote entre localizacoes` — mesmo arquivo | ✅ `5a1e188` |
| Transferir mais que o saldo da origem falha, e a origem não é debitada | `transferencia acima do saldo da origem falha` — mesmo arquivo | ✅ `5a1e188` |
| Lote **bloqueado** pode ser transferido (decisão 8, intenção) | `transferencia de lote bloqueado e permitida (decisao 8)` — mesmo arquivo | ✅ `5a1e188` |
| Lote **vencido** pode ser transferido (decisão 8, intenção) | `transferencia de lote vencido e permitida (decisao 8)` — mesmo arquivo | ✅ `5a1e188` |
| Transferência não exige vínculo nem justificativa, e `REGRAS_VINCULO.TRANSFERENCIA` está declarada | `transferencia nao exige vinculo nem justificativa (decisao 5)` — mesmo arquivo | ✅ `5a1e188` |
| Material **sem** controle de lote continua transferindo sem lote (controle positivo da guarda) | `[controle positivo] material SEM controle de lote continua transferindo sem lote` — mesmo arquivo | ✅ `5a1e188` |
| Material com `controle_serie` **não** exige séries na transferência (decisão 9) | `transferencia de material com controle de serie nao exige series (decisao 9)` — mesmo arquivo | ✅ `5a1e188` |
| Transferência instantânea origem→destino continua atômica | `Transferência entre locais` — `tests/almoxarifado.test.js` (serviço) | ✅ pré-existente |

**Testes de tela** (`MovimentacoesAlmoxarifado.test.js`, `f8a3e34`): `Transferência é opção do
formulário e Devolução não é`; `Transferência mostra origem E destino e o seletor de lote`;
`Transferência NÃO mostra seletor de série (decisão 9)`; `na Transferência todos os lotes ficam
selecionáveis, inclusive bloqueado e vencido` com o controle positivo `[controle positivo] na Saída
o lote bloqueado e o vencido continuam desabilitados`; `Transferência posta origem, destino e lote
no payload`.

## Dependências

- 03 (motor) · 02 (localizações/multi-almoxarifado).
- 06 (aprovação) **deixou de ser dependência** com o corte do trânsito.
