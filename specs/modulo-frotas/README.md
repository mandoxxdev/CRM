# Módulo Frotas — mapa de status

> **Status:** módulo **existe e roda**, mas **nunca foi usado** (banco local: 0 veículos, 0 motoristas,
> 0 registros em todas as tabelas — medido em 2026-10-23). Nenhuma etapa de desenvolvimento ainda.
> **Última atualização:** 2026-10-23 — levantamento inicial (o que existe, o que funciona, o que falta).
> **Documentação do módulo:** [`docs/frotas/README.md`](../../docs/frotas/README.md) (guia em
> linguagem de usuário) e [`docs/frotas/referencia-tecnica.md`](../../docs/frotas/referencia-tecnica.md)
> (API, tabelas, perfis, regras de cálculo).

## Objetivo do desenvolvimento

Deixar o módulo **utilizável muito rápido** para o processo real da empresa:

- **Hoje:** a empresa manda um **formulário** para o motorista → o motorista preenche → alguém
  **passa a limpo numa planilha de Excel** para centralizar.
- **Alvo:** o **motorista loga na aplicação e preenche lá**. A planilha deixa de ser digitada à mão:
  o que ela centraliza passa a sair do sistema (tela + exportação).

O formulário e a planilha de hoje ficam em [`00-processo-atual/`](00-processo-atual/README.md) —
**são a fonte de verdade dos campos**. Nada do "portal do motorista" deve ser desenhado antes de
lê-los: os campos do formulário real decidem o que a tela pede, não os campos que o código já tem.

## Legenda

🟢 funciona e serve ao processo · 🟡 funciona, mas tem buraco que atrapalha o uso real ·
🔴 não existe

## Mapa

| # | Feature | Status | Resumo |
|---|---|---|---|
| 00 | Processo atual (formulário + Excel) | — | Aguardando os arquivos do André em `00-processo-atual/` |
| 01 | Cadastro de veículos | 🟢 | CRUD completo, placa única normalizada, tipo, km **ou** horímetro, setor, centro de custo, condutor responsável. Exclusão é lógica |
| 02 | Cadastro de motoristas | 🟡 | CRUD com CNH, categoria, validade e telefone com máscara. **Não liga o motorista ao usuário que loga** (a coluna `usuario_id` existe, a tela não preenche) |
| 03 | Abastecimentos | 🟡 | Registra litros, valor, km, posto; atualiza o km do veículo e calcula km/L. **Cálculo de km/L erra** em edição e em lançamento fora de ordem (ver achados A1, A2) |
| 04 | Manutenções | 🟢 | Preventiva/corretiva, oficina, custo, peças, próxima revisão por km e data; "em andamento" põe o veículo em manutenção. Campo opcional de nº de requisição do almoxarifado (só número, sem vínculo) |
| 05 | Viagens / utilização | 🟡 | Saída/retorno, km, destino, finalidade, aprovação. **Aprova em qualquer status** e aceita km de retorno menor que o de saída (A4, A5) |
| 06 | Checklist diário | 🟡 | 7 itens (pneus, óleo, luzes, freios, extintor, documentos, limpeza), reprova se algum falhar. **Item não enviado conta como OK** (A3). Não edita |
| 07 | Multas | 🟢 | Valor, pontos, vencimento, status de pagamento, nº do auto |
| 08 | Documentos e seguros | 🟢 | IPVA, licenciamento, seguro, CRLV, rastreador; alerta N dias antes do vencimento |
| 09 | Painel (dashboard) e alertas | 🟢 | 9 cartões, alertas de documento, CNH, revisão, multa e consumo anômalo; datas no dia de Brasília (Etapa 164) |
| 10 | Relatórios | 🟡 | Custo por veículo (com período) e consumo médio. **Multas ignoram o período** (A7). Sem exportação para Excel |
| 11 | Perfis e permissões | 🟡 | ADMIN_FROTA / MOTORISTA / CONSULTA no servidor. **Só o administrador se atribui pela tela**; todo o resto vira MOTORISTA. **Motorista lê tudo** (CPF/CNH dos colegas, custos) e **edita lançamentos de qualquer um** (A6) |
| 12 | Solicitar material ao almoxarifado | 🟢 | Reaproveita a requisição de material do almoxarifado (`/frota/requisicoes-material`) |
| 13 | **Portal do motorista** (logar e preencher) | 🔴 | É o objetivo. Hoje o motorista cai nas mesmas telas do gestor (tabelas com todos os dados, menu inteiro). Não existe "meus lançamentos", nem tela simples para celular, nem vínculo usuário↔motorista |
| 14 | Exportação / substituir a planilha | 🔴 | Nenhuma tela de frota exporta. A planilha centralizadora não tem substituto ainda |

