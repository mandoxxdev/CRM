# Etapa 178 — Entrega de EPI ao colaborador com assinatura na tela (NR-6)

> **Status:** 🟡 em execução (2026-10-22). Emendada da "próxima tarefa detalhada" da Etapa 176 (B1157).
> **Origem:** pergunta 3 da usuária de Compras (21/10) e a observação dela: *"é possível utilizar registros eletrônicos
> para comprovar a entrega de EPIs, mas o sistema deve garantir a identificação do colaborador, a integridade dos
> registros e a possibilidade de recuperação das informações, observando as exigências aplicáveis da NR-6. A assinatura
> feita diretamente na tela do tablet deve ser estruturada de modo que ofereça evidências confiáveis do recebimento."*
> **⚠️ Campos deduzidos:** os formulários em papel de EPI da empresa **não chegaram** (o André vai pedir); a planilha
> recebida é de Compras. CA e validade do CA são exigência da NR-6; tamanho e motivo da entrega são deduzidos e
> **opcionais**. Tudo desenhado para trocar campos depois (letra B).
> **Fase 0 (medido):** `AssinaturaCanvas.js` já é componente separado (props `onConfirm(blobPng)`);
> `deliverySignatureService` é amarrado à requisição, guarda nome **digitado** e não tem hash; nenhum hash de
> arquivo/registro existe no projeto; o material **não tem** CA nem validade do CA; colaboradores só são listáveis com o
> módulo Operacional (e a lista traz CPF e salário); o almoxarifado gera PDF no navegador com jsPDF (molde
> `posicaoClientePdf.js`); não existe ação de perfil para EPI; o motor aceita `SAIDA` com justificativa sem OS (a RN-A só
> vale na requisição).

## Regras

| ID | Regra | Cenário / mensagem literal |
|---|---|---|
| RN-178.01 | **Material de EPI**: `materiais_almoxarifado` ganha `ca_numero TEXT` e `ca_validade DATE` (safeAlter). É EPI quem tem `tipo_material_id` com `is_epi = 1` **ou** `tipo_material = 'epi'` **ou** categoria `EPIs` (as três marcas que existem hoje). O cadastro do material edita os dois campos. | — |
| RN-178.02 | **Entregar EPI** = ação de perfil nova `entregar_epi` (ADMINISTRADOR, ALMOXARIFE). | PRODUCAO → 403 do `requirePermission` |
| RN-178.03 | **Colaborador do cadastro, nunca texto livre**: `colaborador_id` obrigatório, existente e com `status` ativo (`LOWER(TRIM(status)) = 'ativo'`). | `Colaborador #<id> não encontrado` / `Colaborador <nome> não está ativo` |
| RN-178.04 | **CA obrigatório e vigente**: material sem `ca_numero` → 400 `EPI <codigo> sem número de CA cadastrado`; `ca_validade` anterior ao dia de Brasília → 400 `O CA <numero> do EPI <codigo> venceu em <dd/mm/aaaa>`. Material que não é EPI → 400 `Material <codigo> não é EPI`. | — |
| RN-178.05 | **Assinatura obrigatória na mesma requisição HTTP** (multipart: imagem PNG ≤ 2 MB + campos). Sem imagem → 400 `A assinatura do colaborador é obrigatória`. | — |
| RN-178.06 | **Baixa de estoque**: `SAIDA` pelo motor (`registrarMovimentacao`, que já pega a trava do material), `documento_vinculado = <numero da entrega>` (`EPI-…`, gerado por `inserirComNumeroUnico`), `justificativa = 'Entrega de EPI a <nome> (<matricula>)'`. Saldo insuficiente → a recusa do motor. **Nenhuma saída sem evidência e nenhuma evidência apontando para entrega que não existe**: a ordem e o desfazer ficam no serviço (se a gravação da entrega falhar depois da saída, estorna a saída pelo motor). | — |
| RN-178.07 | **Evidência (genérica, reaproveitável pelo termo de ferramenta)**: tabela `evidencias_assinatura_almoxarifado` (`contexto`, `contexto_id`, `colaborador_id`, snapshot `colaborador_nome`/`matricula`/`cpf`, `arquivo`, `arquivo_sha256`, `registro_sha256`, `criado_por`, `criado_por_nome`, `criado_em` do servidor em UTC). `registro_sha256` = SHA-256 do JSON canônico (chaves ordenadas) dos campos da entrega + `arquivo_sha256` + `criado_em`. **Append-only no banco**: triggers `BEFORE UPDATE` e `BEFORE DELETE` com `RAISE(ABORT, 'evidencia de assinatura nao pode ser alterada')` nas duas tabelas (evidência e entrega). | UPDATE direto no SQLite → erro |
| RN-178.08 | **Verificação de integridade**: `GET /api/almoxarifado/epi/entregas/:id/verificar` relê o arquivo, recalcula os dois hashes e responde `{ integro: true }` ou `{ integro: false, motivo: 'arquivo alterado' | 'registro alterado' | 'arquivo ausente' }`. | trocar 1 byte do PNG → `arquivo alterado` |
| RN-178.09 | **Ficha de EPI por colaborador (recuperação)**: `GET /api/almoxarifado/epi/ficha/:colaborador_id` → colaborador (sem CPF completo — mascarado `***.***.***-NN`) + entregas (data, EPI, CA, validade do CA, quantidade, tamanho, motivo, quem entregou, URL da assinatura, `registro_sha256`). PDF no navegador (jsPDF, molde `posicaoClientePdf.js`, montador puro testável) com a imagem de cada assinatura e o hash. | — |
| RN-178.10 | **Lista de colaboradores para o almoxarifado**: `GET /api/almoxarifado/aux/colaboradores` → `id, nome, matricula, setor` dos **ativos** (sem CPF, sem salário), sob o portão do módulo almoxarifado. | — |
| RN-178.11 | Campos opcionais deduzidos: `tamanho` (texto ≤ 20), `motivo` (`PRIMEIRA_ENTREGA`, `TROCA`, `PERDA`, `DANO` — inválido → 400 `Motivo inválido`), `observacao` (≤ 500). | — |

