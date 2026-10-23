/**
 * Frota Etapa 6 (RN-F6.06/07/08) — tratar a pendencia do registro: a janela (lista do gestor e alerta do painel), as acoes da linha
 * da lista Checklist e o texto da linha tratada. Contrato congelado no plano
 * docs/superpowers/plans/2026-10-23-frotas-etapa6-tratar-pendencia.md (vale a tabela "Ajustes da Fase 2").
 *
 * So o ADMIN_FROTA ve os botoes: o MOTORISTA tambem passa no `podeAlterar` da lista (que so barra o CONSULTA), por isso a conferencia
 * propria. Quem decide e o servidor (`gerenciar_veiculos`). Depois de tratar/desfazer a tela RECARREGA a lista (Fase 2 T-3: o 200 nao
 * traz placa, motorista, fotos nem a descricao da manutencao — trocar a linha pelo corpo apagaria essas colunas).
 */
import React, { useEffect, useState } from 'react';
import { toast } from 'react-toastify';
import api from '../../services/api';
import { useAuth } from '../../context/AuthContext';
import { getEffectiveUser } from '../../services/permissionsCache';
import { perfilFrota, PERFIS_FROTA } from '../../utils/systemPermissions';
import { tratarPendencia, desfazerTratamento, invalidateFrotasDashboardCache } from '../../utils/frotasApi';
import { dataLegivel } from './FrotasPortalMotorista';

export const ROTULO_TRATADA = 'PENDÊNCIA · tratada';
export const MSG_CONFIRMA_DESFAZER = 'Desfazer o tratamento desta pendência? O alerta volta para o painel.';
const LIMITE_TEXTO = 1000;

export const pendenciaTratada = (r) => !!r?.pendencia_tratada_em;

/**
 * Fase 5 (Etapa 6): 409 (outra tela ja tratou/desfez) e 404 (registro excluido) dizem que a tela esta VELHA — alem do toast, recarrega
 * (e limpa o cache do painel), senao a linha seguia com o botao e cada nova tentativa dava o mesmo 409.
 */
export const estadoMudouNoServidor = (err) => [404, 409].includes(err?.response?.status);

/** Linha do gestor: "Tratada em DD/MM/AAAA às HH:MM por <nome>: <texto>" + " (manutenção: <descrição>)" so com descricao. */
export function textoDaTratadaGestor(r) {
  const manut = r.pendencia_manutencao_descricao ? ` (manutenção: ${r.pendencia_manutencao_descricao})` : '';
  return `Tratada em ${dataLegivel(r.pendencia_tratada_em)} por ${r.pendencia_tratada_por_nome || '-'}: ${r.pendencia_tratamento || ''}${manut}`;
}

export function useEhGestorDaFrota() {
  const { user } = useAuth();
  return perfilFrota(getEffectiveUser(user)) === PERFIS_FROTA.ADMIN_FROTA;
}

