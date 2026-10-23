# 00 — Processo atual (como a frota é controlada hoje)

> **Status:** arquivos recebidos em 2026-10-23 e lidos campo a campo.
>
> - [`../exemplo_formulario_motorista.jpeg`](../exemplo_formulario_motorista.jpeg) — o formulário de papel.
>   **A imagem está cortada:** termina no título da seção **"3. TRANSMISSAO E ITENS ESPECIFICOS"**, sem os itens. O que vier
>   depois (seção 3, assinatura, etc.) ainda não foi visto. **Pendente: a página inteira.**
> - [`../Controle_de_Frota_GMP.xlsx`](../Controle_de_Frota_GMP.xlsx) — a planilha centralizadora (8 abas, vazia, só o modelo).

## O fluxo de hoje

1. A empresa manda o formulário para o motorista (um por evento: **saída**, **retorno** ou **inspeção periódica**).
2. O motorista preenche no papel.
3. Alguém do escritório passa a limpo na planilha, aba por aba.

A aba **Instruções** da planilha diz as regras do processo:

| Tema | Regra deles |
|---|---|
| Saídas e retornos | Registre **toda** viagem, inclusive transporte de colaboradores. KM percorrido é automático |
| Checklist | Faça **antes da utilização**. Marque Conforme, Não conforme ou N/A em **todos** os itens |
| Ocorrências | Registre avarias e comunique ao gestor. **Não libere veículo inseguro** |
| Abastecimento | Data, KM, litros e custo de cada abastecimento |
| Manutenção | Serviço, custo, KM e próxima revisão; atualize o cadastro da frota |
| Responsabilidades | **Motorista** centraliza os controles; **outros condutores** preenchem as viagens deles e informam falhas; **gestor** aprova despesas |

A frota é **pequena**: a planilha tem 4 veículos fixos — `V01`, `V02`, `V03` (leves) e `C01` (caminhão) — em todas as listas.

## O formulário do motorista (o que o papel pede)

**Cabeçalho:** veículo (o modelo impresso é "Caminhão Sprinter — carroceria aberta"), placa, modelo, data, condutor, **KM atual**,
**horário**, **tipo** (☐ Saída ☐ Retorno ☐ Inspeção periódica), **combustível** (Vazio · ¼ · ½ · ¾ · Cheio).

**1. Mapa de avarias** — desenho do veículo em 5 vistas (lateral esquerda, lateral direita, superior, frente, traseira); o
motorista marca o local com a letra: **R** risco, **A** amassado, **T** trinca, **Q** quebrado, **O** outro.

**2. Condições de segurança e conservação** — 12 itens, cada um **OK / N/A / Falha**:

| | |
|---|---|
| Pneus e estepe | Óleo do motor / vazamentos |
| Faróis / lanternas | Arrefecimento / nível |
| Setas / luz de freio | Freios / freio de estacionamento |
| Parabrisa / vidros | Buzina / cintos |
| Espelhos / retrovisores | Documentos / equipamentos |
| Limpadores / água | Carroceria / amarração da carga |

**3. Transmissão e itens específicos** — não visível na imagem.

## A planilha (o que é centralizado)

| Aba | Colunas (digitadas) | Calculado pela planilha |
|---|---|---|
| Cadastro Frota | ID Veículo, Tipo, Modelo, Placa, Ano, KM Atual, Responsável, Próxima Revisão KM/Data, Situação | — |
| Viagens e KM | Data, Veículo, Condutor, Finalidade, **Origem**, Destino, Saída, Retorno, KM Inicial, KM Final, Observações | KM Percorrido = Final − Inicial; **"VERIFICAR KM"** se Final < Inicial |
| Checklist | Data, Veículo, Condutor, Pneus, Óleo, Água, Freios, Luzes, Documentos, Limpeza, **Avarias** (Conforme / Não conforme / N/A), Observações | Status Geral: **PENDÊNCIA** se algum "Não conforme"; **INCOMPLETO** se faltar item; senão **OK** |
| Abastecimentos | Data, Veículo, Condutor, KM, Litros, Valor Total, KM desde o anterior, Consumo km/L, Posto, Observações | Preço por litro. (KM desde o anterior e km/L são **digitados à mão**) |
| Manutenções | Data, Veículo, Tipo (Preventiva/Corretiva), Serviço, Fornecedor, KM Serviço, Custo, Próxima Revisão KM/Data, Status (**Planejada** / Em andamento / Concluída), Observações | — |
| Documentos | Veículo, Documento, Vencimento, Observações | Dias até vencer; **VENCIDO** / **ATENÇÃO** (≤ 30 dias) / **EM DIA** |
| Painel | — | Veículos, KM rodados, R$ e litros de abastecimento, R$ de manutenção, custo total, checklists com pendência, documentos vencidos/próximos, manutenções planejadas; e KM/abastecimento/manutenção **por veículo** |

## Formulário/planilha × sistema (o que já existe e o que falta)

| Do processo | No sistema hoje | Falta |
|---|---|---|
| Tipo: Saída / Retorno / Inspeção | Viagem (saída+retorno num registro) e checklist separados | Um **registro só** por evento, como o papel |
| KM atual + horário | Viagem tem km e data/hora; checklist só data | km e horário no checklist |
| Nível de combustível (Vazio…Cheio) | — | campo novo |
| Mapa de avarias (local + R/A/T/Q/O) | — | lista de avarias (vista + tipo + descrição) |
| 12 itens OK / N/A / Falha | 7 itens, **só sim/não** (pneus, óleo, luzes, freios, extintor, documentos, limpeza) | itens do papel com **3 respostas** |
| Status OK / PENDÊNCIA / INCOMPLETO | aprovado 1/0 (e item faltando conta como OK — achado A3) | as 3 situações |
| Viagem: origem | só destino | campo novo |
| Viagem: VERIFICAR KM | grava km rodado negativo (A5) | recusar km final menor |
| Abastecimento: km desde o anterior, km/L | calcula km/L, mas erra em edição e fora de ordem (A1, A2) | corrigir; mostrar "km desde o anterior" |
| Manutenção: status **Planejada** | `agendada` (mesmo sentido) | nome na tela |
| Manutenção: fornecedor | `oficina` (mesmo sentido) | nome na tela |
| Documentos VENCIDO / ATENÇÃO / EM DIA | alerta do painel (mesma régua de 30 dias) | — |
| Painel | painel com mais coisa que a planilha | KM rodados e "checklists com pendência" |
| Motorista preenche | motorista vê o sistema do gestor (A6) | **tela própria do motorista** |
| Planilha centralizada | — | **exportar no formato da planilha** |
| "Não libere veículo inseguro" | — | aviso ao gestor quando o registro tem Falha |
| ID do veículo (V01, C01) | só placa | apelido opcional — **adiado**: a placa identifica |
