declare module "cloudflare:test" {
  // The pool's env is the Worker's env minus the service binding, which the
  // tests stop short of (see vitest.config.ts).
  interface ProvidedEnv extends Omit<Env, "APP"> {}
}
