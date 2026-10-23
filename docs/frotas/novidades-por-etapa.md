# Frota — novidades por etapa

> Documento de apresentação do desenvolvimento do módulo Frota: o que cada etapa mudou, com o cenário exato para mostrar ao vivo.
> Para quem **usa** o sistema (sem número de etapa nem histórico), o documento é o
> [`manual-do-sistema.md`](manual-do-sistema.md). Guia com roteiro de teste: [`README.md`](README.md).
>
> **Onde estamos:** **Etapa 1 (portal do motorista) entregue** em 2026-10-23, na `main` (último commit da etapa: `4ba85d16`).
> Próxima: **Etapa 2 — dar o perfil Consulta/Motorista pela tela** (plano: ver "Onde estamos e o que vem a seguir", no fim).

## ⚠️ Leia antes de apresentar

### A — consultas para rodar em produção ANTES do deploy

O módulo nunca foi usado (o banco local tem 0 linhas em todas as tabelas de frota). Se o de produção também estiver vazio, as duas
consultas abaixo voltam vazias e não há nada a fazer. Rode mesmo assim: custa um minuto.

**A1 — usuário ligado a dois motoristas ativos.**

```sql
SELECT usuario_id, COUNT(*) FROM frotas_motoristas
WHERE ativo = 1 AND usuario_id IS NOT NULL
GROUP BY usuario_id HAVING COUNT(*) > 1;
```

- **Nenhuma linha (o esperado):** nada a fazer. No primeiro boot depois do deploy o sistema cria a trava do banco que impede o mesmo
  usuário em dois motoristas.
