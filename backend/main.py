from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from routers import (
    auth, organisations, agents,
    models, admins, analytics,
    audit, alerts, notifications
)
from scheduler.jobs import start_scheduler
from dotenv import load_dotenv
import uvicorn
import os

load_dotenv()

app = FastAPI(
    title="IntelliSense IDS API",
    description="AI/ML Based Intrusion Detection System REST API",
    version="1.0.0"
)
import os

# Configure allowed CORS origins via environment variable for deployment flexibility.
# Set ALLOW_ORIGINS to a comma-separated list of origins, or '*' to allow all origins (for testing only).
raw_origins = os.getenv('ALLOW_ORIGINS', 'http://localhost:5173,https://intellisense-ids.web.app,https://intellisense-ids.firebase.com')
if raw_origins.strip() == '*':
    allowed_origins = ['*']
else:
    allowed_origins = [o.strip() for o in raw_origins.split(',') if o.strip()]

app.add_middleware(
    CORSMiddleware,
    allow_origins=allowed_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"]
)

app.include_router(auth.router)
app.include_router(organisations.router)
app.include_router(agents.router)
app.include_router(models.router)
app.include_router(admins.router)
app.include_router(analytics.router)
app.include_router(audit.router)
app.include_router(alerts.router)
app.include_router(notifications.router)

@app.on_event("startup")
async def startup_event():
    start_scheduler()
    print("IntelliSense IDS API started")

@app.on_event("shutdown")
async def shutdown_event():
    from scheduler.jobs import stop_scheduler
    stop_scheduler()

@app.get("/")
def root():
    return {
        "status": "success",
        "message": "IntelliSense IDS API is running",
        "version": "1.0.0"
    }

@app.get("/health")
def health_check():
    return {
        "status": "success",
        "message": "Server is healthy"
    }

if __name__ == "__main__":
    uvicorn.run(
        "main:app",
        host="0.0.0.0",
        port=8001,
        reload=True
    )
