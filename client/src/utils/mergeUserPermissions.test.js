/**
 * Etapa 127 (C264, RN-01..RN-05; B818) — o perfil RETIRADO deixa de valer na tela no proximo refresh.
 *
 * O servidor (`/auth/me`, `/auth/login` e o `usuario` de `/usuarios/:id/grupos`) manda SEMPRE `perfil_almoxarifado` e
 * `perfil_frota`, com `null` para quem nao tem perfil. O merge do cliente usava `??`, e o `null` caia no valor antigo do
 * `localStorage`: quem perdia o perfil Administrador continuava vendo os botoes ate sair e entrar. Agora a chave PRESENTE vale,
 * inclusive `null`; so a chave AUSENTE (o `{}` do boot e do `applyFreshUser`) preserva — o mesmo de `admin_modulos` e `is_superadmin`.
 *
 * Executar: cd client && CI=true npx react-scripts test src/utils/mergeUserPermissions --watchAll=false
 */
import { mergeUserPermissions, podeGravarConfigAlmox, hasFrotaAdminPerfil } from './systemPermissions';

const ANTIGO = { id: 4, nome: 'Adm', role: 'user', perfil_almoxarifado: 'ADMINISTRADOR', perfil_frota: 'ADMIN_FROTA' };

describe('C264 (Etapa 127) — mergeUserPermissions com o perfil retirado', () => {
  test('[RN-01] o servidor manda perfil_almoxarifado null: o perfil antigo sai (e o usuario deixa de gravar)', () => {
    expect(podeGravarConfigAlmox(ANTIGO)).toBe(true); // metade positiva: antes do refresh, grava
    const fresco = mergeUserPermissions(ANTIGO, { id: 4, role: 'user', perfil_almoxarifado: null, perfil_frota: 'ADMIN_FROTA' });
    expect(fresco.perfil_almoxarifado).toBeNull();
    expect(podeGravarConfigAlmox(fresco)).toBe(false);
    expect(fresco.perfil_frota).toBe('ADMIN_FROTA'); // o outro perfil, presente, fica
  });

  test('[RN-02] o mesmo para perfil_frota null', () => {
    const fresco = mergeUserPermissions(ANTIGO, { id: 4, perfil_almoxarifado: 'ADMINISTRADOR', perfil_frota: null });
    expect(fresco.perfil_frota).toBeNull();
    expect(hasFrotaAdminPerfil(fresco)).toBe(false);
    expect(fresco.perfil_almoxarifado).toBe('ADMINISTRADOR');
  });

  test('[RN-03] chave ausente preserva: o {} do boot e do applyFreshUser nao apaga o perfil', () => {
    const normalizado = mergeUserPermissions(ANTIGO, {});
    expect(normalizado.perfil_almoxarifado).toBe('ADMINISTRADOR');
    expect(normalizado.perfil_frota).toBe('ADMIN_FROTA');
    // e a chave presente com undefined (JSON nunca manda, mas um objeto montado pode) tambem preserva
    const comUndefined = mergeUserPermissions(ANTIGO, { perfil_almoxarifado: undefined, perfil_frota: undefined });
    expect(comUndefined.perfil_almoxarifado).toBe('ADMINISTRADOR');
    expect(comUndefined.perfil_frota).toBe('ADMIN_FROTA');
  });

  test('[RN-04] perfil trocado por outro vale na hora (o de antes; continua)', () => {
    const fresco = mergeUserPermissions(ANTIGO, { perfil_almoxarifado: 'ALMOXARIFE', perfil_frota: 'MOTORISTA' });
    expect(fresco.perfil_almoxarifado).toBe('ALMOXARIFE');
    expect(fresco.perfil_frota).toBe('MOTORISTA');
    expect(podeGravarConfigAlmox(fresco)).toBe(false);
  });

  test('[RN-05] sem valor em nenhum lado: null (nunca undefined); perfil dado depois vale', () => {
    const semNada = mergeUserPermissions({ id: 9, role: 'user' }, {});
    expect(semNada.perfil_almoxarifado).toBeNull();
    expect(semNada.perfil_frota).toBeNull();
    const ganhou = mergeUserPermissions({ id: 9, role: 'user', perfil_almoxarifado: null }, { perfil_almoxarifado: 'ADMINISTRADOR' });
    expect(ganhou.perfil_almoxarifado).toBe('ADMINISTRADOR');
    expect(podeGravarConfigAlmox(ganhou)).toBe(true);
  });
});
