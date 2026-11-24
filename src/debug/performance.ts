// The opt-in performance overlay. Loaded only for ?debug=performance.
import type { CreateDiagnostics } from './types.ts';

export const createDiagnostics: CreateDiagnostics = () => ({
	frameStart() {},
	renderStart() {},
	renderEnd() {},
	frameEnd() {},
	mark() {},
	dispose() {},
});
