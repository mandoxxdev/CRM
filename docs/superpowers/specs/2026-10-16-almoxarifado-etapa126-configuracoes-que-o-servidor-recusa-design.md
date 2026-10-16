# Almoxarifado — Etapa 126: as Configurações que o servidor recusa, e o Editar da família que leu (design)

> Origem: "Próxima tarefa detalhada — Etapa 126" do plano da 125 (**C261** — as outras abas de Configurações para o administrador do
> sistema sem perfil; **D (125)** — o *Editar* da aba Famílias com os campos lidos). Worktree `CRM-wt-e126`, branch `etapa-e126` (a
> partir da main `187e694b`). Numeração conferida com `grep -oE` em `docs/almoxarifado-novidades-por-etapa.md` (2026-10-16): última B
> **B810**, último C **C262**, última A **A75** → esta etapa **B811+**, **C263+**, **A76+**.

## Fase 0 — medido

**Sonda `server/tests/sonda/e126fase0.js` (não versionada, rodada uma vez, sozinha)** — o administrador do sistema (`role: 'admin'`,
sem perfil, sem administrador do módulo) contra cada rota que as abas chamam, e o perfil Administrador como controle:

| Aba | Leitura | Gravação (administrador do sistema) | Perfil Administrador |
|---|---|---|---|
| Tipos de material | `GET /tipos-material` **200** | `POST /tipos-material` **403** | 201 |
| Famílias (125) | `GET /familias?ativo=all` **200** | (já somente leitura — B808) | — |
| Estoques mínimos | `GET /materiais` **200** | `PUT /configuracoes/estoques-minimos` **403** | 200 |
| Setores e Áreas — bloco Almoxarifados | `GET /almoxarifados?todos=1` **200** | `POST /almoxarifados` **201** (passa) | 409 (código repetido — passou da autorização) |
| Setores e Áreas — setores | `GET /setores?all=1` **200** | `POST /setores` **403** | 201 |
| Localizações | `GET /localizacoes` **200**, `GET /localizacoes/proximo-codigo` **200** | `POST /localizacoes` **403** | 201 |
| Alertas de estoque | `GET /configuracoes/alertas-estoque` **403** | `PUT` **403**, `POST /alertas-estoque/testar` **403** | 200 / 200 / 200 |
| Liberação por valor | `GET /configuracoes/liberacao-valor` **200** | `PUT` **403** | 200 |
| Regras de aprovação | `GET /regras-aprovacao` **403** | `POST` **403** | 200 / 400 (validação — passou) |
| Configurações gerais | `GET /configuracoes` **403** | `PUT` **403** | 200 / 400 (validação — passou) |
| Categorias | 200 | `POST` **201** (passa) | — |
| Motivos, Materiais por setor | 200 | (passam — `requirePermission('configurar')` / `isSystemAdmin`) | — |
| Mapa de Áreas (fora de Configurações) | `GET /mapa/localizacoes` **200** | `PUT /mapa/localizacoes/posicoes` **403** | 200 |

Toda recusa é a literal *"Acesso restrito — administrador do Almoxarifado ou Super Administrador"*. **Bate com a medida da 125**
(agente de leitura, C261) — inclusive o bloco Almoxarifados dentro de Setores funcionando para ele. *Perfis de acesso* deu 500 na
sonda (o harness não tem a tabela `usuarios`, que é do núcleo) — não é medida da autorização; a 125 a mediu por leitura
(`requirePermission('configurar')`, passa).

**Cliente (lido):** a tela inteira abre pelo `canConfigureAlmox` do cliente (aceita `isSystemAdmin`). Cada aba oferece os gestos de
gravação sem conferir quem é: *Novo Tipo de Material* + editar/excluir por cartão (os dois ícones **sem** `title`); a tabela de
Estoques mínimos editável + *Salvar Alterações*; *Novo Setor ou Área* + *Editar*/*Inativar*; *Nova Localização* + *Editar*/*Mover*/
*Excluir* (e *Etiqueta*, *Imprimir etiquetas* e o link do *Mapa*, que só leem); a Liberação por valor com a chave, o limite, as caixas
dos aprovadores e *Salvar Configurações*. As três que falham ao abrir mostram o toast *"Erro ao carregar …"* e a aba vazia (Alertas com
os valores padrão do formulário — um SMTP em branco que parece o configurado). O Mapa de Áreas decide *Editar Posições* e
*Cadastrar localizações* por `canConfigureAlmox`.

