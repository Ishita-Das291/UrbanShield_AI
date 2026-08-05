from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from sqlalchemy import text
import json
from app.database import get_db



router = APIRouter()

@router.get("/api/v1/route")
def get_safe_route(
    start_lat: float, 
    start_lon: float, 
    end_lat: float, 
    end_lon: float, 
    db: Session = Depends(get_db)
):
    # This query snaps coordinates to nodes, runs pgRouting, and extracts the road geometries
    routing_query = text("""
        WITH start_node AS (
            SELECT id FROM ways_vertices_pgr
            ORDER BY geom <-> ST_SetSRID(ST_MakePoint(:start_lon, :start_lat), 4326) LIMIT 1
        ),
        end_node AS (
            SELECT id FROM ways_vertices_pgr
            ORDER BY geom <-> ST_SetSRID(ST_MakePoint(:end_lon, :end_lat), 4326) LIMIT 1
        )
        SELECT ST_AsGeoJSON(w.geom) AS geometry
        FROM pgr_dijkstra(
            'SELECT id, source, target, length AS cost FROM ways',
            (SELECT id FROM start_node),
            (SELECT id FROM end_node),
            directed := false
        ) AS route
        JOIN ways w ON route.edge = w.id;
    """)
    # Execute the query safely using SQLAlchemy
    result = db.execute(routing_query, {
        "start_lat": start_lat, 
        "start_lon": start_lon,
        "end_lat": end_lat, 
        "end_lon": end_lon
    }).fetchall()

    # Package the results into a standard GeoJSON FeatureCollection
    features = []
    for row in result:
        features.append({
            "type": "Feature",
            "geometry": json.loads(row.geometry),
            "properties": {}
        })

    return {
        "type": "FeatureCollection",
        "features": features
    }