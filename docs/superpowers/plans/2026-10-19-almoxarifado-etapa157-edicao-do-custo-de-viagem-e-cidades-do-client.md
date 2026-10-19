# Etapa 157 (Comercial): abrir um custo de viagem para editar não troca os valores gravados, o client sem a cópia da lista de cidades, e a "mesma cidade" dos clientes próximos sem acento (C372 — e C374, C375 achados na medição) — plano

> Origem: "Próxima tarefa detalhada — Etapa 157" do plano da 156
> (`docs/superpowers/plans/2026-10-19-almoxarifado-etapa156-repeticao-listas-recusadas-e-prazo-do-mapa.md`). Etapa pequena; o design, com a
> Fase 0 medida, está neste plano.
>
> **Numeração** (conferida com `grep -oE` em `docs/almoxarifado-novidades-por-etapa.md` em 2026-10-19): última B **B1003**, último C **C373**,
> última A **A103**. Esta etapa: **B1004+**, **C374+**, **A104+**. Worktree `CRM-wt-e157`, branch `etapa-e157` (da main `59ae511b`).
>
> **Fase 2 (um revisor fresco, só leitura, ANTES do código — `scratchpad/e157/fase2-revisao.md`): 1 Critical, 9 Important, 11 Minor — todos
> aceitos.** A Fase 0 foi conferida afirmação por afirmação e bate (as divergências eram das RN). **K1 (Critical)** perguntar ao servidor
> também pelo cliente sem endereço torna alcançável para todo cliente a corrida de antes do `handleClienteChange` (escolher A lento e B
> rápido grava A em `clientes_viagem` e aplica a elegibilidade de A) — a RN-157.03 passa a descartar a resposta de quem já não é o escolhido.
> **I1** o ciclo da frase (some em todo recálculo que preenche, no Aplicar, na confirmação, no `resetForm`, no cliente apagado); **I2** o
> contador avança também no `resetForm` e no ramo sem dados, e a resposta velha não faz nenhum `set*` (nem o modal, o `catch` e o
> `finally`); **I3** o teste (e) passava sem o contador — vira (e1)/(e2)/(e3); **I4** o C374 sem teste de tela — (f)/(g); **I5** o Aplicar
> aéreo conta como a confirmação da passagem (**B1004**); **I6** a assinatura de uma função só, sobre o objeto normalizado (fixture com
> nulos); **I7** o `resetForm` não zerava a `data_volta` (de antes — consertado, teste (h)); **I8** o servidor nunca deixa de dar coordenada
> (o centro do estado/Brasil) — o "sem localização" é só recusa/rede, declarado em D; **I9** o adaptador do teste de tela (a elegibilidade
> atendida, o `calcular-rota` pela URL). **Minor aceitos:** as linhas da Fase 0; os custos zero vão vazios no PUT; `toBeCloseTo`; a taxa no
> modal; o estado com espaço e o endereço sem acento nos próximos; o `require` do `normalizarNome`; o histórico "50 → 50.00" (D); o centro e o
> zoom do mapa fora do teste; a rede repete em 1,2 s; o cliente sem cidade fora da lista (D); a numeração com buracos (D). **As RN, as tasks e
> os contratos abaixo já estão com as correções.**
>
> **Trava de máquina:** `scratchpad/e157-lock.sh` (o diretório `maquina-testes.lock`, o mesmo das etapas anteriores). Um arquivo de teste de
> servidor (ou um jest) por vez na máquina inteira, inclusive os revisores. **Nada do P.O.**: a lista do fim do plano da 156 continua de fora.

## Fase 0 — medido (antes de qualquer código)

### C372 — abrir um custo para editar recalcula a rota e sobrescreve os custos

- `client/src/components/CustosViagens.js`: `handleEdit` (`:1021`) faz `setFormData` com os valores gravados (`cliente_id`, `destino_cidade`,
  `destino_estado`, `tipo_viagem`, `numero_pessoas`, `data_viagem`, `data_volta`, as distâncias e os quatro custos). O `useEffect` (`:116-129`)
  depende **exatamente** desses sete campos e chama `calcularRota()` quando há cliente, cidade e estado — **dispara na abertura**.
- `calcularRota` (`:279-381`) grava no formulário `distancia_km`, `tempo_estimado_horas`, `custo_transporte` (combustível + pedágio; no aéreo,
  passagem + taxa de embarque), `custo_hospedagem`, `custo_alimentacao`, `custo_outros` (estacionamento), `custo_sugerido` e
  `requer_passagem_aerea`. Se a rota pede passagem aérea e a passagem não foi confirmada (ou a distância mudou mais de 10 km), abre o modal
  da passagem aérea em vez de gravar. `handleEdit` marca a passagem confirmada só quando a gravada passa de 600 km.
