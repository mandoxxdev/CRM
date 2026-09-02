/**
 * Etapa 8c, Task 9 — o modal de transformacao da tela "Remessas a Terceiros".
 *
 * O alvo e o que SO A TELA pode errar: montar o corpo errado (os dois numeros da decisao 1 sao
 * facilmente trocados), deixar a classificacao PECA/SOBRA implicita, esconder o atalho de criar
 * material atras do gate ERRADO (sao gates diferentes: remessar_terceiro x criar_material), e nao
 * mostrar o rendimento que o servidor calculou. O ciclo em si tem teste de servico e de rota.
 *
 * Executar:
 *   cd client && CI=true npx react-scripts test src/components/almoxarifado/RemessasTerceirosTransformacao --watchAll=false
 */
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';
import RemessasTerceirosAlmoxarifado from './RemessasTerceirosAlmoxarifado';
import api from '../../services/api';
import { toast } from 'react-toastify';

jest.mock('../../services/api', () => ({
  __esModule: true,
  default: { get: jest.fn(), post: jest.fn(), put: jest.fn(), delete: jest.fn() },
}));
jest.mock('react-toastify', () => ({
  toast: { success: jest.fn(), error: jest.fn(), info: jest.fn(), warn: jest.fn() },
}));
jest.mock('../../utils/remessaPdf', () => ({
  __esModule: true, gerarRemessaPDF: jest.fn(), montarRemessaPDF: jest.fn(),
}));

// Permissoes: por padrao tudo liberado. Os testes que medem gate trocam este mock em runtime.
let mockPode = () => true;
jest.mock('../../hooks/useAlmoxPermissoes', () => ({
  useAlmoxPermissoes: () => ({
    perfil: 'ADMINISTRADOR',
    pode: (acao) => mockPode(acao),
    bloquearSeNaoPode: (acao, ev) => {
      if (mockPode(acao)) return true;
      if (ev && ev.preventDefault) ev.preventDefault();
      return false;
    },
    loading: false,
  }),
}));

const REMESSA = {
  id: 10, numero: 'REM-CORTE-1', fornecedor_nome: 'Corte a Laser Oeste', tipo_servico: 'Corte',
  status: 'ENVIADA', prazo_previsto: '2099-01-01', vencida: 0, itens_total: 1,
  proprietario_cliente_id: null, proprietario_cliente_nome: null,
};
const DETALHE = {
  ...REMESSA,
  itens: [{ id: 101, material_id: 1, material_codigo: 'CHP-001', material_nome: 'Chapa 3/16',
    unidade: 'KG', quantidade: 100, quantidade_retornada: 0, pendente: 100 }],
  retornos: [],
};
const MATERIAIS = [
  { id: 1, codigo: 'CHP-001', nome: 'Chapa 3/16', unidade: 'KG', familia_id: 3, proprietario_cliente_id: null },
  { id: 2, codigo: 'PC-010', nome: 'Peca cortada 010', unidade: 'UN', familia_id: 3, proprietario_cliente_id: null },
  { id: 3, codigo: 'SOB-001', nome: 'Sobra de chapa', unidade: 'KG', familia_id: 3, proprietario_cliente_id: null },
  { id: 4, codigo: 'CLI-CHP', nome: 'Chapa do cliente', unidade: 'KG', familia_id: 3,
    proprietario_cliente_id: 7, proprietario_cliente_nome: 'Metalurgica X' },
];

function mockGets({ detalhe = DETALHE } = {}) {
  api.get.mockImplementation((url) => {
    if (url.startsWith('/almoxarifado/remessas-terceiros/')) return Promise.resolve({ data: detalhe });
    if (url.startsWith('/almoxarifado/remessas-terceiros')) return Promise.resolve({ data: [REMESSA] });
    if (url.startsWith('/almoxarifado/materiais')) return Promise.resolve({ data: MATERIAIS });
    if (url.startsWith('/almoxarifado/proximo-codigo')) return Promise.resolve({ data: { codigo: 'PC-011' } });
    return Promise.resolve({ data: [] });
  });
}

let container; let root;
async function montar() {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => {
    root.render(<MemoryRouter><RemessasTerceirosAlmoxarifado /></MemoryRouter>);
  });
}
const textos = () => container.textContent;
const porTexto = (t) => [...container.querySelectorAll('button')].find((b) => b.textContent.includes(t));
const clicar = async (el) => { await act(async () => { el.dispatchEvent(new MouseEvent('click', { bubbles: true })); }); };
const digitar = async (el, valor) => {
  await act(async () => {
    const setter = Object.getOwnPropertyDescriptor(el.constructor.prototype, 'value').set;
    setter.call(el, valor);
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
  });
};
const campo = (label) => [...container.querySelectorAll('.almox-field')]
  .find((f) => f.textContent.includes(label))?.querySelector('input, select, textarea');

