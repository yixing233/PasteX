type LatestSourceType = "text" | "image";

interface PendingLatestSource {
  type: LatestSourceType;
  value: string;
  deviceName: string;
  expireAt: number;
}

let pendingLatestSource: PendingLatestSource | null = null;

export const setPendingLatestSource = (
  input: Omit<PendingLatestSource, "expireAt">,
  ttlMs = 3000,
) => {
  pendingLatestSource = {
    ...input,
    expireAt: Date.now() + ttlMs,
  };
};

export const consumePendingLatestSource = (
  type: string,
  value: unknown,
): { deviceName: string } | null => {
  if (!pendingLatestSource) return null;

  if (Date.now() > pendingLatestSource.expireAt) {
    pendingLatestSource = null;
    return null;
  }

  if (pendingLatestSource.type !== type) {
    return null;
  }

  if (typeof value !== "string") {
    return null;
  }

  if (pendingLatestSource.type === "text") {
    if (pendingLatestSource.value !== value) {
      return null;
    }
  }

  const deviceName = pendingLatestSource.deviceName;
  pendingLatestSource = null;
  return {
    deviceName,
  };
};
