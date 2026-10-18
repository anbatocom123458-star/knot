#!/usr/bin/env python3
"""KNOT — Giai đoạn 3 / PHẦN 3: thiết kế thủ công 100 map và xuất file maps/MAPnnnnnn/map.json.

Mỗi màn được thiết kế tay dưới dạng tọa độ ô (tile 32px), sau đó tuần tự xuất ra JSON.
Không dùng thuật toán sinh bố cục ngẫu nhiên. File này NỘI BỘ, không đi vào bản sản xuất.

Phân bố độ khó:
* MAP000001–MAP000010: hướng dẫn và làm quen.
* MAP000011–MAP000025: nhảy, hố và độ chính xác.
* MAP000026–MAP000040: wall slide, wall jump và quái.
* MAP000041–MAP000055: bom, vật phẩm và chướng ngại vật kết hợp.
* MAP000056–MAP000070: nước, dòng chảy và khu vực ngập.
* MAP000071–MAP000080: dung nham và platform nguy hiểm.
* MAP000081–MAP000090: thời tiết và điều kiện môi trường.
* MAP000091–MAP000100: thử thách tổng hợp nâng cao.
"""

import json
import os
import argparse
from copy import deepcopy

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
MAPS_DIR = os.path.join(ROOT, "maps")
TILE = 32
BG = "BG01"

TILE_LEFT, TILE_MID, TILE_RIGHT = "Z01", "Z02", "Z03"
VT_TOP, VT_MID, VT_BOT = "Z04", "Z05", "Z06"
SPIKE = "OB01"
DOOR = "IT01"
COIN, GEM, BOMB = "IT02", "IT03", "IT04"
SLIME = "EN01"
WATER_AMBIENT = "AUD_AMBIENT_WATER"  # placeholder, ghi trong ASSET_GAP.md

HITBOX_SPIKE = {"offsetX": 4, "offsetY": 12, "width": 24, "height": 18}
HITBOX_DOOR = {"offsetX": 4, "offsetY": 4, "width": 24, "height": 28}
HITBOX_ITEM = {"offsetX": 4, "offsetY": 4, "width": 24, "height": 24}
HITBOX_ENEMY = {"offsetX": 4, "offsetY": 14, "width": 24, "height": 18}
HITBOX_WATER = {"offsetX": 0, "offsetY": 0, "width": 32, "height": 32}
HITBOX_LAVA = {"offsetX": 0, "offsetY": 0, "width": 32, "height": 32}
HITBOX_EQUIP = {"offsetX": 4, "offsetY": 4, "width": 24, "height": 24}


def px(t): return t * TILE


def horizontal_ground(x0, x1, y_ty):
    blocks = []
    for i, tx in enumerate(range(x0, x1 + 1)):
        if x0 == x1:
            aid = TILE_MID
        elif i == 0:
            aid = TILE_LEFT
        elif i == x1 - x0:
            aid = TILE_RIGHT
        else:
            aid = TILE_MID
        blocks.append({"instanceId": f"tile_{tx:04d}_{y_ty:03d}",
                       "assetId": aid, "x": px(tx), "y": px(y_ty)})
    return blocks


def vertical_column(x_tx, y0, y1):
    blocks = []
    for i, ty in enumerate(range(y0, y1 + 1)):
        if y0 == y1:
            aid = VT_MID
        elif i == 0:
            aid = VT_TOP
        elif i == y1 - y0:
            aid = VT_BOT
        else:
            aid = VT_MID
        blocks.append({"instanceId": f"tile_{x_tx:04d}_{ty:03d}",
                       "assetId": aid, "x": px(x_tx), "y": px(ty)})
    return blocks


def hazard(tx, ty):
    return {"instanceId": f"spike_{tx:04d}_{ty:03d}", "assetId": SPIKE,
            "x": px(tx), "y": px(ty), "hitbox": deepcopy(HITBOX_SPIKE)}


def enemy(tx, ty, min_tx, max_tx, speed=60):
    return {"instanceId": f"enemy_{tx:04d}_{ty:03d}", "assetId": SLIME,
            "x": px(tx), "y": px(ty), "hitbox": deepcopy(HITBOX_ENEMY),
            "patrol": {"minX": px(min_tx), "maxX": px(max_tx)}, "speed": speed}


def item(tx, ty, kind):
    asset = {"coin": COIN, "gem": GEM, "bomb": BOMB}[kind]
    return {"instanceId": f"item_{kind}_{tx:04d}_{ty:03d}", "assetId": asset,
            "kind": kind, "x": px(tx), "y": px(ty), "hitbox": deepcopy(HITBOX_ITEM)}


def door(tx, ty):
    return {"instanceId": f"exit_{tx:04d}_{ty:03d}", "assetId": DOOR,
            "x": px(tx), "y": px(ty), "hitbox": deepcopy(HITBOX_DOOR)}


def water_zone(tx, ty, w_tiles, h_tiles, move_factor=0.4, gravity_factor=0.25, sink=True):
    return {"instanceId": f"water_{tx:04d}_{ty:03d}",
            "x": px(tx), "y": px(ty),
            "width": px(w_tiles), "height": px(h_tiles),
            "moveFactor": move_factor, "gravityFactor": gravity_factor, "sink": sink}


def lava_zone(tx, ty, w_tiles, h_tiles, dps=1.0):
    return {"instanceId": f"lava_{tx:04d}_{ty:03d}",
            "x": px(tx), "y": px(ty),
            "width": px(w_tiles), "height": px(h_tiles),
            "damagePerSecond": dps}


def equip(tx, ty, kind):
    return {"instanceId": f"eq_{kind}_{tx:04d}_{ty:03d}", "assetId": f"EQP_{kind.upper()}",
            "kind": kind, "x": px(tx), "y": px(ty),
            "width": TILE, "height": TILE,
            "hitbox": deepcopy(HITBOX_EQUIP)}


def weather_cfg(wtype, wind_x=0, density=0.5):
    return {"type": wtype, "windX": wind_x, "particleDensity": density}


MAPS = []

# ================= NHÓM 1: HƯỚNG DẪN (1-10) =================
# MAP000001 đã có sẵn trong repo, giữ nguyên.
MAPS.append({
    "id": "MAP000002", "name": "Second Step", "group": "tutorial", "difficulty": 1,
    "mechanics": ["walk", "jump"], "status": "available",
    "width": 30, "height": 18, "spawn": (2, 13),
    "ground": [(0, 20, 14)], "platforms": [(22, 24, 12), (26, 29, 14)],
    "hazards": [], "items": [(9, 12, "coin"), (23, 11, "coin")],
    "enemies": [], "door": (28, 13),
})
MAPS.append({
    "id": "MAP000003", "name": "Low Hops", "group": "tutorial", "difficulty": 1,
    "mechanics": ["jump", "double-jump"], "status": "available",
    "width": 28, "height": 18, "spawn": (2, 13),
    "ground": [(0, 4, 14)], "platforms": [(6, 7, 13), (9, 10, 13), (12, 13, 13),
                                         (16, 17, 12), (20, 22, 14), (25, 27, 14)],
    "hazards": [], "items": [(7, 12, "coin"), (13, 12, "coin"), (17, 11, "gem")],
    "enemies": [], "door": (26, 13),
})
MAPS.append({
    "id": "MAP000004", "name": "Spike Lesson", "group": "tutorial", "difficulty": 2,
    "mechanics": ["jump", "hazard"], "status": "available",
    "width": 32, "height": 18, "spawn": (2, 13),
    "ground": [(0, 6, 14), (11, 14, 14), (17, 31, 14)],
    "hazards": [(7, 13), (8, 13), (15, 13)],
    "items": [(12, 13, "coin"), (18, 13, "coin"), (24, 13, "gem")],
    "enemies": [], "door": (30, 13),
})
MAPS.append({
    "id": "MAP000005", "name": "First Door", "group": "tutorial", "difficulty": 2,
    "mechanics": ["jump", "hazard", "exit"], "status": "available",
    "width": 30, "height": 18, "spawn": (2, 13),
    "ground": [(0, 8, 14)], "platforms": [(10, 12, 13), (14, 15, 13), (17, 20, 14),
                                         (22, 24, 12), (26, 29, 14)],
    "hazards": [(13, 13), (16, 13), (21, 13), (25, 13)],
    "items": [(11, 12, "coin"), (15, 12, "coin"), (23, 11, "bomb")],
    "enemies": [], "door": (28, 13),
})
MAPS.append({
    "id": "MAP000006", "name": "Gap One", "group": "tutorial", "difficulty": 2,
    "mechanics": ["jump", "gap"], "status": "available",
    "width": 32, "height": 18, "spawn": (2, 13),
    "ground": [(0, 4, 14), (7, 9, 14), (12, 14, 14), (17, 19, 14), (22, 25, 14),
               (28, 31, 14)],
    "hazards": [], "items": [(8, 13, "coin"), (13, 13, "coin"), (23, 13, "coin")],
    "enemies": [], "door": (30, 13),
})
MAPS.append({
    "id": "MAP000007", "name": "Gap Two", "group": "tutorial", "difficulty": 2,
    "mechanics": ["jump", "gap"], "status": "available",
    "width": 34, "height": 18, "spawn": (2, 13),
    "ground": [(0, 5, 14), (9, 10, 14), (14, 15, 14), (19, 20, 14), (24, 25, 14),
               (29, 33, 14)],
    "hazards": [(6, 13), (11, 13), (16, 13), (21, 13), (26, 13)],
    "items": [(10, 13, "coin"), (15, 13, "coin"), (27, 13, "gem")],
    "enemies": [], "door": (32, 13),
})
MAPS.append({
    "id": "MAP000008", "name": "High Ledge", "group": "tutorial", "difficulty": 3,
    "mechanics": ["double-jump", "gap"], "status": "available",
    "width": 30, "height": 18, "spawn": (2, 13),
    "ground": [(0, 6, 14)], "platforms": [(9, 10, 11), (13, 14, 10), (17, 18, 12),
                                          (21, 22, 13), (25, 29, 14)],
    "hazards": [(7, 13), (11, 12), (15, 11), (19, 12), (23, 12)],
    "items": [(10, 10, "coin"), (14, 9, "coin"), (18, 11, "gem"), (23, 12, "coin")],
    "enemies": [], "door": (27, 13),
})
MAPS.append({
    "id": "MAP000009", "name": "Falling Coins", "group": "tutorial", "difficulty": 3,
    "mechanics": ["jump", "collect"], "status": "available",
    "width": 32, "height": 18, "spawn": (2, 13),
    "ground": [(0, 30, 14)],
    "hazards": [(6, 13), (12, 13), (18, 13), (24, 13)],
    "items": [(5, 11, "coin"), (8, 9, "coin"), (11, 7, "coin"), (14, 9, "coin"),
              (17, 11, "coin"), (19, 11, "gem"), (21, 11, "coin"), (25, 11, "coin")],
    "enemies": [], "door": (30, 13),
})
MAPS.append({
    "id": "MAP000010", "name": "Narrow Bridge", "group": "tutorial", "difficulty": 3,
    "mechanics": ["walk", "gap"], "status": "available",
    "width": 30, "height": 18, "spawn": (2, 13),
    "ground": [(0, 3, 14), (6, 7, 14), (10, 11, 14), (14, 15, 14),
               (18, 19, 14), (22, 23, 14), (26, 29, 14)],
    "hazards": [(4, 13), (8, 13), (12, 13), (16, 13), (20, 13), (24, 13)],
    "items": [(7, 13, "coin"), (11, 13, "coin"), (15, 13, "coin"), (19, 13, "gem")],
    "enemies": [], "door": (28, 13),
})

