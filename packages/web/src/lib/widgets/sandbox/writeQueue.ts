// Writes from a widget go one at a time per file name: a call while one is pending replaces the
// queued content (last write wins) instead of piling up requests, per ADR 0008.

interface WriteWaiter {
  resolve: (value: undefined) => void;
  reject: (error: Error) => void;
}

interface WriteState {
  inFlight: boolean;
  next: { content: string; waiter: WriteWaiter } | null;
}

export interface WriteRequest {
  requestId: string;
  name: string;
  content: string;
}

export interface WriteQueue {
  write: (name: string, content: string) => Promise<undefined>;
  // Called with the host's answer to a request that `send` carried.
  settle: (requestId: string, ok: boolean, error?: string) => void;
}

export const createWriteQueue = (send: (request: WriteRequest) => void): WriteQueue => {
  const states = new Map<string, WriteState>();
  const pending = new Map<string, WriteWaiter>();
  let sequence = 0;

  const dispatchWrite = (name: string, content: string): Promise<undefined> =>
    new Promise((resolve, reject) => {
      sequence += 1;
      const requestId = String(sequence);
      pending.set(requestId, { resolve, reject });
      send({ requestId, name, content });
    });

  const flush = (name: string, state: WriteState): void => {
    const queued = state.next;
    state.next = null;
    if (!queued) {
      state.inFlight = false;
      return;
    }
    dispatchWrite(name, queued.content).then(
      (result) => {
        queued.waiter.resolve(result);
        flush(name, state);
      },
      (error: Error) => {
        queued.waiter.reject(error);
        flush(name, state);
      },
    );
  };

  const stateFor = (name: string): WriteState => {
    const existing = states.get(name);
    if (existing) {
      return existing;
    }
    const created: WriteState = { inFlight: false, next: null };
    states.set(name, created);
    return created;
  };

  const write = (name: string, content: string): Promise<undefined> => {
    const state = stateFor(name);
    if (state.inFlight) {
      return new Promise((resolve, reject) => {
        state.next = { content, waiter: { resolve, reject } };
      });
    }
    state.inFlight = true;
    return dispatchWrite(name, content).then(
      (result) => {
        flush(name, state);
        return result;
      },
      (error: Error) => {
        flush(name, state);
        throw error;
      },
    );
  };

  const settle = (requestId: string, ok: boolean, error?: string): void => {
    const waiter = pending.get(requestId);
    if (!waiter) {
      return;
    }
    pending.delete(requestId);
    if (ok) {
      waiter.resolve(undefined);
    } else {
      waiter.reject(new Error(error || "Write failed."));
    }
  };

  return { write, settle };
};
