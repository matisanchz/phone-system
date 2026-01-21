from sqlalchemy import Column, ForeignKey, Integer, String, create_engine
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker

SQLALCHEMY_DATABASE_URL = "sqlite:///./opsmind.db"
engine = create_engine(SQLALCHEMY_DATABASE_URL, connect_args={"check_same_thread": False})
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()

class User(Base):
    __tablename__ = "user"
    id = Column(Integer, primary_key=True, index=True)
    email = Column(String, unique=True, index=True)
    telephone = Column(String, unique=True, index=True)
    hashed_password = Column(String)

class UserAgent(Base):
    __tablename__ = "user_agent"
    id = Column(Integer, primary_key=True, index=True)
    agent_id = Column(String, unique=True, index=True)
    user_id = Column(Integer, ForeignKey("user.id"), nullable=False, index=True)

class UserPhone(Base):
    __tablename__ = "user_phone"
    id = Column(Integer, primary_key=True, index=True)
    phone_id = Column(String, unique=True, index=True)
    user_id = Column(Integer, ForeignKey("user.id"), nullable=False, index=True)

Base.metadata.create_all(bind=engine)

def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
