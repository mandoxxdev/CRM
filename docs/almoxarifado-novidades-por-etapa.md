# Almoxarifado — O que há de novo, etapa por etapa

> **Documento de melhorias do módulo almoxarifado** — consolida tudo que foi entregue da
> Etapa 0 até a Etapa 7 (02/08/2026 a 12/08/2026), na branch `desenvolvimento-almoxarifado`.
> Cada seção diz o que o usuário vê de novo, o que melhorou por baixo do capô e o
> "antes → agora" da etapa.
>
> Fontes: `docs/almoxarifado-guia-etapas-e-testes.md` (roteiros de teste manual de cada
> etapa), `specs/modulo-almoxarifado/README.md` (status por feature) e os planos em
> `docs/superpowers/plans/`. Gerado em 2026-08-12.

## Visão geral

| Etapa | Título | Entrega | Em uma frase |
|---|---|---|---|
| 0 | Fundação | 2026-08-03 | Base técnica: testes de API, motor único de estoque, DDL centralizado — nada novo para clicar |
| 1 | Motor de Estoque | 2026-08-04 | Saldo disponível correto, estorno em vez de exclusão, extrato por material |
| 2 | Cadastros Completos | 2026-08-04 | Multi-almoxarifado, localizações com restrição, material completo com auditoria |
| 3 | Requisições Ponta a Ponta | 2026-08-05 | Ciclo completo: rascunho → aprovação segregada → entrega pelo motor → confirmação do solicitante |
| 4 | Reservas de Estoque | 2026-08-05/06 | Aprovar reserva automaticamente; entrega consome a reserva; tela própria de Reservas |
| 5 | Quarentena e Qualidade | 2026-08-08 | Material crítico entra retido em vez de travar a nota; inspeção parcial auditada |
| 6 | Lotes de Verdade | 2026-08-09 | Lote virou entidade com saldo, validade, status e FEFO — acabou o saldo negativo silencioso por lote |
| 6b | Números de Série | 2026-08-11 | Rastreabilidade por unidade física: série exigida na entrada/saída, aba própria, bloqueio individual |
| 6c | Etiquetas com QR Code | 2026-08-11 | Etiqueta em PDF (A4 ou térmica) com QR que abre a tela certa já filtrada e destacada |
| 7 | Transferências e Devoluções | 2026-08-12 | As duas rotas que existiam sem tela ganharam tela e regra — e o bug que baixava o estoque duas vezes na devolução para sucata foi corrigido |

Com a 6c, a feature 10 (lotes, séries e etiquetas) ficou **completa por inteiro**; com a 7, as
features 11 (transferências) e 12 (devoluções) também.
Próxima etapa da ordem: **Etapa 8 — materiais de clientes** (a Etapa 8 foi dividida em
**8 = clientes** e **8b = terceiros**).

---

## Etapa 0 — Fundação (2026-08-03)

**Em uma frase:** antes de construir qualquer tela nova, o módulo ganhou uma base técnica
sólida — testes automáticos de API, um único mecanismo interno para gravar estoque, motivo
obrigatório em toda saída/ajuste e correção de bugs estruturais.

**O que há de novo (visível para o usuário):** nada — é uma etapa puramente técnica, e o
guia registra isso explicitamente ("não há nada novo para clicar aqui"). O único efeito
indireto perceptível: as rotas de "compras por mínimo", quebradas por um bug de import,
voltaram a funcionar.

**Por baixo do capô:**
- Harness de testes de API (`createTestApp`, supertest + SQLite em memória) montando as rotas reais de produção — base das suítes de todas as etapas seguintes.
- DDL unificado: o schema das 13 tabelas do módulo, antes duplicado dentro das rotas, passou a existir só em `schema.js`.
- A rota antiga (v1) de movimentação passou a delegar ao motor novo (v2): auditoria garantida, motivo obrigatório em saída/ajuste, validação pelo disponível (não só pelo físico).
- `safeAlter` parou de engolir qualquer erro silenciosamente — só ignora coluna duplicada.
- Permissão dos setores de requisição corrigida (`canConfigureAlmox`); ação sem permissão é barrada já no clique.

**Antes → Agora:**
- Antes: não existiam testes automáticos de API para o módulo → Agora: harness com SQLite em memória cobre as rotas reais.
- Antes: movimentação de saldo podia ser gravada "por fora", sem auditoria nem motivo → Agora: todo lançamento passa por um único motor interno.
- Antes: schema duplicado em 13 blocos dentro das rotas → Agora: DDL único e centralizado.
- Antes: `safeAlter` engolia qualquer erro de alteração de tabela → Agora: só ignora coluna duplicada; o resto aparece.

---

## Etapa 1 — Motor de Estoque (2026-08-04)

