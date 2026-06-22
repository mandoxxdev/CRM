import React, { useRef, useMemo } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { Stars } from '@react-three/drei';
import * as THREE from 'three';

const GOLD = '#d4a853';
const CYAN = '#5eb8ff';
const DEEP = '#030818';

function OrionConstellation() {
  const groupRef = useRef();

  const { stars, lineGeometries } = useMemo(() => {
    const positions = {
      betelgeuse: [-1.8, 1.4, -6],
      bellatrix: [0.6, 1.2, -6],
      alnitak: [-0.9, 0.2, -6],
      alnilam: [-0.1, 0.15, -6],
      mintaka: [0.7, 0.1, -6],
      saiph: [-1.2, -1.3, -6],
      rigel: [1.4, -1.5, -6],
    };

    const starList = Object.entries(positions).map(([name, pos]) => ({
      name,
      pos,
      size: name === 'betelgeuse' || name === 'rigel' ? 0.08 : 0.05,
    }));

    const connections = [
      ['betelgeuse', 'bellatrix'],
      ['betelgeuse', 'alnitak'],
      ['bellatrix', 'mintaka'],
      ['alnitak', 'alnilam', 'mintaka'],
      ['alnitak', 'saiph'],
      ['mintaka', 'rigel'],
    ];

    const lineSegments = [];
    connections.forEach((chain) => {
      for (let i = 0; i < chain.length - 1; i += 1) {
        lineSegments.push([positions[chain[i]], positions[chain[i + 1]]]);
      }
    });

    const lineGeometries = lineSegments.map((line) => {
      const points = line.map((p) => new THREE.Vector3(...p));
      return new THREE.BufferGeometry().setFromPoints(points);
    });

    return { stars: starList, lineGeometries };
  }, []);

  useFrame((state) => {
    if (groupRef.current) {
      groupRef.current.rotation.y = Math.sin(state.clock.elapsedTime * 0.08) * 0.04;
    }
  });

  return (
    <group ref={groupRef} position={[0, 0.3, 0]}>
      {stars.map((star) => (
        <mesh key={star.name} position={star.pos}>
          <sphereGeometry args={[star.size, 8, 8]} />
          <meshBasicMaterial color="#e8f0ff" transparent opacity={0.85} />
        </mesh>
      ))}
      {lineGeometries.map((geometry, i) => (
        <line key={`line-${i}`} geometry={geometry}>
          <lineBasicMaterial color="#4a6a9a" transparent opacity={0.35} />
        </line>
      ))}
    </group>
  );
}