- Efeito: abrir um custo e clicar **Atualizar** sem mexer manda no `PUT /api/custos-viagens/:id` os valores **recalculados**, não os gravados
  (o servidor grava o que chega e registra a mudança no histórico). Com a **B1002** da 156 (a cidade do cadastro passou a ser achada), um custo
  antigo de *CAMPINAS* gravado com 20 km volta com 104 km e outros custos; um custo antigo de até 600 km que agora passe de 600 abre o modal da
  passagem aérea ao abrir.
- O botão **"Aplicar Valores Sugeridos"** (`aplicarSugestao`, `:1163`) já existe, sob o quadro da rota calculada.
- **C374 (novo, medido) — "Aplicar Valores Sugeridos" e a confirmação da passagem aérea deixam a taxa de embarque de fora.** O servidor soma
  no `custo_sugerido` do aéreo passagem + taxa de embarque + alimentação + hospedagem (`index.js` `calcular-rota`, `custoSugerido =
  custoPassagemFinal + taxaEmbarqueFinal + ...`). O preenchimento automático põe a taxa no transporte; `aplicarSugestao` e
  `confirmarPassagemAerea` (`:385`) põem só a passagem — o total do formulário fica R$ 75 por pessoa abaixo do sugerido. E
  `confirmarPassagemAerea` não toca o `custo_outros` (fica o estacionamento de uma rota terrestre anterior) e `aplicarSugestao` não atualiza
  a distância, o tempo nem o sugerido.
- Não há teste de tela da `CustosViagens` nem da `PreviewRota` (nenhum `*.test.js` as cita). O padrão para tela com a camada de comunicação
  real existe (`ReservasListaRecusadaApiReal.test.js`: axios real por `jest.requireActual('axios/dist/browser/axios.cjs')`, adaptador falso em
  `api.defaults.adapter`).
- O `PUT` ignora `clientes_viagem` (só o `POST` o usa) — a edição não perde a lista de clientes da viagem.

### A cópia da lista de cidades no client

- `CustosViagens.js` `obterCoordenadasCliente` (`:573-816`): coordenada já presente → ela; com **endereço, cidade, estado e id** →
  `GET /custos-viagens/coordenadas-cliente/:id`; senão (sem endereço, ou o servidor falhou) → uma lista própria de ~180 cidades com a chave
  **exata** (`'Campinas'`), o "São Bernardo" por `includes` com um deslocamento pelo id, o centro do estado **fora de SP**, e SP inteiro
  (sem a cidade) em São Bernardo com deslocamento. Como o cadastro grava em maiúsculas, a lista quase nunca casa — **o cliente sem endereço de
  qualquer cidade de SP vai para São Bernardo do Campo**.
- `PreviewRota.js` `obterCoordenadas` (`:101-134`) + a busca na montagem (`:48-83`): a mesma ideia com **4** cidades; qualquer outra cai em
  São Bernardo. Chamada no `useEffect` (para quem não tem coordenada), no centro, no zoom, na rota otimizada e nos marcadores.
- **C375 (novo, medido) — o client não pergunta ao servidor pelo cliente sem endereço.** O servidor responde `coordenadas-cliente` para
  **qualquer** cliente (sem endereço vai direto à cidade/estado — `obterCoordenadasExatas`, `services/coordenadas.js:492`, sem chamar o
  serviço de mapas; depois da 156, a cidade do cadastro com a UF certa). O client só pergunta quando há endereço; sem endereço usa a cópia —
  que não acha a cidade. Quem consome: `handleClienteChange` (o cliente escolhido, `:458`), `adicionarClienteProximo` (`:534` — os próximos
  já chegam com a coordenada do servidor), o salvar com mais de um cliente (`:864`, monta a *Preview da Rota*) e a `PreviewRota`.
- Os *clientes próximos* (`clientes-proximos`) já vêm do servidor com `coordenadas`.
- **A D (156) do documento de novidades está errada:** diz que a cópia "quase não roda" com o servidor respondendo em até 5 s — ela roda
  para **todo** cliente sem endereço, porque o client nunca pergunta ao servidor por ele. Corrigir à vista no fechamento.

### A "mesma cidade" dos clientes próximos

- `index.js` `GET /api/custos-viagens/clientes-proximos/:cliente_id` (`:15381`): com a distância < 1 km, `clientePrincipal.cidade.toLowerCase().trim()
  === cliente.cidade.toLowerCase().trim()` **e** `clientePrincipal.estado === cliente.estado` → 5 km (endereços diferentes) ou 2 km. Sem tirar o
  acento, *"SÃO PAULO"* e *"SAO PAULO"* (os dois acham São Paulo pela 156) ficam a **0 km**. `services/coordenadas.js` exporta
  `normalizarNome` (NFD, sem acento, `trim`, minúsculas).
- O estado é comparado exato (o cadastro grava em maiúsculas; `" SP"` com espaço não casaria).
- Duas cidades **fora** da lista no mesmo estado caem no centro do estado e ficam a 0 km uma da outra **com nomes diferentes** — de antes, fora
  (declarado em D).

## Regras de negócio

