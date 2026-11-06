// Sky dome, sun/moon, stars, clouds and night fireflies.
import * as THREE from 'three';

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

function smoothstep(a, b, x) {
  const t = clamp((x - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
}

function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function glowTexture(inner, outer) {
  const c = document.createElement('canvas');
  c.width = 128;
  c.height = 128;
  const ctx = c.getContext('2d');
  const grad = ctx.createRadialGradient(64, 64, 4, 64, 64, 64);
  grad.addColorStop(0, inner);
  grad.addColorStop(0.35, outer);
  grad.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 128, 128);
  const texture = new THREE.CanvasTexture(c);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

export class SkySystem {
  constructor(scene, seed = 1) {
    this.scene = scene;
    this.dayTop = new THREE.Color('#63b4f4');
    this.dayHorizon = new THREE.Color('#d4ecfb');
    this.nightTop = new THREE.Color('#060d20');
    this.nightHorizon = new THREE.Color('#14213d');
    this.sunsetTop = new THREE.Color('#4d74b0');
    this.sunsetHorizon = new THREE.Color('#ffa45f');
    this.horizonColor = new THREE.Color('#d4ecfb');
    this.topColor = new THREE.Color('#63b4f4');
    this.daylight = 1;
    this.sunDir = new THREE.Vector3(0, 1, 0);
    this.time = 0.33;

    const skyGeo = new THREE.SphereGeometry(280, 32, 18);
    this.skyMat = new THREE.ShaderMaterial({
      side: THREE.BackSide,
      depthWrite: false,
      fog: false,
      uniforms: {
        topColor: { value: this.topColor },
        horizonColor: { value: this.horizonColor },
        sunDirection: { value: this.sunDir },
        sunColor: { value: new THREE.Color('#fff3c4') },
      },
      vertexShader: `
        varying vec3 vDir;
        void main() {
          vDir = normalize(position);
          vec4 mv = modelViewMatrix * vec4(position, 1.0);
          gl_Position = projectionMatrix * mv;
        }
      `,
      fragmentShader: `
        varying vec3 vDir;
        uniform vec3 topColor;
        uniform vec3 horizonColor;
        uniform vec3 sunDirection;
        uniform vec3 sunColor;
        void main() {
          float h = clamp(vDir.y, -1.0, 1.0);
          float t = smoothstep(-0.06, 0.62, h);
          vec3 col = mix(horizonColor, topColor, t);
          float horizonBand = 1.0 - smoothstep(0.0, 0.28, abs(h));
          col = mix(col, horizonColor, horizonBand * 0.18);
          float sunAmount = max(dot(normalize(vDir), normalize(sunDirection)), 0.0);
          col += sunColor * pow(sunAmount, 34.0) * 0.18;
          col += sunColor * pow(sunAmount, 6.0) * 0.045;
          gl_FragColor = vec4(col, 1.0);
        }
      `,
    });
    this.sky = new THREE.Mesh(skyGeo, this.skyMat);
    this.sky.frustumCulled = false;
    this.sky.renderOrder = -10;
    scene.add(this.sky);

    // Sun and moon ---------------------------------------------------------
    const sunTex = glowTexture('rgba(255,252,230,1)', 'rgba(255,220,126,0.9)');
    this.sun = new THREE.Sprite(new THREE.SpriteMaterial({
      map: sunTex, color: 0xffffff, transparent: true, depthWrite: false, fog: false, blending: THREE.AdditiveBlending,
    }));
    this.sun.scale.set(30, 30, 1);
    this.sun.renderOrder = -8;
    scene.add(this.sun);

    const moonTex = glowTexture('rgba(240,246,255,1)', 'rgba(180,201,238,0.8)');
    this.moon = new THREE.Sprite(new THREE.SpriteMaterial({
      map: moonTex, color: 0xdfe8ff, transparent: true, depthWrite: false, fog: false,
    }));
    this.moon.scale.set(20, 20, 1);
    this.moon.renderOrder = -8;
    scene.add(this.moon);

    // Stars ----------------------------------------------------------------
    const starPositions = [];
    const rand = mulberry32(seed + 88);
    for (let i = 0; i < 420; i++) {
      const theta = rand() * Math.PI * 2;
      const y = Math.pow(rand(), 0.55);
      const r = Math.sqrt(1 - y * y);
      starPositions.push(Math.cos(theta) * r * 260, y * 250, Math.sin(theta) * r * 260);
    }
    const starGeo = new THREE.BufferGeometry();
    starGeo.setAttribute('position', new THREE.Float32BufferAttribute(starPositions, 3));
    this.stars = new THREE.Points(starGeo, new THREE.PointsMaterial({
      color: 0xffffff, size: 1.35, sizeAttenuation: true, transparent: true, opacity: 0,
      depthWrite: false, fog: false,
    }));
    this.stars.renderOrder = -9;
    scene.add(this.stars);

    // Clouds ---------------------------------------------------------------
    const cloudGeo = new THREE.BoxGeometry(1, 1, 1);
    const cloudMat = new THREE.MeshBasicMaterial({
      color: 0xffffff, transparent: true, opacity: 0.78, depthWrite: false, fog: true,
    });
    const clusters = 26;
    const perCluster = 5;
    const count = clusters * perCluster;
    this.clouds = new THREE.InstancedMesh(cloudGeo, cloudMat, count);
    this.clouds.frustumCulled = false;
    this.clouds.renderOrder = 3;
    this.cloudData = [];
    const cr = mulberry32(seed + 192);
    const dummy = new THREE.Object3D();
    let cloudIndex = 0;
    for (let cluster = 0; cluster < clusters; cluster++) {
      const cx = (cr() - 0.5) * 260;
      const cz = (cr() - 0.5) * 260;
      const cy = 61 + cr() * 7;
      const speed = 0.35 + cr() * 0.3;
      for (let b = 0; b < perCluster; b++) {
        const x = cx + (cr() - 0.5) * 13;
        const y = cy + (cr() - 0.5) * 2.2;
        const z = cz + (cr() - 0.5) * 8;
        const sx = 3.2 + cr() * 5.8;
        const sy = 1.2 + cr() * 1.6;
        const sz = 2.6 + cr() * 4.4;
        this.cloudData.push({ x, y, z, sx, sy, sz, speed, phase: cluster });
        dummy.position.set(x, y, z);
        dummy.scale.set(sx, sy, sz);
        dummy.updateMatrix();
        this.clouds.setMatrixAt(cloudIndex++, dummy.matrix);
      }
    }
    this.clouds.instanceMatrix.needsUpdate = true;
    scene.add(this.clouds);

    // Fireflies ------------------------------------------------------------
    const firePositions = [];
    const fr = mulberry32(seed + 404);
    this.fireflyBase = [];
    for (let i = 0; i < 55; i++) {
      const x = (fr() - 0.5) * 90;
      const z = (fr() - 0.5) * 90;
      const y = 5 + fr() * 12;
      this.fireflyBase.push({ x, y, z, phase: fr() * 10, speed: 0.3 + fr() * 0.6 });
      firePositions.push(x, y, z);
    }
    const fireGeo = new THREE.BufferGeometry();
    fireGeo.setAttribute('position', new THREE.Float32BufferAttribute(firePositions, 3));
    this.fireflies = new THREE.Points(fireGeo, new THREE.PointsMaterial({
      color: 0xffe98a, size: 0.28, sizeAttenuation: true, transparent: true, opacity: 0,
      depthWrite: false, blending: THREE.AdditiveBlending,
    }));
    scene.add(this.fireflies);

    this.clouds.material.color.setRGB(1, 1, 1);
    this.tmpColor = new THREE.Color();
    this.cloudDummy = new THREE.Object3D();
  }

  update(time, camera, dt) {
    this.time = time;
    const angle = (time - 0.25) * Math.PI * 2;
    this.sunDir.set(Math.cos(angle), Math.sin(angle), 0.3).normalize();
    const sunY = this.sunDir.y;
    this.daylight = smoothstep(-0.1, 0.2, sunY);
    const twilight = (1 - smoothstep(0.0, 0.34, Math.abs(sunY))) * smoothstep(-0.2, 0.0, sunY) * 0.9;

    this.topColor.copy(this.nightTop).lerp(this.dayTop, this.daylight);
    this.horizonColor.copy(this.nightHorizon).lerp(this.dayHorizon, this.daylight);
    if (twilight > 0.001) {
      this.topColor.lerp(this.sunsetTop, twilight * 0.4);
      this.horizonColor.lerp(this.sunsetHorizon, twilight * 0.95);
    }

    this.sky.position.copy(camera.position);
    this.stars.position.copy(camera.position);
    this.stars.rotation.y += dt * 0.004;
    this.stars.material.opacity = (1 - this.daylight) * 1;
    this.sun.position.copy(camera.position).addScaledVector(this.sunDir, 235);
    this.moon.position.copy(camera.position).addScaledVector(this.sunDir, -235);
    this.sun.material.opacity = smoothstep(-0.16, 0.12, sunY);
    this.moon.material.opacity = smoothstep(-0.12, 0.16, -sunY) * 0.95;

    // Clouds drift with a soft wrap.
    for (let i = 0; i < this.cloudData.length; i++) {
      const c = this.cloudData[i];
      c.x += c.speed * dt;
      if (c.x > 140) c.x -= 280;
      this.cloudDummy.position.set(c.x, c.y, c.z);
      this.cloudDummy.scale.set(c.sx, c.sy, c.sz);
      this.cloudDummy.updateMatrix();
      this.clouds.setMatrixAt(i, this.cloudDummy.matrix);
    }
    this.clouds.instanceMatrix.needsUpdate = true;
    const cloudLight = 0.2 + 0.8 * this.daylight;
    this.clouds.material.color.setRGB(cloudLight, cloudLight * 1.02, cloudLight * 1.1);
    this.clouds.material.opacity = 0.42 + 0.36 * this.daylight;

    // Fireflies bob around at night.
    const pos = this.fireflies.geometry.attributes.position;
    const t = performance.now() * 0.001;
    for (let i = 0; i < this.fireflyBase.length; i++) {
      const f = this.fireflyBase[i];
      pos.setXYZ(
        i,
        f.x + Math.sin(t * f.speed + f.phase) * 1.4,
        f.y + Math.sin(t * f.speed * 1.4 + f.phase * 2) * 0.7,
        f.z + Math.cos(t * f.speed + f.phase) * 1.4,
      );
    }
    pos.needsUpdate = true;
    this.fireflies.material.opacity = (1 - this.daylight) * 0.95;
    this.fireflies.material.size = 0.36 + (1 - this.daylight) * 0.18;

    return {
      daylight: this.daylight,
      light: 0.34 + 0.66 * this.daylight,
      horizon: this.horizonColor,
    };
  }
}