**O *Editar* da aba Famílias (D (125)):** manda `{nome, descricao, tipo_uso}` do formulário, preenchido da lista. Outro Administrador
que mudou a descrição (ou o tipo de uso, ou o nome) depois de a lista carregar tem a mudança desfeita calada pelo *Salvar* — o
"último que salva vence", declarado na 125 (M5).

## Decisões

- **D1 — estreitar a tela, não alargar o servidor (B811).** O caminho reversível: o cliente esconde o que o servidor recusa; quem
  decide continua sendo o servidor. **Descartado:** alargar o `canConfigureAlmox` do servidor para o administrador do sistema (é a
  **B808**, do P.O. — e, decidida a favor, desfaz esta etapa numa linha: `podeGravarConfigAlmox` passa a aceitar `isSystemAdmin`).
  **Descartado:** esconder as abas da barra — a aba some sem dizer de quem é o gesto, e Tipos/Setores/Localizações são leitura útil.
- **D2 — duas frases, uma forma (B812).** Leem e não gravam: *"Somente leitura — ⟨o quê⟩ é do Administrador do almoxarifado ou do
  Super Administrador; peça a um deles."* (a da aba Famílias, B808, passa a sair da mesma função, com a mesma literal). Nem leem:
  *"Restrito — ⟨o quê⟩ é do Administrador do almoxarifado ou do Super Administrador; peça a um deles."* — no lugar da aba, **sem**
  chamar o `GET` que recusaria (nada de toast de erro, nada de formulário com valores padrão).
- **D3 — as três que não leem não chamam a rota (B812).** O componente da aba nem monta; a decisão é do componente pai, pelo mesmo
  usuário efetivo. **Descartado:** chamar e trocar o erro pela frase — dispara um 403 por abertura de aba e depende do texto da recusa.
- **D4 — os campos ficam visíveis e desabilitados (Estoques mínimos e Liberação por valor), não viram texto (B813).** A tabela e o
  cartão continuam iguais; o que muda é `disabled` e o botão de salvar escondido. A busca (filtro de materiais, busca de usuário)
  continua: só lê.
- **D5 — o Mapa de Áreas segue a mesma régua (B814).** *Editar Posições* e *Cadastrar localizações* só para `podeGravarConfigAlmox`;
  o link *Localizações* fica e passa a abrir a aba Localizações (`?tab=localizacoes` — abria Tipos; Fase 2, M4). Sem frase no mapa: é tela de consulta, e o gesto some sem deixar buraco.
- **D6 — o *Editar* da família manda `campos_lidos` (B815).** A mesma chave e a mesma régua do material (125): o servidor compara o
  lido com o gravado e o que gravaria com o gravado; os dois diferentes → **409** nomeando os campos, nada gravado. As colunas lidas
  vão no `WHERE` do `UPDATE` (a janela entre a leitura e o comando — o molde da 125, Fase 5 r2) → o 409 geral que já existe (*"A
  família mudou enquanto era salva — …"*). Nome da chave igual ao do material (descartado `familia_lida` — é a chave da família **do
  material**, 124, e confundiria).
- **D7 — no 409 do *Editar* a tela fica e a lista recarrega (B816).** O texto digitado fica à vista (para ler ou copiar); a lista já
  mostra o que o outro gravou; o próximo *Editar* lê de novo **e recarrega o formulário** (o digitado se perde ali — Fase 2, I2). Os lidos
  **não** se atualizam no recarregar: salvar de novo sem *Editar* recebe o 409 de novo, de propósito. **Descartado:** fechar o formulário (perde o digitado) e não recarregar (o usuário teria de
  sair da aba para ver o que mudou).
