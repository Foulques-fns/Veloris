import { getSessionUser, type SessionUser } from "./session";

/**
 * Backend-enforced admin guard. The role is ALWAYS read from the database
 * session — never from the request body, headers, or a client-sent email.
 */
export async function requireAdmin(): Promise<SessionUser | null> {
  const user = await getSessionUser();
  if (!user || user.role !== "admin") return null;
  return user;
}
