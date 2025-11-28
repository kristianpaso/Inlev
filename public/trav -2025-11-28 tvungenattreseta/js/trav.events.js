
// Simple pub/sub
export const bus = new EventTarget();
export const on = (type, handler) => bus.addEventListener(type, handler);
export const emit = (type, detail) => bus.dispatchEvent(new CustomEvent(type,{detail}));
