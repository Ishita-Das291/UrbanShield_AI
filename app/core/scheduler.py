from apscheduler.schedulers.asyncio import AsyncIOScheduler
from sqlalchemy import text
from app.database import SessionLocal

def expire_old_hazards():
    print("🧹 [Scheduler] Running hazard auto-expiry job...")
    db = SessionLocal()
    try:
        # SQL to archive temporary hazards older than 24 hours
        expire_query = text("""
            UPDATE incidents
            SET status = 'ARCHIVED',
                last_updated_at = NOW()
            WHERE status = 'ACTIVE'
              AND hazard_type IN ('construction_work', 'accident_blockage', 'pandal_or_rally', 'waterlogging', 'storm_debris')
              AND last_updated_at < NOW() - INTERVAL '24 hours';
        """)
        result = db.execute(expire_query)
        db.commit()
        
        if result.rowcount > 0:
            print(f"✅ [Scheduler] Auto-archived {result.rowcount} expired hazards.")
        else:
            print("✨ [Scheduler] No expired hazards found.")
            
    except Exception as e:
        print(f"❌ [Scheduler] Error in auto-expiry job: {e}")
        db.rollback()
    finally:
        db.close()

def start_scheduler():
    scheduler = AsyncIOScheduler()
    # Set to run every 1 hour (you can change this to minutes=1 for testing)
    scheduler.add_job(expire_old_hazards, 'interval', hours=1)
    scheduler.start()
    print("⏱️ Background scheduler started successfully.")