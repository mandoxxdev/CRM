# Frota — novidades por etapa

## ⚠️ Leia antes de apresentar

**B — decisões tomadas sem consulta (todas reversíveis). O André arbitra lendo aqui.**

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
| B13 | F1 | "Uma viagem em andamento por veículo e por motorista" garantida por uma **fila em memória** (`filaDeViagens.js`) nas rotas que abrem/fecham viagem | índice único parcial no banco | o índice falharia na migração se já houver viagens em dobro no banco de produção; a fila é a mesma premissa de um processo do almoxarifado (C132) |
| B14 | F1 | Na tela antiga do gestor, item **não enviado** fica gravado **vazio** (nulo), não "OK" | gravar 1 como antes | A3: o vazio é o que o registro diz de verdade; a tela do gestor manda os 7, então nada muda para quem usa |
| B15 | F1 | O portal aceita km e litros como **texto numérico** (`"1050"`) além de número | só número | o celular manda o que o campo tem; recusar "1050" seria erro só de formato |
| B16 | F1 | Na lista de veículos do portal, os **em manutenção aparecem** (com o status), para inspeção; só a saída é recusada | esconder | o motorista pode precisar inspecionar o carro na oficina; a tela mostra o status |
| B17 | F1 (Fase 5) | RN-F1.20 no `PUT /viagens`: só barra a **troca** para aprovada/cancelada; mandar o **mesmo** status passa | barrar qualquer `status: 'aprovada'` vindo do motorista | o formulário do gestor manda o objeto inteiro: o motorista editando a própria viagem já aprovada mandaria `aprovada` e levaria 403 sem ter mudado nada. Chamada interna sem usuário também passa |
| B18 | F1 (Fase 5) | Retorno antes da saída também recusado no **`POST /viagens`** (além do portal e do `PUT`); se uma das datas não tem hora, compara só o dia; no `PUT`, data `null` no corpo **não** apaga a gravada (como antes) | só portal e `PUT`; `null` apagando a data | a mesma régua nos três lugares; o front manda `null` em campo vazio, então `null` apagar a data mudaria o que já funcionava |
| B19 | F1 (Fase 5) | `/usuarios-vinculaveis` devolve também o usuário **desativado** que segue ligado, com `ativo: false` (os demais `ativo: true`); a tela mostra ele **só** no form do motorista que o tem, com "(inativo)" | resposta sem mudança e o front buscar o usuário à parte | campo novo e aditivo; sem ele o select escondia um vínculo que existe e o salvar quebrava |
| B20 | F1 (Fase 5) | "Data no futuro" olha só o **dia** (hoje de Brasília); horário adiante no mesmo dia passa | recusar também hora futura | o achado era o alerta preso por semanas (dia); celular com relógio alguns minutos adiantado não deve travar o registro |
| B21 | F1 (Fase 5) | Índice único do vínculo usuário-motorista: se o banco já tem duplicata, o boot **loga e segue** sem o índice | derrubar o boot / apagar a duplicata | não parar o sistema; a conferência do serviço continua valendo para os gestos novos. Refazer o vínculo duplicado e reiniciar cria o índice |
| B22 | F1 (Fase 5) | **Não** mudada: na rota antiga do gestor (sem os 12 itens), avaria não conta para a situação (régua F2-7) | contar avaria também na rota antiga | fora do escopo do fix-round e muda a régua da tela antiga (B10); com os 7 itens OK e uma avaria o registro sai OK e não vira alerta — decidir junto com a tela nova do gestor | — **corrigido no fechamento**: a avaria conta tambem na rota antiga (PENDENCIA) |
