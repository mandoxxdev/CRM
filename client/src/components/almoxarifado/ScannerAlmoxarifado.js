import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import jsQR from 'jsqr';
import { toast } from 'react-toastify';
import AlmoxPageHeader from './AlmoxPageHeader';
import { FiCamera, FiCopy, FiRefreshCw, FiAlertTriangle } from 'react-icons/fi';
import { parseQrDestino } from '../../utils/scannerDestino';
import './Almoxarifado.css';

const INTERVALO_LEITURA_MS = 150; // throttle do loop de decodificacao

/**
 * Scanner de QR pela camera (Etapa 15). 100% client: os QRs das etiquetas (6c)
 * codificam URLs do proprio sistema — ler = navegar. Quem decide o destino e a
 * funcao pura parseQrDestino (RN-01): conteudo fora de /almoxarifado NUNCA navega,
 * e exibido com opcao de copiar.
 */
const ScannerAlmoxarifado = () => {
  const navigate = useNavigate();
  // pedindo (permissao) → lendo (loop) → lido (conteudo nao navegavel) | erro (sem camera)
  const [estado, setEstado] = useState('pedindo');
  const [conteudoLido, setConteudoLido] = useState('');
  const [colado, setColado] = useState('');
  const videoRef = useRef(null);
  const streamRef = useRef(null);
  const rafRef = useRef(null);
  const ultimaLeituraRef = useRef(0);

  const pararStream = useCallback(() => {
    if (rafRef.current) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
  }, []);

  const tratarTexto = useCallback((texto) => {
    const destino = parseQrDestino(texto);
    pararStream();
    if (navigator.vibrate) navigator.vibrate(80);
    if (destino) {
      navigate(destino);
      return;
    }
    // RN-01: conteudo que nao e do modulo e exibido, nunca navegado
    setConteudoLido(texto);
    setEstado('lido');
  }, [navigate, pararStream]);

  const iniciarCamera = useCallback(async () => {
    setConteudoLido('');
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      setEstado('erro');
      return;
    }
    setEstado('pedindo');
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment' },
      });
      streamRef.current = stream;
      const video = videoRef.current;
      if (!video) {
        // usuario saiu da tela antes da permissao chegar
        stream.getTracks().forEach((t) => t.stop());
        streamRef.current = null;
        return;
      }
      video.srcObject = stream;
      await video.play();
      setEstado('lendo');

      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d', { willReadFrequently: true });
      const passo = (agora) => {
        if (!streamRef.current) return;
        if (agora - ultimaLeituraRef.current >= INTERVALO_LEITURA_MS) {
          ultimaLeituraRef.current = agora;
          if (video.readyState >= 2 && video.videoWidth > 0) {
            canvas.width = video.videoWidth;
            canvas.height = video.videoHeight;
            ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
            const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
            const code = jsQR(imageData.data, canvas.width, canvas.height);
            if (code && code.data) {
              tratarTexto(code.data);
              return;
            }
          }
        }
        rafRef.current = requestAnimationFrame(passo);
      };
      rafRef.current = requestAnimationFrame(passo);
    } catch (err) {
      pararStream();
      setEstado('erro');
    }
  }, [pararStream, tratarTexto]);

  useEffect(() => {
    iniciarCamera();
    return pararStream; // cleanup do stream no unmount
  }, [iniciarCamera, pararStream]);

  const abrirColado = (e) => {
    e.preventDefault();
    if (!colado.trim()) return;
    tratarTexto(colado.trim());
  };

  const copiarConteudo = async () => {
    try {
      await navigator.clipboard.writeText(conteudoLido);
      toast.success('Conteúdo copiado');
    } catch (err) {
      toast.error('Não foi possível copiar — selecione o texto manualmente');
    }
  };

  const formColagem = (
    <form onSubmit={abrirColado} style={{ display: 'flex', gap: 8, marginTop: 12 }}>
      <input
        type="text"
        className="almox-input"
        style={{ flex: 1 }}
        placeholder="Cole aqui o conteúdo do QR (ex.: link da etiqueta)"
        value={colado}
        onChange={(e) => setColado(e.target.value)}
      />
      <button type="submit" className="btn-almox-primary" disabled={!colado.trim()}>
        Abrir
      </button>
    </form>
  );

  return (
    <div className="almox-page">
      <AlmoxPageHeader
        title="Scanner"
        subtitle="Aponte a câmera para o QR de uma etiqueta do almoxarifado"
        breadcrumbs={[{ label: 'Scanner' }]}
      />

      {/* painel da camera fica sempre montado (so escondido) para o videoRef existir
          quando a permissao resolver antes do re-render */}
      <div
        className="almox-detail-panel"
        style={{
          padding: 16,
          display: estado === 'pedindo' || estado === 'lendo' ? 'block' : 'none',
        }}
      >
          <div
            style={{
              position: 'relative',
              maxWidth: 480,
              margin: '0 auto',
              borderRadius: 12,
              overflow: 'hidden',
              background: '#000',
            }}
          >
            <video
              ref={videoRef}
              muted
              playsInline
              style={{ width: '100%', display: 'block', minHeight: 240 }}
            />
            {/* moldura de mira */}
            <div
              aria-hidden="true"
              style={{
                position: 'absolute',
                top: '50%',
                left: '50%',
                transform: 'translate(-50%, -50%)',
                width: '60%',
                aspectRatio: '1 / 1',
                border: '3px solid rgba(255,255,255,0.85)',
                borderRadius: 16,
                boxShadow: '0 0 0 9999px rgba(0,0,0,0.35)',
                pointerEvents: 'none',
              }}
            />
            {estado === 'pedindo' && (
              <div
                style={{
                  position: 'absolute',
                  inset: 0,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: '#fff',
                  fontSize: 14,
                }}
              >
                <FiCamera style={{ marginRight: 8 }} /> Aguardando permissão da câmera…
              </div>
            )}
          </div>
          <p style={{ textAlign: 'center', marginTop: 12, color: 'var(--text-secondary, #666)' }}>
            {estado === 'lendo'
              ? 'Lendo… centralize o QR na moldura.'
              : 'Autorize o uso da câmera para começar a ler.'}
          </p>
      </div>

      {estado === 'lido' && (
        <div className="almox-detail-panel" style={{ padding: 16, maxWidth: 560, margin: '0 auto' }}>
          <div className="almox-hint-banner" style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
            <FiAlertTriangle style={{ flexShrink: 0, marginTop: 2 }} />
            <span>
              Este QR não é uma etiqueta do almoxarifado — por segurança, o conteúdo é só
              exibido, nunca aberto.
            </span>
          </div>
          <pre
            style={{
              marginTop: 12,
              padding: 12,
              background: 'rgba(0,0,0,0.06)',
              borderRadius: 8,
              whiteSpace: 'pre-wrap',
              wordBreak: 'break-all',
              fontSize: 13,
            }}
          >
            {conteudoLido}
          </pre>
          <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
            <button type="button" className="btn-almox-secondary" onClick={copiarConteudo}>
              <FiCopy /> Copiar
            </button>
            <button type="button" className="btn-almox-primary" onClick={iniciarCamera}>
              <FiRefreshCw /> Ler outro
            </button>
          </div>
        </div>
      )}

      {estado === 'erro' && (
        <div className="almox-detail-panel" style={{ padding: 16, maxWidth: 560, margin: '0 auto' }}>
          <div className="almox-empty" style={{ padding: 24, textAlign: 'center' }}>
            <FiCamera size={32} style={{ opacity: 0.5 }} />
            <h3 style={{ margin: '12px 0 4px' }}>Câmera indisponível</h3>
            <p style={{ margin: 0, color: 'var(--text-secondary, #666)' }}>
              O acesso à câmera foi negado ou este aparelho/navegador não oferece câmera.
              Libere a permissão nas configurações do navegador e{' '}
              <button
                type="button"
                className="btn-almox-secondary"
                style={{ verticalAlign: 'baseline' }}
                onClick={iniciarCamera}
              >
                tente de novo
              </button>
              , ou cole abaixo o conteúdo do QR.
            </p>
          </div>
          {formColagem}
        </div>
      )}
    </div>
  );
};

export default ScannerAlmoxarifado;
