# Etapa 260 — Fornecedores na busca de materiais, projeto na requisição e Fila de separação agrupada

> **Status:** EM EXECUÇÃO (23/11/2026). Itens 1, 2 e 3 da estimativa da semana
> (`docs/estimativas/2026-11/estimativa_2026-11-23_almoxarifado-semana.*`, `d7e6afb9`): 1h15 + 1h15 + 1h30.
> Features: Compras/cadastro (`specs/modulo-almoxarifado/01-cadastros-materiais`, pedido de 12/11 img5), requisições
> (`specs/modulo-almoxarifado/04-requisicoes`), separação (`specs/modulo-almoxarifado/05-separacao-picking`, item "Agrupamento" `[ ]`).
> Nada de motor, trava ou saldo: Fase 2 e Fase 5 enxutas.

## Medido antes (Fase 0)

- **Item 1.** `GET /api/almoxarifado/materiais` e `GET /api/compras/materiais/cadastro` são o mesmo handler (`listarMateriais`,
  `routes/almoxarifado.js:430`). A busca casa `m.nome, m.codigo, m.descricao, m.fornecedor_principal` (`condicaoDeBusca`, três formas do
  termo). Os fornecedores do material (Etapa 212) moram em `itens_fornecedor.material_id` (linha do catálogo do fornecedor: `codigo`,
  `descricao` comercial) + `fornecedores` (`razao_social`, `nome_fantasia`); o nome mostrado é `COALESCE(NULLIF(TRIM(nome_fantasia),''),
  razao_social)` (`fornecedoresDoMaterial.SELECT_LINHA`). A lista (`TabelaMateriais.js:190`) mostra `m.fornecedor_principal` sob o nome — o
  texto antigo que o formulário escondeu na 212. `itens_fornecedor` existe no harness (`garantirSchema` no `initSchema`); `fornecedores`
  **não** (tabela core do `index.js`) → a consulta nova confere a tabela antes (PRAGMA), como a 255.
- **Item 2.** `requisicoes_almoxarifado.projeto_id` existe, o Zod aceita (`schemas.js`, inteiro positivo) e o serviço grava cru
  (`requisitionCreateService.js:301`) — sem conferir se existe. Nenhuma tela grava (`RequisicaoForm.js` só tem OS e centro de custo).
  `ordens_servico.projeto_id` existe (`index.js:19293`); as duas rotas aux de OS (`/api/almoxarifado/aux/ordens-servico`,
  `/api/requisicoes-material/aux/ordens-servico`) não o devolvem. `projetos` (`index.js:1392`): `id, cliente_id, nome, status
  ('ativo'|'inativo')`. Não há rota aux de projetos sem o portão do Comercial (`/api/projetos` exige leitor de clientes/projetos).
  **Atenção (medido):** a entrega leva `projeto_id` ao motor e a regra do dono (`ownerRules.resolverClienteDoVinculo`) olha o **projeto
  primeiro**, depois a OS; a cópia (`/requisicoes/:id/copiar`) repassa `projeto_id` ao mesmo serviço. Sem guarda, um projeto de outro
  cliente numa requisição de material de cliente com a OS certa faria a entrega recusar.
- **Item 3.** A fila (`FilaSeparacao.js`) separa acionáveis e "Aguardando", na ordem do servidor (acionável, urgência, data de necessidade,
  chegada). Os filtros da 255 moram em `client/src/utils/filtrosFilaSeparacao.js` (funções puras). Cada requisição da fila já traz `setor`,
  `projeto_id` e `projeto_nome` (RN-255.01: o da requisição, senão o da OS).

## Regras de negócio

### Item 1 — fornecedores na busca e na lista de materiais

- **RN-260.01 — a busca acha pelo fornecedor do material.** `search` nas duas rotas passa a casar também, em qualquer linha de
  fornecedor do material: o nome do fornecedor (razão social **ou** nome fantasia), o **código do fornecedor** e a **descrição comercial**
  dele. As colunas de antes continuam (nome, código, descrição, fornecedor principal antigo — B1610). Mesma régua de caixa da 159
  (`condicaoDeBusca`). *Cenário:* material *Chapa inox* com o fornecedor *Aços Brasil* (código *AB-778*): buscar `aços` acha; `ab-778`
  acha; `AB-77` acha (parcial); outro material sem esse fornecedor não aparece.
