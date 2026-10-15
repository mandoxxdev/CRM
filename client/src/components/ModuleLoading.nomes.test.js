/**
 * "Carregando X..." / "Preparando X" — o nome do módulo (Etapa 111, G17, RN-111.06).
 *
 * Escrito ANTES de `ModuleLoading` passar a ler `NOMES_MODULO` de `constants/modulosMeta.js`: os nomes de sempre
 * (lidos de `ModuleLoading.MODULE_LABELS` até a 110) — e uma única mudança, a engenharia, que dizia
 * "Engenharia" e passa a dizer "Cálculos de Engenharia" como em todo o resto (B62). Esse cenário nasce vermelho.
 *
 * Executar: cd client && CI=true npx react-scripts test src/components/ModuleLoading.nomes --watchAll=false
 */
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import ModuleLoading from './ModuleLoading';

const textoDe = (el) => {
  const div = document.createElement('div');
  div.innerHTML = renderToStaticMarkup(el);
  return div.textContent.replace(/\s+/g, ' ').trim();
};

const DE_SEMPRE = {
  comercial: 'Comercial',
  frota: 'Frota',
  compras: 'Compras',
  financeiro: 'Financeiro',
  operacional: 'Operacional',
  administrativo: 'Administrativo',
  engenharia_projetos: 'Engenharia / Projetos',
  almoxarifado: 'Almoxarifado',
  todolist: 'TODOLIST',
  admin: 'Administração',
};

test('RN-111.06 os 10 nomes de sempre no "Carregando ..." e no "Preparando ..."', () => {
  for (const [modulo, nome] of Object.entries(DE_SEMPRE)) {
    expect(textoDe(<ModuleLoading module={modulo} inline />)).toBe(`Carregando ${nome}...`);
    expect(textoDe(<ModuleLoading module={modulo} />)).toContain(`Preparando ${nome}`);
  }
});

test('RN-111.06 sistema, módulo desconhecido e sem módulo continuam "Orion"', () => {
  expect(textoDe(<ModuleLoading module="sistema" compact />)).toBe('Carregando Orion...');
  expect(textoDe(<ModuleLoading module="crm" compact />)).toBe('Carregando Orion...');
  expect(textoDe(<ModuleLoading compact />)).toBe('Carregando Orion...');
  expect(textoDe(<ModuleLoading module="xyz" />)).toContain('Preparando Orion');
});

test('RN-111.06 engenharia passa a dizer "Cálculos de Engenharia" (era "Engenharia" — B62)', () => {
  expect(textoDe(<ModuleLoading module="engenharia" inline />)).toBe('Carregando Cálculos de Engenharia...');
  expect(textoDe(<ModuleLoading module="engenharia" />)).toContain('Preparando Cálculos de Engenharia');
});
