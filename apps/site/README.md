# @chatmux/site

The ChatMux marketing site (`https://chatmux.binjie.fun`). A bilingual
(zh/en) single-page React + Vite app in the "phosphor terminal" aesthetic.

## Develop

```bash
pnpm install
pnpm --filter @chatmux/site dev      # http://localhost:5174
pnpm --filter @chatmux/site build
```

## Deployment

`/.github/workflows/deploy-site.yml` builds this package on every push to
`main` (touching `apps/site/**`) and:

1. Deploys the build to **GitHub Pages** → the canonical URL
   `https://binjie09.github.io/ChatMux/`.
2. Mirrors the same build to the **Aliyun OSS** bucket `chatmux-binjie-fun`
   (cn-beijing), which is the origin for the DCDN domain
   `https://chatmux.binjie.fun` — China acceleration.

Vite uses a relative `base: "./"` so the identical build serves correctly from
both the GitHub Pages sub-path and the OSS bucket root.

## Required GitHub configuration

- **Pages** source set to *GitHub Actions*.
- Variables: `OSS_BUCKET=chatmux-binjie-fun`, `OSS_ENDPOINT=oss-cn-beijing.aliyuncs.com`
- Secrets: `OSS_ACCESS_KEY_ID`, `OSS_ACCESS_KEY_SECRET` (RAM user
  `chatmux-ci-sync`, write-only on this one bucket).

The OSS mirror step is gated on `OSS_BUCKET` being set, so it is a clean no-op
until the OSS credentials are configured.