function CelestialBird() {
  const birdRef = useRef();
  const leftWingRef = useRef();
  const rightWingRef = useRef();
  const tailRef = useRef();
  const glowRef = useRef();

  const bodyMaterial = useMemo(
    () =>
      new THREE.MeshStandardMaterial({
        color: GOLD,
        metalness: 0.85,
        roughness: 0.18,
        emissive: '#2a5080',
        emissiveIntensity: 0.35,
      }),
    []
  );

  const wingMaterial = useMemo(
    () =>
      new THREE.MeshStandardMaterial({
        color: CYAN,
        metalness: 0.7,
        roughness: 0.25,
        emissive: '#1a4060',
        emissiveIntensity: 0.5,
        transparent: true,
        opacity: 0.92,
        side: THREE.DoubleSide,
      }),
    []
  );

  useFrame((state) => {
    const t = state.clock.elapsedTime;
    const enter = Math.min(t / 1.4, 1);
    const ease = 1 - Math.pow(1 - enter, 3);

    if (birdRef.current) {
      birdRef.current.position.x = THREE.MathUtils.lerp(-5.5, 0, ease);
      birdRef.current.position.y = Math.sin(t * 1.2) * 0.08 + THREE.MathUtils.lerp(-0.3, 0.15, ease);
      birdRef.current.position.z = THREE.MathUtils.lerp(1.5, 0, ease);
      birdRef.current.rotation.y = THREE.MathUtils.lerp(0.6, -0.15, ease);
      birdRef.current.rotation.z = Math.sin(t * 0.8) * 0.03;
    }

    const flap = Math.sin(t * 6) * 0.45 + 0.15;
    if (leftWingRef.current) leftWingRef.current.rotation.z = flap;
    if (rightWingRef.current) rightWingRef.current.rotation.z = -flap;
    if (tailRef.current) tailRef.current.rotation.x = Math.sin(t * 3) * 0.12 - 0.2;

    if (glowRef.current) {
      glowRef.current.scale.setScalar(1 + Math.sin(t * 2) * 0.08);
      glowRef.current.material.opacity = 0.15 + Math.sin(t * 2.5) * 0.05;
    }
  });

  return (
    <group ref={birdRef} scale={0.85}>
      <mesh ref={glowRef} position={[0, 0, -0.3]}>
        <sphereGeometry args={[1.1, 16, 16]} />
        <meshBasicMaterial color={CYAN} transparent opacity={0.18} />
      </mesh>

      <mesh position={[0.35, 0.05, 0]} rotation={[0, 0, -0.3]} material={bodyMaterial}>
        <sphereGeometry args={[0.22, 16, 16]} />
      </mesh>

      <mesh position={[0.65, 0.12, 0]} material={bodyMaterial}>
        <sphereGeometry args={[0.14, 12, 12]} />
      </mesh>

      <mesh position={[0.82, 0.14, 0]} rotation={[0, 0, -0.5]} material={bodyMaterial}>
        <coneGeometry args={[0.05, 0.18, 8]} />
      </mesh>

      <mesh position={[-0.15, 0, 0]} rotation={[0.3, 0, 0]} material={bodyMaterial}>
        <capsuleGeometry args={[0.12, 0.55, 6, 12]} />
      </mesh>

      <group ref={leftWingRef} position={[-0.05, 0.08, 0]}>
        <mesh position={[-0.55, 0.1, 0]} rotation={[0.2, 0.3, 0.6]} material={wingMaterial}>
          <boxGeometry args={[1.1, 0.04, 0.5]} />
        </mesh>
        <mesh position={[-0.35, -0.05, 0.05]} rotation={[0.1, 0.2, 0.4]} material={wingMaterial}>
          <boxGeometry args={[0.7, 0.03, 0.35]} />
        </mesh>
      </group>

      <group ref={rightWingRef} position={[-0.05, 0.08, 0]}>
        <mesh position={[-0.55, 0.1, 0]} rotation={[0.2, -0.3, -0.6]} material={wingMaterial}>
          <boxGeometry args={[1.1, 0.04, 0.5]} />
        </mesh>
        <mesh position={[-0.35, -0.05, -0.05]} rotation={[0.1, -0.2, -0.4]} material={wingMaterial}>
          <boxGeometry args={[0.7, 0.03, 0.35]} />
        </mesh>
      </group>

      <group ref={tailRef} position={[-0.55, 0.02, 0]}>
        <mesh position={[-0.25, 0.05, 0]} rotation={[0, 0, 0.5]} material={wingMaterial}>
          <boxGeometry args={[0.45, 0.02, 0.2]} />
        </mesh>
        <mesh position={[-0.35, 0, 0.08]} rotation={[0.1, 0.2, 0.35]} material={wingMaterial}>
          <boxGeometry args={[0.4, 0.02, 0.15]} />
        </mesh>
        <mesh position={[-0.35, 0, -0.08]} rotation={[-0.1, -0.2, 0.35]} material={wingMaterial}>
          <boxGeometry args={[0.4, 0.02, 0.15]} />
        </mesh>
      </group>
    </group>
  );
}

function Scene() {
  return (
    <>
      <color attach="background" args={[DEEP]} />
      <fog attach="fog" args={[DEEP, 6, 18]} />
      <ambientLight intensity={0.25} />
      <directionalLight position={[4, 6, 5]} intensity={0.9} color="#a8d4ff" />
      <pointLight position={[-3, 2, 3]} intensity={1.2} color={GOLD} />
      <pointLight position={[2, -1, 2]} intensity={0.6} color={CYAN} />
      <Stars radius={60} depth={40} count={2500} factor={2.5} saturation={0.15} fade speed={0.4} />
      <OrionConstellation />
      <CelestialBird />
    </>
  );
}

export default function OrionBirdScene() {
  return (
    <Canvas
      className="orion-intro__canvas"
      camera={{ position: [0, 0.4, 3.8], fov: 48 }}
      dpr={[1, 2]}
      gl={{ antialias: true, alpha: false, powerPreference: 'high-performance' }}
    >
      <Scene />
    </Canvas>
  );
}