- **RN-157.01 (C372)** — Abrir um custo de viagem para editar **não troca nenhum valor gravado**. A rota é recalculada ao abrir e aparece no
  quadro da rota (distância, tempo, custo sugerido, os detalhes) como **sugestão**, com a frase *"Sugestão recalculada agora — os valores
  gravados foram mantidos. Clique em Aplicar Valores Sugeridos para usá-la."*; o modal da passagem aérea **não** abre na abertura (o quadro
  mostra o aviso de passagem aérea, como sempre). Clicar **Atualizar** sem mexer manda no `PUT` a distância, o tempo, os quatro custos e o
  sugerido **gravados** (os custos zero vão como antes, vazios — o servidor grava 0). Quando a pessoa **muda** um dos campos que recalculam
  (o cliente, a cidade, o estado, o tipo, o número de pessoas, a data de ida ou de volta), a edição passa a se comportar como o cadastro novo:
  o recálculo preenche os campos (e o modal da passagem aérea volta a valer) — mesmo que depois ela volte o campo ao valor gravado. A
  comparação usa **uma função só** (`assinaturaDaRota`), sobre o objeto já normalizado que o `handleEdit` põe no formulário (Fase 2 I6 — o
  registro antigo com `numero_pessoas`/`data_volta`/`tipo_viagem` nulos). **A frase** só existe enquanto o quadro mostra a sugestão da
  abertura e o formulário tem os gravados: some no início de qualquer recálculo que preenche, no Aplicar, na confirmação da passagem, ao
  fechar/abrir o Novo (`resetForm`) e quando o cliente/cidade é apagado (Fase 2 I1). **Uma resposta de cálculo velha** (de antes de uma
  mudança, de antes de fechar o formulário ou de antes de apagar o cliente) não toca em nada — nem no formulário, nem no quadro, nem no modal
  da passagem, nem no "calculando" —, inclusive quando falha (Fase 2 I2). O **Aplicar** de uma sugestão aérea conta como a confirmação da
  passagem (marca a passagem confirmada para aquela distância — a próxima mudança que der a mesma distância não pergunta de novo; **B1004**,
  Fase 2 I5). O cadastro novo não muda — e o **Novo** depois de editar começa com a data da volta vazia (Fase 2 I7: o `resetForm` não
  zerava a `data_volta`, o campo ficava com a data do custo editado na tela e vazio no estado — de antes, consertado aqui).
- **RN-157.02 (C374)** — Os três caminhos que levam a rota ao formulário (o preenchimento automático, a confirmação da passagem aérea e o
  botão **Aplicar Valores Sugeridos**) preenchem **os mesmos campos com os mesmos valores**, por uma função só: distância, tempo, custo
  sugerido, `requer_passagem_aerea`, transporte (terrestre: combustível + pedágio; aéreo: passagem + taxa de embarque), hospedagem,
  alimentação e outros (estacionamento; no aéreo, 0) — a soma dos quatro custos é o custo sugerido do servidor (ao centavo). O modal da
  passagem aérea passa a listar a **Taxa de Embarque** (Fase 2 M4 — a lista não fechava com o "Custo Total Estimado").
- **RN-157.03 (C375)** — A coordenada de um cliente nos custos de viagem e na *Preview da Rota* vem **do servidor**
  (`GET /custos-viagens/coordenadas-cliente/:id`) para todo cliente com id, com ou sem endereço; o client **não tem lista de cidades**. Se o
  servidor **recusar ou não responder** (403, rede, 500 do banco — o servidor nunca deixa de dar uma coordenada: fora da lista é o centro do
  estado, sem estado o do Brasil, Fase 2 I8), o cliente fica **sem localização**: não entra no mapa nem na rota otimizada e aparece na
  legenda com *"(sem localização no mapa)"* depois da razão social; o *"Total: N ponto(s) na rota"* conta a origem e os localizados. A
  numeração da legenda e dos marcadores segue a ordem da viagem (com um sem localização no meio, os números pulam — Fase 2 M11, declarado).
  A coordenada que já veio (os próximos) não é pedida de novo. **A resposta da coordenada de um cliente que já não é o escolhido** (escolher
  A e logo B) **não muda a lista de clientes da viagem nem dispara a elegibilidade e os próximos de A** (Fase 2 K1 — com a pergunta ao
  servidor também para quem não tem endereço, a corrida de antes passaria a valer para todo cliente).
- **RN-157.04 (D (156))** — Nos *clientes próximos*, "a mesma cidade" compara o nome **sem caixa, sem acento e sem espaço nas pontas**
  (`normalizarNome`) e o estado sem caixa e sem espaço; o endereço igual também (Fase 2 M5: *"RUA SÃO JOÃO 1"* = *"RUA SAO JOAO 1"*):
  *"SÃO PAULO"* e *"SAO PAULO"*, ambos SP, com endereços diferentes, ficam a **5 km**; sem endereço (ou iguais), a **2 km**. O resto do
  cálculo não muda.

## Contratos (nenhum endpoint novo nem mudado)

