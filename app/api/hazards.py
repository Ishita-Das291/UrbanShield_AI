import os
import sys
import shutil
import json
from pathlib import Path
from fastapi import APIRouter, Depends, UploadFile, File, Form, HTTPException
from sqlalchemy.orm import Session
from sqlalchemy import text
from google import genai
from google.genai import types

from app.database import get_db
from app.core.external_apis import get_weather_context
from app.core.scoring import calculate_severity, calculate_reliability

# --- Add Member 1's AI Module path ---
BASE_DIR = Path(__file__).resolve().parent.parent.parent
AI_MODULE_DIR = BASE_DIR / "ai_module" / "UrbanShield_AI-main"
if str(AI_MODULE_DIR) not in sys.path:
    sys.path.append(str(AI_MODULE_DIR))

try:
    from src.inference import detect_hazards
    print("\n✅ SUCCESS: Member 1's AI Module imported perfectly!\n")
except Exception as e:
    print(f"\n❌ CRITICAL IMPORT ERROR: {e}\n")
    detect_hazards = None
from src.utils import compute_phash

router = APIRouter(prefix="/api/v1/hazards", tags=["Hazards"])

UPLOAD_DIR = "static/uploads"
os.makedirs(UPLOAD_DIR, exist_ok=True)

def analyze_hazard_with_vision_api(image_path: str) -> dict:
    """
    Fallback Gemini Vision API for high-accuracy urban hazard classification.
    """
    try:
        api_key = os.getenv("GEMINI_API_KEY")
        if not api_key:
            print("⚠️ GEMINI_API_KEY not found in .env. Skipping fallback.")
            return None

        client = genai.Client(api_key=api_key)
        
        with open(image_path, "rb") as img_file:
            image_bytes = img_file.read()

        prompt = """
        Analyze this image for urban infrastructure and road hazards.
        Classify the hazard strictly into ONE of these categories:
        
        Road Hazards: "pothole", "broken_road", "road_cave_in"
        Civic Infrastructure: "open_manhole", "broken_drain", "broken_footpath"
        Electrical Hazards: "hanging_wire", "fallen_pole", "broken_streetlight"
        Temporary Hazards: "construction_work", "accident_blockage", "pandal_or_rally"
        Environmental Hazards: "waterlogging", "fallen_tree", "storm_debris"
        Traffic Issues: "broken_traffic_light", "blocked_intersection"
        No Hazard: "none"

        Return ONLY a raw JSON object with this exact schema:
        {"hazard_type": "waterlogging", "confidence": 0.95, "estimated_size_ratio": 0.30}
        """

        response = client.models.generate_content(
            model="gemini-3.6-flash",
            contents=[
                types.Part.from_bytes(data=image_bytes, mime_type="image/jpeg"),
                prompt
            ],
            config=types.GenerateContentConfig(
                response_mime_type="application/json"
            )
        )

        return json.loads(response.text)
    except Exception as e:
        print(f"Vision API Exception: {e}")
        return None

