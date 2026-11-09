# Emby Wiki

The existing GitHub Pages site now links to `emby-wiki-submit.html` immediately after the icon submission feature. Approved records appear in `#emby-wiki`; the existing `icon-review-admin.html#emby-wiki-admin` section follows Tech News and reuses the page's in-memory ADMIN_KEY.

## Data and operations

The existing `liangyou-icon-review` Worker routes `/emby-wiki-submit` (public POST restricted by Origin), `/emby-wiki-feed` (approved-only GET), and `/emby-wiki-admin` (authenticated GET/POST). Existing `GITHUB_TOKEN`, `REVIEW_REPO`, and `ADMIN_KEY` bindings are reused; no new secret or storage binding is required.

Metadata is stored in `emby-wiki/entries.json` in the review repository, and optional client-compressed JPEG covers in `emby-wiki/covers/`. This repository is public: the submission page explicitly tells contributors to provide only public information. The website's publication filter does not make pending records or moderation notes confidential in GitHub. Never include passwords or private contacts in these records. Browser drafts stay on the contributor's device; administrator keys are never persisted.

Required: name, nature, operating state, at least one content category, registration information, movie count, series count, statistics date, nickname, submission date, at least one official/community link, and consent. Dates use Asia/Shanghai defaults and cannot be in the future. Counts are nonnegative integers; series are counted by titles, while episode count is separate and optional. Missing optional values are displayed as not provided.

Only a server-side successful write yields a receipt. The browser preserves the draft and UUID for retries. Worker writes use GitHub content SHA concurrency protection; moderator updates also require the current record version. Duplicate approved names are rejected. A daily HMAC of the source IP, when Cloudflare supplies it, limits submissions to ten/day without storing the IP. Payloads, cover sizes and the 300-record index limit are checked server-side. If the index reaches capacity, deliberately archive historical entries in the repository before increasing the limit; no records are silently dropped.

Moderation supports pending -> approved/rejected, approved -> withdrawn, and rejected/withdrawn -> pending/approved. Editors can revise fields and remove a cover; already approved revisions immediately appear in the feed. Original received timestamp remains immutable. The public API only returns explicitly allowed public fields.

## Validation and deployment

```
node --test scripts/test_emby_wiki.mjs scripts/test_icon*.mjs scripts/test_tech_news.mjs
node scripts/validate.mjs
```

The existing Worker deployment workflow runs Wiki regression tests before deployment. Frontend and shared module changes trigger the existing Pages workflow. Preview-only sample records are not part of the repository or production feed.
