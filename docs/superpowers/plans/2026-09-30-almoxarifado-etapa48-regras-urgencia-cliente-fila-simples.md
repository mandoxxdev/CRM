# Etapa 48 — Regras por urgência e por material de cliente, e a fila da aprovação simples (plano)

> **Desenho:** `docs/superpowers/specs/2026-09-30-almoxarifado-etapa48-regras-urgencia-cliente-fila-simples-design.md`
> **Feature:** 06 (com efeito na 04)

## T1 — tronco: a urgência vira lista fechada (RN-01)

- `schema.js`: `TIPOS_URGENCIA`, exportada ao lado de `TIPOS_REQUISICAO`.
- `requisitionCreateService.createRequisicao`: normaliza vazio/ausente para `NORMAL` e recusa o que estiver fora da lista, com 400 `Urgência inválida: <valor>`. A recusa roda **antes** de qualquer escrita (a validação de material já é assim).
- **Cenários** (`requisicaoUrgencia.api.test.js`):
  - fora da lista: 400 com a literal, **pelas duas rotas**;
  - `''` e ausente: `NORMAL`;
  - os três valores válidos: 201;
  - **nenhuma requisição** gravada quando há recusa.
- **Controle positivo:** tirar a checagem derruba o 400. Aceitar em minúscula tem de derrubar também, porque a lista é exata.

## T2 — tronco: os dois critérios novos (RN-02/03)

- `schema.js`: `safeAlter` de `urgencia TEXT` e `material_cliente INTEGER` em `regras_aprovacao`.
- `approvalRulesService`:
  - `validarRegra` aceita os dois e conta os dois em "algum critério";
  - `regraCasa` compara os dois;
  - a query de itens do avaliador traz `MAX(CASE WHEN m.proprietario_cliente_id IS NOT NULL THEN 1 ELSE 0 END)` **por material**, no molde do `GROUP BY` da 47;
  - `formatarRegra` normaliza `material_cliente` como já faz com `material_critico`.
- **Cenários** (no `regrasAprovacao.api.test.js` ou num arquivo novo):
  - regra de urgência, a metade que casa e a que não casa;
  - regra de material de cliente, as duas metades;
  - urgência inválida no cadastro, com a literal;
  - `material_cliente: 0` sozinho recebe "sem critério".

## T3 — a aba de regras ganha os dois campos

`TabRegrasAprovacao.js`:
- `<select>` de urgência, com "Qualquer" e os três rótulos;
- checkbox "Algum item é material de cliente";
- `resumoCriterios` descreve os dois;
- `paraPayload` manda os dois.

**Cenário:** o payload do contrato com os dois campos, e a linha da lista descrevendo os dois.

## T4 — o painel da fila simples (RN-04)

Componente `FilaAprovacaoSimples`, no arquivo de `AprovacoesRegra.js`, montado só com `warehouseMode`:
- faz um `GET /almoxarifado/requisicoes` com `status=PENDENTE` próprio, porque a lista principal pode estar filtrada;
- filtra por `solicitante_id ≠ eu` e `pendencias_regra_abertas = 0`;
- só aparece com `pode('aprovar_requisicao')`;
- clicar abre a requisição.

**Cenários:**
- o recorte, com as três exclusões e a metade positiva;
- sem a permissão, o painel não aparece;
- fora do modo almoxarifado, nenhum GET;
- o clique abre a requisição certa.

## T5 — tronco: integração

Cria-se uma regra de urgência e uma de material de cliente. Envia-se uma requisição `URGENTE` com material de cliente, **pela segunda rota**, e as duas pendências nascem. Uma requisição com urgência inválida recebe 400 pelas duas rotas. Por fim, a fila de regras da 47 lista as duas pendências para quem assina.

## Fase 2 — o que o revisor tem de atacar

1. Existe **algum** outro escritor de `urgencia` além do formulário? Procurar em outros módulos, no `/copiar`, em importação, nos seeds e nos testes que gravam `urgencia` por SQL (o `/copiar` copia a urgência antiga? Se ela estiver fora da lista, o rascunho novo recebe 400?).
2. Fechar a lista quebra algum teste ou cliente existente que manda outro valor?
3. A fila simples: o recorte bate com o que o `/aprovar` aceita? E a requisição com `regras_avaliadas_em NULL`, que o `/aprovar` **reavalia** e pode barrar?
4. Cada RN até o último gesto: regra de urgência × auto-aprovação (a `CRITICO` nunca é auto-aprovada; e a `URGENTE` com regra?).

