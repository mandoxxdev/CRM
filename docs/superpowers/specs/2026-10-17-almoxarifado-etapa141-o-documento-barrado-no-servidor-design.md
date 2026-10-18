# Etapa 141 (propostas): o documento da proposta barrado no servidor (C304) e os valores em reais do pedido (C306) — design

> Origem: "Próxima tarefa detalhada — Etapa 141" do plano da 140. Plano com as RN e os contratos:
> `docs/superpowers/plans/2026-10-17-almoxarifado-etapa141-o-documento-barrado-no-servidor.md`.

## Fase 0 — o que foi medido (2026-10-17, worktree `CRM-wt-e141`, da main `953441a4`)

**Quem chama as duas rotas (client, fora o código morto):**

| Chamador | Rota | Quando a tela deixa |
|---|---|---|
| `proposta/PropostaDetalhe.js` "Ver proposta" | `/premium` (sem embed) | botão desabilitado em rascunho e *desconto aprovado* |
| `proposta/PropostaDetalhe.js` "PDF gerado" | `/pdf` | idem |
| `proposta/PropostaForm.js` "Ver proposta" / "PDF" | `/premium` / `/pdf` | botões só aparecem fora de rascunho e *desconto aprovado* |
| `proposta/PropostasList.js` olho / PDF | abre `/comercial/propostas/:id/preview-editavel` / `/pdf` | toast e nada, em rascunho e *desconto aprovado* |
| `proposta/PropostaPreviewEditavel.js` (o editor) | `/premium?embed=1` ao carregar e depois de salvar; `/pdf` no botão PDF | **não confere status nenhum** — abre por URL direta |

`components/Propostas.js`, `components/PropostaForm.js` e `components/PreviewPropostaEditavel.js` são código morto (não roteados; D (140)).
**Nada no servidor** chama as duas rotas nem gera o documento por outro caminho: `gerarHTMLPropostaPremiumV2` só é chamado nelas
(`index.js` ~9588 e ~9978); não há envio de proposta por e-mail que anexe o PDF (o `/enviar` só muda o status). O `pdf-anexo` é o PDF
que o **usuário** sobe, não o gerado.

**Em que status o editor é usado de verdade:** só se chega a ele pela lista (o olho), que barra rascunho e *desconto aprovado* — então o
editor é usado em proposta **enviada / aprovada / perdida**. Mas ele continua aberto quando a proposta volta para rascunho (nova revisão
noutra aba), e o "Emitir revisão" de dentro dele (`POST /revisao`) **não** muda o status (só o número). Ou seja: barrar o `embed=1` por
status quebraria só quem tem o editor aberto numa proposta que voltou a rascunho — o cenário da C304.

**Onde a margem já é barrada hoje:** o `PUT` recusa margem acima de 5 sem aprovação que case em **todo status que não é rascunho**
(RN-140.09); o `/enviar` e o `/assinar` também. Então, fora de dado antigo, **só a rascunho** chega a ter margem acima de 5 sem aprovação —
e é exatamente o estado em que o editor aberto baixava o PDF. Dado antigo: as enviadas/ganhas com desconto auto-aprovado (que a **B912**
deixou de aceitar) e as que saíram pelos caminhos da C301–C303 — a **A87** já as lista. Banco local (cópia de 09/10): 57 propostas
(23 aprovadas, 27 enviadas, 7 rascunhos), **0** com margem acima de 5.

**O que os testes exercitam:** `propostaPdfExigeLogin.api.test.js` é teste de **texto** (a linha `app.get('/api/propostas/:id/<x>',
authenticateToken,` e a régua das 7 rotas abertas) — não muda com a regra nova se a assinatura da rota ficar igual.
`propostaClausulaAlem524.api.test.js` chama `/premium` **sem** embed numa **rascunho com margem 0** — continua 200 com a regra pela margem
(e quebraria com uma regra pelo status). A revisão obrigatória (22 + editor) chama o **template direto**, não a rota.

