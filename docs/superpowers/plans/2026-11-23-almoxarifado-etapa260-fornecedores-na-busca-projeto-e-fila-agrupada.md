# Etapa 260 — Fornecedores na busca de materiais, projeto na requisição e Fila de separação agrupada

> **Status:** FECHADA (23/11/2026). Itens 1, 2 e 3 da estimativa da semana
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
  O envio manda `projeto_id` (número) só quando escolhido (divergência abaixo). Fase 5: o escolhido à mão volta quando a OS destrava o campo.
- **RN-260.06 — o servidor confere o projeto.** Na criação (as duas rotas, rascunho incluído), com `projeto_id`: não inteiro positivo
  (a cópia não passa pelo Zod) → 400 `Projeto inválido`; inexistente → 400 `Projeto #<id> não encontrado` (sem a tabela também — como a
  OS, RN-172.03). **Projeto inativo passa** (como a OS fechada, RN-172.02 — B1611). Com a OS cadastrada (`os_id`):
  (a) a OS **tem** projeto e o escolhido é outro → 400 `O projeto escolhido não é o da OS <numero_os>. Escolha o projeto da OS ou deixe o
  campo vazio.`; (b) a OS **não tem** projeto e o cliente do projeto é outro que o da OS (projeto interno, sem cliente, com OS de cliente
  conta como outro; os dois sem cliente passam) → 400 `O projeto escolhido é de outro cliente que o da OS <numero_os>. Escolha um projeto
  do mesmo cliente ou deixe o campo vazio.` (Fase 2, C1/C2: sem (b) a aprovação não converteria a reserva da OS, a fila pularia o material
  de cliente, a entrega recusaria pela regra do dono — que olha o projeto antes da OS — e a saída de material próprio perderia a OS,
  `osIdDaSaida`). OS sem `numero_os`: `#<id>`. Sem `projeto_id`: nada muda (a fila continua tirando o projeto da OS, RN-255.01). **A cópia
  nunca falha pelo projeto**: leva-o só se ainda passa nessas conferências (mesma régua da OS na cópia, RN-172.06).

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
  imprimíveis na ordem em que aparecem: os blocos dos acionáveis, depois os blocos do "Aguardando" (B1612).

## Fase 2 (revisor fresco, 23/11) — absorvida

- **C1/C2 (críticos):** OS sem projeto + projeto de outro cliente passava → (b) da RN-260.06.
- **I1:** o texto antigo não convertido pela 212 sumiria da lista → mostrado, marcado, só sem fornecedor vinculado (B1610).
- **I2:** projeto "apagado" é `status='inativo'` → inativo passa (B1611); o teste da cópia usa a linha apagada direto no banco e o inativo.
- **I3:** `Projeto inválido` (a cópia) e `#<id>` sem `numero_os`.
- **I4:** a cesta (`RequisicaoMaterialCesta.js`) não ganha o Projeto → D (260).
- **I5:** integração: entrega com projeto (regra do dono pelo projeto) e cópia com projeto + OS; a conversão da reserva da OS com projeto
  do mesmo cliente não ganha cenário próprio (a guarda (b) só deixa passar projeto do cliente da OS) → declarado.
- **M1:** medido: +23 ms na lista inteira e +30 ms na busca a 3 mil materiais e 6 mil vínculos — fica sempre ligado.
- **M2:** ordem da impressão agrupada → RN-260.09. **M3:** a aux de projetos fora do almoxarifado mostra nomes a qualquer logado → B1613.
- P3: galhos independentes; a T4 só começa com o contrato final da T3.

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

- [x] **T1 (tronco, servidor, item 1)** — `14af4e46` (9 cenários; 10 sabotagens vermelhas) — RN-260.01/02 em `listarMateriais`. Teste novo `server/tests/api/materiaisBuscaFornecedores.api.test.js`:
  pela rota do Almoxarifado **e** pela do Compras; sem a tabela `fornecedores`, 200 com `[]`. Controle positivo por regra.
- [x] **T2 (galho, tela, item 1)** — `14af4e46` (`TabelaMateriaisFornecedores.test.js` 4; 7 sabotagens; o texto antigo marcado sem vínculo, B1610) — `TabelaMateriais.js` mostra `fornecedores` e não `fornecedor_principal`. Teste no `MateriaisCompras.test.js`
  (ou novo `TabelaMateriaisFornecedores.test.js`).
