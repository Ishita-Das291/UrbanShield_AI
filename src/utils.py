"""
Utility Functions
"""

from math import radians, sin, cos, sqrt, atan2
from pathlib import Path
from datetime import datetime

import imagehash
from PIL import Image


EARTH_RADIUS = 6371000


def validate_image(path: str):

    path = Path(path)

    if not path.exists():
        raise FileNotFoundError(path)

    return path


def compute_phash(image_path):

    image = Image.open(image_path)

    return imagehash.phash(image)


def hash_similarity(hash1, hash2):

    return hash1 - hash2


def haversine_distance(lat1, lon1, lat2, lon2):

    lat1 = radians(lat1)
    lon1 = radians(lon1)

    lat2 = radians(lat2)
    lon2 = radians(lon2)

    dlat = lat2 - lat1
    dlon = lon2 - lon1

    a = (
        sin(dlat / 2) ** 2
        + cos(lat1) * cos(lat2) * sin(dlon / 2) ** 2
    )

    c = 2 * atan2(sqrt(a), sqrt(1 - a))

    return EARTH_RADIUS * c


def minutes_difference(time1, time2):

    if isinstance(time1, str):
        time1 = datetime.fromisoformat(time1)

    if isinstance(time2, str):
        time2 = datetime.fromisoformat(time2)

    return abs((time2 - time1).total_seconds()) / 60


def bbox_area(box):

    x1, y1, x2, y2 = box

    return max(0, x2 - x1) * max(0, y2 - y1)
