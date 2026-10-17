"use client";

import { useEffect, useRef } from "react";
import * as THREE from "three";

interface ConcertCanvas3DProps {
  isLoading?: boolean;
  loadingProgress?: number;
}

export default function ConcertCanvas3D({
  isLoading = false,
  loadingProgress = 0,
}: ConcertCanvas3DProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const isLoadingRef = useRef(isLoading);
  const loadingProgressRef = useRef(loadingProgress);

  // Sync state into refs for 60fps render loop without scene recreation
  useEffect(() => {
    isLoadingRef.current = isLoading;
  }, [isLoading]);

  useEffect(() => {
    loadingProgressRef.current = loadingProgress;
  }, [loadingProgress]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    // Scene & Fog
    const scene = new THREE.Scene();
    scene.fog = new THREE.FogExp2(0x060714, 0.038);

    // Camera (Starts closer during loading, smoothly glides back for hero)
    const camera = new THREE.PerspectiveCamera(
      45,
      container.clientWidth / container.clientHeight,
      0.1,
      100
    );
    camera.position.set(0, 0.2, 5.2);

    // WebGL Renderer
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(container.clientWidth, container.clientHeight);
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.3;
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
      opacity: 0.38,
    });
    const echoSphereMesh = new THREE.Mesh(sphereGeo, sphereWireMat);
    sphereGroup.add(echoSphereMesh);

    // Inner glowing core sphere
    const coreGeo = new THREE.SphereGeometry(1.1, 32, 32);
    const coreMat = new THREE.MeshStandardMaterial({
      color: 0x3b82f6,
      emissive: 0x1d4ed8,
      emissiveIntensity: 0.85,
      roughness: 0.18,
      metalness: 0.9,
      transparent: true,
      opacity: 0.3,
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
      emissiveIntensity: 0.5,
      metalness: 0.9,
      roughness: 0.2,
      side: THREE.DoubleSide,
    });

    const blueRingMat = new THREE.MeshStandardMaterial({
      color: 0x3b82f6,
      emissive: 0x2563eb,
      emissiveIntensity: 0.5,
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
    // 4. Stardust Cosmic Particle Cloud
    // -------------------------------------------------------------
    const particleCount = 450;
    const geometry = new THREE.BufferGeometry();
    const positions = new Float32Array(particleCount * 3);
    const colors = new Float32Array(particleCount * 3);

    const color1 = new THREE.Color(0xa855f7); // Purple
    const color2 = new THREE.Color(0x3b82f6); // Blue
    const color3 = new THREE.Color(0x38bdf8); // Sky blue
    const color4 = new THREE.Color(0xc084fc); // Light violet

    const colorChoices = [color1, color2, color3, color4];

    for (let i = 0; i < particleCount; i++) {
      const radius = 2.5 + Math.random() * 6.5;
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.acos(Math.random() * 2 - 1);

      positions[i * 3] = radius * Math.sin(phi) * Math.cos(theta);
      positions[i * 3 + 1] = radius * Math.sin(phi) * Math.sin(theta) * 0.7;
      positions[i * 3 + 2] = radius * Math.cos(phi);

      const chosenColor = colorChoices[Math.floor(Math.random() * colorChoices.length)];
      colors[i * 3] = chosenColor.r;
      colors[i * 3 + 1] = chosenColor.g;
      colors[i * 3 + 2] = chosenColor.b;
    }

    geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute("color", new THREE.BufferAttribute(colors, 3));

    const particleMat = new THREE.PointsMaterial({
      size: 0.05,
      vertexColors: true,
      transparent: true,
      opacity: 0.75,
      blending: THREE.AdditiveBlending,
    });

    const particles = new THREE.Points(geometry, particleMat);
    scene.add(particles);

    // -------------------------------------------------------------
    // 5. Soundstage Audio Wave Visualizer Bars
    // -------------------------------------------------------------
    const visualizerGroup = new THREE.Group();
    const barCount = 28;
    const barRadius = 3.6;
    const visualizerBars: THREE.Mesh[] = [];

    const barMat = new THREE.MeshStandardMaterial({
      color: 0x818cf8,
      emissive: 0x6366f1,
      emissiveIntensity: 0.5,
      metalness: 0.7,
      roughness: 0.3,
    });

    for (let i = 0; i < barCount; i++) {
      const angle = (i / barCount) * Math.PI * 2;
      const barGeo = new THREE.CylinderGeometry(0.04, 0.04, 0.55, 12);
      const bar = new THREE.Mesh(barGeo, barMat);
      bar.position.set(
        Math.cos(angle) * barRadius,
        -1.3,
        Math.sin(angle) * barRadius
      );
      visualizerGroup.add(bar);
      visualizerBars.push(bar);
    }
    stageRig.add(visualizerGroup);

    // -------------------------------------------------------------
    // 6. Stage Spotlights & Dynamic Concert Lasers
    // -------------------------------------------------------------
    const keyLight = new THREE.DirectionalLight(0xffffff, 2.5);
    keyLight.position.set(3, 8, 6);
    scene.add(keyLight);

    const fillLight = new THREE.DirectionalLight(0x818cf8, 1.2);
    fillLight.position.set(-6, -2, -4);
    scene.add(fillLight);

    const purpleSpot = new THREE.SpotLight(0xa855f7, 28, 32, Math.PI / 4, 0.35);
    purpleSpot.position.set(5, 7, 5);
    scene.add(purpleSpot);

    const blueSpot = new THREE.SpotLight(0x38bdf8, 28, 32, Math.PI / 4, 0.35);
    blueSpot.position.set(-5, 7, 5);
    scene.add(blueSpot);

    const pinkSpot = new THREE.SpotLight(0xf43f5e, 22, 28, Math.PI / 4.5, 0.4);
    pinkSpot.position.set(0, 8, 4);
    scene.add(pinkSpot);

    const cyanRim = new THREE.PointLight(0x38bdf8, 10, 18);
    cyanRim.position.set(0, -2, -3);
    scene.add(cyanRim);

    // Laser Beams (Sweeping Arena Lasers)
    const laserGroup = new THREE.Group();
    const laserMatCyan = new THREE.MeshBasicMaterial({
      color: 0x38bdf8,
      transparent: true,
      opacity: 0.45,
    });
    const laserMatPink = new THREE.MeshBasicMaterial({
      color: 0xf43f5e,
      transparent: true,
      opacity: 0.45,
    });

    const laserBeams: THREE.Mesh[] = [];
    for (let i = 0; i < 4; i++) {
      const beamGeo = new THREE.CylinderGeometry(0.015, 0.05, 12, 8);
      const beam = new THREE.Mesh(beamGeo, i % 2 === 0 ? laserMatCyan : laserMatPink);
      beam.position.set((i - 1.5) * 2.2, 3, -1);
      beam.rotation.z = (i - 1.5) * 0.25;
      laserGroup.add(beam);
      laserBeams.push(beam);
    }
    stageRig.add(laserGroup);

    // -------------------------------------------------------------
    // 7. Parallax & Smooth Synchronized Render Loop
    // -------------------------------------------------------------
    let mouseX = 0;
    let mouseY = 0;
    let targetX = 0;
    let targetY = 0;
    let currentScale = 1.0;

    const onMouseMove = (event: MouseEvent) => {
      const halfW = window.innerWidth / 2;
      const halfH = window.innerHeight / 2;
      targetX = (event.clientX - halfW) / halfW;
      targetY = (event.clientY - halfH) / halfH;
    };

    const onTouchMove = (event: TouchEvent) => {
      if (event.touches.length > 0) {
        const touch = event.touches[0];
        const halfW = window.innerWidth / 2;
        const halfH = window.innerHeight / 2;
        targetX = (touch.clientX - halfW) / halfW;
        targetY = (touch.clientY - halfH) / halfH;
      }
    };

    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("touchmove", onTouchMove, { passive: true });

    let animationFrameId: number;
    const startTime = performance.now();

    const animate = () => {
      animationFrameId = requestAnimationFrame(animate);
      const elapsed = (performance.now() - startTime) * 0.001;

      const isLoad = isLoadingRef.current;
      const progress = loadingProgressRef.current;

      const clientW = container.clientWidth || window.innerWidth || 390;
      const clientH = container.clientHeight || window.innerHeight || 844;
      const aspect = clientW / clientH;
      const isMobile = aspect < 0.85 || clientW < 640;
      const isTablet = !isMobile && (aspect < 1.15 || clientW < 1024);

      // Responsive rig scale so the 3D model, rings & visualizers fit with generous margins on phones
      const targetScale = isMobile
        ? (clientW < 400 ? 0.48 : 0.54)
        : isTablet
        ? 0.72
        : 1.0;

      currentScale += (targetScale - currentScale) * 0.05;
      stageRig.scale.set(currentScale, currentScale, currentScale);

      // Mouse lerp
      mouseX += (targetX - mouseX) * 0.05;
      mouseY += (targetY - mouseY) * 0.05;

      // Dynamic Stage Spotlights Sweep (Concert searchlights)
      purpleSpot.position.x = Math.sin(elapsed * 1.4) * 6.5;
      purpleSpot.position.y = 6.5 + Math.cos(elapsed * 0.8) * 1.5;
      blueSpot.position.x = -Math.cos(elapsed * 1.3) * 6.5;
      blueSpot.position.y = 6.5 + Math.sin(elapsed * 0.9) * 1.5;
      pinkSpot.position.x = Math.sin(elapsed * 2.1) * 3.5;

      // Sweeping Laser Beams
      laserBeams.forEach((beam, idx) => {
        const sign = idx % 2 === 0 ? 1 : -1;
        beam.rotation.z = Math.sin(elapsed * 1.8 + idx * 0.8) * 0.35 * sign;
        beam.rotation.x = Math.cos(elapsed * 1.2 + idx * 0.5) * 0.2;
        (beam.material as THREE.MeshBasicMaterial).opacity =
          isLoad ? 0.35 + (progress / 100) * 0.35 : 0.45;
      });

      // Camera Smooth Glide Synchronization (Mobile Optimized):
      // On mobile phones:
      // - Loading: Z: 6.5, Y: 0.16 (centered inside the mobile HUD target reticle)
      // - Hero: Z: 8.6, Y: -0.42 (positions the 3D model in the upper half of the screen, floating above hero details)
      // On desktop:
      // - Loading: Z: 5.15, Y: 0.18
      // - Hero: Z: 7.8, Y: 0.35
      const targetCamZ = isLoad
        ? (isMobile ? 6.5 : 5.15)
        : (isMobile ? 8.6 : 7.8);
      const targetCamY = isLoad
        ? (isMobile ? 0.16 : 0.18)
        : (isMobile ? -0.42 : 0.35);

      camera.position.z += (targetCamZ - camera.position.z) * 0.045;
      camera.position.y += (targetCamY - camera.position.y) * 0.045;

      // Energy multiplier (builds up as loading progresses from 0 to 100%)
      const energy = isLoad ? 1.0 + (progress / 100) * 1.6 : 1.0;

      // Stage rig rotation & float
      const rotSpeed = isLoad ? 0.35 * energy : 0.22;
      stageRig.rotation.y = elapsed * rotSpeed + mouseX * 0.45;
      stageRig.rotation.x = Math.sin(elapsed * 0.6) * 0.05 - mouseY * 0.25;
      stageRig.position.y = Math.sin(elapsed * 1.2) * 0.1;

      // EchoSphere pulsating wireframe rotation
      echoSphereMesh.rotation.y = elapsed * 0.4 * energy;
      echoSphereMesh.rotation.x = elapsed * 0.22 * energy;
      // Pulsate to exact 122 BPM pop beat (12.78 rad/sec)
      const popBeat = Math.sin(elapsed * 12.78) > 0.6 ? 0.08 : 0.0;
      const sphereScale = 1.0 + (isLoad ? 0.04 + (progress / 100) * 0.05 : 0.02) + popBeat;
      echoSphereMesh.scale.set(sphereScale, sphereScale, sphereScale);

      // Core sphere emissive glow boost on the pop kick drum
      coreMat.emissiveIntensity = (isLoad ? 0.95 + (progress / 100) * 0.7 : 0.85) + (popBeat * 2.5);

      // Orbit rings rotation (dynamic gyroscopic spin)
      ring1.rotation.z = elapsed * 0.55 * energy;
      ring2.rotation.z = -elapsed * 0.45 * energy;

      // Visualizer bars pulsation locked to 122 BPM pop beat
      visualizerBars.forEach((bar, index) => {
        const wave = Math.sin(elapsed * 6.39 + index * 0.4) * 0.4 + 0.5;
        const kickImpact = popBeat > 0 ? 0.6 : 0;
        const scaleY = 0.35 + (wave * 1.5 + kickImpact) * (isLoad ? 1.4 : 1.1);
        bar.scale.set(1, scaleY, 1);
        bar.position.y = (scaleY * 0.55) / 2 - 0.3;
      });

      // Stardust drift
      particles.rotation.y = elapsed * 0.025 * energy;
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
      window.removeEventListener("touchmove", onTouchMove);
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
