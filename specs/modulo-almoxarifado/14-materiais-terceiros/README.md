# 14 — Materiais Enviados a Terceiros

> **Status:** 🟡 **parcial** — a **Etapa 8b foi entregue** em 2026-08-12 (`0a01124..b176212`):
> remessa e retorno do **MESMO** material, ciclo completo. O que falta da feature é a
> **transformação** (chapa → peças cortadas + sobra), que é a **Etapa 8c**, ainda não iniciada.
> **Spec original:** seção 18 · **Última atualização:** 2026-08-12
> **Design:** [`docs/superpowers/specs/2026-08-12-almoxarifado-etapa8b-materiais-terceiros-design.md`](../../../docs/superpowers/specs/2026-08-12-almoxarifado-etapa8b-materiais-terceiros-design.md)
> **Plano:** [`docs/superpowers/plans/2026-08-12-almoxarifado-etapa8b-remessas-terceiros.md`](../../../docs/superpowers/plans/2026-08-12-almoxarifado-etapa8b-remessas-terceiros.md)
>
> ## A feature foi dividida em 8b e 8c — e a fronteira é real
>
> A Etapa 8 do plano mestre cobria as features **13 e 14**, e foi dividida em 2026-08-12 (Etapa 8 =
> clientes, Etapa 8b = terceiros). Na sessão de design da 8b, a **decisão 1** dividiu de novo:
>
> - **Etapa 8b — remessa e retorno do MESMO material** (entregue): máquina de estados, saldo em
>   terceiros, documento de remessa, retorno parcial, encerramento com destino obrigatório, tela.
> - **Etapa 8c — transformação**: o material que volta **não é** o que saiu.
>
> **Por que não é "cortar pela metade":** metade dos beneficiamentos da lista da spec —
> **tratamento, pintura e galvanização** — devolve o **mesmo** material, com o mesmo código. Para
> esses, a 8b entrega o ciclo **completo, sozinha**. Só **corte, dobra e usinagem** devolvem
> material diferente, e é aí que entra a modelagem nova. Mesmo precedente da Etapa 6 (6/6b/6c).
>
> **A 8b não fecha a porta da 8c:** o retorno já nasceu modelado como *lista de resultados*
> (`retornos_remessa_item_almoxarifado`, com `material_id` próprio) e não como escalar "quantidade
> que voltou" — modelar como escalar obrigaria a 8c a reescrever a tabela. Hoje o retorno de
> material diferente é **recusado**, com mensagem que aponta a 8c
> (`thirdPartyService.validarRetornoDoItem`, `69d32a8`).

## Objetivo

Remessas para beneficiamento externo (corte, dobra, usinagem, tratamento, pintura, galvanização...) com saldo "em terceiros", prazos, retornos parciais e transformação de material (código original → componente resultante).

## O que já existe

**Entregue pela Etapa 8b (2026-08-12):**

- `materiais_almoxarifado.quantidade_em_terceiros` — a **quarta coluna de retenção**, e a conta do
  disponível centralizada em `services/almoxarifado/availabilitySql.js` (`0a01124`).
- Três tabelas: `remessas_terceiro_almoxarifado`, `itens_remessa_terceiro_almoxarifado`,
  `retornos_remessa_item_almoxarifado` (`258f5d2`).
- `services/almoxarifado/thirdPartyStateMachine.js` (transições declaradas) e
  `services/almoxarifado/thirdPartyService.js` (criar / enviar / retornar / encerrar / cancelar /
  vencidas).
- Quatro tipos de movimento no motor: `REMESSA_TERCEIRO`, `RETORNO_TERCEIRO`, `PERDA_TERCEIRO`,
  `CONSUMO_TERCEIRO` (`e0be211`).
- Ação de perfil `remessar_terceiro` em `ACAO_PERFIS`, exposta em `/almoxarifado/minhas-permissoes`.
- Sete rotas em `routes/almoxarifado/extended.js` + `GET /remessas-terceiros/vencidas` (`11a73cb`).
- Tela `client/src/components/almoxarifado/RemessasTerceirosAlmoxarifado.js` e
  `client/src/utils/remessaPdf.js` (`b176212`).