**C306 medido:** `POST /api/aprovacoes` grava `valor_total`, `valor_com_desconto` e `valor_desconto_rs` do corpo. As duas telas que pedem
(`Aprovacoes.js` "Nova solicitação" e o salvar do `proposta/PropostaForm.js`) mandam `valor_total` = o total **bruto** gravado na proposta
(`propostas.valor_total`, que o formulário acabou de gravar com o mesmo número), `valor_desconto_rs = total × % / 100` e
`valor_com_desconto = total − desconto`. O servidor pode calcular o mesmo a partir da proposta.

## Decisões (todas reversíveis; vão para a letra B)

1. **A regra é a do desconto, não a do status** (o desenho sugerido). `/pdf` e `/premium` sem `embed` recusam a proposta cuja margem
   gravada passa de 5 (ou é ilegível) sem aprovação que case (`aprovacaoDesconto.margemLiberada`, a mesma do `/enviar`) — em **qualquer**
   status (e também o `embed` do editor, Fase 2). **Descartado:** barrar pelo status (rascunho e *desconto aprovado*) como a tela faz — quebraria o `propostaClausulaAlem524` e
   não acrescenta proteção ao desconto (rascunho com ≤ 5 % não tem desconto a aprovar); e isentar enviada/ganha (o dado antigo com
   desconto auto-aprovado continuaria imprimindo). **Consequência:** proposta antiga já enviada com desconto sem aprovação válida deixa de
   ter PDF até alguém aprovar o desconto — a **A89** as lista antes do deploy.
2. *(**Revista na Fase 2 — esta decisão estava errada:** o HTML do `embed` é o **mesmo** documento completo, só sem a barra de
   impressão, e sai para qualquer logado pelo editor aberto por URL; o `embed` passa a recusar também — RN-141.03 do plano. O texto
   original fica abaixo.)* **O `embed=1` (o editor) fica como está — sem barreira e sem marca d'água.** O editor precisa carregar para editar cláusulas, e o HTML
   do `embed` não é entregável (mora num iframe da tela, sem a barra de impressão); a porta do documento entregável é o PDF, que passa a
   recusar. **Descartado:** marca d'água "prévia" no `embed` (mexe no template, que é o contrato da revisão obrigatória — invariantes de
   paginação I5/I6); recusar o `embed` também (o editor de uma proposta que voltou a rascunho com desconto pendente deixaria de abrir para
   editar cláusulas). **Resta (D (141)):** o editor aberto mostra o desconto não aprovado na tela, e imprimir a tela pelo navegador não é
   barrado.
3. **Recusar antes de qualquer gravação e antes do navegador headless.** A conferência vem logo depois do 404, antes das customizações,
   das cláusulas e do Puppeteer — o `/pdf` não grava `html_rendered`, `css_snapshot`, `pdf_gerado_at`, `snapshot_checksum` nem
   `proposta_snapshot` quando recusa.
4. **Ordem das recusas:** 400 id → 503 banco → 404 → **403 desconto**. Sem login continua 401 (antes de tudo).
5. **A tela mostra a frase do servidor.** Hoje os quatro downloads de PDF (lista, detalhe, formulário, editor) e os dois "Ver proposta"
   mostram uma frase genérica no erro (com `responseType: 'blob'` o JSON vem dentro de um Blob). Passam a ler a frase com
   `mensagemDoErroEmBlob` (Etapa 78), mantendo a genérica como padrão.
6. **C306: os valores em reais do pedido saem da proposta**, não do corpo: `valor_total` = `propostas.valor_total` gravado (não número → 0),
   `valor_desconto_rs = round2(total × % / 100)`, `valor_com_desconto = round2(total − desconto)`; o aviso ao aprovador usa os mesmos.
   Os do corpo são ignorados **sem erro** (as telas mandam — como o `status` e o `solicitado_por` da B908). **Descartado:** recusar o
   pedido cujos valores não batem (quebraria a tela por arredondamento); recalcular pelo subtotal dos itens (o número que as telas usam é o
   `valor_total` gravado; o dos itens é outra regra, B910).
