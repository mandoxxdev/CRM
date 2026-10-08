# Etapa 89 — número de OS com caractere especial quebra o PDF

> Origem: próxima tarefa do plano da 88. Baseline (`d1e48292`): `test:api` 310/310; client 93
> suítes / 1382 testes; build limpo.

> **Estado (2026-10-08):** T1 **feita** em `393f8e1b`. Falta: Fase 2 (revisão do código + plano) e
> o fechamento (`fechar-etapa`: B44 nas novidades, guia, specs).
> - **Antes (medido, `c87-data`, porta 5982):** OS 3 com `numero_os = 'OS 1/2 "A"'` → o Chromium
>   renderizou em 592 ms e o `writeFileSync` falhou com `ENOENT ... \ordens-servico\OS_OS 1\2 "A"_<ms>.pdf`;
>   `gerar-pdf` **500** `{"error":"Erro ao gerar PDF"}`; `GET /:id/pdf` **404**.
> - **Depois (mesmos dados):** `gerar-pdf` **200**, `pdf_url` `/uploads/ordens-servico/OS_OS_1_2_A_<ms>.pdf`;
>   `GET /:id/pdf` **200** `application/pdf` `%PDF` (466 KB); `pdftotext -enc UTF-8 -layout` mostra
>   `N° OS 1/2 "A" | Rev. 00` e `OS 1/2 "A"` no documento (RN-89.02).
> - **Função:** `nomeArquivoPdfOs(numeroOs, id, agoraMs)` em `services/pdfOs.js`. Além do RN-89.01: acento
>   perde só a marca (NFD + `\p{M}`, "Manutenção" → `Manutencao`, não `Manuten_o`); `_` também sai das
>   pontas; "vazio" = sem letra nem dígito (`-`, `' - '` → id).
> - **Teste:** `pdfOsNomeArquivo.api.test.js` (10 casos + régua da rota). `pdfOsRodape` exigia o `require`
>   literal `{ CSS_PAGE_OS, opcoesPdfOs }` — passou a exigir os dois nomes sem fixar a lista.
> - **Controle positivo:** 5 sabotagens por Edit, 5 vermelhos — rota com `numero_os` cru (3 problemas na
>   régua), sem corte do `.` inicial (`OS_.._x`), sem limite de 80, sem NFD (`Manuten_o`), sem exigência de
>   letra/dígito (**passou de primeira**: o teste ganhou `'-'`, `' - '`, `'-_-'` e ficou vermelho).
>   Restaurado por Edit; CR=0 nos arquivos tocados.
> - **Suítes:** `test:api` 311/311 (310 + o novo); `test:almoxarifado` 44/44. Client não tocado.

## Fase 0 — o que existe (a T1 re-mede)
- `POST /api/operacional/ordens-servico/:id/gerar-pdf` grava o arquivo como
  `OS_${numero_os || id}_${Date.now()}.pdf` (`server/index.js:~21939`) com o `numero_os` **cru**. O
  `numero_os` é texto livre (sugestão `OS-001` editável, `:~21350`, não normalizado).
- Com `/` ou `\` → caminho com pasta inexistente → ENOENT; com `"`, `:`, `*`, `?`, `<`, `>`, `|` → o
  Windows recusa o nome (medido na prova da Etapa 81). Em ambos o PDF **já foi gerado na fila** e o
  usuário recebe 500 "Erro ao gerar PDF".
- `GET /api/operacional/ordens-servico/:id/pdf` (Etapa 81) acha o arquivo pelo `pdf_url` gravado com
  `path.basename` — o nome saneado continua compatível.
- Precedente: o nome do PDF do pedido de compra saneia o número com `[^\w.-]+` → `_`
  (`server/routes/compras.js:~298`).

## Decisão (B44)
Sanear **só o nome do arquivo**; o `numero_os` no banco e no documento não muda. Descartado: proibir
esses caracteres no cadastro da OS (mudaria dado e tela; OS antigas já podem tê-los).

## Regras
- **RN-89.01** O arquivo do PDF da OS é `OS_<numero saneado>_<ms>.pdf`, onde o saneamento troca toda
  sequência fora de `[A-Za-z0-9._-]` por `_`, corta `.` no início, limita o tamanho (ex.: 80) e, se
  ficar vazio, usa o `id` da OS.
- **RN-89.02** O PDF continua mostrando o `numero_os` original; o `pdf_url` gravado usa o nome saneado e
  o `GET /:id/pdf` baixa.

## Tasks
**T1 (única):** função pura (ex.: `nomeArquivoPdfOs(numeroOs, id, agoraMs)` em `services/pdfOs.js`) +
uso na rota; teste com `'OS 1/2 "A"'`, `'..\\x'`, acentos, vazio, muito longo, normal (`OS-001` mantém);
régua: a rota usa a função (sem `numero_os` cru no `path.join`). Controle positivo. **Prova real:**
servidor em `CRM_DATA_DIR` vazio (ou o `c87-data` do scratchpad), OS com `numero_os = 'OS 1/2 "A"'` →
`gerar-pdf` 200, `GET /:id/pdf` 200 `%PDF`, e o texto do PDF (`pdftotext -enc UTF-8`) mostra `OS 1/2 "A"`.

## Pontos de atenção
- Fase 2 (revisão do plano) junto com a revisão do código — mudança de uma linha com função pura.

## Fechamento (2026-10-08) — 🟢
- Revisão: feita por mim na leitura da função e dos 10 casos (mudança de uma linha com função pura,
  5 sabotagens vermelhas e prova real antes/depois). O prefixo `OS_` também afasta os nomes reservados
  do Windows (`CON`, `NUL`…). Sem revisor separado — registrado para não parecer esquecimento.

## Retro
- Rodadas de correção até verde: **0**. Achado do próprio executor: a sabotagem "sem exigência de letra
  ou dígito" passou de primeira — o teste ganhou os casos `'-'`, `' - '`, `'-_-'`.
- Defeito escapado: preencher na etapa seguinte.

## Próxima tarefa detalhada — Etapa 90: cabeçalho do PDF da OS mostra "Cliente: CLI (ID: 1)"
- **Visto nas provas das Etapas 87–89:** o cabeçalho e o bloco "Informações da proposta" do PDF da OS
  mostram `CLI (ID: 1)` / `CLI (1)`. Medir antes de mudar: o cliente de prova foi criado com que
  `razao_social`/`nome_fantasia`? `gerarHTMLOS` (`server/index.js:~13627`) monta o nome com qual campo e
  por que concatena o id? Pode ser só o dado de prova — se for, registrar e não mudar; se o código mostra
  sigla/código no lugar do nome, corrigir com prova antes/depois (`pdftotext`).

> **Etapa 90 — resultado da medição (2026-10-08):** não é o dado de prova (o cliente se chama
> "Cliente Prova 87"): `gerarHTMLOS` mostra `razao_social.substring(0, 3).toUpperCase() + ' (ID: ' + id + ')'`
> (`server/index.js:14258` e `:14355`), e as telas fazem o mesmo (`client/src/components/OSDetalhesForm.js:560`,
> `PreviewOSEditavel.js:334`) — desde o commit inicial `7f8d11e0`. Coerente demais para ser acidente:
> parece proposital (cliente não exposto no chão de fábrica). **Nada mudado**; pergunta D-90 no doc de
> novidades.