**Em uma frase:** consolidou o motor de movimentação como caminho único e confiável, com
saldo disponível correto, vínculo obrigatório por documento, estorno seguro e uma nova tela
de extrato por material.

**O que há de novo (visível para o usuário):**
- O **Disponível** agora desconta reservado, bloqueado e em inspeção do saldo físico — deixou de mostrar só o saldo bruto.
- Formulário de Movimentação mais rico: localização de origem/destino, lote, custo unitário e vínculo por Ordem de Serviço, Projeto ou Centro de Custo (selects, não mais texto livre).
- Checkbox **"Saída emergencial"**: libera a saída sem os requisitos normais, com justificativa obrigatória, e a movimentação fica marcada como "pendente de regularização".
- Movimentação errada não é mais excluída: é **estornada** — lançamento reverso, motivo obrigatório, e a linha original ganha o badge "ESTORNADA".
- Entrada com custo unitário recalcula automaticamente o **custo médio** do material.
- Nova tela de **Extrato por material**: saldos físico/reservado/bloqueado/em inspeção/disponível, custo médio, saldo por localização, últimas 100 movimentações e reservas ativas.
- Livro de movimentações com filtro por tipo (incluindo "Estorno") e por data.

**Por baixo do capô:**
- Todas as regras vivem em um motor único (`stockService.registrarMovimentacao`); a rota v1 delega para ele.
- Regras de vínculo obrigatório por tipo de movimento viraram módulo declarativo (`movementRules.js`), validado com Zod.
- Saldo deixou de ser "ler depois escrever" (janela de corrida) e passou a UPDATE condicional atômico.
- Estorno com lógica própria por tipo de movimento original, revertendo também o saldo por localização.
- AJUSTE por localização recalcula corretamente o total do material, inclusive quando o saldo cai a zero.

**Antes → Agora:**
- Antes: "Disponível" era só o saldo físico → Agora: `físico − bloqueado − inspeção − reservado`.
- Antes: movimentação errada só podia ser excluída (apagava histórico) → Agora: estorno com lançamento reverso e badge.
- Antes: não existia saída de emergência formal → Agora: checkbox com justificativa e marcação de pendência.
- Antes: não havia histórico por item → Agora: tela de Extrato com saldos, custo médio e movimentações.

---

## Etapa 2 — Cadastros Completos (2026-08-04)

**Em uma frase:** transformou os cadastros (materiais, localizações e famílias) de listas
simples em cadastros completos, com múltiplas áreas físicas de almoxarifado, regras de
endereço aplicadas pelo motor de estoque e rastro de auditoria nas edições.

**O que há de novo (visível para o usuário):**
- É possível cadastrar **vários almoxarifados** (áreas físicas dentro do mesmo site — galpão, mezanino, área externa; não filiais). Tudo que existia foi vinculado automaticamente ao "ALM-GERAL", sem perda de dados. O saldo de cada material continua único, somado em todas as áreas — isso é intencional.
- Localizações podem ser **bloqueadas** (impedem entrada/saída) ou **restritas a certos tipos de material**; o sistema recusa qualquer movimentação que contrarie isso.
- Famílias de material podem ter **subfamílias** (um nível abaixo).
- Formulário de material reorganizado em **6 seções** — Identificação, Classificação, Dados Técnicos, Estoque e Reposição, Controles, Unidades e Custos — incluindo classe ABC e unidade de compra/consumo com fator de conversão.
- Toda criação/edição de material grava **auditoria** (o que mudou, de-para de valores).
- No **mapa de localizações**, posição bloqueada aparece com contorno tracejado vermelho e cadeado; há filtro por almoxarifado.

**Por baixo do capô:**
- Nova entidade raiz `almoxarifados`, migrada via ledger idempotente, sem quebrar dados existentes.
- Validação de bloqueio/tipo de material centralizada no motor de movimentação, não espalhada por rota.
- Rotas de material migradas para validação com Zod.
- Consultas novas de backend: localizações vazias e materiais sem endereço (ainda sem tela própria).

**Antes → Agora:**
- Antes: só existia um almoxarifado implícito → Agora: multi-almoxarifado, com o legado preservado em "ALM-GERAL".
- Antes: localizações sem restrição nenhuma → Agora: bloqueio e restrição por tipo, aplicados pelo motor.
- Antes: famílias eram lista simples → Agora: subfamílias (criação ainda só via API).
- Antes: editar material não deixava rastro → Agora: auditoria completa em toda criação/edição.

---

## Etapa 3 — Requisições Ponta a Ponta (2026-08-05)

**Em uma frase:** fechou o ciclo completo de requisição de material — do rascunho até a
confirmação de recebimento pelo próprio solicitante — corrigindo lacunas de validação,
segurança e rastreabilidade.