- **RN-260.02 — a lista mostra os fornecedores do material.** Cada material da resposta ganha `fornecedores: string[]` (os nomes, como a
  seção Fornecedores do material os mostra, sem repetição, em ordem alfabética; `[]` sem nenhum). A tabela de Materiais (Compras e
  Almoxarifado) mostra abaixo do nome *"Fornecedores: A, B, C"* (mais de três: *"Fornecedores: A, B, C +2"*), e **não** mais o texto antigo
  `fornecedor_principal`. Sem a tabela `fornecedores` (ambiente parcial): `fornecedores: []` e a busca só pelas colunas de antes.

### Item 2 — projeto na requisição

- **RN-260.03 — a lista de projetos para o formulário.** `GET /api/almoxarifado/aux/projetos` (o `auth` das aux) devolve
  `[{ id, nome, status, cliente_id, cliente_nome }]`; `GET /api/requisicoes-material/aux/projetos` (quem cria requisição fora do
  almoxarifado, só login — mesmo portão da aux de OS dessa rota) devolve `[{ id, nome, status }]` (sem cliente, como a aux de OS dela).
  Ativos primeiro, depois por nome; no máximo 500. Sem a tabela: `[]`.
- **RN-260.04 — a OS diz o projeto.** As duas aux de OS ganham `projeto_id` (`null` sem projeto, ou sem a coluna — PRAGMA).
- **RN-260.05 — o campo Projeto no formulário.** "Projeto" (lista, opcional, *"— sem projeto —"*). Escolher uma **OS cadastrada com
  projeto** preenche o projeto com o da OS e **trava** o campo (dica *"vem da OS escolhida"*); OS sem projeto, ou *Digitar outro número*,
  destrava e limpa o que tinha vindo da OS. Projeto da OS fora da lista aparece como *"Projeto #<id>"*. O resumo ganha a linha *Projeto*.
  O envio manda `projeto_id` (número) ou `null`.
- **RN-260.06 — o servidor confere o projeto.** Na criação (as duas rotas, rascunho incluído), com `projeto_id`: inexistente → 400
  `Projeto #<id> não encontrado` (sem a tabela também — como a OS, RN-172.03); com a OS cadastrada (`os_id`) que **tem** projeto e o
  projeto escolhido for outro → 400 `O projeto escolhido não é o da OS <numero_os>. Escolha o projeto da OS ou deixe o campo vazio.`
  (B1611). Sem `projeto_id`: nada muda (a fila continua tirando o projeto da OS, RN-255.01). **A cópia nunca falha pelo projeto**: leva-o só
  se ainda passa nessas duas conferências (mesma régua da OS na cópia, RN-172.06).

### Item 3 — Fila agrupada

- **RN-260.07 — a opção Agrupar.** Na barra da Fila, ao lado dos filtros: **Agrupar** com *Sem agrupar* (padrão), *Por setor*, *Por
  projeto*. Guardada no navegador (chave própria, try/catch; sem ela, *Sem agrupar*). **Limpar filtros não mexe nela** (não é filtro).
- **RN-260.08 — os blocos, na ordem de urgência.** Com agrupamento, dentro de cada grupo de sempre (acionáveis; "Aguardando") as
  requisições visíveis viram blocos por setor (aparado, a régua da 255) ou por projeto (`projeto_id`). **Ordem dos blocos = a da primeira
  requisição de cada um na ordem do servidor** (o bloco com a requisição mais urgente vem primeiro); dentro do bloco, a ordem do servidor.
  Título do bloco: *"Setor: Manutenção — 2 requisições"* / *"Projeto: Linha 2 — 1 requisição"* / *"Sem setor — …"* / *"Sem projeto — …"*;
  projeto sem nome *"Projeto #<id>"*; dois projetos de mesmo nome, *"Linha 2 (#7)"* (régua da 255). Os filtros continuam valendo antes do
  agrupamento. *Sem agrupar*: a tela é a de hoje, sem título de bloco.
