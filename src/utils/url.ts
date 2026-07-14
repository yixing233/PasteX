const ALLOWED_PROTOCOLS = new Set(["http:", "https:"]);
const EXPLICIT_PROTOCOL_RE = /^[a-z][a-z\d+.-]*:\/\//i;
const ANY_SCHEME_RE = /^[a-z][a-z\d+.-]*:/i;
const DOMAIN_LABEL_RE = /^[a-z\d](?:[a-z\d-]{0,61}[a-z\d])?$/i;
const TOP_LEVEL_DOMAIN_RE = /^(?:[a-z]{2,63}|xn--[a-z\d-]{2,59})$/i;

const unwrapURL = (value: string) => {
  if (/^\[[a-f\d:.%]+\]$/i.test(value)) {
    return value;
  }

  const pairs = [
    ["<", ">"],
    ["(", ")"],
    ["[", "]"],
    ['"', '"'],
    ["'", "'"],
  ] as const;

  for (const [start, end] of pairs) {
    if (value.startsWith(start) && value.endsWith(end)) {
      return value.slice(start.length, -end.length).trim();
    }
  }

  return value;
};

const isIPv4 = (hostname: string) => {
  const parts = hostname.split(".");

  return (
    parts.length === 4 &&
    parts.every((part) => /^\d{1,3}$/.test(part) && Number(part) <= 255)
  );
};

const isIPv6 = (hostname: string) => {
  return hostname.startsWith("[") && hostname.endsWith("]");
};

const isDomain = (hostname: string) => {
  const normalized = hostname.replace(/\.$/, "");
  const labels = normalized.split(".");

  if (
    labels.length < 2 ||
    labels.some((label) => !DOMAIN_LABEL_RE.test(label))
  ) {
    return false;
  }

  return TOP_LEVEL_DOMAIN_RE.test(labels.at(-1) || "");
};

const isValidHostname = (hostname: string, hasExplicitProtocol: boolean) => {
  const normalized = hostname.toLowerCase();

  if (
    normalized === "localhost" ||
    normalized.endsWith(".localhost") ||
    isIPv4(normalized) ||
    isIPv6(normalized) ||
    isDomain(normalized)
  ) {
    return true;
  }

  // 带 http(s) 协议时允许路由器、NAS 等单标签内网主机名。
  return hasExplicitProtocol && DOMAIN_LABEL_RE.test(normalized);
};

const hasWhitespaceOrControlCharacter = (value: string) => {
  return Array.from(value).some((character) => {
    const code = character.charCodeAt(0);

    return /\s/u.test(character) || code <= 0x1f || code === 0x7f;
  });
};

/**
 * 将完整的网页链接规范化为可直接交给系统浏览器打开的 URL。
 * 支持 http(s)、协议相对地址、裸域名、localhost、IPv4/IPv6、端口和路径。
 */
export const normalizeURL = (value: unknown): string | null => {
  if (typeof value !== "string") return null;

  const input = unwrapURL(value.trim());

  if (
    !input ||
    input.length > 8192 ||
    hasWhitespaceOrControlCharacter(input) ||
    input.includes("\\")
  ) {
    return null;
  }

  const hasExplicitProtocol = EXPLICIT_PROTOCOL_RE.test(input);
  const isProtocolRelative = input.startsWith("//");
  const hasBarePort = /^[^/?#]+:\d{1,5}(?:[/?#]|$)/u.test(input);

  // 拒绝 javascript:、data:、file:、mailto: 等非网页协议。
  if (ANY_SCHEME_RE.test(input) && !hasExplicitProtocol && !hasBarePort) {
    return null;
  }

  // 无协议文本中出现 @ 时优先按邮箱处理，避免误识别。
  if (!hasExplicitProtocol && !isProtocolRelative && input.includes("@")) {
    return null;
  }

  const candidate = hasExplicitProtocol
    ? input
    : isProtocolRelative
      ? `https:${input}`
      : `https://${input}`;

  try {
    const url = new URL(candidate);

    if (
      !ALLOWED_PROTOCOLS.has(url.protocol) ||
      !url.hostname ||
      !isValidHostname(url.hostname, hasExplicitProtocol)
    ) {
      return null;
    }

    return url.href;
  } catch {
    return null;
  }
};

export const isURL = (value: unknown) => normalizeURL(value) !== null;
