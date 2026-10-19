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
 *   caiam no centro do estado). O mapa e so por nome: a cidade so vale quando fica a ate 1.000 km do centro do estado informado (Fase 2 I1:
 *   'Rio Branco' do mapa e a do MT — o literal tem a do AC antes e a ultima vence; sem o raio, o cliente de RIO BRANCO/AC iria para o MT).
 *   Sem estado conhecido, a cidade pelo nome (como antes).
 */
const http = require('http');
const https = require('https');

const NOMINATIM_PADRAO = 'https://nominatim.openstreetmap.org/search';
const PRAZO_PADRAO_MS = 5000;
const RAIO_DA_CIDADE_NO_ESTADO_KM = 1000;

const coordenadasEstados = {
  'AC': [-8.77, -70.55], 'AL': [-9.57, -36.78], 'AP': [1.41, -51.77], 'AM': [-3.47, -65.10],
  'BA': [-12.96, -38.51], 'CE': [-3.71, -38.54], 'DF': [-15.79, -47.86], 'ES': [-19.19, -40.34],
  'GO': [-16.64, -49.31], 'MA': [-2.55, -44.30], 'MT': [-12.64, -55.42], 'MS': [-20.51, -54.54],
  'MG': [-18.10, -44.38], 'PA': [-5.53, -52.33], 'PB': [-7.24, -36.78], 'PR': [-24.89, -51.55],
  'PE': [-8.28, -35.07], 'PI': [-8.28, -43.68], 'RJ': [-22.90, -43.17], 'RN': [-5.22, -36.52],
  'RS': [-30.01, -51.22], 'RO': [-11.22, -62.80], 'RR': [1.99, -61.33], 'SC': [-27.33, -49.44],
  'SP': [-23.55, -46.63], 'SE': [-10.57, -37.38], 'TO': [-10.25, -48.25]
};

