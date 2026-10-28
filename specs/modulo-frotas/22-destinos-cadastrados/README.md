# 22 — Destinos cadastrados pelo portal (botão "+ Novo destino")

> **Status:** 🔴 → **em desenvolvimento na Etapa 8** (2026-10-28). Sugestão do motorista, colada pelo André: cadastrar destino novo
> direto no campo "Indo para onde (Destino)", com um botão **+**, "sem depender de alterações prévias no sistema".
> **Plano:** [`docs/superpowers/plans/2026-10-28-frotas-etapa8-admin-destinos-condutor.md`](../../../docs/superpowers/plans/2026-10-28-frotas-etapa8-admin-destinos-condutor.md)
> (RN-F8.26–37, 38, 39) · **Design:** seção D · **Manual:** `docs/frotas/manual-do-sistema.md` (2.3, 3.4)

## O que é

O destino da Saída deixa de ser texto digitado e vira uma **lista** (`frotas_destinos`), que o **próprio motorista** alimenta pelo
botão **+ Novo destino** ao lado do campo (Nome e Endereço opcional). O gestor tem a tela **Frota → Destinos** para corrigir, desativar
e cadastrar. A viagem guarda o **nome** do destino (como hoje) e a referência: renomear ou desativar depois não mexe em viagem antiga,
e a planilha não muda.

## Regras de negócio — checklist

| RN | Regra | Estado | Commit |
|---|---|---|---|
| RN-F8.26 | Tabela `frotas_destinos` + índice único `nome COLLATE NOCASE WHERE ativo = 1` | [ ] | |
| RN-F8.27 | `POST /destinos` (`registrar_operacoes`): nome aparado, 400s, 201 com `criado_por_nome` | [ ] | |
| RN-F8.28 | Duplicado ativo → 409 `DESTINO_DUPLICADO` com o existente; desativado libera o nome | [ ] | |
| RN-F8.29 | `GET /destinos` para todo perfil do módulo; `?search=`, `?inativos=1` | [ ] | |
| RN-F8.30 | `PUT`/`DELETE` só `gerenciar_veiculos`; exclusão lógica; 404 | [ ] | |
| RN-F8.31 | Saída com `destino_id` grava nome + id; inválido → 400 `Destino não encontrado`; texto continua aceito | [ ] | |
| RN-F8.32 | `/portal/inicio.destinos` | [ ] | |
| RN-F8.33 | Portal: seletor + `+ Novo destino` (Nome, Endereço, Adicionar, Cancelar); nome vazio não chama | [ ] | |
| RN-F8.34 | 201 seleciona o novo; 409 seleciona o existente e avisa; erro fica no bloco | [ ] | |
| RN-F8.35 | O corpo da saída leva `destino_id`, nunca `destino` texto | [ ] | |
| RN-F8.36 | Tela do gestor **Destinos** (página genérica), menu do gestor e do Consulta, não do motorista | [ ] | |
| RN-F8.37 | Viagens do gestor: Destino continua texto (B79) | [ ] | |

## Decisões (letra B)

- **B79** — no formulário de **Viagens** do gestor o destino continua texto livre (o escritório digita o que a nota diz).
- Quem cadastra é quem registra (`registrar_operacoes`): o motorista **não** depende do gestor — é o pedido.
- Acento conta como letra diferente na duplicidade ("Sao Paulo" ≠ "São Paulo"); o gestor corrige pela tela.

## O que fica de fora

- Aprovação do gestor para destino novo; destino com mapa/coordenadas; destino nas viagens antigas.
