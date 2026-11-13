export interface UserData {
  uid: string;
  email: string;
  displayName: string;
  emailVerified: boolean;
  customClaims: Record<string, any>;
  metadata: any;
}
let generation = 0;
const listeners = new Set<(u: User | null) => void>();
export class User {
  uid: string;
  email: string;
  displayName: string;
  emailVerified: boolean;
  metadata: any;
  customClaims: Record<string, any>;
  constructor(data: UserData) {
    Object.assign(this, data);
  }
  async getIdToken() {
    return "selfhosted-session";
  }
  async getIdTokenResult() {
    return { claims: this.customClaims || {} };
  }
  async reload() {
    const data = await authRequest("/session");
    Object.assign(this, data);
    notify(data);
  }
}
export const auth = { currentUser: null as User | null };
export const isServerConfigured = true;
export async function authRequest(path: string, body?: unknown) {
  const res = await fetch("/api/auth" + path, {
    method: body === undefined ? "GET" : "POST",
    credentials: "same-origin",
    headers: { "Content-Type": "application/json", "X-CJ-Request": "1" },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || "Request failed");
  return data;
}
function notify(value: any) {
  generation++;
  auth.currentUser = value ? new User(value) : null;
  for (const listener of listeners) listener(auth.currentUser);
}
export function onAuthStateChanged(
  _auth: typeof auth,
  listener: (u: User | null) => void,
) {
  listeners.add(listener);
  const requestedGeneration = generation;
  authRequest("/session")
    .then((value) => {
      if (generation === requestedGeneration) notify(value);
    })
    .catch(() => {
      if (generation === requestedGeneration) notify(null);
    });
  return () => {
    listeners.delete(listener);
  };
}
export async function signInWithEmailAndPassword(
  _auth: typeof auth,
  email: string,
  password: string,
) {
  const result = await authRequest("/login", { email, password });
  notify(result.user);
  return { user: auth.currentUser! };
}
export async function createUserWithEmailAndPassword(
  _auth: typeof auth,
  email: string,
  password: string,
) {
  const result = await authRequest("/register", { email, password });
  notify(result.user);
  return { user: auth.currentUser! };
}
export async function signOut(_auth: typeof auth) {
  await authRequest("/logout", {});
  notify(null);
}
export async function updateProfile(
  user: User,
  input: { displayName: string },
) {
  const data = await authRequest("/profile", input);
  Object.assign(user, data);
  auth.currentUser = user;
}
export async function updatePassword(_user: User, password: string) {
  await authRequest("/password", { password });
  notify(null);
}
export const sendEmailVerification = (_user: User) =>
  authRequest("/send-verification", {});
export const sendPasswordResetEmail = (_auth: typeof auth, email: string) =>
  authRequest("/send-reset", { email });
