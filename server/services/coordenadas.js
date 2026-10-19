/**
 * Coordenadas de cliente/cidade para os custos de viagem, a rota, o valor da visita tecnica e os mapas.
 *
 * Etapa 156 — saiu do `index.js` (as tres funcoes, com o mapa verbatim) para ganhar teste e:
 *
 * RN-156.03 (C361, C371): a consulta do endereco ao servico de mapas (Nominatim) tem PRAZO — `NOMINATIM_PRAZO_MS` (padrao 5000), contado
 *   do pedido inteiro (conexao, cabecalho e corpo; um `req.setTimeout` so veria a conexao ociosa e nao pegaria o servidor que pinga um
 *   byte por vez). Esgotado, aborta e devolve null — `obterCoordenadasExatas` cai na cidade. A resposta que nao e 200, o corpo que nao e
 *   JSON e a lista vazia tambem dao null. `NOMINATIM_URL` troca o endereco (http/https; outro protocolo ou malformada -> o padrao) — e o que
 *   os testes usam para simular a fronteira HTTP com um servidor local; o Nominatim de verdade nunca e chamado em teste. As duas variaveis
 *   sao lidas a cada consulta. O termo vai com os espacos como espacos (antes: `replace(/\s+/g, '+')` e depois `encodeURIComponent`, que
 *   mandava o `+` literal, %2B).
 *
 * RN-156.04 (C370): a coordenada pela cidade compara o nome sem caixa, sem acento e sem espaco nas pontas — o cadastro grava a cidade em
 *   maiusculas e sem acento ("SAO BERNARDO DO CAMPO"), e a comparacao exata de antes nao achava NENHUMA (0 de 53 no banco medido; todas
 *   caiam no centro do estado). Com o estado conhecido, a cidade so vale se for DESSE estado (a lista tem a UF de cada cidade — Fase 5 r1
 *   I-1: o raio de 1.000 km do centro do estado, da Fase 2, deixava passar o homonimo de estado vizinho, ex. RIO CLARO/RJ -> Rio Claro/SP);
 *   sem estado conhecido, a cidade pelo nome (como antes).
 *
 * Etapa 158 — RN-158.01/02 (C377): a coordenada do endereco fica guardada no cadastro do cliente (geo_lat, geo_lon e geo_termo — o termo
 *   que a gerou). `termoDaConsulta` e a UMA funcao que monta o termo (a consulta e a memoria usam a mesma — mudou o endereco, a cidade ou o
 *   estado, muda o termo e a memoria deixa de valer); `coordenadaGuardada` diz se a memoria vale para o termo atual (o termo nao nulo, o
 *   geo_termo texto igual a ele, a latitude e a longitude numeros finitos e na faixa — Fase 2 M5, o lixo gravado por fora e a Fase 5 r1 M2).
 *   A resposta do servico fora da faixa e respondida como antes, mas nao e guardada.
 */
const http = require('http');
const https = require('https');

const NOMINATIM_PADRAO = 'https://nominatim.openstreetmap.org/search';
const PRAZO_PADRAO_MS = 5000;
// o maior atraso que o setTimeout do Node aceita (acima, ele dispara em 1 ms — Fase 5 r1 M-1)
const MAIOR_PRAZO_MS = 2147483647;

const coordenadasEstados = {
  'AC': [-8.77, -70.55], 'AL': [-9.57, -36.78], 'AP': [1.41, -51.77], 'AM': [-3.47, -65.10],
  'BA': [-12.96, -38.51], 'CE': [-3.71, -38.54], 'DF': [-15.79, -47.86], 'ES': [-19.19, -40.34],
  'GO': [-16.64, -49.31], 'MA': [-2.55, -44.30], 'MT': [-12.64, -55.42], 'MS': [-20.51, -54.54],
  'MG': [-18.10, -44.38], 'PA': [-5.53, -52.33], 'PB': [-7.24, -36.78], 'PR': [-24.89, -51.55],
  'PE': [-8.28, -35.07], 'PI': [-8.28, -43.68], 'RJ': [-22.90, -43.17], 'RN': [-5.22, -36.52],
  'RS': [-30.01, -51.22], 'RO': [-11.22, -62.80], 'RR': [1.99, -61.33], 'SC': [-27.33, -49.44],
  'SP': [-23.55, -46.63], 'SE': [-10.57, -37.38], 'TO': [-10.25, -48.25]
};

