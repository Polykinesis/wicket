import { type VisitorSession, visitorSessionSchema } from "@cf-chat/shared/widget";

/**
 * Where the visitor token lives between page loads: `sessionStorage`, keyed by
 * site key. Tab-scoped on purpose, so a shared computer does not hand the next
 * person the previous conversation, and so two tabs are two conversations.
 * (`localStorage` would resume across tabs; revisit if visitors complain.)
 *
 * Every call is wrapped: storage throws in private windows, under some
 * enterprise policies and when quota is exhausted, and none of those is a
 * reason for the widget to fail. A store that cannot persist just means the
 * visitor is challenged again on reload.
 */
export interface SessionStore {
  load(): VisitorSession | null;
  save(session: VisitorSession): void;
  clear(): void;
}

export const sessionStorageKey = (siteKey: string): string => `cfchat:${siteKey}`;

export function sessionStore(
  siteKey: string,
  storage: Storage | null = defaultStorage(),
): SessionStore {
  const key = sessionStorageKey(siteKey);
  return {
    load() {
      try {
        const raw = storage?.getItem(key);
        if (!raw) {
          return null;
        }
        const parsed = visitorSessionSchema.safeParse(JSON.parse(raw));
        if (!parsed.success) {
          // Written by an older embed, or tampered with. Either way, not a session.
          storage?.removeItem(key);
          return null;
        }
        return parsed.data;
      } catch {
        return null;
      }
    },
    save(session) {
      try {
        storage?.setItem(key, JSON.stringify(session));
      } catch {
        // Quota or policy. The session still works for this page load.
      }
    },
    clear() {
      try {
        storage?.removeItem(key);
      } catch {
        // Nothing to do; a store that cannot delete also could not have saved.
      }
    },
  };
}

function defaultStorage(): Storage | null {
  try {
    return typeof sessionStorage === "undefined" ? null : sessionStorage;
  } catch {
    // Accessing the global itself throws when storage is disabled.
    return null;
  }
}