- `GET /api/custos-viagens/coordenadas-cliente/:cliente_id` — inalterado: `200 { coordenadas, lat, lon }` (pode ser o centro do estado ou do
  Brasil — a tela o desenha como posição), `403 { error: 'Acesso negado ao módulo', ... }` (o portão do Comercial), `404 { error: 'Cliente não
  encontrado' }`, `500 { error }` (só com erro de banco); passa a ser chamado também para o cliente sem endereço (responde sem o serviço de
  mapas).
- `GET /api/custos-viagens/calcular-rota` — inalterado (`400 { error: 'Destino é obrigatório' }`); a tela engole o erro: na edição, sem o
  recálculo, ficam os gravados e a frase não aparece.
- `GET /api/custos-viagens/clientes-proximos/:cliente_id?raio_km=` — inalterado no formato; `distancia_km` 5/2 para a mesma cidade com e sem
  acento (antes 0).
- `PUT /api/custos-viagens/:id` — inalterado (`404 { error: 'Viagem não encontrada' }`, `500`, o `alert` da tela); o client manda os valores
  gravados quando a pessoa não mexeu.
- Mensagens literais novas (só do client): *"Sugestão recalculada agora — os valores gravados foram mantidos. Clique em Aplicar Valores
  Sugeridos para usá-la."*; *"(sem localização no mapa)"*; no modal da passagem, a linha *"Taxa de Embarque:"*.

## Tasks (sort topológico)

- [x] **T1 (`4c9de31d`) (tronco — client) — RN-157.02.** `client/src/utils/valoresDaRota.js`: `valoresDaRota(rota)` → `{ distancia_km, tempo_estimado_horas,
  custo_sugerido, requer_passagem_aerea, custo_transporte, custo_hospedagem, custo_alimentacao, custo_outros }` (custos com `toFixed(2)`).
  `calcularRota`, `confirmarPassagemAerea` e `aplicarSugestao` usam ela; a linha da taxa no modal. Teste unitário `valoresDaRota.test.js`:
  terrestre (combustível + pedágio, estacionamento em outros), aéreo (passagem + taxa, outros 0), a soma ≈ `custo_sugerido` (`toBeCloseTo(x,
  2)`) nos dois, detalhes faltando → 0. **Os chamadores são provados na tela** (T2 f/g — Fase 2 I4).
- [x] **T2 (`00dbce2b`) (galho — client, depois da T1) — RN-157.01.** `CustosViagens.js`: `assinaturaDaRota(form)` (uma função); `handleEdit` monta o
  objeto, guarda `assinaturaDaRota(objeto)` num `useRef` e o põe no formulário; o `useEffect` compara: igual → `calcularRota({ aplicar: false
  })`; diferente → apaga a assinatura e `calcularRota({ aplicar: true })`. Um contador (`useRef`) avança em cada `calcularRota`, no
  `resetForm` e no ramo sem dados do efeito; a resposta (e o erro, e o `finally`) que não é do último pedido não faz nenhum `set*`. O estado
  `sugestaoSemAplicar` com o ciclo da RN. `resetForm` com `data_volta: ''` e `requer_passagem_aerea: false`. Teste
  `client/src/components/CustosViagensEdicao.test.js` (a tela com o `api.js` real, o adaptador falso; o `recharts` simulado):
  (a) abrir um custo de 20 km gravado (custos 50/0/30/0, sugerido 80, `numero_pessoas`/`data_volta`/`tipo_viagem` nulos) → o `calcular-rota`
  é pedido, o quadro mostra 104 km e a frase → **Atualizar** → o `PUT` leva 20 km, 50/0/30/0 (por `parseFloat(x) || 0`) e 80; (b) abrir e
  **Aplicar** → o `PUT` leva os valores da rota (distância, tempo, sugerido) e a frase some; (c) abrir e mudar o número de pessoas → o
  formulário com os valores recalculados e a frase **sumiu**; (d) abrir um custo terrestre de 500 km cuja rota agora dá 700 km (aéreo) →
  nenhum modal, o aviso de passagem no quadro, o `PUT` com os gravados; (e1) depois de mudar um campo, duas mudanças (pessoas 2 lenta,
  pessoas 3 rápida) → os campos **e** o quadro (*"Detalhes (3 pessoas)"*) são os do 3; (e2) abrir (cálculo lento) e mudar pessoas (rápido)
  → o quadro é o do novo e a frase não está na tela; (e3) mudar pessoas (lento), fechar, **Novo** → a resposta não preenche o Novo; (f) no
  Novo, um destino terrestre > 250 km (estacionamento 20) e depois um aéreo → modal com a taxa → **Aceitar** → transporte = passagem + taxa,
  outros 0,00, a soma = sugerido; (g) na edição, **Aplicar** de uma sugestão aérea → o `PUT` com transporte = passagem + taxa, e mudar a data
  da volta (mesma distância) → nenhum modal; (h) editar um custo com volta e **Cancelar** → **Novo** → a Data da Volta vazia.
