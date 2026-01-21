import os
from fastapi import APIRouter, Depends, HTTPException, Form
from sqlalchemy import text
from sqlalchemy.orm import Session
from passlib.context import CryptContext

from app.database import get_db

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
    
    user_exists = db.execute(
        text("SELECT id FROM users WHERE email = :email LIMIT 1"),
        {"email": email},
    ).fetchone()

    if user_exists:
        raise HTTPException(status_code=400, detail="Email already exists.")
    
    hashed_password = get_password_hash(password)

    try:
        result = db.execute(
            text("""
                INSERT INTO users (email, telephone, hashed_password)
                VALUES (:email, :telephone, :hashed_password)
                RETURNING id
            """),
            {
                "email": email,
                "telephone": tel,
                "hashed_password": hashed_password
            }
        )

        user_id = result.scalar_one()

        tel_test_id = os.environ.get("TEL_TEST_ID")
        if tel_test_id:
            db.execute(
                text("""
                    INSERT INTO user_phone (phone_id, user_id)
                    VALUES (:phone_id, :user_id)
                """),
                {"phone_id": tel_test_id, "user_id": user_id}
            )

        db.commit()

        return {"message": "User created", "user_id": user_id}

    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=f"Signup failed: {str(e)}")

@router.post("/login")
async def login(
    email: str = Form(...),
    password: str = Form(...),
    db: Session = Depends(get_db)
):
    row = db.execute(
        text("""
            SELECT id, email, telephone, hashed_password
            FROM users
            WHERE email = :email
            LIMIT 1
        """),
        {"email": email}
    ).mappings().first()

    if not row:
        raise HTTPException(status_code=401, detail="User not found")

    if not verify_password(password, row["hashed_password"]):
        raise HTTPException(status_code=401, detail="Invalid password")

    return {
        "user": {
            "id": row["id"],
            "email": row["email"],
            "telephone": row["telephone"]
        }
    }