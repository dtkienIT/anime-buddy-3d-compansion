import * as THREE from "three";
import type { PerformanceStageTheme } from "@anime-buddy/shared";

interface StagePalette {
  deep: number;
  primary: number;
  secondary: number;
  accent: number;
  floor: number;
  mode: number;
}

interface PerformanceStageRuntime {
  theme: PerformanceStageTheme;
  group: THREE.Group;
  screenMaterial: THREE.ShaderMaterial;
  glowMaterials: THREE.MeshBasicMaterial[];
  rings: THREE.Mesh[];
  beams: THREE.Mesh[];
  kineticObjects: THREE.Object3D[];
  spotlights: THREE.SpotLight[];
  particles: THREE.Points;
  particleBasePositions: Float32Array;
  particleSpeed: Float32Array;
  energy: number;
}

const palettes: Record<PerformanceStageTheme, StagePalette> = {
  "neon-cube": {
    deep: 0x060814,
    primary: 0xff0077,
    secondary: 0x00f0ff,
    accent: 0xffe600,
    floor: 0x0f111a,
    mode: 0
  },
  "lantern-festival": {
    deep: 0x110820,
    primary: 0xff4d79,
    secondary: 0xffb800,
    accent: 0x00e5ff,
    floor: 0x1a0f26,
    mode: 1
  },
  "aurora-dawn": {
    deep: 0x051224,
    primary: 0x00ff9d,
    secondary: 0x00d2ff,
    accent: 0xff6b8b,
    floor: 0x0c192c,
    mode: 2
  },
  "wheat-field": {
    deep: 0x180d22,
    primary: 0xff9900,
    secondary: 0xffdc73,
    accent: 0x5cdbb5,
    floor: 0x22132a,
    mode: 3
  },
  "happy-synthwave": {
    deep: 0x0a0416,
    primary: 0x00f5ff,
    secondary: 0xff2a9d,
    accent: 0x9b51e0,
    floor: 0x140a24,
    mode: 4
  }
};

const particleCounts: Record<PerformanceStageTheme, number> = {
  "neon-cube": 96,
  "lantern-festival": 120,
  "aurora-dawn": 144,
  "wheat-field": 110,
  "happy-synthwave": 150
};

export class PerformanceStageController {
  private runtime: PerformanceStageRuntime | null = null;
  private analyser: AnalyserNode | null = null;
  private frequencyData: Uint8Array<ArrayBuffer> | null = null;

  constructor(private readonly scene: THREE.Scene) {}

