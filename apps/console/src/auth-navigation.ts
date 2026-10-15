export function authNavigation(search: string) {
  const params = new URLSearchParams(search);
  const oauth = params.has("client_id") && params.has("sig");
  const oauthSearch = oauth
    ? `?${search
        .replace(/^\?/, "")
        .split("&")
        .filter((part) => !/^(error|error_description|verification)=/.test(part))
        .join("&")}`
    : "";
  const requestedReturnTo = params.get("return_to");
  const returnTo =
    requestedReturnTo?.startsWith("/cli-login?") &&
    !requestedReturnTo.includes("\\") &&
    ![...requestedReturnTo].some((character) => character.charCodeAt(0) < 32)
      ? requestedReturnTo
      : undefined;
  const authSearch = oauthSearch || (returnTo ? `?return_to=${encodeURIComponent(returnTo)}` : "");
  return { oauth, oauthSearch, returnTo, authSearch };
}
