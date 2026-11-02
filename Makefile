.PHONY: help install format format-check lint typecheck test coverage build check-dist bench sample fixtures all

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
