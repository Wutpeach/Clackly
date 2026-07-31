const MODIFIERS = ["CTRL", "SHIFT", "ALT"];

function requirePlainObject(value, label) {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new TypeError(`${label} must be an object`);
  }
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) {
    throw new TypeError(`${label} must be a plain object`);
  }
}

function normalizeModifiers(value, label) {
  if (!Array.isArray(value)) {
    throw new TypeError(`${label} must be an array`);
  }

  const modifiers = new Set();
  for (const modifier of value) {
    if (!MODIFIERS.includes(modifier)) {
      throw new TypeError(`${label} contains unsupported modifier: ${modifier}`);
    }
    if (modifiers.has(modifier)) {
      throw new TypeError(`${label} contains duplicate modifier: ${modifier}`);
    }
    modifiers.add(modifier);
  }

  return MODIFIERS.filter((modifier) => modifiers.has(modifier));
}

function normalizeTrigger(trigger, label = "Interaction trigger") {
  requirePlainObject(trigger, label);
  const keys = Object.keys(trigger).sort();
  if (keys.length !== 3 || keys[0] !== "button" || keys[1] !== "modifiers" || keys[2] !== "type") {
    throw new TypeError(`${label} must contain only type, button, modifiers`);
  }
  if (trigger.type !== "mouse") {
    throw new TypeError(`${label} type must be mouse`);
  }
  if (trigger.button !== "left" && trigger.button !== "right") {
    throw new TypeError(`${label} button must be left or right`);
  }

  return {
    type: "mouse",
    button: trigger.button,
    modifiers: normalizeModifiers(trigger.modifiers, `${label} modifiers`)
  };
}

function normalizeMouseEventTrigger(event, label = "Interaction event") {
  requirePlainObject(event, label);
  if (event.type !== "mouse") {
    throw new TypeError(`${label} type must be mouse`);
  }
  if (!Number.isInteger(event.button)) {
    throw new TypeError(`${label} button must be an integer`);
  }

  const modifiers = [];
  for (const [key, modifier] of [["ctrlKey", "CTRL"], ["shiftKey", "SHIFT"], ["altKey", "ALT"]]) {
    if (typeof event[key] !== "boolean") {
      throw new TypeError(`${label} ${key} must be a boolean`);
    }
    if (event[key]) modifiers.push(modifier);
  }

  return {
    type: "mouse",
    button: event.button === 0 ? "left" : event.button === 2 ? "right" : null,
    modifiers
  };
}

function triggersEqual(left, right) {
  return left.type === right.type
    && left.button === right.button
    && left.modifiers.length === right.modifiers.length
    && left.modifiers.every((modifier, index) => modifier === right.modifiers[index]);
}

module.exports = { normalizeTrigger, normalizeMouseEventTrigger, triggersEqual };