/** A janela: "O que foi feito *" + "Manutenção (opcional)" (as manutencoes do veiculo). */
export function JanelaTratarPendencia({ registroId, veiculoId, placa, onFechar, onTratada }) {
  const [texto, setTexto] = useState('');
  const [manutencaoId, setManutencaoId] = useState('');
  const [manutencoes, setManutencoes] = useState([]);
  const [salvando, setSalvando] = useState(false);

  useEffect(() => {
    let vivo = true;
    if (!veiculoId) return undefined;
    api.get('/frotas/manutencoes', { params: { veiculo_id: veiculoId } })
      .then(({ data }) => { if (vivo) setManutencoes(Array.isArray(data) ? data : []); })
      .catch(() => { if (vivo) setManutencoes([]); });
    return () => { vivo = false; };
  }, [veiculoId]);

  // Texto vazio (ou so espacos) deixa o botao desligado: o servidor recusaria com "Descreva o que foi feito".
  const vazio = !texto.trim();

  const enviar = async (e) => {
    e.preventDefault();
    if (vazio || salvando) return;
    setSalvando(true);
    try {
      await tratarPendencia(registroId, {
        tratamento: texto.trim(),
        manutencao_id: manutencaoId === '' ? null : Number(manutencaoId),
      });
      toast.success('Pendência tratada');
      onFechar();
      if (onTratada) onTratada();
    } catch (err) {
      toast.error(err?.response?.data?.error || 'Não foi possível tratar a pendência.');
      if (estadoMudouNoServidor(err)) {
        invalidateFrotasDashboardCache();
        onFechar();
        if (onTratada) onTratada();
        return;
      }
      setSalvando(false);
    }
  };

  return (
    <div className="frotas-modal-overlay" onClick={onFechar}>
      <div className="frotas-modal" role="dialog" aria-label={`Tratar pendência — ${placa || '-'}`} onClick={(e) => e.stopPropagation()}>
        <div className="frotas-modal-header">
          <h2>{`Tratar pendência — ${placa || '-'}`}</h2>
        </div>
        <form onSubmit={enviar}>
          <div className="frotas-modal-body">
            <div className="frotas-form-grid">
              <div className="frotas-form-group full">
                <label htmlFor={`tratamento-${registroId}`}>O que foi feito *</label>
                <textarea
                  id={`tratamento-${registroId}`}
                  value={texto}
                  maxLength={LIMITE_TEXTO}
                  onChange={(e) => setTexto(e.target.value)}
                />
              </div>
              <div className="frotas-form-group full">
                <label htmlFor={`manutencao-${registroId}`}>Manutenção (opcional)</label>
                <select id={`manutencao-${registroId}`} value={manutencaoId} onChange={(e) => setManutencaoId(e.target.value)}>
                  <option value="">— nenhuma —</option>
                  {manutencoes.map((m) => (
                    <option key={m.id} value={m.id}>{`${dataLegivel(m.data_manutencao)} · ${m.descricao || '-'}`}</option>
                  ))}
                </select>
              </div>
            </div>
          </div>
          <div className="frotas-modal-footer">
            <button type="button" className="frotas-btn frotas-btn-secondary" onClick={onFechar}>Cancelar</button>
            <button type="submit" className="frotas-btn frotas-btn-primary" disabled={vazio || salvando}>
              {salvando ? 'Salvando...' : 'Marcar como tratada'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

/** Acoes da linha da lista Checklist (gancho `config.AcoesDaLinha` do FrotasEntityPage). */
export function AcoesDaPendencia({ row, recarregar }) {
  const ehGestor = useEhGestorDaFrota();
  const [aberta, setAberta] = useState(false);
  const [desfazendo, setDesfazendo] = useState(false); // Fase 5: um DELETE por vez (o 2o clique confirmado mandava outro)
  if (!ehGestor || row?.status_geral !== 'PENDENCIA') return null;

  if (pendenciaTratada(row)) {
    const desfazer = async () => {
      if (desfazendo || !window.confirm(MSG_CONFIRMA_DESFAZER)) return;
      setDesfazendo(true);
      try {
        await desfazerTratamento(row.id);
        toast.success('Tratamento desfeito');
        if (recarregar) recarregar();
      } catch (err) {
        toast.error(err?.response?.data?.error || 'Não foi possível desfazer o tratamento.');
        if (estadoMudouNoServidor(err)) {
          invalidateFrotasDashboardCache();
          if (recarregar) recarregar();
        }
      } finally {
        setDesfazendo(false);
      }
    };
    return (
      <button type="button" className="frotas-btn frotas-btn-secondary frotas-btn-pendencia" onClick={desfazer} disabled={desfazendo}>
        Desfazer tratamento
      </button>
    );
  }

  return (
    <>
      <button type="button" className="frotas-btn frotas-btn-primary frotas-btn-pendencia" onClick={() => setAberta(true)}>
        Tratar pendência
      </button>
      {aberta && (
        <JanelaTratarPendencia
          registroId={row.id}
          veiculoId={row.veiculo_id}
          placa={row.placa}
          onFechar={() => setAberta(false)}
          onTratada={recarregar}
        />
      )}
    </>
  );
}

/** Coluna Situacao da lista Checklist quando a pendencia foi tratada: etiqueta + texto embaixo. */
export function SituacaoTratadaGestor({ row }) {
  return (
    <div>
      <span className="frotas-badge frotas-badge-situacao-tratada">{ROTULO_TRATADA}</span>
      <div className="frotas-pendencia-tratada">{textoDaTratadaGestor(row)}</div>
    </div>
  );
}
