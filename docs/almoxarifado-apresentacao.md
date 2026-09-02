# Almoxarifado — roteiro de apresentação (Etapa 0 até a 29)

Roteiro pra apresentar o módulo do zero até onde paramos, na ordem em que foi feito.
Cada etapa diz o que mudou e em qual tela mostrar. Feito de 02/08 a 30/08/2026, na branch
`desenvolvimento-almoxarifado`. Versão resumida do `almoxarifado-novidades-por-etapa.md` —
lá tem o detalhe de cada regra, mensagem de erro e pendência.

## Etapa 0 — Fundação

Não tem nada pra clicar aqui. Foi a base técnica: criei os testes automáticos de API do módulo,
centralizei o schema do banco e fiz toda movimentação de estoque passar por um motor único, com
motivo obrigatório em saída e ajuste. Sem isso o resto não se sustentava.

## Etapa 1 — Motor de Estoque

**Onde está: Movimentações e no Extrato do material.**
O "Disponível" agora desconta o que está reservado, bloqueado e em inspeção — antes era só o
saldo bruto. Movimentação errada não se apaga mais: se estorna, e a linha original fica marcada
"ESTORNADA". Entrou a saída emergencial (libera com justificativa e fica pendente de
regularização) e cada material ganhou um extrato com saldos, custo médio e as últimas
movimentações.

## Etapa 2 — Cadastros Completos

**Onde está: Materiais, Localizações e no Mapa de Localizações.**
Agora dá pra ter vários almoxarifados (áreas físicas do mesmo site — o saldo continua único por
material, de propósito). Localização pode ser bloqueada ou restrita a certos tipos de material,
e o sistema recusa movimentação que contraria isso. A ficha do material virou um formulário
completo em 6 seções, e toda edição de material fica auditada com o de-para dos valores.

## Etapa 3 — Requisições Ponta a Ponta

**Onde está: Requisições.**
O ciclo fechou inteiro: rascunho → envio → aprovação → entrega → o próprio solicitante confirma
o recebimento. Quem pediu não aprova a própria requisição, rejeição exige motivo, e entraram os
campos de tipo (14 opções), centro de custo e local de entrega. Tem também o "Copiar como Novo
Rascunho" pra repetir pedido antigo.

## Etapa 4 — Reservas de Estoque

**Onde está: Reservas (tela nova).**
Aprovar uma requisição agora reserva o material automaticamente, e a entrega consome a reserva —
acabou a corrida de alguém consumir o saldo entre a aprovação e a entrega. Na tela dá pra fazer
reserva manual, liberar parcial com motivo e transferir reserva entre projetos. Cancelar a
requisição devolve o saldo pro disponível.

## Etapa 5 — Quarentena e Qualidade

**Onde está: Inspeções (tela nova).**
Material crítico parou de travar o recebimento: ele entra retido (fora do disponível) até alguém
decidir. A tela lista tudo que aguarda inspeção, aceita aprovação parcial (recebeu 100, aprova
90 e reprova 10), e reprovar exige observação e encaminhamento. Também dá pra bloquear e
desbloquear material achado com defeito na prateleira, sempre com justificativa.

## Etapa 6 — Lotes de Verdade

**Onde está: Recebimento (campos de lote), na saída em Movimentações e na tela Lotes.**
Lote deixou de ser texto ignorado e virou entidade com saldo, validade e status. Na saída o
sistema lista os lotes com saldo e sugere o que vence primeiro (FEFO); tirar mais do que o lote
tem é recusado. Lote vencido não sai pra consumo normal, e material que exige certificado nasce
bloqueado até anexar o certificado do fornecedor.

## Etapa 6b — Números de Série

**Onde está: Lotes e Séries (aba nova) e nos formulários de entrada/saída.**
A flag "controle por série" que existia mas não fazia nada agora funciona: entrada exige digitar
(ou gerar) um número por unidade, saída exige marcar quais séries saem, e cada peça física fica
rastreada com status, lote e localização. Dá pra bloquear uma série específica com justificativa.

## Etapa 6c — Etiquetas com QR Code

