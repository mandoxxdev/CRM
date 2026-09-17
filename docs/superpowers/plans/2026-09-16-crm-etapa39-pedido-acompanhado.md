# Etapa 39 — O pedido de compra passa a ser ACOMPANHADO: prazo, atraso e os resíduos da 38: implementação

> **For agentic workers:** REQUIRED SUB-SKILL: use `superpowers:subagent-driven-development` para
> executar este plano task a task. Os passos usam checkbox (`- [ ]`). Antes da primeira task, leia o
> design inteiro (`docs/superpowers/specs/2026-09-16-crm-etapa39-pedido-acompanhado-design.md`, D1–D10,
> RN-D01…RN-D14, R1–R12) e a seção 11 dele ("O que a Fase 0 mediu e este design corrigiu").
> **Onde a medição e este plano divergirem, vale a medição** — e onde este plano decidiu contra o
> design, está escrito com **(divergência do design)**, com o motivo e o que foi descartado.
>
> **Convenção `(Fase 2)`:** marcas assim são emendas da revisão do plano (Fase 2 da skill
> `desenvolver-etapa-almoxarifado`), escritas **depois** do texto original e **sem apagá-lo**. Este
> arquivo nasce sem nenhuma; o revisor fresco acrescenta as dele no lugar, marcadas.

**Goal:** que o comprador **veja** que um pedido passou do prazo prometido, **filtre** por isso,
**exporte** isso e **receba e-mail** quando acontecer — e que as datas da aba Compras parem de
aparecer **um dia antes** do que está no banco. Medido: `WHERE previsao_entrega < …` **não existe em
código executável** em lugar nenhum (só em dois comentários que prometem esta etapa,
`pedidoCompraService.js:140`, `compras/schemas.js:79`), e `formatDate` (`client/src/components/
Compras.js:91-94`) é `new Date(date).toLocaleDateString('pt-BR')` — que em `America/Sao_Paulo`
renderiza `2026-09-16` como **`15/09/2026`**. Como a **exportação usa a mesma função** (`:161-162`) e
a importação lê `DD/MM/AAAA` (`pedidoCompraService.js:604-605`), **exportar e reimportar o próprio
Excel do CRM move as duas datas um dia para trás** — a promessa do F6 da Etapa 38 (`ba6278e`)
cumprida na estrutura e falha no valor. **Este é o "defeito escapado" que a retro nº 4 do plano da 38
deixou em branco**, e o fechamento desta etapa o preenche com o hash daqui.

**Architecture:** três fatias em ordem, e nada além. **A0** conserta as datas: `formatDate` passa a
formatar a **string** `AAAA-MM-DD` por `split('-')`, sem `new Date`, valendo para exibição **e**
export (é a mesma função); `hojeISO` do formulário (`PedidoCompraForm.js:85`) vira **local**. **A1**
deriva o atraso **na leitura**: `GET /api/compras/pedidos` ganha `atrasado`/`dias_atraso` calculados
em JS por **uma** função exportada (`derivarAtraso`), mais o filtro `?atrasados=1`, o badge e o
checkbox na aba. **Nenhuma coluna nova, nenhuma migration, nenhum `UPDATE`.** **A2** acrescenta **uma
entrada** em `ALERT_REGISTRY` (`PEDIDO_COMPRA_ATRASADO`), que liga varredura diária, dedupe, canal e
central de uma vez (`alertRegistry.js:6-7`), consumindo a **mesma** `derivarAtraso` por **require
lazy** — a régua do alerta e a da tela são uma só (RN-D11).

**Tech Stack:** Express + SQLite (`server/`); React CRA (`client/`) com testes por `createRoot` +
`act` — ⚠️ `@testing-library/react` **não está instalado** nesta base; **Jest 27.5.1** (medido:
`require('jest/package.json').version`), o que importa para os fake timers (ver T2). A suíte do
cliente roda em **`America/Sao_Paulo`** fixado por `client/jest.globalSetup.js` **antes de o Jest
forkar os workers** — `process.env.TZ` no topo de um arquivo de teste é **no-op** nesta base
(medição escrita no próprio `jest.globalSetup.js`, achado A1 da Etapa 22).

**Spec:** `docs/superpowers/specs/2026-09-16-crm-etapa39-pedido-acompanhado-design.md` — leia junto:
as **RN-D01…RN-D14**, as **dez decisões** (D1–D10) com o descartado de cada uma, os **12 riscos**
(R1–R12, incluindo o **R9b**) e as **nove medições novas**.

---

## Global Constraints

Copiadas do design (seções 3, 5, 8, 10 e 11) e do `CLAUDE.md`. **Valem em todas as tasks.**

- **O módulo CORE Compras tem UMA camada de autorização, não duas.** As rotas tocadas herdam **só**
  `authenticateToken` + `checkModulePermission('compras')` (B101 da Etapa 38) — **nenhum
  `requirePermission`, nenhum `ACAO_PERFIS`, nada novo** (D8). `atrasado`/`dias_atraso` são **campo
  derivado numa rota que já existe**, não porta nova. **O gerador do alerta roda no contexto do Job B,
  sem usuário**: não há `req.user` e **não pode haver** `requirePermission` no caminho.
- **NÃO-TOQUE, e isso é contrato (R12):** `server/services/almoxarifado/receiptService.js`,
  `server/routes/almoxarifado/extended.js`, `server/services/almoxarifado/schema.js`, e a resposta de
  `GET /almoxarifado/recebimentos-aux/pedidos-compra?pendentes=1` — que a T1 afirma **idêntica** antes
  e depois. Os testes da Etapa 37 **não podem cair**; se uma task precisar desses arquivos, é achado
  de plano: **pare e registre**.
- **Data nunca passa por `new Date(str)`.** Nem no client, nem no servidor, nem em fixture de teste.
  `new Date('2026-09-16')` é **meia-noite UTC** e `toLocaleDateString('pt-BR')` a renderiza no fuso
  local — é o defeito que esta etapa conserta. No servidor, `hojeLocalISO()`
  (`pedidoCompraService.js:615-620`) é a única fonte de "hoje": **não** `new Date().toISOString()`,
  **não** `date('now')` do SQLite (os dois dão **UTC**). No client, o "hoje" é
  `getFullYear/getMonth/getDate`, como `FerramentasAlmoxarifado.js:417-424` já faz.
- **A fronteira é `<`, nunca `<=`.** "Vence hoje" **não** está atrasado (RN-D05b) — o mesmo precedente
  do achado F4 da revisão de branch (`FerramentasAlmoxarifado.js:416-422`).
- **Almoxarifado é área física, não filial.** Saldo global por material é correto e intencional.
- **Testes de servidor só em `server/tests/api/*.api.test.js`** — o runner descobre **apenas** esse
  padrão. Cada arquivo tem **runner próprio** (`test()`, contador `passed`/`failed`, `process.exit`),
  harness `server/tests/helpers/testApp.js`, que roda o `requirePermission` **real**, **já monta o
  registrador de Compras** (`testApp.js:140`) e **já stuba `pedidos_compra` com `previsao_entrega
  DATE`** (`testApp.js:100-111`) e `fornecedores` (`:65-84`) — **nenhuma fixture nova de tabela**.
- **Datas de fixture derivam de `hojeLocalISO()`** (`hoje`, `hoje-1`, `hoje-3`, `hoje+1`), **nunca**
  literais fixas: um arquivo com `'2026-09-15'` escrito à mão apodrece no dia seguinte (R3).
- **Base é LF, não CRLF.** No harness de sabotagem: `\r?\n` na **regex de BUSCA** é inofensivo e pode
  ficar; **NUNCA** insira `\r\n` num *replacement*; se um `perl -0pi` não casar, investigue a
  **âncora**, não o fim de linha (lição da Etapa 37 — um replacement com CRLF sujou 112 linhas).
