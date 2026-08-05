from fastapi import FastAPI, Depends, HTTPException
from sqlalchemy.orm import Session
from sqlalchemy import text
from app.database import get_db
from app.api.hazards import router as hazards_router
from app.api.routing import router as routing_router  # <-- 1. ADD THIS IMPORT
from app.core.scheduler import start_scheduler
from contextlib import asynccontextmanager

@asynccontextmanager
async def lifespan(app: FastAPI):
    # This runs when the server starts
    start_scheduler()
    yield
    # Anything after yield runs when the server shuts down

app = FastAPI(
    title="UrbanShield AI - Backend Engine",
    description="Hazard Intelligence and Safe Navigation API for Kolkata",
    version="1.0.0",
    lifespan=lifespan
)

# Register endpoints
app.include_router(hazards_router)
app.include_router(routing_router)  # <-- 2. REGISTER THE ROUTER

@app.get("/")
def read_root():
    return {"message": "UrbanShield AI API is running successfully!"}

@app.get("/health")
def health_check(db: Session = Depends(get_db)):
    try:
        result = db.execute(text("SELECT PostGIS_Full_Version();")).fetchone()
        return {
            "status": "healthy",
            "database": "connected",
            "postgis_version": result[0] if result else "unknown"
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Database connection failed: {str(e)}")