**O que há de novo (visível para o usuário):**
- Item com quantidade zero ou negativa **não é mais aceito**, em nenhuma das duas telas de criação.
- Dá para salvar como **Rascunho** e enviar depois, sem disparar e-mail antes da hora.
- Novos status no ciclo: **Aguardando Estoque**, **Aguardando Compra** (quando já existe compra pendente do material), **Pronta p/ Retirada** e **Encerrada** (fecha de vez e bloqueia entregas futuras).
- Novo campo **Tipo** de requisição com 14 opções (Consumo, Projeto, Emergencial, EPI etc.) — "Emergencial" exige justificativa.
- Novos campos **Centro de Custo** e **Local de Entrega**.
- O próprio **solicitante confirma o recebimento** — nem o admin pode confirmar no lugar de outra pessoa.
- **Quem pediu não pode aprovar a própria requisição** (nas duas formas de aprovação); rejeitar a própria continua permitido (é desistência). Toda rejeição exige motivo.
- Botão **"Copiar como Novo Rascunho"** reaproveita itens/tipo/vínculos de uma requisição antiga.

**Por baixo do capô:**
- Entrega e estorno passaram a usar o **motor de estoque da Etapa 1**, em vez de um caminho próprio com SQL cru sem auditoria.
- A validação de entrega considera o **disponível** (descontando reservas/bloqueios de terceiros), não só o físico.
- Toda decisão de aprovação/rejeição/recebimento/encerramento fica auditada com usuário, data e justificativa.
- Criação unificada com validação Zod nas duas rotas de entrada.

**Antes → Agora:**
- Antes: aceitava item com quantidade 0 ou negativa → Agora: bloqueado nas duas rotas.
- Antes: entrega baixava estoque por caminho próprio, sem auditoria → Agora: passa pelo motor, com auditoria e checagem de disponível.
- Antes: requisição nascia direto como "Pendente" → Agora: pode nascer como Rascunho.
- Antes: quem pedia podia aprovar a própria → Agora: aprovação segregada, rejeição sempre justificada.

---

## Etapa 4 — Reservas de Estoque (backend 2026-08-05, tela 2026-08-06)

**Em uma frase:** transformou "reservar material" de uma armadilha que travava o próprio
saldo em um fluxo completo — aprovação reserva automaticamente, a entrega consome a reserva
em vez de disputar estoque, e ganhou tela própria para gerenciar, transferir e liberar.

