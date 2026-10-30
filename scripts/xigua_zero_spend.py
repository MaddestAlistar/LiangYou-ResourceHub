#!/usr/bin/env python3
"""Fail-closed SandBase guard for workflows with a strict zero-billing policy.

SandBase's 100 free data-API calls are shared across the entire organization.
Overage is chargeable if the org has funded balance or a credit line. This
guard deliberately disables data-API requests for funded organizations.
"""
import json
import urllib.request
from decimal import Decimal, InvalidOperation
from datetime import datetime, timezone
from pathlib import Path

class FreeQuotaStop(Exception):
    pass

def funded_capacity_is_zero(key, opener=urllib.request.urlopen):
    """Read-only public Account API. On missing/ambiguous balance, deny."""
    request=urllib.request.Request(
        "https://api.sandbase.ai/v1/account/balance",
        headers={"Authorization": "Bearer "+key, "Accept":"application/json"})
    with opener(request,timeout=12) as response:
        data=json.loads(response.read(30000))
    if not isinstance(data,dict):
        return False
    try:
        balance=Decimal(str(data["balance"]))
        limit=Decimal(str(data.get("credit_limit") or "0"))
    except (InvalidOperation,KeyError,TypeError,ValueError):
        return False
    return balance == 0 and limit == 0

class LocalFreeBudget:
    def __init__(self,path,day=None,daily_cap=1,run_cap=1):
        self.path=Path(path)
        self.day=day or datetime.now(timezone.utc).strftime("%Y-%m-%d")
        self.daily_cap=max(0,min(1,int(daily_cap)))
        self.run_cap=max(0,min(1,self.daily_cap,int(run_cap)))
        try: old=json.loads(self.path.read_text(encoding="utf8"))
        except (OSError,ValueError):old={}
        # Corrupt ledgers do not reset a same-day counter.
        if old.get("utcDay")==self.day:
            try: self.used=max(0,int(old["calls"]))
            except (KeyError,TypeError,ValueError):self.used=self.daily_cap
        else:
            self.used=0
        self.this_run=0

    def authorize(self):
        if self.this_run>=self.run_cap or self.used>=self.daily_cap:
            raise FreeQuotaStop("local_free_limit_reached")
        # Count potentially charged requests before sending. No automatic retries.
        self.used+=1
        self.this_run+=1
        self.save()

    def save(self):
        self.path.parent.mkdir(parents=True,exist_ok=True)
        self.path.write_text(json.dumps({
            "schema":1,"utcDay":self.day,"calls":self.used,
            "localDailyCap":self.daily_cap
        },separators=(",",":"))+"\n",encoding="utf8")
