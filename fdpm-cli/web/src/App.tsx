import { useEffect, useState } from "react";
import { WorkbooksPage } from "./pages/WorkbooksPage";
import { PluginsPage } from "./pages/PluginsPage";
import { PluginDetailPage } from "./pages/PluginDetailPage";
import { ProfileDetailPage } from "./pages/ProfileDetailPage";
import { WorkbookDetail } from "./components/WorkbookDetail";

type Route =
  | { kind: "home" }
  | { kind: "workbooks" }
  | { kind: "workbook"; id: string }
  | { kind: "plugins" }
  | { kind: "plugin"; id: string }
  | { kind: "profile"; id: string };

function parseHash(): Route {
  const h = window.location.hash || "#/";
  if (h === "#/" || h === "" || h === "#") return { kind: "home" };
  if (h === "#/workbooks") return { kind: "workbooks" };
  if (h === "#/plugins") return { kind: "plugins" };
  if (h.startsWith("#/wb/")) return { kind: "workbook", id: decodeURIComponent(h.slice("#/wb/".length)) };
  if (h.startsWith("#/plugin/")) return { kind: "plugin", id: decodeURIComponent(h.slice("#/plugin/".length)) };
  if (h.startsWith("#/profile/")) return { kind: "profile", id: decodeURIComponent(h.slice("#/profile/".length)) };
  return { kind: "home" };
}

export function navigate(hash: string): void {
  window.location.hash = hash;
}

export function App() {
  const [route, setRoute] = useState<Route>(parseHash());

  useEffect(() => {
    const onHash = () => setRoute(parseHash());
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, []);

  const navActive = (kind: "workbooks" | "plugins") =>
    (kind === "workbooks" && (route.kind === "home" || route.kind === "workbooks" || route.kind === "workbook")) ||
    (kind === "plugins" && (route.kind === "plugins" || route.kind === "plugin" || route.kind === "profile"));

  return (
    <div className="layout">
      <header className="topbar">
        <h1>
          <a href="#/">FDPM</a>
        </h1>
        <nav className="topnav">
          <a href="#/" className={navActive("workbooks") ? "active" : ""}>
            Workbooks
          </a>
          <a href="#/plugins" className={navActive("plugins") ? "active" : ""}>
            Plugins
          </a>
        </nav>
      </header>
      <main>
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
        ) : null}
      </main>
    </div>
  );
}