**Pontos de apoio que a etapa consumiu sem reabrir** (vindos da Etapa 8): guarda do dono
(`ownerRules.js`), modelo de propriedade `proprietario_cliente_id`, precedente de ação de perfil
própria, PDF gerado no navegador, e a auditoria nomeada das 40 leituras de `materiais_almoxarifado`.

## Checklist

### Backend
- [x] Tabela `remessas_terceiro_almoxarifado`: fornecedor, pedido/OS relacionado, prazo previsto, status (ABERTA → ENVIADA → RETORNO_PARCIAL → ENCERRADA / CANCELADA) (`258f5d2`)
- [x] Itens da remessa: material, quantidade, peso, lote (`258f5d2`) — **desenhos anexos NÃO**: fora do escopo declarado (decisão 10 do design), não bloqueia o ciclo e a 8c é o consumidor natural dele
- [x] Envio = saldo visível mas **não disponível** (`0a01124`, `e0be211`, `257a444`) — **não** por localização virtual: a redação original desta spec propunha isso e **estava errada** (ver "Correção de spec declarada", abaixo)
- [x] Documento de remessa (PDF) (`b176212`)
- [x] Retorno parcial/total: entrada vinculada à remessa (`69d32a8`)
- [x] Perda ou consumo no terceiro: baixa com motivo (`519e471`) — destino obrigatório (`PERDA_NO_TERCEIRO` / `CONSUMIDO_NO_PROCESSO`) **mais** justificativa; os dois baixam físico e retenção no mesmo lançamento
- [ ] **Transformação**: registrar novos códigos resultantes (chapa → peças cortadas) mantendo vínculo material original → componente — **é a Etapa 8c**, corte deliberado (decisão 1 do design). A modelagem já está pronta (`retornos_remessa_item_almoxarifado.material_id`, `258f5d2`) e o retorno de material diferente é recusado hoje com mensagem que aponta a 8c (`69d32a8`)
- [ ] Acompanhamento de prazo + alerta de atraso — **o prazo é gravado**, `GET /remessas-terceiros/vencidas` existe (`11a73cb`) e a tela destaca a remessa vencida (`b176212`); o **disparo** do alerta é da **feature 20** (decisão 10 do design). Não há agendador no projeto e introduzir um é decisão de infraestrutura
- [ ] E-mail no envio e retorno — **feature 19** (decisão 10 do design), mesma razão da Etapa 8: não travar a etapa esperando outra feature

### Frontend
- [x] Tela de remessas (criar, acompanhar, receber retorno, encerrar, cancelar) (`b176212`)
- [x] Posição "o que está em cada terceiro" — a listagem traz o **terceiro**, o serviço, o prazo, o status e o total de itens de cada remessa, e filtra por **status** (`b176212`). **Duas ressalvas escritas, porque a versão anterior desta linha exagerava:** (a) **não** é uma tela separada de "posição por terceiro" agregando saldo por fornecedor — o design não a pediu; (b) o filtro por **fornecedor** existe na **API** (`GET /remessas-terceiros?fornecedor_id=`, `11a73cb`) mas **não foi exposto na tela** — o único `select` da tela é o de status. Quem quiser a posição de um terceiro específico hoje lê a coluna, ou chama a rota

## Correção de spec declarada

**Esta spec dizia, no checklist de backend: *"Envio = saída para localização virtual 'Em terceiros'
(via movimentação v2 — saldo visível mas não disponível)"*. Isso está ERRADO**, e a correção faz
parte da entrega da 8b (decisão 2 do design).