  show(theme: PerformanceStageTheme): void {
    if (this.runtime?.theme === theme) return;
    this.hide();

    const palette = palettes[theme];
    const group = new THREE.Group();
    group.name = `PerformanceStage:${theme}`;
    group.position.set(0, 0, -0.65);
    group.renderOrder = -3;

    const glowMaterials: THREE.MeshBasicMaterial[] = [];
    const rings: THREE.Mesh[] = [];
    const beams: THREE.Mesh[] = [];
    const kineticObjects: THREE.Object3D[] = [];
    const spotlights: THREE.SpotLight[] = [];

    // 1. Futuristic Curved Holographic Backdrop Screen
    const screenMaterial = this.createScreenMaterial(palette);
    const screen = new THREE.Mesh(new THREE.CylinderGeometry(4.6, 4.6, 4.4, 48, 1, true, -Math.PI * 0.42, Math.PI * 0.84), screenMaterial);
    screen.position.set(0, 2.1, -1.8);
    screen.rotation.y = Math.PI;
    screen.renderOrder = -4;
    group.add(screen);

    // 2. High-Tech Glossy Stage Podium with Concentric LED Rings
    this.addStageDeck(group, palette, rings, glowMaterials);

    // 3. Dynamic Laser Light Rig & Atmospheric Spotlights (Behind idol, non-obstructing)
    this.addLightRig(group, palette, spotlights, beams, glowMaterials);

    // 4. Distinct Thematic Stage Set Designs
    if (theme === "neon-cube") {
      this.addNeonCubeSet(group, palette, kineticObjects, glowMaterials);
    } else if (theme === "lantern-festival") {
      this.addLanternFestivalSet(group, palette, kineticObjects, rings, glowMaterials);
    } else if (theme === "aurora-dawn") {
      this.addAuroraDawnSet(group, palette, kineticObjects, rings, glowMaterials);
    } else if (theme === "happy-synthwave") {
      this.addHappySynthwaveSet(group, palette, kineticObjects, rings, glowMaterials);
    } else {
      this.addWheatFieldSet(group, palette, kineticObjects, rings, glowMaterials);
    }

    // 5. Floating Stardust & Ember Particles
    const particleCount = particleCounts[theme];
    const particleBasePositions = new Float32Array(particleCount * 3);
    const particleSpeed = new Float32Array(particleCount);
    for (let index = 0; index < particleCount; index += 1) {
      const seedA = pseudoRandom(index + palette.mode * 137);
      const seedB = pseudoRandom(index * 7 + palette.mode * 53 + 11);
      const seedC = pseudoRandom(index * 13 + 5);

      const angle = seedA * Math.PI * 2;
      const radius = 0.5 + seedB * 2.8;
      particleBasePositions[index * 3] = Math.cos(angle) * radius;
      particleBasePositions[index * 3 + 1] = 0.25 + seedC * 3.6;
      particleBasePositions[index * 3 + 2] = Math.sin(angle) * radius * 0.75 - 0.4;
      particleSpeed[index] = 0.03 + pseudoRandom(index * 17 + 3) * 0.07;
    }

    const particleGeometry = new THREE.BufferGeometry();
    particleGeometry.setAttribute("position", new THREE.BufferAttribute(particleBasePositions.slice(), 3));
    const particles = new THREE.Points(
      particleGeometry,
      new THREE.PointsMaterial({
        color: palette.secondary,
        size: theme === "lantern-festival" ? 0.038 : theme === "wheat-field" ? 0.032 : 0.028,
        transparent: true,
        opacity: 0.85,
        depthWrite: false,
        blending: THREE.AdditiveBlending
      })
    );
    particles.renderOrder = -1;
    group.add(particles);

    this.scene.add(group);
    this.runtime = {
      theme,
      group,
      screenMaterial,
      glowMaterials,
      rings,
      beams,
      kineticObjects,
      spotlights,
      particles,
      particleBasePositions,
      particleSpeed,
      energy: 0
    };
  }

  setAnalyser(analyser: AnalyserNode | null): void {
    this.analyser = analyser;
    this.frequencyData = analyser ? new Uint8Array(new ArrayBuffer(analyser.frequencyBinCount)) : null;
  }

  update(time: number, reducedMotion: boolean): void {
    const stage = this.runtime;
    if (!stage) return;

    const energy = this.readEnergy(stage.energy);
    stage.energy = THREE.MathUtils.lerp(stage.energy, energy, reducedMotion ? 0.08 : 0.24);
    const motionEnergy = reducedMotion ? 0.16 : stage.energy;
    const pulse = reducedMotion ? 0.35 : 0.45 + Math.sin(time * 3.6) * 0.12 + motionEnergy * 0.65;

    stage.screenMaterial.uniforms.uTime.value = reducedMotion ? 0 : time;
    stage.screenMaterial.uniforms.uEnergy.value = pulse;

    stage.rings.forEach((ring, index) => {
      if (!reducedMotion) {
        ring.rotation.z = time * (0.06 + index * 0.02) * (index % 2 === 0 ? 1 : -1);
        const ringPulse = 1 + Math.sin(time * 2.2 + index * 0.8) * 0.015 + motionEnergy * 0.035;
        ring.scale.set(ringPulse, ringPulse, 1);
      }
      const material = ring.material as THREE.MeshBasicMaterial;
      material.opacity = Math.min(0.96, 0.4 + pulse * 0.4 + index * 0.03);
    });

    stage.kineticObjects.forEach((object, index) => {
      if (reducedMotion) return;
      const phase = time * (0.45 + index * 0.025) + index * 0.75;
      object.position.y += Math.sin(phase) * 0.0016;
      object.rotation.y += (0.002 + motionEnergy * 0.004) * (index % 2 === 0 ? 1 : -1);
    });

    stage.spotlights.forEach((spotlight, index) => {
      const phase = time * (0.6 + index * 0.08) + index * 1.5;
      if (!reducedMotion) {
        spotlight.position.x = (index - 1.5) * 1.5 + Math.sin(phase) * 0.45;
        spotlight.target.position.x = (index - 1.5) * 0.4 + Math.sin(phase * 0.7) * 0.5;
      }
      spotlight.intensity = 2.0 + pulse * 2.5 + index * 0.1;
    });

    stage.beams.forEach((beam, index) => {
      if (!reducedMotion) {
        const sweep = Math.sin(time * 0.7 + index * 1.2) * 0.22;
        beam.rotation.z = (index - 2.5) * 0.14 + sweep;
      }
      (beam.material as THREE.MeshBasicMaterial).opacity = 0.05 + pulse * 0.08;
    });

    stage.glowMaterials.forEach((material, index) => {
      material.opacity = Math.min(0.96, 0.45 + pulse * 0.4 + (index % 3) * 0.04);
    });

    if (!reducedMotion) this.updateParticles(stage, time);
  }