## Contratos

- `POST /api/almoxarifado/epi/entregas` (multipart, `requirePermission('entregar_epi')`): campos `colaborador_id`,
  `material_id`, `quantidade` (> 0), `tamanho?`, `motivo?`, `observacao?`, arquivo `assinatura`. 201 →
  `{ id, numero, movimentacao_id, evidencia: { id, arquivo_url, arquivo_sha256, registro_sha256, criado_em } }`.
  Upload órfão limpo em toda saída ≠ 201 (molde `extended.js:1954-1975`).
- `GET /api/almoxarifado/epi/entregas?colaborador_id=&material_id=&de=&ate=` (leitura, portão do módulo).
- `GET /api/almoxarifado/epi/entregas/:id/verificar`, `GET /api/almoxarifado/epi/ficha/:colaborador_id`,
  `GET /api/almoxarifado/aux/colaboradores`.

## Tasks

| # | Task | Tipo |
|---|---|---|
| T1 | Schema (colunas do material, duas tabelas, triggers), ação `entregar_epi`, serviço `epiService.js` + `evidenciaAssinaturaService.js` (genérico), rotas, testes (incluindo trigger que barra UPDATE/DELETE, hash que acusa byte trocado, corrida de duas entregas do último item — a trava do motor decide). | tronco |
| T2 | Front: tela "Entrega de EPI" (colaborador da lista aux, EPI, quantidade, opcionais, `AssinaturaCanvas`), ficha por colaborador com PDF, campos CA/validade no cadastro de material. Mock só na fronteira HTTP. | galho (depois da T1) |
| T3 | Integração: cadastrar CA → entregar com assinatura → ficha → verificar íntegro → adulterar arquivo → verificar acusa. | integração |

## Fora do escopo (letra D)

- Termo de responsabilidade de ferramenta (RN-D) — reaproveitará `evidenciaAssinaturaService`.
- Validade de **uso**/data de troca do EPI e alerta de troca (depende do formulário da empresa).
- Proteção do arquivo da assinatura por login: continua a URL assinada de ~15 min do almoxarifado (mesma das demais
  imagens); a integridade é garantida pelo hash, não pelo sigilo da URL.
- Devolução de EPI.

## Próxima tarefa detalhada

*(preencher no fechamento)*
