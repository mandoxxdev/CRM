# Módulo Frotas — mapa de status

> **Status:** **Etapa 8 (administrador pela tela, destinos cadastrados, condutor do carro de funcionário, saída da GMP, abastecimento sem
> foto — features 19 a 22) entregue** na `main` em 2026-10-28 (`a8a8d885` a `d38f0a71`, mais o fechamento), depois da **Etapa 7 (pequena: o
> gestor remove uma foto pela lista, D14)** (`7bfcec6e`) e da
> **Etapa 6 (tratar a pendência do registro)** (commits `492a0d87` a `8fa7ece2`), da **Etapa 5 (foto da
> avaria e do cupom)** (`786d1ec5` a `ab234a44`), da **Etapa 4 (relatórios
> fechados)** (`99658314` a `bcb498a0`), da **Etapa 3 (km e
> horímetro confiáveis no portal)** (`64d85bf2` a `a7427207`), da
> **Etapa 2 (perfil Consulta/Motorista pela tela)** (`3aa4e088` a `805aaa3c`) e da **Etapa 1 (portal do motorista)** (`c638d201` a `4ba85d16`). O motorista loga e preenche saída, retorno, inspeção e abastecimento;
> o gestor recebe o alerta, exporta a planilha e dá **Consulta** a quem só acompanha, em **Frota → Perfis de acesso**. O módulo **ainda
> não foi usado em produção** (banco local: 0 veículos, 0 motoristas — medido em 2026-10-23 no levantamento).
> **Última atualização:** 2026-10-29 — fechamento da Etapa 9.
> **Onde parou / próximo:** **o módulo está pronto para uso.** Os cinco pedidos de 2026-10-28 estão entregues (features 19–22), e o
> endereço do destino + destino da lista na Viagem do gestor + endereço da GMP na origem (feature 23, Etapa 9, 2026-10-29). Os
> próximos passos dependem do André (dados dos 4 veículos; folha inteira do formulário; a tela antiga "Novo Checklist", C5) ou são
> pequenos (B36) — ver "Próximo passo" (B72) e a "Próxima tarefa detalhada" no plano da Etapa 9.
> **Documentação do módulo:** [`docs/frotas/README.md`](../../docs/frotas/README.md) (guia com roteiro de teste),
> [`docs/frotas/manual-do-sistema.md`](../../docs/frotas/manual-do-sistema.md) (manual de quem usa),
> [`docs/frotas/novidades-por-etapa.md`](../../docs/frotas/novidades-por-etapa.md) (apresentação, decisões B1..B60) e
> [`docs/frotas/referencia-tecnica.md`](../../docs/frotas/referencia-tecnica.md) (API, tabelas, perfis, regras de cálculo).

## Objetivo do desenvolvimento

Deixar o módulo **utilizável muito rápido** para o processo real da empresa:

- **Antes:** a empresa manda um **formulário** para o motorista → o motorista preenche → alguém
  **passa a limpo numa planilha de Excel** para centralizar.
