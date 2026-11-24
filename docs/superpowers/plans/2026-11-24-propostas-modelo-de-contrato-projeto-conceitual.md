# Propostas — modelo de contrato "Projeto Conceitual" (24/11/2026)

Pedido do Matheus (Comercial), 24/11/2026: na lista **Modelo de contrato** do cadastro de família, acrescentar o **Projeto
Conceitual**, com o contrato do documento `G&A Orçamento - Projeto Conceitual_rev00.docx` (proposta 01260930/R00).
Estimativa: `docs/estimativas/2026-11/estimativa_2026-11-24_contrato-projeto-conceitual.txt` (1h30).

## Tasks

- [x] **T1 — as cláusulas.** `server/clausulasProjetoConceitual.js`, molde do `clausulasHelices.js`: 21 registros (as 20 seções do
  documento, com o preço em dois blocos). O cabeçalho do arquivo diz cada mudança em relação à origem e por quê.
- [x] **T2 — o semear.** `semearModelosClausulas` (`server/index.js`) cria o modelo no boot, `is_padrao = 0`, idempotente por nome.
  Sem tela nova: a lista do cadastro de família (`ModalFamiliaForm`) lê `GET /api/clausulas-modelos`.
- [x] **T3 — o teste.** `server/tests/api/modeloProjetoConceitual.api.test.js`: sobe o servidor real num banco novo (PC-01 lista e
  cláusulas pela rota; PC-02 segunda subida não duplica) e gera o HTML da proposta com as cláusulas nos dois formatos — com `numero`
  (o do modelo) e com o número no título (o que o `/clausulas/inicializar` grava) — conferindo a ordem do contrato e que nenhuma some
  nem repete (PC-03/04).
- [x] **T4 — documentação.** `docs/GUIA_TREINAMENTO_COMPLETO.md` (tabela dos modelos, como usar, o que não muda);
  `specs/proposta-editavel/backend.md` (modelos semeados e o encaixe no template).

## Decisões (o que foi escolhido e o que foi descartado)

- **Numeração no molde do template, não a do documento.** O template só sabe desenhar: 1–3 no começo, seção 4 dos itens, 5.x, o slot de
  preço (pelo título) e a consideração final na página de assinatura. O "4. ESCOPO TÉCNICO" virou 5.1, com 4.1–4.4 como subtítulos.
  Descartado: mexer no template para aceitar seções numeradas livres (mudaria o render de todas as propostas).
- **Financiamento do pagamento, confidencialidade e validade/aceite antes do preço (5.13–5.15).** Toda 5.x abaixo de 5.25 sai antes da
  tabela de preços; com o número de origem (17, 18, 20 → depois do preço) sairiam fora de ordem. Descartado: numerá-las 5.25+ (sairiam
  depois do preço, mas com um salto de 5.16 para 5.25 no documento).
- **Os campos "Data / Responsável / Assinatura" da validade e aceite ficaram fora**: a página de assinatura do template já os tem.
- **Correção de texto:** "O PROJETO CONCEITUAL será desenvolvid**a**" → "desenvolvid**o**"; "Item 8 – Entregáveis" → "Item 5.5".
- **Fora do `completarModeloClausulas`**: só o de hélices tem histórico de cláusula acrescentada depois; se o Projeto Conceitual ganhar
  cláusula nova no código, acrescentar a chamada (senão o modelo já criado no banco não a recebe).

## Verificação

- `node tests/api/modeloProjetoConceitual.api.test.js`: **4 passed, 0 failed**. Controle positivo: com a VALIDADE E ACEITE renumerada para
  5.25 (sai depois da tabela de preços), os dois PC-03/04 falham com *"5.25 VALIDADE E ACEITE fora do lugar"* (2 passed, 2 failed);
  arquivo restaurado. A subida do servidor nesta pasta do OneDrive passa de 60 s na primeira vez — o teste espera até 180 s.
- `node tests/modeloClausulasPorFamilia.test.js`: 13/13.
- `node tests/api/osModeloContratoPortao.api.test.js` (as rotas de modelo de contrato): **7 passed, 2 failed**. As 2 são o *"Erro ao gerar
  PDF"* da OS — nesta máquina o puppeteer não tem o Chrome instalado (`resolveExecutablePath`); as 7 que leem e trocam o modelo passam.
- `tests/propostaInvariantes.test.js` não roda nesta máquina pelo mesmo motivo — não avaliado.
- **Não rodados aqui:** `npm run test:api` inteiro (660 arquivos; cada um sobe o servidor, que nesta pasta do OneDrive leva mais de 60 s) e
  o jest/build do client (o client não mudou).
- Nenhum clique no navegador: o roteiro abaixo fica para quem testar.

## Roteiro de teste manual

1. Suba o sistema (`npm run dev` na raiz) — o modelo é criado na subida.
2. **Comercial → Produtos →** um grupo → editar (ou criar) a família do serviço, ex.: *Projeto Conceitual*.
3. Em **Modelo de contrato**, a lista mostra **Projeto Conceitual (21 cláusulas)**. Escolha e salve.
4. Crie uma proposta só com um produto dessa família e abra o preview: 1. OBJETIVO DA PROPOSTA, 2. METODOLOGIA, 3. PREMISSAS E ÁREAS DE
   ESTUDO no começo; seção 4 com o item; 5.1 ESCOPO TÉCNICO até 5.15 VALIDADE E ACEITE; 5.16 com a tabela de preços e as parcelas
   40/30/30; 5.17 CONSIDERAÇÃO FINAL na página de assinatura.
5. Misture na mesma proposta um equipamento: o contrato volta a ser o de Equipamentos (regra de sempre).

## O que fica de fora (e o próximo passo natural)

A capa continua *"Proposta para fornecimento de equipamentos industriais"* e a tabela *Ref. FINAME / Cartão BNDES* continua saindo
— o documento de origem tem capa *"Proposta para fornecimento de serviços especializados — Projeto Conceitual"* e não tem a tabela
FINAME. Hoje as duas só mudam para proposta inteira de peças (`propostaDePecas`, `tituloCapa` em `templates/propostaPremiumV2.js`).
**Próxima tarefa detalhada:** generalizar `propostaDePecas` para "proposta inteira de um modelo que não é Equipamentos", com o título da
capa vindo do modelo (coluna nova `clausulas_modelo.titulo_capa`, `NULL` = o de equipamentos) e a FINAME escondida nesse caso.
Contrato consumido: o mesmo `resolverModeloClausulas`. Atenção: o template hoje decide peças pelo **grupo** da família
(`grupoPorFamilia`), não pelo modelo — as duas réguas teriam de concordar, e há testes de capa (`propostaCapaCamposCentralizados`) e de
quebra de página que dependem da FINAME estar lá.
