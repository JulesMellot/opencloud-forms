# OpenCloud Forms

OpenCloud Forms adds a **Form** entry to the **New** menu and stores forms as native
`.ocform` files. A form can be shared with signed-in OpenCloud users or published through
an anonymous link.

## Features

- 12 question types, including file uploads
- required fields, length/value limits and multiple-choice limits
- authenticated and public responses
- optional respondent identity collection
- upload folders configurable per question
- responses stored as JSON files in OpenCloud
- optional OpenDocument (`.ods`) response spreadsheet saved in a folder chosen by the owner;
  every response is added to that same file
- copy detection, so a copied form cannot write into the original form's folders
- server-side validation, content-based file type checks and idempotent submissions

## Languages

The extension, public page and validation messages support **French, Spanish and German**,
with English also available. The extension follows the OpenCloud interface language. The public
page follows the browser's preferred supported language; append `?lang=fr`, `?lang=es`,
`?lang=de` or `?lang=en` to its URL to override it. Unsupported browser languages fall back to French.

Spreadsheet system headers and Yes/No answers use the **Spreadsheet language** setting. New
forms inherit the creator's interface language; existing forms default to French. Save the form
and update its spreadsheet to apply a language change. Form titles, questions, answer choices
and custom confirmation messages remain in the language chosen by their author.

## Downloads

Download **both** `forms.zip` and `forms-server.zip` from [GitHub Releases](https://github.com/JulesMellot/opencloud-forms/releases).
Installation is performed by the OpenCloud administrator, once per instance.
See [CHANGELOG.md](CHANGELOG.md) for release notes and validation limits.

## Architecture

The project has two parts:

- `dist/` is the OpenCloud Web extension, built from `src/`.
- `server/` is a small Node.js service used to validate and store submissions. It accesses
  only the response locations for which Forms creates password-protected technical links.
  Those credentials are encrypted in the `.ocform` file.

Anonymous respondents open a standalone page under `/forms-api/p/<token>`. Forms does not
publish or expose the `.ocform` file and the page does not load the OpenCloud Drive shell. A
minimal respondent-only snapshot is kept in the response folder and refreshed when the owner
edits the form.

The service is required for publication and response collection; installing only the Web
extension provides the editor but cannot accept responses.

## Requirements

- OpenCloud Web compatible with the 7.4 extension SDK
- Node.js 22.18 or newer
- HTTPS in production
- a reverse proxy route from `/forms-api/` to the Forms service

## Build and install the Web extension

```sh
npm ci
npm run build
```

Copy the complete `dist` directory to a `forms` directory below OpenCloud's
`WEB_ASSET_APPS_PATH`:

```text
<WEB_ASSET_APPS_PATH>/forms/manifest.json
<WEB_ASSET_APPS_PATH>/forms/js/...
<WEB_ASSET_APPS_PATH>/forms/assets/...
```

Restart OpenCloud after installing or rebuilding the extension. OpenCloud reads the
generated entrypoint from `manifest.json` when it starts; production builds use a hashed
entrypoint filename.

To create the distribution archives, run:

```sh
npm run package
```

This creates three archives and a `SHA256SUMS` checksum file:

- `forms.zip`: Web extension, with `manifest.json` at its root.
- `forms-server.zip`: standalone service, shared schema, license and installation instructions.
- `opencloud-forms-1.2.0.zip`: both installable archives and the project sources.

Packaging uses an explicit file list and excludes local configuration and credentials.
The `zip` command must be installed on the build machine (also used by CI).

Install the extension according to the [OpenCloud Web app documentation](https://docs.opencloud.eu/de/docs/admin/configuration/web-applications/).
Installation requires administrator access to the OpenCloud instance; respondents only need a browser.

## Run the Forms service

Keep the repository (or at least `package.json`, `server/`, `src/schema.ts` and `l10n/translations.json`) on the
service host, then run:

```sh
OPENCLOUD_URL=https://cloud.example.com \
FORMS_SECRET='replace-with-a-random-secret-of-at-least-32-characters' \
HOST=127.0.0.1 \
PORT=9280 \
npm run server
```

Configure the reverse proxy so every request under `/forms-api/` reaches this service. The
route may keep or strip the `/forms-api` prefix. Both `/forms-api/p/` and
`/forms-api/v1/public/` must be accessible without OpenCloud authentication; authenticated API
calls still carry and validate the user's bearer token.

Environment variables:

| Variable                       | Required | Default        | Purpose                                     |
| ------------------------------ | -------- | -------------- | ------------------------------------------- |
| `OPENCLOUD_URL`                | yes      | —              | Internal URL of the OpenCloud server        |
| `FORMS_SECRET`                 | yes      | —              | Encryption secret, at least 32 characters   |
| `HOST`                         | no       | `127.0.0.1`    | Listen address                              |
| `PORT`                         | no       | `9280`         | Listen port                                 |
| `FORMS_MAX_UPLOAD_MB`          | no       | `100`          | Maximum complete request size in MB         |
| `FORMS_CLIENT_IP_HEADER`       | no       | socket address | Trusted proxy header used for rate limiting |
| `FORMS_SUBMISSIONS_PER_10_MIN` | no       | `30`           | Submission limit per client and form        |

Back up `FORMS_SECRET` and keep it stable. Rotating or losing it invalidates existing form
publications; owners then need to stop and republish their forms.

The health check is available at `GET /healthz` (or `GET /forms-api/healthz` when the
prefix is preserved).

The included container image runs only the Forms service:

```sh
docker build -f server/Dockerfile -t opencloud-forms .
docker run --rm -p 127.0.0.1:9280:9780 \
  -e OPENCLOUD_URL=https://cloud.example.com \
  -e FORMS_SECRET='replace-with-a-random-secret-of-at-least-32-characters' \
  opencloud-forms
```

## Upgrade from 1.0

Version 1.1 replaces public shares of `.ocform` files with the standalone respondent page.
Deploy the new Web extension and rebuild/restart the Forms service together. Opening a
previously published form as its owner automatically replaces the legacy public token; the
owner can also use **Repair the public link**. The response folder and existing responses are
kept.

## Development and verification

```sh
npm run build:w
npm run server
npm run check
```

`npm run check` verifies formatting and lint, checks TypeScript, runs the schema and server
tests, then creates a production build.

The standalone public-page browser tests run without OpenCloud:

```sh
npx playwright install chromium
npm run test:public
```

The end-to-end suite needs a real OpenCloud instance with this extension installed, the
service proxied at `/forms-api`, and basic authentication enabled for test setup:

```sh
OPENCLOUD_URL=https://localhost:9200 \
ADMIN_USERNAME=admin \
ADMIN_PASSWORD=admin \
npm run test:e2e
```

The suite creates isolated temporary users and removes them when it finishes.

## Packaging notes

Responses remain normal OpenCloud files. Stopping publication removes the technical share
links used by Forms but deliberately keeps the response folder and existing response data.
The generated spreadsheet is a projection of the JSON responses and is overwritten on each
sync, so it should not be edited manually.

## Releases

`npm run package` builds the archives and their SHA-256 checksums. The `v*` tag workflow verifies
that the tag matches `package.json`, runs all local and public-page tests, and prepares a draft
GitHub release. Review the draft and verify integration with your OpenCloud version before publishing.

## License

AGPL-3.0.