`stockService.getSaldoDisponivel` calcula sobre o **escalar** `materiais_almoxarifado.quantidade_atual`
— material numa localização virtual **continuaria disponível para saída**. Ou seja: a solução
proposta pela própria spec **não entregava o requisito que ela mesma enunciava** ("saldo visível mas
não disponível").

**O que foi feito:** quarta coluna de retenção `quantidade_em_terceiros`, no padrão das três
existentes, **mais** a mudança na conferência de inventário — `quantidade_sistema` passa a ser
`quantidade_atual − quantidade_em_terceiros`, e **só essa** retenção é descontada, porque é a única
das quatro que significa "não está no prédio".

*A afirmação errada está registrada aqui em vez de apagada em silêncio, porque quem a leu antes
pode ter acreditado nela — e a localização virtual é uma ideia que volta sozinha.*

> **Uma segunda correção, esta no design e não na spec:** a primeira versão do design da 8b dizia
> que a conta do disponível estava replicada em **sete** lugares. Eram **quatorze**, em 8 arquivos
> (corrigido em `742b9ea`). É o **segundo** erro do mesmo tipo na sequência — a spec da Etapa 8
> mandou auditar um subconjunto de diretórios e deixou de fora as duas piores leituras. A regra que
> fica escrita: **mudança em coluna de `materiais_almoxarifado` exige varredura de `server/`
> inteiro, nunca de um subconjunto escolhido por intuição.** A Task 1 fechou essa porta de vez: a
> conta passou a existir só em `availabilitySql.js`, e o teste **varre o código-fonte** provando que
> sobrou zero réplica — "sobrou zero" não depende de eu ter contado certo.

## Regras essenciais + testes de API exigidos

| Regra | Teste | Onde |
|-------|-------|------|
| Material em terceiros sai do disponível mas segue no patrimônio | `envio a terceiro remove do disponivel e mantem quantidade_atual` | `remessaTerceiroMotor.api.test.js` |
| **A contagem de inventário não cobra o que está no terceiro** | `conferencia desconta o que esta em terceiros do esperado` | `conferenciaEmTerceiros.api.test.js` |
| Bloqueado e quarentena **continuam** sendo contados (controle positivo) | `conferencia continua cobrando material bloqueado e em quarentena` | `conferenciaEmTerceiros.api.test.js` |
| Retorno acima do enviado falha, dizendo quanto ainda está lá | `retorno maior que a remessa falha` | `remessaTerceiroCiclo.api.test.js` |
| Encerrar remessa com pendência **sem destino** falha | `encerrar remessa com pendencia sem destino falha` | `remessaTerceiroCiclo.api.test.js` |
| Encerrar com destino **zera** o saldo retido | `encerrar com perda no terceiro zera o em_terceiros` | `remessaTerceiroCiclo.api.test.js` |
| Cancelar remessa ENVIADA devolve ao disponível | `cancelar remessa enviada restaura o disponivel` | `remessaTerceiroCiclo.api.test.js` |
| Remessa não move **nenhum** item se um falhar | `remessa com item sem saldo nao move nenhum item` | `remessaTerceiroCiclo.api.test.js` |
| Material de cliente vai a terceiro isento de OS/projeto | `remessa de material de cliente nao exige vinculo do dono` | `remessaTerceiroMotor.api.test.js` |
| Sem a ação `remessar_terceiro`, a remessa é recusada (403) | `remessa sem a acao remessar_terceiro falha com 403` | `remessaTerceiroCiclo` (serviço) + `remessaTerceiroRotas` (rota) |
| Transformação mantém vínculo de rastreabilidade | `componente resultante referencia material original` | **Etapa 8c** — não escrito ainda |

Seis arquivos de teste novos (`saldoEmTerceiros`, `conferenciaEmTerceiros`, `remessaTerceiroEstados`,
`remessaTerceiroMotor`, `remessaTerceiroCiclo`, `remessaTerceiroRotas`), mais 24 testes de client
(tela + PDF). Gates ao fim da etapa: `test:api` **74/74 arquivos**, `test:almoxarifado` **42/0**,
`test:validation` **4/0**, `test:safealter` **3/0**, `test:sqlite` **3/0**; client **268 testes em
24 suítes**, build `Compiled successfully.`

## Decisões desta feature que valem para quem continuar

- **Só `quantidade_em_terceiros` sai da contagem de inventário.** As outras três retenções são
  estados **administrativos** de material que **está** na prateleira. Quem "uniformizar as quatro"
  passa a esconder do inventário material que está no galpão. Está comentado no código
  (`routes/almoxarifado.js`, criação da conferência) e coberto nos dois sentidos.
- **Fornecedor é `INTEGER` sem FK + nome espelhado.** `fornecedores` é criada em `server/index.js`,
  **não** pelo `initSchema` do almoxarifado — pode não existir. Padrão do módulo
  (`lotes_almoxarifado`, `recebimentos_material_almoxarifado`), com leitura protegida por
  `sqlite_master`. No teste: **stub no harness, nunca fallback na query.**
- **Tipos de movimento dedicados para a baixa do encerramento** (`PERDA_TERCEIRO`/`CONSUMO_TERCEIRO`,
  em vez de reusar `PERDA`/`SUCATA`): reusar quebraria o encerramento de remessa de material **de
  cliente** (os dois estão em `TIPOS_SAIDA_COM_DONO`) e deixaria a retenção presa.
- **O par remessa/retorno não é estornável pelo livro** — sem guarda, o estorno gravaria a linha e
  **não tocaria** em `quantidade_em_terceiros`, com o livro afirmando uma reversão que não
  aconteceu. `PERDA_TERCEIRO`/`CONSUMO_TERCEIRO` **continuam** estornáveis, e o estorno devolve ao
  **disponível** (a remessa já está encerrada; recriar a retenção deixaria saldo preso).
- **`quantidade_retornada = quantidade` no encerramento significa LIQUIDADO, não "voltou".** A
  tabela não tem coluna de "baixado", então o item baixado por perda fica com pendente zero sem ter
  retornado nada. A tela lê `encerramento_destino` do cabeçalho e soma
  `retornos_remessa_item_almoxarifado` para separar as duas colunas. **Corrigir de vez custa uma
  coluna nova (`quantidade_baixada`) + `safeAlter` — a 8c decide isso junto com a transformação.**

## ⚠️ Pendências e pontos abertos

1. **"Uma remessa não pode misturar donos" é uma regra DEDUZIDA e NÃO confirmada com a GMP.** Ela
   saiu de "o documento nomeia o proprietário", no singular, e foi implementada como recusa
   (`thirdPartyService.resolverProprietario`, com o comentário dizendo em voz alta que é dedução).
   **Se a GMP manda chapa de dois clientes na mesma viagem para o mesmo galvanizador, a regra tem de
   virar "o documento lista os donos por item".** Ponto de mudança: `resolverProprietario` + as
   colunas `proprietario_cliente_id/nome` do cabeçalho + o PDF. **Nada a migrar** — o dono de cada
   item já é lido do material.
2. **O `AJUSTE` não reconcilia `quantidade_em_terceiros`** — terceira instância da mesma pendência
   (ver [03-motor-estoque](../03-motor-estoque/README.md)). A 8b **não resolve e não piora**.
3. **Verificação manual não executada:** o Step 11 da Task 9 (conferir no navegador a cor dos cinco
   badges e o PDF baixando legível) **não foi feito** — JSDOM não valida CSS renderizado nem PDF
   binário.
4. **Toda coluna nova de `materiais_almoxarifado` vaza para o requisitante até ser nomeada em
   `stockAvailabilityService.SENSITIVE_MATERIAL_FIELDS`** — `GET /api/requisicoes-material/materiais`
   faz `SELECT m.*` e o sanitizador exclui por lista explícita. Aconteceu com
   `quantidade_em_terceiros` e foi corrigido em `0a01124`; **a 8c tem de repetir a checagem.**
5. **Material com saldo bloqueado E saldo em terceiros ao mesmo tempo** pode ter o encerramento da
   remessa barrado pela guarda "Material bloqueado não pode ser utilizado". Não foi mexido: é a
   mesma pendência do item 2, e a decisão é do cliente.

## Dependências

- 03 (movimentação) · 10 (lotes na transformação) · 19/20 (e-mails/alertas).
- **02 (localização virtual) deixou de ser dependência** — ver "Correção de spec declarada": a
  localização virtual não resolveria o requisito. A retenção é por coluna.
