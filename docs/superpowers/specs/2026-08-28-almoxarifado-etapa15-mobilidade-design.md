# Almoxarifado — Etapa 15: Mobilidade (design)

Data: 2026-08-28 · Branch: `desenvolvimento-almoxarifado`
Spec de origem: Fase 4 do planejamento mestre (`specs/modulo-almoxarifado/README.md`, seção
"Etapa 15") + seções 5, 13.2 e roadmap (linhas 1276-1283) da spec original
`2026-08-02-requisitos-modulo-almoxarifado.md`.

## Decisão de escopo (Fase 0 — medida antes de prometida)

A medição (2026-08-28) provou:

- **QR já existe e aponta para dentro do sistema.** As etiquetas da 6c codificam URLs completas
  (`${origin}/almoxarifado/materiais?material_id=...`, `/lotes?...&aba=...&lote=...`,
  `/sobras?sobra_id=...`) e as telas destino já leem os parâmetros e destacam a linha. O que
  falta é a **volta**: nada no sistema lê um QR — nenhuma lib de scanner, nenhum `getUserMedia`.
- **Não há código de barras 1D em lugar nenhum** — nada gera, nenhuma coluna `codigo_barras`.
- **Não há app móvel nem PWA** (o `sw.js` existente é só desregistrado), e não há coletor
  físico confirmado no galpão.
- **Assinatura digital não existe**: a entrega de requisição
  (`PUT /requisicoes/:id/entregar`) não captura recebedor nem assinatura; as flags
  `requer_assinatura`/`requer_termo` de `tipos_material_almoxarifado` estão mortas desde o seed.
- **Mobile hoje quebra dado**: `Almoxarifado.css:1025` esconde `th/td:nth-child(n+4)` abaixo de
  768px — toda tabela do módulo perde as colunas de dados E a coluna de ações no celular. Os
  modais não têm nenhuma regra mobile. Em compensação, a fundação é boa: viewport meta ok,
  sidebar colapsável com hambúrguer, alvo de toque 44px via `@media (hover:none)`.

