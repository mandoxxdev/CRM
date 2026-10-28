# 19 — Administrador de Frota pela tela Perfis de acesso

> **Status:** 🔴 → **em desenvolvimento na Etapa 8** (2026-10-28). Pedido do André: "nas permissões do módulo, permitir setar como admin
> do módulo (além de motorista e consulta)".
> **Plano:** [`docs/superpowers/plans/2026-10-28-frotas-etapa8-admin-destinos-condutor.md`](../../../docs/superpowers/plans/2026-10-28-frotas-etapa8-admin-destinos-condutor.md)
> (RN-F8.01–11, 40) · **Design:** [`…/specs/2026-10-28-frotas-etapa8-admin-destinos-condutor-design.md`](../../../docs/superpowers/specs/2026-10-28-frotas-etapa8-admin-destinos-condutor-design.md) (seção A)
> · **Apresentação:** `docs/frotas/novidades-por-etapa.md` (Etapa 8) · **Manual:** `docs/frotas/manual-do-sistema.md` (3.8)

## O que é

Desde a Etapa 2 (feature 15), **Frota → Perfis de acesso** dá **Consulta** e **Motorista**; **Administrador de Frota** só vinha do
cadastro de usuário (checkbox "administra o módulo"), que é tela do administrador do sistema. O gestor da frota não conseguia fazer
um substituto administrador sem pedir ao TI. Agora o seletor tem a terceira opção, **Administrador de Frota**, e tirar é escolher
outra opção.

## Como funciona por baixo (e por quê)

A fonte do administrador **continua** sendo `usuarios.admin_modulos` (`["frota"]`): `getPerfilFromUser` e a tela leem isso antes de
qualquer linha de perfil. Gravar `ADMIN_FROTA` só em `perfil_frota_usuario` não serviria — `syncModuleAdminProfiles` roda em todo save
do cadastro de usuário e **apaga** essa linha quando `admin_modulos` não tem `frota` (medido na Fase 0). Então o `PUT` escreve `frota`
em `admin_modulos` (e a linha espelho, como o sync faria); tirar é o inverso. Superadmin e `role` admin continuam **forçados** (409):
isso não se mexe pelo Frota.

## Regras de negócio — checklist

| RN | Regra | Estado | Commit |
|---|---|---|---|
| RN-F8.01 | `classificarPerfilFrota`: `forcado` (superadmin, role admin) ≠ `admin_modulo` (só `admin_modulos` frota) | [ ] | |
| RN-F8.02 | `PUT ADMIN_FROTA` escreve `frota` em `admin_modulos` + linha espelho; resposta `origem 'admin_modulo'` | [ ] | |
| RN-F8.03 | `PUT` CONSULTA/MOTORISTA/`null` num `admin_modulo` tira `frota`, apaga o espelho e grava o pedido | [ ] | |
| RN-F8.04 | `forcado` → 409 `PERFIL_FORCADO`, mensagem nova (só superadmin/administrador do sistema) | [ ] | |
| RN-F8.05 | Mensagem de perfil inválido e `perfis` do `GET` com os três | [ ] | |
| RN-F8.06 | O próprio perfil → 409 `PROPRIO_PERFIL`, inclusive administrador | [ ] | |
| RN-F8.07 | Ida e volta pelo login real: `/perfis-usuario` 200 → 403; `/dashboard` 200 → 403 | [ ] | |
| RN-F8.08 | O sync do núcleo rodado depois não desfaz o que a tela gravou | [ ] | |
| RN-F8.09 | Tela: três opções; `admin_modulo` com seletor; `forcado` com etiqueta | [ ] | |
| RN-F8.10 | Escolher Administrador pede confirmação; Cancelar não chama o servidor | [ ] | |
| RN-F8.11 | Texto de ajuda da tela | [ ] | |

## Spec que estava errada

- A feature **15** dizia (`README.md` e `permissions.js:53`): *"ADMIN_FROTA não: vem do cadastro de usuário (admin_modulos)"* como
  limite de desenho. **Deixa de ser verdade nesta etapa** — a tela passa a escrever o `admin_modulos`. A frase na 15 fica com a nota.
- `frotasPerfis.api.test.js` RN-F2.02/04 tratavam o admin do módulo (usuário 6) como `forcado`. Passa a `admin_modulo` (RN-F8.01);
  o teste muda **junto com a spec**, não antes.

## O que fica de fora

- Trilha de quem deu/tirou administrador (B26 continua: o Frota não tem trilha).
- Dar administrador a quem não tem acesso ao módulo Frota (o acesso continua no cadastro de usuário — B27).