// Coordenadas de principais cidades brasileiras, com a UF de cada uma (Etapa 156, Fase 5 r1 I-1). Ate a 156 isto era um objeto so por nome,
// com 570 entradas para 344 nomes (a maioria do MT copiadas 2 a 4 vezes) e 'Rio Branco' duas vezes — a capital do Acre e a do MT; o objeto
// guardava so a ultima. Agora uma linha por cidade distinta (345: o Rio Branco do AC volta), [nome, UF, lat, lon] — a UF conferida a mao e
// pelo teste (nenhuma cidade a mais de 700 km do centro do proprio estado).
const CIDADES = [
  ['São Paulo', 'SP', -23.5505, -46.6333],
  ['Rio de Janeiro', 'RJ', -22.9068, -43.1729],
  ['Brasília', 'DF', -15.7942, -47.8822],
  ['Salvador', 'BA', -12.9714, -38.5014],
  ['Fortaleza', 'CE', -3.7172, -38.5433],
  ['Belo Horizonte', 'MG', -19.9167, -43.9345],
  ['Manaus', 'AM', -3.119, -60.0217],
  ['Curitiba', 'PR', -25.4284, -49.2733],
  ['Recife', 'PE', -8.0476, -34.877],
  ['Porto Alegre', 'RS', -30.0346, -51.2177],
  ['Belém', 'PA', -1.4558, -48.5044],
  ['Goiânia', 'GO', -16.6864, -49.2643],
  ['Guarulhos', 'SP', -23.4538, -46.5331],
  ['Campinas', 'SP', -22.9056, -47.0608],
  ['São Luís', 'MA', -2.5387, -44.2825],
  ['São Gonçalo', 'RJ', -22.8269, -43.0539],
  ['Maceió', 'AL', -9.5713, -36.782],
  ['Duque de Caxias', 'RJ', -22.7856, -43.3047],
  ['Natal', 'RN', -5.7945, -35.211],
  ['Teresina', 'PI', -5.0892, -42.8019],
  ['Campo Grande', 'MS', -20.4428, -54.6458],
  ['Nova Iguaçu', 'RJ', -22.7556, -43.4603],
  ['São Bernardo do Campo', 'SP', -23.715, -46.555],
  ['João Pessoa', 'PB', -7.1195, -34.845],
  ['Santo André', 'SP', -23.6669, -46.5322],
  ['Osasco', 'SP', -23.5329, -46.7915],
  ['Jaboatão dos Guararapes', 'PE', -8.1127, -35.0147],
  ['São José dos Campos', 'SP', -23.1791, -45.8872],
  ['Ribeirão Preto', 'SP', -21.1775, -47.8103],
  ['Uberlândia', 'MG', -18.9128, -48.2755],
  ['Sorocaba', 'SP', -23.5015, -47.4526],
  ['Contagem', 'MG', -19.9317, -44.0539],
  ['Aracaju', 'SE', -10.9091, -37.0677],
  ['Feira de Santana', 'BA', -12.2664, -38.9661],
  ['Cuiabá', 'MT', -15.6014, -56.0979],
  ['Joinville', 'SC', -26.3044, -48.8467],
  ['Juiz de Fora', 'MG', -21.7595, -43.3398],
  ['Londrina', 'PR', -23.3045, -51.1696],
  ['Aparecida de Goiânia', 'GO', -16.8194, -49.2439],
  ['Niterói', 'RJ', -22.8834, -43.1034],
  ['Ananindeua', 'PA', -1.3656, -48.3728],
  ['Porto Velho', 'RO', -8.7619, -63.9039],
  ['Serra', 'ES', -20.1289, -40.3078],
  ['Caxias do Sul', 'RS', -29.168, -51.1798],
  ['Campos dos Goytacazes', 'RJ', -21.7523, -41.3304],
  ['Macapá', 'AP', 0.0349, -51.0694],
  ['Vila Velha', 'ES', -20.3297, -40.2925],
  ['Florianópolis', 'SC', -27.5954, -48.548],
  ['Mauá', 'SP', -23.6677, -46.4613],
  ['São João de Meriti', 'RJ', -22.8039, -43.3722],
  ['São José do Rio Preto', 'SP', -20.8113, -49.3757],
  ['Mogi das Cruzes', 'SP', -23.5229, -46.188],
  ['Betim', 'MG', -19.9678, -44.1977],
  ['Diadema', 'SP', -23.6864, -46.6228],
  ['Campina Grande', 'PB', -7.2307, -35.8817],
  ['Jundiaí', 'SP', -23.1864, -46.8842],
  ['Maringá', 'PR', -23.4205, -51.9333],
  ['Montes Claros', 'MG', -16.7281, -43.863],
  ['Carapicuíba', 'SP', -23.5235, -46.8407],
  ['Olinda', 'PE', -8.0089, -34.8553],
  ['Cariacica', 'ES', -20.2639, -40.4164],
  ['Rio Branco', 'AC', -9.9747, -67.81],
  ['Anápolis', 'GO', -16.3286, -48.9534],
  ['Bauru', 'SP', -22.3147, -49.0606],
  ['Vitória', 'ES', -20.3155, -40.3128],
  ['Caucaia', 'CE', -3.7327, -38.661],
  ['Canela', 'RS', -29.3658, -50.8139],
  ['Blumenau', 'SC', -26.9194, -49.0661],
  ['Franca', 'SP', -20.5352, -47.4039],
  ['Ponta Grossa', 'PR', -25.0916, -50.1668],
  ['Petrolina', 'PE', -9.3887, -40.5007],
  ['Uberaba', 'MG', -19.7477, -47.9392],
  ['Paulista', 'PE', -7.934, -34.8684],
  ['Cascavel', 'PR', -24.9578, -53.4595],
  ['Praia Grande', 'SP', -24.0089, -46.4122],
  ['São José de Ribamar', 'MA', -2.5619, -44.0542],
  ['Foz do Iguaçu', 'PR', -25.5163, -54.5854],
  ['Várzea Grande', 'MT', -15.6458, -56.1325],
  ['Petrópolis', 'RJ', -22.505, -43.1786],
  ['Limeira', 'SP', -22.5647, -47.4017],
  ['Volta Redonda', 'RJ', -22.5231, -44.1042],
  ['Governador Valadares', 'MG', -18.8548, -41.9559],
  ['Taubaté', 'SP', -23.0264, -45.5553],
  ['Imperatriz', 'MA', -5.5185, -47.4775],
  ['Gravataí', 'RS', -29.9444, -50.9919],
  ['Embu das Artes', 'SP', -23.6437, -46.8579],
  ['Viamão', 'RS', -30.0811, -51.0234],
  ['São Vicente', 'SP', -23.9631, -46.3919],
  ['Taboão da Serra', 'SP', -23.6019, -46.7526],
  ['Novo Hamburgo', 'RS', -29.6914, -51.1306],
  ['Santa Maria', 'RS', -29.6842, -53.8069],
  ['Barueri', 'SP', -23.5107, -46.8761],
  ['Guarujá', 'SP', -23.9931, -46.2564],
  ['Ribeirão das Neves', 'MG', -19.7669, -44.0869],
  ['Sumaré', 'SP', -22.8214, -47.2668],
  ['Caruaru', 'PE', -8.2842, -35.9699],
  ['Araçatuba', 'SP', -21.2087, -50.4325],
  ['Colombo', 'PR', -25.2925, -49.2262],
  ['Itaquaquecetuba', 'SP', -23.4864, -46.3483],
  ['Americana', 'SP', -22.7379, -47.3311],
  ['Araraquara', 'SP', -21.7944, -48.1756],
  ['Itaboraí', 'RJ', -22.7475, -42.8592],
  ['Santa Bárbara d\'Oeste', 'SP', -22.7536, -47.4136],
  ['Nova Friburgo', 'RJ', -22.2819, -42.5303],
  ['Jacareí', 'SP', -23.3051, -45.9658],
  ['Arapiraca', 'AL', -9.752, -36.6612],
  ['Barra Mansa', 'RJ', -22.5444, -44.1714],
  ['São Caetano do Sul', 'SP', -23.6231, -46.5512],
  ['Cabo Frio', 'RJ', -22.8894, -42.0286],
  ['Itabuna', 'BA', -14.7874, -39.2781],
  ['Rio Claro', 'SP', -22.4103, -47.5604],
  ['Araguaína', 'TO', -7.192, -48.2044],
  ['Passo Fundo', 'RS', -28.2628, -52.4067],
  ['Luziânia', 'GO', -16.2525, -47.9503],
  ['Paranaguá', 'PR', -25.5167, -48.5167],
  ['Dourados', 'MS', -22.2208, -54.8058],
  ['Rio Verde', 'GO', -17.7979, -50.9278],
  ['Chapecó', 'SC', -27.1004, -52.6153],
  ['Criciúma', 'SC', -28.6775, -49.3697],
  ['Itajaí', 'SC', -26.9103, -48.6626],
  ['Sete Lagoas', 'MG', -19.4658, -44.2467],
  ['Divinópolis', 'MG', -20.1436, -44.8908],
  ['Macaé', 'RJ', -22.3708, -41.7869],
  ['São José dos Pinhais', 'PR', -25.5347, -49.2056],
  ['Pindamonhangaba', 'SP', -22.9246, -45.4613],
  ['Jequié', 'BA', -13.8578, -40.0853],
  ['Palmas', 'TO', -10.1844, -48.3336],
  ['Teixeira de Freitas', 'BA', -17.535, -39.7419],
  ['Barretos', 'SP', -20.5572, -48.5678],
  ['Patos de Minas', 'MG', -18.5778, -46.5181],
  ['Alagoinhas', 'BA', -12.1356, -38.4192],
  ['Bragança Paulista', 'SP', -22.9527, -46.5442],
  ['Parnaíba', 'PI', -2.9048, -41.7767],
  ['Poços de Caldas', 'MG', -21.7878, -46.5614],
  ['Caxias', 'MA', -4.859, -43.36],
  ['Valparaíso de Goiás', 'GO', -16.065, -47.975],
  ['Marília', 'SP', -22.2139, -49.9456],
  ['Catanduva', 'SP', -21.1378, -48.9728],
  ['Barra do Piraí', 'RJ', -22.4706, -43.8256],
  ['Bento Gonçalves', 'RS', -29.1714, -51.5192],
  ['Araucária', 'PR', -25.5858, -49.4047],
  ['Garanhuns', 'PE', -8.8828, -36.5028],
  ['Vitória de Santo Antão', 'PE', -8.1178, -35.2914],
  ['Itapevi', 'SP', -23.5489, -46.9342],
  ['Toledo', 'PR', -24.7139, -53.7431],
  ['Guaíba', 'RS', -30.1136, -51.325],
  ['Santos', 'SP', -23.9608, -46.3331],
  ['Suzano', 'SP', -23.5428, -46.3108],
  ['São Carlos', 'SP', -22.0175, -47.891],
  ['Mogi Guaçu', 'SP', -22.3714, -46.9425],
  ['Pouso Alegre', 'MG', -22.2306, -45.9356],
  ['Angra dos Reis', 'RJ', -23.0069, -44.3178],
  ['Eunápolis', 'BA', -16.3706, -39.5806],
  ['Salto', 'SP', -23.2003, -47.2869],
  ['Ourinhos', 'SP', -22.9789, -49.8706],
  ['Parnamirim', 'RN', -5.9167, -35.2667],
  ['Poá', 'SP', -23.5281, -46.3447],
  ['Cataguases', 'MG', -21.3892, -42.6897],
  ['Atibaia', 'SP', -23.1169, -46.5503],
  ['Erechim', 'RS', -27.6344, -52.2694],
  ['Santa Rita', 'PB', -7.1139, -34.9778],
  ['Barbacena', 'MG', -21.2214, -43.7736],
  ['Araras', 'SP', -22.3572, -47.3842],
  ['Piraquara', 'PR', -25.4425, -49.0625],
  ['Abaetetuba', 'PA', -1.7217, -48.8789],
  ['Tatuí', 'SP', -23.3547, -47.8561],
  ['Birigui', 'SP', -21.2889, -50.34],
  ['Resende', 'RJ', -22.4689, -44.4469],
  ['Votorantim', 'SP', -23.5467, -47.4378],
  ['Caraguatatuba', 'SP', -23.6203, -45.4131],
  ['Trindade', 'GO', -16.6517, -49.4928],
  ['Votuporanga', 'SP', -20.4231, -49.9781],
  ['Tubarão', 'SC', -28.4806, -49.0069],
  ['Aracruz', 'ES', -19.82, -40.2739],
  ['Cachoeiro de Itapemirim', 'ES', -20.8489, -41.1128],
  ['Rio das Ostras', 'RJ', -22.5269, -41.945],
  ['Simões Filho', 'BA', -12.7867, -38.4039],
  ['Guaratinguetá', 'SP', -22.8164, -45.1925],
  ['Arapongas', 'PR', -23.4194, -51.4244],
  ['Cubatão', 'SP', -23.8953, -46.4253],
  ['Santa Cruz do Sul', 'RS', -29.7178, -52.4258],
  ['Itu', 'SP', -23.2642, -47.2992],
  ['Jaraguá do Sul', 'SC', -26.485, -49.0669],
  ['Conselheiro Lafaiete', 'MG', -20.6603, -43.7861],
  ['Linhares', 'ES', -19.3914, -40.0722],
  ['Guarapari', 'ES', -20.6597, -40.5025],
  ['Cachoeirinha', 'RS', -29.9506, -51.0939],
  ['Paragominas', 'PA', -2.9989, -47.3531],
  ['Umuarama', 'PR', -23.7656, -53.325],
  ['Sapucaia do Sul', 'RS', -29.8406, -51.1458],
  ['Crato', 'CE', -7.2306, -39.4097],
  ['Paranavaí', 'PR', -23.0819, -52.4617],
  ['Maracanaú', 'CE', -3.8769, -38.6256],
  ['Bagé', 'RS', -31.3319, -54.1069],
  ['Cametá', 'PA', -2.2439, -49.4958],
  ['Mossoró', 'RN', -5.1878, -37.3439],
  ['Magé', 'RJ', -22.6531, -43.0406],
  ['Corumbá', 'MS', -19.0081, -57.6514],
  ['Ariquemes', 'RO', -9.9139, -63.0406],
  ['Ji-Paraná', 'RO', -10.8853, -61.9517],
  ['Sinop', 'MT', -11.8639, -55.5031],
  ['Cáceres', 'MT', -16.0714, -57.6819],
  ['Rondonópolis', 'MT', -16.4706, -54.6358],
  ['Três Lagoas', 'MS', -20.7847, -51.7006],
  ['Ponta Porã', 'MS', -22.5361, -55.7258],
  ['Naviraí', 'MS', -23.0619, -54.1917],
  ['Paranaíba', 'MS', -19.6744, -51.1908],
  ['Aquidauana', 'MS', -20.4706, -55.7869],
  ['Ladário', 'MS', -19.0081, -57.6014],
  ['Mirassol d\'Oeste', 'MT', -15.6758, -58.0958],
  ['Tangará da Serra', 'MT', -14.6219, -57.4258],
  ['Barra do Garças', 'MT', -15.89, -52.2569],
  ['Primavera do Leste', 'MT', -15.5606, -54.3],
  ['Sorriso', 'MT', -12.5431, -55.7097],
  ['Lucas do Rio Verde', 'MT', -13.0581, -55.9158],
  ['Nova Mutum', 'MT', -13.8369, -56.0831],
  ['Sapezal', 'MT', -12.9906, -58.7631],
  ['Campo Novo do Parecis', 'MT', -13.6758, -57.8881],
  ['Diamantino', 'MT', -14.4081, -56.4458],
  ['Alta Floresta', 'MT', -9.8758, -56.0861],
  ['Colíder', 'MT', -10.8131, -55.4558],
  ['Peixoto de Azevedo', 'MT', -10.225, -54.9792],
  ['Guarantã do Norte', 'MT', -9.9625, -54.9092],
  ['Matupá', 'MT', -10.05, -54.9331],
  ['Nova Canaã do Norte', 'MT', -10.55, -55.95],
  ['Terra Nova do Norte', 'MT', -10.5169, -55.2319],
  ['Itaúba', 'MT', -11.0619, -55.2017],
  ['Nova Bandeirantes', 'MT', -9.85, -57.8167],
  ['Nova Monte Verde', 'MT', -9.9833, -57.6167],
  ['Paranaíta', 'MT', -9.6667, -56.4833],
  ['Apiacás', 'MT', -9.55, -57.45],
  ['Carlinda', 'MT', -9.7667, -55.8333],
  ['Nova Guarita', 'MT', -10.2167, -55.4167],
  ['Nova Santa Helena', 'MT', -10.8667, -55.1833],
  ['Santa Carmem', 'MT', -11.95, -55.2167],
  ['União do Sul', 'MT', -11.5167, -54.3667],
  ['Vera', 'MT', -12.3, -55.3167],
  ['Nova Ubiratã', 'MT', -12.9833, -55.25],
  ['Brasnorte', 'MT', -12.15, -57.9833],
  ['Campo Verde', 'MT', -15.55, -55.1667],
  ['Cláudia', 'MT', -11.5167, -54.8833],
  ['Feliz Natal', 'MT', -12.3833, -54.9167],
  ['Itanhangá', 'MT', -12.2167, -56.6333],
  ['Marcelândia', 'MT', -11.0167, -54.5],
  ['Nova Maringá', 'MT', -13.0167, -57.0833],
  ['Nova Marilândia', 'MT', -14.2167, -56.9833],
  ['Nova Nazaré', 'MT', -13.9833, -51.8],
  ['Planalto da Serra', 'MT', -10.4333, -55.2667],
  ['Santa Rita do Trivelato', 'MT', -13.8167, -55.2667],
  ['São José do Rio Claro', 'MT', -13.4333, -56.7167],
  ['Tabaporã', 'MT', -11.3, -56.8167],
  ['Tapurah', 'MT', -12.5333, -56.5167],
  ['Vila Rica', 'MT', -10.0167, -51.1167],
  ['Araguaiana', 'MT', -15.7333, -51.8333],
  ['Araguainha', 'MT', -16.85, -53.0333],
  ['Cocalinho', 'MT', -14.4, -51],
  ['Nova Xavantina', 'MT', -14.6667, -52.35],
  ['Novo São Joaquim', 'MT', -14.9, -53.0167],
  ['Querência', 'MT', -12.6167, -52.1833],
  ['Ribeirão Cascalheira', 'MT', -12.9333, -51.8167],
  ['Santa Terezinha', 'MT', -10.4667, -50.5167],
  ['São Félix do Araguaia', 'MT', -11.6167, -50.6667],
  ['Serra Nova Dourada', 'MT', -12.0833, -51.4],
  ['Vila Bela da Santíssima Trindade', 'MT', -15, -59.95],
  ['Comodoro', 'MT', -13.6667, -59.7833],
  ['Conquista D\'Oeste', 'MT', -14.5333, -59.5667],
  ['Curvelândia', 'MT', -15.6, -57.9167],
  ['Figueirópolis D\'Oeste', 'MT', -15.4333, -58.7333],
  ['Glória D\'Oeste', 'MT', -15.0167, -58.3167],
  ['Indiavaí', 'MT', -15.4333, -58.5833],
  ['Jauru', 'MT', -15.3333, -58.8667],
  ['Lambari D\'Oeste', 'MT', -15.3167, -58.0167],
  ['Pontes e Lacerda', 'MT', -15.2167, -59.3333],
  ['Reserva do Cabaçal', 'MT', -15.1333, -58.4167],
  ['Rio Branco', 'MT', -15.25, -58.1167],
  ['Salto do Céu', 'MT', -15.1333, -58.1333],
  ['São José dos Quatro Marcos', 'MT', -15.6167, -58.1833],
  ['Vale de São Domingos', 'MT', -15.2833, -59.0667],
  ['Acorizal', 'MT', -15.2, -56.3667],
  ['Água Boa', 'MT', -14.05, -52.1667],
  ['Alto Araguaia', 'MT', -17.3167, -53.2167],
  ['Alto Boa Vista', 'MT', -11.6667, -51.3833],
  ['Alto Garças', 'MT', -16.95, -53.5167],
  ['Alto Paraguai', 'MT', -14.5167, -56.4833],
  ['Alto Taquari', 'MT', -17.8333, -53.2833],
  ['Araputanga', 'MT', -15.4667, -58.35],
  ['Arenápolis', 'MT', -14.4333, -56.8333],
  ['Aripuanã', 'MT', -9.1667, -60.6333],
  ['Barão de Melgaço', 'MT', -16.2, -55.9667],
  ['Barra do Bugres', 'MT', -15.0833, -57.1833],
  ['Bom Jesus do Araguaia', 'MT', -12.1833, -51.5],
  ['Campinápolis', 'MT', -14.5, -52.7667],
  ['Campos de Júlio', 'MT', -13.5167, -59.1],
  ['Canabrava do Norte', 'MT', -11.0333, -51.8333],
  ['Canarana', 'MT', -13.55, -52.2667],
  ['Castanheira', 'MT', -11.1167, -58.6],
  ['Chapada dos Guimarães', 'MT', -15.4333, -55.75],
  ['Colniza', 'MT', -9.4, -60.9167],
  ['Confresa', 'MT', -10.65, -51.5667],
  ['Cotriguaçu', 'MT', -9.8667, -58.4167],
  ['Denise', 'MT', -14.7333, -57.05],
  ['Dom Aquino', 'MT', -15.8167, -54.9167],
  ['Gaúcha do Norte', 'MT', -13.1833, -53.25],
  ['General Carneiro', 'MT', -15.7167, -52.75],
  ['Guiratinga', 'MT', -16.35, -53.75],
  ['Ipiranga do Norte', 'MT', -12.2333, -56.15],
  ['Itiquira', 'MT', -17.2167, -54.1333],
  ['Jaciara', 'MT', -15.9667, -54.9667],
  ['Jangada', 'MT', -15.2333, -56.4833],
  ['Juara', 'MT', -11.25, -57.5167],
  ['Juína', 'MT', -11.3833, -58.7333],
  ['Juruena', 'MT', -10.3167, -58.4833],
  ['Juscimeira', 'MT', -16.05, -54.8833],
  ['Luciara', 'MT', -11.2167, -50.6667],
  ['Nobres', 'MT', -14.7167, -56.3333],
  ['Nortelândia', 'MT', -14.45, -56.8],
  ['Nossa Senhora do Livramento', 'MT', -15.7833, -56.3667],
  ['Nova Brasilândia', 'MT', -14.9667, -54.9167],
  ['Nova Lacerda', 'MT', -14.4667, -59.6],
  ['Nova Olímpia', 'MT', -14.7833, -57.2833],
  ['Novo Horizonte do Norte', 'MT', -11.4167, -57.35],
  ['Novo Mundo', 'MT', -9.9667, -55.5167],
  ['Novo Santo Antônio', 'MT', -12.2833, -50.9667],
  ['Paranatinga', 'MT', -14.4333, -54.05],
  ['Pedra Preta', 'MT', -16.6167, -54.4667],
  ['Poconé', 'MT', -16.25, -56.6167],
  ['Pontal do Araguaia', 'MT', -15.95, -52.0167],
  ['Ponte Branca', 'MT', -16.7667, -52.8333],
  ['Porto Alegre do Norte', 'MT', -10.8667, -51.6333],
  ['Porto dos Gaúchos', 'MT', -11.5333, -57.4167],
  ['Porto Esperidião', 'MT', -15.85, -58.4667],
  ['Porto Estrela', 'MT', -15.3167, -57.2167],
  ['Poxoréu', 'MT', -15.8333, -54.3833],
  ['Ribeirãozinho', 'MT', -16.45, -52.6833],
  ['Rondolândia', 'MT', -10.8333, -61.4667],
  ['Rosário Oeste', 'MT', -14.8333, -56.4333],
  ['Santa Cruz do Xingu', 'MT', -10.15, -52.3833],
  ['Santo Afonso', 'MT', -14.4833, -57.25],
  ['Santo Antônio do Leste', 'MT', -14.9667, -53.6167],
  ['Santo Antônio do Leverger', 'MT', -15.8667, -56.0833],
  ['São José do Povo', 'MT', -16.4667, -54.25],
  ['São José do Xingu', 'MT', -10.8, -52.7333],
  ['São Pedro da Cipa', 'MT', -16, -54.9167],
  ['Tesouro', 'MT', -16.0667, -53.55],
  ['Torixoréu', 'MT', -16.2, -52.55],
];

