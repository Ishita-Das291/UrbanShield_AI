"""
Pydantic Schemas
"""

from typing import List
from pydantic import BaseModel


class BoundingBox(BaseModel):

    x1: float
    y1: float
    x2: float
    y2: float


class Detection(BaseModel):

    class_id: int

    class_name: str

    confidence: float

    bbox: BoundingBox


class DuplicateResult(BaseModel):

    duplicate: bool

    matched_report: str | None

    distance_meters: float | None

    hash_distance: int | None


class SeverityResult(BaseModel):

    score: int

    level: str


class DetectionResponse(BaseModel):

    detections: List[Detection]
