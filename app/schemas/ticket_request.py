from pydantic import BaseModel

class TicketPayload(BaseModel):
    assistant_id: str
    user_id: str | None = None
    caller_name: str | None = None
    unit_number: str | None = None
    issue_summary: str
    severity: str  # "P1" | "P2" | "LOW"
    timestamp: str | None = None