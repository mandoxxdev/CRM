# Etapa 53 — A sugestão de localização na entrada (desenho)

> **Feature:** 02 (Localizações). **Plano:** `docs/superpowers/plans/2026-09-30-almoxarifado-etapa53-sugestao-localizacao.md`
> **Fase 0:** a próxima tarefa da 52, relida no código.

## 1. O que está medido

- **Hoje não existe sugestão.** O `grep` por `sugest*localiza*` em `server/services`, `server/routes` e `client/src` dá zero. A entrada resolve o destino por `resolveLocalizacaoEntrada`: destino informado, senão a padrão, senão `null`.
- **As restrições de endereço moram numa função só:** `validarLocalizacaoParaMovimento` (`stockService.js`).
  - Um endereço **bloqueado** recusa nos dois papéis.
  - `tipos_material_permitidos` só vale no papel **destino**, e uma lista vazia ou `null` significa "sem restrição".
- **A tela** de Movimentações tem o campo `localizacao_destino_id` para ENTRADA e TRANSFERENCIA (`TIPOS_COM_DESTINO`), num `<select>` com todas as localizações.
- **O recebimento não tem campo de localização no client:** o `grep` em `RecebimentosAlmoxarifado.js` dá zero. Por isso fica **fora** desta etapa (letra D).

## 2. As regras

**RN-01 — O predicado de destino tem uma fonte só.** O teste de "este endereço pode receber este material" sai
de `validarLocalizacaoParaMovimento` para uma função pura, `motivoRecusaDestino(loc, material)`, que devolve a
mensagem de recusa ou `null`. O motor e a sugestão passam a usar a **mesma** função. **A sugestão nunca propõe um
endereço que o motor recusaria.**

**RN-02 — A sugestão.** `GET /api/almoxarifado/materiais/:id/sugestao-localizacao` devolve uma lista ordenada e sem
repetição de `{ localizacao_id, codigo, endereco_completo, motivo, quantidade_no_endereco }`:
1. **`PADRAO`**: a localização padrão do material, se estiver ativa e for aceita pelo predicado;
2. **`JA_TEM_O_MATERIAL`**: as posições ativas e aceitas onde o material já tem saldo positivo, com as maiores primeiro. Consolidar evita fragmentar o estoque;
3. **`VAZIA_COMPATIVEL`**: as vazias pela régua da 52 (`listarLocalizacoesVazias`) que o predicado aceita, **no máximo 5**, de preferência do mesmo almoxarifado da padrão.

Material inexistente devolve 404 `Material não encontrado`. O gate é `auth`, como o mapa (a letra B da 52).

**RN-03 — A sugestão não é trava.** Ela só oferece; quem decide é o motor, e o operador escolhe qualquer endereço.

**RN-04 — A tela.** Em Movimentações, com o tipo **Entrada** e um material escolhido, aparecem abaixo do destino
**até 3 sugestões** como botões, cada um com o motivo em linguagem de usuário. Clicar preenche o destino. **Nada é
preenchido sozinho:** a entrada sem destino continua indo para a padrão, como hoje, e o preenchimento automático
surpreenderia quem já sabe o endereço (letra B).

## 3. O que NÃO é

- **Capacidade e peso** ficam fora, por decisão do design da 02.
- **Recebimento:** a tela não tem o campo de localização (letra D).
- **Material com lote:** "já tem o material" pode ser um endereço cujo lote saiu pela entrega (C72) e ainda aparece ocupado. A nota da tela declara isso.

## 4. Sort

| Task | O que é | Classificação |
|---|---|---|
| **T1** | predicado extraído + serviço + rota | **tronco** |
| **T2** | a tela | galho contra o contrato da RN-02 (em série) |