# ================= NHÓM 2: NHẢY, HỘP, ĐỘ CHÍNH XÁC (11-25) =================
MAPS.append({
    "id": "MAP000011", "name": "Spike Corridor", "group": "precision", "difficulty": 3,
    "mechanics": ["jump", "hazard"], "status": "available",
    "width": 32, "height": 18, "spawn": (2, 13),
    "ground": [(0, 8, 14)], "platforms": [(10, 11, 12), (13, 14, 12), (16, 17, 12),
                                          (19, 22, 14), (25, 31, 14)],
    "hazards": [(9, 13), (12, 13), (15, 13), (18, 13), (21, 13), (23, 13), (24, 13)],
    "items": [(11, 11, "coin"), (14, 11, "coin"), (18, 13, "bomb"), (24, 13, "gem")],
    "enemies": [], "door": (30, 13),
})
MAPS.append({
    "id": "MAP000012", "name": "Double Trouble", "group": "precision", "difficulty": 4,
    "mechanics": ["double-jump", "gap"], "status": "available",
    "width": 34, "height": 18, "spawn": (2, 13),
    "ground": [(0, 4, 14)], "platforms": [(7, 8, 11), (11, 12, 9), (15, 16, 11),
                                          (19, 20, 13), (23, 24, 11), (27, 33, 14)],
    "hazards": [(5, 13), (9, 12), (13, 12), (17, 12), (21, 12), (25, 12)],
    "items": [(8, 10, "coin"), (13, 8, "coin"), (16, 10, "coin"), (20, 12, "gem")],
    "enemies": [], "door": (31, 13),
})
MAPS.append({
    "id": "MAP000013", "name": "Sky Coins", "group": "precision", "difficulty": 4,
    "mechanics": ["double-jump", "collect"], "status": "available",
    "width": 32, "height": 18, "spawn": (2, 13),
    "ground": [(0, 4, 14), (28, 31, 14)], "platforms": [(7, 8, 9), (11, 12, 7),
                                                        (15, 16, 9), (19, 20, 11),
                                                        (24, 25, 9), (26, 26, 13)],
    "hazards": [(5, 13), (9, 12), (13, 12), (17, 12), (21, 12), (22, 12)],
    "items": [(7, 8, "coin"), (10, 6, "coin"), (14, 6, "coin"), (17, 6, "coin"),
              (20, 8, "coin"), (23, 8, "gem"), (25, 8, "coin")],
    "enemies": [], "door": (27, 12),
})
MAPS.append({
    "id": "MAP000014", "name": "Pit Chain", "group": "precision", "difficulty": 4,
    "mechanics": ["jump", "gap"], "status": "available",
    "width": 34, "height": 18, "spawn": (2, 13),
    "ground": [(0, 2, 14), (5, 6, 14), (9, 10, 14), (13, 14, 14), (17, 18, 14),
               (21, 22, 14), (25, 26, 14), (29, 33, 14)],
    "hazards": [(3, 13), (7, 13), (11, 13), (15, 13), (19, 13), (23, 13), (27, 13)],
    "items": [(4, 13, "coin"), (8, 13, "coin"), (12, 13, "coin"), (16, 13, "coin"),
              (20, 13, "gem"), (24, 13, "coin"), (28, 13, "coin")],
    "enemies": [], "door": (32, 13),
})
MAPS.append({
    "id": "MAP000015", "name": "Precision Gate", "group": "precision", "difficulty": 5,
    "mechanics": ["double-jump", "hazard", "exit"], "status": "available",
    "width": 32, "height": 18, "spawn": (2, 13),
    "ground": [(0, 5, 14)], "platforms": [(8, 9, 11), (12, 13, 9), (16, 17, 11),
                                          (20, 21, 13), (24, 27, 14)],
    "hazards": [(6, 13), (10, 12), (14, 12), (18, 12), (22, 12), (23, 13)],
    "items": [(9, 10, "coin"), (13, 8, "coin"), (17, 10, "gem"), (21, 12, "coin")],
    "enemies": [], "door": (29, 13),
})
MAPS.append({
    "id": "MAP000016", "name": "Wall Touch", "group": "wall", "difficulty": 3,
    "mechanics": ["wall-slide"], "status": "available",
    "width": 20, "height": 18, "spawn": (4, 8),
    "ground": [(0, 14, 17)], "platforms": [(2, 9, 9)],
    "walls": [(17, 4, 17)],
    "hazards": [], "items": [(8, 5, "coin"), (10, 6, "gem")],
    "enemies": [], "door": (15, 3),
})
MAPS.append({
    "id": "MAP000017", "name": "First Wall Jump", "group": "wall", "difficulty": 3,
    "mechanics": ["wall-slide", "wall-jump"], "status": "available",
    "width": 22, "height": 18, "spawn": (3, 13),
    "ground": [(0, 6, 14), (16, 21, 14)], "walls": [(8, 4, 17), (13, 4, 17)],
    "hazards": [], "items": [(10, 3, "gem")],
    "enemies": [(10, 12, 8, 16, 40)], "door": (20, 13),
})
MAPS.append({
    "id": "MAP000018", "name": "Wall Column", "group": "wall", "difficulty": 4,
    "mechanics": ["wall-slide", "wall-jump"], "status": "available",
    "width": 16, "height": 20, "spawn": (4, 15),
    "ground": [(0, 3, 19)], "walls": [(7, 4, 18), (11, 4, 18)],
    "hazards": [(9, 17)], "items": [(9, 5, "coin"), (9, 8, "coin")],
    "enemies": [], "door": (8, 3),
})
MAPS.append({
    "id": "MAP000019", "name": "Chimney Up", "group": "wall", "difficulty": 4,
    "mechanics": ["wall-jump", "double-jump"], "status": "available",
    "width": 18, "height": 20, "spawn": (4, 16),
    "ground": [(0, 5, 19)], "walls": [(6, 5, 18), (12, 5, 18)],
    "platforms": [(9, 12, 14)], "hazards": [(9, 17)],
    "items": [(9, 11, "gem")],
    "enemies": [], "door": (11, 4),
})
MAPS.append({
    "id": "MAP000020", "name": "Slide Down", "group": "wall", "difficulty": 4,
    "mechanics": ["wall-slide", "hazard"], "status": "available",
    "width": 18, "height": 18, "spawn": (4, 2),
    "ground": [(2, 5, 17)], "walls": [(8, 2, 17)],
    "hazards": [(3, 16), (5, 16), (7, 16), (9, 16), (11, 16), (13, 16), (15, 16)],
    "items": [(6, 5, "coin")],
    "enemies": [], "door": (5, 16),
})
MAPS.append({
    "id": "MAP000021", "name": "Twin Walls", "group": "wall", "difficulty": 5,
    "mechanics": ["wall-jump"], "status": "available",
    "width": 16, "height": 20, "spawn": (4, 16),
    "ground": [(0, 3, 19)], "walls": [(6, 3, 18), (10, 3, 18)],
    "platforms": [(8, 12, 14)],
    "hazards": [(7, 17)], "items": [(8, 4, "gem"), (8, 9, "coin")],
    "enemies": [], "door": (8, 3),
})
MAPS.append({
    "id": "MAP000022", "name": "Wall Gap", "group": "wall", "difficulty": 5,
    "mechanics": ["wall-jump", "gap"], "status": "available",
    "width": 24, "height": 18, "spawn": (3, 13),
    "ground": [(0, 4, 14), (10, 11, 14), (14, 15, 12), (19, 23, 14)],
    "walls": [(12, 10, 13)],
    "hazards": [(5, 13), (13, 13), (17, 13)],
    "items": [(11, 11, "coin"), (15, 11, "gem"), (21, 13, "coin")],
    "enemies": [], "door": (22, 13),
})
MAPS.append({
    "id": "MAP000023", "name": "High Chimney", "group": "wall", "difficulty": 5,
    "mechanics": ["wall-jump", "collect"], "status": "available",
    "width": 18, "height": 22, "spawn": (4, 18),
    "ground": [(0, 4, 21)], "walls": [(6, 4, 20), (12, 4, 20)],
    "platforms": [(9, 14, 17)],
    "hazards": [(9, 19)], "items": [(9, 7, "coin"), (9, 11, "coin"), (9, 15, "gem")],
    "enemies": [], "door": (12, 4),
})
MAPS.append({
    "id": "MAP000024", "name": "Wall Gauntlet", "group": "wall", "difficulty": 6,
    "mechanics": ["wall-slide", "wall-jump", "hazard"], "status": "available",
    "width": 20, "height": 20, "spawn": (4, 16),
    "ground": [(0, 4, 19)], "walls": [(8, 4, 19), (14, 4, 19)],
    "platforms": [(10, 12, 16)],
    "hazards": [(4, 18), (6, 18), (12, 17), (16, 18), (18, 18)],
    "items": [(11, 6, "coin"), (11, 10, "gem")],
    "enemies": [(9, 14, 7, 13, 50)], "door": (13, 4),
})
MAPS.append({
    "id": "MAP000025", "name": "Wall Gate", "group": "wall", "difficulty": 6,
    "mechanics": ["wall-jump", "exit"], "status": "available",
    "width": 20, "height": 20, "spawn": (4, 16),
    "ground": [(0, 4, 19)], "walls": [(8, 4, 19), (13, 4, 19)],
    "platforms": [(10, 10, 16)],
    "hazards": [(4, 18), (6, 18), (14, 18), (16, 18)],
    "items": [(10, 8, "bomb"), (12, 5, "gem")],
    "enemies": [], "door": (14, 4),
})

