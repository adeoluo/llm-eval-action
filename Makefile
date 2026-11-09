.PHONY: help install format format-check lint typecheck test coverage build check-dist bench sample fixtures all changelog cut-release diagram

help: ## Show this help
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | \
	  awk 'BEGIN {FS = ":.*?## "}; {printf "  \033[36m%-14s\033[0m %s\n", $$1, $$2}'

install: ## Install locked dependencies
	npm ci

format: ## Format the sources
	npm run format

format-check: ## Check formatting
	npm run format:check

lint: ## Lint with ESLint
	npm run lint

typecheck: ## Type-check with tsc
	npm run typecheck

test: ## Run the unit tests
	npm test

coverage: ## Tests with the coverage gate
	npm run coverage

build: ## Bundle src/ into dist/index.js
	npm run build

check-dist: build ## Fail if dist/ differs from a fresh build
	git diff --exit-code dist/

bench: ## Reproduce the calibration and runtime tables
	npm run bench

sample: ## Regenerate docs/sample-report.md
	npm run report:sample

fixtures: ## Regenerate the seeded fixtures
	npx tsx scripts/generate-fixtures.ts

all: format-check lint typecheck coverage build ## Everything CI runs

changelog: ## Regenerate CHANGELOG.md from Conventional Commits (git-cliff)
	git cliff --output CHANGELOG.md && perl -0pi -e 's/\n+\z/\n/' CHANGELOG.md

cut-release: ## Cut a release locally: version bump, changelog, tag, GitHub release (RELEASE_VERSION=vX.Y.Z optional)
	scripts/release.sh $(RELEASE_VERSION)

diagram: ## Render every diagram in docs/architecture to SVG (house theme, white background)
	@for f in docs/architecture/*.mmd; do \
		npx -y @mermaid-js/mermaid-cli -q -i "$$f" -o "$${f%.mmd}.svg" -c mermaid.config.json -b white || exit 1; \
	done
