from src.inference import detect_hazards

detections = detect_hazards(
    "examples/test_image.jpg"
)

for d in detections:

    print(d)
