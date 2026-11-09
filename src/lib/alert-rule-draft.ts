import type { RuleConditions } from "./alert-rules";

/* The rule being created in the alert rules dialog (Phase 10). */

export interface RuleDraft {
  text: string;
  name: string;
  conditions: RuleConditions;
}

export const EMPTY_DRAFT: RuleDraft = { text: "", name: "", conditions: {} };
