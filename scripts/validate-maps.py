#!/usr/bin/env python3
"""Validate map inventory, schema, asset IDs, bounds, and basic spawn safety."""

import json
import math
import os
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
MAPS_DIR = os.path.join(ROOT, "maps")
REGISTRY_PATH = os.path.join(ROOT, "data", "asset-registry.json")
MANIFEST_PATH = os.path.join(ROOT, "data", "map-manifest.json")
PLAYER_WIDTH = 24
PLAYER_HEIGHT = 32
ENEMY_SIZE = 32
EQUIPMENT_KINDS = {
    "flying_boots",
    "high_jump_boots",
    "shield",
    "magnet",
    "healing",
    "bomb",
}
ITEM_KINDS = {"coin", "gem", "bomb"}
WEATHER_TYPES = {"sunny", "rain", "wind", "storm"}
SUPPORTED_MECHANICS = {
    "walk", "jump", "double-jump", "wall-slide", "wall-jump", "gap", "hazard",
    "exit", "collect", "enemy", "stomp", "bomb", "water", "lava", "sunny",
    "rain", "wind", "storm", "flying_boots", "high_jump_boots", "shield",
    "magnet", "healing",
}


def is_number(value):
    return isinstance(value, (int, float)) and not isinstance(value, bool) and math.isfinite(value)


def overlaps(first, second):
    return (
        first["x"] < second["x"] + second["width"]
        and first["x"] + first["width"] > second["x"]
        and first["y"] < second["y"] + second["height"]
        and first["y"] + first["height"] > second["y"]
    )


def read_json(path, label, errors):
    try:
        with open(path, encoding="utf-8") as source:
            return json.load(source)
    except (OSError, json.JSONDecodeError) as error:
        errors.append(f"{label}: cannot read JSON: {error}")
        return None


def object_rect(map_id, label, obj, width, height, bounds, errors, hitbox=False):
    if not isinstance(obj, dict):
        errors.append(f"{map_id}: {label} must be an object.")
        return None
    x, y = obj.get("x"), obj.get("y")
    if not is_number(x) or not is_number(y):
        errors.append(f"{map_id}: {label} has invalid coordinates.")
        return None
    if hitbox:
        shape = obj.get("hitbox")
        if not isinstance(shape, dict):
            errors.append(f"{map_id}: {label} has no hitbox.")
            return None
        ox, oy = shape.get("offsetX"), shape.get("offsetY")
        width, height = shape.get("width"), shape.get("height")
        if not all(is_number(value) for value in (ox, oy, width, height)) or width <= 0 or height <= 0:
            errors.append(f"{map_id}: {label} has invalid hitbox dimensions.")
            return None
        x += ox
        y += oy
    elif width is None or height is None:
        width, height = obj.get("width"), obj.get("height")
    if not is_number(width) or not is_number(height) or width <= 0 or height <= 0:
        errors.append(f"{map_id}: {label} has invalid dimensions.")
        return None
    rect = {"x": x, "y": y, "width": width, "height": height}
    map_width, map_height = bounds
    if x < 0 or y < 0 or x + width > map_width or y + height > map_height:
        errors.append(
            f"{map_id}: {label} collision bounds ({x}, {y}, {width}, {height}) "
            f"outside map ({map_width}, {map_height})."
        )
    return rect


