# Rastreabilidade de materiais, ferramentas e ativos — desenho

**Origem:** e-mail de Sheila Machado (Gerente de Compras) para Matheus, 15/09/2026 16:13,
assunto "RES: SISTEMA - MELHORIAS PARA O DEPRATAMENTO DE COMPRAS".

**Estado deste documento:** desenho e medição. **Nada aqui foi implementado.** Serve para
responder à pergunta literal do e-mail — *"me informe o que é possível atender"* — com base no
que o sistema já tem, e para virar plano de execução depois.

---

## O achado que muda o tamanho do trabalho

A leitura do e-mail sugere seis funcionalidades novas. **A medição diz outra coisa:** a maior
parte da estrutura já existe no módulo, construída ao longo das 31 etapas anteriores. O que
falta é, em boa medida, **regra e ligação**, não tabela nova.

| O que o e-mail pede | O que já existe | O que falta |
|---|---|---|
| OS obrigatória na saída | `requisicoes_almoxarifado.os_referencia` **já existe**; `ordens_servico` também | Tornar obrigatório e **validar contra a OS cadastrada** (hoje é texto livre) |
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

- A requisição **não é criada** sem OS; a liberação **não acontece** sem OS.
- A OS deixa de ser texto livre e passa a ser **escolhida de `ordens_servico`**. Texto livre
  não dá rastreabilidade: "1714", "OS 1714" e "os1714" viram três serviços diferentes no
  relatório, e foi exatamente para evitar isso que ela pediu a regra.
- **Exceção obrigatória (RN-B):** reposição de peça de equipamento não tem OS — vincula ao
  ativo. Sem essa exceção, a regra trava a manutenção.
- **Requisições antigas sem OS:** continuam válidas e legíveis. A obrigatoriedade vale para
  o que for criado a partir da mudança. Migração retroativa inventaria dado que ninguém tem.

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

1. **A OS vem de onde?** `ordens_servico` é a tabela do Comercial. A OS de fábrica que a
   Sheila usa ("OS 1714") é a mesma entidade? Se não for, o seletor apontaria para o lugar
   errado e a rastreabilidade nasceria torta.
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
| 33 | RN-A + RN-B — OS obrigatória e vínculo com ativo | É o pedido nº 1 dela, e o que mais rende: rastreabilidade imediata sobre estrutura que já existe |
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
