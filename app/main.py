from fastapi import FastAPI, Depends, HTTPException
from sqlalchemy.orm import Session
from sqlalchemy import text
from app.database import get_db
from app.api.hazards import router as hazards_router
from app.api.routing import router as routing_router
from app.core.scheduler import start_scheduler
from contextlib import asynccontextmanager
from fastapi.middleware.cors import CORSMiddleware

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

# --- CORS MIDDLEWARE INJECTED HERE ---
# This explicitly tells your backend to accept requests from your React frontend
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Allows requests from any origin (e.g., Vercel, Localhost)
    allow_credentials=True,
    allow_methods=["*"],  # Allows all HTTP methods (POST, GET, PATCH, etc.)
    allow_headers=["*"],  # Allows all headers
)
# -------------------------------------

# Register endpoints
app.include_router(hazards_router)
app.include_router(routing_router)

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