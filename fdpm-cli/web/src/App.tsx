import { Suspense, lazy, useEffect, useRef, useState } from "react";
import { ThemeToggle } from "./components/ThemeToggle";
import { RouteSkeleton } from "./components/AsyncState";

const WorkbooksPage = lazy(() =>
  import("./pages/WorkbooksPage").then((module) => ({ default: module.WorkbooksPage })),
);
const PluginsPage = lazy(() =>
  import("./pages/PluginsPage").then((module) => ({ default: module.PluginsPage })),
);
const PluginDetailPage = lazy(() =>
  import("./pages/PluginDetailPage").then((module) => ({ default: module.PluginDetailPage })),
);
const ProfileDetailPage = lazy(() =>
  import("./pages/ProfileDetailPage").then((module) => ({ default: module.ProfileDetailPage })),
);
const ProfileDocumentPage = lazy(() =>
  import("./pages/ProfileDocumentPage").then((module) => ({ default: module.ProfileDocumentPage })),
);
const WorkbookDetail = lazy(() =>
  import("./components/WorkbookDetail").then((module) => ({ default: module.WorkbookDetail })),
);

type Route =
  | { kind: "home" }
  | { kind: "workbooks" }
  | { kind: "workbook"; id: string }
  | { kind: "plugins" }
  | { kind: "plugin"; id: string }
  | { kind: "profile"; id: string }
  | { kind: "profile-doc"; id: string };

/** Last route, kept so that non-route hashes (in-page anchors like
 *  `#prim-section-3` produced by template TOC links) do NOT throw the user
 *  back to home — they navigate within the current document instead.
 *  Module-level state is intentional: parseHash is called from a hashchange
 *  listener and must remember what we were rendering before the anchor jump. */
let lastRoute: Route = { kind: "home" };

function parseHash(): Route {
  const h = window.location.hash || "#/";
  if (h === "#/" || h === "" || h === "#") {
    lastRoute = { kind: "home" };
    return lastRoute;
  }
  if (h === "#/workbooks") { lastRoute = { kind: "workbooks" }; return lastRoute; }
  if (h === "#/plugins")   { lastRoute = { kind: "plugins" };   return lastRoute; }
  if (h.startsWith("#/wb/"))      { lastRoute = { kind: "workbook", id: decodeURIComponent(h.slice("#/wb/".length)) }; return lastRoute; }
  if (h.startsWith("#/plugin/"))  { lastRoute = { kind: "plugin",   id: decodeURIComponent(h.slice("#/plugin/".length)) }; return lastRoute; }
  if (h.startsWith("#/profile-doc/")) { lastRoute = { kind: "profile-doc", id: decodeURIComponent(h.slice("#/profile-doc/".length)) }; return lastRoute; }
  if (h.startsWith("#/profile/")) { lastRoute = { kind: "profile",  id: decodeURIComponent(h.slice("#/profile/".length)) }; return lastRoute; }
  // Non-route hash (in-page anchor) — keep current route so :target can do its job.
  return lastRoute;
}

export function navigate(hash: string): void {
  window.location.hash = hash;
}

function routeKey(route: Route): string {
  return "id" in route ? `${route.kind}:${route.id}` : route.kind;
}

export function App() {
  const [route, setRoute] = useState<Route>(parseHash());
  const mainRef = useRef<HTMLElement>(null);
  const previousRouteKey = useRef(routeKey(route));

  useEffect(() => {
    const onHash = () => setRoute(parseHash());
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, []);

  useEffect(() => {
    const nextRouteKey = routeKey(route);
    if (previousRouteKey.current !== nextRouteKey) mainRef.current?.focus();
    previousRouteKey.current = nextRouteKey;
  }, [route]);

  const navActive = (kind: "workbooks" | "plugins") =>
    (kind === "workbooks" && (route.kind === "home" || route.kind === "workbooks" || route.kind === "workbook")) ||
    (kind === "plugins" && (route.kind === "plugins" || route.kind === "plugin" || route.kind === "profile" || route.kind === "profile-doc"));

  return (
    <div className="layout">
      <a className="skip-link" href="#main-content">Skip to content</a>
      <header className="topbar">
        <a href="#/" className="brand" aria-label="FDPM home">
          <span className="brand-mark">FDPM</span>
          <span className="brand-name">Workbench</span>
        </a>
        <div className="topbar-end">
          <nav className="topnav" aria-label="Primary">
            <a
              href="#/"
              className={navActive("workbooks") ? "active" : ""}
              aria-current={navActive("workbooks") ? "page" : undefined}
            >
              Workbooks
            </a>
            <a
              href="#/plugins"
              className={navActive("plugins") ? "active" : ""}
              aria-current={navActive("plugins") ? "page" : undefined}
            >
              Plugins
            </a>
          </nav>
          <ThemeToggle />
        </div>
      </header>
      <main id="main-content" ref={mainRef} tabIndex={-1}>
        <Suspense fallback={<RouteSkeleton />}>
          {route.kind === "home" || route.kind === "workbooks" ? (
            <WorkbooksPage />
          ) : route.kind === "workbook" ? (
            <WorkbookDetail id={route.id} onBack={() => navigate("#/")} />
          ) : route.kind === "plugins" ? (
            <PluginsPage />
          ) : route.kind === "plugin" ? (
            <PluginDetailPage id={route.id} />
          ) : route.kind === "profile" ? (
            <ProfileDetailPage id={route.id} />
          ) : route.kind === "profile-doc" ? (
            <ProfileDocumentPage id={route.id} />
          ) : null}
        </Suspense>
      </main>
    </div>
  );
}