# ================= NHÓM 3: QUÁI VÀ BOM (26-40) =================
MAPS.append({
    "id": "MAP000026", "name": "First Slime", "group": "enemies", "difficulty": 3,
    "mechanics": ["enemy", "stomp"], "status": "available",
    "width": 30, "height": 18, "spawn": (2, 13),
    "ground": [(0, 26, 14)],
    "hazards": [(14, 13)], "items": [(7, 13, "coin"), (21, 13, "coin")],
    "enemies": [(10, 12, 6, 16, 50)], "door": (28, 13),
})
MAPS.append({
    "id": "MAP000027", "name": "Patrol Watch", "group": "enemies", "difficulty": 4,
    "mechanics": ["enemy", "stomp"], "status": "available",
    "width": 32, "height": 18, "spawn": (2, 13),
    "ground": [(0, 10, 14)], "platforms": [(13, 15, 12), (18, 22, 14)],
    "hazards": [(11, 13)], "items": [(7, 13, "coin"), (14, 11, "coin"),
                                    (19, 13, "coin"), (23, 13, "gem")],
    "enemies": [(12, 12, 8, 14, 55), (20, 12, 17, 23, 55)], "door": (25, 13),
})
MAPS.append({
    "id": "MAP000028", "name": "Stomp Chain", "group": "enemies", "difficulty": 4,
    "mechanics": ["enemy", "stomp", "collect"], "status": "available",
    "width": 34, "height": 18, "spawn": (2, 13),
    "ground": [(0, 4, 14)], "platforms": [(7, 8, 10), (11, 12, 10), (15, 16, 10),
                                          (19, 20, 10), (23, 30, 14)],
    "hazards": [(5, 13), (9, 11), (13, 11), (17, 11), (21, 11)],
    "items": [(6, 13, "coin"), (8, 9, "coin"), (12, 9, "coin"), (16, 9, "coin"),
              (22, 9, "gem")],
    "enemies": [(9, 8, 6, 12, 45), (13, 8, 11, 17, 45), (17, 8, 15, 21, 45)],
    "door": (31, 13),
})
MAPS.append({
    "id": "MAP000029", "name": "First Bomb", "group": "enemies", "difficulty": 4,
    "mechanics": ["bomb", "enemy"], "status": "available",
    "width": 30, "height": 18, "spawn": (2, 13),
    "ground": [(0, 20, 14)], "platforms": [(23, 25, 12)],
    "hazards": [(12, 13)], "items": [(6, 13, "coin"), (14, 13, "bomb"),
                                    (24, 11, "gem")],
    "enemies": [(10, 12, 7, 15, 50)], "door": (27, 13),
})
MAPS.append({
    "id": "MAP000030", "name": "Bomb Toss", "group": "enemies", "difficulty": 5,
    "mechanics": ["bomb", "enemy"], "status": "available",
    "width": 32, "height": 18, "spawn": (2, 13),
    "ground": [(0, 8, 14)], "platforms": [(11, 13, 12), (16, 18, 14), (21, 23, 12),
                                          (26, 31, 14)],
    "hazards": [(9, 13)], "items": [(5, 13, "coin"), (10, 13, "bomb"),
                                    (17, 13, "coin"), (22, 11, "gem")],
    "enemies": [(12, 12, 9, 15, 50), (19, 12, 17, 21, 50)], "door": (28, 13),
})
MAPS.append({
    "id": "MAP000031", "name": "Slime Bridge", "group": "enemies", "difficulty": 5,
    "mechanics": ["enemy", "stomp", "gap"], "status": "available",
    "width": 32, "height": 18, "spawn": (2, 13),
    "ground": [(0, 3, 14)], "platforms": [(6, 7, 11), (10, 11, 11), (14, 15, 11),
                                          (18, 19, 11), (22, 23, 11), (26, 31, 14)],
    "hazards": [(4, 13), (8, 12), (12, 12), (16, 12), (20, 12), (24, 12)],
    "items": [(7, 10, "coin"), (13, 10, "gem"), (17, 10, "coin")],
    "enemies": [(8, 10, 6, 10, 40), (12, 10, 12, 16, 40), (20, 10, 19, 23, 40)],
    "door": (30, 13),
})
MAPS.append({
    "id": "MAP000032", "name": "Bomb Door", "group": "enemies", "difficulty": 5,
    "mechanics": ["bomb", "enemy", "exit"], "status": "available",
    "width": 30, "height": 18, "spawn": (2, 13),
    "ground": [(0, 16, 14)], "platforms": [(19, 21, 12)],
    "hazards": [(10, 13), (12, 13), (14, 13)],
    "items": [(7, 13, "coin"), (17, 13, "bomb"), (20, 11, "gem")],
    "enemies": [(15, 12, 13, 18, 45)], "door": (22, 13),
})
MAPS.append({
    "id": "MAP000033", "name": "Danger Patrol", "group": "enemies", "difficulty": 6,
    "mechanics": ["enemy", "hazard", "stomp"], "status": "available",
    "width": 32, "height": 18, "spawn": (2, 13),
    "ground": [(0, 6, 14)], "platforms": [(9, 11, 12), (14, 16, 14), (19, 21, 12),
                                          (24, 31, 14)],
    "hazards": [(7, 13), (12, 13), (17, 13), (20, 13), (22, 13), (23, 13)],
    "items": [(8, 13, "coin"), (10, 11, "coin"), (15, 13, "gem"), (20, 11, "coin")],
    "enemies": [(10, 12, 8, 13, 60), (18, 12, 17, 22, 60)], "door": (27, 13),
})
MAPS.append({
    "id": "MAP000034", "name": "Blast Zone", "group": "enemies", "difficulty": 6,
    "mechanics": ["bomb", "enemy", "hazard"], "status": "available",
    "width": 32, "height": 18, "spawn": (2, 13),
    "ground": [(0, 8, 14)], "platforms": [(11, 13, 12), (16, 18, 14), (21, 23, 12),
                                          (26, 31, 14)],
    "hazards": [(9, 13), (14, 13), (19, 13), (24, 13)],
    "items": [(5, 13, "coin"), (10, 13, "bomb"), (17, 13, "coin"), (22, 11, "gem")],
    "enemies": [(12, 12, 10, 15, 55), (20, 12, 18, 22, 55)], "door": (28, 13),
})
MAPS.append({
    "id": "MAP000035", "name": "Enemy Gate", "group": "enemies", "difficulty": 6,
    "mechanics": ["enemy", "stomp", "exit"], "status": "available",
    "width": 30, "height": 18, "spawn": (2, 13),
    "ground": [(0, 22, 14)], "platforms": [(25, 29, 12)],
    "hazards": [(12, 13), (14, 13)], "items": [(7, 13, "coin"), (16, 13, "bomb"),
                                              (23, 11, "gem")],
    "enemies": [(13, 12, 11, 17, 50)], "door": (27, 13),
})
MAPS.append({
    "id": "MAP000036", "name": "Mixed One", "group": "mixed", "difficulty": 5,
    "mechanics": ["jump", "enemy", "hazard"], "status": "available",
    "width": 34, "height": 18, "spawn": (2, 13),
    "ground": [(0, 6, 14)], "platforms": [(9, 11, 12), (14, 16, 14), (19, 21, 12),
                                          (24, 33, 14)],
    "hazards": [(7, 13), (12, 13), (17, 13), (22, 13)],
    "items": [(8, 13, "coin"), (10, 11, "gem"), (15, 13, "coin"), (20, 11, "coin")],
    "enemies": [(11, 12, 9, 14, 50), (18, 12, 16, 21, 50)], "door": (31, 13),
})
MAPS.append({
    "id": "MAP000037", "name": "Mixed Two", "group": "mixed", "difficulty": 5,
    "mechanics": ["wall-slide", "enemy"], "status": "available",
    "width": 24, "height": 18, "spawn": (4, 13),
    "ground": [(0, 7, 14)], "walls": [(11, 4, 17)], "platforms": [(13, 15, 14)],
    "hazards": [(8, 13)], "items": [(10, 5, "coin"), (14, 13, "gem")],
    "enemies": [(12, 12, 11, 15, 45)], "door": (16, 13),
})
MAPS.append({
    "id": "MAP000038", "name": "Mixed Three", "group": "mixed", "difficulty": 6,
    "mechanics": ["double-jump", "bomb", "gap"], "status": "available",
    "width": 32, "height": 18, "spawn": (2, 13),
    "ground": [(0, 4, 14)], "platforms": [(8, 9, 10), (12, 13, 10), (16, 17, 10),
                                          (20, 21, 10), (25, 31, 14)],
    "hazards": [(6, 13), (10, 11), (14, 11), (18, 11), (22, 11), (23, 13)],
    "items": [(9, 9, "coin"), (11, 13, "bomb"), (15, 9, "coin"),
              (19, 9, "gem"), (24, 13, "coin")],
    "enemies": [], "door": (26, 13),
})
MAPS.append({
    "id": "MAP000039", "name": "Mixed Four", "group": "mixed", "difficulty": 6,
    "mechanics": ["wall-jump", "enemy", "collect"], "status": "available",
    "width": 22, "height": 20, "spawn": (4, 16),
    "ground": [(0, 6, 19)], "walls": [(8, 5, 18), (14, 5, 18)],
    "platforms": [(11, 10, 16)], "hazards": [(7, 17)],
    "items": [(9, 15, "coin"), (12, 8, "coin"), (13, 5, "gem")],
    "enemies": [(10, 14, 9, 13, 50)], "door": (15, 5),
})
MAPS.append({
    "id": "MAP000040", "name": "Mixed Five", "group": "mixed", "difficulty": 6,
    "mechanics": ["enemy", "hazard", "bomb"], "status": "available",
    "width": 32, "height": 18, "spawn": (2, 13),
    "ground": [(0, 6, 14)], "platforms": [(9, 11, 12), (14, 16, 14), (19, 21, 12),
                                          (24, 31, 14)],
    "hazards": [(7, 13), (12, 13), (17, 13), (20, 13), (22, 13), (23, 13)],
    "items": [(8, 13, "coin"), (10, 13, "bomb"), (15, 13, "gem"), (21, 11, "coin")],
    "enemies": [(13, 12, 11, 16, 55)], "door": (28, 13),
})

