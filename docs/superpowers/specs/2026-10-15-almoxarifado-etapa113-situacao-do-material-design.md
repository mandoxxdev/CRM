# Almoxarifado — Etapa 113: a situação do material não prende saldo nem deixa família inativa com material ativo (design)

> Origem: "Próxima tarefa detalhada — Etapa 113" do plano da 112 (**C217 + C227**, com a **C220**). A **C219** fica de fora
> por decisão do P.O. (muda uma regra da Etapa 8). Worktree `CRM-wt-e113`, branch `etapa-e113`, a partir da main `b1c25822`.

## Fase 0 — medido (sonda `server/tests/sonda/e113f0.js`, não versionada, 2026-10-15)

| Gesto | Resultado hoje |
|---|---|
| `DELETE /materiais/:id` com saldo 5, pelo Almoxarife, pela Engenharia e pelo Administrador | **200** nos três; a Saída seguinte → 400 *"Material inativo não pode ser movimentado"*, saldo continua 5 |
| `PUT /materiais/:id { ativo: 0 }` com saldo 5, pelo Almoxarife | **200**, `ativo = 0` — a mesma porta pelo PUT (`ativo` está em `MATERIAL_UPDATE_COLUMNS`) |
| `DELETE` de material com saldo 0 e livro | 200 (o uso normal — tem de continuar livre) |
| requisição **pendente** (sem reserva) e o material inativado depois | inativar 200; **aprovar → 200 `APROVADO` com `reservas: []`** com saldo 5 — a aprovação não reserva material inativo |
| `PUT { ativo: 1, familia_id: <inativa> }` de material inativo | **200** — material ativo dentro de família inativa (C220) |
| o "Inativar" da tela (`MateriaisAlmoxarifado.js`) | `catch { toast.error('Erro ao inativar material') }` — joga fora a mensagem do servidor |
| reativar pela tela | não existe: a lista só mostra `ativo = 1` (`routes/almoxarifado.js:446`), o formulário não manda `ativo` |

**O que lê `ativo = 1` (para o manual):** a lista de Materiais e o painel de contagens; a posição do cliente
(`clienteEstoqueService`, C217); os relatórios de estoque, giro, cobertura, rupturas e valor (`reportService`); a sugestão de
compra (`purchaseService`); os alertas de mínimo e de localização (`alertService`/`alertRegistry`); a criação de requisição
(`requisitionCreateService` — material inativo não entra numa requisição nova); a disponibilidade (`stockAvailabilityService`).
O motor recusa qualquer movimento (`stockService` :769 e :1092).

**Retenção sem físico:** `quantidade_em_terceiros`, reservado, bloqueado e em inspeção estão **dentro** do físico (o
disponível é físico − retenções), então com físico 0 elas são 0 no estado são. A regra confere as cinco colunas mesmo assim
(custa nada e cobre o estado anômalo).

## Decisão (letra B — caminho reversível)

- **Escolhida — (a): inativar com saldo ou retenção é recusado para todos**, inclusive o Administrador e o superadmin.
  Motivo: o estado "inativo com saldo" não tem saída pela tela para ninguém — não existe "Reativar" na tela e a Saída recusa
  material inativo. O padrão da 112 ("só quem regulariza") não se aplica porque aqui quem regulariza **também** fica preso.
  O caminho é zerar antes (Saída/Ajuste, ou Devolver ao cliente) — tudo que já existe.
- **Descartada — (b): só quem tem `ajustar_estoque` inativa com saldo.** O Administrador inativaria e ficaria com o mesmo
  saldo preso, sem tela para reativar.
- **Descartada — recusar também com requisição pendente / pedido de compra aberto.** A 108 decidiu (B714) que compromisso
  pendente não é histórico; recusar aqui deixaria a Engenharia sem limpar o catálogo por causa de uma requisição esquecida.
  A consequência (aprovação de requisição pendente de material inativo passa sem reservar) vira **C** declarada.
- **Reversível:** relaxar para (b) é um `if (can(...))` na rota; a regra mora numa função só.

## C220 — reativar

`PUT` que muda `ativo` de 0 para 1 confere família e subfamília com as réguas e as literais de hoje (`validateFamiliaAtiva`,
`validateSubfamilia`) e leva `condicaoFamiliaSql` no `UPDATE` (a releitura da 110 já diz por quê não gravou). Material legado
com a subfamília no `familia_id` recusa pela literal `FAMILIA_E_SUBFAMILIA` ao reativar (descartado: conferir só "ativa" —
reativar é a hora de corrigir; B).

## Corrida declarada — ESTAVA ERRADO (corrigido na execução)

*Este parágrafo dizia que a corrida ficava como furo declarado. **Estava errado**: desde a Etapa 97 o motor inteiro
(`registrarMovimentacao`) roda em `naTravaDoMaterial` (a G87 já dizia que o CLAUDE.md estava desatualizado nisso). O
`UPDATE` que inativa passou a rodar sob a mesma trava (RN-04 d do plano) e a corrida fecha. O texto original:*

O motor lê `ativo` no começo do movimento e credita no fim, sem trava (a Saída/Entrada avulsa não pega a trava por material
— D (91)). Uma Entrada que leu "ativo" antes do Inativar e grava depois deixa saldo em material inativo: janela de
milissegundos, a mesma forma da C226. Fechar exigiria `AND ativo = 1` nos créditos do motor com compensação — tronco do motor,
fora do valor desta etapa. **C** declarada; a A60 acha os casos.
