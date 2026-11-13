import { authHeaders } from "./aiClient";
export async function assistantRequest(
  path: string,
  body?: unknown,
  method?: string,
) {
  const response = await fetch(`/api/assistant${path}`, {
    method: method ?? (body === undefined ? "GET" : "POST"),
    headers: { "Content-Type": "application/json", ...(await authHeaders()) },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  const value = await response.json();
  if (!response.ok) throw new Error(value.error ?? "Assistant request failed");
  return value;
}
