# 24 — Voltar no topo dos formulários do portal

> Status: 🟢 entregue na **Etapa 10 da Frota** (2026-10-30). Plano: `docs/superpowers/plans/2026-10-30-compras-etapa192-cpf-maiusculas-os-digitada-ncm-materiais.md`
> (a Etapa 10 da Frota foi feita junto da Etapa 192 de Compras, pedido do André do mesmo dia).

Pedido: "Em entrada e saída - frota colocar um botão de voltar no topo da tela também, pois o usuário tá reclamando que tem que scrollar
até o final pra poder voltar."

- [x] **RN-F10.01** — `RegistroForm` (Saída, Retorno, Inspeção) e `AbastecimentoForm` do portal (`FrotasPortalMotorista.js`) ganham
  **← Voltar** ao lado do título (`CabecalhoDoFormulario`, `data-testid="voltar-topo"`), com o mesmo `onCancelar` e o mesmo
  `disabled={salvando}` do Voltar do rodapé, que continua. `79aad18f` — teste `FrotasPortalVoltarNoTopo.test.js` (5 cenários;
  controle positivo: `disabled={false}` derruba "desliga junto…"; trocar o cabeçalho do Abastecimento pelo `<h2>` derruba os 2 dele).
- Fora: as janelas do gestor (`FrotasEntityPage`) — o Cancelar delas fica no rodapé de uma janela com rolagem própria; ninguém pediu.
