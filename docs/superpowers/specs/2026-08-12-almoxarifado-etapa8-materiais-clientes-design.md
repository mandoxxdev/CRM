# Almoxarifado — Etapa 8: Materiais de Clientes (design)

> **Data:** 2026-08-12 · **Status:** aprovado (decisões tomadas pelo usuário nesta sessão, uma a
> uma) · **Feature:** `specs/modulo-almoxarifado/13-materiais-clientes`
> **Divisão:** a Etapa 8 do plano mestre cobria as features 13 **e** 14. Foi **dividida** nesta
> sessão: **Etapa 8 = clientes** (este documento), **Etapa 8b = terceiros** (feature 14, plano e
> design próprios). Mesmo precedente da Etapa 6, dividida em 6/6b/6c.

## O problema

A feature 13 é descrita nas specs como "fundamental para industrialização GMP" e existe hoje como
uma **ilha**:

- `materiais_cliente_almoxarifado` é tabela separada, com `descricao` em **texto livre** — não tem
  sequer FK para `materiais_almoxarifado`.
- Não passa pelo motor de estoque. Logo, material de cliente **não tem** lote, série, endereço,
  extrato, etiqueta, livro de movimentações, requisição nem reserva — exatamente o conjunto que
  as Etapas 1 a 7 construíram, e exatamente o que industrializar material de terceiro exige
  (certificado, corrida, rastro de quem aplicou onde).
- `clientMaterialService.consumirMaterialCliente` **não valida cliente nem projeto**. O primeiro
  item do checklist da spec 13 — "consumo só no projeto/cliente proprietário, enforcement" — não
  existe em nenhuma forma.
- Não há tela.

A tabela está **vazia** (0 linhas no banco de desenvolvimento) e nunca houve interface para
alimentá-la, então a ilha pode ser aposentada sem migração de dados.

## Decisões

1. **A Etapa 8 foi dividida.** Clientes (feature 13) e terceiros (feature 14) são subsistemas
   independentes; terceiros é construção do zero (remessa com máquina de estados, documento,
   retorno parcial, transformação chapa→peças). Cada um fecha com testes passando por conta
   própria. **Terceiros vira Etapa 8b.**

2. **Material de cliente vira material normal com dono.** Coluna `proprietario_cliente_id` em
   `materiais_almoxarifado`. É a decisão de arquitetura que a própria spec 13 marcava como
   "decisão da Etapa 8". Manter a ilha e melhorá-la foi descartado: dar lote, série, endereço e
   extrato à ilha seria reconstruir o motor inteiro. "Ilha agora, unificar depois" foi descartado
   porque a tela feita sobre a ilha seria jogada fora na unificação — paga-se duas vezes.

3. **O dono mora na linha do MATERIAL, não na linha de saldo.** "Chapa 3mm do Cliente X" é um
   material distinto de "Chapa 3mm nossa". Razão técnica: o disponível deriva de
   `materiais_almoxarifado.quantidade_atual`, um escalar **por material**
   (`stockService.getSaldoDisponivel`) — repartir propriedade no saldo faria esse escalar misturar
   donos, e toda guarda de "saldo insuficiente" viraria cirurgia no núcleo do motor, com risco em
   todo fluxo já entregue. Razão semântica, igualmente forte: a chapa do Cliente X tem certificado
   e corrida próprios e **não pode ser trocada** pela do Cliente Y — duas linhas de catálogo é o
   modelo correto, não um efeito colateral. Custo aceito: o catálogo ganha uma linha por cliente
   do mesmo item físico.

4. **A ilha é aposentada, a tabela fica.** As rotas `GET/POST /materiais-cliente` e
   `POST /materiais-cliente/:id/consumir` e o `clientMaterialService.js` são removidos — não há
   consumidor, e deixá-los vivos criaria um caminho paralelo que **escapa** de todas as guardas
   desta etapa. A **tabela permanece**, marcada como aposentada no `schema.js`: a medição de 0
   linhas cobriu só o banco de desenvolvimento, e apagar tabela com base em medição que não cobre
   produção não tem volta. Uma task confirma produção antes de a etapa fechar.

5. **Saída de material de cliente exige OS/projeto DAQUELE cliente — o motor recusa o resto.**
   `projetos` e `ordens_servico` têm `cliente_id`, então a checagem é real. É o teste que a spec
   13 lista primeiro. "Exige vínculo sem checar o dono" foi descartado por deixar passar o erro
   mais caro (aplicar chapa do Cliente A no equipamento do Cliente B); "só a tela avisa" foi
   descartado porque quem decide neste módulo é o backend, regra já fixada no `CLAUDE.md`.

