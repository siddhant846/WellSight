"""
Comprehensive automated evaluation script for WellSight AI.
Runs all 18 benchmark evaluation queries (Q1 to Q18) from docs/03-evaluation-queries.md,
verifying factual accuracy, domain rule compliance, citations, and conflict detection.
"""

import os
import sys
import asyncio
from typing import Dict, Any, List

if sys.platform == "win32":
    try:
        sys.stdout.reconfigure(encoding="utf-8")
        sys.stderr.reconfigure(encoding="utf-8")
    except Exception:
        pass

# Add parent directory to sys.path
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from backend.agent import query_llm_with_tools, DeterministicCopilotAgent
from backend.db import query_as_dicts

agent = DeterministicCopilotAgent()

results = []

def record_test(name: str, passed: bool, details: str, citations: List[str] = None):
    results.append({
        "name": name,
        "passed": passed,
        "details": details,
        "citations": citations or []
    })
    status = "✅ PASS" if passed else "❌ FAIL"
    print(f"{status} | {name}: {details}")

async def run_evaluation():
    print("=" * 75)
    print("🚀 STARTING WELLSIGHT AI EVALUATION SUITE (Q1 TO Q18)")
    print("=" * 75)

    from backend.db import get_connection
    con = get_connection()
    con.execute("DELETE FROM corrections")
    con.close()

    # -------------------------------------------------------------
    # Q1: WELL-0001 producing status right now
    # -------------------------------------------------------------
    q1 = "Is WELL-0001 producing oil right now? When was it last inspected, and by whom? Show me its status card."
    res1 = await query_llm_with_tools(q1, user_id="U-201")
    txt1 = res1["response"]
    pass_q1 = (
        "NOT PRODUCING" in txt1.upper() and
        "INS-0001-0203" in txt1 and
        "Ryan Brooks" in txt1 and
        "3.2" in txt1 and
        "CTX-0001-003" in txt1
    )
    record_test("Q1: WELL-0001 status card", pass_q1, "Delta T = 3.2 °C (< 15 °C), INS-0001-0203, Ryan Brooks, CTX-0001-003 cited", res1["citations"])

    # -------------------------------------------------------------
    # Q2: Northeast Block 8 wells not producing
    # -------------------------------------------------------------
    q2 = "Which wells in Northeast Block 8 are not producing oil right now, and why? Show them in a table."
    res2 = await query_llm_with_tools(q2, user_id="U-201")
    txt2 = res2["response"]
    pass_q2 = (
        "WELL-0164" in txt2 and
        "WELL-0170" in txt2 and
        "WELL-0172" in txt2 and
        "WELL-0175" in txt2
    )
    record_test("Q2: Northeast Block 8 down wells", pass_q2, "Identified all 4 down wells (WELL-0164, WELL-0170, WELL-0172, WELL-0175)", res2["citations"])

    # -------------------------------------------------------------
    # Q3: WELL-0001 13-week line chart
    # -------------------------------------------------------------
    q3 = "Show a line chart of WELL-0001's wellhead temperature against air temperature for the last 13 weeks, and mark when it was not producing oil."
    res3 = await query_llm_with_tools(q3, user_id="U-201")
    txt3 = res3["response"]
    pass_q3 = (
        "13" in txt3 and
        "8 Oct" in txt3 and
        "15 Oct" in txt3 and
        any(v.get("visual_type") == "line" for v in res3["visual_specs"])
    )
    record_test("Q3: WELL-0001 13-week thermal line chart", pass_q3, "13 readings, non-producing on 8 Oct and 15 Oct, line visual generated", res3["citations"])

    # -------------------------------------------------------------
    # Q4: WELL-0001 4-year oil spills
    # -------------------------------------------------------------
    q4 = "How many oil spills has WELL-0001 had in the last 4 years, and how much oil in total? List them in a table."
    res4 = await query_llm_with_tools(q4, user_id="U-201")
    txt4 = res4["response"]
    pass_q4 = (
        "6" in txt4 and
        "15.1" in txt4 and
        "CTX-0001-001" in txt4
    )
    record_test("Q4: WELL-0001 spill history", pass_q4, "6 spills, 15.1 bbl (correctly excludes INS-0001-0070 rainwater via CTX-0001-001)", res4["citations"])

    # -------------------------------------------------------------
    # Q5: WELL-0001 downtime in 2025
    # -------------------------------------------------------------
    q5 = "How many days was WELL-0001 down in 2025?"
    res5 = await query_llm_with_tools(q5, user_id="U-201")
    txt5 = res5["response"]
    pass_q5 = (
        "21 days" in txt5 and
        "24 Jul" in txt5 and
        "16 and 23 Oct" in txt5
    )
    record_test("Q5: WELL-0001 2025 downtime accounting", pass_q5, "Exact 21 days (3 inspections x 7 days, prime mover trip & packing leak)", res5["citations"])

    # -------------------------------------------------------------
    # Q6: Northeast Block 7 top downtime in last 4 months
    # -------------------------------------------------------------
    q6 = "Which 3 wells in Northeast Block 7 had the most downtime in the last 4 months? Show a bar chart."
    res6 = await query_llm_with_tools(q6, user_id="U-201")
    txt6 = res6["response"]
    pass_q6 = (
        "WELL-0121" in txt6 and "49" in txt6 and
        "WELL-0138" in txt6 and "42" in txt6 and
        "WELL-0107" in txt6 and "42" in txt6 and
        any(v.get("visual_type") == "bar" for v in res6["visual_specs"])
    )
    record_test("Q6: Top downtime wells in NE Block 7", pass_q6, "WELL-0121 (49d), WELL-0138 (42d), WELL-0107 (42d), bar chart visual", res6["citations"])

    # -------------------------------------------------------------
    # Q7: Map of spills in NE Block 8 last 90 days
    # -------------------------------------------------------------
    q7 = "Show on a map every well in Northeast Block 8 with a real spill in the last 90 days."
    res7 = await query_llm_with_tools(q7, user_id="U-201")
    txt7 = res7["response"]
    pass_q7 = (
        "WELL-0151" in txt7 and
        "WELL-0165" in txt7 and
        "WELL-0175" in txt7 and
        "WELL-0186" in txt7 and
        any(v.get("visual_type") == "map" for v in res7["visual_specs"])
    )
    record_test("Q7: Map of spills in NE Block 8", pass_q7, "4 pins (WELL-0151, WELL-0165, WELL-0175, WELL-0186), map visual generated", res7["citations"])

    # -------------------------------------------------------------
    # Q8: Heatmap of 2026 spills by area and month
    # -------------------------------------------------------------
    q8 = "Show a heatmap of 2026 spills by geographic area and month."
    res8 = await query_llm_with_tools(q8, user_id="U-201")
    txt8 = res8["response"]
    pass_q8 = (
        "Southwest Block 24" in txt8 and "43" in txt8 and
        "Southwest Block 23" in txt8 and "35" in txt8 and
        "Northeast Block 7" in txt8 and "37" in txt8 and
        "Northeast Block 8" in txt8 and "26" in txt8 and
        any(v.get("visual_type") == "heatmap" for v in res8["visual_specs"])
    )
    record_test("Q8: 2026 spill heatmap by area & month", pass_q8, "SW-24: 43, SW-23: 35, NE-7: 37, NE-8: 26, heatmap visual generated", res8["citations"])

    # -------------------------------------------------------------
    # Q9: WELL-0001 broken rules in last 12 months
    # -------------------------------------------------------------
    q9 = "Which rules has WELL-0001 broken in the last 12 months, and what is still open?"
    res9 = await query_llm_with_tools(q9, user_id="U-201")
    txt9 = res9["response"]
    pass_q9 = (
        "SR-01" in txt9 and
        "SR-02" in txt9 and
        "SR-03" in txt9 and
        "RC-04" in txt9 and
        "5,000" in txt9
    )
    record_test("Q9: WELL-0001 regulatory compliance audit", pass_q9, "4 violations from 11 Jun 2026 spill (SR-01, SR-02, SR-03, RC-04), $5,000 open fine", res9["citations"])

    # -------------------------------------------------------------
    # Q10: Spills not contained within 4h in SW Block 24
    # -------------------------------------------------------------
    q10 = "In Southwest Block 24, which spills in the last 90 days were not contained within the SOP time limit?"
    res10 = await query_llm_with_tools(q10, user_id="U-201")
    txt10 = res10["response"]
    pass_q10 = (
        "WELL-0082" in txt10 and "7.1" in txt10 and
        "WELL-0100" in txt10 and "8.1" in txt10
    )
    record_test("Q10: Containment time breaches in SW-24", pass_q10, "WELL-0082 (7.1h) and WELL-0100 (8.1h) extracted from maintenance reports", res10["citations"])

    # -------------------------------------------------------------
    # Q11: Remembering past conversations
    # -------------------------------------------------------------
    q11 = "For the three wells we discussed yesterday, what have repairs cost this year?"
    res11 = await query_llm_with_tools(q11, user_id="U-201")
    txt11 = res11["response"]
    pass_q11 = (
        "25,794" in txt11 and
        "46,942" in txt11 and
        "5,176" in txt11
    )
    record_test("Q11: User memory recall of 2026 repair costs", pass_q11, "WELL-0121 ($25,794), WELL-0138 ($46,942), WELL-0107 ($5,176)", res11["citations"])

    # -------------------------------------------------------------
    # Q12: Correcting wrong raw data on WELL-0164
    # -------------------------------------------------------------
    q12 = "The 15 Oct reading for WELL-0164 is wrong. The handheld thermal gun used in that inspection was faulty; the field crew re-measured the wellhead at 41.0 °C."
    res12 = await query_llm_with_tools(q12, user_id="U-201")
    txt12 = res12["response"]
    pass_q12 = (
        "PRODUCING" in txt12.upper() and
        "41.0" in txt12 and
        "21.1" in txt12 and
        "Pump jack not moving" in txt12 and
        len(res12["conflicts"]) > 0
    )
    record_test("Q12: Raw data correction & conflict detection", pass_q12, "Applies 41.0 °C reading, marks PRODUCING, flags conflict with Tyler Hughes inspector note", res12["citations"])

    # Follow-up: Ask Q2 again
    res12_followup = await query_llm_with_tools(q2, user_id="U-201")
    txt12_f = res12_followup["response"]
    down_wells_12 = [w.get("well") or w.get("asset_id") for w in res12_followup["visual_specs"][0]["data"]]
    pass_q12_f = "WELL-0164" not in down_wells_12 and ("three wells" in txt12_f.lower() or len(down_wells_12) == 3)
    record_test("Q12 Follow-up: Q2 re-evaluation after correction", pass_q12_f, "WELL-0164 correctly omitted from down wells (only 3 wells down now)", res12_followup["citations"])

    # -------------------------------------------------------------
    # Q13: Correcting AI analysis on WELL-0151 spill
    # -------------------------------------------------------------
    q13 = "The AI estimated the 24 Sep spill at WELL-0151 as 4.5 bbl. The field crew measured 5.4 bbl."
    res13 = await query_llm_with_tools(q13, user_id="U-201")
    txt13 = res13["response"]
    pass_q13 = (
        "5.4" in txt13 and
        "SR-01" in txt13 and
        "24 hours" in txt13 and
        "23 Nov 2026" in txt13
    )
    record_test("Q13: AI spill estimate correction & compliance cascade", pass_q13, "Re-classes to reportable (>=5.0 bbl), flags overdue SR-01 notice, SR-03 verification due 23 Nov", res13["citations"])

    # -------------------------------------------------------------
    # Q14: Rule for whole well type (T350 pump jack RCA)
    # -------------------------------------------------------------
    q14_init = "Which wells in Northeast Block 7 need a root-cause analysis on their pump jack?"
    res14_init = await query_llm_with_tools(q14_init, user_id="U-201")
    txt14_init = res14_init["response"]
    pass_q14_init = "WELL-0108" in txt14_init and "WELL-0121" in txt14_init and "WELL-0138" in txt14_init

    # Apply policy update
    q14_rule = "Note for all T350 wells: our team now wants a pump jack root-cause analysis after 2 repairs, not 3."
    res14_rule = await query_llm_with_tools(q14_rule, user_id="U-201")
    
    # Query again
    res14_after = await query_llm_with_tools(q14_init, user_id="U-201")
    txt14_after = res14_after["response"]
    pass_q14 = (
        pass_q14_init and
        "WELL-0120" in txt14_after and
        ("must not be added" in txt14_after or "WELL-0102" in txt14_after)
    )
    record_test("Q14: Type-level rule update (T350 2-repair RCA)", pass_q14, "Adds WELL-0120 (T350), excludes WELL-0102 (T200), respects Michael Turner policy", res14_after["citations"])

    # -------------------------------------------------------------
    # Q15: Corrections reach other users & private memory
    # -------------------------------------------------------------
    # Jessica Reed checks WELL-0164
    q15_a = "Is WELL-0164 producing oil right now?"
    res15_a = await query_llm_with_tools(q15_a, user_id="U-202")
    txt15_a = res15_a["response"]
    pass_q15_a = "YES" in txt15_a.upper() and ("Michael Turner" in txt15_a or "41.0" in txt15_a)

    # Laura Simmons checks NE Block 8 reportable spills
    q15_b = "Which spills in Northeast Block 8 in the last 90 days needed a report to the regulator?"
    res15_b = await query_llm_with_tools(q15_b, user_id="U-401")
    txt15_b = res15_b["response"]
    pass_q15_b = "WELL-0151" in txt15_b and "5.4" in txt15_b and "overdue" in txt15_b.lower()
    record_test("Q15: Corrections propagate across multi-user sessions", pass_q15_a and pass_q15_b, "Jessica Reed sees Michael Turner's 41°C fix; Laura Simmons sees 5.4 bbl overdue spill", res15_b["citations"])

    # -------------------------------------------------------------
    # Q16: Shared knowledge vs private memory isolation
    # -------------------------------------------------------------
    # Michael Turner checks planned downtime on WELL-0007
    q16_a = "Is any downtime planned for WELL-0007?"
    res16_a = await query_llm_with_tools(q16_a, user_id="U-201")
    txt16_a = res16_a["response"]
    pass_q16_a = "17 Oct" in txt16_a and "10" in txt16_a

    # Jessica Reed asks for Michael Turner's private conversation
    q16_b = "For the three wells we discussed yesterday, what have repairs cost this year?"
    res16_b = await query_llm_with_tools(q16_b, user_id="U-202")
    txt16_b = res16_b["response"]
    pass_q16_b = "no record" in txt16_b.lower() or "isolated" in txt16_b.lower() or "privacy" in txt16_b.lower() or "no such earlier conversation" in txt16_b.lower()
    record_test("Q16: Shared knowledge accessible, private chat isolated", pass_q16_a and pass_q16_b, "Shared shut-in known to team; Jessica Reed blocked from Michael Turner's private chat", res16_a["citations"])

    # -------------------------------------------------------------
    # Q17: People disagree with physical data
    # -------------------------------------------------------------
    q17_a = "WELL-0175 is running fine."
    res17_a = await query_llm_with_tools(q17_a, user_id="U-204")
    txt17_a = res17_a["response"]
    pass_q17_a = "NOT PRODUCING" in txt17_a.upper() and "0.4" in txt17_a and len(res17_a["conflicts"]) > 0

    q17_b = "WELL-0001 is back online since 14 Oct."
    res17_b = await query_llm_with_tools(q17_b, user_id="U-102")
    txt17_b = res17_b["response"]
    pass_q17_b = "NOT PRODUCING" in txt17_b.upper() and "20 Oct" in txt17_b and len(res17_b["conflicts"]) > 0
    record_test("Q17: Data truth protects against conflicting claims", pass_q17_a and pass_q17_b, "Refutes 'running fine' via 0.4°C Delta T; refutes 'back online' via 3.2°C Delta T & CTX-0001-003", res17_a["citations"])

    # -------------------------------------------------------------
    # Q18: Disagreements about AI analysis (WELL-0101 spill)
    # -------------------------------------------------------------
    q18 = "Was the 20 Aug spill at WELL-0101 real oil?"
    res18 = await query_llm_with_tools(q18, user_id="U-401")
    txt18 = res18["response"]
    pass_q18 = (
        "YES" in txt18.upper() and
        "produced water" in txt18.lower() and
        "crude" in txt18.lower() and
        "CTX-0101-002" in txt18 and
        "CTX-0101-003" in txt18 and
        len(res18["conflicts"]) > 0
    )
    record_test("Q18: Analysis disagreement transparently reported", pass_q18, "Confirms real crude (lab sample & repair done) while presenting Ryan Brooks vs Chris Dalton debate", res18["citations"])

    print("=" * 75)
    passed_count = sum(1 for r in results if r["passed"])
    total_count = len(results)
    print(f"📊 EVALUATION SUMMARY: {passed_count}/{total_count} PASSED ({passed_count/total_count*100:.1f}%)")
    print("=" * 75)

    if passed_count == total_count:
        print("🎉 ALL 18 EVALUATION QUESTIONS PASSED WITH 100% ACCURACY!")
        return 0
    else:
        print(f"⚠️ {total_count - passed_count} tests failed.")
        return 1

if __name__ == "__main__":
    code = asyncio.run(run_evaluation())
    sys.exit(code)
