# AI Models - Current State Documentation

**Location:** `/src/lib/models/`  
**Purpose:** Model abstraction layer for AI provider routing  
**Last Updated:** February 5, 2026 (Post-Prompt Caching Implementation)

---

## Overview

The models directory provides a unified interface for calling different AI models (Anthropic Claude, OpenAI GPT, Google Gemini, DeepSeek). All tasks now use **Claude Haiku 4.5** as primary model with automatic fallback to DeepSeek on rate limits.

---

## File Inventory

| File | Lines | Purpose | Status |
|------|-------|---------|--------|
| index.ts | 279 | Main model router and abstraction | ✅ Active |
| types.ts | ~150 | Type definitions and task configs | ✅ Active |
| anthropic.ts | ~300 | Claude API integration | ✅ Active |
| openai.ts | ~250 | GPT API integration | ✅ Active |
| gemini.ts | ~250 | Gemini API integration | ✅ Active |
| deepseek.ts | ~200 | DeepSeek API integration (fallback) | ✅ Active |

---

## Architecture Overview

### Model Selection Strategy

**Current Configuration (All tasks use Claude Haiku 4.5):**
- CV parsing: Claude Haiku 4.5
- Job analysis: Claude Haiku 4.5
- Skill matching: Claude Haiku 4.5
- CV optimization: Claude Haiku 4.5
- Cover letter: Claude Haiku 4.5
- Email: Claude Haiku 4.5
- Chat: Claude Haiku 4.5

**Fallback Strategy:**
- Primary: Claude Haiku 4.5 (Anthropic)
- Fallback: DeepSeek V3 (on rate limits)
- No fallback for chat (Anthropic only)

---

## Detailed File Analysis

### 1. index.ts (279 lines) - Model Router

**Purpose:** Unified interface for calling AI models with automatic fallback

**Current State:**
- ✅ Supports 4 providers (Anthropic, OpenAI, Google, DeepSeek)
- ✅ Automatic fallback to DeepSeek on rate limits
- ✅ Streaming support for all providers
- ✅ JSON mode support
- ✅ Token usage tracking
- ✅ Cost estimation
- ✅ Usage logging

**Key Functions:**

**`callModel()` (lines 44-124):**
- Main function for model calls
- Routes to appropriate provider based on task
- Handles rate limit errors with fallback
- Returns ModelResponse with usage data

**`callModelStream()` (lines 130-220):**
- Streaming version of callModel
- Calls onChunk callback for each token
- Same fallback logic as callModel
- Used for real-time UI updates

**`isRateLimitError()` (lines 25-37):**
- Detects rate limit/quota errors
- Checks for: 429, "rate limit", "quota", "too many requests"
- Triggers fallback to DeepSeek

**`estimateCost()` (lines 233-260):**
- Calculates cost in USD
- Pricing per provider:
  - **Claude Haiku 4.5:** $1/$5 per M tokens (in/out)
  - **GPT-4o mini:** $0.15/$0.60 per M tokens
  - **Gemini:** $0.10/$0.40 per M tokens
  - **DeepSeek V3:** $0.28/$0.42 per M tokens

**`logModelUsage()` (lines 265-275):**
- Logs every model call
- Format: `[Model] task | provider/model | tokens | latency | cost`
- Useful for monitoring and optimization

**Leftover Code Issues:**
- ✅ No significant leftover code
- ✅ Well-structured abstraction layer
- ⚠️ Lines 53-82: OpenAI fallback logic - may not be needed if all tasks use Claude
- ⚠️ Lines 84-111: Gemini fallback logic - may not be needed if all tasks use Claude

**Recommendations:**
- Simplify fallback logic since all tasks use Claude now
- Add retry logic with exponential backoff
- Add circuit breaker pattern for failing providers
- Cache model responses for identical inputs

---

### 2. types.ts (~210 lines) - Type Definitions

**Purpose:** Type definitions for model system and task configurations

**Current State:**
- ✅ TaskType enum for all AI tasks
- ✅ ModelConfig for each task
- ✅ ModelResponse interface (with cache metrics)
- ✅ Provider-specific types
- ✅ **NEW: `CacheableContentBlock` type for prompt caching**
- ✅ **NEW: `systemBlocks` option in `ModelCallOptions`**
- ✅ **NEW: `cacheCreationInputTokens` / `cacheReadInputTokens` in usage**

**Key Types:**