/** Abre a tela, abre o detalhe da remessa e abre o modal de transformacao. */
async function abrirTransformacao() {
  await montar();
  await clicar(porTexto('Abrir'));
  await clicar(porTexto('Transformar'));
}

beforeEach(() => {
  jest.clearAllMocks();
  mockPode = () => true;
  mockGets();
  api.post.mockResolvedValue({ data: { success: true, status: 'ENCERRADA', pendente_total: 0,
    custo: [{ custo_unitario_peca: 25, valor_total: 1000, residuo: 0 }],
    rendimento: [{ calculavel: false, motivo: 'rendimento nao calculavel — peso unitario nao cadastrado em: PC-010', materiais_sem_peso: ['PC-010'] }] } });
});
afterEach(async () => { await act(async () => { root.unmount(); }); container.remove(); });

test('o botao Transformar aparece em remessa ENVIADA, ao lado de Retorno', async () => {
  await montar();
  expect(porTexto('Transformar')).toBeTruthy();
  expect(porTexto('Retorno')).toBeTruthy();
});

test('o botao Transformar NAO aparece em remessa ENCERRADA', async () => {
  api.get.mockImplementation((url) => {
    if (url.startsWith('/almoxarifado/remessas-terceiros/')) return Promise.resolve({ data: { ...DETALHE, status: 'ENCERRADA' } });
    if (url.startsWith('/almoxarifado/remessas-terceiros')) return Promise.resolve({ data: [{ ...REMESSA, status: 'ENCERRADA' }] });
    if (url.startsWith('/almoxarifado/materiais')) return Promise.resolve({ data: MATERIAIS });
    return Promise.resolve({ data: [] });
  });
  await montar();
  expect(porTexto('Transformar')).toBeFalsy();
});

test('"Transformar" carrega o detalhe sozinho — sem depender de ter clicado em "Abrir" antes', async () => {
  // O seletor de item le `aberta`, que so existe depois de o detalhe ser carregado. Se abrirModal
  // nao recarregar o detalhe na transformacao, quem clica direto em "Transformar" (o caminho
  // normal: a remessa esta na lista, nao ha por que abrir nada antes) ve um seletor VAZIO e nao tem
  // como registrar coisa nenhuma. Este teste foi escrito depois de a sabotagem correspondente nao
  // derrubar nada: todos os outros passam por `abrirTransformacao`, que clica em "Abrir" primeiro,
  // entao nenhum deles cobria este caminho.
  await montar();
  await clicar(porTexto('Transformar'));
  const seletor = campo('Item transformado');
  expect([...seletor.querySelectorAll('option')].map((o) => o.textContent).join(' ')).toContain('CHP-001');
});

test('o modal manda os DOIS numeros separados: quantidade_consumida e resultados[]', async () => {
  // A decisao 1 inteira. Trocar os dois numeros e o erro mais provavel de quem monta este corpo, e
  // ele nao daria erro nenhum: 40 (UN) caberia no teto de 100 (KG) e a chapa seria baixada errado.
  await abrirTransformacao();
  await digitar(campo('Item transformado'), '101');
  await digitar(campo('Quantidade consumida'), '100');
  await digitar(campo('Material do resultado'), '2');
  await digitar(campo('Quantidade do resultado'), '40');
  await digitar(campo('Classificação'), 'PECA');
  await clicar(porTexto('Adicionar resultado'));
  await clicar(porTexto('Confirmar transformação'));

  expect(api.post).toHaveBeenCalledWith('/almoxarifado/remessas-terceiros/10/transformacoes',
    expect.objectContaining({
      itens: [expect.objectContaining({
        item_remessa_id: 101,
        quantidade_consumida: 100,
        resultados: [expect.objectContaining({ material_id: 2, quantidade: 40, tipo_resultado: 'PECA' })],
      })],
    }));
});

