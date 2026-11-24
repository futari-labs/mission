import * as THREE from 'three';
import { loadGlb, meshesOf } from './assets.ts';
import { adoptBake, createStoneMaterial } from './materials.ts';

export class Terrain {
	readonly root = new THREE.Group();

	async load(): Promise<void> {
		const gltf = await loadGlb('/assets/terrain.glb');
		const material = createStoneMaterial('terrain');
		for (const mesh of meshesOf(gltf.scene)) {
			adoptBake(mesh.geometry);
			mesh.material = material;
			mesh.receiveShadow = mesh.name === 'near';
			mesh.frustumCulled = false;
		}
		this.root.add(gltf.scene);
	}

	dispose(): void {
		for (const mesh of meshesOf(this.root)) mesh.geometry.dispose();
	}
}