**TaskType:**
```typescript
type TaskType = 
  | 'cv_parsing'
  | 'job_analysis'
  | 'skill_matching'
  | 'cv_optimization'
  | 'cover_letter'
  | 'email'
  | 'chat'
  | 'company_research';
```

**ModelConfig:**
```typescript
interface ModelConfig {
  provider: 'anthropic' | 'openai' | 'google' | 'deepseek';
  model: string;
  temperature: number;
  maxTokens: number;
}
```

**Task Configurations:**
All tasks now use Claude Haiku 4.5:
```typescript
{
  cv_parsing: { provider: 'anthropic', model: 'claude-haiku-4-5', temp: 0.3, tokens: 4096 },
  job_analysis: { provider: 'anthropic', model: 'claude-haiku-4-5', temp: 0.3, tokens: 2048 },
  skill_matching: { provider: 'anthropic', model: 'claude-haiku-4-5', temp: 0.2, tokens: 1024 },
  cv_optimization: { provider: 'anthropic', model: 'claude-haiku-4-5', temp: 0.5, tokens: 8192 },
  cover_letter: { provider: 'anthropic', model: 'claude-haiku-4-5', temp: 0.7, tokens: 4096 },
  email: { provider: 'anthropic', model: 'claude-haiku-4-5', temp: 0.6, tokens: 1024 },
  chat: { provider: 'anthropic', model: 'claude-haiku-4-5', temp: 0.7, tokens: 512 },
}
```

**Leftover Code Issues:**
- ✅ No leftover code
- ✅ Clean type definitions

---

### 3. anthropic.ts (~180 lines) - Claude Integration

**Purpose:** Anthropic Claude API integration with prompt caching

**Current State:**
- ✅ Claude Haiku 4.5 support
- ✅ Streaming support
- ✅ JSON mode support
- ✅ Conversation history support
- ✅ Token usage tracking
- ✅ **NEW: Prompt caching via `cache_control` on system blocks**
- ✅ **NEW: Cache metrics logging (`cache_creation_input_tokens`, `cache_read_input_tokens`)**

**Key Functions:**
- `callAnthropic()` - Standard call (supports `systemBlocks` with `cache_control`)
- `callAnthropicStream()` - Streaming call
- `parseAnthropicJSON()` - Extract JSON from response

**Prompt Caching:**
- Accepts `systemBlocks: CacheableContentBlock[]` for structured system prompts
- Each block can have `cache_control: { type: 'ephemeral' }` for 5-min caching
- Haiku 4.5 minimum cacheable prefix: 4,096 tokens
- Cache reads cost 10% of base input price (~90% savings)
- Cache metrics logged: `[Anthropic Cache] write=X read=Y input=Z output=W`

**Leftover Code Issues:**
- ✅ No significant leftover code

---

### 4. openai.ts (~250 lines) - GPT Integration

**Purpose:** OpenAI GPT API integration

**Current State:**
- ✅ GPT-4o mini support
- ✅ Streaming support
- ✅ JSON mode support
- ⚠️ **NOT USED** - All tasks use Claude now

**Leftover Code Issues:**
- ⚠️ **ENTIRE FILE MAY BE UNUSED** - All tasks configured for Claude
- Keep for fallback or future use

**Recommendations:**
- Verify if OpenAI is still needed
- If not used, can be removed or marked as legacy

---

### 5. gemini.ts (~250 lines) - Gemini Integration

**Purpose:** Google Gemini API integration

**Current State:**
- ✅ Gemini 2.0 Flash support
- ✅ Streaming support
- ✅ JSON mode support
- ⚠️ **NOT USED** - All tasks use Claude now

**Leftover Code Issues:**
- ⚠️ **ENTIRE FILE MAY BE UNUSED** - All tasks configured for Claude
- Keep for fallback or future use

**Recommendations:**
- Verify if Gemini is still needed
- If not used, can be removed or marked as legacy

---

### 6. deepseek.ts (~200 lines) - DeepSeek Integration

**Purpose:** DeepSeek V3 API integration (fallback provider)

**Current State:**
- ✅ DeepSeek V3 support
- ✅ Streaming support
- ✅ JSON mode support
- ✅ Used as fallback on rate limits
- ✅ Cost-effective ($0.28/$0.42 per M tokens)

**Key Functions:**
- `callDeepSeek()` - Standard call
- `callDeepSeekStream()` - Streaming call
- `isDeepSeekConfigured()` - Check if API key exists

