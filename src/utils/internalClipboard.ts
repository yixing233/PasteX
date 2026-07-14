type InternalClipboardReason = "copy" | "paste";

interface PendingInternalClipboardWrite {
  expireAt: number;
  reason: InternalClipboardReason;
  type: string;
  value: unknown;
}

let pendingInternalClipboardWrite: PendingInternalClipboardWrite | null = null;

const isSameValue = (left: unknown, right: unknown) => {
  if (Array.isArray(left) && Array.isArray(right)) {
    if (left.length !== right.length) return false;

    return left.every((item, index) => item === right[index]);
  }

  return left === right;
};

export const setPendingInternalClipboardWrite = (
  input: Omit<PendingInternalClipboardWrite, "expireAt">,
  ttlMs = 3000,
) => {
  pendingInternalClipboardWrite = {
    ...input,
    expireAt: Date.now() + ttlMs,
  };
};

export const consumePendingInternalClipboardWrite = (
  type: string,
  value: unknown,
): { reason: InternalClipboardReason } | null => {
  if (!pendingInternalClipboardWrite) return null;

  if (Date.now() > pendingInternalClipboardWrite.expireAt) {
    pendingInternalClipboardWrite = null;
    return null;
  }

  if (pendingInternalClipboardWrite.type !== type) {
    return null;
  }

  if (!isSameValue(pendingInternalClipboardWrite.value, value)) {
    return null;
  }

  const { reason } = pendingInternalClipboardWrite;
  pendingInternalClipboardWrite = null;

  return { reason };
};
