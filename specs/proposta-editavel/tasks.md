# Proposta Editável — Tarefas

Status: [ ] pendente | [x] concluído | [~] em andamento | [!] pendente de decisão

---

## Fase 1 — Backend: Banco de Dados

- [x] Criar tabela `proposta_customizacoes` no `server/index.js`
- [x] Criar tabela `proposta_clausulas` no `server/index.js`
- [x] Criar tabela `proposta_edicoes_log` no `server/index.js`
- [x] Garantir que as tabelas são criadas na inicialização

---

## Fase 2 — Backend: Rotas de Customizações

- [x] `GET /api/propostas/:id/customizacoes`
- [x] `PUT /api/propostas/:id/customizacoes` — salva campos + registra log

---

## Fase 3 — Backend: Rotas de Cláusulas

- [x] `GET /api/propostas/:id/clausulas`
- [x] `POST /api/propostas/:id/clausulas`
- [x] `PUT /api/propostas/:id/clausulas/:clausulaId`
- [x] `DELETE /api/propostas/:id/clausulas/:clausulaId`
- [x] `PUT /api/propostas/:id/clausulas/reordenar`
- [x] `POST /api/propostas/:id/clausulas/inicializar` — copia cláusulas padrão para a proposta
- [x] `POST /api/propostas/:id/clausulas/resetar`

---

## Fase 4 — Backend: Aplicar Customizações na Renderização

- [x] `/premium` aplica `proposta_customizacoes` nos campos de contato
- [x] `/premium` usa `proposta_clausulas` quando existirem para a proposta
- [x] `/pdf` aplica as mesmas customizações
- [x] Conteúdo HTML das cláusulas renderizado corretamente (bug: `esc()` escapava HTML — corrigido)
- [x] Conteúdo plain text (editado pelo usuário) convertido para `<p>` no template

---

## Fase 5 — Backend: Auditoria

- [x] `GET /api/propostas/:id/edicoes-log` com paginação (`page`, `limit`)
- [x] Todos os endpoints de escrita registram no log
- [x] `usuario_nome` salvo junto com `usuario_id`

---

## Fase 6 — Frontend: Rota e Componente Principal

- [x] Rota `/comercial/propostas/:id/preview-editavel` no `App.js`
- [x] `PropostaPreviewEditavel.js` — toolbar + iframe com HTML da proposta
- [x] `PropostaPreviewEditavel.css`
- [x] `PropostasList.js` — ícone de olho abre a nova rota em nova aba

---

## Fase 7 — Frontend: Toolbar e Modo Edição

- [x] Barra de ferramentas fixa no topo
- [x] Toggle Visualização / Edição
- [x] Campos editáveis destacados em modo edição (borda amarela pontilhada)
- [x] Botão "Salvar Alterações" (desabilitado quando sem mudanças)
- [x] Feedback de salvamento (loading + toast)

---

## Fase 8 — Frontend: Edição de Campos de Contato

- [x] `cliente_nome`, `cliente_email`, `cliente_telefone`, `cliente_contato` editáveis via `contenteditable`
- [x] Valores customizados carregados ao abrir
- [x] Alterações enviadas via `PUT /customizacoes` ao salvar

---

## Fase 9 — Frontend: Editor de Cláusulas

- [x] `EditorClausulas.js` com listagem em accordion (clicar expande o card)
- [x] Edição de título e conteúdo de cada cláusula (auto-save no blur)
- [x] Textarea auto-cresce com o conteúdo (sem barra de rolagem)
- [x] Reordenação com botões ↑↓ (substituiu drag-and-drop do spec original)
- [x] Botão de remover cláusula
- [x] Botão "Adicionar Cláusula" (nova cláusula já abre expandida)
- [x] Botão "Resetar para padrão" com confirmação
- [x] Estado de inicialização: proposta sem cláusulas customizadas mostra tela de inicializar
- [x] Conteúdo HTML antigo convertido para texto legível ao carregar (`htmlToText`)

---

## Fase 10 — Frontend: Histórico de Edições

- [x] `HistoricoEdicoes.js` — painel lateral
- [x] Log paginado via `GET /edicoes-log`
- [x] Diff lado a lado (antes/depois) expandível por entrada
- [ ] Agrupar entradas consecutivas do mesmo usuário — não implementado
- [ ] Filtros por usuário/tipo/período — não implementado
- [ ] Controle de permissão (exibir botão só para admin/comercial) — não implementado

---

## Fase 11 — Seção 4.0 do Template (descoberta durante implementação)