- [x] **T3 (`a04ab574`) (galho — client) — RN-157.03.** `client/src/utils/coordenadasDoCliente.js`: `coordenadaValida(c)` (dois números finitos — recusa
  `[undefined, undefined]`) e `obterCoordenadasDoCliente(cliente)` (já tem → ela; com id → o servidor; recusa/rede/inválida → `null`);
  `CustosViagens.js` e `PreviewRota.js` sem as listas, usando o util; `handleClienteChange` guarda o id pedido num `useRef` e a resposta que
  não é do último escolhido não faz nada (K1); a `PreviewRota` filtra os sem coordenada dos marcadores, da rota e do total, e marca na
  legenda. Testes: `coordenadasDoCliente.test.js` (cliente sem endereço → pergunta ao servidor; 403/500 → `null`; rede → `null` (a camada
  repete a rede uma vez em 1,2 s — Fase 2 M9); já com coordenada → nenhum pedido; inválida → `null`); `PreviewRota.test.js` (o
  `react-leaflet` simulado na fronteira da biblioteca — **só** marcadores, `Polyline` e legenda, não o centro/zoom, que o `MapContainer` do
  v4 só lê na montagem, Fase 2 M8: dois clientes, um sem endereço com coordenada do servidor em Campinas e um recusado → um marcador na
  posição do servidor, a legenda com *"(sem localização no mapa)"* no recusado, *"Total: 2 ponto(s) na rota"*).
- [x] **T4 (`10b6f756`) (galho — servidor) — RN-157.04.** `index.js`: `normalizarNome` no `require` de `./services/coordenadas`; `clientes-proximos`: a
  mesma cidade e o endereço por `normalizarNome`, o estado por `trim().toUpperCase()`. Teste no `coordenadasPrazo.api.test.js` (o `index.js`
  montado): o principal *"São Paulo"* com endereço *"Rua São João 1"*, um *"Sao Paulo"* com outro endereço, um *"SAO PAULO "* sem endereço,
  um *"Sao Paulo"* com estado *" sp"* e endereço *"RUA SAO JOAO 1"* → `distancia_km` 5, 2 e 2 (antes 0, 0 e 0).
- [x] **T5 (`a04ab574`, no mesmo commit da T3) (integração — cruza T2 e T3) —** no `CustosViagensEdicao.test.js`: o cadastro novo, escolher um cliente **sem endereço** → o
  `coordenadas-cliente` dele é pedido (antes não); a corrida (K1): escolher A (coordenada lenta) e logo B (rápida) → o último
  `verificar-elegibilidade` aplicado é o de B e o `POST` leva `clientes_viagem` com B; adicionar um próximo; **Salvar** → a *Preview da
  Rota* (a `PreviewRota` real, o `react-leaflet` simulado) com os dois marcadores nas coordenadas do servidor, nenhum em São Bernardo.
  Depois a bateria inteira, serial.

Independência: T1 e T2 mexem na mesma função (`calcularRota`) — T2 depois de T1. T3 mexe em `obterCoordenadasCliente`, `handleClienteChange`
e na `PreviewRota` (regiões disjuntas da T2, regra própria — K1 é da T3), T4 no servidor. Etapa pequena — todas executadas aqui, em
sequência (sem executor paralelo: o custo de uma worktree a mais não se paga em quatro tasks de uma tela).

## Pontos de atenção

1. O teste de tela simula o 503 só se precisar — com `retryAfter` pequeno (o `0` vira 3 s); a rede caída repete uma vez depois de 1,2 s.
2. A `CustosViagens` chama `/custos-viagens`, `/custos-viagens/resumo`, `/custos-viagens/analise/cliente`, `/clientes`, `/propostas`,
   `/atividades`, `/custos-viagens/:id/logs-autorizacao`, `/custos-viagens/calcular-rota` (a query **na URL**, não em `params`),
   `/custos-viagens/verificar-elegibilidade/:id` (responder `{ todas_obrigatorias_atendidas: true, regras: {} }`, senão o Salvar abre o modal
   de autorização — Fase 2 I9), `/custos-viagens/clientes-proximos/:id` e `/custos-viagens/coordenadas-cliente/:id`; o cliente do custo tem de
   estar em `/clientes` (o `<select required>`). O resto: `[]`.
3. O `coordenadasPrazo` sobe o `index.js` com `NOMINATIM_URL` local — o `clientes-proximos` não chama o serviço de mapas.
4. Os clientes de São Paulo do T4 ficam a ~85 km de Campinas — entram nos próximos de Campinas (raio 100); o cenário de Campinas só confere
   Jundiaí sim e Ribeirão Preto não, continua valendo.
5. **Declarar em D** (Fase 2): a coordenada do servidor pode ser o centro do estado ou do Brasil, e a Preview a desenha como posição (I8); o
   cliente sem cidade ou estado não entra na lista da viagem (M10, de antes); o `Atualizar` depois do Aplicar registra no histórico
   *"50 → 50.00"* (M7, de antes — a comparação do servidor é por texto); a numeração com buracos (M11).

