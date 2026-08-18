/**
 * Converso website widget.
 *
 * Pasted as one <script> tag on a customer's site. It adds a floating button
 * that opens the agent in an iframe. Everything the agent does happens inside
 * that iframe, so this file stays tiny and touches nothing on the host page:
 * no globals beyond one guard flag, no CSS that can leak out, no dependencies.
 *
 *   <script src="https://app.example.com/widget.js" data-agent="TOKEN"></script>
 *
 * Optional attributes: data-position="left" | "right" (default right),
 * data-label to change the button's accessible name.
 */
(function () {
  var script = document.currentScript;
  if (!script) return;

  var token = script.getAttribute("data-agent");
  if (!token) {
    console.error("[converso] the widget script needs a data-agent token");
    return;
  }
  // Two copies of the snippet on one page would stack two buttons.
  if (window.__conversoWidget) return;
  window.__conversoWidget = true;

  var base = new URL(script.src).origin;
  var side = script.getAttribute("data-position") === "left" ? "left" : "right";
  var label = script.getAttribute("data-label") || "Chat with us";

  var panel = document.createElement("iframe");
  // The embedding origin is passed explicitly: inside an iframe the browser
  // reports *our* origin, so without this the server can't tell which site the
  // widget is running on.
  panel.src =
    base + "/widget/" + encodeURIComponent(token) +
    "?o=" + encodeURIComponent(window.location.origin);
  panel.title = label;
  panel.setAttribute("allow", "microphone");
  panel.style.cssText = [
    "position:fixed", "bottom:88px", side + ":16px",
    "width:min(384px, calc(100vw - 32px))", "height:min(560px, calc(100vh - 120px))",
    "border:0", "border-radius:16px", "background:#fff",
    "box-shadow:0 12px 40px rgba(16,24,40,.18)", "z-index:2147483646",
    "display:none", "color-scheme:light",
  ].join(";");

  var button = document.createElement("button");
  button.type = "button";
  button.setAttribute("aria-label", label);
  button.setAttribute("aria-expanded", "false");
  button.style.cssText = [
    "position:fixed", "bottom:16px", side + ":16px",
    "width:56px", "height:56px", "border:0", "border-radius:9999px",
    "background:#16233F", "color:#fff", "cursor:pointer",
    "box-shadow:0 8px 24px rgba(16,24,40,.24)", "z-index:2147483647",
    "display:flex", "align-items:center", "justify-content:center",
  ].join(";");
  button.innerHTML =
    '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor"' +
    ' stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
    '<path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"/>' +
    "</svg>";

  function setOpen(open) {
    panel.style.display = open ? "block" : "none";
    button.setAttribute("aria-expanded", String(open));
  }

  button.addEventListener("click", function () {
    setOpen(panel.style.display === "none");
  });
  // Escape closes it, the way any overlay on the host page should.
  document.addEventListener("keydown", function (e) {
    if (e.key === "Escape") setOpen(false);
  });

  function mount() {
    document.body.appendChild(panel);
    document.body.appendChild(button);
  }
  // `defer`/`async` means this may run before <body> exists.
  if (document.body) mount();
  else document.addEventListener("DOMContentLoaded", mount);
})();
