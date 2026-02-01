---

# 📄 Document 3 — Product Requirements Document (PRD)

```md
# Product Requirements — Moneybird Intelligent Agent

## Core Features

### 1. Incoming Invoice Handling

- Detect new incoming invoices
- Check completeness:
  - Contact
  - Amount
  - BTW
- If incomplete:
  - Scan PDF
  - Extract invoice data
  - Update Moneybird invoice (draft)

---

### 2. Contact Resolution

- Match existing contact by:
  - IBAN
  - Supplier name
  - VAT number
- Create new contact if none found
- New contacts lower confidence score

---

### 3. Kostenpost Classification

- AI-based classification using:
  - Supplier history
  - Invoice text
  - VAT context
- Confidence-based assignment
- Draft-only updates

---

### 4. Bank Transaction Matching

- Match invoices ↔ transactions using:
  - Amount
  - Date window
  - IBAN
  - Description similarity
- Auto-match only above confidence threshold

---

### 5. Confidence & Safety System

| Scenario                        | Action          |
| ------------------------------- | --------------- |
| Confidence ≥ 95%                | Auto (draft)    |
| 80–95%                          | Flag for review |
| < 80%                           | Alert user      |
| New supplier                    | Manual review   |
| Amount > configurable threshold | Manual review   |

---

### 6. Learning System

- Store corrections:
  - Supplier → kostenpost
  - Description patterns
- Improve future confidence
- Local storage only

---

### 7. BTW Preparation

- Quarterly aggregation
- VAT validation
- Reverse charge detection
- Export-ready data

---

## Non-Functional Requirements

- Deterministic workflows
- Structured AI outputs only
- Full audit trail
- Reversible actions
- Single-user only