- **Alvo:** o **motorista loga na aplicação e preenche lá**. A planilha deixa de ser digitada à mão:
  o que ela centraliza passa a sair do sistema (tela + exportação). **Atingido na Etapa 1**; desde a Etapa 2 quem só acompanha recebe **Consulta** pela tela.

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
| 03 | Abastecimentos | 🟢 | Etapa 1 (`80362b54`, `c8794fd7`): km/L pelo abastecimento **anterior em km**, `km desde o anterior`, recálculo do seguinte ao criar/editar/excluir (A1, A2); preço por litro refeito ao mudar litros/valor. Portal grava com o motorista do vínculo. Etapa 3 (`fc1328e0`, `fdfebf96`): km menor que o atual **pergunta** no portal (A8); máquina por horímetro grava em horas, fora do km/L. *Dizia: "Resta A8"; deixou de ser verdade.* *Dizia: "Falta o consumo da máquina em L/h (D9)"* — desde a Etapa 4 (`e841b13a`) a lista mostra o L/h; litros zero/negativos recusados (`bcb498a0`) |
| 04 | Manutenções | 🟢 | Preventiva/corretiva, oficina, custo, peças, próxima revisão por km e data; "em andamento" põe o veículo em manutenção. Campo opcional de nº de requisição do almoxarifado (só número, sem vínculo) |
| 05 | Viagens / utilização | 🟢 | Etapa 1 (`80362b54`, `45bf32de`, `c8794fd7`, `9007353e`): aprovar só solicitada (A4), km de retorno menor recusado (A5), retorno antes da saída recusado, uma em andamento por veículo e por motorista, origem, só o gestor aprova/cancela. Saída/retorno do portal abrem e fecham a viagem |
| 06 | Checklist diário | 🟢 | Etapa 1 (`4ed19f8b`, `80362b54`, `4ba85d16`): 12 itens do papel OK/N/A/Falha, avarias, km, horário, combustível, situação OK/PENDÊNCIA/INCOMPLETO; item ausente não vale mais OK (A3). A tela antiga do gestor segue com os 7 itens (B10) e continua sem editar |
| 07 | Multas | 🟢 | Valor, pontos, vencimento, status de pagamento, nº do auto. Desde a Etapa 1, só o gestor cria/altera. Desde a Etapa 4 (`bcb498a0`) o status só aceita pendente/pago/contestado, e a planilha tem a aba Multas |
| 08 | Documentos e seguros | 🟢 | IPVA, licenciamento, seguro, CRLV, rastreador; alerta N dias antes do vencimento. Desde a Etapa 1, só o gestor cria/altera; desde a Etapa 2 (`30ec5df3`), o motorista não lê a lista (C7) |
| 09 | Painel (dashboard) e alertas | 🟢 | 9 cartões, alertas de documento, CNH, revisão, multa, consumo anômalo e, desde a Etapa 1, **checklist com pendência**. Só gestor e Consulta veem. *Dizia "(7 dias)"; mudou na Etapa 6* (feature 18): o alerta fica até o gestor **tratar** a pendência (botão no próprio alerta), só de veículo ativo, a mais antiga primeiro |
| 10 | Relatórios | 🟢 | **Etapa 4** (`99658314`..`bcb498a0`) — [`10-relatorios/`](10-relatorios/README.md): multas pela data da infração (A7), contestada fora, o mesmo período (uma data ou duas) nas duas tabelas e na planilha, máquina com horas e **litros por hora**, linha Total que bate com a planilha, aba **Multas**. *Dizia: "Falta para 🟢: A7, a máquina no relatório e a aba de multas"; deixou de ser verdade.* Fica de fora: alerta de consumo baixo da máquina (D12) |
| 11 | Perfis e permissões | 🟢 | Etapa 1 (`6dd0b130`, `9007353e`): o motorista só vê e só altera o que é dele; painel/alertas, multas e documentos são do gestor; só o gestor aprova/cancela viagem (A6). **Etapa 2** (`30ec5df3`..`805aaa3c`) — [`15-perfis-pela-tela/`](15-perfis-pela-tela/README.md): **Consulta**/**Motorista** pela tela **Frota → Perfis de acesso**, Consulta só leitura nas telas de cadastro, escopo fechado para perfil fora da lista. *Dizia: "falta atribuir Consulta/Motorista pela tela"; deixou de ser verdade.* Fica de fora: trilha de auditoria (B26), lembrar o Consulta ao dar e tirar o administrador (C9). **Etapa 8** (feature 19): Administrador de Frota também pela tela |
| 12 | Solicitar material ao almoxarifado | 🟢 | Reaproveita a requisição de material do almoxarifado (`/frota/requisicoes-material`) |
| 13 | **Portal do motorista** (logar e preencher) | 🟢 | **Etapa 1** — [`13-portal-do-motorista/`](13-portal-do-motorista/README.md). `/frota/motorista`: Saída, Retorno, Inspeção, Abastecimento, Meus registros, celular primeiro. Fora: seção 3 do formulário, desenho das avarias. *Dizia também "foto"; deixou de ser verdade na Etapa 5* (feature 17) |
| 14 | Exportação / substituir a planilha | 🟢 | **Etapa 1** (`d2aaa72b`, `c8794fd7`): `GET /api/frotas/exportar.xlsx`, abas Cadastro Frota, Viagens e KM, Checklist, Abastecimentos, Manutenções, Documentos; **Etapa 4** (`e841b13a`): + aba Multas no fim. A aba Painel da planilha não é exportada (o painel está na tela) |
| 15 | **Perfil do Frota pela tela** | 🟢 | **Etapa 2** — [`15-perfis-pela-tela/`](15-perfis-pela-tela/README.md). `GET/PUT /api/frotas/perfis-usuario`, tela `/frota/perfis` (só o administrador da frota), aviso no cadastro do motorista. Etapa 3 (`b88778b5`): `role` "Admin" maiúsculo é administrador (E5) |
| 16 | **km e horímetro confiáveis no portal** | 🟢 | **Etapa 3** — [`16-km-e-horimetro/`](16-km-e-horimetro/README.md). Último km/horímetro na tela, 409 `KM_MENOR_QUE_ATUAL`/`HORIMETRO_MENOR_QUE_ATUAL` com **Confirmar mesmo assim**, máquina em horas (portal, gestor, planilha), alerta de revisão da máquina pelo horímetro. Fica de fora: a pergunta nas telas do gestor (B36), consumo L/h (D9) |
| 17 | **Foto da avaria e do cupom** | 🟢 | **Etapa 5** (`786d1ec5`..`ab234a44`) — [`17-fotos/`](17-fotos/README.md). **Tirar foto** (câmera do celular) na Saída/Retorno/Inspeção e no Abastecimento, até 3, reduzidas no celular; Meus registros com + Foto e Remover foto; coluna **Fotos** nas listas Checklist e Abastecimentos do gestor; arquivo só por URL assinada (2 h), no escopo de cada um; excluir o lançamento leva as fotos. Fecha **D1**. **Etapa 7** (`7bfcec6e`, 2026-10-28): o gestor remove uma foto pela coluna **Fotos** das duas listas (janela com todas as fotos; só o Administrador de Frota), fecha **D14**. *Dizia: "Fica de fora: o gestor remover foto pela lista (D14)"; deixou de ser verdade.* Fica de fora: foto por avaria (D15), saber quem removeu |
| 19 | **Administrador de Frota pela tela** | 🟢 | **Etapa 8** (`bd546050` servidor, `85e031e4` tela) — [`19-admin-pela-tela/`](19-admin-pela-tela/README.md). O seletor de **Perfis de acesso** ganha **Administrador de Frota** (com confirmação); por baixo escreve `frota` em `admin_modulos` (a mesma marca do cadastro de usuário — o sync do núcleo apagaria uma linha só de perfil). Superadmin e `role` admin continuam forçados. *A feature 15 dizia "ADMIN_FROTA não: vem do cadastro de usuário"; deixou de ser verdade.* Fica de fora: trilha de quem deu/tirou (B26) |
| 20 | **Abastecimento sem foto** | 🟢 | **Etapa 8** (`ef71a1b6`) — [`20-abastecimento-sem-foto/`](20-abastecimento-sem-foto/README.md). O formulário do portal perde **Foto do cupom** e Meus registros perde o **+ Foto** do abastecimento; servidor e coluna Fotos do gestor ficam para o legado (B77). *A feature 17 dizia "e no Abastecimento"; deixou de ser verdade* |
| 21 | **Saída: origem GMP, carro liberado para funcionários, condutor** | 🟢 | **Etapa 8** (`a8a8d885` esquema, `d38f0a71` servidor, `ef71a1b6` portal, `37380627` gestor) — [`21-saida-origem-gmp-e-condutor/`](21-saida-origem-gmp-e-condutor/README.md). `veiculos.uso_funcionarios`, `viagens.condutor_nome`; a saída do portal grava `origem 'GMP'`, mostra "Saindo de: GMP" e, no carro liberado, exige **Quem vai dirigir (condutor)** (400 antes do 409 de km menor); planilha Condutor = condutor ou motorista. Fica de fora: condutor como lista (B78: gestor opcional) |
| 22 | **Destinos cadastrados pelo portal** | 🟢 | **Etapa 8** (`a8a8d885` esquema, `d38f0a71` servidor, `ef71a1b6` portal, `37380627` gestor) — [`22-destinos-cadastrados/`](22-destinos-cadastrados/README.md). `frotas_destinos` (índice único parcial, exclusão lógica), `GET/POST/PUT/DELETE /destinos` (o motorista cria), seletor + **+ Novo destino** na Saída (201 seleciona; 409 seleciona o existente; desativado no meio → aviso), tela **Frota → Destinos** com "Mostrar: Todos". Fica de fora: acento na duplicidade. *Dizia também "destino na tela de Viagens do gestor (B79)" — desfeito na Etapa 9 (feature 23).* |
| 23 | **Endereço do destino e destino da lista na Viagem do gestor** | 🟢 | **Etapa 9** (`d7ba0b09` plano, `59b7e3a9` servidor, `97a92f56` tela, `c1781e4c` integração, `70e9aa76` Fase 5) — [`23-endereco-do-destino/`](23-endereco-do-destino/README.md). Destino com CEP (busca e preenche) ou à mão, obrigatórios rua/número/bairro/cidade/UF, nas três telas ("+" do portal, Destinos, Viagem do gestor); a Viagem do gestor escolhe da lista (desfaz B79); origem mostra o endereço da GMP de Configurações → Empresa. Fica de fora: mapa/distância, endereço na planilha, conferir CEP × cidade (B91) |
| 18 | **Tratar a pendência do registro** | 🟢 | **Etapa 6** (`492a0d87`..`8fa7ece2`) — [`18-tratar-pendencia/`](18-tratar-pendencia/README.md). **Tratar pendência** (o que foi feito + manutenção opcional) na lista Checklist e no alerta; o alerta sai na hora e não some mais sozinho; **PENDÊNCIA · tratada** na lista, no Meus registros e na planilha; **Desfazer tratamento**. Fica de fora: tratar por falha (D16), histórico (D17), aviso ao motorista (D18) |

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
| A6 | Motorista **lê** todos os cadastros e lançamentos e **edita** lançamento de qualquer um; usuário sem perfil vira MOTORISTA | `getPerfilFromUser({role:'usuario'})` = MOTORISTA | **Alta** | **corrigido em `6dd0b130` e `9007353e`** quanto a ler/editar. O fallback "sem perfil = MOTORISTA" **continua** (é intencional); desde a Etapa 2 o gestor dá Consulta pela tela |
| A7 | Relatório de custo por veículo filtra o período em manutenção e combustível, **não em multas** | leitura do SQL | Baixa | **corrigido em `e841b13a`** (Etapa 4): pela data da infração; sem ela, pelo dia do lançamento; contestada fora |
| A8 | km digitado menor que o atual é aceito sem aviso | km 900 aceito com veículo em 1800 | Média | **corrigido no portal em `fc1328e0`** (Etapa 3): 409 com confirmação; as telas do gestor seguem sem a pergunta (B36). O "Próximo passo" deste mapa dizia que A8 entraria na primeira etapa; **estava errado** — entrou na terceira |
| A9 | `server/tests/frotas.test.js` **não roda na suíte** | 6/6 fora do `npm run test:api` | Média | **corrigido em `4ed19f8b`** (movido para `tests/api/frotasServico.api.test.js`) |
| A10 | Veículo por **horímetro** nunca tem o horímetro atualizado por lançamento | `updateHorimetroVeiculoSeMaior` sem chamador | Média, se houver máquina por hora | **corrigido em `fc1328e0`** (Etapa 3): portal e telas do gestor gravam em horas; dados antigos: consulta A4 |

## Próximo passo

**O módulo está pronto para uso** (B72). O ciclo do motorista está fechado: registrar → foto → alerta → tratar → ele vê. A Etapa 6 (tratar a
pendência) está entregue: feature 18.

1. **Depende do André:** (a) as placas, modelos e km dos 4 veículos da planilha (V01, V02, V03, C01 — a planilha só tem o tipo) para o
   cadastro inicial — e agora também **quais são "liberados para funcionários"**; (b) a folha inteira do formulário (a imagem em
   `exemplo_formulario_motorista.jpeg` termina no título da seção 3) para a seção 3 "Transmissão e itens específicos"; (c) o consumo
   esperado da máquina em litros por hora, se quiser o alerta de consumo dela (D12); (d) a lista inicial de destinos, se quiser que já
   venha preenchida (senão o motorista cadastra na hora).
2. **Backlog pequeno** (independente, sem etapa própria): a pergunta do km menor nas telas do gestor (B36/D10); a tela antiga "Novo
   Checklist" com os 12 itens ou fora do menu (C5); o painel renovar o usuário de quem **deixa** de ser administrador (C22). O D14 saiu
   na Etapa 7; os cinco pedidos de 2026-10-28 saíram na Etapa 8.
3. Antes de apresentar: percorrer os roteiros do guia clicando (E2, E4, E9, E14, E16, E20, E23, **E25**) e rodar as consultas A1–A8 em
   produção.

## O que **não** está no escopo (decidido no levantamento)

- `client/src/components/VeiculosManutencao.js` — tela-rascunho antiga ("Tela do cadastro ainda está
  em modo inicial"), registrada em `lazyModules.js` mas **sem rota**. Não é o módulo de frota.
- `src/pages/Veiculos.tsx` e `src/utils/services/veiculoService.ts` — pertencem ao app `src/` da raiz
  (outro front, TypeScript, não é o `client/` que roda com `npm run dev`). Não usados pelo módulo.
