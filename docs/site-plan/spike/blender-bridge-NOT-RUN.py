# Throwaway feasibility spike: deterministic Blender script -> segmented cantilever bridge,
# high-poly displacement, baked normal + AO atlas, GLB export. Not production code.
# Usage: Blender -b --factory-startup -P bridge_spike.py -- <out_dir> [texture_size]
import bpy, bmesh, math, random, sys, time, os, json
from mathutils import Vector, noise

argv = sys.argv[sys.argv.index('--') + 1:]
OUT = argv[0]
TEX = int(argv[1]) if len(argv) > 1 else 2048
os.makedirs(OUT, exist_ok=True)
T_START = time.time()
timings = {}

bpy.ops.wm.read_factory_settings(use_empty=True)
scene = bpy.context.scene
world = bpy.data.worlds.new('w'); scene.world = world
rng = random.Random(7)

SPAN_HALF, GAP, DEPTH, T0, SPRING = 6.0, 0.16, 2.6, 0.26, 1.7
JOINT = 0.022  # half-width of a joint gap, metres


def top(t):
    return 3.45 + 1.35 * (t ** 1.4)


def bot(t):
    u = max(0.0, (t - T0) / (1 - T0))
    return SPRING + (3.95 - SPRING) * math.sin(math.pi / 2 * u) ** 0.8


def xt(t):  # left half, x runs from -SPAN_HALF to -GAP/2
    return -(SPAN_HALF - t * (SPAN_HALF - GAP / 2))


def prism(name, poly, depth, y_off, side):
    """Extrude a closed (x, z) polygon along y. side=-1 mirrors to the right half."""
    bm = bmesh.new()
    y0, y1 = y_off - depth / 2, y_off + depth / 2
    a = [bm.verts.new((x if side > 0 else -x, y0, z)) for x, z in poly]
    b = [bm.verts.new((x if side > 0 else -x, y1, z)) for x, z in poly]
    bm.faces.new(a); bm.faces.new(list(reversed(b)))
    n = len(poly)
    for i in range(n):
        bm.faces.new((a[i], b[i], b[(i + 1) % n], a[(i + 1) % n]))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces[:])
    me = bpy.data.meshes.new(name); bm.to_mesh(me); bm.free()
    ob = bpy.data.objects.new(name, me); scene.collection.objects.link(ob)
    return ob


def half(side, arm_u, pier_courses, seed):
    r = random.Random(seed)
    blocks = []
    x_in = xt(T0)
    # pier: battered outer face, horizontal courses, one course split by a vertical joint
    z_top0, z_topi = top(0.0), top(T0)
    def x_out(z):
        return -SPAN_HALF - 0.6 * (1 - z / z_top0)
    zs = [0.0] + pier_courses
    for i in range(len(zs)):
        z0 = zs[i] + (JOINT if i else 0.0)
        last = i == len(zs) - 1
        z1 = None if last else zs[i + 1] - JOINT
        splits = [None]
        if i == 1:
            splits = [x_out(z0) + (x_in - x_out(z0)) * r.uniform(0.42, 0.58)]
        edges = [x_out, *([lambda z, s=s: s for s in splits if s is not None]), lambda z: x_in]
        for k in range(len(edges) - 1):
            l, rr = edges[k], edges[k + 1]
            jl = JOINT if k else 0.0
            jr = JOINT if k < len(edges) - 2 else 0.0
            if last:
                tl = max(0.0, (l(z_top0) + jl - xt(0)) / (xt(T0) - xt(0)))
                tr = min(T0, (rr(z_topi) - jr - xt(0)) / (xt(T0) - xt(0)))
                poly = [(l(z0) + jl, z0), (rr(z0) - jr, z0), (rr(z0) - jr, top(tr)), (l(z_top0) + jl, top(tl))]
            else:
                poly = [(l(z0) + jl, z0), (rr(z0) - jr, z0), (rr(z1) - jr, z1), (l(z1) + jl, z1)]
            blocks.append((poly, DEPTH + 0.5 + r.uniform(-0.08, 0.08), r.uniform(-0.04, 0.04)))
    # arm: voussoir-like blocks between leaning joints
    js = [0.0] + [u + r.uniform(-0.025, 0.025) for u in arm_u] + [1.0]
    dt = JOINT / (SPAN_HALF * (1 - T0))
    for i in range(len(js) - 1):
        ua, ub = js[i], js[i + 1]
        la = 0.045 * math.sin(math.pi * ua); lb = 0.045 * math.sin(math.pi * ub)
        def T(u):
            return T0 + u * (1 - T0)
        ta_top, tb_top = T(ua + la) + (dt if i else 0), T(ub + lb) - (dt if i < len(js) - 2 else 0)
        ta_bot, tb_bot = T(ua - la) + (dt if i else 0), T(ub - lb) - (dt if i < len(js) - 2 else 0)
        step = r.uniform(-0.05, 0.07)  # controlled irregularity along the top line
        N = 5
        tops = [(xt(ta_top + (tb_top - ta_top) * k / N), top(ta_top + (tb_top - ta_top) * k / N) + step) for k in range(N + 1)]
        bots = [(xt(tb_bot + (ta_bot - tb_bot) * k / N), bot(tb_bot + (ta_bot - tb_bot) * k / N)) for k in range(N + 1)]
        taper = 1.0 - 0.32 * ((ua + ub) / 2)  # arm narrows in depth toward the seam
        blocks.append((bots + tops, (DEPTH + r.uniform(-0.1, 0.1)) * taper, r.uniform(-0.05, 0.05)))
    obs = []
    for i, (poly, depth, yo) in enumerate(blocks):
        obs.append(prism(f"{'L' if side > 0 else 'R'}{i:02d}", poly, depth, yo, side))
    return obs


