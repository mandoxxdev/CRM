# Teste no Chrome — edição inline + ajustes de layout da proposta

> **Para retomar em nova sessão / outra máquina:** este arquivo é o roteiro do teste manual no navegador. Como a edição inline depende de layout real (iframe, medição de altura, seleção/cursor) e das rotas autenticadas do app, isso só é validável num Chrome logado — não em teste automatizado headless.

## Contexto

Branch: `feat/proposta-redesign-fase15`. Todos os commits já estão no remote (`git pull` traz tudo). O último commit de código é `df293ac`.

Foram entregues, nesta e na sessão anterior:
- Edição inline das cláusulas (substituiu o painel lateral `EditorClausulas`)
- 5 ajustes: (A) fonte Century Gothic embutida, (B) conteúdo não ultrapassa o rodapé, (C) foto do equipamento flutuando à direita, (D) corpo da cláusula nova visível/clicável, (E) renumeração automática das cláusulas

Detalhes técnicos de cada um em `tasks.md` (seções "Edição inline das cláusulas" e "Ajustes de layout e edição", sessão 20/07/2026).

## Como usar a skill do Chrome (para o assistente na nova sessão)

1. O usuário precisa ter a **extensão do Claude no Chrome instalada e com permissão concedida ao domínio** do app (ex.: `http://localhost:3000`). Sem isso a skill `claude-in-chrome` é rejeitada.
2. App rodando: `npm run dev` (raiz do projeto). Frontend costuma subir em `localhost:3000`, backend em `localhost:5000`.
3. Invocar a skill `claude-in-chrome`, abrir a rota do preview editável de uma proposta e seguir o checklist abaixo, tirando screenshots e lendo o console.

Rota do preview editável: `/comercial/propostas/:id/preview-editavel` (abre em nova aba pelo ícone de olho na lista de propostas).

## Proposta de teste

- Proposta **37** foi citada pelo usuário para o teste do rodapé.
- Para o teste de cláusulas grandes/quebra de rodapé, o ideal é uma proposta com muitas cláusulas e/ou uma cláusula longa. Se a 37 não for grande o suficiente, criar/editar cláusulas até encher várias páginas.

## Checklist

### 1. Rodapé (Task B) — foco do usuário
- [ ] Abrir uma proposta grande (a 37, e se preciso adicionar cláusulas longas) e percorrer TODAS as páginas
- [ ] Confirmar que NENHUM conteúdo fica por baixo/sobreposto ao rodapé em nenhuma página
- [ ] Confirmar que nenhum parágrafo some (conteúdo que antes era cortado agora deve estar em página seguinte)
- [ ] Gerar o PDF ("Baixar PDF") e conferir o mesmo no PDF final

### 2. Fonte Century Gothic (Task A)
- [ ] No preview, o texto está em Century Gothic (não Arial/Trebuchet)
- [ ] No PDF gerado, idem (é onde mais importa — o embed serve pra isso)

### 3. Foto do equipamento (Task C)
- [ ] Numa proposta com item que tenha foto de produto: a foto aparece à direita (~35% da largura), texto do descritivo envolvendo à esquerda, e continuando full-width abaixo quando a imagem acaba
- [ ] Legenda "IMAGEM ILUSTRATIVA" sob a foto; imagem sem distorção
- [ ] Item sem foto: renderiza normal, sem espaço vazio flutuante

### 4. Corpo da cláusula nova (Task D)
- [ ] Clicar "+ cláusula": aparece o corpo como área clicável com placeholder "Clique para escrever o conteúdo da cláusula..."
- [ ] Clicar no corpo e digitar: o placeholder some, o texto entra
- [ ] Criar uma cláusula e NÃO preencher nada → salvar → recarregar: a cláusula vazia não persiste (remoção implícita)

### 5. Renumeração das cláusulas (Task E)
- [ ] Adicionar uma cláusula no meio da lista → as de baixo renumeram (5.x incrementa) e o SUMÁRIO reflete
- [ ] Mover uma cláusula ↑/↓ → renumera coerente
- [ ] Remover uma cláusula do meio → as seguintes renumeram

### 6. Fluxo de edição inline geral (regressão)
- [ ] Editar texto de uma cláusula, salvar, recarregar → persiste
- [ ] Editar o título de uma cláusula → persiste
- [ ] Editar campos de contato da capa (nome/email/telefone) → persiste
- [ ] "Resetar cláusulas" volta ao padrão
- [ ] Console do navegador sem erros durante todo o fluxo
- [ ] Caso especial (Task B interação): criar uma cláusula grande o suficiente para dividir em 2+ páginas, editar o texto no fragmento da 2ª página, salvar, recarregar → o conteúdo NÃO é truncado (deve manter todos os parágrafos)

## Depois do teste

- Se tudo passar: o assistente pode executar a **Task 7 do plano** — remover `client/src/components/proposta/EditorClausulas.js` e `.css` (código morto, já não importado). Está explicitamente gated nesta validação.
- Se algo falhar: reportar o sintoma exato + print + erro do console para debugging (skill `systematic-debugging`).
