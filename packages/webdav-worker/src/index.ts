/**
 * A minimal WebDAV server on Cloudflare Workers, backed by R2.
 *
 * It implements what Memora's WebDAV sync needs: OPTIONS, MKCOL, PUT (with conditional headers),
 * GET and PROPFIND (depth 0 or 1). R2 has no folders, so a collection is an empty `<path>/`
 * marker object plus whatever keys share its prefix.
 *
 * File contents use R2's multipart upload, exposed with S3-shaped requests (see `multipart`).
 *
 * ponytail: no MOVE, COPY, LOCK or PROPPATCH. Add them before pointing general WebDAV
 * clients (Finder, Explorer) at it.
 */

interface Env {
  BUCKET: R2Bucket;
  /** Origin allowed to call the server from a browser, e.g. `https://app.memora.im`. Default `*`. */
  ALLOWED_ORIGIN?: string;
  /** HTTP Basic auth credentials, set as secrets. Without them every request is refused. */
  DAV_USERNAME?: string;
  DAV_PASSWORD?: string;
}

const corsHeaders = (env: Env): Record<string, string> => ({
  "Access-Control-Allow-Origin": env.ALLOWED_ORIGIN ?? "*",
  "Access-Control-Allow-Methods": "OPTIONS, HEAD, GET, PUT, POST, DELETE, MKCOL, PROPFIND",
  "Access-Control-Allow-Headers": "Authorization, Content-Type, Depth, If-Match, If-None-Match",
  "Access-Control-Expose-Headers": "ETag, DAV",
  "Access-Control-Max-Age": "86400",
});

