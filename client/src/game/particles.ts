import * as THREE from 'three';

interface Particle {
  active: boolean;
  pos: THREE.Vector3;
  vel: THREE.Vector3;
  life: number;
  maxLife: number;
  size: number;
}

const CAPACITY = 220;

export class Particles {
  mesh: THREE.InstancedMesh;
  private parts: Particle[] = [];
  private cursor = 0;
  private dummy = new THREE.Object3D();

  constructor(scene: THREE.Scene) {
    const geo = new THREE.BoxGeometry(0.16, 0.16, 0.16);
    const mat = new THREE.MeshBasicMaterial({ color: '#ffffff' });
    this.mesh = new THREE.InstancedMesh(geo, mat, CAPACITY);
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mesh.frustumCulled = false;
    for (let i = 0; i < CAPACITY; i++) {
      this.parts.push({
        active: false,
        pos: new THREE.Vector3(),
        vel: new THREE.Vector3(),
        life: 0,
        maxLife: 1,
        size: 1,
      });
      this.dummy.position.set(0, -100, 0);
      this.dummy.scale.setScalar(0.001);
      this.dummy.updateMatrix();
      this.mesh.setMatrixAt(i, this.dummy.matrix);
      this.mesh.setColorAt(i, new THREE.Color('#ffffff'));
    }
    scene.add(this.mesh);
  }

  burst(x: number, y: number, z: number, color: string, count = 8, speed = 4, life = 0.6) {
    const c = new THREE.Color(color);
    for (let i = 0; i < count; i++) {
      const idx = this.cursor;
      this.cursor = (this.cursor + 1) % CAPACITY;
      const p = this.parts[idx];
      p.active = true;
      p.pos.set(x, y, z);
      const a = Math.random() * Math.PI * 2;
      const up = 1.5 + Math.random() * speed * 0.8;
      p.vel.set(Math.cos(a) * speed * (0.4 + Math.random() * 0.6), up, Math.sin(a) * speed * (0.4 + Math.random() * 0.6));
      p.life = life * (0.6 + Math.random() * 0.7);
      p.maxLife = p.life;
      p.size = 0.7 + Math.random() * 0.9;
      this.mesh.setColorAt(idx, c);
    }
    if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;
  }

  update(dt: number) {
    for (let i = 0; i < CAPACITY; i++) {
      const p = this.parts[i];
      if (!p.active) continue;
      p.life -= dt;
      if (p.life <= 0) {
        p.active = false;
        this.dummy.position.set(0, -100, 0);
        this.dummy.scale.setScalar(0.001);
      } else {
        p.vel.y -= 12 * dt;
        p.pos.addScaledVector(p.vel, dt);
        if (p.pos.y < 0.05) {
          p.pos.y = 0.05;
          p.vel.y = Math.abs(p.vel.y) * 0.3;
        }
        this.dummy.position.copy(p.pos);
        const s = p.size * (p.life / p.maxLife);
        this.dummy.scale.setScalar(Math.max(0.001, s));
        this.dummy.rotation.set(p.life * 5, p.life * 7, 0);
      }
      this.dummy.updateMatrix();
      this.mesh.setMatrixAt(i, this.dummy.matrix);
    }
    this.mesh.instanceMatrix.needsUpdate = true;
  }
}