function normalizarNome(s) {
  return String(s == null ? '' : s).normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().toLowerCase();
}

// nome normalizado -> as cidades com esse nome, na ordem da lista ([{ uf, coord }])
const CIDADES_POR_NOME = new Map();
for (const [nome, uf, lat, lon] of CIDADES) {
  const chave = normalizarNome(nome);
  if (!CIDADES_POR_NOME.has(chave)) CIDADES_POR_NOME.set(chave, []);
  CIDADES_POR_NOME.get(chave).push({ uf, coord: [lat, lon] });
}

function urlDoNominatim() {
  const bruto = process.env.NOMINATIM_URL;
  if (!bruto) return NOMINATIM_PADRAO;
  try {
    const u = new URL(bruto);
    return u.protocol === 'http:' || u.protocol === 'https:' ? u.toString() : NOMINATIM_PADRAO;
  } catch (e) {
    return NOMINATIM_PADRAO;
  }
}

function prazoDoNominatimMs() {
  const bruto = process.env.NOMINATIM_PRAZO_MS;
  if (bruto == null || !/^\d+$/.test(String(bruto).trim())) return PRAZO_PADRAO_MS;
  const n = parseInt(String(bruto).trim(), 10);
  return n > 0 && n <= MAIOR_PRAZO_MS ? n : PRAZO_PADRAO_MS;
}

