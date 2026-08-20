# LSUPERAGENT Agent Runtime Refactor Design

**Date:** 2026-08-20  
**Project:** LSUPERAGENT Agent Runtime Adapter  
**Branch:** `agent/lsuperagent-agent-runtime-refactor-v1`  
**Design status:** `DESIGN_STAGED`  
**Canonical authority:** existing LSUPERAGENT / Supabase  
**Parent application boundary:** LSUPERAGENT Trusted Agent Gateway  
**Implementation language for the first refactor:** Python  

## 1. Goal

Refactor the existing Python agent prototype (`orchestrator.py` + `llm_client.py`) into a provider-neutral LSUPERAGENT execution subsystem that can use Gemini, OpenAI, Anthropic, or Ollama without changing the orchestration loop or creating a second canonical runtime, memory system, audit authority, policy engine, or database.

The refactor must preserve the useful parts of the prototype — ReAct-style tool round trips, dependency injection, a hard step limit, and confirmation-before-dangerous-tool behavior — while removing provider-specific message semantics from the orchestrator.

The resulting subsystem is an **execution adapter**, not a new Core.

## 2. Source assessment

The uploaded prototype already has a good separation between orchestration, model clients, and a tool registry:

- the orchestrator loops until the model returns text or the step limit is reached;
- model clients are injected behind an `LLMClient` abstraction;
- the tool registry is injected and dispatches requested tool calls;
- tools marked `requires_confirmation=True` fail closed unless a confirmation callback approves execution.

The main architectural defect is that the orchestrator itself serializes assistant tool-use and tool-result history in an Anthropic-shaped message structure. This makes the interface appear provider-neutral while the conversation protocol is still provider-specific.

Additional weaknesses that must be corrected during implementation:

1. OpenAI malformed tool JSON currently degrades to `{}` instead of surfacing an explicit invalid-tool-arguments failure.
2. Tool result payloads are stringified with `str(...)` rather than serialized through a stable normalized result contract.
3. Provider output budgets such as Anthropic `max_tokens=2000` are hard-coded in client code rather than controlled by a task/profile configuration.
4. The raw provider response is retained in the response object and must not be logged or surfaced unsafely.
5. The current runtime can directly dispatch tools; privileged execution must instead pass through an injected execution port that enforces the existing LSUPERAGENT authorization/policy boundary.

## 3. Non-goals

This refactor does **not**:

- create a new Supabase project;
- create a second Memory Core;
- create a second audit store;
- replace the existing Trusted Agent Gateway;
- create a Gemini-owned backend;
- create a second policy authority;
- expose provider keys or service-role credentials to a browser;
- deploy a production runtime;
- modify `activity-hub.online`, Vercel production, DNS, or Cloudflare;
- implement autonomous long-running jobs;
- introduce automatic tool retries for state-changing actions;
- replace the Control Center release plan.

## 4. Approaches considered

### Approach A — Patch provider adapters only

Keep the current orchestrator and add `GeminiClient` beside OpenAI, Anthropic, and Ollama.

**Advantage:** smallest diff.  
**Rejected because:** the orchestrator would still emit Anthropic-shaped tool messages, so multi-round tool calling would remain provider-coupled.

### Approach B — Normalized internal protocol + provider adapters + compatibility layer

Move all provider message translation into adapters. The orchestrator speaks one internal protocol only. Preserve compatibility shims for the existing `chat()` / `chat_with_tools()` call sites while callers migrate.

**Advantage:** true model/provider replaceability, testable contracts, controlled migration, and no duplicate Core.  
**Decision:** **selected**.

### Approach C — Separate runtime service for every provider

Create independent Gemini/OpenAI/Anthropic runtimes.

**Advantage:** provider isolation.  
**Rejected because:** it duplicates orchestration, policy integration, tool execution, observability, and operational ownership, creating exactly the drift this refactor is intended to remove.

## 5. Target architecture

```text
Browser / LSUPERAGENT PRO / Control Center
                 |
                 v
        Trusted Agent Gateway
  auth -> validation -> policy -> context
                 |
                 v
       Agent Runtime Adapter
  normalized conversation + ReAct loop
                 |
       +---------+----------+----------+
       |         |          |          |
       v         v          v          v
    Gemini     OpenAI   Anthropic    Ollama
       |         |          |          |
       +---------+----------+----------+
                 |
                 v
       Tool Execution Port
                 |
                 v
 Existing gateway-approved tools / adapters
                 |
                 v
 Verification + canonical audit correlation
                 |
                 v
      Existing LSUPERAGENT / Supabase
```