// Coordenadas de principais cidades brasileiras (o literal tem chaves repetidas — vale a ultima, como sempre valeu)
const coordenadasCidades = {
  'São Paulo': [-23.5505, -46.6333],
  'Rio de Janeiro': [-22.9068, -43.1729],
  'Brasília': [-15.7942, -47.8822],
  'Salvador': [-12.9714, -38.5014],
  'Fortaleza': [-3.7172, -38.5433],
  'Belo Horizonte': [-19.9167, -43.9345],
  'Manaus': [-3.1190, -60.0217],
  'Curitiba': [-25.4284, -49.2733],
  'Recife': [-8.0476, -34.8770],
  'Porto Alegre': [-30.0346, -51.2177],
  'Belém': [-1.4558, -48.5044],
  'Goiânia': [-16.6864, -49.2643],
  'Guarulhos': [-23.4538, -46.5331],
  'Campinas': [-22.9056, -47.0608],
  'São Luís': [-2.5387, -44.2825],
  'São Gonçalo': [-22.8269, -43.0539],
  'Maceió': [-9.5713, -36.7820],
  'Duque de Caxias': [-22.7856, -43.3047],
  'Natal': [-5.7945, -35.2110],
  'Teresina': [-5.0892, -42.8019],
  'Campo Grande': [-20.4428, -54.6458],
  'Nova Iguaçu': [-22.7556, -43.4603],
  'São Bernardo do Campo': [-23.7150, -46.5550], // Av. Angelo Demarchi 130, Batistini
  'João Pessoa': [-7.1195, -34.8450],
  'Santo André': [-23.6669, -46.5322],
  'Osasco': [-23.5329, -46.7915],
  'Jaboatão dos Guararapes': [-8.1127, -35.0147],
  'São José dos Campos': [-23.1791, -45.8872],
  'Ribeirão Preto': [-21.1775, -47.8103],
  'Uberlândia': [-18.9128, -48.2755],
  'Sorocaba': [-23.5015, -47.4526],
  'Contagem': [-19.9317, -44.0539],
  'Aracaju': [-10.9091, -37.0677],
  'Feira de Santana': [-12.2664, -38.9661],
  'Cuiabá': [-15.6014, -56.0979],
  'Joinville': [-26.3044, -48.8467],
  'Juiz de Fora': [-21.7595, -43.3398],
  'Londrina': [-23.3045, -51.1696],
  'Aparecida de Goiânia': [-16.8194, -49.2439],
  'Niterói': [-22.8834, -43.1034],
  'Ananindeua': [-1.3656, -48.3728],
  'Porto Velho': [-8.7619, -63.9039],
  'Serra': [-20.1289, -40.3078],
  'Caxias do Sul': [-29.1680, -51.1798],
  'Campos dos Goytacazes': [-21.7523, -41.3304],
  'Macapá': [0.0349, -51.0694],
  'Vila Velha': [-20.3297, -40.2925],
  'Florianópolis': [-27.5954, -48.5480],
  'Mauá': [-23.6677, -46.4613],
  'São João de Meriti': [-22.8039, -43.3722],
  'São José do Rio Preto': [-20.8113, -49.3757],
  'Mogi das Cruzes': [-23.5229, -46.1880],
  'Betim': [-19.9678, -44.1977],
  'Diadema': [-23.6864, -46.6228],
  'Campina Grande': [-7.2307, -35.8817],
  'Jundiaí': [-23.1864, -46.8842],
  'Maringá': [-23.4205, -51.9333],
  'Montes Claros': [-16.7281, -43.8630],
  'Carapicuíba': [-23.5235, -46.8407],
  'Olinda': [-8.0089, -34.8553],
  'Cariacica': [-20.2639, -40.4164],
  'Rio Branco': [-9.9747, -67.8100],
  'Anápolis': [-16.3286, -48.9534],
  'Bauru': [-22.3147, -49.0606],
  'Vitória': [-20.3155, -40.3128],
  'Caucaia': [-3.7327, -38.6610],
  'Canela': [-29.3658, -50.8139],
  'Blumenau': [-26.9194, -49.0661],
  'Franca': [-20.5352, -47.4039],
  'Ponta Grossa': [-25.0916, -50.1668],
  'Petrolina': [-9.3887, -40.5007],
  'Uberaba': [-19.7477, -47.9392],
  'Paulista': [-7.9340, -34.8684],
  'Cascavel': [-24.9578, -53.4595],
  'Praia Grande': [-24.0089, -46.4122],
  'São José de Ribamar': [-2.5619, -44.0542],
  'Foz do Iguaçu': [-25.5163, -54.5854],
  'Várzea Grande': [-15.6458, -56.1325],
  'Petrópolis': [-22.5050, -43.1786],
  'Limeira': [-22.5647, -47.4017],
  'Volta Redonda': [-22.5231, -44.1042],
  'Governador Valadares': [-18.8548, -41.9559],
  'Taubaté': [-23.0264, -45.5553],
  'Imperatriz': [-5.5185, -47.4775],
  'Gravataí': [-29.9444, -50.9919],
  'Embu das Artes': [-23.6437, -46.8579],
  'Viamão': [-30.0811, -51.0234],
  'São Vicente': [-23.9631, -46.3919],
  'Taboão da Serra': [-23.6019, -46.7526],
  'Novo Hamburgo': [-29.6914, -51.1306],
  'Santa Maria': [-29.6842, -53.8069],
  'Barueri': [-23.5107, -46.8761],
  'Guarujá': [-23.9931, -46.2564],
  'Ribeirão das Neves': [-19.7669, -44.0869],
  'Sumaré': [-22.8214, -47.2668],
  'Caruaru': [-8.2842, -35.9699],
  'Araçatuba': [-21.2087, -50.4325],
  'Colombo': [-25.2925, -49.2262],
  'Itaquaquecetuba': [-23.4864, -46.3483],
  'Americana': [-22.7379, -47.3311],
  'Araraquara': [-21.7944, -48.1756],
  'Itaboraí': [-22.7475, -42.8592],
  'Santa Bárbara d\'Oeste': [-22.7536, -47.4136],
  'Nova Friburgo': [-22.2819, -42.5303],
  'Jacareí': [-23.3051, -45.9658],
  'Arapiraca': [-9.7520, -36.6612],
  'Barra Mansa': [-22.5444, -44.1714],
  'Praia Grande': [-24.0089, -46.4122],
  'São Caetano do Sul': [-23.6231, -46.5512],
  'Cabo Frio': [-22.8894, -42.0286],
  'Itabuna': [-14.7874, -39.2781],
  'Rio Claro': [-22.4103, -47.5604],
  'Araguaína': [-7.1920, -48.2044],
  'Passo Fundo': [-28.2628, -52.4067],
  'Luziânia': [-16.2525, -47.9503],
  'Paranaguá': [-25.5167, -48.5167],
  'Dourados': [-22.2208, -54.8058],
  'Rio Verde': [-17.7979, -50.9278],
  'Chapecó': [-27.1004, -52.6153],
  'Criciúma': [-28.6775, -49.3697],
  'Itajaí': [-26.9103, -48.6626],
  'Sete Lagoas': [-19.4658, -44.2467],
  'Divinópolis': [-20.1436, -44.8908],
  'Macaé': [-22.3708, -41.7869],
  'São José dos Pinhais': [-25.5347, -49.2056],
  'Pindamonhangaba': [-22.9246, -45.4613],
  'Jequié': [-13.8578, -40.0853],
  'Palmas': [-10.1844, -48.3336],
  'Teixeira de Freitas': [-17.5350, -39.7419],
  'Barretos': [-20.5572, -48.5678],
  'Patos de Minas': [-18.5778, -46.5181],
  'Alagoinhas': [-12.1356, -38.4192],
  'Bragança Paulista': [-22.9527, -46.5442],
  'Parnaíba': [-2.9048, -41.7767],
  'Poços de Caldas': [-21.7878, -46.5614],
  'Caxias': [-4.8590, -43.3600],
  'Valparaíso de Goiás': [-16.0650, -47.9750],
  'Marília': [-22.2139, -49.9456],
  'Catanduva': [-21.1378, -48.9728],
  'Barra do Piraí': [-22.4706, -43.8256],
  'Bento Gonçalves': [-29.1714, -51.5192],
  'Araucária': [-25.5858, -49.4047],
  'Garanhuns': [-8.8828, -36.5028],
  'Vitória de Santo Antão': [-8.1178, -35.2914],
  'Itapevi': [-23.5489, -46.9342],
  'Toledo': [-24.7139, -53.7431],
  'Guaíba': [-30.1136, -51.3250],
  'Santos': [-23.9608, -46.3331],
  'Suzano': [-23.5428, -46.3108],
  'São Carlos': [-22.0175, -47.8910],
  'Mogi Guaçu': [-22.3714, -46.9425],
  'Pouso Alegre': [-22.2306, -45.9356],
  'Angra dos Reis': [-23.0069, -44.3178],
  'Eunápolis': [-16.3706, -39.5806],
  'Salto': [-23.2003, -47.2869],
  'Ourinhos': [-22.9789, -49.8706],
  'Parnamirim': [-5.9167, -35.2667],
  'Poá': [-23.5281, -46.3447],
  'Cataguases': [-21.3892, -42.6897],
  'Atibaia': [-23.1169, -46.5503],
  'Erechim': [-27.6344, -52.2694],
  'Santa Rita': [-7.1139, -34.9778],
  'Barbacena': [-21.2214, -43.7736],
  'Araras': [-22.3572, -47.3842],
  'Piraquara': [-25.4425, -49.0625],
  'Abaetetuba': [-1.7217, -48.8789],
  'Tatuí': [-23.3547, -47.8561],
  'Birigui': [-21.2889, -50.3400],
  'Resende': [-22.4689, -44.4469],
  'Votorantim': [-23.5467, -47.4378],
  'Caraguatatuba': [-23.6203, -45.4131],
  'Trindade': [-16.6517, -49.4928],
  'Votuporanga': [-20.4231, -49.9781],
  'Tubarão': [-28.4806, -49.0069],
  'Aracruz': [-19.8200, -40.2739],
  'Gravataí': [-29.9444, -50.9919],
  'Cachoeiro de Itapemirim': [-20.8489, -41.1128],
  'Rio das Ostras': [-22.5269, -41.9450],
  'Simões Filho': [-12.7867, -38.4039],
  'Maringá': [-23.4205, -51.9333],
  'Guaratinguetá': [-22.8164, -45.1925],
  'Arapongas': [-23.4194, -51.4244],
  'Cubatão': [-23.8953, -46.4253],
  'Santa Cruz do Sul': [-29.7178, -52.4258],
  'Itu': [-23.2642, -47.2992],
  'Jaraguá do Sul': [-26.4850, -49.0669],
  'Conselheiro Lafaiete': [-20.6603, -43.7861],
  'Linhares': [-19.3914, -40.0722],
  'Guarapari': [-20.6597, -40.5025],
  'Cachoeirinha': [-29.9506, -51.0939],
  'Paragominas': [-2.9989, -47.3531],
  'Umuarama': [-23.7656, -53.3250],
  'Sapucaia do Sul': [-29.8406, -51.1458],
  'Crato': [-7.2306, -39.4097],
  'Paranavaí': [-23.0819, -52.4617],
  'Maracanaú': [-3.8769, -38.6256],
  'Bagé': [-31.3319, -54.1069],
  'Cametá': [-2.2439, -49.4958],
  'Mossoró': [-5.1878, -37.3439],
  'Magé': [-22.6531, -43.0406],
  'Corumbá': [-19.0081, -57.6514],
  'Ariquemes': [-9.9139, -63.0406],
  'Ji-Paraná': [-10.8853, -61.9517],
  'Sinop': [-11.8639, -55.5031],
  'Cáceres': [-16.0714, -57.6819],
  'Rondonópolis': [-16.4706, -54.6358],
  'Várzea Grande': [-15.6458, -56.1325],
  'Cuiabá': [-15.6014, -56.0979],
  'Campo Grande': [-20.4428, -54.6458],
  'Dourados': [-22.2208, -54.8058],
  'Três Lagoas': [-20.7847, -51.7006],
  'Ponta Porã': [-22.5361, -55.7258],
  'Naviraí': [-23.0619, -54.1917],
  'Paranaíba': [-19.6744, -51.1908],
  'Aquidauana': [-20.4706, -55.7869],
  'Corumbá': [-19.0081, -57.6514],
  'Ladário': [-19.0081, -57.6014],
  'Mirassol d\'Oeste': [-15.6758, -58.0958],
  'Tangará da Serra': [-14.6219, -57.4258],
  'Barra do Garças': [-15.8900, -52.2569],
  'Primavera do Leste': [-15.5606, -54.3000],
  'Sorriso': [-12.5431, -55.7097],
  'Lucas do Rio Verde': [-13.0581, -55.9158],
  'Nova Mutum': [-13.8369, -56.0831],
  'Sapezal': [-12.9906, -58.7631],
  'Campo Novo do Parecis': [-13.6758, -57.8881],
  'Diamantino': [-14.4081, -56.4458],
  'Alta Floresta': [-9.8758, -56.0861],
  'Colíder': [-10.8131, -55.4558],
  'Peixoto de Azevedo': [-10.2250, -54.9792],
  'Guarantã do Norte': [-9.9625, -54.9092],
  'Matupá': [-10.0500, -54.9331],
  'Nova Canaã do Norte': [-10.5500, -55.9500],
  'Terra Nova do Norte': [-10.5169, -55.2319],
  'Itaúba': [-11.0619, -55.2017],
  'Nova Bandeirantes': [-9.8500, -57.8167],
  'Nova Monte Verde': [-9.9833, -57.6167],
  'Paranaíta': [-9.6667, -56.4833],
  'Apiacás': [-9.5500, -57.4500],
  'Carlinda': [-9.7667, -55.8333],
  'Nova Guarita': [-10.2167, -55.4167],
  'Nova Santa Helena': [-10.8667, -55.1833],
  'Santa Carmem': [-11.9500, -55.2167],
  'União do Sul': [-11.5167, -54.3667],
  'Vera': [-12.3000, -55.3167],
  'Nova Ubiratã': [-12.9833, -55.2500],
  'Brasnorte': [-12.1500, -57.9833],
  'Campo Verde': [-15.5500, -55.1667],
  'Cláudia': [-11.5167, -54.8833],
  'Feliz Natal': [-12.3833, -54.9167],
  'Itanhangá': [-12.2167, -56.6333],
  'Marcelândia': [-11.0167, -54.5000],
  'Nova Maringá': [-13.0167, -57.0833],
  'Nova Marilândia': [-14.2167, -56.9833],
  'Nova Nazaré': [-13.9833, -51.8000],
  'Planalto da Serra': [-10.4333, -55.2667],
  'Santa Rita do Trivelato': [-13.8167, -55.2667],
  'São José do Rio Claro': [-13.4333, -56.7167],
  'Tabaporã': [-11.3000, -56.8167],
  'Tapurah': [-12.5333, -56.5167],
  'Vila Rica': [-10.0167, -51.1167],
  'Araguaiana': [-15.7333, -51.8333],
  'Araguainha': [-16.8500, -53.0333],
  'Cocalinho': [-14.4000, -51.0000],
  'Nova Xavantina': [-14.6667, -52.3500],
  'Novo São Joaquim': [-14.9000, -53.0167],
  'Querência': [-12.6167, -52.1833],
  'Ribeirão Cascalheira': [-12.9333, -51.8167],
  'Santa Terezinha': [-10.4667, -50.5167],
  'São Félix do Araguaia': [-11.6167, -50.6667],
  'Serra Nova Dourada': [-12.0833, -51.4000],
  'Vila Bela da Santíssima Trindade': [-15.0000, -59.9500],
  'Comodoro': [-13.6667, -59.7833],
  'Conquista D\'Oeste': [-14.5333, -59.5667],
  'Curvelândia': [-15.6000, -57.9167],
  'Figueirópolis D\'Oeste': [-15.4333, -58.7333],
  'Glória D\'Oeste': [-15.0167, -58.3167],
  'Indiavaí': [-15.4333, -58.5833],
  'Jauru': [-15.3333, -58.8667],
  'Lambari D\'Oeste': [-15.3167, -58.0167],
  'Pontes e Lacerda': [-15.2167, -59.3333],
  'Reserva do Cabaçal': [-15.1333, -58.4167],
  'Rio Branco': [-15.2500, -58.1167],
  'Salto do Céu': [-15.1333, -58.1333],
  'São José dos Quatro Marcos': [-15.6167, -58.1833],
  'Vale de São Domingos': [-15.2833, -59.0667],
  'Vila Bela da Santíssima Trindade': [-15.0000, -59.9500],
  'Acorizal': [-15.2000, -56.3667],
  'Água Boa': [-14.0500, -52.1667],
  'Alta Floresta': [-9.8758, -56.0861],
  'Alto Araguaia': [-17.3167, -53.2167],
  'Alto Boa Vista': [-11.6667, -51.3833],
  'Alto Garças': [-16.9500, -53.5167],
  'Alto Paraguai': [-14.5167, -56.4833],
  'Alto Taquari': [-17.8333, -53.2833],
  'Apiacás': [-9.5500, -57.4500],
  'Araguaiana': [-15.7333, -51.8333],
  'Araguainha': [-16.8500, -53.0333],
  'Araputanga': [-15.4667, -58.3500],
  'Arenápolis': [-14.4333, -56.8333],
  'Aripuanã': [-9.1667, -60.6333],
  'Barão de Melgaço': [-16.2000, -55.9667],
  'Barra do Bugres': [-15.0833, -57.1833],
  'Barra do Garças': [-15.8900, -52.2569],
  'Bom Jesus do Araguaia': [-12.1833, -51.5000],
  'Brasnorte': [-12.1500, -57.9833],
  'Cáceres': [-16.0714, -57.6819],
  'Campinápolis': [-14.5000, -52.7667],
  'Campo Novo do Parecis': [-13.6758, -57.8881],
  'Campo Verde': [-15.5500, -55.1667],
  'Campos de Júlio': [-13.5167, -59.1000],
  'Canabrava do Norte': [-11.0333, -51.8333],
  'Canarana': [-13.5500, -52.2667],
  'Carlinda': [-9.7667, -55.8333],
  'Castanheira': [-11.1167, -58.6000],
  'Chapada dos Guimarães': [-15.4333, -55.7500],
  'Cláudia': [-11.5167, -54.8833],
  'Cocalinho': [-14.4000, -51.0000],
  'Colíder': [-10.8131, -55.4558],
  'Colniza': [-9.4000, -60.9167],
  'Comodoro': [-13.6667, -59.7833],
  'Confresa': [-10.6500, -51.5667],
  'Conquista D\'Oeste': [-14.5333, -59.5667],
  'Cotriguaçu': [-9.8667, -58.4167],
  'Cuiabá': [-15.6014, -56.0979],
  'Curvelândia': [-15.6000, -57.9167],
  'Denise': [-14.7333, -57.0500],
  'Diamantino': [-14.4081, -56.4458],
  'Dom Aquino': [-15.8167, -54.9167],
  'Feliz Natal': [-12.3833, -54.9167],
  'Figueirópolis D\'Oeste': [-15.4333, -58.7333],
  'Gaúcha do Norte': [-13.1833, -53.2500],
  'General Carneiro': [-15.7167, -52.7500],
  'Glória D\'Oeste': [-15.0167, -58.3167],
  'Guarantã do Norte': [-9.9625, -54.9092],
  'Guiratinga': [-16.3500, -53.7500],
  'Indiavaí': [-15.4333, -58.5833],
  'Ipiranga do Norte': [-12.2333, -56.1500],
  'Itanhangá': [-12.2167, -56.6333],
  'Itaúba': [-11.0619, -55.2017],
  'Itiquira': [-17.2167, -54.1333],
  'Jaciara': [-15.9667, -54.9667],
  'Jangada': [-15.2333, -56.4833],
  'Jauru': [-15.3333, -58.8667],
  'Juara': [-11.2500, -57.5167],
  'Juína': [-11.3833, -58.7333],
  'Juruena': [-10.3167, -58.4833],
  'Juscimeira': [-16.0500, -54.8833],
  'Lambari D\'Oeste': [-15.3167, -58.0167],
  'Lucas do Rio Verde': [-13.0581, -55.9158],
  'Luciara': [-11.2167, -50.6667],
  'Marcelândia': [-11.0167, -54.5000],
  'Matupá': [-10.0500, -54.9331],
  'Mirassol d\'Oeste': [-15.6758, -58.0958],
  'Nobres': [-14.7167, -56.3333],
  'Nortelândia': [-14.4500, -56.8000],
  'Nossa Senhora do Livramento': [-15.7833, -56.3667],
  'Nova Bandeirantes': [-9.8500, -57.8167],
  'Nova Brasilândia': [-14.9667, -54.9167],
  'Nova Canaã do Norte': [-10.5500, -55.9500],
  'Nova Guarita': [-10.2167, -55.4167],
  'Nova Lacerda': [-14.4667, -59.6000],
  'Nova Marilândia': [-14.2167, -56.9833],
  'Nova Maringá': [-13.0167, -57.0833],
  'Nova Monte Verde': [-9.9833, -57.6167],
  'Nova Mutum': [-13.8369, -56.0831],
  'Nova Nazaré': [-13.9833, -51.8000],
  'Nova Olímpia': [-14.7833, -57.2833],
  'Nova Santa Helena': [-10.8667, -55.1833],
  'Nova Ubiratã': [-12.9833, -55.2500],
  'Nova Xavantina': [-14.6667, -52.3500],
  'Novo Horizonte do Norte': [-11.4167, -57.3500],
  'Novo Mundo': [-9.9667, -55.5167],
  'Novo Santo Antônio': [-12.2833, -50.9667],
  'Novo São Joaquim': [-14.9000, -53.0167],
  'Paranaíba': [-19.6744, -51.1908],
  'Paranaíta': [-9.6667, -56.4833],
  'Paranatinga': [-14.4333, -54.0500],
  'Pedra Preta': [-16.6167, -54.4667],
  'Peixoto de Azevedo': [-10.2250, -54.9792],
  'Planalto da Serra': [-10.4333, -55.2667],
  'Poconé': [-16.2500, -56.6167],
  'Pontal do Araguaia': [-15.9500, -52.0167],
  'Ponte Branca': [-16.7667, -52.8333],
  'Pontes e Lacerda': [-15.2167, -59.3333],
  'Porto Alegre do Norte': [-10.8667, -51.6333],
  'Porto dos Gaúchos': [-11.5333, -57.4167],
  'Porto Esperidião': [-15.8500, -58.4667],
  'Porto Estrela': [-15.3167, -57.2167],
  'Poxoréu': [-15.8333, -54.3833],
  'Primavera do Leste': [-15.5606, -54.3000],
  'Querência': [-12.6167, -52.1833],
  'Reserva do Cabaçal': [-15.1333, -58.4167],
  'Ribeirão Cascalheira': [-12.9333, -51.8167],
  'Ribeirãozinho': [-16.4500, -52.6833],
  'Rio Branco': [-15.2500, -58.1167],
  'Rondolândia': [-10.8333, -61.4667],
  'Rondonópolis': [-16.4706, -54.6358],
  'Rosário Oeste': [-14.8333, -56.4333],
  'Salto do Céu': [-15.1333, -58.1333],
  'Santa Carmem': [-11.9500, -55.2167],
  'Santa Cruz do Xingu': [-10.1500, -52.3833],
  'Santa Rita do Trivelato': [-13.8167, -55.2667],
  'Santa Terezinha': [-10.4667, -50.5167],
  'Santo Afonso': [-14.4833, -57.2500],
  'Santo Antônio do Leste': [-14.9667, -53.6167],
  'Santo Antônio do Leverger': [-15.8667, -56.0833],
  'São Félix do Araguaia': [-11.6167, -50.6667],
  'São José do Povo': [-16.4667, -54.2500],
  'São José do Rio Claro': [-13.4333, -56.7167],
  'São José do Xingu': [-10.8000, -52.7333],
  'São José dos Quatro Marcos': [-15.6167, -58.1833],
  'São Pedro da Cipa': [-16.0000, -54.9167],
  'Sapezal': [-12.9906, -58.7631],
  'Serra Nova Dourada': [-12.0833, -51.4000],
  'Sinop': [-11.8639, -55.5031],
  'Sorriso': [-12.5431, -55.7097],
  'Tabaporã': [-11.3000, -56.8167],
  'Tangará da Serra': [-14.6219, -57.4258],
  'Tapurah': [-12.5333, -56.5167],
  'Terra Nova do Norte': [-10.5169, -55.2319],
  'Tesouro': [-16.0667, -53.5500],
  'Torixoréu': [-16.2000, -52.5500],
  'União do Sul': [-11.5167, -54.3667],
  'Vale de São Domingos': [-15.2833, -59.0667],
  'Várzea Grande': [-15.6458, -56.1325],
  'Vera': [-12.3000, -55.3167],
  'Vila Bela da Santíssima Trindade': [-15.0000, -59.9500],
  'Vila Rica': [-10.0167, -51.1167],
  'Água Boa': [-14.0500, -52.1667],
  'Alta Floresta': [-9.8758, -56.0861],
  'Alto Araguaia': [-17.3167, -53.2167],
  'Alto Boa Vista': [-11.6667, -51.3833],
  'Alto Garças': [-16.9500, -53.5167],
  'Alto Paraguai': [-14.5167, -56.4833],
  'Alto Taquari': [-17.8333, -53.2833],
  'Apiacás': [-9.5500, -57.4500],
  'Araguaiana': [-15.7333, -51.8333],
  'Araguainha': [-16.8500, -53.0333],
  'Araputanga': [-15.4667, -58.3500],
  'Arenápolis': [-14.4333, -56.8333],
  'Aripuanã': [-9.1667, -60.6333],
  'Barão de Melgaço': [-16.2000, -55.9667],
  'Barra do Bugres': [-15.0833, -57.1833],
  'Barra do Garças': [-15.8900, -52.2569],
  'Bom Jesus do Araguaia': [-12.1833, -51.5000],
  'Brasnorte': [-12.1500, -57.9833],
  'Cáceres': [-16.0714, -57.6819],
  'Campinápolis': [-14.5000, -52.7667],
  'Campo Novo do Parecis': [-13.6758, -57.8881],
  'Campo Verde': [-15.5500, -55.1667],
  'Campos de Júlio': [-13.5167, -59.1000],
  'Canabrava do Norte': [-11.0333, -51.8333],
  'Canarana': [-13.5500, -52.2667],
  'Carlinda': [-9.7667, -55.8333],
  'Castanheira': [-11.1167, -58.6000],
  'Chapada dos Guimarães': [-15.4333, -55.7500],
  'Cláudia': [-11.5167, -54.8833],
  'Cocalinho': [-14.4000, -51.0000],
  'Colíder': [-10.8131, -55.4558],
  'Colniza': [-9.4000, -60.9167],
  'Comodoro': [-13.6667, -59.7833],
  'Confresa': [-10.6500, -51.5667],
  'Conquista D\'Oeste': [-14.5333, -59.5667],
  'Cotriguaçu': [-9.8667, -58.4167],
  'Cuiabá': [-15.6014, -56.0979],
  'Curvelândia': [-15.6000, -57.9167],
  'Denise': [-14.7333, -57.0500],
  'Diamantino': [-14.4081, -56.4458],
  'Dom Aquino': [-15.8167, -54.9167],
  'Feliz Natal': [-12.3833, -54.9167],
  'Figueirópolis D\'Oeste': [-15.4333, -58.7333],
  'Gaúcha do Norte': [-13.1833, -53.2500],
  'General Carneiro': [-15.7167, -52.7500],
  'Glória D\'Oeste': [-15.0167, -58.3167],
  'Guarantã do Norte': [-9.9625, -54.9092],
  'Guiratinga': [-16.3500, -53.7500],
  'Indiavaí': [-15.4333, -58.5833],
  'Ipiranga do Norte': [-12.2333, -56.1500],
  'Itanhangá': [-12.2167, -56.6333],
  'Itaúba': [-11.0619, -55.2017],
  'Itiquira': [-17.2167, -54.1333],
  'Jaciara': [-15.9667, -54.9667],
  'Jangada': [-15.2333, -56.4833],
  'Jauru': [-15.3333, -58.8667],
  'Juara': [-11.2500, -57.5167],
  'Juína': [-11.3833, -58.7333],
  'Juruena': [-10.3167, -58.4833],
  'Juscimeira': [-16.0500, -54.8833],
  'Lambari D\'Oeste': [-15.3167, -58.0167],
  'Lucas do Rio Verde': [-13.0581, -55.9158],
  'Luciara': [-11.2167, -50.6667],
  'Marcelândia': [-11.0167, -54.5000],
  'Matupá': [-10.0500, -54.9331],
  'Mirassol d\'Oeste': [-15.6758, -58.0958],
  'Nobres': [-14.7167, -56.3333],
  'Nortelândia': [-14.4500, -56.8000],
  'Nossa Senhora do Livramento': [-15.7833, -56.3667],
  'Nova Bandeirantes': [-9.8500, -57.8167],
  'Nova Brasilândia': [-14.9667, -54.9167],
  'Nova Canaã do Norte': [-10.5500, -55.9500],
  'Nova Guarita': [-10.2167, -55.4167],
  'Nova Lacerda': [-14.4667, -59.6000],
  'Nova Marilândia': [-14.2167, -56.9833],
  'Nova Maringá': [-13.0167, -57.0833],
  'Nova Monte Verde': [-9.9833, -57.6167],
  'Nova Mutum': [-13.8369, -56.0831],
  'Nova Nazaré': [-13.9833, -51.8000],
  'Nova Olímpia': [-14.7833, -57.2833],
  'Nova Santa Helena': [-10.8667, -55.1833],
  'Nova Ubiratã': [-12.9833, -55.2500],
  'Nova Xavantina': [-14.6667, -52.3500],
  'Novo Horizonte do Norte': [-11.4167, -57.3500],
  'Novo Mundo': [-9.9667, -55.5167],
  'Novo Santo Antônio': [-12.2833, -50.9667],
  'Novo São Joaquim': [-14.9000, -53.0167],
  'Paranaíba': [-19.6744, -51.1908],
  'Paranaíta': [-9.6667, -56.4833],
  'Paranatinga': [-14.4333, -54.0500],
  'Pedra Preta': [-16.6167, -54.4667],
  'Peixoto de Azevedo': [-10.2250, -54.9792],
  'Planalto da Serra': [-10.4333, -55.2667],
  'Poconé': [-16.2500, -56.6167],
  'Pontal do Araguaia': [-15.9500, -52.0167],
  'Ponte Branca': [-16.7667, -52.8333],
  'Pontes e Lacerda': [-15.2167, -59.3333],
  'Porto Alegre do Norte': [-10.8667, -51.6333],
  'Porto dos Gaúchos': [-11.5333, -57.4167],
  'Porto Esperidião': [-15.8500, -58.4667],
  'Porto Estrela': [-15.3167, -57.2167],
  'Poxoréu': [-15.8333, -54.3833],
  'Primavera do Leste': [-15.5606, -54.3000],
  'Querência': [-12.6167, -52.1833],
  'Reserva do Cabaçal': [-15.1333, -58.4167],
  'Ribeirão Cascalheira': [-12.9333, -51.8167],
  'Ribeirãozinho': [-16.4500, -52.6833],
  'Rio Branco': [-15.2500, -58.1167],
  'Rondolândia': [-10.8333, -61.4667],
  'Rondonópolis': [-16.4706, -54.6358],
  'Rosário Oeste': [-14.8333, -56.4333],
  'Salto do Céu': [-15.1333, -58.1333],
  'Santa Carmem': [-11.9500, -55.2167],
  'Santa Cruz do Xingu': [-10.1500, -52.3833],
  'Santa Rita do Trivelato': [-13.8167, -55.2667],
  'Santa Terezinha': [-10.4667, -50.5167],
  'Santo Afonso': [-14.4833, -57.2500],
  'Santo Antônio do Leste': [-14.9667, -53.6167],
  'Santo Antônio do Leverger': [-15.8667, -56.0833],
  'São Félix do Araguaia': [-11.6167, -50.6667],
  'São José do Povo': [-16.4667, -54.2500],
  'São José do Rio Claro': [-13.4333, -56.7167],
  'São José do Xingu': [-10.8000, -52.7333],
  'São José dos Quatro Marcos': [-15.6167, -58.1833],
  'São Pedro da Cipa': [-16.0000, -54.9167],
  'Sapezal': [-12.9906, -58.7631],
  'Serra Nova Dourada': [-12.0833, -51.4000],
  'Sinop': [-11.8639, -55.5031],
  'Sorriso': [-12.5431, -55.7097],
  'Tabaporã': [-11.3000, -56.8167],
  'Tangará da Serra': [-14.6219, -57.4258],
  'Tapurah': [-12.5333, -56.5167],
  'Terra Nova do Norte': [-10.5169, -55.2319],
  'Tesouro': [-16.0667, -53.5500],
  'Torixoréu': [-16.2000, -52.5500],
  'União do Sul': [-11.5167, -54.3667],
  'Vale de São Domingos': [-15.2833, -59.0667],
  'Várzea Grande': [-15.6458, -56.1325],
  'Vera': [-12.3000, -55.3167],
  'Vila Bela da Santíssima Trindade': [-15.0000, -59.9500],
  'Vila Rica': [-10.0167, -51.1167]
};

