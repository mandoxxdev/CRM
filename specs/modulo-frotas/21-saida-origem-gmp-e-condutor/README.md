# 21 — Saída: origem GMP, carro liberado para funcionários e condutor

> **Status:** 🟢 **entregue na Etapa 8** (2026-10-28), na `main`, `a8a8d885` (esquema) a `09a4a661` (integração), mais o fechamento. Pedidos do André: "Carros destinados a funcionários, com saída para
> trabalho externo. Saindo de onde, sempre será da GMP. Indo para onde — poderia ser Destino" e "Precisamos informar o condutor, para os
> casos de veículos liberados para funcionários".
> **Plano:** [`docs/superpowers/plans/2026-10-28-frotas-etapa8-admin-destinos-condutor.md`](../../../docs/superpowers/plans/2026-10-28-frotas-etapa8-admin-destinos-condutor.md)
> (RN-F8.15–25, 38, 39) · **Design:** seção C · **Manual:** `docs/frotas/manual-do-sistema.md` (2.3, 3.1, 3.4)

## O que é

Há dois tipos de saída: a do **motorista** (entrega/retirada, o veículo é dele) e a do **carro do setor**, que qualquer funcionário
pega para trabalho externo. Nos dois casos a saída é **da GMP** — o portal para de perguntar "Saindo de onde" e grava `GMP`. No carro
do setor, quem está logado no portal (o motorista do vínculo) nem sempre é quem dirige: o veículo ganha a marca **Liberado para
funcionários** e, nele, a Saída pede **Quem vai dirigir (condutor)**. A viagem guarda o condutor; a planilha mostra o condutor no
lugar do motorista.

## Regras de negócio — checklist

| RN | Regra | Estado | Commit |
|---|---|---|---|
| RN-F8.15 | `frotas_veiculos.uso_funcionarios`; aceito no POST/PUT; no `/portal/inicio` | [x] | `a8a8d885` |
| RN-F8.16 | `frotas_viagens.condutor_nome`, `destino_id`; `ORIGEM_PADRAO = 'GMP'` no `/meta` | [x] | `a8a8d885` |
| RN-F8.17 | Saída do portal sem origem → `GMP`; com origem → o que veio | [x] | `d38f0a71` |
| RN-F8.18 | Carro liberado sem condutor → 400 `Informe quem vai dirigir (condutor)`; > 120 → 400; comum: opcional | [x] | `d38f0a71` |
| RN-F8.19 | A conferência relê o veículo **dentro da fila** (marca ligada um segundo antes) | [x] | `d38f0a71` |
| RN-F8.20 | `POST/PUT /viagens` do gestor: `condutor_nome` opcional; viagem aprovada consumida recebe condutor/origem | [x] | `d38f0a71` |
| RN-F8.21 | `viagem_aberta.condutor_nome` no `/portal/inicio` | [x] | `d38f0a71` |
| RN-F8.22 | Planilha: Condutor = condutor ou motorista; cabeçalho igual | [x] | `d38f0a71` |
| RN-F8.23 | Portal: `Saindo de: GMP` fixo; `Quem vai dirigir (condutor)` só em carro liberado; corpo sem `origem` | [x] | `ef71a1b6` |
| RN-F8.24 | Cartão "Você está com o veículo…, condutor X" | [x] | `ef71a1b6` |
| RN-F8.25 | Gestor: checkbox no veículo, "Funcionários" na coluna Condutor; Viagens com coluna/campo Condutor e Origem `GMP` | [x] | `37380627` |

## Decisões (letra B do documento de novidades)

- **B78** — o formulário do **gestor** não exige condutor em carro liberado (lançamento atrasado nem sempre sabe); só o portal exige.
- Condutor é **texto livre**, não vínculo com usuário: funcionário sem login dirige também.

## O que fica de fora

- Condutor como lista de funcionários; condutor no Retorno e na Inspeção; exigir condutor na tela do gestor.
