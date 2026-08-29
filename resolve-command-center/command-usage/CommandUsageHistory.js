function cloneUsageDocument(document) {
  return Object.fromEntries(Object.entries(document).map(([commandId, fact]) => [commandId, {
    usageCount: fact.usageCount,
    lastUsedAt: fact.lastUsedAt
  }]));
}

function reportDiagnostic(callback, error) {
  try {
    callback?.(error);
  } catch (_diagnosticError) {
    // Usage history diagnostics must never affect Command Search or execution.
  }
}

class CommandUsageHistory {
  constructor({ storage, now = () => Date.now(), onDiagnostic } = {}) {
    if (!storage || typeof storage.load !== "function" || typeof storage.save !== "function") {
      throw new TypeError("CommandUsageHistory requires storage");
    }
    if (typeof now !== "function") {
      throw new TypeError("CommandUsageHistory requires a clock function");
    }
    if (onDiagnostic !== undefined && typeof onDiagnostic !== "function") {
      throw new TypeError("CommandUsageHistory diagnostic callback must be a function");
    }
    this.storage = storage;
    this.now = now;
    this.onDiagnostic = onDiagnostic;
  }

  getSnapshot() {
    try {
      return cloneUsageDocument(this.storage.load());
    } catch (error) {
      reportDiagnostic(this.onDiagnostic, error);
      return {};
    }
  }

  record(commandId, timestamp = this.now()) {
    if (typeof commandId !== "string" || commandId.trim().length === 0) {
      reportDiagnostic(this.onDiagnostic, new TypeError("Command usage requires a non-empty command id"));
      return null;
    }
    if (!Number.isSafeInteger(timestamp) || timestamp < 0) {
      reportDiagnostic(this.onDiagnostic, new TypeError("Command usage requires a non-negative epoch timestamp"));
      return null;
    }

    try {
      // Reload immediately before every write so separate service instances do
      // not retain stale same-process usage facts.
      const document = this.storage.load();
      const previous = document[commandId];
      const usageCount = (previous?.usageCount || 0) + 1;
      if (!Number.isSafeInteger(usageCount)) {
        throw new RangeError(`Command usage count exceeded the safe integer range for ${commandId}`);
      }
      const next = { usageCount, lastUsedAt: timestamp };
      document[commandId] = next;
      this.storage.save(document);
      return { ...next };
    } catch (error) {
      reportDiagnostic(this.onDiagnostic, error);
      return null;
    }
  }
}

module.exports = { CommandUsageHistory };