- [x] **T3 (tronco, servidor, item 2)** — `5ca40351` (16 cenários; 14 sabotagens), Fase 5 `682fb1ae` (+3; +2), fixture `3f18085e` — RN-260.03/04/06. Teste novo `server/tests/api/requisicaoProjeto.api.test.js`: aux de projetos pelas
  duas rotas; aux de OS com `projeto_id`; criação com projeto (grava), inexistente (400), divergente da OS (400), igual ao da OS (201), OS sem
  projeto + qualquer projeto (201); cópia com projeto apagado (201, sem projeto); **integração**: requisição criada pela rota com projeto e
  sem OS aparece na fila (`/fila-separacao`) com `projeto_nome` — e a entrega de material de cliente com o projeto do dono passa (a regra do
  dono vê o projeto gravado). Controle positivo por regra.
- [x] **T4 (galho, tela, item 2)** — `af583d26` (7; 13 sabotagens), Fase 5 `682fb1ae` (+2 sabotagens) — `RequisicaoForm.js`: RN-260.05. Teste novo `RequisicaoFormProjeto.test.js`.
- [x] **T5 (galho, tela, item 3)** — `45b4fff3` (8; 14 sabotagens, 13 vermelhas — G7, ler a opção sem validar, é defesa dupla) — `filtrosFilaSeparacao.js` (`agruparFila`, ler/guardar a opção) + `FilaSeparacao.js`: RN-260.07..09.
  Teste novo `FilaSeparacaoAgrupada.test.js`.
- [x] **T6** — Fase 5 (revisor fresco), suítes, fechamento (fechar-etapa sem 7½ e 8) e estimado × realizado.

## Pontos de atenção

- `fornecedores` e `projetos`/`ordens_servico` são tabelas core: conferir por PRAGMA, nunca por mensagem de erro.
- A lista de materiais alimenta 18 chamadas do cliente: o campo novo é aditivo; a busca nova só roda com `search`.
- A guarda do projeto × OS só olha OS **cadastrada** (`os_id`); OS só em texto não tem projeto para comparar.

## Fase 5 (revisor fresco, 23/11) — 1 importante (corrigido), 3 menores

- **Importante, reproduzido e corrigido (`682fb1ae`):** o cadastro de OS não confere projeto × cliente. OS do cliente A apontando projeto
  interno: o formulário travava esse projeto, a regra (a) aceitava e a entrega do material de A recusava pela regra do dono (antes da 260 a
  mesma requisição saía pela OS: 201/200/200/200 contra 201/200/200/400). Agora o projeto da OS só conta quando é do mesmo cliente
  (`projetosAux.projetoDaOsSql`, a régua das aux e da criação); senão a OS vale como sem projeto (regra b).
- **Menor, corrigido (`682fb1ae`):** o projeto escolhido à mão se perdia quando uma OS com projeto travava e depois destravava o campo.
- **Menor, declarado (D (260)):** fora do almoxarifado as listas não mostram o cliente; a lista de materiais lê todos os fornecedores a cada
  carga (medido +23 ms, B1610).

## Divergências do plano

- RN-260.05: `projeto_id` vai só quando escolhido (o plano dizia "ou `null`" — mandar sempre mudaria o payload de quem não escolhe).
- RN-260.04/06: o "projeto da OS" passou a exigir o mesmo cliente da OS (Fase 5).
- `listasNotificacoesPortao` (RN-155.01) compara as chaves da aux de OS com o fixture das Reservas e caiu com o campo novo (esperado) — fixture
  atualizado (`3f18085e`). `recebimentoComOs [M1]` passou a semear por UPDATE a combinação que a rota agora recusa.
- T2, T4 e T5: o teste veio logo depois do código (controle positivo por sabotagem em todas as regras), fora da ordem TDD estrita; T1 e T3
  nasceram vermelhas.
- O primeiro `test:api` foi interrompido depois da Fase 5 (o código do servidor mudou) e rodado de novo sobre o código final.

## Retro (4 números)

