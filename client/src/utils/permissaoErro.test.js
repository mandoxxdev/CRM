/**
 * Mensagem do 403 de perfil — 05/08/2026.
 *
 * Depois do hardening que passou a exigir perfil em 16 rotas do almoxarifado, o usuário
 * sem permissão via só "Sem permissão para esta operação". O backend já mandava `acao` e
 * `perfil` no corpo, e o front descartava — então não havia como saber o que faltou nem
 * com que perfil se estava entrando.
 *
 * Executar: cd client && CI=true npx react-scripts test src/utils/permissaoErro.test.js --watchAll=false
 */
import { ACOES_COM_ROTULO, formatarErroPermissao, labelAcao, labelPerfil } from './permissaoErro';

describe('formatarErroPermissao', () => {
  test('403 de perfil do almoxarifado vira mensagem com ação e perfil', () => {
    const msg = formatarErroPermissao({
      error: 'Sem permissão para esta operação',
      acao: 'criar_material',
      perfil: 'PRODUCAO',
    });
    expect(msg).toBe(
      'Sem permissão para criar material — seu perfil é Produção. Solicite acesso a um administrador.'
    );
  });

  /*
   * Etapa 30, fix-round da revisao adversarial. Este cenario existia e NAO SEGURAVA O QUE DIZIA.
   *
   * Ele afirmava `expect(msg).not.toContain('_')` — mas o FALLBACK de `labelAcao` tambem troca
   * `_` por espaco, entao uma acao SEM rotulo passava verde mostrando a chave crua na tela. Foi
   * assim que quatro acoes de ACAO_PERFIS (gerenciar_plano_inspecao, conferir_separacao,
   * remessar_terceiro, ajustar_material_cliente) chegaram ate aqui sem rotulo, tres delas ja com
   * botao na tela — a QUARTA ocorrencia deste mesmo buraco nesta base.
   *
   * A regua agora e a PRESENCA no mapa (`ACOES_COM_ROTULO`), nao o texto. Duas reguas de texto
   * foram tentadas e as duas sao furadas: "a mensagem nao contem o fallback" da falso positivo
   * (`movimentar` -> "movimentar estoque" CONTEM "movimentar"), e "a frase e diferente do
   * fallback" tambem (`criar_material` tem rotulo PROPRIO que por acaso e igual ao fallback,
   * "criar material" — medido, acusava cinco acoes inocentes).
   *
   * E a lista deixou de ser escrita a mao: ela vem de `ACAO_PERFIS` do SERVIDOR, importado
   * direto. Antes o comentario PEDIA que toda acao nova entrasse aqui, e o pedido foi ignorado
   * quatro vezes; agora acao nova sem rotulo derruba este teste sozinha.
   */
  test('toda acao de ACAO_PERFIS tem rotulo proprio — nenhuma cai no fallback', () => {
    // eslint-disable-next-line global-require, import/no-unresolved
    const { ACAO_PERFIS } = require('../../../server/services/almoxarifado/permissions');
    const acoes = Object.keys(ACAO_PERFIS);
    // Guarda da guarda: se o import quebrar e vier vazio, o filter passaria provando nada.
    expect(acoes.length).toBeGreaterThanOrEqual(24);

    const semRotulo = acoes.filter((a) => !ACOES_COM_ROTULO.includes(a));
    expect(semRotulo).toEqual([]);

    // E a mensagem inteira continua saindo legivel para todas elas.
    acoes.forEach((acao) => {
      const msg = formatarErroPermissao({ acao, perfil: 'PRODUCAO' });
      expect(msg).toContain('seu perfil é Produção');
      expect(msg).toMatch(/^Sem permissão para .+ — seu perfil é Produção\./);
    });
  });

  test('as quatro acoes que estavam sem rotulo mostram a frase natural, acentuada', () => {
    const esperado = {
      gerenciar_plano_inspecao: 'gerenciar o plano de inspeção',
      conferir_separacao: 'conferir a separação de requisição',
      remessar_terceiro: 'enviar material a terceiros',
      ajustar_material_cliente: 'ajustar saldo de material de cliente',
    };
    Object.entries(esperado).forEach(([acao, frase]) => {
      expect(formatarErroPermissao({ acao, perfil: 'ALMOXARIFE' })).toBe(
        `Sem permissão para ${frase} — seu perfil é Almoxarife. Solicite acesso a um administrador.`
      );
    });
  });

  test('acoes novas usam o ROTULO do mapa, nao o fallback sem acento (controle da sabotagem W7)', () => {
    // O fallback replace('_', ' ') tambem passa no "not.toContain('_')" — apagar o rotulo do
    // mapa ficava verde. So o texto ACENTUADO exato prova que o mapa tem a entrada.
    expect(formatarErroPermissao({ acao: 'gerenciar_notificacoes', perfil: 'PRODUCAO' }))
      .toContain('gerenciar notificações');
    expect(formatarErroPermissao({ acao: 'gerenciar_reposicao', perfil: 'PRODUCAO' }))
      .toContain('gerenciar reposição e compras');
  });

  test('perfis de frota e produção também são traduzidos (mesmo contrato de 403)', () => {
    expect(formatarErroPermissao({ acao: 'aprovar_viagens', perfil: 'MOTORISTA' }))
      .toBe('Sem permissão para aprovar viagens — seu perfil é Motorista. Solicite acesso a um administrador.');
    expect(formatarErroPermissao({ acao: 'apontar', perfil: 'OPERADOR' }))
      .toBe('Sem permissão para apontar produção — seu perfil é Operador. Solicite acesso a um administrador.');
  });

  test('o perfil QUALIDADE aparece traduzido, não como a chave crua (Etapa 24)', () => {
    // `labelPerfil` degrada para a chave crua em vez de sumir, e por isso um cenario que so
    // exigisse "contem QUALIDADE" ficaria VERDE sem a entrada no mapa — o mesmo modo de falha
    // do controle da sabotagem W7, agora do lado do PERFIL. Só a forma exata ('Qualidade',
    // capitalizada) prova que o mapa tem a linha. As duas metades no mesmo teste: o que TEM de
    // aparecer, e a chave crua que NÃO pode aparecer.
    const msg = formatarErroPermissao({ acao: 'ajustar_estoque', perfil: 'QUALIDADE' });
    expect(msg).toBe(
      'Sem permissão para ajustar saldo de estoque — seu perfil é Qualidade. Solicite acesso a um administrador.'
    );
    expect(msg).not.toContain('QUALIDADE');
  });

  test('retorna null quando não é 403 de perfil — quem chama mantém a mensagem original', () => {
    expect(formatarErroPermissao(null)).toBeNull();
    expect(formatarErroPermissao({})).toBeNull();
    expect(formatarErroPermissao({ error: 'Código já existe' })).toBeNull();
    // token expirado chega como 403 mas sem acao/perfil — não deve ser reescrito
    expect(formatarErroPermissao({ error: 'Token inválido ou expirado' })).toBeNull();
    // payload parcial não inventa mensagem
    expect(formatarErroPermissao({ acao: 'inventario' })).toBeNull();
    expect(formatarErroPermissao({ perfil: 'PRODUCAO' })).toBeNull();
  });
});

describe('rótulos', () => {
  test('ação desconhecida degrada para texto legível em vez de sumir', () => {
    expect(labelAcao('acao_nova_qualquer')).toBe('acao nova qualquer');
    expect(labelAcao(undefined)).toBe('');
  });

  test('perfil desconhecido é mostrado cru, não vazio', () => {
    expect(labelPerfil('PERFIL_NOVO')).toBe('PERFIL_NOVO');
    expect(labelPerfil(undefined)).toBe('');
  });
});