- [x] Diagnóstico: seção 4.0 vinha em branco pois itens não têm `descritivo_tecnico` preenchido
- [x] Campo "Descritivo técnico" vazio agora mostra mensagem informativa em vez de `—`
- [x] Layout reestruturado: imagem do produto aparece acima da tabela de dados (antes era lado a lado)
- [x] Validar se a cláusula 4.0 tem dados a serem exibidos, caso contrario exibir uma mensagem informando que não há essa informação cadastrada nos produtos da proposta.
- [x] A imagem da cláusula 4.1 não está aparecendo. (Causa: arquivo ausente no disco. Fix: placeholder "Foto não disponível" exibido quando imagem falha ao carregar)

---

## Fase 12 — Segurança (apontada pelo security review) executar apenas se forem solicitadas diretamente (pode perguntar caso queira corrigir)

- [ ] **HIGH**: rotas `/premium` e `/pdf` sem verificação de ownership — qualquer usuário autenticado acessa proposta de outro
- [ ] **MEDIUM (BOLA)**: rotas de escrita de cláusulas e customizações sem checar se a proposta pertence ao usuário


---

## Fase 13 — Testes

- [ ] Fluxo completo: editar → salvar → fechar → reabrir → confirmar persistência
- [ ] PDF: gerar PDF após edições e confirmar que reflete customizações
- [ ] Auditoria: verificar todos os tipos de alteração registrados corretamente
- [ ] Reset: confirmar que apaga customizações e volta ao padrão
- [ ] Permissões: perfis sem acesso não veem o histórico

---

## Fase 14 — Bugs de PDF e Paginação (ver `bug-pdf-paginacao.md`)

- [x] **Fix 1**: Flatten de `clausulasSection` — cláusulas customizadas agora são blocos irmãos, não um único bloco gigante (commit `598cf75`, 26/06). Resolve truncamento do PDF e erro ao abrir pela lista.
- [x] **Fix 2**: Corrigir `fits()` sem argumento no paginator V2 em `server/index.js` — corrigido para `fits(pageLimitPx)` nas duas ocorrências; `pageLimitPx` extraído como constante do primeiro `pageContent.clientHeight`
- [x] **Fix 3**: Remover `isItem55Block` workaround (`server/index.js`) — removido junto com `safety55Px`, `footerEl` e `footerHeightPx`; `wouldOverflowIfAdd` simplificado; variável morta `isAvoid` também removida
- [x] **Fix 4**: Botão "Download PDF" na toolbar de `PropostaPreviewEditavel.js` — botão adicionado chamando `GET /api/propostas/:id/pdf` com `responseType: 'blob'` e download via `<a>`; erro logado em `console.error`
- [x] **Fix 5**: Cláusula 5.5 subdividida em 3 `<section allow-break>` independentes — heading+agendamento / responsabilidades CONTRATANTE / tabela Hora-Homem — para o paginator poder distribuir em páginas separadas

---

## Fase 15 — Redesign do template da proposta (modelo DOCX)

**Modelo de referência:** `specs/proposta-editavel/propostaDevExemploEmDocx.docx`

### Extração de imagens

- [x] Extrair imagens do DOCX para `specs/proposta-editavel/images/`
- [x] Copiar imagens relevantes para `server/assets/proposta/`:
  - [x] `logo-gmp.png` — logo GMP horizontal (cabeçalho)
  - [x] `logo-moinho-ypiranga.png` — logo MOINHO YPIRANGA (cabeçalho)
  - [x] `dados-contratada.png` — tabela cadastral da CONTRATADA como imagem
  - [x] `logo-gmp-grande.png` — logo GMP grande (reserva)

### Código (`gerarHTMLPropostaPremiumV2` em `server/index.js` → extraído para `server/templates/propostaPremiumV2.js`)