- **Alguma linha:** o sistema sobe normalmente, mas **sem** essa trava (ele escreve no log *"Frotas: indice unico do vinculo
  usuario-motorista nao criado"* e segue — B21). O portal usa o motorista de **menor número** daquele usuário. Para arrumar: em
  **Frota → Motoristas**, abra os motoristas desse usuário e, em todos menos um, troque **Usuário de acesso (portal do motorista)**
  para **— nenhum —**. Depois **reinicie o servidor**: a trava nasce no boot.

**A2 — viagens "em andamento" em dobro (mesmo veículo ou mesmo motorista).**

```sql
SELECT 'veiculo' AS por, veiculo_id AS id, COUNT(*) FROM frotas_viagens
WHERE status = 'em_andamento' GROUP BY veiculo_id HAVING COUNT(*) > 1
UNION ALL
SELECT 'motorista', motorista_id, COUNT(*) FROM frotas_viagens
WHERE status = 'em_andamento' AND motorista_id IS NOT NULL GROUP BY motorista_id HAVING COUNT(*) > 1;
```

- **Nenhuma linha (o esperado):** nada a fazer.
- **Alguma linha:** a regra nova "uma viagem em andamento por veículo e por motorista" vale para os gestos **novos**; as duplicadas
  antigas ficam. Efeito: o **Retorno** do portal fecha a **mais nova** do motorista, e o gestor que tentar salvar uma delas mantendo
  "em andamento" recebe *"Este veículo já está em uso (saída sem retorno)."*. Para arrumar: em **Frota → Viagens**, edite a mais antiga,
  ponha o **KM retorno** e o status **concluida** e salve (mudar para concluída não passa por essa conferência).

### B — decisões tomadas sem consulta (todas reversíveis). O André arbitra lendo aqui.

| # | Etapa | Escolhido | Descartado | Por quê |
|---|---|---|---|---|
| B1 | F1 | Registro de saída/retorno/inspeção **reaproveita** a tabela `frotas_checklists` (colunas novas) | tabela nova `frotas_registros_uso` | a tela de Checklist do gestor, o painel ("checklists hoje") e o relatório continuam lendo o mesmo lugar; desfazer é só parar de usar as colunas |
| B2 | F1 | Os **12 itens do papel** substituem os 7 antigos na tela do motorista; os 7 legados continuam gravados por mapeamento | manter os 7 | o formulário real é a fonte de verdade; a seção 3 (imagem cortada) entra quando chegar a página inteira |
| B3 | F1 | Saída com Falha **abre a viagem mesmo assim** e vira alerta "alto" no painel do gestor | bloquear a saída | "não libere veículo inseguro" é decisão do gestor; travar no sistema pararia trabalho por item leve (ex.: limpeza). Mudar é uma linha |
| B4 | F1 | Viagem do portal nasce **em andamento**, sem aprovação | exigir aprovação | a planilha não tem aprovação; a aba Instruções diz que o gestor aprova **despesas**, não saídas |
| B5 | F1 | Mapa de avarias como **lista** (vista + R/A/T/Q/O + descrição) | desenho clicável | utilizável já; o desenho pode vir depois sobre os mesmos dados |
| B6 | F1 | Motorista **não** vê painel/custos, nem lança multa e documento | deixar como estava | A6: com o motorista logado, ele veria CPF/CNH dos colegas e os custos |
| B7 | F1 | Identificação do veículo pela **placa** | apelido V01/C01 | a placa já é única; apelido é um campo a mais, fácil de pôr depois |
| B8 | F1 | Saída **consome** uma viagem já `aprovada` do mesmo veículo e motorista (vira "em andamento") | criar outra viagem ao lado | duas viagens abertas para o mesmo carro deixariam o retorno sem saber qual fechar |
| B9 | F1 | Saída com veículo **em manutenção** é recusada (inspeção e retorno passam) | aceitar | "não libere veículo inseguro"; o gestor tira o status de manutenção quando liberar |
| B10 | F1 | Checklist da tela antiga do gestor continua, com a régua dos 7 itens (algum "não" = PENDÊNCIA) | tirar o "Novo Checklist" do gestor | não quebra quem já usa; o portal é o caminho novo |
| B11 | F1 | Na planilha exportada, datas saem como **texto `AAAA-MM-DD`** (o que o banco guarda) | célula de data do Excel | evita o Excel trocar dia/mês e o fuso; trocar por data de verdade é uma linha por coluna |
| B12 | F1 | Na aba Viagens e KM, **Saída** = só a hora (o dia está em Data); **Retorno** = a hora, ou dia e hora se voltou em outro dia | data e hora completas nas duas | a planilha deles tem Data numa coluna e Saída/Retorno em outra; repetir o dia poluía |
| B13 | F1 | "Uma viagem em andamento por veículo e por motorista" garantida por uma **fila em memória** (`filaDeViagens.js`) nas rotas que abrem/fecham viagem | índice único parcial no banco | o índice falharia na migração se já houver viagens em dobro no banco de produção; a fila é a mesma premissa de um processo do almoxarifado (C132). Ver **C1** |
| B14 | F1 | Na tela antiga do gestor, item **não enviado** fica gravado **vazio** (nulo), não "OK" | gravar 1 como antes | A3: o vazio é o que o registro diz de verdade; a tela do gestor manda os 7, então nada muda para quem usa |
| B15 | F1 | O portal aceita km e litros como **texto numérico** (`"1050"`) além de número | só número | o celular manda o que o campo tem; recusar "1050" seria erro só de formato |
| B16 | F1 | Na lista de veículos do portal, os **em manutenção aparecem** (com o status), para inspeção; só a saída é recusada | esconder | o motorista pode precisar inspecionar o carro na oficina; a tela mostra o status |
| B17 | F1 (Fase 5) | RN-F1.20 no `PUT /viagens`: só barra a **troca** para aprovada/cancelada; mandar o **mesmo** status passa | barrar qualquer `status: 'aprovada'` vindo do motorista | o formulário do gestor manda o objeto inteiro: o motorista editando a própria viagem já aprovada mandaria `aprovada` e levaria 403 sem ter mudado nada. Chamada interna sem usuário também passa |
| B18 | F1 (Fase 5) | Retorno antes da saída também recusado no **`POST /viagens`** (além do portal e do `PUT`); se uma das datas não tem hora, compara só o dia; no `PUT`, data `null` no corpo **não** apaga a gravada (como antes) | só portal e `PUT`; `null` apagando a data | a mesma régua nos três lugares; o front manda `null` em campo vazio, então `null` apagar a data mudaria o que já funcionava |
| B19 | F1 (Fase 5) | `/usuarios-vinculaveis` devolve também o usuário **desativado** que segue ligado, com `ativo: false` (os demais `ativo: true`); a tela mostra ele **só** no form do motorista que o tem, com "(inativo)" | resposta sem mudança e o front buscar o usuário à parte | campo novo e aditivo; sem ele o select escondia um vínculo que existe e o salvar quebrava |
| B20 | F1 (Fase 5) | "Data no futuro" olha só o **dia** (hoje de Brasília); horário adiante no mesmo dia passa | recusar também hora futura | o achado era o alerta preso por semanas (dia); celular com relógio alguns minutos adiantado não deve travar o registro |
| B21 | F1 (Fase 5) | Índice único do vínculo usuário-motorista: se o banco já tem duplicata, o boot **loga e segue** sem o índice | derrubar o boot / apagar a duplicata | não parar o sistema; a conferência do serviço continua valendo para os gestos novos. Refazer o vínculo duplicado e reiniciar cria o índice (ver **A1**) |
| B22 | F1 (fechamento) | Na rota antiga do gestor (os 7 itens sim/não), **avaria conta** para a situação: com avaria o registro sai **PENDÊNCIA** e vira alerta. Corrigido em `4ba85d16` | deixar como estava (com os 7 OK e uma avaria, saía OK e sem alerta) | o fix-round da Fase 5 tinha registrado a falha e deixado sem mudar; no fechamento ela foi corrigida, porque contradizia a RN-F1.02 e a planilha (a coluna Avarias é um item "Não conforme"). Hoje a tela antiga não tem campo de avaria, então só chega por API |
| B23 | F1 (fechamento) | **A8 (km menor que o atual passa calado) ficou fora** da Etapa 1 | incluir na etapa | o mapa do levantamento dizia que A8 entraria na primeira etapa; o plano revisado não o incluiu. Com o km/L agora contado pela **ordem do km** (A1/A2), um km digitado errado não apaga mais o consumo, mas ainda é aceito sem aviso e entra na conta. Fica aberto (ver **C6**) |
| B24 | F1 (fechamento) | **Próxima etapa = dar o perfil Consulta/Motorista pela tela** | começar por foto da avaria, seção 3 do formulário, horímetro (A10) ou multa no período (A7) | é o que trava o uso real no primeiro dia: hoje todo não-administrador com acesso ao Frota vira Motorista (ver **C2**), então quem só acompanha (financeiro, diretoria) perde o painel. A seção 3 depende de receber a folha inteira; foto e horímetro são melhoria, não bloqueio |

### C — furos conhecidos em operação

- **C1 — "uma viagem em andamento por veículo" vale para um servidor só.** A regra é garantida por uma fila em memória (B13). Com o
  sistema rodando em **um** processo (como hoje), duas saídas simultâneas do mesmo carro não passam. Se um dia o servidor rodar em
  vários processos ao mesmo tempo, duas saídas no mesmo segundo podem abrir duas viagens. Mesma premissa da trava do almoxarifado.
- **C2 — ninguém recebe o perfil Consulta ou Motorista pela tela.** A tela de usuários só sabe tornar alguém **Administrador de Frota**.
  Todo mundo que tem acesso ao módulo Frota e não é administrador **vira Motorista automaticamente**. Consequência no primeiro dia:
  uma pessoa do escritório que só acompanha a frota (e não é administradora) abre **Frota**, é levada para **Meu painel** e vê
  *"Seu usuário não está ligado a um motorista. Peça ao gestor da frota para fazer o vínculo."* — sem painel, sem relatório. Saídas
  até a Etapa 2: (a) torná-la administradora do módulo Frota na tela de usuários (ela passa a poder **tudo**, inclusive excluir); ou
  (b) gravar o perfil direto no banco: `INSERT OR REPLACE INTO perfil_frota_usuario (usuario_id, perfil) VALUES (<id do usuário>, 'CONSULTA');`
  (ela passa a ver painel e relatório, sem lançar nada). É a Etapa 2.
- **C3 — a seção 3 do formulário de papel ("Transmissão e itens específicos") não existe no sistema.** A imagem recebida está cortada
  no título dessa seção. O motorista que precisar registrar algo dela usa **Observações**.
- **C4 — viagem esquecida aberta trava o carro.** Se o motorista não registra o **Retorno**, o carro some da lista da **Saída** de todos
  (e quem tentar recebe *"Este veículo já está em uso (saída sem retorno)."*), e o motorista não consegue sair com outro carro
  (*"Você já tem uma saída sem retorno. Registre o retorno primeiro."*). O gestor resolve em **Frota → Viagens**: editar a viagem,
  pôr **KM retorno**, status **concluida**, salvar.
- **C5 — a tela antiga "Novo Checklist" do gestor continua com os 7 itens sim/não e sem avarias.** Ela grava, aparece na lista e na
  planilha (com os 5 itens que têm par no papel), mas não tem os 12 itens nem avarias. O caminho completo é o portal.
- **C6 — km menor que o atual ainda passa calado (A8, aberto).** No abastecimento e no registro, digitar 900 com o carro em 1.800 é
  aceito sem aviso. O carro mantém o maior km; o lançamento fica com o menor e entra no cálculo do km/L pela ordem do km (o consumo
  dele e o do vizinho saem distorcidos).
- **C7 — o motorista ainda lê a lista de Documentos se digitar o endereço.** O menu dele não mostra **Documentos**, mas quem abrir
  `/frota/documentos` à mão vê os documentos de todos os veículos, com valor. Veículos também são legíveis (sem dado pessoal). As
  outras listas (abastecimentos, viagens, checklists, multas, manutenções, motoristas) só trazem o que é dele.
- **C8 — avisos com gênero trocado (corrigido no fechamento).** O portal mostrava *"Retorno registrada"*; agora mostra *"Retorno registrado"* (*"Saída registrada"* e *"Inspeção registrada"* não mudam).

### D — limitações declaradas (cortes de escopo)

- **D1 — sem foto nem anexo.** Nem da avaria, nem do cupom do abastecimento.
- **D2 — mapa de avarias é lista, não desenho** (B5): o motorista escolhe *onde* (lado esquerdo, lado direito, em cima, frente,
  traseira), *o que é* (risco, amassado, trinca, quebrado, outro) e uma descrição opcional.
- **D3 — A7: o relatório de custo por veículo não filtra multas pelo período** (manutenção e combustível filtram). A planilha exportada
  não tem aba de multas.
- **D4 — A10: máquina por horímetro.** O portal pede "KM atual" para qualquer veículo e grava como km. Numa empilhadeira, o número do
  horímetro digitado ali vai para o **km** do veículo; o horímetro do cadastro nunca é atualizado por lançamento.
- **D5 — sem apelido V01/C01** (B7): o veículo é identificado pela placa.
- **D6 — o motorista não corrige nem apaga o que lançou pelo portal.** "Meus registros" é só leitura; correção é com o gestor, nas telas
  de cadastro.

### E — verificações não executadas e regras não confirmadas

- **E1 — o rodapé fixo do formulário (botões Voltar/Salvar e "Faltam N de 12 itens") não foi conferido num celular de verdade.** Ele está
  marcado para ficar grudado no fim da tela ao rolar; os testes automáticos não medem isso.
- **E2 — o teste manual no navegador não foi feito por quem escreveu este fechamento.** O roteiro do guia
  ([`README.md`](README.md#roteiro-de-teste-manual-portal-do-motorista)) foi escrito lendo o código e as mensagens literais; ninguém o
  percorreu clicando. Faça antes de apresentar.
- **E3 — no fechamento rodaram só os testes do Frota**: servidor, 9 arquivos `frotas*.api.test.js` com **82 passaram, 0 falharam**
  (12 + 12 + 6 + 9 + 8 + 8 + 19 + 2 + 6) e o do vencimento do painel com **17/17**; tela, 5 arquivos com **37/37**. A suíte inteira
  (`npm run test:api`) e o `build` do front **não** foram rodados neste fechamento (só documentação mudou).

---

## Etapa 1 — Portal do motorista (2026-10-23)

Hoje o motorista preenche um formulário de papel a cada saída, retorno ou inspeção, e alguém do escritório passa tudo a limpo numa
planilha de Excel. Agora o motorista entra no sistema pelo celular, toca em **Saída**, **Retorno**, **Inspeção** ou **Abastecimento**
e preenche **o mesmo formulário do papel** — KM, horário, combustível, os 12 itens (OK / N/A / Falha) e as avarias. A saída abre a
viagem, o retorno fecha e calcula o km rodado. Se ele marca uma Falha ou uma avaria, o gestor vê um alerta no painel. O motorista só vê
o que é dele: nem CPF dos colegas, nem custos da frota. E o gestor aperta **Exportar planilha** e recebe um Excel com as mesmas abas da
planilha de hoje, já preenchidas. É a troca do "papel + digitar de novo" por "preenche uma vez, sai pronto".

De quebra, a etapa corrigiu os defeitos que o portal exporia no primeiro dia: o consumo (km/L) que sumia ao editar um abastecimento ou
ao lançar um atrasado, o checklist sem itens que saía aprovado, a viagem concluída que podia ser "aprovada" de novo, e o km de volta
menor que o de ida virando km rodado negativo.

### Antes → Agora

| Antes | Agora |
|---|---|
| O motorista entrava nas mesmas telas do gestor (tabelas com os dados de todos, menu inteiro) | O motorista tem **Meu painel**: botões grandes Saída / Retorno / Inspeção / Abastecimento e a lista "Meus registros". O menu dele mostra só **Meu painel**, **Solicitar Material** e **Minhas Requisições**; abrir **Frota** leva direto ao painel dele |
| O motorista cadastrado não era ligado ao login | No cadastro do motorista há **Usuário de acesso (portal do motorista)**; um usuário só pode estar em **um** motorista ativo |
| Checklist com 7 itens sim/não (pneus, óleo, luzes, freios, extintor, documentos, limpeza) | No portal, os **12 itens do papel**, cada um **OK / N/A / Falha**, mais combustível (Vazio, ¼, ½, ¾, Cheio), KM, horário e a lista de avarias |
| Situação do checklist: aprovado sim/não | Três situações, como na planilha: **OK**, **PENDÊNCIA** (alguma Falha ou avaria), **INCOMPLETO** (faltou item) |
| Checklist sem nenhum item enviado saía **aprovado** (A3) | Sai **INCOMPLETO** (não aprovado) |
| Viagem e checklist eram coisas separadas | **Saída** grava o registro **e** abre a viagem (em andamento); **Retorno** grava o registro e fecha a viagem, com km rodado |
| Nada impedia duas viagens abertas para o mesmo carro | **Uma** viagem em andamento por veículo e por motorista |
| km de volta menor que o de ida gravava km rodado negativo (A5) | Recusado, no portal e na tela de Viagens: *"KM do retorno (10000) menor que o KM da saída (10050). Confira o hodômetro."* |
| Volta com data/hora antes da saída era aceita | Recusada: *"Data/hora do retorno anterior à saída (2026-10-23 08:00)."* |
| "Aprovar" funcionava em viagem de qualquer status, até concluída (A4) | Só viagem **solicitada**: *"Só é possível aprovar viagem solicitada"*. O motorista não aprova nem cancela a própria viagem |
| Falha no checklist não avisava ninguém | Alerta **"Checklist com pendência — placa"** no painel do gestor por 7 dias, com o que falhou e quem registrou |
| Editar um abastecimento (até só a observação) apagava o km/L (A1) | O km/L é refeito pela mesma conta e não some |
| Abastecimento lançado atrasado ficava sem km/L e não refazia o seguinte (A2) | O km/L conta do abastecimento **anterior em km** do mesmo carro; lançar, editar ou apagar refaz o do **seguinte** |
| Editar litros ou valor de um abastecimento mantinha o preço por litro antigo | O preço por litro é refeito (valor ÷ litros) |
| Motorista lia CPF/CNH dos colegas, custos e lançamentos de todos, e editava o lançamento de outro (A6) | Motorista só vê e só altera o que é dele; painel, alertas, multas e documentos são do gestor |
| Nada saía em Excel | **Exportar planilha** (no painel e em Relatórios): 6 abas no formato da planilha da empresa |
| Os testes antigos do Frota não rodavam na suíte (A9) | Rodam com o resto, mais 8 arquivos novos de teste do Frota |

### As regras, com o cenário exato

**Preparação (gestor).** Entre como administrador. Em **Frota → Veículos → Novo Veículo**: placa `ABC1D23`, tipo Caminhonete, medição
Quilometragem, km 10000. Em **Frota → Motoristas → Novo Motorista**: nome *Ana Teste*, e em **Usuário de acesso (portal do motorista)**
escolha um usuário de teste (vamos chamá-lo de *ana*) que tenha acesso ao módulo **Frota** e **não** seja administrador. Salvar.

**1. Sem vínculo, o portal avisa e não grava.** Entre com um usuário que tem acesso ao Frota, não é administrador e **não** está ligado a
motorista nenhum. Abra **Frota**: cai em **Meu painel** com *"Seu usuário não está ligado a um motorista. Peça ao gestor da frota para
fazer o vínculo."*. Nenhum botão de registro aparece. (O administrador que abrir **Portal do motorista** sem estar ligado vê o mesmo aviso.)

**2. Um usuário, um motorista.** Como gestor, crie outro motorista e escolha o mesmo usuário *ana*. A lista mostra *ana* com
"(ligado a Ana Teste)"; ao salvar: *"Este usuário já está ligado ao motorista Ana Teste"*. Para desfazer um vínculo, escolha
**— nenhum —** e salve.

**3. O menu do motorista.** Entre como *ana*. O menu do Frota mostra só **Meu painel**, **Solicitar Material** e **Minhas Requisições**.
A tela diz *"Olá, Ana Teste"* e mostra os botões **Saída**, **Inspeção** e **Abastecimento**.

**4. Os 12 itens são obrigatórios na tela.** Toque **Saída**. O botão **Salvar** fica apagado e o rodapé diz *"Faltam 12 de 12 itens."*.
Marque os itens um a um: a contagem desce; com os 12 marcados, **Salvar** acende.

**5. Saída com uma Falha abre a viagem mesmo assim.** Veículo `ABC1D23`, KM 10050, horário 08:00, combustível ½, destino *Obra X*.
Marque 11 itens **OK** e **Pneus e estepe** como **Falha**. Salvar → *"Saída registrada"*. O painel mostra *"Você está com o veículo
ABC1D23 desde DD/MM/AAAA às 08:00, destino Obra X."*; o botão **Saída** some e aparece **Retorno**. Em **Meus registros**, a saída com a
etiqueta **PENDÊNCIA**.

**6. O gestor vê o alerta.** Entre como gestor → **Dashboard Frota**: na lista de alertas, *"Checklist com pendência — ABC1D23"*, com
*"Falha: Pneus e estepe · Ana Teste"* e *"Registrado em DD/MM/AAAA"*. Uma avaria no lugar da Falha dá *"1 avaria(s) · Ana Teste"*.
O alerta fica por 7 dias contados da data do registro.

**7. O carro em uso some da saída.** Com outro motorista ligado, toque **Saída**: `ABC1D23` não está na lista. Pelo servidor (duas telas
abertas ao mesmo tempo, por exemplo), a recusa é *"Este veículo já está em uso (saída sem retorno)."*; o mesmo motorista tentando uma
segunda saída: *"Você já tem uma saída sem retorno. Registre o retorno primeiro."*.

**8. Retorno com km menor é recusado.** Como *ana*, toque **Retorno**: o cartão mostra *"Veículo: ABC1D23 · saiu com 10.050 km"*.
KM 10000, os 12 itens OK. Salvar → a mensagem em vermelho no topo do formulário: *"KM do retorno (10000) menor que o KM da saída (10050).
Confira o hodômetro."*. Nada é gravado.

**9. Retorno antes da saída é recusado.** No mesmo formulário, KM 10120 e horário 07:00 (antes das 08:00 da saída, mesmo dia) →
*"Data/hora do retorno anterior à saída (AAAA-MM-DD 08:00)."* (a data sai no formato AAAA-MM-DD).

**10. Data no futuro é recusada.** Ponha a data de amanhã → *"Data no futuro"*. Horário adiantado no **mesmo** dia passa (B20).

**11. Retorno certo fecha a viagem.** KM 10120, horário depois das 08:00, data de hoje → *"Retorno registrada"*. O cartão da viagem some
e volta o botão **Saída**. Como gestor, em **Viagens**, a viagem está **concluida** com KM rodado **70**.

**12. Veículo em manutenção não sai.** Como gestor, edite `ABC1D23` e ponha o **Status** em **manutencao** (é assim que a lista escreve). Como *ana*, **Saída**: o carro aparece
como *"ABC1D23 — … (em manutenção — indisponível)"* e não pode ser escolhido. Pelo servidor: *"Veículo em manutenção. Fale com o gestor
da frota."*. Na **Inspeção** ele pode ser escolhido normalmente. (Volte o status para **ativo**.)

**13. Inspeção não abre viagem.** **Inspeção** com os 12 itens OK → *"Inspeção registrada"*, situação **OK** em Meus registros, sem
cartão de viagem.

**14. Campos obrigatórios do registro.** Sem KM → *"Informe o KM atual"*. Sem veículo (saída ou inspeção) → *"Escolha o veículo"*.

**15. Abastecimento e o km/L.** **Abastecimento**: `ABC1D23`, KM 10200, 40 litros, R$ 240 → *"Abastecimento registrado"*. Outro: KM
10600, 40 litros. Como gestor, em **Abastecimentos**, o segundo mostra Km/L **10** ((10600 − 10200) ÷ 40).

**16. Abastecimento atrasado refaz o seguinte.** Como *ana*, abastecimento com a data de **ontem**, KM 10400, 20 litros. Ele mostra
Km/L **10** ((10400 − 10200) ÷ 20), e o de KM 10600 passa a **5** ((10600 − 10400) ÷ 40). Apagar o de 10400 (gestor) volta o de 10600
para 10.

**17. Editar a observação não apaga o km/L.** Como gestor, edite o abastecimento de KM 10600 e mude só a observação: o Km/L continua.
Edite os litros de 40 para 50 sem mexer no valor: o preço por litro passa a ser valor ÷ 50.

**18. Campos obrigatórios do abastecimento.** Sem veículo → *"Veículo, litros e data são obrigatórios"*. Sem KM → *"Informe o KM atual"*.
Sem litros (ou 0) → *"Informe os litros"*. Valor negativo → *"Valor inválido"*.

**19. O motorista só vê o que é dele.** Como *ana*, digite o endereço `/frota/motoristas`: só *Ana Teste* aparece. `/frota/abastecimentos`
e `/frota/viagens`: só os dela. Abrir `/frota` leva ao **Meu painel** (o painel do gestor responde *"Sem permissão para esta
operação"* para o motorista). Pelo servidor, alterar o lançamento de outro motorista: *"Você só pode alterar os seus próprios
registros"*; aprovar ou cancelar a própria viagem: *"Só o gestor da frota pode aprovar ou cancelar viagem"*.

**20. Aprovar só viagem solicitada.** Como gestor, em **Viagens**, o botão de aprovar (✓) só aparece nas linhas **solicitada**. Aprovar uma
que já mudou de status (por exemplo, com duas telas abertas) → *"Só é possível aprovar viagem solicitada"*.

**21. Km de volta menor também na tela do gestor.** Em **Viagens**, edite a viagem concluída e ponha **KM retorno** 10000 →
*"KM do retorno (10000) menor que o KM da saída (10050). Confira o hodômetro."*.

**22. A planilha.** Como gestor, **Dashboard Frota → Exportar planilha** (ou **Relatórios**, que usa o período da tela). Baixa
`controle-de-frota-AAAA-MM-DD.xlsx` com as abas **Cadastro Frota**, **Viagens e KM**, **Checklist**, **Abastecimentos**,
**Manutenções** e **Documentos**. Na aba Checklist, a saída do cenário 5 tem *Pneus e estepe* = **Não conforme** e Status Geral
**PENDÊNCIA**; em Viagens e KM, a viagem com KM Percorrido 70; em Abastecimentos, a coluna *KM desde Abastec. Anterior* e o *Consumo
km/L*. Documento com status **renovado** não aparece na aba Documentos.

### O que esta etapa não cobre

- **Perfil Consulta/Motorista pela tela** (C2) — é a Etapa 2.
- **Seção 3 do formulário** ("Transmissão e itens específicos", C3) — a imagem recebida está cortada.
- **Foto da avaria e do cupom** (D1), **desenho clicável** das avarias (D2).
- **Horímetro** para máquinas (A10, D4), **multas no período** do relatório (A7, D3), **apelido V01/C01** (D5).
- **Aviso de km menor que o atual** (A8, C6).
- **O motorista corrigir o próprio lançamento** pelo portal (D6).

---

## Onde estamos e o que vem a seguir

- **Feito:** Etapa 1 — portal do motorista, vínculo usuário ↔ motorista, escopo do motorista, km/L pela ordem do km, viagens com uma em
  andamento por carro e por motorista, alerta de pendência, exportação no formato da planilha. Achados do levantamento corrigidos:
  **A1, A2, A3, A4, A5, A6, A9**. Abertos: **A7, A8, A10**.
- **Próximo: Etapa 2 — perfil do Frota pela tela** (B24). O administrador escolhe, para cada usuário com acesso ao Frota, **Administrador
  de Frota**, **Consulta** ou **Motorista**. Detalhe (contrato, pontos de atenção) no plano
  [`2026-10-23-frotas-etapa1-portal-do-motorista.md`](../superpowers/plans/2026-10-23-frotas-etapa1-portal-do-motorista.md), seção
  "Próxima tarefa detalhada".
- **Depois, por valor:** seção 3 do formulário (quando chegar a folha inteira), foto da avaria/cupom, horímetro (A10), aviso de km menor
  (A8), multas no período (A7).
