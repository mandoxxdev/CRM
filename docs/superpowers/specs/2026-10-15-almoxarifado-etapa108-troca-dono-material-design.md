# Etapa 108 — trocar o dono de um material com histórico exige a permissão de ajustar material de cliente (C213) — design

> Plano: `docs/superpowers/plans/2026-10-15-almoxarifado-etapa108-troca-dono-material.md`.
> Origem: "Próxima tarefa detalhada — Etapa 108" no fim do plano da Etapa 106; C213.

## O problema

Desde a Etapa 8 (decisão 7) ajustar o saldo de material de cliente exige `ajustar_material_cliente` (só Administrador),
e desde a 106 estornar esse ajuste também. Mas a regra lê o dono **de agora**, e o dono é um campo comum do cadastro
(`PUT /api/almoxarifado/materiais/:id`, gate `editar_material` = Administrador, Almoxarife, Engenharia). O Almoxarife,
sozinho, tira o cliente do cadastro, ajusta como material nosso e devolve o cliente — a decisão 7 inteira contornada,
sem nenhuma auditoria `material_cliente`.

E não é só o ajuste: o livro de movimentações não guarda o dono por linha. A posição por cliente
(`clienteEstoqueService.posicaoPorCliente`) soma o livro pelo dono **de hoje** — trocar o dono leva **o saldo e todo o
histórico** (recebido, consumido, devolvido) de um dono para o outro.

## Fase 0 — medido (2026-10-15, sonda `server/tests/sonda/e108fase0.js`, não versionada)

| Cenário (pela rota) | Resultado |
|---|---|
| Administrador / Almoxarife / Engenharia — cliente → nosso, nosso → cliente, cliente A → cliente B, com saldo 0 e com 10 | **200** em todos os 18; o dono troca |
| Gestor (sem `editar_material`) — os mesmos 6 | 403 *"Sem permissão para esta operação"* (gate) |
| Almoxarife edita o nome reenviando o mesmo dono (número ou string) | 200 — o formulário sempre manda a chave |
| Almoxarife tira o dono com reservado / bloqueado / em inspeção / em terceiros = 5 | 200 |
| Auditoria da troca A → B | só `material`/`ATUALIZACAO` com `{proprietario_cliente_id: 1}` → `{…: 2}`; nenhuma `material_cliente` |
| Posição do cliente A depois de passar a B um material que recebeu 10 | o material some de A; aparece em B com `recebido` 10 |
| Portas que gravam o dono | só duas: `materialService.createMaterial` (POST, criação) e o `PUT /materiais/:id`. As rotas de lote (`estoques-minimos`, `tipos-material`) não tocam no dono; `thirdPartyService` só atualiza quantidades |
| Engenharia (sem `movimentar`) cria material **com saldo inicial 7** e dono A | **201** — anterior à etapa, vale também para material nosso (C215) |
| Administrador grava dono `99999` (cliente inexistente) | 200 — anterior à etapa (C216) |
| B708 — o Gestor estorna a ENTRADA de material de cliente | 200, total 0, nenhuma auditoria `material_cliente` (medição apenas; decisão do P.O.) |

O formulário mostra `err.response?.data?.error` no `toast.error` do salvar (`MaterialAlmoxarifadoForm.js:506`) — a
recusa do servidor aparece literal sem mudar a tela.

## Decisões

1. **A guarda mora no PUT, comparando com o gravado** (`(Number(v) || null)` dos dois lados, padrão do
   `subfamiliaChanged`). Omitir a chave ou reenviar o mesmo dono não aciona nada. (B713)
2. **"Tem histórico" = `quantidade_atual > 0`, ou qualquer coluna de retenção > 0, ou qualquer linha no livro (inclusive
   cancelada).** O livro entra porque a troca move a prestação de contas inteira, não só o saldo; a cancelada entra porque
   continua no extrato do material. Sem histórico (cadastro errado logo depois de criar) a troca segue livre para quem
   tem `editar_material`. **Descartado:** só saldo > 0 (deixaria passar a troca que reescreve o histórico de um cliente
   com saldo 0); proibir sempre (o Administrador precisa corrigir cadastro). (B714)
3. **Os três sentidos guardados** — cliente → nosso, nosso → cliente, A → B. Nosso → cliente com saldo dá ao cliente
   material que a GMP pagou (e entra na posição dele). (B713)
4. **Autorização antes de validação:** o 403 vem logo depois do 404, antes das validações de família, subfamília e
   localização e antes do `UPDATE`. Recusa = nada gravado (nem os outros campos do mesmo corpo). (B715)
5. **Auditoria nova `material_cliente`/`TROCA_DONO`** só na troca **com histórico** autorizada, nomeando os dois lados,
   depois do `UPDATE`, em `try/catch` (a `ATUALIZACAO` de sempre continua). Sem justificativa obrigatória: o formulário não
   tem campo de motivo, e criar um muda a tela inteira — descartado nesta etapa. (B716)
6. **A tela não muda** — a recusa do servidor aparece no `toast.error`. **Descartado:** travar o seletor de dono pela
   `minhas-permissoes` (a tela não sabe se o material tem livro; seria uma segunda fonte da regra). (B717)
7. **Corrida declarada:** o PUT lê o material e grava depois, sem trava. Uma entrada que chegue entre a leitura e o
   `UPDATE` de um material sem histórico deixa a troca passar. Mesmo perfil de risco do resto do cadastro; não pega a
   trava por material (ela é do disponível). (D)
8. **Fora:** C215 (criação com saldo inicial por quem não movimenta), C216 (dono inexistente), B708 (estornos de ENTRADA
   e outros de material de cliente pelo Gestor) — medidos e registrados.