- ⚠️ **Harness de sabotagem nesta máquina — regras aprendidas por falha:**
  - **`python3` NÃO existe no Git Bash desta máquina** (alias da Microsoft Store: imprime "Python was
    not found…" e **não executa nada** — no-op silencioso). Use **`perl -0pi -e`** ou **`sed`**, e
    confirme com `perl -e 'print 1'` antes.
  - Dentro de `\Q…\E` **só texto de uma linha**; quebra de linha só em regex escapada à mão (lição da
    T2 da Etapa 38: `\n` dentro de `\Q…\E` **não casa nada** e o `md5sum` sai inalterado).
  - **`md5sum` antes, depois da sabotagem e depois de restaurar.** `git diff --stat` tem de voltar com
    **só** os arquivos da task.
  - **NUNCA restaure com `git checkout -- <arquivo>`** enquanto houver conserto não commitado nesse
    arquivo: as sabotagens rodam **antes** do commit, e o `checkout` descarta sabotagem **e** conserto.
    Restaure por **perl inverso** ou por **cópia no scratchpad**, e confira que o `md5sum` volta ao
    valor **pós-conserto**, não ao de HEAD.
  - **A âncora é contada DEPOIS do conserto**, com `grep -cF '<ancora>' arquivo` dando **exatamente
    1**. 0 ou >1 → **aborte** e escolha outra âncora.
  - ⚠️ **`grep -c $'\r'` na ferramenta Bash conta TODA linha** (o `$'\r'` chega vazio para o `grep`) —
    é falso-positivo garantido. Para medir CR use
    `perl -ne '$c++ if /\r/; END { print "$c\n" }' <arquivo>`.
  - **Leia QUAL asserção caiu, não só o placar.** Sabotagem que não derruba nada é **um achado**
    (falta asserção, ou o defeito virou inalcançável) — e **"nada cai" é resultado legal de declarar**,
    desde que o plano já preveja qual asserção era a candidata.
- **O comando de teste do client leva CAMINHO, nunca `-t`** (`-t` é `--testNamePattern` e devolve
  `N skipped, exit 0`):
  `cd client && CI=true npx react-scripts test --watchAll=false src/components/Compras.test.js`.
- **Um executor por vez na mesma árvore.** Galhos paralelos em worktree exigiriam `npm install` por
  worktree (`node_modules/`, `client/node_modules/` e `server/node_modules/` estão no `.gitignore`,
  medido desde a Etapa 34). **Tudo sequencial: T1 → T2 → T3 → T4 → T5 → T6.** A coluna "Depende de"
  descreve acoplamento, não permissão para antecipar.
- **Scratchpad com nome único por agente.** Mensagens de commit em
  `C:\Users\User\AppData\Local\Temp\claude\C--Users-User-projetos-CRM\9ae42253-33d4-40b5-a0ef-8d8e12b347d2\scratchpad\msg-e39-t<N>.txt`;
  cópias de segurança em `bkp-<arquivo>-t<N>`. (Na Etapa 25 dois executores usaram `msg.txt` e um
  sobrescreveu o do outro.)
- **Commits:** mensagem em **português sem acento no corpo**, **por quê primeiro** (qual era o bug,
  qual a consequência, o que foi decidido e o que foi descartado), **um commit por assunto**, e o
  trailer:
  ```
  Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
  ```
  **Nunca `git add -A` na raiz** — há artefatos de runtime não versionados (`server/data/`,
  `server/uploads/`, e na árvore de abertura desta etapa também `server/data/database.sqlite.bak`,
  `server/nodemon.json` e `docs/bkp_bancoprod.md`). `git add` **só dos caminhos que a task tocou**.
- **Nenhum commit com a suíte vermelha.** As rodadas RED existem para **ler o número**; o commit é da
  task que leva teste + conserto juntos.
- **Português com acento** no código, comentários, mensagens de tela e literais; **sem acento** no
  corpo do commit.

---

## ⚠️ O modo de falha desta etapa: o verde que mede o fuso errado

A Etapa 38 tinha o "201 que não gravou item nenhum". Esta tem **o teste de data que passa por
acidente**. Quatro modos, todos medidos ou nomeados por regra da `fechar-etapa`:

1. **O cenário de data passa num worker em UTC e não prova nada.** Se o processo não estiver em -03,
   `16/09/2026` sai do código **velho** também, e o cenário fica verde com o bug no lugar. Por isso
   **todo cenário de data desta etapa carrega um controle positivo** que afirma o fuso:
   `new Date('2026-09-16').toLocaleDateString('pt-BR') === '15/09/2026'`, com mensagem de falha
   dizendo *"o fuso do processo não é -03; este cenário não prova nada"* (R2).
2. **Fixture com data literal apodrece.** `'2026-09-15'` escrito à mão é atrasado hoje e não é amanhã.
   Todas as datas dos testes de servidor derivam de `hojeLocalISO()` (R3).
3. **Duas definições de "atrasado".** Uma na rota, outra no alerta — é o mesmo erro que o plano da 38
   proibiu para o saldo. **Uma** função (`derivarAtraso`), e a **RN-D11** compara os dois conjuntos de
   ids com `deepStrictEqual` (R1).
4. **`NOT IN ('%')` passa em tudo.** Uma lista de status escrita errada faz *todos* os pedidos
   atrasarem — ou nenhum. Por isso o cenário das três exclusões tem **metade positiva no mesmo
   arquivo**: os **quatro** status restantes do enum com previsão de ontem → `atrasado: 1` nos quatro.

### Três regras herdadas, e valem para TODAS as tasks

**(i) Metade positiva dentro de cada cenário negativo.** Toda recusa vem acompanhada do caso que
**tem** de passar.

**(ii) Conte as chamadas, não use `toHaveBeenCalledWith` solto.** Ele é satisfeito por 1, 2 ou 10.
Asserção de chamada é `api.get.mock.calls.filter(...)` + `toHaveLength(n)`, e os `params` são lidos de
`api.get.mock.calls[i][1].params`.

**(iii) Sabotagem que derruba a suíte por `TypeError` não é controle positivo.** Se o arquivo quebra
no carregamento, **todos** os cenários caem juntos e nenhum provou nada. Prefira **alterar a
literal**, **inverter o comparador** ou **mover a chamada de lugar**.

---

## Regras de negócio — `RN-D01…RN-D14`

Cada RN aparece em **três** lugares: aqui, no **nome do cenário** do teste que a prova, e na **frase
do manual** que a descreve. Quando o P.O. mudar uma regra, `grep RN-D07` acha os três — e a SDD de
correção começa editando spec + teste, **nunca** o código primeiro.

> **Sobre o prefixo `RN-D`, e a divergência fica escrita** (design, seção 4): a Etapa 38 abriu
> **`RN-C…`** ("C de Compras"). O escopo desta etapa pediu **`RN-D…`**. **Custo declarado:** o mesmo
> módulo passa a ter dois prefixos e `grep RN-C` deixa de achar tudo. **Reversível:** o fechamento
> renumera com um `sed` se o controlador preferir. Quem quiser as duas: `grep -E "RN-[CD][0-9]"`.

| RN | Enunciado (resumido — o enunciado completo está no design §4) | Arquivo de teste · cenário | Frase do manual (a T6 escreve) |
|---|---|---|---|
| **RN-D01** | a data é formatada a partir da **STRING**, nunca por `new Date`; `null`/`''` → `-`; valor com hora → 10 primeiros caracteres; valor fora de `^\d{4}-\d{2}-\d{2}$` → devolvido como veio | `client/src/components/Compras.test.js` · `(a) RN-D01 a data exibida e a do banco, nao a do fuso` | *"As datas das abas de Compras mostram exatamente o dia que está gravado. Antes, um pedido com previsão de 16/09/2026 aparecia como 15/09/2026."* |
| **RN-D02** | a **exportação** usa a mesma régua, e o round-trip do Excel para de mover a data | `Compras.test.js` · `(h) RN-D02/RN-D08 o Excel exportado leva a data do banco e as duas colunas novas` | *"O Excel exportado pela aba Pedidos pode ser reimportado sem que as datas andem um dia para trás."* |
| **RN-D03** | o formulário nasce com a data de **hoje no fuso de quem clica** | `client/src/components/compras/PedidoCompraForm.test.js` · `(q) RN-D03 o formulario nasce com a data LOCAL, nao com a de amanha` | *"Ao abrir 'Novo pedido de compra' depois das 21h, a data do pedido continua sendo hoje."* |
| **RN-D04** | `atrasado`/`dias_atraso` são **derivados na resposta**, e **nada é gravado** | `server/tests/api/comprasPedidoAtraso.api.test.js` · `(1) RN-D04 previsao de ontem e status pendente -> atrasado 1, dias_atraso 1, e nada e gravado` | *"O atraso é calculado na hora de listar. O sistema não grava uma coluna 'atrasado' — por isso ele nunca fica desatualizado à meia-noite."* |
| **RN-D05** | as quatro exclusões: `previsao` nula, `previsao = hoje`, `previsao = amanhã`, e `status` em `recebido`/`cancelado`/`rejeitado` — **e a metade positiva dos quatro status restantes** | `comprasPedidoAtraso.api.test.js` · `(2)`…`(7)` (`(4) RN-D05a previsao NULL nunca atrasa`, `(2) RN-D05b vence hoje NAO esta atrasado`, `(5) RN-D05d recebido/cancelado/rejeitado nao atrasam`, `(6) RN-D05 metade positiva: os quatro status restantes atrasam`) | *"Um pedido sem previsão de entrega nunca aparece como atrasado. Um pedido que vence hoje também não — atraso começa no dia seguinte. E pedido recebido, cancelado ou rejeitado sai da conta."* |
| **RN-D06** | `?atrasados=1` filtra, compõe com `status` e `search`, e **não mexe em mais nada** (`ORDER BY p.created_at DESC` intacto; `?pendentes=1` idêntico) | `comprasPedidoAtraso.api.test.js` · `(8) RN-D06 o filtro ?atrasados=1 e a composicao` e `(10) RN-D06 ?pendentes=1 da Etapa 37 responde IDENTICO` | *"O checkbox 'Só atrasados' pode ser usado junto com a busca e com o filtro de status."* |
| **RN-D07** | o comprador **vê** o atraso (`Atrasado há N dia(s)`, resolvido em singular/plural) e **filtra** por ele; na aba Fornecedores o checkbox **não existe** | `Compras.test.js` · `(c)`, `(d)`, `(e)`, `(f) RN-D07 marcar "So atrasados" manda atrasados=1`, `(g) RN-D07 na aba Fornecedores o checkbox nao existe` | *"Abaixo da previsão de entrega, em vermelho, aparece 'Atrasado há 3 dias'. Para ver só esses pedidos, marque 'Só atrasados'."* |
| **RN-D08** | o export ganha `Atrasado` (`Sim`/`Não`) e `Dias de atraso` (número, ou `''`); as colunas da RN-C10/RN-C11 da 38 **continuam idênticas** | `Compras.test.js` · `(h)` e `(i) RN-D08 pedido no prazo exporta Nao e coluna de dias vazia` | *"A planilha exportada traz duas colunas novas no fim: 'Atrasado' (Sim/Não) e 'Dias de atraso'."* |
| **RN-D09** | o gerador emite **um** alerta por pedido atrasado, e **nenhum** para os demais | `server/tests/api/alertaPedidoAtrasado.api.test.js` · `(1) RN-D09 cinco pedidos, UM alerta` | *"Uma vez por dia o sistema varre os pedidos e manda um e-mail para cada pedido que passou do prazo."* |
| **RN-D10** | **dedupe por pedido**: varrer duas vezes não manda dois e-mails — e o aviso é **um por pedido, para sempre** | `alertaPedidoAtrasado.api.test.js` · `(2) RN-D10 a segunda varredura e DUPLICADA, a fila nao cresce` | *"O aviso de atraso é enviado uma vez por pedido. O sistema não repete o e-mail nos dias seguintes enquanto o pedido continuar atrasado."* |
| **RN-D11** | a régua do alerta e a da tela são **a mesma**, e o teste prova (`deepStrictEqual` dos ids) | `alertaPedidoAtrasado.api.test.js` · `(5) RN-D11 os ids do alerta sao os MESMOS ids de atrasado=1 na rota` | *"O que a tela chama de atrasado é exatamente o que dispara o e-mail — não existem duas contas diferentes."* |
| **RN-D12** | a limitação do D6, **provada**: pedido fisicamente recebido por inteiro mas com `status = 'pendente'` **continua atrasado** até alguém editar o status | `server/tests/api/comprasPedidoAtrasoIntegracao.api.test.js` · `(D) RN-D12 receber pelas portas da Etapa 37 NAO muda o atraso` | *"Receber a mercadoria no almoxarifado não muda sozinho o status do pedido em Compras. Enquanto o status não for 'recebido', o pedido continua marcado como atrasado — mude o status na tela de edição do pedido."* |
| **RN-D13** | autorização: o campo derivado herda o gate da rota (401 sem token, 403 sem o módulo, 200 com o módulo **qualquer que seja o perfil**), e o `listar` do registro é chamado **sem `req`** | `comprasPedidoAtraso.api.test.js` · `(9) RN-D13 401 sem token, 200 com o modulo` + `alertaPedidoAtrasado.api.test.js` · `(7) RN-D13 o listar e chamado SEM req` | *"Quem tem acesso ao módulo Compras vê o atraso de todos os pedidos — o módulo não separa por perfil."* |
| **RN-D14** | o ciclo inteiro, **pela ROTA e pelo JOB** (o aceite da etapa) | `comprasPedidoAtrasoIntegracao.api.test.js` · blocos `(A)`…`(F)` | *(o roteiro de teste manual do guia da etapa é a versão em linguagem de usuário desta RN)* |

---

## Contratos de API congelados

Literais entre aspas são **as que vão no código e no manual** — não aproximar, não reescrever.
**Gate de todas as rotas de Compras:** `authenticateToken` + `checkModulePermission('compras')` —
**nenhum perfil** (o core não tem a camada 3).

### 1. `GET /api/compras/pedidos` — campos **acrescentados**, nada removido

| | Antes (Etapa 38) | Depois (Etapa 39) |
|---|---|---|
| Método / caminho | `GET /api/compras/pedidos` | **inalterado** |
| Gate | `authenticateToken` + `checkModulePermission('compras')` (`routes/compras.js:111`) | **inalterado** |
| Query | `search`, `status` | `search`, `status`, **`atrasados`** |
| Ordenação | `ORDER BY p.created_at DESC` (`:129`) | **inalterada** |
| `LIMIT` | não tem | **continua sem** |
| Resposta 200 | `[ { …pedidos_compra.*, fornecedor_nome } ]` | `[ { …pedidos_compra.*, fornecedor_nome, atrasado, dias_atraso } ]` |
| Erros | `500 { error: <msg> }`; **401** sem token; **403** sem o módulo | **inalterados** |

- **`atrasado`**: `0` ou `1` — **número, nunca booleano** (espelha `ativo`/`evento` do resto da base).
- **`dias_atraso`**: inteiro **positivo** quando `atrasado === 1`; **`null`** quando `atrasado === 0`.
  **Nunca `0`, nunca negativo** — "0 dias de atraso" e "não atrasado" não podem ser o mesmo valor.
- **`atrasados`**: só o valor **`'1'`** liga o filtro. Ausente, `''`, `'0'` ou qualquer outra coisa =
  sem filtro. Compõe com `search` e `status`. ⚠️ **O servidor compara contra a STRING `'1'`** porque
  `req.query` do Express é sempre string; o client manda o **número `1`** em `params`, que o axios
  serializa como `?atrasados=1` — os dois lados casam, e o cenário `(f)` do client afirma `1` e o
  cenário `(8)` do servidor afirma a query string.
- **Aditivo por construção:** `comprasPedidosRotas.api.test.js` lê a resposta **por nome de campo** e
  o cabeçalho dele (`:29`) declara que campo a mais não derruba asserção. **Nenhum teste da 38 pode
  cair.**

### 2. A régua de atraso — **uma função, um lugar** (`server/services/compras/pedidoCompraService.js`)

```js
const STATUS_PEDIDO_FORA_DO_ATRASO = ['recebido', 'cancelado', 'rejeitado'];

/** @returns {{ atrasado: 0|1, dias_atraso: number|null }} — `hoje` é `AAAA-MM-DD` LOCAL. */
function derivarAtraso(pedido, hoje = hojeLocalISO()) { … }

module.exports = { …, hojeLocalISO, derivarAtraso, STATUS_PEDIDO_FORA_DO_ATRASO };
```

- `hojeLocalISO()` já existe em `pedidoCompraService.js:615-620` e **passa a ser exportada** (hoje o
  `module.exports` do arquivo, em `:885-900`, não a lista).
- `dias_atraso = (Date.UTC(hoje) - Date.UTC(previsao)) / 86400000`, **inteiro**. `Date.UTC` nas
  **duas** pontas torna a subtração independente de fuso — as duas são data-only, e esta é a **única**
  aritmética de datas da etapa (R5).
- **A rota deriva em JS**, mapeando as linhas e filtrando o array. A query SQL **não muda** (nem
  `SELECT`, nem `WHERE`, nem `ORDER BY`). **Descartado:** `CASE WHEN …` no `SELECT` — obrigaria
  repetir os `?` da condição em duas posições do texto SQL, com a ordem posicional dos binds virando
  contrato implícito.

### 3. A entrada do registro de alertas (`server/services/almoxarifado/alertRegistry.js`)

Entra **antes do `]);`**, que está medido em **`alertRegistry.js:461`** (`LIMITE_LINHAS_CENTRAL` é
`:464`). Molde: `REQUISICAO_ATRASADA` (`:301-326`).

| Campo | Valor congelado |
|---|---|
| `chave` | `'PEDIDO_COMPRA_ATRASADO'` |
| `titulo` | `'Pedido de compra atrasado'` |
| `descricao` | `'Pedidos de compra com previsão de entrega vencida e ainda não recebidos.'` |
| `configDias` | `null` |
| `dedupeChave` | `` (linha) => `pedido-atrasado-${linha.id}` `` → hash `sha256('PEDIDO_COMPRA_ATRASADO|pedido-atrasado-<id>')` (`notificationQueueService.js:41-43`, `INSERT OR IGNORE` em `:70-80`) |
| `payload` | `` (linha) => ({ pedido_compra_id: linha.id, dias_atraso: linha.dias_atraso }) `` |
| `assunto` | `` (linha) => `[Compras] Pedido de compra atrasado — ${linha.numero}` `` — ⚠️ prefixo **`[Compras]`**, e não `[Almoxarifado]` como as 11 anteriores (D5, descartado (e)) |
| `corpo` | as cinco linhas literais abaixo, juntadas por `'\n'` |

```
Pedido: ${linha.numero}
Fornecedor: ${linha.fornecedor_nome || '-'}
Previsão de entrega: ${linha.previsao_entrega}
Atraso: ${linha.dias_atraso} dia(s)
Status: ${linha.status}
```

**Destinatário:** `alertas_estoque_emails` (`notificationQueueService.js:590`) — a lista **única** que
a varredura lê, e que em produção é **idêntica** a `compras_notificar_emails` (com
`compras2@gmp.ind.br` dentro). **Toggle mestre:** `alertasEmailLigado` (`:584`) — com e-mail
desligado a entrada devolve `{ motivo: 'email desligado' }` como as outras 11.

**O que essa única entrada liga, sem mais nenhuma linha em lugar nenhum** (`alertRegistry.js:6-7`):
varredura diária (`routes/almoxarifado.js:3791` → `notificationQueueService.js:579-627`) e central
in-app (`alertRegistry.js:480-500` → `routes/almoxarifado/extended.js:1859-1863`). Disparo no ato
(`notificationQueueService.js:645-667`) **não é usado** — atraso não tem ato (D5, descartado (d)).

### 4. Colunas da exportação (`client/src/components/Compras.js`, `linhaExportPedido` `:151-163`)

Ordem final — **as 11 existentes intactas + 2 no fim**:

`Número` · `Fornecedor` · `Código` · `Descrição` · `Unidade` · `Quantidade` · `Valor Unitário` ·
`Valor Total` · `Status` · `Data` · `Previsão Entrega` · **`Atrasado`** · **`Dias de atraso`**

- `Atrasado`: **`'Sim'`** / **`'Não'`** (texto — coluna de leitura humana, como `Status`).
- `Dias de atraso`: **número** quando atrasado, **`''`** quando não (nunca `0`, nunca `'-'`).
- Uma linha por **item** (contrato do F6 da 38): os dois campos são do **cabeçalho** e se repetem em
  todas as linhas do mesmo pedido. **Declarado.**
- A importação lê por **grafia conhecida de cabeçalho** — as duas colunas novas são **ignoradas** na
  reimportação, como já acontece com `Status` e `Valor Total`.

### 5. Literais de tela (client) — **verbatim**

| Onde | Literal |
|---|---|
| Badge na célula de previsão, `dias_atraso >= 2` | `Atrasado há {N} dias` |
| Badge, `dias_atraso === 1` | `Atrasado há 1 dia` (singular — a literal do contrato é `Atrasado há N dia(s)` **resolvida**, não impressa com o parêntese) |
| Rótulo do checkbox | `Só atrasados` |
| Cabeçalho de coluna do Excel | `Atrasado` |
| Cabeçalho de coluna do Excel | `Dias de atraso` |
| Valores da coluna `Atrasado` | `Sim` / `Não` |
| Cartão da central de alertas | `Pedido de compra atrasado`, colunas `Pedido` · `Fornecedor` · `Previsão` · `Dias de atraso` |

**Forma do badge:** texto vermelho, `.pedido-atrasado { color: #e74c3c; font-weight: 600; font-size:
.78rem; display: block; }` em `Compras.css` — o **mesmo** `#e74c3c` que `getStatusColor` já usa para
`rejeitado`/`cancelado` (`Compras.js:102,106`). **Nenhuma biblioteca nova, nenhum ícone novo.** A
coluna `Ações` e as outras seis **não mudam**.

---

## Estrutura de arquivos

| Arquivo | Responsabilidade | Task |
|---|---|---|
| `server/services/compras/pedidoCompraService.js` **(modificar)** | `derivarAtraso`, `STATUS_PEDIDO_FORA_DO_ATRASO`, e `hojeLocalISO` **exportada** | 1 |
| `server/routes/compras.js:111-137` **(modificar)** | derivação em JS no callback do `db.all` + filtro `?atrasados=1`. **A query SQL não muda** | 1 |
| `server/tests/api/comprasPedidoAtraso.api.test.js` **(criar)** | RN-D04, RN-D05, RN-D06, RN-D13 | 1 |
| `client/src/components/Compras.js:91-94` **(modificar)** | `formatDate` por `split('-')`, sem `new Date` | 2 |
| `client/src/components/compras/PedidoCompraForm.js:85` **(modificar)** | `hojeISO` local | 2 |
| `client/src/components/Compras.test.js` **(criar)** | RN-D01, RN-D02 (T2); RN-D07, RN-D08 (T3) | 2, 3 |
| `client/src/components/compras/PedidoCompraForm.test.js` **(modificar)** | cenário `(q)` — RN-D03 | 2 |
| `client/src/components/Compras.js` (estado, `.filters`, célula de previsão, `linhaExportPedido`) **(modificar)** | badge, checkbox, 2 colunas | 3 |
| `client/src/components/Compras.css` **(modificar)** | `.pedido-atrasado`, 4 linhas | 3 |
| `server/services/almoxarifado/alertRegistry.js` **(modificar, antes do `]);` de `:461`)** | a entrada `PEDIDO_COMPRA_ATRASADO`, com require **LAZY** da régua | 4 |
| `client/src/components/almoxarifado/AlertasAlmoxarifado.js:88` **(modificar)** | entrada em `COLUNAS_POR_CHAVE` (6 linhas) | 4 |
| `client/src/components/almoxarifado/AlertasAlmoxarifado.test.js` **(modificar)** | um cenário: o cartão novo com as 4 colunas | 4 |
| `server/tests/api/alertaPedidoAtrasado.api.test.js` **(criar)** | RN-D09, RN-D10, RN-D11, RN-D13 (2ª metade) | 4 |
| `server/tests/api/comprasPedidoAtrasoIntegracao.api.test.js` **(criar)** | RN-D12, RN-D14 — pela **ROTA** e pelo **JOB** | 5 |
| `specs/modulo-almoxarifado/20-alertas/README.md`, `specs/modulo-almoxarifado/22-integracoes/README.md`, `specs/modulo-almoxarifado/README.md`, `specs/modulo-compras/README.md`, `docs/almoxarifado-guia-etapas-e-testes.md`, `docs/almoxarifado-novidades-por-etapa.md`, `docs/almoxarifado-manual-do-sistema.md`, este plano, o plano da 38 **(modificar)** | fechamento | 6 |

**Não são tocados, e isso é contrato:** `server/services/almoxarifado/receiptService.js`,
`server/routes/almoxarifado/extended.js`, `server/services/almoxarifado/schema.js`,
`server/services/almoxarifado/notificationQueueService.js`,
`client/src/components/almoxarifado/RecebimentosAlmoxarifado.js`.

---

## Sort topológico

Critério da Fase 3 da skill: **regra compartilhada = tronco**; **tela contra contrato congelado =
galho**.

| Task | Tipo | Depende de | Por quê |
|---|---|---|---|
| 1 — `derivarAtraso` + a rota | **tronco** | — | cria a **régua única** que a T3, a T4 e a T5 consomem. Errar aqui é retrabalho em três tasks |
| 2 — A0, as datas (client) | galho **A0** | — | duas funções de 3 linhas, sem contrato com o servidor. Vai **antes** da T3 porque a T3 edita as mesmas linhas de `Compras.js` e porque *"não existe etapa de atraso honesta antes de consertar as datas"* (D1) |
| 3 — A1 na tela (badge, filtro, export) | galho **A1** | 1 (contrato congelado), 2 (mesmo arquivo) | tela contra contrato congelado; mock só na **fronteira HTTP** |
| 4 — a entrada do registro de alertas | **tronco** | 1 | **regra compartilhada**: consome `derivarAtraso` e escreve na fila que os 11 alertas existentes usam. Um `listar` que lança é contido pelo `try/catch` por entrada (R8), mas a régua é a mesma da tela |
| 5 — integração: ROTA + JOB | sequencial | 1, 3, 4 | o valor está na **sequência** (D10). Verde por unidade não prova que as partes compõem |
| 6 — fechamento | sequencial | 5 | specs, mapa, guia, manual, novidades, os dois planos |

**Divergência declarada da skill:** os galhos vão **sequenciais, não em worktrees** — mesma medição da
Etapa 38 (worktree nova não tem `node_modules`, e a T2 e a T3 tocam **o mesmo arquivo**).

---

### Task 1: `derivarAtraso` e o atraso derivado em `GET /api/compras/pedidos` **(tronco)**

**Files:**
- Modify: `server/services/compras/pedidoCompraService.js` (a régua, logo **depois** de
  `hojeLocalISO` em `:615-620`; e o `module.exports` de `:885-900`)
- Modify: `server/routes/compras.js:111-137` (**só o callback do `db.all`** — a query não muda)
- Create: `server/tests/api/comprasPedidoAtraso.api.test.js`

**Interfaces:**
- **Consumes:** `hojeLocalISO()` (já existe, `pedidoCompraService.js:615-620`, hoje **não exportada**);
  `pedidoCompraService` **já é requerido** por `routes/compras.js:61` — **não acrescente require novo**.
- **Produces:**
  ```js
  // server/services/compras/pedidoCompraService.js
  hojeLocalISO(): string                                   // 'AAAA-MM-DD' LOCAL
  derivarAtraso(pedido, hoje = hojeLocalISO()): { atrasado: 0|1, dias_atraso: number|null }
  STATUS_PEDIDO_FORA_DO_ATRASO: string[]                   // ['recebido','cancelado','rejeitado']
  ```
  A T3 consome o **JSON** (`atrasado`, `dias_atraso`); a T4 consome `derivarAtraso` e `hojeLocalISO`
  por **require lazy**; a T5 consome os dois.

**Restrições medidas, cada uma com o que cai se violada:**

| Não faça | Por quê | Cai em |
|---|---|---|
| `date('now')` no SQL | é **UTC**: das 21h à meia-noite no fuso do Brasil acusa atraso ~3 h antes. É o que as 4 varreduras da feature 20 fazem hoje, e esta etapa **não as imita** | nada cai automaticamente — por isso a proibição está **escrita** aqui e no comentário do código |
| `<=` no lugar de `<` | "vence hoje" viraria atraso (RN-D05b), o mesmo defeito do achado F4 dos empréstimos | cenário (2) |
| `dias_atraso: 0` quando não atrasado | "0 dias de atraso" e "não atrasado" viram o mesmo valor, e o badge da T3 renderizaria `Atrasado há 0 dias` | cenário (4), que afirma `=== null` |
| mudar a query (`SELECT`, `WHERE` ou `ORDER BY`) | `ORDER BY p.created_at DESC` é **contrato congelado da extração da 38** (`comprasPedidosRotas.api.test.js`) | `comprasPedidosRotas.api.test.js` inteiro |
| ler `req.query.atrasados` como booleano (`if (req.query.atrasados)`) | `?atrasados=0` ligaria o filtro (string `'0'` é truthy) | cenário (8) |
| tocar `receiptService.js` ou `?pendentes=1` | NÃO-TOQUE (R12) | cenário (10) |

- [ ] **Step 1: escrever o teste e ver os cenários vermelhos** (leia **qual** asserção cai)

`server/tests/api/comprasPedidoAtraso.api.test.js` — runner próprio no molde de
`alertaRegistro.api.test.js`. Cabeçalho, fixtures e helpers:

```js
/**
 * Etapa 39, Task 1 (RN-D04, RN-D05, RN-D06, RN-D13) — o atraso DERIVADO na leitura de
 * GET /api/compras/pedidos.
 *
 * ⚠️ NENHUMA DATA LITERAL NESTE ARQUIVO. Todas derivam de `hojeLocalISO()`, a MESMA funcao que a
 * rota usa: um fixture com '2026-09-15' escrito a mao e atrasado hoje e nao e amanha, e o arquivo
 * viraria falso-verde sem ninguem notar (R3 do design).
 *
 * Executar: cd server && node tests/api/comprasPedidoAtraso.api.test.js
 */
const assert = require('assert');
const request = require('supertest');
const { createTestApp } = require('../helpers/testApp');
const { dbRun, dbGet, dbAll } = require('../../services/almoxarifado/db');
const { hojeLocalISO } = require('../../services/compras/pedidoCompraService');

let passed = 0; let failed = 0;
function test(name, fn) {
  return fn().then(() => { passed++; console.log(`  ✓ ${name}`); })
    .catch((e) => { failed++; console.error(`  ✗ ${name}: ${e.message}`); });
}

const ADMIN = { id: 64, nome: 'Admin E39', role: 'admin', is_superadmin: 1, email: 'admin@test.com' };
const PRODUCAO = { id: 66, nome: 'Chao de Fabrica E39', role: 'user', email: 'prod@test.com' };

// hoje + N dias, em data LOCAL, pela MESMA regua do servidor. Nao usa toISOString (UTC).
function diasDeHoje(n) {
  const [a, m, d] = hojeLocalISO().split('-').map(Number);
  const dt = new Date(a, m - 1, d + n);
  return [dt.getFullYear(), String(dt.getMonth() + 1).padStart(2, '0'),
    String(dt.getDate()).padStart(2, '0')].join('-');
}

(async () => {
  const { app, db, setUser, close } = await createTestApp({ user: ADMIN });
  const forn = await dbRun(db, `INSERT INTO fornecedores (razao_social, cnpj)
    VALUES ('Acos Vale E39','79.779.779/0001-79')`);

  let seq = 0;
  async function novoPedido({ previsao, status = 'pendente' }) {
    seq += 1;
    const numero = `PC-E39-${seq}`;
    const p = await dbRun(db, `INSERT INTO pedidos_compra
      (numero, fornecedor_id, previsao_entrega, status) VALUES (?,?,?,?)`,
    [numero, forn.lastID, previsao, status]);
    return { id: p.lastID, numero };
  }
  const listar = (qs) => request(app).get(`/api/compras/pedidos${qs || ''}`);
  const naLista = async (qs, id) => (await listar(qs)).body.find((p) => p.id === id);
```

Os dez cenários (cada `test()` com o **nome que a tabela de RN cita**):

```
(1) RN-D04 previsao de ontem e status pendente -> atrasado 1, dias_atraso 1, e nada e gravado
    const antes = await dbGet(db,'SELECT * FROM pedidos_compra WHERE id = ?',[p.id])
    linha = await naLista('', p.id)
    assert linha.atrasado === 1          // NUMERO, nao true
    assert typeof linha.atrasado === 'number'
    assert linha.dias_atraso === 1
    E O QUE MEDE O DANO (leitura nao escreve):
      const depois = await dbGet(db,'SELECT * FROM pedidos_compra WHERE id = ?',[p.id])
      assert !('atrasado' in depois)     // a coluna NAO existe
      assert depois.updated_at === antes.updated_at

(2) RN-D05b vence hoje NAO esta atrasado
    previsao = hojeLocalISO() -> atrasado === 0, dias_atraso === null
    (com `<=` no lugar de `<`, este cai — e e a sabotagem 1)

(3) RN-D05c previsao de amanha -> atrasado === 0, dias_atraso === null

(4) RN-D05a previsao NULL nunca atrasa
    previsao = null -> atrasado === 0 E dias_atraso === null  (null, NUNCA 0)
    metade positiva no MESMO test(): previsao = '' (string vazia) -> idem

(5) RN-D05d recebido/cancelado/rejeitado nao atrasam
    laco pelos TRES status, previsao = ontem, um pedido por status
    -> atrasado === 0 e dias_atraso === null nos tres, com a mensagem dizendo QUAL status caiu

(6) RN-D05 metade positiva: os quatro status restantes atrasam
    laco por 'pendente','aprovado','em_analise','enviado', previsao = ontem
    -> atrasado === 1 nos quatro.  SEM ESTA METADE, `NOT IN ('%')` passaria em tudo

(7) RN-D04 aritmetica: previsao = hoje-3 -> dias_atraso === 3
    e o controle de fuso: previsao = hoje-1 -> 1 (nunca 0, nunca 2)

(8) RN-D06 o filtro ?atrasados=1 e a composicao
    tres pedidos: atrasado/pendente, no prazo, sem previsao
    listar('')              -> os TRES estao na resposta
    listar('?atrasados=1')  -> SO o atrasado (filtra por id, nunca por length global:
                               outros test() ja inseriram pedidos neste mesmo banco)
    listar('?atrasados=0')  -> os tres  |  listar('?atrasados=')  -> os tres
    listar('?atrasados=sim')-> os tres  (so a string '1' liga)
    listar('?atrasados=1&status=pendente') -> o atrasado esta, e um atrasado 'aprovado' NAO
    listar('?atrasados=1&search=<numero>') -> exatamente 1 linha
    E A ASSERCAO QUE GUARDA O CONTRATO DA 38:
      const ids = (await listar('')).body.map(p => p.id)
      assert.deepStrictEqual(ids, [...ids].sort((a,b) => b - a).length ? ids : ids)
      -> na pratica: reler `created_at DESC` afirmando que o ULTIMO inserido vem primeiro

(9) RN-D13 401 sem token, 200 com o modulo
    setUser(null)     -> 401
    setUser(PRODUCAO) -> 200 e os campos novos presentes (o core tem UMA camada: perfil nao decide)
    setUser(ADMIN)    -> 200   (metade positiva, e restaura o usuario para os cenarios seguintes)
    NOTA: o 403 "sem o modulo" NAO e exercitavel neste harness —
      `fakeCheckModulePermission = () => (req,res,next) => next()` (testApp.js). Esta escrito
      aqui para ninguem escrever um cenario que so pode passar por acidente.

(10) RN-D06 ?pendentes=1 da Etapa 37 responde IDENTICO
    const antes = (await request(app).get('/api/almoxarifado/recebimentos-aux/pedidos-compra?pendentes=1')).body
    ... (os pedidos desta suite ja foram criados) ...
    assert.deepStrictEqual(depois, antes)   // NAO-TOQUE, R12
```

- [ ] **Step 2: rodar e LER os números**

```
cd server && node tests/api/comprasPedidoAtraso.api.test.js
```

Previsão do RED: os cenários (1)–(8) caem com **`undefined`** onde deveria haver `0`/`1`
(`atrasado` não existe na resposta), e o (8) cai com **contagem errada** (`?atrasados=1` devolve
tudo, porque a query string é ignorada). O (9) e o (10) **nascem verdes** — são as metades que
provam que a rota já existia; se **qualquer** um de (1)–(8) vier verde, **pare**: `undefined` não
satisfaz nenhuma das asserções, então verde ali significa que o cenário não afirma nada.

- [ ] **Step 3: implementar a régua** — `server/services/compras/pedidoCompraService.js`, logo
      depois de `hojeLocalISO` (`:615-620`)

```js
/** `AAAA-MM-DD` -> instante UTC de meia-noite, para subtrair data-only de data-only. */
const meiaNoiteUTC = (iso) => {
  const [ano, mes, dia] = iso.split('-').map(Number);
  return Date.UTC(ano, mes - 1, dia);
};

/**
 * Etapa 39 (D3, RN-D04/RN-D05/RN-D11) — a regua UNICA de atraso do sistema.
 *
 * DOIS consumidores, e e por isso que ela mora aqui e nao na rota: `GET /api/compras/pedidos`
 * (routes/compras.js) e a entrada PEDIDO_COMPRA_ATRASADO do `alertRegistry` do almoxarifado.
 * Escrever a lista de status duas vezes e o erro que a RN-D11 existe para pegar — a tela diria
 * "atrasado" para um conjunto e o e-mail sairia para outro, e ninguem cruzaria os dois.
 *
 * ⚠️ `hoje` e LOCAL (`hojeLocalISO`), NUNCA `date('now')` do SQLite nem `toISOString()`: os dois
 * dao UTC e, no fuso do Brasil, acusariam atraso ~3h antes da meia-noite local. As 4 varreduras
 * da feature 20 que ainda usam `date('now')` estao nomeadas no design (secao 8) e NAO sao
 * consertadas aqui — esta entrada apenas nao as imita.
 *
 * ⚠️ `<` e nao `<=`: "vence hoje" NAO esta atrasado (RN-D05b). Mesmo precedente de
 * `FerramentasAlmoxarifado.js:416-422` (achado F4 da revisao de branch).
 *
 * `dias_atraso` e `null` — nunca 0 — quando nao ha atraso: "0 dias de atraso" e "nao atrasado"
 * nao podem ser o mesmo valor, ou o badge da tela renderiza "Atrasado ha 0 dias".
 */
const STATUS_PEDIDO_FORA_DO_ATRASO = ['recebido', 'cancelado', 'rejeitado'];

function derivarAtraso(pedido, hoje = hojeLocalISO()) {
  const semAtraso = { atrasado: 0, dias_atraso: null };
  if (!pedido) return semAtraso;
  const previsao = String(pedido.previsao_entrega || '').slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(previsao)) return semAtraso;
  if (STATUS_PEDIDO_FORA_DO_ATRASO.includes(String(pedido.status || '').toLowerCase())) return semAtraso;
  if (!(previsao < hoje)) return semAtraso;
  return {
    atrasado: 1,
    dias_atraso: Math.round((meiaNoiteUTC(hoje) - meiaNoiteUTC(previsao)) / 86400000),
  };
}
```

E no `module.exports` (`:885-900`), acrescente as três chaves ao final da lista existente:

```js
  AVISO_DATA_PEDIDO_NAO_RECONHECIDA,
  hojeLocalISO,
  derivarAtraso,
  STATUS_PEDIDO_FORA_DO_ATRASO,
};
```

- [ ] **Step 4: implementar a rota** — `server/routes/compras.js`, **só** o callback do `db.all`
      (`:131-137`). A query e os `params` **não mudam**.

```js
  db.all(query, params, (err, rows) => {
    if (err) {
      return res.status(500).json({ error: err.message });
    }
    // Etapa 39 (RN-D04/RN-D06): `atrasado` e `dias_atraso` sao DERIVADOS na leitura, nunca
    // gravados — apagar estas quatro linhas apaga a feature inteira, sem migration nem coluna
    // orfa. `hoje` e calculado UMA vez para a resposta toda: chamar `hojeLocalISO()` por linha
    // faria duas linhas da mesma resposta cairem em dias diferentes na virada da meia-noite.
    const hoje = pedidoCompraService.hojeLocalISO();
    const comAtraso = rows.map((linha) => ({ ...linha, ...pedidoCompraService.derivarAtraso(linha, hoje) }));
    // So a string '1' liga o filtro: `if (req.query.atrasados)` ligaria com '0' tambem.
    res.json(req.query.atrasados === '1' ? comAtraso.filter((l) => l.atrasado === 1) : comAtraso);
  });
```

- [ ] **Step 5: rodar de novo, e rodar quem lê as mesmas tabelas**

```
cd server && node tests/api/comprasPedidoAtraso.api.test.js
cd server && node tests/api/comprasPedidosRotas.api.test.js
cd server && node tests/api/comprasPedidoCriar.api.test.js
cd server && node tests/api/comprasPedidoEditarExcluir.api.test.js
cd server && node tests/api/pedidosCompraSaldoAux.api.test.js
cd server && node tests/api/recebimentoContraPedidoIntegracao.api.test.js
cd server && npm run test:api
```

- [ ] **Step 6: sabotagens** (`md5sum` antes / depois / depois de restaurar; restauro por cópia do
      scratchpad, **nunca** `git checkout --`)

| # | Sabotagem | Âncora (`grep -cF` = **1**, contado **depois** do conserto) | Qual asserção tem de cair |
|---|---|---|---|
| 1 | trocar `<` por `<=`: `if (!(previsao <= hoje)) return semAtraso;` | `if (!(previsao < hoje)) return semAtraso;` em `pedidoCompraService.js` | cenário **(2)**: *"vence hoje virou atrasado"* — `atrasado === 0` esperado, veio `1`. **É a sabotagem que o R6 exige** |
| 2 | esvaziar a lista de exclusão: `const STATUS_PEDIDO_FORA_DO_ATRASO = [];` | `const STATUS_PEDIDO_FORA_DO_ATRASO = ['recebido', 'cancelado', 'rejeitado'];` | cenário **(5)**, nos três status. O **(6)** tem de continuar verde — é o que distingue "lista vazia" de "lista errada" |
| 3 | trocar `dias_atraso: null` por `dias_atraso: 0` no `semAtraso` | `const semAtraso = { atrasado: 0, dias_atraso: null };` | cenário **(4)**: `=== null` esperado, veio `0` |
| 4 | trocar o filtro por `req.query.atrasados ?` | `req.query.atrasados === '1' ? comAtraso.filter` em `routes/compras.js` | cenário **(8)**: `?atrasados=0` passa a devolver 1 linha em vez de 3 |
| 5 | usar `new Date().toISOString().slice(0,10)` em vez de `hojeLocalISO()` na rota | `const hoje = pedidoCompraService.hojeLocalISO();` em `routes/compras.js` | **provavelmente nada cai**, e isso é **previsto**: rodando antes das 21h locais as duas datas coincidem. **Declare o resultado** (letra G) — a proteção real é o comentário e a RN-D11, não a suíte. Se a sabotagem rodar entre 21h e a meia-noite, o (7) cai com `dias_atraso === 2` |

- [ ] **Step 7: commit** — `git add server/services/compras/pedidoCompraService.js
      server/routes/compras.js server/tests/api/comprasPedidoAtraso.api.test.js`.
      Mensagem em `…\scratchpad\msg-e39-t1.txt`: qual era o furo (o pedido tinha `previsao_entrega`
      validada desde a 38 e **ninguém** comparava com hoje — `WHERE previsao_entrega < …` não existia
      em código executável em lugar nenhum, e o comprador fazia a conta de cabeça pedido a pedido), o
      que foi decidido (derivar na **leitura** com uma função **única** exportada, `hojeLocalISO`
      local, `<` e não `<=`, `dias_atraso` `null` e não `0`, filtro só com a string `'1'`) e o
      descartado (coluna `atrasado` gravada + job — migration, varredura de escrita e erro à
      meia-noite; `date('now')` do SQLite — UTC, erra ~3 h por dia; `CASE WHEN` no SQL — binds
      posicionais virando contrato implícito).

---

### Task 2: A0 — as datas param de andar um dia para trás **(galho A0)**

**Files:**
- Modify: `client/src/components/Compras.js:91-94` (`formatDate`)
- Modify: `client/src/components/compras/PedidoCompraForm.js:85` (`hojeISO`)
- Create: `client/src/components/Compras.test.js` (**o componente nunca teve um**)
- Modify: `client/src/components/compras/PedidoCompraForm.test.js` (cenário `(q)`)

**Interfaces:**
- **Consumes:** nada do servidor — esta task é puramente de formatação. O harness de teste vem de
  `PedidoCompraForm.test.js` (mock de `api` com **fallback que rejeita**, mock de `exportToExcel` e de
  `react-toastify`, Proxy em `routes/lazyModules`, render de `AppRoutes` dentro de `MemoryRouter`,
  helpers `esperarEfeitos`/`renderizarEm`/`clicar`/`texto`).
- **Produces:**
  ```js
  // client/src/components/Compras.js  (nome MANTIDO — e a mesma funcao, com outra implementacao)
  formatDate(date: string|null|undefined): string   // 'AAAA-MM-DD' -> 'DD/MM/AAAA'; falsy -> '-'
  // client/src/components/compras/PedidoCompraForm.js
  hojeISO(): string                                  // 'AAAA-MM-DD' LOCAL
  ```
  A T3 acrescenta cenários **ao mesmo** `Compras.test.js` e usa os mesmos helpers.

> **(divergência do design) — os fake timers do cenário `(q)`.** O design (§7.4, RN-D03) manda
> `jest.useFakeTimers().setSystemTime(new Date(2026, 8, 16, 23, 30))`. **Não funciona neste arquivo, e
> foi medido:** o Jest desta base é **27.5.1** (`require('jest/package.json').version`), onde
> `useFakeTimers()` é "modern" e **fake também o `setTimeout`** — e a opção `doNotFake` só existe a
> partir do Jest 28. O helper `esperarEfeitos()` do harness é
> `await act(async () => { await new Promise((r) => setTimeout(r, 0)); })`: com os timers falsos ele
> **nunca resolve**, e o cenário morreria por timeout dos 5 s em vez de medir a data. **Este plano usa
> a substituição de `global.Date` por uma subclasse**, restaurada no `finally` — fixa o relógio sem
> tocar nos timers, e o construtor continua sendo o **local** que a RN-D03 exige. **Descartado:**
> `jest.setSystemTime` (o acima), e injetar um relógio no componente (provaria o relógio injetado, não
> a tela). **O design tem de ser corrigido no fechamento** (regra 5 do `CLAUDE.md`).

**Restrições medidas, cada uma com o que cai se violada:**

| Não faça | Por quê | Cai em |
|---|---|---|
| `new Date(str + 'T00:00:00')` | funciona, mas continua criando um `Date` para não usar nenhum campo dele — e é a forma que o próximo "simplifica" de volta para `new Date(str)` (D2, descartado (a)) | nada cai — é **proibição escrita**, e o comentário do código é a proteção |
| `toLocaleDateString` com `{ timeZone: 'America/Sao_Paulo' }` | acerta hoje e quebra no dia em que a coluna guardar outro fuso, além de fingir que uma data-only tem fuso (D2, descartado (b)) | idem |
| consertar só a exibição e deixar o export | são **a mesma função** (`Compras.js:161-162`), e o round-trip do Excel é a metade que custa dinheiro | cenário `(h)` da T3 |
| `process.env.TZ` no topo do arquivo de teste | **medido como no-op nesta base** quando o processo já tem `TZ` (achado A1 da Etapa 22, escrito em `client/jest.globalSetup.js`) | o **controle positivo** do cenário `(a)` é justamente o que detecta que o fuso não é -03 |
| mexer nos 21 cenários existentes de `PedidoCompraForm.test.js` | o fixture `PEDIDO_418_LISTA` (`:149-152`) tem previsão **futura** e o cenário `(p)` (`:785`) **não afirma datas** — nada desta etapa os derruba (medição nova 4) | se algum cair, é **achado**: pare e registre |

- [ ] **Step 1: escrever `Compras.test.js` com os cenários (a) e (b), e o `(q)` em
      `PedidoCompraForm.test.js`** — e ver o vermelho **contra o código velho**

`client/src/components/Compras.test.js` (novo). O bloco de mocks e os helpers são **copiados** de
`PedidoCompraForm.test.js:44-235` (mesmo Proxy de `lazyModules`, mesmo fallback que rejeita, mesmo
`texto()`), com **estas** fixtures:

```jsx
/**
 * Etapa 39, Tasks 2 e 3 — a aba "Pedidos de Compra" do modulo Compras.
 *
 * O COMPONENTE NUNCA TEVE ARQUIVO DE TESTE, e "nao tem teste" e ENGANOSO como cobertura:
 * `compras/PedidoCompraForm.test.js` renderiza `AppRoutes` e ja exercita esta aba em dois
 * cenarios (a lixeira e a exportacao). Quem ler "nao tem teste" vai supor que pode mudar a aba
 * livremente. Nao pode — rode os dois arquivos.
 *
 * ⚠️ ESTE ARQUIVO **NAO** SETA `process.env.TZ`, de proposito. `client/jest.globalSetup.js` ja
 * fixa `America/Sao_Paulo` ANTES de o Jest forkar os workers, e registra a medicao de que a
 * atribuicao em runtime e **no-op** quando o processo ja tem TZ (achado A1 da Etapa 22). O que
 * este arquivo faz e AFIRMAR o fuso, num controle positivo: sem ele, um worker em UTC deixaria o
 * cenario (a) verde com o bug no lugar.
 *
 * Executar:
 *   cd client && CI=true npx react-scripts test --watchAll=false src/components/Compras.test.js
 */
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';
import { AppRoutes } from '../App';
import api from '../services/api';
import { exportToExcel } from '../utils/exportExcel';

// … (os seis jest.mock de PedidoCompraForm.test.js:52-110, verbatim: api, exportExcel,
//    react-toastify, routes/lazyModules com o Proxy, os tres ProtectedRoute, AuthContext) …

// Pedido 419: previsao NO PASSADO de proposito — e o caso que a Etapa 39 existe para mostrar, e
// o 418 de `PedidoCompraForm.test.js` tem previsao futura (por isso nada la cai).
const PEDIDO_419_NO_PRAZO = {
  id: 419, numero: 'PC-2026-419', fornecedor_nome: 'Aços Vale Ltda', valor_total: 315,
  data_pedido: '2026-09-10', previsao_entrega: '2026-09-16', status: 'aprovado',
  atrasado: 0, dias_atraso: null,
};

const LITERAL_FUSO = 'o fuso do processo nao e -03; este cenario nao prova nada '
  + '(client/jest.globalSetup.js deveria ter fixado America/Sao_Paulo)';
```

Cenários desta task (a T3 acrescenta `(c)`…`(i)` **no mesmo arquivo**):

```
(a) RN-D01 a data exibida e a do banco, nao a do fuso
    // CONTROLE POSITIVO PRIMEIRO — se esta linha cair, o resto do cenario nao prova nada:
    expect(new Date('2026-09-16').toLocaleDateString('pt-BR')).toBe('15/09/2026'); // LITERAL_FUSO
    pedidosDoBanco = [PEDIDO_419_NO_PRAZO];
    await renderizarEm('/compras/pedidos');
    expect(texto()).toContain('16/09/2026');   // previsao_entrega
    expect(texto()).toContain('10/09/2026');   // data_pedido
    expect(texto()).not.toContain('15/09/2026');
    expect(texto()).not.toContain('09/09/2026');

(b) RN-D01 valores fora do contrato: previsao null e data vazia mostram '-'
    { ...PEDIDO_419_NO_PRAZO, previsao_entrega: null, data_pedido: '' }
    -> as duas celulas da linha tem textContent '-'
    metade positiva no MESMO cenario: `created_at`-like com hora ('2026-09-16 10:33:00')
    passado a `formatDate` pela coluna de fornecedores -> '16/09/2026' (10 primeiros caracteres)
```

E em `client/src/components/compras/PedidoCompraForm.test.js`, **um** cenário novo no fim do arquivo:

```jsx
// ── (q) RN-D03 o formulario nasce com a data LOCAL, nao com a de amanha ───────────────────────
//
// 23:30 em -03 e 02:30 do DIA SEGUINTE em UTC: `new Date().toISOString().slice(0,10)` (a
// implementacao antiga) devolve 2026-09-17 e o comprador abre o formulario ja com a data errada.
//
// ⚠️ POR QUE NAO `jest.useFakeTimers().setSystemTime(...)`: o Jest desta base e 27.5.1, onde os
// timers modernos fakeiam TAMBEM o `setTimeout` — e `esperarEfeitos()` espera um `setTimeout(0)`,
// que nunca resolveria (o `doNotFake` so existe do Jest 28 em diante). Trocar `global.Date` por
// uma subclasse fixa o relogio sem tocar nos timers.
test('(q) o formulario nasce com a data LOCAL, nao com a de amanha', async () => {
  const DateReal = global.Date;
  const INSTANTE = new DateReal(2026, 8, 16, 23, 30); // construtor LOCAL, de proposito
  // CONTROLE POSITIVO: prova que o fuso esta aplicado E que a implementacao antiga erraria.
  expect(INSTANTE.toISOString().slice(0, 10)).toBe('2026-09-17');
  class DataFixa extends DateReal {
    constructor(...args) { super(...(args.length ? args : [INSTANTE.getTime()])); }
    static now() { return INSTANTE.getTime(); }
  }
  global.Date = DataFixa;
  try {
    await renderizarEm('/compras/pedidos/novo');
    expect(porTestId('pedido-data').value).toBe('2026-09-16');
  } finally {
    global.Date = DateReal;
  }
});
```

> ⚠️ **Confirme o `data-testid` do campo de data antes de escrever a asserção.** O nome usado acima
> (`pedido-data`) é o que o padrão do arquivo sugere; se o input tiver outro, **use o real** — e se
> não tiver `data-testid` nenhum, acrescente um (é o único toque em `PedidoCompraForm.js` além do
> `hojeISO`). Ancorar por `querySelector('input[type="date"]')` é aceitável e mais barato; o que
> **não** vale é afirmar sobre o primeiro input da tela.

- [ ] **Step 2: rodar e LER os números — o RED tem de ser observado CONTRA O CÓDIGO VELHO**

```
cd client && CI=true npx react-scripts test --watchAll=false src/components/Compras.test.js
cd client && CI=true npx react-scripts test --watchAll=false src/components/compras/PedidoCompraForm.test.js
```

Previsão, e ela é a razão de esta task existir: com `formatDate` ainda sendo
`new Date(date).toLocaleDateString('pt-BR')` e a suíte em `America/Sao_Paulo`, o cenário **(a)** cai
com **`Expected substring: "16/09/2026"`** — o DOM traz `15/09/2026` e `09/09/2026`. O cenário
**(q)** cai com **`Expected: "2026-09-16" · Received: "2026-09-17"`**. **Cole as duas linhas reais.**
A linha do controle positivo (`15/09/2026`) tem de estar **verde** nas duas rodadas: ela é a que
diz que o fuso é -03. Se **ela** cair, pare — o problema é o ambiente, não o código.

- [ ] **Step 3: implementar `formatDate`** — `client/src/components/Compras.js:91-94`

```js
  /**
   * Etapa 39 (D2, RN-D01/RN-D02) — a data e formatada A PARTIR DA STRING, sem `new Date`.
   *
   * O QUE ESTAVA ERRADO (defeito ESCAPADO da Etapa 38): esta funcao era
   * `new Date(date).toLocaleDateString('pt-BR')`. `new Date('2026-09-16')` e meia-noite **UTC** e
   * `toLocaleDateString` renderiza no fuso local, entao em America/Sao_Paulo saia **15/09/2026** —
   * o dia ANTERIOR ao que esta no banco. Valia para `Data Pedido`, `Previsao Entrega`,
   * `Cadastrado em` dos fornecedores e `Data`/`Validade` das cotacoes.
   *
   * E A METADE CARA: a EXPORTACAO usa esta MESMA funcao, e a importacao le `DD/MM/AAAA` — entao
   * exportar e reimportar o proprio Excel do CRM movia as duas datas um dia para tras. A promessa
   * do F6 da Etapa 38 (`ba6278e`) estava cumprida na estrutura e falha no valor.
   *
   * NAO troque por `new Date(str + 'T00:00:00')`: funciona, mas continua criando um `Date` para
   * nao usar nenhum campo dele — e e a forma que o proximo "simplifica" de volta para
   * `new Date(str)`. NAO use `{ timeZone: 'America/Sao_Paulo' }`: acerta hoje e finge que uma
   * data-only tem fuso.
   *
   * Valor com hora (`created_at`, `'2026-09-16 10:33:00'`) -> os 10 primeiros caracteres.
   * Valor que nao casa `AAAA-MM-DD` -> devolvido COMO VEIO, sem `new Date`.
   */
  const formatDate = (date) => {
    if (!date) return '-';
    const iso = String(date).slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) return String(date);
    const [ano, mes, dia] = iso.split('-');
    return `${dia}/${mes}/${ano}`;
  };
```

- [ ] **Step 4: implementar `hojeISO`** — `client/src/components/compras/PedidoCompraForm.js:85`

```js
/**
 * Etapa 39 (D2, RN-D03) — HOJE no fuso de quem clica.
 *
 * Era `new Date().toISOString().slice(0, 10)`, que e **UTC**: das 21h a meia-noite no fuso do
 * Brasil o formulario nascia com a data de AMANHA, e o pedido era gravado com ela. Mesma forma de
 * `FerramentasAlmoxarifado.js:417-424` (client) e de `hojeLocalISO` (`pedidoCompraService.js:615`,
 * servidor) — os tres dizem a mesma coisa, e agora dizem do mesmo jeito.
 */
const hojeISO = () => {
  const agora = new Date();
  return [agora.getFullYear(), String(agora.getMonth() + 1).padStart(2, '0'),
    String(agora.getDate()).padStart(2, '0')].join('-');
};
```

- [ ] **Step 5: rodar de novo, e rodar a suíte de client inteira**

```
cd client && CI=true npx react-scripts test --watchAll=false src/components/Compras.test.js
cd client && CI=true npx react-scripts test --watchAll=false src/components/compras/PedidoCompraForm.test.js
cd client && CI=true npx react-scripts test --watchAll=false
```

Os **21** cenários de `PedidoCompraForm.test.js` têm de continuar verdes (agora 22 com o `(q)`).
Se algum cair, **é achado** — o design mediu que nenhum afirma datas e que o fixture tem previsão
futura; medição errada é dado, registre-a.

- [ ] **Step 6: sabotagens**

| # | Sabotagem | Âncora (`grep -cF` = **1**, **pós-conserto**) | Qual asserção tem de cair |
|---|---|---|---|
| 1 | restaurar o defeito: `return new Date(date).toLocaleDateString('pt-BR');` no lugar do corpo novo | `const [ano, mes, dia] = iso.split('-');` em `Compras.js` | cenário **(a)**: `16/09/2026` esperado, DOM traz `15/09/2026`. **É a sabotagem que prova que a etapa existe** |
| 2 | `hojeISO` de volta para `new Date().toISOString().slice(0, 10)` | `String(agora.getMonth() + 1).padStart(2, '0')` em `PedidoCompraForm.js` | cenário **(q)**: `2026-09-16` esperado, veio `2026-09-17` |
| 3 | trocar `if (!date) return '-';` por `if (date == null) return '-';` | `if (!date) return '-';` em `Compras.js` | cenário **(b)**: `data_pedido: ''` passa a renderizar `''` em vez de `-`. Se **nada** cair, o `(b)` não está afirmando a célula certa — conserte o cenário, não a sabotagem |
| 4 | apagar a linha do controle positivo do cenário (a) | `expect(new Date('2026-09-16').toLocaleDateString('pt-BR')).toBe('15/09/2026');` | **nada cai, e é o ponto**: o controle positivo não protege o código, protege **o cenário**. Restaure e declare — é a resposta a "e se o worker estiver em UTC" |

- [ ] **Step 7: commit** — `git add client/src/components/Compras.js
      client/src/components/compras/PedidoCompraForm.js client/src/components/Compras.test.js
      client/src/components/compras/PedidoCompraForm.test.js`.
      Mensagem em `…\scratchpad\msg-e39-t2.txt`: qual era o bug (`formatDate` usava
      `new Date(string)`, meia-noite UTC renderizada no fuso local, e mostrava o dia **anterior** em
      quatro telas), qual a consequência (a exportacao usa a MESMA funcao e a importacao le
      `DD/MM/AAAA`, entao o Excel do proprio CRM **nao se reimportava com as mesmas datas** — o F6 da
      Etapa 38 cumprido na estrutura e falho no valor; e o formulario nascia com a data de amanha
      depois das 21h), o que foi decidido (formatar a **string** por `split`, sem `Date`; `hojeISO`
      local como em `FerramentasAlmoxarifado` e `hojeLocalISO`) e o descartado
      (`new Date(str+'T00:00:00')`, `timeZone` no `toLocaleDateString`, consertar so a exibicao).
      **Diga no corpo que este é o "defeito escapado" da Etapa 38** — a T6 liga o hash à retro nº 4
      daquele plano.

---

### Task 3: A1 na tela — badge, filtro `Só atrasados` e as duas colunas do Excel **(galho A1)**

**Files:**
- Modify: `client/src/components/Compras.js` — estado (`:34`), `useEffect` (`:49-51`), `loadData`
  (`:64-66`), `linhaExportPedido` (`:151-163`), célula de previsão (`:320`), bloco `.filters`
  (`:447-472`)
- Modify: `client/src/components/Compras.css` (4 linhas)
- Modify: `client/src/components/Compras.test.js` (cenários `(c)`…`(i)`)

**Interfaces:**
- **Consumes:** o **JSON** do contrato 1 — `atrasado: 0|1` e `dias_atraso: number|null` em cada linha
  de `GET /compras/pedidos`; e o filtro `?atrasados=1`. **Mock só na fronteira HTTP** (é a única
  fronteira combinada; mockar o motor institucionalizaria divergência).
- **Produces:** `rotuloAtraso(dias: number): string` (local a `Compras.js`), e as duas colunas do
  contrato 4, que a T5 **não** consome (a T5 é de servidor) e a T6 documenta.

**Restrições medidas, cada uma com o que cai se violada:**

| Não faça | Por quê | Cai em |
|---|---|---|
| pôr o checkbox fora do `activeSection === 'pedidos'` | ⚠️ **o `<div className="filters">` de `:447-472` é COMPARTILHADO pelas três abas** e renderizado **fora** do `switch` (medição nova 2): um controle incondicional aparece na aba de Fornecedores **fazendo nada** | cenário **(g)** |
| mandar `atrasados` sempre (inclusive `0`/`false`) | `?atrasados=0` não liga o filtro no servidor, mas a chave viajaria para `/compras/fornecedores` e `/compras/cotacoes` — ruído de contrato | cenário **(g)**, 2ª metade |
| imprimir a literal com o parêntese (`Atrasado há 3 dia(s)`) | o contrato é `Atrasado há N dia(s)` **resolvido**: `1 dia` / `3 dias` | cenários **(c)** e **(d)** |
| coluna nova "Atraso" na tabela | a aba já tem **7** colunas (`:299-305`) e a informação é *sobre a previsão* — separá-la afasta a causa do efeito (D4, descartado (a)) | nada cai — é decisão escrita |
| linha inteira vermelha | some sob o `status-badge` colorido que já existe (`:322-327`) e é ilegível impressa (D4, descartado (b)) | idem |
| ordenar os atrasados no topo | mudaria `ORDER BY p.created_at DESC`, contrato congelado da extração da 38 (D4, descartado (d)) | `comprasPedidosRotas.api.test.js` |
| mexer nas 11 colunas existentes do export | a asserção do cenário `(p)` de `PedidoCompraForm.test.js:785` **não pode cair** (RN-D08) | aquele cenário |

- [ ] **Step 1: escrever os cenários (c) a (i) em `Compras.test.js`**

Fixtures acrescentadas ao arquivo criado na T2:

```jsx
const PEDIDO_420_ATRASADO_3 = {
  id: 420, numero: 'PC-2026-420', fornecedor_nome: 'Parafusos Sul', valor_total: 90,
  data_pedido: '2026-09-10', previsao_entrega: '2026-09-25', status: 'pendente',
  atrasado: 1, dias_atraso: 3,
};
const PEDIDO_421_ATRASADO_1 = { ...PEDIDO_420_ATRASADO_3, id: 421, numero: 'PC-2026-421', dias_atraso: 1 };
// Itens do 420, para o export (uma linha por ITEM — contrato do F6 da 38).
const ITENS_420 = [{
  id: 4201, material_id: 907, codigo: 'ALM-0907', descricao: 'Chapa Aço 3mm',
  unidade: 'KG', quantidade: 3, valor_unitario: 30, quantidade_recebida: 0,
}];
```

```
(c) RN-D07 pedido com dias_atraso 3 mostra "Atrasado ha 3 dias"
    pedidosDoBanco = [PEDIDO_420_ATRASADO_3]
    expect(texto()).toContain('Atrasado há 3 dias')
    // e a data continua na MESMA celula (o badge nao substitui a previsao):
    expect(texto()).toContain('25/09/2026')

(d) RN-D07 dias_atraso 1 mostra "Atrasado ha 1 dia" (singular)
    expect(texto()).toContain('Atrasado há 1 dia')
    expect(texto()).not.toContain('Atrasado há 1 dias')
    expect(texto()).not.toContain('dia(s)')      // a literal e RESOLVIDA

(e) RN-D07 pedido no prazo NAO mostra a frase (metade positiva de (c)/(d))
    pedidosDoBanco = [PEDIDO_419_NO_PRAZO]
    expect(texto()).not.toContain('Atrasado há')

(f) RN-D07 marcar "So atrasados" manda atrasados=1
    await renderizarEm('/compras/pedidos')
    const antes = api.get.mock.calls.filter(c => c[0] === '/compras/pedidos').length   // 1
    await clicar(checkboxPorRotulo('Só atrasados'))
    const chamadas = api.get.mock.calls.filter(c => c[0] === '/compras/pedidos')
    expect(chamadas).toHaveLength(antes + 1)                       // UMA a mais, nao duas
    expect(chamadas[antes][1].params.atrasados).toBe(1)
    // desmarcar dispara outra SEM a chave:
    await clicar(checkboxPorRotulo('Só atrasados'))
    const depois = api.get.mock.calls.filter(c => c[0] === '/compras/pedidos')
    expect(depois).toHaveLength(antes + 2)
    expect('atrasados' in depois[antes + 1][1].params).toBe(false)

(g) RN-D07 na aba Fornecedores o checkbox nao existe
    await renderizarEm('/compras/fornecedores')
    expect(texto()).not.toContain('Só atrasados')
    expect(container.querySelector('input[type="checkbox"]')).toBeNull()
    // e a chave nunca viaja para a rota da outra aba:
    const f = api.get.mock.calls.filter(c => c[0] === '/compras/fornecedores')
    expect(f.length).toBeGreaterThan(0)
    f.forEach(c => expect('atrasados' in c[1].params).toBe(false))

(h) RN-D02/RN-D08 o Excel exportado leva a data do banco e as duas colunas novas
    pedidosDoBanco = [PEDIDO_420_ATRASADO_3]; itensDoBanco[420] = ITENS_420
    await clicar(botaoPorTexto('Exportar Excel'))
    const [linhas, arquivo] = exportToExcel.mock.calls[0]
    expect(arquivo).toBe('pedidos_compra')
    expect(linhas).toHaveLength(1)
    expect(linhas[0]['Data']).toBe('10/09/2026')              // RN-D02: NAO 09/09/2026
    expect(linhas[0]['Previsão Entrega']).toBe('25/09/2026')  //         NAO 24/09/2026
    expect(linhas[0]['Atrasado']).toBe('Sim')
    expect(linhas[0]['Dias de atraso']).toBe(3)
    expect(typeof linhas[0]['Dias de atraso']).toBe('number')
    // AS 11 COLUNAS DA ETAPA 38 CONTINUAM IDENTICAS (a asserção que protege o cenário (p) de la):
    expect(linhas[0]['Código']).toBe('ALM-0907')
    expect(linhas[0]['Quantidade']).toBe(3)
    expect(linhas[0]['Valor Unitário']).toBe(30)
    expect(Object.keys(linhas[0])).toEqual([
      'Número','Fornecedor','Código','Descrição','Unidade','Quantidade','Valor Unitário',
      'Valor Total','Status','Data','Previsão Entrega','Atrasado','Dias de atraso',
    ])                                        // ORDEM congelada: as duas novas NO FIM

(i) RN-D08 pedido no prazo exporta "Nao" e coluna de dias vazia
    PEDIDO_419_NO_PRAZO -> linhas[0]['Atrasado'] === 'Não'
                           linhas[0]['Dias de atraso'] === ''   (nunca 0, nunca '-')
```

> ⚠️ **O mock de `api.get` precisa responder `/compras/pedidos/:id`** (a exportação faz 1 GET por
> pedido desde o F6 da 38, `ba6278e`) — copie o ramo da regex de `PedidoCompraForm.test.js:177-182`,
> **igualdade antes da regex**, e devolva `{ ...PEDIDO_420_ATRASADO_3, itens: ITENS_420 }`. Sem esse
> ramo o fallback **rejeita** e os cenários `(h)`/`(i)` medem o `catch` da tela, não a tela.

- [ ] **Step 2: rodar e LER os números**

```
cd client && CI=true npx react-scripts test --watchAll=false src/components/Compras.test.js
```

Previsão do RED: `(c)`, `(d)` caem com `Expected substring: "Atrasado há 3 dias"` (o DOM não tem a
frase); `(f)` cai com `Cannot read properties of null` no checkbox (ele não existe) ou com
`toHaveLength(2)` recebendo `1`; `(h)` cai em `Object.keys` com **11** chaves em vez de 13. `(e)` e
`(g)` **nascem verdes** — são as metades negativas, e é por isso que não bastam sozinhas.

- [ ] **Step 3: implementar o badge e o rótulo** — `client/src/components/Compras.js`

Ao lado de `getStatusColor` (`:96-108`):

```js
  /**
   * Etapa 39 (RN-D07) — a literal do contrato e `Atrasado há N dia(s)` **RESOLVIDA**: o
   * parenteses e notacao do contrato, nunca texto de tela. 1 -> "1 dia"; 3 -> "3 dias".
   */
  const rotuloAtraso = (dias) => `Atrasado há ${dias} ${Number(dias) === 1 ? 'dia' : 'dias'}`;
```

A célula de previsão (`:320`) passa a ser:

```jsx
                  <td>
                    {formatDate(pedido.previsao_entrega)}
                    {pedido.atrasado === 1 && (
                      <span className="pedido-atrasado">{rotuloAtraso(pedido.dias_atraso)}</span>
                    )}
                  </td>
```

E em `client/src/components/Compras.css`:

```css
/* Etapa 39 (RN-D07): o badge de atraso mora DENTRO da celula de previsao — a informacao e sobre
   a previsao, e uma coluna a mais afastaria a causa do efeito. Mesmo #e74c3c que `getStatusColor`
   ja usa para `rejeitado`/`cancelado`. Nenhuma biblioteca, nenhum icone. */
.pedido-atrasado { color: #e74c3c; font-weight: 600; font-size: .78rem; display: block; }
```

- [ ] **Step 4: implementar o filtro** — estado, efeito e `loadData`

```js
  const [filterStatus, setFilterStatus] = useState('');
  // Etapa 39 (RN-D07): viaja como `params.atrasados` e entra nas dependencias do efeito que ja
  // re-dispara por `search` e `status` — um `param` a mais e uma dependencia a mais, zero
  // refatoracao (`loadData` ja passa params no mesmo `api.get`).
  const [soAtrasados, setSoAtrasados] = useState(false);
```

```js
  useEffect(() => {
    loadData();
  }, [activeSection, search, filterStatus, soAtrasados]);
```

```js
        case 'pedidos':
          // A chave `atrasados` so entra quando o checkbox esta marcado: manda-la sempre faria
          // `?atrasados=0` viajar em toda listagem, e o servidor so liga com a string '1'.
          const pedidosRes = await api.get('/compras/pedidos', {
            params: soAtrasados
              ? { search, status: filterStatus, atrasados: 1 }
              : { search, status: filterStatus }
          });
          setPedidos(pedidosRes.data || []);
          break;
```

E o controle, **dentro** do `<div className="filters">` (`:447-472`), depois do `.filter-group` do
status:

```jsx
        {/* Etapa 39 (RN-D07): CONDICIONAL a aba Pedidos. O bloco `.filters` e renderizado FORA do
            switch de abas e e compartilhado pelas tres — um checkbox incondicional apareceria na
            aba de Fornecedores sem fazer nada. */}
        {activeSection === 'pedidos' && (
          <label className="filter-group filter-atrasados">
            <input
              type="checkbox"
              checked={soAtrasados}
              onChange={(e) => setSoAtrasados(e.target.checked)}
            />
            Só atrasados
          </label>
        )}
```

- [ ] **Step 5: implementar as duas colunas** — `linhaExportPedido` (`:151-163`), **no fim do
      objeto**, sem mexer nas 11 existentes

```js
    'Data': formatDate(pedido.data_pedido),
    'Previsão Entrega': formatDate(pedido.previsao_entrega),
    // Etapa 39 (RN-D08). Campos do CABECALHO: repetem-se em todas as linhas do mesmo pedido, e
    // isso e declarado. A importacao le por grafia conhecida de cabecalho e IGNORA as duas, como
    // ja faz com `Status` e `Valor Total`.
    'Atrasado': pedido.atrasado === 1 ? 'Sim' : 'Não',
    'Dias de atraso': pedido.atrasado === 1 ? pedido.dias_atraso : ''
  });
```

- [ ] **Step 6: rodar de novo, e a suíte de client inteira + o build**

```
cd client && CI=true npx react-scripts test --watchAll=false src/components/Compras.test.js
cd client && CI=true npx react-scripts test --watchAll=false src/components/compras/PedidoCompraForm.test.js
cd client && CI=true npx react-scripts test --watchAll=false
cd client && CI=true npx react-scripts build
```

⚠️ `CI=true` no build faz **warning virar erro** — uma variável não usada derruba a rodada.

- [ ] **Step 7: sabotagens**

| # | Sabotagem | Âncora (`grep -cF` = **1**, **pós-conserto**) | Qual asserção tem de cair |
|---|---|---|---|
| 1 | tirar o singular: `` `Atrasado há ${dias} dias` `` | `${Number(dias) === 1 ? 'dia' : 'dias'}` em `Compras.js` | cenário **(d)**: `Atrasado há 1 dia` esperado, DOM traz `Atrasado há 1 dias` |
| 2 | tirar a condicional da aba: `{true && (` no lugar de `{activeSection === 'pedidos' && (` | `{activeSection === 'pedidos' && (` em `Compras.js` | cenário **(g)**: `Só atrasados` aparece na aba Fornecedores |
| 3 | mandar a chave sempre: `params: { search, status: filterStatus, atrasados: soAtrasados ? 1 : 0 }` | `? { search, status: filterStatus, atrasados: 1 }` em `Compras.js` | cenário **(f)**, 2ª metade: `'atrasados' in params` passa a ser `true` depois de desmarcar |
| 4 | `'Dias de atraso': pedido.dias_atraso` (sem o ternário) | `pedido.atrasado === 1 ? pedido.dias_atraso : ''` em `Compras.js` | cenário **(i)**: `''` esperado, veio `null` |
| 5 | trocar `pedido.atrasado === 1` por `pedido.atrasado` no badge | `{pedido.atrasado === 1 && (` em `Compras.js` | **provavelmente nada cai** (o contrato garante `0`/`1`, e `0` é falsy). **Previsto:** declare, e mantenha a forma estrita — ela é o que protege de um dia a rota devolver `null` |

- [ ] **Step 8: commit** — `git add client/src/components/Compras.js
      client/src/components/Compras.css client/src/components/Compras.test.js`.
      Mensagem em `…\scratchpad\msg-e39-t3.txt`: qual era o furo (a aba **já mostrava** a previsão de
      entrega e não tinha nenhuma nocao de que a data passou — sem badge, sem filtro, sem cor; o
      comprador fazia a conta de cabeca, pedido a pedido), o que foi decidido (badge **dentro** da
      celula de previsao, checkbox condicional a aba Pedidos, duas colunas **no fim** do export) e o
      descartado (coluna "Atraso" na tabela — a aba ja tem 7; linha inteira vermelha — some sob o
      status-badge; biblioteca de badge; ordenar atrasados no topo — mudaria o `ORDER BY` congelado).

---

### Task 4: `PEDIDO_COMPRA_ATRASADO` — uma entrada no registro de alertas **(tronco)**

**Files:**
- Modify: `server/services/almoxarifado/alertRegistry.js` (a entrada, **antes do `]);` de `:461`**)
- Modify: `client/src/components/almoxarifado/AlertasAlmoxarifado.js:88` (`COLUNAS_POR_CHAVE`)
- Modify: `client/src/components/almoxarifado/AlertasAlmoxarifado.test.js` (um cenário)
- Create: `server/tests/api/alertaPedidoAtrasado.api.test.js`

**Interfaces:**
- **Consumes:** `hojeLocalISO()` e `derivarAtraso(pedido, hoje)` de
  `services/compras/pedidoCompraService` (T1) — **por require LAZY dentro do `listar`**; `dbAll` de
  `./db` (já no topo de `alertRegistry.js:17`); `varrerAlertasRegistrados(db, registro?)` e
  `montarCentral(db, registro?)` (existentes, **não tocados**).
- **Produces:** a entrada do contrato 3. A T5 consome `varrerAlertasRegistrados(db)` e a fila
  `fila_notificacoes_almoxarifado` filtrada por `evento = 'PEDIDO_COMPRA_ATRASADO'`.

**Restrições medidas, cada uma com o que cai se violada:**

| Não faça | Por quê | Cai em |
|---|---|---|
| require de **topo** da régua | **R9b** — o cabeçalho deste arquivo (`:9-13`) documenta por escrito que requires aqui são lazy de propósito, e `receiptService.js:26,31` já requer `purchaseService` **e** `alertRegistry` no topo: basta um require novo no meio do caminho para o ciclo fechar e um dos lados capturar `{}` mid-load | ver o **controle de ciclo** do Step 2 e a **divergência declarada** abaixo |
| repetir a régua em SQL (`WHERE previsao_entrega < date('now') AND status NOT IN …`) | seria a **segunda definição de atrasado** — o erro que a RN-D11 existe para pegar; e `date('now')` é UTC | cenário **(5)** |
| filtrar a fila por total global | ⚠️ nota de cabeçalho de `alertaRegistro.api.test.js:6-8`: materiais semeados sem movimentação caem **automaticamente** em `ESTOQUE_SEM_CONSUMO` | o cenário mediria outro alerta e passaria por acidente |
| prefixo `[Almoxarifado]` no assunto | o documento é de **Compras** e a lista é compartilhada — o prefixo é o que permite o leitor filtrar (D5, descartado (e)) | cenário **(3)** |
| `configDias` / `alerta_pedido_atrasado_dias` | seria "atrasado há mais de N dias", **uma segunda régua**, diferente da da tela — e obrigaria mexer em `ConfiguracoesAlmoxarifado.js` por contrato de teste (`configuracoesGerais.api.test.js:43,92`) | nada cai — decisão escrita (D5, descartado (c)) |
| `JOIN` no lugar de `LEFT JOIN` em `fornecedores` | pedido órfão de fornecedor deixaria de alertar (R9) | cenário **(1)**, se a fixture incluir um pedido sem fornecedor |
| tocar `notificationQueueService.js` | NÃO-TOQUE: a entrada nova **não** desliga o `try/catch` por entrada (R8) | cenário **(4)** |

> **(divergência do design) — o ciclo de módulos do R9b não fecha hoje, e foi medido.** O design
> (medição nova 9 / R9b) afirma o ciclo
> `alertRegistry -> pedidoCompraService -> purchaseService -> notificationQueueService ->
> alertRegistry`. **A última aresta não existe:** `notificationQueueService` requer `alertRegistry`
> **lazy**, dentro das funções (`notificationQueueService.js:581` e `:647`), não no topo — medido com
> `grep -n "require('./alertRegistry')"`, que devolve **quatro** ocorrências e só duas são de topo
> (`inspectionService.js:23` e `receiptService.js:31`), nenhuma delas no caminho de
> `pedidoCompraService`. **Consequência para a task: a sabotagem "mover o require para o topo"
> provavelmente NÃO reproduz o `{}` mid-load** — o plano prevê **"nada cai"** e isso é resultado legal
> **de declarar**. **A decisão R9b fica de pé assim mesmo**, por dois motivos escritos: (a) é a
> convenção **documentada** do arquivo (`:9-13`), e um require de topo aqui seria o primeiro a
> contrariá-la; (b) a aresta está a **um** require de distância — `receiptService.js` já requer
> `purchaseService` (`:26`) **e** `alertRegistry` (`:31`) no topo, então qualquer require novo de
> `receiptService` na cadeia de Compras fecharia o ciclo de verdade, e aí o modo de falha é
> silencioso. **O design tem de ser corrigido no fechamento**, dizendo que a afirmação estava errada
> no mecanismo e certa na conclusão (regra 5 do `CLAUDE.md`).

- [ ] **Step 1: escrever o teste** — `server/tests/api/alertaPedidoAtrasado.api.test.js`

**Molde:** `server/tests/api/alertaRegistro.api.test.js` — copie `hashDedupe(evento, chave)`
(`:28-30`), o runner, o `ADMIN`, `filaPorEvento(db, evento)` e `resultadoDe(resultados, chave)`.
**Arquivo novo e não cenário acrescentado lá**, e está declarado: `alertaRegistro` é o contrato da
Etapa 16 e semeia materiais que caem sozinhos em `ESTOQUE_SEM_CONSUMO`.

```js
/**
 * Etapa 39, Task 4 (RN-D09, RN-D10, RN-D11, RN-D13) — a entrada PEDIDO_COMPRA_ATRASADO do
 * registro de alertas.
 *
 * ⚠️ TODA assercao filtra a fila por `evento`, NUNCA por total global (nota de cabecalho de
 * alertaRegistro.api.test.js:6-8).
 *
 * ⚠️ PRIMEIRA entrada do registro que le tabelas CORE (`pedidos_compra`, `fornecedores`): as 11
 * anteriores so leem `*_almoxarifado`. Mesmo handle, mesmo arquivo SQLite — decisao de
 * arquitetura declarada na letra B do doc de novidades.
 *
 * Executar: cd server && node tests/api/alertaPedidoAtrasado.api.test.js
 */
const assert = require('assert');
const crypto = require('crypto');
const request = require('supertest');
const { createTestApp } = require('../helpers/testApp');
const { dbRun, dbGet, dbAll } = require('../../services/almoxarifado/db');
const queueService = require('../../services/almoxarifado/notificationQueueService');
const alertRegistry = require('../../services/almoxarifado/alertRegistry');
const { hojeLocalISO } = require('../../services/compras/pedidoCompraService');
```

```
(1) RN-D09 cinco pedidos, UM alerta
    semear: atrasado/pendente (P1), no prazo (P2), sem previsao (P3),
            atrasado/recebido (P4), atrasado/cancelado (P5)
    configurar destinatarios: UPDATE configuracoes_almoxarifado SET valor='compras@gmp.ind.br'
      WHERE chave='alertas_estoque_emails'  (e garantir o toggle mestre LIGADO)
    await queueService.varrerAlertasRegistrados(db)
    const fila = await filaPorEvento(db, 'PEDIDO_COMPRA_ATRASADO')
    assert.strictEqual(fila.length, 1, 'esperava 1 alerta, veio ' + fila.length)
    assert.strictEqual(JSON.parse(fila[0].payload).pedido_compra_id, P1.id)
    assert.strictEqual(JSON.parse(fila[0].payload).dias_atraso, 1)
    metade que mede o dano: um SEXTO pedido atrasado SEM fornecedor (fornecedor_id null)
      -> entra tambem (LEFT JOIN, R9) e o corpo traz 'Fornecedor: -'

(2) RN-D10 a segunda varredura e DUPLICADA, a fila nao cresce
    const r = resultadoDe(await queueService.varrerAlertasRegistrados(db), 'PEDIDO_COMPRA_ATRASADO')
    assert.deepStrictEqual({ enfileiradas: r.enfileiradas, duplicadas: r.duplicadas },
                           { enfileiradas: 0, duplicadas: 1 })
    assert.strictEqual((await filaPorEvento(db,'PEDIDO_COMPRA_ATRASADO')).length, 1)
    e o hash confere: fila[0].hash_dedupe === hashDedupe('PEDIDO_COMPRA_ATRASADO',
                                                        `pedido-atrasado-${P1.id}`)

(3) RN-D09 assunto e corpo
    assert(fila[0].assunto === `[Compras] Pedido de compra atrasado — ${P1.numero}`)
      // literal exata, com o travessao — e com [Compras], NAO [Almoxarifado]
    corpo contem `Pedido: ${P1.numero}`, `Fornecedor: Acos Vale E39`,
                 `Previsão de entrega: ${previsaoDeP1}`, `Atraso: 1 dia(s)`, `Status: pendente`
    // no CORPO o `dia(s)` e literal (e e-mail, nao tela) — na TELA e resolvido (RN-D07)

(4) RN-D09 a central monta o cartao
    const { alertas } = await alertRegistry.montarCentral(db)
    const cartao = alertas.find(a => a.chave === 'PEDIDO_COMPRA_ATRASADO')
    assert.ok(cartao, 'a central nao tem o cartao novo')
    assert.strictEqual(cartao.erro, undefined, 'listar lancou: ' + cartao.erro_mensagem)
    assert.strictEqual(cartao.total, 1)
    assert.strictEqual(cartao.titulo, 'Pedido de compra atrasado')
    // ⚠️ E ESTE E O CENARIO QUE ACUSA UM `{}` CAPTURADO mid-load (R9b): com o require quebrado,
    // `derivarAtraso` vem undefined, o `listar` lanca e o cartao vem `erro: true` — a central
    // NAO quebra (try/catch por entrada, R8), entao sem esta assercao o defeito seria mudo.
    // metade positiva: as 11 entradas anteriores continuam na central
    assert.strictEqual(alertas.length, 12)

(5) RN-D11 os ids do alerta sao os MESMOS ids de atrasado=1 na rota
    semear TAMBEM um pedido 'rejeitado' com previsao vencida (o que pega a lista escrita duas vezes)
    const daRota = (await request(app).get('/api/compras/pedidos'))
        .body.filter(p => p.atrasado === 1).map(p => p.id).sort((a,b) => a-b)
    const entrada = alertRegistry.ALERT_REGISTRY.find(e => e.chave === 'PEDIDO_COMPRA_ATRASADO')
    const doAlerta = (await entrada.listar(db, { dias: null })).map(l => l.id).sort((a,b) => a-b)
    assert.deepStrictEqual(doAlerta, daRota, 'a regua do alerta divergiu da regua da tela')

(6) RN-D09 e-mail desligado: nenhum alerta, e o motivo declarado
    UPDATE configuracoes_almoxarifado SET valor='false' WHERE chave='alertas_estoque_notificar_email'
    -> resultadoDe(...).motivo === 'email desligado' e a fila NAO cresce
    metade positiva no MESMO test(): religar e varrer -> a entrada volta a aparecer no resultado
    (com `duplicadas: 1`, porque o pedido ja foi avisado — e isso e a RN-D10 de novo)

(7) RN-D13 o listar e chamado SEM req
    await entrada.listar(db, { dias: null })   // nao lanca
    // se alguem acrescentar `req.user` ali, isto cai com TypeError de undefined
```

- [ ] **Step 2: escrever o CONTROLE DE CICLO** — no mesmo arquivo, como último `test()`

```js
  await test('(8) R9b o alertRegistry carrega de um processo FRIO e traz a entrada nova', async () => {
    // Processo NOVO, cache de modulos vazio, e o alertRegistry como PRIMEIRO require: e a ordem
    // de carga que um require de topo da regua tornaria arriscada. `{}` mid-load nao lanca — ele
    // devolve um objeto vazio, e o modo de falha e silencioso.
    const { execFileSync } = require('child_process');
    const saida = execFileSync(process.execPath, ['-e', `
      const r = require('./services/almoxarifado/alertRegistry');
      const e = r.ALERT_REGISTRY.find((x) => x.chave === 'PEDIDO_COMPRA_ATRASADO');
      console.log(JSON.stringify({ total: r.ALERT_REGISTRY.length, tem: !!e, listar: typeof (e && e.listar) }));
    `], { cwd: require('path').join(__dirname, '..', '..'), encoding: 'utf8' });
    const medido = JSON.parse(saida.trim().split('\n').pop());
    assert.deepStrictEqual(medido, { total: 12, tem: true, listar: 'function' },
      `carga a frio devolveu ${saida.trim()}`);
  });
```

- [ ] **Step 3: rodar e LER os números**

```
cd server && node tests/api/alertaPedidoAtrasado.api.test.js
```

Previsão do RED: `(1)` cai com **`esperava 1 alerta, veio 0`**; `(4)` cai com **`a central nao tem o
cartao novo`** e com `alertas.length === 11`; `(5)` cai com `doAlerta` sendo `undefined` (a entrada
não existe); `(8)` cai com `{"total":11,"tem":false,"listar":"undefined"}`. `(6)` e `(7)` podem
nascer verdes — leia **qual** asserção caiu.

- [ ] **Step 4: implementar a entrada** — `server/services/almoxarifado/alertRegistry.js`, **antes do
      `]);` de `:461`**, depois da entrada `LOTE_SEM_CERTIFICADO`

```js
  {
    chave: 'PEDIDO_COMPRA_ATRASADO',
    titulo: 'Pedido de compra atrasado',
    descricao: 'Pedidos de compra com previsão de entrega vencida e ainda não recebidos.',
    configDias: null,
    // Regua UNICA, importada do modulo Compras (services/compras/pedidoCompraService): a tela e o
    // alerta nao podem ter duas definicoes de "atrasado" (RN-D11). O SQL so PRE-FILTRA pelo unico
    // termo que ja e da propria regua (`previsao_entrega IS NOT NULL`) — e um SUPERCONJUNTO, nao
    // uma segunda formula: quem decide linha a linha e o `derivarAtraso`.
    //
    // ⚠️ CONSULTA CROSS-MODULO: `pedidos_compra`/`fornecedores` sao tabelas CORE
    // (`server/index.js:19230`), e as 11 entradas anteriores so leem tabelas `*_almoxarifado`.
    // Mesmo handle, mesmo arquivo SQLite; decisao de arquitetura declarada na letra B.
    //
    // ⚠️ REQUIRE **LAZY**, e nao e estilo — e a convencao escrita no cabecalho deste arquivo
    // (`:9-13`) para purchaseService/inspectionService/toolService. MEDIDO na Etapa 39: hoje o
    // ciclo NAO fecha (notificationQueueService requer ESTE arquivo lazy, em `:581` e `:647`),
    // entao um require de topo funcionaria — e e exatamente por isso que ele e perigoso: o
    // ciclo esta a UM require de distancia (`receiptService.js:26` requer purchaseService e
    // `:31` requer este arquivo, os dois no topo), e quando fechar, um dos lados captura `{}`
    // mid-load, `derivarAtraso` vem `undefined` e o cartao aparece com `erro: true` em vez de
    // quebrar a suite. Falha silenciosa; o require lazy custa nada.
    //
    // LEFT JOIN, nao JOIN: pedido orfao de fornecedor tambem atrasa (R9).
    listar: async (db) => {
      const { hojeLocalISO, derivarAtraso } = require('../compras/pedidoCompraService');
      const hoje = hojeLocalISO();
      const linhas = await dbAll(db, `
        SELECT p.*, f.razao_social AS fornecedor_nome
        FROM pedidos_compra p
        LEFT JOIN fornecedores f ON f.id = p.fornecedor_id
        WHERE p.previsao_entrega IS NOT NULL
        ORDER BY p.previsao_entrega ASC`);
      return linhas
        .map((l) => ({ ...l, ...derivarAtraso(l, hoje) }))
        .filter((l) => l.atrasado === 1);
    },
    dedupeChave: (linha) => `pedido-atrasado-${linha.id}`,
    payload: (linha) => ({ pedido_compra_id: linha.id, dias_atraso: linha.dias_atraso }),
    assunto: (linha) => `[Compras] Pedido de compra atrasado — ${linha.numero}`,
    corpo: (linha) => [
      `Pedido: ${linha.numero}`,
      `Fornecedor: ${linha.fornecedor_nome || '-'}`,
      `Previsão de entrega: ${linha.previsao_entrega}`,
      `Atraso: ${linha.dias_atraso} dia(s)`,
      `Status: ${linha.status}`,
    ].join('\n'),
  },
```

- [ ] **Step 5: a central in-app** — `client/src/components/almoxarifado/AlertasAlmoxarifado.js`,
      em `COLUNAS_POR_CHAVE` (`:88`)

```jsx
  PEDIDO_COMPRA_ATRASADO: [
    { titulo: 'Pedido', render: (l) => l.numero || `#${l.id}` },
    { titulo: 'Fornecedor', render: (l) => l.fornecedor_nome || '—' },
    { titulo: 'Previsão', render: (l) => (l.previsao_entrega ? formatData(l.previsao_entrega) : '—') },
    { titulo: 'Dias de atraso', render: (l) => (l.dias_atraso ?? '—') },
  ],
