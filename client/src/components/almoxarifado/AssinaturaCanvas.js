import React, { useEffect, useRef, useState } from 'react';

/**
 * Canvas de assinatura (Etapa 15, contrato C4).
 *
 * Pointer events cobrem mouse E toque num handler só — com setPointerCapture o traço não
 * escapa do canvas quando o dedo sai da borda (comum assinando em pé no balcão). Sem lib
 * externa de propósito: o que precisamos é traço + exportar PNG, nada de biometria.
 *
 * `onConfirm` recebe um Blob PNG (canvas.toBlob). "Confirmar assinatura" fica desabilitado
 * até existir traço; "Limpar" volta ao estado inicial.
 */
const AssinaturaCanvas = ({ onConfirm, height = 180, width = 480 }) => {
  const canvasRef = useRef(null);
  const desenhandoRef = useRef(false);
  const [temTraco, setTemTraco] = useState(false);

  const pintarFundo = (canvas) => {
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    return ctx;
  };

  useEffect(() => {
    if (canvasRef.current) pintarFundo(canvasRef.current);
  }, []);

  // O canvas tem resolução fixa mas é exibido a 100% da largura do modal — converte as
  // coordenadas do evento (CSS px) para o espaço interno do bitmap.
  const getPos = (e) => {
    const canvas = canvasRef.current;
    const rect = canvas.getBoundingClientRect();
    const sx = rect.width ? canvas.width / rect.width : 1;
    const sy = rect.height ? canvas.height / rect.height : 1;
    return { x: (e.clientX - rect.left) * sx, y: (e.clientY - rect.top) * sy };
  };

  const handlePointerDown = (e) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    e.preventDefault();
    canvas.setPointerCapture?.(e.pointerId);
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const { x, y } = getPos(e);
    ctx.strokeStyle = '#1a1a2e';
    ctx.lineWidth = 2.5;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.beginPath();
    ctx.moveTo(x, y);
    desenhandoRef.current = true;
  };

  const handlePointerMove = (e) => {
    if (!desenhandoRef.current) return;
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!ctx) return;
    const { x, y } = getPos(e);
    ctx.lineTo(x, y);
    ctx.stroke();
    if (!temTraco) setTemTraco(true);
  };

  const handlePointerUp = (e) => {
    if (!desenhandoRef.current) return;
    desenhandoRef.current = false;
    canvasRef.current?.releasePointerCapture?.(e.pointerId);
  };

  const handleLimpar = () => {
    const canvas = canvasRef.current;
    if (canvas) pintarFundo(canvas);
    desenhandoRef.current = false;
    setTemTraco(false);
  };

  const handleConfirmar = () => {
    const canvas = canvasRef.current;
    if (!canvas || !temTraco) return;
    canvas.toBlob((blob) => {
      if (blob && onConfirm) onConfirm(blob);
    }, 'image/png');
  };

  return (
    <div>
      <canvas
        ref={canvasRef}
        width={width}
        height={height}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
        style={{
          width: '100%',
          height,
          background: '#ffffff',
          border: '1px dashed var(--gmp-border)',
          borderRadius: 8,
          touchAction: 'none',
          cursor: 'crosshair',
          display: 'block',
        }}
      />
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, marginTop: 8 }}>
        <button type="button" className="btn-almox-secondary" onClick={handleLimpar}>
          Limpar
        </button>
        <button type="button" className="btn-almox-primary" onClick={handleConfirmar} disabled={!temTraco}>
          ✍ Confirmar assinatura
        </button>
      </div>
    </div>
  );
};

export default AssinaturaCanvas;
