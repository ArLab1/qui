/*
 * Copyright (c) 2025-2026, s0up and the autobrr contributors.
 * SPDX-License-Identifier: GPL-2.0-or-later
 */

import { expect, it } from "vitest"
import { http, HttpResponse } from "msw"
import { server } from "@/test/msw/server"
import { api } from "@/lib/api"

it("bypasses the HTTP cache when requesting an OIDC authorization attempt", async () => {
  let cache: RequestCache | undefined
  const config = { enabled: true, authorizationUrl: "https://idp.example/authorize?state=fresh", disableBuiltInLogin: false, issuerUrl: "https://idp.example" }
  server.use(http.get("*/api/auth/oidc/config", ({ request }) => {
    cache = request.cache
    return HttpResponse.json(config)
  }))

  expect(await api.getOIDCConfig()).toEqual(config)
  expect(cache).toBe("no-store")
})