6. **A saída emergencial NÃO fura a guarda do dono.** Única exceção ao padrão do módulo, de
   propósito: o emergencial existe para urgência no *nosso* estoque; consumir material de outra
   empresa sem dizer onde é problema contratual, não de pressa.

7. **Ajuste ganha ação própria `ajustar_material_cliente`**, mais estreita que `ajustar_estoque`
   (que já é ADMINISTRADOR/GESTOR), com justificativa obrigatória e auditoria nomeando o cliente
   proprietário. Fluxo de aprovação assíncrono (solicita → pendente → alguém aprova → efetiva) foi
   **descartado**: é máquina de estados nova com tela de pendências e notificação, do tamanho de
   uma etapa inteira, e empurraria a 8 para ser dividida de novo.

8. **Entrada exige cliente e documento, mas NÃO projeto — a spec 13 está errada nesse item.**
   O checklist diz "entrada exige cliente + projeto + documento". O cliente vem da linha do
   material e o documento é a nota do recebimento, mas **prender o projeto na entrada está
   errado**: um cliente manda a mesma chapa para dois projetos, e exigir projeto na entrada
   obrigaria a criar dois materiais idênticos para o mesmo item físico do mesmo dono. O projeto é
   exigido na **saída**, que é onde a aplicação importa e onde a guarda do dono já atua.
   **Corrigir a spec 13 e dizer que estava errada** — não apagar o item em silêncio.

9. **Devolução ao cliente é um tipo de movimento novo, não a tela da Etapa 7.** Na Etapa 7 o
   material **volta** para o estoque; aqui ele **sai** do prédio de volta para quem é dele. Novo
   tipo `DEVOLUCAO_CLIENTE` (saída, pelo motor — então lote, série e endereço funcionam), exigindo
   material com dono e número do documento de devolução, e **isento da regra de OS/projeto**
   porque o destino é o próprio proprietário.

10. **Os dois PDFs são gerados no navegador**, seguindo `utils/etiquetasPdf.js` da Etapa 6c —
    **zero mudança de servidor**. `jspdf` já é dependência e o padrão está validado.

11. **Escopo da Etapa 8**, confirmado item a item com o usuário: unificação com dono ·
    enforcement na saída · entrada por recebimento · tela de posição por cliente + selo nas
    listagens · devolução ao cliente · PDF de posição por cliente · ajuste com permissão dedicada.
    **Fora, declarado na spec 13:** e-mails específicos (feature 19), sobras vinculadas ao
    proprietário (feature 15), relatórios de não conformes/perdas por cliente (feature 21),
    aprovação assíncrona de ajuste (feature 06).

## Arquitetura

### A coluna e a invariante

`safeAlter`: `ALTER TABLE materiais_almoxarifado ADD COLUMN proprietario_cliente_id INTEGER`.

**`proprietario_cliente_id IS NULL` = material nosso.** Todo o risco desta etapa está aqui: **19
queries** leem `materiais_almoxarifado` hoje (`services/almoxarifado/*.js` +
`routes/almoxarifado/*.js`), e uma esquecida faz a chapa do cliente contar como sua — em reposição
de mínimo, sugestão de compra, relatório de posição, dashboard e seletor de requisição. **É uma
falha silenciosa:** nada quebra, o número só fica errado. Nenhum teste existente pegaria.

Por isso a segregação **não** vai ser "lembrar de filtrar em cada query". Vai ser:

1. **Auditoria nomeada das 19**, uma a uma, cada uma classificada em:
   - *leitura de estoque próprio* → filtra `proprietario_cliente_id IS NULL`;
   - *leitura de um material específico por id* → **não** filtra (quem pediu aquele material quer
     aquele material, seja de quem for).
   A classificação de cada uma fica escrita no plano — não como comentário solto no código.
2. **Helper de invariante** em `server/tests/helpers/clienteInvariante.js`, no molde do
   `serieInvariante.js` que a Etapa 6b já usa.
3. **Teste que percorre as rotas de leitura** com um material de cliente em estoque, provando que
   ele não aparece em nenhuma — é o `posicao de estoque proprio exclui material de cliente` que a
   spec 13 exige.

### O enforcement na saída

Guarda no motor: material com `proprietario_cliente_id` só sai com `os_id` ou `projeto_id` cujo
`cliente_id` seja o mesmo dono.

- Vale para os tipos de saída (`SAIDA`, `SAIDA_PRODUCAO`, `SAIDA_MONTAGEM`, `SAIDA_ASSISTENCIA`)
  e para `SUCATA`/`PERDA`.