test('duas linhas de resultado (peca + sobra) viajam juntas no MESMO documento', async () => {
  await abrirTransformacao();
  await digitar(campo('Item transformado'), '101');
  await digitar(campo('Quantidade consumida'), '100');
  await digitar(campo('Material do resultado'), '2');
  await digitar(campo('Quantidade do resultado'), '40');
  await digitar(campo('Classificação'), 'PECA');
  await clicar(porTexto('Adicionar resultado'));
  await digitar(campo('Material do resultado'), '3');
  await digitar(campo('Quantidade do resultado'), '12');
  await digitar(campo('Classificação'), 'SOBRA');
  await clicar(porTexto('Adicionar resultado'));
  await clicar(porTexto('Confirmar transformação'));

  const corpo = api.post.mock.calls[0][1];
  expect(corpo.itens[0].resultados).toHaveLength(2);
  expect(corpo.itens[0].resultados[1]).toEqual(expect.objectContaining({ material_id: 3, tipo_resultado: 'SOBRA' }));
});

test('nao deixa confirmar sem nenhuma linha de resultado', async () => {
  await abrirTransformacao();
  await digitar(campo('Item transformado'), '101');
  await digitar(campo('Quantidade consumida'), '100');
  await clicar(porTexto('Confirmar transformação'));
  expect(api.post).not.toHaveBeenCalled();
  expect(toast.error).toHaveBeenCalledWith(expect.stringMatching(/resultado/i));
});

test('recusa o MESMO material da chapa como resultado, antes de mandar', async () => {
  // A tela ADIANTA a recusa do servidor para o operador nao montar cinco linhas e perder tudo no
  // Confirmar. Quem decide continua sendo o backend.
  await abrirTransformacao();
  await digitar(campo('Item transformado'), '101');
  await digitar(campo('Material do resultado'), '1'); // CHP-001, a propria chapa
  await digitar(campo('Quantidade do resultado'), '10');
  await clicar(porTexto('Adicionar resultado'));
  expect(toast.error).toHaveBeenCalledWith(expect.stringMatching(/mesma chapa|retorno/i));
});

test('recusa resultado de OUTRO dono, nomeando os dois', async () => {
  // Espelha ownerRules.assertMesmoDonoNaTransformacao. Adiantada aqui pelo mesmo motivo do teste
  // acima — e com a mesma frase, para o operador nao ver duas explicacoes diferentes do mesmo nao.
  await abrirTransformacao();
  await digitar(campo('Item transformado'), '101');
  await digitar(campo('Material do resultado'), '4'); // CLI-CHP, do cliente 7; a chapa e nossa
  await digitar(campo('Quantidade do resultado'), '10');
  await clicar(porTexto('Adicionar resultado'));
  expect(toast.error).toHaveBeenCalledWith(expect.stringMatching(/Metalurgica X/));
});

test('o atalho de criar material resultante herda dono e familia da chapa, e usa codigo_auto', async () => {
  // Decisao 6: o motor NAO cria material; a tela oferece um atalho EXPLICITO, que chama a criacao
  // normal. `codigo_auto` existe porque o gerador de codigo devolve o mesmo numero para N chamadas
  // concorrentes — a colisao e resolvida no INSERT, com retry (Task 1).
  api.post.mockResolvedValue({ data: { id: 99, codigo: 'PC-011', nome: 'Peca nova', unidade: 'UN', familia_id: 3, proprietario_cliente_id: null } });
  await abrirTransformacao();
  await digitar(campo('Item transformado'), '101');
  await clicar(porTexto('Criar material resultante'));
  await digitar(campo('Nome do novo material'), 'Peca nova');
  await digitar(campo('Unidade do novo material'), 'UN');
  await clicar(porTexto('Cadastrar e usar'));

  expect(api.get).toHaveBeenCalledWith(expect.stringContaining('/almoxarifado/proximo-codigo?familia_id=3'));
  expect(api.post).toHaveBeenCalledWith('/almoxarifado/materiais', expect.objectContaining({
    codigo: 'PC-011', codigo_auto: 1, nome: 'Peca nova', unidade: 'UN',
    familia_id: 3, proprietario_cliente_id: null,
  }));
});

test('o atalho de criar material e barrado por criar_material, NAO por remessar_terceiro', async () => {
  // Os gates sao DIFERENTES (permissions.js): remessar_terceiro e [ADMINISTRADOR, ALMOXARIFE];
  // criar_material e [ADMINISTRADOR, ALMOXARIFE, ENGENHARIA]. Barrar o atalho pelo gate da
  // transformacao tiraria a funcao de quem tem direito a ela.
  //
  // A assercao que IMPORTA e a do formulario, e ela foi escrita depois de a sabotagem do gate
  // (trocar 'criar_material' por 'remessar_terceiro') NAO derrubar este teste: o clique em "Criar
  // material resultante" so ABRE o sub-formulario, o POST /materiais so acontece no "Cadastrar e
  // usar". Ou seja, `expect(api.post).not.toHaveBeenCalled...` e verdadeiro com o gate certo E com
  // o gate errado — nao sabia falhar. O par bilateral real e formulario fechado aqui x formulario
  // aberto no controle positivo abaixo.
  mockPode = (acao) => acao !== 'criar_material';
  await abrirTransformacao();
  await digitar(campo('Item transformado'), '101');
  await clicar(porTexto('Criar material resultante'));
  expect(campo('Nome do novo material')).toBeFalsy();
  expect(api.post).not.toHaveBeenCalledWith('/almoxarifado/materiais', expect.anything());
});