**Escopo escolhido (decisão delegada pelo usuário em 2026-08-28 — "respostas recomendadas,
a feature só precisa existir"):** a fatia realista que o handoff da Etapa 14 previu:

1. **Scanner de QR pela câmera do celular** — fecha o ciclo da 6c (imprime etiqueta → aponta a
   câmera → cai na tela certa já filtrada). Client-only, zero mudança de servidor, como a 6c.
2. **Assinatura digital + responsável pela retirada na entrega de requisição** — o item que a
   spec original pede por extenso (seção 5: "Registrar responsável pela retirada. Coletar
   assinatura digital."; seção 13.2 idem) e que a spec 04 deixou como gancho para a Etapa 15.
3. **Balcão usável no celular** — parar de esconder colunas (scroll horizontal), modais
   utilizáveis em tela pequena, e entrada de scanner no menu.

**Fica FORA, declarado com porquê:**

- **Código de barras 1D** — nada no sistema gera 1D; ler o que não existe é feature morta.
  Quando houver etiqueta de fornecedor com EAN/Code128 para ler, é outra etapa (a arquitetura
  do scanner deixa o decodificador trocável).
- **Coletor físico dedicado** — hardware não confirmado com o cliente; a câmera do celular é o
  hardware assumido. Reversível: coletores USB/Bluetooth emulam teclado e funcionariam nos
  campos de busca existentes sem código novo.
- **App nativo / PWA instalável / modo offline** — sem demanda medida; o CRA responsivo dentro
  do Chrome do celular cobre o balcão. PWA é candidata natural de etapa futura se o galpão
  reclamar de atrito ("adicionar à tela inicial" já funciona sem manifest via menu do Chrome).
- **Fotografias na saída e "endereçamento inteligente"** (itens da Fase 4) — sem definição de
  negócio; fotografia já existe onde a dor foi real (avaria de ferramenta, comprovante de
  sucata).
- **Flags `requer_assinatura`/`requer_termo` por tipo de material** — continuam mortas nesta
  etapa. Ligá-las exigiria decidir obrigatoriedade por tipo (pergunta de negócio). A assinatura
  desta etapa é **opcional sempre** — ver RN-02.

## Arquitetura

### 1. Scanner QR (client-only)

- **Tela nova `/almoxarifado/scanner`** (`ScannerAlmoxarifado.js`), lazy no padrão
  `lazyModules.js`, item novo no menu do módulo.
- **Captura**: `navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } })`
  → `<video>` → frames num `<canvas>` → decodificação com **`jsQR`** (dependência npm nova no
  client; pura, ~small, sem worker, sem rede). Loop com `requestAnimationFrame` com throttle.
  Racional da escolha: `BarcodeDetector` nativo seria mais rápido mas não é universal;
  `html5-qrcode`/`@zxing` trazem superfície grande para uso pequeno. `jsQR` entra no chunk
  lazy da tela — custo zero para quem não abre o scanner.
- **Decisão de navegação — função pura `parseQrDestino(texto, origin)`**
  (`client/src/utils/scannerDestino.js`, testável sem câmera):
  - QR com URL do **mesmo origin** e caminho `/almoxarifado/...` → devolve o caminho relativo
    (path + query) para `navigate()`.
  - Qualquer outra coisa (origin alheio, caminho fora do módulo, texto que não é URL) →
    devolve `null`; a tela mostra o conteúdo lido e **não navega** (RN-01). QR de etiqueta
    impressa em outro ambiente (origin diferente, ex.: etiqueta gerada em produção lida no
    dev) → tenta reaproveitar path+query se o caminho for `/almoxarifado/...`, porque o
    identificador útil está no path, não no host. Decisão registrada: reaproveitar é o
    comportamento útil no galpão; a alternativa (recusar) obrigaria reimprimir etiquetas ao
    trocar de domínio.
- **Estados da tela**: pedindo permissão → lendo (com moldura de mira) → lido (vibra se
  `navigator.vibrate`, navega) → erro (câmera negada/indisponível, com instrução e campo de
  colagem manual do código como fallback).
- **Sem backend.** Nenhuma rota nova, nenhum gate novo — o destino já é protegido por
  `ProtectedModuleRoute` + gates existentes das telas.

### 2. Assinatura digital na entrega (backend + front)

**Modelo — tabela nova `assinaturas_entrega_almoxarifado`** (append-only, criada em
`schema.js` no padrão das demais):

```sql
CREATE TABLE IF NOT EXISTS assinaturas_entrega_almoxarifado (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  requisicao_id INTEGER NOT NULL REFERENCES requisicoes_almoxarifado(id),
  recebedor_nome TEXT NOT NULL,
  arquivo TEXT NOT NULL,            -- filename PNG em uploads/almoxarifado (flat, padrão da casa)
  criado_por INTEGER NOT NULL,
  criado_por_nome TEXT,
  criado_em TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_assinaturas_entrega_req ON assinaturas_entrega_almoxarifado(requisicao_id);
```

Por que tabela e não coluna na requisição: a entrega é parcial por design (uma requisição pode
ter N entregas em dias diferentes, com recebedores diferentes) — coluna única guardaria só a
última assinatura e mentiria sobre as anteriores. Append-only: assinatura não se edita nem se
apaga (é evidência); erro se corrige colhendo outra.

**Rota nova** (em `routes/almoxarifado/extended.js`, onde vivem o padrão multipart e
`limparUploadOrfao`):

```
POST /api/almoxarifado/requisicoes/:id/assinatura-entrega   (multipart)
  ordem canônica: auth → requirePermission('separar_emitir') → multer → safeParse
  campos: recebedor_nome (obrigatório, 1..120), assinatura (arquivo PNG/JPEG/WebP, máx 2MB)
  200 → { success: true, assinatura: { id, recebedor_nome, arquivo_url, criado_em, criado_por_nome } }
  400 sem arquivo → "Assinatura é obrigatória — envie a imagem no campo 'assinatura'."
  400 Zod → "Dados inválidos — <formatZodError>"
  409 status → "Só é possível registrar assinatura de entrega em requisição entregue (total ou parcialmente). Status atual: <STATUS>."
  404 → "Requisição não encontrada."
```

- Multer novo `uploadAssinatura` com prefixo `assinatura-`, mesmo diretório flat
  `uploadsAlmoxDir`, filtro imagem, limite 2MB. `limparUploadOrfao` em toda saída ≠ 200.
- Serviço `deliverySignatureService.js` (`registrarAssinatura`, `listarAssinaturas`), com
  auditoria no padrão da casa e status da requisição validado em
  `('ENTREGUE','PARCIALMENTE_ATENDIDA','ENCERRADA')` — ENCERRADA entra porque o encerramento
  pode acontecer antes de o papel/tela chegar ao recebedor; a assinatura documenta o passado.
- **Leitura**: o detalhe `GET /requisicoes/:id` passa a incluir
  `assinaturas_entrega: [ ... ]` (mesma forma do objeto da resposta do POST). Nenhum gate
  novo de leitura: quem vê a requisição vê as assinaturas dela.
- **Gate `separar_emitir`** (ADMINISTRADOR, ALMOXARIFE): quem entrega é quem colhe a
  assinatura — mesmo perfil da entrega. O solicitante NÃO assina por esta rota (ele já tem o
  `confirmar-recebimento` dele); o recebedor é um nome digitado + o traço na tela, não um
  usuário do sistema (chão de fábrica não tem login).

**Front — captura no modal de entrega** (`RequisicoesList.js`):

- Componente novo `AssinaturaCanvas.js` (client/src/components/almoxarifado/): canvas com
  pointer events (mouse + toque), traço suavizado, botões Limpar/Confirmar, exporta
  `canvas.toBlob('image/png')`. Sem lib externa — pointer events cobrem tudo que precisamos.
- No modal de entrega, depois de "Confirmar Entrega" bem-sucedida, abre etapa opcional
  "Colher assinatura do recebedor" (nome + canvas + Pular). Também disponível avulso no
  detalhe da requisição já entregue (botão "＋ Assinatura de entrega", visível sob
  `pode('separar_emitir')`), porque a entrega pode já ter acontecido (RN-02: a assinatura
  nunca bloqueia a entrega — a entrega é fato físico; a assinatura é documentação dele).
- Assinaturas existentes aparecem no detalhe da requisição (nome, data, quem colheu,
  thumbnail clicável para a imagem em `/api/uploads/almoxarifado/<arquivo>`).

### 3. Balcão no celular (CSS + estrutura mínima)

- **Matar a regra que esconde colunas** (`Almoxarifado.css:1025`
  `th:nth-child(n+4){display:none}`) e substituir por scroll horizontal: as telas embrulham
  a tabela em `.almox-table-wrap { overflow-x: auto; -webkit-overflow-scrolling: touch }`.
  Regra global na folha + wrapper aplicado nas telas operacionais (a folha já é única).
  Racional: esconder coluna perde dado e ação; card layout por tela seria o ideal mas custa
  uma reescrita por tela — scroll preserva 100% do dado hoje e não fecha a porta para cards
  depois.
- **Modais em tela pequena**: `@media (max-width: 768px)` para `.almox-modal`
  (`width: 100vw; height: 100dvh; max-height: none; border-radius: 0`) — o modal de entrega +
  assinatura tem de ser utilizável em pé, num celular, com teclado aberto.
- **Menu**: item "Scanner" no menu do almoxarifado (ícone de QR), primeiro da lista mobile.

## Regras de negócio (RN)

- **RN-01 — Scanner não navega para fora do módulo.** QR cujo conteúdo não resolva para um
  caminho `/almoxarifado/...` não navega: a tela exibe o conteúdo lido e oferece copiar.
  Cenário: QR de boleto/URL externa lido no balcão → nada de navegação, nada de XSS por
  `javascript:`.
- **RN-02 — Assinatura nunca bloqueia entrega.** A entrega continua exatamente como é
  (contrato do `PUT /entregar` intocado); a assinatura é etapa posterior, opcional, com
  "Pular" explícito. Cenário: recebedor com as mãos ocupadas/pressa → entrega registrada,
  assinatura fica sem colher, requisição segue o fluxo normal.
- **RN-03 — Assinatura só em requisição entregue.** Status fora de
  `ENTREGUE/PARCIALMENTE_ATENDIDA/ENCERRADA` → 409 com a mensagem literal do contrato.
  Cenário: requisição APROVADA (nada entregue) → 409, nenhuma linha, upload órfão apagado.
- **RN-04 — Assinatura é append-only e auditada.** Não há UPDATE nem DELETE de assinatura;
  cada registro guarda quem colheu (`criado_por`) e auditoria no padrão da casa. Cenário:
  duas entregas parciais em dias distintos → duas assinaturas, ambas visíveis no detalhe.
- **RN-05 — Gate `separar_emitir` na escrita, leitura junto com a requisição.** Perfis fora
  de ADMINISTRADOR/ALMOXARIFE recebem o 403 padrão do módulo no POST. Cenário: PRODUCAO
  tenta POST → 403 do `requirePermission` real; upload órfão apagado (multer roda depois do
  gate — ordem canônica).
- **RN-06 — Mobile não esconde dado.** Nenhuma tabela do módulo perde coluna em viewport
  pequeno; o acesso é por scroll horizontal. Cenário: tela de requisições a 375px → coluna
  de ações alcançável por scroll, nenhum `display:none` por posição de coluna.

## Errores e casos-limite

- Câmera negada/ausente → estado de erro com instrução + campo de colagem manual (o QR
  impresso tem a URL; digitável em último caso).
- `getUserMedia` exige contexto seguro (HTTPS ou localhost) — a tela detecta
  `!navigator.mediaDevices` e explica, em vez de quebrar.
- Upload de assinatura: PNG vazio/corrompido não é validado por conteúdo (limite + MIME
  apenas — mesmo nível das fotos de ferramenta); validar traço de verdade é assinatura
  biométrica, fora de escopo.
- Concorrência: duas assinaturas simultâneas para a mesma requisição são ambas aceitas
  (append-only resolve; não há claim porque não há transição de estado).

## Testes

- **API** (`server/tests/api/requisicaoAssinaturaEntrega.api.test.js`): matriz de gate (8
  perfis no POST), RN-03 por status (409 + mensagem literal), multipart feliz (200, arquivo
  existe no disco, linha na tabela, auditoria), sem arquivo → 400 + órfão inexistente,
  Zod inválido → 400 + órfão apagado, detalhe da requisição expõe `assinaturas_entrega`,
  append de segunda assinatura. **Controle positivo**: quebrar o filtro de status e ver o
  teste RN-03 falhar.
- **Client**: `scannerDestino.test.js` (função pura — origin próprio, origin alheio com path
  do módulo, URL externa, `javascript:`, texto solto, query preservada);
  `AssinaturaCanvas.test.js` (desenha → toBlob chamado, Limpar zera);
  teste do fluxo no `RequisicoesList.test.js` (após entrega, etapa de assinatura aparece;
  Pular fecha sem POST; confirmar faz POST multipart).
- **Integração cruzando galhos** (task dedicada): jornada entregar parcial → assinar →
  entregar resto → assinar de novo → detalhe com 2 assinaturas → encerrar → assinar ainda
  funciona (ENCERRADA) — tudo contra motor e serviço reais.

## O que muda em cada camada

| Camada | Mudança |
|---|---|
| `schema.js` | tabela `assinaturas_entrega_almoxarifado` + índice |
| `services/almoxarifado/` | `deliverySignatureService.js` novo |
| `routes/almoxarifado/extended.js` | `uploadAssinatura` + POST assinatura-entrega |
| `routes/almoxarifado.js` | detalhe da requisição inclui `assinaturas_entrega` |
| `client` deps | `jsqr` (nova) |
| `client/src/utils/` | `scannerDestino.js` |
| `client/src/components/almoxarifado/` | `ScannerAlmoxarifado.js`, `AssinaturaCanvas.js`, mudanças em `RequisicoesList.js` |
| `App.js` / `lazyModules.js` / menu | rota + prefetch + item Scanner |
| `Almoxarifado.css` | fim do esconde-coluna, `.almox-table-wrap`, modal mobile |
| `specs/modulo-almoxarifado/24-mobilidade/` | spec nova da feature (nasce nesta etapa) |
