#!/usr/bin/env python3
"""Merge persisted Xigua UTC budget counters without stale Actions rollback."""
import json
import sys
from pathlib import Path

LIMIT = 24

def merge_budgets(current, incoming):
    for record in (current, incoming):
        if not isinstance(record,dict) or record.get("schema") != 1:
            raise ValueError("invalid_budget_schema")
        if not isinstance(record.get("utcDay"),str):
            raise ValueError("invalid_budget_day")
        if not isinstance(record.get("calls"),int) or isinstance(record["calls"],bool):
            raise ValueError("invalid_budget_count")
        if not 0 <= record["calls"] <= LIMIT:
            raise ValueError("budget_out_of_range")
    a=current["utcDay"]
    b=incoming["utcDay"]
    if a == b:
        chosen=dict(incoming)
        chosen["calls"]=max(current["calls"],incoming["calls"])
    else:
        chosen=dict(current if a > b else incoming)
    chosen["schema"]=1
    chosen["localDailyCap"]=LIMIT
    return chosen

def main():
    if len(sys.argv)!=3:
        raise SystemExit("usage: merge_xigua_budget.py <current> <incoming>")
    current_file,incoming_file=map(Path,sys.argv[1:])
    current=json.loads(current_file.read_text(encoding="utf8"))
    incoming=json.loads(incoming_file.read_text(encoding="utf8"))
    merged=merge_budgets(current,incoming)
    current_file.write_text(json.dumps(merged,separators=(",",":"))+"\n",encoding="utf8")
    print("XIGUA_BUDGET_MERGED",merged["utcDay"],merged["calls"],merged["localDailyCap"])

if __name__=="__main__":
    main()