- [x] Carregar imagens como base64 via `fileToDataUrl()` (`gmpLogoSmB64`, `myLogoB64`, `dadosContratadaB64`)
- [x] Remover variáveis mortas (`itensRows`, `itensListaHtml`) e adicionar `ofertaRows` para seção 3
- [x] Redesenhar `pageHeaderTemplateHtml`: dual-logo (GMP | MOINHO YPIRANGA | nº proposta)
- [x] Redesenhar `pageFooterTemplateHtml`: informações completas da empresa em linha única
- [x] CSS: `--ink: #1a1a1a`, h2 fundo prata (#C0C0C0), h3 azul, famílias Arial nos títulos
- [x] Substituir capa SVG wave por capa limpa (borda azul lateral + tabela de contratante)
- [x] Adicionar seções ao `blocksHtml` antes da seção 4:
  - [x] DADOS DA CONTRATADA (imagem)
  - [x] 1. OBJETIVO DA PROPOSTA
  - [x] 2. ELABORAÇÃO DA PROPOSTA
  - [x] 3. OFERTA (tabela dinâmica)
- [x] Renomear seção de "4.0 DESCRITIVO DOS EQUIPAMENTOS" para "4. ESCOPO DE FORNECIMENTO"
- [x] Limpeza de variáveis mortas do SVG wave: `coverWaveImageUrl`, `coverSvgDefs`, `coverNavyFill`, `coverImageURL`, `publicCabecalhoJPGPath`, `publicCabecalhoPNGPath`, `publicCBC2Path`, `defaultCoverImage`, `clienteLogoUrl`, `logoGMP`

### Visual improvements (sessão 16/07/2026)

- [x] **Capa redesenhada** (`server/templates/propostaPremiumV2.js`):
  - [x] `industria40.png` full-width no topo (`.cover-hero`, 90mm)
  - [x] Barra de logos dividida ao meio: GMP esquerda / Moinho Ypiranga direita (`.cover-logo-half`)
  - [x] Faixa azul escura com "PROPOSTA PARA FORNECIMENTO DE EQUIPAMENTOS INDUSTRIAIS" (`.cover-blue-strip`)
  - [x] Área central com título, número e campos do cliente em texto preto
  - [x] Classes individuais por campo: `.cover-field-contratante`, `.cover-field-cnpj`, `.cover-field-email`, `.cover-field-emissao`
- [x] **Apresentação como página 2 estática** (fora do paginador):
  - [x] Layout grid: texto à esquerda, fotos (`fabrica-gmp.jpeg` + `industria40.png`) à direita
  - [x] `max-height: 88mm` nas imagens para garantir que a página inteira cabe sem overflow
  - [x] Classe `.pres-page-content` no `<main>` para controle de layout
- [x] **Títulos h2**: sem fundo cinza/borda, letras maiúsculas azul escuro (`var(--blue-900)`)
- [x] **Seção 4 — Escopo de fornecimento**: h2 agrupado com primeiro item em `avoid-break` para evitar quebra órfã de página
- [x] **Dados técnicos de equipamentos**: formato chave-valor (`<p><strong>Campo:</strong> Valor</p>`) em vez de tabela; classe `.equip-specs-kv`

### Refatoração de código (sessão 15/07/2026)

- [x] Extração de `gerarHTMLPropostaPremiumV2` e `substituirPlaceholdersProposta` para `server/templates/propostaPremiumV2.js`
- [x] Criação de `server/config/paths.js` com 18 constantes de diretório exportadas via `module.exports`
- [x] `server/index.js` importa de ambos os módulos; ~1.560 linhas removidas
- [x] Novas imagens copiadas para `server/assets/proposta/`: `fabrica-gmp.jpeg`, `industria40.png`, `projetos.png`
- [x] `node --check` sem erros em `index.js`, `paths.js` e `propostaPremiumV2.js`

### Ajustes visuais e UX (sessão 16/07/2026 — continuação)

- [x] `flex-shrink: 0` em `.proposal-page` — impede compressão abaixo de 297mm no browser
- [x] `@media screen`: fundo cinza (`#d0d7de`), gap 16px e sombra entre páginas — separação visual clara entre pages no preview
- [x] `@media print`: reverte gap/padding/shadow para PDF limpo
- [x] `justify-content: flex-start` em `.cover-info-area` — elimina espaço em branco flutuante na capa
- [x] `[data-edit] { display: inline-block; min-width: 60px; cursor: text }` — campos editáveis sempre clicáveis, mesmo vazios
- [x] Email com fallback `—` quando vazio (era string vazia, ficava invisível e sem área de clique)

### Fidelidade ao modelo DOCX (sessão 18/07/2026)

Comparação sistemática do template com `PROPOSTA PARA DEV.docx` / `pp para dev.pdf` (paleta, fontes, header/footer, tabelas, estrutura).

- [x] **Fase A — identidade visual:**
  - [x] `--ink` e títulos em `#002060` (azul marinho do modelo — todo o texto do corpo)
  - [x] Fonte `Century Gothic` (com fallbacks Trebuchet MS/Arial) em corpo e títulos
  - [x] h2 em 14pt (era 13pt), como o estilo Título1 do modelo
  - [x] Tabela FINAME com classe `.table-dark`: header `#002060` + texto branco + zebra `#F9F9F9`/`#EDEDED`
  - [x] `th` genérico: centralizado, sem fundo, texto azul (como no modelo)
  - [x] Header com tagline "Especialista em Misturas, Moagens..." (9pt no modelo)
  - [x] Footer em 4 linhas centralizadas azuis: empresa/CNPJ/tel (bold), 5 sites em 2 linhas, endereço + Pág. X/Y
- [x] **Fase B — estrutura:**
  - [x] Página de SUMÁRIO estática (`#tocPage`) preenchida via JS pós-paginação com números de página reais (h2 `1.`–`5.` + h3 `4.x`/`5.x`); regex no script embutido precisa de `\\d` por estar dentro do template literal
  - [x] Specs de equipamentos em 10pt + legenda laranja `#ED7D31` "IMAGEM ILUSTRATIVA" sob a foto do produto
  - [x] Fix: `align-self: anchor-center` → `center` em `.cover-field-emissao`
- [x] **Fase C — conteúdo (aprovado pelo usuário):**
  - [x] Foro 5.21: Diadema → São Bernardo do Campo (template + `clausulasDefault.js`)
  - [x] Garantia 5.4: incluído `matheus@gmp.ind.br` (template + `clausulasDefault.js`)
  - [x] Redações das seções 1 e 2 alinhadas ao texto do modelo DOCX
  - Tabela FINAME/BNDES permanece fixa (não dinâmica) por decisão do usuário
- [x] Teste visual: render com dados mock via Puppeteer — screenshots de capa/apresentação/sumário/conteúdo/FINAME conferidos + PDF de 20 páginas gerado sem erro
- [x] **Ajustes de fidelidade (mesma sessão, feedback do usuário):**
  - [x] Header e footer padrão adicionados também na CAPA (no modelo aparecem em todas as páginas); `.cover-hero` limitado a 68mm para caber
  - [x] Página de APRESENTAÇÃO refeita igual ao modelo: sem título, texto integral em largura total (1º parágrafo bold, 9 bullets, parágrafo final), 12pt, e imagem `projetos.png` (idêntica à image5 do DOCX) centralizada abaixo; removido o grid texto+fotos anterior (`fabrica-gmp.jpeg` deixou de ser usada)

- [x] **Fix: header em branco no ambiente real.** Causa: `proposta_template_config` aponta para `header_1773852005478_CBC2.png` / `footer_1773852011922_Footer.png`, que não existem mais em `uploads/headers|footers` (os arquivos no disco são de uploads mais antigos). Quando `header_image_url` está setado, o template escondia o header padrão e a imagem 404ava — o `onerror` removia a `<img>` sem restaurar o header (o footer tinha restauração, o header não). Correções em `propostaPremiumV2.js`: (1) imagem de header/footer customizada só é usada se o arquivo existir no disco (embed base64, sem fallback HTTP); senão renderiza o header/footer padrão do modelo DOCX; (2) `onerror` do header agora restaura `.page-header-inner`. Os logos do header padrão são byte-idênticos aos do header do DOCX (image13/image14).

- [x] **Header redesenhado (pedido do usuário):** logo Moinho Ypiranga à esquerda, logo GMP à direita, box central com borda arredondada contendo "PROPOSTA TÉCNICA COMERCIAL Nº {numero}" (dinâmico) + tagline em fonte normal 6.5pt. Header removido da CAPA (hero voltou aos 78mm do modelo); footer permanece em todas as páginas.

- [x] Lista da APRESENTAÇÃO com checkmarks azuis (✓ via `li::before`, cor `--blue-900`) no lugar de bullets, como no PDF modelo. Atenção: `content: "\\2713"` precisa do escape duplo por estar dentro do template literal.
- [x] Indentação de primeira linha nos parágrafos da APRESENTAÇÃO (`text-indent: 12.5mm`, equivalente ao `w:firstLine="709"` twips do DOCX); os itens com ✓ alinham no mesmo recuo (`ul { padding-left: 12.5mm }`). Título "APRESENTAÇÃO" (adição do usuário) mantido sem recuo via `text-indent:0` inline.

- [x] Título da proposta (campo `titulo` do cadastro) na faixa azul da capa, em amarelo `#FFFF00` 12pt bold, abaixo de "PROPOSTA PARA FORNECIMENTO..." — equivale ao placeholder `**TITULO**` amarelo do modelo DOCX. Renderizado apenas quando `proposta.titulo` está preenchido (evita repetir o fallback genérico).

- [x] Campos EMPRESA CONTRATANTE / CNPJ / Email da capa (`.cover-client-info`) agrupados (`gap: 30px` → `6px`) e fonte reduzida (`14.5pt` → `13pt`) — estavam com espaçamento maior que o do modelo.

### Edição inline das cláusulas (sessão 20/07/2026)

Substituição do painel lateral `EditorClausulas` por edição direta no preview (spec: `edicao-inline-clausulas-design.md`, plano: `docs/superpowers/plans/2026-07-20-edicao-inline-clausulas.md`). Executado via subagentes com revisão por task.

- [x] Template: atributos `data-clausula-key`/`data-clausula-campo` na seção 5 (cláusula persistida = id; default = `default-{numero}`)
- [x] Rota `/premium?embed=1` sempre monta a seção 5 a partir de lista estruturada (`resolverClausulasParaPreview`: custom do banco ou `getClausulasDefault()`), nunca do HTML fixo
- [x] Módulo `client/src/components/proposta/clausulasInlineEditor.js` — manipulação de `#proposalSource` (ler/sincronizar/mover/remover/adicionar/diff/renumerar), coberto por testes jsdom
- [x] `PropostaPreviewEditavel.js`: campos da cláusula viram `contentEditable` no iframe, com controles ↑↓/+/🗑; repaginação debounced + restauração de cursor
- [x] Salvamento unificado no botão "Salvar alterações" (diff contra snapshot → POST/PUT/DELETE/reordenar); relink de `default-`/`temp-` para id real; idempotente em retry após falha parcial
- [x] Toolbar: botão "Cláusulas" removido, adicionado "Resetar cláusulas"
- [x] Fix (revisão final): título default renderizava sem o número "5.x" mas era persistido com ele → primeiro save apagava os números no banco. Corrigido (`renderClausulaCustom` numera default; `diffClausulas`/`houveMudanca` normalizam HTML×texto)
- [x] Fix (QA ao vivo): edição parava de funcionar segundos após carregar, pois o script do template repagina sozinho (load+250ms / resize) e recriava os nós sem reaplicar `contentEditable`. Resolvido com `MutationObserver` em `#proposalDocument`
- [ ] Remover `EditorClausulas.js`/`.css` (código morto) — **gated**: só após validação manual do fluxo em uso real

### Ajustes de layout e edição (sessão 20/07/2026)

Cinco ajustes pedidos pelo usuário, executados via subagentes com revisão por task.

- [x] **A — Fonte Century Gothic embutida** (`3c780d7`): `@font-face` base64 (4 pesos) no template a partir de `server/assets/fonts/`, para renderizar no PDF sem depender de instalação
- [x] **B — Conteúdo não ultrapassa o rodapé** (`abaef82` + `90fed9c`): causa raiz confirmada por reprodução = blocos atômicos maiores que uma página cortados por `overflow:hidden` (hipótese flexbox refutada). Fix: `splitBlockByChildren` + `splitTextLeaf` paginam blocos grandes. Revisão pegou perda de dados ao editar cláusula dividida (mesmo `data-clausula-key` em vários fragmentos) → corrigido remontando o conteúdo de todos os fragmentos no `oninput`
- [x] **C — Foto do equipamento à direita do descritivo** (`bba2c96`): `float:right` 35% largura / altura auto; `.equip-specs-kv` mudou de flex→block+clearfix (float não funciona em flex container); texto envolve e continua abaixo
- [x] **D — Corpo da cláusula nova visível/clicável** (`7a3dcf5`): corpo criado vazio + `min-height` + placeholder CSS `::before` (nunca vira conteúdo salvo)
- [x] **E — Renumeração automática das cláusulas** (`df293ac`): `renumerarClausulas(doc)` recalcula 5.1, 5.2... na fonte a cada add/remover/mover; sumário reflete na repaginação
- Limitação conhecida (backlog, não bloqueia): em quebras extremas, `splitBlockByChildren` pode deixar o rótulo "Descritivo técnico:" órfão antes do bloco grande migrar de página

### Pendente

- [ ] **Teste no Chrome (nova sessão, outra máquina)** — ver `teste-chrome-edicao-inline.md`
- [ ] Validação visual final pelo usuário no preview real (com dados de proposta reais)
- [ ] Remover `EditorClausulas.js`/`.css` após a validação manual confirmar o fluxo
- [ ] (Opcional) Limpar/atualizar `proposta_template_config` no banco — registro atual aponta para uploads de header/footer inexistentes (legado CBC2, anterior ao redesign)
