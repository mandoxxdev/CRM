# Módulo Frotas — mapa de status

> **Status:** **Etapa 1 (portal do motorista) entregue** na `main` (commits `c638d201` a `4ba85d16`). O motorista loga e preenche
> saída, retorno, inspeção e abastecimento; o gestor recebe o alerta e exporta a planilha. O módulo **ainda não foi usado em
> produção** (banco local: 0 veículos, 0 motoristas — medido em 2026-10-23 no levantamento).
> **Última atualização:** 2026-10-23 — fechamento da Etapa 1.
> **Onde parou / próximo:** Etapa 2 — perfil Consulta/Motorista pela tela (ver "Próximo passo").
> **Documentação do módulo:** [`docs/frotas/README.md`](../../docs/frotas/README.md) (guia com roteiro de teste),
> [`docs/frotas/manual-do-sistema.md`](../../docs/frotas/manual-do-sistema.md) (manual de quem usa),
> [`docs/frotas/novidades-por-etapa.md`](../../docs/frotas/novidades-por-etapa.md) (apresentação, decisões B1..B24) e
> [`docs/frotas/referencia-tecnica.md`](../../docs/frotas/referencia-tecnica.md) (API, tabelas, perfis, regras de cálculo).

## Objetivo do desenvolvimento

Deixar o módulo **utilizável muito rápido** para o processo real da empresa:

- **Antes:** a empresa manda um **formulário** para o motorista → o motorista preenche → alguém
  **passa a limpo numa planilha de Excel** para centralizar.
- **Alvo:** o **motorista loga na aplicação e preenche lá**. A planilha deixa de ser digitada à mão:
  o que ela centraliza passa a sair do sistema (tela + exportação). **Atingido na Etapa 1** (falta o perfil pela tela, Etapa 2).

O formulário e a planilha ficam em [`00-processo-atual/`](00-processo-atual/README.md) — **são a fonte de verdade dos campos**.

## Legenda

🟢 funciona e serve ao processo · 🟡 funciona, mas tem buraco que atrapalha o uso real ·
🔴 não existe

## Mapa

