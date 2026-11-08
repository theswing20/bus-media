export const log = {
  info: (...a: unknown[]) => console.log(new Date().toISOString(), "[info]", ...a),
  warn: (...a: unknown[]) => console.warn(new Date().toISOString(), "[warn]", ...a),
  error: (...a: unknown[]) => console.error(new Date().toISOString(), "[error]", ...a),
};
