# Feature 24 — Mobilidade (scanner QR, assinatura de entrega, balcão no celular)

> **Status: 🟢 ENTREGUE (Etapa 15, 2026-08-28, commits `7f74b6c..a82ad43`) — no escopo medido
> que a etapa se propôs (a Fase 4 completa da spec original NÃO é isto; ver "O que esta
> feature NÃO é").**
> Design: `docs/superpowers/specs/2026-08-28-almoxarifado-etapa15-mobilidade-design.md`
> Plano: `docs/superpowers/plans/2026-08-28-almoxarifado-etapa15-mobilidade.md`
> Revisão adversarial (2 lentes): backend Aprovado (1 Minor → pendência 1 abaixo); front
> Needs-fix-round leve — 1 Important (RN-01, prefixo sem barra) + 2 Minor, todos
> reproduzidos e corrigidos em `a82ad43`.

## O que esta feature é

A fatia real da "Fase 4 — Mobilidade e automação" da spec original (seções 5, 13.2 e
1276-1283), medida antes de prometida (2026-08-28):

1. **Scanner de QR pela câmera do celular** — fecha o ciclo das etiquetas da 6c (imprime
   etiqueta → aponta a câmera → cai na tela certa já filtrada). Client-only.
2. **Assinatura digital + responsável pela retirada na entrega de requisição** — o item que a
   spec original pede por extenso ("Registrar responsável pela retirada. Coletar assinatura
   digital.") e que a spec 04 deixou como gancho para a Etapa 15.
3. **Balcão usável no celular** — as tabelas do módulo param de esconder colunas ≥4 no
   mobile (regra antiga de `Almoxarifado.css`); modais utilizáveis em tela pequena.

## O que esta feature NÃO é (decidido no design, com porquê)

- **Código de barras 1D** — nada no sistema gera 1D; ler o que não existe é feature morta.
- **Coletor físico dedicado** — hardware não confirmado; a câmera do celular é o hardware
  assumido (coletores USB/Bluetooth emulam teclado e funcionariam nos campos de busca).
- **App nativo / PWA / offline** — sem demanda medida; o CRA responsivo cobre o balcão.
- **Fotografias na saída / endereçamento inteligente** — sem definição de negócio.
- **Flags `requer_assinatura`/`requer_termo` por tipo de material** — continuam mortas; a
  assinatura desta etapa é opcional sempre (RN-02: nunca bloqueia a entrega).

## Regras essenciais (RN — IDs usados nos testes e no manual)

- RN-01 scanner só navega para `/almoxarifado/...`
- RN-02 assinatura nunca bloqueia a entrega
- RN-03 assinatura só em ENTREGUE/PARCIALMENTE_ATENDIDA/ENCERRADA (409 literal)
- RN-04 assinatura append-only e auditada (`ASSINATURA_ENTREGA`)
- RN-05 escrita gateada por `separar_emitir`; leitura junto da requisição
- RN-06 mobile não esconde dado (scroll horizontal)

## Checklist (marcar com hash ao concluir)

- [x] Backend: tabela `assinaturas_entrega_almoxarifado` + `deliverySignatureService` +
      `POST /requisicoes/:id/assinatura-entrega` (multipart) + detalhe com
      `assinaturas_entrega` — testes `requisicaoAssinaturaEntrega.api.test.js` (9 cenários,
      matriz de 8 perfis, órfãos) — `fa119c8`
- [x] Scanner: `parseQrDestino` + tela `/almoxarifado/scanner` + item de menu — testes
      `scannerDestino.test.js` — `866d740` (merge `d92d0ae`); prefixo com barra obrigatória
      corrigido no fix round `a82ad43` (achado Important da revisão)
- [x] Front da assinatura: `AssinaturaCanvas` + etapa pós-entrega + botão avulso + exibição
      no detalhe — testes em `RequisicoesList.test.js` — `afff10f` (merge `2c03959`);
      asserts endurecidos e ✕ guardado em `a82ad43`
- [x] CSS mobile: fim do esconde-colunas, `.almox-table` com scroll, modal fullscreen —
      `ad4165d` (cherry-pick; o commit original `3ac777d` nasceu numa worktree com base
      errada e foi revalidado na branch da etapa)
- [x] Integração: jornada entregar→assinar (`requisicaoAssinaturaJornada.api.test.js`,
      motor real, saldo conferido) — `0cf94e1`

## Pendências nomeadas (abertas ao fechar a etapa)

1. **Erro de nível multer vira 500 opaco nas 5 rotas de upload do módulo — e SÓ isso**
   (foto de material, certificado, comprovante de sucata, calibração e a assinatura nova):
   arquivo de tipo errado, >limite ou campo inesperado não chega ao `limparUploadOrfao` da
   rota — o multer barra antes (nada é gravado, **medido por sonda na revisão**: zero órfão,
   zero linha), mas o erro escapa para o handler global de `index.js:22971` e vira
   `{ error: 'Erro interno do servidor' }` com 500 (o `message` real só aparece com
   `NODE_ENV=development`), em vez de 400 com motivo. A rota nova seguiu o padrão da casa DE
   PROPÓSITO; o conserto certo é um error-handler de multer uniforme nas cinco rotas + teste
   de MIME/limite em cada uma.

   **RENOMEADA em 2026-08-28 (Etapa 20, `1b0f0e9..a3f5135`) — a redação anterior chamava as
   cinco de "rotas de upload defeituosas" em bloco, e isso deixou de ser verdade para uma
   delas.** `POST /materiais/:id/foto` **saiu** do conjunto no que era próprio dela: hoje
   responde 404 `Material não encontrado` para material inexistente (antes: 200 mentiroso),
   limpa o arquivo órfão em **toda** saída ≠ 200, apaga a foto anterior só depois do UPDATE e
   em try/catch, e audita a troca. O que a mantém **nesta** pendência é exclusivamente o 500
   opaco do multer, que é comum às cinco e não é da rota — quem ler "a rota de foto está
   quebrada" a partir daqui vai reabrir trabalho já feito.
2. **Scanner e assinatura sem teste em aparelho real** (câmera, toque, HTTPS) — letra F10
   das novidades; roteiro manual no guia.
3. **Flags `requer_assinatura`/`requer_termo` de `tipos_material_almoxarifado` continuam
   mortas** — ligar é decisão de negócio (B26 das novidades).

## Dependências

- Etiquetas QR da 6c (URLs que o scanner lê) — entregue.
- Fluxo de entrega de requisição da Etapa 3 (`PUT /entregar` intocado) — entregue.
- Padrão multipart + `limparUploadOrfao` (Etapas 9/9b) — entregue. **Mudou de lugar na Etapa 20
  (`6cb594e`):** a função saiu do closure de `extended.js` para
  `services/almoxarifado/uploadCleanup.js` e agora recebe o diretório como 2º argumento
  (`limparUploadOrfao(req, dir)`); `extended.js` a importa com o alias `limparUploadOrfaoEm`.
  Quem for mexer nas rotas de upload procura ali, não mais no closure.