**Leftover Code Issues:**
- ✅ No leftover code
- ✅ Important for rate limit fallback

---

## Model Selection Rationale

### Why Claude Haiku 4.5 for Everything?

**Advantages:**
- **Fast:** Low latency for real-time UX
- **Cost-effective:** $1/$5 per M tokens
- **High quality:** Better than GPT-4o mini
- **Reliable:** Stable API, good uptime
- **JSON mode:** Native structured output support

**Comparison:**
| Model | Input $/M | Output $/M | Quality | Speed |
|-------|-----------|------------|---------|-------|
| Claude Haiku 4.5 | $1 | $5 | ⭐⭐⭐⭐ | ⚡⚡⚡ |
| GPT-4o mini | $0.15 | $0.60 | ⭐⭐⭐ | ⚡⚡⚡ |
| Gemini 2.0 Flash | $0.10 | $0.40 | ⭐⭐⭐ | ⚡⚡ |
| DeepSeek V3 | $0.28 | $0.42 | ⭐⭐⭐ | ⚡⚡ |

**Cost per Application (Typical):**
- Claude Haiku 4.5: **$0.02-$0.03**
- GPT-4o mini: $0.005-$0.01
- DeepSeek V3: $0.007-$0.012

**Decision:** Claude Haiku 4.5 offers best quality-to-cost ratio for production use.

---

## Fallback Strategy

### Rate Limit Handling

**Flow:**
1. Try primary model (Claude Haiku 4.5)
2. If rate limited (429 error), fallback to DeepSeek V3
3. Log fallback event
4. Return response with provider info

**Benefits:**
- **No downtime:** Always have working model
- **Cost control:** DeepSeek is cheap fallback
- **Transparent:** Frontend knows which model was used

**Limitations:**
- DeepSeek quality slightly lower than Claude
- Fallback adds latency (retry delay)

---

## Token Usage Tracking

**Tracked Metrics:**
- Input tokens
- Output tokens
- Total tokens
- Cost (USD)
- Latency (ms)
- Provider/model used

**Logging Format:**
```
[Model] cv_optimization | anthropic/claude-haiku-4-5 | 8234in/3456out | 2341ms | $0.0256
```

**Benefits:**
- Monitor API costs
- Optimize prompts
- Detect anomalies
- Track performance

---

## Cleanup Tasks

### High Priority
1. **Verify OpenAI usage** - If not used, mark as legacy or remove
2. **Verify Gemini usage** - If not used, mark as legacy or remove

### Medium Priority
3. **Simplify fallback logic** - Since all tasks use Claude, reduce complexity
4. **Add retry logic** - Exponential backoff for transient errors
5. **Add circuit breaker** - Prevent cascading failures

### Low Priority
6. Add response caching for identical inputs
7. Add request batching for efficiency
8. Add A/B testing framework for model comparison
9. Add quality scoring for model outputs

---

## Testing Checklist

- [ ] Claude Haiku 4.5 calls work for all tasks
- [ ] Streaming works for all providers
- [ ] JSON mode extracts valid JSON
- [ ] Rate limit detection triggers fallback
- [ ] DeepSeek fallback works correctly
- [ ] Token usage tracking is accurate
- [ ] Cost estimation is correct
- [ ] Usage logging works
- [ ] Error handling works for API failures
- [ ] Conversation history works for chat

---

## Performance Metrics

**Average Latency (Claude Haiku 4.5):**
- CV parsing: ~2-3 seconds
- Job analysis: ~2-3 seconds
- Skill matching: ~1-2 seconds
- CV optimization: ~5-8 seconds
- Cover letter: ~4-6 seconds
- Email: ~2-3 seconds
- Chat: ~1-2 seconds

**Token Usage (Typical Application):**
- Input: 8,000-12,000 tokens
- Output: 3,000-5,000 tokens
- Total: 11,000-17,000 tokens
- Cost: $0.02-$0.03

---

## Notes for AI Agents

When working with models:
1. **Use callModel()** - Don't call providers directly
2. **All tasks use Claude** - Consistent model across workflow
3. **DeepSeek is fallback** - Automatic on rate limits
4. **Track token usage** - All calls return usage data
5. **Log all calls** - Use logModelUsage() for monitoring
6. **Handle errors** - Fallback logic is automatic
7. **JSON mode** - Use for structured outputs
8. **Streaming** - Use for real-time UI updates
