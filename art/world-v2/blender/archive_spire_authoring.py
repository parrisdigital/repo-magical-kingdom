"""Offline-only Blender authoring scaffold for the original Archive Spire.

Run only in Blender background mode. This file intentionally imports no network,
HTTP, subprocess, or package-install modules. The deterministic Node fallback is
the Batch-1 shipping generator while Blender is unavailable in the workspace.
"""

import argparse
import json
import math
from pathlib import Path
import sys

import bpy


def parse_arguments() -> argparse.Namespace:
    separator = sys.argv.index("--") if "--" in sys.argv else len(sys.argv)
    parser = argparse.ArgumentParser()
    parser.add_argument("--recipe", required=True)
    parser.add_argument("--family", default="archive-spire")
    parser.add_argument("--output", required=True)
    parser.add_argument("--blend-output")
    return parser.parse_args(sys.argv[separator + 1 :])


def require_offline_background_mode(recipe_path: Path, output_path: Path) -> None:
    if not bpy.app.background:
        raise RuntimeError("Repository Worlds asset authoring must run in Blender background mode")
    if not recipe_path.is_file():
        raise RuntimeError("Recipe must be an existing local file")
    if output_path.suffix.lower() != ".glb":
        raise RuntimeError("Offline Blender output must be a local .glb file")
    output_path.parent.mkdir(parents=True, exist_ok=True)


def clear_scene() -> None:
    bpy.ops.object.select_all(action="SELECT")
    bpy.ops.object.delete(use_global=False)
    for data_collection in (bpy.data.meshes, bpy.data.curves, bpy.data.materials):
        for block in list(data_collection):
            if block.users == 0:
                data_collection.remove(block)


def material(name: str, color: str, metallic: float, roughness: float, emission=False):
    value = color.lstrip("#")
    rgb = tuple(int(value[index : index + 2], 16) / 255 for index in (0, 2, 4))
    result = bpy.data.materials.new(name)
    result.diffuse_color = (*rgb, 1.0)
    result.use_nodes = True
    principled = result.node_tree.nodes.get("Principled BSDF")
    principled.inputs["Base Color"].default_value = (*rgb, 1.0)
    principled.inputs["Metallic"].default_value = metallic
    principled.inputs["Roughness"].default_value = roughness
    if emission:
        principled.inputs["Emission Color"].default_value = (*rgb, 1.0)
        principled.inputs["Emission Strength"].default_value = 2.2
    return result


def blender_location(game_location):
    """Map the shipping +Y-up/+Z-forward frame into Blender's +Z-up frame."""
    x, y, z = game_location
    return (x, -z, y)


def blender_scale(game_scale):
    x, y, z = game_scale
    return (x, z, y)


def add_cube(name: str, location, scale, assigned_material) -> bpy.types.Object:
    bpy.ops.mesh.primitive_cube_add(size=1, location=blender_location(location))
    result = bpy.context.object
    result.name = name
    # Recipe values are half-extents while Blender's size=1 cube dimensions are
    # equal to its scale, so convert half-extents to full dimensions first.
    result.scale = blender_scale(tuple(component * 2 for component in scale))
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    result.data.materials.append(assigned_material)
    return result


