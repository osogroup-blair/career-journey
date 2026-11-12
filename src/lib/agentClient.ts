import { authHeaders } from "./aiClient";
export async function agentRequest(path: string, body?: unknown) {
  const response = await fetch(`/api/agent${path}`, {
    method: body === undefined ? "GET" : "POST",
    headers: { "Content-Type": "application/json", ...(await authHeaders()) },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error ?? "Request failed");
  return result;
}
export const agentCommand = async (name: string, input: unknown = {}) =>
  (await agentRequest(`/commands/${name}`, input)).data;