## Fase 2 — feita: 0 CRITICAL, 2 IMPORTANT, 5 MINOR, 5 refutadas (sonda `rev48-probe.js`)

**IMPORTANT-1 — a fila simples mostraria requisição que o `/aprovar` recusa.** Com
`regras_avaliadas_em NULL` (o avaliador falhou no envio), o recorte a inclui, e o `/aprovar` reavalia,
cria a pendência e responde 400. Escondê-la não resolve: ela também não está na fila de regras, e
ficaria órfã nas duas. **Correção (T4):** ela **fica** na fila com a marca
*"regras ainda não avaliadas — a aprovação vai conferir"*. A RN-04 passa a dizer que a promessa de
"não oferecer gesto recusado" só vale com o carimbo preenchido.

**IMPORTANT-2 — a trava do Crítico na auto-aprovação compara o valor exato.** Um rascunho antigo com
`'critico'` (minúsculo), enviado com a auto-aprovação ligada, voltou **APROVADO** (sonda). O defeito é
anterior à 48, e a 48 impede casos novos, mas não os antigos. **Correção (T1, reversível):**
`tentarAprovacaoAutomatica` compara `String(urgencia).toUpperCase()`. A consulta de medição em
produção vai para a **letra A**.

**MINOR:**
1. `urgencia` que não é texto (ex.: `5`) é recusada pelo **Zod**, antes do serviço, com a mensagem dele. A literal `Urgência inválida` vale para texto fora da lista (declarado no contrato).
2. O cenário pela `/requisicoes-material` precisa mandar **setor**.
3. `regraCasa` usa `(req.urgencia || 'NORMAL')`.
4. No painel: comparar `Number(solicitante_id) !== Number(user.id)`, receber `user` por prop e recarregar com `recarregarEm={requisicoes}`.
5. O desenho dizia que "só o formulário escreve urgência", **impreciso**: o `/copiar` também escreve, com `NORMAL` padrão, porque não copia a urgência.

**Acrescentado ao T5:** a auto-aprovação ligada com uma requisição `URGENTE` que casa regra fica
`PENDENTE`, e a requisição não avaliada aparece na fila simples e é barrada no `/aprovar` com a literal.

## Estado

- [x] Fase 0: medida (seção 1 do desenho)
- [x] Fase 1: desenho e plano
- [x] Fase 2 (0 CRITICAL, 2 IMPORTANT, 5 MINOR) · [x] T1 (`d8631bd`) · [x] T2 (`68563a5`) · [x] T3 + T4 (`29809af`) · [x] T5 (`410fece`) · [x] Fase 5 (fix-round `731a13a`) · [x] Fase 6 (verificação final medida: `test:api` 224/224 · `test:almoxarifado` 42/42 · validation 4/4 · safealter 3/3 · sqlite 5/5 · client 872/872 em 53 suítes · build `CI=true` limpo)

## Execução — T1 a T5 (2026-09-30)

| Task | Commit | Cenários | Sabotagens |
|---|---|---|---|
| T1 — urgência fechada + trava do Crítico sem caixa | `d8631bd` | `requisicaoUrgencia` 5/5, pelas duas rotas | 4/4 vermelhas |
| T2 — critérios de urgência e de material de cliente | `68563a5` | `regrasUrgenciaCliente` 4/4, cada critério com as duas metades | 6/6 |
| T3 + T4 — a aba e a fila simples | `29809af` | `TabRegrasAprovacao` 8/8; `RequisicoesList` +4 (50/50) | 10/10 |
| T5 — integração | `410fece` | `integracaoRegrasUrgenciaCliente` 4/4 | 2/2 (critério de urgência ignorado; material de cliente zerado na query) |

**Divergências do plano:**
- **T2 não seguiu TDD.** O teste veio depois da implementação, e por isso as seis sabotagens são o que prova o teste.
- **T3 e T4 rodaram em série**, como o desenho escolheu.
- **A marca da requisição não avaliada (IMPORTANT-1 da Fase 2)** entrou na T4, com cenário, e a costura servidor-tela dela está no (4) da T5.