def validate_map(map_id, data, registry_ids, manifest_entry, errors):
    if not isinstance(data, dict):
        errors.append(f"{map_id}: map document must be an object.")
        return
    if data.get("id") != map_id:
        errors.append(f"{map_id}: document ID does not match directory.")
    if not isinstance(data.get("name"), str) or not data["name"].strip():
        errors.append(f"{map_id}: name must be a non-empty string.")
    if data.get("version") != 1:
        errors.append(f"{map_id}: unsupported or missing schema version.")

    tile = data.get("tileSize")
    dimensions = data.get("dimensions")
    if not is_number(tile) or tile <= 0:
        errors.append(f"{map_id}: tileSize must be a positive number.")
        return
    if not isinstance(dimensions, dict) or not all(
        is_number(dimensions.get(key)) and dimensions[key] > 0
        for key in ("width", "height")
    ):
        errors.append(f"{map_id}: dimensions must contain positive width and height.")
        return
    width, height = dimensions["width"], dimensions["height"]
    if width % tile or height % tile:
        errors.append(f"{map_id}: dimensions must align to tileSize.")

    if manifest_entry and data.get("name") != manifest_entry.get("name"):
        errors.append(f"{map_id}: map name does not match manifest.")
    background_id = data.get("backgroundAssetId")
    if background_id not in registry_ids:
        errors.append(f"{map_id}: unknown background asset {background_id!r}.")

    def get_list(field, required=False):
        value = data.get(field)
        if value is None and not required:
            return []
        if not isinstance(value, list):
            errors.append(f"{map_id}: {field} must be an array.")
            return []
        return value

    blocks = get_list("blocks", required=True)
    hazards = get_list("hazards", required=True)
    enemies = get_list("enemies")
    items = get_list("items")
    equipment = get_list("equipment")
    water_zones = get_list("waterZones")
    lava_zones = get_list("lavaZones")
    instance_ids = set()
    solids = []
    dangerous = []

    def check_instance(obj, label):
        if not isinstance(obj, dict):
            errors.append(f"{map_id}: {label} must be an object.")
            return
        instance_id = obj.get("instanceId")
        if not isinstance(instance_id, str) or not instance_id:
            errors.append(f"{map_id}: {label} has no instanceId.")
        elif instance_id in instance_ids:
            errors.append(f"{map_id}: duplicate instanceId {instance_id}.")
        else:
            instance_ids.add(instance_id)
        asset_id = obj.get("assetId")
        if asset_id is not None and asset_id not in registry_ids:
            errors.append(f"{map_id}: {label} references unknown asset {asset_id!r}.")

    for index, block in enumerate(blocks):
        label = f"block[{index}]"
        check_instance(block, label)
        rect = object_rect(map_id, label, block, tile, tile, (width, height), errors)
        if rect:
            solids.append(rect)
    for index, hazard in enumerate(hazards):
        label = f"hazard[{index}]"
        check_instance(hazard, label)
        rect = object_rect(map_id, label, hazard, None, None, (width, height), errors, hitbox=True)
        if rect:
            dangerous.append(rect)

    exit_obj = data.get("exit")
    check_instance(exit_obj, "exit")
    exit_rect = object_rect(map_id, "exit", exit_obj, None, None, (width, height), errors, hitbox=True)

    for index, enemy in enumerate(enemies):
        label = f"enemy[{index}]"
        check_instance(enemy, label)
        rect = object_rect(map_id, label, enemy, ENEMY_SIZE, ENEMY_SIZE, (width, height), errors)
        if rect:
            patrol = enemy.get("patrol")
            speed = enemy.get("speed")
            if not isinstance(patrol, dict) or not all(
                is_number(patrol.get(key)) for key in ("minX", "maxX")
            ):
                errors.append(f"{map_id}: {label} has invalid patrol bounds.")
            elif (
                patrol["minX"] < 0
                or patrol["maxX"] > width
                or patrol["minX"] >= patrol["maxX"]
                or enemy["x"] < patrol["minX"]
                or enemy["x"] + ENEMY_SIZE > patrol["maxX"]
            ):
                errors.append(f"{map_id}: {label} patrol bounds do not contain the enemy.")
            if not is_number(speed) or speed <= 0:
                errors.append(f"{map_id}: {label} speed must be positive.")
            object_rect(map_id, f"{label} hitbox", enemy, None, None, (width, height), errors, hitbox=True)

    for field, entries, allowed_kinds in (
        ("item", items, ITEM_KINDS),
        ("equipment", equipment, EQUIPMENT_KINDS),
    ):
        for index, item in enumerate(entries):
            label = f"{field}[{index}]"
            check_instance(item, label)
            if item.get("kind") not in allowed_kinds:
                errors.append(f"{map_id}: {label} has unsupported kind {item.get('kind')!r}.")
            object_rect(map_id, label, item, None, None, (width, height), errors, hitbox=True)

    for field, zones in (("waterZones", water_zones), ("lavaZones", lava_zones)):
        for index, zone in enumerate(zones):
            label = f"{field}[{index}]"
            check_instance(zone, label)
            object_rect(map_id, label, zone, None, None, (width, height), errors)
            if field == "waterZones":
                if (
                    not is_number(zone.get("moveFactor"))
                    or zone["moveFactor"] <= 0
                    or not is_number(zone.get("gravityFactor"))
                    or zone["gravityFactor"] < 0
                    or not isinstance(zone.get("sink"), bool)
                ):
                    errors.append(f"{map_id}: {label} has invalid water physics.")
            elif not is_number(zone.get("damagePerSecond")) or zone["damagePerSecond"] <= 0:
                errors.append(f"{map_id}: {label} must have positive damagePerSecond.")
            if field == "lavaZones":
                rect = object_rect(map_id, f"{label} hazard", zone, None, None, (width, height), errors)
                if rect:
                    dangerous.append(rect)

    spawn = data.get("spawn")
    spawn_rect = object_rect(
        map_id,
        "spawn",
        spawn,
        PLAYER_WIDTH,
        PLAYER_HEIGHT,
        (width, height),
        errors,
    )
    if spawn_rect:
        if any(overlaps(spawn_rect, rect) for rect in solids):
            errors.append(f"{map_id}: player spawn overlaps solid collision.")
        if any(overlaps(spawn_rect, rect) for rect in dangerous):
            errors.append(f"{map_id}: player spawn overlaps a hazard.")

    weather = data.get("weather")
    if weather is not None:
        if (
            not isinstance(weather, dict)
            or weather.get("type") not in WEATHER_TYPES
            or not is_number(weather.get("windX"))
            or not -1 <= weather["windX"] <= 1
            or not is_number(weather.get("particleDensity"))
            or not 0 <= weather["particleDensity"] <= 1
        ):
            errors.append(f"{map_id}: invalid weather configuration.")

    if manifest_entry:
        mechanics = manifest_entry.get("mechanics")
        if not isinstance(mechanics, list) or any(
            not isinstance(mechanic, str) or mechanic not in SUPPORTED_MECHANICS
            for mechanic in mechanics
        ):
            errors.append(f"{map_id}: manifest lists unsupported mechanics.")

    return exit_rect