```

E um cenário em `AlertasAlmoxarifado.test.js`: a central com um alerta `PEDIDO_COMPRA_ATRASADO`
renderiza **`Pedido`**, **`Fornecedor`**, **`Previsão`** e **`Dias de atraso`** com os valores da
linha — **em vez** do fallback genérico (`colunasGenericas`, `:182-193`), que mostraria `id`,
`fornecedor_id` e `valor_total` crus.

- [ ] **Step 6: rodar de novo, e rodar TUDO que toca o registro e a fila**

```
cd server && node tests/api/alertaPedidoAtrasado.api.test.js
cd server && node tests/api/alertaRegistro.api.test.js
cd server && node tests/api/alertaCentral.api.test.js
cd server && node tests/api/alertaEvento.api.test.js
cd server && node tests/api/comprasPedidoAtraso.api.test.js
cd server && npm run test:api
cd client && CI=true npx react-scripts test --watchAll=false src/components/almoxarifado/AlertasAlmoxarifado.test.js
```

⚠️ `alertaCentral.api.test.js` pode afirmar o **número** de cartões da central. Se cair por `11 !== 12`,
**é achado esperado**: atualize o número **e diga no plano que atualizou**, porque essa asserção é
justamente a que prova que a entrada nova entrou.

- [ ] **Step 7: sabotagens**

| # | Sabotagem | Âncora (`grep -cF` = **1**, **pós-conserto**) | Qual asserção tem de cair |
|---|---|---|---|
| 1 | tirar o `.filter`: `return linhas.map((l) => ({ ...l, ...derivarAtraso(l, hoje) }));` | `.filter((l) => l.atrasado === 1);` em `alertRegistry.js` | cenário **(1)**: `esperava 1 alerta, veio 3` (os no-prazo e os excluídos entram) — **e o (5) também**, porque os conjuntos deixam de bater |
| 2 | segunda régua em SQL: acrescentar `AND p.previsao_entrega < date('now')` ao `WHERE` e trocar o filtro por `l => true` | `WHERE p.previsao_entrega IS NOT NULL` em `alertRegistry.js` | cenário **(5)**, com o pedido `rejeitado` vencido entrando no alerta e não na rota — **é a sabotagem que a RN-D11 existe para provar** |
| 3 | prefixo errado: `[Almoxarifado]` no `assunto` | `` `[Compras] Pedido de compra atrasado — ${linha.numero}` `` | cenário **(3)** |
| 4 | `dedupeChave: () => 'pedido-atrasado'` (sem o id) | `` `pedido-atrasado-${linha.id}` `` | cenário **(1)** com dois pedidos atrasados: só **1** linha na fila para **2** pedidos |
| 5 | **mover o require da régua para o topo do arquivo** (require de topo em vez de lazy) | `const { hojeLocalISO, derivarAtraso } = require('../compras/pedidoCompraService');` | ⚠️ **PREVISÃO: NADA CAI** — medido, o ciclo não fecha hoje (ver a divergência declarada acima). O candidato a cair seria o **(4)** (`cartao.erro === true`, porque `derivarAtraso` viria `undefined`) e o **(8)** (`{"tem":false}` ou `listar: "undefined"`). **Se nada cair, declare** na letra G: *a suíte não protege a convenção do require lazy; a proteção é o comentário do código e esta linha do plano*. **Mantenha o require lazy de qualquer forma** |

- [ ] **Step 8: commit** — `git add server/services/almoxarifado/alertRegistry.js
      server/tests/api/alertaPedidoAtrasado.api.test.js
      client/src/components/almoxarifado/AlertasAlmoxarifado.js
      client/src/components/almoxarifado/AlertasAlmoxarifado.test.js` (+ o arquivo de teste de alerta
      cujo contador mudou, se houver). Mensagem em `…\scratchpad\msg-e39-t4.txt`: qual era o furo
      (ninguem era avisado de pedido vencido — o dado existia desde a 38 e nenhum canal o lia), o que
      foi decidido (**uma** entrada no registro existente, que liga varredura + central + dedupe sem
      tocar em mais nada; regua **importada** do Compras por require lazy; prefixo `[Compras]`; lista
      `alertas_estoque_emails` porque e a unica que a varredura le e em producao e identica a
      `compras_notificar_emails`) e o descartado (segunda fila de alertas em Compras; cron proprio —
      a base usa `setInterval().unref()`; `configDias` — seria uma segunda regua; disparo no ato —
      atraso nao tem ato). **Diga que o alerta nasce INERTE** (`previsao_entrega` preenchida em 0
      pedidos no dump medido) — isso vai para o guia do usuário, não só para a letra B.

---

### Task 5: a integração que cruza pela ROTA e pelo JOB (D10 / RN-D12 / RN-D14)

**Files:** Create `server/tests/api/comprasPedidoAtrasoIntegracao.api.test.js`

> É o **aceite da etapa**. Verde por unidade não prova que as partes compõem — e aqui há **fiação**
> (o job varre o registro, que importa a régua da rota, que lê a tabela que o serviço escreve).

**Interfaces:**
- **Consumes:** `pedidoCompraService.criarPedido(db, dados, user)` (Etapa 38, **o serviço real** —
  nunca `INSERT` direto); `GET /api/compras/pedidos` e `?atrasados=1` (T1);
  `queueService.varrerAlertasRegistrados(db)` (existente) com a entrada da T4;
  `POST /api/almoxarifado/recebimentos` + as três portas do workflow + `processar` (Etapa 37,
  **pelas rotas reais**, molde `recebimentoContraPedidoIntegracao.api.test.js:148-210`);
  `PUT /api/compras/pedidos/:id` (Etapa 38).
- **Produces:** nada de código — produz o **número** que o fechamento cita.

- [ ] **Step 1: escrever o roteiro inteiro, em blocos, na ordem da RN-D14**

```
BLOCO A — o pedido nasce ATRASADO, pelo SERVICO real
  1. pedidoCompraService.criarPedido(db, { fornecedor_id, previsao_entrega: <ontem>,
       itens: [{ material_id, quantidade: 10, valor_unitario: 4 }] }, ADMIN) -> { id, numero }
     ⇐ NUNCA `INSERT INTO pedidos_compra` direto: um INSERT a mao e o atalho que escondeu
       defeito na Etapa 37, e aqui pularia a geracao do `numero` que o assunto do e-mail usa

