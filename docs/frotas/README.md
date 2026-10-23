# Módulo Frota — guia do que existe hoje

> **Onde paramos:** levantamento inicial feito em **2026-10-23**. Nenhuma etapa de desenvolvimento
> ainda. O módulo **roda**, mas **nunca foi usado** (nenhum veículo cadastrado). Próximo passo:
> receber o formulário do motorista e a planilha de Excel em
> [`specs/modulo-frotas/00-processo-atual/`](../../specs/modulo-frotas/00-processo-atual/README.md) e
> desenhar a tela do motorista.
>
> Mapa de status e achados: [`specs/modulo-frotas/README.md`](../../specs/modulo-frotas/README.md) ·
> Detalhe técnico (API, tabelas, perfis, cálculos):
> [`referencia-tecnica.md`](referencia-tecnica.md)

## Em uma frase

O sistema já tem **um caderno de frota completo para o escritório** (veículos, motoristas,
abastecimento, manutenção, viagens, checklist, multas, documentos, painel e relatório). O que **não**
tem é **uma porta simples para o motorista**: hoje, se o motorista entrar, ele vê as mesmas tabelas
do gestor — com os dados de todo mundo.

## Como a empresa trabalha hoje × para onde vamos

| Hoje | Alvo |
|---|---|
| Formulário vai para o motorista | Motorista entra no sistema (celular) |
| Motorista preenche no papel/arquivo | Motorista preenche na tela, só o que é dele |
| Alguém passa a limpo no Excel | Ninguém digita de novo: o dado já está no sistema |
| A planilha é o lugar que centraliza | O sistema centraliza; se precisar, exporta no formato da planilha |

## Como entrar no módulo

1. Na tela inicial, escolher **Frota**.
2. O menu da esquerda mostra: Dashboard Frota, Veículos, Motoristas, Manutenções, Abastecimentos,
   Documentos, Viagens, Checklist Diário, Multas, Relatórios, Solicitar Material, Minhas Requisições.
3. Para alguém ver o módulo, o administrador precisa dar acesso ao módulo **Frota** na tela de
   usuários.

## As telas, uma por uma

Todas as telas de cadastro funcionam igual: **uma tabela**, uma **busca**, às vezes um **filtro**, o
botão **"Novo…"** que abre um formulário, e na linha os botões **editar** (lápis) e **excluir**
(lixeira).

| Tela | Para que serve | Funciona? |
|---|---|---|
| **Dashboard Frota** | 9 cartões (veículos ativos, em manutenção, manutenção vencida, OS em aberto, combustível no mês, alertas, custo total, total de veículos, checklists hoje), lista de alertas, custos por categoria e últimos abastecimentos | Sim |
| **Veículos** | Placa, marca, modelo, ano, tipo (carro, caminhão, empilhadeira…), se mede por **km** ou **horímetro**, combustível, setor, centro de custo, condutor responsável, chassi, RENAVAM | Sim |
| **Motoristas** | Nome, CPF, CNH (número, categoria, validade), telefone, e-mail, setor | Sim — mas o motorista cadastrado aqui **não é ligado** ao login dele |
| **Abastecimentos** | Veículo, motorista, data, litros, valor, km, combustível, posto. O sistema atualiza o km do veículo e calcula o **km por litro** | Sim, com dois defeitos no km/L (abaixo) |
| **Manutenções** | Preventiva ou corretiva, oficina, custo, peças, km, **próxima revisão** (por km e/ou data). Se ficar "em andamento", o veículo aparece como "em manutenção" | Sim |
| **Viagens** | Saída e retorno (data/hora e km), destino, finalidade, setor. O gestor **aprova** a viagem | Sim, com defeitos (abaixo) |
| **Checklist Diário** | Marca 7 itens: pneus, óleo, luzes, freios, extintor, documentos, limpeza. Se algum falhar, sai "Pendências" | Sim. Não dá para editar depois de salvo |
| **Multas** | Data, infração, valor, pontos, vencimento, pago/pendente/contestado | Sim |
| **Documentos** | IPVA, licenciamento, seguro, CRLV, rastreador — com vencimento e "avisar X dias antes" | Sim |
| **Relatórios** | Custo por veículo (com período) e consumo médio km/L. Botão **Imprimir** | Sim. Não exporta para Excel |
| **Solicitar Material** | Pede peça/material ao almoxarifado (mesma tela da fábrica) | Sim |

## Avisos automáticos (aparecem no Dashboard)

- Documento vencendo (no prazo que foi configurado nele; padrão 30 dias).
- CNH de motorista vencendo em até 30 dias.
- Revisão chegando: até 15 dias pela data, ou faltando 500 km pelo km.
- Multa pendente vencendo em até 15 dias.
- **Consumo baixo**: o km/L dos últimos 60 dias ficou abaixo de 70% do esperado para o veículo.

Vencido aparece em vermelho; perto de vencer, em laranja.

## Quem pode o quê

| Perfil | O que faz |
|---|---|
| **Administrador de Frota** | Tudo: cadastra veículo e motorista, aprova viagem, vê relatório, exclui |
| **Motorista** | Lança abastecimento, manutenção, viagem, checklist, multa e documento. **Não** cadastra veículo/motorista, não aprova, não vê relatório |
| **Consulta** | Só olha e vê relatório |

Pela tela de usuários, **só dá para tornar alguém Administrador de Frota**. Quem tem acesso ao módulo
e não é administrador vira **Motorista** automaticamente. "Consulta" existe no sistema, mas não há
botão para escolher.

## O que ainda atrapalha o uso real (em palavras simples)

1. **O motorista vê tudo.** Entrando hoje, ele vê CPF e CNH dos colegas, os custos da frota e os
   lançamentos de todo mundo — e consegue **editar o lançamento de outro motorista**.
2. **Não existe "a minha tela".** O motorista teria de abrir "Abastecimentos", clicar em "Novo",
   escolher o próprio nome numa lista… É a tela do escritório, não a do motorista.
3. **Corrigir um abastecimento apaga o km/L dele.** Se o motorista errar e editar, o consumo some.
4. **Abastecimento lançado atrasado fica sem km/L.** Quem lança no fim do dia (ou da semana) fora de
   ordem não tem o consumo calculado.
5. **km menor que o anterior passa calado.** Um erro de digitação (900 em vez de 1900) é aceito sem
   aviso.
6. **Viagem**: dá para "aprovar" uma viagem que já terminou, e km de volta menor que o de ida gera
   "km rodado" negativo.
7. **Não sai Excel.** A planilha de hoje ainda não tem substituta.

## Roteiro rápido para ver o módulo funcionando

1. Entrar como administrador → **Frota** → **Veículos** → **Novo Veículo**: placa `ABC1D23`, tipo
   Caminhonete, medição Quilometragem, km 10000. Salvar.
2. **Motoristas** → **Novo Motorista**: um nome, CNH categoria B, validade daqui a 20 dias. Salvar.
3. **Dashboard Frota**: aparece o aviso **"CNH — (nome)"** em laranja.
4. **Abastecimentos** → **Novo**: o veículo, 50 litros, R$ 300, km 10500. Depois outro: 50 litros,
   km 11000. Na tabela, o segundo mostra **10** em Km/L.
5. **Veículos**: o km do veículo passou a **11.000 km**.

## O que este levantamento **não** cobre

- Não mexeu em código: só leu, rodou os testes e mediu comportamentos.
- O formulário e a planilha de hoje ainda não foram vistos — o desenho da tela do motorista depende
  deles.
