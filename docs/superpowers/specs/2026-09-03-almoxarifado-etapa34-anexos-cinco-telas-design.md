# Etapa 34 — Anexos nas cinco telas restantes (design)

**Data:** 2026-09-03 · **Módulo:** almoxarifado · **Features tocadas:** 01, 04, 08, 12, 14

## O problema, em uma frase

A Etapa 32 construiu o módulo de anexos inteiro — serviço, quatro rotas, duas ações de perfil e um
componente genérico — e **plugou uma consumidora só**. As outras cinco entidades do mapa fechado
(`material`, `requisicao`, `recebimento`, `devolucao`, `item_remessa`) têm backend testado, ação de
perfil concedida a sete perfis e **zero superfície na tela**. Cinco specs (01, 04, 08, 12, 14)
carregam o item aberto, cada uma com a nota "plugar aqui é uma linha".

Esta etapa não constrói nada novo no servidor. **Nenhuma linha de `server/` muda.**

## Fase 0 — o que a medição achou, e o que ela derrubou

A frase "plugar aqui é uma linha" — que **eu escrevi** nas cinco specs ao fechar a Etapa 32 — está
**errada para três das cinco telas**, e o motivo é o mesmo que derrubou a Task 4 daquela etapa:
*existe uma tabela e existe uma permissão, mas não existe um lugar na tela onde o registro esteja
aberto com o `id` em mãos.*

| Tela | Onde o `id` existe | Já há casa para o bloco? |
|---|---|---|
| Material | `m.id`, sempre, na lista (`MateriaisAlmoxarifado.js:248`) | **não** — a tela não tem linha expansível (zero `aria-expanded`, zero `colSpan`) |
| Requisição | só `detalhe.id`, no painel lateral (`RequisicoesList.js:848-1282`) | **sim** — blocos aditivos em `:973` (Separação) e `:1007` (Assinaturas) |
| Recebimento | `r.id` na lista (`:468`) e `res.data.id` após o POST (`:303`) | **sim** — painel lateral `:484-586` |
| Devolução | `d.id` na lista (`:223`) — e **só ali** | **não** — lista read-only, sem coluna de ações, e o único modal é o de criação |
| Item de remessa | `i.id` real no painel aberto (`:613`) | **sim, o painel** — mas o bloco é **por item**, e o painel tem N itens |

### O achado que decide o desenho do material

```
editar_material:    ADMINISTRADOR, ALMOXARIFE, ENGENHARIA          (permissions.js:24)
anexar_documento:   os sete menos CONSULTA                          (permissions.js:131)
```

O caminho óbvio para o anexo de material era a **página de edição** (`App.js:479`), alcançada por
`bloquearSeNaoPode('editar_material', e)` em `MateriaisAlmoxarifado.js:348`. Plugar ali daria a
**COMPRAS, PRODUÇÃO, GESTOR e QUALIDADE** — quatro dos sete perfis autorizados — uma permissão
**sem nenhuma superfície para exercê-la**. É a mesma forma do achado da Fase 2 da Etapa 32
(backend inteiro, zero superfície), gerada por **permissão** em vez de por ciclo de vida.

E há um segundo motivo, independente: em **criação** o material só ganha `id` no
`setSavedId(res.data.id)` (`MaterialAlmoxarifadoForm.js:447`) e a página **navega para fora quatro
linhas depois** (`:454`). Não existe janela para anexar.

### O que mais a medição derrubou

- **`RecebimentosAlmoxarifado.js` não tem arquivo de teste.** Varredura do repositório inteiro:
  existem seis `*.api.test.js` de recebimento no servidor e **nenhum** teste de client. Plugar ali
  sem criar a suíte entrega a única das cinco telas sem prova de que o bloco monta.
- **Os quatro testes que existem têm fallback `Promise.resolve({ data: [] })`** —
  `MateriaisAlmoxarifado.test.js:106`, `DevolucoesAlmoxarifado.test.js:69`,
  `RemessasTerceirosAlmoxarifado.test.js:105`, `RequisicoesList.test.js:82`. Nenhum rejeita URL
  desconhecida. **Isso corta um risco e cria outro:** plugar não quebra nada por rede, e por isso
  mesmo **nenhum deles ficaria vermelho se o bloco não montasse**. Cada plug precisa de cenário
  próprio; a suíte existente não é rede de segurança aqui.
- **A foto já sai assinada onde importa.** O ponto de atenção herdado da Etapa 33 se resolve
  medido, não por regra geral: `enrichMaterialRows` em `almoxarifado.js:414` (lista de materiais),
  `enrichMaterialRow` em `:505` (detalhe), `:3069` (detalhe da requisição em modo almoxarifado) e
  `requisicoesMaterial.js:292`. Devoluções, Recebimentos e Remessas **não renderizam foto nenhuma**
  — grep vazio nos três arquivos —, então o ponto de atenção não se aplica a elas. Nenhuma tela
  desta etapa ganha foto nova.