  hide(): void {
    const stage = this.runtime;
    this.runtime = null;
    this.setAnalyser(null);
    if (!stage) return;
    this.scene.remove(stage.group);
    stage.group.traverse((node: THREE.Object3D) => {
      const mesh = node as THREE.Mesh;
      mesh.geometry?.dispose?.();
      disposeMaterial(mesh.material);
    });
  }

  dispose(): void {
    this.hide();
  }

  private readEnergy(fallback: number): number {
    if (!this.analyser || !this.frequencyData) {
      return fallback * 0.9 + 0.08;
    }
    this.analyser.getByteFrequencyData(this.frequencyData);
    const limit = Math.max(1, Math.floor(this.frequencyData.length * 0.42));
    let total = 0;
    for (let index = 0; index < limit; index += 1) total += this.frequencyData[index];
    return THREE.MathUtils.clamp(total / limit / 190, 0.04, 1);
  }

  private createScreenMaterial(palette: StagePalette): THREE.ShaderMaterial {
    return new THREE.ShaderMaterial({
      uniforms: {
        uTime: { value: 0 },
        uEnergy: { value: 0 },
        uDeep: { value: new THREE.Color(palette.deep) },
        uPrimary: { value: new THREE.Color(palette.primary) },
        uSecondary: { value: new THREE.Color(palette.secondary) },
        uAccent: { value: new THREE.Color(palette.accent) },
        uMode: { value: palette.mode }
      },
      vertexShader: `
        varying vec2 vUv;
        void main() {
          vUv = uv;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: `
        uniform float uTime;
        uniform float uEnergy;
        uniform float uMode;
        uniform vec3 uDeep;
        uniform vec3 uPrimary;
        uniform vec3 uSecondary;
        uniform vec3 uAccent;
        varying vec2 vUv;

        float line(float value, float width) {
          return smoothstep(width, 0.0, abs(fract(value) - 0.5));
        }

        void main() {
          vec2 p = vUv - 0.5;
          float vignette = smoothstep(0.85, 0.2, length(p * vec2(0.8, 1.0)));
          vec3 color = uDeep;

          if (uMode < 0.5) {
            // Neon EDM: Digital equalizer bars + glowing neon laser matrix
            float barIndex = floor(vUv.x * 24.0);
            float barNoise = 0.5 + 0.5 * sin(barIndex * 1.7 + uTime * 3.5);
            float barHeight = (0.2 + uEnergy * 0.6) * barNoise;
            float inBar = step(abs(vUv.y - 0.5), barHeight * 0.5) * step(0.12, fract(vUv.x * 24.0));
            float diagonal = 0.5 + 0.5 * sin((p.x * 8.0 + p.y * 5.0) - uTime * 2.5);
            color = mix(uDeep, uPrimary, diagonal * 0.4);
            color += mix(uSecondary, uAccent, vUv.y) * inBar * (0.65 + uEnergy * 0.5);
            float grid = max(line(vUv.x * 12.0 + uTime * 0.1, 0.02), line(vUv.y * 8.0, 0.02));
            color += uSecondary * grid * (0.2 + uEnergy * 0.3);
          } else if (uMode < 1.5) {
            // Lantern Festival: Luminous lotus moon & flowing starlight silk
            float radius = length(p);
            float moon = smoothstep(0.35, 0.33, radius) * smoothstep(0.18, 0.20, radius);
            float silk = 0.5 + 0.5 * sin(p.x * 6.0 + sin(p.y * 5.0 + uTime * 0.6) - uTime * 0.8);
            color = mix(uDeep, uPrimary, silk * 0.45);
            color += uSecondary * moon * (0.6 + uEnergy * 0.4);
            color += uAccent * smoothstep(0.04, 0.0, abs(p.y + 0.25 + sin(p.x * 4.0 + uTime) * 0.04)) * 0.35;
          } else if (uMode < 2.5) {
            // Aurora Dawn: Dynamic northern lights curtains & crystal solar glow
            float auroraA = smoothstep(0.12, 0.0, abs(p.y - 0.15 * sin(p.x * 4.5 + uTime * 0.6)));
            float auroraB = smoothstep(0.08, 0.0, abs(p.y + 0.12 - 0.1 * sin(p.x * 6.0 - uTime * 0.45)));
            float sun = exp(-5.5 * length(p + vec2(0.0, 0.15)));
            color = mix(uDeep, uPrimary, sun * 0.6);
            color += uSecondary * auroraA * (0.55 + uEnergy * 0.45);
            color += uAccent * auroraB * (0.45 + uEnergy * 0.35);
          } else if (uMode < 3.5) {
            // Golden Wheat: Sunset glow & gentle warm ambient sweep
            float horizon = smoothstep(0.65, -0.2, p.y);
            float sun = smoothstep(0.32, 0.30, length(p - vec2(0.0, 0.12)));
            float sweep = 0.5 + 0.5 * sin(p.x * 7.0 + p.y * 4.0 - uTime * 0.8);
            color = mix(uDeep, uPrimary, horizon * 0.45 + sweep * 0.15);
            color += uSecondary * sun * (0.65 + uEnergy * 0.35);
            float sparkles = line(vUv.y * 14.0 + p.x * 2.0 + uTime * 0.1, 0.02);
            color += uAccent * sparkles * (0.25 + horizon * 0.3);
          } else {
            // Synthwave: Retro grid horizon + neon wireframe portal
            float horizon = smoothstep(0.65, -0.25, p.y);
            float gridX = line(vUv.x * 20.0 + uTime * 0.15, 0.025);
            float gridY = line(vUv.y * 12.0 - uTime * 0.35, 0.025);
            float sun = smoothstep(0.35, 0.33, length(p - vec2(0.0, 0.15)));
            float sunBars = step(0.3, fract(p.y * 22.0));
            color = mix(uDeep, uPrimary, 0.2 + horizon * 0.3);
            color += uSecondary * (gridX + gridY) * (0.25 + uEnergy * 0.5);
            color += mix(uSecondary, uAccent, p.y + 0.5) * sun * sunBars * (0.7 + uEnergy * 0.4);
          }

          gl_FragColor = vec4(color * (0.7 + vignette * 0.45), 0.98);
        }
      `,
      transparent: true,
      depthWrite: false,
      depthTest: true,
      side: THREE.BackSide
    });
  }

  private addStageDeck(
    group: THREE.Group,
    palette: StagePalette,
    rings: THREE.Mesh[],
    glowMaterials: THREE.MeshBasicMaterial[]
  ): void {
    // 1. Tier 1 - Outer Titanium Base Platform with Neon Bevel
    const basePlatform = new THREE.Mesh(
      new THREE.CylinderGeometry(2.85, 3.1, 0.14, 64),
      new THREE.MeshStandardMaterial({
        color: palette.floor,
        emissive: palette.deep,
        emissiveIntensity: 0.8,
        metalness: 0.92,
        roughness: 0.18
      })
    );
    basePlatform.position.set(0, 0.06, -0.1);
    basePlatform.receiveShadow = true;
    group.add(basePlatform);

    // 2. Tier 2 - Main Glossy Center Stage Platform
    const centerPlatform = new THREE.Mesh(
      new THREE.CylinderGeometry(2.55, 2.55, 0.05, 64),
      new THREE.MeshStandardMaterial({
        color: palette.floor,
        emissive: palette.primary,
        emissiveIntensity: 0.18,
        metalness: 0.88,
        roughness: 0.14
      })
    );
    centerPlatform.position.set(0, 0.155, -0.1);
    centerPlatform.receiveShadow = true;
    group.add(centerPlatform);

    // 3. Glowing Concentric LED Floor Rings
    const ringRadii = [2.46, 1.95, 1.35, 0.75];
    const ringColors = [palette.primary, palette.secondary, palette.accent, palette.primary];
    ringRadii.forEach((radius, index) => {
      const material = new THREE.MeshBasicMaterial({
        color: ringColors[index],
        transparent: true,
        opacity: 0.75,
        depthWrite: false,
        blending: THREE.AdditiveBlending
      });
      const ring = new THREE.Mesh(new THREE.TorusGeometry(radius, 0.016, 8, 72), material);
      ring.position.set(0, 0.185 + index * 0.002, -0.1);
      ring.rotation.x = Math.PI / 2;
      group.add(ring);
      rings.push(ring);
      glowMaterials.push(material);
    });

    // 4. Radial Glowing Neon Spokes on the Stage Floor
    const spokeCount = 12;
    for (let i = 0; i < spokeCount; i++) {
      const angle = (i / spokeCount) * Math.PI * 2;
      const spokeMaterial = new THREE.MeshBasicMaterial({
        color: i % 2 === 0 ? palette.primary : palette.secondary,
        transparent: true,
        opacity: 0.45,
        depthWrite: false,
        blending: THREE.AdditiveBlending
      });
      const spoke = new THREE.Mesh(new THREE.BoxGeometry(0.012, 0.004, 1.1), spokeMaterial);
      const distance = 1.9;
      spoke.position.set(Math.cos(angle) * distance, 0.184, -0.1 + Math.sin(angle) * distance);
      spoke.rotation.y = -angle;
      group.add(spoke);
      glowMaterials.push(spokeMaterial);
    }

    // 5. Sleek Front Runway Strip
    const runway = new THREE.Mesh(
      new THREE.BoxGeometry(0.88, 0.04, 2.2),
      new THREE.MeshStandardMaterial({
        color: palette.floor,
        emissive: palette.secondary,
        emissiveIntensity: 0.35,
        metalness: 0.85,
        roughness: 0.18
      })
    );
    runway.position.set(0, 0.145, 1.2);
    runway.receiveShadow = true;
    group.add(runway);

    // Glowing Runway Edge Strips
    for (const x of [-0.42, 0.42]) {
      const edgeMaterial = new THREE.MeshBasicMaterial({
        color: palette.accent,
        transparent: true,
        opacity: 0.8,
        depthWrite: false,
        blending: THREE.AdditiveBlending
      });
      const edge = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.012, 2.15), edgeMaterial);
      edge.position.set(x, 0.17, 1.2);
      group.add(edge);
      glowMaterials.push(edgeMaterial);
    }
  }

  private addLightRig(
    group: THREE.Group,
    palette: StagePalette,
    spotlights: THREE.SpotLight[],
    beams: THREE.Mesh[],
    glowMaterials: THREE.MeshBasicMaterial[]
  ): void {
    // 1. Floating Overhead Halo Arch (Positioned behind the stage at z = -1.45, never blocks character)
    const haloMaterial = new THREE.MeshStandardMaterial({
      color: 0x1a1d26,
      emissive: palette.primary,
      emissiveIntensity: 0.5,
      metalness: 0.95,
      roughness: 0.15
    });
    const haloArch = new THREE.Mesh(new THREE.TorusGeometry(3.2, 0.045, 12, 64, Math.PI * 0.9), haloMaterial);
    haloArch.position.set(0, 2.2, -1.45);
    haloArch.rotation.z = Math.PI * 0.05;
    group.add(haloArch);

    // 2. Upward Laser Fan Beams (Positioned behind the idol at z = -1.5, fanning outward)
    const beamColors = [palette.primary, palette.secondary, palette.accent, palette.primary, palette.secondary, palette.accent];
    for (let index = 0; index < 6; index += 1) {
      const beamMaterial = new THREE.MeshBasicMaterial({
        color: beamColors[index],
        transparent: true,
        opacity: 0.12,
        depthWrite: false,
        side: THREE.DoubleSide,
        blending: THREE.AdditiveBlending
      });
      const beam = new THREE.Mesh(new THREE.ConeGeometry(0.18, 4.8, 18, 1, true), beamMaterial);
      const spreadX = (index - 2.5) * 0.85;
      beam.position.set(spreadX, 2.4, -1.5);
      beam.rotation.x = Math.PI;
      beam.rotation.z = (index - 2.5) * 0.14;
      group.add(beam);
      beams.push(beam);
      glowMaterials.push(beamMaterial);
    }

    // 3. Stage Lighting Spotlights (Cast soft focused light without blocking view)
    for (let index = 0; index < 4; index += 1) {
      const spotlight = new THREE.SpotLight(beamColors[index], 2.8, 7.5, Math.PI / 8, 0.65, 1.2);
      spotlight.position.set((index - 1.5) * 1.8, 3.8, -0.4);
      spotlight.castShadow = index === 1 || index === 2;
      spotlight.shadow.mapSize.set(512, 512);

      const target = new THREE.Object3D();
      target.position.set((index - 1.5) * 0.4, 0.2, -0.1);
      group.add(target);
      spotlight.target = target;
      group.add(spotlight);
      spotlights.push(spotlight);
    }
  }

  private addNeonCubeSet(
    group: THREE.Group,
    palette: StagePalette,
    kineticObjects: THREE.Object3D[],
    glowMaterials: THREE.MeshBasicMaterial[]
  ): void {
    // Floating Cybernetic Equalizer Cubes (Arranged behind character at z = -1.1 to -1.4)
    const cubeLayout = [
      [-2.1, 2.6, -1.2, 0.55],
      [-1.1, 3.0, -1.3, 0.45],
      [0.0, 3.3, -1.4, 0.65],
      [1.1, 3.0, -1.3, 0.45],
      [2.1, 2.6, -1.2, 0.55]
    ] as const;

    cubeLayout.forEach(([x, y, z, size], index) => {
      const edgeMaterial = new THREE.MeshBasicMaterial({
        color: index % 2 === 0 ? palette.primary : palette.secondary,
        transparent: true,
        opacity: 0.85,
        depthWrite: false,
        blending: THREE.AdditiveBlending
      });
      const cube = new THREE.LineSegments(
        new THREE.EdgesGeometry(new THREE.BoxGeometry(size, size, size)),
        edgeMaterial
      );
      cube.position.set(x, y, z);
      cube.rotation.set(0.2 * (index % 2), index * 0.3, 0.15 * (index - 2));
      group.add(cube);
      kineticObjects.push(cube);
      glowMaterials.push(edgeMaterial);
    });

    // Vertical Neon Cyber Bars on Sides
    for (const x of [-2.6, -2.2, 2.2, 2.6]) {
      const barMaterial = new THREE.MeshBasicMaterial({
        color: x < 0 ? palette.primary : palette.secondary,
        transparent: true,
        opacity: 0.75,
        depthWrite: false,
        blending: THREE.AdditiveBlending
      });
      const bar = new THREE.Mesh(new THREE.BoxGeometry(0.045, 2.2, 0.045), barMaterial);
      bar.position.set(x, 1.8 + Math.abs(x) * 0.06, -1.1);
      group.add(bar);
      glowMaterials.push(barMaterial);
    }
  }

  private addLanternFestivalSet(
    group: THREE.Group,
    palette: StagePalette,
    kineticObjects: THREE.Object3D[],
    rings: THREE.Mesh[],
    glowMaterials: THREE.MeshBasicMaterial[]
  ): void {
    // Elegant Moon Gate Arch
    const moonMaterial = new THREE.MeshBasicMaterial({
      color: palette.secondary,
      transparent: true,
      opacity: 0.65,
      depthWrite: false,
      blending: THREE.AdditiveBlending
    });
    const moonGate = new THREE.Mesh(new THREE.TorusGeometry(1.6, 0.045, 12, 96), moonMaterial);
    moonGate.position.set(0, 1.85, -1.2);
    group.add(moonGate);
    rings.push(moonGate);
    glowMaterials.push(moonMaterial);

    // Floating Illuminated Festive Lanterns
    const lanternPositions = [
      [-2.3, 2.7, -1.0, 0.65],
      [-1.5, 3.1, -1.2, 0.52],
      [1.5, 3.1, -1.2, 0.52],
      [2.3, 2.7, -1.0, 0.65],
      [-2.5, 1.8, -0.8, 0.45],
      [2.5, 1.8, -0.8, 0.45]
    ] as const;

    lanternPositions.forEach(([x, y, z, scale], index) => {
      const lantern = new THREE.Group();
      const material = new THREE.MeshStandardMaterial({
        color: index % 2 === 0 ? palette.primary : palette.secondary,
        emissive: index % 2 === 0 ? palette.primary : palette.secondary,
        emissiveIntensity: 1.6,
        transparent: true,
        opacity: 0.9,
        roughness: 0.4
      });
      const body = new THREE.Mesh(new THREE.SphereGeometry(0.18 * scale, 20, 16), material);
      body.scale.y = 1.3;
      const capMaterial = new THREE.MeshBasicMaterial({ color: palette.accent });
      const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.08 * scale, 0.08 * scale, 0.035, 18), capMaterial);
      cap.position.y = 0.2 * scale;
      const tassel = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.008, 0.22 * scale, 8), capMaterial);
      tassel.position.y = -0.24 * scale;
      lantern.add(body, cap, tassel);
      lantern.position.set(x, y, z);
      group.add(lantern);
      kineticObjects.push(lantern);
    });
  }

  private addAuroraDawnSet(
    group: THREE.Group,
    palette: StagePalette,
    kineticObjects: THREE.Object3D[],
    rings: THREE.Mesh[],
    glowMaterials: THREE.MeshBasicMaterial[]
  ): void {
    // Ethereal Solar Core Halo
    const sunMaterial = new THREE.MeshBasicMaterial({
      color: palette.secondary,
      transparent: true,
      opacity: 0.7,
      depthWrite: false,
      blending: THREE.AdditiveBlending
    });
    const sun = new THREE.Mesh(new THREE.CircleGeometry(0.75, 64), sunMaterial);
    sun.position.set(0, 1.85, -1.3);
    group.add(sun);
    kineticObjects.push(sun);
    glowMaterials.push(sunMaterial);

    // Dynamic Concentric Aurora Halos
    [1.05, 1.35, 1.65].forEach((radius, index) => {
      const material = new THREE.MeshBasicMaterial({
        color: [palette.accent, palette.primary, palette.secondary][index],
        transparent: true,
        opacity: 0.5 - index * 0.08,
        depthWrite: false,
        blending: THREE.AdditiveBlending
      });
      const ring = new THREE.Mesh(new THREE.TorusGeometry(radius, 0.02, 8, 72), material);
      ring.position.set(0, 1.85, -1.25 + index * 0.02);
      group.add(ring);
      rings.push(ring);
      glowMaterials.push(material);
    });

    // Floating Prism Ribbons
    for (let index = 0; index < 5; index += 1) {
      const material = new THREE.MeshBasicMaterial({
        color: index % 2 === 0 ? palette.accent : palette.primary,
        transparent: true,
        opacity: 0.35,
        depthWrite: false,
        side: THREE.DoubleSide,
        blending: THREE.AdditiveBlending
      });
      const ribbon = new THREE.Mesh(new THREE.PlaneGeometry(1.6, 0.08, 8, 1), material);
      ribbon.position.set((index - 2) * 1.15, 2.6 - Math.abs(index - 2) * 0.18, -1.1);
      ribbon.rotation.z = (index - 2) * 0.12;
      group.add(ribbon);
      kineticObjects.push(ribbon);
      glowMaterials.push(material);
    }
  }

  private addWheatFieldSet(
    group: THREE.Group,
    palette: StagePalette,
    kineticObjects: THREE.Object3D[],
    rings: THREE.Mesh[],
    glowMaterials: THREE.MeshBasicMaterial[]
  ): void {
    // Golden Sunset Halo
    const sunMaterial = new THREE.MeshBasicMaterial({
      color: palette.secondary,
      transparent: true,
      opacity: 0.72,
      depthWrite: false,
      blending: THREE.AdditiveBlending
    });
    const sun = new THREE.Mesh(new THREE.CircleGeometry(0.72, 48), sunMaterial);
    sun.position.set(0, 1.9, -1.3);
    group.add(sun);
    kineticObjects.push(sun);
    glowMaterials.push(sunMaterial);

    const archMaterial = new THREE.MeshBasicMaterial({
      color: palette.primary,
      transparent: true,
      opacity: 0.75,
      depthWrite: false,
      blending: THREE.AdditiveBlending
    });
    const arch = new THREE.Mesh(new THREE.TorusGeometry(1.85, 0.04, 10, 96, Math.PI), archMaterial);
    arch.position.set(0, 1.7, -1.25);
    arch.rotation.z = Math.PI;
    group.add(arch);
    rings.push(arch);
    glowMaterials.push(archMaterial);

    // Glowing Golden Harvest Lights
    const stalkMaterial = new THREE.MeshStandardMaterial({
      color: palette.accent,
      emissive: palette.accent,
      emissiveIntensity: 0.6,
      roughness: 0.5
    });
    const headMaterial = new THREE.MeshBasicMaterial({
      color: palette.secondary,
      transparent: true,
      opacity: 0.88,
      depthWrite: false,
      blending: THREE.AdditiveBlending
    });
    for (let index = 0; index < 9; index += 1) {
      const stalk = new THREE.Group();
      const x = (index - 4) * 0.52;
      const height = 0.75 + (index % 3) * 0.15;
      const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.01, 0.015, height, 8), stalkMaterial);
      stem.position.y = 0.45 + height * 0.5;
      const head = new THREE.Mesh(new THREE.IcosahedronGeometry(0.08, 0), headMaterial);
      head.position.set(0, 0.45 + height, 0);
      stalk.add(stem, head);
      stalk.position.set(x, 0.1, -1.1 + (index % 2) * 0.08);
      group.add(stalk);
      kineticObjects.push(stalk);
      glowMaterials.push(headMaterial);
    }
  }

  private addHappySynthwaveSet(
    group: THREE.Group,
    palette: StagePalette,
    kineticObjects: THREE.Object3D[],
    rings: THREE.Mesh[],
    glowMaterials: THREE.MeshBasicMaterial[]
  ): void {
    // Futuristic Synthwave Neon Stargate Portal Rings (Pushed back at z = -1.2 to -1.8)
    const chromeMaterial = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      emissive: palette.primary,
      emissiveIntensity: 0.5,
      metalness: 0.98,
      roughness: 0.08
    });
    const gateRings = [
      { radius: 2.3, z: -1.2 },
      { radius: 2.05, z: -1.4 },
      { radius: 1.8, z: -1.6 },
      { radius: 1.55, z: -1.8 }
    ] as const;
    gateRings.forEach(({ radius, z }, index) => {
      const ring = new THREE.Mesh(new THREE.TorusGeometry(radius, 0.038, 12, 72), chromeMaterial.clone());
      ring.position.set(0, 1.95, z);
      ring.rotation.z = index % 2 === 0 ? 0.08 : -0.08;
      group.add(ring);
      rings.push(ring);
    });

    // Glowing Synthwave Equalizer Towers on Sides
    const barGeometry = new THREE.BoxGeometry(0.09, 0.8, 0.09);
    for (let index = 0; index < 6; index += 1) {
      const height = 0.5 + (index % 3) * 0.22;
      for (const side of [-1, 1]) {
        const material = new THREE.MeshBasicMaterial({
          color: index % 2 === 0 ? palette.primary : palette.secondary,
          transparent: true,
          opacity: 0.85,
          depthWrite: false,
          blending: THREE.AdditiveBlending
        });
        const bar = new THREE.Mesh(barGeometry, material);
        bar.position.set(side * (2.2 + index * 0.15), 0.2 + height * 0.5, -1.2 + index * 0.05);
        bar.scale.y = height;
        group.add(bar);
        kineticObjects.push(bar);
        glowMaterials.push(material);
      }
    }

    // Glowing Neon Star Gems Floating in Background
    const starMaterial = new THREE.MeshBasicMaterial({
      color: palette.accent,
      transparent: true,
      opacity: 0.85,
      depthWrite: false,
      blending: THREE.AdditiveBlending
    });
    for (let index = 0; index < 5; index += 1) {
      const star = new THREE.Mesh(new THREE.IcosahedronGeometry(0.08 + index * 0.015, 0), starMaterial.clone());
      const starAnchors = [
        [-2.4, 3.2, -1.6],
        [2.4, 3.2, -1.6],
        [-2.6, 0.9, -1.7],
        [2.6, 0.9, -1.7],
        [0, 3.6, -1.9]
      ] as const;
      const [x, y, z] = starAnchors[index];
      star.position.set(x, y, z);
      group.add(star);
      kineticObjects.push(star);
      glowMaterials.push(star.material as THREE.MeshBasicMaterial);
    }
  }

  private updateParticles(stage: PerformanceStageRuntime, time: number): void {
    const positions = stage.particles.geometry.getAttribute("position") as THREE.BufferAttribute;
    for (let index = 0; index < positions.count; index += 1) {
      const baseIndex = index * 3;
      const direction = stage.theme === "lantern-festival" || stage.theme === "wheat-field" ? -1 : 1;
      const travel = (time * stage.particleSpeed[index] + index * 0.017) % 0.46;
      positions.array[baseIndex] =
        stage.particleBasePositions[baseIndex] + Math.sin(time * 0.38 + index * 0.53) * 0.045;
      positions.array[baseIndex + 1] =
        stage.particleBasePositions[baseIndex + 1] + travel * direction;
    }
    positions.needsUpdate = true;
    stage.particles.rotation.y = Math.sin(time * 0.09) * 0.04;
  }
}

function pseudoRandom(seed: number): number {
  const value = Math.sin(seed * 12.9898 + 78.233) * 43758.5453;
  return value - Math.floor(value);
}

function disposeMaterial(material: THREE.Material | THREE.Material[] | undefined): void {
  if (!material) return;
  if (Array.isArray(material)) {
    material.forEach(disposeMaterial);
    return;
  }
  Object.values(material).forEach((value) => {
    if ((value as THREE.Texture)?.isTexture) (value as THREE.Texture).dispose();
  });
  material.dispose();
}
