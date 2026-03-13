import { createBrowserRouter } from "react-router";

import App from "./App";
import { routes } from "../generated-routes";

export const router = createBrowserRouter([
  {
    path: "/",
    element: <App />,
    children: routes,
  },
  {
    path: "*",
    element: 404,
  },
]);
