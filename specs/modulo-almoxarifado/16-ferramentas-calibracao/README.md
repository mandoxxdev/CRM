# 16 — Ferramentas e Equipamentos de Medição

> **Status:** 🟡 — cadastro e empréstimo prontos no backend, sem UI; calibração inexistente · **Spec original:** seção 20
> **Última atualização:** 2026-08-15 — correção declarada: a afirmação "Teste de serviço existe"
> sobre o `toolService` estava errada (grep vazio em `server/tests/`); referências de linha mortas
> corrigidas (`schema.js`, `extended.js`)
> Antes: 2026-08-02

## Objetivo

Patrimônio de ferramentas com empréstimo a colaborador, lembrete de devolução, avaria/perda/bloqueio, manutenção e calibração com vencimento que impede o uso.

## O que já existe

- `ferramentas_almoxarifado` (`schema.js:1303`): codigo_patrimonio UNIQUE, nome, tipo, setor responsável, status, material_id.
- `emprestimos_ferramenta_almoxarifado` (`schema.js:1317`): colaborador, setor, data retirada/prevista/real, status.
- Rotas: `/ferramentas`, `/ferramentas/:id/emprestar`, `/emprestimos`, `/emprestimos/:id/devolver` (`extended.js:672-698`) via `toolService.js` (57 L).
  **Correção (2026-08-15):** duas coisas erradas nesta seção, corrigidas por declaração, não em
  silêncio. (1) "Teste de serviço existe" era falso: não existe teste nenhum de `toolService`
  (`grep -rn "toolService\|criarFerramenta" server/tests/` sem nenhuma ocorrência, verificado em
  2026-08-15) — a Etapa 9 cria os primeiros. (2) as referências de linha citadas nesta seção
  estavam mortas: eram `schema.js:555/569` e `extended.js:247-269`; os números corretos hoje são
  os que aparecem acima (`schema.js:1303/1317`, `extended.js:672-698`).
- `colaboradores` cadastrados no core (`index.js:19130`).
- Tipo de requisição de ferramenta previsto na spec (feature 04).

## Checklist

### Backend
- [ ] Número de série da ferramenta + localização
- [ ] Lembrete de devolução vencida (job — padrão do `requisitionReminderService`) + alerta (feature 20)
- [ ] Avaria e perda: registro com fotos, responsável e efeito no status
- [ ] Bloqueio de ferramenta (não pode ser emprestada)
- [ ] Manutenção: histórico de manutenções, ferramenta em manutenção não empresta
- [ ] **Calibração**: data da última, validade, certificado anexo, alerta de vencimento (feature 20)
- [ ] Impedir empréstimo/uso de equipamento com calibração vencida
- [ ] Integração com inspeção: instrumento usado na medição referenciando equipamento calibrado (feature 09)

### Frontend
- [ ] Tela de ferramentas (hoje inexistente): cadastro, empréstimos ativos, histórico por colaborador
- [ ] Painel de calibrações a vencer

## Regras essenciais + testes de API exigidos

| Regra | Teste |
|-------|-------|
| Ferramenta emprestada não pode ser emprestada de novo | `emprestar ferramenta ja emprestada falha` |
| Ferramenta bloqueada/em manutenção não empresta | `emprestar ferramenta bloqueada falha` |
| Equipamento com calibração vencida não empresta | `emprestar equipamento com calibracao vencida falha` |
| Devolução fecha o empréstimo e libera a ferramenta | `devolver ferramenta permite novo emprestimo` |

## Dependências

- 20 (alertas de devolução/calibração) · 09 (instrumento na inspeção).
