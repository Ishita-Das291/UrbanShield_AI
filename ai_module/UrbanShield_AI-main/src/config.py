from dataclasses import dataclass
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent.parent

MODEL_PATH = BASE_DIR / "model" / "best.pt"

CLASS_NAMES = {
    0: "Pothole",
    1: "Flood",
    2: "Manhole",
    3: "Road_Debris"
}

CONFIDENCE_THRESHOLD = 0.35
IOU_THRESHOLD = 0.45
IMAGE_SIZE = 640

# Duplicate Detection
MAX_DISTANCE_METERS = 30
HASH_THRESHOLD = 8
TIME_WINDOW_MINUTES = 30

# Severity Weights
HAZARD_WEIGHT = {
    "Pothole": 40,
    "Flood": 55,
    "Manhole": 70,
    "Road_Debris": 45
}

WEATHER_WEIGHT = {
    "Clear": 0,
    "Cloudy": 5,
    "Rain": 10,
    "Heavy Rain": 15
}

MAX_COMMUNITY_SCORE = 10
