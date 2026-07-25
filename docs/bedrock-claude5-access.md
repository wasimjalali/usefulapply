# Bedrock Claude 5 access: status and escalation

Last updated: 2026-07-25

Tracking the effort to unlock Claude Sonnet 5 and Claude Opus 5 on Amazon Bedrock for AWS account `514985057171`.

---

## Current status

**Blocked.** Every model on the Claude in Amazon Bedrock offering returns HTTP 403 for account `514985057171`. Both self-serve prerequisites are complete. Escalation email drafted and ready to send (see bottom of this file).

## What we set up

- AWS CLI installed via Homebrew (`aws-cli/2.36.8`).
- IAM Identity Center enabled on account `514985057171` in `us-east-1`. This made the account the management account of a new AWS Organization.
- Identity Center user `wasim` with the `AdministratorAccess` permission set, 8-hour session duration.
- SSO session named `karko` configured in `~/.aws/config`. A `[default]` profile was added pointing at the same SSO session, so the CLI and MCP tooling resolve credentials without `--profile`.
- Refresh an expired session with `aws sso login`.

No long-lived access keys exist. Nothing to rotate or delete.

## Findings

### The blocker is account-level, not model-specific

All models on the `bedrock-mantle` endpoint return 403 for this account, including four that Anthropic documents as open to all Bedrock customers:

```
anthropic.claude-sonnet-5    403
anthropic.claude-opus-5      403
anthropic.claude-opus-4-8    403   (documented open access)
anthropic.claude-opus-4-7    403   (documented open access)
anthropic.claude-fable-5     403   (documented open access)
anthropic.claude-haiku-4-5   403   (documented open access)
```

The account appears not to be enrolled in the offering at all.

### Both prerequisites are complete and neither fixed it

1. **AWS Marketplace agreement.** Created via `bedrock:CreateFoundationModelAgreement` for both Sonnet 5 and Opus 5. `agreementAvailability` went `NOT_AVAILABLE` -> `PENDING` -> `AVAILABLE` in about a minute. Sonnet 5's `authorizationStatus` also flipped `NOT_AUTHORIZED` -> `AUTHORIZED`.
2. **Anthropic use case details form.** A separate one-time, per-account form in the Bedrock console. Submitting the Marketplace agreement appears to be its prerequisite, since the form could not be submitted before the agreement existed. Now on record, confirmed by `bedrock:GetUseCaseForModelAccess` returning stored form data.

Polled every five minutes for over an hour after the form went in. Twelve checks, all 403.

### Every AWS-side signal says authorized

```json
{
  "modelId": "anthropic.claude-sonnet-5",
  "agreementAvailability": { "status": "AVAILABLE" },
  "authorizationStatus": "AUTHORIZED",
  "entitlementAvailability": "AVAILABLE",
  "regionAvailability": "AVAILABLE"
}
```

Identical for `anthropic.claude-opus-5`. Invocation still 403s. Do not trust these fields as proof of access; they disagreed with reality throughout this investigation.

### It is not IAM

The error is an Anthropic-shaped `permission_error`, not an AWS `AccessDeniedException`. Requests authenticate, reach the service, and are refused on entitlement. `AmazonBedrockFullAccess` is sufficient.

### It is not regional

| Region | Result |
|---|---|
| us-east-1 | 403 not available for this account |
| eu-west-1 | 403 not available for this account |
| us-west-2 | 404 model does not exist |
| eu-central-1 | 404 model does not exist |

The 404s reflect where the Marketplace agreement was created. No region works.

### AWS support cases are not available on this account

`aws support describe-severity-levels` returns `SubscriptionRequiredException`. The account is on Basic support, so the AWS Support API refuses every call. This is also the original source of the "your account is not authorized, contact sales" message. It was the support plan, never Claude access.

### Root cause: every Anthropic quota on this account is zeroed below AWS defaults

This is the finding that explains both the 403s and the throttling. All 1202 Bedrock quotas were dumped and compared against AWS defaults:

