import { createBrowserRouter, Navigate, type RouteObject } from "react-router";

import App from "./App";
import { routes } from "../generated-routes";
import { ModelWorkerRoot } from "../lib/model-worker";

const developmentRoutes: RouteObject[] = import.meta.env.DEV
  ? [
      {
        path: "playground",
        lazy: () => import("../dev-pages/playground"),
      },
    ]
  : [];

// The Files page was removed; send any links still pointing at it to the desktop.
const redirectRoutes: RouteObject[] = [
  {
    path: "files/*",
    element: <Navigate to="/desktop" replace />,
  },
];

export const router = createBrowserRouter([
  {
    path: "/",
    element: (
      <ModelWorkerRoot>
        <App />
      </ModelWorkerRoot>
    ),
    children: [...routes, ...developmentRoutes, ...redirectRoutes],
  },
  {
    path: "*",
    element: 404,
  },
]);