# ================= NHÓM 4: BOM, VẬT PHẨM KẾT HỢP (41-55) =================
MAPS.append({
    "id": "MAP000041", "name": "Mixed Six", "group": "mixed", "difficulty": 7,
    "mechanics": ["wall-jump", "stomp", "gap"], "status": "available",
    "width": 26, "height": 20, "spawn": (4, 16),
    "ground": [(0, 5, 19)], "walls": [(9, 6, 18)], "platforms": [(13, 15, 17)],
    "hazards": [(6, 18), (11, 18), (12, 18)], "items": [(8, 16, "gem"), (14, 16, "coin")],
    "enemies": [(10, 16, 8, 12, 45)], "door": (16, 17),
})
MAPS.append({
    "id": "MAP000042", "name": "Mixed Seven", "group": "mixed", "difficulty": 7,
    "mechanics": ["bomb", "hazard", "collect"], "status": "available",
    "width": 30, "height": 18, "spawn": (2, 13),
    "ground": [(0, 8, 14)], "platforms": [(11, 13, 12), (16, 18, 14), (21, 29, 14)],
    "hazards": [(9, 13), (14, 13), (19, 13), (23, 13)],
    "items": [(5, 13, "coin"), (10, 13, "bomb"), (15, 13, "gem"), (20, 13, "coin"),
              (26, 13, "coin")],
    "enemies": [], "door": (27, 13),
})
MAPS.append({
    "id": "MAP000043", "name": "Mixed Eight", "group": "mixed", "difficulty": 7,
    "mechanics": ["enemy", "wall-slide", "exit"], "status": "available",
    "width": 24, "height": 20, "spawn": (4, 16),
    "ground": [(0, 6, 19)], "walls": [(10, 4, 19), (15, 4, 19)],
    "platforms": [(12, 8, 17)], "hazards": [(8, 17), (17, 17)],
    "items": [(11, 16, "coin"), (13, 6, "gem")],
    "enemies": [(11, 15, 10, 14, 50)], "door": (17, 4),
})
MAPS.append({
    "id": "MAP000044", "name": "Mixed Nine", "group": "mixed", "difficulty": 7,
    "mechanics": ["double-jump", "stomp", "hazard"], "status": "available",
    "width": 32, "height": 18, "spawn": (2, 13),
    "ground": [(0, 4, 14)], "platforms": [(7, 8, 10), (11, 12, 10), (15, 16, 10),
                                          (19, 20, 10), (24, 31, 14)],
    "hazards": [(5, 13), (9, 11), (13, 11), (17, 11), (21, 11), (22, 13), (23, 13)],
    "items": [(8, 9, "coin"), (12, 9, "gem"), (16, 9, "coin"), (20, 9, "coin")],
    "enemies": [(10, 8, 8, 12, 50)], "door": (26, 13),
})
MAPS.append({
    "id": "MAP000045", "name": "Mixed Gate", "group": "mixed", "difficulty": 8,
    "mechanics": ["wall-jump", "bomb", "enemy", "exit"], "status": "available",
    "width": 26, "height": 20, "spawn": (4, 16),
    "ground": [(0, 6, 19)], "walls": [(10, 5, 18)], "platforms": [(14, 16, 17)],
    "hazards": [(7, 18), (8, 18), (11, 18)], "items": [(9, 16, "bomb"), (15, 16, "gem")],
    "enemies": [(12, 16, 10, 14, 50)], "door": (17, 5),
})
MAPS.append({
    "id": "MAP000046", "name": "Shield Intro", "group": "equipment", "difficulty": 6,
    "mechanics": ["shield", "enemy"], "status": "available",
    "width": 30, "height": 18, "spawn": (2, 13),
    "ground": [(0, 26, 14)],
    "hazards": [], "items": [(10, 13, "coin")],
    "equipment": [equip(6, 13, "shield")],
    "enemies": [(12, 12, 8, 18, 50)], "door": (28, 13),
})
MAPS.append({
    "id": "MAP000047", "name": "Magnet Trail", "group": "equipment", "difficulty": 6,
    "mechanics": ["magnet", "collect", "gap"], "status": "available",
    "width": 32, "height": 18, "spawn": (2, 13),
    "ground": [(0, 6, 14)], "platforms": [(9, 11, 10), (14, 16, 14), (19, 21, 10),
                                          (25, 31, 14)],
    "hazards": [(7, 13), (12, 13), (17, 13)],
    "items": [(8, 11, "coin"), (10, 11, "coin"), (15, 11, "coin"), (18, 11, "coin"),
              (20, 11, "gem"), (22, 11, "coin"), (26, 11, "coin")],
    "equipment": [equip(12, 13, "magnet")],
    "enemies": [], "door": (28, 13),
})
MAPS.append({
    "id": "MAP000048", "name": "High Jump Boost", "group": "equipment", "difficulty": 7,
    "mechanics": ["high_jump_boots", "gap"], "status": "available",
    "width": 30, "height": 18, "spawn": (2, 13),
    "ground": [(0, 4, 14)], "platforms": [(8, 10, 6), (14, 16, 6), (20, 22, 6),
                                          (26, 29, 14)],
    "hazards": [(6, 13), (12, 12), (18, 12)],
    "items": [(9, 5, "coin"), (15, 5, "gem")],
    "equipment": [equip(7, 13, "high_jump_boots")],
    "enemies": [], "door": (27, 13),
})
MAPS.append({
    "id": "MAP000049", "name": "Flying Start", "group": "equipment", "difficulty": 7,
    "mechanics": ["flying_boots", "gap"], "status": "available",
    "width": 28, "height": 20, "spawn": (4, 16),
    "ground": [(0, 3, 19)], "walls": [(8, 5, 19)], "platforms": [(12, 8, 17)],
    "hazards": [(6, 18), (10, 18)], "items": [(9, 10, "gem")],
    "equipment": [equip(6, 16, "flying_boots")],
    "enemies": [], "door": (13, 5),
})
MAPS.append({
    "id": "MAP000050", "name": "Healing Hub", "group": "equipment", "difficulty": 6,
    "mechanics": ["healing", "enemy", "hazard"], "status": "available",
    "width": 30, "height": 18, "spawn": (2, 13),
    "ground": [(0, 26, 14)],
    "hazards": [(10, 13), (12, 13), (14, 13)],
    "items": [(6, 13, "coin"), (20, 13, "coin")],
    "equipment": [equip(8, 13, "healing")],
    "enemies": [(11, 12, 7, 17, 50)], "door": (28, 13),
})
MAPS.append({
    "id": "MAP000051", "name": "Equipment Mix", "group": "equipment", "difficulty": 8,
    "mechanics": ["shield", "magnet", "high_jump_boots"], "status": "available",
    "width": 34, "height": 18, "spawn": (2, 13),
    "ground": [(0, 6, 14)], "platforms": [(9, 11, 10), (14, 16, 14), (19, 21, 10),
                                          (25, 33, 14)],
    "hazards": [(7, 13), (12, 13), (17, 13), (22, 13), (23, 13)],
    "items": [(8, 11, "coin"), (15, 11, "gem"), (20, 11, "coin"), (26, 11, "coin")],
    "equipment": [equip(10, 13, "shield"), equip(16, 13, "magnet"),
                  equip(22, 13, "high_jump_boots")],
    "enemies": [(13, 12, 11, 16, 55)], "door": (31, 13),
})
MAPS.append({
    "id": "MAP000052", "name": "Bomb & Boots", "group": "equipment", "difficulty": 8,
    "mechanics": ["bomb", "high_jump_boots", "enemy"], "status": "available",
    "width": 32, "height": 18, "spawn": (2, 13),
    "ground": [(0, 8, 14)], "platforms": [(11, 13, 10), (16, 18, 14), (21, 23, 10),
                                          (26, 31, 14)],
    "hazards": [(9, 13), (14, 13), (19, 13), (24, 13)],
    "items": [(5, 13, "coin"), (12, 13, "bomb"), (17, 11, "gem")],
    "equipment": [equip(7, 13, "high_jump_boots")],
    "enemies": [(13, 12, 10, 16, 55), (20, 12, 18, 22, 55)], "door": (28, 13),
})
MAPS.append({
    "id": "MAP000053", "name": "Fly & Shield", "group": "equipment", "difficulty": 9,
    "mechanics": ["flying_boots", "shield", "lava"], "status": "available",
    "width": 30, "height": 18, "spawn": (2, 13),
    "ground": [(0, 4, 14)], "platforms": [(8, 10, 6), (14, 16, 6), (20, 26, 6)],
    "hazards": [(6, 13), (12, 13), (18, 13), (22, 13), (23, 13)],
    "lavaZones": [lava_zone(11, 16, 8, 2), lava_zone(20, 16, 4, 2)],
    "items": [(9, 5, "coin"), (15, 5, "gem")],
    "equipment": [equip(7, 13, "flying_boots"), equip(13, 13, "shield")],
    "enemies": [], "door": (28, 13),
})
MAPS.append({
    "id": "MAP000054", "name": "Magnet Healing", "group": "equipment", "difficulty": 8,
    "mechanics": ["magnet", "healing", "hazard"], "status": "available",
    "width": 32, "height": 18, "spawn": (2, 13),
    "ground": [(0, 6, 14)], "platforms": [(9, 11, 10), (14, 16, 14), (19, 21, 10),
                                          (25, 31, 14)],
    "hazards": [(7, 13), (12, 13), (17, 13), (22, 13), (23, 13)],
    "items": [(8, 11, "coin"), (10, 11, "coin"), (15, 11, "coin"), (20, 11, "gem")],
    "equipment": [equip(12, 13, "magnet"), equip(18, 13, "healing")],
    "enemies": [], "door": (28, 13),
})
MAPS.append({
    "id": "MAP000055", "name": "Equipment Gate", "group": "equipment", "difficulty": 9,
    "mechanics": ["flying_boots", "bomb", "enemy", "exit"], "status": "available",
    "width": 30, "height": 20, "spawn": (4, 16),
    "ground": [(0, 4, 19)], "walls": [(8, 5, 19)], "platforms": [(13, 9, 17)],
    "hazards": [(6, 18), (10, 18), (14, 18), (15, 18)],
    "lavaZones": [lava_zone(16, 17, 6, 2)],
    "items": [(7, 17, "coin"), (12, 8, "gem")],
    "equipment": [equip(6, 16, "flying_boots"), equip(10, 16, "bomb")],
    "enemies": [(11, 17, 8, 14, 55)], "door": (17, 5),
})