### Authority rule

The Trusted Agent Gateway remains northbound authority for authentication, request normalization, authorization, policy, and release-safe access to canonical systems.

The Agent Runtime owns only:

- provider-neutral conversation state for the active execution;
- provider selection from approved configuration;
- model invocation;
- ReAct loop control;
- normalized tool-call intent handling;
- stop conditions and execution-level errors.

It does **not** own canonical user memory, durable policy, canonical audit records, or privileged credentials for unrelated tools.

## 6. Proposed package structure

```text
projects/lsuperagent-agent-runtime/
├── src/lsuperagent_runtime/
│   ├── orchestrator.py
│   ├── protocol.py
│   ├── context.py
│   ├── errors.py
│   ├── config.py
│   ├── providers/
│   │   ├── base.py
│   │   ├── openai.py
│   │   ├── anthropic.py
│   │   ├── gemini.py
│   │   └── ollama.py
│   ├── tools/
│   │   ├── specs.py
│   │   ├── execution_port.py
│   │   └── registry_compat.py
│   ├── profiles/
│   │   └── writing.py
│   └── compat/
│       └── legacy_llm_client.py
├── tests/
│   ├── unit/
│   ├── contract/
│   └── integration/
├── docs/
│   └── MIGRATION.md
├── pyproject.toml
└── README.md
```

`profiles/writing.py` is an extension point. The first implementation may include only the profile contract and tests; it must not create a separate writing runtime.

## 7. Provider-neutral protocol

The orchestrator must never construct OpenAI-, Anthropic-, or Gemini-native message payloads.

Initial normalized types:

```python
from dataclasses import dataclass, field
from typing import Any, Literal

Role = Literal["system", "user", "assistant", "tool"]

@dataclass(frozen=True)
class NormalizedToolCall:
    id: str
    name: str
    arguments: dict[str, Any]

@dataclass(frozen=True)
class NormalizedToolResult:
    tool_call_id: str
    content: Any = None
    error: str | None = None

@dataclass
class NormalizedMessage:
    role: Role
    text: str | None = None
    tool_calls: list[NormalizedToolCall] = field(default_factory=list)
    tool_results: list[NormalizedToolResult] = field(default_factory=list)

@dataclass
class ModelResponse:
    text: str = ""
    tool_calls: list[NormalizedToolCall] = field(default_factory=list)
    stop_reason: str | None = None
    provider: str | None = None
    diagnostic_metadata: dict[str, Any] = field(default_factory=dict)
```

Rules:

- every internal tool call has a stable ID;
- provider adapters may synthesize an internal ID when the provider protocol does not provide one;
- malformed provider tool arguments are returned as a typed protocol error, never silently replaced with `{}`;
- internal messages may contain multiple tool calls/results;
- provider-native payloads exist only inside provider adapter modules;
- diagnostic metadata must be safe to log and must not include raw secrets or unrestricted raw provider bodies.

## 8. Provider contract

Provider adapters implement one primary contract:

```python
class ModelProvider(Protocol):
    name: str

    def complete(
        self,
        *,
        system: str,
        messages: list[NormalizedMessage],
        tools: list[NormalizedToolSpec],
        options: ModelOptions,
    ) -> ModelResponse:
        ...
```

`ModelOptions` contains portable controls only, initially:

- `max_output_tokens`;
- `temperature` when explicitly enabled by an approved profile;
- request timeout.

Provider-specific options do not leak into the orchestrator contract.

### Gemini

Gemini is implemented as another adapter behind `ModelProvider`. It is not allowed to become the canonical model/runtime authority. Gemini-specific function-call/function-response shapes are translated entirely inside `providers/gemini.py`.

### OpenAI / Anthropic / Ollama

Existing clients are migrated behind the same contract. Ollama may remain text-only until its selected local model/tool protocol has an explicit tested adapter; lack of tool support must be represented honestly rather than simulated.

## 9. Orchestrator responsibilities

The refactored orchestrator performs this sequence per user turn:

1. accept a normalized run context and conversation;
2. retrieve approved tool specifications from the injected tool registry/port;
3. call the selected `ModelProvider`;
4. if the model returns final text, return a normalized final response;
5. if the model returns tool-call intents, validate them;
6. send each tool intent to the injected `ToolExecutionPort`;
7. append normalized tool results to the internal conversation;
8. call the model again;
9. stop on final response, terminal error, cancellation, or `max_steps`.