**Onde está: a nota processada no Recebimento e os ícones de etiqueta em Lotes e Séries.**
Etiqueta em PDF pra lote, série e material, em folha A4 (10 por página) ou térmica 100×50. O QR
abre o sistema direto na tela certa, com a linha destacada — vale a pena ler um com o celular na
apresentação.

## Etapa 7 — Transferências e Devoluções

**Onde está: Movimentações (tipo Transferência) e Devoluções (tela nova).**
Transferir material entre prateleiras e devolver material do chão de fábrica só existiam por API
— ninguém conseguia usar. Agora a transferência é um tipo do formulário (origem + destino +
lote) e a devolução tem tela própria: escolhe a entrega original e devolve limitado ao que ainda
resta, com a condição sugerindo o destino (boa → estoque, suspeita → quarentena, danificada →
sucata). De quebra achei e corrigi um bug que baixava o estoque duas vezes na devolução pra
sucata.

## Etapa 8 — Materiais de Clientes

**Onde está: a ficha do material (seção Propriedade) e Materiais de Clientes (tela nova).**
A chapa que o cliente manda pra industrializar virou material de verdade, com dono. Ela ganha um
selo com o nome do cliente nas telas, só sai com OS ou projeto daquele cliente (aplicar chapa do
cliente A no trabalho do B é recusado nomeando os dois), e fica fora de todos os números do
nosso estoque — valor total, reposição, sugestão de compra. A tela nova mostra a posição por
cliente com PDF e o botão de devolver ao cliente.

## Etapa 8b — Remessas a Terceiros

**Onde está: Remessas a Terceiros (tela nova).**
Material que vai galvanizar, pintar ou tratar fora parou de sumir do controle: sai do disponível
sem sair do patrimônio, com terceiro, prazo e PDF de remessa com linhas de assinatura. Aceita
retorno parcial, marca remessa vencida, e encerrar com saldo lá fora exige dizer o destino
(perda ou consumo) com justificativa. O inventário já desconta o que está no terceiro.

## Etapa 8c — Transformação no Terceiro

**Onde está: o botão Transformar dentro da remessa.**
A metade que faltava: a chapa que sai pra corte e volta como 40 peças e uma sobra. A chapa é
baixada de verdade, as peças entram com o custo dela rateado (mais a nota do cortador, se
informar), a sobra entra a custo zero e o sistema mostra o rendimento por peso. Peça de chapa de
cliente continua sendo do cliente — trocar o dono é recusado.

## Etapa 9 — Retalhos, Sobras e Sucatas

**Onde está: Sobras e Retalhos (tela nova, duas abas).**
A meia chapa que sobra do corte virou estoque de verdade: com saldo, ficha dimensional, etiqueta
com QR, e um aviso na saída sugerindo usar o retalho antes de cortar chapa nova. E sucatear
deixou de ser um clique: o tipo Sucata sumiu do formulário de Movimentações e virou processo com
duas assinaturas de pessoas diferentes (almoxarifado + gestão), destino registrado (vendida com
valor e comprovante, ou descartada) e relatório financeiro.

## Etapa 9b — Ferramentas e Calibração

**Onde está: Ferramentas (tela nova, três abas).**
Ferramenta virou patrimônio controlado: empréstimo à prova de dois cliques simultâneos,
calibração vencida bloqueia o empréstimo, avaria ou perda com foto fecha o empréstimo sozinha, e
bloqueio e manutenção ficam com histórico. Tudo auditado, com permissão própria separada da de
estoque.

## Etapa 10 — Inventário Avançado

**Onde está: Conferência de Estoque.**
O ajuste da conferência era o único lugar que gravava saldo por fora do sistema — agora é
movimentação de verdade, auditada, e o sistema recusa ajuste que deixaria material
bloqueado/reservado/em terceiro com número que não fecha. Entraram a contagem cega (quem conta
não vê o saldo do sistema), a recontagem obrigatória pra divergência grande e a justificativa
obrigatória do ajuste.

## Etapa 10b — Inventário Avançado, parte 2

**Onde está: Conferência de Estoque (Nova Conferência e o botão Acuracidade).**
Agora dá pra contar por escopo: só a classe A, só os críticos, só material de cliente, só o que
tem parte em terceiro. A dupla contagem exige outra pessoa — e ela conta sem ver o número do
colega. Cada item registra quem contou e quem recontou, e o botão Acuracidade mostra o resultado
por conferência com o impacto em reais.