| Quota | AWS default | This account |
|---|---|---|
| `[bedrock-mantle]` Sonnet 5 input TPM | 3,000,000 | **0** |
| `[bedrock-mantle]` Sonnet 5 output TPM | 300,000 | **0** |
| `[bedrock-mantle]` Opus 5 input TPM | 20,000,000 | **0** |
| `[bedrock-mantle]` Opus 5 output TPM | 2,000,000 | **0** |
| Sonnet 4.6 global cross-region tokens per day | 8,640,000,000 | **0** |
| Sonnet 4.6 max tokens per day (invocation) | 4,320,000,000 | **0** |
| Sonnet 4.6 global cross-region TPM | 6,000,000 | **0** |

Every Anthropic quota is 0. Meanwhile, on the **same account and the same `bedrock-mantle` endpoint**, non-Anthropic models have large quotas:

```
[bedrock-mantle] Input tokens per minute for GPT-5.6 Terra    20,000,000
[bedrock-mantle] Input tokens per minute for GPT-5.6 Luna     20,000,000
[bedrock-mantle] Input tokens per minute for GPT-5.6 Sol      10,000,000
```

**Correction (2026-07-25): those nonzero GPT quotas are not entitlement.** Tested directly against `bedrock-mantle.us-east-1.api.aws/openai/v1/responses` with SigV4: `openai.gpt-5.6-terra`, `-luna` and `-sol` all return `401 access_denied` with the same "is not available for this account" message the Anthropic models give. `GetFoundationModelAvailability` rejects all three IDs as invalid, and `ListFoundationModels` does not list them. The IDs are real upstream (`/v1/chat/completions` returns "does not support this API" rather than "does not exist"), so this is an entitlement gap, not a naming error.

So the account is not enrolled in the `bedrock-mantle` offering for **any** vendor, not just Anthropic. The published quota numbers are AWS defaults, not grants. This is the same trap as the all-green availability fields above: only an actual invocation is evidence. It also means there is no OpenAI-on-Bedrock fallback here, which raises the priority of testing the larger AWS account (next step 2). Full detail in [model-selection-analysis.md](model-selection-analysis.md) under "Rejected: OpenAI on Bedrock".

**This cannot be fixed with a quota increase request.** Two independent reasons:

1. Service Quotas refuses the request outright, because the applied value is *below* the default: `IllegalArgumentException: You must provide a quota value greater than the default quota value of 3000000.0`. There is nothing to request; the default is already 3M and the account is pinned at 0.
2. The daily token caps that block Sonnet 4.6 (`L-248E47B7`, `L-B29C9321`) are `Adjustable: false`.

An applied value below the AWS default is an account-level override, not a limit the customer can raise. This needs AWS to lift it.

### Sonnet 4.6 on this account (superseded by the above)

Legacy `bedrock-runtime` models do have entitlement here, but return `ThrottlingException: Too many tokens per day`:

```
us.anthropic.claude-sonnet-4-6      ThrottlingException: Too many tokens per day
global.anthropic.claude-sonnet-4-6  ThrottlingException: Too many tokens per day
us.anthropic.claude-haiku-4-5       ThrottlingException: Too many tokens per day
```

On a barely-used account, hitting a daily token ceiling means the default quota is close to nothing. **Even once Claude 5 access lands, this account will need a quota increase before it can run Karko.** The zero quota and the 403 may share a root cause: the account is unestablished.

Note: Karko production currently runs on Claude Sonnet 4.6 through a **different, larger AWS account**, not `514985057171`.

## Code change still required

Access alone is not enough. Sonnet 5 and Opus 5 are served only on the Messages endpoint and reject the legacy APIs:

```
InvokeModel  -> ValidationException: Operation not allowed
Converse     -> ValidationException: Operation not allowed
```

`src/lib/models/anthropic.ts` currently calls `bedrock-runtime.{region}.amazonaws.com/model/{id}/converse`. The new path needs:

| | Legacy (current, Sonnet 4.6) | New (Sonnet 5, Opus 5) |
|---|---|---|
| Endpoint | `bedrock-runtime.{region}.amazonaws.com` | `bedrock-mantle.{region}.api.aws/anthropic/v1/messages` |
| Model ID | `us.anthropic.claude-sonnet-4-6` | `anthropic.claude-sonnet-5` (no prefix, no version) |
| SDK client | `AnthropicBedrock` | `AnthropicBedrockMantle` |
| IAM action | `bedrock:InvokeModel` | `bedrock-mantle:CreateInference` |
| SigV4 service | `bedrock` | `bedrock-mantle` |
| Streaming | AWS event-stream | standard SSE |