def main():
    errors = []
    registry = read_json(REGISTRY_PATH, "asset registry", errors)
    manifest = read_json(MANIFEST_PATH, "map manifest", errors)
    if registry is None or manifest is None:
        return errors

    assets = registry.get("assets")
    if not isinstance(assets, list):
        errors.append("Asset registry must contain an assets array.")
        return errors
    registry_ids = {asset.get("id") for asset in assets if isinstance(asset, dict)}

    expected_ids = {f"MAP{index:06d}" for index in range(1, 101)}
    if not isinstance(manifest.get("maps"), list):
        errors.append("Map manifest must contain a maps array.")
        return errors
    manifest_entries = manifest["maps"]
    manifest_ids = [entry.get("id") for entry in manifest_entries if isinstance(entry, dict)]
    if len(manifest_entries) != 100 or manifest.get("totalMaps") != 100:
        errors.append(f"Manifest must declare exactly 100 maps; found {len(manifest_entries)}.")
    if len(set(manifest_ids)) != len(manifest_ids):
        errors.append("Map manifest contains duplicate IDs.")
    if set(manifest_ids) != expected_ids:
        errors.append("Map manifest IDs must be MAP000001 through MAP000100.")
    manifest_by_id = {
        entry.get("id"): entry for entry in manifest_entries if isinstance(entry, dict)
    }

    found_ids = set()
    for map_id in sorted(expected_ids):
        path = os.path.join(MAPS_DIR, map_id, "map.json")
        if not os.path.isfile(path):
            errors.append(f"{map_id}: map.json is missing.")
            continue
        found_ids.add(map_id)
        data = read_json(path, map_id, errors)
        if data is not None:
            validate_map(map_id, data, registry_ids, manifest_by_id.get(map_id), errors)

    print("=== MAP VALIDATION ===")
    print(f"Map files: {len(found_ids)}/100")
    print(f"Manifest entries: {len(manifest_entries)}/100")
    print(f"Errors: {len(errors)}")
    for error in errors:
        print(f"  ERROR: {error}")
    print("VALIDATOR: " + ("FAILED" if errors else "PASSED"))
    return errors


if __name__ == "__main__":
    sys.exit(1 if main() else 0)
