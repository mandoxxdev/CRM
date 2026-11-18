# Etapa 238 (Compras) — Explicação do CA; Nº e Validade do CA só para material EPI

> Pedido da compradora (12/11/2026, img6: "o que é a validade do CA?"). Estimativa
> `docs/estimativas/2026-11/estimativa_2026-11-18_cadastro-e-almoxarifado-semana.md`, item 1 (1h15, régua nova). Fila do Compras
> (`specs/modulo-compras/README.md`), linha 8.

## Medido antes (Fase 0)

- Os campos `ca_numero` e `ca_validade` ficam na seção técnica de `MaterialAlmoxarifadoForm.js` (`:925-934`), sempre visíveis, para
  todo material, com o placeholder "Só EPI — Certificado de Aprovação" e nenhuma explicação.
- O formulário é o mesmo nas três telas (Compras → Materiais, Almoxarifado → Materiais em consulta e o legado do Almoxarifado), pelas
  rotas de `rotasCadastroMaterial.js`.
- **O que faz um material ser EPI hoje** (RN-178.01, `epiService.ehEpiSql`): o tipo ligado por `tipo_material_id` com `is_epi = 1`,
  **ou** o texto `tipo_material` = `epi` (sem caixa, aparado), **ou** a categoria = `epis`.
- A lista dos tipos (`GET /compras/materiais/aux/tipos-material` e `/almoxarifado/tipos-material`) é `SELECT *` — **já traz `is_epi`**.
  A estimativa dizia "falta trazer `is_epi`": **estava errada**; quem joga fora é o hook `useCategoriasMaterial`, que devolve só os nomes.
  Não há mudança de servidor.
- O detalhe do material (`detalheMaterial`, as duas portas) devolve `m.*` (com `tipo_material_id`) e `is_epi`.

## Decisão (letra B)

**Escolhido:** os campos do CA aparecem quando o material, **como está no formulário**, cai numa das marcas de EPI do servidor: o Tipo
de Material escolhido tem a marca EPI no cadastro de tipos, ou o tipo escrito é "EPI", ou a categoria é "EPIs", ou o material já está
ligado (por `tipo_material_id`, que o formulário não edita) a um tipo marcado como EPI. Fora disso os campos somem, **mas o valor
continua no formulário e vai no salvar** — esconder não apaga. **Descartado:** apagar o CA ao trocar o tipo para não-EPI (altera dado
sem pedir; o EPI mal classificado perderia o CA); mostrar os campos sempre que já houver CA gravado (o pedido é que não ocupem espaço;
quem quiser ver o CA de um material mal classificado corrige o tipo e o campo volta com o valor).

## Regras de negócio

- **RN-238.01** — Junto dos campos do CA aparece a explicação, literal: *"CA é o Certificado de Aprovação do EPI (equipamento de
  proteção individual): o número e a data de validade que constam no certificado. Só vale para material do tipo EPI."*
- **RN-238.02** — Nº do CA e Validade do CA aparecem só quando o material é EPI pelas marcas acima; com o tipo Consumível (sem marca
  EPI), categoria comum e sem tipo ligado de EPI, os dois campos e a explicação não aparecem. Trocar o tipo na tela faz aparecer/sumir
  na hora.
- **RN-238.03** — Material com CA gravado que não é EPI: os campos não aparecem, e salvar manda `ca_numero` e `ca_validade` como
  estavam.

Contrato de API: nenhum novo; consome `GET <tiposMaterial>` (linhas com `id`, `nome`, `is_epi`) e `GET <material>` (`tipo_material_id`).

## Tasks

| # | Task | Tipo | Estado |
|---|---|---|---|
| T1 | Hook `useCategoriasMaterial` devolve também as linhas; formulário calcula "é EPI" e esconde/mostra os campos com a explicação; teste `MaterialFormCaSoEpi.test.js` com controle positivo | tronco | — |
| T2 | Fechamento (novidades, fila, manual, guia, plano, estimado × realizado) | — | — |

Fase 2 (revisão do plano por agente) e Fase 5 (revisão adversarial por agentes) **puladas**: etapa de uma tela só, sem servidor, sem
motor, sem permissão e sem contrato novo — o risco que as duas pegam (contrato errado entre galhos, RN que um gesto posterior recusa)
não existe aqui; o único gesto posterior é o salvar, coberto pela RN-238.03. Sem integração entre galhos (não há galhos).
