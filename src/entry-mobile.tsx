import React from "react";
import ReactDOM from "react-dom/client";
import { RouterProvider } from "@tanstack/react-router";
import { getRouter } from "./router";
import { Route as RootRoute } from "./routes/__root";
import "./styles.css";

// In client-only SPA mode (Capacitor Android WebView), index.html already provides the <html>,
// <head>, and <body> DOM. Unsetting shellComponent prevents TanStack Router from attempting
// to render a nested <html>/<body> tree into the DOM root container.
(RootRoute.options as { shellComponent?: unknown }).shellComponent = undefined;

const router = getRouter();

const rootElement = document.getElementById("root");
if (rootElement && !rootElement.innerHTML) {
  const root = ReactDOM.createRoot(rootElement);
  root.render(
    <React.StrictMode>
      <RouterProvider router={router} />
    </React.StrictMode>,
  );
}
