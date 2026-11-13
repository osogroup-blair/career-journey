# Self-hosted deployment, releases, and Firebase cutover

Career Journey now runs on one VM with Node 24, SQLite and private local files. Docker Compose packages Node, the application and Chromium. Firebase is not used by the application, sign-in, billing, discovery, support, Spotlight, MCP or document exports. The Firebase Admin SDK is a development-only dependency for the read-only migration exporter.

GitHub stores source and release tags. All tests and builds run on your workstation or VM through explicit scripts. There are no GitHub Actions workflows and no registry publishing requirement.

Deployment scripts live inside this repository under `scripts/`. Any launcher installed outside the codebase must use an application-specific name such as `career-journey-deploy.sh`, `career-journey-release.sh`, or `career-journey-rollback.sh`. An external launcher should invoke the script in the checkout by its absolute path; do not move the internal scripts, which locate the repository relative to themselves.

## First VM deployment

Install Git and Docker Engine with the Compose plugin. Give the deployment account permission to run Docker. Clone the repository onto the VM, using a GitHub deploy key if the repository is private:

```bash
git clone https://github.com/osogroup-blair/career-journey.git
cd career-journey
cp .env.example .env
chmod 600 .env
```

Edit `.env` on the VM:

- `APP_URL=https://career-journey.oso.group`
- For the explicit seed workflow below, leave `ADMIN_EMAIL` and `ADMIN_PASSWORD` empty. Alternatively, set both for environment-based first-boot bootstrap, using a unique password of at least 12 characters; choose one provisioning method.
- Configure Oso or a reachable Ollama server if you want AI. Stripe and SMTP remain optional.
- Reuse the VM’s existing Cloudflare Tunnel for `career-journey.oso.group`, following the ingress section below. This app does not launch a tunnel or another reverse proxy, and does not publish ports 80/443.

Deploy a published tag or branch:

```bash
./scripts/deploy.sh v1.0.0
# Or deploy a branch that has already been pushed:
./scripts/deploy.sh codex/selfhosted-vm
```

The script refuses a dirty working tree, locks concurrent deployments, fetches the chosen revision, builds an image tagged with its commit, stops writers, archives existing data/files/prompts, starts the new image and waits for health. It records the deployed revision under `.deploy/`. A failed replacement attempts to restart the prior recorded application image; backups are never automatically restored over newer data.

The script runs **on the VM**. It does not SSH to an assumed host, modify a GitHub repository, or create automation. On a fresh VM, apply the private administrator seed after deployment using the next section. If you chose environment-based bootstrap instead, first boot creates the administrator; after login remove `ADMIN_PASSWORD` from `.env` and redeploy. If importing existing accounts, import before first boot; bootstrap never replaces imported accounts/passwords.

For localhost-only testing over plain HTTP, set `APP_URL=http://localhost:47293` and `ALLOW_HTTP_LOCAL=true`. Production HTTPS uses Secure, HttpOnly, SameSite=Strict session cookies. The app port binds VM loopback by default; do not expose plain HTTP sessions on the internet.

## Explicit administrator seed (local Docker and VM)

The tracked seed template is `seeds/career-journey.seed.example.json`. It contains no working password and is rejected if applied unchanged. Generate a private seed with a unique random password for **each installation**. The seed provisions only the initial administrator, not Career Journey content, jobs, billing overrides or agent connections.

After building/starting the app, run these commands **inside the repository** on either your local machine or the VM:

```bash
umask 077
mkdir -p .seeds
chmod 700 .seeds
# Replace this email with the intended administrator's real address on the VM.
# Use career-journey.local.seed.json locally and career-journey.vm.seed.json on the VM.
docker compose run --rm --no-deps -T --entrypoint node app \
  dist/seed-init.mjs --email your-address@example.com --name Administrator \
  > .seeds/career-journey.vm.seed.json
chmod 600 .seeds/career-journey.vm.seed.json
docker compose exec -T app node dist/maintenance.mjs seed \
  < .seeds/career-journey.vm.seed.json
```

Use `APP_VERSION=local` with Compose if you started the local image that way. For a script-deployed VM, use the recorded deployed image version so the one-off container uses the same image:

```bash
export APP_VERSION="$(cut -c1-12 .deploy/current)"
# Then run the generation/application commands above.
```

The private seed JSON contains the login email and password. `.seeds/` is gitignored and excluded from Docker image builds. Keep the file private; never commit, email or bake it into an image. Do not overwrite an existing seed file on reruns. Read the original file for the initial login, then change the password in Profile and remove the obsolete private seed when it is no longer needed. Generate a different seed for the VM rather than copying local credentials there.

Applying the same seed again preserves the existing administrator's password, permissions and data. It does not reset passwords. If another account already exists, or the matching account is not already an administrator, seeding refuses to add/promote an administrator; use explicit account maintenance instead. It never overwrites imported Firebase accounts. Avoid combining this workflow with ADMIN_EMAIL/ADMIN_PASSWORD first-boot bootstrap: choose one provisioning method; for explicit seeds, leave those bootstrap variables empty.

