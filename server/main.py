# main.py
from fastapi import FastAPI
from routers import auth_routes, dashboard_routes
from database import Base, engine # Import Base and engine to create tables

# Create all defined tables in the database (run once on startup)
Base.metadata.create_all(bind=engine)

app = FastAPI(
    title="SLA Penalty Module API",
    version="1.0.0"
)

# Include the authentication router
app.include_router(auth_routes.router)
app.include_router(dashboard_routes.router)

@app.get("/")
def read_root():
    return {"message": "SLA Penalty Module API is running"}