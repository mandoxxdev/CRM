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

### Pendente

- [ ] Teste visual: browser preview + geração de PDF
