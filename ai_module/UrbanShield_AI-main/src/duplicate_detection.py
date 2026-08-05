"""
=========================================================
UrbanShield AI Duplicate Detection
=========================================================
Determines whether a newly reported hazard is a duplicate
of an existing report using:
1. Hazard class
2. GPS distance
3. Perceptual Image Hash
4. Time proximity
=========================================================
"""

from datetime import datetime
from typing import Dict, List

from src.config import (
    MAX_DISTANCE_METERS,
    HASH_THRESHOLD,
    TIME_WINDOW_MINUTES
)
from src.logger import logger
from src.utils import (
    compute_phash,
    hash_similarity,
    haversine_distance,
    minutes_difference
)

def is_duplicate(new_report: Dict, existing_reports: List[Dict]) -> Dict:
    logger.info("Checking duplicate report...")

    # Only compute the hash for the NEW image once
    new_hash = compute_phash(new_report["image"])
    new_time = datetime.fromisoformat(new_report["timestamp"])

    for report in existing_reports:
        # 1. SAME HAZARD TYPE
        if report["class_name"] != new_report["class_name"]:
            continue

        # 2. GPS DISTANCE
        distance = haversine_distance(
            new_report["latitude"], new_report["longitude"],
            report["latitude"], report["longitude"]
        )
        if distance > MAX_DISTANCE_METERS:
            continue

        # 3. IMAGE HASH (Compare directly against the stored DB string!)
        hash_dist = hash_similarity(new_hash, report["image_hash"])
        if hash_dist > HASH_THRESHOLD:
            continue

        # 4. TIME PROXIMITY
        report_time = datetime.fromisoformat(report["timestamp"])
        minutes = minutes_difference(new_time, report_time)
        if minutes > TIME_WINDOW_MINUTES:
            continue

        logger.success(f"Duplicate found: {report['id']}")
        return {
            "duplicate": True,
            "matched_report": report["id"],
            "distance_meters": round(distance, 2),
            "hash_distance": int(hash_dist),
            "minutes_difference": round(minutes, 1)
        }

    logger.info("No duplicate detected.")
    return {
        "duplicate": False,
        "matched_report": None,
        "distance_meters": None,
        "hash_distance": None,
        "minutes_difference": None
    }