Plan: add the new client path behind the existing `AI_PROVIDER` switch, keep Sonnet 4.6 live as the default, so the day access arrives it is a config flip rather than a build.

**It will not be a pure config flip.** Opus 5 rejects non-default `temperature`, and it defaults adaptive thinking to on, which collides with our small `max_tokens` caps.

**The model decision is locked** (2026-07-25): Opus 5 generates the CV, cover letter and both emails; everything upstream stays on Sonnet 4.6; chat moves to Haiku 4.5. That keeps the migration to **four call sites** and leaves the legacy `bedrock-runtime` path in place for the other ten, so the mantle client is additive rather than a replacement. Implementation starts the day access lands, not before. Full plan, cost model and implementation checklist in [model-selection-analysis.md](model-selection-analysis.md).

One item that needs scoping early: Sonnet 4.6 runs on the larger production account via `bedrock-runtime`, while Opus 5 would run here via `bedrock-mantle`. That is two AWS accounts inside a single application generation, and `anthropic.ts` cannot express it today.

## Escalations filed

- **AWS Sales contact form: submitted 2026-07-25.** Nature of inquiry "Sales Support", use case "AI & Machine Learning", with the full technical summary in the project details field (account ID, 403 evidence, both completed prerequisites, a sample request-id, the Basic-support constraint, the quota problem).
- **Email to `bedrock-ant-eap@amazon.com`:** text ready below. Confirm whether this was sent.

## Next steps

1. **Send the escalation email below** to `bedrock-ant-eap@amazon.com` from `wasim@karkoai.com` if not already done. This is the channel most likely to resolve it; the sales form routes to an account executive, not an engineer.
2. **Test the other, larger AWS account.** If it has real Bedrock usage history it is far more likely to already have this offering enabled and to have usable quota. If Sonnet 5 works there, the escalation is moot and the question becomes which account Karko should bill to. Add it as a second CLI profile to check.
3. **Request a Bedrock quota increase** on whichever account wins. The current daily token limit on `514985057171` is unusable.
4. **Build the `bedrock-mantle` client path** in `src/lib/models/anthropic.ts`. Independent of access, can start now.
5. If a reply asks you to open an AWS support case, point back at the `SubscriptionRequiredException`. Do not upgrade the support plan just to file this.

## Reference