## Achados medidos (sonda executada em 2026-10-23, banco em memória com o `initSchema` real)

Cada um foi **rodado**, não deduzido da leitura. Script da sonda descrito em
[`docs/frotas/referencia-tecnica.md`](../../docs/frotas/referencia-tecnica.md#achados).

| Id | Achado | Resultado medido | Gravidade para o objetivo |
|---|---|---|---|
| A1 | Editar um abastecimento (até só a observação) **apaga o km/L** dele | 2º abastecimento: km/L 10 → `null` depois de editar a observação | Alta — o motorista corrige um erro e o consumo some |
| A2 | Abastecimento lançado **fora de ordem** (data anterior) não tem km/L e não recalcula os vizinhos; o "anterior" é o último por data, não o anterior ao km lançado | Retroativo com km 500: `null` | Alta — motorista que lança no fim do dia/semana cai aqui |
| A3 | Checklist sem os itens no corpo é **aprovado** (item ausente = OK) | `aprovado = 1` sem nenhum item enviado | Média — a tela manda os 7, a API não exige |
| A4 | "Aprovar" funciona em **qualquer status** (até viagem concluída volta a "aprovada") | `concluida` → `aprovada` | Média |
| A5 | km de retorno menor que o de saída grava km rodado **negativo** | `km_rodado = -200` | Média |
| A6 | Motorista **lê** todos os cadastros e lançamentos e **edita** (`PUT`) lançamento de qualquer um; usuário sem perfil vira MOTORISTA | `getPerfilFromUser({role:'usuario'})` = MOTORISTA, `can(…,'registrar_operacoes')` = true | **Alta** — com o motorista logado, ele vê CPF/CNH dos colegas e mexe no lançamento alheio |
| A7 | Relatório de custo por veículo filtra o período em manutenção e combustível, **não em multas** | leitura do SQL (`relatorioCustosPorVeiculo`) | Baixa |
| A8 | km digitado menor que o atual é aceito sem aviso (o veículo mantém o maior, o lançamento fica com o menor) | km 900 aceito com veículo em 1800 | Média — erro de digitação passa calado |
| A10 | Veículo medido por **horímetro** (empilhadeira, trator) nunca tem o horímetro atualizado por lançamento: `updateHorimetroVeiculoSeMaior` existe e ninguém a chama | `grep` — só a definição, `frotasService.js:58` | Média, se a frota tiver máquina por hora |
| A9 | `server/tests/frotas.test.js` (6 testes, passam) **não roda na suíte**: o runner só descobre `tests/api/*.api.test.js` | `node tests/frotas.test.js` → 6/6, mas fora do `npm run test:api` | Média — regressão no frota passa verde |

## Próximo passo

1. **André:** colocar o formulário e a planilha em [`00-processo-atual/`](00-processo-atual/README.md).
2. Com eles em mãos: comparar campo a campo (formulário × o que o banco já tem), e escrever a
   feature **13 — Portal do motorista** (tela simples, celular primeiro, só os lançamentos dele) e a
   **14 — Exportação** no formato da planilha. Os achados A1, A2, A6 e A8 entram na primeira etapa,
   porque o portal os expõe no primeiro dia.

## O que **não** está no escopo (decidido no levantamento)

- `client/src/components/VeiculosManutencao.js` — tela-rascunho antiga ("Tela do cadastro ainda está
  em modo inicial"), registrada em `lazyModules.js` mas **sem rota**. Não é o módulo de frota.
- `src/pages/Veiculos.tsx` e `src/utils/services/veiculoService.ts` — pertencem ao app `src/` da raiz
  (outro front, TypeScript, não é o `client/` que roda com `npm run dev`). Não usados pelo módulo.
