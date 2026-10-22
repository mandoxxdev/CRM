# Etapa 177 — O retorno da manutenção com a condição do item e o destino (volta ao uso ou baixa)

> **Status:** 🟢 entregue (2026-10-22) · **Branch:** `etapa-e177` (worktree `CRM-wt-e177`, a partir da `main` `895fd509`) · **Data:** 2026-10-22
> **Origem:** pedido da usuária de Compras/almoxarifado (item 3 da "próxima tarefa detalhada" da Etapa 173): *"Registro da condição do item
> após a manutenção, identificando se retornou ao responsável ou se deverá ser destinado ao descarte."*

## O que existe hoje (medido na Fase 0)

- `toolService.concluirManutencao` fecha a linha de manutenção (`data_fim`, `observacoes`) e devolve a ferramenta `EM_MANUTENCAO →
  DISPONIVEL`. **Não há condição nem destino.** `PUT /api/almoxarifado/manutencoes/:id/concluir`, corpo `{ observacoes? }`
  (`ManutencaoConcluirSchema`), gate `gerenciar_ferramentas` (ADMINISTRADOR, ALMOXARIFE).
- **Não existe baixa de ferramenta.** A coluna `ferramentas_almoxarifado.ativo` existe, mas nada a zera (nenhuma rota de exclusão ou
  inativação). Estados (`toolStateMachine.js`): `DISPONIVEL`, `EMPRESTADA`, `BLOQUEADA`, `EM_MANUTENCAO`, `AVARIADA`, `PERDIDA`.
- `AVARIADA` é "estragou, espera conserto" (entra em manutenção); `PERDIDA` é "sumiu" (sai por *reencontrar*). Nenhum dos dois é "descartada".
- O painel de calibrações (`painelCalibracoes`) lista toda ferramenta `exige_calibracao = 1 AND ativo = 1` — uma ferramenta descartada
  apareceria **vencida para sempre**.
- A tela (`FerramentasAlmoxarifado.js`) conclui a manutenção num modal só com *Observações*.

## Decisão de estado: `BAIXADA` (novo)

Um estado final novo, `BAIXADA`. **Por que não um existente:** `AVARIADA` reentra em manutenção e conta como "a consertar"; `PERDIDA` é
outra coisa (a ferramenta não está aqui) e sai por *reencontrar*; `ativo = 0` some da lista e do histórico — a usuária pediu
"rastreabilidade e histórico de cada item". Transições: `EM_MANUTENCAO → BAIXADA` (concluir com destino baixa) e `BAIXADA → DISPONIVEL`
(*reverter baixa*, com justificativa — **B1142**). Nenhuma outra.

## Regras de negócio

| RN | Enunciado | Cenário |
|---|---|---|
| RN-177.01 | Concluir manutenção aceita **condição** ∈ {`OK` *Em condições de uso*, `COM_RESTRICAO` *Em uso com restrição*, `INSERVIVEL` *Inservível*} e **destino** ∈ {`USO` *Volta ao uso*, `BAIXA` *Baixa (descarte)*}. Fora da lista → 400 com literal; nada muda. | `condicao: 'RUIM'` → 400 *"Condição inválida (use OK, COM_RESTRICAO ou INSERVIVEL)"*, manutenção continua aberta. |
| RN-177.02 | Destino `USO` (ou ausente — compatibilidade com quem já chama a rota) → a ferramenta volta a **DISPONIVEL**, como hoje. | Concluir com `{ condicao: 'OK', destino: 'USO' }` → DISPONIVEL, empresta. |
| RN-177.03 | **Inservível não volta ao uso**: `INSERVIVEL` + `USO` → 400 *"Ferramenta inservível não volta ao uso — escolha a baixa"*. | — |
| RN-177.04 | `COM_RESTRICAO` exige observações (a restrição): 400 *"Descreva a restrição nas observações"*. | — |
| RN-177.05 | Destino `BAIXA` exige observações (o motivo): 400 *"Informe o motivo da baixa nas observações"*. Com elas, a ferramenta vai a **BAIXADA**. | Concluir com `{ condicao: 'INSERVIVEL', destino: 'BAIXA', observacoes: 'Motor queimado' }` → BAIXADA. |
| RN-177.06 | A condição e o destino **ficam gravados na manutenção** (colunas novas `condicao_retorno`, `destino`) e vão na auditoria `MANUTENCAO_FIM`; a baixa grava também `BAIXA` na trilha. O `GET /ferramentas/:id/manutencoes` devolve os dois. | — |
| RN-177.07 | **BAIXADA não circula**: não empresta (*"Ferramenta não está disponível (status atual: BAIXADA)"*), não entra em manutenção, não registra ocorrência, não bloqueia — as recusas de sempre, com o status. | — |
| RN-177.08 | **Reverter baixa** (`POST /ferramentas/:id/reverter-baixa`, justificativa obrigatória) → DISPONIVEL, auditado `REVERSAO_BAIXA`. Fora de BAIXADA → 400 *"Ferramenta não está baixada (status atual: ⟨S⟩)"*; inexistente → 404 *"Ferramenta não encontrada"*. | Baixa por engano → reverter com *"baixa errada"* → DISPONIVEL. |
| RN-177.09 | O painel de calibrações **ignora BAIXADA** (nem vencida, nem a vencer). | Ferramenta que exige calibração, baixada → some do painel. |
| RN-177.10 | Tela: o modal *Concluir manutenção* pede **Condição** e **Destino** (obrigatórios na tela; recusa local *"Escolha a condição do item"*), mostra a frase do servidor em toast e fica aberto; o badge **Baixada**; o filtro de status com *Baixada*; o botão **Reverter baixa** só em BAIXADA; em BAIXADA não aparecem *Ocorrência* nem *Calibração*. | — |