BLOCO B — pela ROTA
  2. GET /api/compras/pedidos -> a linha do pedido traz atrasado: 1, dias_atraso: 1
  3. GET /api/compras/pedidos?atrasados=1 -> traz ELE, e um segundo pedido com previsao de
     AMANHA (criado no mesmo bloco) NAO esta na resposta

BLOCO C — pelo JOB
  4. varrerAlertasRegistrados(db) -> filaPorEvento('PEDIDO_COMPRA_ATRASADO').length === 1
     assunto contem o `numero` gerado no passo 1
     payload.pedido_compra_id === o id do passo 1

BLOCO D — RN-D12: receber pelas portas da Etapa 37 NAO muda o atraso
  5. POST /api/almoxarifado/recebimentos { pedido_compra_id, itens: [itemDaTela(mat, linha, 10)] }
  6. conferir -> encaminhar_compras -> finalizar_compras -> iniciar_faturamento -> fiscal ->
     processar     (as portas REAIS, nenhum UPDATE de status a mao)
  7. GET /almoxarifado/recebimentos-aux/pedidos-compra?search=<numero>
       -> situacao_recebimento === 'RECEBIDO'
  8. GET /api/compras/pedidos -> a MESMA linha CONTINUA com atrasado: 1
     ⇐ E ESTE PASSO QUE TRANSFORMA A LIMITACAO D6 EM REGUA: se um dia a feature 08 fizer o
       recebimento gravar `status`, e ELE que cai e avisa que a limitacao acabou

