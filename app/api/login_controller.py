import os
from fastapi import APIRouter, Depends, HTTPException, Form
from sqlalchemy.orm import Session
from passlib.context import CryptContext

from app.database import User, UserPhone, get_db

# Security
pwd_context = CryptContext(
    schemes=["argon2"],
    deprecated="auto"
)

def get_password_hash(password):
    return pwd_context.hash(password)

def verify_password(plain_password, hashed_password):
    return pwd_context.verify(plain_password, hashed_password)

router = APIRouter()

@router.post("/signup")
async def signup(
    email: str = Form(...), 
    password: str = Form(...), 
    tel: str = Form(...),
    db: Session = Depends(get_db)
):
    user_exists = db.query(User).filter(User.email == email).first()
    if user_exists:
        raise HTTPException(status_code=400, detail="Email alredy exists.")
    
    new_user = User(
        email=email, 
        telephone=tel,
        hashed_password=get_password_hash(password)
    )
    db.add(new_user)
    db.commit()
    db.refresh(new_user)

    new_user = UserPhone(
        phone_id=os.environ.get("TEL_TEST_ID"), 
        user_id=new_user.id
    )
    db.add(new_user)
    db.commit()
    db.refresh(new_user)
    
    return {"message": "User created", "user_id": new_user.id}

@router.post("/login")
async def login(
    email: str = Form(...), 
    password: str = Form(...), 
    db: Session = Depends(get_db)
):
    user = db.query(User).filter(User.email == email).first()

    if not user:
        raise HTTPException(status_code=401, detail="User not found")

    if not verify_password(password, user.hashed_password):
        raise HTTPException(status_code=401, detail="Invalid password")

    return {
        "user": {
            "id": user.id,
            "email": user.email,
            "telephone": user.telephone
        }
    }