`test:api` **223/223** depois de T1 e T2; `test:almoxarifado` 42/42.

## Fase 5 — revisão adversarial: 2 lentes, 1 fix-round, nenhum ruído

Dois revisores frescos: **regras + autorização** na árvore principal, e **força dos testes** numa
**worktree isolada**. Essa foi a lição da Etapa 47, onde um revisor viu a sabotagem temporária do
outro; aqui o placar de ruído foi **zero**.

| Lente | Achados | O que era |
|---|---|---|
| Regras + autorização | **0 CRITICAL, 1 IMPORTANT, 3 MINOR** (sonda `f548rn-probe.js`) | **IMPORTANT-1:** a mesma causa do IMPORTANT-2 da Fase 2 voltou por outro caminho. A trava da auto-aprovação tinha sido corrigida, mas `regraCasa` comparava a urgência exata e o `/enviar` não validava. Um rascunho legado com `critico` minúsculo escapava da regra "Crítico" e era aprovado por quem não é aprovador dela (reproduzido: `/aprovar` 200 TOTALMENTE_RESERVADA). **MINOR-1:** um PUT sem um campo apagava o critério. **MINOR-2:** ordenação e contador compararam o valor exato. **MINOR-3:** a fila expõe o mesmo que o `GET /requisicoes` já expunha, aceito sem mudança |
| Força dos testes | **2 IMPORTANT, 4 MINOR** (lacunas provadas por sabotagem que deixava tudo verde) | **A:** editar o nome apagava os critérios novos **no servidor**. **E/F:** a tela descartava os critérios novos ao desativar e ao editar; o código estava certo e nenhum teste o protegia. **D:** a trava do Crítico na **criação direta** não tinha teste. **B:** o padrão NORMAL do avaliador. **C:** `'urgente'` no cadastro. **H:** a recarga da fila |

**As correções (fix-round `731a13a`):**
- `/enviar` normaliza a caixa da urgência do rascunho, recusa o que continuar fora da lista com `Urgência inválida: <valor>` e grava o valor normalizado;
- `regraCasa` compara sem caixa;
- o PUT da regra mescla: campo **ausente** mantém, `null` explícito limpa;
- a ordenação e o contador do dashboard usam `UPPER`.

**Cenários novos:**
- `requisicaoUrgencia` 5 → **8**: (3b) a criação direta com CRITICO; (4) rascunho legado fora da lista; (5) rascunho legado `critico` sendo pego pela regra;
- `regrasUrgenciaCliente` 4 → **7**: (5) PUT parcial, (6) PUT só com o nome **relido do banco**, (7) urgência nula;
- `TabRegrasAprovacao` 8 → **9** (E/F);
- `RequisicoesList` 50 → **51** (H).

**Controle positivo do fix-round:** 4 + 5 sabotagens.
- **Y1** (`regraCasa` com a caixa exata) ficou **VERDE**, e está certo: o `/enviar` agora normaliza antes de avaliar, então o defeito ficou **inalcançável** pelas rotas de hoje. A forma segura fica, e **está declarado que a suíte não a protege** (G78 nas novidades). O mesmo vale para o MINOR-B: o envio já grava NORMAL.
- **Y2** (envio sem validar) → (4); **Y3** (envio sem normalizar) → (5); **Y4** (PUT sem mescla) → (5);
- **E**, **F**, **H**, **A** e **D** vermelhos, cada um no cenário que o fecha.

## Retro de 4 números — Etapa 48