# ================= NHÓM 5: NƯỚC (56-70) =================
MAPS.append({
    "id": "MAP000056", "name": "First Water", "group": "water", "difficulty": 5,
    "mechanics": ["water", "jump"], "status": "available",
    "width": 30, "height": 18, "spawn": (2, 10),
    "ground": [(0, 4, 16), (14, 29, 16)],
    "waterZones": [water_zone(4, 12, 10, 4)],
    "hazards": [], "items": [(8, 11, "coin"), (12, 11, "gem")],
    "enemies": [], "door": (28, 15),
})
MAPS.append({
    "id": "MAP000057", "name": "Water Stream", "group": "water", "difficulty": 6,
    "mechanics": ["water", "gap"], "status": "available",
    "width": 32, "height": 18, "spawn": (2, 13),
    "ground": [(0, 6, 10), (0, 6, 16), (16, 31, 16)],
    "waterZones": [water_zone(10, 8, 6, 8)],
    "hazards": [(6, 13), (12, 13)],
    "items": [(11, 9, "coin"), (13, 9, "coin")],
    "enemies": [], "door": (30, 15),
})
MAPS.append({
    "id": "MAP000058", "name": "Water Puzzle", "group": "water", "difficulty": 6,
    "mechanics": ["water", "double-jump"], "status": "available",
    "width": 30, "height": 20, "spawn": (4, 16),
    "ground": [(0, 4, 18)], "platforms": [(9, 10, 16), (19, 21, 16), (24, 29, 16)],
    "waterZones": [water_zone(4, 12, 5, 8), water_zone(15, 12, 4, 8)],
    "hazards": [(8, 17), (14, 17)],
    "items": [(10, 13, "coin"), (20, 13, "gem")],
    "enemies": [], "door": (25, 5),
})
MAPS.append({
    "id": "MAP000059", "name": "Deep Water", "group": "water", "difficulty": 7,
    "mechanics": ["water", "sink"], "status": "available",
    "width": 28, "height": 18, "spawn": (2, 2),
    "ground": [(0, 2, 6)], "platforms": [(10, 2, 28)],
    "waterZones": [water_zone(6, 4, 16, 14)],
    "hazards": [], "items": [(12, 10, "coin"), (16, 10, "gem")],
    "enemies": [], "door": (11, 2),
})
MAPS.append({
    "id": "MAP000060", "name": "Water & Enemy", "group": "water", "difficulty": 7,
    "mechanics": ["water", "enemy", "stomp"], "status": "available",
    "width": 32, "height": 18, "spawn": (2, 13),
    "ground": [(0, 4, 12), (20, 16, 32)],
    "waterZones": [water_zone(12, 10, 8, 6)],
    "hazards": [(13, 13), (15, 13)],
    "items": [(14, 11, "coin"), (18, 11, "gem")],
    "enemies": [(16, 12, 12, 20, 50)], "door": (29, 16),
})
MAPS.append({
    "id": "MAP000061", "name": "Water Gauntlet", "group": "water", "difficulty": 8,
    "mechanics": ["water", "hazard", "double-jump"], "status": "available",
    "width": 34, "height": 18, "spawn": (2, 13),
    "ground": [(0, 4, 8), (0, 4, 16), (14, 20, 16), (26, 33, 16)],
    "waterZones": [water_zone(8, 10, 6, 8), water_zone(20, 10, 6, 8)],
    "hazards": [(9, 13), (11, 13), (21, 13), (23, 13)],
    "items": [(10, 11, "coin"), (12, 11, "coin"), (22, 11, "gem")],
    "enemies": [], "door": (32, 15),
})
MAPS.append({
    "id": "MAP000062", "name": "Water Door", "group": "water", "difficulty": 8,
    "mechanics": ["water", "exit"], "status": "available",
    "width": 30, "height": 20, "spawn": (4, 16),
    "ground": [(0, 4, 18)], "platforms": [(10, 8, 16)],
    "waterZones": [water_zone(4, 12, 6, 8)],
    "hazards": [(5, 17), (7, 17)],
    "items": [(12, 13, "coin"), (14, 7, "gem")],
    "enemies": [], "door": (16, 5),
})
MAPS.append({
    "id": "MAP000063", "name": "Swim Up", "group": "water", "difficulty": 9,
    "mechanics": ["water", "double-jump", "collect"], "status": "available",
    "width": 24, "height": 22, "spawn": (4, 18),
    "ground": [(0, 4, 21)], "walls": [(8, 5, 21)],
    "waterZones": [water_zone(10, 5, 6, 16)],
    "hazards": [(9, 19)],
    "items": [(11, 10, "coin"), (11, 14, "coin"), (11, 7, "gem")],
    "enemies": [], "door": (12, 5),
})
MAPS.append({
    "id": "MAP000064", "name": "Water Mix", "group": "water", "difficulty": 9,
    "mechanics": ["water", "bomb", "enemy"], "status": "available",
    "width": 32, "height": 18, "spawn": (2, 8),
    "ground": [(0, 4, 12)], "platforms": [(14, 18, 12), (22, 24, 16), (28, 31, 16)],
    "waterZones": [water_zone(12, 10, 10, 8)],
    "hazards": [(13, 13), (15, 13), (17, 13)],
    "items": [(14, 11, "coin"), (16, 13, "bomb"), (23, 13, "gem")],
    "equipment": [equip(18, 13, "bomb")],
    "enemies": [(18, 12, 14, 22, 50)], "door": (30, 15),
})
MAPS.append({
    "id": "MAP000065", "name": "Water Gate", "group": "water", "difficulty": 10,
    "mechanics": ["water", "flying_boots", "exit"], "status": "available",
    "width": 30, "height": 22, "spawn": (6, 17),
    "ground": [(0, 4, 18)], "platforms": [(10, 6, 18)],
    "waterZones": [water_zone(4, 10, 6, 12), water_zone(16, 10, 6, 12)],
    "hazards": [(5, 19), (7, 19), (17, 19), (19, 19)],
    "items": [(12, 11, "coin"), (18, 11, "gem")],
    "equipment": [equip(6, 16, "flying_boots")],
    "enemies": [], "door": (20, 5),
})
MAPS.append({
    "id": "MAP000066", "name": "Deep Swim", "group": "water", "difficulty": 10,
    "mechanics": ["water", "sink", "collect"], "status": "available",
    "width": 30, "height": 20, "spawn": (4, 2),
    "ground": [(0, 29, 19)],
    "waterZones": [water_zone(6, 4, 18, 16)],
    "hazards": [], "items": [(10, 8, "coin"), (14, 8, "coin"), (18, 8, "gem")],
    "enemies": [], "door": (26, 3),
})
MAPS.append({
    "id": "MAP000067", "name": "Water Current", "group": "water", "difficulty": 10,
    "mechanics": ["water", "gap", "enemy"], "status": "available",
    "width": 34, "height": 18, "spawn": (2, 13),
    "ground": [(0, 4, 10), (0, 4, 16), (22, 33, 16)],
    "waterZones": [water_zone(10, 10, 12, 8)],
    "hazards": [(11, 13), (13, 13), (15, 13), (17, 13), (19, 13)],
    "items": [(12, 11, "coin"), (16, 11, "coin"), (18, 11, "gem")],
    "enemies": [(20, 12, 14, 22, 50)], "door": (32, 15),
})
MAPS.append({
    "id": "MAP000068", "name": "Water Shield", "group": "water", "difficulty": 9,
    "mechanics": ["water", "shield", "hazard"], "status": "available",
    "width": 32, "height": 18, "spawn": (2, 13),
    "ground": [(0, 4, 12)], "platforms": [(14, 10, 20)],
    "waterZones": [water_zone(12, 12, 8, 6)],
    "hazards": [(13, 15), (15, 15), (17, 15)],
    "items": [(14, 13, "coin"), (16, 13, "gem")],
    "equipment": [equip(13, 13, "shield")],
    "enemies": [], "door": (22, 10),
})
MAPS.append({
    "id": "MAP000069", "name": "Water Magnet", "group": "water", "difficulty": 9,
    "mechanics": ["water", "magnet", "collect"], "status": "available",
    "width": 30, "height": 18, "spawn": (2, 13),
    "ground": [(0, 4, 14)], "platforms": [(16, 10, 24)],
    "waterZones": [water_zone(14, 10, 12, 8)],
    "hazards": [(15, 13), (17, 13), (19, 13), (21, 13)],
    "items": [(16, 11, "coin"), (18, 11, "coin"), (20, 11, "coin"), (22, 11, "gem")],
    "equipment": [equip(15, 13, "magnet")],
    "enemies": [], "door": (26, 10),
})
MAPS.append({
    "id": "MAP000070", "name": "Water Final", "group": "water", "difficulty": 10,
    "mechanics": ["water", "double-jump", "bomb", "exit"], "status": "available",
    "width": 32, "height": 22, "spawn": (4, 18),
    "ground": [(0, 4, 20)], "platforms": [(10, 8, 20)],
    "waterZones": [water_zone(6, 12, 10, 10)],
    "hazards": [(7, 19), (9, 19), (11, 19), (13, 19)],
    "items": [(14, 13, "coin"), (16, 9, "bomb")],
    "equipment": [equip(8, 16, "bomb")],
    "enemies": [], "door": (22, 5),
})

