# Memora WebDAV server

A small WebDAV server on Cloudflare Workers that stores files in R2. Memora uses it to sync a
workspace between your devices. Your data stays in your own Cloudflare account.

Design and protocol: [docs/proposal-webdav-sync.md](../../docs/proposal-webdav-sync.md).

## Deploy

[![Deploy to Cloudflare](https://deploy.workers.cloudflare.com/button)](https://deploy.workers.cloudflare.com/?url=https://github.com/MaxtuneLee/memora/tree/main/packages/webdav-worker)

Or from this folder:

```bash
pnpm exec wrangler deploy
pnpm exec wrangler secret put DAV_USERNAME
pnpm exec wrangler secret put DAV_PASSWORD
```

The first deploy creates the R2 bucket. Until both secrets are set, the server answers every
request with `503`.

In Memora, use the Worker's URL (for example `https://memora-webdav.<account>.workers.dev`) with
the username and password you set.

## Settings

| Name             | Where                   | Meaning                                                                          |
| ---------------- | ----------------------- | -------------------------------------------------------------------------------- |
| `DAV_USERNAME`   | Secret                  | Basic auth username. Required.                                                   |
| `DAV_PASSWORD`   | Secret                  | Basic auth password. Required.                                                   |
| `ALLOWED_ORIGIN` | `wrangler.jsonc` `vars` | Site allowed to call the server. Set it to `https://app.memora.im`. Default `*`. |

## Develop

```bash
pnpm run dev
```

This runs on `http://localhost:8787` with a local R2 bucket and the credentials `dev` / `dev`.

## What it serves

- **WebDAV** for Memora's event log: `OPTIONS`, `MKCOL`, `PUT` (with `If-None-Match` and
  `If-Match`), `GET`, `HEAD`, and `PROPFIND` at depth 0 or 1.
- **R2 multipart upload** for file contents, with S3-shaped requests and JSON bodies:

  | Request                                  | Meaning                                        |
  | ---------------------------------------- | ---------------------------------------------- |
  | `POST <key>?uploads`                     | Start an upload, returns `{ uploadId }`        |
  | `PUT <key>?uploadId=…&partNumber=N`      | Store one part, returns `{ partNumber, etag }` |
  | `POST <key>?uploadId=…` with `{ parts }` | Complete the upload                            |
  | `DELETE <key>?uploadId=…`                | Abort it                                       |

  Every part except the last must have the same size, at least 5 MiB. A request body is limited to
  100 MB on Cloudflare's Free and Pro plans. Memora uses 8 MiB parts. An unknown or expired upload
  returns `409`.

`DELETE <key>` removes an object, and `DELETE <path>/` removes everything under the path, like
WebDAV. There is no `MOVE`, `COPY`, or `LOCK`, so Finder and Explorer cannot mount it.
