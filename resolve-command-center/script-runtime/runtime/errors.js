class RuntimeError extends Error {
  constructor(code, message, { supportStatus = null, details = {} } = {}) {
    super(message);
    this.name = "RuntimeError";
    this.code = code;
    this.supportStatus = supportStatus;
    this.details = structuredClone(details);
  }
}

module.exports = { RuntimeError };
