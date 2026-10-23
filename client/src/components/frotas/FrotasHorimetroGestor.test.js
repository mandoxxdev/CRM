/**
 * Frota Etapa 3 — T2 (telas do gestor): a leitura de horas da maquina por horimetro aparece como horas nas listas (RN-F3.11) e os
 * formularios de Viagens e Abastecimentos tem os campos de horimetro (RN-F3.15, Fase 2 T-1: sem eles o gestor fechava a viagem da
 * maquina digitando horas no KM).
 * Plano: docs/superpowers/plans/2026-10-23-frotas-etapa3-km-e-horimetro.md
 */
import { ENTITY_CONFIGS } from './frotasEntityConfigs';

const coluna = (entidade, key) => ENTITY_CONFIGS[entidade].columns.find((c) => c.key === key);
const campos = (entidade) => ENTITY_CONFIGS[entidade].formFields({}, {}, () => {}, [], []).map((f) => f.key);

describe('RN-F3.11 listas do gestor mostram horas', () => {
  it('Abastecimentos: linha em horas -> "130,5 h"; linha em km segue o numero', () => {
    const c = coluna('abastecimentos', 'km_abastecimento');
    expect(c.format({ horimetro_abastecimento: 130.5, km_abastecimento: null })).toBe('130,5 h');
    expect(c.format({ horimetro_abastecimento: null, km_abastecimento: 1800 })).toBe(1800);
    expect(c.format({ horimetro_abastecimento: null, km_abastecimento: null })).toBe('-');
  });

  it('Checklist: registro em horas -> "125 h"; em km -> "1.800"', () => {
    const c = coluna('checklists', 'km');
    expect(c.format({ horimetro: 125, km: null })).toBe('125 h');
    expect(c.format({ horimetro: null, km: 1800 })).toBe('1.800');
  });

  it('Viagens: KM rodado da viagem em horas -> "6,5 h"; em km segue o km_rodado', () => {
    const c = coluna('viagens', 'km_rodado');
    expect(c.format({ km_rodado: null, horimetro_saida: 25, horimetro_retorno: 31.5 })).toBe('6,5 h');
    expect(c.format({ km_rodado: 120, horimetro_saida: null, horimetro_retorno: null })).toBe(120);
    expect(c.format({ km_rodado: null, horimetro_saida: 25, horimetro_retorno: null })).toBe('-');
  });
});

describe('RN-F3.15 formularios do gestor com horimetro', () => {
  it('Viagens: Horimetro saida e retorno ao lado do KM', () => {
    const k = campos('viagens');
    expect(k).toEqual(expect.arrayContaining(['km_saida', 'km_retorno', 'horimetro_saida', 'horimetro_retorno']));
    const def = ENTITY_CONFIGS.viagens.getDefaultForm();
    expect(def).toEqual(expect.objectContaining({ horimetro_saida: '', horimetro_retorno: '' }));
  });

  it('Abastecimentos: Horimetro no abastecimento ao lado do KM', () => {
    const k = campos('abastecimentos');
    expect(k).toEqual(expect.arrayContaining(['km_abastecimento', 'horimetro_abastecimento']));
    expect(ENTITY_CONFIGS.abastecimentos.getDefaultForm()).toEqual(expect.objectContaining({ horimetro_abastecimento: '' }));
  });
});
