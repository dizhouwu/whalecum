"""
WhaleCum - 13F Hedge Fund Tracker
Backend API for fetching and analyzing SEC 13F filings
"""
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from api import funds, holdings, insights, security

app = FastAPI(
    title="WhaleCum 13F Tracker",
    description="Track hedge fund 13F filings and investment insights",
    version="0.1.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://127.0.0.1:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(funds.router, prefix="/api/funds", tags=["funds"])
app.include_router(holdings.router, prefix="/api/holdings", tags=["holdings"])
app.include_router(insights.router, prefix="/api/insights", tags=["insights"])
app.include_router(security.router, prefix="/api/security", tags=["security"])


@app.get("/")
def root():
    return {"message": "WhaleCum 13F Tracker API", "docs": "/docs"}


@app.get("/health")
def health():
    return {"status": "ok"}