## Contratos

`PUT /api/almoxarifado/manutencoes/:id/concluir` — corpo `{ observacoes?: string|null, condicao?: 'OK'|'COM_RESTRICAO'|'INSERVIVEL'|null,
destino?: 'USO'|'BAIXA' }`. Ordem das recusas (todas **antes** de fechar a manutenção — nada é gravado):
1. `400 "Condição inválida (use OK, COM_RESTRICAO ou INSERVIVEL)"`
2. `400 "Destino inválido (use USO ou BAIXA)"`
3. `400 "Ferramenta inservível não volta ao uso — escolha a baixa"`
4. `400 "Descreva a restrição nas observações"`
5. `400 "Informe o motivo da baixa nas observações"`
6. `404 "Manutenção não encontrada"` (inexistente ou já concluída — como hoje)
7. `400 "Estado da ferramenta mudou durante a conclusão da manutenção (status atual: ⟨S⟩)"` (anomalia — como hoje)

Resposta `200 { success: true, status: 'DISPONIVEL'|'BAIXADA' }`.

`POST /api/almoxarifado/ferramentas/:id/reverter-baixa` — `JustificativaSchema` (`{ justificativa }`, ao menos 5 caracteres; sem ela ou curta, `400 "Dados inválidos — justificativa: …"`),
gate `gerenciar_ferramentas`. `200 { success: true }`; `400 "Ferramenta não está baixada (status atual: ⟨S⟩)"`; `404 "Ferramenta não encontrada"`.

Schema: `safeAlter` aditivo `manutencoes_ferramenta_almoxarifado.condicao_retorno TEXT` e `.destino TEXT` (seção das ferramentas de
`schema.js`, longe do `recebCols` que a 176 mexe). `ManutencaoConcluirSchema` ganha os dois campos como string opcional; a lista fechada é
regra de negócio e mora no serviço (molde `TIPOS_OCORRENCIA`).

## Tasks

| Task | O que | Tipo |
|---|---|---|
| T1 | Servidor: estado `BAIXADA`, colunas, `concluirManutencao` com condição/destino, `reverterBaixa`, painel sem BAIXADA, rótulos de auditoria. Testes `toolManutencaoRetorno.api.test.js`. | tronco |
| T2 | Tela: modal com Condição/Destino, badge/filtro *Baixada*, *Reverter baixa*, botões escondidos em BAIXADA. Testes na suíte da tela. | galho (contrato congelado acima) |
| T3 | Integração pela rota: iniciar manutenção → concluir com baixa → emprestar recusa → reverter → emprestar aceita → manutenção → concluir com uso e condição OK. | integração |

## Decisões (letra B, faixa B1140–B1149)

- **B1140** — condição opcional no servidor (quem já chama a rota sem ela continua funcionando; grava `NULL`), obrigatória na tela.
  Descartado: obrigar no servidor (quebraria integrações e os testes da 9b sem ganho para quem usa a tela).
- **B1141** — "volta ao responsável" = volta ao uso (DISPONIVEL), e entregar a alguém é o **Emprestar** de sempre. Descartado: reabrir
  sozinho um empréstimo — a manutenção só começa com a ferramenta devolvida (RN-07 da 9b), não há "responsável" gravado para reabrir.
- **B1142** — a baixa é **reversível** (*Reverter baixa*, com justificativa e auditoria), pelo mesmo perfil. Descartado: baixa sem volta
  (um clique errado deixaria a ferramenta morta sem caminho na tela).
- **B1143** — quem dá baixa: o mesmo gate `gerenciar_ferramentas` (ADMINISTRADOR, ALMOXARIFE). Descartado: perfil novo só para a baixa.
- **B1144** — estado novo `BAIXADA` (justificativa acima). Descartado: `ativo = 0` (some do histórico), `AVARIADA` (outra semântica).
- **B1145** — baixa só sai da manutenção. AVARIADA → baixa direto exige passar por manutenção (iniciar e concluir com baixa). Descartado:
  botão de baixa em qualquer status (a usuária descreveu o fluxo "após a manutenção").

