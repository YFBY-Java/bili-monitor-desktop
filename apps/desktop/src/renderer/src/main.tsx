import { StrictMode } from "react"
import { createRoot } from "react-dom/client"

import App from "./App"
import "./styles.css"

const root = document.getElementById("app")

if (!root) throw new Error("Renderer root element #app was not found")

createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>
)
