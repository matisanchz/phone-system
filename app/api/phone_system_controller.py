
import datetime
import json
import os
from typing import List, Optional
from fastapi import APIRouter, Depends, File, Form, HTTPException, Query, UploadFile
import requests
from dotenv import load_dotenv
from app.database import get_db
from app.prompts.property_manager_prompt import property_manager_system_prompt, property_manager_first_message
from sqlalchemy import text

load_dotenv()

router = APIRouter()

VAPI_BASE_URL = "https://api.vapi.ai"

OCR_URL = "https://ocr.asprise.com/api/v1/receipt"

UPLOAD_DIR = "uploads"
os.makedirs(UPLOAD_DIR, exist_ok=True)

VAPI_ASSISTANT_URL = "https://api.vapi.ai/assistant"

VAPI_CALL_URL = "https://api.vapi.ai/call"

VAPI_PHONE_URL = "https://api.vapi.ai/phone-number"

VAPI_FILE_URL = "https://api.vapi.ai/file"

VAPI_API_TOKEN = os.environ.get("VAPI_API_TOKEN")
TOOL_ID = os.environ.get("TOOL_ID")

headers = {"Authorization": f"Bearer {VAPI_API_TOKEN}"}

def create_vapi_query_tool(
    *,
    tool_description: str,
    kb_name: str,
    kb_description: str,
    file_ids: List[str],
    provider: str = "google",
    model: str = "gemini-2.0-flash",
    blocking: bool = False,
    timeout_s: int = 30,
) -> str:
    """
    Creates a Vapi Query Tool using one Knowledge Base with multiple fileIds.
    Returns: tool_id
    """

    if not file_ids:
        raise HTTPException(status_code=400, detail="file_ids must not be empty")

    payload = {
        "type": "query",
        "function": {
            "name": "query_tool",
            "description": tool_description,
            "parameters": {
                "type": "object",
                "properties": {},
                "required": []
            }
        },
        "messages": [
            {
                "type": "request-start",
                "blocking": blocking
            }
        ],
        "knowledgeBases": [
            {
                "name": kb_name,
                "provider": provider,
                "model": model,
                "description": kb_description,
                "fileIds": file_ids
            }
        ]
    }

    headers = {
        "Authorization": f"Bearer {VAPI_API_TOKEN}",
        "Content-Type": "application/json"
    }

    url = f"{VAPI_BASE_URL}/tool"

    try:
        resp = requests.post(
            url,
            headers=headers,
            json=payload,
            timeout=timeout_s
        )
        resp.raise_for_status()
        data = resp.json()
    except requests.HTTPError as e:
        detail: Optional[str]
        try:
            detail = resp.text
        except Exception:
            detail = str(e)
        raise HTTPException(
            status_code=resp.status_code,
            detail=f"Vapi error creating tool: {detail}"
        )
    except requests.RequestException as e:
        raise HTTPException(
            status_code=502,
            detail=f"Network error calling Vapi: {str(e)}"
        )
    except ValueError:
        raise HTTPException(
            status_code=502,
            detail="Vapi response was not valid JSON"
        )

    tool_id = data.get("id")
    if not tool_id:
        raise HTTPException(
            status_code=502,
            detail=f"Vapi response missing tool id: {data}"
        )

    return tool_id

def extract_text_from_asprise(ocr_json: dict) -> str:
    if not isinstance(ocr_json, dict):
        return ""

    if ocr_json.get("success") is not True:
        return ""

    receipts = ocr_json.get("receipts")
    if not isinstance(receipts, list) or not receipts:
        return ""

    pages_text: list[str] = []

    for receipt in receipts:
        if not isinstance(receipt, dict):
            continue

        for key in ("ocr_text", "text", "raw_text"):
            val = receipt.get(key)
            if isinstance(val, str) and val.strip():
                pages_text.append(val.strip())
                break

    return "\n\n".join(pages_text)


def run_ocr(file_bytes: bytes, filename: str, content_type: str) -> str:
    try:
        ocr_resp = requests.post(
            OCR_URL,
            data={
                "api_key": "TEST",
                "recognizer": "auto",
                "ref_no": f"ocr_{filename}_{int(datetime.datetime.utcnow().timestamp())}"
            },
            files={
                "file": (filename, file_bytes, content_type or "application/octet-stream")
            },
            timeout=60
        )
        ocr_resp.raise_for_status()
        ocr_json = ocr_resp.json()
    except requests.RequestException as e:
        raise HTTPException(status_code=502, detail=f"OCR request failed: {str(e)}")
    except ValueError:
        raise HTTPException(status_code=502, detail="OCR response was not valid JSON")

    text = extract_text_from_asprise(ocr_json)
    if not text.strip():
        raise HTTPException(
            status_code=422,
            detail="OCR returned empty text (file may be unreadable or unsupported)."
        )
    return text