`max_steps` remains a hard safety valve and becomes configuration with a conservative default of 8.

The orchestrator does not perform provider payload conversion.

## 10. Tool execution boundary

The current direct `registry.dispatch(...)` pattern is retained only behind a compatibility adapter for local low-risk tests and migration.

The production-facing interface is:

```python
class ToolExecutionPort(Protocol):
    def specs(self, context: RunContext) -> list[NormalizedToolSpec]:
        ...

    def execute(
        self,
        context: RunContext,
        call: NormalizedToolCall,
    ) -> NormalizedToolResult:
        ...
```

Rules:

- unknown tool/action fails closed;
- a tool requiring confirmation cannot run without explicit approval evidence;
- privileged tools must be backed by the Trusted Agent Gateway or another explicitly approved server-side enforcement adapter;
- the model never receives unrestricted tool credentials;
- state-changing tool calls are never automatically retried by the orchestrator;
- tool output is normalized and sanitized before it is returned to the model.

The existing default-deny confirmation behavior is preserved during migration.

## 11. Run context and correlation

Every run carries:

```python
@dataclass(frozen=True)
class RunContext:
    request_id: str
    user_id: str
    workspace_id: str | None
    action: str
    received_at: str
```

The runtime may propagate request/audit correlation references but does not write canonical audit state by itself unless the injected gateway adapter explicitly performs that operation.

No raw auth token is required in the normalized runtime context.

## 12. Error model

Stable runtime errors:

```text
INVALID_MODEL_RESPONSE
INVALID_TOOL_ARGUMENTS
UNKNOWN_TOOL
CONFIRMATION_REQUIRED
TOOL_EXECUTION_FAILED
PROVIDER_UNAVAILABLE
PROVIDER_TIMEOUT
STEP_LIMIT_EXCEEDED
POLICY_BLOCKED
INTERNAL_RUNTIME_ERROR
```

Rules:

- provider HTTP/schema failures become provider errors;
- malformed tool arguments never become an empty argument object;
- a provider may be retried only under an explicit bounded provider retry policy;
- tool side effects are not replayed automatically;
- public error details must not expose provider keys, authorization headers, or raw internal stack traces.

## 13. Configuration and secrets

Configuration is server-side only.

Allowed configuration categories:

```text
LLM_BACKEND
MODEL_NAME
MODEL_MAX_OUTPUT_TOKENS
MODEL_TIMEOUT_SECONDS
AGENT_MAX_STEPS
provider API-key environment names
```

Requirements:

- no real key values are committed;
- no provider key is exposed to browser code;
- provider selection must come from approved configuration, not arbitrary untrusted user input;
- logging must redact authorization headers and secret-bearing environment values.

## 14. Writing specialization

The runtime may later expose a `WritingProfile` that configures:

- system instruction;
- output budget;
- structured-output preference;
- allowed tool subset;
- provider preference/fallback order.

Examples of capabilities that can be built on the profile without forking the runtime:

```text
compose
rewrite
summarize
expand
tone_transfer
marketing_copy
technical_writing
thai_copywriting
longform
structured_output
```

The writing profile is not a separate Core and cannot promote canonical memory by itself.

For the first refactor, provider-neutral protocol correctness takes priority over smart model routing.

## 15. Compatibility and migration

Migration is incremental.

### Compatibility layer

`compat/legacy_llm_client.py` temporarily preserves the old concepts:

- `LLMClient.chat(...)`;
- `LLMClient.chat_with_tools(...)`;
- `get_llm_client()`.

The compatibility layer internally calls the normalized provider contract. New code must use `ModelProvider` directly.

### Orchestrator compatibility

`Orchestrator.run(user_message, history)` remains available during migration, but it converts legacy history into normalized messages immediately and does not emit provider-native message shapes.

### Removal gate

Legacy compatibility may be removed only after:

1. all internal call sites are migrated;
2. provider contract tests pass;
3. at least OpenAI, Anthropic, and Gemini tool round trips pass using provider fixtures/mocks;
4. no production caller imports the compatibility module.

## 16. Testing strategy

### Unit tests

Must cover:

- normalized message construction;
- stable tool-call IDs;
- malformed tool arguments;
- final-text path;
- single and multiple tool-call paths;
- tool failure result path;
- confirmation denied path;
- unknown tool path;
- step-limit exhaustion;
- JSON-safe normalized tool-result serialization;
- configurable output token budget;
- no raw provider response in normal logging.

### Provider contract tests

