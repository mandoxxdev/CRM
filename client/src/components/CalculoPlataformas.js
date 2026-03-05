import React, { useState, useRef, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { FiArrowLeft, FiPlus, FiTrash2, FiBox } from 'react-icons/fi';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import './CalculoPlataformas.css';

const SCALE = 100; // 1 unidade 3D = 100 mm (para não ficar gigante)
const ALTURA_EQUIP_DEFAULT = 800; // altura padrão do cilindro que representa o equipamento (mm)

// Calcula posições (x, z) em mm para cada equipamento em filas, com margem e espaçamento
function calcularLayout(equipamentos, larguraPlat, comprimentoPlat, margem, espacamento) {
  const posicoes = [];
  let x = margem;
  let y = margem;
  let maxAlturaLinha = 0;

  for (let i = 0; i < equipamentos.length; i++) {
    const d = Number(equipamentos[i].diametro) || 0;
    if (d <= 0) continue;
    const raio = d / 2;
    if (x + d + espacamento > larguraPlat - margem) {
      x = margem;
      y += maxAlturaLinha + espacamento;
      maxAlturaLinha = 0;
    }
    if (y + d > comprimentoPlat - margem) break;
    posicoes.push({
      x: x + raio,
      z: y + raio,
      diametro: d,
      nome: equipamentos[i].nome || `Equip ${i + 1}`
    });
    x += d + espacamento;
    maxAlturaLinha = Math.max(maxAlturaLinha, d);
  }
  return posicoes;
}

function CalculoPlataformas() {
  const navigate = useNavigate();
  const containerRef = useRef(null);
  const sceneRef = useRef(null);
  const rendererRef = useRef(null);
  const cameraRef = useRef(null);
  const controlsRef = useRef(null);
  const animIdRef = useRef(null);

  const [comprimento, setComprimento] = useState(3000);
  const [largura, setLargura] = useState(2500);
  const [altura, setAltura] = useState(150);
  const [margem, setMargem] = useState(200);
  const [espacamento, setEspacamento] = useState(150);
  const [equipamentos, setEquipamentos] = useState([
    { id: 1, nome: 'Masseira 500L', diametro: 1200 },
    { id: 2, nome: 'Dispersor', diametro: 800 }
  ]);
  const [mostrar3D, setMostrar3D] = useState(false);

  const adicionarEquipamento = () => {
    setEquipamentos((prev) => [
      ...prev,
      { id: Math.max(0, ...prev.map((e) => e.id)) + 1, nome: '', diametro: 500 }
    ]);
  };

  const removerEquipamento = (id) => {
    setEquipamentos((prev) => prev.filter((e) => e.id !== id));
  };

  const atualizarEquipamento = (id, field, value) => {
    setEquipamentos((prev) =>
      prev.map((e) => (e.id === id ? { ...e, [field]: field === 'diametro' ? Number(value) || 0 : value } : e))
    );
  };

  const posicoes = calcularLayout(
    equipamentos.filter((e) => (e.diametro || 0) > 0),
    largura,
    comprimento,
    margem,
    espacamento
  );

  const initScene = useCallback(() => {
    if (!containerRef.current) return;
    const width = containerRef.current.clientWidth;
    const height = containerRef.current.clientHeight;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0xf0f4f8);
    sceneRef.current = scene;

    const L = comprimento / SCALE;
    const W = largura / SCALE;
    const H = altura / SCALE;
    const camera = new THREE.PerspectiveCamera(50, width / height, 1, 50000);
    camera.position.set(L * 0.8, Math.max(L, W) * 1.2, W * 0.8);
    camera.lookAt(L / 2, H / 2, W / 2);
    cameraRef.current = camera;

    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(width, height);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    containerRef.current.appendChild(renderer.domElement);
    rendererRef.current = renderer;

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.05;
    controls.target.set(L / 2, H / 2, W / 2);
    controlsRef.current = controls;

    // Luz
    const ambient = new THREE.AmbientLight(0xffffff, 0.6);
    scene.add(ambient);
    const dirLight = new THREE.DirectionalLight(0xffffff, 0.8);
    dirLight.position.set(50, 100, 50);
    dirLight.castShadow = true;
    dirLight.shadow.mapSize.width = 2048;
    dirLight.shadow.mapSize.height = 2048;
    scene.add(dirLight);

    // Plataforma (chão) – caixa
    const geoPlat = new THREE.BoxGeometry(L, H, W);
    const matPlat = new THREE.MeshStandardMaterial({
      color: 0x475569,
      metalness: 0.3,
      roughness: 0.7
    });
    const plataforma = new THREE.Mesh(geoPlat, matPlat);
    plataforma.position.set(L / 2, H / 2, W / 2);
    plataforma.receiveShadow = true;
    scene.add(plataforma);

    // Equipamentos (cilindros)
    const corEquip = 0x0ea5e9;
    posicoes.forEach((p, i) => {
      const r = p.diametro / 2 / SCALE;
      const hEquip = ALTURA_EQUIP_DEFAULT / SCALE;
      const geo = new THREE.CylinderGeometry(r, r, hEquip, 32);
      const mat = new THREE.MeshStandardMaterial({
        color: corEquip,
        metalness: 0.2,
        roughness: 0.8
      });
      const cilindro = new THREE.Mesh(geo, mat);
      // Layout: p.x = pos ao longo da largura, p.z = pos ao longo do comprimento → 3D: X=comprimento, Z=largura
      cilindro.position.set(p.z / SCALE, H + hEquip / 2, p.x / SCALE);
      cilindro.castShadow = true;
      cilindro.receiveShadow = true;
      scene.add(cilindro);
    });

    const animate = () => {
      animIdRef.current = requestAnimationFrame(animate);
      controls.update();
      renderer.render(scene, camera);
    };
    animate();
  }, [comprimento, largura, altura, posicoes]);

  useEffect(() => {
    if (!mostrar3D || !posicoes.length) return;
    const container = containerRef.current;
    if (!container) return;
    initScene();
    const onResize = () => {
      if (!containerRef.current || !rendererRef.current || !cameraRef.current) return;
      const width = containerRef.current.clientWidth;
      const height = containerRef.current.clientHeight;
      cameraRef.current.aspect = width / height;
      cameraRef.current.updateProjectionMatrix();
      rendererRef.current.setSize(width, height);
    };
    window.addEventListener('resize', onResize);
    return () => {
      window.removeEventListener('resize', onResize);
      if (animIdRef.current) cancelAnimationFrame(animIdRef.current);
      const rend = rendererRef.current;
      if (rend && rend.domElement && container) {
        try {
          container.removeChild(rend.domElement);
        } catch (_) {}
        rend.dispose();
      }
      sceneRef.current = null;
      rendererRef.current = null;
      controlsRef.current = null;
      cameraRef.current = null;
    };
  }, [mostrar3D, initScene, posicoes.length]);

  return (
    <div className="calculo-plataformas">
      <header className="calculo-plataformas-header">
        <button type="button" className="calculo-plataformas-voltar" onClick={() => navigate('/engenharia')}>
          <FiArrowLeft /> Voltar
        </button>
        <h1>Cálculo de plataformas</h1>
        <p>Defina as dimensões da plataforma e os diâmetros dos equipamentos. O sistema gera a visualização 3D com o layout sugerido.</p>
      </header>

      <div className="calculo-plataformas-layout">
        <section className="calculo-plataformas-form">
          <div className="calculo-plataformas-card">
            <h2>Dimensões da plataforma (mm)</h2>
            <div className="calculo-plataformas-grid">
              <div className="calculo-plataformas-field">
                <label>Comprimento (mm)</label>
                <input
                  type="number"
                  min={500}
                  value={comprimento}
                  onChange={(e) => setComprimento(Number(e.target.value) || 0)}
                />
              </div>
              <div className="calculo-plataformas-field">
                <label>Largura (mm)</label>
                <input
                  type="number"
                  min={500}
                  value={largura}
                  onChange={(e) => setLargura(Number(e.target.value) || 0)}
                />
              </div>
              <div className="calculo-plataformas-field">
                <label>Altura (mm)</label>
                <input
                  type="number"
                  min={50}
                  value={altura}
                  onChange={(e) => setAltura(Number(e.target.value) || 0)}
                />
              </div>
            </div>
          </div>

          <div className="calculo-plataformas-card">
            <h2>Parâmetros de layout (mm)</h2>
            <div className="calculo-plataformas-grid">
              <div className="calculo-plataformas-field">
                <label>Margem da borda</label>
                <input
                  type="number"
                  min={0}
                  value={margem}
                  onChange={(e) => setMargem(Number(e.target.value) || 0)}
                />
              </div>
              <div className="calculo-plataformas-field">
                <label>Espaçamento entre equipamentos</label>
                <input
                  type="number"
                  min={0}
                  value={espacamento}
                  onChange={(e) => setEspacamento(Number(e.target.value) || 0)}
                />
              </div>
            </div>
          </div>

          <div className="calculo-plataformas-card">
            <div className="calculo-plataformas-card-header">
              <h2>Equipamentos (diâmetro em mm)</h2>
              <button type="button" className="calculo-plataformas-btn-add" onClick={adicionarEquipamento}>
                <FiPlus /> Adicionar
              </button>
            </div>
            <div className="calculo-plataformas-table-wrap">
              <table className="calculo-plataformas-table">
                <thead>
                  <tr>
                    <th>Nome / identificação</th>
                    <th>Diâmetro (mm)</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {equipamentos.map((eq) => (
                    <tr key={eq.id}>
                      <td>
                        <input
                          type="text"
                          value={eq.nome}
                          onChange={(e) => atualizarEquipamento(eq.id, 'nome', e.target.value)}
                          placeholder="Ex: Masseira 500L"
                        />
                      </td>
                      <td>
                        <input
                          type="number"
                          min={1}
                          value={eq.diametro || ''}
                          onChange={(e) => atualizarEquipamento(eq.id, 'diametro', e.target.value)}
                          placeholder="mm"
                        />
                      </td>
                      <td>
                        <button
                          type="button"
                          className="calculo-plataformas-btn-remove"
                          onClick={() => removerEquipamento(eq.id)}
                          title="Remover"
                        >
                          <FiTrash2 />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <button
            type="button"
            className="calculo-plataformas-btn-gerar"
            onClick={() => setMostrar3D(true)}
            disabled={!equipamentos.some((e) => (e.diametro || 0) > 0)}
          >
            <FiBox /> Gerar visualização 3D
          </button>
        </section>

        {mostrar3D && (
          <section className="calculo-plataformas-3d">
            <div className="calculo-plataformas-3d-header">
              <h2>Visualização 3D</h2>
              <p>Arraste para girar • Scroll para zoom</p>
            </div>
            <div ref={containerRef} className="calculo-plataformas-canvas" />
            {posicoes.length === 0 && (
              <div className="calculo-plataformas-3d-aviso">
                Adicione pelo menos um equipamento com diâmetro &gt; 0 e clique em &quot;Gerar visualização 3D&quot;.
              </div>
            )}
          </section>
        )}
      </div>
    </div>
  );
}

export default CalculoPlataformas;
