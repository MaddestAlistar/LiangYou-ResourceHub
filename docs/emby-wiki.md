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

## Statistics and evidence (November 2026)
The statistics form offers two side-by-side sets: without multiple versions (movie titles, TV titles, episode count) and including multiple versions (the same three measures). Original `movies`, `series`, and `episodes` remain the non-multi-version values for compatibility; optional `moviesWithVersions`, `seriesWithVersions`, and `episodesWithVersions` are added. Unknown values stay null rather than zero. The stats date and submission date stack on narrow mobile screens.
Evidence may be a public HTTPS link and/or a compressed JPEG screenshot. The new `evidenceData` submission payload is validated by the Worker and saved to `emby-wiki/evidence/<id>.jpg` alongside existing covers. Metadata stores only `evidenceImageUrl`; approved feed details and the moderation view display the evidence preview. Moderators can remove its reference. Evidence and covers reside in a public GitHub repository, including before approval, so sensitive screenshot content must be masked prior to upload.

## Either-column statistics requirement (November 2026)
A submission now needs a complete pair of film and TV-title counts in **at least one** of the two statistical columns: without multiple versions (`movies`, `series`) or with multiple versions (`moviesWithVersions`, `seriesWithVersions`). Both counts can be zero when a category is absent, but at least one movie, TV or other-media count must be positive overall. The other column is optional and may be partially filled. Episode counts remain optional in both columns. The front-end completion meter, server-side validation, moderator editor and public feed all use this same rule. Public cards display only supplied statistical columns, with precise labels; a missing value is shown as “未提供” rather than zero. Legacy records with `movies` and `series` retain compatibility.


## Required contributor role and glass presentation (November 2026)
New submissions and administrator edits must include the relationship between the submitter and server (`role`). This is checked both with a native required select and by the Worker schema. Pre-existing approved records without a role remain readable via the explicit legacy feed option, so no historical publication disappears because of the new requirement. The submission page loads `emby-wiki-glass.css` only on that page; the home Emby Wiki and shared admin appearance remain unchanged. The glass styling uses a transparent fallback when backdrop filtering is unsupported and honors reduced motion / reduced transparency preferences.

## Submission UX: Amazing Group, localized UI, compact shortcuts
The submission-page masthead displays `良友科技 · EMBY WIKI · Amazing Group`. An accessible 中文/EN switch translates static headers, instructions, form fields, choices, shortcuts, guidance, progress and submission feedback, preserving the form's existing values, in-memory image previews, and local draft. The selected language is stored locally and restored on later visits. Crucially, option `value` attributes remain in the canonical Chinese schema vocabulary, so server classification, persisted records and moderation are unchanged when a form is submitted in English.
Registration shortcuts are small, rounded, toggleable glass pills rather than large boxes. Selected states use `aria-pressed`, and duplicate click removes the tag. Localized helper text (Chinese or English) is inserted into the freeform registration field. EN messages are translated client-side; server-side canonical validation is unchanged.
The submission-only stylesheet controls these effects and respects existing iPhone Safari date-input width limits and reduced-motion settings.