- `emergencial` **não** bypassa (decisão 6) — diferente de `avaliarRegrasVinculo`, onde bypassa.
  Esta diferença tem de estar comentada no código, senão parece bug para quem ler depois.
- `DEVOLUCAO_CLIENTE` é isento (decisão 9).
- `TRANSFERENCIA` é isento: mover a chapa do cliente de prateleira não é aplicá-la.
- `AJUSTE` é isento da regra de OS/projeto, mas cai na permissão dedicada (decisão 7).

### Entrada

O material nasce no cadastro (`MaterialAlmoxarifadoForm.js`, nova seção **"Propriedade"** com
select de cliente) e entra pelo **Recebimento** normal — a nota de remessa é o campo de nota que
já existe. Guarda: recebimento de material com dono **exige** número de documento.

### Telas

- **`/almoxarifado/materiais-cliente` — "Materiais de Clientes"**: escolhe o cliente → posição
  consolidada (recebido, consumido, saldo, por OS/projeto), botão de PDF de posição, botão
  "Devolver ao cliente". Molde de `LotesAlmoxarifado` (escolher a entidade primeiro, depois
  listar), com o `useEffect` de flag `cancelado` contra resposta atrasada.
- **Selo de propriedade** em Materiais, Movimentações e Extrato — a spec 13 pede "identificação
  visual de propriedade em todas as listagens que misturam materiais", e sem ele a unificação
  cria justamente a confusão que ela quer evitar.

## Tratamento de erro

- Saída de material de cliente sem OS/projeto → 400 dizendo que material do cliente `<nome>` exige
  vínculo com OS ou projeto **daquele cliente**.
- Saída com OS/projeto de outro cliente → 400 **nomeando os dois clientes** (o dono e o do
  vínculo). Mensagem genérica aqui obriga o operador a adivinhar qual das duas pontas está errada.
- Emergencial tentando furar → 400 explicando que material de cliente não aceita saída
  emergencial, e por quê.
- Ajuste sem a permissão → 403 do `requirePermission('ajustar_material_cliente')`.
- `DEVOLUCAO_CLIENTE` sem documento → 400.
- Recebimento de material com dono sem documento → 400.

## Testes

| Teste | Prova |
|---|---|
| `consumir material do cliente A em projeto do cliente B falha` | decisão 5 |
| `saida emergencial nao fura a guarda do dono` | decisão 6 |
| `consumo acima do saldo falha` | regra da spec 13, agora pelo motor |
| `entrada de material de cliente sem documento falha` | decisão 8 |
| `posicao de estoque proprio exclui material de cliente` | **a invariante** (decisão 3) |
| `ajuste de material de cliente sem permissao falha` | decisão 7 |
| `devolucao ao cliente baixa o saldo e exige documento` | decisão 9 |
| `rotas da ilha nao existem mais` | decisão 4 — sem caminho paralelo sem guarda |
| `material de cliente aceita lote e serie como qualquer outro` | o ganho da unificação, medido |

Mais testes de client para a tela nova e para o selo de propriedade.

**Controle positivo obrigatório** no teste da invariante: o mesmo arquivo prova que a leitura
auditada **enxerga** um material próprio equivalente. Sem isso, um filtro escrito errado (que não
devolve nada) passaria como se estivesse segregando.

## Documentação a atualizar ao fim da etapa

1. `specs/modulo-almoxarifado/13-materiais-clientes/README.md` — checklist com hash; **corrigir o
   item da entrada, dizendo que a spec estava errada** (decisão 8); registrar o que ficou fora.
2. `specs/modulo-almoxarifado/14-materiais-terceiros/README.md` — marcar que virou **Etapa 8b**.
3. `specs/modulo-almoxarifado/README.md` — Etapa 8 dividida em 8/8b, linha das features 13/14.
4. `docs/almoxarifado-guia-etapas-e-testes.md` — cabeçalho e seção da Etapa 8 com "Antes → Agora",
   roteiro clicável e o que não cobre.
5. `docs/almoxarifado-novidades-por-etapa.md` — seção da Etapa 8 no molde das existentes, com as
   **regras de negócio explícitas e o cenário exato que demonstra cada uma** (o que digitar, o que
   o sistema recusa, a mensagem esperada) — este documento é apresentado na empresa.
6. `docs/superpowers/plans/2026-08-12-almoxarifado-etapa8-materiais-clientes.md` — tasks com hash
   e a próxima tarefa detalhada (**Etapa 8b — materiais em terceiros**).
