import { proxy } from "valtio";

export interface SyncState {
  isConnected: boolean;
  isConnecting: boolean;
  error: string | null;
  lastSyncTime: number | null;
  lastErrorTime: number | null;
}

export type SyncStateSnapshot = Pick<
  SyncState,
  "error" | "isConnected" | "isConnecting" | "lastErrorTime" | "lastSyncTime"
>;

export const syncState = proxy<SyncState>({
  error: null,
  isConnected: false,
  isConnecting: false,
  lastErrorTime: null,
  lastSyncTime: null,
});

export const setSyncConnected = (connected: boolean) => {
  syncState.isConnected = connected;
  syncState.isConnecting = false;
  if (connected) {
    syncState.error = null;
    syncState.lastSyncTime = Date.now();
  }
};

export const setSyncError = (error: string) => {
  syncState.error = error;
  syncState.isConnecting = false;
  syncState.isConnected = false;
  syncState.lastErrorTime = Date.now();
};

export const setSyncConnecting = (connecting: boolean) => {
  syncState.isConnecting = connecting;
};

export const setSyncStateSnapshot = (snapshot: SyncStateSnapshot) => {
  syncState.error = snapshot.error;
  syncState.isConnected = snapshot.isConnected;
  syncState.isConnecting = snapshot.isConnecting;
  syncState.lastErrorTime = snapshot.lastErrorTime;
  syncState.lastSyncTime = snapshot.lastSyncTime;
};
