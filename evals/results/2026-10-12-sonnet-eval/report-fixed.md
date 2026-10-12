### Report (fixed mode)

B arms ran only the writing tasks on arm A analysis; their cost, tokens and latency cover those tasks (plus parse_cv), not the full kit.

#### 4.6 vs 5.5-low (first named arm wins = "win"; 0 kits judged)

| Document | Win | Tie | Loss | Passes disagreed |
|---|---|---|---|---|
| cv | 0 | 0 | 0 | 0 of 0 |
| cover_letter | 0 | 0 | 0 | 0 of 0 |
| email | 0 | 0 | 0 | 0 of 0 |
| follow_up | 0 | 0 | 0 | 0 of 0 |
| fit | 0 | 0 | 0 | 0 of 0 |

#### 4.6 vs 5.5-medium (first named arm wins = "win"; 30 kits judged)

| Document | Win | Tie | Loss | Passes disagreed |
|---|---|---|---|---|
| cv | 0 | 0 | 30 | 0 of 30 |
| cover_letter | 2 | 0 | 28 | 0 of 30 |
| email | 9 | 5 | 16 | 5 of 30 |
| follow_up | 4 | 2 | 24 | 1 of 30 |
| fit | 2 | 5 | 23 | 5 of 30 |

#### 5.5-low vs 5.5-medium (first named arm wins = "win"; 0 kits judged)

| Document | Win | Tie | Loss | Passes disagreed |
|---|---|---|---|---|
| cv | 0 | 0 | 0 | 0 of 0 |
| cover_letter | 0 | 0 | 0 | 0 of 0 |
| email | 0 | 0 | 0 | 0 of 0 |
| follow_up | 0 | 0 | 0 | 0 of 0 |
| fit | 0 | 0 | 0 | 0 of 0 |

#### Per arm

| Metric | sonnet-4.6 | 5.5-low | 5.5-medium |
|---|---|---|---|
| Kits scored | 30 | 30 | 30 |
| Deterministic fabrication findings per kit (F1 F2 F3 F5) | 6.53 | 3.97 | 3.70 |
| Kits with F1 | 30 | 30 | 30 |
| Kits with F12 | 0 | 2 | 2 |
| Kits with F14 | 0 | 2 | 2 |
| Kits with F17 | 0 | 0 | 1 |
| Kits with F18 | 3 | 4 | 4 |
| Kits with F2 | 25 | 12 | 11 |
| Kits with F3 | 17 | 5 | 5 |
| Kits with F4 | 7 | 12 | 9 |
| Kits with F6 | 29 | 30 | 30 |
| Kits with F7 | 10 | 0 | 0 |
| Kits with F8 | 23 | 6 | 5 |
| Kits with F9 | 6 | 6 | 6 |
| Input tokens per kit | 44581 | 33945 | 33157 |
| Output tokens per kit | 9319 | 6195 | 7143 |
| Cost per kit (USD) | 0.278 | 0.137 | 0.145 |
| Kit latency p50 / p95 (s, latency reps) | 102.3 / 178.1 (n=20) | n/a / n/a (n=0) | n/a / n/a (n=0) |
| Refusal rate (calls) | 0.00% | 0.00% | 0.00% |
| Truncation rate (calls) | 0.00% | 0.00% | 0.00% |
| Failed call rate | 0.00% | 0.00% | 0.00% |

#### Judge fabrications per kit (quoted by the judge, larger count of the two passes)

| Comparison | First arm | Second arm |
|---|---|---|
| 4.6 vs 5.5-low | n/a | n/a |
| 4.6 vs 5.5-medium | 16.13 | 5.67 |
| 5.5-low vs 5.5-medium | n/a | n/a |

#### Latency per task, p50 / p95 in seconds (latency reps only)

| Task | sonnet-4.6 | 5.5-low | 5.5-medium |
|---|---|---|---|
| parse_cv | 21.6 / 42.4 | n/a | n/a |
| extract_applicant | 8.1 / 45.1 | n/a | n/a |
| parse_job | 11.1 / 16.3 | n/a | n/a |
| skill_matching | 16.1 / 27.6 | n/a | n/a |
| extract_metrics | 4.9 / 20.7 | n/a | n/a |
| fit_assessment | 5.5 / 8.0 | n/a | n/a |
| optimize_cv | 36.8 / 69.9 | n/a | n/a |
| write_cover_letter | 10.0 / 17.0 | n/a | n/a |
| write_email | 6.0 / 7.8 | n/a | n/a |
| write_follow_up_email | 5.2 / 6.7 | n/a | n/a |
