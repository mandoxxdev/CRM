# Etapa 170 (Chat, Compras, Almoxarifado e núcleo): as datas do Chat, de Compras e do Almoxarifado no dia de Brasília e o limite dos Logs — plano

> Origem: "Próxima tarefa detalhada — Etapa 170" do plano da 169
> (`docs/superpowers/plans/2026-10-20-almoxarifado-etapa169-as-datas-das-aprovacoes-das-os-e-das-tarefas-no-dia-de-brasilia.md`).
> Etapa de consertos técnicos: o resto da **C421** (o Chat, Compras, o Almoxarifado, os PDFs de remessa e de posição do cliente) e a **C422**
> (o `limit` inválido/negativo dos Logs). O design, com a Fase 0 medida, está neste plano.
>
> **Numeração** (conferida com `grep -oE` em `docs/almoxarifado-novidades-por-etapa.md` em 2026-10-20): última B **B1078**, último C **C425**,
> última A **A105**. Esta etapa: **B1079+**, **C426+**, **A106+**. Worktree `CRM-wt-e170`, branch `etapa-e170` (da main `bd55ac7f`).
>
> **Fase 2 (um revisor fresco, só leitura, ANTES do código): 0 Critical, 2 Important, 4 Minor — todos aceitos; o plano abaixo já está
> corrigido** (sondas em `scratchpad/e170/f2/`). **I1** o `^\d+$` aceitava `limit[]=5` (o Express "extended" entrega `['5']` e o `test` converte
> a lista em texto) — o contrato agora exige `typeof v === 'string'`, confere só o parâmetro **presente** (o padrão `100` é número) e passa
> `Number(v)` ao SQL; as entradas medidas do `qs` (`limit[a]=1`, `+5` → `' 5'`, `?limit` → `''`, `05`, `2^53`) entram na RN-170.05. **I2** a
> B1080 desfaz em parte a **RN-D01 da Etapa 39** ("valor com hora → 10 primeiros caracteres, nunca `new Date`") — **a RN-D01 estava errada para o
> único valor com hora** (`created_at` é UTC: cortar dá o dia UTC); a correção visível vai ao plano da 39 (`:188`), ao comentário do `formatDate`
> (`Compras.js:120-139`), ao `Compras.test.js:244-248` e `:259-261` e ao `specs/modulo-compras/README.md:314` (regra 5 do CLAUDE.md); para as
> colunas só de data ela continua valendo. **Minor:** M3 o separador do Chat depois de uma mensagem ilegível compara com a **última anterior
> legível**; M4 a T5 mocka também o `services/chatSocket` e o `utils/exportExcel` e cobre a mensagem que chega pelo socket, a resposta do envio,
> a emenda da segunda página e a planilha logo depois de salvar (ISO com `Z`) × recarregada; M5 a receita do *Gerado em* fica escrita
> (`lerInstanteDoBanco(geradoEm) || new Date()` → o dia local); M6 citações: o `INSERT` de fornecedores também em `routes/compras/fornecedores.js:157`;
> o `AnexosDocumento` também nas Devoluções, Materiais, Remessas; o `components/Chat.js` antigo é código morto (não importado — fora).

## Fase 0 — medido (antes de qualquer código)

Lido no código nas linhas citadas (o condutor). Medição em Node com `TZ=America/Sao_Paulo` (`scratchpad/e170/medir.js`,
`fase0-medido.txt`). Base `test:api` antes de qualquer código: `scratchpad/e170/base-api.log`.

### O formato de cada coluna — medido, não suposto

