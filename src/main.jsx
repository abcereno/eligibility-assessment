import React from "react";
import ReactDOM from "react-dom/client";
import { createBrowserRouter, RouterProvider } from "react-router-dom";
import App from "./App.jsx";
import Home from "./pages/Home.jsx";
import FormPage from "./pages/FormPage.jsx";
import CompanyProvider from "./context/CompanyProvider.jsx";
import "./index.css";
import BrandingProvider from "./context/BrandingProvider";
import AdminRtoTools from "./pages/AdminRtoTools.jsx";

const router = createBrowserRouter([
  { path: "/", element: <App />, children: [
    { index: true, element: <Home /> },
    { path: "form", element: <FormPage /> },
    { path: "admin", element: <AdminRtoTools /> },
  ]},
]);

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <CompanyProvider>
      <BrandingProvider>
      <RouterProvider router={router} />
      </BrandingProvider>
    </CompanyProvider>
  </React.StrictMode>
);
