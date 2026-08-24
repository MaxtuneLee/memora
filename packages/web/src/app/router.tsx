import { createBrowserRouter, type RouteObject } from "react-router";

import App from "./App";
import { routes } from "../generated-routes";

const developmentRoutes: RouteObject[] = import.meta.env.DEV
  ? [
      {
        path: "playground",
        lazy: () => import("../dev-pages/playground"),
      },
    ]
  : [];

export const router = createBrowserRouter([
  {
    path: "/",
    element: <App />,
    children: [...routes, ...developmentRoutes],
  },
  {
    path: "*",
    element: 404,
  },
]);
