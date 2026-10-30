import json
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from xigua_zero_spend import funded_capacity_is_zero, LocalFreeBudget, FreeQuotaStop

class FakeResponse:
    def __init__(self, body):
        self.body=json.dumps(body).encode("utf8")
    def __enter__(self):
        return self
    def __exit__(self, *_):
        return False
    def read(self, *_):
        return self.body

class ZeroSpendSafety(unittest.TestCase):
    def get_balance(self, payload):
        def opener(request, timeout=12):
            self.assertEqual(request.full_url,"https://api.sandbase.ai/v1/account/balance")
            self.assertEqual(request.headers.get("Authorization"),"Bearer dummy")
            return FakeResponse(payload)
        return funded_capacity_is_zero("dummy",opener=opener)

    def test_only_fully_unfunded_account_can_search(self):
        self.assertTrue(self.get_balance({"balance":"0","credit_limit":"0"}))
        self.assertTrue(self.get_balance({"balance":"0","credit_limit":None}))
        self.assertFalse(self.get_balance({"balance":"0.01","credit_limit":"0"}))
        self.assertFalse(self.get_balance({"balance":"0","credit_limit":"1"}))
        self.assertFalse(self.get_balance({"balance":"not-a-number","credit_limit":"0"}))
        self.assertFalse(self.get_balance({"credit_limit":"0"}))
        self.assertFalse(self.get_balance({"balance":"-1","credit_limit":"0"}))

    def test_free_budget_persists_across_workflow_runs(self):
        with tempfile.TemporaryDirectory() as folder:
            path=Path(folder)/"budget.json"
            b=LocalFreeBudget(path,day="2026-10-30",daily_cap=3,run_cap=2)
            b.authorize();b.authorize()
            with self.assertRaises(FreeQuotaStop):b.authorize()
            second=LocalFreeBudget(path,day="2026-10-30",daily_cap=3,run_cap=2)
            self.assertEqual(second.used,2)
            second.authorize()
            with self.assertRaises(FreeQuotaStop):second.authorize()
            self.assertEqual(json.loads(path.read_text())["calls"],3)
            tomorrow=LocalFreeBudget(path,day="2026-10-31",daily_cap=3,run_cap=2)
            self.assertEqual(tomorrow.used,0)

    def test_invalid_same_day_ledger_fails_closed(self):
        with tempfile.TemporaryDirectory() as folder:
            path=Path(folder)/"budget.json"
            path.write_text('{"utcDay":"2026-10-30","calls":"corrupt"}')
            b=LocalFreeBudget(path,day="2026-10-30",daily_cap=20,run_cap=8)
            with self.assertRaises(FreeQuotaStop):b.authorize()

    def test_search_attempt_consumes_budget_even_on_error(self):
        from refresh_media_xigua_videos import search
        with tempfile.TemporaryDirectory() as folder:
            path=Path(folder)/"budget.json"
            b=LocalFreeBudget(path,day="2026-10-30",daily_cap=2,run_cap=2)
            with patch("refresh_media_xigua_videos.json_request",side_effect=ValueError("upstream error")):
                with self.assertRaises(FreeQuotaStop):search("某电影 预告","dummy",b)
            self.assertEqual(b.used,1)
            self.assertEqual(json.loads(path.read_text())["calls"],1)
            b2=LocalFreeBudget(path,day="2026-10-30",daily_cap=2,run_cap=2)
            self.assertEqual(b2.used,1)

if __name__=="__main__":
    unittest.main()
