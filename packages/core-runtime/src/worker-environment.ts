const ALLOWED_WORKER_ENVIRONMENT_KEYS = new Set([
  "comspec",
  "http_proxy",
  "https_proxy",
  "no_proxy",
  "path",
  "pathext",
  "playwright_browsers_path",
  "pythonhome",
  "systemroot",
  "temp",
  "tmp",
  "tmpdir",
  "windir",
  "bmd_douyin_headless",
  "bmd_douyin_login_url",
  "bmd_douyin_validation_url",
  "bmd_douyin_navigation_timeout_ms",
  "bmd_douyin_qr_wait_ms",
  "bmd_douyin_locale",
  "bmd_douyin_timezone_id",
  "bmd_douyin_viewport_width",
  "bmd_douyin_viewport_height",
  "bmd_douyin_user_agent",
  "bmd_douyin_cookie_header_origins",
  "node_extra_ca_certs",
  "requests_ca_bundle",
  "ssl_cert_file"
])

export function safeWorkerEnvironment(
  source: NodeJS.ProcessEnv,
  overrides: NodeJS.ProcessEnv = {}
): NodeJS.ProcessEnv {
  const environment: NodeJS.ProcessEnv = {}
  for (const [key, value] of Object.entries(source)) {
    if (value !== undefined && ALLOWED_WORKER_ENVIRONMENT_KEYS.has(key.toLowerCase())) {
      environment[key] = value
    }
  }
  for (const [key, value] of Object.entries(overrides)) {
    if (value !== undefined) environment[key] = value
  }
  return environment
}