function normalizarNome(s) {
  return String(s == null ? '' : s).normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().toLowerCase();
}

const CIDADES_NORMALIZADAS = new Map(Object.entries(coordenadasCidades).map(([nome, c]) => [normalizarNome(nome), c]));

function distanciaKm(a, b) {
  const R = 6371;
  const rad = (g) => (g * Math.PI) / 180;
  const dLat = rad(b[0] - a[0]);
  const dLon = rad(b[1] - a[1]);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a[0])) * Math.cos(rad(b[0])) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
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
  return n > 0 ? n : PRAZO_PADRAO_MS;
}

// Função para geocodificar endereço completo usando Nominatim (OpenStreetMap)
async function geocodificarEndereco(endereco, cidade, estado) {
  if (!endereco || !cidade || !estado) {
    return null;
  }
  let url;
  try {
    const termo = `${endereco}, ${cidade}, ${estado}, Brasil`.replace(/\s+/g, ' ').trim();
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
  const daCidade = CIDADES_NORMALIZADAS.get(normalizarNome(cidade)) || null;

  if (daCidade && (!centroDoEstado || distanciaKm(daCidade, centroDoEstado) <= RAIO_DA_CIDADE_NO_ESTADO_KM)) {
    return daCidade;
  }
  // Se não encontrar, usar coordenadas do estado (centro do estado)
  if (centroDoEstado) {
    return centroDoEstado;
  }
  // Fallback: centro do Brasil
  return [-14.2350, -51.9253];
}

module.exports = {
  geocodificarEndereco,
  obterCoordenadasExatas,
  obterCoordenadasCidade,
  normalizarNome,
  urlDoNominatim,
  prazoDoNominatimMs,
  NOMINATIM_PADRAO,
  PRAZO_PADRAO_MS,
  RAIO_DA_CIDADE_NO_ESTADO_KM,
};
