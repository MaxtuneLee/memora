import { MoonIcon, SunIcon } from "@phosphor-icons/react";
import { useEffect, type ReactElement } from "react";
import { Link, NavLink, Route, Routes, useLocation } from "react-router";

import { GithubButton } from "./lib/Github";
import { LogoMark } from "./lib/LogoMark";
import { WORDMARK_PATHS } from "./lib/dots";
import { useTheme } from "./lib/theme";
import { Docs } from "./pages/Docs";
import { HomePage } from "./pages/HomePage";
import { NotFound } from "./pages/NotFound";
import { Pricing } from "./pages/Pricing";
import { Sync } from "./pages/Sync";

function ThemeToggle(): ReactElement {
  const [theme, toggle] = useTheme();
  const dark = theme === "dark";
  return (
    <button
      type="button"
      className="theme-toggle"
      onClick={toggle}
      aria-label={dark ? "Switch to light mode" : "Switch to dark mode"}
      title={dark ? "Light mode" : "Dark mode"}
    >
      {dark ? <SunIcon weight="bold" /> : <MoonIcon weight="bold" />}
    </button>
  );
}

// New page, new scroll position; in-page anchors still work.
function ScrollToTop(): null {
  const { pathname, hash } = useLocation();
  useEffect(() => {
    if (!hash) window.scrollTo({ top: 0, behavior: "instant" });
  }, [pathname, hash]);
  return null;
}

export function App(): ReactElement {
  return (
    <>
      <ScrollToTop />
      <header className="nav">
        <div className="wrap">
          <Link className="brand" to="/" aria-label="Memora home">
            <LogoMark />
            <svg className="wordmark" viewBox="0 0 560 80" aria-hidden="true">
              <path fill="currentColor" d={WORDMARK_PATHS[0]} />
              <path fill="currentColor" opacity="0.55" d={WORDMARK_PATHS[1]} />
            </svg>
          </Link>
          <nav className="nav-links" aria-label="Pages">
            <NavLink to="/" end>
              Home
            </NavLink>
            <NavLink to="/pricing">Pricing</NavLink>
            <NavLink to="/sync">Sync</NavLink>
            <NavLink to="/docs">Docs</NavLink>
          </nav>
          <div className="nav-actions">
            <GithubButton label="GitHub" />
            <ThemeToggle />
          </div>
        </div>
      </header>
      <main id="top">
        <Routes>
          <Route path="/" element={<HomePage />} />
          <Route path="/pricing" element={<Pricing />} />
          <Route path="/docs" element={<Docs />} />
          <Route path="/docs/:slug" element={<Docs />} />
          <Route path="/sync" element={<Sync />} />
          <Route path="*" element={<NotFound />} />
        </Routes>
      </main>
      <footer>
        <div className="wrap">
          <span className="brand">
            <LogoMark size={22} />
            Memora
          </span>
        </div>
      </footer>
    </>
  );
}
