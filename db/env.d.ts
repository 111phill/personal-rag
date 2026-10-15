declare namespace Cloudflare {
  interface Env {
    DB: D1Database;
    AGENT_API_BASE_URL?: string;
    AGENT_API_KEY?: string;
    AGENT_MODEL?: string;
  }
}
