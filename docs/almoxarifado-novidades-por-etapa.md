# Almoxarifado — O que há de novo, etapa por etapa

> **Documento de melhorias do módulo almoxarifado** — consolida tudo que foi entregue da
> Etapa 0 até a **Etapa 21** (02/08/2026 a 28/08/2026), na branch `desenvolvimento-almoxarifado`.
> Cada seção diz o que o usuário vê de novo, o que melhorou por baixo do capô e o
> "antes → agora" da etapa.
>
> **A Etapa 21 é a primeira que NÃO é do módulo almoxarifado** — ela mexe no **núcleo do CRM**
> (backup do sistema, senha do e-mail e a tela de Configurações do Sistema). Ela está aqui, e não
> num documento novo, porque nasceu de um item que a Etapa 20 declarou fora do escopo dizendo "é
> do núcleo" — separá-la faria o laço ficar aberto em dois documentos que ninguém cruza. O título
> deste arquivo continua dizendo "almoxarifado" por causa dos links que já apontam para ele.
>
> Fontes: `docs/almoxarifado-guia-etapas-e-testes.md` (roteiros de teste manual de cada
> etapa), `specs/modulo-almoxarifado/README.md` (status por feature) e os planos em
> `docs/superpowers/plans/`. Atualizado em **2026-08-28 (Etapa 21)**.
>
> *(Este cabeçalho e a tabela abaixo diziam "até a Etapa 14" e "desenvolvimento pausado aqui" —
> **estava desatualizado**: a pausa foi levantada em 28/08 e as Etapas 15 a 20 foram entregues,
> cada uma com seção própria mais abaixo. Corrigido aqui e dito que estava errado, porque quem
> lesse só o topo concluiria que metade do que existe no sistema não existe.)*

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
| 8 | Materiais de Clientes | 2026-08-12 | A chapa do cliente saiu da lista à parte e virou material de verdade, com dono: fora de todo número do nosso estoque, e só sai no trabalho de quem é dela |
| 8b | Remessas a Terceiros | 2026-08-12 | O material que vai beneficiar fora (galvanizar, pintar, usinar) para de sumir do controle: sai do disponível sem sair do patrimônio, com prazo, retorno parcial e baixa justificada do que não voltou |
| 8c | Transformação no Terceiro | 2026-08-13 | A chapa que sai para corte e volta como 40 peças e uma sobra para de mentir no estoque: a chapa é baixada de verdade e as peças entram com o custo dela rateado |
| 9 | Retalhos, Sobras e Sucatas | 2026-08-16 | A meia chapa vira estoque de verdade (com saldo, etiqueta com QR e sugestão de uso antes de cortar chapa nova) — e sucatear deixa de ser um clique: exige duas assinaturas de pessoas diferentes, com destino e valor registrados |
| 9b | Ferramentas e Calibração | 2026-08-22 | Ferramenta virou patrimônio controlado: empréstimo à prova de corrida, calibração vencida bloqueia o uso, avaria/perda com foto fecha o empréstimo sozinha, bloqueio e manutenção com histórico — tudo numa tela própria |
| 10 | Inventário Avançado | 2026-08-22 | O ajuste da conferência de inventário deixou de gravar saldo por fora do sistema — agora é auditado e recusa deixar material bloqueado/reservado/em terceiro com número que não fecha; contagem cega e recontagem obrigatória para divergência grande |
| 10b | Inventário Avançado, parte 2 | 2026-08-23 | Contagem por escopo (classe A, críticos, de clientes, em terceiros), dupla contagem por duas pessoas com o número do colega escondido, autoria por item e relatório de acuracidade com impacto em reais |
| 11 | Reposição e Compras | 2026-08-24 | Sugestão de compra calculada (consumo médio × prazo, mínima como chão), consolidada por fornecedor e valorada; gerar solicitações auditadas; estoque parado (excesso/sem consumo/obsoleto) com valor em reais; tela nova para quem decide compra |
| 12 | Notificações Completas | 2026-08-24 | Fila de e-mails com retentativa, dedupe e histórico; e-mail de movimentação por classes (nasce desligado); três dívidas antigas pagas e três alertas novos; tela Notificações para Gestor/Admin |
| 13 | Relatórios e Indicadores | 2026-08-24 | Tela Relatórios com menu por perfil dirigido pelo servidor, exportação XLSX com colunas curadas, e indicadores gerenciais (giro, cobertura, rupturas, valor por grupo, atendimento) com as réguas escritas |
| 14 | Integrações — o ciclo da compra fecha | 2026-08-25 | A nota fiscal do pedido vinculado fecha a solicitação de compra sozinha; cancelar com justificativa existe (B14 resolvida); painel de contexto por material para quem compra; relatório Custo por projeto com devolução abatendo |
| 15 | Mobilidade | 2026-08-28 | Scanner de QR pela câmera abre o item já filtrado; assinatura do recebedor na entrega de requisição; o módulo passa a caber no celular (nenhuma coluna some mais) |
| 16 | Alertas operacionais | 2026-08-28 | O sistema passa a avisar sozinho: 7 alertas varridos todo dia por e-mail e a tela **Alertas**, que mostra as condições ao vivo |
| 17 | Avisos que nascem no ato | 2026-08-28 | Reprovar inspeção, receber quantidade diferente e concluir contagem com divergência avisam **na hora**; mais o resumo mensal de lotes sem certificado |
| 18 | A trilha do inventário | 2026-08-28 | Abrir, contar, recontar, concluir e cancelar conferência deixam registro; cancelar passa a exigir motivo escrito |
| 19 | Cadastros e configurações deixam rastro | 2026-08-28 | 23 operações que mudavam o comportamento do sistema sem deixar quem/quando passam a registrar, com o de/para e sem nunca gravar segredo |
| 20 | Exposição e rastro | 2026-08-28 | Foto de material para de mentir sucesso e de deixar arquivo órfão (e passa a auditar a troca); senha e chave de API somem da leitura de configurações; ler o mapa de permissões por setor passa a exigir administrador |
| 21 | **Núcleo do CRM:** o backup para de guardar segredo | 2026-08-28 | O zip do backup deixa de levar a chave com que o servidor assina os crachás de login (quem baixasse **virava super administrador**) e as 188 MB de cópias antigas; todo download fica registrado; a senha do e-mail passa a vir do ambiente do servidor; e o campo de Senha SMTP para de devolver a senha em claro e de gravar a máscara por cima dela |
| 22 | A trilha de auditoria ganha uma tela | 2026-08-28 | Três etapas anotaram quem mexeu em quê e **nada disso tinha leitor**; agora há a tela **Auditoria**, com filtro de tipo, ação, pessoa e período, o de/para campo a campo ao expandir a linha, e os três índices que a tabela nunca teve |
| 23 | O histórico para de mentir por omissão e por excesso | 2026-08-28 | **Sem tela nova:** o que muda é a confiança no que a tela da 22 mostra. Salvar configurações virou tudo-ou-nada (falha no meio deixava parte gravada **sem nenhuma linha de histórico**), excluir o que já está inativo parou de virar uma segunda linha de "Exclusão" indistinguível da real, e o mecanismo de "tenta de novo" parou de responder erro e gravar assim mesmo |

Com a 6c, a feature 10 (lotes, séries e etiquetas) ficou **completa por inteiro**; com a 7, as
features 11 (transferências) e 12 (devoluções) também; com a 8, a feature 13 (materiais de
clientes).
**Com a 8c, a feature 14 (materiais enviados a terceiros) fica completa**: a 8b entregou a metade
em que **o mesmo material volta** (galvanizar, pintar, tratar) e a 8c entrega a metade em que
**volta outra coisa** (cortar, dobrar, usinar).
**Com a 9, a feature 15 (retalhos, sobras e sucatas) fica completa** — só o e-mail de
sucateamento ficou de fora, declarado, junto com todos os e-mails do módulo (feature 19).
**Com a 9b, a feature 16 (ferramentas e calibração) fica completa**, com duas melhorias
pendentes declaradas (lembrete de devolução sem canal de notificação, edição de ferramenta pela
tela — ver letra B).
**Com a 10, a feature 17 (inventário avançado) fica parcialmente completa** — o risco crítico
nomeado desde a Etapa 7 (ajuste fora do motor) está resolvido; tipos de contagem avançados,
dupla contagem por duas pessoas e relatório de acuracidade formal ficam declarados fora do
escopo (letra D) — **a 10b entregou boa parte disso** (ver a seção dela).
**Com a 14, a feature 18 (reposição) fecha o ciclo** (solicitação nasce, vincula, fecha no
recebimento ou cancela com justificativa) e a **feature 22 (integrações) fica entregue na fatia
integrável hoje** — Compras de verdade; BOM/OP bloqueados por dependência, com a medição
escrita. **Com a 20, a feature 23 (perfis, segurança e auditoria) paga os três buracos de
exposição que ela mesma tinha nomeado** — ~~resta dela a tela de auditoria (B33)~~ e os itens
declarados nas letras B/C/D. **A tela de auditoria foi entregue na Etapa 22**
(`8c6ffbe..169458d`); o texto riscado ficou à vista de propósito, para quem lembrar da pendência
confirmar que ela fechou e com qual etapa. **A Etapa 24 (`a81e51a..4680daa`) começou a perna
*Perfis* dessa mesma feature** — perfil Qualidade criado e quatro defeitos da tela de atribuição
corrigidos —, e a feature **continua 🟡**: a perna *Segurança* (dispositivo/IP na movimentação,
lançamento retroativo, dupla conferência, retenção de backup) ainda não começou. O desenvolvimento **não está mais pausado** (a pausa valeu entre a
14 e a 15); a próxima frente sai do mapa de status — ver "Onde estamos e o que vem a seguir".
**A Etapa 21 não mexe em feature nenhuma do mapa**: ela é do **núcleo do CRM** e fecha o quarto
item que a Etapa 20 tinha declarado fora do escopo por ser "do núcleo, não do módulo" — o backup
que entregava a chave de assinatura dos logins e a credencial de e-mail escrita no código.

---

## ⚠️ Leia antes de apresentar — tudo o que exige decisão ou ação sua

Consolidado aqui de propósito, para ser revisado de uma vez. Cada item repete, resumido, o que
está detalhado na seção da etapa correspondente e no
`docs/almoxarifado-guia-etapas-e-testes.md` — **esta é a lista curta; lá está o passo a passo.**

### A. Cinco consultas para rodar em produção ANTES do deploy — uma ação no provedor de e-mail, e uma limpeza de disco que roda sozinha

*(Este título dizia "Duas consultas" — **passou a três com a A4, da Etapa 24**, ganhou a
**limpeza de disco A5 na Etapa 25** e **passou a cinco com a A6 e a A7, da Etapa 26**. Corrigido
aqui em vez de deixado defasado, porque a contagem no título é o que faz alguém parar de
procurar.)*

| # | Por quê | Consulta |
|---|---|---|
| **A1** | **O bug da Sucata pode ter deixado saldo a menos.** Devolver material para o destino Sucata baixava o estoque **duas vezes**. A correção **não conserta o passado**. No banco de desenvolvimento a checagem já foi feita: **0 devoluções, nenhum efeito lá**. | Ver a consulta exata no guia, seção "Etapa 7 → O bug da Sucata". Ela lista **só as devoluções anteriores à correção** (as que não têm a entrada correspondente no livro) — cada linha é um material cujo saldo está **a menos** pela quantidade devolvida. Uma consulta que filtrasse só `destino = 'SUCATA'` traria também as devoluções corretas feitas depois do deploy, e faria você caçar problema que não existe. |
| **A2** | **A lista antiga de materiais de cliente foi aposentada** com base no banco de desenvolvimento (0 linhas). **Nada foi apagado** — a tabela foi preservada exatamente para este caso. | `SELECT COUNT(*) AS total, SUM(CASE WHEN ativo = 1 THEN 1 ELSE 0 END) AS ativos FROM materiais_cliente_almoxarifado;` — se vier `0`, só anotar e fechar. Se vier `> 0`, **não reverte nada**: entra uma migração assistida antes de qualquer exclusão. |

**Continuam sendo duas — da 8b até a 12, nenhuma etapa acrescentou consulta.** As etapas de
terceiros, a de retalhos/sucatas e a de ferramentas só **criam** colunas e tabelas novas, que
nascem vazias; **nenhum dado existente é tocado ou reinterpretado** por elas — a Etapa 9b em
particular nem toca o motor de estoque, ferramenta é patrimônio separado. Está dito
explicitamente porque as Etapas 7 e 8 deixaram consultas pendentes e você vai procurar a das
etapas novas. **A Etapa 21 também não acrescenta consulta** — mas acrescenta uma **ação de
operação**, abaixo, que é a única coisa deste conjunto todo que nenhum código resolve.
**A Etapa 24 acrescenta a terceira consulta (A4)** — e pelo motivo oposto ao das anteriores: ela
não corrige dado nenhum, ela **procura um estado que a etapa passou a impedir de ser criado** e
que pode já existir de antes.

**A3 (NOVO, da Etapa 21 — NÃO é consulta, é ação no provedor; e é a mais importante desta lista).
Rotacione a senha do SMTP na Locaweb.** A senha da caixa `solicitacoes@gmp.ind.br` está escrita
dentro do código do sistema e **está no histórico do repositório desde 17/03/2026**. A Etapa 21
tirou a cópia que estava replicada na documentação e fez o sistema preferir o ambiente do
servidor — mas **trocar ou apagar o arquivo não remove a senha de nenhuma cópia do repositório já
feita**. Enquanto a senha não for trocada no provedor, quem tiver qualquer clone antigo continua
com uma credencial válida de e-mail da GMP. **A ordem importa, e é esta:**

1. **Rotacione a senha na Locaweb** (painel do provedor, caixa `solicitacoes@gmp.ind.br`). A partir
   deste instante a senha que está no código deixa de funcionar — e o e-mail de **Solicitação de
   material de escritório** para de sair até o passo 2 (é o único envio do CRM que usa essa
   caixa; os alertas do Almoxarifado usam a configuração própria deles, em Configurações →
   Alertas de Estoque).
2. **Defina a senha nova no ambiente da VPS**, nas variáveis `SMTP_USER` e `SMTP_PASS` (e
   `SMTP_HOST`/`SMTP_FROM` se quiser fixá-los também), e reinicie o servidor. A partir daí o
   sistema usa a senha do ambiente e **nunca** a do código.
3. **Só então** a senha que ficou no código e no histórico vira irrelevante: ela não abre mais
   nada. Não é preciso reescrever o histórico do repositório (e não se deve — letra **D**).

Se você fizer só o passo 2 sem o passo 1, a senha antiga continua **válida** na Locaweb e o
problema segue de pé. Se fizer só o passo 1, o e-mail de solicitação de material de escritório
para de sair.

**A4 (NOVO, da Etapa 24) — confira se alguém no banco de produção tem o perfil "Administrador"
atribuído pela tela.** A Etapa 24 tirou **Administrador** da lista de perfis da aba *Perfis de
Acesso* (regra 3 da seção da etapa). **Isso é um filtro da tela, não uma migração:** quem já
tiver esse perfil gravado **continua com ele**, e continua correndo o risco que a mudança existe
para evitar — o perfil dá poder de configurar o módulo e de promover outras pessoas, e **some
sozinho** no próximo salvamento do cadastro daquele usuário. Agora não há mais como reconcedê-lo
pela tela, que é o ponto.

```sql
SELECT p.usuario_id, u.nome, u.email, u.ativo, u.admin_modulos
  FROM perfil_almoxarifado_usuario p
  LEFT JOIN usuarios u ON u.id = p.usuario_id
 WHERE p.perfil = 'ADMINISTRADOR';
```

- **Zero linhas** — que é o resultado no banco de desenvolvimento (conferido: as duas únicas
  atribuições explícitas lá são `ALMOXARIFE`) — só anotar e fechar.
- **Alguma linha** — decida, para cada pessoa: se ela **deve** administrar o módulo, marque o
  almoxarifado em `admin_modulos` no **cadastro de usuário** dela (é lá que essa condição vive de
  verdade e sobrevive aos salvamentos); se **não deve**, apague a linha. Deixar como está é a pior
  das três opções, porque o acesso existe hoje e desaparece num dia imprevisível. É o furo
  **C31**.

**A5 (NOVO, da Etapa 25) — a primeira coisa que acontece em produção depois deste deploy é uma
limpeza de arquivos, e ela é grande. Confira o espaço antes.** Não é uma consulta SQL: é uma
limpeza automática que roda **sozinha no primeiro arranque do servidor** depois do deploy. Está
aqui porque você deve **saber que vai acontecer** e ter conferido o número antes, não descobrir
depois olhando o disco.

**O que ela vai apagar** (medição real feita no diretório de backups em 29/08/2026, em modo de
simulação — nada foi apagado para tirar este número):

```
ANTES da limpeza  : 165 arquivos, 187,36 MB
SERÃO APAGADOS    : 135 arquivos,  57,27 MB
  órfãos          : 132  (44,39 MB) — arquivos auxiliares -wal/-shm cuja cópia do banco já não existe
  acima do teto   :   1  (12,13 MB) — a 11ª cópia mais antiga, que sai pela trava de 10
  acompanhantes   :   2  ( 0,75 MB) — os dois auxiliares dessa 11ª cópia
  por idade       :   0            — as 11 cópias estão todas dentro dos 30 dias
DEPOIS da limpeza :  30 arquivos, 130,09 MB — 10 cópias completas do banco
```

**Como conferir antes do deploy**, na VPS (só leitura, não apaga nada):

```bash
ls -1 /caminho/para/server/data/backups | wc -l     # quantos arquivos há hoje
du -sh /caminho/para/server/data/backups            # quanto ocupam hoje
ls -1 /caminho/para/server/data/backups/*.sqlite | wc -l   # quantas cópias completas há
```

**O que fazer com cada resultado:**

- **Número de cópias `.sqlite` ≤ 10** — o esperado. A limpeza vai tirar só os órfãos; nenhuma cópia
  se perde. Pode seguir.
- **Número de cópias `.sqlite` > 10** — as excedentes **serão apagadas**, das mais antigas para as
  mais novas. Se alguma delas for uma cópia que você guardou de propósito (antes de uma restauração,
  por exemplo), **mova-a para fora dessa pasta antes do deploy**. A limpeza não toca em arquivo que
  não comece com `database-`, mas mover é mais seguro que confiar nisso.
- **O total não bate nem de longe com os 165 acima** — normal, o número muda conforme quantos boots
  houve. O que importa é a regra, não o número: sobram **no máximo 10** cópias, **nunca menos de 3**,
  e todo arquivo auxiliar sem dono sai.

⚠️ **Dois números errados que circularam durante o desenvolvimento e que você pode ter visto:**
o documento de desenho começou dizendo que a limpeza liberaria **"188 MB"** — isso é o tamanho
**total** da pasta, ou seja, 4× o que ela de fato libera, e apagar tudo aquilo seria apagar os
backups. Depois circulou **"~44 MB, e as 11 cópias continuam"** — também errado, porque com a trava
de 10 cópias a 11ª sai. **O número certo é ~57 MB em 135 arquivos, sobrando 10 cópias e ~130 MB.**

**A6 (NOVO, da Etapa 26 — é a mais importante desta etapa, e a única que precisa da sua decisão).
Quantos materiais existem por categoria hoje, no banco de PRODUÇÃO.** A Etapa 26 fez as telas
pararem de usar a lista genérica de 11 categorias que estava escrita dentro do sistema
(`CONSUMÍVEL`, `FERRAMENTA`, `EPI`…) e passarem a usar o **catálogo do cliente** — as 27
categorias de metalúrgica que já estavam cadastradas no banco (`Aço carbono`, `Chapas`, `Tubos`,
`Rolamentos`, `Solda e consumíveis`…). **Os materiais já cadastrados NÃO foram remexidos**: quem
estava com `CONSUMÍVEL` continua com `CONSUMÍVEL`. Isso é decisão declarada — trocar a
classificação do acervo do cliente sem ele pedir, com base num número medido no computador de
desenvolvimento, seria mexer em dado que não é meu.

**Rode isto no banco de produção antes de subir:**

```sql
SELECT COALESCE(categoria, '(sem categoria)') AS categoria,
       COUNT(*) AS materiais
  FROM materiais_almoxarifado
 GROUP BY categoria
 ORDER BY materiais DESC;
```

**O que fazer com cada resultado:**

- **Tudo (ou quase tudo) numa categoria genérica só** — é o caso do banco de desenvolvimento, onde
  a consulta devolve **uma linha, `CONSUMÍVEL` com 2 materiais**. Aí o remapeamento é trivial e é
  **uma decisão sua de uma linha**: escolha a categoria do catálogo que corresponde e rode
  `UPDATE materiais_almoxarifado SET categoria = 'Solda e consumíveis' WHERE categoria = 'CONSUMÍVEL';`
  (trocando o nome novo pelo que você decidir). **Tire um backup antes** — é um `UPDATE` sobre
  dado do cliente e não tem desfazer.
- **Espalhado por várias categorias genéricas** — aí não existe resposta automática: é decisão
  sua, **categoria por categoria**. Para cada linha que a consulta devolver, você diz para qual
  das 27 do catálogo ela vai (ou que fica como está). `FERRAMENTA` pode ir para `Ferramentas
  manuais` ou virar patrimônio de ferramenta, `ELÉTRICO` pode ser `Componentes elétricos`, e
  `OUTROS` provavelmente fica. Um `UPDATE` por linha decidida, sempre com backup antes.
- **Linhas com `(sem categoria)`** — materiais gravados sem classificação nenhuma. Não é erro do
  passado: até esta etapa o campo aceitava vir vazio. Daqui para frente **não aceita mais** (ver a
  regra 3 da Etapa 26), mas os antigos continuam assim até alguém editá-los.

> ⚠️ **O número do desenvolvimento (2 materiais em `CONSUMÍVEL`) NÃO vale para produção, e não é
> estimativa de nada.** O banco daqui tem os materiais que foram cadastrados para testar; o de
> produção tem o acervo real da GMP, que pode ser centenas de itens com distribuição que eu não
> conheço. **A consulta existe justamente porque eu não sei esse número** — e todo o desenho desta
> etapa (não migrar nada automaticamente) depende de você rodá-la antes.

**A7 (NOVO, da Etapa 26) — procure categorias com nome repetido, ou uma regra nova desta etapa
não vale em produção.** A Etapa 26 passou a **recusar categoria duplicada** (não dá para ter duas
`Chapas`), e quem garante isso é uma trava criada no banco no arranque do servidor. **Se o banco
de produção já tiver dois nomes iguais, a trava não é criada** — e sem ela a regra simplesmente
não vale, sem nada quebrar visivelmente. O sistema **não cai** por causa disso (a criação da
trava está protegida de propósito: derrubar o módulo inteiro por duas linhas de catálogo seria
pior), ele escreve um aviso no registro do servidor e segue. Mas você fica com uma regra
anunciada que não está valendo, que é o pior dos dois mundos.

```sql
SELECT nome, COUNT(*) FROM categorias_material_almoxarifado GROUP BY nome HAVING COUNT(*) > 1;
```

- **Zero linhas** — que é o resultado no banco de desenvolvimento (conferido: **27 categorias,
  nenhuma repetida**) — só anotar e seguir. A trava é criada no primeiro arranque.
- **Alguma linha** — renomeie ou desative as repetidas **antes** do deploy (na aba Categorias, ou
  por SQL) e reinicie o servidor depois. Enquanto houver repetidas, o cadastro aceita criar mais
  uma igual.

**Depois de subir, confira que a trava foi criada:**
`SELECT name FROM sqlite_master WHERE type='index' AND tbl_name='categorias_material_almoxarifado';`
— tem de aparecer `idx_categorias_almox_nome`. Se não aparecer, o aviso está no registro do
servidor e a A7 não foi resolvida.

### B. Decisões de negócio

**A8 (NOVO, da Etapa 33 — NÃO é consulta, é aviso a dar antes do deploy).** A partir do deploy,
**todo link de imagem ou certificado do almoxarifado copiado anteriormente para de funcionar**.
Se alguém da equipe guardou esses endereços em planilha, documento ou e-mail, avise que o caminho
passa a ser abrir pelo sistema. Nenhum arquivo foi apagado ou movido — só o endereço mudou de
regra. Ver o item **42** da letra C.

### B. Decisões de negócio — B1 a B70; as em aberto esperam você, as tomadas estão escritas com o descartado

*(O título desta seção dizia "B1 a B24" — **estava defasado**: os itens já iam até B36 antes da
Etapa 20. Corrigido em 2026-08-28 para B50, depois para B56 com as três da Etapa 24, para B57 com
a da Etapa 25, e **agora para B58**, com a da Etapa 26. Fica dito em vez de reescrito em silêncio,
porque a contagem errada fazia parecer que as decisões novas não tinham sido registradas — e este
título já esteve defasado duas vezes. **Atualizado de novo em 2026-08-29 para B61**, com as três
da Etapa 27 — B59 (plano por família), B60 (o alerta para a etapa da tela) e B61 (instrumento
opcional, decisão já tomada). **Atualizado para B63** com as duas da Etapa 28 e **para B64** com a
da Etapa 29.)*

**A B6 SAIU da lista de em aberto — foi respondida pela Etapa 26** (2026-08-29): vence o catálogo
do cliente, e a lista genérica sai das telas. Ver o item B6 abaixo, que ficou no lugar com o
desfecho escrito.

Guia rápido do estado: **em aberto** — B5 (taxonomia de sucata), B8 (tela de
editar ferramenta), B9 (campo do filtro de calibração), B11 (dupla aprovação formal do ajuste),
B12 (recontagem pelo mesmo contador), B13 (quem decide compra),
B15-B17 (as três da Etapa 12: ligar o e-mail de movimentação e validar os destinos/toggle),
B18-B20 (as três da Etapa 13: proteção dos Indicadores, unificar as réguas de consumo, tetos/
auditoria de export/gates antigos), B21-B24 (as quatro da Etapa 14 — **a B21 é uma abertura de
acesso já em vigor, leia primeiro**), **B41 (o único item em aberto da Etapa 20: a contagem de
permissões por setor que qualquer usuário do módulo lê)** e **B54 (o único item em aberto da
Etapa 24: apertar o perfil padrão de quem não tem perfil definido)** e **B57 (o único item da
Etapa 25: quais operações sobre material crítico exigem duas assinaturas)** e **B58 (a única da
Etapa 26: renomear categoria reclassifica?)** e **B59 (a da Etapa 27: plano de inspeção herdado da
família?)**.
As quatro decisões da Etapa 20 que **eu já tomei** e você pode reverter estão em B37-B40, as
**cinco da Etapa 21** (a primeira etapa do núcleo do CRM) estão em **B42-B46**, e as **quatro da
Etapa 22** estão em **B47-B50** — todas tomadas por mim, nenhuma esperando resposta, todas
reversíveis. As **três da Etapa 23** estão em **B51-B53** e as **três da Etapa 24** em
**B54-B56** — destas últimas, **a B54 (apertar o padrão de quem não tem perfil) espera você**;
as outras duas eu tomei e você reverte se quiser. A **única da Etapa 25 é a B57 (dupla conferência
em material crítico) e ela espera você** — está escrita com quatro opções, a consequência de cada
uma, a minha recomendação e o comportamento de hoje declarado, para você arbitrar lendo.
A **única da Etapa 26 é a B58 (renomear categoria deve reclassificar os materiais?) e ela espera
você** — com as três opções, a consequência de cada uma e o comportamento de hoje declarado.
As **três da Etapa 27 são B59, B60 e B61**: a **B59** (plano por família) espera você; a **B60**
não era pergunta e sim um **alerta para a etapa da tela**, e **a Etapa 29 a cumpriu em 2 das 3
partes** — a caixa virou somente leitura e explicada; a **pré-visualização do resultado enquanto se
digita foi DESCARTADA de propósito**, e o porquê (duas cópias da régua acabam divergindo) está
escrito no item B60, junto com o caminho limpo caso você queira mesmo assim; e a **B61** (informar
o instrumento é opcional) é decisão que **eu tomei**, escrita com o caminho de volta.
As **duas da Etapa 28 são B62 e B63**, e **as duas eu tomei**, reversíveis: **B62** (a segunda
conferência é obrigatória só quando há material crítico ainda na caixa — é a régua que responde
parcialmente à B57) e **B63** (conferir só é possível com a requisição *Em Separação*). **A B57
foi respondida PELA METADE pela Etapa 28**: a saída de material crítico da requisição agora exige
duas pessoas; o restante da pergunta (quais *outras* operações) continua aberto.
A **única da Etapa 31 é a B66, e ela ESPERA VOCÊ**: numeração sequencial por ano
(`REQ-2026-0001`)? Está escrita com o que ela dá a mais, o custo real e a pergunta de negócio que
decide (reinicia a cada ano ou corre direto?).
A **única da Etapa 30 é a B65**, e **eu a tomei**: a tela repete a régua de **nome duplicado** do
servidor (só pela mensagem), e o item explica por que essa repetição é legítima enquanto a da
tolerância — proibida pela B60 — não é.
A **única da Etapa 29 é a B64**, e **eu a tomei**, reversível numa linha: ler o histórico de
inspeções e as medidas **não exige perfil** (decidir a inspeção continua exigindo). Junto dela, a
**B60 saiu da lista de alertas em aberto** — foi cumprida em 2 de 3 partes, com a terceira
descartada e justificada.
**B33 (quem lê a trilha de auditoria) SAIU da lista de em aberto** — a tela foi entregue na
Etapa 22 (`8c6ffbe..169458d`). Ver o item B33 abaixo, que ficou no lugar com o desfecho escrito.
**Resolvidas ou já decididas** — B1-B3 (Etapa 10), B4 (custo da transformação), B7 (lembrete de
ferramenta, pago na Etapa 12), B10 (ajuste recusado contra retenção), B14 (cancelar solicitação
de compra, **entregue na Etapa 14**).

**B1 a B3 — o que muda o saldo total não olha para o material que está retido.** É sempre o mesmo
defeito, e a Etapa 8b foi a **terceira** vez que ele apareceu — por isso está aqui, e não escondido
na seção de uma etapa.

**B1 (desde a Etapa 7) — o Ajuste contra o material bloqueado.** Bloquear 8 unidades e depois
lançar um Ajuste levando o total para 1 deixa `bloqueado (8) > total (1)`: **disponível negativo,
sem nenhuma guarda**. É plausível na operação real — o inventário acha menos do que o sistema
dizia, com parte do material em quarentena.

**B2 (desde a Etapa 8) — a conferência de inventário grava o saldo por fora do motor.** Concluir
uma conferência com **"aplicar ajustes"** (`PUT /conferencias/:id/concluir`) escreve
`quantidade_atual` **direto**, sem passar pelo motor de estoque: sem validação de saldo, sem a
permissão `ajustar_material_cliente` (é o furo C1 abaixo) e sem olhar para nenhuma coluna de
retenção.

**B3 (da Etapa 8b) — o material que está no terceiro.** Mesmo defeito, com a coluna nova.
Mandar 30 chapas galvanizar e depois ajustar o total do material para 10 deixa
`em terceiros (30) > total (10)`. **O sistema aceita.** E o caminho mais provável é justamente o
B2: homologar a divergência de um material que tem saldo em terceiros **baixa o físico e deixa a
retenção órfã** — disponível negativo, sem aviso nenhum.

> **A Etapa 8b reduziu a chance de isso acontecer, sem resolver a causa.** A contagem de inventário
> agora **já desconta** o que está no terceiro (o esperado vem certo, então some o impulso de
> "corrigir" o saldo), e o encerramento de remessa é o caminho controlado para zerar a retenção.
> Mas se alguém lançar um Ajuste manual à revelia — ou homologar uma divergência de contagem de um
> material que tem remessa aberta —, o buraco continua aberto.
>
> **A Etapa 8c não tocou nisto.** A transformação baixa a retenção pelo caminho controlado, como o
> encerramento; o Ajuste manual continua sem reconciliar nada. É a **terceira instância registrada
> e a decisão continua aberta.**

Três respostas possíveis, e a escolha é sua — a mesma para B1, B2 e B3: **(a)** o Ajuste baixa a
retenção proporcionalmente; **(b)** o Ajuste recusa enquanto houver retenção maior que o novo
total; ou **(c)** o Ajuste aceita e apenas avisa. Enquanto não for decidido: **resolva a quarentena
e encerre as remessas em aberto antes de lançar um ajuste que reduz o total.**

**B4 (NOVO, da Etapa 8c) — a regra de custo da transformação. Esta você JÁ decidiu; está escrita
aqui para você reconhecer o que foi implementado no seu nome.**

Quando a chapa é cortada, o custo dela tem de ir para algum lugar. O que ficou valendo:

| A regra | O que foi **escolhido** | O que foi **descartado**, e por quê |
|---|---|---|
| Como dividir o custo da chapa | **Pela quantidade** de cada resultado | **Ratear pelo peso.** Peso unitário é campo opcional do cadastro, que quase nenhum material tem preenchido — uma regra que dependesse dele falharia justamente no caso mais comum, e falharia em silêncio |
| Quanto vale a sobra | **Zero** | Dar à sobra a mesma fatia por quantidade das peças. A sobra é **uma linha só** e uma fatia grande: rateá-la deixaria as peças aproximadamente **40% mais caras** num corte típico, sem que nada tivesse acontecido de verdade com elas |
| A nota do cortador (serviço) | **Opcional**, e **soma** ao custo das peças quando informada | Estimar o serviço quando não informado. **O sistema não inventa número** |

**Consequência declarada, e é decisão também:** se a chapa voltar **só como sobra** (nenhuma peça),
não há entre quem ratear — o valor **evapora de propósito**, e o número fica **escrito na
justificativa** da baixa da chapa, para não sumir sem rastro. Inflar o retalho para "fechar a
conta" é exatamente o que a regra da sobra a zero recusa em voz alta.

**Se a operação real for outra, isto é mudança de regra, não bug** — e é barato mudar, porque a
conta vive numa função isolada (`transformCost.ratearCusto`).

> **A Etapa 9 não tocou em B1–B3.** O sucateamento baixa pelo caminho controlado (o motor, na
> segunda assinatura) e pré-checa o disponível na solicitação; o Ajuste manual continua sem
> reconciliar retenção nenhuma. A decisão continua aberta e continua sendo a mesma.

**B5 (NOVO, da Etapa 9) — as classificações de sucata são sugestões minhas, não a taxonomia de
vocês.** Ao solicitar um sucateamento, o campo **Classificação** é texto livre com seis sugestões
que aparecem ao digitar: *aço carbono, inox, alumínio, cobre, cavaco, misto*. **Essa lista foi
inventada para a operação não travar** — a pergunta é: **quais tipos de sucata a GMP separa de
verdade** (para venda, para o relatório financeiro)? A resposta vira a lista oficial; enquanto não
vem, texto livre não trava nada, mas duas pessoas podem escrever "aço" e "aço carbono" e o
relatório contar como duas classificações.

**B6 (registrada desde a 8c) — ~~a taxonomia de categorias de material~~ — RESPONDIDA na Etapa 26
(2026-08-29): vence o catálogo do cliente, e a lista genérica sai das telas.**

A pergunta era "qual das duas listas de categorias vale?". Ao medir para responder, apareceu que
**a pergunta estava incompleta: as duas listas não tinham UMA categoria em comum**, e a que foi
desenhada para a GMP estava **morta**:

- **A lista das telas** — 11 nomes em MAIÚSCULAS (`CONSUMÍVEL`, `FERRAMENTA`, `EPI`, `ELÉTRICO`,
  `HIDRÁULICO`…), escritos dentro do código e **repetidos em três telas diferentes**. Genérica:
  serve para qualquer empresa e para nenhuma em particular.
- **O catálogo do cliente** — **27 categorias de metalúrgica** (`Aço carbono`, `Aço inox`,
  `Chapas`, `Tubos`, `Perfis estruturais`, `Componentes usinados`, `Rolamentos`, `Elementos de
  fixação`, `Solda e consumíveis`…), cadastradas no banco desde sempre e **sem nenhum material
  usando**. Era a taxonomia certa, guardada e sem uso.

**Escolhido: o catálogo do cliente.** A taxonomia de metalúrgica é a que serve para quem vai
operar o sistema. **Descartado manter as duas** — é o estado de hoje, e é o problema: filtrar por
`EPI` na tela de materiais devolvia zero linhas, e zero linhas parece estoque vazio, não filtro
inútil. **Descartado fundir as listas**: `EPI`/`EPIs`, `FERRAMENTA`/`Ferramentas`,
`ELÉTRICO`/`Elétrica` são pares conceituais com grafias diferentes, e fundir criaria uma terceira
lista que ninguém pediu.

**Você pode reverter parte disto sem código:** o catálogo agora é editável em **Configurações →
aba Categorias**. Se a GMP quiser as genéricas de volta, basta cadastrá-las ali; se as 27 não
servirem, desative as que sobram. O que **não** volta é a lista escrita dentro do código — a
fonte passou a ser uma só, e é o banco.

**O que continua em aberto e virou item próprio: a B58** (renomear reclassifica ou não) e a
**A6** (o que fazer com os materiais já classificados pela lista antiga).

**B7 (da Etapa 9b) — ~~o lembrete de devolução vencida não tem canal~~ — RESOLVIDO na Etapa 12:**
foi a resposta **(a)** da lista abaixo, com a fila da feature 19 no lugar de "esperar a 20": um
job diário enfileira **um lembrete por dia** por empréstimo vencido (respeitando o checkbox
"Notificar por e-mail" — B17). O texto original fica para registro da decisão da época:
A tela já **destaca visualmente** os empréstimos vencidos (aba Empréstimos). Por baixo, existe
também uma função pronta e testada que lista os empréstimos vencidos, pensada para virar um job
agendado — mas **o job não foi ligado a nada**: decisão tomada durante a execução, porque um
agendador sem e-mail (feature 19) ou alerta formal (feature 20) rodaria em segundo plano sem
avisar ninguém, dando a falsa sensação de que existe cobertura. **Três respostas possíveis:**
**(a)** esperar a feature 20 (alertas) e ligar o job junto; **(b)** ligar agora um job simples que
só grava um log/alerta interno, sem e-mail, como primeiro passo; **(c)** decidir que o destaque na
tela já basta por enquanto. Reverter para **(b)** é barato — o padrão já existe em
`routes/almoxarifado.js:2401` (o mesmo job da requisição).

**B8 (NOVO, da Etapa 9b) — falta a tela de editar ferramenta, o cadastro já existe.** Cadastrar
uma ferramenta nova funciona; **mudar depois** o nome, a localização ou se ela exige calibração
**não tem formulário na tela**. O backend que faz isso **já existe e está testado** — só falta o
botão e o modal na tela de Ferramentas. Ficou de fora porque ninguém detalhou essa parte da tela
no plano da etapa, e só apareceu na revisão final. Baixo custo para entrar numa próxima rodada
pequena, se quiserem antes da Etapa 10.

**B9 (NOVO, da Etapa 9b) — o filtro "quantos dias faltam" do painel de calibração não tem campo
na tela.** O painel de calibrações a vencer aceita um parâmetro `dias` (hoje fixo em 30, por
trás), mas a tela não oferece um campo para o usuário mudar esse número. Baixo custo, mesma
categoria da B8 — fica registrado para não ser confundido com "o painel não filtra": ele filtra,
só não deixa escolher o prazo pela tela ainda.

**B10 (NOVO, da Etapa 10) — o "ajuste sem retenção suficiente" agora é RECUSADO, não mais aceito
em silêncio. Esta você já decidiu por mim; está escrita aqui para você reconhecer o que foi
implementado no seu nome.** Era a mesma pergunta registrada desde a Etapa 7 (o Ajuste contra
material bloqueado/reservado/em terceiro): o que o sistema faz quando um ajuste de saldo deixaria
menos material do que está retido para outra coisa? Três respostas eram possíveis: **(a)** baixar
a retenção proporcionalmente; **(b)** recusar o ajuste; **(c)** aceitar e só avisar. **Implementei
a opção (b): o sistema agora recusa**, com a mensagem dizendo qual retenção pesa e o mínimo
aceitável para o ajuste passar. Motivo: as outras duas opções mexeriam em número que não é do
ajuste (a retenção pertence a outro processo — a reserva, o bloqueio de qualidade, a remessa a
terceiro), e diminuí-la ou fingir que não existe corrigiria um saldo inventando outro erro em
cima. **Se a operação real precisar de outro comportamento** (por exemplo, um ajuste que force a
baixa da retenção também, com aviso), é decisão de negócio nova — reversível, a recusa vira só
uma checagem a mais antes de aceitar.

**B11 (NOVO, da Etapa 10) — o checklist original pedia "dupla aprovação" para o ajuste de
inventário; o que foi entregue é "dupla permissão" (mais barato, já existia antes desta etapa).**
"Dupla permissão" quer dizer: quem **conta** o inventário (perfil Almoxarife) não precisa ser
quem **homologa** o ajuste final (precisa da permissão de ajustar estoque, hoje Gestor/
Administrador) — isso é checado numa única chamada, sem processo. "Dupla aprovação" (o que o
sucateamento da Etapa 9 tem) é diferente: duas pessoas **assinam** o mesmo processo, uma depois da
outra, com tela de pendências e a garantia de que a mesma pessoa não assina as duas pernas.
**Não construí o fluxo de duas assinaturas para o inventário** — é o tamanho de uma etapa própria
(tela de pendências, notificação de quem falta assinar), e o texto original não deixava claro que
pedia duas coisas diferentes sob a mesma palavra. **A pergunta para você: o inventário precisa do
fluxo formal de duas assinaturas, ou a dupla permissão que já existe é suficiente?** Reversível
sem migração de dado — a permissão dupla que existe hoje não precisa ser desfeita se decidirem
construir o fluxo formal depois.

**B12 (NOVO, da Etapa 10b) — o primeiro contador pode corrigir a própria contagem enquanto
ninguém recontou. Esta você já decidiu por mim; está escrita aqui para você reconhecer o que foi
implementado no seu nome.** Com a dupla contagem ligada, a primeira versão da regra barrava
**qualquer** segunda escrita do primeiro contador — e como a etapa também passou a recusar valor
inválido, um erro de digitação dele **congelava o item** (e, acima da tolerância, a conferência
inteira) até outra pessoa logar. **Implementei: corrigir o próprio número é permitido enquanto
`recontado` está zerado, e a correção NÃO conta como recontagem** — só a contagem de OUTRA pessoa
conta. Descartei a alternativa (documentar "chame um colega" como procedimento) porque ela
transformava um typo em parada operacional sem ganhar nada em controle: os quatro olhos continuam
exigidos, porque a recontagem continua tendo de vir de outra pessoa. Reversível — se preferirem o
comportamento rígido, é remover uma condição.

**B13 (NOVO, da Etapa 11) — quem decide compra: a ação nova `gerenciar_reposicao` ficou com
Administrador, Gestor e Compras — o ALMOXARIFE ficou fora DE PROPÓSITO. Esta você já decidiu
por mim; reconheça.** É a primeira ação do módulo que o Almoxarife não tem: ele conta e
movimenta, mas decidir *o que comprar e quanto* é gestão/compras (e é também o primeiro uso
real do perfil COMPRAS). A tela mostra um painel de "sem permissão" para quem não tem a ação.
Reversível em uma linha se preferirem incluir o Almoxarife. Junto vieram réguas menores
implementadas no seu nome, todas registradas na seção da etapa: a mínima como **chão** de
todas as réguas do ponto (inclusive de um ponto cadastrado abaixo dela); risco de parada =
**crítico com disponível zero** (a versão "consumo × prazo" foi descartada porque mentiria
por omissão de cadastro), contando **mesmo depois de pedido** (papel não segura produção); e
o caminho novo de gerar solicitação **não deduplica** — a matemática da posição é o dedupe, e
pendência insuficiente gera o **complemento** (o dedupe antigo por material pendente ficou só
no verificar-mínimos legado).

**B14 (da Etapa 11) — ✅ RESOLVIDA NA ETAPA 14.** Este item dizia que não existia cancelar
solicitação de compra e que o caminho "precisa existir (provavelmente junto com o fechamento no
recebimento)". Foi exatamente o que a Etapa 14 entregou: **Cancelar** na tela de Reposição com
justificativa obrigatória gravada na auditoria, e o **fechamento automático no recebimento**
(RECEBIDA quando a nota do pedido vinculado é processada). As aproximações escolhidas nesse
desenho estão na **B22**; deixado aqui riscado em vez de apagado, como sempre.

**B15 (NOVO, da Etapa 12) — o e-mail de movimentação nasce DESLIGADO, e os destinos são por
família, não por matriz.** A spec pedia "e-mail em toda entrada e saída"; ligar isso por default
no deploy despejaria dezenas de e-mails por dia sem ninguém ter escolhido — então
`Notificar movimentações por e-mail` vem **0** e ligar é um clique em Configurações (reversível
a qualquer momento). Os destinatários são **4 listas por família** (entradas, saídas, ajustes,
terceiros) + 1 de compras, com a lista geral de alertas como reserva. **Descartada** a
matriz-tabela evento×destinatário com CRUD próprio — se a prática pedir granularidade maior,
ela vira etapa própria. Decida quando ligar e com quais listas.

**B16 (NOVO, da Etapa 12) — quem OPERA a fila é Gestor/Administrador; Compras só recebe.** A
ação nova `gerenciar_notificacoes` (ver a fila, reenviar, processar) ficou com ADMINISTRADOR e
GESTOR. Compras **recebe** os e-mails de solicitação, mas não mexe na fila — reenviar e-mail e
drenar fila é operação administrativa. E o **reenvio de e-mail já enviado é permitido de
propósito** (com confirmação na tela): é o único caminho para reemitir um e-mail que se perdeu
depois do envio. **Descartado** bloquear com erro — tiraria do admin a única reemissão possível.
Se discordar de qualquer um dos dois, é config de uma linha.

**B17 (NOVO, da Etapa 12) — o checkbox "Notificar por e-mail" agora governa TUDO que usa a
lista geral de alertas.** Estoque zerado, lote vencendo, remessa vencida, lembrete de
ferramenta, devolução parcial **e** o e-mail de movimentação quando cai na lista geral por
falta de destino próprio: checkbox desligado = nada disso sai. **Escolhido** porque quem
desligou "notificar por e-mail" não pode voltar a receber e-mail nos mesmos endereços por um
canal novo; **descartado** dar um botão liga/desliga por alerta (viraria painel de 8 chaves
sem pedido concreto). Duas consequências deliberadas para você validar: **(a)** lista de
família preenchida IGNORA o checkbox (você escolheu aquele destino); **(b)** o alerta de
estoque **zerado** só dispara para material **sem mínimo** cadastrado — material com mínimo já
tem o canal do alerta de mínimo, e dois e-mails do mesmo fato para a mesma lista é ruído
(**descartado** suprimir o alerta de mínimo quando zerar: inverteria uma máquina estável desde
a Etapa 4).

**B18 (NOVO, da Etapa 13) — os Indicadores ficaram SEM proteção de perfil, e isso expõe mais
do que o painel expunha.** Decisão D5: qualquer usuário do módulo (chão de fábrica incluído)
abre o relatório Indicadores — que traz a **quebra do valor do estoque por categoria** e a
**lista nominal dos materiais em ruptura** (código, nome, data). É MAIS do que o total
agregado que o painel já mostrava. A revisão final mediu que a exposição marginal é quase
zero (o relatório de Estoque Atual, também sem proteção desde antes, já serve categoria e
valor por material — basta somar), então a decisão é defensável — mas é SUA: se quiser
restringir, o gate natural é o mesmo de Reposição e Compras (`gerenciar_reposicao`), mudança
de uma linha. **Descartado** criar ação nova só para isso (regra nova sem pedido).

**B19 (NOVO, da Etapa 13) — as quatro réguas de consumo continuam divergentes de propósito.**
"Materiais mais consumidos"/"Consumo por OS"/"Consumo por período" contam só saídas diretas;
o giro e a Reposição contam tudo que debita patrimônio (medido: 10 vs 18 no mesmo material).
**Escolhido**: manter as antigas e escrever a régua no rodapé de cada um — unificar mudaria
número de relatório que já se usa, sem você ter pedido. **Descartado**: unificar em silêncio.
Se quiser unificar, a fonte única já existe (é trocar a régua e avisar quem usa).

**B20 (NOVO, da Etapa 13) — três decisões menores esperando confirmação:** (a) os tetos de
500 linhas (Histórico, Divergências) e 10 (Mais Consumidos) foram mantidos e agora aparecem
avisados na tela — aumentar/remover é uma linha por relatório; (b) exportar planilha não gera
registro de auditoria (nenhuma consulta do módulo gera) — se quiser log de egresso, é uma
linha; (c) proteger relatórios hoje abertos (Estoque Atual expõe valor do estoque a todo o
módulo desde sempre) — a etapa PRESERVOU os acessos como estavam de propósito.

**B21 (NOVO, da Etapa 14) — 🚨 ABERTURA DE ACESSO JÁ EM VIGOR: vincular a pedido e "verificar
mínimos" saíram de Administrador-only para o perfil de reposição (Gestor e Compras).** Antes,
só o Administrador vinculava solicitação a pedido e disparava a varredura de mínimos; agora
**qualquer Gestor ou Compras** faz os dois (decisão D9). **Escolhido** porque era incoerência
medida, não regra: quem pode GERAR solicitações (ação mais grave — cria compromisso de compra)
não podia vinculá-las nem rodar a varredura que só cria as mesmas solicitações; e o gate antigo
nem era declarado em spec — era resto histórico. **Descartado** manter Admin-only (forçaria o
Administrador a ser gargalo de operação rotineira de compras). Mitigação incluída: a varredura
agora **audita quem a disparou**, linha a linha. Se discordar, voltar é uma linha por rota —
mas decida sabendo que Gestor/Compras já operam assim desde este deploy.

**B22 (NOVO, da Etapa 14) — o fechamento automático é POR PEDIDO, na primeira nota — e cancelar
não mexe no pedido.** Três aproximações do mesmo desenho, todas deliberadas: **(a)** a
solicitação fecha (RECEBIDA) quando chega a **primeira** nota do pedido vinculado, mesmo
parcial — 5 de 20 entregues já fecham; o que faltar reaparece na sugestão de reposição pela
régua normal de mínimo. **Descartado** fechar por quantidade conferida: exigiria amarrar item
de nota a solicitação (vínculo que o schema não tem) e travaria solicitação aberta para sempre
em pedidos que nunca completam. **(b)** cancelar uma solicitação VINCULADA **não cancela nem
avisa o pedido de compra** no módulo Compras — o pedido é documento de outro módulo com dono
próprio. **Descartado** cancelamento em cascata (o almoxarifado mandaria em documento de
Compras). **(c)** re-vincular a outro pedido **sobrescreve** o vínculo anterior sem histórico —
e a chegada do pedido antigo então não fecha mais nada (é o furo C15). Se qualquer uma das três
apertar na prática, o desenho comporta evolução — mas hoje é assim.

**B23 (NOVO, da Etapa 14) — o contexto do material mostra o último custo pago TAMBÉM para
material de cliente.** O painel de contexto responde para material de propriedade de cliente
com os saldos e o **último custo de entrada por NF** (quando houve recebimento com valor).
**Escolhido** porque o dado já está no gate certo (`gerenciar_reposicao` — quem decide compra)
e esconder o custo de quem negocia beneficiamento seria mutilar a tela para o único público
dela; a exposição está **documentada por teste** (um assert existe só para marcar esta
decisão). **Descartado** responder 404 (mentiria — o material existe) e omitir o campo só para
cliente (inconsistência silenciosa). As **solicitações abertas** de material de cliente, essas
sim, vêm sempre vazias — material dos outros não se compra.

**B24 (NOVO, da Etapa 14) — o relatório Custo por projeto NASCE protegido (perfil de
reposição), invertendo o padrão histórico.** Todo relatório novo até aqui nascia aberto e
alguém depois notava a exposição (foi a lição da B18, na Etapa 13). Este nasceu **fechado**
(`gerenciar_reposicao` — mesmo gate do de Solicitações de Compra), porque expõe custo aplicado
por projeto, dado de gestão. **Descartado** nascer aberto "como os outros" — a B18 mostrou o
custo de decidir exposição por inércia. Abrir para mais perfis é mudança de uma linha no
registro de relatórios; decida se Gestor basta ou se PCP/Qualidade também deveriam ver.

**B25 (NOVO, da Etapa 15) — o escopo inteiro da etapa foi decidido por mim, com sua
autorização genérica ("respostas recomendadas").** A spec original pedia "código de barras,
coletores, app móvel, assinatura digital"; a medição mostrou que nada no sistema gera código
1D, nenhum coletor foi confirmado e não há infraestrutura de app. **Escolhido:** scanner de QR
pela câmera (fecha o ciclo das etiquetas), assinatura do recebedor na entrega, e o módulo
usável no celular. **Descartado:** leitor 1D (leria o que não existe), coletor dedicado
(hardware não confirmado — se aparecer, emula teclado e já funciona), app nativo/PWA/offline
(sem demanda medida). Se algum descartado era o que você queria, é etapa nova, não conserto.

**B26 (NOVO, da Etapa 15) — a assinatura é opcional SEMPRE, e requisição encerrada ainda
aceita assinatura.** **Escolhido:** a entrega nunca depende da assinatura (o material já saiu
fisicamente; a assinatura documenta), "Pular" existe e é honesto, e ENCERRADA aceita
assinatura atrasada — o papel chega depois. **Descartado:** obrigar assinatura (bloquearia o
balcão com as mãos ocupadas) e ligar as flags "requer assinatura/termo" por tipo de material,
que existem no cadastro desde o início e continuam **mortas** — ligá-las exige você decidir
quais tipos e se bloqueia. Diga se quer obrigatoriedade e para quê.

**B27 (NOVO, da Etapa 15) — etiqueta impressa em OUTRO ambiente continua funcionando no
scanner.** O QR carrega o endereço completo (com o domínio de onde foi impresso). **Escolhido:**
o scanner aproveita o caminho interno e ignora o domínio — etiqueta impressa no ambiente de
teste funciona em produção e vice-versa. **Descartado:** recusar domínio alheio, que obrigaria
reimprimir todas as etiquetas a cada mudança de endereço do sistema. A segurança não afrouxa:
só caminhos do módulo navegam, qualquer outro conteúdo é exibido e nunca aberto.

**B28 (NOVO, da Etapa 16) — quem vê a central de alertas: Administrador, Almoxarife, Gestor
e Compras.** A ação nova `ver_alertas` deixa Produção/Engenharia/Consulta FORA porque a
central expõe quantidade exata de estoque e valor parado em reais (a mesma lição G1 do
requisitante que só vê tem/não-tem). **Descartado** abrir para todo o módulo. Se o chão de
fábrica precisar ver "requisição atrasada" (só as dele), é recorte novo, não abertura do
gate.

**B29 (NOVO, da Etapa 16) — no alerta de materiais sem endereço, material de CLIENTE conta.**
O relatório homônimo já incluía material de cliente de propósito (classe C da auditoria da
Etapa 8: endereçar material de cliente é trabalho real do almoxarife), e o alerta usa a
MESMA régua por função compartilhada — duas réguas com o mesmo nome era exatamente o defeito
que a revisão do plano pegou. **Descartado** filtrar o dono só no alerta. Nos alertas de
consumo/excesso o material de cliente fica fora (lá a régua é de compra/valor nosso).

**B30 (NOVO, da Etapa 17) — o e-mail de divergência de inventário NÃO diz o valor em reais.**
O impacto financeiro é calculado e guardado na conferência, mas só sai pela tela de relatório,
que tem permissão própria. **Escolhido** mandar só a contagem de itens divergentes;
**descartado** pôr o valor no corpo — e-mail vaza para caixa de entrada, encaminhamento e
celular, e esse número é dado de gestão. Se quiser o valor no aviso, é decisão sua.

**B31 (NOVO, da Etapa 17) — lote sem certificado virou UM resumo por mês, não um aviso por
lote.** Medido na revisão: com 1000 lotes aguardando certificado, a versão original geraria
1000 e-mails **todo mês**. **Escolhido** o resumo (total + os 20 primeiros), no mesmo padrão
que "materiais sem endereço" já usava; **descartado** o aviso por lote e também um teto
silencioso (cortar sem dizer). A lista completa continua na tela **Alertas**.

**B32 (NOVO, da Etapa 17) — a divergência de recebimento avisa POR ITEM, sem agregar.** Uma
nota com N itens divergentes gera N avisos (medido: 300 itens = 300 e-mails de um clique).
**Escolhido** manter por item porque uma nota real tem poucos itens e o aviso precisa nomear
o material; **descartado** agregar por nota. Se aparecer nota gigante na prática, a saída é
o mesmo resumo do inventário.

**B33 (da Etapa 18 — ✅ METADE FECHADA NA ETAPA 22, a outra metade continua esperando você) — a
trilha do inventário existe e ainda não tem leitor prático. Preciso da sua decisão.**
*(O texto abaixo é o registro original, de quando o item nasceu; o desfecho está no bloco no fim
dele. Mantido inteiro em vez de reescrito, para você reconhecer o que decidiu e o que não.)* A etapa passou a gravar cinco atos por conferência (e a exigir um
motivo de quem cancela), mas: (a) **nenhuma tela mostra o log**, e (b) a consulta exige perfil
de **Administrador** — então o Gestor que conduziu o inventário não consegue ver nem o próprio
registro. **Escolhido** fechar o gate agora, porque antes dele QUALQUER usuário do módulo lia
o log inteiro do almoxarifado (incluindo de/para de custo e de requisição) — isso era
exposição real. **Descartado** abrir para Gestor por conta própria: seria decisão de exposição
tomada no seu lugar. As opções: (1) fica só com Administrador e a leitura é sob demanda
técnica; (2) abre para Gestor também; (3) constrói-se uma tela de auditoria filtrada por
conferência (aí o Gestor vê o log do inventário dele sem ver o resto). A (3) é a resposta
completa e é uma etapa própria.

> **✅ FECHADO NA ETAPA 22 (`8c6ffbe..169458d`) — a metade (a) deste item foi paga: a trilha tem
> tela.** `/almoxarifado/auditoria`, com filtro de entidade, ação, pessoa e período, o de/para
> legível e paginação. **A metade (b) continua sua e continua em aberto:** o gate segue sendo
> **Administrador** (`configurar`), então o Gestor que conduziu o inventário ainda não vê o
> próprio registro. Das três opções acima, foi entregue **a tela** — mas para Administrador, que
> era a opção (1) somada à tela, e **não** a (3) (tela filtrada por conferência para o Gestor).
> Abrir para o Gestor continua sendo decisão de exposição sua, e é uma linha de código
> (`ACAO_PERFIS` em `permissions.js`). Deixado como está de propósito: alargar o gate por conta
> própria seria decidir exposição no seu lugar, que é justamente o que este item dizia não fazer.

**B34 (NOVO, da Etapa 18) — cancelar inventário agora exige justificativa escrita.** Antes era
um clique. **Escolhido** exigir motivo (mínimo 5 caracteres), pela mesma régua que a conclusão
com ajuste já usava — cancelar uma contagem inteira é tão destrutivo quanto homologar o ajuste
dela. **Descartado** deixar opcional. Se sua equipe achar o atrito demais em cancelamentos de
rotina (ex.: conferência aberta por engano), diga — a régua está num lugar só.

**B35 (NOVO, da Etapa 19) — a URL do webhook de WhatsApp é tratada como portadora de
credencial. Confirme se está certo.** O histórico passa a guardar o endereço do webhook sem os
parâmetros (`https://api.exemplo/send?(credenciais omitidas)`). **Escolhido** assim porque o
token costuma viajar ali — a própria configuração descreve a chave de API separada como
"opcional", ou seja, o desenho já prevê o token dentro da URL. **Descartado** mascarar a URL
inteira (o histórico perderia a informação de *para qual serviço* apontava) e descartado
deixar em claro (a configuração guarda só o valor atual, mas o histórico é permanente: um
token rotacionado sumiria de um lado e ficaria para sempre do outro). Se no seu caso o webhook
nunca leva token, isso é só cosmético.

**B36 (NOVO, da Etapa 19) — mudar uma regra e receber erro na tela ainda registra a mudança.**
Numa das rotas, a regra é gravada antes de a tela montar a resposta; se o segundo passo falha,
você vê erro mas **a regra mudou**. **Escolhido** registrar assim mesmo — o histórico descreve
o que ficou no banco, não o que a tela mostrou. **Descartado** registrar só no caminho de
sucesso, que era o comportamento anterior e deixava exatamente esse caso sem rastro.

**B37 (NOVO, da Etapa 20) — a senha de e-mail e a chave de API voltam para a tela como
`********`, não somem da resposta.** **Escolhido** reusar exatamente a máscara que a tela de
Alertas de Estoque já mostrava, para que as duas telas falem a mesma língua — e, quando não há
senha gravada, o campo volta **vazio**, nunca mascarado (dizer `********` para senha inexistente
mentiria "já está configurado" e a tela usa isso para decidir o texto do campo). **Descartado**
omitir a chave da resposta (mudaria a forma do payload e a tela percorre as chaves uma a uma) e
**descartado** um campo novo do tipo "configurado: sim/não" (formato inventado só para este caso,
que ninguém mais no sistema usa). Reversível: é uma linha.

**B38 (NOVO, da Etapa 20) — o salvamento genérico de configurações passa a RECUSAR a senha de
SMTP e a chave de API.** Antes ele aceitava (as duas chaves são semeadas como qualquer outra) e
**sem** a proteção que a tela de Alertas usa — a que ignora o reenvio da máscara. Com a máscara do
B37, deixar assim seria o pior dos mundos: alguém lê `********`, salva, e **a máscara vira a
senha**, derrubando o envio de e-mail em silêncio. **Escolhido** recusar com uma mensagem que
aponta o caminho certo (`Configuração "alertas_smtp_pass" só pode ser alterada em Configurações →
Alertas de Estoque`), **antes** de qualquer gravação — se a recusa viesse no meio, metade do
formulário ficaria aplicada, porque essa gravação não tem transação. **Descartado** aceitar e
ignorar em silêncio (o usuário acharia que salvou) e **descartado** replicar ali a proteção da
outra tela (duas réguas com o mesmo nome é exatamente o defeito que já apareceu nesta base).

**B39 (NOVO, da Etapa 20) — ler o mapa de "quais materiais cada setor pode requisitar" passa a
exigir o MESMO que mudá-lo: administrador do Almoxarifado ou super administrador.** **Descartado**
o gate mais estreito que as telas de configuração usam — leitura e escrita da mesma coisa devem
exigir o mesmo, e o gate escolhido é literalmente o da rota irmã de escrita, mensagem inclusive.
**Nenhum efeito para quem usa o sistema:** a única tela que lê esse mapa é a aba administrativa de
Configurações do Almoxarifado, que já era só de administrador. Se um dia o Gestor precisar
consultar o mapa do setor dele, é abertura de acesso e a decisão é sua.

**B40 (NOVO, da Etapa 20) — a URL do webhook de WhatsApp continua saindo EM CLARO na leitura das
configurações, de propósito.** Ela é o campo que o administrador edita na tela: devolvê-la
mascarada faria a tela regravar a máscara **como se fosse a URL** no primeiro Salvar, matando as
notificações em silêncio — o mesmo acidente que o B38 evita do outro lado. Some a isso que a rota
irmã de Alertas já devolve o webhook em claro **sob o mesmo gate**, então mascarar num dos dois
lugares não reduziria exposição nenhuma. **Descartado** mascarar e **descartado** reusar a máscara
do histórico (ela devolve `(credenciais omitidas)`, que é vocabulário de log, não de formulário).
A proteção de fundo continua valendo onde importa: o **histórico** de auditoria, que é permanente,
guarda o endereço sem os parâmetros desde a Etapa 19 (B35). A consequência aceita está na letra
**C24**. O conserto definitivo é tirar o token de dentro da URL, em etapa própria — decisão sua.

**B41 (NOVO, da Etapa 20, EM ABERTO — preciso da sua resposta) — a lista de setores de requisição
continua dizendo, para qualquer usuário do módulo, QUANTOS materiais cada setor tem liberados.**
Achado pela revisão adversarial desta etapa e **declarado em vez de consertado**. Não é o mapa (não
diz *quais* materiais nem *quais* perfis), mas é a mesma tabela e o mesmo tipo de reconhecimento
que motivou o B39: dá para saber quais setores têm lista explícita e quais estão abertos. Não foi
fechado porque **quem consome essa lista é a tela de requisição**, usada por gente que não é
administrador — fechar exige decidir o que ela passa a receber, o que é mudança de contrato e não
uma linha de gate. As opções: (1) fica como está (o número é reconhecimento fraco); (2) o número
some para quem não é administrador (a tela de requisição perde a coluna); (3) o número vira um
campo próprio pedido só pela tela administrativa. A (3) é a resposta completa e é trabalho de uma
tarefa, não de uma linha.

**B42 (NOVO, da Etapa 21) — o envio de e-mail do CRM continua NÃO olhando para as configurações de
e-mail gravadas no banco.** A precedência nova é **ambiente do servidor → valor do código**, e o
**banco ficou de fora de propósito**. **Descartado** o desenho original desta própria etapa, que
mandava "usar o banco quando host e senha estiverem preenchidos" — e a medição mostrou que aquilo
não era salvaguarda, era um **interruptor que dispararia no primeiro deploy**. Medido direto no
banco em 28/08, duas vezes (a segunda porque a primeira tinha sido herdada sem revalidar, e é o
motivo inteiro da decisão): o host gravado é `smtplw.com.br`, **outro produto** da Locaweb, com
outro esquema de credencial, e não o `smtp.locaweb.com.br` que está funcionando; e o remetente
gravado é `compras@gmp.ind.br, sheila@gmp.ind.br` — **dois** endereços, que o servidor de e-mail
recusa num remetente. Adotar o banco trocaria o host de **produção** sem ninguém pedir. Para adotá-lo
seria preciso um envio real testado contra aquele host, o que não dá para fazer daqui. **Consequência
aceita:** a aba Email da tela de Configurações continua editável e continua sem efeito sobre o
envio. Se você quiser que ela passe a valer, é uma tarefa própria, com teste de envio real.

**B43 (NOVO, da Etapa 21) — a senha do backup continua podendo vir na própria URL, com aviso de
depreciação no log.** **Escolhido** manter o caminho antigo funcionando. **Descartado** recusá-lo,
que era o desenho inicial: o comentário da própria rota documenta esse uso desde sempre, e **pode
existir uma rotina automática na VPS que eu não enxergo daqui**. Quebrar o backup de produção para
fechar um risco menor (a senha aparecer no log de acesso do servidor) seria trocar um problema por
um pior. O que a etapa faz é **avisar**: cada chamada por esse caminho grava `QUERY_DEPRECIADA` no
log. Quando você confirmar que ninguém mais usa a URL com a senha dentro, recusar vira uma linha.

**B44 (NOVO, da Etapa 21) — senha de backup curta demais AVISA, não recusa.** **Descartado** exigir
32 caracteres (também do desenho inicial): não há arquivo de configuração no repositório, então o
tamanho da senha real de produção é **desconhecido daqui** — e recusar uma senha curta **porém
correta** deixaria o backup de produção sem funcionar no dia do deploy, sem ninguém entender por
quê. **Escolhido** registrar `CURTO` no log a cada uso. Se aparecer no log, troque a senha por uma
longa; aí sim recusar passa a ser seguro.

**B45 (NOVO, da Etapa 21) — tentar gravar a máscara por cima da senha do SMTP recebe erro 400, não
um "salvo com sucesso" mentiroso.** **Descartado** o 200 silencioso (que é o que a tela de Alertas
do Almoxarifado faz), porque lá a tela **nunca** reenvia a máscara e aqui ela reenviava a cada
tecla: aceitar em silêncio faria a tela dizer "salvo com sucesso" para uma gravação que não
aconteceu. **Escolhido** o mesmo comportamento do salvamento genérico do Almoxarifado — recusar com
uma mensagem que diz o que fazer (`deixe o campo em branco para manter a senha atual`). Valor vazio
também é recusado: apagar a senha passa a exigir um ato deliberado no banco, não um `Backspace`
distraído num formulário que salva sozinho.

**B46 (NOVO, da Etapa 21) — a senha do e-mail continua escrita no código, como último recurso.**
**Descartado** apagá-la nesta etapa. Sem ela, e sem `SMTP_PASS` definida no ambiente, o envio de
e-mail **cai em qualquer máquina** — incluindo, possivelmente, a VPS de produção, que pode não ter
arquivo de configuração. Como ela já está no histórico do repositório desde março, apagá-la agora
seria **risco imediato em troca de zero ganho**: o que resolve é a rotação no provedor (item **A3**),
e depois dela o valor do código deixa de abrir qualquer coisa. Fica no código com um comentário
dizendo, em voz alta, que é credencial comprometida à espera de rotação.

**B47 (NOVO, da Etapa 22) — os nomes inconsistentes das ações foram normalizados NA TELA, e o
dado histórico ficou intacto. Se você quiser o conserto de verdade, é só mandar.** O módulo grava
o mesmo ato com nomes diferentes conforme a tela que o gravou: `CRIACAO` **e** `CRIAR`, `EDICAO`
**e** `ATUALIZACAO` **e** `ATUALIZAR`. **Escolhido** agrupar os sinônimos **na exibição** — o
filtro "Criação" traz as duas grafias e cada linha mostra, em letra miúda, o nome cru que está
gravado. **Descartado** corrigir no banco (um comando que reescreve `CRIAR` para `CRIACAO` em
todas as linhas antigas): é o conserto de verdade, e é **irreversível sobre dado histórico** —
reescreve o que o sistema afirma ter registrado, que é exatamente o que uma trilha de auditoria
não pode sofrer. Não há como voltar atrás depois. **O mapa de sinônimos já está pronto e medido**
(68 nomes de ação, todos com rótulo); se você decidir que quer a migração, ela é um passo curto e
não precisa de investigação nova.

**B48 (NOVO, da Etapa 22) — "excluir" e "desativar" aparecem como UM ato só na tela.**
**Escolhido** juntar `EXCLUSAO` e `DESATIVACAO` sob o rótulo **"Exclusão"**. **Descartado**
mantê-los separados. O motivo é medido, não estético: **os dois fazem a mesma coisa no banco** —
marcam a linha como inativa. Um cadastro de material sai como `DESATIVACAO`; um tipo de material,
uma localização, um setor e uma família saem como `EXCLUSAO`; nenhum dos dois apaga nada de
verdade. São o mesmo ato com nome diferente por tipo de cadastro. Se para você esses dois atos são
gerencialmente diferentes, separá-los é uma linha e me diga.

**B49 (NOVO, da Etapa 22) — a tela ganhou "Anteriores / Próximos", que não estava no plano.**
**Escolhido** acrescentar a navegação de páginas. **Descartado** entregar só o aviso de corte,
como o plano previa: sem paginação o aviso vira um beco sem saída — a tela diria *"encontrei 4820
registros e mostro 200"* sem oferecer nenhum caminho para ver o resto, e quem audita ficaria
preso estreitando filtros no escuro. Consequência: trocar um filtro ou limpar **volta para a
primeira página**, de propósito — manter a página 4 de um resultado novo mostraria lista vazia
sem motivo aparente, que nesta tela é justamente a resposta que não pode aparecer por engano.

**B50 (NOVO, da Etapa 22) — o fuso do filtro de período é fixo em horário de Brasília, e isso é
uma aposta declarada sobre o negócio.** **Escolhido** gravar `America/Sao_Paulo` como constante
do sistema. **Descartado** usar o fuso da máquina onde o servidor roda: servidores costumam ficar
em UTC, e nesse caso o recorte do dia sairia errado **em produção** enquanto continuaria certo na
máquina de desenvolvimento — o pior tipo de defeito, o que só aparece longe de quem pode ver. A
aposta é que o cliente opera num site só, no Brasil (a mesma premissa que sustenta o saldo global
por material). **Se um dia houver operação em outro fuso, este é um dos pontos que precisa mudar
junto** — e não é automático.

**B51 (NOVO, da Etapa 23) — salvar configurações virou tudo-ou-nada por um caminho, e a
alternativa óbvia foi descartada por medição, não por gosto.** O problema: a tela de Configurações
manda as 18 chaves a cada Salvar, e o sistema gravava **uma de cada vez**. Falhando na terceira, as
duas primeiras ficavam gravadas, você via erro, e **o histórico não ganhava linha nenhuma** —
configuração alterada, usuário achando que não salvou, e trilha muda. **Escolhido:** um único
comando de gravação que aplica as 18 juntas — o banco garante que um comando só é indivisível.
**Descartado:** a solução de manual, a *transação* (abrir, gravar tudo, e desfazer se falhar). O
motivo é medido e é grave: o sistema inteiro do CRM usa **uma conexão só** com o banco, e transação
ali vale para a **conexão**, não para o seu pedido. Entre o "abrir" e o "confirmar" da sua gravação
de configuração, **tudo o que qualquer outra pessoa gravasse no mesmo instante entraria junto** — e
o "desfazer" por causa de uma configuração **apagaria a movimentação de estoque que o almoxarife
acabou de lançar**. Trocar "histórico ausente" por "lançamento de outra pessoa revertido em
silêncio" não é progresso. **Ressalva honesta, medida na revisão e escrita porque a primeira versão
deste texto exagerava:** transação **em geral** não é proibida — a forma segura (a transação inteira
num comando só) existe e **o próprio CRM já a usa duas vezes**, na exclusão de usuário e na
renumeração de propostas. O que foi descartado é a forma com espera no meio. A recomendação
continua sendo o comando único, por ser mais simples e por não prender a conexão.

**B52 (NOVO, da Etapa 23) — clicar Excluir de novo no que já está inativo responde SUCESSO, não
erro.** **Escolhido** tornar a exclusão *idempotente*: o segundo clique devolve sucesso, com a
informação de que o item já estava inativo, e **não registra nada no histórico**. **Descartado**
responder erro (400/409, "este item já está inativo"). O motivo: a tela **permite** clicar de novo
— duas abas abertas, um duplo-clique, um F5 depois de excluir —, e transformar isso em erro na
cara do usuário seria quebrar a tela por causa de um conserto de histórico. O que essa etapa
conserta é **a trilha**, não o fluxo de quem opera. Consequência declarada: pela tela, excluir uma
vez e excluir duas vezes ficam **indistinguíveis** — é exatamente o que se queria, porque no
cadastro elas realmente têm o mesmo efeito. **Se para você o segundo clique deve avisar alguma
coisa na tela ("este item já estava inativo"), isso é uma mensagem no front e me diga** — mas o
histórico continua não registrando, porque não houve ato.

**B53 (NOVO, da Etapa 23) — havia uma doutrina escrita no código dizendo o CONTRÁRIO, e ela
perdeu.** No cadastro de material havia um comentário defendendo, com todas as letras, que
desativar um material já inativo **devia** virar registro, porque *"é justamente o caso em que o
log importa: quem tentou desativar de novo, e quando"*. **Escolhido** o oposto: não registrar.
**Descartado** manter a doutrina antiga. O motivo é a tela que a Etapa 22 entregou — antes dela o
argumento era defensável, porque ninguém lia a trilha. **Agora alguém lê**, e nessa tela uma linha
"Exclusão" de um material que já estava inativo é **indistinguível** de uma desativação de
verdade: mesmo verbo, mesmo autor, mesmo horário. Registrar tentativa sem efeito com o **mesmo
nome** do ato com efeito é o histórico mentindo por excesso. **Se um dia registrar tentativas
tiver valor, isso pede um nome próprio de ato ("tentativa de desativação"), nunca o mesmo** — e
aí é etapa nova, com decisão sua.

**B54 (NOVO, da Etapa 24, EM ABERTO — preciso da sua resposta) — quem não tem perfil definido
entra como Produção, e agora dá para apertar isso sem trancar ninguém.** O sistema resolve o
perfil nesta ordem: superadministrador → administrador de módulo → administrador de sistema →
perfil explícito → **Produção**. Ou seja, **um usuário do módulo sem perfil atribuído não é
"usuário sem acesso": é chão de fábrica** — ele já consulta, requisita e reserva material sem que
ninguém tenha decidido nada a respeito dele. O padrão mais seguro seria **Consulta** (somente
leitura). **Não mudei, de propósito:** apertar isso hoje trancaria, no dia do deploy, todo mundo
que opera sem perfil explícito — e no banco de desenvolvimento **só duas pessoas têm perfil
explícito**, as demais dependem do padrão. **O que mudou nesta etapa é que a alternativa virou
viável:** a tela de *Perfis de Acesso* permite dar perfil explícito a quem precisa **antes** de
apertar o padrão, e agora existe perfil para a Qualidade, que era um dos casos que forçavam a
manter o padrão largo. **Se você quiser apertar, o caminho é: (1) rodar a tela e atribuir perfil
a quem opera, (2) conferir a lista de quem ficou sem, (3) trocar o padrão.** Enquanto você não
disser, fica como está.

**B55 (NOVO, da Etapa 24) — o perfil Qualidade NÃO recebeu acesso à central de alertas, e isso
foi uma decisão minha corrigindo outra decisão minha.** A primeira versão do desenho dava a ele
*Ver a central de alertas*, com a justificativa de que "sem isso ele veria a tela de alertas vazia,
que parece que não há nada pendente". **A justificativa era falsa** — a tela não busca nada sem a
permissão e mostra o painel de "sem acesso", não uma lista vazia (isso foi corrigido na Etapa 11).
E o custo medido é o inverso do que eu supunha: a central **não tem régua por perfil** — ela
percorre o registro inteiro e entrega **11 alertas**, entre eles *estoque sem consumo* e *estoque
excessivo*, que carregam o **valor em dinheiro parado**. A Etapa 16 já tinha excluído Produção,
Engenharia e Consulta da central pelo mesmo motivo. **Escolhido:** deixar `ver_alertas` fora.
**Descartado:** dar a permissão e "avisar que ele vê valores". **Consequência declarada:** os
quatro alertas que seriam dele — material reprovado, divergência de recebimento, lote sem
certificado e a **fila de itens aguardando inspeção** — seguem invisíveis para o perfil. **A
tarefa que destrava isso é dar régua por perfil à central**; é etapa própria, e é a que eu
recomendo se vocês quiserem a Qualidade recebendo alerta.

**B56 (NOVO, da Etapa 24) — bloquear e desbloquear material avulso ficaram FORA do perfil
Qualidade, e o item da spec fica pago pela metade de propósito.** A especificação pedia o perfil
Qualidade com "inspecionar, aprovar/reprovar, **bloquear/liberar sob desvio**". As duas primeiras
estão entregues; a terceira **não**, porque bloquear/desbloquear material fora do fluxo de
inspeção usa a permissão de **ajustar saldo de estoque** (Administrador e Gestor), não a de
inspecionar. **Escolhido:** manter o perfil estreito — mexer em saldo disponível não é ofício de
qualidade, e abrir *ajustar saldo* para ele abriria junto o ajuste de inventário, que é o
lançamento de controle interno do módulo. **Descartado:** dar *ajustar estoque* ao perfil.
**Consequência concreta, medida:** na tela **Almoxarifado → Inspeções**, dois dos três botões do
topo ficam barrados para quem é Qualidade, com a mensagem que está na regra 2 da seção da etapa.
**Se para vocês bloquear por decisão de qualidade tem de caber neste perfil**, o caminho limpo
**não** é dar-lhe *ajustar estoque*: é criar uma permissão própria para bloqueio por qualidade —
mesmo critério que o módulo já usou três vezes (remessa a terceiro, ajuste de material de cliente,
ferramentas). É etapa curta, e depende da sua resposta.

**B57 (NOVO, da Etapa 25, EM ABERTO — preciso da sua resposta) — quais operações sobre material
crítico exigem duas assinaturas?**

> **Respondida PELA METADE pela Etapa 28 (2026-08-29, `9cef003..62cb2b1`):** a **saída de material
> crítico de uma requisição** — liberar para retirada e entregar — passou a exigir a **segunda
> conferência por outra pessoa** (ver a Etapa 28 e a **B62**). O que continua aberto aqui é o
> resto da pergunta: ajuste de estoque, transferência, sucata e devolução de material crítico
> **não** ganharam dupla assinatura. Se a resposta for "as mesmas regras para todas", cada uma é
> uma etapa pequena copiando o molde que a 28 deixou pronto.

A spec do módulo pede *"dupla conferência em materiais críticos"* desde o começo, e é o **último**
item da lista de segurança que continua sem construir. Ele não foi feito na Etapa 25 porque **não
é falta de código: é falta de resposta sua.** As duas peças já existem e estão testadas:

- **A marcação existe.** Cada material tem a marca **"material crítico"** no cadastro, e ela já
  decide duas coisas hoje: o material aparece como **risco de parada** na tela de reposição quando
  o saldo zera, e a carga dele **fica retida para inspeção** no recebimento (se a opção *"Exigir
  inspeção para materiais críticos"* estiver ligada).
- **A mecânica de dupla assinatura existe.** O **sucateamento** já funciona assim: uma pessoa
  solicita, **outra pessoa** aprova, e o sistema recusa se for a mesma — com a mensagem literal
  *"dupla aprovacao com a mesma pessoa nas duas pernas e uma assinatura com dois carimbos. A
  segunda assinatura tem de ser de outra pessoa."* Note que a barreira é por **identidade**, não
  por cargo: não basta ter o perfil certo, tem de ser gente diferente.

**O que falta é você dizer sobre o quê ela incide.** As opções, com a consequência de cada uma:

| Opção | O que acontece na prática | Custo operacional |
|---|---|---|
| **(a) Toda saída** de material crítico | Nenhuma peça crítica sai do estoque sem duas pessoas | **Alto.** Se material crítico for usado no dia a dia, para a produção toda vez que faltar um segundo aprovador no turno |
| **(b) Só ajuste e sucata** de material crítico | As correções manuais de saldo e as baixas por perda exigem dois; o consumo normal não | **Baixo.** É onde o risco de fraude e erro se concentra, e são operações raras |
| **(c) Acima de um valor** (ex.: R$ 5.000 na movimentação) | A regra deixa de ser sobre "crítico" e passa a ser sobre dinheiro | **Médio**, e depende de o custo do material estar sempre preenchido — hoje nem sempre está |
| **(d) Não fazer** | Fica como está: material crítico é sinalizado, mas nada exige segunda pessoa | Zero, e o item sai da lista de pendências |

**Minha recomendação, se você não quiser decidir agora: a (b).** É a que o precedente do
sucateamento já sustenta sem inventar regra nova, é onde o risco realmente mora, e não trava a
produção. **Nada foi implementado** — nem a (b) — porque implementar a errada custa mais que
esperar: seria travar operação de galpão com uma regra que ninguém pediu. Enquanto você não
responder, o comportamento é o **(d)**.

**B58 (NOVO, da Etapa 26, EM ABERTO — preciso da sua resposta) — renomear uma categoria deve
reclassificar os materiais que já a usam?**

Agora que a categoria é um cadastro editável, a pergunta apareceu: você renomeia **"Chapas"** para
**"Chapas e bobinas"** na aba Categorias. Os 40 materiais que estavam como "Chapas" continuam
gravados com o nome **antigo**, e a tela avisa isso na hora, com o texto literal:

> *"Renomear **não reclassifica** os materiais: os que já usam esta categoria continuam gravados
> com o **nome antigo**. Para movê-los, edite cada material."*

**Por que é assim hoje:** a categoria do material é um **texto** gravado dentro do cadastro do
material, não um vínculo com a linha do catálogo. Renomear a linha do catálogo não alcança os
materiais — do mesmo jeito que trocar o nome de uma pasta não muda o que está escrito dentro dos
documentos. **As três saídas:**

| Opção | O que acontece na prática | Custo |
|---|---|---|
| **(a) Deixar como está** — renomear não propaga, e a tela avisa | Quem renomeia sabe que precisa editar os materiais depois, ou conviver com o nome antigo. É o comportamento de hoje | Zero |
| **(b) Renomear propaga** — ao renomear, o sistema reescreve a categoria de todos os materiais que a usavam | O renome fica completo em um clique. **Mas vira uma edição em massa disparada por um campo de texto**: um renome errado toca centenas de cadastros de uma vez, e o desfazer é outro renome | **Médio.** É código curto, e o risco é operacional, não técnico |
| **(c) A categoria virar vínculo de verdade** (o material aponta para a linha do catálogo, não guarda o texto) | O problema deixa de existir: renomear é renomear, e todo mundo vê o nome novo. **É a resposta certa de modelagem** | **Alto.** É migração de estrutura do banco sobre o cadastro de material, com risco próprio, e precisa de etapa dedicada |

**Minha recomendação: (a) agora, (c) quando houver etapa para isso.** A (b) parece o meio-termo e
é a pior das três: entrega o efeito da (c) sem a garantia dela — continua sendo texto solto, só
que agora reescrito em massa por um campo que não parece perigoso. **Enquanto você não responder,
vale a (a)**, com o aviso na tela. Nada foi implementado além do aviso.

**B59 (NOVO, da Etapa 27, EM ABERTO — preciso da sua resposta) — o plano de inspeção deve ser
herdado da FAMÍLIA do material?**

Hoje o plano é **por material**: cada material tem a sua lista de características a medir. Se
vocês têm 40 eixos usinados que compartilham o mesmo *Diâmetro externo* com a mesma tolerância,
alguém cadastra isso **40 vezes**.

O requisito original diz "plano por material/**família**", e começar por material foi escolha
deliberada: **é o caminho reversível**. Herança de família é fácil de acrescentar depois; se o
plano tivesse nascido só na família, tirar isso depois mexeria em dado já gravado.

| Opção | O que acontece na prática | Custo |
|---|---|---|
| **(a) Continuar só por material** — como está | Cadastro repetido quando materiais parecidos compartilham tolerância. Em compensação, o que vale para cada material está escrito nele, sem indireção | Zero |
| **(b) Plano da família, herdado pelos materiais** — o material sem plano próprio usa o da família | Cadastra-se uma vez para o grupo. **A pergunta difícil vem junto:** quando o material tem plano próprio E a família tem, quem vence? Somam ou substituem? | **Médio.** É a decisão de negócio que pesa, não o código |
| **(c) Plano de família como MODELO de cópia** — cadastra na família e o sistema copia para o material no momento de criar | O material fica dono do que mediu, e mudar a família não mexe retroativamente em nada. É o mesmo espírito do congelamento que a etapa já usa nas medidas | **Médio-baixo** |

**Minha recomendação: (c), quando alguém sentir o incômodo do cadastro repetido.** Ela dá o ganho
da (b) sem a pergunta espinhosa de precedência, e combina com a regra que a etapa já adotou (o que
foi medido guarda a tolerância do dia). **Enquanto você não responder, vale a (a)** — nada foi
implementado além do plano por material.

**B60 (da Etapa 27 — ~~EM ABERTO~~ → CUMPRIDA EM 2 DE 3 PARTES pela Etapa 29; a terceira foi
descartada de propósito, e está dito abaixo por quê) — quando a tela ganhar campos de medida, a
caixa "Divergência dimensional" TEM de virar somente leitura.**

Está escrito aqui, e não só no plano técnico, porque é o tipo de detalhe que se perde entre uma
etapa e a seguinte — e porque **o defeito que ele evita é exatamente o que a Etapa 26 teve de
consertar**: uma tela mostrando uma coisa enquanto o banco guardava outra.

Hoje o formulário de Inspeções tem a caixa **Divergência dimensional**, clicável, e ela vale —
porque a tela não manda medida nenhuma. **No dia em que a tela mandar medidas**, a caixa passa a
ser **ignorada pelo servidor**: quem manda é o número. Se ela continuar clicável ao lado dos
campos de medida, acontece isto: o inspetor desmarca a caixa, o servidor marca sozinho porque a
peça saiu da tolerância, a tela exibe *desmarcado* e o registro guarda *marcado*. **A tela
mentindo, com o usuário achando que decidiu.**

**A regra para a etapa da UI, em três partes:** a caixa vira **somente leitura** assim que houver
pelo menos uma medida preenchida; ela mostra o resultado **derivado**, atualizado enquanto se
digita; e ao lado dela fica a explicação — *"calculada a partir das medidas"* — para não parecer
campo travado por defeito. **Sem medidas, ela volta a ser clicável e manual, como hoje.** Isso não
é opinião de projeto: o servidor já se comporta assim, e é a tela que precisa contar a mesma
história.

**O que a Etapa 29 cumpriu, e o que NÃO cumpriu — leia, porque a diferença é deliberada:**

| Parte da B60 | Estado |
|---|---|
| A caixa vira **somente leitura** com ≥1 medida preenchida | ✅ **Feito.** Fica desabilitada **e desmarcada**, e a flag manual **nem vai** no envio |
| Fica a **explicação ao lado** | ✅ **Feito**, com texto mais específico que o previsto: *"Derivada das medidas ao salvar — fora da tolerância liga sozinha"*, mais um parágrafo fixo abaixo do bloco dizendo que divergência fora do plano vai em Observações |
| Mostra o resultado **derivado, atualizado enquanto se digita** | ❌ **DESCARTADO** — ver abaixo |

**Por que a pré-visualização ao digitar foi descartada.** Para mostrar "conforme/não conforme"
enquanto o operador digita, a **tela** teria de calcular a tolerância — isto é, ter uma **segunda
cópia** da régua que o servidor já tem. E essa régua não é trivial: a Etapa 27 mediu que a versão
ingênua (sem a folga de arredondamento) **reprova 12,3% das peças que caem no limite exato** —
6.132 falsos em 50.000 pares varridos. Duas cópias da régua acabam divergindo, e o dia em que
divergirem a tela vai dizer *conforme* e o registro vai guardar *não conforme* — **exatamente o
defeito que a B60 existe para evitar**, só que com a tela do lado errado.

**O que foi feito no lugar:** o resultado vem do **servidor**, no aviso de sucesso — *"Inspeção
registrada! Divergência dimensional: sim (2 medidas)"* — e a tela mostra a **faixa** de cada
característica ao lado do campo (`[12.2 ; 12.4]`), que é a informação que o operador precisa
**enquanto digita** sem precisar de régua nenhuma: ele vê se o número que acabou de escrever está
dentro ou fora, e o veredito oficial continua saindo de um lugar só.

**Se você quiser a pré-visualização mesmo assim**, o caminho limpo **não** é calcular no client: é
um endpoint de avaliação (`POST .../avaliar-medidas`, sem gravar nada) que devolve o veredito
usando a **mesma** função do servidor. Custa uma chamada por digitação (com atraso) e mantém uma
régua só. Fica registrado como o desenho preferido, não como pendência.

**B61 (NOVO, da Etapa 27 — DECISÃO JÁ TOMADA, escrita para você poder desfazer) — informar o
instrumento de medição é OPCIONAL.**

O desenho desta etapa dizia *"medida exige instrumento"*. Ao implementar, a frase se mostrou
**imprecisa**: o campo do instrumento foi gravado como opcional, e exigi-lo em código contradiria
o próprio banco. **O que a regra de fato garante é "instrumento *declarado* e vencido não mede"**
— não "toda medida tem instrumento". Uma medida sem instrumento informado é aceita e fica gravada
com o campo vazio.

**Escolhido seguir o banco, e a razão é a direção do arrependimento:** tornar o campo obrigatório
depois é **uma linha de validação**; afrouxar depois exigiria mexer em medidas já gravadas —
justamente o dado que a etapa promete não reescrever. Entre as duas, a reversível é esta.

**Se vocês quiserem exigir o instrumento** (e há argumento: uma medida sem instrumento declarado é
rastreabilidade pela metade num processo que quer ser auditável), é meia hora de trabalho e a
recusa passa a acontecer no mesmo lugar das outras — antes de o saldo se mover. **Diga e eu
aperto.**



**B62 (NOVO, da Etapa 28 — decisão que EU tomei, reversível numa linha) — a segunda conferência é
obrigatória SÓ quando há material crítico ainda na caixa.**

A segunda conferência (outra pessoa confere a separação antes de o material sair) existe para
toda requisição, mas só **trava a saída** quando algum item **marcado como crítico** está
**separado e ainda não entregue**. As opções eram:

- **Sempre obrigatória** — toda requisição exige duas pessoas. **Descartado:** um almoxarifado
  que trabalha com **uma pessoa** por turno pararia de conseguir liberar qualquer coisa. Mudança
  de comportamento do fluxo inteiro, sem caminho de volta de manhã.
- **Nunca obrigatória** (só registrar quem conferiu) — **Descartado:** barreira que ninguém é
  obrigado a passar não é barreira, e a spec pede *dupla conferência em material crítico*.
- **Só com crítico na caixa** — **escolhido.** Usa a marca *material crítico* que já existe no
  cadastro e já decide outras duas coisas (risco de parada e retenção para inspeção).

**Consequência que precisa estar clara:** material crítico passa a exigir **dois usuários com
perfil Almoxarife (ou Administrador)** para sair. Se isso não servir, a régua é **uma função só**
no serviço de requisições; virar "sempre" ou "nunca" é uma linha. Ver o furo **C38**.

**B63 (NOVO, da Etapa 28 — decisão que EU tomei, reversível) — conferir só com a requisição "Em
Separação".**

A conferência só é aceita no status *Em Separação*; em qualquer outro a recusa é *"Só é possível
conferir uma requisição em separação (status atual: ...)"*. O caso que isso aperta: requisição
**Parcialmente Atendida** com crítico separado e **sem conferência** — não dá para entregar (falta
conferência) nem para conferir (status errado). No fluxo normal esse estado **não é alcançável**:
para chegar a *Parcialmente Atendida* com crítico separado, a entrega anterior já exigiu a
conferência, e ela continua valendo enquanto não houver rodada nova. Ele existe só para **dado
anterior à etapa** (C37). Saída: clicar **Ajustar Separação** e confirmar **sem mudar quantidade
nenhuma** — a requisição volta a *Em Separação* sem rodada nova, e outra pessoa confere.
**Descartado** aceitar conferência em *Parcialmente Atendida* antes de alguém precisar — é uma
linha na lista de status, se precisar.

**B64 (NOVO, da Etapa 29 — decisão que EU tomei, reversível numa linha) — ler o histórico de
inspeções e as medidas NÃO exige perfil; decidir a inspeção continua exigindo.**

As duas leituras novas desta etapa — a lista de inspeções decididas e as medidas de cada uma —
respondem a **qualquer usuário que consiga abrir a tela do módulo**, inclusive quem não tem perfil
definido (que o sistema trata como **Produção**). **Escolhi isso por consistência**, não por
descuido: a fila de pendentes e o plano de inspeção já eram legíveis por esse mesmo público desde
a Etapa 27, e o que o histórico mostra é o que a fila já mostrava — material, quantidades,
problemas, responsável — mais os números medidos.

**Descartado** exigir o perfil *decidir inspeção* para ler: transformaria a leitura em privilégio
de três perfis (Administrador, Almoxarife, Qualidade) e deixaria o comprador e a engenharia sem
conseguir conferir por que uma peça foi reprovada — que é justamente o uso que o furo **C35**
pedia. **A recusa continua onde importa:** o mesmo usuário sem perfil que abre o Histórico toma
**403** se tentar decidir uma inspeção, e isso está provado por teste.

**Se você quiser apertar**, é uma linha: acrescentar `requirePermission('inspecionar')` às duas
rotas de leitura. **Não** faça isso sem antes decidir a **B54** (o perfil padrão de quem não tem
perfil), porque as duas mexem no mesmo público.

**B65 (NOVO, da Etapa 30 — decisão que EU tomei, reversível) — a tela repete UMA régua do
servidor: a de nome duplicado. E ela é diferente da régua que a B60 proibiu de repetir.**

Ao clicar **Reativar** numa característica cujo nome foi recriado, quem recusa é o **índice do
banco** — e a mensagem que ele produz (*"Já existe esta característica no plano deste material"*)
não explica nada debaixo de um botão escrito "Reativar". Então **a tela verifica antes** e diz o
que fazer: *"Já existe uma característica ativa chamada "Rugosidade". Renomeie ou desative a outra
antes de reativar esta."*

**Por que isto não contradiz a B60**, que proibiu a tela de calcular tolerância: a régua da
tolerância **não é exatamente reproduzível** no client (tem folga de arredondamento, e a versão
ingênua erra 12,3% no limite — medido na Etapa 27). Já a régua do nome é **igualdade de texto**
sobre dados que a tela tem **inteiros** na mão, e é reproduzível ao caractere. **Para continuar
sendo**, a comparação é texto **exato**, sem ignorar maiúsculas e sem ignorar acento — porque o
banco também não ignora: `RUGOSIDADE` ao lado de `Rugosidade` é **aceito** pelo sistema. Se a tela
"ajudasse" comparando de forma amigável, passaria a barrar o que o servidor aceita — e aí ela
estaria mentindo, que é justamente o que a B60 existe para evitar.

**O servidor continua sendo quem decide.** A checagem da tela é só pela mensagem; se o conflito
nascer de outra pessoa enquanto a janela está aberta, a recusa do servidor aparece literal.
**Descartado** deixar só o erro do banco aparecer (o usuário não saberia o que fazer) e
**descartado** a tela deixar passar e "corrigir depois".

**B66 (NOVA, da Etapa 31 — ESPERA VOCÊ) — você quer numeração sequencial por ano?**

Hoje o número de documento é **gerado pelo sistema e não tem significado**: um carimbo de tempo
mais um sorteio, como `REM-MTHK5F35ABC12345`. Ele serve para identificar, não para contar.

**O que uma ERP madura costuma fazer no lugar** é numeração **sequencial por ano** —
`REQ-2026-0001`, `REQ-2026-0002` — que dá três coisas que o formato atual **não** dá: dá para saber
**quantos** documentos houve no ano só olhando o último; dá para perceber **buraco** na sequência
(documento apagado ou perdido); e é o formato que contador e auditor esperam ver.

**O custo, dito com honestidade:** exige uma **tabela de contador** e a resposta a uma pergunta de
negócio que só você pode dar — **reinicia em 1 a cada ano ou continua correndo?** —, mais a decisão
sobre o que fazer com os documentos já existentes (conviver com dois formatos, como hoje, ou
renumerar). E introduz um ponto de disputa que o formato atual não tem: dois usuários criando ao
mesmo tempo disputam **o mesmo próximo número**, então a sequência precisa de trava — que é
exatamente o problema que esta etapa acabou de resolver por outro caminho.

**Minha recomendação: só faça se alguém pedir**, e nesse caso a pergunta que decide é se o número
precisa ser **contável** (aí é sequencial) ou só **único** (aí o de hoje já serve). **Enquanto você
não responder, vale o que está** — nada foi implementado nessa direção.

**B67 (NOVA, da Etapa 32 — decisão que EU tomei, reversível) — remover um anexo esconde o
documento, mas NÃO apaga o arquivo do disco.**

Quando alguém remove um anexo, ele some da tela imediatamente e a remoção fica na trilha de
auditoria (quem removeu, quando, o que era). **O arquivo em si continua no servidor.**

**Por que assim:** anexo de qualidade é certificado, relatório dimensional, foto de recebimento —
prova de que alguma coisa foi feita. Se o arquivo fosse apagado junto, a linha de auditoria viraria
uma **promessa vazia**: ela diria que existiu um certificado que ninguém mais pode ver, e numa
auditoria externa "o sistema registra que houve" vale muito menos do que "o sistema mostra qual
era". Remover errado também é comum, e sem o arquivo não há como desfazer.

**O que foi descartado:** apagar o arquivo junto com a remoção. Economiza disco e é o
comportamento que mais gente espera de um botão "Remover" — mas é **irreversível**, e a etapa
escolheu o caminho que dá para voltar atrás. **O custo desta escolha é disco**: nada expurga esses
arquivos hoje (a retenção de uploads é corte declarado desde a feature 23). Se o volume incomodar,
me diga e a rotina de expurgo vira uma etapa.

**B68 (NOVA, da Etapa 32 — decisão que EU tomei, reversível numa linha) — quem VÊ o almoxarifado
baixa qualquer anexo; quem REMOVE é só o administrador e o almoxarife.**

São duas ações novas, e a assimetria é deliberada. **Anexar** é largo — todos os perfis menos
`CONSULTA` —, porque anexar é ato de quem opera: compras anexa a nota fiscal do recebimento,
qualidade anexa o certificado, produção anexa o desenho da requisição. **Baixar** exige só
`visualizar`, a mesma permissão de abrir o módulo. **Remover** é estreito: `ADMINISTRADOR` e
`ALMOXARIFE`.

**O que isso significa na prática, dito claramente:** qualquer pessoa com acesso ao módulo — o que
inclui o perfil `CONSULTA` — **baixa qualquer anexo de qualquer documento**. Não há régua por
entidade: quem vê o almoxarifado vê o certificado da inspeção e a nota fiscal do recebimento.

**E a revisão mediu duas consequências que faltavam nesta letra, porque são o que torna a decisão
arbitrável:**

1. **Não é preciso conhecer documento nenhum para baixar.** Os identificadores de anexo são
   **sequenciais** (1, 2, 3...), então um programa que peça um por um leva o acervo inteiro sem
   nunca abrir uma tela. Isso vale para qualquer pessoa com acesso ao módulo.
2. **Por isso — e só por isso — baixar passou a ficar registrado.** É a única leitura auditada do
   módulo inteiro. Numa decisão desenhada como "todo mundo baixa", a trilha é o que separa
   *aberto* de *aberto e invisível*: sem ela não há prevenção **nem** detecção. Você vê quem
   baixou o quê e quando, em Almoxarifado → Auditoria, como "Anexo baixado".
   **O custo, dito com honestidade:** uma linha de auditoria por download, numa tabela que nada
   expurga hoje. Se o volume incomodar, apagar esse registro é uma linha — mas aí a decisão de
   deixar todo mundo baixar fica sem nenhum controle, e é você que arbitra esse par.

**E uma consequência do fallback de perfil, que vale saber:** usuário do sistema **sem perfil de
almoxarifado configurado** cai em `PRODUÇÃO` por padrão — e `PRODUÇÃO` **pode anexar**. Ou seja,
alguém recém-cadastrado já anexa documento antes de qualquer configuração. Isso é o
comportamento geral do módulo (está na regra das duas camadas), não uma escolha desta etapa, mas
aqui ele encosta em arquivo e por isso está escrito.

**O que foi descartado:** um gate por entidade (anexar em inspeção exigiria `inspecionar`, em
recebimento exigiria `receber_material`). Ele é mais preciso, mas obriga a checar a permissão
**depois** do upload — porque a entidade só é conhecida quando o formulário já chegou —, o que
significa gravar o arquivo em disco para então recusar e apagar. Preferi a régua simples, que
recusa na porta. **Se você quiser restringir o download, é uma linha** e eu faço na etapa seguinte.

**B69 (NOVA, da Etapa 32 — decisão que EU tomei, reversível) — material desativado continua
aceitando anexo.**

Excluir material no sistema é **desativar** (a linha continua no banco). A checagem que impede
anexar num registro inexistente **não** exige que o material esteja ativo — de propósito: ficha
técnica e certificado de material aposentado são exatamente o tipo de documento que se precisa
consultar depois. **O que foi descartado:** exigir `ativo = 1`, que além de bloquear esse caso
funcionaria só para material — requisição, recebimento e devolução não têm essa coluna com esse
sentido, e a régua ficaria diferente por entidade sem que ninguém entendesse por quê.

**B70 (NOVA, da Etapa 33 — decisão que EU tomei, reversível) — o endereço do arquivo expira em
15 a 20 minutos, e não usei o login para proteger.**

Havia dois caminhos para fechar o furo dos arquivos públicos:

- **Exigir login no próprio endereço.** É o mais óbvio — mas **não funciona para imagem**: quando
  o navegador carrega uma foto dentro de uma tela, ele não manda o login junto. Para funcionar,
  cada foto teria de ser baixada por dentro do sistema, uma por uma, e a tela de montar
  requisição desenha **um cartão por material** — cinquenta materiais virariam cinquenta
  downloads. Ficou **descartado**.
- **Endereço assinado e temporário**, que é o que foi feito: o servidor entrega um endereço que
  vale para **aquele arquivo** e por **15 a 20 minutos**.

**O que se ganha e o que se paga.** Ganha-se que um endereço copiado não vira acesso permanente
e que nada abre sem passar pelo sistema. Paga-se que **tela aberta por muito tempo mostra imagem
em branco até recarregar** — e isso aparece mais na tela de montar requisição, que é a de uso
mais demorado do módulo e carrega as fotos conforme você rola a lista.

**Uma coisa que eu recusei de propósito, e vale você saber:** o sistema aceita receber o login
no próprio endereço (`?token=...`), e usar isso teria sido a correção de uma linha. **Não usei**,
porque o login do CRM não expira em minutos e dá acesso ao sistema inteiro — colocá-lo no
endereço de uma imagem o joga no histórico do navegador e no registro de acesso do servidor.
A assinatura desta etapa não é o seu login: ela vale para **um arquivo** por **poucos minutos**.

**Se os 15 minutos incomodarem na prática**, aumentar é uma linha — me diga o número.

### C. Furos e mudanças de número que quem opera precisa saber

1. **✅ RESOLVIDO NA ETAPA 10 — a conferência de inventário mudava saldo de material de cliente
   sem a permissão especial.** Este item dizia que a conferência gravava o saldo por um caminho
   próprio, fora do motor, e por isso um usuário barrado no ajuste pela tela de Movimentações
   conseguia mudar o mesmo saldo pela conferência. **A Etapa 10 reescreveu exatamente esse
   caminho**: a conclusão da conferência agora passa pelo mesmo motor de qualquer outra
   movimentação, e a mesma autorização (`ajustar_material_cliente`) é exigida nos dois lugares.
   Deixado aqui, riscado, em vez de apagado — para quem lembrar do furo antigo confirmar que
   fechou, com o número da etapa que fechou.
2. **Devolução para Sucata pode parar no meio, sem avisar ninguém.** A devolução para sucata
   lança duas movimentações (entrou / foi descartada). Se a segunda falhar depois de a primeira
   ter entrado, a devolução fica marcada como **estado parcial** na auditoria e a correção é
   manual, pela tela de Movimentações. **Ninguém é notificado.**
3. **🚨 O VALOR DO ESTOQUE VAI MUDAR — e muda para CERTO. Bug antigo, achado e corrigido durante a
   8c.** Isto **não** é uma mudança da 8c: é um defeito que existia **antes** dela e que a 8c achou
   por acidente, ao precisar ler o custo da chapa para ratear.
   - **O que estava errado:** a conta do valor tentava usar *"o custo médio, ou, se não houver, o do
     cadastro"*. Mas o custo médio de material que **nunca recebeu nota fiscal** não é "não existe"
     — ele é **zero**. E "zero" não é "não existe": a conta parava no zero e **nunca chegava no
     custo do cadastro**. Resultado: **material cujo custo foi digitado só no cadastro valia R$ 0,00**.
     Como quase todo o acervo é anterior ao recebimento por NF, **isso valia para quase tudo.**
   - **Medido, não deduzido:** material com custo de cadastro **R$ 10** e custo médio **0** — a
     fórmula antiga devolvia **0**; a nova devolve **10**.
   - **Antes → Agora:** o relatório **"estoque atual"** e a **consulta de estoque** mostravam
     **R$ 0,00** e passam a mostrar **R$ 10,00 × a quantidade**. **Os números vão subir. Não é
     inflação — é o número certo aparecendo pela primeira vez.**
   - **O card "Valor em Estoque" do Dashboard também muda, por outro motivo:** ele **nunca** zerou;
     ele somava pelo custo do **cadastro** e passa a somar pelo **custo médio**. Para material que
     nunca recebeu nota com custo — **a maioria hoje** — o número é **exatamente o mesmo de antes**.
   - **Nada a rodar em produção, nenhum dado foi tocado.** O custo sempre esteve certo no banco; só
     a **leitura** estava errada.
   - *Uma ressalva honesta:* as duas leituras que zeravam **não têm tela** — são API. A única
     conferência clicável desta correção é o card do Dashboard. O guia tem o roteiro.
4. **O QUE O CLIENTE LÊ COMO "CONSUMIDO" MUDA — outro bug antigo, achado e corrigido durante a 8c.**
   Na tela **Materiais de Clientes → Posição**, a coluna **consumido** passa a incluir o material
   **consumido no processo do terceiro** e o **perdido no terceiro** — que antes não entravam em
   coluna nenhuma. E **recebido** passa a incluir a peça que voltou **transformada**.
   - **O efeito prático:** antes, o material sumia do saldo **sem aparecer em consumido** ("para
     onde foi isso?"), ou aparecia com **saldo e recebido zero** ("de onde saiu isso?"). A conta
     *recebido − consumido − devolvido = saldo* simplesmente não fechava.
   - **O saldo não muda** — ele nunca veio dessas somas. O que muda são as **colunas explicativas**.
   - **Se você já apresentou essa tela a um cliente, os números da coluna "consumido" vão estar
     maiores da próxima vez.** Vale avisar.
5. **🚨 (Etapa 9) O TIPO "SUCATA" SUMIU DO FORMULÁRIO DE MOVIMENTAÇÕES — e é de propósito.** Quem
   sucateava por ali vai procurar o tipo e não vai achar. Os caminhos válidos agora são **dois**:
   o **processo de sucateamento** (Almoxarifado → Sobras e Retalhos → aba Sucateamentos —
   solicitação + duas assinaturas de pessoas diferentes) e a **devolução com destino Sucata**
   (continua igual). `Perda` **continua** no formulário. O motivo: enquanto qualquer pessoa com
   permissão de movimentar pudesse baixar patrimônio escolhendo "Sucata" numa lista, a regra de
   dupla aprovação que o requisito exige seria decorativa. **Isto precisa ser contado a quem opera
   ANTES do deploy** — senão o primeiro sucateamento do dia vira chamado de "sumiu função do
   sistema". Detalhe operacional que decorre disso: sucatear passou a exigir **duas pessoas**;
   material com **número de série** não passa pelo processo (a recusa manda baixar pela tela de
   Movimentações, que tem seletor de série).
6. **(10) A contagem cega não é blindagem perfeita — o número escondido pode voltar pela conta.**
   Se a divergência de um item passa da tolerância, a mensagem de "recontagem necessária" mostra
   o **percentual** de divergência. Quem sabe quanto contou consegue calcular quanto o sistema
   dizia que tinha, fazendo a conta ao contrário (percentual × contado). A tela já era honesta
   sobre isso desde o desenho (a "cegueira" protege a coluna de saldo, não o sistema inteiro — um
   usuário que tem acesso à tela de Materiais já vê o número lá de qualquer forma), mas vale saber
   que a mensagem de recusa é outro caminho pelo qual o número escondido pode aparecer.
7. **(10b) Contar "só o que tem parte em terceiro" durante uma remessa ativa gera divergência
   falsa — e ela é CONCENTRADA exatamente nesse escopo.** O esperado do item desconta o que está
   no galvanizador **no momento da criação da conferência**; se uma remessa sai (ou volta) no
   meio da contagem, o operador que contou certo aparece como divergente, e o número entra na
   acuracidade e no impacto financeiro. **O saldo não corre risco** (medido: o ajuste soma a
   retenção de volta e o estoque termina certo) — o que mente é a **métrica**. Como o escopo
   "com saldo em terceiros" seleciona exatamente os materiais cuja retenção se move, a regra
   prática é: **não contar esse escopo com remessa em andamento** (congelar movimentação foi
   corte declarado — letra D).
8. **(10b) A flag "dupla contagem" não força ninguém a recontar** — item dentro da tolerância
   nunca é recontado, e a conferência conclui normalmente. A flag garante só que, **quando**
   houver recontagem, ela seja de outra pessoa. Por isso o relatório de Acuracidade tem a coluna
   **Recontados**: um inventário "com dupla contagem" e recontados = 0 significa que ninguém
   conferiu nada em dupla — o selo vale o que o número disser. (E um detalhe de API: em
   conferência SEM a flag, re-salvar o mesmo valor pela mesma pessoa ainda marca recontagem —
   mecânica da Etapa 10; a tela não faz mais isso por acidente, porque tabular sem digitar não
   salva.)
9. **(11) Os dois caminhos de gerar solicitação podem pedir EM DOBRO — nos dois sentidos.**
   Medido na revisão final: (a) gerar pela tela nova → vincular a pedido → rodar o
   **verificar-mínimos legado** duplica, porque o dedupe legado só enxerga PENDENTE e a
   vinculada fica invisível para ele; (b) solicitação que **envelhece além do horizonte**
   (60 dias) deixa de contar na posição e a tela volta a sugerir — segundo pedido. Na prática
   é cenário de administrador (o verificar-mínimos tem gate restrito), a linha avisa quando há
   **solicitação antiga aberta**, e o conserto de verdade é fechar a solicitação no
   recebimento (letra E) — mas quem operar os dois caminhos precisa saber que eles não se
   enxergam completamente.
10. **(11) Comprar o lote econômico pode estourar a máxima — e a outra aba vai chamar de
    excesso.** Material com máxima 200 e lote econômico 500: a sugestão respeita o lote (500),
    o material chega, e o Estoque Parado o marca como Excesso. Comprar o lote mínimo do
    fornecedor não é erro; só saiba que as duas abas vão "discordar" de propósito.
11. **(10b) O escopo gravado é fotografia do momento da criação.** Renomear uma família ou mudar
   a classe ABC de um material **depois** não altera o texto `Classe A + ...` gravado na
   conferência — nem os itens que entraram. É a semântica certa (o registro histórico diz o que
   foi contado), mas quem estranhar "o escopo diz X e o material hoje é Y" precisa saber que o
   texto é da época.

12. **(12) Fluxos em lote geram um e-mail POR ITEM — com números.** Com o e-mail de
   movimentação ligado (B15): entregar uma requisição de 10 itens = **10 e-mails**; encerrar
   uma remessa de N itens = **N** (consumo/perda por item); transformação com N linhas de
   resultado = **N**. É o que a spec pede ("toda entrada e saída"), mas quem liga a config
   precisa saber o volume. As duas rajadas piores foram **cortadas**: conclusão de conferência
   de inventário (seriam 50-300 num clique) e envio de remessa **não geram e-mail nenhum**.

13. **(12) Desligar o e-mail não segura o que JÁ entrou na fila.** O checkbox e as configs
   valem na hora de **enfileirar**; linha que já estava PENDENTE quando você desligou ainda
   sai no próximo processamento (com o robô diário, até 24 h depois). Hoje não há botão de
   descartar linha pendente (só reenviar) — também declarado na letra D.

14. **(12) Mudar o intervalo do robô da fila só vale depois de REINICIAR o servidor.** A
   config `notificacoes_worker_intervalo_min` é lida uma vez no boot (30 s depois de subir).
   O espaçamento das retentativas (backoff) muda na hora; o tique do robô, não.

15. **(14) Re-vincular sobrescreve o vínculo — e a chegada do pedido ANTIGO não fecha mais a
   solicitação.** Vincular a solicitação ao pedido 100 e depois ao pedido 200 apaga o vínculo
   com o 100 sem histórico; se a nota do pedido 100 chegar, **nada fecha** (o fechamento olha o
   vínculo atual). Quem re-vincula precisa saber que "desfez" o fechamento automático do pedido
   anterior. É consequência declarada do desenho da B22(c).

16. **(14) Estornar SÓ a perna de entrada de uma devolução-sucata infla o Consumido do
   relatório Custo por projeto.** A devolução para sucata lança duas movimentações (entrada +
   sucata). Cancelar apenas a entrada deixa a perna SUCATA viva — que conta como consumo do
   projeto sem a devolução abatendo. O rodapé do relatório declara isso; a correção é cancelar
   as duas pernas. (É o mesmo estado parcial do item 2 desta lista, agora com efeito no número
   do relatório.)

17. **(14) A devolução agora CARREGA o projeto da saída — e um relatório muda de leitura.**
   Devolução de saída com projeto passa a nascer com o mesmo projeto/OS (antes nascia sem).
   Efeito visível: devoluções novas aparecem no Custo por projeto abatendo o consumo — números
   de "Devolvido" que antes ficavam em zero passam a aparecer. Nenhum dado antigo foi alterado:
   devoluções lançadas **antes** desta etapa continuam sem projeto e não abatem nada.

18. **(16) O relógio da "quarentena parada" é a data do RECEBIMENTO, não a da inspeção.**
   Não existe coluna com a data em que o item entrou em inspeção; a régua usa a data de
   criação do recebimento. Consequência real (medida na revisão): nota que demorou 15 dias
   entre chegar e ser processada gera alerta de "quarentena parada" no **primeiro dia** de
   quarentena de verdade. Quem opera deve ler o alerta como "este recebimento está velho e
   ainda tem item retido", não como "a Qualidade está lenta". Corrigir de verdade exige a
   coluna da transição — lacuna de dado da mesma família das três declaradas.

20. **(17) Mexer num recebimento ANTIGO pode gerar aviso de divergência que nunca saiu.**
   A janela do alerta de divergência olha a última atualização do recebimento — e toda
   transição de workflow atualiza essa data. Consequência real (medida): um recebimento de
   meses atrás, com divergência que nunca foi comunicada, ao ser aberto e movido vira e-mail
   novo. **Isto é a rede de segurança funcionando** (a divergência é real e ninguém foi
   avisado), mas nos primeiros dias depois de subir esta etapa espere avisos de recebimentos
   legados conforme a equipe for tocando neles. *(A primeira versão da documentação dizia que
   "o dedupe segura o e-mail" nesse caso — **estava errado**, e a revisão provou com sonda.)*

22. **(19) Excluir um cadastro que não existe agora responde ERRO, onde antes respondia
   sucesso.** Vale para tipo de material, localização e família. Na prática isso só acontece
   quando a tela está desatualizada (alguém já excluiu aquele item) — antes o sistema fingia
   ter excluído; agora diz que não achou. Se a equipe estranhar, é isso.

23. **(19) Excluir algo que JÁ estava excluído continua respondendo sucesso** — e agora
   registra uma exclusão no histórico, mesmo sem ter excluído nada. É limitação conhecida e
   está declarada; só o identificador inexistente vira erro.

21. **(18) A partir de agora, cancelar uma conferência de estoque pede um motivo escrito.**
   Quem estiver acostumado a cancelar com um clique vai encontrar um modal pedindo pelo menos
   5 caracteres. É de propósito (letra B34) — mas avise a equipe antes, para não parecer
   travamento.

19. **(16) Requisição com data de necessidade ilegível NUNCA alerta atraso — em silêncio.**
   O campo aceita texto livre por API (`01/01/2020` grava e a régua de data não o enxerga
   nunca). Pelas telas o formato é sempre correto (campo de data); o risco é só integração/
   API direta. A validação de formato no servidor ficou como pendência nomeada na spec 20.

24. **(20) Quem administra o Almoxarifado LÊ o token que estiver embutido na URL do webhook de
   WhatsApp.** A Etapa 20 passou a mascarar a senha de SMTP e a chave de API na leitura das
   configurações, mas a URL do webhook continua saindo inteira — **de propósito**, porque é o
   campo que o administrador edita (o porquê inteiro está na B40). Se o seu webhook leva o token
   na própria URL (é o arranjo comum, e a configuração já descreve a chave separada como
   "opcional"), então **qualquer administrador do módulo consegue ler esse token**, hoje, abrindo
   a tela de Alertas de Estoque. Não é aberto ao módulo inteiro: as duas leituras de configuração
   exigem administrador do Almoxarifado ou super administrador — **isto foi medido no código
   durante o fechamento, porque o desenho da etapa dizia "quem tem acesso ao módulo", que é mais
   amplo do que a verdade.** O que fazer na prática: tratar o webhook como credencial ao decidir
   quem vira administrador do módulo, e rotacionar o token se essa lista mudar.

25. **(20 / relembrando G7) Mandar um arquivo do tipo errado ou grande demais em qualquer upload
   do módulo responde `Erro interno do servidor`, sem dizer o motivo.** Vale para as cinco rotas
   que recebem arquivo (foto de material, certificado de lote, comprovante de sucata, calibração
   e assinatura de entrega). A validação **funciona** — nada é gravado e nenhum arquivo órfão fica
   — mas a resposta é um 500 genérico (`{ "error": "Erro interno do servidor" }`; o motivo real só
   aparece quando o servidor roda em modo de desenvolvimento) em vez de um erro dizendo "tipo não
   aceito" ou "arquivo grande demais". **A Etapa 20 arrumou a rota de foto no que era dela** (ela
   deixou de responder sucesso para material inexistente e passou a limpar o arquivo), **mas o 500
   opaco do multer continua nas cinco** — o conserto certo é uniforme, e está nomeado na spec 24.
   Pelas telas do sistema isso não aparece (elas só enviam o tipo certo); morde quem integrar por
   API ou quem arrastar um PDF para o campo de foto.

26. **(21) O backup do sistema é liberado por uma SENHA FIXA, e o único registro de quem baixou é
   o log do servidor.** Quem tiver essa senha baixa o banco inteiro e os anexos, de qualquer lugar,
   sem login de usuário e sem perfil. A Etapa 21 fechou o pior — o zip **não** carrega mais o
   arquivo que permitia forjar um crachá de super administrador — e passou a registrar **toda**
   tentativa (horário, IP, o IP real por trás do proxy, aceito/negado e o motivo). Mas o registro
   fica no **log do servidor**: não há tela que liste downloads de backup, e não há como saber
   *qual pessoa* usou a senha, porque a senha é uma só, compartilhada. Na prática: trate essa
   senha como credencial de administrador, guarde-a com quem cuida do servidor, e se alguém dessa
   lista sair da empresa, troque-a.

27. **(21) A senha do e-mail do sistema continua no histórico do repositório — e continua válida
   até você rotacioná-la.** Está lá desde **17/03/2026**. A Etapa 21 removeu a cópia que estava
   replicada na documentação e fez o sistema preferir a senha do ambiente do servidor, mas isso
   **não apaga** a senha de nenhuma cópia do repositório já feita: quem tiver um clone antigo tem
   a senha. É o item **A3**, e é a única coisa deste documento inteiro que **nenhum código** resolve.

28. **(22) Na tela de Auditoria, nem toda linha do "De → Para" é uma mudança — parte é
   contexto.** Ao expandir uma linha, você pode ver campos com o **De vazio (—)** que não mudaram
   nada: são valores que a operação apenas **registrou junto**, para identificar sobre o que ela
   agiu. O exemplo concreto: trocar a foto de um material grava, além da foto, o **código** e o
   **nome** do material — e os dois aparecem como `— → valor`, que lê como "foi definido agora".
   **Quem audita precisa saber disto**, porque a leitura ingênua é concluir que houve alteração
   onde não houve. **Há uma legenda na própria tela** avisando sempre que alguma linha tem o De
   vazio, mas legenda não substitui a pessoa entender a regra. E isto **não é defeito a
   consertar na tela**: a régua de leitura mostra tudo o que foi gravado, sem descartar nada —
   é exatamente a mesma ausência de descarte que mantém visível a **troca de senha mascarada**
   (que tem `(alterado)` dos dois lados e sumiria se a régua filtrasse "iguais"). Enxugar isso
   seria trabalho da **gravação** (gravar menos), nunca da leitura.

29. **(22) Valores muito grandes aparecem cortados em 300 caracteres.** A linha de histórico da
   **lista de materiais permitidos por setor** guarda o mapa de acesso inteiro — cerca de **46
   KB** de uma vez, sem espaços. Exibido sem limite, ele vira um bloco único que a tabela não
   consegue quebrar e que **fica ilegível, com o começo cortado junto**. A tela mostra os
   primeiros 300 caracteres e, no fim, quantos caracteres ainda faltam (`… (+45 812
   caracteres)`). Ou seja: **quem precisar do conteúdo completo dessa linha específica ainda
   depende de consulta técnica ao banco.** O aviso de corte foi escolhido justamente porque
   "sumir" não avisa nada, e o volume em si é o item **G8**, que espera decisão sua.

30. **(23) O MESMO perigo que a Etapa 23 evitou no Almoxarifado já existe hoje em DOIS pontos do
   núcleo do CRM, e continua lá.** A Etapa 23 recusou usar transação em `PUT /configuracoes` pelo
   motivo explicado em **B51**: o CRM tem uma conexão só com o banco, então uma transação com
   espera no meio engole a gravação de quem estiver trabalhando ao mesmo tempo, e o "desfazer"
   apaga o trabalho dessa pessoa. **A forma segura é a transação inteira num comando só — e é a
   que o CRM usa em dois lugares: a exclusão de usuário e a renumeração de propostas.** Só que nos
   dois, quando o comando falha, o "desfazer" é disparado **num segundo comando, separado**. Entre
   um e outro há uma fresta: **o que outra pessoa gravar nesse intervalo entra na transação que
   está sendo desfeita, e é apagado junto.** Isto **não é regressão desta etapa** — existe hoje,
   nasceu antes dela e foi encontrado enquanto se media o problema do almoxarifado. Ficou **fora
   do escopo de propósito**: são rotas do núcleo (usuários e propostas), e mexer nelas dentro de
   uma etapa de auditoria do almoxarifado misturaria dois assuntos. **Na prática, a chance de
   alguém ser atingido é pequena** (exige uma falha exatamente naquele comando **e** outra pessoa
   gravando no mesmo instante), mas quem opera precisa saber que existe. **Conserto é etapa
   própria, no núcleo.**

31. **(24) Quem já tem o perfil "Administrador" gravado CONTINUA com ele — a Etapa 24 tirou a
   opção da tela, não do banco.** A aba *Perfis de Acesso* deixou de oferecer **Administrador**
   porque conceder esse perfil por ali é errado por dois caminhos que se somam: quem o recebe
   passa a **configurar o módulo e a promover outras pessoas**, e o perfil **é apagado sozinho**
   no próximo salvamento do cadastro daquela pessoa (o sistema sincroniza a lista de módulos que
   ela administra e remove o que não bate). **O filtro é da tela.** Ninguém que já tenha esse
   perfil gravado perde nada agora — e é exatamente por isso que ele precisa ser procurado à mão:
   a pessoa tem hoje um acesso amplo que **vai evaporar num dia imprevisível**, quando alguém
   editar o cadastro dela por qualquer motivo. **A consulta para achar essas pessoas é a A4**, e
   ela tem de rodar no banco de produção — o de desenvolvimento foi conferido e não tem nenhuma.
   Depois de rodar, cada caso tem duas saídas legítimas: marcar o almoxarifado entre os módulos
   que ela administra, no cadastro de usuário (é lá que a condição vive e sobrevive), ou apagar a
   linha. **Não há como reconceder pela tela**, e isso é intencional.
32. **(25) A aba Backup das Configurações tem UM campo que funciona e DOIS que não fazem nada.**
   A Etapa 25 fez **"Manter Backups (dias)"** passar a valer — antes ele salvava um número que
   ninguém lia. **Os outros dois campos da mesma aba continuam decorativos:** **"Backup
   Automático"** (Ativado/Desativado) e **"Frequência"** (Diário/Semanal/Mensal) **salvam o valor
   e nada acontece**. Não existe agendamento no servidor: o backup é feito **no arranque do
   sistema** e por quem clica em baixar backup, e isso não mudou. Colocar "Ativado" e "Diário" na
   tela **não** cria uma rotina diária.
   **Está aqui e não na letra D porque o risco é de operação, não de escopo:** quem apresentar a
   novidade dizendo *"a retenção agora funciona"* faz o ouvinte concluir que o painel inteiro
   funciona, e alguém vai confiar num backup diário que não existe. **A frase certa ao apresentar
   é:** *"o campo de dias passou a valer; os outros dois ainda são visuais"*.
   **O que de fato garante os backups hoje:** toda vez que o servidor sobe, ele grava uma cópia do
   banco antes de qualquer outra coisa. Se o servidor ficar semanas sem reiniciar, **não haverá
   cópia nova nesse período** — e agora, com a retenção por dias ligada, cópias além do prazo
   saem. Com o padrão de 30 dias e a trava de mínimo 3 cópias, nunca se fica sem backup; mas o
   mais recente pode ser mais velho do que se imagina. Fazer os dois campos funcionarem é etapa
   própria (letra **D**).
33. **(26) O filtro de Categoria na tela de Materiais passou a oferecer as 27 do catálogo — e,
   enquanto o acervo não for remapeado, filtrar por qualquer uma delas devolve ZERO.** É a
   consequência direta e prevista de **não** ter migrado os materiais existentes (a decisão da
   **A6**): as telas passaram a oferecer o catálogo do cliente, mas os materiais **continuam
   gravados com a categoria antiga**. Então em **Almoxarifado → Materiais**, o seletor de
   categoria agora lista `Aço carbono`, `Chapas`, `Tubos`… e **escolher qualquer um deles devolve
   a lista vazia**, até que alguém reclassifique os materiais.
   **Isto não é defeito, e o efeito é o mesmo de antes ao contrário:** antes o filtro oferecia
   `EPI` e `ELÉTRICO`, que **nenhum material do banco tinha**, e o resultado era igualmente zero.
   A diferença é que agora as opções oferecidas são as **certas** — o que falta é o acervo chegar
   nelas. **Quem opera precisa saber disto antes de estranhar**, porque "filtro devolve zero"
   parece estoque vazio, não classificação desatualizada.
   **Três saídas, e a ordem é essa:** **(1)** rode a **A6** e veja em que categorias os materiais
   estão de verdade; **(2)** decida o remapeamento e rode o `UPDATE` — depois disso o filtro passa
   a funcionar de imediato; **(3)** enquanto não decidir, **cadastre as categorias antigas no
   catálogo** (Configurações → aba Categorias). Elas voltam a aparecer no filtro e o acervo fica
   achável, ao custo de conviver com as duas taxonomias por mais um tempo.
   **O que NÃO é afetado:** nenhum material sumiu, nenhum foi reclassificado, e a lista sem filtro
   continua mostrando tudo. É só o filtro por categoria — e o mesmo vale para o filtro da tela de
   Conferência de Estoque.

34. **✅ RESOLVIDO NA ETAPA 29 — ~~(27) A tela de Inspeções NÃO ganhou campos de medida — quem
   inspeciona por ela continua marcando "Divergência dimensional" à mão.~~**
   **O formulário de decisão passou a ter os campos de medida** (bloco *Medidas do plano*, um por
   característica ativa, com nominal, unidade e faixa), e a caixa *Divergência dimensional* passou
   a ficar **desabilitada e desmarcada** assim que há medida preenchida — cumprindo a B60 em 2 das
   3 partes. **Uma ressalva que continua valendo:** isso só aparece para material **com plano de
   inspeção cadastrado**, e o cadastro do plano **ainda é por API** — então, na prática, o
   formulário só muda depois que alguém cadastrar o primeiro plano. Riscado em vez de apagado, com
   o texto original abaixo, para quem lembrar do furo confirmar que fechou.
   *(Texto original da Etapa 27:)* A Etapa 27 entregou o plano de inspeção, a régua da
   tolerância, a gravação das medidas e a derivação da divergência — **tudo por baixo**. O
   formulário **Decidir Inspeção** está exatamente como estava: as mesmas cinco caixas de
   "problemas identificados", a mesma caixa **Divergência dimensional** clicável.
   **Isto precisa ser dito antes de alguém procurar o campo e não achar.** Não é regressão nem
   entrega pela metade: a régua era a parte com risco (ver o cenário 2 da Etapa 27 — 12,3% de
   reprovação falsa por arredondamento) e foi feita primeiro, com teste, para que a tela seja só
   tela quando chegar.
   **O que isso significa na prática, hoje:** quem inspeciona pela tela **não registra medida
   nenhuma**, e por isso a caixa marcada à mão **continua sendo o que vale** — a derivação só entra
   em cena quando há medidas, e pela tela nunca há. Nenhum comportamento atual mudou.
   **O caminho para acabar com o furo é a etapa da UI, e ela tem um alerta próprio: a B60.**

35. **✅ RESOLVIDO NA ETAPA 29 — ~~(27) As medidas nascem sem tela que as leia — e esta é a
   TERCEIRA vez que o módulo produz dado calculado, gravado e sem leitor.~~**
   **Nasceu a aba Histórico** na tela de Inspeções: as inspeções decididas, com a contagem de
   medidas e quantas ficaram fora, e a tabela de medidas ao clicar na linha — com a tolerância
   **congelada no ato**, não a do plano atual. "O que essa peça mediu na entrada" passou a ter
   resposta em tela. **O que continua sem leitor não é a medida, é o resto do ato:** decidir
   inspeção ainda não deixa linha na Auditoria (furo **C36**, que é anterior e continua aberto), e
   inspeção decidida **não pode ser reaberta nem corrigida** — a leitura é só leitura. Riscado em
   vez de apagado, com o texto original abaixo.
   *(Texto original da Etapa 27:)* Uma inspeção feita com medidas guarda, para cada
   característica, o valor medido, o nominal e a tolerância do dia, o veredito e o instrumento.
   **Nada disso aparece em tela nenhuma.** A tela de Inspeções lista só o que **ainda não foi
   decidido**, e rever uma inspeção já concluída **já não tinha caminho no produto** antes desta
   etapa — a decisão some da fila e o livro recusa estornar.
   **Consequência para quem opera:** o dia em que a tela de medidas existir e alguém quiser
   conferir "o que essa peça mediu na entrada", a resposta hoje só sai por consulta ao banco.
   **Está declarado aqui de propósito**, e não escondido, porque as duas vezes anteriores em que
   isso aconteceu neste módulo (o rendimento da transformação, que aparece num aviso e some; e as
   colunas de lote com escritor e sem leitor) só foram percebidas muito depois.
   **Não é perda de dado:** as medidas ficam gravadas e completas. Falta a janela para olhá-las.

36. **(27) A decisão de inspeção continua sem rastro na Auditoria — e isso é anterior a esta
   etapa.** Filtrando a Auditoria por **Entidade = Plano de inspeção**, aparecem as criações,
   edições e desativações de característica. Mas **decidir uma inspeção nunca gerou linha de
   auditoria** — nem antes, nem agora com as medidas. O que existe do ato é a linha no **livro de
   movimentações** (tipo *Decisão de inspeção*, com quem fez e de onde veio) e o registro da
   própria inspeção; o que não existe é a entrada na tela de Auditoria, que é onde se procura
   "quem decidiu o quê".
   **Foi verificado, não suposto** (o serviço de inspeção não chama a auditoria em ponto nenhum) e
   **ficou fora de propósito**: acrescentar auditoria a um ato que nunca a teve é mudança de
   escopo própria, com decisões de vocabulário e de volume que não cabiam nesta etapa.

37. **(28) Requisição separada ANTES da Etapa 28 não tem rodada — e a barreira "quem separou não
    confere" não tem como saber quem separou.** Toda requisição que já estava *Em Separação* (ou
    *Parcialmente Atendida*) no dia do deploy tem quantidades separadas e **nenhuma rodada
    registrada**. Para essas, **qualquer** Almoxarife confere — inclusive quem separou. Não há
    como recuperar o separador (nunca foi gravado). **Descartado** recusar conferência de
    requisição sem rodada: para material crítico legado isso seria beco sem saída, porque a
    separação já está no máximo e não dá para abrir rodada nova. É fato de migração, some sozinho
    conforme as requisições antigas fecham; se quiser, a consulta é
    `SELECT r.numero FROM requisicoes_almoxarifado r WHERE r.status IN ('EM_SEPARACAO','PARCIALMENTE_ATENDIDA') AND NOT EXISTS (SELECT 1 FROM separacoes_requisicao_almoxarifado s WHERE s.requisicao_id = r.id)`.
38. **(28) Almoxarifado com UMA pessoa não tira material crítico.** Com a B62 como está, material
    marcado **crítico** só sai da requisição depois de **outra pessoa** com perfil Almoxarife ou
    Administrador conferir a separação. Num turno com um Almoxarife só, a requisição fica em *Em
    Separação* com os botões de saída cinza até alguém entrar. **Antes do deploy, confira quantos
    usuários têm o perfil** em Almoxarifado → Configurações → aba *Perfis de Acesso*, e quantos materiais estão
    marcados como críticos (`SELECT COUNT(*) FROM materiais_almoxarifado WHERE material_critico = 1 AND ativo = 1`).
    Se for inviável, a régua da B62 vira "nunca obrigatória" numa linha, e a conferência continua
    existindo como registro.

39. **(29) A aba Histórico de Inspeções mostra no máximo as 100 mais recentes, e não avisa que
    cortou.** A lista não pagina: não há "próxima página", nem filtro de data, nem qualquer sinal
    de que existe mais coisa abaixo. O único filtro é o de **material** — e ele resolve o caso
    prático ("o que essa peça mediu na entrada"), porque poucos materiais passam de 100 inspeções.
    **Quem opera precisa saber disto** para não concluir que uma inspeção antiga "sumiu": ela está
    no banco, inteira, só não cabe na janela.
    **Foi achado da revisão adversarial e ficou fora de propósito**, com a alternativa escrita: o
    servidor aceita `?limite=` até **500**, mas a tela não manda o parâmetro, então na prática o
    teto é 100. Paginar de verdade (offset ou cursor, mais janela de data) é etapa própria — e ela
    tem de vir junto com um sinal de truncamento na resposta, senão troca um corte silencioso por
    outro. **Descartado** subir o default para 500 agora: transformaria toda abertura da aba numa
    resposta cinco vezes maior para resolver um caso que ainda não apareceu.

40. **(29) A divergência dimensional é derivada das medidas QUE VOCÊ INFORMOU — não das
    características do plano.** Se o plano tem duas características e o inspetor mede só uma,
    dentro da tolerância, o sistema conclui que **não houve** divergência dimensional. **E se ele
    tinha marcado a caixa à mão antes de digitar, a marcação some** — a caixa trava com a
    **primeira** medida preenchida, e a marcação manual deixa de ser enviada.
    **Cenário real:** o inspetor vê a espessura visivelmente fora, marca *Divergência
    dimensional*, mede o diâmetro (que está bom) e salva. Resultado gravado: **sem divergência
    dimensional**, e uma medida conforme.
    **O que fazer:** ou **mede a característica que está fora** — que é o certo, e o que o plano
    existe para provocar — ou **escreve em Observações**. O texto abaixo do bloco de medidas diz
    isso na tela: *"…calculada só pelas características que você mediu. Divergência em algo que o
    plano não mede — ou numa característica do plano que você deixou em branco — vai em
    Observações."*
    **Descartado** travar a caixa só depois de TODAS as características estarem preenchidas: o
    servidor deriva por **medida**, não por característica (regra da Etapa 27), então a tela
    passaria a prometer uma régua diferente da que o banco aplica — que é exatamente o defeito que
    a B60 existe para evitar. **Descartado** também exigir todas as medidas para salvar: medir tudo
    nem sempre é possível, e transformar isso em bloqueio faria o inspetor não medir nada.

41. **(31) A PARTIR DO DEPLOY, os números de documento ficam mais LONGOS e passam a ter letras —
    e os antigos continuam como estavam.** Requisição, recebimento, remessa e conferência passam de
    12–14 caracteres só com dígitos (`REM-0006800185`) para **20 com letras**
    (`REM-MTHK5F35ABC12345`). **É a única coisa desta etapa que aparece na tela**, e quem opera vai
    reparar no primeiro documento novo.
    **Nada foi renumerado, de propósito:** o número aparece em impresso, e-mail e conversa de
    galpão, e renumerar quebraria o rastro de tudo que já saiu. Os dois formatos **convivem**, e
    documento antigo continua abrindo, listando, filtrando e imprimindo — verificado, não suposto:
    nenhuma tela, relatório, PDF ou e-mail valida, corta ou ordena esses números.
    **O que fazer:** avisar quem digita número em planilha ou anotação de que o campo ficou maior.
    Se alguma planilha externa tiver coluna de largura fixa para esse número, ela precisa crescer.
    **Por que o número mudou de forma:** era o formato antigo que causava a repetição — ele usava
    só os **últimos dígitos** do relógio, e por isso dava a volta a cada 16,7 minutos (requisição)
    ou 27,78 horas (os outros três). Ver a seção da Etapa 31.

42. **✅ RESOLVIDO NA ETAPA 33 — os arquivos antigos do almoxarifado NÃO são mais públicos.**
    Este item dizia que certificado do fornecedor, comprovante de sucateamento, certificado de
    calibração, foto de material, foto de ocorrência e **a imagem da assinatura de quem retirou
    material** abriam **deslogado** para quem tivesse o link, protegidos apenas pelo nome do
    arquivo ser difícil de adivinhar. **A Etapa 33 fechou** (`13dfd4f..65811d2`).

    **O que mudou:** o endereço do arquivo agora precisa vir **assinado pelo servidor**, e a
    assinatura vale para **aquele arquivo** e por **15 a 20 minutos**. Quem pedir o endereço sem
    assinatura — ou com a assinatura de outro arquivo, ou vencida, ou adulterada — recebe
    **“não encontrado”**, sem nenhuma pista de que o arquivo existe.

    **Duas consequências que você vai notar, e as duas são esperadas:**
    1. **Links de imagem copiados antes do deploy param de funcionar.** Se alguém guardou o
       endereço de uma foto ou de um certificado num documento, numa planilha ou num e-mail,
       aquele link morre. O caminho é abrir pelo sistema de novo.
    2. **Deixar uma tela aberta por mais de ~20 minutos e voltar a ela pode mostrar imagem em
       branco.** Recarregar resolve. Isso acontece porque o endereço expira de propósito —
       é o que impede um link copiado de virar acesso permanente.

    **⚠️ E o que fechar a porta NÃO resolve:** quem já **baixou** um arquivo antes do deploy
    continua com ele. Fechar o acesso impede novos downloads; não recolhe o que saiu. Se algum
    documento sensível pode ter vazado nesse período, tratar isso é decisão sua — o sistema não
    tem como saber quem baixou o quê antes desta etapa (o registro de download só existe para os
    anexos, e só a partir da Etapa 32).

    Deixado aqui, riscado, em vez de apagado — para quem lembrar do furo confirmar que fechou,
    com o número da etapa que fechou.

### D. Limitações declaradas — são decisão, não esquecimento

- **Transferência não tem "em trânsito"** — cortado por decisão sua: o cliente tem um site só e a
  transferência é imediata. Volta a fazer sentido se houver obra externa ou segundo prédio.
- **Devolver peça com número de série para sucata leva dois passos**: devolver ao estoque e depois
  sucatear em Movimentações, que já tem seletor de série.
- **Transferir lote bloqueado ou vencido é permitido** — é assim que um lote reprovado vai parar
  na área de bloqueados.
- **Os relatórios de materiais bloqueados e de materiais sem endereço mostram material de cliente
  sem o selo de propriedade** — eles misturam de propósito (a chapa do cliente ocupa a prateleira
  de verdade), mas ainda não identificam o dono.
- **(8c) O custo médio dos recebimentos por NF vale só DAQUI PARA FRENTE.** A partir da 8c, dar
  entrada por nota fiscal alimenta o custo médio do material. **Não há como recalcular o passado, e
  isso não é preguiça: é impossível.** O livro de movimentações **não guarda o custo de cada
  lançamento** — o dado necessário para refazer a conta simplesmente não existe. Quem quiser o
  custo médio de um material antigo tem de esperar a próxima nota dele.
- **(8c) O rendimento não fica guardado.** Ele aparece **num aviso, uma vez**, logo depois de
  confirmar a transformação — e some. Não há coluna de rendimento; reabrir a remessa não o mostra.
  Querer histórico de rendimento é etapa nova.
- **(8c) A transformação registra, não planeja.** Não há lista de materiais, ordem de produção nem
  aproveitamento de chapa (*nesting*), e o sistema **não valida** que os pesos fecham: rendimento de
  300% não é recusado, só mostrado.
- **(8c) Corte feito DENTRO da GMP continua sem caminho próprio.** A transformação vive dentro de
  uma remessa a terceiro.
- **(9) O sistema não calcula quanto sobrou.** As dimensões do retalho são **digitadas** pelo
  operador — não há aritmética dimensional (3000−1200=1800 não é feito). Automatizar exigiria
  modelagem dimensional por material que o catálogo não tem; se quiserem, é etapa própria.
- **(9) Ninguém recebe e-mail de sucateamento** — o acompanhamento é pela tela. E-mails são a
  feature 19, mesmo corte declarado das etapas 8/8b/8c.
- **(9) Vender sucata registra valor e comprovante — não vira fatura nem título financeiro.**
- **(9) O relatório financeiro de sucata é só API** — não existe tela de relatórios no módulo
  (pendência antiga). A valoração usa o **custo atual** do material, porque o livro não guarda
  custo histórico (mesma limitação declarada da 8c) — o próprio relatório carrega essa nota.
- **(9) Não há foto do retalho** — o campo existe no banco, a tela não oferece upload
  (pendência registrada na spec 15), e **não há reserva de retalho** (mesma pendência da reserva
  por lote/série).
- **(9b) Ferramenta usada em inspeção (instrumento calibrado referenciando a medição) não está
  integrada** — depende de a feature 09 ganhar plano de inspeção com medidas, que não existe
  ainda.
- **(9b) Uma foto por ocorrência de avaria/perda, não uma galeria.** Se precisar de mais de uma
  foto, registre ocorrências adicionais — galeria de N fotos exigiria tabela e tela própria.
- **(9b) Requisição de ferramenta pelo fluxo de requisições não existe** — fica para a feature 04
  encostar nisso, se um dia fizer sentido pedir ferramenta pelo mesmo caminho que material.
- ~~**(10) Só existe contagem "por categoria".**~~ **Entregue na Etapa 10b** (família raiz,
  classe ABC, críticos, de clientes, em terceiros — combináveis). Continuam fora, declarados na
  seção da 10b: endereço, cíclica automática, surpresa (não é software), por divergência
  (a recontagem obrigatória já é isso) e subfamília.
- ~~**(10) A recontagem aceita a mesma pessoa contando de novo.**~~ **Entregue na Etapa 10b**: a
  flag "Dupla contagem" exige recontagem de outra pessoa, esconde o número do primeiro contador
  e registra a autoria por item. Sem a flag, o comportamento antigo continua valendo — e a flag
  não força recontagem de item dentro da tolerância (item C8).
- **(10) Nenhuma movimentação é congelada durante a contagem.** É possível lançar uma saída ou
  entrada de um material no meio de uma conferência em aberto — o mesmo raciocínio da
  Transferência sem "em trânsito" (Etapa 7): site único, baixo valor prático, alto custo de
  implementação, ninguém pediu.
- ~~**(10) Relatório formal de acuracidade não existe.**~~ **Entregue na Etapa 10b** (botão
  Acuracidade na tela de Conferência: por conferência e agregado ponderado). O **e-mail do
  resultado** continua fora (feature 19).
- **(10) A guarda de retenção não cobre ajuste por localização/endereço específico** — só o
  ajuste do material inteiro (o caminho que a conferência usa) tem a checagem nova; um ajuste
  manual escopado a uma prateleira específica não passa por ela ainda.

- **(11) A solicitação de compra não fecha sozinha — o "a caminho" usa um horizonte de 60
  dias.** Nada no sistema fecha solicitação (receber a NF não a toca — isso é a integração com
  Compras, feature 22/24). A régua honesta possível: solicitação aberta conta na posição por
  60 dias (configurável); depois disso deixa de contar e a linha avisa que há solicitação
  antiga aberta. A mesma régua vale para a requisição que espera compra (o status "aguardando
  compra" também ignora solicitação velha).
- **(11) Devolução não abate o consumo médio.** Material que saiu 90 e voltou 90 no mesmo
  período conta consumo cheio — a régua é "o que baixou do patrimônio", e o retorno não é
  descontado. Infla o ponto calculado de quem devolve muito; declarado, não consertado.
- **(11) A nota "Mostrando os 500 itens de maior valor parado" aparece também quando há
  exatamente 500** (o servidor não diz o total). Cosmético, declarado.
- **(12) Sem PDF anexo, sem resumo diário (digest), sem templates configuráveis** — o corpo do
  e-mail é fixo por evento e fica gravado na fila (a fila é o histórico; não há segunda tabela
  de log de envio).
- **(12) WhatsApp fica fora da fila de notificações** — o alerta de mínimo continua usando o
  canal WhatsApp próprio dele; a fila é só e-mail.
- **(12) E-mail de correção retroativa não existe.** Aviso que **já saiu** de movimentação
  estornada depois não gera "desconsidere" — o livro e a tela são a verdade. (O que ainda NÃO
  saiu é suprimido automaticamente — regra 3 da seção da etapa.)
- **(12) Não há botão de descartar/arquivar linha PENDENTE da fila** — só reenviar e processar.
  Linha indesejada que ainda não saiu só morre pelas retentativas esgotadas ou pelo estorno da
  movimentação.
- **(12) Lote de material de CLIENTE alerta vencimento normalmente** — validade é qualidade do
  que o galpão guarda, não reposição (contraste deliberado com o zerado, que exclui cliente).
- **(13) Sem PDF nos relatórios** (impressão do navegador; jsPDF do módulo global descartado —
  perderia a paridade garantida com a planilha). **Sem snapshot histórico de estoque** — o
  giro usa o valor atual como denominador, escrito na tela. **Payload não-tabular não
  exporta** (Sucata financeiro, Posição por cliente, Indicadores — o botão nem aparece).
- **(13) Rupturas somem retroativamente se o material for INATIVADO** — o indicador filtra
  ativos; histórico que muda quando alguém edita um flag é fragilidade declarada (letra E).
- **(12) Alerta de estoque zerado usa o SALDO FÍSICO, não o disponível** — material 100%
  reservado ainda está na prateleira, não está zerado. Escrito aqui porque é fácil "corrigir"
  para o disponível achando que é bug.

- **(14) BOM/Engenharia, OP/Produção e centro de custo ficaram FORA — por medição, não por
  pressa.** A Fase 0 da etapa mediu os vizinhos antes de prometer: **BOM não existe** em lugar
  nenhum do sistema, e o módulo **MES existe sem uso real**. Integrar com isso seria construir
  stub fingindo integração. A spec 22 registra cada item bloqueado **com a medição que o
  bloqueou** — quando os módulos amadurecerem, a integração vira etapa própria.

- **(14) RECEBIDA e CANCELADA não geram e-mail** — aparecem no painel de solicitações e na
  auditoria. A fila de notificações da Etapa 12 está pronta para receber esses avisos (seria
  uma classe nova de mensagem), mas ligar canal novo de e-mail é decisão sua, não default.

- **(14) O fechamento automático não confere quantidade** — a primeira nota do pedido fecha a
  solicitação (o desenho completo e o descartado estão na B22).

- **(15) Código de barras 1D, coletor físico, app nativo/offline e fotografia na saída
  ficaram FORA da mobilidade — por medição.** Nada no sistema gera código 1D (ler o que não
  existe é feature morta); nenhum coletor foi confirmado no galpão (se aparecer um USB/
  Bluetooth, ele emula teclado e funciona nos campos de busca sem código novo); e não há
  demanda medida de offline. O detalhe e o descartado estão na B25.

- **(20) A tela de aprovação por valor continua entregando NOME e E-MAIL dos aprovadores a
  qualquer usuário do módulo.** A configuração de alçada é lida por uma rota sem restrição de
  perfil, e ela devolve a lista de aprovadores com nome e e-mail. **Não foi fechada de propósito:**
  a lista de requisições depende dessa mesma leitura para saber se *você* é aprovador — fechar sem
  mais exige decidir o que o não-administrador passa a receber (provavelmente só um "sou
  aprovador: sim/não" e a alçada), o que é mudança de contrato de tela, não uma linha de gate.
  Fica declarado como o irmão do B41: o mesmo tipo de decisão, esperando a mesma resposta.

- **(20) A "matriz de leitura" do módulo ficou FORA — e continua grande.** Dezenas de consultas
  operacionais (saldo, materiais, movimentações, requisições) exigem só estar logado no módulo,
  sem olhar perfil. A Etapa 20 fechou apenas as três exposições nomeadas — as que entregavam
  **credencial** ou **controle de acesso**. Fechar a matriz inteira é etapa própria e a régua a
  decidir é de negócio: dado de estoque não é credencial, e o chão de fábrica precisa consultar.

- ~~**(20) `GET /api/backup` e a credencial de e-mail escrita dentro do código do sistema ficaram
  FORA — são do núcleo do CRM, não do módulo.**~~ — **ENTREGUE na Etapa 21** (2026-08-28,
  `d5c8d3a..07a4b1c`). Mantido riscado, e não apagado, para quem lembrar do corte confirmar que ele
  fechou e com qual commit: o zip do backup parou de levar o arquivo de segredos do servidor e as
  188 MB de cópias históricas (`d5c8d3a`), a senha do e-mail deixou de ser a fonte primária
  (`aad2331`) e a cópia dela replicada na documentação saiu (`b2dee3b`). **O que a Etapa 20
  previu e continua verdade:** a rotação junto ao provedor **não** foi feita — é operação, não
  código — e a senha **continua no histórico do repositório desde 17/03/2026**. Isso virou o item
  **A3** (com a ordem dos passos) e o furo **C27**.

- **(21) O histórico do repositório NÃO foi reescrito.** Apagar a senha do passado exigiria
  reescrever o histórico, o que quebra todas as cópias já feitas por terceiros — é decisão de
  infraestrutura, com custo real, e não se toma dentro de uma etapa de código. O caminho escolhido
  é o que funciona sem quebrar ninguém: rotacionar a senha no provedor (**A3**), e aí o valor
  antigo deixa de abrir qualquer coisa.

- **(21) Não foi criada rota para RESTAURAR backup — de propósito.** A medição confirmou que ela
  não existe hoje, e é bom que não exista: um endereço que restaura banco a partir de um arquivo
  enviado é um buraco maior do que o que a etapa fechou. Restaurar continua sendo operação de
  servidor, feita por quem tem acesso à máquina. Está escrito aqui para ninguém "consertar a falta"
  inventando uma.

- **(21) A aba "Backup" da tela de Configurações do Sistema é FEATURE MORTA — nomeada, não
  consertada.** Os três campos que ela edita (backup automático, frequência e "manter backups por N
  dias") são gravados no banco e **nenhuma parte do servidor os lê**: a rotina real de cópia roda na
  inicialização do sistema e guarda um número fixo de cópias, ignorando os três. Mudar qualquer um
  deles hoje **não muda nada**. Não foi consertado nesta etapa porque consertar é decidir como a
  rotina deve se comportar (com que frequência, quantas cópias, quem dispara) — é etapa própria, não
  uma linha. Enquanto isso: não confie nesses campos.

- **(22) A trilha de auditoria NÃO exporta para Excel.** O módulo já tem exportação nos
  Relatórios, com colunas curadas e proteção por relatório; enxertar uma segunda régua de export
  dentro da tela de Auditoria duplicaria esse trabalho e criaria dois lugares para manter. Se a
  demanda aparecer, o caminho certo é a trilha virar mais um relatório do registro existente —
  etapa curta, mas etapa.

- **(22) Não existe retenção nem expurgo do histórico.** O log cresce indefinidamente, e nada no
  sistema apaga linha antiga. Não foi implementado de propósito: **sem uma política definida por
  você** (guardar quanto tempo? o quê pode ser descartado? quem autoriza?), apagar trilha de
  auditoria é a última coisa que se faz por conta própria. Os três índices novos aliviam o custo
  de consulta, não o de armazenamento.

- **(22) Os nomes das ações NÃO foram padronizados nas gravações novas.** O sistema continua
  gravando `CRIACAO` num lugar e `CRIAR` noutro; a tela agrupa na exibição (item **B47**).
  Padronizar exigiria mexer em ~45 pontos do código, e feito junto com esta etapa faria **o dado e
  a tela mudarem no mesmo dia** — se algo quebrasse, não haveria como saber qual dos dois foi.

- **(22) O filtro de período erra em uma hora no DIA em que um horário de verão vira — e isso é
  inalcançável hoje.** A conversão do dia local para o horário gravado respeita horário de verão
  por data, exceto **no próprio dia da virada**, em que a meia-noite local não existe (ou existe
  duas vezes) e a janela sai deslocada em 1h. **Está declarado em vez de consertado** por dois
  motivos medidos: o Brasil não tem horário de verão desde 2019 e a trilha só tem registros a
  partir de 2026 — o caso não é alcançável com os dados reais —, e consertá-lo exigiria escolher
  qual das duas leituras vale numa hora que não existiu, escolha que sem caso de uso é chute. O
  caso oposto (a meia-noite dupla do fim do horário de verão) foi verificado e **está correto**,
  sem buraco nem sobreposição.

- **(23) O "tudo ou nada" foi entregue SÓ no salvamento de configurações — os outros lugares do
  módulo que gravam em série NÃO foram varridos.** A Etapa 23 olhou o `Salvar` da tela de
  Configurações porque era o que estava nomeado como buraco de histórico. **Não** houve varredura
  atrás de outros pontos do módulo onde o sistema grava vários registros em sequência e uma falha
  no meio deixa parte aplicada. **Isso é corte de escopo, não conclusão de que não existem.** E há
  um motivo técnico para não ter sido feito por atacado: a solução usada aqui — um único comando
  gravando tudo — só serve quando os registros são **da mesma tabela** e o valor depende só da
  chave. Onde não for, o conserto é outro, e escolher qual em cada ponto é o trabalho de uma etapa
  própria.

- **(23) "Excluir" e "desativar" continuam sendo dois nomes diferentes nas gravações NOVAS.** A
  Etapa 23 fez os dois pararem de registrar ato sem efeito, mas **não** unificou o vocabulário: um
  material sai como `DESATIVACAO`, um tipo de material sai como `EXCLUSAO`, e os dois significam a
  mesma coisa no banco (marcar a linha como inativa). Na tela eles já aparecem juntos sob
  **"Exclusão"** desde a Etapa 22 (item **B48**), então **para quem audita isso já está resolvido**
  — o que continua é o dado bruto. Padronizar a gravação é o mesmo trabalho de ~45 pontos do item
  acima, e segue declarado desde a Etapa 22.

### E. Uma regra que foi DEDUZIDA e nunca confirmada com vocês — pergunta, não requisito atendido

**"Uma remessa não pode misturar materiais de donos diferentes."** O sistema hoje **recusa** montar
uma remessa com chapa do Cliente A e chapa do Cliente B na mesma viagem, com esta mensagem:

> `A remessa mistura materiais de donos diferentes (Cliente A LTDA e Cliente B LTDA). O documento de remessa nomeia UM proprietario — separe em remessas diferentes.`

**Isso não veio de vocês.** Foi deduzido de uma frase do desenho — *"o documento de remessa nomeia
o proprietário"*, no singular — e implementado como recusa. **Se na prática a GMP manda numa mesma
viagem a chapa de dois clientes para o mesmo galvanizador, a regra está errada** e precisa virar
"o documento **lista** os donos, por item".

**A pergunta é literalmente esta: vocês mandam remessa mista?** Nada aqui é irreversível — o dono
de cada item já é lido do próprio material, não há dado a migrar, e a mudança é pequena (o
documento passa a imprimir o dono por linha).

**A Etapa 8c apertou o mesmo eixo, e essa parte NÃO foi deduzida:** a peça cortada tem de ter o
**mesmo dono da chapa**. Essa segunda regra é consequência direta da Etapa 8 (material de cliente
não vira patrimônio da GMP) e não depende da resposta acima — mas, se a regra da remessa mista
estiver errada, vale revisar as duas juntas.

### F. Verificações manuais que ainda não foram feitas — valem 5 minutos no navegador

Testes automáticos **não abrem um navegador**: eles não sabem dizer se uma cor apareceu na tela,
se um PDF abre legível ou se um modal coube na largura. Ficaram, portanto, **sem prova**:

1. **(8b) Os cinco selos de status têm cor?** Abrir **Almoxarifado → Remessas a Terceiros** e
   conferir que ABERTA, ENVIADA, RETORNO PARCIAL, ENCERRADA e CANCELADA aparecem cada um com fundo
   e cor próprios — e não como texto cinza sem formatação. O selo vermelho **Vencida** tem de
   aparecer **ao lado** do status, nunca no lugar dele.
2. **(8b) O PDF baixa e é legível?** Abrir uma remessa, clicar em **PDF da remessa** e conferir no
   arquivo baixado: o número, o nome do terceiro, a lista de itens com quantidades, as **duas
   linhas de assinatura** — e, numa remessa de material de cliente, o **nome do cliente
   proprietário** impresso no papel.
3. **(8c) O modal de transformação.** **Nenhum navegador foi aberto na entrega da 8c.** Falta
   conferir quatro coisas, todas na tela de Remessas a Terceiros → **Transformar**:
   - o modal renderiza **largo** e a tabela de resultados **não estoura** a largura;
   - o material recém-criado pelo atalho **Criar material resultante** aparece **visivelmente
     selecionado** no campo de material do resultado;
   - os **avisos** (sucesso e rendimento) aparecem depois de confirmar;
   - ao reabrir a remessa, a coluna **Transformado** mostra o número **vindo do servidor**.

4. **(9) A tela Sobras e Retalhos inteira.** **Nenhum navegador foi aberto na entrega da
   Etapa 9** — os testes de tela são de comportamento (React Testing Library), não visuais. Falta
   conferir: os **badges de status** das duas abas com cor (Disponível/Consumida/Sucateada;
   Solicitado/Aprovado/Vendida/Descartada/Rejeitado/Cancelado); o **modal de gerar retalho**
   (largo, os campos de baixa aparecendo/sumindo com o checkbox); a **etiqueta em PDF** abrindo
   legível com o QR funcionando (escanear e ver a linha destacada); e o **aviso de retalho
   disponível** no formulário de Saída. O roteiro completo está no guia, seção da Etapa 9.
5. **(9b) A tela Ferramentas inteira.** **Nenhum navegador foi aberto na entrega da Etapa 9b** —
   mesma ressalva: os testes de tela são de comportamento, não visuais. Falta conferir: os
   **badges de status** da aba Ferramentas com cor própria para cada um dos seis status
   (Disponível/Emprestada/Bloqueada/Em manutenção/Avariada/Perdida); o **painel de calibrações**
   distinguindo vencidas (vermelho) de a-vencer visualmente; os **modais** de emprestar,
   bloquear/desbloquear, manutenção, ocorrência e calibração cabendo na largura, com o campo de
   foto/certificado funcionando de verdade (anexar um arquivo e ver o preview ou o nome
   aparecer); e o **filtro "Exige calibração"** da lista de ferramentas. O roteiro completo está
   no guia, seção da Etapa 9b.
6. **(10) A tela Conferência de Estoque com os campos novos.** **Nenhum navegador foi aberto na
   entrega da Etapa 10** — mesma ressalva. Falta conferir: o checkbox "Contagem cega" e o campo
   "Tolerância (%)" no modal de criar conferência (o placeholder mostra o valor configurado de
   verdade, não um número fixo); a coluna "Recontagem" com o badge aparecendo/sumindo ao contar
   um item; o modal de concluir com o campo "Justificativa do ajuste" só aparecendo quando
   "Aplicar ajustes automáticos" está marcado; o aviso de sucesso mostrando o impacto financeiro
   formatado em reais; e as mensagens de recusa (recontagem, retenção, permissão de cliente)
   aparecendo por inteiro no aviso, não cortadas.
7. **(10b) Os acréscimos da Etapa 10b na mesma tela.** **Nenhum navegador foi aberto na entrega
   da 10b** — mesma ressalva. Falta conferir: os controles de escopo no modal de criar (select
   de família só com raízes, select de classe, os três checkboxes e o de dupla contagem)
   cabendo no layout; a coluna "Escopo" na lista; a linha "Contado por · Recontado por" nos
   itens; o modal de **Acuracidade** com a tabela inteira na largura (9 colunas) e os traços
   nos nulos; e o fluxo de dupla contagem com **dois logins de verdade** (o segundo usuário
   vendo o campo vazio, o Tab não salvando nada, a correção do primeiro contador funcionando).
   O roteiro completo está no guia, seção da Etapa 10b.

8. **(11) A tela Reposição e Compras inteira.** **Nenhum navegador foi aberto na entrega da
   Etapa 11** — mesma ressalva. Falta conferir: as três abas cabendo no layout; os grupos por
   fornecedor com cabeçalho de total; o badge vermelho "Risco de parada"; o aviso de
   solicitação antiga; o `window.confirm` do Gerar com o valor formatado; o painel de
   resultado listando as quantidades; o painel de **sem permissão** logando com um usuário
   Almoxarife; os três campos novos em Configurações Gerais recusando `0`. O roteiro completo
   está no guia, seção da Etapa 11.

9. **(14) Os acréscimos da Etapa 14 na mesma tela de Reposição.** **Nenhum navegador foi aberto
   na entrega da Etapa 14** — mesma ressalva (os testes de tela são de comportamento). Falta
   conferir: o botão **Cancelar** na aba de solicitações com o par confirmação → justificativa
   funcionando de verdade (e o botão sumindo/trocando para "Cancelando..." durante a chamada);
   o painel **Ver contexto** expandindo dentro da linha sem estourar a largura da tabela, com
   os números formatados e o "Último custo de entrada" com data legível; e o painel
   **reconsultando sozinho** depois de Gerar/Atualizar (o número tem de mudar na frente de
   você, sem fechar e reabrir). O roteiro completo está no guia, seção da Etapa 14.

10. **(15) O scanner e a assinatura NUNCA foram testados num celular de verdade.** O ambiente
   de desenvolvimento não tem câmera nem touchscreen — a prova da etapa é a suíte de testes
   (513 no client) e a lógica pura validada. Falta, num celular real: a câmera abrir e ler um
   QR de etiqueta impressa (vibração + navegação); a recusa de um QR estranho; o traço da
   assinatura **com o dedo** saindo suave no quadro; a tabela deslizando de lado numa tela
   de 375px com os botões de Ações alcançáveis; e o modal de entrega em tela cheia com o
   teclado aberto. Atenção: **a câmera só funciona em HTTPS** (ou localhost) — se o sistema
   estiver servido em HTTP puro na rede interna, o scanner cairá sempre no estado "Câmera
   indisponível" com a colagem manual como saída.

10c. **(17) Os 4 cartões novos da central e os e-mails de ato não foram vistos no navegador
   nem numa caixa de entrada real.** A prova é a suíte (131 arquivos de API, 527 testes de
   tela). Falta conferir: os cartões **Material reprovado**, **Divergência de recebimento**,
   **Divergência de inventário** e **Lote sem certificado** com Detalhes expandindo; e um
   e-mail de verdade chegando com acento e nome de material com "&" saindo legível.

10e. **(19) Nada da Etapa 19 tem tela** — o histórico de cadastros e configurações é gravado
   e só pode ser lido por consulta técnica. Não há o que conferir no navegador além de que as
   telas de Configurações e de cadastros **continuam funcionando igual** (a etapa não muda
   nenhum fluxo visível, exceto o erro do item C22).

10d. **(18) O modal de cancelar conferência e a linha cancelada nunca foram vistos no
   navegador.** A prova é a suíte (531 testes de tela). Falta olhar: o modal abrindo com o
   botão travado até 5 caracteres, a recusa do servidor mantendo o texto digitado, e a linha
   CANCELADA mostrando o motivo com a dica de quem/quando ao passar o mouse.

10b. **(16) A central de Alertas nunca foi aberta num navegador de verdade.** A prova é a
   suíte (522 testes no client, 128 arquivos de API) — falta o olho: os cartões com os 13
   totais carregando, o Detalhes expandindo sem estourar a largura, o aviso de erro por
   cartão, o painel de sem-permissão logando como Produção, e os 3 campos novos em
   Configurações Gerais recusando zero. Cinco minutos de navegador; roteiro no guia,
   seção da Etapa 16.

11. **(24) A aba Perfis de Acesso e a tela de Inspeções com um usuário de perfil Qualidade nunca
   foram abertas num navegador nesta etapa.** A prova é a suíte (7 cenários de tela na aba e a
   integração ponta a ponta pelo servidor). Falta o olho, e são três minutos: **(a)** abrir a
   lista de perfis de uma linha e confirmar que **Administrador não está entre as opções**, e que
   o parágrafo que explica isso aparece acima da tabela; **(b)** atribuir **Qualidade** e ver a
   descrição na coluna "O que isso permite" (sem ela, o perfil sai como um traço); **(c)** entrar
   com um usuário de perfil Qualidade e clicar em **Bloquear Material** na tela de Inspeções, para
   ver a recusa com o nome do perfil escrito por extenso na mensagem — **este último é o único
   dos três que teve defeito real no fechamento**: o nome do perfil aparecia em caixa alta,
   `QUALIDADE`, no meio da frase, e foi corrigido.

*Por que isto está escrito aqui em vez de "está tudo certo": esta mesma lacuna já mordeu a Etapa 7 —
uma classe de estilo inventada sai sem cor nenhuma e nenhum teste de comportamento percebe.*

### G. Fragilidades estruturais que continuam de pé

**G1. Toda coluna nova da tabela de materiais vaza quantidade exata para o requisitante até alguém
lembrar de escondê-la, uma por uma.** A tela em que o solicitante escolhe material
(`GET /api/requisicoes-material/materiais`) lê a linha do material **inteira** (`SELECT m.*`) e
depois apaga os campos sensíveis por uma **lista explícita de exclusão**
(`SENSITIVE_MATERIAL_FIELDS`) — quem não está na lista, passa. O solicitante deve ver apenas
"tem/não tem estoque", nunca o número.

Aconteceu na Etapa 8b: `quantidade_em_terceiros` nasceu vazando e **foi corrigida** entrando na
lista. O padrão é o mesmo: **o comportamento padrão é expor, e a proteção depende de alguém
lembrar.**

> **⚠️ Correção de uma previsão errada deste próprio documento.** Este item dizia:
> *"Fica registrado porque a Etapa 8c cria colunas novas e vai cair exatamente aqui."* **Estava
> errado.** A 8c **não criou nenhuma coluna em `materiais_almoxarifado`** — as três colunas novas
> dela são todas da tabela de resultados de retorno, que o requisitante não lê. **A 8c passou ao
> lado do problema por sorte de escopo, não por tê-lo resolvido**, e a fragilidade continua
> exatamente igual para a próxima etapa que criar coluna de material.

**G2 (NOVO, medido na 8c). A suíte verde não prova o caso comum: as fixtures dos testes preenchem
custos que nenhum material real tem.**

Foi exatamente isto que escondeu o bug do custo do item **C3** por meses. Os testes que exercitam
custo criam o material preenchendo **as duas** colunas — custo médio **e** custo de cadastro. **Nenhum
material real é assim**: o cadastro grava só o custo de cadastro, e o custo médio nasce zerado. Com
as duas colunas cheias, a fórmula errada e a certa dão **o mesmo resultado** — e o teste passa
provando nada.

**Não é teoria: foi medido.** Durante a 8c, a fórmula errada foi deliberadamente reintroduzida no
código para ver quais testes cairiam. **Três arquivos de teste continuaram verdes.** O que fez o
defeito aparecer foi um teste novo, com fixture **assimétrica** (custo médio 0, custo de cadastro
10) — o único que sabe falhar.

**O que isso significa na prática:** *"a suíte está verde"* é uma afirmação mais fraca do que parece
sempre que a fixture for mais rica que o dado real. A lição virou uma guarda automática (um teste
que varre o código e falha se a fórmula errada voltar), mas **a fragilidade da fixture continua** —
ela é geral, não específica de custo.

**G3 (da 8c). Uma coluna com três significados.** A coluna que o sistema usa para saber quanto de um
item de remessa já foi "resolvido" (`quantidade_retornada`) hoje significa **três** coisas
diferentes: *voltou como era*, *foi baixado no encerramento por perda/consumo* e, desde a 8c,
*foi consumido numa transformação*.

**Foi decidido NÃO separar agora, e o motivo está escrito:** separar exige uma coluna nova, migrar
dois significados **já gravados** e mexer em três caminhos estáveis (encerrar, cancelar e a tela) —
tudo isso por um problema de **rótulo, não de número**: o saldo pendente continua correto nos três
casos. O que a 8c fez em vez disso foi tornar o terceiro significado **legível no dado** (cada linha
de resultado agora diz se é peça ou sobra) e **desdobrar na tela** em *Retornado / Transformado /
Baixado*. **A pendência continua aberta e está registrada na spec** — não foi apagada porque a 8c
encostou nela.

**G4 (NOVO, da 9b). Contrato congelado entre back e front, honrado só de um lado — e passou por
quatro revisões de task antes de ser pego.** A Etapa 9b congelou o contrato de API antes de
paralelizar a tela contra o backend (a mesma técnica que já tinha funcionado bem nas etapas
anteriores). O problema achado na revisão final: **três vezes** o contrato dizia uma coisa e só
um dos dois lados a cumpria — a tela mandava um filtro de busca que o servidor nunca lia; o
design prometia edição de ferramenta e só o cadastro foi construído; a tela e o servidor calculavam
"empréstimo vencido" com fórmulas de data diferentes, sem nenhum teste comparando os dois. Nenhuma
revisão de task pegou isso, porque cada revisão de task olha o código de **uma** task por vez — o
front e o backend de cada contrato são tasks diferentes. **Só a revisão do branch inteiro, que lê
os dois lados juntos, viu o padrão.** Fica registrado como algo a vigiar nas próximas etapas que
usarem contrato congelado + galho paralelo: se o padrão se repetir, vale desenhar uma checagem
automatizável que compare contrato declarado × uso real dos dois lados, em vez de depender só da
revisão final para pegá-lo.

**G5 (NOVO, da 10). Validar em duas passadas ("confere tudo, aplica depois") só é seguro se a
primeira passada souber de TODAS as regras que a segunda vai checar — e essa lista tende a ficar
desatualizada.** A Etapa 10 escreveu esse padrão pela primeira vez neste módulo (para o ajuste de
inventário poder ser tudo-ou-nada sem transação de banco): uma passada só de leitura confere cada
item, e só se todos passarem é que aplica de verdade. O achado da revisão final: a primeira
passada só sabia checar **duas** das regras que a segunda (o motor de estoque de verdade) aplica —
esqueceu que quantidade zero e material desativado também são motivo de recusa lá. Resultado
concreto: um item que a primeira passada aprovava por engano só quebrava na hora de aplicar, com
**outros itens já gravados** — o "tudo-ou-nada" virava "tudo-ou-um-pouco". **Corrigido nesta
etapa** (as duas regras que faltavam entraram na primeira passada), mas o padrão em si — duas
listas de regras que precisam ficar iguais, em dois lugares diferentes do código — é frágil por
natureza: a próxima regra nova que entrar só no motor (segunda passada) volta a abrir a mesma
fresta, silenciosamente. **Nota também sobre como o achado quase escapou da própria revisão:** a
primeira tentativa de prova (sabotar a checagem e ver o teste cair) passou verde por coincidência —
a ordem em que os materiais eram processados escondeu o bug. Só forçando a ordem dos itens no
teste (o "OK" processado antes do "quebrado") é que a sabotagem provou alguma coisa de verdade.
Fica como lição para qualquer teste de "tudo-ou-nada" daqui pra frente: sem forçar a ordem dos
itens, o teste pode estar provando sorte, não comportamento.

**G6 (NOVO, da 10b). A régua de "isto é divergência de verdade" tem uma cópia declarada no
front — e cópia declarada também deriva.** A Etapa 10b unificou no servidor a definição de
divergência (uma tolerância mínima que ignora a deriva de decimal — sem ela, contar 0.2 contra
um esperado de 0.1999999... dava 0% de acuracidade para um operador que acertou). A revisão
final achou a mesma comparação exata em **três** lugares do servidor (relatório novo, relatório
antigo e o gate de recontagem) e as levou para a fonte única; mas o **contador de divergências
da tela** faz a conta localmente e **espelha o mesmo valor por cópia** — legítimo, porque a
fronteira HTTP existe de verdade, e frágil pelo mesmo motivo de sempre: se a régua do servidor
mudar, a do front não muda junto sozinha. Mesma família do G4 (contrato honrado por um lado
só) — quem mexer na régua procura os dois lados. **E três adendos de disciplina de sabotagem,
aprendidos por falha real nesta etapa:** (1) a âncora do `sed` precisa ser única **nos dois
sentidos** — a restauração de uma sabotagem casou 11 ocorrências e espalhou a mudança por rotas
alheias (o md5 pegou); (2) restaurar sabotagem com `git checkout` numa árvore com trabalho não
commitado **apaga o trabalho** (o md5 pegou de novo) — restauração é sempre por edição reversa;
(3) sabotagem que passa verde pode ser o **teste fraco**, não a prova de que ele falta — duas
vezes nesta etapa o mutante precisou ser trocado por um mais forte antes de provar algo
(o fallback do restore produzia o mesmo resultado; o par de checkboxes marcado simetricamente
tornava a transposição invisível).

**Fragilidades estruturais declaradas da Etapa 14 (medidas):** (1) **a subida do servidor tem
uma corrida conhecida** — a preparação do banco no boot não é aguardada por quem depende dela;
em produção o intervalo de 30 s esconde isso, mas os testes a enxergam como ruído raro de
encerramento (uma leitura 120/121 em nove execuções, nunca reproduzida). Fica como **ticket**:
a correção é estrutural (aguardar a preparação), não desta etapa. (2) **o custo do relatório
Custo por projeto é o ATUAL, retroativo** — o livro de movimentações não guarda custo por
movimento, então um período já fechado **muda de valor** quando chega nota nova; está escrito
no rodapé do relatório, mas quem compara o número de meses fechados precisa saber. (3) **o
"último custo de entrada" do contexto só enxerga recebimento por NF com valor** — entrada
manual valorada por outro caminho não aparece na régua (o campo fica vazio ou desatualizado, e
isso é a régua, não falha). (4) **as datas dos relatórios de consumo comparam o DIA em UTC** —
padrão herdado de todos os relatórios; movimentação das 21h às 0h (Brasília) cai no dia
seguinte do filtro. (5) **o teste-jornada da integração cobre o caminho feliz composto; os elos
finos (cada recusa, cada borda) estão nas suítes unitárias** — declarado para ninguém achar que
a jornada sozinha prova tudo.

**Fragilidades estruturais declaradas da Etapa 13 (medidas):** (1) a varredura de fonte única
de custo NÃO pega leitura de `custo_unitario` puro (só as duas famílias históricas) — quem
protege os indicadores é a fixture de custo duplo do teste deles; o design chegou a prometer
"proteção de graça" e foi corrigido dizendo que estava errado; (2) o tempo de atendimento NÃO
é janelado (todo o histórico) — leitura literal do design, declarada na tela e no rodapé;
(3) rupturas por evento físico: material 100% reservado não aparece (o chão não consegue
requisitar e o indicador diz zero — a régua olha o saldo físico, aproximação declarada).

**Fragilidades estruturais declaradas da Etapa 12 (medidas, não corrigidas — saiba que existem):**
(1) **a fiação dos robôs** (o agendamento do processador da fila e das varreduras diárias) não é
coberta por teste nenhum — os testes chamam as funções direto, de propósito; um erro de digitação
nessa fiação faria a fila nunca drenar em produção sem nenhum teste ficar vermelho; (2) o escape
de HTML nos corpos de e-mail tem **teste próprio em 5 dos 8 tipos de aviso** (movimentação, falha,
zerado, lote, remessa) — nos outros 3 (ferramenta, devolução parcial, solicitações) foi **medido
correto** na revisão final com payload hostil, mas não há teste que impeça regressão; (3) o
controle positivo do "um lembrete por dia" da ferramenta só distingue data-UTC de data-local
quando o fuso do runner difere de UTC (em São Paulo, das 21h à meia-noite) — o código está certo
e testado, o *controle* é que é condicional ao fuso. E a Etapa 12 somou **mais duas** ocorrências
do adendo (1) acima — âncora de restauração não-única espalhando mudança (o md5 pegou as duas) —
e **uma** do adendo (2) — `git checkout` para restaurar com árvore suja apagou edições não
commitadas de novo (md5 pegou, retrabalho de meia hora). O harness segue pagando o próprio custo.

**G8 (NOVO, medido na revisão da Etapa 19). O histórico das permissões por setor é grande e
cresce a cada salvamento.** Cada salvamento da lista de materiais permitidos de um setor grava
a lista **inteira** duas vezes (antes e depois). Medido com 200 famílias: ~46 KB por
salvamento. ~~Como não há tela lendo o histórico, hoje não incomoda ninguém — mas é dívida a
resolver **antes** de construir a tela de auditoria (B33)~~ **A frase riscada foi superada pela
Etapa 22, que construiu a tela ANTES de resolver esta dívida — e isso foi decisão, não
esquecimento.** Reduzir o que se grava é mudar o contrato de auditoria (*o que deixa de ser
registrado?*), e essa decisão é sua; construir a tela primeiro **torna o problema visível**, que
é progresso. O que a Etapa 22 fez para o problema não morder: a tela **corta cada valor em 300
caracteres** e diz quantos faltam (furo **C29**), e a consulta continua paginada declarando o
corte. **G8 segue aberto e esperando você.**

**G7 (NOVO, medido na revisão da Etapa 15). As CINCO rotas de upload do módulo respondem erro
genérico 500 quando o arquivo em si é rejeitado** — tipo errado (um PDF onde se espera imagem),
tamanho acima do limite (10MB nas antigas, 2MB na assinatura) ou campo de arquivo inesperado. A
validação **funciona** (nada é gravado, nenhum arquivo órfão fica — isso foi medido com sonda na
revisão), mas o erro escapa do tratador da rota e vira `Erro interno do servidor` em vez de um
400 dizendo o motivo. Nenhum fluxo normal do sistema dispara isso (as telas só enviam o tipo
certo); morde quem integrar por API. É o padrão herdado das 4 rotas antigas (foto de material,
certificado, comprovante de sucata, calibração) — a rota nova de assinatura **seguiu o padrão
de propósito** em vez de divergir sozinha; o conserto certo é uniforme, nas cinco de uma vez
(pendência nomeada na spec 24).

---


**G9 (NOVO, medido na revisão adversarial da Etapa 28). Os claims `UPDATE ... RETURNING` lidos por
`dbGet` rodam FORA da fila de escrita do `sqliteConcurrency`, e o erro do `finalize` não chega ao
callback.** O padrão anti-corrida do módulo (sucateamento, cancelamento, e agora a conferência da
separação) faz o claim com `dbGet` porque precisa do `RETURNING`. Medido: `patchedGet` não entra na
`writeChain` (só `run` entra), e no `get` do node-sqlite3 o erro do `finalize` (o commit) é
descartado. Em modo WAL isso não muda nada na prática; em modo rollback-journal (o aviso do
OneDrive em `index.js:1002`), um `SQLITE_BUSY` no commit poderia deixar o claim não persistido com a
rota respondendo 200. **Não é da Etapa 28** — é de todo `get` da base desde antes — e a saída é
uma só para todos os claims (um `dbRunReturning` que passe pela fila), etapa própria. Fica aqui
para ninguém "corrigir" um claim de cada vez.

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

## Etapa 8 — Materiais de Clientes (2026-08-12)

**Em uma frase:** a chapa que o cliente manda para a GMP industrializar deixou de viver numa
**lista à parte** — sem lote, sem série, sem endereço, sem extrato, sem etiqueta e fora do controle
de estoque — e virou **material de verdade, com dono**: fica fora de todo número do nosso estoque,
só sai no trabalho do próprio cliente, e tem tela e documento próprios.

**O que há de novo (visível para o usuário):**
- Na ficha do material, seção nova **Propriedade**: escolhe-se o **cliente proprietário** ou
  **"GMP (estoque próprio)"**. Material sem proprietário é nosso — é o padrão.
- **Selo com o nome do cliente** ao lado do material em **Materiais**, **Movimentações** e
  **Extrato**. O selo diz *de qual cliente é*, não só *que é de alguém*; passando o mouse, ele
  explica a consequência: "não entra no estoque próprio e só sai com OS ou projeto desse cliente".
- **Saída de material de cliente exige OS ou projeto daquele mesmo cliente.** Antes, nada impedia
  aplicar a chapa do Cliente A no equipamento do Cliente B.
- **A saída emergencial não vale para material de cliente** — em todo o resto do módulo ela libera
  a saída sem vínculo; aqui, não.
- **Ajustar o saldo de material de cliente exige permissão própria** (`ajustar_material_cliente`,
  só Administrador), com auditoria nomeando o cliente. Antes, qualquer Almoxarife zerava o saldo da
  chapa do cliente — pelas **duas** rotas de movimentação.
- **Recebimento de material de cliente exige o número da nota** (a nota de remessa). Sem ela, a
  nota inteira é recusada. Material nosso continua entrando sem nota.
- **Nada de material de cliente entra nos números do estoque próprio:** valor total do estoque,
  materiais críticos, materiais zerados, reposição de mínimo, sugestão automática de compra, alerta
  de estoque baixo e relatório de posição. Antes, o sistema chegaria a **abrir um pedido de compra
  para repor a chapa de outra empresa**.
- **Mas continua aparecendo onde ele realmente está:** na ocupação de prateleira do **Mapa de
  Localizações** e no relatório de **materiais bloqueados**. É de propósito — a chapa ocupa a
  prateleira de verdade e é bloqueada de verdade; o selo é o que evita a confusão, não escondê-la.
- Nova tela **Almoxarifado → Materiais de Clientes**: escolhe o cliente e vê **recebido,
  consumido, devolvido, saldo e saldo disponível** por material, mais **em quais OS/projetos** o
  material dele foi aplicado. Com **PDF de posição** e botão **Devolver ao cliente**.
- Tipo de movimento novo **Devolução ao cliente** — é **saída** (o material sai do prédio de volta
  para o dono), com **número do documento obrigatório**. Não confundir com a tela de **Devoluções**
  da Etapa 7, onde o material **volta** para o estoque.
- Material de cliente agora aceita **lote, número de série, endereço, extrato e etiqueta** como
  qualquer outro — é o ganho central da unificação.

**Por baixo do capô:**
- O dono mora na linha do **material** (`proprietario_cliente_id`), não na linha de saldo. Duas
  razões: o disponível é um número **por material**, e repartir propriedade dentro dele faria toda
  guarda de "saldo insuficiente" virar cirurgia no núcleo do motor; e a chapa do Cliente X tem
  certificado e corrida próprios — **não pode ser trocada** pela do Cliente Y. Custo aceito: o
  catálogo ganha uma linha por cliente do mesmo item físico.
- **A segregação não foi "lembrar de filtrar".** O risco desta etapa não era quebrar: era **não
  quebrar e o número ficar errado** — falha silenciosa que nenhum teste existente pegaria. Por isso
  as **40 leituras** da tabela de materiais foram levantadas e classificadas uma a uma: as que leem
  estoque próprio filtram; as que leem **um** material por código não filtram (filtrar ali pararia
  o motor para material de cliente); e as que leem conjuntos **físicos** não filtram de propósito,
  ganhando o selo em troca.
- A auditoria achou que a especificação **mandava olhar o lugar errado**: a lista original varria
  só um subdiretório e deixava de fora justamente o **dashboard** (onde o valor total somaria o
  patrimônio do cliente ao nosso) e o **relatório de posição de estoque**. Corrigido, e a correção
  ficou escrita na spec em vez de aplicada em silêncio.
- A trava do ajuste foi posta **dentro do motor**, não na rota: o Ajuste chega por **duas** rotas,
  ambas liberadas para quem pode movimentar — travar uma deixaria a outra aberta.
- As rotas antigas da lista à parte foram **removidas** (enquanto vivas, eram um caminho paralelo
  que escapava de todas as travas novas). **A tabela foi preservada** — nenhuma linha foi apagada.
- Todo teste de segregação tem **controle positivo obrigatório**: além de provar que o material do
  cliente sumiu, prova que o material **nosso equivalente continua aparecendo**. Sem essa metade,
  um filtro escrito errado que zerasse a leitura passaria como se estivesse segregando — e foi
  exatamente isso que uma das sabotagens de teste mostrou.
- O PDF de posição é gerado **no navegador**, como as etiquetas da Etapa 6c — zero mudança de
  servidor.

**Antes → Agora:**
- Antes: material de cliente era uma lista à parte com descrição em texto livre, sem lote, série, endereço, extrato ou etiqueta → Agora: é material normal com dono, e tudo que as Etapas 1 a 7 entregaram vale para ele.
- Antes: **nada impedia** usar a chapa do Cliente A no equipamento do Cliente B → Agora: o sistema recusa, **nomeando os dois clientes**.
- Antes: a saída emergencial liberava qualquer saída sem vínculo → Agora: material de cliente **não aceita** emergencial — única exceção deliberada do módulo.
- Antes: qualquer Almoxarife zerava o saldo da chapa do cliente, pelas duas rotas → Agora: só Administrador, com permissão própria e auditoria nomeando o cliente.
- Antes: material de cliente entrava sem documento nenhum → Agora: exige o número da nota de remessa, ou a nota inteira é recusada.
- Antes: o material de terceiro contava como **patrimônio nosso** e o sistema abriria pedido de compra para repô-lo → Agora: fora do valor do estoque, da reposição, da sugestão de compra e da posição.
- Antes: não existia tela nenhuma → Agora: tela com posição por cliente, aplicações por OS/projeto, PDF e devolução.
- Antes: não havia como registrar o material saindo de volta para o dono → Agora: "Devolução ao cliente", com documento obrigatório e rastro no extrato.

### Regras e validações desta etapa — cada uma demonstrável ao vivo

Todas as mensagens abaixo são as **mensagens reais** do sistema. Para o roteiro: **Cliente Alfa
LTDA** e **Cliente Beta SA**, material **CHP-002** (Chapa 3mm) pertencente ao **Alfa**, e
**MAT-001** como material nosso de controle.

**1. Material de cliente só é aplicado em trabalho do próprio cliente.**
*Cenário:* cadastre o CHP-002 com **Propriedade = Cliente Alfa LTDA**. Em **Movimentações**, lance
**Saída para Produção** de 10 PC informando o **projeto do Cliente Beta SA**.
*O sistema recusa*, com:
> `Material CHP-002 pertence ao cliente Cliente Alfa LTDA, mas o projeto Projeto Beta e do cliente Cliente Beta SA. Material de cliente so pode ser aplicado em trabalho do proprio dono — troque o vinculo, ou use o material equivalente do estoque proprio.`

*Variações que também recusam:* **sem OS nem projeto** (`Material CHP-002 pertence ao cliente
Cliente Alfa LTDA e so pode sair com OS ou projeto DESSE cliente. Informe a OS ou o projeto de
Cliente Alfa LTDA.`) e com **projeto interno**, sem cliente — "nenhum cliente" não é coringa.
*Controle positivo:* com um **projeto do Alfa**, a mesma saída **passa**; e material **nosso** sai
para o projeto do Beta normalmente — a trava é sobre o dono do **material**, não sobre o vínculo.
*Por que importa:* aplicar a chapa de um cliente no equipamento de outro é o erro mais caro
possível — não é erro de estoque (o número fecha), é problema **contratual**: o cliente cobra onde
foi parar o material dele.

**2. A saída emergencial não vale para material de cliente.**
*Cenário:* a mesma saída, agora marcando **"Saída emergencial"** e escrevendo a justificativa.
*O sistema recusa*, com:
> `Material CHP-002 pertence ao cliente Cliente Alfa LTDA: saida emergencial nao e permitida para material de terceiro. O emergencial regulariza o vinculo depois, e material de cliente exige saber na hora em qual OS ou projeto DESSE cliente ele foi aplicado. Informe a OS ou o projeto do proprio cliente.`

*Por que importa:* esta é a **única exceção deliberada ao padrão do módulo** — em todo o resto, o
emergencial libera a saída e marca "pendente de regularização". O emergencial existe para urgência
no **nosso** estoque, onde dá para acertar depois porque o prejuízo de errar é interno. Com material
de terceiro, **"regularizo depois" não é resposta para o dono**.

**3. Ajustar o saldo de material de cliente exige permissão própria.**
*Cenário:* com um usuário de perfil **GESTOR** (que ajusta o estoque próprio normalmente), lance um
**Ajuste** no CHP-002.
*O sistema recusa (403)*, com:
> `Ajustar o saldo do material CHP-002, que pertence ao cliente Cliente Alfa LTDA, exige a permissao "ajustar_material_cliente" (seu perfil: GESTOR). Ajustar estoque de terceiro mexe no numero que o cliente vai cobrar.`

*Repita pelo modal rápido da tela de Materiais* (a rota antiga de movimentação): **recusa igual** —
a checagem está no motor, não na tela. *Controle positivo:* o **mesmo usuário** ajusta material
**nosso** sem problema; só o dono do material muda entre os dois testes.
*Por que importa:* antes desta etapa, **um Almoxarife zerava o saldo da chapa do cliente pelas duas
rotas de movimentação**, sem nada registrar de quem era o material. Agora só Administrador, e todo
ajuste fica auditado **com a razão social do proprietário**.

**4. Recebimento de material de cliente exige número de documento.**
*Cenário:* crie um recebimento com o CHP-002 e **deixe o campo de nota em branco**; processe.
*O sistema recusa a nota inteira* (nenhum item entra), com:
> `Nao foi possivel dar entrada no estoque: CHP-002: material do cliente Cliente Alfa LTDA exige numero de documento (nota de remessa) para dar entrada`

*Campo só com espaços conta como em branco* — recusa igual. *Controle positivo:* material **nosso**
continua entrando **sem** nota (entrada manual, devolução, ajuste de inventário) — travar isso para
todo mundo quebraria todo o recebimento do módulo.
*Por que importa:* a nota de remessa é o papel que prova **que a chapa chegou, de quem, e em que
quantidade**. Sem ela, não há como responder ao cliente o que foi recebido.

> **Nota sobre a especificação:** o requisito original dizia "entrada exige cliente **+ projeto** +
> documento". **Isso estava errado, e a correção faz parte da entrega.** Um mesmo cliente manda a
> mesma chapa para **dois projetos** — exigir o projeto na entrada obrigaria a cadastrar dois
> materiais idênticos para o mesmo item físico do mesmo dono. **O projeto é exigido na saída**, que
> é onde a aplicação importa (regra 1). A afirmação errada foi corrigida **dizendo que estava
> errada**, e não apagada em silêncio.

**5. Devolver ao cliente exige o número do documento de devolução.**
*Cenário:* em **Materiais de Clientes**, escolha o Alfa, clique em **Devolver** na linha do
CHP-002, informe 10 e **deixe o documento em branco**.
*O sistema recusa*, com `Informe o número do documento de devolução` (a tela barra antes de enviar;
forçado por fora, o servidor responde `documento_devolucao: informe o numero do documento de
devolucao`). Com o documento preenchido, **o saldo baixa** e a linha "Devolução ao cliente" aparece
no **extrato do material**.
*Uma segunda trava, no mesmo lugar:* tentar devolver ao cliente um material **sem dono** é recusado
com:
> `O material MAT-001 nao pertence a nenhum cliente — nao ha para quem devolver. Para tirar material proprio do estoque use Movimentacoes (saida, sucata ou perda).`

*E uma isenção proposital:* a devolução ao cliente **não** pede OS nem projeto — o destino é o
próprio dono, e exigir a OS dele para devolver a ele não faria sentido.
*Por que importa:* a devolução ao cliente é uma saída física do prédio. Sem número de documento não
há como provar depois o que voltou, quando e para quem.

**6. O material do cliente não entra em nenhum número do estoque próprio.**
*Cenário:* anote o **"Valor total do estoque"** do Dashboard. Dê entrada de **100 PC** de CHP-002
com custo **R$ 25** (com a nota preenchida, regra 4). Volte ao Dashboard.
*O número não muda* — nem o valor total (os R$ 2.500 do cliente **não** entram), nem "materiais
críticos", nem "materiais zerados", nem o relatório de **posição de estoque**.
*Complete a demonstração:* ponha o CHP-002 **abaixo do mínimo** e rode a verificação de mínimos —
**nenhuma solicitação de compra** é criada para ele e **nenhum alerta** de estoque baixo sai.
*Controle positivo (a metade que prova que o filtro não zerou tudo):* faça o mesmo com um material
**nosso** abaixo do mínimo — a solicitação **é** criada e o alerta **sai**.
*Por que importa:* antes, um material de terceiro na base contaria como **patrimônio nosso** no
balanço do estoque, e o sistema chegaria a **abrir pedido de compra para repor a chapa de outra
empresa**.

**7. Mas o material do cliente APARECE onde ele fisicamente está — de propósito.**
*Cenário:* endereça o CHP-002 numa prateleira e abra o **Mapa de Localizações**: a quantidade dele
**conta** na ocupação daquela posição. Bloqueie parte dele e abra o relatório de **materiais
bloqueados**: ele **aparece**.
*Por que importa:* esses dois são conjuntos **físicos**. A chapa do cliente ocupa a prateleira de
verdade e é bloqueada de verdade — escondê-la faria o mapa mentir sobre o galpão e tiraria do
almoxarife exatamente o que ele precisa ver na fila de qualidade. **O que evita a confusão é o
selo, não o filtro.**

**8. O selo diz de QUAL cliente é o material, nas três telas.**
*Cenário:* abra **Materiais**, depois **Movimentações**, depois o **Extrato** do CHP-002. Nas três,
ao lado do material, o selo **"Cliente Alfa LTDA"** — com o nome, não um rótulo genérico. Passe o
mouse: *"não entra no estoque próprio e só sai com OS ou projeto desse cliente"*.
*Controle positivo:* a linha do **MAT-001** (nosso) **não tem selo nenhum** nas mesmas três telas.
*Por que importa:* a unificação pôs a chapa do cliente na mesma lista que a nossa. Um selo que só
dissesse "material de cliente" resolveria metade do problema — quando há dois clientes com a mesma
chapa, é o **nome** que evita pegar a errada.

### ⚠️ O que fazer antes de subir a Etapa 8 para produção

**1. A conferência de inventário escapa da permissão nova — e isso é um caminho real.** Concluir
uma conferência de estoque com **"aplicar ajustes"** grava o saldo do material por um caminho
antigo, **fora do motor** — e portanto **fora** da permissão `ajustar_material_cliente` da regra 3.
Na prática: **o mesmo GESTOR barrado no ajuste pela tela de Movimentações consegue mudar o saldo da
chapa do cliente pela conferência de inventário**, sem a autorização especial e sem a auditoria que
nomeia o cliente. Não é hipótese — foi confirmado por dois revisores independentes durante a etapa.
Não foi corrigido porque fechar isso significa reescrever a aplicação de ajustes da conferência
para passar pelo motor, o que é uma etapa por si. **Enquanto isso: trate "concluir conferência com
ajustes" como operação de Administrador quando houver material de cliente envolvido, e confira a
posição do cliente depois de cada conferência.**

**2. Confirmar em produção que a lista antiga está vazia.** As rotas da lista à parte foram
removidas com base na medição do banco de **desenvolvimento** (0 linhas). **A tabela foi preservada
de propósito e nenhuma linha foi apagada** — mas a mesma consulta precisa ser rodada em produção. O
SQL exato e o que fazer com cada resultado estão no guia
(`docs/almoxarifado-guia-etapas-e-testes.md`, seção "Etapa 8 → O que fazer ANTES de subir para
produção").

**Limites declarados:** **materiais enviados a terceiros** (a chapa **nossa** que vai para o
fornecedor beneficiar) é a feature 14 e virou a **Etapa 8b** — *quando esta seção foi escrita nada
dela existia; foi entregue no mesmo dia, e está na seção "Etapa 8b" logo abaixo*; **e-mails**
específicos de material de cliente ficam para a feature 19; **sobras vinculadas ao proprietário**
(o retalho que sobra da chapa do cliente) dependem da tela de retalhos, feature 15; **relatórios de
perdas, não conformes e reservados por cliente** e a **valorização** por cliente ficam para a
feature 21 (o PDF de posição traz quantidades, não valor); o **fluxo de aprovação assíncrono do
ajuste** (solicitar → pendente → aprovar) foi descartado nesta etapa em favor da permissão
dedicada, que é imediata — o fluxo fica na feature 06; o **comprovante de devolução ao cliente em
PDF** não entrou (a devolução em si entrou); e **os relatórios que misturam** (materiais bloqueados
e materiais sem endereço) continuam **sem selo** — ele foi entregue nas três telas operacionais.

**Três pendências que continuam abertas (registradas, não consertadas):**
1. **A conferência de inventário ajusta fora do motor** (ver acima) — a mais importante desta etapa.
2. **Da Etapa 7: o Ajuste não acerta o "bloqueado".** Material com 8 unidades bloqueadas e um
   Ajuste levando o total para 1 fica com bloqueado maior que o total — **Disponível negativo, sem
   aviso**. A decisão é de negócio e continua esperando: o Ajuste deve baixar o bloqueado, recusar,
   ou avisar? Enquanto isso, resolva a quarentena antes de lançar um ajuste que reduz o total.
3. **Da Etapa 7: estado parcial na devolução para Sucata, sem notificação.** Se a segunda
   movimentação falhar depois de a primeira ter entrado, a devolução fica marcada como estado
   parcial na auditoria e a resolução é manual — **ninguém é notificado**.

---

## Etapa 8b — Remessas a Terceiros (2026-08-12)

**Em uma frase:** quando uma chapa vai para o galvanizador, ela deixa de sumir do controle — sai do
disponível sem sair do patrimônio, com prazo, documento, retorno parcial e baixa justificada do que
nunca voltou.

**O problema que existia:** mandar material para fora beneficiar (corte, dobra, usinagem,
tratamento, pintura, galvanização) **não tinha lugar nenhum no sistema**. Ou alguém dava baixa — e
o material **desaparecia do patrimônio**, embora continuasse sendo da empresa — ou não dava baixa
nenhuma, e o sistema **afirmava que a chapa estava na prateleira** com ela a 40 km. Não havia
prazo, não havia retorno parcial, e não havia como amarrar a peça que voltou à chapa que saiu.

**O que há de novo (visível para o usuário):**
- Tela nova **Almoxarifado → Remessas a Terceiros**: criar remessa com vários itens, **Enviar**,
  **Registrar retorno**, **Encerrar** e **Cancelar**, com a coluna do terceiro na lista e filtro
  por status.
- A remessa guarda **quem é o terceiro** (fornecedor cadastrado no módulo Compras ou nome
  digitado), o **tipo de serviço** (galvanização, corte, dobra...), o **prazo previsto de retorno**
  e as observações.
- Selo vermelho **Vencida** ao lado do status, quando o prazo passou e ainda há material lá fora —
  o selo **se soma** ao status, não o substitui.
- Botão **PDF da remessa**: o documento que acompanha o material saindo do prédio, com o número, o
  terceiro, os itens, e **duas linhas de assinatura** para o papel voltar assinado.
- Ao abrir a remessa, a tabela de itens separa três colunas que são coisas diferentes: **Retornado**
  (o que voltou de verdade para a prateleira), **Baixado (não voltou)** (o que foi liquidado por
  perda/consumo no encerramento) e **Ainda no terceiro**.
- Em **Materiais** e no **Extrato**, o material mandado para fora **continua no total** e some do
  **disponível** — ele não sumiu do patrimônio, só não está à mão.

**Por baixo do capô:**
- Uma **quarta coluna de retenção** (`quantidade_em_terceiros`) ao lado das três que já existiam
  (reservada, bloqueada, em inspeção). Ela é a única das quatro que significa **"não está no
  prédio"** — e essa distinção decide o comportamento do inventário (regra 4 abaixo).
- **A conta do "disponível" estava escrita à mão em 14 lugares diferentes do código**, espalhados
  por 8 arquivos — inclusive um que nem pertence ao módulo. Acrescentar a coluna nova em 13 e
  esquecer 1 não quebraria nada: o sistema passaria a **recusar por um caminho e aceitar por
  outro**, com o número errado em silêncio. Em vez de acertar os 14 e torcer, a conta passou a
  existir num **único lugar** (`availabilitySql.js`), e há um teste que varre o código-fonte e
  falha se alguém voltar a copiá-la.
- O efeito de saldo acontece **dentro do motor de estoque**, por quatro tipos de movimento novos —
  dois de retenção (remessa/retorno, que não mexem no patrimônio) e dois de baixa definitiva
  (perda/consumo no terceiro, que baixam físico e retenção no mesmo lançamento). Tudo fica no livro
  de movimentações.
- Envio e retorno usam a forma já validada no recebimento: **pré-checagem que recusa a operação
  inteira antes de mover qualquer item**, depois efeito item a item com reivindicação atômica do
  saldo. O módulo não tem transação de banco; essa é a compensação explícita que o substitui.
- O PDF é gerado **no navegador**, como as etiquetas da Etapa 6c e a posição por cliente da Etapa 8
  — **zero mudança de servidor**.

### As regras, com o cenário exato

Todas as mensagens abaixo são as **mensagens reais do sistema**, copiadas do código. Onde aparece
`REM-4523900712`, é o número que o sistema gera sozinho para a remessa — o seu vai ser outro.

**1. Enviar tira do disponível e NÃO tira do patrimônio.**
*Cenário:* material com **100** no estoque; criar remessa de **30** para a Galvanizadora e clicar
em **Enviar**. Depois, abrir **Materiais**: o **total continua 100** e o **disponível é 70**.
Tentar uma **Saída** de 80 daquele material:
> `Saldo insuficiente. Disponível: 70 UN`

*Por que importa:* é a resposta exata para as duas maneiras erradas de fazer isso hoje. Dar baixa
apagaria do patrimônio uma chapa que continua sendo da empresa; não dar baixa nenhuma deixaria o
sistema oferecer para consumo um material que está a 40 km.

**2. A remessa é enviada inteira, ou não é enviada.**
*Cenário:* remessa com **dois itens**, um deles sem saldo (MAT-002 com disponível **5**, a remessa
pede **50**). Clicar em **Enviar**:
> `Nao foi possivel enviar a remessa REM-4523900712: MAT-002: disponivel 5 UN, a remessa pede 50`

**Nenhum dos dois itens sai.** O item que tinha saldo continua com o disponível cheio — o operador
corrige a linha que falta e reenvia, em vez de descobrir depois que metade da remessa saiu.

**3. Duas linhas do MESMO material que juntas estouram o saldo também são recusadas.**
*Cenário:* material com **100 PC** disponíveis; remessa com **duas linhas de 60** do mesmo material
(é caso normal: cada linha tem lote, peso e observação próprios, para separar duas chapas do mesmo
código). Clicar em **Enviar**:
> `Nao foi possivel enviar a remessa REM-4523900712: CHP-3MM: disponivel 100 PC, a remessa pede 120 em 2 linhas`

*Por que este cenário está aqui e não junto com o anterior:* **era um defeito real, encontrado
durante o desenvolvimento e medido com o sistema rodando.** A checagem original olhava **cada linha
sozinha** — 60 cabe em 100, duas vezes —, então as duas passavam, a primeira era enviada e a
segunda batia numa trava mais funda. Resultado medido antes da correção: **60 unidades retidas, o
primeiro item enviado, o segundo não, e a remessa parada no estado inicial**. É exatamente a
remessa pela metade que a regra 2 existe para impedir. A mensagem diz **"em 2 linhas"** de
propósito: sem isso o operador olha uma linha de 60, vê 100 disponíveis e conclui que o sistema
está errado.

**4. A contagem de inventário não cobra o que está no terceiro.**
*Cenário:* material com **100** no total e **30** no galvanizador. Abrir **Conferência de
inventário** → o esperado daquele item vem **70**. Contar 70 na prateleira dá **divergência zero**.
*Antes desta etapa isso acusaria −30*, e o caminho natural seria "corrigir" o saldo para menos de
material que existe e vai voltar.

**5. Bloqueado e em quarentena CONTINUAM sendo contados — e isso é de propósito.**
*Cenário (é o controle da regra 4):* material com **100** no total, **40 bloqueados** e **25 em
quarentena**, nada em terceiros → o esperado da conferência é **100**, não 35.
*Por quê:* aquele material **está** na prateleira e **tem** de ser contado; "bloqueado" é um estado
administrativo, não uma ausência física. Só o que está no terceiro sai da contagem. Quem
"uniformizar as quatro colunas" passa a esconder do inventário material que está no galpão.

**6. Não dá para receber de volta mais do que saiu — e a mensagem diz quanto ainda está lá.**
*Cenário:* remessa de **100**, já retornaram **70**; registrar mais **40**:
> `Retorno acima do enviado: o item CHP-3MM enviou 100 PC, ja retornaram 70 e ainda estao no terceiro 30 — este recebimento pede 40`

*Por que importa:* a mensagem dá os quatro números de propósito. Sem eles o operador teria de
adivinhar quanto ainda pode receber — e essa lição já custou caro na Etapa 7.

**7. Encerrar deixando saldo lá fora exige dizer PARA ONDE ele foi.**
*Cenário:* remessa com dois itens pendentes, **30** de um e **45** de outro. Clicar em **Encerrar**
sem escolher destino:
> `A remessa REM-4523900712 tem 75 PC que nunca voltaram (CHP-3MM: 30 PC; CHP-5MM: 45 PC). Para encerrar, informe o destino desse saldo: PERDA_NO_TERCEIRO ou CONSUMIDO_NO_PROCESSO, mais a justificativa.`

A mensagem nomeia o **total agregado** (75) **e** abre item a item — e a unidade só acompanha o
total quando **todos** os itens usam a mesma; numa remessa com um item em KG e outro em UN, somar e
anunciar "75 KG" seria um número inventado.

- **Perda no terceiro** = sumiu ou foi danificado lá.
- **Consumido no processo** = virou cavaco, refugo de processo.

**8. Encerrar com destino ZERA o saldo em terceiros — o material não fica preso.**
*Cenário:* a mesma remessa, agora escolhendo **Perda no terceiro** e escrevendo a justificativa.
Os 75 **saem** de "em terceiros" **e** do patrimônio, com as movimentações correspondentes no
livro, e a remessa vai para ENCERRADA.
*Por que só justificativa não bastaria:* texto livre fecharia a remessa e deixaria as 75 unidades
retidas para sempre num material cuja remessa já acabou — exatamente o tipo de saldo órfão que este
módulo já teve de corrigir duas vezes (reserva presa na Etapa 6, linha órfã de devolução na
Etapa 7).

**9. Remessa que voltou inteira encerra sozinha, sem perguntar nada.**
*Cenário:* registrar o retorno dos 100 de uma remessa de 100 → a remessa vai direto para
**ENCERRADA**. Não sobrou pendência, então não há o que justificar — e o sistema **não** pede
destino nesse caso.

**10. Cancelar uma remessa já enviada devolve ao disponível só o que ainda está lá fora.**
*Cenário:* remessa de 100 enviada, com 60 já retornados; cancelar com motivo → voltam ao disponível
**os 40** que ainda estavam no terceiro, não os 100. Cancelar uma remessa que ainda **não** foi
enviada não mexe em saldo nenhum.

**11. A chapa do cliente pode ir para o terceiro — e o papel diz de quem ela é.**
*Cenário:* material com dono (Etapa 8) numa remessa de galvanização. **Passa sem exigir OS nem
projeto do cliente** — mandar galvanizar não é *aplicar* a chapa no trabalho de ninguém, é o mesmo
espírito da transferência entre prateleiras. Em troca, a remessa **registra o proprietário** e o
**PDF nomeia o cliente**.
*Controle:* a regra da Etapa 8 continua valendo — tentar uma **saída** normal daquele material sem
a OS do dono continua sendo recusada.
*Por que a contrapartida é obrigatória:* sem o nome no papel, a isenção viraria um caminho para
material de cliente sair do prédio sem rastro de propriedade — o oposto do que a Etapa 8 construiu.

**12. Remessa não mistura donos — mas ver o item E de "Leia antes de apresentar".**
*Cenário:* montar uma remessa com chapa do Cliente A e chapa do Cliente B:
> `A remessa mistura materiais de donos diferentes (Cliente A LTDA e Cliente B LTDA). O documento de remessa nomeia UM proprietario — separe em remessas diferentes.`

⚠️ **Esta regra foi deduzida, não pedida por vocês.** Ela está aqui como **pergunta**, não como
requisito atendido — o detalhe está no item **E** do bloco "Leia antes de apresentar".

**13. Quem pode mandar material para fora do prédio.**
Ação de permissão nova **`remessar_terceiro`**, hoje concedida a **ADMINISTRADOR** e
**ALMOXARIFE** — os mesmos perfis de "movimentar". Quem não tem e clica em **Enviar**,
**Registrar retorno**, **Encerrar** ou **Cancelar** recebe um aviso na tela **antes** de o
formulário abrir, com o mesmo texto que o servidor produziria; forçada a chamada por fora, o
servidor responde **403**:
> `Sem permissão para esta operação` *(a resposta também diz qual ação faltou: `remessar_terceiro`)*

*Os botões continuam visíveis de propósito* — a tela barra a ação, mas não esconde nada: se a
consulta de permissões falhar (rede, servidor lento), ela **deixa passar** e o 403 do servidor
decide. Esconder botão por causa de um erro de rede tiraria a função de quem tem direito a ela.
**Quem decide é sempre o backend.**

*Por que uma permissão separada se hoje os perfis são os mesmos:* o ganho não é restringir hoje, é
**poder restringir amanhã sem reescrever nada**. Mandar material para fora do site é um risco
diferente de mover uma prateleira. **Ler** as remessas não exige a ação — quem consulta precisa
poder ver onde o material está; só **agir** exige.

**Antes → Agora:**

| Antes | Agora |
|---|---|
| Chapa que vai galvanizar some do controle: ou baixa que apaga o patrimônio, ou nenhuma baixa e o sistema mente sobre a prateleira | Sai do disponível e **continua no patrimônio**, com documento, terceiro e prazo |
| Não havia como saber o que está em cada terceiro | Tela listando as remessas com o terceiro, o prazo e o status, filtro por status e selo de **remessa vencida** |
| Retorno parcial não existia | Vários retornos por remessa, com teto que soma o que já voltou, por item |
| O que não voltava ficava indefinido para sempre | Encerrar exige **destino** (perda ou consumo) + justificativa, e dá baixa de verdade |
| A contagem de inventário cobraria material que está a 40 km | O esperado já vem descontado — e bloqueado/quarentena **continuam** sendo contados |
| Nada registrava que a chapa de um cliente saiu do prédio para beneficiar | A remessa registra o proprietário e o PDF nomeia o cliente |

**O que esta etapa NÃO cobre (é decisão declarada, não esquecimento):**
- **Transformação** — a chapa que sai e volta como 40 peças cortadas mais uma sobra. Era a
  **Etapa 8c**, **entregue em 2026-08-13** (seção logo abaixo). A estrutura de dados desta etapa já
  nasceu pronta para ela (o retorno é uma *lista de resultados*, não um número), e até a 8c o
  sistema **recusava** o retorno de material diferente. **Metade dos beneficiamentos já estava
  completa nesta etapa** — tratamento, pintura e galvanização devolvem o **mesmo** material; só
  corte, dobra e usinagem devolvem material diferente, e são esses que a 8c passou a cobrir.
- **E-mail** no envio e no retorno (feature 19) e **alerta automático** de atraso (feature 20). O
  prazo é gravado, existe a leitura das remessas vencidas e a tela destaca; o **disparo** é das
  outras features.
- **Anexo de desenhos** nos itens da remessa — dizia-se aqui que "o consumidor natural dele é a
  8c". **A 8c não o consumiu:** ela foi entregue sem anexo de desenho, e a pendência continua
  aberta, agora sem etapa natural atribuída.
- **Estornar pelo livro uma baixa de perda no terceiro devolve o material ao disponível**, e não à
  situação "em terceiros": a remessa já está encerrada, e recriar a retenção deixaria saldo preso
  sem remessa viva por trás. Já o par remessa/retorno **não é estornável pelo livro** — o caminho é
  a própria tela de Remessas, senão o livro registraria uma reversão que não aconteceu.
- **Nada a medir em produção antes do deploy.** A etapa só **acrescenta** uma coluna e três tabelas
  novas; **nenhum dado existente é tocado ou reinterpretado**. Diferente das Etapas 7 e 8, esta não
  deixa nenhuma consulta para rodar em produção.

---

## Etapa 8c — Transformação no Terceiro (2026-08-13)

**Em uma frase:** a chapa que sai para o cortador e volta como 40 peças e uma sobra para de mentir
no estoque — a chapa é baixada de verdade, as peças entram com o custo dela rateado, e o sistema
diz quanto do peso voltou.

**O problema que existia.** A Etapa 8b resolveu a metade fácil do beneficiamento: galvanizar,
pintar e tratar devolvem **o mesmo material**. Cortar, dobrar e usinar devolvem **outra coisa** — e
para essa metade o sistema **recusava o retorno**, com uma mensagem que literalmente dizia "isso é
a Etapa 8c". Sobravam duas saídas, as duas ruins: registrar como se a chapa tivesse voltado inteira
— e aí o estoque passa a ter uma chapa que não existe, enquanto a peça que existe não aparece em
lugar nenhum — ou não registrar nada, e o material some do controle **exatamente na hora em que
vira produto**. O galpão não tinha terceira opção.

**O que há de novo (visível para o usuário):**
- Botão **Transformar** dentro da remessa, ao lado de "Registrar retorno". O modal tem **dois
  números que são coisas diferentes**: **quanto da chapa foi consumido** (na unidade da chapa) e
  **o que voltou** — quantas linhas forem precisas, cada uma com **material**, **quantidade** e
  **classificação** (Peça ou Sobra).
- Campo **opcional** para o **custo do serviço** do terceiro (a nota do cortador).
- Botão **Criar material resultante** dentro do próprio modal: cadastra a peça na hora, já
  herdando a **família** e o **dono** da chapa, sem sair da tela e sem perder o que já foi digitado.
- **Rendimento** logo depois de confirmar: *"Rendimento: 91.72% (saíram 785 kg, voltaram 720 kg)"*.
  Quando falta peso cadastrado em algum material, o sistema **diz qual** — e **deixa registrar do
  mesmo jeito**.
- Coluna nova **Transformado** na tabela de itens da remessa, ao lado de "Retornado" e "Baixado
  (não voltou)" — o que virou outra coisa não é a mesma coisa que o que voltou como era.
- Na linha de retornos recebidos, cada resultado aparece classificado e com o custo aplicado:
  `[peça, R$ 25/un]`, `[sobra]`.

**Por baixo do capô:**
- Um **tipo de movimento novo** (`RETORNO_TRANSFORMACAO`) dentro do motor de estoque, e não uma
  entrada manual disfarçada. Entrada manual não sabe de dono (a peça cortada de uma chapa do
  cliente X **é** do cliente X), faz a peça parecer ter aparecido do nada no extrato, e não sabe
  que existe uma baixa de chapa do outro lado.
- **A baixa da chapa acontece ANTES do crédito das peças.** Se o crédito falhar no meio, o estoque
  fica **a menos** por alguns instantes, nunca **a mais** — material fantasma é pior que material
  temporariamente faltando. Sem transação de banco, a compensação é explícita, e o teste que a
  prova não é "os números voltaram": é **a remessa pode ser transformada de novo depois da falha**.
- O rateio de custo é uma **função pura**, isolada, com um invariante testado: *o valor que sai na
  chapa é o valor que entra nas peças*. Isolá-la é o que torna barato mudar a regra de rateio se a
  operação pedir outra (ver item **B4** do bloco de leitura).
- Duas **fontes únicas** nasceram de defeitos achados no caminho: a leitura do **custo** e as
  **listas de tipos** que somam ou subtraem saldo. As duas estavam copiadas em vários arquivos,
  divergindo em silêncio — e as duas cópias divergentes **eram bugs de produção** (itens **C3** e
  **C4**). Cada uma ganhou um teste que varre o código-fonte e **falha se alguém voltar a copiar**.

### As regras, com o cenário exato

Todas as mensagens abaixo são as **mensagens reais do sistema**, copiadas do código.

**1. Transformar baixa a chapa DE VERDADE.**
*Cenário:* chapa com 100 KG, remessa de 100 enviada, transformação consumindo 100 e devolvendo 40
peças e 1 sobra. Depois, em **Materiais**: a chapa fica com **total 0** e **em terceiros 0**; a peça
fica com **40**; a sobra com **1**.
*Isto foi medido, não deduzido:* no fechamento da etapa a operação foi executada contra um banco de
teste e os saldos foram lidos direto na tabela. Bateram nos seis pontos conferidos.

**2. O custo da chapa é rateado entre as peças, pela quantidade.**
*Cenário:* chapa a **R$ 10/KG** × 100 KG = **R$ 1.000**. As 40 peças ficam a **R$ 25** cada
(1.000 ÷ 40); a sobra fica a **R$ 0**.

**3. A sobra entra a custo ZERO — e é decisão sua, não esquecimento.** Ver o item **B4** do bloco
"Leia antes de apresentar", com o que foi escolhido e o que foi descartado.

**4. O custo do serviço soma quando informado, e o sistema não estima.**
*Cenário:* a mesma chapa de R$ 1.000 com **R$ 200** de nota do cortador → as peças ficam a **R$ 30**
(1.200 ÷ 40). Em branco, ficam a R$ 25.

**5. A peça tem de ter o MESMO dono da chapa.**
*Cenário:* remessa com chapa do Cliente A, transformando para um material nosso:
> `A peca resultante tem dono diferente da chapa: CHP-A e de Cliente A LTDA e PC-001 e de estoque proprio (material nosso). A transformacao nao pode mudar o proprietario do material — cadastre o material resultante com o mesmo proprietario da chapa, ou escolha outro material de destino.`

*Por que a mensagem nomeia os dois lados:* sem isso o operador lê "dono diferente" e não sabe **qual
dos dois cadastros** está errado, nem por qual caminho consertar. Sem a guarda, material de cliente
viraria patrimônio da GMP **em silêncio** — o oposto do que a Etapa 8 inteira construiu.

**6. O sistema NÃO cria o material resultante sozinho — e a recusa ensina o caminho.**
> `O material 999 do resultado nao existe. Cadastre o material resultante primeiro (Almoxarifado > Materiais > Novo, ou o atalho "Criar material resultante" na tela de Remessas) e refaca a transformacao — o sistema nao cria material sozinho a partir de um formulario de retorno.`

*Por quê:* cadastro-lixo em almoxarifado **não se apaga — ele ganha saldo**. Um erro de digitação
viraria um material permanente com estoque. Em troca da recusa, a tela ganhou o atalho.

**7. Chapa que volta como ela mesma não é transformação.**
> `O resultado CHP-3MM e o MESMO material da chapa enviada. Chapa que volta como ela mesma nao e transformacao: use o retorno simples da remessa.`

**8. Não dá para consumir mais do que está no terceiro.**
> `Retorno acima do enviado: o item CHP-3MM enviou 100 KG, ja retornaram 70 e ainda estao no terceiro 30 — este recebimento pede 40`

*Detalhe que importa:* o teto é sobre a **quantidade consumida da chapa**, na unidade da chapa. As
quantidades dos **resultados** estão em outra unidade e **não** entram nessa conta — 40 peças (UN)
não "cabem" nos 100 KG, são grandezas diferentes. Confundir as duas seria o erro mais fácil desta
tela, e é por isso que a transformação é um **modal próprio**, e não um modo do modal de retorno.

**9. Transformação é tudo ou nada.** Um item inválido no documento **não aplica nenhum** item do
lote — mesma regra do envio da 8b.

**10. O rendimento é informativo e NUNCA bloqueia.**
*Cenário:* 100 chapas de 7,85 kg = **785 kg** saíram; 40 peças de 15 kg + 1 sobra de 120 kg =
**720 kg** voltaram:
> `Rendimento: 91.72% (saíram 785 kg, voltaram 720 kg)`

Faltando peso em algum material:
> `rendimento nao calculavel — peso unitario nao cadastrado em: <códigos>`

**e a transformação acontece do mesmo jeito.** *Por que informativo e não trava:* não há nada de
errado num material sem peso cadastrado, e um alerta amarelo nesse caso ensinaria o operador a
ignorar alertas.

**11. Cadastrar vários materiais em sequência parou de dar erro.**
*Cenário:* cadastrar 5 peças cortadas seguidas, usando o código sugerido. Antes, o gerador olhava o
material de **maior `id`** em vez do de **maior número**, e duas telas abertas ao mesmo tempo
recebiam o **mesmo** código — dava `Código já existe`. Agora o gerador usa o **maior número da
família** e o cadastro **tenta de novo sozinho** quando dois pedidos colidem.
*Nada muda no cadastro manual:* quem digita o código continua recebendo o mesmo erro de sempre se
ele já existir.

**12. Quem pode transformar, e quem pode criar o material.**
Transformar exige **`remessar_terceiro`** (ADMINISTRADOR e ALMOXARIFE). O atalho **Criar material
resultante** tem gate **próprio**, `criar_material` — porque ENGENHARIA cadastra material e não
transforma, e barrar pelo gate errado tiraria a função de quem tem direito a ela.
*Os botões continuam VISÍVEIS de propósito:* a tela barra **no clique**, com o mesmo texto que o
servidor produziria, e **falha aberto** se a consulta de permissões não carregar — esconder botão
por causa de um erro de rede tiraria a função de quem tem direito. **Quem decide é sempre o
backend**, que responde 403 se alguém forçar a chamada por fora.

**Antes → Agora:**

| Antes | Agora |
|---|---|
| Chapa mandada cortar não tinha como ser registrada: ou "voltou inteira" (chapa fantasma no estoque) ou nada (a peça não existe para o sistema) | Botão **Transformar**: a chapa é baixada e as peças entram, no mesmo evento |
| Não havia custo de peça cortada | O custo da chapa é rateado entre as peças **pela quantidade**; a sobra entra a **zero** |
| A nota do cortador não entrava em lugar nenhum | Campo opcional que **soma** ao custo das peças |
| Material recebido por NF ficava com custo médio zerado | O recebimento por NF **alimenta o custo médio** — daqui para frente |
| Nada garantia que a peça cortada de uma chapa de cliente continuasse do cliente | A peça **tem de ter o mesmo dono**, e a recusa nomeia os dois |
| Não havia como conferir se o que voltou "fecha" com o que saiu | **Rendimento** por peso, informativo, dizendo qual material falta quando não dá para calcular |
| Cadastrar peças em sequência dava "Código já existe" | Gerador pelo **maior número** + nova tentativa automática na colisão |

**O que esta etapa NÃO cobre (é decisão declarada, não esquecimento):**
- **Não planeja o corte.** Sem lista de materiais, sem ordem de produção, sem aproveitamento de
  chapa (*nesting*). O sistema **registra o que voltou** — não diz o que deveria voltar.
- **Não controla corte feito DENTRO da GMP.** A transformação vive dentro de uma remessa a terceiro.
- **Não recalcula o custo do passado, e isso é impossível, não preguiça** — o livro de movimentações
  não guarda o custo de cada lançamento (item **D**).
- **Não valida que os pesos fecham** — rendimento de 300% é mostrado, não recusado.
- **Não guarda o rendimento** — ele aparece uma vez, no aviso, e some.
- **Não anexa desenho** ao item da remessa. A 8b registrou que "o consumidor natural disso é a 8c";
  **a 8c não o consumiu**, e a pendência continua aberta.
- **Não manda e-mail nem alerta** (features 19 e 20).
- **Nada a rodar em produção por causa desta etapa.** As colunas novas nascem vazias e nenhum dado
  existente é reinterpretado. **Mas dois números que você olha mudam**, por causa dos dois defeitos
  antigos corrigidos no caminho — itens **C3** e **C4** do bloco de leitura.

---

## Etapa 9 — Retalhos, Sobras e Sucatas (2026-08-16)

**Em uma frase:** a meia chapa que sobra do corte vira estoque de verdade — com saldo, etiqueta com
QR e sugestão de uso antes de cortar chapa nova — e sucatear deixa de ser um clique de uma pessoa
só: vira processo com duas assinaturas de pessoas diferentes, destino registrado e número
financeiro.

**O problema que existia.** Três, encadeados. O **retalho não existia**: quando uma chapa era
parcialmente usada, o sistema só sabia "1 chapa saiu" — o pedaço aproveitável não tinha saldo, não
tinha etiqueta e não aparecia quando alguém procurava material, então se comprava chapa nova com
meia chapa na prateleira. **Sucatear era uma baixa solta**: `Sucata` era um tipo do formulário de
Movimentações — qualquer pessoa com permissão de movimentar apagava material do patrimônio com uma
justificativa, sem segunda opinião, sem classificação, sem registro de venda ou descarte e sem
número financeiro. E havia **uma lista morta de sobras** no banco: registrar ali não criava saldo,
não movimentava nada e não aparecia em lugar nenhum — a mesma doença da lista de materiais de
clientes que a Etapa 8 aposentou.

**O que há de novo (visível para o usuário):**
- Tela nova **Almoxarifado → Sobras e Retalhos**, com duas abas: **Retalhos** e **Sucateamentos**.
- **Gerar retalho**, com **dois modos**: a peça está saindo do estoque **agora** (o original é
  baixado e o retalho entra, no mesmo evento) ou a peça **já tinha saído** antes (só o retalho
  entra — é a sobra que volta do chão de fábrica). A ficha dimensional (dimensões restantes,
  norma, espessura, peso, localização) fica junto.
- Atalho **Criar material do retalho** dentro do modal: cadastra o material na hora, com código
  gerado pela família da origem e **dono e categoria herdados** — retalho de chapa de cliente
  continua do cliente.
- **Etiqueta do retalho** em PDF (A4 ou térmica), com as dimensões e o peso no papel e um **QR que
  abre a tela com a linha destacada** — oferecida automaticamente logo depois de gerar. Era a
  pendência declarada da Etapa 6c.
- Aviso na **Saída** de Movimentações quando o material tem retalho parado: *"Existem N retalho(s)
  deste material — considere usá-los antes de baixar do estoque principal."* — **aviso, não
  trava**: quem decide é o almoxarife.
- **Solicitar sucateamento** (a partir de qualquer material, ou pelo botão **Sucatear** na linha do
  retalho): quantidade, lote quando o material exige, classificação (texto livre com sugestões),
  peso, justificativa obrigatória. **Solicitar não move saldo nenhum.**
- **Duas aprovações, de pessoas diferentes**: uma perna do **almoxarifado**, uma da **gestão**. A
  baixa sai do estoque **na segunda assinatura** — e o aviso na tela diz qual das duas foi a sua.
- **Rejeitar** (com motivo obrigatório), **Cancelar** (só o próprio solicitante), e **Registrar
  destino** depois de aprovado: **Vendida** (valor obrigatório + comprovante PDF/imagem) ou
  **Descartada**.

**Por baixo do capô:**
- O retalho é **material normal no motor de estoque** — não uma lista à parte. Ele entra por um
  tipo de movimento próprio (`ENTRADA_RETALHO`), que **não aceita custo**: o projeto já pagou a
  chapa inteira na saída, e o retalho a custo zero **não infla o patrimônio** (mesma regra da sobra
  da 8c). A ficha dimensional vive na tabela de sobras **reformada** — que deixou de ser ilha: só
  nasce junto com a movimentação, auditada, com autor.
- A criação avulsa de sobra (sem passar pelo estoque) foi **aposentada** — era o caminho que
  recriaria a lista morta.
- O sucateamento tem **máquina de estados** e **três barreiras de segregação**: o perfil da perna,
  o solicitante não assina, e **a mesma pessoa não assina as duas** — esta última garantida também
  contra cliques simultâneos (provado por teste de corrida determinístico na suíte: o mesmo usuário
  dispara as duas pernas ao mesmo tempo e nenhuma fecha; a sonda de 500 execuções usada durante a
  correção confirmou zero furos, mas não foi versionada — o que vive no repo é o determinístico).
- Se o saldo mudar entre a solicitação e a segunda assinatura, o motor recusa a baixa e o sistema
  **desfaz a assinatura recém-dada** — nunca fica "aprovado no papel" sem baixa no livro. A
  compensação fica registrada na auditoria, com o motivo.
- O **relatório financeiro de sucata** lê o **livro de movimentações**, não só a fila de
  sucateamentos — assim ele soma também a sucata que nasce de **devolução com destino Sucata**
  (Etapa 7), que não passa pelas duas assinaturas porque o material já tinha saído fisicamente.
  Duas somas separadas de propósito: o **estimado** (quantidade × custo atual) e o **realmente
  vendido** (declarado, com comprovante).

### As regras, com o cenário exato

Todas as mensagens abaixo são as **mensagens reais do sistema**, copiadas do código.

**1. Gerar retalho com baixa move as duas pontas no mesmo evento.**
*Cenário:* chapa com 30, gerar retalho marcando **"Baixar o material de origem agora"**, baixa 1,
retalho 1 →
> `Retalho gerado — o material de origem foi baixado`

A chapa cai, o retalho sobe, e o extrato dos dois mostra a saída e a **Entrada (retalho)**. Se
qualquer perna falhar no meio, o que já andou é **desfeito** — nunca fica saída sem retalho.

**2. O modo sem baixa é para a sobra que volta do chão de fábrica.**
*Cenário:* checkbox desmarcado (a peça já saiu por requisição há dias) →
> `Retalho gerado — nada foi baixado (a peça já tinha saído do estoque)`

**3. O sistema NÃO cria o material do retalho sozinho — e a recusa ensina o caminho.**
> `O material do retalho 999 nao existe. Cadastre o material do retalho primeiro (Almoxarifado > Materiais > Novo, ou o atalho "Criar material do retalho" na tela de Sobras e Retalhos) e refaca a geracao — o sistema nao cria material sozinho a partir de um formulario de retalho.`

Mesma razão da 8c: cadastro-lixo em almoxarifado não se apaga — ele ganha saldo. Em troca, o
atalho cadastra na hora, herdando família, dono e categoria da origem.

**4. Meia chapa não é chapa.**
*Cenário:* escolher como "material do retalho" o próprio material de origem:
> `O retalho CHP-3MM e o mesmo material da origem. Meia chapa nao e chapa: cadastre (ou escolha) um material proprio para o retalho.`

**5. Retalho de material de cliente permanece do cliente.** O material-retalho tem de ter o
**mesmo dono** do original — a recusa nomeia os dois donos, como na transformação da 8c. Sem essa
guarda, um corte converteria chapa do cliente em patrimônio da GMP em silêncio.

**6. Material com número de série não passa — e a recusa ensina o caminho.**
> `O material CHP-01 tem controle de serie e a geracao de retalho nao tem campo para dizer QUAL numero de serie esta sendo cortado. Baixe a peca pela tela de Movimentacoes (que tem seletor de serie) e depois registre o retalho aqui no modo "peca ja baixada do estoque".`

(O sucateamento recusa material serializado pelo mesmo motivo, apontando a mesma saída.)

**7. Sucatear pelo formulário de Movimentações NÃO EXISTE MAIS.**
*Cenário:* abrir Movimentações → Nova movimentação → o tipo **Sucata não está na lista**. Quem
forçar `{tipo: 'SUCATA'}` por fora recebe a recusa da rota. *Por quê:* enquanto essa porta
estivesse aberta, a dupla aprovação seria decorativa — o requisito "sucatear sem aprovação falha"
era **impossível de cumprir** por construção. Mesmo precedente da Devolução na Etapa 7.
**`Perda` continua no formulário** — a exigência de dupla aprovação é só para sucateamento.

**8. Solicitar não move saldo — e a justificativa é obrigatória desde já.**
O modal avisa: *"A solicitação não move saldo nenhum — a baixa só sai do estoque quando as DUAS
assinaturas (almoxarifado e gestão) fecharem o processo."* Ao confirmar:
> `Sucateamento solicitado — aguardando as duas assinaturas (almoxarifado e gestão)`

**9. Quem solicitou não aprova.**
> `Quem solicitou o sucateamento nao aprova a propria solicitacao — em nenhuma das duas pernas. Peca a assinatura de outra pessoa do almoxarifado e da gestao.`

(A tela nem mostra os botões para o solicitante — e o servidor barra de qualquer jeito.)

**10. A mesma pessoa não assina as duas pernas — nem o Administrador.**
> `Voce ja assinou a perna almoxarifado deste sucateamento e nao pode assinar tambem a perna gestao: dupla aprovacao com a mesma pessoa nas duas pernas e uma assinatura com dois carimbos. A segunda assinatura tem de ser de outra pessoa.`

**11. A baixa sai na segunda assinatura — e o aviso diz qual foi a sua.**
Primeira: `Perna assinada — falta a assinatura da outra perna para a baixa sair`. Segunda:
`Sucateamento aprovado nas duas pernas — a baixa foi emitida no estoque` — e é agora que o total e
o disponível caem, com a linha `SUCATA` no livro (referência `SUC-<número>`).

**12. Se o saldo mudou no meio, a aprovação volta atrás sozinha.**
*Cenário:* solicitar 10, alguém consome o saldo por saída antes da segunda assinatura. A segunda
assinatura falha com o erro do motor (com os números) e o processo **volta a SOLICITADO**, com a
assinatura recém-dada desfeita e a compensação auditada.

**13. Vender exige valor.**
> `Informe o valor da venda da sucata (valor_venda maior que zero) — o destino VENDIDA alimenta o relatorio financeiro de sucata, e venda sem valor nao e venda.`

**14. Cancelar é só do solicitante — recusar solicitação alheia é Rejeitar, com motivo.**
> `So o solicitante (Fulano) cancela o proprio sucateamento. Para recusar a solicitacao de outra pessoa use Rejeitar, que exige motivo e fica no historico.`

**Antes → Agora:**

| Antes | Agora |
|---|---|
| A meia chapa não existia para o sistema — comprava-se chapa nova com meia chapa na prateleira | Retalho com **saldo real**, ficha dimensional, etiqueta com QR e localização |
| Registro de sobra era uma lista morta: sem saldo, sem movimentação, sem tela | A sobra só nasce **junto com a movimentação**, auditada — a criação avulsa foi aposentada |
| **Sucatear era um clique de uma pessoa** no formulário de Movimentações | **O tipo sumiu do formulário.** Sucatear é solicitação + **duas assinaturas de pessoas diferentes** + baixa na segunda |
| Nada registrava o destino da sucata | **Vendida** (valor + comprovante) ou **Descartada**, com relatório financeiro |
| Nada sugeria usar o retalho antes de cortar chapa nova | Aviso não bloqueante na Saída, com link para a tela de retalhos |
| Etiqueta de retalho era pendência declarada da 6c | Entregue — dimensões/peso no papel, QR abrindo a linha certa |

**O que esta etapa NÃO cobre (é decisão declarada, não esquecimento):**
- **Não calcula dimensões** — o operador digita quanto sobrou (item **D**).
- **Não manda e-mail** de sucateamento (feature 19, item **D**).
- **Não emite fatura/título** na venda de sucata — registro com valor e comprovante (item **D**).
- **Não tem tela de relatório** — o financeiro de sucata é API (item **D**).
- **Não tem foto do retalho nem reserva de retalho** (item **D**).

---

## Etapa 9b — Ferramentas e Calibração (2026-08-22)

**Em uma frase:** ferramenta (furadeira, paquímetro, torquímetro...) virou patrimônio controlado
de verdade — empréstimo à prova de dois cliques simultâneos, calibração vencida bloqueando o uso,
avaria/perda com foto fechando o empréstimo sozinha, bloqueio e manutenção com histórico — numa
tela própria.

**O problema que existia.** O empréstimo de ferramenta funcionava, mas sem trava real: duas
pessoas podiam emprestar a mesma ferramenta ao mesmo tempo (a checagem era feita **antes** de
gravar, não **durante**), emprestar e devolver não deixavam rastro de auditoria, e a permissão
usada para mexer em ferramenta era a **mesma** de mexer em estoque de material. Calibração,
manutenção, avaria, perda e bloqueio não existiam — nem como campo no banco.

**Antes → Agora:**

| Antes | Agora |
|---|---|
| Emprestar ferramenta já emprestada podia acontecer em cliques simultâneos | **Impossível mesmo em corrida** — a gravação só aceita se o status ainda for o esperado no instante exato |
| Ferramenta que exige calibração emprestava vencida ou sem calibração nenhuma | **Bloqueada** até ter calibração vigente registrada, com mensagem explicando o motivo |
| Avaria/perda durante o empréstimo não tinha registro | Ocorrência com **foto e responsável**, que **fecha o empréstimo em aberto sozinha** |
| Ferramenta com defeito não tinha bloqueio nem manutenção | **Bloquear** (com justificativa) e **Manutenção** (início/fim) com histórico completo |
| Ferramenta perdida encontrada de volta não tinha caminho | **Reencontrar**, com justificativa — volta a disponível |
| Emprestar e devolver não deixavam rastro | Toda ação de escrita **audita**, com o usuário responsável |
| Mesma permissão do estoque de material | Permissão **própria** (Ferramentas) — dá para autorizar uma sem a outra |
| Sem tela | **Almoxarifado → Ferramentas**, três abas: Ferramentas, Empréstimos, Calibrações |

### As regras, com o cenário exato

As mensagens abaixo são as **mensagens reais do sistema**, conferidas no código.

**1. Ferramenta ocupada, bloqueada, em manutenção, avariada ou perdida não empresta — mesmo em
corrida.** *Cenário:* clicar **Emprestar** numa ferramenta que já não está disponível:
> `Ferramenta não está disponível (status atual: EMPRESTADA)`

Vale até em dois cliques simultâneos na mesma ferramenta — exatamente um vence, o outro recebe
essa recusa.

**2. Calibração vencida (ou nunca registrada) bloqueia o empréstimo.**
> `Ferramenta com calibração vencida ou sem calibração registrada`

Registrar uma calibração nova com validade futura destrava na hora.

**3. Devolver libera para um novo empréstimo.** Ao confirmar: `Ferramenta devolvida` — a
ferramenta volta a Disponível. Tentar devolver um empréstimo que já foi fechado (ou que não
existe):
> `Empréstimo não encontrado`

**4. Avaria ou perda durante o empréstimo fecha o empréstimo automaticamente.** *Cenário:* com a
ferramenta emprestada, registrar Ocorrência tipo Perda (ou Avaria). O empréstimo em aberto fecha
sozinho e a ferramenta muda para o status da ocorrência — não é preciso devolver antes.

**5. Bloquear e desbloquear exigem justificativa de pelo menos 5 caracteres.**
> `Justificativa deve ter pelo menos 5 caracteres`

Só ferramenta disponível bloqueia:
> `Ferramenta não pode ser bloqueada (status atual: <status>)`

**6. Ferramenta emprestada não entra em manutenção — devolva primeiro.**
> `Ferramenta não pode entrar em manutenção (status atual: EMPRESTADA)`

Ferramenta avariada entra em manutenção normalmente (é o caminho de conserto); ao concluir, volta
a disponível.

**7. Reencontrar só vale para ferramenta perdida.**
> `Ferramenta não está perdida (status atual: <status>)`

**8. Código de patrimônio duplicado não cadastra.**
> `Código de patrimônio já cadastrado`

**9. Quem pode o quê.** Toda escrita (cadastrar, emprestar, devolver, bloquear, manutenção,
ocorrência, calibração, reencontrar) exige a permissão **Ferramentas** (Administrador ou
Almoxarife). Ver e consultar histórico é livre para qualquer usuário logado.

**O que esta etapa NÃO cobre (é decisão declarada, não esquecimento):**
- **Lembrete de devolução vencida sem canal de notificação** — a tela já destaca vencidos; e-mail
  e alerta automático dependem das features 19/20 (item **B7**).
- **Editar ferramenta pela tela** — o cadastro existe; a edição ainda não tem formulário próprio
  (backend já testado) (item **B8**).
- **Ferramenta como instrumento de medição na inspeção** não está integrada — depende do plano de
  inspeção com medidas, que a feature 09 ainda não tem (item **D**).
- **Uma foto por ocorrência**, não galeria — mais de uma foto vira ocorrências adicionais
  (item **D**).
- **Requisição de ferramenta pelo fluxo de requisições** não existe (item **D**).

---

## Etapa 10 — Inventário Avançado (2026-08-22)

**Em uma frase:** a conferência de inventário deixou de gravar o saldo por fora do sistema —
agora o ajuste é uma movimentação de verdade, auditada, e recusada quando deixaria material
bloqueado/reservado/em inspeção/em terceiro com número que não fecha. De brinde: contagem cega
(quem conta não vê quanto o sistema diz que tem) e recontagem obrigatória para divergência grande.

**O problema que existia.** Desde a Etapa 0 a conclusão de uma conferência com "aplicar ajustes"
escrevia o saldo do material **direto no banco**, por um caminho que não passava pelas mesmas
verificações de qualquer outra movimentação do módulo: nenhuma checagem de que o material
bloqueado/reservado/em inspeção/em terceiro não ficaria com número negativo, e nenhum registro de
auditoria de verdade. Era o único lugar do sistema inteiro com esse problema — e já tinha
aparecido, sob outra roupagem, em três etapas anteriores, sempre sem resposta.

### Antes → Agora

| Situação | Antes | Agora (Etapa 10) |
|---|---|---|
| Ajuste que reduz o total abaixo do que está bloqueado/reservado/em inspeção/em terceiro | Aceito em silêncio — o disponível ficava negativo sem ninguém saber | **Recusado**, com a mensagem dizendo exatamente qual retenção pesa e o mínimo aceitável |
| Registro do ajuste no livro | Não existia (gravação direta na tabela do material) | Movimentação de verdade, auditada, com o número da conferência e quem homologou |
| Ver quanto o sistema diz que tem, contando | Sempre visível | Opcional por conferência ("Contagem cega") — some para quem só conta, aparece para quem homologa |
| Divergência muito grande | Aceita sem segunda chance | Exige **recontar** antes de poder concluir (limite configurável, 2% por padrão) |
| Justificativa do ajuste final | Não existia campo | Obrigatória (mínimo 5 caracteres) sempre que "aplicar ajustes" está marcado |
| Impacto financeiro do ajuste | Não calculado | Aparece no aviso de sucesso, somando o valor de cada item ajustado |
| Concluir a mesma conferência duas vezes | Reaplicava o ajuste (duplicava o lançamento) | Recusado — uma conferência só conclui uma vez |

### As regras, com o cenário exato

As mensagens abaixo são as **mensagens reais do sistema**, conferidas no código.

**1. Ajuste que deixaria retenção maior que o total é recusado.**
*Cenário:* material com 8 unidades bloqueadas, contagem aponta só 5. Ao concluir com "aplicar
ajustes":
> `Ajuste bloqueado: <código>: Ajuste para 5 UN deixaria o disponível negativo (bloqueada: 8, mínimo aceitável: 8 UN). Resolva a retenção antes de ajustar para menos, ou ajuste para um valor maior ou igual ao mínimo.`

Resolver a retenção (desbloquear, liberar a reserva, encerrar a remessa a terceiro) antes de
concluir é o caminho — a mensagem já diz qual.

**2. Se a conferência tem mais de um material com problema, a resposta prioriza permissão sobre
retenção.** Se algum material for de um cliente e quem está concluindo não tem autorização para
ajustar saldo de cliente, a recusa é sobre isso primeiro:
> `Ajuste bloqueado — os seguintes materiais são de cliente e exigem a permissão "ajustar_material_cliente": <código> (<cliente>)`

**3. Divergência acima da tolerância exige recontar antes de concluir — com ou sem aplicar
ajustes.**
*Cenário:* contagem 10% divergente, tolerância configurada em 2%. Ao tentar concluir:
> `Recontagem necessária antes de concluir: <código> - 10.00% (limite 2%)`

Contar o mesmo item **de novo** (mesmo que dê o mesmo valor) já libera a conclusão — a segunda
contagem é a segunda chance, não precisa bater com a primeira.

**4. Aplicar ajustes exige justificativa.**
*Cenário:* marcar "Aplicar ajustes automáticos" sem preencher o motivo:
> `Justificativa deve ter pelo menos 5 caracteres`

**5. Uma conferência só conclui uma vez.**
*Cenário:* tentar concluir de novo uma conferência já concluída (ou já cancelada):
> `Conferência não está aberta (status atual: CONCLUIDO)`

**6. Contagem cega esconde o saldo do sistema, mas não do homologador.** Quem só tem permissão
para contar (perfil Almoxarife sem a permissão de ajustar estoque) não vê a coluna "Qtd. Sistema"
nem a divergência enquanto a conferência está aberta — só o aviso "Recontagem necessária" quando
se aplica. Quem homologa (Gestor/Administrador) vê tudo. Depois de concluída, todo mundo vê o
histórico completo.

### O que esta etapa NÃO cobre (é decisão declarada, não esquecimento)

- **Contagem por endereço, família, criticidade/ABC automática, item crítico, surpresa** — só
  "por categoria" continua existindo. Fica para uma etapa própria.
- **Dupla contagem por duas pessoas diferentes** — a recontagem desta etapa aceita a mesma pessoa
  contar de novo; não rastreia se foi outra pessoa.
- **Congelar movimentações do material durante a contagem** — não implementado (mesmo raciocínio
  da Etapa 7: um único site, baixo valor prático, alto custo de implementação).
- **Relatório formal de acuracidade e e-mail do resultado** — ficam para as features de
  relatórios e notificações.
- **Guarda de retenção para contagem por localização/endereço** — a guarda desta etapa vale para
  o ajuste do material inteiro; contagem por endereço específico não tem essa checagem ainda.

## Etapa 10b — Inventário Avançado, parte 2 (2026-08-23)

A Etapa 10 consertou o motor do inventário; esta etapa entrega o que faz o inventário virar
**rotina de gestão**. Antes, contar era tudo-ou-nada: uma conferência pegava o estoque inteiro
(ou uma categoria), e "recontar" podia ser a mesma pessoa olhando de novo para o mesmo papel.
Agora dá para contar **só a classe A**, **só os críticos**, **só o material de cliente** ou **só
o que tem parte em terceiro**; dá para exigir que a recontagem seja de **outra pessoa** (e o
sistema esconde o número do primeiro contador para a segunda contagem ser de verdade); e o
resultado de cada inventário vira **número de gestão** — acuracidade por conferência, com o
impacto em reais gravado no dia em que foi medido.

### Antes → Agora

| Antes (Etapa 10) | Agora (Etapa 10b) |
|---|---|
| Conferência de tudo, ou por categoria | Escopo combinável: categoria, família, classe ABC, somente críticos, materiais de clientes, com saldo em terceiros — e o escopo fica **gravado** na conferência |
| Recontagem podia ser a mesma pessoa | Com "Dupla contagem" marcado, a recontagem tem de ser de **outra pessoa** — e ela conta **sem ver** o número do colega |
| Ninguém sabia quem contou | Cada item guarda **quem contou** e **quem recontou**, visível na tela |
| Qualquer valor entrava como contagem | Contagem tem de ser número ≥ 0 (zero vale — prateleira vazia é contagem legítima) |
| Impacto financeiro aparecia uma vez e sumia | Impacto gravado na conclusão; concluir **sem** aplicar ajustes também mostra quanto de erro foi encontrado |
| Nenhuma visão consolidada | Botão **Acuracidade**: por conferência, contados/total, exatos, divergentes, recontados, % de acuracidade e impacto em R$ + agregado ponderado |
| Deriva de decimal virava "divergência" | Contar 0.2 contra um esperado de 0.1999999... é **exato** (100%), não 0% |

### As regras, com o cenário exato

1. **Escopo combinável.** Em Conferência de Estoque → Nova Conferência, marque **Classe ABC =
   A** e **Somente críticos**: só os materiais que são as duas coisas entram, e a conferência
   grava o escopo — a lista mostra `Classe A + Somente críticos`. Sem nenhum filtro, o escopo é
   `Geral`. O seletor de família só oferece **famílias raiz** (o cadastro de material vincula a
   raiz). Filtro que não casa nada cria a conferência **vazia**, avisando "criada com 0 itens".
   Pela API, classe fora de A/B/C recusa com: `Classe ABC inválida (use A, B ou C)`.
2. **Dupla contagem esconde o número do colega — com ou sem contagem cega.** Crie com **Dupla
   contagem** marcado. Ana conta 90. Quando Bruno abre a mesma conferência, o campo do item vem
   **vazio** — ele não vê os 90 de Ana (nem precisa do modo cego para isso; o modo cego continua
   escondendo o **saldo do sistema**, que é outra coisa). Quem tem permissão de homologar
   (Gestor/Administrador) vê tudo.
3. **Tabular não é contar.** Sair de um campo sem digitar **não salva nada** — só valor digitado
   na sessão vira contagem. (É o que impede alguém de "recontar" três itens com a tecla Tab.)
4. **O primeiro contador corrige o próprio número — até alguém recontar.** Ana contou 90 mas era
   91? Ela corrige, e a correção **não** conta como recontagem. Depois que Bruno recontou, Ana
   não toca mais no item: `Dupla contagem: a recontagem deve ser feita por outra pessoa
   (primeira contagem: Ana)`.
5. **Contagem tem de ser um número.** Digitar texto ou negativo recusa na hora:
   `Quantidade contada deve ser um número maior ou igual a zero`. Zero é aceito — contar uma
   prateleira vazia é contagem de verdade (e um valor recusado **sai da tela**, voltando ao que
   estava salvo).
6. **Concluir sem aplicar também mede o erro.** Conclua sem marcar "Aplicar ajustes": o aviso
   diz `Conferência concluída! 0 ajustes aplicados — divergências encontradas: R$ 100,00
   (nenhum ajuste aplicado)` — o tamanho do erro encontrado fica gravado mesmo quando ninguém
   mexe no saldo.
7. **Acuracidade.** O botão **Acuracidade** (na lista de conferências) mostra, por conferência
   concluída: contados **sobre o total** (100% de acuracidade contando 1 de 10 itens aparece
   como `1 / 10` — o denominador não se esconde), exatos, divergentes, **recontados** (o selo de
   dupla contagem só vale o que esse número disser), acuracidade % e impacto em R$. Conferências
   de antes desta etapa mostram `—` no impacto (não medido na época — recalcular hoje com o
   custo de hoje inventaria um número que nunca existiu). Sem nenhum item contado, a acuracidade
   é `—`, não 0% nem 100%. O agregado é **ponderado por item contado**, não média simples.
8. **Deriva de decimal não é divergência.** Material com 30.3 no total e 30.1 em terceiro tem
   esperado 0.2 — mas o computador guarda 0.1999999999999993. Contar 0.2 dá **exato** (100% de
   acuracidade, impacto R$ 0,00), em todos os lugares que leem divergência: acuracidade,
   relatório de divergências e o próprio ajuste (que não dispara movimentação de 0,0000000000000007).
9. **Quem contou fica registrado.** Cada item mostra `Contado por: Ana · Recontado por: Bruno`.
   Itens contados antes desta etapa não têm autoria — a linha simplesmente não aparece (sem
   "Contado por: —" à toa).
10. **O relatório antigo de divergências entrou na linha.** Ele só mostra conferências
    **concluídas** (contagem em andamento não vaza mais por ele), exige a mesma permissão de
    inventário e usa a mesma régua de divergência do resto.

### O que esta etapa NÃO cobre (é decisão declarada, não esquecimento)

- **Contagem por endereço/prateleira** — a conferência é por material (decisão da Etapa 8b
  sobre o esperado depende disso), e ajuste por localização é exatamente o corte declarado da
  guarda de retenção. Fica para quando contagem por endereço for pedida de verdade.
- **Contagem cíclica automática** (gerar conferência sozinho por frequência ABC) — não há
  infraestrutura de agendamento no módulo; o filtro por classe entrega a prática manual (contar
  a classe A todo mês é criar a conferência "Classe A" todo mês).
- **Contagem "surpresa" não é software** — surpresa é não avisar o galpão; qualquer conferência
  criada na hora já é isso.
- **Contagem "por divergência"** — a recontagem obrigatória da Etapa 10 já é a recontagem
  seletiva dos itens divergentes; um escopo "só os que divergiram da última vez" seria uma
  segunda resposta para a mesma pergunta.
- **Escopo por subfamília** — o cadastro de material vincula a **família raiz**; o seletor só
  oferece raízes de propósito (oferecer subfamília criava conferência vazia em silêncio).
- **Filtro por cliente específico** — "materiais de clientes" cobre o tipo pedido; auditoria de
  um cliente específico já tem a tela de posição por cliente.
- **Congelar movimentações durante a contagem** — ruling anterior mantido (site único, baixo
  valor, alto custo). Consequência prática registrada na letra C.
- **Fluxo formal de dupla aprovação (duas assinaturas)** — a pergunta B11 continua aberta;
  construir antes da resposta seria construir sobre decisão pendente.
- **E-mail do resultado** — feature 19, mesmo corte de todas as etapas.

## Etapa 11 — Reposição e Compras (2026-08-24)

O módulo sabia **avisar** que um material cruzou o mínimo; agora ele sabe **responder às
perguntas de compra**: quanto pedir, quando pedir (antes de faltar, considerando o prazo do
fornecedor), de quem pedir (consolidado por fornecedor, com o valor), e o que está **parado**
ocupando prateleira e dinheiro. É a tela nova **Almoxarifado → Reposição e Compras** — a
primeira do módulo pensada para quem decide compra (Gestor, Compras, Administrador), não para
o balcão.

### Antes → Agora

| Antes | Agora |
|---|---|
| Alerta de mínimo avisava, e só | Sugestão de compra calculada: quanto pedir, para chegar a quanto, valendo quanto |
| "Quando pedir" era olhômetro | Ponto de reposição: cadastrado, ou **consumo médio × prazo do fornecedor**, com a **mínima como chão** de qualquer régua |
| Pedido aberto era invisível para a conta | O que já foi solicitado entra na posição — material pedido some da sugestão (e volta se a solicitação envelhecer sem chegar) |
| Sugestão nenhuma virava pedido | Botão **Gerar solicitações** (com confirmação dizendo quantas e por quanto) cria as solicitações auditadas, com a quantidade calculada pelo servidor |
| Excesso/obsoleto não existiam | Aba **Estoque Parado**: excesso (acima da máxima), sem consumo, obsoleto — com o valor parado em reais |
| Solicitações de compra sem tela | Aba **Solicitações** com pendentes e vinculadas a pedido |
| Configurações da reposição não existiam | Três configuráveis pela tela: janela do consumo (90d), régua de parado (180d), horizonte da solicitação (60d) — e o sistema **recusa** valor inválido |

### As regras, com o cenário exato

1. **A sugestão nasce das três réguas — e a mínima é o chão de todas.** Material com mínima
   100, máxima 200 e 5 na prateleira aparece na aba Sugestões com **195 sugeridas** (completa
   até a máxima), origem do ponto = "Mínimo". Se o material tem **prazo de reposição** e
   consumo no histórico, o ponto vira "Calculado" (consumo/dia × prazo — a linha da célula
   mostra a conta); um **ponto cadastrado** no material vence os dois — mas **nenhuma régua
   fica abaixo da mínima**: se o alerta de mínimo grita, a sugestão existe, sempre.
2. **O que já foi pedido não é pedido de novo.** Gere a solicitação de um material e recarregue:
   ele **some** da sugestão (a solicitação aberta conta na posição). Se a pendência for
   **menor** que o necessário, o material continua na lista sugerindo só o **complemento**.
   Solicitação com mais de 60 dias (configurável) deixa de segurar a posição — e a linha
   ganha o aviso de **solicitação antiga aberta** em vez de fingir que ela não existe.
3. **Quem decide a quantidade é o servidor.** O botão Gerar pergunta antes:
   `Gerar N solicitação(ões) de compra no valor estimado de R$ X?` — e o painel de resultado
   lista **cada solicitação criada com a quantidade real** gravada (recalculada na hora do
   clique, não a da tela).
4. **Crítico zerado é risco de parada — e pedir não resolve.** Material crítico com disponível
   zero ganha o badge vermelho **Risco de parada**, e o contador do resumo **continua contando
   ele mesmo depois de gerar a solicitação** — papel não segura produção; o risco só sai
   quando material chega.
5. **Estoque parado com as três lentes.** Aba Estoque Parado: **Excesso** (acima da máxima
   cadastrada), **Sem consumo** (nenhuma saída há 180 dias — configurável) e **Obsoleto**
   (sem consumo E sem entrada no período) — um material pode carregar mais de um selo, e a
   linha mostra o **valor parado** em reais. Os cartões do topo são o retrato do estoque
   **inteiro** (a legenda diz isso) — o filtro muda a lista, não os cartões.
6. **Quem não decide compra não vê pipeline de compra.** Almoxarife e chão de fábrica tomam
   `403` nas três rotas — e a tela mostra um **painel de sem permissão com o motivo e botão
   de tentar de novo**, nunca uma lista vazia fingindo que "não há nada a comprar". A aba
   Solicitações (e o relatório por trás dela) exige a mesma permissão.
7. **Configuração inválida é recusada na hora, dos dois lados.** Digitar `0` na janela do
   consumo: a tela recusa antes de salvar; por API, a resposta é
   `Configuração "reposicao_janela_consumo_dias" deve ser um número de dias maior que zero`.

### O que esta etapa NÃO cobre (é decisão declarada, não esquecimento)

- **Criar pedido de compra real no módulo Compras** — a solicitação é o elo; o vínculo a
  pedido continua pela rota que já existia. Integração de itens por material com o Compras é
  a feature 22/24.
- **Fechar solicitação no recebimento** — nada no sistema fecha uma solicitação (só vincular
  existe); o **horizonte de 60 dias** é a aproximação honesta até o Compras ganhar o elo
  (letra E).
- **Cancelar solicitação de compra** — não existe caminho no sistema (item **B** — a
  confirmação antes de gerar mitiga o clique errado).
- **"Projetos futuros" no cálculo** — exigiria BOM/OP (features 22/23), que não existem.
- **Alerta de máximo na entrada** — o excesso é **identificado** no Estoque Parado; alerta
  ativo com canal seria máquina de estados nova sem pedido concreto.
- **E-mail de sugestão/solicitação** — feature 19, mesmo corte de todas as etapas. (O e-mail
  que já existia — requisição sem estoque avisando Compras — continua igual, é outro fluxo.)

## Etapa 12 — Notificações Completas (2026-08-24)

O módulo fazia muita coisa em silêncio: movimentava, emprestava ferramenta, deixava lote
vencer, via material zerar — e ninguém ficava sabendo a menos que abrisse a tela certa na hora
certa. Agora existe uma **central de avisos por e-mail**: tudo que merece aviso entra numa
**fila** (nada trava esperando e-mail sair), um robô tenta enviar, reenvia sozinho quando o
servidor de e-mail falha, e desiste avisando o administrador depois de esgotar as tentativas.
E há uma tela nova — **Almoxarifado → Notificações** — onde Gestor e Administrador veem o que
saiu, o que falhou e por quê, e reenviam com um clique.

### Antes → Agora

| Antes | Agora |
|---|---|
| E-mail só de estoque mínimo e requisição | Fila única de avisos: movimentações (opcional), ferramenta vencida, solicitação de compra gerada, devolução que ficou parcial, estoque zerado, lote vencendo, remessa a terceiro vencida |
| E-mail que falhava sumia sem rastro | Fila com **retentativas automáticas** (espaçamento dobra a cada falha), e **aviso ao administrador** quando esgota |
| Nenhum histórico do que foi mandado | A fila **é** o histórico: o que saiu, para quem, quando, com o corpo gravado |
| Falha de e-mail invisível | Tela **Notificações**: cards de pendentes/enviadas/falhas, filtros, motivo literal da falha e botão **Reenviar** |
| Lembrete de ferramenta vencida sem canal (pendência da Etapa 9b) | Job diário enfileira **um lembrete por dia** por empréstimo vencido |
| Solicitações de compra geradas em silêncio (pendência da Etapa 11) | **Um** e-mail-resumo por lote gerado, com materiais e quantidades |
| Devolução que ficava parcial só aparecia na auditoria (pendência da Etapa 7) | Aviso por e-mail na hora, sem esconder o erro original do operador |
| Zerou o estoque e ninguém viu | Alerta de **estoque zerado** para material **sem** mínimo cadastrado (quem tem mínimo já tem o alerta de mínimo) |
| Lote vencia na prateleira | Alerta diário de **lote vencendo** (janela configurável, 30 dias) — **incluindo lote já vencido com saldo** |
| Remessa a terceiro atrasada só na tela | Alerta diário de **remessa vencida** pela mesma régua da tela |

### As regras, com o cenário exato

1. **O e-mail de movimentação nasce DESLIGADO — ligar é decisão sua.** Em Configurações,
   `Notificar movimentações por e-mail` vem `0`. Com ele ligado e um destino preenchido, toda
   entrada/saída/ajuste manual confirmado entra na fila com o conteúdo mínimo: tipo, número,
   data/hora, usuário, material, quantidade, **saldo anterior e posterior**, lote/séries quando
   houver, projeto/OS/cliente, motivo, justificativa e link direto para o livro. Digitar
   qualquer coisa fora de 0/1 na config: a API recusa com
   `Configuração "notificar_movimentacoes" deve ser 0 ou 1`.
2. **Cada família de evento tem seu destino.** Quatro listas de e-mail por classe (entradas,
   saídas, ajustes, terceiros) + uma para solicitações de compra. Lista vazia cai na lista
   geral de alertas de estoque — **e aí o checkbox "Notificar por e-mail" manda**: se você o
   desligou, o aviso que cairia na lista geral **não sai** (quem silenciou não volta a receber
   pelo canal novo). Lista da classe preenchida ignora o checkbox — você escolheu o destino.
3. **Movimentação recusada não gera aviso; movimentação cancelada mata o aviso.** Saída maior
   que o disponível: erro na tela, **nada** na fila. Estornar uma saída cujo e-mail ainda não
   saiu: a linha vira FALHA com o motivo literal `Movimentação cancelada antes do envio` — e
   tentar reenviá-la responde `Movimentação cancelada — notificação não pode ser reenviada`.
4. **A fila tenta de novo sozinha, e desiste avisando.** Sem servidor de e-mail configurado, a
   linha fica PENDENTE com o motivo `SMTP não configurado`, tentativa 1, próxima tentativa em
   10 minutos (depois 20, 40...). Na 5ª falha (configurável) vira **FALHA** e o administrador
   recebe **um** aviso — um só, mesmo que a linha falhe de novo depois.
5. **O mesmo evento nunca vira dois e-mails.** Rodar a varredura diária duas vezes, clicar
   duas vezes em Processar, dois usuários processando juntos: **um** envio. O lembrete de
   ferramenta é **um por dia** por empréstimo; o de lote, **um por validade** (mudou a
   validade, avisa de novo — no mesmo dia seguinte, não).
6. **Estoque zerado avisa uma vez por episódio, e só quem precisa.** Material **sem mínimo**
   que zera numa movimentação: um e-mail. Continua zerado: silêncio. Repôs e zerou de novo:
   outro e-mail. Material **com** mínimo cadastrado fica no canal do alerta de mínimo (senão
   seriam dois e-mails do mesmo fato); material inativo e material de cliente nunca alertam;
   material que já estava zerado antes desta versão não dispara aviso retroativo no deploy.
7. **A tela Notificações é de Gestor/Administrador.** Almoxarife, Compras e chão de fábrica
   tomam `403` (Compras **recebe** e-mail, não opera a fila) — e a tela mostra o painel de
   sem-permissão com botão de tentar de novo, nunca lista vazia. Filtro de status inválido por
   API: `Status inválido (use PENDENTE, ENVIADO ou FALHA)`.
8. **Reenviar é sempre possível — com proteção.** Linha FALHA ou PENDENTE: reenvia e processa
   na hora. Linha já ENVIADA: o botão pergunta antes —
   `Esta notificação já foi enviada. Reenviar mesmo assim envia o e-mail de novo aos mesmos
   destinatários.` — porque é o único jeito de reemitir um e-mail que se perdeu depois do
   envio. Id inexistente: `Notificação não encontrada`.
9. **Processar mostra a conta certa.** O botão "Processar fila agora" responde
   `N processada(s): X enviada(s), Y reagendada(s), Z falha(s)` — reagendada é retentativa
   marcada para depois, falha é desistência definitiva; os números batem com os cards.

### O que esta etapa NÃO cobre (é decisão declarada, não esquecimento)

- **Conclusão de conferência de inventário NÃO manda e-mail por item.** Uma conferência de 50
  divergências geraria 50 e-mails num clique (o inventário anual, 300) — cortado de propósito;
  o canal da conferência é a própria tela/relatório de divergências (feature 21).
- **Reserva, remessa e retorno de terceiro não geram e-mail de movimentação** — são
  retenção/remanejo, não entrada/saída; a remessa tem o alerta próprio de **remessa vencida**.
- **Sem PDF anexo, sem resumo diário (digest), sem templates configuráveis** — o corpo é fixo
  por evento e fica gravado na fila.
- **WhatsApp fica fora da fila** (o alerta de mínimo continua usando o dele).
- **E-mail de correção retroativa não existe**: se o aviso de uma movimentação **já saiu** e
  ela for estornada depois, ninguém recebe "desconsidere" — o livro e a tela são a verdade.
- **~15 alertas restantes da spec** (quarentena parada, transferência não recebida, calibração
  vencendo etc.) entram cada um com a sua feature dona, como a spec 20 sempre mandou.

## Etapa 13 — Relatórios e Indicadores (2026-08-24)

O módulo tinha 17 relatórios prontos no servidor e **nenhuma tela** para vê-los — só dois
apareciam em algum lugar. Agora existe **Almoxarifado → Relatórios**: um menu com todos os
relatórios que o SEU perfil pode ver, agrupados por assunto, com filtros, exportação para
Excel e a régua de cada relatório escrita no rodapé (para dois números diferentes na mesma
página nunca parecerem erro). E nasceram os **indicadores gerenciais** — giro de estoque,
cobertura em dias, rupturas, valor por grupo e tempo de atendimento — com três cartões novos
no painel inicial.

### Antes → Agora

| Antes | Agora |
|---|---|
| 17 relatórios no servidor, 3 consumidos por telas avulsas | Tela **Relatórios** com menu por categoria, dirigida pelo servidor — cada perfil vê só o que pode |
| Proteção de relatório era exceção (2 de 17, e as duas entraram por revisão) | **Todo** relatório declara sua proteção num registro único — esquecer deixou de ser possível (o sistema nem sobe com relatório órfão) |
| Nenhuma exportação | **Exportar XLSX** em todos os relatórios tabulares — a planilha traz exatamente as colunas com rótulos de negócio, nunca a tabela crua do banco |
| Nenhum indicador gerencial | **Indicadores**: giro (declarado como aproximação), cobertura (mediana em dias), rupturas na janela, valor do estoque por grupo, tempo médio de atendimento |
| "Consumo" calculado de 4 jeitos divergentes no código | Régua de consumo com **fonte única** (a mesma da Reposição); as réguas antigas continuam nos relatórios antigos **de propósito** — com a diferença escrita no rodapé |
| Painel inicial sem visão de gestão | 3 cartões novos: giro, rupturas e tempo de atendimento, com a janela na legenda |

### As regras, com o cenário exato

1. **Cada perfil vê só a sua lista — e a lista não mente.** Entre como Almoxarife: o menu de
   Relatórios mostra 17 itens (com Divergências de Inventário, sem Solicitações de Compra).
   Como Compras: 17 (o inverso). Como chão de fábrica: 16. Forçar a URL de um relatório
   proibido responde `Sem permissão para este relatório`; um nome inexistente,
   `Relatório não encontrado`.
2. **Exportar entrega a MESMA coisa que a tela, protegida igual.** Em Estoque Atual, clique
   **Exportar XLSX**: a planilha baixa como `estoque-atual-<data>.xlsx` com as colunas
   "Código, Nome, Categoria, Unidade, Quantidade atual, Disponível, Valor total" — e nada
   além (custos internos e dono do material não vazam para a planilha). Exportar relatório
   não-tabular (Sucata financeiro, Posição por cliente, Indicadores) responde
   `Relatório sem exportação tabular`.
3. **O aviso de teto aparece.** Histórico de Movimentações mostra no máximo 500 linhas — e a
   tela avisa "mostrando os primeiros 500" quando bater o teto; a planilha herda o mesmo teto.
4. **Indicadores com as réguas escritas.** O relatório Indicadores aceita a janela em dias
   (vazio = a mesma janela da Reposição; inválido responde
   `Parâmetro "janela_dias" deve ser um número inteiro maior que zero`). O rodapé declara:
   giro = consumo na janela ÷ valor do estoque ATUAL (aproximação — não há histórico);
   cobertura pela MEDIANA; rupturas contam o saldo FÍSICO tocando zero (material 100%
   reservado não conta; material inativado sai do histórico); atendimento considera TODO o
   histórico de requisições entregues; materiais de clientes ficam fora de tudo.
5. **Zerou por contagem, conta como ruptura.** Um ajuste de inventário que zera o material
   entra na lista de rupturas — o físico está em zero, não importa o motivo. Liberar uma
   reserva num material já zerado NÃO vira ruptura (lançamento burocrático não é falta).
6. **Dois números de consumo na mesma página, os dois certos.** "Materiais mais consumidos"
   conta só as saídas diretas (a régua histórica dele, escrita no rodapé); o giro conta tudo
   que debita patrimônio (sucata e perda incluídas). No mesmo material com SAIDA 10 + SUCATA 8,
   um mostra 10 e o outro 18 — é régua, não bug.
7. **O painel inicial não quebra por causa dos cartões novos.** Se os indicadores falharem
   (permissão, rede), só os 3 cartões mostram o erro com "Tentar novamente" — o resto do
   painel continua inteiro.

### O que esta etapa NÃO cobre (é decisão declarada, não esquecimento)

- **PDF** — a tela imprime pelo navegador; PDF estilizado por relatório é etapa própria se a
  prática pedir.
- **Unificar as réguas antigas de consumo** — mudaria número de relatório que o pessoal já
  usa; está na letra B como decisão sua.
- **Giro com estoque médio histórico** — exigiria snapshot diário de estoque, que não existe;
  o denominador é o estoque atual, declarado na tela.
- **Aumentar/remover os tetos de 500/10 linhas** — herdados dos relatórios; letra B.
- **Auditar exportações** — nenhuma consulta do módulo audita; se o cliente quiser log de
  egresso de planilha, é uma linha (letra B).

## Etapa 14 — Integrações: o ciclo da compra fecha (2026-08-25)

A Etapa 11 criou a solicitação de compra, mas ela nascia e **nunca morria**: não havia como
cancelar um clique errado, e quando o material chegava pela nota fiscal a solicitação continuava
"a caminho" até um prazo de 60 dias expirar sozinho. Agora o ciclo fecha de verdade: **a chegada
da nota fiscal do pedido vinculado fecha a solicitação sozinha** (status RECEBIDA, com registro
de auditoria), e **cancelar existe** — com justificativa obrigatória, que fica gravada. De
brinde, quem decide compra ganhou um **painel de contexto por material** (disponível, reservado,
consumo médio, último custo pago e as solicitações abertas daquele item, tudo num clique), e
nasceu o relatório **Custo por projeto** (quanto cada projeto consumiu do estoque, com devoluções
abatidas).

A spec desta etapa sempre disse "depende da maturidade dos outros módulos" — e a etapa **começou
medindo** em vez de presumindo: o módulo Compras está maduro (pedidos, itens, recebimento por NF)
e foi integrado de verdade; **BOM/Engenharia não existe e Produção/MES existe sem uso** — essas
integrações ficaram **bloqueadas por dependência, escritas como bloqueadas**, não como promessa.

### Antes → Agora

| Antes | Agora |
|---|---|
| Solicitação de compra não fechava nunca — só o horizonte de 60 dias a fazia parar de segurar a sugestão | **A nota fiscal do pedido vinculado fecha a solicitação sozinha** (RECEBIDA, com auditoria); a primeira nota fecha, mesmo entrega parcial |
| Não existia cancelar (B14, aberta desde a Etapa 11) | **Botão Cancelar** na tela de Reposição, com justificativa obrigatória gravada na auditoria — **B14 resolvida** |
| Vincular a pedido aceitava número de pedido inexistente (ficava "a caminho" de um fantasma) | Vincular **valida as duas pontas**: `Pedido de compra não encontrado` e solicitação finalizada recusada |
| Vincular e "verificar mínimos" eram só do Administrador | Abertos para quem tem o perfil de reposição (Gestor/Compras) — **decisão D9, veja a letra B** |
| "Verificar mínimos" criava solicitações sem dizer quem mandou | Cada solicitação criada por ele agora **audita o autor** |
| Decidir compra sem contexto: a tela mostrava só a sugestão | **Ver contexto** abre painel com disponível/reservado/em terceiros, consumo médio, **último custo de entrada com data**, e as solicitações abertas do material |
| Custo por projeto não existia | Relatório **Custo por projeto**: consumido, devolvido e líquido por projeto, com exportação XLSX |
| Devolução de saída com projeto perdia o projeto | A devolução **herda o projeto/OS da saída original** (nas duas pernas, sucata incluída) — o "devolvido" do relatório fecha a conta |

### As regras, com o cenário exato

1. **A chegada da nota fecha a solicitação.** Vincule uma solicitação a um pedido de compra e
   processe a nota fiscal desse pedido no recebimento: a solicitação vira **RECEBIDA** sozinha,
   sai da lista de pendentes, e a auditoria registra o fechamento. Vale nos **dois** caminhos do
   recebimento (com e sem aprovação prévia). A **primeira** nota fecha — entrega parcial de 5
   num pedido de 20 já fecha a solicitação (o material que ainda falta volta a aparecer na
   sugestão de reposição pela régua normal; veja a letra B).
2. **Cancelar exige justificativa e ela fica gravada.** Na aba de solicitações, clique
   **Cancelar**: a tela pergunta `Cancelar esta solicitação de compra? A justificativa ficará
   registrada.` e depois pede `Justificativa do cancelamento:`. Justificativa vazia **não chama
   o servidor**. Por API, sem justificativa a recusa é
   `Justificativa obrigatória para cancelar a solicitação`.
3. **Solicitação morta não ressuscita.** Cancele uma solicitação vinculada a um pedido e depois
   processe a nota desse pedido: a solicitação **continua CANCELADA** (o fechamento automático
   só toca as vinculadas vivas). Cancelar de novo responde
   `Solicitação já finalizada (RECEBIDA ou CANCELADA) — não pode ser cancelada`; vincular de
   novo, `Solicitação já finalizada (RECEBIDA ou CANCELADA) — não pode ser vinculada a um pedido`.
4. **Vincular valida as duas pontas.** Vincular com número de pedido inexistente responde
   `Pedido de compra não encontrado`; com id de solicitação inexistente,
   `Solicitação não encontrada`.
5. **O contexto abre num clique e não mente número.** Na aba de sugestões, **Ver contexto**
   expande o painel do material: disponível, reservado, em terceiros, consumo médio diário na
   janela configurada, **Último custo de entrada** (valor pago e a data da nota) e as
   solicitações abertas. O painel usa cache — mas **Gerar solicitações e Atualizar invalidam o
   cache na hora** (o painel aberto reconsulta sozinho, sem número velho).
6. **Custo por projeto, com devolução abatendo.** Em Relatórios → Gestão → **Custo por projeto**:
   uma linha por projeto com Consumido, Devolvido, Líquido e Movimentações, filtrável por
   período. Saída de 20 com devolução de 8 no mesmo projeto = líquido 12. Perfil sem o gate de
   reposição recebe `Sem permissão para este relatório` (o relatório **nasce protegido** —
   letra B). A régua completa está escrita no rodapé do próprio relatório.
7. **A devolução herda o projeto da saída.** Devolva uma saída que tinha projeto: a devolução
   nasce com o mesmo projeto/OS (informar manualmente na devolução **ganha** da herança), nas
   duas pernas — devolução para estoque e devolução para sucata.

### O que esta etapa NÃO cobre (é decisão declarada, não esquecimento)

- **BOM/Engenharia e OP/Produção** — **medido**: BOM não existe no sistema e o módulo MES
  existe sem uso real. Integrar com o que não existe seria stub fingindo feature; ficou
  **bloqueado por dependência**, escrito assim na spec 22.
- **Fechamento por quantidade** — a solicitação fecha na primeira nota do pedido, sem conferir
  se a quantidade chegou inteira (aproximação declarada — letra B).
- **Cancelar a solicitação não mexe no pedido de compra** — cancelar uma solicitação VINCULADA
  não cancela nem avisa o pedido no módulo Compras (letra B).
- **Sem e-mail novo** — RECEBIDA e CANCELADA aparecem no painel e na auditoria; nenhum aviso
  novo entrou na fila de notificações (a fila está pronta, ligar é uma decisão à parte).
- **Custo histórico por movimento** — o livro não guarda custo na movimentação; o relatório usa
  o custo **atual** retroativamente (letra G, com a consequência escrita).

## Etapa 15 — Mobilidade: scanner, assinatura e o balcão no celular (2026-08-28)

Desde a etapa das etiquetas, todo lote, série, material e retalho pode sair impresso com um QR
que aponta para a tela certa do sistema — mas a volta não existia: **nada no sistema lia um
QR**. Quem estava no galpão com uma etiqueta na mão dependia do aplicativo de câmera do
celular. E a entrega de material tinha outro buraco antigo, pedido desde a primeira lista de
requisitos: **ninguém registrava quem retirou o material**, nem havia assinatura. Esta etapa
fecha os dois: nasce a tela **Scanner** (aponta a câmera para a etiqueta e o sistema abre o
item já filtrado) e a entrega de requisição ganha **assinatura do recebedor na tela** — nome +
assinatura a dedo, opcional, colada à requisição para sempre. De quebra, o módulo ficou usável
no celular de verdade: as tabelas **paravam de mostrar tudo a partir da 4ª coluna** no mobile
(inclusive os botões de ação — quem operava por celular simplesmente não conseguia agir); agora
nenhuma coluna some.

### Antes → Agora

| Antes | Agora |
|---|---|
| QR da etiqueta só era lido pelo app de câmera do celular, fora do sistema | Tela **Scanner** no menu (logo abaixo do Dashboard): aponta a câmera e o sistema **abre a tela do item já filtrada** — lote, série, material ou retalho |
| QR de origem estranha abriria qualquer coisa | O scanner **só navega para telas do almoxarifado**; qualquer outro conteúdo é exibido com aviso, nunca aberto |
| Sem câmera (ou permissão negada), nada a fazer | Estado de erro com instrução e **campo para colar o conteúdo do QR** — passa pela mesma validação |
| Entrega de requisição não registrava quem retirou | Após confirmar a entrega, o sistema oferece **colher a assinatura do recebedor** (nome + traço na tela, funciona com dedo e mouse) |
| Não havia registro de assinatura em lugar nenhum | O detalhe da requisição lista **todas** as assinaturas colhidas: nome, data, quem colheu e a imagem (miniatura clicável) |
| No celular, as tabelas escondiam da 4ª coluna em diante — **inclusive Ações** | **Nenhuma coluna some**: a tabela desliza para o lado; os modais abrem em tela cheia no celular |

### As regras, com o cenário exato

1. **Ler etiqueta abre a tela certa.** Menu → **Scanner**, autorize a câmera (`Autorize o uso
   da câmera para começar a ler.`), aponte para o QR de uma etiqueta impressa pelo sistema: o
   aparelho vibra e a tela do item abre já filtrada e destacada — o mesmo destino que o QR
   carrega. Enquanto lê, a tela diz `Lendo… centralize o QR na moldura.`
2. **QR estranho não navega.** Leia um QR qualquer (um boleto, um cartão de visita): aparece
   `Este QR não é uma etiqueta do almoxarifado — por segurança, o conteúdo é só exibido,
   nunca aberto.` com o conteúdo em texto e os botões **Copiar** e **Ler outro**. Isso vale
   até para endereço parecido: um QR apontando para `/almoxarifado-admin/...` é recusado —
   só caminhos do módulo de verdade navegam.
3. **Sem câmera, o fluxo não morre.** Negue a permissão: a tela mostra **Câmera indisponível**
   (`O acesso à câmera foi negado ou este aparelho/navegador não oferece câmera. Libere a
   permissão nas configurações do navegador e tente de novo, ou cole abaixo o conteúdo do
   QR.`) com o campo `Cole aqui o conteúdo do QR (ex.: link da etiqueta)` — o texto colado
   passa pela MESMA validação do item 2.
4. **A assinatura é oferecida, nunca exigida.** Entregue uma requisição (total ou parcial):
   depois do aviso de sucesso abre o modal **✍ Colher assinatura do recebedor**, com o campo
   `Nome de quem recebeu` e o quadro de assinatura (botões **Limpar** e **Confirmar
   assinatura**, que só habilita depois de existir traço). **Pular** fecha sem gravar nada e
   a entrega fica valendo — a entrega NUNCA depende da assinatura. Se o envio da assinatura
   falhar, a entrega também não é desfeita.
5. **Nome do recebedor é obrigatório para assinar.** Confirme a assinatura sem nome:
   `Informe o nome de quem recebeu o material`. Sucesso responde
   `Assinatura do recebedor registrada!` e a lista de assinaturas do detalhe atualiza na hora.
6. **Só requisição entregue aceita assinatura.** Por API, uma requisição que ainda não foi
   entregue recusa com `Só é possível registrar assinatura de entrega em requisição entregue
   (total ou parcialmente). Status atual: APROVADA.` (o status atual real aparece na
   mensagem). Requisição **encerrada** ainda aceita — a assinatura documenta o passado.
7. **Assinatura não se apaga nem se edita.** Duas entregas parciais em dias diferentes geram
   duas assinaturas; as duas ficam no detalhe, em ordem, cada uma com quem colheu e quando.
   Errou? Colhe-se outra — a anterior permanece (é evidência, com registro de auditoria).
8. **Quem entrega é quem colhe.** O botão **＋ Assinatura de entrega** (no detalhe de
   requisição entregue/encerrada) aparece só para quem tem o perfil de separação e entrega
   (Administrador e Almoxarife); os demais perfis recebem a recusa padrão de permissão do
   módulo se tentarem por API.

### O que esta etapa NÃO cobre (é decisão declarada, não esquecimento)

- **Código de barras 1D (EAN, Code128)** — nada no sistema **gera** 1D; leitor de código que
  não existe seria feature morta. Quando houver etiqueta de fornecedor para ler, o
  decodificador do scanner é trocável.
- **Coletor físico dedicado** — hardware não confirmado com a GMP; a câmera do celular é o
  hardware assumido. Se um coletor USB/Bluetooth aparecer, ele emula teclado e já funciona
  nos campos de busca existentes, sem código novo.
- **App nativo / instalação / modo offline** — sem demanda medida; o sistema responsivo no
  navegador do celular cobre o balcão.
- **Assinatura obrigatória por tipo de material** — o cadastro de tipos tem os campos
  "requer assinatura"/"requer termo" desde o início, e eles continuam **sem efeito**. Ligar
  isso é decisão de negócio (quais tipos? bloqueia a entrega?) — está na letra B.
- **Fotografia na saída** — a spec original lista; ficou de fora por falta de definição de
  negócio (foto de quê, obrigatória quando?). Foto já existe onde a dor foi real: avaria de
  ferramenta e comprovante de sucata.

## Etapa 16 — Alertas operacionais: o sistema passa a avisar (2026-08-28)

O módulo sempre soube muita coisa que ninguém ficava sabendo: ferramenta com calibração
vencida parada no armário, requisição aprovada com a data de necessidade estourada, reserva
esquecida segurando saldo há um mês, material recebido aguardando inspeção há semanas,
material com saldo e sem prateleira definida. Cada um desses fatos estava no banco — e só
aparecia se alguém abrisse a tela certa na hora certa. Esta etapa cria o **registro de
alertas**: uma lista única de condições que o sistema **varre todos os dias e manda por
e-mail** (pela mesma fila de notificações que já existia) e que a tela nova **Alertas**
mostra **ao vivo**, a qualquer momento. São **7 alertas novos** de uma vez, somando aos 6
que já existiam.

### Antes → Agora

| Antes | Agora |
|---|---|
| 6 alertas existiam (mínimo, zerado, lote vencendo, remessa vencida, ferramenta não devolvida, requisição parada na aprovação) | **13**: entram calibração vencendo, estoque sem consumo, estoque excessivo, quarentena parada, materiais sem endereço, requisição atrasada e reserva parada |
| Cada alerta novo era código novo espalhado | **Registro único**: a varredura diária, o e-mail e a tela leem a MESMA lista — alerta novo é uma entrada no registro |
| Nenhuma tela juntava os avisos | Tela **Alertas** no menu: um cartão por alerta com o total ao vivo, a janela de dias e o detalhe linha a linha |
| Janelas de dias fixas no código | **3 configurações novas** em Configurações Gerais (calibração, quarentena, reserva parada), validadas nos dois lados |
| Quem via era quem tinha tela de gestão | A central é dos perfis **Administrador, Almoxarife, Gestor e Compras** (Produção/Engenharia/Consulta ficam fora — a tela expõe números de estoque e valor parado) |

### As regras, com o cenário exato

1. **A central é ao vivo, o e-mail é o rastro.** Menu → **Alertas**: cada cartão mostra o
   total da condição NAQUELE momento (`Central de alertas operacionais — avaliação ao vivo
   das condições que a varredura diária notifica`). Resolva a condição (calibre a
   ferramenta, entregue a requisição) e a linha some da central na hora — o e-mail já
   enviado continua no painel de Notificações, como histórico.
2. **A varredura não repete aviso.** A varredura roda todo dia, mas cada situação gera
   **um** e-mail: a calibração vencida avisa uma vez por validade; a requisição atrasada,
   uma vez por requisição; sem consumo/excessivo re-lembram no máximo **uma vez por mês**
   enquanto persistirem; materiais sem endereço é **um resumo por semana** (avisar material
   a material seria ruído em massa).
3. **O desligado geral continua valendo.** A chave "Notificar por e-mail" dos alertas de
   estoque desliga TODA a varredura nova também — desligou, nenhum e-mail novo sai (a
   central continua funcionando, porque ela é leitura ao vivo, não e-mail).
4. **Quem pode ver.** Perfil sem a permissão nova vê o aviso de acesso (`Dados
   indisponíveis no momento`) — **nunca** uma central vazia fingindo "não há alertas"
   (essa mentira foi um Critical da Etapa 11 e a tela nova nasce vacinada). Por API, o 403
   é o padrão do módulo.
5. **Janelas configuráveis, com validação honesta.** Em Configurações Gerais: `Alerta de
   Calibração (dias)` (30), `Alerta de Quarentena Parada (dias)` (7), `Alerta de Reserva
   Parada (dias)` (30). Zero ou negativo é recusado nos dois lados — por API:
   `Configuração "alerta_calibracao_dias" deve ser um número de dias maior que zero`.
6. **Um alerta quebrado não cala os outros.** Se a condição de um alerta falhar ao ser
   avaliada, o cartão dele mostra o erro e os demais seguem funcionando — na tela E na
   varredura (isso tem teste, nos dois lados; foi achado da revisão desta etapa).

### O que esta etapa NÃO cobre (é decisão declarada, não esquecimento)

- **3 alertas com lacuna de dado nas features donas:** "separado aguardando retirada" (não
  existe a data da transição), "pedido recebido parcialmente" (não existe saldo de pedido) e
  "consumo acima do previsto" (projeto não tem orçamento). Entram quando a feature dona
  ganhar o dado.
- **4 alertas de evento** (material reprovado, divergência de recebimento, divergência de
  inventário, material sem certificado) — viáveis, mas o gancho certo é dentro do ato, não
  varredura; são a fatia seguinte natural.
- **"Transferência não recebida" SAIU do checklist** — estava lá desde o início, mas foi
  **cortado por decisão do cliente em 2026-08-12** (não existe trânsito entre áreas); a
  spec agora diz isso em vez de fingir pendência.
- **Matriz de destinatário por alerta / digest / canais** — os 7 novos usam a lista única
  de e-mails dos alertas de estoque, como os 4 da Etapa 12 (corte declarado da 12 que
  continua — B15).
- **Unificar a máquina do mínimo/zerado no registro** — funciona e é testada; reescrever
  agora seria risco sem valor novo.

## Etapa 17 — Os avisos que nascem no ato (2026-08-28)

A Etapa 16 fez o sistema varrer o estoque todo dia e avisar. Esta fecha o outro lado: quando
**algo acontece**, o aviso sai **na hora**. Reprovar material numa inspeção, registrar
quantidade diferente da esperada numa nota, concluir uma conferência com divergência — os
três passam a mandar e-mail no mesmo instante do ato, e não no dia seguinte. Antes, reprovar
material não gerava aviso nenhum: o número entrava em "bloqueado" e quem precisava saber
descobria por acaso. Entra também um quarto alerta, esse de vigília: **lotes que exigem
certificado do fornecedor e estão parados sem o documento**.

### Antes → Agora

| Antes | Agora |
|---|---|
| Reprovar material na inspeção não avisava ninguém | E-mail **no ato** com material, quantidade reprovada, encaminhamento, nota e quem inspecionou |
| Nota registrada com quantidade diferente da esperada passava batido | E-mail **no ato**, tanto pela conferência quanto pela entrada fiscal (os dois caminhos que gravam a quantidade) |
| Conferência concluída com divergência: só quem abrisse o relatório via | **Um** e-mail por conferência (nunca um por item), com o número de itens divergentes |
| Lote travado esperando certificado ficava esquecido no armário | **Resumo mensal** com o total de lotes sem certificado e os primeiros da lista |
| 13 alertas | **17** — e os 4 novos aparecem na tela **Alertas** junto com os demais |

### As regras, com o cenário exato

1. **O aviso sai no ato, e a varredura é a rede.** Reprove 3 de 10 numa inspeção: o e-mail
   `[Almoxarifado] Material reprovado — <código>` entra na fila na hora, e o cartão
   **Material reprovado** aparece na central. A varredura diária continua olhando os últimos
   dias (janela configurável) — se o sistema estiver fora do ar na hora do ato, ela pega
   depois. Rodar as duas coisas **não duplica** o aviso.
2. **O aviso nunca atrapalha a operação.** Se o envio falhar, a inspeção é gravada do mesmo
   jeito, o estoque se move e a tela responde normal — o erro fica só no log do servidor.
   Isso vale para os três atos.
3. **Errar de novo, pior, avisa de novo.** Registre 8 de 10 (avisa), corrija para 10 (some
   da central) e registre 2 de 10: **avisa outra vez**, com o número novo. Re-salvar a mesma
   quantidade não duplica.
4. **Divergência de inventário é um aviso por conferência, sem valor em reais.** O corpo diz
   quantos itens divergiram — nunca o impacto financeiro (esse dado é da tela de relatório,
   com permissão própria).
5. **Lotes sem certificado viram um resumo, não uma enxurrada.** Um e-mail por mês
   (`[Almoxarifado] Lotes sem certificado — N lote(s)`) com o total e os primeiros 20. Vale
   também para lote **bloqueado** — que é o caso mais comum, porque o lote que exige
   certificado nasce travado —, para material **de cliente** e para lote cujo arquivo foi
   anexado em branco.
6. **A janela dos avisos de ato é configurável.** Em Configurações Gerais, `Alerta de
   Eventos (dias)` (padrão 7) define por quanto tempo o fato continua aparecendo na central.
   Zero é recusado nos dois lados.

### O que esta etapa NÃO cobre (é decisão declarada, não esquecimento)

- **Ligar a reprovação ao lote** (marcar o lote como REPROVADO automaticamente) — pendência
  antiga da feature 09, mexe no motor de estoque.
- **Dar destino ao material reprovado** — o campo "encaminhamento" continua sendo intenção
  registrada, sem fluxo que a cobre.
- **As marcações de divergência da inspeção** (dimensional, dano físico, material
  incorreto) não geram alerta próprio; o alerta de divergência olha a quantidade.
- **Os 3 alertas que faltam da lista original** seguem bloqueados por falta de dado nas
  features donas (data da transição para retirada, saldo de pedido, orçamento de projeto).

## Etapa 18 — O inventário passa a deixar rastro (2026-08-28)

Até aqui, abrir uma conferência de estoque, contar item por item, recontar, fechar ou
**cancelar** não deixavam registro nenhum de quem fez o quê. O cancelamento era o pior caso:
uma conferência com trezentas contagens podia sumir do fluxo com um clique — sem autor, sem
data e sem motivo. E quando alguém corrigia a própria contagem, o número anterior
simplesmente evaporava. Agora cada um desses cinco atos grava uma linha de auditoria com
autor, horário e o de/para do que mudou; cancelar exige um motivo escrito; e a pessoa que
homologa um ajuste de inventário fica registrada na própria conferência.

De quebra, três operações vizinhas que também apagavam coisas sem trilha passaram a
registrar: **desativar um material**, **cancelar** e **excluir uma requisição**.

### Antes → Agora

| Antes | Agora |
|---|---|
| Abrir conferência: sem registro do ato | Linha de auditoria com escopo, tolerância, se era cega/dupla e quantos itens entraram |
| Contar e recontar: só o último nome ficava na linha do item | Cada contagem vira registro, com o **valor anterior e quem o havia gravado** |
| Corrigir a própria contagem apagava o número antigo para sempre | O de/para fica no log — é a única memória dele |
| Fechar o inventário: nem quem fechou ficava gravado | Registro com ajustes aplicados, impacto e a justificativa |
| **Cancelar: um clique, sem autor, sem data, sem motivo** | **Motivo obrigatório** (mínimo 5 caracteres), autor e data gravados — e o motivo **aparece na lista** |
| Cancelar valia em qualquer situação | Só conferência **em andamento** pode ser cancelada |
| Colunas de aprovador existiam no banco e nunca eram preenchidas | Quem homologa um ajuste de verdade fica registrado |
| Desativar material / cancelar / excluir requisição: sem trilha | Os três auditam, com o de/para |
| Log do módulo: qualquer usuário podia ler tudo | Leitura exige perfil de Administrador |

### As regras, com o cenário exato

1. **Cancelar exige motivo.** Na tela de Conferências, o botão de cancelar abre um modal com
   "Motivo do cancelamento"; o botão de confirmar só habilita a partir de 5 caracteres. Por
   API, a recusa é `Motivo do cancelamento deve ter pelo menos 5 caracteres`.
2. **Só cancela o que está em andamento.** Tentar cancelar uma conferência já concluída
   responde `Conferência não está aberta (status atual: CONCLUIDO)`.
3. **O motivo não some.** Depois de cancelada, a linha mostra o motivo, e passando o mouse
   aparece quem cancelou e quando. A coluna de encerramento passa a mostrar a data do
   cancelamento (antes ficava vazia para sempre).
4. **O aviso nunca atrapalha a operação.** Se o registro de auditoria falhar, a conferência é
   criada, contada, concluída ou cancelada do mesmo jeito — o erro fica no log do servidor.
5. **Duas pessoas cancelando ao mesmo tempo: só uma vale.** A segunda recebe a recusa de
   status e **não** gera registro — a trilha nunca conta um cancelamento que não aconteceu.
6. **Quem homologa fica gravado — só quando há o que homologar.** Concluir aplicando ajuste
   registra o responsável; concluir uma contagem sem nenhuma divergência não inventa um
   homologador.
7. **O log declara quando tem mais coisa.** A consulta devolve o total e avisa se houve corte
   — num inventário de 200+ contagens, ninguém mais lê uma lista truncada achando que é tudo.

### O que esta etapa NÃO cobre (é decisão declarada, não esquecimento)

- **Não existe tela para ler a trilha.** O registro é gravado e consultável pela API, mas
  nenhuma tela do sistema o mostra — e a leitura exige perfil de Administrador. Ou seja: por
  enquanto a trilha serve para investigar um caso pontual com ajuda técnica, não para o
  Gestor conferir sozinho. Ver a letra B.
- **Os cadastros e as configurações continuam sem trilha** — mudar tipos, localizações,
  setores, famílias, centros de custo, almoxarifados, permissões por setor e, o mais
  sensível, **as configurações do módulo** (tolerância de inventário, alertas, alçadas)
  segue sem registro. É o bloco seguinte, coerente e maior.
- **Conclusões simultâneas da mesma conferência** ainda podem se sobrepor (limitação
  anterior a esta etapa, declarada em comentário na rota).
- **Histórico completo das contagens como entidade própria** — o log guarda o de/para; uma
  tabela de versões de contagem é outra coisa.

## Etapa 19 — Mudar cadastro e mudar regra passam a deixar rastro (2026-08-28)

A Etapa 18 fez o inventário deixar trilha. Esta faz o resto do módulo: **criar, editar e
excluir** tipos de material, localizações, setores, famílias, centros de custo e
almoxarifados; **mudar as configurações** (que é onde moram as regras do jogo — tolerância de
inventário, alertas, alçada de liberação por valor); e **mexer na lista de materiais que cada
setor pode requisitar**, que é controle de acesso. Vinte e três operações que até ontem
mudavam o comportamento do sistema sem deixar quem, quando nem de-quanto-para-quanto.

O caso que melhor explica a etapa: alguém baixa a tolerância de divergência do inventário de
6% para 2%. A partir dali, contagens que passavam sozinhas passam a exigir recontagem — e
antes desta etapa não havia como saber quem mudou nem quando.

### Antes → Agora

| Antes | Agora |
|---|---|
| Cadastros (tipos, localizações, setores, famílias, centros de custo, almoxarifados): sem trilha | Criar, editar e excluir registram **quem, quando e o de/para completo** |
| Mudar configuração: sem registro nenhum | **Uma linha por salvamento, só com o que mudou de fato** — a tela manda 18 campos toda vez; se você alterou um, o registro mostra um |
| Salvar sem mudar nada gerava nada visível e nada registrado | Continua sem registrar (é o mesmo salvamento) — o registro só nasce quando algo muda de verdade |
| Senha de SMTP e chave de API poderiam entrar no histórico | **Nunca**: o registro diz que o segredo mudou, jamais o valor. A URL do webhook aparece **sem a parte que carrega o token** |
| Permissões de material por setor: mudavam sem rastro | Registram a lista anterior e a nova, inteiras |
| Excluir um cadastro que não existe respondia "sucesso" | Responde **404** — e não registra um ato que não aconteceu |
| Renomear um setor renomeava as localizações em silêncio | O registro diz **quantas localizações** foram renomeadas junto |

### As regras, com o cenário exato

1. **A configuração registra só o que mudou.** Em Configurações Gerais, altere um único campo
   e salve: o histórico ganha **uma** linha, com aquele campo e o valor anterior. Os outros 17
   não aparecem. Salve de novo sem mexer em nada: **nenhuma** linha nova.
2. **Segredo nunca vai para o histórico.** Troque a senha de SMTP: o registro diz
   `(alterado)` dos dois lados. O valor não aparece em lugar nenhum do histórico. A URL do
   webhook de WhatsApp aparece com o endereço, mas com `(credenciais omitidas)` no lugar dos
   parâmetros — porque é ali que o token costuma ficar.
3. **Excluir o que não existe agora falha.** Excluir um tipo de material com identificador
   inválido responde `Tipo de material não encontrado` (antes respondia sucesso). O mesmo
   vale para localização e família.
4. **Renomear setor conta o efeito colateral.** Renomeie um setor que tem 3 localizações: o
   registro guarda `localizacoes_renomeadas: 3`. Renomeie para o mesmo nome: registra a
   edição com zero.
5. **Localização excluída que volta não é "criação".** Exclua uma localização e crie outra com
   o mesmo código: o sistema **reativa** a antiga, e o histórico chama isso de reativação, com
   o estado anterior — não de criação.
6. **Edição em lote registra por material.** Ajuste estoques mínimos de 3 materiais mudando 1:
   uma linha, para aquele material.
7. **O registro nunca atrapalha a operação.** Se a gravação do histórico falhar, o cadastro é
   salvo, a configuração é aplicada e a tela responde normalmente.
8. **Mudança de regra que dá erro na tela ainda fica registrada.** Se a alçada de liberação
   por valor for gravada e a tela mostrar erro em seguida, o histórico registra a mudança
   assim mesmo — porque a regra mudou de verdade.

### O que esta etapa NÃO cobre (é decisão declarada, não esquecimento)

- ~~**Continua não havendo tela para ler o histórico** (é a mesma pendência da etapa anterior —
  letra B33). Com esta etapa, o histórico ficou bem mais rico, e o custo de não ter tela subiu.~~
  — **PAGO na Etapa 22** (`8c6ffbe..169458d`): a tela **Almoxarifado → Auditoria** existe, com
  filtro de entidade, ação, pessoa e período. Riscado em vez de apagado para quem reler esta
  seção não concluir de novo que a pendência está de pé.
- **Quem lê o histórico é um grupo ligeiramente mais amplo do que quem edita a configuração**:
  a leitura aceita administrador do sistema; a tela de configurações exige administrador do
  módulo. Nota, não risco — quem tem o primeiro consegue se tornar o segundo.
- **Salvar configuração sem mudar nada continua tocando o registro de "última alteração" no
  banco**, mesmo sem gerar histórico. O banco sabe que alguém salvou; o histórico não.
- **Se um salvamento de configuração falhar no meio**, parte das chaves pode ficar gravada
  sem histórico (não há transação — limitação anterior a esta etapa).
- **Excluir algo que já estava excluído** ainda responde sucesso e registra uma exclusão que
  não excluiu nada. Só o identificador inexistente vira 404.
- **Uma rota de configuração sem uso** (aplicar tipo de material em lote) foi auditada mesmo
  assim e está nomeada na spec como candidata a remoção.
- **A troca de foto de material** continua sem registro e responde sucesso para material
  inexistente — fora do escopo desta etapa, nomeado.

## Etapa 20 — O sistema para de mentir sucesso e de falar demais (2026-08-28)

Esta etapa não tem tela nova nem botão novo. Ela fecha três lugares em que o sistema **mentia** ou
**falava demais**, e os três eram do tipo que ninguém percebe até o dia em que percebe.

O primeiro: trocar a foto de um material. Se você mandasse a foto de um material que **não existe**,
o sistema respondia **sucesso** — e guardava a imagem no servidor para sempre, sem nada apontando
para ela. Se você trocasse a foto de um material que já tinha uma, a imagem antiga era apagada
**ao mesmo tempo** em que a nova era gravada, numa corrida em que dava para perder as duas; e
nenhuma dessas trocas deixava registro de quem trocou. O segundo: quem abria as configurações do
módulo recebia de volta a **senha do e-mail** e a **chave de API do WhatsApp em texto puro** — e
podia, sem querer, gravar por cima delas pela tela errada. O terceiro: o mapa de **quais materiais
cada setor pode requisitar** — que é controle de acesso, não dado de estoque — podia ser **lido**
por qualquer usuário do módulo, embora só administrador pudesse **mudá-lo**.

### Antes → Agora

| Antes | Agora |
|---|---|
| Mandar foto para um material inexistente respondia **sucesso** | Responde **`Material não encontrado`** — e o arquivo enviado **não fica** no servidor |
| Cada tentativa dessas deixava uma imagem órfã no servidor, para sempre | Nenhuma saída que não seja sucesso deixa arquivo: erro de banco, material inexistente e material apagado no meio do caminho **apagam o arquivo enviado** |
| A foto anterior era apagada **em paralelo** com a gravação da nova — e uma falha ao apagar derrubava o processo | A anterior só é apagada **depois** de a nova estar gravada, e falhar ao apagar **não derruba nada** |
| Trocar a foto de um material não deixava rastro nenhum | Deixa uma linha no histórico: quem, quando, e **de qual arquivo para qual** |
| A leitura das configurações devolvia a **senha de SMTP** e a **chave de API** em texto puro | Devolve `********` quando há valor gravado, e **vazio** quando não há |
| O salvamento genérico de configurações **aceitava** essas duas chaves e gravava o que viesse, sem a proteção que a tela de Alertas usa (a que ignora o reenvio da máscara) | **Recusa**, apontando a tela certa, e **sem tocar** em nenhuma outra chave do mesmo salvamento |
| Ler o mapa de materiais permitidos de um setor bastava estar logado no módulo | Exige **administrador do Almoxarifado ou super administrador** — o mesmo que já era exigido para mudá-lo |

### As regras, com o cenário exato

Todas as mensagens abaixo foram **copiadas do código** durante o fechamento. Três destes cenários
não têm caminho de tela — estão marcados, e o motivo é honesto: eles descrevem o que o sistema
responde a **quem chama a API por fora** (integração, aba desatualizada, teste técnico), que é
exatamente onde os três buracos moravam.

**1. Foto de material que não existe agora falha — e não deixa lixo no servidor.**
*Cenário (técnico):* enviar uma imagem para `POST /api/almoxarifado/materiais/999999/foto`:
> `Material não encontrado`

Antes: **200 com sucesso**, e a imagem ficava no servidor sem dono. Vale também para o caso raro
em que o material some do banco **entre** a leitura e a gravação: o sistema percebe que não gravou
nada e responde o mesmo 404, em vez de um sucesso sobre uma escrita que não aconteceu.

**2. Trocar a foto continua funcionando exatamente como antes — e agora fica registrado.**
*Cenário (clicável):* Almoxarifado → Materiais → abra um material que **já tem foto**, escolha
outra imagem e salve. A ficha passa a mostrar a nova. O que mudou por baixo: a imagem antiga é
removida do servidor **depois** de a nova estar gravada, e o histórico ganha uma linha da entidade
`material`, ação `ATUALIZACAO`, com o nome do arquivo de antes e o de depois. Se por qualquer
motivo a remoção da imagem antiga falhar, **a troca continua valendo** — sobra um arquivo velho,
que é infinitamente melhor do que perder o novo.

**3. Salvar sem escolher arquivo continua recusando, com a mesma mensagem de sempre.**
*Cenário (técnico):* enviar a requisição de foto sem arquivo nenhum:
> `Nenhuma foto enviada`

Está aqui porque é o controle: nada do comportamento antigo que estava **certo** foi mexido.

**4. A senha de e-mail e a chave de API não voltam mais para quem lê as configurações.**
*Cenário (clicável até a metade):* vá em **Almoxarifado → Configurações → Alertas de Estoque** e
grave uma senha de SMTP. A tela já mostrava `********` ali e continua mostrando. A diferença é na
leitura completa das configurações (`/api/almoxarifado/configuracoes`, que é o que a tela de
**Configurações Gerais** consome): antes ela devolvia a senha **em texto puro**; agora devolve
`********`. E quando **não há** senha gravada, ela devolve **vazio** — nunca `********`, porque
isso faria a tela dizer "já configurado" para uma senha que não existe.

**5. Não dá mais para gravar a senha pela porta dos fundos.**
*Cenário (técnico):* mandar `alertas_smtp_pass` (ou `alertas_whatsapp_api_key`) no salvamento
genérico de configurações:
> `Configuração "alertas_smtp_pass" só pode ser alterada em Configurações → Alertas de Estoque`

Três detalhes que valem a demonstração: **(a)** a recusa vem **antes de qualquer gravação** — se o
mesmo salvamento trouxer dez chaves válidas junto, **nenhuma** é gravada, porque aplicar metade do
formulário seria pior; **(b)** mandar a chave secreta com valor **vazio** também é recusado (não
existe "apagar a senha por atalho"); **(c)** a URL do webhook de WhatsApp **continua sendo aceita
inteira** por esse mesmo salvamento, e continua saindo em claro na leitura — é decisão, está na
**B40**, e a consequência está na **C24**.

**6. Ler o mapa de acesso de um setor passou a exigir o mesmo que mudá-lo.**
*Cenário (técnico):* com um usuário de perfil Almoxarife, Gestor, Compras, Produção ou Consulta —
ou sem perfil nenhum —, chamar
`GET /api/almoxarifado/setores-requisicao/<id>/permissoes`:
> `Acesso restrito — administrador do Almoxarifado ou Super Administrador`

É **a mesma mensagem, palavra por palavra**, que a rota de escrita já devolvia; há teste travando
essa igualdade, para que as duas não se separem numa mudança futura. **Nada muda para quem usa o
sistema:** a única tela que lê esse mapa é a aba administrativa de Configurações do Almoxarifado,
que já era só de administrador.

### O que esta etapa NÃO cobre (é decisão declarada, não esquecimento)

- **A URL do webhook de WhatsApp continua saindo em claro** na leitura das configurações — de
  propósito (**B40**), com a consequência declarada na **C24**: quem administra o módulo lê o
  token que estiver embutido nela. O conserto de verdade é tirar o token de dentro da URL, e isso
  é etapa própria.
- **Mandar arquivo do tipo errado ou grande demais em qualquer upload continua respondendo
  `Erro interno do servidor`** em vez de dizer o motivo (**C25 / G7**). A rota de foto foi
  arrumada no que era dela, mas esse pedaço é comum às cinco rotas de upload e o conserto tem de
  ser uniforme.
- **A lista de setores de requisição continua dizendo quantos materiais cada setor tem
  liberados**, para qualquer usuário do módulo (**B41, em aberto**) — o irmão menor do buraco que
  esta etapa fechou, achado pela revisão adversarial e **declarado em vez de consertado**, porque
  fechá-lo muda o que a tela de requisição recebe.
- **A leitura da alçada de aprovação por valor continua entregando nome e e-mail dos aprovadores**
  a qualquer usuário do módulo (letra **D**) — mesma família de decisão que a B41.
- **A "matriz de leitura" do módulo continua aberta** (letra **D**): dezenas de consultas
  operacionais pedem só estar logado. A etapa fechou o que entregava credencial ou controle de
  acesso, não o que entrega dado de estoque.
- **O backup do sistema e a credencial de e-mail escrita no código ficaram fora** — são do núcleo
  do CRM, não do módulo (letra **D**).
- **Nada foi feito para o passado.** Imagens órfãs que as tentativas antigas deixaram no servidor
  continuam lá; ninguém as apaga. Como nunca houve tela que as listasse, elas só ocupam espaço —
  se um dia incomodar, é uma limpeza pontual, não uma migração.

## Etapa 21 — O backup do sistema parava de guardar segredo (2026-08-28)

**Esta é a primeira etapa fora do módulo Almoxarifado.** Ela não mexe em nada do galpão: mexe no
**núcleo do CRM** — no arquivo de backup do sistema, na senha do e-mail e na tela **Configurações
do Sistema**, que é do CRM inteiro. Ela nasceu do último item que a Etapa 20 declarou fora do
escopo dizendo "isto é do núcleo, não do módulo"; a Etapa 21 foi medir, e o que achou é **pior**
do que aquele registro dizia.

O sistema tem um endereço que baixa um arquivo `.zip` com os dados todos, protegido por uma senha
fixa de servidor. Esse zip era a pasta de dados **inteira** — e dentro dela mora o arquivo em que o
servidor guarda a chave com que ele assina os crachás de login. **Quem baixasse o backup conseguia
fabricar um crachá de super administrador** e entrar no sistema como dono, sem precisar da senha de
ninguém. Não era vazamento de dados: era escalada de privilégio. De quebra, o mesmo zip arrastava
**188 MB** de cópias históricas do banco a cada download — e ninguém ficava sabendo quem baixou.

O resto da etapa é da mesma família. A senha do e-mail do sistema estava escrita **dentro do
código** (e está no histórico do repositório desde **17/03/2026**). E a tela **Configurações do
Sistema → Email** devolvia essa senha **em texto puro** para quem abrisse — e salvava **a cada
tecla**, então clicar no campo que mostrava `********` e digitar uma letra gravava `********N` por
cima da senha de verdade, sem ninguém perceber, porque a leitura seguinte mascarava de novo.

> **Uma coisa só o senhor pode fazer, e nenhum código faz por você: rotacionar a senha do SMTP na
> Locaweb.** Trocar o arquivo **não** apaga a senha de nenhuma cópia do repositório já feita. O
> passo a passo está na **letra A, item A3**, no topo deste documento.

### Antes → Agora

| Antes | Agora |
|---|---|
| O zip do backup levava junto o arquivo de segredos do servidor — quem tivesse o zip **entrava como super administrador** | O zip **não leva** esse arquivo, por regra escrita e testada |
| O zip levava **todas** as cópias históricas do banco (188 MB) | Leva o banco atual, os anexos e **uma** cópia de backup: a mais recente, com os arquivos que a acompanham (sem eles a cópia abriria sem as últimas transações) |
| Ninguém sabia quem tinha baixado backup | **Toda** tentativa fica registrada no log do servidor: horário, IP, o IP real de quem está atrás do proxy, se foi aceito ou negado e por quê |
| A senha do backup era conferida com uma comparação comum, que para no primeiro caractere errado — o **tempo de resposta** dá pistas de quanto do palpite estava certo | Comparação em **tempo constante**: a resposta demora o mesmo, acertando muito ou nada |
| A senha do e-mail do sistema **só** existia escrita no código | O sistema procura primeiro no **ambiente do servidor** (`SMTP_USER`/`SMTP_PASS`); o valor do código é o último recurso, para o e-mail não cair numa máquina sem configuração |
| Um remetente com dois endereços derrubaria o envio **em silêncio** (o servidor de e-mail recusa) | Remetente que não é um endereço único é substituído automaticamente pela caixa autenticada |
| Abrir **Configurações do Sistema → Email** devolvia a **senha do SMTP em texto puro** | Devolve `********` quando há senha gravada e **vazio** quando não há |
| O mesmo valia para a leitura de uma configuração isolada | Vale a **mesma** máscara nas duas leituras — fechar só uma deixaria a outra porta destrancada |
| O campo **Senha SMTP** vinha preenchido com o que o servidor mandou e **salvava a cada tecla** | O campo **nasce vazio**, com o aviso de que já existe senha, e só salva quando você sai do campo |
| Gravar `********` (ou qualquer coisa começada por ele) por cima da senha era aceito e a tela dizia "salvo com sucesso" | O servidor **recusa** com uma mensagem que diz o que fazer, e a tela mostra essa mensagem |

### As regras, com o cenário exato

Todas as mensagens abaixo foram **copiadas do código** durante o fechamento. Os cenários do backup
não têm caminho de tela (o backup é um endereço chamado por fora, por quem administra o servidor) —
estão marcados como técnicos, e é ali mesmo que o buraco morava.

**1. O backup sem senha continua sendo recusado — e agora o servidor registra quem tentou.**
*Cenário (técnico):* chamar `GET /api/backup` sem token:
> `Token de backup inválido ou não configurado`

E no log do servidor aparece a linha `[Backup] NEGADO ip=… xff=- motivo=AUSENTE`. O motivo vai
**só para o log**, nunca para a resposta: dizer ao desconhecido *por que* o token dele não serviu
seria entregar dica de graça. Token errado do mesmo tamanho dá `motivo=INVALIDO`, e o servidor
continua recusando **também** quando ninguém configurou token nenhum — não existe backup "aberto
porque esqueceram de configurar".

**2. O backup com a senha certa baixa o zip — e o zip não tem mais a chave da casa.**
*Cenário (técnico):* chamar `GET /api/backup` com o token correto e abrir o arquivo baixado. Dentro
dele: o banco de dados atual, os anexos enviados pelo sistema, os arquivos de configuração e **uma
única** cópia de backup, a mais recente. **Não há** arquivo de segredos do servidor, e **não há** as
cópias antigas. No log: `[Backup] ACEITO ip=… xff=… fallback=database-….sqlite` — a linha diz
inclusive **qual** cópia foi junto.

**3. Quem já usa o backup pelo endereço antigo não quebra — mas fica avisado.**
*Cenário (técnico):* chamar `GET /api/backup?token=…` (a senha na própria URL, que é como o
comentário da rota sempre documentou). **Continua funcionando**, de propósito: pode existir uma
rotina automática na VPS que ninguém enxerga daqui, e quebrar o backup de produção para fechar um
risco menor seria trocar um problema por outro pior. O que muda é o aviso no log:
`avisos=QUERY_DEPRECIADA`. O mesmo vale para senha curta demais: **avisa**, não recusa.

**4. A senha do e-mail some da tela de Configurações.**
*Cenário (clicável):* **Configurações do Sistema → aba Email**. Antes o campo **Senha SMTP** vinha
preenchido com a senha real — e quem chega a essa tela é **administrador do módulo Administrativo
ou do Comercial, ou super administrador**, grupo bem maior do que quem precisa da senha do e-mail.
Agora o campo vem **vazio**, com o aviso escrito dentro dele:
> `Senha configurada — deixe em branco para manter`

Se nunca houve senha gravada, o aviso é outro — `Senha do e-mail ou app password` —, porque mostrar
`********` para senha inexistente **mentiria** "já está configurado".

**5. Deixar o campo em branco é o jeito de manter a senha atual.**
*Cenário (clicável):* na mesma aba, clique no campo **Senha SMTP**, não digite nada e clique fora.
**Nada acontece**: nenhuma mensagem, nenhuma gravação. Antes, um `Backspace` acidental num campo
que salvava a cada tecla gravava `*******` e matava a configuração em silêncio.

**6. Digitar uma senha nova continua funcionando — e agora só grava uma vez.**
*Cenário (clicável):* digite a senha nova e clique fora do campo:
> `Configuração salva com sucesso!`

O campo volta a ficar vazio e o aviso passa a ser o de "senha configurada". A senha **não** fica
guardada na memória da tela depois de salva.

**7. Gravar a máscara por cima da senha é recusado, com a mensagem dizendo o que fazer.**
*Cenário (técnico — é o que acontece com uma aba antiga aberta ou com quem chama a API por fora):*
mandar `PUT /api/configuracoes/email_smtp_pass` com o valor `********` ou `********N`:
> `Valor inválido para senha: deixe o campo em branco para manter a senha atual`

É um **400**, e a tela mostra essa frase (ela passou a exibir o motivo que o servidor manda, em vez
do genérico "Erro ao salvar configuração"). Valor **vazio** é recusado com a mesma mensagem — não
existe "apagar a senha por atalho". E a recusa vale para qualquer valor que **contenha** a máscara,
não só para a máscara exata: `********N` é justamente o que a tela antiga produzia.

**8. O e-mail do núcleo continua saindo igual — a mudança é de onde vem a senha.**
*Cenário (clicável):* o único lugar do CRM que usa essa configuração é a **Solicitação de material
de escritório**, que manda o pedido para a lista de e-mails de Compras. Crie uma solicitação: o
e-mail sai como sempre saiu. A régua nova é de **precedência** — se a VPS definir `SMTP_USER` e
`SMTP_PASS` no ambiente, o sistema usa aqueles; sem isso, cai no valor de sempre. **Enquanto
ninguém definir essas variáveis na VPS, nada muda no envio** — foi conferido com o ambiente real
desta máquina de desenvolvimento, onde os quatro campos caem no valor de sempre. *(A VPS de
produção não foi inspecionada daqui; se ela já tiver `SMTP_*` definidas por algum motivo, passam a
valer — é exatamente o que a etapa quer.)* É assim de propósito: uma etapa de segurança não pode
trocar o servidor de e-mail em produção de lambuja.

### O que esta etapa NÃO cobre (é decisão declarada, não esquecimento)

- **A senha do SMTP continua no histórico do repositório** e **continua válida na Locaweb**. O
  código parou de depender dela como fonte primária, mas isso é **cosmético** enquanto ninguém
  rotacionar a senha no provedor. É o item **A3** e o furo **C27** — a única coisa desta etapa que
  depende de você.
- **O backup continua protegido por uma senha fixa**, não por login de usuário. Não virou sessão
  de propósito (item **B43**): pode haver rotina automática dependendo do endereço atual. Quem
  tiver o token baixa o backup, e o registro de quem baixou é o **log do servidor** — não há tela
  que liste os downloads (furo **C26**).
- **Não existe rota para restaurar** um backup pelo sistema, e **não foi criada** (letra **D**).
  Restaurar continua sendo operação de servidor. Inventar um endereço de restauração seria abrir
  um buraco maior do que o que a etapa fechou.
- **O histórico do repositório não foi reescrito** (letra **D**) — reescrever histórico de
  repositório compartilhado quebra as cópias de terceiros; é decisão de infraestrutura, não de
  código.
- **A aba "Backup" da tela de Configurações continua sem efeito nenhum** (letra **D**). Os três
  campos dela — backup automático, frequência e dias de retenção — são gravados e **nenhuma parte
  do servidor os lê**: a rotina real de cópia roda na inicialização, guardando um número fixo de
  cópias. É feature morta; esta etapa a **nomeia** e não a conserta, porque consertá-la é decidir
  como a rotina deve se comportar, e isso é etapa própria.
- **A senha do e-mail continua no código como último recurso** (item **B46**), com o comentário
  dizendo que é credencial à espera de rotação. Apagá-la agora derrubaria o envio em qualquer
  máquina que não tenha as variáveis de ambiente configuradas — inclusive, possivelmente, a de
  produção.
- **As configurações de e-mail gravadas no banco continuam sem ser usadas pelo envio** (item
  **B42**). Elas aparecem na tela, são editáveis, e o envio **não** olha para elas — porque o
  host gravado ali é de outro produto e o remetente gravado ali tem dois endereços. Está medido e
  escrito no item B42.

## Etapa 22 — A trilha de auditoria ganha uma tela (2026-08-28)

Três etapas seguidas (18, 19 e 20) fizeram o sistema **anotar** quem mexeu em quê: o ciclo do
inventário, os cadastros, as configurações que mudam regra de negócio, a lista de materiais por
setor, a troca de foto de material. Tudo isso ficou gravado — e **ninguém tinha como ler**. A
única forma de olhar o histórico era pedir a alguém que consultasse o banco por fora do sistema.
Numa auditoria de verdade, um registro que ninguém consegue abrir vale quase o mesmo que registro
nenhum.

Agora existe a tela **Almoxarifado → Auditoria**. Ela responde a pergunta para a qual a trilha foi
feita: **"quem mexeu nisto, e quando?"** — com filtro por tipo de coisa (material, conferência,
configuração…), por ação, por pessoa e por período. Cada linha abre e mostra o **de/para**: só o
que mudou, campo a campo, em vez do despejo técnico que estava guardado.

Junto veio uma coisa invisível e importante: a tabela do histórico **não tinha nenhum índice**. É
a tabela que mais cresce do módulo — cada salvamento de configuração escreve uma linha. Sem
índice, filtrar por período obrigava o banco a ler a tabela inteira, e isso piora todo mês. Foram
criados os três índices que faltavam (data, tipo de coisa, pessoa).

### Antes → Agora

| Antes | Agora |
|---|---|
| O histórico existia e **nenhuma tela o mostrava** — só consulta técnica ao banco | Tela **Almoxarifado → Auditoria**, no menu, ao lado de Configurações |
| A consulta só sabia filtrar por tipo de coisa e por número do registro | Filtra também por **pessoa**, por **ação** e por **período** (data inicial e final), tudo combinável |
| Não havia como perguntar "o que aconteceu ontem" | O período é **inclusivo nos dois extremos**, no horário de Brasília |
| Uma data escrita errada (`ontem`, `2026-13-45`, `30 de fevereiro`) era aceita em silêncio e a resposta vinha **vazia**, parecendo prova de que nada aconteceu | A tela recebe **erro explícito** e mostra o painel vermelho, nunca "nenhum registro" |
| O mesmo ato aparecia com dois nomes diferentes conforme a tela que o gravou (`CRIACAO` e `CRIAR`, `EDICAO` e `ATUALIZACAO` e `ATUALIZAR`) | O filtro tem **uma** opção por ato — "Criação" traz as duas grafias juntas — e a linha continua mostrando, em letra miúda, o nome cru que foi gravado |
| Para ver o que mudou era preciso ler o texto técnico com todos os campos | A linha expande numa tabelinha **Campo · De · Para** |
| A consulta trazia no máximo 200 linhas e avisava que cortou, sem oferecer saída | O aviso continua, e agora há **Anteriores / Próximos** para percorrer o resto |
| A tabela do histórico não tinha **nenhum** índice — filtrar por data lia a tabela inteira | Três índices: data, tipo de coisa + número, e pessoa |

### As regras, com o cenário exato

**1. Só administrador entra — e quem não é vê o motivo, não uma tela vazia.**
Entre com um usuário sem perfil de administrador do módulo e vá para
`/almoxarifado/auditoria` pela barra de endereços. A tela abre com o painel vermelho de falta de
permissão, e **nenhuma consulta é feita**. Tela vazia seria pior do que negar: vazia é
indistinguível de "não há registros".

**2. Data que não existe no calendário é recusada — e a recusa aparece.**
Nos campos de data, digite `2026-02-30` (30 de fevereiro). A tela mostra o painel vermelho com a
mensagem literal:

> **Data inválida: use uma data real no formato AAAA-MM-DD**

Isto é mais sutil do que parece e foi medido: `30 de fevereiro` é **aceito** tanto pelo
JavaScript quanto pelo banco, que "rolam" a data para 2 de março. Sem esta guarda, a consulta não
daria lista vazia — daria uma **janela alargada em silêncio**: uma busca de fevereiro devolvendo
três dias de março, sem nada na tela dizendo que a pergunta foi outra.

**3. Período invertido também é recusado.**
Ponha data inicial `2026-08-20` e data final `2026-08-01`. As duas datas existem, então a regra
anterior não pega. A mensagem literal é:

> **Período inválido: a data inicial é posterior à data final**

Antes disso, o pedido voltava com `200 OK` e lista vazia — o mesmo engano da regra 2 entrando pela
outra porta.

**4. Filtrar por um dia traz o expediente inteiro daquele dia.**
Filtre pelo dia de hoje. Um ato registrado às **21:30** aparece nesse filtro. Parece óbvio e não
é: o sistema grava a hora em **UTC**, então um ato das 21:30 de segunda está guardado como
**00:30 de terça**. Sem a conversão, **as três últimas horas de todo expediente sumiriam** do
filtro do próprio dia. A tela avisa isso em letra miúda logo abaixo dos filtros.

**5. Sinônimo não divide a lista.**
No filtro de ação, escolha **"Criação"**. O resultado traz tanto as linhas gravadas como `CRIACAO`
quanto as gravadas como `CRIAR` — e cada linha mostra, embaixo do rótulo, o nome cru que foi
gravado. O sistema não esconde que o vocabulário dele é inconsistente; ele só evita que você
perca linhas por causa disso.

**6. Expandir uma linha mostra o de/para, e nunca uma área em branco.**
Clique em **Detalhes**. Se o ato guardou antes e depois, aparece a tabelinha `Campo · De · Para`.
Se aquele ato não guardou nenhum dos dois lados — existem operações assim —, a mensagem literal é:

> **Sem detalhes registrados para este ato — a linha existe, mas não guardou o antes nem o
> depois.**

Área em branco pareceria defeito da tela, e "nada mudou" seria mentira.

**7. Senha trocada aparece como trocada, sem mostrar a senha.**
Numa linha de mudança de configuração com senha, o campo aparece com `(alterado)` dos dois lados.
A tela **exibe o que está gravado** e não embeleza. Isso é resultado de uma decisão de leitura: a
régua que monta o de/para **não descarta campos com os dois lados iguais** — se descartasse, a
troca de senha mascarada **sumiria da tela**, e o histórico mostraria "prazo: 30 → 45" escondendo
que a senha foi trocada no mesmo salvamento.

**8. Filtro vazio diz o que sabe, e não mais.**
Filtre por uma combinação que não tem nada. A mensagem literal é:

> **Nenhum registro para os filtros aplicados**

E não "não há registros" — a tela não sabe nada sobre o mundo, só sobre os filtros que você pôs.
Numa auditoria, a diferença entre as duas frases é a diferença entre uma informação e uma
afirmação falsa.

### Roteiro rápido para demonstrar ao vivo

1. Entrar como administrador → menu **Almoxarifado → Auditoria** (o item fica ao lado de
   Configurações; só quem pode configurar o módulo o vê).
2. Filtrar **pelo próprio usuário** e **pelo dia de hoje** — devem aparecer os atos da sessão.
3. **Expandir** uma linha e mostrar o de/para.
4. Trocar o filtro de ação para **"Criação"** e apontar que a lista traz `CRIACAO` **e** `CRIAR`
   juntos, com o nome cru visível em cada linha.
5. Inverter as datas (inicial depois da final) e mostrar o erro **Período inválido**.

### O que esta etapa NÃO cobre

- **Exportar a trilha para Excel.** O módulo já tem exportação nos Relatórios; enxertar uma
  segunda régua aqui duplicaria trabalho. Se a demanda aparecer, a trilha vira mais um relatório
  (letra **D**).
- **Corrigir os nomes das ações no banco.** A tela agrupa os sinônimos **na exibição** e o dado
  histórico fica intacto — reescrever o que o sistema afirma ter registrado é exatamente o que
  uma trilha de auditoria não pode sofrer. É decisão sua, item **B47**.
- **Padronizar os nomes das ações nas gravações novas.** São ~45 pontos do código; feito junto
  com esta tela, dado e tela mudariam no mesmo dia e não haveria como saber qual dos dois quebrou
  se algo quebrasse (letra **D**).
- **Reduzir o volume do histórico de permissões por setor.** Cada salvamento grava o mapa inteiro
  (~46 KB). A tela agora **mostra** essas linhas, o que torna o problema visível — que já é
  progresso. Encolher o que se grava é mudar o contrato de auditoria: o que deixa de ser
  registrado? Decisão sua (item **G8** e letra **D**).
- **Apagar histórico antigo (retenção/expurgo).** Sem política definida por você, apagar trilha é
  a última coisa que se implementa por conta própria (letra **D**).
- **Trilha por conferência específica para o Gestor.** O gate continua sendo Administrador. Abrir
  para o Gestor é decisão de exposição, e continua sua (era a opção 2 do antigo **B33**).

## Etapa 23 — O histórico para de mentir por omissão e por excesso (2026-08-28)

A Etapa 22 deu uma tela ao histórico do módulo. E foi ela que tornou visíveis dois defeitos que
até então ninguém enxergava, porque ninguém lia a trilha: **em um caso o sistema mudava uma
configuração e não anotava nada; no outro, anotava uma exclusão que não excluiu coisa alguma.**
Enquanto o histórico vivia no banco, os dois eram teoria. A partir do momento em que alguém abre a
tela **Almoxarifado → Auditoria** para responder *"quem mexeu nisto?"*, o primeiro vira uma
**ausência** que engana e o segundo vira uma **linha a mais** que engana.

Esta etapa fecha os dois. Ela **não tem tela nova** — o que muda é a confiança no que a tela da
Etapa 22 mostra.

**O primeiro caso, com números.** A tela de Configurações do módulo manda **18 campos** a cada
`Salvar`, e o sistema gravava um de cada vez. Falhando no terceiro: os dois primeiros já estavam
gravados, você via a mensagem de erro, e o histórico **não ganhava nenhuma linha** — porque a
anotação só acontecia no fim, depois de todos. Resultado: configuração alterada pela metade,
usuário convencido de que não salvou, e trilha muda. Numa etapa cujo tema é o histórico não
mentir, essa é a pior combinação possível.

**O segundo caso.** Excluir um tipo de material, uma localização, um setor, uma família ou um
material é uma **inativação** — a linha some das listas mas continua no banco. Clicar Excluir de
novo (duas abas abertas, um F5, um duplo-clique) respondia sucesso e **gravava outra linha de
"Exclusão"**, com autor e horário, sobre um item que já estava inativo. Na tela de Auditoria essa
linha é **indistinguível** de uma exclusão de verdade. O motivo é uma armadilha do banco: ele conta
as linhas que a busca **encontrou**, não as que **mudaram de valor** — uma linha já inativa é
"atualizada" para o mesmo valor e conta como uma.

**E apareceu um terceiro, que não estava no escopo.** Ao medir o primeiro caso, a revisão encontrou
um defeito mais fundo: quando duas gravações disputam o banco ao mesmo tempo, o sistema **tenta de
novo** — e a versão antiga desse mecanismo **respondia o erro da primeira tentativa para quem
pediu** e só **depois** decidia refazer. Na prática: a tela mostrava erro, o pedido era refeito nos
bastidores, **a gravação acontecia**, e a anotação no histórico já tinha sido pulada. **Sem
consertar isso, o conserto do primeiro caso seria promessa falsa** — o "tudo ou nada" continuaria
falhando por outro caminho. Foi consertado primeiro.

### Antes → Agora

| Antes | Agora |
|---|---|
| `Salvar` em Configurações gravava campo a campo; falha no meio deixava **parte gravada** | As 18 vão **juntas ou nenhuma vai** — não existe mais estado pela metade |
| Falha no meio do `Salvar` deixava a configuração alterada **sem nenhuma linha no histórico** | O erro passa a descrever um banco **intocado**: nada mudou, e por isso não há o que anotar |
| Clicar **Excluir** de novo num item já inativo gravava **outra** linha de "Exclusão" na Auditoria | O segundo clique responde sucesso e **não gera linha nenhuma** — a trilha mostra **um** ato |
| Excluir um material já inativo gravava outra "Exclusão" — na entidade central do módulo | Idem: só a desativação que **teve efeito** vira registro |
| Excluir um item **que não existe** e excluir um item **já inativo** eram tratados como o mesmo caso | São separados: item inexistente continua devolvendo *não encontrado*; item já inativo devolve sucesso |
| Quando duas gravações disputavam o banco, quem pediu recebia **erro** e a gravação acontecia depois | Quem pediu recebe **uma** resposta, a da tentativa final — o "tenta de novo" ficou invisível, que é o que ele deve ser |

### As regras, com o cenário exato

**1. Excluir duas vezes é UM ato no histórico, não dois.**
Vá em **Almoxarifado → Configurações → Tipos de Material**, crie um tipo qualquer (ex.: *Teste
Auditoria*) e clique **Excluir**. Clique **Excluir** de novo no mesmo item (recarregue a tela se
ele já tiver sumido da lista, ou abra a mesma tela em duas abas antes de excluir). Agora vá em
**Almoxarifado → Auditoria**, filtre a entidade **Tipo de material** e procure o item.

> **Aparece UMA linha de "Exclusão", não duas.**

Antes desta etapa apareceriam duas, com horários diferentes, e não haveria como saber que a segunda
não excluiu nada. **Repita o mesmo com um material** (Cadastro → Materiais → Excluir duas vezes) e
filtre a entidade **Material** na Auditoria: também **uma** linha só.

**2. Excluir algo que não existe continua avisando que não existe.**
O conserto não engoliu o aviso legítimo. Um item que nunca existiu continua respondendo com as
mensagens de sempre, cada uma na sua tela:

> *Tipo de material não encontrado* · *Localização não encontrada* · *Setor não encontrado* ·
> *Família não encontrada*

A diferença que esta etapa introduziu é justamente **separar** os dois casos, que antes eram
tratados como um só.

**3. Um setor já inativo cujo nome ainda é usado por uma localização ativa continua sendo
recusado — e isso é decisão, não sobra.**
Se você excluir um setor e depois criar uma localização usando o nome dele, tentar excluir o setor
de novo **não** responde "já estava inativo": responde a recusa do vínculo, com a mensagem literal

> *Não é possível excluir: 1 localização(ões) ativa(s) usam este setor*

**Foi decidido assim de propósito**: a mensagem do vínculo é verdade, e trocá-la por "já estava
inativo" esconderia de quem está limpando o cadastro que existe uma localização ativa presa àquele
nome.

**4. Salvar configurações é tudo ou nada.**
Este é o cenário difícil de demonstrar ao vivo (exige provocar uma falha de banco no meio da
gravação) — ele está congelado em teste automatizado. O que dá para afirmar na apresentação:

> **Se o `Salvar` da tela de Configurações falhar, nenhum dos 18 campos foi gravado.** A mensagem
> de erro passou a descrever um banco intocado. Antes, ela podia estar mentindo.

**5. Excluir uma localização que tem saldo continua sendo recusado.**
Nada do que a etapa mexeu afrouxou as travas de exclusão. A mensagem continua:

> *Não é possível remover: localização possui saldo*

### Roteiro rápido para demonstrar ao vivo

1. **Configurações → Tipos de Material** → criar *Teste Auditoria* → **Excluir**.
2. Recarregar a tela e **Excluir de novo** o mesmo item (ou fazer o segundo clique numa segunda aba
   aberta antes da primeira exclusão).
3. **Almoxarifado → Auditoria** → filtro **Entidade = Tipo de material** → mostrar que há **uma
   única** linha de *Exclusão* para aquele item.
4. Expandir a linha em **Detalhes** e mostrar o de/para: o único campo que mudou de verdade é
   `ativo`, de `1` para `0`.
5. Repetir 1–3 com um **material**, para mostrar que vale também na entidade central do módulo.

### O que esta etapa NÃO cobre (é decisão declarada, não esquecimento)

- **Nenhuma tela mudou.** A exclusão repetida responde sucesso como sempre respondeu; o que mudou é
  o que fica gravado. Se você quiser que a tela **avise** ("este item já estava inativo"), é uma
  mensagem no front e é decisão sua — item **B52**.
- **O "tudo ou nada" foi entregue só no `Salvar` de Configurações.** Os demais pontos do módulo que
  gravam vários registros em sequência **não foram varridos** — não é conclusão de que não existem,
  é corte de escopo (letra **D**).
- **O mesmo perigo de "desfazer apagando o trabalho de outra pessoa" existe hoje em dois pontos do
  núcleo do CRM** (exclusão de usuário e renumeração de propostas) e **continua lá** — foi
  encontrado nesta etapa, é anterior a ela, e consertá-lo é etapa do núcleo. Furo **C30**.
- **"Excluir" e "desativar" continuam com nomes diferentes no dado gravado.** Na tela eles já
  aparecem juntos desde a Etapa 22 (**B48**); padronizar a gravação são ~45 pontos do código
  (letra **D**).
- **Não foi criado um ato "tentativa de desativação".** A doutrina antiga do código dizia que valia
  a pena registrar quem tentou desativar de novo; ela **perdeu** (item **B53**), porque registrar
  tentativa com o mesmo nome do ato real é o histórico mentindo por excesso. Se registrar tentativas
  tiver valor para vocês, isso pede um nome próprio de ato — etapa nova.

## Etapa 24 — A Qualidade ganha perfil, e a tela que decide acesso para de mentir (2026-08-29)

Quem inspeciona material recebido na GMP não tinha perfil no sistema. Para aprovar ou reprovar uma
carga, liberar um lote vencido ou mudar a situação de uma série, a área de qualidade **dependia do
almoxarifado decidir por ela** — ou recebia um perfil largo demais, que abria junto o direito de
movimentar estoque e cadastrar material. Esta etapa cria o perfil **Qualidade**, com exatamente
duas coisas: **consultar** e **decidir inspeção**. Nada além.

E, na mesma tela que atribui perfis, conserta três coisas que ninguém tinha percebido porque
ninguém as procurava: **retirar o perfil de alguém não deixava rastro nenhum**, dar o perfil ficava
registrado **sem dizer qual era o perfil anterior**, e a lista oferecia a opção **"Administrador"**,
que dá poder de promover outras pessoas e depois **evapora sozinha** no próximo salvamento daquele
cadastro de usuário.

**Uma correção de premissa, dita em voz alta porque quase custou caro.** Esta etapa começou com a
afirmação — minha, escrita no documento de desenho — de que *"não existe tela para atribuir perfil;
só dá para fazer por dentro do banco"*. **Isso era falso.** A tela existe desde 05/08/2026, está no
menu em **Almoxarifado → Configurações → Perfis de Acesso**, está descrita no manual do sistema e
**já foi usada** (sete atribuições registradas no histórico do banco de desenvolvimento). O erro
aconteceu porque procurei o consumidor pelo nome que eu imaginava (`perfil_almoxarifado`) e não pelo
nome do endereço que ele realmente chama (`perfis-usuario`), que fica dentro do arquivo de outra
aba. A revisão derrubou a premissa com quatro provas independentes e o escopo foi reescrito de
*"criar a tela"* para *"consertar quatro defeitos da tela que existe"*. **Se a premissa tivesse
sobrevivido, o sistema teria ganhado uma segunda porta para a mesma função** — duas telas
atribuindo perfil, cada uma sem saber da outra. Fica registrado aqui porque é o tipo de erro que
um documento propaga: quem lesse o desenho antigo acreditaria nele.

### Antes → Agora

| Antes | Agora |
|---|---|
| A área de qualidade **não tinha perfil** — dependia do almoxarifado para aprovar/reprovar carga, liberar lote vencido ou mudar situação de série | Existe o perfil **Qualidade**, que decide inspeção **e nada mais** |
| **Retirar** o perfil de alguém não deixava nenhuma linha no histórico — o ato mais sensível do módulo era invisível | Retirar aparece na Auditoria como **Exclusão**, com quem fez, quando, e qual perfil saiu |
| Dar perfil ficava registrado **sem o "de"** — a trilha mostrava o perfil novo, nunca o anterior | A linha mostra o **de → para** completo: perfil anterior, perfil novo e a origem |
| A lista de perfis oferecia **"Administrador"** — concedê-lo dava poder de promover outras pessoas, e o perfil sumia sozinho no próximo salvamento do cadastro daquela pessoa | **"Administrador" não é mais oferecido**, e a tela explica onde ele se define de verdade |
| Um perfil novo aparecia na tela como `QUALIDADE`, em caixa alta, com um traço na coluna que explica o que ele permite | Aparece como **Qualidade**, com a descrição do que faz e do que não faz |
| A tela de Perfis de Acesso **não tinha nenhum teste automático** | Tem **sete** cenários automatizados cobrindo o comportamento dela, mais um teste de ponta a ponta que dá e tira o perfil e confere as duas marcas no histórico |

### As regras, com o cenário exato

**1. Dar um perfil e depois tirar deixam DUAS marcas no histórico, não uma.**
Vá em **Almoxarifado → Configurações → aba "Perfis de Acesso"**, escolha um usuário comum e
selecione **Qualidade** na lista da linha dele. O aviso é literal:

> *Perfil definido: Qualidade*

Agora, na mesma linha, escolha **"Produção (padrão)"**:

> *Perfil removido — o usuário volta ao padrão (Produção)*

Vá em **Almoxarifado → Auditoria** e filtre a **Entidade = Perfil de usuário**. Aparecem **duas**
linhas para aquela pessoa: uma **Exclusão** (a mais recente, que é a retirada) e uma **Edição**
(a concessão). Expandindo cada uma, o **De → Para** mostra o perfil que havia antes e o que passou
a valer. **Antes desta etapa, a retirada não apareceria de forma alguma** — a lista mostraria só a
concessão, e alguém que perdesse o acesso teria perdido sem rastro.

**2. O perfil Qualidade decide inspeção e não mexe em saldo — e isso é decisão, não sobra.**
Com um usuário de perfil **Qualidade**, entre em **Almoxarifado → Inspeções**. Decidir a inspeção
de um item recebido funciona. Mas os botões **Bloquear Material** e **Desbloquear Material**, no
topo da tela, respondem:

> *Sem permissão para ajustar saldo de estoque — seu perfil é Qualidade. Solicite acesso a um
> administrador.*

Esses dois botões bloqueiam material **fora** do fluxo de inspeção — ex.: avaria encontrada na
prateleira — e mexem no saldo disponível. Mexer em saldo não é ofício de qualidade, e por isso o
perfil não os recebeu. **Se para vocês bloquear por decisão de qualidade tiver de caber neste
perfil, é decisão sua** — item **B56**. Bloquear **dentro** da inspeção (reprovar o item recebido)
continua sendo dele.

**3. "Administrador" não aparece mais na lista de perfis, e a tela diz por quê.**
Na aba **Perfis de Acesso**, abra a lista de qualquer linha: as opções são *Produção (padrão)*,
*Almoxarife*, *Compras*, *Engenharia*, *Gestor*, *Consulta* e *Qualidade*. **Administrador não
está lá.** Logo acima da tabela, a tela explica:

> *Administrador do módulo não é oferecido aqui: define-se no cadastro de usuário, marcando o
> almoxarifado entre os módulos que a pessoa administra. Concedido por esta tela, seria apagado no
> próximo salvamento daquele cadastro.*

São dois problemas que se somavam: quem recebesse esse perfil pela tela passaria a **configurar o
módulo e a promover outras pessoas**; e o salvamento seguinte daquele cadastro de usuário
**apagaria** o perfil, sem avisar ninguém. A combinação — parece que funcionou, dá poder demais e
some sozinho depois — é pior que a opção não existir.

**4. Quem já é administrador continua sem lista de escolha, com o motivo na linha.**
Isto já funcionava e continua igual: um superadministrador, um administrador do sistema ou um
administrador do módulo aparece com o selo **Administrador** e **sem** a lista. A tela diz:

> *Para dar um perfil específico, remova a condição de administrador no cadastro de usuário.*

Se alguém contornar a tela e mandar o pedido mesmo assim, o servidor recusa com a mensagem
completa:

> *Este usuário já é administrador (superadmin, admin de sistema ou admin do módulo) e tem acesso
> total ao almoxarifado. Remova essa condição no cadastro de usuário antes de definir um perfil
> específico.*

**5. A coluna "O que isso permite" descreve o perfil novo, em vez de um traço.**
Na linha de quem recebeu **Qualidade**, a terceira coluna mostra:

> *Consulta e decide inspeção: aprova/reprova item recebido, libera vencimento de lote e muda
> status de lote e de série — não movimenta estoque, não ajusta saldo nem cadastra material*

### Roteiro rápido para demonstrar ao vivo

1. **Configurações → Perfis de Acesso** → escolher um usuário comum → **Qualidade** → mostrar o
   aviso e a descrição que aparece na terceira coluna.
2. Abrir a lista de novo e mostrar que **Administrador não está entre as opções**, lendo o
   parágrafo que explica por quê.
3. Na mesma linha, escolher **Produção (padrão)** → mostrar o aviso de remoção.
4. **Almoxarifado → Auditoria** → filtro **Entidade = Perfil de usuário** → mostrar as **duas**
   linhas (Exclusão e Edição) e expandir cada uma para ver o **De → Para**.
5. (Opcional, precisa de um segundo login) Entrar como o usuário de perfil **Qualidade**, abrir
   **Inspeções**, decidir uma inspeção, e clicar em **Bloquear Material** para mostrar a recusa
   com o nome do perfil na mensagem.

### O que esta etapa NÃO cobre (é decisão declarada, não esquecimento)

- **A central de alertas continua invisível para o perfil Qualidade.** Os quatro alertas que
  seriam dele — material reprovado, divergência de recebimento, lote sem certificado e a fila de
  itens aguardando inspeção — não aparecem, porque a central **não filtra por perfil**: quem a
  abre vê o registro inteiro, incluindo os alertas de estoque parado e estoque excessivo, que
  trazem o **valor em dinheiro** parado. Dar acesso à central entregaria valor de estoque a quem
  não precisa dele. Destravar isso é a tarefa descrita no item **B55**.
- **Bloquear/desbloquear material avulso continua fora do perfil** (regra 2 acima, item **B56**).
- **Quem não tem perfil definido continua entrando como Produção.** Este é o padrão do módulo
  desde o começo, e mudá-lo tem efeito imediato em todo mundo que hoje opera sem perfil — item
  **B54**. Agora é uma decisão viável de tomar, porque a tela permite dar perfil explícito a quem
  precisa **antes** de apertar o padrão.
- **Nenhuma tela nova foi criada, e nenhum endereço mudou.** A aba **Perfis de Acesso** já existia
  (ver a correção de premissa no começo desta seção); o que mudou foi o conteúdo dela.
- **A trilha de perfil não foi para trás.** As sete atribuições feitas antes desta etapa continuam
  no histórico como estavam — sem o "de", porque na época ele não era gravado. Só os atos novos
  trazem o de/para completo.


## Etapa 25 — De onde veio cada movimento, e o backup que parou de crescer sozinho (2026-08-29)

Duas coisas que ninguém vê no dia a dia e que só aparecem quando dão problema.

A primeira: até agora, o histórico de movimentações dizia **quem** mexeu no estoque e **quando** —
mas não de **onde**. Se aparecesse uma baixa estranha às três da manhã, dava para saber o nome da
pessoa e nada mais: se foi do computador do almoxarifado, do celular no galpão, de casa. Agora cada
movimentação guarda o **endereço de rede e o aparelho** de onde partiu. É o tipo de informação que
não serve para nada até o dia em que é a única coisa que resolve uma discussão.

A segunda: a pasta de backups do servidor **nunca parava de crescer**. Havia uma limpeza automática,
mas ela só enxergava metade dos arquivos — cada cópia do banco deixa dois arquivos auxiliares, e a
limpeza apagava a cópia e **esquecia os dois acompanhantes**. Depois de meses, sobraram **132
arquivos soltos ocupando 44 MB** que não servem para nada e que nenhuma rotina ia recolher. Além
disso, o campo **"Manter Backups (dias)"** da tela de Configurações **não fazia nada**: era um campo
que salvava um número que ninguém lia. Agora ele vale.

**Um problema sério que foi pego antes de existir.** A primeira versão desta mudança lia a
configuração de retenção cedo demais no arranque do servidor — antes de o próprio banco terminar de
se montar. Num servidor já em uso ninguém notaria; **numa instalação nova, o sistema subiria com o
sinal de saúde travado em "falha no banco" para sempre**, e o backup de arranque — que é a rede de
segurança de tudo — nunca rodaria. Foi reproduzido de propósito, num servidor limpo, antes de
existir a correção.

### Antes → Agora

| Antes | Agora |
|---|---|
| O histórico de uma movimentação mostrava **quem** e **quando** | Mostra também **de onde**: endereço de rede e aparelho usado |
| Movimentos criados por dentro do sistema (devolução, retorno de terceiro, estorno) não tinham como registrar origem | Registram igual aos manuais — são **28 caminhos** cobertos de uma vez |
| **Cancelar** uma movimentação gerava um estorno **sem origem** | O estorno também guarda de onde partiu — é o ato que mais se quer rastrear |
| A pasta de backups crescia para sempre: 132 arquivos órfãos, 44 MB, que nenhuma limpeza recolhia | A limpeza recolhe os órfãos, nos dois formatos de nome que existem no disco |
| **"Manter Backups (dias)"** era um campo decorativo — salvava e ninguém lia | O número da tela **vale**: é ele que decide o que a limpeza apaga |
| A limpeza guardava **10 cópias fixas**, sem relação com nenhuma configuração | Guarda pelo prazo que você definir, **nunca menos de 3 cópias** e **nunca mais de 10** |
| Um número inválido no campo (vazio, `0`, `-5`, texto) não tinha tratamento previsto | Cai no padrão de **30 dias** e escreve um aviso no registro do servidor — **nunca apaga tudo** |

### As regras, com o cenário exato

**1. Uma movimentação normal passa a registrar de onde veio.**
Vá em **Almoxarifado → Movimentações**, registre uma entrada ou saída qualquer. Depois vá em
**Almoxarifado → Auditoria**, filtre **Entidade = Movimentação** e expanda a linha mais recente.
Além das linhas de sempre (`material_id`, `tipo`, `quantidade`, `saldo_posterior`), aparecem agora:

| Campo | De | Para |
|---|---|---|
| `ip` | — | `192.168.1.34` |
| `user_agent` | — | `Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 …` |

O **De** aparece como `—` porque movimentação é um ato de criação: não havia estado anterior. Isso
já era assim para todos os outros campos.

**2. O endereço é o de quem clicou, não o do servidor.**
Este é o detalhe que faz a diferença em produção. Quando o sistema roda atrás de um servidor de
entrada (que é o caso da GMP), o registro ingênuo gravaria `127.0.0.1` em **todas** as linhas — o
endereço do próprio servidor, inútil. A regra implementada lê a cadeia de encaminhamento e guarda o
**primeiro** endereço, que é o do computador da pessoa. Se houver um servidor intermediário, ele
aparece numa linha separada, `ip_proxy`. Quando não há intermediário nenhum, a linha `ip_proxy`
**não aparece** — e isso é de propósito: gravá-la vazia encheria toda movimentação com uma linha
`ip_proxy: — → —` que não informa nada.

**3. Cancelar uma movimentação também registra de onde veio.**
Em **Almoxarifado → Movimentações**, cancele um movimento (é preciso informar a justificativa — o
sistema recusa sem ela, com a mensagem literal *"Justificativa obrigatória para cancelamento"*).
Volte à **Auditoria**: aparecem **duas** linhas novas, a do cancelamento e a do **estorno**, e as
duas trazem `ip` e `user_agent`. O estorno é criado por um caminho diferente do resto do sistema, e
ficaria de fora se ninguém tivesse ido atrás dele.

**4. O campo "Manter Backups (dias)" passou a valer.**
Vá em **Configurações → aba Backup**. A tela tem três campos: **Backup Automático**
(Ativado/Desativado), **Frequência** (Diário/Semanal/Mensal) e **Manter Backups (dias)**. Mude o
terceiro para, por exemplo, `15` e salve. A partir do próximo arranque do servidor, cópias com mais
de 15 dias são apagadas — **respeitando duas travas**: as **3 mais recentes nunca saem**, mesmo que
tenham anos (é a cópia mais nova que o download de backup usa como salvação), e **no máximo 10
cópias ficam**, mesmo que todas sejam de ontem.

> ⚠️ **Os outros dois campos dessa aba continuam decorativos.** Ver a letra **C** — é importante,
> porque a tela dá a impressão de que os três funcionam.

**5. Número inválido não apaga nada.**
Se alguém salvar o campo vazio, com `0`, com `-5` ou com texto, o sistema **não** entende como
"apagar tudo": usa o padrão de **30 dias** e escreve **um** aviso no registro do servidor. Foi
testado com os oito valores possíveis de lixo.

### Roteiro de teste manual (10 minutos)

1. Entre como **Administrador**.
2. **Almoxarifado → Movimentações** → registre uma **entrada** de qualquer material.
3. **Almoxarifado → Auditoria** → filtro **Entidade = Movimentação** → expanda a linha mais recente
   → confira as linhas `ip` e `user_agent`.
4. Volte a **Movimentações**, **cancele** o movimento que acabou de criar (informe a justificativa).
5. **Auditoria** de novo → aparecem **duas** linhas novas, e as duas têm `ip` e `user_agent`.
6. **Almoxarifado → Devoluções** → registre uma devolução → **Auditoria** → a linha de entrada da
   devolução **também** tem `ip`. (Este é o caminho "por dentro do sistema", que antes ficaria de
   fora.)
7. **Configurações → aba Backup** → mude **Manter Backups (dias)** e salve. O efeito só aparece no
   próximo arranque do servidor — não há botão de "limpar agora".

### O que esta etapa NÃO cobre (é decisão declarada, não esquecimento)

- **Não há tela para consultar a origem.** O `ip` e o `user_agent` aparecem dentro da linha
  expandida da Auditoria, misturados aos outros campos. Não existe filtro "movimentações vindas
  deste endereço" nem alerta de "acesso de local incomum". Guardar o dado é o pré-requisito; usá-lo
  é outra etapa.
- **A origem não foi para trás.** Movimentações registradas antes desta etapa continuam sem `ip` e
  sem `user_agent` — o dado não existia e não há de onde inventá-lo. Só os atos novos trazem.
- **Nenhum outro tipo de registro ganhou origem.** Requisição, recebimento, inspeção e cadastro
  continuam sem `ip`. A movimentação foi escolhida porque é onde o estoque muda de valor.
- **Não existe botão "limpar backups agora".** A limpeza roda no arranque do servidor. Mudar o
  número na tela não apaga nada na hora.
- **Os uploads (fotos e anexos) não têm política de expurgo.** Eles **entram** no download de
  backup, então estão salvos; o que não existe é regra para apagar os antigos. Só o banco é podado.
- **Backup Automático e Frequência continuam sem efeito** — letra **C**.
- **Registrar de onde veio não é o mesmo que impedir.** O sistema anota a origem; ele não recusa
  acesso por endereço de rede, nem restringe horário. Isso não foi pedido e não foi feito.


## Etapa 26 — Uma lista de categorias só, e ela é da GMP (2026-08-29)

Quando alguém cadastra um material, escolhe uma **categoria**. Até agora essa lista de categorias
era genérica — `CONSUMÍVEL`, `FERRAMENTA`, `EPI`, `ELÉTRICO`, `HIDRÁULICO` — e estava **escrita
dentro do sistema**, em três telas diferentes, sem jeito de mudar sem programador. Só que existe
no banco, desde o começo, um catálogo de **27 categorias de metalúrgica** — `Aço carbono`,
`Aço inox`, `Chapas`, `Tubos`, `Perfis estruturais`, `Componentes usinados`, `Rolamentos`,
`Elementos de fixação`, `Solda e consumíveis` — feito para a GMP. **Ele estava intacto e sem uso
nenhum:** as duas listas não tinham uma única categoria em comum, e o sistema mostrava a errada.

O efeito prático disso era pior do que parece. O filtro de categoria da tela de Materiais
oferecia `EPI` — e nenhum material do banco estava como `EPI`, então o filtro devolvia **zero**.
Zero parece estoque vazio, não filtro inútil. E o formulário tinha um defeito mais insidioso:
quando um material já estava classificado com algo fora da lista, a tela **mostrava a primeira
opção da lista** enquanto o cadastro continuava guardando o valor certo — a pessoa via `Chapas`
na tela, salvava, e o que estava no banco era `CONSUMÍVEL` o tempo todo. **A tela mentia sobre o
que estava gravado**, e sem deixar rastro de erro.

Agora a lista é uma só, vem do catálogo da GMP, e **virou cadastro**: dá para criar, renomear,
desativar e reativar categoria em Configurações, sem programador.

> ⚠️ **Antes de apresentar esta etapa, leia a A6, a A7 e o furo C33.** A A6 é a consulta que diz
> em que categorias os materiais da GMP estão hoje — **os materiais existentes não foram
> remexidos**, de propósito —, a A7 procura nomes repetidos que impedem uma trava nova de valer, e
> o C33 explica por que o filtro de categoria devolve zero até o acervo ser remapeado.

### Antes → Agora

| Antes | Agora |
|---|---|
| A lista de categorias estava **escrita no código**, repetida em **três telas** — mudar exigia programador | Vem do **catálogo do cliente**, de um lugar só; as três telas leem a mesma fonte |
| O catálogo de **27 categorias de metalúrgica** existia no banco e **nenhuma tela o usava** | É a lista que aparece no cadastro de material e nos dois filtros |
| **Não havia tela** para criar, renomear ou desativar categoria | **Configurações → aba Categorias**: criar, renomear, desativar e **reativar** |
| Material com categoria fora da lista **aparecia com a primeira opção da lista** enquanto o banco guardava outra coisa | Aparece com a **categoria que está gravada**, marcada como *(fora de catálogo)* |
| Material novo já nascia com `CONSUMÍVEL` preenchido, fora do catálogo | Nasce **vazio**, com a opção `Selecione…` — classificar virou escolha consciente |
| Salvar material **sem** escolher categoria gravava `OUTROS` por conta do servidor, sem aparecer na tela | O sistema **recusa** salvar sem categoria e diz qual campo falta |
| Dava para cadastrar **duas categorias com o mesmo nome** | Recusado, com a mensagem do servidor na tela |
| Mexer no catálogo **não deixava rastro** (a tabela nunca foi editável) | Criar, renomear e desativar aparecem na **Auditoria**, com o rótulo **Categoria** |

### As regras, com o cenário exato

**1. A lista do cadastro de material é a do catálogo, e ela é uma só.**
Vá em **Almoxarifado → Materiais → Novo Material**, seção *Classificação*, campo **Categoria**.
A lista que abre é a do catálogo (`Aço carbono`, `Aço inox`, `Chapas`…), em ordem alfabética.
Faça o mesmo em **Almoxarifado → Conferência de Estoque → Nova Conferência** (filtro de
categoria) e no filtro de categoria da própria lista de **Materiais**: são as mesmas opções, nas
três telas. **Nenhuma delas tem mais lista escrita por dentro** — se você criar uma categoria na
aba Categorias, ela aparece nas três.

**2. Categoria virou cadastro, em Configurações → aba Categorias.**
A aba abre com o texto: *"Classificação livre dos materiais (ex.: Consumível, Aço carbono).
Desativar não apaga: a categoria sai das listas de novos materiais e continua valendo nos que já
a usam."* Clique em **➕ Nova Categoria**, digite um nome e salve: aparece *"Categoria criada!"*.
A tabela lista **Nome**, **Situação** (etiqueta verde `Ativa` ou cinza `Inativa`) e as ações.
Só quem tem perfil **Administrador** do módulo consegue criar, renomear ou desativar — os outros
sete perfis tomam recusa do servidor. **Ler a lista continua liberado a todo mundo**, porque o
formulário de material precisa dela para exibir a categoria do item.

**3. Material novo não sai mais sem categoria — e o sistema diz isso.**
Em **Novo Material**, o campo Categoria começa **vazio**, mostrando `Selecione…`. Preencha o
resto e clique em salvar sem escolher categoria: o sistema recusa com a mensagem literal
*"Selecione a categoria do material"*.
**Este cenário é o que mais mudou por baixo.** Antes, o campo já vinha com `CONSUMÍVEL`
preenchido; e se ele fosse deixado vazio, o **servidor** gravava `OUTROS` por conta própria —
uma categoria que nunca apareceu na tela e que não está no catálogo. As duas saídas produziam
material fora do catálogo sem ninguém escolher nada.

**4. Material antigo abre com a categoria que está gravada, marcada como fora de catálogo.**
Abra para edição um material cadastrado antes desta etapa (os da GMP estão como `CONSUMÍVEL`).
O campo Categoria mostra **`CONSUMÍVEL (fora de catálogo)`** — o valor real, com o aviso de que
ele não está no catálogo atual. Salve sem tocar no campo: **continua `CONSUMÍVEL`**.
**Descartado bloquear o salvamento nesse caso**: impediria corrigir o preço de um material só
porque a categoria dele é antiga. E é o cenário que corrige a mentira descrita na abertura — antes
esta mesma tela mostrava `Aço carbono` (a primeira da lista) para um material gravado como
`CONSUMÍVEL`.

**5. Duas categorias com o mesmo nome são recusadas.**
Na aba Categorias, crie `Chapas` (ou tente criar uma que já exista). O sistema recusa e mostra a
mensagem **do servidor**, literal: *"Já existe uma categoria com este nome"*. Vale igual ao
**renomear**: renomear uma categoria para um nome já ocupado dá a mesma mensagem. Espaços antes e
depois não escapam — `" Chapas "` colide com `Chapas`. Salvar com o nome vazio dá *"Nome é
obrigatório"*.

**6. Desativar não apaga, e dá para reativar.**
Clique no ícone de lixeira de uma categoria. O sistema pergunta, literalmente:
*"Desativar a categoria "Chapas"? Ela sai das listas de novos materiais, mas os que já a usam
continuam com ela."* Confirme: aparece *"Categoria desativada"*, a linha fica com a etiqueta
`Inativa` e o botão **Reativar** no lugar dos outros dois. A categoria **some** da lista do
cadastro de material — e **os materiais que já a usavam continuam com ela**, e continuam achando
pela busca. Clique em **Reativar**: *"Categoria reativada"*, e ela volta às listas.

**7. Renomear NÃO reclassifica os materiais — e a tela avisa antes.**
Clique no lápis de uma categoria. **Só no renomear** (não no criar) aparece um aviso amarelo:
*"Renomear **não reclassifica** os materiais: os que já usam esta categoria continuam gravados
com o **nome antigo**. Para movê-los, edite cada material."* Salve: a confirmação também diz —
*"Categoria renomeada! Os materiais já classificados mantêm o nome antigo."*
**É o comportamento de hoje e está declarado, não escondido.** Mudar isso é a decisão **B58**.

**8. Mexer no catálogo deixa rastro.**
Depois de criar, renomear e desativar uma categoria, vá em **Almoxarifado → Auditoria** e filtre
**Entidade = Categoria**. Aparecem as três linhas — Criação, Edição e Exclusão —, com quem fez, e
a linha da edição mostra o **de/para** do nome. O filtro passou a **oferecer** "Categoria" na
lista de entidades: antes desta etapa esse cadastro não tinha como ser alterado, então não havia
o que auditar.

### Roteiro rápido para demonstrar ao vivo (8 minutos)

1. Entre como **Administrador**.
2. **Configurações → aba Categorias** → veja as 27 do catálogo → **➕ Nova Categoria** → crie
   `Perfis de alumínio` → *"Categoria criada!"*.
3. Tente criar `Perfis de alumínio` de novo → *"Já existe uma categoria com este nome"*.
4. **Materiais → Novo Material** → campo **Categoria** → a categoria recém-criada **está lá**
   (sem recarregar a página) → salve sem escolher nada e veja *"Selecione a categoria do
   material"* → escolha `Perfis de alumínio` e salve.
5. Abra para edição um material **antigo** → o campo mostra `CONSUMÍVEL (fora de catálogo)`.
6. Volte à aba Categorias → lápis em `Perfis de alumínio` → leia o **aviso amarelo** → renomeie
   para `Perfis de alumínio extrudado` → *"Categoria renomeada! Os materiais já classificados
   mantêm o nome antigo."* → abra o material do passo 4: ele mostra **o nome antigo, marcado como
   fora de catálogo**. É a B58 ao vivo.
7. Lixeira na categoria → leia a pergunta → confirme → ela fica `Inativa` → **Reativar**.
8. **Auditoria** → **Entidade = Categoria** → as linhas de Criação, Edição e Exclusão.

### O que esta etapa NÃO cobre (é decisão declarada, não esquecimento)

- **Nenhum material foi reclassificado.** Quem estava como `CONSUMÍVEL` continua como
  `CONSUMÍVEL`. **Descartado** um `UPDATE` de mapeamento no deploy: é irreversível, mexe em dado
  do cliente sem ele pedir, e seria baseado numa medição do banco de desenvolvimento, que não é o
  de produção. **A consulta é a A6**, e a decisão é sua.
- **Renomear não propaga** (regra 7) — é a **B58**.
- **A categoria continua sendo um texto dentro do cadastro do material**, não um vínculo com a
  linha do catálogo. É o que tornaria a B58 desnecessária, e é mudança de estrutura do banco com
  risco próprio: etapa dedicada.
- **A lista genérica não sumiu do histórico.** Materiais antigos seguem com o valor que têm, e
  `CONSUMÍVEL` vai continuar aparecendo nas telas de quem os abre — marcado como fora de catálogo.
- **Não há reclassificação em massa pela tela.** Para mover materiais de uma categoria para outra,
  ou se edita material por material, ou se roda o `UPDATE` da A6.
- **As 27 categorias do catálogo não foram revisadas com vocês.** Elas estavam no banco desde o
  começo e foram assumidas como certas. Se alguma sobrar ou faltar, agora dá para arrumar pela
  tela — o que antes não dava.

## Etapa 27 — A divergência dimensional deixa de ser opinião e vira medição (2026-08-29)

Quando um material chega e vai para inspeção, o inspetor preenche um formulário com cinco caixas
de "problemas identificados". Uma delas é **Divergência dimensional** — e ela é, hoje, só uma
caixa que alguém marca. Não há em lugar nenhum do sistema o que a peça **deveria** medir, nem o
que ela **mediu**, nem com que instrumento. Se o inspetor esquecer de marcar, a divergência
desaparece do registro; se marcar por engano, ninguém consegue conferir. **É um julgamento sem
prova por trás.**

Esta etapa cria o **plano de inspeção**: por material, uma lista de características a medir
(*Diâmetro externo*, *Comprimento*, *Espessura*…), cada uma com **valor nominal** e os **dois
desvios** que a tolerância admite. Com o plano, a inspeção passa a poder registrar as **medidas de
verdade** — e a partir daí a divergência dimensional **não é mais marcada, é calculada**: se
alguma medida sai da tolerância, o sistema liga a divergência sozinho; se todas entram, ele a
desliga, mesmo que o inspetor tenha marcado. Junto vem a amarra com o cadastro de instrumentos:
**paquímetro com calibração vencida não mede** — a medida é recusada, não aceita com ressalva.

> ⚠️ **Esta etapa é de fundação, e não tem tela.** O plano existe, a régua existe, as medidas são
> gravadas e a divergência é derivada — **mas o formulário de Inspeções ainda não tem os campos de
> medida**, e quem inspecionar pela tela continua marcando a caixa à mão exatamente como antes.
> **Leia o furo C36 antes de apresentar** (decidir inspeção não deixa rastro na Auditoria — é
> anterior a esta etapa e continua aberto). **Os furos C34 e C35 desta etapa foram FECHADOS pela
> Etapa 29**, que deu tela às medidas e leitura às inspeções decididas; a **B60**, que era o alerta
> para essa etapa, foi cumprida em 2 de 3 partes. Nada do que existe hoje mudou de comportamento:
> quem não usa plano nenhum não vê diferença nenhuma.

### Antes → Agora

| Antes | Agora |
|---|---|
| **Divergência dimensional** era uma caixa marcada à mão, sem número por trás | Quando há medidas, ela é **derivada**: fora da tolerância liga sozinha, dentro desliga — e a marcação manual é **ignorada** |
| Não existia lugar nenhum para dizer **o que medir** num material | **Plano de inspeção por material**: N características, cada uma com nome, unidade, valor nominal e dois desvios |
| Não existia lugar nenhum para guardar **quanto mediu** | Cada medida fica gravada com o valor medido, o veredito (conforme/não conforme) e **o instrumento usado** |
| O cadastro de instrumentos com calibração (que existe desde as Ferramentas) **não conversava** com a inspeção | Medir com instrumento de **calibração vencida** é recusado, nomeando o instrumento |
| — | Editar o plano depois **não reescreve** inspeção antiga: a medida guarda a tolerância **do dia em que foi feita** |
| — | Criar, editar e desativar característica do plano aparece na **Auditoria**, com o rótulo **Plano de inspeção** |
| Sem plano de inspeção, a inspeção funcionava assim | **Continua exatamente igual** — sem medidas, a caixa manual segue valendo |

### As regras, com o cenário exato

**Aviso de método:** esta etapa **não tem tela**, então os cenários abaixo não são cliques — são
chamadas de API. Eles ficam aqui porque são o contrato que a tela vai consumir, e porque as
mensagens literais são as que vão aparecer nela.

**1. A tolerância tem DOIS desvios, e eles têm SINAL.**
Uma característica é `valor_nominal` + `desvio_inferior` + `desvio_superior`, e os desvios são
**números com sinal**, não "quanto para cada lado". O simétrico continua sendo `-0,05 / +0,05`.
Mas o caso que só o sinal representa é o **unilateral deslocado**, normal em usinagem de eixo
(ISO 286): `+0,005 / +0,021` — os **dois** limites acima do nominal. Nesse plano, uma peça no
nominal exato **reprova**, e é isso que a tolerância quer dizer. Desvio inferior maior que o
superior é recusado: *"O desvio inferior não pode ser maior que o superior"*.

**2. A peça no limite EXATO da tolerância é conforme — e isso custou uma correção de projeto.**
Nominal 0,7 com desvio ±0,1: uma peça de 0,800 está **dentro**. Parece óbvio, e não é: o
computador calcula `0,7 + 0,1` como `0,7999999999999999`, e uma régua ingênua **reprovaria a peça
no limite exato**. A revisão desta etapa varreu **50.000 pares** de nominal/tolerância com a
medida exatamente no limite e mediu **6.132 reprovações falsas — 12,3%**. Com a divergência agora
sendo derivada, cada uma delas ligaria a divergência dimensional sozinha: **a etapa fabricaria a
divergência que ela existe para medir**. A régua usa uma folga de `0,000001` mm, que é três ordens
de grandeza menor que o melhor instrumento do cadastro (comparador, 0,0001 mm) — ou seja, ela nunca
alcança uma medida real, só o erro do próprio cálculo.

**3. A divergência dimensional é derivada, e a derivação VENCE o que o inspetor marcou.**
Plano: *Diâmetro externo*, nominal 10, desvios ±0,1 (faixa 9,9 a 10,1).
- Inspeção com medida **10,5** e **nenhuma caixa marcada** → o registro sai com **divergência
  dimensional ligada**.
- Inspeção com medida **10,05** e a caixa **marcada** → o registro sai com a divergência
  **desligada**.
- Três características, uma fora → **liga**, e as **três** medidas ficam gravadas, não só a que
  reprovou.
- **Inspeção sem medida nenhuma → nada muda**: a caixa manual continua valendo como sempre valeu.
**Descartado** manter as duas fontes lado a lado: seriam duas verdades para o mesmo fato, e a
manual venceria por ser a que a tela mostra.

**4. Instrumento com calibração vencida não mede.**
Informar um instrumento que **exige calibração** e não tem calibração vigente recusa a inspeção
inteira, com a literal: *"Ferramenta com calibração vencida ou sem calibração registrada
(⟨nome do instrumento⟩)"*. Vale igual para calibração **vencida** e para instrumento **nunca
calibrado** — a mesma frase cobre os dois de propósito, porque no caso da recusa não existe data
para prometer. Instrumento inexistente ou desativado responde *"Ferramenta não encontrada"*.
**Descartado** apenas avisar: medida feita com paquímetro descalibrado não é dado, é ruído com
aparência de dado — e ficaria gravada como se fosse prova.

**5. Informar o instrumento é OPCIONAL.**
Medida sem instrumento declarado é aceita e fica gravada com o campo vazio. A regra é *"instrumento
**declarado** e vencido não mede"*, não *"toda medida tem instrumento"* — ver a **B61**, que é a
decisão e o caminho de volta.

**6. A medida guarda a tolerância do DIA, não a de hoje.**
Grave uma inspeção com o plano em nominal 25. Depois **edite o plano** para nominal 30. Releia a
inspeção antiga: ela continua dizendo **25**, com os desvios antigos e o veredito antigo. Editar o
plano **não reescreve a história**. É a mesma razão pela qual renomear uma categoria não
reclassifica o acervo.

**7. Medida sem característica, ou de outro material, é recusada.**
Característica inexistente: *"Característica de plano de inspeção não encontrada: ⟨id⟩"*.
Característica que pertence ao plano de **outro** material: *"A característica "⟨nome⟩" não
pertence ao plano de inspeção deste material"*. Guardar "diâmetro = 12,4" sem uma característica
que diga o que era esperado é guardar número sem significado.

**8. Número escrito com vírgula é recusado — e este é o cenário que mais quase deu errado.**
`12,4` (a vírgula decimal de um teclado brasileiro) é recusado com *"Valor medido inválido para
"⟨característica⟩": informe um número (use ponto decimal)"*, e **nada** é gravado.
A intuição — e o projeto desta etapa, por escrito — dizia que um valor assim faria a característica
**reprovar**. A medição mostrou o contrário: ele **aprovava**. A peça saía **conforme**, com o
valor medido **vazio** e a divergência **apagada**. Não seria falsa reprovação, seria falsa
**aprovação com a prova em branco** — bem pior. Daí a recusa explícita.

**9. Nada se move antes de tudo estar validado.**
Todas as recusas acima acontecem **antes** de o sistema mexer no saldo. Uma inspeção recusada por
característica errada ou instrumento vencido deixa o material **exatamente como estava**, ainda
retido, ainda na fila. Foi o achado mais pesado da revisão: no lugar "natural" — junto da gravação
das medidas — cada uma dessas recusas seria um erro devolvido **depois** de o saldo já ter se
movido.

**10. Duas características com o mesmo nome no mesmo material são recusadas.**
*"Já existe esta característica no plano deste material"*. Sem isso, um material teria dois
"Diâmetro externo" com nominais diferentes e a medida ficaria ambígua. Desativar libera o nome:
dá para desativar a característica errada e recriá-la certa.

**11. Quem mexe no plano é a Qualidade e a Engenharia — não só o Administrador.**
Criar, editar e desativar característica exige a permissão nova **Gerenciar plano de inspeção**,
que é de **Administrador, Qualidade e Engenharia**. **Descartado** usar a permissão de
*Configurar*, que é só do Administrador: a Qualidade não poderia cadastrar o que ela mesma vai
medir, nem a Engenharia definir a tolerância que ela especifica. **Ler** o plano continua liberado
a qualquer usuário do módulo — quem inspeciona precisa saber o que medir. **O Almoxarife ficou de
fora do gerenciamento de propósito** (ele inspeciona; quem especifica tolerância é engenharia ou
qualidade), e isso é reversível numa linha se você quiser diferente.

**12. Mexer no plano deixa rastro.**
Em **Almoxarifado → Auditoria**, filtro **Entidade = Plano de inspeção**: aparecem a Criação, a
Edição (com o de/para do nominal) e a Exclusão, com quem fez. **A decisão de inspeção continua sem
rastro na Auditoria** — nunca teve, e ampliar isso é etapa própria (furo **C36**).

### O que esta etapa NÃO cobre (é decisão declarada, não esquecimento)

- **A TELA.** O formulário de Inspeções não ganhou campos de medida. Quem inspeciona pela tela
  segue marcando a caixa **Divergência dimensional** à mão, e ela segue valendo, porque sem
  medidas nada é derivado. Furo **C34**.
- **Ler as medidas gravadas.** Não há tela que as mostre. A fila de Inspeções só traz o que
  **ainda não foi decidido**, e rever uma inspeção concluída já não tinha caminho no produto antes
  desta etapa. Furo **C35** — e é a terceira vez que este módulo produz um dado calculado, gravado
  e sem quem leia; está escrito para não virar a quarta em silêncio.
- **Plano por família.** O plano é **por material**. Herdar de família é a **B59**.
- **Não conformidade formal** (número, ação, responsável, fluxo próprio) e **liberação sob desvio
  autorizado** — são os outros dois itens em aberto da inspeção, e cada um é um fluxo inteiro.
- **Anexos** (relatório dimensional, fotos) — dependem do módulo de anexos, que é item próprio.
- **Encaminhamento com status** (saber se a devolução/análise/substituição já foi executada) —
  segue como a intenção registrada no momento da reprovação.
- **Reprovar por lote continua não ligado à inspeção** — pendência antiga, não tocada aqui.
- **Nenhum plano foi cadastrado.** As tabelas nascem vazias; enquanto ninguém cadastrar
  característica nenhuma, o sistema se comporta exatamente como antes desta etapa.

## Etapa 28 — A separação ganha dono, e quem separou não confere (2026-08-29)

Quando falta material na caixa de uma requisição, a primeira pergunta do galpão é **"quem
separou?"** — e até esta etapa o sistema **não sabia responder**. A separação gravava as
quantidades e nada mais: nem quem, nem quando, nem rastro na Auditoria. E sem saber quem separou,
a regra que a spec pede desde o começo — *"segunda conferência: quem confere não pode ser quem
separou"* — **não tinha como existir**, porque não havia de onde tirar o separador para comparar.

Esta etapa faz três coisas. **(1)** Cada rodada de separação passa a ser registrada com **quem,
quando e quais itens** — e como a separação pode acontecer em várias rodadas por pessoas
diferentes, cada rodada é uma linha própria: ninguém apaga a rodada de ninguém. **(2)** Nasce a
**segunda conferência**: outra pessoa do almoxarifado confere a caixa antes de ela sair, e o
sistema **recusa quem aparece em qualquer rodada** de separação daquela requisição. **(3)** Quando
a caixa tem **material crítico**, a conferência deixa de ser opcional: **sem ela, o material não
sai** — nem pela liberação para retirada, nem pela entrega direta. É a primeira resposta concreta à
**B57**.

> ⚠️ **Isto muda o dia a dia de um almoxarifado que trabalha com uma pessoa só.** Material
> marcado como **crítico** passa a exigir **duas pessoas com perfil Almoxarife (ou Administrador)**
> para sair. Material comum continua saindo como sempre saiu. Leia a **B62** (é a régua, e é
> reversível numa linha) e o furo **C38** antes de apresentar.

### Antes → Agora

| Antes | Agora |
|---|---|
| A separação gravava as quantidades e **nada mais** — não existia "quem separou" em lugar nenhum | Cada rodada de separação fica registrada com **quem, quando e quais itens**; o detalhe da requisição mostra a lista **"Separação (N)"** |
| Separar e liberar para retirada **não apareciam na Auditoria** (confirmar recebimento e rejeitar valor apareciam, no mesmo fluxo) | **Separação**, **Conferência da separação** e **Liberação para retirada** aparecem em **Almoxarifado → Auditoria**, na entidade *Requisição* |
| Não existia segunda conferência | Botão **"Conferir separação"** no detalhe da requisição em separação; **quem separou vê o botão cinza** e, se insistir pela API, toma recusa |
| Material crítico saía como qualquer outro | Com crítico **ainda na caixa** (separado e não entregue), **Liberar para Retirada** e **Confirmar Entrega** ficam cinza até a conferência — e o servidor recusa mesmo sem a tela |
| Depois de uma entrega parcial, dava para entregar o resto do item **sem ter separado** (regra da Etapa 3) | Para material **crítico**, não mais: só sai o que foi separado e conferido. Material **comum** mantém a regra antiga |
| Um erro num item do formulário de separação deixava os **outros itens gravados pela metade**, sem ninguém saber | Ou grava **tudo**, ou **nada**: o sistema valida todos os itens antes de escrever o primeiro |
| — | Uma **rodada nova** de separação **apaga a conferência** (a caixa mudou, precisa ser conferida de novo) — e a conferência apagada fica guardada na Auditoria |

### As regras, com o cenário exato

**Para os cenários você precisa de DOIS usuários com perfil Almoxarife** (ou um Almoxarife e um
Administrador), porque a regra central é justamente que uma pessoa só não fecha o ciclo. Chame-os
de **A** e **C**.

**1. Toda rodada de separação tem dono.**
Como A, abra uma requisição aprovada em **Almoxarifado → Requisições**, clique **Iniciar
Separação**, informe quantidades e confirme. No detalhe aparece o bloco **Separação (1)** com
*A · dia/hora · N itens*. Clique **Ajustar Separação** e separe mais um item: vira **Separação
(2)**, a primeira linha continua lá. Em **Auditoria**, filtre Entidade = *Requisição*: duas
linhas **Separação**, com quem e o que.

**2. Quem separou não confere — em NENHUMA rodada.**
Ainda como A, o botão **Conferir separação** aparece **cinza**, com a explicação *"Você separou
esta requisição — a segunda conferência precisa ser feita por outra pessoa"*. Se A forçar pela
API, a recusa é: *"Quem separou não confere: você registrou a rodada de separação #12 desta
requisição. A segunda conferência tem de ser de outra pessoa."* — e isso vale para quem separou na
**primeira** rodada, não só na última (foi a decisão de desenho da etapa: guardar só "o último
separador" deixaria o primeiro conferir a própria caixa).

**3. Outra pessoa confere, e a conferência aparece.**
Entre como C, abra a mesma requisição, clique **Conferir separação**: *"Separação conferida!"* e a
linha **Conferida por C em dia/hora**. Clicar de novo (ou outra aba) → *"Esta requisição não pode
ser conferida agora: já foi conferida, saiu de EM_SEPARACAO, ou você separou uma rodada dela —
outra pessoa (ou outra aba sua) agiu enquanto esta tela estava aberta. Recarregue e confira o
estado atual."* A garantia contra o clique duplo simultâneo é do banco, não da tela — o mesmo
molde da dupla aprovação do sucateamento.

**4. Com material crítico na caixa, nada sai sem a conferência.**
Requisição com um material marcado **crítico**: como A, separe-o. Os botões **Liberar para
Retirada** e **Confirmar Entrega e Baixar Estoque** ficam cinza com *"Esta requisição tem
material crítico separado e precisa da segunda conferência antes de sair"*. Pela API, as duas
rotas recusam com *"Esta requisição tem material crítico separado e ainda não passou pela
segunda conferência. Peça a outra pessoa do almoxarifado para conferir a separação antes de
liberar ou entregar."* — e o saldo **não se move**. Depois de C conferir, os dois botões voltam.
**Sem material crítico, nada disso aparece**: a conferência existe, é opcional e fica registrada.

**5. "Crítico na caixa" é separado E ainda não entregue.**
Crítico já **totalmente entregue** não trava a entrega do resto da requisição. E crítico
**aguardando estoque** (pedido, mas com zero separado) também não — ele não está na caixa. Isto
foi um achado da revisão: a primeira régua contava "separado alguma vez" e travava a entrega de
material comum por um crítico que já tinha saído.

**6. Material crítico só sai na quantidade separada.**
Desde a Etapa 3, depois de uma entrega parcial o item podia ser entregue até o pendente **sem
nova separação**. Para material **crítico** isso furava a conferência: 1 separado e conferido, 9
entregues sem ninguém olhar. Agora: *"Chapa 3mm: material crítico só sai depois de separado e
conferido — 9 excede o separado ainda não entregue (0). Separe o restante e peça a segunda
conferência."* Material **comum** mantém a regra da Etapa 3, de propósito.

**7. Rodada nova apaga a conferência.**
Depois de C conferir, se A separar mais qualquer coisa, a linha **Conferida por** some e os
botões de saída voltam a ficar cinza (se houver crítico). A conferência apagada **não some do
mundo**: a linha de Auditoria da rodada guarda *quem tinha conferido*. Isso também é o que fecha
a brecha "separar e conferir ao mesmo tempo": em qualquer ordem, o estado final nunca é "conferida
por A com rodada de A". **Ajustar Separação sem mudar quantidade nenhuma** não apaga a
conferência — a caixa não mudou.

**8. Ou tudo, ou nada.**
Formulário de separação com um item válido e outro acima do máximo: a recusa vem (*"...não é
possível separar 20 KG. Máximo: 12..."*) e **nenhum** dos itens é gravado. Antes desta etapa, o
item válido ficava gravado e o erro só aparecia depois — e a revisão mostrou que isso deixava
material separado **sem rodada**, o que permitia à mesma pessoa separar, conferir e entregar.

**9. Perfil.**
Conferir exige a permissão nova **Conferir separação**, de **Administrador e Almoxarife** — ação
própria (não pega carona em *separar e emitir*) para poder ser restringida depois sem reescrever
nada. Produção/Engenharia/Consulta/Qualidade/Gestor/Compras tomam recusa de permissão antes de
qualquer regra. **Administrador que separou também não confere** — a barreira é por identidade,
não por perfil.

### O que esta etapa NÃO cobre (é decisão declarada, não esquecimento)

- **Lista de separação como entidade** (agrupar itens de várias requisições), **rota de picking**
  e **kits** — continuam sendo o "picking" propriamente dito, e dependem de endereçamento que a
  feature 02 ainda não fecha.
- **Localizações "Reservado" / "Kit" / "Aguardando retirada"** — a spec dizia que já existiam;
  **não existem** (corrigido na Fase 0), e criá-las é mudança de contrato de API.
- **Dupla conferência como máquina de estados** (quais *outras* operações exigem duas
  assinaturas) — a B57 continua aberta para o restante; esta etapa respondeu **a saída de
  material crítico da requisição**.
- **Requisições separadas ANTES desta etapa** não têm rodada — furo **C37**.
- **Divergência de separação com motivo** (separar menos que o pedido exigindo justificativa) —
  item da spec 05 não tocado.

## Etapa 29 — A tela finalmente mede, e a medida finalmente tem quem leia (2026-08-30)

A Etapa 27 construiu a régua inteira por baixo — plano de inspeção por material, tolerância com
sinal, medida gravada com o instrumento usado, divergência dimensional **derivada do número** — e
entregou tudo **sem tela**. Na prática, ficou assim: quem inspecionava pelo sistema continuava
marcando *Divergência dimensional* no olho, e as medidas que a API sabia gravar **não tinham como
ser digitadas nem lidas** em lugar nenhum. Dois furos declarados na época, **C34** e **C35**.

Esta etapa fecha os dois. **(1)** O formulário **Decidir Inspeção** passa a mostrar, quando o
material tem plano cadastrado, **um campo por característica** — com o nominal, a unidade e a
faixa de tolerância já calculada ao lado —, mais o seletor do instrumento usado. **(2)** A caixa
*Divergência dimensional* deixa de ser clicável assim que qualquer medida é preenchida: ela vira
**somente leitura, desmarcada e explicada**, porque quem decide passa a ser o número. **(3)** A
tela de Inspeções ganha a aba **Histórico**: as inspeções já decididas, com quantas medidas cada
uma teve e quantas ficaram fora, e ao clicar na linha a tabela de medidas — característica,
nominal, faixa, medido, conforme e instrumento — com a tolerância **do dia em que foi medido**,
não a de hoje.

> **Nada muda para material sem plano de inspeção cadastrado.** O formulário fica **idêntico** ao
> de antes, sem bloco de medidas e sem chamada nova. Como o cadastro de plano ainda é por API
> (**D**), na prática hoje o galpão inteiro continua vendo a tela de sempre — até alguém cadastrar
> o primeiro plano.

### Antes → Agora

| Antes | Agora |
|---|---|
| O formulário de decisão **não tinha campo de medida** — a régua da Etapa 27 só era alcançável por API | Bloco **Medidas do plano** no formulário, um campo por característica ativa, com *nominal* e *faixa* escritos ao lado |
| A caixa *Divergência dimensional* era clicável **mesmo quando o servidor ia ignorá-la** | Com ≥1 medida preenchida ela fica **desabilitada e desmarcada**, com o texto *"Derivada das medidas ao salvar — fora da tolerância liga sozinha"*. Apagou as medidas, ela volta a ser clicável **e volta marcada se estava** |
| Não havia como informar **com que instrumento** se mediu, pela tela | Seletor de instrumento por medida, opcional (*"— sem instrumento —"*); **instrumento com calibração vencida aparece na lista, rotulado e desabilitado** |
| **Nenhuma tela lia inspeção decidida** — a fila só mostra o que ainda não foi decidido | Aba **Histórico** na tela de Inspeções: decididas em ordem da mais recente, com material, quantidades, problemas, responsável e a contagem de medidas |
| As medidas gravadas **não apareciam em lugar nenhum** — só por consulta ao banco | Clicar na linha do Histórico abre a tabela de medidas daquela inspeção, com a tolerância **congelada no ato** |
| O aviso de sucesso dizia sempre *"Inspeção registrada!"* | Quando houve medidas, ele diz o **resultado da régua**: *"Inspeção registrada! Divergência dimensional: sim (2 medidas)"* |
| A tela chamava-se *Inspeção de Recebimento* e tinha uma lista só | Chama-se **Inspeções**, com as abas **Pendentes** e **Histórico** — o filtro de material vale para as duas |

### As regras, com o cenário exato

**Antes de tudo:** os cenários exigem **um plano de inspeção cadastrado** para o material, e o
cadastro do plano **ainda não tem tela** (é o que falta para a feature ficar 🟢). O roteiro com o
`POST` pronto está no guia de etapas, na seção da Etapa 29.

**1. Sem plano, nada muda.**
Abra **Almoxarifado → Inspeções**, aba *Pendentes*, e decida a inspeção de um material **sem
plano**: o formulário é o de sempre — as cinco caixas de problemas, quantidades, encaminhamento,
observações. Nenhum bloco *Medidas do plano*, nenhuma diferença. É o mesmo compromisso da Etapa
27: quem não cadastrou plano não é afetado.

**2. Com plano, aparece um campo por característica — com a faixa escrita.**
Material com plano de duas características, uma simétrica (`12,3 ±0,1`) e uma unilateral de
usinagem (`10 +0,005/+0,021`). O bloco mostra:
*Diâmetro (mm) — nominal 12.3 · faixa [12.2 ; 12.4]* e
*Furo (mm) — nominal 10 · faixa [10.005 ; 10.021]*.
**Repare na segunda:** a faixa é `nominal + desvio`, **com sinal** — no plano unilateral os dois
limites ficam **acima** do nominal. Ler "desvio inferior" como "menos alguma coisa" daria
`[9.995 ; 10.021]`, que está errado e reprovaria peça boa. A quantidade de casas decimais é a do
plano, não a do JavaScript: sem isso a tela escreveria `12.200000000000001`.
**Característica desativada some do bloco** — o plano só devolve as ativas.

**3. Com medida preenchida, a caixa da divergência trava — e é por isso que ela trava.**
Marque *Divergência dimensional* à mão, e **depois** digite uma medida qualquer. A caixa
**desmarca e fica cinza**, com a explicação ao lado. Abaixo do bloco fica escrito, sempre:
*"Com medidas preenchidas, a divergência dimensional é calculada só pelas características que você
mediu. Divergência em algo que o plano não mede — ou numa característica do plano que você deixou
em branco — vai em Observações."*
Se ela continuasse clicável, aconteceria o que a **B60** previu e a Etapa 26 já teve de consertar
uma vez: o inspetor marca, o servidor **ignora** (com medidas quem manda é o número), a tela
mostra *marcado* e o registro guarda *desmarcado*. **Apague todas as medidas** e a caixa volta a
ser clicável, **e volta marcada** — o que você tinha escolhido não foi jogado fora.

**3b. Mediu uma característica só? A conta é sobre o que você mediu.**
Plano com duas características, e você mede só uma, dentro da tolerância: o sistema conclui
**sem divergência dimensional** — e a caixa que você tinha marcado à mão não vale mais, porque
travou na primeira medida. **Isto precisa ser dito ao inspetor antes de acontecer** (é o furo
**C40**): divergência que ele viu numa característica que **não mediu** tem de ir em **Observações**
— ou, melhor, ele mede aquela característica. **Descartado** travar a caixa só quando todas
estivessem preenchidas: o servidor deriva por **medida**, não por característica, e a tela passaria
a prometer uma régua diferente da que o banco aplica.

**4. Vírgula é recusada, e nada é gravado.**
Digite `12,4` e salve: *"Valor medido inválido para "Diâmetro": informe um número (use ponto
decimal)"*. **O modal continua aberto com o que você digitou**, e nenhuma medida, nenhuma decisão
e nenhum saldo se moveram. A tela **não** converte o número por conta própria — converter faria
`12,4` virar `12` em silêncio, que é o defeito que a Etapa 27 caçou.

**5. Instrumento vencido aparece, mas não dá para escolher.**
No seletor, um paquímetro com calibração vencida aparece como *"Paquímetro digital (PAT-014)
(calibração vencida)"* e **não é selecionável**. Não é a tela que decide: o servidor recusa de
todo jeito (*"Ferramenta com calibração vencida ou sem calibração registrada (Paquímetro
digital)"*) — a tela só evita o erro previsível. Instrumento que **não exige** calibração aparece
normal.

**6. O aviso de sucesso diz o resultado.**
Salvando com duas medidas, uma fora da faixa: *"Inspeção registrada! Divergência dimensional: sim
(2 medidas)"*. Com as duas dentro: *"…: não (2 medidas)"*. Com uma só, o texto flexiona
(*"(1 medida)"*). Sem medida nenhuma, continua *"Inspeção registrada!"* como sempre foi.
**O resultado vem do servidor, não da tela** — ver a B60 abaixo.

**7. A aba Histórico mostra o que foi decidido.**
Clique em **Histórico**: as inspeções decididas, da mais recente para a mais antiga, com data,
material (código, recebimento e NF), *aprovada / reprovada*, os problemas como etiquetas
(*Quantidade*, *Dimensional*, *Certificado*, *Dano*, *Material*) ou **Conforme** quando não houve
nenhum, o responsável e a coluna **Medidas**: `2 (1 fora)`. Quem não teve medida mostra
*"Sem medidas registradas"* e **não abre**. Sem nenhuma inspeção decidida: *"Nenhuma inspeção
decidida ainda."* O **filtro de material** do topo da tela vale também aqui.

**7b. Se o Histórico não carregar, ele diz isso — não finge que está vazio.**
Quando a lista falha (rede fora, sessão expirada), a aba mostra *"Não foi possível carregar o
histórico de inspeções."*, a mensagem que o servidor devolveu e um botão **Tentar de novo**.
**Nunca** mostra *"Nenhuma inspeção decidida ainda."* — isso seria o sistema afirmando que não há
inspeção quando na verdade não conseguiu perguntar. Foi achado da revisão adversarial: o toast
sozinho some em segundos e deixa a tela mentindo.

**8. Clicar na linha abre as medidas — com a tolerância do dia.**
A linha com medidas expande numa tabela: *Característica · Nominal · Faixa · Medido · Conforme ·
Instrumento*, com **Conforme**/**Não conforme** por característica. O valor medido aparece **como
foi digitado**. E o ponto que importa: **mude o plano depois** (renomeie a característica, mude o
nominal) e essa tabela **não muda** — ela mostra o que valia no dia da medição. Isso não é
detalhe de implementação, é o que permite defender a decisão meses depois.

**9. Perfil: ler não exige perfil novo; decidir exige.**
As duas leituras novas (histórico e medidas) são liberadas a **quem consegue abrir a tela** — a
mesma régua que o plano de inspeção e a fila de pendentes já usavam. **Decidir a inspeção
continua exigindo o perfil** (*decidir inspeção*: Administrador, Almoxarife, Qualidade): um
usuário sem perfil abre o Histórico e lê, e toma **403** se tentar decidir. Isso é decisão minha,
reversível numa linha — **B64**.

### O que esta etapa NÃO cobre (é decisão declarada, não esquecimento)

- **Cadastro do plano de inspeção pela tela** — continua só por API. É o maior item do que falta
  para a feature 09 fechar no front, tem gate próprio (`gerenciar_plano_inspecao`) e vira etapa
  própria.
- **Pré-visualizar a divergência enquanto se digita** — a terceira parte da **B60**, e foi
  **descartada de propósito**. Ver a B60 abaixo: calcular a régua na tela duplicaria a régua do
  servidor, e a Etapa 27 mediu que a versão ingênua erra **12,3%** das peças no limite.
- **Fotos, certificado e relatório dimensional anexados** — dependem do módulo de anexos.
- **Reabrir ou corrigir inspeção decidida** — a leitura é **só leitura**; medida errada não tem
  como ser corrigida pela tela (nem tinha antes).
- **Plano herdado da família** (**B59**) — a tela busca o plano **do material**.
- **Não conformidade formal numerada** e **liberação sob desvio autorizado** — os dois fluxos
  próprios que ainda faltam para a feature 09 virar 🟢.

## Etapa 30 — O plano de inspeção sai do `curl` e vira tela (2026-08-31)

A Etapa 27 construiu a régua da tolerância. A Etapa 29 deu à tela os campos de medida e a leitura
das medidas. Faltava a ponta de trás: **cadastrar o plano continuava sendo chamada de API**. Na
prática isso significava que todo o trabalho das duas etapas anteriores era **inalcançável por quem
opera** — sem plano cadastrado, o formulário de inspeção não mostra campo de medida nenhum, e
ninguém no galpão cadastra plano por `curl`.

Agora a lista de **Materiais** tem, em cada linha, o botão **Plano de inspeção**. Ele abre a janela
onde se **cria, edita, desativa e reativa** característica — com a **faixa de tolerância calculada
ao lado enquanto se digita**, que é o que faz o operador enxergar que os desvios têm **sinal**.

> **Esta etapa fecha o ciclo da inspeção dimensional.** Com ela, dá para cadastrar o plano, medir
> na inspeção e ler as medidas depois — tudo por tela, sem tocar em API. **O que ainda falta para
> a inspeção ficar completa** não é tela: é não conformidade formal numerada, liberação sob desvio
> autorizado, anexos e encaminhamento com status.

### Antes → Agora

| Antes | Agora |
|---|---|
| Cadastrar característica do plano era `POST` por `curl` — **ninguém no galpão fazia** | Botão **Plano de inspeção** em cada linha de **Almoxarifado → Materiais** |
| Não havia como ver o plano de um material sem chamar a API | A janela lista as **características ativas** e, num bloco separado, as **inativas** |
| Os desvios com sinal só eram compreensíveis lendo a documentação | A **faixa aparece ao lado do campo enquanto se digita**: `[10.005 ; 10.021]` |
| Desativar e reativar característica não tinha caminho | Botões **Desativar** e **Reativar** na própria janela |
| Reativar uma característica cujo nome foi recriado dava erro de banco sem explicação | A tela **barra antes**, dizendo qual é o conflito e o que fazer |
| Quem não tinha permissão via *"Sem permissão para gerenciar plano inspecao"* — a chave crua do sistema | *"Sem permissão para gerenciar o plano de inspeção — seu perfil é Almoxarife."* (e mais três ações que tinham o mesmo defeito foram corrigidas junto) |

### As regras, com o cenário exato

**Quem pode:** cadastrar plano exige **Administrador**, **Qualidade** ou **Engenharia** — é a
permissão *Gerenciar plano de inspeção*. **Almoxarife não cadastra plano**, e quem cadastra não
decide inspeção: são ofícios diferentes de propósito.

**1. O botão, e onde ele está.**
**Almoxarifado → Materiais**, na coluna de ações de cada linha: **Plano de inspeção**. A janela
abre com o nome do material no título, e abaixo o código, a unidade e o lembrete de que *a faixa
ao lado de cada característica é **nominal + desvio**, com sinal*.

**2. A faixa aparece enquanto se digita — e é isso que evita o erro clássico.**
Digite característica *Furo*, unidade *mm*, nominal `10`, desvio inferior `0,005` e superior
`0,021`. Ao lado aparece **`[10.005 ; 10.021]`** — os dois limites **acima** do nominal, porque é
um ajuste unilateral de usinagem. Se você esperava `[9.995 ; 10.021]`, é exatamente esse
mal-entendido que a faixa à vista existe para desfazer: **desvio inferior não é "menos alguma
coisa"**, é um número com sinal.

**3. Vírgula funciona — e o que não é número é recusado com o motivo.**
`10,5` é aceito e vira `10.5`. Um campo vazio no nominal recusa com *"Informe o valor nominal."*;
algo que não é número recusa com *"Valor nominal inválido: "10,5,5". Use ponto ou vírgula decimal
(ex.: 10,5)."* — e **nada é enviado ao servidor** nesses dois casos. Desvio deixado em branco vale
**zero**.

**4. Nominal zero é válido, e a tela não atrapalha.**
Batimento, planeza e folga têm nominal **0**. A janela aceita, e com os dois desvios zerados a
faixa fica de largura zero — a medida tem de bater o nominal exatamente. É plano válido, não plano
vazio.

**5. Salvar avisa quando não há o que salvar.**
Clicar em **Salvar** numa linha que você não alterou responde *"Nada mudou nesta característica."*
em vez de mandar uma escrita inútil. Alterou de verdade: *"Característica atualizada."*

**6. Desativar libera o nome — e é aqui que mora a única armadilha.**
**Desativar** move a característica para o bloco **Inativas (N)**, que abre e fecha. Dentro dele,
escrito na tela: *"Desativar libera o nome: se a característica foi recriada depois, reativar a
antiga é recusado — renomeie ou desative a outra."*
Faça o teste: desative *Rugosidade*, crie *Rugosidade* de novo (é aceito, o nome ficou livre) e
tente **Reativar** a antiga. A recusa é *"Já existe uma característica ativa chamada "Rugosidade".
Renomeie ou desative a outra antes de reativar esta."* — **e a tela nem chega a chamar o
servidor**, porque ela já tem a lista completa na mão. Se o conflito nascer de outra pessoa
enquanto a sua janela está aberta, aí quem recusa é o servidor, e a mensagem dele aparece literal.

**7. Desativar duas vezes não é erro.**
Se a característica já estava inativa (outra aba, outra pessoa), a resposta é
*"Esta característica já estava inativa."* — aviso, não erro. O sistema não inventa falha para um
pedido que já estava atendido.

**8. Editar o plano NÃO reescreve inspeção antiga.**
Mude o nominal de uma característica e vá à aba **Histórico** das Inspeções: as medidas já feitas
continuam mostrando o nominal e a faixa **do dia da medição**. É o congelamento que a Etapa 27
construiu, e esta etapa não o afrouxa — por isso mesmo **o material da característica não pode ser
trocado**: seria mover a característica para outro material deixando as medidas contando a história
do material antigo. Errou o material? Desative e crie no certo.

**9. Se a janela não carregar, ela diz isso.**
Falha de rede mostra *"Não foi possível carregar o plano de inspeção."*, a mensagem do servidor e um
botão **Tentar de novo** — nunca *"Nenhuma característica cadastrada ainda."*, que faria você
concluir que o material não tem plano.

### O que esta etapa NÃO cobre (é decisão declarada, não esquecimento)

- **Plano herdado da família** (**B59**) — continua por material.
- **Copiar o plano de outro material** — atalho útil, e vira escopo próprio; hoje se cadastra
  característica por característica.
- **Anexar desenho técnico** à característica — depende do módulo de anexos.
- **Editar uma característica inativa** — o bloco de inativas é somente leitura, com **Reativar**.
  Editar ali convidaria a reativação acidental, que o servidor foi construído para impedir.
- **Validar a faixa invertida na tela** — quem recusa *"O desvio inferior não pode ser maior que o
  superior"* é o servidor. Repetir a régua na tela seria a mesma duplicação que a **B60** recusou.
- **Reabrir ou corrigir medida já gravada** — continua sendo só leitura.

## Etapa 31 — Os números de documento paravam de ser únicos (2026-08-31)

Toda requisição, recebimento, remessa a terceiros e conferência de inventário nasce com um
**número** — `REQ-…`, `REC-…`, `REM-…`, `INV-…` — e esse número é único no sistema. Só que os
quatro eram montados de um jeito que **acabava repetindo**, e quando repetia o usuário levava um
erro de banco cru na cara, num fluxo que ele não tinha como refazer com sucesso garantido.

Esta etapa não aparece em tela nenhuma. O que ela muda é que isso deixa de acontecer.

> **Não foi uma suspeita: foi medido.** O número usava um pedaço do relógio — os **últimos
> dígitos** do milissegundo — e um sorteio de 0 a 99. Pegar só os últimos dígitos faz o pedaço
> **repetir**: a cada **16,7 minutos** na requisição, e a cada **27,78 horas** nos outros três. Não
> era preciso duas pessoas clicarem ao mesmo tempo — bastava o relógio dar a volta.

### Antes → Agora

| Antes | Agora |
|---|---|
| Quatro geradores de número, um em cada canto do código, **nenhum igual ao outro** | Um gerador só, com as regras num lugar |
| O pedaço do relógio **repetia** — 16,7 min na requisição, 27,78 h nos outros | O relógio inteiro entra no número: **não repete** |
| Sobravam **100** sufixos por instante | Sobram **2,8 trilhões** |
| A conferência de inventário (`INV-`) não tinha sorteio nenhum: duas criadas no mesmo instante colidiam **com certeza** | Tem a mesma proteção dos outros três |
| Repetiu? O usuário via *"UNIQUE constraint failed: remessas_terceiro_almoxarifado.numero"* | O sistema **tenta de novo sozinho**, com um número novo, até 5 vezes |
| Os números tinham 12 a 14 caracteres, só dígitos | Têm **20 caracteres, com letras** (ex.: `REM-MTHK5F35ABC12345`) |

### As regras, com o cenário exato

**1. Os números novos são mais longos e têm letras.**
Crie uma requisição: o número sai como `REQ-` seguido de 16 caracteres entre letras e dígitos. Os
documentos **antigos continuam como estavam** — nada foi renumerado, e nada precisa ser. Ver a
letra **C** antes de apresentar, porque é a mudança que aparece na tela.

**2. O número que a tela mostra é o que está gravado.**
Isso parece óbvio e é justamente o que a etapa teve de garantir: quando o sistema tenta de novo,
o número que vence nasce **dentro** da retentativa. Se a tela mostrasse o da primeira tentativa, o
papel impresso deixaria de bater com o sistema. Vale para a resposta da tela, para a linha do banco
e para a **Auditoria**.

**3. Documento antigo continua abrindo, listando e imprimindo.**
Abra uma remessa criada antes do deploy: ela abre normalmente, aparece nas listas, nos filtros e no
PDF. Nenhuma tela valida o formato do número — foi verificado, não suposto.

**4. Se colidir mesmo assim, o sistema resolve sozinho.**
Com 2,8 trilhões de sufixos por instante isso não deve acontecer nunca. Mas se acontecer, a criação
tenta de novo com um número novo, até 5 vezes, e **só então** desiste — e aí a mensagem é
*"Não foi possível gerar um número único para o documento"*, não o erro de banco.

### O que esta etapa NÃO cobre (é decisão declarada, não esquecimento)

- **Numeração sequencial por ano** (`REQ-2026-0001`), que é o que uma ERP madura faz. Exige tabela
  de contador e uma decisão sua sobre reinício anual — está na letra **B**.
- **Renumerar os documentos existentes** — o número aparece em impresso, e-mail e conversa de
  galpão; renumerar quebraria o rastro de tudo que já saiu.
- **Números de outros módulos** — a varredura foi do almoxarifado.
- **Número de série de material** continua sendo **digitado pelo operador** e não passa por este
  gerador, de propósito.

## Etapa 32 — O papel que prova a qualidade finalmente tem onde ficar (2026-09-02)

Toda inspeção de recebimento gera papel: o certificado do fornecedor, o relatório dimensional, a
foto da peça danificada. Até aqui esse papel não tinha lugar nenhum no sistema — ficava no e-mail
de quem recebeu, numa pasta da rede, ou impresso numa gaveta. Quando o cliente ou o auditor pedia
"me mostre o certificado do material desta OS", alguém tinha de lembrar onde guardou.

A partir desta etapa o documento fica **preso à inspeção**, dentro do sistema, e quem tem acesso ao
almoxarifado baixa em dois cliques. E — isto é o que muda para a qualidade — **o arquivo não é
público**: o download exige login, ao contrário de tudo que o módulo guardava até aqui.

**Um detalhe de bastidor que vale contar, porque explica por que isto demorou 31 etapas:** o
espaço para guardar anexo **já existia no banco desde o primeiro dia do módulo**, e nunca foi
usado por ninguém — nenhuma tela gravava, nenhuma tela lia. Seis partes do sistema o citavam como
"depende do módulo de anexos", e cada uma supunha que outra o construiria. Esta etapa construiu.

### Antes → Agora

| Antes | Agora |
|---|---|
| Certificado do fornecedor ficava no e-mail de quem recebeu | Fica preso à inspeção, na aba **Histórico**, e qualquer pessoa com acesso baixa |
| Não havia como saber se uma inspeção tinha documento | A linha do histórico abre e mostra a lista de anexos, com quem enviou e quando |
| Arquivo do almoxarifado abria sem login para quem tivesse o link | **Anexo novo exige login** para baixar (os arquivos antigos **não** mudaram — ver furo **C42**) |
| Nada registrava quem viu qual documento | **Cada download fica na Auditoria**, com nome e hora |
| Linha do histórico sem medidas não abria | Toda linha abre — as com medida mostram medida e anexos, as sem medida mostram só anexos |

### As regras, com o cenário exato

**1. O anexo pertence a um documento que existe — e o sistema confere.**
Não há como anexar "solto". O sistema verifica se a inspeção existe antes de aceitar o arquivo, e
se não existir devolve *"Registro não encontrado para anexar"* e **descarta o arquivo enviado**.
Isso evita o problema que a própria tabela tinha: linha apontando para o nada.

**2. Só PDF e imagem.**
Anexe um arquivo `.docx` ou `.zip` e o sistema recusa com *"Anexo deve ser PDF ou imagem"*. São
aceitos PDF, JPG, PNG e WEBP.
**E há uma proteção que não aparece na tela:** mesmo que alguém renomeie um programa para
`nota-fiscal.pdf`, o arquivo guardado no servidor **nunca** fica com extensão executável — o
sistema grava a extensão pelo tipo do arquivo, não pelo nome enviado. Sem isso, um `.exe`
disfarçado entraria no servidor e seria salvo com esse nome na máquina de quem clicasse em Baixar.

**3. Limite de 10 MB por arquivo.**
Acima disso: *"Arquivo excede o limite de 10 MB"*. Foto de celular cabe folgado; PDF de relatório
completo também. Se precisar de mais, é uma linha de configuração.

**4. Clicar em Anexar sem escolher arquivo dá *"Arquivo é obrigatório"*.**

**5. Remover esconde o documento, mas não o apaga.**
O anexo some da lista na hora, e a remoção fica registrada na Auditoria com quem removeu. **O
arquivo continua no servidor** — decisão explicada na letra **B67**. Tentar remover duas vezes o
mesmo anexo devolve *"Anexo não encontrado"*, não um sucesso silencioso.

**6. Quem pode o quê** (detalhe e justificativa na letra **B68**):

| Perfil | Ver e baixar | Anexar | Remover |
|---|---|---|---|
| Administrador, Almoxarife | sim | sim | **sim** |
| Compras, Produção, Engenharia, Gestor, Qualidade | sim | sim | não |
| Consulta | sim | **não** | não |

A tela **esconde** o que o perfil não pode: quem não anexa não vê o formulário, quem não remove
não vê a lixeira. Quem tentar mesmo assim (por outro caminho) toma a recusa do servidor.

**7. Se o arquivo sumir do servidor mas o registro continuar, o sistema diz isso.**
Baixar devolve *"Arquivo do anexo não encontrado"* — diferente de *"Anexo não encontrado"*, que é
quando o registro é que não existe. A diferença importa: uma coisa é o documento ter sido
removido, outra é o arquivo ter se perdido num restore de banco sem restore de arquivos.

**8. Nome de arquivo com acento funciona.**
`Certificado nº 123 — aço.pdf` é gravado e baixado exatamente assim. Parece óbvio; não era — o
padrão da web entrega esse nome num formato antigo que corrompe acento, e o caminho ingênuo
transformava o nome em `Certificado nÂº 123 â€” aÃ§o.pdf` na tela e no arquivo salvo.

### Como testar ao vivo

1. **Almoxarifado → Inspeções → aba Histórico.**
2. **Clique numa linha** — ela abre. Se a inspeção tiver medidas, elas aparecem; abaixo, sempre, o
   bloco **Anexos**.
3. **Escolha o tipo, selecione um PDF e clique em Anexar.** Ele aparece na lista com o seu nome e a
   data.
4. **Clique em Baixar** — o arquivo desce com o nome original.
5. **Tente anexar um `.txt`** → *"Anexo deve ser PDF ou imagem"*.
6. **Clique na lixeira** → some da lista.
7. **Vá em Almoxarifado → Auditoria** e filtre pela entidade **Anexo**: estão lá *Anexo enviado*,
   *Anexo baixado* e *Anexo removido*, com nome e hora.

### O que esta etapa NÃO cobre

- **As outras cinco telas.** O mecanismo é genérico e já aceita anexo em material, requisição,
  recebimento, devolução e item de remessa a terceiro — mas **só a inspeção tem o botão**. As
  outras cinco são um plug de poucas linhas cada, e ficam para a etapa seguinte. Prometer seis
  telas aqui seria entregar seis pela metade.
- **Os arquivos antigos continuam públicos por link** (furo **C42**) — foto de material,
  certificado de lote, comprovante de sucateamento, certificado de calibração, foto de ocorrência
  e assinatura de entrega. É anterior a esta etapa e tem correção própria já desenhada.
- **Nada é apagado automaticamente.** Anexo removido continua ocupando disco, e não há rotina de
  expurgo — corte já declarado desde a feature de segurança.
- **O sistema não lê o conteúdo do arquivo.** Ele confere o tipo declarado e a extensão que grava,
  mas não abre o PDF para ver se é um PDF de verdade.

## Etapa 33 — Os arquivos do almoxarifado param de abrir sem login (2026-09-03)

Desde o começo do módulo, todo arquivo guardado pelo almoxarifado — foto de material, certificado
do fornecedor, comprovante de sucateamento, certificado de calibração, foto de ocorrência e **a
imagem da assinatura de quem retirou material** — ficava num endereço que **abria sem login**.
Quem tivesse o link abria de qualquer lugar, deslogado. A única proteção era o endereço ser difícil
de adivinhar, o que protege contra quem chuta e não contra quem já tem o link.

Isto não foi descoberto por acaso: a Etapa 32, ao construir os anexos, mediu o problema e o
declarou por escrito como furo. **Esta etapa o fechou.**

**O que mudou, em uma frase:** o endereço de cada arquivo agora vem **assinado pelo servidor**,
vale só para **aquele arquivo** e expira em **15 a 20 minutos**.

### Antes → Agora

| Antes | Agora |
|---|---|
| Link de foto ou certificado abria **sem login**, de qualquer lugar | Só abre com endereço assinado, emitido pelo sistema |
| Um link copiado funcionava **para sempre** | O endereço expira em 15 a 20 minutos |
| A assinatura de entrega de material abria para qualquer um com a URL | Só abre por dentro do sistema |
| Endereço de um arquivo servia para pedir **outro** (bastava trocar o nome) | Cada assinatura vale para **um** arquivo |
| Pedir um arquivo inexistente entregava a página do sistema dentro da imagem | Responde “não encontrado”, sem pista nenhuma |

### As regras, com o cenário exato

**1. Sem assinatura, o arquivo não sai — e o sistema não diz que ele existe.**
Qualquer tentativa (sem assinatura, com assinatura de outro arquivo, vencida ou adulterada)
responde **“não encontrado”**. Não responde “sem permissão”, de propósito: “sem permissão”
confirmaria que o arquivo existe, que é justamente o que se quer esconder de quem está tentando
adivinhar.

**2. A assinatura vale para um arquivo só.**
Pegar o endereço assinado de uma foto e trocar o nome por `assinatura-fulano.png` **não funciona** —
o nome do arquivo faz parte da assinatura.

**3. O endereço expira.**
Entre 15 e 20 minutos. É o que impede um link copiado para uma planilha de virar acesso permanente.

**4. Nada foi movido, renomeado ou apagado.**
Os arquivos estão exatamente onde estavam. O que mudou é **como se chega até eles**.

### Como testar ao vivo

1. Abra **Almoxarifado → Materiais**, com um material que tenha foto. A foto aparece normalmente.
2. **Clique com o botão direito na foto → “Copiar endereço da imagem”.** Cole num bloco de notas:
   você vai ver o endereço terminando em algo como `?exp=...&sig=...`. Essa parte é a assinatura.
3. **Abra esse endereço numa aba anônima** (sem estar logado): a imagem aparece — a assinatura vale
   por si, é isso que permite a foto carregar na tela.
4. **Agora apague o `?exp=...&sig=...` do fim e abra de novo:** o navegador diz que não encontrou.
   É essa a diferença entre antes e agora — antes, esse endereço curto abria.
5. **Espere ~20 minutos e recarregue a aba anônima** com o endereço completo: para de funcionar.
   Voltando ao sistema e recarregando a tela, a foto aparece de novo.
6. Repita com **Lotes → Ver certificado** e com a **assinatura de entrega** de uma requisição
   entregue: os dois seguem a mesma regra.

### O que esta etapa NÃO cobre

- **Quem já baixou continua com o arquivo.** Fechar a porta impede novos downloads; não recolhe o
  que saiu antes. Se algum documento sensível pode ter vazado, tratar isso é decisão sua.
- **Não há registro de quem baixou** esses arquivos antigos. O registro de download existe só para
  os **anexos** (da Etapa 32) — e continua só para eles.
- **Tela aberta por mais de ~20 minutos mostra imagem em branco até recarregar.** É consequência
  direta de o endereço expirar. Onde mais aparece é na tela de montar requisição, que carrega as
  fotos conforme você rola.
- **Três tipos de arquivo continuam sem tela para vê-los** — comprovante de sucateamento,
  certificado de calibração e foto de ocorrência são guardados e nunca exibidos em lugar nenhum.
  Eles agora estão fechados junto com o resto; quando alguma tela precisar deles, ela vai pedir o
  endereço assinado ao servidor como as outras.

## Onde estamos e o que vem a seguir

- **Etapa 31 entregue (2026-08-31):** **os números de documento paravam de ser únicos** (defeito,
  `1e6c9a9..67b6758`) — não é feature e não aparece em tela nenhuma. Os quatro números do módulo
  (`REQ-`, `REC-`, `REM-`, `INV-`) eram montados por **quatro geradores diferentes**, cada um
  pegando os **últimos dígitos** do milissegundo mais um sorteio de 0 a 99 — e pegar só os últimos
  dígitos faz o pedaço **repetir**: a cada **16,7 minutos** na requisição, a cada **27,78 horas**
  nos outros três. Não era preciso simultaneidade; bastava o relógio dar a volta. O `INV-` não
  tinha sorteio nenhum, então a colisão dele em criação simultânea era **certa**. Quando repetia, o
  usuário via *"UNIQUE constraint failed"* cru. Agora há um gerador só, o relógio **inteiro** entra
  no número (não repete), os sufixos passaram de 100 para **2,8 trilhões** por instante, e há um
  retry curto como cinto de segurança. **O que muda na tela:** os números novos têm **20
  caracteres com letras** em vez de 12–14 só com dígitos — letra **C**. **Nada foi renumerado**, e
  documento antigo continua abrindo, listando e imprimindo. **O que a revisão adversarial achou:**
  nenhum bug, mas uma **fragilidade da prova** — a defesa do defeito central estava pendurada numa
  asserção só, e um carimbo decimal do mesmo comprimento passava verde em quatro arquivos de teste;
  virou um **invariante de reversibilidade**, impossível de satisfazer por acidente. **O que é
  seu:** a **B66** — quer numeração **sequencial por ano** (`REQ-2026-0001`)?
- **Etapa 30 entregue (2026-08-31):** **o plano de inspeção sai do `curl` e vira tela** (feature
  09, `af7adea..7982f18`) — a lista de **Materiais** ganhou o botão **Plano de inspeção**, que abre
  a janela de criar, editar, desativar e **reativar** característica, com a **faixa de tolerância
  calculada ao lado enquanto se digita**. **Isto é o que torna as Etapas 27 e 29 alcançáveis:** sem
  plano cadastrado o formulário de inspeção não mostra campo de medida nenhum, e ninguém no galpão
  cadastra plano por API. **Nenhuma linha de backend mudou** — o CRUD existia, testado, desde a 27.
  **O que a revisão adversarial achou e virou código:** quatro ações do servidor **não tinham
  rótulo** no client e três já tinham botão na tela, então quem não podia lia *"Sem permissão para
  gerenciar plano inspecao"* — a chave crua; e a fórmula da faixa, que nasceu recebendo números do
  banco, passou a receber **texto de formulário** e errava com espaço colado de planilha
  (`[10.50 ; 10.50]`) e com notação científica (`100 ±1e-3` virava `[100 ; 100]`, escondendo a
  tolerância inteira). **O que é seu:** nada trava — as decisões desta etapa estão em **B65**
  (a régua de nome duplicado que a tela repete, e por que ela é diferente da que a B60 proibiu).
- **Etapa 29 entregue (2026-08-30):** **a tela finalmente mede, e a medida finalmente tem quem
  leia** (feature 09, `d0a9f7c..75f183f`) — a Etapa 27 tinha entregado a régua inteira **sem
  tela**, e os dois furos que ela declarou na época, **C34** (o formulário não tinha campo de
  medida) e **C35** (as medidas gravadas não tinham leitor), **estão fechados**. O formulário
  *Decidir Inspeção* ganhou o bloco **Medidas do plano** (um campo por característica ativa, com
  nominal, unidade e a faixa de tolerância já somada **com sinal**) e o seletor de instrumento,
  que **mostra o vencido rotulado e desabilitado** em vez de deixar o servidor recusar depois. A
  caixa *Divergência dimensional* passou a ficar **desabilitada e desmarcada** assim que há
  medida — a **B60** cumprida em 2 de 3 partes. E a tela de Inspeções ganhou a aba **Histórico**:
  as decididas, com `2 (1 fora)` na coluna de medidas, e a tabela completa ao clicar na linha, com
  a tolerância **do dia da medição** — mudar o plano depois não reescreve o passado. **Duas
  decisões minhas estão escritas:** a **pré-visualização do resultado enquanto se digita foi
  DESCARTADA** (calcular a régua na tela seria uma segunda cópia dela, e a Etapa 27 mediu a versão
  ingênua errar 12,3% no limite — o resultado vem do servidor, no aviso de sucesso), e a **B64**
  (ler o histórico não exige perfil; decidir continua exigindo). **O que falta para a feature 09
  ficar 🟢** está nomeado na spec: cadastro do plano **pela tela**, não conformidade formal
  numerada, liberação sob desvio autorizado e anexos.
- **Etapa 28 entregue (2026-08-29):** **a separação ganha dono, e quem separou não confere**
  (feature 05, `9cef003..62cb2b1`) — cada rodada de separação passa a ser registrada com **quem,
  quando e quais itens** (linha própria por rodada: ninguém apaga a rodada de ninguém), a separação
  e a liberação para retirada **passam a aparecer na Auditoria**, e nasce a **segunda conferência**:
  outra pessoa do almoxarifado confere a caixa, e o sistema recusa **quem aparece em qualquer
  rodada** — com a barreira repetida no banco, no molde da dupla aprovação do sucateamento. Com
  **material crítico ainda na caixa**, a conferência é **obrigatória** para liberar **e** para
  entregar (primeira resposta concreta à **B57**). **Dois achados da revisão mudaram o projeto:**
  a entrega direta saía de *Em Separação* sem passar pela liberação — a barreira só na liberação
  era barreira que ninguém era obrigado a passar; e o formulário de separação gravava os itens
  **um a um antes de validar o próximo**, deixando material separado **sem rodada** — e sem rodada
  a mesma pessoa separava, conferia e entregava. Agora é tudo ou nada. **O que é seu:** a **B62**
  (a régua "só crítico" é decisão minha, reversível numa linha) e o furo **C38** (almoxarifado de
  uma pessoa não tira crítico sozinho). Tela nova: bloco *Separação (N)*, linha *Conferida por*,
  botão *Conferir separação*, e os botões de saída cinza enquanto a conferência falta.
- **Etapa 27 entregue (2026-08-29):** **a divergência dimensional deixa de ser opinião e vira
  medição** (feature 09, `063f3ce..cdb64a6`) — a inspeção de recebimento ganhou **plano por
  material** (características com valor nominal e os dois desvios da tolerância, **com sinal**,
  para o caso unilateral de usinagem), **registro de medidas com o instrumento usado**, e a caixa
  *Divergência dimensional* passou a ser **derivada do número** quando há medidas: fora da
  tolerância liga sozinha, dentro desliga, e a marcação manual é ignorada. Junto, a amarra com o
  cadastro de instrumentos: **paquímetro com calibração vencida não mede** — a medida é recusada,
  não aceita com ressalva. **Três coisas que a revisão da etapa mediu e mudaram o projeto:** sem a
  folga de arredondamento, **12,3% das peças no limite exato da tolerância seriam reprovadas**
  (6.132 falsos em 50.000 pares varridos) e cada uma ligaria a divergência sozinha — a etapa
  fabricando a divergência que existe para medir; as recusas novas rodariam **depois** de o saldo
  já ter se movido, e foram levadas para antes; e um número escrito com **vírgula** (`12,4`) não
  reprovava como todo mundo supunha — ele **aprovava**, com o valor gravado em branco.
  **Esta etapa é de fundação e NÃO tem tela** (furos **C34** e **C35**): quem inspeciona pelo
  formulário segue marcando a caixa à mão, porque sem medidas nada é derivado, e as medidas
  gravadas ainda não têm janela que as mostre. **Nenhum comportamento atual mudou** — as tabelas
  nascem vazias e, sem plano cadastrado, tudo funciona como antes. **O que é seu:** decidir a
  **B59** (plano herdado da família?) e ler a **B60**, que é o alerta a cumprir na etapa da tela —
  a caixa *Divergência dimensional* tem de virar **somente leitura e explicada** ao lado dos campos
  de medida, senão a tela mostra uma coisa e o banco guarda outra. A **B61** (informar o instrumento
  é opcional) eu já decidi, com o caminho de volta escrito.
- **Etapa 26 entregue (2026-08-29):** **uma lista de categorias só, e ela é da GMP** (feature 01,
  `1bca087..9d86a84`) — a dívida mais antiga do módulo ainda aberta: as categorias de material
  estavam **escritas dentro do código, repetidas em três telas**, desde a Etapa 2 (04/08). Agora as
  três leem o **catálogo do cliente** (as 27 de metalúrgica que estavam no banco **sem nenhum
  uso**), o catálogo virou **cadastro editável** em Configurações → aba Categorias (criar,
  renomear, desativar, **reativar**), passou a **recusar nome duplicado** e a **deixar rastro na
  Auditoria**. Junto, dois defeitos que só apareceram ao medir: o formulário **mostrava a primeira
  categoria da lista** para material gravado com outra (a tela mentia sobre o banco), e material
  salvo sem categoria era classificado como `OUTROS` **pelo servidor**, sem passar pela tela.
  **Isto responde a B6**, aberta desde a Etapa 8c. **O que continua aberto e é seu:** rodar a
  **A6** para decidir o que fazer com os materiais já classificados pela lista antiga — **nada foi
  migrado, de propósito** —, rodar a **A7** antes do deploy (nome de categoria repetido impede a
  trava nova de valer), e decidir a **B58** (renomear reclassifica ou não). **E quem opera precisa
  saber do C33:** o filtro de categoria devolve **zero** para as categorias novas enquanto o
  acervo não for remapeado.
- **Concluído até aqui:** Etapas 0 a 11 — fundação, motor de estoque, cadastros, requisições,
  reservas, quarentena, lotes, séries, etiquetas, transferências, devoluções, materiais de clientes,
  remessas a terceiros, transformação no terceiro, **retalhos/sucatas**, **ferramentas e
  calibração**, o **inventário avançado em duas rodadas** e a **reposição e compras** (motor de
  sugestão, estoque parado e a tela para quem decide compra). As features 10, 11, 12, 13, 14,
  15 e 16 estão completas no que cada etapa se propôs; a **17 fica quase completa** (restos
  declarados na seção da 10b) e a **18 (reposição) fica entregue no que é do almoxarifado** —
  a integração com o módulo Compras que faltava dela (fechar/cancelar solicitação no
  recebimento) **foi entregue na Etapa 14**; dela, resta só "itens por material" (letra **D**).
- **Etapa 13 entregue:** **relatórios e indicadores** (feature 21 no grosso) — tela de
  Relatórios dirigida por um registro único com proteção declarada por relatório, exportação
  XLSX com colunas curadas, indicadores gerenciais com réguas escritas e 3 cartões novos no
  painel. O que falta da 21: PDF, tetos configuráveis, indicadores que dependem de outras
  features (previsto×realizado precisa de BOM/OP da 22) — tudo declarado.
- **Etapa 12 entregue:** **notificações completas** (feature 19 quase inteira + fatia da 20) —
  fila com retentativa/dedupe/histórico, e-mail de movimentação por classes (desligado por
  default, ligar é decisão sua — B15), três dívidas antigas pagas (lembrete de ferramenta
  da 9b/B7, resumo de solicitações da 11, devolução parcial da 7) e três alertas novos
  (zerado, lote vencendo, remessa vencida), com a tela **Notificações** para Gestor/Admin.
- **Etapa 14 entregue:** **integrações — a fatia real** (feature 22 no que é integrável hoje) —
  ciclo de vida da solicitação de compra fechado (RECEBIDA automática no recebimento da nota +
  CANCELADA manual com justificativa, **resolvendo a B14**), vincular validando as duas pontas,
  contexto do material para quem decide compra, e o relatório **Custo por projeto** com herança
  de projeto na devolução. BOM/OP/centro-de-custo ficaram **bloqueados por dependência com a
  medição escrita** (BOM inexistente; MES sem uso) — não são promessa.
- **Etapa 24 entregue (2026-08-29):** **a Qualidade ganha perfil, e a tela que decide acesso para
  de mentir** (feature 23, perna **Perfis**, `a81e51a..4680daa`). A área de qualidade passou a ter
  perfil próprio — **Qualidade**, com *consultar* e *decidir inspeção*, e **nada além** —, e a aba
  **Configurações → Perfis de Acesso** ganhou três consertos: **retirar** o perfil de alguém
  passou a deixar linha no histórico (antes era invisível — o ato mais sensível do módulo saía sem
  rastro), a concessão passou a gravar **qual era o perfil anterior**, e **Administrador saiu da
  lista de opções** (concedê-lo por ali dava poder de promover outras pessoas e **evaporava
  sozinho** no salvamento seguinte daquele cadastro). A aba, que não tinha **nenhum** teste, ganhou
  sete. **A etapa foi reescrita no meio do caminho, e vale saber por quê:** o desenho afirmava que
  *"não existe tela para atribuir perfil"* — **falso**, ela existe desde 05/08 e já tinha sido
  usada; a revisão derrubou a premissa com quatro provas e o escopo virou "consertar o que existe"
  em vez de "construir de novo", o que teria criado **uma segunda porta para a mesma função**.
  **O que continua aberto e é seu:** apertar o perfil padrão de quem não tem perfil definido, hoje
  **Produção** (**B54** — agora viável, porque dá para atribuir perfil antes de apertar); dar régua
  por perfil à central de alertas, que é o que destravaria os quatro alertas de qualidade
  (**B55**); e decidir se bloquear material por desvio cabe neste perfil (**B56**). **E uma ação
  antes do deploy:** rodar a consulta **A4** no banco de produção para achar quem já tenha
  *Administrador* gravado — o filtro é da tela, não uma migração (**C31**).
- **Etapa 23 entregue (2026-08-28):** **o histórico para de mentir por omissão e por excesso**
  (feature 23, `0fe8d02..4f1aeb9`) — a etapa que a **própria 22 pediu ao fechar**. Ao dar tela à
  trilha, a 22 tornou visíveis dois defeitos que até então eram teoria: salvar configurações
  gravava **campo a campo**, e uma falha no meio deixava parte aplicada **sem nenhuma linha de
  histórico** (mentira por omissão); e excluir o que **já estava inativo** gravava outra linha de
  "Exclusão", com autor e horário, indistinguível na tela de uma exclusão real (mentira por
  excesso). Os dois estão fechados: as 18 chaves do `Salvar` vão **num comando só** (juntas ou
  nenhuma), e as **cinco** rotas de exclusão do módulo — tipo de material, localização, setor,
  família e **material** — passaram a distinguir "não existe" de "já estava inativo". **A revisão
  mudou o escopo da etapa:** ela encontrou um terceiro defeito, mais fundo, que **não estava no
  plano** — o mecanismo que refaz uma gravação quando duas disputam o banco **respondia o erro da
  primeira tentativa** e gravava depois, o que faria o "tudo ou nada" ser promessa falsa por outro
  caminho. Virou a primeira tarefa e foi consertado antes das outras duas. **O que continua aberto
  e é seu:** se o segundo clique em Excluir deve **avisar** alguma coisa na tela (**B52**); e o
  mesmo perigo de transação existindo hoje em dois pontos do **núcleo** do CRM (**C30**), que é
  etapa própria.
- **Etapa 22 entregue (2026-08-28):** **a trilha de auditoria ganha leitor** (feature 23,
  `8c6ffbe..169458d`) — três etapas (18, 19 e 20) instrumentaram o módulo e **nada disso tinha
  tela**; agora tem **Almoxarifado → Auditoria**, com filtro de entidade, ação, pessoa e período,
  o **de/para legível** por linha (só o que mudou, não o despejo técnico) e paginação. A consulta
  ganhou os quatro filtros novos, **validação de data que recusa o que não existe no calendário**
  (o 30 de fevereiro passava em JavaScript e no banco, alargando a janela em silêncio) e a
  conversão do dia de Brasília para o horário gravado — sem ela, **as três últimas horas de todo
  expediente sumiriam** do filtro do próprio dia. A tabela do histórico, que não tinha **nenhum**
  índice, ganhou os três que faltavam. Revisão do plano: **10 achados, 2 críticos** — os dois
  eram erro meu de desenho: mandar reusar a régua de diff das configurações como leitor (ela
  apagaria a troca de senha mascarada e fabricaria alterações que não houve) e uma varredura de
  vocabulário ao mesmo tempo ruidosa e cega. Revisão adversarial: **9 achados, 2 bloqueantes**, e
  o alvo prioritário dela **REFUTADO** — o bloqueante principal era a suíte do cliente ficar
  **vermelha em qualquer máquina em UTC**, ou seja, o placar verde valia só nesta máquina. **O
  que continua aberto e é seu:** normalizar os nomes das ações no banco (**B47**), abrir a trilha
  para o Gestor (**B33**, metade b), o volume do log de permissões (**G8**) e a política de
  retenção (letra **D**).
- **Etapa 21 entregue (2026-08-28):** **exposição no núcleo do CRM** (`d5c8d3a..07a4b1c`) — a
  **primeira etapa fora do módulo almoxarifado**, e a única até aqui que fechou uma **escalada de
  privilégio**: o zip de `GET /api/backup` levava o arquivo de segredos do servidor, e quem
  baixasse forjava crachá de super administrador (mais 188 MB de cópias históricas por download).
  Agora o zip exclui o segredo e leva **uma** cópia de backup — a mais recente, com os arquivos que
  a acompanham, senão a restauração perderia as últimas transações. Junto: senha do backup
  comparada em tempo constante e todo download registrado com IP real; a senha do SMTP saiu de
  fonte primária (ambiente → código) e o remetente com dois endereços deixou de derrubar o envio em
  silêncio; a senha parou de sair em claro nas **duas** leituras de configuração e o salvamento
  passou a recusar a máscara com 400, com a tela corrigida junto (o campo salvava a cada tecla e
  gravava `********N` por cima da senha real). Revisão do plano: **11 achados, 2 bloqueantes** — o
  mais caro impediu que a etapa trocasse o **host de e-mail de produção** achando que era
  salvaguarda. Revisão adversarial: **11 achados, 4 bloqueantes e 10 refutações reproduzidas**, com
  um fix-round para os dois piores, que eram **testes que não sabiam falhar** (apagar o filtro do
  backup deixava a suíte 25/25 verde com o segredo de volta no zip; e a checagem da máscara passava
  mascarando a chave errada, com a senha extraída pelos dois GETs). **O que continua aberto e é
  seu:** a rotação da senha na Locaweb (**A3**) — nenhum código faz isso.
- **Etapa 20 entregue (2026-08-28):** **exposição e rastro** (feature 23, os três "fora de
  escopo, nomeados" que a Etapa 19 deixou escritos na spec; o **quarto**, que era do núcleo, virou a
  Etapa 21) — a rota de foto de material parou de
  responder sucesso para material inexistente, parou de deixar arquivo órfão em toda saída que não
  é sucesso, parou de apagar a foto anterior em corrida com a gravação e passou a auditar a troca;
  a leitura das configurações parou de devolver senha de SMTP e chave de API em claro e o
  salvamento genérico passou a recusá-las; e ler o mapa de permissões por setor passou a exigir o
  mesmo que escrevê-lo. Revisão do plano: 16 achados, 4 bloqueantes — o mais caro deles evitou um
  erro que derrubaria a **primeira** chamada das três rotas de configuração. Revisão adversarial:
  **5 achados reais e 11 refutações reproduzidas**, com um fix-round que fechou a janela entre a
  leitura e a gravação da foto, transformou um teste que se declarava impossível em três cenários
  reais, corrigiu o desenho da etapa onde ele **contradizia** a entrega e declarou o buraco irmão
  (B41). Nada disto tem tela: o roteiro de teste é o do guia.
- **Etapa 19 entregue (2026-08-28):** **cadastros e configurações auditados** (feature 23,
  fatia 2) — 23 operações passam a deixar rastro, com o tratamento honesto de cada classe:
  diff nas configurações (só o que mudou), segredo mascarado, criação separada de reativação,
  404 onde antes se respondia sucesso, e o efeito colateral do rename de setor contado.
  Revisão do plano: 15 achados (4 bloqueantes, incluindo duas armadilhas de `this` em arrow
  function). Revisão adversarial em duas lentes: 3 correções de código, todas de log que
  mentia — mudança de regra persistida sem rastro, diff fabricando 18 mudanças inexistentes,
  e a URL do webhook indo em claro com o token dentro.
- **Etapa 18 entregue (2026-08-28):** **a trilha do inventário** (feature 23) — abrir,
  contar, recontar, concluir e cancelar passam a deixar registro com autor e de/para;
  cancelar exige motivo e grava quem/quando (e o motivo aparece na tela); as colunas de
  aprovador deixaram de ser mortas; três atos vizinhos auditam; o log ganhou gate. Revisão
  adversarial: 6 achados reais, 0 ruído — inclusive uma **regressão da própria etapa** (a
  reescrita do cancelar tinha perdido o travamento contra concorrência e a trilha chegou a
  fabricar um cancelamento que não vigorou) e a truncagem silenciosa do log. **Correção de
  duas specs que enganavam desde 2026-08-22.**
- **Etapa 17 entregue (2026-08-28):** **alertas de evento** (feature 20 sai de 13 para 17
  alertas) — reprovação de material, divergência de recebimento e divergência de inventário
  avisam **no ato** (com a varredura diária como rede de segurança e sem duplicar), mais o
  resumo mensal de lotes sem certificado. Revisão adversarial: 5 achados reais, 0 ruído —
  dedupe que calava a divergência nova e pior, volume de 1000 e-mails/mês no alerta de lote,
  uma afirmação FALSA na spec (corrigida em voz alta) e dois testes que não sabiam falhar.
- **Etapa 16 entregue (2026-08-28):** **alertas operacionais — a fatia real** (feature 20
  sai de 6 para 13 alertas) — registro único de alertas (varredura diária, e-mail pela fila
  existente e a tela nova **Alertas** leem a MESMA lista), 7 alertas novos (calibração,
  sem consumo, excessivo, quarentena parada, sem endereço, requisição atrasada, reserva
  parada), 3 janelas configuráveis nos dois lados e a ação de perfil `ver_alertas`
  (B28). O que ficou fora está declarado com o porquê: 3 alertas com lacuna de dado,
  4 de evento (fatia seguinte), e "transferência não recebida" **saiu do checklist**
  dizendo que foi cortado pelo cliente. Revisão adversarial: 4 achados reais (2 corrigidos
  em código — varredura que silenciava os demais alertas e datas DATE com um dia a menos;
  2 declarados — letras C18/C19), 0 ruído.
- **Etapa 15 entregue (2026-08-28):** **mobilidade — a fatia real** (feature 24, nova) —
  scanner de QR pela câmera fechando o ciclo das etiquetas, assinatura do recebedor na
  entrega de requisição (opcional por design), e o balcão usável no celular (tabelas sem
  coluna escondida, modais em tela cheia). Código de barras 1D, coletor físico e app
  nativo ficaram **fora por medição** (nada gera 1D; hardware não confirmado; sem demanda
  de offline) — está tudo na seção da etapa e na letra D. O desenvolvimento foi retomado
  em 2026-08-28 por instrução do usuário, em **modo contínuo** (fechou etapa, emenda na
  próxima).
- **A seguir:** o roteiro de etapas do planejamento mestre está completo — o que resta no
  mapa são as features 🟡: da 20 restam os 4 alertas de evento e os 3 com lacuna de dado
  (fatia seguinte natural), os restos declarados da 21/22/23 (o maior buraco real nomeado:
  a conferência de inventário não audita — feature 23), e as decisões da letra B esperando
  resposta. A próxima frente será escolhida pelo mapa de status, não por roteiro.
- **Ações pendentes antes do deploy:**
  1. rodar em produção a consulta do **bug da Sucata** (seção da Etapa 7 no guia) — no
     desenvolvimento deu 0 devoluções, produção precisa da mesma checagem;
  2. rodar em produção a consulta que confirma a **lista antiga de materiais de cliente vazia**
     (seção da Etapa 8 no guia) — nada foi apagado, a tabela foi preservada de propósito;
  3. ~~saber que a conferência de inventário ajusta saldo fora da permissão de material de
     cliente~~ — **resolvido na Etapa 10**, item **C1**;
  4. **nenhuma etapa da 8b até a 14 acrescenta consulta a esta lista** — todas só criam
     colunas, índices e tabelas novas, sem tocar em dado existente (a 13 é só código; a 14
     cria 4 colunas novas na tabela de solicitações, sem migrar dado — solicitação antiga
     continua PENDENTE até alguém vinculá-la ou cancelá-la). A 12 em particular: a
     máquina do alerta de zerado se **semeia sozinha em silêncio** no primeiro contato com
     cada material (nada a rodar antes do deploy), e o e-mail de movimentação nasce
     **desligado** — ligar é o item B15;
  5. **avisar quem compara relatórios com o mês passado** de que dois números mudam de leitura
     (itens **C3** e **C4**) — nenhum dado foi alterado, mas o número na tela vai ser outro;
  6. **avisar quem opera que o tipo Sucata sumiu do formulário de Movimentações** (item **C5**) —
     sucatear agora é pela tela Sobras e Retalhos, com duas assinaturas de pessoas diferentes;
  7. **avisar quem opera que existe uma tela nova de Ferramentas** (Almoxarifado → Ferramentas) —
     ninguém precisa ser treinado às pressas (o fluxo antigo de empréstimo continua existindo por
     baixo), mas vale que o almoxarifado saiba onde ficou;
  8. **avisar quem opera que a conferência de inventário ganhou campos novos** (contagem cega,
     tolerância, justificativa do ajuste) — quem já usa a tela vai ver os campos na próxima
     conferência que criar; nada quebra no fluxo antigo, só fica mais completo;
  9. **(21) rotacionar a senha do SMTP na Locaweb e definir `SMTP_USER`/`SMTP_PASS` no ambiente da
     VPS, nessa ordem** (item **A3**) — é a única ação desta lista que **nenhum código** resolve, e
     sem ela a Etapa 21 fica cosmética nesse ponto. Enquanto não for feita, quem tiver qualquer
     clone antigo do repositório tem uma senha de e-mail válida da GMP;
  10. **(21) trocar a senha do backup (`BACKUP_TOKEN`) se ela for curta** — o servidor passa a
     escrever `avisos=CURTO` no log a cada download quando ela for menor que 32 caracteres
     (item **B44**); e conferir no log se ainda aparece `avisos=QUERY_DEPRECIADA`, que indica
     alguém chamando o backup com a senha dentro da URL (item **B43**).
- **O que depende de você, não do código:** confirmar se **remessa mista de donos** deve mesmo ser
  recusada (item **E**); reconhecer a **regra de rateio de custo** implementada no seu nome (item
  **B4**); dizer **quais classificações de sucata a GMP usa de verdade** (item **B5**) e **qual
  taxonomia de categorias vale** (item **B6**); decidir o **canal do lembrete de devolução de
  ferramenta** (item **B7**) e priorizar (ou não) a **tela de editar ferramenta** (item **B8**);
  reconhecer a **regra de retenção do ajuste de inventário** implementada no seu nome (item
  **B10**) e decidir se o inventário precisa do **fluxo formal de duas assinaturas** (item
  **B11**); reconhecer a **correção do primeiro contador** implementada no seu nome (item
  **B12**); reconhecer o **gate de compra sem o Almoxarife** e as réguas da reposição (item
  **B13**) e reconhecer o **cancelamento de solicitação de compra entregue** no seu nome (item
  **B14**, resolvida na Etapa 14) e as **quatro decisões da Etapa 14** (itens **B21-B24** — a
  mais importante é a **abertura de acesso B21**); e fazer as **verificações no navegador** — selos, PDF, modal de transformação, a
  tela de Sobras e Retalhos, a tela de Ferramentas, a Conferência de Estoque com os campos da
  10b e a tela nova de **Reposição e Compras** (item **F**).
- **Pendências conhecidas (documentadas, não urgentes):** click-through manual das etapas
  pelo usuário (roteiros no guia); tela de subfamílias; telas para localizações
  vazias/materiais sem endereço; pendências declaradas (a)–(j) da 6b e (a)–(g) da 6c na
  spec 10; as duas da Etapa 7 — Ajuste não reconcilia o bloqueado (decisão de negócio
  pendente) e o estado parcial da Sucata sem notificação; as da Etapa 8 — os relatórios que
  misturam material de cliente sem o selo; as da
  Etapa 8b — a mesma decisão do Ajuste agora alcançando a coluna "em terceiros" (item **B**), e a
  lista de exclusão que protege as colunas novas por omissão (item **G1**); as da Etapa 8c —
  a **fragilidade das fixtures de teste** (item **G2**), a coluna com **três significados** (item
  **G3**), as categorias de material ainda fixas no código do front, e o anexo de desenho na
  remessa; as da Etapa 9, registradas na spec 15 — a falta de uma **guarda automática para tipo
  novo de movimento** nas fontes únicas (a sabotagem da etapa provou que o teste da equação por
  cliente não pega o esquecimento sozinho), a coluna **foto** da sobra sem escritor, o retalho de
  material com controle de lote entrando **sem lote** (mesma isenção declarada da spec 10), e o
  **valor de venda aceito em descarte** (gravado, mas fora do total do relatório); as da Etapa
  9b, registradas na spec 16 — o **lembrete sem canal** (item **B7**), a **edição de ferramenta
  sem tela** (item **B8**), o **filtro de dias do painel sem campo** (item **B9**), e o padrão de
  **contrato congelado honrado só por um lado** que a revisão final identificou (item **G4**); e
  as da Etapa 10, registradas na spec 17 — os tipos de contagem avançados e a dupla contagem por
  duas pessoas (item **D**, ficam para a 10b), a blindagem imperfeita da contagem cega (item
  **C6**), e a fragilidade estrutural de "validar em duas passadas" que a revisão final
  achou e corrigiu, mas que continua exigindo atenção manual em qualquer código futuro parecido
  (item **G5**).
- **Transversal (2026-08-11):** auditoria completa das 24 specs contra o código — specs
  que afirmavam coisas não entregues foram corrigidas com nota datada, e o bug de front dos
  status de reserva (`92fe236`) saiu dessa auditoria.
- **Transversal (2026-08-13):** o fechamento da 8c corrigiu **textos deste próprio conjunto de
  documentos** que estavam errados — a previsão de que a 8c cairia na fragilidade **G1** (não caiu),
  e três afirmações sobre **onde** o bug do custo aparecia (a tela citada não existe). As correções
  ficaram **escritas como correções**, e não apagadas, porque afirmação errada apagada em silêncio
  faz o próximo leitor confiar nela de novo.
