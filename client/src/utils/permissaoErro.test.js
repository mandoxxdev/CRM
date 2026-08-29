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
import { formatarErroPermissao, labelAcao, labelPerfil } from './permissaoErro';

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

  test('cobre as ações do hardening, sem sobrar snake_case na tela', () => {
    // Revisao da Task 4 da Etapa 12 (M3): esta lista parou nas 7 acoes do hardening e as acoes
    // novas (gerenciar_reposicao na 11, gerenciar_notificacoes na 12) regrediram em silencio —
    // apagar o rotulo delas deixava a suite inteira verde. Toda acao nova de ACAO_PERFIS
    // (servidor) ENTRA AQUI junto com o rotulo em permissaoErro.js.
    const acoes = [
      'inventario', 'ajustar_estoque', 'separar_emitir',
      'aprovar_requisicao', 'editar_material', 'requisitar', 'movimentar',
      'gerenciar_reposicao', 'gerenciar_notificacoes',
    ];
    acoes.forEach((acao) => {
      const msg = formatarErroPermissao({ acao, perfil: 'PRODUCAO' });
      expect(msg).toContain('seu perfil é Produção');
      expect(msg).not.toContain('_');
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
