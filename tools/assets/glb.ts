// Writes meshes with baked vertex data to a quantized, meshopt-compressed GLB.
import { Document, NodeIO } from '@gltf-transform/core';
import { EXTMeshoptCompression, KHRMeshQuantization } from '@gltf-transform/extensions';
import { meshopt } from '@gltf-transform/functions';
import { MeshoptEncoder } from 'meshoptimizer';

export interface BakedMesh {
	name: string;
	positions: Float32Array;
	normals: Float32Array;
	/** RGBA bytes per vertex. The meaning of each channel is documented where the mesh is baked. */
	bake: Uint8Array;
	indices: Uint32Array;
	extras?: Record<string, unknown>;
}

export async function writeGlb(path: string, meshes: BakedMesh[], sceneExtras: Record<string, unknown> = {}): Promise<void> {
	const doc = new Document();
	const buffer = doc.createBuffer();
	const scene = doc.createScene('scene').setExtras(sceneExtras);
	for (const m of meshes) {
		const prim = doc
			.createPrimitive()
			.setAttribute('POSITION', doc.createAccessor().setType('VEC3').setArray(m.positions).setBuffer(buffer))
			.setAttribute('NORMAL', doc.createAccessor().setType('VEC3').setArray(m.normals).setBuffer(buffer))
			.setAttribute('COLOR_0', doc.createAccessor().setType('VEC4').setArray(m.bake).setNormalized(true).setBuffer(buffer))
			.setIndices(doc.createAccessor().setType('SCALAR').setArray(m.indices).setBuffer(buffer));
		const node = doc.createNode(m.name).setMesh(doc.createMesh(m.name).addPrimitive(prim));
		if (m.extras) node.setExtras(m.extras);
		scene.addChild(node);
	}
	await MeshoptEncoder.ready;
	await doc.transform(meshopt({ encoder: MeshoptEncoder, level: 'medium' }));
	const io = new NodeIO()
		.registerExtensions([EXTMeshoptCompression, KHRMeshQuantization])
		.registerDependencies({ 'meshopt.encoder': MeshoptEncoder });
	await io.write(path, doc);
}