## Andamento

- [x] T1 — `17ce8759`: servidor (estado BAIXADA, colunas, conclusão com condição/destino, reverter baixa, painel, rótulos de auditoria).
  `toolManutencaoRetorno.api.test.js` 13/13; `toolManutencao` 15/15, `toolIntegracao` 1/1, `toolOcorrencia` 9/9, `toolEmprestimo` 12/12,
  `toolCalibracao` 10/10, `auditLabels` 14/14 depois da mudança. Primeiro boot em pasta vazia: as duas colunas nascem (os dois avisos
  "duplicate column" do boot são de `materiais_escritorio`, de antes).
- [x] T2 — `c2bc2d37`: tela (modal com Condição e Destino, selo/filtro *Baixada*, *Reverter baixa*, botões escondidos na baixada). +6 cenários.
- [x] T3 — o cenário de integração mora em `toolManutencaoRetorno.api.test.js` (último cenário, pela rota: manutenção → baixa → emprestar
  recusa → reverter → emprestar → devolver → manutenção → volta ao uso, com o histórico das duas manutenções).
- [x] Revisão — **sem agente independente** (abaixo).
- [x] Fechamento — novidades (seção, B1140–B1145, D (177), cabeçalho, "Onde estamos"), spec 16, mapa (linha 16), guia, manual 21.5/21.6.

**Medido** (sobre a `main` com a T1 da 176, merge `34151325`): `test:api` **502/502**; `test:almoxarifado` 44/44; `test:validation` 4/4,
`test:safealter` 3/3, `test:sqlite` 16/16; client **175 suítes / 2262 testes**; `CI=true react-scripts build` **Compiled successfully**.

**Divergências do plano.**
- O contrato do *reverter baixa* não dizia que a justificativa exige **5 caracteres** (é o `JustificativaSchema` de sempre); o primeiro teste
  mandava `'x'` e caiu no 400 de validação. Corrigido no contrato e no teste.
- **A seção da Etapa 175 dizia que o destino depois da manutenção esperava os formulários em papel da empresa. Estava errado** — corrigido na
  spec 16 e dito na seção da 177 das novidades.

## Fase 2 e Fase 5 — releitura própria (a revisão por agente independente NÃO foi feita)

Este executor é um fork e não pode abrir agentes. A sessão principal deve rodar a revisão adversarial independente antes de dar a etapa por
fechada de vez. O que a releitura própria fez, traçando cada RN até o último gesto:

- **Quem mais lê o status da ferramenta** (`grep 'PERDIDA'|EM_MANUTENCAO` no client e no servidor, fora do serviço, da máquina e da tela):
  ninguém — nenhum relatório ou painel além do de calibrações, que foi tratado (RN-177.09). **Estava errado** — a inspeção e a coluna de
  calibração da tela usavam a ferramenta sem olhar o status; ver "Fase 5 — revisão adversarial independente" abaixo.
- **Validação antes da escrita**: as cinco recusas novas rodam antes do claim da manutenção; a sabotagem S5 (validar depois do claim) derrubou
  os cinco cenários de "nada muda".
- **A baixada pela integração** ainda aceita registrar calibração e ser editada — declarado em **D (177)**, a tela não oferece a calibração.
- **Edição simultânea da conclusão**: o claim `data_fim IS NULL` continua decidindo quem conclui; o segundo leva 404, como antes.
- Achado da própria releitura, **declarado e não corrigido**: as asserções "o painel recarrega" da tela são fracas — o painel já busca de novo
  a cada abertura da aba (o mesmo achado da revisão da 175); o `recarregarCal()` é redundante hoje e foi mantido.

Controle positivo: **17 sabotagens** — servidor S1–S9 (S5 e S7 refeitas com âncora de uma linha, porque `grep -cF` conta por linha e a
âncora de duas linhas abortou pela guarda), tela T1–T8. Cada uma derrubou o cenário dela (lido o nome do cenário). Restauro por cópia + `cmp`.

## Fase 5 — revisão adversarial independente

Feita depois do fechamento por um revisor independente, que montou cenários para cada achado. **A releitura própria acima dizia que, fora do
painel, "ninguém" lia o status da ferramenta. Isso estava errado:** a inspeção usa a ferramenta como instrumento (`resolverMedidas`) sem
olhar o status, e a coluna de calibração da tela também não olhava. A busca procurou quem lia o status quando devia procurar quem **usa** a
ferramenta.