def upload_text_to_vapi(text: str, base_filename: str, headers: dict) -> str:
    txt_name = f"{base_filename.rsplit('.', 1)[0]}.txt" if base_filename else "kb.txt"
    files = {
        "file": (txt_name, text.encode("utf-8"), "text/plain; charset=utf-8")
    }
    try:
        up = requests.post(VAPI_FILE_URL, headers=headers, files=files, timeout=60)
        up.raise_for_status()
        return up.json()["id"]
    except requests.RequestException as e:
        raise HTTPException(status_code=502, detail=f"Vapi file upload failed: {str(e)}")
    except KeyError:
        raise HTTPException(status_code=502, detail="Vapi file upload response missing 'id'")

def upload_bytes_to_vapi(filename: str, content: bytes, mime: str, headers: dict) -> str:
    try:
        resp = requests.post(
            VAPI_FILE_URL,
            headers=headers,
            files={"file": (filename, content, mime)},
            timeout=60
        )
        resp.raise_for_status()
        return resp.json()["id"]
    except requests.RequestException as e:
        raise HTTPException(status_code=502, detail=f"Vapi file upload failed: {str(e)}")
    except KeyError:
        raise HTTPException(status_code=502, detail="Vapi upload response missing 'id'")

@router.post("/create-agent")
async def create_agent(
    agent_name: str = Form(...),
    first_message: str = Form(...),
    system_prompt: str = Form(...),
    user_id: str = Form(...),
    files: List[UploadFile] = File(...),
    db: requests.Session = Depends(get_db)
):
    
    if not files or len(files) == 0:
        raise HTTPException(status_code=400, detail="You must upload at least one file.")

    vapi_file_ids: List[str] = []

    for f in files:

        file_bytes = await f.read()

        ocr_text = run_ocr(
            file_bytes=file_bytes,
            filename=f.filename or "upload",
            content_type=f.content_type or "application/pdf"
        )

        vapi_file_id = upload_text_to_vapi(
            text=ocr_text,
            base_filename=f.filename or "upload.pdf",
            headers=headers
        )

        description = """Use this tool to retrieve factual information from official business documents uploaded by the user.
            Only use this tool when the caller asks specific questions about written rules, policies, procedures, or requirements.
            If the information is not explicitly stated in the documents, say that you do not have that information and do not guess."""

        kb_description = """This knowledge base contains official business documents provided by the user, such as rules, policies, procedures, guidelines, or reference materials.
            Use this knowledge base only to answer questions that require accurate and verifiable information from these documents."""
        
        vapi_file_ids.append(vapi_file_id)

        #tool_id = create_vapi_query_tool(description, "business_documents", kb_description, vapi_file_ids)

    if not vapi_file_ids:
        raise HTTPException(status_code=400, detail="All uploaded files were empty.")
    
    payload = {
        "name": agent_name,
        "firstMessage": first_message,
        "model": {
            "provider": "openai",
            "model": "gpt-4o-mini",
            "knowledgeBase": {
                "provider": "google",
                "fileIds": vapi_file_ids
            },
            "messages": [
                {
                    "role": "system",
                    "content": system_prompt
                }
            ]
            #,
            #"toolIds": [
            #    tool_id
            #]
        },
        "voice": {
            "provider": "11labs",
            "voiceId": "cgSgspJ2msm6clMCkdW9",
            "model": "eleven_turbo_v2_5",
            "stability": 0.5,
            "similarityBoost": 0.75
        }
    }

    try:
        response = requests.post(
            VAPI_ASSISTANT_URL,
            headers=headers,
            json=payload,
            timeout=60
        )
        response.raise_for_status()

        result = db.execute(
            text("""
                INSERT INTO user_agent (user_id, agent_id)
                VALUES (:user_id, :agent_id)
                RETURNING id, user_id, agent_id
            """),
            {"user_id": user_id, "agent_id": response.json()["id"]}
        )

        row = result.mappings().one()
        db.commit()
    except Exception as e:
        print(f"Exception: {e}")

    return response.json()
    
@router.get("/agents")
async def get_agents(
    user_id: str = Query(...),
    db: requests.Session = Depends(get_db)
):
    rows = db.execute(
        text("SELECT agent_id FROM user_agent WHERE user_id = :user_id"),
        {"user_id": user_id},
    ).fetchall()

    results = []

    for (agent_id,) in rows:
        try:
            resp = requests.get(f"{VAPI_ASSISTANT_URL}/{agent_id}", headers=headers, timeout=15)
            resp.raise_for_status()
            results.append(resp.json())

        except Exception as e:
            print(f"Exception: {e}")

    return results

