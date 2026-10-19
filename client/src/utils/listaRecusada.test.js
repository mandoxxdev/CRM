/**
 * Etapa 156 (RN-156.02, C366): a frase do aviso da lista recusada. O 403 vem com o corpo REAL do portao das listas (o fixture, conferido
 * pelo teste do servidor listasNotificacoesPortao).
 * Executar: cd client && CI=true npx react-scripts test --watchAll=false src/utils/listaRecusada.test.js
 */
import { motivoDaListaRecusada } from './listaRecusada';
import RECUSA from '../components/almoxarifado/__fixtures__/recusaDaListaDoServidor.json';

const comResposta = (status, data) => Object.assign(new Error(`Request failed with status code ${status}`), { response: { status, data } });

describe('[RN-156.02] motivoDaListaRecusada', () => {
  test('o 403 do servidor (o fixture): o error do corpo na frase, uma vez so o ponto', () => {
    expect(motivoDaListaRecusada(comResposta(403, RECUSA), 'clientes'))
      .toBe('Sem acesso à lista de clientes: Acesso negado ao módulo. Recarregue a página para conferir suas permissões.');
    expect(motivoDaListaRecusada(comResposta(403, RECUSA), 'projetos'))
      .toBe('Sem acesso à lista de projetos: Acesso negado ao módulo. Recarregue a página para conferir suas permissões.');
  });

  test('o error terminado em ponto nao duplica o ponto', () => {
    expect(motivoDaListaRecusada(comResposta(403, { error: 'Sem o modulo.' }), 'projetos'))
      .toBe('Sem acesso à lista de projetos: Sem o modulo. Recarregue a página para conferir suas permissões.');
    // (Fase 5 r3 C9) o espaco nas pontas do error tambem sai — sem espaco duplo depois dos dois-pontos
    expect(motivoDaListaRecusada(comResposta(403, { error: '  Sem o modulo  ' }), 'projetos'))
      .toBe('Sem acesso à lista de projetos: Sem o modulo. Recarregue a página para conferir suas permissões.');
  });

  test('o 403 sem error (corpo vazio, error vazio ou que nao e texto): a frase sem o motivo do servidor', () => {
    const esperado = 'Sem acesso à lista de clientes. Recarregue a página para conferir suas permissões.';
    expect(motivoDaListaRecusada(comResposta(403, undefined), 'clientes')).toBe(esperado);
    expect(motivoDaListaRecusada(comResposta(403, {}), 'clientes')).toBe(esperado);
    expect(motivoDaListaRecusada(comResposta(403, { error: '  ' }), 'clientes')).toBe(esperado);
    expect(motivoDaListaRecusada(comResposta(403, { error: { x: 1 } }), 'clientes')).toBe(esperado);
  });

  test('qualquer outra falha (o 503 depois das repeticoes, sem response; a rede; o 500; o 503 com response): "Nao foi possivel carregar"', () => {
    const esperado = 'Não foi possível carregar a lista de projetos. Recarregue a página para tentar de novo.';
    expect(motivoDaListaRecusada(new Error('Banco de dados não está disponível. Tente recarregar a página.'), 'projetos')).toBe(esperado);
    expect(motivoDaListaRecusada(new Error('Network Error'), 'projetos')).toBe(esperado);
    expect(motivoDaListaRecusada(comResposta(500, { error: 'SQLITE_ERROR' }), 'projetos')).toBe(esperado);
    expect(motivoDaListaRecusada(comResposta(503, { error: 'Banco ocupado' }), 'projetos')).toBe(esperado);
  });

  test('sem erro: null', () => {
    expect(motivoDaListaRecusada(null, 'clientes')).toBeNull();
    expect(motivoDaListaRecusada(undefined, 'clientes')).toBeNull();
  });
});
