# Project Overview — Moneybird Intelligent Agent

## Vision

Build an autonomous AI-powered bookkeeping agent that runs on a VPS and works with Moneybird to fully automate financial administration for a solo entrepreneur.

The agent:

- Handles incoming invoices
- Enriches incomplete invoices via OCR
- Resolves or creates contacts
- Assigns correct kostenposten
- Matches invoices to bank transactions
- Prepares BTW data
- Requires human intervention only when confidence is low

The system is designed to be:

- Safe (draft-first, confidence-gated)
- Auditable
- Incrementally autonomous
- Single-user focused

## Core Principles

- Moneybird remains the source of truth
- AI assists, but does not bypass accounting rules
- Every action is explainable and reversible
- Automation increases over time via learning

## Target User

- Dutch ZZP’er / freelancer
- Uses Moneybird
- Wants minimal manual bookkeeping work
- Comfortable with draft-first automation

## Non-Goals

- Multi-tenant SaaS
- Full accounting replacement
- Automatic tax submission without review