@router.post("/report")
async def report_hazard(
    latitude: float = Form(...),
    longitude: float = Form(...),
    user_id: str = Form(None),
    file: UploadFile = File(...),
    db: Session = Depends(get_db)
):
    file_path = os.path.join(UPLOAD_DIR, file.filename)
    with open(file_path, "wb") as buffer:
        shutil.copyfileobj(file.file, buffer)

    # Base defaults
    detected_class = "pothole"
    ai_confidence = 0.0
    bbox_area_ratio = 0.10
    needs_second_opinion = True

    # --- 1. PRIMARY PASS: Local YOLO Model ---
    if detect_hazards:
        try:
            print(f"\n🚀 Running Local AI Inference on: {file.filename}")
            ai_result = detect_hazards(file_path)
            
            if ai_result and len(ai_result) > 0:
                top_hazard = ai_result[0]
                detected_class = top_hazard.class_name.lower()
                ai_confidence = float(top_hazard.confidence)
                
                width = abs(top_hazard.bbox.x2 - top_hazard.bbox.x1)
                height = abs(top_hazard.bbox.y2 - top_hazard.bbox.y1)
                bbox_area_ratio = min((width * height) / (640 * 640), 1.0)

                print(f"🎯 Local AI Output: {detected_class} ({ai_confidence:.2f})")
                
                # If the local model is confident, we skip the API fallback
                if ai_confidence >= 0.60:
                    needs_second_opinion = False
            else:
                print("⚠️ Local AI found NO hazards.")
                
        except Exception as e:
            print(f"\n❌ LOCAL INFERENCE ERROR: {e}\n")

    # --- 2. SECONDARY PASS: Gemini API Fallback ---
    if needs_second_opinion:
        print(f"🔄 Low confidence ({ai_confidence:.2f}) or missing detection. Requesting Vision API fallback...")
        api_result = analyze_hazard_with_vision_api(file_path)
        
        if api_result and api_result.get("hazard_type") != "none":
            detected_class = api_result.get("hazard_type", detected_class)
            ai_confidence = float(api_result.get("confidence", 0.90))
            bbox_area_ratio = float(api_result.get("estimated_size_ratio", bbox_area_ratio))
            print(f"✅ Vision API Override: {detected_class} ({ai_confidence:.2f})")

    # --- 3. Database & Spatial Deduplication Logic ---
    weather = await get_weather_context(latitude, longitude)

    spatial_dedup_query = text("""
        SELECT id, report_count, severity_score 
        FROM incidents 
        WHERE hazard_type = :hazard_type 
          AND status = 'ACTIVE'
          AND ST_DWithin(
                location::geography, 
                ST_SetSRID(ST_MakePoint(:lon, :lat), 4326)::geography, 
                15
              )
        LIMIT 1;
    """)

    result = db.execute(spatial_dedup_query, {
        "hazard_type": detected_class,
        "lon": longitude,
        "lat": latitude
    }).fetchone()

    if result:
        incident_id = result.id
        new_count = result.report_count + 1
        new_severity = calculate_severity(detected_class, bbox_area_ratio, weather["rain_mm"], new_count)
        new_reliability = calculate_reliability(ai_confidence, new_count)

        update_incident_query = text("""
            UPDATE incidents 
            SET report_count = :count,
                severity_score = :severity,
                reliability_score = :reliability,
                last_updated_at = NOW()
            WHERE id = :id;
        """)
        db.execute(update_incident_query, {
            "count": new_count, "severity": new_severity, "reliability": new_reliability, "id": incident_id
        })
        is_merged = True
    else:
        initial_severity = calculate_severity(detected_class, bbox_area_ratio, weather["rain_mm"], 1)
        initial_reliability = calculate_reliability(ai_confidence, 1)

        insert_incident_query = text("""
            INSERT INTO incidents (hazard_type, location, severity_score, reliability_score, report_count)
            VALUES (:hazard_type, ST_SetSRID(ST_MakePoint(:lon, :lat), 4326), :severity, :reliability, 1)
            RETURNING id;
        """)
        new_incident = db.execute(insert_incident_query, {
            "hazard_type": detected_class, "lon": longitude, "lat": latitude,
            "severity": initial_severity, "reliability": initial_reliability
        }).fetchone()
        incident_id = new_incident.id
        is_merged = False

    # Calculate the image hash
    new_image_hash = compute_phash(file_path)

    insert_report_query = text("""
        INSERT INTO hazard_reports (incident_id, location, image_url, image_hash, ai_confidence, weather_condition)
        VALUES (:incident_id, ST_SetSRID(ST_MakePoint(:lon, :lat), 4326), :image_url, :image_hash, :confidence, :weather);
    """)
    db.execute(insert_report_query, {
        "incident_id": incident_id, "lon": longitude, "lat": latitude, "image_url": file_path,
        "image_hash": new_image_hash,
        "confidence": ai_confidence, "weather": f"Rain: {weather['rain_mm']}mm"
    })
    db.commit()

    return {
        "status": "success",
        "is_duplicate_merged": is_merged,
        "incident_id": str(incident_id),
        "hazard_detected": detected_class,
        "confidence": ai_confidence,
    }

from fastapi import Query

