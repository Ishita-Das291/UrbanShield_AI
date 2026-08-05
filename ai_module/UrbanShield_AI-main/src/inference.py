"""
=========================================================
UrbanShield AI Inference Engine
=========================================================

Loads the trained YOLO11 model and performs inference.

Author: Team Brain Waves
=========================================================
"""

from pathlib import Path
from typing import List

from ultralytics import YOLO

from src.config import (
    MODEL_PATH,
    CLASS_NAMES,
    CONFIDENCE_THRESHOLD,
    IMAGE_SIZE,
    IOU_THRESHOLD,
)

from src.logger import logger
from src.schemas import BoundingBox, Detection
from src.utils import validate_image


class HazardDetector:
    """
    Singleton YOLO Detector.
    Model is loaded only once.
    """

    def __init__(self):

        logger.info("Loading UrbanShield YOLO model...")

        if not Path(MODEL_PATH).exists():
            raise FileNotFoundError(
                f"Model not found: {MODEL_PATH}"
            )

        self.model = YOLO(MODEL_PATH)

        logger.success("Model loaded successfully.")

    def detect(
        self,
        image_path: str,
        confidence: float = CONFIDENCE_THRESHOLD,
    ) -> List[Detection]:

        validate_image(image_path)

        results = self.model.predict(
            source=image_path,
            conf=confidence,
            imgsz=IMAGE_SIZE,
            iou=IOU_THRESHOLD,
            verbose=False
        )

        detections = []

        for result in results:

            if result.boxes is None:
                continue

            for box in result.boxes:

                cls = int(box.cls.item())

                conf = float(box.conf.item())

                x1, y1, x2, y2 = map(
                    float,
                    box.xyxy[0].tolist()
                )

                detections.append(

                    Detection(

                        class_id=cls,

                        class_name=CLASS_NAMES.get(
                            cls,
                            "Unknown"
                        ),

                        confidence=round(conf, 4),

                        bbox=BoundingBox(

                            x1=x1,

                            y1=y1,

                            x2=x2,

                            y2=y2

                        )

                    )

                )

        logger.info(
            f"{len(detections)} hazards detected."
        )

        return detections


# Singleton instance
detector = HazardDetector()


def detect_hazards(image_path: str):

    """
    Public API

    Example:

    detections = detect_hazards("road.jpg")
    """

    return detector.detect(image_path)
