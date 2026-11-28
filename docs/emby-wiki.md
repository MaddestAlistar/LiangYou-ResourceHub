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

## Required retention and quick choices
Retention rules (`retention`) are now mandatory for new submissions and moderation edits. Public feed validation explicitly allows legacy approved records without a retention value to preserve older listings. New form submissions use a required textarea and the progress indicator counts registration and retention together. The submission form includes eight optional togglable shortcuts: 发电保号, 7 天观影, 15 天观影, 21 天观影, 30 天观影, 签到保号, 积分保号 and 活动保号. Choices append to (or remove from) freeform retention text without deleting other conditions. Each choice supports localized English text, selected state and mobile sizing. For services with no retention requirement, contributors can enter "无需保号" rather than leaving it blank.

## Additional quick choices
The registration shortcuts also include **人脉 KK** (Connections / KK) and **积分开号** (Points registration), and the retention shortcuts also include **无需保号** (No retention requirements). Both groups now contain nine options and use an even three-column grid on normal mobile screens. Selecting "无需保号" removes conflicting retention shortcuts, while selecting another retention choice removes "无需保号"; labels are localized, underlying form submission remains free text, and no server schema change is needed.

## Public directory supplement (2026-11-28)
`assets/data/emby-atlas.json` is a reviewed, one-time snapshot of the public catalog at https://atlas.030518.xyz/. Its 94 published source rows are consolidated into 91 profiles (海豚emby, 驭龍/驭龙, and 大厨的神秘菜单/Chef’s Secret Menu are duplicates). Conflicting values in these duplicate rows are left blank. Source entry IDs, source update dates and retrieval date are retained without importing edit-history actors or user records.

`emby-wiki-catalog.mjs` merges these profiles into the public directory, using exact normalized names and explicitly reviewed aliases (宸宇公益服 → 宸宇). Approved submissions take precedence; only empty descriptive fields are supplemented. Existing zero counts, statistics, dates, covers and submitter attribution remain untouched. The source provides no usable media statistics, so all imported count columns are null and statistics dates are blank. Missing operating status stays blank. Paid servers map to 公费服; 半公益服 remains unclassified in the existing category filter, with its source classification shown in the detail attribution. Untyped source links are shown as references, not guessed to be official websites or channels. Referral URLs are not copied.

The snapshot uses the existing card and detail template. It has its own attribution rather than invented contributor metadata, and does not weaken the submission or moderation schema. Loading failure of either source preserves the other and exposes a retry notice. This is not an automatic synchronization job; later changes should be reviewed before updating the snapshot.

Validation: `node --test scripts/test_emby_wiki_catalog.mjs scripts/test_emby_wiki.mjs` and `node scripts/validate.mjs`.

## Telegram directory supplement (2026-11-28)
`assets/data/emby-telegram.json` contains 22 manually reviewed profiles/patches: 13 new profiles plus 9 supplements to existing public or submitted profiles. Public previews from `@embyxk` and the public Telemetrio archive of 播放碎片 were readable. The archive retains the older `@playfragments` handle; the requested `@Playfragmentss` is listed under the same channel name and description in the public TG Market directory. `@embywiki` was attempted through its public preview and post pages, but sufficient usable general-media profile text was not available; its coverage is recorded as limited, not imported. This update is not a claim of complete channel-history ingestion.

Time-limited opening announcements and giveaways are not treated as current registration/availability. Imported operating states and unknown dates remain blank. Historical statistics from 2026-08-11/13 without an explicit multiple-version methodology are recorded only in `statsNote`; both numerical columns remain null. These older notes are not merged into records already carrying submitted statistics. Separate product editions, such as 瞬影 and 瞬影Pro, remain separate profiles. No change is made to approved submission data or moderation requirements.

The merge now preserves all contributing source links and the names of fields each source supplied. A missing static source allows the other source to load with a partial-data/retry notice. The detail template shows each contributing source and any historical-archive limitations. Tests cover unknown counts, exact-name matching, separate editions, retained provenance, preservation of newer submitted statistics, and partial-source failure.

## Visible public library counts (2026-11-28)
`assets/data/emby-statistics.json` adds 51 individually sourced count snapshots (47 existing profiles and four distinct new profiles: Panda TV, 夏天, 哇哇叫 and 梦蝶). Research checked the 217-message index in the old 播放碎片 public archive, relevant individual posts, additional Telemetrio history pages and `embyxk` historical previews. `embywiki` preview access remains limited; it contributes no unverified counts.

This supersedes the earlier note-only presentation: cards now show exact movie/series numbers, while details also show episode counts. Unspecified multiple-version methodology has its own **原文统计（口径未注明）** column. The explicit including-versions snapshot for 临境 Liminal EA uses the existing **包含多版本** column. Every snapshot displays its source and original statistics date, labeled historical rather than live. Unknown dates remain empty and are never replaced by retrieval dates. Youno's 7/7/7 placeholder is excluded because the source explicitly says counts are hidden.

`publicStats` is an atomic object containing movies/series/episodes, method, date, note and attribution. `libraryView()` projects it for display only if no submitted count exists; even a submitted zero remains authoritative. Exact name matching keeps server editions separate. Newer dated public snapshots replace older dated snapshots as a whole, without mixing counts, dates or provenance. The existing submission form and moderation schema remain unchanged. All three static sources degrade independently with a retry notice. Tests cover zero/unknown distinctions, snapshot integrity, date handling, method projection, version separation and partial failures.