BLOCO E — o status fecha o ciclo
  9. PUT /api/compras/pedidos/:id { …o pedido…, status: 'recebido' } -> 200
     ⚠️ a regra da RN-C07 recusa o PUT de pedido COM recebimento ('ja teve recebimento — nao pode
        mais ser editado'). Este bloco usa um SEGUNDO pedido, atrasado e SEM recebimento, para o
        PUT passar — e o pedido do BLOCO D fica com o 400 AFIRMADO, que e a composicao das duas
        regras e vale como cenario proprio.
 10. GET /api/compras/pedidos -> aquele pedido com atrasado: 0 e dias_atraso: null

BLOCO F — a varredura de novo
 11. varrerAlertasRegistrados(db) -> o resultado da entrada traz enfileiradas: 0
     e filaPorEvento('PEDIDO_COMPRA_ATRASADO') continua com as MESMAS linhas
     ⇐ fila e HISTORICO, nao estado: a linha antiga fica: o que nao pode e nascer linha nova
```

- [ ] **Step 2: rodar e LER os números**

```
cd server && node tests/api/comprasPedidoAtrasoIntegracao.api.test.js
```

⚠️ **Previsão: verde de primeira** (T1–T4 entregaram cada peça). **Isto é suspeito por regra desta
base** — a `fechar-etapa` documenta quatro casos de teste vazio. Rode as sabotagens do Step 3
**antes** de considerar o arquivo pronto.

- [ ] **Step 3: sabotagens de composição** (as âncoras são as **mesmas** das tasks anteriores — a
      pergunta aqui é se a composição também cai)

| # | Sabotagem | Âncora | Qual asserção tem de cair |
|---|---|---|---|
| 1 | `<` → `<=` em `derivarAtraso` | `if (!(previsao < hoje)) return semAtraso;` | o passo **2** continua verde (ontem é ontem), mas o passo **10** cai se o PUT usar previsão = hoje. **Se não cair, acrescente ao BLOCO E um pedido com previsão = hoje** — a integração tem de exercitar a fronteira, não só o caso fácil |
| 2 | remover o `.filter` da entrada do registro | `.filter((l) => l.atrasado === 1);` | passo **4**: `fila.length === 1` recebe 2+ (o pedido de amanhã entra) |
| 3 | tirar `'recebido'` de `STATUS_PEDIDO_FORA_DO_ATRASO` | `const STATUS_PEDIDO_FORA_DO_ATRASO = ['recebido', 'cancelado', 'rejeitado'];` | passo **10**: `atrasado: 0` esperado, veio `1` — **e é a sabotagem que prova que o BLOCO E mede alguma coisa** |
| 4 | fazer o `processar` da 37 gravar `status='recebido'` no pedido (simular a feature 08) | — (edição pontual em `receiptService`, **restaurada imediatamente**; **não commitável**, é só sonda) | passo **8**: `atrasado: 1` esperado, veio `0`. ⚠️ **Toca arquivo NÃO-TOQUE**: faça **só** se a cópia de segurança estiver no scratchpad e o `md5sum` voltar ao valor de HEAD. **Se preferir não tocar, pule e declare** — o passo 8 já é afirmado, e a sabotagem 3 cobre o mesmo eixo |

- [ ] **Step 4: rodar os CINCO comandos do fechamento, serial, e anotar os números reais**

```
cd server && npm run test:api
cd server && npm run test:almoxarifado
cd server && npm run test:validation && npm run test:safealter && npm run test:sqlite
cd client && CI=true npx react-scripts test --watchAll=false
cd client && CI=true npx react-scripts build
```

Anote **os números**, não "passou": `N/N arquivos OK`, `N passou, 0 falhou`, `Suites: N passed`,
`Compiled successfully`. A T6 cita esses números; inventá-los é o defeito que a `fechar-etapa` nomeia.

- [ ] **Step 5: commit** — `git add server/tests/api/comprasPedidoAtrasoIntegracao.api.test.js`.
      Mensagem em `…\scratchpad\msg-e39-t5.txt`: por que a integração existe (verde por unidade não
      prova composição, e aqui o caminho passa por **rota**, **serviço** e **job**), e o que ela
      **prova**: que a limitação D6 é limitação e não bug (RN-D12).

---

### Task 6: fechamento (use a skill `fechar-etapa`)

**Files (os 7 artefatos + os dois planos):** ver a tabela da Estrutura de arquivos.

- [ ] **Step 1: medir as letras ANTES de escrever.** A 38 fechou em **B113**; os outros prefixos
      avançaram no fechamento dela. **Não deduza — rode:**

```
grep -o "\*\*A[0-9]\+" docs/almoxarifado-novidades-por-etapa.md | sort -u -V | tail -3
grep -o "\*\*B[0-9]\+" docs/almoxarifado-novidades-por-etapa.md | sort -u -V | tail -3
grep -o "\*\*C[0-9]\+" docs/almoxarifado-novidades-por-etapa.md | sort -u -V | tail -3
grep -o "\*\*F[0-9]\+" docs/almoxarifado-novidades-por-etapa.md | sort -u -V | tail -3
grep -o "\*\*G[0-9]\+" docs/almoxarifado-novidades-por-etapa.md | sort -u -V | tail -3
```

⚠️ **`D` não é numerada** — é a seção `### D. Limitações declaradas`. O `grep` de `D[0-9]` devolve
**vazio**; não invente `D1`. (E cuidado com o falso negativo do `grep` em palavra acentuada: `grep -i
"previs"` não acha "previsão" se a raiz truncar na cedilha/til — teste a régua contra um caso que
você **sabe** que existe antes de concluir que algo não existe.)

- [ ] **Step 2: `docs/almoxarifado-novidades-por-etapa.md`** — a seção da Etapa 39 no formato do
      documento de apresentação (o que o usuário vê, **Antes → Agora**), mais:
      - **letra A (duas):** (i) **confirmar o `TZ` do processo Node em PRODUÇÃO** — medido que **não
        existe** configuração de `TZ` no repositório, então o "hoje" de `hojeLocalISO()` é o fuso do
        **SO do host**; comando a rodar no host:
        ```
        node -e "console.log(process.env.TZ || '(não definido)', Intl.DateTimeFormat().resolvedOptions().timeZone, new Date().toString())"
        ```
        caminho reversível se vier UTC: definir `TZ=America/Sao_Paulo` no ambiente do processo (mesmo
        fuso de `auditFiltros.FUSO_PADRAO:53` e de `client/jest.globalSetup.js`) — **uma variável de
        ambiente, sem mudança de código**; (ii) **contar o acervo DEPOIS da Etapa 38** (o dump medido
        é de 03/09, anterior à 38):
        ```sql
        SELECT COUNT(*) AS pedidos,
               SUM(CASE WHEN previsao_entrega IS NOT NULL AND previsao_entrega <> '' THEN 1 ELSE 0 END) AS com_previsao
        FROM pedidos_compra;
        SELECT status, COUNT(*) FROM pedidos_compra GROUP BY status;
        ```
        **É esta consulta que diz se o alerta deixou de ser inerte.**
      - **letra B:** as **dez** decisões **D1–D10** do design, cada uma com o descartado da tabela da
        seção 3, com destaque para as três que mudam arquitetura ou contrato: (a) a régua é
        `hojeLocalISO()` em JS, **não** `date('now')` do SQLite (UTC, erra ~3 h por dia) — e as **4
        varreduras** que usam `date('now')` ficam **declaradas, não consertadas**; (b) o registro de
        alertas do almoxarifado passa a ter uma entrada que lê tabelas **CORE**; (c) o prefixo do
        assunto é **`[Compras]`**. **Mais as duas divergências que a execução acrescentou:** o
        cenário `(q)` não usa `jest.setSystemTime` (Jest 27 fake o `setTimeout` e o harness trava) e o
        ciclo de módulos do **R9b não fecha hoje** (o require lazy fica, pelo motivo reescrito).
      - **letras D/G:** as **nove** limitações da seção 9 do design (pedido recebido com status
        desatualizado continua atrasado; o aviso é um por pedido **para sempre**; a lista in-app é do
        almoxarifado e o usuário só-Compras toma **403**; o destinatário é a lista única; o alerta
        nasce **inerte**; as 4 varreduras UTC; `created_at` em UTC agora visível na coluna
        `Cadastrado em`; o core Compras com **uma** camada; o tema B aberto) **mais** as fragilidades
        que as sabotagens declararem (T1 sab. 5, T3 sab. 5, T4 sab. 5).
- [ ] **Step 3: `specs/modulo-almoxarifado/20-alertas/README.md` — a correção de spec, VISÍVEL.**
      O item *"Pedido recebido parcialmente"* (`:27`) está `[ ]` com o motivo `:48` *"falta noção de
      saldo do pedido"* — e **o motivo caducou**. Escreva, **sem apagar a frase errada**, a literal
      sugerida pelo design (D7):
      > *"dizia bloqueado por falta de dado; **estava desatualizado** — o dado chegou na Etapa 37
      > (situação) e na 38 (previsão validada). O que falta agora é a porta: a fonte exportada tem
      > `LIMIT 50` e não devolve `previsao_entrega` — fatia da feature 08."*
      E acrescente o item **novo** `[x]` do `PEDIDO_COMPRA_ATRASADO`, com o hash da T4.
- [ ] **Step 4: `specs/modulo-almoxarifado/22-integracoes/README.md`** — marcar o item *"acompanhamento
      de pedido e prazo com alerta de atraso"* (`:217-219`, aberto desde a Etapa 14) como `[x]` com os
      hashes por task, e o que **continua** fora (`situacao_recebimento` na aba, alerta parcial).
      **Item que ficar desmarcado leva o porquê escrito ali** — desmarcado sem explicação parece
      esquecimento.
- [ ] **Step 5: `specs/modulo-almoxarifado/README.md` e `specs/modulo-compras/README.md`** — a linha
      da feature no mapa de status, o cabeçalho "onde estamos" abrindo pela Etapa 39 (o da 38 vira
      `Antes:`), e em `modulo-compras` a tabela das três abas com a nota de que a 39 **não** é a etapa
      das outras duas (tema B segue aberto, 4 caminhos mortos).
- [ ] **Step 6: `docs/almoxarifado-guia-etapas-e-testes.md`** — seção da Etapa 39 em linguagem de
      usuário, com: **(a)** a tabela **Antes → Agora** da seção 6.1 do design (as quatro linhas);
      **(b)** roteiro de teste manual clicável, dizendo na primeira linha que **a tela é do módulo
      Compras, não do almoxarifado**; **(c)** o que a etapa **não** cobre; **(d)** o aviso de que **o
      alerta nasce inerte** — ele varre o vazio enquanto ninguém preencher previsão de entrega, e a
      consulta da letra A é a que mede. **O cabeçalho do guia tem de deixar óbvio onde o
      desenvolvimento parou.**
- [ ] **Step 7: `docs/almoxarifado-manual-do-sistema.md`** — as **frases da coluna direita da tabela
      de RN** deste plano, uma por RN, com a **literal do badge** (`Atrasado há 3 dias`), o rótulo
      **`Só atrasados`** e as colunas **`Atrasado`** / **`Dias de atraso`** escritas como o usuário as
      vê. E a frase da RN-D12, que é a que evita chamado: *"receber no almoxarifado não muda sozinho o
      status do pedido"*.
- [ ] **Step 8: os dois planos.** (a) **este** plano: marcar as tasks feitas com hash e o estado real
      (divergências incluídas), e escrever a **próxima tarefa detalhada**; (b)
      `docs/superpowers/plans/2026-09-16-crm-etapa38-pedido-de-compra.md`: preencher a **retro nº 4
      ("defeito escapado")**, que ficou em branco de propósito, **nomeando o commit da T2 desta
      etapa** — `formatDate` com `new Date(string)`, a data um dia atrás em quatro telas e o
      round-trip do Excel quebrado no valor.
- [ ] **Step 9: a retro de 4 números**, no fim deste plano: rodadas de correção até verde; achados da
      revisão (reais vs. ruído não reproduzido); paralelismo (nesta etapa: **zero galhos em paralelo**,
      por decisão — registre se isso custou tempo); defeito escapado (**em branco**, preenchido pela
      Etapa 40 olhando para trás — é o mesmo contrato que a 38 deixou para esta).
- [ ] **Step 10: a próxima tarefa detalhada.** Pela ordem do `CLAUDE.md`: (1) o que este fechamento
      nomear como "o que falta para 🟢" na feature 22; senão (2) **o tema B** — as duas abas de
      Compras sem tela de criação (`/compras/fornecedores/novo`, `/compras/cotacoes/nova` e os **dois**
      lápis de `Compras.js:270` e `:392`: são **4 caminhos mortos**, medidos na Fase 0 §6.1), que o D1
      já declara como **o próximo candidato**, com o tamanho medido em Fase 0 §6.3 (~4 rotas de client
      + ~4 de servidor + 2 schemas Zod + 2 telas + 4 suítes). **Escreva o contrato de API que a
      próxima task consome e os pontos de atenção** — é o que permite retomar sem reler o código.
- [ ] **Step 11: verificação final medida** — rode os cinco comandos de novo e **cite os números
      reais** (não "passou"). Confira com `git status` que nada de `server/data/` ou `server/uploads/`
      entrou, e com `git log --oneline` que há **um commit por assunto**.
- [ ] **Step 12: commit do fechamento** — `git add` só dos caminhos de documentação tocados.
      Mensagem em `…\scratchpad\msg-e39-t6.txt`.

---

## Self-review

### 1. Cobertura da spec — cada D e cada RN tem task

| Item do design | Task | Onde |
|---|---|---|
| **D1** escopo A0→A1→A2 + defeito escapado da 38 | T2, T3, T4, T6 | ordem das tasks; T6 Step 8(b) |
| **D2** A0 — as datas | **T2** | Steps 3 e 4 |
| **D3** A1 — atraso derivado na leitura | **T1** | Steps 3 e 4 |
| **D4** A1 na tela (badge, checkbox, 2 colunas) | **T3** | Steps 3–5 |
| **D5** A2 — uma entrada no registro | **T4** | Step 4 |
| **D6** vocabulário de status: nada muda | **T5** (provado), T6 (declarado) | BLOCO D; letra D/G |
| **D7** correção de spec visível (20-alertas) | **T6** | Step 3 |
| **D8** autorização: nada novo | **T1** (RN-D13), T6 | cenário (9); letra G |
| **D9** 2 arquivos de API novos + 1 client novo + 1 estendido | T1, T2, T4 | os quatro arquivos criados/estendidos |
| **D10** integração ROTA + JOB | **T5** | blocos A–F |
| **RN-D01** | T2 | `Compras.test.js` (a), (b) |
| **RN-D02** | T2 (régua), T3 (asserção do export) | (h) |
| **RN-D03** | T2 | `PedidoCompraForm.test.js` (q) |
| **RN-D04** | T1 | (1), (7) |
| **RN-D05** | T1 | (2), (3), (4), (5), (6) |
| **RN-D06** | T1 | (8), (10) |
| **RN-D07** | T3 | (c), (d), (e), (f), (g) |
| **RN-D08** | T3 | (h), (i) |
| **RN-D09** | T4 | (1), (3), (4) |
| **RN-D10** | T4 | (2) |
| **RN-D11** | T4 | (5) |
| **RN-D12** | T5 | BLOCO D |
| **RN-D13** | T1 (9) + T4 (7) | os dois lados |
| **RN-D14** | T5 | blocos A–F |
| **R1–R12 + R9b** | T1 sab. 1–3 (R6), T2 sab. 1 (R2), T4 (R1, R8, R9, R9b), T5 (R4) | tabelas de sabotagem |
| Contratos 1–5 | T1 (1, 2), T4 (3), T3 (4, 5) | seções congeladas |
| Seção 8 (fora de escopo) | T6 | letras D/G |
| Seção 9 (letras A/B/D/G) | T6 | Steps 1, 2 |

**Gaps:** nenhum item do design sem task. Os itens 7.5 (cenário de `AlertasAlmoxarifado.test.js`) e a
central `COLUNAS_POR_CHAVE` foram **dobrados na T4** em vez de virarem task própria — um revisor não
rejeitaria a entrada do registro aprovando as colunas da central, e vice-versa (regra de
right-sizing).

### 2. Varredura de placeholders

Procurado no arquivo: `TBD`, `TODO`, `implementar depois`, `similar à Task N`, "adicione tratamento de
erro", "escreva testes para o acima". **Zero ocorrências.** Todo passo de código traz o código;
`(1)`…`(10)` e `(a)`…`(q)` trazem as asserções concretas; as três frases que parecem abertas são
**instruções de medição**, não lacunas: (i) confirmar o `data-testid` do campo de data na T2 Step 1
(com o fallback escrito: `querySelector('input[type="date"]')`); (ii) atualizar o contador de cartões
de `alertaCentral.api.test.js` se ele existir (T4 Step 6, com o motivo); (iii) medir as letras do doc
de novidades na T6 Step 1 (com os comandos).

### 3. Consistência de nomes (entre tasks)

| Nome | Definido em | Consumido em | Confere |
|---|---|---|---|
| `hojeLocalISO()` | T1 (exportada de `pedidoCompraService`) | T1 (rota), T4 (`listar`), testes T1/T4 | ✅ mesmo nome nos quatro |
| `derivarAtraso(pedido, hoje)` | T1 | T1 (rota), T4 (`listar`), T4 cenário (5) | ✅ |
| `STATUS_PEDIDO_FORA_DO_ATRASO` | T1 | T1 sab. 2, T5 sab. 3 | ✅ |
| `meiaNoiteUTC(iso)` | T1 (interna, não exportada) | só T1 | ✅ |
| `formatDate` | T2 (**nome mantido** — é a mesma função com outra implementação; o design não renomeia) | T3 (badge/célula e export) | ✅ — **não** `formatarDataISO`, que não existe em lugar nenhum desta base |
| `hojeISO` | T2 (`PedidoCompraForm.js`, nome mantido) | T2 cenário (q) | ✅ |
| `rotuloAtraso(dias)` | T3 | só T3 | ✅ |
| `soAtrasados` / `setSoAtrasados` | T3 | T3 (efeito, `loadData`, checkbox) | ✅ |
| `atrasado` / `dias_atraso` | T1 (contrato 1) | T3 (tela e export), T4 (payload), T5 | ✅ mesmos nomes no JSON, no payload e nas asserções |
| `'PEDIDO_COMPRA_ATRASADO'` | T4 | T4, T5, `COLUNAS_POR_CHAVE`, T6 | ✅ |
| `pedido-atrasado-${id}` (dedupe) | T4 | T4 cenário (2) via `hashDedupe` | ✅ |
| `.pedido-atrasado` (CSS) | T3 | T3 (badge) | ✅ |

**Tipos:** `atrasado` é `number` (`0|1`) em todos os pontos — o contrato 1, a asserção
`typeof === 'number'` do cenário (1) da T1, o `pedido.atrasado === 1` da T3 e o
`.filter((l) => l.atrasado === 1)` da T4 concordam. `dias_atraso` é `number|null` na API e vira `''`
**só** na coluna do Excel (contrato 4), com cenário próprio — `(i)`.

---

## Retro de 4 números (preencher na T6)

1. **Rodadas de correção até verde:** …
2. **Achados da revisão (Fase 2 + Fase 5):** reais … / ruído não reproduzido …
3. **Paralelismo:** **0 galhos em paralelo por decisão** (T2 e T3 tocam o mesmo arquivo; worktree
   exigiria `npm install`). Registrar se a serialização custou tempo de parede.
4. **Defeito escapado:** *(em branco de propósito — só pode ser preenchido **de fora**, por quem
   fechar a Etapa 40 olhando para trás. É o mesmo contrato que a 38 deixou para esta, e que a T6
   Step 8(b) cumpre.)*
