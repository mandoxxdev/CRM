# Frota — novidades por etapa

> Documento de apresentação do desenvolvimento do módulo Frota: o que cada etapa mudou, com o cenário exato para mostrar ao vivo.
> Para quem **usa** o sistema (sem número de etapa nem histórico), o documento é o
> [`manual-do-sistema.md`](manual-do-sistema.md). Guia com roteiro de teste: [`README.md`](README.md).
>
> **Onde estamos:** **Etapa 5 (foto da avaria e do cupom) entregue** em 2026-10-23, na `main` (commits `786d1ec5` a `ab234a44`, mais o
> fechamento). Antes, no mesmo dia: Etapa 4 (relatórios fechados), Etapa 3 (km e horímetro no portal), Etapa 2 (perfil Consulta/Motorista
> pela tela) e Etapa 1 (portal do motorista). Próxima: **Etapa 6 — tratar a pendência do registro** (B60; detalhe em "Onde estamos e o
> que vem a seguir", no fim).

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

**A3 — perfis do Frota gravados à mão (Etapa 2).** Até a Etapa 2 a única saída para dar Consulta era SQL (C2); um valor digitado com a
caixa errada não vale como perfil nenhum.

```sql
SELECT p.usuario_id, u.nome, p.perfil, u.admin_modulos, u.is_superadmin, u.role
FROM perfil_frota_usuario p LEFT JOIN usuarios u ON u.id = p.usuario_id
WHERE p.perfil NOT IN ('CONSULTA', 'MOTORISTA')
   OR (p.perfil = 'ADMIN_FROTA' AND COALESCE(u.admin_modulos, '') NOT LIKE '%"frota"%');
```

- **Nenhuma linha (o esperado):** nada a fazer.
- **Linha com perfil fora da lista (ex.: `consulta` minúsculo):** essa pessoa hoje não faz nada no Frota e lê só o que é dela (B33). Depois
  do deploy, em **Frota → Perfis de acesso** a linha dela mostra *"consulta (valor inválido — escolha outro)"*: escolha **Consulta** ou
  **Motorista (padrão)**.
- **Linha `ADMIN_FROTA` de quem não administra o módulo:** essa pessoa age como **administradora** do Frota sem estar marcada no cadastro.
  Se não deve ser, troque em **Frota → Perfis de acesso** (aparece como *"Administrador de Frota (gravado à parte)"*). As linhas de
  superadmin e de `role` admin podem aparecer aqui e são inofensivas (eles são administradores de qualquer jeito).

**A4 — máquinas por horímetro com horas gravadas no km (Etapa 3).** Até a Etapa 3 o portal gravava o número do painel da máquina no
**km** (A10). Depois do deploy ele grava no horímetro; o que já estava gravado fica como estava.

```sql
SELECT v.id, v.placa, v.km_atual, v.horimetro_atual,
  (SELECT COUNT(*) FROM frotas_abastecimentos a WHERE a.veiculo_id = v.id AND a.km_abastecimento IS NOT NULL) AS abastecimentos_com_km,
  (SELECT COUNT(*) FROM frotas_checklists c WHERE c.veiculo_id = v.id AND c.km IS NOT NULL) AS registros_com_km,
  (SELECT COUNT(*) FROM frotas_viagens vi WHERE vi.veiculo_id = v.id AND vi.km_saida IS NOT NULL) AS viagens_com_km
FROM frotas_veiculos v
WHERE v.tipo_medicao = 'horimetro';
```

- **Nenhuma linha, ou todas com km 0 e contagens 0 (o esperado — o banco local tem zero máquinas):** nada a fazer.
- **Máquina com `km_atual` maior que zero:** é o horímetro que foi parar no km. Em **Frota → Veículos**, edite a máquina: ponha o
  número certo em **Horímetro Atual** e **0** em **KM Atual**. Sem isso o portal mostra *"Último registrado neste veículo: (o horímetro
  velho) h"* e só pergunta quando o motorista digitar menos que ele.
- **Abastecimentos com km na máquina:** esses abastecimentos têm km/L calculado com horas (número sem sentido) e entram no relatório de
  consumo e no alerta de consumo baixo. Para tirá-los da conta, em **Frota → Abastecimentos** edite cada um: copie o KM para **Horímetro
  no abastecimento (máquina)** e apague o **KM no abastecimento**. Registros e viagens antigos podem ficar (só aparecem na lista).

**A5 — usuários com `role` em maiúsculas (Etapa 3, E5).** Depois do deploy, quem tem `role` "Admin" (ou outra caixa) passa a ser
**administrador do Frota** — como já era no resto do sistema.

```sql
SELECT id, nome, role FROM usuarios WHERE role <> lower(role);
```

- **Nenhuma linha (o esperado; no banco local, só `admin` e `usuario`):** nada a fazer.
- **Alguma linha com "Admin":** essa pessoa já era administradora do sistema; no Frota ela era tratada como Motorista e via o menu de
  administrador sem conseguir usar. Agora ela usa. Se ela **não** devia ser administradora, troque o `role` dela no cadastro de usuário.

**A6 — multas com status fora da lista (Etapa 4, B53).** Desde a Etapa 4 o sistema só aceita pendente, pago ou contestado. Uma multa
gravada antes com outro texto (só por API ou SQL) continua somando no custo como se não fosse contestada.

```sql
SELECT id, veiculo_id, status_pagamento, valor FROM frotas_multas
WHERE status_pagamento IS NULL OR status_pagamento NOT IN ('pendente', 'pago', 'contestado');
```

- **Nenhuma linha (o esperado; o banco local tem zero multas):** nada a fazer.
- **Alguma linha:** em **Frota → Multas**, edite a multa e escolha o status certo.

**A7 — abastecimentos com litros zero ou negativos (Etapa 4).** O lançamento e a correção passaram a recusar; um gravado antes entra
no total de litros do relatório de consumo.

```sql
SELECT id, veiculo_id, data_abastecimento, litros FROM frotas_abastecimentos WHERE litros IS NULL OR litros <= 0;
```

