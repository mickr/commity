# 1.0.0 (2025-11-09)


### Bug Fixes

* **config:** update release configuration to use npm instead of pnpm ([afba79b](https://github.com/mickr/commity/commit/afba79b6e09c98c7a519a9869a0f008141b2f90f))


### Features

* **git:** support multi-repository workflows by matching source control context ([e821a39](https://github.com/mickr/commity/commit/e821a3930a42250df36a5c8e1f05160184b38eb9))

# [0.16.0](https://github.com/mickr/commity/compare/v0.15.2...v0.16.0) (2025-11-06)


### Features

* **ai:** switch to qwen3 model for commit message generation ([59a43d1](https://github.com/mickr/commity/commit/59a43d10744a9fb70790ebc8856b307245cb3eaf))

## [0.15.2](https://github.com/mickr/commity/compare/v0.15.1...v0.15.2) (2025-11-06)


### Bug Fixes

* **release:** add OpenVSIX publishing step ([166b9fd](https://github.com/mickr/commity/commit/166b9fdba2ab4d73395fdfc029b4d34abc204839))

## [0.15.1](https://github.com/mickr/commity/compare/v0.15.0...v0.15.1) (2025-11-06)


### Bug Fixes

* **ai:** improve error handling and secure environment configuration ([eb46165](https://github.com/mickr/commity/commit/eb46165e63c25ac01cb0e5f6142995a4a7644dbc))

# [0.15.0](https://github.com/mickr/commity/compare/v0.14.0...v0.15.0) (2025-11-06)


### Features

* **config:** add support for dynamic variable replacement in commit message templates ([deb20c1](https://github.com/mickr/commity/commit/deb20c1b2224c8f119774977aa519c671dbefc74))

# [0.14.0](https://github.com/mickr/commity/compare/v0.13.0...v0.14.0) (2025-11-06)


### Features

* **git:** include staged changes in file path filtering ([eef8218](https://github.com/mickr/commity/commit/eef82183b900fc3e18f811a7a2d072970da8931f))

# [0.13.0](https://github.com/mickr/commity/compare/v0.12.0...v0.13.0) (2025-11-05)


### Features

* **commit-message:** implement streaming commit message generation and remove deprecated endpoints ([0ede0b5](https://github.com/mickr/commity/commit/0ede0b5237a70f36e2d3f9c31ccc1faa4cb10313))

# [0.12.0](https://github.com/mickr/commity/compare/v0.11.0...v0.12.0) (2025-11-04)


### Features

* **git:** update repository state to include workingTreeChanges for staged changes ([ecd6d22](https://github.com/mickr/commity/commit/ecd6d22152836ec1e0cef594dcd1ceca831df50e))

# [0.11.0](https://github.com/mickr/commity/compare/v0.10.0...v0.11.0) (2025-11-04)


### Bug Fixes

* **prompts:** improve formatting and clarity in commit message generation prompts ([da252dd](https://github.com/mickr/commity/commit/da252ddf98ed57666aeb8141166a82dbcdfe481c))


### Features

* **prompts:** enhance buildSynthesisPrompt with template variable replacements and formatting instructions ([40abcc0](https://github.com/mickr/commity/commit/40abcc0407c1c338c5d17055c9f48cf196bb512d))

# [0.10.0](https://github.com/mickr/commity/compare/v0.9.0...v0.10.0) (2025-11-03)


### Features

* **git:** add branch and author support to commit generation ([702d4bd](https://github.com/mickr/commity/commit/702d4bdb99dc12c6c4ec8df76ae485bd28fc3ebe))

# [0.9.0](https://github.com/mickr/commity/compare/v0.8.0...v0.9.0) (2025-11-03)


### Features

* **config:** use git repository root for configuration resolution ([75cb585](https://github.com/mickr/commity/commit/75cb58569d7441c6a1604a583051626185b641ec))

# [0.8.0](https://github.com/mickr/commity/compare/v0.7.0...v0.8.0) (2025-11-03)


### Bug Fixes

* **config:** update publisher name to ryanlabs ([4827fb4](https://github.com/mickr/commity/commit/4827fb49c01427a37ac8d51476e9fb9c5a40f8e2))


### Features

* **extension:** update branding and marketing language in commit ([ae591c0](https://github.com/mickr/commity/commit/ae591c01a2be89fe4b4488906b9730bb46cfb24e))

# [0.7.0](https://github.com/mickr/commity/compare/v0.6.0...v0.7.0) (2025-11-03)


### Features

* **ai:** add optional override to synthesis prompt generation ([05f1014](https://github.com/mickr/commity/commit/05f101420aefc0afa4eb13c88deca1941b02e476))

# [0.6.0](https://github.com/mickr/commity/compare/v0.5.0...v0.6.0) (2025-11-03)


### Features

* correct regex pattern for formatting commit messages ([eea301f](https://github.com/mickr/commity/commit/eea301f7b6d76266cc8290daaaeb01af10a370c3))
* implement streaming commit message generation and update API routes ([fe9178b](https://github.com/mickr/commity/commit/fe9178b77d74398150e293b3312fbe7e64b253e7))

# [0.5.0](https://github.com/mickr/commity/compare/v0.4.0...v0.5.0) (2025-11-03)


### Features

* integrate OpenAI API for commit message generation ([5158b49](https://github.com/mickr/commity/commit/5158b49f628640172d87321b98a351b268512925))

# [0.4.0](https://github.com/mickr/commity/compare/v0.3.0...v0.4.0) (2025-11-02)


### Features

* **examples:** add example config and update README with new prompt ([1378ef2](https://github.com/mickr/commity/commit/1378ef2613c49656aec677dc066b41c5999f03d0))

# [0.3.0](https://github.com/mickr/commity/compare/v0.2.4...v0.3.0) (2025-11-02)


### Features

* **extension:** add commit generation button ([bf5969a](https://github.com/mickr/commity/commit/bf5969a90c5e587a1e898834ab7b73bc4abfc427))

## [0.2.4](https://github.com/mickr/commity/compare/v0.2.3...v0.2.4) (2025-10-31)


### Bug Fixes

* **generateCommitMessage:** change warning message to status bar notification for no staged changes ([fd8a986](https://github.com/mickr/commity/commit/fd8a986c2a0e4c1137c9748ee61e3bf6f8af6b8c))
