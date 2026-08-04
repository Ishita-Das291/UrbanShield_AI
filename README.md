# UrbanShield AI

AI module for UrbanShield - An AI-powered Urban Hazard Intelligence Platform.

---

## Features

- YOLO11 Hazard Detection
- Duplicate Report Detection
- Dynamic Severity Scoring
- FastAPI Ready
- Modular Architecture

---

## Hazard Classes

| ID | Class |
|----|-------|
|0|Pothole|
|1|Flood|
|2|Manhole|
|3|Road Debris|

---

## Installation

pip install -r requirements.txt

---

## Model

Place **best.pt** inside

model/

---

## Usage

```python
from src.inference import detect_hazards