- **`MaterialAlmoxarifadoForm.test.js` não mocka `useAlmoxPermissoes`** (os outros quatro mockam).
  Como o form não vai receber o bloco, isso deixa de importar — mas fica registrado, porque foi o
  motivo de o form ser descartado como casa.

## A decisão de desenho: três modais e dois blocos inline

**Três telas precisam de superfície nova.** A escolha é **não criar affordance de expansão em
nenhuma delas**, e sim um invólucro de modal reutilizado:

```
AnexosModal({ titulo, subtitulo, entidade, entidadeId, onClose })  →  casca + <AnexosDocumento />
```

| Tela | Superfície | Por quê |
|---|---|---|
| **Material** | `AnexosModal` por botão de linha (clipe) | a tela **já abre modal por material 3×** — extrato (`:424`), etiquetas (`:429`), plano de inspeção (`:432`). É o padrão dela. |
| **Devolução** | `AnexosModal` por botão de linha, em **coluna de ações nova** | não há detalhe nenhum para acrescentar; a linha da lista é o único lugar com `id` |
| **Item de remessa** | `AnexosModal` por botão na linha do item, dentro do painel | o bloco é **por item**; inline em N linhas = N requisições ao abrir o painel |
| **Requisição** | bloco **inline** no painel de detalhe | o painel já é a casa de blocos aditivos; 1 requisição por painel aberto |
| **Recebimento** | bloco **inline** no painel de detalhe | idem |

**Por que modal e não linha expansível nas três primeiras.** Expansão exige a affordance **inteira**
— cursor, `title`, chevron nos dois ramos e `aria-expanded` —, e foi exatamente uma affordance pela
metade que custou o fix-round 2 da Etapa 32 (a linha sem medidas passou a abrir sem dizer que
abria). Fazer isso **três vezes, em três telas com marcações de tabela diferentes**, é três vezes a
chance de repetir o mesmo defeito. Um botão com `title` é uma affordance completa por construção.

**Por que o botão do clipe NÃO é gateado por `anexar_documento`.** Quem só tem `visualizar` precisa
poder **ver e baixar** — é a decisão **B68** da Etapa 32, tomada e escrita ("download gateado por
`visualizar`; qualquer perfil baixa qualquer anexo, e por isso o download audita"). Gatear o botão
de abrir por `anexar_documento` contradiria a B68 em silêncio. O `AnexosDocumento` já esconde o
formulário de quem não pode anexar e a lixeira de quem não pode remover (`:104-106`); a casca não
repete decisão de permissão.

## Regras de negócio

- **RN-01** — o bloco de anexos só existe onde o registro **já tem `id` no banco**. Material em
  criação, requisição em rascunho no formulário, recebimento em digitação, devolução no modal de
  criação e item de remessa não salvo **não** têm bloco. (Guarda estrutural: `AnexosDocumento.js:210`
  devolve `null` com `entidadeId` falsy — mas a régua desta etapa é **não montar**, não confiar na
  guarda.)
- **RN-02** — abrir o painel/modal de **um** registro dispara **uma** requisição de anexos. Abrir
  uma lista de N registros dispara **zero**.
- **RN-03** — o botão/bloco aparece para quem **vê** a tela; o que ele oferece (enviar, remover) é
  decidido dentro do `AnexosDocumento` pelo perfil. Consistente com a B68.
- **RN-04** — cada entidade usa **a chave exata** do mapa fechado: `material`, `requisicao`,
  `recebimento`, `devolucao`, `item_remessa` (`anexoService.js:31-36`). Chave errada é 400
  *"Entidade inválida para anexo"*, e o mapa é congelado por `deepStrictEqual` no teste do serviço.
- **RN-05** — o `entidade_id` do item de remessa é o **`id` da linha do item**
  (`itens_remessa_terceiro_almoxarifado`), nunca o `id` da remessa. A spec 14 pede o anexo no item,
  e é o item que está no mapa.

## O que esta etapa NÃO cobre

- **Anexo na remessa inteira** (`remessa_terceiro`) — não está no mapa fechado, ficou de fora de
  propósito na Etapa 32 e continua fora. Acrescentar entidade ao mapa é mexer no tronco.
- **Anexar durante a criação** de qualquer um dos cinco. Exige guardar o `id` retornado e manter a
  tela aberta — mudança de fluxo, não de superfície.
- **Contador de anexos na linha da lista** ("3 📎"). Seria uma consulta por linha, ou uma agregação
  nova no servidor. Fora de escopo declarado: contraria a RN-02.
- **Os furos C43 e C44** da Etapa 33 continuam abertos; nada aqui os toca.
