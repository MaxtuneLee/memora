import { useEffect, useState, type ReactElement } from "react";
import { CaretDownIcon } from "@phosphor-icons/react";
import { Link, NavLink, Navigate, useParams } from "react-router";

import { usePageMeta } from "../lib/pageMeta";
import { DOCS } from "./docs/content";

const GROUPS = [...new Set(DOCS.map((d) => d.group))];

export function Docs(): ReactElement {
  const { slug = "overview" } = useParams();
  const index = DOCS.findIndex((d) => d.slug === slug);
  const page = DOCS[index];
  const [active, setActive] = useState("");
  usePageMeta({
    title: page ? `${page.title} · Memora docs` : "Memora docs",
    description: page?.lead ?? "",
    path: page && page.slug !== "overview" ? `/docs/${page.slug}` : "/docs",
  });
  // Collapsible groups: the current page's group opens on its own; the rest remember the
  // visitor's choice. On phones the whole menu folds into one row.
  const [open, setOpen] = useState<Set<string>>(() => new Set(page ? [page.group] : []));
  const [menuOpen, setMenuOpen] = useState(false);
  useEffect(() => {
    if (!page) return;
    setOpen((o) => (o.has(page.group) ? o : new Set(o).add(page.group)));
    setMenuOpen(false);
  }, [page]);
  const toggle = (g: string) =>
    setOpen((o) => {
      const n = new Set(o);
      if (n.has(g)) n.delete(g);
      else n.add(g);
      return n;
    });

  // Highlight the section being read in "On this page".
  useEffect(() => {
    if (!page) return;
    setActive(page.sections[0]?.id ?? "");
    const io = new IntersectionObserver(
      (entries) => {
        const hit = entries
          .filter((e) => e.isIntersecting)
          .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)[0];
        if (hit) setActive(hit.target.id);
      },
      { rootMargin: "-90px 0px -65% 0px" },
    );
    page.sections.forEach((s) => {
      const el = document.getElementById(s.id);
      if (el) io.observe(el);
    });
    return () => io.disconnect();
  }, [page]);

  if (!page) return <Navigate to="/docs" replace />;
  const prev = DOCS[index - 1];
  const next = DOCS[index + 1];

  return (
    <div className="wrap docs-shell">
      <nav className={`docs-side${menuOpen ? " menu-open" : ""}`} aria-label="Docs">
        <button
          type="button"
          className="docs-menu-btn"
          aria-expanded={menuOpen}
          onClick={() => setMenuOpen(!menuOpen)}
        >
          <span>
            <small>Docs</small>
            {page.title}
          </span>
          <CaretDownIcon weight="bold" />
        </button>
        <div className="docs-groups">
          {GROUPS.map((g) => {
            const isOpen = open.has(g);
            return (
              <div key={g} className={`docs-group${isOpen ? " open" : ""}`}>
                <button type="button" aria-expanded={isOpen} onClick={() => toggle(g)}>
                  {g}
                  <CaretDownIcon weight="bold" />
                </button>
                <div className="docs-links">
                  <div>
                    {DOCS.filter((d) => d.group === g).map((d) => (
                      <NavLink
                        key={d.slug}
                        to={d.slug === "overview" ? "/docs" : `/docs/${d.slug}`}
                        end
                        tabIndex={isOpen ? undefined : -1}
                      >
                        {d.title}
                      </NavLink>
                    ))}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </nav>

      <article className="docs-main">
        <header className="docs-header">
          <p className="docs-kicker">{page.group}</p>
          <h1>{page.title}</h1>
          <p className="lede">{page.lead}</p>
        </header>
        {page.sections.map((s) => (
          <section key={s.id} id={s.id} className="docs-section">
            <h2>{s.title}</h2>
            {s.body}
          </section>
        ))}
        <nav className="docs-pager" aria-label="Previous and next page">
          {prev ? (
            <Link to={prev.slug === "overview" ? "/docs" : `/docs/${prev.slug}`}>
              <small>Previous</small>
              {prev.title}
            </Link>
          ) : (
            <span />
          )}
          {next ? (
            <Link className="next" to={`/docs/${next.slug}`}>
              <small>Next</small>
              {next.title}
            </Link>
          ) : null}
        </nav>
      </article>

      <aside className="docs-toc" aria-label="On this page">
        <p>On this page</p>
        {page.sections.map((s) => (
          <a key={s.id} href={`#${s.id}`} className={s.id === active ? "on" : ""}>
            {s.title}
          </a>
        ))}
      </aside>
    </div>
  );
}