## Etapa 11 — Reposição e Compras

**Onde está: Reposição e Compras (tela nova).**
A primeira tela pensada pra quem decide compra. Sugestão calculada de quanto pedir (consumo
médio × prazo do fornecedor, com a mínima como chão), consolidada e valorada; o botão Gerar
cria as solicitações auditadas; material já pedido some da sugestão. E a aba Estoque Parado
mostra excesso, sem consumo e obsoleto, com o valor parado em reais.

## Etapa 12 — Notificações Completas

**Onde está: Notificações (tela nova, Gestor/Admin).**
Central de avisos por e-mail com fila: retentativa automática quando o servidor de e-mail falha,
histórico do que saiu e pra quem, e reenvio com um clique. Entraram alertas de estoque zerado,
lote vencendo e remessa vencida, e o e-mail de movimentação por classes — que nasce desligado,
ligar é decisão nossa.

## Etapa 13 — Relatórios e Indicadores

**Onde está: Relatórios (tela nova) e os 3 cartões novos do painel inicial.**
O servidor tinha 17 relatórios prontos e nenhuma tela — agora tem menu por assunto, cada perfil
vê só o que pode, tudo exporta pra Excel com colunas curadas, e a régua de cada relatório está
escrita no rodapé. Nasceram os indicadores gerenciais: giro, cobertura em dias, rupturas, valor
por grupo e tempo de atendimento.

## Etapa 14 — Integrações: o ciclo da compra fecha

**Onde está: Reposição e Compras (Cancelar e Ver contexto) e Relatórios → Custo por projeto.**
A solicitação de compra agora morre: a nota fiscal do pedido vinculado fecha ela sozinha
(RECEBIDA, com auditoria), e cancelar existe, com justificativa gravada. Quem decide compra
ganhou o painel de contexto por material (disponível, consumo médio, último custo pago,
solicitações abertas) e o relatório Custo por projeto, com devolução abatendo.

## Etapa 15 — Mobilidade: scanner, assinatura e o balcão no celular

**Onde está: Scanner (tela nova) e a entrega de Requisições.**
A volta do QR Code não existia: etiqueta impressa dependia do app de câmera do celular, fora
do sistema. Agora a tela Scanner lê a etiqueta e abre o item certo (lote, série, material ou
retalho) já filtrado — e recusa QR de fora do módulo, nunca navega para ele. A entrega de
requisição ganhou assinatura do recebedor na tela (nome + traço a dedo, opcional, nunca trava
a entrega). E as tabelas pararam de esconder colunas — inclusive os botões de ação — a partir
da 4ª no celular: quem operava pelo aparelho no galpão finalmente consegue agir.

## Etapa 16 — Alertas operacionais: o sistema passa a avisar

**Onde está: Alertas (tela nova).**
Sete fatos que o banco já sabia e ninguém via viraram alerta: calibração vencendo, estoque
sem consumo, estoque excessivo, quarentena parada, material sem endereço, requisição atrasada
e reserva parada — somando aos 6 que já existiam. A central mostra o total ao vivo (some da
tela assim que a condição se resolve) e a mesma lista dispara e-mail pela fila de
notificações, sem repetir aviso à toa. Perfil sem acesso vê recusa explícita, nunca uma
central vazia fingindo que não há nada.

## Etapa 17 — Os avisos que nascem no ato

**Onde está: por baixo da Central de Alertas — reprovar inspeção, registrar nota, concluir conferência.**
A Etapa 16 varre o estoque todo dia; esta avisa na hora do fato. Reprovar material numa
inspeção, gravar quantidade diferente da esperada numa nota, e concluir conferência com
divergência passam a mandar e-mail no ato, não no dia seguinte — chegando a 17 alertas. Entra
também um alerta de vigília: lote que exige certificado e está parado sem ele, num resumo
mensal. Falha no envio nunca trava a operação.

## Etapa 18 — O inventário passa a deixar rastro

