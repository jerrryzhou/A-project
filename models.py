from pydantic import BaseModel
from typing import List, Optional


# ── Step 1: goal parsing ──────────────────────────────────────────────────────

class SearchCriteria(BaseModel):
    roles: List[str]
    """Job title variations to search, e.g. ["Founder", "Co-Founder", "CEO", "CTO"]"""

    industries: List[str]
    """Industry keywords, e.g. ["fintech", "financial technology", "payments"]"""

    locations: List[str]
    """City/region variations, e.g. ["New York City", "New York", "NYC"]"""

    seniority: List[str]
    """Apollo seniority levels: founder, c_suite, vp, director, manager, senior, entry"""

    keywords: List[str]
    """Extra search keywords, e.g. ["Series A", "YC", "seed stage"]"""

    timeframe_days: int
    """How many days ahead the user wants to meet (default 30)"""

    meeting_goal: str
    """One-sentence plain-English summary of what the user wants"""


# ── Step 2: raw contacts from Apollo ─────────────────────────────────────────

class RawContact(BaseModel):
    name: str
    title: str
    company: str
    company_industry: Optional[str] = None
    location: Optional[str] = None
    linkedin_url: Optional[str] = None
    email: Optional[str] = None
    headline: Optional[str] = None


# ── Step 3: ranked results from Claude ───────────────────────────────────────

class RankedContact(BaseModel):
    rank: int
    name: str
    title: str
    company: str
    location: Optional[str] = None
    linkedin_url: Optional[str] = None
    email: Optional[str] = None
    relevance_score: int
    """1–10 score for how well this person matches the goal"""

    why_relevant: str
    """1–2 sentence explanation of why this person is worth meeting"""

    talking_points: List[str]
    """2–3 concrete conversation starters based on their role/company"""


class RankedResults(BaseModel):
    contacts: List[RankedContact]
    total_searched: int
    criteria_summary: str


# ── Step 4: outreach drafts ───────────────────────────────────────────────────

class OutreachDraft(BaseModel):
    contact_name: str

    linkedin_note: str
    """Connection request note — must be ≤300 characters, warm and specific"""

    email_subject: str
    email_body: str
    """~100-word email, plain and direct, no fluff"""
