import React, { useState, useRef, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { FiArrowLeft, FiPlus, FiTrash2, FiUpload } from 'react-icons/fi';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import './CalculoPlataformas.css';

const SCALE = 100; // 1 unidade 3D = 100 mm (para não ficar gigante)
const ALTURA_EQUIP_DEFAULT = 1200; // altura total padrão (mm)
const ALTURA_ACIMA_DEFAULT = 825;   // parte acima da plataforma (mm); o restante fica “dentro” da plataforma

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
    const eq = equipamentos[i];
    const altTotal = Number(eq.altura) || ALTURA_EQUIP_DEFAULT;
    const altAcima = Number(eq.alturaAcima) ?? ALTURA_ACIMA_DEFAULT;
    posicoes.push({
      x: x + raio,
      z: y + raio,
      diametro: d,
      nome: eq.nome || `Equip ${i + 1}`,
      altura: Math.max(1, altTotal),
      alturaAcima: Math.min(altTotal, Math.max(0, altAcima)),
      modelUrl: eq.modelUrl || null
    });
    x += d + espacamento;
    maxAlturaLinha = Math.max(maxAlturaLinha, d);
  }
  return posicoes;
}

// Cria um tanque de mistura (corpo cilíndrico + fundo cônico + faixas + tampa + sugestão de agitadores)
function createTanqueMistura(scene, r, hEquip, posX, posY, posZ) {
  const coneRatio = 0.18;
  const coneH = hEquip * coneRatio;
  const cylH = hEquip - coneH;
  const rOutlet = Math.max(r * 0.12, 0.02);
  const matInox = new THREE.MeshStandardMaterial({
    color: 0xc0c4c8,
    metalness: 0.5,
    roughness: 0.45
  });
  const matBanda = new THREE.MeshStandardMaterial({
    color: 0xd97706,
    metalness: 0.5,
    roughness: 0.5
  });
  const matMotorCentral = new THREE.MeshStandardMaterial({
    color: 0x4b5563,
    metalness: 0.4,
    roughness: 0.6
  });
  const matMotorLateral = new THREE.MeshStandardMaterial({
    color: 0x2563eb,
    metalness: 0.45,
    roughness: 0.55
  });

  const grupo = new THREE.Group();

  // Corpo cilíndrico (parte reta)
  const centroCil = -hEquip / 2 + coneH + cylH / 2;
  const geoCorpo = new THREE.CylinderGeometry(r, r, cylH, 32);
  const corpo = new THREE.Mesh(geoCorpo, matInox);
  corpo.position.y = centroCil;
  corpo.castShadow = true;
  corpo.receiveShadow = true;
  grupo.add(corpo);

  // Fundo cônico
  const geoCono = new THREE.CylinderGeometry(rOutlet, r, coneH, 32);
  const cono = new THREE.Mesh(geoCono, matInox);
  cono.position.y = -hEquip / 2 + coneH / 2;
  cono.castShadow = true;
  cono.receiveShadow = true;
  grupo.add(cono);

  // Duas faixas horizontais (anéis)
  const espBanda = Math.min(r * 0.08, 0.08);
  const raioBanda = r + espBanda * 0.5;
  const geoBanda = new THREE.TorusGeometry(raioBanda, espBanda, 8, 32);
  const banda1 = new THREE.Mesh(geoBanda, matBanda);
  banda1.position.y = centroCil - cylH * 0.25;
  banda1.rotation.x = Math.PI / 2;
  banda1.castShadow = true;
  grupo.add(banda1);
  const banda2 = new THREE.Mesh(geoBanda, matBanda);
  banda2.position.y = centroCil + cylH * 0.2;
  banda2.rotation.x = Math.PI / 2;
  banda2.castShadow = true;
  grupo.add(banda2);

  // Tampa superior (disco fino)
  const altTampa = Math.min(hEquip * 0.02, 0.05);
  const geoTampa = new THREE.CylinderGeometry(r, r, altTampa, 32);
  const tampa = new THREE.Mesh(geoTampa, matInox);
  tampa.position.y = hEquip / 2 - altTampa / 2;
  tampa.castShadow = true;
  grupo.add(tampa);

  // Agitadores no topo: 1 central (cinza) + 2 laterais (azul)
  const yTopo = hEquip / 2 + altTampa / 2;
  const altMotor = Math.min(r * 0.5, 0.2);
  const rMotorCentral = r * 0.2;
  const rMotorLateral = r * 0.12;
  const distLateral = r * 0.35;
  const geoMotorC = new THREE.CylinderGeometry(rMotorCentral, rMotorCentral, altMotor, 16);
  const motorC = new THREE.Mesh(geoMotorC, matMotorCentral);
  motorC.position.set(0, yTopo + altMotor / 2, 0);
  motorC.castShadow = true;
  grupo.add(motorC);
  const geoMotorL = new THREE.CylinderGeometry(rMotorLateral, rMotorLateral, altMotor * 0.9, 16);
  const motorL1 = new THREE.Mesh(geoMotorL, matMotorLateral);
  motorL1.position.set(-distLateral, yTopo + altMotor * 0.45, 0);
  motorL1.castShadow = true;
  grupo.add(motorL1);
  const motorL2 = new THREE.Mesh(geoMotorL, matMotorLateral);
  motorL2.position.set(distLateral, yTopo + altMotor * 0.45, 0);
  motorL2.castShadow = true;
  grupo.add(motorL2);

  grupo.position.set(posX, posY, posZ);
  scene.add(grupo);
}

