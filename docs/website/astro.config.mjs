import { defineConfig } from "astro/config";
import starlight from "@astrojs/starlight";
import remarkGfm from "remark-gfm";

const site = process.env.SITE_URL ?? "https://vekexasia.github.io";
const base = process.env.SITE_BASE_PATH ?? "/varco";

export default defineConfig({
  site,
  base,
  markdown: {
    remarkPlugins: [remarkGfm],
  },
  integrations: [
    starlight({
      title: "Varco",
      description:
        "Scoped Home Assistant access for external apps without sharing Home Assistant tokens.",
      editLink: {
        baseUrl: "https://github.com/vekexasia/varco/edit/main/docs/website/",
      },
      social: [
        {
          icon: "github",
          label: "GitHub",
          href: "https://github.com/vekexasia/varco",
        },
      ],
      sidebar: [
        {
          label: "Start",
          items: [
            { label: "What is Varco?", slug: "" },
            { label: "Deploy in 10 minutes", slug: "getting-started/quickstart" },
            { label: "Try the demo", slug: "getting-started/demo" },
            { label: "Showcase: Pebble watchapp", slug: "getting-started/showcase-pebble" },
            { label: "Home Assistant quickstart", slug: "getting-started/home-assistant" },
            { label: "Consumer quickstart", slug: "getting-started/consumer" },
          ],
        },
        {
          label: "Concepts",
          items: [
            { label: "Architecture", slug: "concepts/architecture" },
            { label: "Trust model", slug: "concepts/trust-model" },
            { label: "Grants and scopes", slug: "concepts/grants-and-scopes" },
            { label: "Relay and WebRTC", slug: "concepts/transports" },
          ],
        },
        {
          label: "Guides",
          items: [
            { label: "Install Home Assistant", slug: "guides/install-home-assistant" },
            { label: "Pair a consumer", slug: "guides/pair-consumer" },
            { label: "Build a consumer dashboard", slug: "guides/build-consumer-dashboard" },
            { label: "Export a dashboard brief", slug: "guides/export-dashboard-brief" },
            { label: "Self-host the bridge", slug: "guides/self-host-bridge" },
            { label: "Server-side and webhooks", slug: "guides/server-and-webhooks" },
            { label: "Troubleshooting", slug: "guides/troubleshooting" },
          ],
        },
        {
          label: "Reference",
          items: [
            { label: "Client API", slug: "reference/client-api" },
            { label: "Server API", slug: "reference/server-api" },
            { label: "Manifest", slug: "reference/manifest" },
            { label: "Protocol messages", slug: "reference/protocol" },
            { label: "Bridge endpoints", slug: "reference/bridge-endpoints" },
            { label: "Admin WebSocket commands", slug: "reference/admin-websocket" },
            { label: "Home Assistant services", slug: "reference/home-assistant-services" },
            { label: "Errors", slug: "reference/errors" },
          ],
        },
        {
          label: "Development",
          items: [
            { label: "Repository", slug: "development/repository" },
            { label: "Local Home Assistant", slug: "development/local-home-assistant" },
            { label: "Testing", slug: "development/testing" },
            { label: "Deployment", slug: "development/deployment" },
            { label: "Release and versioning", slug: "development/release" },
          ],
        },
      ],
    }),
  ],
});