// O termo da consulta ao servico de mapas (e da memoria no cadastro): null sem um dos tres — a guarda e por verdade, como sempre foi
// (um endereco so de espacos consulta — Fase 2 M1); os espacos repetidos viram um e as pontas sao aparadas.
function termoDaConsulta(endereco, cidade, estado) {
  if (!endereco || !cidade || !estado) return null;
  return `${endereco}, ${cidade}, ${estado}, Brasil`.replace(/\s+/g, ' ').trim();
}

// Latitude entre -90 e 90 e longitude entre -180 e 180, numeros finitos (Fase 5 r1 M2: uma resposta absurda do servico de mapas nao fica
// guardada para sempre — antes da memoria, ela valia so para aquela abertura).
function coordenadaPlausivel(lat, lon) {
  return typeof lat === 'number' && typeof lon === 'number' && Number.isFinite(lat) && Number.isFinite(lon)
    && Math.abs(lat) <= 90 && Math.abs(lon) <= 180;
}

// A coordenada guardada no cadastro do cliente, se ela vale para o termo atual; senao null.
function coordenadaGuardada(cliente, termo) {
  if (!cliente || typeof termo !== 'string' || !termo) return null;
  if (typeof cliente.geo_termo !== 'string' || cliente.geo_termo !== termo) return null;
  const { geo_lat: lat, geo_lon: lon } = cliente;
  if (!coordenadaPlausivel(lat, lon)) return null;
  return [lat, lon];
}