**O que há de novo (visível para o usuário):**
- **Aprovar uma requisição reserva automaticamente** os itens com saldo disponível; o status vira **Totalmente Reservada** ou **Parcialmente Reservada**.
- A **entrega consome a própria reserva** da requisição — acabou a corrida entre "quem aprova primeiro" e "quem entrega primeiro".
- Nova tela **Almoxarifado → Reservas**: lista reservas (origem REQ #número ou MANUAL), reserva manual, liberação total/parcial com motivo, transferência entre projetos/OS e job de expiração (só admin).
- No Extrato do material, a tabela de reservas ativas mostra saldo, origem e prazos.
- Cancelar ou excluir uma requisição **solta as reservas**, devolvendo o saldo ao disponível.
- Expiração de reserva é opcional (opt-in): só vence se `reserva_dias_validade` ou uma data específica for informada.

**Por baixo do capô:**
- Saída com `reserva_id` valida contra a própria reserva, com claim via UPDATE condicional + RETURNING contra consumo concorrente.
- `MovimentacaoSchema` (Zod) não declarava `reserva_id` e descartava o campo em silêncio — corrigido.
- Dois bugs fechados ao endurecer `liberarReserva`: liberação acima do hold roubava saldo de outras reservas; liberação parcial não reduzia a quantidade da reserva.
- A tela consome `quantidade_disponivel` calculado pelo servidor, sem recalcular a fórmula no front.

**Antes → Agora:**
- Antes: reservar tornava o material indisponível até para quem reservou → Agora: a saída cita a reserva e a consome até fechar.
- Antes: aprovar não separava nada; o material podia ser consumido por outro antes da entrega → Agora: aprovação reserva automaticamente.
- Antes: reserva presa a um projeto → Agora: transferência de reserva entre projetos/OS.
- Antes: cancelar requisição deixava o material preso → Agora: cancelar/excluir devolve ao disponível.

**Melhoria posterior (2026-08-11, commit `92fe236`):** a tela de Requisições não conhecia
os status `PARCIALMENTE_RESERVADA`/`TOTALMENTE_RESERVADA` — aparecia o código cru no badge,
o stepper regredia e sumiam os botões "Iniciar Separação"/"Cancelar Requisição". O backend
sempre aceitou; era a tela que não oferecia o caminho. Corrigido com teste próprio.

---

## Etapa 5 — Quarentena e Bloqueio de Qualidade (2026-08-08)

**Em uma frase:** material que exige inspeção (crítico) agora entra retido no estoque em
vez de travar o processamento do recebimento, e aprovar/reprovar/bloquear viraram decisões
auditadas com efeito correto no saldo.

**O que há de novo (visível para o usuário):**
- Processar a nota de um material crítico **deixou de dar erro** — o recebimento sempre conclui; se o material exige inspeção, ele entra fisicamente mas fica **retido** (fora do Disponível) até alguém decidir.
- Nova tela **Almoxarifado → Inspeções**: tudo que está retido, com material, recebimento de origem e há quantos dias espera.
- **Aprovação parcial** (ex.: recebeu 100, aprova 90 e reprova 10), validando que aprovado + reprovado fecha exatamente com o retido.
- Reprovar exige observação obrigatória e um encaminhamento (Devolver ao fornecedor / Análise da Engenharia / Substituição).
- Botões **Bloquear/Desbloquear Material** para defeito achado na prateleira (fora do fluxo de recebimento), com justificativa sempre obrigatória.
- Desbloquear mais do que está bloqueado é **recusado com erro**, em vez de "funcionar" silenciosamente.
- Decidir inspeção usa o perfil Almoxarife; bloqueio/desbloqueio avulso exige Administrador ou Gestor.

**Por baixo do capô:**
- Três tipos novos de movimentação no motor: `QUARENTENA`, `LIBERACAO_INSPECAO` e `REPROVACAO_INSPECAO` (mexem só na coluna de retenção, não no físico).
- Lógica de inspeção extraída para `inspectionService.js`, separando recebimento fiscal de decisão de qualidade.
- `DESBLOQUEIO` ganhou guarda atômica, corrigindo o bug de saldo negativo silencioso.
- Justificativa obrigatória por regra de negócio (`movementRules.js`) em bloqueio/reprovação.

**Antes → Agora:**
- Antes: aprovar recebimento de material crítico sem inspeção dava erro e a mercadoria não entrava → Agora: o recebimento sempre processa e o material entra retido.
- Antes: não existia tela do que aguarda inspeção → Agora: tela dedicada.
- Antes: decisão era tudo ou nada, e bloquear 10 tirava 20 do disponível (bug) → Agora: aprovação parcial validada e saldo correto.
- Antes: desbloquear demais "funcionava" devolvendo menos que o pedido → Agora: recusado com mensagem de erro.

---

## Etapa 6 — Lotes de Verdade (2026-08-09)

**Em uma frase:** lote deixou de ser um campo de texto ignorado e virou uma entidade real,
com saldo próprio, validade, corrida e status — fechando o bug em que era possível tirar
mais material do que um lote tinha, sem qualquer aviso.

**O que há de novo (visível para o usuário):**
- No **Recebimento**, cada item ganhou os campos Lote, Validade, Corrida e Fabricação — é ali que o lote nasce, já vinculado ao fornecedor e ao número da NF.
- Na **saída**, o campo Lote virou uma lista com os lotes que têm saldo (código, saldo, validade); o sistema sugere o que vence primeiro (**FEFO**), mas permite trocar.
- Tirar mais do que o lote tem é **recusado**, com o saldo real do lote na mensagem.
- Lote tem **situação** — Ativo, Bloqueado ou Reprovado; lotes não elegíveis aparecem desabilitados com o motivo, em vez de sumirem.
- **Lote vencido** não sai para consumo normal, mas pode ser baixado como Sucata/Perda, corrigido por Ajuste, ou **liberado com justificativa** (a marca de "vencido" permanece nas telas — auditoria).
- Material com **"Requer certificado"** faz o lote nascer bloqueado até anexar o certificado do fornecedor; o material entra no estoque, só a saída trava.
- Nova tela **Almoxarifado → Lotes**: trocar status, liberar vencimento e anexar/ver certificado (PDF ou imagem), sem depender de API.
- **Sucata** e **Perda** viraram tipos selecionáveis na tela de Movimentação.
- Extrato do material com coluna "Lote" e saldo separado por lote.

**Por baixo do capô:**
- Nova tabela `lotes_almoxarifado` e `lotService.js` como dono único do ciclo de vida do lote.
- `estoque_saldo_almoxarifado` reconstruída com FK `lote_id`, removendo colunas mortas.
- Três guardas na saída por lote (status, validade, claim atômico), sempre na cláusula `WHERE` com `RETURNING` — nunca "ler depois escrever".
- Entrada do recebimento atômica e **idempotente**: pré-checagem de todos os itens antes de mover qualquer um, evitando duplicar estoque ao reprocessar.
- Exigência de lote declarada pelo chamador (`opcoes.exigeLote`), não imposta a toda entrada/saída.

**Antes → Agora:**
- Antes: tirar 10 de um lote com 2 passava, deixando saldo negativo em silêncio → Agora: recusado, mostrando o saldo real.
- Antes: lote era texto livre na saída, sujeito a erro de digitação → Agora: lista dos lotes existentes com FEFO sugerido.
- Antes: "Controle por lote" e "Requer certificado" na ficha do material não faziam nada → Agora: exigem lote e travam saída sem certificado.
- Antes: bloquear/reprovar/reativar lote só via API → Agora: tela própria.

---

## Etapa 6b — Números de Série (2026-08-11)

**Em uma frase:** a flag "controle por número de série" — que existia desde a Etapa 2 mas
era decorativa — passou a exigir, rastrear e auditar um número de série por unidade física,
com telas para digitar, gerar, selecionar, bloquear e visualizar essas séries.

**O que há de novo (visível para o usuário):**
- Na ficha do material, marcar "Controle por número de série" mostra um aviso explicando o efeito real (antes não fazia nada).
- Na **entrada** (Movimentações): caixa "Números de série (um por linha)" com contador `N/quantidade` e botão **"Gerar sequência"** (prefixo + número inicial preenche tudo).
- Na **saída/sucata/perda**: lista de séries em estoque para marcar quais saem; com lote escolhido, a lista filtra só as séries daquele lote.
- No **Recebimento**: caixa "Séries (uma por linha)" por item, ao lado dos campos de lote.
- A tela de Lotes virou **"Lotes e Séries"**: aba nova lista as séries do material (número, status, lote, localização) com **Bloquear/Desbloquear** (justificativa obrigatória).
- Extrato do material com o cartão **"Séries em estoque"**.
- O modal rápido da tela de Materiais (rota v1) sempre recusa material controlado por série — usar a tela Movimentações.

**Por baixo do capô:**
- Nova tabela `series_almoxarifado` (1 linha = 1 unidade física) e `seriesService` como dono único, auditando toda mutação.
- Motor exige e processa série na entrada (cardinalidade, duplicidade) e na saída (claim + compensação em falha parcial).
- Estorno devolve a série (saída) ou marca `ESTORNADA` (entrada), sem reaproveitamento de número.
- Invariante `COUNT(séries presentes) == quantidade_atual` protegido por teste, inclusive sob falha do INSERT do ledger.
- Duas rotas HTTP novas (listar séries; bloquear/desbloquear), sem novas ações de perfil.

**Antes → Agora:**
- Antes: marcar a flag no material não mudava nada → Agora: entrada e saída exigem e conferem os números.
- Antes: nada registrava qual unidade física era qual → Agora: rastreabilidade individual (status, lote, localização, histórico).
- Antes: não havia onde bloquear uma unidade específica → Agora: aba Séries, com a saída recusando série bloqueada.
- Antes: a suíte passava verde sem testar série nenhuma → Agora: cobre entrada, saída, estorno, bloqueio e o invariante.

**Limites declarados:** série não é exigida nos fluxos internos (entrega/exclusão de
requisição, devolução, sucata de devolução) nem em transferência — mesma lacuna já
existente para lote; inspeções reprovam por quantidade, não por série individual; não
existe reserva por série.

---

## Etapa 6c — Etiquetas com QR Code (2026-08-11)

**Em uma frase:** gerador de PDF de etiquetas (código do material + QR Code) para lote,
série, material avulso e itens de recebimento — fecha o ciclo das Etapas 6 e 6b, que
existiam na tela mas sem nada que identificasse o item físico no galpão.

**O que há de novo (visível para o usuário):**
- Botão **"Imprimir etiquetas dos itens"** na nota de recebimento processada — uma etiqueta por série ou por lote, conforme o controle do material.
- Ícone de etiqueta **em cada linha de lote e de série** em "Lotes e Séries" (inclusive séries baixadas, para reimpressão) e botão **"Etiquetas das séries em estoque"** para gerar em massa.
- Ícone de etiqueta em **Materiais**: material sem controle abre o modal direto; material controlado leva para "Lotes e Séries" (a etiqueta certa é a do lote/série específico).
- **Modal único** para escolher formato — **Folha A4** (10 por página, com borda pontilhada de corte) ou **Térmica 100×50 mm** (1 por página) —, definir cópias e ver a contagem antes de baixar; o formato escolhido fica lembrado no navegador.
- A etiqueta mostra só o essencial: código do material em fonte grande, nome e a linha de controle (`Lote L-001 · Val 31/12/2026` ou `SN: GMP-042`).
- O **QR abre a tela do sistema já no material, na aba e na linha certos**, com a linha destacada.

**Por baixo do capô:**
- 100% no navegador — única dependência nova é a lib `qrcode`; nenhuma mudança em `server/`.
- Montadores puros de descritor + renderizador jspdf desacoplados e testados isoladamente.
- Deep-link padronizado (`?material_id=&aba=&lote=/&serie=`) reaproveitado entre QR e telas.
- Client 177/177 testes, build CI limpo; suítes de servidor inalteradas.

**Antes → Agora:**
- Antes: nota processada não gerava etiqueta → Agora: botão gera por lote/série direto da nota.
- Antes: não existia como imprimir etiqueta de um lote/série específico → Agora: ícone por linha, incluindo reimpressão.
- Antes: abrir a tela filtrada num lote/série exigia navegação manual → Agora: o QR já abre no lugar certo com destaque.

**Limites declarados:** a impressora física do galpão ainda não foi confirmada (A4 +
térmica 100×50 são a melhor aposta, e acrescentar outro formato é uma constante); QR lido
sem sessão cai no login e perde o destino (melhoria global de auth, registrada); a etiqueta
do recebimento usa o texto digitado na nota; não há registro de quem imprimiu o quê.

---

## Etapa 7 — Transferências e Devoluções (2026-08-12)

**Em uma frase:** as duas operações que existiam no sistema mas **não tinham tela nenhuma** —
transferir material entre endereços e devolver material que voltou do chão de fábrica — ganharam
interface e regra de verdade, e um bug que fazia a devolução para sucata **baixar o estoque duas
vezes** foi encontrado e corrigido.

**O que há de novo (visível para o usuário):**
- **Transferência** virou um tipo do formulário de **Movimentações**, mostrando **Localização de origem e de destino ao mesmo tempo** (Entrada mostra só destino, Saída só origem) mais o seletor de lote. Antes, mover material de uma prateleira para outra só era possível por chamada direta à API — ninguém no galpão conseguia fazer.
- A transferência **exige o lote** em material com "Controle por lote" — antes o material trocava de endereço sem dizer de qual lote tinha saído.
- No livro, a transferência tem **badge com cor própria** (ciano-petróleo): não é verde de entrada nem vermelho de saída, porque transferir não soma nem subtrai saldo.
- Nova tela **Almoxarifado → Devoluções**: escolhe o material, vê **as entregas daquele material** (data, quantidade, quem retirou, requisição/OS, lote, e quanto já foi devolvido) e devolve **limitado ao que ainda resta**.
- A **condição sugere o destino** — Boa → Estoque, Suspeita → Quarentena, Danificada → Sucata — mas **não trava**: você pode trocar, e a sugestão não desfaz a sua escolha.
- **Devolução avulsa** continua possível (sobra antiga, material entregue antes do sistema): sem entrega escolhida, não há limite de quantidade nem lote a herdar.
- Devolução de material com lote **herda o lote da entrega** (aparece em modo leitura); na avulsa, seletor de lote.
- Devolução de peça com **número de série** faz a série voltar para **"Em estoque"** — antes o saldo voltava e a peça continuava marcada como "Entregue" para sempre.
- **"Devolução" saiu do formulário de Movimentações** — ali ela criava um lançamento solto, sem motivo, sem condição, sem destino, e **não criava registro nenhum** de devolução. Um aviso aponta a tela nova; o filtro do livro continua oferecendo "Devolução" para consultar os lançamentos antigos.
- **Devolução recusada não deixa mais registro**: antes, uma devolução que o sistema rejeitava ficava gravada assim mesmo e **encolhia para sempre** o quanto ainda podia ser devolvido daquela entrega.

**Por baixo do capô:**
- `TRANSFERENCIA` passou a estar **declarada** nas regras de vínculo (`vinculo: 'nenhum'`) — não exige nada, mas a ausência deixou de ser omissão e virou decisão escrita.
- A guarda de "exige lote" **não alcançava** a transferência: ela é um ramo próprio do motor, fora dos conjuntos de entrada e de saída. Declarar a exigência na rota não mudava nada — foi preciso citar o tipo explicitamente na condição da guarda. Sem notar isso, o teste passaria sem lote e alguém concluiria que a guarda funcionava.
- Duas colunas novas na tabela de devoluções (`movimentacao_saida_id` e `lote_id`) via alteração idempotente, e uma rota de leitura que devolve as entregas devolvíveis de um material com o saldo ainda devolvível e as séries de cada uma.
- **As duas pontas usam o mesmo número**: o "devolvível" que a tela mostra é calculado pela mesma conta que a validação do servidor aplica, sobre a mesma lista de tipos — se divergissem, a tela ofereceria devolver 6 e o servidor responderia que só cabem 4.
- Compensação explícita quando a devolução falha no meio (o módulo não tem transação): se nenhuma movimentação chegou ao livro, a linha da devolução é apagada; se alguma já mexeu no estoque, a linha **fica** marcada como estado parcial — apagar seria pior, viraria um movimento real sem rastro.
- A devolução **saiu** da lista de fluxos internos isentos de exigência de lote: eram quatro, agora são dois (entrega e exclusão de requisição).

**Antes → Agora:**
- Antes: transferir material só por API, nenhuma tela → Agora: "Transferência" é um tipo do formulário de Movimentações, com origem, destino e lote.
- Antes: material com controle de lote transferia sem dizer de qual lote → Agora: a transferência exige o lote; e **todos** os lotes servem, inclusive bloqueado e vencido (é assim que um lote reprovado vai para a área de bloqueados).
- Antes: devolução por API, sem dizer de qual entrega veio, aceitando qualquer quantidade → Agora: tela dedicada, ligada à entrega, com limite pelo que ainda resta.
- Antes: devolução de material com lote entrava sem lote e o saldo ficava **preso** (a saída seguinte exigia lote e não achava nenhum) → Agora: lote herdado da entrega, ou escolhido na avulsa.
- Antes: devolução de peça serializada voltava o saldo sem voltar a peça → Agora: a série volta para "Em estoque" junto.
- Antes: "Devolução" no formulário de Movimentações criava lançamento solto → Agora: saiu do formulário; um aviso aponta a tela nova (continua no filtro do livro).
- Antes: **devolver para Sucata baixava o estoque duas vezes** → Agora: o saldo não muda, e o livro registra as duas linhas (entrou e foi sucateada).
- Antes: devolução recusada ficava gravada e encolhia o devolvível da entrega → Agora: recusa não deixa registro.

### 🚨 O bug da Sucata — e o que fazer antes de subir para produção

**Devolver material para o destino "Sucata" baixava o estoque duas vezes.** O material já tinha
saído do estoque quando foi **entregue**; ao registrar a devolução para sucata, o sistema lançava
mais uma saída, descontando de novo um saldo que nunca tinha voltado.

Medido com o sistema rodando — a leitura do código não mostrava o problema, só a execução:

```
estoque inicial            => 100
saída de 10 (entrega)      =>  90
devolução de 3 → Sucata    =>  87     ← ERRADO: o certo é 90
devolução de 2 → Estoque   =>  89     ← controle: prova que a medição sabe medir
```

Agora o destino Sucata lança **duas** movimentações — **Entrada de devolução** (o material voltou)
seguida de **Sucata** (e foi descartado). O saldo fecha certo e a sucata continua no livro, onde o
controle de retalhos e sucatas vai precisar dela.

**A correção não conserta o passado.** Onde já houve devolução para sucata antes do deploy, o saldo
daquele material está **a menos**. **No banco de desenvolvimento a checagem foi feita: 0
devoluções, nenhum efeito lá.** Produção precisa da mesma checagem — a consulta exata está no guia
(`docs/almoxarifado-guia-etapas-e-testes.md`, seção "Etapa 7 → O bug da Sucata"), e o acerto, se
houver casos, é uma contagem física com lançamento de Ajuste.

### Regras e validações desta etapa — cada uma demonstrável ao vivo

Todas as mensagens abaixo são as **mensagens reais** do sistema.

| Cenário (o que digitar) | O que o sistema faz | Mensagem |
|---|---|---|
| Entrega de **10**, já devolvidos **4**; tentar devolver **7** | **Recusa** | `Devolução acima do entregue: a saída 1 entregou 10, já foram devolvidos 4 e restam 6` |
| Devolver **6**, depois **5**, depois **4** da mesma entrega de 10 | 1ª passa, 2ª **recusa**, 3ª passa (6 + 4 = 10) | a mesma acima, com `restam 4` |
| Digitar quantidade acima do devolvível na tela | A tela **barra antes** de chamar o servidor | `Esta entrega ainda aceita 6 de devolução` |
| Entrega já devolvida por inteiro | Continua **listada**, marcada "já devolvido por inteiro", **não selecionável** | — |
| Sucata, Perda, Ajuste e Entrada do mesmo material | **Não aparecem** como entregas devolvíveis | — |
| Devolver citando uma saída **estornada** | **Recusa** | `A saída 12 foi cancelada (estornada) — o estorno já devolveu o material` |
| Transferir material com controle de lote **sem escolher lote** | **Recusa** | `O material MAT-001 exige lote nesta movimentacao (controle por lote ligado)` |
| Transferir um lote **bloqueado** ou **vencido** | **PASSA — de propósito**; todos os lotes ficam habilitados na Transferência | — |
| Os mesmos lotes numa **Saída** | Aparecem **desabilitados**, com o motivo (controle positivo da regra acima) | — |
| Transferir 50 de uma prateleira que tem 20 | **Recusa**, e a origem **não** é debitada | `Saldo insuficiente na localização de origem` |
| Devolução **avulsa** de material com controle de lote, sem escolher lote | A tela barra | `Material com controle por lote: informe de qual lote é a devolução` |
| Devolver ao Estoque peça com número de série **sem marcar a série** | **Recusa** | `Material com controle de série: informe 1 número(s) de série para 1 unidade(s) devolvida(s) — recebidos 0` |
| Devolver peça com série direto para **Sucata**, com a série marcada | **Recusa ensinando o caminho** | `Devolução com número de série não é suportada no destino SUCATA. Devolva ao estoque e, em seguida, registre a baixa na tela Movimentações, que tem seletor de série.` |
| Mesma peça para Sucata **sem marcar série** | **Passa** — a limitação é "não dá para informar a série aí", não "peça com série não pode ir para sucata" | — |
| Devolver para Sucata citando um lote **bloqueado** | **Recusa antes** de mexer no estoque (nem meio movimento) | `Lote L-001 está bloqueado e não pode ser sucateado por devolução. Resolva o status do lote primeiro (tela Lotes e Séries) e repita a devolução.` |
| Uma devolução **recusada**, depois reabrir o formulário | A recusa **não** aparece na lista, e o devolvível da entrega **continua o mesmo** | — |
| Devolver 6 com condição **Suspeita** (destino Quarentena) | O saldo físico sobe 6; o **Disponível não sobe** | — |
| Devolver com destino **Retrabalho** | Só registra no livro; **nenhum saldo muda** | — |
| Escolher condição **Danificada** (destino vira Sucata) e trocar o destino para **Retrabalho** | Fica **Retrabalho** — a sugestão não desfaz a escolha | — |
| Enviar sem motivo | A tela barra | `Informe o motivo da devolução` |

**Limites declarados:** o estado **"em trânsito"** da transferência foi **cortado por decisão do
cliente** — os almoxarifados são áreas físicas do mesmo site, existe uma filial só, e alguém pega a
caixa e leva na hora; com ele saíram aprovação de transferência, e-mail e o alerta "não recebida".
**Série na transferência** fica fora: depois de transferir, a série mostra o endereço antigo (o
saldo real, que a transferência move certo, mora em outro lugar). **Sucata/Retrabalho de peça
serializada** exige dois passos (devolver ao Estoque, depois baixar em Movimentações). Fotos da
devolução, devolução ao fornecedor, estorno de custo de projeto e tipos de devolução por origem
(cliente/ferramenta) continuam fora.

**Duas pendências que esta etapa levantou e registrou (não consertou):**
1. **Ajuste de inventário não acerta o "bloqueado".** Material com 8 unidades bloqueadas e um Ajuste
   levando o total para 1 fica com bloqueado maior que o total — **Disponível negativo, sem aviso**.
   É plausível: a contagem acha menos do que o sistema dizia, e parte estava em quarentena. Não foi
   consertado porque **a decisão é de negócio**: o Ajuste deve baixar o bloqueado, recusar, ou
   avisar? Enquanto isso, resolva a quarentena antes de lançar um ajuste que reduz o total.
2. **Estado parcial na Sucata, sem notificação.** Se a segunda movimentação da sucata falhar depois
   de a primeira ter entrado, a devolução fica registrada como estado parcial na auditoria e a
   resolução é manual (estorno pela tela de Movimentações). Ninguém é notificado.

---

## Onde estamos e o que vem a seguir

- **Concluído até aqui:** Etapas 0 a 7 — fundação, motor de estoque, cadastros,
  requisições, reservas, quarentena, lotes, séries, etiquetas, transferências e devoluções.
  As features 10 (lotes/séries/etiquetas), 11 (transferências) e 12 (devoluções) estão
  completas no que cada etapa se propôs.
- **Próxima etapa da ordem:** **Etapa 8 — materiais de clientes** (spec 13). A Etapa 8 do
  planejamento foi **dividida**: **8 = clientes** e **8b = terceiros** (spec 14), mesmo
  precedente da Etapa 6 (dividida em 6/6b/6c). Design e plano das duas já escritos em
  `docs/superpowers/`.
- **Ação pendente antes do deploy:** rodar em produção a consulta do **bug da Sucata** (seção da
  Etapa 7 no guia). No desenvolvimento deu 0 devoluções; produção precisa da mesma checagem.
- **Pendências conhecidas (documentadas, não urgentes):** click-through manual das etapas
  pelo usuário (roteiros no guia); tela de subfamílias; telas para localizações
  vazias/materiais sem endereço; pendências declaradas (a)–(j) da 6b e (a)–(g) da 6c na
  spec 10; e as duas da Etapa 7 — Ajuste não reconcilia o bloqueado (decisão de negócio
  pendente) e o estado parcial da Sucata sem notificação.
- **Transversal (2026-08-11):** auditoria completa das 24 specs contra o código — specs
  que afirmavam coisas não entregues foram corrigidas com nota datada, e o bug de front dos
  status de reserva (`92fe236`) saiu dessa auditoria.
