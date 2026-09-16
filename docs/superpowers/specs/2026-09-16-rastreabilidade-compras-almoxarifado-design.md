# Rastreabilidade de materiais, ferramentas e ativos — desenho

**Origem:** e-mail de Sheila Machado (Gerente de Compras) para Matheus, 15/09/2026 16:13,
assunto "RES: SISTEMA - MELHORIAS PARA O DEPRATAMENTO DE COMPRAS".

**Estado deste documento:** desenho e medição. **A RN-A já foi implementada** (16/09/2026); o resto, não. Serve para
responder à pergunta literal do e-mail — *"me informe o que é possível atender"* — com base no
que o sistema já tem, e para virar plano de execução depois.

---

## O achado que muda o tamanho do trabalho

A leitura do e-mail sugere seis funcionalidades novas. **A medição diz outra coisa:** a maior
parte da estrutura já existe no módulo, construída ao longo das 31 etapas anteriores. O que
falta é, em boa medida, **regra e ligação**, não tabela nova.

| O que o e-mail pede | O que já existe | O que falta |
|---|---|---|
| OS obrigatória na saída | `requisicoes_almoxarifado.os_referencia` **já existe** | Só tornar obrigatório — o número segue digitado, sem validar cadastro (decisão do P.O.). **Feito em 16/09/2026** |
| Etiqueta de ativo GMP | `ferramentas_almoxarifado.codigo_patrimonio` | Nada na ferramenta; falta estender a equipamentos |
| Nº de série do fabricante | — | Coluna nova em `ferramentas_almoxarifado` |
| Retirada de ferramenta + devolução | `emprestimos_ferramenta_almoxarifado` (retirada, prevista, devolução real, status) | Distinguir **definitiva** de **reserva** |
| Termo de responsabilidade | — | Aceite registrado no empréstimo (quem, quando, qual texto) |
| Equipamento → setor/operador | `ferramentas_almoxarifado.setor_responsavel` | Campo de **operador** e o vínculo na saída |
| Peça vinculada ao ativo (não à OS) | — | Alternativa ao `os_referencia` na requisição |
| Requisição de manutenção | `ordens_manutencao`, `manutencao_preventiva`, `manutencoes_ferramenta_almoxarifado` | Formulário de abertura e o roteamento para Compras + Almoxarifado |

**Consequência prática:** isto não é "começar do zero". É uma etapa de regras sobre uma base
que já existe — o que reduz muito o risco, e ao mesmo tempo **aumenta** o risco de quebrar o
que hoje funciona. Toda regra nova abaixo tem de vir com o cenário do que acontece com os
registros **antigos**, que não têm OS preenchida.

---

## Regras de negócio propostas

### RN-A — OS obrigatória na saída de material

> *"preciso que a informação do número da OS seja obrigatória, tanto para quem solicita quanto
> para quem realiza a liberação. Caso não exista uma OS cadastrada, o sistema deverá impedir a
> liberação."*

**IMPLEMENTADA** em 16/09/2026 — ver `server/tests/api/requisicaoExigeOS.api.test.js`.

- A requisição **não é criada** sem OS, e o rascunho **não é enviado** sem OS.
- **O número é DIGITADO, não escolhido de um cadastro.** Decisão do P.O., 16/09/2026, que
  corrige a primeira versão deste desenho: eu havia proposto validar contra `ordens_servico`,
  o que foi recusado. Só é obrigatório **existir um número**. Um cenário de teste trava isso
  de propósito — se alguém "melhorar" a regra para validar o cadastro, o teste fica vermelho.
- Único tratamento aplicado ao texto: **remover o espaço em volta**, para " OS 1714 " e
  "OS 1714" não virarem dois serviços no relatório. Nada de maiúsculas, prefixo ou formato.
- A regra é cobrada **antes** da validação de itens e setor: o motivo da recusa é a
  requisição em si. Na ordem inversa, quem esquecesse a OS receberia "material não permitido
  para este setor" e iria mexer no lugar errado.
- **Rascunho pode ficar sem OS** — é trabalho pela metade por definição. A cobrança acontece
  no envio, que é quando a requisição passa a valer. Sem isso, o rascunho seria a porta dos
  fundos da regra.
- **Requisições antigas sem OS:** continuam válidas e legíveis. A obrigatoriedade vale para
  o que for criado a partir da mudança. Migração retroativa inventaria dado que ninguém tem.