// Função para geocodificar endereço completo usando Nominatim (OpenStreetMap)
async function geocodificarEndereco(endereco, cidade, estado) {
  const termo = termoDaConsulta(endereco, cidade, estado);
  if (!termo) {
    return null;
  }
  let url;
  try {
    url = new URL(urlDoNominatim());
    url.searchParams.set('format', 'json');
    url.searchParams.set('q', termo);
    url.searchParams.set('limit', '1');
    url.searchParams.set('countrycodes', 'br');
  } catch (err) {
    console.error('Erro na geocodificação:', err);
    return null;
  }
  const prazoMs = prazoDoNominatimMs();
  const cliente = url.protocol === 'http:' ? http : https;
  return new Promise((resolve) => {
    let fim = false;
    let req = null;
    const terminar = (valor) => {
      if (fim) return;
      fim = true;
      clearTimeout(relogio);
      resolve(valor);
    };
    const relogio = setTimeout(() => {
      console.warn(`[coordenadas] o servico de mapas nao respondeu em ${prazoMs} ms; a coordenada sai pela cidade`);
      terminar(null);
      if (req) req.destroy(new Error('prazo do servico de mapas esgotado'));
    }, prazoMs);
    try {
      req = cliente.get(url, { headers: { 'User-Agent': 'GMP-CRM/1.0' } }, (res) => {
        if (res.statusCode !== 200) {
          res.resume();
          terminar(null);
          return;
        }
        let data = '';
        res.setEncoding('utf8');
        res.on('data', (chunk) => { data += chunk; });
        res.on('error', () => terminar(null));
        res.on('end', () => {
          try {
            const results = JSON.parse(data);
            if (Array.isArray(results) && results.length > 0) {
              const lat = parseFloat(results[0].lat);
              const lon = parseFloat(results[0].lon);
              terminar(!isNaN(lat) && !isNaN(lon) ? [lat, lon] : null);
            } else {
              terminar(null);
            }
          } catch (err) {
            console.error('Erro ao parsear resposta do Nominatim:', err.message);
            terminar(null);
          }
        });
      });
      req.on('error', (err) => {
        if (!fim) console.error('Erro ao geocodificar endereço:', err.message);
        terminar(null);
      });
    } catch (err) {
      console.error('Erro na geocodificação:', err);
      terminar(null);
    }
  });
}