t = time.time()
lows = half(+1, [0.2, 0.42, 0.63, 0.83], [1.3, 2.5], 11) + half(-1, [0.27, 0.53, 0.79], [1.75], 23)
dg = bpy.context.evaluated_depsgraph_get()


def realize(ob, mods):
    for kind, cfg in mods:
        m = ob.modifiers.new(kind, kind)
        for k, v in cfg.items():
            setattr(m, k, v)
    dg.update()
    me = bpy.data.meshes.new_from_object(ob.evaluated_get(dg))
    ob.modifiers.clear()
    return me


clouds = bpy.data.textures.new('fine', 'CLOUDS'); clouds.noise_scale = 0.09; clouds.noise_depth = 4
broad = bpy.data.textures.new('broad', 'CLOUDS'); broad.noise_scale = 0.9; broad.noise_depth = 2
chip = bpy.data.textures.new('chip', 'VORONOI'); chip.noise_scale = 0.35; chip.distance_metric = 'DISTANCE'

low_meshes, high_meshes = [], []
for ob in lows:
    bevel = ('BEVEL', dict(width=0.07, segments=3, limit_method='ANGLE', angle_limit=math.radians(38)))
    low_meshes.append(realize(ob, [bevel]))
    high_meshes.append(realize(ob, [
        bevel,
        ('REMESH', dict(mode='VOXEL', voxel_size=0.022)),
        ('DISPLACE', dict(texture=broad, strength=0.10, mid_level=0.5, texture_coords='GLOBAL')),
        ('DISPLACE', dict(texture=chip, strength=-0.05, mid_level=0.25, texture_coords='GLOBAL')),
        ('DISPLACE', dict(texture=clouds, strength=0.035, mid_level=0.5, texture_coords='GLOBAL')),
    ]))
for ob in lows:
    bpy.data.objects.remove(ob)
timings['model_s'] = round(time.time() - t, 2)


def joined(name, meshes):
    bm = bmesh.new()
    for me in meshes:
        bm.from_mesh(me)
    me = bpy.data.meshes.new(name); bm.to_mesh(me); bm.free()
    ob = bpy.data.objects.new(name, me); scene.collection.objects.link(ob)
    return ob


low = joined('bridge_low', low_meshes)
high = joined('bridge_high', high_meshes)
for p in low.data.polygons: p.use_smooth = True
low.data.set_sharp_from_angle(angle=math.radians(40))
for p in high.data.polygons: p.use_smooth = True

# ground occluder so the bake carries contact shading
gm = bpy.data.meshes.new('occ'); bm = bmesh.new()
bmesh.ops.create_grid(bm, x_segments=1, y_segments=1, size=40); bm.to_mesh(gm); bm.free()
ground = bpy.data.objects.new('occ', gm); scene.collection.objects.link(ground)


def activate(ob, others=()):
    for o in scene.collection.objects: o.select_set(False)
    for o in others: o.select_set(True)
    ob.select_set(True); bpy.context.view_layer.objects.active = ob