- [Claude in Amazon Bedrock](https://platform.claude.com/docs/en/build-with-claude/claude-in-amazon-bedrock) (Opus 4.7 and later, the new endpoint)
- [Claude on Amazon Bedrock, legacy](https://platform.claude.com/docs/en/build-with-claude/claude-on-amazon-bedrock-legacy) (Opus 4.6 and earlier, current Karko path)
- Support contact for this offering: `bedrock-ant-eap@amazon.com`

---

## Escalation email

**To:** `bedrock-ant-eap@amazon.com`

**Subject:** `Account 514985057171 blocked from Claude in Amazon Bedrock - 403 permission_error on all models`

```
Hello,

I'm requesting access to the Claude in Amazon Bedrock offering for AWS account 514985057171 (us-east-1).

Every model on the bedrock-mantle endpoint returns HTTP 403 permission_error for this account, pointing me to AWS Sales. Both documented prerequisites are complete. I cannot open an AWS support case because the account is on Basic support, so the Support API returns SubscriptionRequiredException.

ACCOUNT DETAILS
- AWS account ID: 514985057171
- Region tested: us-east-1
- Endpoint: https://bedrock-mantle.us-east-1.api.aws/anthropic/v1/messages
- Auth: IAM Identity Center, AdministratorAccess permission set

BOTH PREREQUISITES ARE COMPLETE

1. Use case details form: submitted. bedrock:GetUseCaseForModelAccess returns the stored form data for this account, so the first-time-customer form is on record.
2. AWS Marketplace agreement: active. Created via bedrock:CreateFoundationModelAgreement for both Sonnet 5 and Opus 5, and agreementAvailability is AVAILABLE.

I polled invocation every five minutes for over an hour after submitting the use case form. It returned 403 on all twelve checks with no change, and it is still returning 403 now.

EVERY AWS-SIDE SIGNAL SAYS AUTHORIZED, BUT THE SERVICE REFUSES

bedrock:GetFoundationModelAvailability currently returns all-green:

{
  "modelId": "anthropic.claude-sonnet-5",
  "agreementAvailability": { "status": "AVAILABLE" },
  "authorizationStatus": "AUTHORIZED",
  "entitlementAvailability": "AVAILABLE",
  "regionAvailability": "AVAILABLE"
}

Identical output for anthropic.claude-opus-5. Despite this, invocation returns 403.

Most recent request-ids:
- anthropic.claude-sonnet-5: req_4f4skbax7cyq47e4bkwefuyldfsmripjcoyzk43gwbwostnxtkhq
- anthropic.claude-opus-5: req_zhml7p6uhmgjr427qlvs452bc4vxq4aegzfux6akhezefop3iakq

Error message in each case:

"anthropic.claude-sonnet-5 is not available for this account. You can explore other available models on Amazon Bedrock. For additional access options, contact AWS Sales at https://aws.amazon.com/contact-us/sales-support/"

Note the error is an Anthropic-shaped permission_error, not an AWS AccessDeniedException. IAM is not the blocker. The request reaches the service and is refused on entitlement.

THIS AFFECTS EVERY MODEL ON THE OFFERING

All models on bedrock-mantle return 403 for this account, including several that Anthropic documents as open to all Amazon Bedrock customers:

anthropic.claude-sonnet-5    403
anthropic.claude-opus-5      403
anthropic.claude-opus-4-8    403
anthropic.claude-opus-4-7    403
anthropic.claude-fable-5     403
anthropic.claude-haiku-4-5   403

Since Opus 4.8, Opus 4.7, Fable 5 and Haiku 4.5 are documented as open access, this looks like the account is not enrolled in the Claude in Amazon Bedrock offering at all, rather than lacking access to specific models.

OTHER OBSERVATIONS

- bedrock:ListFoundationModels does list both anthropic.claude-sonnet-5 and anthropic.claude-opus-5 for this account.
- When I created the Marketplace agreements, agreementAvailability progressed NOT_AVAILABLE to PENDING to AVAILABLE within about a minute, and Sonnet 5's authorizationStatus flipped from NOT_AUTHORIZED to AUTHORIZED. Invocation still returned 403.
- InvokeModel and Converse on bedrock-runtime return ValidationException: Operation not allowed for these models, which is expected since they are served only on the Messages endpoint.
- Legacy bedrock-runtime models on this account (Sonnet 4.6, Haiku 4.5) return ThrottlingException "Too many tokens per day" rather than a permission error, so legacy Bedrock entitlement is in place on this account. The gap is specific to the Claude in Amazon Bedrock offering. I will also need a quota increase on this account separately.
- Earlier request-ids, before the agreements existed: Sonnet 5 req_4bczy7jgjteambjczvtvsyf65egmrg7h3pvgeycozket37fniswq, Opus 5 req_lqcz2ltukrmvwyvi5iqtcgxjfyt4hm6tdndbqeesdwiapiha5zsq, Opus 4.8 req_wr7vssg44okw3iwhs3bsqjhnmzodp2ojdpal3lsgrx7wpzautnrq.

USE CASE

I run Karko AI (karkoai.com), a production job-application assistant. Users upload a CV and a job description, and Claude generates a tailored CV, cover letter and application emails plus a fit assessment. Karko AI is already in production on Claude Sonnet 4.6. This account holds AWS credits and is where I intend to run the new offering.

I want to move production inference to Claude Sonnet 5, with Claude Opus 5 for higher-stakes generation steps.

Could you enable this offering for account 514985057171, or tell me what the account is missing?

Thank you,
Wasim Jalali
Founder, Karko AI
wasim@karkoai.com
```