// Função para obter coordenadas (tenta endereço completo primeiro, depois cidade)
async function obterCoordenadasExatas(endereco, cidade, estado) {
  if (endereco && cidade && estado) {
    const coords = await geocodificarEndereco(endereco, cidade, estado);
    if (coords) {
      return coords;
    }
  }
  // Fallback para coordenadas da cidade
  return obterCoordenadasCidade(cidade, estado);
}

// Função para obter coordenadas aproximadas de cidades brasileiras
function obterCoordenadasCidade(cidade, estado) {
  const estadoNormalizado = String(estado == null ? '' : estado).trim().toUpperCase();
  const centroDoEstado = coordenadasEstados[estadoNormalizado] || null;
  const comEsseNome = CIDADES_POR_NOME.get(normalizarNome(cidade)) || [];

  if (centroDoEstado) {
    // Com o estado conhecido, a cidade so vale se for DESSE estado (o homonimo de outro — Rio Claro/SP para um cliente de RIO CLARO/RJ,
    // Agua Boa/MT para ÁGUA BOA/MG — cai no centro do estado informado, como antes da etapa).
    const doEstado = comEsseNome.find((c) => c.uf === estadoNormalizado);
    return doEstado ? doEstado.coord : centroDoEstado;
  }
  // Sem estado conhecido: a cidade pelo nome (a ultima com esse nome, como o objeto de antes guardava).
  if (comEsseNome.length > 0) {
    return comEsseNome[comEsseNome.length - 1].coord;
  }
  // Fallback: centro do Brasil
  return [-14.2350, -51.9253];
}

module.exports = {
  termoDaConsulta,
  coordenadaGuardada,
  coordenadaPlausivel,
  geocodificarEndereco,
  obterCoordenadasExatas,
  obterCoordenadasCidade,
  normalizarNome,
  urlDoNominatim,
  prazoDoNominatimMs,
  NOMINATIM_PADRAO,
  PRAZO_PADRAO_MS,
  CIDADES,
};