| Tela (linha) | Rota | Coluna | Como é gravada | Lida hoje como | Erro medido (22h30 de 20/10 em Brasília = `'2026-10-21 01:30:00'`) |
|---|---|---|---|---|---|
| **Chat** — a hora da mensagem (`chat/ChatPage.js:17-23`, usada em `:626`, `:665`), o separador de dia (`:33-39`, `:621`, `:638`; `showDateSeparator` `:41-46`), a hora da conversa na lista (`:25-31`, `:542`, `ultima_mensagem.created_at \|\| updated_at`) | `GET /api/chat/conversas`, `GET /api/chat/conversas/:id/mensagens`, o socket (`services/chat/chatService.js:89`, `:241`, `:292` — `mapMessage` repassa cru) | `chat_mensagens.created_at`, `chat_conversas.updated_at` | `DEFAULT CURRENT_TIMESTAMP` (os três `INSERT` `:214`, `:308`, `:321` não passam a coluna); `updated_at = CURRENT_TIMESTAMP` (`:217`, `:311`, `:326`) | `parseISO(v.replace(' ', 'T'))` = hora **local** | *01:30* em vez de *22:30*; `isToday` falso → a mensagem de hoje sai *21/10/26* (a data de amanhã) e o separador *21/10/2026* em vez de *Hoje*; das 0h às 3h UTC (21h–meia-noite) o dia errado em tudo. **Valor ilegível: `format(Invalid Date)` lança `RangeError` — a tela inteira do Chat cai** (medido: `parseISO('lixo')` → *Invalid Date*; `isToday`/`isYesterday` falsos; `format` lança) |
| **Compras** — *Salva em* da planilha do fornecedor (`components/ItensFornecedor.js:292` no modal, `:417` na página) — roteada em `/compras/fornecedores-homologados/fornecedor/:fornecedorId` (`App.js:385`) | `GET /api/compras/fornecedores/:id/planilha` (`routes/compras.js:1003-1012`, `atualizado_em: row.planilha_atualizado_em`) | `fornecedores.planilha_atualizado_em DATETIME` | `= CURRENT_TIMESTAMP` (`routes/compras.js:990`); logo depois de salvar a tela usa `new Date().toISOString()` (`ItensFornecedor.js:220`, com `Z` — certo) | `new Date(v).toLocaleString('pt-BR')` = hora **local** | depois de recarregar: *21/10/2026, 01:30:00* em vez de *20/10/2026, 22:30:00* (3 h adiantada); logo depois de salvar já está certo |
| **Compras** — a coluna *Cadastrado em* da **exportação** de fornecedores (`components/Compras.js:300`, `formatDate` `:140-146`) — a tabela não mostra `created_at` (medido no `Compras.test.js:248-252`) | `GET /api/compras/fornecedores` | `fornecedores.created_at` | `DEFAULT CURRENT_TIMESTAMP` (o `INSERT` `routes/compras.js:849` não passa a coluna) | os 10 primeiros caracteres = o dia **UTC** | das 21h à meia-noite, o dia seguinte. **O comentário do `Compras.test.js:91-92` dizia "às 21:40 locais o instante UTC já é o dia seguinte" — estava errado: o valor gravado JÁ É UTC** (`'2026-09-10 21:40:00'` são 18h40 de Brasília, o mesmo dia; o caso que separa é o das 0h–3h UTC) |
| **Almoxarifado / Lotes** — *(anexado em …)* do certificado (`LotesAlmoxarifado.js:464`) | `GET /api/almoxarifado/lotes` (`SELECT l.*`) | `lotes_almoxarifado.certificado_em DATETIME` (`schema.js:1341`) | `= CURRENT_TIMESTAMP` (`routes/almoxarifado.js:1181`) | `new Date(v).toLocaleDateString` = hora **local** | *21/10/2026* em vez de *20/10/2026* (21h–meia-noite); ilegível → *Invalid Date* |
| **Almoxarifado / Anexos** — a data do anexo na lista (`AnexosDocumento.js:71-76`, `:239`) — usado no Recebimento, na Inspeção, na NC, nas Requisições (`AnexosModal`, `HistoricoInspecoes:255`, `NaoConformidadesAlmoxarifado:904`) | `GET /api/almoxarifado/anexos/...` (`services/almoxarifado/anexoService.js`) | `anexos_documento_almoxarifado.created_at` (`schema.js:2386`) | `DEFAULT CURRENT_TIMESTAMP` (o `INSERT` `anexoService.js:118` não passa a coluna) | `new Date(v.replace(' ', 'T'))` = hora **local** | *21/10/2026* em vez de *20/10/2026*; ilegível → o texto cru (já era) |
| **Almoxarifado / Ferramentas** — *Retirada* da lista de empréstimos (`FerramentasAlmoxarifado.js:602`) | `GET /api/almoxarifado/emprestimos` (`FerramentasAlmoxarifado.js:147`; `toolService.js:457`) | `emprestimos_ferramenta_almoxarifado.data_retirada DATETIME DEFAULT CURRENT_TIMESTAMP` (`schema.js:2290`) | o `INSERT` (`toolService.js:88`) não passa a coluna → `CURRENT_TIMESTAMP` | os 10 primeiros caracteres (`AAAA-MM-DD`, o formato da tela) = o dia **UTC** | *2026-10-21* em vez de *2026-10-20*. A *Previsão de devolução* (`:603`) e o *Vencido* (`:422-425`) são só data (`<input type="date">`) — **certos, inalterados** |
| **PDF de remessa a terceiros** — *Gerado em* e *Prazo previsto* (`utils/remessaPdf.js:15-20`, `:66`, `:70`) — botão da `RemessasTerceirosAlmoxarifado.js:498` (`geradoEm: new Date().toISOString()`) | — (gerado no **navegador**, jsPDF) | `geradoEm` = ISO com `Z` do relógio; `remessas_terceiro_almoxarifado.prazo_previsto DATE` (`schema.js:2023`) | — | `toLocaleDateString('pt-BR', { timeZone: 'UTC' })` = o dia **UTC** | *Gerado em 21/10/2026* das 21h à meia-noite. O *Prazo previsto* `'AAAA-MM-DD'` já está **certo** (meia-noite UTC lida em UTC) |
| **PDF de posição do cliente** — *Gerado em* (`utils/posicaoClientePdf.js:14-17`, `:37`) — botão da `MateriaisClienteAlmoxarifado.js:118` (`geradoEm: new Date().toISOString()`) | — (navegador, jsPDF) | `geradoEm` ISO com `Z` | — | `{ timeZone: 'UTC' }` | *Gerado em 21/10/2026* das 21h à meia-noite; `geradoEm` ilegível → *Invalid Date* impresso no papel |
| **C422 — os Logs** (`server/index.js:22330-22367`) | `GET /api/auditoria/logs` (só `canManageUsers`) | — | — | `parseInt(limit)`, `parseInt(offset)` direto no `LIMIT ? OFFSET ?` | medido no `sqlite3` (Node): `limit=abc` → `NaN` → **500** `SQLITE_MISMATCH: datatype mismatch` (a mensagem do SQLite vai para o cliente); `limit=-1` → **sem limite** (a tabela inteira); `offset=abc` → 500 igual; `offset=-1` → tratado como 0; `limit=0` → `[]`; `limit=10abc` → `parseInt` = 10. **A tela de Logs (`Logs.js:26-32`) nunca manda `limit` nem `offset`** — só a API direta os usa |

