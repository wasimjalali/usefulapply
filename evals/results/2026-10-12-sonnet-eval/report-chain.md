### Report (chain mode)

Every arm ran the whole kit itself.

#### 4.6 vs 5.5-low (first named arm wins = "win"; 30 kits judged)

| Document | Win | Tie | Loss | Passes disagreed |
|---|---|---|---|---|
| cv | 0 | 0 | 30 | 0 of 30 |
| cover_letter | 0 | 2 | 28 | 2 of 30 |
| email | 14 | 2 | 14 | 1 of 30 |
| follow_up | 2 | 4 | 24 | 3 of 30 |
| fit | 6 | 3 | 21 | 3 of 30 |

#### 4.6 vs 5.5-medium (first named arm wins = "win"; 30 kits judged)

| Document | Win | Tie | Loss | Passes disagreed |
|---|---|---|---|---|
| cv | 0 | 1 | 29 | 1 of 30 |
| cover_letter | 2 | 0 | 28 | 0 of 30 |
| email | 11 | 0 | 19 | 0 of 30 |
| follow_up | 2 | 3 | 25 | 3 of 30 |
| fit | 9 | 3 | 18 | 3 of 30 |

#### 5.5-low vs 5.5-medium (first named arm wins = "win"; 30 kits judged)

| Document | Win | Tie | Loss | Passes disagreed |
|---|---|---|---|---|
| cv | 15 | 5 | 10 | 5 of 30 |
| cover_letter | 13 | 7 | 10 | 7 of 30 |
| email | 8 | 5 | 17 | 4 of 30 |
| follow_up | 9 | 8 | 13 | 6 of 30 |
| fit | 21 | 3 | 6 | 3 of 30 |

#### Per arm

| Metric | sonnet-4.6 | 5.5-low | 5.5-medium |
|---|---|---|---|
| Kits scored | 30 | 30 | 30 |
| Deterministic fabrication findings per kit (F1 F2 F3 F5) | 6.53 | 3.60 | 3.87 |
| Kits with F1 | 30 | 30 | 30 |
| Kits with F12 | 0 | 3 | 2 |
| Kits with F14 | 0 | 3 | 2 |
| Kits with F16 | 0 | 0 | 1 |
| Kits with F18 | 3 | 6 | 2 |
| Kits with F2 | 25 | 8 | 10 |
| Kits with F3 | 17 | 5 | 5 |
| Kits with F4 | 7 | 13 | 12 |
| Kits with F6 | 29 | 28 | 29 |
| Kits with F7 | 10 | 0 | 0 |
| Kits with F8 | 23 | 2 | 3 |
| Kits with F9 | 6 | 6 | 6 |
| Input tokens per kit | 44581 | 55246 | 54774 |
| Output tokens per kit | 9319 | 9951 | 10904 |
| Cost per kit (USD) | 0.278 | 0.214 | 0.223 |
| Kit latency p50 / p95 (s, latency reps) | 102.3 / 178.1 (n=20) | 38.4 / 69.5 (n=20) | 45.1 / 86.4 (n=20) |
| Refusal rate (calls) | 0.00% | 0.00% | 0.00% |
| Truncation rate (calls) | 0.00% | 0.00% | 0.00% |
| Failed call rate | 0.00% | 0.00% | 0.00% |

#### Judge fabrications per kit (quoted by the judge, larger count of the two passes)

| Comparison | First arm | Second arm |
|---|---|---|
| 4.6 vs 5.5-low | 16.60 | 5.33 |
| 4.6 vs 5.5-medium | 16.10 | 6.03 |
| 5.5-low vs 5.5-medium | 5.10 | 6.27 |

#### Latency per task, p50 / p95 in seconds (latency reps only)

| Task | sonnet-4.6 | 5.5-low | 5.5-medium |
|---|---|---|---|
| parse_cv | 21.6 / 42.4 | 7.2 / 12.0 | 7.4 / 12.1 |
| extract_applicant | 8.1 / 45.1 | 4.8 / 11.6 | 4.7 / 10.0 |
| parse_job | 11.1 / 16.3 | 4.4 / 7.8 | 4.4 / 7.5 |
| skill_matching | 16.1 / 27.6 | 5.3 / 7.8 | 5.6 / 12.6 |
| extract_metrics | 4.9 / 20.7 | 3.1 / 7.5 | 3.3 / 8.2 |
| fit_assessment | 5.5 / 8.0 | 2.7 / 6.2 | 2.7 / 7.5 |
| optimize_cv | 36.8 / 69.9 | 10.9 / 22.1 | 14.2 / 34.3 |
| write_cover_letter | 10.0 / 17.0 | 5.0 / 13.5 | 5.6 / 14.4 |
| write_email | 6.0 / 7.8 | 2.9 / 9.7 | 3.1 / 11.0 |
| write_follow_up_email | 5.2 / 6.7 | 2.6 / 3.6 | 2.8 / 3.2 |
