HAZARD_BASE_WEIGHTS = {
    "open_manhole": 90.0,
    "manhole": 85.0,
    "flood": 80.0,
    "pothole": 45.0,
    "road_debris": 40.0,
    "hanging_wire": 95.0
}

def calculate_severity(
    hazard_type: str,
    bbox_area_ratio: float,
    rain_mm: float,
    report_count: int
) -> float:
    """
    Calculates dynamic severity (0 - 100).
    """
    base_weight = HAZARD_BASE_WEIGHTS.get(hazard_type.lower(), 50.0)
    
    # Bounding Box size contribution (up to 20 points)
    size_weight = min(bbox_area_ratio * 100.0 * 0.2, 20.0)
    
    # Weather multiplier (Rain drastically increases risk for potholes and floods)
    weather_weight = 0.0
    if hazard_type.lower() in ["pothole", "flood", "manhole"] and rain_mm > 0.0:
        weather_weight = min(rain_mm * 5.0, 15.0)
        
    # Crowdsourcing multiplier (more reports = higher severity awareness)
    crowd_weight = min((report_count - 1) * 5.0, 15.0)

    total_severity = (base_weight * 0.5) + size_weight + weather_weight + crowd_weight
    return round(min(max(total_severity, 0.0), 100.0), 1)


def calculate_reliability(
    ai_confidence: float,
    report_count: int,
    user_reputation: float = 1.0
) -> float:
    """
    Calculates hazard reliability trust score (0 - 100).
    """
    ai_factor = (ai_confidence or 0.7) * 40.0
    volume_factor = min(report_count * 15.0, 45.0)
    rep_factor = min(user_reputation * 15.0, 15.0)
    
    return round(min(ai_factor + volume_factor + rep_factor, 100.0), 1)