import { useState } from "react";
import { authRequest } from "../lib/auth";
import { Button, Input, Label } from "../components/ui";
export default function AuthAction() {
  const reset = window.location.hash.startsWith("#/reset-password"),
    token =
      new URLSearchParams(window.location.hash.split("?")[1]).get("token") ||
      "";
  const [password, setPassword] = useState(""),
    [message, setMessage] = useState(""),
    [done, setDone] = useState(false),
    [busy, setBusy] = useState(false);
  return (
    <div className="max-w-md mx-auto p-8 space-y-4">
      <h1 className="text-2xl font-bold">
        {reset ? "Reset password" : "Verify email"}
      </h1>
      {message && <p role="status">{message}</p>}
      {!done && (
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            setBusy(true);
            try {
              await authRequest(
                reset ? "/reset-password" : "/verify-email",
                reset ? { token, password } : { token },
              );
              setDone(true);
              setMessage(
                reset
                  ? "Password updated. Sign in with your new password."
                  : "Email verified. You can sign in.",
              );
            } catch (e: any) {
              setMessage(e.message);
            } finally {
              setBusy(false);
            }
          }}
        >
          {reset && (
            <label>
              <Label>New password (at least 12 characters)</Label>
              <Input
                type="password"
                autoComplete="new-password"
                required
                minLength={12}
                maxLength={256}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </label>
          )}
          <Button type="submit" disabled={busy}>
            {reset ? "Set password" : "Verify email"}
          </Button>
        </form>
      )}
      <a href="/" className="underline">
        Return to sign in
      </a>
    </div>
  );
}
