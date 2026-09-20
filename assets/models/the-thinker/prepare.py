import argparse
import trimesh,numpy as np,json
from pathlib import Path
parser=argparse.ArgumentParser(description='Prepare the CC BY-SA Scan the World Thinker mesh.')
parser.add_argument('input',type=Path)
parser.add_argument('output',type=Path)
args=parser.parse_args()
m=trimesh.load(args.input)
m=m.simplify_quadric_decimation(face_count=120000)
m.apply_transform(trimesh.transformations.rotation_matrix(-np.pi/2,[1,0,0]))
b=m.bounds;m.apply_translation([-m.centroid[0],-b[0,1],-(b[0,2]+b[1,2])/2])
m.apply_scale(1/(b[1,1]-b[0,1]))
# Bronze finish is applied by the website; original scan has geometry only.
m.visual=trimesh.visual.ColorVisuals(m,vertex_colors=[255,255,255,255])
def metadata(tree):
 tree['asset']['copyright']='The Thinker by Auguste Rodin; scan by Scan the World, CC BY-SA 4.0. Mesh simplified and reoriented.'
 tree['asset']['extras']={'license':'https://creativecommons.org/licenses/by-sa/4.0/','source':'https://commons.wikimedia.org/wiki/File:Scan_the_World_-_The_Thinker_(Auguste_Rodin).stl','original_sha1':'486307df3882858a36cbb5812beaf5f881b800c7'}
out=args.output
out.parent.mkdir(parents=True,exist_ok=True)
out.write_bytes(trimesh.exchange.gltf.export_glb(m,include_normals=True,tree_postprocessor=metadata))
print(json.dumps({'faces':len(m.faces),'vertices':len(m.vertices),'bytes':out.stat().st_size,'bounds':m.bounds.tolist()}))