- **RN-260.09 — a lista de coleta de todas na ordem da tela.** Com agrupamento, *Imprimir lista de coleta (todas)* imprime as visíveis
  imprimíveis na ordem dos blocos (B1612).

## Contratos

| Rota | Mudança | Recusas (literal) |
|---|---|---|
| `GET /api/almoxarifado/materiais`, `GET /api/compras/materiais/cadastro` | `search` casa fornecedor (nome, código, descrição comercial); cada linha ganha `fornecedores: string[]` | — |
| `GET /api/almoxarifado/aux/projetos` (nova, `auth`) | `[{id, nome, status, cliente_id, cliente_nome}]` | — (sem tabela: `[]`) |
| `GET /api/requisicoes-material/aux/projetos` (nova, login) | `[{id, nome, status}]` — registrada antes de `/:id` | — |
| `GET /api/almoxarifado/aux/ordens-servico`, `GET /api/requisicoes-material/aux/ordens-servico` | cada OS ganha `projeto_id` | — |
| `POST /api/almoxarifado/requisicoes`, `POST /api/requisicoes-material` | confere `projeto_id` | 400 `Projeto #<id> não encontrado`; 400 `O projeto escolhido não é o da OS <numero_os>. Escolha o projeto da OS ou deixe o campo vazio.` |
| `POST /api/almoxarifado/requisicoes/:id/copiar` | leva o projeto só se passa | nenhuma nova |
| `GET /api/almoxarifado/fila-separacao` | **não muda** (a tela agrupa) | — |

## Tasks (sort topológico)

- [ ] **T1 (tronco, servidor, item 1)** — RN-260.01/02 em `listarMateriais`. Teste novo `server/tests/api/materiaisBuscaFornecedores.api.test.js`:
  pela rota do Almoxarifado **e** pela do Compras; sem a tabela `fornecedores`, 200 com `[]`. Controle positivo por regra.
- [ ] **T2 (galho, tela, item 1)** — `TabelaMateriais.js` mostra `fornecedores` e não `fornecedor_principal`. Teste no `MateriaisCompras.test.js`
  (ou novo `TabelaMateriaisFornecedores.test.js`).
- [ ] **T3 (tronco, servidor, item 2)** — RN-260.03/04/06. Teste novo `server/tests/api/requisicaoProjeto.api.test.js`: aux de projetos pelas
  duas rotas; aux de OS com `projeto_id`; criação com projeto (grava), inexistente (400), divergente da OS (400), igual ao da OS (201), OS sem
  projeto + qualquer projeto (201); cópia com projeto apagado (201, sem projeto); **integração**: requisição criada pela rota com projeto e
  sem OS aparece na fila (`/fila-separacao`) com `projeto_nome` — e a entrega de material de cliente com o projeto do dono passa (a regra do
  dono vê o projeto gravado). Controle positivo por regra.
- [ ] **T4 (galho, tela, item 2)** — `RequisicaoForm.js`: RN-260.05. Teste novo `RequisicaoFormProjeto.test.js`.
- [ ] **T5 (galho, tela, item 3)** — `filtrosFilaSeparacao.js` (`agruparFila`, ler/guardar a opção) + `FilaSeparacao.js`: RN-260.07..09.
  Teste novo `FilaSeparacaoAgrupada.test.js`.
- [ ] **T6** — Fase 5 (revisor fresco), suítes, fechamento (fechar-etapa sem 7½ e 8) e estimado × realizado.

## Pontos de atenção

- `fornecedores` e `projetos`/`ordens_servico` são tabelas core: conferir por PRAGMA, nunca por mensagem de erro.
- A lista de materiais alimenta 18 chamadas do cliente: o campo novo é aditivo; a busca nova só roda com `search`.
- A guarda do projeto × OS só olha OS **cadastrada** (`os_id`); OS só em texto não tem projeto para comparar.
