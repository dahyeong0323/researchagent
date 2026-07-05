# Writing Agent Handoff

The Research Agent does not write final LinkedIn posts and does not publish anything. It can only hand a verified Writing Brief to a separate writing agent after strict evidence checks pass.

The implementation lives in `src/research-agent/writing-agent-handoff.ts` and exposes:

- `assertWritingAgentHandoffAllowed(candidate)`
- `buildWritingAgentHandoffPayload(candidate, brief)`
- `writeWritingAgentHandoffPayload(candidate, brief, options)`

## Boundary

- Only `verificationStatus === "verified"` candidates can be handed off.
- Only `briefAllowed === true` candidates can be handed off.
- The payload must include `entityName`, `observedFeature`, `sourceUrl`, `sourceUrls`, and source-backed evidence. Evidence can be an `evidenceSnippet` or `evidenceParagraphIds`; paragraph-only candidates carry a paragraph reference string in `evidenceSnippet` for downstream compatibility.
- `humanApprovalRequired` is always `true`.
- The writing agent must not post, like, comment, DM, or automate LinkedIn activity.

## Payload

```ts
interface WritingAgentHandoffPayload {
  handoffId: string;
  candidateId: string;
  briefId: string;
  entityName: string;
  entityType: EntityType;
  observedFeature: string;
  sourceUrl: string;
  sourceUrls: string[];
  sourceName: string;
  sourcePublishedAt?: string;
  evidenceSnippet: string;
  evidenceParagraphIds: string[];
  confirmedFacts: string[];
  reasonableInferences: string[];
  needsVerification: string[];
  whyGudiQuestion: string;
  businessMechanism: string;
  consumerBehaviorAngle: string;
  styleInstructions?: string[];
  prohibitedClaims: string[];
  humanApprovalRequired: true;
  createdAt: string;
}
```

## Prohibited Claims

The handoff payload carries explicit prohibited claims so the writing agent keeps a bright line between confirmed facts and interpretation. Anything in `needsVerification` must not be stated as fact until a human verifies it.
