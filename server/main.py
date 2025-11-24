# main.py
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from routers import auth_routes, dashboard_routes, master_data_routes, report_routes
from database import Base, engine 
from config.config import settings

# Create all defined tables in the database (run once on startup)
Base.metadata.create_all(bind=engine)

app = FastAPI(
    title="SLA Penalty Module API",
    version="1.0.0"
)

# --- CORS MIDDLEWARE CONFIGURATION ---
# Split the comma-separated string from config.py into a list of origins
allowed_origins_list = settings.ALLOWED_ORIGINS.split(',')

app.add_middleware(
    CORSMiddleware,
    allow_origins=allowed_origins_list,  # List of origins that should be permitted to make requests
    allow_credentials=True,             # Allow cookies to be included in requests
    allow_methods=["*"],                # Allow all methods (GET, POST, etc.)
    allow_headers=["*"],                # Allow all headers (including Authorization header for JWT)
)
# ------------------------------------

# Include the authentication router
app.include_router(auth_routes.router)
app.include_router(dashboard_routes.router)
app.include_router(master_data_routes.router)
app.include_router(report_routes.router)

@app.get("/")
def read_root():
    return {"message": "SLA Penalty Module API is running"}