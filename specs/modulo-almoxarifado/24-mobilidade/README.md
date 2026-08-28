# Feature 24 — Mobilidade (scanner QR, assinatura de entrega, balcão no celular)

> **Status: 🚧 EM DESENVOLVIMENTO (Etapa 15, iniciada em 2026-08-28).**
> Design: `docs/superpowers/specs/2026-08-28-almoxarifado-etapa15-mobilidade-design.md`
> Plano: `docs/superpowers/plans/2026-08-28-almoxarifado-etapa15-mobilidade.md`

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

- [ ] Backend: tabela `assinaturas_entrega_almoxarifado` + `deliverySignatureService` +
      `POST /requisicoes/:id/assinatura-entrega` (multipart) + detalhe com
      `assinaturas_entrega` — testes `requisicaoAssinaturaEntrega.api.test.js`
- [ ] Scanner: `parseQrDestino` + tela `/almoxarifado/scanner` + item de menu — testes
      `scannerDestino.test.js`
- [ ] Front da assinatura: `AssinaturaCanvas` + etapa pós-entrega + botão avulso + exibição
      no detalhe — testes em `RequisicoesList.test.js`
- [ ] CSS mobile: fim do esconde-colunas, `.almox-table` com scroll, modal fullscreen
- [ ] Integração: jornada entregar→assinar (`requisicaoAssinaturaJornada.api.test.js`)

## Dependências

- Etiquetas QR da 6c (URLs que o scanner lê) — entregue.
- Fluxo de entrega de requisição da Etapa 3 (`PUT /entregar` intocado) — entregue.
- Padrão multipart + `limparUploadOrfao` de `extended.js` (Etapas 9/9b) — entregue.