## Execução (o que divergiu do plano)

- **Tudo em sequência, aqui** (como o plano previa): T1 → T2 → T3 (com o T5 no mesmo commit — os cenários de integração moram no mesmo
  arquivo de teste da tela) → T4. **0** retrabalho entre tasks.
- **T2 — o (h) saiu.** O cenário *"editar com volta, Cancelar, Novo → a Data da Volta vazia"* (Fase 2 I7) **não se reproduz**: o modal do
  formulário desmonta ao fechar, então o campo do Novo nasce vazio mesmo sem o `data_volta: ''` no `resetForm` (o controle K6 passou verde).
  **A I7 da Fase 2 era ruído**; a linha ficou (inofensiva — evita o campo sem valor controlado). Também no modal da passagem, o quadro de uma
  rota anterior sai da tela (`setRotaCalculada(null)` no ramo do modal) — pequeno, coberto depois pela Fase 5 (r3 K).
- **Controles positivos (todos caíram pela asserção certa):** **K-T1** sem a taxa no aéreo → o unitário do aéreo (*"840.00"* no lugar de
  *"915.00"*). **K-T2** o `CustosViagens.js` de antes da etapa → 9 dos 10; a abertura que sempre aplica → 7; sem descartar a resposta velha →
  os 3 da corrida; o recálculo que não apaga a frase → (c); o Aplicar aéreo sem confirmar → (g); a assinatura do custo cru → 7; o Aplicar e a
  confirmação sem a função da T1 → (b)/(g) e (f); **equivalentes:** o `resetForm` sem avançar o contador (o ramo sem cliente do efeito avança
  — a Fase 5 r3 mostrou que a afirmação ficava circular e acrescentou o cenário D, que prende o ramo sozinho) e o `resetForm` sem a data da
  volta (acima). **K-T3** a `PreviewRota` de antes → o cenário dela; a tela de antes da T3 → os 2 da integração; sem a guarda do escolhido →
  o K1; o util só com endereço → 7; sem validar → o unitário; o total de todos, a legenda sem a marca → o da prévia; o recusado num ponto
  inventado → 3; **equivalente (declarado no commit)**: a guarda na elegibilidade — **estava errado** (Fase 5 r3 C34: com a coordenada
  rápida, o pedido de A sai). **K-T4** a cidade, o estado e o endereço como antes → cada um derruba o cenário de São Paulo.
- **Nenhuma consulta A nova** (nada a migrar; nenhum dado gravado muda).

## Fase 5 — revisão adversarial (três revisores frescos, em paralelo, sob a trava)

- **r1 (regra) — 2 Important + 1 Minor, reproduzidos.** **I-1 (de antes) — C376:** o POST/PUT gravam `tipo_viagem` em maiúsculas
  (`normalizarMaiusculas`) e o `calcular-rota` só reconhecia `'ida_e_volta'`: todo custo de ida e volta aberto para editar recalculava como
  só ida (sonda no servidor: Curitiba 397,72 × 1.005,45; na tela: o seletor em *"Ida"*, a data da volta sumia) — o Aplicar gravaria isso.
  **I-2 (de antes):** escolher A e depois um cliente **sem cidade** deixava a lista e as regras de A (o Salvar gravava sem pedir a
  autorização de C). **M-1 (a janela que a T3 alargou):** até a coordenada de B chegar, o Salvar usava a lista e as regras de A. Conferido
  certo: `valoresDaRota` bate ao centavo com o `calcular-rota` real; o Atualizar sem mexer não gera histórico; StrictMode; `normalizarNome`
  com `null`.
- **r2 (autorização) — 0 achados de acesso + 3 observações.** Sonda no `index.js` montado (NOMINATIM local): sem o Comercial, 403 nas quatro
  formas de `coordenadas-cliente` com **0** pedidos ao serviço de mapas; o cliente sem endereço não gera pedido externo (a tela pergunta mais
  ao servidor, não mais à internet); texto escapado; nenhum campo novo gravável. **O-1** a coordenada que falhou é pedida de novo ao salvar e
  na prévia (D); **O-2** `coordenadas-cliente` sem cache — cada chamada com endereço é uma consulta externa (de antes — **C377**); **O-3** = r1
  I-2.
- **r3 (sabotagem, worktree própria `CRM-wt-e157-r3`) — 56 sabotagens novas: 17 caíram, 22 sobreviveram por falta de asserção (todas
  provadas por sonda), 17 equivalentes.** As faltas: cada campo da assinatura além do número de pessoas (C01–C07); o erro e o fim de um
  cálculo velho (C10, C11); o ramo sem dados do efeito sozinho (C12); o Aplicar **terrestre** que não confirma a passagem (C19); o Cancelar no
  meio (C20); as guardas da elegibilidade e dos próximos — **a equivalência declarada no commit da T3 estava errada** (C22, C23, C24, C34); o
  quadro atrás do modal (C26); o **valor** da taxa no modal (C27); a simetria dos próximos e o estado legado em minúsculas (S02–S04); a prévia
  com a lista trocada (P03); o id vazio (U03); e (V02) o estacionamento no aéreo. Equivalentes (declarados): V02 pelo contrato do servidor
  (passou a ser preso pela fixture), U01, U02, P04, P05, P07, P08, C08, C13, C14–C17, C21, C28, C29, C33.