@router.get("/phones")
async def get_phones(
    user_id: int = Query(...),
    db: requests.Session = Depends(get_db),
):
    rows = db.execute(
        text("SELECT phone_id FROM user_phone WHERE user_id = :user_id"),
        {"user_id": user_id},
    ).fetchall()

    results = []
    for (phone_id,) in rows:
        try:
            resp = requests.get(f"{VAPI_PHONE_URL}/{phone_id}", headers=headers, timeout=15)
            resp.raise_for_status()
            results.append(resp.json())
        except Exception as e:
            print(f"Exception fetching phone {phone_id}: {e}")

    return results

@router.get("/calls")
async def list_calls(
    assistant_id: str | None = Query(default=None),
    phone_id: str | None = Query(default=None)
):

    if not assistant_id and not phone_id:
        raise HTTPException(
            status_code=400,
            detail="You must provide assistant_id or phone_id"
        )

    params = {}
    if assistant_id:
        params["assistantId"] = assistant_id
    if phone_id:
        params["phoneNumberId"] = phone_id

    try:
        calls = requests.get(
            VAPI_CALL_URL,
            headers=headers,
            params=params
        )
        calls.raise_for_status()
        print(calls.json())
        return calls.json()

    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

def filter_messages(msgs: list[dict]) -> list[dict]:
    if not msgs:
        return msgs
    
    if msgs and (msgs[0].get("role") == "system"):
        msgs = msgs[1:]
    
    blocked = {"tool_calls", "tool_call_result"}
    msgs = [m for m in msgs if (m.get("role") not in blocked)]

    return msgs


@router.get("/call")
async def get_call(id: str = Query(...)):
    r = requests.get(f"{VAPI_CALL_URL}/{id}", headers=headers)
    if not r.ok:
        raise HTTPException(status_code=r.status_code, detail=r.text)

    data = r.json()

    if isinstance(data.get("messages"), list):
        data["messages"] = filter_messages(data["messages"])

    if isinstance(data.get("artifact", {}).get("messages"), list):
        data["artifact"]["messages"] = filter_messages(data["artifact"]["messages"])

    return data

@router.get("/system_prompt")
async def create_agent(
    use_case: str = Query(...),
    agent_name: str = Query(...),
):
    try:
        # TODO
        # Implement mapping logic for different default system prompts. In this case, for demo purposes, we return propery manager prompt
        return property_manager_system_prompt.format(name=agent_name)
    except Exception as e:
        print(f"Exception: {e}")

@router.get("/first_message")
async def create_agent(
    use_case: str = Query(...),
    agent_name: str = Query(...),
):
    try:
        # TODO
        # Implement mapping logic for different default system prompts. In this case, for demo purposes, we return propery manager prompt
        return property_manager_first_message.format(name=agent_name)
    except Exception as e:
        print(f"Exception: {e}")

@router.post("/test-call")
async def test_call(customer_number: str, assistant_id: str):

    headers = {
        "Authorization": f"Bearer {VAPI_API_TOKEN}",
        "Content-Type": "application/json"
    }

    payload = {
        "assistantId": assistant_id,
        "customer": {
            "number": customer_number
        },
        "phoneNumberId": os.environ.get("TEL_TEST_ID") 
    }

    try:
        response = requests.post(VAPI_CALL_URL, headers=headers, json=payload)
        response.raise_for_status()
        return response.json()
    except Exception as e:
        return {"error": str(e), "details": response.text if 'response' in locals() else None}
    
@router.delete("/delete-assistant")
async def delete_assistant(
    id: str,
    db: requests.Session = Depends(get_db)
):
    headers = {"Authorization": f"Bearer {VAPI_API_TOKEN}"}

    try:
        response = requests.delete(f"{VAPI_ASSISTANT_URL}/{id}", headers=headers, timeout=15)
        response.raise_for_status()
    except Exception as e:
        return {
            "error": str(e),
            "details": response.text if "response" in locals() else None
        }
    
    try:
        result = db.execute(
            text("DELETE FROM user_agent WHERE agent_id = :agent_id"),
            {"agent_id": id}
        )
        db.commit()

        return {"ok": True, "deleted_rows": result.rowcount}

    except Exception as e:
        db.rollback()
        raise HTTPException(
            status_code=500,
            detail=f"Error deleting assistant from DB: {str(e)}"
        )