**Onde está: por baixo da Conferência de Estoque (tela de leitura só chegou na Etapa 22).**
Abrir conferência, contar, recontar, concluir e — o pior caso — cancelar não deixavam
registro nenhum: uma conferência com 300 contagens podia sumir com um clique, sem autor nem
motivo. Agora cada um desses atos grava quem, quando e o de/para, cancelar exige motivo
escrito (mínimo 5 caracteres) e só vale em conferência em andamento. De quebra, desativar
material, cancelar e excluir requisição também passaram a auditar.

## Etapa 19 — Mudar cadastro e mudar regra passam a deixar rastro

**Onde está: por baixo dos Cadastros e Configurações Gerais (tela de leitura só chegou na Etapa 22).**
Vinte e três operações que mudam o comportamento do sistema — criar/editar/excluir tipos,
localizações, setores, famílias, centros de custo, almoxarifados; mudar as configurações
gerais (tolerância de inventário, alertas, alçada por valor); mexer na lista de materiais que
cada setor pode requisitar — passaram a registrar quem, quando e o de/para. Senha de SMTP e
chave de API nunca entram no histórico, só `(alterado)`. A configuração grava **só o campo
que mudou de fato**, não os 18 campos que a tela sempre manda.

## Etapa 20 — O sistema para de mentir sucesso e de falar demais

**Onde está: por baixo — foto de material, Configurações Gerais e o mapa de acesso por setor.**
Sem tela nova, três buracos de segurança fechados de uma vez: trocar foto de um material
inexistente respondia sucesso (e deixava a imagem órfã no servidor) — agora responde
"Material não encontrado" e não deixa lixo. As Configurações Gerais devolviam a senha de SMTP
e a chave de API do WhatsApp em texto puro para quem lesse — agora devolvem `********` ou
vazio. E o mapa de materiais liberados por setor podia ser lido por qualquer usuário logado —
agora exige o mesmo perfil que já era exigido para mudá-lo.

## Etapa 21 — O backup do sistema parava de guardar segredo

**Onde está: fora do módulo — Configurações do Sistema → Email, e o endereço de backup do servidor.**
Primeira etapa fora do Almoxarifado: o zip de backup do CRM levava a pasta de dados inteira —
inclusive o arquivo em que o servidor guarda a chave de assinatura dos crachás de login. Quem
baixasse o backup conseguia fabricar um crachá de super administrador. Corrigido: o zip não
leva mais esse arquivo, leva só a cópia de banco mais recente (não as 188 MB de cópias
antigas), e toda tentativa de baixar fica logada. A senha de e-mail do sistema, escrita no
código desde 17/03/2026, ganhou variável de ambiente como fonte preferida, e a tela de
Configurações parou de devolver a senha em texto puro. **Pendência do André**: rotacionar a
senha do SMTP na Locaweb — nenhum código faz isso por você (letra A, item A3).

## Etapa 22 — A trilha de auditoria ganha uma tela

**Onde está: Auditoria (tela nova, menu Almoxarifado).**
Três etapas (18, 19, 20) fizeram o sistema anotar quem mexeu em quê, e ninguém tinha como
ler — só consultando o banco por fora. Agora existe **Almoxarifado → Auditoria**: filtro por
tipo de coisa, ação, pessoa e período, cada linha expande e mostra o de/para campo a campo.
Data inválida (30 de fevereiro) e período invertido são recusados com erro explícito, nunca
lista vazia fingindo que nada aconteceu. De quebra, os três índices que faltavam na tabela do
histórico foram criados — sem eles, filtrar por data ia piorando a cada mês.

## Etapa 23 — O histórico para de mentir por omissão e por excesso

**Onde está: por baixo da tela de Auditoria — sem tela nova.**
A tela da Etapa 22 revelou dois defeitos que só apareciam ao ler a trilha de verdade: salvar
Configurações gravava campo a campo, e uma falha no meio deixava parte gravada **sem nenhuma
linha no histórico**; e excluir (inativar) um item já inativo gravava outra linha de
"Exclusão" fingindo um segundo ato que não aconteceu. Os 18 campos das Configurações agora vão
juntos ou nenhum vai, e clicar Excluir duas vezes no mesmo item gera **uma** linha só na
Auditoria, não duas.

## Etapa 24 — A Qualidade ganha perfil, e a tela que decide acesso para de mentir

