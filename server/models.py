# models.py (CONSOLIDATED & CORRECTED)
from sqlalchemy import Column, Integer, String, DateTime, Boolean, ForeignKey, CheckConstraint
from sqlalchemy.orm import relationship
from database import Base, DB_SCHEMA
from datetime import datetime

class SLAUser(Base):
    __tablename__ = 'SLAUsers_TBL'

    # Primary Key
    sluUserID_PRK = Column(Integer, primary_key=True, index=True)

    # Authentication Details
    sluUsername_TXT = Column(String(50), nullable=False, unique=True)
    sluPasswordHash_TXT = Column(String(128), nullable=False)
    sluRole_TXT = Column(String(20), nullable=False)
    
    # Audit Timestamps
    sluLastCreated_DTM = Column(DateTime(timezone=False), nullable=False, default=datetime.utcnow)
    sluLastUpdated_DTM = Column(DateTime(timezone=False), nullable=False, default=datetime.utcnow, onupdate=datetime.utcnow)
    sluLastLoggedIn_DTM = Column(DateTime(timezone=False), nullable=True)

    # CONSOLIDATED __table_args__
    __table_args__ = (
        CheckConstraint(sluRole_TXT.in_(['Management', 'Admin', 'User']), name='chk_sluRole_TXT'),
        {'schema': DB_SCHEMA} # The dictionary MUST be the last item if constraints are present
    )

    # Relationship to logs
    auth_logs = relationship("SLAAuthLog", back_populates="user")


class SLAAuthLog(Base):
    __tablename__ = 'SLAAuthLog_TBL'
    
    # Primary Key
    slaLogID_PRK = Column(Integer, primary_key=True, index=True)

    # Foreign Key to Users table
    slaUserID_FRK = Column(Integer, ForeignKey(f"{DB_SCHEMA}.SLAUsers_TBL.sluUserID_PRK"), nullable=False)

    # Event Details
    slaUsername_TXT = Column(String(50), nullable=False)
    slaActionType_TXT = Column(String(10), nullable=False)
    slaTimestamp_DTM = Column(DateTime(timezone=False), nullable=False, default=datetime.utcnow)
    slaIPAddress_TXT = Column(String(45), nullable=True)
    slaSuccess_BLN = Column(Boolean, nullable=False, default=True)
    
    # CONSOLIDATED __table_args__
    __table_args__ = (
        {'schema': DB_SCHEMA} # Just the schema dictionary remains
    )

    # Relationship to user
    user = relationship("SLAUser", back_populates="auth_logs")