For development without Docker:

```bash
umask 077
mkdir -p .seeds
npm run --silent seed:init -- --email your-address@example.com > .seeds/career-journey.local.seed.json
npm run seed:apply -- .seeds/career-journey.local.seed.json
```

Always apply to the intended DATA_DIR. Docker commands above run inside the app container and target its persistent `/app/data` volume. No restart is required after applying the seed. Verify sign-in and the administrator menu before opening the Cloudflare route to users.

## Existing Cloudflare Tunnel ingress

Public URL: **https://career-journey.oso.group**. Keep that value in APP_URL so cookie-origin checks, redirects, reset links, Spotlight URLs and MCP host validation all use the public hostname. Browser traffic uses HTTPS; the tunnel can forward to the private HTTP origin. Leave ALLOW_HTTP_LOCAL unset/false so production cookies remain Secure.

If `cloudflared` runs on the VM host (or uses host networking), add a published application route to the **existing tunnel**:

| Setting | Value |
|---|---|
| Public hostname | `career-journey.oso.group` |
| Service type | HTTP |
| Origin URL | `http://127.0.0.1:47293` |
| HTTP Host Header | `career-journey.oso.group` |

A locally managed ingress-rule snippet is provided at `deploy/cloudflare-ingress.example.yml`. Add that rule before the existing catch-all; preserve all other application rules and the existing tunnel credentials. For a remotely managed tunnel, enter the same settings in its published application routes. Do not point the origin at the public hostname, which would route back into the tunnel.

If `cloudflared` instead runs in a Docker container on a bridge network, `127.0.0.1` refers to that container, not the VM or this app. Connect Career Journey to the tunnel container’s existing network by setting these values in the VM’s private `.env`:

```dotenv
COMPOSE_FILE=docker-compose.yml:docker-compose.tunnel.yml
CLOUDFLARE_TUNNEL_NETWORK=your-existing-tunnel-network
```

Then use `http://career-journey:47293` as the tunnel service URL, with the same public HTTP Host Header. The override joins an existing external network with the unique `career-journey` alias; it does not create or modify the tunnel container. Only use a network that the existing connector is attached to. No tunnel token belongs in this repository or its app container.

Do not add a Cloudflare cache-everything rule for authenticated pages/API/MCP traffic. After adding the route, verify sign-in over the public HTTPS URL, API reads/writes and (when enabled) authenticated MCP calls. Cloudflare Access, if used on this hostname, is a separate policy and must permit the intended users/clients. The existing tunnel/DNS configuration was not changed by this code update.