**Onde está: Configurações → aba Perfis de Acesso.**
Quem inspeciona material na GMP não tinha perfil — dependia do almoxarifado decidir por ela.
Nasce o perfil **Qualidade**: consulta e decide inspeção, e nada além disso (não movimenta
estoque, não cadastra material). Na mesma tela, três correções: retirar perfil de alguém
passou a deixar rastro na Auditoria (antes era invisível), conceder perfil passou a mostrar o
"de → para", e a opção "Administrador" — que dava poder de promover gente e evaporava sozinha
no próximo salvamento do cadastro — saiu da lista.

## Etapa 25 — De onde veio cada movimento, e o backup que parou de crescer sozinho

**Onde está: Auditoria (campos ip/user_agent) e Configurações → aba Backup.**
O histórico de movimentação dizia quem e quando, nunca de onde. Agora cada movimentação —
inclusive as 28 geradas por dentro do sistema (devolução, estorno, retorno de terceiro) —
guarda o endereço de rede real de quem clicou (não o do servidor, mesmo atrás de proxy) e o
aparelho usado. E o campo "Manter Backups (dias)" da tela de Configurações, que era
decorativo, passou a valer: a limpeza no arranque do servidor recolhe cópias antigas e os
arquivos órfãos que ninguém apagava (eram 132 arquivos, 44 MB), sempre guardando entre 3 e 10
cópias.

## Etapa 26 — Uma lista de categorias só, e ela é da GMP

**Onde está: Configurações → aba Categorias, e o campo Categoria no cadastro de Material.**
A lista de categorias de material era genérica (CONSUMÍVEL, FERRAMENTA, EPI…) e escrita no
código em três telas — enquanto um catálogo de 27 categorias de metalúrgica da GMP (Aço
carbono, Chapas, Rolamentos…) existia intacto no banco, sem uso. Agora as três telas leem o
catálogo da GMP, e ele virou cadastro de verdade: criar, renomear, desativar e reativar
categoria em Configurações, sem programador. Material sem categoria não salva mais sozinho
como "OUTROS" — o sistema exige a escolha. Nenhum material existente foi reclassificado, de
propósito.

## Etapa 27 — A divergência dimensional deixa de ser opinião e vira medição

**Onde está: por baixo — sem tela própria (a Etapa 29 deu a ela um formulário).**
"Divergência dimensional" na inspeção era só uma caixa marcada à mão, sem número por trás.
Esta etapa cria o **plano de inspeção por material**: características a medir, cada uma com
valor nominal e os dois desvios (com sinal) da tolerância. Com plano cadastrado, a divergência
passa a ser **calculada** a partir da medida real, não marcada — e instrumento com calibração
vencida não mede, a inspeção é recusada. Sem plano cadastrado, nada muda: o comportamento
antigo continua valendo material a material.

## Etapa 28 — A separação ganha dono, e quem separou não confere

**Onde está: Requisições (bloco Separação e botão Conferir Separação).**
"Quem separou?" era pergunta sem resposta — a separação gravava as quantidades e nada mais.
Agora cada rodada de separação registra quem, quando e quais itens, e nasce a **segunda
conferência**: outra pessoa do almoxarifado confere a caixa antes de sair, e o sistema recusa
quem apareceu em qualquer rodada daquela requisição. Para material **crítico**, a conferência
deixa de ser opcional — sem ela, nem Liberar para Retirada nem Confirmar Entrega funcionam.
Material comum continua saindo como sempre saiu.

## Etapa 29 — A tela finalmente mede, e a medida finalmente tem quem leia

**Onde está: Inspeções (formulário Decidir Inspeção e a aba Histórico, tela renomeada).**
A Etapa 27 construiu a régua de medição inteira sem tela — quem inspecionava continuava
marcando a caixa no olho. Agora o formulário Decidir Inspeção mostra, quando o material tem
plano cadastrado, um campo por característica com o nominal e a faixa já calculados, mais o
instrumento usado (o vencido aparece na lista, mas travado). A caixa Divergência dimensional
vira somente-leitura assim que uma medida é preenchida — quem manda é o número. E a tela
ganhou a aba **Histórico**: inspeções já decididas, com a contagem de medidas e, ao clicar, a
tabela completa com a tolerância congelada no dia em que foi medida. Material sem plano
cadastrado não vê diferença nenhuma.

