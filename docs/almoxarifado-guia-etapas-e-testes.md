# Almoxarifado — Guia das Etapas e Testes Manuais

> Atualizado em 2026-08-29 · Branch: `desenvolvimento-almoxarifado` · Como rodar: `npm run dev` (raiz do projeto)

Este documento explica, em linguagem simples, o que mudou no módulo Almoxarifado até agora (Etapas 1 a 20 e 22 a 28) e tem um roteiro de cliques para você testar manualmente no navegador cada etapa. A **Etapa 21 é do núcleo do CRM**, não do módulo — está aqui mesmo assim, porque nasceu de um corte de escopo da Etapa 20.

> ## Onde o desenvolvimento está — 2026-08-29 (Etapa 28 ENTREGUE · modo contínuo pelo mapa)
>
> **Etapas 1 a 20 e 22 a 28 completas no módulo; a Etapa 21 foi entregue no NÚCLEO do CRM.**
> A **Etapa 28 (a separação ganha dono, e quem separou não confere)** fechou em 2026-08-29
> (`9cef003..62cb2b1`) e é da **feature 05 (separação e picking)**. Até ela, o sistema **não sabia
> dizer quem separou** uma requisição — a separação gravava quantidades e nada mais, sem rastro na
> Auditoria. Agora **cada rodada de separação tem dono, hora e itens**, a separação e a liberação
> aparecem na Auditoria, e nasce a **segunda conferência**: outra pessoa confere a caixa, e o
> sistema **recusa quem aparece em qualquer rodada** de separação. Com **material crítico ainda na
> caixa**, a conferência é **obrigatória** para liberar **e** para entregar.
>
> **⚠️ ISTO MUDA O DIA A DIA de um almoxarifado com uma pessoa só:** material **crítico** passa a
> exigir **dois usuários** com perfil Almoxarife (ou Administrador) para sair. Material comum não
> muda. Leia a **B62** (a régua "só crítico" é decisão minha, reversível numa linha) e o furo
> **C38** antes de subir. O roteiro desta etapa precisa de **dois logins**.
>
> **Duas coisas que a revisão mediu e mudaram o projeto:** a entrega direta saía de *Em Separação*
> sem passar pela liberação (a barreira só na liberação era barreira opcional), e o formulário de
> separação gravava os itens **um a um antes de validar o próximo** — um item errado deixava os
> outros gravados **sem rodada**, e sem rodada a mesma pessoa separava, conferia e entregava.
> Agora é **tudo ou nada**.
> Ver a seção "Etapa 28" perto do fim deste guia, com o roteiro de teste.
>
> **Antes: Etapas 1 a 20 e 22 a 27 completas no módulo.**
>
> ## Onde o desenvolvimento estava — 2026-08-29 (Etapa 27 ENTREGUE)
>
> **Etapas 1 a 20 e 22 a 27 completas no módulo; a Etapa 21 foi entregue no NÚCLEO do CRM.**
> A **Etapa 27 (a divergência dimensional deixa de ser opinião e vira medição)** fechou em
> 2026-08-29 (`063f3ce..cdb64a6`) e é da **feature 09 (inspeção e qualidade)**. Ela pagou os
> **dois primeiros itens** que o checklist daquela feature listava como faltantes desde a Etapa 5:
> **plano de inspeção por material** (características com valor nominal e os dois desvios da
> tolerância, **com sinal**, para o caso unilateral de usinagem) e **registro de medidas com o
> instrumento usado**. Com isso, a caixa *"Divergência dimensional"* deixou de ser marcada à mão e
> passou a ser **derivada do número** quando há medidas: fora da tolerância liga sozinha, dentro
> desliga, e a marcação manual é ignorada. Junto veio a amarra com o cadastro de instrumentos —
> **paquímetro com calibração vencida não mede**.
>
> **⚠️ ESTA ETAPA NÃO TEM TELA, e é o que mais precisa ficar claro.** O formulário de Inspeções
> está exatamente como estava: **nenhum campo de medida**, e a caixa *Divergência dimensional*
> segue clicável e manual — o que está certo, porque sem medidas nada é derivado. Quem abrir a tela
> procurando onde digitar a medida **não vai achar**. As medidas gravadas também **ainda não têm
> tela que as mostre** (furos **C34** e **C35**). **Nada do comportamento atual mudou:** as tabelas
> nascem vazias e, sem plano cadastrado, tudo funciona como antes.
>
> **O que é seu:** decidir a **B59** (o plano deve ser herdado da família do material?) e ler a
> **B60**, que é o alerta a cumprir na etapa da tela — a caixa *Divergência dimensional* tem de
> virar **somente leitura e explicada** ao lado dos campos de medida, senão a tela mostra uma coisa
> e o banco guarda outra, que é exatamente o defeito que a Etapa 26 teve de consertar. A **B61**
> (informar o instrumento é opcional) eu já decidi, com o caminho de volta escrito.
> Ver a seção "Etapa 27" perto do fim deste guia, com o roteiro de teste.
>
> **Antes: Etapas 1 a 20 e 22 a 26 completas no módulo.**
>
> ## Onde o desenvolvimento estava — 2026-08-29 (Etapa 26 ENTREGUE)
>
> **Etapas 1 a 20 e 22 a 26 completas no módulo; a Etapa 21 foi entregue no NÚCLEO do CRM.**
> A **Etapa 26 (uma lista de categorias só, e ela é da GMP)** fechou em 2026-08-29
> (`1bca087..9d86a84`) e é da **feature 01 (cadastros de materiais)** — a primeira etapa fora da
> feature 23 desde a 15. Ela pagou a **dívida mais antiga do módulo ainda aberta**: as categorias
> de material estavam **escritas dentro do código, repetidas em três telas**, desde a Etapa 2
> (04/08). Entregue: **(1)** as três telas (cadastro de material, filtro da listagem de materiais e
> filtro da conferência) passaram a ler o **catálogo do cliente** — as **27 categorias de
> metalúrgica** que estavam no banco **sem nenhum uso**; **(2)** o catálogo virou **cadastro
> editável** em *Configurações → aba Categorias*, com criar, renomear, desativar e **reativar**,
> recusa de nome duplicado e rastro na Auditoria; **(3)** dois defeitos que só apareceram ao medir
> — o formulário **mostrava a primeira categoria da lista** para material gravado com outra (a tela
> mentia sobre o banco) e material salvo sem categoria virava `OUTROS` **pelo servidor**, sem
> passar pela tela. **Isto responde a B6**, aberta desde a Etapa 8c.
> **Atenção operacional (três coisas):** rode a **A6** no banco de produção antes do deploy para
> decidir o que fazer com os materiais já classificados pela lista antiga — **nada foi migrado, de
> propósito**; rode a **A7** para procurar categorias de nome repetido, que impedem a trava nova de
> valer; e saiba que **o filtro de categoria devolve zero** para as categorias novas enquanto o
> acervo não for remapeado (furo **C33**). **E uma decisão espera você:** renomear categoria
> deve reclassificar os materiais já classificados (**B58**). Ver a seção "Etapa 26" no fim deste
> guia.
>
> **Antes: Etapas 1 a 20 e 22 a 25 completas no módulo.**
>
> **Etapas 1 a 20 e 22 a 25 completas no módulo; a Etapa 21 foi entregue no NÚCLEO do CRM.**
> A **Etapa 25 (de onde veio cada movimento, e o backup que parou de crescer sozinho)** fechou em
> 2026-08-29 (`6209037..9027c36`) e é a **primeira etapa da perna *Segurança*** da feature 23 —
> as etapas 18 a 23 fecharam a perna de *Auditoria* e a 24 começou a de *Perfis*. Ela **não tem
> tela nova**: o que muda aparece dentro da tela de **Auditoria** que já existe e no campo
> **"Manter Backups (dias)"** que já estava lá sem funcionar. Entregue: **(1)** cada movimentação
> passou a registrar **de onde veio** — endereço de rede e aparelho —, cobrindo os 28 caminhos que
> geram movimento, inclusive o **estorno** do cancelamento; **(2)** o campo **"Manter Backups
> (dias)"** deixou de ser decorativo e passou a decidir a limpeza, com trava de **no mínimo 3 e no
> máximo 10 cópias**; **(3)** a limpeza passou a recolher os **arquivos auxiliares órfãos** que
> nenhuma rotina alcançava — são **132 arquivos e 44 MB** parados no servidor de produção.
> **Atenção operacional (duas coisas):** a limpeza roda **sozinha no primeiro arranque depois do
> deploy** e vai apagar **135 arquivos / ~57 MB** — leia a **A5** das novidades antes de subir; e
> a aba **Backup** fica com **um** campo funcionando e **dois** decorativos (*Backup Automático* e
> *Frequência* continuam sem efeito — furo **C32**). **E uma decisão espera você:** quais
> operações sobre material crítico exigem duas assinaturas (**B57**). Ver a seção "Etapa 25" no
> fim deste guia.
>
> **Antes: Etapas 1 a 20 e 22 a 24 completas no módulo; a Etapa 21 foi entregue no NÚCLEO do CRM.**
>
> **Etapas 1 a 20 e 22 a 24 completas no módulo; a Etapa 21 foi entregue no NÚCLEO do CRM.**
> A **Etapa 24 (a Qualidade ganha perfil, e a tela de perfis para de mentir)** fechou em
> 2026-08-29 (`a81e51a..4680daa`) e é a **primeira etapa da perna *Perfis*** da feature 23 — as
> etapas 18 a 23 fecharam a perna de *Auditoria* dessa mesma feature. Ela **não tem tela nova**:
> a aba **Configurações → Perfis de Acesso** já existia, e o desenho da etapa **afirmava que não**
> — o escopo foi reescrito no meio do caminho, de "criar a tela" para "consertar quatro defeitos
> da que existe". Entregue: **(1)** o perfil **Qualidade**, que consulta e decide inspeção e nada
> além — antes a área de qualidade dependia do almoxarifado para aprovar/reprovar carga; **(2)**
> **retirar** o perfil de alguém passou a deixar rastro na Auditoria (era invisível — o ato mais
> sensível do módulo saía sem registro); **(3)** a concessão passou a gravar **qual era o perfil
> anterior**; **(4)** **Administrador saiu da lista de opções**, porque concedê-lo por ali dá
> poder de promover outras pessoas e **evapora sozinho** no salvamento seguinte daquele cadastro.
> **Atenção operacional: nada foi migrado.** Quem já tiver *Administrador* gravado continua com
> ele — rode a consulta **A4** das novidades no banco de produção antes do deploy (furo **C31**).
> **E uma decisão espera você:** apertar o perfil padrão de quem não tem perfil definido, hoje
> **Produção** (**B54**). Ver a seção "Etapa 24" no fim deste guia.
>
> **Antes: Etapas 1 a 20, 22 e 23 completas no módulo; a Etapa 21 foi entregue no NÚCLEO do CRM.**
> A **Etapa 23 (o histórico para de mentir por omissão e por excesso)** fechou em 2026-08-28
> (`0fe8d02..4f1aeb9`) e é a **primeira etapa que a etapa anterior pediu ao fechar**. Ela **não
> tem tela nova** — o que ela muda é a **confiança no que a tela da Etapa 22 mostra**. Dois
> defeitos que eram teoria enquanto ninguém lia a trilha viraram coisa visível assim que a tela
> existiu, e os dois estão fechados: **(1)** o `Salvar` da tela de Configurações gravava os 18
> campos **um de cada vez**, e uma falha no meio deixava parte gravada **sem nenhuma linha de
> histórico** — agora vão juntos ou nenhum vai; **(2)** clicar **Excluir** de novo num item que já
> estava inativo gravava **outra** linha de "Exclusão" na Auditoria, indistinguível de uma exclusão
> real — agora o segundo clique responde sucesso e **não registra nada**. Vale para tipo de
> material, localização, setor, família **e material**.
> **Atenção operacional: nenhuma tela mudou.** Excluir continua respondendo sucesso como sempre; o
> que mudou é o que fica gravado. Se você quiser que a tela **avise** ("este item já estava
> inativo"), é decisão sua — item **B52** das novidades. Ver a seção "Etapa 23" no fim deste guia.
>
> **Antes: Etapas 1 a 20 e 22 completas no módulo; a Etapa 21 foi entregue no NÚCLEO do CRM.**
> A **Etapa 22 (a trilha de auditoria ganha leitor)** fechou em 2026-08-28
> (`8c6ffbe..169458d`) e é a que **tem tela nova**: **Almoxarifado → Auditoria**, no menu, ao
> lado de Configurações. Três etapas seguidas (18, 19 e 20) fizeram o sistema anotar quem mexeu
> em quê — cadastros, configurações, o ciclo do inventário, a troca de foto de material — e
> **nada disso tinha como ser lido**: a única forma era pedir a alguém que consultasse o banco
> por fora do sistema. Agora a tela responde a pergunta para a qual a trilha existe: **"quem
> mexeu nisto, e quando?"**, com filtro por tipo de coisa, por ação, por pessoa e por período, e
> com o **de/para campo a campo** ao expandir a linha. Duas correções vieram junto e são
> invisíveis mas importantes: uma data escrita errada agora dá **erro explícito** em vez de uma
> lista vazia que parece prova de que nada aconteceu; e o filtro de período passou a respeitar o
> **horário de Brasília** — sem isso, as três últimas horas de todo expediente sumiriam do filtro
> do próprio dia, porque o sistema grava a hora em UTC. A tabela do histórico, que não tinha
> **nenhum** índice, ganhou os três que faltavam.
> **Atenção operacional: o acesso é só de Administrador** — o Gestor que conduziu um inventário
> ainda **não** vê o próprio registro; abrir para ele é decisão sua (letra B33). Ver a seção
> "Etapa 22" no fim deste guia.
>
> **Antes: Etapas 1 a 20 completas no módulo, e a Etapa 21 entregue no NÚCLEO do CRM.** A **Etapa 21
> (exposição no núcleo)** fechou em 2026-08-28 (`d5c8d3a..07a4b1c`) e é a **primeira etapa fora
> do módulo Almoxarifado**: ela mexe no arquivo de backup do sistema, na senha do e-mail e na
> tela **Configurações do Sistema** (a do CRM inteiro, não a do módulo). O motivo dela existir:
> o arquivo `.zip` baixado pelo endereço de backup levava junto o arquivo em que o servidor
> guarda a chave com que assina os crachás de login — **quem baixasse o backup conseguia entrar
> como super administrador**. Agora o zip não leva mais esse arquivo, nem as 188 MB de cópias
> antigas, e **todo download fica registrado** (horário, IP, aceito/negado e o motivo). Junto:
> a senha do e-mail passou a vir preferencialmente do ambiente do servidor, e o campo **Senha
> SMTP** parou de devolver a senha em claro e de gravar a máscara por cima dela.
> **Atenção operacional: nenhuma tela do Almoxarifado muda.** O que muda é o campo Senha SMTP em
> Configurações do Sistema → Email, que agora **nasce vazio** — deixar em branco é o jeito de
> manter a senha atual. **E há uma ação que só você pode fazer: rotacionar a senha do e-mail na
> Locaweb** (item A3 das novidades) — ela está no histórico do repositório desde 17/03/2026 e
> nenhum código a remove de lá. Ver a seção "Etapa 21" no fim deste guia.
>
> **Antes: Etapas 1 a 20 completas.** A **Etapa 20 (exposição e rastro)** fechou em 2026-08-28
> (`1b0f0e9..a3f5135`): ela não tem tela nova — fecha três lugares em que o sistema mentia ou
> falava demais. Mandar a foto de um material **que não existe** respondia sucesso e deixava a
> imagem no servidor para sempre; **agora responde `Material não encontrado` e apaga o arquivo**.
> Trocar a foto de um material passou a **deixar registro** (quem, quando, de qual arquivo para
> qual) e a antiga só é apagada depois de a nova estar gravada. A **senha de e-mail** e a **chave
> de API do WhatsApp** deixaram de voltar em texto puro na leitura das configurações, e o
> salvamento genérico passou a **recusá-las** apontando a tela certa. E ler o **mapa de materiais
> permitidos por setor** passou a exigir administrador — o mesmo que já era exigido para mudá-lo.
> **Atenção operacional: nenhuma tela muda para quem usa o sistema.** O que muda é para quem
> integra por API. Duas coisas continuam abertas de propósito e estão nas novidades: a **URL do
> webhook de WhatsApp continua em claro** (B40/C24 — quem administra o módulo lê o token que
> estiver dentro dela) e a **decisão B41, que espera sua resposta**. Ver a seção "Etapa 20" abaixo.
>
> **Antes: Etapas 1 a 19 completas.** A **Etapa 19 (cadastros e configurações auditados)** fechou em
> 2026-08-28 (`a574b3a..55e4144`): 23 operações que mudavam o comportamento do sistema sem
> deixar rastro — criar/editar/excluir cadastros, mudar configurações (onde moram as regras) e
> alterar a lista de materiais por setor — passam a registrar quem, quando e o de/para.
> **Atenção operacional: excluir um cadastro que não existe agora responde erro, onde antes
> respondia sucesso** (letra C22 das novidades). Ver a seção "Etapa 19" abaixo.
>
> **Antes: Etapas 1 a 18 completas.** A **Etapa 18 (trilha do inventário)** fechou em 2026-08-28
> (`adf7233..aee9c9e`): abrir, contar, recontar, concluir e **cancelar** uma conferência
> passam a deixar registro de quem fez o quê; **cancelar exige um motivo escrito** e o motivo
> aparece na lista; três operações vizinhas (desativar material, cancelar e excluir
> requisição) também passaram a registrar. **Atenção operacional: quem cancela conferência vai
> encontrar um modal pedindo justificativa — avise a equipe** (letra C21/B34 das novidades).
> Ver a seção "Etapa 18" abaixo.
>
> **Antes: Etapas 1 a 17 completas.** A **Etapa 17 (Alertas de evento)** fechou em 2026-08-28
> (`d65d81b..e51ca79`): reprovar material numa inspeção, registrar quantidade diferente da
> esperada e concluir conferência com divergência passam a avisar **no instante do ato** (e a
> varredura diária vira rede de segurança, sem duplicar); mais o **resumo mensal de lotes sem
> certificado**. Com ela a feature 20 fica 🟢 no que é viável: 17 de 20 alertas, faltando só
> os 3 que dependem de dado inexistente nas features donas. Ver a seção "Etapa 17" abaixo.
>
> **Antes: Etapas 1 a 16 completas.** O roteiro do planejamento mestre acabou na 15; a 16 (alertas)
> foi escolhida pelo mapa de status, e a próxima frente também será — candidatas nomeadas no
> handoff do plano `docs/superpowers/plans/2026-08-28-almoxarifado-etapa16-alertas.md`
> (seção "Próxima tarefa detalhada"): a fatia 2 da feature 20 (4 alertas de evento) ou o
> buraco de auditoria da conferência de inventário (feature 23).
>
> A **Etapa 16 (Alertas operacionais) fechou em 2026-08-28** (`d9750ce..ed5f032`): o módulo
> passa a **avisar sozinho** — 7 alertas novos varridos todo dia e enviados por e-mail pela
> fila existente (calibração vencendo, estoque sem consumo, estoque excessivo, quarentena
> parada, materiais sem endereço, requisição atrasada, reserva parada), e a tela nova
> **Alertas** mostra tudo **ao vivo** (some da tela quando a condição é resolvida). Três
> janelas novas em Configurações Gerais; a central é dos perfis Administrador/Almoxarife/
> Gestor/Compras (decisão B28). Ver a seção "Etapa 16" abaixo com o roteiro.
>
> **Antes: 2026-08-28 (Etapa 15 ENTREGUE — mobilidade).**
>
> A **Etapa 15 (Mobilidade) fechou em 2026-08-28** (`7f74b6c..a82ad43`): a tela nova
> **Scanner** lê o QR das etiquetas pela câmera do celular e abre o item já filtrado (QR
> estranho é exibido e nunca aberto); a **entrega de requisição** ganhou assinatura do
> recebedor na tela (nome + traço a dedo, opcional — a entrega nunca depende dela; as
> assinaturas ficam no detalhe da requisição, para sempre); e o módulo ficou usável no
> celular (as tabelas paravam de mostrar tudo da 4ª coluna em diante — agora nada some, a
> tabela desliza). Código de barras 1D, coletor físico e app nativo ficaram **fora por
> medição** — ver a seção "Etapa 15" abaixo e as letras B25-B27 das novidades.
> **Atenção: o scanner exige HTTPS (ou localhost) para a câmera funcionar — teste num
> celular real antes de apresentar (letra F10 das novidades).**
>
> **Antes: 2026-08-25 (Etapa 14 ENTREGUE · desenvolvimento esteve pausado até 2026-08-28).**
>
> A **Etapa 14 (Integrações — o ciclo da compra fecha) fechou em 2026-08-25**
> (`b276dca..2de7944`): a chegada da **nota fiscal do pedido vinculado fecha a solicitação de
> compra sozinha** (RECEBIDA, com auditoria), **cancelar existe** (justificativa obrigatória,
> gravada), vincular valida as duas pontas, quem decide compra ganhou o painel **Ver contexto**
> por material (saldos, consumo médio, último custo pago, solicitações abertas) e nasceu o
> relatório **Custo por projeto** (com devolução herdando o projeto da saída e abatendo).
> BOM/OP ficaram **bloqueados por dependência com a medição escrita** (BOM inexistente, MES sem
> uso) — não são promessa. Ver a seção "Etapa 14", mais abaixo, com o roteiro completo.
> **Atenção à decisão B21 das novidades: vincular e "verificar mínimos" abriram de
> Administrador-only para Gestor/Compras — já em vigor.**
>
> **Antes: 2026-08-24 (Etapa 13 ENTREGUE).**
>
> **Etapas 1 a 13 completas.** A **Etapa 13 (Relatórios e Indicadores) fechou em 2026-08-24**
> (`4fdda54..8bb5e52`), e com ela a **feature 21 fica entregue no grosso**: a tela nova
> **Almoxarifado → Relatórios** (menu por assunto com só o que o SEU perfil pode ver, filtros,
> régua de cada relatório no rodapé), **exportação para Excel** com colunas curadas, os
> **indicadores gerenciais** (giro, cobertura, rupturas, valor por grupo, tempo de
> atendimento) e 3 cartões novos no painel inicial. Ver a seção "Etapa 13", mais abaixo, com o
> roteiro completo.
>
> **Antes: 2026-08-24 (Etapa 12 ENTREGUE).**
>
> **Etapas 1 a 12 completas.** A **Etapa 12 (Notificações Completas) fechou em 2026-08-24**
> (`c1613c2..d7fee6c`), e com ela a **feature 19 fica completa nos cortes declarados**: fila
> de avisos por e-mail com retentativa automática e histórico, e-mail de movimentação por
> família de evento (**nasce desligado — ligar é decisão sua**, item B15 das novidades), três
> avisos que eram dívidas antigas (ferramenta vencida, solicitação de compra gerada, devolução
> parcial) e três alertas novos (estoque zerado, lote vencendo, remessa vencida), tudo visível
> na tela nova **Notificações** (Gestor/Admin). Ver a seção "Etapa 12", mais abaixo, com o
> roteiro completo. **Próxima etapa: Etapa 13 — Relatórios e Indicadores** (feature 21).
>
> **Antes: 2026-08-24 (Etapa 11 ENTREGUE).**
>
> **Etapas 1 a 11 completas.** A **Etapa 11 (Reposição e Compras) fechou em 2026-08-24**
> (`54e1278..1ea6ab2`), e com ela a **feature 18 fica completa no que é do almoxarifado**:
> sugestão de compra calculada (quanto pedir, para chegar a quanto, valendo quanto),
> consolidada por fornecedor; geração de solicitações auditadas; estoque parado
> (excesso/sem consumo/obsoleto) com valor em reais; e a tela nova **Reposição e Compras**
> para quem decide compra. O que falta da feature é integração com o módulo Compras
> (fechar/cancelar solicitação no recebimento). Ver a seção "Etapa 11", mais abaixo, com o
> roteiro completo. **Próxima etapa: Etapa 12 — Notificações Completas** (features 19 + 20).
>
> **Antes: 2026-08-23 (Etapa 10b ENTREGUE).**
>
> **Etapas 1 a 10b completas.** A **Etapa 10b (Inventário Avançado, parte 2) fechou em
> 2026-08-23** (`14f4458..7290481`), e com ela a **feature 17 fica completa no que as duas
> rodadas se propuseram**: contagem por escopo (classe A, críticos, de clientes, em terceiros,
> família), dupla contagem por duas pessoas com o número do colega escondido, autoria por item
> e o relatório de Acuracidade com impacto em reais. Ver a seção "Etapa 10b", mais abaixo, com
> o roteiro completo.
>
> **Antes: 2026-08-22 (Etapa 10 ENTREGUE).**
>
> **Etapas 1 a 10 completas.** A **Etapa 10 (Inventário Avançado) fechou em 2026-08-22**
> (`d644827..8db2671`), e com ela a **feature 17 fica parcialmente completa** — o risco crítico
> de três etapas (ajuste gravando saldo por fora do sistema) está resolvido; tipos de contagem
> avançados, dupla contagem por duas pessoas, congelamento de movimentação e relatório de
> acuracidade ficam declarados fora do escopo, para uma **Etapa 10b** (ver seção "Etapa 10", mais
> abaixo). *(Frase da época; a 10b foi entregue em 2026-08-23 — ver acima.)*
>
> **A Etapa 10 fez o ajuste de inventário parar de mentir.** Concluir uma conferência com
> "aplicar ajustes" agora registra uma movimentação de verdade, auditada, e recusa deixar
> material bloqueado/reservado/em inspeção/em terceiro com número que não fecha. De brinde:
> contagem cega (quem conta não vê o saldo do sistema) e recontagem obrigatória para divergência
> grande. Ver a seção "Etapa 10", mais abaixo, com o roteiro completo.
>
> **Antes: 2026-08-22 (Etapa 9b ENTREGUE).**
>
> **Etapas 1 a 9b completas.** A **Etapa 9b (Ferramentas e Calibração) fechou em 2026-08-22**
> (`d644827..b8e6f60`), e com ela a **feature 16 fica completa** (com duas melhorias pendentes
> declaradas — lembrete automático sem canal, e edição de ferramenta pela tela — ver seção
> "Etapa 9b", mais abaixo).
>
> **A Etapa 9b fez ferramenta virar patrimônio controlado de verdade.** Empréstimo agora recusa
> ferramenta ocupada, bloqueada, em manutenção, avariada, perdida ou com calibração vencida — com
> mensagem dizendo o motivo, e à prova de dois cliques simultâneos na mesma ferramenta. Avaria e
> perda viram registro com foto e responsável, e fecham o empréstimo em aberto sozinhas. Ver a
> seção "Etapa 9b", mais abaixo, com o roteiro completo.
>
> **Antes: 2026-08-16 (Etapa 9 ENTREGUE).**
>
> **Etapas 1 a 9 completas.** A **Etapa 9 (Retalhos, Sobras e Sucatas) fechou em 2026-08-16**
> (`b727c0a..4ba94e2`, mais os commits de documentação), e com ela a **feature 15 fica
> completa**.
>
> **A Etapa 9 fez duas coisas.** Primeiro: **o retalho passou a existir no estoque.** Quando uma
> chapa/tubo/barra é parcialmente usada, o pedaço aproveitável agora tem saldo, etiqueta com QR e
> aparece como sugestão quando alguém vai dar saída no material inteiro — antes ele não existia
> para o sistema e a empresa comprava chapa nova com meia chapa na prateleira. Segundo:
> **sucatear deixou de ser um clique.** `Sucata` **sumiu do formulário de Movimentações** — quem
> procurar o tipo lá não vai mais achar, e isso é de propósito: sucatear agora é um **processo com
> duas assinaturas obrigatórias** (uma do almoxarifado, uma da gestão, de **pessoas diferentes**),
> na tela nova **Almoxarifado → Sobras e Retalhos**, e a baixa só sai do estoque quando a segunda
> pessoa assina. Depois da baixa, registra-se o destino: **vendida** (com valor e comprovante) ou
> **descartada**. Ver a seção "Etapa 9", mais abaixo, com o roteiro completo — o teste da dupla
> aprovação precisa de **dois usuários** logados.
>
> **⚠️ A mudança que precisa ser avisada a quem opera:** o caminho antigo de sucatear
> (Movimentações → tipo Sucata) **não existe mais**. Os caminhos válidos são o processo de
> sucateamento (tela Sobras e Retalhos) e a devolução com destino Sucata (que continua igual).
> `Perda` **continua** no formulário de Movimentações — a exigência de dupla aprovação é só para
> sucateamento.
>
> **Antes: 2026-08-13 (Etapa 8c ENTREGUE).**
>
> **Etapas 1 a 8c completas.** A **Etapa 8c (Transformação no Terceiro) fechou em 2026-08-13**
> (`753d23b..61c6f52`, mais o commit de documentação da Task 10), e com ela a **feature 14 (materiais em terceiros) fica completa**:
> a 8b entregou a metade "o mesmo material volta" (galvanizar, pintar, tratar) e a 8c entrega a
> metade "volta outra coisa" (cortar, dobrar, usinar).
>
> **A Etapa 8c fez a chapa que sai para corte parar de mentir no estoque.** Antes, a chapa que ia
> para o cortador e voltava como 40 peças e uma sobra **não tinha como ser registrada**: o sistema
> recusava o retorno de material diferente, e sobravam duas saídas ruins — registrar como se a chapa
> tivesse voltado inteira (o estoque passa a ter uma chapa que não existe) ou não registrar nada (o
> material some do controle exatamente na hora em que vira produto). Agora existe o botão
> **Transformar** dentro da remessa: você diz **quanto da chapa foi consumido** e **o que voltou**
> (quantas linhas forem precisas, cada uma com material, quantidade e classificação **Peça** ou
> **Sobra**). A chapa é **baixada de verdade**, as peças **entram no estoque** com o custo da chapa
> **rateado entre elas**, e o sistema mostra o **rendimento** (peso que voltou ÷ peso que saiu)
> quando todos os pesos estão cadastrados. Ver a seção "Etapa 8c", mais abaixo.
>
> **⚠️ DOIS NÚMEROS QUE VOCÊ OLHA VÃO MUDAR — e mudam para CERTO.** Durante a 8c foram achados e
> corrigidos **dois defeitos antigos**, anteriores a esta etapa (seções próprias, logo antes de
> "Decisões de negócio"):
> 1. [o valor do estoque aparecia ZERADO nos relatórios](#correção--o-valor-do-estoque-aparecia-zerado-nos-relatórios-2026-08-13)
>    — duas leituras de valor (o relatório "estoque atual" e a consulta de estoque) valoravam a
>    **R$ 0,00** todo material cujo custo foi digitado só no cadastro, ou seja, **quase todo o
>    acervo**. Elas passam a mostrar números maiores — **não é inflação: é o número certo aparecendo
>    pela primeira vez**. O card **"Valor em Estoque"** do Dashboard também muda de conta (passa a
>    usar o custo médio), mas ele **nunca** zerou.
> 2. [a posição por cliente não fechava a conta](#correção--a-posição-por-cliente-não-fechava-a-conta-2026-08-13)
>    — o que o cliente lê como **"consumido"** passa a incluir o que foi consumido ou perdido no
>    terceiro. **O número que o cliente vê muda.**
>
> **⚠️ DUAS COISAS DA ETAPA 8c QUE DEPENDEM DE VOCÊ, NÃO DO CÓDIGO** (detalhadas na seção da
> Etapa 8c, em "O que depende de você"):
> 1. **A regra de rateio de custo foi decidida por você e está escrita como decisão** — rateio por
>    **quantidade**, **sobra a custo zero**, custo do serviço do terceiro **opcional**. Se a
>    operação real não for essa, é mudança de regra, não bug.
> 2. **Falta a conferida no navegador** do modal de transformação — teste automático não abre
>    navegador. Vale 5 minutos e está no item **F** do documento de novidades.
>
> **Antes: 2026-08-12 (Etapa 8b).**
> **Etapas 1 a 8b completas.** A **Etapa 8b (Remessas a Terceiros) fechou em 2026-08-12**
> (`0a01124..b176212`), e era a **outra metade da feature 14**, junto com a 8c.
>
> **A Etapa 8b fez o material que vai beneficiar fora parar de sumir do controle.** Antes, quando
> uma chapa ia para o galvanizador, ou alguém dava baixa — e ela **desaparecia do patrimônio**,
> embora continuasse sendo da empresa — ou não dava baixa nenhuma, e o sistema **afirmava que a
> chapa estava na prateleira** com ela a 40 km. Agora existe a tela **Almoxarifado → Remessas a
> Terceiros**: a remessa tem terceiro, tipo de serviço, prazo e itens; ao **enviar**, o material
> **sai do disponível e continua no total**; o retorno pode ser **parcial**, quantas vezes for
> preciso; e **encerrar deixando saldo lá fora exige dizer para onde ele foi** (perda no terceiro
> ou consumido no processo), o que dá baixa de verdade em vez de deixar saldo preso. Tem **PDF do
> documento de remessa** com duas linhas de assinatura. Ver a seção "Etapa 8b", mais abaixo, para as
> regras demonstráveis e o roteiro completo.
>
> **✅ NADA A RODAR EM PRODUÇÃO POR CAUSA DESTA ETAPA.** Diferente das Etapas 7 e 8, a 8b só
> **acrescenta** uma coluna e três tabelas novas — **nenhum dado existente é tocado ou
> reinterpretado**, e não há passado a corrigir. Isso está dito explicitamente porque as duas
> etapas anteriores deixaram consultas pendentes e você vai procurar a desta. (As consultas das
> Etapas 7 e 8 **continuam pendentes** — ver os blocos abaixo.)
>
> **⚠️ DUAS COISAS DA ETAPA 8b QUE DEPENDEM DE VOCÊ, NÃO DO CÓDIGO** (detalhadas na seção da
> Etapa 8b, em "O que depende de você"):
> 1. **"Uma remessa não pode misturar materiais de donos diferentes" foi DEDUZIDO, não pedido.** O
>    sistema hoje recusa. Se a GMP manda chapa de dois clientes na mesma viagem para o mesmo
>    galvanizador, **a regra está errada** e precisa mudar. É pergunta, não requisito atendido.
> 2. **Falta a conferida no navegador** dos cinco selos coloridos de status e do PDF baixando
>    legível — teste automático não abre navegador e não valida nem cor nem PDF.
>
> **Antes: 2026-08-12 (Etapa 8).**
> **Etapas 1 a 8 completas.** A **Etapa 8 (Materiais de Clientes) fechou em 2026-08-12**
> (`f26b635..5b5eb55`). **Próxima etapa da ordem: Etapa 8b — Materiais em Terceiros** (a Etapa 8 do
> planejamento foi **dividida**: 8 = clientes, entregue; 8b = terceiros, ainda sem design).
>
> **A Etapa 8 tirou o material de cliente da ilha em que ele vivia.** Antes ele era uma lista à
> parte, com descrição em texto livre, sem lote, sem série, sem endereço, sem extrato, sem etiqueta
> e sem passar pelo motor de estoque — e **nada impedia** usar a chapa do Cliente A no equipamento
> do Cliente B. Agora ele é **material normal com dono**: tudo o que as Etapas 1 a 7 entregaram
> vale para ele, o saldo dele fica **fora** de todo número do estoque próprio (dashboard, valor
> total, reposição de mínimo, sugestão de compra, posição), a saída só sai com OS ou projeto **do
> próprio dono**, e existe a tela **Almoxarifado → Materiais de Clientes** com posição por cliente
> e PDF. Ver a seção "Etapa 8", mais abaixo, para as regras demonstráveis e o roteiro completo.
>
> **⚠️ DUAS COISAS PARA LER ANTES DE SUBIR A ETAPA 8 PARA PRODUÇÃO** (ambas detalhadas na seção da
> Etapa 8, em "O que fazer antes do deploy"):
> 1. **A conferência de inventário escapa da permissão nova.** Concluir uma conferência com
>    "aplicar ajustes" grava o saldo por um caminho antigo, **fora do motor** — logo, fora da
>    permissão `ajustar_material_cliente`. **É um caminho real por onde o saldo de material de
>    cliente muda sem a autorização especial.**
> 2. **Confirmar que a tabela antiga está vazia em produção.** A ilha foi aposentada com base na
>    medição do banco de **desenvolvimento** (0 linhas). **Nenhuma linha foi apagada** — a tabela
>    ficou de propósito —, mas a consulta precisa ser rodada em produção.
>
> **Antes: 2026-08-12.** A **Etapa 7 (Transferências e Devoluções)** fechou na mesma data
> (`29524fc..0722bfd`, mais os consertos `eabd848`/`7fc1b7f` e `d117dc2`).
>
> **🚨 ANTES DE SUBIR PARA PRODUÇÃO, LEIA ISTO.** A Etapa 7 corrigiu um bug de saldo: **devolver
> material para o destino "Sucata" baixava o estoque duas vezes**. Quem já usou o sistema pode ter
> saldo errado em casa, e a correção **não** conserta o passado. A consulta que identifica os casos
> afetados está na seção da Etapa 7, em "O bug da Sucata" — **no banco de desenvolvimento a
> checagem já foi feita e deu 0 devoluções (nenhum efeito lá); produção precisa da mesma
> checagem**.
>
> **A Etapa 7 fechou as duas rotas que existiam sem nenhuma tela.** Transferir material entre
> prateleiras e devolver material do chão de fábrica só eram alcançáveis por chamada direta à API —
> ninguém no galpão conseguia fazer nem uma coisa nem outra. Agora **Transferência** é um tipo do
> formulário de Movimentações (com origem, destino e lote) e existe a tela nova **Almoxarifado →
> Devoluções**, onde a devolução fica ligada à entrega que a originou. Ver a seção "Etapa 7", mais
> abaixo, para o roteiro completo e o que a etapa não cobre.
>
> **Antes: 2026-08-11.** Etapa 6c (Etiquetas com QR Code) — ENTREGUE (`35967b9..0785119`), a última
> parte da feature 10: lote + série + etiqueta física fecham o ciclo.
>
> **A Etapa 6c fechou nesta mesma data, sem tocar uma linha do servidor.** PDF de etiqueta (folha A4
> em grade de 10, ou térmica 100×50mm) gerado inteiro no navegador, com QR Code que abre a tela do
> item já filtrada e destacada — quem lê o QR com o celular cai direto na linha certa, e o app pede
> login (é dado de estoque, exige sessão). Botão de imprimir aparece em três lugares: na nota de
> Recebimento já processada, em cada linha de lote/série na tela "Lotes e Séries" (mais um botão em
> massa para todas as séries em estoque), e em Materiais. Ver a seção "Etapa 6c", mais abaixo, para
> o roteiro de teste completo e o que ainda não está coberto.
>
> **A Etapa 6b fechou em 2026-08-11.** As Tasks 8-11 entregaram a UI que faltava: textarea com
> gerador de sequência na entrada (Movimentações), seletor de séries em estoque na saída, campo de
> séries no Recebimento, e a aba "Séries" dentro de "Lotes e Séries" com bloqueio justificado. O
> aviso que existia aqui — "não ligue Controle por série até a interface existir" — está
> **superado**: a interface existe. A única ressalva que sobra é local: o modal rápido de
> entrada/saída dentro da tela de **Materiais** continua sem campo de série (e sempre recusa
> material controlado) — use a tela **Movimentações** para esses materiais. Ver a seção "Etapa 6b",
> mais abaixo, para o roteiro de teste completo e o que ainda não está coberto.
>
> **2026-08-11 — auditoria completa das 24 specs contra o código, e mais uma correção.** Todas as
> specs de feature foram conferidas contra o que o sistema faz de verdade e corrigidas onde
> mentiam (as piores: a 23 dizia que a auditoria "não era usada em produção" — é usada desde a
> Etapa 3; a 01 dizia que "Controle por lote" não fazia nada — faz desde a Etapa 6). A auditoria
> também achou um **bug real**: a tela de Requisições não conhecia os status **Totalmente/
> Parcialmente Reservada** da Etapa 4 — requisição aprovada com saldo aparecia com o código cru
> no badge e **sem os botões "Iniciar Separação" e "Cancelar Requisição"**. Corrigido
> (`92fe236`), com teste. Ver a linha nova na tabela da Etapa 4 abaixo.
>
> A **Etapa 6 (Lotes)** fechou o motor: lote deixou de ser um campo de texto que o sistema
> guardava e nunca olhava e virou um cadastro de verdade, com validade, corrida, certificado do
> fornecedor e situação (ativo / bloqueado / reprovado). O lote nasce no recebimento, o sistema
> recusa tirar de um lote mais do que aquele lote tem, recusa consumir lote vencido, bloqueado ou
> reprovado, e sugere sozinho o lote que vence primeiro na hora da saída.
>
> **O review da Etapa 6 achou três rotas prontas sem nenhuma tela** — a mais grave: com "Requer
> certificado" ligado, o lote nascia bloqueado e só um desenvolvedor por API conseguia destravar.
> A **Task 9**, aprovada pelo cliente em 2026-08-09, fechou essa lacuna: nova tela **Almoxarifado →
> Lotes** (mudar status, liberar vencimento, anexar certificado) e **Sucata**/**Perda** agora
> selecionáveis na tela de Movimentações. Ver a seção "Task 9", logo depois da Etapa 6 abaixo.
>
> **A Etapa 6 (+ Task 9) cobriu LOTES; a Etapa 6b cobriu SÉRIE; a Etapa 6c cobriu ETIQUETA.** A
> feature 10 (lotes, séries e etiquetas) está completa por inteiro — foi dividida em três de
> propósito, porque era grande demais para uma etapa só.
>
> **Duas coisas continuam faltando, e você vai esbarrar nelas:**
> 1. **Reprovar na inspeção não marca o lote** — continua bloqueando o material inteiro.
> 2. **Duas decisões de negócio estão esperando você** (contagem de prateleira depois de um ajuste
>    global; e certificado de fornecedor sendo servido sem exigir login). Ambas explicadas em
>    "Pendências conhecidas", no fim deste documento.
>
> **O review final do branch (2026-08-10) achou três coisas que este guia e as specs declaravam
> ao contrário do que o sistema fazia, e as três foram corrigidas:**
> 1. **"Controle por lote" travava a entrega e a devolução.** O guia dizia que a opção exige lote
>    "em toda entrada e saída". Exigia mesmo — inclusive nas telas onde **não existe campo de
>    lote**: entregar uma requisição, excluir uma requisição, devolver material e sucatear
>    devolução. Na prática, ligar a opção tornava o material impossível de entregar, e a reserva da
>    requisição ficava presa sem poder ser consumida. Agora a exigência vale só onde você tem onde
>    digitar: **Movimentações** (as duas telas) e **Recebimentos**. Ver "O que a Etapa 6 não cobre".
> 2. **Reprocessar uma nota podia duplicar estoque.** Se a nota tinha dois itens e o segundo
>    falhava, o primeiro já tinha entrado — e clicar "Processar Nota" de novo entrava com ele
>    outra vez (10 viravam 20). Agora a nota é conferida inteira antes de mover qualquer coisa, e
>    item que já entrou não entra de novo.
> 3. **A lista de lotes mostrava um saldo que a saída recusava.** Se o lote estava endereçado numa
>    localização e a saída saía de outra, a tela dizia "saldo 25" e o sistema respondia "saldo
>    insuficiente: 0". Agora as duas pontas usam o mesmo número — o saldo total daquele lote.
>
> **A próxima é a Etapa 8 — Materiais de Clientes** (spec 13). Ver o planejamento mestre em
> `specs/modulo-almoxarifado/README.md` e o plano detalhado em
> `docs/superpowers/plans/2026-08-12-almoxarifado-etapa8-materiais-clientes.md`.

## Tabela consolidada — todas as alterações (Etapas 1 a 8)

Visão única de tudo que mudou. Os detalhes e roteiros de teste de cada linha estão nas seções da etapa correspondente, mais abaixo.

| Etapa | Onde | Antes | Agora |
|---|---|---|---|
| 1 | Movimentações | "Disponível" era só o saldo físico | Disponível = físico − bloqueado − inspeção − reservado |
| 1 | Movimentações | Campo de texto livre "referência" para OS/projeto | Vínculo estruturado: selects de Ordem de Serviço, Projeto e Centro de Custo |
| 1 | Movimentações | Saída de emergência não existia | Checkbox "Saída emergencial": exige justificativa e marca "PENDENTE REGULARIZAÇÃO" |
| 1 | Movimentações | Movimentação errada era excluída (apagava histórico) | **Estorno**: lançamento reverso com motivo obrigatório, badge "ESTORNADA" na original |
| 1 | Materiais | Custo médio não era recalculado | Toda entrada com custo unitário recalcula o custo médio |
| 1 | Materiais / Livro | Não havia histórico por item | Tela de **Extrato**: saldos, custo médio, saldo por localização, movimentações e reservas |
| 1 | Movimentações | Formulário simples (material, tipo, quantidade) | Formulário rico: localização origem/destino, lote, custo unitário, vínculos |
| 2 | Configurações | Um almoxarifado implícito | **Multi-almoxarifado** (os dados antigos migraram para o "ALM-GERAL") |
| 2 | Configurações / Motor | Localização sem restrições | Localização pode ser **bloqueada** ou restrita a tipos de material — o motor recusa movimento que contrarie |
| 2 | Configurações | Famílias em lista simples | Famílias com **subfamílias** (um nível) |
| 2 | Materiais | Formulário com poucos campos | Formulário em **6 seções** (técnicos, reposição, controles, ABC, unidades compra/consumo com fator) |
| 2 | Materiais | Edição sem rastro | Criação/edição de material grava **auditoria** (campo a campo, de/para) |
| 2 | Backend | Sem consulta de posições vazias / sem endereço | APIs `/localizacoes/vazias` e materiais sem endereço (ainda sem tela) |
| 3 | Requisições | Aceitava item com quantidade 0 ou negativa | **Bloqueado** nas duas rotas de criação |
| 3 | Requisições | Entrega baixava estoque por caminho próprio, sem auditoria | Entrega e estorno passam pelo **motor de estoque**: auditoria, respeita localização bloqueada e valida pelo **disponível** |
| 3 | Requisições | Requisição nascia direto como "Pendente" | **Rascunho**: "Salvar Rascunho" no formulário + "Enviar Requisição" depois |
| 3 | Requisições | Status paravam em "Entregue" | Novos status: **Aguard. Estoque**, **Aguard. Compra**, **Pronta p/ Retirada**, **Encerrada** |
| 3 | Requisições | Sem campo de tipo | **Tipo** com 14 opções — "Emergencial" exige justificativa obrigatória |
| 3 | Requisições | Sem centro de custo / local de entrega | Campos **Centro de Custo** (select) e **Local de Entrega** (texto) |
| 3 | Requisições | Ciclo parava na entrega | **Solicitante confirma o recebimento** (só ele — nem admin confirma no lugar) |
| 3 | Requisições | Aprovação sem trava | **Quem pediu não aprova a própria** (403); rejeição exige motivo; toda decisão auditada |
| 3 | Requisições | Não dava pra reaproveitar requisição antiga | **"Copiar como Novo Rascunho"** com os mesmos itens/tipo/vínculos |
| 4 | Requisições / Reservas | Reservar tornava o material inutilizável até para quem reservou | A entrega **consome a reserva da própria requisição** — acabou a corrida entre aprovar e entregar |
| 4 | Requisições | Aprovar não separava nada — o material podia ser consumido por outro antes da entrega | Aprovar **reserva automaticamente** os itens com saldo; a requisição vira **Totalmente/Parcialmente Reservada** |
| 4 | Reservas (tela nova) | Reserva não tinha tela | Tela **Almoxarifado → Reservas**: reservar à mão, liberar com motivo, transferir de projeto/OS, expiração opt-in |
| 4 | Requisições | *(correção de 2026-08-11)* A tela de requisições não conhecia os dois status de reserva: badge com o código cru, e a requisição aprovada ficava **sem** os botões "Iniciar Separação" e "Cancelar" | Badge, filtro e stepper mostram **Totalmente/Parcialmente Reservada**, e os botões aparecem — o caminho feliz pós-aprovação voltou a ser clicável |
| 5 | Recebimento | Aprovar recebimento de material crítico **sem inspeção prévia dava erro** — o material não entrava no sistema mesmo já estando no galpão | Entra sempre. Se exige inspeção, entra **retido** (fora do disponível) até alguém decidir |
| 5 | Inspeções (tela nova) | Não existia fila de inspeção nem forma de aprovar/reprovar pela tela | Tela **Inspeções**: lista o que está retido, aprova (total ou parcial) ou reprova com motivo e destino (devolver / engenharia / substituição) |
| 5 | Inspeções / Materiais | Bloquear um material achado com defeito na prateleira não tinha botão nem exigia justificativa | Botões **Bloquear/Desbloquear Material** na tela de Inspeções, com justificativa obrigatória e rastro no livro de movimentações |
| 5 | Movimentações | Desbloquear mais do que estava bloqueado "funcionava" e devolvia menos do que o pedido ao disponível, sem avisar | Desbloquear acima do bloqueado é **recusado** com erro — nunca mais silencioso |
| 6 | Movimentações | Dava para tirar 10 de um lote que tinha 2, e o sistema não reclamava — o saldo daquele lote ficava negativo em silêncio | Recusa e mostra o saldo real **daquele lote** |
| 6 | Movimentações | Na saída, o lote era um campo de texto: você digitava o que quisesse, inclusive um lote que não existe | Na saída virou uma **lista** dos lotes que têm saldo, já ordenada pelo que vence primeiro. Na entrada continua texto livre, porque é ali que um lote novo nasce |
| 6 | Movimentações | Material vencido saía normalmente para consumo | Lote vencido **não sai para consumo**. Continua podendo ser baixado como Sucata/Perda ou corrigido por Ajuste — vencido tem que poder sair do estoque |
| 6 | Movimentações | Não existia "lote bloqueado" nem "lote reprovado" | Lote tem situação (Ativo / Bloqueado / Reprovado) e o sistema recusa a saída dos dois últimos, com o motivo na mensagem |
| 6 | Materiais | A opção "Controle por lote" na ficha do material era decorativa: marcava e nada acontecia | Material com "Controle por lote" **exige lote** onde você tem onde digitá-lo: as duas telas de Movimentação e o Recebimento. Ajuste de inventário continua isento (é como você regulariza o estoque antigo sem lote), e a entrega/devolução por requisição também — essas telas ainda não têm campo de lote, e exigi-lo ali travava a operação (corrigido em 2026-08-10) |
| 6 | Materiais | A opção "Requer certificado" também era decorativa | Material com "Requer certificado" faz o lote **nascer bloqueado** no recebimento até o certificado do fornecedor ser anexado. O material **entra** no estoque normalmente — o que trava é a saída |
| 6 | Recebimentos | Não havia onde digitar lote, validade ou corrida — justamente na tela onde o lote nasce | Três campos por item: **Lote**, **Validade** e **Corrida**. O lote é criado no processamento da nota, já com fornecedor e número da NF |
| 6 | Movimentações / Extrato | Cada lote não tinha saldo próprio consultável | O saldo é por material **+ localização + lote**, e a coluna "Lote" do Extrato mostra o código do lote |
| 9 | Lotes (tela nova) | Bloquear/reprovar/reativar um lote, liberar vencimento e anexar certificado só existiam por API | Tela **Almoxarifado → Lotes**: escolhe o material, lista os lotes dele, e oferece as três ações |
| 9 | Lotes | Lote bloqueado por falta de certificado ficava travado pela interface para sempre (só desenvolvedor destravava por API) | Botão **"Anexar certificado"** — se o bloqueio era por falta dele, libera sozinho ao anexar |
| 9 | Movimentações | Sucata e Perda não estavam no seletor de tipo, mesmo o motor já aceitando as duas para descartar lote vencido | **Sucata** e **Perda** selecionáveis, com os mesmos campos que uma Saída pede |
| 6b | Materiais | A opção "Controle por número de série" era decorativa | Checkbox ganha texto explicando o efeito; material com a flag exige série na entrada e na saída |
| 6b | Movimentações (Entrada) | Não existia onde digitar série | Caixa de texto "um por linha" + contador `N/quantidade` + botão "Gerar sequência" (prefixo + início) |
| 6b | Movimentações (Saída/Sucata/Perda) | idem | Lista de séries em estoque com checkbox; filtra pelo lote quando um lote está selecionado |
| 6b | Recebimentos | Não havia onde digitar série na nota | Caixa "Séries (uma por linha)" por item, com contador contra a quantidade recebida |
| 6b | Lotes (tela) | Só existiam lotes | Vira **"Lotes e Séries"**: aba nova lista as séries do material com Bloquear/Desbloquear justificado |
| 6b | Extrato | Sem indicador de série | Cartão "Séries em estoque" para material com a flag |
| 6c | Recebimentos | Nota processada não tinha como gerar etiqueta dos itens | Botão **"Imprimir etiquetas dos itens"** na nota `PROCESSADO`/`APROVADO` — gera 1 etiqueta por série (material com controle de série) ou por lote (material com controle de lote), usando o texto digitado na nota |
| 6c | Lotes e Séries | Não existia como imprimir etiqueta de um lote/série específico | Botão de etiqueta por linha (lote e série, inclusive série já `ESTORNADA`/`SUCATEADA` — reimpressão); aba Séries ganha o bulk **"Etiquetas das séries em estoque"** |
| 6c | Lotes e Séries | Abrir a tela filtrada num lote/série exigia navegar manualmente | A tela aceita a URL `?material_id=&aba=&lote=/&serie=` (o que o QR da etiqueta codifica): abre já no material/aba certos, com a linha destacada |
| 6c | Materiais | Não existia etiqueta avulsa de material | Botão de etiqueta por linha: material sem controle de lote/série abre o modal direto; material controlado navega para "Lotes e Séries" (a etiqueta certa mora lá) |
| 6c | (novo) modal | — | **`EtiquetasPdfModal`**: escolhe o formato (folha A4 com 10 etiquetas, ou térmica 100×50mm 1 por página — o último escolhido fica lembrado), define cópias (etiqueta única) e gera o PDF com QR Code |
| 7 | Movimentações | Transferir material entre prateleiras só existia por API — nenhuma tela chamava | **Transferência** é um tipo do formulário, mostrando **origem E destino** ao mesmo tempo (Entrada mostrava só destino, Saída só origem) mais o seletor de lote |
| 7 | Movimentações | Material com "Controle por lote" transferia **sem dizer de qual lote saiu** — o oposto do que a opção promete | A transferência **exige o lote**. Na transferência **todos** os lotes servem, inclusive **bloqueado e vencido** — mover um lote reprovado de prateleira é legítimo, é assim que ele vai para a área de bloqueados |
| 7 | Movimentações | "Devolução" era uma opção do formulário que criava um lançamento **solto**: sem motivo, sem condição, sem destino, e **sem criar registro nenhum** de devolução | Saiu do formulário; um aviso embaixo do campo Tipo aponta a tela nova. Continua no **filtro do livro**, senão os lançamentos antigos sumiriam da consulta |
| 7 | Movimentações (livro) | O badge de Transferência saía **sem cor nenhuma** (classe de estilo inexistente — falha silenciosa) | Badge ciano-petróleo próprio: transferência não soma nem subtrai saldo, então pintá-la de verde (entrada) ou vermelho (saída) ensinaria a coisa errada |
| 7 | Devoluções (tela nova) | Devolver material só por API, sem dizer de qual entrega veio; qualquer quantidade de qualquer material passava | Tela **Almoxarifado → Devoluções**: escolhe o material, vê **as entregas dele** (data, quantidade, quem retirou, requisição/OS, quanto já foi devolvido) e devolve **limitado ao que ainda resta** |
| 7 | Devoluções | Não havia como devolver "mais do que foi entregue" ser recusado — não existia o conceito | Recusa dizendo **quanto resta**: *"a saída 1 entregou 10, já foram devolvidos 4 e restam 6"*. Devolução **avulsa** (sem entrega registrada) continua possível, para sobra antiga ou material entregue antes do sistema |
| 7 | Devoluções | Devolução de material com controle de lote entrava **sem lote** e o saldo ficava **preso** (a saída seguinte exige lote e não achava nenhum) | O lote é **herdado da entrega** escolhida (aparece em modo leitura); na devolução avulsa, seletor de lote obrigatório |
| 7 | Devoluções | Devolver peça com número de série voltava o **saldo sem voltar a peça** — a série continuava "Entregue" | A série volta para **"Em estoque"** junto. Nos destinos Sucata/Retrabalho a tela **não** oferece as séries e explica o caminho de dois passos |
| 7 | Devoluções | **Devolver para Sucata baixava o estoque duas vezes** (o material já tinha saído na entrega, e a sucata descontava de novo) | O saldo **não muda** e o livro registra as duas linhas (Entrada de devolução + Sucata). **Ver o aviso de produção na seção da Etapa 7** |
| 7 | Devoluções | Devolução **recusada** deixava a linha gravada mesmo assim — e a linha fantasma encolhia **para sempre** o que ainda podia ser devolvido daquela entrega | Recusa não deixa registro; se metade já tiver mexido no estoque, a linha fica marcada como estado parcial na auditoria (resolução manual pela tela de Movimentações) |
| 8 | Materiais | Material de cliente vivia numa **lista à parte**, com descrição em texto livre, sem lote, sem série, sem endereço, sem extrato, sem etiqueta e **fora do motor de estoque** | É **material normal com dono**: na ficha do material, a seção **Propriedade** define o proprietário (ou "GMP — estoque próprio"). Tudo que as Etapas 1 a 7 entregaram passa a valer para ele |
| 8 | Materiais / Movimentações / Extrato | Nada distinguia a chapa do cliente da nossa numa listagem | **Selo de propriedade** com o **nome do cliente** ao lado do material, nas três telas. O selo diz *de quem é*, não só *que é de alguém* |
| 8 | Movimentações | **Nada impedia** usar a chapa do Cliente A no equipamento do Cliente B | Saída de material de cliente **exige OS ou projeto daquele mesmo cliente**; a recusa **nomeia os dois** (o dono e o do vínculo) para você saber qual das pontas está errada |
| 8 | Movimentações | A "Saída emergencial" liberava qualquer saída sem vínculo, com justificativa | Material de cliente **não aceita saída emergencial** — única exceção deliberada. "Regularizo depois" não é resposta para o dono da chapa |
| 8 | Movimentações | Qualquer ALMOXARIFE podia zerar o saldo da chapa do cliente por um AJUSTE, pelas duas rotas | Ajustar saldo de material de cliente exige a permissão **`ajustar_material_cliente`** (só ADMINISTRADOR), com auditoria **nomeando o cliente**. Ajuste de material nosso não mudou |
| 8 | Recebimentos | Material de cliente entrava sem nenhum documento | Recebimento com item de material de cliente **exige o número da nota** (a nota de remessa) — e **recusa a nota inteira**. Material nosso continua entrando sem nota |
| 8 | Dashboard / Relatórios / Compras | O material de terceiro **contava como patrimônio nosso** no valor total do estoque, e o sistema chegaria a **abrir pedido de compra** para repor a chapa de outra empresa | Material de cliente fica **fora** de: valor total do estoque, materiais críticos, materiais zerados, reposição de mínimo, sugestão automática de compra, alerta de estoque baixo e relatório de posição |
| 8 | Mapa de Localizações / Bloqueados | — | Material de cliente **continua aparecendo** na ocupação de prateleira e no relatório de materiais bloqueados — **de propósito**: a chapa está fisicamente lá e é bloqueada de verdade; escondê-la faria a tela mentir |
| 8 | Materiais de Clientes (tela nova) | Não existia tela nenhuma | Tela **Almoxarifado → Materiais de Clientes**: escolhe o cliente e vê recebido, consumido, devolvido e saldo por material, mais em quais OS/projetos foi aplicado; **PDF de posição** e botão **Devolver ao cliente** |
| 8 | Materiais de Clientes | Não havia como registrar a saída do material de volta para o dono | Tipo de movimento novo **Devolução ao cliente** (saída, pelo motor — lote, série e endereço funcionam), com **número do documento obrigatório**. Não confundir com a tela de Devoluções da Etapa 7, onde o material **volta** para o estoque |

## Etapa 0 — Fundação (resumo)

Antes de qualquer coisa nova, foi criada uma base de testes automáticos para o módulo, todas as movimentações de estoque passaram a usar um único mecanismo interno (nada mais grava saldo "por fora"), e toda saída/ajuste de estoque passou a exigir um motivo. Não há nada novo para clicar aqui — é o alicerce das etapas seguintes.

---

## Etapa 1 — Motor de Estoque (o que mudou)

| Antes | Agora |
|---|---|
| O sistema calculava "disponível" só como o saldo físico | "Disponível" agora desconta reservado, bloqueado e em inspeção: `físico − bloqueado − inspeção − reservado` |
| Movimentação tinha um campo de texto livre "referência" para anotar OS/projeto | Movimentação tem campos próprios de vínculo: Ordem de Serviço, Projeto e Centro de Custo (selects, não texto) |
| Não existia saída de emergência formal | Existe checkbox "Saída emergencial" — libera a saída mesmo sem os requisitos normais, mas exige justificativa e marca a movimentação como "pendente de regularização" |
| Uma movimentação errada só podia ser excluída (apagando o histórico) | Movimentação errada é **estornada** (nunca excluída): cria um lançamento reverso, motivo obrigatório, e a linha original fica com badge "ESTORNADA" |
| Custo médio do material não era recalculado automaticamente | Toda entrada com custo unitário recalcula o custo médio do material |
| Não existia uma tela de histórico por item | Nova tela de **Extrato** por material: saldo físico/reservado/bloqueado/em inspeção/disponível, custo médio, saldo por localização, últimas 100 movimentações e reservas ativas |
| Formulário de movimentação era simples (material, tipo, quantidade) | Formulário rico: localização de origem/destino, lote, custo unitário, vínculo (OS/Projeto/Centro de custo) |

O que ainda falta nesta frente: a entrada/saída rápida que existe dentro da tela de Materiais ainda usa o caminho antigo (mais simples, sem localização/lote) — só a tela de Movimentações usa o formulário novo completo.

> **Correção de 2026-08-09:** este parágrafo dizia que ainda faltava "validar saída de lote vencido
> ou reprovado — depende do controle de lotes ainda não implementado (Etapa futura)". **Isso foi
> entregue na Etapa 6** (ver a seção da Etapa 6 abaixo). Deixamos o registro em vez de apagar,
> porque a instrução do projeto é que uma afirmação que virou mentira seja corrigida às claras.

### Roteiro de teste manual (Etapa 1)

Vá em **Almoxarifado → Movimentações**.

1. **Nova movimentação normal.** Clique em "Nova Movimentação". Escolha um material, tipo "Entrada", quantidade, e opcionalmente localização de destino, lote e custo unitário. Confirme. A linha aparece no livro com saldo anterior/posterior corretos.
2. **Saída com vínculo.** Clique em "Nova Movimentação" de novo, tipo "Saída". Preencha o motivo (obrigatório) e escolha uma Ordem de Serviço, Projeto ou Centro de Custo na seção "Vínculo". Confirme. Na coluna "Vínculo" do livro deve aparecer o nome/código escolhido.
3. **Caso de erro esperado — saldo insuficiente.** Tente uma saída com quantidade maior que o "Disponível" mostrado abaixo do campo Quantidade. O sistema deve recusar (mensagem de erro) e nada deve mudar no saldo.
4. **Caso de erro esperado — saída sem motivo.** Tente confirmar uma saída com o campo Motivo vazio. O formulário deve bloquear (campo obrigatório).
5. **Saída emergencial.** Tipo "Saída", marque o checkbox "Saída emergencial (regularizar depois)". Preencha o motivo e confirme mesmo com pouco embasamento. A linha deve aparecer no livro com o badge amarelo "PENDENTE REGULARIZAÇÃO".
6. **Estornar uma movimentação.** Na tabela do livro, clique no ícone de "Estornar" (seta curva) em qualquer linha que não seja um Estorno. Preencha o motivo (obrigatório) e confirme. A linha original fica esmaecida com o badge "ESTORNADA", e uma nova linha do tipo "Estorno" aparece no livro. Confira que o saldo do material voltou ao valor anterior (veja o Extrato, passo 8).
7. **Caso de erro esperado — estornar sem motivo.** Abra o estorno de novo e tente confirmar com o campo de motivo vazio — o botão "Confirmar Estorno" deve ficar desabilitado.
8. **Extrato do item.** Clique no nome de qualquer material na coluna "Material" do livro (ou vá em **Materiais**, clique no ícone "Extrato" de qualquer linha). Confira os cartões de saldo (Físico, Reservado, Bloqueado, Em inspeção, Disponível, Custo médio), a tabela de saldos por localização e as últimas movimentações.
9. **Filtros do livro.** Use o filtro "Todos os tipos" para filtrar por tipo (inclui "Estorno" na lista) e o filtro de datas.

---

## Etapa 2 — Cadastros Completos (o que mudou)

| Antes | Agora |
|---|---|
| Só existia um almoxarifado implícito | Multi-almoxarifado: você pode cadastrar vários almoxarifados, que representam **áreas físicas de alocação dentro do mesmo site** (ex.: galpão, mezanino, área externa) — **não** filiais. Todas as localizações que já existiam foram automaticamente vinculadas a um almoxarifado chamado "ALM-GERAL" — nada se perdeu. O saldo do material continua sendo **um só**, somado em todas as áreas: o almoxarifado serve para você achar onde o item está fisicamente, não para separar estoques |
| Localizações não tinham restrição | Uma localização agora pode ser **bloqueada** (impede entrada/saída ali) ou restrita a certos **tipos de material** — e o motor de estoque recusa a movimentação se você tentar contrariar isso |
| Famílias de material eram uma lista simples | Famílias podem ter **subfamílias** (um nível abaixo) |
| Formulário de material tinha poucos campos | Formulário reorganizado em 6 seções com todos os campos técnicos: Identificação, Classificação, Dados Técnicos, Estoque e Reposição, Controles, Unidades e Custos (inclui classe ABC, unidade de compra/consumo com fator de conversão) |
| Editar um material não deixava rastro | Toda criação/edição de material grava auditoria (o que mudou, de que valor para que valor) |
| Não havia como consultar posições vazias ou materiais sem endereço | Duas consultas novas no backend (`/localizacoes/vazias` e relatório de materiais sem endereço) — **ainda sem tela própria**, ver Pendências abaixo |

### Roteiro de teste manual (Etapa 2)

**A) Formulário de material em seções**

1. Vá em **Almoxarifado → Materiais → Novo Material**. Confira as 6 seções: Identificação, Classificação, Dados Técnicos, Estoque e Reposição, Controles, Unidades e Custos.
2. Preencha só os campos obrigatórios (Código, Nome, Família) e deixe tudo o mais em branco. Salve — deve salvar normalmente (os campos novos são opcionais).
3. Em "Classificação", escolha uma Família e veja o select "Subfamília" habilitar. Se a família não tiver subfamílias cadastradas, aparece o aviso "Esta família não tem subfamílias cadastradas" (veja nota abaixo).
4. Em "Unidades e Custos", escolha uma "Unidade de Compra" (ex.: CX) sem preencher o "Fator de Conversão (Compra)" e tente salvar. **Caso de erro esperado**: o sistema pede o fator antes de enviar.

   > Nota honesta: **criar uma subfamília ainda não tem tela própria** — hoje só é possível via chamada direta à API. O que existe na interface é o *select* de subfamília dentro do formulário de material (que já funciona, mas só mostra subfamílias que alguém cadastrou por fora).

**B) Gestão de Almoxarifados**

5. Vá em **Almoxarifado → Configurações → aba "Setores e Áreas"**. No topo da página está o bloco "Almoxarifados".
6. Clique em "Novo Almoxarifado", preencha Código e Nome, salve. Ele aparece na tabela como "Ativo".
7. Clique no ícone de lixeira ("Inativar") em um almoxarifado que já tem localizações vinculadas (por exemplo, o "ALM-GERAL"). **Caso de erro esperado**: o sistema recusa com uma mensagem porque existem localizações ativas vinculadas a ele.

**C) Restrições de localização**

8. Ainda em Configurações, vá na aba "Localizações". Clique no ícone de lápis ("Editar") de qualquer localização.
9. No formulário "Editar Localização", marque o checkbox "🔒 Localização bloqueada" e salve.
10. Vá em **Movimentações**, tente fazer uma Entrada escolhendo essa localização como destino (ou uma Saída escolhendo-a como origem). **Caso de erro esperado**: a movimentação é recusada porque a localização está bloqueada. Depois desmarque o checkbox para não deixar a localização travada.
11. Volte em "Editar Localização" de outra posição e marque um ou mais "Tipos de material permitidos" (ex.: só "Ferramenta"). Tente uma movimentação de um material de tipo diferente para essa localização. **Caso de erro esperado**: recusado por incompatibilidade de tipo.

**D) Mapa de localizações**

12. Vá em **Almoxarifado → Mapa**. Use o filtro por Almoxarifado no topo para restringir a visão a um depósito específico.
13. Localize a posição que você bloqueou no passo 9 (se ainda estiver bloqueada) — ela aparece com contorno tracejado vermelho e o ícone 🔒 no canto.

---

## Etapa 3 — Requisições Ponta a Ponta (ENTREGUE — 2026-08-05)

O fluxo de requisição de materiais (o funcionário pede material, o almoxarifado separa e entrega) já era a parte mais madura do módulo — a Etapa 3 fechou as lacunas que faltavam para o ciclo completo, do pedido até a confirmação de recebimento.

| Antes | Agora |
|---|---|
| Era possível criar uma requisição com quantidade zero ou negativa em um item | Bloqueado nas duas rotas de criação (mensagem de erro, item nenhum é salvo) |
| A entrega de uma requisição baixava estoque por um caminho próprio, sem passar pelas mesmas validações do motor (bloqueio de localização, saldo negativo, etc.) e sem gravar auditoria | Entrega e estorno passam pelo mesmo motor da Etapa 1 (`stockService.registrarMovimentacao`): auditoria completa, saldo por localização, localização bloqueada é respeitada, e a entrega passa a considerar o **disponível** (descontando reserva/bloqueio de terceiros), não só o saldo físico |
| Uma requisição nascia direto como "Pendente" (enviada) | Pode nascer como **Rascunho** (botão "Salvar Rascunho" no formulário) e ser enviada depois (botão "Enviar Requisição") |
| Só existiam os status até "Entregue" | Novos status: **Aguardando Estoque** / **Aguardando Compra** (a requisição cai automaticamente aqui na aprovação se nenhum item tiver saldo disponível — em "Aguardando Compra" quando já existe uma solicitação de compra pendente para o material), **Pronta p/ Retirada** (o almoxarife libera depois de separar) e **Encerrada** (fecha de vez, bloqueia qualquer entrega futura) |
| Não existia um campo formal de "tipo" da requisição | Campo **Tipo** com 14 opções (Consumo, Ordem de Produção, Ordem de Serviço, Projeto, Montagem, Instalação Externa, Assistência Técnica, Manutenção, Desenvolvimento, Administrativo, Emergencial, Ferramenta, EPI, Material do Cliente) — requisições do tipo **Emergencial** exigem uma justificativa obrigatória no formulário |
| Não existiam campos de Centro de Custo / Local de Entrega | Formulário ganhou os campos **Centro de Custo** (select) e **Local de Entrega** (texto) |
| Quem entregava marcava como "entregue" e o ciclo parava aí | O **solicitante** confirma o recebimento (botão "Confirmar Recebimento", só aparece pra quem pediu — nem admin confirma no lugar de outra pessoa) |
| Só existia aprovação simples (um perfil aprova/rejeita) e aprovação por valor, sem trava nenhuma | **Quem pediu a requisição não pode aprovar a própria** (nas duas aprovações — simples e por valor) — o botão de aprovar aparece pra qualquer outro usuário com permissão, mas o backend recusa (403) se for o próprio solicitante. Rejeitar a própria continua permitido (é desistência, não aprovação). **Rejeição sempre exige motivo** (o botão de confirmar no modal fica desabilitado até preencher). Toda decisão (aprovar, rejeitar, confirmar recebimento, encerrar) fica registrada com usuário, data e justificativa |
| Não dava pra reaproveitar uma requisição antiga | Botão **"Copiar como Novo Rascunho"** — gera um novo rascunho com os mesmos itens/tipo/vínculos (sem as quantidades já entregues) |

O que a Etapa 3 **não** cobre (fica para etapas futuras — ver "Pendências conhecidas" no fim deste documento): anexos na requisição, assinatura digital na retirada, importar itens de uma lista técnica/ordem de produção, reserva automática de estoque com status próprio (Aguardando/Parcialmente/Totalmente Reservada — Etapa 4), registrar lote/série na entrega, e uma tela de configuração de regras de aprovação (hoje as regras — segregação e limite por valor — são fixas no código, não configuráveis pela interface).

### Roteiro de teste manual (Etapa 3) — ciclo completo

> **Importante: esta etapa precisa de DOIS usuários.** A regra de segregação bloqueia quem pediu a requisição de aprovar a própria — você vai precisar logar com um segundo usuário (perfil com permissão de aprovar requisições: Admin, Almoxarife ou Gestor) numa aba anônima ou outro navegador para aprovar a requisição do primeiro.

Vá em **Almoxarifado → Requisições**.

1. **Criar como rascunho.** Clique em "Nova Requisição", escolha um Tipo (ex.: "Consumo"), adicione pelo menos um item com quantidade, preencha Centro de Custo/Local de Entrega se quiser, e clique em **"Salvar Rascunho"** (em vez de "Enviar Requisição"). A requisição aparece na lista com o badge **Rascunho** e não dispara e-mail nenhum ainda.
2. **Enviar o rascunho.** Abra o detalhe da requisição criada no passo 1 e clique em **"Enviar Requisição"**. O status passa para **Pendente** — só agora o e-mail ao almoxarifado e a avaliação de aprovação por valor (se configurada) entram em ação.
3. **Aprovar com OUTRO usuário.** Faça login com um segundo usuário (perfil Admin/Almoxarife/Gestor, diferente de quem criou a requisição) numa aba anônima. Abra a mesma requisição e clique em **"Aprovar e Separar"** (ou "Só Aprovar"). Deve funcionar normalmente e o status avança (para **Em Separação**, ou para **Aguard. Estoque**/**Aguard. Compra** se nenhum item tiver saldo disponível).
4. **Separar e liberar para retirada.** Ainda como o segundo usuário (ou almoxarife), registre a separação dos itens e clique em **"Liberar para Retirada"**. Status vira **Pronta p/ Retirada**.
5. **Entregar.** Use a ação de entrega normal (como já funcionava antes), informando a quantidade atendida de cada item. Status vira **Entregue** (ou **Parcialmente Atendida** se sobrou saldo pendente).
6. **Confirmar recebimento — volte para o PRIMEIRO usuário (o solicitante).** Faça login de novo com quem criou a requisição, abra o detalhe e clique em **"Confirmar Recebimento"**. (O caso de erro "Confirmar recebimento por quem não é o solicitante", logo abaixo, prova que só o solicitante consegue.)
7. **Encerrar.** Com um usuário com permissão de aprovar requisições (Admin/Almoxarife/Gestor), clique em **"Encerrar Requisição"** no modal de confirmação. Status vira **Encerrada** e a requisição não aceita mais entregas.
8. **Copiar.** Em qualquer requisição que não seja rascunho, clique em **"Copiar como Novo Rascunho"**. Confira que abre/gera um novo rascunho com os mesmos itens e tipo, mas sem nenhuma quantidade entregue.

### Casos de erro esperados

- **Aprovar a própria requisição.** Logado como quem criou a requisição, tente aprovar. Deve ser recusado (403) e o status não muda — só um usuário diferente do solicitante pode aprovar.
- **Rejeitar sem motivo.** Abra o modal de "Rejeitar", deixe o campo de motivo vazio. O botão de confirmar fica desabilitado — não dá nem para tentar enviar sem preencher.
- **Item com quantidade zero (ou negativa).** No formulário de criação, tente salvar um item com quantidade 0. A criação é bloqueada com mensagem de erro, tanto ao salvar rascunho quanto ao enviar direto.
- **Entrega acima do disponível quando há reserva de terceiro.** Se o material tiver parte do saldo reservado para outra requisição/projeto, tentar entregar mais do que o disponível (saldo físico menos o reservado de terceiros) é recusado (400) e nada muda no estoque — mesmo que o saldo físico total pareça suficiente.
- **Confirmar recebimento por quem não é o solicitante.** Logado como outro usuário (inclusive admin), tentar confirmar o recebimento de uma requisição que não é sua é recusado (403) — não existe bypass de admin aqui.
- **Requisição Emergencial sem justificativa.** Escolha o tipo "Emergencial" no formulário e tente enviar sem preencher a justificativa — bloqueado.

---

## Etapa 4 — Reservas de Estoque (ENTREGUE — backend 2026-08-05, tela 2026-08-06)

Reservar material é "separar no sistema" antes de entregar: o saldo continua fisicamente lá, mas deixa de estar disponível para outra pessoa pegar.

**O problema que esta etapa consertou é importante entender.** Antes dela, reservar era uma armadilha: reservar 10 unidades para um projeto tornava essas 10 indisponíveis para **todo mundo, inclusive o projeto que reservou**. Não existia jeito de consumir o que você mesmo reservou — a única saída era cancelar a reserva, devolvendo o material ao bolo geral, e correr para dar baixa antes que outro consumisse. Era por isso que essa função nunca tinha ganhado tela.

| Antes | Agora |
|---|---|
| Reservar tornava o material inutilizável até para quem reservou | A saída pode citar a reserva e consumir o que foi separado para ela; a reserva vai baixando conforme o consumo e fecha quando zera |
| Aprovar requisição não separava nada — o material podia ser consumido por outro antes da entrega | Aprovar **reserva automaticamente** os itens que têm saldo; a requisição passa a **Totalmente Reservada** ou **Parcialmente Reservada** |
| Entregar disputava o estoque com todo mundo | A entrega consome a reserva da própria requisição — acabou a corrida entre aprovar e entregar |
| Reserva de um projeto não podia ser passada para outro | **Transferência** de reserva entre projetos/OS (exige perfil que possa reservar para outra OS) |
| Reserva esquecida segurava saldo para sempre | **Expiração**: reserva com prazo vencido é liberada e devolve o saldo. É **opt-in** — só expira se você preencher a configuração `reserva_dias_validade` ou informar a data na reserva, senão as reservas que já existem não somem sozinhas |
| Cancelar requisição deixava o material reservado preso | Cancelar **solta as reservas** daquela requisição e devolve ao disponível |

### Roteiro de teste manual (Etapa 4)

A tela fica em **Almoxarifado → Reservas**. Os passos 1 a 6 testam a automação (a reserva que nasce da aprovação); os passos 7 a 10 testam a tela.

1. **Veja o disponível cair sem o físico mudar.** Escolha um material com saldo e olhe o **Extrato** (Materiais → ícone Extrato): anote "Físico" e "Disponível".
2. **Aprove uma requisição.** Crie uma requisição desse material com um usuário, aprove com **outro** (a segregação continua valendo). O status deve virar **Totalmente Reservada** (ou **Parcialmente Reservada**, se o saldo não cobrir tudo).
3. **Volte ao Extrato.** O "Físico" deve estar igual e o "Disponível" deve ter caído pela quantidade da requisição. Na lista de reservas do extrato deve aparecer a reserva nova.
4. **Caso de erro esperado — outro consumir o reservado.** Em Movimentações, tente uma **Saída** desse material acima do disponível (mas abaixo do físico). Deve ser recusado: o saldo está reservado para a requisição.
5. **Entregue a requisição.** Separe e entregue normalmente. A entrega deve funcionar — ela consome a reserva, não disputa o disponível. Depois confira no Extrato que o físico caiu e o reservado voltou a zero (a reserva foi consumida).
6. **Cancele uma requisição reservada.** Crie e aprove outra requisição do mesmo material (para gerar a reserva) e então **cancele**. O "Disponível" no Extrato deve voltar ao valor de antes — o material não fica preso.
7. **Abra Almoxarifado → Reservas.** O filtro já vem em "Ativa". A reserva criada pela aprovação aparece com a etiqueta **REQ #número** (as feitas à mão aparecem como MANUAL). Confira as três colunas de quantidade: **Reservado** é o total, **Consumido** é o que a entrega já baixou e **Saldo** é o que ainda está preso — numa reserva entregue pela metade os três são diferentes, e é o Saldo que importa.
8. **Reserve à mão.** Botão **Nova Reserva**: escolha material e quantidade. O select mostra o **disponível** (não o físico), então uma quantidade acima do que aparece ali deve ser recusada pelo servidor. Volte ao Extrato do material e veja o disponível cair.
9. **Libere parcialmente.** No cadeado da linha, informe uma quantidade **menor** que o saldo e um motivo. Só aquela parte volta ao disponível e a reserva continua ativa com o saldo reduzido. Ao liberar uma reserva **REQ #**, a tela avisa antes: soltar devolve o material ao bolo geral e a entrega daquela requisição volta a disputar estoque.
10. **Transfira e confira que nada se moveu.** No ícone de setas, troque o destino (de projeto para OS, por exemplo). Físico, reservado e disponível do material devem ficar **exatamente iguais** — transferência troca o dono, não move saldo. O destino antigo não pode continuar aparecendo junto do novo.

> **Expiração:** o botão **Processar expiração** (só para administrador) roda o job que libera as reservas vencidas. Reserva sem prazo nunca expira — é opt-in, e sem a configuração `reserva_dias_validade` nada vence sozinho.

### O que a Etapa 4 não cobre

Reserva por lote/série. Prioridade na reserva. E-mail de aviso de reserva vencida.

> **Nota de 2026-08-09:** aqui estava escrito "reserva por lote/série (depende do controle de
> lotes)". O controle de **lotes** passou a existir na Etapa 6 — a dependência caiu, mas a reserva
> por lote **continua não implementada**: reservar continua sendo do material. Série segue sem
> existir (Etapa 6b).

> **Fechado em 2026-08-06:** a liberação por valor (`/aprovar-valor`) passou a reservar como a aprovação normal, e **excluir** uma requisição passou a soltar as reservas dela (antes só cancelar soltava). Se você usa liberação por valor, o material aprovado por essa via agora fica reservado — a requisição aparece como **Totalmente/Parcialmente Reservada** em vez de só **Aprovada**.

> **Corrigido em 2026-08-11 (`92fe236`):** desde a entrega desta etapa, a tela de **Requisições**
> não conhecia os dois status de reserva — o passo 2 do roteiro acima mostrava o código cru
> (`TOTALMENTE_RESERVADA`) no lugar do badge, o stepper voltava para "Criar" e, pior, a requisição
> aprovada ficava **sem os botões "Iniciar Separação" e "Cancelar Requisição"** (o backend sempre
> aceitou; era só a tela que não dava o caminho). Se você rodou o roteiro antes dessa data e viu
> isso, era este bug.

---

## Etapa 5 — Quarentena e Bloqueio de Qualidade (ENTREGUE — 2026-08-08)

Esta etapa mexe em como o almoxarifado lida com material que **precisa de inspeção antes de
poder ser usado** (peça crítica, que exige conferência de qualidade) e com material que alguém
**bloqueia na prateleira** por ter achado um problema (avaria, defeito).

**A mudança mais visível: aprovar o recebimento de um material crítico deixou de dar erro.**
Antes, se o material estivesse marcado como "crítico" (Materiais → editar → seção
Classificação → checkbox "Material crítico") e ainda não tivesse sido inspecionado, o sistema
**recusava** processar a nota fiscal — mesmo o caminhão já tendo descarregado o material no
galpão. Ou seja: o sistema fingia que o material não existia. Agora o recebimento é sempre
processado — o físico sobe normalmente — mas, se o material exige inspeção, ele entra **retido**:
fora do que pode ser usado (reservado, requisitado, consumido), até alguém decidir na tela nova
se aprova, aprova em parte, ou reprova.

| Antes | Agora |
|---|---|
| Aprovar/processar recebimento de material crítico sem inspeção prévia dava erro — a mercadoria não entrava no sistema mesmo já estando fisicamente no galpão | O recebimento é sempre processado. Se o material exige inspeção, ele entra no estoque físico mas fica **retido** (não aparece no "Disponível") até ser decidido |
| Não existia uma tela para ver o que está esperando inspeção nem para decidir | Nova tela **Almoxarifado → Inspeções**: lista tudo que está retido, com material, recebimento de origem e há quantos dias está esperando |
| Decidir a inspeção era "tudo ou nada" pelo formulário antigo de recebimento, e o cálculo de saldo tinha um bug: bloquear 10 unidades tirava 20 do disponível | Decisão nova aprova o lote inteiro ou só uma parte (ex.: recebeu 100, 10 vieram amassadas: aprova 90, reprova 10) — a conta é validada (aprovado + reprovado tem que fechar com o que estava retido) e o saldo sai certo |
| Reprovar um material não registrava para onde ele deveria ir | Reprovar pede uma observação (obrigatória) e um encaminhamento: Devolver ao fornecedor / Análise da Engenharia / Substituição |
| Bloquear um material achado com defeito na prateleira (fora do fluxo de recebimento) não tinha botão nem exigia motivo | Botões **Bloquear Material** / **Desbloquear Material** na tela de Inspeções, com justificativa sempre obrigatória, e fica registrado no livro de movimentações |
| Desbloquear uma quantidade maior do que estava bloqueada "funcionava" e devolvia menos material ao disponível do que o pedido, sem avisar ninguém | Desbloquear acima do que está bloqueado é **recusado** com mensagem de erro — nunca mais silencioso |

### Roteiro de teste manual (Etapa 5)

**A) Preparar um material crítico**

1. Vá em **Almoxarifado → Materiais**, edite um material (ou crie um novo). Na seção
   **Classificação**, marque o checkbox **"Material crítico"** e salve. Anote o código dele.

**B) Levar um recebimento até a entrada em estoque**

2. Vá em **Almoxarifado → Recebimentos**, clique em **"Novo Recebimento"**. Deixe "Somente pela
   Nota Fiscal", preencha um número de nota e fornecedor, e em "Materiais recebidos" busque e
   adicione o material crítico do passo 1 com uma quantidade. Salve.
3. Abra o recebimento criado e avance o fluxo clicando nos botões que aparecem, na ordem: **Iniciar
   Conferência (Almoxarifado)** → **Finalizar Conferência** → **Encaminhar para Compras** →
   **Encaminhar para Faturamento**.
4. Clique em **"Preencher Dados da NF (Faturamento)"**, preencha número/data de emissão/data de
   entrada/valor total da nota, e salve.
5. Clique em **"Processar Nota — Estoque + Contas a Pagar"** e confirme. **Isto é o que antes dava
   erro** ("Item crítico requer inspeção") — agora conclui normalmente.

**C) Ver o material retido**

6. Vá em **Materiais**, abra o **Extrato** do material crítico. O cartão **"Físico"** já mostra a
   quantidade recebida, mas **"Em inspeção"** mostra a mesma quantidade e **"Disponível"** está
   zerado (ou não subiu) — o material está no galpão, mas ninguém consegue reservar ou requisitar
   ele ainda.

**D) Decidir a inspeção**

7. Vá em **Almoxarifado → Inspeções**. O item aparece na fila, com o material, a quantidade
   retida, o recebimento de origem e há quantos dias está esperando.
8. Clique no ícone de decisão (✓). O formulário já vem com "Quantidade aprovada" = tudo o que está
   retido e "Quantidade reprovada" = 0 (aprovar o lote inteiro é o caso mais comum). Para testar a
   aprovação parcial, mude para aprovar uma parte e reprovar outra (ex.: recebeu 20 → aprova 15,
   reprova 5). **Caso de erro esperado:** se a soma de aprovado + reprovado não bater exatamente
   com o retido, o formulário recusa antes de chamar o servidor.
9. Ao reprovar qualquer quantidade, o campo **Encaminhamento** aparece (Devolver ao fornecedor /
   Análise da Engenharia / Substituição) e o campo **Observações** passa a ser obrigatório — é o
   único registro de por que aquele material foi barrado.
10. Salve. Volte ao Extrato do material (passo 6): a parte aprovada some de "Em inspeção" e entra
    em "Disponível"; a parte reprovada some de "Em inspeção" e aparece em "Bloqueado".

**E) Bloqueio avulso (fora do fluxo de recebimento)**

11. Ainda em **Almoxarifado → Inspeções**, clique em **"Bloquear Material"** no topo da página.
    Escolha qualquer material com saldo, informe uma quantidade e uma justificativa (obrigatória —
    tente salvar sem preencher para ver a recusa), e confirme. Confira no Extrato que o
    "Disponível" caiu e "Bloqueado" subiu.
12. Clique em **"Desbloquear Material"**, escolha o mesmo material e a mesma quantidade, informe
    justificativa e confirme. O disponível volta.
13. **Caso de erro esperado.** Bloqueie uma quantidade pequena (ex.: 5) e tente desbloquear mais do
    que isso (ex.: 30). O sistema recusa com uma mensagem — nada muda no saldo. Antes desta etapa,
    isso "funcionava" e devolvia menos material do que o pedido ao disponível, sem avisar.

> **Quem pode fazer o quê:** decidir uma inspeção (aprovar/reprovar) exige o mesmo perfil de
> Almoxarife de sempre. **Bloquear/desbloquear material avulso pela tela nova exige um perfil
> diferente** (Administrador ou Gestor) — um Almoxarife comum consegue decidir inspeções, mas não
> vai ver os botões de bloqueio avulso habilitados.

### O que a Etapa 5 não cobre

- **Plano de inspeção com medidas e instrumento** (o que medir, critérios técnicos, qual
  paquímetro/instrumento foi usado) — depende de calibração de ferramentas, que é uma etapa futura.
- **Não conformidade formal numerada** (um registro tipo "NC #123" com fluxo próprio) — o que
  existe é o encaminhamento (Devolver/Engenharia/Substituição) anotado na decisão, mais simples.
- **Liberação sob desvio autorizado** ("aceitar mesmo fora do padrão, com autorização de alguém
  responsável e histórico") — não implementado.
- **A devolução ao fornecedor não acontece sozinha.** Reprovar deixa o material **bloqueado** —
  alguém ainda precisa desbloquear manualmente e lançar a saída à parte. O encaminhamento
  registrado ("Devolver ao fornecedor", por exemplo) é uma anotação de intenção, não uma ação
  automática. Isso fica para uma etapa futura (Devoluções).
- **Perfil "Qualidade" separado do Almoxarife** — a spec original previa um perfil próprio para
  quem faz inspeção; hoje continua sendo Almoxarife/Administrador.
- Tipos de entrada além de nota fiscal de compra (material de cliente, consignado, devolução de
  produção etc.) e conferência física estruturada (contagem, pesagem, fotos) continuam fora —
  eram pendências antigas da tela de Recebimentos, não desta etapa.

---

## Etapa 6 — Lotes de Verdade (ENTREGUE — 2026-08-09)

Até esta etapa, "lote" era um campo de texto. Você digitava, o sistema guardava — e **nunca olhava
de novo**. Não existia cadastro de lote, não existia validade, não existia certificado, e o sistema
não sabia quanto tinha de cada lote. A Etapa 6 transformou lote numa coisa de verdade.

**O problema mais grave que ela consertou, em uma frase:** o sistema deixava você tirar 10 de um
lote que tinha 2. Não dava erro nenhum. O saldo daquele lote ficava **−8**, e como o total do
material continuava batendo, nenhuma tela denunciava. Só quem fosse olhar a linha do lote no banco
descobria.

| Antes | Agora |
|---|---|
| Dava para tirar 10 de um lote que tinha 2, e o sistema não reclamava — a linha daquele lote ficava negativa em silêncio | **Recusa** e mostra o saldo real daquele lote na mensagem |
| Lote era um campo de texto na saída: dava para digitar um lote que não existe, ou errar o código | Na **saída**, o lote virou uma **lista** dos lotes que têm saldo, com o código, o saldo e a data de validade de cada um. Na **entrada** continua texto livre, porque é ali que um lote novo nasce |
| Você tinha que lembrar qual lote usar primeiro | O sistema **já vem com o lote que vence primeiro selecionado** (FEFO). É uma **sugestão** — você pode trocar por qualquer outro lote elegível |
| Material vencido saía normalmente | Lote vencido **não sai para consumo**. Mas continua podendo ser baixado como **Sucata** ou **Perda**, ou corrigido por **Ajuste** — material vencido tem que poder sair do estoque, senão fica preso para sempre |
| Não existia "lote bloqueado" ou "lote reprovado" | Lote tem situação: **Ativo**, **Bloqueado** ou **Reprovado**. Os dois últimos não saem, e a mensagem diz qual é o problema. Lotes não elegíveis **aparecem na lista, desabilitados, com o motivo** — não somem (esconder faria você procurar material que o sistema decidiu não mostrar) |
| A opção "Controle por lote" na ficha do material não fazia nada | Material com essa opção marcada **exige lote onde existe campo para informá-lo**: as duas telas de Movimentação (a completa e o modal rápido da tela de Materiais) e o Recebimento. O **Ajuste** de inventário continua isento de propósito: é por ele que você regulariza o estoque antigo, que não tem lote nenhum. **Correção de 2026-08-10:** este guia dizia "em toda entrada e saída", e era literalmente o que o sistema fazia — inclusive em telas sem campo de lote, o que travava a entrega por requisição e a devolução. Ver "O que a Etapa 6 não cobre" |
| A opção "Requer certificado" também não fazia nada | Material com essa opção faz o lote **nascer bloqueado** no recebimento, com o motivo "Certificado do fornecedor nao anexado". **O material entra no estoque normalmente** — o que fica travado é a saída, até o certificado chegar |
| Na tela de Recebimentos não havia onde digitar lote, validade ou corrida — justo na tela onde o lote nasce | Três campos por item: **Lote**, **Validade** e **Corrida**. Ao processar a nota, o lote é criado sozinho já com fornecedor e número da NF |
| Cada lote não tinha saldo próprio | O saldo passou a ser por material **+ localização + lote**. A coluna "Lote" do Extrato mostra o código do lote |

### Uma regra que parece estranha e é de propósito: liberar um lote vencido **não** o "desvence"

Um lote vencido pode ser **liberado para uso**, com justificativa (fica registrado quem liberou,
quando e por quê). Depois disso, ele **continua marcado como vencido** em todas as telas — o que
muda é só que o sistema passa a deixar consumi-lo. Isso é intencional: apagar a marca de vencido
esconderia da auditoria que aquele material está fora da validade. Na lista de lotes ele aparece
como "(vencido, liberado)".

E se um lote estiver **bloqueado e vencido** ao mesmo tempo, liberar o vencimento não resolve — ele
continua barrado por bloqueio, com a mensagem de bloqueio. Situação vem antes de validade.

### Roteiro de teste manual (Etapa 6)

**A) Preparar um material com controle por lote**

1. Vá em **Almoxarifado → Materiais**, edite um material (ou crie um novo). Na seção **Controles**,
   marque **"Controle por lote"** e salve. Anote o código dele.

**B) Caso de erro esperado — movimentar material controlado sem lote**

2. Vá em **Almoxarifado → Movimentações → Nova Movimentação**. Escolha esse material, tipo
   **Entrada**, quantidade 10, e deixe o campo **Lote** vazio. Confirme. **Deve ser recusado** com
   uma mensagem dizendo que o material exige lote nesta movimentação — e o saldo **não** pode
   mudar (confira no Extrato).

2b. **O contra-teste, que faltava até 2026-08-10:** com o MESMO material controlado, crie uma
   requisição e entregue-a (Almoxarifado → Requisições). **Deve funcionar normalmente, sem pedir
   lote** — a tela de entrega não tem campo de lote, e exigi-lo ali tornava o material impossível
   de entregar. Faça o mesmo com uma **Devolução**: também passa sem lote. É decisão, não
   esquecimento; está explicado em "O que a Etapa 6 não cobre".

**C) Entrada com lote, e o lote nascendo**

3. Repita a entrada, agora digitando um lote no campo **Lote** (ex.: `L-001`), quantidade 100.
   Confirme. Faça uma segunda entrada do mesmo material com o lote `L-002`, quantidade 2.
4. Abra o **Extrato** do material (Materiais → ícone Extrato). Na tabela de saldos, a coluna
   **Lote** deve mostrar `L-001` e `L-002` em linhas separadas, com 100 e 2.

**D) O bug principal — tirar mais do que o lote tem**

5. Nova Movimentação, tipo **Saída**, mesmo material. Repare que o campo Lote agora é uma **lista**,
   não um campo de texto, e que ela mostra o saldo de cada lote.
6. Escolha o lote `L-002` (que tem 2) e peça quantidade **10**. Preencha o motivo e confirme.
   **Caso de erro esperado:** recusado, com o saldo real do lote na mensagem. **Antes da Etapa 6
   isso passava sem erro nenhum.** Volte ao Extrato e confira que `L-002` continua com 2 e o total
   do material não mudou.
7. Agora peça **1** do lote `L-002`. Deve passar, e só o `L-002` deve cair (para 1) — o `L-001`
   continua com 100.

**E) FEFO — o lote que vence primeiro vem sugerido**

8. Faça duas entradas novas (ou use o **Recebimento**, passo F) criando dois lotes com validades
   diferentes: um vencendo em 2030 e outro em 2031.
9. Abra Nova Movimentação → **Saída** → escolha o material. O campo Lote deve vir **já preenchido
   com o lote de validade mais próxima**, sem você escolher. Troque para outro lote da lista para
   confirmar que a sugestão não é imposição.

**F) O lote nascendo no recebimento (é onde ele deve nascer)**

10. Vá em **Almoxarifado → Recebimentos → Novo Recebimento**. Preencha nota e fornecedor e adicione
    o material com uma quantidade. Salve.
11. Avance o fluxo até **"Preencher Dados da NF (Faturamento)"** (Iniciar Conferência → Finalizar
    Conferência → Encaminhar para Compras → Encaminhar para Faturamento). Nos itens, agora aparecem
    quatro campos novos: **Lote**, **Validade**, **Fabricação** e **Corrida**. Preencha os quatro
    e salve. (A **Fabricação** entrou em 2026-08-10: a coluna existia no banco desde o começo da
    Etapa 6 e nada a preenchia nem a mostrava.)
12. Clique em **"Processar Nota — Estoque + Contas a Pagar"**. Volte ao **Extrato** do material: o
    saldo entrou **no lote que você digitou**, e a validade/fabricação/corrida ficaram guardadas
    nele — confira em **Almoxarifado → Lotes**, escolhendo o material (a data de fabricação aparece
    embaixo da validade, como "Fabricado em …").

12b. **Nota com dois itens — o teste que o review final trouxe (2026-08-10).** Monte um recebimento
    com **dois** materiais, sendo um deles com "Controle por lote" ligado, e deixe o **Lote** desse
    item em branco. Clique em "Processar Nota". **Deve ser recusado**, dizendo qual item está sem
    lote — e, no Extrato, **o outro item também não pode ter entrado**. Antes, o primeiro item
    entrava, a nota parava no meio, e clicar de novo em "Processar Nota" depois de corrigir entrava
    com o primeiro item **outra vez** (10 viravam 20). Agora preencha o lote que faltava e
    processe: os dois entram, cada um **uma** vez.

**G) Caso de erro esperado — lote vencido**

13. Crie (pelo recebimento, passo F) um lote com **validade no passado** (ex.: `2020-01-01`) e
    processe a nota para ele ganhar saldo.
14. Nova Movimentação → **Saída** → escolha esse material. Na lista de lotes, o lote vencido deve
    aparecer **desabilitado**, com "(vencido)" no rótulo. Se você conseguir selecioná-lo por outro
    caminho, a saída é recusada com a mensagem de vencimento.
15. **Mas o descarte passa:** mude o tipo para **Sucata** (ou **Perda**) e baixe o mesmo lote
    vencido. **Deve funcionar** — material vencido precisa poder sair do estoque. (Roteiro
    detalhado clique a clique, incluindo o que confirma isto na tela: seção "Task 9", passo D-13,
    mais abaixo.)

**H) Certificado do fornecedor**

16. Em **Materiais**, edite um material e marque **"Requer certificado"** na seção Controles.
17. Faça um recebimento desse material com um lote (passos 10 a 12). Depois de processar, tente uma
    **Saída** desse lote. **Caso de erro esperado:** recusado, porque o lote nasceu **bloqueado**
    por falta de certificado. Confira no Extrato que o material **entrou** no estoque físico
    normalmente — só a saída é que está travada.

> **Atualização da Task 9:** o passo acima batia numa parede — não havia botão para anexar o
> certificado. Agora existe: vá em **Almoxarifado → Lotes**, escolha o material, e no lote
> bloqueado clique em **Anexar certificado** (ícone de upload). O roteiro completo está na seção
> "Task 9", logo abaixo.

### O que a Etapa 6 **não** cobre

- **Números de série.** *(Corrigido em 2026-08-11: esta linha dizia que série continuava não
  existindo — a Etapa 6b entregou. Ver a seção "Etapa 6b", mais abaixo, para o que mudou e o
  roteiro de teste.)*
- **Etiquetas e QR Code.** *(Corrigido em 2026-08-11: esta linha dizia que imprimir etiqueta de
  lote/material com QR não existia — a Etapa 6c entregou. Ver a seção "Etapa 6c", mais abaixo.)*
- **Lote na entrega, na exclusão de requisição e na devolução.** Estas quatro operações movimentam
  estoque **sem lote**, mesmo em material com "Controle por lote" ligado: entregar uma requisição,
  excluir uma requisição (que estorna o que foi entregue), devolver material para o estoque e
  sucatear uma devolução. Nenhuma dessas telas tem campo de lote. **Até 2026-08-10 o sistema exigia
  lote nelas assim mesmo, e o resultado era que o material simplesmente não podia ser entregue nem
  devolvido** — e a reserva criada na aprovação da requisição ficava presa, segurando saldo que
  ninguém conseguia consumir. Hoje essas quatro passam sem lote, de propósito. O preço é que o
  saldo movimentado por elas fica na linha "sem lote" e não aparece no saldo de nenhum lote (o
  total do material continua certo). Fechar isso — sugerir o lote FEFO na entrega e herdar o lote
  da saída original na devolução — é o conteúdo natural da próxima etapa de lotes.
- **Reserva por lote.** Reservar material continua reservando do material, não de um lote
  específico.
- **Reprovar um lote pela tela de Inspeções.** A inspeção continua bloqueando o **material
  inteiro**; ela não marca o lote como reprovado. A situação "Reprovado" do lote existe e funciona,
  mas hoje só pode ser aplicada por fora da tela de Inspeções.
- **Genealogia de lote** (ligar o lote de matéria-prima que comprou ao lote de produção que saiu).
- **Reter só uma parte de um lote.** A retenção é do lote inteiro, pela situação dele. Reprovar 10
  de um lote de 100 não tem representação — foi decisão consciente: retenção por lote é *situação*,
  não *quantidade*.
- **Extrato do lote** ("tudo que aconteceu com o lote X"). Os dados existem (movimentações,
  auditoria, saldo), mas não há uma consulta que junte os três como o Extrato faz para o material.
- **"Controle de validade" e "Controle de corrida"** na ficha do material continuam decorativos: os
  campos de validade e corrida existem e funcionam no lote, mas o sistema não *obriga* preenchê-los
  quando essas opções estão marcadas.

---

## Task 9 — Tela de Lotes e Sucata/Perda (ENTREGUE — 2026-08-09)

A Etapa 6 entregou as regras de lote inteiras no servidor, mas três operações só existiam por API
— e uma delas travava material de verdade: com **"Requer certificado"** ligado, o lote nascia
**bloqueado** e só um desenvolvedor destravava, chamando a API na mão. A Task 9 (não estava no
plano original; nasceu do review da Etapa 6, aprovada pelo cliente em 2026-08-09) fechou isso.

| Antes | Agora |
|---|---|
| Bloquear, reprovar ou reativar um lote só por API | Tela **Almoxarifado → Lotes**: escolha o material, cada lote tem o botão "Mudar status" |
| Lote vencido só saía se alguém liberasse via API | Botão **"Liberar vencimento"** — só aparece em lote vencido, exige justificativa |
| Lote bloqueado por falta de certificado ficava travado pela interface para sempre | Botão **"Anexar certificado"** (PDF ou imagem) — se o bloqueio era por falta dele, o lote **libera sozinho** ao anexar |
| Sucata e Perda não apareciam no seletor de tipo da Movimentação, mesmo o motor já aceitando as duas para descartar lote vencido | **Sucata** e **Perda** selecionáveis, com os mesmos campos que uma Saída pede (localização de origem, lote por lista) |

> **Correção de 2026-08-09 (fix round 1):** a primeira versão desta task tinha um bug que
> anulava a razão de Sucata/Perda existirem no seletor — o lote vencido continuava aparecendo
> **desabilitado** mesmo com Sucata/Perda escolhido, porque a tela usava o mesmo cálculo de
> "elegível" da Saída (que corretamente barra vencido) para os dois tipos de descarte (que
> corretamente **não** barram). Corrigido: agora a tela decide por tipo — Sucata/Perda liberam
> lote vencido (só continuam recusando lote `Bloqueado`/`Reprovado`), Saída continua exigindo o
> vencimento resolvido. O passo 15 da Etapa 6 e o passo D-13 abaixo já refletem o comportamento
> corrigido.

### Roteiro de teste manual (Task 9)

**A) Destravar um lote bloqueado por falta de certificado (o caso mais importante)**

1. Repita os passos H (16-17) da Etapa 6 acima: material com **"Requer certificado"**, recebimento
   com lote, tentativa de Saída recusada porque o lote nasceu **Bloqueado**.
2. Vá em **Almoxarifado → Lotes**. Escolha o material no seletor. O lote aparece com o badge
   **Bloqueado** e o aviso "Bloqueado por falta de certificado".
3. Clique no ícone de upload ("Anexar certificado do fornecedor"). O modal avisa que o lote está
   bloqueado por falta de certificado. Escolha um arquivo PDF ou imagem e confirme.
4. O lote deve voltar para **Ativo** sozinho, e a linha dele passa a mostrar um link **"Ver
   certificado"** — clique para abrir o arquivo numa aba nova. (Até 2026-08-10 o arquivo era
   guardado e **não havia como abri-lo pela tela**: ela só dizia "Certificado anexado". Reanexar
   também deixava o arquivo antigo perdido no servidor; agora ele é apagado.) Volte à Movimentação
   de Saída: o lote aparece habilitado na lista.

**B) Mudar status manualmente (bloquear/reprovar/reativar)**

5. Na tela de Lotes, clique no ícone de "Mudar status" (engrenagem/sliders) de um lote **Ativo**.
6. Tente confirmar sem preencher a justificativa — o botão **Confirmar** deve estar desabilitado.
7. Escolha o novo status (ex.: **Bloqueado**) e escreva a justificativa. Confirme. O badge do lote
   muda na tabela.

**C) Liberar um lote vencido para uso**

8. Escolha um material com um lote **vencido** (validade no passado — ver passo G da Etapa 6).
9. Na linha desse lote, o botão **"Liberar vencimento"** aparece (só aparece em lote vencido — em
   lote não vencido, não há esse botão). Clique, preencha a justificativa e confirme.
10. O lote continua marcado como **vencido** na tela (badge vermelho vira azul: "VENCIDO
    (liberado)"), mostrando quem liberou e o motivo — liberar não apaga o fato de estar vencido, só
    credencia o consumo.

**D) Sucata e Perda na Movimentação**

11. Vá em **Almoxarifado → Movimentações → Nova Movimentação**. No seletor **Tipo**, confira que
    **Sucata** e **Perda** aparecem (ao lado de Entrada/Saída/Ajuste/Devolução).
12. Escolha **Sucata**, um material com saldo. Confira que aparecem os mesmos campos de uma Saída:
    **Localização de origem** e **Lote** (lista, não texto livre). Motivo é obrigatório.
13. Use o mesmo material com lote **vencido** do passo G da Etapa 6 (passos 13-14 acima). Com o
    tipo em **Saída**, o lote vencido continua **desabilitado** na lista, como sempre. Troque o
    tipo para **Sucata** (sem trocar material): o mesmo lote vencido agora aparece **habilitado**
    — e normalmente já vem pré-selecionado, porque é o único disponível. O rótulo continua
    dizendo "(vencido)": a tela não esconde o que está sendo descartado, só deixa de barrar por
    causa da validade. Preencha o motivo e confirme. **Deve funcionar** — material vencido
    precisa poder sair do estoque por descarte, mesmo continuando barrado para consumo normal.
14. Agora repita o passo 13 com **outro** lote — desta vez um lote **Bloqueado** (mude o status
    pela tela de Lotes, seção A/B acima). Escolha Sucata: o lote bloqueado continua **desabilitado**
    — descarte só é isento da guarda de **vencimento**, não da guarda de **status**. Um lote
    bloqueado ou reprovado ainda precisa passar pela mudança de status antes de sair por
    qualquer caminho.

### O que a Task 9 não cobre

- **Não é possível ver o histórico de mudanças de status de um lote pela tela** — a auditoria é
  gravada (`auditoria_log_almoxarifado`, `entidade='lote'`), mas não há uma tela de "extrato do
  lote" que a mostre. Continua na lista de pendências da Etapa 6.
  **Atualização (Etapa 22):** ainda **não** há extrato dentro da tela de lotes, mas o histórico
  já é legível em **Almoxarifado → Auditoria**, filtrando a entidade **Lote** — o caminho é o
  filtro geral da trilha, não uma aba dentro do lote. Fica registrado porque a frase acima, lida
  sozinha, faria parecer que não há caminho nenhum.
- **Quem liberou o vencimento aparece como "usuário #&lt;id&gt;", não pelo nome** — a API de lotes
  não faz `JOIN` com a tabela de usuários (só o `stockService`/`movimentacoes` faz isso hoje).
  Decisão desta task: não alterar o servidor (fora do escopo — "não mude nada no servidor" era
  regra da task), então a tela mostra o que a API devolve.
- **AJUSTE_NEGATIVO continua fora do seletor** — de propósito: é tipo interno de ajuste, e o
  **Ajuste** puro já cobre a correção de contagem.

---

## O que observar de regressão (sempre)

- O fluxo de requisição de materiais que já existia (criar → aprovar → separar → entregar) continua funcionando normalmente — nada foi removido nessa tela; requisições antigas continuam com o comportamento de sempre (criadas sem tipo/centro de custo ganham o padrão "Consumo").
- Movimentações antigas (de antes da Etapa 1) continuam visíveis e com os dados corretos no livro.
- O Mapa de Localizações carrega normalmente e mostra as posições que já existiam, agora todas vinculadas ao almoxarifado "ALM-GERAL".
- **Achado do fix round 1 da Task 9 (2026-08-09): o Extrato do material perdeu duas colunas que
  mentiam.** A tabela "Saldos por localização" tinha colunas "Reservada"/"Bloqueada" que sempre
  mostravam 0 desde a Etapa 6 (a coluna de origem foi removida do banco em `015e94c`, e ninguém
  tinha percebido). As duas colunas saíram da tabela — retenção não existe por localização; os
  cartões "Reservado"/"Bloqueado" no topo do Extrato (que leem do material, não da localização)
  continuam mostrando o número certo, como sempre mostraram.

---

## Etapa 6b — Números de Série (ENTREGUE — 2026-08-11)

A Etapa 6 entregou lotes (texto com validade/corrida/certificado — agregado por localização e lote).
A Etapa 6b traz números de série: rastreamento individual de cada unidade física (motor SN tal,
instrumento nº tal), com telas próprias — não é mais só motor de servidor.

> **Aviso anterior superado.** Até esta atualização, este bloco dizia "ligar Controle por série
> trava o recebimento pela tela até a interface existir — Tasks 8-9 pendentes". A interface existe
> desde esta mesma data (Tasks 8-10). A única ressalva que sobra: o modal rápido de entrada/saída
> dentro da tela de **Materiais** continua sem campo de série e sempre recusa material com a flag
> ligada — use a tela **Movimentações** para materiais com controle de série.

### Tabela consolidada — Etapa 6b

| Onde | Antes | Agora |
|---|---|---|
| Materiais | A opção "Controle por número de série" na ficha do material era decorativa — marcava e nada acontecia | Ao marcar, um texto explica o efeito: "Exigirá um número de série por unidade na entrada e na saída" |
| Movimentações (Entrada) | Não existia onde digitar série nenhuma | Para material com a flag, aparece uma **caixa de texto** "Números de série (um por linha)" com contador `N/quantidade` ao vivo, e um botão **"Gerar sequência"** (prefixo + número inicial preenche a caixa sozinho) |
| Movimentações (Saída/Sucata/Perda) | idem | Aparece uma **lista de séries em estoque** para marcar quais saem; se você já escolheu um lote, a lista filtra só as séries daquele lote |
| Movimentações | Trocar o tipo ou o material podia deixar série "grudada" de uma escolha anterior | Trocar tipo ou material **limpa** a seleção de série, igual já acontecia com lote |
| Recebimentos | Não havia onde digitar série na nota | Caixa de texto "Séries (uma por linha)" por item, ao lado dos campos de lote, com contador contra a quantidade recebida |
| Lotes (tela) | Só existiam lotes | Vira **"Lotes e Séries"**: uma aba nova lista as séries do material (número, status com badge, lote, localização) com ação **Bloquear/Desbloquear** (justificativa obrigatória) |
| Extrato do material | Sem indicador de série | Material com a flag ganha o cartão "Séries em estoque" no Extrato |
| Motor (servidor) | `controle_serie` nunca era lida — coluna com escritor e sem leitor | Entrada exige N séries para N unidades; saída aceita quais séries saem; estorno devolve/estorna série; bloquear/desbloquear série avulsa; tudo auditado (`entidade='serie'`) |

> ⚠️ **Correção (review final do branch, 2026-08-11): duas células desta tabela afirmavam recursos
> que não existem.** A linha de Movimentações (Saída) dizia que a lista de séries tinha "filtro de
> texto" — não tem, só checkboxes e o filtro automático pelo lote. A linha de Lotes (tela) incluía
> "última entrada/saída" entre as colunas da aba Séries — a tabela real é
> Número/Status/Lote/Localização/Ações. Ambas eram escopo cortado de propósito (pendência (h) da
> spec 10), não bugs — o erro era só a spec e este guia afirmarem que tinham sido entregues.

### Regra que já existia para lote e agora vale para série também: rota v1 não tem campo

O modal rápido de entrada/saída dentro da tela de **Materiais** (a rota antiga, sem `/v2`) **não tem
campo de série** e sempre recusa movimentar material com `controle_serie` ligado — mesma limitação
que ele já tinha para lote. Use a tela **Almoxarifado → Movimentações**, que tem os dois campos.

### Roteiro de teste manual (Etapa 6b)

**A) Ligar a flag num material e ver o hint**

1. Vá em **Almoxarifado → Materiais**, edite um material (ou crie um novo). Na seção **Controles**,
   marque **"Controle por número de série"**. Repare no texto pequeno logo abaixo do checkbox
   explicando o efeito. Salve. Anote o código do material.

**B) Entrada com o gerador de sequência**

2. Vá em **Almoxarifado → Movimentações → Nova Movimentação**. Escolha o material do passo 1, tipo
   **Entrada**, quantidade **3**. Repare que aparece a caixa "Números de série (um por linha)" com
   o contador `0/3`.
3. Preencha **Prefixo** com `SN-` e **Nº inicial** com `1`, clique **"Gerar sequência"**. A caixa
   deve se preencher com `SN-1`, `SN-2`, `SN-3`, e o contador virar `3/3`.
4. Confirme a movimentação. Deve passar.

**C) Caso de erro esperado — cardinalidade errada**

5. Nova entrada do mesmo material, quantidade **2**, mas digite só **1** linha na caixa de série.
   Confirme. **Deve ser recusado**, com mensagem dizendo quantas séries faltam — e o saldo não pode
   mudar (confira no Extrato).

**D) Caso de erro esperado — série duplicada**

6. Tente uma nova entrada usando de novo o número `SN-1` (que já está em estoque desde o passo 4).
   **Deve ser recusado**, dizendo que a série já está em estoque.

**E) Saída escolhendo séries específicas**

7. Nova Movimentação, tipo **Saída**, mesmo material, quantidade **2**. Em vez de campo de texto,
   aparece uma **lista com checkbox** das séries em estoque (`SN-1`, `SN-2`, `SN-3`). Marque duas
   delas — o contador deve acompanhar (`2/2`). Preencha o motivo e confirme. Deve passar, e as duas
   séries marcadas saem de estoque (confira na aba Séries, passo H).

**F) Trocar o lote limpa a seleção de série (material com as duas flags)**

8. Se você tiver (ou criar) um material com **"Controle por lote" e "Controle por número de
   série"** ligados ao mesmo tempo: na saída, escolha um lote, marque uma série da lista, e então
   troque o lote selecionado. **A seleção de série deve zerar** — a lista de séries disponíveis
   também deve reduzir para só as daquele novo lote.

**G) Bloquear uma série na aba "Séries" e ver a saída recusar**

9. Vá em **Almoxarifado → Lotes** (agora "Lotes e Séries"). Escolha o material do passo 1 e clique
   na aba **"Séries"**. A série que sobrou em estoque (`SN-3`, se você seguiu os passos acima)
   aparece na lista com status **EM_ESTOQUE**.
10. Clique na ação de bloquear. Tente confirmar **sem** justificativa — deve ficar bloqueado
    (botão desabilitado ou recusa). Preencha uma justificativa (ex.: "suspeita de avaria") e
    confirme. O badge da série muda para **BLOQUEADA**.
11. Volte em Movimentações, tente uma Saída desse material escolhendo a série bloqueada. **Deve ser
    recusada**, com o status da série na mensagem.

**H) Recebimento com séries + o aviso de salvar antes de processar**

12. Vá em **Almoxarifado → Recebimentos → Novo Recebimento**. Adicione o material do passo 1 com
    uma quantidade. Avance o fluxo até a etapa de conferência (mesmos passos do roteiro da Etapa 6,
    seção F). No item, ao lado dos campos de lote, aparece a caixa **"Séries (uma por linha)"** com
    contador contra a quantidade recebida.
13. Digite as séries e **salve** antes de clicar em "Processar Nota" — há um aviso na tela lembrando
    disso; se você digitar e processar sem salvar, o processamento usa os dados salvos, não o que
    está digitado na hora. Processe a nota. Confira na aba Séries que as novas séries entraram com
    o **lote** e a **localização** corretos (a aba não mostra o vínculo com o recebimento em si —
    isso só aparece no banco, via `recebimento_id`/`recebimento_item_id`, pendência (g) da spec 10).

**I) Estorno devolvendo séries**

14. No livro de Movimentações, estorne a saída do passo 7 (ícone de estornar, motivo obrigatório).
    Confira na aba Séries que as duas séries voltam para **EM_ESTOQUE**.
15. Estorne também uma entrada com série (se ainda não tiver sido consumida). As séries dessa
    entrada devem virar **ESTORNADA** (não voltam a ficar disponíveis — foi a entrada que nunca
    devia ter acontecido).

**J) KPI no Extrato**

16. Abra o **Extrato** do material (Materiais → ícone Extrato). Deve aparecer o cartão **"Séries em
    estoque"** mostrando a contagem atual.

### Casos de erro esperados (resumo)

- Entrada sem série nenhuma em material controlado — recusada.
- Cardinalidade errada (menos ou mais séries que a quantidade) — recusada, nada muda no saldo.
- Quantidade fracionária em material com controle de série — recusada ("exige quantidade inteira").
- Série já em estoque tentando entrar de novo — recusada.
- Saída pedindo uma série que já saiu, está bloqueada, ou é de outro material/lote — recusada, e as
  séries que já tinham sido "reservadas" na mesma tentativa voltam para EM_ESTOQUE (nada fica
  travado pela metade).
- Modal rápido da tela de Materiais (rota v1) com material controlado — sempre recusado; use
  Movimentações.

### O que a Etapa 6b **não** cobre

- **Etiquetas e QR Code.** *(Corrigido em 2026-08-11: esta linha dizia que a etapa seguinte ainda
  não tinha entregue isso — a Etapa 6c entregou. Ver a seção "Etapa 6c", mais abaixo, para o que
  mudou e o roteiro de teste.)*
- **Série na entrega, na exclusão de requisição e na devolução.** As mesmas quatro operações que já
  não pedem lote (entrega de requisição, exclusão/estorno de requisição, devolução e sucata de
  devolução) também não pedem série — nenhuma dessas telas tem campo para isso. Reentrada de uma
  devolução com série se faz manualmente pela tela de Movimentações (ENTRADA citando a série que
  volta). Transferência entre almoxarifados também não pede série, mesma lacuna já declarada para
  lote.
- **Reprovar uma série pela tela de Inspeções.** A inspeção continua decidindo por quantidade do
  material, não por série individual — bloquear uma série específica só existe pela aba "Séries"
  (ação manual avulsa).
- **Reserva por número de série.** Reservar continua sendo do material, não de uma série (nem de um
  lote) específico.
- **Filtro por status na aba Séries.** A tabela lista todas as séries do material de uma vez — não
  há um seletor "só EM_ESTOQUE" ou "só BLOQUEADA" ainda. Como a tabela por material costuma ser
  pequena, não travou a etapa.
- **"Salvar antes de processar" no Recebimento é um aviso, não uma trava.** Se você digitar séries
  na tela e clicar direto em "Processar Nota" sem salvar, o processamento usa os dados **salvos**
  — mesmo comportamento que os campos de lote já tinham.
- **Extrato agregado do lote** ("tudo que aconteceu com este lote/série numa tela só") continua sem
  existir — os dados estão espalhados em movimentações, auditoria e a própria tabela de série/lote.

### O que faltava era de verdade — série era só uma flag morta

Os dados sempre estiveram lá — a coluna `controle_serie` nasceu na Etapa 2 — mas ninguém nunca fazia
nada com ela. Quando você marcava "Controle por série" num material e tentava entrar com 5 unidades,
o sistema **não** perguntava os 5 números — simplesmente aceitava sem registrá-los. O comando `npm run
test:api` rodava verde porque os testes não testavam série (ela estava marcada como Etapa 6b no plano
original). Era o mesmo padrão que a spec desta feature toda documenta como **"coluna com escritor,
sem leitor"**.

Implementação: tabela `series_almoxarifado` + `seriesService` dono único (leitura, entrada com
compensação de erro, claim de saída, reversões de estorno, bloqueio com justificativa), motor
(`stockService`) integrado em movimentações/recebimento com o invariante `COUNT(séries presentes) ==
quantidade_atual` protegido até sob falha do INSERT do ledger, duas rotas HTTP, e a UI descrita acima
(Movimentações, Recebimentos, aba Séries, hint da flag, KPI no extrato). Detalhe task a task —
incluindo os fix rounds e o porquê de cada um — no
[plano de implementação](superpowers/plans/2026-08-11-almoxarifado-etapa6b-series.md).

---

## Etapa 6c — Etiquetas com QR Code (ENTREGUE — 2026-08-11)

A Etapa 6 entregou lote, a 6b entregou série — mas nenhum dos dois saía do sistema. Um lote ou uma
série ficavam sabidos na tela, sem nada que os identificasse fisicamente numa prateleira ou numa
peça no galpão. A Etapa 6c fecha esse ciclo: um PDF de etiquetas, para imprimir e colar, com o
código do material legível a olho nu e um QR Code que devolve quem lê direto para a tela do sistema
— já filtrada na linha certa.

**Decisão importante: a impressora do galpão ainda não foi confirmada com você.** O gerador vem com
dois formatos prontos — folha A4 comum (10 etiquetas por página, para recortar) e etiqueta térmica
100×50mm (uma por página, para rolo de impressora térmica) — e o formato escolhido no modal fica
lembrado da próxima vez. Se a impressora real do galpão usar outra medida, é um ajuste pequeno
(uma entrada na tabela de formatos), não um redesenho.

### O que mudou

| Onde | Antes | Agora |
|---|---|---|
| Recebimentos | Nota processada não tinha como gerar etiqueta dos itens que acabaram de entrar | Botão **"Imprimir etiquetas dos itens"** aparece na nota `PROCESSADO`/`APROVADO` — uma etiqueta por série (material com controle de série) ou por lote (material com controle de lote), lida do que foi digitado na nota |
| Lotes e Séries | Não existia como imprimir etiqueta de um lote ou série específico | Ícone de etiqueta em cada linha de lote e de série (inclusive séries já `ESTORNADA`/`SUCATEADA` — serve para reimprimir); na aba Séries, botão **"Etiquetas das séries em estoque"** gera uma de cada `EM_ESTOQUE` de uma vez |
| Lotes e Séries | Abrir a tela filtrada num lote/série exigia escolher manualmente o material e a aba | A tela aceita ser aberta com a URL que o QR codifica — já entra no material e na aba certos, com a linha do lote/série **destacada** |
| Materiais | Não existia etiqueta avulsa de material | Ícone de etiqueta em cada linha: material **sem** controle de lote/série abre direto o modal de impressão; material **com** a flag te leva para "Lotes e Séries" (a etiqueta certa é a do lote/série, não a do material) |
| (modal novo) | — | **Escolher formato e imprimir**: seleciona A4 ou térmica, define quantas cópias (só faz sentido numa etiqueta única), mostra quantas etiquetas/páginas o PDF vai ter, e baixa o arquivo |

### O que vai para o papel (e o que fica só atrás do QR)

De propósito, a etiqueta impressa mostra pouca coisa: **código do material em fonte grande**, o
nome (cortado se for longo), e a linha de controle — `Lote L-001 · Val 31/12/2026` ou `SN: GMP-042`.
Fornecedor, pedido, nota fiscal, projeto, localização e status de inspeção **não** vão para o papel
— ficam na tela que o QR abre. Etiqueta cheia de informação pequena é difícil de ler numa prateleira
de verdade; o QR existe exatamente para carregar o resto.

### Roteiro de teste manual (Etapa 6c)

**A) Imprimir da nota de recebimento já processada**

1. Abra um recebimento que já esteja **Processado** (ou processe um agora — veja o roteiro da
   Etapa 6, seção F, se precisar de um do zero). Se os itens tiverem lote ou série preenchidos, o
   botão **"Imprimir etiquetas dos itens"** aparece embaixo do resumo da nota.
2. Clique nele. O modal abre com a contagem de etiquetas. Escolha o formato **Folha A4** e clique
   em **Gerar**. Um PDF é baixado (`etiquetas-AAAA-MM-DD.pdf`), com uma etiqueta por série (se o
   material tiver controle de série) ou uma por lote (se tiver controle de lote apenas).
3. **Caso de erro esperado.** Abra um recebimento processado cujos itens não tenham lote nem série
   nem controle nenhum, ou cuja quantidade recebida seja zero: o botão aparece **desabilitado**,
   com uma explicação curta ao passar o mouse — não há nada para etiquetar.

**B) Etiqueta por linha de lote ou série**

4. Vá em **Almoxarifado → Lotes e Séries**, escolha um material com lotes ou séries cadastrados.
5. Na aba **Lotes**, clique no ícone de etiqueta de qualquer linha. O modal abre já com 1 etiqueta
   (a daquele lote). Gere o PDF e confira: código do material, nome, `Lote <código> · Val
   dd/mm/aaaa` (ou só `Lote <código>` se o lote não tiver validade), e o QR.
6. Repita na aba **Séries**, numa série qualquer — inclusive uma que já esteja `ESTORNADA` ou
   `SUCATEADA` (é a reimpressão: você ainda pode gerar a etiqueta de uma série que já saiu de
   circulação, para reimprimir uma via danificada, por exemplo).

**C) Etiquetas em massa das séries em estoque**

7. Ainda na aba **Séries**, clique no botão **"Etiquetas das séries em estoque"**, no topo. O modal
   abre com uma etiqueta para cada série `EM_ESTOQUE` daquele material — não entram as
   `ESTORNADA`/`SUCATEADA`/`BLOQUEADA` neste botão específico (para essas, use a etiqueta individual
   do passo 6). Gere e confira a contagem de páginas no modal antes de baixar.

**D) Etiqueta avulsa em Materiais — e a diferença com/sem controle**

8. Vá em **Almoxarifado → Materiais**. Clique no ícone de etiqueta de um material **sem** "Controle
   por lote" nem "Controle por número de série" marcados. O modal abre direto, com a etiqueta do
   material (sem linha de lote/série). Gere e confira.
9. Agora clique no mesmo ícone de um material **com** uma das duas flags ligadas. **Não abre
   modal** — a tela te leva direto para **Lotes e Séries**, já com esse material selecionado (e na
   aba Séries, se for controle de série). É proposital: a etiqueta certa para um material
   controlado é a do lote/série específico, não uma etiqueta genérica do material.

**E) Ler o QR com o celular**

10. Abra o PDF gerado em qualquer um dos passos acima (num monitor ou impresso) e aponte a câmera
    do celular para o QR de qualquer etiqueta. Ele abre o navegador numa URL do sistema.
11. **Se você não estiver logado no celular, cai na tela de login** — dado de estoque exige sessão,
    o QR não pula essa trava. **Sem sessão, o destino do QR se perde**: `App.js` manda para
    `/login` sem guardar de onde você veio, e depois do login `Login.js` sempre navega para `/`
    (a tela de seleção de módulos), não de volta para a URL do QR. Faça login primeiro e depois
    **escaneie o QR de novo**, ou navegue manualmente até **Almoxarifado → Lotes e Séries**.
12. Se você já estava logado, o QR abre direto na tela "Lotes e Séries" (ou Materiais, para
    etiqueta de material simples), já no material certo, na aba certa, e com a **linha daquele
    lote/série destacada** (fundo azul claro) — sem precisar procurar.

**F) O modal lembra o formato escolhido**

13. Abra qualquer modal de etiqueta e troque o formato para **Térmica 100×50mm**. Clique em
    **Gerar** — a escolha só é gravada no `localStorage` dentro da ação de gerar
    (`EtiquetasPdfModal.js`), não ao trocar o select. Se você fechar o modal **sem** gerar, a troca
    não persiste.
14. Abra outro modal de etiqueta (em qualquer tela, qualquer lote/série/material). Se você gerou no
    passo 13, ele já deve abrir com **Térmica 100×50mm** pré-selecionada — é lembrado por
    navegador, não por usuário do sistema.

**G) Recortar a folha A4**

15. No PDF gerado em formato **Folha A4**, repare que cada etiqueta tem uma **borda pontilhada** ao
    redor — é a linha de corte, para recortar com tesoura ou estilete numa folha adesiva.

### O que a Etapa 6c **não** cobre

- **A impressora física do galpão não foi confirmada.** Os dois formatos (A4 e térmica 100×50mm)
  são a melhor suposição até você confirmar qual impressora/etiqueta o galpão usa de fato. Se for
  outra medida, é um ajuste pequeno.
- **Etiqueta de retalho** (sobra de chapa/tubo com dimensão e peso remanescente) não existe —
  depende da feature de Retalhos e Sucatas (15) ganhar tela primeiro, o que ainda não aconteceu.
- **Etiqueta de localização/prateleira** foi cortada de propósito — o **Mapa de Localizações** já
  mostra onde cada posição fica, e a etiqueta avulsa de material cobre o caso comum de identificar
  o que está numa prateleira.
- **A etiqueta do recebimento usa o texto que você digitou na nota**, não uma nova consulta ao que
  o sistema efetivamente gravou. Na prática isso não costuma divergir — mas se você digitar um
  número de série errado e salvar, a etiqueta sai com o número errado, igual ao que ficou na nota.
- **Não existe registro de "quem imprimiu o quê e quando".** Reimprimir uma etiqueta é livre, sem
  rastro — decisão consciente (ninguém pediu essa auditoria, e criar sem uso é o mesmo erro de
  "coluna que ninguém lê" que esta feature inteira existe para evitar).
- **Sem coletor de código de barras nem app dedicado.** O "leitor" é a câmera do próprio celular,
  pelo QR — não há hardware novo nem app específico do almoxarifado.

---

## Etapa 7 — Transferências e Devoluções (ENTREGUE — 2026-08-12)

Duas rotas existiam no sistema desde sempre e **nenhuma das duas tinha tela**: transferir material
de um endereço para outro e devolver material que voltou do chão de fábrica só eram alcançáveis por
chamada direta à API. Além de invisíveis, as duas eram frouxas — a transferência não pedia o lote
(mesmo em material com "Controle por lote" ligado) e a devolução aceitava **qualquer quantidade de
qualquer material**, sem dizer de qual entrega veio.

E quando esta etapa foi sondada, apareceu um bug de saldo que ninguém tinha visto. Leia o aviso
abaixo antes de subir para produção.

### 🚨 O bug da Sucata — quem já usou o sistema pode ter saldo errado em casa

**O que estava errado:** devolver material para o destino **Sucata** baixava o estoque **duas
vezes**. O raciocínio do erro: o material já tinha saído do estoque quando foi **entregue**; ao
registrar a devolução para sucata, o sistema lançava mais uma saída, descontando de novo um saldo
que nunca tinha voltado.

Medido com o sistema rodando (não por leitura de código — a leitura não mostrava o problema):

```
estoque inicial            => 100
saída de 10 (entrega)      =>  90
devolução de 3 → Sucata    =>  87     ← ERRADO: o certo é 90
devolução de 2 → Estoque   =>  89     ← controle: prova que a medição sabe medir
```

**O que mudou:** o destino Sucata agora lança **duas** movimentações — uma **Entrada de devolução**
(o material voltou) seguida de uma **Sucata** (e foi descartado). O saldo fecha certo e o livro
continua contando as duas coisas. A alternativa de simplesmente não lançar nada foi descartada: o
saldo também ficaria certo, mas a sucata sumiria do livro, e o controle de retalhos e sucatas
(feature 15) vai precisar dela lá.

**A correção NÃO conserta o passado.** Onde já houve devolução para sucata antes do deploy, o saldo
daquele material está **a menos** — pela quantidade que foi devolvida.

**Como verificar, antes de subir para produção.** Rode esta consulta no banco de produção. Ela lista
exatamente as devoluções para sucata que foram gravadas pelo comportamento **antigo** (as novas
sempre têm uma Entrada de devolução com a mesma referência; as antigas não têm):

```sql
SELECT d.id, d.material_id, d.quantidade, d.created_at
  FROM devolucoes_material_almoxarifado d
 WHERE d.destino = 'SUCATA'
   AND NOT EXISTS (
         SELECT 1 FROM movimentacoes_almoxarifado m
          WHERE m.referencia = 'DEV-' || d.id
            AND m.tipo = 'ENTRADA_DEVOLUCAO');
```

- **Voltou vazio (0 linhas):** nada a fazer, nenhum saldo foi afetado.
- **Voltou com linhas:** cada linha é um material cujo `quantidade_atual` está **menor** do que
  deveria, exatamente pelo valor da coluna `quantidade`. O acerto é uma **contagem física** com
  lançamento de **Ajuste** naquele material — decisão sua, porque o número certo é o que está na
  prateleira hoje, não o que a conta diz.

**Medido no banco de desenvolvimento (2026-08-12): a tabela de devoluções tem 0 linhas** — lá o bug
nunca chegou a produzir efeito. Isso **não** dispensa rodar a consulta em produção.

### O que mudou

| Onde | Antes | Agora |
|---|---|---|
| Movimentações | Transferir material entre prateleiras não tinha tela nenhuma | **Transferência** é um tipo do formulário, com **Localização de origem** e **Localização de destino** ao mesmo tempo, mais o seletor de lote |
| Movimentações | Material com "Controle por lote" transferia sem citar o lote | A transferência **exige** o lote. E aceita **qualquer** lote — inclusive bloqueado e vencido |
| Movimentações | "Devolução" no formulário criava um lançamento solto e nenhum registro de devolução | Saiu do formulário; um aviso aponta a tela nova. Continua no filtro do livro |
| Devoluções | Não existia tela | Tela **Almoxarifado → Devoluções**: lista o que já foi devolvido e um formulário que começa pelo **material** |
| Devoluções | Nada ligava a devolução à entrega que a originou | Você escolhe **de qual entrega** está devolvendo, e o sistema mostra quanto daquela entrega ainda pode voltar |
| Devoluções | Devolver mais do que foi entregue passava | Recusado, com a conta na mensagem |
| Devoluções | Devolução de material com lote entrava sem lote e o saldo ficava preso | Lote **herdado da entrega**, ou escolhido na devolução avulsa |
| Devoluções | Devolver peça serializada voltava o saldo sem voltar a peça | A série volta para **Em estoque** |
| Devoluções | Devolver para Sucata baixava o estoque duas vezes | O saldo não muda; o livro mostra Entrada de devolução + Sucata |
| Devoluções | Uma devolução **recusada** deixava registro mesmo assim | Recusa não deixa registro nenhum |

### Regras de negócio e validações — cada uma com o cenário exato para demonstrar

Todas as mensagens abaixo são **as mensagens reais do sistema**, copiadas do código. Se o que
aparecer na tela for diferente, é bug — reporte.

| # | Regra | O que fazer para testar | O que o sistema faz | Mensagem esperada |
|---|---|---|---|---|
| R1 | **Não se devolve mais do que foi entregue** | Material com uma entrega de **10**, da qual já foram devolvidos **4**. Em Devoluções, escolha essa entrega e digite **7** | **Recusa** | `Devolução acima do entregue: a saída 1 entregou 10, já foram devolvidos 4 e restam 6` (o número da saída é o da sua entrega) |
| R2 | **Devoluções parciais somam** — 6 + 5 não cabem em 10, mas 6 + 4 cabem | Devolva **6** da entrega de 10 (passa). Tente **5** (recusa). Devolva **4** (passa) | 1ª e 3ª passam, a 2ª é recusada | a mesma de R1, com `restam 4` |
| R3 | **A tela avisa antes de mandar** | Escolha uma entrega com devolvível 7 e digite **9** | O botão envia, mas a tela **barra antes de chamar o servidor** | toast: `Esta entrega ainda aceita 7 de devolução` |
| R4 | **A entrega já devolvida por inteiro continua aparecendo** — desabilitada | Devolva **tudo** de uma entrega e reabra o formulário nesse material | A linha continua na lista, com "já devolvido por inteiro", e **não é selecionável** | — (esconder faria você procurar uma entrega que o sistema decidiu não mostrar) |
| R5 | **Não se devolve o que foi descartado ou corrigido** | Lance uma **Sucata**, uma **Perda**, um **Ajuste** e uma **Entrada** no material, depois abra Devoluções nele | Nenhum dos quatro aparece na lista de entregas — só as saídas de entrega | — |
| R6 | **Saída estornada não pode ser devolvida** | Estorne uma saída no livro e tente devolvê-la (só alcançável por API — a tela nem a oferece) | **Recusa** | `A saída 12 foi cancelada (estornada) — o estorno já devolveu o material` |
| R7 | **Transferência exige lote em material controlado** | Em Movimentações, tipo **Transferência**, material com "Controle por lote", origem e destino escolhidos, **sem escolher lote** | **Recusa** | `O material MAT-001 exige lote nesta movimentacao (controle por lote ligado)` |
| R8 | **Transferir lote BLOQUEADO ou VENCIDO é PERMITIDO — de propósito** | Bloqueie um lote em "Lotes e Séries". Em Movimentações → Transferência, selecione esse lote e transfira | **Passa.** No seletor de lote da Transferência **todos** os lotes ficam habilitados | — (é assim que um lote reprovado vai parar na área de bloqueados) |
| R9 | **Controle positivo do R8:** numa **Saída**, os mesmos lotes continuam barrados | Mesmo material, mude o tipo para **Saída** e abra o seletor de lote | Lote bloqueado e lote vencido aparecem **desabilitados**, com o motivo | — |
| R10 | **Transferir mais do que existe na origem falha** | Transferência de 50 de uma prateleira que tem 20 | **Recusa** e a origem **não** é debitada | `Saldo insuficiente na localização de origem` |
| R11 | **A transferência não mexe no total do material** | Transfira 8 de A para B e confira o saldo total no Extrato | O total continua igual; muda o **endereço** | — (almoxarifado é área física, não filial — ver "Decisões de negócio") |
| R12 | **Devolução de material com lote precisa dizer de qual lote** | Devolução **avulsa** (sem escolher entrega) num material com "Controle por lote", sem escolher lote | A tela barra antes de enviar | toast: `Material com controle por lote: informe de qual lote é a devolução` |
| R13 | **Com entrega escolhida, o lote vem sozinho** | Escolha uma entrega que saiu do lote L-001 | O campo **Lote (herdado da entrega)** aparece em **modo leitura**, sem seletor | — |
| R14 | **Devolver peça serializada ao estoque exige a série** | Material com "Controle por número de série", devolução de 1 unidade ao **Estoque**, sem marcar série | **Recusa** | `Material com controle de série: informe 1 número(s) de série para 1 unidade(s) devolvida(s) — recebidos 0` |
| R15 | **Sucata de peça serializada é recusada ENSINANDO o caminho** | Mesmo material, marque a série e escolha destino **Sucata** | A tela **não oferece** os checkboxes e mostra o aviso; se forçado por API, o servidor recusa | `Devolução com número de série não é suportada no destino SUCATA. Devolva ao estoque e, em seguida, registre a baixa na tela Movimentações, que tem seletor de série.` |
| R16 | **Sucata de material serializado SEM informar série continua passando** | Mesmo material, destino Sucata, **sem** marcar série nenhuma | **Passa** — a limitação é "não dá para informar a série aí", não "peça com série não pode ir para sucata" | — |
| R17 | **Sucata com lote bloqueado é recusada ANTES de mexer no estoque** | Bloqueie o lote e tente devolver aquela entrega para **Sucata** | **Recusa**, e o saldo do material **não se move** (nem meio movimento) | `Lote L-001 está bloqueado e não pode ser sucateado por devolução. Resolva o status do lote primeiro (tela Lotes e Séries) e repita a devolução.` |
| R18 | **Devolução recusada não deixa registro nem encolhe o devolvível** | Entrega de 10; faça uma devolução de 3 que o sistema **recuse** (R12 serve). Reabra o formulário no mesmo material | A recusa **não** aparece na lista de devoluções, e a entrega continua oferecendo **10** de devolvível (não 7) | — |
| R19 | **Quarentena devolve o físico, não o disponível** | Devolva 6 com condição **Suspeita** / destino **Quarentena** e olhe o Extrato | `quantidade_atual` sobe 6; `Disponível` **não** sobe (fica bloqueado até a inspeção decidir) | — |
| R20 | **Retrabalho não mexe em saldo nenhum** | Devolva com destino **Retrabalho** e confira o Extrato | O saldo fica igual; só entra a linha no livro | — |
| R21 | **A condição SUGERE o destino, não determina** | Escolha condição **Danificada** (destino vira Sucata sozinho) e depois troque o destino para **Retrabalho** | O destino fica **Retrabalho** — a sugestão não desfaz sua escolha | — |
| R22 | **Devolução avulsa continua possível** | Não escolha entrega nenhuma ("Devolução avulsa"), preencha quantidade e motivo | **Passa** — é o caminho para sobra antiga ou material entregue antes do sistema. Sem entrega, não há limite de quantidade nem lote a herdar | — |
| R23 | **Motivo é obrigatório** | Deixe o motivo em branco e envie | A tela barra | toast: `Informe o motivo da devolução` |

### Roteiro de teste manual (Etapa 7)

**A) Transferir um lote entre duas prateleiras**

1. Vá em **Almoxarifado → Movimentações** e clique em **Nova Movimentação**.
2. Escolha um material que tenha **saldo endereçado** em alguma localização e com "Controle por
   lote" ligado. No campo **Tipo**, escolha **Transferência**.
3. Repare que aparecem **os dois** campos de localização ao mesmo tempo — "Localização de origem" e
   "Localização de destino". Entrada mostra só destino, Saída mostra só origem; a transferência é o
   único tipo com os dois.
4. Escolha o lote, a quantidade, a origem e o destino, e salve.
5. Vá em **Almoxarifado → Mapa de Localizações** (ou no **Extrato** do material) e confira: o saldo
   **mudou de endereço**, e o **total do material continua o mesmo** (regra R11).
6. Volte ao livro de movimentações: a linha nova aparece com o badge **Transferência** em
   ciano-petróleo — cor própria, nem verde de entrada nem vermelho de saída, porque a transferência
   não soma nem subtrai.

**B) Transferência sem lote é recusada (regra R7)**

7. Repita o passo 2 no mesmo material controlado, mas **não escolha lote nenhum**. Preencha origem,
   destino e quantidade e salve.
8. O sistema recusa com `O material <código> exige lote nesta movimentacao (controle por lote
   ligado)`. **Esta era a lacuna:** antes da Etapa 7 a transferência passava sem lote, e o saldo
   aparecia na prateleira nova sem dizer de qual lote tinha vindo.

**C) Transferir um lote bloqueado — tem que FUNCIONAR (regra R8)**

9. Vá em **Almoxarifado → Lotes e Séries**, escolha o material e **bloqueie** um lote (informe o
   motivo).
10. Volte em Movimentações → Transferência, mesmo material. Abra o seletor de lote: **todos** os
    lotes estão habilitados, inclusive o que você acabou de bloquear e qualquer um vencido.
11. Transfira 4 desse lote bloqueado. **Passa** — e é isso mesmo: é assim que um lote reprovado é
    levado para a área de bloqueados do galpão.
12. **Controle (regra R9):** troque o tipo para **Saída**, mesmo material. Agora o lote bloqueado e
    o vencido aparecem **desabilitados**, com o motivo ao lado. A guarda de situação vive na saída,
    que é onde ela protege alguma coisa.

**D) Devolver parte de uma entrega**

13. Faça uma **Saída** de 10 unidades de um material (Movimentações → Nova Movimentação → Saída),
    para ter uma entrega para devolver.
14. Vá em **Almoxarifado → Devoluções** (item novo no menu) e clique em **Nova Devolução**.
15. Escolha o **material**. A lista **Entrega de origem** se preenche com as saídas daquele material
    — cada linha mostra data, tipo, quantidade, requisição/OS, quem retirou, lote e **quanto ainda é
    devolvível**.
16. Escolha a entrega de 10, digite quantidade **4**, motivo **Sobra de projeto**, condição **Boa**
    (repare que o destino vira **Estoque** sozinho — regra R21) e registre.
17. Confira o Extrato do material: o saldo **subiu 4**.
18. Abra **Nova Devolução** de novo no mesmo material: a **mesma entrega** reaparece, agora dizendo
    **devolvível 6**.

**E) Tentar devolver mais do que resta (regras R1 e R3)**

19. Ainda na mesma entrega (devolvível 6), digite **9** e envie. A tela barra antes de chamar o
    servidor: `Esta entrega ainda aceita 6 de devolução`.
20. Para ver a mensagem **do servidor**, use uma quantidade que passe pela tela mas não pelo
    servidor — ou simplesmente confie no teste automático: a mensagem é
    `Devolução acima do entregue: a saída N entregou 10, já foram devolvidos 4 e restam 6`. **O
    número tem que estar na mensagem** — mensagem sem número obriga você a adivinhar.

**F) Devolver para Quarentena (regra R19)**

21. Nova devolução no mesmo material, condição **Suspeita** — o destino vira **Quarentena** sozinho.
    Registre 3.
22. No **Extrato** do material: `quantidade_atual` **subiu 3** (o material está fisicamente no
    galpão), mas o **Disponível não subiu** — os 3 estão bloqueados esperando decisão.
23. Vá em **Almoxarifado → Inspeções** para ver o que está retido.

**G) Devolver para Sucata — o saldo NÃO pode mudar (o bug corrigido)**

24. Anote o saldo atual do material.
25. Nova devolução, condição **Danificada** — o destino vira **Sucata** sozinho. Registre 2.
26. **Confira o saldo: tem que estar igual ao do passo 24.** Se tiver caído 2, a correção não está
    no ar.
27. Abra o **livro de movimentações** filtrando por esse material: aparecem **duas** linhas novas —
    uma **Entrada de devolução** e uma **Sucata**, ambas de 2. É assim que o saldo fecha e a sucata
    continua registrada.

**H) Devolver peça com número de série (regras R14, R15, R16)**

28. Escolha um material com "Controle por número de série" que tenha alguma série **Entregue**
    (faça uma Saída com série, se precisar).
29. Em Devoluções, escolha esse material e a entrega. Aparecem **checkboxes com os números de série
    daquela entrega**. Marque um e registre com destino **Estoque**.
30. Vá em **Lotes e Séries → aba Séries** e confira: aquela série voltou para **Em estoque**. Antes
    da Etapa 7 o saldo voltava e a série ficava "Entregue" para sempre.
31. **Agora o caminho de dois passos.** Repita, mas escolha destino **Sucata**: os checkboxes
    **desaparecem** e a tela mostra o aviso explicando que você deve devolver ao Estoque e depois
    baixar em **Movimentações**, que tem seletor de série. Faça isso e confirme que funciona.
32. **Regra R16:** o mesmo material **sem** marcar série nenhuma vai para Sucata normalmente — o que
    não dá é *informar a série* nesse destino.

**I) Devolução avulsa e o lote (regras R12, R13, R22)**

33. Em Devoluções, escolha um material com "Controle por lote" e **não** escolha entrega
    (a opção "Devolução avulsa (sem entrega registrada)"). Preencha quantidade e motivo e envie sem
    escolher lote: `Material com controle por lote: informe de qual lote é a devolução`.
34. Escolha o lote no seletor e registre. Passa.
35. Agora escolha uma **entrega** que tenha saído de um lote: o seletor some e aparece **Lote
    (herdado da entrega)** em modo leitura, com o código do lote. Você não escolhe — o sistema já
    sabe de onde saiu.

**J) O aviso em Movimentações**

36. Vá em Movimentações → Nova Movimentação e abra o campo **Tipo**: **"Devolução" não está mais
    lá**. Embaixo do campo, um aviso explica que devolução de material entregue é registrada na
    **tela de Devoluções**, com link.
37. Feche o modal e olhe o **filtro** do livro: **"Devolução" continua lá**. É de propósito — os
    lançamentos antigos de devolução precisam continuar visíveis e filtráveis.

### Pendências que a Etapa 7 levantou (registradas, não consertadas)

- **⚠️ Ajuste de inventário não acerta o "bloqueado" (achado ao testar esta etapa).** Se um material
  tem 8 unidades **bloqueadas** (quarentena, defeito) e você lança um **Ajuste** levando o total
  para 1, o sistema aceita e fica com `bloqueado (8) > total (1)` — o **Disponível fica negativo** e
  **nada avisa**. É plausível no dia a dia: a contagem acha menos do que o sistema dizia, e parte do
  que existia estava retida. **Não foi consertado porque a decisão é sua**, e as três respostas são
  defensáveis: (1) o Ajuste baixa o bloqueado junto; (2) o Ajuste é **recusado** enquanto houver
  retenção maior que o total pretendido; (3) o Ajuste passa e apenas **avisa**. Hoje o
  comportamento é o (3) **sem o aviso**, que é a pior das três. Enquanto isso: **resolva a
  quarentena antes de lançar um ajuste que reduz o total**.
- **Estado parcial na devolução para Sucata, sem notificação.** O destino Sucata lança duas
  movimentações; se a segunda falhar depois de a primeira ter entrado, a devolução fica registrada
  como **estado parcial** na auditoria e a resolução é **manual** — estornar a Entrada de devolução
  órfã pela tela de **Movimentações**. **Ninguém é notificado**: descobrir depende de alguém abrir a
  auditoria. É o cenário mais raro possível (as validações de lote e de série rodam antes,
  justamente para impedir isso), mas fica registrado em vez de implícito.
- **Sucata/Retrabalho de peça serializada exige dois passos** (devolver ao Estoque, depois baixar em
  Movimentações). É limitação **declarada**, não bug — ver a regra R15.

### O que a Etapa 7 **não** cobre

- **"Em trânsito" foi CORTADO por decisão sua, não esquecido.** O plano original previa
  transferência com estados (solicitada → aprovada → **em trânsito** → recebida → confirmada), com
  o material não disponível nem na origem nem no destino enquanto estivesse a caminho. Como os
  almoxarifados são **áreas físicas do mesmo site** e existe **uma filial só**, alguém pega a caixa
  e leva na hora: não há janela em que o material esteja "a caminho". Se um dia houver obra externa
  ou um segundo prédio, o item volta.
- **Aprovação de transferência, e-mail de transferência e alerta "transferência não recebida"** —
  saíram junto com o trânsito (os dois últimos pressupõem que exista trânsito).
- **Série na transferência.** A série continua mostrando a **localização antiga** depois de uma
  transferência. Não há perda de saldo nem de rastreabilidade da peça — só o endereço da série fica
  desatualizado. O saldo real, que a transferência move corretamente, mora em outro lugar.
- **Série no descarte de devolução** (Sucata/Retrabalho) — caminho de dois passos, ver R15.
- **Fotos/anexos da devolução** — não implementado.
- **Devolução ao fornecedor** — é fluxo próprio, com documento fiscal e contraparte externa; não é
  "a mesma devolução com outro destino".
- **Estorno de custo de projeto** quando o material volta — depende da integração de custos.
- **Tipos de devolução por origem** (de ferramenta, de cliente) — dependem das features 16 e 13.
- **A quarentena da devolução não entra na fila formal de inspeção.** Devolver com destino
  Quarentena bloqueia o saldo corretamente, mas não cria o item de inspeção com recebimento de
  origem que a tela de Inspeções usa.

---

## Etapa 8 — Materiais de Clientes (ENTREGUE — 2026-08-12)

Quando um cliente manda a chapa dele para a GMP industrializar, esse material **não é nosso** — mas
está no nosso galpão, ocupa nossa prateleira e é aplicado no trabalho dele. Até agora o sistema
tratava isso como uma **lista à parte**: uma tabela separada, com a descrição em **texto livre**,
sem número de lote, sem número de série, sem endereço, sem extrato, sem etiqueta e **fora do motor
de estoque** — ou seja, sem nada do que as Etapas 1 a 7 construíram, e justamente o que
industrializar material de terceiro exige (certificado, corrida, rastro de quem aplicou onde).

Pior: **nada impedia usar a chapa do Cliente A no equipamento do Cliente B**. E não havia tela
nenhuma — a lista à parte nunca teve interface para alimentá-la.

A Etapa 8 unificou: **material de cliente virou material normal com dono**. Tudo o que vale para o
nosso material passa a valer para o dele, com quatro travas novas que só existem para material de
cliente.

> **A Etapa 8 cobre CLIENTES, não terceiros.** Material que a GMP **envia** para um fornecedor
> beneficiar (corte, dobra, galvanização) é a feature 14 e virou a **Etapa 8b** — ainda não foi
> feita. As duas coisas são opostas: aqui o material de **outro** está **conosco**; lá o material
> **nosso** está com **outro**.

### O que mudou

| Onde | Antes | Agora |
|---|---|---|
| Materiais (ficha) | Não havia como dizer que um material é de um cliente | Seção **Propriedade**: escolhe o proprietário, ou **"GMP (estoque próprio)"**. Sem escolher, o material é nosso |
| Materiais / Movimentações / Extrato | Nada distinguia a chapa do cliente da nossa | **Selo com o nome do cliente** ao lado do material, nas três telas |
| Movimentações (saída) | A chapa do Cliente A saía para o projeto do Cliente B sem um pio | **Recusa**, e a mensagem **nomeia os dois clientes** — o dono e o do vínculo |
| Movimentações (saída emergencial) | O emergencial liberava qualquer saída sem vínculo | Material de cliente **não aceita** saída emergencial. É a única exceção deliberada ao padrão do módulo |
| Movimentações (ajuste) | Qualquer ALMOXARIFE zerava o saldo da chapa do cliente, pelas **duas** rotas | Exige a permissão **`ajustar_material_cliente`** — só ADMINISTRADOR —, com auditoria nomeando o cliente. Ajuste de material **nosso** não mudou |
| Recebimentos | Material de cliente entrava sem documento nenhum | Item de material de cliente **exige o número da nota** (nota de remessa) — e a recusa vale para **a nota inteira**. Material nosso continua entrando sem nota |
| Dashboard / Relatórios / Compras | O material do cliente contava no **valor total do estoque**, e o sistema **abriria pedido de compra** para repor chapa de outra empresa | Fica **fora** de: valor total, materiais críticos, materiais zerados, reposição de mínimo, sugestão de compra, alerta de estoque baixo e relatório de posição |
| Mapa de Localizações / Materiais bloqueados | — | **Continua aparecendo — de propósito.** A chapa do cliente ocupa a prateleira de verdade e é bloqueada de verdade; escondê-la faria a tela mentir sobre o galpão |
| Materiais de Clientes | Não existia tela | Tela nova: escolhe o cliente → recebido, consumido, devolvido, saldo e saldo disponível por material, mais em quais **OS/projetos** foi aplicado. **PDF de posição** e botão **Devolver ao cliente** |
| Devolver ao cliente | Não existia | Tipo de movimento novo **Devolução ao cliente** (é **saída** — o material sai do prédio de volta para o dono), com **número do documento obrigatório** |
| (interno) | A lista à parte tinha rotas de gravação que **escapavam de todas essas travas** | As rotas e o serviço antigos foram removidos. **A tabela ficou** — nenhuma linha foi apagada |

### Regras de negócio e validações — cada uma com o cenário exato para demonstrar

Todas as mensagens abaixo são **as mensagens reais do sistema**, copiadas do código. Se o que
aparecer na tela for diferente, é bug — reporte.

Para o roteiro usaremos sempre os mesmos nomes: **Cliente Alfa LTDA** e **Cliente Beta SA**, com o
material **CHP-002** (Chapa 3mm) pertencente ao **Alfa**, e **MAT-001** como material nosso de
controle.

| # | Regra | O que fazer para testar | O que o sistema faz | Mensagem esperada |
|---|---|---|---|---|
| C1 | **Material de cliente só é aplicado em trabalho do próprio cliente** | Em **Movimentações → Nova Movimentação**, material **CHP-002**, tipo **Saída para Produção**, quantidade 10, e no vínculo escolha um **projeto do Cliente Beta SA** | **Recusa** (400), **nomeando os dois** | `Material CHP-002 pertence ao cliente Cliente Alfa LTDA, mas o projeto Projeto Beta e do cliente Cliente Beta SA. Material de cliente so pode ser aplicado em trabalho do proprio dono — troque o vinculo, ou use o material equivalente do estoque proprio.` |
| C2 | **Sem OS nem projeto também não sai** | Mesma saída, **sem escolher** OS nem projeto | **Recusa** | `Material CHP-002 pertence ao cliente Cliente Alfa LTDA e so pode sair com OS ou projeto DESSE cliente. Informe a OS ou o projeto de Cliente Alfa LTDA.` |
| C3 | **Projeto interno (sem cliente) não é coringa** | Mesma saída, escolhendo um projeto **sem cliente** (projeto interno da GMP) | **Recusa** — "nenhum cliente" não vira "qualquer cliente" | a mensagem de C1, com `e do cliente nenhum cliente` |
| C4 | **⚠️ A saída EMERGENCIAL também é recusada — é a exceção deliberada** | Mesma saída de C1, agora marcando **"Saída emergencial"** e escrevendo a justificativa | **Recusa mesmo assim.** Em todo o resto do módulo o emergencial libera a saída sem vínculo; aqui **não** | `Material CHP-002 pertence ao cliente Cliente Alfa LTDA: saida emergencial nao e permitida para material de terceiro. O emergencial regulariza o vinculo depois, e material de cliente exige saber na hora em qual OS ou projeto DESSE cliente ele foi aplicado. Informe a OS ou o projeto do proprio cliente.` |
| C5 | **Controle positivo de C1-C4: no projeto do dono, sai normalmente** | Mesma saída, agora com um **projeto do Cliente Alfa LTDA** | **Passa**, e o saldo baixa | — |
| C6 | **Controle positivo do dono: material NOSSO não é afetado** | Saída de **MAT-001** (nosso) para o projeto do **Cliente Beta SA** | **Passa.** A guarda é sobre o dono do **material**, não sobre o cliente do vínculo | — |
| C7 | **Ajustar saldo de material de cliente exige permissão própria** | Com um usuário de perfil **GESTOR** (que ajusta o estoque próprio normalmente), lance um **Ajuste** em **CHP-002** | **Recusa com 403** | `Ajustar o saldo do material CHP-002, que pertence ao cliente Cliente Alfa LTDA, exige a permissao "ajustar_material_cliente" (seu perfil: GESTOR). Ajustar estoque de terceiro mexe no numero que o cliente vai cobrar.` |
| C8 | **A trava do ajuste vale nas DUAS rotas de movimentação** | Repita C7 pelo modal rápido de entrada/saída da tela de **Materiais** (a rota antiga) | **Recusa igual.** A checagem mora no motor, não na rota — travar só uma delas deixaria a outra aberta | a mesma de C7 |
| C9 | **Controle positivo de C7: ALMOXARIFE continua ajustando material NOSSO** | Mesmo usuário barrado em C7 (ou um ALMOXARIFE), lance um Ajuste em **MAT-001** | **Passa.** Só muda o dono do material entre os dois testes | — |
| C10 | **Todo ajuste de material de cliente fica auditado nomeando o cliente** | Faça o ajuste como ADMINISTRADOR e abra a auditoria | Fica registrado quem ajustou, o quanto, a justificativa **e a razão social do proprietário** | — |
| C11 | **Recebimento de material de cliente exige número de documento** | Crie um recebimento com um item de **CHP-002**, deixe o campo de **nota** em branco e clique em processar | **Recusa a nota inteira** — nenhum item entra | `Nao foi possivel dar entrada no estoque: CHP-002: material do cliente Cliente Alfa LTDA exige numero de documento (nota de remessa) para dar entrada` |
| C12 | **Documento em branco conta como ausente** | O mesmo com o campo preenchido só com **espaços** | **Recusa igual** | a mesma de C11 |
| C13 | **Controle positivo de C11: material NOSSO continua entrando sem nota** | Recebimento só com **MAT-001**, sem nota | **Passa** — travar isso para todo mundo quebraria todo recebimento do módulo | — |
| C14 | **Devolver ao cliente exige o número do documento de devolução** | Em **Materiais de Clientes**, escolha o Alfa, clique em **Devolver** na linha do CHP-002, informe 10 e **deixe o documento em branco** | A tela barra antes de enviar; forçado por API, o servidor recusa | toast: `Informe o número do documento de devolução` · servidor: `Dados inválidos — documento_devolucao: informe o numero do documento de devolucao` |
| C15 | **Devolução ao cliente só existe para material COM dono** | Force uma devolução ao cliente de **MAT-001** (material nosso) | **Recusa** | `O material MAT-001 nao pertence a nenhum cliente — nao ha para quem devolver. Para tirar material proprio do estoque use Movimentacoes (saida, sucata ou perda).` |
| C16 | **Com o documento preenchido, a devolução baixa o saldo** | Repita C14 informando o documento | **Passa.** O saldo do CHP-002 baixa e a linha **Devolução ao cliente** aparece no extrato do material | — |
| C17 | **Devolver ao cliente NÃO exige OS nem projeto** | A mesma devolução, sem informar vínculo nenhum | **Passa** — o destino é o próprio dono, exigir a OS dele para devolver a ele não faria sentido | — |
| C18 | **O material do cliente não entra em NENHUM número do estoque próprio** | Anote o **Valor total do estoque** no Dashboard. Dê entrada de **100 PC** de CHP-002 com custo R$ 25 (nota preenchida). Volte ao Dashboard | **Nenhum número muda:** nem valor total, nem materiais críticos, nem materiais zerados. E o relatório de **posição de estoque** também não | — |
| C19 | **O sistema não pede para comprar material que não é nosso** | Ponha o CHP-002 abaixo do estoque mínimo e rode a verificação de mínimos / veja a sugestão de compra | **Não aparece.** Antes, o sistema chegaria a **abrir uma solicitação de compra para repor a chapa de outra empresa** | — |
| C20 | **Nem manda alerta de estoque baixo dele** | Mesmo material abaixo do mínimo, com alertas configurados | **Nenhum alerta sai** para material de cliente. "Acabando, compre mais" sobre chapa de terceiro é o alerta errado para a pessoa errada | — |
| C21 | **Controle positivo de C18-C20: material NOSSO abaixo do mínimo continua sendo cobrado** | Ponha o **MAT-001** abaixo do mínimo e repita C19 e C20 | **Aparece** na sugestão de compra e **dispara** o alerta. Sem esta metade, um filtro escrito errado que zerasse tudo pareceria estar segregando | — |
| C22 | **Mas o material do cliente APARECE na ocupação de prateleira — de propósito** | Endereça o CHP-002 numa localização e abra o **Mapa de Localizações** | A quantidade dele **conta** na ocupação daquela posição. Escondê-la faria o mapa mentir sobre o que está fisicamente lá | — |
| C23 | **E APARECE no relatório de materiais bloqueados — de propósito** | Bloqueie parte do CHP-002 e abra o relatório de materiais bloqueados | **Aparece.** É relatório de **qualidade**: material de cliente bloqueado é exatamente o que o almoxarife precisa ver | — |
| C24 | **O selo diz DE QUAL cliente, nas três telas** | Abra **Materiais**, depois **Movimentações**, depois o **Extrato** do CHP-002 | Nas três, ao lado do material, o selo **"Cliente Alfa LTDA"** — não um rótulo genérico. Passando o mouse, o aviso: *não entra no estoque próprio e só sai com OS ou projeto desse cliente* | — |
| C25 | **Controle positivo do selo: material nosso não tem selo** | Olhe a linha do **MAT-001** nas mesmas três telas | **Sem selo nenhum.** Um selo pintado em toda linha não identificaria coisa alguma | — |
| C26 | **Material de cliente aceita lote e série como qualquer outro** | Ligue "Controle por lote" e "Controle por número de série" no CHP-002 e receba uma nota dele | Lote e série funcionam igual ao material nosso — **é o ganho central da unificação** | — |
| C27 | **As rotas da lista antiga não existem mais** | Chame `GET`/`POST /api/almoxarifado/materiais-cliente` ou `POST /materiais-cliente/:id/consumir` | **404.** Enquanto vivas, eram um caminho paralelo que **escapava de todas as travas acima** | — |

### Roteiro de teste manual (Etapa 8)

**Preparação (uma vez):** tenha dois clientes cadastrados — chame-os de **Cliente Alfa LTDA** e
**Cliente Beta SA** — e ao menos **um projeto de cada**. A guarda do dono lê o `cliente_id` do
projeto/OS, então sem os dois projetos não dá para demonstrar a recusa.

**A) Cadastrar a chapa do cliente**

1. **Almoxarifado → Materiais → Novo Material**. Preencha código `CHP-002`, nome "Chapa 3mm",
   unidade, custo unitário R$ 25.
2. Role até a seção **Propriedade** e escolha **Cliente Alfa LTDA**. (Deixar em "GMP — estoque
   próprio" é o padrão: material sem proprietário é nosso.)
3. Salve e volte à lista de Materiais. A linha do CHP-002 aparece com o **selo "Cliente Alfa
   LTDA"** (regra C24). A linha de um material nosso, logo ao lado, **não tem selo** (C25).

**B) Receber a chapa — sem nota não entra (C11)**

4. **Almoxarifado → Recebimentos → Novo**. Acrescente o item CHP-002 com 100 PC. **Deixe o campo
   de nota fiscal em branco** e clique em processar.
5. O sistema **recusa a nota inteira** com a mensagem de C11, nomeando o cliente. Nenhum item entra.
6. Tente de novo com o campo de nota preenchido só com **espaços** — recusa igual (C12).
7. Preencha o número da nota de remessa de verdade e processe. Agora **entra**, e o saldo do
   CHP-002 vira 100.
8. *(Controle positivo, C13)* Repita um recebimento só com material **nosso**, sem nota: **passa**.
   A trava é do material de cliente, não do recebimento.

**C) O número do estoque próprio não se mexeu (C18, C19, C20)**

9. Antes do passo 7 você anotou o **Valor total do estoque** no Dashboard? Volte lá agora. Os 100
   PC × R$ 25 = **R$ 2.500 do cliente NÃO entraram** no total. "Materiais críticos" e "Materiais
   zerados" também não mudaram por causa dele.
10. Abra o relatório de **posição de estoque**: o CHP-002 **não está lá**.
11. Baixe o CHP-002 para abaixo do estoque mínimo e rode a verificação de mínimos: **nenhuma
    solicitação de compra é criada** para ele (C19), e **nenhum alerta** sai (C20).
12. *(Controle positivo, C21)* Faça o mesmo com um material **nosso** abaixo do mínimo: a
    solicitação **é** criada e o alerta **sai**. Se os dois sumissem, o filtro estaria zerando a
    leitura em vez de segregar — e é exatamente esse o erro que este passo pega.

**D) A trava que mais importa: a chapa do Alfa no projeto do Beta (C1)**

13. **Almoxarifado → Movimentações → Nova Movimentação**. Material CHP-002, tipo **Saída para
    Produção**, quantidade 10.
14. No vínculo, escolha um **projeto do Cliente Beta SA**. Salve.
15. O sistema **recusa**, e a mensagem **nomeia os dois clientes** — o dono da chapa e o cliente do
    projeto. Sem os dois nomes você teria de adivinhar qual das pontas está errada.
16. Tire o vínculo e tente salvar sem OS nem projeto: recusa de novo, agora dizendo qual cliente
    informar (C2).
17. Escolha um projeto **interno** (sem cliente): recusa também — "nenhum cliente" não libera (C3).

**E) A exceção que surpreende: nem o emergencial passa (C4)**

18. Mesma saída do passo 13-14, agora marque **"Saída emergencial"** e escreva a justificativa.
19. **Continua recusando.** Em todo o resto do módulo, o emergencial libera a saída sem vínculo e
    marca "pendente de regularização" — **aqui não**. O emergencial existe para urgência no
    **nosso** estoque, onde dá para regularizar depois; consumir material de outra empresa sem
    dizer onde é problema **contratual**, não de pressa.
20. Agora troque o vínculo para um **projeto do Cliente Alfa LTDA** e salve: **passa** (C5), o
    saldo baixa e a aplicação passa a aparecer na tela de Materiais de Clientes.
21. *(Controle positivo, C6)* Faça uma saída de material **nosso** para o projeto do **Beta**:
    **passa**. A trava é sobre o dono do material, não sobre o cliente do vínculo.

**F) Ajustar o saldo do cliente exige permissão própria (C7-C9)**

22. Entre com um usuário de perfil **GESTOR** — que ajusta o estoque próprio normalmente — e lance
    um **Ajuste** no CHP-002. **403**, com a mensagem de C7 dizendo o seu perfil.
23. Repita pelo **modal rápido de entrada/saída da tela de Materiais** (a rota antiga): **recusa
    igual** (C8). A checagem mora no motor; travar só uma das rotas deixaria a outra aberta — e
    era exatamente por essa porta que um ALMOXARIFE zerava o saldo da chapa do cliente antes.
24. *(Controle positivo, C9)* Com o mesmo usuário, ajuste um material **nosso**: **passa**.
25. Entre como **ADMINISTRADOR** e faça o ajuste no CHP-002: passa, e a auditoria registra o
    ajuste **nomeando o cliente proprietário** (C10).

**G) A tela nova: Materiais de Clientes**

26. **Almoxarifado → Materiais de Clientes**. Escolha **Cliente Alfa LTDA** no seletor.
27. Confira a tabela: **recebido**, **consumido**, **devolvido**, **saldo** e **saldo disponível**
    por material, e abaixo as **aplicações** — em quais OS/projetos o material do Alfa foi usado.
28. Troque para **Cliente Beta SA**: os números do Alfa **somem** e aparecem os do Beta. Nenhum
    material do Alfa pode aparecer aqui.
29. Clique em **PDF de posição**: baixa o documento com a posição do cliente escolhido (gerado no
    navegador, como as etiquetas da Etapa 6c).

**H) Devolver ao cliente (C14-C17)**

30. Na linha do CHP-002, clique em **Devolver**. Informe a quantidade e **deixe o documento em
    branco**: a tela barra com `Informe o número do documento de devolução` (C14).
31. Preencha o número do documento de devolução e confirme: **passa**, o saldo baixa (C16).
32. Abra o **Extrato** do CHP-002: a linha **Devolução ao cliente** está lá, com o documento.
    Repare que **não foi pedida OS nem projeto** (C17) — o destino é o próprio dono.
33. **Não confunda com a tela Devoluções da Etapa 7.** Lá o material **volta** para o estoque
    (entrada, vindo do chão de fábrica); aqui ele **sai** do prédio de volta para quem é dele.

**I) O que continua aparecendo — e é assim de propósito (C22, C23)**

34. Endereça o CHP-002 numa prateleira e abra o **Mapa de Localizações**: a quantidade dele
    **conta** na ocupação daquela posição. A chapa está fisicamente lá; escondê-la faria o mapa
    mentir sobre o galpão.
35. Bloqueie parte do CHP-002 e abra o relatório de **materiais bloqueados**: ele **aparece**. É
    relatório de qualidade — material de cliente bloqueado é exatamente o que o almoxarife precisa
    ver. **O que evita a confusão é o selo, não esconder o material.**

### ⚠️ O que fazer ANTES de subir a Etapa 8 para produção

**1. Saiba que a conferência de inventário escapa da permissão nova.** Concluir uma conferência de
estoque com **"aplicar ajustes"** grava o `quantidade_atual` do material por um **caminho antigo,
fora do motor** — e portanto **fora** da permissão `ajustar_material_cliente`. O gate daquela tela é
`ajustar_estoque` (ADMINISTRADOR/GESTOR).

> **Consequência prática, e ela é real:** um GESTOR barrado no passo F/22 acima consegue **mudar o
> mesmo saldo** pela conferência de inventário, sem a autorização especial e sem a auditoria que
> nomeia o cliente. **Não é hipótese** — foi confirmado por dois revisores independentes durante a
> etapa. Não foi corrigido porque fechar isso significa reescrever a aplicação de ajustes da
> conferência para passar pelo motor, o que é uma etapa por si. **Enquanto isso: trate a conclusão
> de conferência com ajustes como operação de ADMINISTRADOR quando houver material de cliente
> envolvido**, e confira a posição do cliente depois de cada conferência.
>
> É a mesma família da pendência já registrada em "Ajuste de inventário homologado pode
> *evaporar*", no fim deste guia — os dois se resolvem pelo mesmo conserto.

**2. Confirme que a tabela antiga está vazia em produção.** A lista à parte de materiais de cliente
foi aposentada (as rotas de gravação saíram, porque enquanto vivas escapavam de todas as travas
desta etapa), mas a medição de "0 linhas" cobriu **só o banco de desenvolvimento**. **A tabela foi
preservada de propósito — nenhuma linha foi apagada.** Rode no banco de **produção**:

```sql
SELECT COUNT(*) AS total,
       SUM(CASE WHEN ativo = 1 THEN 1 ELSE 0 END) AS ativos
  FROM materiais_cliente_almoxarifado;
```

- **`total = 0`** → nada a fazer. Registre o número e a data na spec 13
  (`specs/modulo-almoxarifado/13-materiais-clientes/README.md`, seção "⚠️ PENDENTE — confirmar
  produção") e marque a pendência como fechada. A tabela continua existindo mesmo assim — só um
  `DROP` deliberado a remove, e ele **não** faz parte da Etapa 8.
- **`total > 0`** → **não é motivo para reverter nada**, e nada foi perdido. Mas passa a ser dado
  real sem migração: leia esse dado por **SQL direto** na tabela (que continua lá) e planeje uma
  **migração assistida** antes de qualquer `DROP` — cada linha vira um material com
  `proprietario_cliente_id` mais a movimentação de entrada correspondente. É assistida e não
  automática porque a descrição da tabela antiga é texto livre sem chave, então não há como casar
  com material existente sozinho.

### Pendências que a Etapa 8 levantou ou herdou (registradas, não consertadas)

- **⚠️ A conferência de inventário ajusta fora do motor** (item 1 acima) — a mais importante desta
  etapa para quem apresenta o sistema.
- **Os relatórios que misturam continuam sem selo.** Os relatórios de **materiais bloqueados** e de
  **materiais sem endereço** mostram material de cliente junto com o nosso (e isso é o correto, ver
  C22/C23), mas **não trazem o selo** — ele foi entregue nas três telas operacionais (Materiais,
  Movimentações, Extrato). É decisão declarada, não esquecimento: fica para quem fechar a feature.
- **Da Etapa 7, continuam abertas as duas:** (a) **Ajuste de inventário não acerta o "bloqueado"**
  — material com 8 bloqueadas e um Ajuste levando o total para 1 fica com Disponível **negativo**,
  sem aviso; a decisão é de negócio e está esperando você; (b) **estado parcial na devolução para
  Sucata, sem notificação** — resolução manual pela auditoria. Ambas detalhadas na seção da Etapa 7.

### O que a Etapa 8 **não** cobre

- **Materiais enviados a terceiros** (a chapa **nossa** que vai para o fornecedor beneficiar) —
  é a feature 14 e virou a **Etapa 8b**, **entregue no mesmo dia** (ver a seção "Etapa 8b" logo
  abaixo). A **transformação** (chapa → peças cortadas), que ficou fora da 8b, foi entregue na
  **Etapa 8c** em 2026-08-13 — ver a seção "Etapa 8c", mais abaixo.
- **E-mails específicos de material de cliente** (avisar gestor do projeto, comercial, engenharia)
  — feature 19.
- **Sobras vinculadas ao proprietário** — o retalho que sobra da chapa do cliente ainda não fica
  amarrado a ele; depende da tela de retalhos, feature 15.
- **Relatórios de perdas, não conformes e reservados por cliente**, e **valorização** (custo) por
  cliente — o PDF de posição traz **quantidades**, não valor. Feature 21.
- **Fluxo de aprovação do ajuste** (solicitar → pendente → alguém aprova → efetivar). O que entrou
  foi **permissão dedicada**, que é imediata. O fluxo assíncrono é máquina de estados com tela de
  pendências e notificação — feature 06.
- **Comprovante de devolução ao cliente em PDF.** A devolução em si existe; o documento impresso
  dela não. O único PDF da etapa é o de **posição por cliente**.
- **Seleção de cliente na movimentação.** O dono vem da **linha do material**, não de um seletor na
  hora do lançamento — é assim de propósito: a chapa do Cliente X tem certificado e corrida
  próprios e não pode ser trocada pela do Cliente Y, então são duas linhas de catálogo.

> **Correção declarada (2026-08-12):** o primeiro item desta lista dizia *"Materiais enviados a
> terceiros … Nada dela existe hoje"*. Isso **envelheceu no mesmo dia** — a Etapa 8b foi entregue
> logo depois e o ciclo de remessa e retorno existe. O item foi corrigido acima em vez de apagado,
> porque a afirmação chegou a ser verdadeira e alguém pode tê-la lido.

---

## Etapa 8b — Remessas a Terceiros (ENTREGUE — 2026-08-12)

**O que é:** o material **nosso** (ou do cliente) que sai do prédio para alguém beneficiar — corte,
dobra, usinagem, tratamento, pintura, galvanização — e depois volta. É o **oposto** da Etapa 8: lá
o material de **outro** estava **conosco**; aqui o material fica **fora**, e continua sendo nosso.

**Não confundir com as duas telas vizinhas:**

| Tela | O material está... | Etapa |
|---|---|---|
| **Devoluções** | voltando **para** o estoque, vindo do chão de fábrica | 7 |
| **Materiais de Clientes** | **aqui**, mas é de outro dono | 8 |
| **Remessas a Terceiros** | **fora do prédio**, e é nosso (ou de um cliente nosso) | **8b** |

### Antes → Agora

| Antes | Agora |
|---|---|
| Chapa que vai galvanizar **some do controle**: ou baixa que apaga o patrimônio, ou nenhuma baixa e o sistema mente sobre a prateleira | Sai do **disponível** e **continua no total**, com documento, terceiro e prazo |
| Não existia tela, tabela nem rota — a feature 14 estava vazia | Tela **Almoxarifado → Remessas a Terceiros**, com criar / enviar / receber retorno / encerrar / cancelar |
| Não havia como saber o que está em cada terceiro | Lista com o terceiro, o serviço, o prazo e o status; filtro por status; e selo vermelho **Vencida** quando o prazo passou e ainda há material lá fora |
| Retorno parcial não existia | Vários retornos por remessa, com teto que soma o que já voltou, **por item** |
| O que não voltava ficava indefinido para sempre | Encerrar exige **destino** (Perda no terceiro / Consumido no processo) + justificativa, e dá **baixa de verdade** |
| A contagem de inventário cobraria material que está a 40 km | O esperado da conferência **já vem descontado** — e bloqueado/quarentena **continuam** sendo contados |
| Não havia documento para acompanhar o material | **PDF da remessa**, com o terceiro, os itens e **duas linhas de assinatura** |
| Nada registrava que a chapa de um **cliente** saiu do prédio para beneficiar | A remessa registra o proprietário e o **PDF nomeia o cliente** |

### Tabela consolidada — Etapa 8b

| Onde | O que fazer | O que acontece |
|---|---|---|
| Almoxarifado → Remessas a Terceiros | **Nova remessa** | Escolhe terceiro (cadastrado em Compras **ou** nome digitado), tipo de serviço, prazo previsto, e acrescenta itens (material + quantidade + peso). Nasce **ABERTA** — nada saiu do estoque ainda |
| Linha da remessa ABERTA | **Enviar** | O saldo é **retido**: sai do disponível, o total não muda. Vira **ENVIADA**. Recusa a remessa **inteira** se algum material não couber |
| Linha ENVIADA / RETORNO PARCIAL | **Registrar retorno** | Escolhe o item, a quantidade e (opcional) a nota fiscal do retorno. Vira **RETORNO PARCIAL** — ou **ENCERRADA** direto, se não sobrou nada |
| Linha ENVIADA / RETORNO PARCIAL | **Encerrar** | Se sobrou saldo lá fora, **exige destino + justificativa**; se não sobrou, encerra sem perguntar |
| Linha ABERTA / ENVIADA / RETORNO PARCIAL | **Cancelar** | Exige motivo. Devolve ao disponível **só o que ainda estava lá fora** (se ainda não foi enviada, não mexe em saldo nenhum) |
| Remessa aberta na tela | **PDF da remessa** | Baixa o documento no navegador |
| Almoxarifado → Conferência de inventário | Abrir uma conferência | O **esperado** de cada material já vem **sem** o que está no terceiro |

### Roteiro de teste manual (Etapa 8b)

Faça na ordem — cada passo depende do anterior. Use um usuário **ADMINISTRADOR** ou
**ALMOXARIFE** (só esses dois perfis têm a ação `remessar_terceiro`).

**Preparação.** Em **Materiais**, escolha (ou crie) dois materiais com saldo: `CHP-3MM` com **100
PC** e `MAT-002` com **5 UN**. Anote o **Disponível** dos dois.

1. **Abrir a tela.** Menu **Almoxarifado → Remessas a Terceiros**. A tela abre com a lista vazia
   ("Nenhuma remessa a terceiros") e os botões **Nova remessa**, **PDF da remessa** (desabilitado,
   porque nenhuma remessa está aberta) e **Atualizar**.
2. **Criar a remessa com dois itens.** Clique em **Nova remessa**. Preencha **Nome do terceiro** =
   `Galvanizadora Sul LTDA`, **Tipo de serviço** = `Galvanização`, **Prazo previsto de retorno** =
   uma data futura. Acrescente o item `CHP-3MM` com quantidade **30** e o item `MAT-002` com
   quantidade **50** (mais do que ele tem — é de propósito). Confirme. A remessa aparece na lista
   como **ABERTA**.
3. **Tentar enviar e ver a recusa da remessa INTEIRA.** Clique em **Enviar** na linha da remessa. O
   sistema recusa com:
   > `Nao foi possivel enviar a remessa REM-…: MAT-002: disponivel 5 UN, a remessa pede 50`

   **Agora volte a Materiais e confira o que mais importa:** o disponível do `CHP-3MM` **continua
   100**. Nem o item que caberia saiu. É esse o ponto — o operador corrige a linha que falta e
   reenvia, em vez de descobrir depois que metade da remessa saiu.
4. **Duas linhas do mesmo material que juntas estouram.** *(Opcional, mas é a regra que mais custou
   a acertar.)* Crie outra remessa com **duas linhas de `CHP-3MM`, de 60 cada** — é caso normal, uma
   por lote. Envie:
   > `Nao foi possivel enviar a remessa REM-…: CHP-3MM: disponivel 100 PC, a remessa pede 120 em 2 linhas`

   Repare no **"em 2 linhas"**: sem ele, você olharia uma linha de 60, veria 100 disponíveis e
   concluiria que o sistema está errado.
5. **Corrigir e enviar de verdade.** Clique em **Nova remessa** e monte de novo, agora **só** com
   `CHP-3MM` × **30** (a remessa criada no passo 2 não tem edição de itens depois de salva — o
   caminho é criar a certa e **Cancelar** a errada, que estando ABERTA não mexe em saldo nenhum).
   Clique em **Enviar** na remessa nova. O status vira **ENVIADA**.
6. **Conferir o efeito no saldo — o ponto central da etapa.** Abra **Materiais** e procure o
   `CHP-3MM`: o **total continua 100** e o **Disponível é 70**. Confirme pela porta dos fundos: em
   **Movimentações**, lance uma **Saída** de **80** desse material. O sistema recusa com:
   > `Saldo insuficiente. Disponível: 70 UN`
7. **A contagem de inventário não cobra o que está no terceiro.** Abra **Almoxarifado →
   Conferência de inventário** e crie uma conferência nova. Procure o `CHP-3MM`: o **esperado é
   70**, não 100. Conte **70** → a **divergência é zero**.
   *Antes desta etapa isso acusaria −30*, e o instinto seria "corrigir" o saldo para menos de
   material que existe e vai voltar.
8. **O controle da regra anterior — bloqueado e quarentena CONTINUAM sendo contados.** Num outro
   material, bloqueie parte do saldo (tela de Movimentações ou Inspeções) e abra uma conferência: o
   esperado dele é o **total cheio**, sem descontar o bloqueado. Aquele material **está** na
   prateleira e tem de ser contado. Só o que está no terceiro sai da contagem.
9. **Registrar um retorno parcial.** Volte a Remessas, clique em **Registrar retorno** na remessa
   ENVIADA. Escolha o item, quantidade **20**, e confirme. O status vira **RETORNO PARCIAL**. Abra a
   remessa: a coluna **Retornado** mostra 20 e **Ainda no terceiro** mostra 10. Em Materiais, o
   disponível subiu para **90**.
10. **Tentar receber de volta mais do que saiu.** Clique em **Registrar retorno** de novo e peça
    **40**:
    > `Retorno acima do enviado: o item CHP-3MM enviou 30 PC, ja retornaram 20 e ainda estao no terceiro 10 — este recebimento pede 40`

    A mensagem dá os quatro números de propósito: sem eles você teria de adivinhar quanto ainda pode
    receber.
11. **Tentar encerrar deixando saldo lá fora, sem dizer para onde foi.** Clique em **Encerrar** e
    confirme **sem escolher destino**:
    > `A remessa REM-… tem 10 PC que nunca voltaram (CHP-3MM: 10 PC). Para encerrar, informe o destino desse saldo: PERDA_NO_TERCEIRO ou CONSUMIDO_NO_PROCESSO, mais a justificativa.`

    A mensagem nomeia **a quantidade real que sobrou**, não um "informe o destino" seco.
12. **Encerrar com destino, e ver o saldo em terceiros zerar.** No mesmo modal, escolha **Destino do
    saldo que não voltou** = `Perda no terceiro`, escreva a justificativa e confirme. A remessa vai
    para **ENCERRADA**. Em **Materiais**, o `CHP-3MM` fica com total **90** e disponível **90** — o
    saldo em terceiros **zerou**, não ficou preso. No **Extrato do material**, o lançamento da perda
    no terceiro aparece no livro.
13. **Imprimir o documento.** Abra qualquer remessa e clique em **PDF da remessa**. Confira no
    arquivo baixado: número, terceiro, itens com quantidades e as **duas linhas de assinatura**.
14. **Remessa de material de cliente.** Crie uma remessa com um material que tenha **proprietário**
    (Etapa 8). Ela **passa sem exigir OS nem projeto do cliente** — mandar galvanizar não é
    *aplicar* a chapa no trabalho de ninguém. Gere o PDF: ele **nomeia o cliente proprietário**.
    *Controle:* tentar uma **saída** normal daquele mesmo material sem a OS do dono continua sendo
    recusada, como na Etapa 8.
15. **Tentar misturar donos.** Monte uma remessa com uma chapa do **Cliente A** e outra do
    **Cliente B**:
    > `A remessa mistura materiais de donos diferentes (Cliente A LTDA e Cliente B LTDA). O documento de remessa nomeia UM proprietario — separe em remessas diferentes.`

    ⚠️ **Esta regra foi deduzida, não pedida** — ver "O que depende de você", logo abaixo.
16. **Sem a permissão, não dá.** Entre com um usuário de perfil **PRODUÇÃO** ou **CONSULTA** e
    clique em **Enviar** (ou Registrar retorno / Encerrar / Cancelar): aparece o aviso de falta de
    permissão **antes** de o formulário abrir, e nada é enviado. Forçando a chamada por fora, o
    servidor responde **403** (`Sem permissão para esta operação`, dizendo a ação que faltou:
    `remessar_terceiro`).
    *Repare que os botões continuam visíveis:* é de propósito — se a consulta de permissões falhar,
    a tela **deixa passar** e quem decide é o servidor. Esconder botão por erro de rede tiraria a
    função de quem tem direito a ela.
    **Ler** a lista de remessas continua liberado para qualquer usuário do módulo — quem consulta
    precisa poder ver onde o material está.
17. **Cancelar depois de enviar.** Crie e envie outra remessa de 100; registre o retorno de 60;
    depois **Cancele** com motivo. Voltam ao disponível **só os 40** que ainda estavam lá fora, não
    os 100.

### O que depende de você (Etapa 8b)

1. **"Uma remessa não pode misturar materiais de donos diferentes" foi DEDUZIDO, não confirmado.**
   A regra saiu de uma frase do desenho — *"o documento de remessa nomeia o proprietário"*, no
   singular — e virou recusa (passo 15). **Se na prática a GMP manda numa mesma viagem a chapa de
   dois clientes para o mesmo galvanizador, isso está errado**: a regra teria de virar "o documento
   **lista** os donos, por item". Nada é irreversível — o dono de cada item já é lido do próprio
   material, não há dado a migrar, e a mudança é pequena.
2. **Falta a verificação no navegador de duas coisas que teste automático não vê.** Os testes desta
   tela leem o arquivo de estilos para garantir que as classes existem, mas **não abrem navegador**:
   (a) confirmar que os **cinco selos de status** (ABERTA, ENVIADA, RETORNO PARCIAL, ENCERRADA,
   CANCELADA) aparecem cada um **com cor**, e que o selo vermelho **Vencida** fica **ao lado** do
   status e não no lugar dele; (b) confirmar que o **PDF baixa legível**, com número, terceiro,
   itens, as duas assinaturas e — em remessa de material de cliente — o nome do proprietário. *Essa
   lacuna já mordeu a Etapa 7: classe de estilo inventada sai sem cor e nenhum teste percebe.*
3. **Uma pendência antiga ganhou um terceiro caminho.** O **Ajuste não reconcilia material
   retido** — e agora isso alcança também o "em terceiros": mandar 30 chapas galvanizar e depois
   ajustar o total do material para 10 deixa `em terceiros (30) > total (10)`, com **disponível
   negativo e sem aviso**. O caminho mais provável é a própria **conferência de inventário**, que
   grava `quantidade_atual` por fora do motor (o mesmo furo da Etapa 8). **A 8b reduziu a chance
   sem resolver a causa:** o esperado da contagem agora vem certo (some o impulso de "corrigir"), e
   o encerramento da remessa é o caminho controlado para zerar a retenção. **Enquanto a decisão de
   negócio não vier: encerre as remessas em aberto antes de lançar um ajuste que reduz o total.**

### O que a Etapa 8b **não** cobre

- **Transformação** — a chapa que sai e volta como 40 peças cortadas mais uma sobra. É a
  **Etapa 8c**, a outra metade da feature 14 — **e ela foi entregue em 2026-08-13** (seção "Etapa
  8c", mais abaixo). **A fronteira é real, não um corte pela metade:**
  tratamento, pintura e galvanização devolvem o **mesmo** material, e para eles o ciclo está
  **completo** nesta etapa; só corte, dobra e usinagem devolvem material **diferente**. Até a 8b o
  sistema **recusava** o retorno de material diferente, com mensagem que apontava para a 8c;
  desde a 8c existe o botão **Transformar**.
- **E-mail** no envio e no retorno (feature 19) e **alerta automático** de atraso (feature 20). O
  prazo é gravado, a leitura das remessas vencidas existe e a tela destaca — o **disparo** é das
  outras features. Não há agendador no projeto, e introduzir um é decisão de infraestrutura.
- **Anexo de desenhos** nos itens da remessa — dizia-se aqui que "o consumidor natural dele é a 8c".
  **A 8c não o consumiu:** ela foi entregue sem anexo de desenho, e a pendência continua aberta.
- **Estornar pelo livro uma baixa de perda/consumo no terceiro devolve o material ao disponível**,
  e **não** à situação "em terceiros": a remessa já está encerrada, e recriar a retenção deixaria
  saldo preso sem remessa viva por trás. Já o par **remessa/retorno não é estornável pelo livro** —
  o caminho é a própria tela de Remessas, senão o livro registraria uma reversão que não aconteceu.
- **Saldo por almoxarifado.** Continua valendo a decisão de negócio do módulo: almoxarifado é área
  física do mesmo site. A segregação que esta etapa introduz é **estar ou não no prédio**, que é
  outra coisa.
- **Uma consequência conhecida da guarda de bloqueio:** material que tenha **ao mesmo tempo** saldo
  bloqueado e saldo em terceiros pode ter o encerramento da remessa barrado pela guarda
  "Material bloqueado não pode ser utilizado". Não foi mexido porque é a mesma pendência do Ajuste
  (item 3 acima), e a decisão é de negócio.

### O que fazer antes do deploy (Etapa 8b)

**Nada.** A etapa só **acrescenta** uma coluna (`quantidade_em_terceiros`, que nasce zerada) e três
tabelas novas; **nenhum dado existente é tocado ou reinterpretado**, e não há passado a corrigir.
Isto está escrito explicitamente porque as Etapas 7 e 8 deixaram consultas para rodar em produção e
você vai procurar a desta — **as daquelas duas continuam pendentes**, esta não acrescenta nenhuma.

---

## Etapa 8c — Transformação no Terceiro (ENTREGUE — 2026-08-13)

**Em uma frase:** a chapa que sai para o cortador e volta como 40 peças e uma sobra para de mentir
no estoque — a chapa é baixada de verdade, as peças entram com o custo dela rateado, e o sistema
diz quanto do peso voltou.

**O problema que existia.** A Etapa 8b resolveu a metade fácil do beneficiamento: galvanizar,
pintar e tratar devolvem **o mesmo material**. Cortar, dobrar e usinar devolvem **outra coisa** — e
para essa metade o sistema **recusava o retorno**, com uma mensagem literalmente dizendo que era a
Etapa 8c. Sobravam duas saídas, as duas ruins: registrar como se a chapa tivesse voltado inteira
(o estoque passa a ter uma chapa que não existe, e a peça que existe não aparece em lugar nenhum),
ou não registrar nada (o material some do controle exatamente na hora em que vira produto).

### Antes → Agora

| Situação | Antes (até a 8b) | Agora (8c) |
|---|---|---|
| Chapa mandada cortar volta como 40 peças | O sistema **recusava** o retorno. Registrar era impossível sem mentir | Botão **Transformar**: você diz **quanto da chapa foi consumido** e **o que voltou** (N linhas). A chapa é baixada e as peças entram no estoque |
| Custo das peças | Não havia peça no estoque; não havia custo | O custo da chapa é **dividido entre as peças pela quantidade**. A **sobra entra a custo zero** — de propósito |
| Custo do serviço do terceiro (a nota do cortador) | Não entrava em lugar nenhum | Campo **opcional** no modal. Se preenchido, **soma ao custo das peças**. Em branco, não entra: o sistema **não estima** |
| Custo médio dos materiais recebidos por NF | Só era alimentado por movimentação manual com custo digitado à mão — quase todo material tinha custo médio **zerado** | O recebimento por NF passa a alimentar o custo médio com o valor unitário da linha da nota. **Vale só daqui para frente** |
| Chapa de cliente cortada | — | A peça **tem de estar cadastrada com o mesmo dono da chapa**. Se não estiver, o sistema recusa **dizendo de quem é cada um** |
| Material da peça ainda não cadastrado | — | O sistema **não cria sozinho**. O modal tem o botão **Criar material resultante**, que cadastra na hora já com a **família e o dono da chapa** |
| Conferir se os pesos fecham | — | Quando **todos** os materiais têm peso cadastrado, aparece o **rendimento** (peso que voltou ÷ peso que saiu). Quando falta peso, o sistema diz **qual material** falta — e **deixa registrar do mesmo jeito** |
| Cadastrar vários materiais em sequência | O gerador de código repetia o número: cadastrar 5 peças seguidas dava "Código já existe" | O gerador usa o **maior número** da família, e o cadastro **tenta de novo** sozinho quando dois pedidos batem |
| Coluna da remessa | "Retornado" e "Baixado (não voltou)" | Ganhou **"Transformado"** — o que virou outra coisa não é a mesma coisa que o que voltou como era |

### As regras, com o cenário exato

As mensagens abaixo são as **mensagens reais do sistema**, copiadas do código.

**1. Transformar baixa a chapa DE VERDADE — patrimônio e retenção.**
*Cenário:* chapa com 100 KG, remessa de 100 enviada, transformação consumindo 100 e devolvendo
40 peças. Depois: em **Materiais**, a chapa fica com **total 0** e **em terceiros 0**; a peça fica
com **40**. No **Extrato** da chapa aparece um lançamento de **consumo no terceiro** de 100, e no
extrato da peça um **retorno de transformação** de 40.
*Por que a baixa vem antes do crédito:* se o crédito falhar no meio, o estoque fica **a menos** por
alguns instantes, nunca **a mais** — material fantasma é pior que material temporariamente faltando.

**2. O custo da chapa é rateado entre as peças, pela quantidade.**
*Cenário:* chapa a **R$ 10/KG**, 100 KG consumidos = **R$ 1.000**. Resultado: 40 peças + 1 sobra.
As 40 peças ficam com custo unitário **R$ 25** (1.000 ÷ 40) e a sobra com **R$ 0**.
*Verificado por execução nesta entrega* — a sonda do fechamento leu no banco a peça com
`custo_medio = 25` e a sobra com `custo_medio = 0`.

**3. A sobra entra a custo ZERO, e isso é decisão sua, não esquecimento.**
*Por quê:* a sobra é **uma linha só e uma fatia grande**. Ratear por quantidade colocaria numa única
sobra a mesma fatia de valor de uma peça — e, na prática, rateá-la deixaria as peças mais caras sem
que nada tenha acontecido de verdade com elas. Foi escolhido ratear pela **quantidade** e
**descartado ratear pelo peso**, porque peso unitário é cadastro opcional que quase nenhum material
tem preenchido: uma regra que dependesse dele falharia justamente nos materiais mais comuns.
*Consequência declarada:* se **todas** as linhas forem sobra, não há entre quem ratear — o valor da
chapa **evapora de propósito**, e o número fica **escrito na justificativa** da baixa da chapa, para
não sumir sem rastro.

**4. O custo do serviço do terceiro é opcional e soma quando informado.**
*Cenário:* a mesma chapa de R$ 1.000, com **R$ 200** de nota do cortador → as 40 peças ficam a
**R$ 30** (1.200 ÷ 40). Em branco, ficam a R$ 25. **O sistema não estima nada.**

**5. A peça tem de ter o MESMO dono da chapa.**
*Cenário:* remessa com chapa do Cliente A; transformar para um material nosso:
> `A peca resultante tem dono diferente da chapa: CHP-A e de Cliente A LTDA e PC-001 e de estoque proprio (material nosso). A transformacao nao pode mudar o proprietario do material — cadastre o material resultante com o mesmo proprietario da chapa, ou escolha outro material de destino.`

*Por que a mensagem nomeia os dois:* sem isso o operador lê "dono diferente" e não sabe **qual dos
dois cadastros** está errado. Sem esta guarda, material de cliente viraria patrimônio da GMP em
silêncio — o oposto do que a Etapa 8 inteira construiu.

**6. O sistema NÃO cria o material resultante sozinho — e a recusa ensina o caminho.**
*Cenário:* transformar para um material que não existe:
> `O material 999 do resultado nao existe. Cadastre o material resultante primeiro (Almoxarifado > Materiais > Novo, ou o atalho "Criar material resultante" na tela de Remessas) e refaca a transformacao — o sistema nao cria material sozinho a partir de um formulario de retorno.`

*Por que não criar sozinho:* cadastro-lixo em almoxarifado **não se apaga — ele ganha saldo**. Um
erro de digitação viraria um material permanente com estoque.

**7. Chapa que volta como ela mesma NÃO é transformação.**
> `O resultado CHP-3MM e o MESMO material da chapa enviada. Chapa que volta como ela mesma nao e transformacao: use o retorno simples da remessa.`

**8. Não dá para consumir mais do que está no terceiro.**
> `Retorno acima do enviado: o item CHP-3MM enviou 100 KG, ja retornaram 70 e ainda estao no terceiro 30 — este recebimento pede 40`

*Detalhe que importa:* o teto é sobre a **quantidade consumida da chapa**, na unidade da chapa. As
quantidades dos **resultados** estão em outra unidade e **não** entram nessa conta — 40 peças (UN)
não "cabem" nos 100 KG, são coisas diferentes.

**9. Transformação é tudo ou nada.** Um item inválido no documento **não aplica nenhum** item do
lote — mesma regra do envio da 8b.

**10. Se o crédito da segunda peça falhar, a chapa volta — e a remessa pode ser transformada de novo.**
Não há transação de banco neste módulo; a compensação é explícita. O teste decisivo desta regra não
é "os números voltaram", é **a retransformação depois da falha funciona**.

**11. O rendimento é informativo e NUNCA bloqueia.**
*Cenário:* chapa com peso unitário 7,85 kg × 100 = **785 kg** saíram; 40 peças de 15 kg + 1 sobra de
120 kg = **720 kg** voltaram → aparece o aviso:
> `Rendimento: 91.72% (saíram 785 kg, voltaram 720 kg)`

Se **algum** material não tiver peso cadastrado, o aviso vira:
> `rendimento nao calculavel — peso unitario nao cadastrado em: <códigos>`

**e a transformação acontece do mesmo jeito.** O rendimento aparece **num aviso, uma vez, logo
depois de confirmar** — ele **não fica guardado**: não existe coluna de rendimento e ele **não
aparece** ao reabrir a remessa.

**12. Quem pode transformar, e quem pode criar o material.**
Transformar exige a ação **`remessar_terceiro`** (ADMINISTRADOR e ALMOXARIFE). O atalho **Criar
material resultante** tem gate **próprio** — `criar_material` —, porque ENGENHARIA cadastra material
e não transforma; usar o gate da transformação tiraria a função de quem tem direito a ela.
*Os botões continuam VISÍVEIS de propósito:* a tela barra no clique com o mesmo texto que o servidor
produziria, e **falha aberto** se a consulta de permissões não carregar. Quem decide é o backend.

### Roteiro de teste manual (Etapa 8c)

1. **Almoxarifado → Recebimentos**: dar entrada numa nota com uma chapa, **100 KG a R$ 10**. Depois,
   em **Materiais**, conferir que o **custo médio** da chapa ficou **R$ 10** (antes ficava R$ 0).
2. **Almoxarifado → Remessas a Terceiros → Nova remessa**: terceiro "Corte a Laser", tipo de serviço
   "Corte", item = a chapa, quantidade **100**. **Enviar**.
3. Conferir em **Materiais** que a chapa **sumiu do disponível** e **continua no total**.
4. Voltar em Remessas, **Abrir** a remessa e clicar em **Transformar**.
5. Selecionar o item e pôr **Quantidade consumida = 100**.
6. Clicar em **Criar material resultante**, nome "Peça cortada 010", unidade "UN", **Cadastrar e
   usar**. Conferir que o código gerado segue a **família da chapa** e que ele **já vem selecionado**
   no campo de material do resultado.
7. Quantidade do resultado = **40**, Classificação = **Peça**, **Adicionar resultado**.
8. Selecionar um material de sobra, quantidade **12**, Classificação = **Sobra**, **Adicionar
   resultado**.
9. **Confirmar transformação.** Conferir os dois avisos: o de sucesso e o de **rendimento**.
10. Em **Materiais**: a chapa **zerada** (total **e** disponível); a peça com **40 UN** e custo médio
    **R$ 25**; a sobra com 12 e custo **R$ 0**.
11. Reabrir a remessa: a coluna **Transformado** mostra 100, e a linha "Retornos recebidos" mostra
    `[peça, R$ 25/un]` e `[sobra]`.
12. **O teste da recusa:** tentar transformar de novo — a remessa já está ENCERRADA e o botão
    **Transformar** não deve nem aparecer.
13. **O teste do dono:** criar uma remessa com uma chapa **de cliente**, enviar, e tentar transformar
    para um material **nosso**. O sistema tem de recusar **nomeando os dois donos** (regra 5 acima).

### O que depende de você (Etapa 8c)

1. **A regra de rateio é decisão sua, e está aqui escrita como decisão.** Rateio **por quantidade**,
   **sobra a custo zero**, **custo do serviço opcional**. Foi **descartado** ratear por peso — peso
   unitário é cadastro opcional que quase nenhum material tem preenchido, e uma regra que dependesse
   dele falharia justamente no caso mais comum. Se a operação real for outra, **é mudança de regra,
   não bug**.
2. **A verificação no navegador não foi feita.** Nenhum navegador foi aberto nesta entrega. Falta
   conferir: o modal renderizando **largo** sem estourar a tabela de resultados; o material
   recém-criado aparecendo **visivelmente selecionado** no campo; os **avisos** aparecendo; e a
   coluna **Transformado** com dado real vindo do servidor. Vale **5 minutos**.
3. **A regra herdada da 8b continua valendo e continua sendo pergunta:** "uma remessa não mistura
   materiais de donos diferentes" foi **deduzida**, não pedida. A 8c **aperta** o mesmo eixo (a peça
   tem de ter o mesmo dono da chapa) — se a primeira regra estiver errada, a segunda merece a mesma
   revisão.

### O que fazer antes do deploy (Etapa 8c)

**Nenhuma consulta nova.** A 8c só **acrescenta** três colunas na tabela de resultados de retorno
(que nascem vazias) e um tipo de movimento novo; **nenhum dado existente é tocado ou
reinterpretado**. As consultas das **Etapas 7 e 8 continuam pendentes** — esta não acrescenta uma
terceira.

**Mas dois números que você olha vão mudar**, e é por causa das duas correções de 2026-08-13,
logo abaixo: o **relatório de posição de estoque** passa a valorar material que estava indo a zero,
e a **posição por cliente** passa a contar consumo/perda no terceiro como "consumido". Nenhuma das
duas mexe em dado — as duas mudam a **leitura**. Vale avisar quem compara relatório com o mês
passado.

### O que a Etapa 8c **não** cobre (é decisão declarada, não esquecimento)

- **Não planeja o corte.** Não há lista de materiais, ordem de produção nem aproveitamento de chapa
  (*nesting*). O sistema **registra o que voltou** — ele não diz o que deveria voltar.
- **Não controla corte feito DENTRO da GMP.** A transformação vive dentro de uma remessa a terceiro.
  Corte interno continua sem caminho próprio.
- **Não recalcula o custo de nada que entrou antes desta etapa.** O recebimento por NF passa a
  alimentar o custo médio **daqui para frente**; **não há backfill possível**, porque o livro de
  movimentações **não guarda custo** — o dado para recalcular o passado simplesmente não existe.
- **Não valida que os pesos fecham.** O rendimento é **informativo**: 300% não é recusado.
- **Não guarda o rendimento.** Ele aparece uma vez, no aviso, e não fica em lugar nenhum. Querer que
  fique é etapa nova (precisa de coluna).
- **Não conserta a divergência entre as telas de patrimônio.** É anterior à etapa e está registrada.
- **Não manda e-mail nem alerta** (features 19 e 20).
- **Não anexa desenho** ao item da remessa.

---

## Etapa 9 — Retalhos, Sobras e Sucatas (ENTREGUE — 2026-08-16)

**Em uma frase:** a meia chapa que sobra do corte vira estoque de verdade — com saldo, etiqueta e
sugestão de uso antes de cortar chapa nova — e sucatear deixa de ser um clique de uma pessoa só:
vira processo com duas assinaturas de pessoas diferentes, destino registrado e número financeiro.

**O problema que existia.** Quando uma chapa era parcialmente usada, o sistema só sabia "1 chapa
saiu" — o pedaço aproveitável não tinha saldo, não tinha etiqueta e não aparecia quando alguém
procurava material. E `Sucata` era um tipo selecionável no formulário de Movimentações: qualquer
pessoa com permissão de movimentar baixava qualquer material do patrimônio com uma justificativa,
sem segunda opinião, sem classificação, sem registro de venda ou descarte.

### Antes → Agora

| Situação | Antes (até a 8c) | Agora (Etapa 9) |
|---|---|---|
| Sobra aproveitável de corte | Não existia para o sistema — comprava-se chapa nova com meia chapa na prateleira | Tela **Sobras e Retalhos**: o retalho tem **saldo real** (é um material do catálogo) mais a ficha dimensional (dimensões restantes, norma, peso, localização, responsável) |
| Registrar o retalho | — | Botão **Gerar retalho**, com **dois modos**: a peça está saindo do estoque **agora** (baixa o original e credita o retalho no mesmo evento) ou a peça **já tinha saído** antes (só credita o retalho) |
| **Sucatear** | **Tipo "Sucata" no formulário de Movimentações — um clique de uma pessoa** | **O tipo SUMIU do formulário.** Sucatear é solicitação + **duas assinaturas de pessoas diferentes** (almoxarifado e gestão) na tela Sobras e Retalhos; a baixa só sai na segunda assinatura |
| Quem aprova a própria solicitação | — | **Ninguém.** Quem pediu não assina nenhuma das duas pernas, e a mesma pessoa não assina as duas — nem o Administrador |
| Destino da sucata | Não existia registro | **Vendida** (valor obrigatório + comprovante PDF/imagem) ou **Descartada** — com relatório financeiro somando o estimado e o realmente vendido |
| Etiqueta do retalho | Pendência declarada desde a Etapa 6c | Etiqueta em PDF (A4 ou térmica) com dimensões/peso e **QR que abre a tela com a linha destacada** — oferecida automaticamente ao gerar o retalho |
| Saída de material que tem retalho parado | Nada avisava | Aviso **não bloqueante** no formulário de Saída: *"Existem N retalho(s) deste material — considere usá-los antes de baixar do estoque principal."* com link **Ver retalhos** |
| Custo do retalho | — | **Zero, sempre** — o projeto já pagou a chapa inteira na saída; o retalho entra sem custo e não infla o patrimônio |
| Retalho de chapa de cliente | — | **Continua do cliente**: o sistema recusa gerar retalho para um material de dono diferente do original, nomeando os dois donos |

### As regras, com o cenário exato

As mensagens abaixo são as **mensagens reais do sistema**, copiadas do código.

**1. Gerar retalho com baixa move as duas pontas no mesmo evento.**
*Cenário:* chapa com 30 UN, gerar retalho marcando **"Baixar o material de origem agora"**,
quantidade baixada 1, retalho 1. Ao confirmar:
> `Retalho gerado — o material de origem foi baixado`

Em **Materiais**: a chapa cai 1, o material-retalho sobe 1; no **Extrato** dos dois aparecem a
SAÍDA e a **Entrada (retalho)**. Se qualquer perna falhar no meio, o que já andou é desfeito —
nunca fica saída sem retalho nem retalho sem registro.

**2. O modo sem baixa é para a sobra que volta do chão de fábrica.**
*Cenário:* deixar o checkbox **desmarcado** (a peça já saiu por requisição há dias). Ao confirmar:
> `Retalho gerado — nada foi baixado (a peça já tinha saído do estoque)`

Só o retalho é creditado — inventar uma baixa aqui tiraria do saldo material que já não está lá.

**3. O material do retalho tem de existir — e a tela ajuda a criar.**
*Cenário:* informar um material de retalho inexistente pela API:
> `O material do retalho 999 nao existe. Cadastre o material do retalho primeiro (Almoxarifado > Materiais > Novo, ou o atalho "Criar material do retalho" na tela de Sobras e Retalhos) e refaca a geracao — o sistema nao cria material sozinho a partir de um formulario de retalho.`

O atalho **Criar material do retalho** cadastra na hora, com código gerado pela família da origem
e **dono e categoria herdados** — o aviso do formulário diz isso com todas as letras.

**4. Retalho de material de cliente permanece do cliente.**
O material-retalho tem de ter o **mesmo dono** do material de origem — a recusa nomeia os dois
donos (mesma família da guarda da transformação da 8c). Sem isso, um corte converteria chapa do
cliente em patrimônio da GMP em silêncio.

**5. Material com número de série não gera retalho com baixa — e a recusa ensina o caminho.**
> `O material CHP-01 tem controle de serie e a geracao de retalho nao tem campo para dizer QUAL numero de serie esta sendo cortado. Baixe a peca pela tela de Movimentacoes (que tem seletor de serie) e depois registre o retalho aqui no modo "peca ja baixada do estoque".`

**6. A origem com controle de lote exige o lote.**
> `O material CHP-01 controla lote: informe o lote de origem (lote_origem_id) para gerar retalho com baixa — o retalho herda a rastreabilidade do lote da chapa, e a propria saida exige o lote de qualquer forma.`

**7. Solicitar sucateamento não move saldo nenhum.** O próprio modal diz: *"A solicitação não move
saldo nenhum — a baixa só sai do estoque quando as DUAS assinaturas (almoxarifado e gestão)
fecharem o processo."* Ao solicitar:
> `Sucateamento solicitado — aguardando as duas assinaturas (almoxarifado e gestão)`

A justificativa é obrigatória já na solicitação. Na tela, o aviso é
`Justificativa é obrigatória para sucatear: a baixa SUCATA exige o motivo escrito.`; quem tentar
por fora da tela recebe a versão completa do servidor:
> `Justificativa e obrigatoria para sucatear: a baixa SUCATA exige o motivo escrito, e ele fica no livro de movimentacoes como a unica explicacao de por que o material sumiu do patrimonio.`

**8. Quem solicitou não aprova — em nenhuma das duas pernas.**
> `Quem solicitou o sucateamento nao aprova a propria solicitacao — em nenhuma das duas pernas. Peca a assinatura de outra pessoa do almoxarifado e da gestao.`

(A tela nem mostra os botões de aprovar para o solicitante — mas o servidor barra de qualquer
jeito, mesmo por chamada direta.)

**9. A mesma pessoa não assina as duas pernas — nem o Administrador.**
*Cenário:* o mesmo usuário assina a perna do almoxarifado e tenta assinar a da gestão:
> `Voce ja assinou a perna almoxarifado deste sucateamento e nao pode assinar tambem a perna gestao: dupla aprovacao com a mesma pessoa nas duas pernas e uma assinatura com dois carimbos. A segunda assinatura tem de ser de outra pessoa.`

Esta regra vale **até sob cliques simultâneos** — foi provada por um teste de corrida
determinístico que vive na suíte (as duas pernas disparadas ao mesmo tempo pelo mesmo usuário;
nenhuma fecha). Durante a correção, uma sonda de 500 execuções concorrentes confirmou zero furos —
mas a sonda foi ferramenta de diagnóstico; o que fica no repositório é o teste determinístico.

**10. A baixa acontece na segunda assinatura — e o toast diz qual das duas foi a sua.**
Primeira perna: `Perna assinada — falta a assinatura da outra perna para a baixa sair`.
Segunda perna: `Sucateamento aprovado nas duas pernas — a baixa foi emitida no estoque` — e neste
momento o total e o disponível do material **caem**, com a movimentação `SUCATA` no livro.

**11. Se o saldo mudou entre a solicitação e a segunda assinatura, a aprovação volta atrás.**
O motor recusa a baixa (com a mensagem de saldo insuficiente, com os números) e o sistema
**desfaz a assinatura recém-dada**: o processo volta a SOLICITADO, com a compensação registrada na
auditoria. Nunca fica "aprovado no papel" sem baixa no livro.

**12. Rejeitar exige motivo; cancelar é só do solicitante.**
> `So o solicitante (Fulano) cancela o proprio sucateamento. Para recusar a solicitacao de outra pessoa use Rejeitar, que exige motivo e fica no historico.`

**13. Vender exige valor.**
> `Informe o valor da venda da sucata (valor_venda maior que zero) — o destino VENDIDA alimenta o relatorio financeiro de sucata, e venda sem valor nao e venda.`

**14. Quem pode o quê.** Solicitar exige **movimentar** (ADMINISTRADOR, ALMOXARIFE). Aprovar a
perna do almoxarifado: ADMINISTRADOR e ALMOXARIFE. Aprovar a perna da gestão: ADMINISTRADOR e
GESTOR. Rejeitar e registrar destino: quem aprova **qualquer** uma das duas pernas.

### Roteiro de teste manual (Etapa 9)

Prepare: um material "chapa" com saldo (ex.: 30 UN) e **dois usuários com perfis diferentes** —
um ALMOXARIFE e um GESTOR (ou um ADMINISTRADOR e um ALMOXARIFE). O teste da dupla aprovação
não funciona com um usuário só — **essa é a regra sendo testada**.

**Parte 1 — Retalho nos dois modos:**
1. **Almoxarifado → Sobras e Retalhos** (item novo do menu) → **Gerar retalho**.
2. Material de origem = a chapa. Clicar **Criar material do retalho**, nome "Retalho chapa 1200x800",
   **Cadastrar e usar** — conferir o toast `Material <código> criado — já selecionado como retalho`.
3. Marcar **"Baixar o material de origem agora"**, quantidade baixada **1**, preencher dimensões
   restantes (ex.: `1200x800`), espessura, peso. **Gerar retalho.**
4. Conferir o toast do modo com baixa e o **modal de etiqueta abrindo sozinho** — gerar o PDF e
   conferir: código do retalho, dimensões `1200x800x<esp>mm · ~<peso>kg` e o QR. Escanear (ou abrir
   a URL do QR): a tela abre com **a linha do retalho destacada**.
5. Em **Materiais**: chapa caiu 1, retalho subiu 1. No **Extrato** do retalho: **Entrada (retalho)**.
6. Gerar um segundo retalho **sem marcar** o checkbox (modo "a peça já tinha saído") — conferir o
   toast do modo sem baixa e que a chapa **não** caiu de novo.
7. **Movimentações → Nova movimentação → Saída** da chapa: conferir o aviso **"Existem N retalho(s)
   deste material — considere usá-los..."** com o link **Ver retalhos**.
8. Conferir no formulário de Movimentações que **o tipo Sucata não existe mais** na lista.

**Parte 2 — Sucateamento com dois usuários:**
9. Na aba **Sucateamentos** → **Solicitar sucateamento** (ou o botão **Sucatear** na linha do
   retalho, que já preenche o material): quantidade, classificação (as sugestões aparecem ao
   digitar: aço carbono, inox, alumínio, cobre, cavaco, misto), justificativa. Confirmar e conferir
   o toast de "aguardando as duas assinaturas".
10. Conferir que **para o solicitante os botões Aprovar não aparecem** na linha.
11. Com o **usuário 2** (perfil ALMOXARIFE): **Aprovar almoxarifado** → toast "Perna assinada —
    falta a assinatura da outra perna". Conferir em **Materiais** que o saldo **não mudou**.
12. Ainda com o usuário 2, conferir que **Aprovar gestão não aparece** para ele (já assinou a outra
    perna). Se forçar pela API, a recusa é a mensagem da regra 9.
13. Com o **usuário 3** (perfil GESTOR ou ADMINISTRADOR distinto): **Aprovar gestão** → toast
    "aprovado nas duas pernas — a baixa foi emitida". Conferir em **Materiais** que o saldo
    **caiu**, e no livro de **Movimentações** a linha `SUCATA` com referência `SUC-<id>`.
14. **Registrar destino** → **Vendida** sem valor → recusa. Com valor (ex.: 150) e um PDF de
    comprovante anexado → status vira **Vendida**.
15. Criar uma segunda solicitação e **Rejeitar** com o outro usuário (motivo obrigatório); criar
    uma terceira e **Cancelar** com o próprio solicitante (confirmação, sem motivo).

### O que a Etapa 9 **não** cobre (é decisão declarada, não esquecimento)

- **O sistema não calcula quanto sobrou.** As dimensões do retalho são **digitadas** — não há
  aritmética dimensional (3000−1200=1800 não é feito). Automatizar exigiria modelagem dimensional
  por material que o catálogo não tem; se a GMP quiser, é etapa própria.
- **Ninguém recebe e-mail de sucateamento** — o acompanhamento é pela tela (e-mails são a
  feature 19, como nas etapas anteriores).
- **Vender sucata registra valor e comprovante — não vira fatura nem título financeiro.**
- **O relatório financeiro de sucata é só API** (`sucata-financeiro`) — não há tela de relatórios,
  que continua sendo pendência antiga do módulo. A valoração usa o **custo atual** do material
  (o livro não guarda custo histórico — mesma limitação declarada da 8c).
- **Não há foto do retalho.** O campo existe no banco, mas a tela não oferece upload — pendência
  registrada na spec.
- **Não há reserva de retalho** (mesma pendência da reserva por lote/série).
- **Ferramentas e calibração ficam para a Etapa 9b.**
- **Peça com número de série não passa pelo sucateamento** — a recusa ensina: baixe pela tela de
  Movimentações, que tem seletor de série.

---

## Etapa 9b — Ferramentas e Calibração (ENTREGUE — 2026-08-22)

**Em uma frase:** ferramentas (furadeira, paquímetro, torquímetro...) ganharam controle de
verdade — empréstimo com recusa automática por status ou calibração vencida, avaria/perda com
foto, bloqueio, manutenção e histórico de calibração com painel de vencimento — numa tela própria.

**O problema que existia.** O empréstimo de ferramenta funcionava, mas sem nenhuma trava real:
duas pessoas podiam emprestar a mesma ferramenta ao mesmo tempo (o sistema só checava o status
*antes* de gravar, não durante), emprestar e devolver não deixavam rastro na auditoria, e a
permissão usada era a de mexer em estoque — a mesma que qualquer almoxarife usa para lançar
movimentação de material. Calibração, manutenção, avaria, perda e bloqueio **não existiam** —
nem como campo no banco.

### Antes → Agora

| Situação | Antes | Agora (Etapa 9b) |
|---|---|---|
| Emprestar ferramenta já emprestada | Podia acontecer em cliques simultâneos (checagem antes de gravar, não durante) | **Impossível mesmo em corrida** — a gravação só aceita se o status ainda for o esperado no instante exato |
| Ferramenta que exige calibração | Emprestava do mesmo jeito, vencida ou não | **Bloqueada até ter calibração vigente registrada** — mensagem explica o motivo |
| Avaria ou perda durante o empréstimo | Não existia registro | Tela **Ocorrência**: avaria ou perda, com foto e responsável — **fecha o empréstimo em aberto sozinha**, sem passo manual de devolução |
| Ferramenta com defeito | Não existia bloqueio nem manutenção | **Bloquear** (com justificativa) tira de circulação; **Manutenção** registra início/fim; ferramenta avariada entra em manutenção e sai disponível ao concluir |
| Ferramenta perdida encontrada de volta | Não existia | **Reencontrar**, com justificativa — volta a disponível |
| Calibração | Não existia campo nenhum | Histórico de calibrações com certificado anexo + **painel de vencimento** (vencidas e a vencer) |
| Quem pode mexer em ferramentas | Mesma permissão de mexer em estoque (movimentar) | Permissão **própria** — dá para autorizar ferramenta sem autorizar estoque, e vice-versa |
| Tela | Não existia | **Almoxarifado → Ferramentas**, com três abas: Ferramentas, Empréstimos, Calibrações |

### As regras, com o cenário exato

As mensagens abaixo são as **mensagens reais do sistema**, conferidas no código.

**1. Ferramenta ocupada, bloqueada, em manutenção, avariada ou perdida não empresta.**
*Cenário:* clicar **Emprestar** numa ferramenta que já está com outra pessoa (ou bloqueada, em
manutenção, avariada ou perdida). O sistema recusa:
> `Ferramenta não está disponível (status atual: EMPRESTADA)`

(o status entre parênteses muda conforme o caso real). Isso vale **mesmo em cliques
simultâneos** — se duas pessoas tentarem emprestar a mesma ferramenta ao mesmo tempo, exatamente
uma consegue.

**2. Ferramenta que exige calibração não empresta sem calibração vigente.**
*Cenário:* uma ferramenta marcada "exige calibração" nunca teve calibração registrada, ou a
última calibração já venceu. Ao clicar **Emprestar**:
> `Ferramenta com calibração vencida ou sem calibração registrada`

Registrar uma calibração com validade futura (aba **Calibrações** → **Calibração** na linha da
ferramenta) resolve na hora — a próxima tentativa de empréstimo passa.

**3. Devolver libera a ferramenta para um novo empréstimo.**
*Cenário:* **Devolver** um empréstimo ativo. O toast confirma `Ferramenta devolvida`, e a
ferramenta volta a aparecer disponível para emprestar de novo.

**4. Avaria ou perda durante o empréstimo fecha o empréstimo sozinha.**
*Cenário:* com a ferramenta emprestada, clicar **Ocorrência** → tipo **Perda** (ou **Avaria**),
descrição, e opcionalmente foto e responsável. Ao confirmar (`Perda registrada`/`Avaria
registrada`): o empréstimo em aberto fecha automaticamente e a ferramenta muda para o status da
ocorrência — **não é preciso devolver antes**, porque perda não tem como ser devolvida.

**5. Bloquear e desbloquear exigem justificativa.**
*Cenário:* **Bloquear** sem preencher o motivo (menos de 5 caracteres):
> `Justificativa deve ter pelo menos 5 caracteres`

Só ferramenta **disponível** bloqueia:
> `Ferramenta não pode ser bloqueada (status atual: <STATUS>)`

**6. Ferramenta emprestada não entra em manutenção — devolva primeiro.**
*Cenário:* **Iniciar manutenção** numa ferramenta emprestada:
> `Ferramenta não pode entrar em manutenção (status atual: EMPRESTADA)`

Ferramenta **disponível** ou **avariada** (o caminho de conserto) entram normalmente; ao
**Concluir manutenção**, a ferramenta volta a disponível.

**7. Ferramenta perdida só reencontra com justificativa — e só se estiver perdida.**
*Cenário:* **Reencontrar** numa ferramenta que não está com status Perdida:
> `Ferramenta não está perdida (status atual: <STATUS>)`

**8. Calibração exige validade posterior à data de calibração.**
*Cenário:* registrar calibração com a data de validade igual ou anterior à data da calibração:
> `Data de validade deve ser posterior à data de calibração`

**9. Código de patrimônio duplicado não cadastra.**
*Cenário:* cadastrar uma ferramenta nova com um código de patrimônio que já existe:
> `Código de patrimônio já cadastrado`

**10. Quem pode o quê.** Toda ação de escrita (cadastrar, emprestar, devolver, bloquear,
manutenção, ocorrência, calibração, reencontrar) exige a permissão **Ferramentas** —
Administrador ou Almoxarife. Ver a ferramenta e o histórico (leitura) é livre para qualquer
usuário autenticado.

### Roteiro de teste manual (Etapa 9b)

Prepare: uma ferramenta que **não** exige calibração e outra que **exige** — ou marque a opção
"Exige calibração" no cadastro para criar a segunda.

1. **Almoxarifado → Ferramentas** (item novo do menu, ícone de chave de fenda).
2. **Nova ferramenta** → preencher código de patrimônio e nome → **Cadastrar**. Conferir o toast
   `Ferramenta cadastrada` e a linha nova na tabela, status **Disponível**.
3. Repetir o código de patrimônio numa segunda ferramenta → conferir a recusa
   `Código de patrimônio já cadastrado`.
4. Na ferramenta cadastrada, clicar **Emprestar**, preencher o nome do colaborador →
   confirmar. Conferir `Ferramenta emprestada` e o status virando **Emprestada**.
5. Tentar **Emprestar** de novo a mesma ferramenta → conferir a recusa `Ferramenta não está
   disponível (status atual: EMPRESTADA)`.
6. Aba **Empréstimos** → conferir o empréstimo ativo com o nome do colaborador. **Devolver** →
   conferir `Ferramenta devolvida` e o empréstimo saindo da lista de ativos.
7. Cadastrar uma ferramenta marcando **"Exige calibração"**. Tentar **Emprestar** → conferir a
   recusa `Ferramenta com calibração vencida ou sem calibração registrada`.
8. Na mesma ferramenta, **Calibração** → preencher data de calibração (hoje) e validade (uma data
   futura) → confirmar `Calibração registrada`. **Emprestar** de novo → agora deve funcionar.
9. Aba **Calibrações** → conferir o painel; registrar uma calibração com validade **já vencida**
   numa terceira ferramenta e conferir que ela aparece na lista de **vencidas**.
10. Com uma ferramenta emprestada, **Ocorrência** → tipo **Avaria**, descrição, e opcionalmente
    anexar uma foto → confirmar `Avaria registrada`. Conferir: o empréstimo correspondente sumiu
    da lista de ativos (fechou sozinho) e o status da ferramenta virou **Avariada**.
11. Na ferramenta avariada, **Iniciar manutenção** → status vira **Em manutenção**. **Concluir
    manutenção** → status volta a **Disponível**, e a ferramenta volta a emprestar normalmente.
12. **Bloquear** uma ferramenta disponível sem preencher a justificativa → conferir a recusa de
    tamanho mínimo. Preencher a justificativa → confirmar, status vira **Bloqueada**.
    **Desbloquear** → volta a **Disponível**.
13. Logar com um usuário **sem** a permissão Ferramentas (perfil Produção) → conferir que os
    botões de ação não aparecem na tela, e que uma tentativa direta pela API recebe 403.

### O que a Etapa 9b **não** cobre (é decisão declarada, não esquecimento)

- **Lembrete automático de devolução vencida** — a tela já destaca empréstimos vencidos na aba
  Empréstimos, mas **não há e-mail nem alerta automático** ainda; isso depende do motor de
  notificações (etapas futuras).
- **Editar uma ferramenta já cadastrada pela tela** — o cadastro existe; a edição (mudar nome,
  localização, se exige calibração) ainda não tem tela própria. Fica registrado como melhoria
  pendente.
- **Ferramenta usada como instrumento de medição na inspeção de qualidade** não está integrada
  — isso depende da inspeção com plano de medidas, que ainda não existe.
- **Uma foto por ocorrência**, não uma galeria — se precisar de mais de uma foto por avaria,
  registre ocorrências adicionais.

---

## Etapa 10 — Inventário Avançado (ENTREGUE — 2026-08-22)

**Em uma frase:** a conferência de inventário deixou de gravar o saldo por fora do sistema —
agora o ajuste é uma movimentação de verdade, auditada, e recusada quando deixaria material
bloqueado/reservado/em inspeção/em terceiro com número que não fecha. De brinde: contagem cega
e recontagem obrigatória para divergência grande.

**O problema que existia.** Concluir uma conferência com "aplicar ajustes" escrevia o saldo do
material direto no banco, sem nenhuma das verificações que qualquer outra movimentação do módulo
tem — nenhuma checagem de que o material bloqueado, reservado, em inspeção ou em terceiro não
ficaria com número negativo, e nenhum registro de auditoria de verdade.

### Antes → Agora

| Antes | Agora |
|---|---|
| Ajuste que reduz o total abaixo do que está retido (bloqueado/reservado/em inspeção/em terceiro) era aceito em silêncio | **Recusado**, dizendo qual retenção pesa e o mínimo aceitável |
| Ajuste não deixava registro auditável | Movimentação de verdade no livro, com quem homologou |
| Ver quanto o sistema diz que tem, contando | Opcional por conferência ("Contagem cega") |
| Divergência muito grande era aceita sem segunda chance | Exige **recontar** antes de concluir |
| Justificativa do ajuste | Obrigatória ao aplicar ajustes |
| Impacto financeiro do ajuste | Calculado e mostrado no aviso de sucesso |
| Concluir a mesma conferência duas vezes | Recusado — só conclui uma vez |

### As regras, com o cenário exato

**1. Ajuste que deixaria retenção maior que o total é recusado.**
*Cenário:* material com 8 unidades bloqueadas, contagem aponta só 5:
> `Ajuste bloqueado: <código>: Ajuste para 5 UN deixaria o disponível negativo (bloqueada: 8, mínimo aceitável: 8 UN). Resolva a retenção antes de ajustar para menos, ou ajuste para um valor maior ou igual ao mínimo.`

**2. Divergência acima da tolerância exige recontar antes de concluir.**
*Cenário:* divergência de 10%, tolerância configurada em 2%:
> `Recontagem necessária antes de concluir: <código> - 10.00% (limite 2%)`

Contar o mesmo item de novo já libera a conclusão.

**3. Aplicar ajustes exige justificativa.**
> `Justificativa deve ter pelo menos 5 caracteres`

**4. Uma conferência só conclui uma vez.**
> `Conferência não está aberta (status atual: CONCLUIDO)`

### Roteiro de teste manual (Etapa 10)

Prepare: um material com custo cadastrado (para ver o impacto financeiro) e, opcionalmente, um
segundo usuário com perfil Almoxarife (para testar a contagem cega de verdade).

1. **Almoxarifado → Conferências de Estoque** → **Nova Conferência**.
2. Marcar **"Contagem cega"** e preencher **"Tolerância (%)"** com `5` → **Criar Conferência**.
3. Abrir a conferência criada. Se estiver logado como Almoxarife (sem a permissão de ajustar
   estoque), a coluna "Qtd. Sistema" mostra `—`; como Gestor/Administrador, mostra o número.
4. Contar um item com uma divergência **grande** (ex.: sistema mostra 100, contar 50 — 50% de
   divergência, acima do limite de 5%). Tentar **Concluir Conferência** → conferir a recusa
   citando "Recontagem necessária".
5. Contar o **mesmo item de novo** (pode ser o mesmo valor) → a coluna "Recontagem" para de
   mostrar o aviso. **Concluir Conferência** de novo → agora passa da checagem de tolerância.
6. No modal de concluir, marcar **"Aplicar ajustes automáticos"** sem preencher a justificativa
   → botão "Confirmar" fica desabilitado. Preencher com pelo menos 5 caracteres → habilita.
7. **Confirmar** → conferir o aviso de sucesso mostrando "impacto financeiro" em reais.
8. **Almoxarifado → Movimentações** → conferir a linha nova do tipo **"Ajuste (inventário)"**,
   sem botão de estornar.
9. Tentar **Concluir Conferência** de novo na mesma conferência (já concluída) → conferir a
   recusa "Conferência não está aberta".

### O que a Etapa 10 **não** cobre (é decisão declarada, não esquecimento)

- ~~**Só contagem "por categoria"**~~ · ~~**a recontagem aceita a mesma pessoa**~~ ·
  ~~**relatório de acuracidade não existe**~~ — **os três foram entregues na Etapa 10b**
  (seção seguinte). Continuam de fora: endereço, cíclica automática, congelamento de
  movimentação, fluxo formal de duas assinaturas e e-mail — ver a lista da 10b.

---

## Etapa 10b — Inventário Avançado, parte 2 (ENTREGUE — 2026-08-23)

A Etapa 10 consertou o motor do inventário; a 10b o transforma em rotina de gestão: contagem
por **escopo** (só a classe A, só os críticos, só material de cliente, só o que tem parte em
terceiro, uma família), **dupla contagem por duas pessoas** (a recontagem tem de ser de outra
pessoa — e ela conta **sem ver** o número do colega), **autoria por item** (quem contou e quem
recontou, na tela) e o botão **Acuracidade** (por conferência: contados/total, exatos,
divergentes, recontados, % e impacto em reais — gravado no dia da conclusão).

### Antes → Agora

| Antes (Etapa 10) | Agora (Etapa 10b) |
|---|---|
| Conferência de tudo, ou por categoria | Escopo combinável, gravado na conferência (ex.: `Classe A + Somente críticos`) |
| Recontagem podia ser a mesma pessoa | Flag "Dupla contagem": recontagem de **outra pessoa**, sem ver o número do colega |
| Ninguém sabia quem contou | `Contado por: … · Recontado por: …` em cada item |
| Qualquer valor entrava como contagem | Número ≥ 0 obrigatório (zero vale); texto/negativo é recusado na hora |
| Impacto financeiro aparecia e sumia | Impacto gravado na conclusão; concluir sem aplicar também mede o erro |
| Nenhuma visão consolidada | Botão **Acuracidade** com tabela por conferência + agregado ponderado |

### Roteiro de teste manual (10 passos, precisa de DOIS usuários com perfil de inventário)

1. **Login** (Gestor ou Administrador) → **Almoxarifado → Conferência de Estoque → Nova
   Conferência**. Marcar **Classe ABC = A** e **Somente críticos**, marcar **Dupla contagem**
   e **Contagem cega**, tolerância 5. Criar → conferir que só os materiais classe A + críticos
   entraram e que a lista mostra o escopo `Classe A + Somente críticos`.
2. Com o **usuário 1** (almoxarife): abrir a conferência e contar um item com divergência
   grande (ex.: sistema 100, contar 90). Conferir que ele **não vê** o saldo do sistema
   (contagem cega) e que o item mostra `Contado por: <nome dele>`.
3. Ainda com o usuário 1: **corrigir** a própria contagem (digitar 91 no mesmo campo) →
   aceita, e **não** vira recontagem (o badge "Recontagem necessária" continua lá). Corrigir
   de volta para 90.
4. **Tabular** por um campo sem digitar nada → nada acontece (nenhum aviso, nenhuma gravação).
   Tabular não é contar.
5. Digitar **"abc"** ou **-5** numa contagem → recusa na hora:
   `Quantidade contada deve ser um número maior ou igual a zero`.
6. Com o **usuário 2** (outro almoxarife): abrir a mesma conferência → o campo do item contado
   vem **vazio** (ele não vê os 90 do colega). Recontar 90 → aceita, badge de recontagem some,
   item mostra `Recontado por: <nome dele>`.
7. Com o **usuário 1** de novo: tentar mudar o item recontado → recusa:
   `Dupla contagem: a recontagem deve ser feita por outra pessoa (primeira contagem: <nome>)`.
8. Com quem homologa (Gestor/Admin): **Concluir Conferência** SEM marcar "Aplicar ajustes" →
   o aviso diz `... 0 ajustes aplicados — divergências encontradas: R$ ... (nenhum ajuste
   aplicado)`.
9. Na lista, clicar **Acuracidade** → conferir a linha da conferência: contados **/ total**,
   exatos, divergentes, **recontados = 1**, acuracidade % e o impacto em R$; conferências
   antigas mostram `—` no impacto; a linha de agregado embaixo.
10. Criar uma conferência **sem** dupla contagem e repetir a recontagem pela mesma pessoa →
    continua permitido (o comportamento antigo não mudou sem a flag).

### O que a Etapa 10b **não** cobre (é decisão declarada, não esquecimento)

- **Contagem por endereço/prateleira** (e a guarda de retenção para ajuste por localização —
  mesmo corte).
- **Contagem cíclica automática** — contar a classe A todo mês é criar a conferência "Classe A"
  todo mês; agendamento automático não existe.
- **Congelar movimentações durante a contagem** — e por isso: **não conte o escopo "com saldo
  em terceiros" com remessa em andamento** (a divergência falsa aparece na métrica; o saldo em
  si não corre risco).
- **Fluxo formal de duas assinaturas** — aguarda a decisão B11 do doc de novidades.
- **E-mail do resultado** e **tela de conciliação lado a lado das duas contagens**.

---

## Etapa 11 — Reposição e Compras (ENTREGUE — 2026-08-24)

O módulo sabia avisar que um material cruzou o mínimo; agora responde às perguntas de compra:
**quanto** pedir, **quando** (antes de faltar, considerando o prazo do fornecedor), **de quem**
(consolidado por fornecedor, com valor) e **o que está parado** ocupando prateleira e dinheiro.
Tela nova: **Almoxarifado → Reposição e Compras** — para Gestor, Compras e Administrador
(Almoxarife não decide compra, de propósito).

### Antes → Agora

| Antes | Agora |
|---|---|
| Alerta de mínimo avisava, e só | Sugestão calculada: quanto pedir, valendo quanto, de qual fornecedor |
| "Quando pedir" era olhômetro | Ponto de reposição (cadastrado, ou consumo médio × prazo) com a **mínima como chão** |
| Pedido aberto era invisível | Solicitação aberta entra na conta — material pedido some da sugestão |
| Excesso/obsoleto não existiam | Aba Estoque Parado com valor parado em reais |
| Configuração de reposição não existia | 3 campos em Configurações Gerais, com valor inválido **recusado** |

### Roteiro de teste manual (10 passos)

1. **Login** (Gestor ou Administrador) → **Almoxarifado → Reposição e Compras**. A aba
   **Sugestões de Compra** abre com a legenda "Consumo médio calculado sobre os últimos 90
   dias".
2. Criar (em Materiais) um material com **mínima 100, máxima 200, custo 10**, saldo 5 →
   voltar à Reposição → ele aparece sugerindo **195** (origem do ponto: "Mínimo"), valor
   estimado **R$ 1.950,00**, no grupo do fornecedor (ou "Sem fornecedor definido").
3. Marcar o material como **crítico** no cadastro → a linha ganha o badge vermelho
   **Risco de parada** quando o disponível é zero — e o contador do resumo continua contando
   **mesmo depois** de gerar a solicitação (papel não segura produção).
4. Clicar **Gerar solicitações** → confirmar o aviso
   `Gerar 1 solicitação(ões) de compra no valor estimado de R$ 1.950,00?` → o painel de
   resultado lista a solicitação criada **com a quantidade real**.
5. Recarregar a aba → o material **sumiu** da sugestão (a solicitação aberta conta na
   posição). Na aba **Solicitações**, a linha está lá como **Pendente**, motivo "Ponto de
   reposição".
6. Desmarcar todos os checkboxes → o botão Gerar fica **desabilitado** (e nada é enviado).
7. Aba **Estoque Parado**: material com saldo acima da máxima ganha o selo **Excesso**;
   material sem saída há mais de 180 dias, **Sem consumo**; sem saída E sem entrada,
   **Obsoleto** — os cartões do topo são do estoque **inteiro** (a legenda diz), o filtro
   muda só a lista.
8. **Configurações → Configurações Gerais**: os três campos novos (janela do consumo, dias
   sem consumo, horizonte da solicitação). Digitar **0** em qualquer um → a tela recusa
   antes de salvar com a mensagem
   `Configuração "<chave>" deve ser um número de dias maior que zero`.
9. Logar com um usuário **Almoxarife** → o menu mostra a tela, mas cada aba exibe o
   **painel de sem permissão** (com o motivo e botão "Tentar novamente") — nunca uma lista
   vazia fingindo que não há nada a comprar.
10. (API) Vincular a solicitação a um pedido pela rota de vincular → ela vira **Vinculada**
    na aba Solicitações e o material **continua fora** da sugestão.

### O que a Etapa 11 **não** cobre (é decisão declarada, não esquecimento)

- **Fechar ou cancelar solicitação** — não existe caminho no sistema (só vincular); depois de
  60 dias (configurável) a solicitação velha deixa de segurar a sugestão e a linha avisa
  "solicitação antiga aberta". O fechamento de verdade vem com a integração Compras.
- **Criar pedido de compra real / itens por material no Compras** — features 22/24.
- **Alerta ativo de máximo na entrada** (o excesso é identificado na aba, sem alerta).
- **E-mail de sugestão/solicitação** — ~~feature 19~~ **entregue na Etapa 12**: gerar
  solicitações agora enfileira um e-mail-resumo por lote (ver a seção da Etapa 12).

---

## Etapa 12 — Notificações Completas (ENTREGUE — 2026-08-24)

O módulo ganhou uma central de avisos por e-mail: uma fila que recebe tudo que merece aviso,
um robô que envia e re-tenta sozinho, e a tela **Almoxarifado → Notificações** para ver o que
saiu, o que falhou e por quê. O e-mail de movimentação existe mas **nasce desligado** —
ligá-lo é decisão de negócio (item B15 do documento de novidades).

### Roteiro de teste manual

**Preparo:** entre como administrador do módulo. Em **Almoxarifado → Configurações**, confira
que existem os campos novos: `Notificar movimentações por e-mail` (0), os destinos por família
(entradas/saídas/ajustes/terceiros/compras, vazios) e os números do robô (intervalo 5,
tentativas 5, janela do lote 30).

1. **Painel vazio e permissão.** Menu **Notificações** (ícone de carta). Como Gestor/Admin a
   tela abre com três cards (Pendentes/Enviadas/Falhas). Entre como um usuário Almoxarife e
   abra a mesma tela: painel de **sem permissão** com botão "Tentar novamente" — nunca uma
   lista vazia.
2. **Ligar o e-mail de movimentação.** Em Configurações, mude `Notificar movimentações por
   e-mail` para 1 e preencha `Destinos de entradas` com um e-mail seu. Salve. (Digitar
   qualquer outra coisa no 0/1 é recusado.)
3. **Movimentar e ver a fila.** Faça uma **entrada manual** de qualquer material
   (Movimentações → Nova). Volte em Notificações: uma linha PENDENTE, evento MOVIMENTACAO,
   com o assunto `[Almoxarifado] ENTRADA_MANUAL — <código>`. Clique em **Processar fila
   agora**: sem servidor de e-mail configurado, a linha continua PENDENTE com tentativa 1 e o
   motivo literal `SMTP não configurado` — e o aviso do botão diz
   `1 processada(s): 0 enviada(s), 1 reagendada(s), 0 falha(s)`.
4. **Movimentação recusada não avisa.** Tente uma saída maior que o disponível: erro na tela,
   e a fila **não cresce**.
5. **Estorno mata o aviso.** Faça uma saída (com a config ligada), veja a linha PENDENTE,
   e **estorne** a movimentação no livro. A linha vira FALHA com
   `Movimentação cancelada antes do envio`; o botão Reenviar dela responde
   `Movimentação cancelada — notificação não pode ser reenviada`.
6. **Reenviar com proteção.** Numa linha FALHA qualquer, Reenviar processa na hora (falha de
   novo sem SMTP — tentativa nova registrada). Numa linha ENVIADA (se houver), o botão
   pergunta antes: `Esta notificação já foi enviada. Reenviar mesmo assim envia o e-mail de
   novo aos mesmos destinatários.`
7. **Estoque zerado.** Pegue um material **sem mínimo cadastrado** com saldo, e faça uma saída
   que zere. Na fila aparece `[Almoxarifado] Estoque zerado — <código>`. Zere de novo depois
   de repor (aguarde ~1 min): segundo aviso. Material **com** mínimo não gera esse aviso — o
   alerta de mínimo já cobre.
8. **Desligar tudo.** Volte `Notificar movimentações por e-mail` para 0 e movimente: a fila
   não cresce. Desmarque o checkbox **Notificar por e-mail** da aba Alertas de Estoque: os
   avisos que usariam aquela lista (zerado, lote, remessa, ferramenta) param de entrar na
   fila; os que têm destino de família preenchido continuam.

### O que esta etapa NÃO cobre

- Conclusão de conferência de inventário **não** manda e-mail por item (seriam dezenas num
  clique — o canal da conferência é a tela/relatório, feature 21).
- Reserva, remessa e retorno de terceiro não geram e-mail de movimentação (a remessa tem o
  alerta próprio de vencida).
- Sem PDF, digest, templates ou WhatsApp na fila; sem e-mail de correção retroativa; sem botão
  de descartar linha pendente.

---

## Etapa 13 — Relatórios e Indicadores (ENTREGUE — 2026-08-24)

O módulo tinha 17 relatórios prontos no servidor e nenhuma tela; agora existe
**Almoxarifado → Relatórios**, e cada perfil vê só a sua lista.

### Roteiro de teste manual

1. **Menu por perfil.** Entre como Gestor/Admin → menu **Relatórios** (ícone de gráfico): 18
   itens agrupados (Estoque, Movimentações, Gestão, Terceiros e clientes). Entre como
   Almoxarife: 17 (tem Divergências de Inventário, não tem Solicitações de Compra). Como um
   usuário de produção: 16.
2. **Consultar e exportar.** Abra **Estoque atual** → Consultar → tabela com rótulos de
   negócio (Código, Nome, Categoria...). Clique **Exportar XLSX**: baixa
   `estoque-atual-<data>.xlsx` com exatamente essas colunas. Abra **Sucata — financeiro**: o
   botão Exportar **não aparece** (relatório não-tabular).
3. **Teto avisado.** Em **Histórico de movimentações**, se houver 500+ movimentos o rodapé
   avisa "mostrando os primeiros 500".
4. **Indicadores.** Abra **Indicadores gerenciais**: blocos de giro, cobertura, rupturas,
   valor por grupo e atendimento, com a régua escrita no rodapé. Digite janela `0`:
   `Parâmetro "janela_dias" deve ser um número inteiro maior que zero`.
5. **Rodapé que evita briga de números.** Abra **Materiais mais consumidos** e leia o rodapé:
   ele conta só saídas diretas; o giro conta tudo que debita patrimônio (sucata/perda). Os
   dois números podem diferir no mesmo material — é régua declarada, não erro.
6. **Painel inicial.** No Dashboard do almoxarifado: 3 cartões novos (giro com "consumo ÷
   estoque atual (aproximação)" na legenda, rupturas com a janela, atendimento com
   "Considera todo o histórico"). Se os indicadores falharem, só os 3 cartões mostram erro
   com Tentar novamente — o resto do painel fica de pé.

### O que esta etapa NÃO cobre

PDF (imprima pelo navegador); unificação das réguas antigas de consumo (letra B); giro com
estoque médio histórico (não há snapshot); tetos configuráveis; auditoria de exportação.

---

## Etapa 14 — Integrações: o ciclo da compra fecha (ENTREGUE — 2026-08-25)

A solicitação de compra nascia e nunca morria: não dava para cancelar, e quando o material
chegava ela continuava "a caminho". Agora a **nota fiscal do pedido vinculado fecha a
solicitação sozinha**, cancelar existe (com justificativa gravada), quem compra tem um painel
de contexto por material, e nasceu o relatório **Custo por projeto**.

### Roteiro de teste manual

Você vai precisar de um usuário **Gestor, Compras ou Admin** (perfil de reposição) e de um
material próprio com mínimo cadastrado e saldo abaixo do mínimo (o mesmo cenário do roteiro da
Etapa 11 serve).

1. **Ver contexto.** Em **Almoxarifado → Reposição e Compras**, aba de sugestões, clique
   **Ver contexto** numa linha: o painel expande na própria linha com Disponível, Reservado,
   Em terceiros, Consumo médio diário (com a janela em dias), **Último custo de entrada**
   (valor e data — se o material já recebeu nota com valor) e as solicitações abertas do
   material. Clique de novo (**Ocultar contexto**) para fechar.
2. **Cancelar com justificativa.** Gere uma solicitação (botão Gerar, como no roteiro da 11).
   Na aba de solicitações, clique **Cancelar**: aparece
   `Cancelar esta solicitação de compra? A justificativa ficará registrada.` e depois o campo
   `Justificativa do cancelamento:`. Deixe vazio e confirme: **nada acontece** (o servidor nem
   é chamado). Repita com uma justificativa: a solicitação sai da lista de pendentes.
3. **O contexto não mostra número velho.** Abra o **Ver contexto** de um material e, com o
   painel aberto, clique **Gerar** (ou Atualizar): o painel **reconsulta sozinho** — a lista
   de solicitações abertas dele muda na sua frente, sem fechar e reabrir.
4. **Vincular valida o pedido.** Na aba de solicitações, vincule uma solicitação a um número
   de pedido de compra **inexistente**: `Pedido de compra não encontrado`. Com um pedido real
   do módulo Compras, o vínculo grava e a solicitação vira VINCULADO.
5. **A nota fecha a solicitação.** No módulo **Compras**, processe a nota fiscal do pedido
   vinculado (recebimento → dados fiscais → processar). Volte à aba de solicitações do
   almoxarifado: a solicitação **sumiu das pendentes** (virou RECEBIDA — confira no relatório
   Solicitações de Compra, que mostra o status). Vale também para entrega **parcial**: a
   primeira nota fecha.
6. **Cancelada não ressuscita.** Vincule outra solicitação a um pedido, **cancele-a** (com
   justificativa) e só depois processe a nota do pedido: a solicitação **continua CANCELADA**.
   Tentar cancelar de novo:
   `Solicitação já finalizada (RECEBIDA ou CANCELADA) — não pode ser cancelada`.
7. **Custo por projeto.** Em **Almoxarifado → Relatórios → Gestão → Custo por projeto**
   (aparece só para o perfil de reposição): lance uma **Saída** com projeto preenchido e
   depois uma **Devolução** dessa saída — a linha do projeto mostra Consumido, Devolvido e
   Líquido (a devolução herda o projeto sozinha). O rodapé traz a régua completa, incluindo o
   aviso de que o custo é o atual do material, retroativo.
8. **Quem não pode, não vê.** Logue como Almoxarife: o menu de Relatórios **não** lista Custo
   por projeto; forçar a URL responde `Sem permissão para este relatório`. Os botões
   Cancelar/Ver contexto da Reposição também não aparecem (a tela inteira já era gateada).

### O que esta etapa NÃO cobre

Integração com BOM/Engenharia e OP/Produção (**bloqueadas por dependência, medida**: BOM não
existe no sistema; MES existe sem uso); fechamento por quantidade conferida (a primeira nota
do pedido fecha, mesmo parcial); cancelar a solicitação não mexe no pedido do módulo Compras;
nenhum e-mail novo (RECEBIDA/CANCELADA aparecem no painel e na auditoria); custo histórico por
movimento no relatório (usa o custo atual, declarado no rodapé).

---

## Etapa 15 — Mobilidade: scanner, assinatura e o celular (ENTREGUE — 2026-08-28)

**O que mudou, em uma frase:** as etiquetas com QR agora têm a volta (a tela **Scanner** lê
pela câmera e abre o item), a entrega de requisição colhe **assinatura do recebedor** na tela,
e o módulo ficou usável no celular (nenhuma coluna de tabela some mais).

### Roteiro de teste manual — Scanner

> **Pré-requisito:** a câmera só funciona em **HTTPS ou localhost**. No celular na rede
> interna via HTTP puro, o scanner cai no estado "Câmera indisponível" — use a colagem
> manual (passo 5) ou teste no desktop com webcam.

1. Antes de tudo, imprima uma etiqueta: **Almoxarifado → Materiais** → linha de qualquer
   material → botão de etiqueta → **Gerar PDF** (A4 ou térmica). O QR dela é o alvo.
2. Menu **Almoxarifado → Scanner** (logo abaixo do Dashboard). A tela pede a câmera:
   `Autorize o uso da câmera para começar a ler.` Autorize; o vídeo aparece com uma moldura
   e o texto `Lendo… centralize o QR na moldura.`
3. Aponte para o QR impresso (pode ser na tela de outro monitor): o aparelho vibra (se
   suportar) e a tela do material abre **já filtrada** naquele item. Repita com etiqueta de
   **lote** e de **série** — abre "Lotes e Séries" na aba certa com a linha destacada.
4. Leia um QR qualquer que não seja do sistema (boleto, cartão): aparece
   `Este QR não é uma etiqueta do almoxarifado — por segurança, o conteúdo é só exibido,
   nunca aberto.`, com o texto lido, e os botões **Copiar** e **Ler outro**. Nada navega.
5. **Sem câmera:** negue a permissão e recarregue — a tela mostra **Câmera indisponível**
   com o campo `Cole aqui o conteúdo do QR (ex.: link da etiqueta)`. Cole o link de uma
   etiqueta (o QR carrega um endereço; dá para copiá-lo do PDF lendo com o celular) e
   confirme que abre a mesma tela. Cole um endereço qualquer e confirme que só exibe.

### Roteiro de teste manual — Assinatura do recebedor

1. Crie e aprove uma requisição, separe, e clique **Entregar** (fluxo normal da Etapa 3).
   Confirme a entrega no modal.
2. Depois do aviso de sucesso, abre **✍ Colher assinatura do recebedor — [número da
   requisição]**: campo `Nome de quem recebeu` + quadro de assinatura. Assine com o mouse
   (ou o dedo, no celular) — o botão **Confirmar assinatura** só habilita depois do traço;
   **Limpar** apaga e desabilita de novo.
3. Confirme **sem nome**: `Informe o nome de quem recebeu o material`. Preencha e confirme:
   `Assinatura do recebedor registrada!` — e no detalhe da requisição aparece a seção de
   assinaturas com nome, data, quem colheu e a miniatura (clique para ampliar).
4. Clique **Pular** numa segunda entrega: nada é gravado e a entrega fica valendo — esse é
   o comportamento certo (a assinatura é opcional por decisão, B26 das novidades).
5. No detalhe de uma requisição **entregue**, use **＋ Assinatura de entrega** para colher
   uma assinatura avulsa (entrega que já aconteceu). Colha duas assinaturas na mesma
   requisição: as duas ficam listadas — assinatura não se apaga nem se edita.
6. **Permissão:** logado como usuário de perfil Produção, o botão **＋ Assinatura de
   entrega** não aparece (e a API recusa com o 403 padrão do módulo).

### Roteiro de teste manual — celular

1. No celular (ou DevTools em 375px), abra **Almoxarifado → Requisições**: a tabela mostra
   TODAS as colunas — deslize para o lado para alcançar **Ações**. Antes, tudo da 4ª coluna
   em diante simplesmente sumia.
2. Abra qualquer modal (ex.: o detalhe de uma requisição): ocupa a tela inteira, com o
   conteúdo rolando por dentro.

### O que a Etapa 15 NÃO cobre

- **Código de barras 1D** (nada no sistema gera 1D), **coletor físico** (hardware não
  confirmado; um coletor USB/Bluetooth emularia teclado e já funcionaria nos campos de
  busca), **app instalável/offline** e **fotografia na saída** — cortes medidos e
  declarados (letra B25/D das novidades).
- **Assinatura obrigatória por tipo de material** — os campos "requer assinatura/termo" do
  cadastro de tipos continuam sem efeito (decisão B26, esperando resposta).

## Etapa 16 — Alertas operacionais: o sistema avisa sozinho (ENTREGUE — 2026-08-28)

**O que mudou, em uma frase:** 7 alertas novos varridos todo dia (e-mail pela fila de
notificações) e a tela **Alertas**, que mostra as condições **ao vivo**.

### Roteiro de teste manual — a central

1. Logado como Administrador (ou Almoxarife/Gestor/Compras), menu **Almoxarifado → Alertas**.
   A tela lista um cartão por alerta (13 no total da central: os 7 novos + os já existentes
   que têm condição consultável), cada um com o total e, quando há janela, o badge de dias.
2. Crie uma condição: em **Ferramentas**, cadastre uma ferramenta que exige calibração e
   registre uma calibração com validade de ontem. Volte em **Alertas** → **Atualizar**: o
   cartão **Calibração vencendo** mostra 1; **Detalhes** expande a linha (ferramenta,
   patrimônio, validade, dias restantes).
3. Resolva a condição (registre calibração nova com validade futura) → **Atualizar** → o
   total volta a 0 **na hora**. O e-mail já enfileirado NÃO some: confira em
   **Notificações** (a central é ao vivo; a fila é o histórico).
4. Repita com uma requisição: crie e aprove uma requisição com data de necessidade de ontem
   → cartão **Requisição atrasada** conta 1; entregue-a por completo → some da central.
5. **Permissão:** logado como usuário de perfil Produção, a tela mostra o painel `Dados
   indisponíveis no momento` — nunca uma central vazia. O item de menu aparece (padrão do
   módulo), mas nada carrega.
6. **Configurações:** em Configurações Gerais, os campos `Alerta de Calibração (dias)`,
   `Alerta de Quarentena Parada (dias)` e `Alerta de Reserva Parada (dias)` recusam 0 antes
   de salvar; por API a recusa é `Configuração "alerta_calibracao_dias" deve ser um número
   de dias maior que zero`.

### O que a Etapa 16 NÃO cobre

- 4 alertas de evento (material reprovado, divergências de recebimento/inventário, sem
  certificado) e 3 com lacuna de dado — nomeados na spec 20.
- Destinatário/canal por alerta (todos usam a lista única dos alertas de estoque) e digest.
- **Atenção operacional (letra C18 das novidades):** o relógio da "quarentena parada" é a
  data do RECEBIMENTO — NF que demorou a ser processada gera o alerta no primeiro dia real
  de quarentena. Leia como "recebimento velho com item retido".

## Etapa 17 — Avisos que nascem no ato (ENTREGUE — 2026-08-28)

**O que mudou, em uma frase:** três atos do dia a dia passam a mandar e-mail na hora
(reprovação de material, quantidade divergente na nota, conferência concluída com
divergência), e os lotes parados sem certificado viram um resumo mensal.

### Roteiro de teste manual

1. **Material reprovado.** Crie um recebimento de material que exige inspeção, processe a
   nota e, em **Inspeções**, reprove 3 de 10. Vá em **Notificações**: existe uma linha
   `[Almoxarifado] Material reprovado — <código>`. Em **Alertas**, o cartão **Material
   reprovado** mostra 1 e o Detalhes traz material, quantidade, encaminhamento, nota e quem
   inspecionou. Aprove tudo em outra inspeção: **nada** é gerado.
2. **Divergência de recebimento.** Num recebimento em conferência, informe na aba fiscal uma
   quantidade menor que a esperada (ex.: 8 de 10) e salve. Em Notificações, aparece
   `[Almoxarifado] Divergência de recebimento — <código>`. Corrija para 10 e salve: o cartão
   **Divergência de recebimento** zera na central. Informe 2 de 10: **avisa de novo**, agora
   com o número novo (é o comportamento certo — errar diferente é fato novo).
3. **Divergência de inventário.** Conclua uma conferência com pequena divergência (dentro da
   tolerância, para não pedir recontagem): sai **um** e-mail
   `[Almoxarifado] Divergência de inventário — <número>` dizendo quantos itens divergiram —
   nunca um e-mail por item, e **sem** valor em reais.
4. **Lotes sem certificado.** Com pelo menos um material marcado como "controla certificado"
   e lote com saldo sem arquivo anexado, rode a varredura (ou espere o job diário): sai **um**
   e-mail `[Almoxarifado] Lotes sem certificado — N lote(s)` com o total e os primeiros. Na
   central, o cartão mostra o total e a lista.
5. **Configuração.** Em Configurações Gerais, `Alerta de Eventos (dias)` controla por quanto
   tempo o fato fica visível na central. Zero é recusado antes de salvar.
6. **O aviso não atrapalha a operação:** mesmo que o e-mail falhe, a inspeção, a nota e a
   conferência são gravadas normalmente — por desenho.

### O que a Etapa 17 NÃO cobre

- Marcar o lote como reprovado automaticamente e dar destino ao material reprovado
  (pendências antigas da feature 09).
- As marcações de divergência da inspeção (dimensional, dano físico) não geram alerta
  próprio — o alerta olha a quantidade.
- Os 3 alertas que faltam da lista original seguem sem dado nas features donas.
- **Atenção operacional (letra C20 das novidades):** mexer num recebimento antigo com
  divergência que nunca foi comunicada gera aviso agora — é a rede de segurança, não erro.

## Etapa 18 — A trilha do inventário (ENTREGUE — 2026-08-28)

**O que mudou, em uma frase:** os cinco atos de uma conferência de estoque passam a deixar
registro com autor e de/para, e cancelar exige justificativa escrita.

### Roteiro de teste manual

1. **Cancelar agora pede motivo.** Em **Conferências de Estoque**, abra uma conferência nova e
   clique no botão de cancelar: o modal pede "Motivo do cancelamento" e o botão de confirmar
   fica **travado** até 5 caracteres. Digite "Aberta por engano" e confirme.
2. **O motivo fica à vista.** Na lista, a linha CANCELADA mostra o motivo logo abaixo do
   status; passe o mouse por cima e aparece quem cancelou e quando. A coluna de encerramento
   mostra a data do cancelamento (antes ficava vazia para sempre).
3. **Só cancela o que está em andamento.** Tente cancelar uma conferência já concluída: a
   recusa é `Conferência não está aberta (status atual: CONCLUIDO)`.
4. **A trilha existe** (~~mas ainda não tem tela — letra B33~~ — **a tela chegou na Etapa 22:
   Almoxarifado → Auditoria. Hoje o caminho de clique é filtrar lá por entidade "Conferência".
   O passo por API abaixo continua válido e é o que esta etapa entregou**): quem tiver perfil de
   Administrador pode conferir por API em
   `/api/almoxarifado/auditoria?entidade=conferencia&entidade_id=<id>` — a resposta traz
   `total`, `truncado` e a lista `itens` com CRIACAO, cada CONTAGEM, as RECONTAGENS e a
   CONCLUSAO, cada uma com o autor. Numa correção de contagem, o registro guarda o **valor
   anterior e quem o havia gravado** — a única memória desse número.
5. **Homologação registrada.** Conclua uma conferência **aplicando ajuste**: a conferência
   passa a guardar quem homologou. Conclua outra sem nenhuma divergência: nenhum homologador
   é inventado.
6. **Os três atos vizinhos:** desative um material, cancele uma requisição e exclua outra —
   os três passam a gerar registro de auditoria com o de/para.

### O que a Etapa 18 NÃO cobre

- ~~**Não há tela de auditoria** — a trilha é gravada e consultável só por API, com perfil de
  Administrador (letra B33: você decide se abre para o Gestor ou se vale construir a tela).~~
  **A tela foi construída na Etapa 22** (`8c6ffbe..169458d`) — ver a seção dela no fim deste
  guia. **Continua sua a outra metade da B33:** o acesso segue restrito ao Administrador; abrir
  para o Gestor é decisão de exposição, não pendência técnica.
- **Cadastros e configurações continuam sem trilha** (tipos, localizações, setores, famílias,
  centros de custo, almoxarifados, permissões por setor e as configurações do módulo).
- Conclusões simultâneas da mesma conferência ainda podem se sobrepor — limitação anterior a
  esta etapa.

## Etapa 19 — Cadastros e configurações deixam rastro (ENTREGUE — 2026-08-28)

**O que mudou, em uma frase:** mexer em cadastro, em configuração ou na lista de materiais de
um setor passa a ficar registrado, com o valor de antes e o de depois.

### Roteiro de teste manual

> A etapa **não tem tela nova** e não muda nenhum fluxo visível (exceto o item 4). O roteiro
> abaixo serve para confirmar que nada quebrou — e, para quem tiver acesso técnico, que o
> registro está lá.

1. **Nada quebrou nos cadastros.** Em Configurações do Almoxarifado, crie um tipo de material,
   edite-o e exclua-o. Faça o mesmo com uma localização, um setor e uma família. Tudo deve
   funcionar exatamente como antes.
2. **Configurações continuam salvando.** Em Configurações Gerais, mude um campo e salve
   (aparece o aviso de sucesso). Salve de novo sem mudar nada: também funciona.
3. **Permissões por setor continuam funcionando** (tela de setores de requisição).
4. **A diferença visível:** com duas abas abertas, exclua um tipo de material numa e tente
   excluir o mesmo na outra. A segunda agora mostra `Tipo de material não encontrado` — antes
   dizia que tinha excluído. Depois do erro, atualize a lista.
5. **Para quem tem acesso técnico** (perfil de administrador), o registro está em
   `/api/almoxarifado/auditoria?entidade=configuracao` — a resposta traz `total` e a lista
   `itens`, e cada linha mostra só os campos que mudaram. Repare que a senha de SMTP aparece
   como `(alterado)` e a URL do webhook sem os parâmetros.

### O que a Etapa 19 NÃO cobre

- ~~**Não há tela de auditoria** — o registro só é legível por consulta técnica (é a mesma
  pendência da etapa anterior, letra B33, agora mais cara porque o registro ficou mais rico).~~
  **PAGO na Etapa 22** (`8c6ffbe..169458d`): tudo o que a Etapa 19 passou a registrar é legível
  em **Almoxarifado → Auditoria**, com filtro de entidade "Configuração" e o de/para por campo.
- **Excluir algo já excluído** ainda responde sucesso e registra uma exclusão vazia.
- **Salvar configuração sem mudar nada** não gera registro, mas ainda marca "última alteração"
  no banco.
- A troca de foto de material, o `GET` de configurações que devolve a senha em claro e a
  leitura das permissões por setor seguem fora do escopo — nomeados na spec 23.

## Etapa 20 — O sistema para de mentir sucesso e de falar demais (ENTREGUE — 2026-08-28)

**O que mudou, em uma frase:** a foto de material parou de responder "deu certo" quando não deu
(e passou a deixar registro), e a senha do e-mail, a chave de API e o mapa de permissões por
setor pararam de ser entregues a quem não deveria lê-los.

### Roteiro de teste manual

> **Esta etapa não tem tela nova e não muda nenhum fluxo clicável.** Os passos 1 a 3 confirmam
> que nada quebrou no que você usa; os passos 4 a 6 são para **quem tem acesso técnico** — é lá
> que os três buracos moravam, porque eles só apareciam para quem chama o sistema por fora.

1. **Trocar a foto de um material continua funcionando.** Almoxarifado → Materiais → abra um
   material que **já tem foto** → escolha outra imagem → salve. A ficha passa a mostrar a nova.
   Recarregue a página para confirmar que ela ficou.
2. **Pôr foto num material que ainda não tem também continua funcionando.** Mesmo caminho, num
   material sem foto.
3. **As configurações continuam salvando.** Configurações Gerais: mude um campo e salve.
   Configurações → Alertas de Estoque: grave uma senha de SMTP (o campo continua mostrando
   `********`) e salve. Depois abra Configurações Gerais de novo: **nada some, nada quebra**.
4. **(Técnico) O 404 da foto.** Envie uma imagem para
   `POST /api/almoxarifado/materiais/999999/foto`. A resposta tem de ser **404** com
   `Material não encontrado` — antes era 200 com sucesso. Confirme, no diretório de uploads do
   almoxarifado no servidor, que **nenhum arquivo novo** apareceu.
5. **(Técnico) A máscara e a recusa nas configurações.** Com a senha de SMTP gravada no passo 3:
   - `GET /api/almoxarifado/configuracoes` → `alertas_smtp_pass` e `alertas_whatsapp_api_key`
     têm de vir como `********` (e como **vazio** se você nunca gravou nenhuma);
   - `PUT /api/almoxarifado/configuracoes` com `{"alertas_smtp_pass": "qualquer"}` → **400**
     com `Configuração "alertas_smtp_pass" só pode ser alterada em Configurações → Alertas de
     Estoque`. Mande junto uma chave válida (ex.: `alertas_dias_lote_vencendo`) e confirme, no
     GET seguinte, que **ela também não foi gravada** — a recusa vem antes de tudo;
   - de volta na tela de **Alertas de Estoque**, salve sem mexer na senha: o e-mail continua
     funcionando (a senha **não** foi trocada pela máscara).
6. **(Técnico) O gate do mapa de permissões.** Entre com um usuário de perfil Almoxarife (ou
   Gestor, Compras, Produção, Consulta) e chame
   `GET /api/almoxarifado/setores-requisicao/<id>/permissoes` → **403** com
   `Acesso restrito — administrador do Almoxarifado ou Super Administrador`. Com um
   administrador do Almoxarifado, a mesma chamada responde 200 normalmente — e a aba de setores
   de requisição em Configurações do Almoxarifado continua carregando como sempre.

### O que a Etapa 20 NÃO cobre

- **A URL do webhook de WhatsApp continua saindo em claro** na leitura das configurações — é
  decisão (letra **B40** das novidades), porque é o campo que o administrador edita: mascarar
  faria a tela regravar a máscara como se fosse a URL. A consequência está declarada na letra
  **C24**: quem administra o módulo lê o token que estiver embutido nessa URL.
- **Arquivo de tipo errado ou grande demais em qualquer upload continua respondendo `Erro
  interno do servidor`** sem dizer o motivo (letra **C25 / G7**) — vale para as cinco rotas que
  recebem arquivo, e o conserto tem de ser feito nas cinco de uma vez.
- **A lista de setores de requisição continua dizendo quantos materiais cada setor tem
  liberados** para qualquer usuário do módulo (letra **B41**) — está **em aberto e esperando sua
  decisão**, porque fechar muda o que a tela de requisição recebe.
- **A leitura da alçada de aprovação por valor continua entregando nome e e-mail dos
  aprovadores** a qualquer usuário do módulo (letra **D**).
- **As imagens órfãs que as tentativas antigas deixaram no servidor continuam lá** — nada foi
  apagado retroativamente.

## Etapa 21 — O backup do sistema parava de guardar segredo (ENTREGUE — 2026-08-28)

> **Esta etapa é do NÚCLEO do CRM, não do módulo Almoxarifado.** Está neste guia porque nasceu de
> um item que a Etapa 20 declarou fora do escopo dizendo "é do núcleo" — e separá-la deixaria o
> laço aberto em dois documentos que ninguém cruza.

**O que mudou, em uma frase:** o arquivo de backup parou de levar dentro dele a chave com que o
servidor assina os crachás de login (quem baixasse o backup **entrava como super administrador**),
e a senha do e-mail parou de ser devolvida em texto puro pela tela de Configurações do Sistema.

### Roteiro de teste manual

> Os passos 1 a 4 são **clicáveis** e valem para qualquer administrador; os passos 5 a 8 são para
> **quem tem acesso técnico ao servidor** — é lá que morava o buraco grave, porque o backup é um
> endereço chamado por fora do sistema.

1. **A tela de Configurações continua funcionando.** Menu → **Configurações do Sistema** → aba
   **Email**. Os campos Servidor SMTP, Porta, Usuário e Email Remetente continuam preenchidos e
   editáveis como sempre.
2. **O campo Senha SMTP agora nasce vazio.** Na mesma aba, olhe o campo **Senha SMTP**: ele vem
   **em branco**, e dentro dele aparece o aviso
   `Senha configurada — deixe em branco para manter` (se nunca houve senha gravada, o aviso é
   `Senha do e-mail ou app password`). Antes o campo vinha preenchido com a senha real.
3. **Deixar em branco não faz nada — e é assim que se mantém a senha.** Clique no campo, não
   digite nada, clique fora. **Nenhuma mensagem aparece** e nada é salvo.
4. **Digitar uma senha nova salva uma vez só, ao sair do campo.** Digite qualquer valor e clique
   fora: aparece `Configuração salva com sucesso!`, o campo volta a ficar vazio e o aviso passa a
   ser o de "senha configurada". Antes esta tela salvava **a cada tecla** — digitar uma senha de 8
   caracteres gravava 8 senhas parciais.
   > **Cuidado ao demonstrar:** este passo **troca de verdade** a senha gravada na tabela de
   > configurações. Ela hoje não é usada pelo envio de e-mail (o envio usa o valor do ambiente ou
   > o do código — item **B42** das novidades), então não quebra nada; mas se um dia o banco
   > entrar na precedência, o valor que você digitar aqui passa a valer.
5. **(Técnico) A máscara nas duas leituras.** Com senha gravada:
   - `GET /api/configuracoes` → dentro da categoria `email`, `email_smtp_pass` tem de vir como
     `********` (e **vazio** se nunca foi gravada);
   - `GET /api/configuracoes/email_smtp_pass` → **a mesma** máscara. Mascarar só a primeira
     deixaria a segunda porta destrancada — as duas foram fechadas juntas de propósito.
6. **(Técnico) A recusa da máscara.** `PUT /api/configuracoes/email_smtp_pass` com
   `{"valor": "********"}` ou `{"valor": "********N"}` → **400** com
   `Valor inválido para senha: deixe o campo em branco para manter a senha atual`. Valor vazio
   dá a mesma mensagem. Uma chave **não secreta** (ex.: `email_smtp_host`) continua salvando
   normalmente — é o controle de que a guarda não pegou geral.
7. **(Técnico) O backup nega e registra.** Chame `GET /api/backup` **sem** token → **401**
   `Token de backup inválido ou não configurado`, e no log do servidor aparece
   `[Backup] NEGADO ip=… xff=… motivo=AUSENTE`. Com um token errado do mesmo tamanho, o motivo
   vira `INVALIDO`. O motivo **nunca** aparece na resposta, só no log.
8. **(Técnico) O backup aceita e o zip está limpo.** Chame `GET /api/backup` com o token correto
   e **abra o arquivo baixado**. Confirme, na lista de arquivos do zip:
   - **não existe** `.runtime-secrets.json` (era ele que permitia forjar o crachá de super
     administrador);
   - existe `database.sqlite`, existe a pasta `uploads/` e existem os arquivos de configuração;
   - dentro de `backups/` existe **uma** cópia — a mais recente — e, se houver, os arquivos
     `-wal`/`-shm` dela. **Não** existem as cópias antigas.
   No log: `[Backup] ACEITO ip=… xff=… fallback=database-….sqlite`. Se você chamar com o token na
   URL (`?token=…`), funciona igual — e o log ganha `avisos=QUERY_DEPRECIADA`.

### O que a Etapa 21 NÃO cobre

- **A rotação da senha do SMTP na Locaweb não foi feita — e é a única coisa que nenhum código
  resolve** (letra **A3** das novidades). A senha está no histórico do repositório desde
  **17/03/2026**; trocar o arquivo **não** a apaga de nenhuma cópia já feita. A ordem certa é:
  rotacionar na Locaweb → definir `SMTP_USER`/`SMTP_PASS` no ambiente da VPS → só então o valor
  que ficou no código deixa de abrir qualquer coisa.
- **O backup continua liberado por uma senha fixa**, sem login de usuário e sem tela que liste os
  downloads — o registro é o log do servidor (letra **C26**). A senha na URL continua aceita, com
  aviso (**B43**), e senha curta avisa em vez de recusar (**B44**).
- **Não existe rota para restaurar backup** e **não foi criada** (letra **D**) — restaurar
  continua sendo operação de servidor.
- **O histórico do repositório não foi reescrito** (letra **D**).
- **A aba "Backup" da tela de Configurações do Sistema não faz nada** (letra **D**): os três
  campos são gravados e **nenhuma parte do servidor os lê**. Não confie neles.
- **As configurações de e-mail gravadas no banco continuam sem efeito sobre o envio** (**B42**) —
  o envio usa o ambiente do servidor e, na falta dele, o valor do código.

## Etapa 22 — A trilha de auditoria ganha uma tela (ENTREGUE — 2026-08-28)

> **Esta é a etapa com tela nova.** Ela fecha uma pendência que estava aberta desde a Etapa 18 e
> foi repetida no fechamento da 19, da 20 e da 21: o sistema anotava tudo e **ninguém conseguia
> ler**.

As Etapas 18, 19 e 20 fizeram o sistema registrar quem mexeu em quê — o ciclo do inventário, os
cadastros do módulo, as configurações que mudam regra de negócio, a lista de materiais por setor,
a troca de foto de material. Mais de trinta operações passaram a deixar rastro. **E não havia
onde olhar**: a única forma de ler era pedir a alguém que consultasse o banco por fora do
sistema. Numa auditoria de verdade, um registro que ninguém abre vale quase o mesmo que registro
nenhum.

Agora existe **Almoxarifado → Auditoria**, no menu, ao lado de Configurações — e só aparece para
quem pode configurar o módulo.

### Antes → Agora

| Antes | Agora |
|---|---|
| O histórico existia e **nenhuma tela o mostrava** | Tela **Auditoria**, com filtros e paginação |
| Só dava para filtrar por tipo de coisa e por número do registro | Filtra também por **pessoa**, **ação** e **período**, tudo combinável |
| Uma data escrita errada era aceita e a resposta vinha **vazia** — parecendo prova de que nada aconteceu | **Erro explícito** na tela, nunca "nenhum registro" |
| Um ato das 21h não aparecia no filtro do próprio dia (o sistema grava em UTC) | O período respeita o **horário de Brasília**, inclusivo nos dois extremos |
| O mesmo ato tinha dois nomes conforme a tela que o gravou | Uma opção por ato no filtro, e o nome cru continua visível na linha |
| Ver o que mudou exigia ler o texto técnico com todos os campos | A linha expande numa tabelinha **Campo · De · Para** |
| A consulta cortava em 200 e avisava, sem oferecer saída | O aviso continua, com **Anteriores / Próximos** |
| A tabela do histórico não tinha **nenhum** índice | Três índices (data, tipo + número, pessoa) |

### Roteiro de teste manual

1. **Entre como Administrador do módulo.** No menu do Almoxarifado, o item **Auditoria** aparece
   ao lado de **Configurações**. Clique.
2. **Filtre por você mesmo e por hoje.** Escolha seu nome no seletor de usuário e ponha a data de
   hoje nos dois campos de data. Devem aparecer os atos que você acabou de fazer nesta sessão.
   *(Se você fizer este teste depois das 21h, este é justamente o caso que a etapa consertou: o
   sistema grava a hora em UTC, então às 21:30 o registro está gravado como 00:30 do dia
   seguinte. Sem a conversão, ele não apareceria aqui.)*
3. **Expanda uma linha.** Clique em **Detalhes**. Aparece a tabelinha `Campo · De · Para` com só
   os campos que mudaram. Se aquele ato não guardou nem o antes nem o depois, a mensagem é:
   > *Sem detalhes registrados para este ato — a linha existe, mas não guardou o antes nem o
   > depois.*
4. **Note a legenda do "De" vazio.** Se alguma linha tiver o **De** em branco (—), aparece um
   aviso embaixo da tabelinha explicando que aquilo pode ser um valor que a operação apenas
   registrou junto, e não um campo que mudou. É o caso da troca de foto de material, que grava
   também o código e o nome.
5. **Filtre por "Criação".** No seletor de ação, escolha **Criação**. O resultado traz tanto as
   linhas gravadas como `CRIACAO` quanto as gravadas como `CRIAR` — e cada linha mostra, em letra
   miúda embaixo do rótulo, o nome cru que está gravado. O sistema **não esconde** que o
   vocabulário dele é inconsistente; ele só evita que você perca linhas por causa disso.
6. **Tente uma data que não existe.** Digite `2026-02-30` (30 de fevereiro) em qualquer um dos
   campos de data. A tela mostra o painel vermelho com a mensagem literal:
   > **Data inválida: use uma data real no formato AAAA-MM-DD**

   *(Isto parece exagero e não é: o 30 de fevereiro é **aceito** tanto pelo JavaScript quanto
   pelo banco, que "rolam" a data para 2 de março. Sem a guarda, a busca não daria lista vazia —
   daria uma janela alargada em silêncio, com fevereiro devolvendo três dias de março.)*
7. **Inverta as datas.** Ponha data inicial `2026-08-20` e final `2026-08-01`. As duas existem,
   então a regra anterior não pega. A mensagem literal é:
   > **Período inválido: a data inicial é posterior à data final**

   Antes, isso voltava com sucesso e lista vazia.
8. **Filtre por algo que não existe.** Combine filtros que não trazem nada. A mensagem literal é:
   > **Nenhum registro para os filtros aplicados**

   E **não** "não há registros" — a tela não sabe nada sobre o mundo, só sobre os filtros que
   você pôs. Numa auditoria, a diferença entre as duas frases é a diferença entre uma informação
   e uma afirmação falsa.
9. **Confirme o gate.** Saia e entre com um usuário **sem** perfil de administrador do módulo, e
   vá para `/almoxarifado/auditoria` pela barra de endereços. Aparece o painel de falta de
   permissão — não uma tela vazia, que seria indistinguível de "não há registros".

### O que a Etapa 22 NÃO cobre

- **Não exporta para Excel.** O módulo já tem exportação nos Relatórios; enxertar uma segunda
  régua aqui duplicaria trabalho. Se a demanda aparecer, a trilha vira mais um relatório
  (letra **D** das novidades).
- **Os nomes das ações continuam inconsistentes no banco.** A tela agrupa **na exibição** e o
  dado histórico ficou intacto — reescrever o que o sistema afirma ter registrado é justamente o
  que uma trilha não pode sofrer. Se você quiser a correção definitiva, o mapa está pronto: item
  **B47**.
- **O acesso continua sendo só de Administrador.** O Gestor que conduziu um inventário ainda não
  vê o próprio registro. Abrir para ele é decisão sua (metade que resta da letra **B33**).
- **Valores muito grandes aparecem cortados em 300 caracteres**, com a contagem do que falta. A
  linha do histórico de permissões por setor guarda ~46 KB de uma vez; exibida inteira, ficaria
  ilegível. Quem precisar do conteúdo completo dessa linha específica ainda depende de consulta
  técnica (furo **C29**, e o volume em si é o item **G8**).
- **Não há retenção nem expurgo do histórico** — o log cresce indefinidamente. Sem política
  definida por você, apagar trilha de auditoria é a última coisa que se faz por conta própria
  (letra **D**).
- ~~**Duas coisas que a trilha ainda não registra direito e que agora ficam visíveis:** salvar
  configurações é gravado chave a chave, então uma falha no meio pode deixar parte gravada **sem
  nenhuma linha de histórico**; e excluir algo que já estava inativo gera um registro de exclusão
  mesmo sem excluir nada.~~ — **AS DUAS FORAM PAGAS NA ETAPA 23** (ver a seção dela no fim deste
  guia). Deixado riscado, não apagado, para quem lembrar das pendências confirmar que fecharam.
  **Foi a tela desta etapa que tornou as duas urgentes:** enquanto o histórico só existia no
  banco, elas eram teoria.

## Etapa 23 — O histórico para de mentir por omissão e por excesso (ENTREGUE — 2026-08-28)

> **Esta etapa não tem tela nova.** O que ela entrega é a **confiança no que a tela de Auditoria
> (Etapa 22) mostra**. Ela existe porque a Etapa 22, ao dar um leitor à trilha, transformou dois
> defeitos teóricos em coisa que quem audita **vê**.

Enquanto o histórico vivia só no banco, dois problemas eram abstratos. A partir do momento em que
alguém abre **Almoxarifado → Auditoria** para responder *"quem mexeu nisto?"*, um deles vira uma
**ausência** que engana e o outro vira uma **linha a mais** que engana.

**O primeiro:** a tela de Configurações do módulo manda **18 campos** a cada `Salvar`, e o sistema
gravava um de cada vez. Falhando no terceiro, os dois primeiros já estavam gravados, você via a
mensagem de erro, e o histórico **não ganhava nenhuma linha** — porque a anotação só acontecia no
fim, depois de todos. Configuração alterada pela metade, usuário convencido de que não salvou, e
trilha muda.

**O segundo:** excluir um cadastro do módulo é uma **inativação**. Clicar **Excluir** de novo
(duas abas abertas, um F5, um duplo-clique) respondia sucesso e **gravava outra linha de
"Exclusão"**, com autor e horário, sobre um item que já estava inativo. Na tela de Auditoria essa
linha é indistinguível de uma exclusão de verdade. A causa é uma armadilha do banco: ele conta as
linhas que a busca **encontrou**, não as que **mudaram de valor**.

**E um terceiro, que não estava previsto.** Ao medir o primeiro, a revisão encontrou um defeito
mais fundo: quando duas gravações disputam o banco ao mesmo tempo, o sistema **tenta de novo** — e
a versão antiga desse mecanismo **respondia o erro da primeira tentativa** e só depois decidia
refazer. Na prática: a tela mostrava erro, o pedido era refeito nos bastidores, **a gravação
acontecia**, e a anotação já tinha sido pulada. Sem consertar isso, o conserto do primeiro caso
seria promessa falsa. Foi feito antes dos outros dois.

### Antes → Agora

| Antes | Agora |
|---|---|
| `Salvar` em Configurações gravava campo a campo; falha no meio deixava **parte gravada** | As 18 vão **juntas ou nenhuma vai** |
| Falha no meio deixava a configuração alterada **sem nenhuma linha no histórico** | O erro passa a descrever um banco **intocado** |
| Clicar **Excluir** de novo num item já inativo gravava **outra** linha de "Exclusão" | O segundo clique responde sucesso e **não gera linha nenhuma** |
| Excluir um **material** já inativo gravava outra "Exclusão" — na entidade central do módulo | Idem: só a desativação que **teve efeito** vira registro |
| Excluir item **inexistente** e item **já inativo** eram tratados como o mesmo caso | São separados — o inexistente continua avisando que não existe |
| Duas gravações disputando o banco: quem pediu recebia **erro** e a gravação acontecia depois | Quem pediu recebe **uma** resposta, a da tentativa final |

### Roteiro de teste manual

1. **Entre como Administrador do módulo.**
2. Vá em **Almoxarifado → Configurações → aba "Tipos de Material"**. Crie um tipo chamado
   *Teste Auditoria* e salve.
3. **Abra a mesma tela numa segunda aba** do navegador (isso é para conseguir clicar Excluir duas
   vezes; sem a segunda aba o item some da lista depois do primeiro clique).
4. Na primeira aba, clique **Excluir** no *Teste Auditoria*. Confirme.
5. Na **segunda aba** (que ainda mostra o item na lista), clique **Excluir** no mesmo item.
   Confirme. **Não aparece erro** — a tela responde normalmente, como sempre respondeu.
6. Vá em **Almoxarifado → Auditoria**. No filtro **Entidade**, escolha **Tipo de material**.
   Procure o *Teste Auditoria* na lista.

   > **Aparece UMA linha de "Exclusão", não duas.**

   Antes desta etapa apareceriam **duas**, com horários diferentes, e nada indicaria que a segunda
   não excluiu coisa alguma.
7. Clique em **Detalhes** nessa linha. Na tabelinha `Campo · De · Para`, o único campo que mudou de
   verdade é **`ativo`, de `1` para `0`**. Os demais aparecem com o **Para** vazio: são o contexto
   que a operação registrou junto (é a mesma regra explicada no passo 4 do roteiro da Etapa 22).
8. **Repita com um material.** Cadastro → Materiais → criar um material qualquer → **Excluir** duas
   vezes (mesma técnica das duas abas) → Auditoria com o filtro **Entidade = Material**. Também
   **uma** linha só. Isto importa porque o material é a entidade central do módulo, e ela **não
   estava** no desenho original desta etapa — foi encontrada durante a execução.
9. **Confirme que o aviso legítimo não sumiu.** Tente excluir um item que não existe (por exemplo,
   editando o endereço da tela para um número inventado). A resposta continua sendo a mensagem de
   sempre:
   > *Tipo de material não encontrado* · *Localização não encontrada* · *Setor não encontrado* ·
   > *Família não encontrada*
10. **Confirme que as travas de exclusão continuam de pé.** Tente excluir uma localização que tem
    saldo:
    > **Não é possível remover: localização possui saldo**

    E tente excluir um setor cujo nome ainda é usado por uma localização ativa:
    > **Não é possível excluir: 1 localização(ões) ativa(s) usam este setor**

    Esse segundo caso vale **mesmo que o setor já esteja inativo**, e é decisão: a mensagem do
    vínculo é verdade, e trocá-la por "já estava inativo" esconderia de quem limpa o cadastro que
    existe uma localização presa àquele nome.

**O `Salvar` tudo-ou-nada não tem roteiro clicável** — demonstrá-lo exigiria provocar uma falha de
banco no meio da gravação. Ele está congelado em teste automatizado. O que dá para afirmar: **se o
`Salvar` da tela de Configurações falhar, nenhum dos 18 campos foi gravado.** Antes, a mensagem de
erro podia estar mentindo.

### O que a Etapa 23 NÃO cobre

- **Nenhuma tela mudou.** Se você quiser que o segundo clique em Excluir **avise** alguma coisa
  ("este item já estava inativo"), é uma mensagem no front e é decisão sua — item **B52** das
  novidades. O histórico continua não registrando, porque não houve ato.
- **O "tudo ou nada" foi entregue só no `Salvar` de Configurações.** Os demais pontos do módulo que
  gravam vários registros em sequência **não foram varridos** — corte de escopo, não conclusão de
  que não existem (letra **D**).
- **O mesmo perigo existe hoje em dois pontos do NÚCLEO do CRM** (exclusão de usuário e renumeração
  de propostas) e continua lá: quando a gravação falha, o "desfazer" é disparado num segundo
  comando, e o que outra pessoa gravar nessa fresta é apagado junto. É anterior a esta etapa e são
  rotas do núcleo — furo **C30**, conserto em etapa própria.
- **"Excluir" e "desativar" continuam com nomes diferentes no dado gravado.** Na tela de Auditoria
  eles já aparecem juntos sob "Exclusão" desde a Etapa 22 (**B48**) — para quem audita já está
  resolvido. Padronizar a gravação são ~45 pontos do código (letra **D**).
- **Não existe registro de "tentativa de desativação".** Havia um comentário no código defendendo
  que valia a pena registrar quem tentou desativar de novo; ele **perdeu** (item **B53**), porque
  registrar tentativa com o mesmo nome do ato real é o histórico mentindo por excesso. Se isso
  tiver valor para vocês, pede um nome próprio de ato — etapa nova.

## Etapa 24 — A Qualidade ganha perfil, e a tela de perfis para de mentir (ENTREGUE — 2026-08-29)

> **Esta etapa não tem tela nova, e isso é o principal a saber sobre ela.** O desenho dela começou
> afirmando que a tela de atribuir perfil **não existia** e mandava construí-la. **A afirmação era
> falsa:** a aba **Almoxarifado → Configurações → Perfis de Acesso** existe desde 05/08/2026, está
> no menu, está no manual e já tinha sido usada sete vezes. O escopo foi reescrito de *"criar a
> tela"* para *"consertar quatro defeitos da tela que existe"* — porque construir de novo teria
> criado **duas portas para a mesma função**, cada uma sem saber da outra.

**O que a etapa resolve, em uma frase:** quem inspeciona material recebido não tinha perfil no
sistema, e a tela que decide quem tem acesso ao módulo apagava perfis **sem deixar rastro**.

**O perfil Qualidade.** Para aprovar ou reprovar uma carga, liberar um lote vencido ou mudar a
situação de um lote ou de uma série, a área de qualidade dependia de o almoxarifado decidir por
ela — ou recebia um perfil largo, que abria junto movimentar estoque e cadastrar material. Agora
existe **Qualidade**, com duas coisas: **consultar** e **decidir inspeção**. Nada além, de
propósito.

**Os três consertos da tela.** (1) **Retirar** o perfil de alguém não gerava nenhuma linha no
histórico — o ato mais sensível do módulo era invisível; (2) **dar** o perfil ficava registrado
sem dizer qual era o perfil anterior, então a trilha mostrava o "para" sem o "de"; (3) a lista de
opções oferecia **Administrador**, que dá poder de configurar o módulo e promover outras pessoas
e que **é apagado sozinho** no próximo salvamento daquele cadastro de usuário.

### Roteiro de teste manual

**Pré-requisito:** entrar com um usuário que possa configurar o módulo (superadministrador,
administrador do sistema ou administrador do módulo Almoxarifado).

**Parte 1 — o perfil novo aparece com nome e descrição**

1. Menu **Almoxarifado → Configurações** → aba **Perfis de Acesso**.
2. Localizar um usuário comum (a busca por nome ou e-mail ajuda) que **não** tenha o selo
   *Administrador*.
3. Abrir a lista de perfis da linha dele. Conferir as opções:
   *Produção (padrão)*, *Almoxarife*, *Compras*, *Engenharia*, *Gestor*, *Consulta*, **Qualidade**.
   - ✅ **Qualidade** aparece escrito assim, capitalizado — **não** `QUALIDADE` em caixa alta.
   - ✅ **Administrador NÃO aparece na lista.**
4. Escolher **Qualidade**. O aviso é:
   > *Perfil definido: Qualidade*
5. Na mesma linha, olhar a coluna **O que isso permite**:
   > *Consulta e decide inspeção: aprova/reprova item recebido, libera vencimento de lote e muda
   > status de lote e de série — não movimenta estoque, não ajusta saldo nem cadastra material*

**Parte 2 — a explicação do Administrador está na tela**

6. Acima da tabela, ler o parágrafo:
   > *Administrador do módulo não é oferecido aqui: define-se no cadastro de usuário, marcando o
   > almoxarifado entre os módulos que a pessoa administra. Concedido por esta tela, seria apagado
   > no próximo salvamento daquele cadastro.*
7. Procurar na tabela alguém que **seja** administrador: a linha mostra o selo **Administrador**,
   **sem lista de escolha**, e abaixo:
   > *Para dar um perfil específico, remova a condição de administrador no cadastro de usuário.*

**Parte 3 — dar e tirar deixam DUAS marcas no histórico** *(é o coração da etapa)*

8. Na linha do usuário da Parte 1, escolher **Produção (padrão)**:
   > *Perfil removido — o usuário volta ao padrão (Produção)*
9. Menu **Almoxarifado → Auditoria**.
10. No filtro **Entidade**, escolher **Perfil de usuário**.
11. Conferir que aparecem **duas** linhas para aquela pessoa:
    - ✅ a mais recente com a ação **Exclusão** — é a retirada;
    - ✅ a anterior com a ação **Edição** — é a concessão.
12. Expandir **Detalhes** da linha de **Exclusão**. O De → Para tem de mostrar
    `perfil: QUALIDADE → —` e `perfil efetivo: QUALIDADE → PRODUCAO`.
13. Expandir a de **Edição**: `perfil: — → QUALIDADE`.
    - ⚠️ **Antes desta etapa, o passo 11 mostraria uma linha só** (a concessão), e o passo 13
      mostraria a concessão **sem o "de"**.

**Parte 4 — o perfil Qualidade é estreito de propósito** *(precisa de um segundo login)*

14. Entrar com o usuário que recebeu **Qualidade** (se você já o devolveu ao padrão no passo 8,
    atribua de novo).
15. Menu **Almoxarifado → Inspeções**. A tela abre e é possível decidir a inspeção de um item.
16. Clicar em **Bloquear Material** (botão do topo). O aviso é:
    > *Sem permissão para ajustar saldo de estoque — seu perfil é Qualidade. Solicite acesso a um
    > administrador.*
    - ✅ O nome do perfil aparece **por extenso e capitalizado** — *Qualidade*, não `QUALIDADE`.
17. O mesmo vale para **Desbloquear Material**. Os dois botões mexem em **saldo**, e por isso
    pertencem a *Ajustar estoque* (Administrador e Gestor), não a *Inspecionar*.

### O que esta etapa NÃO cobre

- **A central de alertas continua invisível para o perfil Qualidade** — inclusive os quatro
  alertas que seriam dele (material reprovado, divergência de recebimento, lote sem certificado e
  a fila de itens aguardando inspeção). O motivo é que a central **não filtra por perfil**: quem a
  abre vê o registro inteiro, com os alertas que trazem **valor em dinheiro** parado. Item **B55**
  das novidades; destravar isso é etapa própria.
- **Bloquear/desbloquear material avulso não entrou no perfil** (passos 16-17 acima). Item **B56**
  — se tiver de caber, o caminho é uma permissão própria de bloqueio por qualidade, não abrir
  *ajustar estoque*.
- **Quem não tem perfil definido continua entrando como Produção.** Item **B54**, o único desta
  etapa que espera resposta sua.
- **Nada foi migrado no banco.** Quem já tiver **Administrador** gravado continua com ele: o
  filtro é da tela. Rode a consulta **A4** das novidades antes do deploy — furo **C31**.
- **A trilha antiga não ganhou o "de" retroativamente.** As sete atribuições anteriores a esta
  etapa continuam registradas como estavam.


## Etapa 25 — De onde veio cada movimento, e o backup que parou de crescer sozinho (ENTREGUE — 2026-08-29)

> **Não tem tela nova.** O que mudou aparece dentro da tela de **Auditoria** e num campo da aba
> **Backup** das Configurações que já existia sem funcionar.

**O problema, em uma frase cada:**

1. O histórico de movimentação dizia **quem** e **quando**, nunca **de onde**. Numa dúvida sobre
   uma baixa estranha, dava para saber o nome da pessoa e mais nada.
2. A pasta de backups do servidor **nunca parava de crescer**: cada cópia do banco deixa dois
   arquivos auxiliares, e a limpeza automática apagava a cópia e **esquecia os auxiliares**. Em
   produção sobraram **132 arquivos órfãos ocupando 44 MB** que nenhuma rotina recolhia.
3. O campo **"Manter Backups (dias)"** das Configurações **não fazia nada**. Salvava um número que
   nenhum código lia.

**Um problema sério pego antes de chegar em produção:** a primeira versão lia a configuração de
retenção cedo demais no arranque, antes de o banco terminar de se montar. Num servidor em uso
ninguém notaria; **numa instalação nova, o sistema subiria com o sinal de saúde travado em "falha
no banco" para sempre** e o backup de arranque nunca rodaria. Foi reproduzido de propósito, num
servidor limpo, antes de existir a correção.

### Roteiro de teste manual

**Parte 1 — a origem da movimentação (5 minutos)**

1. Entre como **Administrador**.
2. **Almoxarifado → Movimentações** → registre uma **entrada** de qualquer material (quantidade
   pequena, para não bagunçar o saldo).
3. **Almoxarifado → Auditoria** → no filtro **Entidade**, escolha **Movimentação** → clique na
   linha mais recente para expandir.
4. **Confira:** além de `material_id`, `tipo`, `quantidade` e `saldo_posterior`, aparecem agora as
   linhas **`ip`** e **`user_agent`**. O `ip` é o endereço do computador de onde você clicou; o
   `user_agent` é o navegador. A coluna **De** mostra `—` em todas as linhas — normal, movimentação
   é criação, não havia estado anterior.
5. **Não** deve aparecer uma linha `ip_proxy` se você está acessando direto (sem servidor
   intermediário). Isso é de propósito: gravá-la vazia encheria toda movimentação com uma linha
   `ip_proxy: — → —` inútil.
6. Volte a **Movimentações** e **cancele** o movimento que acabou de criar. O sistema **exige**
   justificativa — tente sem, e a mensagem literal é:

   > *Justificativa obrigatória para cancelamento*

7. **Auditoria** de novo: aparecem **duas** linhas novas — o **cancelamento** e o **estorno** — e
   **as duas** têm `ip` e `user_agent`. O estorno é criado por um caminho diferente do resto do
   sistema e teria ficado de fora se ninguém tivesse ido atrás dele.
8. **O caminho "por dentro do sistema":** vá em **Almoxarifado → Devoluções**, registre uma
   devolução. Na **Auditoria**, a entrada gerada por ela **também** traz `ip`. Este é o teste que
   importa: movimentos criados por dentro do sistema (devolução, retorno de terceiro, exclusão de
   requisição) são **23 dos 28** caminhos, e são justamente os que o desenho original da etapa
   teria deixado sem origem.

**Parte 2 — a retenção de backup (2 minutos, e o efeito só aparece no próximo arranque)**

9. **Configurações → aba Backup**. Três campos: **Backup Automático**, **Frequência** e **Manter
   Backups (dias)**.
10. Mude **Manter Backups (dias)** para `15` e salve.
11. **Reinicie o servidor.** No registro do servidor (terminal onde ele roda) aparece uma linha
    dizendo quantos arquivos foram removidos e com que régua. As mensagens literais são:

    > `[DB Recovery] 132 acompanhante(s) orfao(s) removido(s)`
    > `[DB Recovery] retencao: 135 arquivo(s) removido(s) (manter 15 dias, teto de 10 copias)`
12. **Teste o valor inválido:** volte e salve o campo com `0` (ou apague, ou ponha `-5`). Reinicie.
    O servidor **não apaga tudo** — ele avisa no registro que o valor é inválido e usa o padrão de
    **30 dias**.

### As travas que impedem a limpeza de fazer besteira

| Trava | O que faz | Por quê |
|---|---|---|
| **Mínimo 3 cópias** | As 3 mais recentes **nunca** são apagadas, mesmo com anos de idade | O download de backup usa a cópia mais recente como salvação. Sem esta trava, um prazo curto deixaria o sistema sem nenhum fallback |
| **Máximo 10 cópias** | Da 11ª em diante sai sempre, mesmo sendo de hoje | Trocar "10 fixas" por "N dias" **sem teto** faria a pasta crescer sem limite — no ritmo medido de reinícios, ~2,9 GB em 30 dias |
| **Valor inválido → padrão** | Vazio, `0`, `-5` ou texto caem em 30 dias, com **um** aviso no registro | Um campo em branco jamais pode significar "apague tudo" |
| **Nunca derruba o arranque** | Se a limpeza falhar, é só um aviso no registro | Apagar arquivo velho é conveniência; nunca pode impedir o sistema de subir |

### ⚠️ Antes do deploy em produção

A limpeza **roda sozinha no primeiro arranque** depois do deploy. Medição real feita em 29/08/2026
sobre a pasta de backups (em modo de simulação — nada foi apagado):

```
ANTES  : 165 arquivos, 187,36 MB
APAGA  : 135 arquivos,  57,27 MB  (132 órfãos + a 11ª cópia e seus 2 auxiliares)
DEPOIS :  30 arquivos, 130,09 MB  — 10 cópias completas do banco
```

**Leia a A5 das novidades antes de subir.** Se houver na pasta alguma cópia que você guardou de
propósito, mova-a para fora antes.

### O que esta etapa NÃO cobre

- **Não há tela para consultar a origem.** O `ip` e o `user_agent` aparecem dentro da linha
  expandida da Auditoria, junto dos outros campos. Não existe filtro "movimentações vindas deste
  endereço" nem alerta de "acesso de local incomum".
- **A origem não foi para trás.** Movimentações anteriores a esta etapa continuam sem `ip` — o
  dado não existia e não há de onde inventá-lo.
- **Só a movimentação ganhou origem.** Requisição, recebimento, inspeção e cadastro continuam sem.
- **Registrar não é impedir.** O sistema anota de onde veio; ele **não** recusa acesso por
  endereço de rede nem restringe horário.
- **Não existe botão "limpar backups agora".** A limpeza é no arranque.
- **Os uploads (fotos, anexos) não têm expurgo.** Eles entram no download de backup, então estão
  salvos; o que não existe é regra para apagar os antigos. Só o banco é podado.
- **Backup Automático e Frequência continuam decorativos** — furo **C32**. Não existe agendamento
  no servidor: o backup acontece **no arranque** e quando alguém clica em baixar. Marcar "Ativado"
  e "Diário" **não** cria rotina diária.
- **Dupla conferência em material crítico não foi feita** — é decisão de negócio, item **B57**.


## Etapa 26 — Uma lista de categorias só, e ela é da GMP (ENTREGUE — 2026-08-29)

**O que mudou, em uma frase:** as categorias de material deixaram de ser uma lista genérica
escrita dentro do sistema e passaram a ser **o catálogo da GMP**, que agora dá para editar pela
tela.

### O problema que existia

Ao cadastrar um material, a lista de categorias que aparecia era `CONSUMÍVEL`, `FERRAMENTA`,
`EPI`, `ELÉTRICO`, `HIDRÁULICO`… — genérica, servia para qualquer empresa e para nenhuma em
particular. Ela estava **escrita dentro do programa**, em **três telas diferentes**, e mudá-la
exigia programador.

Ao mesmo tempo, existia no banco um catálogo de **27 categorias de metalúrgica** — `Aço carbono`,
`Aço inox`, `Chapas`, `Tubos`, `Perfis estruturais`, `Componentes usinados`, `Rolamentos`,
`Elementos de fixação`, `Solda e consumíveis`… — feito para a GMP e **completamente sem uso**. As
duas listas não tinham **uma única categoria em comum**.

Isso produzia dois efeitos ruins na prática:

1. **O filtro de categoria devolvia zero.** Ele oferecia `EPI`, e nenhum material do banco estava
   como `EPI`. Zero linhas parece estoque vazio, não filtro inútil.
2. **A tela mentia sobre o que estava gravado.** Ao abrir um material cuja categoria não estava na
   lista, o formulário mostrava **a primeira opção da lista** — a pessoa via `Aço carbono` na tela
   enquanto o cadastro continuava guardando `CONSUMÍVEL`. E se ela salvasse, salvava `CONSUMÍVEL`
   mesmo. Não havia mensagem de erro nem indício nenhum.

### O que existe agora

| Onde | O que mudou |
|---|---|
| **Materiais → Novo/Editar Material** | O campo Categoria lista o catálogo da GMP; nasce **vazio** (`Selecione…`) e o sistema **recusa salvar sem categoria** |
| **Materiais** (filtro da listagem) | O seletor de categoria lista o catálogo |
| **Conferência de Estoque** (filtro da nova conferência) | Idem |
| **Configurações → aba Categorias** (nova) | Criar, renomear, desativar e **reativar** categoria |
| **Auditoria** | Filtro **Entidade = Categoria**, com quem fez e o de/para do nome |

### Roteiro de teste manual (8 minutos)

1. Entre como usuário **Administrador** do almoxarifado (os outros perfis leem, mas não editam o
   catálogo).
2. **Almoxarifado → Configurações → aba "Categorias".** Confira que a lista traz as 27 categorias
   de metalúrgica, todas com a etiqueta verde **Ativa**.
3. Clique em **➕ Nova Categoria**, digite `Perfis de alumínio` e **Salvar Categoria**. Deve
   aparecer *"Categoria criada!"* e a linha nova na tabela.
4. Clique em **➕ Nova Categoria** de novo e tente o **mesmo nome**. O sistema recusa com
   *"Já existe uma categoria com este nome"*. (Tente também com espaços: `" Perfis de alumínio "`
   colide igual.) Salvar com o nome vazio dá *"Nome é obrigatório"*.
5. **Almoxarifado → Materiais → Novo Material.** Na seção *Classificação*, abra o campo
   **Categoria**: `Perfis de alumínio` **já está lá**, sem precisar recarregar a página.
6. Preencha o resto do material e clique em salvar **sem escolher categoria**. O sistema recusa
   com *"Selecione a categoria do material"*. Escolha `Perfis de alumínio` e salve.
7. **Abra para edição um material antigo** (cadastrado antes desta etapa). O campo Categoria
   mostra o valor gravado com o aviso — por exemplo **`CONSUMÍVEL (fora de catálogo)`**. Salve sem
   tocar no campo e reabra: **continua `CONSUMÍVEL`**. (Antes, esta mesma tela mostrava
   `Aço carbono`.)
8. Volte a **Configurações → Categorias**, clique no **lápis** de `Perfis de alumínio`. Leia o
   **aviso amarelo**: *"Renomear não reclassifica os materiais: os que já usam esta categoria
   continuam gravados com o nome antigo. Para movê-los, edite cada material."* Renomeie para
   `Perfis de alumínio extrudado` e salve — *"Categoria renomeada! Os materiais já classificados
   mantêm o nome antigo."*
9. Abra o material do passo 6: ele mostra **o nome antigo, marcado como fora de catálogo**. É o
   comportamento declarado, e é a decisão **B58**.
10. Clique na **lixeira** da categoria. Leia a pergunta: *"Desativar a categoria "…"? Ela sai das
    listas de novos materiais, mas os que já a usam continuam com ela."* Confirme
    (*"Categoria desativada"*): a linha fica **Inativa** e o botão vira **Reativar**. Confira em
    **Novo Material** que ela sumiu da lista, e que o material do passo 6 **continua com ela**.
11. Clique em **Reativar** (*"Categoria reativada"*): ela volta às listas.
12. **Almoxarifado → Auditoria** → filtro **Entidade = Categoria**. Aparecem as linhas de
    **Criação**, **Edição** e **Exclusão**, com o autor; expanda a de Edição para ver o de/para do
    nome.

### Teste de permissão (2 minutos)

Entre com um usuário que **não** seja Administrador do módulo (Almoxarife, Gestor, Compras,
Engenharia, Consulta, Qualidade ou alguém sem perfil). A lista de categorias **continua aparecendo
normalmente** no cadastro de material — a leitura é liberada, porque a tela precisa dela para
exibir a categoria do item. O que ele não consegue é criar, renomear ou desativar: o servidor
recusa com 403.

### O que esta etapa NÃO cobre

- **Nenhum material foi reclassificado.** Quem estava como `CONSUMÍVEL` continua como
  `CONSUMÍVEL`. Isso é decisão declarada: a consulta para decidir em produção é a **A6** do
  documento de novidades.
- **⚠️ Enquanto o acervo não for remapeado, filtrar a lista de materiais por qualquer categoria
  nova devolve ZERO.** Não é defeito — as opções agora são as certas, o que falta é o acervo
  chegar nelas. É o furo **C33**, e quem opera precisa saber antes de estranhar.
- **Renomear não reclassifica** os materiais (passo 8/9) — decisão **B58**.
- **Não existe reclassificação em massa pela tela.** Para mover materiais de uma categoria para
  outra, edita-se material por material ou roda-se o `UPDATE` da A6.
- **As 27 categorias do catálogo não foram revisadas com a GMP.** Estavam no banco desde o começo
  e foram assumidas como certas. Se alguma sobrar ou faltar, agora dá para arrumar pela tela.

## Etapa 28 — A separação ganha dono, e quem separou não confere (ENTREGUE — 2026-08-29)

**O que mudou, em uma frase:** cada rodada de separação passa a registrar **quem, quando e o quê**;
nasce a **segunda conferência** por outra pessoa; e **material crítico não sai** da requisição
sem ela.

> ## ⚠️ LEIA ANTES DE TESTAR — precisa de DOIS usuários
>
> A regra central é que **uma pessoa só não fecha o ciclo** com material crítico. Para o roteiro
> você precisa de **dois logins com perfil Almoxarife** (ou um Almoxarife e um Administrador).
> Chame-os de **A** e **C**. Dá para fazer com duas janelas anônimas do navegador.
>
> **Material comum continua saindo exatamente como antes.** A conferência existe para toda
> requisição, mas só **trava** quando há material **marcado como crítico** separado e ainda não
> entregue. Se a sua base não tem nenhum material crítico, marque um em Almoxarifado → Materiais →
> editar → *Material crítico*.

### O problema que existia

Quando falta material na caixa, a primeira pergunta é **"quem separou?"** — e o sistema não tinha
resposta. A separação gravava as quantidades por item e **nada mais**: nem quem, nem quando, nem
linha na Auditoria (curioso: no mesmo fluxo, *confirmar recebimento* e *rejeitar por valor* já
auditavam). E sem saber quem separou, a regra *"quem confere não pode ser quem separou"* não tinha
como existir.

Dois detalhes que a revisão da etapa achou e mudaram o projeto:

- **A entrega saía direto de *Em Separação***, sem passar por *Liberar para Retirada*. Uma
  barreira colocada só na liberação seria barreira que ninguém é obrigado a passar. Por isso ela
  está nas **duas** saídas.
- **O formulário de separação gravava item a item antes de validar o próximo.** Um item acima do
  máximo mostrava o erro, mas os anteriores **ficavam gravados** — e ficavam **sem rodada**, porque
  a rodada só era registrada no fim. Sem rodada, a mesma pessoa separava, conferia e entregava.
  Agora o sistema valida **tudo** antes de gravar **qualquer coisa**.

### O que existe agora

| Onde | O que mudou |
|---|---|
| **Detalhe da requisição** (modo almoxarifado) | Bloco **Separação (N)** com *quem · dia/hora · N itens* por rodada |
| **Detalhe da requisição** | Linha **Conferida por X em …** e botão **Conferir separação** (cinza para quem separou) |
| **Liberar para Retirada / Confirmar Entrega** | Ficam **cinza** enquanto há crítico na caixa sem conferência — e o servidor recusa mesmo sem a tela |
| **Entrega de material crítico** | Só sai a quantidade **separada e ainda não entregue**; comum mantém a regra antiga |
| **Auditoria** (Entidade = Requisição) | Ações novas: **Separação**, **Conferência da separação**, **Liberação para retirada** |
| **Perfis** | Permissão nova **Conferir separação** (Administrador e Almoxarife) |

### Roteiro de teste manual (15 minutos, dois logins)

1. **Prepare:** um material **crítico** (Materiais → editar → marque *Material crítico*) com saldo,
   e um material comum com saldo. Como qualquer requisitante, crie uma requisição com os dois,
   envie e, como A, aprove.
2. **Como A — separe.** Abra a requisição, **Iniciar Separação**, informe quantidade nos dois
   itens, confirme. No detalhe aparece **Separação (1)** com o seu nome. Repare: **Liberar para
   Retirada** e **Confirmar Entrega e Baixar Estoque** estão **cinza**; passe o mouse: *"Esta
   requisição tem material crítico separado e precisa da segunda conferência antes de sair"*. O
   botão **Conferir separação** também está cinza: *"Você separou esta requisição — a segunda
   conferência precisa ser feita por outra pessoa"*.
3. **Como A — tente sair mesmo assim** (opcional, pela API, para ver que a barreira é do servidor):
   `PUT /api/almoxarifado/requisicoes/<id>/liberar-retirada` → *"Esta requisição tem material
   crítico separado e ainda não passou pela segunda conferência. Peça a outra pessoa do
   almoxarifado para conferir a separação antes de liberar ou entregar."* O mesmo em `/entregar`.
   Confira em Materiais que o saldo **não mudou**.
4. **Como C — confira.** Abra a mesma requisição: o botão **Conferir separação** está ativo.
   Clique: *"Separação conferida!"* e a linha **Conferida por C em …**. Os botões de saída
   ficaram ativos.
5. **Como A — separe mais um pouco** (Ajustar Separação, aumente um item). A linha *Conferida por*
   **some** e os botões de saída voltam a ficar cinza — a caixa mudou. Confirme **sem mudar
   nada** outra vez: a conferência **não** some (a caixa não mudou).
6. **Como C — confira de novo e libere.** Conferir separação → Liberar para Retirada → *"Requisição
   liberada para retirada!"*.
7. **Como A — entregue parte** do crítico (Confirmar Entrega, quantidade menor que a separada).
   Vai para *Parcialmente Atendida*. Tente entregar **mais do que ficou separado** no crítico:
   *"<material>: material crítico só sai depois de separado e conferido — 9 excede o separado
   ainda não entregue (…). Separe o restante e peça a segunda conferência."* Entregue o **comum**
   além do separado: passa (regra antiga, mantida para material comum).
8. **Auditoria → Entidade = Requisição.** Para esta requisição: **Separação** (duas ou três,
   com o de/para mostrando a conferência apagada na rodada que apagou), **Conferência da
   separação** (duas), **Liberação para retirada**.
9. **Perfil:** entre como um usuário **Produção** e tente `PUT .../conferir-separacao` pela API:
   recusa de permissão nomeando *conferir_separacao*, antes de qualquer regra.

### O que esta etapa NÃO cobre

- **Lista de separação como entidade, rota de picking e kits** — o "picking" propriamente dito,
  depende de endereçamento (feature 02).
- **Localizações "Reservado"/"Kit"/"Aguardando retirada"** — a spec dizia que existiam; **não
  existem** (corrigido na Fase 0); criá-las é mudança de contrato.
- **Dupla conferência para outras operações** (ajuste, transferência, sucata de crítico) — a
  **B57** continua aberta para essas; esta etapa respondeu a saída da requisição.
- **Requisições separadas antes da etapa** não têm rodada: qualquer Almoxarife confere, inclusive
  quem separou. Furo **C37**.
- **Almoxarifado de uma pessoa** não tira crítico sozinho — **B62**/**C38**; reversível numa linha.
- **Separar menos que o pedido com motivo obrigatório** — item da spec 05 não tocado.

---

## Etapa 27 — A divergência dimensional deixa de ser opinião e vira medição (ENTREGUE — 2026-08-29)

**O que mudou, em uma frase:** a inspeção de recebimento ganhou **plano de medidas por material**,
e a caixa *"Divergência dimensional"* passou a ser **calculada a partir dos números** em vez de
marcada à mão — mas **isso ainda não aparece na tela**.

> ## ⚠️ LEIA ANTES DE TESTAR — esta etapa não tem tela
>
> O formulário **Decidir Inspeção** está **exatamente como estava**: as mesmas cinco caixas de
> "problemas identificados", a mesma caixa **Divergência dimensional** clicável, nenhum campo de
> medida. **Se você abrir a tela procurando onde digitar a medida, não vai achar — e está certo.**
>
> A etapa entregou a **fundação**: o plano, a régua da tolerância, a gravação das medidas, a
> derivação da divergência e a recusa de instrumento descalibrado. A tela é a etapa seguinte.
> A razão da ordem: a régua era a parte com risco de verdade (ver "O problema que existia"), e ela
> foi feita e testada primeiro para que a tela seja **só tela** quando chegar.
>
> **Nada do comportamento atual mudou.** As tabelas nascem vazias; enquanto ninguém cadastrar
> característica nenhuma, tudo funciona como antes — inclusive a caixa marcada à mão, que continua
> valendo.

### O problema que existia

Quando um material chega e vai para inspeção, o inspetor marca (ou não) a caixa **Divergência
dimensional**. Só isso. Não existia em lugar nenhum do sistema:

- **o que a peça deveria medir** (nenhum plano, nenhuma tolerância cadastrada);
- **quanto ela mediu** (nenhum número gravado em lugar nenhum);
- **com que instrumento** — mesmo o cadastro de instrumentos com calibração existindo desde as
  Ferramentas, e mesmo a calibração vencida sendo justamente o defeito que uma medição de
  recebimento precisa impedir.

Ou seja: **um julgamento sem prova por trás**. Se o inspetor esquecia de marcar, a divergência
desaparecia do registro. Se marcava por engano, ninguém tinha como conferir depois.

**E o cuidado que quase deu errado, porque vale para entender a etapa inteira:** ao construir a
régua que decide se uma medida está dentro da tolerância, a primeira versão reprovava a peça que
estava **exatamente no limite**. Não por regra de negócio — por **arredondamento do computador**:
`0,7 + 0,1` é calculado como `0,7999999999999999`, e uma peça de `0,800` caía fora por um fio
inexistente. Varrendo 50.000 combinações de nominal e tolerância com a medida no limite exato,
**12,3% eram reprovadas** (6.132 casos). Como a divergência agora é derivada, cada uma dessas
ligaria a caixa sozinha: **o sistema fabricando a divergência que ele existe para medir.** A régua
final trabalha com uma folga de `0,000001` mm, três ordens de grandeza abaixo do melhor
instrumento do cadastro (comparador, 0,0001 mm) — ela nunca alcança uma medida real, só o erro do
próprio cálculo.

### O que existe agora

| Onde | O que mudou |
|---|---|
| **Plano de inspeção** (por material) | Lista de características a medir: nome, unidade, valor nominal e **dois desvios com sinal**. Só por API — sem tela |
| **Decisão de inspeção** | Aceita medidas junto com a decisão. Havendo medidas, a **divergência dimensional é derivada** e a marcação manual é ignorada |
| **Instrumentos** | Medir com instrumento de **calibração vencida** é recusado, nomeando o instrumento |
| **Auditoria** | Filtro **Entidade = Plano de inspeção** — Criação, Edição (com de/para) e Exclusão de característica |
| **Tela de Inspeções** | **Sem mudança nenhuma** |

**As tolerâncias têm sinal, e isso é o que importa para usinagem.** O simétrico continua sendo
`-0,05 / +0,05`. O caso que só o sinal representa é o **unilateral deslocado** (ISO 286, ajuste de
eixo): `+0,005 / +0,021`, os **dois** limites acima do nominal. Nesse plano, uma peça no nominal
exato **reprova** — e é isso que a tolerância quer dizer.

**O plano é congelado no ato.** A medida guarda o nominal e os desvios **do dia em que foi feita**.
Editar o plano depois **não reescreve** inspeção antiga — mesma ideia de renomear categoria não
reclassificar o acervo.

### Roteiro de teste manual (10 minutos)

**Metade deste roteiro não é clique, e isso é honesto:** os passos 1 e 2 confirmam pela tela que
nada quebrou; os passos 3 a 6 exercitam a etapa pela API, porque **é onde ela está**; o passo 7
volta para a tela, na Auditoria.

**Faça o roteiro como Administrador.** Os passos 2 e 7 abrem a tela de Auditoria, que exige a
permissão *Configurar o módulo* — só do Administrador. O passo 3 (cadastrar a característica)
aceita também **Qualidade** e **Engenharia**; se quiser conferir isso, refaça só ele com um
usuário desses perfis.

Para os passos de API você precisa do token da sua sessão: abra o sistema logado, tecle `F12` →
aba **Rede**, clique em qualquer tela do almoxarifado e copie o cabeçalho `Authorization` de uma
requisição. Nos comandos abaixo ele é `$TOKEN`.

1. **Almoxarifado → Inspeções.** A tela abre igual: fila de pendentes, botões *Bloquear Material* e
   *Desbloquear Material* no topo. Abra o formulário de decisão de qualquer item retido: as cinco
   caixas de "problemas identificados" estão lá, **Divergência dimensional** entre elas, clicável.
   **É a confirmação de que a etapa não mexeu em nada do que já funcionava.** Feche sem salvar.
2. **Almoxarifado → Auditoria → filtro Entidade.** Role a lista de entidades: **"Plano de inspeção"
   ainda não aparece**, porque o filtro só oferece o que já foi gravado alguma vez. Volte aqui no
   passo 7.
3. **Cadastre uma característica** (precisa de perfil **Administrador**, **Qualidade** ou
   **Engenharia** — os outros tomam recusa). Pegue o `id` de um material qualquer em
   Almoxarifado → Materiais e rode:
   ```
   curl -X POST http://localhost:5000/api/almoxarifado/planos-inspecao \
     -H "Authorization: $TOKEN" -H "Content-Type: application/json" \
     -d '{"material_id": 1, "caracteristica": "Diâmetro externo", "unidade": "mm",
          "valor_nominal": 25, "desvio_inferior": 0.005, "desvio_superior": 0.021}'
   ```
   Responde **201** com o `id` da característica. Rode o **mesmo comando de novo**: recusa com
   *"Já existe esta característica no plano deste material"*.
   Tente com os desvios trocados (`"desvio_inferior": 0.021, "desvio_superior": 0.005`): recusa com
   *"O desvio inferior não pode ser maior que o superior"*.
4. **Confira que a característica está no plano do material** — é a leitura que a futura tela vai
   fazer:
   ```
   curl "http://localhost:5000/api/almoxarifado/planos-inspecao?material_id=1" -H "Authorization: $TOKEN"
   ```
   Sem o `material_id`, recusa com *"Material é obrigatório"*.
5. **Deixe um item retido para inspecionar:** Almoxarifado → Recebimentos → novo recebimento do
   **mesmo material** (ele precisa estar marcado como **crítico** e a retenção de material crítico
   precisa estar ligada em Configurações) → aprovar. Ele aparece em **Inspeções → Pendentes**.
   Anote o **id do item** (ele vem na fila; ou use `GET /api/almoxarifado/inspecoes/pendentes`).
6. **Decida a inspeção mandando a medida, e NENHUMA caixa marcada.** Com o plano `+0,005/+0,021`
   sobre nominal 25, a faixa é `[25,005 ; 25,021]` — mande `24.998`, que está fora:
   ```
   curl -X POST http://localhost:5000/api/almoxarifado/recebimentos/itens/<ID_DO_ITEM>/inspecionar \
     -H "Authorization: $TOKEN" -H "Content-Type: application/json" \
     -d '{"quantidade_aprovada": 12, "quantidade_reprovada": 0,
          "medidas": [{"plano_id": <ID_DA_CARACTERISTICA>, "valor_medido": 24.998}]}'
   ```
   A resposta traz **`"divergencia_dimensional": 1`** e `"medidas_registradas": 1` — **sem que você
   tenha marcado nada**. É o cenário central da etapa.
   **Três variações que valem 30 segundos cada:**
   - troque a medida por `25.01` (dentro da faixa) e mande `"divergencia_dimensional": 1` junto:
     o resultado volta **0** — a medida vence a marcação manual;
   - troque a medida por `"24,998"` (com **vírgula**): recusa com *"Valor medido inválido para
     "Diâmetro externo": informe um número (use ponto decimal)"*, e **nada** é gravado;
   - acrescente `"ferramenta_id"` de um instrumento que exige calibração e está vencido: recusa com
     *"Ferramenta com calibração vencida ou sem calibração registrada (⟨nome⟩)"*.
     **Em todos os três casos de recusa, volte à tela de Inspeções: o item continua na fila, com a
     quantidade retida intacta.** Nenhuma recusa mexe no saldo — isso foi construído de propósito.
7. **Almoxarifado → Auditoria → Entidade = "Plano de inspeção".** Agora a opção **existe** no
   filtro, e a linha da **Criação** está lá, com o seu nome e o de/para. Se você editar a
   característica (`PUT /planos-inspecao/<id>`), a **Edição** aparece com o nominal antigo → novo.
   **E confira o outro lado:** a decisão de inspeção do passo 6 **não** aparece na Auditoria. Ela
   nunca apareceu — é limitação anterior a esta etapa, e está declarada no furo **C36**.

### O que esta etapa NÃO cobre

- **A tela.** Nenhum campo de medida no formulário de inspeção. Furo **C34**.
- **Ler as medidas gravadas.** Elas ficam completas no banco e **não há tela que as mostre** — a
  fila de Inspeções só traz o que ainda não foi decidido, e rever uma inspeção concluída já não
  tinha caminho no produto. Furo **C35**.
- **Plano por família.** É por material; herdar da família é a decisão **B59**.
- **Informar o instrumento é opcional** — decisão **B61**, com o caminho de volta escrito.
- **Não conformidade formal**, **liberação sob desvio autorizado**, **anexos** (relatório
  dimensional, fotos) e **encaminhamento com status** continuam em aberto na inspeção.
- **Reprovar por lote continua não ligado à inspeção** — pendência antiga, não tocada aqui.
- **Nenhum plano foi cadastrado.** As duas tabelas nascem vazias.

---

## Correção — a posição por cliente não fechava a conta (2026-08-13)

> Também **não é uma etapa**: é um defeito de leitura descoberto durante a Etapa 8c e corrigido na
> hora. Afeta a tela **Almoxarifado → Materiais de Clientes → Posição** e o PDF dela.

**O que estava acontecendo.** A posição por cliente mostra quatro números por material: **recebido,
consumido, devolvido e saldo**. Eles vêm do histórico de movimentações — mas a lista de "o que conta
como recebimento" e "o que conta como consumo" estava **desatualizada** em relação ao resto do
sistema. Três tipos de lançamento criados nas etapas mais recentes não estavam nela:

- **peça que voltou transformada** do terceiro (a chapa que foi cortada e virou peça);
- **material consumido no processo do terceiro**;
- **material perdido no terceiro**.

Resultado: o material aparecia com **saldo, mas recebido zero** ("de onde saiu isso?"), ou **sumia do
saldo sem aparecer em consumido** ("para onde foi isso?"). Em nenhum dos dois casos havia coluna onde
procurar a diferença — a conta **recebido − consumido − devolvido = saldo** simplesmente não fechava.

| | Antes | Agora |
|---|---|---|
| Peça que voltou cortada do terceiro | Saldo 40, **recebido 0** | Saldo 40, **recebido 40** |
| Chapa consumida no processo do terceiro | Saldo caía, **consumido continuava 0** | Entra em **consumido** |
| Chapa perdida no terceiro | Saldo caía, **sem registro visível** | Entra em **consumido** |
| Material devolvido ao cliente | Aparece em **devolvido** | **Sem mudança** — continua só em devolvido |

**Por que a devolução continua separada.** Ela tem coluna própria, e você precisa distinguir "quanto
virou peça" de "quanto voltou pro cliente". Perda e consumo no terceiro **não têm** coluna própria —
por isso eles precisam entrar em "consumido", senão ficam invisíveis. Se a GMP quiser **perda no
terceiro numa coluna separada** na tela do cliente, isso é pedido novo, não defeito: diga e a coluna
é criada.

**Roteiro de teste (precisa de uma remessa a terceiros já usada):**
1. **Almoxarifado → Materiais de Clientes → Posição**, escolha o cliente. Anote os quatro números de
   um material.
2. Confira **na mão**: `recebido − consumido − devolvido` tem de dar exatamente o **saldo**. Se um
   material tiver histórico de remessa a terceiro, é justamente ele que antes não fechava.
3. Se o cliente tem peça vinda de **transformação** (Etapa 8c), procure a linha da peça: ela tem de
   ter **recebido igual ao saldo**, e não zero.
4. Abra o **PDF** da posição e confira que os mesmos números aparecem lá.

**O que esta correção NÃO faz:**
- **Não muda nenhum saldo, nem lança nada.** O histórico sempre esteve certo; só a **leitura** que
  monta a tela estava incompleta. Nada a rodar em produção.
- **Não cria coluna nova** para perda no terceiro (ver acima) nem valoriza a posição por cliente em
  R$ — o PDF continua trazendo **quantidades, não valores**.
- **Não mexe nas aplicações por OS/projeto** da mesma tela: perda e consumo no terceiro não têm
  OS/projeto, então continuam fora daquela lista, como todo lançamento sem vínculo.

---

## Correção — o valor do estoque aparecia ZERADO nos relatórios (2026-08-13)

> Isto **não é uma etapa**: é um defeito de leitura descoberto durante a Etapa 8c e corrigido na
> hora. Está aqui porque muda um número que você olha.

**O que estava acontecendo.** O cadastro do material tem um campo de custo. O sistema também mantém
um **custo médio**, que só passa a existir depois que o material entra por uma nota fiscal com
valor. Nos relatórios, o sistema tentava usar o custo médio "ou, se não houver, o do cadastro" — mas
a conta estava escrita de um jeito que, para material que **nunca recebeu nota fiscal**, entendia o
custo médio como "existe e vale zero" em vez de "não existe". Resultado: **o material valia zero no
relatório**, mesmo com o custo preenchido no cadastro. Como quase todo o acervo é anterior ao
recebimento por NF, isso valia para **quase tudo**.

| | Antes | Agora |
|---|---|---|
| Material com custo só no cadastro (R$ 10), no relatório **"estoque atual"** e na **consulta de estoque** | Valor total **R$ 0,00** | **R$ 10,00 × a quantidade** |
| Card **"Valor em Estoque"** do Dashboard | Somava pelo **custo do cadastro / da última entrada com custo** — **nunca** zerava | Soma pelo **custo médio**, e cai no custo do cadastro quando não há média |
| Rota do relatório de **posição de estoque** | Mesma conta do Dashboard: custo do cadastro, **não** zerava | Mesma conta do Dashboard e do "estoque atual" |
| Dashboard × relatórios | Podiam dar **números diferentes** | Dão o **mesmo** número |

> **⚠️ Correção deste próprio texto, feita no fechamento da Etapa 8c (2026-08-13).** A primeira
> versão desta seção dizia *"Relatório de posição mostrava R$ 0,00"*, mandava conferir em
> *"Almoxarifado → Relatórios → Posição de estoque"* e afirmava que o *custo unitário do item na
> tela de aprovação de requisição* aparecia zerado. **As três afirmações estavam erradas.** Foram
> conferidas abrindo o código no fechamento:
>
> 1. A rota de **posição de estoque** valorava pelo custo do **cadastro** — número que pode divergir
>    da média ponderada, mas que **não era zero** quando o cadastro tinha custo. Quem zerava eram
>    **outras duas** leituras: o relatório **"estoque atual"** e a **consulta de estoque**.
> 2. **Não existe tela de Relatórios no Almoxarifado.** Os dois relatórios acima são **só API** — não
>    há onde clicar. (O próprio "O que esta correção NÃO faz", logo abaixo, já dizia isso: a seção se
>    contradizia.)
> 3. O **valor total da requisição**, que é o número que a tela mostra, vem de outra conta, que **já
>    usava a fórmula certa** e **não mudou**. O custo unitário por item ia zerado na resposta da API,
>    mas **nenhuma tela o exibe**.
>
> **O defeito é real e a correção é real** — o que estava errado era **onde** ele aparecia. O texto
> ficou registrado em vez de apagado porque texto errado apagado em silêncio faz o próximo leitor
> confiar nele de novo.

**Atenção ao número do Dashboard.** Ele **pode mudar** — para melhor. Antes usava o custo do
cadastro; agora usa o custo *médio*, que é o que a aprovação por valor de requisição já usava. Para
material que **nunca recebeu nota com custo** — a maioria hoje — o número é **exatamente o mesmo de
antes**.

**Roteiro de teste (5 minutos, sem depender de dado antigo):**
1. **Almoxarifado → Materiais → Novo material.** Preencha código, nome, unidade e **Custo unitário
   = 10**. Salve. **Não** faça recebimento nenhum.
2. Dê entrada de **5 unidades** por **Almoxarifado → Movimentações → Entrada** (ou ajuste positivo).
3. **Almoxarifado → Dashboard.** O card **"Valor em Estoque"** tem de ter subido **50,00**. Esta é a
   **única** conferência clicável desta correção — as outras duas leituras não têm tela.
4. Para confirmar as duas leituras que zeravam, só pela API: `GET /api/almoxarifado/relatorios/estoque-atual`
   tem de trazer `valor_total = 50` na linha do material. **Antes vinha `0`.**

**O que esta correção NÃO faz:**
- **Não recalcula nada retroativamente.** Não havia o que recalcular: o custo estava sempre certo no
  banco; só a **leitura** estava errada. Nenhum dado foi tocado, nenhuma migração precisa rodar.
- **Não valoriza material de cliente.** Patrimônio de terceiro continua fora de todo total de
  estoque próprio (Etapa 8), e o PDF de posição por cliente continua trazendo **quantidades, não
  valores**.
- **Não cria tela de relatório de valores.** A tela de relatórios continua sendo pendência antiga.

---

## Decisões de negócio (não são pendências)

- **Almoxarifado é área física, não filial.** Os almoxarifados representam áreas de alocação dentro do mesmo site (galpão, mezanino, área externa). O cliente tem uma única filial. Por isso o **saldo de cada material é um só**, somado em todas as áreas — o almoxarifado serve para você *achar onde o item está*, não para manter estoques separados. Uma saída consome o saldo total do material, independente da área em que ele está endereçado. Isso é intencional: se algum dia existir uma segunda filial, a regra muda, mas hoje tratar como dois estoques seria errado.
- **A primeira contagem numa prateleira REDEFINE o saldo do material (decidido em 2026-08-09).**
  Hoje praticamente todo o estoque tem saldo no sistema e **nenhum endereço registrado**. Quando
  você conta esse material pela primeira vez numa localização e lança o ajuste, o sistema entende
  que *"nesta prateleira tem 40"* significa **o material tem 40** — não 140. A partir daí, o total
  do material passa a ser a soma do que está endereçado. É o comportamento correto para inventário
  inicial, e é o que faz o endereçamento valer alguma coisa: se a contagem apenas somasse, o saldo
  antigo sem endereço nunca sumiria. **Ressalva importante:** essa regra vale enquanto o material
  ainda não tiver *nenhuma* linha de saldo registrada. Depois que um ajuste global já criou uma
  linha "sem endereço", contar uma prateleira **soma** em vez de redefinir — ver a pendência sobre
  isso logo abaixo, que está esperando decisão sua.

---

## Pendências conhecidas (sem tela ainda)

- Consulta de "posições vazias" e "materiais sem endereço": a API já existe, mas não há tela para usá-la.
- Criar subfamílias: só via API, sem formulário na interface.
- Reservas de estoque: **completo na Etapa 4** — backend, tela (Almoxarifado → Reservas) e as duas rotas que escapavam do hold (liberação por valor e exclusão de requisição). Sem pendência.
- Anexos na requisição (desenho/documento) e assinatura digital na retirada: ainda não implementados.
- Importar itens de uma lista técnica ou ordem de produção na requisição: ainda não implementado (depende da integração com Engenharia/Produção).
- Registrar lote/série entregue por item na requisição: ainda não implementado. O controle de lotes
  e o de série passaram a existir (Etapas 6 e 6b), mas a **entrega da requisição** ainda não
  pergunta de qual lote/série saiu — mesma isenção declarada para os dois.
- **Lotes: completo na Etapa 6 + Task 9** — motor, recebimento, saída, e a tela **Almoxarifado →
  Lotes** (mudar status, liberar vencimento, anexar e agora **abrir** o certificado). Falta o
  "extrato do lote" (histórico agregado numa tela só) — ver "O que a Task 9 não cobre", acima.
- **Série: completo na Etapa 6b** — motor, recebimento, saída e a aba **Séries** dentro de "Lotes e
  Séries" (bloquear/desbloquear com justificativa). Falta reserva por série e reprovação por série
  via inspeção — ver "O que a Etapa 6b não cobre", na seção da etapa, acima.
- **Etiquetas: completo na Etapa 6c** — PDF com QR Code em Recebimentos, Lotes e Séries e
  Materiais, formato A4 e térmica. Falta confirmar a impressora física do galpão com o cliente, e
  a etiqueta de retalho (aguarda a feature 15 ganhar tela) — ver "O que a Etapa 6c não cobre", na
  seção da etapa, acima.
- **Lote na entrega de requisição (atualizado em 2026-08-12 — a metade da devolução foi resolvida).**
  Até 2026-08-10 o sistema exigia lote em **quatro** operações que não têm campo de lote — e o
  efeito era que material com "Controle por lote" ligado **não podia ser entregue nem devolvido**,
  com a reserva da requisição presa segurando saldo. A exigência foi retirada dos quatro. **A Etapa
  7 devolveu a exigência a dois deles, agora com onde informar o lote:** a devolução para
  estoque/quarentena e a sucata de devolução **herdam o lote da entrega** (ou usam o seletor da tela
  de Devoluções, na devolução avulsa). **Sobram duas**, e continuam sem campo de lote: **entrega de
  requisição** e **exclusão de requisição (estorno)**. O pendente nelas é preencher o lote sozinho —
  o que vence primeiro (FEFO) na entrega, e o lote de origem no estorno.
- **⚠️ Decisão de negócio esperando você (3): Ajuste de inventário não acerta o "bloqueado"
  (novo, 2026-08-12).** Material com 8 unidades bloqueadas e um Ajuste levando o total para 1 fica
  com bloqueado maior que o total — **Disponível negativo, sem nenhum aviso**. Ver a seção da Etapa
  7, em "Pendências que a Etapa 7 levantou", com as três respostas possíveis. Enquanto não houver
  decisão: **resolva a quarentena antes de lançar um ajuste que reduz o total**.
- **Reprovar na inspeção não marca o lote.** A tela de Inspeções continua bloqueando o **material
  inteiro**, não o lote específico. Reprovar 10 unidades de um lote de 100 bloqueia 10 do material —
  o lote em si continua "Ativo" e sai normalmente. Ligar as duas coisas é mudança na tela de
  Inspeções, não no controle de lotes, e ficou de fora da Etapa 6 de propósito.
- **⚠️ Decisão de negócio esperando você (1): contagem de prateleira depois de um ajuste global.**
  A regra "a primeira contagem redefine o saldo" (ver Decisões de negócio acima) vale quando o
  material nunca teve contagem. Mas se você fizer um **ajuste global de 100** (sem escolher
  localização) e depois **contar 40 numa prateleira**, o resultado é **140**, não 40 — porque os 100
  continuam registrados "sem endereço" e a soma inclui os dois. Qual dos dois é o certo é pergunta
  de negócio, não técnica: *"100 sem endereço + 40 na prateleira A" é um material com 140 espalhado,
  ou um material com 40 que acabou de ser inventariado?* Nada foi mudado até você decidir.
- **⚠️ Decisão de negócio esperando você (2): certificado de fornecedor acessível sem login.** Os
  arquivos enviados no módulo (fotos de material e, desde a Etapa 6, **certificados de fornecedor**)
  ficam numa pasta servida diretamente pelo servidor, **fora da verificação de login**. Quem souber
  o endereço do arquivo consegue baixá-lo sem estar autenticado. **Não é uma regressão da Etapa 6**
  — é o mesmo tratamento que as fotos de material já tinham desde sempre —, mas certificado é
  documento bem mais sensível que foto de prateleira. Se você quiser que passe a exigir login, é uma
  mudança pequena e isolada.
- **Ajuste de inventário homologado pode "evaporar".** Concluir uma conferência de estoque com
  "aplicar ajustes" grava o total do material por um caminho antigo, que **não atualiza o saldo por
  prateleira**. Se depois disso você contar uma prateleira, o sistema recalcula o total a partir das
  prateleiras — e o número homologado no inventário se perde. **É anterior à Etapa 6** (não foi ela
  que causou), e o conserto é rotear a conclusão da conferência pelo mesmo motor que todo o resto
  usa. Enquanto isso não for feito, evite intercalar "concluir conferência com ajustes" e "contagem
  por localização" no mesmo material.
- **⚠️ A conferência de inventário escapa da permissão de material de cliente (novo, 2026-08-12).**
  Mesmo caminho antigo do item acima, agora com uma consequência a mais: como "aplicar ajustes"
  grava o saldo **fora do motor**, ele também fica **fora** da permissão
  `ajustar_material_cliente` criada na Etapa 8. **Um usuário barrado de ajustar a chapa do cliente
  pela tela de Movimentações consegue mudar o mesmo saldo pela conferência de inventário** — sem a
  autorização especial e sem a auditoria que nomeia o cliente. Os dois problemas se resolvem pelo
  mesmo conserto (rotear a conclusão da conferência pelo motor). Detalhes e o que fazer enquanto
  isso: seção da Etapa 8, em "O que fazer ANTES de subir para produção".
- Regras de aprovação configuráveis (por tipo de material, valor, quantidade, projeto, urgência) com tela própria: hoje as regras (segregação do solicitante + limite por valor) são fixas no código — sem tela de configuração.
- Encerramento não dispara e-mail de resumo.
- **Inspeção/quarentena: completo na Etapa 5** para o que estava no escopo — quarentena real na
  entrada, decisão de inspeção (aprovar/reprovar/parcial), bloqueio/desbloqueio avulso, tela
  própria. Pendência que a etapa **cria** (não é falta de implementação, é consequência): material
  reprovado na inspeção fica **bloqueado até alguém desbloquear manualmente e lançar a saída à
  parte** — não existe hoje nenhuma devolução automática ao fornecedor vinculada ao recebimento de
  origem. O campo "encaminhamento" (Devolver/Engenharia/Substituição) registrado na reprovação é
  só uma anotação de intenção; quem vai efetivamente *usar* essa anotação para gerar a devolução é
  uma etapa futura (Devoluções).
- Estornar uma movimentação de quarentena/inspeção (tipos `QUARENTENA`, `LIBERACAO_INSPECAO`,
  `REPROVACAO_INSPECAO`, `DECISAO_INSPECAO`) não desfaz o efeito no saldo retido/bloqueado — o
  botão de estornar aparece habilitado para essas linhas no livro de movimentações, mas hoje só
  marca a linha original como cancelada, sem devolver `quantidade_em_inspecao`/
  `quantidade_bloqueada`. Mesma limitação que já existia para outros tipos de movimentação
  especiais antes da Etapa 4. Evite estornar essas linhas até isso ser corrigido.
