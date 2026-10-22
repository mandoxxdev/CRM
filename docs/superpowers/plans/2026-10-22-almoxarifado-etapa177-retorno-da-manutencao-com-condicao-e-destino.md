# Etapa 177 — O retorno da manutenção com a condição do item e o destino (volta ao uso ou baixa)

> **Status:** em execução · **Branch:** `etapa-e177` (worktree `CRM-wt-e177`, a partir da `main` `895fd509`) · **Data:** 2026-10-22
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

- [ ] T1
- [ ] T2
- [ ] T3
- [ ] Revisão (Fase 2/5 — **sem agente independente**: este executor é um fork e não pode abrir agentes; releitura adversarial própria)
- [ ] Fechamento
