import type { CleaningRule } from "@/types/store";

export const applyCleaningRules = (
  value: string,
  rules: readonly CleaningRule[],
) => {
  return rules.reduce((result, rule) => {
    if (!rule.enabled || !rule.pattern) return result;

    try {
      return result.replace(new RegExp(rule.pattern, "gu"), rule.replacement);
    } catch {
      return result;
    }
  }, value);
};

export const maskSensitiveText = (value: string) => {
  return value
    .replace(/(^|\D)(1[3-9]\d)\d{4}(\d{4})(?!\d)/g, "$1$2****$3")
    .replace(
      /([a-z\d._%+-]{1,2})[a-z\d._%+-]*(@[a-z\d.-]+\.[a-z]{2,})/gi,
      "$1***$2",
    )
    .replace(/(^|\D)(\d{6})\d{8}(\d{3}[\dXx])(?!\d)/g, "$1$2********$3")
    .replace(/(^|\D)(\d{4})\d{8,11}(\d{4})(?!\d)/g, "$1$2********$3");
};
