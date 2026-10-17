/** Give the official embed its own document lifetime; it has no public dispose API. */
export function startWebMcpRelay(): () => void {
  const frame = document.createElement("iframe");
  frame.src = `${import.meta.env.BASE_URL}webmcp-relay.html`;
  frame.hidden = true;
  frame.title = "WebMCP relay";
  frame.setAttribute("aria-hidden", "true");
  frame.setAttribute("allow", "loopback-network; local-network; local-network-access");
  frame.dataset.memoraWebmcpRelay = "";
  document.body.appendChild(frame);
  return () => frame.remove();
}
