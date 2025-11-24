# config/config.py
from pydantic_settings import BaseSettings
from functools import lru_cache

class Settings(BaseSettings):
    # Database
    DB_DRIVER: str
    DB_SERVER: str
    DB_DATABASE: str
    DB_USERNAME: str
    DB_PASSWORD: str
    DB_TRUST_CERT: str = "yes"
    ALLOWED_ORIGINS: str

    # Security
    SECRET_KEY: str
    ALGORITHM: str
    ACCESS_TOKEN_EXPIRE_MINUTES: int

    # Construct the ODBC connection string
    @property
    def DATABASE_URL(self) -> str:
        # MSSQL connection string format for pyodbc
        return (
            f"DRIVER={{{self.DB_DRIVER}}};"
            f"SERVER={self.DB_SERVER};"
            f"DATABASE={self.DB_DATABASE};"
            f"UID={self.DB_USERNAME};"
            f"PWD={self.DB_PASSWORD};"
        )
    
    # Configure the location of the .env file
    class Config:
        env_file = ".env"
        env_file_encoding = "utf-8"

# Use lru_cache to ensure the settings object is instantiated only once
@lru_cache()
def get_settings():
    return Settings()

# Instantiate the settings for use in database.py
settings = get_settings()