@router.get("/nearby")
async def get_nearby_hazards(
    latitude: float = Query(..., description="User's current latitude"),
    longitude: float = Query(..., description="User's current longitude"),
    radius_meters: float = Query(2000.0, description="Search radius in meters"),
    db: Session = Depends(get_db)
):
    """
    Fetch all active hazards within a specific radius of the user.
    Results are ordered by distance (closest first).
    """
    
    # PostGIS query to find points within radius and calculate exact distance
    nearby_query = text("""
        SELECT 
            id,
            hazard_type,
            severity_score,
            reliability_score,
            report_count,
            ST_X(location::geometry) AS lng,
            ST_Y(location::geometry) AS lat,
            ST_Distance(
                location::geography, 
                ST_SetSRID(ST_MakePoint(:user_lon, :user_lat), 4326)::geography
            ) AS distance_meters
        FROM incidents
        WHERE status = 'ACTIVE'
          AND ST_DWithin(
                location::geography, 
                ST_SetSRID(ST_MakePoint(:user_lon, :user_lat), 4326)::geography, 
                :radius
              )
        ORDER BY distance_meters ASC;
    """)

    results = db.execute(nearby_query, {
        "user_lon": longitude,
        "user_lat": latitude,
        "radius": radius_meters
    }).fetchall()

    hazards_list = []
    for row in results:
        hazards_list.append({
            "incident_id": str(row.id),
            "hazard_type": row.hazard_type,
            "severity_score": float(row.severity_score),
            "reliability_score": float(row.reliability_score),
            "report_count": row.report_count,
            "latitude": float(row.lat),
            "longitude": float(row.lng),
            "distance_meters": round(float(row.distance_meters), 2)
        })

    return {
        "status": "success",
        "count": len(hazards_list),
        "radius_used": radius_meters,
        "data": hazards_list
    }

from fastapi import Path

@router.patch("/{incident_id}/status")
async def update_incident_status(
    incident_id: str = Path(..., description="The UUID of the incident"),
    new_status: str = Query(..., description="E.g., UNDER_REPAIR, RESOLVED, ARCHIVED"),
    db: Session = Depends(get_db)
):
    """
    Update the lifecycle status of a specific hazard incident.
    Primarily used by the KMC Civic Dashboard.
    """
    valid_statuses = ['REPORTED', 'VERIFIED', 'ACTIVE', 'UNDER_REPAIR', 'RESOLVED', 'ARCHIVED']
    status_upper = new_status.upper()
    
    if status_upper not in valid_statuses:
        raise HTTPException(
            status_code=400, 
            detail=f"Invalid status. Must be one of: {', '.join(valid_statuses)}"
        )

    # PostGIS update query
    update_query = text("""
        UPDATE incidents 
        SET status = :status, 
            last_updated_at = NOW()
        WHERE id = :id
        RETURNING id, status;
    """)
    
    result = db.execute(update_query, {"status": status_upper, "id": incident_id}).fetchone()
    db.commit()

    if not result:
        raise HTTPException(status_code=404, detail="Incident not found.")

    return {
        "status": "success",
        "incident_id": str(result.id),
        "new_status": result.status,
        "message": "Incident lifecycle updated successfully."
    }

@router.get("/analytics/summary")
async def get_analytics_summary(db: Session = Depends(get_db)):
    """
    Get high-level analytics for the React Civic Dashboard.
    Provides total counts by status and a breakdown of active hazards.
    """
    # 1. Get total counts grouped by lifecycle status
    status_query = text("""
        SELECT status, COUNT(id) as count
        FROM incidents
        GROUP BY status;
    """)
    
    # 2. Get the breakdown of active hazards by type
    type_query = text("""
        SELECT hazard_type, COUNT(id) as count, AVG(severity_score) as avg_severity
        FROM incidents
        WHERE status = 'ACTIVE'
        GROUP BY hazard_type
        ORDER BY count DESC;
    """)

    status_results = db.execute(status_query).fetchall()
    type_results = db.execute(type_query).fetchall()

    # Format the data for the frontend
    status_counts = {row.status: row.count for row in status_results}
    active_breakdown = [
        {
            "hazard_type": row.hazard_type, 
            "count": row.count, 
            "average_severity": round(float(row.avg_severity), 2)
        } 
        for row in type_results
    ]

    return {
        "status": "success",
        "overview": {
            "total_active": status_counts.get("ACTIVE", 0),
            "total_under_repair": status_counts.get("UNDER_REPAIR", 0),
            "total_resolved": status_counts.get("RESOLVED", 0),
        },
        "active_hazards_breakdown": active_breakdown
    }