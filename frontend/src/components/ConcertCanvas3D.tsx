"use client";

import { useEffect, useRef } from "react";
import * as THREE from "three";

export default function ConcertCanvas3D() {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    // Scene & Fog
    const scene = new THREE.Scene();
    scene.fog = new THREE.FogExp2(0x060714, 0.04);

    // Camera
    const camera = new THREE.PerspectiveCamera(
      45,
      container.clientWidth / container.clientHeight,
      0.1,
      100
    );
    camera.position.set(0, 0.4, 7.8);

    // WebGL Renderer
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(container.clientWidth, container.clientHeight);
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.25;
    container.appendChild(renderer.domElement);

    // Main 3D Rig Group
    const stageRig = new THREE.Group();
    scene.add(stageRig);

    // -------------------------------------------------------------
    // 1. Central 3D "EchoSphere" Holographic Orb
    // -------------------------------------------------------------
    const sphereGroup = new THREE.Group();
    
    // Wireframe geometric audio sphere
    const sphereGeo = new THREE.IcosahedronGeometry(1.8, 2);
    const sphereWireMat = new THREE.MeshBasicMaterial({
      color: 0x8b5cf6,
      wireframe: true,
      transparent: true,
      opacity: 0.35,
    });
    const echoSphereMesh = new THREE.Mesh(sphereGeo, sphereWireMat);
    sphereGroup.add(echoSphereMesh);

    // Inner glowing core sphere
    const coreGeo = new THREE.SphereGeometry(1.1, 32, 32);
    const coreMat = new THREE.MeshStandardMaterial({
      color: 0x3b82f6,
      emissive: 0x1d4ed8,
      emissiveIntensity: 0.8,
      roughness: 0.2,
      metalness: 0.9,
      transparent: true,
      opacity: 0.25,
    });
    const coreMesh = new THREE.Mesh(coreGeo, coreMat);
    sphereGroup.add(coreMesh);

    stageRig.add(sphereGroup);

    // -------------------------------------------------------------
    // 2. 3D Vintage Stage Microphone
    // -------------------------------------------------------------
    const micGroup = new THREE.Group();

    const chromeMat = new THREE.MeshStandardMaterial({
      color: 0xf1f5f9,
      metalness: 0.95,
      roughness: 0.15,
    });

    const darkMetalMat = new THREE.MeshStandardMaterial({
      color: 0x0f172a,
      metalness: 0.9,
      roughness: 0.25,
    });

    const purpleGlowMat = new THREE.MeshBasicMaterial({
      color: 0xa855f7,
    });

    // Mic Capsule Grille
    const grilleGeo = new THREE.SphereGeometry(0.7, 32, 24);
    const grilleMesh = new THREE.Mesh(grilleGeo, chromeMat);
    grilleMesh.scale.set(1, 1.25, 1);
    grilleMesh.position.y = 1.2;
    micGroup.add(grilleMesh);

    // Mic Grille Ribs
    for (let i = -2; i <= 2; i++) {
      const ringGeo = new THREE.TorusGeometry(0.71, 0.02, 16, 64);
      const ringMesh = new THREE.Mesh(ringGeo, darkMetalMat);
      ringMesh.rotation.x = Math.PI / 2;
      ringMesh.position.y = 1.2 + i * 0.18;
      micGroup.add(ringMesh);
    }

    // Glowing Purple Ring
    const accentGeo = new THREE.TorusGeometry(0.65, 0.035, 16, 64);
    const accentMesh = new THREE.Mesh(accentGeo, purpleGlowMat);
    accentMesh.rotation.x = Math.PI / 2;
    accentMesh.position.y = 0.45;
    micGroup.add(accentMesh);

    // Mic Body Handle
    const bodyGeo = new THREE.CylinderGeometry(0.5, 0.38, 1.5, 32);
    const bodyMesh = new THREE.Mesh(bodyGeo, darkMetalMat);
    bodyMesh.position.y = -0.3;
    micGroup.add(bodyMesh);

    // Mic Shockmount Outer Ring
    const shockGeo = new THREE.TorusGeometry(1.15, 0.04, 16, 64);
    const shockMesh = new THREE.Mesh(shockGeo, chromeMat);
    shockMesh.position.y = 0.2;
    micGroup.add(shockMesh);

    // Shockmount Elastic Connectors
    for (let i = 0; i < 4; i++) {
      const angle = (i * Math.PI) / 2;
      const strGeo = new THREE.CylinderGeometry(0.015, 0.015, 0.55, 8);
      const strMesh = new THREE.Mesh(strGeo, chromeMat);
      strMesh.position.set(Math.cos(angle) * 0.8, 0.2, Math.sin(angle) * 0.8);
      strMesh.rotation.z = Math.PI / 2;
      strMesh.rotation.y = angle;
      micGroup.add(strMesh);
    }

    // Mic Stand Rod
    const rodGeo = new THREE.CylinderGeometry(0.1, 0.1, 2.5, 24);
    const rodMesh = new THREE.Mesh(rodGeo, darkMetalMat);
    rodMesh.position.y = -2.3;
    micGroup.add(rodMesh);

    stageRig.add(micGroup);
    micGroup.position.set(0, -0.2, 0);

    // -------------------------------------------------------------
    // 3. Neon Orbit Rings (Purple & Electric Blue)
    // -------------------------------------------------------------
    const orbitGroup = new THREE.Group();

    const purpleRingMat = new THREE.MeshStandardMaterial({
      color: 0xa855f7,
      emissive: 0x9333ea,
      emissiveIntensity: 0.4,
      metalness: 0.9,
      roughness: 0.2,
      side: THREE.DoubleSide,
    });

    const blueRingMat = new THREE.MeshStandardMaterial({
      color: 0x3b82f6,
      emissive: 0x2563eb,
      emissiveIntensity: 0.4,
      metalness: 0.9,
      roughness: 0.2,
      side: THREE.DoubleSide,
    });

    const ring1 = new THREE.Mesh(new THREE.RingGeometry(2.3, 2.38, 64), purpleRingMat);
    ring1.rotation.x = Math.PI / 2.2;
    orbitGroup.add(ring1);

    const ring2 = new THREE.Mesh(new THREE.RingGeometry(3.1, 3.18, 64), blueRingMat);
    ring2.rotation.x = Math.PI / 2.7;
    ring2.rotation.y = Math.PI / 4;
    orbitGroup.add(ring2);

    stageRig.add(orbitGroup);

    // -------------------------------------------------------------
    // 4. Circular Audio Wave Visualizer Bars
    // -------------------------------------------------------------
    const visualizerBars: THREE.Mesh[] = [];
    const barCount = 48;
    const visualizerRadius = 2.0;

    const barMaterial = new THREE.MeshStandardMaterial({
      color: 0x60a5fa,
      emissive: 0x3b82f6,
      emissiveIntensity: 0.8,
      metalness: 0.8,
      roughness: 0.2,
    });

    for (let i = 0; i < barCount; i++) {
      const angle = (i / barCount) * Math.PI * 2;
      const barGeo = new THREE.BoxGeometry(0.04, 0.55, 0.04);
      const bar = new THREE.Mesh(barGeo, barMaterial);
      bar.position.set(
        Math.cos(angle) * visualizerRadius,
        0,
        Math.sin(angle) * visualizerRadius
      );
      bar.rotation.y = -angle;
      stageRig.add(bar);
      visualizerBars.push(bar);
    }

    // -------------------------------------------------------------
    // 5. Floating Stage Stardust Particles
    // -------------------------------------------------------------
    const particleCount = 800;
    const particleGeo = new THREE.BufferGeometry();
    const positions = new Float32Array(particleCount * 3);

    for (let i = 0; i < particleCount; i++) {
      positions[i * 3] = (Math.random() - 0.5) * 16;
      positions[i * 3 + 1] = (Math.random() - 0.5) * 12;
      positions[i * 3 + 2] = (Math.random() - 0.5) * 12;
    }

    particleGeo.setAttribute("position", new THREE.BufferAttribute(positions, 3));

    const particleMat = new THREE.PointsMaterial({
      color: 0xa5b4fc,
      size: 0.038,
      transparent: true,
      opacity: 0.65,
      blending: THREE.AdditiveBlending,
    });

    const particles = new THREE.Points(particleGeo, particleMat);
    scene.add(particles);

    // -------------------------------------------------------------
    // 6. Lighting (Deep Purple & Blue Stage Neons)
    // -------------------------------------------------------------
    const ambientLight = new THREE.AmbientLight(0x0c0f24, 3.0);
    scene.add(ambientLight);

    const purpleSpot = new THREE.SpotLight(0xa855f7, 18, 25, Math.PI / 4, 0.5);
    purpleSpot.position.set(5, 6, 4);
    scene.add(purpleSpot);

    const blueSpot = new THREE.SpotLight(0x3b82f6, 18, 25, Math.PI / 4, 0.5);
    blueSpot.position.set(-5, 5, 5);
    scene.add(blueSpot);

    const cyanRim = new THREE.PointLight(0x38bdf8, 7, 15);
    cyanRim.position.set(0, -2, -3);
    scene.add(cyanRim);

    // -------------------------------------------------------------
    // 7. Interactive Cursor Parallax & Render Loop
    // -------------------------------------------------------------
    let mouseX = 0;
    let mouseY = 0;
    let targetX = 0;
    let targetY = 0;

    const onMouseMove = (event: MouseEvent) => {
      const halfW = window.innerWidth / 2;
      const halfH = window.innerHeight / 2;
      targetX = (event.clientX - halfW) / halfW;
      targetY = (event.clientY - halfH) / halfH;
    };

    window.addEventListener("mousemove", onMouseMove);

    let animationFrameId: number;
    const startTime = performance.now();

    const animate = () => {
      animationFrameId = requestAnimationFrame(animate);
      const elapsed = (performance.now() - startTime) * 0.001;

      // Mouse lerp
      mouseX += (targetX - mouseX) * 0.05;
      mouseY += (targetY - mouseY) * 0.05;

      // Stage rig rotation & float
      stageRig.rotation.y = elapsed * 0.22 + mouseX * 0.5;
      stageRig.rotation.x = Math.sin(elapsed * 0.5) * 0.05 - mouseY * 0.3;
      stageRig.position.y = Math.sin(elapsed * 1.1) * 0.12;

      // EchoSphere pulsating wireframe rotation
      echoSphereMesh.rotation.y = elapsed * 0.35;
      echoSphereMesh.rotation.x = elapsed * 0.2;
      const sphereScale = 1.0 + Math.sin(elapsed * 2.5) * 0.06;
      echoSphereMesh.scale.set(sphereScale, sphereScale, sphereScale);

      // Rings rotation
      ring1.rotation.z = elapsed * 0.35;
      ring2.rotation.z = -elapsed * 0.25;

      // Visualizer bars pulsation
      visualizerBars.forEach((bar, index) => {
        const freq = Math.sin(elapsed * 4 + index * 0.4) * 0.5 + 0.5;
        const beat = Math.sin(elapsed * 8) > 0.8 ? 0.3 : 0;
        const scaleY = 0.35 + freq * 1.5 + beat;
        bar.scale.set(1, scaleY, 1);
        bar.position.y = (scaleY * 0.55) / 2 - 0.3;
      });

      // Stardust drift
      particles.rotation.y = elapsed * 0.02;
      particles.rotation.x = elapsed * 0.015;

      renderer.render(scene, camera);
    };

    animate();

    // Resize handler
    const onResize = () => {
      if (!container) return;
      camera.aspect = container.clientWidth / container.clientHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(container.clientWidth, container.clientHeight);
    };

    window.addEventListener("resize", onResize);

    return () => {
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("resize", onResize);
      cancelAnimationFrame(animationFrameId);
      renderer.dispose();
      if (container && renderer.domElement) {
        container.removeChild(renderer.domElement);
      }
    };
  }, []);

  return (
    <div
      ref={containerRef}
      className="absolute inset-0 w-full h-full pointer-events-none select-none z-0 overflow-hidden"
    />
  );
}