# ================= NHÓM 6: DUNG NHAM (71-80) =================
MAPS.append({
    "id": "MAP000071", "name": "First Lava", "group": "lava", "difficulty": 7,
    "mechanics": ["lava", "jump"], "status": "available",
    "width": 30, "height": 18, "spawn": (2, 9),
    "ground": [(0, 4, 12), (16, 29, 16)],
    "lavaZones": [lava_zone(12, 14, 4, 2)],
    "hazards": [], "items": [(8, 13, "coin"), (14, 13, "gem")],
    "enemies": [], "door": (28, 15),
})
MAPS.append({
    "id": "MAP000072", "name": "Lava Pit", "group": "lava", "difficulty": 7,
    "mechanics": ["lava", "gap"], "status": "available",
    "width": 32, "height": 18, "spawn": (2, 5),
    "ground": [(0, 4, 8), (0, 4, 16), (16, 31, 16)],
    "lavaZones": [lava_zone(8, 14, 8, 4)],
    "hazards": [], "items": [(10, 13, "coin"), (12, 13, "coin")],
    "enemies": [], "door": (30, 15),
})
MAPS.append({
    "id": "MAP000073", "name": "Lava Gauntlet", "group": "lava", "difficulty": 8,
    "mechanics": ["lava", "double-jump"], "status": "available",
    "width": 34, "height": 18, "spawn": (2, 13),
    "ground": [(0, 4, 10)], "platforms": [(12, 12, 6), (18, 12, 6), (24, 12, 6),
                                          (30, 33, 16)],
    "lavaZones": [lava_zone(10, 14, 12, 4)],
    "hazards": [], "items": [(14, 11, "coin"), (20, 11, "gem")],
    "enemies": [], "door": (31, 16),
})
MAPS.append({
    "id": "MAP000074", "name": "Lava & Enemy", "group": "lava", "difficulty": 8,
    "mechanics": ["lava", "enemy", "stomp"], "status": "available",
    "width": 32, "height": 18, "spawn": (2, 13),
    "ground": [(0, 4, 14)], "platforms": [(16, 14, 32)],
    "lavaZones": [lava_zone(14, 14, 16, 4)],
    "hazards": [(15, 13)],
    "items": [(17, 13, "coin"), (20, 13, "gem")],
    "enemies": [(17, 12, 14, 20, 50)], "door": (30, 14),
})
MAPS.append({
    "id": "MAP000075", "name": "Lava Door", "group": "lava", "difficulty": 9,
    "mechanics": ["lava", "exit"], "status": "available",
    "width": 30, "height": 20, "spawn": (2, 15),
    "ground": [(0, 4, 18)], "platforms": [(10, 8, 20)],
    "lavaZones": [lava_zone(4, 16, 14, 4)],
    "hazards": [(5, 15), (7, 15), (15, 15), (17, 15)],
    "items": [(12, 15, "coin"), (16, 7, "gem")],
    "enemies": [], "door": (20, 5),
})
MAPS.append({
    "id": "MAP000076", "name": "Lava Mix", "group": "lava", "difficulty": 9,
    "mechanics": ["lava", "bomb", "enemy"], "status": "available",
    "width": 32, "height": 18, "spawn": (2, 13),
    "ground": [(0, 4, 12)], "platforms": [(14, 10, 20)],
    "lavaZones": [lava_zone(12, 14, 16, 4)],
    "hazards": [(13, 13), (15, 13), (17, 13)],
    "items": [(14, 11, "coin"), (16, 13, "bomb"), (21, 13, "gem")],
    "enemies": [(18, 12, 16, 22, 55)], "door": (30, 10),
})
MAPS.append({
    "id": "MAP000077", "name": "Lava Shield", "group": "lava", "difficulty": 9,
    "mechanics": ["lava", "shield", "collect"], "status": "available",
    "width": 30, "height": 18, "spawn": (2, 13),
    "ground": [(0, 4, 14)], "platforms": [(16, 10, 24)],
    "lavaZones": [lava_zone(14, 14, 12, 4)],
    "hazards": [(15, 13), (17, 13), (19, 13), (21, 13)],
    "items": [(16, 13, "coin"), (18, 13, "gem")],
    "equipment": [equip(15, 13, "shield")],
    "enemies": [], "door": (26, 10),
})
MAPS.append({
    "id": "MAP000078", "name": "Lava Jump", "group": "lava", "difficulty": 10,
    "mechanics": ["lava", "high_jump_boots", "gap"], "status": "available",
    "width": 28, "height": 18, "spawn": (2, 13),
    "ground": [(0, 4, 8)], "platforms": [(10, 6, 12), (14, 6, 16), (18, 6, 28)],
    "lavaZones": [lava_zone(8, 14, 8, 4)],
    "hazards": [(9, 13), (11, 13)],
    "items": [(11, 5, "coin"), (15, 5, "gem")],
    "equipment": [equip(10, 13, "high_jump_boots")],
    "enemies": [], "door": (26, 16),
})
MAPS.append({
    "id": "MAP000079", "name": "Lava Fly", "group": "lava", "difficulty": 10,
    "mechanics": ["lava", "flying_boots", "gap"], "status": "available",
    "width": 30, "height": 20, "spawn": (2, 15),
    "ground": [(0, 4, 18)], "platforms": [(10, 8, 20)],
    "lavaZones": [lava_zone(4, 16, 22, 4)],
    "hazards": [(5, 15), (7, 15), (21, 15), (23, 15)],
    "items": [(12, 9, "coin"), (18, 9, "gem")],
    "equipment": [equip(6, 15, "flying_boots")],
    "enemies": [], "door": (22, 5),
})
MAPS.append({
    "id": "MAP000080", "name": "Lava Final", "group": "lava", "difficulty": 10,
    "mechanics": ["lava", "bomb", "enemy", "exit"], "status": "available",
    "width": 32, "height": 22, "spawn": (4, 18),
    "ground": [(0, 4, 20)], "platforms": [(10, 8, 20)],
    "lavaZones": [lava_zone(6, 16, 12, 6)],
    "hazards": [(7, 19), (9, 19), (11, 19), (13, 19)],
    "items": [(14, 15, "coin"), (16, 9, "bomb")],
    "equipment": [equip(8, 16, "bomb")],
    "enemies": [], "door": (22, 5),
})

