import React from 'react';
import { motivoDaListaRecusada } from '../../utils/listaRecusada';

// Etapa 156 (RN-156.02, C366): o aviso sob o seletor que a lista de clientes ou a de projetos alimenta, quando ela voltou recusada. Inline e
// nao por toast (decidido na etapa): o toast some em segundos e o seletor continua vazio — o aviso fica ao lado do campo enquanto ele estiver
// vazio pela recusa. Sem erro, nada.
export default function AvisoDaListaRecusada({ erro, nome }) {
  const motivo = motivoDaListaRecusada(erro, nome);
  if (!motivo) return null;
  return (
    <small role="alert" className="almox-aviso-lista-recusada"
      style={{ color: 'var(--gmp-error)', fontSize: '0.75rem', display: 'block', marginTop: 2 }}>
      {motivo}
    </small>
  );
}

// Etapa 156 (RN-156.02, Fase 2 I3): o seletor que ja tem valor (a transferencia de uma reserva com projeto ou cliente; o material com dono) e
// cujo valor nao esta na lista — recusada, ou sem a linha — desenha a opcao dele, marcada. Sem ela o <select> mostrava "—"/"GMP" e gravava o
// valor escondido, e escolher "—" nao mudava nada (o valor ja "era" o "—" na tela). `rotulo` = 'Projeto' | 'Cliente'.
export function OpcaoForaDaLista({ valor, lista, rotulo }) {
  if (valor === '' || valor === null || valor === undefined) return null;
  const chave = String(valor);
  if ((lista || []).some((x) => String(x.id) === chave)) return null;
  return <option value={chave}>{`${rotulo} #${chave} — fora da lista`}</option>;
}
