import * as THREE from 'three';
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

/**
 * The pixels of an image, for textures that are built from them and not uploaded as they are.
 * The file is decoded off the main thread into a bitmap, and the bitmap is copied out through a
 * canvas. Drawing an image element instead decodes it on the main thread and then reads it back
 * slowly: about 22 ms for the land textures against 3 ms this way, on a desktop.
 */
export async function loadPixels(url: string): Promise<{ data: Uint8ClampedArray<ArrayBuffer>; width: number; height: number }> {
	let image: ImageBitmap | HTMLImageElement | null = null;
	if (typeof createImageBitmap === 'function') {
		try {
			const response = await fetch(url);
			if (response.ok) image = await createImageBitmap(await response.blob());
		} catch {
			// the image element below is the second attempt
		}
	}
	image ??= await new THREE.ImageLoader().loadAsync(url);
	const { width, height } = image;
	const canvas = document.createElement('canvas');
	canvas.width = width;
	canvas.height = height;
	const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
	ctx.drawImage(image, 0, 0);
	if ('close' in image) image.close();
	return { data: ctx.getImageData(0, 0, width, height).data as Uint8ClampedArray<ArrayBuffer>, width, height };
}

export function meshesOf(root: THREE.Object3D): THREE.Mesh[] {
	const out: THREE.Mesh[] = [];
	root.traverse((o) => {
		if ((o as THREE.Mesh).isMesh) out.push(o as THREE.Mesh);
	});
	return out;
}
