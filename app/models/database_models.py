import uuid
from sqlalchemy import Column, String, Float, Integer, DateTime, ForeignKey, Text, JSON, func
from sqlalchemy.dialects.postgresql import UUID
from geoalchemy2 import Geometry
from app.database import Base

class User(Base):
    __tablename__ = "users"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    firebase_uid = Column(String(128), unique=True, nullable=False)
    name = Column(String(100))
    email = Column(String(100), unique=True, nullable=False)
    reliability_reputation = Column(Float, default=1.0)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

class Incident(Base):
    __tablename__ = "incidents"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    hazard_type = Column(String(50), nullable=False)
    location = Column(Geometry(geometry_type='POINT', srid=4326), nullable=False)
    address = Column(Text, nullable=True)
    ward_id = Column(Integer, nullable=True)
    severity_score = Column(Float, default=0.0)
    reliability_score = Column(Float, default=0.0)
    status = Column(String(20), default="ACTIVE")
    report_count = Column(Integer, default=1)
    first_reported_at = Column(DateTime(timezone=True), server_default=func.now())
    last_updated_at = Column(DateTime(timezone=True), server_default=func.now())

class HazardReport(Base):
    __tablename__ = "hazard_reports"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    incident_id = Column(UUID(as_uuid=True), ForeignKey("incidents.id", ondelete="CASCADE"))
    user_id = Column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    location = Column(Geometry(geometry_type='POINT', srid=4326), nullable=False)
    image_url = Column(Text, nullable=False)
    
    # ADD THIS LINE:
    image_hash = Column(String(255), nullable=True) 
    
    ai_confidence = Column(Float)
    bounding_box = Column(JSON, nullable=True)
    weather_condition = Column(String(50), nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())