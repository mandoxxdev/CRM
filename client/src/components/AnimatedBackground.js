import React, { useEffect, useRef } from 'react';
import './AnimatedBackground.css';

const AnimatedBackground = ({ nodeCount = 60, connectionDistance = 180 }) => {
  const canvasRef = useRef(null);
  const animationFrameRef = useRef(null);
  const nodesRef = useRef([]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');

    // Configurações (podem ser passadas via props)
    const finalNodeCount = nodeCount || 60;
    const finalConnectionDistance = connectionDistance || 180;
    const nodeSpeed = 0.3;

    // Variáveis para armazenar dimensões de exibição
    let displayWidth = window.innerWidth;
    let displayHeight = window.innerHeight;

    // Ajustar tamanho do canvas
    const resizeCanvas = () => {
      displayWidth = window.innerWidth;
      displayHeight = window.innerHeight;
      const dpr = window.devicePixelRatio || 1;
      
      // Definir tamanho real do canvas (considerando device pixel ratio)
      canvas.width = displayWidth * dpr;
      canvas.height = displayHeight * dpr;
      
      // Resetar transformações e ajustar o contexto para o device pixel ratio
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.scale(dpr, dpr);
      
      // Definir tamanho de exibição do canvas
      canvas.style.width = displayWidth + 'px';
      canvas.style.height = displayHeight + 'px';
    };

    resizeCanvas();
    
    // Recriar nós quando o canvas for redimensionado
    const handleResize = () => {
      resizeCanvas();
      createNodes();
    };
    
    window.addEventListener('resize', handleResize);

    // Criar nós
    const createNodes = () => {
      nodesRef.current = [];
      for (let i = 0; i < finalNodeCount; i++) {
        nodesRef.current.push({
          x: Math.random() * displayWidth,
          y: Math.random() * displayHeight,
          vx: (Math.random() - 0.5) * nodeSpeed,
          vy: (Math.random() - 0.5) * nodeSpeed,
          radius: Math.random() * 2 + 1,
          glow: Math.random() * 0.5 + 0.5
        });
      }
    };

    createNodes();

    // Função de animação otimizada com requestAnimationFrame - SEM LIMITAÇÃO DE FPS
    // Deixa o navegador decidir a melhor taxa de atualização (pode ser 120Hz, 144Hz, etc.)
    const animate = () => {
      
      ctx.clearRect(0, 0, displayWidth, displayHeight);

      // Verificar tema a cada frame para atualizar cores
      const currentIsDarkMode = document.documentElement.getAttribute('data-theme') === 'dark';
      const currentLineOpacity = currentIsDarkMode ? 0.25 : 0.4;

      const nodes = nodesRef.current;

      // Atualizar posição dos nós (mas não desenhar - apenas para calcular conexões)
      nodes.forEach((node) => {
        // Movimento
        node.x += node.vx;
        node.y += node.vy;

        // Rebater nas bordas
        if (node.x < 0 || node.x > displayWidth) node.vx *= -1;
        if (node.y < 0 || node.y > displayHeight) node.vy *= -1;

        // Manter dentro dos limites
        node.x = Math.max(0, Math.min(displayWidth, node.x));
        node.y = Math.max(0, Math.min(displayHeight, node.y));

        // Limitar velocidade
        const speed = Math.sqrt(node.vx * node.vx + node.vy * node.vy);
        if (speed > 2) {
          node.vx = (node.vx / speed) * 2;
          node.vy = (node.vy / speed) * 2;
        }
      });

      // Desenhar conexões
      for (let i = 0; i < nodes.length; i++) {
        for (let j = i + 1; j < nodes.length; j++) {
          const dx = nodes[i].x - nodes[j].x;
          const dy = nodes[i].y - nodes[j].y;
          const distance = Math.sqrt(dx * dx + dy * dy);

          if (distance < finalConnectionDistance) {
            const opacity = (1 - distance / finalConnectionDistance) * currentLineOpacity;
            if (currentIsDarkMode) {
              ctx.strokeStyle = `rgba(255, 255, 255, ${opacity})`;
            } else {
              ctx.strokeStyle = `rgba(130, 130, 130, ${Math.max(opacity, 0.3)})`;
            }
            ctx.lineWidth = currentIsDarkMode ? 1 : 1.5;
            ctx.beginPath();
            ctx.moveTo(nodes[i].x, nodes[i].y);
            ctx.lineTo(nodes[j].x, nodes[j].y);
            ctx.stroke();
          }
        }
      }

      animationFrameRef.current = requestAnimationFrame(animate);
    };

    animationFrameRef.current = requestAnimationFrame(animate);

    // Observar mudanças de tema (não precisa mais, cores são atualizadas em tempo real)
    const observer = new MutationObserver(() => {
      // Cores são atualizadas automaticamente no próximo frame
    });

    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['data-theme']
    });

    return () => {
      window.removeEventListener('resize', handleResize);
      observer.disconnect();
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
    };
  }, [nodeCount, connectionDistance]);

  return (
    <canvas
      ref={canvasRef}
      className="animated-background"
    />
  );
};

export default AnimatedBackground;

