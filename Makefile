.PHONY: help run build test clean deploy logs status jar

JAR := target/nectar-sql-site-0.1.0-standalone.jar

help: ## Show this help
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | awk 'BEGIN {FS = ":.*?## "}; {printf "  \033[36m%-12s\033[0m %s\n", $$1, $$2}'

run: ## Start the dev server at http://localhost:8080
	clojure -M -m plooney81.nectar-sql-demo.server

jar: ## Build the uberjar (skips tests)
	clojure -T:build uber

build: ## Run tests then build the uberjar
	clojure -T:build ci

test: ## Run tests only
	clojure -T:build test

run-jar: ## Run the built uberjar locally
	java -jar $(JAR)

clean: ## Delete build output
	clojure -T:build clean

deploy: ## Deploy to Fly.io
	fly deploy

logs: ## Tail live logs from Fly.io
	fly logs

status: ## Show Fly.io app status
	fly status
