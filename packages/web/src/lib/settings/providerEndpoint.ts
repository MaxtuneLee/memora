// Endpoints are synced metadata. Authentication belongs in the device-local key field.
export const normalizeProviderEndpoint = (value: string): string => {
  let url: URL;
  try {
    url = new URL(value.trim());
  } catch {
    throw new Error("Enter a valid HTTP or HTTPS base URL.");
  }
  if (url.protocol !== "http:" && url.protocol !== "https:")
    throw new Error("Enter a valid HTTP or HTTPS base URL.");
  if (url.username || url.password || url.search || url.hash)
    throw new Error(
      "Base URLs cannot contain credentials, query parameters, or fragments. Use the API key field for authentication.",
    );
  return url.toString().replace(/\/+$/, "");
};

export const redactProviderEndpoint = (value: string): string => {
  try {
    const url = new URL(value);
    url.username = "";
    url.password = "";
    url.search = "";
    url.hash = "";
    return normalizeProviderEndpoint(url.toString());
  } catch {
    return "";
  }
};
