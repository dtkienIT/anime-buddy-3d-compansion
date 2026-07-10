from __future__ import annotations

from pydantic import BaseModel, Field


class SynthesizeRequest(BaseModel):
    text: str = Field(min_length=1, max_length=600)
    voice: str | None = Field(default=None, max_length=80)
    style: str | None = Field(default=None, max_length=80)
    stream: bool = True


class HealthResponse(BaseModel):
    status: str
    engine: str
    modelLoaded: bool
    warmedUp: bool


class VoiceInfo(BaseModel):
    name: str
    gender: str | None = None
    locale: str | None = "vi-VN"