- **Exceção ainda pendente (RN-B):** reposição de peça de equipamento não tem OS — vincula ao
  ativo. Enquanto a RN-B não existir, esse caso precisa de um número de OS como qualquer
  outro.

### RN-B — Saída vinculada ao ATIVO, alternativa à OS

> *"a saída do material pelo almoxarifado deverá ser vinculada ao ativo do equipamento, e não
> a uma OS, permitindo identificar todos os materiais utilizados na manutenção daquele ativo."*

- Toda saída tem **exatamente um** destino: OS **ou** ativo. Nunca os dois, nunca nenhum.
- É o que permite a pergunta que ela quer responder: *"quanto já gastei neste torno?"*

### RN-C — Ferramenta: retirada definitiva × reserva

Dois fluxos sobre a mesma tabela, distinguidos por um campo:

| | Definitiva | Reserva |
|---|---|---|
| Baixa no estoque | sim | não |
| Devolução esperada | não | sim, com data |
| Termo de responsabilidade | sim | sim, com os cuidados e a obrigação de devolver |

### RN-D — Termo de responsabilidade registrado

- O empréstimo guarda **quem aceitou, quando e qual versão do texto**. Guardar só um "aceito"
  booleano não serve: o texto muda com o tempo e o termo precisa ser reproduzível anos depois.
- Colaborador, nº de série do fabricante (quando houver) e etiqueta de ativo GMP são
  **obrigatórios** no registro.

### RN-E — Equipamento entregue ao setor, operado por alguém

- A saída de equipamento vincula **setor responsável + operador informado pelo responsável**.
- Campos de série e etiqueta de ativo iguais aos da ferramenta.

### RN-F — Requisição de manutenção

Campos que ela nomeou: ativo/equipamento, problema, serviço necessário, prioridade
(urgente/normal), observações.

- Vai para **Compras e Almoxarifado** ao mesmo tempo.
- O equipamento tem **entrada, saída, retorno e liberação** registrados no almoxarifado, com
  destino final dependendo de aprovação ou recusa: volta para a fábrica ou vai para descarte.

---

## O que precisa de decisão antes de executar

Estas não são dúvidas técnicas — são escolhas do negócio, e errar qualquer uma faz retrabalho:

1. ~~**A OS vem de onde?**~~ **RESPONDIDA em 16/09/2026:** de lugar nenhum — é digitada. O
   P.O. decidiu que só a obrigatoriedade importa, não o vínculo com cadastro. Isso elimina a
   pergunta sobre qual tabela de OS usar e foi o que permitiu implementar a RN-A no mesmo dia.
2. **Ativo é a ferramenta, ou é uma entidade própria?** Hoje `codigo_patrimonio` mora em
   `ferramentas_almoxarifado`. Torno e máquina de solda são "ferramenta" nesse cadastro, ou
   precisam de um cadastro de ativos separado?
3. **O termo de responsabilidade é assinado como?** Aceite no sistema, ou impressão com
   assinatura física anexada? Muda o que se guarda e o valor do registro.
4. **Quem pode liberar sem OS?** Se ninguém puder, uma urgência real trava. Se qualquer um
   puder, a regra não existe.

---

## Tamanho e sequência sugerida

Não cabe numa etapa. Sugestão de corte, em ordem de valor por esforço:

| Etapa | Escopo | Por quê nesta ordem |
|---|---|---|
| 33 | ~~RN-A~~ **feita** + RN-B — OS obrigatória e vínculo com ativo | É o pedido nº 1 dela, e o que mais rende: rastreabilidade imediata sobre estrutura que já existe |
| 34 | RN-C + RN-D — ferramenta, os dois fluxos e o termo | Segunda maior dor; a tabela de empréstimo já está lá |
| 35 | RN-E — equipamento, setor e operador | Depende do cadastro de ativos decidido na 33 |
| 36 | RN-F — requisição de manutenção e o ciclo do equipamento | O maior, e o que mais depende das decisões acima |

---

## Resposta sugerida para a Sheila

Tudo o que ela pediu é atendível, e mais barato do que parece, porque o cadastro de
ferramentas com etiqueta de patrimônio, o empréstimo com devolução e o campo de OS na
requisição **já existem** — hoje o campo de OS só não é obrigatório nem validado.

O que muda o prazo são as quatro decisões acima, principalmente se torno e máquina de solda
entram no cadastro de ferramentas ou pedem um cadastro de ativos próprio.