# ================= NHÓM 7: THỜI TIẾT (81-90) =================
MAPS.append({
    "id": "MAP000081", "name": "Sunny Day", "group": "weather", "difficulty": 5,
    "mechanics": ["jump", "collect"], "status": "available",
    "width": 30, "height": 18, "spawn": (2, 13),
    "ground": [(0, 29, 14)],
    "hazards": [], "items": [(8, 13, "coin"), (16, 13, "gem"), (24, 13, "coin")],
    "weather": weather_cfg("sunny"),
    "enemies": [], "door": (28, 13),
})
MAPS.append({
    "id": "MAP000082", "name": "Rain Run", "group": "weather", "difficulty": 6,
    "mechanics": ["rain", "gap"], "status": "available",
    "width": 32, "height": 18, "spawn": (2, 13),
    "ground": [(0, 4, 10), (0, 4, 16), (16, 31, 16)],
    "hazards": [(6, 13), (12, 13)],
    "items": [(8, 13, "coin"), (14, 13, "coin")],
    "weather": weather_cfg("rain", density=0.6),
    "enemies": [], "door": (30, 15),
})
MAPS.append({
    "id": "MAP000083", "name": "Wind Push", "group": "weather", "difficulty": 6,
    "mechanics": ["wind", "jump"], "status": "available",
    "width": 30, "height": 18, "spawn": (2, 13),
    "ground": [(0, 29, 14)],
    "hazards": [(8, 13), (16, 13), (24, 13)],
    "items": [(10, 13, "coin"), (20, 13, "gem")],
    "weather": weather_cfg("wind", wind_x=0.6, density=0.3),
    "enemies": [], "door": (28, 13),
})
MAPS.append({
    "id": "MAP000084", "name": "Wind Left", "group": "weather", "difficulty": 7,
    "mechanics": ["wind", "wall-jump"], "status": "available",
    "width": 22, "height": 20, "spawn": (4, 16),
    "ground": [(0, 4, 19)], "walls": [(8, 5, 19)],
    "platforms": [(12, 10, 16)],
    "hazards": [(6, 18)],
    "items": [(10, 9, "gem")],
    "weather": weather_cfg("wind", wind_x=-0.7, density=0.4),
    "enemies": [], "door": (13, 5),
})
MAPS.append({
    "id": "MAP000085", "name": "Storm One", "group": "weather", "difficulty": 7,
    "mechanics": ["storm", "jump", "hazard"], "status": "available",
    "width": 32, "height": 18, "spawn": (2, 13),
    "ground": [(0, 4, 12)], "platforms": [(14, 12, 20)],
    "hazards": [(8, 13), (10, 13)],
    "items": [(9, 13, "coin"), (16, 13, "gem")],
    "weather": weather_cfg("storm", wind_x=0.4, density=0.7),
    "enemies": [], "door": (30, 12),
})
MAPS.append({
    "id": "MAP000086", "name": "Storm Run", "group": "weather", "difficulty": 8,
    "mechanics": ["storm", "double-jump", "gap"], "status": "available",
    "width": 34, "height": 18, "spawn": (2, 13),
    "ground": [(0, 4, 10)], "platforms": [(12, 10, 6), (18, 10, 6), (24, 10, 6),
                                          (30, 33, 16)],
    "hazards": [(11, 13), (13, 13), (19, 13), (21, 13)],
    "items": [(13, 9, "coin"), (19, 9, "gem"), (25, 9, "coin")],
    "weather": weather_cfg("storm", wind_x=0.5, density=0.8),
    "enemies": [], "door": (31, 16),
})
MAPS.append({
    "id": "MAP000087", "name": "Rain & Enemy", "group": "weather", "difficulty": 8,
    "mechanics": ["rain", "enemy", "stomp"], "status": "available",
    "width": 30, "height": 18, "spawn": (2, 13),
    "ground": [(0, 4, 14)], "platforms": [(16, 14, 30)],
    "hazards": [(15, 13)],
    "items": [(17, 13, "coin"), (20, 13, "gem")],
    "weather": weather_cfg("rain", density=0.5),
    "enemies": [(18, 12, 14, 20, 50)], "door": (28, 14),
})
MAPS.append({
    "id": "MAP000088", "name": "Wind & Bomb", "group": "weather", "difficulty": 9,
    "mechanics": ["wind", "bomb", "enemy"], "status": "available",
    "width": 32, "height": 18, "spawn": (2, 13),
    "ground": [(0, 4, 12)], "platforms": [(14, 10, 20)],
    "hazards": [(13, 13), (15, 13), (17, 13)],
    "items": [(14, 11, "coin"), (16, 13, "bomb"), (21, 13, "gem")],
    "weather": weather_cfg("wind", wind_x=0.6, density=0.4),
    "enemies": [(18, 12, 16, 22, 55)], "door": (30, 10),
})
MAPS.append({
    "id": "MAP000089", "name": "Storm Shield", "group": "weather", "difficulty": 9,
    "mechanics": ["storm", "shield", "collect"], "status": "available",
    "width": 30, "height": 18, "spawn": (2, 13),
    "ground": [(0, 4, 14)], "platforms": [(16, 10, 24)],
    "hazards": [(15, 13), (17, 13), (19, 13), (21, 13)],
    "items": [(16, 13, "coin"), (18, 13, "gem")],
    "equipment": [equip(15, 13, "shield")],
    "weather": weather_cfg("storm", wind_x=0.3, density=0.6),
    "enemies": [], "door": (26, 10),
})
MAPS.append({
    "id": "MAP000090", "name": "Weather Gate", "group": "weather", "difficulty": 10,
    "mechanics": ["storm", "bomb", "exit"], "status": "available",
    "width": 32, "height": 22, "spawn": (4, 18),
    "ground": [(0, 4, 20)], "platforms": [(10, 8, 20)],
    "hazards": [(7, 19), (9, 19), (11, 19), (13, 19)],
    "items": [(14, 15, "coin"), (16, 9, "bomb")],
    "equipment": [equip(8, 16, "bomb")],
    "weather": weather_cfg("storm", wind_x=0.4, density=0.7),
    "enemies": [], "door": (22, 5),
})