- Rodadas de correção até verde: 2 (o fixture da aux de OS; o `[M1]` do recebimento com OS).
- Achados: Fase 2, 2 críticos + 5 importantes + 3 menores reais (absorvidos antes do código); Fase 5, 1 importante + 1 menor corrigidos, 2
  menores declarados, 0 ruído.
- Paralelismo: nenhum galho em paralelo (tudo na mesma árvore, em sequência); os revisores rodaram em paralelo com o trabalho.
- Defeito que escapou: (preencher na etapa seguinte). Da 259: nenhum apontado.

## Próxima tarefa detalhada

Os itens 4 e 5 da estimativa de 23/11 (`docs/estimativas/2026-11/estimativa_2026-11-23_almoxarifado-semana.md`), juntos numa etapa:

1. **Item 4 — o histórico diz de quais prateleiras a peça saiu (D (252) 1; 1h).** Desde as Etapas 256/257 o Ajuste e a Saída gravam as linhas
   baixadas em `ajuste_linhas_drenadas_almoxarifado` (`schema.js:1610`: `movimentacao_id, saldo_id, quantidade`; índice por
   `movimentacao_id`), mas só o estorno (`stockService.js` ~3744) e a exclusão (`requisitionService.js` ~3387) a leem. Contrato a propor:
   `GET /api/almoxarifado/movimentacoes` (`routes/almoxarifado.js:1389`) ganha, por movimento, `prateleiras: [{ codigo, quantidade }]`
   (aditivo; `saldo_id` → `estoque_saldo_almoxarifado.localizacao_id` → código; linha de saldo apagada: sem código), numa consulta à parte
   pelos ids da página (sem N+1). Tela: `MovimentacoesAlmoxarifado.js` mostra *"Saiu de: A 3 · B 3"* quando há mais de uma. Movimento antigo
   sem linha: como hoje. Só leitura — Fase 2/5 enxutas.
2. **Item 5 — o estorno do Ajuste de prateleira respeita a contagem mais recente (D (258) 5; 1h15, motor).** O estorno de um Ajuste **com**
   `localizacao_destino_id` não olha um Ajuste do total feito depois (5 em A, Ajuste de A para 3, Ajuste do total para 7, estorno do primeiro
   → 9; a contagem diz 7). Molde: a guarda B1606 do ramo sem localização (`stockService.cancelarMovimentacao` ~3869, mensagens ~3887/3891:
   *"… a contagem mais recente vale. Estorne primeiro o ajuste mais recente ou faça um novo ajuste."*) e o teste
   `estornoAjusteForaDeOrdem.api.test.js`. Pontos de atenção: a guarda vai **antes do claim**, dentro da seção da trava por material
   (CLAUDE.md, estorno); o inventário conta como contagem; um Ajuste de **outra** prateleira depois — decidir na letra B pelo caminho
   reversível (só o Ajuste do total e o da mesma prateleira travam). Motor: Fase 2 e Fase 5 completas.
- **O que já está pronto e não reabre:** a busca e a lista com fornecedores; o projeto na requisição (campo, aux, conferência com a OS,
  cópia); a Fila agrupada.

## Verificação (medida sobre o código final)

- `npm run test:api` (sozinho, `NODE_OPTIONS=--max-old-space-size=4096`, sobre o servidor de `682fb1ae` + `3f18085e`): **657/658 arquivos OK**
  (o mais lento: `propostaClausulasGrava`, 70,8 s); o único vermelho, `requisicaoComOsCadastrada` [RN-172.08, I4], fixava as chaves da aux de OS
  dos módulos — atualizado (`60f72369`, só o teste) e **27/27** rodado de novo. A primeira rodada (antes da Fase 5) foi interrompida em ~405
  arquivos com um vermelho, `listasNotificacoesPortao` (o fixture da OS, `3f18085e`, 10/10 depois).
- `npm run test:almoxarifado`: **44 passou, 0 falhou**. `test:validation` **4/0**, `test:safealter` **3/0**, `test:sqlite` **16/0**.
- Jest da tela (`--maxWorkers=2`, código final): **243/243 suítes, 3267/3267 testes** (a primeira rodada deu 3266/3267: o teste de chaves do
  fixture nas Reservas, atualizado em `efdfa465`).
- `CI=true npx react-scripts build`: **Compiled successfully.**
- Nenhum clique no navegador (F (260)).
