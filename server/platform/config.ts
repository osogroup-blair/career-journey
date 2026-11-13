/** Validate provisioning configuration without opening the database or disclosing credentials. */
export function validateBootstrapConfig(
  env: Record<string, string | undefined>,
) {
  const email = env.ADMIN_EMAIL || "",
    password = env.ADMIN_PASSWORD || "";
  if (!email && !password) return;
  if (!email || !password)
    throw new Error(
      "Set both ADMIN_EMAIL and ADMIN_PASSWORD for bootstrap, or leave both empty to use the administrator seed.",
    );
  if (password.length < 12 || password.length > 256)
    throw new Error(
      'ADMIN_PASSWORD must contain 12–256 characters. For the seed workflow, set ADMIN_EMAIL="" and ADMIN_PASSWORD="" in .env.',
    );
}