References: [Cloudflare published application routing](https://developers.cloudflare.com/tunnel/concepts/routing/) and [HTTP origin troubleshooting](https://developers.cloudflare.com/tunnel/troubleshooting/https-origins/).

## Publish a release from your workstation

Commit and review the changes on a named branch, then run:

```bash
./scripts/release.sh v1.0.0
```

This installs locked dependencies, runs tests/typechecks/build, pushes the current branch, creates an annotated version tag, and pushes that tag to GitHub. It does not merge the branch into main. No GitHub Actions are involved. Then run `./scripts/deploy.sh v1.0.0` on the VM. GitHub credentials/deploy keys must already be configured through Git/SSH; scripts never embed credentials.

## Persistent state and backups

Compose uses these persistent volumes:

- `career-journey_app-data`: `career-journey.sqlite`, SQLite WAL files, `files/` attachments/exports and the private `file-signing.key`.
- `career-journey_prompt-config` and `career-journey_knowledge-config`: admin prompt/skill changes.

Images contain no user database, `.env`, migration export or backup. Never run `docker compose down --volumes` unless you intend to erase persistent data.

Deployment archives are private `.tgz` files under `backups/` on the VM. Copy them to encrypted off-VM storage; backups on the same disk do not protect against VM/disk loss. Deployment performs a stopped-writer archive containing the complete app data and prompt volumes, including SQLite WAL files. `npm run maintenance -- backup /secure/directory` creates an online SQLite-only snapshot for local Node installations; also archive private files/signing keys with writers stopped for a full snapshot.

Application rollback:

```bash
./scripts/rollback.sh
```

This restarts the previously recorded image without changing the data. For full data recovery, stop the app, preserve the current volumes, inspect the archive (`tar -tzf backups/<file>.tgz`), and restore its `data/`, `server/promptConfig/` and `server/knowledgeConfig/` contents into the corresponding volumes using a one-off container. Restore with the app stopped, preserve node user ownership, then restart and verify sign-in, jobs, PDFs and MCP revocation. Do not mix a database snapshot from one time with files from another. Keep the previous image until the release is accepted.

This is designed for one application instance on one VM. SQLite WAL is appropriate for that deployment; do not share the data volume over network storage or scale the service to multiple independent replicas. Retain disk-space monitoring and backups.

## Existing Firebase data: read-only export and local import

Cut over during a maintenance window. Stop writes to the old Firebase-backed app first so the export is consistent. The exporter does not lock a live Firebase project, delete data, deploy rules or change Firebase credentials.

On a trusted machine with the **old** Firebase credentials and development dependencies installed:

```bash
npm ci
# FIREBASE_SERVICE_ACCOUNT_JSON and VITE_FIREBASE_STORAGE_BUCKET are used ONLY by this exporter.
npm run export:firebase -- migration-export
```

The exporter recursively walks documents (including subcollections below missing parent documents), exports accounts with their UIDs/admin claims, and downloads private storage objects. `migration-export/` is private, gitignored, and excluded from images. Treat it as personal data and credentials-adjacent material; transfer it securely to the VM. Keep the original Firebase project intact until acceptance.

Validate and import into a fresh local data directory:

```bash
DATA_DIR=./imported-data npm run import:firebase -- migration-export
DATA_DIR=./imported-data npm run import:firebase -- migration-export --apply
```

The importer checks the manifest and document paths, refuses a nonempty target database, and retains original UIDs. Existing Stripe subscriptions keep resolving through the legacy `firebaseUID` metadata field; newly created subscriptions use `appUID`.

Firebase password hashes and sessions are **not reused**. Before cutover, set a local password for the imported administrator:

```bash
# Supply ADMIN_EMAIL / ADMIN_PASSWORD securely through your environment or a private env file.
DATA_DIR=./imported-data npm run maintenance -- set-password
```

Other users need local password resets via configured SMTP or administrator CLI maintenance. Imported email verification and account suspension/admin flags are retained. Social-only Firebase accounts also require a local password; social federation is not implemented in this release.

For Compose, put the validated directory contents in the `app-data` volume before starting the app. Example using the built image (run from the repository after building it):

```bash
APP_VERSION=local docker compose build app
# Creates/mounts the volume; copies ONLY the validated import directory, not .env or the old service-account key.
APP_VERSION=local docker compose run --rm --no-deps -v "$PWD/imported-data:/import:ro" --entrypoint sh app -c 'cp -a /import/. /app/data/'
```

The destination must be fresh. The copy runs as the non-root application user; ensure the import directory is readable by that user. Never copy an import over a running/populated instance. Validate user/document/file counts, sign-in, billing ownership, canonical Career Journey, jobs, resume exports, support attachments, Spotlight and MCP permissions before redirecting traffic and retiring Firebase. This repository change does not perform a live cutover for you.

## Local maintenance

```bash
npm ci
# Configure ADMIN_EMAIL/ADMIN_PASSWORD and optional AI in .env.
# For local development set APP_URL=http://localhost:47293, then:
npm run dev
npm run maintenance -- create-user     # ordinary user; CREATE_ADMIN=true explicitly grants admin
npm run maintenance -- set-password   # revokes existing sessions
npm run set:admin -- person@example.com
npm run verify:agents -- --live       # disposable LOCAL account/files; no Firebase
npm test
npm run lint
npm run build
```

The `--ai` verifier option makes real provider calls and consumes provider usage. The non-AI check verifies local authentication, SQLite persistence, private PDF/DOCX downloads, MCP scopes, reports and revocation, then removes its disposable test data.

SMTP enables verification/reset email. Self-service registration is off by default and requires both `ALLOW_REGISTRATION=true` and working SMTP. There is no public built-in demo password. Changing a password requires a recent sign-in; reset links are expiring and single-use. Do not place human cookies/session tokens in agents; agents use separate scoped, revocable credentials.

## Validation of this migration

The implementation passed 498 automated tests, TypeScript checking, production builds, Compose configuration/shell checks, local SQLite/auth/MCP/export integration verification and a production Docker startup/sign-in/write/restart test. The runtime image was checked to contain neither Firebase client nor Admin SDK. Deploy selection, backups and failed-health rollback were tested against disposable Git repositories and a Docker command test double. The image itself was built and exercised with real Docker. The existing Cloudflare Tunnel route and a live Firebase cutover still require VM configuration and a maintenance window; neither was changed by these checks.

## Failed first deployment: invalid bootstrap password

If startup logs show `Use a password of 12–256 characters` from `bootstrapAdmin`, the VM has environment-based administrator credentials set with an invalid password length. For the explicit seed workflow, edit `.env` and set both `ADMIN_EMAIL=""` and `ADMIN_PASSWORD=""`, then rerun deployment. Do not change the password minimum or delete the data volume. The deployment script now checks provisioning settings in the built image before stopping the current app or opening its database.

`.deploy/current` is created only after a healthy deployment. If it is missing, do not run commands that read it yet; fix configuration and complete `./scripts/deploy.sh codex/selfhosted-vm` first. With no recorded successful deployment, the script retains failed-container logs and reports that no prior image could be restored. Existing data and backups are preserved.