test('[CONTROLE POSITIVO] com criar_material, o atalho abre o formulario', async () => {
  // Sem isto, um atalho que nunca abrisse passaria no teste acima.
  mockPode = () => true;
  await abrirTransformacao();
  await digitar(campo('Item transformado'), '101');
  await clicar(porTexto('Criar material resultante'));
  expect(campo('Nome do novo material')).toBeTruthy();
});

test('mostra o rendimento NAO CALCULAVEL dizendo qual material falta', async () => {
  await abrirTransformacao();
  await digitar(campo('Item transformado'), '101');
  await digitar(campo('Quantidade consumida'), '100');
  await digitar(campo('Material do resultado'), '2');
  await digitar(campo('Quantidade do resultado'), '40');
  await clicar(porTexto('Adicionar resultado'));
  await clicar(porTexto('Confirmar transformação'));
  expect(toast.info).toHaveBeenCalledWith(expect.stringMatching(/PC-010/));
  expect(toast.info).toHaveBeenCalledWith(expect.stringMatching(/peso/i));
});

test('[CONTROLE POSITIVO] mostra o rendimento quando ele E calculavel', async () => {
  api.post.mockResolvedValue({ data: { success: true, status: 'ENCERRADA', pendente_total: 0,
    custo: [{ custo_unitario_peca: 25, valor_total: 1000, residuo: 0 }],
    rendimento: [{ calculavel: true, peso_saida: 785, peso_retorno: 720, rendimento_percentual: 91.72 }] } });
  await abrirTransformacao();
  await digitar(campo('Item transformado'), '101');
  await digitar(campo('Quantidade consumida'), '100');
  await digitar(campo('Material do resultado'), '2');
  await digitar(campo('Quantidade do resultado'), '40');
  await clicar(porTexto('Adicionar resultado'));
  await clicar(porTexto('Confirmar transformação'));
  expect(toast.info).toHaveBeenCalledWith(expect.stringMatching(/91[.,]72/));
});

test('a tabela de itens separa Retornado de Transformado', async () => {
  // A coluna "Retornado" ja significava duas coisas (voltou / foi liquidado no encerramento). Com a
  // 8c vira TRES. A tela desdobra, porque quantidade_retornada sozinha nao distingue.
  const detalhe = {
    ...DETALHE,
    itens: [{ ...DETALHE.itens[0], quantidade_retornada: 100, pendente: 0 }],
    retornos: [
      { id: 1, item_remessa_id: 101, material_id: 1, material_codigo: 'CHP-001', quantidade: 40, tipo_resultado: null },
      { id: 2, item_remessa_id: 101, material_id: 2, material_codigo: 'PC-010', quantidade: 24, tipo_resultado: 'PECA', custo_unitario_aplicado: 25 },
    ],
  };
  mockGets({ detalhe });
  await montar();
  await clicar(porTexto('Abrir'));
  const linha = container.querySelector('.almox-remessa-detalhe tbody tr');
  expect(linha.querySelector('[data-col="retornado"]').textContent).toContain('40');
  expect(linha.querySelector('[data-col="transformado"]').textContent).toContain('60');
  expect(textos()).toContain('PC-010');
});

test('o erro do servidor chega ao operador INTACTO', async () => {
  // As mensagens desta etapa dizem os codigos e os numeros de proposito; um toast generico as
  // apagaria.
  api.post.mockRejectedValue({ response: { data: { error: 'O material 424242 do resultado nao existe. Cadastre o material resultante primeiro' } } });
  await abrirTransformacao();
  await digitar(campo('Item transformado'), '101');
  await digitar(campo('Quantidade consumida'), '100');
  await digitar(campo('Material do resultado'), '2');
  await digitar(campo('Quantidade do resultado'), '40');
  await clicar(porTexto('Adicionar resultado'));
  await clicar(porTexto('Confirmar transformação'));
  expect(toast.error).toHaveBeenCalledWith(expect.stringContaining('424242'));
});