| # | Feature | Status | Resumo |
|---|---|---|---|
| 00 | Processo atual (formulário + Excel) | — | Recebidos e lidos em 2026-10-23. **A imagem do formulário está cortada** na seção 3 — pendente a folha inteira |
| 01 | Cadastro de veículos | 🟢 | CRUD completo, placa única normalizada, tipo, km **ou** horímetro, setor, centro de custo, condutor responsável. Exclusão é lógica |
| 02 | Cadastro de motoristas | 🟢 | Etapa 1 (`6dd0b130`, `9007353e`, `e4183f70`): campo **Usuário de acesso (portal do motorista)**, um motorista ativo por usuário (conferência + índice único), desvincular com "— nenhum —", usuário desativado aparece "(inativo)". *Dizia: "não liga o motorista ao usuário que loga"; deixou de ser verdade* |
| 03 | Abastecimentos | 🟢 | Etapa 1 (`80362b54`, `c8794fd7`): km/L pelo abastecimento **anterior em km**, `km desde o anterior`, recálculo do seguinte ao criar/editar/excluir (A1, A2); preço por litro refeito ao mudar litros/valor. Portal grava com o motorista do vínculo. Resta **A8** (km menor que o atual passa calado) — não impede o uso |
| 04 | Manutenções | 🟢 | Preventiva/corretiva, oficina, custo, peças, próxima revisão por km e data; "em andamento" põe o veículo em manutenção. Campo opcional de nº de requisição do almoxarifado (só número, sem vínculo) |
| 05 | Viagens / utilização | 🟢 | Etapa 1 (`80362b54`, `45bf32de`, `c8794fd7`, `9007353e`): aprovar só solicitada (A4), km de retorno menor recusado (A5), retorno antes da saída recusado, uma em andamento por veículo e por motorista, origem, só o gestor aprova/cancela. Saída/retorno do portal abrem e fecham a viagem |
| 06 | Checklist diário | 🟢 | Etapa 1 (`4ed19f8b`, `80362b54`, `4ba85d16`): 12 itens do papel OK/N/A/Falha, avarias, km, horário, combustível, situação OK/PENDÊNCIA/INCOMPLETO; item ausente não vale mais OK (A3). A tela antiga do gestor segue com os 7 itens (B10) e continua sem editar |
| 07 | Multas | 🟢 | Valor, pontos, vencimento, status de pagamento, nº do auto. Desde a Etapa 1, só o gestor cria/altera |
| 08 | Documentos e seguros | 🟢 | IPVA, licenciamento, seguro, CRLV, rastreador; alerta N dias antes do vencimento. Desde a Etapa 1, só o gestor cria/altera |
| 09 | Painel (dashboard) e alertas | 🟢 | 9 cartões, alertas de documento, CNH, revisão, multa, consumo anômalo e, desde a Etapa 1, **checklist com pendência** (7 dias). Só gestor e Consulta veem |
| 10 | Relatórios | 🟡 | Etapa 1 (`d2aaa72b`, `82449c5f`): **Exportar planilha** com o período da tela. **Falta para 🟢:** multas filtrarem pelo período no custo por veículo (**A7**) |
| 11 | Perfis e permissões | 🟡 | Etapa 1 (`6dd0b130`, `9007353e`): o motorista só vê e só altera o que é dele; painel/alertas, multas e documentos são do gestor; só o gestor aprova/cancela viagem (A6). **Falta para 🟢:** atribuir **Consulta**/**Motorista** pela tela — hoje só o administrador se atribui, e todo o resto vira Motorista (Etapa 2) |
| 12 | Solicitar material ao almoxarifado | 🟢 | Reaproveita a requisição de material do almoxarifado (`/frota/requisicoes-material`) |
| 13 | **Portal do motorista** (logar e preencher) | 🟢 | **Etapa 1** — [`13-portal-do-motorista/`](13-portal-do-motorista/README.md). `/frota/motorista`: Saída, Retorno, Inspeção, Abastecimento, Meus registros, celular primeiro. Fora: seção 3 do formulário, foto, desenho das avarias |
| 14 | Exportação / substituir a planilha | 🟢 | **Etapa 1** (`d2aaa72b`, `c8794fd7`): `GET /api/frotas/exportar.xlsx`, abas Cadastro Frota, Viagens e KM, Checklist, Abastecimentos, Manutenções, Documentos. A aba Painel da planilha não é exportada (o painel está na tela) |

## Achados medidos (sonda executada em 2026-10-23, banco em memória com o `initSchema` real)

Cada um foi **rodado**, não deduzido da leitura. Script da sonda descrito em
[`docs/frotas/referencia-tecnica.md`](../../docs/frotas/referencia-tecnica.md#achados).

| Id | Achado | Resultado medido | Gravidade para o objetivo | Estado |
|---|---|---|---|---|
| A1 | Editar um abastecimento (até só a observação) **apaga o km/L** dele | 2º abastecimento: km/L 10 → `null` depois de editar a observação | Alta | **corrigido em `80362b54`** |
| A2 | Abastecimento lançado **fora de ordem** não tem km/L e não recalcula os vizinhos | Retroativo com km 500: `null` | Alta | **corrigido em `80362b54`** |
| A3 | Checklist sem os itens no corpo é **aprovado** (item ausente = OK) | `aprovado = 1` sem nenhum item enviado | Média | **corrigido em `80362b54`** (régua em `4ed19f8b`; avaria na rota antiga em `4ba85d16`) |
| A4 | "Aprovar" funciona em **qualquer status** | `concluida` → `aprovada` | Média | **corrigido em `80362b54`** |
| A5 | km de retorno menor que o de saída grava km rodado **negativo** | `km_rodado = -200` | Média | **corrigido em `80362b54`** |
| A6 | Motorista **lê** todos os cadastros e lançamentos e **edita** lançamento de qualquer um; usuário sem perfil vira MOTORISTA | `getPerfilFromUser({role:'usuario'})` = MOTORISTA | **Alta** | **corrigido em `6dd0b130` e `9007353e`** quanto a ler/editar. O fallback "sem perfil = MOTORISTA" **continua** (é intencional), e sem tela para dar Consulta isso tira o painel de quem só acompanha — Etapa 2 |
| A7 | Relatório de custo por veículo filtra o período em manutenção e combustível, **não em multas** | leitura do SQL | Baixa | **aberto** |
| A8 | km digitado menor que o atual é aceito sem aviso | km 900 aceito com veículo em 1800 | Média | **aberto**. O "Próximo passo" deste mapa dizia que A8 entraria na primeira etapa; **estava errado** — o plano revisado não o incluiu (B23). Com o km/L pela ordem do km, o consumo não some mais, mas o km errado entra na conta |
| A9 | `server/tests/frotas.test.js` **não roda na suíte** | 6/6 fora do `npm run test:api` | Média | **corrigido em `4ed19f8b`** (movido para `tests/api/frotasServico.api.test.js`) |
| A10 | Veículo por **horímetro** nunca tem o horímetro atualizado por lançamento | `updateHorimetroVeiculoSeMaior` sem chamador | Média, se houver máquina por hora | **aberto**. Agravado no portal: ele pede "KM atual" e grava no km do veículo, também para máquina por horímetro |

## Próximo passo

1. **Etapa 2 — perfil do Frota pela tela** (Administrador de Frota / Consulta / Motorista na tela de usuários). Contrato e pontos de
   atenção: "Próxima tarefa detalhada" no fim do
   [plano da Etapa 1](../../docs/superpowers/plans/2026-10-23-frotas-etapa1-portal-do-motorista.md).
2. Depois, por valor: seção 3 do formulário (quando chegar a folha inteira), foto da avaria/cupom, A10, A8, A7.
3. **André:** mandar a folha inteira do formulário (a imagem em `exemplo_formulario_motorista.jpeg` termina no título da seção 3).

## O que **não** está no escopo (decidido no levantamento)

- `client/src/components/VeiculosManutencao.js` — tela-rascunho antiga ("Tela do cadastro ainda está
  em modo inicial"), registrada em `lazyModules.js` mas **sem rota**. Não é o módulo de frota.
- `src/pages/Veiculos.tsx` e `src/utils/services/veiculoService.ts` — pertencem ao app `src/` da raiz
  (outro front, TypeScript, não é o `client/` que roda com `npm run dev`). Não usados pelo módulo.
