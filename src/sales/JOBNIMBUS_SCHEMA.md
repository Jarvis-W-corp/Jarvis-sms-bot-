# Job Nimbus Schema Reference

Research date: 2026-04-14. Source: public API docs, support.jobnimbus.com, naturalForms, Elite Claim Solutions, Zapier/Pipedream/Make integration docs. We replicate the field set; insurance is all custom fields in JN but the field set below is the roofing-industry de-facto standard.

## Core entities

Base envelope on every record: `jnid` (PK), `number` (display ID like `C-0142`), `record_type_name`, `status_name`, `date_created`, `date_updated`, `created_by`, `owners[]`, `tags[]`.

### Contacts
display_name (req, unique), first_name, last_name, company, email, home_phone, mobile_phone, work_phone, fax_number, website, address_line1/2, city, state_text, zip, country_name, geo.lat/lon, description, record_type_name (Customer/Sub-Contractor/Insurance Carrier/…), status_name, date_status_change, date_start, date_end, sales_rep (FK user), source (FK lead_source), owners[] (FK user), subcontractors[] (FK contact), related[] (FK contact), tags[], is_active, is_archived. Custom fields: up to 50 per primitive type.

### Jobs
name (req), record_type_name (Retail/Insurance/Service), status_name, description, job-site address (independent of contact), geo, primary (FK contact), related[] (FK contact), sales_rep, source, owners[], subcontractors[], date_start, date_end, approved_estimate_total, cost, tags, cover_photo.

### Tasks
type (Task/Phone Call/Meeting/Appointment/custom), title, description, is_all_day, date_start (req), date_end, duration, priority (None/Low/Medium/High), assigned_to[], related[] (polymorphic contact/job), tags, is_completed, date_completed, reminder.

### Activities (polymorphic)
type (Note/Email/SMS/Call/File/Status Change/Task Completion/Estimate Event/Invoice Event), note, customer (FK), primary (contact|job), related[], date_created, created_by, is_status_change, from_status, to_status.

### Files
filename, content_type, size, url, description, primary (contact|job), related[], is_photo (derived from mime), tags. JPG/PNG → Photos tab; everything else → Documents tab.

### Estimates / Work Orders / Invoices
Shared shape: number, status, dates (created/sent/signed/due), customer (FK contact), related job, sales_rep, subject, description, items[] (line items), subtotal, tax_rate, tax, total, signature_image, template_id, notes, payment_terms, quickbooks_id.
Line item: {name, description, sku, quantity, uom, cost, price, markup, amount, category, color, taxable}.
Work Order adds: assigned_user, vendor (FK contact), status (Draft/Issued/In Progress/Completed/Cancelled).
Invoice adds: due_date, balance, amount_paid, payments[].
Conversions: Estimate↔Work Order↔Invoice, all copy line items.

### Pipelines / Workflows / Statuses
Workflow (type: Contact|Job|WorkOrder|Task) → Statuses (ordered) → mapped to 6 fixed **Stages**: Lead, Estimating, Sold, In Production, Accounts Receivable, Completed (+ Lost). Track `days_in_status` per record.

### Users
first_name, last_name, display_name, email, phone, role (Admin/Manager/Sales Rep/Sub-Contractor/Crew/custom), permissions, location (FK company location), is_active, avatar_url. No first-class Team entity — grouping via location + owners[].

## Insurance/Claim fields (Job-level)

Industry-standard field set roofing contractors configure on the Job record. We implement as native columns:

insurance_company, policy_number, claim_number, date_of_loss, type_of_loss (Hail/Wind/Hurricane/Fire/Tree/Other), date_reported, date_inspected, adjuster_name, adjuster_phone, adjuster_email, adjuster_company, deductible, deductible_paid, acv_amount, rcv_amount, recoverable_depreciation, depreciation_deadline, non_recoverable_depreciation, overhead_and_profit, supplement_amount, supplement_status (Not Submitted/Submitted/Approved/Denied), supplement_notes, mortgage_company, mortgage_loan_number, scope_approved, scope_notes, first_check_received, first_check_amount, first_check_date, final_check_received, final_check_amount, final_check_date, coc_signed.

## Relationships

- Company → Location → User
- Company → Workflow → Status (→ Stage enum)
- Contact 1:many Job (via Job.primary)
- Contact many:many Contact (related)
- Job 1:many Task, Activity, File, Estimate, WorkOrder, Invoice, CreditMemo, Budget
- Task/Activity/File primary FK is polymorphic (contact|job)
- Estimate/WorkOrder/Invoice 1:many LineItem
- Invoice 1:many Payment
- Job many:1 Workflow → many:1 Status
- Job many:many User via owners[]; 1:1 sales_rep; many:many subcontractors[]

## UI layout

### Contact/Job detail page
- Top header: display name, primary phone/email, quick-actions [+ Financial doc, + Note, + Email, + Task, + SMS], 3-dot admin menu.
- Left vertical tab rail: Dashboard · Activity · Fields · Tasks · Photos · Documents · Estimates · Material & Work Orders · Payments & Invoices · Profit Tracker · Forms · Custom Documents.
- Right sidebar (persistent): cover photo, address (with Directions/Copy/Edit), status + stage chip, type, source, sales rep, assigned, date_start/end, tags, related contacts, integration badges. Jobs also show job-site address (independent) + insurance custom-field block.
- Main pane: content of selected tab. Activity feed is newest-first, filterable by type/user/date.

### Calendar
Day/Week/Month/Agenda tabs, left-sidebar team-member checkbox list, drag-to-reschedule, click opens task drawer. Two-way Google/Outlook sync.

### Board (Kanban)
Columns = Statuses within selected Workflow. Cards show number, name, contact, value, days-in-status, cover photo. Drag across columns fires status-change automations.

### Dashboard
Configurable widget grid: My Tasks, Today's Calendar, My Jobs by Status, Pipeline Value by Stage, Recent Activity, Sales Leaderboard, AR Aging, Hot Leads.

## Canonical Job lifecycle
Lead → Estimating → Sold → In Production → Accounts Receivable → Completed; Lost is a terminal branch from any stage.

## Gotchas for our migration

1. `jnid` PK + `number` display ID are separate concerns.
2. `primary`/`related` on Task/Activity/File is polymorphic (contact|job). Either store `primary_type`+`primary_id` or split tables.
3. Files unified; split by mime for UI.
4. Insurance is 100% custom-field in JN — no "claims" table. We model it as native Job columns.
5. Workflow → Status → Stage is two-level; board/automations key off Stage, UX off Status.
6. Addresses on Contact and Job are independent — don't force inheritance.
7. Users × Jobs is 3 distinct relations: owners[] (multi), sales_rep (single), subcontractors[] (multi).