t = time.time()
activate(low)
bpy.ops.object.mode_set(mode='EDIT')
bpy.ops.mesh.select_all(action='SELECT')
bpy.ops.uv.smart_project(angle_limit=math.radians(60), island_margin=0.003)
bpy.ops.object.mode_set(mode='OBJECT')
timings['uv_s'] = round(time.time() - t, 2)

mat = bpy.data.materials.new('bake'); mat.use_nodes = True
low.data.materials.append(mat)
node = mat.node_tree.nodes.new('ShaderNodeTexImage')
mat.node_tree.nodes.active = node
scene.render.engine = 'CYCLES'
scene.cycles.device = 'CPU'
scene.cycles.samples = 48
scene.render.bake.use_selected_to_active = True
scene.render.bake.cage_extrusion = 0.06
scene.render.bake.max_ray_distance = 0.16
scene.render.bake.margin = 8
world.light_settings.distance = 2.5

for kind, fname in (('NORMAL', 'bridge_normal.png'), ('AO', 'bridge_ao.png')):
    t = time.time()
    img = bpy.data.images.new(fname, TEX, TEX, alpha=False)
    img.colorspace_settings.name = 'Non-Color'
    node.image = img
    activate(low, [high])
    bpy.ops.object.bake(type=kind)
    img.filepath_raw = os.path.join(OUT, fname); img.file_format = 'PNG'; img.save()
    timings[f'bake_{kind.lower()}_s'] = round(time.time() - t, 2)

# split back into one object per block, pivot at each block's centre, stable names
bpy.data.objects.remove(high); bpy.data.objects.remove(ground)
activate(low)
bpy.ops.object.mode_set(mode='EDIT'); bpy.ops.mesh.select_all(action='SELECT')
bpy.ops.mesh.separate(type='LOOSE'); bpy.ops.object.mode_set(mode='OBJECT')
parts = [o for o in scene.collection.objects if o.type == 'MESH']
for o in parts:
    o.data.materials.clear()
    activate(o); bpy.ops.object.origin_set(type='ORIGIN_GEOMETRY', center='BOUNDS')
parts.sort(key=lambda o: (round(o.location.x, 3), round(o.location.z, 3)))
for i, o in enumerate(parts):
    o.name = f'block_{i:02d}'; o.data.name = o.name
for o in scene.collection.objects: o.select_set(True)
bpy.ops.export_scene.gltf(filepath=os.path.join(OUT, 'bridge.glb'), export_format='GLB', use_selection=True,
                          export_materials='NONE', export_yup=True, export_apply=True)
tri = sum(len(p.vertices) - 2 for o in parts for p in o.data.polygons)
for o in parts: bpy.data.objects.remove(o)

# terrain: ridged heightfield with a calm platform under the bridge
t = time.time()
N, SIZE = 220, 150.0
bm = bmesh.new(); bmesh.ops.create_grid(bm, x_segments=N, y_segments=N, size=SIZE / 2)
for v in bm.verts:
    x, y = v.co.x, v.co.y
    d = math.hypot(x * 0.8, y)
    far = min(1.0, max(0.0, (d - 9.0) / 40.0)) ** 1.5
    ridged = noise.ridged_multi_fractal(Vector((x * 0.02 + 3.1, y * 0.02 - 1.7, 0.0)), 1.0, 2.1, 6, 1.0, 2.0)
    rolling = noise.fractal(Vector((x * 0.06, y * 0.06, 4.2)), 1.0, 2.0, 4)
    mound = 0.5 * math.exp(-(d / 9.0) ** 2) - 0.5
    v.co.z = mound + far * (ridged * 9.0 - 3.0) + (0.25 + 1.2 * far) * rolling
me = bpy.data.meshes.new('terrain'); bm.to_mesh(me); bm.free()
for p in me.polygons: p.use_smooth = True
terrain = bpy.data.objects.new('terrain', me); scene.collection.objects.link(terrain)
activate(terrain)
bpy.ops.export_scene.gltf(filepath=os.path.join(OUT, 'terrain.glb'), export_format='GLB', use_selection=True,
                          export_materials='NONE', export_yup=True)
timings['terrain_s'] = round(time.time() - t, 2)

timings['total_s'] = round(time.time() - T_START, 2)
stats = dict(blender=bpy.app.version_string, blocks=len(parts), low_tris=tri,
             high_polys=sum(len(m.polygons) for m in high_meshes), texture=TEX, timings=timings)
json.dump(stats, open(os.path.join(OUT, 'stats.json'), 'w'), indent=2)
print('SPIKE_STATS', json.dumps(stats))
