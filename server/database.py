# database.py
import urllib
from sqlalchemy import create_engine, event
from sqlalchemy.orm import sessionmaker, declarative_base
# Import the settings object and logger from your config module or a logging setup file
# Assuming you have a config module with the settings object
from config.config import get_settings
import logging 

# Setup logging (if not already set up globally)
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# --- Configuration using imported settings ---
DB_SCHEMA = "dbo"
Base = declarative_base()

def create_connection_string():
    """Create a properly formatted connection string for MS SQL Server"""
    
    # Reload settings just in case (though get_settings uses lru_cache)
    config = get_settings() 

    # Determine TrustServerCertificate setting
    trust_cert_value = 'no'
    if config.DB_TRUST_CERT.lower() == 'yes':
        trust_cert_value = 'yes'
        
    # Parameters for urllib.parse.quote_plus
    params = urllib.parse.quote_plus(
        f"DRIVER={{{config.DB_DRIVER}}};"
        f"SERVER={config.DB_SERVER};"
        f"DATABASE={config.DB_DATABASE};"
        f"UID={config.DB_USERNAME};"
        f"PWD={config.DB_PASSWORD};"
        f"TrustServerCertificate={trust_cert_value};"
    )
    
    # Return SQLAlchemy connection string
    return f"mssql+pyodbc:///?odbc_connect={params}"

# Create engine
engine = create_engine(
    create_connection_string(),
    echo=False,  # Set to False by default, can be toggled to True for debugging
    pool_size=5,
    max_overflow=10,
    pool_timeout=30,
    pool_recycle=3600,
)

# Event listener to create schema if it doesn't exist
@event.listens_for(engine, 'connect')
def create_schema(dbapi_connection, connection_record):
    try:
        cursor = dbapi_connection.cursor()
        cursor.execute(f"""
            IF NOT EXISTS (
                SELECT schema_name 
                FROM information_schema.schemata 
                WHERE schema_name = '{DB_SCHEMA}'
            )
            BEGIN
                EXEC('CREATE SCHEMA {DB_SCHEMA}')
            END
        """)
        cursor.close()
        dbapi_connection.commit()
    except Exception as e:
        logger.error(f"Error creating schema: {e}")

# Create session factory
SessionLocal = sessionmaker(
    bind=engine,
    autocommit=False,
    autoflush=False,
    expire_on_commit=False
)

def get_db():
    """Provide a database session dependency for FastAPI routes"""
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()

def test_connection():
    """Test database connection"""
    try:
        with engine.connect() as connection:
            logger.info("Successfully connected to the database!")
            return True
    except Exception as e:
        logger.error(f"Error connecting to the database: {e}")
        return False
        
# Test the connection immediately upon module load
test_connection()