**PDFs — o fuso do Dockerfile não se aplica (medido):** o `Dockerfile` fixa `TZ=America/Sao_Paulo` (`:47`), mas os dois PDFs do
Almoxarifado são **gerados no navegador** (jsPDF, `utils/remessaPdf.js`, `utils/posicaoClientePdf.js` — o cabeçalho de cada um diz "zero
mudança de servidor"). O fuso que vale é o do **computador de quem clica**, e o erro não é de fuso do processo: é o `{ timeZone: 'UTC' }`
explícito, que imprime o dia UTC em qualquer máquina. (A instrução da etapa — "o fuso de produção é o do Dockerfile — meça" — vale para o PDF
da OS da 169, que é do servidor; aqui, medido, não.)

**Roteadas (medido):** `ChatPage` (`/chat`, `App.js:249`), `ItensFornecedor` (`App.js:385`), `Compras` (`App.js:352-377`), `LotesAlmoxarifado`
(`:541`), `MateriaisClienteAlmoxarifado` (`:543`), `RemessasTerceirosAlmoxarifado` (`:544`), `FerramentasAlmoxarifado` (`:546`).

**Já certos (medido, não mexer):** as telas do Almoxarifado que já fazem `replace(' ', 'T') + 'Z'` (`AlertasAlmoxarifado.js:75`,
`AuditoriaAlmoxarifado.js:84`, `ConferenciaEstoque.js:343`, `NaoConformidadesAlmoxarifado.js:204`, `NotificacoesAlmoxarifado.js:113`,
`RelatoriosAlmoxarifado.js:85`, `ReposicaoAlmoxarifado.js:83`); o `{ timeZone: 'UTC' }` de `AlertasAlmoxarifado.js:72` e
`RelatoriosAlmoxarifado.js:91` é o ramo só-data (certo); o servidor do Chat compara `ultima_leitura_at` com `created_at` (`chatService.js:281`),
dois textos do mesmo formato — consistente.

### Portas de saldo, trava e permissão

Nenhuma. No Almoxarifado só muda **o texto de data na tela e no papel**: nenhuma rota, nenhuma consulta, nenhum valor gravado, nenhuma porta da
trava por material. A única mudança de servidor é a validação do `limit`/`offset` da rota dos Logs (o portão `canManageUsers` continua o
primeiro gesto — o 403 vem antes do 400).

## Decisões (letra B — reversíveis)

- **B1079 — o Chat na hora e no dia de Brasília.** As quatro leituras (`formatMessageTime`, `formatListTime`, `formatDateSeparator`,
  `showDateSeparator`) passam por `lerInstanteDoBanco`; o `isToday`/`isYesterday`/`isSameDay` e o `format` do date-fns ficam (os formatos de
  cada lugar não mudam: *HH:mm*, *Ontem*, *dd/MM/yy*, *dd/MM*, *Hoje*, *dd/MM/yyyy*). **Muda:** a hora da mensagem 3 h mais cedo (a de
  verdade); das 21h à meia-noite a mensagem de hoje sai com a hora (antes, a data de amanhã), o separador sai *Hoje* (antes, a data de
  amanhã), a de ontem à noite sai *Ontem*. **Valor vazio ou ilegível → sem texto** (vazio: inalterado; ilegível: antes a tela do Chat caía
  inteira com `RangeError`); a mensagem ilegível não mostra separador, e a seguinte compara o dia com a **última anterior legível** (Fase 2 M3;
  sem nenhuma legível antes, mostra o separador). ISO sem `Z` (só nos testes antigos) continua lido como hora local (inalterado).
  **Descartado:** trocar o formato; levar a conversão para o servidor (mudaria o contrato do socket e da rota).
- **B1080 — Compras.** O *Salva em* da planilha do fornecedor por `formatarInstanteDoBanco(v, COM_SEGUNDOS)` (o mesmo *DD/MM/AAAA, HH:MM:SS*
  do `toLocaleString`): depois de recarregar, a hora de Brasília (antes 3 h adiantada). A coluna *Cadastrado em* da exportação de
  fornecedores por `formatarDataDoBanco(v, formatDate(v))`: o dia de Brasília do instante (antes o dia UTC — das 21h à meia-noite, o seguinte);
  vazio → `-` e ilegível → o que o `formatDate` já devolvia (inalterados). O `formatDate` das outras colunas (só data: pedido, previsão,
  cotação, validade) **não muda** — continua cortando o texto, sem `new Date` (a regra da Etapa 39). **A RN-D01 da Etapa 39 estava errada
  para o `created_at`** (Fase 2 I2): "valor com hora → os 10 primeiros caracteres" dá o dia UTC; corrigida com a correção visível no plano da 39,
  no comentário do `formatDate`, no `Compras.test.js` e no `specs/modulo-compras/README.md`. **Descartado:** mudar o `formatDate`
  inteiro (as colunas só-data já estão certas e a Etapa 39 proíbe o `new Date` nelas).
- **B1081 — as três datas de tela do Almoxarifado** (só exibição): o *(anexado em …)* do certificado do lote e a data dos anexos por
  `formatarInstanteDoBanco(v, undefined, '')` (o dia de Brasília; ilegível → o texto gravado, antes *Invalid Date* no lote e o texto cru nos
  anexos); a *Retirada* da ferramenta pelo dia de Brasília **no formato da tela** (`AAAA-MM-DD`, como antes — a B1069 manteve o de cada tela):
  `hojeLocalISO(lerDataDoBanco(v))`; só data `'AAAA-MM-DD'` → o mesmo texto; ilegível → os 10 primeiros caracteres (como antes); vazio → `—`.
  **Descartado:** trocar a *Retirada* para *DD/MM/AAAA* (é pergunta de formato, fora desta etapa).
- **B1082 — os PDFs de remessa e de posição do cliente.** O *Gerado em* pelo dia **do computador de quem gera** (o mesmo `hojeLocalISO`/
  `lerInstanteDoBanco` das telas — o relógio local do navegador, como em todo o cliente desde a 161), não mais o dia UTC. O *Prazo previsto* da
  remessa por `formatarDataDoBanco(v, null, { soData: true })` (a coluna é `DATE`; o dia gravado — inalterado para `'AAAA-MM-DD'`; com hora
  gravada pela API, o prefixo). `geradoEm` vazio ou ilegível → **o dia de hoje** (na remessa já era; na posição saía *Invalid Date*).
  Receita (Fase 2 M5): `formatarDataDoBanco(hojeLocalISO(lerInstanteDoBanco(geradoEm) || new Date()))` — `geradoEm` é sempre instante
  (`toISOString()` nos dois chamadores); um só-data `'AAAA-MM-DD'` seria lido como meia-noite UTC (declarado — nenhum chamador o manda).
  **Muda:** das 21h à meia-noite, *Gerado em* o dia certo em vez do de amanhã. **Descartado:** `{ timeZone: 'America/Sao_Paulo' }` fixo (o
  cliente inteiro usa o fuso do navegador; a Etapa 39 proíbe fingir fuso em só-data).
- **B1083 — C422: `limit`/`offset` inválidos nos Logs → 400 com mensagem.** `limit` e `offset`, quando vierem, têm de ser texto só de dígitos
  (inteiro ≥ 0, até `Number.MAX_SAFE_INTEGER`); senão **400** com a mensagem literal (abaixo). Sem o parâmetro: `limit` 100 e `offset` 0
  (inalterado). `limit=0` continua devolvendo `[]` (inalterado). **Muda:** `limit=abc` 400 (antes 500 com a mensagem do SQLite); `limit=-1` 400
  (antes a tabela inteira); `limit=10abc` 400 (antes 10); `offset=-1` 400 (antes tratado como 0); parâmetro repetido (`limit=1&limit=2`, vira
  lista) 400 (antes `parseInt` da lista = 1). **Sem teto** (um teto mudaria a resposta de quem pede muito hoje — declarado). A tela não manda
  nenhum dos dois: **nada muda na tela**. **Descartado:** cair no padrão (100) em silêncio — esconderia o erro de quem chama a API e, para
  `-1`, trocaria "tudo" por "100" sem avisar; um teto (pergunta de produto).
- **B1084 — a próxima etapa (171).**
- **B1085 (no fechamento) — o teste do relatório de ajustes por motivo no dia de Brasília.** O cenário `[RN-06 +]` do
  `relatorioAjustesPorMotivo.api.test.js` comparava o prefixo cru do `ultimo_em` (`MAX(created_at)`, UTC) com o `HOJE` de Brasília (desde a
  162): falhava das 21h à meia-noite. O dia vem de `diaLocal.instanteDoBancoNoFuso`. **Descartado:** converter o `ultimo_em` na rota (muda o
  contrato da tela e do XLSX). `073d64fc`.

## Regras de negócio

Relógio dos cenários: **22h30 de 20/10/2026 em Brasília** (01h30 de 21/10 em UTC).

- **RN-170.01 (B1079)** — Chat. Mensagem `created_at = '2026-10-21 01:30:00'` → hora *22:30* (antes, `isToday` falso: *21/10/26*) e o separador
  *Hoje* (antes *21/10/2026*); `'2026-10-20 02:00:00'` (23h de 19/10) → *Ontem* e o separador *Ontem* (antes *02:00* e *Hoje*);
  `'2026-10-18 15:00:00'` → *18/10/26* e o separador *18/10/2026*. Na lista de conversas, a última mensagem `'2026-10-21 01:30:00'` → *22:30*
  (antes *21/10*); sem mensagem, `updated_at` `'2026-10-20 02:00:00'` → *Ontem*. `created_at` ilegível (`'lixo'`) → a tela abre, a mensagem
  aparece sem hora e sem separador (antes `RangeError`, a tela caía). Vazio → sem texto (inalterado).
- **RN-170.02 (B1080)** — Compras. A planilha recarregada com `atualizado_em = '2026-10-21 01:30:05'` → *Salva em 20/10/2026, 22:30:05* (antes
  *21/10/2026, 01:30:05*). A exportação de fornecedores: `created_at = '2026-10-21 01:30:05'` → *Cadastrado em* `20/10/2026` (antes
  `21/10/2026`); `'2026-09-16 10:33:00'` → `16/09/2026` e `'2026-09-10 21:40:00'` → `10/09/2026` (inalterados — o `Compras.test.js` antigo
  continua verde); vazio → `-`.
- **RN-170.03 (B1081)** — Almoxarifado. Lote com `certificado_em = '2026-10-21 01:30:05'` → *(anexado em 20/10/2026)* (antes *21/10/2026*);
  `'lixo'` → *(anexado em lixo)* (antes *Invalid Date*). Anexo `created_at = '2026-10-21 01:30:05'` → `… · 20/10/2026` (antes `21/10/2026`).
  Empréstimo `data_retirada = '2026-10-21 01:30:05'` → *2026-10-20* (antes *2026-10-21*); `'2026-08-01'` → *2026-08-01* (inalterado).
- **RN-170.04 (B1082)** — PDFs. Clicar o PDF da remessa e o da posição às 22h30 de 20/10 (`geradoEm = '2026-10-21T01:30:00.000Z'`) →
  *Gerado em 20/10/2026* nos dois (antes *21/10/2026*). Prazo `'2026-09-30'` → *30/09/2026* (inalterado); `'2026-09-30 01:00:00'` →
  *30/09/2026*; sem prazo → *sem prazo definido* (inalterado). Posição com `geradoEm` ilegível → o dia de hoje (antes *Invalid Date*).
- **RN-170.05 (B1083)** — `GET /api/auditoria/logs`: sem `limit` → até 100 linhas (inalterado); `limit=2` → 2; `limit=0` → `[]`;
  `limit=abc`, `-1`, `10abc`, `1.5`, `''`… → **400** `{ "error": "limit inválido. Use um número inteiro maior ou igual a zero." }`;
  `offset=abc`/`-1` → **400** `{ "error": "offset inválido. Use um número inteiro maior ou igual a zero." }`; `limit=1&limit=2` → 400 (o do
  `limit`); `offset=1&limit=1` → a segunda linha. Usuário sem `canManageUsers` com `limit=abc` → **403** (o portão vem antes).
  `limit=''` / `?limit` sem `=` (presente e vazio): **400**. (Fase 2 I1) `limit[]=1`, `limit[a]=1`, `limit=1&limit[a]=2` (lista/objeto) → 400;
  `limit=+5` e `limit=%205` (chegam `' 5'`) → 400; `limit=05` → **200**, até 5 linhas (aceito: só dígitos); `9007199254740992` e
  `99999999999999999999` → 400; `limit=abc&offset=abc` → a mensagem do `limit`.

## Contratos

- **`GET /api/auditoria/logs`** — muda só a recusa: `limit`/`offset` **presentes** (`!== undefined`) que não sejam texto (`typeof !== 'string'`),
  fora de `^\d+$` ou acima de `MAX_SAFE_INTEGER` → `400` `{ error: 'limit inválido. Use um número inteiro maior ou igual a zero.' }` /
  `{ error: 'offset inválido. Use um número inteiro maior ou igual a zero.' }` (o `limit` é conferido primeiro); o SQL recebe `Number(v)`.
  Ausentes: 100 e 0. Portão, filtros, ordem, a resposta `200` (lista crua) — inalterados.
- Nenhuma outra rota muda. Chat, Compras e Almoxarifado: só o texto que a tela e o papel mostram.

## Tasks (sort topológico)

- [x] **T1 (galho, front) — o Chat (B1079, RN-170.01).** `b8aed080`.
- [x] **T2 (galho, front) — Compras (B1080, RN-170.02)** — a planilha e a exportação; corrigir, com a correção visível, a RN-D01 da 39 (o comentário do `Compras.js:120-139`, o `Compras.test.js:91-92`, `:244-248`, `:259-261`, o plano da 39 `:188` e o `specs/modulo-compras/README.md:314`) — as asserções antigas continuam. `73a577c0` (o plano da 39 e o README de Compras no fechamento).
- [x] **T3 (galho, front) — o Almoxarifado: lote, anexos, ferramentas e os dois PDFs (B1081/B1082, RN-170.03/04).** Cenários unitários nos
  `utils/remessaPdf.test.js`/`posicaoClientePdf.test.js` com o fuso de Brasília. `3fb6aa0e`.
- [x] **T4 (galho, back) — C422 (B1083, RN-170.05)** — cenários no `server/tests/api/filtroDosLogsNoDiaLocal.api.test.js` (o servidor real,
  pasta vazia), com controle positivo. `1e970cfb`.
- [x] **T5 (integração, front) — `datasDoChatDeComprasEDoAlmoxarifadoNoDiaLocal.test.js`**, o molde do `datasDasOsEDasTarefasNoDiaLocal.test.js`
  (fuso do `jest.globalSetup.js` com guarda; relógio às 22h30 de 20/10 com **prova de que vale** no `beforeEach`; só a fronteira HTTP mockada —
  e o `jspdf`, que é a fronteira do papel: o mock captura o `text()` impresso). Cada cenário vai do gesto ao texto, com a metade positiva e a
  negativa e o **texto exato**: o Chat (abrir a conversa — a hora, o separador *Hoje*/*Ontem*; a lista; a mensagem ilegível não derruba); a
  planilha do fornecedor (a página e o modal *Visualizar*); a exportação de fornecedores (clicar *Exportar Excel*); o lote; os anexos; a
  retirada; o PDF da remessa e o da posição (clicar o botão de cada tela — o *Gerado em* impresso). `9353c1d5`.
- [x] **T6 (documentação)** — no fechamento (o commit do fechamento, depois de `26557862`).

## Pontos de atenção

1. A trava de máquina: um `test:api` por vez (`C:/Users/User/AppData/Local/Temp/claude/C--Users-User-projetos-CRM/trava-test-api.d`, `mkdir`
   atômico; quem pegou apaga).
2. **O relógio parado precisa de prova de que vale** (r3 da 169): `expect(Date.now()).toBe(AGORA)` e `expect(new Date().getHours()).toBe(22)`
   no `beforeEach`; o `isToday`/`isYesterday` do date-fns lê `Date.now()` do global — medido (`date-fns@2.30.0`, `isToday/index.js:33`).
3. **Asserções exatas** (o `toContain` satisfeito por outra coluna — r3 da 168 e da 169).
4. O `Compras.test.js` antigo (`:259-261`) continua verde **sem mudar a asserção**; só o comentário da premissa muda.
5. A revisão obrigatória da proposta (23 + editor) roda no fechamento (nenhum arquivo do template).
6. No Almoxarifado, nada de saldo: só `LotesAlmoxarifado.js`, `AnexosDocumento.js`, `FerramentasAlmoxarifado.js` (uma célula) e os dois `utils/*Pdf.js`.

## Fora desta etapa (declarado)

- **C423** (as quatro datas do formulário da OS que o `PUT` não grava) — técnica, muda o contrato do `PUT`: candidata da 171.
- O teto do `limit` dos Logs (pergunta de produto). O formato *AAAA-MM-DD* da *Retirada* das ferramentas (formato de cada tela — B1069).
- Tudo o que depende do P.O. (a lista do plano da 169, repetida na próxima tarefa ao fechar).

## Execução — o que divergiu do plano

- **Paralelismo 0:** T1–T5 pequenas, feitas em sequência pelo condutor (um arquivo cada; o `test:api` é serial pela trava de máquina) —
  nenhum retrabalho.
- **T1–T5 verdes de primeira** (o arquivo de integração **13/13**, os cenários novos dos PDFs **6/6**, os do C422 **4/4** no arquivo dos Logs).
  **Controle positivo** (`scratchpad/e170/`): as oito telas/utilitários de `bd55ac7f` derrubam **11/13** do arquivo de integração (passam a
  guarda e a planilha recém-salva, que já era certa — inalterado) e os dois cenários novos dos PDFs pelo *Gerado em*; o `index.js` de
  `bd55ac7f` derruba os dois cenários de recusa (`limit=abc`, `offset=abc`); tirar o `typeof` derruba os dois pelo `limit[]=5`/`offset[]=1`.
  md5 restaurado ao pós-conserto em todas.
- **Testes antigos mudados: 0 asserções** — só os comentários do `Compras.test.js` que traziam a premissa errada da RN-D01 (a correção visível).
- **O plano dizia** que os empréstimos vinham de `GET /api/almoxarifado/ferramentas/emprestimos` — **estava errado**: a rota é
  `GET /api/almoxarifado/emprestimos` (`FerramentasAlmoxarifado.js:147`); corrigido na tabela da Fase 0.
- **A C422 dizia "a tela sempre manda 100"** (herdado da 168) — **estava errado**: a tela de Logs não manda limite nenhum; o 100 é o padrão
  do servidor. Corrigido na C422 com a correção visível.
- **A RN-D01 da Etapa 39 estava errada para o `created_at`** (Fase 2 I2) — corrigida com a correção visível no plano da 39 (`:188`), no
  comentário do `formatDate`, no `Compras.test.js` e no `specs/modulo-compras/README.md`.
- **A bateria 3 achou um teste preso ao relógio, de antes (B1085, `073d64fc`):** às 21h14, **489/490** — o
  `relatorioAjustesPorMotivo.api.test.js` (`[RN-06 +]`) comparava o `ultimo_em` em UTC com o dia de Brasília. Não é defeito do código (nem
  da 170): a asserção ficou para trás quando a 162 trocou o `HOJE`. Controle: a versão antiga caiu na própria bateria; a nova **10/10** às
  21h18; `HOJE`→`ONTEM` na asserção nova derruba o mesmo cenário (**9/10**), md5 restaurado. Nenhum outro teste usa o padrão
  (`grep "startsWith(HOJE|hoje)"`).

**Specs de feature:** as telas do Almoxarifado tocadas são das features **10** (o certificado do lote), **13** (o PDF de posição), **14** (o
PDF de remessa), **16** (a retirada) e o componente de anexos (usado pelas 04, 08, 09, 12 e 14 — registrado na 08); cada README ganhou a linha
"+ Etapa 170" no topo e a seção no fim (só exibição; o status não muda). O Chat, Compras e os Logs não são features do mapa do Almoxarifado —
o registro é o mapa (a linha *Última atualização*), este plano, as novidades e o `specs/modulo-compras/README.md` (a RN-D01). A revisão da
proposta (`specs/proposta-editavel/review-proposta.md`) não muda: nenhum arquivo do template ou da paginação foi tocado.

## Fase 5 — revisão adversarial (três revisores frescos, em paralelo)

- **r1 (a regra):** **0** Critical, **0** Important, **1** Minor **de antes** — a data impossível com hora (`'2026-02-30 10:00:00'`) rola para
  março no `lerInstanteDoBanco` (Etapa 161), agora também no Chat, no *Cadastrado em* de Compras e na *Retirada* — reproduzido
  (`scratchpad/e170/r1/sonda.js`); **declarado** (o mesmo da Fase 5 r1 M2 da 169: as três colunas são o `CURRENT_TIMESTAMP`, o banco nunca grava
  assim; mexer no `lerInstanteDoBanco` muda todas as telas da 161–170). Conferidos e certos: as bordas 02:59:59/03:00 UTC, a meia-noite local,
  o separador com ilegível no começo/meio/fim, os tipos não-texto (número, `Date`), o C422 com cada entrada do `qs` (inclusive `1e20`, `0x10`,
  `%00`, o dígito largo).
- **r2 (autorização):** **0** achados desta etapa; **1** Minor de antes **não reproduzido** (o 500 dos Logs ainda devolve a mensagem do erro
  — nenhum parâmetro, em lista ou objeto, o aciona; só uma falha real do banco) — **ruído**. Conferidos: o 403 antes do 400, as mensagens fixas
  (não ecoam o valor), nenhum `dangerouslySetInnerHTML` nas telas, o texto cru nunca vai ao PDF, nenhuma consulta/gravação/saldo/trava/perfil
  tocada, o usuário do cenário 403 é mesmo `usuario` sem `canManageUsers`.
- **r3 (sabotagem, worktree `CRM-wt-e170-r3`):** **59** sabotagens, **50** mortas pela asserção certa, **9** sobreviventes: **1** equivalente
  provada (`return v` no lugar de `Number(v)` — a regex só deixa passar dígitos, o SQLite converte igual), **1** coberta em outro arquivo (o
  `COM_SEGUNDOS`, pelo `dataLocal.test.js:59`) e **7 faltas de asserção** em 4 pontos: o laço da última legível e o `if (prev)` do Chat (o único
  cenário ilegível tinha a vizinha em outro dia); o *Gerado em* da remessa ignorando o `geradoEm` (a prova coincidia com **hoje** — morreria
  amanhã); o padrão 100 do C422 (a massa tinha 5 linhas); e o `return` dos dois 400 (o cliente recebe o mesmo 400, mas a consulta roda e o
  servidor registra `SQLITE_MISMATCH` e `ERR_HTTP_HEADERS_SENT`). **Todas aceitas** na correção da revisão (`26557862`): o Chat com a ilegível
  entre duas de hoje; a remessa com um instante de agosto; 101 logs (sem `limit` → 100, `limit=101` → 101); e o log do filho sem erro de logs
  depois dos 400. Controle: cada sabotagem do r3 cai pelo cenário novo (*Expected ['[Hoje]', …] / Received ['[Hoje]', …, '[Hoje]', …]*;
  *Expected 100* com o padrão 10; *"o servidor rodou a consulta depois do 400: Erro ao buscar logs: Error: SQLITE_MISMATCH"*); md5 restaurado.

## Baterias (os números lidos nos logs, `scratchpad/e170/`)

- **Base, antes de qualquer código (`base-api.log`):** `test:api` **490/490**.
- **Bateria 1 — antes de `b8aed080`…`9353c1d5` (`b1-*.log`):** `test:api` **490/490** arquivos; `test:almoxarifado` **44/0**;
  `test:validation`/`safealter`/`sqlite` **4/0, 3/0, 16/0**; client **172** suítes / **2186** testes; `CI=true build` *Compiled successfully*;
  revisão obrigatória da proposta **23/23** scripts com saída 0 (*"TODOS OS INVARIANTES OK"*) + editor (`clausulasInlineEditor` +
  `marcadorVivoNoPreview`) **2** suítes / **59** testes.
- **Bateria 2 — antes de `26557862` (`b2-*.log`):** `test:api` **490/490** arquivos (`filtroDosLogsNoDiaLocal` **13/0**); `test:almoxarifado` **44/0**; **4/0, 3/0, 16/0**; client **172** / **2187**; *Compiled successfully*; proposta **23/23** + editor **59/59**. O intermitente conhecido do `superPadraoNoBoot` não apareceu nas baterias 1 e 2.
- **Bateria 3 — o fechamento (`b3-*.log`; depois dela só documentos):** rodada em 2026-10-21 às 21h14 (fora do horário das outras duas): `test:api` **489/490** — caiu o
  `relatorioAjustesPorMotivo.api.test.js` `[RN-06 +]`, um teste preso ao relógio de antes (**B1085**, corrigido em `073d64fc`; ver *Execução*);
  depois da correção, `test:api` **490/490** (`b3b-api.log`); `test:almoxarifado` **44/0**; **4/0, 3/0, 16/0**; client **172** / **2187**;
  *Compiled successfully*; proposta **23/23** scripts com saída 0 (*"TODOS OS INVARIANTES OK"*) + editor **59/59**. O intermitente do
  `superPadraoNoBoot` não apareceu em nenhuma das três.

## Fora desta etapa (declarado, no fechamento)

- **C423** — a próxima (abaixo).
- **Fase 5 r1** — a data impossível com hora rola para março (de antes, declarado). **Fase 5 r2** — o 500 dos Logs em falha real do banco
  ainda devolve a mensagem do erro (de antes; nenhum parâmetro o aciona).
- O teto do `limit` e o formato da *Retirada* (produto). O antigo `components/Chat.js` (código morto, não importado).

## Retro (4 números)

1. **Rodadas de correção até verde:** **1** — a Fase 5 (quatro cenários que a sabotagem achou faltando; nenhum defeito de comportamento). As
   tasks ficaram verdes na primeira aplicação do código **e o teste também** — por isso o controle por versão antiga e por sabotagem.
   **Testes antigos mudados: 0** asserções.
2. **Achados da revisão:** Fase 2 — **0 Critical + 2 Important + 4 Minor**, todos reais (o mais caro: o `limit[]=5` passando pela regex; e a
   RN-D01 da 39 que a etapa desfazia sem dizer). Fase 5 — r1 **1** Minor de antes (declarado); r2 **0** desta etapa + **1** ruído (não
   reproduzido); r3 **7** faltas de asserção reais + 1 equivalente provada + 1 coberta em outro arquivo. **O que mais pesou:** a prova que
   **coincidia com o dia de hoje** (o *Gerado em* da remessa) — teste com data relativa ao relógio real passa no dia em que é escrito.
3. **Paralelismo:** **0** galhos de código em paralelo; **3** revisores em paralelo na Fase 5 (o r3 na worktree própria) — **0** incidente de
   trava, **0** retrabalho.
4. **Defeito que escapou:** *(preencher na Etapa 171)*.

## Próxima tarefa detalhada — Etapa 171

*(A série desta etapa foi B1079–B1085, nenhum C novo, nenhuma A — a 171 começa em **B1086**, **C426**, **A106**; confira com `grep -oE` antes.)*

**Escolhida: a C423 — gravar as quatro datas do formulário da OS** (técnica; da medição da 169). No **Editar** da OS (`client/src/components/
operacional/OSForm.js`), os campos *Data de entrada do pedido* (`data_entrada_pedido`, `:33`, `:427-428`), *Data Entrega* (`data_entrega`, `:34`),
*Ordem de produção* (`data_ordem_producao`, `:35`) e *Data Conferência* (`data_conferencia`, `:127`) são carregados (`:175-177`, `:208`) e
mandados no `PUT /api/operacional/ordens-servico/:id` (`OSForm.js:269`), mas o servidor (`server/index.js:20665`, o `UPDATE` em `:20671`) só
grava abertura, prevista, início e conclusão — o *"OS atualizada com sucesso"* esconde que as quatro somem. As colunas existem
(`index.js:19293-19296`, `:19321`, `DATE`; o `ALTER` de `:19351-19354`). O PDF da OS (`gerarHTMLOS`) já lê `data_entrega || data_prevista`
(`:13693`), `data_abertura || data_entrada_pedido` (`:13674`, `:13731`) e `data_conferencia || hoje` (`:13987`) — gravar muda o PDF gerado
depois.

**Pontos de atenção (medir na Fase 0 da 171):** (1) o contrato do `PUT` muda — congelar no plano: chave ausente = a coluna **não** entra no
`UPDATE` (a regra do `montarSetParcial` das propostas, `server/atualizacaoParcial.js`) ou "o que vier grava" como as outras quatro datas (hoje
`|| null` apaga quando ausente) — decidir e registrar em B; (2) os dois `INSERT` (`:20622`, `:20641`) também não gravam as quatro — a criação
pelo Comercial (`OSComercialForm`) as manda?; (3) validar `'AAAA-MM-DD'` (o `<input type="date">`) e o que fazer com texto inválido (400 com
mensagem literal × gravar nulo); (4) quem mais grava `ordens_servico` (`grep "UPDATE ordens_servico"`); (5) o PDF guardado só muda ao gerar de
novo (B1077); (6) o teste pela rota no `index.js` real (pasta vazia, a trava de máquina) e o cenário do gesto ao PDF (o formatador já é
extraído pelo `datasDoPdfDaOsNoDiaLocal.api.test.js`).

**Ferramentas prontas:** `client/src/utils/dataLocal.js` (`formatarInstanteDoBanco`, `COM_SEGUNDOS`, `formatarDataDoBanco` com `soData`,
`lerDataDoBanco`, `lerInstanteDoBanco`, `hojeLocalISO`); no servidor, `services/diaLocal.js`. A trava de máquina
(`C:/Users/User/AppData/Local/Temp/claude/C--Users-User-projetos-CRM/trava-test-api.d`, `mkdir` atômico). **O relógio parado precisa de prova
de que vale**, e **nenhuma prova pode coincidir com o dia de hoje** (a lição do r3 desta etapa: use instantes longe do relógio real).

**Dependem do P.O. — NÃO implemente:** a lista inteira do plano da 167 (da 152 em diante: **B853**/**C279**, **B808**, **B755**, **B761**/**C239**,
**C224**, o resto da **C225**, **C228**, **C219**, **C230**, o reparo da **C246** e a **C247**, a tabela de conversões e o grupo acima de família, a
régua do tempo de recebimento (E2), **C268**, **C269**, **C275**, **C276**, **C277**, **C109**, **C117**/**C118**, **C139**, **C278**; na 05, os itens
de produto e a **C198**; na 06, a **B11** e a Engenharia; na 21, a valorização por cliente e previsto × realizado; na 22, **B13**, **B101**/G30,
**G38**; no Compras, D-35, D-37, D-78, D-90, G9/G30, G4, G15, B63, B60, B62, a **C348**; nas propostas, a verificação do dono da proposta (Fase
12 — também a **C305**), o filtro por permissão do histórico, a **B910**, a **C307**, a Frente B da lentidão, a **C297** (**B924**), a **B926**,
a **C312**, a **C316**, a régua de quantidade da **C314**, a **B949** e a **C330**; no Operacional, a **C332**, ligar o painel antigo (*Dashboard
MES*, **C403**) e **ligar a edição de atividades e decidir o que ela grava** (**C408**); do Comercial, a **C354**, a **C357**/**B988**, a
**C359**/**B989** (e a **C360** junto), a **C358**, a **C383**, ignorar também o acento nas buscas (**B1013**, **B1019**) e o resto da **C382**
(**B1016**); do núcleo, a **C362**; da 160, a **C398** e a **C399**; da C400, a descrição da OS na busca das OPs; da 162, a **B1036**; da 163, o
`referencia` das remessas com 400 e o `horas_reais: 0`; da 164, a **C411**, a **C412** e o `mes` fora de 1–12 com 400; da 165, congelar a
emissão (**B1057**), imprimir a validade, unificar *hoje* × *vencido* do lembrete e o `validade_dias` fora de faixa com 400; da 166, a **C417**,
as janelas no dia 1 do mês e os atalhos no fuso de Brasília (**B1061**); da 167, restringir o `{{raw.…}}` ou escapar `{{` nos valores (**C420**) e
reescrever em massa as cláusulas congeladas (**B1067**); da 168, trocar o formato das datas de cada tela (a B1069 manteve o de cada
uma); da 169, tirar a OS cancelada das vencidas (**C424**) e o que a *Data Aprovação* mostra (**C425** — o dia de fechamento?); **desta etapa**, um teto para o `limit` dos Logs e o formato da *Retirada* das ferramentas.
Pendem de Postgres: **C98**, **C110**.

**O que já está pronto e não precisa reabrir:** a C421 inteira (161–170: o Chat, Compras, o Almoxarifado, os PDFs — `b8aed080`, `73a577c0`,
`3fb6aa0e`) e a C422 (`1e970cfb`, `26557862`).