- **Correção da Fase 5 (`fab87f82`):** o `calcular-rota` compara o tipo sem caixa e a edição o põe em minúsculas (C376); o escolhido entra na
  lista e tem as regras pedidas **na hora**, em paralelo com a coordenada, e o anterior sai (I-2, M-1); o Salvar do cadastro espera as regras
  com *"Aguarde a verificação das regras do cliente antes de salvar."* (**B1006**); o fim da verificação e dos próximos de quem já não é o
  escolhido não desliga o "verificando". Asserções novas: as 22 do r3 (as sondas dele, adotadas — o `interceptar` passou a contar o pedido
  que atende), o tipo em maiúsculas (tela e servidor), o cliente sem cidade, a espera do Salvar, as regras de A que não valem enquanto as de
  B não chegam. **Controles (todos caíram pelo cenário deles):** **P1** a rota sem caixa no tipo → o do servidor (*"IDA_E_VOLTA 397.72 x
  ida_e_volta 1005.45"*); **P2** a edição sem minúsculas → o da tela; **P3** o escolhido fora da lista → M-1; **P4** a elegibilidade só depois
  da coordenada → K1, I-2 e M-1; **P5** o Salvar sem esperar → M-1; **P6** sem zerar as regras do anterior → o *"nada de Registrar Viagem"*;
  **P7** o `finally` sem a guarda → M-1; e as 22 sabotagens do r3, de novo, contra a produção corrigida → cada uma derruba o cenário dela
  (C01–C07 o A/A7, C10 o B, C11 o C, C12 o D, C19 o E, C20 o F, C34 o K1 e o I, C22 o J, C23 o G, C24 o H, C26 o K, C27 o L, P03, U03, S02–S04
  o da simetria, V02 o unitário do aéreo).
- **Não reabrir (fora, declarado):** o resumo por tipo (`CASE WHEN tipo_viagem = 'ida'`) — nenhuma tela usa os três totais (D (157)).

## Suítes (lidas na saída, `scratchpad/e157/bateria-*/`)

- **Antes do commit `10b6f756` (bateria 1 — cobre `4c9de31d`..`10b6f756`; as T1–T3 tinham rodado antes os testes delas, o build e a trava):**
  `test:api` **477/477** arquivos (`coordenadasPrazo` 12/0); `test:almoxarifado` **44/0**; `test:validation`/`safealter`/`sqlite` **4/0, 3/0,
  16/0**; revisão obrigatória da proposta **23/23** + editor **39/39**; client **152** suítes / **1933** testes; `CI=true build` *Compiled
  successfully*.
- **Antes de `fab87f82` (bateria 2, depois da Fase 5 — também a do fechamento; depois só mudaram documentos):** `test:api` **477/477**
  (`coordenadasPrazo` **14/0**); `test:almoxarifado` **44/0**; **4/0, 3/0, 16/0**; proposta **23/23** + editor **39/39**; client **152** suítes /
  **1956** testes (`CustosViagensEdicao` 32, `PreviewRota` 3, `valoresDaRota` 3, `coordenadasDoCliente` 5); `CI=true build` *Compiled
  successfully*.

## Retro (4 números)

1. **Rodadas de correção até verde:** **1** — a Fase 5 (o tipo em maiúsculas, as regras do cliente escolhido, a espera do Salvar e as 22
   asserções). As quatro tasks ficaram verdes na primeira aplicação, com controle positivo cada. Testes antigos mudados: **1** (o K1 do T5,
   que afirmava que a elegibilidade de A nunca era pedida — com a correção ela é pedida na hora e descartada).
2. **Achados da revisão:** Fase 2 — **1 Critical + 9 Important + 11 Minor**, reais menos **1** (a I7, que não se reproduz — o modal
   desmonta). Fase 5 — r1 **3** reais (2 de antes); r2 **0** de acesso + 3 observações (1 = r1 I-2, 1 vira C377); r3 **22** faltas de asserção
   reais (provadas) + **17** equivalentes; **0** ruído. **O que mais pesou:** um campo gravado por um caminho (o tipo em maiúsculas pelo POST)
   e lido por outro (o cálculo em minúsculas) — nenhuma das duas pontas tinha teste da outra; e uma equivalência declarada sem sonda (a
   guarda da elegibilidade) estava errada.
3. **Paralelismo:** **0** galhos de código em paralelo (quatro tasks pequenas de uma tela e uma rota — o plano decidiu assim); **1** revisor na
   Fase 2 (antes do código), **3** em paralelo na Fase 5 sob a trava (o r3 em worktree própria).
4. **Defeito que escapou:** **0** no que a 157 entregou (medido na Etapa 158: as três revisões da 158 passaram pela mesma tela e pelo mesmo
   servidor e não acharam defeito da edição, dos valores da rota nem da localização). A 158 achou, **de antes**, na mesma tela, o filtro *Tipo de
   viagem* que o servidor nem lia (**C378**) — a medição da 157 olhou a edição e as cidades, não os filtros da lista.

## Próxima tarefa detalhada — Etapa 158

*(A série desta etapa foi B1004–B1007, C374–C377, nenhuma A — a 158 começa em **B1008**, **C378**, **A104**; confira com `grep -oE` antes.)*

**Escolhida: as sobras técnicas dos custos de viagem, nenhuma do P.O.** (1) **C377** — guardar a coordenada do endereço do cliente para não
consultar o serviço de mapas a cada abertura: candidata — colunas novas em `clientes` (`geo_lat`, `geo_lon`, `geo_endereco` = o termo
normalizado que gerou a coordenada; ALTER no callback do CREATE, como manda a prova de primeiro boot), preenchidas por
`obterCoordenadasExatas` quando o serviço responde, e **valendo só enquanto o endereço, a cidade e o estado do cadastro gerarem o mesmo
termo** (mudou o endereço → consulta de novo); a falha (prazo, 429, lista vazia) **não** grava. Medir antes: quantos chamadores
(`coordenadas-cliente` e algum outro?) e se o cadastro de cliente tem outro caminho de gravação de endereço (PUT, importação). Teste no
`coordenadasPrazo` (o `index.js` montado, `NOMINATIM_URL` local): duas chamadas → **1** pedido ao serviço local; mudar o endereço pelo PUT
→ **2**; o serviço pendurado não grava. Registrar em B (reversível; o dado novo é só cache). (2) **O resumo por tipo** (`GET
/api/custos-viagens/resumo`, `CASE WHEN tipo_viagem = 'ida'`): comparar sem caixa (`LOWER(tipo_viagem)`) — barato, mesmo nenhuma tela
usando; teste no `custosViagensPortao` (que já confere o resumo contra o banco). (3) **O histórico falso "50 → 50.00"** do `PUT
/custos-viagens/:id` (compara texto): comparar os campos numéricos como número; teste: Atualizar com `"50.00"` sobre `50` → nenhuma linha
no `custos_viagens_historico`.
**Pontos de atenção:** (1) a tela dos custos agora pergunta `coordenadas-cliente` para todo cliente (sem endereço não consulta o serviço
de mapas) — um cache não pode mudar o contrato `200 { coordenadas, lat, lon }`; (2) `coordenadasPrazo` sobe o `index.js` com
`NOMINATIM_URL` local — **nunca** sem ela num cenário com endereço; (3) a lista `CIDADES` (345, com UF) e o teste que confere cada linha;
(4) o `CustosViagensEdicao.test.js` tem o padrão da tela com o `api.js` real (`interceptar` conta o pedido que atende).

**Dependem do P.O. — NÃO implemente:** a lista inteira do plano da 152 — **B853**/**C279**, **B808**, **B755**, **B761**/**C239**, **C224**, o
resto da **C225**, **C228**, **C219**, **C230**, o reparo da **C246** e a **C247**, a tabela de conversões e o grupo acima de família, a régua do
tempo de recebimento (E2), **C268**, **C269**, **C275**, **C276**, **C277**, **C109**, **C117**/**C118**, **C139**, **C278**; na 05, os itens de
produto e a **C198**; na 06, a **B11** e a Engenharia; na 21, a valorização por cliente e previsto × realizado; na 22, **B13**, **B101**/G30,
**G38**; no Compras, D-35, D-37, D-78, D-90, G9/G30, G4, G15, B63, B60, B62, a **C348**; nas propostas, a verificação do dono da proposta (Fase
12 — também a **C305**), o filtro por permissão do histórico, a **B910**, a **C307**, a Frente B da lentidão, a **C297** (**B924**), a **B926**,
a **C312**, a **C316**, a régua de quantidade da **C314**, a **B949** e a **C330**; no Operacional, a **C332**; do Comercial, a **C354**, a
**C357**/**B988**, a **C359**/**B989** (e a **C360** junto), a **C358**; do núcleo, a **C362**. Pendem de Postgres: **C98**, **C110**. **Nada novo
do P.O. nesta etapa** (a **B1004** a **B1006** são reversíveis e estão na letra B).

**O que já está pronto e não precisa reabrir:** a edição que só sugere, o contador da resposta velha e o Aplicar aéreo que confirma
(`00dbce2b`, `fab87f82`); os valores da rota numa função só (`4c9de31d`); a localização pelo servidor e o cliente escolhido que vale
(`a04ab574`, `fab87f82`); a mesma cidade nos próximos (`10b6f756`); o tipo sem caixa no cálculo (`fab87f82`).