- **Nenhuma linha (o esperado):** nada a fazer. **Alguma linha:** corrija os litros em **Frota → Abastecimentos** (ou exclua o lançamento).

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
| B25 | F2 | **Administrador de Frota não se dá pela tela Perfis de acesso** — só pelo cadastro de usuário ("administra o módulo Frota"); a tela mostra o administrador com a etiqueta e sem seletor, e o servidor recusa com 409 | oferecer "Administrador de Frota" no seletor | o cadastro de usuário reescreve essa linha a cada salvar (concede ou apaga); dado por aqui, sumiria sozinho no próximo salvamento. Mesma decisão do almoxarifado |
| B26 | F2 | **Sem trilha de auditoria** de quem mudou o perfil; fica só a data da última mudança na linha | gravar na trilha do almoxarifado; criar trilha do Frota | o Frota não tem trilha; gravar na do almoxarifado misturaria módulos na tela de auditoria de lá. Criar uma trilha é etapa própria |
| B27 | F2 | A lista mostra **todos os usuários ativos e não ocultos**, tenham ou não acesso ao módulo Frota | listar só quem tem acesso ao Frota | quem tem acesso ao módulo é decidido por grupos e permissões do cadastro de usuário (régua do portão de módulo); copiá-la aqui duplicaria regra. O perfil sozinho não abre o módulo (ver **D7**) |
| B28 | F2 | **Consulta vê o mesmo que o gestor** (painel, custos, CPF/CNH dos motoristas, documentos com valor, planilha), sem gravar nada | esconder CPF/CNH e valores do Consulta | é o que "Consulta" quer dizer desde a Etapa 1 (`ver_painel` e `relatorios`); esconder dado pessoal seria um terceiro tipo de escopo. Mudar é uma régua no serviço |
| B29 | F2 | O seletor oferece só **Motorista (padrão)** e **Consulta**; "Motorista" gravado explicitamente aparece como o padrão | oferecer "Motorista" e "Motorista (padrão)" lado a lado | as duas opções têm o mesmo efeito e confundiriam o gestor; a API ainda aceita `MOTORISTA` |
| B30 | F2 | Mudar para Consulta quem está **com saída sem retorno** é aceito; a tela **avisa** na linha | recusar a mudança | recusar travaria o gestor justamente quando ele quer tirar o acesso; o aviso diz como resolver (fechar a viagem em Viagens ou voltar o perfil) |
| B31 | F2 | Ninguém muda **o próprio** perfil por esta tela (409) | permitir | só quem é administrador por uma linha sobrando chega a isso; rebaixar a si mesmo tiraria o acesso à própria tela no ato |
| B32 | F2 | **C7**: o motorista que abre **Documentos** pelo endereço vê a lista **vazia** | responder "sem permissão" | as outras listas dele já vêm só com o que é dele (ou vazias sem vínculo); "sem permissão" apareceria como erro na tela |
| B33 | F2 (Fase 5) | Perfil gravado com valor **fora da lista** (ex.: `consulta` minúsculo, por SQL) lê como Motorista (só o que é dele) | tratar a caixa (`consulta` = `CONSULTA`) | tratar a caixa mudaria quem **ganha permissão**; ler como Motorista só fecha o que ele via sem poder. A tela mostra o valor como inválido e o gestor corrige com um clique |
| B34 | F2 (fechamento) | **Próxima etapa = km e horímetro confiáveis no portal (A8 + A10)** | foto da avaria/cupom; multas no período (A7); seção 3 do formulário | com o portal no ar, km digitado errado entra calado na conta do consumo (A8) e numa máquina por horímetro o número vai para o km (A10) — estraga o dado desde o primeiro dia. Foto exige anexo, que o módulo não tem; a seção 3 depende da folha inteira; A7 é relatório |
| B35 | F3 | O portal compara a leitura sempre com a **atual do veículo** (o maior número já registrado); lançamento atrasado (abastecimento de ontem) **pergunta** e o motorista confirma | comparar com o lançamento anterior **pela data**; ou só valer para lançamento de hoje | a régua pela data precisaria cruzar registros, viagens e abastecimentos e ainda erraria com o lançamento fora de ordem; a pergunta custa um toque e mostra o número do veículo. Mudar é uma função (`conferirMenorQueAtual`) |
| B36 | F3 | As telas do **gestor** (abastecimento, manutenção, viagem, veículo) **não** perguntam | o mesmo aviso com "confirmar" no gestor | é o escritório quem lança atrasado e corrige o erro do motorista; editar uma linha antiga sempre teria km menor que o atual e perguntaria toda vez |
| B37 | F3 (Fase 2) | O motorista que chamar as rotas do gestor direto (`POST /api/frotas/abastecimentos`) **não** passa pela pergunta — fixado em teste | aplicar a régua nessas rotas quando quem chama é Motorista | as telas do gestor não estão no menu dele; é qualidade de dado, não segurança (ele só grava em nome dele). Ver **D10** |
| B38 | F3 (Fase 2) | Horímetro aceita número (com ponto decimal) ou texto numérico com ponto; **vírgula como texto** (`"1234,5"`) é recusada com *"Informe o horímetro atual"* | aceitar vírgula | o campo da tela é numérico (o celular manda ponto); aceitar vírgula só no horímetro deixaria o km diferente. B15 continua valendo para inteiros |
| B39 | F3 (Fase 2) | Os formulários do gestor mostram **KM** e **Horímetro (máquina)** para qualquer veículo; o servidor **não** recusa km digitado numa máquina | esconder o km na máquina; recusar km em máquina | a tela genérica não muda de campo pelo veículo escolhido; recusar travaria o fechamento de viagens antigas gravadas em km. Ver **C13** |
| B40 | F3 (Fase 2) | O alerta de revisão da máquina avisa **faltando 50 h** (o do carro, 500 km) | 500 h (a mesma régua do km) | 500 horas é quase meio ano de empilhadeira; 50 h fica perto da proporção dos 500 km do carro |
| B41 | F3 | Colunas de horímetro **no fim** das abas da planilha | ao lado das colunas de KM | não desloca as colunas que a empresa já usa (nem fórmulas de quem cola a exportação). O commit `c0af44e8` cita esta decisão como "B36" por engano — a decisão é esta |
| B42 | F3 | E5: o servidor do Frota passou a ignorar a caixa do `role` (como o núcleo e a tela) | a tela passar a comparar `=== 'admin'` como o servidor fazia | quem tem "Admin" já é administrador do sistema inteiro no núcleo; rebaixá-lo só no Frota deixava o módulo diferente do resto. Ver **A5** |
| B43 | F3 | A mensagem nova traz o número **no formato brasileiro e com unidade** (`1.800 km`, `1.234,5 h`), com até 6 casas (Fase 5: com 2, um km 1.800,004 aparecia como `1.800` recusando 1800); a do retorno menor que a saída (Etapa 1) continua com o número cru (`(1700)`) | reformatar também a mensagem antiga | mudar a antiga quebraria o texto que o roteiro e os testes da Etapa 1 conferem; só a nova nasceu formatada |
| B45 | F4 | Multas entram no período pela **data da infração** | data de vencimento; data de pagamento | o custo de um veículo num mês é o que aconteceu com ele naquele mês; o vencimento e o pagamento são do financeiro. Mudar é uma expressão (`diaDaMultaSql`) |
| B46 | F4 | Multa **sem** data da infração entra pelo **dia em que foi lançada** (dia de Brasília) | ficar fora de todo período fechado (e aparecer só em "tudo") | o campo é opcional no formulário; sem isso a multa sumiria de qualquer relatório mensal e o custo sairia menor sem aviso. A tela avisa na nota embaixo do título |
| B47 | F4 | No consumo, **Total litros, Total gasto e Abastecimentos** contam **todos** os abastecimentos do período; a lista sai **por placa** | manter "só as linhas com km/L" e a ordem pelo km/L | o primeiro abastecimento de cada carro (e todo abastecimento de máquina) sumia dos totais; com km/L e L/h na mesma tabela, ordenar por um dos dois não faz sentido. Muda o significado da resposta — nenhuma outra tela a consome |
| B48 | F4 (Fase 2) | Linha com km **e** horímetro mostra os dois consumos (*"10,50 km/L · 5,00 L/h"*) | usar só a régua da medição do veículo (sugerido no plano da Etapa 3) | o km/L sempre olhou só o km da linha (B39); escolher pela medição esconderia um número que o gestor digitou |
| B49 | F4 (Fase 2) | Os dois relatórios da tela mostram **só veículos ativos**; a planilha mantém o histórico dos excluídos | relatório de consumo com os excluídos (como era); planilha só com ativos | o custo por veículo sempre foi só dos ativos; com os dois iguais, a tela fecha com ela mesma. A planilha é o histórico (as abas de lançamento nunca filtraram) e a conferência é pelas placas da aba Cadastro Frota |
| B50 | F4 | Multa **contestada não soma** no custo por veículo (como no painel); na aba Multas ela aparece com o Status | somar como antes | contestada não é custo até ser julgada; o painel já não somava. Só nisso a régua é a do painel (o painel soma todo o tempo e os documentos) |
| B51 | F4 | Litros por hora **calculado na leitura** (nada gravado) | duas colunas novas com recálculo do vizinho, como o km/L | sem estado gravado não há vizinho esquecido (os bugs A1/A2 do km/L eram isso); a frota é pequena e a conta é por veículo. Se pesar, gravar é uma migração |
| B52 | F4 (Fase 2) | Aba Multas **sem** a coluna de data de pagamento | coluna "Pagamento" | o formulário de multas não tem esse campo: a coluna sairia sempre vazia |
| B53 | F4 (Fase 5) | Status de multa fora de pendente/pago/contestado é **recusado** (400) | aceitar e normalizar a caixa ("Contestado" → contestado) | normalizar mudaria em silêncio o que alguém mandou; a tela só manda os três. Multa já gravada com status torto (só por API ou SQL) continua somando no custo — consulta **A6** |
| B54 | F4 (fechamento) | **Próxima etapa = foto da avaria e do cupom** no portal (D1) | cadastro inicial dos 4 veículos da planilha; seção 3 do formulário; alerta de consumo da máquina (D12) | é o que mais falta no dia a dia e não depende de ninguém: a planilha da empresa tem os 4 veículos só com "V01..C01" e o tipo (sem placa, modelo, ano — o cadastro depende do André mandar), e a seção 3 depende da folha inteira. O alerta da máquina precisa de um "consumo esperado em L/h" que ninguém informou |
| B55 | F5 | Fotos: **até 3** por lançamento, **JPEG, PNG ou WEBP**, **abaixo de 10 MB** | 1 foto só; 5 MB (o que o plano da Etapa 4 sugeria); aceitar GIF/PDF | 3 cobre avaria + painel + placa (ou o cupom e o verso); 10 MB é o teto que o almoxarifado já usa e a foto do celular é reduzida antes (B57). Mudar é uma constante (`LIMITE_FOTOS`, `LIMITE_BYTES`). Medido: a biblioteca de upload recusa ao **atingir** o limite, então 10 MB exatos já são recusados — vale para todo o sistema |
| B56 | F5 | O endereço de cada foto vale **2 horas** (até 2,5 com o arredondamento) | 15 min (o do almoxarifado); 12 h (o das fotos da proposta); servir pela rota com login | é a vida de uma lista aberta no celular ou na mesa; a lista relida assina de novo. Servir pela rota com login custaria uma consulta por miniatura. Ver **C17** |
| B57 | F5 (Fase 2) | A tela **reduz** no celular a foto acima de 1 MB e **converte** o que não é JPEG/PNG/WEBP (HEIC do iPhone): lado maior 1.600, JPEG 0,8. A conversão **tira os metadados** (inclusive a localização GPS); a foto de até 1 MB em JPEG/PNG/WEBP sobe como está, **com** eles | subir sempre a original; reconverter todas (tiraria o GPS de todas, mas pioraria a foto pequena) | a foto do celular tem 3–8 MB: reduzida, sobe rápido na rede ruim do pátio e não estoura o teto. Se a empresa não quiser GPS nas fotos, reconverter todas é uma linha (`precisa = true`) |
| B58 | F5 (Fase 2) | Na lista do gestor, **só a primeira** foto em miniatura (com *"+1"*/*"+2"* em link) e carregamento sob demanda | as 3 miniaturas | cada miniatura é um pedido ao servidor e o sistema limita 500 pedidos por endereço a cada 15 min — a fábrica inteira sai pelo mesmo endereço. Ver **C18** |
| B59 | F5 | **Remover foto** existe no **Meus registros** do motorista; o gestor não tem botão (apaga o lançamento ou pede ao motorista) | botão também na lista do gestor | a lista do gestor é a tela genérica de cadastro; mexer nela para um botão por foto ficou para depois (**D14**). O servidor já aceita o gestor remover |
| B60 | F5 (fechamento) | **Próxima etapa = tratar a pendência do registro**: o gestor marca a falha/avaria como tratada (com o que foi feito), o alerta sai do painel e o motorista vê | cadastro dos 4 veículos e seção 3 do formulário (dependem do André); alerta de consumo da máquina (D12, depende de alguém informar o consumo em L/h); botão de remover foto do gestor (D14, pequeno) | hoje o alerta de pendência **some sozinho em 7 dias**, tratada ou não, e não há onde dizer "consertado": o gestor perde o fio do que já resolveu. Não depende de ninguém e fecha o ciclo da foto (avaria → foto → tratada) |
| B44 | F3 (fechamento) | **Próxima etapa = relatórios fechados**: multas no período (A7), a máquina no relatório (horímetro e consumo em litros por hora) e a aba de multas na planilha | foto da avaria/cupom; seção 3 do formulário | deixa a feature 10 (Relatórios) 🟢 sem infraestrutura nova; foto exige anexo (guardar arquivo, tamanho, quem vê), que é etapa própria; a seção 3 depende da folha inteira |

### C — furos conhecidos em operação

- **C1 — "uma viagem em andamento por veículo" vale para um servidor só.** A regra é garantida por uma fila em memória (B13). Com o
  sistema rodando em **um** processo (como hoje), duas saídas simultâneas do mesmo carro não passam. Se um dia o servidor rodar em
  vários processos ao mesmo tempo, duas saídas no mesmo segundo podem abrir duas viagens. Mesma premissa da trava do almoxarifado.
- **C2 — ninguém recebia o perfil Consulta ou Motorista pela tela (resolvido na Etapa 2).** Até a Etapa 2, todo mundo com acesso
  ao Frota que não era administrador virava Motorista, e quem só acompanha a frota perdia o painel. Agora o gestor dá o perfil em
  **Frota → Perfis de acesso**. O conselho antigo de gravar o perfil direto no banco **não vale mais** — e um valor digitado com a caixa
  errada não vale como perfil (ver **A3**).
- **C3 — a seção 3 do formulário de papel ("Transmissão e itens específicos") não existe no sistema.** A imagem recebida está cortada
  no título dessa seção. O motorista que precisar registrar algo dela usa **Observações**.
- **C4 — viagem esquecida aberta trava o carro.** Se o motorista não registra o **Retorno**, o carro some da lista da **Saída** de todos
  (e quem tentar recebe *"Este veículo já está em uso (saída sem retorno)."*), e o motorista não consegue sair com outro carro
  (*"Você já tem uma saída sem retorno. Registre o retorno primeiro."*). O gestor resolve em **Frota → Viagens**: editar a viagem,
  pôr **KM retorno**, status **concluida**, salvar.
- **C5 — a tela antiga "Novo Checklist" do gestor continua com os 7 itens sim/não e sem avarias.** Ela grava, aparece na lista e na
  planilha (com os 5 itens que têm par no papel), mas não tem os 12 itens nem avarias. O caminho completo é o portal.
- **C6 — km menor que o atual passava calado (resolvido na Etapa 3, A8).** No portal, um km menor que o do veículo agora **para e
  pergunta**; o motorista confirma ou corrige. Nas telas do gestor continua sem pergunta (B36). Um km **confirmado** errado continua
  entrando no km/L pela ordem do km.
- **C7 — o motorista lia a lista de Documentos se digitasse o endereço (resolvido na Etapa 2).** Abrindo `/frota/documentos` à
  mão, ele via os documentos de todos os veículos, com valor. Agora a lista dele vem vazia (B32). Veículos continuam legíveis (sem dado
  pessoal); as outras listas só trazem o que é dele.
- **C8 — avisos com gênero trocado (corrigido no fechamento).** O portal mostrava *"Retorno registrada"*; agora mostra *"Retorno registrado"* (*"Saída registrada"* e *"Inspeção registrada"* não mudam).
- **C9 — dar e tirar o "administra o módulo Frota" apaga o Consulta.** Se alguém está como **Consulta** e o administrador marca, no
  cadastro de usuário, que ele administra o módulo Frota, ele vira administrador; ao desmarcar depois, ele **volta ao padrão
  (Motorista)**, não ao Consulta. Depois de tirar o administrador, confira em **Frota → Perfis de acesso** e dê o Consulta de novo.
- **C10 — superadmin com Consulta gravado de antes.** Um superadmin é administrador em tudo, então a tela não deixa mudar o perfil dele
  (409). Se um dia havia um Consulta gravado para ele, essa linha fica lá: quando ele deixar de ser superadmin, volta a ser Consulta, não
  Motorista.
- **C11 — quem teve o perfil mudado vê o menu novo ao recarregar a página ou ao abrir o painel.** O servidor aplica o perfil novo no
  **próximo pedido** (sem sair e entrar de novo). O menu e os botões que ela vê se acertam quando ela **recarrega a página** (F5), ou
  sozinhos quando ela abre **Frota** (o **Dashboard Frota** e o **Meu painel** percebem a mudança e renovam a tela — Fase5-2). Numa outra
  tela do Frota que já estava aberta, até lá, um botão que ela não pode mais usar responde *"Sem permissão para esta operação"*.
- **C12 — usuário oculto não aparece em Perfis de acesso.** A lista esconde os usuários marcados como ocultos (como no almoxarifado).
- **C13 — o gestor pode digitar horas no km de uma máquina.** Os formulários de Viagens e Abastecimentos têm os dois campos (B39). Horas
  no **KM** de uma máquina sobem o km dela e, no abastecimento, entram no km/L. Use **Horímetro … (máquina)** e deixe o KM vazio.
- **C14 — máquinas com horas no km de antes da Etapa 3.** O que o portal gravou antes continua no km (consulta **A4**).
- **C15 — salvar o cadastro do veículo regrava o km e o horímetro do formulário.** Se um motorista lançou um número maior enquanto o
  gestor estava com o cadastro aberto, salvar o cadastro volta ao número que estava no formulário (e o portal passa a perguntar menos).
  Já era assim antes; ficou visível porque agora o "último registrado" aparece na tela.
- **C16 — um km errado para cima faz o portal perguntar para todo mundo.** Se alguém confirma 18.000 num carro de 1.800, o carro passa a
  18.000 e todo lançamento certo depois pergunta *"KM menor que o atual do veículo (18.000 km)…"*. O gestor corrige o **KM Atual** em
  **Veículos**. O sistema não pergunta por número **muito maior** que o atual.
- **C17 — a foto de uma tela aberta há mais de 2 horas não abre.** O endereço de cada foto vence (B56). Na lista do gestor ou no Meus
  registros aberto desde cedo, clicar na miniatura abre uma página vazia. Recarregar a tela (F5, ou sair e entrar no painel) resolve.
- **C18 — muitas fotos na tela contam no limite de pedidos.** O sistema aceita 500 pedidos por endereço de rede a cada 15 minutos (a
  fábrica toda costuma sair pelo mesmo). Cada miniatura que aparece é um pedido. Por isso a lista do gestor mostra só a primeira foto de
  cada linha (B58); se alguém receber *"Muitas requisições. Tente novamente mais tarde."*, é este limite.

### D — limitações declaradas (cortes de escopo)

- **D1 — sem foto (resolvido na Etapa 5).** *Dizia: "sem foto nem anexo. Nem da avaria, nem do cupom do abastecimento"* — o portal tem
  **Tirar foto** no registro e no abastecimento, e o gestor vê na lista.
- **D2 — mapa de avarias é lista, não desenho** (B5): o motorista escolhe *onde* (lado esquerdo, lado direito, em cima, frente,
  traseira), *o que é* (risco, amassado, trinca, quebrado, outro) e uma descrição opcional.
- **D3 — A7 e a aba de multas (resolvidos na Etapa 4).** *Dizia: "o relatório de custo por veículo não filtra multas pelo período; a
  planilha não tem aba de multas"* — deixou de ser verdade: multas pela data da infração (B45, B46) e aba **Multas** no fim.
- **D4 — A10: máquina por horímetro (resolvido na Etapa 3).** O portal pedia "KM atual" para qualquer veículo e gravava como km; agora a
  máquina por horímetro pede **Horímetro atual** e grava em horas (sobe o horímetro, não toca no km).
- **D5 — sem apelido V01/C01** (B7): o veículo é identificado pela placa.
- **D6 — o motorista não corrige nem apaga o que lançou pelo portal.** "Meus registros" é só leitura; correção é com o gestor, nas telas
  de cadastro.
- **D7 — dar um perfil não dá acesso ao módulo.** Perfis de acesso lista todos os usuários ativos (B27). Dar **Consulta** a quem não tem o
  módulo **Frota** no cadastro de usuário não abre nada: o acesso ao módulo continua sendo dado lá.
- **D8 — sem registro de quem mudou o perfil** (B26): só a data da última mudança fica guardada.
- **D9 — consumo da máquina (resolvido na Etapa 4, menos o alerta).** *Dizia: "o abastecimento em horas fica sem litros por hora; o
  relatório de consumo e o alerta de consumo baixo não olham a máquina"* — o litros por hora existe (lista, relatório, planilha); o
  **alerta** continua sem a máquina (D12).
- **D10 — a pergunta do km menor é só do portal** (B36, B37). As rotas e telas do gestor gravam qualquer km.
- **D11 — custo por veículo só com o km (resolvido na Etapa 4).** A coluna virou **KM / Horímetro** (*"125 h"* na máquina).
- **D12 — sem alerta de consumo baixo da máquina.** O alerta compara km/L com o "consumo esperado (km/L)" do cadastro; não existe
  "consumo esperado em L/h". Pôr é um campo no cadastro e um ramo no alerta.
- **D13 — "Meus registros" do motorista não mostra consumo** (nem km/L, nem L/h). Só o gestor e o Consulta veem consumo.
- **D14 — o gestor não remove uma foto pela lista** (B59). Remove o motorista, em Meus registros; ou o gestor exclui o lançamento
  inteiro (as fotos vão junto).
- **D15 — a foto é do registro, não de cada avaria.** Um registro com duas avarias tem até 3 fotos no total, sem dizer qual é de qual.
  A tela antiga **Novo Checklist** e o formulário de abastecimento do gestor não mandam foto; a planilha e os relatórios não levam foto.

### E — verificações não executadas e regras não confirmadas

- **E1 — o rodapé fixo do formulário (botões Voltar/Salvar e "Faltam N de 12 itens") não foi conferido num celular de verdade.** Ele está
  marcado para ficar grudado no fim da tela ao rolar; os testes automáticos não medem isso.
- **E2 — o teste manual no navegador não foi feito por quem escreveu este fechamento.** O roteiro do guia
  ([`README.md`](README.md#roteiro-de-teste-manual-portal-do-motorista)) foi escrito lendo o código e as mensagens literais; ninguém o
  percorreu clicando. Faça antes de apresentar.
- **E3 — verificação final da Etapa 1, rodada em 2026-10-23 na ponta da etapa:** `npm run test:api` **547/547 arquivos OK**; `test:almoxarifado` **44/44**; `test:validation` **4/4**; `test:safealter` **3/3**; `test:sqlite` **16/16**; tela **191 suítes, 2578/2578 testes**; `build` com `CI=true` **compilou sem aviso**. Depois disso só mudou o texto do aviso do retorno (C8), e os testes do Frota na tela foram rodados de novo: **37/37**. Os testes do Frota no servidor: 9 arquivos, **82 passaram, 0 falharam**.
- **E4 — o roteiro da Etapa 2 não foi percorrido clicando no navegador** por quem escreveu este fechamento. Foi escrito lendo o código e as
  mensagens; o servidor de verdade foi exercitado por um revisor (login real, pasta de dados vazia), e as telas pelos testes
  automáticos. Faça o roteiro do guia antes de apresentar.
- **E5 — `role` "Admin" com maiúscula (resolvido na Etapa 3, B42).** *O texto abaixo era verdade até a Etapa 2:* o servidor do Frota só
  reconhecia o administrador do sistema escrito `admin` (minúsculo); o menu da tela ignorava a caixa. Um usuário gravado como `Admin` (a API de usuários aceita; a tela de usuários grava minúsculo) é Motorista no
  servidor e vê o menu de administrador na tela (e leva *"Sem permissão para esta operação"* ao usar). No banco local, medido: só `admin`
  e `usuario`. Para conferir em produção: `SELECT id, nome, role FROM usuarios WHERE role <> lower(role);`.
- **E6 — perfil fora da lista na tela.** Desde a Fase 5 o servidor lê esse usuário como Motorista (B33), mas o menu da tela dele ainda
  é o do gestor (as telas abrem vazias ou respondem *"Sem permissão para esta operação"*). Só se chega a isso gravando por SQL (ver **A3**).
- **E7 — verificação final da Etapa 2, rodada em 2026-10-23 na ponta da etapa (depois de `805aaa3c`):** `npm run test:api` **549/549
  arquivos OK**; `test:almoxarifado` **44/44**; `test:validation` **4/4**; `test:safealter` **3/3**; `test:sqlite` **16/16**; tela **193
  suítes, 2605/2605 testes**; `build` com `CI=true` **compilou sem aviso** ("Compiled successfully."). Frota no servidor: 11 arquivos,
  **102 passaram, 0 falharam** (`frotasPerfis` 17, `frotasPerfisIdaEVolta` 3); Frota na tela: 7 arquivos, **64/64**.
- **E8 — o almoxarifado tem a mesma comparação exata do `role`** (`=== 'admin'` em `services/almoxarifado/permissions.js`). Um "Admin"
  maiúsculo é administrador do sistema e não é administrador do almoxarifado. Fora do Frota; não mexido (o almoxarifado está pausado).
- **E9 — o roteiro da Etapa 3 não foi percorrido clicando no navegador** por quem escreveu este fechamento. Foi escrito lendo o código e
  as mensagens; as telas foram exercitadas pelos testes automáticos e o servidor por um revisor com sondas. Faça o roteiro do guia
  (*"Roteiro de teste manual (km e horímetro)"*) antes de apresentar.
- **E11 — o km das telas do gestor aceita texto torto desde a Etapa 1.** `"130,5"` ou `"abc"` em **KM** (abastecimento, viagem) viram
  "não é número" e o km fica vazio, sem erro. O horímetro passou a recusar (*"Horímetro inválido"*, Fase 5 da Etapa 3); o km não foi
  mexido para não mudar o comportamento da Etapa 1 nesta etapa. O formulário manda número, então só chega por chamada direta à API.
- **E12 — verificação final da Etapa 3, rodada em 2026-10-23 na ponta da etapa (depois de `a7427207`):** `npm run test:api` **551/551 arquivos OK**; `test:almoxarifado` **44/44**; `test:validation` **4/4**; `test:safealter` **3/3**; `test:sqlite` **16/16**; tela **196 suítes, 2637/2637 testes**; `build` com `CI=true` **"Compiled successfully."**. Frota no servidor: 13 arquivos, **136 passaram, 0 falharam**; Frota na tela: 10 arquivos, **96/96**. Numa rodada anterior
  (interrompida, código de antes da Fase 5) dois arquivos de fora do Frota caíram com `connect EADDRINUSE` (porta efêmera ocupada com
  revisores rodando sondas em paralelo); na rodada final, sem eles, 551/551.
- **E13 — verificação final da Etapa 4, rodada em 2026-10-23 na ponta da etapa (depois de `bcb498a0`):** `npm run test:api` **553/553 arquivos OK**; `test:almoxarifado` **44/44**; `test:validation` **4/4**; `test:safealter` **3/3**; `test:sqlite` **16/16**; tela **197 suítes, 2654/2654 testes**; `build` com `CI=true` **"Compiled successfully."**. Frota no servidor: 15 arquivos `frotas*`, **152 passaram, 0 falharam** (+ `vencimentosFrotasFinanceiroNoDiaLocal` 17/17); Frota na tela: 11 arquivos, **113/113**. A suíte `test:api` rodou sozinha, depois que os revisores terminaram.
- **E14 — o roteiro da Etapa 4 não foi percorrido clicando no navegador** por quem escreveu este fechamento. Foi escrito lendo o código e
  os textos da tela; a tela foi exercitada pelos testes automáticos e o servidor por um revisor com sondas. Faça o roteiro do guia
  (*"Roteiro de teste manual (relatórios)"*) antes de apresentar.
- **E15 — data do período fora do formato.** A tela manda só datas do calendário (`AAAA-MM-DD`). Uma data torta por chamada direta à
  API (`?data_inicio=outubro`) não é recusada: compara como texto e o resultado sai vazio ou inteiro. Datas invertidas (início depois
  do fim) dão tabelas vazias, e o texto do período mostra as duas como foram digitadas.
- **E16 — o roteiro da Etapa 5 não foi percorrido clicando no navegador, nem num celular de verdade** por quem escreveu este
  fechamento. A câmera (`capture`), a redução da foto, o HEIC do iPhone e a rotação da foto em Android antigo não foram conferidos num
  aparelho; o servidor de verdade foi exercitado por um revisor (pasta de dados vazia, ataques de tipo, tamanho, caminho e assinatura) e
  as telas pelos testes automáticos. Faça o roteiro do guia (*"Roteiro de teste manual (fotos)"*) num celular antes de apresentar.
- **E17 — dá para saber se um lançamento ou uma foto existe.** Mandar foto num registro de outro motorista responde *"Você só pode
  alterar os seus próprios registros"*; num número que não existe, *"Registro não encontrado"*. Revela só que o número existe (os
  números são sequenciais), não o conteúdo — é a mesma ordem das outras telas do Frota. Achado da revisão; mantido.
- **E18 — atrás de um proxy (nginx, Coolify) com limite de tamanho menor que 10 MB**, a recusa da foto grande pode chegar como página do
  proxy, e a tela mostraria o aviso genérico de internet. Não medido (a foto sobe reduzida, então só a que não pôde ser reduzida chega
  perto do limite).
- **E19 — verificação final da Etapa 5, rodada em 2026-10-23 na ponta da etapa (depois de `ab234a44`), sem revisores rodando:** `npm run test:api` **555/555 arquivos OK**; `test:almoxarifado` **44/44**; `test:validation` **4/4**; `test:safealter` **3/3**; `test:sqlite` **16/16**; tela **198 suítes, 2687/2687 testes**; `build` com `CI=true` **"Compiled successfully."**. Frota no servidor: 17 arquivos `frotas*`, **173 passaram, 0 falharam**; Frota na tela: 12 suítes, **146/146**. As duas primeiras rodadas do `test:api` deram 548/555 e 554/555 (réguas de fonte de fora do Frota: caminho literal no `app.use` e o inventário das pastas de `/api/uploads`) — corrigidas em `e755ce7e` e `ab234a44`.
- **E10 — o teclado do celular no campo de horímetro** (`inputMode="decimal"`, com vírgula ou ponto conforme o aparelho) não foi
  conferido num celular de verdade.

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

## Etapa 2 — Perfil do Frota pela tela (2026-10-23)

Até aqui, quem tinha acesso ao Frota e não era administrador entrava como **Motorista**: a pessoa do escritório que só acompanha a frota
abria o módulo e caía no "Meu painel" do motorista, sem painel e sem relatório. A única saída era torná-la administradora (que libera
tudo, até excluir) ou mexer no banco. Agora o gestor abre **Frota → Perfis de acesso**, acha a pessoa e escolhe **Consulta** (vê o
painel, os alertas, as listas e os relatórios, exporta a planilha, mas não grava nada) ou **Motorista (padrão)**. Vale no próximo clique
dela — não precisa sair e entrar de novo. De quebra, quem está como Consulta deixa de ver os botões de cadastrar e editar que o sistema
ia recusar, e o motorista que digitava o endereço de **Documentos** deixa de ver os documentos de todos os carros.

### Antes → Agora

| Antes | Agora |
|---|---|
| Só dava para tornar alguém **Administrador de Frota**; todo o resto virava Motorista (C2) | **Frota → Perfis de acesso**: **Consulta** ou **Motorista (padrão)** para cada usuário, pela tela |
| Quem só acompanha a frota abria o Frota e caía no portal do motorista | Com **Consulta**, abre o **Dashboard Frota**, os alertas, as listas e **Relatórios**, e exporta a planilha |
| Para dar Consulta: SQL no banco | Um clique no seletor; mensagem *"Perfil definido: Consulta"* |
| Consulta via **Novo**, **Editar**, **Aprovar** e **Excluir** nas telas de cadastro e levava *"Sem permissão para esta operação"* ao salvar | Consulta vê as telas **só para leitura**: os botões não aparecem |
| Nada avisava ao ligar um motorista a um usuário que não pode registrar | No cadastro do motorista, escolher um usuário que está como Consulta mostra o aviso de que ele não vai registrar no portal |
| O motorista via os documentos de todos os veículos (com valor) digitando `/frota/documentos` (C7) | A lista dele vem vazia |

### As regras, com o cenário exato

**Preparação.** Entre como administrador. Tenha três usuários de teste com acesso ao módulo **Frota** no cadastro de usuário, **sem**
marcar "administra o módulo Frota": *bia* (vai ser Consulta), *ana* (motorista, ligada ao motorista *Ana Teste* como na Etapa 1) e um
terceiro qualquer. Abra **Frota**: no menu do administrador há o item novo **Perfis de acesso** (logo depois de **Relatórios**).

**1. A tela.** **Frota → Perfis de acesso**: título *"Perfis de acesso"*, *"Quem vê o painel e quem registra no portal"*, e os textos
*"Ter acesso ao módulo Frota (no cadastro de usuário) permite abrir as telas; o perfil abaixo diz o que a pessoa faz dentro delas."* e
*"Quem não tem perfil definido entra como Motorista."*. Uma linha por usuário ativo: **Usuário**, **Perfil no Frota**, **O que isso
permite**, **Motorista ligado** (o nome do motorista, ou *"—"*). A busca filtra por nome ou e-mail.

**2. Administrador não tem seletor.** A sua própria linha (e a de qualquer administrador do sistema, superadmin ou quem administra o
módulo Frota) mostra a etiqueta **Administrador** e *"Para dar outro perfil, remova a condição de administrador no cadastro de
usuário."*. Pelo servidor, tentar dar Consulta a um administrador: *"Este usuário já é administrador (superadmin, administrador do
sistema ou administrador do módulo Frota) e tem acesso total à frota. Remova essa condição no cadastro de usuário antes de definir
outro perfil."*.

**3. Dar Consulta.** Na linha de *bia*, troque **Motorista (padrão)** por **Consulta** → *"Perfil definido: Consulta"*. **O que isso
permite** passa a dizer *"Vê o painel, os alertas, as listas e os relatórios, e exporta a planilha. Não registra nem altera nada."*.

**4. Vale no próximo clique dela.** Em outro navegador (ou janela anônima), entre como *bia* **antes** do passo 3: **Frota** leva ao
**Meu painel** com *"Seu usuário não está ligado a um motorista. Peça ao gestor da frota para fazer o vínculo."*. Depois do passo 3,
**recarregue a página** (F5): **Frota** abre o **Dashboard Frota**, o menu mostra Veículos, Motoristas, … e **Relatórios** — sem
**Perfis de acesso**. (Sem recarregar: ao clicar em **Frota** ela cai primeiro no **Meu painel**, que percebe a mudança e troca o menu
 sozinho; aí o **Dashboard Frota** aparece no menu — C11.)

**5. Consulta só lê.** Como *bia*, abra **Veículos**: a lista aparece, mas **sem** o botão **Novo Veículo** e **sem** a coluna **Ações**
(editar, excluir). O mesmo em Motoristas, Viagens (sem o ✓ de aprovar), Abastecimentos etc. **Relatórios → Exportar planilha** funciona.

**6. Voltar ao padrão.** Como gestor, na linha de *bia*, escolha **Motorista (padrão)** → *"Perfil removido — o usuário volta ao padrão
(Motorista)"*. *bia* recarrega e volta ao **Meu painel**.

**7. Aviso de quem está ligado a um motorista.** Dê **Consulta** a *ana* (ligada a *Ana Teste*). A linha dela mostra *"Ligado ao motorista
Ana Teste: como Consulta, não registra no portal."*. Se ela estiver com uma **saída sem retorno**, aparece também *"Tem saída sem retorno:
como Consulta, não consegue registrar o retorno. Feche a viagem em Frota → Viagens ou volte o perfil para Motorista."* — o sistema aceita
a mudança e só avisa (B30). Volte *ana* para **Motorista (padrão)**.

**8. Aviso no cadastro do motorista.** Com *bia* como Consulta, abra **Frota → Motoristas → Novo Motorista** e escolha *bia* em **Usuário de
acesso (portal do motorista)**: abaixo do campo, *"Este usuário está com o perfil Consulta no Frota: ele vê o painel, mas não consegue
registrar no portal. Para ele registrar, mude o perfil em Frota → Perfis de acesso."*. O aviso não impede salvar. (Cancele.)

**9. Só o administrador abre a tela.** Como *bia* (Consulta), digite o endereço `/frota/perfis`: no lugar da tabela, *"Sem permissão para
esta operação"*. Como *ana* (Motorista), o mesmo.

**10. Documentos do motorista.** Como *ana*, digite `/frota/documentos`: a lista vem **vazia** (antes mostrava os documentos de todos os
carros, com valor). Como gestor ou *bia*, os documentos aparecem.

**11. Recusas pelo servidor** (para quem testa a API): perfil fora da lista (inclusive `ADMIN_FROTA`) → *"Perfil inválido. Use CONSULTA,
MOTORISTA ou vazio para voltar ao padrão."*; usuário inexistente ou desativado → *"Usuário não encontrado"*; mudar o próprio perfil →
*"Você não pode mudar o seu próprio perfil por esta tela."*; quem não é administrador da frota → *"Sem permissão para esta operação"*.

### O que esta etapa não cobre

- **Administrador de Frota pela tela de Perfis** — continua no cadastro de usuário (B25).
- **Quem mudou o perfil** — sem trilha; só a data da última mudança (B26, D8).
- **Filtrar a lista por quem tem acesso ao módulo** — dar um perfil não dá acesso (B27, D7).
- **Lembrar o Consulta depois de dar e tirar o administrador** (C9).
- **Esconder do Consulta o CPF/CNH dos motoristas e os valores** (B28).
- O que já estava fora da Etapa 1 e continua: seção 3 do formulário, foto, horímetro (A10), km menor que o atual (A8), multas no período
  (A7).

---

## Etapa 3 — km e horímetro confiáveis no portal (2026-10-23)

O motorista digita o km do painel no celular, e um dedo escorregado (900 em vez de 1.900) entrava calado: o carro continuava com o
maior, mas o abastecimento ficava com o número errado e estragava a conta de km por litro dele e do vizinho. E numa empilhadeira (que
se mede por horas, não por km) o portal pedia "KM atual" e jogava as horas no km da máquina. Agora o portal mostra, embaixo do campo,
**o último número registrado** daquele veículo; se o motorista digita um número **menor**, ele avisa na hora e, ao salvar, **para e
pergunta** — o motorista confere o painel e corrige, ou toca **Confirmar mesmo assim** (um abastecimento de ontem lançado hoje é normal).
Na máquina, o campo vira **Horímetro atual**, as horas vão para o horímetro (o km não muda) e o consumo em km/L não conta a máquina. O
gestor ganhou os campos de horímetro nas Viagens e nos Abastecimentos, e a planilha exportada traz as horas.

### Antes → Agora

| Antes | Agora |
|---|---|
| km menor que o do veículo entrava sem aviso (C6) | O Salvar para: *"KM menor que o atual do veículo (1.800 km). Confira o hodômetro antes de salvar."* e o botão **Confirmar mesmo assim** |
| O motorista não sabia qual era o último km do carro | Embaixo do campo: *"Último registrado neste veículo: 1.800 km"*; digitando menor, *"Menor que o último registrado. Confira o painel antes de salvar."* |
| Máquina por horímetro: o portal pedia "KM atual" e gravava as horas no km (D4) | O campo vira **Horímetro atual (horas no painel)**; as horas vão para o **Horímetro Atual** do veículo; o km não muda |
| As horas da máquina entravam no km/L | O abastecimento em horas fica **sem km/L** (não distorce o consumo de ninguém) |
| O gestor só tinha campos de km para fechar a viagem esquecida de uma máquina | **Horímetro saída (máquina)** e **Horímetro retorno (máquina)** em Viagens; **Horímetro no abastecimento (máquina)** em Abastecimentos; listas mostram "125 h" |
| O alerta de revisão da máquina comparava com o km | Compara com o **horímetro** (avisa faltando 50 h) |
| A planilha não tinha horímetro | Colunas novas **no fim**: Cadastro Frota (Horímetro Atual), Viagens e KM (Horímetro Inicial/Final), Checklist e Abastecimentos (Horímetro) |
| Usuário com `role` "Admin" (maiúscula) era Motorista no Frota e via o menu de administrador (E5) | É administrador da frota, como no resto do sistema |

### As regras, com o cenário exato

**Preparação.** Como administrador, em **Frota → Veículos**, tenha um carro *AAA1A11* com **Medição = Quilometragem** e **KM Atual
1800**, e uma máquina *EMP0001* com **Medição = Horímetro** e **Horímetro Atual 120**. *ana* é motorista ligada (como na Etapa 1).

**1. O último registrado.** Como *ana*, **Inspeção** → escolha *AAA1A11*: embaixo de **KM atual (o que está no painel)** aparece
*"Último registrado neste veículo: 1.800 km"*.

**2. km menor: o aviso enquanto digita.** Digite **900**: aparece *"Menor que o último registrado. Confira o painel antes de salvar."*.
Digite **1800**: o aviso some.

**3. km menor: o Salvar pergunta.** Volte a **900**, marque os 12 itens e **Salvar**: no topo, em vermelho, *"KM menor que o atual do
veículo (1.800 km). Confira o hodômetro antes de salvar."* e o botão **Confirmar mesmo assim**. Nada foi gravado (Meus registros não
mudou).

**4. Confirmar.** Toque **Confirmar mesmo assim**: *"Inspeção registrada"*. Em **Veículos**, o carro continua com **1.800 km** (o km do
veículo nunca desce).

**5. Mudar o número desarma.** Repita até o passo 3 e, em vez de confirmar, troque o km para **950**: o botão some; o Salvar pergunta de
novo (com o 950).

**6. O abastecimento atrasado.** **Abastecimento** → *AAA1A11*, KM **1700**, 30 litros, data de ontem → **Salvar**: a mesma pergunta;
**Confirmar mesmo assim** → *"Abastecimento registrado"*. O km/L dele e o do abastecimento seguinte (em km) são refeitos pela ordem do km.

**7. Recusas que não se confirmam.** Com uma saída em 1.800, um **Retorno** com **1700**: *"KM do retorno (1700) menor que o KM da saída
(1800). Confira o hodômetro."* — sem botão de confirmar.

**8. A máquina.** **Inspeção** → *EMP0001*: o campo vira **Horímetro atual (horas no painel)** e embaixo *"Último registrado neste
veículo: 120 h"*. Digite **125,5** (o teclado do celular tem vírgula; no campo, 125.5 vale) e salve: *"Inspeção registrada"*; em **Meus
registros** aparece *"· 125,5 h"*. Em **Veículos**, *EMP0001* mostra **125,5 h** e o km não mudou. Sem o número: *"Informe o horímetro
atual"*. Menor que o do veículo: *"Horímetro menor que o atual do veículo (125,5 h). Confira o painel antes de salvar."*.

**9. Saída e retorno da máquina.** **Saída** com *EMP0001* em **126**; o cartão do **Retorno** diz *"saiu com 126 h"*. Retorno com
**125**: *"Horímetro do retorno (125 h) menor que o da saída (126 h). Confira o painel."*. Retorno com **130**: registrado.

**10. O gestor e a máquina.** Em **Frota → Viagens**, a viagem da *EMP0001* mostra em **KM rodado** *"4 h"*. Uma viagem esquecida aberta
de máquina se fecha preenchendo **Horímetro retorno (máquina)** (deixe o KM vazio) e status **concluida**. Em **Abastecimentos**, a
coluna KM mostra as horas (*"125 h"*) e o km/L fica vazio.

**11. A planilha.** **Exportar planilha**: no fim das abas aparecem as colunas novas, preenchidas só na máquina (as de KM dela ficam
vazias).

**12. O alerta de revisão da máquina.** Lance para *EMP0001* uma manutenção com **Próxima revisão (KM) = 170**: o painel mostra o alerta
de manutenção (faltam 40 h, menos que 50). Para o carro, a régua continua 500 km.

**13. Número torto.** No portal, KM ou horímetro com espaço, letras ou vírgula como texto: *"Informe o KM atual"* / *"Informe o horímetro
atual"*. Nas telas do gestor, horímetro com vírgula, letras ou negativo: *"Horímetro inválido"* — e nada é gravado (antes, o horímetro
gravado era apagado sem aviso).

### O que esta etapa não cobre

- **A pergunta nas telas do gestor** — o escritório lança atrasado e corrige o que o motorista errou; continua sem pergunta (B36).
- **O motorista que chamar a rota do gestor direto** (ela não está no menu dele) não passa pela pergunta (B37, D10).
- **Consumo da máquina em litros por hora** (D9) e **horímetro no relatório de custo por veículo** (D11).
- **Conferir se o número digitado no km de uma máquina é de horas** — o gestor tem os dois campos (B39, C13).
- **Corrigir dados antigos** de máquina que já tinham horas no km (consulta **A4**).
- O que já estava fora: seção 3 do formulário, foto, multas no período (A7), apelido V01/C01, o motorista corrigir o que lançou.

---

## Etapa 4 — Relatórios fechados (2026-10-23)

No fim do mês o escritório abre **Frota → Relatórios** para saber quanto cada veículo custou e quanto consumiu. Até aqui, o custo de
outubro somava **as multas de todos os anos** (só manutenção e combustível respeitavam o período); a empilhadeira, que abastece em horas,
**sumia** do consumo; com só a data inicial preenchida a tela mostrava tudo enquanto a planilha baixava o filtrado; e a planilha não
tinha multas. Agora as duas tabelas e a planilha usam **o mesmo período** (com uma data ou com as duas), as multas entram pela **data da
infração**, a máquina aparece com as **horas** e o consumo em **litros por hora**, a tela diz qual período aplicou e soma tudo numa linha
**Total** — e essa soma bate com a planilha.

### Antes → Agora

| Antes | Agora |
|---|---|
| Custo por veículo de outubro somava as multas de qualquer data (A7) | Multas pela **data da infração**; sem ela, pelo **dia em que foi lançada** |
| Multa contestada somava no custo (no painel, não) | Contestada **não soma** no custo, como no painel |
| Só a data inicial (ou só a final): a tela ignorava o período; a planilha filtrava | As duas tabelas e a planilha filtram com uma data só |
| O consumo nunca recebia o período | Consumo no mesmo período do custo |
| A tela não dizia qual período estava valendo | *"Período: 01/10/2026 a 31/10/2026"* (ou *"a partir de"*, *"até"*, *"tudo"*), também na impressão |
| Sem total geral | Linha **Total** (Manutenção, Combustível, Multas, Total) |
| Máquina por horímetro aparecia com o km (normalmente 0) (D11) | Coluna **KM / Horímetro**: *"125 h"* na máquina, *"1.800 km"* no carro |
| Máquina sumia do consumo; sem litros por hora (D9) | Coluna **L/h (máquina)**: *"5,00 L/h"*; também na lista de Abastecimentos e na planilha |
| Total litros / gasto / abastecimentos do consumo contavam só os abastecimentos com km/L (o primeiro sumia) | Contam **todos** os abastecimentos do período |
| Veículo excluído aparecia no consumo (e não no custo) | Os dois relatórios mostram só veículos ativos; a planilha guarda o histórico |
| Erro ao carregar virava "Sem dados" calado | Aviso com a mensagem; só a tabela que falhou fica vazia |
| A planilha não tinha multas (D3) | Aba **Multas** no fim; **Horas desde Abastec. Anterior** e **Consumo L/h** no fim de Abastecimentos |

### As regras, com o cenário exato

**Preparação.** Como administrador, tenha o carro *AAA1A11* (km) e a máquina *EMP0001* (Medição = Horímetro, Horímetro Atual 100).

**1. Multas no período.** Em **Frota → Multas**, lance para *AAA1A11*: uma de **R$ 100** com data da infração **10/03/2025**, uma de
**R$ 200** com **05/10/2026**, uma de **R$ 500** com **06/10/2026** e status **contestado**, e uma de **R$ 50** sem data da infração
(lançada hoje). Em **Relatórios**, período **01/10/2026 a 31/10/2026**: a coluna Multas do *AAA1A11* mostra **R$ 200,00** (mais os
R$ 50 se hoje for dia de outubro de 2026). Sem datas: **R$ 350,00** (todas menos a contestada).

**2. Uma data só.** Limpe a data final: aparece *"Período: a partir de 01/10/2026"* e as tabelas mostram de 01/10 em diante. **Exportar
planilha** baixa o mesmo período.

**3. A máquina em litros por hora.** Em **Frota → Abastecimentos**, lance para *EMP0001*: **Horímetro no abastecimento (máquina) 120**,
40 litros; depois **130**, 50 litros. A coluna **Km/L** do segundo mostra *"5,00 L/h"* (50 L ÷ 10 h). Lance um de **125** h com 20 litros:
ele mostra *"4,00 L/h"* e o de 130 passa a *"10,00 L/h"* (a conta é pela ordem do horímetro). Exclua o de 125: o de 130 volta a
*"5,00 L/h"*.

**4. O relatório da máquina.** Em **Relatórios**, sem datas: na tabela **Consumo médio**, *EMP0001* aparece com **Km/L** *"-"* e
**L/h (máquina)** *"5,00 L/h"*, **Abastecimentos 2**, **Total litros 90,0 L**. Na tabela de custos, a coluna **KM / Horímetro** mostra
*"130 h"*.

**5. A soma bate com a planilha.** Com um período escolhido, some na planilha a coluna **Valor Total R$** da aba Abastecimentos (só as
placas da aba Cadastro Frota): é o valor da coluna **Combustível** na linha **Total** da tela. A aba **Multas** sem as linhas
*Contestado* soma o **Multas** do Total.

**6. Linha com km e horas.** Um abastecimento com **KM** e **Horímetro** preenchidos mostra os dois consumos: *"10,50 km/L · 5,00 L/h"*.

**7. Litros que não valem.** Em **Abastecimentos**, edite um lançamento e ponha **0** (ou um número negativo) em Litros → **Salvar**:
*"Informe os litros"* e nada muda. (Antes o zero e o negativo eram gravados e entravam no total de litros do relatório.)

**8. Status da multa.** A tela só oferece pendente, pago e contestado. Por chamada direta, qualquer outro texto (até *"Contestado"* com
maiúscula) recebe *"Status de pagamento inválido"* — antes era gravado e somava no custo como se não fosse contestado.

### O que esta etapa não cobre

- **Alerta de consumo baixo da máquina** — continua só em km/L; não há "consumo esperado em L/h" no cadastro (D12).
- **Consumo em "Meus registros" do motorista** — a tela dele não mostra consumo (D13).
- **Período com data digitada à mão fora do formato** — a tela só manda datas do calendário; uma data torta por chamada direta compara
  como texto (E15).
- O que já estava fora: seção 3 do formulário, foto, apelido V01/C01, o motorista corrigir o que lançou.

---

## Etapa 5 — Foto da avaria e do cupom (2026-10-23)

O motorista marcava *"Lado esquerdo: amassado"* sem poder mostrar o amassado, e o abastecimento entrava sem o cupom — o escritório
continuava pedindo a foto pelo WhatsApp e guardando onde dava. Agora, no **Meu painel**, o formulário de Saída, Retorno e Inspeção e o
de Abastecimento têm **Tirar foto**: abre a câmera do celular, cabem até 3 fotos, e elas sobem logo depois que o lançamento é salvo. O
motorista vê as dele em **Meus registros** (e manda de novo a que falhou, ou tira a errada); o gestor e o Consulta veem a foto na lista
**Checklist Diário** e **Abastecimentos**, ao lado do lançamento. Ninguém de fora abre a foto: o endereço vale só por 2 horas e só sai
para quem pode ver aquele lançamento.

### Antes → Agora

| Antes | Agora |
|---|---|
| A avaria era só texto ("Lado esquerdo: Amassado") | **Tirar foto** no formulário: até 3 fotos por registro |
| O cupom do posto ficava no bolso do motorista | **Foto do cupom** no Abastecimento |
| A foto ia pelo WhatsApp, separada do lançamento | A foto fica **no lançamento**: o gestor vê na coluna **Fotos** de Checklist Diário e Abastecimentos |
| — | **Meus registros** mostra as fotos de cada lançamento, com **+ Foto** (mandar a que faltou) e **Remover foto** |
| — | Foto grande ou do iPhone (HEIC) é reduzida no próprio celular antes de subir |
| — | Sem internet na hora: o lançamento fica salvo e um aviso diz qual foto não foi |
| — | Excluir um registro ou abastecimento apaga as fotos dele |
| — | O colega não vê a foto do outro; o Consulta vê todas; a planilha e os relatórios não mudam |

### As regras, com o cenário exato

**Preparação.** Como administrador: o carro *AAA1A11*; dois usuários com acesso ao Frota ligados a motoristas, *Ana* e *Bruno*
(**Frota → Motoristas**, **Usuário de acesso**). Um celular, ou o navegador do computador (que abre a escolha de arquivo no lugar da câmera).

**1. A foto da avaria.** Como *Ana*, **Meu painel → Inspeção**, *AAA1A11*, KM, os 12 itens, uma avaria (Lado esquerdo, Amassado). No grupo
**Fotos** está escrito *"Até 3 fotos (avarias, painel…). Elas sobem depois que o registro for salvo."*. **Tirar foto** → a miniatura
aparece com **Remover foto**.

**2. O limite de 3.** Tire mais duas: **Tirar foto** apaga e a dica vira *"Limite de 3 fotos."*. (Pelo servidor, a quarta foto de um
lançamento é recusada com *"Este lançamento já tem 3 fotos"* — mesmo que quatro cheguem ao mesmo tempo.)

**3. Salvar sobe as fotos.** **Salvar** → *"Inspeção registrada"*; o formulário fecha quando a última foto termina de subir, e enquanto
sobe **Remover foto** e **Voltar** ficam apagados. Em **Meus registros** a inspeção mostra as miniaturas; tocar abre a foto.

**4. O cupom.** **Abastecimento**, grupo **Foto do cupom** (*"Até 3 fotos. Elas sobem depois que o abastecimento for salvo."*) → **Tirar
foto** → **Salvar** → *"Abastecimento registrado"*.

**5. Mandar depois, tirar a errada.** Em **Meus registros**, **+ Foto** no lançamento → *"Foto enviada"* (o botão some com 3 fotos).
**Remover foto** → *"Remover esta foto?"* → *"Foto removida"*.

**6. Sem internet na hora.** Se a foto não sobe, o lançamento **continua salvo** e aparece *"Salvo, mas 1 foto não foi enviada: Confira a
internet e tente de novo em Meus registros."* (com duas: *"Salvo, mas 2 fotos não foram enviadas: …"*; com recusa do servidor, a
mensagem dele no lugar).

**7. Arquivo que não é foto.** No computador, **+ Foto** com um PDF → *"Formato de imagem não suportado"*. O servidor confere o tipo
declarado **e** o começo do arquivo: um arquivo com nome `.jpg` que por dentro não é foto também é recusado. Foto de 10 MB ou mais (que
não pôde ser reduzida): *"Arquivo grande demais (máximo 10 MB)"*.

**8. O gestor vê.** Como administrador, **Frota → Checklist Diário**: a coluna **Fotos** da inspeção da Ana mostra a primeira foto e
*"+2"*; clicar abre em outra aba. **Abastecimentos**: a foto do cupom. Sem foto: *"-"*.

**9. Cada um vê o que é seu.** Como *Bruno*: nada da Ana em lugar nenhum; mandar foto num registro da Ana (só por chamada direta) →
*"Você só pode alterar os seus próprios registros"*. Como **Consulta**: as fotos de todos, sem poder mandar (*"Sem permissão para esta
operação"*).

**10. Excluir leva as fotos; o endereço vence.** Copie o endereço de uma foto, exclua a inspeção em **Checklist Diário** e abra o
endereço: página não encontrada. Um endereço copiado também deixa de abrir depois de cerca de 2 horas (C17).

### O que esta etapa não cobre

- **O gestor remover uma foto pela lista** (D14) — remove o motorista, ou o gestor exclui o lançamento.
- **Foto por avaria** (D15) — as fotos são do registro inteiro.
- **Foto pela tela antiga Novo Checklist e pelo formulário de abastecimento do gestor**; **foto na planilha e nos relatórios**.
- O que já estava fora: seção 3 do formulário, desenho das avarias, apelido V01/C01, o motorista corrigir o que lançou.

---

## Onde estamos e o que vem a seguir

- **Feito:** Etapa 1 — portal do motorista (vínculo usuário ↔ motorista, escopo do motorista, km/L pela ordem do km, uma viagem em
  andamento por carro e por motorista, alerta de pendência, exportação no formato da planilha; A1–A6 e A9 corrigidos). Etapa 2 — perfil
  **Consulta**/**Motorista** pela tela **Frota → Perfis de acesso**, Consulta só leitura nas telas de cadastro, aviso no cadastro do
  motorista, e o C7 (documentos do motorista). Etapa 3 — o portal mostra o último km/horímetro do veículo e pergunta antes de gravar um
  número menor (A8); a máquina por horímetro grava em horas (A10); o gestor e a planilha ganharam o horímetro; o "Admin" maiúsculo (E5).
  Etapa 4 — relatórios fechados: multas no período (A7), a máquina com horas e litros por hora, o mesmo período na tela e na planilha
  (com uma data só), linha Total que bate com a planilha, aba Multas. A7 era o último achado do levantamento ainda aberto.
  Etapa 5 — foto da avaria e do cupom pelo celular (D1), no lançamento, em Meus registros e nas listas do gestor.
- **Próximo: Etapa 6 — tratar a pendência do registro** (B60): o gestor marca a falha ou a avaria como tratada (o que foi feito), o
  alerta sai do painel e o motorista vê. Detalhe (contrato, pontos de atenção) no plano
  [`2026-10-23-frotas-etapa5-fotos.md`](../superpowers/plans/2026-10-23-frotas-etapa5-fotos.md), seção "Próxima tarefa detalhada".
- **Depende do André:** a folha inteira do formulário (seção 3) e as placas/modelos dos 4 veículos da planilha (V01, V02, V03, C01) para
  o cadastro inicial.
