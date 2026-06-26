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
