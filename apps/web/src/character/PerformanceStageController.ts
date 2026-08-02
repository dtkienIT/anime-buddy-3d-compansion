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
    deep: 0x08080e,
    primary: 0xff315f,
    secondary: 0xffc928,
    accent: 0x9dff38,
    floor: 0x160b18,
    mode: 0
  },
  "lantern-festival": {
    deep: 0x130923,
    primary: 0xff5d8f,
    secondary: 0xffc857,
    accent: 0x5eead4,
    floor: 0x24102e,
    mode: 1
  },
  "aurora-dawn": {
    deep: 0x071124,
    primary: 0xff7b71,
    secondary: 0xffcf70,
    accent: 0x56d9ff,
    floor: 0x13152e,
    mode: 2
  },
  "wheat-field": {
    deep: 0x1a1027,
    primary: 0xf0a83b,
    secondary: 0xffe29a,
    accent: 0x76d49a,
    floor: 0x24172a,
    mode: 3
  }
};

const particleCounts: Record<PerformanceStageTheme, number> = {
  "neon-cube": 72,
  "lantern-festival": 110,
  "aurora-dawn": 128,
  "wheat-field": 96
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
    group.position.set(0, 0, -0.76);
    group.renderOrder = -3;

    const glowMaterials: THREE.MeshBasicMaterial[] = [];
    const rings: THREE.Mesh[] = [];
    const beams: THREE.Mesh[] = [];
    const kineticObjects: THREE.Object3D[] = [];
    const spotlights: THREE.SpotLight[] = [];

    const screenMaterial = this.createScreenMaterial(palette);
    const screen = new THREE.Mesh(new THREE.PlaneGeometry(7.4, 4.6), screenMaterial);
    screen.position.set(0, 2.15, -0.78);
    screen.renderOrder = -4;
    group.add(screen);

    this.addStageDeck(group, palette, rings, glowMaterials);
    this.addLightRig(group, palette, spotlights, beams, glowMaterials);

    if (theme === "neon-cube") {
      this.addNeonCubeSet(group, palette, kineticObjects, glowMaterials);
    } else if (theme === "lantern-festival") {
      this.addLanternFestivalSet(group, palette, kineticObjects, rings, glowMaterials);
    } else if (theme === "aurora-dawn") {
      this.addAuroraDawnSet(group, palette, kineticObjects, rings, glowMaterials);
    } else {
      this.addWheatFieldSet(group, palette, kineticObjects, rings, glowMaterials);
    }

    const particleCount = particleCounts[theme];
    const particleBasePositions = new Float32Array(particleCount * 3);
    const particleSpeed = new Float32Array(particleCount);
    for (let index = 0; index < particleCount; index += 1) {
      const seed = pseudoRandom(index + palette.mode * 137);
      const seedB = pseudoRandom(index * 7 + palette.mode * 53 + 11);
      particleBasePositions[index * 3] = (seed - 0.5) * 6.2;
      particleBasePositions[index * 3 + 1] = 0.25 + seedB * 3.45;
      particleBasePositions[index * 3 + 2] = -0.2 - pseudoRandom(index * 13 + 5) * 0.72;
      particleSpeed[index] = 0.026 + pseudoRandom(index * 17 + 3) * 0.065;
    }
    const particleGeometry = new THREE.BufferGeometry();
    particleGeometry.setAttribute("position", new THREE.BufferAttribute(particleBasePositions.slice(), 3));
    const particles = new THREE.Points(
      particleGeometry,
      new THREE.PointsMaterial({
        color: palette.secondary,
        size: theme === "lantern-festival" ? 0.034 : theme === "wheat-field" ? 0.03 : 0.026,
        transparent: true,
        opacity: 0.8,
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
    stage.energy = THREE.MathUtils.lerp(stage.energy, energy, reducedMotion ? 0.08 : 0.22);
    const motionEnergy = reducedMotion ? 0.16 : stage.energy;
    const pulse = reducedMotion ? 0.35 : 0.45 + Math.sin(time * 3.6) * 0.12 + motionEnergy * 0.52;

    stage.screenMaterial.uniforms.uTime.value = reducedMotion ? 0 : time;
    stage.screenMaterial.uniforms.uEnergy.value = pulse;

    stage.rings.forEach((ring, index) => {
      if (!reducedMotion) {
        ring.rotation.z = time * (0.075 + index * 0.026) * (index % 2 === 0 ? 1 : -1);
        ring.scale.setScalar(1 + Math.sin(time * 1.7 + index) * 0.012 + motionEnergy * 0.025);
      }
      const material = ring.material as THREE.MeshBasicMaterial;
      material.opacity = Math.min(0.92, 0.35 + pulse * 0.36 + index * 0.025);
    });

    stage.kineticObjects.forEach((object, index) => {
      if (reducedMotion) return;
      const phase = time * (0.42 + index * 0.018) + index * 0.71;
      object.position.y += Math.sin(phase) * 0.0018;
      object.rotation.y += (0.0018 + motionEnergy * 0.0032) * (index % 2 === 0 ? 1 : -1);
    });

    stage.spotlights.forEach((spotlight, index) => {
      const phase = time * (0.58 + index * 0.07) + index * 1.44;
      if (!reducedMotion) {
        spotlight.position.x = (index - 1.5) * 1.42 + Math.sin(phase) * 0.42;
        spotlight.target.position.x = (index - 1.5) * 0.38 + Math.sin(phase * 0.7) * 0.55;
      }
      spotlight.intensity = 1.7 + pulse * 2.25 + index * 0.08;
    });

    stage.beams.forEach((beam, index) => {
      if (!reducedMotion) {
        beam.rotation.z = (index - 1.5) * 0.13 + Math.sin(time * 0.52 + index) * 0.08;
      }
      (beam.material as THREE.MeshBasicMaterial).opacity = 0.055 + pulse * 0.075;
    });

    stage.glowMaterials.forEach((material, index) => {
      material.opacity = Math.min(0.94, 0.38 + pulse * 0.38 + (index % 3) * 0.035);
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
          float vignette = smoothstep(0.82, 0.18, length(p * vec2(0.82, 1.0)));
          vec3 color = uDeep;

          if (uMode < 0.5) {
            float diagonal = 0.5 + 0.5 * sin((p.x * 9.0 + p.y * 5.0) - uTime * 2.2);
            float grid = max(line(vUv.x * 11.0 + uTime * 0.12, 0.028), line(vUv.y * 7.0, 0.024));
            color = mix(uDeep, uPrimary, diagonal * 0.5);
            color += mix(uSecondary, uAccent, vUv.y) * grid * (0.28 + uEnergy * 0.5);
          } else if (uMode < 1.5) {
            float radius = length(p);
            float moon = smoothstep(0.34, 0.325, radius) * smoothstep(0.21, 0.225, radius);
            float silk = 0.5 + 0.5 * sin(p.x * 7.0 + sin(p.y * 6.0 + uTime * 0.5) - uTime * 0.75);
            color = mix(uDeep, uPrimary, silk * 0.36);
            color += uSecondary * moon * (0.48 + uEnergy * 0.38);
            color += uAccent * smoothstep(0.03, 0.0, abs(p.y + 0.28 + sin(p.x * 5.0 + uTime) * 0.035)) * 0.28;
          } else if (uMode < 2.5) {
            float sunrise = exp(-6.8 * length(p + vec2(0.0, 0.17)));
            float auroraA = smoothstep(0.07, 0.0, abs(p.y - 0.12 * sin(p.x * 5.0 + uTime * 0.55)));
            float auroraB = smoothstep(0.045, 0.0, abs(p.y + 0.15 - 0.08 * sin(p.x * 7.0 - uTime * 0.42)));
            color = mix(uDeep, uPrimary, sunrise * 0.66);
            color += uSecondary * sunrise * (0.28 + uEnergy * 0.38);
            color += uAccent * auroraA * 0.38 + uPrimary * auroraB * 0.22;
          } else {
            float horizon = smoothstep(0.72, -0.16, p.y);
            float sun = smoothstep(0.31, 0.29, length(p - vec2(0.0, 0.16)));
            float sweep = 0.5 + 0.5 * sin(p.x * 8.0 + p.y * 5.0 - uTime * 0.7);
            float grain = line(vUv.y * 13.0 + p.x * 1.7 + uTime * 0.08, 0.018);
            color = mix(uDeep, uPrimary, horizon * 0.36 + sweep * 0.12);
            color += uSecondary * sun * (0.52 + uEnergy * 0.35);
            color += uAccent * grain * (0.18 + horizon * 0.32);
          }

          gl_FragColor = vec4(color * (0.62 + vignette * 0.5), 0.985);
        }
      `,
      transparent: true,
      depthWrite: false,
      depthTest: true
    });
  }

  private addStageDeck(
    group: THREE.Group,
    palette: StagePalette,
    rings: THREE.Mesh[],
    glowMaterials: THREE.MeshBasicMaterial[]
  ): void {
    const base = new THREE.Mesh(
      new THREE.CylinderGeometry(2.72, 2.98, 0.18, 64),
      new THREE.MeshStandardMaterial({
        color: palette.floor,
        emissive: palette.deep,
        emissiveIntensity: 0.68,
        metalness: 0.82,
        roughness: 0.22
      })
    );
    base.position.set(0, 0.07, -0.12);
    base.receiveShadow = true;
    group.add(base);

    const top = new THREE.Mesh(
      new THREE.CylinderGeometry(2.5, 2.5, 0.04, 64),
      new THREE.MeshStandardMaterial({
        color: palette.floor,
        emissive: palette.primary,
        emissiveIntensity: 0.22,
        metalness: 0.72,
        roughness: 0.2
      })
    );
    top.position.set(0, 0.18, -0.12);
    top.receiveShadow = true;
    group.add(top);

    const ringColors = [palette.primary, palette.secondary, palette.accent];
    [2.38, 1.92, 1.44].forEach((radius, index) => {
      const material = new THREE.MeshBasicMaterial({
        color: ringColors[index],
        transparent: true,
        opacity: 0.68,
        depthWrite: false,
        blending: THREE.AdditiveBlending
      });
      const ring = new THREE.Mesh(new THREE.TorusGeometry(radius, 0.022, 8, 72), material);
      ring.position.set(0, 0.213 + index * 0.003, -0.12);
      ring.rotation.x = Math.PI / 2;
      group.add(ring);
      rings.push(ring);
      glowMaterials.push(material);
    });

    const runwayMaterial = new THREE.MeshStandardMaterial({
      color: palette.floor,
      emissive: palette.secondary,
      emissiveIntensity: 0.42,
      metalness: 0.72,
      roughness: 0.22
    });
    const runway = new THREE.Mesh(new THREE.BoxGeometry(0.76, 0.055, 2.4), runwayMaterial);
    runway.position.set(0, 0.17, 1.25);
    runway.receiveShadow = true;
    group.add(runway);

    for (const x of [-0.36, 0.36]) {
      const edgeMaterial = new THREE.MeshBasicMaterial({
        color: palette.accent,
        transparent: true,
        opacity: 0.62,
        depthWrite: false,
        blending: THREE.AdditiveBlending
      });
      const edge = new THREE.Mesh(new THREE.BoxGeometry(0.018, 0.012, 2.28), edgeMaterial);
      edge.position.set(x, 0.205, 1.25);
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
    const trussMaterial = new THREE.MeshStandardMaterial({
      color: 0x171722,
      emissive: palette.primary,
      emissiveIntensity: 0.18,
      metalness: 0.9,
      roughness: 0.28
    });
    for (const x of [-3.12, 3.12]) {
      const pillar = new THREE.Mesh(new THREE.BoxGeometry(0.12, 3.35, 0.14), trussMaterial);
      pillar.position.set(x, 1.68, -0.52);
      group.add(pillar);
    }
    const header = new THREE.Mesh(new THREE.BoxGeometry(6.36, 0.12, 0.14), trussMaterial);
    header.position.set(0, 3.33, -0.52);
    group.add(header);

    const colors = [palette.primary, palette.secondary, palette.accent, palette.primary];
    for (let index = 0; index < 4; index += 1) {
      const spotlight = new THREE.SpotLight(colors[index], 3.1, 5.8, Math.PI / 9, 0.68, 1.1);
      spotlight.position.set((index - 1.5) * 1.42, 3.42, 0.15);
      spotlight.castShadow = index === 1 || index === 2;
      spotlight.shadow.mapSize.set(512, 512);
      const target = new THREE.Object3D();
      target.position.set((index - 1.5) * 0.38, 0.2, -0.08);
      group.add(target);
      spotlight.target = target;
      group.add(spotlight);
      spotlights.push(spotlight);

      const beamMaterial = new THREE.MeshBasicMaterial({
        color: colors[index],
        transparent: true,
        opacity: 0.1,
        depthWrite: false,
        side: THREE.DoubleSide,
        blending: THREE.AdditiveBlending
      });
      const beam = new THREE.Mesh(new THREE.ConeGeometry(0.2, 3.65, 22, 1, true), beamMaterial);
      beam.position.set((index - 1.5) * 1.35, 2.0, -0.22);
      beam.rotation.x = Math.PI;
      beam.rotation.z = (index - 1.5) * 0.13;
      group.add(beam);
      beams.push(beam);
      glowMaterials.push(beamMaterial);
    }
  }

  private addNeonCubeSet(
    group: THREE.Group,
    palette: StagePalette,
    kineticObjects: THREE.Object3D[],
    glowMaterials: THREE.MeshBasicMaterial[]
  ): void {
    const cubePositions = [
      [-1.78, 2.55, -0.36, 0.64],
      [-0.88, 2.82, -0.32, 0.5],
      [0, 2.52, -0.3, 0.74],
      [0.9, 2.85, -0.32, 0.5],
      [1.78, 2.56, -0.36, 0.64]
    ] as const;
    cubePositions.forEach(([x, y, z, size], index) => {
      const edgeMaterial = new THREE.MeshBasicMaterial({
        color: index % 2 === 0 ? palette.primary : palette.secondary,
        transparent: true,
        opacity: 0.76,
        depthWrite: false,
        blending: THREE.AdditiveBlending
      });
      const cube = new THREE.LineSegments(
        new THREE.EdgesGeometry(new THREE.BoxGeometry(size, size, size)),
        edgeMaterial
      );
      cube.position.set(x, y, z);
      cube.rotation.set(0.18 * (index % 2), index * 0.24, 0.12 * (index - 2));
      group.add(cube);
      kineticObjects.push(cube);
      glowMaterials.push(edgeMaterial);
    });

    for (const x of [-2.52, -2.18, 2.18, 2.52]) {
      const material = new THREE.MeshBasicMaterial({
        color: x < 0 ? palette.primary : palette.accent,
        transparent: true,
        opacity: 0.68,
        depthWrite: false
      });
      const bar = new THREE.Mesh(new THREE.BoxGeometry(0.055, 1.72, 0.035), material);
      bar.position.set(x, 1.65 + Math.abs(x) * 0.08, -0.35);
      bar.rotation.z = x < 0 ? -0.11 : 0.11;
      group.add(bar);
      glowMaterials.push(material);
    }
  }

  private addLanternFestivalSet(
    group: THREE.Group,
    palette: StagePalette,
    kineticObjects: THREE.Object3D[],
    rings: THREE.Mesh[],
    glowMaterials: THREE.MeshBasicMaterial[]
  ): void {
    const moonMaterial = new THREE.MeshBasicMaterial({
      color: palette.secondary,
      transparent: true,
      opacity: 0.54,
      depthWrite: false,
      blending: THREE.AdditiveBlending
    });
    const moonGate = new THREE.Mesh(new THREE.TorusGeometry(1.45, 0.055, 12, 96), moonMaterial);
    moonGate.position.set(0, 1.75, -0.3);
    moonGate.scale.y = 1.06;
    group.add(moonGate);
    rings.push(moonGate);
    glowMaterials.push(moonMaterial);

    const lanternPositions = [
      [-2.45, 2.65, 0.62],
      [-1.78, 2.96, 0.48],
      [1.78, 2.96, 0.48],
      [2.45, 2.65, 0.62],
      [-2.72, 1.82, 0.42],
      [2.72, 1.82, 0.42]
    ] as const;
    lanternPositions.forEach(([x, y, scale], index) => {
      const lantern = new THREE.Group();
      const material = new THREE.MeshStandardMaterial({
        color: index % 2 === 0 ? palette.primary : palette.secondary,
        emissive: index % 2 === 0 ? palette.primary : palette.secondary,
        emissiveIntensity: 1.45,
        transparent: true,
        opacity: 0.88,
        roughness: 0.56
      });
      const body = new THREE.Mesh(new THREE.SphereGeometry(0.18 * scale, 20, 16), material);
      body.scale.y = 1.28;
      const capMaterial = new THREE.MeshBasicMaterial({ color: palette.accent });
      const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.08 * scale, 0.08 * scale, 0.035, 18), capMaterial);
      cap.position.y = 0.2 * scale;
      const tassel = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.008, 0.24 * scale, 8), capMaterial);
      tassel.position.y = -0.25 * scale;
      lantern.add(body, cap, tassel);
      lantern.position.set(x, y, -0.18);
      group.add(lantern);
      kineticObjects.push(lantern);
    });

    const bridgeMaterial = new THREE.MeshBasicMaterial({
      color: palette.accent,
      transparent: true,
      opacity: 0.5,
      depthWrite: false,
      blending: THREE.AdditiveBlending
    });
    for (const side of [-1, 1]) {
      const arc = new THREE.Mesh(
        new THREE.TorusGeometry(2.25, 0.025, 8, 64, Math.PI * 0.62),
        bridgeMaterial.clone()
      );
      arc.position.set(side * 1.62, 1.05, -0.36);
      arc.rotation.z = side < 0 ? -0.72 : Math.PI + 0.72;
      group.add(arc);
      glowMaterials.push(arc.material as THREE.MeshBasicMaterial);
    }
  }

  private addAuroraDawnSet(
    group: THREE.Group,
    palette: StagePalette,
    kineticObjects: THREE.Object3D[],
    rings: THREE.Mesh[],
    glowMaterials: THREE.MeshBasicMaterial[]
  ): void {
    const sunMaterial = new THREE.MeshBasicMaterial({
      color: palette.secondary,
      transparent: true,
      opacity: 0.62,
      depthWrite: false,
      blending: THREE.AdditiveBlending
    });
    const sun = new THREE.Mesh(new THREE.CircleGeometry(0.72, 64), sunMaterial);
    sun.position.set(0, 1.72, -0.27);
    group.add(sun);
    kineticObjects.push(sun);
    glowMaterials.push(sunMaterial);

    [0.96, 1.18, 1.42].forEach((radius, index) => {
      const material = new THREE.MeshBasicMaterial({
        color: [palette.accent, palette.primary, palette.secondary][index],
        transparent: true,
        opacity: 0.44 - index * 0.06,
        depthWrite: false,
        blending: THREE.AdditiveBlending
      });
      const ring = new THREE.Mesh(new THREE.TorusGeometry(radius, 0.022, 8, 72), material);
      ring.position.set(0, 1.72, -0.24 + index * 0.006);
      ring.scale.y = 0.82 + index * 0.08;
      group.add(ring);
      rings.push(ring);
      glowMaterials.push(material);
    });

    for (let index = 0; index < 5; index += 1) {
      const material = new THREE.MeshBasicMaterial({
        color: index % 2 === 0 ? palette.accent : palette.primary,
        transparent: true,
        opacity: 0.26,
        depthWrite: false,
        side: THREE.DoubleSide,
        blending: THREE.AdditiveBlending
      });
      const ribbon = new THREE.Mesh(new THREE.PlaneGeometry(1.58, 0.065, 8, 1), material);
      ribbon.position.set((index - 2) * 1.1, 2.5 - Math.abs(index - 2) * 0.17, -0.18);
      ribbon.rotation.z = (index - 2) * 0.12;
      group.add(ribbon);
      kineticObjects.push(ribbon);
      glowMaterials.push(material);
    }

    const sideScreenMaterial = new THREE.MeshBasicMaterial({
      color: palette.primary,
      transparent: true,
      opacity: 0.34,
      depthWrite: false,
      blending: THREE.AdditiveBlending
    });
    for (const side of [-1, 1]) {
      const sideScreen = new THREE.Mesh(new THREE.PlaneGeometry(0.54, 2.52), sideScreenMaterial.clone());
      sideScreen.position.set(side * 2.62, 1.72, -0.3);
      sideScreen.rotation.z = side * -0.1;
      group.add(sideScreen);
      glowMaterials.push(sideScreen.material as THREE.MeshBasicMaterial);
    }
  }

  private addWheatFieldSet(
    group: THREE.Group,
    palette: StagePalette,
    kineticObjects: THREE.Object3D[],
    rings: THREE.Mesh[],
    glowMaterials: THREE.MeshBasicMaterial[]
  ): void {
    const sunMaterial = new THREE.MeshBasicMaterial({
      color: palette.secondary,
      transparent: true,
      opacity: 0.66,
      depthWrite: false,
      blending: THREE.AdditiveBlending
    });
    const sun = new THREE.Mesh(new THREE.CircleGeometry(0.68, 48), sunMaterial);
    sun.position.set(0, 1.8, -0.3);
    group.add(sun);
    kineticObjects.push(sun);
    glowMaterials.push(sunMaterial);

    const archMaterial = new THREE.MeshBasicMaterial({
      color: palette.primary,
      transparent: true,
      opacity: 0.72,
      depthWrite: false,
      blending: THREE.AdditiveBlending
    });
    const arch = new THREE.Mesh(new THREE.TorusGeometry(1.82, 0.045, 10, 96, Math.PI), archMaterial);
    arch.position.set(0, 1.62, -0.34);
    arch.rotation.z = Math.PI;
    group.add(arch);
    rings.push(arch);
    glowMaterials.push(archMaterial);

    const stalkMaterial = new THREE.MeshStandardMaterial({
      color: palette.accent,
      emissive: palette.accent,
      emissiveIntensity: 0.5,
      roughness: 0.7
    });
    const headMaterial = new THREE.MeshBasicMaterial({
      color: palette.secondary,
      transparent: true,
      opacity: 0.84,
      depthWrite: false,
      blending: THREE.AdditiveBlending
    });
    for (let index = 0; index < 11; index += 1) {
      const stalk = new THREE.Group();
      const x = (index - 5) * 0.44;
      const height = 0.72 + (index % 3) * 0.13;
      const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.018, height, 8), stalkMaterial);
      stem.position.y = 0.48 + height * 0.5;
      stem.rotation.z = (index - 5) * 0.018;
      const head = new THREE.Mesh(new THREE.IcosahedronGeometry(0.09, 0), headMaterial);
      head.position.set((index - 5) * 0.025, 0.48 + height, 0);
      stalk.add(stem, head);
      stalk.position.set(x, 0.08, -0.42 + (index % 2) * 0.08);
      group.add(stalk);
      kineticObjects.push(stalk);
      glowMaterials.push(headMaterial);
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