| # | Achado (gravidade) | O que foi feito | Commit |
|---|---|---|---|
| 1 | **MÉDIO, reproduzido:** instrumento BAIXADA ainda medindo na inspeção (`resolverMedidas` só conferia a calibração; a tela o oferecia) | Servidor: 400 *"Ferramenta baixada não pode ser usada em medição (⟨nome⟩)"*, antes do claim de saldo (padrão da literal vizinha, que também traz o nome). Tela: *"(baixada — não mede)"*, desabilitada. **B1146:** só BAIXADA; PERDIDA/AVARIADA/EM_MANUTENCAO/BLOQUEADA continuam medindo, como antes da 177 (o teste `(10c)` fixa isso) | `f707560c` |
| 2 | BAIXO: a coluna **Calibração** mostrava *Vigente* na baixada | mostra *"—"* | `db0e9f0a` |
| 3 | BAIXO: baixa sem `condicao` aceita sem teste | teste que fixa o comportamento (grava NULL); B1140 explicitada nas novidades | `0f7b8a33` |
| 4 | BAIXO: na anomalia (ferramenta fora de EM_MANUTENCAO), a manutenção ficava com `destino = 'BAIXA'` e a ferramenta em outro status, sem a trilha BAIXA | quando o claim de status falha, `destino = NULL` (o destino efetivo) e o pedido vai em `MANUTENCAO_FIM` como `destino_pedido`. Alcançado com fixture direta (status → BLOQUEADA) | `0f7b8a33` |
| 5 | Restrição invisível (COM_RESTRICAO + USO fica DISPONIVEL igual a OK) | **não implementado** — limitação declarada em **D (177)** | — |
| — | Testes que faltavam: 403 do PRODUCAO em `concluir` e `reverter-baixa`; a baixada com calibração **válida** fora do painel | escritos | `0f7b8a33` |

**Controle positivo (8 sabotagens, cópia em `scratchpad/e177-fase5/`, âncora `grep -cF` = 1, restauro por cópia + `cmp`):**
- S1 `resolverMedidas` compara com `'BAIXADA_X'` → caiu `(10b) … instrumento BAIXADO … recusa com 400 literal` (22/23).
- S2 sem o `UPDATE … destino = NULL` → caiu `Fase 5: anomalia … nao grava destino BAIXA` (16/17).
- S3 o painel com `<> ? || 'X'` (a baixada volta) → caíram `RN-177.09` e `Fase 5 / RN-177.09 … calibracao VALIDA` (15/17).
- S4 condição obrigatória no servidor → caíram `RN-177.02 (B1140): corpo vazio` e `Fase 5 / B1140: baixa sem condicao` (15/17).
- S5 sem `requirePermission` em `PUT /manutencoes/:id/concluir` → caiu `Fase 5 / B1143: … 403` (*expected 403, got 200*).
- S6 sem `requirePermission` em `POST /ferramentas/:id/reverter-baixa` → caiu o mesmo cenário, na linha do reverter (o concluir, intacto, deu 403 antes).
- T1 a coluna sem `|| f.status === 'BAIXADA'` → caiu `Fase 5: a baixada com calibração vigente mostra "—"` (29/30). *(A primeira rodada passou o `.js` do componente como padrão do jest e não rodou nenhum teste; foi refeita com o `.test.js`.)*
- T2 `const baixada = f.status === 'BAIXADA_X'` → caiu `(5b) Etapa 177/B1146: instrumento baixado aparece desabilitado` (32/33).

**Medido depois das correções:** `test:api` **502/502** arquivos; `test:almoxarifado` 44/44; `test:validation` 4/4, `test:safealter` 3/3,
`test:sqlite` 16/16; client **175 suítes / 2264 testes**; `CI=true react-scripts build` **Compiled successfully**.

## Retro (4 números)

- Rodadas de correção até verde: **1** (o teste da justificativa curta).
- Achados de revisão: 1 da releitura própria (asserção fraca, declarada); **5 da revisão adversarial independente** (1 médio, 3 baixos
  corrigidos, 1 declarado), mais os testes que faltavam.
- Paralelismo: **0** (T2 dependia do contrato da T1, executadas em sequência por um só executor).
- Defeito que escapou: a preencher na próxima etapa que tocar ferramentas.

## Próxima tarefa detalhada

Desta frente (o pedido de ferramentas/EPI da usuária), o que falta:

1. ~~A revisão adversarial independente da 177~~ — **feita**, ver "Fase 5 — revisão adversarial independente" acima.
2. **A aba de histórico da ferramenta** (manutenções com condição e destino, ocorrências, empréstimos) — o dado existe
   (`GET /ferramentas/:id/manutencoes`, `/ocorrencias`, `/emprestimos?ferramenta_id=` — **medir** este último filtro antes de prometer).
3. **Entrega/empréstimo com assinatura (NR-6)** — espera os formulários em papel da empresa.
