# Data shapes for the AI helper endpoint

from typing import Literal

from pydantic import BaseModel, Field

MAX_QUESTION_LENGTH = 500


class HelperRequest(BaseModel):
    # What the dashboard sends: the human agent's typed question
    question: str = Field(min_length=1, max_length=MAX_QUESTION_LENGTH)


class HelperRow(BaseModel):
    # One answer row: which file it came from and the exact text.
    file: str
    title: str
    excerpt: str


class HelperResponse(BaseModel):
    # What the endpoint sends back.
    status: Literal["found", "not_found", "unavailable"]
    rows: list[HelperRow] = []