Each provider receives the same normalized conversation fixture and must produce equivalent normalized outcomes.

Required adapters for the first provider contract gate:

- OpenAI;
- Anthropic;
- Gemini;
- Ollama text-only contract, with tool capability reported honestly.

No live paid provider call is required for the initial contract gate; mocked HTTP/SDK fixtures are acceptable and preferred for deterministic CI.

### Integration tests

Must cover:

- ReAct round trip across the orchestrator and a fake provider;
- ReAct round trip through a fake `ToolExecutionPort`;
- request ID propagation;
- privileged tool denied without authorization/confirmation evidence;
- provider failure does not trigger a tool side effect;
- tool side effect is not retried automatically.

## 17. Release phases

### AR1_DESIGN

Deliverable: this design spec.  
Gate: explicit user review/approval.

### AR2_PROTOCOL

Deliverables:

- package scaffold;
- normalized protocol/context/errors;
- fake provider + fake tool execution port;
- compatibility test skeleton;
- RED -> GREEN unit tests.

Gate: unit tests, lint/type-check equivalent, package build/checks pass. No provider network calls.

### AR3_PROVIDERS

Deliverables:

- OpenAI adapter;
- Anthropic adapter;
- Gemini adapter;
- Ollama adapter/fallback contract;
- provider fixture contract tests.

Gate: normalized multi-turn tool protocol passes for all supported tool-capable providers; no raw secret leakage.

### AR4_TOOL_BOUNDARY

Deliverables:

- `ToolExecutionPort`;
- legacy registry compatibility adapter;
- default-deny confirmation/policy behavior;
- request correlation.

Gate: privileged execution fails closed and side effects are never automatically retried.

### AR5_SPECIALIST_PROFILE

Deliverable: optional writing profile and model preference configuration.  
Gate: profile changes configuration only; no second runtime/memory/policy authority is introduced.

### AR6_GATEWAY_INTEGRATION

Deliverable: server-side integration path from the existing Trusted Agent Gateway to this runtime adapter.  
Gate: authenticated/policy-approved execution path is verified; canonical audit/memory authority remains existing LSUPERAGENT/Supabase.

### AR7_RELEASE

Production deployment is a separate explicitly approved release. This design does not authorize it.

## 18. Acceptance criteria

The refactor is acceptable only when all of the following are true:

1. the orchestrator contains zero provider-native tool message structures;
2. OpenAI, Anthropic, and Gemini tool calls normalize into the same internal types;
3. switching provider does not require modifying orchestrator code;
4. malformed tool arguments fail explicitly;
5. the default confirmation path fails closed;
6. unknown/unauthorized tools fail closed;
7. provider retry cannot replay a state-changing tool action;
8. output-token limits are configurable by profile/config rather than hard-coded in provider clients;
9. provider secrets remain server-side and uncommitted;
10. runtime logs do not expose raw provider responses by default;
11. no new Supabase schema, Memory Core, audit authority, or policy authority exists;
12. Gemini is a provider adapter, not a second canonical runtime;
13. existing LSUPERAGENT/Supabase remains the single durable operational authority;
14. the Control Center and LSUPERAGENT PRO can later consume the same Trusted Gateway/runtime path rather than owning parallel runtimes.

## 19. Design ruling summary

```text
RUNTIME_ROLE: EXECUTION_ADAPTER
CANONICAL_CORE: EXISTING_LSUPERAGENT
MESSAGE_PROTOCOL: PROVIDER_NEUTRAL
PROVIDER_ADAPTERS: OPENAI | ANTHROPIC | GEMINI | OLLAMA
TOOL_AUTHORITY: INJECTED_TRUSTED_EXECUTION_PORT
DEFAULT_PRIVILEGED_ACTION: DENY
WRITING_SPECIALIST: PROFILE_NOT_RUNTIME
PARALLEL_MEMORY: FORBIDDEN
PARALLEL_AUDIT: FORBIDDEN
PARALLEL_POLICY: FORBIDDEN
PRODUCTION_CHANGE: NOT_AUTHORIZED
```

## 20. Spec self-review

- Placeholder scan: no required implementation value is left as `TBD` or `TODO`.
- Consistency: provider neutrality, tool authority, canonical backend ownership, and release phases use one authority model throughout.
- Scope: the first implementation phase is limited to protocol/runtime refactoring; writing specialization and gateway integration are later gates.
- Ambiguity: Gemini is explicitly an adapter, not canonical runtime authority; privileged tool execution is explicitly injected and fail-closed.
