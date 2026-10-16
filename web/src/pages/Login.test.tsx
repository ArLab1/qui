/*
 * Copyright (c) 2025-2026, s0up and the autobrr contributors.
 * SPDX-License-Identifier: GPL-2.0-or-later
 */

import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react"
import { afterEach, beforeEach, expect, it, vi } from "vitest"
import type { ReactNode } from "react"

import "@/i18n"
import { api } from "@/lib/api"
import { toast } from "sonner"
import { Login } from "./Login"

const { auth, navigate } = vi.hoisted(() => ({
  auth: {
    login: vi.fn(), isLoggingIn: false, loginError: null,
    setIsAuthenticated: vi.fn(), isAuthenticated: false, isLoading: false,
  },
  navigate: vi.fn(),
}))

vi.mock("@/hooks/useAuth", () => ({ useAuth: () => auth }))
vi.mock("@tanstack/react-router", () => ({ useNavigate: () => navigate }))
vi.mock("@/components/Footer", () => ({ Footer: () => null }))
vi.mock("@/components/magicui/blur-fade", () => ({ BlurFade: ({ children }: { children: ReactNode }) => <div>{children}</div> }))
vi.mock("sonner", () => ({ toast: { error: vi.fn(), info: vi.fn() } }))

const staleConfig = {
  enabled: true, authorizationUrl: "#stale-state", disableBuiltInLogin: false, issuerUrl: "https://idp.example",
}
let client: QueryClient

beforeEach(() => {
  vi.stubGlobal("ResizeObserver", class { observe() {} unobserve() {} disconnect() {} })
  window.history.replaceState({}, "", "/login")
  client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
  client.setQueryData(["setup-required"], false)
  client.setQueryData(["oidc-config"], staleConfig)
})

afterEach(() => {
  cleanup()
  client.clear()
  vi.restoreAllMocks()
  vi.clearAllMocks()
  vi.unstubAllGlobals()
})

function renderLogin() {
  render(<QueryClientProvider client={client}><Login /></QueryClientProvider>)
  return screen.getByRole("button", { name: "OpenID Connect" }) as HTMLButtonElement
}

it("starts a fresh attempt instead of navigating to the cached authorization URL", async () => {
  const request = vi.spyOn(api, "getOIDCConfig").mockResolvedValue({ ...staleConfig, authorizationUrl: "#fresh-state" })
  const button = renderLogin()
  expect(request).not.toHaveBeenCalled()

  fireEvent.click(button)

  await waitFor(() => expect(window.location.hash).toBe("#fresh-state"))
  expect(request).toHaveBeenCalledTimes(1)
})

it("disables the button while the fresh attempt is being requested", async () => {
  let complete!: (config: typeof staleConfig) => void
  const request = vi.spyOn(api, "getOIDCConfig").mockImplementation(() => new Promise(resolve => { complete = resolve }))
  const button = renderLogin()

  fireEvent.click(button)
  await waitFor(() => expect(button.disabled).toBe(true))
  fireEvent.click(button)
  expect(request).toHaveBeenCalledTimes(1)
  expect(window.location.hash).toBe("")

  complete({ ...staleConfig, authorizationUrl: "#fresh-state" })
  await waitFor(() => expect(window.location.hash).toBe("#fresh-state"))
})

it.each(["rejected", "unavailable"])("does not fall back to the stale link when the fresh request is %s", async (failure) => {
  const request = vi.spyOn(api, "getOIDCConfig")
  if (failure === "rejected") {
    request.mockRejectedValueOnce(new Error("Network unavailable"))
  } else {
    request.mockResolvedValueOnce({ ...staleConfig, enabled: false, authorizationUrl: "" })
  }
  request.mockResolvedValueOnce({ ...staleConfig, authorizationUrl: "#retry-state" })
  const button = renderLogin()

  fireEvent.click(button)
  await waitFor(() => expect(toast.error).toHaveBeenCalledWith("OIDC authentication failed"))
  expect(window.location.hash).toBe("")
  await waitFor(() => expect(button.disabled).toBe(false))

  fireEvent.click(button)
  await waitFor(() => expect(window.location.hash).toBe("#retry-state"))
  expect(request).toHaveBeenCalledTimes(2)
})