const escapeXml = (value: string): string =>
  value.replace(/[<>&'"]/g, (char) => `&#${char.charCodeAt(0)};`);

const encoder = new TextEncoder();

const isAuthorized = (request: Request, username: string, password: string): boolean => {
  const given = encoder.encode(request.headers.get("Authorization") ?? "");
  const expected = encoder.encode(`Basic ${btoa(`${username}:${password}`)}`);
  return given.byteLength === expected.byteLength && crypto.subtle.timingSafeEqual(given, expected);
};

const propResponse = (
  href: string,
  props: { collection: boolean; size?: number; etag?: string; modified?: Date },
) =>
  `<d:response><d:href>${escapeXml(href)}</d:href><d:propstat><d:prop>` +
  (props.collection ? "<d:resourcetype><d:collection/></d:resourcetype>" : "<d:resourcetype/>") +
  (props.size !== undefined ? `<d:getcontentlength>${props.size}</d:getcontentlength>` : "") +
  (props.etag ? `<d:getetag>${escapeXml(props.etag)}</d:getetag>` : "") +
  (props.modified ? `<d:getlastmodified>${props.modified.toUTCString()}</d:getlastmodified>` : "") +
  "</d:prop><d:status>HTTP/1.1 200 OK</d:status></d:propstat></d:response>";

const collectionExists = async (bucket: R2Bucket, prefix: string): Promise<boolean> => {
  if (prefix === "") return true;
  if (await bucket.head(prefix)) return true;
  return (await bucket.list({ prefix, limit: 1 })).objects.length > 0;
};

const propfind = async (
  request: Request,
  env: Env,
  key: string,
  path: string,
): Promise<Response> => {
  const responses: string[] = [];
  const object = key === "" || key.endsWith("/") ? null : await env.BUCKET.head(key);

  if (object) {
    responses.push(
      propResponse(path, {
        collection: false,
        size: object.size,
        etag: object.httpEtag,
        modified: object.uploaded,
      }),
    );
  } else {
    const prefix = key === "" || key.endsWith("/") ? key : `${key}/`;
    if (!(await collectionExists(env.BUCKET, prefix))) return new Response(null, { status: 404 });
    const base = path.endsWith("/") ? path : `${path}/`;
    responses.push(propResponse(base, { collection: true }));

    if (request.headers.get("Depth") !== "0") {
      // ponytail: Depth "infinity" is answered like Depth 1.
      let cursor: string | undefined;
      do {
        const page = await env.BUCKET.list({ prefix, delimiter: "/", cursor });
        for (const child of page.delimitedPrefixes) {
          responses.push(
            propResponse(`${base}${encodeURIComponent(child.slice(prefix.length, -1))}/`, {
              collection: true,
            }),
          );
        }
        for (const child of page.objects) {
          if (child.key === prefix) continue; // the collection marker itself
          responses.push(
            propResponse(`${base}${encodeURIComponent(child.key.slice(prefix.length))}`, {
              collection: false,
              size: child.size,
              etag: child.httpEtag,
              modified: child.uploaded,
            }),
          );
        }
        cursor = page.truncated ? page.cursor : undefined;
      } while (cursor);
    }
  }

  return new Response(
    `<?xml version="1.0" encoding="utf-8"?><d:multistatus xmlns:d="DAV:">${responses.join("")}</d:multistatus>`,
    {
      status: 207,
      headers: { "Content-Type": "application/xml; charset=utf-8" },
    },
  );
};

/**
 * Multipart upload, shaped like S3's REST API but with JSON bodies:
 * - `POST <key>?uploads` starts an upload and returns `{ uploadId }`.
 * - `PUT <key>?uploadId=…&partNumber=N` stores one part and returns `{ partNumber, etag }`.
 * - `POST <key>?uploadId=…` with `{ parts }` completes the upload.
 * - `DELETE <key>?uploadId=…` aborts it.
 * R2 requires every part except the last to have the same size, at least 5 MiB.
 */
const multipart = async (request: Request, env: Env, key: string, url: URL): Promise<Response> => {
  if (key === "" || key.endsWith("/")) return new Response(null, { status: 405 });

  if (request.method === "POST" && url.searchParams.has("uploads")) {
    const upload = await env.BUCKET.createMultipartUpload(key, {
      httpMetadata: { contentType: request.headers.get("Content-Type") ?? undefined },
    });
    return Response.json({ uploadId: upload.uploadId });
  }

  const uploadId = url.searchParams.get("uploadId");
  if (!uploadId) return new Response("Missing uploadId", { status: 400 });
  const upload = env.BUCKET.resumeMultipartUpload(key, uploadId);

  // R2 throws for an unknown, expired (7 days) or already finished upload. The client starts over.
  try {
    if (request.method === "PUT") {
      const partNumber = Number(url.searchParams.get("partNumber"));
      if (!Number.isInteger(partNumber) || partNumber < 1 || partNumber > 10_000) {
        return new Response("Invalid partNumber", { status: 400 });
      }
      // An empty file is one empty part, which arrives without a body.
      return Response.json(await upload.uploadPart(partNumber, request.body ?? ""));
    }
    if (request.method === "POST") {
      const { parts } = await request.json<{ parts: R2UploadedPart[] }>();
      const object = await upload.complete(parts);
      return new Response(null, { status: 201, headers: { ETag: object.httpEtag } });
    }
    if (request.method === "DELETE") {
      await upload.abort();
      return new Response(null, { status: 204 });
    }
  } catch (error) {
    return new Response(String(error), { status: 409 });
  }
  return new Response(null, { status: 405 });
};

const handle = async (request: Request, env: Env): Promise<Response> => {
  const url = new URL(request.url);
  const path = url.pathname;
  const key = decodeURIComponent(path).replace(/^\/+/, "");

  const isMultipart = url.searchParams.has("uploads") || url.searchParams.has("uploadId");
  if (isMultipart && request.method !== "OPTIONS") {
    return multipart(request, env, key, url);
  }

  switch (request.method) {
    case "OPTIONS":
      return new Response(null, {
        headers: { DAV: "1", Allow: corsHeaders(env)["Access-Control-Allow-Methods"] },
      });

    case "HEAD": {
      const object = await env.BUCKET.head(key);
      if (!object) return new Response(null, { status: 404 });
      return new Response(null, {
        headers: { ETag: object.httpEtag, "Content-Length": String(object.size) },
      });
    }

    case "GET": {
      const object = await env.BUCKET.get(key, { onlyIf: request.headers });
      if (!object) return new Response(null, { status: 404 });
      if (!("body" in object))
        return new Response(null, { status: 304, headers: { ETag: object.httpEtag } });
      const headers = new Headers({ ETag: object.httpEtag });
      object.writeHttpMetadata(headers);
      return new Response(object.body, { headers });
    }

    case "PUT": {
      if (key === "" || key.endsWith("/")) return new Response(null, { status: 405 });
      // R2 evaluates If-None-Match / If-Match atomically and returns null when they fail.
      const object = await env.BUCKET.put(key, request.body, {
        onlyIf: request.headers,
        httpMetadata: { contentType: request.headers.get("Content-Type") ?? undefined },
      });
      if (!object) return new Response(null, { status: 412 });
      return new Response(null, { status: 201, headers: { ETag: object.httpEtag } });
    }

    case "MKCOL": {
      const prefix = key.endsWith("/") ? key : `${key}/`;
      if (prefix === "/" || (await collectionExists(env.BUCKET, prefix)))
        return new Response(null, { status: 405 });
      await env.BUCKET.put(prefix, "");
      return new Response(null, { status: 201 });
    }

    case "DELETE": {
      // Like WebDAV, deleting a collection (`<path>/`) removes everything under it.
      if (key === "" || key === "/") return new Response(null, { status: 403 });
      if (!key.endsWith("/")) {
        await env.BUCKET.delete(key);
        return new Response(null, { status: 204 });
      }
      let listed: R2Objects;
      do {
        listed = await env.BUCKET.list({ prefix: key, limit: 1000 });
        if (listed.objects.length > 0)
          await env.BUCKET.delete(listed.objects.map((object) => object.key));
      } while (listed.truncated);
      return new Response(null, { status: 204 });
    }

    case "PROPFIND":
      return propfind(request, env, key, path);

    default:
      return new Response(null, { status: 405 });
  }
};

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    // Fail closed: a deployment without credentials must not expose the bucket.
    const response =
      request.method === "OPTIONS"
        ? await handle(request, env)
        : !env.DAV_USERNAME || !env.DAV_PASSWORD
          ? new Response("Set the DAV_USERNAME and DAV_PASSWORD secrets.", { status: 503 })
          : isAuthorized(request, env.DAV_USERNAME, env.DAV_PASSWORD)
            ? await handle(request, env)
            : new Response(null, {
                status: 401,
                headers: { "WWW-Authenticate": 'Basic realm="Memora"' },
              });
    // Responses from R2 bodies have immutable headers, so copy before adding CORS.
    const withCors = new Response(response.body, response);
    for (const [name, value] of Object.entries(corsHeaders(env))) withCors.headers.set(name, value);
    return withCors;
  },
} satisfies ExportedHandler<Env>;