// Carrega modelo 3D (GLB/GLTF) e coloca na cena, escalado pelo diâmetro e altura informados no cadastro
function loadModeloEquipamento(scene, modelUrl, diametroMm, alturaTotalMm, hEquip, posX, posY, posZ) {
  const loader = new GLTFLoader();
  loader.load(
    modelUrl,
    (gltf) => {
      const model = gltf.scene;
      const bbox = new THREE.Box3().setFromObject(model);
      const size = new THREE.Vector3();
      bbox.getSize(size);
      const center = new THREE.Vector3();
      bbox.getCenter(center);
      model.position.sub(center);
      const diametroCena = diametroMm / SCALE;
      const maxLateral = Math.max(size.x, size.z) || 1;
      const altModelo = size.y || 1;
      const scaleXZ = diametroCena / maxLateral;
      const scaleY = hEquip / altModelo;
      model.scale.set(scaleXZ, scaleY, scaleXZ);
      model.traverse((child) => {
        if (child.isMesh) {
          child.castShadow = true;
          child.receiveShadow = true;
        }
      });
      const grupo = new THREE.Group();
      grupo.add(model);
      grupo.position.set(posX, posY, posZ);
      scene.add(grupo);
    },
    undefined,
    (err) => console.warn('Erro ao carregar modelo 3D:', err)
  );
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
    { id: 1, nome: 'Masseira 500L', diametro: 1200, altura: 1200, alturaAcima: 825 },
    { id: 2, nome: 'Dispersor', diametro: 800, altura: 1000, alturaAcima: 600 }
  ]);

  useEffect(() => {
    return () => {
      equipamentos.forEach((e) => {
        if (e.modelUrl?.startsWith('blob:')) try { URL.revokeObjectURL(e.modelUrl); } catch (_) {}
      });
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const adicionarEquipamento = () => {
    setEquipamentos((prev) => [
      ...prev,
      { id: Math.max(0, ...prev.map((e) => e.id)) + 1, nome: '', diametro: 500, altura: ALTURA_EQUIP_DEFAULT, alturaAcima: ALTURA_ACIMA_DEFAULT }
    ]);
  };

  const removerEquipamento = (id) => {
    setEquipamentos((prev) => {
      const eq = prev.find((e) => e.id === id);
      if (eq?.modelUrl?.startsWith('blob:')) try { URL.revokeObjectURL(eq.modelUrl); } catch (_) {}
      return prev.filter((e) => e.id !== id);
    });
  };

  const atualizarEquipamento = (id, field, value) => {
    const numFields = ['diametro', 'altura', 'alturaAcima'];
    setEquipamentos((prev) =>
      prev.map((e) => {
        if (e.id !== id) return e;
        if (field === 'modelUrl') {
          if (e.modelUrl?.startsWith('blob:')) try { URL.revokeObjectURL(e.modelUrl); } catch (_) {}
          return { ...e, modelUrl: value || '', modelFileName: value ? e.modelFileName : '' };
        }
        return { ...e, [field]: numFields.includes(field) ? Number(value) || 0 : value };
      })
    );
  };

  const handleModeloFile = (id, file) => {
    if (!file) return;
    setEquipamentos((prev) => {
      const eq = prev.find((e) => e.id === id);
      if (eq?.modelUrl?.startsWith('blob:')) try { URL.revokeObjectURL(eq.modelUrl); } catch (_) {}
      const url = URL.createObjectURL(file);
      return prev.map((e) => (e.id === id ? { ...e, modelUrl: url, modelFileName: file.name } : e));
    });
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
    const ambient = new THREE.AmbientLight(0xffffff, 0.55);
    scene.add(ambient);
    const dirLight = new THREE.DirectionalLight(0xffffff, 0.85);
    dirLight.position.set(L * 0.5, L + W, W * 0.5);
    dirLight.castShadow = true;
    dirLight.shadow.mapSize.width = 2048;
    dirLight.shadow.mapSize.height = 2048;
    scene.add(dirLight);

    // --- Plataforma vazada: só piso fino no topo + pilares (altura = altura dos pilares) ---
    const corConcreto = 0xb8bcc4;
    const corEstrutura = 0x64748b;
    const corGuardaCorpo = 0xf59e0b;
    const espColuna = Math.min(L, W) * 0.04;
    const altGuardaCorpo = Math.min(L, W) * 0.015;
    const espessuraPiso = Math.min(Math.max(L, W) * 0.02, 0.25);

    // Piso fino só no topo (embaixo fica vazado)
    const geoPiso = new THREE.BoxGeometry(L, espessuraPiso, W);
    const matPiso = new THREE.MeshStandardMaterial({
      color: corConcreto,
      metalness: 0.08,
      roughness: 0.92
    });
    const piso = new THREE.Mesh(geoPiso, matPiso);
    piso.position.set(L / 2, H - espessuraPiso / 2, W / 2);
    piso.receiveShadow = true;
    scene.add(piso);

    // Pilares: altura H (o campo "altura" define só os pilares); espaço embaixo fica vazio
    const matColuna = new THREE.MeshStandardMaterial({
      color: corEstrutura,
      metalness: 0.35,
      roughness: 0.65
    });
    const posColunas = [
      [espColuna / 2, espColuna / 2],
      [L - espColuna / 2, espColuna / 2],
      [L - espColuna / 2, W - espColuna / 2],
      [espColuna / 2, W - espColuna / 2],
      [L / 2, espColuna / 2],
      [L / 2, W - espColuna / 2],
      [espColuna / 2, W / 2],
      [L - espColuna / 2, W / 2]
    ];
    posColunas.forEach(([px, pz]) => {
      const col = new THREE.Mesh(new THREE.BoxGeometry(espColuna, H, espColuna), matColuna);
      col.position.set(px, H / 2, pz);
      col.castShadow = true;
      col.receiveShadow = true;
      scene.add(col);
    });

    // Guarda-corpos / bordas no topo (estilo industrial)
    const matGuarda = new THREE.MeshStandardMaterial({
      color: corGuardaCorpo,
      metalness: 0.4,
      roughness: 0.6
    });
    const gH = altGuardaCorpo;
    const gEsp = espColuna * 0.6;
    const compFront = L + gEsp * 2;
    const largFront = gEsp;
    const geoBorda1 = new THREE.BoxGeometry(compFront, gH, largFront);
    const geoBorda2 = new THREE.BoxGeometry(largFront, gH, W + gEsp * 2);
    const b1 = new THREE.Mesh(geoBorda1, matGuarda);
    b1.position.set(L / 2, H + gH / 2, -largFront / 2);
    b1.castShadow = true;
    scene.add(b1);
    const b2 = new THREE.Mesh(geoBorda1, matGuarda);
    b2.position.set(L / 2, H + gH / 2, W + largFront / 2);
    b2.castShadow = true;
    scene.add(b2);
    const b3 = new THREE.Mesh(geoBorda2, matGuarda);
    b3.position.set(-largFront / 2, H + gH / 2, W / 2);
    b3.castShadow = true;
    scene.add(b3);
    const b4 = new THREE.Mesh(geoBorda2, matGuarda);
    b4.position.set(L + largFront / 2, H + gH / 2, W / 2);
    b4.castShadow = true;
    scene.add(b4);

    // Equipamentos: modelo 3D (GLB/GLTF) se tiver arquivo, senão tanque de mistura padrão
    posicoes.forEach((p) => {
      const r = p.diametro / 2 / SCALE;
      const hEquip = (p.altura || ALTURA_EQUIP_DEFAULT) / SCALE;
      const alturaAcima = (p.alturaAcima ?? ALTURA_ACIMA_DEFAULT) / SCALE;
      const cy = H + alturaAcima - hEquip / 2;
      const posX = p.z / SCALE;
      const posZ = p.x / SCALE;
      if (p.modelUrl) {
        loadModeloEquipamento(scene, p.modelUrl, p.diametro, p.altura || ALTURA_EQUIP_DEFAULT, hEquip, posX, cy, posZ);
      } else {
        createTanqueMistura(scene, r, hEquip, posX, cy, posZ);
      }
    });

    const animate = () => {
      animIdRef.current = requestAnimationFrame(animate);
      controls.update();
      renderer.render(scene, camera);
    };
    animate();
  }, [comprimento, largura, altura, posicoes]);

  useEffect(() => {
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
  }, [initScene]);

  return (
    <div className="calculo-plataformas">
      <header className="calculo-plataformas-header">
        <button type="button" className="calculo-plataformas-voltar" onClick={() => navigate('/engenharia')}>
          <FiArrowLeft /> Voltar
        </button>
        <h1>Cálculo de plataformas</h1>
        <p>Altere as dimensões e os equipamentos; a visualização 3D atualiza automaticamente.</p>
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
              <h2>Equipamentos</h2>
              <button type="button" className="calculo-plataformas-btn-add" onClick={adicionarEquipamento}>
                <FiPlus /> Adicionar
              </button>
            </div>
            <p className="calculo-plataformas-hint">
              Altura total: tamanho do equipamento. Altura acima: parte que fica para cima da plataforma; o restante fica dentro/abaixo do piso.
            </p>
            <p className="calculo-plataformas-hint">
              <strong>Modelo 3D:</strong> Exporte do Inventor (ou outro CAD) em <strong>GLB ou GLTF</strong> e envie aqui. Se não enviar, será usado o tanque padrão.
            </p>
            <div className="calculo-plataformas-table-wrap">
              <table className="calculo-plataformas-table">
                <thead>
                  <tr>
                    <th>Nome</th>
                    <th>Diâmetro (mm)</th>
                    <th>Altura total (mm)</th>
                    <th>Altura acima (mm)</th>
                    <th>Modelo 3D (GLB/GLTF)</th>
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
                          value={eq.diametro ?? ''}
                          onChange={(e) => atualizarEquipamento(eq.id, 'diametro', e.target.value)}
                          placeholder="mm"
                        />
                      </td>
                      <td>
                        <input
                          type="number"
                          min={1}
                          value={eq.altura ?? ''}
                          onChange={(e) => atualizarEquipamento(eq.id, 'altura', e.target.value)}
                          placeholder="Ex: 1200"
                          title="Altura total do equipamento"
                        />
                      </td>
                      <td>
                        <input
                          type="number"
                          min={0}
                          value={eq.alturaAcima ?? ''}
                          onChange={(e) => atualizarEquipamento(eq.id, 'alturaAcima', e.target.value)}
                          placeholder="Ex: 825"
                          title="Parte que fica acima do piso da plataforma"
                        />
                      </td>
                      <td className="calculo-plataformas-td-modelo">
                        <label className="calculo-plataformas-file-label">
                          <input
                            type="file"
                            accept=".glb,.gltf"
                            onChange={(e) => handleModeloFile(eq.id, e.target.files?.[0])}
                            className="calculo-plataformas-file-input"
                          />
                          <span className="calculo-plataformas-file-btn"><FiUpload /> {eq.modelFileName ? eq.modelFileName : 'Enviar GLB/GLTF'}</span>
                        </label>
                        {eq.modelUrl && (
                          <button
                            type="button"
                            className="calculo-plataformas-btn-limpar-modelo"
                            onClick={() => atualizarEquipamento(eq.id, 'modelUrl', '')}
                            title="Remover modelo 3D"
                          >
                            Limpar
                          </button>
                        )}
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

        </section>

        <section className="calculo-plataformas-3d">
          <div className="calculo-plataformas-3d-header">
            <h2>Visualização 3D</h2>
            <p>Atualiza ao editar • Arraste para girar • Scroll para zoom</p>
          </div>
          <div ref={containerRef} className="calculo-plataformas-canvas" />
          {posicoes.length === 0 && (
            <div className="calculo-plataformas-3d-aviso">
              Adicione pelo menos um equipamento com diâmetro &gt; 0 para ver na plataforma.
            </div>
          )}
        </section>
      </div>
    </div>
  );
}

export default CalculoPlataformas;