1. **Rodadas de correção até verde: 1**, com uma revisão de plano antes (0 CRITICAL, 2 IMPORTANT). Os
   dois IMPORTANT do plano entraram na execução. Um deles — urgência comparada como palavra exata —
   **foi corrigido pela metade**: só na auto-aprovação. A Fase 5 o achou de novo na regra e no envio.
   **Lição:** quando a Fase 2 nomeia uma **causa** ("comparação exata de um enum que não é
   fechado no passado"), o conserto tem de varrer **todos os leitores** dela, não o sintoma que o
   revisor reproduziu.
2. **Achados da revisão do código: 3 IMPORTANT reais e 7 MINOR, nenhum ruído.** Das lacunas de
   teste, **nenhuma escondia defeito** (as de edição na tela e no servidor tinham o código certo).
3. **Paralelismo: 0 galhos em paralelo.** T3 e T4 eram independentes pela regra, mas rodaram em série
   por custo, como o desenho escolheu (B200). Sem retrabalho. O paralelismo foi de **revisão** (2
   lentes, uma em worktree) e de **documentação** (fork).
4. **Defeito que escapou:** *preencher na Etapa 49.* Da 47 para a 48 escaparam **dois textos**, não
   código. A **G77** das novidades dizia que a marcação da migração "não tem teste" e que marcava
   "todas as requisições", e as duas coisas tinham deixado de ser verdade no fix-round da própria 47.
   A spec 06 dizia `role = 'admin'` e "quantidade em algum item". Os três foram corrigidos à vista
   neste fechamento. **O fork de documentação da 47 escreveu antes do fix-round, e o pai reconciliou
   só parte do que mudou.**

## Próxima tarefa detalhada — Etapa 49: a feature 21 (Relatórios) fecha o que não depende da 22

**Escolha, pela ordem do CLAUDE.md:**
- **A 06 não pode ir a 🟢 agora.** Os dois itens restantes dependem da decisão **B11** (dupla aprovação de ajuste) e da feature **22** (BOM, que "não existe em lugar nenhum do sistema", spec 22).
- **No mapa, a 21 é a 🟡 mais perto do verde** ("🟡→quase-🟢" no status dela), e fechá-la não depende de ninguém, a não ser no item previsto × realizado.
- As outras 🟡 têm falta maior e mais cara:
  - **02:** código de endereço, enforcement de capacidade, sugestão de localização, confirmação por leitura;
  - **05:** lista de separação como entidade e rota de picking;
  - **08:** valores e validação do campo fiscal;
  - **23:** perna de auditoria.

**O que já medi hoje, e que a Fase 0 da 49 tem de CRUZAR antes de desenhar:**
- `reportRegistry.js` tem **19** chaves, e a spec 21 diz "são 18". A `custo-por-projeto` (linha 416 do registro) entrou depois, e a spec não foi reaberta. **Achado de spec.**
- O checklist "Relatórios de estoque" e "Relatórios de movimentação" tem **oito `[ ]`**, vários com "verificar cobertura atual", e o registro **já tem** chaves que parecem cobrir parte deles:
  - `estoque-atual` tem as colunas `disponivel` e `valor_total` → "Estoque disponível";
  - `materiais-bloqueados` → parte de "reservado/bloqueado";
  - `materiais-cliente` (título "Posição por cliente") → "Saldo por cliente";
  - `historico-movimentacoes` → "Histórico completo do item";
  - `consumo-periodo` e `consumo-os` → parte de "por período" e "por projeto".

  **A Fase 0 marca `[x]` o que estiver coberto, com a chave e o hash**, e só o que sobrar vira escopo. É a mesma armadilha da Etapa 24: medir pelo nome do **contrato** (a chave do registro), não pelo nome que se imagina.
- **Candidatos a escopo, se a medição confirmar que faltam:**
  - saldo por **lote/série**: as tabelas de lote e série existem desde a Etapa 6/6b;
  - saldo **em quarentena / em terceiros**: `quantidade_em_inspecao` e as remessas da feature 14;
  - saldo por **localização/almoxarifado**: saldo global por material é **intencional** (o CLAUDE.md diz que almoxarifado é área física, não filial). O relatório seria de **onde está fisicamente** (o endereço), **nunca** de saldo segregado por almoxarifado. Não propor segregação;
  - movimentação por **usuário** e por **centro de custo**.

**Contrato que ela consome:**
- `reportRegistry` (cada chave com `titulo`, `categoria`, `gate`, `params`, `colunas`, `limite` e `nota`, e a validação de subida que derruba o processo se dispatcher e registro divergirem);
- a tela `/almoxarifado/relatorios`, dirigida pela lista do servidor;
- a exportação XLSX genérica.

**Relatório novo = chave nova no registro**, sem tela nova.

**Pontos de atenção:**
- o **gate por chave**: relatório de saldo de cliente segue a régua de `materiais-cliente`;
- a **valorização por cliente** continua fora (letra B);
- o **PDF** foi cortado de propósito na Etapa 13 (letra D) e não reabre sem decisão;
- previsto × realizado depende da 22 e fica fora.
