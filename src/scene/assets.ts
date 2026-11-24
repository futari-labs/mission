import type * as THREE from 'three';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import { type GLTF, GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

const loader = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);

/** Loads a GLB and retries once, because a single dropped request should not cost the scene. */
export async function loadGlb(url: string): Promise<GLTF> {
	try {
		return await loader.loadAsync(url);
	} catch {
		return await loader.loadAsync(url);
	}
}

export function meshesOf(root: THREE.Object3D): THREE.Mesh[] {
	const out: THREE.Mesh[] = [];
	root.traverse((o) => {
		if ((o as THREE.Mesh).isMesh) out.push(o as THREE.Mesh);
	});
	return out;
}