# ================= NHÓM 8: TỔ HỢP CAO CẤP (91-100) =================
MAPS.append({
    "id": "MAP000091", "name": "Expert Mix One", "group": "expert", "difficulty": 8,
    "mechanics": ["wall-jump", "enemy", "hazard"], "status": "available",
    "width": 34, "height": 18, "spawn": (2, 13),
    "ground": [(0, 6, 14)], "platforms": [(9, 11, 12), (14, 16, 14), (19, 21, 12),
                                          (24, 33, 14)],
    "hazards": [(7, 13), (12, 13), (17, 13), (22, 13), (23, 13)],
    "items": [(8, 13, "coin"), (10, 11, "gem"), (15, 13, "coin"), (20, 11, "coin")],
    "enemies": [(11, 12, 9, 14, 60), (18, 12, 16, 21, 60)], "door": (31, 13),
})
MAPS.append({
    "id": "MAP000092", "name": "Expert Water Lava", "group": "expert", "difficulty": 9,
    "mechanics": ["water", "lava", "double-jump"], "status": "available",
    "width": 32, "height": 20, "spawn": (4, 16),
    "ground": [(0, 4, 19)], "platforms": [(10, 20, 8)],
    "waterZones": [water_zone(6, 10, 6, 6)],
    "lavaZones": [lava_zone(14, 10, 6, 6)],
    "hazards": [(7, 16), (9, 16), (15, 16), (17, 16)],
    "items": [(12, 11, "coin"), (16, 11, "gem")],
    "enemies": [], "door": (22, 5),
})
MAPS.append({
    "id": "MAP000093", "name": "Expert Equipment Storm", "group": "expert", "difficulty": 9,
    "mechanics": ["flying_boots", "shield", "storm", "collect"], "status": "available",
    "width": 30, "height": 20, "spawn": (4, 16),
    "ground": [(0, 4, 18)], "platforms": [(10, 6, 20)],
    "hazards": [(5, 18), (7, 18), (21, 18), (23, 18)],
    "lavaZones": [lava_zone(4, 18, 22, 2)],
    "items": [(12, 9, "coin"), (18, 9, "gem")],
    "equipment": [equip(6, 16, "flying_boots"), equip(12, 16, "shield")],
    "weather": weather_cfg("storm", wind_x=0.3, density=0.6),
    "enemies": [], "door": (20, 5),
})
MAPS.append({
    "id": "MAP000094", "name": "Expert Bomb Lava", "group": "expert", "difficulty": 10,
    "mechanics": ["bomb", "lava", "enemy", "exit"], "status": "available",
    "width": 32, "height": 18, "spawn": (2, 13),
    "ground": [(0, 4, 12)], "platforms": [(14, 10, 20)],
    "lavaZones": [lava_zone(12, 14, 16, 4)],
    "hazards": [(13, 13), (15, 13), (17, 13), (18, 13)],
    "items": [(14, 11, "coin"), (16, 13, "bomb"), (21, 13, "gem")],
    "enemies": [(18, 12, 16, 22, 60)], "door": (30, 10),
})
MAPS.append({
    "id": "MAP000095", "name": "Expert Wall Water", "group": "expert", "difficulty": 9,
    "mechanics": ["wall-jump", "water", "enemy"], "status": "available",
    "width": 28, "height": 20, "spawn": (4, 16),
    "ground": [(0, 4, 19)], "walls": [(8, 5, 19)],
    "platforms": [(12, 8, 16)],
    "waterZones": [water_zone(10, 10, 10, 10)],
    "hazards": [(9, 17)],
    "items": [(11, 14, "coin"), (13, 9, "gem")],
    "enemies": [(12, 16, 10, 14, 55)], "door": (14, 5),
})
MAPS.append({
    "id": "MAP000096", "name": "Expert Magnet Wind", "group": "expert", "difficulty": 10,
    "mechanics": ["magnet", "wind", "collect", "gap"], "status": "available",
    "width": 34, "height": 18, "spawn": (2, 13),
    "ground": [(0, 4, 10)], "platforms": [(12, 10, 6), (18, 10, 6), (24, 10, 6),
                                          (30, 33, 16)],
    "hazards": [(11, 13), (13, 13), (19, 13), (21, 13)],
    "items": [(13, 9, "coin"), (15, 9, "coin"), (17, 9, "coin"), (19, 9, "gem"),
              (25, 9, "coin"), (27, 9, "coin")],
    "equipment": [equip(14, 13, "magnet")],
    "weather": weather_cfg("wind", wind_x=0.7, density=0.5),
    "enemies": [], "door": (31, 16),
})
MAPS.append({
    "id": "MAP000097", "name": "Expert Shield Heal", "group": "expert", "difficulty": 10,
    "mechanics": ["shield", "healing", "enemy", "lava"], "status": "available",
    "width": 30, "height": 18, "spawn": (2, 13),
    "ground": [(0, 4, 14)], "platforms": [(16, 10, 24)],
    "lavaZones": [lava_zone(14, 14, 12, 4)],
    "hazards": [(15, 13), (17, 13), (19, 13), (21, 13)],
    "items": [(16, 13, "coin"), (18, 13, "gem")],
    "equipment": [equip(15, 13, "shield"), equip(20, 13, "healing")],
    "enemies": [], "door": (26, 10),
})
MAPS.append({
    "id": "MAP000098", "name": "Expert Fly Lava", "group": "expert", "difficulty": 10,
    "mechanics": ["flying_boots", "lava", "gap", "collect"], "status": "available",
    "width": 28, "height": 20, "spawn": (2, 15),
    "ground": [(0, 4, 18)], "platforms": [(10, 8, 18)],
    "lavaZones": [lava_zone(4, 16, 20, 4)],
    "hazards": [(5, 15), (7, 15), (19, 15), (21, 15)],
    "items": [(12, 9, "coin"), (14, 9, "coin"), (16, 9, "gem")],
    "equipment": [equip(6, 15, "flying_boots")],
    "enemies": [], "door": (20, 5),
})
MAPS.append({
    "id": "MAP000099", "name": "Expert All Mix", "group": "expert", "difficulty": 10,
    "mechanics": ["wall-jump", "bomb", "enemy", "water", "lava"], "status": "available",
    "width": 34, "height": 22, "spawn": (4, 18),
    "ground": [(0, 4, 20)], "platforms": [(10, 8, 16), (20, 8, 24)],
    "waterZones": [water_zone(12, 10, 6, 8)],
    "lavaZones": [lava_zone(20, 14, 10, 6)],
    "hazards": [(8, 19), (10, 19), (18, 19), (19, 19)],
    "items": [(14, 11, "coin"), (16, 9, "bomb"), (22, 15, "gem")],
    "equipment": [equip(8, 16, "bomb")],
    "enemies": [(15, 16, 12, 18, 60)], "door": (24, 5),
})
MAPS.append({
    "id": "MAP000100", "name": "Final Knot", "group": "expert", "difficulty": 10,
    "mechanics": ["wall-jump", "double-jump", "enemy", "bomb", "exit", "shield"],
    "status": "available",
    "width": 32, "height": 22, "spawn": (4, 18),
    "ground": [(0, 4, 20)], "walls": [(8, 5, 21), (16, 5, 21)],
    "platforms": [(12, 9, 16)],
    "lavaZones": [lava_zone(6, 16, 6, 6), lava_zone(20, 16, 6, 6)],
    "hazards": [(7, 19), (9, 19), (17, 19), (19, 19)],
    "items": [(10, 13, "coin"), (14, 7, "gem"), (18, 13, "bomb")],
    "equipment": [equip(10, 16, "shield")],
    "enemies": [(13, 16, 11, 15, 60)], "door": (18, 5),
})


def build_block_list(spec):
    blocks = []
    seen = set()
    def add(tx, ty, aid):
        key = (tx, ty)
        if key in seen:
            return
        seen.add(key)
        blocks.append({"instanceId": f"tile_{tx:04d}_{ty:03d}",
                       "assetId": aid, "x": px(tx), "y": px(ty)})
    for (x0, x1, ty) in spec.get("ground", []):
        for i, tx in enumerate(range(x0, x1 + 1)):
            if x0 == x1:
                aid = TILE_MID
            elif i == 0:
                aid = TILE_LEFT
            elif i == x1 - x0:
                aid = TILE_RIGHT
            else:
                aid = TILE_MID
            add(tx, ty, aid)
    for (x0, x1, ty) in spec.get("platforms", []):
        for i, tx in enumerate(range(x0, x1 + 1)):
            if x0 == x1:
                aid = TILE_MID
            elif i == 0:
                aid = TILE_LEFT
            elif i == x1 - x0:
                aid = TILE_RIGHT
            else:
                aid = TILE_MID
            add(tx, ty, aid)
    for (tx, ty0, ty1) in spec.get("walls", []):
        for i, ty in enumerate(range(ty0, ty1 + 1)):
            if ty0 == ty1:
                aid = VT_MID
            elif i == 0:
                aid = VT_TOP
            elif i == ty1 - ty0:
                aid = VT_BOT
            else:
                aid = VT_MID
            add(tx, ty, aid)
    for (tx, ty, aid) in spec.get("blocks", []):
        add(tx, ty, aid)
    return blocks


def generate(map_ids=None):
    if map_ids is not None:
        known_ids = {spec["id"] for spec in MAPS}
        unknown_ids = set(map_ids) - known_ids
        if unknown_ids:
            raise ValueError(f"Unknown map IDs: {sorted(unknown_ids)}")
    os.makedirs(MAPS_DIR, exist_ok=True)
    written = []
    for spec in MAPS:
        map_id = spec["id"]
        if map_ids is not None and map_id not in map_ids:
            continue
        dir_path = os.path.join(MAPS_DIR, map_id)
        os.makedirs(dir_path, exist_ok=True)
        blocks = build_block_list(spec)
        data = {
            "id": map_id,
            "name": spec["name"],
            "version": 1,
            "tileSize": TILE,
            "dimensions": {"width": px(spec["width"]), "height": px(spec["height"])},
            "backgroundAssetId": BG,
            "spawn": {"x": px(spec["spawn"][0]), "y": px(spec["spawn"][1])},
            "blocks": blocks,
            "hazards": [hazard(tx, ty) for (tx, ty) in spec.get("hazards", [])],
            "exit": door(*spec["door"]),
            "enemies": [enemy(tx, ty, mn, mx, sp)
                        for (tx, ty, mn, mx, sp) in spec.get("enemies", [])],
            "items": [item(tx, ty, kind) for (tx, ty, kind) in spec.get("items", [])],
            "equipment": list(spec.get("equipment", [])),
            "waterZones": list(spec.get("waterZones", [])),
            "lavaZones": list(spec.get("lavaZones", [])),
            "weather": spec.get("weather"),
        }
        with open(os.path.join(dir_path, "map.json"), "w", encoding="utf-8") as f:
            json.dump(data, f, ensure_ascii=False, indent=2)
            f.write("\n")
        written.append(map_id)
    return written


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--map", action="append", dest="map_ids", help="Only regenerate this explicitly designed map (repeatable).")
    args = parser.parse_args()
    written = generate(args.map_ids)
    if written:
        print(f"Đã viết {len(written)} file map: {written[0]} .. {written[-1]}")
