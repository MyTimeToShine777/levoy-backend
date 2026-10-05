# Levoy — build, seed and service control.
#
# Run `make help` for the target list.

SHELL := /bin/bash
.SHELLFLAGS := -eu -o pipefail -c
.DEFAULT_GOAL := help

ROOT      := $(patsubst %/,%,$(dir $(abspath $(lastword $(MAKEFILE_LIST)))))
PROJECTS  := backend-next frontend marketing-site
NEXT_APPS := frontend marketing-site
DEPLOY_DIR := $(ROOT)/deploy
UNIT_DIR   := /etc/systemd/system
UNITS      := levoy-backend levoy-frontend levoy-marketing
UNITS_FULL := $(UNITS)
# `su postgres` runs as the postgres user, which cannot traverse /root (mode 700).
# Copy the seed file somewhere readable, run it, then remove the copy.
PSQL       := su postgres -c
SEED_TMP   := /tmp/levoy-seed.sql
NODE_BIN   := $(shell command -v node 2>/dev/null || echo /root/.hermes/tools/node-26.7.0-linux-x64/bin/node)

.PHONY: help install build seed services services-stop services-status services-logs \
        units install-units dev dev-stop dev-status clean distclean psql

## help: show this help
help:
	@echo "Levoy — available targets:"
	@echo
	@grep -E '^## ' $(MAKEFILE_LIST) | sed -e 's/^## /  make /' | sort
	@echo
	@echo "  NODE_ENV=production  |  ports: 3000 frontend, 3001 backend, 3002 marketing"

## install: npm install in backend-next, frontend and marketing-site
install:
	@for p in $(PROJECTS); do \
		echo "==> npm install $$p"; \
		cd $(ROOT)/$$p && npm install; \
	done

## build: production build for both Next apps (required by the systemd units)
build:
	@for p in $(NEXT_APPS); do \
		echo "==> next build $$p"; \
		cd $(ROOT)/$$p && npm run build; \
	done

## seed: apply backend-next/seed.sql to the levoy database
seed:
	@echo "==> applying seed.sql"
	@install -m 644 $(ROOT)/backend-next/seed.sql $(SEED_TMP)
	@$(PSQL) "psql -v ON_ERROR_STOP=1 -d levoy -f $(SEED_TMP)"
	@rm -f $(SEED_TMP)
	@echo "==> seed complete"

## psql: open a psql shell as the levoy role
psql:
	@$(PSQL) "psql -d levoy"

## install-units: copy the three unit files into /etc/systemd/system (needs root)
install-units:
	@install -m 644 -o root -g root $(foreach u,$(UNITS),$(DEPLOY_DIR)/$(u).service) $(UNIT_DIR)/
	@systemctl daemon-reload
	@echo "==> units installed"

## units: install units, enable and start all three services
units: install-units
	@systemctl enable --now $(UNITS_FULL)
	@echo "==> $(UNITS_FULL) enabled and started"

## services: start the three systemd services (assumes units installed)
services:
	@systemctl daemon-reload
	@systemctl enable --now $(UNITS_FULL)
	@systemctl --no-pager --lines=0 status $(UNITS_FULL) || true

## services-stop: stop and disable the three systemd services
services-stop:
	@systemctl disable --now $(UNITS_FULL)
	@echo "==> stopped and disabled"

## services-status: show systemd status for the three services
services-status:
	@systemctl --no-pager --lines=0 status $(UNITS_FULL) || true
	@echo
	@echo "--- listening ports ---"
	@ss -ltnp | grep -E ':(3000|3001|3002)\b' || echo "none listening"

## services-logs: tail journald for the three services
services-logs:
	@journalctl -f -u levoy-backend -u levoy-frontend -u levoy-marketing

## dev: run the stack in the foreground session via dev.sh (arg: MODE=dev|prod)
dev:
	@$(ROOT)/dev.sh start $(or $(MODE),prod)

## dev-stop: stop the dev.sh-managed processes
dev-stop:
	@$(ROOT)/dev.sh stop

## dev-status: show dev.sh process/port/health status
dev-status:
	@$(ROOT)/dev.sh status

## clean: remove build output, logs and dev.sh pidfiles
clean:
	@rm -rf $(ROOT)/.run
	@for p in $(NEXT_APPS); do rm -rf $(ROOT)/$$p/.next; done
	@find $(ROOT)/backend-next -maxdepth 1 -name '*.log' -delete 2>/dev/null || true
	@echo "==> cleaned build output and logs (node_modules kept)"

## distclean: clean, plus remove node_modules
distclean: clean
	@for p in $(PROJECTS); do rm -rf $(ROOT)/$$p/node_modules; done
	@echo "==> removed node_modules"