def build_archive_spire(recipe: dict) -> None:
    palette = recipe["palette"]
    stone = material("MAT_archive_stone", palette["stone"], 0.0, 0.82)
    timber = material("MAT_archive_timber", palette["timber"], 0.0, 0.7)
    roof = material("MAT_archive_roof", palette["roof"], 0.28, 0.42)
    beacon = material("MAT_archive_beacon", palette["beacon"], 0.0, 0.24, True)

    add_cube("GEO_foundation", (0, 0.4, 0), (4.8, 0.4, 4.8), stone)
    add_cube("GEO_step", (0, 1.0, 0), (4.2, 0.2, 4.2), stone)

    bpy.ops.mesh.primitive_cylinder_add(
        vertices=12,
        radius=3.1,
        depth=7.2,
        location=blender_location((0, 4.8, 0)),
    )
    tower = bpy.context.object
    tower.name = "GEO_archive_tower"
    tower.data.materials.append(stone)

    for index in range(4):
        angle = index * math.pi * 0.5
        x = math.sin(angle) * 3.45
        z = math.cos(angle) * 3.45
        beam = add_cube(f"GEO_timber_beam_{index:02d}", (x, 4.7, z), (0.18, 2.8, 0.18), timber)
        beam.rotation_euler[2] = -angle

    bpy.ops.mesh.primitive_cone_add(
        vertices=12,
        radius1=4.0,
        radius2=0.65,
        depth=3.2,
        location=blender_location((0, 9.9, 0)),
    )
    roof_object = bpy.context.object
    roof_object.name = "GEO_archive_roof"
    roof_object.data.materials.append(roof)

    bpy.ops.mesh.primitive_ico_sphere_add(
        subdivisions=2,
        radius=0.48,
        location=blender_location((0, 12.35, 0)),
    )
    orb = bpy.context.object
    orb.name = recipe["animation"]["targetNode"]
    orb.data.materials.append(beacon)
    orb.scale = (1, 1, 1)
    orb.keyframe_insert(data_path="scale", frame=1)
    peak = 1.0 + recipe["animation"]["amount"]
    orb.scale = (peak, peak, peak)
    orb.keyframe_insert(data_path="scale", frame=30)
    orb.scale = (1, 1, 1)
    orb.keyframe_insert(data_path="scale", frame=60)
    if orb.animation_data and orb.animation_data.action:
        orb.animation_data.action.name = recipe["animation"]["name"]

    collision = bpy.data.objects.new(recipe["collision"]["node"], None)
    collision.empty_display_type = "CUBE"
    collision.location = blender_location(recipe["collision"]["center"])
    collision.scale = blender_scale(recipe["collision"]["halfExtents"])
    collision["collisionProxy"] = True
    collision["collisionShape"] = recipe["collision"]["shape"]
    collision["halfExtents"] = recipe["collision"]["halfExtents"]
    bpy.context.collection.objects.link(collision)


def main() -> None:
    arguments = parse_arguments()
    recipe_path = Path(arguments.recipe).resolve()
    output_path = Path(arguments.output).resolve()
    require_offline_background_mode(recipe_path, output_path)
    batch_recipe = json.loads(recipe_path.read_text(encoding="utf-8"))
    if batch_recipe.get("schema") != "repository-worlds-v2/original-batch-recipe-v1":
        raise RuntimeError("Unsupported original batch recipe schema")
    recipe = next(
        (family for family in batch_recipe["families"] if family["id"] == arguments.family),
        None,
    )
    if recipe is None or recipe["id"] != "archive-spire":
        raise RuntimeError("This Blender proof scaffold authors only archive-spire")
    clear_scene()
    build_archive_spire(recipe)
    bpy.context.scene.render.fps = 25
    bpy.context.scene.frame_start = 1
    bpy.context.scene.frame_end = 60
    bpy.context.scene["repositoryWorldsSchema"] = batch_recipe["schema"]
    bpy.context.scene["originalAssetFamily"] = recipe["id"]
    bpy.context.scene["authoringBlenderVersion"] = bpy.app.version_string
    bpy.context.scene["networkInputs"] = 0
    if arguments.blend_output:
        blend_output = Path(arguments.blend_output).resolve()
        if blend_output.suffix.lower() != ".blend":
            raise RuntimeError("Blender authoring source must use a local .blend path")
        blend_output.parent.mkdir(parents=True, exist_ok=True)
        bpy.ops.wm.save_as_mainfile(filepath=str(blend_output), check_existing=False)
    bpy.ops.export_scene.gltf(
        filepath=str(output_path),
        export_format="GLB",
        export_animations=True,
        export_apply=True,
        export_extras=True,
        export_yup=True,
    )


if __name__ == "__main__":
    main()
